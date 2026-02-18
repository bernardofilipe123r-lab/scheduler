"""Models package — re-exports all models for backward compatibility."""

from app.models.base import Base
from app.models.jobs import GenerationJob
from app.models.scheduling import ScheduledReel
from app.models.brands import Brand
from app.models.auth import UserProfile
from app.models.analytics import (
    BrandAnalytics,
    AnalyticsRefreshLog,
    AnalyticsSnapshot,
    ContentHistory,
    PostPerformance,
    TrendingContent,
)
from app.models.youtube import YouTubeChannel
from app.models.logs import LogEntry
from app.models.config import AppSettings
from app.models.niche_config import NicheConfig

__all__ = [
    "Base",
    "GenerationJob",
    "ScheduledReel",
    "Brand",
    "UserProfile",
    "BrandAnalytics",
    "AnalyticsRefreshLog",
    "AnalyticsSnapshot",
    "ContentHistory",
    "PostPerformance",
    "TrendingContent",
    "YouTubeChannel",
    "LogEntry",
    "AppSettings",
    "NicheConfig",
]
