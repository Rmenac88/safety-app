import os
import hmac
import hashlib
from typing import Optional

def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(
            f"{name} is not set. Define it as an environment variable "
            f"(locally in .env, in production in the Vercel project settings)."
        )
    return value


# Server-side persistent secret keys (NEVER exposed to frontend, client bundles, or logs)
SECURITY_SECRET_KEY = _require_env("SECURITY_SECRET_KEY")
ADMIN_API_KEY = _require_env("ADMIN_API_KEY")


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
