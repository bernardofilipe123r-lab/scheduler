"""API routes for niche configuration (Content DNA)."""

import os
import requests as http_requests
from typing import Any, Dict, Optional
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
            validated.append({"title": title, "slides": slides})

    return validated


def _cfg_to_dict(cfg: NicheConfig) -> dict:
    """Convert a NicheConfig row to a JSON-serializable dict."""
    return {
        "id": cfg.id,
        "brand_id": cfg.brand_id,
        "niche_name": cfg.niche_name,
        "niche_description": cfg.niche_description,
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
            "example_reel_title": None,
            "example_post_title": None,
        }

    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        return {
            "understanding": "AI service is not configured.",
            "example_reel_title": None,
            "example_post_title": None,
        }

    prompt = f"""Based on the following brand configuration, write a first-person summary (as the AI content engine) explaining how you understand this brand. Write 2-3 paragraphs.

Configuration:
{chr(10).join(config_summary)}

Also generate:
1. One example reel title (ALL CAPS, 8-12 words) you would create for this brand
2. One example post title (ALL CAPS, 8-14 words) you would create for this brand

Write in first person ("I create...", "I understand...", "My goal is..."). Be specific about the niche, not generic. Show that you deeply understand the brand identity.

OUTPUT FORMAT (JSON only):
{{{{
    "understanding": "Your 2-3 paragraph first-person summary here...",
    "example_reel_title": "EXAMPLE REEL TITLE IN ALL CAPS",
    "example_post_title": "EXAMPLE POST TITLE IN ALL CAPS"
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
                "max_tokens": 800,
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
                "example_reel_title": result.get("example_reel_title"),
                "example_post_title": result.get("example_post_title"),
            }
    except Exception as e:
        print(f"AI understanding generation failed: {e}", flush=True)

    return {
        "understanding": "I wasn't able to generate an understanding right now. Please try again.",
        "example_reel_title": None,
        "example_post_title": None,
    }
