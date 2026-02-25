"""
Scout Agent — gathers environmental context from memory + world model.

Runs at the start of Loop 1 (Reactive Loop) to build the full context
that the Strategist and Creator agents will use.
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.services.toby.memory.episodic import retrieve_episodic_memories
from app.services.toby.memory.semantic import retrieve_semantic_memories, get_high_confidence_insights
from app.services.toby.memory.procedural import retrieve_procedural_rules
from app.services.toby.memory.world_model import get_trending_topics, get_competitor_signals, get_active_signals
from app.services.toby.analysis_engine import get_brand_baseline


def scout_gather_context(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
) -> dict:
    """Gather comprehensive environmental context for content generation.

    Returns a dict with:
    - performance_context: brand baselines, top strategies, recent posts
    - relevant_memories: episodic, semantic, procedural
    - world_model: trends, competitor signals, content saturation, timing
    - content_gaps: under-explored areas
    """
    now = datetime.now(timezone.utc)

    # ── Performance Context ──
    performance_context = {
        "brand_baseline": get_brand_baseline(db, brand_id),
    }

    # Get top strategies from strategy scores
    from app.models.toby import TobyStrategyScore
    top_strategies = (
        db.query(TobyStrategyScore)
        .filter(
            TobyStrategyScore.user_id == user_id,
            TobyStrategyScore.content_type == content_type,
            TobyStrategyScore.sample_count > 0,
        )
        .order_by(TobyStrategyScore.avg_score.desc())
        .limit(10)
        .all()
    )
    performance_context["strategy_scores"] = [
        {
            "dimension": s.dimension,
            "option": s.option_value,
            "avg_score": round(s.avg_score, 1),
            "samples": s.sample_count,
        }
        for s in top_strategies
    ]

    # ── Memory Retrieval (Semantic) ──
    # Build a query from current context for memory search
    topics = _get_topic_categories(db, user_id)
    memory_query = f"content for {content_type} about topics: {', '.join(topics[:5])}"

    relevant_memories = {
        "episodic": retrieve_episodic_memories(db, user_id, memory_query, k=5, brand_id=brand_id),
        "semantic": retrieve_semantic_memories(db, user_id, memory_query, k=3),
        "procedural": retrieve_procedural_rules(
            db, user_id, query=memory_query, content_type=content_type, brand_id=brand_id, k=5
        ),
        "high_confidence_insights": get_high_confidence_insights(db, user_id, limit=5),
    }

    # ── World Model ──
    world_model = {
        "trending_topics": get_trending_topics(db, user_id, limit=5),
        "competitor_signals": get_competitor_signals(db, user_id, days=7, limit=5),
        "temporal_context": {
            "day_of_week": now.strftime("%A"),
            "hour": now.hour,
            "is_weekend": now.weekday() >= 5,
        },
    }

    # ── Content Gaps (topics not covered recently) ──
    content_gaps = _identify_content_gaps(db, user_id, brand_id, content_type, topics)

    return {
        "performance_context": performance_context,
        "relevant_memories": relevant_memories,
        "world_model": world_model,
        "content_gaps": content_gaps,
    }


def _get_topic_categories(db: Session, user_id: str) -> list[str]:
    """Get topic categories from NicheConfig."""
    from app.models.niche_config import NicheConfig
    config = db.query(NicheConfig).filter(NicheConfig.user_id == user_id).first()
    if config and config.topic_categories:
        return config.topic_categories
    return ["general"]


def _identify_content_gaps(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    all_topics: list[str],
) -> list[str]:
    """Identify topics that haven't been covered recently."""
    from datetime import timedelta
    from app.models.toby import TobyContentTag

    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    recent_topics = (
        db.query(TobyContentTag.topic_bucket)
        .filter(
            TobyContentTag.user_id == user_id,
            TobyContentTag.content_type == content_type,
            TobyContentTag.created_at >= cutoff,
        )
        .distinct()
        .all()
    )
    recent_set = {t[0] for t in recent_topics if t[0]}
    gaps = [t for t in all_topics if t not in recent_set]
    return gaps or ["general"]
