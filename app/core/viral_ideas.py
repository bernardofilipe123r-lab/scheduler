"""
Viral Ideas - Backward-compatibility shim.

Viral ideas are now loaded dynamically from each brand's NicheConfig
(reel_examples field) instead of being hardcoded here.

This module is kept so that existing imports continue to work.
The helper functions (get_all_ideas, get_ideas_by_tag, etc.) still
operate on VIRAL_IDEAS and will return empty results unless the list
is populated at runtime.
"""

from typing import List, Dict


# Viral ideas are now loaded dynamically from NicheConfig reel_examples.
# This empty list is kept for backward compatibility with imports.
VIRAL_IDEAS: List[Dict] = []

# NOTE: 59 hardcoded viral posts were removed. Content is now driven by
# each brand's NicheConfig.reel_examples stored in the database.


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def get_all_ideas() -> List[Dict]:
    """Return all viral ideas."""
    return VIRAL_IDEAS.copy()


def get_ideas_by_tag(tag: str) -> List[Dict]:
    """Get ideas filtered by a specific tag."""
    return [idea for idea in VIRAL_IDEAS if tag.lower() in [t.lower() for t in idea.get("tags", [])]]


def get_ideas_by_format(format_style: str) -> List[Dict]:
    """Get ideas filtered by format style."""
    return [idea for idea in VIRAL_IDEAS if idea.get("format_style", "").upper() == format_style.upper()]


def get_random_ideas(count: int = 5) -> List[Dict]:
    """Get a random selection of ideas."""
    import random
    return random.sample(VIRAL_IDEAS, min(count, len(VIRAL_IDEAS)))


def get_idea_count() -> int:
    """Return total number of viral ideas."""
    return len(VIRAL_IDEAS)


def get_all_tags() -> List[str]:
    """Return all unique tags used in ideas."""
    tags = set()
    for idea in VIRAL_IDEAS:
        tags.update(idea.get("tags", []))
    return sorted(list(tags))


def get_title_patterns() -> List[str]:
    """Extract title patterns from all ideas for AI learning."""
    patterns = []
    for idea in VIRAL_IDEAS:
        title = idea.get("title", "")
        # Extract pattern by replacing numbers and specific words
        pattern = title
        patterns.append(pattern)
    return patterns
