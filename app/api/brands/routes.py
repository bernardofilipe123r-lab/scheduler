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
    schedule_offset: Optional[int] = None  # Auto-assigned if not provided
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
    token_expires_at: Optional[str] = None
    token_last_refreshed_at: Optional[str] = None


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
# HELPERS
# ============================================================================

def _ensure_rendering_colors(colors: Dict[str, Any]) -> Dict[str, Any]:
    """
    Populate flat rendering keys (light_thumbnail_text_color, etc.) from
    the nested light_mode / dark_mode sub-dicts when they are absent.

    This bridges the gap between the color structure written during brand
    creation (nested) and the flat keys expected by the rendering engine.
    """
    light = colors.get("light_mode") or {}
    dark = colors.get("dark_mode") or {}

    defaults = {
        "light_thumbnail_text_color": light.get("text", "#000000"),
        "light_content_title_text_color": light.get("text", "#000000"),
        "light_content_title_bg_color": light.get("background", "#e5e7eb"),
        "dark_thumbnail_text_color": dark.get("text", "#ffffff"),
        "dark_content_title_text_color": dark.get("text", "#ffffff"),
        "dark_content_title_bg_color": dark.get("background", "#374151"),
    }

    for key, fallback in defaults.items():
        if not colors.get(key):
            colors[key] = fallback

    return colors


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


# ============================================================================
# CONNECTION STATUS ENDPOINTS
# (Must be defined BEFORE /{brand_id} to avoid being shadowed)
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

        # Fetch token health directly from Brand ORM object
        from app.models.brands import Brand as BrandModel
        _brand_orm = db.query(BrandModel).filter(BrandModel.id == brand_id).first()
        _ig_expires = _brand_orm.instagram_token_expires_at.isoformat() if (_brand_orm and _brand_orm.instagram_token_expires_at) else None
        _ig_refreshed = _brand_orm.instagram_token_last_refreshed_at.isoformat() if (_brand_orm and _brand_orm.instagram_token_last_refreshed_at) else None

        instagram = {
            "connected": ig_connected,
            "account_id": brand_with_creds.get("instagram_business_account_id"),
            "account_name": brand.get("instagram_handle"),
            "status": "connected" if ig_connected else "not_configured",
            "token_expires_at": _ig_expires,
            "token_last_refreshed_at": _ig_refreshed,
        }

        # Check Facebook
        # NOTE: We require facebook_access_token specifically. meta_access_token is the
        # Instagram System User token and should NOT count as a Facebook page connection.
        fb_connected = bool(
            brand_with_creds.get("facebook_page_id") and
            brand_with_creds.get("facebook_access_token")
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
            "youtube": youtube,
            "threads": {
                "connected": bool(_brand_orm and _brand_orm.threads_access_token),
                "account_id": _brand_orm.threads_user_id if _brand_orm else None,
                "account_name": f"@{_brand_orm.threads_username}" if (_brand_orm and _brand_orm.threads_username) else None,
                "status": "connected" if (_brand_orm and _brand_orm.threads_access_token) else "not_configured",
                "token_expires_at": _brand_orm.threads_token_expires_at.isoformat() if (_brand_orm and _brand_orm.threads_token_expires_at) else None,
                "token_last_refreshed_at": _brand_orm.threads_token_last_refreshed_at.isoformat() if (_brand_orm and _brand_orm.threads_token_last_refreshed_at) else None,
            },
            "tiktok": {
                "connected": bool(_brand_orm and _brand_orm.tiktok_access_token and _brand_orm.tiktok_refresh_token),
                "account_id": _brand_orm.tiktok_open_id if _brand_orm else None,
                "account_name": _brand_orm.tiktok_username if _brand_orm else None,
                "status": "connected" if (_brand_orm and _brand_orm.tiktok_access_token and _brand_orm.tiktok_refresh_token) else "not_configured",
                "access_token_expires_at": _brand_orm.tiktok_access_token_expires_at.isoformat() if (_brand_orm and _brand_orm.tiktok_access_token_expires_at) else None,
                "refresh_token_expires_at": _brand_orm.tiktok_refresh_token_expires_at.isoformat() if (_brand_orm and _brand_orm.tiktok_refresh_token_expires_at) else None,
            },
        })

    # Check which OAuth is configured
    oauth_configured = {
        "meta": bool(os.getenv("INSTAGRAM_APP_ID")) and bool(os.getenv("INSTAGRAM_APP_SECRET")),
        "facebook": bool(os.getenv("FACEBOOK_APP_ID")) and bool(os.getenv("FACEBOOK_APP_SECRET")),
        "youtube": bool(os.getenv("YOUTUBE_CLIENT_ID")) and bool(os.getenv("YOUTUBE_CLIENT_SECRET")),
        "threads": bool(os.getenv("META_APP_ID") or os.getenv("INSTAGRAM_APP_ID")),
        "tiktok": bool(os.getenv("TIKTOK_CLIENT_KEY")),
    }

    return {
        "brands": brand_connections,
        "oauth_configured": oauth_configured
    }


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
# GLOBAL PROMPTS ENDPOINTS
# ============================================================================

PROMPT_KEYS = ["reels_prompt", "posts_prompt", "brand_description"]

PROMPT_DEFAULTS = {
    "brand_description": "",
    "reels_prompt": "",
    "posts_prompt": "",
}


class UpdatePromptsRequest(BaseModel):
    reels_prompt: Optional[str] = None
    posts_prompt: Optional[str] = None
    brand_description: Optional[str] = None


@router.get("/prompts")
async def get_prompts(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get the 3 global content prompt settings. Auto-populates defaults on first access."""
    from app.models.config import AppSettings
    rows = db.query(AppSettings).filter(AppSettings.key.in_(PROMPT_KEYS)).all()
    result = {row.key: (row.value or "") for row in rows}

    # Auto-populate DB with defaults for any missing or empty keys
    needs_commit = False
    for key in PROMPT_KEYS:
        if not result.get(key):
            default_val = PROMPT_DEFAULTS.get(key, "")
            existing = next((r for r in rows if r.key == key), None)
            if existing:
                existing.value = default_val
            else:
                db.add(AppSettings(key=key, value=default_val, category="content", value_type="string"))
            result[key] = default_val
            needs_commit = True
    if needs_commit:
        db.commit()

    return result


@router.put("/prompts")
async def update_prompts(
    request: UpdatePromptsRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update the 3 global content prompt settings."""
    from app.models.config import AppSettings
    updates = {k: v for k, v in request.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    for key, value in updates.items():
        row = db.query(AppSettings).filter(AppSettings.key == key).first()
        if row:
            row.value = value
        else:
            db.add(AppSettings(key=key, value=value, category="content", value_type="string"))
    db.commit()

    rows = db.query(AppSettings).filter(AppSettings.key.in_(PROMPT_KEYS)).all()
    result = {k: "" for k in PROMPT_KEYS}
    for row in rows:
        result[row.key] = row.value or ""
    return {"success": True, **result}


# ============================================================================
# LAYOUT SETTINGS ENDPOINTS
# ============================================================================

@router.get("/settings/layout")
async def get_layout_settings(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get user's layout settings from app_settings."""
    from app.models.config import AppSettings
    key = f"layout_settings_{user['id']}"
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    if row and row.value:
        return json.loads(row.value)
    return {}


@router.put("/settings/layout")
async def update_layout_settings(
    settings: Dict[str, Any],
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Save user's layout settings to app_settings."""
    from app.models.config import AppSettings
    key = f"layout_settings_{user['id']}"
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    if row:
        row.value = json.dumps(settings)
    else:
        db.add(AppSettings(
            key=key,
            value=json.dumps(settings),
            category="layout",
            value_type="json",
        ))
    db.commit()
    return {"status": "ok"}


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
        words = request.display_name.split()
        short_name = "".join(w[0].upper() for w in words if w)[:3]
        if not short_name:
            short_name = request.id[:3].upper()

    # Check if brand ID already exists (across all users)
    from app.models.brands import Brand as BrandModel
    existing = db.query(BrandModel).filter(BrandModel.id == request.id.lower()).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A brand with ID '{request.id}' already exists. Choose a different ID."
        )

    try:
        colors = request.colors.dict() if request.colors else {}
        # Auto-populate flat rendering keys from nested light_mode/dark_mode
        colors = _ensure_rendering_colors(colors)

        brand_data = {
            "id": request.id.lower(),
            "display_name": request.display_name,
            "short_name": short_name,
            "instagram_handle": request.instagram_handle,
            "facebook_page_name": request.facebook_page_name,
            "youtube_channel_name": request.youtube_channel_name,
            "schedule_offset": request.schedule_offset,  # None = auto-assigned by manager
            "posts_per_day": request.posts_per_day,
            "colors": colors,
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

    # Auto-populate flat rendering keys when colors are updated
    if "colors" in updates and isinstance(updates["colors"], dict):
        updates["colors"] = _ensure_rendering_colors(updates["colors"])

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
    Also cancels any active Stripe subscription for this brand.
    """
    # Cancel Stripe subscription if one exists
    from app.models.billing import BrandSubscription
    brand_sub = db.query(BrandSubscription).filter_by(
        user_id=user["id"], brand_id=brand_id
    ).first()
    if brand_sub and brand_sub.status in ("active", "past_due") and brand_sub.stripe_subscription_id:
        try:
            import stripe
            stripe.Subscription.modify(
                brand_sub.stripe_subscription_id,
                cancel_at_period_end=True,
            )
            brand_sub.cancel_at_period_end = True
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to cancel Stripe sub on brand delete: {e}")

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

    # Ensure flat rendering keys are populated from nested structure
    colors = _ensure_rendering_colors(colors)

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
        "logo": brand.get("logo_path"),
        "reel_divider_logo": brand.get("reel_divider_logo_path"),
        "short_name": brand.get("short_name", ""),
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
    short_name: Optional[str] = Form(None),
    logo: Optional[UploadFile] = File(None),
    reel_divider_logo: Optional[UploadFile] = File(None),
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

    if short_name is not None:
        updates["short_name"] = short_name

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

    # Handle reel divider logo upload (logo shown in the divider line of reel thumbnails)
    if reel_divider_logo and reel_divider_logo.filename:
        extension = Path(reel_divider_logo.filename).suffix.lower() or '.png'
        ext = extension.lstrip('.')
        divider_logo_filename = f"{brand_id}_reel_divider_logo.{ext}"
        content = await reel_divider_logo.read()

        user_id = user["id"]
        remote_path = storage_path(user_id, brand_id, "logos", divider_logo_filename)
        try:
            divider_logo_url = upload_bytes("brand-assets", remote_path, content, f"image/{ext}")
        except StorageError as e:
            print(f"Reel divider logo upload failed: {e}"); divider_logo_url = divider_logo_filename

        updates["reel_divider_logo_path"] = divider_logo_url

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
            "logo": updates.get("logo_path", brand.get("logo_path")),
            "reel_divider_logo": updates.get("reel_divider_logo_path", brand.get("reel_divider_logo_path"))
        }
    }


@router.post("/{brand_id}/divider-logo")
async def upload_divider_logo(
    brand_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Upload or replace the divider logo for a brand's thumbnail."""
    manager = get_brand_manager(db)
    brand = manager.get_brand(brand_id, user_id=user["id"])
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    extension = Path(file.filename).suffix.lower() or ".png"
    ext = extension.lstrip(".")
    if ext not in ("png", "jpg", "jpeg", "webp", "svg"):
        raise HTTPException(status_code=400, detail="Invalid image format")

    content = await file.read()
    filename = f"{brand_id}_reel_divider_logo.{ext}"
    remote_path = storage_path(user["id"], brand_id, "logos", filename)
    try:
        logo_url = upload_bytes("brand-assets", remote_path, content, f"image/{ext}")
    except StorageError as e:
        logger.error("Divider logo upload failed for %s: %s", brand_id, e)
        raise HTTPException(status_code=500, detail="Logo upload failed")

    manager.update_brand(brand_id, {"reel_divider_logo_path": logo_url}, user_id=user["id"])

    return {
        "success": True,
        "reel_divider_logo": logo_url,
    }


@router.post("/{brand_id}/content-logo")
async def upload_content_logo(
    brand_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Upload or replace the content/reel header logo for a brand."""
    manager = get_brand_manager(db)
    brand = manager.get_brand(brand_id, user_id=user["id"])
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    extension = Path(file.filename).suffix.lower() or ".png"
    ext = extension.lstrip(".")
    if ext not in ("png", "jpg", "jpeg", "webp", "svg"):
        raise HTTPException(status_code=400, detail="Invalid image format")

    content = await file.read()
    filename = f"{brand_id}_reel_content_logo.{ext}"
    remote_path = storage_path(user["id"], brand_id, "logos", filename)
    try:
        logo_url = upload_bytes("brand-assets", remote_path, content, f"image/{ext}")
    except StorageError as e:
        logger.error("Content logo upload failed for %s: %s", brand_id, e)
        raise HTTPException(status_code=500, detail="Logo upload failed")

    manager.update_brand(brand_id, {"reel_content_logo_path": logo_url}, user_id=user["id"])

    return {
        "success": True,
        "reel_content_logo": logo_url,
    }
