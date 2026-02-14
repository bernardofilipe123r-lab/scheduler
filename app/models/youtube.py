"""
YouTube channel model.
"""
from datetime import datetime
from app.models.base import Base, Column, String, DateTime, Text


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
    user_id = Column(String(100), nullable=False, index=True)
    
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
