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
import math
from sqlalchemy.orm import Session
from app.models.toby import TobyState, TobyActivityLog, TobyBrandConfig
from app.models.scheduling import ScheduledReel
from app.models.brands import Brand

# B4: Fuzzy match window for slot detection
SLOT_FUZZY_MINUTES = 15


# ── Content-type-aware category mapping (module-level for reuse) ────────
# These map variant/content_type strings to a slot "category" (reel/post/threads)
# used for matching pipeline items against buffer slots.

def variant_to_category(variant: str) -> str:
    """Map a ScheduledReel variant to its slot category."""
    if variant in ("light", "dark", "format_b"):
        return "reel"
    if variant == "post":
        return "post"
    if variant == "threads":
        return "threads"
    return "reel"  # fallback


def content_type_to_category(content_type: str) -> str:
    """Map a buffer slot content_type to its slot category."""
    if content_type in ("reel", "format_b_reel"):
        return "reel"
    if content_type == "post":
        return "post"
    if content_type == "threads_post":
        return "threads"
    return content_type


def _brand_can_publish_type(brand: Brand, content_type: str) -> bool:
    """Check if a brand has the platform credentials to publish this content type.

    Reels and posts require Instagram/Meta credentials.
    Threads require threads_access_token + threads_user_id (already handled inline).
    """
    if content_type in ("reel", "format_b_reel", "post"):
        return bool(
            (brand.meta_access_token or getattr(brand, 'instagram_access_token', None))
            and brand.instagram_business_account_id
        )
    if content_type == "threads_post":
        return bool(brand.threads_access_token and brand.threads_user_id)
    return True


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

    # ── Content-type-aware slot matching ──────────────────────
    # Uses module-level variant_to_category / content_type_to_category helpers.
    # This prevents cross-masking: a thread at 4 AM must NOT mark
    # a reel slot at 4 AM as filled (or vice versa).

    # Build slot map: B4 fuzzy matching ±15 minutes (content-type aware)
    filled_set = set()
    for s in scheduled:
        ed = s.extra_data or {}
        brand_id = ed.get("brand", "")
        cat = variant_to_category(ed.get("variant", "light"))
        filled_set.add((brand_id, s.scheduled_time.strftime("%Y-%m-%d %H:%M"), cat))

    def _slot_is_filled(brand_id: str, slot_time: datetime, content_type: str) -> bool:
        """B4: Check if a slot is filled using fuzzy ±15min matching (content-type aware)."""
        cat = content_type_to_category(content_type)
        key = (brand_id, slot_time.strftime("%Y-%m-%d %H:%M"), cat)
        if key in filled_set:
            return True
        # Fuzzy check: look for any scheduled item within ±SLOT_FUZZY_MINUTES
        for s in scheduled:
            ed = s.extra_data or {}
            s_brand = ed.get("brand", "")
            if s_brand != brand_id:
                continue
            s_cat = variant_to_category(ed.get("variant", "light"))
            if s_cat != cat:
                continue
            diff = abs((s.scheduled_time - slot_time).total_seconds())
            if diff <= SLOT_FUZZY_MINUTES * 60:
                return True
        return False

    # Slot definitions — must match frontend (Home.tsx) and scheduler (scheduler.py)
    BASE_REEL_HOURS = [0, 4, 8, 12, 16, 20]   # 6 reels/day, 4h apart
    BASE_POST_HOURS = [8, 14]                   # 2 posts/day
    BASE_THREAD_HOURS = [0, 4, 8, 12, 16, 20]  # 6 threads/day, 4h apart (same as reels)

    # Global content-type toggles
    reels_enabled = state.reels_enabled if state.reels_enabled is not None else True
    posts_enabled = state.posts_enabled if state.posts_enabled is not None else True
    threads_enabled = getattr(state, 'threads_enabled', True) if state else True

    # Load per-brand config overrides
    brand_configs = db.query(TobyBrandConfig).filter(
        TobyBrandConfig.user_id == user_id,
    ).all()
    brand_config_map = {bc.brand_id: bc for bc in brand_configs}

    # Calculate expected slots per brand
    all_slots = []
    for brand in brands:
        offset_hours = brand.schedule_offset or 0

        # Per-brand overrides (default to global if no per-brand config)
        bc = brand_config_map.get(brand.id)
        if bc and not bc.enabled:
            continue  # Skip brands that are disabled in Toby

        brand_reel_slots = bc.reel_slots_per_day if bc else (state.reel_slots_per_day or 6)
        brand_post_slots = bc.post_slots_per_day if bc else (state.post_slots_per_day or 2)
        brand_thread_slots = (bc.threads_posts_per_day if bc and bc.threads_posts_per_day is not None else (getattr(state, 'threads_posts_per_day', 6) or 6))

        # Determine reel content_type based on brand's reel_format
        brand_reel_format = (bc.reel_format if bc and bc.reel_format else "format_a")
        reel_content_type = "format_b_reel" if brand_reel_format == "format_b" else "reel"

        # Respect global toggles
        if not reels_enabled:
            brand_reel_slots = 0
        if not posts_enabled:
            brand_post_slots = 0
        if not threads_enabled:
            brand_thread_slots = 0

        # Only generate thread slots for brands with Threads connected
        has_threads = bool(brand.threads_access_token and brand.threads_user_id)
        if not has_threads:
            brand_thread_slots = 0

        # Only generate reel/post slots for brands with Instagram/Meta connected
        has_instagram = _brand_can_publish_type(brand, "reel")
        if not has_instagram:
            brand_reel_slots = 0
            brand_post_slots = 0

        # Generate expected slot times for this brand
        for day_offset in range(state.buffer_days or 2):
            day = now.date() + timedelta(days=day_offset)

            # Reel slots: use per-brand count, pick first N from base hours
            for base_hour in BASE_REEL_HOURS[:brand_reel_slots]:
                hour = (base_hour + offset_hours) % 24
                slot_time = datetime(day.year, day.month, day.day, hour, 0, tzinfo=timezone.utc)
                if slot_time <= now:
                    continue
                all_slots.append({
                    "brand_id": brand.id,
                    "time": slot_time.isoformat(),
                    "content_type": reel_content_type,
                    "filled": _slot_is_filled(brand.id, slot_time, reel_content_type),
                })

            # Post slots: use per-brand count, pick first N from base hours
            for base_hour in BASE_POST_HOURS[:brand_post_slots]:
                hour = (base_hour + offset_hours) % 24
                slot_time = datetime(day.year, day.month, day.day, hour, 0, tzinfo=timezone.utc)
                if slot_time <= now:
                    continue
                all_slots.append({
                    "brand_id": brand.id,
                    "time": slot_time.isoformat(),
                    "content_type": "post",
                    "filled": _slot_is_filled(brand.id, slot_time, "post"),
                })

            # Thread slots: use per-brand count, pick first N from base hours
            for base_hour in BASE_THREAD_HOURS[:brand_thread_slots]:
                hour = (base_hour + offset_hours) % 24
                slot_time = datetime(day.year, day.month, day.day, hour, 0, tzinfo=timezone.utc)
                if slot_time <= now:
                    continue
                all_slots.append({
                    "brand_id": brand.id,
                    "time": slot_time.isoformat(),
                    "content_type": "threads_post",
                    "filled": _slot_is_filled(brand.id, slot_time, "threads_post"),
                })

    total = len(all_slots)
    filled = sum(1 for s in all_slots if s["filled"])

    # Pipeline: count PENDING GenerationJobs as "virtually filling" slots.
    # These items haven't been scheduled yet but DO represent content that will fill
    # slots once approved. Without this, Toby would keep generating duplicates.
    # CRITICAL: Only count 'pending' — NOT 'approved'. Approved items already have
    # a ScheduledReel entry that marks their slot as filled. Counting approved items
    # too causes double-counting, inflating effective_filled and making Toby think
    # the buffer is healthy when it actually has uncovered slots.
    # CRITICAL: Count per (brand, content-type category) to avoid cross-type masking
    # (2026-03-14 fix: reel pipeline items must not mask thread/post empty slots).
    from app.models.jobs import GenerationJob
    pipeline_jobs = (
        db.query(GenerationJob.brands, GenerationJob.variant, GenerationJob.content_format)
        .filter(
            GenerationJob.user_id == user_id,
            GenerationJob.pipeline_status == "pending",
        )
        .all()
    )

    # Build per-(brand, category) pipeline count
    pipeline_per_brand_cat: dict[tuple[str, str], int] = {}
    pipeline_per_brand: dict[str, int] = {}  # total per brand (for backward compat)
    for (job_brands, job_variant, job_format) in pipeline_jobs:
        cat = variant_to_category(job_variant or "light")
        if isinstance(job_brands, list):
            for bid in job_brands:
                key = (bid, cat)
                pipeline_per_brand_cat[key] = pipeline_per_brand_cat.get(key, 0) + 1
                pipeline_per_brand[bid] = pipeline_per_brand.get(bid, 0) + 1
    pipeline_pending_count = sum(pipeline_per_brand.values())

    # Effective filled = actually scheduled + pending in pipeline
    effective_filled = filled + pipeline_pending_count
    empty = max(0, total - effective_filled)

    # Per-brand health: pipeline items only count for matching content-type slots
    any_brand_has_empty = False
    for brand in brands:
        brand_slots = [s for s in all_slots if s["brand_id"] == brand.id]
        brand_filled_count = sum(1 for s in brand_slots if s["filled"])
        # Sum pipeline items only for categories that have empty slots for this brand
        brand_pipeline = 0
        for cat in ("reel", "post", "threads"):
            cat_slots = [s for s in brand_slots if content_type_to_category(s["content_type"]) == cat]
            cat_filled = sum(1 for s in cat_slots if s["filled"])
            cat_pipeline = pipeline_per_brand_cat.get((brand.id, cat), 0)
            cat_total = len(cat_slots)
            # Only count pipeline items up to the number of empty slots for this category
            brand_pipeline += min(cat_pipeline, max(0, cat_total - cat_filled))
        brand_total = len(brand_slots)
        brand_effective = brand_filled_count + brand_pipeline
        if brand_effective < brand_total:
            any_brand_has_empty = True
            break

    # Determine health — use per-brand + per-category awareness
    if any_brand_has_empty:
        total_effective_filled = 0
        for brand in brands:
            brand_slots = [s for s in all_slots if s["brand_id"] == brand.id]
            brand_filled_count = sum(1 for s in brand_slots if s["filled"])
            brand_pipeline = 0
            for cat in ("reel", "post", "threads"):
                cat_slots = [s for s in brand_slots if content_type_to_category(s["content_type"]) == cat]
                cat_filled = sum(1 for s in cat_slots if s["filled"])
                cat_pipeline = pipeline_per_brand_cat.get((brand.id, cat), 0)
                cat_total = len(cat_slots)
                brand_pipeline += min(cat_pipeline, max(0, cat_total - cat_filled))
            brand_total = len(brand_slots)
            total_effective_filled += min(brand_total, brand_filled_count + brand_pipeline)
        effective_filled = total_effective_filled
        empty = max(0, total - effective_filled)

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
        brand_reels = sum(1 for s in brand_slots if s["content_type"] in ("reel", "format_b_reel"))
        brand_posts = sum(1 for s in brand_slots if s["content_type"] == "post")
        brand_threads = sum(1 for s in brand_slots if s["content_type"] == "threads_post")
        brand_breakdown.append({
            "brand_id": brand.id,
            "display_name": brand.display_name or brand.id,
            "total": brand_total,
            "filled": brand_filled,
            "reels": brand_reels,
            "posts": brand_posts,
            "threads": brand_threads,
        })

    return {
        "health": health,
        "total_slots": total,
        "filled_slots": effective_filled,
        "empty_slots": empty,
        "percent": min(100.0, round(effective_filled / total * 100, 1)) if total > 0 else 100.0,
        "next_empty_slot": next_empty,
        "slots": all_slots,
        "brand_breakdown": brand_breakdown,
        "brand_count": len(brands),
        "reel_slots_per_day": state.reel_slots_per_day or 6,
        "post_slots_per_day": state.post_slots_per_day or 2,
        "buffer_days": state.buffer_days or 2,
    }


def get_empty_slots(db: Session, user_id: str, state: TobyState) -> list[dict]:
    """Get empty slots that need content.

    Smart burst: for buffer_days > 4, only return empty slots within a
    generation window of ceil(buffer_days / 2) days.  This prevents Toby
    from trying to fill a 10-day buffer all at once — instead it fills
    the first 5 days, and as time passes the window slides forward to
    cover the remaining days.

    Pipeline-aware: slots that are already covered by pending/approved
    pipeline items are excluded. Without this, Toby would keep generating
    content for brands that already have enough pending items.
    """
    status = get_buffer_status(db, user_id, state)
    empty = [s for s in status["slots"] if not s["filled"]]

    buffer_days = state.buffer_days or 2
    if buffer_days > 4:
        gen_window_days = math.ceil(buffer_days / 2)
        gen_horizon = datetime.now(timezone.utc) + timedelta(days=gen_window_days)
        empty = [
            s for s in empty
            if datetime.fromisoformat(s["time"]) <= gen_horizon
        ]

    # ── Pipeline-aware filtering (2026-03-15 fix) ────────────────────────
    # Subtract slots already covered by PENDING pipeline items.
    # Approved items are NOT counted here because approval schedules them
    # into a ScheduledReel, which already marks their slot as filled above.
    # Only pending items represent unscheduled content waiting for user review.
    from app.models.jobs import GenerationJob
    pipeline_jobs = (
        db.query(GenerationJob.brands, GenerationJob.variant)
        .filter(
            GenerationJob.user_id == user_id,
            GenerationJob.pipeline_status == "pending",
        )
        .all()
    )

    # Count pipeline items per (brand_id, category)
    pipeline_counts: dict[tuple[str, str], int] = {}
    for (job_brands, job_variant) in pipeline_jobs:
        cat = variant_to_category(job_variant or "light")
        if isinstance(job_brands, list):
            for bid in job_brands:
                key = (bid, cat)
                pipeline_counts[key] = pipeline_counts.get(key, 0) + 1

    # For each brand+category, subtract pipeline-covered slots
    remaining_pipeline = dict(pipeline_counts)  # mutable copy
    truly_empty = []
    for slot in empty:
        cat = content_type_to_category(slot["content_type"])
        key = (slot["brand_id"], cat)
        if remaining_pipeline.get(key, 0) > 0:
            remaining_pipeline[key] -= 1  # This slot is covered by a pipeline item
        else:
            truly_empty.append(slot)

    return truly_empty
