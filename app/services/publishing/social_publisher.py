"""
Social media publisher for Instagram and Facebook Reels.
"""
import time
import re
import requests
from typing import Optional, Dict, Any
from pathlib import Path
from app.core.config import BrandConfig


def create_facebook_caption(full_caption: str, max_length: int = 400) -> str:
    """
    Create a short, punchy Facebook caption from the full Instagram caption.
    
    Facebook works better with shorter captions. This function:
    1. Extracts the opening hook/intro paragraph
    2. Adds a simple CTA
    3. Keeps it under max_length characters
    
    Args:
        full_caption: The full Instagram caption
        max_length: Maximum characters for FB caption (default 400)
        
    Returns:
        A condensed Facebook-optimized caption
    """
    if not full_caption or len(full_caption) <= max_length:
        return full_caption
    
    # Split by double newlines to get paragraphs
    paragraphs = full_caption.split('\n\n')
    
    # Get the first paragraph (usually the hook/intro)
    first_para = paragraphs[0].strip() if paragraphs else ""
    
    # If first paragraph is empty or too short, try to get more content
    if len(first_para) < 50 and len(paragraphs) > 1:
        first_para = paragraphs[0].strip() + "\n\n" + paragraphs[1].strip()
    
    # Remove any emoji-starting lines from the first para (those are usually CTAs)
    lines = first_para.split('\n')
    clean_lines = []
    for line in lines:
        # Skip lines that start with emojis (CTA lines)
        if line and not re.match(r'^[\U0001F300-\U0001F9FF\u2600-\u26FF\u2700-\u27BF]', line.strip()):
            clean_lines.append(line)
    
    intro_text = '\n'.join(clean_lines).strip()
    
    # Simple FB CTA
    fb_cta = "\n\n💡 Follow for daily health insights!"
    
    # Calculate available space for intro
    available_space = max_length - len(fb_cta)
    
    # Truncate intro if needed, but at a sentence boundary
    if len(intro_text) > available_space:
        # Try to cut at a sentence boundary
        truncated = intro_text[:available_space]
        
        # Find last sentence ending
        last_period = truncated.rfind('.')
        last_question = truncated.rfind('?')
        last_exclaim = truncated.rfind('!')
        
        cut_point = max(last_period, last_question, last_exclaim)
        
        if cut_point > available_space * 0.5:  # Only use sentence boundary if it's at least half the text
            intro_text = truncated[:cut_point + 1]
        else:
            # Cut at word boundary
            intro_text = truncated[:truncated.rfind(' ')] + "..."
    
    return intro_text + fb_cta


class SocialPublisher:
    """Service for publishing Reels to Instagram and Facebook."""
    
    def __init__(self, brand_config: Optional[BrandConfig] = None):
        """
        Initialize the social publisher with Meta credentials.
        
        Args:
            brand_config: Optional brand configuration with specific credentials.
                         If not provided, uses default environment variables.
        """
        # Use brand-specific credentials if provided; caller is responsible
        # for supplying them (credentials are stored in the DB brands table).
        if brand_config:
            self.ig_business_account_id = brand_config.instagram_business_account_id
            self.fb_page_id = brand_config.facebook_page_id
            self._system_user_token = brand_config.meta_access_token
            self.ig_access_token = brand_config.meta_access_token
        else:
            self._system_user_token = None
            self.ig_access_token = None
            self.ig_business_account_id = None
            self.fb_page_id = None
        
        self.api_version = "v19.0"
        self._page_access_token_cache = {}  # Cache for page access tokens
        
        # Store brand name for debugging
        self.brand_name = brand_config.name if brand_config else "default"
        
        # Debug output to show credential status
        print(f"🏷️ SocialPublisher initialized for: {self.brand_name}")
        print(f"   📸 Instagram Account ID: {self.ig_business_account_id}")
        print(f"   📘 Facebook Page ID: {self.fb_page_id}")
        print(f"   🔑 Token present: {bool(self.ig_access_token)}")
        
        if not self.ig_access_token:
            print("   ⚠️  Warning: Meta access token not found")
        if not self.ig_business_account_id:
            print("   ⚠️  Warning: Instagram Business Account ID not found")
        if not self.fb_page_id:
            print("   ⚠️  Warning: Facebook Page ID not found")
    
    def get_credential_info(self) -> Dict[str, Any]:
        """Get info about credentials being used for debugging."""
        return {
            "brand": self.brand_name,
            "instagram_account_id": self.ig_business_account_id,
            "facebook_page_id": self.fb_page_id,
            "has_token": bool(self.ig_access_token)
        }
    
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
    
    # ==================== IMAGE POST PUBLISHING ====================

    def publish_instagram_image_post(
        self,
        image_url: str,
        caption: str = "CHANGE ME",
    ) -> Dict[str, Any]:
        """
        Publish a single image post to Instagram using the Content Publishing API.
        
        Steps:
        1. Create media container with image_url + caption
        2. Wait for processing (STATUS_CODE == FINISHED)
        3. Publish the container
        
        Args:
            image_url: Public URL to the image file (must be accessible)
            caption: Caption text for the post
            
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
            # Step 1: Create media container for image post
            container_url = f"https://graph.facebook.com/{self.api_version}/{self.ig_business_account_id}/media"
            
            print(f"📤 Image URL for Instagram post: {image_url}")
            print(f"   Instagram Account ID: {self.ig_business_account_id}")
            print(f"   Using IMAGE POST method (not Reels)...")
            
            container_payload = {
                "image_url": image_url,
                "caption": caption,
                "access_token": self.ig_access_token
            }
            
            print(f"📸 Creating Instagram image post container...")
            container_response = requests.post(container_url, data=container_payload, timeout=30)
            container_data = container_response.json()
            
            print(f"   Container response: {container_data}")
            
            if "error" in container_data:
                error_msg = container_data["error"].get("message", "Unknown error")
                error_code = container_data["error"].get("code", "")
                error_subcode = container_data["error"].get("error_subcode", "")
                print(f"   ❌ Container error: {error_msg} (code: {error_code}, subcode: {error_subcode})")
                return {
                    "success": False,
                    "error": error_msg,
                    "platform": "instagram",
                    "step": "create_container",
                    "error_code": error_code,
                    "error_subcode": error_subcode
                }
            
            creation_id = container_data.get("id")
            if not creation_id:
                return {
                    "success": False,
                    "error": "No creation ID returned",
                    "platform": "instagram"
                }
            
            print(f"✅ Container created: {creation_id}")
            
            # Step 2: Wait for processing
            status_url = f"https://graph.facebook.com/{self.api_version}/{creation_id}"
            max_wait_seconds = 60
            check_interval = 3
            waited = 0
            
            print(f"⏳ Waiting for Instagram to process image...")
            while waited < max_wait_seconds:
                status_response = requests.get(
                    status_url,
                    params={"fields": "status_code,status", "access_token": self.ig_access_token},
                    timeout=10
                )
                status_data = status_response.json()
                
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
                print(f"   📊 Status: {status_code} (waited {waited}s)")
                
                if status_code == "FINISHED":
                    print(f"✅ Image processing complete!")
                    break
                elif status_code == "ERROR":
                    return {
                        "success": False,
                        "error": f"Instagram image processing failed: {status_data.get('status', '')}",
                        "platform": "instagram",
                        "step": "processing"
                    }
                
                time.sleep(check_interval)
                waited += check_interval
            
            if waited >= max_wait_seconds:
                return {
                    "success": False,
                    "error": f"Image processing timeout after {max_wait_seconds}s",
                    "platform": "instagram",
                    "step": "processing_timeout",
                    "creation_id": creation_id
                }
            
            # Step 3: Publish the container
            publish_url = f"https://graph.facebook.com/{self.api_version}/{self.ig_business_account_id}/media_publish"
            publish_payload = {
                "creation_id": creation_id,
                "access_token": self.ig_access_token
            }
            
            print(f"🚀 Publishing Instagram image post...")
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
            print(f"🎉 Instagram image post published! Post ID: {instagram_post_id}")
            
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

    def publish_facebook_image_post(
        self,
        image_url: str,
        caption: str = "CHANGE ME",
    ) -> Dict[str, Any]:
        """
        Publish a single image post to a Facebook Page using the Photos API.
        
        Uses: POST /{page_id}/photos with url + message
        
        Args:
            image_url: Public URL to the image file
            caption: Caption text (will be shortened for FB)
            
        Returns:
            Dict with publish status and Facebook post ID
        """
        fb_caption = create_facebook_caption(caption, max_length=400)
        if len(caption) != len(fb_caption):
            print(f"   📝 Facebook caption created: {len(caption)} → {len(fb_caption)} chars")
        
        if not self._system_user_token or not self.fb_page_id:
            return {
                "success": False,
                "error": "Facebook credentials not configured",
                "platform": "facebook"
            }
        
        try:
            # Get Page Access Token (required for posting)
            page_access_token = self._get_page_access_token(self.fb_page_id)
            
            if not page_access_token:
                return {
                    "success": False,
                    "error": "Failed to get Page Access Token",
                    "platform": "facebook",
                    "step": "auth"
                }
            
            # POST /{page_id}/photos with url + message
            photos_url = f"https://graph.facebook.com/{self.api_version}/{self.fb_page_id}/photos"
            
            print(f"📤 Publishing image post to Facebook...")
            print(f"   Page ID: {self.fb_page_id}")
            print(f"   Image URL: {image_url}")
            
            payload = {
                "url": image_url,
                "message": fb_caption,
                "access_token": page_access_token,
                "published": True,
            }
            
            response = requests.post(photos_url, data=payload, timeout=30)
            data = response.json()
            
            print(f"   Response: {data}")
            
            if "error" in data:
                error_msg = data["error"].get("message", "Unknown error")
                error_code = data["error"].get("code", "")
                print(f"   ❌ Publish error: {error_msg} (code: {error_code})")
                return {
                    "success": False,
                    "error": error_msg,
                    "platform": "facebook",
                    "step": "publish",
                    "error_code": error_code
                }
            
            photo_id = data.get("id") or data.get("post_id")
            print(f"🎉 Facebook image post published! Photo ID: {photo_id}")
            
            return {
                "success": True,
                "platform": "facebook",
                "post_id": photo_id,
                "page_id": self.fb_page_id,
                "brand_used": self.brand_name
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

    def publish_image_to_both(
        self,
        image_url: str,
        caption: str = "CHANGE ME",
    ) -> Dict[str, Any]:
        """
        Publish an image post to both Instagram and Facebook.
        """
        instagram_result = self.publish_instagram_image_post(image_url, caption)
        facebook_result = self.publish_facebook_image_post(image_url, caption)
        
        return {
            "instagram": instagram_result,
            "facebook": facebook_result,
            "overall_success": instagram_result.get("success") and facebook_result.get("success")
        }

    # ==================== REEL (VIDEO) PUBLISHING ====================

    def publish_instagram_reel(
        self,
        video_url: str,
        caption: str = "CHANGE ME",
        thumbnail_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Publish a Reel to Instagram using the Resumable Upload process.
        This is more reliable than the standard video_url method.
        
        Steps:
        1. Create resumable upload session (returns container_id + upload uri)
        2. Upload video via file_url header to rupload.facebook.com
        3. Wait for processing
        4. Publish the container
        
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
            # Step 1: Create RESUMABLE upload session (not standard video_url)
            container_url = f"https://graph.facebook.com/{self.api_version}/{self.ig_business_account_id}/media"
            
            print(f"📤 Video URL for Instagram: {video_url}")
            print(f"   Instagram Account ID: {self.ig_business_account_id}")
            print(f"   Using RESUMABLE upload method...")
            
            # Create resumable session - this returns container ID + upload URI
            container_payload = {
                "media_type": "REELS",
                "upload_type": "resumable",  # Key difference: use resumable upload
                "caption": caption,
                "access_token": self.ig_access_token
            }
            
            # Add cover/thumbnail URL if provided
            if thumbnail_url:
                container_payload["cover_url"] = thumbnail_url
                print(f"   🖼️ Cover URL: {thumbnail_url}")
            
            print(f"📸 Creating Instagram Reel resumable container...")
            container_response = requests.post(container_url, data=container_payload, timeout=30)
            container_data = container_response.json()
            
            print(f"   Container response: {container_data}")
            
            if "error" in container_data:
                error_msg = container_data["error"].get("message", "Unknown error")
                error_code = container_data["error"].get("code", "")
                error_subcode = container_data["error"].get("error_subcode", "")
                print(f"   ❌ Container error: {error_msg} (code: {error_code}, subcode: {error_subcode})")
                return {
                    "success": False,
                    "error": error_msg,
                    "platform": "instagram",
                    "step": "create_container",
                    "error_code": error_code,
                    "error_subcode": error_subcode
                }
            
            creation_id = container_data.get("id")
            upload_uri = container_data.get("uri")
            
            if not creation_id:
                return {
                    "success": False,
                    "error": "No creation ID returned",
                    "platform": "instagram"
                }
            
            if not upload_uri:
                # Fallback: construct upload URI manually
                upload_uri = f"https://rupload.facebook.com/ig-api-upload/{self.api_version}/{creation_id}"
                print(f"   ⚠️ No URI in response, constructed: {upload_uri}")
            
            print(f"✅ Container created: {creation_id}")
            print(f"   Upload URI: {upload_uri}")
            
            # Step 2: Upload video via hosted URL using rupload.facebook.com
            print(f"📤 Uploading video to Instagram via rupload...")
            
            upload_headers = {
                "Authorization": f"OAuth {self.ig_access_token}",
                "file_url": video_url
            }
            
            print(f"   Headers: Authorization=OAuth [hidden], file_url={video_url}")
            
            upload_response = requests.post(
                upload_uri,
                headers=upload_headers,
                timeout=120
            )
            
            print(f"   Upload response status: {upload_response.status_code}")
            print(f"   Upload response body: {upload_response.text[:500] if upload_response.text else 'empty'}")
            
            # Check upload response
            try:
                upload_data = upload_response.json()
                if "error" in upload_data:
                    error_msg = upload_data["error"].get("message", "Unknown error")
                    print(f"   ❌ Upload error: {error_msg}")
                    return {
                        "success": False,
                        "error": f"Upload failed: {error_msg}",
                        "platform": "instagram",
                        "step": "upload"
                    }
                if upload_data.get("success") == True:
                    print(f"   ✅ Upload confirmed successful")
            except Exception as json_err:
                print(f"   ⚠️ Could not parse upload response as JSON: {json_err}")
            
            if upload_response.status_code != 200:
                print(f"   ❌ Upload failed with status {upload_response.status_code}")
                return {
                    "success": False,
                    "error": f"Upload failed with status {upload_response.status_code}: {upload_response.text[:200]}",
                    "platform": "instagram",
                    "step": "upload"
                }
            
            print(f"✅ Video uploaded successfully")
            
            # Step 3: Wait for video processing with status checks
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
            
            # Step 4: Publish the container
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
        
        Note: Facebook gets a custom short caption (max 400 chars) optimized for the platform.
        Instagram uses the full caption with all details.
        
        Args:
            video_url: Public URL to the video file
            caption: Full caption text (will be shortened for FB)
            thumbnail_url: Optional thumbnail URL
            
        Returns:
            Dict with publish status and Facebook post ID
        """
        # Create a Facebook-optimized short caption
        fb_caption = create_facebook_caption(caption, max_length=400)
        if len(caption) != len(fb_caption):
            print(f"   📝 Facebook caption created: {len(caption)} → {len(fb_caption)} chars")
        
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
            print(f"   Upload URL: {upload_url}")
            
            # Step 2: Upload the video using hosted file URL
            # According to FB docs: POST to rupload.facebook.com with file_url header
            print(f"📤 Uploading video to Facebook...")
            
            # Build the correct upload URL format: https://rupload.facebook.com/video-upload/{api_version}/{video_id}
            # Sometimes the returned URL might not include the version, so we construct it
            if "rupload.facebook.com" in upload_url:
                # Use the URL as-is if it's the rupload URL
                actual_upload_url = upload_url
            else:
                # Construct it manually
                actual_upload_url = f"https://rupload.facebook.com/video-upload/{self.api_version}/{video_id}"
            
            print(f"   Upload URL: {actual_upload_url}")
            
            # Headers for hosted file upload (exactly as per FB docs)
            upload_headers = {
                "Authorization": f"OAuth {page_access_token}",
                "file_url": video_url
            }
            
            print(f"   Headers: Authorization=OAuth [hidden], file_url={video_url}")
            
            upload_response = requests.post(
                actual_upload_url,
                headers=upload_headers,
                timeout=120
            )
            
            print(f"   Response status: {upload_response.status_code}")
            print(f"   Response body: {upload_response.text[:500] if upload_response.text else 'empty'}")
            
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
                # Check for success field
                if upload_data.get("success") == True:
                    print(f"   ✅ Upload confirmed successful")
            except Exception as json_err:
                # Response might not be JSON
                print(f"   ⚠️ Could not parse response as JSON: {json_err}")
            
            if upload_response.status_code != 200:
                print(f"   ❌ Upload failed with status {upload_response.status_code}: {upload_response.text}")
                return {
                    "success": False,
                    "error": f"Upload failed with status {upload_response.status_code}",
                    "platform": "facebook",
                    "step": "upload"
                }
            
            print(f"✅ Video uploaded successfully")
            
            # Step 2.5: Wait for video processing (but don't wait too long - FB sometimes doesn't update status)
            print(f"⏳ Waiting for Facebook to process video...")
            max_wait = 60  # Reduced wait - FB processing can be slow to report
            waited = 0
            check_interval = 5
            last_status = ""
            
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
                uploading_phase = status.get("uploading_phase", {}).get("status", "")
                processing_phase = status.get("processing_phase", {}).get("status", "")
                publishing_phase = status.get("publishing_phase", {}).get("status", "")
                
                current_status = f"{video_status}|{uploading_phase}|{processing_phase}|{publishing_phase}"
                if current_status != last_status:
                    print(f"   📊 Status: video={video_status}, upload={uploading_phase}, process={processing_phase}, publish={publishing_phase} (waited {waited}s)")
                    last_status = current_status
                
                # If upload is complete, try to publish regardless of processing status
                if uploading_phase == "complete" or video_status == "upload_complete":
                    print(f"✅ Upload confirmed complete, proceeding to publish...")
                    break
                
                if processing_phase == "complete" or video_status == "ready":
                    print(f"✅ Video processing complete!")
                    break
                elif processing_phase == "error":
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
                    "description": fb_caption
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
                "video_id": video_id,
                "page_id": self.fb_page_id,
                "brand_used": self.brand_name
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
