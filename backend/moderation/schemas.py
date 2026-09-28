from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from .categories import ModerationAction, ModerationSeverity, ModerationCategory

USER_BLOCK_TITLE = "Contenu bloqué"
USER_BLOCK_MESSAGE = (
    "Cette description contient un contenu qui ne respecte pas les règles de Safety. "
    "Modifiez votre description afin de pouvoir publier le signalement."
)

class ModerationRequest(BaseModel):
    text: str = Field(..., max_length=2000)
    incident_category: Optional[str] = None
    title: Optional[str] = None
    client_fingerprint: Optional[str] = None
    author_pseudonym: Optional[str] = None


class ModerationResult(BaseModel):
    allowed: bool
    action: ModerationAction
    severity: ModerationSeverity
    risk_score: float = Field(..., ge=0.0, le=1.0)
    primary_category: Optional[ModerationCategory] = None
    detected_categories: List[ModerationCategory] = Field(default_factory=list)
    user_title: Optional[str] = None
    user_message: Optional[str] = None
    model_version: str = "v2.5.0-ctx"
    rules_version: str = "2026.09.1"
    
    # Internal metadata (FOR INTERNAL AUDIT LOGGING ONLY, NEVER SENT TO CLIENT!)
    internal_flags: List[str] = Field(default_factory=list)
