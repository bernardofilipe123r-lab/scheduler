"""
Brand color configurations for thumbnails and content in light/dark modes.
Easy to edit and test - modify the HEX color values below for each brand.
"""
from typing import Dict, Tuple
from dataclasses import dataclass


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def hex_to_rgba(hex_color: str, alpha: int = 255) -> Tuple[int, int, int, int]:
    """Convert hex color to RGBA tuple."""
    rgb = hex_to_rgb(hex_color)
    return rgb + (alpha,)


@dataclass
class BrandModeColors:
    """Colors for a specific brand in a specific mode (stored as RGB/RGBA tuples internally)."""
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
# BRAND COLOR CONFIGURATIONS - EDIT HEX VALUES BELOW
# ============================================================================

BRAND_COLORS: Dict[str, BrandColorConfig] = {
    
    # ------------------------------------------------------------------------
    # GYM COLLEGE
    # ------------------------------------------------------------------------
    "gymcollege": BrandColorConfig(
        light_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=hex_to_rgb("#00435c"),  # Blue
            
            # Content
            content_title_text_color=hex_to_rgb("#000000"),  # Black
            content_title_bg_color=hex_to_rgba("#c8eaf6"),  # Light blue
        ),
        dark_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=hex_to_rgb("#ffffff"),  # White
            
            # Content
            content_title_text_color=hex_to_rgb("#ffffff"),  # White
            content_title_bg_color=hex_to_rgba("#00435c"),  # Dark blue
        ),
    ),
    
    # ------------------------------------------------------------------------
    # HEALTHY COLLEGE
    # ------------------------------------------------------------------------
    "healthycollege": BrandColorConfig(
        light_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=hex_to_rgb("#004f00"),  # Green
            
            # Content
            content_title_text_color=hex_to_rgb("#000000"),  # Black
            content_title_bg_color=hex_to_rgba("#dcf6c8"),  # Light green
        ),
        dark_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=hex_to_rgb("#ffffff"),  # White
            
            # Content
            content_title_text_color=hex_to_rgb("#ffffff"),  # White
            content_title_bg_color=hex_to_rgba("#004f00"),  # Dark green
        ),
    ),
    
    # ------------------------------------------------------------------------
    # VITALITY COLLEGE
    # ------------------------------------------------------------------------
    "vitalitycollege": BrandColorConfig(
        light_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=hex_to_rgb("#028f7a"),  # Teal
            
            # Content
            content_title_text_color=hex_to_rgb("#ffffff"),  # Black
            content_title_bg_color=hex_to_rgba("#028f7a"),  # Teal
        ),
        dark_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=hex_to_rgb("#ffffff"),  # White
            
            # Content
            content_title_text_color=hex_to_rgb("#ffffff"),  # White
            content_title_bg_color=hex_to_rgba("#028f7a"),  # Teal
        ),
    ),
    
    # ------------------------------------------------------------------------
    # LONGEVITY COLLEGE
    # ------------------------------------------------------------------------
    "longevitycollege": BrandColorConfig(
        light_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=hex_to_rgb("#019dc8"),  # Cyan
            
            # Content
            content_title_text_color=hex_to_rgb("#000000"),  # Black
            content_title_bg_color=hex_to_rgba("#c8eaf6"),  # Cyan
        ),
        dark_mode=BrandModeColors(
            # Thumbnail
            thumbnail_text_color=hex_to_rgb("#ffffff"),  # White
            
            # Content
            content_title_text_color=hex_to_rgb("#ffffff"),  # White
            content_title_bg_color=hex_to_rgba("#019dc8"),  # Cyan
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
