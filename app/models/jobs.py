"""
Generation job model.
"""
from datetime import datetime
from typing import Any, Dict, List
from sqlalchemy.dialects.postgresql import JSONB
from app.models.base import Base, Column, String, DateTime, Text, Boolean, Integer, JSON
from app.core.platforms import LEGACY_DEFAULT_PLATFORMS


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
    image_model = Column(String(50), nullable=True)  # AI image model override (e.g. "Flux1schnell", "ZImageTurbo_INT8")

    # Music track selection (NULL = auto weighted-random)
    music_track_id = Column(Text, nullable=True)

    # Music source: 'none', 'trending_random', 'trending_pick'
    music_source = Column(Text, default="none", nullable=True)

    # Content format: 'format_a' (default) | 'format_b'
    content_format = Column(String(30), default="format_a", nullable=True)

    # Format B specific metadata (polished story, source URL, fingerprint, etc.)
    format_b_data = Column(JSONB, nullable=True)

    # Number of content items per brand. Default 1 (single content).
    # When >1, brand_outputs values are arrays of dicts instead of single dicts.
    content_count = Column(Integer, default=1, nullable=False, server_default="1")

    # Generated outputs per brand
    # content_count=1: {"brand": {"reel_id": "...", "status": "completed", ...}}
    # content_count>1: {"brand": [{"content_index": 0, "status": "completed", ...}, ...]}
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

    # Creator tracking
    created_by = Column(String(20), default="user", nullable=True)

    # Error tracking
    error_message = Column(Text, nullable=True)

    # ── Multi-content helpers ──────────────────────────────────────────

    @property
    def is_multi_content(self) -> bool:
        """True if this job has multiple content items per brand."""
        return (getattr(self, 'content_count', 1) or 1) > 1

    def get_brand_output(self, brand: str, content_index: int = 0) -> Dict[str, Any]:
        """Get output for a specific brand and content index.

        For single-content jobs (content_count=1), content_index is ignored
        and the dict is returned as-is. For multi-content jobs, returns the
        item at the given index from the array.
        """
        data = (self.brand_outputs or {}).get(brand, {})
        if isinstance(data, list):
            return data[content_index] if content_index < len(data) else {}
        # Legacy single-content format
        return data if content_index == 0 else {}

    def get_brand_outputs_list(self, brand: str) -> List[Dict[str, Any]]:
        """Get all outputs for a brand as a list (always returns a list)."""
        data = (self.brand_outputs or {}).get(brand, {})
        if isinstance(data, list):
            return data
        return [data] if data else []

    def to_dict(self):
        """Convert to dictionary for API responses."""
        # Safely get platforms - handle case where column doesn't exist yet in DB
        try:
            platforms = self.platforms or list(LEGACY_DEFAULT_PLATFORMS)
        except Exception:
            platforms = list(LEGACY_DEFAULT_PLATFORMS)

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
            "image_model": getattr(self, 'image_model', None),
            "platforms": platforms,
            "brand_outputs": self.brand_outputs or {},
            "content_count": getattr(self, 'content_count', 1) or 1,
            "ai_background_path": self.ai_background_path,
            "current_step": self.current_step,
            "progress_percent": self.progress_percent,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error_message": self.error_message,
            "created_by": getattr(self, 'created_by', None) or "user",
            "music_track_id": getattr(self, 'music_track_id', None),
            "music_source": getattr(self, 'music_source', 'none') or 'none',
            "content_format": getattr(self, 'content_format', 'format_a') or 'format_a',
            "format_b_data": getattr(self, 'format_b_data', None),
        }
