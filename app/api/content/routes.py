"""
Content generation API routes.
"""
import base64
from io import BytesIO
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status
from app.services.media.caption_generator import CaptionGenerator
from app.services.content.generator import ContentGenerator, ContentRating
from app.services.media.ai_background import AIBackgroundGenerator


# Pydantic models
class CaptionRequest(BaseModel):
    title: str
    content_lines: List[str]
    cta_type: Optional[str] = None
    brands: Optional[List[str]] = None  # If None, generate for all brands


class AutoContentRequest(BaseModel):
    topic_hint: Optional[str] = None  # Optional topic to focus on


class ContentRatingRequest(BaseModel):
    content_id: str
    title: str
    content_lines: List[str]
    views: int
    likes: int = 0
    shares: int = 0
    saves: int = 0
    comments: int = 0
    format_style: str = ""
    topic_category: str = ""


class BatchTitlesRequest(BaseModel):
    count: int = 5
    topic_hint: Optional[str] = None


class GeneratePostBgRequest(BaseModel):
    brand: str
    prompt: str


class GenerateImagePromptRequest(BaseModel):
    title: str


class GenerateBackgroundRequest(BaseModel):
    prompt: str
    brand: str


# Create router
router = APIRouter()

# Initialize services
caption_generator = CaptionGenerator()
content_generator = ContentGenerator()
content_rating = ContentRating()


@router.post(
    "/generate-captions",
    summary="Generate AI captions for all brands",
    description="Generate AI-powered captions for Instagram posts using DeepSeek API"
)
async def generate_captions(request: CaptionRequest):
    """
    Generate AI captions for all brands based on title and content.
    
    The first paragraph is AI-generated, rest is fixed template with brand-specific handles.
    """
    try:
        # Generate captions for all brands
        captions = await asyncio.to_thread(
            caption_generator.generate_all_brand_captions,
            title=request.title,
            content_lines=request.content_lines,
            cta_type=request.cta_type,
        )
        
        # Extract just the first paragraph for each brand
        first_paragraphs = {}
        for brand, caption in captions.items():
            # First paragraph is everything before the first double newline
            first_para = caption.split("\n\n")[0] if "\n\n" in caption else caption[:200]
            first_paragraphs[brand] = first_para
        
        return {
            "captions": captions,
            "first_paragraphs": first_paragraphs,
            "cta_type": request.cta_type
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate captions: {str(e)}"
        )


@router.post(
    "/auto-generate-content",
    summary="Auto-generate viral content using AI",
    description="Generate complete viral post (title, content, image prompt) from scratch using DeepSeek AI"
)
async def auto_generate_content(request: AutoContentRequest = None):
    """
    Generate a complete viral post from scratch using AI.
    
    Returns title, content_lines (8 points), and image prompt for dark mode.
    """
    try:
        topic_hint = request.topic_hint if request else None
        content = await asyncio.to_thread(content_generator.generate_viral_content, topic_hint)
        
        if not content.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate content"
            )
        
        return content
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate content: {str(e)}"
        )


@router.post(
    "/generate-post-title",
    summary="Generate viral post title using AI",
    description="Generate a statement-based viral title for Instagram image posts (not reels)"
)
async def generate_post_title(request: AutoContentRequest = None):
    """
    Generate a viral post title suitable for Instagram image posts.
    
    Post titles are different from reel titles:
    - Statement-based with facts/studies ("STUDY REVEALS...", "RESEARCH SHOWS...")
    - Contains specific percentages, timeframes, or quantifiable claims
    - Single powerful statement, not a topic header
    
    Returns title and image prompt.
    """
    try:
        topic_hint = request.topic_hint if request else None
        result = await asyncio.to_thread(content_generator.generate_post_title, topic_hint)
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate post title"
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate post title: {str(e)}"
        )


@router.post(
    "/generate-post-titles-batch",
    summary="Generate N unique post titles + captions + prompts in one AI call",
)
async def generate_post_titles_batch(request: BatchTitlesRequest = None):
    """Generate N unique posts in a single AI call (for God Automation)."""
    import time as _time
    try:
        count = request.count if request else 5
        topic_hint = request.topic_hint if request else None
        print(f"\n🔱 [GOD] generate_post_titles_batch: count={count}, topic_hint={topic_hint!r}", flush=True)
        t0 = _time.time()
        results = await asyncio.to_thread(content_generator.generate_post_titles_batch, count, topic_hint)
        elapsed = _time.time() - t0
        titles = [r.get('title', '?')[:50] for r in results]
        print(f"🔱 [GOD] titles generated in {elapsed:.1f}s: {titles}", flush=True)
        return {"posts": results}
    except Exception as e:
        print(f"❌ [GOD] generate_post_titles_batch FAILED: {e}", flush=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate batch titles: {str(e)}"
        )


@router.post(
    "/generate-post-background",
    summary="Generate a single post background image (returns base64)",
)
async def generate_post_background(request: GeneratePostBgRequest):
    """Generate a single AI background image for a post. Returns base64 PNG."""
    import time as _time
    try:
        print(f"\n🔱 [GOD] generate_post_background: brand={request.brand}, prompt={request.prompt[:60]}...", flush=True)
        t0 = _time.time()
        generator = AIBackgroundGenerator()
        image = await asyncio.to_thread(
            generator.generate_post_background,
            brand_name=request.brand,
            user_prompt=request.prompt,
        )
        elapsed = _time.time() - t0
        print(f"🔱 [GOD] image generated in {elapsed:.1f}s for {request.brand} ({image.size[0]}x{image.size[1]})", flush=True)

        buf = BytesIO()
        image.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        return {"background_data": f"data:image/png;base64,{b64}"}
    except Exception as e:
        print(f"❌ [GOD] generate_post_background FAILED for {request.brand}: {e}", flush=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate background: {str(e)}"
        )


@router.post(
    "/generate-image-prompt",
    summary="Generate AI image prompt from title",
    description="Generate a cinematic image prompt based on a content title, for use with image generation APIs"
)
async def generate_image_prompt(request: GenerateImagePromptRequest):
    """
    Generate an AI image prompt from a title.
    
    Used when the user provides a title but leaves the image prompt blank.
    Returns a detailed cinematic prompt suitable for DALL-E/Flux.
    """
    try:
        result = await asyncio.to_thread(content_generator.generate_image_prompt, request.title)
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate image prompt"
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate image prompt: {str(e)}"
        )


@router.post(
    "/generate-background",
    summary="Generate AI background image",
    description="Generate an AI background image using DALL-E/Flux API"
)
async def generate_background(request: GenerateBackgroundRequest):
    """
    Generate an AI background image for posts.
    
    Returns base64-encoded image data that can be used directly in the canvas.
    """
    try:
        generator = AIBackgroundGenerator()
        
        # Generate the image
        image = await asyncio.to_thread(
            generator.generate_background,
            brand_name=request.brand,
            user_prompt=request.prompt,
        )
        
        # Convert to base64
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        base64_image = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        return {
            "success": True,
            "image_data": f"data:image/png;base64,{base64_image}",
            "width": image.width,
            "height": image.height
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate background: {str(e)}"
        )


@router.get(
    "/content-topics",
    summary="Get available content topics",
    description="Get list of available topic categories for content generation"
)
async def get_content_topics():
    """Get available topic categories for auto content generation."""
    return {
        "topics": content_generator.get_available_topics(),
        "formats": content_generator.get_format_styles()
    }


@router.post(
    "/rate-content",
    summary="Rate content performance",
    description="Submit performance metrics for generated content to improve AI"
)
async def rate_content(request: ContentRatingRequest):
    """
    Submit performance metrics for generated content.
    
    This helps improve future content generation by learning what works.
    """
    try:
        rating = content_rating.add_rating(
            content_id=request.content_id,
            title=request.title,
            content_lines=request.content_lines,
            views=request.views,
            likes=request.likes,
            shares=request.shares,
            saves=request.saves,
            comments=request.comments,
            format_style=request.format_style,
            topic_category=request.topic_category
        )
        return {"success": True, "rating": rating}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save rating: {str(e)}"
        )


@router.get(
    "/content-analytics",
    summary="Get content performance analytics",
    description="Get analytics on which topics and formats perform best"
)
async def get_content_analytics():
    """Get analytics on content performance."""
    return {
        "top_performing": content_rating.get_top_performing(10),
        "best_topics": content_rating.get_best_topics(),
        "best_formats": content_rating.get_best_formats()
    }
