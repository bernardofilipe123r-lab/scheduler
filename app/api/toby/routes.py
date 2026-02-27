"""
Toby API Routes — all Toby-related endpoints.

Endpoints:
  GET    /api/toby/status         — Current state, phase, buffer health
  POST   /api/toby/enable         — Turn Toby on
  POST   /api/toby/disable        — Turn Toby off
  POST   /api/toby/reset          — Reset all learnings
  GET    /api/toby/activity       — Paginated activity log
  GET    /api/toby/published      — All Toby-published content
  GET    /api/toby/experiments    — Active and completed experiments
  GET    /api/toby/insights       — Aggregated insights
  GET    /api/toby/discovery      — Discovery results
  GET    /api/toby/buffer         — Buffer status
  GET    /api/toby/config         — Configuration
  PATCH  /api/toby/config         — Update configuration
  GET    /api/toby/feature-flags  — Feature flag states
  PUT    /api/toby/feature-flags/{flag} — Toggle a feature flag
  GET    /api/toby/budget         — Budget status
  PUT    /api/toby/budget         — Set daily budget
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.db_connection import get_db
from app.api.auth.middleware import get_current_user, is_super_admin_user
from app.api.toby.schemas import TobyConfigUpdate

router = APIRouter(prefix="/api/toby", tags=["toby"])


def _resolve_user_id(user: dict, target_user_id: str | None) -> str:
    """Return the effective user_id.
    
    Super-admins can pass ?user_id=<id> to access any user's Toby.
    Regular users always get their own id.
    """
    if target_user_id and is_super_admin_user(user):
        return target_user_id
    return user["id"]


@router.get("/status")
def get_status(
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get Toby's current state: enabled/disabled, phase, buffer health, active experiments, live action."""
    from app.services.toby.state import get_or_create_state
    from app.services.toby.buffer_manager import get_buffer_status
    from app.models.toby import TobyExperiment, TobyActivityLog, TobyContentTag

    uid = _resolve_user_id(user, target_user_id)
    state = get_or_create_state(db, uid)
    raw_buffer = get_buffer_status(db, uid, state) if state.enabled else None
    buffer = _format_buffer(raw_buffer)

    active_experiments = (
        db.query(TobyExperiment)
        .filter(TobyExperiment.user_id == uid, TobyExperiment.status == "active")
        .count()
    )

    # Compute current action and next actions based on timestamps
    current_action = None
    next_actions = []
    if state.enabled:
        current_action, next_actions = _compute_live_actions(state)

    # Last activity log entry
    last_log = (
        db.query(TobyActivityLog)
        .filter(TobyActivityLog.user_id == uid)
        .order_by(TobyActivityLog.created_at.desc())
        .first()
    )

    # Stats
    total_created = (
        db.query(TobyContentTag)
        .filter(TobyContentTag.user_id == uid)
        .count()
    )
    total_scored = (
        db.query(TobyContentTag)
        .filter(TobyContentTag.user_id == uid, TobyContentTag.toby_score.isnot(None))
        .count()
    )

    # Phase progression data
    phase_progress = _compute_phase_progress(state, total_scored)

    # Recent tick history from activity log
    recent_ticks = (
        db.query(TobyActivityLog)
        .filter(
            TobyActivityLog.user_id == uid,
            TobyActivityLog.action_type.in_(["tick_start", "tick_complete", "buffer_check_complete",
                                              "content_generated", "metrics_collected", "analysis_completed",
                                              "discovery_scan", "discovery_seeded", "publish_success",
                                              "publish_partial", "publish_failed"]),
        )
        .order_by(TobyActivityLog.created_at.desc())
        .limit(20)
        .all()
    )

    return {
        "enabled": state.enabled,
        "phase": state.phase,
        "phase_started_at": state.phase_started_at.isoformat() if state.phase_started_at else None,
        "enabled_at": state.enabled_at.isoformat() if state.enabled_at else None,
        "buffer": buffer,
        "active_experiments": active_experiments,
        "config": {
            "buffer_days": state.buffer_days,
            "explore_ratio": state.explore_ratio,
            "reel_slots_per_day": state.reel_slots_per_day,
            "post_slots_per_day": state.post_slots_per_day,
        },
        "live": {
            "current_action": current_action,
            "next_actions": next_actions,
            "last_activity": last_log.to_dict() if last_log else None,
        },
        "timestamps": {
            "last_buffer_check_at": state.last_buffer_check_at.isoformat() if state.last_buffer_check_at else None,
            "last_metrics_check_at": state.last_metrics_check_at.isoformat() if state.last_metrics_check_at else None,
            "last_analysis_at": state.last_analysis_at.isoformat() if state.last_analysis_at else None,
            "last_discovery_at": state.last_discovery_at.isoformat() if state.last_discovery_at else None,
        },
        "stats": {
            "total_created": total_created,
            "total_scored": total_scored,
        },
        "phase_progress": phase_progress,
        "recent_ticks": [t.to_dict() for t in recent_ticks],
    }


@router.post("/enable")
def enable(
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Turn Toby on — starts buffer fill and autonomous loop.

    Performs pre-flight validation and returns structured errors if setup is incomplete.
    """
    from app.services.toby.state import enable_toby
    uid = _resolve_user_id(user, target_user_id)
    try:
        state = enable_toby(db, uid)
        db.commit()
        return {"status": "enabled", "phase": state.phase}
    except ValueError as e:
        error_str = str(e)
        if error_str.startswith("preflight:"):
            failures = error_str[len("preflight:"):].split(",")
            guidance_map = {
                "no_active_brands": "Create at least one active brand before enabling Toby.",
                "no_instagram_credentials": "Connect Instagram to at least one brand before enabling Toby.",
                "niche_config_empty": "Add at least one topic category to your Content DNA before enabling Toby.",
            }
            guidance = " ".join(guidance_map.get(f, f) for f in failures)
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=422,
                content={
                    "error": "preflight_failed",
                    "preflight_failures": failures,
                    "guidance": guidance,
                },
            )
        raise


@router.post("/disable")
def disable(
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Turn Toby off — stops content generation, keeps analysis running."""
    from app.services.toby.state import disable_toby
    uid = _resolve_user_id(user, target_user_id)
    state = disable_toby(db, uid)
    db.commit()
    return {"status": "disabled"}


@router.post("/reset")
def reset(
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reset all Toby learning data. Does NOT delete published content."""
    from app.services.toby.state import reset_toby
    uid = _resolve_user_id(user, target_user_id)
    state = reset_toby(db, uid)
    db.commit()
    return {"status": "reset", "phase": state.phase}


@router.get("/activity")
def get_activity(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action_type: str = Query(None),
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Paginated activity log — what Toby has done recently."""
    from app.models.toby import TobyActivityLog

    uid = _resolve_user_id(user, target_user_id)
    query = db.query(TobyActivityLog).filter(TobyActivityLog.user_id == uid)
    if action_type:
        query = query.filter(TobyActivityLog.action_type == action_type)

    total = query.count()
    logs = (
        query.order_by(TobyActivityLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "items": [log.to_dict() for log in logs],
    }


@router.get("/published")
def get_published(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All content Toby has published, with performance scores."""
    from app.models.toby import TobyContentTag
    from app.models.scheduling import ScheduledReel

    uid = _resolve_user_id(user, target_user_id)
    tags = (
        db.query(TobyContentTag)
        .filter(TobyContentTag.user_id == uid)
        .order_by(TobyContentTag.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    results = []
    for tag in tags:
        sched = (
            db.query(ScheduledReel)
            .filter(ScheduledReel.schedule_id == tag.schedule_id)
            .first()
        )
        item = tag.to_dict()
        if sched:
            item["schedule"] = sched.to_dict()
        results.append(item)

    total = (
        db.query(TobyContentTag)
        .filter(TobyContentTag.user_id == uid)
        .count()
    )

    return {"total": total, "items": results}


@router.get("/experiments")
def get_experiments(
    status: str = Query(None),
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Active and completed experiments with results."""
    from app.models.toby import TobyExperiment

    uid = _resolve_user_id(user, target_user_id)
    query = db.query(TobyExperiment).filter(TobyExperiment.user_id == uid)
    if status:
        query = query.filter(TobyExperiment.status == status)

    experiments = query.order_by(TobyExperiment.started_at.desc()).all()
    return {"experiments": [e.to_dict() for e in experiments]}


@router.get("/insights")
def get_insights(
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregated insights — best topics, hooks, personalities."""
    from app.services.toby.learning_engine import get_insights as _get_insights
    uid = _resolve_user_id(user, target_user_id)
    return _get_insights(db, uid)


@router.get("/discovery")
def get_discovery(
    limit: int = Query(20, ge=1, le=100),
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """What Toby found from competitor/hashtag scanning."""
    from app.models.analytics import TrendingContent

    uid = _resolve_user_id(user, target_user_id)
    trending = (
        db.query(TrendingContent)
        .filter(TrendingContent.user_id == uid)
        .order_by(TrendingContent.discovered_at.desc())
        .limit(limit)
        .all()
    )
    return {"items": [t.to_dict() for t in trending]}


@router.get("/discovery/summary")
def get_discovery_summary(
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregated discovery stats: total items, breakdown by source, recent highlights."""
    from app.models.analytics import TrendingContent
    from sqlalchemy import func

    uid = _resolve_user_id(user, target_user_id)

    total = db.query(func.count(TrendingContent.id)).filter(TrendingContent.user_id == uid).scalar() or 0

    # Breakdown by discovery method
    method_rows = (
        db.query(TrendingContent.discovery_method, func.count(TrendingContent.id))
        .filter(TrendingContent.user_id == uid)
        .group_by(TrendingContent.discovery_method)
        .all()
    )
    by_method = {m: c for m, c in method_rows}

    # Top source accounts by item count
    top_sources = (
        db.query(
            TrendingContent.source_account,
            TrendingContent.discovery_method,
            func.count(TrendingContent.id).label("count"),
            func.max(TrendingContent.like_count).label("top_likes"),
        )
        .filter(TrendingContent.user_id == uid, TrendingContent.source_account.isnot(None))
        .group_by(TrendingContent.source_account, TrendingContent.discovery_method)
        .order_by(func.count(TrendingContent.id).desc())
        .limit(10)
        .all()
    )

    # Recent highlights (top liked items from last 24h)
    from datetime import timedelta
    cutoff = datetime.now() - timedelta(hours=24)
    highlights = (
        db.query(TrendingContent)
        .filter(TrendingContent.user_id == uid, TrendingContent.discovered_at >= cutoff)
        .order_by(TrendingContent.like_count.desc())
        .limit(5)
        .all()
    )

    return {
        "total": total,
        "by_method": by_method,
        "top_sources": [
            {"account": r.source_account, "method": r.discovery_method, "count": r.count, "top_likes": r.top_likes}
            for r in top_sources
        ],
        "recent_highlights": [t.to_dict() for t in highlights],
    }


@router.get("/buffer")
def get_buffer(
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Buffer status — which slots are filled, which are empty."""
    from app.services.toby.state import get_or_create_state
    from app.services.toby.buffer_manager import get_buffer_status

    uid = _resolve_user_id(user, target_user_id)
    state = get_or_create_state(db, uid)
    return _format_buffer(get_buffer_status(db, uid, state))


@router.get("/config")
def get_config(
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toby's configuration."""
    from app.services.toby.state import get_or_create_state

    uid = _resolve_user_id(user, target_user_id)
    state = get_or_create_state(db, uid)
    return {
        "buffer_days": state.buffer_days,
        "explore_ratio": state.explore_ratio,
        "reel_slots_per_day": state.reel_slots_per_day,
        "post_slots_per_day": state.post_slots_per_day,
        "daily_budget_cents": state.daily_budget_cents,
    }


@router.patch("/config")
def update_config(
    body: TobyConfigUpdate,
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update Toby's configuration."""
    from app.services.toby.state import get_or_create_state

    uid = _resolve_user_id(user, target_user_id)
    state = get_or_create_state(db, uid)

    if body.buffer_days is not None:
        state.buffer_days = body.buffer_days
    if body.explore_ratio is not None:
        state.explore_ratio = body.explore_ratio
    if body.reel_slots_per_day is not None:
        state.reel_slots_per_day = body.reel_slots_per_day
    if body.post_slots_per_day is not None:
        state.post_slots_per_day = body.post_slots_per_day

    state.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "updated", "config": {
        "buffer_days": state.buffer_days,
        "explore_ratio": state.explore_ratio,
        "reel_slots_per_day": state.reel_slots_per_day,
        "post_slots_per_day": state.post_slots_per_day,
    }}


# ---------------------------------------------------------------------------
#  Feature Flags (Section 13.4)
# ---------------------------------------------------------------------------


@router.get("/feature-flags")
def get_feature_flags(user: dict = Depends(get_current_user)):
    """Get all Toby feature flags and their current states."""
    from app.services.toby.feature_flags import get_all_flags
    return {"flags": get_all_flags()}


class FeatureFlagUpdate(BaseModel):
    enabled: bool


@router.put("/feature-flags/{flag_name}")
def update_feature_flag(
    flag_name: str,
    body: FeatureFlagUpdate,
    user: dict = Depends(get_current_user),
):
    """Toggle a Toby feature flag on or off."""
    from app.services.toby.feature_flags import set_flag, get_all_flags

    if not set_flag(flag_name, body.enabled):
        raise HTTPException(status_code=404, detail=f"Unknown feature flag: {flag_name}")

    return {"status": "updated", "flags": get_all_flags()}


# ---------------------------------------------------------------------------
#  Budget (Section 13.2)
# ---------------------------------------------------------------------------


@router.get("/budget")
def get_budget(
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get current budget status for Toby."""
    from app.services.toby.state import get_or_create_state
    from app.services.toby.feature_flags import is_enabled

    uid = _resolve_user_id(user, target_user_id)
    state = get_or_create_state(db, uid)
    return {
        "enabled": is_enabled("budget_enforcement"),
        "daily_budget_cents": state.daily_budget_cents,
        "spent_today_cents": state.spent_today_cents or 0,
        "budget_reset_at": state.budget_reset_at.isoformat() if state.budget_reset_at else None,
    }


class BudgetUpdate(BaseModel):
    daily_budget_cents: int | None = Field(None, ge=0, le=100000)


@router.put("/budget")
def update_budget(
    body: BudgetUpdate,
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set or clear the daily budget for Toby."""
    from app.services.toby.state import get_or_create_state

    uid = _resolve_user_id(user, target_user_id)
    state = get_or_create_state(db, uid)
    state.daily_budget_cents = body.daily_budget_cents
    state.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "status": "updated",
        "daily_budget_cents": state.daily_budget_cents,
    }


# ---------------------------------------------------------------------------
#  Internal helpers
# ---------------------------------------------------------------------------


def _format_buffer(raw: dict | None) -> dict | None:
    """Transform buffer_manager output into the shape the frontend expects."""
    if raw is None:
        return None
    slots = raw.get("slots", [])
    empty_list = [
        {
            "brand_id": s["brand_id"],
            "date": s["time"][:10],
            "time": s["time"][11:16],
            "content_type": s["content_type"],
        }
        for s in slots
        if not s.get("filled")
    ]
    return {
        "health": raw.get("health", "healthy"),
        "total_slots": raw.get("total_slots", 0),
        "filled_slots": raw.get("filled_slots", 0),
        "fill_percent": raw.get("percent", 0),
        "empty_slots": empty_list,
        "brand_breakdown": raw.get("brand_breakdown", []),
        "brand_count": raw.get("brand_count", 0),
        "reel_slots_per_day": raw.get("reel_slots_per_day", 6),
        "post_slots_per_day": raw.get("post_slots_per_day", 2),
        "buffer_days": raw.get("buffer_days", 2),
    }

# Intervals must match orchestrator.py
_BUFFER_INTERVAL = 5       # minutes
_METRICS_INTERVAL = 360    # 6 hours
_ANALYSIS_INTERVAL = 360   # 6 hours
_DISCOVERY_INTERVAL = 720  # 12 hours (approx)


def _minutes_until(last_at, interval_minutes: int) -> int | None:
    """Return minutes until next check, or None if never checked."""
    if not last_at:
        return 0
    # Handle naive datetimes from DB
    now = datetime.now(timezone.utc)
    if last_at.tzinfo is None:
        last_at = last_at.replace(tzinfo=timezone.utc)
    elapsed = (now - last_at).total_seconds() / 60
    remaining = interval_minutes - elapsed
    return max(0, int(remaining))


def _compute_live_actions(state):
    """Derive human-readable current and upcoming actions from TobyState timestamps."""
    actions_due = []
    upcoming = []

    checks = [
        ("buffer_check", state.last_buffer_check_at, _BUFFER_INTERVAL,
         "Checking content buffer", "Checking if your content calendar has empty slots and filling them"),
        ("metrics_check", state.last_metrics_check_at, _METRICS_INTERVAL,
         "Collecting performance metrics", "Gathering views, likes, and engagement data from published posts"),
        ("analysis_check", state.last_analysis_at, _ANALYSIS_INTERVAL,
         "Analyzing content performance", "Scoring posts and updating strategy knowledge to find what works best"),
        ("discovery_check", state.last_discovery_at, _DISCOVERY_INTERVAL,
         "Scanning trends", "Looking for trending topics and competitor content for inspiration"),
    ]

    for key, last_at, interval, label, description in checks:
        mins_left = _minutes_until(last_at, interval)
        if mins_left == 0:
            actions_due.append({
                "key": key,
                "label": label,
                "description": description,
                "status": "due",
            })
        else:
            upcoming.append({
                "key": key,
                "label": label,
                "description": description,
                "status": "scheduled",
                "minutes_until": mins_left,
            })

    # Sort upcoming by soonest first
    upcoming.sort(key=lambda x: x.get("minutes_until", 9999))

    # Current action is the first due action, or "idle" if nothing is due
    if actions_due:
        current = actions_due[0]
    else:
        next_mins = upcoming[0]["minutes_until"] if upcoming else 5
        current = {
            "key": "idle",
            "label": "Idle",
            "description": f"All checks complete. Next action in ~{next_mins} min",
            "status": "idle",
            "minutes_until": next_mins,
        }

    return current, upcoming


# Phase transition thresholds — keep in sync with state.py
_BOOTSTRAP_MIN_POSTS = 10
_BOOTSTRAP_MIN_DAYS = 7
_LEARNING_MIN_DAYS = 30


def _compute_phase_progress(state, scored_post_count: int) -> dict:
    """Return phase-progression metrics for the frontend phase timeline."""
    now = datetime.now(timezone.utc)

    phase_start = state.phase_started_at
    if phase_start:
        if phase_start.tzinfo is None:
            phase_start = phase_start.replace(tzinfo=timezone.utc)
        days_in_phase = max(0, (now - phase_start).total_seconds() / 86400)
    else:
        days_in_phase = 0

    enabled_at = state.enabled_at
    if enabled_at:
        if enabled_at.tzinfo is None:
            enabled_at = enabled_at.replace(tzinfo=timezone.utc)
        uptime_hours = max(0, (now - enabled_at).total_seconds() / 3600)
    else:
        uptime_hours = 0

    result = {
        "current_phase": state.phase,
        "days_in_phase": round(days_in_phase, 1),
        "uptime_hours": round(uptime_hours, 1),
        "scored_posts": scored_post_count,
    }

    if state.phase == "bootstrap":
        posts_progress = min(1.0, scored_post_count / _BOOTSTRAP_MIN_POSTS)
        days_progress = min(1.0, days_in_phase / _BOOTSTRAP_MIN_DAYS)
        overall = min(posts_progress, days_progress)
        result["requirements"] = {
            "scored_posts_needed": _BOOTSTRAP_MIN_POSTS,
            "scored_posts_current": scored_post_count,
            "scored_posts_progress": round(posts_progress, 2),
            "min_days": _BOOTSTRAP_MIN_DAYS,
            "days_elapsed": round(days_in_phase, 1),
            "days_progress": round(days_progress, 2),
        }
        result["overall_progress"] = round(overall, 2)
        result["next_phase"] = "learning"
        days_remaining = max(0, _BOOTSTRAP_MIN_DAYS - days_in_phase)
        result["estimated_days_remaining"] = round(days_remaining, 1)

    elif state.phase == "learning":
        days_progress = min(1.0, days_in_phase / _LEARNING_MIN_DAYS)
        result["requirements"] = {
            "min_days": _LEARNING_MIN_DAYS,
            "days_elapsed": round(days_in_phase, 1),
            "days_progress": round(days_progress, 2),
        }
        result["overall_progress"] = round(days_progress, 2)
        result["next_phase"] = "optimizing"
        days_remaining = max(0, _LEARNING_MIN_DAYS - days_in_phase)
        result["estimated_days_remaining"] = round(days_remaining, 1)

    else:  # optimizing
        result["overall_progress"] = 1.0
        result["next_phase"] = None
        result["estimated_days_remaining"] = 0
        result["requirements"] = {}

    return result
