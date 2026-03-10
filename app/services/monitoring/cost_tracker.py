"""
Cost tracking service — records per-user spending on DeepSeek and DeAPI.

Uses contextvars to propagate user_id through the call chain.
Call set_current_user(user_id) at entry points (API handlers, Toby ticks).
Then record_deepseek_call() / record_deapi_call() pick it up automatically.

Daily records are kept for 30 days, then aggregated into monthly summaries.
"""

import contextvars
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from app.db_connection import get_db_session
from app.models.user_costs import UserCostDaily, UserCostMonthly

# ─── Context variable for current user ───────────────────────────────────────

_current_user_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "cost_tracker_user_id", default=None
)


def set_current_user(user_id: str) -> contextvars.Token:
    """Set the current user_id for cost tracking. Call at entry points."""
    return _current_user_id.set(user_id)


def get_current_user_id() -> Optional[str]:
    """Get the current user_id from context."""
    return _current_user_id.get()


# ─── DeepSeek pricing (per 1M tokens) ────────────────────────────────────────
# deepseek-chat model pricing (as of 2025)
DEEPSEEK_INPUT_COST_PER_M = 0.14   # $0.14 per 1M input tokens
DEEPSEEK_OUTPUT_COST_PER_M = 0.28  # $0.28 per 1M output tokens

# DeAPI pricing per image generation
DEAPI_COST_PER_IMAGE = 0.02  # ~$0.02 per image (approximate)

# Freepik pricing per image generation (Classic Fast plan: 500 EUR / 10k images)
FREEPIK_COST_PER_IMAGE = 0.05  # ~€0.05 per image (500 EUR / 10,000 images)


def _get_or_create_daily(db, user_id: str, target_date: date) -> UserCostDaily:
    """Get or create a daily cost record for a user."""
    record = (
        db.query(UserCostDaily)
        .filter(UserCostDaily.user_id == user_id, UserCostDaily.date == target_date)
        .first()
    )
    if not record:
        record = UserCostDaily(
            user_id=user_id,
            date=target_date,
            deepseek_calls=0,
            deepseek_input_tokens=0,
            deepseek_output_tokens=0,
            deepseek_cost_usd=0.0,
            deapi_calls=0,
            deapi_cost_usd=0.0,
            freepik_calls=0,
            freepik_cost_usd=0.0,
            reels_generated=0,
            carousels_generated=0,
        )
        db.add(record)
        db.flush()
    return record


def record_deepseek_call(
    input_tokens: int = 0,
    output_tokens: int = 0,
    user_id: Optional[str] = None,
) -> None:
    """Record a DeepSeek API call with token usage."""
    uid = user_id or get_current_user_id()
    if not uid:
        return  # No user context — skip tracking

    cost = (
        (input_tokens / 1_000_000) * DEEPSEEK_INPUT_COST_PER_M
        + (output_tokens / 1_000_000) * DEEPSEEK_OUTPUT_COST_PER_M
    )

    try:
        with get_db_session() as db:
            record = _get_or_create_daily(db, uid, date.today())
            record.deepseek_calls = (record.deepseek_calls or 0) + 1
            record.deepseek_input_tokens = (record.deepseek_input_tokens or 0) + input_tokens
            record.deepseek_output_tokens = (record.deepseek_output_tokens or 0) + output_tokens
            record.deepseek_cost_usd = (record.deepseek_cost_usd or 0.0) + cost
            record.updated_at = datetime.now(timezone.utc)
    except Exception as e:
        print(f"⚠️ Cost tracking (deepseek) failed: {e}", flush=True)


def record_deapi_call(user_id: Optional[str] = None) -> None:
    """Record a DeAPI image generation call."""
    uid = user_id or get_current_user_id()
    if not uid:
        return

    try:
        with get_db_session() as db:
            record = _get_or_create_daily(db, uid, date.today())
            record.deapi_calls = (record.deapi_calls or 0) + 1
            record.deapi_cost_usd = (record.deapi_cost_usd or 0.0) + DEAPI_COST_PER_IMAGE
            record.updated_at = datetime.now(timezone.utc)
    except Exception as e:
        print(f"⚠️ Cost tracking (deapi) failed: {e}", flush=True)


def record_freepik_call(user_id: Optional[str] = None) -> None:
    """Record a Freepik image generation call."""
    uid = user_id or get_current_user_id()
    if not uid:
        return

    try:
        with get_db_session() as db:
            record = _get_or_create_daily(db, uid, date.today())
            record.freepik_calls = (getattr(record, 'freepik_calls', None) or 0) + 1
            record.freepik_cost_usd = (getattr(record, 'freepik_cost_usd', None) or 0.0) + FREEPIK_COST_PER_IMAGE
            record.updated_at = datetime.now(timezone.utc)
    except Exception as e:
        print(f"⚠️ Cost tracking (freepik) failed: {e}", flush=True)


def record_content_generated(
    content_type: str,
    user_id: Optional[str] = None,
) -> None:
    """Record a reel or carousel being generated."""
    uid = user_id or get_current_user_id()
    if not uid:
        return

    try:
        with get_db_session() as db:
            record = _get_or_create_daily(db, uid, date.today())
            if content_type == "reel":
                record.reels_generated = (record.reels_generated or 0) + 1
            elif content_type in ("carousel", "post"):
                record.carousels_generated = (record.carousels_generated or 0) + 1
            record.updated_at = datetime.now(timezone.utc)
    except Exception as e:
        print(f"⚠️ Cost tracking (content) failed: {e}", flush=True)


# ─── Query functions ──────────────────────────────────────────────────────────

def get_user_costs(user_id: str, period: str = "month") -> dict:
    """
    Get cost data for a user.

    period: "day", "week", "month", "all"
    Returns daily breakdown + totals.
    """
    try:
        with get_db_session() as db:
            today = date.today()

            if period == "day":
                start_date = today
            elif period == "week":
                start_date = today - timedelta(days=7)
            elif period == "month":
                start_date = today - timedelta(days=30)
            else:
                start_date = None

            # Get daily records (recent data, up to 30 days)
            query = db.query(UserCostDaily).filter(
                UserCostDaily.user_id == user_id
            )
            if start_date:
                query = query.filter(UserCostDaily.date >= start_date)
            daily_records = query.order_by(UserCostDaily.date.desc()).all()

            # Get monthly records (historical aggregated data)
            monthly_records = db.query(UserCostMonthly).filter(
                UserCostMonthly.user_id == user_id
            ).order_by(UserCostMonthly.month.desc()).all()

            # Build daily breakdown
            daily_breakdown = []
            for r in daily_records:
                daily_breakdown.append({
                    "date": r.date.isoformat(),
                    "deepseek_calls": r.deepseek_calls or 0,
                    "deepseek_input_tokens": r.deepseek_input_tokens or 0,
                    "deepseek_output_tokens": r.deepseek_output_tokens or 0,
                    "deepseek_cost_usd": round(r.deepseek_cost_usd or 0.0, 6),
                    "deapi_calls": r.deapi_calls or 0,
                    "deapi_cost_usd": round(r.deapi_cost_usd or 0.0, 6),
                    "freepik_calls": getattr(r, 'freepik_calls', None) or 0,
                    "freepik_cost_usd": round(getattr(r, 'freepik_cost_usd', None) or 0.0, 6),
                    "reels_generated": r.reels_generated or 0,
                    "carousels_generated": r.carousels_generated or 0,
                    "total_cost_usd": round(
                        (r.deepseek_cost_usd or 0.0) + (r.deapi_cost_usd or 0.0) + (getattr(r, 'freepik_cost_usd', None) or 0.0), 6
                    ),
                })

            # Build monthly breakdown (historical)
            monthly_breakdown = []
            for r in monthly_records:
                monthly_breakdown.append({
                    "month": r.month.isoformat(),
                    "deepseek_calls": r.deepseek_calls or 0,
                    "deepseek_input_tokens": r.deepseek_input_tokens or 0,
                    "deepseek_output_tokens": r.deepseek_output_tokens or 0,
                    "deepseek_cost_usd": round(r.deepseek_cost_usd or 0.0, 6),
                    "deapi_calls": r.deapi_calls or 0,
                    "deapi_cost_usd": round(r.deapi_cost_usd or 0.0, 6),
                    "freepik_calls": getattr(r, 'freepik_calls', None) or 0,
                    "freepik_cost_usd": round(getattr(r, 'freepik_cost_usd', None) or 0.0, 6),
                    "reels_generated": r.reels_generated or 0,
                    "carousels_generated": r.carousels_generated or 0,
                    "total_cost_usd": round(
                        (r.deepseek_cost_usd or 0.0) + (r.deapi_cost_usd or 0.0) + (getattr(r, 'freepik_cost_usd', None) or 0.0), 6
                    ),
                })

            # Compute totals from all daily + all monthly
            all_records = list(daily_records) + list(monthly_records)
            totals = {
                "deepseek_calls": sum(r.deepseek_calls or 0 for r in all_records),
                "deepseek_input_tokens": sum(r.deepseek_input_tokens or 0 for r in all_records),
                "deepseek_output_tokens": sum(r.deepseek_output_tokens or 0 for r in all_records),
                "deepseek_cost_usd": round(sum(r.deepseek_cost_usd or 0.0 for r in all_records), 6),
                "deapi_calls": sum(r.deapi_calls or 0 for r in all_records),
                "deapi_cost_usd": round(sum(r.deapi_cost_usd or 0.0 for r in all_records), 6),
                "freepik_calls": sum(getattr(r, 'freepik_calls', None) or 0 for r in all_records),
                "freepik_cost_usd": round(sum(getattr(r, 'freepik_cost_usd', None) or 0.0 for r in all_records), 6),
                "reels_generated": sum(r.reels_generated or 0 for r in all_records),
                "carousels_generated": sum(r.carousels_generated or 0 for r in all_records),
            }
            totals["total_cost_usd"] = round(
                totals["deepseek_cost_usd"] + totals["deapi_cost_usd"] + totals["freepik_cost_usd"], 6
            )

            return {
                "user_id": user_id,
                "period": period,
                "totals": totals,
                "daily": daily_breakdown,
                "monthly": monthly_breakdown,
            }
    except Exception as e:
        print(f"⚠️ Cost query failed: {e}", flush=True)
        return {
            "user_id": user_id,
            "period": period,
            "totals": {
                "deepseek_calls": 0, "deepseek_input_tokens": 0,
                "deepseek_output_tokens": 0, "deepseek_cost_usd": 0.0,
                "deapi_calls": 0, "deapi_cost_usd": 0.0,
                "freepik_calls": 0, "freepik_cost_usd": 0.0,
                "reels_generated": 0, "carousels_generated": 0,
                "total_cost_usd": 0.0,
            },
            "daily": [],
            "monthly": [],
        }


def aggregate_old_daily_records() -> int:
    """
    Aggregate daily records older than 30 days into monthly summaries.
    Called periodically (e.g., once per day via Toby tick or cron).

    Returns number of daily records archived.
    """
    cutoff = date.today() - timedelta(days=30)
    archived = 0

    try:
        with get_db_session() as db:
            old_records = (
                db.query(UserCostDaily)
                .filter(UserCostDaily.date < cutoff)
                .all()
            )

            if not old_records:
                return 0

            # Group by (user_id, month)
            monthly_groups: dict = {}
            for r in old_records:
                month_start = r.date.replace(day=1)
                key = (str(r.user_id), month_start)
                if key not in monthly_groups:
                    monthly_groups[key] = []
                monthly_groups[key].append(r)

            for (uid, month_start), records in monthly_groups.items():
                # Get or create monthly record
                monthly = (
                    db.query(UserCostMonthly)
                    .filter(
                        UserCostMonthly.user_id == uid,
                        UserCostMonthly.month == month_start,
                    )
                    .first()
                )
                if not monthly:
                    monthly = UserCostMonthly(
                        user_id=uid,
                        month=month_start,
                        deepseek_calls=0,
                        deepseek_input_tokens=0,
                        deepseek_output_tokens=0,
                        deepseek_cost_usd=0.0,
                        deapi_calls=0,
                        deapi_cost_usd=0.0,
                        freepik_calls=0,
                        freepik_cost_usd=0.0,
                        reels_generated=0,
                        carousels_generated=0,
                    )
                    db.add(monthly)
                    db.flush()

                # Aggregate daily into monthly
                for r in records:
                    monthly.deepseek_calls = (monthly.deepseek_calls or 0) + (r.deepseek_calls or 0)
                    monthly.deepseek_input_tokens = (monthly.deepseek_input_tokens or 0) + (r.deepseek_input_tokens or 0)
                    monthly.deepseek_output_tokens = (monthly.deepseek_output_tokens or 0) + (r.deepseek_output_tokens or 0)
                    monthly.deepseek_cost_usd = (monthly.deepseek_cost_usd or 0.0) + (r.deepseek_cost_usd or 0.0)
                    monthly.deapi_calls = (monthly.deapi_calls or 0) + (r.deapi_calls or 0)
                    monthly.deapi_cost_usd = (monthly.deapi_cost_usd or 0.0) + (r.deapi_cost_usd or 0.0)
                    monthly.freepik_calls = (monthly.freepik_calls or 0) + (getattr(r, 'freepik_calls', None) or 0)
                    monthly.freepik_cost_usd = (monthly.freepik_cost_usd or 0.0) + (getattr(r, 'freepik_cost_usd', None) or 0.0)
                    monthly.reels_generated = (monthly.reels_generated or 0) + (r.reels_generated or 0)
                    monthly.carousels_generated = (monthly.carousels_generated or 0) + (r.carousels_generated or 0)
                    monthly.updated_at = datetime.now(timezone.utc)

                    db.delete(r)
                    archived += 1

            print(f"📊 Aggregated {archived} daily cost records into monthly summaries", flush=True)
            return archived

    except Exception as e:
        print(f"⚠️ Cost aggregation failed: {e}", flush=True)
        return 0
