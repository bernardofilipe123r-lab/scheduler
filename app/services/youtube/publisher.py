"""
YouTube Shorts publisher using YouTube Data API v3.
Supports OAuth 2.0 with refresh token flow, quota monitoring, and scheduled publishing.
"""
import os
import json
import time
import requests
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass

from sqlalchemy.orm import Session
from app.models import YouTubeChannel


# YouTube API quota costs
QUOTA_COSTS = {
    "videos.insert": 1600,
    "videos.update": 50,
    "channels.list": 1,
    "thumbnails.set": 50,
}

# Default daily quota limit
DEFAULT_DAILY_QUOTA = 10000


@dataclass
class YouTubeCredentials:
    """YouTube OAuth credentials for a channel."""
    channel_id: str
    channel_name: str
    refresh_token: str
    access_token: Optional[str] = None
    token_expiry: Optional[datetime] = None


@dataclass
class QuotaStatus:
    """Current YouTube API quota status."""
    used: int
    limit: int
    remaining: int
    reset_time: datetime
    can_upload: bool  # True if enough quota for one upload


class YouTubeQuotaMonitor:
    """Monitor and track YouTube API quota usage."""
    
    def __init__(self, quota_file: str = "youtube_quota.json"):
        self.quota_file = Path(quota_file)
        self.daily_limit = int(os.getenv("YOUTUBE_DAILY_QUOTA", DEFAULT_DAILY_QUOTA))
        self._load_quota()
    
    def _load_quota(self):
        """Load quota data from file."""
        if self.quota_file.exists():
            try:
                with open(self.quota_file, "r") as f:
                    data = json.load(f)
                    self.used = data.get("used", 0)
                    self.last_reset = datetime.fromisoformat(data.get("last_reset", datetime.now(timezone.utc).isoformat()))
                    
                    # Reset if it's a new day (Pacific Time - Google uses PT for quota reset)
                    if self._is_new_quota_day():
                        self._reset_quota()
            except Exception:
                self._reset_quota()
        else:
            self._reset_quota()
    
    def _save_quota(self):
        """Save quota data to file."""
        with open(self.quota_file, "w") as f:
            json.dump({
                "used": self.used,
                "last_reset": self.last_reset.isoformat(),
                "daily_limit": self.daily_limit
            }, f)
    
    def _is_new_quota_day(self) -> bool:
        """Check if quota should reset (resets at midnight PT)."""
        # YouTube quota resets at midnight Pacific Time
        now = datetime.now(timezone.utc)
        pt_offset = timedelta(hours=-8)  # PST (adjust for PDT if needed)
        now_pt = now + pt_offset
        last_reset_pt = self.last_reset + pt_offset
        
        return now_pt.date() > last_reset_pt.date()
    
    def _reset_quota(self):
        """Reset quota for a new day."""
        self.used = 0
        self.last_reset = datetime.now(timezone.utc)
        self._save_quota()
        print("📊 YouTube quota reset for new day")
    
    def use_quota(self, operation: str, amount: Optional[int] = None):
        """Record quota usage for an operation."""
        if self._is_new_quota_day():
            self._reset_quota()
        
        cost = amount if amount is not None else QUOTA_COSTS.get(operation, 0)
        self.used += cost
        self._save_quota()
        print(f"   📊 Quota used: {cost} for {operation} (total: {self.used}/{self.daily_limit})")
    
    def get_status(self) -> QuotaStatus:
        """Get current quota status."""
        if self._is_new_quota_day():
            self._reset_quota()
        
        remaining = self.daily_limit - self.used
        
        # Calculate next reset time (midnight PT)
        now = datetime.now(timezone.utc)
        pt_offset = timedelta(hours=-8)
        now_pt = now + pt_offset
        next_midnight_pt = datetime.combine(
            now_pt.date() + timedelta(days=1),
            datetime.min.time()
        )
        reset_time = next_midnight_pt - pt_offset  # Convert back to UTC
        
        return QuotaStatus(
            used=self.used,
            limit=self.daily_limit,
            remaining=remaining,
            reset_time=reset_time.replace(tzinfo=timezone.utc),
            can_upload=remaining >= QUOTA_COSTS["videos.insert"]
        )
    
    def can_upload(self) -> bool:
        """Check if there's enough quota for an upload."""
        return self.get_status().can_upload


class YouTubePublisher:
    """Service for publishing YouTube Shorts using OAuth 2.0."""
    
    # OAuth endpoints
    AUTH_URL = "https://accounts.google.com/o/oauth2/auth"
    TOKEN_URL = "https://oauth2.googleapis.com/token"
    
    # YouTube API endpoints
    API_BASE = "https://www.googleapis.com/youtube/v3"
    UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
    
    # Required OAuth scopes: 
    # - youtube.upload: for uploading videos
    # - youtube.readonly: for getting channel info
    # - youtube.force-ssl: for setting thumbnails (requires verified channel)
    OAUTH_SCOPES = [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.force-ssl"  # Required for thumbnails
    ]
    
    def __init__(self, credentials: Optional[YouTubeCredentials] = None):
        """
        Initialize the YouTube publisher.
        
        Args:
            credentials: Optional channel credentials. If not provided, uses env vars.
        """
        self.client_id = os.getenv("YOUTUBE_CLIENT_ID")
        self.client_secret = os.getenv("YOUTUBE_CLIENT_SECRET")
        self.redirect_uri = os.getenv("YOUTUBE_REDIRECT_URI", "")
        
        self.credentials = credentials
        self.quota_monitor = YouTubeQuotaMonitor()
        
        if not self.client_id or not self.client_secret:
            print("⚠️ Warning: YouTube OAuth credentials not configured")
        else:
            print("✅ YouTube OAuth credentials loaded")
    
    def get_authorization_url(self, state: str = "") -> str:
        """
        Generate the OAuth authorization URL for connecting a YouTube channel.
        
        Args:
            state: Optional state parameter for CSRF protection
            
        Returns:
            Authorization URL to redirect user to
        """
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": " ".join(self.OAUTH_SCOPES),  # Space-separated scopes
            "access_type": "offline",  # Required to get refresh token
            "prompt": "consent select_account",  # Force channel selection
            "state": state
        }
        
        query = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
        return f"{self.AUTH_URL}?{query}"
    
    def exchange_code_for_tokens(self, authorization_code: str) -> Tuple[bool, Dict[str, Any]]:
        """
        Exchange authorization code for access and refresh tokens.
        
        Args:
            authorization_code: Code received from OAuth callback
            
        Returns:
            Tuple of (success, token_data or error)
        """
        try:
            response = requests.post(self.TOKEN_URL, data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "code": authorization_code,
                "grant_type": "authorization_code",
                "redirect_uri": self.redirect_uri
            })
            
            if response.status_code != 200:
                return False, {"error": f"Token exchange failed: {response.text}"}
            
            token_data = response.json()
            
            # Get channel info
            access_token = token_data.get("access_token")
            channel_info = self._get_channel_info(access_token)
            
            if not channel_info:
                return False, {"error": "Failed to get channel info"}
            
            return True, {
                "access_token": access_token,
                "refresh_token": token_data.get("refresh_token"),
                "expires_in": token_data.get("expires_in", 3600),
                "channel_id": channel_info["id"],
                "channel_name": channel_info["title"]
            }
            
        except Exception as e:
            return False, {"error": str(e)}
    
    def _get_channel_info(self, access_token: str) -> Optional[Dict[str, str]]:
        """Get the channel ID and name for the authenticated user."""
        try:
            response = requests.get(
                f"{self.API_BASE}/channels",
                params={"part": "id,snippet", "mine": "true"},
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            self.quota_monitor.use_quota("channels.list")
            
            if response.status_code != 200:
                print(f"❌ Failed to get channel info: {response.text}")
                return None
            
            data = response.json()
            items = data.get("items", [])
            
            if not items:
                return None
            
            channel = items[0]
            return {
                "id": channel["id"],
                "title": channel["snippet"]["title"]
            }
            
        except Exception as e:
            print(f"❌ Error getting channel info: {e}")
            return None
    
    def refresh_access_token(self, refresh_token: str) -> Tuple[bool, Dict[str, Any]]:
        """
        Refresh an expired access token.
        
        Args:
            refresh_token: The refresh token stored for the channel
            
        Returns:
            Tuple of (success, new_token_data or error)
        """
        try:
            response = requests.post(self.TOKEN_URL, data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token"
            })
            
            if response.status_code != 200:
                return False, {"error": f"Token refresh failed: {response.text}"}
            
            token_data = response.json()
            return True, {
                "access_token": token_data.get("access_token"),
                "expires_in": token_data.get("expires_in", 3600)
            }
            
        except Exception as e:
            return False, {"error": str(e)}
    
    def _ensure_valid_token(self) -> Optional[str]:
        """Ensure we have a valid access token, refreshing if needed."""
        print(f"   📺 [YT TOKEN] _ensure_valid_token() called", flush=True)
        
        if not self.credentials:
            print("   ❌ [YT TOKEN] No credentials provided", flush=True)
            return None
        
        print(f"   📺 [YT TOKEN] credentials.channel_id: {self.credentials.channel_id}", flush=True)
        print(f"   📺 [YT TOKEN] credentials.access_token present: {bool(self.credentials.access_token)}", flush=True)
        print(f"   📺 [YT TOKEN] credentials.token_expiry: {self.credentials.token_expiry}", flush=True)
        print(f"   📺 [YT TOKEN] credentials.refresh_token present: {bool(self.credentials.refresh_token)}", flush=True)
        
        # Check if token is still valid
        if self.credentials.access_token and self.credentials.token_expiry:
            if datetime.now(timezone.utc) < self.credentials.token_expiry - timedelta(minutes=5):
                print(f"   ✅ [YT TOKEN] Existing token still valid", flush=True)
                return self.credentials.access_token
        
        # Need to refresh
        print(f"   🔄 [YT TOKEN] Need to refresh token...", flush=True)
        print(f"   🔄 [YT TOKEN] Using refresh_token (length: {len(self.credentials.refresh_token) if self.credentials.refresh_token else 0})", flush=True)
        
        success, result = self.refresh_access_token(self.credentials.refresh_token)
        
        if not success:
            print(f"   ❌ [YT TOKEN] Token refresh failed: {result.get('error')}", flush=True)
            return None
        
        self.credentials.access_token = result["access_token"]
        self.credentials.token_expiry = datetime.now(timezone.utc) + timedelta(seconds=result["expires_in"])
        
        print(f"   ✅ [YT TOKEN] Token refreshed successfully, expires in {result['expires_in']}s", flush=True)
        return self.credentials.access_token
    
    def upload_youtube_short(
        self,
        video_path: str,
        title: str,
        description: str,
        thumbnail_path: Optional[str] = None,
        publish_at: Optional[datetime] = None,
        tags: Optional[list[str]] = None
    ) -> Dict[str, Any]:
        """
        Upload a video as a YouTube Short.
        
        Args:
            video_path: Path to the video file (must be ≤60s, vertical)
            title: Video title
            description: Video description (will add #Shorts hashtag)
            thumbnail_path: Optional custom thumbnail
            publish_at: Optional scheduled publish time (UTC)
            tags: Optional list of tags
            
        Returns:
            Dict with success status and video ID or error
        """
        print(f"\n📺 [YT UPLOAD] upload_youtube_short() called", flush=True)
        print(f"   📺 [YT UPLOAD] video_path: {video_path}", flush=True)
        print(f"   📺 [YT UPLOAD] title: {title}", flush=True)
        print(f"   📺 [YT UPLOAD] thumbnail_path: {thumbnail_path}", flush=True)
        print(f"   📺 [YT UPLOAD] publish_at: {publish_at}", flush=True)
        
        # NOTE: We don't pre-check quota locally - we trust YouTube's actual API response
        # Local quota tracking (youtube_quota.json) is unreliable due to Railway redeploys
        # If quota is exceeded, YouTube returns 403 and we handle it gracefully
        
        # Ensure we have a valid token
        print(f"   📺 [YT UPLOAD] Getting valid access token...", flush=True)
        access_token = self._ensure_valid_token()
        if not access_token:
            print(f"   ❌ [YT UPLOAD] Failed to get valid access token!", flush=True)
            return {"success": False, "error": "Failed to get valid access token"}
        print(f"   ✅ [YT UPLOAD] Got access token (length: {len(access_token)})", flush=True)
        
        # Ensure description has #Shorts for YouTube to recognize it
        if "#shorts" not in description.lower():
            description = f"{description}\n\n#Shorts"
        
        # Prepare video metadata
        video_metadata = {
            "snippet": {
                "title": title[:100],  # Max 100 chars
                "description": description[:5000],  # Max 5000 chars
                "tags": tags or ["shorts", "health", "wellness"],
                "categoryId": "22"  # People & Blogs (good for health content)
            },
            "status": {
                "privacyStatus": "private" if publish_at else "public",
                "selfDeclaredMadeForKids": False
            }
        }
        print(f"   📺 [YT UPLOAD] Video metadata prepared: privacyStatus={video_metadata['status']['privacyStatus']}", flush=True)
        
        # Add scheduled publish time if provided
        if publish_at:
            # Ensure timezone aware
            if publish_at.tzinfo is None:
                publish_at = publish_at.replace(tzinfo=timezone.utc)
            video_metadata["status"]["publishAt"] = publish_at.isoformat()
            print(f"   📅 Scheduled for: {publish_at}")
        
        try:
            # Step 1: Initiate resumable upload
            print(f"   📤 [YT UPLOAD] Step 1: Initiating resumable upload...", flush=True)
            print(f"   📤 [YT UPLOAD] Upload URL: {self.UPLOAD_URL}", flush=True)
            
            init_response = requests.post(
                f"{self.UPLOAD_URL}?uploadType=resumable&part=snippet,status",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                    "X-Upload-Content-Type": "video/mp4"
                },
                json=video_metadata
            )
            
            print(f"   📤 [YT UPLOAD] Init response status: {init_response.status_code}", flush=True)
            
            if init_response.status_code != 200:
                print(f"   ❌ [YT UPLOAD] Init failed: {init_response.text}", flush=True)
                return {"success": False, "error": f"Upload init failed: {init_response.text}"}
            
            upload_url = init_response.headers.get("Location")
            if not upload_url:
                print(f"   ❌ [YT UPLOAD] No upload URL in response headers", flush=True)
                return {"success": False, "error": "No upload URL in response"}
            
            print(f"   ✅ [YT UPLOAD] Got upload URL", flush=True)
            
            # Step 2: Upload video file
            print(f"   📤 [YT UPLOAD] Step 2: Uploading video file...", flush=True)
            video_file = Path(video_path)
            if not video_file.exists():
                print(f"   ❌ [YT UPLOAD] Video file not found: {video_path}", flush=True)
                return {"success": False, "error": f"Video file not found: {video_path}"}
            
            file_size = video_file.stat().st_size
            print(f"   📤 [YT UPLOAD] Video file size: {file_size} bytes ({file_size / 1024 / 1024:.2f} MB)", flush=True)
            
            with open(video_file, "rb") as f:
                upload_response = requests.put(
                    upload_url,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "video/mp4",
                        "Content-Length": str(file_size)
                    },
                    data=f
                )
            
            print(f"   📤 [YT UPLOAD] Upload response status: {upload_response.status_code}", flush=True)
            
            if upload_response.status_code not in [200, 201]:
                print(f"   ❌ [YT UPLOAD] Upload failed: {upload_response.text}", flush=True)
                return {"success": False, "error": f"Video upload failed: {upload_response.text}"}
            
            video_data = upload_response.json()
            video_id = video_data.get("id")
            
            # Record quota usage
            self.quota_monitor.use_quota("videos.insert")
            
            print(f"   ✅ [YT UPLOAD] YouTube Short uploaded successfully! video_id={video_id}", flush=True)
            print(f"   🔗 [YT UPLOAD] URL: https://youtube.com/shorts/{video_id}", flush=True)
            
            # Step 3: Upload custom thumbnail if provided
            thumb_success = False
            thumb_error = None
            if thumbnail_path and Path(thumbnail_path).exists():
                print(f"   📤 [YT UPLOAD] Step 3: Setting custom thumbnail...", flush=True)
                # Wait for YouTube to process the video before setting thumbnail
                # YouTube often rejects thumbnails on freshly uploaded videos
                print(f"   ⏳ [YT UPLOAD] Waiting 15s for YouTube to process video before thumbnail...", flush=True)
                time.sleep(15)
                thumb_success, thumb_error = self._set_thumbnail(video_id, thumbnail_path, access_token)
                if not thumb_success:
                    # Retry once more after additional wait
                    print(f"   🔄 [YT UPLOAD] Thumbnail failed ({thumb_error}), retrying in 20s...", flush=True)
                    time.sleep(20)
                    thumb_success, thumb_error = self._set_thumbnail(video_id, thumbnail_path, access_token)
                    if not thumb_success:
                        print(f"   ❌ [YT UPLOAD] Thumbnail retry also failed: {thumb_error}", flush=True)
            else:
                thumb_error = f"File not found (path={thumbnail_path}, exists={Path(thumbnail_path).exists() if thumbnail_path else False})"
                print(f"   ℹ️ [YT UPLOAD] No custom thumbnail to upload: {thumb_error}", flush=True)
            
            return {
                "success": True,
                "video_id": video_id,
                "url": f"https://youtube.com/shorts/{video_id}",
                "scheduled": publish_at is not None,
                "publish_at": publish_at.isoformat() if publish_at else None,
                "thumbnail_set": thumb_success,
                "thumbnail_error": thumb_error if not thumb_success else None
            }
            
        except Exception as e:
            print(f"   ❌ [YT UPLOAD] Exception during upload: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def _set_thumbnail(self, video_id: str, thumbnail_path: str, access_token: str) -> tuple[bool, str | None]:
        """Upload a custom thumbnail for a video.
        
        Returns:
            Tuple of (success, error_message_or_None)
        """
        try:
            from PIL import Image as PILImage
            import io
            
            print(f"   📤 [YT THUMBNAIL] Uploading thumbnail: {thumbnail_path}", flush=True)
            
            # YouTube thumbnail limit is 2MB. AI-generated PNGs at 1080x1920
            # can easily exceed this. Convert to JPEG and compress if needed.
            YOUTUBE_MAX_THUMB_SIZE = 2 * 1024 * 1024  # 2MB
            
            path = Path(thumbnail_path)
            file_size = path.stat().st_size
            print(f"   📤 [YT THUMBNAIL] Original file size: {file_size} bytes ({file_size / 1024 / 1024:.2f} MB)", flush=True)
            
            if file_size > YOUTUBE_MAX_THUMB_SIZE:
                print(f"   ⚠️ [YT THUMBNAIL] File exceeds YouTube 2MB limit! Compressing to JPEG...", flush=True)
                img = PILImage.open(thumbnail_path)
                if img.mode == 'RGBA':
                    img = img.convert('RGB')
                
                # Try quality levels until under 2MB
                for quality in [90, 80, 70, 60]:
                    buf = io.BytesIO()
                    img.save(buf, format='JPEG', quality=quality, optimize=True)
                    image_data = buf.getvalue()
                    if len(image_data) <= YOUTUBE_MAX_THUMB_SIZE:
                        print(f"   ✅ [YT THUMBNAIL] Compressed to {len(image_data)} bytes (JPEG q={quality})", flush=True)
                        break
                else:
                    # Even quality 60 is too large — resize
                    print(f"   ⚠️ [YT THUMBNAIL] Still too large, resizing...", flush=True)
                    img.thumbnail((1080, 1920), PILImage.LANCZOS)
                    buf = io.BytesIO()
                    img.save(buf, format='JPEG', quality=70, optimize=True)
                    image_data = buf.getvalue()
                    print(f"   ✅ [YT THUMBNAIL] Resized+compressed to {len(image_data)} bytes", flush=True)
                
                content_type = 'image/jpeg'
            else:
                # File is under 2MB, use as-is
                with open(thumbnail_path, "rb") as f:
                    image_data = f.read()
                
                ext = path.suffix.lower()
                content_type = {
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.png': 'image/png',
                    '.gif': 'image/gif',
                }.get(ext, 'image/png')
            
            print(f"   📤 [YT THUMBNAIL] Upload size: {len(image_data)} bytes, Content-Type: {content_type}", flush=True)
            
            # YouTube API requires using the UPLOAD endpoint (not the regular API endpoint)
            upload_url = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"
            
            response = requests.post(
                upload_url,
                params={
                    "videoId": video_id,
                    "uploadType": "media"
                },
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": content_type,
                    "Content-Length": str(len(image_data))
                },
                data=image_data
            )
            
            self.quota_monitor.use_quota("thumbnails.set")
            
            if response.status_code == 200:
                print(f"   ✅ Custom thumbnail set successfully!", flush=True)
                return True, None
            else:
                error_info = response.text
                print(f"   ⚠️ Thumbnail upload failed (status {response.status_code}): {error_info}", flush=True)
                
                if response.status_code == 403:
                    error_msg = f"403 Forbidden — channel may not be verified for custom thumbnails, or video is still processing"
                    print(f"   ℹ️ [YT THUMBNAIL] 403 Error - Possible causes:", flush=True)
                    print(f"      1. Channel not verified (requires phone verification + 24hr wait)", flush=True)
                    print(f"      2. OAuth token missing youtube.force-ssl scope", flush=True)
                    print(f"      3. Video is processing and not ready for thumbnail", flush=True)
                    print(f"   ℹ️ [YT THUMBNAIL] To fix: Re-connect YouTube in the app to get new OAuth scope", flush=True)
                    return False, error_msg
                
                return False, f"HTTP {response.status_code}: {error_info[:200]}"
                
        except Exception as e:
            print(f"   ⚠️ Thumbnail error: {e}", flush=True)
            return False, str(e)
    
    def get_quota_status(self) -> Dict[str, Any]:
        """Get current quota status as a dict."""
        status = self.quota_monitor.get_status()
        return {
            "used": status.used,
            "limit": status.limit,
            "remaining": status.remaining,
            "reset_time": status.reset_time.isoformat(),
            "can_upload": status.can_upload,
            "upload_cost": QUOTA_COSTS["videos.insert"]
        }


# Brand-specific YouTube credentials loader (env-var fallback)
def get_youtube_credentials_for_brand_env(brand: str) -> Optional[YouTubeCredentials]:
    """
    Load YouTube credentials for a specific brand from environment variables.
    
    Expected env vars:
        {BRAND}_YOUTUBE_CHANNEL_ID
        {BRAND}_YOUTUBE_REFRESH_TOKEN
    
    Args:
        brand: Brand name (e.g., "healthycollege", "longevitycollege")
        
    Returns:
        YouTubeCredentials if configured, None otherwise
    """
    brand_upper = brand.upper()
    
    channel_id = os.getenv(f"{brand_upper}_YOUTUBE_CHANNEL_ID")
    refresh_token = os.getenv(f"{brand_upper}_YOUTUBE_REFRESH_TOKEN")
    
    if not channel_id or not refresh_token:
        print(f"\u26a0\ufe0f YouTube credentials not configured for {brand}")
        return None
    
    # Use brand_resolver for display name, fall back to brand ID
    try:
        from app.services.brands.resolver import brand_resolver
        display_name = brand_resolver.get_brand_display_name(brand)
    except Exception:
        display_name = brand
    
    return YouTubeCredentials(
        channel_id=channel_id,
        channel_name=display_name,
        refresh_token=refresh_token
    )


def get_youtube_credentials_for_brand(brand: str, db: Session) -> Optional[YouTubeCredentials]:
    """
    Get YouTube credentials for a brand from the database.
    
    This is the function used by the scheduler/publisher to get
    the refresh_token needed for uploads.
    
    Args:
        brand: Brand name (e.g., "healthycollege")
        db: Database session
        
    Returns:
        YouTubeCredentials if found and connected, None otherwise
    """
    channel = db.query(YouTubeChannel).filter(
        YouTubeChannel.brand == brand.lower(),
        YouTubeChannel.status == "connected"
    ).first()
    
    if channel:
        return YouTubeCredentials(
            channel_id=channel.channel_id,
            channel_name=channel.channel_name or brand,
            refresh_token=channel.refresh_token
        )
    
    return None


def update_youtube_channel_status(
    brand: str, 
    db: Session,
    status: str = None,
    last_error: str = None,
    last_upload_at: datetime = None
):
    """
    Update the status of a YouTube channel after an upload attempt.
    
    Called by the scheduler after each upload to track success/failure.
    
    Args:
        brand: Brand name
        db: Database session
        status: New status ("connected", "error", "revoked")
        last_error: Error message if upload failed
        last_upload_at: Timestamp of successful upload
    """
    channel = db.query(YouTubeChannel).filter(YouTubeChannel.brand == brand.lower()).first()
    
    if channel:
        if status:
            channel.status = status
        if last_error is not None:
            channel.last_error = last_error
        if last_upload_at:
            channel.last_upload_at = last_upload_at
            channel.last_error = None  # Clear error on success
        
        channel.updated_at = datetime.utcnow()
        db.commit()
