"""
World Model — environmental state signals.

Stores trends, competitor signals, platform health, and temporal patterns
that provide Toby with situational awareness.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session, defer
from app.models.toby_cognitive import TobyWorldModel
from app.services.toby.memory.embeddings import generate_embedding


def store_world_signal(
    db: Session,
    user_id: str,
    signal_type: str,
    signal_data: dict,
    interpretation: str = None,
    relevance_score: float = 0.5,
    expires_in_days: int = 7,
    brand_id: str = None,
) -> TobyWorldModel:
    """Store a world model signal (trend, competitor, platform, audience)."""
    embedding = generate_embedding(interpretation or str(signal_data)[:2000])

    signal = TobyWorldModel(
        id=str(uuid.uuid4()),
        user_id=user_id,
        brand_id=brand_id,
        signal_type=signal_type,
        signal_data=signal_data,
        interpretation=interpretation,
        relevance_score=relevance_score,
        expires_at=datetime.now(timezone.utc) + timedelta(days=expires_in_days),
        embedding=embedding,
        created_at=datetime.now(timezone.utc),
    )
    db.add(signal)
    return signal


def get_active_signals(
    db: Session,
    user_id: str,
    signal_type: str = None,
    brand_id: str = None,
    limit: int = 20,
) -> list[TobyWorldModel]:
    """Get active (non-expired) world model signals."""
    now = datetime.now(timezone.utc)
    q = db.query(TobyWorldModel).options(defer(TobyWorldModel.embedding)).filter(
        TobyWorldModel.user_id == user_id,
        (TobyWorldModel.expires_at > now) | (TobyWorldModel.expires_at.is_(None)),
    )
    if signal_type:
        q = q.filter(TobyWorldModel.signal_type == signal_type)
    if brand_id:
        q = q.filter(
            (TobyWorldModel.brand_id == brand_id) | (TobyWorldModel.brand_id.is_(None))
        )
    return q.order_by(TobyWorldModel.relevance_score.desc()).limit(limit).all()


def get_trending_topics(db: Session, user_id: str, limit: int = 10) -> list[dict]:
    """Get current trending topics from the world model."""
    signals = get_active_signals(db, user_id, signal_type="trend", limit=limit)
    return [
        {
            "topic": s.signal_data.get("topic", ""),
            "relevance": s.relevance_score,
            "interpretation": s.interpretation,
        }
        for s in signals
    ]


def get_competitor_signals(db: Session, user_id: str, days: int = 7, limit: int = 10) -> list[dict]:
    """Get recent competitor intelligence signals."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    signals = (
        db.query(TobyWorldModel)
        .filter(
            TobyWorldModel.user_id == user_id,
            TobyWorldModel.signal_type == "competitor",
            TobyWorldModel.created_at >= cutoff,
        )
        .order_by(TobyWorldModel.relevance_score.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "data": s.signal_data,
            "interpretation": s.interpretation,
            "relevance": s.relevance_score,
        }
        for s in signals
    ]


def cleanup_expired_signals(db: Session, user_id: str) -> int:
    """Remove expired world model signals."""
    now = datetime.now(timezone.utc)
    deleted = (
        db.query(TobyWorldModel)
        .filter(
            TobyWorldModel.user_id == user_id,
            TobyWorldModel.expires_at <= now,
        )
        .delete()
    )
    return deleted
