"""
Deep health check endpoint — tests all critical subsystems with timing.
No authentication required.
"""
import os
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter
from sqlalchemy import text

from app.db_connection import SessionLocal

router = APIRouter(prefix="/api/system", tags=["system"])

_CHECK_TIMEOUT = 5  # seconds per check


def _timed_check(name: str, fn):
    """Run *fn* with a timeout and return a check result dict."""
    start = time.monotonic()
    try:
        result = fn()
        latency = round((time.monotonic() - start) * 1000, 1)
        return {"status": "ok", "latency_ms": latency, **(result or {})}
    except Exception as exc:
        latency = round((time.monotonic() - start) * 1000, 1)
        return {"status": "error", "latency_ms": latency, "error": str(exc)[:200]}


def _check_database():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
    finally:
        db.close()
    return None


def _check_brands_count():
    db = SessionLocal()
    try:
        row = db.execute(text("SELECT count(*) FROM brands")).scalar()
        return {"count": row}
    finally:
        db.close()


def _check_scheduled_count():
    db = SessionLocal()
    try:
        row = db.execute(text("SELECT count(*) FROM scheduled_reels")).scalar()
        return {"count": row}
    finally:
        db.close()


def _check_supabase_auth():
    supabase_url = os.getenv("SUPABASE_URL", "")
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL not configured")
    jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
    resp = httpx.get(jwks_url, timeout=3)
    resp.raise_for_status()
    return None


@router.get("/health-check")
async def deep_health_check():
    """
    Deep health check — tests database, auth, and key tables.
    Returns per-subsystem latency and overall status.
    """
    total_start = time.monotonic()

    checks = {
        "database": _timed_check("database", _check_database),
        "supabase_auth": _timed_check("supabase_auth", _check_supabase_auth),
        "brands_count": _timed_check("brands_count", _check_brands_count),
        "scheduled_count": _timed_check("scheduled_count", _check_scheduled_count),
    }

    total_latency = round((time.monotonic() - total_start) * 1000, 1)

    # Determine overall status
    db_ok = checks["database"]["status"] == "ok"
    all_ok = all(c["status"] == "ok" for c in checks.values())

    if all_ok:
        status = "healthy"
    elif db_ok:
        status = "degraded"
    else:
        status = "unhealthy"

    return {
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
        "total_latency_ms": total_latency,
    }


# ── AI Service Health (polls recent error logs) ─────────────────────
@router.get("/ai-health")
async def ai_service_health():
    """
    Return degraded AI services based on recent Toby error logs.
    Checks the last 30 min for patterns indicating image-gen or
    reasoning-model failures.  No auth required so the global
    banner can hit it cheaply.
    """
    from app.models.toby import TobyActivityLog

    window = datetime.now(timezone.utc) - __import__("datetime").timedelta(minutes=30)
    db = SessionLocal()
    try:
        errors = (
            db.query(TobyActivityLog.description)
            .filter(
                TobyActivityLog.action_type == "error",
                TobyActivityLog.created_at >= window,
            )
            .order_by(TobyActivityLog.created_at.desc())
            .limit(50)
            .all()
        )
    finally:
        db.close()

    image_gen_down = False
    reasoning_down = False
    image_gen_detail = ""
    reasoning_detail = ""

    image_keywords = ["media generation failed", "deapi", "rate limit", "daily limit", "ai image"]
    reasoning_keywords = ["deepseek", "reasoning model", "content generation failed"]

    for (desc,) in errors:
        lower = (desc or "").lower()
        if not image_gen_down and any(k in lower for k in image_keywords):
            image_gen_down = True
            image_gen_detail = "AI Image Generation is experiencing errors. Content with images may be delayed."
        if not reasoning_down and any(k in lower for k in reasoning_keywords):
            # Only flag reasoning if it's truly a DeepSeek error, not just a
            # wrapper for media generation.
            if "media generation failed" not in lower:
                reasoning_down = True
                reasoning_detail = "AI Reasoning Model is experiencing errors. Content generation may be delayed."
        if image_gen_down and reasoning_down:
            break

    services = []
    if image_gen_down:
        services.append({"name": "AI Image Generation", "status": "degraded", "detail": image_gen_detail})
    if reasoning_down:
        services.append({"name": "AI Reasoning Model", "status": "degraded", "detail": reasoning_detail})

    return {
        "ok": len(services) == 0,
        "services": services,
    }


# ── Social Platform API Health ───────────────────────────────────────
@router.get("/social-health")
async def social_api_health():
    """
    Check for recent social platform API errors (Meta/IG, YouTube, TikTok).
    Scans Toby error logs and publishing failures in the last 60 minutes.
    No auth required — the global banner calls this cheaply.
    """
    from app.models.toby import TobyActivityLog
    from app.models.scheduling import ScheduledReel
    from sqlalchemy import or_

    window = datetime.now(timezone.utc) - __import__("datetime").timedelta(minutes=60)
    db = SessionLocal()
    try:
        # Check Toby error logs
        errors = (
            db.query(TobyActivityLog.description)
            .filter(
                TobyActivityLog.action_type == "error",
                TobyActivityLog.created_at >= window,
            )
            .order_by(TobyActivityLog.created_at.desc())
            .limit(50)
            .all()
        )

        # Check recent publishing failures
        pub_failures = (
            db.query(ScheduledReel.publish_error)
            .filter(
                ScheduledReel.status == "failed",
                ScheduledReel.published_at >= window,
                ScheduledReel.publish_error.isnot(None),
            )
            .order_by(ScheduledReel.published_at.desc())
            .limit(20)
            .all()
        )
    finally:
        db.close()

    meta_down = False
    youtube_down = False
    tiktok_down = False
    meta_detail = ""
    youtube_detail = ""
    tiktok_detail = ""

    meta_keywords = [
        "meta api", "graph api", "instagram api", "facebook api",
        "ig publish", "fb publish", "media_publish", "oembed",
        "190", "token expired", "oauth", "(#100)", "(#10)",
    ]
    youtube_keywords = [
        "youtube api", "youtube data", "yt publish", "youtube upload",
        "quota exceeded", "youtube token", "google api",
    ]
    tiktok_keywords = [
        "tiktok api", "tiktok publish", "tiktok upload", "tiktok token",
    ]

    all_texts = [desc for (desc,) in errors] + [err for (err,) in pub_failures]
    for text in all_texts:
        lower = (text or "").lower()
        if not meta_down and any(k in lower for k in meta_keywords):
            meta_down = True
            meta_detail = "Meta API is experiencing issues. Some Instagram/Facebook posts may fail or be delayed."
        if not youtube_down and any(k in lower for k in youtube_keywords):
            youtube_down = True
            youtube_detail = "YouTube API is experiencing issues. YouTube publishing may be temporarily unavailable."
        if not tiktok_down and any(k in lower for k in tiktok_keywords):
            tiktok_down = True
            tiktok_detail = "TikTok API is experiencing issues. TikTok publishing may be temporarily unavailable."
        if meta_down and youtube_down and tiktok_down:
            break

    issues = []
    if meta_down:
        issues.append({"platform": "meta", "name": "Meta API (Instagram/Facebook)", "status": "degraded", "detail": meta_detail})
    if youtube_down:
        issues.append({"platform": "youtube", "name": "YouTube API", "status": "degraded", "detail": youtube_detail})
    if tiktok_down:
        issues.append({"platform": "tiktok", "name": "TikTok API", "status": "degraded", "detail": tiktok_detail})

    return {
        "ok": len(issues) == 0,
        "issues": issues,
    }

