import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Integer, DateTime, Boolean, Text, Index, Enum as SAEnum
from database import Base
import enum


def _utcnow_naive() -> datetime:
    """UTC timestamp without tzinfo: columns are 'timestamp without time zone' everywhere."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class IncidentCategory(str, enum.Enum):
    danger = "danger"
    avoid = "avoid"
    altercation = "altercation"
    violence = "violence"
    accident = "accident"
    hazard = "hazard"
    lighting = "lighting"
    harassment = "harassment"
    burglary = "burglary"
    fire = "fire"
    disaster = "disaster"
    police = "police"
    medical = "medical"
    other = "other"


class SeverityLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class IncidentStatus(str, enum.Enum):
    active = "active"
    resolved = "resolved"
    expired = "expired"
    blocked = "blocked"
    pending_moderation = "pending_moderation"


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    category = Column(SAEnum(IncidentCategory), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(String(300), nullable=True)
    neighborhood = Column(String(200), nullable=True)
    city = Column(String(200), nullable=True)
    severity = Column(SAEnum(SeverityLevel), nullable=False, default=SeverityLevel.medium)
    status = Column(SAEnum(IncidentStatus), nullable=False, default=IncidentStatus.active)
    confirmations_count = Column(Integer, default=1, nullable=False)
    disputes_count = Column(Integer, default=0, nullable=False)
    is_anonymous = Column(Boolean, default=True, nullable=False)
    author_pseudonym = Column(String(100), default="Citoyen anonyme")
    time_slot_relevance = Column(String(20), default="all")
    estimated_duration = Column(String(30), default="2 h")
    geometry_type = Column(String(20), default="point")  # "point" | "street" | "area"
    geojson_geometry = Column(Text, nullable=True)  # GeoJSON string (LineString / Polygon)
    created_at = Column(DateTime, default=_utcnow_naive, nullable=False)
    expires_at = Column(DateTime, nullable=False)


class FavoritePlace(Base):
    __tablename__ = "favorites"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False, index=True)  # Anonymous session
    name = Column(String(200), nullable=False)
    place_type = Column(String(20), default="other")  # home/work/school/other
    address = Column(String(300), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    notify_radius_m = Column(Integer, default=500)
    created_at = Column(DateTime, default=_utcnow_naive)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id = Column(String, nullable=True, index=True)
    city = Column(String(200), nullable=True, index=True)
    neighborhood = Column(String(200), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    severity = Column(String(20), default="medium")
    category = Column(String(50), default="other")
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=_utcnow_naive)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id = Column(String, nullable=True)
    action = Column(String(50), nullable=False)  # created / confirmed / disputed / resolved / expired
    extra_data = Column(Text, nullable=True)  # JSON string
    created_at = Column(DateTime, default=_utcnow_naive)


class IncidentVote(Base):
    __tablename__ = "incident_votes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id = Column(String, nullable=False, index=True)
    session_id = Column(String(100), nullable=False, index=True)
    vote_type = Column(String(20), nullable=False)  # "confirm" | "dispute"
    created_at = Column(DateTime, default=_utcnow_naive)


class ModerationEvent(Base):
    __tablename__ = "moderation_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    client_fingerprint = Column(String(100), nullable=False, index=True)
    content_hash = Column(String(64), nullable=False, index=True)  # SHA-256
    content_length = Column(Integer, nullable=False, default=0)
    primary_category = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    action = Column(String(30), nullable=False)
    risk_score = Column(Float, nullable=False)
    rules_version = Column(String(30), default="2026.10.1")
    model_version = Column(String(30), default="v2.6.0-ctx")
    created_at = Column(DateTime, default=_utcnow_naive, nullable=False)


class RateLimitHit(Base):
    """One row per rate-limited request: shared sliding windows across serverless instances."""
    __tablename__ = "rate_limit_hits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bucket = Column(String(120), nullable=False)
    created_at = Column(DateTime, default=_utcnow_naive, nullable=False)

    __table_args__ = (Index("ix_rate_limit_hits_bucket_created", "bucket", "created_at"),)


class ModerationReview(Base):
    """
    Human moderation queue: incidents published with a REVIEW verdict (mild vulgarity,
    borderline wording). A moderator approves or rejects them via /api/v1/moderation.
    """
    __tablename__ = "moderation_reviews"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id = Column(String, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="pending", index=True)  # pending | approved | rejected
    risk_score = Column(Float, nullable=False)
    primary_category = Column(String(50), nullable=False)
    reasons = Column(Text, nullable=True)  # JSON list of internal rule flags (admin only)
    created_at = Column(DateTime, default=_utcnow_naive, nullable=False)
    reviewed_at = Column(DateTime, nullable=True)
