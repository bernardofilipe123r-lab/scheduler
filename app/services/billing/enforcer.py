"""
Billing enforcement background job.
Runs every 60 minutes via APScheduler.
Responsibilities:
  - Apply grace deadline when past_due > 7 days
  - Soft-lock: disable Toby, pause scheduled posts for locked users
"""
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

from app.db_connection import get_db_session
from app.models.auth import UserProfile, EXEMPT_TAGS
from app.models.billing import BrandSubscription

log = logging.getLogger(__name__)

GRACE_PERIOD_DAYS = 7


def billing_enforcement_tick():
    """Called by APScheduler every 60 minutes."""
    try:
        with get_db_session() as db:
            _enforce(db)
    except Exception:
        log.exception("BILLING ENFORCER: unhandled error")


def _enforce(db: Session):
    past_due_users = (
        db.query(UserProfile)
        .filter(
            UserProfile.billing_status == "past_due",
            ~UserProfile.tag.in_(list(EXEMPT_TAGS)),
        )
        .all()
    )

    now = datetime.now(timezone.utc)

    for user in past_due_users:
        # Set grace deadline if not yet set
        if user.billing_grace_deadline is None:
            user.billing_grace_deadline = now + timedelta(days=GRACE_PERIOD_DAYS)
            log.info(
                f"BILLING: Grace deadline set for user {user.user_id} → "
                f"{user.billing_grace_deadline.isoformat()}"
            )
            continue

        # Grace period still active
        if now < user.billing_grace_deadline:
            continue

        # Grace expired → soft-lock
        if user.billing_locked_at is None:
            _soft_lock_user(db, user, now)

    db.commit()


def _soft_lock_user(db: Session, user: UserProfile, now: datetime):
    """Disable Toby and pause future scheduled posts."""
    from app.models.toby import TobyState
    from app.models.scheduling import ScheduledReel

    user.billing_status = "locked"
    user.billing_locked_at = now

    # Disable Toby
    toby_state = db.query(TobyState).filter_by(user_id=user.user_id).first()
    if toby_state and toby_state.enabled:
        toby_state.enabled = False
        log.info(f"BILLING: Disabled Toby for user {user.user_id}")

    # Pause future scheduled posts
    paused_count = (
        db.query(ScheduledReel)
        .filter(
            ScheduledReel.user_id == user.user_id,
            ScheduledReel.status == "scheduled",
            ScheduledReel.scheduled_time > now,
        )
        .update({"status": "paused"})
    )

    log.info(
        f"BILLING: Soft-locked user {user.user_id} — "
        f"paused {paused_count} scheduled posts"
    )
