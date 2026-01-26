"""
LAYER 2: GENERATOR LOGIC (PROMPT TEMPLATES)

DeepSeek-optimized prompts that are cached and reused.
The system prompt is sent once per session, not every request.

This module contains:
- SYSTEM_PROMPT: Cached thinking engine (rarely changes)
- build_runtime_prompt(): Minimal per-request instructions
- build_correction_prompt(): Self-correction when quality is low
"""

from typing import Dict, List, Optional
from app.core.viral_patterns import (
    PatternSelection,
    FORMAT_DEFINITIONS,
    HOOK_DEFINITIONS,
    get_format_instructions,
    get_hook_language
)


# ============================================================
# SYSTEM PROMPT (CACHED - SENT ONCE PER SESSION)
# ============================================================

SYSTEM_PROMPT = """You are a viral short-form health content generator.

TASK:
Generate original Instagram/TikTok reel ideas that match proven viral health patterns without copying any known content.

CORE RULES:
- Use familiar health framing (habits, symptoms, food, sleep, aging, body signals)
- Optimize for emotional hooks: curiosity, fear, authority, hope, or control
- Keep language simple, confident, and non-clinical
- Avoid medical diagnosis, treatment instructions, or guarantees
- Avoid academic, poetic, or overly creative language
- Each content line must be under 18 words

CONTENT PHILOSOPHY:
- 60% validating (things audience suspects are true)
- 40% surprising (new revelation that feels plausible)
- Use familiar foods, habits, and symptoms
- Plausible > precise (this is social content, not textbooks)

FORMATTING:
- Titles in ALL CAPS
- One format style per reel (do not mix)
- No emojis, hashtags, or disclaimers
- No CTA (call-to-action) - it's added separately
- No numbered lists (numbers added by system)

You generate content that feels familiar, not repeated.
Output ONLY valid JSON, no markdown, no explanations."""


# ============================================================
# RUNTIME PROMPT BUILDER (TINY - SENT EVERY REQUEST)
# ============================================================

def build_runtime_prompt(selection: PatternSelection) -> str:
    """
    Build a minimal runtime prompt based on pattern selection.
    This is what gets sent to DeepSeek every request.
    
    Target: Under 500 tokens (vs 3000+ in old architecture)
    """
    format_info = get_format_instructions(selection.format_style)
    hook_language = get_hook_language(selection.primary_hook)
    
    # Build suggested title from archetype
    archetype = selection.title_archetype
    pattern_hint = archetype.get("pattern", "")
    
    prompt = f"""Generate 1 viral health reel.

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

HOOK LANGUAGE TO USE:
{', '.join(hook_language[:4])}

OUTPUT (JSON only):
{{
    "title": "YOUR TITLE IN ALL CAPS",
    "content_lines": ["line 1", "line 2", ...],
    "image_prompt": "Cinematic image description ending with: No text, no letters, no numbers, no symbols, no logos.",
    "format_style": "{selection.format_style}",
    "topic_category": "{selection.topic}",
    "hook_type": "{selection.primary_hook}"
}}"""
    
    return prompt


def build_runtime_prompt_with_history(
    selection: PatternSelection,
    recent_titles: List[str],
    recent_topics: List[str]
) -> str:
    """
    Build runtime prompt with anti-repetition context.
    Only adds history when there's recent content to avoid.
    """
    base_prompt = build_runtime_prompt(selection)
    
    if not recent_titles and not recent_topics:
        return base_prompt
    
    avoidance = "\n\nAVOID RECENTLY USED:"
    if recent_titles:
        avoidance += f"\nTitles: {', '.join(recent_titles[-5:])}"
    if recent_topics:
        avoidance += f"\nAngles: {', '.join(recent_topics[-3:])}"
    
    return base_prompt + avoidance


# ============================================================
# CORRECTION PROMPT (WHEN QUALITY SCORE IS LOW)
# ============================================================

def build_correction_prompt(
    original_output: Dict,
    feedback: Dict
) -> str:
    """
    Build a correction prompt when QSF score is below threshold.
    
    Args:
        original_output: The generated content that failed quality check
        feedback: Dict with boolean flags for what needs improvement:
            - low_novelty: bool
            - weak_hook: bool
            - structure_error: bool
            - plausibility_issue: bool
    """
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
    
    prompt = f"""Regenerate this reel with improvements.

ORIGINAL TITLE: {original_output.get('title', '')}
FORMAT: {original_output.get('format_style', '')}

ISSUES TO FIX:
{chr(10).join(f'- {issue}' for issue in issues)}

INSTRUCTIONS:
{chr(10).join(f'- {inst}' for inst in instructions)}

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


# ============================================================
# MICRO-EXAMPLE INJECTION (RARE - ONLY WHEN NEEDED)
# ============================================================

def build_style_anchor(format_style: str) -> str:
    """
    Build a minimal style anchor (NOT full examples).
    Used only when:
    - Quality score drops below threshold
    - Introducing a new format
    - Style drift detected
    
    This is a "ghost example" - structural description, not content.
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
    
    Example should be sanitized: no specific foods/symptoms/numbers.
    """
    base_prompt = build_runtime_prompt(selection)
    
    if not example:
        # Use ghost example (style description only)
        style_anchor = build_style_anchor(selection.format_style)
        return base_prompt + "\n\n" + style_anchor
    
    # Tier 3: Full example (rare, for quality reset)
    example_section = f"""
REFERENCE EXAMPLE (ABSTRACTED - DO NOT COPY DIRECTLY):
Title Pattern: "{example.get('title', '')}"
Format: {example.get('format_style', '')}
Line Count: {len(example.get('content_lines', []))}
First Line Structure: "{example.get('content_lines', [''])[0][:50]}..."

Use this structure, NOT the specific content.
"""
    return base_prompt + example_section


# ============================================================
# IMAGE PROMPT TEMPLATE
# ============================================================

IMAGE_PROMPT_SUFFIX = "No text, no letters, no numbers, no symbols, no logos."

IMAGE_PROMPT_GUIDELINES = """
IMAGE REQUIREMENTS:
- Full-frame composition with minimal empty space
- Dominant focal subject related to the topic
- Blue/teal color palette with controlled warm accents
- Studio-quality cinematic lighting
- Scientific/premium wellness aesthetic
- MUST end with: "No text, no letters, no numbers, no symbols, no logos."
"""
