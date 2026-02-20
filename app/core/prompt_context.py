"""
PromptContext — aggregated niche configuration passed to all prompt builders.

Constructed by NicheConfigService from global + per-brand config.
Every prompt function receives this instead of reaching for hardcoded strings.

NOTE: This dataclass contains ONLY content/niche fields.
Format rules (ALL CAPS, word limits, slide counts, JSON schema)
are NEVER stored here — they remain hardcoded in prompt_templates.py.
"""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class PromptContext:
    # Core Identity
    niche_name: str = ""
    niche_description: str = ""
    content_brief: str = ""
    target_audience: str = ""
    audience_description: str = ""
    content_tone: List[str] = field(default_factory=list)
    tone_avoid: List[str] = field(default_factory=list)

    # Topic Configuration
    topic_categories: List[str] = field(default_factory=list)
    topic_keywords: List[str] = field(default_factory=list)
    topic_avoid: List[str] = field(default_factory=list)

    # Content Philosophy
    content_philosophy: str = ""
    hook_themes: List[str] = field(default_factory=list)

    # User Examples (few-shot prompting)
    reel_examples: List[dict] = field(default_factory=list)
    # Each: {"title": "ALL CAPS TITLE", "content_lines": ["line1", "line2", ...]}

    post_examples: List[dict] = field(default_factory=list)
    # Each: {"title": "ALL CAPS TITLE", "slides": ["slide1 text", "slide2 text", ...]}

    # Visual Style
    image_style_description: str = ""
    image_palette_keywords: List[str] = field(default_factory=list)
    image_composition_style: str = ""  # replaces REEL_BASE_STYLE per niche

    # Citation / Source
    citation_style: str = ""  # "academic_doi"|"financial_data"|"case_study"|"expert_quote"|"none"
    citation_source_types: List[str] = field(default_factory=list)

    # YouTube
    yt_title_examples: List[str] = field(default_factory=list)
    yt_title_bad_examples: List[str] = field(default_factory=list)

    # Carousel
    carousel_cta_topic: str = ""

    # Brand Personality
    brand_personality: Optional[str] = None
    brand_focus_areas: List[str] = field(default_factory=list)
    parent_brand_name: str = ""

    # CTA/Caption
    cta_options: List[dict] = field(default_factory=list)
    hashtags: List[str] = field(default_factory=list)
    follow_section_text: str = ""
    save_section_text: str = ""
    disclaimer_text: str = ""

    # Discovery Configuration
    competitor_accounts: List[str] = field(default_factory=list)
    discovery_hashtags: List[str] = field(default_factory=list)

    # --- Derived / computed ---

    @property
    def tone_string(self) -> str:
        return ", ".join(self.content_tone)

    @property
    def tone_avoid_string(self) -> str:
        return ", ".join(self.tone_avoid)

    @property
    def topic_framing(self) -> str:
        return ", ".join(self.topic_keywords[:6])

    @property
    def hashtag_string(self) -> str:
        return " ".join(self.hashtags)

    @property
    def has_reel_examples(self) -> bool:
        return len(self.reel_examples) > 0

    @property
    def has_post_examples(self) -> bool:
        return len(self.post_examples) > 0

    @property
    def example_count(self) -> int:
        return len(self.reel_examples) + len(self.post_examples)


def format_reel_examples(examples: list[dict]) -> str:
    """Format reel examples for prompt injection. Returns empty string if no examples."""
    if not examples:
        return ""

    lines = [
        "Here are examples of the exact style and quality of reel content to generate.",
        "Study the vocabulary, depth, topic focus, and structure carefully:",
        ""
    ]

    for i, ex in enumerate(examples, 1):
        lines.append(f"EXAMPLE {i}:")
        lines.append(f"Title: {ex['title']}")
        lines.append("Content:")
        for point in ex.get('content_lines', []):
            lines.append(f"- {point}")
        lines.append("")

    lines.append(
        "Now generate NEW, ORIGINAL content following the same style, "
        "quality, vocabulary level, and topic focus as these examples. "
        "Do NOT copy or closely paraphrase any example — create fresh content."
    )

    return "\n".join(lines)


def format_post_examples(examples: list[dict]) -> str:
    """Format post examples for prompt injection. Replaces CAROUSEL_SLIDE_EXAMPLES."""
    if not examples:
        return ""

    lines = [
        "Here are examples of the exact style of carousel posts to generate.",
        "Match the depth, tone, and educational quality of these examples:",
        ""
    ]

    for i, ex in enumerate(examples, 1):
        lines.append(f"EXAMPLE POST {i}:")
        lines.append(f"Title: {ex['title']}")
        for j, slide in enumerate(ex.get('slides', []), 1):
            lines.append(f"Slide {j}: {slide}")
        if ex.get('study_ref'):
            lines.append(f"Study: {ex['study_ref']}")
        elif ex.get('doi'):
            lines.append(f"Study: {ex['doi']}")
        lines.append("")

    lines.append(
        "Now generate NEW, ORIGINAL posts following the same style, "
        "quality, and topic depth as these examples. "
        "Each post must cover a DIFFERENT topic."
    )

    return "\n".join(lines)
