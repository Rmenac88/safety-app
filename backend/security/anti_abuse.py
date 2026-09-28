import time
import hashlib
from collections import defaultdict, deque
from typing import Dict, Deque, Tuple

# Sliding window in-memory state (Thread-safe on single process / Serverless instance)
# Format: { client_fingerprint: deque([timestamp1, timestamp2, ...]) }
_CREATION_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)
_VOTE_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)
_READ_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)

# Rate limits configuration
CREATION_MAX_PER_WINDOW = 5
CREATION_WINDOW_SECONDS = 600  # 10 minutes

VOTE_MAX_PER_WINDOW = 25
VOTE_WINDOW_SECONDS = 600      # 10 minutes

READ_MAX_PER_WINDOW = 120
READ_WINDOW_SECONDS = 60       # 1 minute (Anti-scraping)


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


def check_report_creation_quota(client_fingerprint: str) -> Tuple[bool, int]:
    """
    Verifies report creation quota (max 5 per 10 minutes).
    Returns (is_allowed, retry_after_seconds).
    """
    bucket = _CREATION_BUCKETS[client_fingerprint]
    return _check_sliding_window(bucket, CREATION_MAX_PER_WINDOW, CREATION_WINDOW_SECONDS)


def check_vote_quota(client_fingerprint: str) -> Tuple[bool, int]:
    """
    Verifies incident voting quota (max 25 per 10 minutes).
    Returns (is_allowed, retry_after_seconds).
    """
    bucket = _VOTE_BUCKETS[client_fingerprint]
    return _check_sliding_window(bucket, VOTE_MAX_PER_WINDOW, VOTE_WINDOW_SECONDS)


def check_read_scraping_quota(client_fingerprint: str) -> Tuple[bool, int]:
    """
    Verifies mass reading / scraping quota (max 120 per minute).
    Returns (is_allowed, retry_after_seconds).
    """
    bucket = _READ_BUCKETS[client_fingerprint]
    return _check_sliding_window(bucket, READ_MAX_PER_WINDOW, READ_WINDOW_SECONDS)


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
