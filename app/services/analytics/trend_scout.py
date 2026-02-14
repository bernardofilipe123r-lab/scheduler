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

    # Post-focused competitor/inspiration accounts (carousel & educational content)
    # Avatar-aligned: women 45+, health, daily habits, mental health, wellness, longevity
    DEFAULT_POST_COMPETITORS: List[str] = [
        # === Health & Wellness (women 45+ focused) ===
        "drericberg",              # Dr. Eric Berg — health tips, huge following
        "doutorbarakat",           # Dr. Barakat — holistic health, lifestyle
        "consciousnesstruth",      # Consciousness & spiritual wellness
        "mindset.therapy",         # Mental health & mindset
        "mental.aspect",           # Mental wellness & daily habits
        "healf",                   # Holistic health & self-care
        # === Nutrition & Natural Health ===
        "thefarmacyreal",          # Natural remedies, plant-based healing
        "seedoilscout",            # Seed oil awareness, clean eating
        "eatinghealthyfeed",       # Healthy eating tips & nutrition
        "foodlty",                 # Food & healthy lifestyle
        "naturethecure",           # Natural cures & wellness
        # === Longevity & Anti-Aging ===
        "longevityxlab",           # Longevity science & tips
        "dr.longevity",            # Anti-aging & longevity
        "trillionairehealth",      # High-end health & longevity
        "healvex",                 # Healing & wellness
        # === Neuroscience & Brain Health ===
        "neurolab._",              # Neuroscience & brain health
        "neuroglobe",              # Brain science & mental clarity
        # === Lifestyle & Habits ===
        "demicstory",              # Personal health stories
        "betterme",                # Self-improvement & health
        "science",                 # Science-backed health
        "thuthlyrical",            # Wellness wisdom
        "manifestableglowup",     # Glow-up & self-care
        # === Wellness Brands & Supplements ===
        "laviahealthshop",         # Health products & tips
        "bioganancias",            # Bio-health & supplements
        # === Women's Health Specific ===
        "mentalmentevisionario",   # Mental health & vision
        "fitnessforallus",         # Accessible fitness for all ages
        "naturamatrix",            # Natural health matrix
        "holistichealthworld",     # Holistic health community
        "mylera_life",             # Lifestyle & wellness
        "naturalhealinglab",       # Natural healing approaches
    ]

    # Post-specific hashtags (carousel/educational content discovery)
    DEFAULT_POST_HASHTAGS = [
        "healthscience", "nutritionscience", "evidencebasedhealth",
        "longevityscience", "biohacking", "healthfacts",
        "nutritiontips", "wellnessjourney", "brainhealth",
        "guthealth", "hormonehealth", "antiaging",
    ]

    def __init__(self, user_id: str = None):
        # User context for tenant isolation (optional for background services)
        self._user_id = user_id
        # Use the first available brand token for API calls
        self._access_token = None
        self._ig_user_id = None
        self._load_credentials()

        # Load reel competitor list from env
        comp_env = os.getenv("TOBY_COMPETITOR_ACCOUNTS", "")
        if comp_env:
            self.competitors = [c.strip() for c in comp_env.split(",") if c.strip()]
        else:
            self.competitors = list(self.DEFAULT_COMPETITORS)

        # Load post competitor list from env
        post_comp_env = os.getenv("TOBY_POST_COMPETITOR_ACCOUNTS", "")
        if post_comp_env:
            self.post_competitors = [c.strip() for c in post_comp_env.split(",") if c.strip()]
        else:
            self.post_competitors = list(self.DEFAULT_POST_COMPETITORS)

        # Custom reel hashtags from env
        hashtag_env = os.getenv("TOBY_HASHTAGS", "")
        if hashtag_env:
            self.hashtags = [h.strip().lstrip("#") for h in hashtag_env.split(",") if h.strip()]
        else:
            self.hashtags = list(self.DEFAULT_HASHTAGS)

        # Custom post hashtags from env
        post_hashtag_env = os.getenv("TOBY_POST_HASHTAGS", "")
        if post_hashtag_env:
            self.post_hashtags = [h.strip().lstrip("#") for h in post_hashtag_env.split(",") if h.strip()]
        else:
            self.post_hashtags = list(self.DEFAULT_POST_HASHTAGS)

        total_comp = len(self.competitors) + len(self.post_competitors)
        total_hash = len(self.hashtags) + len(self.post_hashtags)
        print(f"✅ TrendScout initialized (reel competitors={len(self.competitors)}, post competitors={len(self.post_competitors)}, hashtags={total_hash})", flush=True)

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
            from app.services.agents.toby_daemon import toby_log

            # Step 1: Get hashtag ID
            toby_log("API: IG Hashtag Search", f"GET /{self._ig_user_id}/ig_hashtag_search?q={hashtag}", "🌐", "api")
            search_resp = requests.get(
                f"{self.BASE_URL}/{self._ig_user_id}/ig_hashtag_search",
                params={
                    "q": hashtag,
                    "access_token": self._access_token,
                },
                timeout=15,
            )

            if search_resp.status_code != 200:
                toby_log("API Error: Hashtag Search", f"HTTP {search_resp.status_code} for #{hashtag}", "❌", "api")
                return []

            hashtag_data = search_resp.json().get("data", [])
            if not hashtag_data:
                toby_log("Data: Hashtag", f"No hashtag_id found for #{hashtag}", "📊", "data")
                return []

            hashtag_id = hashtag_data[0]["id"]
            toby_log("API Response: Hashtag", f"HTTP 200 — #{hashtag} → hashtag_id={hashtag_id}", "✅", "api")

            # Step 2: Get top media
            toby_log("API: IG Top Media", f"GET /{hashtag_id}/top_media?user_id=...&limit={limit}", "🌐", "api")
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
                toby_log("API Error: Top Media", f"HTTP {media_resp.status_code} for #{hashtag}", "❌", "api")
                return []

            media_items = media_resp.json().get("data", [])
            toby_log("API Response: Top Media", f"HTTP 200 — {len(media_items)} media items for #{hashtag}", "✅", "api")
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
            from app.services.agents.toby_daemon import toby_log
            toby_log("API: IG Business Discovery", f"GET /{self._ig_user_id}?fields=business_discovery...username({username})&limit={limit}", "🌐", "api")

            resp = requests.get(
                f"{self.BASE_URL}/{self._ig_user_id}",
                params={
                    "fields": f"business_discovery.fields(username,media.limit({limit}){{id,caption,like_count,comments_count,timestamp,media_type}}).username({username})",
                    "access_token": self._access_token,
                },
                timeout=15,
            )

            if resp.status_code != 200:
                toby_log("API Error: Business Discovery", f"HTTP {resp.status_code} for @{username}", "❌", "api")
                return []

            bd = resp.json().get("business_discovery", {})
            media_data = bd.get("media", {}).get("data", [])
            source_username = bd.get("username", username)
            toby_log("API Response: Business Discovery", f"HTTP 200 — @{source_username}: {len(media_data)} media items", "✅", "api")

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

            from app.services.agents.toby_daemon import toby_log
            toby_log("Hashtag scan", f"Scanning {len(to_scan)} hashtags: {', '.join('#' + h for h in to_scan)} (skipping {len(scanned)} recently scanned)", "🔍", "detail")

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
                        user_id=self._user_id,
                    )
                    db.add(entry)
                    total_new += 1

                time.sleep(1)  # Rate limit respect

            db.commit()
            toby_log("Hashtag scan complete", f"{len(to_scan)} hashtags → {total_found} media found, {total_new} new stored in DB", "📊", "data")
            return {
                "hashtags_scanned": len(to_scan),
                "media_found": total_found,
                "new_stored": total_new,
            }
        except Exception as e:
            db.rollback()
            from app.services.agents.toby_daemon import toby_log
            toby_log("Error: Hashtag scan", f"scan_hashtags failed: {e}", "❌", "detail")
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
            from app.services.agents.toby_daemon import toby_log
            toby_log("Competitor scan", f"Scanning {len(self.competitors)} competitors: {', '.join('@' + c for c in self.competitors)}", "🔍", "detail")

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
                        user_id=self._user_id,
                    )
                    db.add(entry)
                    total_new += 1

                time.sleep(1)

            db.commit()
            toby_log("Competitor scan complete", f"{len(self.competitors)} competitors scanned, {total_new} new posts stored in DB", "📊", "data")
            return {
                "competitors_scanned": len(self.competitors),
                "new_stored": total_new,
            }
        except Exception as e:
            db.rollback()
            from app.services.agents.toby_daemon import toby_log
            toby_log("Error: Competitor scan", f"scan_competitors failed: {e}", "❌", "detail")
            return {"error": str(e)}
        finally:
            db.close()

    def scan_post_competitors(self, max_accounts: int = 8) -> Dict:
        """
        Scan post-focused competitor accounts (rotate through the 32-account list).

        Only scans max_accounts per run to stay within API rate limits.
        Picks accounts not recently scanned.
        """
        import random
        from app.db_connection import SessionLocal

        if not self.post_competitors:
            return {"competitors_scanned": 0, "new_stored": 0}

        db = SessionLocal()
        try:
            from app.services.agents.toby_daemon import toby_log

            # Find accounts not recently scanned (last 24h)
            recently_scanned = set()
            try:
                cutoff = datetime.utcnow() - timedelta(days=1)
                recent = (
                    db.query(TrendingContent.source_account)
                    .filter(
                        TrendingContent.discovery_method == "business_discovery",
                        TrendingContent.discovered_at >= cutoff,
                        TrendingContent.source_account.in_(self.post_competitors),
                    )
                    .distinct()
                    .all()
                )
                recently_scanned = {r.source_account for r in recent if r.source_account}
            except Exception:
                pass

            candidates = [c for c in self.post_competitors if c not in recently_scanned]
            if not candidates:
                candidates = list(self.post_competitors)

            random.shuffle(candidates)
            to_scan = candidates[:max_accounts]

            toby_log("Post competitor scan", f"Scanning {len(to_scan)}/{len(self.post_competitors)} post competitors: {', '.join('@' + c for c in to_scan)}", "🔍", "detail")

            total_new = 0
            for username in to_scan:
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
                        user_id=self._user_id,
                    )
                    db.add(entry)
                    total_new += 1

                time.sleep(1)

            db.commit()
            toby_log("Post competitor scan complete", f"{len(to_scan)} post competitors scanned, {total_new} new items stored", "📊", "data")
            return {
                "competitors_scanned": len(to_scan),
                "new_stored": total_new,
            }
        except Exception as e:
            db.rollback()
            from app.services.agents.toby_daemon import toby_log
            toby_log("Error: Post competitor scan", f"scan_post_competitors failed: {e}", "❌", "detail")
            return {"error": str(e)}
        finally:
            db.close()

    def scan_post_hashtags(self, max_hashtags: int = 4) -> Dict:
        """Scan post-specific hashtags for carousel/educational content."""
        import random
        from app.db_connection import SessionLocal

        db = SessionLocal()
        try:
            # Pick post hashtags not recently scanned
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

            candidates = [h for h in self.post_hashtags if h not in scanned]
            if not candidates:
                candidates = list(self.post_hashtags)

            random.shuffle(candidates)
            to_scan = candidates[:max_hashtags]

            from app.services.agents.toby_daemon import toby_log
            toby_log("Post hashtag scan", f"Scanning {len(to_scan)} post hashtags: {', '.join('#' + h for h in to_scan)}", "🔍", "detail")

            total_found = 0
            total_new = 0

            for hashtag in to_scan:
                items = self.search_hashtag(hashtag, limit=15)
                total_found += len(items)

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
                        source_account=item.get("source_account"),
                        caption=caption[:5000],
                        media_type=item.get("media_type"),
                        hashtags=hashtags_found[:30],
                        like_count=item.get("like_count", 0),
                        comments_count=item.get("comments_count", 0),
                        discovery_method="hashtag_search",
                        discovery_hashtag=hashtag,
                        media_timestamp=ts,
                        user_id=self._user_id,
                    )
                    db.add(entry)
                    total_new += 1

                time.sleep(1)

            db.commit()
            toby_log("Post hashtag scan complete", f"{len(to_scan)} hashtags → {total_found} media found, {total_new} new stored", "📊", "data")
            return {
                "hashtags_scanned": len(to_scan),
                "media_found": total_found,
                "new_stored": total_new,
            }
        except Exception as e:
            db.rollback()
            from app.services.agents.toby_daemon import toby_log
            toby_log("Error: Post hashtag scan", f"scan_post_hashtags failed: {e}", "❌", "detail")
            return {"error": str(e)}
        finally:
            db.close()

    # ──────────────────────────────────────────────────────────
    # BOOTSTRAP: SAFE INCREMENTAL SCAN (rate-limit friendly)
    # ──────────────────────────────────────────────────────────

    def bootstrap_scan_tick(self) -> Dict:
        """
        One safe bootstrap tick — called every 20 minutes during cold-start.

        Rate-limit strategy (Meta API friendly):
          - 1 own account (limit=25 posts)  → 1 API call
          - 1 competitor (limit=8 posts)    → 1 API call
          - 1 hashtag (limit=10 posts)      → 2 API calls (search + top_media)
          Total: ~4 API calls per tick = ~12/hour = well under Meta's 200/hour limit

        Rotates through accounts/competitors/hashtags across ticks so
        eventually all are covered without ever bursting.

        Returns summary of what was collected this tick.
        """
        from app.db_connection import SessionLocal
        import random

        db = SessionLocal()
        try:
            from app.services.agents.toby_daemon import toby_log

            results = {
                "own_account_new": 0,
                "competitor_new": 0,
                "hashtag_new": 0,
                "api_calls": 0,
            }

            # ── 1. One own account (deeper pull: limit=25) ──
            try:
                from app.models import Brand
                brands = db.query(Brand).filter(Brand.active == True).all()
                own_handles = []
                for b in brands:
                    handle = b.instagram_handle
                    if handle:
                        handle = handle.strip().lstrip("@")
                        if "/" in handle:
                            handle = handle.rsplit("/", 1)[-1]
                        if handle:
                            own_handles.append(handle)
            except Exception:
                own_handles = [
                    "thehealthycollege", "theholisticcollege",
                    "thelongevitycollege", "thewellbeingcollege",
                    "thevitalitycollege",
                ]

            if own_handles:
                # Pick account with fewest entries in DB (rotate naturally)
                handle_counts = {}
                for h in own_handles:
                    count = (
                        db.query(TrendingContent.id)
                        .filter(
                            TrendingContent.source_account == h,
                            TrendingContent.discovery_method == "own_account",
                        )
                        .count()
                    )
                    handle_counts[h] = count

                # Pick the least-scanned account
                target_handle = min(handle_counts, key=handle_counts.get)
                toby_log("Bootstrap: Own account",
                         f"Scanning @{target_handle} (has {handle_counts[target_handle]} entries, limit=25)",
                         "🪞", "detail")

                items = self.discover_competitor(target_handle, limit=25)
                results["api_calls"] += 1
                time.sleep(2)  # Respectful pause

                new_count = 0
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
                        source_account=target_handle,
                        caption=caption[:5000],
                        media_type=item.get("media_type"),
                        hashtags=hashtags_found[:30],
                        like_count=item.get("like_count", 0),
                        comments_count=item.get("comments_count", 0),
                        discovery_method="own_account",
                        media_timestamp=ts,
                        user_id=self._user_id,
                    )
                    db.add(entry)
                    new_count += 1

                results["own_account_new"] = new_count
                toby_log("Bootstrap: Own account done",
                         f"@{target_handle} → {new_count} new posts stored",
                         "🪞", "data")

            # ── 2. One competitor (limit=8) ──
            all_competitors = list(self.competitors) + list(self.post_competitors)
            if all_competitors:
                # Pick competitor with fewest entries
                comp_counts = {}
                for c in all_competitors:
                    count = (
                        db.query(TrendingContent.id)
                        .filter(
                            TrendingContent.source_account == c,
                            TrendingContent.discovery_method == "business_discovery",
                        )
                        .count()
                    )
                    comp_counts[c] = count

                target_comp = min(comp_counts, key=comp_counts.get)
                toby_log("Bootstrap: Competitor",
                         f"Scanning @{target_comp} (has {comp_counts[target_comp]} entries, limit=8)",
                         "🔍", "detail")

                items = self.discover_competitor(target_comp, limit=8)
                results["api_calls"] += 1
                time.sleep(2)  # Respectful pause

                new_count = 0
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
                        source_account=target_comp,
                        caption=caption[:5000],
                        media_type=item.get("media_type"),
                        hashtags=hashtags_found[:30],
                        like_count=item.get("like_count", 0),
                        comments_count=item.get("comments_count", 0),
                        discovery_method="business_discovery",
                        media_timestamp=ts,
                        user_id=self._user_id,
                    )
                    db.add(entry)
                    new_count += 1

                results["competitor_new"] = new_count
                toby_log("Bootstrap: Competitor done",
                         f"@{target_comp} → {new_count} new posts stored",
                         "🔍", "data")

            # ── 3. One hashtag (limit=10) ──
            all_hashtags = list(self.hashtags) + list(self.post_hashtags)
            if all_hashtags:
                # Pick hashtag not recently scanned (last 6h)
                recently = set()
                try:
                    cutoff = datetime.utcnow() - timedelta(hours=6)
                    recent = (
                        db.query(TrendingContent.discovery_hashtag)
                        .filter(
                            TrendingContent.discovery_method == "hashtag_search",
                            TrendingContent.discovered_at >= cutoff,
                        )
                        .distinct()
                        .all()
                    )
                    recently = {r.discovery_hashtag for r in recent if r.discovery_hashtag}
                except Exception:
                    pass

                candidates = [h for h in all_hashtags if h not in recently]
                if not candidates:
                    candidates = all_hashtags

                target_hashtag = random.choice(candidates)
                toby_log("Bootstrap: Hashtag",
                         f"Scanning #{target_hashtag} (limit=10)",
                         "🏷️", "detail")

                items = self.search_hashtag(target_hashtag, limit=10)
                results["api_calls"] += 2  # hashtag search = 2 API calls
                time.sleep(2)  # Respectful pause

                new_count = 0
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
                        source_account=item.get("source_account"),
                        caption=caption[:5000],
                        media_type=item.get("media_type"),
                        hashtags=hashtags_found[:30],
                        like_count=item.get("like_count", 0),
                        comments_count=item.get("comments_count", 0),
                        discovery_method="hashtag_search",
                        discovery_hashtag=target_hashtag,
                        media_timestamp=ts,
                        user_id=self._user_id,
                    )
                    db.add(entry)
                    new_count += 1

                results["hashtag_new"] = new_count
                toby_log("Bootstrap: Hashtag done",
                         f"#{target_hashtag} → {new_count} new posts stored",
                         "🏷️", "data")

            db.commit()

            total_new = results["own_account_new"] + results["competitor_new"] + results["hashtag_new"]
            toby_log("Bootstrap tick complete",
                     f"{total_new} new items stored ({results['api_calls']} API calls used)",
                     "🌱", "data")
            return results

        except Exception as e:
            db.rollback()
            from app.services.agents.toby_daemon import toby_log
            toby_log("Error: Bootstrap tick", f"bootstrap_scan_tick failed: {e}", "❌", "detail")
            return {"error": str(e)}
        finally:
            db.close()

    def get_bootstrap_maturity(self) -> Dict:
        """
        Check how much data the system has — used to decide if bootstrap
        should continue or auto-disable.

        Returns counts of own_account, competitor, hashtag entries.
        Pure DB query — zero API calls.
        """
        from app.db_connection import SessionLocal

        db = SessionLocal()
        try:
            own = db.query(TrendingContent.id).filter(
                TrendingContent.discovery_method == "own_account"
            ).count()
            competitor = db.query(TrendingContent.id).filter(
                TrendingContent.discovery_method == "business_discovery"
            ).count()
            hashtag = db.query(TrendingContent.id).filter(
                TrendingContent.discovery_method == "hashtag_search"
            ).count()

            # Also check post_performance count
            from app.models import PostPerformance
            perf_count = db.query(PostPerformance.id).filter(
                PostPerformance.performance_score.isnot(None)
            ).count()

            total = own + competitor + hashtag
            return {
                "own_account_entries": own,
                "competitor_entries": competitor,
                "hashtag_entries": hashtag,
                "total_trending": total,
                "tracked_performances": perf_count,
                "is_mature": (own >= 50 and total >= 150) or perf_count >= 100,
            }
        finally:
            db.close()

    # ──────────────────────────────────────────────────────────
    # GET TRENDING FOR TOBY
    # ──────────────────────────────────────────────────────────

    def scan_own_accounts(self) -> Dict:
        """
        Scan our own brand Instagram accounts to learn what OUR audience responds to.

        Pulls brand handles dynamically from the DB, so it auto-scales with new brands.
        Tags entries with discovery_method='own_account' so agents can distinguish
        own-audience data from competitor data.
        """
        from app.db_connection import SessionLocal

        db = SessionLocal()
        try:
            from app.services.agents.toby_daemon import toby_log

            # Dynamically load own handles from brands table
            try:
                from app.models import Brand
                brands = db.query(Brand).filter(Brand.active == True).all()
                own_handles = []
                for b in brands:
                    handle = b.instagram_handle
                    if handle:
                        # Strip @ and URL prefixes
                        handle = handle.strip().lstrip("@")
                        if "/" in handle:
                            handle = handle.rsplit("/", 1)[-1]
                        if handle:
                            own_handles.append(handle)
            except Exception:
                # Fallback hardcoded list
                own_handles = [
                    "thehealthycollege", "theholisticcollege",
                    "thelongevitycollege", "thewellbeingcollege",
                    "thevitalitycollege",
                ]

            if not own_handles:
                return {"own_accounts_scanned": 0, "new_stored": 0}

            toby_log("Own account scan",
                     f"Scanning {len(own_handles)} own accounts: {', '.join('@' + h for h in own_handles)}",
                     "🪞", "detail")

            total_new = 0
            for handle in own_handles:
                items = self.discover_competitor(handle, limit=10)
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
                        source_account=handle,
                        caption=caption[:5000],
                        media_type=item.get("media_type"),
                        hashtags=hashtags_found[:30],
                        like_count=item.get("like_count", 0),
                        comments_count=item.get("comments_count", 0),
                        discovery_method="own_account",
                        media_timestamp=ts,
                        user_id=self._user_id,
                    )
                    db.add(entry)
                    total_new += 1

                time.sleep(1)

            db.commit()
            toby_log("Own account scan complete",
                     f"{len(own_handles)} own accounts scanned, {total_new} new posts stored",
                     "🪞", "data")
            return {
                "own_accounts_scanned": len(own_handles),
                "new_stored": total_new,
            }
        except Exception as e:
            db.rollback()
            from app.services.agents.toby_daemon import toby_log
            toby_log("Error: Own account scan", f"scan_own_accounts failed: {e}", "❌", "detail")
            return {"error": str(e)}
        finally:
            db.close()

    def get_own_account_top_performers(
        self,
        min_likes: int = 50,
        limit: int = 10,
        content_type: str = None,
    ) -> List[Dict]:
        """
        Get top-performing content from OUR OWN accounts.

        Returns items sorted by engagement, filtered by content_type.
        Used by _gather_intelligence() to show agents what works with our audience.
        """
        from app.db_connection import SessionLocal
        from sqlalchemy import desc

        db = SessionLocal()
        try:
            query = (
                db.query(TrendingContent)
                .filter(
                    TrendingContent.discovery_method == "own_account",
                    TrendingContent.like_count >= min_likes,
                )
            )
            if content_type == "reel":
                query = query.filter(TrendingContent.media_type == "VIDEO")
            elif content_type == "post":
                query = query.filter(TrendingContent.media_type.in_(["CAROUSEL_ALBUM", "IMAGE"]))

            items = (
                query
                .order_by(desc(TrendingContent.like_count + TrendingContent.comments_count))
                .limit(limit)
                .all()
            )
            return [t.to_dict() for t in items]
        finally:
            db.close()

    def get_trending_for_toby(
        self,
        min_likes: int = 500,
        limit: int = 20,
        unused_only: bool = True,
        content_type: str = None,
    ) -> List[Dict]:
        """
        Get high-engagement trending content that Toby hasn't used yet.

        Args:
            content_type: Optional filter — "reel" (VIDEO only), "post" (CAROUSEL_ALBUM, IMAGE), or None (all)

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

            # Filter by media type based on content_type
            if content_type == "reel":
                query = query.filter(TrendingContent.media_type == "VIDEO")
            elif content_type == "post":
                query = query.filter(TrendingContent.media_type.in_(["CAROUSEL_ALBUM", "IMAGE"]))

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
