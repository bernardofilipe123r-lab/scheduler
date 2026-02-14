"""
Reel creation API routes.
"""
import uuid
import shutil
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.schemas import ReelCreateRequest, ReelCreateResponse, ErrorResponse
from app.services.image_generator import ImageGenerator
from app.services.video_generator import VideoGenerator
from app.services.caption_builder import CaptionBuilder
from app.services.db_scheduler import DatabaseSchedulerService
from app.services.brand_resolver import brand_resolver
from app.db_connection import get_db
from app.models.jobs import GenerationJob
from app.core.config import BrandType


# Pydantic models
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


@router.post(
    "/generate",
    summary="Generate reel (simple interface)",
    description="Simplified endpoint for web interface - generates thumbnail, reel image, and video"
)
async def generate_reel(request: SimpleReelRequest, db: Session = Depends(get_db)):
    """
    Generate reel images and video from title and content lines.
    
    Simplified endpoint for web interface testing.
    """
    try:
        # Generate unique ID
        reel_id = str(uuid.uuid4())[:8]
        
        # Create database record
        job = GenerationJob(
            job_id=reel_id,
            user_id="web",
            title=request.title,
            content_lines=request.content_lines,
            brands=[request.brand],
            variant=request.variant,
            ai_prompt=request.ai_prompt,
            status="generating",
        )
        db.add(job)
        db.commit()
        
        # Get base directory
        base_dir = Path(__file__).resolve().parent.parent.parent
        
        # Define output paths
        thumbnail_path = base_dir / "output" / "thumbnails" / f"{reel_id}.png"
        reel_image_path = base_dir / "output" / "reels" / f"{reel_id}.png"
        video_path = base_dir / "output" / "videos" / f"{reel_id}.mp4"
        
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
        
        # Update database with completion
        job.status = "completed"
        job.current_step = "completed"
        job.progress_percent = 100
        job.brand_outputs = {
            request.brand: {
                "reel_id": reel_id,
                "thumbnail": f"/output/thumbnails/{reel_id}.png",
                "video": f"/output/videos/{reel_id}.mp4",
                "status": "completed",
            }
        }
        db.commit()
        
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
