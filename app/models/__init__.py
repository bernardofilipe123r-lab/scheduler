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
    AnalyticsAggregate,
    AudienceDemographics,
    TrendingContent,
)
from app.models.youtube import YouTubeChannel
from app.models.logs import LogEntry
from app.models.config import AppSettings
from app.models.niche_config import NicheConfig
from app.models.oauth_state import OAuthState
from app.models.toby import (
    TobyState,
    TobyExperiment,
    TobyStrategyScore,
    TobyActivityLog,
    TobyContentTag,
)
from app.models.toby_cognitive import (
    TobyEpisodicMemory,
    TobySemanticMemory,
    TobyProceduralMemory,
    TobyWorldModel,
    TobyStrategyCombos,
    TobyRawSignal,
    TobyMetaReport,
    TobyReasoningTrace,
)
from app.models.billing import BrandSubscription
from app.models.trending_music import TrendingMusic, TrendingMusicFetch
from app.models.text_video_design import TextVideoDesign
from app.models.story_pool import StoryPool
from app.models.api_usage import APIUsageLog

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
    "AnalyticsAggregate",
    "AudienceDemographics",
    "TrendingContent",
    "YouTubeChannel",
    "LogEntry",
    "AppSettings",
    "NicheConfig",
    "TobyState",
    "TobyExperiment",
    "TobyStrategyScore",
    "TobyActivityLog",
    "TobyContentTag",
    "OAuthState",
    "TobyEpisodicMemory",
    "TobySemanticMemory",
    "TobyProceduralMemory",
    "TobyWorldModel",
    "TobyStrategyCombos",
    "TobyRawSignal",
    "TobyMetaReport",
    "TobyReasoningTrace",
    "TrendingMusic",
    "TrendingMusicFetch",
    "TextVideoDesign",
    "StoryPool",
    "APIUsageLog",
]
