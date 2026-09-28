import os
import hmac
import hashlib
from typing import Optional

# Server-side persistent secret keys (NEVER exposed to frontend, client bundles, or logs)
SECURITY_SECRET_KEY = os.getenv("SECURITY_SECRET_KEY", "safety_production_hmac_secret_key_v1_defense_in_depth")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "safety_super_admin_secret_key_2026_secured")


def generate_owner_token(incident_id: str) -> str:
    """
    Generates a cryptographically strong HMAC-SHA256 owner proof for an incident.
    Only the client who receives this upon report creation can delete or modify it.
    """
    if not incident_id:
        return ""
    key = SECURITY_SECRET_KEY.encode("utf-8")
    msg = f"owner_claim:{incident_id}".encode("utf-8")
    sig = hmac.new(key, msg, hashlib.sha256).hexdigest()
    return sig


def verify_owner_token(incident_id: str, token: Optional[str]) -> bool:
    """
    Validates ownership token using constant-time comparison to prevent timing attacks.
    """
    if not incident_id or not token:
        return False
    expected = generate_owner_token(incident_id)
    return hmac.compare_digest(token.strip(), expected)


def verify_admin_key(api_key: Optional[str]) -> bool:
    """
    Validates administrative access using constant-time comparison.
    """
    if not api_key:
        return False
    return hmac.compare_digest(api_key.strip(), ADMIN_API_KEY)
