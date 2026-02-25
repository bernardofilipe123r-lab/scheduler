"""
API Budget Manager — Meta Graph API rate limit management.

Budget allocation:
- 40% for own account monitoring (metrics collection)
- 30% for competitor scanning (business discovery)
- 20% for hashtag research
- 10% for reserve (burst capacity / historical mining)
"""
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import threading


class APIBudgetManager:
    """Manage Meta Graph API rate limits across all Toby operations.

    Thread-safe singleton per user_id.
    """

    MAX_CALLS_PER_HOUR = 200
    BUDGET_ALLOCATION = {
        "own_account": 0.40,   # 80 calls/hour
        "competitors": 0.30,   # 60 calls/hour
        "hashtags": 0.20,      # 40 calls/hour
        "reserve": 0.10,       # 20 calls/hour
    }

    MAX_UNIQUE_HASHTAGS_PER_WEEK = 30

    _instances: dict = {}
    _lock = threading.Lock()

    def __new__(cls, user_id: str):
        with cls._lock:
            if user_id not in cls._instances:
                instance = super().__new__(cls)
                instance._initialized = False
                cls._instances[user_id] = instance
            return cls._instances[user_id]

    def __init__(self, user_id: str):
        if self._initialized:
            return
        self.user_id = user_id
        self._call_log: list[tuple[datetime, str]] = []  # (timestamp, category)
        self._hashtag_log: dict[str, datetime] = {}  # hashtag → first_used
        self._log_lock = threading.Lock()
        self._initialized = True

    def can_call(self, category: str) -> bool:
        """Check if budget allows this API call category."""
        if category not in self.BUDGET_ALLOCATION:
            return False

        now = datetime.now(timezone.utc)
        hour_ago = now - timedelta(hours=1)

        with self._log_lock:
            # Count calls in last hour for this category
            category_calls = sum(
                1 for ts, cat in self._call_log
                if ts > hour_ago and cat == category
            )
            max_for_category = int(
                self.MAX_CALLS_PER_HOUR * self.BUDGET_ALLOCATION[category]
            )
            return category_calls < max_for_category

    def can_search_hashtag(self, hashtag: str) -> bool:
        """Check if we can search a new unique hashtag this week."""
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        with self._log_lock:
            recent_hashtags = {
                h for h, t in self._hashtag_log.items() if t > week_ago
            }
            if hashtag in recent_hashtags:
                return True  # Already searched — doesn't count as new
            return len(recent_hashtags) < self.MAX_UNIQUE_HASHTAGS_PER_WEEK

    def record_call(self, category: str):
        """Record an API call."""
        with self._log_lock:
            self._call_log.append((datetime.now(timezone.utc), category))
            # Prune old entries (keep only last 2 hours)
            cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
            self._call_log = [
                (ts, cat) for ts, cat in self._call_log if ts > cutoff
            ]

    def record_hashtag(self, hashtag: str):
        """Record a hashtag search."""
        with self._log_lock:
            if hashtag not in self._hashtag_log:
                self._hashtag_log[hashtag] = datetime.now(timezone.utc)

    def get_budget_status(self) -> dict:
        """Return current budget utilization for monitoring."""
        now = datetime.now(timezone.utc)
        hour_ago = now - timedelta(hours=1)

        with self._log_lock:
            recent = [(ts, cat) for ts, cat in self._call_log if ts > hour_ago]
            total = len(recent)

            per_category = defaultdict(int)
            for _, cat in recent:
                per_category[cat] += 1

            week_ago = now - timedelta(days=7)
            recent_hashtags = sum(1 for t in self._hashtag_log.values() if t > week_ago)

        return {
            "calls_last_hour": total,
            "max_per_hour": self.MAX_CALLS_PER_HOUR,
            "utilization_pct": round(total / self.MAX_CALLS_PER_HOUR * 100, 1),
            "per_category": dict(per_category),
            "category_limits": {
                cat: int(self.MAX_CALLS_PER_HOUR * alloc)
                for cat, alloc in self.BUDGET_ALLOCATION.items()
            },
            "hashtags_this_week": recent_hashtags,
            "max_hashtags_per_week": self.MAX_UNIQUE_HASHTAGS_PER_WEEK,
        }
