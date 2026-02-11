"""
Content Tracker — Phase 2: Anti-Repetition & Quality Engine.

Persistent, DB-backed system that replaces fragile in-memory lists.

Responsibilities:
    1. Content fingerprinting — detect near-duplicate titles
    2. Topic rotation — enforce cooldown periods per topic bucket
    3. Per-brand memory — each brand tracks its own history
    4. Quality gate — structural checks on generated content
    5. History queries — provide recent titles/topics for prompt injection

Architecture:
    ContentTracker is a singleton service used by ContentGeneratorV2.
    It reads/writes to the `content_history` PostgreSQL table.
    All methods are designed to be fast and never block generation
    on DB errors (graceful degradation with in-memory fallback).
"""

import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from app.models import ContentHistory


# ============================================================
# TOPIC BUCKETS (canonical list)
# ============================================================
TOPIC_BUCKETS = [
    "superfoods",
    "teas_drinks",
    "supplements",
    "sleep",
    "morning_routines",
    "skin_antiaging",
    "gut_health",
    "hormones",
    "stress_mood",
    "hydration_detox",
    "brain_memory",
    "heart_health",
    "general",
]

# Minimum days before the same topic bucket can be reused
TOPIC_COOLDOWN_DAYS = 3

# Minimum days before the same keyword hash can appear again
FINGERPRINT_COOLDOWN_DAYS = 30

# How many days of history to check for anti-repetition
BRAND_HISTORY_DAYS = 60

# Minimum performance score to allow a topic to be repeated
HIGH_PERFORMER_THRESHOLD = 85.0


# ============================================================
# QUALITY GATE — structural checks for posts
# ============================================================

class PostQualityResult:
    """Result of a post quality gate check."""

    def __init__(self):
        self.passed = True
        self.score = 100.0
        self.issues: List[str] = []

    def fail(self, issue: str, penalty: float = 10.0):
        self.issues.append(issue)
        self.score -= penalty
        if self.score < 60:
            self.passed = False

    def __repr__(self):
        return f"QualityResult(passed={self.passed}, score={self.score:.0f}, issues={self.issues})"


def check_post_quality(title: str, caption: str = "") -> PostQualityResult:
    """
    Structural quality gate for posts.

    Checks format, length, style — NOT semantic quality (that's the AI's job).
    Returns a PostQualityResult with pass/fail and a score 0-100.
    """
    result = PostQualityResult()

    # ── Title checks ──────────────────────────────────────────────
    if not title or len(title.strip()) < 10:
        result.fail("Title too short (< 10 chars)", 50)  # Hard fail
        return result

    # Should not end with a period
    if title.strip().endswith("."):
        result.fail("Title ends with period", 5)

    # Should be sentence case, not ALL CAPS
    words = title.split()
    caps_count = sum(1 for w in words if w.isupper() and len(w) > 2)
    if caps_count > len(words) * 0.5:
        result.fail("Title is mostly ALL CAPS (reel-style)", 15)

    # Should not be a list/numbered format
    if re.match(r"^\d+\s", title.strip()):
        result.fail("Title starts with a number (list-style, reel-style)", 15)

    # Should not contain em-dashes or en-dashes
    if "\u2014" in title or "\u2013" in title:
        result.fail("Title contains em-dash or en-dash", 5)

    # Title length sweet spot: 40-120 chars
    if len(title) > 150:
        result.fail("Title too long (> 150 chars)", 10)
    elif len(title) < 20:
        result.fail("Title very short (< 20 chars)", 5)

    # ── Caption checks (if provided) ────────────────────────────
    if caption:
        if len(caption) < 100:
            result.fail("Caption too short (< 100 chars)", 10)

        # Should contain a source/reference
        if "doi:" not in caption.lower() and "source:" not in caption.lower():
            result.fail("Caption missing source/DOI reference", 10)

        # Should contain disclaimer
        if "disclaimer" not in caption.lower():
            result.fail("Caption missing disclaimer", 5)

    return result


# ============================================================
# CONTENT TRACKER SERVICE
# ============================================================

class ContentTracker:
    """
    Persistent content tracking service backed by PostgreSQL.

    Thread-safe singleton. All DB operations are wrapped in
    try/except so generation never fails because of tracker errors.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        print("✅ ContentTracker initialized (Phase 2: Anti-Repetition & Quality Engine)", flush=True)

    # ──────────────────────────────────────────────────────────
    # DB SESSION HELPER
    # ──────────────────────────────────────────────────────────

    def _get_session(self):
        """Get a new DB session. Caller must close it."""
        from app.db_connection import SessionLocal
        return SessionLocal()

    # ──────────────────────────────────────────────────────────
    # RECORD CONTENT
    # ──────────────────────────────────────────────────────────

    def record(
        self,
        title: str,
        content_type: str = "post",
        brand: str = None,
        caption: str = None,
        image_prompt: str = None,
        quality_score: float = None,
        was_used: bool = True,
    ) -> Optional[int]:
        """
        Record a generated piece of content in the DB.

        Returns the content_history.id, or None on error.
        """
        try:
            keyword_hash = ContentHistory.compute_keyword_hash(title)
            keywords = ContentHistory.extract_keywords(title)
            topic_bucket = ContentHistory.classify_topic_bucket(title)

            db = self._get_session()
            try:
                entry = ContentHistory(
                    content_type=content_type,
                    title=title,
                    keyword_hash=keyword_hash,
                    keywords=keywords,
                    topic_bucket=topic_bucket,
                    brand=brand,
                    quality_score=quality_score,
                    was_used=was_used,
                    image_prompt=image_prompt,
                    caption=caption,
                )
                db.add(entry)
                db.commit()
                db.refresh(entry)
                return entry.id
            finally:
                db.close()
        except Exception as e:
            print(f"⚠️ ContentTracker.record error: {e}", flush=True)
            return None

    # ──────────────────────────────────────────────────────────
    # DUPLICATE CHECK (fingerprint)
    # ──────────────────────────────────────────────────────────

    def is_duplicate(self, title: str, content_type: str = "post", days: int = None) -> bool:
        """
        Check if a title is a near-duplicate of recent content.

        Uses the keyword hash (same sorted keywords = duplicate).
        """
        if days is None:
            days = FINGERPRINT_COOLDOWN_DAYS
        try:
            keyword_hash = ContentHistory.compute_keyword_hash(title)
            cutoff = datetime.utcnow() - timedelta(days=days)

            db = self._get_session()
            try:
                count = (
                    db.query(ContentHistory)
                    .filter(
                        ContentHistory.content_type == content_type,
                        ContentHistory.keyword_hash == keyword_hash,
                        ContentHistory.created_at >= cutoff,
                    )
                    .count()
                )
                return count > 0
            finally:
                db.close()
        except Exception as e:
            print(f"⚠️ ContentTracker.is_duplicate error: {e}", flush=True)
            return False

    # ──────────────────────────────────────────────────────────
    # TOPIC COOLDOWN
    # ──────────────────────────────────────────────────────────

    def get_topic_cooldowns(self, content_type: str = "post") -> Dict[str, datetime]:
        """
        Get the last-used time for each topic bucket.

        Returns dict: {topic_bucket: last_created_at}
        """
        try:
            from sqlalchemy import func

            db = self._get_session()
            try:
                rows = (
                    db.query(
                        ContentHistory.topic_bucket,
                        func.max(ContentHistory.created_at).label("last_used"),
                    )
                    .filter(ContentHistory.content_type == content_type)
                    .group_by(ContentHistory.topic_bucket)
                    .all()
                )
                return {row.topic_bucket: row.last_used for row in rows}
            finally:
                db.close()
        except Exception as e:
            print(f"⚠️ ContentTracker.get_topic_cooldowns error: {e}", flush=True)
            return {}

    def get_available_topics(
        self,
        content_type: str = "post",
        cooldown_days: int = None,
    ) -> List[str]:
        """
        Get topic buckets that are NOT on cooldown.

        If all are on cooldown, returns all (never return empty).
        """
        if cooldown_days is None:
            cooldown_days = TOPIC_COOLDOWN_DAYS

        cooldowns = self.get_topic_cooldowns(content_type)
        cutoff = datetime.utcnow() - timedelta(days=cooldown_days)

        available = []
        for bucket in TOPIC_BUCKETS:
            last_used = cooldowns.get(bucket)
            if last_used is None or last_used < cutoff:
                available.append(bucket)

        # Never return empty — if all on cooldown, return all
        return available if available else list(TOPIC_BUCKETS)

    # ──────────────────────────────────────────────────────────
    # RECENT TITLES (for prompt injection)
    # ──────────────────────────────────────────────────────────

    def get_recent_titles(
        self,
        content_type: str = "post",
        limit: int = 30,
        brand: str = None,
    ) -> List[str]:
        """
        Get recent titles from DB for anti-repetition prompt injection.

        Replaces the old in-memory _recent_titles list.
        """
        try:
            from sqlalchemy import desc

            db = self._get_session()
            try:
                query = (
                    db.query(ContentHistory.title)
                    .filter(ContentHistory.content_type == content_type)
                )
                if brand:
                    query = query.filter(ContentHistory.brand == brand)

                rows = (
                    query
                    .order_by(desc(ContentHistory.created_at))
                    .limit(limit)
                    .all()
                )
                return [row.title for row in rows]
            finally:
                db.close()
        except Exception as e:
            print(f"⚠️ ContentTracker.get_recent_titles error: {e}", flush=True)
            return []

    def get_recent_topic_buckets(
        self,
        content_type: str = "post",
        limit: int = 10,
    ) -> List[str]:
        """Get the most recently used topic buckets (ordered newest first)."""
        try:
            from sqlalchemy import desc

            db = self._get_session()
            try:
                rows = (
                    db.query(ContentHistory.topic_bucket)
                    .filter(ContentHistory.content_type == content_type)
                    .order_by(desc(ContentHistory.created_at))
                    .limit(limit)
                    .all()
                )
                # Deduplicate while preserving order
                seen = set()
                result = []
                for row in rows:
                    if row.topic_bucket not in seen:
                        seen.add(row.topic_bucket)
                        result.append(row.topic_bucket)
                return result
            finally:
                db.close()
        except Exception as e:
            print(f"⚠️ ContentTracker.get_recent_topic_buckets error: {e}", flush=True)
            return []

    # ──────────────────────────────────────────────────────────
    # BUILD HISTORY CONTEXT FOR PROMPT
    # ──────────────────────────────────────────────────────────

    def build_history_context(
        self,
        content_type: str = "post",
        limit: int = 25,
        brand: str = None,
    ) -> str:
        """
        Build the '### PREVIOUSLY GENERATED' fragment for prompt injection.

        Combines DB history + old job-level titles for backward compat.
        """
        titles = self.get_recent_titles(content_type, limit, brand)

        # Also pull from generation_jobs for backward compatibility
        # (titles created before content_history existed)
        job_titles = self._get_legacy_job_titles(content_type, limit)
        for t in job_titles:
            if t not in titles:
                titles.append(t)

        titles = titles[:limit]

        if not titles:
            return ""

        lines = "\n".join(f"- {t}" for t in titles)
        return f"\n### PREVIOUSLY GENERATED (avoid repeating these titles and topics):\n{lines}\n"

    # ──────────────────────────────────────────────────────────
    # BRAND-AWARE AVOIDANCE (for Toby/Lexi prompt injection)
    # ──────────────────────────────────────────────────────────

    def get_brand_avoidance_prompt(
        self,
        brand: str,
        content_type: str = "reel",
        days: int = None,
        cross_brand_days: int = 7,
    ) -> str:
        """
        Build a rich avoidance block for AI prompts.

        Combines:
        1. Brand-specific history (60 days) — titles this brand already used
        2. Cross-brand recent titles (7 days) — avoid same content across brands
        3. Also pulls from toby_proposals table for titles not yet in content_history

        Returns a formatted string ready for prompt injection.
        """
        if days is None:
            days = BRAND_HISTORY_DAYS

        sections = []

        # 1. Brand-specific history from content_history
        brand_titles = self.get_recent_titles(content_type, limit=60, brand=brand)

        # 2. Also pull from toby_proposals for this brand (covers content not yet in content_history)
        proposal_titles = self._get_recent_proposal_titles(brand, content_type, days=days, limit=60)
        for t in proposal_titles:
            if t not in brand_titles:
                brand_titles.append(t)

        # 3. Legacy job titles for backward compat
        legacy_titles = self._get_legacy_job_titles(content_type, limit=30)
        for t in legacy_titles:
            if t not in brand_titles:
                brand_titles.append(t)

        brand_titles = brand_titles[:60]  # Cap at 60

        if brand_titles:
            lines = "\n".join(f"- {t}" for t in brand_titles)
            sections.append(
                f"### TITLES ALREADY USED FOR THIS BRAND (last {days} days — DO NOT repeat or closely rephrase):\n{lines}"
            )

        # 4. Cross-brand recent titles (last 7 days, all brands except this one)
        try:
            from sqlalchemy import desc
            cutoff = datetime.utcnow() - timedelta(days=cross_brand_days)
            db = self._get_session()
            try:
                rows = (
                    db.query(ContentHistory.title)
                    .filter(
                        ContentHistory.content_type == content_type,
                        ContentHistory.created_at >= cutoff,
                        ContentHistory.brand != brand,
                    )
                    .order_by(desc(ContentHistory.created_at))
                    .limit(40)
                    .all()
                )
                cross_titles = [r.title for r in rows]
            finally:
                db.close()

            # Also from proposals
            cross_proposal = self._get_recent_proposal_titles(
                brand=None, content_type=content_type, days=cross_brand_days,
                limit=40, exclude_brand=brand,
            )
            for t in cross_proposal:
                if t not in cross_titles:
                    cross_titles.append(t)

            cross_titles = cross_titles[:40]

            if cross_titles:
                lines = "\n".join(f"- {t}" for t in cross_titles)
                sections.append(
                    f"### TITLES USED BY OTHER BRANDS THIS WEEK (also avoid — we want unique content per brand):\n{lines}"
                )
        except Exception as e:
            print(f"⚠️ ContentTracker cross-brand error: {e}", flush=True)

        if not sections:
            return ""

        return "\n\n" + "\n\n".join(sections) + "\n"

    def _get_recent_proposal_titles(
        self,
        brand: str = None,
        content_type: str = "reel",
        days: int = 60,
        limit: int = 60,
        exclude_brand: str = None,
    ) -> List[str]:
        """Pull recent titles from toby_proposals table."""
        try:
            from app.models import TobyProposal
            from sqlalchemy import desc

            cutoff = datetime.utcnow() - timedelta(days=days)
            db = self._get_session()
            try:
                query = (
                    db.query(TobyProposal.title)
                    .filter(
                        TobyProposal.content_type == content_type,
                        TobyProposal.created_at >= cutoff,
                    )
                )
                if brand:
                    query = query.filter(TobyProposal.brand == brand)
                if exclude_brand:
                    query = query.filter(TobyProposal.brand != exclude_brand)

                rows = query.order_by(desc(TobyProposal.created_at)).limit(limit).all()
                return [r.title for r in rows if r.title]
            finally:
                db.close()
        except Exception as e:
            print(f"⚠️ ContentTracker._get_recent_proposal_titles error: {e}", flush=True)
            return []

    def is_duplicate_for_brand(
        self,
        title: str,
        brand: str,
        content_type: str = "reel",
        days: int = None,
    ) -> bool:
        """
        Check if a title is a near-duplicate for a SPECIFIC brand.

        Checks both content_history and toby_proposals tables.
        Returns True if the same keyword hash was used in the last N days.
        """
        if days is None:
            days = BRAND_HISTORY_DAYS
        try:
            keyword_hash = ContentHistory.compute_keyword_hash(title)
            cutoff = datetime.utcnow() - timedelta(days=days)

            db = self._get_session()
            try:
                # Check content_history
                ch_count = (
                    db.query(ContentHistory)
                    .filter(
                        ContentHistory.content_type == content_type,
                        ContentHistory.keyword_hash == keyword_hash,
                        ContentHistory.brand == brand,
                        ContentHistory.created_at >= cutoff,
                    )
                    .count()
                )
                if ch_count > 0:
                    return True

                # Also check toby_proposals (content might not be in content_history yet)
                from app.models import TobyProposal
                # Check proposals by doing keyword comparison on title
                proposals = (
                    db.query(TobyProposal.title)
                    .filter(
                        TobyProposal.content_type == content_type,
                        TobyProposal.brand == brand,
                        TobyProposal.created_at >= cutoff,
                    )
                    .all()
                )
                for row in proposals:
                    if row.title and ContentHistory.compute_keyword_hash(row.title) == keyword_hash:
                        return True

                return False
            finally:
                db.close()
        except Exception as e:
            print(f"⚠️ ContentTracker.is_duplicate_for_brand error: {e}", flush=True)
            return False

    def is_high_performer(
        self,
        title: str,
        content_type: str = "reel",
        threshold: float = None,
    ) -> bool:
        """
        Check if a title's topic was previously a high performer.

        If performance_score >= threshold, the topic can be repeated.
        Uses PostPerformance data.
        """
        if threshold is None:
            threshold = HIGH_PERFORMER_THRESHOLD
        try:
            from app.models import PostPerformance

            keyword_hash = ContentHistory.compute_keyword_hash(title)
            db = self._get_session()
            try:
                # Check if any previous content with similar keywords performed well
                history = (
                    db.query(ContentHistory)
                    .filter(
                        ContentHistory.content_type == content_type,
                        ContentHistory.keyword_hash == keyword_hash,
                        ContentHistory.quality_score.isnot(None),
                        ContentHistory.quality_score >= threshold,
                    )
                    .first()
                )
                return history is not None
            finally:
                db.close()
        except Exception as e:
            print(f"⚠️ ContentTracker.is_high_performer error: {e}", flush=True)
            return False

    def record_proposal(
        self,
        title: str,
        content_type: str = "reel",
        brand: str = None,
        caption: str = None,
        content_lines: list = None,
        image_prompt: str = None,
        quality_score: float = None,
    ) -> Optional[int]:
        """
        Record a proposal in content_history for anti-repetition tracking.

        Stores title + caption + summarized content so future proposals
        can see what content has already been generated.
        """
        # Build a combined caption with content summary for richer history
        full_caption = caption or ""
        if content_lines:
            summary = " | ".join(content_lines[:4])
            full_caption = f"[Content: {summary}]\n{full_caption}" if full_caption else f"[Content: {summary}]"

        return self.record(
            title=title,
            content_type=content_type,
            brand=brand,
            caption=full_caption,
            image_prompt=image_prompt,
            quality_score=quality_score,
            was_used=True,
        )

    def _get_legacy_job_titles(self, content_type: str, limit: int) -> List[str]:
        """Pull titles from generation_jobs table (backward compat)."""
        try:
            from app.models import GenerationJob
            from sqlalchemy import desc

            db = self._get_session()
            try:
                variant = "post" if content_type == "post" else "dark"
                recent_jobs = (
                    db.query(GenerationJob)
                    .filter(GenerationJob.variant == variant)
                    .order_by(desc(GenerationJob.created_at))
                    .limit(limit)
                    .all()
                )
                titles = []
                for j in recent_jobs:
                    if j.brand_outputs and isinstance(j.brand_outputs, dict):
                        for _brand_key, brand_data in j.brand_outputs.items():
                            if isinstance(brand_data, dict):
                                t = brand_data.get("title", "")
                                if t and t not in titles:
                                    titles.append(t)
                    if j.title and j.title not in titles:
                        titles.append(j.title)
                return titles[:limit]
            finally:
                db.close()
        except Exception as e:
            print(f"⚠️ ContentTracker._get_legacy_job_titles error: {e}", flush=True)
            return []

    # ──────────────────────────────────────────────────────────
    # PICK TOPIC (weighted by cooldown)
    # ──────────────────────────────────────────────────────────

    def pick_topic(
        self,
        content_type: str = "post",
        topic_hint: str = None,
    ) -> str:
        """
        Pick the best topic bucket for the next generation.

        If topic_hint is provided, classify it and use it.
        Otherwise, pick the topic with the longest cooldown.
        """
        if topic_hint:
            return ContentHistory.classify_topic_bucket(topic_hint)

        import random

        available = self.get_available_topics(content_type)
        recent = self.get_recent_topic_buckets(content_type, limit=5)

        # Prefer topics NOT in the last 5 generations
        preferred = [t for t in available if t not in recent]
        if preferred:
            return random.choice(preferred)

        return random.choice(available)

    # ──────────────────────────────────────────────────────────
    # STATS / INFO
    # ──────────────────────────────────────────────────────────

    def get_stats(self, content_type: str = "post") -> Dict:
        """Get content history statistics."""
        try:
            from sqlalchemy import func

            db = self._get_session()
            try:
                total = (
                    db.query(func.count(ContentHistory.id))
                    .filter(ContentHistory.content_type == content_type)
                    .scalar()
                )
                unique_topics = (
                    db.query(func.count(func.distinct(ContentHistory.topic_bucket)))
                    .filter(ContentHistory.content_type == content_type)
                    .scalar()
                )
                unique_hashes = (
                    db.query(func.count(func.distinct(ContentHistory.keyword_hash)))
                    .filter(ContentHistory.content_type == content_type)
                    .scalar()
                )
                avg_quality = (
                    db.query(func.avg(ContentHistory.quality_score))
                    .filter(
                        ContentHistory.content_type == content_type,
                        ContentHistory.quality_score.isnot(None),
                    )
                    .scalar()
                )

                cooldowns = self.get_topic_cooldowns(content_type)
                available = self.get_available_topics(content_type)

                return {
                    "total_generated": total or 0,
                    "unique_topics_used": unique_topics or 0,
                    "unique_fingerprints": unique_hashes or 0,
                    "avg_quality_score": round(avg_quality, 1) if avg_quality else None,
                    "topics_on_cooldown": [
                        t for t in TOPIC_BUCKETS if t not in available
                    ],
                    "topics_available": available,
                }
            finally:
                db.close()
        except Exception as e:
            print(f"⚠️ ContentTracker.get_stats error: {e}", flush=True)
            return {"error": str(e)}


# ============================================================
# SINGLETON ACCESSOR
# ============================================================

_tracker_instance: Optional[ContentTracker] = None


def get_content_tracker() -> ContentTracker:
    """Get the singleton ContentTracker instance."""
    global _tracker_instance
    if _tracker_instance is None:
        _tracker_instance = ContentTracker()
    return _tracker_instance
