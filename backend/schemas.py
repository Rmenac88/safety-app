import json
import math
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any, Literal
from datetime import datetime, timezone
from enum import Enum


MAX_GEOJSON_CHARS = 50_000
MAX_GEOJSON_VERTICES = 500
MAX_POLYGON_RINGS = 10


class IncidentCategory(str, Enum):
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


class SeverityLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class IncidentStatus(str, Enum):
    active = "active"
    resolved = "resolved"
    expired = "expired"
    blocked = "blocked"
    pending_moderation = "pending_moderation"


# ── Incident Schemas ──────────────────────────────────────────────────────────

class IncidentCreate(BaseModel):
    category: IncidentCategory
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    latitude: float = Field(..., ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(..., ge=-180, le=180, allow_inf_nan=False)
    address: Optional[str] = Field(None, max_length=300)
    neighborhood: Optional[str] = Field(None, max_length=200)
    city: Optional[str] = Field(None, max_length=200)
    severity: SeverityLevel = SeverityLevel.medium
    is_anonymous: bool = True
    author_pseudonym: Optional[str] = Field("Citoyen anonyme", max_length=100)
    time_slot_relevance: str = Field("all", max_length=20)
    estimated_duration: str = "2 h"  # "30 min" | "2 h" | "12 h" | "24 h" | "permanent"
    geometry_type: str = "Point"  # "Point" | "LineString" | "Polygon"
    geojson_geometry: Optional[str] = None  # Validated GeoJSON string

    @field_validator("estimated_duration")
    @classmethod
    def validate_duration(cls, v: str) -> str:
        allowed = {"30 min", "2 h", "12 h", "24 h", "permanent"}
        if v not in allowed:
            raise ValueError(f"estimated_duration must be one of {allowed}")
        return v

    @field_validator("geometry_type")
    @classmethod
    def validate_geometry_type(cls, v: str) -> str:
        norm = v.strip().capitalize()
        if norm in ("Linestring", "Linestring"):
            norm = "LineString"
        allowed = {"Point", "LineString", "Polygon"}
        if norm not in allowed:
            if v.lower() == "street":
                norm = "LineString"
            elif v.lower() == "area":
                norm = "Polygon"
            else:
                norm = "Point"
        return norm

    @field_validator("geojson_geometry")
    @classmethod
    def validate_geojson_geometry(cls, v: Optional[str]) -> Optional[str]:
        """
        Strict GeoJSON validation: only Point / LineString / Polygon, finite numeric
        coordinates within bounds, every ring checked, bounded size. Anything else is a 422
        (unknown types used to be stored as-is and broadcast to every client; non-numeric
        coordinates crashed the validator with a 500).
        """
        if not v:
            return None
        if len(v) > MAX_GEOJSON_CHARS:
            raise ValueError(f"geojson_geometry cannot exceed {MAX_GEOJSON_CHARS} characters")
        try:
            data = json.loads(v)
        except ValueError:
            raise ValueError("geojson_geometry must be valid JSON")
        if not isinstance(data, dict):
            raise ValueError("geojson_geometry must be a JSON object")

        g_type = data.get("type")
        coords = data.get("coordinates")
        if g_type not in ("Point", "LineString", "Polygon"):
            raise ValueError("geojson_geometry type must be Point, LineString or Polygon")

        def check_pt(pt) -> list:
            if not isinstance(pt, (list, tuple)) or len(pt) < 2:
                raise ValueError("Point must be [lon, lat]")
            lon, lat = pt[0], pt[1]
            for value in (lon, lat):
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                    raise ValueError("Coordinates must be finite numbers")
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                raise ValueError(f"Coordinates out of bounds: {lon}, {lat}")
            return [float(lon), float(lat)]

        def check_line(points, min_len: int, label: str) -> list:
            if not isinstance(points, list) or len(points) < min_len:
                raise ValueError(f"{label} must have at least {min_len} points")
            if len(points) > MAX_GEOJSON_VERTICES:
                raise ValueError(f"{label} cannot exceed {MAX_GEOJSON_VERTICES} vertices")
            return [check_pt(pt) for pt in points]

        if g_type == "Point":
            clean = check_pt(coords)
        elif g_type == "LineString":
            clean = check_line(coords, 2, "LineString")
        else:
            if not isinstance(coords, list) or not (1 <= len(coords) <= MAX_POLYGON_RINGS):
                raise ValueError(f"Polygon must have between 1 and {MAX_POLYGON_RINGS} rings")
            clean = [check_line(ring, 4, "Polygon ring") for ring in coords]
            if sum(len(r) for r in clean) > MAX_GEOJSON_VERTICES:
                raise ValueError(f"Polygon cannot exceed {MAX_GEOJSON_VERTICES} vertices")
            for ring in clean:
                if ring[0] != ring[-1]:
                    ring.append(ring[0])  # ensure closed ring

        # Re-serialised from validated values only: extra keys / junk are dropped
        return json.dumps({"type": g_type, "coordinates": clean})


class IncidentResponse(BaseModel):
    id: str
    category: IncidentCategory
    title: str
    description: Optional[str]
    latitude: float
    longitude: float
    address: Optional[str]
    neighborhood: Optional[str]
    city: Optional[str]
    severity: SeverityLevel
    status: IncidentStatus
    confirmations_count: int
    disputes_count: int
    is_anonymous: bool
    author_pseudonym: str
    time_slot_relevance: str
    estimated_duration: str
    geometry_type: str
    geojson_geometry: Optional[str]
    created_at: datetime
    expires_at: datetime
    trust_score: float = 0.75
    moderation_status: str = "approved"

    @field_validator("id", mode="before")
    @classmethod
    def serialize_id(cls, v: Any) -> str:
        return str(v) if v is not None else ""

    @field_validator("created_at", "expires_at", mode="after")
    @classmethod
    def mark_as_utc(cls, v: datetime) -> datetime:
        # The DB stores naive UTC. Without an explicit offset, browsers parse
        # "2026-10-06T10:30:00" as LOCAL time (2 h off in France).
        return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v

    model_config = {"from_attributes": True}


class IncidentCreateResponse(IncidentResponse):
    owner_token: str


class IncidentListResponse(BaseModel):
    total: int
    incidents: List[IncidentResponse]


# ── Score Schemas ─────────────────────────────────────────────────────────────

class SafetyScoreResponse(BaseModel):
    has_sufficient_data: bool
    score: Optional[int]  # 0-100 or null if no data
    status_text: str
    confidence: str  # "none" | "low" | "medium" | "high"
    incident_count: int
    critical_count: int
    recent_count: int  # < 30 min
    main_issues: List[str]
    description: str


# ── Favorite Schemas ──────────────────────────────────────────────────────────

class FavoriteCreate(BaseModel):
    session_id: str = Field(..., min_length=5, max_length=120)
    name: str = Field(..., min_length=1, max_length=200)
    place_type: Literal["home", "work", "school", "other"] = "other"
    address: Optional[str] = Field(None, max_length=300)
    latitude: float = Field(..., ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(..., ge=-180, le=180, allow_inf_nan=False)
    notify_radius_m: int = Field(500, ge=50, le=5000)


class FavoriteResponse(BaseModel):
    id: str
    session_id: str
    name: str
    place_type: str
    address: Optional[str]
    latitude: float
    longitude: float
    notify_radius_m: int
    created_at: datetime

    @field_validator("id", mode="before")
    @classmethod
    def serialize_id(cls, v: Any) -> str:
        return str(v) if v is not None else ""

    model_config = {"from_attributes": True}
