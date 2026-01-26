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
