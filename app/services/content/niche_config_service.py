"""
NicheConfigService — loads and caches niche configuration per user.

Content DNA is user-level, not per-brand.
"""

import logging
from typing import Optional
from datetime import datetime, timedelta
from app.core.prompt_context import PromptContext

logger = logging.getLogger(__name__)


class NicheConfigService:

    _cache: dict = {}
    _cache_ttl = timedelta(minutes=5)
    _cache_timestamps: dict = {}

    def get_context(self, user_id: Optional[str] = None, db=None, **kwargs) -> PromptContext:
        # Accept and ignore brand_id for backward compat with callers
        cache_key = f"{user_id}"

        if cache_key in self._cache:
            cached_at = self._cache_timestamps.get(cache_key)
            if cached_at and datetime.utcnow() - cached_at < self._cache_ttl:
                return self._cache[cache_key]

        ctx = self._load(user_id, db=db)

        self._cache[cache_key] = ctx
        self._cache_timestamps[cache_key] = datetime.utcnow()

        return ctx

    def invalidate_cache(self, user_id: Optional[str] = None, **kwargs):
        # Accept and ignore brand_id for backward compat with callers
        if user_id:
            self._cache.pop(f"{user_id}", None)
        else:
            self._cache.clear()
            self._cache_timestamps.clear()

    def _load(self, user_id: Optional[str], db=None) -> PromptContext:
        from app.models.niche_config import NicheConfig

        ctx = PromptContext()  # Defaults = current hardcoded values

        if not user_id:
            return ctx

        try:
            if db:
                cfg = (
                    db.query(NicheConfig)
                    .filter(NicheConfig.user_id == user_id)
                    .first()
                )
                if cfg:
                    ctx = self._apply_config(ctx, cfg)
            else:
                from app.db_connection import get_db_session
                with get_db_session() as session:
                    cfg = (
                        session.query(NicheConfig)
                        .filter(NicheConfig.user_id == user_id)
                        .first()
                    )
                    if cfg:
                        ctx = self._apply_config(ctx, cfg)

        except Exception as e:
            logger.error("Failed to load niche config for user %s: %s", user_id, e, exc_info=True)

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

        for db_field, ctx_field in field_map.items():
            val = getattr(cfg, db_field, None)
            if val is not None:
                setattr(ctx, ctx_field, val)

        return ctx


# Singleton
_instance = None


def get_niche_config_service() -> NicheConfigService:
    global _instance
    if _instance is None:
        _instance = NicheConfigService()
    return _instance
