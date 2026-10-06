import os
import time
import random
import hashlib
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Dict, Deque, Tuple

# Rate limiting is SHARED through the database when a session is given (each Vercel
# serverless instance has its own memory, so in-memory counters alone were per-instance).
# The in-memory sliding windows below are the fallback when no DB session is available
# or the database is unreachable — never "no limit".
# Format: { client_fingerprint: deque([timestamp1, timestamp2, ...]) }
_CREATION_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)
_VOTE_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)
_READ_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)
_VOTE_IP_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)
_CREATION_IP_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)
_READ_IP_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)

# Rate limits configuration
CREATION_MAX_PER_WINDOW = 5
CREATION_WINDOW_SECONDS = 600  # 10 minutes

VOTE_MAX_PER_WINDOW = 25
VOTE_WINDOW_SECONDS = 600      # 10 minutes
VOTE_IP_MAX_PER_WINDOW = 60

READ_MAX_PER_WINDOW = 120
READ_WINDOW_SECONDS = 60       # 1 minute (Anti-scraping)

# Per-IP ceilings, independent of X-Device-Id (client-controlled, trivially rotated).
# Higher than the per-device limits so that users behind one NAT/CGNAT are not blocked.
CREATION_IP_MAX_PER_WINDOW = 20
READ_IP_MAX_PER_WINDOW = 600


def get_client_ip(request) -> str:
    """
    Real client IP. Behind Vercel's proxy, request.client.host is the proxy itself
    (every user would share ONE rate-limit bucket); Vercel overwrites X-Real-IP /
    X-Forwarded-For with the true client address, so they are trusted only there.
    """
    if os.getenv("VERCEL"):
        real_ip = (request.headers.get("x-real-ip") or "").strip()
        if real_ip:
            return real_ip
        forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        if forwarded:
            return forwarded
    return request.client.host if request.client else "127.0.0.1"


def hash_client_ip(client_ip: str) -> str:
    """Pseudonymized IP (never stored in clear)."""
    return hashlib.sha256(f"ip:{client_ip or 'unknown'}".encode("utf-8")).hexdigest()[:16]


def hash_device_id(device_id: str) -> str:
    """Pseudonymized device id, used as the voter key prefix (never stored in clear)."""
    return hashlib.sha256(f"device:{device_id}".encode("utf-8")).hexdigest()[:16]


def generate_client_fingerprint(client_ip: str, device_id: str = "") -> str:
    """
    Computes a pseudonymized composite fingerprint from IP and device token.
    Prevents single-IP bias while preventing device spoofing across networks.
    """
    raw = f"ip:{client_ip or 'unknown'}#dev:{device_id or 'anonymous'}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def _check_sliding_window(bucket: Deque[float], max_count: int, window_seconds: float) -> Tuple[bool, int]:
    now = time.time()
    cutoff = now - window_seconds

    # Evict expired timestamps
    while bucket and bucket[0] < cutoff:
        bucket.popleft()

    if len(bucket) >= max_count:
        retry_after = int(window_seconds - (now - bucket[0])) + 1
        return False, max(1, retry_after)

    bucket.append(now)
    return True, 0


# Rows older than this are purged opportunistically (longest window is 10 min)
_DB_HIT_RETENTION = timedelta(hours=1)
_DB_CLEANUP_PROBABILITY = 0.02


def _check_db_window(db, bucket_key: str, max_count: int, window_seconds: float) -> Tuple[bool, int]:
    """Sliding window stored in the `rate_limit_hits` table, shared by every instance."""
    from models import RateLimitHit

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoff = now - timedelta(seconds=window_seconds)
    hits = (
        db.query(RateLimitHit.created_at)
        .filter(RateLimitHit.bucket == bucket_key, RateLimitHit.created_at >= cutoff)
        .order_by(RateLimitHit.created_at.asc())
        .limit(max_count)
        .all()
    )
    if len(hits) >= max_count:
        oldest = hits[0][0]
        retry_after = int(window_seconds - (now - oldest).total_seconds()) + 1
        return False, max(1, retry_after)

    db.add(RateLimitHit(bucket=bucket_key, created_at=now))
    if random.random() < _DB_CLEANUP_PROBABILITY:
        db.query(RateLimitHit).filter(RateLimitHit.created_at < now - _DB_HIT_RETENTION).delete(
            synchronize_session=False
        )
    db.commit()
    return True, 0


def _check_quota(
    kind: str,
    key: str,
    memory_buckets: Dict[str, Deque[float]],
    max_count: int,
    window_seconds: float,
    db=None,
) -> Tuple[bool, int]:
    if db is not None:
        try:
            return _check_db_window(db, f"{kind}:{key}"[:120], max_count, window_seconds)
        except Exception as e:
            db.rollback()
            print(f"Rate limit DB fallback to memory ({kind}): {e}")
    return _check_sliding_window(memory_buckets[key], max_count, window_seconds)


def check_report_creation_quota(client_fingerprint: str, db=None, ip_hash: str = "") -> Tuple[bool, int]:
    """
    Verifies report creation quota (max 5 per 10 minutes per device, 20 per IP).
    Returns (is_allowed, retry_after_seconds).
    """
    if ip_hash:
        allowed, retry_after = _check_quota("create_ip", ip_hash, _CREATION_IP_BUCKETS,
                                            CREATION_IP_MAX_PER_WINDOW, CREATION_WINDOW_SECONDS, db)
        if not allowed:
            return allowed, retry_after
    return _check_quota("create", client_fingerprint, _CREATION_BUCKETS,
                        CREATION_MAX_PER_WINDOW, CREATION_WINDOW_SECONDS, db)


def check_vote_quota(client_fingerprint: str, db=None) -> Tuple[bool, int]:
    """
    Verifies incident voting quota (max 25 per 10 minutes).
    Returns (is_allowed, retry_after_seconds).
    """
    return _check_quota("vote", client_fingerprint, _VOTE_BUCKETS,
                        VOTE_MAX_PER_WINDOW, VOTE_WINDOW_SECONDS, db)


def check_vote_ip_quota(ip_hash: str, db=None) -> Tuple[bool, int]:
    """
    Per-IP vote quota, independent of X-Device-Id (which the client controls and can
    rotate at will to escape check_vote_quota). Generous enough for a shared NAT.
    """
    return _check_quota("vote_ip", ip_hash, _VOTE_IP_BUCKETS,
                        VOTE_IP_MAX_PER_WINDOW, VOTE_WINDOW_SECONDS, db)


def check_read_scraping_quota(client_fingerprint: str, db=None, ip_hash: str = "") -> Tuple[bool, int]:
    """
    Verifies mass reading / scraping quota (max 120 per minute per device, 600 per IP).
    Returns (is_allowed, retry_after_seconds).
    """
    if ip_hash:
        allowed, retry_after = _check_quota("read_ip", ip_hash, _READ_IP_BUCKETS,
                                            READ_IP_MAX_PER_WINDOW, READ_WINDOW_SECONDS, db)
        if not allowed:
            return allowed, retry_after
    return _check_quota("read", client_fingerprint, _READ_BUCKETS,
                        READ_MAX_PER_WINDOW, READ_WINDOW_SECONDS, db)


def calculate_trust_score(
    account_age_days: int = 0,
    past_valid_reports: int = 0,
    disputed_reports: int = 0,
    is_frequent_contributor: bool = False
) -> Tuple[float, str]:
    """
    Computes a multi-signal trust score between 0.0 and 1.0.
    Returns (score, tier):
      - 0.8 to 1.0: "RELIABLE"
      - 0.5 to 0.79: "ESTABLISHED"
      - 0.25 to 0.49: "NEW_USER"
      - < 0.25: "SUSPICIOUS"
    """
    score = 0.35  # Base score for new anonymous user

    if past_valid_reports > 0:
        score += min(0.35, past_valid_reports * 0.07)

    if is_frequent_contributor:
        score += 0.15

    if disputed_reports > 0:
        score -= min(0.40, disputed_reports * 0.15)

    clamped = max(0.05, min(1.0, score))

    if clamped >= 0.8:
        tier = "RELIABLE"
    elif clamped >= 0.5:
        tier = "ESTABLISHED"
    elif clamped >= 0.25:
        tier = "NEW_USER"
    else:
        tier = "SUSPICIOUS"

    return round(clamped, 2), tier
