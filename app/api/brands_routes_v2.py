"""
Brand Management API Routes (v2 - Database-backed).

This module provides full CRUD operations for brands, using the database
as the single source of truth.

Replaces the hardcoded brand configurations throughout the codebase.
"""
import os
import json
import logging
from typing import Optional, List, Dict, Any
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.models import Brand, YouTubeChannel
from app.services.brands.manager import get_brand_manager, BrandManager
from app.services.brands.resolver import brand_resolver
from app.services.storage.supabase_storage import (
    upload_bytes, storage_path, StorageError,
)
from app.api.auth.middleware import get_current_user


logger = logging.getLogger(__name__)

# Create router for brand endpoints
router = APIRouter(prefix="/brands", tags=["brands"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class ColorConfig(BaseModel):
    """Color configuration for a brand."""
    primary: str  # e.g., "#004f00"
    accent: str  # e.g., "#22c55e"
    color_name: str  # e.g., "vibrant green" - for AI prompts
    light_mode: Optional[Dict[str, str]] = None
    dark_mode: Optional[Dict[str, str]] = None


class CreateBrandRequest(BaseModel):
    """Request to create a new brand."""
    id: str  # e.g., "healthycollege" - lowercase, no spaces
    display_name: str  # e.g., "THE HEALTHY COLLEGE"
    short_name: Optional[str] = None  # e.g., "HCO" - auto-generated if not provided
    instagram_handle: Optional[str] = None
    facebook_page_name: Optional[str] = None
    youtube_channel_name: Optional[str] = None
    schedule_offset: int = 0  # Hour offset 0-23
    posts_per_day: int = 6
    colors: Optional[ColorConfig] = None
    # Platform credentials (optional — can also be set later via PUT /credentials)
    meta_access_token: Optional[str] = None
    instagram_business_account_id: Optional[str] = None
    facebook_page_id: Optional[str] = None


class UpdateBrandRequest(BaseModel):
    """Request to update a brand."""
    display_name: Optional[str] = None
    short_name: Optional[str] = None
    instagram_handle: Optional[str] = None
    facebook_page_name: Optional[str] = None
    youtube_channel_name: Optional[str] = None
    schedule_offset: Optional[int] = None
    posts_per_day: Optional[int] = None
    baseline_for_content: Optional[bool] = None
    colors: Optional[Dict[str, Any]] = None


class UpdateCredentialsRequest(BaseModel):
    """Request to update brand API credentials."""
    instagram_access_token: Optional[str] = None
    instagram_business_account_id: Optional[str] = None
    facebook_page_id: Optional[str] = None
    facebook_access_token: Optional[str] = None
    meta_access_token: Optional[str] = None


class PlatformConnection(BaseModel):
    """Status of a platform connection."""
    connected: bool
    account_id: Optional[str] = None
    account_name: Optional[str] = None
    status: str = "not_configured"
    last_error: Optional[str] = None


class BrandResponse(BaseModel):
    """Full brand response."""
    id: str
    display_name: str
    short_name: str
    instagram_handle: Optional[str]
    facebook_page_name: Optional[str]
    youtube_channel_name: Optional[str]
    schedule_offset: int
    posts_per_day: int
    baseline_for_content: bool
    colors: Dict[str, Any]
    logo_path: Optional[str]
    active: bool
    has_instagram: bool
    has_facebook: bool
    created_at: Optional[str]
    updated_at: Optional[str]


# ============================================================================
# CRUD ENDPOINTS
# ============================================================================

@router.get("")
async def list_brands(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Get all brands.
    
    Returns a list of all active brands by default.
    Set include_inactive=true to include deactivated brands.
    """
    manager = get_brand_manager(db)
    brands = manager.get_all_brands(include_inactive=include_inactive, user_id=user["id"])
    
    return {
        "brands": brands,
        "count": len(brands)
    }


@router.get("/list")
async def list_brands_legacy(db: Session = Depends(get_db), user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Legacy endpoint for listing brands.
    
    Maintains backward compatibility with existing frontend code.
    """
    manager = get_brand_manager(db)
    brands = manager.get_all_brands(user_id=user["id"])
    
    # Format for legacy frontend
    return {
        "brands": [
            {
                "id": b["id"],
                "name": b["display_name"],
                "color": b["colors"].get("primary", "#000000"),
                "logo": b["logo_path"]
            }
            for b in brands
        ]
    }


@router.get("/ids")
async def get_brand_ids(db: Session = Depends(get_db), user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Get just the IDs of all active brands.
    
    Useful for validation and quick lookups.
    """
    manager = get_brand_manager(db)
    brand_ids = manager.get_all_brand_ids(user_id=user["id"])
    
    return {
        "brand_ids": brand_ids,
        "count": len(brand_ids)
    }


@router.get("/{brand_id}")
async def get_brand(
    brand_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get a single brand by ID."""
    manager = get_brand_manager(db)
    brand = manager.get_brand(brand_id, user_id=user["id"])
    
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")
    
    return brand


@router.get("/{brand_id}/colors")
async def get_brand_colors(
    brand_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get just the color configuration for a brand."""
    manager = get_brand_manager(db)
    colors = manager.get_brand_colors(brand_id, user_id=user["id"])
    
    if colors is None:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")
    
    return {
        "brand_id": brand_id,
        "colors": colors
    }


@router.post("")
async def create_brand(
    request: CreateBrandRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Create a new brand.
    
    The brand ID should be lowercase with no spaces (e.g., "healthycollege").
    """
    manager = get_brand_manager(db)
    
    # Validate brand ID format
    if not request.id.isalnum():
        raise HTTPException(
            status_code=400, 
            detail="Brand ID must be alphanumeric (no spaces or special characters)"
        )
    
    # Auto-generate short_name if not provided
    short_name = request.short_name
    if not short_name:
        # Take first letter of each word in display_name
        words = request.display_name.replace("THE ", "").split()
        short_name = "".join(w[0].upper() for w in words if w)[:3]
        if not short_name:
            short_name = request.id[:3].upper()
    
    try:
        brand_data = {
            "id": request.id.lower(),
            "display_name": request.display_name,
            "short_name": short_name,
            "instagram_handle": request.instagram_handle,
            "facebook_page_name": request.facebook_page_name,
            "youtube_channel_name": request.youtube_channel_name,
            "schedule_offset": request.schedule_offset,
            "posts_per_day": request.posts_per_day,
            "colors": request.colors.dict() if request.colors else {},
            # Platform credentials
            "meta_access_token": request.meta_access_token,
            "instagram_business_account_id": request.instagram_business_account_id,
            "facebook_page_id": request.facebook_page_id,
        }
        
        brand = manager.create_brand(brand_data, user_id=user["id"])
        brand_resolver.invalidate_cache()

        return {
            "success": True,
            "message": f"Brand '{request.id}' created successfully",
            "brand": brand,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{brand_id}")
async def update_brand(
    brand_id: str,
    request: UpdateBrandRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update an existing brand."""
    manager = get_brand_manager(db)
    
    # Build updates dict from non-None fields
    updates = {k: v for k, v in request.dict().items() if v is not None}
    
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    brand = manager.update_brand(brand_id, updates, user_id=user["id"])
    
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")
    
    brand_resolver.invalidate_cache()
    
    return {
        "success": True,
        "message": f"Brand '{brand_id}' updated successfully",
        "brand": brand
    }


@router.put("/{brand_id}/credentials")
async def update_brand_credentials(
    brand_id: str,
    request: UpdateCredentialsRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Update API credentials for a brand.
    
    This allows setting Instagram/Facebook credentials via the UI
    instead of environment variables.
    """
    manager = get_brand_manager(db)
    
    # Build updates dict from non-None fields
    updates = {k: v for k, v in request.dict().items() if v is not None}
    
    if not updates:
        raise HTTPException(status_code=400, detail="No credentials provided")
    
    brand = manager.update_brand(brand_id, updates, user_id=user["id"])
    
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")
    
    brand_resolver.invalidate_cache()
    
    return {
        "success": True,
        "message": f"Credentials updated for '{brand_id}'",
        "has_instagram": brand.get("has_instagram", False),
        "has_facebook": brand.get("has_facebook", False)
    }


@router.delete("/{brand_id}")
async def delete_brand(
    brand_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Delete a brand (soft delete).
    
    The brand is deactivated rather than permanently deleted,
    preserving historical data.
    """
    manager = get_brand_manager(db)
    
    success = manager.delete_brand(brand_id, user_id=user["id"])
    
    if not success:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")
    
    brand_resolver.invalidate_cache()
    
    return {
        "success": True,
        "message": f"Brand '{brand_id}' has been deactivated"
    }


@router.post("/{brand_id}/reactivate")
async def reactivate_brand(
    brand_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Reactivate a previously deleted brand."""
    manager = get_brand_manager(db)
    
    brand = manager.update_brand(brand_id, {"active": True}, user_id=user["id"])
    
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")
    
    return {
        "success": True,
        "message": f"Brand '{brand_id}' has been reactivated",
        "brand": brand
    }


# ============================================================================
# CREDENTIALS ENDPOINTS
# ============================================================================

@router.get("/credentials")
async def get_all_brand_credentials(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Get credentials for all brands (for the Settings tab).
    Returns facebook_page_id, instagram_business_account_id, meta_access_token per brand.
    """
    manager = get_brand_manager(db)
    brands = manager.get_all_brands(user_id=user["id"])

    result = []
    for brand in brands:
        brand_id = brand["id"]
        creds = manager.get_brand_with_credentials(brand_id, user_id=user["id"])
        if creds:
            result.append({
                "id": brand_id,
                "display_name": brand["display_name"],
                "color": brand.get("colors", {}).get("primary", "#000000"),
                "facebook_page_id": creds.get("facebook_page_id") or "",
                "instagram_business_account_id": creds.get("instagram_business_account_id") or "",
                "meta_access_token": creds.get("meta_access_token") or "",
            })

    return {"brands": result}


# ============================================================================
# CONNECTION STATUS ENDPOINTS
# ============================================================================

@router.get("/connections")
async def get_brand_connections(db: Session = Depends(get_db), user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Get connection status for all platforms for all brands.
    
    Returns Instagram, Facebook, and YouTube connection status.
    """
    manager = get_brand_manager(db)
    brands = manager.get_all_brands(user_id=user["id"])
    
    # Get YouTube channels from database
    youtube_channels = db.query(YouTubeChannel).all()
    youtube_map = {ch.brand: ch for ch in youtube_channels}
    
    brand_connections = []
    
    for brand in brands:
        brand_id = brand["id"]
        brand_with_creds = manager.get_brand_with_credentials(brand_id, user_id=user["id"])
        
        # Check Instagram
        ig_connected = bool(
            brand_with_creds.get("instagram_business_account_id") and 
            (brand_with_creds.get("instagram_access_token") or brand_with_creds.get("meta_access_token"))
        )
        
        instagram = {
            "connected": ig_connected,
            "account_id": brand_with_creds.get("instagram_business_account_id"),
            "account_name": brand.get("instagram_handle"),
            "status": "connected" if ig_connected else "not_configured"
        }
        
        # Check Facebook
        fb_connected = bool(
            brand_with_creds.get("facebook_page_id") and 
            (brand_with_creds.get("facebook_access_token") or brand_with_creds.get("meta_access_token"))
        )
        
        facebook = {
            "connected": fb_connected,
            "account_id": brand_with_creds.get("facebook_page_id"),
            "account_name": brand.get("facebook_page_name"),
            "status": "connected" if fb_connected else "not_configured"
        }
        
        # Check YouTube
        yt_channel = youtube_map.get(brand_id)
        if yt_channel:
            youtube = {
                "connected": yt_channel.status == "connected",
                "account_id": yt_channel.channel_id,
                "account_name": yt_channel.channel_name,
                "status": yt_channel.status,
                "last_error": yt_channel.last_error
            }
        else:
            youtube = {
                "connected": False,
                "status": "not_connected"
            }
        
        brand_connections.append({
            "brand": brand_id,
            "display_name": brand["display_name"],
            "color": brand["colors"].get("primary", "#000000"),
            "instagram": instagram,
            "facebook": facebook,
            "youtube": youtube
        })
    
    # Check which OAuth is configured
    oauth_configured = {
        "meta": bool(os.getenv("INSTAGRAM_APP_ID")) and bool(os.getenv("INSTAGRAM_APP_SECRET")),
        "youtube": bool(os.getenv("YOUTUBE_CLIENT_ID")) and bool(os.getenv("YOUTUBE_CLIENT_SECRET"))
    }
    
    return {
        "brands": brand_connections,
        "oauth_configured": oauth_configured
    }


# ============================================================================
# THEME ENDPOINTS (for backward compatibility)
# ============================================================================

@router.get("/{brand_id}/theme")
async def get_brand_theme(
    brand_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Get a brand's theme settings.
    
    Returns colors from the database.
    """
    manager = get_brand_manager(db)
    brand = manager.get_brand(brand_id, user_id=user["id"])
    
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")
    
    colors = brand.get("colors", {})
    
    # Format for legacy theme endpoint + rendering colors
    theme = {
        "brand_color": colors.get("primary", "#000000"),
        "light_title_color": colors.get("light_mode", {}).get("text", "#000000"),
        "light_bg_color": colors.get("light_mode", {}).get("background", "#ffffff"),
        "dark_title_color": colors.get("dark_mode", {}).get("text", "#ffffff"),
        "dark_bg_color": colors.get("dark_mode", {}).get("background", "#000000"),
        # Rendering colors
        "light_thumbnail_text_color": colors.get("light_thumbnail_text_color"),
        "light_content_title_text_color": colors.get("light_content_title_text_color"),
        "light_content_title_bg_color": colors.get("light_content_title_bg_color"),
        "dark_thumbnail_text_color": colors.get("dark_thumbnail_text_color"),
        "dark_content_title_text_color": colors.get("dark_content_title_text_color"),
        "dark_content_title_bg_color": colors.get("dark_content_title_bg_color"),
        "logo": brand.get("logo_path")
    }
    
    return {
        "brand_id": brand_id,
        "theme": theme,
        "has_overrides": True  # Data comes from DB, not hardcoded
    }


@router.post("/{brand_id}/theme")
async def update_brand_theme(
    brand_id: str,
    brand_color: str = Form(...),
    light_title_color: str = Form(...),
    light_bg_color: str = Form(...),
    dark_title_color: str = Form(...),
    dark_bg_color: str = Form(...),
    # Rendering color fields (optional for backward compat)
    light_thumbnail_text_color: Optional[str] = Form(None),
    light_content_title_text_color: Optional[str] = Form(None),
    light_content_title_bg_color: Optional[str] = Form(None),
    dark_thumbnail_text_color: Optional[str] = Form(None),
    dark_content_title_text_color: Optional[str] = Form(None),
    dark_content_title_bg_color: Optional[str] = Form(None),
    logo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Update a brand's theme settings.
    
    This updates the colors in the database.
    """
    manager = get_brand_manager(db)
    
    # Get current brand
    brand = manager.get_brand(brand_id, user_id=user["id"])
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")
    
    # Update colors structure
    current_colors = brand.get("colors", {})
    updated_colors = {
        **current_colors,
        "primary": brand_color,
        "light_mode": {
            **(current_colors.get("light_mode", {})),
            "text": light_title_color,
            "background": light_bg_color
        },
        "dark_mode": {
            **(current_colors.get("dark_mode", {})),
            "text": dark_title_color,
            "background": dark_bg_color
        }
    }
    
    # Merge rendering colors if provided
    rendering_fields = {
        "light_thumbnail_text_color": light_thumbnail_text_color,
        "light_content_title_text_color": light_content_title_text_color,
        "light_content_title_bg_color": light_content_title_bg_color,
        "dark_thumbnail_text_color": dark_thumbnail_text_color,
        "dark_content_title_text_color": dark_content_title_text_color,
        "dark_content_title_bg_color": dark_content_title_bg_color,
    }
    for key, val in rendering_fields.items():
        if val is not None:
            updated_colors[key] = val
    
    updates = {"colors": updated_colors}
    
    # Handle logo upload
    if logo and logo.filename:
        extension = Path(logo.filename).suffix.lower() or '.png'
        ext = extension.lstrip('.')
        logo_filename = f"{brand_id}_logo.{ext}"
        content = await logo.read()
        
        user_id = user["id"]
        remote_path = storage_path(user_id, brand_id, "logos", logo_filename)
        try:
            logo_url = upload_bytes("brand-assets", remote_path, content, f"image/{ext}")
        except StorageError as e:
            print(f"Logo upload failed: {e}"); logo_url = logo_filename
        
        updates["logo_path"] = logo_url
    
    # Update brand
    updated_brand = manager.update_brand(brand_id, updates, user_id=user["id"])
    
    return {
        "success": True,
        "message": f"Theme updated for {brand_id}",
        "theme": {
            "brand_color": brand_color,
            "light_title_color": light_title_color,
            "light_bg_color": light_bg_color,
            "dark_title_color": dark_title_color,
            "dark_bg_color": dark_bg_color,
            "light_thumbnail_text_color": updated_colors.get("light_thumbnail_text_color"),
            "light_content_title_text_color": updated_colors.get("light_content_title_text_color"),
            "light_content_title_bg_color": updated_colors.get("light_content_title_bg_color"),
            "dark_thumbnail_text_color": updated_colors.get("dark_thumbnail_text_color"),
            "dark_content_title_text_color": updated_colors.get("dark_content_title_text_color"),
            "dark_content_title_bg_color": updated_colors.get("dark_content_title_bg_color"),
            "logo": updates.get("logo_path", brand.get("logo_path"))
        }
    }


# ============================================================================
# SEED ENDPOINT (for initial setup)
# ============================================================================

@router.post("/seed")
async def seed_brands(db: Session = Depends(get_db), user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Seed default brands if none exist.
    
    This is called automatically on app startup, but can also be
    triggered manually.
    """
    manager = get_brand_manager(db)
    count = manager.seed_default_brands(user_id=user["id"])
    
    if count > 0:
        return {
            "success": True,
            "message": f"Seeded {count} default brands",
            "count": count
        }
    else:
        return {
            "success": True,
            "message": "Brands already exist, no seeding needed",
            "count": 0
        }
