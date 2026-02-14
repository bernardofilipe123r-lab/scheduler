"""
Publishing API routes.
"""
from pathlib import Path
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status
from app.services.publishing.scheduler import DatabaseSchedulerService
from app.services.publishing.social_publisher import SocialPublisher
from app.services.brands.resolver import brand_resolver
from app.core.config import BrandConfig


def get_brand_config_from_name(brand_name: str) -> Optional[BrandConfig]:
    """
    Get brand configuration from brand name string.
    
    Args:
        brand_name: Brand name from UI ("gymcollege" or "healthycollege")
        
    Returns:
        BrandConfig or None
    """
    config = brand_resolver.get_brand_config(brand_name)
    if config:
        print(f"🏷️ Brand config found for '{brand_name}': {config.name}, IG: {config.instagram_business_account_id}, FB: {config.facebook_page_id}")
    else:
        print(f"⚠️ No brand config found for '{brand_name}'")
    return config


# Pydantic models
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


# Create router
router = APIRouter()

# Initialize services
scheduler_service = DatabaseSchedulerService()


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
