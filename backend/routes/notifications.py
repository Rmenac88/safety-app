from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session
from typing import Optional, List
import math
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import Notification, Incident, IncidentStatus
from security.geo_privacy import obfuscate_public_coordinates
from security.auth_shield import verify_admin_key
from security.audit import log_security_event

router = APIRouter(prefix="/notifications", tags=["notifications"])


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.get("")
def list_notifications(
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=180),
    radius_km: float = Query(5.0, ge=0.5, le=30.0),
    city: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    Get geolocated safety notifications with strict deduplication and privacy-preserving coordinates.
    Only returns notifications for currently active incidents.
    """
    effective_radius = min(radius_km, 30.0)

    # Join with Incident to only deliver alerts for active incidents
    query = (
        db.query(Notification)
        .outerjoin(Incident, Notification.incident_id == Incident.id)
        .filter(
            (Notification.incident_id.is_(None)) | (Incident.status == IncidentStatus.active)
        )
        .order_by(Notification.created_at.desc())
    )

    if city:
        city_clean = city.strip().lower()
        query = query.filter(Notification.city.ilike(f"%{city_clean}%"))

    notifications = query.limit(limit * 3).all()

    seen_incident_ids = set()
    filtered = []

    for n in notifications:
        inc_key = str(n.incident_id) if n.incident_id else str(n.id)
        if inc_key in seen_incident_ids:
            continue

        if lat is not None and lon is not None:
            dist = haversine_km(lat, lon, n.latitude, n.longitude)
            if dist > effective_radius:
                continue
            distance_km = round(dist, 1)
        else:
            distance_km = None

        seen_incident_ids.add(inc_key)
        pub_lat, pub_lon = obfuscate_public_coordinates(n.latitude, n.longitude, n.id)

        filtered.append({
            "id": str(n.id),
            "incident_id": str(n.incident_id) if n.incident_id else None,
            "city": n.city,
            "neighborhood": n.neighborhood,
            "latitude": pub_lat,
            "longitude": pub_lon,
            "title": n.title,
            "message": n.message,
            "severity": n.severity,
            "category": n.category,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat(),
            "distance_km": distance_km,
        })
        if len(filtered) >= limit:
            break

    return filtered


@router.patch("/{notification_id}/read")
def mark_read(notification_id: str, db: Session = Depends(get_db)):
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return {"status": "ok"}


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: str,
    x_admin_key: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Deletion of a specific notification."""
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if n:
        db.delete(n)
        db.commit()
    return {"status": "deleted", "id": notification_id}


@router.delete("")
def clear_all_notifications(
    x_admin_key: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Administrative wipe of all notifications.
    LOCKED behind X-Admin-Key against malicious zero-auth destruction.
    """
    if not verify_admin_key(x_admin_key):
        log_security_event("UNAUTHORIZED_NOTIFICATION_CLEAR_ATTEMPT", status="CRITICAL")
        raise HTTPException(
            status_code=401,
            detail="Accès non autorisé : Clé d'administration requise pour vider les alertes."
        )

    db.query(Notification).delete()
    db.commit()
    log_security_event("ALL_NOTIFICATIONS_CLEARED_BY_ADMIN", status="SUCCESS")
    return {"status": "all_cleared"}
