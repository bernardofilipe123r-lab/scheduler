"""
Toby Buffer Manager — ensures every slot for the next N days has content ready.

Buffer Health States:
  HEALTHY  — All slots for next 48h are filled
  LOW      — 1-3 slots in next 48h are empty
  CRITICAL — 4+ slots empty, or less than 24h of content remaining
"""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.toby import TobyState, TobyActivityLog
from app.models.scheduling import ScheduledReel
from app.models.brands import Brand


def get_buffer_status(db: Session, user_id: str, state: TobyState) -> dict:
    """
    Calculate current buffer health.

    Returns:
        {
            "health": "healthy" | "low" | "critical",
            "total_slots": int,
            "filled_slots": int,
            "empty_slots": int,
            "percent": float,
            "next_empty_slot": datetime | None,
            "slots": [{"brand_id", "time", "content_type", "filled": bool}, ...]
        }
    """
    buffer_hours = (state.buffer_days or 2) * 24
    now = datetime.utcnow()
    horizon = now + timedelta(hours=buffer_hours)

    # Get all brands for this user
    brands = db.query(Brand).filter(Brand.user_id == user_id, Brand.active == True).all()
    if not brands:
        return {
            "health": "healthy",
            "total_slots": 0,
            "filled_slots": 0,
            "empty_slots": 0,
            "percent": 100.0,
            "next_empty_slot": None,
            "slots": [],
        }

    # Get all scheduled reels for this user in the buffer window
    scheduled = (
        db.query(ScheduledReel)
        .filter(
            ScheduledReel.user_id == user_id,
            ScheduledReel.scheduled_time >= now,
            ScheduledReel.scheduled_time <= horizon,
            ScheduledReel.status.in_(["scheduled", "publishing"]),
        )
        .all()
    )

    # Build slot map: a set of (brand_id, scheduled_time) that are filled
    filled_set = set()
    for s in scheduled:
        ed = s.extra_data or {}
        brand_id = ed.get("brand", "")
        filled_set.add((brand_id, s.scheduled_time.strftime("%Y-%m-%d %H:%M")))

    # Calculate expected slots per brand
    all_slots = []
    for brand in brands:
        reel_slots = state.reel_slots_per_day or 6
        post_slots = state.post_slots_per_day or 2
        total_per_day = reel_slots + post_slots

        # Generate expected slot times for this brand
        for day_offset in range(state.buffer_days or 2):
            day = now.date() + timedelta(days=day_offset)
            offset_hours = brand.schedule_offset or 0
            for slot_idx in range(total_per_day):
                # Distribute slots evenly across the day
                hour = (offset_hours + int(slot_idx * 24 / total_per_day)) % 24
                slot_time = datetime(day.year, day.month, day.day, hour, 0)
                if slot_time <= now:
                    continue  # Skip past slots

                ct = "reel" if slot_idx < reel_slots else "post"
                key = (brand.id, slot_time.strftime("%Y-%m-%d %H:%M"))
                filled = key in filled_set
                all_slots.append({
                    "brand_id": brand.id,
                    "time": slot_time.isoformat(),
                    "content_type": ct,
                    "filled": filled,
                })

    total = len(all_slots)
    filled = sum(1 for s in all_slots if s["filled"])
    empty = total - filled

    # Determine health
    if empty == 0:
        health = "healthy"
    elif empty <= 3:
        health = "low"
    else:
        health = "critical"

    # Find next empty slot
    empty_slots = [s for s in all_slots if not s["filled"]]
    next_empty = empty_slots[0]["time"] if empty_slots else None

    return {
        "health": health,
        "total_slots": total,
        "filled_slots": filled,
        "empty_slots": empty,
        "percent": round(filled / total * 100, 1) if total > 0 else 100.0,
        "next_empty_slot": next_empty,
        "slots": all_slots,
    }


def get_empty_slots(db: Session, user_id: str, state: TobyState) -> list[dict]:
    """Get all empty slots that need content."""
    status = get_buffer_status(db, user_id, state)
    return [s for s in status["slots"] if not s["filled"]]
