"""
API Usage Tracker — monitors usage across all external APIs.

Combines local DB tracking with live API endpoints:
  - SerpAPI: GET /account.json (free, no quota cost)
  - Tavily: GET /usage (dedicated endpoint)
  - Pexels: Response headers (cached from last request)
  - NewsData.io: Local tracking only (no API endpoint)
  - Gemini: Local tracking only (no API endpoint)
"""
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.api_usage import APIUsageLog

logger = logging.getLogger(__name__)

# Known free tier limits
API_LIMITS = {
    "serpapi": {"monthly": 250, "label": "SerpAPI (Google Images)"},
    "pexels": {"monthly": 20000, "hourly": 200, "label": "Pexels"},
    "newsdata": {"daily": 200, "label": "NewsData.io"},
    "tavily": {"monthly": 1000, "label": "Tavily"},
    "gemini": {"daily": 50, "label": "Gemini Imagen"},
}


class APIUsageTracker:
    """Tracks and reports API usage across all external services."""

    def __init__(self, db: Session):
        self.db = db
        # Cache Pexels rate limit headers from last response
        self._pexels_cache: dict = {}

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
        - limit: known free tier limit
        - period: "daily" or "monthly"
        - live: data from API's own usage endpoint (if available)
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

        # Enrich with live API data where available
        self._enrich_serpapi(summary)
        self._enrich_tavily(summary)
        self._enrich_pexels(summary)

        return summary

    def get_serpapi_usage(self) -> Optional[dict]:
        """Fetch live usage from SerpAPI account endpoint (free)."""
        api_key = os.environ.get("SERPAPI_KEY")
        if not api_key:
            return None

        try:
            resp = requests.get(
                "https://serpapi.com/account.json",
                params={"api_key": api_key},
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "searches_per_month": data.get("searches_per_month"),
                "total_searches_left": data.get("total_searches_left"),
                "this_month_usage": data.get("this_month_usage"),
                "last_hour_searches": data.get("last_hour_searches"),
                "rate_limit_per_hour": data.get("account_rate_limit_per_hour"),
            }
        except Exception as e:
            logger.warning(f"[APIUsageTracker] SerpAPI account fetch failed: {e}")
            return None

    def get_tavily_usage(self) -> Optional[dict]:
        """Fetch live usage from Tavily /usage endpoint."""
        api_key = os.environ.get("TAVILY_API_KEY")
        if not api_key:
            return None

        try:
            resp = requests.get(
                "https://api.tavily.com/usage",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            key_data = data.get("key", {})
            return {
                "usage": key_data.get("usage", 0),
                "limit": key_data.get("limit", 1000),
                "search_usage": key_data.get("search_usage", 0),
                "remaining": key_data.get("limit", 1000) - key_data.get("usage", 0),
            }
        except Exception as e:
            logger.warning(f"[APIUsageTracker] Tavily usage fetch failed: {e}")
            return None

    def update_pexels_cache(self, response_headers: dict):
        """Cache Pexels rate limit headers from a successful response."""
        if "X-Ratelimit-Limit" in response_headers:
            self._pexels_cache = {
                "limit": int(response_headers.get("X-Ratelimit-Limit", 20000)),
                "remaining": int(response_headers.get("X-Ratelimit-Remaining", 0)),
                "reset": response_headers.get("X-Ratelimit-Reset"),
                "cached_at": datetime.now(timezone.utc).isoformat(),
            }

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

    def _enrich_serpapi(self, summary: dict):
        """Add live SerpAPI data to summary."""
        live = self.get_serpapi_usage()
        if live and "serpapi" in summary:
            summary["serpapi"]["live"] = live
            if live.get("total_searches_left") is not None:
                summary["serpapi"]["remaining"] = live["total_searches_left"]
                summary["serpapi"]["limit"] = live.get("searches_per_month", 250)
                used = live.get("this_month_usage", 0)
                summary["serpapi"]["usage_pct"] = round(
                    (used / summary["serpapi"]["limit"] * 100)
                    if summary["serpapi"]["limit"]
                    else 0,
                    1,
                )

    def _enrich_tavily(self, summary: dict):
        """Add live Tavily data to summary."""
        live = self.get_tavily_usage()
        if live and "tavily" in summary:
            summary["tavily"]["live"] = live
            summary["tavily"]["remaining"] = live.get("remaining", 0)
            summary["tavily"]["limit"] = live.get("limit", 1000)
            summary["tavily"]["usage_pct"] = round(
                (live.get("usage", 0) / live.get("limit", 1000) * 100)
                if live.get("limit")
                else 0,
                1,
            )

    def _enrich_pexels(self, summary: dict):
        """Add cached Pexels rate limit data to summary."""
        if self._pexels_cache and "pexels" in summary:
            summary["pexels"]["live"] = self._pexels_cache
            if "remaining" in self._pexels_cache:
                summary["pexels"]["remaining"] = self._pexels_cache["remaining"]
