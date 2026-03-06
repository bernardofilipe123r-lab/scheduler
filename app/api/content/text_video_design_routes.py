"""API routes for TEXT-VIDEO design preferences (per-user)."""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.api.auth.middleware import get_current_user
from app.models.text_video_design import TextVideoDesign

router = APIRouter(prefix="/api/content/text-video/design", tags=["text-video-design"])


class DesignUpdate(BaseModel):
    # Reel body settings
    reel_text_font: Optional[str] = None
    reel_text_size: Optional[int] = Field(None, ge=20, le=100)
    reel_line_spacing: Optional[int] = Field(None, ge=0, le=60)
    reel_text_region_pct: Optional[float] = Field(None, ge=0.3, le=0.8)
    reel_text_bg_opacity: Optional[int] = Field(None, ge=0, le=100)
    image_duration: Optional[float] = Field(None, ge=1.0, le=10.0)
    image_fade_duration: Optional[float] = Field(None, ge=0.0, le=2.0)
    reel_total_duration: Optional[int] = Field(None, ge=5, le=60)
    black_fade_duration: Optional[float] = Field(None, ge=0.0, le=3.0)
    show_logo: Optional[bool] = None
    show_handle: Optional[bool] = None
    instagram_handle: Optional[str] = Field(None, max_length=100)

    # Reel frame layout
    reel_section_gap: Optional[int] = Field(None, ge=0, le=120)
    reel_padding_top: Optional[int] = Field(None, ge=0, le=600)
    reel_padding_bottom: Optional[int] = Field(None, ge=0, le=200)
    reel_padding_left: Optional[int] = Field(None, ge=0, le=200)
    reel_padding_right: Optional[int] = Field(None, ge=0, le=200)
    reel_image_height: Optional[int] = Field(None, ge=200, le=1200)
    reel_avg_word_count: Optional[int] = Field(None, ge=10, le=200)
    reel_brand_name_color: Optional[str] = Field(None, max_length=20)
    reel_brand_name_size: Optional[int] = Field(None, ge=10, le=40)
    reel_handle_color: Optional[str] = Field(None, max_length=20)
    reel_handle_size: Optional[int] = Field(None, ge=8, le=30)

    # Thumbnail settings
    thumbnail_title_color: Optional[str] = Field(None, max_length=20)
    thumbnail_title_font: Optional[str] = Field(None, max_length=100)
    thumbnail_title_size: Optional[int] = Field(None, ge=20, le=120)
    thumbnail_title_max_lines: Optional[int] = Field(None, ge=1, le=6)
    thumbnail_title_padding: Optional[int] = Field(None, ge=0, le=100)
    thumbnail_image_ratio: Optional[float] = Field(None, ge=0.3, le=0.8)
    thumbnail_divider_style: Optional[str] = Field(None, max_length=50)
    thumbnail_overlay_opacity: Optional[int] = Field(None, ge=0, le=100)


@router.get("")
async def get_design(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get user's TEXT-VIDEO design preferences."""
    user_id = user["id"]

    design = db.query(TextVideoDesign).filter(TextVideoDesign.user_id == user_id).first()

    if design:
        return design.to_dict()

    # Return defaults
    return TextVideoDesign().to_dict()


@router.put("")
async def update_design(
    request: DesignUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create or update user's TEXT-VIDEO design preferences."""
    user_id = user["id"]

    design = db.query(TextVideoDesign).filter(TextVideoDesign.user_id == user_id).first()

    if not design:
        design = TextVideoDesign(user_id=user_id)
        db.add(design)

    update_data = request.model_dump(exclude_unset=True)
    for field_name, value in update_data.items():
        if value is not None:
            setattr(design, field_name, value)

    db.commit()
    db.refresh(design)

    return design.to_dict()
