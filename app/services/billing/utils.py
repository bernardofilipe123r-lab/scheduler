"""
Billing utilities — shared helpers for billing enforcement.

SECURITY: This module is the single source of truth for billing access checks.
Every content-generation or scheduling path MUST call validate_can_generate()
before proceeding.
"""
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

from app.models.auth import UserProfile, EXEMPT_TAGS
from app.models.billing import BrandSubscription

log = logging.getLogger(__name__)


def is_exempt(user: UserProfile) -> bool:
    """Check if user is exempt from billing (special/admin/super_admin)."""
    return user.tag in EXEMPT_TAGS


def recalculate_user_billing_status(user_id: str, db: Session):
    """
    Derive user.billing_status from the worst BrandSubscription status.
    Called after every webhook event that modifies a subscription.
    """
    user = db.query(UserProfile).filter_by(user_id=user_id).first()
    if not user:
        return
    if is_exempt(user):
        user.billing_status = "none"
        db.commit()
        return

    subs = db.query(BrandSubscription).filter_by(user_id=user_id).all()
    if not subs:
        user.billing_status = "none"
        db.commit()
        return

    statuses = {s.status for s in subs}

    if "past_due" in statuses:
        user.billing_status = "past_due"
    elif "active" in statuses:
        user.billing_status = "active"
        user.billing_grace_deadline = None
        user.billing_locked_at = None
    elif statuses <= {"cancelled", "unpaid", "incomplete"}:
        user.billing_status = "cancelled"

    db.commit()


def unlock_user_if_needed(user_id: str, db: Session):
    """Called when a payment succeeds. Reverses soft-lock if active."""
    from app.models.toby import TobyState
    from app.models.scheduling import ScheduledReel

    user = db.query(UserProfile).filter_by(user_id=user_id).first()
    if not user or user.billing_status not in ("past_due", "locked"):
        return

    user.billing_status = "active"
    user.billing_grace_deadline = None
    user.billing_locked_at = None

    # Re-enable Toby
    toby_state = db.query(TobyState).filter_by(user_id=user_id).first()
    if toby_state and not toby_state.enabled:
        toby_state.enabled = True

    # Resume future paused posts
    now = datetime.now(timezone.utc)
    db.query(ScheduledReel).filter(
        ScheduledReel.user_id == user_id,
        ScheduledReel.status == "paused",
        ScheduledReel.scheduled_time > now,
    ).update({"status": "scheduled"})

    db.commit()
    log.info(f"BILLING: Unlocked user {user_id} — payment received")


def validate_can_generate(user_id: str, brand_id: str, db: Session) -> tuple:
    """
    Check if a user+brand can generate content.
    Called before every generation job (user-initiated & Toby-initiated).
    Returns (allowed: bool, reason: str | None).
    """
    user = db.query(UserProfile).filter_by(user_id=user_id).first()
    if not user:
        return False, "User not found"

    if is_exempt(user):
        return True, None

    if user.billing_status == "locked":
        return False, "Account locked — payment overdue. Update your payment method at /billing."

    brand_sub = db.query(BrandSubscription).filter_by(
        user_id=user_id, brand_id=brand_id
    ).first()

    if not brand_sub or brand_sub.status not in ("active", "past_due"):
        return False, "No active subscription for this brand. Subscribe at /billing."

    return True, None
