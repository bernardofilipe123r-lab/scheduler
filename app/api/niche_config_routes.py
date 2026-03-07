"""API routes for niche configuration (Content DNA)."""

import os
import asyncio
import base64
import tempfile
import json
import re
import logging
import requests as http_requests
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.db_connection import get_db
from app.api.auth.middleware import get_current_user
from app.models.niche_config import NicheConfig
from app.models.brands import Brand
from app.services.content.niche_config_service import get_niche_config_service
from app.utils.rate_limit import rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/niche-config", tags=["niche-config"])


def _deepseek_call(api_key: str, prompt: str, temperature: float, max_tokens: int, timeout: int = 60):
    """Synchronous DeepSeek API call — meant to be run via asyncio.to_thread."""
    return http_requests.post(
        "https://api.deepseek.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": "deepseek-chat",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        timeout=timeout,
    )


def _parse_deepseek_json(response) -> dict:
    """Parse JSON from DeepSeek response, handling markdown fences."""
    content_text = response.json()["choices"][0]["message"]["content"].strip()
    if content_text.startswith("```"):
        content_text = content_text.split("```")[1]
        if content_text.startswith("json"):
            content_text = content_text[4:]
        content_text = content_text.strip()
    return json.loads(content_text)


# --- Validation constants ---

EXAMPLE_LIMITS = {
    "max_reel_examples": 50,
    "max_post_examples": 50,
    "max_content_lines_per_reel": 15,
    "max_slides_per_post": 15,
    "max_title_length": 200,
    "max_line_length": 500,
}


# --- Pydantic schemas ---

class NicheConfigUpdate(BaseModel):
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
    yt_title_examples: Optional[list] = None
    yt_title_bad_examples: Optional[list] = None
    carousel_cta_topic: Optional[str] = Field(None, max_length=255)
    carousel_cta_options: Optional[list] = None
    carousel_cover_overlay_opacity: Optional[int] = Field(None, ge=0, le=100)
    carousel_content_overlay_opacity: Optional[int] = Field(None, ge=0, le=100)
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
        "yt_title_examples": cfg.yt_title_examples or [],
        "yt_title_bad_examples": cfg.yt_title_bad_examples or [],
        "carousel_cta_topic": cfg.carousel_cta_topic or "",
        "carousel_cta_options": cfg.carousel_cta_options or [],
        "carousel_cover_overlay_opacity": cfg.carousel_cover_overlay_opacity if cfg.carousel_cover_overlay_opacity is not None else 65,
        "carousel_content_overlay_opacity": cfg.carousel_content_overlay_opacity if cfg.carousel_content_overlay_opacity is not None else 85,
        "follow_section_text": cfg.follow_section_text,
        "save_section_text": cfg.save_section_text,
        "disclaimer_text": cfg.disclaimer_text,
    }


def _infer_from_content_brief(content_brief: str) -> tuple[list[str], str]:
    """Best-effort extraction of topics and audience from free-text content brief."""
    brief = content_brief or ""

    target_match = re.search(r"(?:target\s+audience|audience)\s*:\s*([^\n]+)", brief, flags=re.IGNORECASE)
    target_audience = target_match.group(1).strip() if target_match else ""

    topic_match = (
        re.search(r"(?:daily\s+topics\s+include|topics\s+include|topic\s+categories)\s*:\s*([^\n]+)", brief, flags=re.IGNORECASE)
        or re.search(r"(?:daily\s+topics|topics)\s*:\s*([^\n]+)", brief, flags=re.IGNORECASE)
    )

    raw_topics = topic_match.group(1) if topic_match else ""
    topic_candidates = re.sub(r"\([^)]*\)", " ", raw_topics).split(",")

    topics: list[str] = []
    seen: set[str] = set()
    for candidate in topic_candidates:
        cleaned = re.sub(r"\s+", " ", re.sub(r"^[-\d.\s]+", "", candidate.strip()))
        if len(cleaned) < 3:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        topics.append(cleaned)

    return topics[:15], target_audience


# --- Routes ---

@router.get("")
async def get_niche_config(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get niche config for the current user."""
    user_id = user["id"]

    cfg = (
        db.query(NicheConfig)
        .filter(NicheConfig.user_id == user_id)
        .first()
    )

    if cfg:
        return _cfg_to_dict(cfg)

    # If no config found, return defaults from PromptContext
    from app.core.prompt_context import PromptContext
    ctx = PromptContext()
    return {
        "id": None,
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
        "yt_title_examples": ctx.yt_title_examples,
        "yt_title_bad_examples": ctx.yt_title_bad_examples,
        "carousel_cta_topic": ctx.carousel_cta_topic,
        "carousel_cta_options": ctx.carousel_cta_options,
        "carousel_cover_overlay_opacity": ctx.carousel_cover_overlay_opacity,
        "carousel_content_overlay_opacity": ctx.carousel_content_overlay_opacity,
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
    """Create or update niche config for the current user."""
    user_id = user["id"]

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
        .filter(NicheConfig.user_id == user_id)
        .first()
    )

    if not cfg:
        cfg = NicheConfig(user_id=user_id)
        db.add(cfg)

    # Update fields that were provided (non-None)
    update_data = request.model_dump(exclude_unset=True)

    # Backward-compatible fallback:
    # if clients only send content_brief (older onboarding flow), infer
    # topic_categories / target_audience so Toby preflight is not blocked.
    if update_data.get("content_brief"):
        inferred_topics, inferred_audience = _infer_from_content_brief(update_data["content_brief"])

        incoming_topics = update_data.get("topic_categories")
        if inferred_topics and (incoming_topics is None or len(incoming_topics) == 0):
            update_data["topic_categories"] = inferred_topics
            # Keep topic_keywords coherent when client does not send them.
            if "topic_keywords" not in update_data or not update_data.get("topic_keywords"):
                update_data["topic_keywords"] = inferred_topics

        incoming_audience = update_data.get("target_audience")
        if inferred_audience and (incoming_audience is None or not str(incoming_audience).strip()):
            update_data["target_audience"] = inferred_audience

    for field_name, value in update_data.items():
        if value is not None:
            setattr(cfg, field_name, value)

    db.commit()
    db.refresh(cfg)

    # Invalidate cache
    service = get_niche_config_service()
    service.invalidate_cache(user_id=user_id)

    return _cfg_to_dict(cfg)


# --- Import from Instagram endpoint ---

IG_GRAPH_BASE = "https://graph.instagram.com"


class ImportFromInstagramRequest(BaseModel):
    brand_id: str = Field(..., min_length=1, max_length=50)


def _fetch_ig_posts(ig_account_id: str, access_token: str, limit: int = 25) -> list[dict]:
    """Fetch recent Instagram posts with captions via Graph API."""
    resp = http_requests.get(
        f"{IG_GRAPH_BASE}/v21.0/{ig_account_id}/media",
        params={
            "fields": "id,caption,media_type,media_product_type,timestamp",
            "limit": limit,
            "access_token": access_token,
        },
        timeout=20,
    )
    if resp.status_code != 200:
        logger.error("IG media fetch failed (%s): %s", resp.status_code, resp.text[:500])
        return []
    return resp.json().get("data", [])


@router.post("/import-from-instagram")
async def import_from_instagram(
    request: ImportFromInstagramRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Scrape recent Instagram posts and use AI to extract niche/topic/description for Content DNA.

    Fetches the last ~25 posts from the brand's connected IG account,
    sends captions to DeepSeek for structured analysis, and returns
    suggested niche_name and content_brief fields.
    """
    user_id = user["id"]

    # Find brand & verify ownership
    brand = db.query(Brand).filter(
        Brand.id == request.brand_id,
        Brand.user_id == user_id,
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    ig_account_id = brand.instagram_business_account_id
    access_token = brand.instagram_access_token or brand.meta_access_token
    if not ig_account_id or not access_token:
        raise HTTPException(
            status_code=400,
            detail="Instagram is not connected for this brand. Connect Instagram first, then try importing.",
        )

    # Fetch posts in a thread to avoid blocking the event loop
    posts = await asyncio.to_thread(_fetch_ig_posts, ig_account_id, access_token, 25)
    if not posts:
        raise HTTPException(
            status_code=400,
            detail="No posts found on this Instagram account. You need at least a few posts to import content style.",
        )

    # Build caption corpus (filter empty captions)
    captions = []
    for p in posts:
        cap = (p.get("caption") or "").strip()
        if cap:
            captions.append(cap)

    if len(captions) < 3:
        raise HTTPException(
            status_code=400,
            detail=f"Only {len(captions)} post(s) have captions. Need at least 3 posts with captions to analyse your content style.",
        )

    # Truncate to avoid overly long prompts — keep first ~15 captions, max 500 chars each
    caption_samples = [c[:500] for c in captions[:15]]
    caption_block = "\n---\n".join(f"Post {i+1}:\n{c}" for i, c in enumerate(caption_samples))

    ig_handle = brand.instagram_handle or ""

    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI service not configured")

    prompt = f"""Analyse the following {len(caption_samples)} Instagram post captions from the account {ig_handle} and extract a structured content profile.

CAPTIONS:
{caption_block}

Based on these posts, determine:
1. **niche_name** — A short label (2-5 words) describing the content niche (e.g. "Health & Wellness", "Personal Finance", "Fitness & Nutrition")
2. **content_brief** — A detailed paragraph (150-300 words) describing:
   - What type of content this account creates
   - The main topics covered (list them with specifics from the captions)
   - The tone and style (educational, casual, motivational, scientific, etc.)
   - The target audience (age, gender, interests — infer from the content)
   - Any recurring themes, formats, or patterns you notice
   - Content philosophy (what makes this account unique)

Write the content_brief in the same format as this example:
"Viral short-form health content for women 35+ on Instagram and TikTok.

Topics include: foods that fight inflammation vs. foods that secretly cause it, superfoods and their specific benefits (e.g. magnesium for sleep, omega-3 for joints), surprising facts about everyday habits (sleep position, hydration timing, meal order), hormonal health after 35, gut-brain connection, metabolism myths, longevity habits backed by science, skin health from the inside out.

Tone: educational, empowering, calm authority. Avoid: clinical jargon, fear-mongering, salesy language. 60% validating, 40% surprising.

Target audience: U.S. women aged 35+, interested in healthy aging, energy, hormones, and longevity."

OUTPUT FORMAT (JSON only, no markdown fences):
{{
    "niche_name": "...",
    "content_brief": "..."
}}"""

    try:
        response = await asyncio.to_thread(
            _deepseek_call, api_key, prompt, 0.5, 1000, 45
        )

        if response.status_code != 200:
            logger.error(
                "DeepSeek import-from-instagram returned %s: %s",
                response.status_code,
                response.text[:500],
            )
            raise HTTPException(status_code=500, detail="AI analysis failed — please try again")

        result = _parse_deepseek_json(response)
        return {
            "niche_name": result.get("niche_name", ""),
            "content_brief": result.get("content_brief", ""),
            "posts_analysed": len(caption_samples),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Import from Instagram failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to analyse Instagram content")


@router.post("/ai-understanding")
async def get_ai_understanding(
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
    rate_limit(user_id, "ai-understanding", max_requests=5, window_seconds=60)
    service = get_niche_config_service()
    ctx = service.get_context(user_id=user_id, db=db)

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

    # Include a few reel examples from the user's config so DeepSeek matches the format
    reel_examples_text = ""
    if ctx.reel_examples:
        samples = ctx.reel_examples[:3]
        example_lines = []
        for i, ex in enumerate(samples, 1):
            example_lines.append(f"  Reel {i}: {ex['title']}")
            for line in ex.get("content_lines", [])[:5]:
                example_lines.append(f"    - {line}")
        reel_examples_text = "\nHere are some of the brand's existing reel examples — match this style:\n" + "\n".join(example_lines) + "\n"

    prompt = f"""Based on the following brand configuration, write a first-person summary (as the AI content engine) explaining how you understand this brand. Write 2-3 paragraphs.

Configuration:
{config_text}
{reel_examples_text}
Also generate:
1. One FULL example reel with a title (ALL CAPS, 8-12 words) and 5-8 content lines. CRITICAL: each content line must be a STANDALONE fact, tip, or statement that makes sense on its own — NOT a fragment of a longer sentence split across lines. Good: "Walking after meals cuts blood sugar by 30%." Bad: "Can bind to non-heme iron from plants." (makes no sense alone). Think of each line as its own mini-fact displayed on a separate screen.
2. One FULL example carousel post BASED ON A REAL SCIENTIFIC STUDY with:
   - A title referencing the study finding (ALL CAPS, 8-14 words, e.g. "STUDY REVEALS SLEEPING IN A COLD ROOM IMPROVES FAT METABOLISM")
   - 3-4 slides of detailed educational content (each slide is 3-5 sentences explaining the study and its implications)
   - A study_ref string: "Study short name — Journal or Institution, Year" (must be a real, verifiable study)
   - The LAST slide must have TWO paragraphs: first a concluding takeaway (2-3 sentences summarizing the key insight or actionable advice), then separated by a blank line (\\n\\n), a CTA sentence (e.g. "For more science-backed tips, follow @brand_name"). This paragraph separation is critical for proper rendering.
   - IMPORTANT: Do NOT prefix slide text with "Slide 1:", "Slide 2:" etc. Just write the paragraph directly.

Write in first person ("I create...", "I understand...", "My goal is..."). Be specific about the niche, not generic. Show that you deeply understand the brand identity.

OUTPUT FORMAT (JSON only):
{{
    "understanding": "Your 2-3 paragraph first-person summary here...",
    "example_reel": {{
        "title": "REEL TITLE IN ALL CAPS",
        "content_lines": ["Standalone fact 1.", "Standalone fact 2.", "Standalone fact 3.", "..."]
    }},
    "example_post": {{
        "title": "POST TITLE IN ALL CAPS REFERENCING A STUDY",
        "slides": ["Detailed study findings paragraph...", "Mechanism explanation paragraph...", "Practical implications paragraph...", "Concluding takeaway sentences.\n\nFollow @brand for more..."],
        "study_ref": "Iron absorption and tea tannins — Cell Metabolism, 2022"
    }}
}}"""

    try:
        response = await asyncio.to_thread(_deepseek_call, api_key, prompt, 0.7, 1500, 30)

        if response.status_code == 200:
            result = _parse_deepseek_json(response)
            return {
                "understanding": result.get("understanding", ""),
                "example_reel": result.get("example_reel"),
                "example_post": result.get("example_post"),
            }
        else:
            logger.error("DeepSeek AI understanding returned %s: %s", response.status_code, response.text[:500])
    except Exception as e:
        logger.error("AI understanding generation failed: %s", e, exc_info=True)

    return {
        "understanding": "I wasn't able to generate an understanding right now. Please try again.",
        "example_reel": None,
        "example_post": None,
    }


# --- Generate Post Example endpoint ---

class GeneratePostExampleRequest(BaseModel):
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
    ctx = service.get_context(user_id=user_id, db=db)

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
{{
    "title": "POST TITLE IN ALL CAPS",
    "slides": ["slide 1 text...", "slide 2 text...", ...],
    "study_ref": "Tannin-iron absorption interaction — Cell Metabolism, 2022"
}}"""

    try:
        response = await asyncio.to_thread(_deepseek_call, api_key, prompt, 0.95, 1000, 30)
        if response.status_code == 200:
            result = _parse_deepseek_json(response)
            return {
                "title": result.get("title", ""),
                "slides": result.get("slides", [])[:request.num_slides],
                "study_ref": result.get("study_ref", ""),
            }
        else:
            logger.error("DeepSeek post example returned %s: %s", response.status_code, response.text[:500])
    except Exception as e:
        logger.error("Post example generation failed: %s", e, exc_info=True)

    raise HTTPException(status_code=500, detail="Failed to generate post example")


# --- Generate Post Examples Batch endpoint ---

class GeneratePostExamplesBatchRequest(BaseModel):
    count: int = Field(default=5, ge=1, le=10)
    num_slides: int = Field(default=4, ge=3, le=4)
    existing_titles: List[str] = Field(default_factory=list, max_length=50)


@router.post("/generate-post-examples-batch")
async def generate_post_examples_batch(
    request: GeneratePostExamplesBatchRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Generate multiple post examples via DeepSeek in a single call."""
    user_id = user["id"]
    rate_limit(user_id, "generate-post-examples-batch", max_requests=3, window_seconds=60)
    service = get_niche_config_service()
    ctx = service.get_context(user_id=user_id, db=db)

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

    exclusion_block = ""
    if request.existing_titles:
        exclusion_block = "\n\nALREADY USED TOPICS (NEVER repeat, rephrase, or cover the same study/domain):\n"
        for t in request.existing_titles:
            exclusion_block += f"- {t}\n"
        exclusion_block += "\nEach post MUST cover a completely different scientific domain and study."

    prompt = f"""Generate {request.count} carousel post examples, each BASED ON A DIFFERENT REAL SCIENTIFIC STUDY, for this brand:

{config_text}{exclusion_block}

Requirements for EACH post:
- Title: ALL CAPS, 8-14 words, referencing a real study finding
- TITLE VARIETY IS CRITICAL: Do NOT start titles the same way. Vary opening words — use patterns like:
  "A NEW STUDY REVEALS...", "RESEARCHERS FOUND THAT...", "THIS COMMON HABIT...", "SCIENCE SAYS...",
  "THE SURPRISING LINK BETWEEN...", "HOW [THING] AFFECTS...", "WHAT HAPPENS WHEN...",
  "ONE SIMPLE CHANGE THAT...", "THE HIDDEN DANGER OF...", "WHY [THING] MATTERS MORE THAN..."
- Each topic MUST be unique and from a DIFFERENT scientific domain — choose surprising, lesser-known studies
- {request.num_slides} content slides per post (not counting the cover). Each slide: 3-5 sentences of educational content
- Do NOT include a CTA in any slide — the CTA is added automatically by the system
- A study_ref string per post: "Study short name — Journal or Institution, Year" (must be REAL, verifiable)
- Do NOT prefix slide text with "Slide 1:", "Slide 2:" etc.

OUTPUT FORMAT (JSON only — array of {request.count} objects):
{{
    "posts": [
        {{
            "title": "POST TITLE IN ALL CAPS",
            "slides": ["slide 1 text...", "slide 2 text...", ...],
            "study_ref": "Study name — Journal, Year"
        }},
        ...
    ]
}}"""

    try:
        response = await asyncio.to_thread(_deepseek_call, api_key, prompt, 0.95, request.count * 800, 60)
        if response.status_code == 200:
            result = _parse_deepseek_json(response)
            posts = result.get("posts", [])
            return {
                "posts": [
                    {
                        "title": p.get("title", ""),
                        "slides": p.get("slides", [])[:request.num_slides],
                        "study_ref": p.get("study_ref", ""),
                    }
                    for p in posts[:request.count]
                ]
            }
        else:
            logger.error("DeepSeek post batch returned %s: %s", response.status_code, response.text[:500])
    except Exception as e:
        logger.error("Post examples batch generation failed: %s", e, exc_info=True)

    raise HTTPException(status_code=500, detail="Failed to generate post examples")


# --- Generate Reel Examples Batch endpoint ---

# 10 seed examples from Health & Wellness to teach the format
_SEED_REEL_EXAMPLES = [
    {"title": "5 SIGNS YOUR BODY IS TRYING TO WARN YOU", "content_lines": [
        "Constant fatigue? Could be iron deficiency.", "Craving ice? Often linked to anemia.",
        "Hair falling out? Check your thyroid.", "Bruising easily? Low vitamin C or K.",
        "Tingling hands? Possible B12 deficiency."]},
    {"title": "SILENT HEALTH MISTAKES YOU DON'T NOTICE", "content_lines": [
        "Drinking water only when thirsty — you're already dehydrated.", "Sitting cross-legged compresses nerves.",
        "Brushing teeth right after eating erodes enamel.", "Sleeping with your phone charges EMF exposure.",
        "Skipping breakfast slows your metabolism by 5%."]},
    {"title": "EAT THIS IF YOU ARE SICK", "content_lines": [
        "Sore throat? Honey + warm water.", "Nausea? Ginger tea, not ginger ale.",
        "Cold? Chicken broth with garlic.", "Headache? Magnesium-rich almonds.",
        "Bloating? Peppermint tea settles the gut."]},
    {"title": "DO THESE 10 HABITS IF YOU WANT TO STILL WALK AT 80", "content_lines": [
        "Walk 8,000 steps daily — non-negotiable.", "Stretch hip flexors every morning.",
        "Eat protein with every meal for muscle.", "Balance on one foot while brushing teeth.",
        "Sleep 7-8 hours — your joints repair overnight.", "Hydrate before coffee.",
        "Lift weights at least twice a week.", "Avoid sitting longer than 45 minutes.",
        "Eat anti-inflammatory foods: berries, turmeric.", "Wear supportive shoes daily."]},
    {"title": "8 HARSH TRUTHS", "content_lines": [
        "Your metabolism slows 2-3% per decade after 30.", "Stress ages you faster than smoking.",
        "Most supplements are poorly absorbed.", "Fruit juice spikes blood sugar like soda.",
        "8 glasses of water is a myth — it depends on you.", "Sleep debt cannot be fully repaid.",
        "Organic doesn't always mean healthier.", "Your gut health controls your mood."]},
    {"title": "DOCTORS DON'T WANT YOU TO KNOW THIS", "content_lines": [
        "Fasting 16 hours triggers autophagy — cellular cleanup.", "Cold showers boost norepinephrine by 200-300%.",
        "Magnesium glycinate beats melatonin for sleep.", "Walking after meals cuts blood sugar spikes by 30%.",
        "Sunlight in the first 30 min sets your circadian clock."]},
    {"title": "HOW MUCH SLEEP DO YOU REALLY NEED?", "content_lines": [
        "Teens: 8-10 hours.", "Adults 26-64: 7-9 hours.", "Over 65: 7-8 hours.",
        "Less than 6 hours doubles heart disease risk.", "Quality matters more than quantity.",
        "Deep sleep peaks between 10 PM and 2 AM."]},
    {"title": "FOODS THAT SHOULD NOT BE STORED IN THE FRIDGE", "content_lines": [
        "Tomatoes — cold kills flavor and texture.", "Bread — it goes stale faster refrigerated.",
        "Honey — it crystallizes in cold.", "Bananas — they ripen better at room temp.",
        "Potatoes — cold converts starch to sugar.", "Garlic — it sprouts in humidity."]},
    {"title": "WARNING: NEVER EAT THESE FOODS LIKE THIS", "content_lines": [
        "Raw kidney beans contain toxic lectin.", "Green potatoes have solanine — trim or discard.",
        "Bitter almonds have cyanide compounds.", "Cherry pits if crushed release amygdalin.",
        "Raw elderberries cause severe nausea."]},
    {"title": "EARLY SIGNS OF HEART DISEASE MOST PEOPLE IGNORE", "content_lines": [
        "Jaw pain during exertion.", "Swollen ankles without injury.",
        "Unexplained fatigue lasting weeks.", "Shortness of breath climbing one flight.",
        "Cold hands and feet — poor circulation.", "Snoring loudly — linked to sleep apnea and heart strain."]},
]


class GenerateReelExamplesBatchRequest(BaseModel):
    count: int = Field(default=50, ge=1, le=50)


@router.post("/generate-reel-examples-batch")
async def generate_reel_examples_batch(
    request: GenerateReelExamplesBatchRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Generate reel examples via DeepSeek using seed Health & Wellness examples + user's brand config."""
    user_id = user["id"]
    rate_limit(user_id, "generate-reel-examples-batch", max_requests=3, window_seconds=60)
    service = get_niche_config_service()
    ctx = service.get_context(user_id=user_id, db=db)

    # Require General section to be filled
    if not ctx.content_brief and not ctx.niche_name:
        raise HTTPException(status_code=400, detail="Fill in the General section first (niche name and content brief)")

    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI service not configured")

    # Build brand context from General info
    brand_context_parts = []
    if ctx.niche_name:
        brand_context_parts.append(f"Niche: {ctx.niche_name}")
    if ctx.content_brief:
        brand_context_parts.append(f"Content brief: {ctx.content_brief}")
    if ctx.content_tone:
        brand_context_parts.append(f"Tone: {', '.join(ctx.content_tone)}")
    brand_context = "\n".join(brand_context_parts)

    # Format seed examples
    seed_block = ""
    for ex in _SEED_REEL_EXAMPLES:
        lines_text = "\n".join(f"  - {line}" for line in ex["content_lines"])
        seed_block += f"\nTitle: {ex['title']}\nContent lines:\n{lines_text}\n"

    def _build_reel_prompt(count: int, brand_ctx: str, seed: str, exclude_titles: list[str] | None = None) -> str:
        exclusion = ""
        if exclude_titles:
            exclusion = "\n\nALREADY GENERATED TITLES (do NOT repeat or rephrase any of these):\n"
            for t in exclude_titles:
                exclusion += f"- {t}\n"
        return f"""You are a viral short-form content expert. Generate {count} reel content ideas in the format Title + Content Lines for a brand with this identity:

{brand_ctx}

Here are 10 examples from the Health & Wellness niche to show you the EXACT format and style. Adapt the same format, energy, and structure for the brand's niche described above:

{seed}{exclusion}

RULES:
- Each reel has a Title (ALL CAPS, 6-14 words, attention-grabbing, curiosity-driven) and 5-10 Content Lines (short fragments, facts, cause-effect pairs)
- Content lines should be punchy, educational, and surprising — each line is ONE idea or fact
- Do NOT include CTAs like "Follow for more" — those are added automatically
- Titles must vary in opening patterns: use numbers, questions, warnings, revelations, challenges
- Every idea must be unique — never repeat a topic across the {count} reels
- Adapt the TOPICS to match the brand's niche, but keep the same viral format

OUTPUT FORMAT (JSON only):
{{{{
    "reels": [
        {{{{
            "title": "REEL TITLE IN ALL CAPS",
            "content_lines": ["Line 1", "Line 2", "Line 3", "..."]
        }}}},
        ...
    ]
}}}}"""

    async def _generate_batch(count: int, exclude_titles: list[str] | None = None) -> list[dict]:
        prompt = _build_reel_prompt(count, brand_context, seed_block, exclude_titles)
        response = await asyncio.to_thread(_deepseek_call, api_key, prompt, 0.9, 8192, 120)
        if response.status_code != 200:
            logger.error("DeepSeek reel batch returned %s: %s", response.status_code, response.text[:500])
            raise HTTPException(status_code=502, detail=f"AI service returned {response.status_code}")
        result = _parse_deepseek_json(response)
        return result.get("reels", [])

    try:
        # Split into 2 batches to stay within DeepSeek's 8K output token limit
        batch_size = 25
        first_count = min(batch_size, request.count)
        first_batch = await _generate_batch(first_count)

        all_reels = first_batch[:first_count]

        remaining = request.count - len(all_reels)
        if remaining > 0:
            used_titles = [r.get("title", "") for r in all_reels]
            second_batch = await _generate_batch(remaining, exclude_titles=used_titles)
            all_reels.extend(second_batch[:remaining])

        return {
            "reels": [
                {
                    "title": r.get("title", ""),
                    "content_lines": r.get("content_lines", []),
                }
                for r in all_reels
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Reel examples batch generation failed: %s", e, exc_info=True)

    raise HTTPException(status_code=500, detail="Failed to generate reel examples")


# --- Suggest YouTube Titles endpoint ---

@router.post("/suggest-yt-titles")
async def suggest_yt_titles(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Generate suggested YouTube title examples based on brand config."""
    user_id = user["id"]
    rate_limit(user_id, "suggest-yt-titles", max_requests=5, window_seconds=60)
    service = get_niche_config_service()
    ctx = service.get_context(user_id=user_id, db=db)

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
{{
    "good_titles": ["title 1", "title 2", "title 3", "title 4", "title 5"],
    "bad_titles": ["bad title 1", "bad title 2", "bad title 3"]
}}"""

    try:
        response = await asyncio.to_thread(_deepseek_call, api_key, prompt, 0.7, 500, 30)
        if response.status_code == 200:
            result = _parse_deepseek_json(response)
            return {
                "good_titles": result.get("good_titles", []),
                "bad_titles": result.get("bad_titles", []),
            }
        else:
            logger.error("DeepSeek YT titles returned %s: %s", response.status_code, response.text[:500])
    except Exception as e:
        logger.error("YT title suggestion failed: %s", e, exc_info=True)

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
