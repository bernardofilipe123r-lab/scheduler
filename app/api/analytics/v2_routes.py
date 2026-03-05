"""
Analytics V2 routes — Overview with period comparison, Posts tab,
Answers (best time/type/frequency), Audience demographics,
and tiered aggregation for 1-year cumulative data.
"""
import logging
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case, extract, text

from app.db_connection import get_db
from app.api.auth.middleware import get_current_user
from app.models.analytics import (
    AnalyticsSnapshot,
    AnalyticsAggregate,
    AudienceDemographics,
    PostPerformance,
    BrandAnalytics,
)
from app.models.brands import Brand

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics/v2", tags=["analytics-v2"])


# ────────────────────────────────────────────────────────────
# 1.  OVERVIEW — period comparison + cumulative data
# ────────────────────────────────────────────────────────────

@router.get("/overview")
async def analytics_overview(
    brand: Optional[str] = None,
    platform: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Overview with current vs previous period comparison.
    Returns totals for current period + % change vs same-length previous period.
    Also returns daily data points for charting.
    """
    user_id = user.get("id")
    now = datetime.now(timezone.utc)
    current_start = now - timedelta(days=days)
    prev_start = current_start - timedelta(days=days)

    def _period_totals(start: datetime, end: datetime):
        """Get latest snapshot per brand/platform/day, then sum."""
        q = db.query(
            AnalyticsSnapshot.brand,
            AnalyticsSnapshot.platform,
            func.max(AnalyticsSnapshot.followers_count).label("followers"),
            func.sum(AnalyticsSnapshot.views_last_7_days).label("views"),
            func.sum(AnalyticsSnapshot.likes_last_7_days).label("likes"),
        ).filter(
            AnalyticsSnapshot.user_id == user_id,
            AnalyticsSnapshot.snapshot_at >= start,
            AnalyticsSnapshot.snapshot_at < end,
        )
        if brand:
            q = q.filter(AnalyticsSnapshot.brand == brand)
        if platform:
            q = q.filter(AnalyticsSnapshot.platform == platform)
        q = q.group_by(AnalyticsSnapshot.brand, AnalyticsSnapshot.platform)
        rows = q.all()

        totals = {"followers": 0, "views": 0, "likes": 0}
        for r in rows:
            totals["followers"] += r.followers or 0
            totals["views"] += r.views or 0
            totals["likes"] += r.likes or 0
        return totals

    current = _period_totals(current_start, now)
    previous = _period_totals(prev_start, current_start)

    def pct_change(curr, prev):
        if prev == 0:
            return 0.0  # No comparison data available
        return round((curr - prev) / prev * 100, 1)

    # Daily chart data — for followers, sum the MAX per (brand, platform)
    # per day to avoid inflating counts from multiple snapshots.
    # Use a subquery to get max followers per brand/platform/day first.
    from sqlalchemy import literal_column
    day_sub = db.query(
        func.date_trunc('day', AnalyticsSnapshot.snapshot_at).label("day"),
        AnalyticsSnapshot.brand,
        AnalyticsSnapshot.platform,
        func.max(AnalyticsSnapshot.followers_count).label("followers"),
        func.sum(AnalyticsSnapshot.views_last_7_days).label("views"),
        func.sum(AnalyticsSnapshot.likes_last_7_days).label("likes"),
    ).filter(
        AnalyticsSnapshot.user_id == user_id,
        AnalyticsSnapshot.snapshot_at >= current_start,
    )
    if brand:
        day_sub = day_sub.filter(AnalyticsSnapshot.brand == brand)
    if platform:
        day_sub = day_sub.filter(AnalyticsSnapshot.platform == platform)
    day_sub = day_sub.group_by(
        literal_column("day"), AnalyticsSnapshot.brand, AnalyticsSnapshot.platform
    ).subquery()

    day_q = db.query(
        day_sub.c.day,
        func.sum(day_sub.c.followers).label("followers"),
        func.sum(day_sub.c.views).label("views"),
        func.sum(day_sub.c.likes).label("likes"),
    ).group_by(day_sub.c.day).order_by(day_sub.c.day)

    daily = [
        {
            "date": str(r.day.date()) if r.day else None,
            "followers": r.followers or 0,
            "views": r.views or 0,
            "likes": r.likes or 0,
        }
        for r in day_q.all()
    ]

    # Per-brand breakdown
    brand_q = db.query(
        AnalyticsSnapshot.brand,
        func.max(AnalyticsSnapshot.followers_count).label("followers"),
        func.sum(AnalyticsSnapshot.views_last_7_days).label("views"),
        func.sum(AnalyticsSnapshot.likes_last_7_days).label("likes"),
    ).filter(
        AnalyticsSnapshot.user_id == user_id,
        AnalyticsSnapshot.snapshot_at >= current_start,
    )
    if platform:
        brand_q = brand_q.filter(AnalyticsSnapshot.platform == platform)
    brand_q = brand_q.group_by(AnalyticsSnapshot.brand)
    brands = [
        {"brand": r.brand, "followers": r.followers or 0, "views": r.views or 0, "likes": r.likes or 0}
        for r in brand_q.all()
    ]

    # Social channels table (per brand+platform latest data)
    channels_q = db.query(BrandAnalytics).filter(BrandAnalytics.user_id == user_id)
    if brand:
        channels_q = channels_q.filter(BrandAnalytics.brand == brand)
    if platform:
        channels_q = channels_q.filter(BrandAnalytics.platform == platform)
    channels = []
    for ba in channels_q.all():
        channels.append({
            "brand": ba.brand,
            "platform": ba.platform,
            "followers": ba.followers_count,
            "views": ba.views_last_7_days,
            "likes": ba.likes_last_7_days,
            "last_fetched_at": ba.last_fetched_at.isoformat() if ba.last_fetched_at else None,
        })

    # Override followers with BrandAnalytics (authoritative live data).
    # Snapshots can contain stale/peak values; followers is point-in-time.
    current["followers"] = sum(ch["followers"] or 0 for ch in channels)

    return {
        "period": {"days": days, "start": current_start.isoformat(), "end": now.isoformat()},
        "current": current,
        "previous": previous,
        "changes": {
            "followers_pct": pct_change(current["followers"], previous["followers"]),
            "views_pct": pct_change(current["views"], previous["views"]),
            "likes_pct": pct_change(current["likes"], previous["likes"]),
        },
        "daily": daily,
        "brands": brands,
        "channels": channels,
    }


# ────────────────────────────────────────────────────────────
# 2.  POSTS — individual post performance
# ────────────────────────────────────────────────────────────

@router.get("/posts")
async def analytics_posts(
    brand: Optional[str] = None,
    content_type: Optional[str] = None,
    sort_by: str = Query("views", pattern="^(views|likes|comments|saves|shares|reach|engagement_rate|performance_score|published_at)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Post-level performance data with sorting and filtering.
    Includes aggregate summary stats for the filtered posts.
    """
    user_id = user.get("id")
    since = datetime.now(timezone.utc) - timedelta(days=days)

    q = db.query(PostPerformance).filter(
        PostPerformance.user_id == user_id,
        PostPerformance.published_at >= since,
    )
    if brand:
        q = q.filter(PostPerformance.brand == brand)
    if content_type:
        q = q.filter(PostPerformance.content_type == content_type)

    # Totals query (before pagination)
    totals_q = db.query(
        func.count(PostPerformance.id).label("total_posts"),
        func.sum(PostPerformance.views).label("total_views"),
        func.sum(PostPerformance.likes).label("total_likes"),
        func.sum(PostPerformance.comments).label("total_comments"),
        func.sum(PostPerformance.saves).label("total_saves"),
        func.sum(PostPerformance.shares).label("total_shares"),
        func.sum(PostPerformance.reach).label("total_reach"),
        func.avg(PostPerformance.engagement_rate).label("avg_engagement_rate"),
        func.avg(PostPerformance.performance_score).label("avg_performance_score"),
    ).filter(
        PostPerformance.user_id == user_id,
        PostPerformance.published_at >= since,
    )
    if brand:
        totals_q = totals_q.filter(PostPerformance.brand == brand)
    if content_type:
        totals_q = totals_q.filter(PostPerformance.content_type == content_type)
    t = totals_q.one()

    # Sort
    sort_col = getattr(PostPerformance, sort_by, PostPerformance.views)
    q = q.order_by(desc(sort_col) if sort_dir == "desc" else sort_col)
    q = q.limit(limit).offset(offset)

    posts = [p.to_dict() for p in q.all()]

    return {
        "summary": {
            "total_posts": t.total_posts or 0,
            "total_views": t.total_views or 0,
            "total_likes": t.total_likes or 0,
            "total_comments": t.total_comments or 0,
            "total_saves": t.total_saves or 0,
            "total_shares": t.total_shares or 0,
            "total_reach": t.total_reach or 0,
            "avg_engagement_rate": round(t.avg_engagement_rate or 0, 2),
            "avg_performance_score": round(t.avg_performance_score or 0, 1),
        },
        "posts": posts,
        "pagination": {"limit": limit, "offset": offset, "total": t.total_posts or 0},
    }


# ────────────────────────────────────────────────────────────
# 3.  ANSWERS — best time, type, frequency
# ────────────────────────────────────────────────────────────

@router.get("/answers")
async def analytics_answers(
    brand: Optional[str] = None,
    days: int = Query(90, ge=30, le=365),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Computed recommendations: best time to post, best content type,
    best posting frequency — all derived from actual PostPerformance data.
    """
    user_id = user.get("id")
    since = datetime.now(timezone.utc) - timedelta(days=days)

    base = db.query(PostPerformance).filter(
        PostPerformance.user_id == user_id,
        PostPerformance.published_at >= since,
        PostPerformance.published_at.isnot(None),
    )
    if brand:
        base = base.filter(PostPerformance.brand == brand)

    total_posts = base.count()
    if total_posts < 3:
        return {
            "has_data": False,
            "message": "Need at least 3 published posts with metrics to generate recommendations.",
            "total_posts_analyzed": total_posts,
        }

    # ── Best day of week ──
    dow_q = db.query(
        PostPerformance.published_day_of_week.label("dow"),
        func.avg(PostPerformance.engagement_rate).label("avg_er"),
        func.avg(PostPerformance.views).label("avg_views"),
        func.count(PostPerformance.id).label("count"),
    ).filter(
        PostPerformance.user_id == user_id,
        PostPerformance.published_at >= since,
        PostPerformance.published_day_of_week.isnot(None),
    )
    if brand:
        dow_q = dow_q.filter(PostPerformance.brand == brand)
    dow_q = dow_q.group_by("dow").order_by(desc("avg_er"))
    dow_rows = dow_q.all()

    day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    day_short = ["S", "M", "T", "W", "T", "F", "S"]
    best_day = None
    day_data = []
    for r in dow_rows:
        d = int(r.dow) if r.dow is not None else 0
        entry = {
            "day": day_names[d] if 0 <= d <= 6 else f"Day {d}",
            "day_short": day_short[d] if 0 <= d <= 6 else "?",
            "avg_engagement_rate": round(r.avg_er or 0, 2),
            "avg_views": round(r.avg_views or 0),
            "post_count": r.count or 0,
        }
        day_data.append(entry)
        if best_day is None:
            best_day = entry

    # ── Best hour of day ──
    hour_q = db.query(
        PostPerformance.published_hour.label("hour"),
        func.avg(PostPerformance.engagement_rate).label("avg_er"),
        func.avg(PostPerformance.views).label("avg_views"),
        func.count(PostPerformance.id).label("count"),
    ).filter(
        PostPerformance.user_id == user_id,
        PostPerformance.published_at >= since,
        PostPerformance.published_hour.isnot(None),
    )
    if brand:
        hour_q = hour_q.filter(PostPerformance.brand == brand)
    hour_q = hour_q.group_by("hour").order_by(desc("avg_er"))
    hour_rows = hour_q.all()

    best_hour = None
    hour_data = []
    for r in hour_rows:
        h = int(r.hour) if r.hour is not None else 0
        period = "am" if h < 12 else "pm"
        display_hour = h if h <= 12 else h - 12
        if display_hour == 0:
            display_hour = 12
        entry = {
            "hour": h,
            "display": f"{display_hour}:00{period}",
            "avg_engagement_rate": round(r.avg_er or 0, 2),
            "avg_views": round(r.avg_views or 0),
            "post_count": r.count or 0,
        }
        hour_data.append(entry)
        if best_hour is None:
            best_hour = entry

    # ── Best content type ──
    type_q = db.query(
        PostPerformance.content_type.label("ctype"),
        func.avg(PostPerformance.engagement_rate).label("avg_er"),
        func.avg(PostPerformance.views).label("avg_views"),
        func.count(PostPerformance.id).label("count"),
    ).filter(
        PostPerformance.user_id == user_id,
        PostPerformance.published_at >= since,
    )
    if brand:
        type_q = type_q.filter(PostPerformance.brand == brand)
    type_q = type_q.group_by("ctype").order_by(desc("avg_er"))
    type_rows = type_q.all()

    best_type = None
    type_data = []
    for r in type_rows:
        entry = {
            "content_type": r.ctype or "unknown",
            "avg_engagement_rate": round(r.avg_er or 0, 2),
            "avg_views": round(r.avg_views or 0),
            "post_count": r.count or 0,
        }
        type_data.append(entry)
        if best_type is None:
            best_type = entry

    # ── Best topic bucket ──
    topic_q = db.query(
        PostPerformance.topic_bucket.label("topic"),
        func.avg(PostPerformance.engagement_rate).label("avg_er"),
        func.avg(PostPerformance.views).label("avg_views"),
        func.count(PostPerformance.id).label("count"),
    ).filter(
        PostPerformance.user_id == user_id,
        PostPerformance.published_at >= since,
        PostPerformance.topic_bucket.isnot(None),
    )
    if brand:
        topic_q = topic_q.filter(PostPerformance.brand == brand)
    topic_q = topic_q.group_by("topic").order_by(desc("avg_er"))
    topic_rows = topic_q.all()

    topic_data = []
    for r in topic_rows:
        topic_data.append({
            "topic": r.topic or "general",
            "avg_engagement_rate": round(r.avg_er or 0, 2),
            "avg_views": round(r.avg_views or 0),
            "post_count": r.count or 0,
        })

    # ── Best posting frequency ──
    # Group by date, count posts, then avg engagement per count-bucket
    freq_sub = db.query(
        func.date_trunc('day', PostPerformance.published_at).label("day"),
        func.count(PostPerformance.id).label("posts_per_day"),
        func.avg(PostPerformance.engagement_rate).label("avg_er"),
    ).filter(
        PostPerformance.user_id == user_id,
        PostPerformance.published_at >= since,
    )
    if brand:
        freq_sub = freq_sub.filter(PostPerformance.brand == brand)
    freq_sub = freq_sub.group_by("day").subquery()

    freq_q = db.query(
        freq_sub.c.posts_per_day,
        func.avg(freq_sub.c.avg_er).label("avg_er"),
        func.count().label("day_count"),
    ).group_by(freq_sub.c.posts_per_day).order_by(desc("avg_er"))
    freq_rows = freq_q.all()

    best_frequency = None
    freq_data = []
    for r in freq_rows:
        ppd = r.posts_per_day or 1
        entry = {
            "posts_per_day": ppd,
            "label": f"{ppd} post{'s' if ppd != 1 else ''} a day",
            "avg_engagement_rate": round(r.avg_er or 0, 2),
            "day_count": r.day_count or 0,
        }
        freq_data.append(entry)
        if best_frequency is None:
            best_frequency = entry

    return {
        "has_data": True,
        "total_posts_analyzed": total_posts,
        "best_time": {
            "day": best_day,
            "hour": best_hour,
            "summary": f"{best_hour['display'] if best_hour else '?'} on {best_day['day'] + 's' if best_day else '?'}",
        },
        "best_type": best_type,
        "best_frequency": best_frequency,
        "by_day": day_data,
        "by_hour": hour_data,
        "by_type": type_data,
        "by_topic": topic_data,
        "by_frequency": freq_data,
    }


# ────────────────────────────────────────────────────────────
# 4.  AUDIENCE — demographics
# ────────────────────────────────────────────────────────────

@router.get("/audience")
async def analytics_audience(
    brand: Optional[str] = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Audience demographics data.  Returns stored demographic data
    per brand, or empty if not yet fetched.
    """
    user_id = user.get("id")
    q = db.query(AudienceDemographics).filter(AudienceDemographics.user_id == user_id)
    if brand:
        q = q.filter(AudienceDemographics.brand == brand)
    rows = q.all()

    return {
        "brands": [r.to_dict() for r in rows],
        "has_data": len(rows) > 0,
    }


@router.post("/audience/refresh")
async def refresh_audience(
    brand: Optional[str] = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Fetch fresh audience demographics from Instagram Business API.
    Requires IG Business account with >=100 followers.
    """
    user_id = user.get("id")
    brands_q = db.query(Brand).filter(
        Brand.user_id == user_id,
        Brand.active == True,
        Brand.instagram_business_account_id.isnot(None),
    )
    if brand:
        brands_q = brands_q.filter(Brand.id == brand)

    updated = []
    errors = []

    for b in brands_q.all():
        try:
            token = b.meta_access_token or b.instagram_access_token
            ig_id = b.instagram_business_account_id
            if not token or not ig_id:
                continue

            import requests as http_requests
            url = f"https://graph.instagram.com/v21.0/{ig_id}/insights"
            base_params = {
                "metric": "follower_demographics",
                "period": "lifetime",
                "metric_type": "total_value",
                "access_token": token,
            }

            gender_age = {}
            top_cities = {}
            top_countries = {}
            had_error = False

            # Meta Graph API v18+ requires explicit breakdown param
            breakdown_targets = {
                "age": gender_age,
                "gender": gender_age,
                "city": top_cities,
                "country": top_countries,
            }

            for breakdown_type, target_dict in breakdown_targets.items():
                params = {**base_params, "breakdown": breakdown_type}
                resp = http_requests.get(url, params=params, timeout=15)
                if resp.status_code != 200:
                    try:
                        err_body = resp.json().get("error", {}).get("message", resp.text[:200])
                    except Exception:
                        err_body = resp.text[:200]
                    logger.warning(f"Audience {breakdown_type} fetch for {b.id}: {resp.status_code} - {err_body}")
                    # age/gender are critical — skip brand entirely if they fail
                    if breakdown_type in ("age", "gender"):
                        errors.append(f"{b.id}: API error {resp.status_code} ({err_body})")
                        had_error = True
                        break
                    continue

                data = resp.json().get("data", [])
                for metric in data:
                    breakdowns = metric.get("total_value", {}).get("breakdowns", [])
                    if not breakdowns:
                        continue
                    for result in breakdowns[0].get("results", []):
                        dims = result.get("dimension_values", [])
                        val = result.get("value", 0)
                        if not dims:
                            continue
                        if breakdown_type in ("age", "gender"):
                            # Store as "age.25-34" or "gender.M"
                            target_dict[f"{breakdown_type}.{dims[0]}"] = val
                        else:
                            target_dict[dims[0]] = val

            if had_error:
                continue

            # Compute summary
            total_audience = sum(v for k, v in gender_age.items() if k.startswith("age."))

            # Top gender
            gender_totals = {}
            for k, v in gender_age.items():
                if k.startswith("gender."):
                    g = k.split(".")[1]
                    gender_totals[g] = gender_totals.get(g, 0) + v
            gender_map = {"M": "Male", "F": "Female", "U": "Undisclosed"}
            top_g = max(gender_totals, key=gender_totals.get) if gender_totals else None
            top_gender = gender_map.get(top_g, top_g)

            # Top age range
            age_totals = {}
            for k, v in gender_age.items():
                if k.startswith("age."):
                    age = k.split(".")[1]
                    age_totals[age] = age_totals.get(age, 0) + v
            top_age = max(age_totals, key=age_totals.get) if age_totals else None

            # Top city
            top_city_name = max(top_cities, key=top_cities.get) if top_cities else None

            # Upsert
            existing = db.query(AudienceDemographics).filter(
                AudienceDemographics.user_id == user_id,
                AudienceDemographics.brand == b.id,
                AudienceDemographics.platform == "instagram",
            ).first()

            if existing:
                existing.gender_age = gender_age
                existing.top_cities = top_cities
                existing.top_countries = top_countries
                existing.top_gender = top_gender
                existing.top_age_range = top_age
                existing.top_city = top_city_name
                existing.total_audience = total_audience
                existing.fetched_at = datetime.now(timezone.utc)
            else:
                db.add(AudienceDemographics(
                    user_id=user_id,
                    brand=b.id,
                    platform="instagram",
                    gender_age=gender_age,
                    top_cities=top_cities,
                    top_countries=top_countries,
                    top_gender=top_gender,
                    top_age_range=top_age,
                    top_city=top_city_name,
                    total_audience=total_audience,
                    fetched_at=datetime.now(timezone.utc),
                ))
            db.commit()
            updated.append(b.id)
        except Exception as e:
            logger.error(f"Audience fetch error for {b.id}: {e}")
            errors.append(f"{b.id}: {str(e)[:100]}")
            db.rollback()

    return {"updated": updated, "errors": errors}


# ────────────────────────────────────────────────────────────
# 5.  CUMULATIVE — long-range (weekly/monthly aggregates)
# ────────────────────────────────────────────────────────────

@router.get("/cumulative")
async def analytics_cumulative(
    brand: Optional[str] = None,
    platform: Optional[str] = None,
    months: int = Query(12, ge=1, le=24),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Return cumulative growth data over months, using daily snapshots
    for recent data and aggregated data for older periods.
    Merges both sources into a unified timeline.
    """
    user_id = user.get("id")
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=months * 30)

    # Daily snapshots (recent 90 days)
    snap_q = db.query(
        func.date_trunc('day', AnalyticsSnapshot.snapshot_at).label("day"),
        func.max(AnalyticsSnapshot.followers_count).label("followers"),
        func.sum(AnalyticsSnapshot.views_last_7_days).label("views"),
        func.sum(AnalyticsSnapshot.likes_last_7_days).label("likes"),
    ).filter(
        AnalyticsSnapshot.user_id == user_id,
        AnalyticsSnapshot.snapshot_at >= since,
    )
    if brand:
        snap_q = snap_q.filter(AnalyticsSnapshot.brand == brand)
    if platform:
        snap_q = snap_q.filter(AnalyticsSnapshot.platform == platform)
    snap_q = snap_q.group_by("day").order_by("day")

    # Aggregated data (weekly/monthly for older periods)
    agg_q = db.query(AnalyticsAggregate).filter(
        AnalyticsAggregate.user_id == user_id,
        AnalyticsAggregate.period_start >= since.date(),
    )
    if brand:
        agg_q = agg_q.filter(AnalyticsAggregate.brand == brand)
    if platform:
        agg_q = agg_q.filter(AnalyticsAggregate.platform == platform)
    agg_q = agg_q.order_by(AnalyticsAggregate.period_start)

    # Build unified timeline
    timeline = []

    # Add aggregate data points
    for a in agg_q.all():
        timeline.append({
            "date": str(a.period_start),
            "period": a.period_type,
            "followers": a.max_followers,
            "views": a.total_views,
            "likes": a.total_likes,
        })

    # Add daily snapshot data
    for r in snap_q.all():
        d = str(r.day.date()) if r.day else None
        # Skip if already covered by aggregate
        if d and not any(t["date"] == d for t in timeline):
            timeline.append({
                "date": d,
                "period": "daily",
                "followers": r.followers or 0,
                "views": r.views or 0,
                "likes": r.likes or 0,
            })

    timeline.sort(key=lambda x: x["date"])

    return {
        "months": months,
        "data_points": len(timeline),
        "timeline": timeline,
    }


# ────────────────────────────────────────────────────────────
# 6.  AGGREGATE JOB — compress old daily snapshots
# ────────────────────────────────────────────────────────────

@router.post("/aggregate")
async def run_aggregation(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Compress daily snapshots older than 90 days into weekly aggregates,
    and weekly aggregates older than 1 year into monthly.
    Deletes the compressed daily rows to save space.
    """
    user_id = user.get("id")
    now = datetime.now(timezone.utc)
    cutoff_weekly = (now - timedelta(days=90)).date()
    cutoff_monthly = (now - timedelta(days=365)).date()

    created_weekly = 0
    created_monthly = 0
    deleted_daily = 0

    # ── Compress daily → weekly (older than 90 days) ──
    old_snaps = db.query(AnalyticsSnapshot).filter(
        AnalyticsSnapshot.user_id == user_id,
        func.date(AnalyticsSnapshot.snapshot_at) < cutoff_weekly,
    ).all()

    # Group by (brand, platform, iso_week)
    weekly_groups = {}
    for s in old_snaps:
        d = s.snapshot_at.date() if hasattr(s.snapshot_at, 'date') else s.snapshot_at
        iso = d.isocalendar()
        key = (s.brand, s.platform, iso[0], iso[1])
        weekly_groups.setdefault(key, []).append(s)

    for (brand_id, plat, year, week), snaps in weekly_groups.items():
        from datetime import date
        # Monday of that ISO week
        try:
            week_start = date.fromisocalendar(year, week, 1)
            week_end = date.fromisocalendar(year, week, 7)
        except (ValueError, AttributeError):
            continue

        # Check if aggregate already exists
        existing = db.query(AnalyticsAggregate).filter(
            AnalyticsAggregate.user_id == user_id,
            AnalyticsAggregate.brand == brand_id,
            AnalyticsAggregate.platform == plat,
            AnalyticsAggregate.period_type == "weekly",
            AnalyticsAggregate.period_start == week_start,
        ).first()
        if existing:
            # Already compressed — just delete the raw snapshots
            for s in snaps:
                db.delete(s)
                deleted_daily += 1
            continue

        followers = [s.followers_count for s in snaps]
        views = [s.views_last_7_days for s in snaps]
        likes = [s.likes_last_7_days for s in snaps]

        db.add(AnalyticsAggregate(
            user_id=user_id,
            brand=brand_id,
            platform=plat,
            period_type="weekly",
            period_start=week_start,
            period_end=week_end,
            avg_followers=round(sum(followers) / len(followers)),
            min_followers=min(followers),
            max_followers=max(followers),
            avg_views=round(sum(views) / len(views)),
            total_views=sum(views),
            avg_likes=round(sum(likes) / len(likes)),
            total_likes=sum(likes),
            snapshot_count=len(snaps),
        ))
        created_weekly += 1

        for s in snaps:
            db.delete(s)
            deleted_daily += 1

    # ── Compress weekly → monthly (older than 1 year) ──
    old_weekly = db.query(AnalyticsAggregate).filter(
        AnalyticsAggregate.user_id == user_id,
        AnalyticsAggregate.period_type == "weekly",
        AnalyticsAggregate.period_start < cutoff_monthly,
    ).all()

    monthly_groups = {}
    for a in old_weekly:
        key = (a.brand, a.platform, a.period_start.year, a.period_start.month)
        monthly_groups.setdefault(key, []).append(a)

    for (brand_id, plat, year, month), aggs in monthly_groups.items():
        from datetime import date
        import calendar
        month_start = date(year, month, 1)
        last_day = calendar.monthrange(year, month)[1]
        month_end = date(year, month, last_day)

        existing = db.query(AnalyticsAggregate).filter(
            AnalyticsAggregate.user_id == user_id,
            AnalyticsAggregate.brand == brand_id,
            AnalyticsAggregate.platform == plat,
            AnalyticsAggregate.period_type == "monthly",
            AnalyticsAggregate.period_start == month_start,
        ).first()
        if existing:
            for a in aggs:
                db.delete(a)
            continue

        total_snaps = sum(a.snapshot_count for a in aggs)
        db.add(AnalyticsAggregate(
            user_id=user_id,
            brand=brand_id,
            platform=plat,
            period_type="monthly",
            period_start=month_start,
            period_end=month_end,
            avg_followers=round(sum(a.avg_followers * a.snapshot_count for a in aggs) / max(total_snaps, 1)),
            min_followers=min(a.min_followers for a in aggs),
            max_followers=max(a.max_followers for a in aggs),
            avg_views=round(sum(a.avg_views * a.snapshot_count for a in aggs) / max(total_snaps, 1)),
            total_views=sum(a.total_views for a in aggs),
            avg_likes=round(sum(a.avg_likes * a.snapshot_count for a in aggs) / max(total_snaps, 1)),
            total_likes=sum(a.total_likes for a in aggs),
            snapshot_count=total_snaps,
        ))
        created_monthly += 1

        for a in aggs:
            db.delete(a)

    db.commit()

    return {
        "weekly_aggregates_created": created_weekly,
        "monthly_aggregates_created": created_monthly,
        "daily_snapshots_deleted": deleted_daily,
    }


# ────────────────────────────────────────────────────────────
# 7.  COMMENTS — fetch from IG Graph API on-demand
# ────────────────────────────────────────────────────────────

@router.get("/comments")
async def analytics_comments(
    brand: Optional[str] = None,
    platform: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Fetch recent comments from IG Graph API for the user's published posts.
    Queries the most recent posts (up to 15) and fetches their comments.
    """
    import requests as http_requests

    user_id = user.get("id")

    # Get brands with valid IG tokens
    brands_q = db.query(Brand).filter(
        Brand.user_id == user_id,
        Brand.active == True,
        Brand.instagram_business_account_id.isnot(None),
    )
    if brand:
        brands_q = brands_q.filter(Brand.id == brand)

    brand_rows = brands_q.all()
    brand_tokens = {}
    brand_names = {}
    for b in brand_rows:
        token = b.meta_access_token or b.instagram_access_token
        if token:
            brand_tokens[b.id] = token
            brand_names[b.id] = b.display_name

    if not brand_tokens:
        return {"comments": [], "total": 0, "has_more": False}

    # Get recent posts that have IG media IDs
    posts_q = db.query(PostPerformance).filter(
        PostPerformance.user_id == user_id,
        PostPerformance.ig_media_id.isnot(None),
        PostPerformance.brand.in_(list(brand_tokens.keys())),
    ).order_by(desc(PostPerformance.published_at)).limit(15)

    posts = posts_q.all()
    if not posts:
        return {"comments": [], "total": 0, "has_more": False}

    all_comments = []

    for post in posts:
        token = brand_tokens.get(post.brand)
        if not token:
            continue

        try:
            url = f"https://graph.instagram.com/v21.0/{post.ig_media_id}/comments"
            params = {
                "fields": "id,text,username,timestamp,like_count",
                "limit": "25",
                "access_token": token,
            }
            resp = http_requests.get(url, params=params, timeout=10)
            if resp.status_code != 200:
                logger.debug(f"Comments fetch failed for {post.ig_media_id}: {resp.status_code}")
                continue

            comments_data = resp.json().get("data", [])
            post_title = post.title or (post.caption[:60] + "…" if post.caption and len(post.caption) > 60 else post.caption)

            for c in comments_data:
                all_comments.append({
                    "id": c.get("id", ""),
                    "platform": "instagram",
                    "brand": post.brand,
                    "post_id": post.ig_media_id,
                    "post_title": post_title,
                    "author_name": c.get("username", "Unknown"),
                    "author_username": c.get("username"),
                    "author_avatar": None,
                    "text": c.get("text", ""),
                    "like_count": c.get("like_count", 0),
                    "reply_count": 0,
                    "created_at": c.get("timestamp", ""),
                    "permalink": None,
                })
        except Exception as e:
            logger.warning(f"Error fetching comments for post {post.ig_media_id}: {e}")
            continue

    # Sort all comments by created_at descending
    all_comments.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    # Apply limit
    has_more = len(all_comments) > limit
    all_comments = all_comments[:limit]

    return {
        "comments": all_comments,
        "total": len(all_comments),
        "has_more": has_more,
    }
