"""NicheConfig model — stores niche configuration per user/brand."""

from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, UniqueConstraint, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from app.models.base import Base
import uuid


class NicheConfig(Base):
    __tablename__ = "niche_config"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(100), nullable=False)

    # NULL brand_id = global config; non-NULL = per-brand override
    brand_id = Column(String(50), ForeignKey("brands.id", ondelete="CASCADE"), nullable=True)

    # Core Identity — all empty by default, user fills in everything
    niche_name = Column(String(100), nullable=False, default="")
    niche_description = Column(Text, default="")
    content_brief = Column(Text, default="")
    target_audience = Column(String(255), default="")
    audience_description = Column(Text, default="")
    content_tone = Column(JSONB, default=[])
    tone_avoid = Column(JSONB, default=[])

    # Topic Configuration — empty, user defines their own niche topics
    topic_categories = Column(JSONB, default=[])
    topic_keywords = Column(JSONB, default=[])
    topic_avoid = Column(JSONB, default=[])

    # Content Philosophy
    content_philosophy = Column(Text, default="")
    hook_themes = Column(JSONB, default=[])

    # User Examples (few-shot prompting)
    reel_examples = Column(JSONB, default=[])
    post_examples = Column(JSONB, default=[])

    # Visual Configuration
    image_style_description = Column(Text, default="")
    image_palette_keywords = Column(JSONB, default=[])

    # Brand Personality
    brand_personality = Column(Text, nullable=True)
    brand_focus_areas = Column(JSONB, default=[])
    parent_brand_name = Column(String(100), default="")

    # CTA Configuration — empty, user adds their own CTAs
    cta_options = Column(JSONB, default=[])
    hashtags = Column(JSONB, default=[])

    # Caption sections — empty until configured
    follow_section_text = Column(Text, default="")
    save_section_text = Column(Text, default="")
    disclaimer_text = Column(Text, default="")

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "brand_id", name="uq_niche_config_user_brand"),
    )
