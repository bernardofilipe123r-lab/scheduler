"""
Brand color configurations for thumbnails and content in light/dark modes.
Easy to edit and test - modify the RGB values below for each brand.
"""
from typing import Dict, Tuple
from dataclasses import dataclass


@dataclass
class BrandModeColors:
    """Colors for a specific brand in a specific mode."""
    # Thumbnail colors
    thumbnail_text_color: Tuple[int, int, int]  # RGB
    
    # Content colors
    content_title_text_color: Tuple[int, int, int]  # RGB
    content_title_bg_color: Tuple[int, int, int, int]  # RGBA


@dataclass
class BrandColorConfig:
    """Complete color configuration for a brand (light + dark modes)."""
    light_mode: BrandModeColors
    dark_mode: BrandModeColors


# ============================================================================
# BRAND COLOR CONFIGURATIONS
# ============================================================================

BRAND_COLORS: Dict[str, BrandColorConfig] = {
    
    # ------------------------------------------------------------------------
    # GYM COLLEGE
    # ------------------------------------------------------------------------
    "gymcollege": BrandColorConfig(
        light_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=(0, 67, 92),  # #00435c (blue)
            
            # Content
            content_title_text_color=(0, 0, 0),  # Black
            content_title_bg_color=(200, 234, 246, 255),  # #c8eaf6 (light blue)
        ),
        dark_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=(255, 255, 255),  # White (fixed for all dark modes)
            
            # Content
            content_title_text_color=(255, 255, 255),  # White
            content_title_bg_color=(0, 74, 173, 255),  # #004aad (dark blue)
        ),
    ),
    
    # ------------------------------------------------------------------------
    # HEALTHY COLLEGE
    # ------------------------------------------------------------------------
    "healthycollege": BrandColorConfig(
        light_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=(0, 100, 0),  # #006400 (green)
            
            # Content
            content_title_text_color=(0, 0, 0),  # Black
            content_title_bg_color=(0, 104, 55, 255),  # #006837 (green)
        ),
        dark_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=(255, 255, 255),  # White (fixed for all dark modes)
            
            # Content
            content_title_text_color=(255, 255, 255),  # White
            content_title_bg_color=(0, 100, 0, 255),  # #006400 (dark green)
        ),
    ),
    
    # ------------------------------------------------------------------------
    # VITALITY COLLEGE
    # ------------------------------------------------------------------------
    "vitalitycollege": BrandColorConfig(
        light_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=(192, 86, 159),  # #c0569f (rose)
            
            # Content
            content_title_text_color=(255, 255, 255),  # White
            content_title_bg_color=(192, 86, 159, 255),  # #c0569f (rose)
        ),
        dark_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=(255, 255, 255),  # White (fixed for all dark modes)
            
            # Content
            content_title_text_color=(255, 255, 255),  # White
            content_title_bg_color=(192, 86, 159, 255),  # #c0569f (rose)
        ),
    ),
    
    # ------------------------------------------------------------------------
    # LONGEVITY COLLEGE
    # ------------------------------------------------------------------------
    "longevitycollege": BrandColorConfig(
        light_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=(190, 127, 9),  # #be7f09 (amber)
            
            # Content
            content_title_text_color=(0, 0, 0),  # Black
            content_title_bg_color=(237, 186, 133, 255),  # #edba85 (light amber)
        ),
        dark_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=(255, 255, 255),  # White (fixed for all dark modes)
            
            # Content
            content_title_text_color=(255, 255, 255),  # White
            content_title_bg_color=(190, 127, 9, 255),  # #be7f09 (amber)
        ),
    ),
}


# ============================================================================
# BRAND NAME DISPLAY MAPPING
# ============================================================================

BRAND_DISPLAY_NAMES: Dict[str, str] = {
    "gymcollege": "THE GYM COLLEGE",
    "healthycollege": "THE HEALTHY COLLEGE",
    "vitalitycollege": "THE VITALITY COLLEGE",
    "longevitycollege": "THE LONGEVITY COLLEGE",
}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_brand_colors(brand_name: str, variant: str) -> BrandModeColors:
    """
    Get color configuration for a specific brand and variant.
    
    Args:
        brand_name: Brand identifier (gymcollege, healthycollege, etc.)
        variant: Mode variant ("light" or "dark")
        
    Returns:
        BrandModeColors with all color settings for the specified mode
        
    Raises:
        ValueError: If brand_name or variant is invalid
    """
    if brand_name not in BRAND_COLORS:
        raise ValueError(f"Unknown brand: {brand_name}. Available: {list(BRAND_COLORS.keys())}")
    
    if variant not in ["light", "dark"]:
        raise ValueError(f"Invalid variant: {variant}. Must be 'light' or 'dark'")
    
    brand_config = BRAND_COLORS[brand_name]
    return brand_config.light_mode if variant == "light" else brand_config.dark_mode


def get_brand_display_name(brand_name: str) -> str:
    """
    Get the display name for a brand (used in dark mode thumbnails).
    
    Args:
        brand_name: Brand identifier
        
    Returns:
        Display name string (e.g., "THE GYM COLLEGE")
    """
    return BRAND_DISPLAY_NAMES.get(brand_name, "THE GYM COLLEGE")
