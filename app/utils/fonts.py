"""
Font management utilities for text rendering.
"""
import os
from pathlib import Path
from typing import Optional
from PIL import ImageFont
from app.core.constants import (
    FONT_BOLD,
    TITLE_FONT_SIZE,
    BRAND_FONT_SIZE,
)


def get_font_path(font_filename: Optional[str]) -> Optional[Path]:
    """
    Get the absolute path to a font file.
    
    Args:
        font_filename: Name of the font file in assets/fonts/
        
    Returns:
        Path object to the font file, or None if not found
    """
    if not font_filename:
        return None
    
    # Get the project root (3 levels up from this file)
    base_dir = Path(__file__).resolve().parent.parent.parent
    font_path = base_dir / "assets" / "fonts" / font_filename
    
    if font_path.exists():
        return font_path
    
    return None


def load_font(font_filename: Optional[str], size: int) -> ImageFont.FreeTypeFont:
    """
    Load a TrueType font with the specified size.
    Falls back to default PIL font if the custom font is not available.
    
    Args:
        font_filename: Name of the font file in assets/fonts/
        size: Font size in points
        
    Returns:
        ImageFont object
    """
    font_path = get_font_path(font_filename)
    
    if font_path:
        try:
            return ImageFont.truetype(str(font_path), size)
        except Exception as e:
            print(f"Warning: Could not load font {font_filename}: {e}")
    
    # Try to load a system default font
    try:
        # Try common system fonts
        system_fonts = [
            "/System/Library/Fonts/Helvetica.ttc",  # macOS
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Linux
            "arial.ttf",  # Windows
            "Arial.ttf",
        ]
        
        for sys_font in system_fonts:
            try:
                return ImageFont.truetype(sys_font, size)
            except:
                continue
    except:
        pass
    
    # Final fallback to PIL's default bitmap font
    # Note: The default font doesn't support sizing, so we return it as-is
    return ImageFont.load_default()


def get_title_font(size: int = TITLE_FONT_SIZE) -> ImageFont.FreeTypeFont:
    """Get the font for titles."""
    return load_font(FONT_BOLD, size)


def get_brand_font(size: int = BRAND_FONT_SIZE) -> ImageFont.FreeTypeFont:
    """Get the font for brand text."""
    return load_font(FONT_REGULAR, size)


def calculate_dynamic_font_size(
    text: str,
    max_width: int,
    max_height: int,
    initial_size: int,
    font_filename: Optional[str],
    min_size: int = 20
) -> int:
    """
    Calculate a font size that fits text within given dimensions.
    
    Args:
        text: The text to measure
        max_width: Maximum width in pixels
        max_height: Maximum height in pixels
        initial_size: Starting font size
        font_filename: Font file to use
        min_size: Minimum allowable font size
        
    Returns:
        Calculated font size
    """
    size = initial_size
    
    while size >= min_size:
        font = load_font(font_filename, size)
        
        # Get text bounding box
        bbox = font.getbbox(text)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        if text_width <= max_width and text_height <= max_height:
            return size
        
        size -= 2
    
    return min_size
