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
    HEALTHY_COLLEGE = "HEALTHY_COLLEGE"
    VITALITY_COLLEGE = "VITALITY_COLLEGE"
    LONGEVITY_COLLEGE = "LONGEVITY_COLLEGE"


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
        highlight_color=(200, 234, 246, 255),  # Light blue #c8eaf6 for light mode
        logo_filename="gym_college_logo.png",
        thumbnail_bg_color=(244, 244, 244),  # #f4f4f4
        thumbnail_text_color=(0, 67, 92),  # #00435c for light mode
        content_title_color=(0, 0, 0),  # Black text for light mode
        content_highlight_color=(0, 74, 173, 255),  # #004aad for dark mode
        instagram_business_account_id="17841468847801005",  # @thegymcollege
        facebook_page_id="421725951022067",  # Gym College Facebook Page
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
    BrandType.HEALTHY_COLLEGE: BrandConfig(
        name="HEALTHY_COLLEGE",
        display_name="Healthy College",
        primary_color=(240, 255, 240),  # Light green background
        secondary_color=(0, 100, 0),  # Green #006400
        text_color=(0, 100, 0),  # Green text
        highlight_color=(0, 104, 55, 255),  # #006837
        logo_filename="healthy_college_logo.png",
        thumbnail_bg_color=(240, 255, 240),
        thumbnail_text_color=(0, 100, 0),  # #006400 for light mode
        content_title_color=(255, 255, 255),  # White text
        content_highlight_color=(0, 104, 55, 255),  # #006837
        instagram_business_account_id="17841479849607158",  # @thehealthycollege
        facebook_page_id="944977965368075",  # Healthy College Facebook Page
        meta_access_token=os.getenv("META_ACCESS_TOKEN"),  # Same token for both brands
    ),
    BrandType.VITALITY_COLLEGE: BrandConfig(
        name="VITALITY_COLLEGE",
        display_name="Vitality College",
        primary_color=(248, 240, 245),  # Light rose background #f8f0f5
        secondary_color=(192, 86, 159),  # Rose primary #c0569f
        text_color=(192, 86, 159),  # Rose text #c0569f
        highlight_color=(192, 86, 159, 255),  # Rose highlight #c0569f
        logo_filename="vitality_college_logo.png",
        thumbnail_bg_color=(248, 240, 245),  # #f8f0f5
        thumbnail_text_color=(192, 86, 159),  # #c0569f
        content_title_color=(255, 255, 255),  # White text
        content_highlight_color=(192, 86, 159, 255),  # #c0569f
        instagram_business_account_id=os.getenv("VITALITYCOLLEGE_INSTAGRAM_BUSINESS_ACCOUNT_ID"),
        facebook_page_id=os.getenv("VITALITYCOLLEGE_FACEBOOK_PAGE_ID"),
        meta_access_token=os.getenv("VITALITYCOLLEGE_META_ACCESS_TOKEN") or os.getenv("META_ACCESS_TOKEN"),
    ),
    BrandType.LONGEVITY_COLLEGE: BrandConfig(
        name="LONGEVITY_COLLEGE",
        display_name="Longevity College",
        primary_color=(255, 250, 240),  # Light amber background #fffaf0
        secondary_color=(190, 127, 9),  # Amber primary #be7f09
        text_color=(190, 127, 9),  # Amber text #be7f09
        highlight_color=(190, 127, 9, 255),  # Amber highlight #be7f09
        logo_filename="longevity_college_logo.png",
        thumbnail_bg_color=(255, 250, 240),  # #fffaf0
        thumbnail_text_color=(190, 127, 9),  # #be7f09
        content_title_color=(255, 255, 255),  # White text
        content_highlight_color=(190, 127, 9, 255),  # #be7f09
        instagram_business_account_id=os.getenv("LONGEVITYCOLLEGE_INSTAGRAM_BUSINESS_ACCOUNT_ID"),
        facebook_page_id=os.getenv("LONGEVITYCOLLEGE_FACEBOOK_PAGE_ID"),
        meta_access_token=os.getenv("LONGEVITYCOLLEGE_META_ACCESS_TOKEN") or os.getenv("META_ACCESS_TOKEN"),
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
