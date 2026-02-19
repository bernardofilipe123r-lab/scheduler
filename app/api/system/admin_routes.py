"""
Admin user management API routes — SUPER_ADMIN only.

Endpoints:
- GET  /api/admin/users                          List all users
- PUT  /api/admin/users/{id}/role                Update user role (super_admin/admin/user/blocked)
- GET  /api/admin/users/{id}/brands              Get brands owned by a user
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
                "instagram_handle": b.instagram_handle,
                "facebook_page_name": getattr(b, "facebook_page_name", None),
                "youtube_channel_name": getattr(b, "youtube_channel_name", None),
            }
            for b in brands
        ]
    }


# ─── Delete User ─────────────────────────────────────────────────────────────

@router.delete("/api/admin/users/{target_user_id}", summary="Delete a user permanently (super admin only)")
async def delete_user(
    target_user_id: str,
    user: dict = Depends(get_current_user),
):
    _require_super_admin(user)

    if target_user_id == user.get("id"):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

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
