from fastapi import APIRouter, Depends, HTTPException, Query, Header, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import sys, os
import math

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import Incident, AuditLog, Notification, IncidentStatus, SeverityLevel, IncidentCategory, IncidentVote
from schemas import IncidentCreate, IncidentResponse, IncidentCreateResponse, IncidentListResponse
from security.auth_shield import generate_owner_token, verify_owner_token, verify_admin_key
from security.geo_privacy import obfuscate_public_coordinates, sanitize_public_address
from security.sanitizer import sanitize_input_text, evaluate_content_moderation
from moderation import moderate_text
from security.anti_abuse import (
    generate_client_fingerprint,
    check_report_creation_quota,
    check_vote_quota,
    check_read_scraping_quota,
    calculate_trust_score,
)
from security.audit import log_security_event

router = APIRouter(prefix="/incidents", tags=["incidents"])

DURATION_TO_HOURS = {
    "30 min": 0.5,
    "2 h": 2,
    "12 h": 12,
    "24 h": 24,
    "permanent": 720,  # 30 days
}


def _expire_old_incidents(db: Session):
    """Mark expired incidents automatically (safe naive UTC comparison for SQLite/Postgres)."""
    try:
        now_naive = datetime.utcnow()
        expired = db.query(Incident).filter(
            Incident.status == IncidentStatus.active,
            Incident.expires_at.isnot(None),
            Incident.expires_at < now_naive,
        ).all()
        for inc in expired:
            inc.status = IncidentStatus.expired
        if expired:
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"Expiration notice: {e}")


def _to_public_incident_response(inc: Incident) -> IncidentResponse:
    """
    Transforms internal Incident model into a privacy-preserving public projection.
    Applies spatial grid discretization, deterministic jitter, and address anonymization.
    """
    pub_lat, pub_lon = obfuscate_public_coordinates(inc.latitude, inc.longitude, inc.id)
    pub_addr = sanitize_public_address(inc.address, inc.neighborhood, inc.city)
    trust_score, _ = calculate_trust_score(
        past_valid_reports=inc.confirmations_count,
        disputed_reports=inc.disputes_count,
    )

    return IncidentResponse(
        id=str(inc.id),
        category=inc.category,
        title=inc.title,
        description=inc.description,
        latitude=pub_lat,
        longitude=pub_lon,
        address=pub_addr,
        neighborhood=inc.neighborhood,
        city=inc.city,
        severity=inc.severity,
        status=inc.status,
        confirmations_count=inc.confirmations_count,
        disputes_count=inc.disputes_count,
        is_anonymous=inc.is_anonymous,
        author_pseudonym=inc.author_pseudonym,
        time_slot_relevance=inc.time_slot_relevance,
        estimated_duration=inc.estimated_duration,
        geometry_type=inc.geometry_type,
        geojson_geometry=inc.geojson_geometry,
        created_at=inc.created_at,
        expires_at=inc.expires_at,
        trust_score=trust_score,
        moderation_status="approved",
    )


@router.get("/heatmap")
def get_heatmap_geojson(
    request: Request,
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None),
):
    """
    Returns GeoJSON FeatureCollection optimized for Mapbox GPU heatmap rendering.
    Uses privacy-preserving fuzzed coordinates to protect reporter identities.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    fp = generate_client_fingerprint(client_ip, x_device_id or "")
    allowed, retry_after = check_read_scraping_quota(fp)
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Quota de lecture dépassé. Réessayez dans {retry_after}s.")

    _expire_old_incidents(db)
    active_incidents = db.query(Incident).filter(Incident.status == IncidentStatus.active).all()

    features = []
    severity_multipliers = {
        SeverityLevel.critical: 4.5,
        SeverityLevel.high: 3.0,
        SeverityLevel.medium: 1.8,
        SeverityLevel.low: 1.0,
    }

    for inc in active_incidents:
        pub_lat, pub_lon = obfuscate_public_coordinates(inc.latitude, inc.longitude, inc.id)
        sev_val = inc.severity if isinstance(inc.severity, SeverityLevel) else SeverityLevel(inc.severity)
        base_weight = severity_multipliers.get(sev_val, 1.5)
        conf_bonus = min((inc.confirmations_count or 1) * 0.2, 2.0)
        final_weight = round(base_weight + conf_bonus, 2)

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [pub_lon, pub_lat]
            },
            "properties": {
                "id": str(inc.id),
                "title": inc.title,
                "category": str(inc.category.value if hasattr(inc.category, 'value') else inc.category),
                "severity": str(sev_val.value if hasattr(sev_val, 'value') else sev_val),
                "weight": final_weight,
                "confirmations": inc.confirmations_count,
            }
        })

    return {
        "type": "FeatureCollection",
        "total": len(features),
        "features": features,
    }


@router.get("", response_model=IncidentListResponse)
def list_incidents(
    request: Request,
    lat: Optional[float] = Query(None, ge=-90, le=90, description="Center latitude for radius filter"),
    lon: Optional[float] = Query(None, ge=-180, le=180, description="Center longitude for radius filter"),
    radius_m: float = Query(50000, ge=100, le=500000, description="Radius in meters"),
    min_lon: Optional[float] = Query(None, ge=-180, le=180, description="Bounding box min longitude"),
    min_lat: Optional[float] = Query(None, ge=-90, le=90, description="Bounding box min latitude"),
    max_lon: Optional[float] = Query(None, ge=-180, le=180, description="Bounding box max longitude"),
    max_lat: Optional[float] = Query(None, ge=-90, le=90, description="Bounding box max latitude"),
    bbox: Optional[str] = Query(None, description="Bounding box formatted as min_lon,min_lat,max_lon,max_lat"),
    category: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: str = Query("active"),
    limit: int = Query(200, ge=1, le=500),
    x_device_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    List incidents with privacy projection. Supports bounding box, center+radius, and filtering.
    Anti-scraping rate limiting enforced.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    fp = generate_client_fingerprint(client_ip, x_device_id or "")
    allowed, retry_after = check_read_scraping_quota(fp)
    if not allowed:
        log_security_event("SCRAPING_THROTTLED", client_fingerprint=fp, status="BLOCKED")
        raise HTTPException(
            status_code=429,
            detail=f"Limite de requêtes atteinte pour prévenir le scraping. Réessayez dans {retry_after} secondes.",
            headers={"Retry-After": str(retry_after)}
        )

    _expire_old_incidents(db)

    query = db.query(Incident)

    if status == "active":
        query = query.filter(Incident.status == IncidentStatus.active)
    elif status == "resolved":
        query = query.filter(Incident.status == IncidentStatus.resolved)

    if bbox:
        try:
            parts = [float(p.strip()) for p in bbox.split(",")]
            if len(parts) == 4:
                min_lon, min_lat, max_lon, max_lat = parts[0], parts[1], parts[2], parts[3]
        except Exception:
            pass

    if min_lon is not None and min_lat is not None and max_lon is not None and max_lat is not None:
        if min_lon > max_lon:
            query = query.filter(
                and_(
                    Incident.latitude.between(min_lat, max_lat),
                    or_(
                        Incident.longitude >= min_lon,
                        Incident.longitude <= max_lon,
                    ),
                )
            )
        else:
            query = query.filter(
                and_(
                    Incident.latitude.between(min_lat, max_lat),
                    Incident.longitude.between(min_lon, max_lon),
                )
            )
    elif lat is not None and lon is not None:
        lat_delta = radius_m / 111_000
        lon_delta = radius_m / (111_000 * max(abs(math.cos(math.radians(lat))), 0.01))
        query = query.filter(
            and_(
                Incident.latitude.between(lat - lat_delta, lat + lat_delta),
                Incident.longitude.between(lon - lon_delta, lon + lon_delta),
            )
        )

    if category:
        query = query.filter(Incident.category == category)

    if severity:
        query = query.filter(Incident.severity == severity)

    results = query.order_by(Incident.created_at.desc()).limit(limit).all()
    public_incidents = [_to_public_incident_response(i) for i in results]

    return IncidentListResponse(total=len(public_incidents), incidents=public_incidents)


@router.post("", response_model=IncidentCreateResponse, status_code=201)
def create_incident(
    payload: IncidentCreate,
    request: Request,
    x_device_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Create a new incident with automated Trust & Safety pipeline:
    1. Multi-signal sliding window rate limiting.
    2. Input sanitization (XSS, control characters).
    3. Automated content moderation pipeline (ALLOW, REVIEW, REJECT).
    4. Private vs Public coordinate separation.
    5. Returns cryptographic owner_token for IDOR-protected author management.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    fp = generate_client_fingerprint(client_ip, x_device_id or "")

    # 1. Rate Limiting Check
    allowed, retry_after = check_report_creation_quota(fp)
    if not allowed:
        log_security_event("CREATION_RATE_LIMIT_EXCEEDED", client_fingerprint=fp, status="BLOCKED")
        raise HTTPException(
            status_code=429,
            detail=f"Limite de publication atteinte (5 par 10 min). Veuillez patienter {retry_after} secondes.",
            headers={"Retry-After": str(retry_after)}
        )

    # 2. Input Sanitization
    clean_title = sanitize_input_text(payload.title, max_length=160)
    clean_desc = sanitize_input_text(payload.description, max_length=600) if payload.description else None

    if len(clean_title) < 2:
        raise HTTPException(status_code=422, detail="Le titre du signalement est trop court ou invalide.")

    # 3. Multi-Layered Automated Content Moderation
    full_text_to_moderate = f"{clean_title} {clean_desc or ''}".strip()
    cat_str = payload.category.value if hasattr(payload.category, 'value') else str(payload.category)

    # Special rule: Category "other" ("Autre situation") requires a description of at least 5 chars
    if cat_str == "other":
        if not clean_desc or len(clean_desc.strip()) < 5:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "CONTENT_BLOCKED",
                    "title": "Description obligatoire",
                    "message": "Pour la catégorie « Autre situation », veuillez obligatoirement décrire la situation (minimum 5 caractères).",
                }
            )

    mod_result = moderate_text(
        text=full_text_to_moderate,
        incident_category=cat_str,
        title=clean_title,
        client_fingerprint=fp,
        db=db,
    )

    if not mod_result.allowed:
        log_security_event(
            "CONTENT_MODERATION_BLOCKED",
            client_fingerprint=fp,
            status="BLOCKED",
            metadata={
                "action": mod_result.action.value,
                "category": mod_result.primary_category.value if mod_result.primary_category else "ABUSE",
                "risk_score": mod_result.risk_score,
            }
        )
        raise HTTPException(
            status_code=422,
            detail={
                "code": "CONTENT_BLOCKED",
                "title": mod_result.user_title or "Contenu bloqué",
                "message": mod_result.user_message or (
                    "Cette description contient un contenu qui ne respecte pas les règles de Safety. "
                    "Modifiez votre description afin de pouvoir publier le signalement."
                ),
            }
        )

    # 4. Enforce Geographic Bounds
    safe_lat = max(-90.0, min(90.0, float(payload.latitude)))
    safe_lon = max(-180.0, min(180.0, float(payload.longitude)))

    hours = DURATION_TO_HOURS.get(payload.estimated_duration, 24.0)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=max(hours, 24.0))

    cat_val = IncidentCategory(payload.category.value if hasattr(payload.category, 'value') else payload.category)
    sev_val = SeverityLevel(payload.severity.value if hasattr(payload.severity, 'value') else payload.severity)

    incident = Incident(
        category=cat_val,
        title=clean_title,
        description=clean_desc,
        latitude=safe_lat,
        longitude=safe_lon,
        address=payload.address,
        neighborhood=payload.neighborhood,
        city=payload.city,
        severity=sev_val,
        is_anonymous=payload.is_anonymous,
        author_pseudonym="Citoyen anonyme" if payload.is_anonymous else (sanitize_input_text(payload.author_pseudonym, 40) or "Citoyen anonyme"),
        time_slot_relevance=payload.time_slot_relevance,
        estimated_duration=payload.estimated_duration,
        geometry_type=payload.geometry_type or "Point",
        geojson_geometry=payload.geojson_geometry,
        expires_at=expires_at,
        confirmations_count=1,
        disputes_count=0,
        status=IncidentStatus.active,
    )
    db.add(incident)

    # Notification generation
    existing_notif = db.query(Notification).filter(Notification.incident_id == incident.id).first()
    if not existing_notif:
        notif = Notification(
            incident_id=incident.id,
            city=payload.city or "Secteur",
            neighborhood=payload.neighborhood,
            latitude=safe_lat,
            longitude=safe_lon,
            title=f"Alerte : {clean_title}",
            message=f"Attention, {payload.address or 'dans votre secteur'} : {clean_title}.",
            severity=str(sev_val.value if hasattr(sev_val, 'value') else sev_val),
            category=str(cat_val.value if hasattr(cat_val, 'value') else cat_val),
        )
        db.add(notif)

    db.add(AuditLog(incident_id=incident.id, action="created"))
    db.commit()
    db.refresh(incident)

    # 5. Issue cryptographic owner token for author
    owner_token = generate_owner_token(str(incident.id))
    log_security_event("INCIDENT_CREATED", target_id=str(incident.id), client_fingerprint=fp)

    pub_resp = _to_public_incident_response(incident)
    return IncidentCreateResponse(
        **pub_resp.model_dump(mode="json"),
        owner_token=owner_token,
    )


@router.get("/{incident_id}", response_model=IncidentResponse)
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    """Fetch single incident with privacy projection."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident non trouvé")
    return _to_public_incident_response(inc)


@router.post("/{incident_id}/vote", response_model=IncidentResponse)
def vote_incident(
    incident_id: str,
    payload: dict,
    request: Request,
    x_device_id: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Atomic multi-user vote handler with rate limiting and per-session uniqueness:
    payload: {"vote_type": "confirm"|"dispute"|"none", "session_id": str}
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    fp = generate_client_fingerprint(client_ip, x_device_id or "")

    allowed, retry_after = check_vote_quota(fp)
    if not allowed:
        log_security_event("VOTE_RATE_LIMIT_EXCEEDED", target_id=incident_id, client_fingerprint=fp, status="BLOCKED")
        raise HTTPException(
            status_code=429,
            detail=f"Limite de votes atteinte (25 par 10 min). Veuillez patienter {retry_after} secondes.",
            headers={"Retry-After": str(retry_after)}
        )

    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident non trouvé")

    vote_type = payload.get("vote_type", "none")
    session_id = str(payload.get("session_id", "")).strip() or fp

    existing_vote = db.query(IncidentVote).filter(
        IncidentVote.incident_id == incident_id,
        IncidentVote.session_id == session_id
    ).first()

    if existing_vote:
        prev_vote = existing_vote.vote_type
        if vote_type == "none" or vote_type == prev_vote:
            if prev_vote == "confirm":
                inc.confirmations_count = max(0, inc.confirmations_count - 1)
            elif prev_vote == "dispute":
                inc.disputes_count = max(0, inc.disputes_count - 1)
            db.delete(existing_vote)
        else:
            if prev_vote == "confirm":
                inc.confirmations_count = max(0, inc.confirmations_count - 1)
            elif prev_vote == "dispute":
                inc.disputes_count = max(0, inc.disputes_count - 1)

            if vote_type == "confirm":
                inc.confirmations_count += 1
            elif vote_type == "dispute":
                inc.disputes_count += 1
            existing_vote.vote_type = vote_type
    else:
        if vote_type in ("confirm", "dispute"):
            new_v = IncidentVote(
                incident_id=incident_id,
                session_id=session_id,
                vote_type=vote_type
            )
            db.add(new_v)
            if vote_type == "confirm":
                inc.confirmations_count += 1
            elif vote_type == "dispute":
                inc.disputes_count += 1

    # ── Community Moderation: Auto-Resolve at 10 disputes ───────────────
    if inc.disputes_count >= 10:
        inc.status = IncidentStatus.resolved
        db.add(AuditLog(incident_id=incident_id, action="false_report_auto_resolved"))
        log_security_event("INCIDENT_AUTO_RESOLVED_10_DISPUTES", target_id=incident_id, status="WARNING")
        try:
            db.query(Notification).filter(Notification.incident_id == incident_id).delete(synchronize_session=False)
        except Exception:
            pass
    else:
        db.add(AuditLog(incident_id=incident_id, action=f"voted_{vote_type}"))

    db.commit()
    db.refresh(inc)
    return _to_public_incident_response(inc)


@router.patch("/{incident_id}/confirm", response_model=IncidentResponse)
def confirm_incident(incident_id: str, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident non trouvé")
    inc.confirmations_count += 1
    db.add(AuditLog(incident_id=incident_id, action="confirmed"))
    db.commit()
    db.refresh(inc)
    return _to_public_incident_response(inc)


@router.patch("/{incident_id}/dispute", response_model=IncidentResponse)
def dispute_incident(incident_id: str, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident non trouvé")
    inc.disputes_count += 1
    db.add(AuditLog(incident_id=incident_id, action="disputed"))
    if inc.disputes_count >= 10:
        inc.status = IncidentStatus.resolved
        db.add(AuditLog(incident_id=incident_id, action="false_report_auto_resolved"))
        try:
            db.query(Notification).filter(Notification.incident_id == incident_id).delete(synchronize_session=False)
        except Exception:
            pass
    db.commit()
    db.refresh(inc)
    return _to_public_incident_response(inc)


@router.patch("/{incident_id}/resolve", response_model=IncidentResponse)
def resolve_incident(
    incident_id: str,
    x_incident_owner_token: Optional[str] = Header(None),
    x_admin_key: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Resolve incident (archives / removes from map).
    Protected by Owner Token or Admin Key against IDOR attacks.
    """
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident non trouvé")

    # Cryptographic Authorization Check
    is_owner = verify_owner_token(incident_id, x_incident_owner_token)
    is_admin = verify_admin_key(x_admin_key)
    if not (is_owner or is_admin):
        log_security_event("UNAUTHORIZED_RESOLVE_ATTEMPT", target_id=incident_id, status="BLOCKED")
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : Seul l'auteur du signalement ou un administrateur peut marquer cet incident comme résolu."
        )

    inc.status = IncidentStatus.resolved
    db.add(AuditLog(incident_id=incident_id, action="resolved"))
    try:
        db.query(Notification).filter(Notification.incident_id == incident_id).delete(synchronize_session=False)
    except Exception:
        pass
    db.commit()
    db.refresh(inc)
    log_security_event("INCIDENT_RESOLVED", target_id=incident_id, status="SUCCESS")
    return _to_public_incident_response(inc)


@router.delete("/{incident_id}", status_code=204)
def delete_incident(
    incident_id: str,
    x_incident_owner_token: Optional[str] = Header(None),
    x_admin_key: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Deletes an incident permanently from database.
    STRICTLY PROTECTED against IDOR/BOLA:
    Requires valid HMAC owner token from author OR valid X-Admin-Key.
    """
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident non trouvé")

    is_owner = verify_owner_token(incident_id, x_incident_owner_token)
    is_admin = verify_admin_key(x_admin_key)

    if not (is_owner or is_admin):
        log_security_event("UNAUTHORIZED_DELETE_ATTEMPT", target_id=incident_id, status="BLOCKED")
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : Vous devez être l'auteur du signalement pour le supprimer."
        )

    try:
        db.query(Notification).filter(Notification.incident_id == incident_id).delete(synchronize_session=False)
        db.query(AuditLog).filter(AuditLog.incident_id == incident_id).delete(synchronize_session=False)
        db.query(IncidentVote).filter(IncidentVote.incident_id == incident_id).delete(synchronize_session=False)
    except Exception:
        pass

    db.delete(inc)
    db.commit()
    log_security_event("INCIDENT_DELETED", target_id=incident_id, status="SUCCESS")


@router.delete("/purge/all")
def purge_all_data(
    x_admin_key: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Administrative wipe of incidents, notifications, and logs.
    STRICTLY LOCKED behind X-Admin-Key against malicious zero-auth destruction.
    """
    if not verify_admin_key(x_admin_key):
        log_security_event("UNAUTHORIZED_PURGE_ATTEMPT", status="CRITICAL")
        raise HTTPException(
            status_code=401,
            detail="Accès non autorisé : Clé secrète d'administration requise pour la purge."
        )

    try:
        db.query(Notification).delete()
        db.query(AuditLog).delete()
        db.query(IncidentVote).delete()
        db.query(Incident).delete()
        db.commit()
        log_security_event("ALL_DATA_PURGED_BY_ADMIN", status="SUCCESS")
    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}
    return {"status": "all_purged"}


@router.post("/classify")
def classify_incident(payload: dict):
    """
    Intelligent NLP endpoint that automatically extracts category, severity,
    geometry_type, title, and duration from free-text incident descriptions.
    """
    from nlp_classifier import classify_text_incident
    text = payload.get("text", "")
    return classify_text_incident(text)
