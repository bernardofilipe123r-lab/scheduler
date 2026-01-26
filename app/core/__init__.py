"""Core configuration package."""

# Expose new viral content generation architecture
from app.core.viral_patterns import (
    PatternSelector,
    PatternSelection,
    get_pattern_selector,
    TITLE_ARCHETYPES,
    FORMAT_DEFINITIONS,
    HOOK_DEFINITIONS,
    TOPIC_BUCKETS
)

from app.core.prompt_templates import (
    SYSTEM_PROMPT,
    build_runtime_prompt,
    build_correction_prompt
)

from app.core.quality_scorer import (
    QualityScorer,
    QualityScore,
    get_quality_scorer,
    quick_score
)
