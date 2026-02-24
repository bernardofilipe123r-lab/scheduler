"""
Toby Learning Engine — multi-armed bandit for strategy selection.

Supports both epsilon-greedy and Thompson Sampling selection modes.
Tracks performance per strategy dimension (personality, topic, hook, etc.)
separately for reels and carousels (posts).

Features:
  - Thompson Sampling via Beta distributions (Phase A1)
  - Experiment timeout after 21 days (E6 fix)
  - Single-option experiment guard (J4 fix)
  - Tie-breaking by sample_count (E2 fix)
  - Cross-brand cold-start fallback (Phase C)
  - Per-brand explore ratio (H5)
"""
import random
import uuid
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field
from typing import Optional
from sqlalchemy.orm import Session
from app.models.toby import TobyStrategyScore, TobyExperiment, TobyActivityLog


# ── Experiment timeout (E6) ──
EXPERIMENT_TIMEOUT_DAYS = 21

# ── Cold-start threshold (Phase C) ──
COLD_START_THRESHOLD = 10


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
    used_fallback: bool = False


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
    use_thompson: bool = True,
) -> StrategyChoice:
    """
    Choose a strategy for the next content piece.

    Supports Thompson Sampling (default) or epsilon-greedy selection.
    Implements per-brand explore ratio (H5) and cross-brand cold-start (Phase C).
    """
    # H5: Per-brand dynamic explore ratio based on brand's data maturity
    effective_explore = _get_effective_explore_ratio(
        db, user_id, brand_id, content_type, explore_ratio
    )
    is_explore = random.random() < effective_explore

    personality = _pick_dimension(
        db, user_id, brand_id, content_type, "personality",
        list(REEL_PERSONALITIES.keys() if content_type == "reel" else POST_PERSONALITIES.keys()),
        is_explore, use_thompson,
    )

    topics = available_topics or ["general"]
    topic = _pick_dimension(
        db, user_id, brand_id, content_type, "topic",
        topics, is_explore, use_thompson,
    )

    hook = _pick_dimension(
        db, user_id, brand_id, content_type, "hook",
        HOOK_STRATEGIES, is_explore, use_thompson,
    )

    title_fmt = _pick_dimension(
        db, user_id, brand_id, content_type, "title_format",
        TITLE_FORMATS, is_explore, use_thompson,
    )

    visual = _pick_dimension(
        db, user_id, brand_id, content_type, "visual_style",
        VISUAL_STYLES, is_explore, use_thompson,
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


def _get_effective_explore_ratio(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    base_ratio: float,
) -> float:
    """H5: Compute effective explore ratio based on brand's data maturity."""
    from app.models.analytics import PostPerformance

    if not brand_id:
        return base_ratio

    count = (
        db.query(PostPerformance)
        .filter(
            PostPerformance.brand == brand_id,
            PostPerformance.performance_score.isnot(None),
        )
        .count()
    )

    if count == 0:
        return 1.0  # Pure exploration for brand-new brands
    elif count < 5:
        return 0.80
    elif count < COLD_START_THRESHOLD:
        return 0.50
    else:
        return base_ratio


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
    existing.updated_at = datetime.now(timezone.utc)


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
        exp.completed_at = datetime.now(timezone.utc)

        best_avg = results[best_opt]["avg_score"]
        _log(db, user_id, "experiment_completed",
             f"Experiment completed: '{best_opt}' wins for {dimension} ({content_type}) with avg score {best_avg:.1f}",
             level="success",
             metadata={"dimension": dimension, "winner": best_opt, "results": results})


def check_experiment_timeouts(db: Session, user_id: str) -> int:
    """E6 fix: Force-complete stalled experiments after EXPERIMENT_TIMEOUT_DAYS."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=EXPERIMENT_TIMEOUT_DAYS)
    stale = (
        db.query(TobyExperiment)
        .filter(
            TobyExperiment.user_id == user_id,
            TobyExperiment.status == "active",
            TobyExperiment.started_at <= cutoff,
        )
        .all()
    )

    timed_out = 0
    for exp in stale:
        results = exp.results or {}
        best_opt = None
        best_avg = -1
        for opt in (exp.options or []):
            opt_data = results.get(opt, {})
            avg = opt_data.get("avg_score", 0)
            count = opt_data.get("count", 0)
            if avg > best_avg or (avg == best_avg and count > 0):
                best_avg = avg
                best_opt = opt

        exp.status = "completed"
        exp.winner = best_opt
        exp.completed_at = datetime.now(timezone.utc)

        _log(db, user_id, "experiment_timeout",
             f"Experiment timed out after {EXPERIMENT_TIMEOUT_DAYS} days: "
             f"'{best_opt}' declared winner for {exp.dimension} ({exp.content_type})",
             level="warning",
             metadata={
                 "dimension": exp.dimension,
                 "winner": best_opt,
                 "results": results,
                 "timeout_days": EXPERIMENT_TIMEOUT_DAYS,
             })
        timed_out += 1

    return timed_out


def create_experiment(
    db: Session,
    user_id: str,
    content_type: str,
    dimension: str,
    options: list[str],
    min_samples: int = 5,
) -> Optional[TobyExperiment]:
    """Create a new A/B experiment for a dimension if none is active.

    J4 fix: Requires at least 2 options to create a valid experiment.
    """
    # J4 guard: single-option experiments can never conclude
    if len(options) < 2:
        return None

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
        return None

    exp = TobyExperiment(
        id=str(uuid.uuid4()),
        user_id=user_id,
        content_type=content_type,
        dimension=dimension,
        options=options,
        results={},
        status="active",
        min_samples=min_samples,
        started_at=datetime.now(timezone.utc),
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


def _thompson_sample(avg_score: float, sample_count: int) -> float:
    """Phase A1: Sample from a Beta distribution for Thompson Sampling.

    Converts the avg_score (0-100) and sample_count into Beta distribution
    parameters (alpha, beta) and draws a sample. Options with fewer samples
    have wider distributions, naturally encouraging exploration.
    """
    p = max(0.01, min(0.99, avg_score / 100.0))
    alpha = max(1.0, sample_count * p)
    beta = max(1.0, sample_count * (1 - p))
    return random.betavariate(alpha, beta)


def _pick_dimension(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    dimension: str,
    options: list[str],
    is_explore: bool,
    use_thompson: bool = True,
) -> str:
    """Pick an option for a dimension using Thompson Sampling or epsilon-greedy."""
    if not options:
        return "general"

    if is_explore and not use_thompson:
        # Pure epsilon-greedy explore: random choice
        return random.choice(options)

    # Get all scores for this dimension
    all_scores = (
        db.query(TobyStrategyScore)
        .filter(
            TobyStrategyScore.user_id == user_id,
            TobyStrategyScore.content_type == content_type,
            TobyStrategyScore.dimension == dimension,
            TobyStrategyScore.sample_count > 0,
        )
        .all()
    )

    # Build map of option -> score record (only valid current options)
    score_map = {}
    for s in all_scores:
        if s.option_value in options:
            score_map[s.option_value] = s

    if not score_map:
        # Phase C: Cross-brand cold-start fallback
        if brand_id:
            cross_brand = (
                db.query(TobyStrategyScore)
                .filter(
                    TobyStrategyScore.user_id == user_id,
                    TobyStrategyScore.brand_id.is_(None),
                    TobyStrategyScore.content_type == content_type,
                    TobyStrategyScore.dimension == dimension,
                    TobyStrategyScore.sample_count > 0,
                )
                .all()
            )
            for s in cross_brand:
                if s.option_value in options:
                    score_map[s.option_value] = s

        if not score_map:
            return random.choice(options)

    if use_thompson:
        # Thompson Sampling: draw from Beta distribution for each option
        samples = {}
        for opt in options:
            if opt in score_map:
                rec = score_map[opt]
                samples[opt] = _thompson_sample(rec.avg_score, rec.sample_count)
            else:
                # Uninformed prior: uniform Beta(1,1)
                samples[opt] = random.betavariate(1.0, 1.0)
        return max(samples, key=samples.get)
    else:
        # Epsilon-greedy exploit with E2 tie-breaking by sample_count
        best_options = sorted(
            score_map.values(),
            key=lambda s: (s.avg_score, s.sample_count),
            reverse=True,
        )

        if best_options:
            top_score = best_options[0].avg_score
            tied = [s for s in best_options if abs(s.avg_score - top_score) < 0.01]
            if len(tied) > 1:
                tied.sort(key=lambda s: s.sample_count, reverse=True)
                chosen = tied[0] if tied[0].sample_count != tied[1].sample_count else random.choice(tied)
            else:
                chosen = tied[0]

            if chosen.option_value in options:
                return chosen.option_value

        return random.choice(options)


# ── Max arms per experiment ──
MAX_EXPERIMENT_ARMS = 8


def _log(db, user_id, action_type, description, level="info", metadata=None):
    db.add(TobyActivityLog(
        user_id=user_id,
        action_type=action_type,
        description=description,
        action_metadata=metadata,
        level=level,
        created_at=datetime.now(timezone.utc),
    ))


def add_option_to_experiment(
    db: Session,
    user_id: str,
    dimension: str,
    new_option: str,
    content_type: str = "reel",
) -> bool:
    """Add a new option to an active experiment for the given dimension.

    Gap 2: Called by discovery_manager when trending hashtags are found.
    Appends the new option with a prior score equal to the current
    experiment mean (fair cold-start). Skips if already present or
    experiment already has MAX_EXPERIMENT_ARMS.

    Returns True if the option was added.
    """
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
        return False

    options = list(exp.options or [])

    # Already present
    if new_option in options:
        return False

    # Guard: max arms
    if len(options) >= MAX_EXPERIMENT_ARMS:
        return False

    # Compute current experiment mean for cold-start prior
    results = dict(exp.results or {})
    all_avgs = [r.get("avg_score", 0) for r in results.values() if r.get("count", 0) > 0]
    mean_score = sum(all_avgs) / len(all_avgs) if all_avgs else 0

    # Append new option
    options.append(new_option)
    exp.options = options

    # Initialize results entry with cold-start prior
    results[new_option] = {"count": 0, "total_score": 0, "avg_score": mean_score, "scores": []}
    exp.results = results

    _log(db, user_id, "experiment_arm_added",
         f"Added '{new_option}' to {dimension} experiment ({content_type}) — "
         f"cold-start prior {mean_score:.1f}, now {len(options)} arms",
         level="info",
         metadata={"dimension": dimension, "new_option": new_option, "total_arms": len(options)})

    return True
