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
    content_type: str            # "reel" or "post"
    scheduled_time: str          # ISO datetime
    personality_id: str
    personality_prompt: str      # System prompt modifier
    topic_bucket: str
    hook_strategy: str
    title_format: str
    visual_style: str
    experiment_id: Optional[str] = None
    is_experiment: bool = False
    is_control: bool = False


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
    """
    empty_slots = get_empty_slots(db, user_id, state)
    if not empty_slots:
        return []

    # Get available topics from NicheConfig
    available_topics = _get_available_topics(db, user_id)

    plans = []
    for slot in empty_slots[:max_plans]:
        strategy = choose_strategy(
            db=db,
            user_id=user_id,
            brand_id=slot["brand_id"],
            content_type=slot["content_type"],
            explore_ratio=state.explore_ratio or 0.30,
            available_topics=available_topics,
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
            experiment_id=strategy.experiment_id,
            is_experiment=strategy.is_experiment,
        )
        plans.append(plan)

    return plans


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
