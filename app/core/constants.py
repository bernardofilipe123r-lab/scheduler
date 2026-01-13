"""
Application-wide constants for the reels automation system.
"""

# Image dimensions (Instagram Reels format: 9:16)
REEL_WIDTH = 1080
REEL_HEIGHT = 1920

# Video settings
VIDEO_DURATION = 7  # seconds
VIDEO_CODEC = "libx264"
VIDEO_PIXEL_FORMAT = "yuv420p"
VIDEO_PRESET = "medium"

# Text rendering
MAX_TITLE_LENGTH = 50
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
FONT_REGULAR = "Poppins-Regular.ttf"
FONT_SEMIBOLD = "Poppins-SemiBold.ttf"
FONT_CONTENT = "BrowalliaNew-Bold.ttf"  # Browallia New Bold for content text
FONT_FALLBACK = None  # Will use PIL default if custom fonts not available

# Default font sizes (will be adjusted dynamically if content overflows)
TITLE_FONT_SIZE = 80
CONTENT_FONT_SIZE = 49  # Browallia New Bold needs larger size
CTA_FONT_SIZE = 45
BRAND_FONT_SIZE = 40

# Spacing and margins
TOP_MARGIN = 120
BOTTOM_MARGIN = 120
SIDE_MARGIN = 80
H_PADDING = 20  # Horizontal padding for title background bars
TITLE_SIDE_PADDING = 90  # Horizontal padding for title area (left and right)
CONTENT_SIDE_PADDING = 108  # Horizontal padding for content area (left and right)
BAR_HEIGHT = 100  # Height of title background bars
BAR_GAP = 0  # Gap between title background bars
VERTICAL_CORRECTION = -3  # Vertical text positioning correction
LINE_SPACING = 20
SECTION_SPACING = 60
CONTENT_LETTER_SPACING = -0.22  # Letter spacing multiplier (0.78x = 22% tighter than default)

# Music
DEFAULT_MUSIC_ID = "default_01"
MUSIC_FADE_DURATION = 0.5  # seconds
