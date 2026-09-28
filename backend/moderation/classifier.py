import re
from typing import Optional, List, Tuple, Set
from .categories import ModerationCategory, ModerationSeverity, ModerationAction
from .schemas import ModerationResult, USER_BLOCK_TITLE, USER_BLOCK_MESSAGE
from .normalizer import NormalizedBundle
from .rules import (
    FACTUAL_REPORTING_MARKERS,
    LEGITIMATE_OFFENSE_PHRASES,
    CRITICAL_PATTERNS,
    HIGH_PATTERNS,
    COLLAPSED_CRITICAL_SUBSTRINGS,
    MEDIUM_PATTERNS,
)

class ContentClassifier:
    """
    Context-aware risk classification engine.
    Differentiates factual citizen security reports from genuine violations.
    """

    def __init__(self, model_version: str = "v2.5.0-ctx", rules_version: str = "2026.09.1"):
        self.model_version = model_version
        self.rules_version = rules_version

    def classify(
        self,
        bundle: NormalizedBundle,
        incident_category: Optional[str] = None,
        title: Optional[str] = None
    ) -> ModerationResult:
        internal_flags: List[str] = []
        detected_categories: List[ModerationCategory] = []
        risk_score: float = 0.0
        primary_category: Optional[ModerationCategory] = None

        text = bundle.normalized_text
        leet = bundle.leetspeak_text
        collapsed = bundle.collapsed_text
        tokens_set = set(bundle.tokens)

        # ── Step 0: Check Factual Safety Context ────────────────────────────
        factual_marker_count = len(tokens_set.intersection(FACTUAL_REPORTING_MARKERS))
        has_legitimate_offense_phrase = any(
            p.search(bundle.cleaned_text) or p.search(text) for p in LEGITIMATE_OFFENSE_PHRASES
        )

        # ── Step 1: Check Critical Rules (Score = 1.0, CRITICAL_BLOCK) ───────
        for pattern, cat in CRITICAL_PATTERNS:
            if pattern.search(text) or pattern.search(leet):
                internal_flags.append(f"CRITICAL_REGEX:{pattern.pattern}")
                detected_categories.append(cat)
                risk_score = 1.0
                primary_category = cat
                break

        # ── Step 2: Check Collapsed Evasion Substrings (m.o.r.t, leet) ─────
        if risk_score < 0.95:
            for sub, cat in COLLAPSED_CRITICAL_SUBSTRINGS:
                if sub in bundle.collapsed_text or sub in bundle.collapsed_leet:
                    internal_flags.append(f"COLLAPSED_EVASION:{sub}")
                    detected_categories.append(cat)
                    risk_score = max(risk_score, 0.95)
                    primary_category = primary_category or cat

        # ── Step 3: Check High Patterns (Score = 0.80, BLOCK) ───────────────
        if risk_score < 0.80:
            for pattern, cat in HIGH_PATTERNS:
                if pattern.search(text) or pattern.search(leet):
                    internal_flags.append(f"HIGH_REGEX:{pattern.pattern}")
                    detected_categories.append(cat)
                    risk_score = max(risk_score, 0.80)
                    primary_category = primary_category or cat

        # ── Step 4: Check Medium Patterns & Apply Contextual Exemption ─────
        if risk_score < 0.60:
            for pattern, cat in MEDIUM_PATTERNS:
                if pattern.search(text) or pattern.search(leet):
                    internal_flags.append(f"MEDIUM_REGEX:{pattern.pattern}")
                    detected_categories.append(cat)
                    
                    # If this is a weapon/violence mention WITH factual safety reporting context:
                    # (e.g. "Homme avec couteau aperçu rue de Rennes", "victime d'agression avec arme")
                    # -> It is a genuine safety report! Keep risk low.
                    if cat == ModerationCategory.VIOLENCE and (factual_marker_count >= 1 or has_legitimate_offense_phrase):
                        risk_score = max(risk_score, 0.15)
                        internal_flags.append("CONTEXT_EXEMPTION_WEAPON_IN_INCIDENT")
                    else:
                        # Otherwise it is a gratuitous insult or threat without safety context
                        risk_score = max(risk_score, 0.68)
                        primary_category = primary_category or cat

        # ── Step 5: Legitimate Reporting Exemption ─────────────────────────
        # If the phrase matches legitimate reports (e.g. "agression sexuelle", "propos racistes")
        # and has NO explicit pornographic/critical triggers, ensure it is ALLOWED:
        if has_legitimate_offense_phrase and risk_score < 0.85:
            # Check if any explicit pornographic keyword was actually triggered
            is_explicit_porn = any(cat in (ModerationCategory.SEXUAL_EXPLICIT, ModerationCategory.SEXUAL_MINORS) for cat in detected_categories)
            if not is_explicit_porn:
                risk_score = min(risk_score, 0.10)
                internal_flags.append("LEGITIMATE_INCIDENT_REPORT_PROTECTION")

        # ── Step 6: Reinforced Check on "other" (Autre situation) ──────────
        if incident_category == "other":
            if len(bundle.cleaned_text.strip()) < 5:
                risk_score = 0.90
                primary_category = ModerationCategory.OFF_TOPIC
                internal_flags.append("OTHER_SITUATION_TOO_SHORT")
            elif factual_marker_count == 0 and risk_score >= 0.40:
                # Lower tolerance for unanchored text in "Autre situation"
                risk_score = max(risk_score, 0.75)
                primary_category = primary_category or ModerationCategory.OFF_TOPIC
                internal_flags.append("OTHER_SITUATION_REINFORCED_STRICTNESS")

        # ── Step 7: Final Decision Mapping ──────────────────────────────────
        if risk_score >= 0.85:
            action = ModerationAction.CRITICAL_BLOCK
            severity = ModerationSeverity.CRITICAL
            allowed = False
        elif risk_score >= 0.60:
            action = ModerationAction.BLOCK
            severity = ModerationSeverity.HIGH
            allowed = False
        elif risk_score >= 0.30:
            action = ModerationAction.REVIEW
            severity = ModerationSeverity.MEDIUM
            allowed = True  # Allowed to publish under monitoring
        else:
            action = ModerationAction.ALLOW
            severity = ModerationSeverity.LOW
            allowed = True

        user_title = USER_BLOCK_TITLE if not allowed else None
        user_message = USER_BLOCK_MESSAGE if not allowed else None

        return ModerationResult(
            allowed=allowed,
            action=action,
            severity=severity,
            risk_score=round(risk_score, 2),
            primary_category=primary_category or (ModerationCategory.SAFE if allowed else ModerationCategory.ABUSE),
            detected_categories=list(set(detected_categories)),
            user_title=user_title,
            user_message=user_message,
            model_version=self.model_version,
            rules_version=self.rules_version,
            internal_flags=internal_flags,
        )
