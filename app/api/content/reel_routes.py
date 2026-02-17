"""
Reel creation API routes.
"""
import os
import uuid
import tempfile
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.schemas import ReelCreateRequest, ReelCreateResponse, ErrorResponse
from app.services.media.image_generator import ImageGenerator
from app.services.media.video_generator import VideoGenerator
from app.services.media.caption_builder import CaptionBuilder
from app.services.publishing.scheduler import DatabaseSchedulerService
from app.services.brands.resolver import brand_resolver
from app.db_connection import get_db
from app.models.jobs import GenerationJob
from app.core.config import BrandType
from app.services.storage.supabase_storage import (
    upload_from_path, storage_path, StorageError,
)
from app.api.auth.middleware import get_current_user
class SimpleReelRequest(BaseModel):
    title: str
    content_lines: List[str]
    brand: str = "gymcollege"
    variant: str = "light"
    ai_prompt: Optional[str] = None  # Optional custom AI prompt for dark mode
    cta_type: Optional[str] = "sleep_lean"  # CTA option for caption


class DownloadRequest(BaseModel):
    reel_id: str
    brand: str = "gymcollege"


# Create router
router = APIRouter()

# Initialize services
scheduler_service = DatabaseSchedulerService()


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
async def create_reel(request: ReelCreateRequest, user: dict = Depends(get_current_user)) -> ReelCreateResponse:
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
        user_id = user["id"]
        brand_slug = request.brand.value if hasattr(request.brand, 'value') else str(request.brand)
        
        # Create temp files for generators that need paths
        tmp_thumb = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
        tmp_reel = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
        tmp_video = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
        tmp_thumb.close(); tmp_reel.close(); tmp_video.close()
        thumbnail_path = Path(tmp_thumb.name)
        reel_image_path = Path(tmp_reel.name)
        video_path = Path(tmp_video.name)
        
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
        
        # Upload to Supabase Storage
        try:
            thumb_remote = storage_path(user_id, brand_slug, "thumbnails", f"{reel_id}.png")
            thumbnail_url = upload_from_path("media", thumb_remote, str(thumbnail_path))
        except StorageError as e:
            print(f"Thumbnail upload failed: {e}"); thumbnail_url = ""
        try:
            reel_remote = storage_path(user_id, brand_slug, "reels", f"{reel_id}.png")
            reel_image_url = upload_from_path("media", reel_remote, str(reel_image_path))
        except StorageError as e:
            print(f"Reel image upload failed: {e}"); reel_image_url = ""
        try:
            video_remote = storage_path(user_id, brand_slug, "videos", f"{reel_id}.mp4")
            video_url = upload_from_path("media", video_remote, str(video_path))
        except StorageError as e:
            print(f"Video upload failed: {e}"); video_url = ""

        # Clean up temp files
        for tmp in [thumbnail_path, reel_image_path, video_path]:
            try:
                os.unlink(tmp)
            except OSError:
                pass

        # Step 5: Handle scheduling if provided
        if request.schedule_at:
            try:
                scheduler_service.schedule_reel(
                    user_id=user_id,
                    reel_id=reel_id,
                    scheduled_time=request.schedule_at,
                    video_path=video_url,
                    thumbnail_path=thumbnail_url,
                    caption=caption,
                    brand=brand_slug,
                )
            except Exception as e:
                # Scheduling failure shouldn't fail the entire request
                # Log the error but continue
                print(f"Warning: Failed to schedule reel: {str(e)}")
        
        # Return response with Supabase URLs
        return ReelCreateResponse(
            thumbnail_path=thumbnail_url,
            reel_image_path=reel_image_url,
            video_path=video_url,
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


@router.post(
    "/generate",
    summary="Generate reel (simple interface)",
    description="Simplified endpoint for web interface - generates thumbnail, reel image, and video"
)
async def generate_reel(request: SimpleReelRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """
    Generate reel images and video from title and content lines.
    
    Simplified endpoint for web interface testing.
    """
    try:
        # Generate unique ID
        reel_id = str(uuid.uuid4())[:8]
        user_id = user["id"]
        brand_slug = request.brand
        
        # Create database record
        job = GenerationJob(
            job_id=reel_id,
            user_id=user_id,
            title=request.title,
            content_lines=request.content_lines,
            brands=[request.brand],
            variant=request.variant,
            ai_prompt=request.ai_prompt,
            status="generating",
        )
        db.add(job)
        db.commit()
        
        # Create temp files for generators
        tmp_thumb = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
        tmp_reel = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
        tmp_video = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
        tmp_thumb.close(); tmp_reel.close(); tmp_video.close()
        thumbnail_path = Path(tmp_thumb.name)
        reel_image_path = Path(tmp_reel.name)
        video_path = Path(tmp_video.name)
        
        # Parse brand - resolve dynamically from DB
        brand_id = brand_resolver.resolve_brand_name(request.brand)
        brand = brand_resolver.get_brand_type(brand_id) if brand_id else BrandType.HEALTHY_COLLEGE
        
        # Update progress
        job.current_step = "initializing"
        job.progress_percent = 5
        db.commit()
        
        # Initialize image generator with variant and optional AI prompt
        image_generator = ImageGenerator(
            brand, 
            variant=request.variant, 
            brand_name=request.brand,
            ai_prompt=request.ai_prompt
        )
        
        # Generate thumbnail
        job.current_step = "thumbnail"
        job.progress_percent = 20
        db.commit()
        image_generator.generate_thumbnail(
            title=request.title,
            output_path=thumbnail_path
        )
        
        # Generate reel image
        job.current_step = "content"
        job.progress_percent = 50
        db.commit()
        image_generator.generate_reel_image(
            title=request.title,
            lines=request.content_lines,
            output_path=reel_image_path,
            cta_type=request.cta_type
        )
        
        # Generate video with random duration and music
        job.current_step = "video"
        job.progress_percent = 75
        db.commit()
        video_generator = VideoGenerator()
        video_generator.generate_reel_video(
            reel_image_path=reel_image_path,
            output_path=video_path
        )
        
        # Generate caption
        job.current_step = "caption"
        job.progress_percent = 90
        db.commit()
        caption_builder = CaptionBuilder()
        caption = caption_builder.build_caption(
            title=request.title,
            lines=request.content_lines
        )
        
        # Upload to Supabase Storage
        try:
            thumb_remote = storage_path(user_id, brand_slug, "thumbnails", f"{reel_id}.png")
            thumbnail_url = upload_from_path("media", thumb_remote, str(thumbnail_path))
        except StorageError as e:
            print(f"Thumbnail upload failed: {e}"); thumbnail_url = ""
        try:
            video_remote = storage_path(user_id, brand_slug, "videos", f"{reel_id}.mp4")
            video_url = upload_from_path("media", video_remote, str(video_path))
        except StorageError as e:
            print(f"Video upload failed: {e}"); video_url = ""
        try:
            reel_remote = storage_path(user_id, brand_slug, "reels", f"{reel_id}.png")
            reel_image_url = upload_from_path("media", reel_remote, str(reel_image_path))
        except StorageError as e:
            print(f"Reel image upload failed: {e}"); reel_image_url = ""

        # Clean up temp files
        for tmp in [thumbnail_path, reel_image_path, video_path]:
            try:
                os.unlink(tmp)
            except OSError:
                pass
        
        # Update database with completion
        job.status = "completed"
        job.current_step = "completed"
        job.progress_percent = 100
        job.brand_outputs = {
            request.brand: {
                "reel_id": reel_id,
                "thumbnail": thumbnail_url,
                "video": video_url,
                "status": "completed",
            }
        }
        db.commit()
        
        # Return Supabase URLs
        return {
            "thumbnail_path": thumbnail_url,
            "reel_image_path": reel_image_url,
            "video_path": video_url,
            "caption": caption,
            "reel_id": reel_id
        }
        
    except Exception as e:
        # Update database with error
        if 'reel_id' in locals():
            job = db.query(GenerationJob).filter(GenerationJob.job_id == reel_id).first()
            if job:
                job.status = "failed"
                job.error_message = str(e)
                db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate reel: {str(e)}"
        )


@router.post(
    "/download",
    summary="Download reel (deprecated)",
    description="This endpoint is deprecated. Reel files are stored in Supabase Storage."
)
async def download_reel(request: DownloadRequest):
    """Deprecated: Reels are now stored exclusively in Supabase Storage."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Local download is no longer supported. Access reels via their Supabase Storage URLs."
    )
