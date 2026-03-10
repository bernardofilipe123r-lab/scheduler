"""
Toby Content Planner — decides WHAT to create and WHEN.

Produces ContentPlan objects that get handed to the existing
ContentGeneratorV2 + JobProcessor pipeline.

Diversity Fixes (all read-only, zero risk to existing learning data):
  Fix 1 — Batch dedup: topics_picked_this_batch per brand prevents the same
           topic from being selected multiple times in one planning tick.
  Fix 2 — Per-brand cooldown: TobyContentTag is queried to find topics used
           in the last TOPIC_COOLDOWN_DAYS and those are deprioritised.
  Fix 3 — Similarity retry: each planned strategy is scored against already-
           scheduled content (DB) + already-planned slots (in-memory). If the
           similarity score exceeds SIMILARITY_THRESHOLD, up to
           MAX_DIVERSITY_RETRIES attempts are made with a progressively
           narrower topic list before accepting the best available candidate.
"""
import uuid
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from typing import Optional
from sqlalchemy.orm import Session
from app.models.toby import TobyState, TobyContentTag, TobyActivityLog
from app.services.toby.learning_engine import choose_strategy, get_personality_prompt, StrategyChoice
from app.services.toby.buffer_manager import get_empty_slots

# ── Diversity constants ──────────────────────────────────────────────────────
# Topics used more recently than this are moved to the back of the list
TOPIC_COOLDOWN_DAYS = 3
# Similarity score [0..1] above which a retry is attempted.
# Score breakdown: same topic = 0.60, same hook = 0.20, same title_format = 0.20
SIMILARITY_THRESHOLD = 0.60
# Max re-rolls per slot when similarity is too high
MAX_DIVERSITY_RETRIES = 3


@dataclass
class ContentPlan:
    """A plan for one piece of content that Toby will create."""
    user_id: str
    brand_id: str
    content_type: str            # "reel" | "format_b_reel" | "post" | "threads_post"
    scheduled_time: str          # ISO datetime
    personality_id: str
    personality_prompt: str      # System prompt modifier
    topic_bucket: str
    hook_strategy: str
    title_format: str
    visual_style: str
    story_category: Optional[str] = None  # format_b only, drives StoryDiscoverer
    experiment_id: Optional[str] = None
    is_experiment: bool = False
    is_control: bool = False
    used_fallback: bool = False  # D2: Set when content generation used fallback


def create_plans_for_empty_slots(
    db: Session,
    user_id: str,
    state: TobyState,
    max_plans: int = 6,
) -> list[ContentPlan]:
    """
    Create content plans for empty slots in the buffer.

    Integrates with the learning engine to choose strategies.
    Limits to max_plans per tick to avoid overwhelming the system.
    Distributes across brands round-robin (picks the earliest empty slot
    per brand, then cycles) instead of filling one brand at a time.

    Diversity guarantees (all read-only, no mutations):
    - Fix 1: No topic repeated twice in the same batch per brand
    - Fix 2: Topics used in the last TOPIC_COOLDOWN_DAYS are deprioritised
    - Fix 3: Strategy similarity against already-scheduled content is checked;
             if too high, a retry is attempted with a narrower topic list
    """
    empty_slots = get_empty_slots(db, user_id, state)
    if not empty_slots:
        return []

    # Round-robin: group by brand, interleave so each brand gets served
    from collections import defaultdict
    by_brand: dict[str, list[dict]] = defaultdict(list)
    for slot in empty_slots:
        by_brand[slot["brand_id"]].append(slot)

    # Interleave: take 1 from each brand in turn
    interleaved: list[dict] = []
    brand_iters = [iter(slots) for slots in by_brand.values()]
    while brand_iters and len(interleaved) < max_plans:
        next_round = []
        for it in brand_iters:
            slot = next(it, None)
            if slot is not None:
                interleaved.append(slot)
                next_round.append(it)
                if len(interleaved) >= max_plans:
                    break
        brand_iters = next_round

    # All topics for this user (raw, from NicheConfig)
    all_topics = _get_all_topics(db, user_id)

    # ── Per-brand state, lazy-initialised on first slot for that brand ───────
    # Fix 2: cooldown-filtered topic list per brand
    brand_available_topics: dict[str, list[str]] = {}
    # Fix 1: topics already picked in this batch, per brand
    topics_picked_this_batch: dict[str, list[str]] = {}
    # Fix 3: similarity context = scheduled + already-planned, per brand
    brand_similarity_ctx: dict[str, list[dict]] = {}

    plans = []
    for slot in interleaved:
        brand_id = slot["brand_id"]

        # Lazy-init per-brand state
        if brand_id not in brand_available_topics:
            # Fix 2: put fresh (not recently used) topics first
            brand_available_topics[brand_id] = _topics_with_cooldown_order(
                db, user_id, brand_id, all_topics
            )
        if brand_id not in brand_similarity_ctx:
            # Fix 3: prime the context from the DB (already scheduled content)
            brand_similarity_ctx[brand_id] = _load_scheduled_context(
                db, user_id, brand_id
            )

        available = brand_available_topics[brand_id]
        batch_picked = topics_picked_this_batch.setdefault(brand_id, [])
        similarity_ctx = brand_similarity_ctx[brand_id]

        # Fix 1: exclude topics already chosen in this batch for this brand
        remaining = [t for t in available if t not in batch_picked]
        topics_for_slot = remaining if remaining else available

        # Fix 3: similarity-aware retry loop
        strategy = _pick_diverse_strategy(
            db=db,
            user_id=user_id,
            brand_id=brand_id,
            slot=slot,
            state=state,
            topics_for_slot=topics_for_slot,
            all_topics=available,
            similarity_ctx=similarity_ctx,
        )

        personality_prompt = get_personality_prompt(slot["content_type"], strategy.personality)

        plan = ContentPlan(
            user_id=user_id,
            brand_id=brand_id,
            content_type=slot["content_type"],
            scheduled_time=slot["time"],
            personality_id=strategy.personality,
            personality_prompt=personality_prompt,
            topic_bucket=strategy.topic_bucket,
            hook_strategy=strategy.hook_strategy,
            title_format=strategy.title_format,
            visual_style=strategy.visual_style,
            story_category=strategy.story_category,
            experiment_id=strategy.experiment_id,
            is_experiment=strategy.is_experiment,
        )
        plans.append(plan)

        # Update per-brand batch state so subsequent slots in this tick see it
        # Fix 1: mark topic as used in this batch
        batch_picked.append(strategy.topic_bucket)
        # Fix 3: add this plan to similarity context so future slots account for it
        similarity_ctx.append({
            "topic_bucket": strategy.topic_bucket,
            "hook_strategy": strategy.hook_strategy,
            "title_format": strategy.title_format,
            "personality": strategy.personality,
        })

    return plans


# ── Diversity helpers (read-only — no DB writes) ─────────────────────────────

def _topics_with_cooldown_order(
    db: Session,
    user_id: str,
    brand_id: str,
    all_topics: list[str],
) -> list[str]:
    """
    Fix 2: Return topics sorted so recently-used ones come last.

    Queries TobyContentTag (user+brand scoped) for the last-used timestamp
    per topic.  Topics not used in the last TOPIC_COOLDOWN_DAYS come first;
    cooled topics are appended at the end so Thompson Sampling can still
    reach them when all fresh options are exhausted.

    Never returns an empty list — falls back to all_topics on any error.
    """
    if len(all_topics) <= 1:
        return list(all_topics)

    try:
        from sqlalchemy import func

        cutoff = datetime.now(timezone.utc) - timedelta(days=TOPIC_COOLDOWN_DAYS)

        query = (
            db.query(
                TobyContentTag.topic_bucket,
                func.max(TobyContentTag.created_at).label("last_used"),
            )
            .filter(
                TobyContentTag.user_id == user_id,
                TobyContentTag.brand_id == brand_id,
                TobyContentTag.topic_bucket.isnot(None),
            )
            .group_by(TobyContentTag.topic_bucket)
        )
        rows = query.all()
        last_used_map: dict[str, datetime] = {r.topic_bucket: r.last_used for r in rows}

        fresh = [t for t in all_topics if last_used_map.get(t) is None or last_used_map[t] < cutoff]
        cooled = [t for t in all_topics if t not in fresh]

        # Fresh topics first; if nothing is fresh, return all (never block)
        return fresh + cooled if fresh else list(all_topics)

    except Exception:
        return list(all_topics)


def _load_scheduled_context(
    db: Session,
    user_id: str,
    brand_id: str,
    lookahead_days: int = 2,
) -> list[dict]:
    """
    Fix 3: Load topic/hook/title_format combos from content already scheduled
    in the next `lookahead_days` for this brand.

    Used as the baseline similarity context before planning starts.
    Returns [] on any error — always safe to ignore.
    """
    try:
        from app.models.scheduling import ScheduledReel
        from sqlalchemy import and_

        now = datetime.now(timezone.utc)
        horizon = now + timedelta(days=lookahead_days)

        rows = (
            db.query(
                TobyContentTag.topic_bucket,
                TobyContentTag.hook_strategy,
                TobyContentTag.title_format,
                TobyContentTag.personality,
            )
            .join(
                ScheduledReel,
                and_(
                    TobyContentTag.schedule_id == ScheduledReel.schedule_id,
                    ScheduledReel.scheduled_time >= now,
                    ScheduledReel.scheduled_time <= horizon,
                    ScheduledReel.status.in_(["scheduled", "publishing"]),
                ),
            )
            .filter(
                TobyContentTag.user_id == user_id,
                TobyContentTag.brand_id == brand_id,
            )
            .all()
        )

        return [
            {
                "topic_bucket": r.topic_bucket,
                "hook_strategy": r.hook_strategy,
                "title_format": r.title_format,
                "personality": r.personality,
            }
            for r in rows
        ]
    except Exception:
        return []


def _strategy_similarity(candidate: StrategyChoice, existing: dict) -> float:
    """
    Compute a [0.0, 1.0] similarity score between a candidate strategy and
    one already-scheduled or already-planned piece.

    Weights:
      - Same topic_bucket  → 0.60  (dominant driver of clustering)
      - Same hook_strategy → 0.20
      - Same title_format  → 0.20

    A score >= SIMILARITY_THRESHOLD (0.60) means the topic is identical —
    enough to trigger a retry.  A score of 1.0 means an exact copy.
    """
    score = 0.0
    if candidate.topic_bucket and candidate.topic_bucket == existing.get("topic_bucket"):
        score += 0.60
    if candidate.hook_strategy and candidate.hook_strategy == existing.get("hook_strategy"):
        score += 0.20
    if candidate.title_format and candidate.title_format == existing.get("title_format"):
        score += 0.20
    return score


def _max_similarity(candidate: StrategyChoice, ctx: list[dict]) -> float:
    """Return the highest similarity score between candidate and any item in ctx."""
    if not ctx:
        return 0.0
    return max(_strategy_similarity(candidate, item) for item in ctx)


def _pick_diverse_strategy(
    db: Session,
    user_id: str,
    brand_id: str,
    slot: dict,
    state: TobyState,
    topics_for_slot: list[str],
    all_topics: list[str],
    similarity_ctx: list[dict],
) -> StrategyChoice:
    """
    Fix 3: Attempt up to MAX_DIVERSITY_RETRIES to find a strategy that is
    not too similar to already-scheduled / already-planned content.

    On each failed attempt the offending topic is removed from the candidate
    list so Thompson Sampling is forced to explore a different angle.
    On the final attempt, the best-so-far candidate is accepted regardless.

    This never raises — it always returns a StrategyChoice.
    """
    explore_ratio = state.explore_ratio or 0.30
    remaining_topics = list(topics_for_slot)
    best_candidate: Optional[StrategyChoice] = None
    best_similarity = 1.0

    for attempt in range(MAX_DIVERSITY_RETRIES):
        candidate = _select_strategy_with_combos(
            db, user_id, brand_id, slot["content_type"],
            explore_ratio, remaining_topics,
        )

        sim = _max_similarity(candidate, similarity_ctx)

        if sim < SIMILARITY_THRESHOLD:
            return candidate  # Good enough — use it immediately

        # Track the best (least similar) candidate seen so far
        if best_candidate is None or sim < best_similarity:
            best_candidate = candidate
            best_similarity = sim

        # Narrow the topic list: remove the offending topic for the next attempt
        remaining_topics = [t for t in remaining_topics if t != candidate.topic_bucket]
        if not remaining_topics:
            # All topics exhausted — fall back to full list for the last attempt
            remaining_topics = list(all_topics)

    # Could not find a diverse enough strategy — return best candidate found
    return best_candidate or candidate


def _select_strategy_with_combos(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    explore_ratio: float,
    available_topics: list[str],
) -> StrategyChoice:
    """Phase 3: Try combo-based selection, fall back to per-dimension.

    If we have >=5 combos with >=3 samples each, use Thompson Sampling
    on the full combo (personality|topic|hook). Otherwise, use the
    standard per-dimension strategy selection.
    """
    import random

    try:
        from app.models.toby_cognitive import TobyStrategyCombos

        MIN_COMBOS = 5
        MIN_COMBO_SAMPLES = 3

        top_combos = (
            db.query(TobyStrategyCombos)
            .filter(
                TobyStrategyCombos.user_id == user_id,
                TobyStrategyCombos.brand_id == brand_id,
                TobyStrategyCombos.content_type == content_type,
                TobyStrategyCombos.sample_count >= MIN_COMBO_SAMPLES,
            )
            .order_by(TobyStrategyCombos.avg_toby_score.desc())
            .limit(20)
            .all()
        )

        # Only use combo selection when we have enough data
        if len(top_combos) >= MIN_COMBOS and random.random() > explore_ratio:
            # Thompson Sampling on combos — but restrict to allowed topics
            # so combo selection also respects diversity constraints
            samples = {}
            for combo in top_combos:
                dims = combo.dimensions if isinstance(combo.dimensions, dict) else {}
                combo_topic = dims.get("topic", "")
                # Skip combos whose topic is not in the allowed list for this slot
                if available_topics and combo_topic not in available_topics:
                    continue
                p = max(0.01, min(0.99, (combo.avg_toby_score or 50) / 100.0))
                n = min(combo.sample_count, 50)
                alpha = max(1.0, n * p)
                beta = max(1.0, n * (1 - p))
                samples[combo.id] = (random.betavariate(alpha, beta), combo)

            if samples:
                best_id = max(samples, key=lambda k: samples[k][0])
                _, best_combo = samples[best_id]

                dims = best_combo.dimensions if isinstance(best_combo.dimensions, dict) else {}
                personality = dims.get("personality", "edu_calm")
                topic = dims.get("topic", random.choice(available_topics) if available_topics else "general")
                hook = dims.get("hook", "question")
                title_fmt = dims.get("title_format", "how_x_does_y")
                visual = dims.get("visual_style", "dark_cinematic")

                return StrategyChoice(
                    personality=personality,
                    topic_bucket=topic,
                    hook_strategy=hook,
                    title_format=title_fmt,
                    visual_style=visual,
                )
    except Exception:
        pass  # Non-critical — fall through to per-dimension selection

    # Fallback: standard per-dimension selection
    return choose_strategy(
        db=db,
        user_id=user_id,
        brand_id=brand_id,
        content_type=content_type,
        explore_ratio=explore_ratio,
        available_topics=available_topics,
    )


def record_content_tag(
    db: Session,
    user_id: str,
    schedule_id: str,
    plan: ContentPlan,
):
    """Record Toby metadata for a piece of generated content."""
    tag = TobyContentTag(
        id=str(uuid.uuid4()),
        user_id=user_id,
        brand_id=plan.brand_id,
        schedule_id=schedule_id,
        content_type=plan.content_type,
        personality=plan.personality_id,
        topic_bucket=plan.topic_bucket,
        hook_strategy=plan.hook_strategy,
        title_format=plan.title_format,
        visual_style=plan.visual_style,
        experiment_id=plan.experiment_id,
        is_experiment=plan.is_experiment,
        is_control=plan.is_control,
        used_fallback=plan.used_fallback,
        created_at=datetime.now(timezone.utc),
    )
    db.add(tag)


def _get_all_topics(db: Session, user_id: str) -> list[str]:
    """Get raw topic categories from NicheConfig for this user (no filtering)."""
    from app.models.niche_config import NicheConfig

    config = (
        db.query(NicheConfig)
        .filter(NicheConfig.user_id == user_id)
        .first()
    )
    if config and config.topic_categories:
        return config.topic_categories
    return ["general"]


# Keep old name as alias so any callers outside this module aren't broken
def _get_available_topics(db: Session, user_id: str) -> list[str]:
    """Backward-compatible alias for _get_all_topics."""
    return _get_all_topics(db, user_id)
