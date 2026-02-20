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


def _build_citation_block(ctx: PromptContext) -> str:
    """
    Build the citation/source instruction block for carousel posts.
    Branches based on ctx.citation_style. Returns empty string when "none".
    """
    style = ctx.citation_style or "none"
    # Normalize: frontend sends "doi" but legacy code used "academic_doi"
    if style == "doi":
        style = "academic_doi"
    sources = ctx.citation_source_types

    if style == "academic_doi":
        source_names = ", ".join(sources) if sources else "PubMed, Nature, The Lancet, JAMA, BMJ"
        return (
            f"After the content paragraphs, add a real academic source:\n"
            f"  Source: Author(s). (Year). Title. Journal, Volume(Issue), Pages.\n"
            f"  DOI: 10.xxxx/xxxxx\n"
            f"  Use studies from: {source_names}\n"
            f"  THE DOI MUST BE A REAL, VERIFIABLE DOI. NEVER invent or fabricate a DOI."
        )
    elif style == "financial_data":
        source_names = ", ".join(sources) if sources else "Federal Reserve, World Bank, Bloomberg, SEC, IMF, BLS"
        return (
            f"After the content paragraphs, add a real data source:\n"
            f"  Source: [Organization]. ([Year]). [Report or dataset name]. Retrieved from [URL if public].\n"
            f"  Use data from: {source_names}\n"
            f"  The source MUST be a real, existing organization and real report."
        )
    elif style == "case_study":
        source_names = ", ".join(sources) if sources else "Harvard Business Review, McKinsey, real company public records"
        return (
            f"After the content paragraphs, add a real case reference:\n"
            f"  Case: [Company or person]. ([Year]). [What they did / quantified result].\n"
            f"  Source: {source_names} or verified company records.\n"
            f"  The case MUST be real and identifiable — no fabricated companies."
        )
    elif style == "expert_quote":
        return (
            f"After the content paragraphs, add a real expert reference:\n"
            f"  Expert: [Full name], [Title/Credential], [Organization/Context].\n"
            f"  Quote or key insight: \"[Their actual documented statement or position].\"\n"
            f"  The expert MUST be a real, named professional with verifiable credentials."
        )
    else:
        return ""  # "none" or empty — no citation required


def _build_slide1_instruction(ctx: PromptContext) -> str:
    """Build the first slide content instruction based on citation_style and niche."""
    style = ctx.citation_style or "none"
    if style == "doi":
        style = "academic_doi"
    niche = ctx.niche_description or (f"the {ctx.niche_name}" if ctx.niche_name else "this topic")

    if style == "academic_doi":
        return "Slide 1 text: The core scientific finding — what the research reveals and the mechanism behind it"
    elif style == "financial_data":
        return "Slide 1 text: What the data shows — the key statistic or trend and why it matters financially"
    elif style == "case_study":
        return "Slide 1 text: What happened — the context, the key decision or action, and the immediate outcome"
    elif style == "expert_quote":
        return "Slide 1 text: The expert's core insight — what they know that most people don't"
    else:
        return f"Slide 1 text: The core insight — what makes this true and why it matters in {niche}"


def _build_post_title_examples(ctx: PromptContext) -> str:
    """Build title examples for carousel posts. Uses user's post_examples first."""
    # User's own examples are the highest quality signal
    if ctx.has_post_examples:
        titles = [ex.get("title", "") for ex in ctx.post_examples[:3] if ex.get("title")]
        if titles:
            return "e.g. " + " | ".join(f'"{t}"' for t in titles)

    style = ctx.citation_style or "none"
    if style == "academic_doi":
        return (
            'e.g. "STUDY REVEALS COLD EXPOSURE ACTIVATES BROWN FAT THERMOGENESIS" or '
            '"RESEARCH SHOWS SLEEP DEBT DOUBLES CORTISOL WITHIN 72 HOURS"'
        )
    elif style == "financial_data":
        return (
            'e.g. "DATA SHOWS 73% OF RETAIL INVESTORS UNDERPERFORM INFLATION OVER 10 YEARS" or '
            '"FED DATA REVEALS MEDIAN HOUSEHOLD DEBT GREW 40% SINCE 2019"'
        )
    elif style == "case_study":
        return (
            'e.g. "HOW AIRBNB GREW FROM ZERO TO $75 BILLION BY BREAKING ONE RULE" or '
            '"THE APPLE PRICING STRATEGY THAT GENERATED $19 BILLION FROM A SINGLE PRODUCT"'
        )
    elif style == "expert_quote":
        return (
            'e.g. "WARREN BUFFETT\'S RULE THAT 99% OF INVESTORS IGNORE" or '
            '"WHY CHARLIE MUNGER REFUSED TO OWN THIS TYPE OF ASSET"'
        )
    else:
        niche = ctx.niche_name.upper() if ctx.niche_name else "YOUR TOPIC"
        return (
            f'e.g. "THE TRUTH ABOUT {niche} THAT CHANGES EVERYTHING" or '
            f'"WHY MOST PEOPLE GET {niche} COMPLETELY WRONG"'
        )


def _build_carousel_cta_topic(ctx: PromptContext) -> str:
    """Get the topic word for slide 4 CTA. Falls back through ctx fields."""
    if ctx.carousel_cta_topic:
        return ctx.carousel_cta_topic
    if ctx.topic_keywords:
        return ctx.topic_keywords[0]
    if ctx.niche_name:
        return ctx.niche_name.split()[0].lower()
    return "this topic"


def build_post_content_prompt(count: int, history_context: str = "", topic_hint: str = None, ctx: PromptContext = None) -> str:
    """
    Build the prompt for batch carousel post generation.
    Fully niche-agnostic — all domain-specific content comes from ctx.
    """
    if ctx is None:
        ctx = PromptContext()

    niche_label = ctx.niche_name.lower() if ctx.niche_name else "content"
    audience_label = ctx.target_audience if ctx.target_audience else "the target audience"

    # Build each dynamic block
    citation_block = _build_citation_block(ctx)
    slide1_instruction = _build_slide1_instruction(ctx)
    title_examples = _build_post_title_examples(ctx)
    cta_topic = _build_carousel_cta_topic(ctx)

    # Image composition hint — from ctx, never a niche-specific fallback
    composition_hint = (
        ctx.image_composition_style
        or "Close-up, full-frame where subject fills the entire frame with minimal background"
    )
    image_style_hint = ctx.image_style_description or "High-quality studio photography style"

    # Post examples from user (few-shot, highest quality signal)
    examples_block = format_post_examples(ctx.post_examples) if ctx.has_post_examples else ""

    # Topic list
    topic_block = ""
    if ctx.topic_categories:
        topic_block = "### VALID TOPICS (rotate through these):\n"
        topic_block += "\n".join(f"- {t}" for t in ctx.topic_categories)

    # Topic avoid
    avoid_block = ""
    if ctx.topic_avoid:
        avoid_block = "\n".join(f"- {t}" for t in ctx.topic_avoid)

    # Citation style label for title instruction
    _citation = ctx.citation_style if ctx.citation_style != "doi" else "academic_doi"
    if _citation == "academic_doi":
        title_style_note = "based on a real, verifiable scientific study"
        title_type_note = "A bold, impactful statement revealing what the research found, written in ALL CAPS"
    elif ctx.citation_style == "financial_data":
        title_style_note = "based on a real, verifiable data point or statistic"
        title_type_note = "A bold, impactful statement revealing what the data shows, written in ALL CAPS"
    elif ctx.citation_style == "case_study":
        title_style_note = "based on a real, verifiable case or example"
        title_type_note = "A bold, impactful statement summarizing the key finding or outcome, written in ALL CAPS"
    elif ctx.citation_style == "expert_quote":
        title_style_note = "based on a real expert's documented insight or position"
        title_type_note = "A bold, impactful statement framing what the expert reveals, written in ALL CAPS"
    else:
        title_style_note = "focused on a compelling insight or truth about the topic"
        title_type_note = f"A bold, impactful {niche_label} statement written in ALL CAPS"

    # Slide 4 CTA sentence
    slide4_cta = f"Follow @{{{{brandhandle}}}} to learn more about your {cta_topic}."

    # Caption mechanism instruction — uses niche description, not body/health
    niche_mechanism = ctx.niche_description if ctx.niche_description else f"the key concepts in {niche_label}"
    caption_mechanism = (
        f"Paragraph 2-3: Explain the core mechanism in accessible, {niche_label}-appropriate language. "
        f"Be specific about how and why this works in the context of {niche_mechanism}."
    )

    # Disclaimer
    disclaimer = ctx.disclaimer_text if ctx.disclaimer_text else ""
    disclaimer_block = f"- End with this disclaimer:\\n\u26a0\ufe0f Disclaimer:\\n{disclaimer}" if disclaimer else ""

    # Brief block
    brief_block = ""
    if ctx.content_brief:
        brief_block = f"\nCONTENT BRIEF (follow this closely):\n{ctx.content_brief}\n"

    # Pre-compute strings that contain newlines (Python 3.11 forbids chr(10) inside f-strings)
    avoid_suffix = ("\n" + avoid_block) if avoid_block else ""
    caption_source_suffix = "\\n\\nSource:\\n[citation]" if citation_block else ""

    prompt = f"""You are a {niche_label} content creator for {ctx.parent_brand_name or 'the brand'}, targeting {audience_label}.
{brief_block}
Generate EXACTLY {count} COMPLETELY DIFFERENT {niche_label}-focused posts. Each post MUST cover a DIFFERENT topic category.

Each post is a DIFFERENT topic. Each must be {title_style_note}.

{examples_block}

### TITLE FORMAT:
- {title_type_note}
- MUST BE 8-14 WORDS LONG (approximately 55-90 characters)
- Title examples: {title_examples}
- Do NOT end the title with a period
- Do NOT use reel-style titles like "5 SIGNS..." or "THINGS THAT DESTROY..."

{topic_block}

### CRITICAL WRITING RULES:
- NEVER use em dashes or en dashes (the long dash characters). Instead, use commas, periods, semicolons, or rephrase the sentence.
- Write in a natural, human, conversational tone. Avoid patterns that feel robotic or AI-generated.
- Use short, punchy sentences mixed with longer explanatory ones for rhythm.

### WHAT TO AVOID:
- Repeating any title or topic from the previously generated list
- Question formats or list/numbered formats (those are for reels)
- Vague claims without specific evidence or examples
- Topics outside {niche_label}{avoid_suffix}

### CAPTION REQUIREMENTS:
Each caption must be 4-5 paragraphs:
- Paragraph 1: Hook — expand on the title with a surprising or counterintuitive angle
- {caption_mechanism}
- Paragraph 4: Key takeaway — what the reader should understand or do differently
{citation_block}
{disclaimer_block}
- Separate each paragraph with a blank line

### SLIDE TEXT REQUIREMENTS (3-4 text slides — the cover image is generated separately):
- {slide1_instruction}
- Slide 2 text: Deeper implications, context, or supporting evidence
- Slide 3 text: Practical application — what this means for {audience_label} in real terms
- Slide 4 text (optional): {slide4_cta}
Each slide should be 3-4 sentences (roughly 40-60 words). Write in flowing prose, not bullet points or emojis.
Do NOT include the post title or a cover slide in slide_texts — the cover is handled separately.

### IMAGE REQUIREMENTS:
- {image_style_hint}
- CRITICAL: {composition_hint}
- Generate a full cinematic image prompt, 2-3 sentences
- Must end with: "No text, no letters, no numbers, no symbols, no logos."

{history_context}

{"Topic hint: " + topic_hint if topic_hint else ""}

### OUTPUT FORMAT (JSON array, no markdown, exactly {count} items):"""

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
    "title": "TITLE IN ALL CAPS",
    "caption": "Hook paragraph.\\n\\nMechanism explanation...\\n\\nImplications...\\n\\nTakeaway.{caption_source_suffix}",
    "slide_texts": [
      "{slide1_instruction.replace('Slide 1 text: ', '')}",
      "Deeper context or supporting evidence.",
      "Practical application for {audience_label}.",
      "{slide4_cta}"
    ],
    "image_prompt": "Detailed cinematic image description. No text, no letters, no numbers, no symbols, no logos."
  }}}}
]

Generate exactly {count} DIFFERENT posts now. Each must have a different title and topic."""

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
