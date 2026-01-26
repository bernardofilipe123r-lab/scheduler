"""
Brand management API routes.

Provides endpoints for:
- Getting all brands and their connection statuses
- Managing brand configurations
- Creating new brands (future)
"""
import os
import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.models import YouTubeChannel
from app.core.config import BRAND_CONFIGS, BrandType


logger = logging.getLogger(__name__)

# Create router for brand endpoints
router = APIRouter(prefix="/brands", tags=["brands"])

# Map frontend brand names to backend BrandType
BRAND_NAME_MAP = {
    "healthycollege": BrandType.HEALTHY_COLLEGE,
    "vitalitycollege": BrandType.VITALITY_COLLEGE,
    "longevitycollege": BrandType.LONGEVITY_COLLEGE,
    "holisticcollege": BrandType.HOLISTIC_COLLEGE,
    "wellbeingcollege": BrandType.WELLBEING_COLLEGE,
}

# List of valid brands
VALID_BRANDS = list(BRAND_NAME_MAP.keys())


class PlatformConnection(BaseModel):
    """Status of a platform connection."""
    connected: bool
    account_id: Optional[str] = None
    account_name: Optional[str] = None
    status: str = "not_configured"  # connected, not_configured, error, revoked
    last_error: Optional[str] = None


class BrandConnectionStatus(BaseModel):
    """Full connection status for a brand."""
    brand: str
    display_name: str
    color: str
    instagram: PlatformConnection
    facebook: PlatformConnection
    youtube: PlatformConnection


class BrandConnectionsResponse(BaseModel):
    """Response for all brand connections."""
    brands: List[BrandConnectionStatus]
    oauth_configured: dict  # Which OAuth is configured


def get_instagram_handle_from_brand(brand: str) -> str:
    """Get Instagram handle from brand name."""
    handles = {
        "healthycollege": "@thehealthycollege",
        "vitalitycollege": "@thevitalitycollege",
        "longevitycollege": "@thelongevitycollege",
        "holisticcollege": "@theholisticcollege",
        "wellbeingcollege": "@thewellbeingcollege",
    }
    return handles.get(brand, f"@the{brand}")


def get_facebook_page_name_from_brand(brand: str) -> str:
    """Get Facebook page name from brand name."""
    names = {
        "healthycollege": "Healthy College",
        "vitalitycollege": "Vitality College",
        "longevitycollege": "Longevity College",
        "holisticcollege": "Holistic College",
        "wellbeingcollege": "Wellbeing College",
    }
    return names.get(brand, brand.replace("college", " College").title())


@router.get("/connections", response_model=BrandConnectionsResponse)
async def get_brand_connections(db: Session = Depends(get_db)):
    """
    Get connection status for all platforms for all brands.
    
    Returns Instagram, Facebook, and YouTube connection status for each brand.
    """
    # Get all YouTube channels from database
    youtube_channels = db.query(YouTubeChannel).all()
    youtube_map = {ch.brand: ch for ch in youtube_channels}
    
    brands = []
    
    for brand_name, brand_type in BRAND_NAME_MAP.items():
        config = BRAND_CONFIGS.get(brand_type)
        if not config:
            continue
        
        # Check Instagram connection (from env vars/config)
        ig_account_id = config.instagram_business_account_id
        ig_connected = bool(ig_account_id) and bool(config.meta_access_token)
        
        instagram = PlatformConnection(
            connected=ig_connected,
            account_id=ig_account_id,
            account_name=get_instagram_handle_from_brand(brand_name) if ig_connected else None,
            status="connected" if ig_connected else "not_configured"
        )
        
        # Check Facebook connection (from env vars/config)
        fb_page_id = config.facebook_page_id
        fb_connected = bool(fb_page_id) and bool(config.meta_access_token)
        
        facebook = PlatformConnection(
            connected=fb_connected,
            account_id=fb_page_id,
            account_name=get_facebook_page_name_from_brand(brand_name) if fb_connected else None,
            status="connected" if fb_connected else "not_configured"
        )
        
        # Check YouTube connection (from database)
        yt_channel = youtube_map.get(brand_name)
        if yt_channel:
            youtube = PlatformConnection(
                connected=yt_channel.status == "connected",
                account_id=yt_channel.channel_id,
                account_name=yt_channel.channel_name,
                status=yt_channel.status,
                last_error=yt_channel.last_error
            )
        else:
            youtube = PlatformConnection(
                connected=False,
                status="not_connected"
            )
        
        # Get brand color as hex
        r, g, b = config.secondary_color
        color = f"#{r:02x}{g:02x}{b:02x}"
        
        brands.append(BrandConnectionStatus(
            brand=brand_name,
            display_name=config.display_name,
            color=color,
            instagram=instagram,
            facebook=facebook,
            youtube=youtube
        ))
    
    # Check which OAuth is configured
    oauth_configured = {
        "meta": bool(os.getenv("INSTAGRAM_APP_ID")) and bool(os.getenv("INSTAGRAM_APP_SECRET")),
        "youtube": bool(os.getenv("YOUTUBE_CLIENT_ID")) and bool(os.getenv("YOUTUBE_CLIENT_SECRET"))
    }
    
    return BrandConnectionsResponse(brands=brands, oauth_configured=oauth_configured)


@router.get("/list")
async def list_brands():
    """
    Get list of all available brands with their basic info.
    """
    brands = []
    
    for brand_name, brand_type in BRAND_NAME_MAP.items():
        config = BRAND_CONFIGS.get(brand_type)
        if not config:
            continue
        
        r, g, b = config.secondary_color
        color = f"#{r:02x}{g:02x}{b:02x}"
        
        brands.append({
            "id": brand_name,
            "name": config.display_name,
            "color": color,
            "logo": config.logo_filename
        })
    
    return {"brands": brands}


# Future: Create brand endpoint
class CreateBrandRequest(BaseModel):
    """Request to create a new brand."""
    name: str
    display_name: str
    primary_color: str  # Hex color
    secondary_color: str  # Hex color


@router.post("/create")
async def create_brand(request: CreateBrandRequest):
    """
    Create a new brand (future functionality).
    
    This will:
    1. Create brand configuration
    2. Create asset folders
    3. Set up placeholder logo
    
    Note: Currently returns a placeholder response.
    Full implementation requires database schema for dynamic brands.
    """
    # TODO: Implement dynamic brand creation
    # This would require:
    # 1. Storing brand configs in database instead of hardcoded
    # 2. Creating asset folders
    # 3. Generating/uploading logos
    # 4. Setting up Meta/YouTube OAuth for the new brand
    
    return {
        "success": False,
        "message": "Brand creation coming soon! Currently, brands are configured in the codebase.",
        "hint": "Contact the developer to add a new brand."
    }
