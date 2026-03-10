"""
API Usage Tracker — monitors usage across external APIs.

Tracks DeAPI (image generation) and DeepSeek (content generation).
"""
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.api_usage import APIUsageLog

logger = logging.getLogger(__name__)

# Known API limits
API_LIMITS = {
    "freepik": {"daily": 100, "label": "Freepik (Image Generation)"},
    "deapi": {"daily": 500, "label": "DeAPI (Image Fallback)"},
    "deepseek": {"daily": 1000, "label": "DeepSeek (Content)"},
}


class APIUsageTracker:
    """Tracks and reports API usage across external services."""

    def __init__(self, db: Session):
        self.db = db

    def record_call(self, api_name: str, endpoint: str = ""):
        """Record an API call in the database."""
        try:
            log = APIUsageLog(api_name=api_name, endpoint=endpoint)
            self.db.add(log)
            self.db.commit()
        except Exception:
            try:
                self.db.rollback()
            except Exception:
                pass

    def get_usage_summary(self) -> dict:
        """
        Get usage summary for all APIs.

        Returns dict with per-API usage info including:
        - local_count: calls recorded in our DB
        - limit: known limit
        - period: "daily"
        """
        summary = {}

        for api_name, info in API_LIMITS.items():
            period = "daily" if "daily" in info else "monthly"
            limit = info.get("daily") or info.get("monthly", 0)

            # Count local calls for the relevant period
            if period == "daily":
                since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0)
            else:
                since = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0)

            local_count = self._count_calls(api_name, since)

            summary[api_name] = {
                "label": info["label"],
                "local_count": local_count,
                "limit": limit,
                "period": period,
                "remaining": max(0, limit - local_count),
                "usage_pct": round((local_count / limit * 100) if limit else 0, 1),
            }

        return summary

    def _count_calls(self, api_name: str, since: datetime) -> int:
        """Count API calls in DB since a given time."""
        try:
            return (
                self.db.query(func.count(APIUsageLog.id))
                .filter(
                    APIUsageLog.api_name == api_name,
                    APIUsageLog.called_at >= since,
                )
                .scalar()
                or 0
            )
        except Exception:
            return 0
