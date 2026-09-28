import math
from fastapi import APIRouter, Depends, Query, Header, Request, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timezone
from typing import Optional
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import Incident, IncidentStatus
from schemas import SafetyScoreResponse
from security.anti_abuse import generate_client_fingerprint, check_read_scraping_quota

router = APIRouter(prefix="/score", tags=["score"])

SEVERITY_WEIGHTS = {
    "low": 4,
    "medium": 8,
    "high": 15,
    "critical": 25,
}


@router.get("", response_model=SafetyScoreResponse)
def get_safety_score(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_m: float = Query(600, ge=50, le=5000),
    x_device_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Calculates an honest, probabilistic Safety Score based ONLY on real incidents in the database
    within the given radius. Returns null score if no data exists (never invents a number).
    Rate-limited to prevent abuse.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    fp = generate_client_fingerprint(client_ip, x_device_id or "")
    allowed, retry_after = check_read_scraping_quota(fp)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Trop de calculs de score demandés. Réessayez dans {retry_after}s.",
            headers={"Retry-After": str(retry_after)}
        )

    # Bounding box (approx)
    lat_delta = radius_m / 111_000
    lon_delta = radius_m / (111_000 * max(abs(math.cos(math.radians(lat))), 0.01))

    now = datetime.now(timezone.utc)

    # Fetch all active incidents in bounding box from SQL
    candidates = db.query(Incident).filter(
        Incident.status == IncidentStatus.active,
        Incident.latitude.between(lat - lat_delta, lat + lat_delta),
        Incident.longitude.between(lon - lon_delta, lon + lon_delta),
    ).all()

    # Haversine precise filter
    def haversine(lat1, lon1, lat2, lon2):
        R = 6_371_000
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    nearby = [
        inc for inc in candidates
        if haversine(lat, lon, inc.latitude, inc.longitude) <= radius_m
    ]

    if not nearby:
        return SafetyScoreResponse(
            has_sufficient_data=False,
            score=None,
            status_text="Zone calme • Aucun incident signalé",
            confidence="none",
            incident_count=0,
            critical_count=0,
            recent_count=0,
            main_issues=[],
            description="Aucune perturbation ou situation à risque signalée dans ce secteur.",
        )

    # ── Score calculation ──────────────────────────────────────────────
    total_penalty = 0.0
    critical_count = 0
    recent_count = 0
    issue_titles = []

    for inc in nearby:
        base_weight = SEVERITY_WEIGHTS.get(inc.severity.value, 4)

        # Confirmation amplifier: more confirmations = more certain impact
        confirm_factor = min(2.0, 1.0 + inc.confirmations_count * 0.1)

        # Dispute attenuator
        dispute_factor = max(0.4, 1.0 - inc.disputes_count * 0.15)

        # Time decay
        created_naive = inc.created_at.replace(tzinfo=timezone.utc) if inc.created_at.tzinfo is None else inc.created_at
        age_minutes = (now - created_naive).total_seconds() / 60
        if age_minutes < 30:
            recent_count += 1
            time_decay = 1.3
        elif age_minutes < 120:
            time_decay = 1.0
        elif age_minutes < 360:
            time_decay = 0.75
        else:
            time_decay = 0.5

        if inc.severity.value == "critical":
            critical_count += 1

        total_penalty += base_weight * confirm_factor * dispute_factor * time_decay
        issue_titles.append(inc.title)

    score = max(10, min(95, round(100 - total_penalty)))
    confidence = "high" if len(nearby) >= 5 else "medium" if len(nearby) >= 2 else "low"

    if score >= 80:
        status_text = "Zone globalement calme"
    elif score >= 65:
        status_text = "Vigilance normale"
    elif score >= 45:
        status_text = "Vigilance accrue"
    else:
        status_text = "Zone à éviter actuellement"

    # Deduplicate issue titles
    seen, main_issues = set(), []
    for t in issue_titles:
        if t not in seen:
            seen.add(t)
            main_issues.append(t)
        if len(main_issues) == 4:
            break

    return SafetyScoreResponse(
        has_sufficient_data=True,
        score=score,
        status_text=status_text,
        confidence=confidence,
        incident_count=len(nearby),
        critical_count=critical_count,
        recent_count=recent_count,
        main_issues=main_issues,
        description=f"Indice basé sur {len(nearby)} signalement(s) actif(s) dans un rayon de {round(radius_m)} m.",
    )
