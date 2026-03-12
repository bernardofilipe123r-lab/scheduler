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
from app.api.toby.schemas import TobyConfigUpdate, TobyBrandConfigUpdate

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
    from app.models.scheduling import ScheduledReel
    total_published = (
        db.query(TobyContentTag)
        .join(ScheduledReel, ScheduledReel.schedule_id == TobyContentTag.schedule_id)
        .filter(
            TobyContentTag.user_id == uid,
            ScheduledReel.status.in_(["published", "partial"]),
        )
        .count()
    )

    # v3.0: Learning confidence (replaces time-based phase progress)
    from app.services.toby.state import compute_learning_confidence
    learning_confidence = compute_learning_confidence(db, uid) if state.enabled else 0.0

    # v3.0: Current top strategies per dimension (what Toby is betting on)
    current_top_strategies = _get_top_strategies(db, uid)

    # Phase progression data
    phase_progress = _compute_phase_progress(state, total_scored, learning_confidence)

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
        "intervals": {
            "buffer": _BUFFER_INTERVAL,
            "metrics": _METRICS_INTERVAL,
            "analysis": _ANALYSIS_INTERVAL,
            "discovery": _DISCOVERY_INTERVAL_BOOTSTRAP if state.phase == "bootstrap" else _DISCOVERY_INTERVAL_NORMAL,
        },
        "stats": {
            "total_created": total_created,
            "total_scored": total_scored,
            "total_published": total_published,
        },
        "phase_progress": phase_progress,
        "recent_ticks": [t.to_dict() for t in recent_ticks],
        "learning_confidence": learning_confidence,
        "posts_learned_from": total_scored,
        "current_top_strategies": current_top_strategies,
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

    def _format_experiment(e):
        options = e.options or []
        results = e.results or {}
        opt_a = options[0] if len(options) > 0 else ""
        opt_b = options[1] if len(options) > 1 else ""
        res_a = results.get(opt_a, {})
        res_b = results.get(opt_b, {})

        confidence = 0.0
        if e.p_value is not None:
            confidence = max(0.0, 1.0 - e.p_value)

        return {
            "id": e.id,
            "user_id": e.user_id,
            "experiment_type": e.dimension,
            "variant_a": opt_a,
            "variant_b": opt_b,
            "samples_a": res_a.get("count", 0),
            "samples_b": res_b.get("count", 0),
            "mean_score_a": res_a.get("avg_score", 0),
            "mean_score_b": res_b.get("avg_score", 0),
            "winner": e.winner,
            "confidence": confidence,
            "status": e.status,
            "started_at": e.started_at.isoformat() if e.started_at else None,
            "completed_at": e.completed_at.isoformat() if e.completed_at else None,
            "metadata": {
                "hypothesis": e.hypothesis,
                "expected_effect_size": e.expected_effect_size,
                "min_samples": e.min_samples,
                "content_type": e.content_type,
            },
        }

    return {"experiments": [_format_experiment(e) for e in experiments]}


@router.get("/insights")
def get_insights(
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregated insights — best topics, hooks, personalities."""
    from app.services.toby.learning_engine import get_insights as _get_insights
    from app.models.toby import TobyContentTag
    uid = _resolve_user_id(user, target_user_id)
    raw = _get_insights(db, uid)

    # Transform backend shape {reel: {dim: [{option, avg_score, ...}]}}
    # into frontend shape {top_strategies: {dim: [{strategy, mean_score, ...}]}, total_scored_posts}
    # Aggregate by (dimension, option_value) across brands/content_types using weighted average
    agg: dict[str, dict[str, dict]] = {}  # dim -> option -> {total_score, total_count}
    for _ct, dims in raw.items():
        for dim, items in dims.items():
            if dim not in agg:
                agg[dim] = {}
            for item in items:
                opt = item["option"]
                if opt not in agg[dim]:
                    agg[dim][opt] = {"total_score": 0.0, "total_count": 0}
                n = item["sample_count"] or 1
                agg[dim][opt]["total_score"] += item["avg_score"] * n
                agg[dim][opt]["total_count"] += n

    merged: dict[str, list] = {}
    for dim, options in agg.items():
        merged[dim] = []
        for opt, vals in options.items():
            count = vals["total_count"]
            mean = vals["total_score"] / count if count else 0
            merged[dim].append({
                "dimension": dim,
                "strategy": opt,
                "mean_score": round(mean, 1),
                "sample_count": count,
            })
        merged[dim].sort(key=lambda x: x["mean_score"], reverse=True)

    total_scored = (
        db.query(TobyContentTag)
        .filter(TobyContentTag.user_id == uid, TobyContentTag.toby_score.isnot(None))
        .count()
    )
    return {"top_strategies": merged, "total_scored_posts": total_scored}


@router.get("/discovery")
def get_discovery(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    method: str = Query(None),
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """What Toby found from competitor/hashtag scanning."""
    from app.models.analytics import TrendingContent

    uid = _resolve_user_id(user, target_user_id)
    q = db.query(TrendingContent).filter(TrendingContent.user_id == uid)
    if method:
        q = q.filter(TrendingContent.discovery_method == method)
    total = q.count()
    items = q.order_by(TrendingContent.like_count.desc()).offset(offset).limit(limit).all()
    return {"total": total, "items": [t.to_dict() for t in items]}


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

    # Recent highlights (top liked items from last 7d, excluding own_account)
    from datetime import timedelta
    cutoff = datetime.now() - timedelta(days=7)
    highlights = (
        db.query(TrendingContent)
        .filter(
            TrendingContent.user_id == uid,
            TrendingContent.discovered_at >= cutoff,
            TrendingContent.discovery_method != "own_account",
        )
        .order_by(TrendingContent.like_count.desc())
        .limit(5)
        .all()
    )

    # Last scan timestamp
    from app.services.toby.state import get_or_create_state
    state = get_or_create_state(db, uid)
    last_scan_at = state.last_discovery_at.isoformat() if state.last_discovery_at else None

    return {
        "total": total,
        "by_method": by_method,
        "top_sources": [
            {"account": r.source_account, "method": r.discovery_method, "count": r.count, "top_likes": r.top_likes}
            for r in top_sources
        ],
        "recent_highlights": [t.to_dict() for t in highlights],
        "last_scan_at": last_scan_at,
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
        "reels_enabled": state.reels_enabled if state.reels_enabled is not None else True,
        "posts_enabled": state.posts_enabled if state.posts_enabled is not None else True,
        "threads_enabled": state.threads_enabled if state.threads_enabled is not None else True,
        "auto_schedule": state.auto_schedule if state.auto_schedule is not None else True,
        "buffer_reminder_enabled": state.buffer_reminder_enabled if state.buffer_reminder_enabled is not None else True,
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
    if body.reels_enabled is not None:
        state.reels_enabled = body.reels_enabled
    if body.posts_enabled is not None:
        state.posts_enabled = body.posts_enabled
    if body.threads_enabled is not None:
        state.threads_enabled = body.threads_enabled
    if body.auto_schedule is not None:
        state.auto_schedule = body.auto_schedule
    if body.buffer_reminder_enabled is not None:
        state.buffer_reminder_enabled = body.buffer_reminder_enabled

    state.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "updated", "config": {
        "buffer_days": state.buffer_days,
        "explore_ratio": state.explore_ratio,
        "reel_slots_per_day": state.reel_slots_per_day,
        "post_slots_per_day": state.post_slots_per_day,
        "reels_enabled": state.reels_enabled if state.reels_enabled is not None else True,
        "posts_enabled": state.posts_enabled if state.posts_enabled is not None else True,
        "threads_enabled": state.threads_enabled if state.threads_enabled is not None else True,
        "auto_schedule": state.auto_schedule if state.auto_schedule is not None else True,
        "buffer_reminder_enabled": state.buffer_reminder_enabled if state.buffer_reminder_enabled is not None else True,
    }}


# ---------------------------------------------------------------------------
#  Per-Brand Configuration
# ---------------------------------------------------------------------------


@router.get("/brand-config")
def get_brand_configs(
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get per-brand Toby configuration for all brands."""
    import uuid
    from app.models.toby import TobyBrandConfig
    from app.models.brands import Brand
    from app.models.youtube import YouTubeChannel
    from app.core.platforms import PLATFORM_CREDENTIAL_CHECKS

    uid = _resolve_user_id(user, target_user_id)

    # Get all active brands for this user
    brands = db.query(Brand).filter(Brand.user_id == uid, Brand.active == True).all()

    # Get existing brand configs
    configs = db.query(TobyBrandConfig).filter(TobyBrandConfig.user_id == uid).all()
    config_map = {c.brand_id: c for c in configs}

    # Pre-fetch YouTube channels for all brands
    yt_channels = db.query(YouTubeChannel).filter(
        YouTubeChannel.brand.in_([b.id for b in brands]),
        YouTubeChannel.status == "connected",
    ).all()
    yt_connected_brands = {ch.brand for ch in yt_channels}

    # Auto-create configs for brands that don't have one yet
    result = []
    for brand in brands:
        if brand.id not in config_map:
            cfg = TobyBrandConfig(
                id=str(uuid.uuid4()),
                user_id=uid,
                brand_id=brand.id,
                enabled=True,
                reel_slots_per_day=6,
                post_slots_per_day=2,
            )
            db.add(cfg)
            config_map[brand.id] = cfg

        c = config_map[brand.id]
        result.append({
            "brand_id": c.brand_id,
            "display_name": brand.display_name or brand.id,
            "enabled": c.enabled,
            "reel_slots_per_day": c.reel_slots_per_day,
            "post_slots_per_day": c.post_slots_per_day,
            "reel_format": c.reel_format or "format_a",
            "enabled_platforms": c.enabled_platforms,  # None = all connected
            "logo_path": brand.logo_path,
            "brand_color": brand.colors.get("primary") if isinstance(brand.colors, dict) else None,
            # Dynamic credential checks from platform registry
            **{f"has_{p}": check(brand) for p, check in PLATFORM_CREDENTIAL_CHECKS.items()},
            "has_youtube": brand.id in yt_connected_brands,
        })

    db.commit()
    return {"brands": result}


@router.patch("/brand-config/{brand_id}")
def update_brand_config(
    brand_id: str,
    body: TobyBrandConfigUpdate,
    target_user_id: str = Query(None, alias="user_id"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update per-brand Toby configuration."""
    import uuid
    from app.models.toby import TobyBrandConfig
    from app.models.brands import Brand

    uid = _resolve_user_id(user, target_user_id)

    # Verify brand belongs to user
    brand = db.query(Brand).filter(Brand.id == brand_id, Brand.user_id == uid).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    cfg = db.query(TobyBrandConfig).filter(
        TobyBrandConfig.user_id == uid,
        TobyBrandConfig.brand_id == brand_id,
    ).first()

    if not cfg:
        cfg = TobyBrandConfig(
            id=str(uuid.uuid4()),
            user_id=uid,
            brand_id=brand_id,
            enabled=True,
            reel_slots_per_day=6,
            post_slots_per_day=2,
        )
        db.add(cfg)

    if body.enabled is not None:
        cfg.enabled = body.enabled
    if body.reel_slots_per_day is not None:
        cfg.reel_slots_per_day = body.reel_slots_per_day
    if body.post_slots_per_day is not None:
        cfg.post_slots_per_day = body.post_slots_per_day
    if body.reel_format is not None:
        cfg.reel_format = body.reel_format
    # enabled_platforms: distinguish "field absent" (no change) from "field sent as null" (all connected)
    if "enabled_platforms" in body.model_fields_set:
        from sqlalchemy.orm.attributes import flag_modified
        if body.enabled_platforms is not None:
            from app.core.platforms import SUPPORTED_PLATFORMS_SET, SUPPORTED_CONTENT_TYPES, CONTENT_TYPE_EXCLUDED_PLATFORMS
            # Sanitise: dict keyed by content-type → list of valid platform names
            sanitised: dict[str, list[str]] = {}
            for ct_key, platform_list in body.enabled_platforms.items():
                if ct_key not in SUPPORTED_CONTENT_TYPES:
                    continue
                excluded = CONTENT_TYPE_EXCLUDED_PLATFORMS.get(ct_key, frozenset())
                cleaned = [p for p in platform_list if p in SUPPORTED_PLATFORMS_SET and p not in excluded]
                sanitised[ct_key] = cleaned
            cfg.enabled_platforms = sanitised if sanitised else None
        else:
            # Explicitly null → reset to "all connected for all types"
            cfg.enabled_platforms = None
        flag_modified(cfg, "enabled_platforms")

    cfg.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "status": "updated",
        "brand_config": {
            "brand_id": cfg.brand_id,
            "display_name": brand.display_name or brand.id,
            "enabled": cfg.enabled,
            "reel_slots_per_day": cfg.reel_slots_per_day,
            "post_slots_per_day": cfg.post_slots_per_day,
            "reel_format": cfg.reel_format or "format_a",
            "enabled_platforms": cfg.enabled_platforms,
        },
    }


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
_DISCOVERY_INTERVAL_NORMAL = 360     # 6 hours (normal mode)
_DISCOVERY_INTERVAL_BOOTSTRAP = 20   # 20 minutes (bootstrap mode)


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

    discovery_interval = _DISCOVERY_INTERVAL_BOOTSTRAP if state.phase == "bootstrap" else _DISCOVERY_INTERVAL_NORMAL

    checks = [
        ("buffer_check", state.last_buffer_check_at, _BUFFER_INTERVAL,
         "Checking content buffer", "Checking if your content calendar has empty slots and filling them"),
        ("metrics_check", state.last_metrics_check_at, _METRICS_INTERVAL,
         "Collecting performance metrics", "Gathering views, likes, and engagement data from published posts"),
        ("analysis_check", state.last_analysis_at, _ANALYSIS_INTERVAL,
         "Analyzing content performance", "Scoring posts and updating strategy knowledge to find what works best"),
        ("discovery_check", state.last_discovery_at, discovery_interval,
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


# Phase transition thresholds — keep in sync with state.py (v3.0 data-gated)
_BOOTSTRAP_MIN_POSTS = 15
_BOOTSTRAP_MIN_DAYS = 3
_LEARNING_MIN_DAYS = 7
_LEARNING_TARGET_CONFIDENCE = 0.60


def _compute_phase_progress(state, scored_post_count: int, learning_confidence: float = 0.0) -> dict:
    """Return phase-progression metrics for the frontend knowledge meter."""
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
        "learning_confidence": round(learning_confidence, 3),
    }

    if state.phase == "bootstrap":
        posts_progress = min(1.0, scored_post_count / _BOOTSTRAP_MIN_POSTS)
        overall = posts_progress  # v3.0: progress = posts scored, not days waited
        result["requirements"] = {
            "scored_posts_needed": _BOOTSTRAP_MIN_POSTS,
            "scored_posts_current": scored_post_count,
            "scored_posts_progress": round(posts_progress, 2),
            "min_days": _BOOTSTRAP_MIN_DAYS,
            "days_elapsed": round(days_in_phase, 1),
        }
        result["overall_progress"] = round(overall, 2)
        result["next_phase"] = "learning"
        posts_remaining = max(0, _BOOTSTRAP_MIN_POSTS - scored_post_count)
        result["estimated_posts_remaining"] = posts_remaining
        result["estimated_days_remaining"] = 0  # not days-based anymore

    elif state.phase == "learning":
        # v3.0: progress = confidence, not days
        overall = min(1.0, learning_confidence / _LEARNING_TARGET_CONFIDENCE)
        result["requirements"] = {
            "confidence_target": _LEARNING_TARGET_CONFIDENCE,
            "confidence_current": round(learning_confidence, 3),
            "confidence_progress": round(overall, 2),
            "min_days": _LEARNING_MIN_DAYS,
            "days_elapsed": round(days_in_phase, 1),
        }
        result["overall_progress"] = round(overall, 2)
        result["next_phase"] = "optimizing"
        result["estimated_posts_remaining"] = 0
        result["estimated_days_remaining"] = 0  # not days-based anymore

    else:  # optimizing
        result["overall_progress"] = 1.0
        result["next_phase"] = None
        result["estimated_days_remaining"] = 0
        result["estimated_posts_remaining"] = 0
        result["requirements"] = {}

    return result


def _get_top_strategies(db, user_id: str) -> list[dict]:
    """Return top strategy per dimension (highest avg_score).

    Uses sample_count >= 1 so early learning data is visible during bootstrap.
    """
    from app.models.toby import TobyStrategyScore
    from sqlalchemy import func as sa_func

    dimensions = ["personality", "topic", "hook", "title_format", "visual_style"]
    results = []

    for dim in dimensions:
        # Aggregate across brands: highest total sample count per option value
        top = (
            db.query(
                TobyStrategyScore.option_value,
                sa_func.sum(TobyStrategyScore.sample_count).label("total_samples"),
                sa_func.avg(TobyStrategyScore.avg_score).label("mean_score"),
            )
            .filter(
                TobyStrategyScore.user_id == user_id,
                TobyStrategyScore.dimension == dim,
                TobyStrategyScore.sample_count >= 1,
            )
            .group_by(TobyStrategyScore.option_value)
            .order_by(sa_func.avg(TobyStrategyScore.avg_score).desc())
            .first()
        )
        if top:
            results.append({
                "dimension": dim,
                "value": top.option_value,
                "avg_score": round(float(top.mean_score), 1) if top.mean_score else 0.0,
                "sample_count": int(top.total_samples),
            })

    return results


# ── Phase 3: Content DNA Suggestion Endpoints ──

@router.get("/content-dna-suggestions")
def get_content_dna_suggestions(user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Get pending Content DNA improvement suggestions from Toby."""
    uid = user.id if hasattr(user, "id") else user.get("id")
    if not uid:
        raise HTTPException(400, "No user ID")

    from app.services.toby.content_dna_advisor import get_pending_suggestions
    suggestions = get_pending_suggestions(db, uid)
    return {"suggestions": suggestions, "count": len(suggestions)}


class DNASuggestionAction(BaseModel):
    action: str = Field(..., pattern="^(accepted|dismissed)$")


@router.post("/content-dna-suggestions/{suggestion_id}")
def resolve_content_dna_suggestion(
    suggestion_id: str,
    body: DNASuggestionAction,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept or dismiss a Content DNA suggestion."""
    uid = user.id if hasattr(user, "id") else user.get("id")
    if not uid:
        raise HTTPException(400, "No user ID")

    from app.services.toby.content_dna_advisor import resolve_suggestion
    ok = resolve_suggestion(db, uid, suggestion_id, body.action)
    if not ok:
        raise HTTPException(404, "Suggestion not found")
    db.commit()
    return {"status": body.action}
