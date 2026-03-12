"""
ContentDNAService — loads Content DNA profiles and returns PromptContext.

Toby learns per (content_dna_id, content_type). Brands are just publishing
vehicles — they point to a DNA via brands.content_dna_id.

Replaces the old user-level NicheConfigService as the primary resolver.
"""
import logging
from typing import Optional
from datetime import datetime, timedelta, timezone
from app.core.prompt_context import PromptContext

logger = logging.getLogger(__name__)


class ContentDNAService:

    _cache: dict = {}
    _cache_ttl = timedelta(minutes=5)
    _cache_timestamps: dict = {}

    def get_context(
        self,
        user_id: str,
        content_dna_id: str,
        db=None,
        **kwargs,
    ) -> PromptContext:
        """Load PromptContext from a specific Content DNA profile."""
        cache_key = f"{user_id}:{content_dna_id}"

        if cache_key in self._cache:
            cached_at = self._cache_timestamps.get(cache_key)
            if cached_at and datetime.now(timezone.utc) - cached_at < self._cache_ttl:
                return self._cache[cache_key]

        ctx = self._load(user_id, content_dna_id, db=db)

        self._cache[cache_key] = ctx
        self._cache_timestamps[cache_key] = datetime.now(timezone.utc)

        return ctx

    def get_context_for_brand(
        self,
        user_id: str,
        brand_id: str,
        db=None,
        **kwargs,
    ) -> PromptContext:
        """Resolve brand → content_dna_id → PromptContext."""
        dna_id = self.get_dna_id_for_brand(brand_id, db)
        if not dna_id:
            logger.warning("Brand %s has no content_dna_id, falling back to first DNA for user %s", brand_id, user_id)
            dna_id = self._get_first_dna_id(user_id, db)
        if not dna_id:
            return PromptContext()
        return self.get_context(user_id, dna_id, db=db)

    def get_dna_id_for_brand(self, brand_id: str, db=None) -> Optional[str]:
        """Resolve brand → content_dna_id."""
        from app.models.brands import Brand

        if not brand_id:
            return None
        try:
            if db:
                brand = db.query(Brand).filter(Brand.id == brand_id).first()
                return brand.content_dna_id if brand else None
            else:
                from app.db_connection import get_db_session
                with get_db_session() as session:
                    brand = session.query(Brand).filter(Brand.id == brand_id).first()
                    return brand.content_dna_id if brand else None
        except Exception as e:
            logger.error("Failed to resolve DNA for brand %s: %s", brand_id, e)
            return None

    def invalidate_cache(self, user_id: Optional[str] = None, content_dna_id: Optional[str] = None, **kwargs):
        if user_id and content_dna_id:
            self._cache.pop(f"{user_id}:{content_dna_id}", None)
        elif user_id:
            keys_to_remove = [k for k in self._cache if k.startswith(f"{user_id}:")]
            for k in keys_to_remove:
                self._cache.pop(k, None)
                self._cache_timestamps.pop(k, None)
        else:
            self._cache.clear()
            self._cache_timestamps.clear()

    def _get_first_dna_id(self, user_id: str, db=None) -> Optional[str]:
        """Get the first (oldest) DNA profile for a user — used as fallback."""
        from app.models.content_dna import ContentDNAProfile

        try:
            if db:
                dna = (
                    db.query(ContentDNAProfile)
                    .filter(ContentDNAProfile.user_id == user_id)
                    .order_by(ContentDNAProfile.created_at.asc())
                    .first()
                )
                return dna.id if dna else None
            else:
                from app.db_connection import get_db_session
                with get_db_session() as session:
                    dna = (
                        session.query(ContentDNAProfile)
                        .filter(ContentDNAProfile.user_id == user_id)
                        .order_by(ContentDNAProfile.created_at.asc())
                        .first()
                    )
                    return dna.id if dna else None
        except Exception as e:
            logger.error("Failed to get first DNA for user %s: %s", user_id, e)
            return None

    def _load(self, user_id: str, content_dna_id: str, db=None) -> PromptContext:
        from app.models.content_dna import ContentDNAProfile

        ctx = PromptContext()

        if not content_dna_id:
            return ctx

        try:
            if db:
                cfg = (
                    db.query(ContentDNAProfile)
                    .filter(
                        ContentDNAProfile.id == content_dna_id,
                        ContentDNAProfile.user_id == user_id,
                    )
                    .first()
                )
                if cfg:
                    ctx = self._apply_config(ctx, cfg)
            else:
                from app.db_connection import get_db_session
                with get_db_session() as session:
                    cfg = (
                        session.query(ContentDNAProfile)
                        .filter(
                            ContentDNAProfile.id == content_dna_id,
                            ContentDNAProfile.user_id == user_id,
                        )
                        .first()
                    )
                    if cfg:
                        ctx = self._apply_config(ctx, cfg)
        except Exception as e:
            logger.error("Failed to load DNA %s for user %s: %s", content_dna_id, user_id, e, exc_info=True)

        return ctx

    def _apply_config(self, ctx: PromptContext, cfg) -> PromptContext:
        field_map = {
            'niche_name': 'niche_name',
            'niche_description': 'niche_description',
            'content_brief': 'content_brief',
            'target_audience': 'target_audience',
            'audience_description': 'audience_description',
            'content_tone': 'content_tone',
            'tone_avoid': 'tone_avoid',
            'topic_categories': 'topic_categories',
            'topic_keywords': 'topic_keywords',
            'topic_avoid': 'topic_avoid',
            'content_philosophy': 'content_philosophy',
            'hook_themes': 'hook_themes',
            'reel_examples': 'reel_examples',
            'post_examples': 'post_examples',
            'image_style_description': 'image_style_description',
            'image_palette_keywords': 'image_palette_keywords',
            'brand_personality': 'brand_personality',
            'brand_focus_areas': 'brand_focus_areas',
            'parent_brand_name': 'parent_brand_name',
            'cta_options': 'cta_options',
            'hashtags': 'hashtags',
            'competitor_accounts': 'competitor_accounts',
            'discovery_hashtags': 'discovery_hashtags',
            'follow_section_text': 'follow_section_text',
            'save_section_text': 'save_section_text',
            'disclaimer_text': 'disclaimer_text',
            'citation_style': 'citation_style',
            'citation_source_types': 'citation_source_types',
            'yt_title_examples': 'yt_title_examples',
            'yt_title_bad_examples': 'yt_title_bad_examples',
            'carousel_cta_topic': 'carousel_cta_topic',
            'carousel_cta_options': 'carousel_cta_options',
            'carousel_cover_overlay_opacity': 'carousel_cover_overlay_opacity',
            'carousel_content_overlay_opacity': 'carousel_content_overlay_opacity',
            'format_b_reel_examples': 'format_b_reel_examples',
            'format_b_story_niches': 'format_b_story_niches',
            'format_b_story_tone': 'format_b_story_tone',
            'format_b_preferred_categories': 'format_b_preferred_categories',
            'threads_format_weights': 'threads_format_weights',
        }

        for ctx_field, cfg_field in field_map.items():
            val = getattr(cfg, cfg_field, None)
            if val is not None:
                setattr(ctx, ctx_field, val)

        return ctx


# Singleton
_instance: Optional[ContentDNAService] = None


def get_content_dna_service() -> ContentDNAService:
    global _instance
    if _instance is None:
        _instance = ContentDNAService()
    return _instance
