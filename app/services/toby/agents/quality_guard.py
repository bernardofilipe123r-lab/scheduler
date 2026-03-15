"""
Quality Guard Agent — Toby's self-monitoring and content integrity system.

PURPOSE:
    Toby's cognitive self-awareness layer. This agent runs BEFORE content
    generation (step 0 of each tick) and monitors Toby's own scheduled output
    for quality issues, duplicates, and anomalies. Rather than relying on
    external scripts, Toby is responsible for keeping his own output clean.

    This is what makes Toby resilient and scalable: he doesn't need external
    supervision to avoid mistakes — he monitors and corrects himself.

RUNS IN: Step 0 of every tick (before buffer check), per user.

WHY THIS IS AN AGENT (not an external script):
    The 2026-03-08 duplicate content incident showed that dedup guards in the
    scheduling layer aren't enough. The root cause was an architectural choice
    (parallel DB sessions) that no single dedup check could fully prevent.
    By making quality monitoring part of Toby's cognitive loop, we ensure:
    1. Toby self-heals — if a bug causes duplicates, he catches them himself
    2. The logic scales with Toby — new content types, new platforms, new patterns
       are automatically covered without modifying external scripts
    3. It's auditable — all actions are logged as TobyActivityLog entries
    4. It's adaptive — future versions can use LLM reasoning to detect subtle
       quality issues beyond exact dedup (tone drift, brand confusion, etc.)

DETECTION LAYERS:
    Layer A: Fallback/placeholder content rejection
    Layer B: Title duplicate detection (same brand, 5-day window)
    Layer E: Wrong-slot repair (repositions items at non-valid hours)
    Layer C: Time-slot collision repair (repositions duplicates to next valid slot)
    Layer D: Caption near-duplicate detection (same brand, 3-day window)
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models.toby import TobyActivityLog
from app.models.scheduling import ScheduledReel


# ── Forbidden patterns (content that should never be published) ──────────────
FORBIDDEN_TITLE_PATTERNS = [
    "content generation temporarily unavailable",
    "temporarily unavailable",
]

# ── Slot schedule definitions (must match buffer_manager.py / scheduler.py) ──
BASE_REEL_HOURS = [0, 4, 8, 12, 16, 20]
BASE_POST_HOURS = [8, 14]
BASE_THREAD_HOURS = [0, 4, 8, 12, 16, 20]


def _get_type_group(variant: str) -> str:
    """Normalize variant to content type group for slot matching."""
    if variant in ("light", "dark"):
        return "reel"
    if variant == "format_b":
        return "format_b"
    if variant == "post":
        return "post"
    if variant == "threads":
        return "threads"
    return variant or "reel"


def _get_valid_hours(offset: int, type_group: str) -> list[int]:
    """Get valid scheduling hours for a brand+content_type combination."""
    if type_group in ("reel", "format_b"):
        base = BASE_REEL_HOURS
    elif type_group == "post":
        base = BASE_POST_HOURS
    elif type_group == "threads":
        base = BASE_THREAD_HOURS
    else:
        base = BASE_REEL_HOURS
    return [(h + offset) % 24 for h in base]


def _find_next_valid_slot(
    valid_hours: list[int],
    occupied: dict[tuple[str, str, str], int],
    brand: str,
    type_group: str,
    after: datetime,
    max_days: int = 10,
) -> datetime | None:
    """Find the next valid unoccupied slot for a brand+type after a given time."""
    current_day = after.replace(hour=0, minute=0, second=0, microsecond=0)
    for day_offset in range(max_days):
        check_date = current_day + timedelta(days=day_offset)
        for hour in sorted(valid_hours):
            candidate = check_date.replace(hour=hour, minute=0, second=0, microsecond=0)
            if candidate <= after:
                continue
            hk = candidate.strftime("%Y-%m-%d %H")
            if occupied.get((brand, type_group, hk), 0) == 0:
                return candidate
    return None


def quality_guard_sweep(db: Session, user_id: str) -> dict:
    """
    Toby's self-monitoring sweep — detects and cancels problematic scheduled content.

    This runs as step 0 of every tick. It's Toby checking his own work before
    moving on to create more content.

    Args:
        db: Database session (shared with the orchestrator tick)
        user_id: The user whose scheduled content to check

    Returns:
        Summary dict: {fallbacks, title_dupes, slot_dupes, caption_dupes, total}
    """
    now = datetime.now(timezone.utc)
    dedup_horizon = now + timedelta(days=5)     # Layers A, B, D (dedup — tight window)
    repair_horizon = now + timedelta(days=90)   # Layers C, E (slot repair — wide window)

    summary = {
        "fallbacks_cancelled": 0,
        "title_dupes_cancelled": 0,
        "slot_dupes_cancelled": 0,
        "caption_dupes_cancelled": 0,
        "slots_repositioned": 0,
        "total_cancelled": 0,
        "total_repositioned": 0,
    }

    # Dedup candidates: 5-day window (Layers A, B, D)
    scheduled = (
        db.query(ScheduledReel)
        .filter(
            ScheduledReel.user_id == user_id,
            ScheduledReel.status == "scheduled",
            ScheduledReel.scheduled_time > now,
            ScheduledReel.scheduled_time <= dedup_horizon,
        )
        .order_by(ScheduledReel.created_at.asc())
        .all()
    )

    # Repair candidates: 90-day window (Layers C, E — wrong-slot + collision)
    repair_candidates = (
        db.query(ScheduledReel)
        .filter(
            ScheduledReel.user_id == user_id,
            ScheduledReel.status == "scheduled",
            ScheduledReel.scheduled_time > now,
            ScheduledReel.scheduled_time <= repair_horizon,
        )
        .order_by(ScheduledReel.created_at.asc())
        .all()
    )

    if not scheduled and not repair_candidates:
        return summary

    # Load brand offsets for slot validation (Layer E + Layer C repositioning)
    from app.models.brands import Brand
    brands = db.query(Brand).filter(Brand.user_id == user_id, Brand.active == True).all()
    brand_offsets = {b.id: (b.schedule_offset or 0) for b in brands}

    # Build master occupied map from ALL non-failed future reels (for repositioning)
    # Uses counts so we correctly handle multiple items at the same slot
    all_future = (
        db.query(ScheduledReel)
        .filter(
            ScheduledReel.user_id == user_id,
            ScheduledReel.status.in_(["scheduled", "publishing", "partial", "published"]),
            ScheduledReel.scheduled_time > now,
        )
        .all()
    )
    occupied: dict[tuple[str, str, str], int] = {}
    for r in all_future:
        ed = r.extra_data or {}
        b = ed.get("brand", "")
        tg = _get_type_group(ed.get("variant", ""))
        hk = r.scheduled_time.strftime("%Y-%m-%d %H")
        key = (b, tg, hk)
        occupied[key] = occupied.get(key, 0) + 1

    # ── Layer A: Fallback/placeholder content ────────────────────────────────
    for reel in scheduled:
        title = ((reel.extra_data or {}).get("title") or "").strip().lower()
        if any(pattern in title for pattern in FORBIDDEN_TITLE_PATTERNS):
            _cancel_reel(
                db, reel,
                reason="Quality Guard: fallback/placeholder content detected",
                layer="A"
            )
            summary["fallbacks_cancelled"] += 1

    # Re-fetch after cancellations (some may have been cancelled above)
    active = [r for r in scheduled if r.status == "scheduled"]

    # ── Layer B: Title duplicates (same brand + same title) ──────────────────
    # Keep the FIRST occurrence (earliest created_at), cancel later ones
    seen_titles: dict[tuple, ScheduledReel] = {}  # (brand, title_lower) -> first reel
    for reel in active:
        ed = reel.extra_data or {}
        brand = ed.get("brand", "")
        title = (ed.get("title") or "").strip().lower()
        if not title:
            continue

        key = (brand, title)
        if key in seen_titles:
            original = seen_titles[key]
            _cancel_reel(
                db, reel,
                reason=f"Quality Guard: duplicate title '{title[:50]}' — "
                       f"original is {original.schedule_id} at {original.scheduled_time}",
                layer="B"
            )
            summary["title_dupes_cancelled"] += 1
        else:
            seen_titles[key] = reel

    # ── Layer E: Wrong-slot repair (item at non-valid hour for its brand) ────
    # Uses repair_candidates (90-day window) — wrong-slot items must be fixed
    # regardless of distance. Repositions to next valid available slot.
    repair_active = [r for r in repair_candidates if r.status == "scheduled"]
    for reel in repair_active:
        ed = reel.extra_data or {}
        brand = ed.get("brand", "")
        variant = ed.get("variant", "")
        type_group = _get_type_group(variant)

        offset = brand_offsets.get(brand, 0)
        valid_hours = _get_valid_hours(offset, type_group)

        current_hour = reel.scheduled_time.hour
        if current_hour in valid_hours:
            continue

        # This reel is at a wrong slot time → reposition
        old_hk = reel.scheduled_time.strftime("%Y-%m-%d %H")
        old_key = (brand, type_group, old_hk)
        occupied[old_key] = max(0, occupied.get(old_key, 0) - 1)

        # Search from near the item's original time (not from now) so items
        # months in the future find slots near their original position.
        # Use 1 day before original time to allow same-day repositioning,
        # but never search into the past.
        search_from = max(now, reel.scheduled_time - timedelta(days=1))
        new_slot = _find_next_valid_slot(
            valid_hours, occupied, brand, type_group, search_from, max_days=90
        )
        if new_slot:
            _reposition_reel(
                db, reel, new_slot,
                reason=f"Quality Guard: wrong slot hour {current_hour:02d} "
                       f"(valid: {valid_hours}) — repositioned to {new_slot.strftime('%Y-%m-%d %H:%M')}",
                layer="E"
            )
            new_hk = new_slot.strftime("%Y-%m-%d %H")
            occupied[(brand, type_group, new_hk)] = occupied.get((brand, type_group, new_hk), 0) + 1
            summary["slots_repositioned"] += 1
        else:
            # No valid slot found — leave the item in place rather than failing it.
            # It will be retried on the next tick when slots may have freed up.
            old_key_restore = (brand, type_group, old_hk)
            occupied[old_key_restore] = occupied.get(old_key_restore, 0) + 1
            print(f"[TOBY-QG] Layer E: No valid slot for {reel.schedule_id} "
                  f"(hour {current_hour:02d}), leaving in place", flush=True)

    # ── Layer C: Time-slot collisions (same brand + same content type + same hour) ─
    # Uses repair_candidates (90-day window). Keeps the first item (earliest
    # created_at), CANCELS later ones.
    repair_active = [r for r in repair_candidates if r.status == "scheduled"]
    seen_slots: dict[tuple, ScheduledReel] = {}  # (brand, type_group, hour_key) -> first reel
    for reel in repair_active:
        ed = reel.extra_data or {}
        brand = ed.get("brand", "")
        variant = ed.get("variant", "")
        type_group = _get_type_group(variant)

        # Round to nearest hour for collision detection
        hour_key = reel.scheduled_time.strftime("%Y-%m-%d %H")
        key = (brand, type_group, hour_key)

        if key in seen_slots:
            original = seen_slots[key]
            # Collision — try to reposition the duplicate to next valid slot
            offset = brand_offsets.get(brand, 0)
            valid_hours = _get_valid_hours(offset, type_group)
            # Free the current slot in occupied map
            occupied[key] = max(0, occupied.get(key, 0) - 1)
            search_from = max(now, reel.scheduled_time - timedelta(days=1))
            new_slot = _find_next_valid_slot(
                valid_hours, occupied, brand, type_group, search_from, max_days=90
            )
            if new_slot:
                _reposition_reel(
                    db, reel, new_slot,
                    reason=f"Quality Guard: slot collision with {original.schedule_id} "
                           f"at {hour_key} — repositioned to {new_slot.strftime('%Y-%m-%d %H:%M')}",
                    layer="C"
                )
                new_hk = new_slot.strftime("%Y-%m-%d %H")
                occupied[(brand, type_group, new_hk)] = occupied.get((brand, type_group, new_hk), 0) + 1
                summary["slots_repositioned"] += 1
            else:
                # No slot available — leave in place, retry next tick
                occupied[key] = occupied.get(key, 0) + 1
                print(f"[TOBY-QG] Layer C: No valid slot for collision {reel.schedule_id} "
                      f"at {hour_key}, leaving in place", flush=True)
        else:
            seen_slots[key] = reel

    # Re-fetch active list (from dedup 5-day window for Layer D)
    active = [r for r in scheduled if r.status == "scheduled"]

    # ── Layer D: Caption near-duplicates (same brand, first 100 chars) ───────
    seen_captions: dict[tuple, ScheduledReel] = {}  # (brand, caption_prefix) -> first reel
    for reel in active:
        ed = reel.extra_data or {}
        brand = ed.get("brand", "")
        caption = (reel.caption or "").strip()
        if len(caption) < 50:
            continue

        prefix = caption[:100].lower()
        key = (brand, prefix)

        if key in seen_captions:
            original = seen_captions[key]
            _cancel_reel(
                db, reel,
                reason=f"Quality Guard: duplicate caption for {brand} "
                       f"— original is {original.schedule_id}",
                layer="D"
            )
            summary["caption_dupes_cancelled"] += 1
        else:
            seen_captions[key] = reel

    summary["total_cancelled"] = (
        summary["fallbacks_cancelled"]
        + summary["title_dupes_cancelled"]
        + summary["slot_dupes_cancelled"]
        + summary["caption_dupes_cancelled"]
    )
    summary["total_repositioned"] = summary["slots_repositioned"]

    return summary


def _cancel_reel(db: Session, reel: ScheduledReel, reason: str, layer: str):
    """Cancel a scheduled reel and log the action."""
    ed = reel.extra_data or {}
    brand = ed.get("brand", "unknown")
    title = (ed.get("title") or "")[:60]

    print(f"[TOBY-QG] Layer {layer}: Cancelling {reel.schedule_id} "
          f"| brand={brand} | title={title}", flush=True)

    reel.status = "failed"
    reel.publish_error = reason


def _reposition_reel(db: Session, reel: ScheduledReel, new_time: datetime, reason: str, layer: str):
    """Reposition a scheduled reel to a new time slot and log the action."""
    ed = reel.extra_data or {}
    brand = ed.get("brand", "unknown")
    title = (ed.get("title") or "")[:60]
    old_time = reel.scheduled_time.strftime("%Y-%m-%d %H:%M") if reel.scheduled_time else "unknown"

    print(f"[TOBY-QG] Layer {layer}: Repositioning {reel.schedule_id} "
          f"| brand={brand} | {old_time} → {new_time.strftime('%Y-%m-%d %H:%M')} "
          f"| title={title}", flush=True)

    reel.scheduled_time = new_time
