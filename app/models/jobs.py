"""
Generation job model.
"""
from datetime import datetime
from app.models.base import Base, Column, String, DateTime, Text, Boolean, Integer, JSON


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
    fixed_title = Column(Boolean, default=False, nullable=False, server_default="false")
    
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
            "fixed_title": getattr(self, 'fixed_title', False) or False,
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
