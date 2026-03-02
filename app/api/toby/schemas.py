"""Pydantic schemas for Toby API requests and responses."""
from pydantic import BaseModel, Field
from typing import Optional


class TobyConfigUpdate(BaseModel):
    """Request to update Toby configuration."""
    buffer_days: Optional[int] = Field(None, ge=1, le=7)
    explore_ratio: Optional[float] = Field(None, ge=0.0, le=1.0)
    reel_slots_per_day: Optional[int] = Field(None, ge=0, le=24)
    post_slots_per_day: Optional[int] = Field(None, ge=0, le=24)
    reels_enabled: Optional[bool] = None
    posts_enabled: Optional[bool] = None


class TobyBrandConfigUpdate(BaseModel):
    """Request to update per-brand Toby configuration."""
    enabled: Optional[bool] = None
    reel_slots_per_day: Optional[int] = Field(None, ge=0, le=6)
    post_slots_per_day: Optional[int] = Field(None, ge=0, le=2)
