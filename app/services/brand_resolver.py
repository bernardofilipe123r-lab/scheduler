"""
Dynamic brand resolution from database.
Replaces ALL hardcoded brand maps (BRAND_NAME_MAP, brand_mapping, BRAND_CONFIGS, etc.)

Usage:
    from app.services.brand_resolver import brand_resolver

    brand = brand_resolver.get_brand("healthycollege")
    brand_id = brand_resolver.resolve_brand_name("Healthy College")
    config = brand_resolver.get_brand_config("healthycollege")
    all_ids = brand_resolver.get_all_brand_ids()
"""
import re
import time
import logging
import threading
from typing import Optional

from app.core.config import BrandType, BrandConfig
from app.core.brand_colors import hex_to_rgb, hex_to_rgba
from app.models import Brand

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 60


class BrandResolver:
    """
    Resolves brand names/IDs dynamically from the database.
    Caches results with TTL to avoid repeated DB queries.
    Thread-safe singleton.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._brands: list[Brand] = []
        self._brands_by_id: dict[str, Brand] = {}
        self._last_refresh: float = 0.0

    # ── Cache management ──────────────────────────────────────

    def _needs_refresh(self) -> bool:
        return time.time() - self._last_refresh > _CACHE_TTL_SECONDS

    def _refresh_cache(self) -> None:
        """Load all active brands from DB into memory."""
        from app.db_connection import SessionLocal

        try:
            db = SessionLocal()
            try:
                brands = db.query(Brand).filter(Brand.active.is_(True)).all()
                # Detach from session so objects survive after close
                db.expunge_all()
            finally:
                db.close()

            with self._lock:
                self._brands = brands
                self._brands_by_id = {b.id: b for b in brands}
                self._last_refresh = time.time()

            logger.debug("BrandResolver cache refreshed: %d brands", len(brands))
        except Exception as e:
            logger.error("BrandResolver failed to refresh cache: %s", e)
            # Keep stale cache rather than blowing up

    def _ensure_cache(self) -> None:
        if self._needs_refresh():
            self._refresh_cache()

    def invalidate_cache(self) -> None:
        """Clear cache (call after brand create/update/delete)."""
        with self._lock:
            self._last_refresh = 0.0

    # ── Core lookups ──────────────────────────────────────────

    def get_all_brands(self) -> list[Brand]:
        """Get all active brands from DB (cached)."""
        self._ensure_cache()
        return list(self._brands)

    def get_brand(self, brand_id: str) -> Optional[Brand]:
        """Get a single brand by ID (e.g., 'healthycollege')."""
        self._ensure_cache()
        return self._brands_by_id.get(brand_id)

    def get_all_brand_ids(self) -> list[str]:
        """Get list of all active brand IDs."""
        self._ensure_cache()
        return list(self._brands_by_id.keys())

    # ── Flexible name resolution ──────────────────────────────

    @staticmethod
    def _normalize(name: str) -> str:
        """
        Normalize a brand name for matching:
        - lowercase
        - strip underscores, spaces, hyphens
        - remove leading 'the'
        """
        s = name.lower().strip()
        s = re.sub(r"[\s_\-]+", "", s)
        if s.startswith("the"):
            s = s[3:]
        return s

    def resolve_brand_name(self, name: str) -> Optional[str]:
        """
        Resolve any brand name variant to the canonical brand ID.

        Handles: 'healthycollege', 'healthy_college', 'Healthy College',
                 'HEALTHY_COLLEGE', 'thehealthycollege', etc.
        Returns the brand's ID (e.g., 'healthycollege') or None.
        """
        if not name:
            return None

        self._ensure_cache()

        # Fast path: exact match
        if name in self._brands_by_id:
            return name

        normalized = self._normalize(name)

        for brand_id in self._brands_by_id:
            if self._normalize(brand_id) == normalized:
                return brand_id

        return None

    # ── Legacy bridges ────────────────────────────────────────

    def get_brand_type(self, brand_name: str) -> Optional[BrandType]:
        """
        Resolve brand name to BrandType enum (for legacy code that still needs it).
        Maps brand_id → BrandType by convention, e.g. 'healthycollege' → HEALTHY_COLLEGE.
        """
        brand_id = self.resolve_brand_name(brand_name)
        if not brand_id:
            return None

        # Try direct enum lookup using convention:
        #   'gymcollege' → 'THE_GYM_COLLEGE'
        #   'healthycollege' → 'HEALTHY_COLLEGE'
        # Build candidate enum names
        candidates = []

        # Split on 'college' boundary: 'healthycollege' → 'healthy', 'college'
        base = brand_id.replace("college", "")
        upper = f"{base}_COLLEGE".upper()
        candidates.append(upper)
        candidates.append(f"THE_{upper}")

        for candidate in candidates:
            try:
                return BrandType(candidate)
            except ValueError:
                continue

        return None

    def get_brand_config(self, brand_name: str) -> Optional[BrandConfig]:
        """
        Build a BrandConfig from DB data for code that still expects one.
        """
        brand_id = self.resolve_brand_name(brand_name)
        if not brand_id:
            return None

        brand = self._brands_by_id.get(brand_id)
        if not brand:
            return None

        colors = brand.colors or {}
        light = colors.get("light_mode", {})
        dark = colors.get("dark_mode", {})
        primary_hex = colors.get("primary", "#000000")
        accent_hex = colors.get("accent", "#666666")

        primary_rgb = hex_to_rgb(primary_hex)
        accent_rgb = hex_to_rgb(accent_hex)

        light_bg_hex = light.get("background", "#ffffff")
        dark_bg_hex = dark.get("background", "#000000")
        light_text_hex = light.get("text", "#000000")

        light_bg_rgba = hex_to_rgba(light_bg_hex)
        dark_bg_rgba = hex_to_rgba(dark_bg_hex)

        # Derive a BrandType name if possible (used by BrandConfig.name)
        brand_type = self.get_brand_type(brand_id)
        config_name = brand_type.value if brand_type else brand_id.upper()

        logo_filename = brand.logo_path or f"{brand_id.replace('college', '_college')}_logo.png"

        return BrandConfig(
            name=config_name,
            display_name=brand.display_name.replace("THE ", ""),
            primary_color=hex_to_rgb(light_bg_hex),
            secondary_color=primary_rgb,
            text_color=primary_rgb,
            highlight_color=light_bg_rgba,
            logo_filename=logo_filename,
            thumbnail_bg_color=hex_to_rgb(light_bg_hex),
            thumbnail_text_color=hex_to_rgb(light_text_hex),
            content_title_color=hex_to_rgb(light_text_hex),
            content_highlight_color=dark_bg_rgba,
            instagram_business_account_id=brand.instagram_business_account_id,
            facebook_page_id=brand.facebook_page_id,
            meta_access_token=brand.meta_access_token,
        )

    # ── Convenience accessors ─────────────────────────────────

    def get_brand_abbreviation(self, brand_id: str) -> str:
        """Get brand abbreviation (e.g., 'HCO' for healthycollege). Uses short_name from DB."""
        brand = self.get_brand(brand_id)
        return brand.short_name if brand else brand_id[:3].upper()

    def get_brand_display_name(self, brand_id: str) -> str:
        """Get display name from DB."""
        brand = self.get_brand(brand_id)
        return brand.display_name if brand else brand_id


# Module-level singleton
brand_resolver = BrandResolver()
