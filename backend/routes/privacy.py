"""
Data subject rights (RGPD art. 15, 17, 20) for an account-less app.

The only identifier is the anonymous device id (X-Device-Id, generated on the device).
What the server links to it: favorites (stored with the device id) and votes (stored
under a hash of it). Reports are NOT linked to the device server-side: the app deletes
them with the owner tokens it keeps locally.

  GET    /api/v1/me/data   export everything linked to this device (JSON)
  DELETE /api/v1/me/data   erase it (favorites + votes, counters corrected)
"""
import sys, os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import case
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import FavoritePlace, Incident, IncidentVote
from security.anti_abuse import (
    check_vote_quota, generate_client_fingerprint, get_client_ip, hash_client_ip, hash_device_id,
)
from security.audit import log_security_event
from security.sanitizer import sanitize_input_text

router = APIRouter(prefix="/me", tags=["privacy"])


def _device(x_device_id: Optional[str]) -> str:
    device = sanitize_input_text(x_device_id or "", 120)
    if len(device) < 5:
        raise HTTPException(status_code=401, detail="Identifiant d'appareil manquant.")
    return device


def _limit(request: Request, device: str, db: Session):
    client_ip = get_client_ip(request)
    allowed, retry_after = check_vote_quota(generate_client_fingerprint(client_ip, device), db)
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Réessayez dans {retry_after}s.", headers={"Retry-After": str(retry_after)})
    return hash_client_ip(client_ip)


def _votes_query(db: Session, device: str):
    return db.query(IncidentVote).filter(IncidentVote.session_id.like(f"{hash_device_id(device)}:%"))


def _iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return (value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value).isoformat()


@router.get("/data")
def export_my_data(request: Request, x_device_id: Optional[str] = Header(None), db: Session = Depends(get_db)):
    device = _device(x_device_id)
    _limit(request, device, db)
    favorites = db.query(FavoritePlace).filter(FavoritePlace.session_id == device).all()
    votes = _votes_query(db, device).all()
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "device_id": device,
        "favorites": [
            {
                "id": f.id, "name": f.name, "place_type": f.place_type, "address": f.address,
                "latitude": f.latitude, "longitude": f.longitude,
                "notify_radius_m": f.notify_radius_m, "created_at": _iso(f.created_at),
            }
            for f in favorites
        ],
        "votes": [
            {"incident_id": v.incident_id, "vote_type": v.vote_type, "created_at": _iso(v.created_at)}
            for v in votes
        ],
        "reports": (
            "Les signalements sont anonymes et ne sont pas rattachés à cet appareil sur le serveur "
            "(seule leur position publique, approximative, est conservée). L'application garde sur "
            "l'appareil la liste de vos signalements et les jetons permettant de les supprimer."
        ),
    }


@router.delete("/data")
def erase_my_data(request: Request, x_device_id: Optional[str] = Header(None), db: Session = Depends(get_db)):
    device = _device(x_device_id)
    _limit(request, device, db)

    votes = _votes_query(db, device).all()
    for vote in votes:
        field = "confirmations_count" if vote.vote_type == "confirm" else "disputes_count"
        column = getattr(Incident, field)
        db.query(Incident).filter(Incident.id == vote.incident_id).update(
            {field: case((column > 0, column - 1), else_=0)}, synchronize_session=False
        )
        db.delete(vote)
    favorites_deleted = db.query(FavoritePlace).filter(FavoritePlace.session_id == device).delete(synchronize_session=False)
    db.commit()
    log_security_event("DEVICE_DATA_ERASED", metadata={"favorites": favorites_deleted, "votes": len(votes)})
    return {"status": "erased", "favorites_deleted": favorites_deleted, "votes_deleted": len(votes)}
