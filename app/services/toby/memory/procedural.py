"""
Procedural Memory — concrete action rules.

'What to do': stores learned rules like 'When topic=sleep AND audience=health
→ use personality=provoc, hook=shocking_stat'.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.toby_cognitive import TobyProceduralMemory
from app.services.toby.memory.embeddings import generate_embedding


MAX_PROCEDURAL_PER_BRAND = 50


def store_procedural_rule(
    db: Session,
    user_id: str,
    rule_text: str,
    conditions: str = None,
    action: str = None,
    confidence: float = 0.5,
    brand_id: str = None,
    content_type: str = None,
    source_semantic_ids: list[str] = None,
) -> TobyProceduralMemory:
    """Store a new procedural rule."""
    embedding = generate_embedding(rule_text)

    memory = TobyProceduralMemory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        brand_id=brand_id,
        content_type=content_type,
        rule_text=rule_text,
        conditions=conditions,
        action=action,
        confidence=confidence,
        source_semantic_ids=source_semantic_ids or [],
        embedding=embedding,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(memory)
    return memory


def retrieve_procedural_rules(
    db: Session,
    user_id: str,
    query: str = None,
    content_type: str = None,
    brand_id: str = None,
    k: int = 5,
) -> list[TobyProceduralMemory]:
    """Retrieve active procedural rules, optionally by semantic relevance."""
    base_filter = [
        TobyProceduralMemory.user_id == user_id,
        TobyProceduralMemory.is_active == True,
    ]
    if content_type:
        base_filter.append(
            (TobyProceduralMemory.content_type == content_type) |
            (TobyProceduralMemory.content_type.is_(None))
        )
    if brand_id:
        base_filter.append(
            (TobyProceduralMemory.brand_id == brand_id) |
            (TobyProceduralMemory.brand_id.is_(None))
        )

    if query:
        query_embedding = generate_embedding(query)
        if query_embedding is not None:
            results = (
                db.query(TobyProceduralMemory)
                .filter(*base_filter, TobyProceduralMemory.embedding.isnot(None))
                .order_by(TobyProceduralMemory.embedding.cosine_distance(query_embedding))
                .limit(k)
                .all()
            )
            if results:
                return results

    # Fallback: return highest-confidence active rules
    return (
        db.query(TobyProceduralMemory)
        .filter(*base_filter)
        .order_by(TobyProceduralMemory.confidence.desc())
        .limit(k)
        .all()
    )


def record_rule_application(db: Session, rule_id: str, success: bool):
    """Record that a procedural rule was applied, and whether it succeeded."""
    rule = db.query(TobyProceduralMemory).filter(TobyProceduralMemory.id == rule_id).first()
    if not rule:
        return

    rule.applied_count = (rule.applied_count or 0) + 1
    if success:
        rule.success_count = (rule.success_count or 0) + 1
    else:
        rule.failure_count = (rule.failure_count or 0) + 1

    if rule.applied_count > 0:
        rule.success_rate = rule.success_count / rule.applied_count

    rule.updated_at = datetime.now(timezone.utc)


def deactivate_underperforming_rules(
    db: Session,
    user_id: str,
    min_applications: int = 5,
    max_success_rate: float = 0.4,
) -> int:
    """Deactivate procedural rules that consistently lead to poor outcomes."""
    rules = (
        db.query(TobyProceduralMemory)
        .filter(
            TobyProceduralMemory.user_id == user_id,
            TobyProceduralMemory.is_active == True,
            TobyProceduralMemory.applied_count >= min_applications,
        )
        .all()
    )

    deactivated = 0
    for rule in rules:
        if rule.success_rate is not None and rule.success_rate < max_success_rate:
            rule.is_active = False
            rule.updated_at = datetime.now(timezone.utc)
            deactivated += 1

    return deactivated
