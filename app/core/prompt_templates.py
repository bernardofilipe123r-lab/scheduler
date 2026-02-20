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
from app.core.prompt_context import PromptContext, format_reel_examples, format_post_examples


# ============================================================
# CONTENT PROMPTS (loaded from app_settings table)
# ============================================================

def get_content_prompts() -> Dict[str, str]:
    """Load content prompts from the app_settings table.

    Returns a dict with keys 'reels_prompt', 'posts_prompt',
    'brand_description' mapped to their stored values (or empty string).
    """
    try:
        from app.db_connection import get_db_session
        with get_db_session() as db:
            from app.models.config import AppSettings
            rows = (
                db.query(AppSettings.key, AppSettings.value)
                .filter(AppSettings.key.in_([
                    'posts_prompt', 'reels_prompt', 'brand_description',
                ]))
                .all()
            )
            return {row.key: (row.value or '') for row in rows}
    except Exception as e:
        print(f"⚠️ Could not load content prompts: {e}", flush=True)
        return {}


# ============================================================
# SYSTEM PROMPT (CACHED - SENT ONCE PER SESSION)
# ============================================================

def build_system_prompt(ctx: PromptContext = None) -> str:
    if ctx is None:
        ctx = PromptContext()

    # Layer 1: content_brief is the user's own description — injected verbatim
    brief_section = ""
    if ctx.content_brief:
        brief_section = f"""

CONTENT BRIEF (follow this closely):
{ctx.content_brief}
"""

    return f"""You are a viral short-form {ctx.niche_name.lower()} content generator.
{brief_section}
TASK:
Generate original Instagram/TikTok reel ideas that match proven viral {ctx.niche_name.lower()} patterns without copying any known content.

CORE RULES:
- Use familiar {ctx.niche_name.lower()} framing ({ctx.topic_framing})
- Optimize for emotional hooks: {', '.join(ctx.hook_themes)}
- Keep language {ctx.tone_string}
- Avoid {ctx.tone_avoid_string} language
- Each content line must be under 18 words

CONTENT PHILOSOPHY:
- {ctx.content_philosophy}
- Use familiar topics and vocabulary
- Plausible > precise (this is social content, not textbooks)

FORMATTING:
- Titles in ALL CAPS
- One format style per reel (do not mix)
- No emojis, hashtags, or disclaimers
- No CTA (call-to-action) - it's added separately
- No numbered lists (numbers added by system)

You generate content that feels familiar, not repeated.
Output ONLY valid JSON, no markdown, no explanations."""

# Backward-compatible default
SYSTEM_PROMPT = build_system_prompt()


# ============================================================
# RUNTIME PROMPT BUILDER (TINY - SENT EVERY REQUEST)
# ============================================================

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
    
    # Build suggested title from archetype
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

    # Inject user reel examples (few-shot) if available
    if ctx.has_reel_examples:
        prompt = format_reel_examples(ctx.reel_examples) + "\n\n" + prompt

    # Inject user-configured content prompts from DB
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
    """
    Build runtime prompt with anti-repetition context.
    Only adds history when there's recent content to avoid.
    """
    base_prompt = build_runtime_prompt(selection, ctx=ctx)
    
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
- CLOSE-UP, full-frame composition where the subject fills the entire image
- Minimal background visible — think macro photography or tightly-cropped shots
- Studio-quality cinematic lighting
- Premium aesthetic matching brand style
- MUST end with: "No text, no letters, no numbers, no symbols, no logos."
"""


# ============================================================
# POST CONTENT PROMPT (used by generate_post_titles_batch)
# ============================================================

POST_QUALITY_SUFFIX = (
    "Ultra high quality, 8K, sharp focus, professional photography, "
    "soft natural lighting, premium lifestyle aesthetic. "
    "Photorealistic, detailed textures, beautiful composition. "
    "Close-up, full-frame, subject fills the entire image. "
    "Portrait orientation 4:5 aspect ratio."
)

def build_reel_base_style(ctx: PromptContext = None) -> str:
    """
    Build the deAPI visual style directive from NicheConfig.
    Replaces the hardcoded REEL_BASE_STYLE constant.
    No niche-specific defaults — all style comes from ctx or is completely generic.
    """
    if ctx is None:
        ctx = PromptContext()

    # Priority 1: explicit composition style from NicheConfig (most specific)
    if ctx.image_composition_style:
        return (
            f"{ctx.image_composition_style} "
            "Full-frame composition. Dense, detailed layout filling the entire frame. "
            "Polished, high-detail surfaces. Magazine-quality output."
        )

    # Priority 2: general image style description (medium specificity)
    if ctx.image_style_description:
        return (
            f"{ctx.image_style_description} "
            "Full-frame composition filling the entire frame. "
            "Professional studio-quality lighting. Sharp focus. Magazine-quality output."
        )

    # Priority 3: truly generic — imposes NOTHING niche-specific
    return (
        "Premium studio photography. Clean, full-frame composition. "
        "Professional lighting with sharp focus and high-quality textures. "
        "Polished surfaces. Magazine-quality output with vivid clarity."
    )

# Backward-compatible alias
REEL_BASE_STYLE = build_reel_base_style()

def build_image_prompt_system(ctx: PromptContext = None) -> str:
    if ctx is None:
        ctx = PromptContext()
    composition_hint = ctx.image_composition_style if ctx.image_composition_style else "Close-up, full-frame composition where the subject fills the entire frame — NOT wide shots"
    return f"""You are a visual prompt engineer specializing in {ctx.niche_name.lower()} imagery for Instagram.

Given a title, generate a DETAILED cinematic image prompt suitable for AI image generation (DALL-E / Flux).

### REQUIREMENTS:
- {ctx.image_style_description}
- CRITICAL: {composition_hint}
- Must end with "No text, no letters, no numbers, no symbols, no logos."
- Should be 2-3 sentences long
"""

# Backward-compatible default
IMAGE_PROMPT_SYSTEM = build_image_prompt_system()

FALLBACK_PROMPTS = {
    "generic (default)": "A cinematic lifestyle scene with soft golden sunlight and premium objects arranged artistically. Bright, clean, optimistic mood with studio-quality lighting. No text, no letters, no numbers, no symbols, no logos.",
}

def get_brand_palettes() -> dict:
    """Load brand color palettes dynamically from the database."""
    try:
        from app.db_connection import get_db_session
        with get_db_session() as db:
            from app.models.brands import Brand
            brands = db.query(Brand).filter(Brand.active == True).all()
            palettes = {}
            for b in brands:
                colors = b.colors or {}
                palettes[b.id] = {
                    "name": b.display_name or b.id,
                    "primary": colors.get("primary", "#2196F3"),
                    "accent": colors.get("accent", "#64B5F6"),
                    "color_description": colors.get("color_name", ""),
                }
            return palettes
    except Exception:
        return {}

# Backward-compatible alias
BRAND_PALETTES = {}

IMAGE_MODELS = {
    "posts": {
        "name": "ZImageTurbo_INT8",
        "dimensions": "1088x1360 (rounded from 1080x1350)",
        "steps": 8,
        "description": "Higher quality model for posts. Better prompt adherence and fidelity.",
    },
    "reels": {
        "name": "Flux1schnell",
        "dimensions": "1152x1920 (rounded from 1080x1920)",
        "steps": 4,
        "description": "Fast model for reel backgrounds. Cheaper per image.",
    },
}


# ============================================================
# POST CONTENT GENERATION PROMPT (source of truth)
# ============================================================

# Carousel examples are now user-configured via NicheConfig.
# When no user examples exist, the prompt runs without examples
# rather than using hardcoded niche-specific content.
CAROUSEL_SLIDE_EXAMPLES = []


def build_post_content_prompt(count: int, history_context: str = "", topic_hint: str = None, ctx: PromptContext = None) -> str:
    """
    Build the full post content generation prompt.
    This is the SINGLE SOURCE OF TRUTH for post generation.
    Both the AI generator and the transparency page read from here.

    Args:
        count: Number of posts to generate
        history_context: Recently generated titles to avoid repetition
        topic_hint: Optional topic hint
        ctx: Optional PromptContext for niche-specific content
    Returns:
        Complete prompt string
    """
    if ctx is None:
        ctx = PromptContext()
    # Build examples section — user examples if available, else hardcoded fallback
    if ctx.has_post_examples:
        examples_text = format_post_examples(ctx.post_examples)
    else:
        examples_text = ""
        for i, ex in enumerate(CAROUSEL_SLIDE_EXAMPLES, 1):
            examples_text += f"\n**Example {i} ({ex.get('topic', 'General')}):**\n"
            examples_text += f"Title (Slide 1): {ex['title']}\n"
            for j, slide in enumerate(ex["slides"], 2):
                examples_text += f"Slide {j}: {slide}\n"

    brief_block = ""
    if ctx.content_brief:
        brief_block = f"\nCONTENT BRIEF (follow this closely):\n{ctx.content_brief}\n"

    prompt = f"""You are a {ctx.niche_name.lower()} content creator for {ctx.parent_brand_name}, targeting {ctx.target_audience}.
{brief_block}
Generate EXACTLY {count} COMPLETELY DIFFERENT {ctx.niche_name.lower()}-focused posts. Each post MUST cover a DIFFERENT topic category.

### TARGET AUDIENCE:
{ctx.audience_description}

### CRITICAL WRITING RULES:
- NEVER use em dashes or en dashes (the long dash characters). Instead, use commas, periods, semicolons, or rephrase the sentence. For example, write "it's not just about volume, it's about balance" instead of "it's not just about volume—it's about balance."
- Write in a natural, human, conversational tone. Avoid patterns that feel robotic or AI-generated.
- Use short, punchy sentences mixed with longer explanatory ones for rhythm.
- Each slide text must read as a standalone paragraph that could be a standalone Instagram text post.

### CRITICAL RULE:
Each of the {count} posts MUST be about a DIFFERENT topic. Do NOT repeat similar themes.
Pick {count} DIFFERENT categories from this list (one per post):
{chr(10).join(f'{i+1}. {topic}' for i, topic in enumerate(ctx.topic_categories))}

### WHAT MAKES A GREAT POST TITLE (Slide 1):
- Each post MUST be based on a real, verifiable scientific study
- The title should reference the study finding (e.g. "STUDY REVEALS SLEEPING IN A COLD ROOM IMPROVES FAT METABOLISM")
- A bold, impactful health statement written in ALL CAPS
- TITLE MUST BE 8-14 WORDS LONG (approximately 55-90 characters) — this is critical for the cover layout
- Focused on one or two main benefits
- Positive, empowering, and slightly exaggerated to create scroll-stop engagement
- Do NOT lie, but dramatize slightly to spark discussion
- Do NOT end the title with a period (.) unless it's a two-part statement where the second part adds impact

### TITLE STYLE VARIETY (CRITICAL, mix these across the batch):
You MUST use a MIX of these title styles. Never generate all titles in the same style!

**Style A: Bold statement with impact**
- "[SURPRISING STATISTIC]. BUT HERE'S THE GOOD NEWS."
- "[COMMON ASSUMPTION] IS ACTUALLY WRONG. HERE'S WHY."

**Style B: Direct statement or conditional**
- "IF YOU [COMMON EXPERIENCE], THIS COULD BE WHY."
- "ONE DAILY HABIT CAN CHANGE YOUR [RELEVANT AREA]."

**Style C: Educational insight**
- "[LITTLE-KNOWN FACT]. AND IT AFFECTS EVERYTHING."
- "[TOPIC] IS MORE IMPORTANT THAN YOU THINK."

**Style D: Study-based revelation**
- "STUDY REVEALS [SURPRISING FINDING ABOUT TOPIC]"
- "RESEARCH SHOWS [EVIDENCE-BASED CLAIM]"
- "[YEAR] STUDY FOUND [FINDING] IMPROVES [BENEFIT]"

### WHAT TO AVOID:
- Em dashes or en dashes anywhere in the text (use commas or periods instead)
- Reel-style titles like "5 SIGNS..." or "THINGS THAT DESTROY..."
- Question formats or numbered lists as titles
- Topics outside the configured niche categories

### CAPTION REQUIREMENTS:
Write a full Instagram caption (4-5 paragraphs) that:
- Paragraph 1: Hook: expand on the title with a surprising or counterintuitive angle
- Paragraph 2-3: Explain the science/mechanism in accessible, expert-friendly language. Be specific about what happens and why it matters.
- Paragraph 4: Summarize the takeaway, what the reader can expect if they take action
- After the paragraphs, add a "Source:" section with a REAL, EXISTING academic reference in this format:
  Author(s). (Year). Title. Journal, Volume(Issue), Pages.
  DOI: 10.xxxx/xxxxx
  THE DOI MUST BE A REAL, VERIFIABLE DOI that exists on doi.org. Use well-known published studies. The study must be related to the topic.
  MANDATORY: Every single post MUST include a real DOI. This is non-negotiable. Use studies from PubMed, Nature, The Lancet, JAMA, BMJ, or other reputable journals. NEVER invent or fabricate a DOI.
- Include the study reference with DOI at the end of the caption.
- End with a disclaimer block:
  Disclaimer:
  {ctx.disclaimer_text if ctx.disclaimer_text else 'This content is intended for educational and informational purposes only. Individual results may vary.'}
- Separate each section with a blank line for readability

### CAROUSEL SLIDE TEXTS (CRITICAL, this is for Instagram carousel slides 2+):
Generate 3-4 slide texts for each post. These appear as text-only slides after the main cover image.
Each slide text should be:
- A standalone paragraph (3-6 sentences) that reads well on its own
- Written in a calm, authoritative, educational tone (NOT salesy)
- No em dashes or en dashes anywhere
- Slide 1 text: The core scientific explanation (what happens in the body)
- Slide 2 text: Deeper mechanism / why it matters / practical context
- Slide 3 text: Practical advice, actionable takeaways, or specific recommendations
- Slide 4 text (optional): Closing takeaway + call-to-action. MUST end with a new paragraph: "Follow @{{{{brandhandle}}}} to learn more about your {{{{topic_word}}}}." where topic_word is one relevant word from the niche (e.g. one of: {', '.join(ctx.topic_keywords[:8]) if ctx.topic_keywords else 'the topic'}).
Note: the {{{{brandhandle}}}} placeholder will be replaced by the system.
If only 3 slides, the last slide should include both actionable advice AND the Follow CTA.

### REFERENCE EXAMPLES (study these for tone, depth, and structure):
{examples_text}

### IMAGE PROMPT REQUIREMENTS:
- {ctx.image_style_description if ctx.image_style_description else 'High-end lifestyle photography style'}
- Each image prompt MUST be visually DIFFERENT (different setting, different elements)
- CRITICAL: Generate CLOSE-UP, full-frame images where the subject fills the ENTIRE frame with minimal background visible
- Think macro photography or tightly-cropped food/product shots — NO wide shots, NO large empty backgrounds
- The subject should dominate the image, edge to edge
- Must end with: "No text, no letters, no numbers, no symbols, no logos."

{history_context}

{"Topic hint: " + topic_hint if topic_hint else ""}

### OUTPUT FORMAT (JSON array, no markdown):"""

    # Inject user-configured content prompts from DB
    prompts = get_content_prompts()
    brand_desc = prompts.get('brand_description', '').strip()
    posts_prompt = prompts.get('posts_prompt', '').strip()
    extra_context = ""
    if brand_desc:
        extra_context += f"\n\n### BRAND CONTEXT (use this to shape content tone and audience):\n{brand_desc}"
    if posts_prompt:
        extra_context += f"\n\n### ADDITIONAL INSTRUCTIONS (follow these carefully):\n{posts_prompt}"

    prompt += extra_context

    prompt += f"""
[
  {{{{
    "title": "TITLE IN ALL CAPS FOR SLIDE 1",
    "caption": "Hook paragraph.\\n\\nScience explanation.\\n\\nMore detail.\\n\\nTakeaway.\\n\\nSource:\\nAuthor. (Year). Title. Journal, Vol(Issue), Pages.\\nDOI: 10.xxxx/xxxxx\\n\\nDisclaimer:\\nThis content is intended for educational and informational purposes only...",
    "slide_texts": [
      "First slide paragraph explaining the core science. 3-6 sentences.",
      "Second slide going deeper into why it matters. 3-6 sentences.",
      "Third slide with practical advice and actionable steps. 3-6 sentences.",
      "Fourth slide with closing takeaway.\n\nFollow @{{{{brandhandle}}}} to learn more about your {{{{topic_word}}}}."
    ],
    "image_prompt": "Detailed cinematic image description. No text, no letters, no numbers, no symbols, no logos.",
    "doi": "10.xxxx/xxxxx"
  }}}}
]

Generate exactly {count} posts now:"""

    return prompt


def get_post_content_prompt_for_display() -> str:
    """
    Return a clean version of the post content prompt for the transparency page.
    Uses placeholder values so users can see the template structure.
    """
    return build_post_content_prompt(
        count=5,
        history_context="[Recent titles injected here dynamically to prevent repetition]",
        topic_hint=None,
    )
