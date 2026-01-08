"""
Social media publisher for Instagram and Facebook Reels.
"""
import os
import time
import requests
from typing import Optional, Dict, Any
from pathlib import Path
from app.core.config import BrandConfig


class SocialPublisher:
    """Service for publishing Reels to Instagram and Facebook."""
    
    def __init__(self, brand_config: Optional[BrandConfig] = None):
        """
        Initialize the social publisher with Meta credentials.
        
        Args:
            brand_config: Optional brand configuration with specific credentials.
                         If not provided, uses default environment variables.
        """
        # Use brand-specific credentials if provided, otherwise fall back to defaults
        if brand_config:
            self.ig_business_account_id = brand_config.instagram_business_account_id
            self.fb_page_id = brand_config.facebook_page_id
            self._system_user_token = brand_config.meta_access_token
            self.ig_access_token = brand_config.meta_access_token
        else:
            # Fallback to default environment variables
            self._system_user_token = os.getenv("META_ACCESS_TOKEN")
            self.ig_access_token = os.getenv("INSTAGRAM_ACCESS_TOKEN") or os.getenv("META_ACCESS_TOKEN")
            self.ig_business_account_id = os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID")
            self.fb_page_id = os.getenv("FACEBOOK_PAGE_ID")
        
        self.api_version = "v19.0"
        self._page_access_token_cache = {}  # Cache for page access tokens
        
        # Debug output to show credential status
        if self.ig_access_token and self.ig_business_account_id:
            print(f"✅ Instagram credentials loaded (Account: {self.ig_business_account_id})")
        else:
            if not self.ig_access_token:
                print("⚠️  Warning: Meta access token not found")
            if not self.ig_business_account_id:
                print("⚠️  Warning: INSTAGRAM_BUSINESS_ACCOUNT_ID not found")
    
    def _get_page_access_token(self, page_id: str) -> Optional[str]:
        """
        Get a Page Access Token from the System User Token.
        Facebook Reels API requires a Page Access Token, not a User/System User token.
        
        Args:
            page_id: The Facebook Page ID
            
        Returns:
            Page Access Token or None if failed
        """
        # Check cache first
        if page_id in self._page_access_token_cache:
            return self._page_access_token_cache[page_id]
        
        if not self._system_user_token:
            print("⚠️  No system user token available")
            return None
        
        try:
            # Get page access token from the system user token
            # This endpoint returns all pages the token has access to with their page tokens
            url = f"https://graph.facebook.com/{self.api_version}/{page_id}"
            params = {
                "fields": "access_token",
                "access_token": self._system_user_token
            }
            
            print(f"🔑 Getting Page Access Token for page {page_id}...")
            response = requests.get(url, params=params, timeout=10)
            data = response.json()
            
            if "error" in data:
                error_msg = data["error"].get("message", "Unknown error")
                print(f"   ❌ Failed to get page token: {error_msg}")
                # If this fails, try the /me/accounts approach
                return self._get_page_token_via_accounts(page_id)
            
            page_token = data.get("access_token")
            if page_token:
                print(f"   ✅ Got Page Access Token")
                self._page_access_token_cache[page_id] = page_token
                return page_token
            else:
                print(f"   ⚠️ No access_token in response, trying /me/accounts...")
                return self._get_page_token_via_accounts(page_id)
                
        except Exception as e:
            print(f"   ❌ Exception getting page token: {e}")
            return self._get_page_token_via_accounts(page_id)
    
    def _get_page_token_via_accounts(self, page_id: str) -> Optional[str]:
        """
        Alternative method: Get page token via /me/accounts endpoint.
        """
        try:
            url = f"https://graph.facebook.com/{self.api_version}/me/accounts"
            params = {
                "access_token": self._system_user_token
            }
            
            print(f"   🔍 Trying /me/accounts endpoint...")
            response = requests.get(url, params=params, timeout=10)
            data = response.json()
            
            if "error" in data:
                error_msg = data["error"].get("message", "Unknown error")
                print(f"   ❌ /me/accounts failed: {error_msg}")
                return None
            
            pages = data.get("data", [])
            for page in pages:
                if page.get("id") == page_id:
                    page_token = page.get("access_token")
                    if page_token:
                        print(f"   ✅ Found Page Access Token via /me/accounts")
                        self._page_access_token_cache[page_id] = page_token
                        return page_token
            
            print(f"   ❌ Page {page_id} not found in accessible pages")
            print(f"   ℹ️  Available pages: {[p.get('id') for p in pages]}")
            return None
            
        except Exception as e:
            print(f"   ❌ Exception in /me/accounts: {e}")
            return None
    
    def publish_instagram_reel(
        self,
        video_url: str,
        caption: str = "CHANGE ME",
        thumbnail_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Publish a Reel to Instagram using the two-step process.
        
        Args:
            video_url: Public URL to the video file (must be accessible)
            caption: Caption text for the reel
            thumbnail_url: Optional thumbnail URL
            
        Returns:
            Dict with publish status and Instagram post ID
        """
        if not self.ig_access_token or not self.ig_business_account_id:
            return {
                "success": False,
                "error": "Instagram credentials not configured",
                "platform": "instagram"
            }
        
        try:
            # Step 1: Create media container
            container_url = f"https://graph.facebook.com/{self.api_version}/{self.ig_business_account_id}/media"
            
            print(f"📤 Video URL for Instagram: {video_url}")
            
            container_payload = {
                "media_type": "REELS",
                "video_url": video_url,
                "caption": caption,
                "access_token": self.ig_access_token
            }
            
            # Add thumbnail if provided
            if thumbnail_url:
                container_payload["thumb_offset"] = 0  # Use first frame, or provide custom offset
            
            print(f"📸 Creating Instagram Reel container...")
            container_response = requests.post(container_url, data=container_payload, timeout=30)
            container_data = container_response.json()
            
            if "error" in container_data:
                return {
                    "success": False,
                    "error": container_data["error"].get("message", "Unknown error"),
                    "platform": "instagram",
                    "step": "create_container"
                }
            
            creation_id = container_data.get("id")
            if not creation_id:
                return {
                    "success": False,
                    "error": "No creation ID returned",
                    "platform": "instagram"
                }
            
            print(f"✅ Container created: {creation_id}")
            
            # Step 1.5: Wait for video processing with status checks
            status_url = f"https://graph.facebook.com/{self.api_version}/{creation_id}"
            max_wait_seconds = 180  # Wait up to 3 minutes for processing
            check_interval = 5  # Check every 5 seconds
            waited = 0
            
            print(f"⏳ Waiting for Instagram to process video...")
            while waited < max_wait_seconds:
                status_response = requests.get(
                    status_url,
                    params={"fields": "status_code,status", "access_token": self.ig_access_token},
                    timeout=10
                )
                status_data = status_response.json()
                
                # Check for error in response
                if "error" in status_data:
                    error_msg = status_data["error"].get("message", "Unknown error")
                    print(f"   ❌ Status check error: {error_msg}")
                    return {
                        "success": False,
                        "error": f"Status check failed: {error_msg}",
                        "platform": "instagram",
                        "step": "status_check"
                    }
                
                status_code = status_data.get("status_code")
                status_info = status_data.get("status", "")
                
                print(f"   📊 Status: {status_code} (waited {waited}s) - {status_info}")
                
                if status_code == "FINISHED":
                    print(f"✅ Video processing complete!")
                    break
                elif status_code == "ERROR":
                    print(f"   ❌ Video processing failed! Status info: {status_info}")
                    return {
                        "success": False,
                        "error": f"Instagram video processing failed: {status_info}",
                        "platform": "instagram",
                        "step": "processing",
                        "status_data": status_data
                    }
                elif status_code in ["IN_PROGRESS", "EXPIRED", None]:
                    time.sleep(check_interval)
                    waited += check_interval
                else:
                    # Unknown status, log and continue
                    print(f"   ⚠️ Unknown status: {status_code}")
                    time.sleep(check_interval)
                    waited += check_interval
            
            if waited >= max_wait_seconds:
                return {
                    "success": False,
                    "error": f"Video processing timeout after {max_wait_seconds}s",
                    "platform": "instagram",
                    "step": "processing_timeout",
                    "creation_id": creation_id
                }
            
            # Step 2: Publish the container
            publish_url = f"https://graph.facebook.com/{self.api_version}/{self.ig_business_account_id}/media_publish"
            
            publish_payload = {
                "creation_id": creation_id,
                "access_token": self.ig_access_token
            }
            
            print(f"🚀 Publishing Instagram Reel...")
            publish_response = requests.post(publish_url, data=publish_payload, timeout=30)
            publish_data = publish_response.json()
            
            if "error" in publish_data:
                return {
                    "success": False,
                    "error": publish_data["error"].get("message", "Unknown error"),
                    "platform": "instagram",
                    "step": "publish",
                    "creation_id": creation_id
                }
            
            instagram_post_id = publish_data.get("id")
            
            print(f"🎉 Instagram Reel published! Post ID: {instagram_post_id}")
            
            return {
                "success": True,
                "platform": "instagram",
                "post_id": instagram_post_id,
                "creation_id": creation_id
            }
            
        except requests.exceptions.Timeout:
            return {
                "success": False,
                "error": "Request timed out",
                "platform": "instagram"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "platform": "instagram"
            }
    
    def publish_facebook_reel(
        self,
        video_url: str,
        caption: str = "CHANGE ME",
        thumbnail_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Publish a Reel to Facebook Page using the Reels Publishing API.
        This uses the proper 3-step process: Initialize -> Upload -> Publish.
        
        Args:
            video_url: Public URL to the video file
            caption: Caption text
            thumbnail_url: Optional thumbnail URL
            
        Returns:
            Dict with publish status and Facebook post ID
        """
        if not self._system_user_token or not self.fb_page_id:
            return {
                "success": False,
                "error": "Facebook credentials not configured",
                "platform": "facebook"
            }
        
        try:
            # First, get a Page Access Token (required for Facebook Reels API)
            page_access_token = self._get_page_access_token(self.fb_page_id)
            
            if not page_access_token:
                return {
                    "success": False,
                    "error": "Failed to get Page Access Token. Make sure your System User has access to the page.",
                    "platform": "facebook",
                    "step": "auth"
                }
            
            # Step 1: Initialize upload session
            init_url = f"https://graph.facebook.com/{self.api_version}/{self.fb_page_id}/video_reels"
            
            print(f"📤 Initializing Facebook Reel upload...")
            print(f"   Page ID: {self.fb_page_id}")
            print(f"   Video URL: {video_url}")
            
            init_response = requests.post(
                init_url,
                json={
                    "upload_phase": "start",
                    "access_token": page_access_token
                },
                timeout=30
            )
            init_data = init_response.json()
            
            if "error" in init_data:
                error_msg = init_data["error"].get("message", "Unknown error")
                error_code = init_data["error"].get("code", "")
                print(f"   ❌ Init error: {error_msg} (code: {error_code})")
                return {
                    "success": False,
                    "error": error_msg,
                    "platform": "facebook",
                    "step": "init",
                    "error_code": error_code
                }
            
            video_id = init_data.get("video_id")
            upload_url = init_data.get("upload_url")
            
            if not video_id or not upload_url:
                print(f"   ❌ Missing video_id or upload_url in response: {init_data}")
                return {
                    "success": False,
                    "error": "Failed to initialize upload - missing video_id or upload_url",
                    "platform": "facebook",
                    "step": "init"
                }
            
            print(f"✅ Upload session initialized: {video_id}")
            
            # Step 2: Upload the video using hosted file URL
            print(f"📤 Uploading video to Facebook...")
            
            upload_response = requests.post(
                upload_url,
                headers={
                    "Authorization": f"OAuth {page_access_token}",
                    "file_url": video_url
                },
                timeout=120
            )
            
            # Check if upload was successful
            try:
                upload_data = upload_response.json()
                if "error" in upload_data:
                    error_msg = upload_data["error"].get("message", "Unknown error")
                    print(f"   ❌ Upload error: {error_msg}")
                    return {
                        "success": False,
                        "error": f"Upload failed: {error_msg}",
                        "platform": "facebook",
                        "step": "upload"
                    }
            except:
                # Response might not be JSON
                pass
            
            if upload_response.status_code != 200:
                print(f"   ❌ Upload failed with status {upload_response.status_code}: {upload_response.text}")
                return {
                    "success": False,
                    "error": f"Upload failed with status {upload_response.status_code}",
                    "platform": "facebook",
                    "step": "upload"
                }
            
            print(f"✅ Video uploaded successfully")
            
            # Step 2.5: Wait for video processing
            print(f"⏳ Waiting for Facebook to process video...")
            max_wait = 120
            waited = 0
            check_interval = 5
            
            while waited < max_wait:
                status_response = requests.get(
                    f"https://graph.facebook.com/{self.api_version}/{video_id}",
                    params={
                        "fields": "status",
                        "access_token": page_access_token
                    },
                    timeout=10
                )
                status_data = status_response.json()
                
                if "error" in status_data:
                    print(f"   ⚠️ Status check error, continuing...")
                    time.sleep(check_interval)
                    waited += check_interval
                    continue
                
                status = status_data.get("status", {})
                video_status = status.get("video_status", "")
                processing_status = status.get("processing_phase", {}).get("status", "")
                
                print(f"   📊 Status: {video_status}, Processing: {processing_status} (waited {waited}s)")
                
                if processing_status == "complete" or video_status == "ready":
                    print(f"✅ Video processing complete!")
                    break
                elif processing_status == "error":
                    error_info = status.get("processing_phase", {}).get("error", {})
                    error_msg = error_info.get("message", "Processing error")
                    print(f"   ❌ Processing error: {error_msg}")
                    return {
                        "success": False,
                        "error": f"Video processing failed: {error_msg}",
                        "platform": "facebook",
                        "step": "processing"
                    }
                
                time.sleep(check_interval)
                waited += check_interval
            
            # Step 3: Publish the reel
            print(f"🚀 Publishing Facebook Reel...")
            
            publish_response = requests.post(
                init_url,
                params={
                    "access_token": page_access_token,
                    "video_id": video_id,
                    "upload_phase": "finish",
                    "video_state": "PUBLISHED",
                    "description": caption
                },
                timeout=30
            )
            publish_data = publish_response.json()
            
            if "error" in publish_data:
                error_msg = publish_data["error"].get("message", "Unknown error")
                error_code = publish_data["error"].get("code", "")
                print(f"   ❌ Publish error: {error_msg} (code: {error_code})")
                return {
                    "success": False,
                    "error": error_msg,
                    "platform": "facebook",
                    "step": "publish",
                    "video_id": video_id
                }
            
            print(f"🎉 Facebook Reel published! Video ID: {video_id}")
            
            return {
                "success": True,
                "platform": "facebook",
                "post_id": video_id,
                "video_id": video_id
            }
            
        except requests.exceptions.Timeout:
            return {
                "success": False,
                "error": "Request timed out",
                "platform": "facebook"
            }
        except Exception as e:
            print(f"   ❌ Exception: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "platform": "facebook"
            }
    
    def publish_to_both(
        self,
        video_url: str,
        caption: str = "CHANGE ME",
        thumbnail_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Publish to both Instagram and Facebook.
        
        Args:
            video_url: Public URL to the video file
            caption: Caption text
            thumbnail_url: Optional thumbnail URL
            
        Returns:
            Dict with results from both platforms
        """
        instagram_result = self.publish_instagram_reel(video_url, caption, thumbnail_url)
        facebook_result = self.publish_facebook_reel(video_url, caption, thumbnail_url)
        
        return {
            "instagram": instagram_result,
            "facebook": facebook_result,
            "overall_success": instagram_result.get("success") and facebook_result.get("success")
        }
