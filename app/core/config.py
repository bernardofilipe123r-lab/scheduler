"""
Brand configurations for the reels automation system.
Colors are imported from brand_colors.py - the single source of truth.
"""
from enum import Enum
from typing import Dict, Tuple, Optional
from dataclasses import dataclass
import os

# Import colors from brand_colors.py - the single source of truth
from app.core.brand_colors import BRAND_COLORS, BRAND_DISPLAY_NAMES, hex_to_rgb, hex_to_rgba

# ---------------------------------------------------------------------------
# Supabase configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")  # publishable/anon key
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")  # service role key (backend only)


class BrandType(str, Enum):
    """Available brand types."""
    THE_GYM_COLLEGE = "THE_GYM_COLLEGE"
    HEALTHY_COLLEGE = "HEALTHY_COLLEGE"
    VITALITY_COLLEGE = "VITALITY_COLLEGE"
    LONGEVITY_COLLEGE = "LONGEVITY_COLLEGE"
    HOLISTIC_COLLEGE = "HOLISTIC_COLLEGE"
    WELLBEING_COLLEGE = "WELLBEING_COLLEGE"


# Map BrandType enum to brand_colors.py keys
BRAND_TYPE_TO_KEY = {
    BrandType.THE_GYM_COLLEGE: "gymcollege",
    BrandType.HEALTHY_COLLEGE: "healthycollege",
    BrandType.VITALITY_COLLEGE: "vitalitycollege",
    BrandType.LONGEVITY_COLLEGE: "longevitycollege",
    BrandType.HOLISTIC_COLLEGE: "holisticcollege",
    BrandType.WELLBEING_COLLEGE: "wellbeingcollege",
}


@dataclass
class BrandConfig:
    """Brand configuration settings."""
    name: str
    display_name: str
    primary_color: Tuple[int, int, int]  # RGB - light mode background (derived from light mode bg)
    secondary_color: Tuple[int, int, int]  # RGB - brand's main color (dark mode bg)
    text_color: Tuple[int, int, int]  # RGB - brand text color
    highlight_color: Tuple[int, int, int, int]  # RGBA - light mode content bg
    logo_filename: str  # Relative to assets/logos/
    thumbnail_bg_color: Tuple[int, int, int]  # RGB for thumbnail background
    thumbnail_text_color: Tuple[int, int, int]  # RGB for thumbnail text (light mode)
    content_title_color: Tuple[int, int, int]  # RGB for content title text (light mode)
    content_highlight_color: Tuple[int, int, int, int]  # RGBA for content title background (dark mode)
    instagram_business_account_id: Optional[str] = None  # Brand-specific Instagram ID
    facebook_page_id: Optional[str] = None  # Brand-specific Facebook Page ID
    meta_access_token: Optional[str] = None  # Brand-specific access token
    # Note: YouTube credentials are stored in the database (youtube_channels table)
    # They are obtained via OAuth flow (/api/youtube/connect) and never stored in env vars


def _create_brand_config(
    brand_type: BrandType,
    instagram_business_account_id: Optional[str] = None,
    facebook_page_id: Optional[str] = None,
    meta_access_token: Optional[str] = None,
) -> BrandConfig:
    """
    Create a BrandConfig using colors from brand_colors.py.
    This ensures colors are always synced with the single source of truth.
    """
    brand_key = BRAND_TYPE_TO_KEY[brand_type]
    colors = BRAND_COLORS[brand_key]
    display_name = BRAND_DISPLAY_NAMES.get(brand_key, brand_key.replace("college", " College").title())
    
    # Extract colors from brand_colors.py
    light_mode = colors.light_mode
    dark_mode = colors.dark_mode
    
    # secondary_color is the brand's main color (from dark mode bg, without alpha)
    secondary_color = dark_mode.content_title_bg_color[:3]
    
    # primary_color is derived from light mode bg (without alpha)
    primary_color = light_mode.content_title_bg_color[:3]
    
    return BrandConfig(
        name=brand_type.value,
        display_name=display_name.replace("THE ", ""),  # Remove "THE " prefix for display
        primary_color=primary_color,
        secondary_color=secondary_color,
        text_color=secondary_color,  # Text color matches brand color
        highlight_color=light_mode.content_title_bg_color,  # Light mode content bg (RGBA)
        logo_filename=f"{brand_key.replace('college', '_college')}_logo.png",
        thumbnail_bg_color=primary_color,  # Same as primary for consistency
        thumbnail_text_color=light_mode.thumbnail_text_color,  # From brand_colors.py
        content_title_color=light_mode.content_title_text_color,  # Light mode title text
        content_highlight_color=dark_mode.content_title_bg_color,  # Dark mode content bg (RGBA)
        instagram_business_account_id=instagram_business_account_id,
        facebook_page_id=facebook_page_id,
        meta_access_token=meta_access_token,
    )


# Brand configuration mapping - colors sourced from brand_colors.py
# Credentials are loaded from the database at call time via get_brand_config().
BRAND_CONFIGS: Dict[BrandType, BrandConfig] = {
    bt: _create_brand_config(bt) for bt in BrandType
}


def get_brand_config(brand_type: BrandType) -> BrandConfig:
    """
    Get the brand configuration for a given brand type.

    Credentials (meta_access_token, instagram_business_account_id,
    facebook_page_id) are loaded from the database brands table at call
    time.  Colour / display info falls back to the static BRAND_CONFIGS
    when the DB is unavailable.

    Args:
        brand_type: The brand type enum

    Returns:
        The corresponding brand configuration

    Raises:
        ValueError: If brand type is not in the mapping
    """
    if brand_type not in BRAND_CONFIGS:
        raise ValueError(f"Invalid brand type: {brand_type}")

    # Try to load full config (with credentials) from the database
    brand_key = BRAND_TYPE_TO_KEY.get(brand_type)
    if brand_key:
        try:
            from app.services.brands.resolver import brand_resolver
            db_config = brand_resolver.get_brand_config(brand_key)
            if db_config is not None:
                return db_config
        except Exception:
            pass  # Fall back to static config (no credentials)

    return BRAND_CONFIGS[brand_type]
