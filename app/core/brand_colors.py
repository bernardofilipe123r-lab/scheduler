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
# DEFAULT COLORS (used when DB has no color config for a brand)
# ============================================================================

_DEFAULT_LIGHT = BrandModeColors(
    thumbnail_text_color=hex_to_rgb("#000000"),
    content_title_text_color=hex_to_rgb("#000000"),
    content_title_bg_color=hex_to_rgba("#e5e7eb"),
)

_DEFAULT_DARK = BrandModeColors(
    thumbnail_text_color=hex_to_rgb("#ffffff"),
    content_title_text_color=hex_to_rgb("#ffffff"),
    content_title_bg_color=hex_to_rgba("#374151"),
)


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_brand_colors(brand_name: str, variant: str) -> BrandModeColors:
    """
    Get color configuration for a specific brand and variant.
    
    Loads all color data from the database. Falls back to neutral defaults
    if the brand has no color config yet.
    
    Args:
        brand_name: Brand identifier (any brand ID from the DB)
        variant: Mode variant ("light" or "dark")
        
    Returns:
        BrandModeColors with all color settings for the specified mode
    """
    if variant not in ("light", "dark"):
        raise ValueError(f"Invalid variant: {variant}. Must be 'light' or 'dark'")

    try:
        from app.services.brands.resolver import brand_resolver
        brand = brand_resolver.get_brand(brand_name)
        if brand and brand.colors:
            colors = brand.colors
            prefix = f"{variant}_"
            thumb = colors.get(f"{prefix}thumbnail_text_color")
            title_text = colors.get(f"{prefix}content_title_text_color")
            title_bg = colors.get(f"{prefix}content_title_bg_color")

            if thumb and title_text and title_bg:
                return BrandModeColors(
                    thumbnail_text_color=hex_to_rgb(thumb),
                    content_title_text_color=hex_to_rgb(title_text),
                    content_title_bg_color=hex_to_rgba(title_bg),
                )
    except Exception:
        pass

    # Neutral defaults for brands without color config
    return _DEFAULT_LIGHT if variant == "light" else _DEFAULT_DARK


def get_brand_display_name(brand_name: str) -> str:
    """
    Get the display name for a brand from the database.
    
    Args:
        brand_name: Brand identifier
        
    Returns:
        Display name string (e.g., "THE GYM COLLEGE")
    """
    try:
        from app.services.brands.resolver import brand_resolver
        brand = brand_resolver.get_brand(brand_name)
        if brand:
            return brand.display_name
    except Exception:
        pass
    # Generate a sensible default from the ID
    return brand_name.upper()
