"""
Brand configurations for the reels automation system.
All brand data is loaded dynamically from the database.
"""
from typing import Tuple, Optional
from dataclasses import dataclass
import os

from app.core.brand_colors import hex_to_rgb, hex_to_rgba

# ---------------------------------------------------------------------------
# Supabase configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")  # publishable/anon key
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")  # service role key (backend only)


# Legacy alias — kept so existing imports don't break at module level.
# BrandType was a str Enum; now it's just `str`.
BrandType = str


@dataclass
class BrandConfig:
    """Brand configuration settings."""
    name: str
    display_name: str
    primary_color: Tuple[int, int, int]  # RGB - light mode background
    secondary_color: Tuple[int, int, int]  # RGB - brand's main color
    text_color: Tuple[int, int, int]  # RGB - brand text color
    highlight_color: Tuple[int, int, int, int]  # RGBA - light mode content bg
    logo_filename: str  # Relative to assets/logos/
    thumbnail_bg_color: Tuple[int, int, int]  # RGB for thumbnail background
    thumbnail_text_color: Tuple[int, int, int]  # RGB for thumbnail text
    content_title_color: Tuple[int, int, int]  # RGB for content title text
    content_highlight_color: Tuple[int, int, int, int]  # RGBA for content title background
    instagram_business_account_id: Optional[str] = None
    facebook_page_id: Optional[str] = None
    meta_access_token: Optional[str] = None


# Default neutral colors used when a brand has no color config in the DB
_DEFAULT_PRIMARY = hex_to_rgb("#e5e7eb")
_DEFAULT_SECONDARY = hex_to_rgb("#374151")
_DEFAULT_TEXT = hex_to_rgb("#000000")
_DEFAULT_HIGHLIGHT = hex_to_rgba("#e5e7eb")


def get_brand_config(brand_id) -> BrandConfig:
    """
    Get the brand configuration for any brand (by string ID or legacy enum value).

    Loads all data from the database. Falls back to neutral defaults when
    the brand is not found.

    Args:
        brand_id: Brand identifier (e.g. 'healthycollege', 'prozis', 'nike')

    Returns:
        A BrandConfig populated from DB data or safe defaults.
    """
    # Normalise: accept enum-style values like 'HEALTHY_COLLEGE' or plain IDs
    key = str(brand_id).lower().replace("_", "")
    # Strip leading "the" for matching
    if key.startswith("the"):
        key = key[3:]

    try:
        from app.services.brands.resolver import brand_resolver
        db_config = brand_resolver.get_brand_config(key)
        if db_config is not None:
            return db_config
        # Try the original string too (in case normalisation differs)
        db_config = brand_resolver.get_brand_config(str(brand_id))
        if db_config is not None:
            return db_config
    except Exception:
        pass

    # Return neutral defaults for unknown brands
    return BrandConfig(
        name=str(brand_id),
        display_name=str(brand_id),
        primary_color=_DEFAULT_PRIMARY,
        secondary_color=_DEFAULT_SECONDARY,
        text_color=_DEFAULT_TEXT,
        highlight_color=_DEFAULT_HIGHLIGHT,
        logo_filename="default_logo.png",
        thumbnail_bg_color=_DEFAULT_PRIMARY,
        thumbnail_text_color=_DEFAULT_TEXT,
        content_title_color=_DEFAULT_TEXT,
        content_highlight_color=hex_to_rgba("#374151"),
    )
