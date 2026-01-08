"""
API routes for the reels automation service.
"""
import uuid
import shutil
import asyncio
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from app.api.schemas import ReelCreateRequest, ReelCreateResponse, ErrorResponse
from app.services.image_generator import ImageGenerator
from app.services.video_generator import VideoGenerator
from app.services.caption_builder import CaptionBuilder
from app.services.db_scheduler import DatabaseSchedulerService
from app.services.social_publisher import SocialPublisher
from app.database.db import ReelDatabase
from app.core.config import BrandType, BRAND_CONFIGS, BrandConfig


# Simple request model for web interface
class SimpleReelRequest(BaseModel):
    title: str
    content_lines: List[str]
    brand: str = "gymcollege"
    variant: str = "light"
    ai_prompt: Optional[str] = None  # Optional custom AI prompt for dark mode


class DownloadRequest(BaseModel):
    reel_id: str
    brand: str = "gymcollege"


# Create router
router = APIRouter(prefix="/reels", tags=["reels"])

# Initialize services (will be reused across requests)
scheduler_service = DatabaseSchedulerService()
db = ReelDatabase()


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
        "healthycollege": BrandType.WELLNESS_LIFE,
        "the_gym_college": BrandType.THE_GYM_COLLEGE,
        "wellness_life": BrandType.WELLNESS_LIFE,
    }
    brand_type = brand_mapping.get(brand_name.lower())
    if brand_type:
        return BRAND_CONFIGS.get(brand_type)
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
                output_path=reel_image_path
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
            "healthycollege": BrandType.THE_GYM_COLLEGE,  # TODO: Add new brand type
            "fitness_pro": BrandType.FITNESS_PRO,
            "wellness_life": BrandType.WELLNESS_LIFE,
        }
        brand = brand_mapping.get(request.brand.lower(), BrandType.THE_GYM_COLLEGE)
        
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
            output_path=reel_image_path
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
            formatted_schedules.append({
                "schedule_id": schedule.get("schedule_id"),
                "reel_id": schedule.get("reel_id"),
                "scheduled_time": schedule.get("scheduled_time"),
                "status": schedule.get("status"),
                "platforms": schedule.get("metadata", {}).get("platforms", []),
                "caption": schedule.get("caption"),
                "created_at": schedule.get("created_at"),
                "published_at": schedule.get("published_at"),
                "error": schedule.get("publish_error")
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


class PublishRequest(BaseModel):
    reel_id: str
    caption: str = "CHANGE ME"
    platforms: list[str] = ["instagram"]  # ["instagram", "facebook"]
    schedule_date: str = None  # YYYY-MM-DD
    schedule_time: str = None  # HH:MM
    user_id: str = None  # User identifier (email or username)
    user_name: str = None  # Display name
    brand: str = None  # Brand name ("gymcollege" or "healthycollege")


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
                user_name=request.user_name
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
