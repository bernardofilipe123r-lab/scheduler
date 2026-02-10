"""
API routes for the reels automation service.
"""
import uuid
import shutil
import asyncio
import base64
from io import BytesIO
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from app.api.schemas import ReelCreateRequest, ReelCreateResponse, ErrorResponse
from app.services.image_generator import ImageGenerator
from app.services.video_generator import VideoGenerator
from app.services.caption_builder import CaptionBuilder
from app.services.caption_generator import CaptionGenerator
# Use V2 content generator with 3-layer architecture
from app.services.content_generator_v2 import ContentGenerator, ContentRating
from app.services.db_scheduler import DatabaseSchedulerService
from app.services.social_publisher import SocialPublisher
from app.services.ai_background_generator import AIBackgroundGenerator
from app.database.db import ReelDatabase
from app.core.config import BrandType, BRAND_CONFIGS, BrandConfig


# Simple request model for web interface
class SimpleReelRequest(BaseModel):
    title: str
    content_lines: List[str]
    brand: str = "gymcollege"
    variant: str = "light"
    ai_prompt: Optional[str] = None  # Optional custom AI prompt for dark mode
    cta_type: Optional[str] = "sleep_lean"  # CTA option for caption


# Request model for caption generation
class CaptionRequest(BaseModel):
    title: str
    content_lines: List[str]
    cta_type: str = "sleep_lean"
    brands: Optional[List[str]] = None  # If None, generate for all brands


# Request model for auto content generation
class AutoContentRequest(BaseModel):
    topic_hint: Optional[str] = None  # Optional topic to focus on


# Request model for rating content performance
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


class DownloadRequest(BaseModel):
    reel_id: str
    brand: str = "gymcollege"


# Create router
router = APIRouter(prefix="/reels", tags=["reels"])

# Initialize services (will be reused across requests)
scheduler_service = DatabaseSchedulerService()
caption_generator = CaptionGenerator()
content_generator = ContentGenerator()
content_rating = ContentRating()
db = ReelDatabase()


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
        captions = caption_generator.generate_all_brand_captions(
            title=request.title,
            content_lines=request.content_lines,
            cta_type=request.cta_type
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
        content = content_generator.generate_viral_content(topic_hint)
        
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
        result = content_generator.generate_post_title(topic_hint)
        
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


# ==================== GOD AUTOMATION ENDPOINTS ====================

class BatchTitlesRequest(BaseModel):
    count: int = 5
    topic_hint: Optional[str] = None


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
        results = content_generator.generate_post_titles_batch(count, topic_hint)
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


class GeneratePostBgRequest(BaseModel):
    brand: str
    prompt: str


@router.post(
    "/generate-post-background",
    summary="Generate a single post background image (returns base64)",
)
async def generate_post_background(request: GeneratePostBgRequest):
    """Generate a single AI background image for a post. Returns base64 PNG."""
    import time as _time
    try:
        from app.services.ai_background_generator import AIBackgroundGenerator
        import base64
        from io import BytesIO

        print(f"\n🔱 [GOD] generate_post_background: brand={request.brand}, prompt={request.prompt[:60]}...", flush=True)
        t0 = _time.time()
        generator = AIBackgroundGenerator()
        image = generator.generate_post_background(
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


class GenerateImagePromptRequest(BaseModel):
    title: str


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
        result = content_generator.generate_image_prompt(request.title)
        
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


class GenerateBackgroundRequest(BaseModel):
    prompt: str
    brand: str = "healthycollege"


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
        image = generator.generate_background(
            brand_name=request.brand,
            user_prompt=request.prompt
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


def get_brand_config_from_name(brand_name: str) -> Optional[BrandConfig]:
    """
    Get brand configuration from brand name string.
    
    Args:
        brand_name: Brand name from UI ("gymcollege" or "healthycollege")
        
    Returns:
        BrandConfig or None
    """
    brand_mapping = {
        "gymcollege": BrandType.THE_GYM_COLLEGE,
        "healthycollege": BrandType.HEALTHY_COLLEGE,
        "vitalitycollege": BrandType.VITALITY_COLLEGE,
        "longevitycollege": BrandType.LONGEVITY_COLLEGE,
        "holisticcollege": BrandType.HOLISTIC_COLLEGE,
        "wellbeingcollege": BrandType.WELLBEING_COLLEGE,
        "the_gym_college": BrandType.THE_GYM_COLLEGE,
        "healthy_college": BrandType.HEALTHY_COLLEGE,
        "vitality_college": BrandType.VITALITY_COLLEGE,
        "longevity_college": BrandType.LONGEVITY_COLLEGE,
        "holistic_college": BrandType.HOLISTIC_COLLEGE,
        "wellbeing_college": BrandType.WELLBEING_COLLEGE,
        "thegymcollege": BrandType.THE_GYM_COLLEGE,
        "thehealthycollege": BrandType.HEALTHY_COLLEGE,
        "thevitalitycollege": BrandType.VITALITY_COLLEGE,
        "thelongevitycollege": BrandType.LONGEVITY_COLLEGE,
        "theholisticcollege": BrandType.HOLISTIC_COLLEGE,
        "thewellbeingcollege": BrandType.WELLBEING_COLLEGE,
    }
    brand_type = brand_mapping.get(brand_name.lower())
    if brand_type:
        config = BRAND_CONFIGS.get(brand_type)
        if config:
            print(f"🏷️ Brand config found for '{brand_name}': {config.name}, IG: {config.instagram_business_account_id}, FB: {config.facebook_page_id}")
        return config
    print(f"⚠️ No brand config found for '{brand_name}'")
    return None


@router.post(
    "/create",
    response_model=ReelCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new Instagram Reel",
    description="Generate thumbnail, reel image, and video with caption from structured text input",
    responses={
        201: {"description": "Reel created successfully"},
        400: {"model": ErrorResponse, "description": "Invalid request data"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    }
)
async def create_reel(request: ReelCreateRequest) -> ReelCreateResponse:
    """
    Create a complete Instagram Reel package.
    
    This endpoint generates:
    - A thumbnail image (PNG)
    - A reel image (PNG)
    - A 7-second reel video (MP4) with background music
    - A formatted caption
    
    If a scheduled time is provided, the reel metadata is stored for later publishing.
    """
    try:
        # Generate unique ID for this reel
        reel_id = str(uuid.uuid4())
        
        # Get project root for file paths
        base_dir = Path(__file__).resolve().parent.parent.parent
        
        # Define output paths
        thumbnail_path = base_dir / "output" / "thumbnails" / f"{reel_id}.png"
        reel_image_path = base_dir / "output" / "reels" / f"{reel_id}.png"
        video_path = base_dir / "output" / "videos" / f"{reel_id}.mp4"
        
        # Initialize services for this request
        image_generator = ImageGenerator(request.brand)
        caption_builder = CaptionBuilder()
        
        # Step 1: Generate thumbnail
        try:
            image_generator.generate_thumbnail(
                title=request.title,
                output_path=thumbnail_path
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate thumbnail: {str(e)}"
            )
        
        # Step 2: Generate reel image
        try:
            image_generator.generate_reel_image(
                title=request.title,
                lines=request.lines,
                output_path=reel_image_path,
                cta_type=request.cta_type
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate reel image: {str(e)}"
            )
        
        # Step 3: Generate video
        try:
            video_generator = VideoGenerator()
            video_generator.generate_reel_video(
                reel_image_path=reel_image_path,
                output_path=video_path,
                music_id=request.music_id
            )
        except RuntimeError as e:
            # FFmpeg-specific errors
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate video: {str(e)}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Unexpected error during video generation: {str(e)}"
            )
        
        # Step 4: Generate caption
        try:
            caption = caption_builder.build_caption(
                title=request.title,
                lines=request.lines
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate caption: {str(e)}"
            )
        
        # Step 5: Handle scheduling if provided
        if request.schedule_at:
            try:
                scheduler_service.schedule_reel(
                    reel_id=reel_id,
                    scheduled_time=request.schedule_at,
                    video_path=video_path,
                    caption=caption,
                    metadata={
                        "title": request.title,
                        "brand": request.brand.value,
                        "cta_type": request.cta_type.value,
                        "thumbnail_path": str(thumbnail_path),
                        "reel_image_path": str(reel_image_path),
                    }
                )
            except Exception as e:
                # Scheduling failure shouldn't fail the entire request
                # Log the error but continue
                print(f"Warning: Failed to schedule reel: {str(e)}")
        
        # Return response with relative paths
        return ReelCreateResponse(
            thumbnail_path=str(thumbnail_path.relative_to(base_dir)),
            reel_image_path=str(reel_image_path.relative_to(base_dir)),
            video_path=str(video_path.relative_to(base_dir)),
            caption=caption,
            reel_id=reel_id,
            scheduled_at=request.schedule_at
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Catch any unexpected errors
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}"
        )


# Removed duplicate endpoint - see line ~547 for the correct /scheduled endpoint


@router.get(
    "/health",
    summary="Health check",
    description="Check if the service and its dependencies are healthy"
)
async def health_check():
    """
    Health check endpoint.
    
    Verifies that FFmpeg is installed and the service is ready.
    """
    try:
        video_generator = VideoGenerator()
        ffmpeg_available = video_generator.verify_installation()
        
        return {
            "status": "healthy" if ffmpeg_available else "degraded",
            "ffmpeg_available": ffmpeg_available,
            "message": "Service is operational" if ffmpeg_available else "FFmpeg not available - video generation disabled"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "ffmpeg_available": False,
            "message": str(e)
        }


@router.post(
    "/generate",
    summary="Generate reel (simple interface)",
    description="Simplified endpoint for web interface - generates thumbnail, reel image, and video"
)
async def generate_reel(request: SimpleReelRequest):
    """
    Generate reel images and video from title and content lines.
    
    Simplified endpoint for web interface testing.
    """
    try:
        # Generate unique ID
        reel_id = str(uuid.uuid4())[:8]
        
        # Create database record
        db.create_generation(
            generation_id=reel_id,
            title=request.title,
            content=request.content_lines,
            brand=request.brand,
            variant=request.variant,
            ai_prompt=request.ai_prompt
        )
        
        # Get base directory
        base_dir = Path(__file__).resolve().parent.parent.parent
        
        # Define output paths
        thumbnail_path = base_dir / "output" / "thumbnails" / f"{reel_id}.png"
        reel_image_path = base_dir / "output" / "reels" / f"{reel_id}.png"
        video_path = base_dir / "output" / "videos" / f"{reel_id}.mp4"
        
        # Parse brand - handle case-insensitive brand names
        brand_mapping = {
            "the_gym_college": BrandType.THE_GYM_COLLEGE,
            "gymcollege": BrandType.THE_GYM_COLLEGE,
            "thegymcollege": BrandType.THE_GYM_COLLEGE,
            "healthycollege": BrandType.HEALTHY_COLLEGE,
            "healthy_college": BrandType.HEALTHY_COLLEGE,
            "thehealthycollege": BrandType.HEALTHY_COLLEGE,
            "vitalitycollege": BrandType.VITALITY_COLLEGE,
            "vitality_college": BrandType.VITALITY_COLLEGE,
            "thevitalitycollege": BrandType.VITALITY_COLLEGE,
            "longevitycollege": BrandType.LONGEVITY_COLLEGE,
            "longevity_college": BrandType.LONGEVITY_COLLEGE,
            "thelongevitycollege": BrandType.LONGEVITY_COLLEGE,
            "holisticcollege": BrandType.HOLISTIC_COLLEGE,
            "holistic_college": BrandType.HOLISTIC_COLLEGE,
            "theholisticcollege": BrandType.HOLISTIC_COLLEGE,
            "wellbeingcollege": BrandType.WELLBEING_COLLEGE,
            "wellbeing_college": BrandType.WELLBEING_COLLEGE,
            "thewellbeingcollege": BrandType.WELLBEING_COLLEGE,
        }
        brand = brand_mapping.get(request.brand.lower(), BrandType.HEALTHY_COLLEGE)
        
        # Update progress
        db.update_progress(reel_id, "initializing", 5, "Starting generation...")
        
        # Initialize image generator with variant and optional AI prompt
        image_generator = ImageGenerator(
            brand, 
            variant=request.variant, 
            brand_name=request.brand,
            ai_prompt=request.ai_prompt
        )
        
        # Generate thumbnail
        db.update_progress(reel_id, "thumbnail", 20, "Generating thumbnail...")
        image_generator.generate_thumbnail(
            title=request.title,
            output_path=thumbnail_path
        )
        
        # Generate reel image
        db.update_progress(reel_id, "content", 50, "Generating content image...")
        image_generator.generate_reel_image(
            title=request.title,
            lines=request.content_lines,
            output_path=reel_image_path,
            cta_type=request.cta_type
        )
        
        # Generate video with random duration and music
        db.update_progress(reel_id, "video", 75, "Creating video with music...")
        video_generator = VideoGenerator()
        video_generator.generate_reel_video(
            reel_image_path=reel_image_path,
            output_path=video_path
        )
        
        # Generate caption
        db.update_progress(reel_id, "caption", 90, "Building caption...")
        caption_builder = CaptionBuilder()
        caption = caption_builder.build_caption(
            title=request.title,
            lines=request.content_lines
        )
        
        # Update database with completion
        db.update_generation_status(
            generation_id=reel_id,
            status='completed',
            thumbnail_path=f"/output/thumbnails/{reel_id}.png",
            video_path=f"/output/videos/{reel_id}.mp4"
        )
        db.update_progress(reel_id, "completed", 100, "Generation complete!")
        
        # Return web-friendly paths
        return {
            "thumbnail_path": f"/output/thumbnails/{reel_id}.png",
            "reel_image_path": f"/output/reels/{reel_id}.png",
            "video_path": f"/output/videos/{reel_id}.mp4",
            "caption": caption,
            "reel_id": reel_id
        }
        
    except Exception as e:
        # Update database with error
        if 'reel_id' in locals():
            db.update_generation_status(
                generation_id=reel_id,
                status='failed',
                error=str(e)
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate reel: {str(e)}"
        )


class ScheduleRequest(BaseModel):
    reel_id: str
    schedule_date: str  # YYYY-MM-DD
    schedule_time: str  # HH:MM
    caption: str


@router.post(
    "/schedule",
    summary="Schedule a reel for publication",
    description="Schedule an existing reel to be published on Instagram at a specific date and time"
)
async def schedule_reel(request: ScheduleRequest):
    """
    Schedule a reel for future publication on Instagram.
    
    Note: This stores the scheduling information. Actual publication to Instagram
    requires Meta API credentials to be configured.
    """
    print("\n" + "="*80)
    print("🗓️  SCHEDULING REQUEST RECEIVED")
    print("="*80)
    print(f"📋 Reel ID: {request.reel_id}")
    print(f"📅 Date: {request.schedule_date}")
    print(f"⏰ Time: {request.schedule_time}")
    print(f"💬 Caption: {request.caption[:50]}..." if len(request.caption) > 50 else f"💬 Caption: {request.caption}")
    
    try:
        # Parse the date and time
        from datetime import datetime
        
        print("\n🔄 Parsing scheduled datetime...")
        scheduled_datetime = datetime.strptime(
            f"{request.schedule_date} {request.schedule_time}",
            "%Y-%m-%d %H:%M"
        )
        print(f"✅ Parsed datetime: {scheduled_datetime.isoformat()}")
        
        # Get base directory
        base_dir = Path(__file__).resolve().parent.parent.parent
        video_path = base_dir / "output" / "videos" / f"{request.reel_id}.mp4"
        thumbnail_path = base_dir / "output" / "thumbnails" / f"{request.reel_id}.png"
        
        print(f"\n🎬 Video path: {video_path}")
        print(f"🖼️  Thumbnail path: {thumbnail_path}")
        
        # Check if video exists
        if not video_path.exists():
            print(f"❌ ERROR: Video file not found!")
            print(f"   Expected location: {video_path}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video not found for reel ID: {request.reel_id}"
            )
        
        print(f"✅ Video file exists ({video_path.stat().st_size / 1024 / 1024:.2f} MB)")
        
        if thumbnail_path.exists():
            print(f"✅ Thumbnail exists ({thumbnail_path.stat().st_size / 1024:.2f} KB)")
        else:
            print(f"⚠️  Warning: Thumbnail not found (will work without it)")
        
        # Schedule the reel
        print("\n💾 Saving to database...")
        result = scheduler_service.schedule_reel(
            user_id="web_user",  # Default user for web interface
            reel_id=request.reel_id,
            scheduled_time=scheduled_datetime,
            video_path=video_path,
            thumbnail_path=thumbnail_path if thumbnail_path.exists() else None,
            caption=request.caption,
            platforms=["instagram"],
            user_name="Web Interface User"
        )
        
        print(f"✅ Successfully saved to database!")
        print(f"📝 Schedule ID: {result.get('schedule_id')}")
        print(f"📊 Status: {result.get('status')}")
        print("\n" + "="*80)
        print("✨ SCHEDULING COMPLETE!")
        print("="*80 + "\n")
        
        return {
            "status": "scheduled",
            "reel_id": request.reel_id,
            "schedule_id": result.get('schedule_id'),
            "scheduled_for": scheduled_datetime.isoformat(),
            "message": f"Reel scheduled for {request.schedule_date} at {request.schedule_time}",
            "note": "Configure META_ACCESS_TOKEN and META_INSTAGRAM_ACCOUNT_ID in .env to enable automatic publishing"
        }
        
    except ValueError as e:
        print(f"\n❌ ERROR: Invalid date/time format")
        print(f"   Details: {str(e)}")
        print("="*80 + "\n")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date/time format: {str(e)}"
        )
    except HTTPException:
        print("="*80 + "\n")
        raise
    except Exception as e:
        print(f"\n❌ ERROR: Failed to schedule reel")
        print(f"   Exception type: {type(e).__name__}")
        print(f"   Details: {str(e)}")
        import traceback
        print(f"\n📚 Full traceback:")
        traceback.print_exc()
        print("="*80 + "\n")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to schedule reel: {str(e)}"
        )


class AutoScheduleRequest(BaseModel):
    """Request to auto-schedule a reel to next available slot."""
    reel_id: str
    brand: str
    variant: str
    caption: str = "CHANGE ME"
    yt_title: Optional[str] = None  # YouTube-optimized title
    user_id: str = "default"
    video_path: Optional[str] = None
    thumbnail_path: Optional[str] = None
    yt_thumbnail_path: Optional[str] = None  # Clean AI image for YouTube (no text)
    scheduled_time: Optional[str] = None  # Optional custom ISO datetime string
    platforms: Optional[List[str]] = None  # ["instagram", "facebook", "youtube"] - if None, uses yt_title to determine


@router.post(
    "/schedule-auto",
    summary="Auto-schedule a reel to next available slot",
    description="Automatically schedule a reel to the next available time slot based on brand and variant"
)
async def schedule_auto(request: AutoScheduleRequest):
    """
    Auto-schedule a reel for future publication.
    
    If scheduled_time is provided, uses that exact time.
    Otherwise, uses magic scheduling to find next available slot.
    
    MAGIC SCHEDULING RULES (when no custom time):
    - Each brand has 6 daily slots (every 4 hours), alternating Light → Dark
    - Brands are staggered by 1 hour:
      - Gym College: 12AM(L), 4AM(D), 8AM(L), 12PM(D), 4PM(L), 8PM(D)
      - Healthy College: 1AM(L), 5AM(D), 9AM(L), 1PM(D), 5PM(L), 9PM(D)
      - Vitality College: 2AM(L), 6AM(D), 10AM(L), 2PM(D), 6PM(L), 10PM(D)
      - Longevity College: 3AM(L), 7AM(D), 11AM(L), 3PM(D), 7PM(L), 11PM(D)
    - Starts from Jan 16, 2026 or today (whichever is later)
    """
    print("\n" + "="*80)
    print("🪄 AUTO-SCHEDULING REQUEST")
    print("="*80)
    print(f"📋 Reel ID: {request.reel_id}")
    print(f"🏷️  Brand: {request.brand}")
    print(f"🎨 Variant: {request.variant}")
    if request.scheduled_time:
        print(f"📅 Custom time: {request.scheduled_time}")
    
    try:
        # Determine scheduled time
        if request.scheduled_time:
            # Use custom time provided by user
            from datetime import datetime
            next_slot = datetime.fromisoformat(request.scheduled_time.replace('Z', '+00:00'))
            # Remove timezone info if present to match scheduler expectations
            if next_slot.tzinfo is not None:
                next_slot = next_slot.replace(tzinfo=None)
            print(f"📅 Using custom time: {next_slot.isoformat()}")
        else:
            # Get next available slot using magic scheduling
            next_slot = scheduler_service.get_next_available_slot(
                brand=request.brand,
                variant=request.variant
            )
            print(f"📅 Next available slot: {next_slot.isoformat()}")
        
        # Get file paths
        base_dir = Path(__file__).resolve().parent.parent.parent
        
        if request.video_path:
            video_path = Path(request.video_path)
            if not video_path.is_absolute():
                video_path = base_dir / request.video_path.lstrip('/')
        else:
            video_path = base_dir / "output" / "videos" / f"{request.reel_id}_video.mp4"
        
        if request.thumbnail_path:
            thumbnail_path = Path(request.thumbnail_path)
            if not thumbnail_path.is_absolute():
                thumbnail_path = base_dir / request.thumbnail_path.lstrip('/')
        else:
            thumbnail_path = base_dir / "output" / "thumbnails" / f"{request.reel_id}_thumbnail.png"
        
        # Handle YouTube thumbnail path (clean AI image, no text)
        yt_thumbnail_path = None
        if request.yt_thumbnail_path:
            yt_thumbnail_path = Path(request.yt_thumbnail_path)
            if not yt_thumbnail_path.is_absolute():
                yt_thumbnail_path = base_dir / request.yt_thumbnail_path.lstrip('/')
            if not yt_thumbnail_path.exists():
                yt_thumbnail_path = None
                print(f"⚠️  YT thumbnail not found: {request.yt_thumbnail_path}")
        
        print(f"🎬 Video path: {video_path}")
        print(f"🖼️  Thumbnail path: {thumbnail_path}")
        if yt_thumbnail_path:
            print(f"📺 YT thumbnail path: {yt_thumbnail_path}")
        
        # Determine platforms - use request.platforms if provided, otherwise fall back to legacy logic
        if request.platforms:
            platforms = request.platforms
            print(f"📱 Platforms from request: {platforms}")
        else:
            # Legacy behavior: include YouTube if yt_title is provided
            platforms = ["instagram", "facebook"]
            if request.yt_title:
                platforms.append("youtube")
            print(f"📱 Platforms (auto-detected): {platforms}")
        
        if request.yt_title:
            print(f"📺 YouTube title: {request.yt_title}")
        
        # Schedule the reel
        result = scheduler_service.schedule_reel(
            user_id=request.user_id,
            reel_id=request.reel_id,
            scheduled_time=next_slot,
            video_path=video_path if video_path.exists() else None,
            thumbnail_path=thumbnail_path if thumbnail_path.exists() else None,
            yt_thumbnail_path=yt_thumbnail_path,  # Clean AI image for YouTube
            caption=request.caption,
            yt_title=request.yt_title,  # Pass YouTube title
            platforms=platforms,
            user_name=request.user_id,
            brand=request.brand,
            variant=request.variant
        )
        
        print(f"✅ Scheduled successfully!")
        print(f"📝 Schedule ID: {result.get('schedule_id')}")
        print("="*80 + "\n")
        
        return {
            "status": "scheduled",
            "reel_id": request.reel_id,
            "brand": request.brand,
            "variant": request.variant,
            "schedule_id": result.get('schedule_id'),
            "scheduled_for": next_slot.isoformat(),
            "message": f"Reel auto-scheduled for {next_slot.strftime('%Y-%m-%d %I:%M %p')}"
        }
        
    except Exception as e:
        print(f"\n❌ ERROR: Failed to auto-schedule")
        print(f"   Details: {str(e)}")
        import traceback
        traceback.print_exc()
        print("="*80 + "\n")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to auto-schedule reel: {str(e)}"
        )


@router.post(
    "/download",
    summary="Download reel to numbered folder",
    description="Download generated reel (video and thumbnail) to reels folder with auto-incrementing numbers"
)
async def download_reel(request: DownloadRequest):
    """
    Download reel files to a reels folder with auto-incrementing numbering.
    Saves as 1.mp4/1.png, 2.mp4/2.png, etc.
    """
    try:
        # Get base directory
        base_dir = Path(__file__).resolve().parent.parent.parent
        
        # Source paths
        video_path = base_dir / "output" / "videos" / f"{request.reel_id}.mp4"
        thumbnail_path = base_dir / "output" / "thumbnails" / f"{request.reel_id}.png"
        
        # Check if source files exist
        if not video_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video not found for reel ID: {request.reel_id}"
            )
        
        if not thumbnail_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Thumbnail not found for reel ID: {request.reel_id}"
            )
        
        # Create reels folder for specific brand
        reels_folder = base_dir / "reels" / request.brand
        reels_folder.mkdir(parents=True, exist_ok=True)
        
        # Find next available number
        next_number = 1
        while True:
            dest_video = reels_folder / f"{next_number}.mp4"
            dest_thumbnail = reels_folder / f"{next_number}.png"
            
            if not dest_video.exists() and not dest_thumbnail.exists():
                break
            next_number += 1
        
        # Copy files
        shutil.copy2(video_path, dest_video)
        shutil.copy2(thumbnail_path, dest_thumbnail)
        
        return {
            "status": "success",
            "message": f"Reel downloaded as {next_number}.mp4 and {next_number}.png to reels/{request.brand}/ folder",
            "number": next_number,
            "video_path": str(dest_video.relative_to(base_dir)),
            "thumbnail_path": str(dest_thumbnail.relative_to(base_dir))
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download reel: {str(e)}"
        )


@router.get("/status")
async def get_status():
    """Get current generation status."""
    active = db.get_active_generation()
    if active:
        progress = db.get_progress(active['id'])
        return {
            "status": "generating",
            "generation": active,
            "progress": progress
        }
    return {"status": "idle"}


@router.get("/history")
async def get_history(limit: int = 10):
    """Get recent generation history."""
    return {
        "generations": db.get_recent_generations(limit)
    }


@router.get("/generation/{generation_id}")
async def get_generation(generation_id: str):
    """Get specific generation details."""
    generation = db.get_generation(generation_id)
    if not generation:
        raise HTTPException(status_code=404, detail="Generation not found")
    
    progress = db.get_progress(generation_id)
    return {
        "generation": generation,
        "progress": progress
    }


@router.get("/scheduled")
async def get_scheduled_posts(user_id: Optional[str] = None):
    """
    Get all scheduled posts.
    
    Optional: Filter by user_id to see only specific user's schedules.
    """
    try:
        schedules = scheduler_service.get_all_scheduled(user_id=user_id)
        
        # Format the response with human-readable data
        formatted_schedules = []
        for schedule in schedules:
            metadata = schedule.get("metadata", {})
            
            # Convert filesystem paths to URL paths
            raw_thumb = metadata.get("thumbnail_path")
            thumb_url = None
            if raw_thumb:
                # Extract '/output/...' portion from full filesystem path
                if "/output/" in raw_thumb:
                    thumb_url = "/output/" + raw_thumb.split("/output/", 1)[1]
                else:
                    thumb_url = raw_thumb  # Already a relative URL
            
            raw_video = metadata.get("video_path")
            video_url = None
            if raw_video:
                if "/output/" in raw_video:
                    video_url = "/output/" + raw_video.split("/output/", 1)[1]
                else:
                    video_url = raw_video
            
            formatted_schedules.append({
                "schedule_id": schedule.get("schedule_id"),
                "reel_id": schedule.get("reel_id"),
                "scheduled_time": schedule.get("scheduled_time"),
                "status": schedule.get("status"),
                "platforms": metadata.get("platforms", []),
                "brand": metadata.get("brand", ""),
                "variant": metadata.get("variant", "light"),
                "caption": schedule.get("caption"),
                "created_at": schedule.get("created_at"),
                "published_at": schedule.get("published_at"),
                "publish_error": schedule.get("publish_error"),
                "metadata": {
                    "brand": metadata.get("brand"),
                    "variant": metadata.get("variant"),
                    "platforms": metadata.get("platforms"),
                    "video_path": video_url,
                    "thumbnail_path": thumb_url,
                    "post_ids": metadata.get("post_ids"),
                    "publish_results": metadata.get("publish_results"),
                }
            })
        
        return {
            "total": len(formatted_schedules),
            "schedules": formatted_schedules
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get scheduled posts: {str(e)}"
        )


@router.delete("/scheduled/{schedule_id}")
async def delete_scheduled_post(schedule_id: str, user_id: Optional[str] = None):
    """
    Delete a scheduled post.
    
    Optional: Provide user_id to ensure only the owner can delete.
    """
    try:
        success = scheduler_service.delete_scheduled(schedule_id, user_id=user_id)
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Scheduled post {schedule_id} not found"
            )
        
        return {
            "success": True,
            "message": f"Scheduled post {schedule_id} deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete scheduled post: {str(e)}"
        )


@router.post("/scheduled/{schedule_id}/retry")
async def retry_failed_post(schedule_id: str):
    """
    Retry a failed scheduled post by resetting its status to 'scheduled'.
    
    This allows the auto-publisher to pick it up again on the next check.
    """
    try:
        success = scheduler_service.retry_failed(schedule_id)
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Scheduled post {schedule_id} not found or not in failed status"
            )
        
        return {
            "success": True,
            "message": f"Post {schedule_id} reset to scheduled status for retry"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retry post: {str(e)}"
        )


class RescheduleRequest(BaseModel):
    scheduled_time: str  # ISO datetime string


@router.patch("/scheduled/{schedule_id}/reschedule")
async def reschedule_post(schedule_id: str, request: RescheduleRequest):
    """
    Reschedule a scheduled post to a new date/time.
    
    Args:
        schedule_id: ID of the scheduled post
        request: New scheduled time as ISO datetime string
    """
    try:
        from datetime import datetime
        
        # Parse the new scheduled time
        new_time = datetime.fromisoformat(request.scheduled_time.replace('Z', '+00:00'))
        
        success = scheduler_service.reschedule(schedule_id, new_time)
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Scheduled post {schedule_id} not found"
            )
        
        return {
            "success": True,
            "message": f"Post rescheduled to {new_time.isoformat()}",
            "scheduled_time": new_time.isoformat()
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid datetime format: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reschedule post: {str(e)}"
        )


@router.post("/scheduled/{schedule_id}/publish-now")
async def publish_scheduled_now(schedule_id: str):
    """
    Immediately publish a scheduled post (bypass the scheduled time).
    
    This sets the scheduled_time to now so it gets picked up immediately
    by the auto-publisher on its next check.
    """
    try:
        from datetime import datetime, timezone
        
        success = scheduler_service.publish_scheduled_now(schedule_id)
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Scheduled post {schedule_id} not found"
            )
        
        return {
            "success": True,
            "message": f"Post {schedule_id} queued for immediate publishing"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to publish post: {str(e)}"
        )


class PublishRequest(BaseModel):
    reel_id: str
    caption: str = "CHANGE ME"
    platforms: list[str] = ["instagram"]  # ["instagram", "facebook"]
    schedule_date: str = None  # YYYY-MM-DD
    schedule_time: str = None  # HH:MM
    user_id: str = None  # User identifier (email or username)
    user_name: str = None  # Display name
    brand: str = None  # Brand name ("gymcollege" or "healthycollege")
    variant: str = None  # Variant type ("light" or "dark")


@router.post("/publish")
async def publish_reel(request: PublishRequest):
    """
    Publish a reel immediately or schedule for later.
    
    If schedule_date and schedule_time are provided, schedules for later.
    Otherwise, publishes immediately.
    Uses brand-specific Instagram credentials if brand is provided.
    """
    try:
        # Get brand-specific configuration if brand provided
        brand_config = None
        if request.brand:
            brand_config = get_brand_config_from_name(request.brand)
        
        # Get base directory
        base_dir = Path(__file__).resolve().parent.parent.parent
        video_path = base_dir / "output" / "videos" / f"{request.reel_id}.mp4"
        thumbnail_path = base_dir / "output" / "thumbnails" / f"{request.reel_id}.png"
        
        # Check if files exist
        if not video_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video not found for reel ID: {request.reel_id}"
            )
        
        if not thumbnail_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Thumbnail not found for reel ID: {request.reel_id}"
            )
        
        # Check if scheduling or immediate publish
        if request.schedule_date and request.schedule_time:
            # Schedule for later
            from datetime import datetime
            
            scheduled_datetime = datetime.strptime(
                f"{request.schedule_date} {request.schedule_time}",
                "%Y-%m-%d %H:%M"
            )
            
            result = scheduler_service.schedule_reel(
                user_id=request.user_id or "default_user",
                reel_id=request.reel_id,
                scheduled_time=scheduled_datetime,
                caption=request.caption,
                platforms=request.platforms,
                video_path=video_path,
                thumbnail_path=thumbnail_path,
                user_name=request.user_name,
                brand=request.brand,
                variant=request.variant
            )
            
            return {
                "status": "scheduled",
                "reel_id": request.reel_id,
                "scheduled_for": scheduled_datetime.isoformat(),
                "platforms": request.platforms,
                "message": f"Reel scheduled for {request.schedule_date} at {request.schedule_time}"
            }
        else:
            # Publish immediately
            results = scheduler_service.publish_now(
                video_path=video_path,
                thumbnail_path=thumbnail_path,
                caption=request.caption,
                platforms=request.platforms,
                user_id=request.user_id,
                brand_config=brand_config
            )
            
            return {
                "status": "published",
                "reel_id": request.reel_id,
                "results": results
            }
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid request: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to publish reel: {str(e)}"
        )


# User Management Endpoints

class UserCreateRequest(BaseModel):
    user_id: str
    user_name: str
    email: Optional[str] = None
    instagram_business_account_id: Optional[str] = None
    facebook_page_id: Optional[str] = None
    meta_access_token: Optional[str] = None


@router.post("/users")
async def create_user(request: UserCreateRequest):
    """
    Create or update a user profile with Instagram/Facebook credentials.
    
    This allows multiple users to share the system with their own credentials.
    """
    try:
        user = scheduler_service.get_or_create_user(
            user_id=request.user_id,
            user_name=request.user_name,
            email=request.email,
            instagram_account_id=request.instagram_business_account_id,
            facebook_page_id=request.facebook_page_id,
            meta_access_token=request.meta_access_token
        )
        
        return {
            "status": "success",
            "user": user
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create/update user: {str(e)}"
        )


@router.get("/users/{user_id}")
async def get_user(user_id: str):
    """Get user profile information (without tokens)."""
    try:
        from app.db_connection import get_db_session
        from app.models import UserProfile
        
        with get_db_session() as db:
            user = db.query(UserProfile).filter(
                UserProfile.user_id == user_id
            ).first()
            
            if not user:
                raise HTTPException(
                    status_code=404,
                    detail=f"User {user_id} not found"
                )
            
            return user.to_dict(include_tokens=False)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get user: {str(e)}"
        )


@router.get("/next-slot/{brand}/{variant}")
async def get_next_available_slot(brand: str, variant: str):
    """
    Get the next available scheduling slot for a brand+variant combination.
    
    Slot Rules:
    - Light mode: 12 AM, 8 AM, 4 PM (every 8 hours)
    - Dark mode: 4 AM, 12 PM, 8 PM (every 8 hours)
    
    Each brand maintains its own independent schedule.
    Starting from January 16, 2026 or today (whichever is later).
    """
    try:
        if brand.lower() not in ["gymcollege", "healthycollege"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid brand: {brand}. Must be 'gymcollege' or 'healthycollege'"
            )
        
        if variant.lower() not in ["light", "dark"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid variant: {variant}. Must be 'light' or 'dark'"
            )
        
        next_slot = scheduler_service.get_next_available_slot(
            brand=brand.lower(),
            variant=variant.lower()
        )
        
        return {
            "brand": brand.lower(),
            "variant": variant.lower(),
            "next_slot": next_slot.isoformat(),
            "date": next_slot.strftime("%Y-%m-%d"),
            "time": next_slot.strftime("%H:%M"),
            "human_readable": next_slot.strftime("%B %d, %Y at %I:%M %p")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get next slot: {str(e)}"
        )


@router.get("/next-slots")
async def get_all_next_slots():
    """
    Get the next available slots for all brand+variant combinations.
    
    Returns next slots for:
    - gymcollege light
    - gymcollege dark  
    - healthycollege light
    - healthycollege dark
    """
    try:
        slots = {}
        
        for brand in ["gymcollege", "healthycollege"]:
            slots[brand] = {}
            for variant in ["light", "dark"]:
                next_slot = scheduler_service.get_next_available_slot(
                    brand=brand,
                    variant=variant
                )
                slots[brand][variant] = {
                    "next_slot": next_slot.isoformat(),
                    "date": next_slot.strftime("%Y-%m-%d"),
                    "time": next_slot.strftime("%H:%M"),
                    "human_readable": next_slot.strftime("%B %d, %Y at %I:%M %p")
                }
        
        return {
            "slots": slots,
            "slot_rules": {
                "light": ["00:00", "08:00", "16:00"],
                "dark": ["04:00", "12:00", "20:00"]
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get next slots: {str(e)}"
        )


# ==================== POST IMAGE SCHEDULING ====================

class SchedulePostImageRequest(BaseModel):
    brand: str
    title: str
    caption: str = ""  # Full caption text for Instagram
    image_data: str  # base64 PNG (may include data:image/png;base64, prefix) — cover slide
    carousel_images: list[str] = []  # base64 PNG images for carousel text slides (slides 2-4)
    slide_texts: list[str] = []  # text content for each carousel slide
    schedule_time: str  # ISO datetime string

@router.post("/schedule-post-image")
async def schedule_post_image(request: SchedulePostImageRequest):
    """Schedule a single post image for a specific brand at a given time."""
    try:
        from datetime import datetime
        
        print(f"\n{'='*80}")
        print(f"📸 SCHEDULING POST IMAGE")
        print(f"   Brand: {request.brand}")
        print(f"   Title: {request.title[:60]}...")
        print(f"   Schedule: {request.schedule_time}")
        print(f"{'='*80}")
        
        # Generate unique post ID
        post_id = f"post_{request.brand}_{str(uuid.uuid4())[:8]}"
        
        # Decode and save image
        base_dir = Path(__file__).resolve().parent.parent.parent
        posts_dir = base_dir / "output" / "posts"
        posts_dir.mkdir(parents=True, exist_ok=True)
        
        image_path = posts_dir / f"{post_id}.png"
        
        # Remove data URL prefix if present
        image_b64 = request.image_data
        if ',' in image_b64:
            image_b64 = image_b64.split(',', 1)[1]
        
        image_bytes = base64.b64decode(image_b64)
        image_path.write_bytes(image_bytes)
        print(f"   💾 Saved cover image: {image_path} ({len(image_bytes)} bytes)")
        
        # Save carousel text slide images (if any)
        carousel_paths = []
        for slide_i, slide_b64 in enumerate(request.carousel_images):
            slide_path = posts_dir / f"{post_id}_slide{slide_i + 1}.png"
            s_b64 = slide_b64
            if ',' in s_b64:
                s_b64 = s_b64.split(',', 1)[1]
            slide_bytes = base64.b64decode(s_b64)
            slide_path.write_bytes(slide_bytes)
            carousel_paths.append(str(slide_path))
            print(f"   💾 Saved slide {slide_i + 1}: {slide_path} ({len(slide_bytes)} bytes)")
        
        total_slides = 1 + len(carousel_paths)
        print(f"   📄 Total carousel slides: {total_slides}")
        
        # Parse schedule time
        schedule_dt = datetime.fromisoformat(request.schedule_time.replace('Z', '+00:00'))
        if schedule_dt.tzinfo is not None:
            schedule_dt = schedule_dt.replace(tzinfo=None)
        
        # Schedule using existing scheduler (post = image only, no video)
        result = scheduler_service.schedule_reel(
            user_id="web_user",
            reel_id=post_id,
            scheduled_time=schedule_dt,
            video_path=None,
            thumbnail_path=image_path,
            caption=request.caption or request.title,
            platforms=["instagram", "facebook"],
            user_name="Web Interface User",
            brand=request.brand,
            variant="carousel" if carousel_paths else "post"
        )
        
        # Store carousel metadata alongside the schedule
        if carousel_paths:
            carousel_meta_path = posts_dir / f"{post_id}_carousel.json"
            import json as json_mod
            carousel_meta_path.write_text(json_mod.dumps({
                "cover": str(image_path),
                "slides": carousel_paths,
                "slide_texts": request.slide_texts,
                "total_slides": total_slides,
            }, indent=2))
        
        print(f"   ✅ Scheduled successfully! ID: {result.get('schedule_id')}")
        print(f"{'='*80}\n")
        
        return {
            "status": "scheduled",
            "post_id": post_id,
            "brand": request.brand,
            "scheduled_for": schedule_dt.isoformat(),
            "schedule_id": result.get("schedule_id")
        }
        
    except Exception as e:
        print(f"   ❌ Failed to schedule post: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to schedule post image: {str(e)}"
        )


# ==================== POST SCHEDULE COLLISION DETECTION ====================

@router.get("/scheduled/occupied-post-slots")
async def get_occupied_post_slots():
    """
    Return all occupied post slots (variant='post') grouped by brand.
    Frontend uses this to avoid scheduling collisions.
    """
    try:
        all_scheduled = scheduler_service.get_all_scheduled()
        
        # Build dict of brand -> list of ISO datetime strings
        occupied: dict[str, list[str]] = {}
        
        for schedule in all_scheduled:
            metadata = schedule.get("metadata", {})
            if metadata.get("variant") != "post":
                continue
            status = schedule.get("status", "")
            if status not in ("scheduled", "publishing"):
                continue
            brand = metadata.get("brand", "unknown").lower()
            sched_time = schedule.get("scheduled_time")
            if sched_time:
                if brand not in occupied:
                    occupied[brand] = []
                # Normalise to ISO string
                if hasattr(sched_time, 'isoformat'):
                    occupied[brand].append(sched_time.isoformat())
                else:
                    occupied[brand].append(str(sched_time))
        
        return {"occupied": occupied}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scheduled/clean-reel-slots")
async def clean_reel_slots():
    """
    Reel Scheduler Cleaner: ensures every scheduled reel sits on its correct
    brand slot (brand offset + base 4-hour pattern, alternating light/dark).
    
    Two fixes:
    1. Reels on WRONG slots (hour doesn't match brand's valid reel hours) → move to next valid slot
    2. COLLISIONS (multiple reels at same brand+time) → keep first, move extras to next valid slot
    """
    try:
        from datetime import timedelta, datetime as dt

        BRAND_REEL_OFFSETS = {
            "holisticcollege": 0,
            "healthycollege": 1,
            "vitalitycollege": 2,
            "longevitycollege": 3,
            "wellbeingcollege": 4,
        }

        # Base slot pattern (every 4 hours, alternating L/D)
        BASE_SLOTS = [
            (0, "light"),   # 12 AM
            (4, "dark"),    # 4 AM
            (8, "light"),   # 8 AM
            (12, "dark"),   # 12 PM
            (16, "light"),  # 4 PM
            (20, "dark"),   # 8 PM
        ]

        def get_reel_slots_for_brand(brand: str) -> list[tuple[int, str]]:
            """Return list of (hour, variant) for valid reel slots for a brand."""
            offset = BRAND_REEL_OFFSETS.get(brand, 0)
            return [((hour + offset) % 24, variant) for hour, variant in BASE_SLOTS]

        def get_valid_hours_for_brand(brand: str) -> set[int]:
            """Return set of valid hours for a brand's reel slots."""
            return {h for h, _ in get_reel_slots_for_brand(brand)}

        def get_expected_variant(brand: str, hour: int) -> str:
            """Given a brand and hour, return the expected variant (light/dark)."""
            for h, v in get_reel_slots_for_brand(brand):
                if h == hour:
                    return v
            return "light"  # fallback

        def find_next_valid_reel_slot(brand: str, variant: str, after: dt, occupied: set[str]) -> dt:
            """Find next unoccupied valid reel slot for brand+variant after given time."""
            slots = get_reel_slots_for_brand(brand)
            matching_hours = [h for h, v in slots if v == variant]
            if not matching_hours:
                matching_hours = [h for h, _ in slots]  # fallback to all

            current_day = after.replace(hour=0, minute=0, second=0, microsecond=0)
            for day_off in range(365):
                check_date = current_day + timedelta(days=day_off)
                for h in matching_hours:
                    candidate = check_date.replace(hour=h, minute=0, second=0, microsecond=0)
                    if candidate <= after:
                        continue
                    key = candidate.strftime("%Y-%m-%d %H:%M")
                    if key not in occupied:
                        return candidate
            # Fallback
            tomorrow = after + timedelta(days=1)
            return tomorrow.replace(hour=matching_hours[0], minute=0, second=0, microsecond=0)

        all_scheduled = scheduler_service.get_all_scheduled()

        # Collect only reel-type scheduled entries (variant != 'post')
        reels: list[dict] = []
        for schedule in all_scheduled:
            metadata = schedule.get("metadata", {})
            variant = metadata.get("variant", "light")
            if variant == "post":
                continue
            status = schedule.get("status", "")
            if status not in ("scheduled", "publishing"):
                continue
            reels.append(schedule)

        # Track all occupied slots per brand
        brand_occupied: dict[str, set[str]] = {}
        for reel in reels:
            metadata = reel.get("metadata", {})
            brand = metadata.get("brand", "unknown").lower()
            sched_time = reel.get("scheduled_time")
            if not sched_time:
                continue
            if hasattr(sched_time, 'strftime'):
                time_key = sched_time.strftime("%Y-%m-%d %H:%M")
            else:
                time_key = str(sched_time)[:16]
            if brand not in brand_occupied:
                brand_occupied[brand] = set()
            brand_occupied[brand].add(time_key)

        wrong_slot_fixed = 0
        collision_fixed = 0
        already_correct = 0
        details: list[str] = []

        # PASS 1: Fix reels on WRONG slots (wrong hour for brand)
        reels_to_keep: list[dict] = []
        for reel in reels:
            metadata = reel.get("metadata", {})
            brand = metadata.get("brand", "unknown").lower()
            variant = metadata.get("variant", "light")
            sched_time = reel.get("scheduled_time")
            schedule_id = reel.get("id") or reel.get("schedule_id")
            if not sched_time or not schedule_id:
                reels_to_keep.append(reel)
                continue

            if not hasattr(sched_time, 'hour'):
                sched_time = dt.fromisoformat(str(sched_time).replace('Z', '+00:00'))
                if sched_time.tzinfo is not None:
                    sched_time = sched_time.replace(tzinfo=None)

            valid_hours = get_valid_hours_for_brand(brand)
            hour = sched_time.hour

            if hour not in valid_hours or sched_time.minute != 0:
                # Wrong slot! Reschedule to next correct slot
                # Remove old slot from occupied
                old_key = sched_time.strftime("%Y-%m-%d %H:%M")
                if brand in brand_occupied:
                    brand_occupied[brand].discard(old_key)

                new_time = find_next_valid_reel_slot(
                    brand, variant, sched_time,
                    brand_occupied.get(brand, set())
                )
                new_key = new_time.strftime("%Y-%m-%d %H:%M")
                if brand not in brand_occupied:
                    brand_occupied[brand] = set()
                brand_occupied[brand].add(new_key)

                try:
                    scheduler_service.reschedule(schedule_id, new_time)
                    wrong_slot_fixed += 1
                    details.append(f"Wrong slot: {schedule_id} ({brand}/{variant}) {sched_time} → {new_time}")
                    print(f"   🔧 Wrong slot: {schedule_id} ({brand}/{variant}) {sched_time} → {new_time}")
                    # Update reel's time for pass 2
                    reel["scheduled_time"] = new_time
                except Exception as e:
                    print(f"   ❌ Failed to reschedule {schedule_id}: {e}")
            else:
                # Check variant matches expected for this hour
                expected_variant = get_expected_variant(brand, hour)
                if variant != expected_variant and variant in ("light", "dark"):
                    old_key = sched_time.strftime("%Y-%m-%d %H:%M")
                    if brand in brand_occupied:
                        brand_occupied[brand].discard(old_key)
                    new_time = find_next_valid_reel_slot(
                        brand, variant, sched_time,
                        brand_occupied.get(brand, set())
                    )
                    new_key = new_time.strftime("%Y-%m-%d %H:%M")
                    if brand not in brand_occupied:
                        brand_occupied[brand] = set()
                    brand_occupied[brand].add(new_key)
                    try:
                        scheduler_service.reschedule(schedule_id, new_time)
                        wrong_slot_fixed += 1
                        details.append(f"Wrong variant: {schedule_id} ({brand}/{variant}) {sched_time} → {new_time}")
                        print(f"   🔧 Wrong variant: {schedule_id} ({brand}/{variant}) {sched_time} → {new_time}")
                        reel["scheduled_time"] = new_time
                    except Exception as e:
                        print(f"   ❌ Failed to reschedule {schedule_id}: {e}")

            reels_to_keep.append(reel)

        # PASS 2: Fix COLLISIONS (multiple reels at same brand+time)
        slot_map: dict[str, list[dict]] = {}  # key = "brand|datetime"
        for reel in reels_to_keep:
            metadata = reel.get("metadata", {})
            brand = metadata.get("brand", "unknown").lower()
            sched_time = reel.get("scheduled_time")
            if not sched_time:
                continue
            if hasattr(sched_time, 'strftime'):
                time_key = sched_time.strftime("%Y-%m-%d %H:%M")
            else:
                time_key = str(sched_time)[:16]
            slot_key = f"{brand}|{time_key}"
            if slot_key not in slot_map:
                slot_map[slot_key] = []
            slot_map[slot_key].append(reel)

        for slot_key, entries in slot_map.items():
            if len(entries) <= 1:
                already_correct += 1
                continue
            brand = slot_key.split("|")[0]
            # Keep the first one, reschedule extras
            for extra in entries[1:]:
                schedule_id = extra.get("id") or extra.get("schedule_id")
                sched_time = extra.get("scheduled_time")
                metadata = extra.get("metadata", {})
                variant = metadata.get("variant", "light")
                if not schedule_id or not sched_time:
                    continue
                if not hasattr(sched_time, 'hour'):
                    sched_time = dt.fromisoformat(str(sched_time).replace('Z', '+00:00'))
                    if sched_time.tzinfo is not None:
                        sched_time = sched_time.replace(tzinfo=None)

                new_time = find_next_valid_reel_slot(
                    brand, variant, sched_time,
                    brand_occupied.get(brand, set())
                )
                new_key = new_time.strftime("%Y-%m-%d %H:%M")
                if brand not in brand_occupied:
                    brand_occupied[brand] = set()
                brand_occupied[brand].add(new_key)

                try:
                    scheduler_service.reschedule(schedule_id, new_time)
                    collision_fixed += 1
                    details.append(f"Collision: {schedule_id} ({brand}/{variant}) {sched_time} → {new_time}")
                    print(f"   🔧 Collision fix: {schedule_id} ({brand}/{variant}) {sched_time} → {new_time}")
                except Exception as e:
                    print(f"   ❌ Failed to reschedule {schedule_id}: {e}")

        total_fixed = wrong_slot_fixed + collision_fixed
        message = f"Fixed {total_fixed} reel(s): {wrong_slot_fixed} wrong-slot, {collision_fixed} collision(s). {already_correct} already correct."
        print(f"✅ Reel Scheduler Cleaner: {message}")

        return {
            "status": "ok",
            "wrong_slot_fixed": wrong_slot_fixed,
            "collision_fixed": collision_fixed,
            "total_fixed": total_fixed,
            "already_correct": already_correct,
            "details": details[:50],  # limit detail output
            "message": message
        }

    except Exception as e:
        print(f"❌ Clean reel slots failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scheduled/clean-post-slots")
async def clean_post_slots(posts_per_day: int = 6):
    """
    Post Schedule Cleaner: find collisions (multiple posts at exact same 
    time for any brand) and re-schedule the duplicates to the next valid
    post slot for that brand.
    
    Post slots are dynamically computed: interleaved with reels (2h offset
    from each reel slot), evenly spaced across 24h based on posts_per_day.
    
    For variant='post' only (images). Reels are handled separately.
    """
    try:
        from datetime import timedelta, datetime as dt
        import math
        
        # Brand reel offsets (matching db_scheduler.py)
        BRAND_REEL_OFFSETS = {
            "holisticcollege": 0,
            "healthycollege": 1,
            "vitalitycollege": 2,
            "longevitycollege": 3,
            "wellbeingcollege": 4,
        }
        
        def get_post_slots_for_brand(brand: str, ppd: int) -> list[tuple[int, int]]:
            """Return list of (hour, minute) for valid post slots for a brand."""
            reel_offset = BRAND_REEL_OFFSETS.get(brand, 0)
            gap = 24 / ppd
            slots = []
            for i in range(ppd):
                raw = (reel_offset + 2 + i * gap) % 24
                h = int(raw)
                m = round((raw - h) * 60)
                slots.append((h, m))
            slots.sort(key=lambda s: s[0] * 60 + s[1])
            return slots
        
        def find_next_valid_slot(brand: str, after: dt, occupied: set[str], ppd: int) -> dt:
            """Find next unoccupied valid post slot for brand after given time."""
            slots = get_post_slots_for_brand(brand, ppd)
            current_day = after.replace(hour=0, minute=0, second=0, microsecond=0)
            for day_off in range(90):
                check_date = current_day + timedelta(days=day_off)
                for h, m in slots:
                    candidate = check_date.replace(hour=h, minute=m)
                    if candidate <= after:
                        continue
                    key = candidate.strftime("%Y-%m-%d %H:%M")
                    if key not in occupied:
                        return candidate
            # Fallback: tomorrow first slot
            tomorrow = after + timedelta(days=1)
            h, m = slots[0]
            return tomorrow.replace(hour=h, minute=m, second=0, microsecond=0)
        
        all_scheduled = scheduler_service.get_all_scheduled()
        
        # Collect only post-type scheduled entries that are still pending
        posts_by_slot: dict[str, list[dict]] = {}  # key = "brand|datetime"
        
        for schedule in all_scheduled:
            metadata = schedule.get("metadata", {})
            if metadata.get("variant") != "post":
                continue
            status = schedule.get("status", "")
            if status not in ("scheduled", "publishing"):
                continue
            
            brand = metadata.get("brand", "unknown").lower()
            sched_time = schedule.get("scheduled_time")
            if not sched_time:
                continue
            
            # Round to minute to find exact collisions
            if hasattr(sched_time, 'strftime'):
                time_key = sched_time.strftime("%Y-%m-%d %H:%M")
            else:
                time_key = str(sched_time)[:16]
            
            slot_key = f"{brand}|{time_key}"
            if slot_key not in posts_by_slot:
                posts_by_slot[slot_key] = []
            posts_by_slot[slot_key].append(schedule)
        
        # Find collisions and reschedule duplicates
        fixed = 0
        collisions_found = 0
        
        # Track all occupied slots per brand to avoid re-collisions
        brand_occupied: dict[str, set[str]] = {}
        for slot_key, entries in posts_by_slot.items():
            brand = slot_key.split("|")[0]
            time_key = slot_key.split("|")[1]
            if brand not in brand_occupied:
                brand_occupied[brand] = set()
            brand_occupied[brand].add(time_key)
        
        for slot_key, entries in posts_by_slot.items():
            if len(entries) <= 1:
                continue
            
            collisions_found += len(entries) - 1
            brand = slot_key.split("|")[0]
            
            # Keep the first one, reschedule the rest to next valid post slot
            for extra in entries[1:]:
                schedule_id = extra.get("id") or extra.get("schedule_id")
                sched_time = extra.get("scheduled_time")
                if not schedule_id or not sched_time:
                    continue
                
                if not hasattr(sched_time, 'hour'):
                    sched_time = dt.fromisoformat(str(sched_time).replace('Z', '+00:00'))
                    if sched_time.tzinfo is not None:
                        sched_time = sched_time.replace(tzinfo=None)
                
                # Find next valid post slot for this brand
                new_time = find_next_valid_slot(
                    brand, sched_time,
                    brand_occupied.get(brand, set()),
                    posts_per_day
                )
                
                # Reserve this slot
                if brand not in brand_occupied:
                    brand_occupied[brand] = set()
                brand_occupied[brand].add(new_time.strftime("%Y-%m-%d %H:%M"))
                
                # Update in DB
                try:
                    scheduler_service.reschedule(schedule_id, new_time)
                    fixed += 1
                    print(f"   🔧 Moved {schedule_id} ({brand}) from {sched_time} → {new_time}")
                except Exception as e:
                    print(f"   ❌ Failed to reschedule {schedule_id}: {e}")
        
        return {
            "status": "ok",
            "collisions_found": collisions_found,
            "fixed": fixed,
            "posts_per_day": posts_per_day,
            "message": f"Found {collisions_found} collision(s), fixed {fixed}. Using {posts_per_day} posts/day."
        }
        
    except Exception as e:
        print(f"❌ Clean post slots failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== REJECTION FEEDBACK STORAGE ====================

class RejectionFeedbackRequest(BaseModel):
    category: str  # 'bad_image' | 'bad_topic'
    detail: Optional[str] = None  # 'not_centered' | 'image_bug' | 'image_mismatch'
    note: Optional[str] = None  # Free-text note from user
    title: str
    caption: str = ""
    image_prompt: str = ""
    image_data: str = ""  # base64 PNG from canvas
    brand: Optional[str] = None


@router.post("/rejection-feedback")
async def save_rejection_feedback(request: RejectionFeedbackRequest):
    """Save rejection feedback permanently to server filesystem (output/feedback/).
    Stores JSON metadata + PNG image side by side for later manual review."""
    import json
    from datetime import datetime
    try:
        base_dir = Path(__file__).resolve().parent.parent.parent
        feedback_dir = base_dir / "output" / "feedback"
        feedback_dir.mkdir(parents=True, exist_ok=True)

        feedback_id = f"fb_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{str(uuid.uuid4())[:8]}"

        # Save image if provided
        image_filename = None
        if request.image_data:
            image_b64 = request.image_data
            if ',' in image_b64:
                image_b64 = image_b64.split(',', 1)[1]
            image_bytes = base64.b64decode(image_b64)
            image_path = feedback_dir / f"{feedback_id}.png"
            image_path.write_bytes(image_bytes)
            image_filename = f"{feedback_id}.png"
            print(f"💾 Feedback image saved: {image_path} ({len(image_bytes)} bytes)")

        # Save metadata JSON
        metadata = {
            "id": feedback_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "category": request.category,
            "detail": request.detail,
            "note": request.note,
            "title": request.title,
            "caption": request.caption,
            "image_prompt": request.image_prompt,
            "brand": request.brand,
            "image_file": image_filename,
        }
        json_path = feedback_dir / f"{feedback_id}.json"
        json_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False))
        print(f"📝 Feedback metadata saved: {json_path}")

        return {"status": "saved", "id": feedback_id}

    except Exception as e:
        print(f"❌ Failed to save rejection feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rejection-feedback")
async def list_rejection_feedback():
    """List all stored rejection feedback entries."""
    import json
    try:
        base_dir = Path(__file__).resolve().parent.parent.parent
        feedback_dir = base_dir / "output" / "feedback"
        if not feedback_dir.exists():
            return {"feedback": [], "count": 0}

        entries = []
        for json_file in sorted(feedback_dir.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True):
            try:
                data = json.loads(json_file.read_text())
                entries.append(data)
            except Exception:
                continue

        return {"feedback": entries, "count": len(entries)}

    except Exception as e:
        print(f"❌ Failed to list rejection feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

