"""
Lightweight per-user rate limiter for expensive API endpoints.

Uses in-memory sliding-window counters. Resets on redeploy (acceptable
since Railway redeploys are infrequent and abuse windows are short).
"""
import time
import threading
from collections import defaultdict
from fastapi import HTTPException


class _SlidingWindow:
    """Thread-safe sliding-window rate counter."""

    def __init__(self):
        self._windows: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def check(self, key: str, max_requests: int, window_seconds: int):
        """Raise 429 if key exceeds max_requests within window_seconds."""
        now = time.time()
        cutoff = now - window_seconds
        with self._lock:
            stamps = self._windows[key]
            stamps[:] = [t for t in stamps if t > cutoff]
            if len(stamps) >= max_requests:
                raise HTTPException(
                    429,
                    f"Rate limit exceeded. Max {max_requests} requests per {window_seconds}s. Try again later.",
                )
            stamps.append(now)


# Singleton instance
_limiter = _SlidingWindow()


def rate_limit(user_id: str, endpoint: str, max_requests: int, window_seconds: int):
    """
    Check rate limit for a user+endpoint pair.

    Call at the top of any endpoint handler:
        rate_limit(user["id"], "ai-understanding", max_requests=5, window_seconds=60)
    """
    key = f"{user_id}:{endpoint}"
    _limiter.check(key, max_requests, window_seconds)
