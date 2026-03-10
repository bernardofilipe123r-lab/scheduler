"""
Pattern Analyzer Agent — Daily deliberation loop (Loop 3).

Runs once per day. Uses DeepSeek Reasoner R1 to perform deep pattern analysis
across the last 7 days of performance data, identify strategy evolution
opportunities, and propose experiments.
"""
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from openai import OpenAI
from app.models.toby import TobyStrategyScore, TobyContentTag, TobyActivityLog
from app.services.toby.memory.semantic import store_semantic_memory, retrieve_semantic_memories
from app.services.toby.memory.episodic import get_recent_episodic


PATTERN_ANALYSIS_SYSTEM = """You are a deep pattern analysis engine for social media content strategy.
You think slowly and carefully about performance patterns across days and weeks.

Analyze the provided data and answer these questions:
1. What content strategies are CONSISTENTLY working? Why?
2. What strategies are DECLINING? What changed?
3. Are there UNTESTED combinations that might outperform current winners?
4. Are there SEASONAL or TEMPORAL patterns? (day of week, time of day)
5. What should be TESTED next? (specific hypotheses)
6. What PROCEDURAL RULES should be created or updated?

Be specific. Reference actual data points. Distinguish correlation from causation.
Provide confidence levels for each insight.

Return ONLY valid JSON:
{
    "insights": [
        {
            "insight": "...",
            "confidence": 0.0-1.0,
            "evidence": "...",
            "tags": ["..."]
        }
    ],
    "recommendations": [
        {
            "type": "boost_strategy|penalize_strategy|new_experiment|new_rule",
            "strategy": {"dimension": "...", "option": "..."},
            "magnitude": 0.0-1.0,
            "rationale": "..."
        }
    ],
    "experiment_suggestions": [
        {
            "dimension": "...",
            "options": ["a", "b"],
            "hypothesis": "...",
            "expected_effect_size": 0.0-1.0
        }
    ]
}"""


def _get_deepseek_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


def pattern_analysis_loop(
    db: Session, user_id: str, brand_id: str, content_type: str = "reel"
) -> dict:
    """Run the daily deliberation — deep pattern analysis via R1.

    Returns summary dict with insights found, recommendations made, experiments suggested.
    """
    # Gather 7-day data
    context = _build_pattern_context(db, user_id, brand_id, content_type)

    try:
        client = _get_deepseek_client()
        response = client.chat.completions.create(
            model="deepseek-reasoner",
            messages=[
                {"role": "system", "content": PATTERN_ANALYSIS_SYSTEM},
                {"role": "user", "content": context},
            ],
            max_tokens=4000,
        )

        choice = response.choices[0]
        reasoning = getattr(choice.message, "reasoning_content", "") or ""
        content = choice.message.content or ""

        analysis = _parse_analysis(content)

    except Exception as e:
        print(f"[TOBY] Pattern analysis failed: {e}", flush=True)
        return {"error": str(e), "insights": 0, "recommendations": 0}

    result = {
        "insights": 0,
        "recommendations": 0,
        "experiments_suggested": 0,
    }

    # Store insights as high-value semantic memories
    for insight_data in analysis.get("insights", []):
        store_semantic_memory(
            db=db,
            user_id=user_id,
            insight=insight_data.get("insight", ""),
            confidence=insight_data.get("confidence", 0.6),
            tags=insight_data.get("tags", ["pattern_analysis"]),
        )
        result["insights"] += 1

    # Apply recommendations
    for rec in analysis.get("recommendations", []):
        _apply_recommendation(db, user_id, brand_id, content_type, rec)
        result["recommendations"] += 1

    # Queue experiment suggestions
    for exp in analysis.get("experiment_suggestions", []):
        _queue_experiment(db, user_id, brand_id, content_type, exp)
        result["experiments_suggested"] += 1

    # Log the deliberation
    log = TobyActivityLog(
        user_id=user_id,
        action_type="daily_deliberation",
        description=f"Pattern analysis: {result['insights']} insights, {result['recommendations']} recommendations",
        metadata={**result, "reasoning_length": len(reasoning)},
        level="info",
    )
    db.add(log)
    db.commit()

    return result


def _build_pattern_context(
    db: Session, user_id: str, brand_id: str, content_type: str
) -> str:
    """Build the context for pattern analysis."""
    cutoff_7d = datetime.now(timezone.utc) - timedelta(days=7)
    cutoff_30d = datetime.now(timezone.utc) - timedelta(days=30)

    # Recent scored posts
    recent_posts = (
        db.query(TobyContentTag)
        .filter(
            TobyContentTag.user_id == user_id,
            TobyContentTag.content_type == content_type,
            TobyContentTag.created_at >= cutoff_7d,
        )
        .order_by(TobyContentTag.created_at.desc())
        .limit(20)
        .all()
    )

    posts_str = "\n".join(
        f"- [{t.created_at.strftime('%a %H:%M') if t.created_at else 'N/A'}] "
        f"{t.personality or 'N/A'} × {t.topic_bucket or 'N/A'} × {t.hook_strategy or 'N/A'} "
        f"→ score: {t.toby_score or 'pending'}"
        for t in recent_posts
    )

    # Strategy scores (30-day window)
    strategies = (
        db.query(TobyStrategyScore)
        .filter(
            TobyStrategyScore.user_id == user_id,
            TobyStrategyScore.content_type == content_type,
            TobyStrategyScore.sample_count > 0,
        )
        .order_by(TobyStrategyScore.avg_score.desc())
        .limit(15)
        .all()
    )

    strategy_str = "\n".join(
        f"- {s.dimension}/{s.option_value}: avg={s.avg_score:.1f}, n={s.sample_count}, var={s.score_variance:.1f}"
        for s in strategies
    )

    # Recent episodic memories
    episodic = get_recent_episodic(db, user_id, brand_id=brand_id, limit=10)
    episodic_str = "\n".join(
        f"- {ep.summary[:120]}" for ep in episodic
    )

    # Recent semantic insights
    semantic = retrieve_semantic_memories(db, user_id, f"{content_type} performance patterns", k=5)
    semantic_str = "\n".join(
        f"- [{m.confidence:.0%}] {m.insight[:120]}" for m in semantic
    )

    return f"""## Last 7 Days — Content Performance
{posts_str or 'No recent posts'}

## Strategy Score Leaderboard (30-day)
{strategy_str or 'No data yet'}

## Recent Memories (Episodic)
{episodic_str or 'None'}

## Existing Insights (Semantic)
{semantic_str or 'None'}

## Your Task
Analyze patterns across this data. What's working? What's not? What should we test next?"""


def _parse_analysis(content: str) -> dict:
    """Parse the R1 analysis response."""
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    try:
        return json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return {"insights": [], "recommendations": [], "experiment_suggestions": []}


def _apply_recommendation(
    db: Session, user_id: str, brand_id: str, content_type: str, rec: dict
):
    """Apply a pattern analysis recommendation to strategy scores."""
    rec_type = rec.get("type", "")
    strategy_info = rec.get("strategy", {})
    dimension = strategy_info.get("dimension")
    option = strategy_info.get("option")
    magnitude = rec.get("magnitude", 0.5)

    if not dimension or not option:
        return

    score = (
        db.query(TobyStrategyScore)
        .filter(
            TobyStrategyScore.user_id == user_id,
            TobyStrategyScore.content_type == content_type,
            TobyStrategyScore.dimension == dimension,
            TobyStrategyScore.option_value == option,
        )
        .first()
    )

    if not score:
        return

    if rec_type == "boost_strategy":
        # Nudge the average score up
        boost = magnitude * 5  # Up to +5 points
        score.avg_score = min(100, score.avg_score + boost)
    elif rec_type == "penalize_strategy":
        # Nudge the average score down
        penalty = magnitude * 5
        score.avg_score = max(0, score.avg_score - penalty)

    db.flush()


def _queue_experiment(
    db: Session, user_id: str, brand_id: str, content_type: str, exp: dict
):
    """Queue an experiment suggestion from pattern analysis."""
    from app.models.toby import TobyExperiment

    existing = (
        db.query(TobyExperiment)
        .filter(
            TobyExperiment.user_id == user_id,
            TobyExperiment.dimension == exp.get("dimension"),
            TobyExperiment.status == "active",
        )
        .first()
    )

    if existing:
        return  # Don't create duplicate experiments

    # J4 guard: single-option experiments can never conclude
    if len(exp.get("options", [])) < 2:
        return

    experiment = TobyExperiment(
        id=str(uuid.uuid4()),
        user_id=user_id,
        content_type=content_type,
        dimension=exp.get("dimension", ""),
        options=exp.get("options", []),
        results={},
        status="active",
        min_samples=5,
        hypothesis=exp.get("hypothesis", ""),
        expected_effect_size=exp.get("expected_effect_size"),
    )
    db.add(experiment)
    db.flush()
