"""
NicheConfigService — loads, merges, and caches niche configuration.

Strategy:
1. Load global config (brand_id IS NULL)
2. Load per-brand config (brand_id = ?)
3. Merge: per-brand values override global values (non-NULL fields only)
4. Return as PromptContext
5. Cache with 5-minute TTL
"""

from typing import Optional
from datetime import datetime, timedelta
from app.core.prompt_context import PromptContext


class NicheConfigService:

    _cache: dict = {}
    _cache_ttl = timedelta(minutes=5)
    _cache_timestamps: dict = {}

    def get_context(self, brand_id: Optional[str] = None, user_id: Optional[str] = None) -> PromptContext:
        cache_key = f"{user_id}:{brand_id or 'global'}"

        if cache_key in self._cache:
            cached_at = self._cache_timestamps.get(cache_key)
            if cached_at and datetime.utcnow() - cached_at < self._cache_ttl:
                return self._cache[cache_key]

        ctx = self._load_and_merge(brand_id, user_id)

        self._cache[cache_key] = ctx
        self._cache_timestamps[cache_key] = datetime.utcnow()

        return ctx

    def invalidate_cache(self, brand_id: Optional[str] = None, user_id: Optional[str] = None):
        if brand_id and user_id:
            self._cache.pop(f"{user_id}:{brand_id}", None)
        if user_id:
            self._cache.pop(f"{user_id}:global", None)
        else:
            self._cache.clear()
            self._cache_timestamps.clear()

    def _load_and_merge(self, brand_id: Optional[str], user_id: Optional[str]) -> PromptContext:
        from app.db_connection import get_db_session
        from app.models.niche_config import NicheConfig

        ctx = PromptContext()  # Defaults = current hardcoded values

        if not user_id:
            return ctx

        try:
            with get_db_session() as db:
                global_cfg = (
                    db.query(NicheConfig)
                    .filter(NicheConfig.user_id == user_id, NicheConfig.brand_id.is_(None))
                    .first()
                )

                if global_cfg:
                    ctx = self._apply_config(ctx, global_cfg)

                if brand_id:
                    brand_cfg = (
                        db.query(NicheConfig)
                        .filter(NicheConfig.user_id == user_id, NicheConfig.brand_id == brand_id)
                        .first()
                    )
                    if brand_cfg:
                        ctx = self._apply_config(ctx, brand_cfg)

        except Exception as e:
            print(f"Warning: Could not load niche config, using defaults: {e}")

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
            'follow_section_text': 'follow_section_text',
            'save_section_text': 'save_section_text',
            'disclaimer_text': 'disclaimer_text',
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
