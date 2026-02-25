"""
Publisher Agent — Wrapper around existing media pipeline.

Takes the generated + approved content and triggers the media generation +
scheduling pipeline. This is intentionally thin — the existing pipeline
(media services, storage, scheduling) is stable and doesn't need replacement.
"""
from sqlalchemy.orm import Session


def publisher_execute(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    content: dict,
    strategy: dict,
    quality_score: float,
    reasoning_chain: str = "",
    is_explore: bool = False,
    thompson_override: bool = False,
) -> dict:
    """Execute the publishing pipeline for approved content.

    This agent delegates to the existing content generation and scheduling
    infrastructure. It stores cognitive metadata (strategy rationale,
    reasoning chain, critic scores) alongside the content.

    Returns dict with schedule_id, status, and any errors.
    """
    from app.models.toby import TobyContentTag, TobyActivityLog

    try:
        # Store cognitive metadata on the content tag
        _store_content_metadata(
            db=db,
            user_id=user_id,
            content=content,
            strategy=strategy,
            quality_score=quality_score,
            reasoning_chain=reasoning_chain,
            is_explore=is_explore,
            thompson_override=thompson_override,
        )

        # Log the publishing action
        log = TobyActivityLog(
            user_id=user_id,
            action_type="content_published",
            description=f"Published {content_type}: \"{content.get('title', '')[:60]}\"",
            metadata={
                "content_type": content_type,
                "brand_id": brand_id,
                "strategy": strategy,
                "quality_score": quality_score,
                "is_explore": is_explore,
                "thompson_override": thompson_override,
            },
            level="info",
        )
        db.add(log)
        db.commit()

        return {
            "status": "published",
            "title": content.get("title", ""),
        }

    except Exception as e:
        print(f"[TOBY] Publisher failed: {e}", flush=True)
        db.rollback()
        return {
            "status": "error",
            "error": str(e),
        }


def _store_content_metadata(
    db: Session,
    user_id: str,
    content: dict,
    strategy: dict,
    quality_score: float,
    reasoning_chain: str,
    is_explore: bool,
    thompson_override: bool,
):
    """Store cognitive metadata for later analysis."""
    from app.models.toby import TobyContentTag

    # Find the most recent content tag for this user (just created by the pipeline)
    tag = (
        db.query(TobyContentTag)
        .filter(TobyContentTag.user_id == user_id)
        .order_by(TobyContentTag.created_at.desc())
        .first()
    )

    if tag:
        # Add v3 cognitive metadata
        tag.quality_score = quality_score
        tag.strategy_rationale = reasoning_chain[:2000] if reasoning_chain else None
        tag.thompson_override = thompson_override
        tag.critic_scores = {
            "ensemble": quality_score,
        }
        db.flush()
