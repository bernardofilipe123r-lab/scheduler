"""
Analytics service for fetching and caching brand metrics from social platforms.

Fetches followers, views (last 7 days), and likes for each brand on:
- Instagram (via Meta Graph API)
- Facebook (via Meta Graph API)  
- YouTube (via YouTube Data API)

Rate limited to 3 refreshes per hour to avoid excessive API calls.
"""
import os
import logging
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import BrandAnalytics, AnalyticsRefreshLog, YouTubeChannel
from app.core.config import BRAND_CONFIGS, BrandType
from app.api.brands_routes import BRAND_NAME_MAP


logger = logging.getLogger(__name__)


# Rate limiting configuration
MAX_REFRESHES_PER_HOUR = 3
REFRESH_WINDOW_HOURS = 1


class AnalyticsService:
    """Service for fetching and managing brand analytics."""
    
    META_API_BASE = "https://graph.facebook.com/v21.0"
    YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
    
    def __init__(self, db: Session):
        self.db = db
        
    def can_refresh(self) -> Tuple[bool, int, Optional[datetime]]:
        """
        Check if a refresh is allowed based on rate limiting.
        
        Returns:
            Tuple of (can_refresh, remaining_refreshes, next_refresh_available_at)
        """
        window_start = datetime.now(timezone.utc) - timedelta(hours=REFRESH_WINDOW_HOURS)
        
        refresh_count = self.db.query(func.count(AnalyticsRefreshLog.id)).filter(
            AnalyticsRefreshLog.refreshed_at >= window_start
        ).scalar() or 0
        
        remaining = max(0, MAX_REFRESHES_PER_HOUR - refresh_count)
        can_refresh = remaining > 0
        
        # Find when next refresh will be available
        next_available = None
        if not can_refresh:
            oldest_refresh = self.db.query(AnalyticsRefreshLog.refreshed_at).filter(
                AnalyticsRefreshLog.refreshed_at >= window_start
            ).order_by(AnalyticsRefreshLog.refreshed_at.asc()).first()
            
            if oldest_refresh:
                next_available = oldest_refresh[0] + timedelta(hours=REFRESH_WINDOW_HOURS)
        
        return can_refresh, remaining, next_available
    
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
    
    def get_all_analytics(self) -> List[Dict[str, Any]]:
        """Get all cached analytics data."""
        analytics = self.db.query(BrandAnalytics).all()
        return [a.to_dict() for a in analytics]
    
    def get_analytics_by_brand(self, brand: str) -> Dict[str, Any]:
        """Get analytics for a specific brand across all platforms."""
        analytics = self.db.query(BrandAnalytics).filter(
            BrandAnalytics.brand == brand
        ).all()
        
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
        for brand_name, brand_type in BRAND_NAME_MAP.items():
            config = BRAND_CONFIGS.get(brand_type)
            if not config:
                continue
            
            # Instagram
            try:
                if config.instagram_business_account_id and config.meta_access_token:
                    ig_data = self._fetch_instagram_analytics(
                        config.instagram_business_account_id,
                        config.meta_access_token
                    )
                    self._update_analytics(brand_name, "instagram", ig_data)
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
                    self._update_analytics(brand_name, "facebook", fb_data)
                    updated_count += 1
            except Exception as e:
                logger.error(f"Failed to fetch Facebook analytics for {brand_name}: {e}")
                errors.append(f"Facebook/{brand_name}: {str(e)}")
        
        # Fetch YouTube analytics for connected channels
        youtube_channels = self.db.query(YouTubeChannel).filter(
            YouTubeChannel.status == "connected"
        ).all()
        
        for channel in youtube_channels:
            try:
                yt_data = self._fetch_youtube_analytics(channel)
                self._update_analytics(channel.brand, "youtube", yt_data)
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
                "next_reset": (datetime.now(timezone.utc) + timedelta(hours=REFRESH_WINDOW_HOURS)).isoformat()
            },
            "analytics": self.get_all_analytics()
        }
    
    def _fetch_instagram_analytics(self, account_id: str, access_token: str) -> Dict[str, Any]:
        """
        Fetch Instagram analytics from Meta Graph API.
        
        Fetches:
        - followers_count: Total followers
        - views_last_7_days: Reach from insights (profile views + impressions)
        - likes_last_7_days: From media insights
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
        
        # Get insights for the last 7 days
        # Note: Instagram API requires specific metrics and periods
        insights_url = f"{self.META_API_BASE}/{account_id}/insights"
        insights_params = {
            "metric": "reach,impressions,profile_views",
            "period": "day",
            "access_token": access_token
        }
        
        views = 0
        try:
            insights_response = requests.get(insights_url, params=insights_params)
            if insights_response.status_code == 200:
                insights_data = insights_response.json()
                for metric in insights_data.get("data", []):
                    if metric.get("name") == "reach":
                        # Sum last 7 days of reach
                        values = metric.get("values", [])[-7:]
                        views = sum(v.get("value", 0) for v in values)
                        break
        except Exception as e:
            logger.warning(f"Could not fetch Instagram insights: {e}")
        
        # Get likes from recent media
        likes = 0
        try:
            media_url = f"{self.META_API_BASE}/{account_id}/media"
            media_params = {
                "fields": "id,like_count,timestamp",
                "limit": 25,  # Get recent posts
                "access_token": access_token
            }
            media_response = requests.get(media_url, params=media_params)
            if media_response.status_code == 200:
                media_data = media_response.json()
                seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
                for post in media_data.get("data", []):
                    timestamp = post.get("timestamp")
                    if timestamp:
                        post_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                        if post_time >= seven_days_ago:
                            likes += post.get("like_count", 0)
        except Exception as e:
            logger.warning(f"Could not fetch Instagram media likes: {e}")
        
        return {
            "followers_count": followers,
            "views_last_7_days": views,
            "likes_last_7_days": likes,
            "extra_metrics": {
                "username": account_data.get("username"),
                "media_count": account_data.get("media_count", 0)
            }
        }
    
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
    
    def _update_analytics(self, brand: str, platform: str, data: Dict[str, Any]):
        """Update or create analytics record."""
        analytics = self.db.query(BrandAnalytics).filter(
            BrandAnalytics.brand == brand,
            BrandAnalytics.platform == platform
        ).first()
        
        if analytics:
            analytics.followers_count = data.get("followers_count", 0)
            analytics.views_last_7_days = data.get("views_last_7_days", 0)
            analytics.likes_last_7_days = data.get("likes_last_7_days", 0)
            analytics.extra_metrics = data.get("extra_metrics")
            analytics.last_fetched_at = datetime.now(timezone.utc)
        else:
            analytics = BrandAnalytics(
                brand=brand,
                platform=platform,
                followers_count=data.get("followers_count", 0),
                views_last_7_days=data.get("views_last_7_days", 0),
                likes_last_7_days=data.get("likes_last_7_days", 0),
                extra_metrics=data.get("extra_metrics"),
                last_fetched_at=datetime.now(timezone.utc)
            )
            self.db.add(analytics)
        
        self.db.commit()
