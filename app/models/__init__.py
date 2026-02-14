"""Models package — re-exports all models for backward compatibility."""

from app.models.base import Base
from app.models.jobs import GenerationJob
from app.models.scheduling import ScheduledReel
from app.models.brands import Brand
from app.models.agents import AIAgent, AgentPerformance, AgentLearning, GenePool, TobyProposal
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
from app.models.logs import LogEntry, SystemDiagnostic
from app.models.config import MaestroConfig, AppSettings

__all__ = [
    "Base",
    "GenerationJob",
    "ScheduledReel",
    "Brand",
    "AIAgent",
    "AgentPerformance",
    "AgentLearning",
    "GenePool",
    "TobyProposal",
    "UserProfile",
    "BrandAnalytics",
    "AnalyticsRefreshLog",
    "AnalyticsSnapshot",
    "ContentHistory",
    "PostPerformance",
    "TrendingContent",
    "YouTubeChannel",
    "LogEntry",
    "SystemDiagnostic",
    "MaestroConfig",
    "AppSettings",
]
