"""
Admin moderation queue (X-Admin-Key required).

  GET  /api/v1/moderation/queue?status=pending      list items to review
  POST /api/v1/moderation/queue/{review_id}/approve keep the incident published
  POST /api/v1/moderation/queue/{review_id}/reject  remove the incident from the map
"""
import json
import sys, os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import Incident, IncidentStatus, ModerationReview, Notification, AuditLog
from security.auth_shield import verify_admin_key
from security.audit import log_security_event

router = APIRouter(prefix="/moderation", tags=["moderation"])

REVIEW_STATUSES = ("pending", "approved", "rejected")


def _require_admin(x_admin_key: Optional[str]):
    if not verify_admin_key(x_admin_key):
        log_security_event("UNAUTHORIZED_MODERATION_QUEUE_ACCESS", status="BLOCKED")
        raise HTTPException(status_code=401, detail="Accès non autorisé : Clé d'administration requise.")


def _iso_utc(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return (value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value).isoformat()


def _serialize(review: ModerationReview, incident: Optional[Incident]) -> dict:
    return {
        "id": review.id,
        "status": review.status,
        "risk_score": review.risk_score,
        "primary_category": review.primary_category,
        "reasons": json.loads(review.reasons) if review.reasons else [],
        "created_at": _iso_utc(review.created_at),
        "reviewed_at": _iso_utc(review.reviewed_at),
        "incident": None if incident is None else {
            "id": incident.id,
            "category": incident.category.value if hasattr(incident.category, "value") else incident.category,
            "title": incident.title,
            "description": incident.description,
            "address": incident.address,
            "city": incident.city,
            "author_pseudonym": incident.author_pseudonym,
            "status": incident.status.value if hasattr(incident.status, "value") else incident.status,
            "created_at": _iso_utc(incident.created_at),
        },
    }


@router.get("/queue")
def list_queue(
    status: str = Query("pending"),
    limit: int = Query(100, ge=1, le=500),
    x_admin_key: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_admin(x_admin_key)
    if status not in REVIEW_STATUSES:
        raise HTTPException(status_code=422, detail=f"status doit valoir {', '.join(REVIEW_STATUSES)}.")

    reviews = (
        db.query(ModerationReview)
        .filter(ModerationReview.status == status)
        .order_by(ModerationReview.created_at.asc())
        .limit(limit)
        .all()
    )
    incidents = {
        inc.id: inc
        for inc in db.query(Incident).filter(Incident.id.in_([r.incident_id for r in reviews])).all()
    } if reviews else {}
    return {
        "total": len(reviews),
        "items": [_serialize(r, incidents.get(r.incident_id)) for r in reviews],
    }


def _get_pending(review_id: str, db: Session) -> ModerationReview:
    review = db.query(ModerationReview).filter(ModerationReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Élément de modération introuvable.")
    if review.status != "pending":
        raise HTTPException(status_code=409, detail=f"Déjà traité ({review.status}).")
    return review


@router.post("/queue/{review_id}/approve")
def approve(review_id: str, x_admin_key: Optional[str] = Header(None), db: Session = Depends(get_db)):
    _require_admin(x_admin_key)
    review = _get_pending(review_id, db)
    review.status = "approved"
    review.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(AuditLog(incident_id=review.incident_id, action="moderation_approved"))
    db.commit()
    log_security_event("MODERATION_REVIEW_APPROVED", target_id=review.incident_id)
    return _serialize(review, db.query(Incident).filter(Incident.id == review.incident_id).first())


@router.post("/queue/{review_id}/reject")
def reject(review_id: str, x_admin_key: Optional[str] = Header(None), db: Session = Depends(get_db)):
    _require_admin(x_admin_key)
    review = _get_pending(review_id, db)
    review.status = "rejected"
    review.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)

    incident = db.query(Incident).filter(Incident.id == review.incident_id).first()
    if incident:
        # Removed from the map, the list, the heatmap, the score and the alerts
        incident.status = IncidentStatus.blocked
        db.query(Notification).filter(Notification.incident_id == incident.id).delete(synchronize_session=False)
    db.add(AuditLog(incident_id=review.incident_id, action="moderation_rejected"))
    db.commit()
    log_security_event("MODERATION_REVIEW_REJECTED", target_id=review.incident_id, status="WARNING")
    return _serialize(review, incident)
