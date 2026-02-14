"""
Brand model.
"""
from datetime import datetime
from app.models.base import Base, Column, String, DateTime, Text, Boolean, Integer, JSON


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
