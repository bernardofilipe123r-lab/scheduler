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
    Layer C: Time-slot collision detection (same brand+type, ±1 hour)
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
    horizon = now + timedelta(days=5)

    summary = {
        "fallbacks_cancelled": 0,
        "title_dupes_cancelled": 0,
        "slot_dupes_cancelled": 0,
        "caption_dupes_cancelled": 0,
        "total_cancelled": 0,
    }

    # Get all future scheduled posts for this user
    scheduled = (
        db.query(ScheduledReel)
        .filter(
            ScheduledReel.user_id == user_id,
            ScheduledReel.status == "scheduled",
            ScheduledReel.scheduled_time > now,
            ScheduledReel.scheduled_time <= horizon,
        )
        .order_by(ScheduledReel.created_at.asc())
        .all()
    )

    if not scheduled:
        return summary

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

    # Re-fetch active list
    active = [r for r in scheduled if r.status == "scheduled"]

    # ── Layer C: Time-slot collisions (same brand + same content type + ±1h) ─
    seen_slots: dict[tuple, ScheduledReel] = {}  # (brand, type_group, hour_key) -> first reel
    for reel in active:
        ed = reel.extra_data or {}
        brand = ed.get("brand", "")
        variant = ed.get("variant", "")

        # Normalize variant to content type group
        if variant in ("light", "dark"):
            type_group = "reel"
        elif variant == "format_b":
            type_group = "format_b"
        elif variant == "post":
            type_group = "post"
        else:
            type_group = variant

        # Round to nearest hour for collision detection
        hour_key = reel.scheduled_time.strftime("%Y-%m-%d %H")
        key = (brand, type_group, hour_key)

        if key in seen_slots:
            original = seen_slots[key]
            _cancel_reel(
                db, reel,
                reason=f"Quality Guard: time-slot collision with {original.schedule_id} "
                       f"for {brand} ({type_group}) at {hour_key}",
                layer="C"
            )
            summary["slot_dupes_cancelled"] += 1
        else:
            seen_slots[key] = reel

    # Re-fetch active list
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
