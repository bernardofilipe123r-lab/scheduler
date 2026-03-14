"""Runtime, correction, and style anchor prompts — sent per request."""
from typing import Dict, List, Optional
from app.core.viral_patterns import (
    PatternSelection,
    FORMAT_DEFINITIONS,
    get_format_instructions,
    get_hook_language,
)
from app.core.prompt_context import PromptContext, format_reel_examples
from app.core.prompt_templates.system_prompts import get_content_prompts


def build_runtime_prompt(selection: PatternSelection, ctx: PromptContext = None) -> str:
    """
    Build a minimal runtime prompt based on pattern selection.
    This is what gets sent to DeepSeek every request.
    Target: Under 500 tokens (vs 3000+ in old architecture)
    """
    if ctx is None:
        ctx = PromptContext()
    format_info = get_format_instructions(selection.format_style)
    hook_language = get_hook_language(selection.primary_hook)

    archetype = selection.title_archetype
    pattern_hint = archetype.get("pattern", "")

    prompt = f"""Generate 1 viral {ctx.niche_name.lower()} reel.

INSTRUCTIONS:
- Topic: {selection.topic}
- Format: {selection.format_style}
- Hook type: {selection.primary_hook}
- Point count: {selection.point_count} content lines

TITLE PATTERN (modify as needed):
"{pattern_hint}"

FORMAT RULES:
- Structure: {format_info['structure']}
- Max words per line: {format_info['word_limit']}
- Total content MUST be 50-60 words across all lines. NEVER exceed 60 words.

HOOK LANGUAGE TO USE:
{', '.join(hook_language[:4])}

OUTPUT (JSON only):
{{
    "title": "YOUR TITLE IN ALL CAPS",
    "content_lines": ["line 1", "line 2", ...],
    "image_prompt": "Cinematic image description with VIBRANT COLORS (never B&W/monochrome) ending with: No text, no letters, no numbers, no symbols, no logos.",
    "format_style": "{selection.format_style}",
    "topic_category": "{selection.topic}",
    "hook_type": "{selection.primary_hook}"
}}"""

    if ctx.has_reel_examples:
        prompt = format_reel_examples(ctx.reel_examples) + "\n\n" + prompt

    prompts = get_content_prompts()
    brand_desc = prompts.get('brand_description', '').strip()
    reels_prompt = prompts.get('reels_prompt', '').strip()
    if brand_desc:
        prompt += f"\n\nBRAND CONTEXT:\n{brand_desc}"
    if reels_prompt:
        prompt += f"\n\nADDITIONAL INSTRUCTIONS:\n{reels_prompt}"

    return prompt


def build_runtime_prompt_with_history(
    selection: PatternSelection,
    recent_titles: List[str],
    recent_topics: List[str],
    ctx: PromptContext = None
) -> str:
    """Build runtime prompt with anti-repetition context."""
    base_prompt = build_runtime_prompt(selection, ctx=ctx)

    if not recent_titles and not recent_topics:
        return base_prompt

    avoidance = "\n\nAVOID RECENTLY USED:"
    if recent_titles:
        avoidance += f"\nTitles: {', '.join(recent_titles[-5:])}"
    if recent_topics:
        avoidance += f"\nAngles: {', '.join(recent_topics[-3:])}"

    return base_prompt + avoidance


def build_correction_prompt(
    original_output: Dict,
    feedback: Dict
) -> str:
    """Build a correction prompt when QSF score is below threshold."""
    issues = []
    instructions = []

    if feedback.get("low_novelty"):
        issues.append("Content is too similar to recent outputs")
        instructions.append("Increase novelty - use different phrasing and angles")

    if feedback.get("weak_hook"):
        issues.append("Emotional hook is not strong enough")
        instructions.append("Strengthen the emotional hook - add more urgency/curiosity")

    if feedback.get("structure_error"):
        issues.append("Format structure is inconsistent")
        instructions.append("Maintain consistent format throughout all lines")

    if feedback.get("plausibility_issue"):
        issues.append("Some claims feel implausible or too extreme")
        instructions.append("Use more familiar, believable claims")

    issues_text = "\n".join(f"- {issue}" for issue in issues)
    instructions_text = "\n".join(f"- {inst}" for inst in instructions)

    prompt = f"""Regenerate this reel with improvements.

ORIGINAL TITLE: {original_output.get('title', '')}
FORMAT: {original_output.get('format_style', '')}

ISSUES TO FIX:
{issues_text}

INSTRUCTIONS:
{instructions_text}

KEEP:
- Same format style
- Same general topic
- Same point count

OUTPUT (JSON only):
{{
    "title": "IMPROVED TITLE IN ALL CAPS",
    "content_lines": ["improved line 1", "improved line 2", ...],
    "image_prompt": "...",
    "format_style": "{original_output.get('format_style', '')}",
    "topic_category": "{original_output.get('topic_category', '')}",
    "hook_type": "{original_output.get('hook_type', 'curiosity')}"
}}"""

    return prompt


def build_style_anchor(format_style: str) -> str:
    """
    Build a minimal style anchor (NOT full examples).
    Used only when quality score drops, introducing a new format, or style drift detected.
    """
    format_info = FORMAT_DEFINITIONS.get(format_style, FORMAT_DEFINITIONS["SHORT_FRAGMENT"])

    anchor = f"""STYLE ANCHOR (DO NOT COPY CONTENT):
The reference content uses:
- Structure: {format_info['structure']}
- Word limit: {format_info['word_limit']} words per line
- Example pattern: "{format_info['example_structure']}"
- Rules: {', '.join(format_info['rules'][:2])}
"""
    return anchor


def build_prompt_with_example(
    selection: PatternSelection,
    example: Optional[Dict] = None
) -> str:
    """
    Build runtime prompt with ONE sanitized example.
    Only used for Tier 2 (micro-example) or Tier 3 (full example) scenarios.
    """
    base_prompt = build_runtime_prompt(selection)

    if not example:
        style_anchor = build_style_anchor(selection.format_style)
        return base_prompt + "\n\n" + style_anchor

    example_section = f"""
REFERENCE EXAMPLE (ABSTRACTED - DO NOT COPY DIRECTLY):
Title Pattern: "{example.get('title', '')}"
Format: {example.get('format_style', '')}
Line Count: {len(example.get('content_lines', []))}
First Line Structure: "{example.get('content_lines', [''])[0][:50]}..."

Use this structure, NOT the specific content.
"""
    return base_prompt + example_section
