from fastapi import APIRouter, Depends, HTTPException, Query, Header, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, case
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import sys, os
import math
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import Incident, AuditLog, Notification, IncidentStatus, SeverityLevel, IncidentCategory, IncidentVote, ModerationReview
from schemas import IncidentCreate, IncidentResponse, IncidentCreateResponse, IncidentListResponse
from security.auth_shield import generate_owner_token, verify_owner_token, verify_admin_key
from security.geo_privacy import obfuscate_public_coordinates, sanitize_public_address
from security.sanitizer import sanitize_input_text
from moderation import moderate_text
from security.anti_abuse import (
    get_client_ip,
    hash_client_ip,
    hash_device_id,
    check_vote_ip_quota,
    generate_client_fingerprint,
    check_report_creation_quota,
    check_vote_quota,
    check_read_scraping_quota,
    calculate_trust_score,
)
from security.audit import log_security_event
from retention import purge_expired_data

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
        now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
        expired = db.query(Incident).filter(
            Incident.status == IncidentStatus.active,
            Incident.expires_at.isnot(None),
            Incident.expires_at < now_naive,
        ).all()
        for inc in expired:
            inc.status = IncidentStatus.expired
        if expired:
            db.commit()
        # Storage limitation: closed reports and stale records are deleted after their
        # retention period (throttled to once every 10 min per instance)
        purge_expired_data(db)
    except Exception as e:
        db.rollback()
        print(f"Expiration notice: {type(e).__name__}: {str(getattr(e, 'orig', '') or '').splitlines()[:1]}")


def _public_geojson(raw: Optional[str], pub_lat: float, pub_lon: float) -> Optional[str]:
    """
    A Point geometry IS the reporter's position: it is always replaced by the public
    (obfuscated) position. Streets and zones (LineString / Polygon) are public areas.
    Without this, the exact GPS fix was returned next to the "obfuscated" lat/lon.
    """
    if not raw:
        return raw
    try:
        geom = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if isinstance(geom, dict) and geom.get("type") == "Point":
        return json.dumps({"type": "Point", "coordinates": [pub_lon, pub_lat]})
    return raw


def _to_public_incident_response(inc: Incident, pending_review: bool = False) -> IncidentResponse:
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
        geojson_geometry=_public_geojson(inc.geojson_geometry, pub_lat, pub_lon),
        created_at=inc.created_at,
        expires_at=inc.expires_at,
        trust_score=trust_score,
        moderation_status="pending_review" if pending_review else "approved",
    )


def _pending_review_ids(db: Session, incident_ids: List[str]) -> set:
    """Incidents currently waiting in the moderation queue (one query for a whole page)."""
    # str(): in older production databases incidents.id is a native UUID column while
    # the newer tables store the id as text (Postgres has no varchar = uuid operator)
    incident_ids = [str(i) for i in incident_ids]
    if not incident_ids:
        return set()
    rows = db.query(ModerationReview.incident_id).filter(
        ModerationReview.incident_id.in_(incident_ids),
        ModerationReview.status == "pending",
    ).all()
    return {r[0] for r in rows}


def _raise_content_blocked(mod_result, fp: str):
    """Logs the moderation refusal and returns the uniform CONTENT_BLOCKED error to the client."""
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
    client_ip = get_client_ip(request)
    fp = generate_client_fingerprint(client_ip, x_device_id or "")
    allowed, retry_after = check_read_scraping_quota(fp, db, hash_client_ip(client_ip))
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
    client_ip = get_client_ip(request)
    fp = generate_client_fingerprint(client_ip, x_device_id or "")
    allowed, retry_after = check_read_scraping_quota(fp, db, hash_client_ip(client_ip))
    if not allowed:
        log_security_event("SCRAPING_THROTTLED", client_fingerprint=fp, status="BLOCKED")
        raise HTTPException(
            status_code=429,
            detail=f"Limite de requêtes atteinte pour prévenir le scraping. Réessayez dans {retry_after} secondes.",
            headers={"Retry-After": str(retry_after)}
        )

    _expire_old_incidents(db)

    query = db.query(Incident)

    # Only public statuses can be listed (never blocked / pending_moderation / expired)
    if status == "resolved":
        query = query.filter(Incident.status == IncidentStatus.resolved)
    else:
        query = query.filter(Incident.status == IncidentStatus.active)

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

    # Unknown enum values used to raise a 500 (SQLAlchemy LookupError): ignore them instead
    if category and category in IncidentCategory.__members__:
        query = query.filter(Incident.category == IncidentCategory(category))

    if severity and severity in SeverityLevel.__members__:
        query = query.filter(Incident.severity == SeverityLevel(severity))

    results = query.order_by(Incident.created_at.desc()).limit(limit).all()
    pending = _pending_review_ids(db, [i.id for i in results])
    public_incidents = [_to_public_incident_response(i, str(i.id) in pending) for i in results]

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
    client_ip = get_client_ip(request)
    fp = generate_client_fingerprint(client_ip, x_device_id or "")

    # 1. Rate Limiting Check
    allowed, retry_after = check_report_creation_quota(fp, db, hash_client_ip(client_ip))
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
        _raise_content_blocked(mod_result, fp)

    # 3b. Public metadata moderation: address / neighborhood / city / pseudonym are
    # displayed to everyone (map, notifications) and used to bypass the text moderation.
    # Only clear violations (slurs, threats, spam: score >= 0.80) block here, so that
    # real street names are never rejected by mild-word rules.
    clean_address = sanitize_input_text(payload.address, max_length=300) or None
    clean_neighborhood = sanitize_input_text(payload.neighborhood, max_length=200) or None
    clean_city = sanitize_input_text(payload.city, max_length=200) or None
    clean_pseudonym = (
        "Citoyen anonyme" if payload.is_anonymous
        else (sanitize_input_text(payload.author_pseudonym, 40) or "Citoyen anonyme")
    )
    public_meta = " | ".join(
        v for v in (clean_address, clean_neighborhood, clean_city, clean_pseudonym) if v
    )
    meta_result = moderate_text(text=public_meta, client_fingerprint=fp)
    if meta_result.risk_score >= 0.80:
        _raise_content_blocked(meta_result, fp)

    # 4. Enforce Geographic Bounds
    safe_lat = max(-90.0, min(90.0, float(payload.latitude)))
    safe_lon = max(-180.0, min(180.0, float(payload.longitude)))

    # The incident disappears from the map after the duration picked by the reporter
    # (it used to be floored at 24 h, so a "30 min" report stayed a full day).
    # Stored as naive UTC, like created_at and the comparison in _expire_old_incidents.
    hours = DURATION_TO_HOURS.get(payload.estimated_duration, 2.0)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=hours)

    cat_val = IncidentCategory(payload.category.value if hasattr(payload.category, 'value') else payload.category)
    sev_val = SeverityLevel(payload.severity.value if hasattr(payload.severity, 'value') else payload.severity)

    incident = Incident(
        category=cat_val,
        title=clean_title,
        description=clean_desc,
        latitude=safe_lat,
        longitude=safe_lon,
        address=clean_address,
        neighborhood=clean_neighborhood,
        city=clean_city,
        severity=sev_val,
        is_anonymous=payload.is_anonymous,
        author_pseudonym=clean_pseudonym,
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
    # Flush so the database assigns incident.id: before this, the notification and the
    # audit log were created with incident_id = NULL (alerts never linked to their incident).
    db.flush()

    # Privacy by design: the exact GPS fix and the house number are NEVER stored.
    # Only the public (grid-snapped + jittered, ~150 m) position is kept, so neither the
    # database, the bbox/radius filters nor the logs can reveal where the reporter stood.
    safe_lat, safe_lon = obfuscate_public_coordinates(safe_lat, safe_lon, incident.id)
    incident.latitude, incident.longitude = safe_lat, safe_lon
    incident.geojson_geometry = _public_geojson(incident.geojson_geometry, safe_lat, safe_lon)
    public_address = sanitize_public_address(clean_address, clean_neighborhood, clean_city)
    incident.address = public_address

    # Notification generation (public position and address only)
    db.add(Notification(
        incident_id=incident.id,
        city=clean_city or "Secteur",
        neighborhood=clean_neighborhood,
        latitude=safe_lat,
        longitude=safe_lon,
        title=f"Alerte : {clean_title}"[:200],
        message=f"Attention, {public_address or 'dans votre secteur'} : {clean_title}.",
        severity=sev_val.value,
        category=cat_val.value,
    ))

    db.add(AuditLog(incident_id=incident.id, action="created"))

    # Borderline content is published but queued for a human moderator: REVIEW verdicts
    # on the text, and any non-blocking hit on the public metadata (address, pseudonym...).
    review_verdicts = [r for r in (mod_result,) if r.action.value == "REVIEW"]
    if meta_result.risk_score >= 0.30:
        review_verdicts.append(meta_result)
    if review_verdicts:
        worst = max(review_verdicts, key=lambda r: r.risk_score)
        db.add(ModerationReview(
            incident_id=str(incident.id),
            risk_score=worst.risk_score,
            primary_category=worst.primary_category.value if worst.primary_category else "ABUSE",
            reasons=json.dumps([f for r in review_verdicts for f in r.internal_flags], ensure_ascii=False),
        ))

    db.commit()
    db.refresh(incident)

    # 5. Issue cryptographic owner token for author
    owner_token = generate_owner_token(str(incident.id))
    log_security_event("INCIDENT_CREATED", target_id=str(incident.id), client_fingerprint=fp)

    pub_resp = _to_public_incident_response(incident, pending_review=bool(review_verdicts))
    return IncidentCreateResponse(
        **pub_resp.model_dump(mode="json"),
        owner_token=owner_token,
    )


@router.get("/{incident_id}", response_model=IncidentResponse)
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    """Fetch single incident with privacy projection."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    # Content rejected by moderation is never served again
    if not inc or inc.status in (IncidentStatus.blocked, IncidentStatus.pending_moderation):
        raise HTTPException(status_code=404, detail="Incident non trouvé")
    return _to_public_incident_response(inc, incident_id in _pending_review_ids(db, [incident_id]))


def _bump_counter(inc: Incident, field: str, delta: int) -> None:
    """
    Atomic counter update executed by the database (UPDATE ... SET n = n + 1).
    The previous read-modify-write in Python lost votes under concurrent requests
    (20 simultaneous confirmations ended at +14).
    """
    column = getattr(Incident, field)
    if delta > 0:
        setattr(inc, field, column + delta)
    else:
        setattr(inc, field, case((column > 0, column - 1), else_=0))


# Community moderation: an incident is auto-resolved (hidden) when disputed by at least
# this many DISTINCT networks (IP hashes) and when disputes outnumber confirmations.
AUTO_RESOLVE_DISTINCT_DISPUTERS = 10


@router.post("/{incident_id}/vote", response_model=IncidentResponse)
def vote_incident(
    incident_id: str,
    payload: dict,
    request: Request,
    x_device_id: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Atomic multi-user vote handler with rate limiting and per-device uniqueness:
    payload: {"vote_type": "confirm"|"dispute"|"none", "session_id": str}

    The voter identity is derived server-side ("<device_hash>:<ip_hash>"): a client can no
    longer vote 10 times by sending 10 random session_id values, and the automatic removal
    requires disputes coming from distinct networks.
    """
    client_ip = get_client_ip(request)
    ip_hash = hash_client_ip(client_ip)
    fp = generate_client_fingerprint(client_ip, x_device_id or "")

    allowed, retry_after = check_vote_quota(fp, db)
    if allowed:
        allowed, retry_after = check_vote_ip_quota(ip_hash, db)
    if not allowed:
        log_security_event("VOTE_RATE_LIMIT_EXCEEDED", target_id=incident_id, client_fingerprint=fp, status="BLOCKED")
        raise HTTPException(
            status_code=429,
            detail=f"Limite de votes atteinte. Veuillez patienter {retry_after} secondes.",
            headers={"Retry-After": str(retry_after)}
        )

    vote_type = str(payload.get("vote_type", "none"))
    if vote_type not in ("confirm", "dispute", "none"):
        raise HTTPException(status_code=422, detail="vote_type doit valoir confirm, dispute ou none.")

    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident non trouvé")
    if inc.status != IncidentStatus.active:
        return _to_public_incident_response(inc)

    device = (x_device_id or str(payload.get("session_id", ""))).strip()[:200]
    device_hash = hash_device_id(device) if device else fp[:16]
    voter_key = f"{device_hash}:{ip_hash}"

    existing_vote = db.query(IncidentVote).filter(
        IncidentVote.incident_id == incident_id,
        IncidentVote.session_id.like(f"{device_hash}:%"),
    ).first()

    if existing_vote is None:
        # Votes cast before the server-side voter key existed were stored with the raw
        # session_id sent by the app (= X-Device-Id), or the fingerprint when it was missing.
        # Adopt them so a user cannot vote a second time on an old report.
        legacy_ids = [v for v in {device, str(payload.get("session_id", "")).strip(), fp} if v]
        existing_vote = db.query(IncidentVote).filter(
            IncidentVote.incident_id == incident_id,
            IncidentVote.session_id.in_(legacy_ids),
        ).first()
        if existing_vote is not None:
            existing_vote.session_id = voter_key

    if existing_vote:
        prev_vote = existing_vote.vote_type
        if prev_vote == "confirm":
            _bump_counter(inc, "confirmations_count", -1)
        elif prev_vote == "dispute":
            _bump_counter(inc, "disputes_count", -1)

        if vote_type == "none" or vote_type == prev_vote:
            db.delete(existing_vote)
        else:
            _bump_counter(inc, "confirmations_count" if vote_type == "confirm" else "disputes_count", +1)
            existing_vote.vote_type = vote_type
            existing_vote.session_id = voter_key
    elif vote_type in ("confirm", "dispute"):
        db.add(IncidentVote(incident_id=incident_id, session_id=voter_key, vote_type=vote_type))
        _bump_counter(inc, "confirmations_count" if vote_type == "confirm" else "disputes_count", +1)

    db.flush()
    db.refresh(inc)  # read back the counters computed by the database

    # ── Community Moderation: Auto-Resolve ─────────────────────────────
    distinct_disputers = 0
    if inc.disputes_count >= AUTO_RESOLVE_DISTINCT_DISPUTERS:
        dispute_keys = db.query(IncidentVote.session_id).filter(
            IncidentVote.incident_id == incident_id,
            IncidentVote.vote_type == "dispute",
        ).all()
        distinct_disputers = len({key.split(":")[-1] for (key,) in dispute_keys})

    if (
        distinct_disputers >= AUTO_RESOLVE_DISTINCT_DISPUTERS
        and inc.disputes_count > inc.confirmations_count
    ):
        inc.status = IncidentStatus.resolved
        db.add(AuditLog(incident_id=incident_id, action="false_report_auto_resolved"))
        log_security_event("INCIDENT_AUTO_RESOLVED_DISPUTES", target_id=incident_id, status="WARNING")
        db.query(Notification).filter(Notification.incident_id == incident_id).delete(synchronize_session=False)
    else:
        db.add(AuditLog(incident_id=incident_id, action=f"voted_{vote_type}"))

    db.commit()
    db.refresh(inc)
    return _to_public_incident_response(inc)


# NB: the former PATCH /{incident_id}/confirm and /dispute endpoints were removed:
# without rate limit nor uniqueness, 10 anonymous calls were enough to hide any report.
# Every vote goes through POST /{incident_id}/vote.


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
    text = str(payload.get("text", ""))[:2000]
    return classify_text_incident(text)
