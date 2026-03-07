"""
Analytics API routes for brand metrics.

Provides endpoints for:
- Getting cached analytics data for all brands
- Refreshing analytics data (runs in background)
- Checking refresh status (in-progress tracking)
- Getting rate limit status
"""
import threading
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.services.analytics.analytics_service import AnalyticsService
from app.api.auth.middleware import get_current_user


# Create router for analytics endpoints
router = APIRouter(prefix="/analytics", tags=["analytics"])


class PlatformMetrics(BaseModel):
    """Metrics for a single platform."""
    platform: str
    followers_count: int
    views_last_7_days: int
    likes_last_7_days: int
    last_fetched_at: Optional[str] = None
    extra_metrics: Optional[Dict[str, Any]] = None


class BrandMetrics(BaseModel):
    """Metrics for a brand across all platforms."""
    brand: str
    display_name: str
    color: str
    platforms: Dict[str, PlatformMetrics]
    totals: Dict[str, int]  # Aggregated totals across platforms


class RateLimitInfo(BaseModel):
    """Rate limit information."""
    remaining: int
    max_per_day: int
    next_available_at: Optional[str] = None
    can_refresh: bool


class AnalyticsResponse(BaseModel):
    """Response for analytics data."""
    brands: List[BrandMetrics]
    rate_limit: RateLimitInfo
    last_refresh: Optional[str] = None
    needs_refresh: bool = False  # True if data is stale (>6 hours old)


class RefreshResponse(BaseModel):
    """Response for refresh action."""
    success: bool
    message: str
    updated_count: Optional[int] = None
    errors: Optional[List[str]] = None
    rate_limit: RateLimitInfo
    analytics: Optional[List[BrandMetrics]] = None


class RefreshStatusResponse(BaseModel):
    """Response for refresh status check."""
    is_refreshing: bool
    started_at: Optional[str] = None
    last_refresh: Optional[str] = None


def _get_brand_display_info() -> dict:
    """Build brand display info dynamically from DB."""
    try:
        from app.services.brands.resolver import brand_resolver
        brands = brand_resolver.get_all_brands()
        info = {}
        for b in brands:
            color = b.colors.get("primary", "#888888") if b.colors else "#888888"
            display = b.display_name or b.id
            info[b.id] = {"display_name": display, "color": color}
        return info
    except Exception:
        return {}


def format_analytics_response(analytics_list: List[Dict], db: Session) -> List[BrandMetrics]:
    """Format raw analytics data into structured response."""
    # Group by brand
    brands_data = {}
    for a in analytics_list:
        brand = a["brand"]
        if brand not in brands_data:
            brand_display_info = _get_brand_display_info()
            brand_info = brand_display_info.get(brand, {
                "display_name": brand,
                "color": "#888888"
            })
            brands_data[brand] = {
                "brand": brand,
                "display_name": brand_info["display_name"],
                "color": brand_info["color"],
                "platforms": {},
                "totals": {
                    "followers": 0,
                    "views_7d": 0,
                    "likes_7d": 0
                }
            }
        
        platform = a["platform"]
        brands_data[brand]["platforms"][platform] = PlatformMetrics(
            platform=platform,
            followers_count=a.get("followers_count", 0),
            views_last_7_days=a.get("views_last_7_days", 0),
            likes_last_7_days=a.get("likes_last_7_days", 0),
            last_fetched_at=a.get("last_fetched_at"),
            extra_metrics=a.get("extra_metrics")
        )
        
        # Add to totals
        brands_data[brand]["totals"]["followers"] += a.get("followers_count", 0)
        brands_data[brand]["totals"]["views_7d"] += a.get("views_last_7_days", 0)
        brands_data[brand]["totals"]["likes_7d"] += a.get("likes_last_7_days", 0)
    
    return [BrandMetrics(**data) for data in brands_data.values()]


@router.get("", response_model=AnalyticsResponse)
async def get_analytics(response: Response, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """
    Get cached analytics data for all brands.
    
    Returns followers, views (last 7 days), and likes for each brand
    across Instagram, Facebook, and YouTube.
    
    Data is cached and only refreshed when the user clicks refresh.
    """
    response.headers["Cache-Control"] = "private, max-age=120"
    service = AnalyticsService(db)
    user_id = user.get("id")
    
    # Get cached analytics
    analytics = service.get_all_analytics(user_id=user_id)
    
    # Check if data is stale (needs auto-refresh)
    needs_refresh = service.needs_auto_refresh(user_id=user_id)
    
    # Find last refresh time
    from app.models import AnalyticsRefreshLog
    from sqlalchemy import desc
    
    query = db.query(AnalyticsRefreshLog)
    if user_id:
        query = query.filter(AnalyticsRefreshLog.user_id == user_id)
    last_log = query.order_by(
        desc(AnalyticsRefreshLog.refreshed_at)
    ).first()
    
    last_refresh = last_log.refreshed_at.isoformat() if last_log else None
    
    return AnalyticsResponse(
        brands=format_analytics_response(analytics, db),
        rate_limit=RateLimitInfo(
            remaining=9999,  # No limits
            max_per_day=9999,
            next_available_at=None,
            can_refresh=True
        ),
        last_refresh=last_refresh,
        needs_refresh=needs_refresh
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_analytics(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """
    Refresh analytics data for all brands in the background.
    
    Kicks off a background refresh and returns immediately.
    Use GET /api/analytics/refresh-status to poll for completion.
    
    This fetches fresh data from:
    - Instagram Business API (followers, reach, likes)
    - Facebook Page API (followers, impressions, likes)
    - YouTube Data API (subscribers, views, likes)
    """
    user_id = user.get("id")
    
    # Check if already refreshing
    if AnalyticsService.is_refresh_in_progress(user_id):
        return RefreshResponse(
            success=True,
            message="Analytics refresh is already in progress.",
            rate_limit=RateLimitInfo(
                remaining=9999,
                max_per_day=9999,
                next_available_at=None,
                can_refresh=False
            )
        )
    
    # Mark as started
    AnalyticsService.mark_refresh_started(user_id)
    
    def _do_refresh(uid: str):
        """Run analytics refresh in background thread."""
        from app.db_connection import SessionLocal
        bg_db = SessionLocal()
        try:
            service = AnalyticsService(bg_db)
            service.refresh_all_analytics(user_id=uid)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Background refresh failed for user {uid}: {e}")
        finally:
            bg_db.close()
            AnalyticsService.mark_refresh_finished(uid)
    
    # Start background thread
    t = threading.Thread(target=_do_refresh, args=(user_id,), daemon=True)
    t.start()
    
    return RefreshResponse(
        success=True,
        message="Analytics refresh started in background.",
        rate_limit=RateLimitInfo(
            remaining=9999,
            max_per_day=9999,
            next_available_at=None,
            can_refresh=False
        )
    )


@router.get("/refresh-status", response_model=RefreshStatusResponse)
async def get_refresh_status(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """
    Check if an analytics refresh is currently in progress for this user.
    The frontend polls this endpoint to track background refresh state.
    """
    user_id = user.get("id")
    is_refreshing = AnalyticsService.is_refresh_in_progress(user_id)
    started_at = AnalyticsService.get_refresh_started_at(user_id)
    
    # Get last completed refresh
    from app.models import AnalyticsRefreshLog
    from sqlalchemy import desc
    
    query = db.query(AnalyticsRefreshLog)
    if user_id:
        query = query.filter(AnalyticsRefreshLog.user_id == user_id)
    last_log = query.order_by(
        desc(AnalyticsRefreshLog.refreshed_at)
    ).first()
    
    return RefreshStatusResponse(
        is_refreshing=is_refreshing,
        started_at=started_at.isoformat() if started_at else None,
        last_refresh=last_log.refreshed_at.isoformat() if last_log else None,
    )


@router.get("/rate-limit", response_model=RateLimitInfo)
async def get_rate_limit_status(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """
    Get current rate limit status for analytics refresh.
    No limits applied - always returns can_refresh=True.
    """
    return RateLimitInfo(
        remaining=9999,
        max_per_day=9999,
        next_available_at=None,
        can_refresh=True
    )


@router.get("/brand/{brand}")
async def get_brand_analytics(brand: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """
    Get analytics for a specific brand.
    
    Args:
        brand: Brand name (e.g., 'healthycollege')
    """
    brand_display_info = _get_brand_display_info()
    if brand not in brand_display_info:
        raise HTTPException(status_code=404, detail=f"Brand '{brand}' not found")
    
    service = AnalyticsService(db)
    user_id = user.get("id")
    result = service.get_analytics_by_brand(brand, user_id=user_id)
    
    brand_info = brand_display_info[brand]
    
    return {
        "brand": brand,
        "display_name": brand_info["display_name"],
        "color": brand_info["color"],
        "platforms": result.get("platforms", {})
    }


class SnapshotData(BaseModel):
    """Single analytics snapshot."""
    id: int
    brand: str
    platform: str
    snapshot_at: str
    followers_count: int
    views_last_7_days: int
    likes_last_7_days: int


class SnapshotsResponse(BaseModel):
    """Response for historical snapshots."""
    snapshots: List[SnapshotData]
    brands: List[str]
    platforms: List[str]


@router.get("/snapshots", response_model=SnapshotsResponse)
async def get_snapshots(
    brand: Optional[str] = None,
    platform: Optional[str] = None,
    days: int = 30,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Get historical analytics snapshots for trend analysis.
    
    Args:
        brand: Filter by brand name (optional)
        platform: Filter by platform - instagram, facebook, youtube (optional)
        days: Number of days to look back (default 30, max 90)
    
    Returns:
        List of snapshots ordered by time, plus available brands and platforms
    """
    if brand and brand not in _get_brand_display_info():
        raise HTTPException(status_code=404, detail=f"Brand '{brand}' not found")
    
    from app.core.platforms import SUPPORTED_PLATFORMS_SET
    if platform and platform not in SUPPORTED_PLATFORMS_SET:
        raise HTTPException(status_code=400, detail=f"Invalid platform '{platform}'")
    
    days = min(max(days, 1), 90)  # Clamp to 1-90 days
    
    service = AnalyticsService(db)
    user_id = user.get("id")
    snapshots = service.get_snapshots(brand=brand, platform=platform, days=days, user_id=user_id)
    
    # Get unique brands and platforms from snapshots
    brands_set = set()
    platforms_set = set()
    for s in snapshots:
        brands_set.add(s["brand"])
        platforms_set.add(s["platform"])
    
    return SnapshotsResponse(
        snapshots=[SnapshotData(**s) for s in snapshots],
        brands=sorted(list(brands_set)),
        platforms=sorted(list(platforms_set))
    )


class BackfillResponse(BaseModel):
    """Response for historical backfill action."""
    success: bool
    snapshots_created: int
    deleted_count: Optional[int] = None
    errors: Optional[List[str]] = None
    note: Optional[str] = None


class ClearResponse(BaseModel):
    """Response for clearing analytics data."""
    success: bool
    deleted_count: int


@router.delete("/snapshots", response_model=ClearResponse)
async def clear_snapshots(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Clear all historical analytics snapshots.
    
    Use this to remove bad/approximated data before re-backfilling.
    """
    service = AnalyticsService(db)
    user_id = user.get("id")
    result = service.clear_backfilled_data(user_id=user_id)
    
    return ClearResponse(
        success=result["success"],
        deleted_count=result["deleted_count"]
    )


@router.post("/backfill", response_model=BackfillResponse)
async def backfill_historical_data(
    days: int = 28,
    clear_existing: bool = True,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Backfill historical analytics data from Instagram insights.
    
    IMPORTANT: Instagram API only provides ~28 days of historical data.
    Historical FOLLOWER counts are NOT available - only views/impressions.
    
    Args:
        days: Number of days to backfill (max 28, Instagram API limit)
        clear_existing: If True, clears existing snapshots before backfilling
    
    Returns:
        Number of snapshots created and any errors
    """
    days = min(max(days, 1), 28)  # Clamp to 1-28 days
    
    service = AnalyticsService(db)
    user_id = user.get("id")
    
    deleted_count = 0
    if clear_existing:
        clear_result = service.clear_backfilled_data(user_id=user_id)
        deleted_count = clear_result["deleted_count"]
    
    result = service.backfill_historical_data(days_back=days, user_id=user_id)
    
    return BackfillResponse(
        success=result["success"],
        snapshots_created=result["snapshots_created"],
        deleted_count=deleted_count,
        errors=result.get("errors"),
        note=result.get("note")
    )

