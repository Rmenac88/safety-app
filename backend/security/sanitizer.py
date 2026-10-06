import re
from typing import Optional

# Prohibited / Dangerous patterns (XSS, Script Injections, Data URIs)
HTML_TAG_REGEX = re.compile(r'<[^>]*?>', re.IGNORECASE)
SCRIPT_EVENTS_REGEX = re.compile(r'(on\w+\s*=|javascript:|data:text/html|vbscript:)', re.IGNORECASE)

# NB: content moderation lives in the `moderation` package (single source of truth).


def sanitize_input_text(raw_text: Optional[str], max_length: int = 500) -> str:
    """
    Sanitizes user-provided string against Cross-Site Scripting (XSS),
    HTML injection, and control characters.

    Returns PLAIN TEXT (not HTML-escaped): the frontend renders it through React,
    which escapes on output. Escaping here too stored "l&#x27;homme" in the database,
    displayed literally to users and broke apostrophes in street names and moderation.
    """
    if not raw_text:
        return ""

    # 1. Remove all control characters except standard whitespace
    cleaned = "".join(ch for ch in raw_text if ch.isprintable() or ch in "\n\r\t ")

    # 2. Strip HTML tags completely, then any leftover angle bracket (unclosed tag)
    cleaned = HTML_TAG_REGEX.sub('', cleaned)
    cleaned = cleaned.replace('<', '').replace('>', '')

    # 3. Strip script event handlers and malicious URI schemes
    cleaned = SCRIPT_EVENTS_REGEX.sub('', cleaned)

    # 4. Neutralize SQL injection comment sequences
    cleaned = re.sub(r'--+', '', cleaned)
    cleaned = re.sub(r'/\*.*?\*/', '', cleaned)

    # 5. Enforce length cap
    return cleaned.strip()[:max_length]
