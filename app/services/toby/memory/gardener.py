"""
Memory Gardener — consolidation, pruning, and maintenance.

Runs in the weekly meta-cognitive loop (Loop 4) to keep
the memory system healthy and efficient.
"""
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session, defer
from sqlalchemy import func
from app.models.toby_cognitive import (
    TobyEpisodicMemory,
    TobySemanticMemory,
    TobyProceduralMemory,
    TobyWorldModel,
)


# Memory limits
MAX_EPISODIC_PER_BRAND = 500
MAX_SEMANTIC_PER_USER = 200
MAX_PROCEDURAL_PER_BRAND = 50


def prune_memories(
    db: Session,
    user_id: str,
    max_age_days: int = 90,
    min_retrievals: int = 2,
) -> dict:
    """Prune low-value memories across all types.

    Prunes episodic memories that are old AND rarely retrieved.
    Does NOT prune semantic or procedural memories (those are
    consolidated/deactivated, not deleted).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    pruned = {"episodic": 0, "world_model": 0}

    # Prune old episodic memories with low retrieval count
    old_episodic = (
        db.query(TobyEpisodicMemory)
        .options(defer(TobyEpisodicMemory.embedding))
        .filter(
            TobyEpisodicMemory.user_id == user_id,
            TobyEpisodicMemory.created_at < cutoff,
            TobyEpisodicMemory.retrieval_count < min_retrievals,
        )
        .limit(500)
        .all()
    )
    for mem in old_episodic:
        db.delete(mem)
        pruned["episodic"] += 1

    # Enforce hard cap on episodic memories per brand
    brands = (
        db.query(TobyEpisodicMemory.brand_id)
        .filter(TobyEpisodicMemory.user_id == user_id)
        .distinct()
        .all()
    )
    for (brand_id,) in brands:
        count = (
            db.query(func.count(TobyEpisodicMemory.id))
            .filter(
                TobyEpisodicMemory.user_id == user_id,
                TobyEpisodicMemory.brand_id == brand_id,
            )
            .scalar()
        )
        if count > MAX_EPISODIC_PER_BRAND:
            excess = count - MAX_EPISODIC_PER_BRAND
            oldest = (
                db.query(TobyEpisodicMemory)
                .options(defer(TobyEpisodicMemory.embedding))
                .filter(
                    TobyEpisodicMemory.user_id == user_id,
                    TobyEpisodicMemory.brand_id == brand_id,
                )
                .order_by(TobyEpisodicMemory.created_at.asc())
                .limit(excess)
                .all()
            )
            for mem in oldest:
                db.delete(mem)
                pruned["episodic"] += 1

    # Prune expired world model signals
    pruned["world_model"] = (
        db.query(TobyWorldModel)
        .filter(
            TobyWorldModel.user_id == user_id,
            TobyWorldModel.expires_at <= datetime.now(timezone.utc),
        )
        .delete()
    )

    return pruned


def consolidate_memories(db: Session, user_id: str) -> int:
    """Consolidate similar semantic memories by merging low-confidence duplicates.

    Returns number of memories consolidated.
    """
    memories = (
        db.query(TobySemanticMemory)
        .filter(TobySemanticMemory.user_id == user_id)
        .order_by(TobySemanticMemory.confidence.desc())
        .limit(MAX_SEMANTIC_PER_USER + 50)
        .all()
    )

    # Enforce semantic memory cap — remove lowest-confidence excess
    if len(memories) > MAX_SEMANTIC_PER_USER:
        excess = memories[MAX_SEMANTIC_PER_USER:]
        for mem in excess:
            db.delete(mem)
        return len(excess)

    return 0


def get_memory_stats(db: Session, user_id: str) -> dict:
    """Get memory system statistics for the meta-learning dashboard."""
    episodic_count = (
        db.query(func.count(TobyEpisodicMemory.id))
        .filter(TobyEpisodicMemory.user_id == user_id)
        .scalar()
    )
    semantic_count = (
        db.query(func.count(TobySemanticMemory.id))
        .filter(TobySemanticMemory.user_id == user_id)
        .scalar()
    )
    procedural_count = (
        db.query(func.count(TobyProceduralMemory.id))
        .filter(
            TobyProceduralMemory.user_id == user_id,
            TobyProceduralMemory.is_active == True,
        )
        .scalar()
    )
    world_model_count = (
        db.query(func.count(TobyWorldModel.id))
        .filter(TobyWorldModel.user_id == user_id)
        .scalar()
    )

    avg_semantic_confidence = (
        db.query(func.avg(TobySemanticMemory.confidence))
        .filter(TobySemanticMemory.user_id == user_id)
        .scalar()
    )

    return {
        "episodic_count": episodic_count or 0,
        "semantic_count": semantic_count or 0,
        "procedural_active_count": procedural_count or 0,
        "world_model_count": world_model_count or 0,
        "avg_semantic_confidence": round(float(avg_semantic_confidence or 0), 2),
        "limits": {
            "episodic_per_brand": MAX_EPISODIC_PER_BRAND,
            "semantic_per_user": MAX_SEMANTIC_PER_USER,
            "procedural_per_brand": MAX_PROCEDURAL_PER_BRAND,
        },
    }
