"""
MetricsCollector — fetches per-post Instagram metrics via Graph API.

Polls our published posts at 24h, 48h, and 7d after publishing to
build a performance history.  Used by AI agents to identify winners
and underperformers.

Architecture:
    - Reads published post IDs from ScheduledReel.extra_data["post_ids"]
    - Calls IG Graph API for per-media insights (plays, reach, likes, saves, shares)
    - Stores / updates PostPerformance rows
    - Computes engagement_rate and performance_score

Endpoints used (official Meta Graph API):
    GET /{media_id}?fields=like_count,comments_count,timestamp
    GET /{media_id}/insights?metric=plays,reach,saved,shares
"""

import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import requests

from app.models import PostPerformance, ContentHistory


# ── Metric check windows ──
METRIC_WINDOWS = {
    "24h": timedelta(hours=24),
    "48h": timedelta(hours=48),
    "7d":  timedelta(days=7),
}


def _log(action: str, detail: str = "", emoji: str = "🤖", level: str = "detail"):
    """Log metrics activity."""
    print(f"   [METRICS] {emoji} {action} — {detail}", flush=True)


class MetricsCollector:
    """
    Fetches per-post metrics from the Instagram Graph API and
    stores them in the post_performance table.
    """

    GRAPH_API_VERSION = "v21.0"
    BASE_URL = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

    def __init__(self):
        self._brand_tokens: Dict[str, Dict] = {}
        self._load_brand_credentials()
        print(f"✅ MetricsCollector initialized ({len(self._brand_tokens)} brands)", flush=True)

    # ──────────────────────────────────────────────────────────
    # CREDENTIAL LOADING
    # ──────────────────────────────────────────────────────────

    def _load_brand_credentials(self):
        """Load IG access tokens per brand from the database brands table."""
        from app.services.brands.resolver import brand_resolver

        for brand_id in brand_resolver.get_all_brand_ids():
            brand = brand_resolver.get_brand(brand_id)
            if not brand:
                continue
            token = brand.meta_access_token or brand.instagram_access_token
            account_id = brand.instagram_business_account_id
            if token and account_id:
                self._brand_tokens[brand_id] = {
                    "token": token,
                    "account_id": account_id,
                }

    def _get_token_for_brand(self, brand: str) -> Optional[str]:
        creds = self._brand_tokens.get(brand) or self._brand_tokens.get("default")
        return creds["token"] if creds else None

    def _get_account_id_for_brand(self, brand: str) -> Optional[str]:
        creds = self._brand_tokens.get(brand) or self._brand_tokens.get("default")
        return creds["account_id"] if creds else None

    # ──────────────────────────────────────────────────────────
    # FETCH METRICS FOR A SINGLE MEDIA
    # ──────────────────────────────────────────────────────────

    def fetch_media_metrics(self, ig_media_id: str, access_token: str) -> Optional[Dict]:
        """
        Fetch metrics for a single Instagram media item.

        Returns dict with: views, likes, comments, saves, shares, reach
        """
        metrics = {
            "views": 0, "likes": 0, "comments": 0,
            "saves": 0, "shares": 0, "reach": 0,
        }

        try:
            # 1. Basic fields (likes, comments)
            basic_url = f"{self.BASE_URL}/{ig_media_id}"
            _log("API: IG Media", f"GET /{ig_media_id}?fields=like_count,comments_count,timestamp,media_type", "🌐", "api")
            basic_resp = requests.get(basic_url, params={
                "fields": "like_count,comments_count,timestamp,media_type",
                "access_token": access_token,
            }, timeout=15)

            if basic_resp.status_code == 200:
                data = basic_resp.json()
                metrics["likes"] = data.get("like_count", 0)
                metrics["comments"] = data.get("comments_count", 0)
                _log("API Response: Media", f"HTTP 200 — {metrics['likes']} likes, {metrics['comments']} comments", "✅", "api")
            else:
                _log("API Error: Media", f"HTTP {basic_resp.status_code} for media {ig_media_id}", "❌", "api")
                return None

            # 2. Insights (plays, reach, saved, shares)
            insights_url = f"{self.BASE_URL}/{ig_media_id}/insights"
            _log("API: IG Insights", f"GET /{ig_media_id}/insights?metric=plays,reach,saved,shares", "🌐", "api")
            insights_resp = requests.get(insights_url, params={
                "metric": "plays,reach,saved,shares",
                "access_token": access_token,
            }, timeout=15)

            if insights_resp.status_code == 200:
                insights_data = insights_resp.json().get("data", [])
                for item in insights_data:
                    name = item.get("name", "")
                    # Values can be nested in different formats
                    values = item.get("values", [{}])
                    value = values[0].get("value", 0) if values else 0

                    if name == "plays":
                        metrics["views"] = value
                    elif name == "reach":
                        metrics["reach"] = value
                    elif name == "saved":
                        metrics["saves"] = value
                    elif name == "shares":
                        metrics["shares"] = value
                _log("API Response: Insights", f"HTTP 200 — {metrics['views']} views, {metrics['reach']} reach, {metrics['saves']} saves, {metrics['shares']} shares", "✅", "api")
            else:
                _log("API Fallback: Insights", f"HTTP {insights_resp.status_code} for full insights — trying individual metrics", "⚠️", "api")
                # Fallback: try plays only (some media types don't support all metrics)
                fallback_resp = requests.get(insights_url, params={
                    "metric": "plays",
                    "access_token": access_token,
                }, timeout=15)
                if fallback_resp.status_code == 200:
                    fb_data = fallback_resp.json().get("data", [])
                    for item in fb_data:
                        if item.get("name") == "plays":
                            values = item.get("values", [{}])
                            metrics["views"] = values[0].get("value", 0) if values else 0

                # Try reach separately
                reach_resp = requests.get(insights_url, params={
                    "metric": "reach",
                    "access_token": access_token,
                }, timeout=15)
                if reach_resp.status_code == 200:
                    r_data = reach_resp.json().get("data", [])
                    for item in r_data:
                        if item.get("name") == "reach":
                            values = item.get("values", [{}])
                            metrics["reach"] = values[0].get("value", 0) if values else 0
                _log("API Fallback Result", f"Partial metrics: {metrics['views']} views, {metrics['reach']} reach", "📊", "api")

            return metrics

        except Exception as e:
            _log("Error: Metrics API", f"fetch_media_metrics failed for {ig_media_id}: {e}", "❌", "api")
            return None

    # ──────────────────────────────────────────────────────────
    # COMPUTE SCORES
    # ──────────────────────────────────────────────────────────

    @staticmethod
    def compute_engagement_rate(metrics: Dict) -> float:
        """Engagement rate = (likes + saves + shares + comments) / reach."""
        reach = metrics.get("reach", 0)
        if reach == 0:
            return 0.0
        engagement = (
            metrics.get("likes", 0)
            + metrics.get("saves", 0)
            + metrics.get("shares", 0)
            + metrics.get("comments", 0)
        )
        return round(engagement / reach * 100, 2)

    @staticmethod
    def compute_performance_score(metrics: Dict) -> float:
        """
        Composite performance score (0-100).

        Weighted formula:
        - Views (30%) — raw reach/virality signal
        - Engagement rate (30%) — quality of audience response
        - Saves (20%) — strongest intent signal (people save for later)
        - Shares (20%) — organic amplification signal

        Scores are normalised against baseline thresholds derived from
        typical health/wellness reel performance.
        """
        views = metrics.get("views", 0)
        saves = metrics.get("saves", 0)
        shares = metrics.get("shares", 0)
        reach = metrics.get("reach", 0)

        # Normalise each to 0-100 against baselines
        # These baselines are conservative; they'll be tuned after we collect real data
        views_score = min(100, (views / 5000) * 100)     # 5k views = 100
        saves_score = min(100, (saves / 100) * 100)      # 100 saves = 100
        shares_score = min(100, (shares / 50) * 100)     # 50 shares = 100

        engagement = 0.0
        if reach > 0:
            eng_rate = (metrics.get("likes", 0) + saves + shares + metrics.get("comments", 0)) / reach
            engagement = min(100, eng_rate * 100 * 10)  # 10% engagement = 100

        score = (
            views_score * 0.30
            + engagement * 0.30
            + saves_score * 0.20
            + shares_score * 0.20
        )
        return round(score, 1)

    # ──────────────────────────────────────────────────────────
    # COLLECT METRICS FOR ALL PUBLISHED POSTS
    # ──────────────────────────────────────────────────────────

    def collect_for_brand(self, brand: str, days_back: int = 14) -> Dict:
        """
        Fetch metrics for all published posts of a brand from the last N days.

        1. Query ScheduledReel for published items with post_ids
        2. For each ig_media_id, fetch metrics if not recently updated
        3. Upsert into PostPerformance
        """
        from app.db_connection import SessionLocal
        from app.models import ScheduledReel

        token = self._get_token_for_brand(brand)
        if not token:
            return {"error": f"No access token for brand {brand}", "updated": 0}

        db = SessionLocal()
        try:
            _log("Metrics: Brand", f"Collecting metrics for {brand} (last {days_back} days)", "📊", "detail")

            cutoff = datetime.utcnow() - timedelta(days=days_back)
            published = (
                db.query(ScheduledReel)
                .filter(
                    ScheduledReel.user_id == brand,
                    ScheduledReel.status.in_(["published", "partial"]),
                    ScheduledReel.published_at >= cutoff,
                )
                .all()
            )
            _log("Data: Published posts", f"{len(published)} published posts found for {brand}", "📊", "data")

            updated = 0
            errors = 0

            for sched in published:
                extra = sched.extra_data or {}
                post_ids = extra.get("post_ids", {})
                ig_media_id = post_ids.get("instagram")

                if not ig_media_id:
                    continue

                # Check if we already have recent metrics
                existing = (
                    db.query(PostPerformance)
                    .filter(PostPerformance.ig_media_id == ig_media_id)
                    .first()
                )

                # Skip if metrics were fetched less than 6 hours ago
                if existing and existing.metrics_fetched_at:
                    age = datetime.utcnow() - existing.metrics_fetched_at
                    if age < timedelta(hours=6):
                        continue

                # Fetch fresh metrics
                raw = self.fetch_media_metrics(ig_media_id, token)
                if not raw:
                    errors += 1
                    continue

                engagement_rate = self.compute_engagement_rate(raw)
                performance_score = self.compute_performance_score(raw)
                now = datetime.utcnow()

                if existing:
                    # Update existing record
                    existing.views = raw["views"]
                    existing.likes = raw["likes"]
                    existing.comments = raw["comments"]
                    existing.saves = raw["saves"]
                    existing.shares = raw["shares"]
                    existing.reach = raw["reach"]
                    existing.engagement_rate = engagement_rate
                    existing.performance_score = performance_score
                    existing.metrics_fetched_at = now

                    # Track metric windows
                    published_at = existing.published_at or sched.published_at
                    if published_at:
                        age = now - published_at
                        if age >= timedelta(hours=24) and not existing.metrics_24h_at:
                            existing.metrics_24h_at = now
                        if age >= timedelta(hours=48) and not existing.metrics_48h_at:
                            existing.metrics_48h_at = now
                        if age >= timedelta(days=7) and not existing.metrics_7d_at:
                            existing.metrics_7d_at = now
                else:
                    # Get title metadata from the scheduled reel
                    title = ""
                    caption = ""
                    topic_bucket = None
                    if extra.get("brand_data") and isinstance(extra["brand_data"], dict):
                        title = extra["brand_data"].get("title", sched.title or "")
                        caption = extra["brand_data"].get("caption", "")
                    else:
                        title = sched.title or ""

                    if title:
                        topic_bucket = ContentHistory.classify_topic_bucket(title)

                    new_perf = PostPerformance(
                        ig_media_id=ig_media_id,
                        fb_post_id=post_ids.get("facebook"),
                        brand=brand,
                        content_type=getattr(sched, "content_type", "reel") or "reel",
                        schedule_id=sched.schedule_id,
                        title=title,
                        caption=caption,
                        topic_bucket=topic_bucket,
                        keyword_hash=ContentHistory.compute_keyword_hash(title) if title else None,
                        views=raw["views"],
                        likes=raw["likes"],
                        comments=raw["comments"],
                        saves=raw["saves"],
                        shares=raw["shares"],
                        reach=raw["reach"],
                        engagement_rate=engagement_rate,
                        performance_score=performance_score,
                        published_at=sched.published_at,
                        metrics_fetched_at=now,
                        user_id=getattr(sched, "user_id", None),
                    )
                    db.add(new_perf)

                updated += 1
                # Respect rate limits
                time.sleep(0.5)

            db.commit()

            # Update percentile ranks
            self._update_percentile_ranks(db, brand)
            _log("Metrics: Done", f"{brand}: {updated} posts updated, {errors} errors", "📊", "data")

            return {"brand": brand, "updated": updated, "errors": errors}

        except Exception as e:
            db.rollback()
            _log("Error: Metrics", f"collect_for_brand failed for {brand}: {e}", "❌", "detail")
            return {"error": str(e), "updated": 0}
        finally:
            db.close()

    def collect_all_brands(self, days_back: int = 14) -> List[Dict]:
        """Collect metrics for all brands."""
        _log("Metrics collection", f"Starting metrics collection for {len(self._brand_tokens) - (1 if 'default' in self._brand_tokens else 0)} brands", "📊", "detail")

        results = []
        for brand in self._brand_tokens:
            if brand == "default":
                continue
            result = self.collect_for_brand(brand, days_back)
            results.append(result)

        total_updated = sum(r.get("updated", 0) for r in results)
        _log("Metrics complete", f"All brands done — {total_updated} total post metrics updated", "📊", "data")
        return results

    def _update_percentile_ranks(self, db, brand: str):
        """Update percentile ranks for all posts of a brand."""
        try:
            from sqlalchemy import func

            posts = (
                db.query(PostPerformance)
                .filter(
                    PostPerformance.brand == brand,
                    PostPerformance.performance_score.isnot(None),
                )
                .order_by(PostPerformance.performance_score.asc())
                .all()
            )

            total = len(posts)
            if total == 0:
                return

            for i, post in enumerate(posts):
                post.percentile_rank = round((i / total) * 100, 1)

            db.commit()
        except Exception as e:
            print(f"⚠️ Percentile rank update error: {e}", flush=True)

    # ──────────────────────────────────────────────────────────
    # QUERY HELPERS (used by AI agents)
    # ──────────────────────────────────────────────────────────

    def get_top_performers(
        self,
        content_type: str = "reel",
        limit: int = 10,
        brand: str = None,
        min_age_hours: int = 24,
    ) -> List[Dict]:
        """Get top-performing posts by performance_score."""
        from app.db_connection import SessionLocal
        from sqlalchemy import desc

        db = SessionLocal()
        try:
            query = (
                db.query(PostPerformance)
                .filter(
                    PostPerformance.content_type == content_type,
                    PostPerformance.performance_score.isnot(None),
                )
            )
            if brand:
                query = query.filter(PostPerformance.brand == brand)

            if min_age_hours > 0:
                cutoff = datetime.utcnow() - timedelta(hours=min_age_hours)
                query = query.filter(PostPerformance.published_at <= cutoff)

            posts = (
                query
                .order_by(desc(PostPerformance.performance_score))
                .limit(limit)
                .all()
            )
            return [p.to_dict() for p in posts]
        finally:
            db.close()

    def get_underperformers(
        self,
        content_type: str = "reel",
        limit: int = 10,
        brand: str = None,
        max_percentile: float = 30.0,
    ) -> List[Dict]:
        """Get posts below a percentile threshold — candidates for iteration."""
        from app.db_connection import SessionLocal

        db = SessionLocal()
        try:
            query = (
                db.query(PostPerformance)
                .filter(
                    PostPerformance.content_type == content_type,
                    PostPerformance.percentile_rank.isnot(None),
                    PostPerformance.percentile_rank <= max_percentile,
                    PostPerformance.performance_score.isnot(None),
                )
            )
            if brand:
                query = query.filter(PostPerformance.brand == brand)

            posts = (
                query
                .order_by(PostPerformance.percentile_rank.asc())
                .limit(limit)
                .all()
            )
            return [p.to_dict() for p in posts]
        finally:
            db.close()

    def get_performance_summary(self, brand: str = None) -> Dict:
        """Get overall performance stats."""
        from app.db_connection import SessionLocal
        from sqlalchemy import func

        db = SessionLocal()
        try:
            query = db.query(PostPerformance).filter(
                PostPerformance.performance_score.isnot(None)
            )
            if brand:
                query = query.filter(PostPerformance.brand == brand)

            total = query.count()
            if total == 0:
                return {"total_tracked": 0}

            avg_score = query.with_entities(func.avg(PostPerformance.performance_score)).scalar()
            avg_views = query.with_entities(func.avg(PostPerformance.views)).scalar()
            avg_engagement = query.with_entities(func.avg(PostPerformance.engagement_rate)).scalar()
            max_score = query.with_entities(func.max(PostPerformance.performance_score)).scalar()

            # Top topic buckets
            topic_stats = (
                query.with_entities(
                    PostPerformance.topic_bucket,
                    func.avg(PostPerformance.performance_score).label("avg_score"),
                    func.count(PostPerformance.id).label("count"),
                )
                .filter(PostPerformance.topic_bucket.isnot(None))
                .group_by(PostPerformance.topic_bucket)
                .order_by(func.avg(PostPerformance.performance_score).desc())
                .all()
            )

            return {
                "total_tracked": total,
                "avg_performance_score": round(avg_score, 1) if avg_score else 0,
                "avg_views": int(avg_views) if avg_views else 0,
                "avg_engagement_rate": round(avg_engagement, 2) if avg_engagement else 0,
                "best_score": round(max_score, 1) if max_score else 0,
                "topic_rankings": [
                    {"topic": t.topic_bucket, "avg_score": round(t.avg_score, 1), "count": t.count}
                    for t in topic_stats
                ],
            }
        finally:
            db.close()

    # ──────────────────────────────────────────────────────────
    # CROSS-BRAND INTELLIGENCE (pure DB — zero API calls)
    # ──────────────────────────────────────────────────────────

    def get_cross_brand_top_performers(
        self,
        content_type: str = "reel",
        limit: int = 15,
        min_age_hours: int = 24,
    ) -> List[Dict]:
        """
        Get top-performing content across ALL brands, sorted by performance_score.

        This gives agents a portfolio-wide view of what topics, hooks, and
        structures work best — crucial for new agents or cold-start brands
        that have no brand-specific data yet.

        Pure DB query — zero Meta API calls.
        """
        from app.db_connection import SessionLocal
        from sqlalchemy import desc

        db = SessionLocal()
        try:
            query = (
                db.query(PostPerformance)
                .filter(
                    PostPerformance.content_type == content_type,
                    PostPerformance.performance_score.isnot(None),
                    PostPerformance.performance_score > 0,
                )
            )

            if min_age_hours > 0:
                cutoff = datetime.utcnow() - timedelta(hours=min_age_hours)
                query = query.filter(PostPerformance.published_at <= cutoff)

            posts = (
                query
                .order_by(desc(PostPerformance.performance_score))
                .limit(limit)
                .all()
            )
            return [p.to_dict() for p in posts]
        finally:
            db.close()

    def get_cross_brand_summary(self) -> Dict:
        """
        Portfolio-wide performance summary — what works across all brands.

        Returns best topics, avg scores, total tracked posts, and
        topic-level breakdowns without filtering by brand.
        Pure DB query — zero Meta API calls.
        """
        from app.db_connection import SessionLocal
        from sqlalchemy import func

        db = SessionLocal()
        try:
            total = db.query(PostPerformance).filter(
                PostPerformance.performance_score.isnot(None)
            ).count()

            if total == 0:
                return {"total_tracked_cross_brand": 0, "has_data": False}

            avg_score = db.query(func.avg(PostPerformance.performance_score)).filter(
                PostPerformance.performance_score.isnot(None)
            ).scalar()
            avg_views = db.query(func.avg(PostPerformance.views)).filter(
                PostPerformance.performance_score.isnot(None)
            ).scalar()

            # Best topics across all brands
            topic_stats = (
                db.query(
                    PostPerformance.topic_bucket,
                    func.avg(PostPerformance.performance_score).label("avg_score"),
                    func.avg(PostPerformance.views).label("avg_views"),
                    func.count(PostPerformance.id).label("count"),
                )
                .filter(
                    PostPerformance.performance_score.isnot(None),
                    PostPerformance.topic_bucket.isnot(None),
                )
                .group_by(PostPerformance.topic_bucket)
                .order_by(func.avg(PostPerformance.performance_score).desc())
                .all()
            )

            # Best titles (top 5 across portfolio)
            from sqlalchemy import desc
            top_titles = (
                db.query(PostPerformance.title, PostPerformance.brand,
                         PostPerformance.performance_score, PostPerformance.views)
                .filter(
                    PostPerformance.performance_score.isnot(None),
                    PostPerformance.title.isnot(None),
                )
                .order_by(desc(PostPerformance.performance_score))
                .limit(5)
                .all()
            )

            return {
                "total_tracked_cross_brand": total,
                "has_data": True,
                "avg_performance_score": round(avg_score, 1) if avg_score else 0,
                "avg_views": int(avg_views) if avg_views else 0,
                "best_topics": [
                    {
                        "topic": t.topic_bucket,
                        "avg_score": round(t.avg_score, 1),
                        "avg_views": int(t.avg_views) if t.avg_views else 0,
                        "count": t.count,
                    }
                    for t in topic_stats[:5]
                ],
                "top_titles": [
                    {
                        "title": t.title[:80] if t.title else "",
                        "brand": t.brand,
                        "score": round(t.performance_score, 1) if t.performance_score else 0,
                        "views": t.views or 0,
                    }
                    for t in top_titles
                ],
            }
        finally:
            db.close()


# ── Singleton ──

_collector: Optional[MetricsCollector] = None


def get_metrics_collector() -> MetricsCollector:
    global _collector
    if _collector is None:
        _collector = MetricsCollector()
    return _collector
