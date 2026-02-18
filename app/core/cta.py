"""CTA (Call-to-Action) utilities.

Selects a random CTA from the user's weighted options.
Each CTA has a text and a weight (probability percentage).
"""

import random
from typing import Optional

from app.core.prompt_context import PromptContext


def get_cta_line(ctx: Optional[PromptContext] = None) -> str:
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
    
    return random.choices(texts, weights=weights, k=1)[0]
