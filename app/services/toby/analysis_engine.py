"""
Toby Analysis Engine — scores content performance using composite formula.

Two-phase scoring:
  - 48h early signal: preliminary score after 48 hours
  - 7d final score:   authoritative score used for learning

Features:
  - E5 fix: Zero-metric flag to exclude unreliable scores from learning
  - C5: Content-type-aware scoring (reels vs carousels)
  - 9.2: Baseline drift detection and adaptive explore ratio
"""
import math
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.toby import TobyContentTag, TobyActivityLog
from app.models.analytics import PostPerformance


# ── Drift detection thresholds (Section 9.2) ──
DRIFT_WINDOW_DAYS = 14
DRIFT_DROP_THRESHOLD = 0.80    # 20% drop triggers exploration increase
DRIFT_SURGE_THRESHOLD = 1.20   # 20% surge triggers exploitation
DRIFT_EXPLORE_HIGH = 0.50
DRIFT_EXPLORE_LOW = 0.20
DRIFT_COOLDOWN_DAYS = 7

# ── E5: Minimum metrics to be considered reliable ──
MIN_RELIABLE_VIEWS = 5  # Below this, likely API failure or delayed


def compute_toby_score(
    metrics: dict,
    brand_stats: dict,
    content_type: str = "reel",
) -> tuple[float, bool]:
    """
    Score a post's performance relative to the brand's baseline.

    Returns (score, metrics_unreliable).
    E5: Flags zero/near-zero metrics as unreliable.
    C5: Uses content-type-aware scoring weights.

    Components (weights for reels):
      1. Raw views (20%)        — absolute performance (logarithmic)
      2. Relative views (30%)   — compared to brand average
      3. Engagement quality (40%) — saves + shares weighted heavily
      4. Follower context (10%) — mild normalization by followers

    Components (weights for posts/carousels):
      1. Reach (25%)            — absolute reach (logarithmic, since plays unavailable)
      2. Relative reach (25%)   — compared to brand average
      3. Engagement quality (40%) — saves + shares
      4. Follower context (10%) — normalization
    """
    views = metrics.get("views", 0)
    reach = metrics.get("reach", 0)
    saves = metrics.get("saves", 0)
    shares = metrics.get("shares", 0)
    brand_avg_views = brand_stats.get("avg_views", 0)
    brand_followers = brand_stats.get("followers", 0)

    # E5: Flag unreliable metrics
    metrics_unreliable = False
    primary = views if content_type == "reel" else reach
    if primary < MIN_RELIABLE_VIEWS:
        metrics_unreliable = True

    if content_type == "post":
        # C5: Carousel scoring uses reach instead of views (plays unavailable)
        raw_score = min(100, math.log10(max(reach, 1)) / math.log10(500_000) * 100)
        if brand_avg_views > 0:
            relative_score = min(100, (reach / brand_avg_views) * 25)
        else:
            relative_score = 50
        engagement_score = min(100, (saves * 2 + shares * 3) / max(reach, 1) * 10000)
        if brand_followers > 0:
            follower_context_score = min(100, (reach / brand_followers) * 10)
        else:
            follower_context_score = 50

        final = (
            raw_score * 0.25
            + relative_score * 0.25
            + engagement_score * 0.40
            + follower_context_score * 0.10
        )
    else:
        # Reel scoring (original formula)
        raw_views_score = min(100, math.log10(max(views, 1)) / math.log10(500_000) * 100)
        if brand_avg_views > 0:
            relative_ratio = views / brand_avg_views
            relative_score = min(100, relative_ratio * 25)
        else:
            relative_score = 50
        engagement_score = min(100, (saves * 2 + shares * 3) / max(views, 1) * 10000)
        if brand_followers > 0:
            views_per_follower = views / brand_followers
            follower_context_score = min(100, views_per_follower * 10)
        else:
            follower_context_score = 50

        final = (
            raw_views_score * 0.20
            + relative_score * 0.30
            + engagement_score * 0.40
            + follower_context_score * 0.10
        )

    return round(final, 1), metrics_unreliable


def get_brand_baseline(db: Session, brand: str, days: int = 14) -> dict:
    """Compute rolling baseline stats for a brand over the last N days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
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
    Score Toby-created posts that have metrics but haven't been scored yet.

    E5: Flags posts with unreliable metrics (zero/near-zero) and excludes
    them from learning engine updates.
    C5: Uses content-type-aware scoring.

    Args:
        phase: "48h" for early signal, "7d" for final score

    Returns number of posts scored.
    """
    hours = 48 if phase == "48h" else 168  # 7 days
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

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
    unreliable_count = 0
    for tag in tags:
        # Find matching post_performance by schedule_id
        perf = (
            db.query(PostPerformance)
            .filter(
                PostPerformance.schedule_id == tag.schedule_id,
                PostPerformance.published_at <= cutoff,
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

        # E5/C5: Content-type-aware scoring with reliability flag
        score, unreliable = compute_toby_score(
            metrics, baseline, content_type=tag.content_type
        )
        tag.toby_score = score
        tag.scored_at = datetime.now(timezone.utc)
        tag.score_phase = phase
        tag.metrics_unreliable = unreliable

        if unreliable:
            unreliable_count += 1

        scored += 1

    if scored > 0:
        desc = f"Scored {scored} posts ({phase} phase)"
        if unreliable_count > 0:
            desc += f" ({unreliable_count} flagged as unreliable metrics)"
        _log(db, user_id, "analysis_completed", desc, level="info",
             metadata={"phase": phase, "count": scored, "unreliable": unreliable_count})

    return scored


def detect_drift(db: Session, user_id: str) -> dict:
    """
    Section 9.2: Baseline drift detection.

    Compares the recent 14-day window to the previous 14-day window.
    Returns recommended explore_ratio adjustment.
    """
    now = datetime.now(timezone.utc)
    recent_start = now - timedelta(days=DRIFT_WINDOW_DAYS)
    old_start = recent_start - timedelta(days=DRIFT_WINDOW_DAYS)

    # Get recent avg score
    recent_avg = (
        db.query(func.avg(TobyContentTag.toby_score))
        .filter(
            TobyContentTag.user_id == user_id,
            TobyContentTag.toby_score.isnot(None),
            TobyContentTag.metrics_unreliable != True,
            TobyContentTag.scored_at >= recent_start,
        )
        .scalar()
    )

    # Get old avg score
    old_avg = (
        db.query(func.avg(TobyContentTag.toby_score))
        .filter(
            TobyContentTag.user_id == user_id,
            TobyContentTag.toby_score.isnot(None),
            TobyContentTag.metrics_unreliable != True,
            TobyContentTag.scored_at >= old_start,
            TobyContentTag.scored_at < recent_start,
        )
        .scalar()
    )

    if not recent_avg or not old_avg:
        return {"drift": "insufficient_data", "ratio_change": None}

    ratio = recent_avg / old_avg

    if ratio < DRIFT_DROP_THRESHOLD:
        _log(db, user_id, "drift_detected",
             f"Performance drop detected: recent avg {recent_avg:.1f} vs old avg {old_avg:.1f} "
             f"(ratio {ratio:.2f}). Increasing explore_ratio to {DRIFT_EXPLORE_HIGH}",
             level="warning",
             metadata={"recent_avg": float(recent_avg), "old_avg": float(old_avg), "ratio": round(ratio, 2)})
        return {"drift": "drop", "ratio_change": DRIFT_EXPLORE_HIGH}
    elif ratio > DRIFT_SURGE_THRESHOLD:
        _log(db, user_id, "drift_detected",
             f"Performance surge detected: recent avg {recent_avg:.1f} vs old avg {old_avg:.1f} "
             f"(ratio {ratio:.2f}). Reducing explore_ratio to {DRIFT_EXPLORE_LOW}",
             level="success",
             metadata={"recent_avg": float(recent_avg), "old_avg": float(old_avg), "ratio": round(ratio, 2)})
        return {"drift": "surge", "ratio_change": DRIFT_EXPLORE_LOW}
    else:
        return {"drift": "stable", "ratio_change": None}


def _log(db, user_id, action_type, description, level="info", metadata=None):
    db.add(TobyActivityLog(
        user_id=user_id,
        action_type=action_type,
        description=description,
        action_metadata=metadata,
        level=level,
        created_at=datetime.now(timezone.utc),
    ))
