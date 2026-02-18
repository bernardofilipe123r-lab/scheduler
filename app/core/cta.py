"""
CTA (Call-to-Action) options for content generation.
CTAs are added at generation time based on user selection.
Each CTA type has 3 variations with 33% chance each.
"""
import random
from typing import Optional, Dict, List

from app.core.prompt_context import PromptContext


# CTA options are loaded dynamically from NicheConfig.
# This empty dict serves as the default - users configure their own CTAs.
CTA_OPTIONS: Dict[str, Dict[str, any]] = {}


def get_cta_options(ctx: PromptContext = None) -> dict:
    """Get CTA options from config, falling back to hardcoded defaults."""
    if ctx and ctx.cta_options:
        # Convert list format to dict format for backward compatibility
        result = {}
        for opt in ctx.cta_options:
            label = opt.get("label", "")
            if label:
                result[label] = [opt.get("text", "")]
        if result:
            return result
    return CTA_OPTIONS


def get_cta_line(cta_type: str) -> str:
    """
    Get a random CTA line based on the selected CTA type.
    Returns empty string if no CTAs are configured.
    """
    if not CTA_OPTIONS:
        return ""
    
    if cta_type not in CTA_OPTIONS:
        # Fall back to first available CTA type, or empty
        if CTA_OPTIONS:
            cta_type = next(iter(CTA_OPTIONS))
        else:
            return ""
    
    variations = CTA_OPTIONS[cta_type].get("variations", [])
    return random.choice(variations) if variations else ""


def get_available_cta_types() -> Dict[str, str]:
    """Return all available CTA types with their descriptions."""
    return {
        cta_type: data["description"] 
        for cta_type, data in CTA_OPTIONS.items()
    }
