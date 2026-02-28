"""
Content DNA Advisor — suggests Content DNA refinements based on Toby's learning data.

Phase 3: Analyzes strategy performance data across brands and generates
actionable suggestions for Content DNA (NicheConfig) improvements.

Runs after analysis checks when sufficient new data is available.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.toby import TobyStrategyScore, TobyContentTag
from app.models.toby_cognitive import ContentDNARecommendation


# Minimum data threshold before generating suggestions
MIN_SCORED_POSTS = 10
MIN_SAMPLES_PER_STRATEGY = 3
SUGGESTION_COOLDOWN_DAYS = 7  # Don't re-suggest the same thing within 7 days


def generate_dna_suggestions(db: Session, user_id: str, brand_id: str = None) -> list[dict]:
    """Analyze strategy performance and generate Content DNA suggestions.

    Returns list of new ContentDNARecommendation objects created.
    """
    suggestions_created = []

    # Check minimum data threshold
    scored_count = (
        db.query(func.count(TobyContentTag.id))
        .filter(
            TobyContentTag.user_id == user_id,
            TobyContentTag.toby_score.isnot(None),
        )
        .scalar()
    ) or 0

    if scored_count < MIN_SCORED_POSTS:
        return []

    # Analyze each dimension for significant performance differences
    dimensions = ["personality", "topic", "hook", "title_format", "visual_style"]

    for dimension in dimensions:
        query = (
            db.query(TobyStrategyScore)
            .filter(
                TobyStrategyScore.user_id == user_id,
                TobyStrategyScore.dimension == dimension,
                TobyStrategyScore.sample_count >= MIN_SAMPLES_PER_STRATEGY,
            )
        )
        if brand_id:
            query = query.filter(TobyStrategyScore.brand_id == brand_id)

        scores = query.order_by(TobyStrategyScore.avg_score.desc()).all()

        if len(scores) < 2:
            continue

        best = scores[0]
        worst = scores[-1]

        # Only suggest if there's a meaningful difference (>15% gap)
        if best.avg_score <= 0 or worst.avg_score <= 0:
            continue
        gap_pct = ((best.avg_score - worst.avg_score) / best.avg_score) * 100

        if gap_pct < 15:
            continue

        # Check cooldown — don't re-suggest the same dimension+value
        recent = (
            db.query(ContentDNARecommendation)
            .filter(
                ContentDNARecommendation.user_id == user_id,
                ContentDNARecommendation.dimension == dimension,
                ContentDNARecommendation.suggested_value == best.option_value,
                ContentDNARecommendation.created_at >= datetime.now(timezone.utc) - __import__('datetime').timedelta(days=SUGGESTION_COOLDOWN_DAYS),
            )
            .first()
        )
        if recent:
            continue

        # Generate the suggestion
        rec = ContentDNARecommendation(
            id=str(uuid.uuid4()),
            user_id=user_id,
            brand_id=brand_id,
            recommendation_type="strategy_priority",
            dimension=dimension,
            current_value=worst.option_value,
            suggested_value=best.option_value,
            evidence={
                "best_option": best.option_value,
                "best_avg_score": round(best.avg_score, 1),
                "best_sample_count": best.sample_count,
                "worst_option": worst.option_value,
                "worst_avg_score": round(worst.avg_score, 1),
                "worst_sample_count": worst.sample_count,
                "gap_percentage": round(gap_pct, 1),
                "total_scored": scored_count,
            },
            confidence=min(1.0, gap_pct / 50),  # Higher gap = higher confidence
            status="pending",
        )
        db.add(rec)
        suggestions_created.append(rec.to_dict())

    # Check for topic imbalance — suggest focusing on high-performing topics
    topic_scores = (
        db.query(TobyStrategyScore)
        .filter(
            TobyStrategyScore.user_id == user_id,
            TobyStrategyScore.dimension == "topic",
            TobyStrategyScore.sample_count >= MIN_SAMPLES_PER_STRATEGY,
        )
        .order_by(TobyStrategyScore.avg_score.desc())
        .all()
    )

    if len(topic_scores) >= 3:
        top_topics = topic_scores[:2]
        bottom_topics = topic_scores[-2:]
        top_avg = sum(t.avg_score for t in top_topics) / len(top_topics)
        bottom_avg = sum(t.avg_score for t in bottom_topics) / len(bottom_topics)

        if top_avg > 0 and ((top_avg - bottom_avg) / top_avg) > 0.20:
            top_names = [t.option_value for t in top_topics]
            bottom_names = [t.option_value for t in bottom_topics]

            # Check cooldown
            recent_topic = (
                db.query(ContentDNARecommendation)
                .filter(
                    ContentDNARecommendation.user_id == user_id,
                    ContentDNARecommendation.recommendation_type == "topic_priority",
                    ContentDNARecommendation.created_at >= datetime.now(timezone.utc) - __import__('datetime').timedelta(days=SUGGESTION_COOLDOWN_DAYS),
                )
                .first()
            )
            if not recent_topic:
                rec = ContentDNARecommendation(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    brand_id=brand_id,
                    recommendation_type="topic_priority",
                    dimension="topic",
                    current_value=", ".join(bottom_names),
                    suggested_value=", ".join(top_names),
                    evidence={
                        "top_topics": [{"name": t.option_value, "avg_score": round(t.avg_score, 1), "samples": t.sample_count} for t in top_topics],
                        "bottom_topics": [{"name": t.option_value, "avg_score": round(t.avg_score, 1), "samples": t.sample_count} for t in bottom_topics],
                        "gap_percentage": round(((top_avg - bottom_avg) / top_avg) * 100, 1),
                    },
                    confidence=min(1.0, ((top_avg - bottom_avg) / top_avg)),
                    status="pending",
                )
                db.add(rec)
                suggestions_created.append(rec.to_dict())

    if suggestions_created:
        db.flush()

    return suggestions_created


def get_pending_suggestions(db: Session, user_id: str) -> list[dict]:
    """Get all pending Content DNA suggestions for a user."""
    suggestions = (
        db.query(ContentDNARecommendation)
        .filter(
            ContentDNARecommendation.user_id == user_id,
            ContentDNARecommendation.status == "pending",
        )
        .order_by(ContentDNARecommendation.confidence.desc())
        .all()
    )
    return [s.to_dict() for s in suggestions]


def resolve_suggestion(db: Session, user_id: str, suggestion_id: str, action: str) -> bool:
    """Accept or dismiss a Content DNA suggestion.

    action: "accepted" or "dismissed"
    """
    rec = (
        db.query(ContentDNARecommendation)
        .filter(
            ContentDNARecommendation.id == suggestion_id,
            ContentDNARecommendation.user_id == user_id,
        )
        .first()
    )
    if not rec:
        return False

    rec.status = action
    rec.resolved_at = datetime.now(timezone.utc)
    return True
