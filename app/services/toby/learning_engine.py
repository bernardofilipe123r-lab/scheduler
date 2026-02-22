"""
Toby Learning Engine — Thompson Sampling multi-armed bandit for strategy selection.

Tracks performance per strategy dimension (personality, topic, hook, etc.)
separately for reels and carousels (posts). Uses explore/exploit ratio
to balance proven strategies with experimental ones.
"""
import random
import uuid
from datetime import datetime
from dataclasses import dataclass
from typing import Optional
from sqlalchemy.orm import Session
from app.models.toby import TobyStrategyScore, TobyExperiment, TobyActivityLog


# Default personality pools per content type
REEL_PERSONALITIES = {
    "edu_calm":  "You are a calm, knowledgeable health educator. Use clear, evidence-based language. Avoid hype.",
    "provoc":    "You challenge common health myths with surprising facts. Use bold, attention-grabbing language.",
    "story":     "Frame every health tip as a mini-story. Use 'Imagine...', 'What if...', personal anecdotes.",
    "data":      "Lead with specific numbers and statistics. '73% of people...', 'Studies show that...'.",
    "urgent":    "Create a sense of urgency around health changes. 'Stop doing this TODAY', 'Your gut is screaming'.",
}

POST_PERSONALITIES = {
    "deep_edu":   "Create thorough, well-structured educational content with clear slide progression.",
    "myth_bust":  "Structure each carousel as debunking a common belief, with evidence on each slide.",
    "listicle":   "Create numbered lists of tips, foods, habits. Each slide = one item.",
    "compare":    "'This vs That' format. Compare foods, habits, routines side-by-side.",
    "protocol":   "Step-by-step guides and daily protocols. Actionable and specific.",
}

HOOK_STRATEGIES = ["question", "myth_buster", "shocking_stat", "personal_story", "bold_claim"]

TITLE_FORMATS = ["how_x_does_y", "number_one_mistake", "why_experts_say", "stop_doing_this", "hidden_truth"]

VISUAL_STYLES = ["dark_cinematic", "light_clean", "vibrant_bold"]


@dataclass
class StrategyChoice:
    """A strategy decision made by the learning engine for one content slot."""
    personality: str
    topic_bucket: str
    hook_strategy: str
    title_format: str
    visual_style: str
    is_experiment: bool = False
    experiment_id: Optional[str] = None


def get_personality_prompt(content_type: str, personality_id: str) -> str:
    """Get the system prompt modifier for a personality."""
    pool = REEL_PERSONALITIES if content_type == "reel" else POST_PERSONALITIES
    return pool.get(personality_id, "")


def choose_strategy(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    explore_ratio: float = 0.30,
    available_topics: list[str] = None,
) -> StrategyChoice:
    """
    Choose a strategy for the next content piece using Thompson Sampling.

    ~explore_ratio of the time, picks a random strategy (EXPLORE).
    ~(1-explore_ratio) of the time, picks the best-performing strategy (EXPLOIT).
    """
    is_explore = random.random() < explore_ratio

    personality = _pick_dimension(
        db, user_id, brand_id, content_type, "personality",
        list(REEL_PERSONALITIES.keys() if content_type == "reel" else POST_PERSONALITIES.keys()),
        is_explore,
    )

    topics = available_topics or ["general"]
    topic = _pick_dimension(
        db, user_id, brand_id, content_type, "topic",
        topics, is_explore,
    )

    hook = _pick_dimension(
        db, user_id, brand_id, content_type, "hook",
        HOOK_STRATEGIES, is_explore,
    )

    title_fmt = _pick_dimension(
        db, user_id, brand_id, content_type, "title_format",
        TITLE_FORMATS, is_explore,
    )

    visual = _pick_dimension(
        db, user_id, brand_id, content_type, "visual_style",
        VISUAL_STYLES, is_explore,
    )

    # Check for an active experiment and link to it
    experiment_id = None
    active_exp = (
        db.query(TobyExperiment)
        .filter(
            TobyExperiment.user_id == user_id,
            TobyExperiment.content_type == content_type,
            TobyExperiment.status == "active",
        )
        .first()
    )
    if active_exp:
        experiment_id = active_exp.id

    return StrategyChoice(
        personality=personality,
        topic_bucket=topic,
        hook_strategy=hook,
        title_format=title_fmt,
        visual_style=visual,
        is_experiment=is_explore,
        experiment_id=experiment_id,
    )


def update_strategy_score(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    dimension: str,
    option_value: str,
    score: float,
):
    """Update running aggregates for a strategy option after scoring."""
    existing = (
        db.query(TobyStrategyScore)
        .filter(
            TobyStrategyScore.user_id == user_id,
            TobyStrategyScore.brand_id == brand_id,
            TobyStrategyScore.content_type == content_type,
            TobyStrategyScore.dimension == dimension,
            TobyStrategyScore.option_value == option_value,
        )
        .first()
    )

    if not existing:
        existing = TobyStrategyScore(
            id=str(uuid.uuid4()),
            user_id=user_id,
            brand_id=brand_id,
            content_type=content_type,
            dimension=dimension,
            option_value=option_value,
        )
        db.add(existing)

    existing.sample_count += 1
    existing.total_score += score
    existing.avg_score = existing.total_score / existing.sample_count

    if score > existing.best_score:
        existing.best_score = score
    if score < existing.worst_score:
        existing.worst_score = score

    # Update variance (Welford's online algorithm simplified)
    if existing.sample_count > 1:
        diff = score - existing.avg_score
        existing.score_variance = (
            existing.score_variance * (existing.sample_count - 2) / (existing.sample_count - 1)
            + diff * diff / existing.sample_count
        )

    # Rolling window of last 10 scores
    recent = list(existing.recent_scores or [])
    recent.append(score)
    existing.recent_scores = recent[-10:]
    existing.updated_at = datetime.utcnow()


def update_experiment_results(
    db: Session,
    user_id: str,
    content_type: str,
    dimension: str,
    option_value: str,
    score: float,
):
    """Update an active experiment with a new score for an option."""
    exp = (
        db.query(TobyExperiment)
        .filter(
            TobyExperiment.user_id == user_id,
            TobyExperiment.content_type == content_type,
            TobyExperiment.dimension == dimension,
            TobyExperiment.status == "active",
        )
        .first()
    )
    if not exp:
        return

    results = dict(exp.results or {})
    if option_value not in results:
        results[option_value] = {"count": 0, "total_score": 0, "avg_score": 0, "scores": []}

    entry = results[option_value]
    entry["count"] += 1
    entry["total_score"] += score
    entry["avg_score"] = entry["total_score"] / entry["count"]
    entry["scores"].append(round(score, 1))
    results[option_value] = entry
    exp.results = results

    # Check if experiment can be completed
    options = exp.options or []
    all_sufficient = all(
        results.get(opt, {}).get("count", 0) >= exp.min_samples
        for opt in options
    )
    if all_sufficient and len(options) > 1:
        # Find winner by highest avg_score
        best_opt = max(options, key=lambda o: results.get(o, {}).get("avg_score", 0))
        exp.winner = best_opt
        exp.status = "completed"
        exp.completed_at = datetime.utcnow()

        best_avg = results[best_opt]["avg_score"]
        _log(db, user_id, "experiment_completed",
             f"Experiment completed: '{best_opt}' wins for {dimension} ({content_type}) with avg score {best_avg:.1f}",
             level="success",
             metadata={"dimension": dimension, "winner": best_opt, "results": results})


def create_experiment(
    db: Session,
    user_id: str,
    content_type: str,
    dimension: str,
    options: list[str],
    min_samples: int = 5,
) -> Optional[TobyExperiment]:
    """Create a new A/B experiment for a dimension if none is active."""
    existing = (
        db.query(TobyExperiment)
        .filter(
            TobyExperiment.user_id == user_id,
            TobyExperiment.content_type == content_type,
            TobyExperiment.dimension == dimension,
            TobyExperiment.status == "active",
        )
        .first()
    )
    if existing:
        return None  # Already an active experiment

    exp = TobyExperiment(
        id=str(uuid.uuid4()),
        user_id=user_id,
        content_type=content_type,
        dimension=dimension,
        options=options,
        results={},
        status="active",
        min_samples=min_samples,
        started_at=datetime.utcnow(),
    )
    db.add(exp)

    _log(db, user_id, "experiment_started",
         f"Started {dimension} experiment for {content_type}s: {options}",
         level="info",
         metadata={"dimension": dimension, "content_type": content_type, "options": options})

    return exp


def get_insights(db: Session, user_id: str) -> dict:
    """Get aggregated insights: best topics, hooks, personalities per content type."""
    scores = (
        db.query(TobyStrategyScore)
        .filter(TobyStrategyScore.user_id == user_id, TobyStrategyScore.sample_count > 0)
        .all()
    )

    insights = {"reel": {}, "post": {}}
    for s in scores:
        ct = s.content_type
        if ct not in insights:
            continue
        dim = s.dimension
        if dim not in insights[ct]:
            insights[ct][dim] = []
        insights[ct][dim].append({
            "option": s.option_value,
            "avg_score": round(s.avg_score, 1),
            "sample_count": s.sample_count,
            "best_score": round(s.best_score, 1),
            "recent_trend": s.recent_scores,
        })

    # Sort each dimension by avg_score descending
    for ct in insights:
        for dim in insights[ct]:
            insights[ct][dim].sort(key=lambda x: x["avg_score"], reverse=True)

    return insights


def _pick_dimension(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    dimension: str,
    options: list[str],
    is_explore: bool,
) -> str:
    """Pick an option for a dimension using exploit/explore logic."""
    if is_explore or not options:
        return random.choice(options) if options else "general"

    # Exploit: find the option with the highest avg_score
    scores = (
        db.query(TobyStrategyScore)
        .filter(
            TobyStrategyScore.user_id == user_id,
            TobyStrategyScore.content_type == content_type,
            TobyStrategyScore.dimension == dimension,
            TobyStrategyScore.sample_count > 0,
        )
        .order_by(TobyStrategyScore.avg_score.desc())
        .first()
    )

    if scores and scores.option_value in options:
        return scores.option_value

    # No data yet — pick randomly
    return random.choice(options) if options else "general"


def _log(db, user_id, action_type, description, level="info", metadata=None):
    db.add(TobyActivityLog(
        user_id=user_id,
        action_type=action_type,
        description=description,
        action_metadata=metadata,
        level=level,
        created_at=datetime.utcnow(),
    ))
