"""Analytics, metrics collection, and trend scouting."""
from app.services.analytics.analytics_service import AnalyticsService  # noqa: F401
from app.services.analytics.metrics_collector import MetricsCollector, get_metrics_collector  # noqa: F401
from app.services.analytics.trend_scout import TrendScout, get_trend_scout  # noqa: F401
