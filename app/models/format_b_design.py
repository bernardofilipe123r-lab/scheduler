"""FormatBDesign model — per-user design preferences for Format B reels."""

from sqlalchemy import Column, String, Integer, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP
from app.models.base import Base


class FormatBDesign(Base):
    __tablename__ = "format_b_design"

    id = Column(UUID(as_uuid=False), primary_key=True, server_default="gen_random_uuid()")
    user_id = Column(String(100), nullable=False, unique=True)

    # Reel body settings
    reel_text_font = Column(String(100), default="Poppins-Bold.ttf")
    reel_text_size = Column(Integer, default=38)
    reel_line_spacing = Column(Integer, default=20)
    reel_text_region_pct = Column(Float, default=0.55)
    reel_text_bg_opacity = Column(Integer, default=85)
    reel_show_logo = Column(Boolean, default=True)
    reel_show_handle = Column(Boolean, default=True)
    reel_handle_text = Column(String(100), default="")
    image_duration = Column(Float, default=3.0)
    image_fade_duration = Column(Float, default=0.2)
    reel_total_duration = Column(Integer, default=15)
    black_fade_duration = Column(Float, default=1.0)

    # Reel frame layout (brand header + text + image)
    reel_section_gap = Column(Integer, default=40)
    reel_gap_header_text = Column(Integer, default=40)
    reel_gap_text_media = Column(Integer, default=40)
    reel_logo_size = Column(Integer, default=96)
    reel_padding_top = Column(Integer, default=320)
    reel_padding_bottom = Column(Integer, default=40)
    reel_padding_left = Column(Integer, default=85)
    reel_padding_right = Column(Integer, default=85)
    reel_image_height = Column(Integer, default=660)
    reel_avg_word_count = Column(Integer, default=55)
    reel_brand_name_color = Column(String(20), default="#FFFFFF")
    reel_brand_name_size = Column(Integer, default=42)
    reel_handle_color = Column(String(20), default="#AAAAAA")
    reel_handle_size = Column(Integer, default=32)
    reel_header_scale = Column(Float, default=1.15)
    reel_text_font_bold = Column(Boolean, default=False)
    reel_text_color = Column(String(20), default="#FFFFFF")
    reel_music_enabled = Column(Boolean, default=True)

    # Thumbnail settings
    thumbnail_title_color = Column(String(10), default="#FFD700")
    thumbnail_title_font = Column(String(100), default="Anton-Regular.ttf")
    thumbnail_title_size = Column(Integer, default=120)
    thumbnail_title_max_lines = Column(Integer, default=4)
    thumbnail_title_padding_x = Column(Integer, default=220)
    thumbnail_image_ratio = Column(Float, default=0.6)
    thumbnail_divider_style = Column(String(30), default="line_with_logo")
    thumbnail_divider_thickness = Column(Integer, default=4)
    thumbnail_overlay_opacity = Column(Integer, default=90)
    thumbnail_logo_size = Column(Integer, default=100)

    created_at = Column(TIMESTAMP(timezone=True), server_default="now()")
    updated_at = Column(TIMESTAMP(timezone=True), server_default="now()")

    def to_dict(self):
        return {
            "id": str(self.id) if self.id else None,
            "user_id": self.user_id,
            "reel_text_font": self.reel_text_font,
            "reel_text_size": self.reel_text_size,
            "reel_line_spacing": self.reel_line_spacing,
            "reel_text_region_pct": self.reel_text_region_pct,
            "reel_text_bg_opacity": self.reel_text_bg_opacity,
            "show_logo": self.reel_show_logo,
            "show_handle": self.reel_show_handle,
            "reel_handle_text": self.reel_handle_text,
            "image_duration": self.image_duration,
            "image_fade_duration": self.image_fade_duration,
            "reel_total_duration": self.reel_total_duration,
            "black_fade_duration": self.black_fade_duration,
            "reel_section_gap": self.reel_section_gap,
            "reel_gap_header_text": self.reel_gap_header_text,
            "reel_gap_text_media": self.reel_gap_text_media,
            "reel_logo_size": self.reel_logo_size,
            "reel_padding_top": self.reel_padding_top,
            "reel_padding_bottom": self.reel_padding_bottom,
            "reel_padding_left": self.reel_padding_left,
            "reel_padding_right": self.reel_padding_right,
            "reel_image_height": self.reel_image_height,
            "reel_avg_word_count": self.reel_avg_word_count,
            "reel_brand_name_color": self.reel_brand_name_color,
            "reel_brand_name_size": self.reel_brand_name_size,
            "reel_handle_color": self.reel_handle_color,
            "reel_handle_size": self.reel_handle_size,
            "reel_header_scale": self.reel_header_scale,
            "reel_text_font_bold": self.reel_text_font_bold,
            "reel_text_color": self.reel_text_color,
            "reel_music_enabled": self.reel_music_enabled,
            "thumbnail_title_color": self.thumbnail_title_color,
            "thumbnail_title_font": self.thumbnail_title_font,
            "thumbnail_title_size": self.thumbnail_title_size,
            "thumbnail_title_max_lines": self.thumbnail_title_max_lines,
            "thumbnail_title_padding": self.thumbnail_title_padding_x,
            "thumbnail_image_ratio": self.thumbnail_image_ratio,
            "thumbnail_divider_style": self.thumbnail_divider_style,
            "thumbnail_divider_thickness": self.thumbnail_divider_thickness,
            "thumbnail_overlay_opacity": self.thumbnail_overlay_opacity,
            "thumbnail_logo_size": self.thumbnail_logo_size,
        }
