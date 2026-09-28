import logging
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any

# Configure standard security logger
logger = logging.getLogger("safety.security")
logger.setLevel(logging.INFO)

# Sanitize sensitive fields from being logged
FORBIDDEN_LOG_FIELDS = {
    "password", "token", "owner_token", "admin_key", "secret", "authorization",
    "exact_lat", "exact_lon", "email", "phone", "cookie"
}


def log_security_event(
    action: str,
    target_id: Optional[str] = None,
    client_fingerprint: Optional[str] = None,
    status: str = "SUCCESS",  # "SUCCESS" | "BLOCKED" | "WARNING" | "CRITICAL"
    metadata: Optional[Dict[str, Any]] = None
):
    """
    Emits a sanitized, non-PII security audit log entry.
    Strictly redacts sensitive credentials, raw GPS coordinates, and private tokens.
    """
    clean_meta = {}
    if metadata:
        for k, v in metadata.items():
            if k.lower() in FORBIDDEN_LOG_FIELDS:
                clean_meta[k] = "[REDACTED]"
            else:
                clean_meta[k] = v

    event = {
        "event_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": str(action),
        "target_id": str(target_id) if target_id is not None else None,
        "client_fingerprint": str(client_fingerprint) if client_fingerprint is not None else None,
        "status": str(status),
        "metadata": clean_meta
    }

    log_line = json.dumps(event, ensure_ascii=False, default=str)
    if status in ("BLOCKED", "WARNING"):
        logger.warning(log_line)
    elif status == "CRITICAL":
        logger.error(log_line)
    else:
        logger.info(log_line)
