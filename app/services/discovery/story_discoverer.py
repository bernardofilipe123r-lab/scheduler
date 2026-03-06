"""
Story Discovery — finds viral-worthy stories from NewsData.io and Tavily.

Uses:
  - NewsData.io (200 credits/day free) for recent news
  - Tavily (1000 credits/month free) for famous/timeless stories
  - SerpAPI as backup search engine
"""
import hashlib
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import requests

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
    """Discovers viral-worthy stories from multiple web sources."""

    def __init__(self, db=None):
        self.db = db
        self._newsdata_key = os.environ.get("NEWSDATA_API_KEY")
        self._tavily_key = os.environ.get("TAVILY_API_KEY")
        self._serpapi_key = os.environ.get("SERPAPI_KEY")

    def discover_stories(
        self,
        niche: str,
        category: str = "power_moves",
        recency: str = "mixed",
        count: int = 10,
    ) -> list[RawStory]:
        """
        Search multiple sources and return ranked candidate stories.

        Args:
            niche: The broad topic area (e.g., "finance", "tech")
            category: Story archetype from CATEGORY_KEYWORDS
            recency: "recent" | "famous" | "mixed"
            count: Number of candidates to return
        """
        stories: list[RawStory] = []
        cat_keywords = CATEGORY_KEYWORDS.get(category, category)

        if recency in ("recent", "mixed"):
            stories.extend(self._search_newsdata(niche, cat_keywords, count))

        if recency in ("famous", "mixed"):
            stories.extend(self._search_tavily(niche, cat_keywords, count))

        # Deduplicate by fingerprint
        seen: set[str] = set()
        unique: list[RawStory] = []
        for s in stories:
            fp = compute_story_fingerprint(s.headline, [s.summary])
            if fp not in seen:
                seen.add(fp)
                unique.append(s)

        # Sort by relevance score, return top N
        unique.sort(key=lambda s: s.relevance_score, reverse=True)
        return unique[:count]

    def _search_newsdata(self, niche: str, keywords: str, count: int) -> list[RawStory]:
        """Search NewsData.io for recent news articles."""
        if not self._newsdata_key:
            logger.warning("[StoryDiscoverer] NEWSDATA_API_KEY not set, skipping")
            return []

        try:
            from newsdataapi import NewsDataApiClient

            client = NewsDataApiClient(apikey=self._newsdata_key)
            response = client.news_api(
                q=f"{niche} {keywords}",
                language="en",
                size=min(count, 10),
                timeframe=7,
            )

            self._record_api_call("newsdata", "news_api")

            results = response.get("results") or []
            stories = []
            for article in results:
                title = article.get("title") or ""
                desc = article.get("description") or article.get("content") or ""
                if not title:
                    continue

                image_urls = []
                if article.get("image_url"):
                    image_urls.append(article["image_url"])

                pub_date = None
                if article.get("pubDate"):
                    try:
                        pub_date = datetime.fromisoformat(
                            article["pubDate"].replace("Z", "+00:00")
                        )
                    except (ValueError, TypeError):
                        pass

                stories.append(
                    RawStory(
                        headline=title,
                        summary=desc[:500],
                        source_url=article.get("link") or "",
                        source_name=article.get("source_id") or "NewsData.io",
                        published_at=pub_date,
                        relevance_score=0.7,
                        image_urls=image_urls,
                    )
                )
            return stories

        except Exception as e:
            logger.error(f"[StoryDiscoverer] NewsData.io error: {e}")
            return []

    def _search_tavily(self, niche: str, keywords: str, count: int) -> list[RawStory]:
        """Search Tavily for famous/timeless stories."""
        if not self._tavily_key:
            logger.warning("[StoryDiscoverer] TAVILY_API_KEY not set, skipping")
            return []

        try:
            from tavily import TavilyClient

            client = TavilyClient(api_key=self._tavily_key)
            response = client.search(
                query=f"most interesting {niche} {keywords} facts stories viral",
                search_depth="basic",
                max_results=min(count, 10),
                include_answer=False,
            )

            self._record_api_call("tavily", "search")

            results = response.get("results") or []
            stories = []
            for result in results:
                title = result.get("title") or ""
                content = result.get("content") or ""
                if not title:
                    continue

                stories.append(
                    RawStory(
                        headline=title,
                        summary=content[:500],
                        source_url=result.get("url") or "",
                        source_name="Tavily",
                        relevance_score=result.get("score", 0.5),
                    )
                )
            return stories

        except Exception as e:
            logger.error(f"[StoryDiscoverer] Tavily error: {e}")
            return []

    def _search_serpapi(self, query: str, count: int = 5) -> list[RawStory]:
        """Backup search via SerpAPI Google Search."""
        if not self._serpapi_key:
            return []

        try:
            resp = requests.get(
                "https://serpapi.com/search",
                params={
                    "engine": "google",
                    "q": query,
                    "api_key": self._serpapi_key,
                    "num": count,
                },
                timeout=10,
            )
            resp.raise_for_status()

            self._record_api_call("serpapi", "search")

            data = resp.json()
            stories = []
            for result in data.get("organic_results", [])[:count]:
                stories.append(
                    RawStory(
                        headline=result.get("title", ""),
                        summary=result.get("snippet", ""),
                        source_url=result.get("link", ""),
                        source_name=result.get("source", "Google"),
                        relevance_score=0.5,
                    )
                )
            return stories

        except Exception as e:
            logger.error(f"[StoryDiscoverer] SerpAPI error: {e}")
            return []

    def _record_api_call(self, api_name: str, endpoint: str = ""):
        """Record API call for usage tracking (Section 39)."""
        if not self.db:
            return
        try:
            from app.models.api_usage import APIUsageLog

            log = APIUsageLog(api_name=api_name, endpoint=endpoint)
            self.db.add(log)
            self.db.commit()
        except Exception:
            try:
                self.db.rollback()
            except Exception:
                pass
