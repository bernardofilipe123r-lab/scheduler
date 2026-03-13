"""CTA (Call-to-Action) utilities.

Selects a random CTA from the user's weighted options.
Each CTA has a text and a weight (probability percentage).
"""

import random
from typing import Optional

from app.core.prompt_context import PromptContext


def _resolve_cta_topic(ctx: Optional[PromptContext]) -> str:
    """Resolve a best-effort topic label for CTA placeholders."""
    if ctx:
        topic = ctx.carousel_cta_topic
        if not topic and ctx.topic_keywords:
            topic = ctx.topic_keywords[0]
        if not topic and ctx.niche_name:
            topic = ctx.niche_name.lower()
        if topic:
            return topic
    return "this topic"


def _sanitize_cta_placeholders(
    text: str,
    ctx: Optional[PromptContext],
    brand_handle: Optional[str] = None,
) -> str:
    """Resolve known CTA placeholders to avoid leaking template tokens to users."""
    resolved = text.replace("{cta_topic}", _resolve_cta_topic(ctx))
    handle = (brand_handle or "").strip()
    if handle and not handle.startswith("@"):
        handle = f"@{handle}"
    if not handle:
        handle = "our page"
    resolved = resolved.replace("@{brandhandle}", handle)
    resolved = resolved.replace("@{{brandhandle}}", handle)
    return resolved


def get_cta_line(ctx: Optional[PromptContext] = None, brand_handle: Optional[str] = None) -> str:
    """Pick a CTA line using weighted random selection from ctx.cta_options.

    Each option is {text: str, weight: number} where weight is a percentage.
    Returns empty string if no options configured.
    """
    if not ctx or not ctx.cta_options:
        return ""

    options = [opt for opt in ctx.cta_options if opt.get("text") and opt.get("weight", 0) > 0]
    if not options:
        return ""

    texts = [opt["text"] for opt in options]
    weights = [opt["weight"] for opt in options]

    chosen = random.choices(texts, weights=weights, k=1)[0]
    return _sanitize_cta_placeholders(chosen, ctx, brand_handle=brand_handle)


# Default carousel CTA templates (used when user hasn't configured any)
_DEFAULT_CAROUSEL_CTAS = [
    {"text": "Follow @{{brandhandle}} to learn more about {cta_topic}", "weight": 34},
    {"text": "If you want to learn more about {cta_topic}, follow our page!", "weight": 33},
    {"text": "If you want to learn more about {cta_topic}, follow @{{brandhandle}}!", "weight": 33},
]


def get_carousel_cta_line(ctx: Optional[PromptContext] = None) -> str:
    """Pick a carousel CTA using weighted random selection from ctx.carousel_cta_options.

    Templates may contain {cta_topic} and @{{brandhandle}} placeholders.
    Returns empty string if nothing resolves.
    """
    options = []
    if ctx and ctx.carousel_cta_options:
        options = [opt for opt in ctx.carousel_cta_options if opt.get("text") and opt.get("weight", 0) > 0]

    # Fall back to defaults if user hasn't configured any
    if not options:
        options = _DEFAULT_CAROUSEL_CTAS

    texts = [opt["text"] for opt in options]
    weights = [opt["weight"] for opt in options]
    chosen = random.choices(texts, weights=weights, k=1)[0]

    chosen = chosen.replace("{cta_topic}", _resolve_cta_topic(ctx))
    return chosen
