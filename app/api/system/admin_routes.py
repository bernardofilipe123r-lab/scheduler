"""
Admin user management API routes — SUPER_ADMIN only.

Endpoints:
- GET  /api/admin/users                          List all users
- PUT  /api/admin/users/{id}/role                Update user role (super_admin/admin/user/blocked)
- GET  /api/admin/users/{id}/brands              Get brands owned by a user
- GET  /api/admin/users/{id}/scheduled           Get all scheduled posts for a user
- GET  /api/admin/users/{id}/logs                Get system logs for a specific user
- GET  /api/admin/supabase-usage                 Supabase usage metrics (super admin only)
- GET  /api/admin/error-digest                   Condensed error summary (last 48h)
- GET  /api/admin/format-violations              Proactive format pattern violation check
- GET  /api/admin/music                          List music library files
- POST /api/admin/music/download                 Download songs via yt-dlp
- DELETE /api/admin/music/{filename}             Delete a music file
"""

import asyncio
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import cast, String, or_, func, and_

from app.db_connection import get_db
from app.models import LogEntry
from app.api.auth.middleware import get_current_user, get_supabase_client, is_super_admin_user
from app.core.platforms import PLATFORM_CREDENTIAL_CHECKS

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
                # Credentials presence (never expose tokens) — uses platform registry
                **{f"has_{p}": check(b) for p, check in PLATFORM_CREDENTIAL_CHECKS.items()},
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

    # ── Step 1: Delete from Supabase Auth FIRST ──
    # If this fails, we don't touch app data — the user can still log in
    # and their data remains consistent.
    supabase = get_supabase_client()
    try:
        await asyncio.to_thread(
            lambda: supabase.auth.admin.delete_user(target_user_id)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete user from auth provider: {str(e)}",
        )

    # ── Step 2: Clean up all app data (auth user is already gone) ──
    from app.models import (
        Brand, GenerationJob, ScheduledReel, NicheConfig, UserProfile,
        BrandAnalytics, AnalyticsRefreshLog, AnalyticsSnapshot, ContentHistory,
        PostPerformance, TrendingContent, YouTubeChannel,
        TobyState, TobyExperiment, TobyStrategyScore, TobyActivityLog, TobyContentTag,
        TobyEpisodicMemory, TobySemanticMemory, TobyProceduralMemory, TobyWorldModel,
        TobyStrategyCombos, TobyRawSignal, TobyMetaReport, TobyReasoningTrace,
    )
    from app.models.oauth_state import OAuthState

    try:
        # Cognitive memory tables
        db.query(TobyReasoningTrace).filter(TobyReasoningTrace.user_id == target_user_id).delete(synchronize_session=False)
        db.query(TobyMetaReport).filter(TobyMetaReport.user_id == target_user_id).delete(synchronize_session=False)
        db.query(TobyRawSignal).filter(TobyRawSignal.user_id == target_user_id).delete(synchronize_session=False)
        db.query(TobyStrategyCombos).filter(TobyStrategyCombos.user_id == target_user_id).delete(synchronize_session=False)
        db.query(TobyWorldModel).filter(TobyWorldModel.user_id == target_user_id).delete(synchronize_session=False)
        db.query(TobyProceduralMemory).filter(TobyProceduralMemory.user_id == target_user_id).delete(synchronize_session=False)
        db.query(TobySemanticMemory).filter(TobySemanticMemory.user_id == target_user_id).delete(synchronize_session=False)
        db.query(TobyEpisodicMemory).filter(TobyEpisodicMemory.user_id == target_user_id).delete(synchronize_session=False)
        # Core Toby tables
        db.query(TobyContentTag).filter(TobyContentTag.user_id == target_user_id).delete(synchronize_session=False)
        db.query(TobyActivityLog).filter(TobyActivityLog.user_id == target_user_id).delete(synchronize_session=False)
        db.query(TobyStrategyScore).filter(TobyStrategyScore.user_id == target_user_id).delete(synchronize_session=False)
        db.query(TobyExperiment).filter(TobyExperiment.user_id == target_user_id).delete(synchronize_session=False)
        db.query(TobyState).filter(TobyState.user_id == target_user_id).delete(synchronize_session=False)
        # Analytics
        db.query(TrendingContent).filter(TrendingContent.user_id == target_user_id).delete(synchronize_session=False)
        db.query(PostPerformance).filter(PostPerformance.user_id == target_user_id).delete(synchronize_session=False)
        db.query(ContentHistory).filter(ContentHistory.user_id == target_user_id).delete(synchronize_session=False)
        db.query(AnalyticsSnapshot).filter(AnalyticsSnapshot.user_id == target_user_id).delete(synchronize_session=False)
        db.query(AnalyticsRefreshLog).filter(AnalyticsRefreshLog.user_id == target_user_id).delete(synchronize_session=False)
        db.query(BrandAnalytics).filter(BrandAnalytics.user_id == target_user_id).delete(synchronize_session=False)
        # Content & scheduling
        db.query(YouTubeChannel).filter(YouTubeChannel.user_id == target_user_id).delete(synchronize_session=False)
        db.query(ScheduledReel).filter(ScheduledReel.user_id == target_user_id).delete(synchronize_session=False)
        db.query(GenerationJob).filter(GenerationJob.user_id == target_user_id).delete(synchronize_session=False)
        # OAuth states
        db.query(OAuthState).filter(OAuthState.user_id == target_user_id).delete(synchronize_session=False)
        # Config & identity
        db.query(NicheConfig).filter(NicheConfig.user_id == target_user_id).delete(synchronize_session=False)
        db.query(Brand).filter(Brand.user_id == target_user_id).delete(synchronize_session=False)
        db.query(UserProfile).filter(UserProfile.user_id == target_user_id).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
        # Auth user is already deleted — app data is orphaned but harmless.
        # The user cannot log in, and get_or_create_user will handle
        # any email collisions on re-signup.

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
                    "https://api.deapi.ai/api/v1/client/balance",
                    headers={"Authorization": f"Bearer {deapi_key}"},
                )
            if resp.status_code == 200:
                results["deapi"] = resp.json()
            else:
                # Truncate to avoid huge HTML 404 pages swamping the response
                body = resp.text[:120].replace('\n', ' ')
                results["deapi"] = {"error": f"HTTP {resp.status_code}", "detail": body}
        except Exception as exc:
            results["deapi"] = {"error": str(exc)}
    else:
        results["deapi"] = {"error": "API key not configured"}

    # ── Freepik credits (calculated from local usage tracking) ─────
    freepik_key = os.getenv("FREEPIK_API_KEY")
    if freepik_key:
        # Calculate remaining budget from local cost tracking
        try:
            from app.services.monitoring.cost_tracker import FREEPIK_COST_PER_IMAGE
            from app.models.api_usage import APIUsageLog
            from sqlalchemy import func

            total_budget_eur = float(os.getenv("FREEPIK_TOTAL_BUDGET_EUR", "5.0"))
            daily_limit = int(os.getenv("FREEPIK_DAILY_LIMIT", "100"))

            # Count all-time Freepik calls from api_usage_log
            total_calls = 0
            try:
                from app.db_connection import get_db_session
                with get_db_session() as fdb:
                    total_calls = (
                        fdb.query(func.count(APIUsageLog.id))
                        .filter(APIUsageLog.api_name == "freepik")
                        .scalar() or 0
                    )
            except Exception:
                pass

            spent_eur = round(total_calls * FREEPIK_COST_PER_IMAGE, 2)
            remaining_eur = round(total_budget_eur - spent_eur, 2)

            results["freepik"] = {
                "configured": True,
                "daily_limit": daily_limit,
                "total_budget_eur": total_budget_eur,
                "spent_eur": spent_eur,
                "remaining_eur": max(0, remaining_eur),
                "total_calls": total_calls,
            }
        except Exception as exc:
            results["freepik"] = {"configured": True, "error": str(exc)}
    else:
        results["freepik"] = {"error": "API key not configured"}

    # ── Pexels credits (free API — tracked for monitoring) ──────────
    pexels_key = os.getenv("PEXELS_API_KEY")
    if pexels_key:
        try:
            # Monthly limit: 20,000 requests/month (free)
            monthly_limit = 20000

            pexels_total_calls = 0
            try:
                from app.db_connection import get_db_session
                with get_db_session() as pdb:
                    from app.models.api_usage import APIUsageLog as PLog
                    from datetime import datetime as _dt, timezone as _tz
                    month_start = _dt.now(_tz.utc).replace(day=1, hour=0, minute=0, second=0)
                    pexels_total_calls = (
                        pdb.query(func.count(PLog.id))
                        .filter(PLog.api_name == "pexels", PLog.called_at >= month_start)
                        .scalar() or 0
                    )
            except Exception:
                pass

            results["pexels"] = {
                "configured": True,
                "monthly_limit": monthly_limit,
                "used_this_month": pexels_total_calls,
                "remaining": max(0, monthly_limit - pexels_total_calls),
                "cost_per_search": 0.0,
                "total_cost_usd": 0.0,
            }
        except Exception as exc:
            results["pexels"] = {"configured": True, "error": str(exc)}
    else:
        results["pexels"] = {"error": "API key not configured"}

    # Include current global image source mode (from DB, persistent across deploys)
    try:
        from app.db_connection import get_db_session as _get_db_session
        from app.models.format_b_design import FormatBDesign
        from app.services.media.image_sourcer import GLOBAL_FORMAT_B_SETTINGS_USER_ID
        with _get_db_session() as _isdb:
            design = _isdb.query(FormatBDesign).filter(
                FormatBDesign.user_id == GLOBAL_FORMAT_B_SETTINGS_USER_ID
            ).first()
            results["image_source_mode"] = (design.image_source_mode if design and design.image_source_mode else "ai")
    except Exception:
        results["image_source_mode"] = os.getenv("FORMAT_B_IMAGE_SOURCE", "ai")

    return results


# ─── Image Source Toggle ──────────────────────────────────────────────────────

class ImageSourceToggleRequest(BaseModel):
    mode: str  # "ai" or "web"


@router.put("/api/admin/image-source", summary="Toggle Format B image source (super admin only)")
async def set_image_source(
    request: ImageSourceToggleRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set the image source for Format B video slides. Changes take effect on next job."""
    _require_super_admin(user)

    if request.mode not in ("ai", "web"):
        raise HTTPException(status_code=400, detail="Mode must be 'ai' or 'web'")

    # Persist globally to database (survives deploys and applies to all users)
    from app.models.format_b_design import FormatBDesign
    from app.services.media.image_sourcer import GLOBAL_FORMAT_B_SETTINGS_USER_ID
    design = db.query(FormatBDesign).filter(
        FormatBDesign.user_id == GLOBAL_FORMAT_B_SETTINGS_USER_ID
    ).first()
    if design:
        design.image_source_mode = request.mode
    else:
        design = FormatBDesign(user_id=GLOBAL_FORMAT_B_SETTINGS_USER_ID, image_source_mode=request.mode)
        db.add(design)
    db.commit()

    # Also set env var for backward compatibility within this process
    os.environ["FORMAT_B_IMAGE_SOURCE"] = request.mode

    return {"mode": request.mode, "message": f"Image source set to '{request.mode}'. Takes effect on next job."}


# ─── Supabase Usage Metrics ───────────────────────────────────────────────────

def _extract_project_ref(supabase_url: str) -> str | None:
    """Extract Supabase project ref from the URL (e.g. 'abcdef123' from 'https://abcdef123.supabase.co')."""
    import re
    m = re.match(r"https?://([a-z0-9]+)\.supabase\.co", supabase_url.strip().rstrip("/"))
    return m.group(1) if m else None


@router.get("/api/admin/supabase-usage", summary="Supabase usage metrics (super admin only)")
async def get_supabase_usage(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return Supabase project usage metrics: DB size, storage, egress, MAU, realtime, etc."""
    _require_super_admin(user)

    import os
    import httpx
    from sqlalchemy import text

    result: dict = {"db_stats": {}, "usage": None, "error": None}

    # ── Direct DB stats (always available) ───────────────────────────
    try:
        row = db.execute(text(
            "SELECT pg_database_size(current_database()) AS db_bytes"
        )).fetchone()
        db_bytes = row[0] if row else 0

        table_rows = db.execute(text(
            "SELECT schemaname, relname, n_live_tup "
            "FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20"
        )).fetchall()

        active_conns = db.execute(text(
            "SELECT count(*) FROM pg_stat_activity WHERE state = 'active'"
        )).fetchone()

        total_conns = db.execute(text(
            "SELECT count(*) FROM pg_stat_activity"
        )).fetchone()

        result["db_stats"] = {
            "database_size_bytes": db_bytes,
            "database_size_mb": round(db_bytes / (1024 * 1024), 2) if db_bytes else 0,
            "active_connections": active_conns[0] if active_conns else 0,
            "total_connections": total_conns[0] if total_conns else 0,
            "top_tables": [
                {"schema": r[0], "table": r[1], "row_count": r[2]}
                for r in table_rows
            ],
        }
    except Exception as exc:
        result["db_stats"] = {"error": str(exc)}

    # ── Supabase Management API (requires SUPABASE_MANAGEMENT_KEY) ───
    mgmt_key = os.getenv("SUPABASE_MANAGEMENT_KEY")
    supabase_url = os.getenv("SUPABASE_URL", "")
    project_ref = _extract_project_ref(supabase_url)

    if not mgmt_key:
        result["usage"] = None
        result["error"] = (
            "SUPABASE_MANAGEMENT_KEY not configured. "
            "Generate one at https://supabase.com/dashboard/account/tokens "
            "and set it as an environment variable."
        )
        return result

    if not project_ref:
        result["usage"] = None
        result["error"] = f"Could not extract project ref from SUPABASE_URL: {supabase_url}"
        return result

    # Fetch data from Supabase Management API
    headers = {"Authorization": f"Bearer {mgmt_key}"}
    base = "https://api.supabase.com"

    usage_data: dict = {}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            # ── Usage metrics ────────────────────────────────────────
            metric_categories = [
                "egress", "db_size", "storage_size", "monthly_active_users",
                "realtime_message_count", "realtime_peak_connections",
                "func_invocations", "storage_image_render_count",
            ]
            usage_tasks = [
                client.get(f"{base}/v1/projects/{project_ref}/usage?metric={m}", headers=headers)
                for m in metric_categories
            ]

            # ── Extra API endpoints (project info, health, configs, etc.) ──
            extra_endpoints = {
                "project_info":      f"{base}/v1/projects/{project_ref}",
                "health":            f"{base}/v1/projects/{project_ref}/health?services=auth,realtime,storage,postgrest",
                "disk_util":         f"{base}/v1/projects/{project_ref}/config/disk/util",
                "disk_config":       f"{base}/v1/projects/{project_ref}/config/disk",
                "postgres_config":   f"{base}/v1/projects/{project_ref}/config/database/postgres",
                "pooler_config":     f"{base}/v1/projects/{project_ref}/config/database/pooler",
                "postgrest_config":  f"{base}/v1/projects/{project_ref}/postgrest",
                "storage_config":    f"{base}/v1/projects/{project_ref}/config/storage",
                "storage_buckets":   f"{base}/v1/projects/{project_ref}/storage/buckets",
                "backups":           f"{base}/v1/projects/{project_ref}/database/backups",
                "edge_functions":    f"{base}/v1/projects/{project_ref}/functions",
                "realtime_config":   f"{base}/v1/projects/{project_ref}/config/realtime",
                "readonly_mode":     f"{base}/v1/projects/{project_ref}/readonly",
                "ssl_enforcement":   f"{base}/v1/projects/{project_ref}/ssl-enforcement",
                "billing_addons":    f"{base}/v1/projects/{project_ref}/billing/addons",
                "api_usage_counts":  f"{base}/v1/projects/{project_ref}/analytics/endpoints/usage.api-counts",
                "perf_advisors":     f"{base}/v1/projects/{project_ref}/advisors/performance",
                "security_advisors": f"{base}/v1/projects/{project_ref}/advisors/security",
            }
            extra_keys = list(extra_endpoints.keys())
            extra_tasks = [client.get(url, headers=headers) for url in extra_endpoints.values()]

            # Run all requests in parallel
            all_responses = await asyncio.gather(
                *usage_tasks, *extra_tasks, return_exceptions=True
            )

            # Parse usage metrics
            for metric, resp in zip(metric_categories, all_responses[:len(metric_categories)]):
                if isinstance(resp, Exception):
                    usage_data[metric] = {"error": str(resp)}
                elif resp.status_code == 200:
                    usage_data[metric] = resp.json()
                else:
                    usage_data[metric] = {"error": f"HTTP {resp.status_code}"}

            # Parse extra endpoints
            extra_data: dict = {}
            for key, resp in zip(extra_keys, all_responses[len(metric_categories):]):
                if isinstance(resp, Exception):
                    extra_data[key] = {"error": str(resp)}
                elif resp.status_code == 200:
                    extra_data[key] = resp.json()
                else:
                    extra_data[key] = {"error": f"HTTP {resp.status_code}"}

        result["usage"] = usage_data
        result["infrastructure"] = extra_data
    except Exception as exc:
        result["error"] = str(exc)

    return result


# ─── User Cost Tracking ──────────────────────────────────────────────────────

@router.get("/api/admin/users/{user_id}/costs", summary="Get per-user cost data (super admin only)")
async def get_user_costs_endpoint(
    user_id: str,
    period: str = Query("month", regex="^(day|week|month|all)$"),
    user: dict = Depends(get_current_user),
):
    """Get cost tracking data for a specific user."""
    _require_super_admin(user)

    from app.services.monitoring.cost_tracker import get_user_costs
    return get_user_costs(user_id, period)


@router.post("/api/admin/costs/aggregate", summary="Aggregate old daily cost records (super admin only)")
async def aggregate_costs_endpoint(user: dict = Depends(get_current_user)):
    """Aggregate daily cost records older than 30 days into monthly summaries."""
    _require_super_admin(user)

    from app.services.monitoring.cost_tracker import aggregate_old_daily_records
    archived = aggregate_old_daily_records()
    return {"archived": archived, "message": f"Aggregated {archived} daily records into monthly summaries"}


# ─── Error Digest (condensed errors, last 48h) ──────────────────────────────

def _normalize_error_message(msg: str) -> str:
    """Strip variable parts (IDs, timestamps, URLs) to group similar errors."""
    # Replace UUIDs
    msg = re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<id>', msg)
    # Replace job IDs like GEN-123456, TOBY-123456
    msg = re.sub(r'\b(GEN|TOBY|JOB)-\d+\b', r'\1-<id>', msg)
    # Replace long numeric IDs
    msg = re.sub(r'\b\d{10,}\b', '<id>', msg)
    # Replace quoted strings that look like dynamic content
    msg = re.sub(r'"[^"]{60,}"', '"<content>"', msg)
    # Replace HTTP URLs with just the host+path pattern
    msg = re.sub(r'https?://[^\s]+', '<url>', msg)
    # Replace timestamps
    msg = re.sub(r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\s]*', '<timestamp>', msg)
    return msg.strip()


def _normalize_http_path(path: str | None) -> str | None:
    """Normalize HTTP path for grouping (strip dynamic job/resource IDs)."""
    if not path:
        return path
    # /jobs/GEN-123456/next-slots → /jobs/<job>/next-slots
    path = re.sub(r'/(GEN|TOBY|JOB)-\d+', r'/<job>', path)
    # /jobs/<uuid>/... → /jobs/<id>/...
    path = re.sub(r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '/<id>', path)
    return path


def _extract_brands_from_context(message: str, details: dict | None) -> list[str]:
    """Extract brand names mentioned in error message or details."""
    brands = set()
    text = (message or "").lower()
    details = details or {}

    # Check details dict for brand fields
    for key in ("brand", "brand_name", "brand_id"):
        val = details.get(key)
        if val:
            brands.add(str(val).lower())

    # Extract common brand name patterns from message text
    # "for thepurecollege:" or "for brand healthycollege"
    for m in re.finditer(r'for (?:brand )?(\w+college\w*)', text):
        brands.add(m.group(1))
    for m in re.finditer(r'/(\w+college\w*)/', text):
        brands.add(m.group(1))

    return sorted(brands)


def _is_ignored_error_digest_log(message: str) -> bool:
    """Ignore known low-signal legacy errors from digest output."""
    msg = (message or "").lower()
    return (
        "failed to fetch facebook analytics for" in msg
        and "400 client error: bad request" in msg
        and "graph.facebook.com" in msg
    )


def _classify_priority(
    cat: str,
    count: int,
    affected_user_count: int,
    http_status: int | None,
    message: str,
) -> str:
    """Classify error priority: critical / high / medium / low."""
    msg_lower = (message or "").lower()

    # Critical: affects multiple users OR auth/billing failures
    if affected_user_count > 1:
        return "critical"
    if any(kw in msg_lower for kw in ("billing", "payment", "subscription", "stripe")):
        return "critical"
    if cat == "publishing" and count >= 10:
        return "critical"

    # High: 500 errors, publishing failures, ASGI exceptions
    if http_status and http_status >= 500 and count >= 5:
        return "high"
    if cat == "publishing":
        return "high"
    if "exception in asgi" in msg_lower:
        return "high"
    if cat == "ai_generation":
        return "high"

    # Medium: repeated errors, storage issues
    if count >= 5:
        return "medium"
    if "failed to delete" in msg_lower or "storage" in msg_lower:
        return "medium"
    if http_status and http_status >= 500:
        return "medium"

    # Low: isolated/infrequent errors
    return "low"


@router.get("/api/admin/error-digest", summary="Condensed error summary for last 48h (super admin only)")
def get_error_digest(
    hours: int = Query(48, ge=1, le=168),
    current_deployment: bool = Query(True, description="Only show errors from the current deployment"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Returns errors grouped by pattern with user info, brand context, and priority.
    Filters to current deployment by default (reset on redeploy).
    """
    _require_super_admin(user)

    from app.services.logging.service import DEPLOYMENT_ID
    from app.models.brands import Brand as BrandModel

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    # Build query
    query = (
        db.query(LogEntry)
        .filter(
            LogEntry.timestamp >= cutoff,
            LogEntry.level.in_(["ERROR", "CRITICAL"]),
        )
    )

    # Filter by current deployment if requested
    if current_deployment:
        query = query.filter(LogEntry.deployment_id == DEPLOYMENT_ID)

    error_logs = (
        query
        .order_by(LogEntry.timestamp.desc())
        .limit(2000)
        .all()
    )

    # Build user ID → display info cache (avoid N+1 queries)
    all_user_ids = set()
    for log in error_logs:
        details = log.details or {}
        uid = details.get("user_id")
        if uid:
            all_user_ids.add(uid)

    user_info_cache: dict[str, dict] = {}
    if all_user_ids:
        # Get user names from Supabase — use brands as a proxy for user display info
        user_brands = (
            db.query(BrandModel.user_id, func.string_agg(BrandModel.display_name, cast(', ', String)))
            .filter(BrandModel.user_id.in_(list(all_user_ids)))
            .group_by(BrandModel.user_id)
            .all()
        )
        for uid, brand_names in user_brands:
            user_info_cache[uid] = {"brands": brand_names or ""}

    # Group by normalized message pattern + category + normalized http_path
    groups: dict = defaultdict(lambda: {
        "count": 0,
        "affected_users": set(),
        "first_seen": None,
        "last_seen": None,
        "sample_error": None,
        "category": "",
        "sample_details": None,
        "http_path": None,
        "http_status": None,
        "brands": set(),
    })

    for log in error_logs:
        if _is_ignored_error_digest_log(log.message or ""):
            continue

        pattern_key = _normalize_error_message(log.message or "")
        cat = log.category or "error"

        # For HTTP requests, normalize the path for better grouping
        norm_path = _normalize_http_path(log.http_path) if cat == "http_request" else None
        if norm_path:
            group_key = f"{cat}::{log.http_status or ''}::{norm_path}::{pattern_key[:80]}"
        else:
            group_key = f"{cat}::{pattern_key}"

        g = groups[group_key]
        g["count"] += 1
        g["category"] = cat
        g["pattern"] = pattern_key

        # Track affected users
        details = log.details or {}
        uid = details.get("user_id")
        if uid:
            g["affected_users"].add(uid)

        # Extract brands from context
        extracted = _extract_brands_from_context(log.message, details)
        for b in extracted:
            g["brands"].add(b)

        # Track time range
        ts = log.timestamp
        if g["first_seen"] is None or ts < g["first_seen"]:
            g["first_seen"] = ts
        if g["last_seen"] is None or ts > g["last_seen"]:
            g["last_seen"] = ts

        # Keep first sample (most recent since ordered desc)
        if g["sample_error"] is None:
            g["sample_error"] = log.message
            g["sample_details"] = details
            g["http_path"] = log.http_path
            g["http_status"] = log.http_status

    # Build human-readable summaries and serialize
    digest = []
    for group_key, g in groups.items():
        affected = list(g["affected_users"])
        count = g["count"]
        cat = g["category"]
        pattern = g.get("pattern", "")

        # Build affected user info list
        affected_user_info = []
        for uid in affected[:10]:  # Limit to 10 users
            info = user_info_cache.get(uid, {})
            affected_user_info.append({
                "user_id": uid,
                "brands": info.get("brands", ""),
            })

        # Build human summary
        brand_list = sorted(g["brands"])
        brand_ctx = f" ({', '.join(brand_list[:3])})" if brand_list else ""

        if cat == "publishing":
            platform = "Unknown platform"
            for p in ["Threads", "Instagram", "Facebook", "YouTube", "TikTok", "Bluesky"]:
                if p.lower() in (pattern + (g["sample_error"] or "")).lower():
                    platform = p
                    break
            if len(affected) == 0:
                human = f"{platform} publishing failed{brand_ctx} ({count}x)"
            elif len(affected) == 1:
                human = f"{platform} publishing failed for 1 user{brand_ctx} ({count}x)"
            else:
                human = f"{platform} publishing failed for {len(affected)} users{brand_ctx} ({count}x)"
        elif cat == "http_request":
            path = _normalize_http_path(g["http_path"]) or "unknown endpoint"
            status = g["http_status"] or "error"
            if len(affected) == 0:
                human = f"HTTP {status} on {path} ({count}x)"
            elif len(affected) == 1:
                human = f"HTTP {status} on {path} for 1 user ({count}x)"
            else:
                human = f"HTTP {status} on {path} for {len(affected)} users ({count}x)"
        elif cat == "http_outbound":
            details_d = g["sample_details"] or {}
            service = details_d.get("service_name", "external API")
            human = f"{service} API call failed ({count}x)"
        elif cat == "ai_generation":
            human = f"AI generation error ({count}x)"
        elif cat == "scheduler":
            human = f"Scheduler error ({count}x)"
        else:
            short_msg = (g["sample_error"] or "Unknown error")[:80]
            human = f"{short_msg}{brand_ctx} ({count}x)"

        # Classify priority
        priority = _classify_priority(
            cat, count, len(affected), g["http_status"], g["sample_error"] or ""
        )

        # Build technical error string for copy
        sample_details = g["sample_details"] or {}
        technical_parts = [g["sample_error"] or ""]
        if sample_details.get("exception_type"):
            technical_parts.append(f"Exception: {sample_details['exception_type']}: {sample_details.get('exception_message', '')}")
        if sample_details.get("traceback"):
            tb = sample_details["traceback"]
            if isinstance(tb, list):
                tb = "".join(tb)
            technical_parts.append(f"Traceback:\n{tb}")
        if sample_details.get("response_body"):
            technical_parts.append(f"Response: {str(sample_details['response_body'])[:500]}")

        digest.append({
            "human_summary": human,
            "error_pattern": pattern,
            "category": cat,
            "count": count,
            "affected_users": [u["user_id"] for u in affected_user_info],
            "affected_user_info": affected_user_info,
            "affected_user_count": len(affected),
            "first_seen": g["first_seen"].isoformat() if g["first_seen"] else None,
            "last_seen": g["last_seen"].isoformat() if g["last_seen"] else None,
            "technical_error": "\n---\n".join(technical_parts),
            "http_path": g["http_path"],
            "http_status": g["http_status"],
            "priority": priority,
            "brands": brand_list,
        })

    # Sort by priority (critical first), then by count descending
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    digest.sort(key=lambda x: (priority_order.get(x["priority"], 9), -x["count"]))

    return {
        "hours": hours,
        "current_deployment": current_deployment,
        "deployment_id": DEPLOYMENT_ID,
        "total_errors": sum(g["count"] for g in digest),
        "unique_patterns": len(digest),
        "digest": digest,
    }


# ─── Format Integrity Monitor ───────────────────────────────────────────────

@router.get("/api/admin/format-violations", summary="Check reel format pattern violations across all users (super admin only)")
def get_format_violations(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Proactively detects reel format violations (e.g., consecutive same-variant
    reels that break Light→Dark alternation for Format A).

    Scans all users and brands. Returns violations grouped by user + brand.
    """
    _require_super_admin(user)

    from app.models.brands import Brand as BrandModel
    from app.models.jobs import GenerationJob
    from app.models.scheduling import ScheduledReel

    # Get all brands
    brands = db.query(BrandModel).all()
    brand_map = {}
    for b in brands:
        brand_map.setdefault(b.user_id, []).append(b)

    violations = []

    for uid, user_brands in brand_map.items():
        for brand in user_brands:
            # Get Format A reel jobs for this brand, ordered by scheduled time
            brand_reels = (
                db.query(
                    ScheduledReel.reel_id,
                    ScheduledReel.scheduled_time,
                    ScheduledReel.status,
                )
                .filter(
                    ScheduledReel.user_id == uid,
                    ScheduledReel.reel_id.contains(brand.id),
                )
                .order_by(ScheduledReel.scheduled_time.asc())
                .all()
            )

            if not brand_reels:
                continue

            # Look up variants from generation_jobs
            job_ids = set()
            for reel in brand_reels:
                # reel_id format: "TOBY-123456_brandname" or "GEN-123456_brandname"
                parts = reel.reel_id.split("_", 1)
                if parts:
                    job_ids.add(parts[0])

            if not job_ids:
                continue

            variant_map = {}
            job_rows = (
                db.query(GenerationJob.job_id, GenerationJob.variant, GenerationJob.content_format)
                .filter(GenerationJob.job_id.in_(list(job_ids)))
                .all()
            )
            for jr in job_rows:
                variant_map[jr.job_id] = (jr.variant, jr.content_format)

            # Check alternation pattern
            prev_variant = None
            prev_reel_id = None
            prev_sched = None
            for reel in brand_reels:
                parts = reel.reel_id.split("_", 1)
                job_id = parts[0] if parts else None
                info = variant_map.get(job_id)
                if not info:
                    continue
                variant, content_format = info

                # Only check Format A reels
                if content_format != "format_a" or variant not in ("light", "dark"):
                    continue

                if prev_variant is not None and prev_variant == variant:
                    violations.append({
                        "type": "consecutive_variant",
                        "format": "format_a",
                        "user_id": uid,
                        "brand_id": brand.id,
                        "brand_name": brand.display_name,
                        "detail": f"Consecutive '{variant}' reels: {prev_reel_id} ({prev_sched}) → {reel.reel_id} ({reel.scheduled_time})",
                        "reel_id": reel.reel_id,
                        "prev_reel_id": prev_reel_id,
                        "variant": variant,
                        "scheduled_time": reel.scheduled_time.isoformat() if reel.scheduled_time else None,
                        "prev_scheduled_time": prev_sched.isoformat() if prev_sched else None,
                    })

                prev_variant = variant
                prev_reel_id = reel.reel_id
                prev_sched = reel.scheduled_time

    # Group by user+brand for summary
    affected_brands = set()
    affected_users = set()
    for v in violations:
        affected_brands.add(v["brand_id"])
        affected_users.add(v["user_id"])

    return {
        "total_violations": len(violations),
        "affected_brands": len(affected_brands),
        "affected_users": len(affected_users),
        "violations": violations,
    }


# ─── Music Library Management ────────────────────────────────────────────────

class MusicDownloadRequest(BaseModel):
    songs_text: str  # Newline-separated list of song names


@router.get("/api/admin/music", summary="List music library (super admin only)")
async def list_music_library(user: dict = Depends(get_current_user)):
    """List all MP3 files in the music library."""
    _require_super_admin(user)

    from app.services.media.music_downloader import list_music_files
    files = list_music_files()
    return {"files": files, "count": len(files)}


@router.post("/api/admin/music/download", summary="Download songs via yt-dlp (super admin only)")
async def download_music(
    request: MusicDownloadRequest,
    user: dict = Depends(get_current_user),
):
    """Download songs from YouTube as MP3 into the music library.

    Accepts a newline-separated list of song names/queries.
    Uses yt-dlp to search YouTube and extract audio as MP3.
    """
    _require_super_admin(user)

    if not request.songs_text.strip():
        raise HTTPException(status_code=400, detail="No songs provided")

    songs = [s.strip() for s in request.songs_text.strip().split("\n") if s.strip()]
    if len(songs) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 songs per request")

    from app.services.media.music_downloader import download_songs
    result = await asyncio.to_thread(download_songs, request.songs_text)
    return result


@router.delete("/api/admin/music/{filename}", summary="Delete a music file (super admin only)")
async def delete_music_file(
    filename: str,
    user: dict = Depends(get_current_user),
):
    """Delete a music file from the library."""
    _require_super_admin(user)

    from app.services.media.music_downloader import delete_music_file as do_delete
    if do_delete(filename):
        return {"deleted": True, "filename": filename}
    raise HTTPException(status_code=404, detail=f"File '{filename}' not found")


@router.get("/api/admin/music/{filename}/stream", summary="Stream a music file (super admin only)")
async def stream_music_file(
    filename: str,
    user: dict = Depends(get_current_user),
):
    """Stream an MP3 file from the music library for playback."""
    _require_super_admin(user)

    from pathlib import Path as _Path
    from fastapi.responses import FileResponse
    from app.services.media.music_downloader import get_music_dir

    safe = _Path(filename).name
    file_path = get_music_dir() / safe
    if not file_path.exists() or file_path.suffix != ".mp3":
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found")

    return FileResponse(
        path=str(file_path),
        media_type="audio/mpeg",
        filename=safe,
    )
