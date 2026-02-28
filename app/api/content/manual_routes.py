"""
Manual content scheduling routes.

Handles user-uploaded reels and carousels (no Toby involvement).
Users can upload pre-produced video/images, choose platforms, and schedule for publishing.
All content created via these routes is marked with created_by="user" flag.
"""
import uuid
import base64
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import (
    APIRouter, HTTPException, status, Depends, UploadFile, File, Form
)
from sqlalchemy.orm import Session

from app.api.auth.middleware import get_current_user
from app.db_connection import get_db
from app.models.scheduling import ScheduledReel
from app.models.brands import Brand
from app.models.youtube import YouTubeChannel
from app.services.storage.supabase_storage import (
    upload_bytes, storage_path, StorageError,
)

router = APIRouter()


# ============================================================================
# Pydantic Models
# ============================================================================

class ManualUploadRequest(BaseModel):
    """Request to manually upload and schedule content."""
    brand_id: str
    caption: str
    platforms: List[str] = Field(
        ...,
        description="List of platforms to publish to (instagram, facebook, youtube, threads, tiktok)"
    )
    scheduled_time: str = Field(
        ...,
        description="ISO datetime string for when to publish"
    )
    social_media: Optional[str] = Field(
        None,
        description="Specific social media account (for brands with multiple accounts)"
    )


class ManualEditRequest(BaseModel):
    """Request to edit a manually scheduled post."""
    caption: Optional[str] = None
    platforms: Optional[List[str]] = None
    scheduled_time: Optional[str] = None
    brand_id: Optional[str] = None
    social_media: Optional[str] = None


class GetConnectedPlatformsResponse(BaseModel):
    """Response with user's connected platforms per brand."""
    brand_id: str
    display_name: str
    platforms: List[dict]  # [{"name": "instagram", "handle": "@xyz", "connected": true}, ...]


# ============================================================================
# Helper Functions
# ============================================================================

def _get_user_brands(db: Session, user_id: str) -> List[Brand]:
    """Get all active brands for a user."""
    return db.query(Brand).filter(
        Brand.user_id == user_id,
        Brand.active == True
    ).all()


def _get_connected_platforms(brand: Brand, db: Optional[Session] = None) -> List[dict]:
    """Get list of connected platforms for a brand."""
    platforms = []
    
    # Instagram — accept either instagram_access_token OR meta_access_token
    ig_connected = bool(
        brand.instagram_business_account_id and
        (brand.instagram_access_token or brand.meta_access_token)
    )
    if ig_connected:
        platforms.append({
            "name": "instagram",
            "handle": brand.instagram_handle or "Not set",
            "connected": True,
        })
    
    # Facebook
    if brand.facebook_page_id and brand.facebook_access_token:
        platforms.append({
            "name": "facebook",
            "handle": brand.facebook_page_name or "Not set",
            "connected": True,
        })
    
    # YouTube — stored in a separate YouTubeChannel table
    if db is not None:
        yt_channel = db.query(YouTubeChannel).filter(
            YouTubeChannel.brand == brand.id,
            YouTubeChannel.status == "connected",
        ).first()
        if yt_channel:
            platforms.append({
                "name": "youtube",
                "handle": yt_channel.channel_name or "Not set",
                "connected": True,
            })
    
    # Threads
    if brand.threads_access_token:
        platforms.append({
            "name": "threads",
            "handle": brand.threads_username or "Not set",
            "connected": True,
        })
    
    # TikTok
    if brand.tiktok_access_token:
        platforms.append({
            "name": "tiktok",
            "handle": brand.tiktok_username or "Not set",
            "connected": True,
        })
    
    return platforms


def _validate_scheduled_time(scheduled_time_str: str) -> datetime:
    """
    Parse and validate scheduled time.
    
    Must be in future (at least 1 minute from now).
    """
    try:
        scheduled_time = datetime.fromisoformat(
            scheduled_time_str.replace('Z', '+00:00')
        )
        
        # Convert to UTC and strip timezone for comparison
        if scheduled_time.tzinfo is not None:
            scheduled_time = scheduled_time.astimezone(timezone.utc)
            scheduled_time = scheduled_time.replace(tzinfo=None)
        
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if scheduled_time <= now:
            raise ValueError("Must be scheduled for at least 1 minute in the future")
        
        return scheduled_time
    except (ValueError, TypeError) as e:
        raise ValueError(f"Invalid datetime format: {str(e)}")


def _detect_content_type(filename: str) -> str:
    """
    Detect if upload is a reel (video) or carousel (images).
    
    Based on file extension:
    - Video formats (.mp4, .mov, .avi, .webm) → "reel"
    - Image formats (.jpg, .png, .webp) → "carousel"
    """
    suffix = Path(filename).suffix.lower()
    
    video_extensions = {'.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv'}
    image_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'}
    
    if suffix in video_extensions:
        return "reel"
    elif suffix in image_extensions:
        return "carousel"
    else:
        raise ValueError(f"Unsupported file type: {suffix}")


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/connected-platforms")
async def get_connected_platforms(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
) -> List[GetConnectedPlatformsResponse]:
    """
    Get all connected platforms for all user brands.
    
    Returns which platforms each brand is connected to, so frontend
    can show available options when scheduling.
    """
    try:
        brands = _get_user_brands(db, user["id"])
        
        result = []
        for brand in brands:
            platforms = _get_connected_platforms(brand, db)
            result.append(GetConnectedPlatformsResponse(
                brand_id=brand.id,
                display_name=brand.display_name,
                platforms=platforms
            ))
        
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get connected platforms: {str(e)}"
        )


@router.post("/upload-and-schedule")
async def upload_and_schedule(
    brand_id: str = Form(...),
    caption: str = Form(...),
    platforms: str = Form(...),  # JSON array as string
    scheduled_time: str = Form(...),
    social_media: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Upload a reel or carousel image and schedule for publishing.
    
    Flow:
    1. Detect content type from file extension (reel vs carousel)
    2. Upload file to Supabase storage
    3. Create ScheduledReel entry with created_by="user"
    4. Return schedule_id for frontend reference
    
    Args:
        brand_id: Brand to publish as
        caption: Caption/description for the post
        platforms: JSON array of platforms ["instagram", "facebook", ...]
        scheduled_time: ISO datetime string (must be in future)
        social_media: Optional specific social media handle to use
        file: The video or image file to upload
    """
    import json
    
    try:
        # Validate brand
        brand = db.query(Brand).filter(
            Brand.id == brand_id,
            Brand.user_id == user["id"],
            Brand.active == True
        ).first()
        
        if not brand:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Brand '{brand_id}' not found or not accessible"
            )
        
        # Parse platforms
        try:
            platforms_list = json.loads(platforms)
            if not isinstance(platforms_list, list):
                raise ValueError("Platforms must be a JSON array")
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid platforms JSON"
            )
        
        # Validate platforms are connected
        connected = {p["name"] for p in _get_connected_platforms(brand)}
        for plat in platforms_list:
            if plat not in connected:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Platform '{plat}' is not connected for brand '{brand_id}'"
                )
        
        # Validate scheduled time
        try:
            scheduled_dt = _validate_scheduled_time(scheduled_time)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        
        # Detect content type
        try:
            content_type = _detect_content_type(file.filename)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        
        # Read file content
        file_content = await file.read()
        if not file_content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is empty"
            )
        
        # Upload to Supabase storage
        file_ext = Path(file.filename).suffix.lower()
        upload_path = storage_path(
            user["id"],
            brand_id,
            "manual-content",
            f"{str(uuid.uuid4())}{file_ext}"
        )
        
        mime_type = "video/mp4" if content_type == "reel" else "image/png"
        try:
            file_url = upload_bytes("media", upload_path, file_content, mime_type)
        except StorageError as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload file to storage: {str(e)}"
            )
        
        # Create ScheduledReel entry with created_by="user"
        schedule_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        scheduled_entry = ScheduledReel(
            schedule_id=schedule_id,
            user_id=user["id"],
            user_name=user.get("email", "Web User"),
            reel_id=f"manual_{brand_id}_{str(uuid.uuid4())[:8]}",
            caption=caption,
            scheduled_time=scheduled_dt,
            created_at=now,
            status="scheduled",
            published_at=None,
            publish_error=None,
            created_by="user",  # CRITICAL: Mark as user-created
            extra_data={
                "brand": brand_id,
                "content_type": content_type,
                "platforms": platforms_list,
                "social_media": social_media,
                "file_url": file_url,
                "manual": True,  # Flag for frontend differentiation
            }
        )
        
        # Save to database
        if content_type == "reel":
            scheduled_entry.extra_data["video_path"] = file_url
        else:
            scheduled_entry.extra_data["carousel_paths"] = [file_url]
            scheduled_entry.extra_data["thumbnail_path"] = file_url
        
        db.add(scheduled_entry)
        db.commit()
        
        return {
            "status": "scheduled",
            "schedule_id": schedule_id,
            "content_type": content_type,
            "brand_id": brand_id,
            "platforms": platforms_list,
            "scheduled_for": scheduled_dt.isoformat(),
            "file_url": file_url,
            "caption": caption,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload and schedule content: {str(e)}"
        )


@router.get("/manual/{schedule_id}")
async def get_manual_schedule(
    schedule_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Get details of a manually scheduled post."""
    try:
        scheduled = db.query(ScheduledReel).filter(
            ScheduledReel.schedule_id == schedule_id,
            ScheduledReel.user_id == user["id"],
            ScheduledReel.created_by == "user"
        ).first()
        
        if not scheduled:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Manual schedule '{schedule_id}' not found"
            )
        
        extra = scheduled.extra_data or {}
        return {
            "schedule_id": scheduled.schedule_id,
            "caption": scheduled.caption,
            "brand_id": extra.get("brand"),
            "platforms": extra.get("platforms", []),
            "scheduled_time": scheduled.scheduled_time.isoformat(),
            "status": scheduled.status,
            "content_type": extra.get("content_type"),
            "file_url": extra.get("file_url"),
            "social_media": extra.get("social_media"),
            "created_at": scheduled.created_at.isoformat(),
            "published_at": scheduled.published_at.isoformat() if scheduled.published_at else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get schedule: {str(e)}"
        )


@router.patch("/manual/{schedule_id}")
async def edit_manual_schedule(
    schedule_id: str,
    request: ManualEditRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Edit a manually scheduled post.
    
    Can update: caption, platforms, scheduled_time, brand_id, social_media
    """
    try:
        scheduled = db.query(ScheduledReel).filter(
            ScheduledReel.schedule_id == schedule_id,
            ScheduledReel.user_id == user["id"],
            ScheduledReel.created_by == "user"
        ).first()
        
        if not scheduled:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Manual schedule '{schedule_id}' not found"
            )
        
        # Can't edit already published content
        if scheduled.status in ["published", "publishing"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot edit schedule with status '{scheduled.status}'"
            )
        
        extra = scheduled.extra_data or {}
        
        # Update caption if provided
        if request.caption is not None:
            scheduled.caption = request.caption
        
        # Update scheduled time if provided
        if request.scheduled_time is not None:
            try:
                new_time = _validate_scheduled_time(request.scheduled_time)
                scheduled.scheduled_time = new_time
            except ValueError as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(e)
                )
        
        # Update platforms if provided
        if request.platforms is not None:
            if request.brand_id:
                # Validate platforms for the brand
                brand = db.query(Brand).filter(
                    Brand.id == request.brand_id,
                    Brand.user_id == user["id"]
                ).first()
            else:
                brand = db.query(Brand).filter(
                    Brand.id == extra.get("brand"),
                    Brand.user_id == user["id"]
                ).first()
            
            if not brand:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Brand not found"
                )
            
            connected = {p["name"] for p in _get_connected_platforms(brand)}
            for plat in request.platforms:
                if plat not in connected:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Platform '{plat}' is not connected for this brand"
                    )
            
            extra["platforms"] = request.platforms
        
        # Update brand if provided
        if request.brand_id is not None:
            # Validate brand exists and belongs to user
            brand = db.query(Brand).filter(
                Brand.id == request.brand_id,
                Brand.user_id == user["id"],
                Brand.active == True
            ).first()
            
            if not brand:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Brand '{request.brand_id}' not found or not accessible"
                )
            
            extra["brand"] = request.brand_id
        
        # Update social media if provided
        if request.social_media is not None:
            extra["social_media"] = request.social_media
        
        scheduled.extra_data = extra
        db.commit()
        
        return {
            "success": True,
            "schedule_id": schedule_id,
            "message": "Schedule updated successfully",
            "updated": {
                "caption": request.caption is not None,
                "scheduled_time": request.scheduled_time is not None,
                "platforms": request.platforms is not None,
                "brand_id": request.brand_id is not None,
                "social_media": request.social_media is not None,
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update schedule: {str(e)}"
        )


@router.delete("/manual/{schedule_id}")
async def delete_manual_schedule(
    schedule_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Delete a manually scheduled post."""
    try:
        scheduled = db.query(ScheduledReel).filter(
            ScheduledReel.schedule_id == schedule_id,
            ScheduledReel.user_id == user["id"],
            ScheduledReel.created_by == "user"
        ).first()
        
        if not scheduled:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Manual schedule '{schedule_id}' not found"
            )
        
        db.delete(scheduled)
        db.commit()
        
        return {
            "success": True,
            "message": f"Schedule '{schedule_id}' deleted successfully"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete schedule: {str(e)}"
        )


@router.get("/manual")
async def list_manual_schedules(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Get all manually scheduled posts (created via calendar upload).
    
    Filters out Toby-generated content (created_by != "user").
    """
    try:
        schedules = db.query(ScheduledReel).filter(
            ScheduledReel.user_id == user["id"],
            ScheduledReel.created_by == "user"
        ).order_by(
            ScheduledReel.scheduled_time.asc()
        ).all()
        
        result = []
        for sched in schedules:
            extra = sched.extra_data or {}
            result.append({
                "schedule_id": sched.schedule_id,
                "caption": sched.caption,
                "brand_id": extra.get("brand"),
                "scheduled_time": sched.scheduled_time.isoformat(),
                "status": sched.status,
                "content_type": extra.get("content_type"),
                "platforms": extra.get("platforms", []),
                "social_media": extra.get("social_media"),
                "created_at": sched.created_at.isoformat(),
                "published_at": sched.published_at.isoformat() if sched.published_at else None,
                "file_url": extra.get("file_url"),
            })
        
        return {
            "total": len(result),
            "schedules": result
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list schedules: {str(e)}"
        )
