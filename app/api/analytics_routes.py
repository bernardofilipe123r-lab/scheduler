"""
Analytics API routes for brand metrics.

Provides endpoints for:
- Getting cached analytics data for all brands
- Refreshing analytics data (rate limited to 3/hour)
- Getting rate limit status
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.services.analytics_service import AnalyticsService


logger = logging.getLogger(__name__)

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
    max_per_hour: int
    next_available_at: Optional[str] = None
    can_refresh: bool


class AnalyticsResponse(BaseModel):
    """Response for analytics data."""
    brands: List[BrandMetrics]
    rate_limit: RateLimitInfo
    last_refresh: Optional[str] = None


class RefreshResponse(BaseModel):
    """Response for refresh action."""
    success: bool
    message: str
    updated_count: Optional[int] = None
    errors: Optional[List[str]] = None
    rate_limit: RateLimitInfo
    analytics: Optional[List[BrandMetrics]] = None


# Brand display info (should match brands_routes.py)
BRAND_DISPLAY_INFO = {
    "healthycollege": {"display_name": "Healthy College", "color": "#004f00"},
    "vitalitycollege": {"display_name": "Vitality College", "color": "#028f7a"},
    "longevitycollege": {"display_name": "Longevity College", "color": "#019dc8"},
    "holisticcollege": {"display_name": "Holistic College", "color": "#f0836e"},
    "wellbeingcollege": {"display_name": "Wellbeing College", "color": "#ebbe4d"},
}


def format_analytics_response(analytics_list: List[Dict], db: Session) -> List[BrandMetrics]:
    """Format raw analytics data into structured response."""
    # Group by brand
    brands_data = {}
    for a in analytics_list:
        brand = a["brand"]
        if brand not in brands_data:
            brand_info = BRAND_DISPLAY_INFO.get(brand, {
                "display_name": brand.replace("college", " College").title(),
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
async def get_analytics(db: Session = Depends(get_db)):
    """
    Get cached analytics data for all brands.
    
    Returns followers, views (last 7 days), and likes for each brand
    across Instagram, Facebook, and YouTube.
    
    Data is cached and only refreshed when the user clicks refresh.
    """
    service = AnalyticsService(db)
    
    # Get cached analytics
    analytics = service.get_all_analytics()
    
    # Get rate limit status
    can_refresh, remaining, next_available = service.can_refresh()
    
    # Find last refresh time
    from app.models import AnalyticsRefreshLog
    from sqlalchemy import desc
    
    last_log = db.query(AnalyticsRefreshLog).order_by(
        desc(AnalyticsRefreshLog.refreshed_at)
    ).first()
    
    last_refresh = last_log.refreshed_at.isoformat() if last_log else None
    
    return AnalyticsResponse(
        brands=format_analytics_response(analytics, db),
        rate_limit=RateLimitInfo(
            remaining=remaining,
            max_per_hour=3,
            next_available_at=next_available.isoformat() if next_available else None,
            can_refresh=can_refresh
        ),
        last_refresh=last_refresh
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_analytics(db: Session = Depends(get_db)):
    """
    Refresh analytics data for all brands.
    
    Rate limited to 3 refreshes per hour to avoid excessive API calls.
    
    This fetches fresh data from:
    - Instagram Business API (followers, reach, likes)
    - Facebook Page API (followers, impressions, likes)
    - YouTube Data API (subscribers, views, likes)
    """
    service = AnalyticsService(db)
    
    # Check rate limit first
    can_refresh, remaining, next_available = service.can_refresh()
    
    if not can_refresh:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "Rate limit exceeded. Maximum 3 refreshes per hour.",
                "remaining": remaining,
                "next_available_at": next_available.isoformat() if next_available else None
            }
        )
    
    # Perform refresh
    result = service.refresh_all_analytics()
    
    # Get updated rate limit info
    _, remaining_after, next_available_after = service.can_refresh()
    
    if result["success"]:
        return RefreshResponse(
            success=True,
            message=f"Successfully refreshed analytics for {result['updated_count']} platform connections.",
            updated_count=result.get("updated_count"),
            errors=result.get("errors"),
            rate_limit=RateLimitInfo(
                remaining=remaining_after,
                max_per_hour=3,
                next_available_at=next_available_after.isoformat() if next_available_after else None,
                can_refresh=remaining_after > 0
            ),
            analytics=format_analytics_response(result.get("analytics", []), db)
        )
    else:
        return RefreshResponse(
            success=False,
            message=result.get("error", "Failed to refresh analytics"),
            errors=result.get("errors"),
            rate_limit=RateLimitInfo(
                remaining=remaining_after,
                max_per_hour=3,
                next_available_at=next_available_after.isoformat() if next_available_after else None,
                can_refresh=remaining_after > 0
            )
        )


@router.get("/rate-limit", response_model=RateLimitInfo)
async def get_rate_limit_status(db: Session = Depends(get_db)):
    """
    Get current rate limit status for analytics refresh.
    
    Returns how many refreshes are remaining and when the next
    refresh will be available.
    """
    service = AnalyticsService(db)
    can_refresh, remaining, next_available = service.can_refresh()
    
    return RateLimitInfo(
        remaining=remaining,
        max_per_hour=3,
        next_available_at=next_available.isoformat() if next_available else None,
        can_refresh=can_refresh
    )


@router.get("/brand/{brand}")
async def get_brand_analytics(brand: str, db: Session = Depends(get_db)):
    """
    Get analytics for a specific brand.
    
    Args:
        brand: Brand name (e.g., 'healthycollege')
    """
    if brand not in BRAND_DISPLAY_INFO:
        raise HTTPException(status_code=404, detail=f"Brand '{brand}' not found")
    
    service = AnalyticsService(db)
    result = service.get_analytics_by_brand(brand)
    
    brand_info = BRAND_DISPLAY_INFO[brand]
    
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
    db: Session = Depends(get_db)
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
    if brand and brand not in BRAND_DISPLAY_INFO:
        raise HTTPException(status_code=404, detail=f"Brand '{brand}' not found")
    
    if platform and platform not in ["instagram", "facebook", "youtube"]:
        raise HTTPException(status_code=400, detail=f"Invalid platform '{platform}'")
    
    days = min(max(days, 1), 90)  # Clamp to 1-90 days
    
    service = AnalyticsService(db)
    snapshots = service.get_snapshots(brand=brand, platform=platform, days=days)
    
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
