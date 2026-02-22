"""
Toby State Machine — manages per-user Toby lifecycle.

States: OFF → BOOTSTRAP → LEARNING → OPTIMIZING
"""
import uuid
from datetime import datetime
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
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(state)
        db.flush()
    return state


def enable_toby(db: Session, user_id: str) -> TobyState:
    """Enable Toby for a user. Starts/resumes the autonomous loop."""
    state = get_or_create_state(db, user_id)
    now = datetime.utcnow()
    state.enabled = True
    state.enabled_at = now
    state.disabled_at = None
    if not state.phase_started_at:
        state.phase_started_at = now
    state.updated_at = now
    _log_activity(db, user_id, "toby_enabled", "Toby has been enabled", level="success")
    db.flush()
    return state


def disable_toby(db: Session, user_id: str) -> TobyState:
    """Disable Toby for a user. Stops content generation, keeps analysis running."""
    state = get_or_create_state(db, user_id)
    now = datetime.utcnow()
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
    now = datetime.utcnow()
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
    if not state.phase_started_at:
        return False

    days_in_phase = (datetime.utcnow() - state.phase_started_at).days

    if state.phase == "bootstrap":
        if scored_post_count >= BOOTSTRAP_MIN_POSTS and days_in_phase >= BOOTSTRAP_MIN_DAYS:
            state.phase = "learning"
            state.phase_started_at = datetime.utcnow()
            state.updated_at = datetime.utcnow()
            _log_activity(
                db, state.user_id, "phase_transition",
                f"Toby transitioned from bootstrap to learning (after {days_in_phase} days, {scored_post_count} scored posts)",
                level="success",
            )
            return True

    elif state.phase == "learning":
        if days_in_phase >= LEARNING_MIN_DAYS:
            state.phase = "optimizing"
            state.phase_started_at = datetime.utcnow()
            state.updated_at = datetime.utcnow()
            _log_activity(
                db, state.user_id, "phase_transition",
                f"Toby transitioned from learning to optimizing (after {days_in_phase} days)",
                level="success",
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
        created_at=datetime.utcnow(),
    )
    db.add(entry)
