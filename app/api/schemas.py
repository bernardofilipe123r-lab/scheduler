"""
Pydantic schemas for API request and response models.
"""
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime
from app.core.config import BrandConfig
from app.core.constants import MAX_TITLE_LENGTH, MAX_LINE_LENGTH, MAX_CONTENT_LINES


class ReelCreateRequest(BaseModel):
    """Request model for creating a reel."""
    
    title: str = Field(
        ...,
        min_length=1,
        max_length=MAX_TITLE_LENGTH,
        description="The title of the reel (will be displayed prominently)"
    )
    
    lines: List[str] = Field(
        ...,
        min_length=1,
        max_length=MAX_CONTENT_LINES,
        description="List of content lines to display in the reel"
    )
    
    cta_type: str = Field(
        default="follow_tips",
        description="Call-to-action type: 'follow_tips', 'sleep_lean', or 'workout_plan'"
    )
    
    brand: str = Field(
        ...,
        description="Brand identifier for styling and branding (e.g. 'healthycollege', 'prozis')"
    )
    
    music_id: str = Field(
        default="default_01",
        description="Background music identifier"
    )
    
    schedule_at: Optional[datetime] = Field(
        default=None,
        description="Optional scheduled publish time (ISO 8601 format)"
    )
    
    @field_validator("lines")
    @classmethod
    def validate_lines(cls, lines: List[str]) -> List[str]:
        """Validate content lines."""
        if not lines:
            raise ValueError("At least one content line is required")
        
        for i, line in enumerate(lines):
            if not line.strip():
                raise ValueError(f"Line {i+1} cannot be empty or whitespace")
            if len(line) > MAX_LINE_LENGTH:
                raise ValueError(
                    f"Line {i+1} exceeds maximum length of {MAX_LINE_LENGTH} characters"
                )
        
        return lines
    
    @field_validator("title")
    @classmethod
    def validate_title(cls, title: str) -> str:
        """Validate title."""
        if not title.strip():
            raise ValueError("Title cannot be empty or whitespace")
        return title.strip()
    
    @field_validator("schedule_at")
    @classmethod
    def validate_schedule_time(cls, schedule_at: Optional[datetime]) -> Optional[datetime]:
        """Validate scheduled time is in the future."""
        if schedule_at and schedule_at <= datetime.now(schedule_at.tzinfo):
            raise ValueError("Scheduled time must be in the future")
        return schedule_at
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "title": "HOW TO EARN RESPECT",
                "lines": [
                    "Talk less, show real results.",
                    "Do not let anyone know your next move.",
                    "Do not call anyone more than twice."
                ],
                "cta_type": "FOLLOW_PART_2",
                "brand": "mybrand",
                "music_id": "default_01",
                "schedule_at": "2026-01-10T18:00:00Z"
            }
        }
    }


class ReelCreateResponse(BaseModel):
    """Response model for reel creation."""
    
    thumbnail_path: str = Field(
        ...,
        description="Path to the generated thumbnail image"
    )
    
    reel_image_path: str = Field(
        ...,
        description="Path to the generated reel image"
    )
    
    video_path: str = Field(
        ...,
        description="Path to the generated video file"
    )
    
    caption: str = Field(
        ...,
        description="Generated caption for the reel"
    )
    
    reel_id: str = Field(
        ...,
        description="Unique identifier for this reel"
    )
    
    scheduled_at: Optional[datetime] = Field(
        default=None,
        description="Scheduled publish time if provided"
    )
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "thumbnail_path": "https://<project>.supabase.co/storage/v1/object/public/media/<user_id>/<brand>/thumbnails/thumb.png",
                "reel_image_path": "https://<project>.supabase.co/storage/v1/object/public/media/<user_id>/<brand>/reels/reel.png",
                "video_path": "https://<project>.supabase.co/storage/v1/object/public/media/<user_id>/<brand>/videos/video.mp4",
                "caption": "HOW TO EARN RESPECT\n\n1. Talk less...",
                "reel_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "scheduled_at": "2026-01-10T18:00:00Z"
            }
        }
    }


class ErrorResponse(BaseModel):
    """Error response model."""
    
    error: str = Field(..., description="Error message")
    detail: Optional[str] = Field(None, description="Detailed error information")
