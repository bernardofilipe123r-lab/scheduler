"""Carousel / post content prompts — batch generation and display."""
from typing import Optional
from app.core.prompt_context import PromptContext, format_post_examples
from app.core.prompt_templates.system_prompts import get_content_prompts


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
            f"After the content paragraphs, add a real academic source reference:\n"
            f"  Study: [Short study description] — [Journal or Institution], [Year]\n"
            f"  Use studies from: {source_names}\n"
            f"  The study MUST be real and verifiable. NEVER invent or fabricate a study reference."
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


def build_post_content_prompt(count: int, history_context: str = "", topic_hint: str = None, ctx: PromptContext = None, title_format: str = None) -> str:
    """
    Build the prompt for batch carousel post generation.
    Fully niche-agnostic — all domain-specific content comes from ctx.

    Args:
        title_format: An ID from CAROUSEL_TITLE_TEMPLATES. When provided, DeepSeek MUST
                      use the template's exact structural pattern for the title.
    """
    if ctx is None:
        ctx = PromptContext()

    niche_label = ctx.niche_name.lower() if ctx.niche_name else "content"
    audience_label = ctx.target_audience if ctx.target_audience else "the target audience"

    # Build each dynamic block
    citation_block = _build_citation_block(ctx)
    slide1_instruction = _build_slide1_instruction(ctx)
    title_examples = _build_post_title_examples(ctx)

    # Image composition hint — from ctx, never a niche-specific fallback
    composition_hint = "Close-up, full-frame where subject fills the entire frame with minimal background"
    image_style_hint = "High-quality studio photography with rich, vibrant colors"

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

    # Slide 4: conclusion + CTA — AI writes a content-specific CTA referencing this post's topic.
    # @BRANDHANDLE is a safe render-time token (no braces) that won't confuse the model.
    slide4_instruction = (
        f"A concluding takeaway paragraph (2-3 sentences summarizing the key insight or actionable advice for {audience_label}). "
        f"Then on a NEW paragraph (separated by a blank line): ONE single sentence that weaves a specific reference to "
        f"this post's topic together with a follow call-to-action. "
        f"The sentence MUST contain @BRANDHANDLE (literal token — do not change it). "
        f"Examples of the correct format: "
        f"'If you want to learn more about how circadian lighting affects metabolism, follow @BRANDHANDLE!', "
        f"'Want more evidence-based tips on omega-3 and brain function? Follow @BRANDHANDLE!', "
        f"'For more science-backed nutrition advice, follow @BRANDHANDLE!'. "
        f"NEVER split this into two sentences or two paragraphs — it must be exactly one sentence."
    )
    slide4_cta_line = "If you want more [specific content reference from this post], follow @BRANDHANDLE!"

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

    # Title format constraint — selected algorithmically, injected as a HARD rule
    # so DeepSeek fills in the template rather than freely inventing structure
    title_format_constraint = ""
    if title_format:
        try:
            from app.services.toby.learning_engine import CAROUSEL_TITLE_TEMPLATES
            tmpl = CAROUSEL_TITLE_TEMPLATES.get(title_format)
            if tmpl:
                title_format_constraint = (
                    f"- MANDATORY TITLE STRUCTURE: Your title MUST follow this exact pattern:\n"
                    f"  TEMPLATE: {tmpl['template']}\n"
                    f"  HOW TO FILL IT IN: {tmpl['instruction']}\n"
                    f"  Do NOT deviate from this structural pattern. Fill in the [SLOTS] with "
                    f"niche-specific, topic-relevant content."
                )
        except Exception:
            pass
    if not title_format_constraint:
        title_format_constraint = (
            "- IMPORTANT: Vary the title structure. Avoid starting every title with the same word. "
            "Use diverse patterns: STUDY REVEALS, NEW RESEARCH SHOWS, THE HIDDEN REASON, "
            "WHY [X] IS, WHAT HAPPENS WHEN, THIS SPECIFIC [X], MOST PEOPLE DON'T KNOW, etc."
        )

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
{title_format_constraint}

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
- Slide 4 text: {slide4_instruction}
Each slide should be 3-4 sentences (roughly 40-60 words). Write in flowing prose, not bullet points or emojis.
Do NOT include the post title or a cover slide in slide_texts — the cover is handled separately.

### IMAGE REQUIREMENTS:
- {image_style_hint}
- CRITICAL: {composition_hint}
- COLOR MANDATE: The image MUST be vibrant and colorful. NEVER monochrome, black-and-white, or desaturated. Always describe specific vivid colors.
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
      "Concluding takeaway with actionable advice.\n\n{slide4_cta_line}"
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
