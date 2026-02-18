"""
Prompts overview API — exposes all prompt layers for transparency.

Provides endpoints to:
- View the full prompt pipeline (content -> image prompt -> deAPI prompt)
- Test-generate sample images from a prompt
- Preview final assembled prompts

100% DYNAMIC: All data is imported from prompt_templates.py (single source of truth).
No hardcoded prompts in this file.
"""
import base64
import time
import uuid
from io import BytesIO
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status, Depends
from app.api.auth.middleware import get_current_user

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


# ============================================================
# Response models
# ============================================================

class PromptLayer(BaseModel):
    """A single layer in the prompt pipeline."""
    name: str
    description: str
    content: str
    editable: bool = False


class PromptOverviewResponse(BaseModel):
    """Full prompt pipeline overview."""
    layers: list
    brand_palettes: dict
    models: dict


class TestGenerateRequest(BaseModel):
    """Request to generate test images from a custom prompt."""
    prompt: str
    brand: str
    count: int = 2  # 1 or 2 images


# ============================================================
# GET /api/prompts/overview — full prompt pipeline (100% dynamic)
# ============================================================

@router.get("/overview", summary="Get the full prompt pipeline overview")
async def get_prompt_overview(user: dict = Depends(get_current_user)):
    """
    Returns all prompt layers used in content and image generation,
    organized by stage in the pipeline.
    All data is imported from prompt_templates.py — the single source of truth.
    """
    from app.core.prompt_templates import (
        IMAGE_PROMPT_SUFFIX,
        IMAGE_PROMPT_GUIDELINES,
        IMAGE_PROMPT_SYSTEM,
        POST_QUALITY_SUFFIX,
        REEL_BASE_STYLE,
        BRAND_PALETTES,
        IMAGE_MODELS,
        FALLBACK_PROMPTS,
        CAROUSEL_SLIDE_EXAMPLES,
        get_post_content_prompt_for_display,
    )

    # --- Assemble layers (all from prompt_templates.py) ---
    layers = [
        {
            "id": "post_content_prompt",
            "name": "0. Post Content Generation (DeepSeek)",
            "description": "The full prompt sent to DeepSeek AI to generate post titles, captions, carousel slide texts, and image prompts. This is the master prompt that controls all content output.",
            "content": get_post_content_prompt_for_display(),
            "type": "ai_generation",
        },
        {
            "id": "content_ai",
            "name": "1. Image Prompt Generation (DeepSeek)",
            "description": "When generating standalone image prompts from a title, this system prompt guides DeepSeek to create cinematic, wellness-themed image descriptions.",
            "content": IMAGE_PROMPT_SYSTEM.strip(),
            "type": "ai_generation",
        },
        {
            "id": "image_guidelines",
            "name": "2. Image Prompt Guidelines",
            "description": "Guidelines embedded in the system prompt for the AI when generating image prompts alongside content.",
            "content": IMAGE_PROMPT_GUIDELINES.strip(),
            "type": "template",
        },
        {
            "id": "image_suffix",
            "name": "3. Image Prompt Suffix (Auto-appended)",
            "description": "This suffix is automatically appended to every AI-generated image prompt to prevent text artifacts.",
            "content": IMAGE_PROMPT_SUFFIX,
            "type": "suffix",
        },
        {
            "id": "quality_suffix",
            "name": "4. Quality & Composition Suffix (Posts)",
            "description": "Appended to the final prompt when sending to deAPI for post images. Controls quality keywords and close-up framing.",
            "content": POST_QUALITY_SUFFIX,
            "type": "suffix",
        },
        {
            "id": "reel_base_style",
            "name": "5. Reel Base Style (Reels only)",
            "description": "The base visual style for reel backgrounds. Creates bright, colorful still-life compositions with water effects and sunlight.",
            "content": REEL_BASE_STYLE,
            "type": "template",
        },
    ]

    # --- Carousel examples section ---
    carousel_examples = []
    for ex in CAROUSEL_SLIDE_EXAMPLES:
        carousel_examples.append({
            "topic": ex["topic"],
            "title": ex["title"],
            "slides": ex["slides"],
        })

    return {
        "layers": layers,
        "brand_palettes": BRAND_PALETTES,
        "models": IMAGE_MODELS,
        "fallback_prompts": FALLBACK_PROMPTS,
        "carousel_examples": carousel_examples,
        "carousel_examples_count": len(carousel_examples),
        "pipeline_summary": (
            "Title -> [DeepSeek AI generates title, captions, slide texts, image_prompt] -> "
            "image_prompt + quality_suffix -> [deAPI generates image] -> "
            "final image used as post/reel background"
        ),
    }


# ============================================================
# POST /api/prompts/test-generate — generate sample images
# ============================================================

@router.post("/test-generate", summary="Generate test images from a prompt")
async def test_generate_images(request: TestGenerateRequest, user: dict = Depends(get_current_user)):
    """
    Generate 1-2 test images from a given prompt using the post model (ZImageTurbo).
    Returns base64 PNG images so the user can see what the prompt produces.
    """
    if request.count < 1 or request.count > 2:
        raise HTTPException(status_code=400, detail="count must be 1 or 2")

    from app.services.media.ai_background import AIBackgroundGenerator

    results = []

    for i in range(request.count):
        try:
            t0 = time.time()
            generator = AIBackgroundGenerator()
            image = generator.generate_post_background(
                brand_name=request.brand,
                user_prompt=request.prompt,
            )
            elapsed = time.time() - t0

            buf = BytesIO()
            image.save(buf, format="JPEG", quality=80)
            b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

            results.append({
                "index": i + 1,
                "image_data": f"data:image/jpeg;base64,{b64}",
                "generation_time": round(elapsed, 1),
                "prompt_used": request.prompt,
            })
            print(f"[OK] Test image {i+1}/{request.count} generated in {elapsed:.1f}s", flush=True)
        except Exception as e:
            print(f"[FAIL] Test image {i+1} failed: {e}", flush=True)
            results.append({
                "index": i + 1,
                "error": str(e),
                "generation_time": 0,
                "prompt_used": request.prompt,
            })

    return {"results": results, "count": len(results)}


# ============================================================
# POST /api/prompts/build-final — show the final assembled prompt
# ============================================================

@router.post("/build-final", summary="Preview the final prompt sent to deAPI")
async def build_final_prompt(request: TestGenerateRequest, user: dict = Depends(get_current_user)):
    """
    Shows the complete final prompt that would be sent to deAPI,
    after all suffixes and quality modifiers are applied.
    Does NOT generate an image — just shows the assembled prompt.
    """
    from app.core.prompt_templates import POST_QUALITY_SUFFIX, IMAGE_MODELS

    user_prompt = request.prompt or "Soft cinematic wellness still life with natural ingredients on white countertop in morning light."
    final_prompt = f"{user_prompt} {POST_QUALITY_SUFFIX}"
    unique_id = str(uuid.uuid4())[:8]
    final_prompt_with_id = f"{final_prompt} [ID: {unique_id}]"

    model_info = IMAGE_MODELS.get("posts", {})

    return {
        "user_prompt": request.prompt,
        "quality_suffix": POST_QUALITY_SUFFIX,
        "final_prompt": final_prompt_with_id,
        "total_chars": len(final_prompt_with_id),
        "model": model_info.get("name", "ZImageTurbo_INT8"),
        "dimensions": model_info.get("dimensions", "1088x1360").split(" ")[0],
        "steps": model_info.get("steps", 8),
    }
