"""
Toby Content Planner — decides WHAT to create and WHEN.

Produces ContentPlan objects that get handed to the existing
ContentGeneratorV2 + JobProcessor pipeline.
"""
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Optional
from sqlalchemy.orm import Session
from app.models.toby import TobyState, TobyContentTag, TobyActivityLog
from app.services.toby.learning_engine import choose_strategy, get_personality_prompt, StrategyChoice
from app.services.toby.buffer_manager import get_empty_slots


@dataclass
class ContentPlan:
    """A plan for one piece of content that Toby will create."""
    user_id: str
    brand_id: str
    content_type: str            # "reel" | "text_video_reel" | "post"
    scheduled_time: str          # ISO datetime
    personality_id: str
    personality_prompt: str      # System prompt modifier
    topic_bucket: str
    hook_strategy: str
    title_format: str
    visual_style: str
    story_category: Optional[str] = None  # text_video only, drives StoryDiscoverer
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

    # Get available topics from NicheConfig
    available_topics = _get_available_topics(db, user_id)

    plans = []
    for slot in interleaved:
        # Phase 3: Try combo-based selection first, fallback to per-dimension
        strategy = _select_strategy_with_combos(
            db, user_id, slot["brand_id"], slot["content_type"],
            state.explore_ratio or 0.30, available_topics,
        )

        personality_prompt = get_personality_prompt(slot["content_type"], strategy.personality)

        plan = ContentPlan(
            user_id=user_id,
            brand_id=slot["brand_id"],
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

    return plans


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
            # Thompson Sampling on combos
            samples = {}
            for combo in top_combos:
                p = max(0.01, min(0.99, (combo.avg_toby_score or 50) / 100.0))
                n = min(combo.sample_count, 50)
                alpha = max(1.0, n * p)
                beta = max(1.0, n * (1 - p))
                samples[combo.id] = (random.betavariate(alpha, beta), combo)

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


def _get_available_topics(db: Session, user_id: str) -> list[str]:
    """Get topic categories from NicheConfig for this user."""
    from app.models.niche_config import NicheConfig

    config = (
        db.query(NicheConfig)
        .filter(NicheConfig.user_id == user_id)
        .first()
    )
    if config and config.topic_categories:
        return config.topic_categories
    return ["general"]
