"""
Scheduled reel model.
"""
from datetime import datetime, timezone
from sqlalchemy import Index
from app.models.base import Base, Column, String, DateTime, Text, JSON


def _utc_now():
    return datetime.now(timezone.utc)


class ScheduledReel(Base):
    """Model for scheduled reels with user support."""
    __tablename__ = "scheduled_reels"
    
    __table_args__ = (
        Index("ix_scheduled_reels_status_time", "status", "scheduled_time"),
    )
    
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
    created_at = Column(DateTime(timezone=True), default=_utc_now, nullable=False)
    
    # Publishing status
    status = Column(String(20), default="scheduled", nullable=False, index=True)
    # Status values: "scheduled", "published", "failed"
    
    published_at = Column(DateTime(timezone=True), nullable=True)
    publish_error = Column(Text, nullable=True)
    
    # Extra data (platforms, video_path, thumbnail_path, etc.)
    extra_data = Column(JSON, nullable=True)
    
    # Who created this: 'user' (manual) or 'toby' (autonomous)
    created_by = Column(String(20), default="user", nullable=True)
    
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
            "created_by": self.created_by or "user",
            "metadata": self.extra_data or {}  # Return as "metadata" for API compatibility
        }
