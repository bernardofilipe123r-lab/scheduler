"""
LAYER 2: GENERATOR LOGIC (PROMPT TEMPLATES)

DeepSeek-optimized prompts that are cached and reused.
Split into submodules:
  system_prompts  — cached system prompt + content prompts loader
  reel_prompts    — runtime, correction, style anchor prompts
  image_config    — image prompt constants, model configs, brand palettes
  post_prompts    — carousel / post batch generation prompts
"""

# --- system_prompts ---
from app.core.prompt_templates.system_prompts import (
    get_content_prompts,
    build_system_prompt,
    SYSTEM_PROMPT,
)

# --- reel_prompts ---
from app.core.prompt_templates.reel_prompts import (
    build_runtime_prompt,
    build_runtime_prompt_with_history,
    build_correction_prompt,
    build_style_anchor,
    build_prompt_with_example,
)

# --- image_config ---
from app.core.prompt_templates.image_config import (
    IMAGE_PROMPT_SUFFIX,
    IMAGE_PROMPT_GUIDELINES,
    POST_QUALITY_SUFFIX,
    build_reel_base_style,
    REEL_BASE_STYLE,
    build_image_prompt_system,
    IMAGE_PROMPT_SYSTEM,
    FALLBACK_PROMPTS,
    get_brand_palettes,
    BRAND_PALETTES,
    IMAGE_MODELS,
    CAROUSEL_SLIDE_EXAMPLES,
)

# --- post_prompts ---
from app.core.prompt_templates.post_prompts import (
    _build_citation_block,
    _build_slide1_instruction,
    _build_post_title_examples,
    _build_carousel_cta_topic,
    build_post_content_prompt,
    get_post_content_prompt_for_display,
)

__all__ = [
    # system_prompts
    "get_content_prompts",
    "build_system_prompt",
    "SYSTEM_PROMPT",
    # reel_prompts
    "build_runtime_prompt",
    "build_runtime_prompt_with_history",
    "build_correction_prompt",
    "build_style_anchor",
    "build_prompt_with_example",
    # image_config
    "IMAGE_PROMPT_SUFFIX",
    "IMAGE_PROMPT_GUIDELINES",
    "POST_QUALITY_SUFFIX",
    "build_reel_base_style",
    "REEL_BASE_STYLE",
    "build_image_prompt_system",
    "IMAGE_PROMPT_SYSTEM",
    "FALLBACK_PROMPTS",
    "get_brand_palettes",
    "BRAND_PALETTES",
    "IMAGE_MODELS",
    "CAROUSEL_SLIDE_EXAMPLES",
    # post_prompts
    "_build_citation_block",
    "_build_slide1_instruction",
    "_build_post_title_examples",
    "_build_carousel_cta_topic",
    "build_post_content_prompt",
    "get_post_content_prompt_for_display",
]
