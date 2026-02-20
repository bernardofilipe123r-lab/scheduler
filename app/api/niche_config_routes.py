"""API routes for niche configuration (Content DNA)."""

import os
import base64
import tempfile
import json
import requests as http_requests
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.db_connection import get_db
from app.api.auth.middleware import get_current_user
from app.models.niche_config import NicheConfig
from app.services.content.niche_config_service import get_niche_config_service

router = APIRouter(prefix="/niche-config", tags=["niche-config"])


# --- Validation constants ---

EXAMPLE_LIMITS = {
    "max_reel_examples": 20,
    "max_post_examples": 20,
    "max_content_lines_per_reel": 15,
    "max_slides_per_post": 15,
    "max_title_length": 200,
    "max_line_length": 500,
}


# --- Pydantic schemas ---

class NicheConfigUpdate(BaseModel):
    brand_id: Optional[str] = None
    niche_name: Optional[str] = Field(None, max_length=100)
    niche_description: Optional[str] = None
    content_brief: Optional[str] = None
    target_audience: Optional[str] = Field(None, max_length=255)
    audience_description: Optional[str] = None
    content_tone: Optional[list] = None
    tone_avoid: Optional[list] = None
    topic_categories: Optional[list] = None
    topic_keywords: Optional[list] = None
    topic_avoid: Optional[list] = None
    content_philosophy: Optional[str] = None
    hook_themes: Optional[list] = None
    reel_examples: Optional[list] = None
    post_examples: Optional[list] = None
    image_style_description: Optional[str] = None
    image_palette_keywords: Optional[list] = None
    brand_personality: Optional[str] = None
    brand_focus_areas: Optional[list] = None
    parent_brand_name: Optional[str] = Field(None, max_length=100)
    cta_options: Optional[list] = None
    hashtags: Optional[list] = None
    competitor_accounts: Optional[list] = None
    discovery_hashtags: Optional[list] = None
    citation_style: Optional[str] = Field(None, max_length=50)
    citation_source_types: Optional[list] = None
    image_composition_style: Optional[str] = None
    yt_title_examples: Optional[list] = None
    yt_title_bad_examples: Optional[list] = None
    carousel_cta_topic: Optional[str] = Field(None, max_length=255)
    follow_section_text: Optional[str] = None
    save_section_text: Optional[str] = None
    disclaimer_text: Optional[str] = None


# --- Validation helpers ---

def validate_reel_examples(examples: list) -> list:
    """Validate and sanitize reel examples."""
    if len(examples) > EXAMPLE_LIMITS["max_reel_examples"]:
        raise ValueError(f"Maximum {EXAMPLE_LIMITS['max_reel_examples']} reel examples allowed")

    validated = []
    for ex in examples:
        if not isinstance(ex, dict) or not ex.get("title") or not ex.get("content_lines"):
            continue
        title = str(ex["title"]).strip()[:EXAMPLE_LIMITS["max_title_length"]]
        lines = [
            str(line).strip()[:EXAMPLE_LIMITS["max_line_length"]]
            for line in ex["content_lines"][:EXAMPLE_LIMITS["max_content_lines_per_reel"]]
            if str(line).strip()
        ]
        if title and lines:
            validated.append({"title": title, "content_lines": lines})

    return validated


def validate_post_examples(examples: list) -> list:
    """Validate and sanitize post examples."""
    if len(examples) > EXAMPLE_LIMITS["max_post_examples"]:
        raise ValueError(f"Maximum {EXAMPLE_LIMITS['max_post_examples']} post examples allowed")

    validated = []
    for ex in examples:
        if not isinstance(ex, dict) or not ex.get("title") or not ex.get("slides"):
            continue
        title = str(ex["title"]).strip()[:EXAMPLE_LIMITS["max_title_length"]]
        slides = [
            str(slide).strip()[:EXAMPLE_LIMITS["max_line_length"]]
            for slide in ex["slides"][:EXAMPLE_LIMITS["max_slides_per_post"]]
            if str(slide).strip()
        ]
        if title and slides:
            result = {"title": title, "slides": slides}
            if ex.get("study_ref"):
                result["study_ref"] = str(ex["study_ref"]).strip()[:200]
            # Legacy migration: convert old doi field to study_ref
            elif ex.get("doi"):
                result["study_ref"] = str(ex["doi"]).strip()[:200]
            validated.append(result)

    return validated


def _cfg_to_dict(cfg: NicheConfig) -> dict:
    """Convert a NicheConfig row to a JSON-serializable dict."""
    return {
        "id": cfg.id,
        "brand_id": cfg.brand_id,
        "niche_name": cfg.niche_name,
        "niche_description": cfg.niche_description,
        "content_brief": cfg.content_brief or "",
        "target_audience": cfg.target_audience,
        "audience_description": cfg.audience_description,
        "content_tone": cfg.content_tone or [],
        "tone_avoid": cfg.tone_avoid or [],
        "topic_categories": cfg.topic_categories or [],
        "topic_keywords": cfg.topic_keywords or [],
        "topic_avoid": cfg.topic_avoid or [],
        "content_philosophy": cfg.content_philosophy,
        "hook_themes": cfg.hook_themes or [],
        "reel_examples": cfg.reel_examples or [],
        "post_examples": cfg.post_examples or [],
        "image_style_description": cfg.image_style_description,
        "image_palette_keywords": cfg.image_palette_keywords or [],
        "brand_personality": cfg.brand_personality,
        "brand_focus_areas": cfg.brand_focus_areas or [],
        "parent_brand_name": cfg.parent_brand_name,
        "cta_options": cfg.cta_options or [],
        "hashtags": cfg.hashtags or [],
        "competitor_accounts": cfg.competitor_accounts or [],
        "discovery_hashtags": cfg.discovery_hashtags or [],
        "citation_style": cfg.citation_style or "none",
        "citation_source_types": cfg.citation_source_types or [],
        "image_composition_style": cfg.image_composition_style or "",
        "yt_title_examples": cfg.yt_title_examples or [],
        "yt_title_bad_examples": cfg.yt_title_bad_examples or [],
        "carousel_cta_topic": cfg.carousel_cta_topic or "",
        "follow_section_text": cfg.follow_section_text,
        "save_section_text": cfg.save_section_text,
        "disclaimer_text": cfg.disclaimer_text,
    }


# --- Routes ---

@router.get("")
async def get_niche_config(
    brand_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get niche config — global or per-brand."""
    user_id = user["id"]

    cfg = (
        db.query(NicheConfig)
        .filter(NicheConfig.user_id == user_id, NicheConfig.brand_id == brand_id)
        .first()
    )

    if cfg:
        return _cfg_to_dict(cfg)

    # If no config found, return defaults from PromptContext
    from app.core.prompt_context import PromptContext
    ctx = PromptContext()
    return {
        "id": None,
        "brand_id": brand_id,
        "niche_name": ctx.niche_name,
        "niche_description": ctx.niche_description,
        "content_brief": ctx.content_brief,
        "target_audience": ctx.target_audience,
        "audience_description": ctx.audience_description,
        "content_tone": ctx.content_tone,
        "tone_avoid": ctx.tone_avoid,
        "topic_categories": ctx.topic_categories,
        "topic_keywords": ctx.topic_keywords,
        "topic_avoid": ctx.topic_avoid,
        "content_philosophy": ctx.content_philosophy,
        "hook_themes": ctx.hook_themes,
        "reel_examples": ctx.reel_examples,
        "post_examples": ctx.post_examples,
        "image_style_description": ctx.image_style_description,
        "image_palette_keywords": ctx.image_palette_keywords,
        "brand_personality": ctx.brand_personality,
        "brand_focus_areas": ctx.brand_focus_areas,
        "parent_brand_name": ctx.parent_brand_name,
        "cta_options": ctx.cta_options,
        "hashtags": ctx.hashtags,
        "competitor_accounts": ctx.competitor_accounts,
        "discovery_hashtags": ctx.discovery_hashtags,
        "citation_style": ctx.citation_style,
        "citation_source_types": ctx.citation_source_types,
        "image_composition_style": ctx.image_composition_style,
        "yt_title_examples": ctx.yt_title_examples,
        "yt_title_bad_examples": ctx.yt_title_bad_examples,
        "carousel_cta_topic": ctx.carousel_cta_topic,
        "follow_section_text": ctx.follow_section_text,
        "save_section_text": ctx.save_section_text,
        "disclaimer_text": ctx.disclaimer_text,
    }


@router.put("")
async def update_niche_config(
    request: NicheConfigUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Create or update niche config — global or per-brand."""
    user_id = user["id"]
    brand_id = request.brand_id  # None = global

    # Validate examples if provided
    try:
        if request.reel_examples is not None:
            request.reel_examples = validate_reel_examples(request.reel_examples)
        if request.post_examples is not None:
            request.post_examples = validate_post_examples(request.post_examples)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Find existing or create new
    cfg = (
        db.query(NicheConfig)
        .filter(NicheConfig.user_id == user_id, NicheConfig.brand_id == brand_id)
        .first()
    )

    if not cfg:
        cfg = NicheConfig(user_id=user_id, brand_id=brand_id)
        db.add(cfg)

    # Update fields that were provided (non-None)
    update_data = request.model_dump(exclude_unset=True, exclude={"brand_id"})
    for field_name, value in update_data.items():
        if value is not None:
            setattr(cfg, field_name, value)

    db.commit()
    db.refresh(cfg)

    # Invalidate cache
    service = get_niche_config_service()
    service.invalidate_cache(brand_id=brand_id, user_id=user_id)

    return _cfg_to_dict(cfg)


@router.post("/ai-understanding")
async def get_ai_understanding(
    brand_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Generate an AI-written summary of how it understands the brand based on config.

    Returns a paragraph from the AI's perspective describing:
    - What kind of content it creates
    - Who the target audience is
    - What tone and topics it focuses on
    - An example reel title & an example post title it would generate
    """
    user_id = user["id"]
    service = get_niche_config_service()
    ctx = service.get_context(brand_id=brand_id, user_id=user_id)

    config_summary = []
    if ctx.niche_name:
        config_summary.append(f"Niche: {ctx.niche_name}")
    if ctx.content_brief:
        config_summary.append(f"Content brief: {ctx.content_brief}")
    if ctx.target_audience:
        config_summary.append(f"Audience: {ctx.target_audience}")
    if ctx.audience_description:
        config_summary.append(f"Audience detail: {ctx.audience_description}")
    if ctx.content_tone:
        config_summary.append(f"Tone: {', '.join(ctx.content_tone)}")
    if ctx.topic_categories:
        config_summary.append(f"Topics: {', '.join(ctx.topic_categories[:10])}")
    if ctx.content_philosophy:
        config_summary.append(f"Philosophy: {ctx.content_philosophy}")
    if ctx.parent_brand_name:
        config_summary.append(f"Brand: {ctx.parent_brand_name}")
    if ctx.image_style_description:
        config_summary.append(f"Visual style: {ctx.image_style_description}")

    if not config_summary:
        return {
            "understanding": "I don't have enough information about this brand yet. Configure your Content DNA \u2014 add your niche, audience, topics, and tone \u2014 and I'll be able to tell you exactly how I understand your brand.",
            "example_reel": None,
            "example_post": None,
        }

    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        return {
            "understanding": "AI service is not configured.",
            "example_reel": None,
            "example_post": None,
        }

    config_text = "\n".join(config_summary)

    prompt = f"""Based on the following brand configuration, write a first-person summary (as the AI content engine) explaining how you understand this brand. Write 2-3 paragraphs.

Configuration:
{config_text}

Also generate:
1. One FULL example reel with a title (ALL CAPS, 8-12 words) and 5-8 content lines (short fragments or cause-effect pairs)
2. One FULL example carousel post BASED ON A REAL SCIENTIFIC STUDY with:
   - A title referencing the study finding (ALL CAPS, 8-14 words, e.g. "STUDY REVEALS SLEEPING IN A COLD ROOM IMPROVES FAT METABOLISM")
   - 3-4 slides of detailed educational content (each slide is 3-5 sentences explaining the study and its implications)
   - A study_ref string: "Study short name — Journal or Institution, Year" (must be a real, verifiable study)
   - The LAST slide must have TWO paragraphs: first a concluding takeaway (2-3 sentences summarizing the key insight or actionable advice), then separated by a blank line (\\n\\n), a CTA sentence (e.g. "For more science-backed tips, follow @brand_name"). This paragraph separation is critical for proper rendering.
   - IMPORTANT: Do NOT prefix slide text with "Slide 1:", "Slide 2:" etc. Just write the paragraph directly.

Write in first person ("I create...", "I understand...", "My goal is..."). Be specific about the niche, not generic. Show that you deeply understand the brand identity.

OUTPUT FORMAT (JSON only):
{{{{
    "understanding": "Your 2-3 paragraph first-person summary here...",
    "example_reel": {{{{
        "title": "REEL TITLE IN ALL CAPS",
        "content_lines": ["Line 1", "Line 2", "Line 3", "..."]
    }}}},
    "example_post": {{{{
        "title": "POST TITLE IN ALL CAPS REFERENCING A STUDY",
        "slides": ["Detailed study findings paragraph...", "Mechanism explanation paragraph...", "Practical implications paragraph...", "Concluding takeaway sentences.\\n\\nFollow @brand for more..."],
        "study_ref": "Iron absorption and tea tannins — Cell Metabolism, 2022"
    }}}}
}}}}"""

    try:
        response = http_requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
                "max_tokens": 1500,
            },
            timeout=30,
        )

        if response.status_code == 200:
            import json
            data = response.json()
            content_text = data["choices"][0]["message"]["content"].strip()
            if content_text.startswith("```"):
                content_text = content_text.split("```")[1]
                if content_text.startswith("json"):
                    content_text = content_text[4:]
                content_text = content_text.strip()
            result = json.loads(content_text)
            return {
                "understanding": result.get("understanding", ""),
                "example_reel": result.get("example_reel"),
                "example_post": result.get("example_post"),
            }
    except Exception as e:
        print(f"AI understanding generation failed: {e}", flush=True)

    return {
        "understanding": "I wasn't able to generate an understanding right now. Please try again.",
        "example_reel": None,
        "example_post": None,
    }


# --- Generate Post Example endpoint ---

class GeneratePostExampleRequest(BaseModel):
    brand_id: Optional[str] = None
    num_slides: int = Field(default=4, ge=3, le=4)
    existing_titles: List[str] = Field(default_factory=list, max_length=20)


@router.post("/generate-post-example")
async def generate_post_example(
    request: GeneratePostExampleRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Generate a single post example via DeepSeek based on brand config."""
    user_id = user["id"]
    service = get_niche_config_service()
    ctx = service.get_context(brand_id=request.brand_id, user_id=user_id)

    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI service not configured")

    config_parts = []
    if ctx.niche_name:
        config_parts.append(f"Niche: {ctx.niche_name}")
    if ctx.content_brief:
        config_parts.append(f"Brief: {ctx.content_brief}")
    if ctx.content_tone:
        config_parts.append(f"Tone: {', '.join(ctx.content_tone)}")
    config_text = "\n".join(config_parts) if config_parts else "General educational content"

    # Build exclusion block from existing examples
    exclusion_block = ""
    if request.existing_titles:
        exclusion_block = "\n\nALREADY USED TOPICS (you MUST pick a COMPLETELY DIFFERENT topic, study, and angle — NEVER repeat or paraphrase these):\n"
        for t in request.existing_titles:
            exclusion_block += f"- {t}\n"
        exclusion_block += "\nPick a totally different scientific domain, a different journal, and a different health mechanism. Be creative and surprising."

    prompt = f"""Generate ONE carousel post example BASED ON A REAL SCIENTIFIC STUDY for this brand:

{config_text}{exclusion_block}

Requirements:
- Title: ALL CAPS, 8-14 words, referencing a real study finding
- TITLE VARIETY IS CRITICAL: Do NOT start the title with "YOUR". Vary the opening word — use patterns like:
  "A NEW STUDY REVEALS...", "RESEARCHERS FOUND THAT...", "THIS COMMON HABIT...", "SCIENCE SAYS...",
  "THE SURPRISING LINK BETWEEN...", "HOW [THING] AFFECTS...", "WHAT HAPPENS WHEN...",
  "ONE SIMPLE CHANGE THAT...", "THE HIDDEN DANGER OF...", "WHY [THING] MATTERS MORE THAN..."
- The topic MUST be unique — choose a surprising, lesser-known study the audience wouldn't expect
- {request.num_slides} content slides (not counting the cover). Each slide: 3-5 sentences of educational content explaining the study
- Do NOT include a CTA in any slide — the CTA is added automatically by the system
- A study_ref string: "Study short name — Journal or Institution, Year" (must reference a REAL, verifiable study — do NOT fabricate)
- IMPORTANT: Do NOT prefix slide text with "Slide 1:", "Slide 2:" etc.

OUTPUT FORMAT (JSON only):
{{{{
    "title": "POST TITLE IN ALL CAPS",
    "slides": ["slide 1 text...", "slide 2 text...", ...],
    "study_ref": "Tannin-iron absorption interaction — Cell Metabolism, 2022"
}}}}"""

    try:
        response = http_requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.95,
                "max_tokens": 1000,
            },
            timeout=30,
        )
        if response.status_code == 200:
            data = response.json()
            content_text = data["choices"][0]["message"]["content"].strip()
            if content_text.startswith("```"):
                content_text = content_text.split("```")[1]
                if content_text.startswith("json"):
                    content_text = content_text[4:]
                content_text = content_text.strip()
            result = json.loads(content_text)
            return {
                "title": result.get("title", ""),
                "slides": result.get("slides", [])[:request.num_slides],
                "study_ref": result.get("study_ref", ""),
            }
    except Exception as e:
        print(f"Post example generation failed: {e}", flush=True)

    raise HTTPException(status_code=500, detail="Failed to generate post example")


# --- Suggest YouTube Titles endpoint ---

@router.post("/suggest-yt-titles")
async def suggest_yt_titles(
    brand_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Generate suggested YouTube title examples based on brand config."""
    user_id = user["id"]
    service = get_niche_config_service()
    ctx = service.get_context(brand_id=brand_id, user_id=user_id)

    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI service not configured")

    config_parts = []
    if ctx.niche_name:
        config_parts.append(f"Niche: {ctx.niche_name}")
    if ctx.content_brief:
        config_parts.append(f"Brief: {ctx.content_brief}")
    if ctx.content_tone:
        config_parts.append(f"Tone: {', '.join(ctx.content_tone)}")
    if ctx.reel_examples:
        titles = [ex.get("title", "") for ex in ctx.reel_examples[:5] if ex.get("title")]
        if titles:
            config_parts.append(f"Reel title examples: {', '.join(titles)}")
    config_text = "\n".join(config_parts) if config_parts else "General educational content"

    prompt = f"""Based on this brand configuration, suggest YouTube title examples — both good patterns to emulate and bad patterns to avoid.

{config_text}

Generate:
- 5 good title examples that match this brand's tone and niche (curiosity-driven, clear, engaging, not clickbait)
- 3 bad title examples that this brand should avoid (overly clickbaity, all-caps screaming, misleading)

OUTPUT FORMAT (JSON only):
{{{{
    "good_titles": ["title 1", "title 2", "title 3", "title 4", "title 5"],
    "bad_titles": ["bad title 1", "bad title 2", "bad title 3"]
}}}}"""

    try:
        response = http_requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
                "max_tokens": 500,
            },
            timeout=30,
        )
        if response.status_code == 200:
            data = response.json()
            content_text = data["choices"][0]["message"]["content"].strip()
            if content_text.startswith("```"):
                content_text = content_text.split("```")[1]
                if content_text.startswith("json"):
                    content_text = content_text[4:]
                content_text = content_text.strip()
            result = json.loads(content_text)
            return {
                "good_titles": result.get("good_titles", []),
                "bad_titles": result.get("bad_titles", []),
            }
    except Exception as e:
        print(f"YT title suggestion failed: {e}", flush=True)

    raise HTTPException(status_code=500, detail="Failed to generate title suggestions")


# --- Reel Preview endpoint ---

class ReelPreviewRequest(BaseModel):
    brand_id: str
    title: str = Field(..., max_length=200)
    content_lines: List[str] = Field(..., max_length=15)


@router.post("/preview-reel")
async def preview_reel_images(
    request: ReelPreviewRequest,
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Generate actual reel images (thumbnail + content) using the real ImageGenerator.

    Returns base64-encoded PNG images identical to what gets published.
    Uses light mode (no AI background generation = fast).
    """
    from app.services.media.image_generator import ImageGenerator
    from app.services.brands.resolver import brand_resolver

    brand_id = request.brand_id
    resolved = brand_resolver.resolve_brand_name(brand_id) or brand_id

    generator = ImageGenerator(
        brand_type=resolved,
        variant="light",
        brand_name=brand_id,
    )

    result = {}
    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)

            # Thumbnail
            thumb_path = tmp / "thumb.png"
            generator.generate_thumbnail(title=request.title, output_path=thumb_path)
            result["thumbnail_base64"] = base64.b64encode(thumb_path.read_bytes()).decode()

            # Content image
            content_path = tmp / "content.png"
            generator.generate_reel_image(
                title=request.title,
                lines=list(request.content_lines),
                output_path=content_path,
            )
            result["content_base64"] = base64.b64encode(content_path.read_bytes()).decode()

    except Exception as e:
        print(f"Reel preview generation failed: {e}", flush=True)
        raise HTTPException(status_code=500, detail="Failed to generate reel preview")

    return result
