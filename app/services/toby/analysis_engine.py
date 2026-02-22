"""
Toby Analysis Engine — scores content performance using composite formula.

Two-phase scoring:
  - 48h early signal: preliminary score after 48 hours
  - 7d final score:   authoritative score used for learning
"""
import math
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.toby import TobyContentTag, TobyActivityLog
from app.models.analytics import PostPerformance


def compute_toby_score(metrics: dict, brand_stats: dict) -> float:
    """
    Score a post's performance relative to the brand's baseline.

    Components (weights):
      1. Raw views (30%)        — absolute performance (logarithmic)
      2. Relative views (35%)   — compared to brand average (most important)
      3. Engagement quality (25%) — saves + shares weighted heavily
      4. Follower context (10%) — mild normalization by followers
    """
    views = metrics.get("views", 0)
    brand_avg_views = brand_stats.get("avg_views", 0)
    brand_followers = brand_stats.get("followers", 0)

    # 1. Raw views — logarithmic scale capped at 500k
    raw_views_score = min(100, math.log10(max(views, 1)) / math.log10(500_000) * 100)

    # 2. Relative views — THE most important signal
    if brand_avg_views > 0:
        relative_ratio = views / brand_avg_views
        relative_score = min(100, relative_ratio * 25)
    else:
        relative_score = 50  # No baseline yet

    # 3. Engagement quality
    saves = metrics.get("saves", 0)
    shares = metrics.get("shares", 0)
    engagement_score = min(100, (saves * 2 + shares * 3) / max(views, 1) * 10000)

    # 4. Follower context
    if brand_followers > 0:
        views_per_follower = views / brand_followers
        follower_context_score = min(100, views_per_follower * 10)
    else:
        follower_context_score = 50

    final = (
        raw_views_score * 0.30
        + relative_score * 0.35
        + engagement_score * 0.25
        + follower_context_score * 0.10
    )
    return round(final, 1)


def get_brand_baseline(db: Session, brand: str, days: int = 14) -> dict:
    """Compute rolling baseline stats for a brand over the last N days."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(PostPerformance)
        .filter(
            PostPerformance.brand == brand,
            PostPerformance.published_at >= cutoff,
            PostPerformance.views > 0,
        )
        .all()
    )
    if not rows:
        return {"avg_views": 0, "avg_engagement": 0, "post_count": 0, "followers": 0}

    total_views = sum(r.views for r in rows)
    total_engagement = sum((r.saves or 0) + (r.shares or 0) + (r.likes or 0) for r in rows)
    count = len(rows)

    # Try to get follower count from brand_analytics
    from app.models.analytics import BrandAnalytics
    ba = db.query(BrandAnalytics).filter(
        BrandAnalytics.brand == brand,
        BrandAnalytics.platform == "instagram",
    ).first()
    followers = ba.followers_count if ba else 0

    return {
        "avg_views": total_views / count,
        "avg_engagement": total_engagement / count,
        "post_count": count,
        "followers": followers,
    }


def score_pending_posts(db: Session, user_id: str, phase: str = "48h") -> int:
    """
    Score Toby-created posts that have metrics but haven't been scored yet (or need re-scoring).

    Args:
        phase: "48h" for early signal, "7d" for final score

    Returns number of posts scored.
    """
    hours = 48 if phase == "48h" else 168  # 7 days
    cutoff = datetime.utcnow() - timedelta(hours=hours)

    # Find toby content tags that need scoring for this phase
    tags = (
        db.query(TobyContentTag)
        .filter(
            TobyContentTag.user_id == user_id,
            TobyContentTag.score_phase != phase,
        )
        .all()
    )

    scored = 0
    for tag in tags:
        # Find matching post_performance by schedule_id
        perf = (
            db.query(PostPerformance)
            .filter(
                PostPerformance.schedule_id == tag.schedule_id,
                PostPerformance.published_at <= cutoff,
                PostPerformance.views > 0,
            )
            .first()
        )
        if not perf:
            continue

        # Get brand baseline
        baseline = get_brand_baseline(db, perf.brand)

        metrics = {
            "views": perf.views,
            "likes": perf.likes,
            "comments": perf.comments,
            "saves": perf.saves,
            "shares": perf.shares,
            "reach": perf.reach,
        }

        score = compute_toby_score(metrics, baseline)
        tag.toby_score = score
        tag.scored_at = datetime.utcnow()
        tag.score_phase = phase
        scored += 1

    if scored > 0:
        _log(db, user_id, "analysis_completed",
             f"Scored {scored} posts ({phase} phase)", level="info",
             metadata={"phase": phase, "count": scored})

    return scored


def _log(db, user_id, action_type, description, level="info", metadata=None):
    db.add(TobyActivityLog(
        user_id=user_id,
        action_type=action_type,
        description=description,
        action_metadata=metadata,
        level=level,
        created_at=datetime.utcnow(),
    ))
