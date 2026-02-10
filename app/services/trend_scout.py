"""
TrendScout — discovers trending health/wellness content on Instagram.

Uses two official Meta Graph API endpoints (no scraping, no ban risk):

1. Hashtag Search API
   GET /{ig_user_id}/ig_hashtag_search?q=health
   GET /{hashtag_id}/top_media?user_id={ig_user_id}&fields=...

2. Business Discovery API
   GET /{ig_user_id}?fields=business_discovery.fields(...).username(competitor)

Rate limits:
    - 30 unique hashtags per 7-day rolling window
    - Business Discovery: standard Graph API rate limits
"""

import os
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import requests

from app.models import TrendingContent


class TrendScout:
    """
    Discovers trending health/wellness content from external IG accounts.

    Feeds into Toby's 'trending' strategy — adapt viral external content
    to our brand template.
    """

    GRAPH_API_VERSION = "v21.0"
    BASE_URL = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

    # Health/wellness hashtags to monitor (curated for our niche)
    DEFAULT_HASHTAGS = [
        "healthyaging", "over40health", "wellnessover50",
        "womenshealth", "naturalhealth", "healthyliving",
        "holistichealth", "antiaging", "longevity",
        "healthtips", "wellnesstips", "guthealth",
    ]

    # Competitor/inspiration accounts to monitor (public business accounts)
    # These are top health/wellness pages with millions of combined followers
    DEFAULT_COMPETITORS: List[str] = [
        "naturamatrix",
        "holistichealthworld",
        "manifestableglowup",
        "mylera_life",
        "naturalhealinglab",
    ]

    def __init__(self):
        # Use the first available brand token for API calls
        self._access_token = None
        self._ig_user_id = None
        self._load_credentials()

        # Load competitor list from env
        comp_env = os.getenv("TOBY_COMPETITOR_ACCOUNTS", "")
        if comp_env:
            self.competitors = [c.strip() for c in comp_env.split(",") if c.strip()]
        else:
            self.competitors = list(self.DEFAULT_COMPETITORS)

        # Custom hashtags from env
        hashtag_env = os.getenv("TOBY_HASHTAGS", "")
        if hashtag_env:
            self.hashtags = [h.strip().lstrip("#") for h in hashtag_env.split(",") if h.strip()]
        else:
            self.hashtags = list(self.DEFAULT_HASHTAGS)

        print(f"✅ TrendScout initialized (hashtags={len(self.hashtags)}, competitors={len(self.competitors)})", flush=True)

    def _load_credentials(self):
        """Load an IG access token to use for API calls."""
        # Try healthycollege first (our main brand), then fallback
        for brand in ["healthycollege", "gymcollege", "vitalitycollege"]:
            token = os.getenv(f"{brand.upper()}_INSTAGRAM_ACCESS_TOKEN") or os.getenv(f"{brand.upper()}_META_ACCESS_TOKEN")
            account_id = os.getenv(f"{brand.upper()}_INSTAGRAM_BUSINESS_ACCOUNT_ID")
            if token and account_id:
                self._access_token = token
                self._ig_user_id = account_id
                return

        # Fallback to shared
        self._access_token = os.getenv("META_ACCESS_TOKEN")
        self._ig_user_id = os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID")

    # ──────────────────────────────────────────────────────────
    # HASHTAG SEARCH
    # ──────────────────────────────────────────────────────────

    def search_hashtag(self, hashtag: str, limit: int = 20) -> List[Dict]:
        """
        Search for top media under a hashtag.

        Steps:
        1. GET /{ig_user_id}/ig_hashtag_search?q={hashtag} → get hashtag_id
        2. GET /{hashtag_id}/top_media?user_id={ig_user_id}&fields=...
        """
        if not self._access_token or not self._ig_user_id:
            print("⚠️ TrendScout: No IG credentials available", flush=True)
            return []

        try:
            # Step 1: Get hashtag ID
            search_resp = requests.get(
                f"{self.BASE_URL}/{self._ig_user_id}/ig_hashtag_search",
                params={
                    "q": hashtag,
                    "access_token": self._access_token,
                },
                timeout=15,
            )

            if search_resp.status_code != 200:
                print(f"⚠️ Hashtag search error for #{hashtag}: {search_resp.status_code}", flush=True)
                return []

            hashtag_data = search_resp.json().get("data", [])
            if not hashtag_data:
                return []

            hashtag_id = hashtag_data[0]["id"]

            # Step 2: Get top media
            media_resp = requests.get(
                f"{self.BASE_URL}/{hashtag_id}/top_media",
                params={
                    "user_id": self._ig_user_id,
                    "fields": "id,caption,like_count,comments_count,timestamp,media_type,permalink",
                    "limit": limit,
                    "access_token": self._access_token,
                },
                timeout=15,
            )

            if media_resp.status_code != 200:
                print(f"⚠️ Top media error for #{hashtag}: {media_resp.status_code}", flush=True)
                return []

            media_items = media_resp.json().get("data", [])
            results = []
            for item in media_items:
                results.append({
                    "ig_media_id": item.get("id", ""),
                    "caption": item.get("caption", ""),
                    "like_count": item.get("like_count", 0),
                    "comments_count": item.get("comments_count", 0),
                    "media_type": item.get("media_type", ""),
                    "timestamp": item.get("timestamp", ""),
                    "permalink": item.get("permalink", ""),
                    "discovery_hashtag": hashtag,
                })
            return results

        except Exception as e:
            print(f"⚠️ TrendScout.search_hashtag error: {e}", flush=True)
            return []

    # ──────────────────────────────────────────────────────────
    # BUSINESS DISCOVERY (competitor monitoring)
    # ──────────────────────────────────────────────────────────

    def discover_competitor(self, username: str, limit: int = 10) -> List[Dict]:
        """
        Discover recent media from a public business account.

        GET /{ig_user_id}?fields=business_discovery.fields(
            media.limit(N){id,caption,like_count,comments_count,timestamp,media_type}
        ).username(competitor)
        """
        if not self._access_token or not self._ig_user_id:
            return []

        try:
            resp = requests.get(
                f"{self.BASE_URL}/{self._ig_user_id}",
                params={
                    "fields": f"business_discovery.fields(username,media.limit({limit}){{id,caption,like_count,comments_count,timestamp,media_type}}).username({username})",
                    "access_token": self._access_token,
                },
                timeout=15,
            )

            if resp.status_code != 200:
                print(f"⚠️ Business discovery error for @{username}: {resp.status_code}", flush=True)
                return []

            bd = resp.json().get("business_discovery", {})
            media_data = bd.get("media", {}).get("data", [])
            source_username = bd.get("username", username)

            results = []
            for item in media_data:
                results.append({
                    "ig_media_id": item.get("id", ""),
                    "source_account": source_username,
                    "caption": item.get("caption", ""),
                    "like_count": item.get("like_count", 0),
                    "comments_count": item.get("comments_count", 0),
                    "media_type": item.get("media_type", ""),
                    "timestamp": item.get("timestamp", ""),
                })
            return results

        except Exception as e:
            print(f"⚠️ TrendScout.discover_competitor error: {e}", flush=True)
            return []

    # ──────────────────────────────────────────────────────────
    # SCAN & STORE
    # ──────────────────────────────────────────────────────────

    def scan_hashtags(self, max_hashtags: int = 5) -> Dict:
        """
        Scan a batch of hashtags and store trending content.

        Limits to max_hashtags per run (30 unique per 7 days).
        Picks hashtags that haven't been searched recently.
        """
        from app.db_connection import SessionLocal
        import random

        db = SessionLocal()
        try:
            # Pick hashtags not recently scanned
            scanned = set()
            try:
                cutoff = datetime.utcnow() - timedelta(days=1)
                recent = (
                    db.query(TrendingContent.discovery_hashtag)
                    .filter(
                        TrendingContent.discovery_method == "hashtag_search",
                        TrendingContent.discovered_at >= cutoff,
                    )
                    .distinct()
                    .all()
                )
                scanned = {r.discovery_hashtag for r in recent if r.discovery_hashtag}
            except Exception:
                pass

            candidates = [h for h in self.hashtags if h not in scanned]
            if not candidates:
                candidates = self.hashtags  # All scanned recently, cycle again

            random.shuffle(candidates)
            to_scan = candidates[:max_hashtags]

            total_found = 0
            total_new = 0

            for hashtag in to_scan:
                items = self.search_hashtag(hashtag, limit=15)
                total_found += len(items)

                for item in items:
                    # Skip if already in DB
                    exists = (
                        db.query(TrendingContent.id)
                        .filter(TrendingContent.ig_media_id == item["ig_media_id"])
                        .first()
                    )
                    if exists:
                        continue

                    # Extract hashtags from caption
                    caption = item.get("caption", "") or ""
                    hashtags_found = [
                        w.lstrip("#").lower()
                        for w in caption.split()
                        if w.startswith("#")
                    ]

                    # Parse timestamp
                    ts = None
                    if item.get("timestamp"):
                        try:
                            ts = datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00"))
                        except (ValueError, TypeError):
                            pass

                    entry = TrendingContent(
                        ig_media_id=item["ig_media_id"],
                        source_account=item.get("source_account"),
                        caption=caption[:5000],  # Truncate very long captions
                        media_type=item.get("media_type"),
                        hashtags=hashtags_found[:30],
                        like_count=item.get("like_count", 0),
                        comments_count=item.get("comments_count", 0),
                        discovery_method="hashtag_search",
                        discovery_hashtag=hashtag,
                        media_timestamp=ts,
                    )
                    db.add(entry)
                    total_new += 1

                time.sleep(1)  # Rate limit respect

            db.commit()
            return {
                "hashtags_scanned": len(to_scan),
                "media_found": total_found,
                "new_stored": total_new,
            }
        except Exception as e:
            db.rollback()
            print(f"⚠️ TrendScout.scan_hashtags error: {e}", flush=True)
            return {"error": str(e)}
        finally:
            db.close()

    def scan_competitors(self) -> Dict:
        """Scan all configured competitor accounts."""
        from app.db_connection import SessionLocal

        if not self.competitors:
            return {"competitors_scanned": 0, "new_stored": 0}

        db = SessionLocal()
        try:
            total_new = 0
            for username in self.competitors:
                items = self.discover_competitor(username, limit=10)
                for item in items:
                    exists = (
                        db.query(TrendingContent.id)
                        .filter(TrendingContent.ig_media_id == item["ig_media_id"])
                        .first()
                    )
                    if exists:
                        continue

                    caption = item.get("caption", "") or ""
                    hashtags_found = [
                        w.lstrip("#").lower()
                        for w in caption.split()
                        if w.startswith("#")
                    ]

                    ts = None
                    if item.get("timestamp"):
                        try:
                            ts = datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00"))
                        except (ValueError, TypeError):
                            pass

                    entry = TrendingContent(
                        ig_media_id=item["ig_media_id"],
                        source_account=username,
                        caption=caption[:5000],
                        media_type=item.get("media_type"),
                        hashtags=hashtags_found[:30],
                        like_count=item.get("like_count", 0),
                        comments_count=item.get("comments_count", 0),
                        discovery_method="business_discovery",
                        media_timestamp=ts,
                    )
                    db.add(entry)
                    total_new += 1

                time.sleep(1)

            db.commit()
            return {
                "competitors_scanned": len(self.competitors),
                "new_stored": total_new,
            }
        except Exception as e:
            db.rollback()
            print(f"⚠️ TrendScout.scan_competitors error: {e}", flush=True)
            return {"error": str(e)}
        finally:
            db.close()

    # ──────────────────────────────────────────────────────────
    # GET TRENDING FOR TOBY
    # ──────────────────────────────────────────────────────────

    def get_trending_for_toby(
        self,
        min_likes: int = 500,
        limit: int = 20,
        unused_only: bool = True,
    ) -> List[Dict]:
        """
        Get high-engagement trending content that Toby hasn't used yet.

        Returns items sorted by engagement (like_count + comments_count desc).
        """
        from app.db_connection import SessionLocal
        from sqlalchemy import desc

        db = SessionLocal()
        try:
            query = (
                db.query(TrendingContent)
                .filter(TrendingContent.like_count >= min_likes)
            )
            if unused_only:
                query = query.filter(TrendingContent.used_for_proposal == False)

            trending = (
                query
                .order_by(desc(TrendingContent.like_count + TrendingContent.comments_count))
                .limit(limit)
                .all()
            )
            return [t.to_dict() for t in trending]
        finally:
            db.close()

    def mark_as_used(self, ig_media_id: str, proposal_id: str):
        """Mark a trending content item as used for a proposal."""
        from app.db_connection import SessionLocal

        db = SessionLocal()
        try:
            item = (
                db.query(TrendingContent)
                .filter(TrendingContent.ig_media_id == ig_media_id)
                .first()
            )
            if item:
                item.used_for_proposal = True
                item.proposal_id = proposal_id
                db.commit()
        except Exception as e:
            db.rollback()
            print(f"⚠️ TrendScout.mark_as_used error: {e}", flush=True)
        finally:
            db.close()


# ── Singleton ──

_scout: Optional[TrendScout] = None


def get_trend_scout() -> TrendScout:
    global _scout
    if _scout is None:
        _scout = TrendScout()
    return _scout
