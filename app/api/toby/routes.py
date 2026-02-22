"""
Toby API Routes — all Toby-related endpoints.

Endpoints:
  GET    /api/toby/status       — Current state, phase, buffer health
  POST   /api/toby/enable       — Turn Toby on
  POST   /api/toby/disable      — Turn Toby off
  POST   /api/toby/reset        — Reset all learnings
  GET    /api/toby/activity     — Paginated activity log
  GET    /api/toby/published    — All Toby-published content
  GET    /api/toby/experiments  — Active and completed experiments
  GET    /api/toby/insights     — Aggregated insights
  GET    /api/toby/discovery    — Discovery results
  GET    /api/toby/buffer       — Buffer status
  GET    /api/toby/config       — Configuration
  PATCH  /api/toby/config       — Update configuration
"""
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db_connection import get_db
from app.api.auth.middleware import get_current_user
from app.api.toby.schemas import TobyConfigUpdate

router = APIRouter(prefix="/api/toby", tags=["toby"])


@router.get("/status")
def get_status(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get Toby's current state: enabled/disabled, phase, buffer health, active experiments, live action."""
    from app.services.toby.state import get_or_create_state
    from app.services.toby.buffer_manager import get_buffer_status
    from app.models.toby import TobyExperiment, TobyActivityLog, TobyContentTag

    state = get_or_create_state(db, user["id"])
    buffer = get_buffer_status(db, user["id"], state) if state.enabled else None

    active_experiments = (
        db.query(TobyExperiment)
        .filter(TobyExperiment.user_id == user["id"], TobyExperiment.status == "active")
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
        .filter(TobyActivityLog.user_id == user["id"])
        .order_by(TobyActivityLog.created_at.desc())
        .first()
    )

    # Stats
    total_created = (
        db.query(TobyContentTag)
        .filter(TobyContentTag.user_id == user["id"])
        .count()
    )
    total_scored = (
        db.query(TobyContentTag)
        .filter(TobyContentTag.user_id == user["id"], TobyContentTag.toby_score.isnot(None))
        .count()
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
    }


@router.post("/enable")
def enable(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Turn Toby on — starts buffer fill and autonomous loop."""
    from app.services.toby.state import enable_toby
    state = enable_toby(db, user["id"])
    db.commit()
    return {"status": "enabled", "phase": state.phase}


@router.post("/disable")
def disable(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Turn Toby off — stops content generation, keeps analysis running."""
    from app.services.toby.state import disable_toby
    state = disable_toby(db, user["id"])
    db.commit()
    return {"status": "disabled"}


@router.post("/reset")
def reset(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reset all Toby learning data. Does NOT delete published content."""
    from app.services.toby.state import reset_toby
    state = reset_toby(db, user["id"])
    db.commit()
    return {"status": "reset", "phase": state.phase}


@router.get("/activity")
def get_activity(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action_type: str = Query(None),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Paginated activity log — what Toby has done recently."""
    from app.models.toby import TobyActivityLog

    query = db.query(TobyActivityLog).filter(TobyActivityLog.user_id == user["id"])
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
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All content Toby has published, with performance scores."""
    from app.models.toby import TobyContentTag
    from app.models.scheduling import ScheduledReel

    tags = (
        db.query(TobyContentTag)
        .filter(TobyContentTag.user_id == user["id"])
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
        .filter(TobyContentTag.user_id == user["id"])
        .count()
    )

    return {"total": total, "items": results}


@router.get("/experiments")
def get_experiments(
    status: str = Query(None),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Active and completed experiments with results."""
    from app.models.toby import TobyExperiment

    query = db.query(TobyExperiment).filter(TobyExperiment.user_id == user["id"])
    if status:
        query = query.filter(TobyExperiment.status == status)

    experiments = query.order_by(TobyExperiment.started_at.desc()).all()
    return {"experiments": [e.to_dict() for e in experiments]}


@router.get("/insights")
def get_insights(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregated insights — best topics, hooks, personalities."""
    from app.services.toby.learning_engine import get_insights as _get_insights
    return _get_insights(db, user["id"])


@router.get("/discovery")
def get_discovery(
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """What Toby found from competitor/hashtag scanning."""
    from app.models.analytics import TrendingContent

    trending = (
        db.query(TrendingContent)
        .filter(TrendingContent.user_id == user["id"])
        .order_by(TrendingContent.discovered_at.desc())
        .limit(limit)
        .all()
    )
    return {"items": [t.to_dict() for t in trending]}


@router.get("/buffer")
def get_buffer(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Buffer status — which slots are filled, which are empty."""
    from app.services.toby.state import get_or_create_state
    from app.services.toby.buffer_manager import get_buffer_status

    state = get_or_create_state(db, user["id"])
    return get_buffer_status(db, user["id"], state)


@router.get("/config")
def get_config(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toby's configuration."""
    from app.services.toby.state import get_or_create_state

    state = get_or_create_state(db, user["id"])
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
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update Toby's configuration."""
    from app.services.toby.state import get_or_create_state

    state = get_or_create_state(db, user["id"])

    if body.buffer_days is not None:
        state.buffer_days = body.buffer_days
    if body.explore_ratio is not None:
        state.explore_ratio = body.explore_ratio
    if body.reel_slots_per_day is not None:
        state.reel_slots_per_day = body.reel_slots_per_day
    if body.post_slots_per_day is not None:
        state.post_slots_per_day = body.post_slots_per_day

    state.updated_at = datetime.utcnow()
    db.commit()

    return {"status": "updated", "config": {
        "buffer_days": state.buffer_days,
        "explore_ratio": state.explore_ratio,
        "reel_slots_per_day": state.reel_slots_per_day,
        "post_slots_per_day": state.post_slots_per_day,
    }}


# ---------------------------------------------------------------------------
#  Internal helpers
# ---------------------------------------------------------------------------

# Intervals must match orchestrator.py
_BUFFER_INTERVAL = 5       # minutes
_METRICS_INTERVAL = 360    # 6 hours
_ANALYSIS_INTERVAL = 360   # 6 hours
_DISCOVERY_INTERVAL = 720  # 12 hours (approx)


def _minutes_until(last_at, interval_minutes: int) -> int | None:
    """Return minutes until next check, or None if never checked."""
    if not last_at:
        return 0
    elapsed = (datetime.utcnow() - last_at).total_seconds() / 60
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
