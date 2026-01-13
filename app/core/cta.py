"""
CTA (Call-to-Action) options for content generation.
CTAs are added at generation time based on user selection.
Each CTA type has 3 variations with 33% chance each.
"""
import random
from typing import Optional, Dict, List


# CTA options organized by type
# Each type has 3 variations with 33% chance each
CTA_OPTIONS: Dict[str, Dict[str, any]] = {
    "follow_tips": {
        "description": "Follow for more healthy tips",
        "variations": [
            "If you want to improve your health, wellness, and habits, follow our page!",
            "If you want to learn more about your health, follow this page!",
            "Follow us for Part 2."
        ]
    },
    "sleep_lean": {
        "description": "Comment LEAN - Sleep Lean product",
        "variations": [
            "Comment \"LEAN\" and we will send you our favourite supplement to lose weight!",
            "Comment \"LEAN\" and we'll DM you the nighttime formula that doctors rarely talk about, and that thousands of people are loving for fat loss support, deeper sleep, and healthier skin!",
            "Comment \"LEAN\" and we'll DM you the nighttime formula that doctors rarely talk about, and that thousands of people are loving for fat loss support!"
        ]
    },
    "workout_plan": {
        "description": "Comment PLAN - Workout & nutrition plan",
        "variations": [
            "Comment \"PLAN\" and we'll DM you the workout and nutrition plan that experts rarely talk about, and that thousands of people are loving for fat loss and muscle growth!",
            "Comment \"PLAN\" and we will send you the best workout and nutrition plan for fat loss and muscle growth!",
            "Comment \"PLAN\" and we will send you our favourite system that coaches are using to help their clients transform their bodies in 2026, 100% FREE."
        ]
    }
}


def get_cta_line(cta_type: str) -> str:
    """
    Get a random CTA line based on the selected CTA type.
    
    Args:
        cta_type: One of 'follow_tips', 'sleep_lean', 'workout_plan'
        
    Returns:
        A random CTA line from the selected type
    """
    if cta_type not in CTA_OPTIONS:
        print(f"⚠️ Unknown CTA type: {cta_type}, defaulting to follow_tips")
        cta_type = "follow_tips"
    
    variations = CTA_OPTIONS[cta_type]["variations"]
    return random.choice(variations)


def get_available_cta_types() -> Dict[str, str]:
    """Return all available CTA types with their descriptions."""
    return {
        cta_type: data["description"] 
        for cta_type, data in CTA_OPTIONS.items()
    }
