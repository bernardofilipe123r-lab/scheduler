"""
Brand configurations for the reels automation system.
"""
from enum import Enum
from typing import Dict, Tuple, Optional
from dataclasses import dataclass
import os


class BrandType(str, Enum):
    """Available brand types."""
    THE_GYM_COLLEGE = "THE_GYM_COLLEGE"
    FITNESS_PRO = "FITNESS_PRO"
    WELLNESS_LIFE = "WELLNESS_LIFE"


@dataclass
class BrandConfig:
    """Brand configuration settings."""
    name: str
    display_name: str
    primary_color: Tuple[int, int, int]  # RGB
    secondary_color: Tuple[int, int, int]  # RGB
    text_color: Tuple[int, int, int]  # RGB
    highlight_color: Tuple[int, int, int, int]  # RGBA with alpha
    logo_filename: str  # Relative to assets/logos/
    thumbnail_bg_color: Tuple[int, int, int]  # RGB for thumbnail background
    thumbnail_text_color: Tuple[int, int, int]  # RGB for thumbnail text
    content_title_color: Tuple[int, int, int]  # RGB for content title
    content_highlight_color: Tuple[int, int, int, int]  # RGBA for content title background
    instagram_business_account_id: Optional[str] = None  # Brand-specific Instagram ID
    facebook_page_id: Optional[str] = None  # Brand-specific Facebook Page ID
    meta_access_token: Optional[str] = None  # Brand-specific access token


# Brand configuration mapping
BRAND_CONFIGS: Dict[BrandType, BrandConfig] = {
    BrandType.THE_GYM_COLLEGE: BrandConfig(
        name="THE_GYM_COLLEGE",
        display_name="GYM COLLEGE",
        primary_color=(244, 244, 244),  # Light gray background #f4f4f4
        secondary_color=(0, 67, 92),  # Blue #00435c
        text_color=(0, 67, 92),  # Blue text #00435c
        highlight_color=(200, 234, 246, 255),  # Light blue #c8eaf6 with full opacity
        logo_filename="gym_college_logo.png",
        thumbnail_bg_color=(244, 244, 244),  # #f4f4f4
        thumbnail_text_color=(0, 67, 92),  # #00435c
        content_title_color=(0, 0, 0),  # Black #000000
        content_highlight_color=(200, 234, 246, 255),  # #c8eaf6
        instagram_business_account_id=os.getenv("GYMCOLLEGE_INSTAGRAM_ID"),
        facebook_page_id=os.getenv("GYMCOLLEGE_FACEBOOK_PAGE_ID"),
        meta_access_token=os.getenv("META_ACCESS_TOKEN"),  # Same token for both brands
    ),
    BrandType.FITNESS_PRO: BrandConfig(
        name="FITNESS_PRO",
        display_name="Fitness Pro",
        primary_color=(10, 25, 47),  # Navy blue
        secondary_color=(0, 230, 118),  # Bright green
        text_color=(255, 255, 255),
        highlight_color=(0, 230, 118, 100),
        logo_filename="fitness_pro_logo.png",
        thumbnail_bg_color=(10, 25, 47),
        thumbnail_text_color=(255, 255, 255),
        content_title_color=(255, 255, 255),
        content_highlight_color=(0, 230, 118, 100),
        instagram_business_account_id=os.getenv("FITNESSPRO_INSTAGRAM_ID"),
        facebook_page_id=os.getenv("FITNESSPRO_FACEBOOK_PAGE_ID"),
        meta_access_token=os.getenv("FITNESSPRO_META_TOKEN") or os.getenv("META_ACCESS_TOKEN"),
    ),
    BrandType.WELLNESS_LIFE: BrandConfig(
        name="WELLNESS_LIFE",
        display_name="Wellness Life",
        primary_color=(15, 52, 96),  # Deep blue
        secondary_color=(255, 107, 107),  # Coral
        text_color=(255, 255, 255),
        highlight_color=(255, 107, 107, 100),
        logo_filename="wellness_life_logo.png",
        thumbnail_bg_color=(15, 52, 96),
        thumbnail_text_color=(255, 255, 255),
        content_title_color=(255, 255, 255),
        content_highlight_color=(255, 107, 107, 100),
        instagram_business_account_id=os.getenv("HEALTHYCOLLEGE_INSTAGRAM_ID"),
        facebook_page_id=os.getenv("HEALTHYCOLLEGE_FACEBOOK_PAGE_ID"),  # Healthy College has Facebook too
        meta_access_token=os.getenv("META_ACCESS_TOKEN"),  # Same token for both brands
    ),
}


def get_brand_config(brand_type: BrandType) -> BrandConfig:
    """
    Get the brand configuration for a given brand type.
    
    Args:
        brand_type: The brand type enum
        
    Returns:
        The corresponding brand configuration
        
    Raises:
        ValueError: If brand type is not in the mapping
    """
    if brand_type not in BRAND_CONFIGS:
        raise ValueError(f"Invalid brand type: {brand_type}")
    return BRAND_CONFIGS[brand_type]
