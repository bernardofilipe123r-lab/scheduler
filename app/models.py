"""
Database models for PostgreSQL storage.
"""
import hashlib
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Boolean, Integer, JSON, Float, Index
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class GenerationJob(Base):
    """Model for tracking reel generation jobs."""
    __tablename__ = "generation_jobs"
    
    # Primary key - short readable ID (e.g., "GEN-001234")
    job_id = Column(String(20), primary_key=True)
    
    # User identification
    user_id = Column(String(100), nullable=False, index=True)
    
    # Job status: pending, generating, completed, failed
    status = Column(String(20), default="pending", nullable=False, index=True)
    
    # Input data
    title = Column(String(500), nullable=False)
    content_lines = Column(JSON, nullable=False)  # List of content lines
    variant = Column(String(10), nullable=False)  # "light" or "dark"
    ai_prompt = Column(Text, nullable=True)  # For dark mode backgrounds
    cta_type = Column(String(50), nullable=True)
    brands = Column(JSON, nullable=False)  # List of brands to generate
    platforms = Column(JSON, nullable=True)  # List of platforms: ["instagram", "facebook", "youtube"]
    
    # Generated outputs per brand
    # Format: {"gymcollege": {"reel_id": "...", "thumbnail": "...", "video": "...", "status": "completed"}, ...}
    brand_outputs = Column(JSON, default=dict)
    
    # AI background image path (shared across brands for dark mode)
    ai_background_path = Column(String(500), nullable=True)
    
    # Progress tracking
    current_step = Column(String(100), nullable=True)  # e.g., "Generating gymcollege thumbnail"
    progress_percent = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Error tracking
    error_message = Column(Text, nullable=True)
    
    def to_dict(self):
        """Convert to dictionary for API responses."""
        # Safely get platforms - handle case where column doesn't exist yet in DB
        try:
            platforms = self.platforms or ["instagram", "facebook", "youtube"]
        except Exception:
            platforms = ["instagram", "facebook", "youtube"]
        
        return {
            "job_id": self.job_id,
            "user_id": self.user_id,
            "status": self.status,
            "title": self.title,
            "content_lines": self.content_lines,
            "variant": self.variant,
            "ai_prompt": self.ai_prompt,
            "cta_type": self.cta_type,
            "brands": self.brands,
            "platforms": platforms,
            "brand_outputs": self.brand_outputs or {},
            "ai_background_path": self.ai_background_path,
            "current_step": self.current_step,
            "progress_percent": self.progress_percent,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error_message": self.error_message,
        }


class ScheduledReel(Base):
    """Model for scheduled reels with user support."""
    __tablename__ = "scheduled_reels"
    
    # Primary key
    schedule_id = Column(String(36), primary_key=True)
    
    # User identification
    user_id = Column(String(100), nullable=False, index=True)
    user_name = Column(String(255))
    
    # Reel information
    reel_id = Column(String(36), nullable=False, index=True)
    caption = Column(Text)
    
    # Scheduling
    scheduled_time = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    
    # Publishing status
    status = Column(String(20), default="scheduled", nullable=False, index=True)
    # Status values: "scheduled", "published", "failed"
    
    published_at = Column(DateTime(timezone=True), nullable=True)
    publish_error = Column(Text, nullable=True)
    
    # Extra data (platforms, video_path, thumbnail_path, etc.)
    extra_data = Column(JSON, nullable=True)
    
    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "schedule_id": self.schedule_id,
            "user_id": self.user_id,
            "user_name": self.user_name,
            "reel_id": self.reel_id,
            "caption": self.caption,
            "scheduled_time": self.scheduled_time.isoformat() if self.scheduled_time else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "status": self.status,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "publish_error": self.publish_error,
            "metadata": self.extra_data or {}  # Return as "metadata" for API compatibility
        }


class UserProfile(Base):
    """Model for user profiles with Instagram/Facebook credentials."""
    __tablename__ = "user_profiles"
    
    # Primary key
    user_id = Column(String(100), primary_key=True)
    
    # User information
    user_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True, unique=True, index=True)
    
    # Instagram credentials
    instagram_business_account_id = Column(String(255), nullable=True)
    instagram_access_token = Column(Text, nullable=True)
    
    # Facebook credentials
    facebook_page_id = Column(String(255), nullable=True)
    facebook_access_token = Column(Text, nullable=True)
    
    # Meta app credentials
    meta_access_token = Column(Text, nullable=True)
    
    # Settings
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def to_dict(self, include_tokens=False):
        """Convert to dictionary for API responses."""
        data = {
            "user_id": self.user_id,
            "user_name": self.user_name,
            "email": self.email,
            "active": self.active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "has_instagram": bool(self.instagram_business_account_id),
            "has_facebook": bool(self.facebook_page_id),
        }
        
        if include_tokens:
            data.update({
                "instagram_business_account_id": self.instagram_business_account_id,
                "instagram_access_token": self.instagram_access_token,
                "facebook_page_id": self.facebook_page_id,
                "facebook_access_token": self.facebook_access_token,
                "meta_access_token": self.meta_access_token,
            })
        
        return data


class YouTubeChannel(Base):
    """
    Model for YouTube channel credentials.
    
    Stores refresh tokens for each brand's YouTube channel.
    The refresh token is used to obtain short-lived access tokens
    for each upload - the user only needs to authorize once.
    
    Architecture:
    - User clicks "Connect YouTube" → OAuth consent screen
    - Google returns authorization code
    - Backend exchanges code for refresh_token (stored here)
    - For each upload: refresh_token → access_token (1hr) → upload → discard
    - User never touches tokens again unless access is revoked
    """
    __tablename__ = "youtube_channels"
    
    # Primary key - the brand name (lowercase)
    brand = Column(String(50), primary_key=True)
    
    # YouTube channel info
    channel_id = Column(String(100), nullable=False, index=True)
    channel_name = Column(String(255), nullable=True)
    
    # OAuth credentials - ONLY the refresh token is stored long-term
    # Access tokens are generated on-demand and discarded after use
    refresh_token = Column(Text, nullable=False)
    
    # Connection status
    status = Column(String(20), default="connected", nullable=False)
    # Status values: "connected", "disconnected", "revoked", "error"
    
    # Last successful upload
    last_upload_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    
    # Timestamps
    connected_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def to_dict(self, include_token=False):
        """Convert to dictionary for API responses."""
        data = {
            "brand": self.brand,
            "channel_id": self.channel_id,
            "channel_name": self.channel_name,
            "status": self.status,
            "last_upload_at": self.last_upload_at.isoformat() if self.last_upload_at else None,
            "last_error": self.last_error,
            "connected_at": self.connected_at.isoformat() if self.connected_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        
        # Never expose refresh token in API responses unless explicitly requested
        # (e.g., for debugging by admin)
        if include_token:
            data["refresh_token"] = self.refresh_token
        
        return data

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


class Brand(Base):
    """
    Central source of truth for all brand configuration.
    
    This replaces all hardcoded brand constants throughout the codebase.
    Brands can be created, updated, and deleted via the API.
    """
    __tablename__ = "brands"
    
    # Primary key - lowercase brand identifier (e.g., 'healthycollege')
    id = Column(String(50), primary_key=True)
    
    # Display information
    display_name = Column(String(100), nullable=False)  # e.g., 'THE HEALTHY COLLEGE'
    short_name = Column(String(10), nullable=False)  # e.g., 'HCO' - for logo fallback
    
    # Social media handles
    instagram_handle = Column(String(100), nullable=True)  # e.g., '@thehealthycollege'
    facebook_page_name = Column(String(100), nullable=True)
    youtube_channel_name = Column(String(100), nullable=True)
    
    # Scheduling configuration
    schedule_offset = Column(Integer, default=0)  # Hour offset 0-23 for scheduling
    posts_per_day = Column(Integer, default=6)
    
    # Content generation settings
    baseline_for_content = Column(Boolean, default=False)  # Is this the baseline brand for content differentiation?
    
    # Colors - JSON with full color configuration
    # Structure: {
    #   "primary": "#004f00",
    #   "accent": "#16a34a",
    #   "text": "#FFFFFF",
    #   "color_name": "vibrant green",  # For AI prompts
    #   "light_mode": {"background": "#dffbcb", "text": "#004f00", ...},
    #   "dark_mode": {"background": "#001f00", "text": "#FFFFFF", ...}
    # }
    colors = Column(JSON, nullable=False, default=dict)
    
    # API Credentials (stored in DB for easy management)
    instagram_access_token = Column(Text, nullable=True)
    instagram_business_account_id = Column(String(100), nullable=True)
    facebook_page_id = Column(String(100), nullable=True)
    facebook_access_token = Column(Text, nullable=True)
    meta_access_token = Column(Text, nullable=True)
    
    # Logo path (relative to assets/logos/)
    logo_path = Column(String(255), nullable=True)
    
    # Status
    active = Column(Boolean, default=True, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def to_dict(self, include_credentials=False):
        """Convert to dictionary for API responses."""
        data = {
            "id": self.id,
            "display_name": self.display_name,
            "short_name": self.short_name,
            "instagram_handle": self.instagram_handle,
            "facebook_page_name": self.facebook_page_name,
            "youtube_channel_name": self.youtube_channel_name,
            "schedule_offset": self.schedule_offset,
            "posts_per_day": self.posts_per_day,
            "baseline_for_content": self.baseline_for_content,
            "colors": self.colors or {},
            "logo_path": self.logo_path,
            "active": self.active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            # Indicate if credentials are configured (without exposing them)
            "has_instagram": bool(self.instagram_business_account_id and self.instagram_access_token),
            "has_facebook": bool(self.facebook_page_id and self.facebook_access_token),
        }
        
        if include_credentials:
            data.update({
                "instagram_access_token": self.instagram_access_token,
                "instagram_business_account_id": self.instagram_business_account_id,
                "facebook_page_id": self.facebook_page_id,
                "facebook_access_token": self.facebook_access_token,
                "meta_access_token": self.meta_access_token,
            })
        
        return data


class LogEntry(Base):
    """
    Persistent log entry for extreme-detail debugging.
    
    Stores every log message, HTTP request/response, user action,
    external API call, and system event. Survives deployments via
    PostgreSQL storage. Designed for external debugging access.
    
    Categories:
    - http_request:  Incoming HTTP request/response (method, path, status, timing, headers, body)
    - http_outbound: Outgoing HTTP calls to external APIs (Meta, OpenAI, YouTube, etc.)
    - app_log:       Application log messages (info, warning, error, debug, critical)
    - user_action:   User-initiated actions (schedule, publish, generate, etc.)
    - system_event:  System events (startup, shutdown, scheduler tick, migration, etc.)
    - error:         Exceptions and tracebacks
    - scheduler:     Scheduler-related events (publish check, auto-refresh, etc.)
    - publishing:    Social media publishing events and results
    - ai_generation: AI content/image generation events
    """
    __tablename__ = "app_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Timestamp with timezone for accurate cross-timezone debugging
    timestamp = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    
    # Log level: DEBUG, INFO, WARNING, ERROR, CRITICAL
    level = Column(String(10), default="INFO", nullable=False, index=True)
    
    # Category for filtering (see docstring above)
    category = Column(String(30), default="app_log", nullable=False, index=True)
    
    # Source: module/file that generated the log
    source = Column(String(200), nullable=True, index=True)
    
    # Main log message
    message = Column(Text, nullable=False)
    
    # Detailed context as JSON blob - varies by category:
    # http_request:  {method, path, status_code, duration_ms, request_headers, request_body, response_headers, response_body, client_ip, query_params}
    # http_outbound: {method, url, status_code, duration_ms, request_body, response_body, service_name}
    # app_log:       {function, line_number, extra_data}
    # user_action:   {action, user_id, details}
    # system_event:  {event_type, details}
    # error:         {exception_type, traceback, context}
    details = Column(JSON, nullable=True)
    
    # Request correlation ID - links all logs from the same HTTP request
    request_id = Column(String(36), nullable=True, index=True)
    
    # Deployment identifier - tracks which deployment generated the log
    deployment_id = Column(String(100), nullable=True, index=True)
    
    # Duration in milliseconds (for timed operations)
    duration_ms = Column(Integer, nullable=True)
    
    # HTTP-specific fields (denormalized for fast queries)
    http_method = Column(String(10), nullable=True)
    http_path = Column(String(500), nullable=True, index=True)
    http_status = Column(Integer, nullable=True)
    
    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "level": self.level,
            "category": self.category,
            "source": self.source,
            "message": self.message,
            "details": self.details,
            "request_id": self.request_id,
            "deployment_id": self.deployment_id,
            "duration_ms": self.duration_ms,
            "http_method": self.http_method,
            "http_path": self.http_path,
            "http_status": self.http_status,
        }


class AppSettings(Base):
    """
    Application-wide settings that can be updated via the UI.
    
    This allows users to configure things like API keys, default values,
    etc. without needing to modify .env files or code.
    """
    __tablename__ = "app_settings"
    
    # Setting key (e.g., 'openai_api_key', 'default_posts_per_day')
    key = Column(String(100), primary_key=True)
    
    # Setting value (stored as string, parsed by application)
    value = Column(Text, nullable=True)
    
    # Metadata
    description = Column(Text, nullable=True)  # Human-readable description
    category = Column(String(50), nullable=True)  # For grouping in UI (e.g., 'ai', 'scheduling', 'api')
    value_type = Column(String(20), default="string")  # string, number, boolean, json
    sensitive = Column(Boolean, default=False)  # If True, value is hidden in logs/responses
    
    # Timestamps
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def to_dict(self, include_sensitive=False):
        """Convert to dictionary for API responses."""
        value = self.value
        
        # Mask sensitive values unless explicitly requested
        if self.sensitive and not include_sensitive and value:
            value = "***REDACTED***"
        
        return {
            "key": self.key,
            "value": value,
            "description": self.description,
            "category": self.category,
            "value_type": self.value_type,
            "sensitive": self.sensitive,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ============================================================
# CONTENT HISTORY — Phase 2: Anti-Repetition & Quality Engine
# ============================================================

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
    # Built from sorted, lowercased, deduplicated keywords extracted
    # from the title. Two titles with the same fingerprint are
    # semantically too close.
    keyword_hash = Column(String(64), nullable=False, index=True)

    # The raw sorted keywords string before hashing (human-readable)
    keywords = Column(Text, nullable=True)

    # Which high-level topic bucket this belongs to
    # (e.g., "supplements", "teas", "gut_health", "sleep", …)
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


# ============================================================
# POST PERFORMANCE — per-post IG metrics
# ============================================================

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


# ============================================================
# TOBY PROPOSAL — AI agent content proposals
# ============================================================

class TobyProposal(Base):
    """
    A content proposal generated by the Toby AI agent.

    Toby analyses performance data, trends, and content gaps,
    then proposes reels (and later posts) that the user can
    accept or reject.  Accepted proposals trigger God Automation
    to create versions for every brand.
    """
    __tablename__ = "toby_proposals"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Human-readable ID (e.g., "TOBY-001")
    proposal_id = Column(String(20), nullable=False, unique=True, index=True)

    # Status: pending | accepted | rejected | expired
    status = Column(String(20), default="pending", nullable=False, index=True)

    # Which agent created this proposal: "toby" or "lexi"
    agent_name = Column(String(20), default="toby", nullable=False, index=True)

    # Content type: "reel" or "post"
    content_type = Column(String(10), nullable=False, default="reel")

    # ── Brand assignment (each proposal targets ONE brand) ──
    brand = Column(String(50), nullable=True, index=True)  # e.g. "healthycollege"
    variant = Column(String(10), nullable=True)  # "dark" or "light"

    # ── Strategy that produced this proposal ──
    # explore      — new topic / angle within the niche
    # iterate      — tweak an underperformer
    # double_down  — variation of our own winner
    # trending     — adapt external viral content
    strategy = Column(String(20), nullable=False)

    # Toby's explanation of WHY he chose this
    reasoning = Column(Text, nullable=False)

    # ── Generated content ──
    title = Column(Text, nullable=False)
    content_lines = Column(JSON, nullable=True)   # List of reel text lines
    slide_texts = Column(JSON, nullable=True)      # List of carousel slide paragraphs (posts only)
    image_prompt = Column(Text, nullable=True)
    caption = Column(Text, nullable=True)

    # Topic classification (from Phase 2)
    topic_bucket = Column(String(50), nullable=True)

    # ── Source context (for iterate / double_down / trending) ──
    # What inspired this proposal
    source_type = Column(String(30), nullable=True)  # own_content | competitor | trending_hashtag
    source_ig_media_id = Column(String(100), nullable=True)
    source_title = Column(Text, nullable=True)
    source_performance_score = Column(Float, nullable=True)
    source_account = Column(String(100), nullable=True)  # IG username for competitor/trending

    # ── Quality metadata ──
    quality_score = Column(Float, nullable=True)  # Phase 2 quality gate score

    # ── Review metadata ──
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewer_notes = Column(Text, nullable=True)

    # What job was created when accepted (links to GenerationJob or scheduled item)
    accepted_job_id = Column(String(50), nullable=True)

    # ── Timestamps ──
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (
        Index("ix_toby_status_created", "status", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "proposal_id": self.proposal_id,
            "status": self.status,
            "agent_name": self.agent_name or "toby",
            "content_type": self.content_type,
            "brand": self.brand,
            "variant": self.variant,
            "strategy": self.strategy,
            "reasoning": self.reasoning,
            "title": self.title,
            "content_lines": self.content_lines,
            "slide_texts": self.slide_texts,
            "image_prompt": self.image_prompt,
            "caption": self.caption,
            "topic_bucket": self.topic_bucket,
            "source_type": self.source_type,
            "source_title": self.source_title,
            "source_performance_score": self.source_performance_score,
            "source_account": self.source_account,
            "quality_score": self.quality_score,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "accepted_job_id": self.accepted_job_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================
# TRENDING CONTENT — external viral content discovered by Toby
# ============================================================

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


class MaestroConfig(Base):
    """
    Persistent Maestro state — survives Railway redeploys.

    Stores key-value pairs: is_paused, last_daily_run, etc.
    """
    __tablename__ = "maestro_config"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @staticmethod
    def get(db, key: str, default: str = "") -> str:
        row = db.query(MaestroConfig).filter_by(key=key).first()
        return row.value if row else default

    @staticmethod
    def set(db, key: str, value: str):
        row = db.query(MaestroConfig).filter_by(key=key).first()
        if row:
            row.value = value
            row.updated_at = datetime.utcnow()
        else:
            db.add(MaestroConfig(key=key, value=value, updated_at=datetime.utcnow()))
        db.commit()


class AIAgent(Base):
    """
    Dynamic AI agent — each agent works across ALL brands.

    Number of agents always matches number of brands.
    When a brand is created, a new agent is auto-provisioned.
    """
    __tablename__ = "ai_agents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(String(50), unique=True, nullable=False, index=True)  # e.g. "toby", "lexi", "marco"
    display_name = Column(String(100), nullable=False)  # User-defined name
    personality = Column(Text, nullable=False, default="")  # System prompt personality description
    temperature = Column(Float, nullable=False, default=0.85)  # DeepSeek temperature
    variant = Column(String(20), nullable=False, default="dark")  # dark / light / auto
    proposal_prefix = Column(String(20), nullable=False, default="AI")  # e.g. "TOBY", "LEXI", "MARCO"

    # Strategy config — JSON
    strategy_names = Column(Text, nullable=False, default='["explore","iterate","double_down","trending"]')
    strategy_weights = Column(Text, nullable=False, default='{"explore":0.30,"iterate":0.20,"double_down":0.30,"trending":0.20}')

    # Behaviour tuning
    risk_tolerance = Column(String(20), nullable=False, default="medium")  # low, medium, high
    proposals_per_brand = Column(Integer, nullable=False, default=3)
    content_types = Column(Text, nullable=False, default='["reel"]')  # ["reel"], ["post"], ["reel","post"]

    # Status
    active = Column(Boolean, nullable=False, default=True)
    is_builtin = Column(Boolean, nullable=False, default=False)  # True for Toby/Lexi (cannot delete)

    # Linked brand (the brand that caused this agent's creation)
    created_for_brand = Column(String(100), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_strategies(self) -> list:
        import json
        try:
            return json.loads(self.strategy_names)
        except Exception:
            return ["explore", "iterate", "double_down", "trending"]

    def get_strategy_weights(self) -> dict:
        import json
        try:
            return json.loads(self.strategy_weights)
        except Exception:
            return {"explore": 0.30, "iterate": 0.20, "double_down": 0.30, "trending": 0.20}

    def get_content_types(self) -> list:
        import json
        try:
            return json.loads(self.content_types)
        except Exception:
            return ["reel"]

    def to_dict(self):
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "display_name": self.display_name,
            "personality": self.personality[:200] if self.personality else "",
            "temperature": self.temperature,
            "variant": self.variant,
            "proposal_prefix": self.proposal_prefix,
            "strategy_names": self.get_strategies(),
            "strategy_weights": self.get_strategy_weights(),
            "risk_tolerance": self.risk_tolerance,
            "proposals_per_brand": self.proposals_per_brand,
            "content_types": self.get_content_types(),
            "active": self.active,
            "is_builtin": self.is_builtin,
            "created_for_brand": self.created_for_brand,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }