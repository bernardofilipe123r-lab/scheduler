"""
Episodic Memory — records of specific content creation events.

'What happened': stores who, what, when, how, and the outcome
for each piece of content Toby creates.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.toby_cognitive import TobyEpisodicMemory
from app.services.toby.memory.embeddings import generate_embedding


# Memory cap per brand (pruned by gardener)
MAX_EPISODIC_PER_BRAND = 500


def store_episodic_memory(
    db: Session,
    user_id: str,
    brand_id: str,
    summary: str,
    tags: list[str],
    schedule_id: str = None,
    strategy: dict = None,
    quality_score: float = None,
    content_type: str = None,
    revision_count: int = 0,
    was_experiment: bool = False,
) -> TobyEpisodicMemory:
    """Store a new episodic memory entry."""
    now = datetime.now(timezone.utc)
    embedding = generate_embedding(summary)

    memory = TobyEpisodicMemory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        brand_id=brand_id,
        content_type=content_type,
        schedule_id=schedule_id,
        strategy=strategy or {},
        quality_score=quality_score,
        summary=summary,
        key_facts=[],
        tags=tags,
        temporal_context={
            "day_of_week": now.strftime("%A"),
            "hour": now.hour,
            "is_weekend": now.weekday() >= 5,
        },
        revision_count=revision_count,
        was_experiment=was_experiment,
        embedding=embedding,
        created_at=now,
    )
    db.add(memory)
    return memory


def retrieve_episodic_memories(
    db: Session,
    user_id: str,
    query: str,
    k: int = 5,
    brand_id: str = None,
) -> list[TobyEpisodicMemory]:
    """Retrieve the k most relevant episodic memories using cosine similarity."""
    query_embedding = generate_embedding(query)
    if query_embedding is None:
        # Fallback: return most recent memories
        q = db.query(TobyEpisodicMemory).filter(
            TobyEpisodicMemory.user_id == user_id
        )
        if brand_id:
            q = q.filter(TobyEpisodicMemory.brand_id == brand_id)
        return q.order_by(TobyEpisodicMemory.created_at.desc()).limit(k).all()

    q = db.query(TobyEpisodicMemory).filter(
        TobyEpisodicMemory.user_id == user_id,
        TobyEpisodicMemory.embedding.isnot(None),
    )
    if brand_id:
        q = q.filter(TobyEpisodicMemory.brand_id == brand_id)

    results = q.order_by(
        TobyEpisodicMemory.embedding.cosine_distance(query_embedding)
    ).limit(k).all()

    # Update retrieval tracking
    now = datetime.now(timezone.utc)
    for r in results:
        r.retrieval_count = (r.retrieval_count or 0) + 1
        r.last_retrieved = now

    return results


def backfill_toby_score(
    db: Session,
    user_id: str,
    schedule_id: str,
    toby_score: float,
):
    """Backfill the Instagram toby_score on an episodic memory after metrics arrive."""
    memory = (
        db.query(TobyEpisodicMemory)
        .filter(
            TobyEpisodicMemory.user_id == user_id,
            TobyEpisodicMemory.schedule_id == schedule_id,
        )
        .first()
    )
    if memory:
        memory.toby_score = toby_score


def get_recent_episodic(
    db: Session,
    user_id: str,
    days: int = 7,
    brand_id: str = None,
    limit: int = 20,
) -> list[TobyEpisodicMemory]:
    """Get recent episodic memories for analysis."""
    cutoff = datetime.now(timezone.utc) - __import__("datetime").timedelta(days=days)
    q = db.query(TobyEpisodicMemory).filter(
        TobyEpisodicMemory.user_id == user_id,
        TobyEpisodicMemory.created_at >= cutoff,
    )
    if brand_id:
        q = q.filter(TobyEpisodicMemory.brand_id == brand_id)
    return q.order_by(TobyEpisodicMemory.created_at.desc()).limit(limit).all()
