"""
Prompts overview API — exposes all prompt layers for transparency.

Provides endpoints to:
- View the full prompt pipeline (content → image prompt → deAPI prompt)
- Test-generate sample images from a prompt
"""
import base64
import time
from io import BytesIO
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status

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
    brand: str = "healthycollege"
    count: int = 2  # 1 or 2 images


# ============================================================
# GET /api/prompts/overview — full prompt pipeline
# ============================================================

@router.get("/overview", summary="Get the full prompt pipeline overview")
async def get_prompt_overview():
    """
    Returns all prompt layers used in image generation,
    organized by stage in the pipeline.
    """
    from app.core.prompt_templates import (
        SYSTEM_PROMPT,
        IMAGE_PROMPT_SUFFIX,
        IMAGE_PROMPT_GUIDELINES,
    )

    # --- Layer 1: Content generation (DeepSeek) ---
    content_gen_prompt = """You are a visual prompt engineer specializing in wellness and health imagery for Instagram.

Given a title, generate a DETAILED cinematic image prompt suitable for AI image generation (DALL-E / Flux).

### REQUIREMENTS:
- Soft, minimal, calming wellness aesthetic
- Bright modern kitchen or clean lifestyle setting
- Neutral tones, gentle morning sunlight
- High-end lifestyle photography style
- Fresh, soothing, natural health remedy concept
- Must end with "No text, no letters, no numbers, no symbols, no logos."
- Should be 2-3 sentences long

### EXAMPLES:
Title: "Daily ginger consumption may reduce muscle pain by up to 25%"
→ "Soft cinematic close-up of fresh ginger root being sliced on a clean white stone countertop in a bright modern kitchen. A glass of warm ginger-infused water with a lemon slice sits nearby, glowing in gentle morning sunlight. Minimal, calming wellness aesthetic, neutral tones, high-end lifestyle photography. No text, no letters, no numbers, no symbols, no logos."

Title: "Vitamin D and magnesium helps reduce depression and brain aging."
→ "Soft cinematic close-up of vitamin D and magnesium supplements on a clean white surface beside a fresh orange and a glass of water in a bright modern kitchen. Gentle morning sunlight, minimal calming wellness aesthetic, neutral tones, high-end lifestyle photography. No text, no letters, no numbers, no symbols, no logos.\""""

    # --- Layer 2: Quality suffix (added to every image prompt) ---
    quality_suffix = (
        "Ultra high quality, 8K, sharp focus, professional photography, "
        "soft natural lighting, premium lifestyle aesthetic. "
        "Photorealistic, detailed textures, beautiful composition. "
        "CRITICAL COMPOSITION: Subject must be centered in the UPPER HALF of the frame. "
        "The bottom third of the image should be soft bokeh, clean surface, or subtle gradient — "
        "NOT the main subject. Portrait orientation, slightly overhead camera angle, "
        "hero subject positioned in center-upper area of frame."
    )

    # --- Layer 3: Reel-specific base style ---
    reel_base_style = (
        "BRIGHT, COLORFUL, VIBRANT still-life composition with SUNLIT atmosphere. "
        "Dense, full-frame layout filling every inch with objects. "
        "Shallow water ripples, water droplets, moisture, and dewy surfaces. "
        "Soft bokeh light orbs floating in the background. "
        "Morning sunlight streaming in with lens flares and light rays. "
        "BRIGHT PASTEL background tones - NO DARK OR BLACK AREAS. "
        "Polished, glossy, shiny surfaces catching light. "
        "Magazine-quality product photography style with enhanced saturation."
    )

    # --- Brand palettes ---
    brand_palettes = {
        "healthycollege": {
            "name": "Fresh Green",
            "primary": "#4CAF50",
            "accent": "#81C784",
            "color_description": "fresh lime green, vibrant leaf green, bright spring green, with soft yellow sunlight and white highlights",
        },
        "longevitycollege": {
            "name": "Radiant Azure",
            "primary": "#00BCD4",
            "accent": "#80DEEA",
            "color_description": "radiant azure, bright sky blue, luminous cyan, electric light blue, with white glow and warm sunlight touches",
        },
        "vitalitycollege": {
            "name": "Bright Turquoise",
            "primary": "#26C6DA",
            "accent": "#4DD0E1",
            "color_description": "bright turquoise, sparkling teal, vibrant aquamarine, with white shimmer and golden sunlight accents",
        },
        "wellbeingcollege": {
            "name": "Vibrant Blue",
            "primary": "#2196F3",
            "accent": "#64B5F6",
            "color_description": "bright sky blue, vibrant azure, luminous cyan, sparkling light blue, with soft white and golden sunlight accents",
        },
        "holisticcollege": {
            "name": "Vibrant Blue",
            "primary": "#2196F3",
            "accent": "#64B5F6",
            "color_description": "bright sky blue, vibrant azure, luminous cyan, sparkling light blue, with soft white and golden sunlight accents",
        },
    }

    # --- Models ---
    models = {
        "posts": {
            "name": "ZImageTurbo_INT8",
            "dimensions": "1088×1360 (rounded from 1080×1350)",
            "steps": 8,
            "description": "Higher quality model for posts. Better prompt adherence and fidelity.",
        },
        "reels": {
            "name": "Flux1schnell",
            "dimensions": "1152×1920 (rounded from 1080×1920)",
            "steps": 4,
            "description": "Fast model for reel backgrounds. Cheaper per image.",
        },
    }

    # --- Assemble layers ---
    layers = [
        {
            "id": "content_ai",
            "name": "1. AI Content Generation (DeepSeek)",
            "description": "DeepSeek generates the image_prompt alongside the title and content lines. This is the creative prompt that describes what the image should look like.",
            "content": content_gen_prompt,
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
            "description": "Appended to the final prompt when sending to deAPI for post images. Controls quality and composition (subject in upper half, bottom third clean for text overlay).",
            "content": quality_suffix,
            "type": "suffix",
        },
        {
            "id": "reel_base_style",
            "name": "5. Reel Base Style (Reels only)",
            "description": "The base visual style for reel backgrounds. Creates bright, colorful still-life compositions with water effects and sunlight.",
            "content": reel_base_style,
            "type": "template",
        },
    ]

    # --- Fallback prompts ---
    fallback_prompts = {
        "vitamin/supplement": "A cinematic arrangement of colorful vitamin supplements and fresh fruits on a clean surface with warm golden sunlight. Premium wellness aesthetic with soft bokeh background.",
        "sleep/rest": "A serene bedroom scene with soft morning light filtering through white curtains, cozy bedding and calming lavender tones. Premium minimalist wellness aesthetic.",
        "exercise/fitness": "A scenic nature path through a lush green forest with golden morning sunlight streaming through the trees. Fresh, vibrant greens with cinematic depth of field.",
        "food/diet": "A beautiful overhead shot of colorful fresh fruits, vegetables and superfoods arranged on a clean marble surface. Bright, vibrant colors with premium food photography lighting.",
        "meditation/mental": "A peaceful person in meditation pose surrounded by soft natural light and minimalist zen elements. Calming lavender and white tones with premium wellness aesthetic.",
        "water/hydration": "Crystal clear water droplets and a glass bottle surrounded by fresh cucumber and mint on a bright clean surface. Fresh blue and green tones with studio lighting.",
        "generic (default)": "A cinematic wellness scene with fresh green elements, soft golden sunlight, and premium health-focused objects arranged artistically. Bright, clean, optimistic mood with studio-quality lighting.",
    }

    return {
        "layers": layers,
        "brand_palettes": brand_palettes,
        "models": models,
        "fallback_prompts": fallback_prompts,
        "pipeline_summary": (
            "Title → [DeepSeek AI generates image_prompt] → "
            "image_prompt + quality_suffix → [deAPI generates image] → "
            "final image used as post/reel background"
        ),
    }


# ============================================================
# POST /api/prompts/test-generate — generate sample images
# ============================================================

@router.post("/test-generate", summary="Generate test images from a prompt")
async def test_generate_images(request: TestGenerateRequest):
    """
    Generate 1-2 test images from a given prompt using the post model (ZImageTurbo).
    Returns base64 PNG images so the user can see what the prompt produces.
    """
    if request.count < 1 or request.count > 2:
        raise HTTPException(status_code=400, detail="count must be 1 or 2")

    from app.services.ai_background_generator import AIBackgroundGenerator

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
            print(f"✅ Test image {i+1}/{request.count} generated in {elapsed:.1f}s", flush=True)
        except Exception as e:
            print(f"❌ Test image {i+1} failed: {e}", flush=True)
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
async def build_final_prompt(request: TestGenerateRequest):
    """
    Shows the complete final prompt that would be sent to deAPI,
    after all suffixes and quality modifiers are applied.
    Does NOT generate an image — just shows the assembled prompt.
    """
    import uuid

    quality_suffix = (
        "Ultra high quality, 8K, sharp focus, professional photography, "
        "soft natural lighting, premium lifestyle aesthetic. "
        "Photorealistic, detailed textures, beautiful composition. "
        "CRITICAL COMPOSITION: Subject must be centered in the UPPER HALF of the frame. "
        "The bottom third of the image should be soft bokeh, clean surface, or subtle gradient — "
        "NOT the main subject. Portrait orientation, slightly overhead camera angle, "
        "hero subject positioned in center-upper area of frame."
    )

    user_prompt = request.prompt or "Soft cinematic wellness still life with natural ingredients on white countertop in morning light."
    final_prompt = f"{user_prompt} {quality_suffix}"
    unique_id = str(uuid.uuid4())[:8]
    final_prompt_with_id = f"{final_prompt} [ID: {unique_id}]"

    return {
        "user_prompt": request.prompt,
        "quality_suffix": quality_suffix,
        "final_prompt": final_prompt_with_id,
        "total_chars": len(final_prompt_with_id),
        "model": "ZImageTurbo_INT8",
        "dimensions": "1088×1360",
        "steps": 8,
    }
