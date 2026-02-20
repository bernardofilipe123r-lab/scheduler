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

    # Discovery Configuration — empty, user defines competitor accounts and hashtags
    competitor_accounts = Column(JSONB, default=[])
    discovery_hashtags = Column(JSONB, default=[])

    # Citation / source style — determines carousel post source format
    # Values: "academic_doi" | "financial_data" | "case_study" | "expert_quote" | "none"
    citation_style = Column(String, default="none")

    # Source databases/organizations for citations (overrides built-in defaults when set)
    citation_source_types = Column(JSONB, default=[])

    # Visual composition style — replaces REEL_BASE_STYLE per niche
    image_composition_style = Column(Text, default="")

    # YouTube title examples — good titles that show format for this niche
    yt_title_examples = Column(JSONB, default=[])

    # YouTube title bad examples — titles to avoid for this niche
    yt_title_bad_examples = Column(JSONB, default=[])

    # Carousel CTA topic word — the niche-relevant word used in slide 4 CTA
    carousel_cta_topic = Column(String, default="")

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
