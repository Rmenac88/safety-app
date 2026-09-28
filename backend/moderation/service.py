import hashlib
from typing import Optional
from sqlalchemy.orm import Session
from .normalizer import normalize_content
from .classifier import ContentClassifier
from .schemas import ModerationResult, ModerationRequest

class ModerationService:
    """Centralized Safety Content Moderation Service."""

    def __init__(self):
        self.classifier = ContentClassifier()

    def evaluate(
        self,
        text: str,
        incident_category: Optional[str] = None,
        title: Optional[str] = None,
        client_fingerprint: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> ModerationResult:
        if not text:
            bundle = normalize_content("")
        else:
            bundle = normalize_content(text)

        result = self.classifier.classify(
            bundle=bundle,
            incident_category=incident_category,
            title=title,
        )

        # Audit rejected attempts if DB session provided
        if not result.allowed and db is not None:
            try:
                self._record_moderation_event(
                    text=bundle.cleaned_text,
                    result=result,
                    client_fingerprint=client_fingerprint or "unknown",
                    db=db,
                )
            except Exception as e:
                # Never crash the moderation verdict due to an audit write failure
                pass

        return result

    def _record_moderation_event(
        self,
        text: str,
        result: ModerationResult,
        client_fingerprint: str,
        db: Session,
    ):
        from models import ModerationEvent
        content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        event = ModerationEvent(
            client_fingerprint=client_fingerprint,
            content_hash=content_hash,
            content_length=len(text),
            primary_category=result.primary_category.value if result.primary_category else "ABUSE",
            severity=result.severity.value,
            action=result.action.value,
            risk_score=result.risk_score,
            rules_version=result.rules_version,
            model_version=result.model_version,
        )
        db.add(event)
        db.commit()


_global_service = ModerationService()

def moderate_text(
    text: str,
    incident_category: Optional[str] = None,
    title: Optional[str] = None,
    client_fingerprint: Optional[str] = None,
    db: Optional[Session] = None,
) -> ModerationResult:
    """Global gateway for content moderation across all write endpoints."""
    return _global_service.evaluate(
        text=text,
        incident_category=incident_category,
        title=title,
        client_fingerprint=client_fingerprint,
        db=db,
    )
