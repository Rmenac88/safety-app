import re
import html
from typing import Tuple, Optional

# Prohibited / Dangerous patterns (XSS, Script Injections, Data URIs)
HTML_TAG_REGEX = re.compile(r'<[^>]*?>', re.IGNORECASE)
SCRIPT_EVENTS_REGEX = re.compile(r'(on\w+\s*=|javascript:|data:text/html|vbscript:)', re.IGNORECASE)

# Prohibited hate speech, severe harassment, or explicit threat patterns for automated moderation
REJECT_KEYWORDS = [
    r'\bmort aux\b', r'\bva mourir\b', r'\battentat imminent\b', r'\bpose une bombe\b',
    r'\bfollow me on\b', r'\bpromo code\b', r'\bfree money\b', r'\bbit\.ly\b'
]
REVIEW_KEYWORDS = [
    r'\barme à feu\b', r'\bkallach\b', r'\bkalach\b', r'\bterroriste\b', r'\bégorger\b'
]


def sanitize_input_text(raw_text: Optional[str], max_length: int = 500) -> str:
    """
    Sanitizes user-provided string against Cross-Site Scripting (XSS),
    HTML injection, and control characters.
    """
    if not raw_text:
        return ""
    
    # 1. Remove all control characters except standard whitespace
    cleaned = "".join(ch for ch in raw_text if ch.isprintable() or ch in "\n\r\t ")
    
    # 2. Strip HTML tags completely
    cleaned = HTML_TAG_REGEX.sub('', cleaned)
    
    # 3. Strip script event handlers and malicious URI schemes
    cleaned = SCRIPT_EVENTS_REGEX.sub('', cleaned)

    # 4. Neutralize SQL injection comment sequences
    cleaned = re.sub(r'--+', '', cleaned)
    cleaned = re.sub(r'/\*.*?\*/', '', cleaned)

    # 5. Standard HTML escape for any residual entities
    cleaned = html.escape(cleaned.strip())
    
    # 5. Enforce length cap
    return cleaned[:max_length]


def evaluate_content_moderation(title: str, description: Optional[str] = None) -> Tuple[str, str]:
    """
    Multi-stage automated content moderation pipeline.
    Returns (decision, reason):
      - "ALLOW": Passed all safety checks
      - "REVIEW": Flagged for moderator scrutiny (published with low trust)
      - "REJECT": Blocked immediately due to severe violation
    """
    combined = f"{title} {description or ''}".lower()

    # 1. Check for immediate rejection triggers (bomb threats, hate speech, spam links)
    for pattern in REJECT_KEYWORDS:
        if re.search(pattern, combined, re.IGNORECASE):
            return "REJECT", "Contenu identifié comme suspect ou non conforme aux règles de sécurité."

    # 2. Check for human-in-the-loop review triggers
    for pattern in REVIEW_KEYWORDS:
        if re.search(pattern, combined, re.IGNORECASE):
            return "REVIEW", "Termes sensibles détectés nécessitant une vérification complémentaire."

    return "ALLOW", "Contenu validé par la modération automatique."
