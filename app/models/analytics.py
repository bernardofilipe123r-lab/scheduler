"""
Analytics models: BrandAnalytics, AnalyticsRefreshLog, AnalyticsSnapshot,
ContentHistory, PostPerformance, TrendingContent.
"""
import hashlib
from datetime import datetime
from app.models.base import Base, Column, String, DateTime, Text, Boolean, Integer, JSON, Float, Index


class BrandAnalytics(Base):
    """
    Model for caching brand analytics data.
    
    Stores followers, views, and likes for each brand on each platform.
    Data is refreshed on-demand with rate limiting (3 refreshes per hour).
    """
    __tablename__ = "brand_analytics"
    
    # Composite primary key: brand + platform
    brand = Column(String(50), primary_key=True)
    platform = Column(String(20), primary_key=True)  # instagram, facebook, youtube
    
    # Analytics metrics
    followers_count = Column(Integer, default=0)
    views_last_7_days = Column(Integer, default=0)
    likes_last_7_days = Column(Integer, default=0)
    
    # Extra metrics (platform-specific)
    extra_metrics = Column(JSON, nullable=True)
    
    # Timestamps
    last_fetched_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    
    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "brand": self.brand,
            "platform": self.platform,
            "followers_count": self.followers_count,
            "views_last_7_days": self.views_last_7_days,
            "likes_last_7_days": self.likes_last_7_days,
            "extra_metrics": self.extra_metrics or {},
            "last_fetched_at": self.last_fetched_at.isoformat() if self.last_fetched_at else None,
        }


class AnalyticsRefreshLog(Base):
    """
    Log of analytics refresh attempts for rate limiting.
    
    Limits refreshes to 3 per hour to avoid excessive API calls.
    """
    __tablename__ = "analytics_refresh_log"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    refreshed_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    user_id = Column(String(100), nullable=True)  # Optional: track who refreshed
    status = Column(String(20), default="success")  # success, failed
    error_message = Column(Text, nullable=True)


class AnalyticsSnapshot(Base):
    """
    Historical snapshots of analytics data for trend analysis.
    
    One snapshot is created per brand/platform per refresh.
    This allows showing growth over time in graphs.
    """
    __tablename__ = "analytics_snapshots"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    brand = Column(String(50), nullable=False, index=True)
    platform = Column(String(20), nullable=False, index=True)
    
    # Snapshot timestamp
    snapshot_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    
    # Metrics at this point in time
    followers_count = Column(Integer, default=0)
    views_last_7_days = Column(Integer, default=0)
    likes_last_7_days = Column(Integer, default=0)
    
    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "brand": self.brand,
            "platform": self.platform,
            "snapshot_at": self.snapshot_at.isoformat() if self.snapshot_at else None,
            "followers_count": self.followers_count,
            "views_last_7_days": self.views_last_7_days,
            "likes_last_7_days": self.likes_last_7_days,
        }


class ContentHistory(Base):
    """
    Persistent record of every piece of generated content.

    Replaces fragile in-memory lists (_recent_titles, _recent_topics)
    that were lost on every server restart.

    Used for:
    - Content fingerprinting: detect near-duplicate titles via keyword hash
    - Topic rotation: enforce cooldown periods per topic bucket
    - Per-brand memory: each brand tracks its own history
    - Quality feedback loop: store quality scores for future analysis
    """
    __tablename__ = "content_history"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Content type: "post" or "reel"
    content_type = Column(String(10), nullable=False, index=True)

    # The generated title
    title = Column(Text, nullable=False)

    # Normalised keyword fingerprint for similarity detection.
    keyword_hash = Column(String(64), nullable=False, index=True)

    # The raw sorted keywords string before hashing (human-readable)
    keywords = Column(Text, nullable=True)

    # Which high-level topic bucket this belongs to
    topic_bucket = Column(String(50), nullable=False, index=True)

    # Brand this was generated for (nullable = shared/unassigned)
    brand = Column(String(50), nullable=True, index=True)

    # Quality score assigned by the quality gate (0-100)
    quality_score = Column(Float, nullable=True)

    # Whether this content was actually used (published or saved to a job)
    was_used = Column(Boolean, default=True, nullable=False)

    # Optional: the image prompt generated alongside the content
    image_prompt = Column(Text, nullable=True)

    # Optional: caption text
    caption = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)

    # Composite indexes for common queries
    __table_args__ = (
        Index("ix_content_history_type_topic", "content_type", "topic_bucket"),
        Index("ix_content_history_type_brand", "content_type", "brand"),
        Index("ix_content_history_type_created", "content_type", "created_at"),
    )

    @staticmethod
    def compute_keyword_hash(title: str) -> str:
        """
        Deterministic fingerprint from a title.

        1. Lowercase & strip punctuation
        2. Remove common stop-words
        3. Sort remaining words
        4. SHA-256 first 16 hex chars
        """
        import re
        stop_words = {
            "a", "an", "the", "and", "or", "but", "is", "are", "was",
            "were", "be", "been", "being", "in", "on", "at", "to", "for",
            "of", "with", "by", "from", "up", "about", "into", "through",
            "during", "before", "after", "above", "below", "between",
            "your", "you", "it", "its", "this", "that", "these", "those",
            "my", "our", "their", "his", "her", "can", "may", "will",
            "could", "should", "would", "do", "does", "did", "has", "have",
            "had", "no", "not", "than", "then", "so", "if", "how", "what",
            "which", "who", "whom", "when", "where", "why",
        }
        words = re.sub(r"[^a-z0-9\s]", "", title.lower()).split()
        keywords = sorted(set(w for w in words if w not in stop_words and len(w) > 2))
        keyword_str = " ".join(keywords)
        h = hashlib.sha256(keyword_str.encode()).hexdigest()[:16]
        return h

    @staticmethod
    def extract_keywords(title: str) -> str:
        """Return the sorted keywords string (before hashing)."""
        import re
        stop_words = {
            "a", "an", "the", "and", "or", "but", "is", "are", "was",
            "were", "be", "been", "being", "in", "on", "at", "to", "for",
            "of", "with", "by", "from", "up", "about", "into", "through",
            "during", "before", "after", "above", "below", "between",
            "your", "you", "it", "its", "this", "that", "these", "those",
            "my", "our", "their", "his", "her", "can", "may", "will",
            "could", "should", "would", "do", "does", "did", "has", "have",
            "had", "no", "not", "than", "then", "so", "if", "how", "what",
            "which", "who", "whom", "when", "where", "why",
        }
        words = re.sub(r"[^a-z0-9\s]", "", title.lower()).split()
        keywords = sorted(set(w for w in words if w not in stop_words and len(w) > 2))
        return " ".join(keywords)

    @staticmethod
    def classify_topic_bucket(title: str) -> str:
        """
        Classify a title into one of ~12 predefined topic buckets.

        Uses keyword matching (fast, no AI call needed).
        Returns the bucket name string.
        """
        title_lower = title.lower()

        buckets = {
            "superfoods": ["turmeric", "ginger", "berries", "berry", "honey", "cinnamon",
                           "superfood", "avocado", "quinoa", "chia", "seed", "dark chocolate",
                           "chocolate", "broccoli", "spinach", "kale", "almond", "walnut",
                           "flaxseed", "oat"],
            "teas_drinks": ["tea", "chamomile", "matcha", "golden milk", "herbal",
                            "infusion", "drink", "coffee", "lemon water", "water"],
            "supplements": ["collagen", "magnesium", "vitamin", "omega", "probiotic",
                            "ashwagandha", "supplement", "zinc", "iron", "calcium",
                            "b12", "folate", "biotin", "coq10"],
            "sleep": ["sleep", "insomnia", "melatonin", "rest", "bedtime", "circadian",
                      "nap", "pillow", "evening routine", "night"],
            "morning_routines": ["morning", "sunrise", "journaling", "stretching",
                                 "lemon water", "wake", "routine"],
            "skin_antiaging": ["skin", "collagen", "wrinkle", "elasticity", "anti-aging",
                               "aging", "glow", "complexion", "retinol", "hyaluronic"],
            "gut_health": ["gut", "digestion", "bloating", "microbiome", "probiotic",
                           "prebiotic", "fiber", "ferment", "yogurt", "kefir"],
            "hormones": ["hormone", "estrogen", "cortisol", "menopause", "thyroid",
                         "insulin", "testosterone", "progesterone", "pcos", "adrenal"],
            "stress_mood": ["stress", "mood", "anxiety", "cortisol", "serotonin",
                            "dopamine", "meditation", "mindfulness", "calm", "relax"],
            "hydration_detox": ["hydration", "detox", "water", "electrolyte", "fluid",
                                "cleanse", "flush", "toxin"],
            "brain_memory": ["brain", "memory", "cognitive", "focus", "concentration",
                             "neuro", "mental", "alzheimer", "dementia"],
            "heart_health": ["heart", "cardio", "cholesterol", "blood pressure",
                             "circulation", "artery", "vascular", "inflammation"],
        }

        # Score each bucket by keyword matches
        best_bucket = "general"
        best_score = 0
        for bucket, keywords in buckets.items():
            score = sum(1 for kw in keywords if kw in title_lower)
            if score > best_score:
                best_score = score
                best_bucket = bucket

        return best_bucket

    def to_dict(self):
        return {
            "id": self.id,
            "content_type": self.content_type,
            "title": self.title,
            "keyword_hash": self.keyword_hash,
            "keywords": self.keywords,
            "topic_bucket": self.topic_bucket,
            "brand": self.brand,
            "quality_score": self.quality_score,
            "was_used": self.was_used,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PostPerformance(Base):
    """
    Tracks per-post Instagram metrics for our published content.

    Populated by MetricsCollector which polls the IG Graph API
    at 24h, 48h, and 7d after publishing.  Used by Toby to
    identify winners and underperformers.
    """
    __tablename__ = "post_performance"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Instagram media ID (the key for Graph API calls)
    ig_media_id = Column(String(100), nullable=False, unique=True, index=True)

    # Optional Facebook post/video ID
    fb_post_id = Column(String(100), nullable=True)

    # Which brand this belongs to
    brand = Column(String(50), nullable=False, index=True)

    # Content type: "reel" or "post"
    content_type = Column(String(10), nullable=False, default="reel")

    # Link back to scheduled item (if available)
    schedule_id = Column(String(50), nullable=True, index=True)

    # Content metadata (copied at publish time so we have it even if schedule is deleted)
    title = Column(Text, nullable=True)
    caption = Column(Text, nullable=True)
    topic_bucket = Column(String(50), nullable=True)
    keyword_hash = Column(String(64), nullable=True)

    # FK to content_history if available
    content_history_id = Column(Integer, nullable=True)

    # ── Metrics ──
    views = Column(Integer, default=0)       # plays/impressions
    likes = Column(Integer, default=0)
    comments = Column(Integer, default=0)
    saves = Column(Integer, default=0)
    shares = Column(Integer, default=0)
    reach = Column(Integer, default=0)

    # Computed engagement rate: (likes+saves+shares+comments) / reach
    engagement_rate = Column(Float, nullable=True)

    # Overall performance score (0-100), computed by scoring algorithm
    performance_score = Column(Float, nullable=True)

    # Percentile rank among all our posts (0-100)
    percentile_rank = Column(Float, nullable=True)

    # ── Timestamps ──
    published_at = Column(DateTime(timezone=True), nullable=True)
    metrics_fetched_at = Column(DateTime(timezone=True), nullable=True)
    metrics_24h_at = Column(DateTime(timezone=True), nullable=True)
    metrics_48h_at = Column(DateTime(timezone=True), nullable=True)
    metrics_7d_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_post_perf_brand_score", "brand", "performance_score"),
        Index("ix_post_perf_type_score", "content_type", "performance_score"),
        Index("ix_post_perf_published", "published_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "ig_media_id": self.ig_media_id,
            "brand": self.brand,
            "content_type": self.content_type,
            "title": self.title,
            "topic_bucket": self.topic_bucket,
            "views": self.views,
            "likes": self.likes,
            "comments": self.comments,
            "saves": self.saves,
            "shares": self.shares,
            "reach": self.reach,
            "engagement_rate": self.engagement_rate,
            "performance_score": self.performance_score,
            "percentile_rank": self.percentile_rank,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "metrics_fetched_at": self.metrics_fetched_at.isoformat() if self.metrics_fetched_at else None,
        }


class TrendingContent(Base):
    """
    External viral content found via IG Hashtag Search or Business
    Discovery APIs.  Used by Toby's 'trending' strategy to adapt
    successful content from the health/wellness niche.
    """
    __tablename__ = "trending_content"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Instagram media ID (from external account)
    ig_media_id = Column(String(100), nullable=False, unique=True, index=True)

    # Source account info
    source_account = Column(String(100), nullable=True)  # IG username
    source_url = Column(Text, nullable=True)

    # Content metadata
    caption = Column(Text, nullable=True)
    media_type = Column(String(20), nullable=True)  # VIDEO, IMAGE, CAROUSEL_ALBUM
    hashtags = Column(JSON, nullable=True)  # List of hashtags

    # Metrics at discovery time
    like_count = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)

    # How we found it
    discovery_method = Column(String(30), nullable=True)  # hashtag_search | business_discovery
    discovery_hashtag = Column(String(100), nullable=True)

    # Whether Toby has used this for a proposal
    used_for_proposal = Column(Boolean, default=False)
    proposal_id = Column(String(20), nullable=True)

    # Timestamps
    media_timestamp = Column(DateTime(timezone=True), nullable=True)  # When the media was posted
    discovered_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_trending_discovery", "discovery_method", "discovered_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "ig_media_id": self.ig_media_id,
            "source_account": self.source_account,
            "caption": self.caption[:200] if self.caption else None,
            "media_type": self.media_type,
            "like_count": self.like_count,
            "comments_count": self.comments_count,
            "discovery_method": self.discovery_method,
            "used_for_proposal": self.used_for_proposal,
            "discovered_at": self.discovered_at.isoformat() if self.discovered_at else None,
        }
