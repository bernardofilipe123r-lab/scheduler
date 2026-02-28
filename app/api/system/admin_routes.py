"""
Admin user management API routes — SUPER_ADMIN only.

Endpoints:
- GET  /api/admin/users                          List all users
- PUT  /api/admin/users/{id}/role                Update user role (super_admin/admin/user/blocked)
- GET  /api/admin/users/{id}/brands              Get brands owned by a user
- GET  /api/admin/users/{id}/scheduled           Get all scheduled posts for a user
- GET  /api/admin/users/{id}/logs                Get system logs for a specific user
"""

import asyncio
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import cast, String, or_

from app.db_connection import get_db
from app.models import LogEntry
from app.api.auth.middleware import get_current_user, get_supabase_client, is_super_admin_user

router = APIRouter(tags=["admin"])


def _require_super_admin(user: dict) -> None:
    if not is_super_admin_user(user):
        raise HTTPException(status_code=403, detail="Super admin access required")


class UpdateRoleRequest(BaseModel):
    role: str  # "super_admin" | "admin" | "user" | "blocked"


# ─── List Users ──────────────────────────────────────────────────────────────

@router.get("/api/admin/users", summary="List all users (super admin only)")
async def list_users(user: dict = Depends(get_current_user)):
    _require_super_admin(user)

    supabase = get_supabase_client()
    response = await asyncio.to_thread(lambda: supabase.auth.admin.list_users())

    users = []
    for u in response:
        app_meta = u.app_metadata or {}
        user_meta = u.user_metadata or {}
        role = app_meta.get("role", "user")
        is_blocked = bool(app_meta.get("is_blocked"))
        users.append({
            "id": u.id,
            "email": u.email or "",
            "name": user_meta.get("name") or user_meta.get("full_name") or "",
            "role": role,
            "is_admin": bool(app_meta.get("is_admin")),
            "is_super_admin": role == "super_admin" or bool(app_meta.get("is_super_admin")),
            "is_blocked": is_blocked,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_sign_in_at": u.last_sign_in_at.isoformat() if u.last_sign_in_at else None,
        })

    return {"users": users}


# ─── Update User Role ─────────────────────────────────────────────────────────

@router.put("/api/admin/users/{target_user_id}/role", summary="Update a user's role (super admin only)")
async def update_user_role(
    target_user_id: str,
    request: UpdateRoleRequest,
    user: dict = Depends(get_current_user),
):
    _require_super_admin(user)

    if target_user_id == user.get("id"):
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    valid_roles = ("super_admin", "admin", "user", "blocked")
    if request.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role '{request.role}'. Must be one of: {valid_roles}")

    supabase = get_supabase_client()

    # Fetch current app_metadata to preserve provider info
    existing_resp = await asyncio.to_thread(
        lambda: supabase.auth.admin.get_user_by_id(target_user_id)
    )
    existing_meta = existing_resp.user.app_metadata or {}

    role_map = {
        "super_admin": {"role": "super_admin", "is_admin": True, "is_super_admin": True, "is_blocked": False},
        "admin":       {"role": "admin",        "is_admin": True,  "is_super_admin": False, "is_blocked": False},
        "user":        {"role": "user",          "is_admin": False, "is_super_admin": False, "is_blocked": False},
        "blocked":     {"role": "user",          "is_admin": False, "is_super_admin": False, "is_blocked": True},
    }

    new_meta = {
        "provider": existing_meta.get("provider", "email"),
        "providers": existing_meta.get("providers", ["email"]),
        **role_map[request.role],
    }

    await asyncio.to_thread(
        lambda: supabase.auth.admin.update_user_by_id(target_user_id, {"app_metadata": new_meta})
    )

    return {"success": True, "user_id": target_user_id, "role": request.role}


# ─── Get User NicheConfig (Content DNA) ──────────────────────────────────────

@router.get("/api/admin/users/{target_user_id}/niche-config", summary="Get Content DNA for a user (super admin only)")
def get_user_niche_config(
    target_user_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _require_super_admin(user)

    from app.models.niche_config import NicheConfig
    configs = db.query(NicheConfig).filter(NicheConfig.user_id == target_user_id).all()

    def _serialize(c: NicheConfig) -> dict:
        return {
            "id": c.id,
            # Core Identity
            "niche_name": c.niche_name,
            "niche_description": c.niche_description,
            "content_brief": c.content_brief,
            "target_audience": c.target_audience,
            "audience_description": c.audience_description,
            # Tone
            "content_tone": c.content_tone or [],
            "tone_avoid": c.tone_avoid or [],
            # Topics
            "topic_categories": c.topic_categories or [],
            "topic_keywords": c.topic_keywords or [],
            "topic_avoid": c.topic_avoid or [],
            # Philosophy
            "content_philosophy": c.content_philosophy,
            "hook_themes": c.hook_themes or [],
            # Brand personality
            "brand_personality": c.brand_personality,
            "brand_focus_areas": c.brand_focus_areas or [],
            "parent_brand_name": c.parent_brand_name,
            # Discovery
            "competitor_accounts": c.competitor_accounts or [],
            "discovery_hashtags": c.discovery_hashtags or [],
            # CTAs & hashtags
            "cta_options": c.cta_options or [],
            "hashtags": c.hashtags or [],
            "carousel_cta_options": c.carousel_cta_options or [],
            "carousel_cta_topic": c.carousel_cta_topic,
            # Visual
            "image_style_description": c.image_style_description,
            "image_palette_keywords": c.image_palette_keywords or [],
            # Citation
            "citation_style": c.citation_style,
            "citation_source_types": c.citation_source_types or [],
            # Carousel overlays
            "carousel_cover_overlay_opacity": c.carousel_cover_overlay_opacity,
            "carousel_content_overlay_opacity": c.carousel_content_overlay_opacity,
            # Caption sections
            "follow_section_text": c.follow_section_text,
            "save_section_text": c.save_section_text,
            "disclaimer_text": c.disclaimer_text,
            # Timestamps
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }

    return {"niche_configs": [_serialize(c) for c in configs]}


# ─── Get User Brands ──────────────────────────────────────────────────────────

@router.get("/api/admin/users/{target_user_id}/brands", summary="Get brands for a user (super admin only)")
async def get_user_brands(
    target_user_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _require_super_admin(user)

    from app.models import Brand
    brands = db.query(Brand).filter(Brand.user_id == target_user_id, Brand.active == True).all()

    return {
        "brands": [
            {
                "id": b.id,
                "display_name": b.display_name,
                "short_name": b.short_name,
                "active": b.active,
                # Social handles
                "instagram_handle": b.instagram_handle,
                "facebook_page_name": getattr(b, "facebook_page_name", None),
                "youtube_channel_name": getattr(b, "youtube_channel_name", None),
                # Scheduling
                "posts_per_day": getattr(b, "posts_per_day", None),
                "schedule_offset": getattr(b, "schedule_offset", None),
                "baseline_for_content": getattr(b, "baseline_for_content", False),
                # Colors
                "colors": b.colors if b.colors else {},
                # Credentials presence (never expose tokens)
                "has_instagram": bool(
                    getattr(b, "instagram_business_account_id", None)
                    and (getattr(b, "instagram_access_token", None) or getattr(b, "meta_access_token", None))
                ),
                "has_facebook": bool(
                    getattr(b, "facebook_page_id", None)
                    and getattr(b, "facebook_access_token", None)
                ),
                "instagram_business_account_id": getattr(b, "instagram_business_account_id", None),
                "facebook_page_id": getattr(b, "facebook_page_id", None),
                # Logo
                "logo_path": getattr(b, "logo_path", None),
                # Timestamps
                "created_at": b.created_at.isoformat() if b.created_at else None,
                "updated_at": b.updated_at.isoformat() if b.updated_at else None,
            }
            for b in brands
        ]
    }


# ─── Get User Scheduled Posts ─────────────────────────────────────────────────

@router.get("/api/admin/users/{target_user_id}/scheduled", summary="Get scheduled posts for a user (super admin only)")
def get_user_scheduled(
    target_user_id: str,
    user: dict = Depends(get_current_user),
):
    _require_super_admin(user)

    from app.services.publishing.scheduler import DatabaseSchedulerService
    scheduler_service = DatabaseSchedulerService()
    schedules = scheduler_service.get_all_scheduled(user_id=target_user_id)

    formatted_schedules = []
    for schedule in schedules:
        metadata = schedule.get("metadata", {})
        thumb_url = metadata.get("thumbnail_path")
        video_url = metadata.get("video_path")
        carousel_urls = metadata.get("carousel_paths") or []

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
            "created_by": schedule.get("created_by", "user"),
            "metadata": {
                "brand": metadata.get("brand"),
                "variant": metadata.get("variant"),
                "platforms": metadata.get("platforms"),
                "video_path": video_url,
                "thumbnail_path": thumb_url,
                "carousel_paths": carousel_urls,
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


# ─── Delete User ─────────────────────────────────────────────────────────────

@router.delete("/api/admin/users/{target_user_id}", summary="Delete a user permanently (super admin only)")
async def delete_user(
    target_user_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _require_super_admin(user)

    if target_user_id == user.get("id"):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    from app.models import (
        Brand, GenerationJob, ScheduledReel, NicheConfig, UserProfile,
        BrandAnalytics, AnalyticsRefreshLog, AnalyticsSnapshot, ContentHistory,
        PostPerformance, TrendingContent, YouTubeChannel,
        TobyState, TobyExperiment, TobyStrategyScore, TobyActivityLog, TobyContentTag,
    )

    # Delete all user data from application tables (order matters for FK safety)
    db.query(TobyContentTag).filter(TobyContentTag.user_id == target_user_id).delete(synchronize_session=False)
    db.query(TobyActivityLog).filter(TobyActivityLog.user_id == target_user_id).delete(synchronize_session=False)
    db.query(TobyStrategyScore).filter(TobyStrategyScore.user_id == target_user_id).delete(synchronize_session=False)
    db.query(TobyExperiment).filter(TobyExperiment.user_id == target_user_id).delete(synchronize_session=False)
    db.query(TobyState).filter(TobyState.user_id == target_user_id).delete(synchronize_session=False)
    db.query(TrendingContent).filter(TrendingContent.user_id == target_user_id).delete(synchronize_session=False)
    db.query(PostPerformance).filter(PostPerformance.user_id == target_user_id).delete(synchronize_session=False)
    db.query(ContentHistory).filter(ContentHistory.user_id == target_user_id).delete(synchronize_session=False)
    db.query(AnalyticsSnapshot).filter(AnalyticsSnapshot.user_id == target_user_id).delete(synchronize_session=False)
    db.query(AnalyticsRefreshLog).filter(AnalyticsRefreshLog.user_id == target_user_id).delete(synchronize_session=False)
    db.query(BrandAnalytics).filter(BrandAnalytics.user_id == target_user_id).delete(synchronize_session=False)
    db.query(YouTubeChannel).filter(YouTubeChannel.user_id == target_user_id).delete(synchronize_session=False)
    db.query(ScheduledReel).filter(ScheduledReel.user_id == target_user_id).delete(synchronize_session=False)
    db.query(GenerationJob).filter(GenerationJob.user_id == target_user_id).delete(synchronize_session=False)
    db.query(NicheConfig).filter(NicheConfig.user_id == target_user_id).delete(synchronize_session=False)
    db.query(Brand).filter(Brand.user_id == target_user_id).delete(synchronize_session=False)
    db.query(UserProfile).filter(UserProfile.user_id == target_user_id).delete(synchronize_session=False)
    db.commit()

    # Finally, remove from Supabase Auth so they can no longer sign in
    supabase = get_supabase_client()
    await asyncio.to_thread(
        lambda: supabase.auth.admin.delete_user(target_user_id)
    )

    return {"success": True, "user_id": target_user_id}


# ─── Delete Brand ─────────────────────────────────────────────────────────────

@router.delete("/api/admin/brands/{brand_id}", summary="Delete a brand permanently (super admin only)")
def delete_brand(
    brand_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _require_super_admin(user)

    from app.models import Brand
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")

    db.delete(brand)
    db.commit()

    return {"success": True, "brand_id": brand_id}


# ─── Get User Logs ────────────────────────────────────────────────────────────

@router.get("/api/admin/users/{target_user_id}/logs", summary="Get logs for a specific user (super admin only)")
def get_user_logs(
    target_user_id: str,
    level: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    since_minutes: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    order: str = Query("desc"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _require_super_admin(user)

    marker = f'"user_id": "{target_user_id}"'
    query = db.query(LogEntry).filter(cast(LogEntry.details, String).ilike(f"%{marker}%"))

    if level:
        levels = [lv.strip().upper() for lv in level.split(",")]
        query = query.filter(LogEntry.level.in_(levels))

    if category:
        cats = [c.strip() for c in category.split(",")]
        query = query.filter(LogEntry.category.in_(cats))

    if search:
        query = query.filter(
            or_(
                LogEntry.message.ilike(f"%{search}%"),
                cast(LogEntry.details, String).ilike(f"%{search}%"),
            )
        )

    if since_minutes:
        cutoff = datetime.utcnow() - timedelta(minutes=since_minutes)
        query = query.filter(LogEntry.timestamp >= cutoff)

    total = query.count()

    if order == "asc":
        query = query.order_by(LogEntry.timestamp.asc())
    else:
        query = query.order_by(LogEntry.timestamp.desc())

    offset = (page - 1) * page_size
    logs = query.offset(offset).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "logs": [log.to_dict() for log in logs],
    }


# ─── AI Service Credits ───────────────────────────────────────────────────────

@router.get("/api/admin/credits", summary="Fetch AI service credit balances (super admin only)")
async def get_ai_credits(user: dict = Depends(get_current_user)):
    """Return remaining credits / balance for DeepSeek and DeAPI."""
    _require_super_admin(user)

    import os
    import httpx

    results: dict = {}

    # ── DeepSeek balance ─────────────────────────────────────────────
    deepseek_key = os.getenv("DEEPSEEK_API_KEY")
    if deepseek_key:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.deepseek.com/user/balance",
                    headers={"Authorization": f"Bearer {deepseek_key}"},
                )
            if resp.status_code == 200:
                data = resp.json()
                results["deepseek"] = {
                    "available": data.get("is_available", False),
                    "balance_infos": data.get("balance_infos", []),
                }
            else:
                results["deepseek"] = {"error": f"HTTP {resp.status_code}"}
        except Exception as exc:
            results["deepseek"] = {"error": str(exc)}
    else:
        results["deepseek"] = {"error": "API key not configured"}

    # ── DeAPI credits ────────────────────────────────────────────────
    deapi_key = os.getenv("DEAPI_API_KEY")
    if deapi_key:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.deapi.ai/api/v1/client/credits",
                    headers={"Authorization": f"Bearer {deapi_key}"},
                )
            if resp.status_code == 200:
                results["deapi"] = resp.json()
            else:
                results["deapi"] = {"error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
        except Exception as exc:
            results["deapi"] = {"error": str(exc)}
    else:
        results["deapi"] = {"error": "API key not configured"}

    return results
