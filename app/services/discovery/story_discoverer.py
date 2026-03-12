"""
Story Discovery — LEGACY module, external APIs removed.

Previously used NewsData.io, Tavily, and SerpAPI for story discovery.
These have been replaced by DeepSeek content generation from scratch.
This module is kept for backward compatibility but returns empty results.
"""
import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class RawStory:
    headline: str
    summary: str
    source_url: str
    source_name: str
    published_at: Optional[datetime] = None
    relevance_score: float = 0.5
    image_urls: list[str] = field(default_factory=list)


def compute_story_fingerprint(headline: str, key_facts: list[str]) -> str:
    """Compute dedup fingerprint from headline + key facts."""
    content = headline.lower().strip() + "|" + "|".join(
        sorted(f.lower().strip() for f in key_facts)
    )
    return hashlib.sha256(content.encode()).hexdigest()[:16]


# Category → query keyword mappings for story discovery
CATEGORY_KEYWORDS = {
    "power_moves": "bold business decision acquisition investment",
    "controversy": "controversial debate backlash criticism",
    "underdog": "underdog success story unexpected rise",
    "prediction": "prediction came true forecast fulfilled",
    "shocking_stat": "surprising statistic shocking number data",
    "human_moment": "vulnerable moment public emotion CEO",
    "industry_shift": "industry disruption revolution dead replaced",
    "failed_bet": "failure expensive mistake miscalculation loss",
    "hidden_cost": "hidden cost downside unexpected consequence",
    "scientific_breakthrough": "breakthrough discovery innovation scientific",
}


class StoryDiscoverer:
    """Legacy story discoverer — external APIs removed. Returns empty results."""

    def __init__(self, db=None):
        self.db = db

    def discover_stories(
        self,
        niche: str,
        category: str = "power_moves",
        recency: str = "mixed",
        count: int = 10,
    ) -> list[RawStory]:
        """
        Legacy method — returns empty list.

        Story discovery is now handled by DeepSeek content generation.
        """
        logger.info("[StoryDiscoverer] Legacy module — no external story APIs configured. Returning empty.")
        return []
