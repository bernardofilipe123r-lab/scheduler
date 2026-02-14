"""
Application-wide constants for the reels automation system.
"""

# Image dimensions (Instagram Reels format: 9:16)
REEL_WIDTH = 1080
REEL_HEIGHT = 1920

# Post image dimensions (Instagram square/portrait)
POST_WIDTH = 1080
POST_HEIGHT = 1350

# Video settings
VIDEO_DURATION = 7  # seconds
VIDEO_CODEC = "libx264"
VIDEO_PIXEL_FORMAT = "yuv420p"
VIDEO_PRESET = "medium"

# Text rendering
MAX_TITLE_LENGTH = 90
MIN_TITLE_LENGTH = 55
MAX_LINE_LENGTH = 80
MAX_CONTENT_LINES = 10

# Default hashtags for captions
DEFAULT_HASHTAGS = [
    "#health",
    "#fitness",
    "#wellness",
    "#mindset",
    "#motivation",
    "#selfimprovement",
    "#growth",
    "#lifestyle",
]

# Fonts (relative to assets/fonts/)
FONT_BOLD = "Poppins-Bold.ttf"
FONT_CONTENT_REGULAR = "Inter/static/Inter_24pt-Regular.ttf"  # Inter Regular 400
FONT_CONTENT_MEDIUM = "Inter/static/Inter_24pt-Medium.ttf"  # Inter Medium 500
FONT_FALLBACK = None  # Will use PIL default if custom fonts not available

# Text styling
USE_BOLD_CONTENT = True  # Toggle between Regular (False) and Medium (True)

# Default font sizes (will be adjusted dynamically if content overflows)
TITLE_FONT_SIZE = 80
CONTENT_FONT_SIZE = 44
BRAND_FONT_SIZE = 40

# Spacing and margins
SIDE_MARGIN = 80
H_PADDING = 20  # Horizontal padding for title background bars
TITLE_SIDE_PADDING = 90  # Horizontal padding for title area (left and right)
CONTENT_SIDE_PADDING = 108  # Horizontal padding for content area (left and right)
TITLE_CONTENT_SPACING = 70  # Fixed spacing between title and content
BOTTOM_MARGIN = 280  # Minimum distance from bottom edge
BAR_HEIGHT = 100  # Height of title background bars
BAR_GAP = 0  # Gap between title background bars
VERTICAL_CORRECTION = -3  # Vertical text positioning correction
LINE_SPACING = 20
CONTENT_LINE_SPACING = 1.5

# Music
DEFAULT_MUSIC_ID = "default_01"
MUSIC_FADE_DURATION = 0.5  # seconds

# Brand name mapping (frontend name -> BrandType)
from app.core.config import BrandType

BRAND_NAME_MAP = {
    "healthycollege": BrandType.HEALTHY_COLLEGE,
    "vitalitycollege": BrandType.VITALITY_COLLEGE,
    "longevitycollege": BrandType.LONGEVITY_COLLEGE,
    "holisticcollege": BrandType.HOLISTIC_COLLEGE,
    "wellbeingcollege": BrandType.WELLBEING_COLLEGE,
}

VALID_BRANDS = list(BRAND_NAME_MAP.keys())
