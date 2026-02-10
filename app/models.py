"""
Database models for PostgreSQL storage.
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Boolean, Integer, JSON
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