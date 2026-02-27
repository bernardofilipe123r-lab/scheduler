"""
Semantic Memory — generalized insights extracted from episodes.

'What it means': stores patterns, correlations, and causal insights
that Toby has learned from repeated experiences.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session, defer
from app.models.toby_cognitive import TobySemanticMemory
from app.services.toby.memory.embeddings import generate_embedding


MAX_SEMANTIC_PER_USER = 200


def store_semantic_memory(
    db: Session,
    user_id: str,
    insight: str,
    confidence: float = 0.5,
    tags: list[str] = None,
    source_episode_ids: list[str] = None,
) -> TobySemanticMemory:
    """Store a new semantic memory (generalized insight)."""
    embedding = generate_embedding(insight)

    memory = TobySemanticMemory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        insight=insight,
        confidence=confidence,
        tags=tags or [],
        source_episode_ids=source_episode_ids or [],
        embedding=embedding,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(memory)
    return memory


def retrieve_semantic_memories(
    db: Session,
    user_id: str,
    query: str,
    k: int = 3,
) -> list[TobySemanticMemory]:
    """Retrieve the k most relevant semantic memories using cosine similarity."""
    query_embedding = generate_embedding(query)
    if query_embedding is None:
        return (
            db.query(TobySemanticMemory)
            .options(defer(TobySemanticMemory.embedding))
            .filter(TobySemanticMemory.user_id == user_id)
            .order_by(TobySemanticMemory.confidence.desc())
            .limit(k)
            .all()
        )

    results = (
        db.query(TobySemanticMemory)
        .filter(
            TobySemanticMemory.user_id == user_id,
            TobySemanticMemory.embedding.isnot(None),
        )
        .order_by(
            TobySemanticMemory.embedding.cosine_distance(query_embedding)
        )
        .limit(k)
        .all()
    )

    now = datetime.now(timezone.utc)
    for r in results:
        r.retrieval_count = (r.retrieval_count or 0) + 1
        r.last_retrieved = now

    return results


def confirm_semantic_memory(db: Session, memory_id: str):
    """Increment the confirmed count when real data supports this insight."""
    mem = db.query(TobySemanticMemory).filter(TobySemanticMemory.id == memory_id).first()
    if mem:
        mem.confirmed_count = (mem.confirmed_count or 0) + 1
        # Boost confidence (asymptotic toward 1.0)
        mem.confidence = min(0.99, mem.confidence + 0.05 * (1 - mem.confidence))
        mem.updated_at = datetime.now(timezone.utc)


def contradict_semantic_memory(db: Session, memory_id: str):
    """Increment the contradicted count when data contradicts this insight."""
    mem = db.query(TobySemanticMemory).filter(TobySemanticMemory.id == memory_id).first()
    if mem:
        mem.contradicted_count = (mem.contradicted_count or 0) + 1
        # Reduce confidence
        mem.confidence = max(0.05, mem.confidence - 0.10)
        mem.updated_at = datetime.now(timezone.utc)


def get_high_confidence_insights(
    db: Session,
    user_id: str,
    min_confidence: float = 0.7,
    limit: int = 10,
) -> list[TobySemanticMemory]:
    """Get high-confidence semantic memories for strategy reasoning."""
    return (
        db.query(TobySemanticMemory)
        .filter(
            TobySemanticMemory.user_id == user_id,
            TobySemanticMemory.confidence >= min_confidence,
        )
        .order_by(TobySemanticMemory.confidence.desc())
        .limit(limit)
        .all()
    )
