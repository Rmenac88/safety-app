from fastapi import APIRouter, Depends, HTTPException, Query, Header, Request
from sqlalchemy.orm import Session
from typing import List, Optional
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import FavoritePlace
from schemas import FavoriteCreate, FavoriteResponse
from security.sanitizer import sanitize_input_text
from moderation import moderate_text
from security.anti_abuse import get_client_ip, hash_client_ip, generate_client_fingerprint, check_read_scraping_quota, check_report_creation_quota
from security.audit import log_security_event

router = APIRouter(prefix="/favorites", tags=["favorites"])


def _owner_session(x_device_id: Optional[str], legacy_session_id: Optional[str]) -> str:
    """
    The device id is the only key protecting a user's favorites (home / work addresses):
    it is read from the X-Device-Id header. The ?session_id= query parameter is still
    accepted for old clients but must not be used: URLs end up in access logs.
    """
    session = sanitize_input_text(x_device_id or legacy_session_id or "", 120)
    if len(session) < 5:
        raise HTTPException(status_code=401, detail="Identifiant d'appareil manquant.")
    return session


@router.get("", response_model=List[FavoriteResponse])
def list_favorites(
    request: Request,
    session_id: Optional[str] = Query(None, max_length=120, deprecated=True),
    x_device_id: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    client_ip = get_client_ip(request)
    fp = generate_client_fingerprint(client_ip, x_device_id or "")
    allowed, retry_after = check_read_scraping_quota(fp, db, hash_client_ip(client_ip))
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Quota de requêtes dépassé. Réessayez dans {retry_after}s.")

    clean_session = _owner_session(x_device_id, session_id)
    return db.query(FavoritePlace).filter(FavoritePlace.session_id == clean_session).all()


@router.post("", response_model=FavoriteResponse, status_code=201)
def create_favorite(
    payload: FavoriteCreate,
    request: Request,
    x_device_id: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    client_ip = get_client_ip(request)
    fp = generate_client_fingerprint(client_ip, x_device_id or "")
    allowed, retry_after = check_report_creation_quota(fp, db, hash_client_ip(client_ip))
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Trop de favoris créés. Réessayez dans {retry_after}s.")

    # Sanitize user inputs
    clean_name = sanitize_input_text(payload.name, 100)
    clean_addr = sanitize_input_text(payload.address, 250) if payload.address else None
    clean_session = sanitize_input_text(payload.session_id, 120)

    # Multi-layered content moderation
    mod_result = moderate_text(f"{clean_name} {clean_addr or ''}", client_fingerprint=fp, db=db)
    if not mod_result.allowed:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "CONTENT_BLOCKED",
                "title": "Nom de favori non conforme",
                "message": "Le nom ou l'adresse du lieu contient un contenu ne respectant pas les règles de Safety.",
            }
        )

    # Max 50 favorites per session to prevent DB saturation
    count = db.query(FavoritePlace).filter(FavoritePlace.session_id == clean_session).count()
    if count >= 50:
        raise HTTPException(status_code=400, detail="Limite de 50 lieux favoris atteinte.")

    fav = FavoritePlace(
        session_id=clean_session,
        name=clean_name,
        place_type=payload.place_type,
        address=clean_addr,
        latitude=payload.latitude,
        longitude=payload.longitude,
        notify_radius_m=payload.notify_radius_m,
    )
    db.add(fav)
    db.commit()
    db.refresh(fav)
    return fav


@router.delete("/{favorite_id}", status_code=204)
def delete_favorite(
    favorite_id: str,
    session_id: Optional[str] = Query(None, max_length=120, deprecated=True),
    x_device_id: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    clean_session = _owner_session(x_device_id, session_id)
    fav = db.query(FavoritePlace).filter(
        FavoritePlace.id == favorite_id,
        FavoritePlace.session_id == clean_session
    ).first()
    if not fav:
        raise HTTPException(status_code=404, detail="Favori non trouvé")
    db.delete(fav)
    db.commit()
