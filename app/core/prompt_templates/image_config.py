"""Image prompt constants, model configs, and brand palette helpers."""
from typing import Dict
from app.core.prompt_context import PromptContext


# ============================================================
# IMAGE PROMPT TEMPLATE
# ============================================================

IMAGE_PROMPT_SUFFIX = "No text, no letters, no numbers, no symbols, no logos."

IMAGE_PROMPT_GUIDELINES = """
IMAGE REQUIREMENTS:
- CLOSE-UP, full-frame composition where the subject fills the entire image
- Minimal background visible — think macro photography or tightly-cropped shots
- Studio-quality cinematic lighting
- Premium aesthetic matching brand style
- MUST end with: "No text, no letters, no numbers, no symbols, no logos."
"""


# ============================================================
# POST / REEL QUALITY & STYLE
# ============================================================

POST_QUALITY_SUFFIX = (
    "Ultra high quality, 8K, sharp focus, professional photography, "
    "soft natural lighting, premium lifestyle aesthetic. "
    "Photorealistic, detailed textures, beautiful composition. "
    "Close-up, full-frame, subject fills the entire image. "
    "Portrait orientation 4:5 aspect ratio."
)


def build_reel_base_style(ctx: PromptContext = None) -> str:
    """
    Build the deAPI visual style directive.
    100% content-driven — NEVER uses brand style, brand colors, or NicheConfig image_style_description.
    Images must ALWAYS be vibrant and colorful.
    """
    return (
        "Premium studio photography. Clean, full-frame composition. "
        "Professional lighting with sharp focus and high-quality textures. "
        "Polished surfaces. Magazine-quality output with vivid clarity. "
        "MUST use rich, vibrant colors. NEVER monochrome, black and white, or desaturated."
    )


# Backward-compatible alias
REEL_BASE_STYLE = build_reel_base_style()


def build_image_prompt_system(ctx: PromptContext = None) -> str:
    if ctx is None:
        ctx = PromptContext()
    composition_hint = "Close-up, full-frame composition where the subject fills the entire frame — NOT wide shots"
    return f"""You are a visual prompt engineer specializing in {ctx.niche_name.lower()} imagery for Instagram.

Given a title, generate a DETAILED cinematic image prompt suitable for AI image generation (DALL-E / Flux).

### REQUIREMENTS:
- High-quality cinematic photography with rich, vivid colors
- CRITICAL: {composition_hint}
- COLOR MANDATE: Images MUST be vibrant and colorful. NEVER generate monochrome, black-and-white, grayscale, or desaturated prompts. Always include specific vivid color descriptions.
- Must end with "No text, no letters, no numbers, no symbols, no logos."
- Should be 2-3 sentences long
"""


# Backward-compatible default
IMAGE_PROMPT_SYSTEM = build_image_prompt_system()

FALLBACK_PROMPTS = {
    "generic (default)": "A cinematic lifestyle scene with soft golden sunlight and premium objects arranged artistically. Bright, clean, optimistic mood with studio-quality lighting. No text, no letters, no numbers, no symbols, no logos.",
}


# ============================================================
# BRAND PALETTES (dynamic from DB)
# ============================================================

def get_brand_palettes() -> dict:
    """Load brand color palettes dynamically from the database."""
    try:
        from app.db_connection import get_db_session
        with get_db_session() as db:
            from app.models.brands import Brand
            brands = db.query(Brand).filter(Brand.active == True).all()
            palettes = {}
            for b in brands:
                colors = b.colors or {}
                palettes[b.id] = {
                    "name": b.display_name or b.id,
                    "primary": colors.get("primary", "#2196F3"),
                    "accent": colors.get("accent", "#64B5F6"),
                    "color_description": colors.get("color_name", ""),
                }
            return palettes
    except Exception:
        return {}


# Backward-compatible alias
BRAND_PALETTES = {}


# ============================================================
# IMAGE MODEL CONFIGS
# ============================================================

IMAGE_MODELS = {
    "posts": {
        "name": "ZImageTurbo_INT8",
        "dimensions": "1088x1360 (rounded from 1080x1350)",
        "steps": 8,
        "description": "Higher quality model for posts. Better prompt adherence and fidelity.",
    },
    "reels": {
        "name": "Flux1schnell",
        "dimensions": "1152x1920 (rounded from 1080x1920)",
        "steps": 4,
        "description": "Fast model for reel backgrounds. Cheaper per image.",
    },
}


# Carousel examples are now user-configured via NicheConfig.
# When no user examples exist, the prompt runs without examples
# rather than using hardcoded niche-specific content.
CAROUSEL_SLIDE_EXAMPLES = []
