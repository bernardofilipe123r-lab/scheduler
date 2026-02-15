"""
Scheduling API routes.
"""
import uuid
import base64
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status, Depends
from app.services.publishing.scheduler import DatabaseSchedulerService
from app.services.brands.resolver import brand_resolver
from app.api.auth.middleware import get_current_user


# Pydantic models
class ScheduleRequest(BaseModel):
    reel_id: str
    schedule_date: str  # YYYY-MM-DD
    schedule_time: str  # HH:MM
    caption: str


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


class RescheduleRequest(BaseModel):
    scheduled_time: str  # ISO datetime string


class SchedulePostImageRequest(BaseModel):
    brand: str
    title: str
    caption: str = ""  # Full caption text for Instagram
    image_data: str  # base64 PNG (may include data:image/png;base64, prefix) — cover slide
    carousel_images: list[str] = []  # base64 PNG images for carousel text slides (slides 2-4)
    slide_texts: list[str] = []  # text content for each carousel slide
    schedule_time: str  # ISO datetime string
    job_id: Optional[str] = None  # Link back to the generation job


# Create router
router = APIRouter()

# Initialize services
scheduler_service = DatabaseSchedulerService()


@router.post(
    "/schedule",
    summary="Schedule a reel for publication",
    description="Schedule an existing reel to be published on Instagram at a specific date and time"
)
async def schedule_reel(request: ScheduleRequest, user: dict = Depends(get_current_user)):
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
            user_id=user["id"],
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
    "/schedule-auto",
    summary="Auto-schedule a reel to next available slot",
    description="Automatically schedule a reel to the next available time slot based on brand and variant"
)
async def schedule_auto(request: AutoScheduleRequest, user: dict = Depends(get_current_user)):
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
            user_id=user["id"],
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


@router.get("/scheduled")
async def get_scheduled_posts(user: dict = Depends(get_current_user)):
    """
    Get all scheduled posts (reels and posts from all sources including Maestro).
    """
    try:
        schedules = scheduler_service.get_all_scheduled()
        
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
            
            # Convert carousel image paths to URLs
            raw_carousel = metadata.get("carousel_paths", [])
            carousel_urls = []
            for cp in (raw_carousel or []):
                if cp and "/output/" in cp:
                    carousel_urls.append("/output/" + cp.split("/output/", 1)[1])
                elif cp:
                    carousel_urls.append(cp)
            
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
                    "carousel_image_paths": carousel_urls,
                    "title": metadata.get("title"),
                    "slide_texts": metadata.get("slide_texts"),
                    "job_id": metadata.get("job_id"),
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


@router.delete("/scheduled/bulk/from-date")
async def delete_scheduled_from_date(from_date: str, user: dict = Depends(get_current_user)):
    """Delete all scheduled reels from a given date onwards (inclusive).
    from_date format: YYYY-MM-DD"""
    from app.db_connection import SessionLocal
    from app.models import ScheduledReel
    from datetime import datetime

    db = SessionLocal()
    try:
        cutoff = datetime.fromisoformat(from_date)
        count = (
            db.query(ScheduledReel)
            .filter(ScheduledReel.scheduled_time >= cutoff)
            .delete()
        )
        db.commit()
        return {"status": "deleted", "deleted": count, "from_date": from_date}
    except Exception as e:
        db.rollback()
        return {"status": "error", "error": str(e)}
    finally:
        db.close()


@router.delete("/scheduled/bulk/day/{date}")
async def delete_scheduled_for_day(date: str, variant: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Delete scheduled entries for a specific day, optionally filtered by variant.
    date format: YYYY-MM-DD
    variant: 'reel' (only reels), 'post' (only posts), or omit for all."""
    from app.db_connection import SessionLocal
    from app.models import ScheduledReel
    from datetime import datetime, timedelta
    from sqlalchemy import cast, String as SAString

    db = SessionLocal()
    try:
        day_start = datetime.fromisoformat(date)
        day_end = day_start + timedelta(days=1)
        query = (
            db.query(ScheduledReel)
            .filter(ScheduledReel.scheduled_time >= day_start)
            .filter(ScheduledReel.scheduled_time < day_end)
        )
        if variant == "post":
            query = query.filter(
                cast(ScheduledReel.extra_data["variant"].astext, SAString) == "post"
            )
        elif variant == "reel":
            query = query.filter(
                cast(ScheduledReel.extra_data["variant"].astext, SAString) != "post"
            )
        count = query.delete(synchronize_session="fetch")
        db.commit()
        return {"status": "deleted", "deleted": count, "date": date, "variant": variant}
    except Exception as e:
        db.rollback()
        return {"status": "error", "error": str(e)}
    finally:
        db.close()


@router.delete("/scheduled/{schedule_id}")
async def delete_scheduled_post(schedule_id: str, user: dict = Depends(get_current_user)):
    """
    Delete a scheduled post.
    
    Optional: Provide user_id to ensure only the owner can delete.
    """
    try:
        success = scheduler_service.delete_scheduled(schedule_id)
        
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
async def retry_failed_post(schedule_id: str, user: dict = Depends(get_current_user)):
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


@router.patch("/scheduled/{schedule_id}/reschedule")
async def reschedule_post(schedule_id: str, request: RescheduleRequest, user: dict = Depends(get_current_user)):
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
async def publish_scheduled_now(schedule_id: str, user: dict = Depends(get_current_user)):
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


@router.get("/next-slot/{brand}/{variant}")
async def get_next_available_slot(brand: str, variant: str, user: dict = Depends(get_current_user)):
    """
    Get the next available scheduling slot for a brand+variant combination.
    
    Slot Rules:
    - Light mode: 12 AM, 8 AM, 4 PM (every 8 hours)
    - Dark mode: 4 AM, 12 PM, 8 PM (every 8 hours)
    
    Each brand maintains its own independent schedule.
    Starting from January 16, 2026 or today (whichever is later).
    """
    try:
        valid_brands = brand_resolver.get_all_brand_ids()
        if brand.lower() not in valid_brands:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid brand: {brand}. Must be one of: {', '.join(valid_brands)}"
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
async def get_all_next_slots(user: dict = Depends(get_current_user)):
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
        
        for brand in brand_resolver.get_all_brand_ids():
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


@router.post("/schedule-post-image")
async def schedule_post_image(request: SchedulePostImageRequest, user: dict = Depends(get_current_user)):
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
            user_id=user["id"],
            reel_id=post_id,
            scheduled_time=schedule_dt,
            video_path=None,
            thumbnail_path=image_path,
            caption=request.caption or request.title,
            platforms=["instagram", "facebook"],
            user_name="Web Interface User",
            brand=request.brand,
            variant="post",
            post_title=request.title,
            slide_texts=request.slide_texts,
            carousel_paths=carousel_paths,
            job_id=request.job_id,
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


@router.get("/scheduled/occupied-post-slots")
async def get_occupied_post_slots(user: dict = Depends(get_current_user)):
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
async def clean_reel_slots(user: dict = Depends(get_current_user)):
    """
    Reel Scheduler Cleaner: ensures every scheduled reel sits on its correct
    brand slot (brand offset + base 4-hour pattern, alternating light/dark).
    
    Two fixes:
    1. Reels on WRONG slots (hour doesn't match brand's valid reel hours) → move to next valid slot
    2. COLLISIONS (multiple reels at same brand+time) → keep first, move extras to next valid slot
    """
    try:
        from datetime import timedelta, datetime as dt

        # Load brand offsets dynamically from DB
        all_brands = brand_resolver.get_all_brands()
        BRAND_REEL_OFFSETS = {b.id: b.schedule_offset for b in all_brands}

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
async def clean_post_slots(posts_per_day: int = 6, user: dict = Depends(get_current_user)):
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
        
        # Load brand reel offsets dynamically from DB
        all_brands = brand_resolver.get_all_brands()
        BRAND_REEL_OFFSETS = {b.id: b.schedule_offset for b in all_brands}
        
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
