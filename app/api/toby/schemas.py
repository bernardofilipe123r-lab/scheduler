"""Pydantic schemas for Toby API requests and responses."""
from pydantic import BaseModel, Field
from typing import Optional

from app.core.platforms import SUPPORTED_PLATFORMS_SET


class TobyConfigUpdate(BaseModel):
    """Request to update Toby configuration."""
    buffer_days: Optional[int] = Field(None, ge=1, le=10)
    explore_ratio: Optional[float] = Field(None, ge=0.0, le=1.0)
    reel_slots_per_day: Optional[int] = Field(None, ge=0, le=24)
    post_slots_per_day: Optional[int] = Field(None, ge=0, le=24)
    reels_enabled: Optional[bool] = None
    posts_enabled: Optional[bool] = None
    threads_enabled: Optional[bool] = None
    auto_schedule: Optional[bool] = None
    buffer_reminder_enabled: Optional[bool] = None


# Re-export for backwards compat — canonical source is app.core.platforms
ALL_PLATFORMS = SUPPORTED_PLATFORMS_SET


class TobyBrandConfigUpdate(BaseModel):
    """Request to update per-brand Toby configuration."""
    enabled: Optional[bool] = None
    reel_slots_per_day: Optional[int] = Field(None, ge=0, le=6)
    post_slots_per_day: Optional[int] = Field(None, ge=0, le=2)
    reel_format: Optional[str] = Field(None, pattern="^(format_a|format_b)$")
    reels_share_to_feed: Optional[bool] = None
    # Per-content-type platform selection.
    # Dict keyed by content-type key ("reels", "posts") → list of platform IDs.
    # Example: {"reels": ["instagram", "youtube"], "posts": ["instagram", "threads"]}
    # None = keep existing.  null in JSON body = all connected for all types.
    enabled_platforms: Optional[dict[str, list[str]]] = None
