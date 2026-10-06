import re
from typing import Optional, List
from .categories import ModerationCategory, ModerationSeverity, ModerationAction
from .schemas import ModerationResult, USER_BLOCK_TITLE, USER_BLOCK_MESSAGE
from .normalizer import NormalizedBundle
from .rules import (
    FACTUAL_REPORTING_MARKERS,
    SAFETY_CONTEXT_CATEGORIES,
    EMERGENCY_CONTEXT_CATEGORIES,
    LEGITIMATE_OFFENSE_PHRASES,
    SECOND_PERSON_TOKENS,
    CRITICAL_PATTERNS,
    HIGH_PATTERNS,
    COLLAPSED_CRITICAL_SUBSTRINGS,
    COLLAPSED_BENIGN_WORDS,
    CONTEXTUAL_THREAT_SUBSTRINGS,
    MEDIUM_PATTERNS,
    LOW_PATTERNS,
)

_BENIGN_TOKENS = set(COLLAPSED_BENIGN_WORDS)


class ContentClassifier:
    """
    Context-aware risk classification engine.
    Differentiates factual citizen security reports from genuine violations.
    """

    def __init__(self, model_version: str = "v2.6.0-ctx", rules_version: str = "2026.10.1"):
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

        variants = bundle.regex_variants
        tokens_set = set(bundle.tokens)

        def matches(pattern: re.Pattern) -> bool:
            return any(pattern.search(v) for v in variants)

        # Collapsed variants with benign words ("salopette") removed, so they cannot trigger.
        # Built from the tokens (same alphabet as the collapsed text) to keep word boundaries.
        if tokens_set & _BENIGN_TOKENS:
            from .normalizer import normalize_content
            kept = " ".join(t for t in bundle.tokens if t not in _BENIGN_TOKENS)
            collapsed_variants = normalize_content(kept).collapsed_variants
        else:
            collapsed_variants = bundle.collapsed_variants

        def collapsed_contains(sub: str) -> bool:
            return any(sub in v for v in collapsed_variants)

        # ── Step 0: Check Factual Safety Context ────────────────────────────
        factual_marker_count = len(tokens_set & FACTUAL_REPORTING_MARKERS)
        has_legitimate_offense_phrase = any(matches(p) for p in LEGITIMATE_OFFENSE_PHRASES)
        in_safety_category = incident_category in SAFETY_CONTEXT_CATEGORIES
        in_emergency_category = incident_category in EMERGENCY_CONTEXT_CATEGORIES
        addresses_someone = bool(tokens_set & SECOND_PERSON_TOKENS)

        # ── Step 1: Check Critical Rules (Score = 1.0, CRITICAL_BLOCK) ───────
        for pattern, cat in CRITICAL_PATTERNS:
            if matches(pattern):
                internal_flags.append(f"CRITICAL_REGEX:{pattern.pattern}")
                detected_categories.append(cat)
                risk_score = 1.0
                primary_category = cat
                break

        # ── Step 2: Check Collapsed Evasion Substrings (m.o.r.t, leet) ─────
        if risk_score < 0.95:
            for sub, cat in COLLAPSED_CRITICAL_SUBSTRINGS:
                if collapsed_contains(sub):
                    internal_flags.append(f"COLLAPSED_EVASION:{sub}")
                    detected_categories.append(cat)
                    risk_score = max(risk_score, 0.95)
                    primary_category = primary_category or cat

        # ── Step 2b: "va mourir" — threat unless it describes a victim ──────
        if risk_score < 0.95:
            for sub, cat in CONTEXTUAL_THREAT_SUBSTRINGS:
                if collapsed_contains(sub):
                    describes_victim = (
                        not addresses_someone
                        and (in_emergency_category or factual_marker_count >= 1)
                    )
                    if describes_victim:
                        internal_flags.append(f"CONTEXT_EXEMPTION_VICTIM_STATE:{sub}")
                    else:
                        internal_flags.append(f"CONTEXTUAL_THREAT:{sub}")
                        detected_categories.append(cat)
                        risk_score = max(risk_score, 0.95)
                        primary_category = primary_category or cat

        # ── Step 3: Check High Patterns (Score = 0.80, BLOCK) ───────────────
        if risk_score < 0.80:
            for pattern, cat in HIGH_PATTERNS:
                if matches(pattern):
                    internal_flags.append(f"HIGH_REGEX:{pattern.pattern}")
                    detected_categories.append(cat)
                    risk_score = max(risk_score, 0.80)
                    primary_category = primary_category or cat

        # Score reached by slurs / spam / explicit content: factual context can NOT lower it.
        hard_floor = risk_score

        # ── Step 4: Check Medium Patterns & Apply Contextual Exemption ─────
        if risk_score < 0.60:
            for pattern, cat in MEDIUM_PATTERNS:
                if matches(pattern):
                    internal_flags.append(f"MEDIUM_REGEX:{pattern.pattern}")
                    detected_categories.append(cat)

                    # A weapon mentioned in a safety report IS the report
                    # (e.g. "Homme armé d'un pistolet", "machette devant l'école").
                    if cat == ModerationCategory.VIOLENCE and (
                        in_safety_category or factual_marker_count >= 1 or has_legitimate_offense_phrase
                    ):
                        risk_score = max(risk_score, 0.15)
                        internal_flags.append("CONTEXT_EXEMPTION_WEAPON_IN_INCIDENT")
                    else:
                        # Otherwise it is a gratuitous insult or threat without safety context
                        risk_score = max(risk_score, 0.68)
                        primary_category = primary_category or cat

        # ── Step 4b: Mild vulgarity -> published but flagged for review ─────
        if risk_score < 0.30:
            for pattern, cat in LOW_PATTERNS:
                if matches(pattern):
                    internal_flags.append(f"LOW_REGEX:{pattern.pattern}")
                    detected_categories.append(cat)
                    risk_score = max(risk_score, 0.35)
                    primary_category = primary_category or cat

        # ── Step 5: Legitimate Reporting Exemption ─────────────────────────
        # "agression sexuelle", "propos racistes"... protect MEDIUM-level matches only.
        # Slurs, spam links and explicit content (hard_floor >= 0.80) stay blocked:
        # prefixing "agression sexuelle" must never unlock a scam link or an insult.
        if has_legitimate_offense_phrase and hard_floor < 0.80 and risk_score < 0.80:
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
            detected_categories=list(dict.fromkeys(detected_categories)),
            user_title=user_title,
            user_message=user_message,
            model_version=self.model_version,
            rules_version=self.rules_version,
            internal_flags=internal_flags,
        )
