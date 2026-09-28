from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum


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


# ── Incident Schemas ──────────────────────────────────────────────────────────

class IncidentCreate(BaseModel):
    category: IncidentCategory
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    address: Optional[str] = Field(None, max_length=300)
    neighborhood: Optional[str] = Field(None, max_length=200)
    city: Optional[str] = Field(None, max_length=200)
    severity: SeverityLevel = SeverityLevel.medium
    is_anonymous: bool = True
    author_pseudonym: Optional[str] = "Citoyen anonyme"
    time_slot_relevance: str = "all"
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
        if not v:
            return None
        import json
        try:
            data = json.loads(v)
        except Exception:
            raise ValueError("geojson_geometry must be valid JSON")
        
        g_type = data.get("type")
        coords = data.get("coordinates")
        if not g_type or coords is None:
            raise ValueError("geojson_geometry must have 'type' and 'coordinates'")

        def check_pt(pt):
            if not isinstance(pt, (list, tuple)) or len(pt) < 2:
                raise ValueError("Point must be [lon, lat]")
            lon, lat = pt[0], pt[1]
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                raise ValueError(f"Coordinates out of bounds: {lon}, {lat}")

        if g_type == "Point":
            check_pt(coords)
        elif g_type == "LineString":
            if not isinstance(coords, list) or len(coords) < 2:
                raise ValueError("LineString must have at least 2 points")
            if len(coords) > 500:
                raise ValueError("LineString cannot exceed 500 vertices")
            for pt in coords:
                check_pt(pt)
        elif g_type == "Polygon":
            if not isinstance(coords, list) or len(coords) < 1:
                raise ValueError("Polygon must have at least 1 linear ring")
            outer_ring = coords[0]
            if not isinstance(outer_ring, list) or len(outer_ring) < 4:
                raise ValueError("Polygon ring must have at least 4 coordinates")
            if len(outer_ring) > 500:
                raise ValueError("Polygon cannot exceed 500 vertices")
            for pt in outer_ring:
                check_pt(pt)
            # Ensure closed ring
            if outer_ring[0][0] != outer_ring[-1][0] or outer_ring[0][1] != outer_ring[-1][1]:
                outer_ring.append(outer_ring[0])
        return json.dumps(data)


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
    session_id: str
    name: str = Field(..., min_length=1, max_length=200)
    place_type: str = "other"
    address: Optional[str] = None
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
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
