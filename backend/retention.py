"""
Data retention policy (RGPD art. 5-1-e: storage limitation).

Before this module nothing was ever deleted: expired / resolved reports, their alerts,
votes, audit trail and moderation records were kept forever.

    Data                                   Kept
    ─────────────────────────────────────  ───────────────────────────────────────────
    Active report                          until its own expiry (30 min … 30 days)
    Expired / resolved / rejected report   + RETENTION_CLOSED_INCIDENT_DAYS, then deleted
      with its alerts, votes, audit trail and moderation review
    Orphan alerts (no linked report)       RETENTION_ORPHAN_NOTIFICATION_DAYS
    Moderation events (refused content)    RETENTION_MODERATION_EVENT_DAYS (SHA-256 only)
    Rate-limit hits                        1 hour (security/anti_abuse.py)
    Favorites                              until the user deletes them (/me/data)

Purges run opportunistically from regular requests, at most once every
PURGE_INTERVAL_SECONDS per instance (no cron needed on serverless).
"""
import os
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

RETENTION_CLOSED_INCIDENT_DAYS = int(os.getenv("RETENTION_CLOSED_INCIDENT_DAYS", "30"))
RETENTION_ORPHAN_NOTIFICATION_DAYS = int(os.getenv("RETENTION_ORPHAN_NOTIFICATION_DAYS", "30"))
RETENTION_MODERATION_EVENT_DAYS = int(os.getenv("RETENTION_MODERATION_EVENT_DAYS", "90"))
PURGE_INTERVAL_SECONDS = 600

_last_purge = 0.0


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def purge_expired_data(db: Session, force: bool = False) -> dict:
    """Deletes data past its retention period. Returns the number of rows deleted per table."""
    global _last_purge
    if not force and time.time() - _last_purge < PURGE_INTERVAL_SECONDS:
        return {}
    _last_purge = time.time()

    from models import (
        AuditLog, Incident, IncidentStatus, IncidentVote, ModerationEvent,
        ModerationReview, Notification,
    )

    now = _utcnow()
    closed_before = now - timedelta(days=RETENTION_CLOSED_INCIDENT_DAYS)
    closed_ids = [
        str(row[0]) for row in db.query(Incident.id).filter(
            Incident.status != IncidentStatus.active,
            Incident.expires_at < closed_before,
        ).all()
    ]

    deleted = {"incidents": len(closed_ids)}
    if closed_ids:
        for model, key in (
            (Notification, "notifications"),
            (IncidentVote, "votes"),
            (AuditLog, "audit_log"),
            (ModerationReview, "moderation_reviews"),
        ):
            deleted[key] = db.query(model).filter(model.incident_id.in_(closed_ids)).delete(synchronize_session=False)
        db.query(Incident).filter(Incident.id.in_(closed_ids)).delete(synchronize_session=False)

    deleted["orphan_notifications"] = db.query(Notification).filter(
        Notification.incident_id.is_(None),
        Notification.created_at < now - timedelta(days=RETENTION_ORPHAN_NOTIFICATION_DAYS),
    ).delete(synchronize_session=False)
    deleted["moderation_events"] = db.query(ModerationEvent).filter(
        ModerationEvent.created_at < now - timedelta(days=RETENTION_MODERATION_EVENT_DAYS),
    ).delete(synchronize_session=False)
    db.commit()
    return deleted
