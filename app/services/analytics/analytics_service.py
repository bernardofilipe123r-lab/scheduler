"""
Analytics service for fetching and caching brand metrics from social platforms.

Fetches followers, views (last 7 days), and likes for each brand on:
- Instagram (via Meta Graph API)
- Facebook (via Meta Graph API)  
- YouTube (via YouTube Data API)

Auto-refreshes every 12 hours via scheduler. No rate limits.
"""
import os
import logging
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import BrandAnalytics, AnalyticsRefreshLog, YouTubeChannel, AnalyticsSnapshot
from app.services.brands.resolver import brand_resolver


logger = logging.getLogger(__name__)


# Auto-refresh interval (6 hours)
AUTO_REFRESH_INTERVAL_HOURS = 6


class AnalyticsService:
    """Service for fetching and managing brand analytics."""
    
    META_API_BASE = "https://graph.facebook.com/v21.0"
    YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
    
    def __init__(self, db: Session):
        self.db = db
        
    def can_refresh(self) -> Tuple[bool, int, Optional[datetime]]:
        """
        Check if a refresh is allowed. Always returns True (no rate limits).
        
        Returns:
            Tuple of (can_refresh, remaining_refreshes, next_refresh_available_at)
        """
        # No rate limits - always allow refresh
        return True, 9999, None
    
    def needs_auto_refresh(self, user_id: str = None) -> bool:
        """
        Check if analytics data is stale and needs auto-refresh.
        Returns True if last refresh was more than AUTO_REFRESH_INTERVAL_HOURS ago.
        """
        # Get most recent analytics entry
        query = self.db.query(BrandAnalytics)
        if user_id:
            query = query.filter(BrandAnalytics.user_id == user_id)
        latest = query.order_by(
            BrandAnalytics.last_fetched_at.desc()
        ).first()
        
        if not latest or not latest.last_fetched_at:
            return True  # Never refreshed
            
        stale_threshold = datetime.now(timezone.utc) - timedelta(hours=AUTO_REFRESH_INTERVAL_HOURS)
        return latest.last_fetched_at < stale_threshold
    
    def log_refresh(self, status: str = "success", error_message: str = None, user_id: str = None):
        """Log a refresh attempt."""
        log_entry = AnalyticsRefreshLog(
            refreshed_at=datetime.now(timezone.utc),
            status=status,
            error_message=error_message,
            user_id=user_id
        )
        self.db.add(log_entry)
        self.db.commit()
    
    def get_all_analytics(self, user_id: str = None) -> List[Dict[str, Any]]:
        """Get all cached analytics data."""
        query = self.db.query(BrandAnalytics)
        if user_id:
            query = query.filter(BrandAnalytics.user_id == user_id)
        analytics = query.all()
        return [a.to_dict() for a in analytics]
    
    def get_analytics_by_brand(self, brand: str, user_id: str = None) -> Dict[str, Any]:
        """Get analytics for a specific brand across all platforms."""
        query = self.db.query(BrandAnalytics).filter(
            BrandAnalytics.brand == brand
        )
        if user_id:
            query = query.filter(BrandAnalytics.user_id == user_id)
        analytics = query.all()
        
        return {
            "brand": brand,
            "platforms": {a.platform: a.to_dict() for a in analytics}
        }
    
    def refresh_all_analytics(self, user_id: str = None) -> Dict[str, Any]:
        """
        Refresh analytics for all brands on all platforms.
        
        Rate limited to 3 refreshes per hour.
        
        Returns:
            Dict with success status, data, and rate limit info
        """
        can_refresh, remaining, next_available = self.can_refresh()
        
        if not can_refresh:
            return {
                "success": False,
                "error": "Rate limit exceeded. Maximum 3 refreshes per hour.",
                "rate_limit": {
                    "remaining": remaining,
                    "next_available_at": next_available.isoformat() if next_available else None
                }
            }
        
        errors = []
        updated_count = 0
        
        # Fetch Instagram analytics for all brands
        for brand_name in brand_resolver.get_all_brand_ids():
            config = brand_resolver.get_brand_config(brand_name)
            if not config:
                continue
            
            # Instagram
            try:
                if config.instagram_business_account_id and config.meta_access_token:
                    ig_data = self._fetch_instagram_analytics(
                        config.instagram_business_account_id,
                        config.meta_access_token
                    )
                    self._update_analytics(brand_name, "instagram", ig_data, user_id=user_id)
                    updated_count += 1
            except Exception as e:
                logger.error(f"Failed to fetch Instagram analytics for {brand_name}: {e}")
                errors.append(f"Instagram/{brand_name}: {str(e)}")
            
            # Facebook
            try:
                if config.facebook_page_id and config.meta_access_token:
                    fb_data = self._fetch_facebook_analytics(
                        config.facebook_page_id,
                        config.meta_access_token
                    )
                    self._update_analytics(brand_name, "facebook", fb_data, user_id=user_id)
                    updated_count += 1
            except Exception as e:
                logger.error(f"Failed to fetch Facebook analytics for {brand_name}: {e}")
                errors.append(f"Facebook/{brand_name}: {str(e)}")
        
        # Fetch YouTube analytics for connected channels
        query = self.db.query(YouTubeChannel).filter(
            YouTubeChannel.status == "connected"
        )
        if user_id:
            query = query.filter(YouTubeChannel.user_id == user_id)
        youtube_channels = query.all()
        
        for channel in youtube_channels:
            try:
                yt_data = self._fetch_youtube_analytics(channel)
                self._update_analytics(channel.brand, "youtube", yt_data, user_id=user_id)
                updated_count += 1
            except Exception as e:
                logger.error(f"Failed to fetch YouTube analytics for {channel.brand}: {e}")
                errors.append(f"YouTube/{channel.brand}: {str(e)}")
        
        # Log the refresh
        self.log_refresh(
            status="success" if not errors else "partial",
            error_message="; ".join(errors) if errors else None,
            user_id=user_id
        )
        
        # Get updated rate limit info
        _, remaining_after, _ = self.can_refresh()
        
        return {
            "success": True,
            "updated_count": updated_count,
            "errors": errors if errors else None,
            "rate_limit": {
                "remaining": remaining_after,
                "next_reset": None  # No rate limits
            },
            "analytics": self.get_all_analytics(user_id=user_id)
        }
    
    def _fetch_instagram_analytics(self, account_id: str, access_token: str) -> Dict[str, Any]:
        """
        Fetch Instagram analytics from Meta Graph API.
        
        Fetches:
        - followers_count: Total followers
        - views_last_7_days: Account-level impressions from insights (time_series)
        - likes_last_7_days: From recent media
        
        Uses the Instagram Graph API User Insights endpoint with date range.
        """
        # Get basic account info including followers
        account_url = f"{self.META_API_BASE}/{account_id}"
        params = {
            "fields": "followers_count,media_count,username",
            "access_token": access_token
        }
        
        response = requests.get(account_url, params=params)
        response.raise_for_status()
        account_data = response.json()
        
        followers = account_data.get("followers_count", 0)
        logger.info(f"Instagram account {account_data.get('username')}: {followers} followers")
        
        # Get account-level insights using time_series approach with date range
        views = 0
        
        # Calculate date range for last 7 days
        now = datetime.now(timezone.utc)
        since_date = now - timedelta(days=7)
        until_date = now
        
        # Unix timestamps for API
        since_ts = int(since_date.timestamp())
        until_ts = int(until_date.timestamp())
        
        try:
            # Try the time_series approach first (most accurate for views)
            insights_url = f"{self.META_API_BASE}/{account_id}/insights"
            
            # Method 1: time_series with impressions (best for views)
            insights_params = {
                "metric": "impressions",
                "metric_type": "time_series",
                "since": since_ts,
                "until": until_ts,
                "access_token": access_token
            }
            
            logger.info(f"Fetching IG insights: metric=impressions, since={since_ts}, until={until_ts}")
            insights_resp = requests.get(insights_url, params=insights_params)
            
            if insights_resp.status_code == 200:
                insights_data = insights_resp.json()
                logger.info(f"Instagram time_series response: {insights_data}")
                
                if "data" in insights_data and len(insights_data["data"]) > 0:
                    for metric in insights_data["data"]:
                        if metric.get("name") == "impressions":
                            for v in metric.get("values", []):
                                views += v.get("value", 0)
                            logger.info(f"Instagram impressions (time_series): {views}")
                            break
            else:
                logger.warning(f"IG time_series failed ({insights_resp.status_code}): {insights_resp.text}")
                
                # Method 2: Fallback to period=day approach
                fallback_params = {
                    "metric": "impressions,reach",
                    "period": "day",
                    "access_token": access_token
                }
                
                fallback_resp = requests.get(insights_url, params=fallback_params)
                logger.info(f"IG fallback period=day response: {fallback_resp.status_code}")
                
                if fallback_resp.status_code == 200:
                    fallback_data = fallback_resp.json()
                    logger.info(f"Instagram fallback data: {fallback_data}")
                    
                    for metric in fallback_data.get("data", []):
                        if metric.get("name") == "impressions":
                            values = metric.get("values", [])[-7:]
                            for v in values:
                                views += v.get("value", 0)
                            break
                else:
                    logger.error(f"IG fallback also failed: {fallback_resp.text}")
                    
                    # Method 3: Try total_value for lifetime impressions (less ideal but works)
                    total_params = {
                        "metric": "impressions",
                        "metric_type": "total_value",
                        "since": since_ts,
                        "until": until_ts,
                        "access_token": access_token
                    }
                    
                    total_resp = requests.get(insights_url, params=total_params)
                    if total_resp.status_code == 200:
                        total_data = total_resp.json()
                        logger.info(f"Instagram total_value data: {total_data}")
                        
                        for metric in total_data.get("data", []):
                            if metric.get("name") == "impressions":
                                total_value = metric.get("total_value", {})
                                views = total_value.get("value", 0)
                                break
                    else:
                        logger.error(f"IG total_value failed: {total_resp.text}")
                
        except Exception as e:
            logger.error(f"Could not fetch Instagram account insights: {e}")
        
        # If still 0, try to get views/plays from individual media items
        if views == 0:
            logger.info("Trying to get views from individual media items...")
            views = self._get_ig_views_from_media(account_id, access_token)
        
        # Get likes from recent media
        likes = 0
        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
        
        try:
            media_url = f"{self.META_API_BASE}/{account_id}/media"
            media_params = {
                "fields": "id,like_count,timestamp,media_type",
                "limit": 50,
                "access_token": access_token
            }
            media_response = requests.get(media_url, params=media_params)
            
            if media_response.status_code == 200:
                media_data = media_response.json()
                
                for post in media_data.get("data", []):
                    timestamp = post.get("timestamp")
                    if not timestamp:
                        continue
                    
                    try:
                        post_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                        if post_time >= seven_days_ago:
                            likes += post.get("like_count", 0)
                    except Exception:
                        continue
            else:
                logger.error(f"Instagram media fetch failed: {media_response.status_code}")
                                
        except Exception as e:
            logger.error(f"Could not fetch Instagram media: {e}")
        
        logger.info(f"Instagram final results: followers={followers}, views={views}, likes={likes}")
        
        return {
            "followers_count": followers,
            "views_last_7_days": views,
            "likes_last_7_days": likes,
            "extra_metrics": {
                "username": account_data.get("username"),
                "media_count": account_data.get("media_count", 0)
            }
        }
    
    def _get_ig_views_from_media(self, account_id: str, access_token: str) -> int:
        """
        Fallback method to get views by summing individual media insights.
        Gets plays/reach for reels and videos from the last 7 days.
        """
        views = 0
        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
        
        try:
            # Get recent media
            media_url = f"{self.META_API_BASE}/{account_id}/media"
            media_params = {
                "fields": "id,timestamp,media_type,media_product_type",
                "limit": 50,
                "access_token": access_token
            }
            media_response = requests.get(media_url, params=media_params)
            
            if media_response.status_code != 200:
                logger.error(f"Failed to get media list: {media_response.text}")
                return 0
            
            media_data = media_response.json()
            
            for post in media_data.get("data", []):
                timestamp = post.get("timestamp")
                if not timestamp:
                    continue
                    
                try:
                    post_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                    if post_time < seven_days_ago:
                        continue  # Skip older posts
                except Exception:
                    continue
                
                media_id = post.get("id")
                media_type = post.get("media_type", "")
                media_product_type = post.get("media_product_type", "")
                
                # Determine which metrics to fetch based on media type
                if media_type == "VIDEO" or media_product_type == "REELS":
                    # For videos/reels, try to get plays
                    try:
                        insights_url = f"{self.META_API_BASE}/{media_id}/insights"
                        
                        # Try video_views first (for regular videos)
                        insights_params = {
                            "metric": "plays",
                            "access_token": access_token
                        }
                        
                        insights_resp = requests.get(insights_url, params=insights_params)
                        
                        if insights_resp.status_code == 200:
                            insights_data = insights_resp.json()
                            for metric in insights_data.get("data", []):
                                if metric.get("name") == "plays":
                                    views += metric.get("values", [{}])[0].get("value", 0)
                                    break
                        else:
                            # Try reach as fallback
                            insights_params["metric"] = "reach"
                            insights_resp = requests.get(insights_url, params=insights_params)
                            if insights_resp.status_code == 200:
                                insights_data = insights_resp.json()
                                for metric in insights_data.get("data", []):
                                    if metric.get("name") == "reach":
                                        views += metric.get("values", [{}])[0].get("value", 0)
                                        break
                                        
                    except Exception as e:
                        logger.debug(f"Could not get insights for media {media_id}: {e}")
                        
                else:
                    # For images, try reach
                    try:
                        insights_url = f"{self.META_API_BASE}/{media_id}/insights"
                        insights_params = {
                            "metric": "reach",
                            "access_token": access_token
                        }
                        
                        insights_resp = requests.get(insights_url, params=insights_params)
                        if insights_resp.status_code == 200:
                            insights_data = insights_resp.json()
                            for metric in insights_data.get("data", []):
                                if metric.get("name") == "reach":
                                    views += metric.get("values", [{}])[0].get("value", 0)
                                    break
                    except Exception as e:
                        logger.debug(f"Could not get insights for media {media_id}: {e}")
            
            logger.info(f"Instagram views from media items: {views}")
            
        except Exception as e:
            logger.error(f"Failed to get IG views from media: {e}")
        
        return views
    
    def _fetch_facebook_analytics(self, page_id: str, access_token: str) -> Dict[str, Any]:
        """
        Fetch Facebook Page analytics from Meta Graph API.
        """
        # Get page info including followers
        page_url = f"{self.META_API_BASE}/{page_id}"
        params = {
            "fields": "followers_count,fan_count,name",
            "access_token": access_token
        }
        
        response = requests.get(page_url, params=params)
        response.raise_for_status()
        page_data = response.json()
        
        followers = page_data.get("followers_count", page_data.get("fan_count", 0))
        
        # Get page insights
        insights_url = f"{self.META_API_BASE}/{page_id}/insights"
        insights_params = {
            "metric": "page_impressions,page_views_total",
            "period": "day",
            "access_token": access_token
        }
        
        views = 0
        try:
            insights_response = requests.get(insights_url, params=insights_params)
            if insights_response.status_code == 200:
                insights_data = insights_response.json()
                for metric in insights_data.get("data", []):
                    if metric.get("name") == "page_impressions":
                        values = metric.get("values", [])[-7:]
                        views = sum(v.get("value", 0) for v in values)
                        break
        except Exception as e:
            logger.warning(f"Could not fetch Facebook insights: {e}")
        
        # Get likes from recent posts
        likes = 0
        try:
            posts_url = f"{self.META_API_BASE}/{page_id}/posts"
            posts_params = {
                "fields": "id,created_time,likes.summary(true)",
                "limit": 25,
                "access_token": access_token
            }
            posts_response = requests.get(posts_url, params=posts_params)
            if posts_response.status_code == 200:
                posts_data = posts_response.json()
                seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
                for post in posts_data.get("data", []):
                    created_time = post.get("created_time")
                    if created_time:
                        post_time = datetime.fromisoformat(created_time.replace("Z", "+00:00"))
                        if post_time >= seven_days_ago:
                            likes_summary = post.get("likes", {}).get("summary", {})
                            likes += likes_summary.get("total_count", 0)
        except Exception as e:
            logger.warning(f"Could not fetch Facebook post likes: {e}")
        
        return {
            "followers_count": followers,
            "views_last_7_days": views,
            "likes_last_7_days": likes,
            "extra_metrics": {
                "page_name": page_data.get("name")
            }
        }
    
    def _fetch_youtube_analytics(self, channel: YouTubeChannel) -> Dict[str, Any]:
        """
        Fetch YouTube channel analytics.
        
        Uses YouTube Data API v3 to get subscriber count and view statistics.
        """
        # First, get a fresh access token using the refresh token
        access_token = self._refresh_youtube_token(channel.refresh_token)
        
        if not access_token:
            raise Exception("Failed to refresh YouTube access token")
        
        # Get channel statistics
        channels_url = f"{self.YOUTUBE_API_BASE}/channels"
        params = {
            "part": "statistics,snippet",
            "id": channel.channel_id,
        }
        headers = {"Authorization": f"Bearer {access_token}"}
        
        response = requests.get(channels_url, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        items = data.get("items", [])
        if not items:
            raise Exception("Channel not found")
        
        stats = items[0].get("statistics", {})
        snippet = items[0].get("snippet", {})
        
        subscribers = int(stats.get("subscriberCount", 0))
        total_views = int(stats.get("viewCount", 0))
        video_count = int(stats.get("videoCount", 0))
        
        # Note: Getting exact 7-day views requires YouTube Analytics API
        # which needs additional OAuth scopes. For now, we estimate from recent videos
        views_7_days = 0
        likes_7_days = 0
        
        try:
            # Get recent videos
            search_url = f"{self.YOUTUBE_API_BASE}/search"
            search_params = {
                "part": "id",
                "channelId": channel.channel_id,
                "type": "video",
                "order": "date",
                "maxResults": 10,
                "publishedAfter": (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            }
            
            search_response = requests.get(search_url, params=search_params, headers=headers)
            if search_response.status_code == 200:
                search_data = search_response.json()
                video_ids = [item["id"]["videoId"] for item in search_data.get("items", []) if "videoId" in item.get("id", {})]
                
                if video_ids:
                    # Get video statistics
                    videos_url = f"{self.YOUTUBE_API_BASE}/videos"
                    videos_params = {
                        "part": "statistics",
                        "id": ",".join(video_ids)
                    }
                    videos_response = requests.get(videos_url, params=videos_params, headers=headers)
                    if videos_response.status_code == 200:
                        videos_data = videos_response.json()
                        for video in videos_data.get("items", []):
                            video_stats = video.get("statistics", {})
                            views_7_days += int(video_stats.get("viewCount", 0))
                            likes_7_days += int(video_stats.get("likeCount", 0))
        except Exception as e:
            logger.warning(f"Could not fetch YouTube recent video stats: {e}")
        
        return {
            "followers_count": subscribers,
            "views_last_7_days": views_7_days,
            "likes_last_7_days": likes_7_days,
            "extra_metrics": {
                "channel_name": snippet.get("title"),
                "total_views": total_views,
                "video_count": video_count
            }
        }
    
    def _refresh_youtube_token(self, refresh_token: str) -> Optional[str]:
        """Refresh YouTube access token."""
        client_id = os.getenv("YOUTUBE_CLIENT_ID")
        client_secret = os.getenv("YOUTUBE_CLIENT_SECRET")
        
        if not client_id or not client_secret:
            return None
        
        try:
            response = requests.post("https://oauth2.googleapis.com/token", data={
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token"
            })
            
            if response.status_code == 200:
                return response.json().get("access_token")
            return None
        except Exception:
            return None
    
    def _update_analytics(self, brand: str, platform: str, data: Dict[str, Any], user_id: str = None):
        """Update or create analytics record and save a snapshot."""
        now = datetime.now(timezone.utc)
        
        query = self.db.query(BrandAnalytics).filter(
            BrandAnalytics.brand == brand,
            BrandAnalytics.platform == platform
        )
        if user_id:
            query = query.filter(BrandAnalytics.user_id == user_id)
        analytics = query.first()
        
        if analytics:
            analytics.followers_count = data.get("followers_count", 0)
            analytics.views_last_7_days = data.get("views_last_7_days", 0)
            analytics.likes_last_7_days = data.get("likes_last_7_days", 0)
            analytics.extra_metrics = data.get("extra_metrics")
            analytics.last_fetched_at = now
        else:
            analytics = BrandAnalytics(
                brand=brand,
                platform=platform,
                followers_count=data.get("followers_count", 0),
                views_last_7_days=data.get("views_last_7_days", 0),
                likes_last_7_days=data.get("likes_last_7_days", 0),
                extra_metrics=data.get("extra_metrics"),
                last_fetched_at=now,
                user_id=user_id
            )
            self.db.add(analytics)
        
        # Save a historical snapshot for trend analysis
        snapshot = AnalyticsSnapshot(
            brand=brand,
            platform=platform,
            snapshot_at=now,
            followers_count=data.get("followers_count", 0),
            views_last_7_days=data.get("views_last_7_days", 0),
            likes_last_7_days=data.get("likes_last_7_days", 0),
            user_id=user_id
        )
        self.db.add(snapshot)
        
        self.db.commit()
    
    def get_snapshots(
        self,
        brand: Optional[str] = None,
        platform: Optional[str] = None,
        days: int = 30,
        user_id: str = None
    ) -> List[Dict[str, Any]]:
        """
        Get historical analytics snapshots, deduplicated to the latest
        snapshot per brand/platform/day.

        Args:
            brand: Filter by brand name (optional)
            platform: Filter by platform (optional)
            days: Number of days to look back (default 30)
            user_id: Filter by user_id (optional)

        Returns:
            List of snapshot dictionaries ordered by time
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)

        # Subquery: get the latest snapshot id per (brand, platform, date)
        from sqlalchemy import cast, Date
        base_q = self.db.query(
            func.max(AnalyticsSnapshot.id).label("max_id")
        ).filter(
            AnalyticsSnapshot.snapshot_at >= since
        )
        if user_id:
            base_q = base_q.filter(AnalyticsSnapshot.user_id == user_id)
        if brand:
            base_q = base_q.filter(AnalyticsSnapshot.brand == brand)
        if platform:
            base_q = base_q.filter(AnalyticsSnapshot.platform == platform)

        subq = base_q.group_by(
            AnalyticsSnapshot.brand,
            AnalyticsSnapshot.platform,
            cast(AnalyticsSnapshot.snapshot_at, Date)
        ).subquery()

        snapshots = (
            self.db.query(AnalyticsSnapshot)
            .filter(AnalyticsSnapshot.id.in_(self.db.query(subq.c.max_id)))
            .order_by(AnalyticsSnapshot.snapshot_at.asc())
            .all()
        )
        return [s.to_dict() for s in snapshots]
    
    def backfill_historical_data(self, days_back: int = 28, user_id: str = None) -> Dict[str, Any]:
        """
        Backfill historical analytics data from Instagram insights.
        
        IMPORTANT LIMITATIONS:
        - Instagram Insights API only provides up to 30 days of historical data
        - Follower count is CURRENT ONLY - no historical data available from API
        - We can only backfill views/impressions for the past 28 days
        - Historical follower data from before we started tracking is NOT recoverable
        
        This method fetches ACTUAL impressions data from Instagram.
        Followers are set to 0 for historical entries (since we can't get real data).
        
        Args:
            days_back: Number of days to fetch (max 28 for Instagram)
            
        Returns:
            Dict with success status and backfilled count
        """
        from app.models import AnalyticsSnapshot
        
        errors = []
        snapshots_created = 0
        
        # Limit to 28 days (Instagram insights API limitation)
        days_back = min(days_back, 28)
        
        now = datetime.now(timezone.utc)
        
        # Process each brand
        for brand_name in brand_resolver.get_all_brand_ids():
            config = brand_resolver.get_brand_config(brand_name)
            if not config:
                continue
            
            # Instagram historical data
            if config.instagram_business_account_id and config.meta_access_token:
                try:
                    # Fetch current follower count to use for the most recent entry
                    current_followers = 0
                    try:
                        acct_url = f"{self.META_API_BASE}/{config.instagram_business_account_id}"
                        acct_resp = requests.get(acct_url, params={
                            "fields": "followers_count",
                            "access_token": config.meta_access_token,
                        })
                        if acct_resp.status_code == 200:
                            current_followers = acct_resp.json().get("followers_count", 0)
                    except Exception as e:
                        logger.warning(f"Could not fetch current followers for {brand_name}: {e}")

                    daily_data = self._fetch_instagram_historical(
                        config.instagram_business_account_id,
                        config.meta_access_token,
                        days_back,
                        current_followers=current_followers,
                    )
                    
                    for day_data in daily_data:
                        # Check if snapshot already exists for this date
                        existing = self.db.query(AnalyticsSnapshot).filter(
                            AnalyticsSnapshot.brand == brand_name,
                            AnalyticsSnapshot.platform == "instagram",
                            func.date(AnalyticsSnapshot.snapshot_at) == day_data["date"].date()
                        )
                        if user_id:
                            existing = existing.filter(AnalyticsSnapshot.user_id == user_id)
                        existing = existing.first()
                        
                        if not existing:
                            snapshot = AnalyticsSnapshot(
                                brand=brand_name,
                                platform="instagram",
                                snapshot_at=day_data["date"],
                                followers_count=day_data.get("followers", 0),
                                views_last_7_days=day_data["impressions"],
                                likes_last_7_days=day_data["likes"],
                                user_id=user_id
                            )
                            self.db.add(snapshot)
                            snapshots_created += 1
                            
                except Exception as e:
                    logger.error(f"Failed to backfill Instagram for {brand_name}: {e}")
                    errors.append(f"Instagram/{brand_name}: {str(e)}")
            
            # YouTube - skip backfill, no historical data available without Analytics API
            # YouTube API only provides current stats, not historical
        
        self.db.commit()
        
        return {
            "success": True,
            "snapshots_created": snapshots_created,
            "errors": errors if errors else None,
            "note": "Historical follower data is NOT available from Instagram API. Only views/impressions for the past 28 days can be backfilled. Follower tracking starts from when you first refresh analytics."
        }
    
    def clear_backfilled_data(self, user_id: str = None) -> Dict[str, Any]:
        """
        Clear all backfilled/approximated historical data.
        
        This removes all AnalyticsSnapshot entries that have followers_count = 0
        or that were created before the analytics feature was added.
        """
        from app.models import AnalyticsSnapshot
        
        # Delete all snapshots (we'll rebuild from fresh data)
        query = self.db.query(AnalyticsSnapshot)
        if user_id:
            query = query.filter(AnalyticsSnapshot.user_id == user_id)
        deleted = query.delete()
        self.db.commit()
        
        return {
            "success": True,
            "deleted_count": deleted
        }
    
    def _fetch_instagram_historical(
        self, 
        account_id: str, 
        access_token: str, 
        days_back: int = 28,
        current_followers: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Fetch historical daily Instagram insights.
        
        Returns a list of daily data with ACTUAL impressions and likes from API.
        The most recent entry uses current_followers for the follower count.
        """
        now = datetime.now(timezone.utc)
        since_date = now - timedelta(days=days_back)
        
        since_ts = int(since_date.timestamp())
        until_ts = int(now.timestamp())
        
        daily_data = []
        impressions_by_date = {}
        likes_by_date = {}
        
        insights_url = f"{self.META_API_BASE}/{account_id}/insights"
        
        # Fetch impressions time series (ACTUAL DATA)
        insights_params = {
            "metric": "impressions",
            "metric_type": "time_series",
            "since": since_ts,
            "until": until_ts,
            "access_token": access_token
        }
        
        insights_resp = requests.get(insights_url, params=insights_params)
        
        if insights_resp.status_code == 200:
            insights_data = insights_resp.json()
            for metric in insights_data.get("data", []):
                if metric.get("name") == "impressions":
                    for value in metric.get("values", []):
                        end_time = value.get("end_time")
                        if end_time:
                            date = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
                            impressions_by_date[date.date()] = value.get("value", 0)
        else:
            logger.warning(f"Failed to fetch impressions: {insights_resp.status_code}")
            # Try reach as fallback
            reach_params = {
                "metric": "reach",
                "metric_type": "time_series",
                "since": since_ts,
                "until": until_ts,
                "access_token": access_token
            }
            reach_resp = requests.get(insights_url, params=reach_params)
            if reach_resp.status_code == 200:
                reach_data = reach_resp.json()
                for metric in reach_data.get("data", []):
                    if metric.get("name") == "reach":
                        for value in metric.get("values", []):
                            end_time = value.get("end_time")
                            if end_time:
                                date = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
                                impressions_by_date[date.date()] = value.get("value", 0)
        
        # Fetch likes from recent media (this is the only way to get historical likes)
        # Get recent media and their like counts
        try:
            media_url = f"{self.META_API_BASE}/{account_id}/media"
            media_params = {
                "fields": "id,like_count,timestamp",
                "limit": 100,  # Get last 100 posts
                "access_token": access_token
            }
            media_resp = requests.get(media_url, params=media_params)
            if media_resp.status_code == 200:
                media_data = media_resp.json()
                for media in media_data.get("data", []):
                    timestamp = media.get("timestamp")
                    like_count = media.get("like_count", 0)
                    if timestamp and like_count:
                        media_date = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).date()
                        # Add likes to the date the media was posted
                        likes_by_date[media_date] = likes_by_date.get(media_date, 0) + like_count
        except Exception as e:
            logger.warning(f"Failed to fetch media likes: {e}")
        
        # Build daily data list with ACTUAL data only
        for days_ago in range(days_back, 0, -1):
            date = now - timedelta(days=days_ago)
            date_key = date.date()
            
            impressions = impressions_by_date.get(date_key, 0)
            likes = likes_by_date.get(date_key, 0)
            
            # Only add if we have actual data
            if impressions > 0 or likes > 0:
                daily_data.append({
                    "date": date,
                    "impressions": impressions,
                    "likes": likes,
                    "followers": 0,  # Historical followers unknown
                })
        
        # Use current follower count for the most recent entry
        if daily_data and current_followers > 0:
            daily_data[-1]["followers"] = current_followers
        
        logger.info(f"Instagram historical: fetched {len(daily_data)} days of ACTUAL data")
        return daily_data
