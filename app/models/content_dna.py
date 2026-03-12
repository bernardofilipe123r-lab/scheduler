"""ContentDNAProfile model — stores reusable editorial blueprints (Content DNA).

One Content DNA → N Brands. Toby learns per (content_dna_id, content_type).
Replaces the old user-level niche_config as the source of editorial identity.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, Integer
from sqlalchemy.dialects.postgresql import JSONB
from app.models.base import Base
import uuid


def _utc_now():
    return datetime.now(timezone.utc)


class ContentDNAProfile(Base):
    __tablename__ = "content_dna_profiles"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(100), nullable=False, index=True)

    # Display
    name = Column(String(100), nullable=False, default="My Content DNA")
    description = Column(Text, default="")

    # Core Identity
    niche_name = Column(String(100), nullable=False, default="")
    niche_description = Column(Text, default="")
    content_brief = Column(Text, default="")
    target_audience = Column(String(255), default="")
    audience_description = Column(Text, default="")
    content_tone = Column(JSONB, default=[])
    tone_avoid = Column(JSONB, default=[])

    # Topic Configuration
    topic_categories = Column(JSONB, default=[])
    topic_keywords = Column(JSONB, default=[])
    topic_avoid = Column(JSONB, default=[])

    # Content Philosophy
    content_philosophy = Column(Text, default="")
    hook_themes = Column(JSONB, default=[])

    # User Examples
    reel_examples = Column(JSONB, default=[])
    post_examples = Column(JSONB, default=[])

    # Visual Configuration
    image_style_description = Column(Text, default="")
    image_palette_keywords = Column(JSONB, default=[])

    # Brand Personality
    brand_personality = Column(Text, nullable=True)
    brand_focus_areas = Column(JSONB, default=[])
    parent_brand_name = Column(String(100), default="")

    # CTA Configuration
    cta_options = Column(JSONB, default=[])
    hashtags = Column(JSONB, default=[])

    # Discovery Configuration
    competitor_accounts = Column(JSONB, default=[])
    discovery_hashtags = Column(JSONB, default=[])

    # Citation / Source style
    citation_style = Column(String(50), default="none")
    citation_source_types = Column(JSONB, default=[])

    # YouTube
    yt_title_examples = Column(JSONB, default=[])
    yt_title_bad_examples = Column(JSONB, default=[])

    # Carousel
    carousel_cta_topic = Column(String(255), default="")
    carousel_cta_options = Column(JSONB, default=[])
    carousel_cover_overlay_opacity = Column(Integer, default=65)
    carousel_content_overlay_opacity = Column(Integer, default=85)

    # Caption sections
    follow_section_text = Column(Text, default="")
    save_section_text = Column(Text, default="")
    disclaimer_text = Column(Text, default="")

    # Format B Reel Configuration
    format_b_reel_examples = Column(JSONB, default=[])
    format_b_story_niches = Column(JSONB, default=[])
    format_b_story_tone = Column(Text, default="")
    format_b_preferred_categories = Column(JSONB, default=[])

    # Threads
    threads_format_weights = Column(JSONB, default={})

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=_utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utc_now, onupdate=_utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "description": self.description or "",
            "niche_name": self.niche_name or "",
            "niche_description": self.niche_description or "",
            "content_brief": self.content_brief or "",
            "target_audience": self.target_audience or "",
            "audience_description": self.audience_description or "",
            "content_tone": self.content_tone or [],
            "tone_avoid": self.tone_avoid or [],
            "topic_categories": self.topic_categories or [],
            "topic_keywords": self.topic_keywords or [],
            "topic_avoid": self.topic_avoid or [],
            "content_philosophy": self.content_philosophy or "",
            "hook_themes": self.hook_themes or [],
            "reel_examples": self.reel_examples or [],
            "post_examples": self.post_examples or [],
            "image_style_description": self.image_style_description or "",
            "image_palette_keywords": self.image_palette_keywords or [],
            "brand_personality": self.brand_personality,
            "brand_focus_areas": self.brand_focus_areas or [],
            "parent_brand_name": self.parent_brand_name or "",
            "cta_options": self.cta_options or [],
            "hashtags": self.hashtags or [],
            "competitor_accounts": self.competitor_accounts or [],
            "discovery_hashtags": self.discovery_hashtags or [],
            "citation_style": self.citation_style or "none",
            "citation_source_types": self.citation_source_types or [],
            "yt_title_examples": self.yt_title_examples or [],
            "yt_title_bad_examples": self.yt_title_bad_examples or [],
            "carousel_cta_topic": self.carousel_cta_topic or "",
            "carousel_cta_options": self.carousel_cta_options or [],
            "carousel_cover_overlay_opacity": self.carousel_cover_overlay_opacity or 65,
            "carousel_content_overlay_opacity": self.carousel_content_overlay_opacity or 85,
            "follow_section_text": self.follow_section_text or "",
            "save_section_text": self.save_section_text or "",
            "disclaimer_text": self.disclaimer_text or "",
            "format_b_reel_examples": self.format_b_reel_examples or [],
            "format_b_story_niches": self.format_b_story_niches or [],
            "format_b_story_tone": self.format_b_story_tone or "",
            "format_b_preferred_categories": self.format_b_preferred_categories or [],
            "threads_format_weights": self.threads_format_weights or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
