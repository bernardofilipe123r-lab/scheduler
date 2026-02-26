"""
Toby State Machine — manages per-user Toby lifecycle.

States: OFF → BOOTSTRAP → LEARNING → OPTIMIZING
"""
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.toby import TobyState, TobyActivityLog


# Phase transition thresholds
BOOTSTRAP_MIN_POSTS = 10       # Need at least 10 scored posts to leave bootstrap
BOOTSTRAP_MIN_DAYS = 7         # Minimum 7 days in bootstrap
LEARNING_MIN_DAYS = 30         # Minimum 30 days in learning before optimizing


def get_or_create_state(db: Session, user_id: str) -> TobyState:
    """Get Toby state for a user, creating it if it doesn't exist."""
    state = db.query(TobyState).filter(TobyState.user_id == user_id).first()
    if not state:
        state = TobyState(
            id=str(uuid.uuid4()),
            user_id=user_id,
            enabled=False,
            phase="bootstrap",
            phase_started_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(state)
        db.flush()
    return state


def enable_toby(db: Session, user_id: str) -> TobyState:
    """Enable Toby for a user. Starts/resumes the autonomous loop.

    Performs pre-flight validation (J1):
    - At least one active brand exists
    - At least one brand has instagram_business_account_id
    - NicheConfig has at least 1 topic category
    """
    from app.models.brands import Brand
    from app.models.niche_config import NicheConfig

    # Pre-flight validation
    preflight_failures = []

    brands = db.query(Brand).filter(
        Brand.user_id == user_id, Brand.active == True
    ).all()
    if not brands:
        preflight_failures.append("no_active_brands")

    if brands and not any(b.instagram_business_account_id for b in brands):
        preflight_failures.append("no_instagram_credentials")

    configs = db.query(NicheConfig).filter(NicheConfig.user_id == user_id).all()
    if not configs or not any(
        c.topic_categories and len(c.topic_categories) > 0 for c in configs
    ):
        preflight_failures.append("niche_config_empty")

    if preflight_failures:
        raise ValueError(f"preflight:{','.join(preflight_failures)}")

    state = get_or_create_state(db, user_id)
    now = datetime.now(timezone.utc)
    state.enabled = True
    state.enabled_at = now
    state.disabled_at = None

    # Ensure phase_started_at is always set
    if not state.phase_started_at:
        state.phase_started_at = now

    # Validate phase matches reality: if scored posts don't justify the current
    # phase, reset to the correct one (fixes stale phase from prior runs/tests).
    from app.models.toby import TobyContentTag
    scored = (
        db.query(TobyContentTag)
        .filter(TobyContentTag.user_id == user_id, TobyContentTag.toby_score.isnot(None))
        .count()
    )
    if state.phase in ("optimizing", "learning"):
        if scored < BOOTSTRAP_MIN_POSTS:
            state.phase = "bootstrap"
            state.phase_started_at = now
            _log_activity(
                db, user_id, "phase_correction",
                f"Phase reset to bootstrap on enable (only {scored} scored posts — need {BOOTSTRAP_MIN_POSTS})",
                level="warning",
            )
    state.updated_at = now
    _log_activity(db, user_id, "toby_enabled", "Toby has been enabled", level="success")
    db.flush()
    return state


def disable_toby(db: Session, user_id: str) -> TobyState:
    """Disable Toby for a user. Stops content generation, keeps analysis running."""
    state = get_or_create_state(db, user_id)
    now = datetime.now(timezone.utc)
    state.enabled = False
    state.disabled_at = now
    state.updated_at = now
    _log_activity(db, user_id, "toby_disabled", "Toby has been disabled", level="info")
    db.flush()
    return state


def reset_toby(db: Session, user_id: str) -> TobyState:
    """Reset Toby learnings. Clears experiments, strategy scores, content tags.
    Does NOT delete published content or performance history."""
    from app.models.toby import TobyExperiment, TobyStrategyScore, TobyContentTag

    db.query(TobyExperiment).filter(TobyExperiment.user_id == user_id).delete()
    db.query(TobyStrategyScore).filter(TobyStrategyScore.user_id == user_id).delete()
    db.query(TobyContentTag).filter(TobyContentTag.user_id == user_id).delete()

    state = get_or_create_state(db, user_id)
    now = datetime.now(timezone.utc)
    state.phase = "bootstrap"
    state.phase_started_at = now
    state.last_buffer_check_at = None
    state.last_metrics_check_at = None
    state.last_analysis_at = None
    state.last_discovery_at = None
    state.updated_at = now

    _log_activity(db, user_id, "toby_reset", "Toby learnings have been reset", level="warning")
    db.flush()
    return state


def check_phase_transition(db: Session, state: TobyState, scored_post_count: int) -> bool:
    """Check if Toby should transition to the next phase. Returns True if transitioned."""
    now = datetime.now(timezone.utc)

    # Safety: if phase is ahead of reality, regress to match scored post count.
    # This MUST run before the phase_started_at guard so stale phases always self-heal.
    if state.phase in ("learning", "optimizing") and scored_post_count < BOOTSTRAP_MIN_POSTS:
        old_phase = state.phase
        state.phase = "bootstrap"
        state.phase_started_at = now
        state.updated_at = now
        _log_activity(
            db, state.user_id, "phase_correction",
            f"Phase corrected from {old_phase} to bootstrap (only {scored_post_count} scored posts)",
            level="warning",
        )
        return True

    # For forward transitions we need phase_started_at to compute days_in_phase
    if not state.phase_started_at:
        state.phase_started_at = now
        state.updated_at = now
        return False

    phase_start = state.phase_started_at
    if phase_start.tzinfo is None:
        phase_start = phase_start.replace(tzinfo=timezone.utc)
    days_in_phase = (now - phase_start).days

    if state.phase == "bootstrap":
        if scored_post_count >= BOOTSTRAP_MIN_POSTS and days_in_phase >= BOOTSTRAP_MIN_DAYS:
            state.phase = "learning"
            state.phase_started_at = now
            state.updated_at = now
            _log_activity(
                db, state.user_id, "phase_transition",
                f"Toby transitioned from bootstrap to learning (after {days_in_phase} days, {scored_post_count} scored posts)",
                level="success",
            )
            return True

    elif state.phase == "learning":
        if days_in_phase >= LEARNING_MIN_DAYS:
            state.phase = "optimizing"
            state.phase_started_at = now
            state.updated_at = now
            _log_activity(
                db, state.user_id, "phase_transition",
                f"Toby transitioned from learning to optimizing (after {days_in_phase} days)",
                level="success",
            )
            return True

    return False


def check_phase_regression(db: Session, user_id: str) -> bool:
    """Check if performance has regressed enough to move from optimizing → learning.

    Aggregates Toby Score across all active brands for the user.
    If the 14-day avg drops below 80% of the 90-day baseline while in
    'optimizing' phase, resets to 'learning' with explore_ratio = 0.50.

    Returns True if a regression was triggered.
    """
    from app.models.toby import TobyContentTag
    from app.models.brands import Brand
    from sqlalchemy import func

    state = get_or_create_state(db, user_id)
    if state.phase != "optimizing":
        return False

    now = datetime.now(timezone.utc)

    # Get active brand IDs for this user
    active_brands = (
        db.query(Brand.id)
        .filter(Brand.user_id == user_id, Brand.active == True)
        .all()
    )
    if not active_brands:
        return False

    # 14-day recent avg across all brands
    recent_cutoff = now - timedelta(days=14)
    recent_avg = (
        db.query(func.avg(TobyContentTag.toby_score))
        .filter(
            TobyContentTag.user_id == user_id,
            TobyContentTag.toby_score.isnot(None),
            TobyContentTag.metrics_unreliable != True,
            TobyContentTag.scored_at >= recent_cutoff,
        )
        .scalar()
    )

    # 90-day baseline avg across all brands
    baseline_cutoff = now - timedelta(days=90)
    baseline_avg = (
        db.query(func.avg(TobyContentTag.toby_score))
        .filter(
            TobyContentTag.user_id == user_id,
            TobyContentTag.toby_score.isnot(None),
            TobyContentTag.metrics_unreliable != True,
            TobyContentTag.scored_at >= baseline_cutoff,
        )
        .scalar()
    )

    if not recent_avg or not baseline_avg:
        return False

    if recent_avg < baseline_avg * 0.80:
        state.phase = "learning"
        state.phase_started_at = now
        state.explore_ratio = 0.50
        state.updated_at = now
        _log_activity(
            db, user_id, "phase_regression",
            f"Performance regression detected: 14-day avg {recent_avg:.1f} vs 90-day baseline {baseline_avg:.1f} "
            f"(ratio {recent_avg / baseline_avg:.2f}). Reverting to learning phase with explore_ratio 0.50",
            metadata={
                "recent_avg": round(float(recent_avg), 1),
                "baseline_avg": round(float(baseline_avg), 1),
                "ratio": round(float(recent_avg / baseline_avg), 2),
            },
            level="warning",
        )
        return True

    return False


def _log_activity(
    db: Session,
    user_id: str,
    action_type: str,
    description: str,
    metadata: dict = None,
    level: str = "info",
):
    """Write a Toby activity log entry."""
    entry = TobyActivityLog(
        user_id=user_id,
        action_type=action_type,
        description=description,
        action_metadata=metadata,
        level=level,
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
