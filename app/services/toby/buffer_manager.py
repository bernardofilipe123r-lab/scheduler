"""
Toby Buffer Manager — ensures every slot for the next N days has content ready.

Buffer Health States:
  HEALTHY  — All slots for next 48h are filled
  LOW      — 1-3 slots in next 48h are empty
  CRITICAL — 4+ slots empty, or less than 24h of content remaining

Features:
  - B4: Fuzzy ±15min slot matching (avoids overwrites from minor time diffs)
  - B5: Respects created_by flag to avoid overwriting user-created content
"""
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.toby import TobyState, TobyActivityLog
from app.models.scheduling import ScheduledReel
from app.models.brands import Brand

# B4: Fuzzy match window for slot detection
SLOT_FUZZY_MINUTES = 15


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
    now = datetime.now(timezone.utc)
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
    # CRITICAL: Include "partial" and "published" statuses to prevent
    # duplicate content generation for slots that already have content.
    # "partial" = published to some platforms but not all (still counts as filled)
    # "published" = fully published (definitely counts as filled)
    # Note: We do NOT filter by created_by here because we want both Toby-created
    # and user-created content to fill slots (prevents duplicates)
    scheduled = (
        db.query(ScheduledReel)
        .filter(
            ScheduledReel.user_id == user_id,
            ScheduledReel.scheduled_time >= now,
            ScheduledReel.scheduled_time <= horizon,
            ScheduledReel.status.in_(["scheduled", "publishing", "partial", "published"]),
        )
        .all()
    )

    # Build slot map: B4 fuzzy matching ±15 minutes
    filled_set = set()
    for s in scheduled:
        ed = s.extra_data or {}
        brand_id = ed.get("brand", "")
        # Store the actual minute-rounded time for exact matching
        filled_set.add((brand_id, s.scheduled_time.strftime("%Y-%m-%d %H:%M")))

    def _slot_is_filled(brand_id: str, slot_time: datetime) -> bool:
        """B4: Check if a slot is filled using fuzzy ±15min matching."""
        key = (brand_id, slot_time.strftime("%Y-%m-%d %H:%M"))
        if key in filled_set:
            return True
        # Fuzzy check: look for any scheduled item within ±SLOT_FUZZY_MINUTES
        for s in scheduled:
            ed = s.extra_data or {}
            s_brand = ed.get("brand", "")
            if s_brand != brand_id:
                continue
            diff = abs((s.scheduled_time - slot_time).total_seconds())
            if diff <= SLOT_FUZZY_MINUTES * 60:
                return True
        return False

    # Slot definitions — must match frontend (Home.tsx) and scheduler (scheduler.py)
    BASE_REEL_HOURS = [0, 4, 8, 12, 16, 20]   # 6 reels/day, 4h apart
    BASE_POST_HOURS = [8, 14]                   # 2 posts/day

    # Calculate expected slots per brand
    all_slots = []
    for brand in brands:
        offset_hours = brand.schedule_offset or 0

        # Generate expected slot times for this brand
        for day_offset in range(state.buffer_days or 2):
            day = now.date() + timedelta(days=day_offset)

            # Reel slots: base hours + brand offset
            for base_hour in BASE_REEL_HOURS:
                hour = (base_hour + offset_hours) % 24
                slot_time = datetime(day.year, day.month, day.day, hour, 0, tzinfo=timezone.utc)
                if slot_time <= now:
                    continue
                all_slots.append({
                    "brand_id": brand.id,
                    "time": slot_time.isoformat(),
                    "content_type": "reel",
                    "filled": _slot_is_filled(brand.id, slot_time),
                })

            # Post slots: base hours + brand offset
            for base_hour in BASE_POST_HOURS:
                hour = (base_hour + offset_hours) % 24
                slot_time = datetime(day.year, day.month, day.day, hour, 0, tzinfo=timezone.utc)
                if slot_time <= now:
                    continue
                all_slots.append({
                    "brand_id": brand.id,
                    "time": slot_time.isoformat(),
                    "content_type": "post",
                    "filled": _slot_is_filled(brand.id, slot_time),
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

    # Per-brand breakdown
    brand_breakdown = []
    for brand in brands:
        brand_slots = [s for s in all_slots if s["brand_id"] == brand.id]
        brand_filled = sum(1 for s in brand_slots if s["filled"])
        brand_total = len(brand_slots)
        brand_reels = sum(1 for s in brand_slots if s["content_type"] == "reel")
        brand_posts = sum(1 for s in brand_slots if s["content_type"] == "post")
        brand_breakdown.append({
            "brand_id": brand.id,
            "display_name": brand.display_name or brand.id,
            "total": brand_total,
            "filled": brand_filled,
            "reels": brand_reels,
            "posts": brand_posts,
        })

    return {
        "health": health,
        "total_slots": total,
        "filled_slots": filled,
        "empty_slots": empty,
        "percent": round(filled / total * 100, 1) if total > 0 else 100.0,
        "next_empty_slot": next_empty,
        "slots": all_slots,
        "brand_breakdown": brand_breakdown,
        "brand_count": len(brands),
        "reel_slots_per_day": state.reel_slots_per_day or 6,
        "post_slots_per_day": state.post_slots_per_day or 2,
        "buffer_days": state.buffer_days or 2,
    }


def get_empty_slots(db: Session, user_id: str, state: TobyState) -> list[dict]:
    """Get all empty slots that need content."""
    status = get_buffer_status(db, user_id, state)
    return [s for s in status["slots"] if not s["filled"]]
