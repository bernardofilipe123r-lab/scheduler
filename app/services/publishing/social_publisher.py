"""
Social media publisher for Instagram and Facebook Reels.
"""
import io
import tempfile
import time
import re
import requests
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
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
    fb_cta = "\n\n💡 Follow for more content like this!"
    
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
            # Instagram token (from Instagram Business Login via graph.instagram.com)
            self.ig_access_token = brand_config.meta_access_token
            # Facebook page token (from Facebook Login — a long-lived page token)
            self._system_user_token = brand_config.facebook_access_token or brand_config.meta_access_token
            # Threads
            self.threads_access_token = brand_config.threads_access_token
            self.threads_user_id = brand_config.threads_user_id
            # TikTok
            self.tiktok_access_token = brand_config.tiktok_access_token
            self.tiktok_refresh_token = brand_config.tiktok_refresh_token
            self.tiktok_open_id = brand_config.tiktok_open_id
        else:
            self._system_user_token = None
            self.ig_access_token = None
            self.ig_business_account_id = None
            self.fb_page_id = None
            self.threads_access_token = None
            self.threads_user_id = None
            self.tiktok_access_token = None
            self.tiktok_refresh_token = None
            self.tiktok_open_id = None
        
        self.api_version = "v21.0"
        # Instagram Business Login tokens must use graph.instagram.com;
        # Facebook page operations keep using graph.facebook.com.
        self.ig_graph_base = "https://graph.instagram.com"
        self.fb_graph_base = "https://graph.facebook.com"
        self._page_access_token_cache = {}  # Cache for page access tokens
        
        # If we already have a dedicated Facebook page token, pre-cache it
        # so _get_page_access_token() skips the network round-trip.
        if brand_config and brand_config.facebook_access_token and brand_config.facebook_page_id:
            self._page_access_token_cache[brand_config.facebook_page_id] = brand_config.facebook_access_token
        
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

    def _try_refresh_ig_token(self) -> bool:
        """
        Attempt to refresh the Instagram long-lived token and persist
        the new token back to the DB.  Returns True on success.
        """
        if not self.ig_access_token:
            return False

        try:
            from app.services.publishing.ig_token_service import InstagramTokenService
            svc = InstagramTokenService()
            result = svc.refresh_long_lived_token(self.ig_access_token)
            new_token = result.get("access_token")
            if not new_token:
                print("   ⚠️ Token refresh returned no new token")
                return False

            # Update in-memory token so the current publish call succeeds
            self.ig_access_token = new_token

            # Persist to DB
            from app.db_connection import SessionLocal
            from app.models.brands import Brand
            db = SessionLocal()
            try:
                brand = db.query(Brand).filter(Brand.id == self.brand_name).first()
                if brand:
                    brand.instagram_access_token = new_token
                    brand.meta_access_token = new_token
                    db.commit()
                    print(f"   🔑 Refreshed & stored new IG token for {self.brand_name}")
                else:
                    print(f"   ⚠️ Could not find brand {self.brand_name} to persist token")
            finally:
                db.close()

            return True
        except Exception as e:
            print(f"   ❌ Token refresh failed: {e}")
            return False

    def _ensure_jpeg_urls(self, image_urls: list[str]) -> list[str]:
        """Convert any PNG image URLs to JPEG for Instagram compatibility.

        Instagram's Content Publishing API works best with JPEG format for
        carousel items.  If a URL ends with ``.png``, first check if a JPEG
        version already exists (from pre-rendering).  If not, download the
        PNG, convert to RGB JPEG, re-upload to Supabase, and return the new URL.
        URLs that already point to JPEG files are left untouched.
        """
        result = []
        for url in image_urls:
            if not url.lower().endswith(".png"):
                result.append(url)
                continue

            try:
                from app.services.storage.supabase_storage import upload_file

                # Check if a pre-rendered JPEG version already exists
                jpeg_url_candidate = url.rsplit(".", 1)[0] + ".jpg"
                head_resp = requests.head(jpeg_url_candidate, timeout=10)
                if head_resp.status_code == 200:
                    print(f"   ✅ JPEG already exists: {jpeg_url_candidate.split('/')[-1]}")
                    result.append(jpeg_url_candidate)
                    continue

                from PIL import Image as _PILImage

                print(f"   🔄 Converting PNG→JPEG: {url.split('/')[-1]}")
                resp = requests.get(url, timeout=60)
                resp.raise_for_status()

                img = _PILImage.open(io.BytesIO(resp.content))
                if img.mode == "RGBA":
                    bg = _PILImage.new("RGB", img.size, (255, 255, 255))
                    bg.paste(img, mask=img.split()[3])
                    img = bg
                elif img.mode != "RGB":
                    img = img.convert("RGB")

                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=92, optimize=True)
                jpeg_bytes = buf.getvalue()

                # Derive remote path from the original Supabase URL
                # URL pattern: .../storage/v1/object/public/media/<remote_path>.png
                parts = url.split("/storage/v1/object/public/media/", 1)
                if len(parts) == 2:
                    remote_path = parts[1].rsplit(".", 1)[0] + ".jpg"
                    jpeg_url = upload_file("media", remote_path, jpeg_bytes, content_type="image/jpeg")
                    print(f"   ✅ Converted: {remote_path}")
                    result.append(jpeg_url)
                else:
                    print(f"   ⚠️ Could not parse Supabase path from URL, using original PNG")
                    result.append(url)
            except Exception as exc:
                print(f"   ⚠️ PNG→JPEG conversion failed ({exc}), using original PNG")
                result.append(url)
        return result

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
    
    def _get_instagram_permalink(self, media_id: str) -> Optional[str]:
        """Fetch the permalink for an Instagram media post via the Graph API."""
        if not media_id or not self.ig_access_token:
            return None
        try:
            resp = requests.get(
                f"{self.ig_graph_base}/{self.api_version}/{media_id}",
                params={"fields": "permalink", "access_token": self.ig_access_token},
                timeout=10,
            )
            data = resp.json()
            return data.get("permalink")
        except Exception:
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
            container_url = f"{self.ig_graph_base}/{self.api_version}/{self.ig_business_account_id}/media"
            
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

                # If token is expired/invalid, try to refresh it once
                if "access token" in error_msg.lower() or error_code in (190, "190"):
                    refreshed = self._try_refresh_ig_token()
                    if refreshed:
                        container_payload["access_token"] = self.ig_access_token
                        print(f"   🔄 Retrying image post with refreshed token...")
                        retry_resp = requests.post(container_url, data=container_payload, timeout=30)
                        container_data = retry_resp.json()
                        if "error" not in container_data:
                            print(f"   ✅ Retry succeeded after token refresh")
                        else:
                            retry_err = container_data["error"].get("message", "Unknown")
                            return {
                                "success": False,
                                "error": f"Token refresh succeeded but retry failed: {retry_err}",
                                "platform": "instagram",
                                "step": "create_container",
                            }
                    else:
                        return {
                            "success": False,
                            "error": error_msg,
                            "platform": "instagram",
                            "step": "create_container",
                            "error_code": error_code,
                            "error_subcode": error_subcode,
                            "hint": "Instagram token expired. Please reconnect Instagram in Brands > Connections."
                        }
                else:
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
            status_url = f"{self.ig_graph_base}/{self.api_version}/{creation_id}"
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
            publish_url = f"{self.ig_graph_base}/{self.api_version}/{self.ig_business_account_id}/media_publish"
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
            
            permalink = self._get_instagram_permalink(instagram_post_id)
            return {
                "success": True,
                "platform": "instagram",
                "post_id": instagram_post_id,
                "creation_id": creation_id,
                "url": permalink,
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
                "brand_used": self.brand_name,
                "url": f"https://www.facebook.com/{photo_id}" if photo_id else None,
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

    # ==================== CAROUSEL PUBLISHING ====================

    def publish_instagram_carousel(
        self,
        image_urls: list[str],
        caption: str = "CHANGE ME",
    ) -> Dict[str, Any]:
        """
        Publish a carousel post to Instagram using the Content Publishing API.

        Steps:
        1. Create a container for each image with is_carousel_item=true
        2. Wait for each item to finish processing
        3. Create carousel container with children IDs
        4. Publish the carousel container

        Args:
            image_urls: List of public HTTPS URLs for carousel images (2-10)
            caption: Caption text for the post

        Returns:
            Dict with publish status and Instagram post ID
        """
        if not self.ig_access_token or not self.ig_business_account_id:
            return {
                "success": False,
                "error": "Instagram credentials not configured",
                "platform": "instagram",
            }

        if len(image_urls) < 2:
            # Carousels require at least 2 items; fall back to single image
            return self.publish_instagram_image_post(
                image_url=image_urls[0], caption=caption
            )

        if len(image_urls) > 10:
            image_urls = image_urls[:10]  # Instagram max 10 carousel items

        # Instagram carousel API requires JPEG format. Convert any PNG URLs
        # to JPEG on-the-fly (covers existing scheduled posts with PNG images).
        image_urls = self._ensure_jpeg_urls(image_urls)

        try:
            container_url = (
                f"{self.ig_graph_base}/{self.api_version}"
                f"/{self.ig_business_account_id}/media"
            )

            # Step 1: Create a container for each carousel item
            children_ids = []
            for idx, url in enumerate(image_urls):
                print(f"   📸 Creating carousel item {idx + 1}/{len(image_urls)}: {url}")

                # Add delay between item creation calls to avoid Instagram rate limiting
                if idx > 0:
                    time.sleep(2)

                item_data = None
                last_error_msg = ""
                max_retries = 3
                for attempt in range(max_retries):
                    item_resp = requests.post(
                        container_url,
                        data={
                            "image_url": url,
                            "is_carousel_item": "true",
                            "access_token": self.ig_access_token,
                        },
                        timeout=30,
                    )
                    item_data = item_resp.json()

                    if "error" not in item_data:
                        break  # Success

                    last_error_msg = item_data["error"].get("message", "Unknown error")
                    error_code = item_data["error"].get("code", "")

                    # On first item, first attempt: try token refresh for auth errors
                    if idx == 0 and attempt == 0 and ("access token" in last_error_msg.lower() or error_code in (190, "190")):
                        refreshed = self._try_refresh_ig_token()
                        if refreshed:
                            print(f"   🔄 Refreshed token, retrying...")
                            continue
                        else:
                            return {
                                "success": False,
                                "error": f"Carousel item {idx + 1} failed: {last_error_msg}",
                                "platform": "instagram",
                                "step": "create_item",
                                "hint": "Instagram token expired. Please reconnect Instagram in Brands > Connections."
                            }

                    # For transient errors ("unexpected error", server errors), retry with backoff
                    if attempt < max_retries - 1 and ("unexpected" in last_error_msg.lower() or "retry" in last_error_msg.lower() or error_code in (2, "2")):
                        wait_time = (attempt + 1) * 3
                        print(f"   ⏳ Carousel item {idx + 1} attempt {attempt + 1} failed: {last_error_msg}. Retrying in {wait_time}s...")
                        time.sleep(wait_time)
                        continue

                    # Non-transient error — stop retrying
                    break

                if "error" in item_data:
                    print(f"   ❌ Carousel item {idx + 1} failed after {max_retries} attempts: {last_error_msg}")
                    return {
                        "success": False,
                        "error": f"Carousel item {idx + 1} failed: {last_error_msg}",
                        "platform": "instagram",
                        "step": "create_item",
                    }

                item_id = item_data.get("id")
                if not item_id:
                    return {
                        "success": False,
                        "error": f"No ID returned for carousel item {idx + 1}",
                        "platform": "instagram",
                    }

                children_ids.append(item_id)
                print(f"   ✅ Carousel item {idx + 1} created: {item_id}")

            # Step 2: Wait for all items to finish processing
            print(f"   ⏳ Waiting for {len(children_ids)} carousel items to process...")
            for item_id in children_ids:
                status_url = f"{self.ig_graph_base}/{self.api_version}/{item_id}"
                max_wait = 60
                waited = 0
                while waited < max_wait:
                    sr = requests.get(
                        status_url,
                        params={
                            "fields": "status_code",
                            "access_token": self.ig_access_token,
                        },
                        timeout=10,
                    )
                    sc = sr.json().get("status_code")
                    if sc == "FINISHED":
                        break
                    elif sc == "ERROR":
                        return {
                            "success": False,
                            "error": f"Carousel item {item_id} processing failed",
                            "platform": "instagram",
                            "step": "item_processing",
                        }
                    time.sleep(3)
                    waited += 3
                if waited >= max_wait:
                    return {
                        "success": False,
                        "error": f"Carousel item {item_id} processing timeout",
                        "platform": "instagram",
                        "step": "item_processing_timeout",
                    }

            print("   ✅ All carousel items processed")

            # Step 3: Create carousel container
            print(
                f"   📚 Creating carousel container with "
                f"{len(children_ids)} children..."
            )
            carousel_resp = requests.post(
                container_url,
                data={
                    "media_type": "CAROUSEL",
                    "children": ",".join(children_ids),
                    "caption": caption,
                    "access_token": self.ig_access_token,
                },
                timeout=30,
            )
            carousel_data = carousel_resp.json()

            if "error" in carousel_data:
                error_msg = carousel_data["error"].get("message", "Unknown error")
                print(f"   ❌ Carousel container error: {error_msg}")
                return {
                    "success": False,
                    "error": f"Carousel container failed: {error_msg}",
                    "platform": "instagram",
                    "step": "create_carousel",
                }

            carousel_id = carousel_data.get("id")
            if not carousel_id:
                return {
                    "success": False,
                    "error": "No carousel container ID returned",
                    "platform": "instagram",
                }

            print(f"   ✅ Carousel container created: {carousel_id}")

            # Wait for carousel container to finish processing
            status_url = f"{self.ig_graph_base}/{self.api_version}/{carousel_id}"
            max_wait = 60
            waited = 0
            while waited < max_wait:
                sr = requests.get(
                    status_url,
                    params={
                        "fields": "status_code",
                        "access_token": self.ig_access_token,
                    },
                    timeout=10,
                )
                sc = sr.json().get("status_code")
                if sc == "FINISHED":
                    break
                elif sc == "ERROR":
                    return {
                        "success": False,
                        "error": "Carousel container processing failed",
                        "platform": "instagram",
                        "step": "carousel_processing",
                    }
                time.sleep(3)
                waited += 3

            # Step 4: Publish
            publish_url = (
                f"{self.ig_graph_base}/{self.api_version}"
                f"/{self.ig_business_account_id}/media_publish"
            )
            print("   🚀 Publishing Instagram carousel...")
            publish_resp = requests.post(
                publish_url,
                data={
                    "creation_id": carousel_id,
                    "access_token": self.ig_access_token,
                },
                timeout=30,
            )
            publish_data = publish_resp.json()

            if "error" in publish_data:
                return {
                    "success": False,
                    "error": publish_data["error"].get("message", "Unknown error"),
                    "platform": "instagram",
                    "step": "publish",
                    "creation_id": carousel_id,
                }

            post_id = publish_data.get("id")
            print(f"   🎉 Instagram carousel published! Post ID: {post_id}")

            permalink = self._get_instagram_permalink(post_id)
            return {
                "success": True,
                "platform": "instagram",
                "post_id": post_id,
                "creation_id": carousel_id,
                "carousel_items": len(children_ids),
                "url": permalink,
            }

        except requests.exceptions.Timeout:
            return {
                "success": False,
                "error": "Request timed out",
                "platform": "instagram",
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "platform": "instagram",
            }

    def publish_facebook_carousel(
        self,
        image_urls: list[str],
        caption: str = "CHANGE ME",
    ) -> Dict[str, Any]:
        """
        Publish a multi-photo (carousel) post to a Facebook Page.

        Steps:
        1. Upload each photo as unpublished: POST /{page_id}/photos
        2. Create a feed post with attached_media referencing all photos

        Args:
            image_urls: List of public HTTPS URLs for carousel images
            caption: Caption text (will be shortened for Facebook)

        Returns:
            Dict with publish status and Facebook post ID
        """
        fb_caption = create_facebook_caption(caption, max_length=400)

        if not self._system_user_token or not self.fb_page_id:
            return {
                "success": False,
                "error": "Facebook credentials not configured",
                "platform": "facebook",
            }

        if len(image_urls) < 2:
            return self.publish_facebook_image_post(
                image_url=image_urls[0], caption=caption
            )

        try:
            page_access_token = self._get_page_access_token(self.fb_page_id)
            if not page_access_token:
                return {
                    "success": False,
                    "error": "Failed to get Page Access Token",
                    "platform": "facebook",
                    "step": "auth",
                }

            # Step 1: Upload each photo as unpublished
            photo_ids = []
            photos_url = (
                f"https://graph.facebook.com/{self.api_version}"
                f"/{self.fb_page_id}/photos"
            )

            for idx, url in enumerate(image_urls):
                print(
                    f"   📘 Uploading FB carousel photo "
                    f"{idx + 1}/{len(image_urls)}: {url}"
                )

                resp = requests.post(
                    photos_url,
                    data={
                        "url": url,
                        "published": "false",
                        "access_token": page_access_token,
                    },
                    timeout=30,
                )
                data = resp.json()

                if "error" in data:
                    error_msg = data["error"].get("message", "Unknown error")
                    print(f"   ❌ FB photo {idx + 1} upload failed: {error_msg}")
                    return {
                        "success": False,
                        "error": f"FB carousel photo {idx + 1} failed: {error_msg}",
                        "platform": "facebook",
                        "step": "upload_photo",
                    }

                photo_id = data.get("id")
                if not photo_id:
                    return {
                        "success": False,
                        "error": f"No ID returned for FB photo {idx + 1}",
                        "platform": "facebook",
                    }

                photo_ids.append(photo_id)
                print(f"   ✅ FB photo {idx + 1} uploaded: {photo_id}")

            # Step 2: Create feed post with attached_media
            feed_url = (
                f"https://graph.facebook.com/{self.api_version}"
                f"/{self.fb_page_id}/feed"
            )

            post_data = {
                "message": fb_caption,
                "access_token": page_access_token,
            }
            for i, pid in enumerate(photo_ids):
                post_data[f"attached_media[{i}]"] = f'{{"media_fbid":"{pid}"}}'

            print(f"   🚀 Publishing Facebook carousel with {len(photo_ids)} photos...")
            resp = requests.post(feed_url, data=post_data, timeout=30)
            data = resp.json()

            if "error" in data:
                error_msg = data["error"].get("message", "Unknown error")
                print(f"   ❌ FB carousel publish failed: {error_msg}")
                return {
                    "success": False,
                    "error": error_msg,
                    "platform": "facebook",
                    "step": "publish",
                }

            post_id = data.get("id")
            print(f"   🎉 Facebook carousel published! Post ID: {post_id}")

            return {
                "success": True,
                "platform": "facebook",
                "post_id": post_id,
                "page_id": self.fb_page_id,
                "brand_used": self.brand_name,
                "carousel_items": len(photo_ids),
                "url": f"https://www.facebook.com/{post_id}" if post_id else None,
            }

        except requests.exceptions.Timeout:
            return {
                "success": False,
                "error": "Request timed out",
                "platform": "facebook",
            }
        except Exception as e:
            print(f"   ❌ Exception: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "platform": "facebook",
            }

    # ==================== REEL (VIDEO) PUBLISHING ====================

    def publish_instagram_reel(
        self,
        video_url: str,
        caption: str = "CHANGE ME",
        thumbnail_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Publish a Reel to Instagram using the video_url method.
        Instagram fetches the video from the URL directly — no rupload step.
        
        Steps:
        1. Create media container with video_url
        2. Wait for processing (status_code == FINISHED)
        3. Publish the container
        
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
            # Step 1: Create media container (Instagram fetches video from video_url)
            container_url = f"{self.ig_graph_base}/{self.api_version}/{self.ig_business_account_id}/media"
            
            print(f"📤 Video URL for Instagram: {video_url}")
            print(f"   Instagram Account ID: {self.ig_business_account_id}")
            print(f"   Using video_url method (Instagram fetches video directly)...")
            
            container_payload = {
                "media_type": "REELS",
                "video_url": video_url,
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

                # If token is expired/invalid, try to refresh it once
                if "access token" in error_msg.lower() or error_code in (190, "190"):
                    refreshed = self._try_refresh_ig_token()
                    if refreshed:
                        container_payload["access_token"] = self.ig_access_token
                        print(f"   🔄 Retrying with refreshed token...")
                        retry_resp = requests.post(container_url, data=container_payload, timeout=30)
                        container_data = retry_resp.json()
                        if "error" not in container_data:
                            print(f"   ✅ Retry succeeded after token refresh")
                        else:
                            retry_err = container_data["error"].get("message", "Unknown")
                            return {
                                "success": False,
                                "error": f"Token refresh succeeded but retry failed: {retry_err}",
                                "platform": "instagram",
                                "step": "create_container",
                            }
                    else:
                        return {
                            "success": False,
                            "error": error_msg,
                            "platform": "instagram",
                            "step": "create_container",
                            "error_code": error_code,
                            "error_subcode": error_subcode,
                            "hint": "Instagram token expired. Please reconnect Instagram in Brands > Connections."
                        }
                else:
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
            
            # Step 2: Wait for video processing with status checks
            status_url = f"{self.ig_graph_base}/{self.api_version}/{creation_id}"
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
            
            # Step 3: Publish the container
            publish_url = f"{self.ig_graph_base}/{self.api_version}/{self.ig_business_account_id}/media_publish"
            
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
            
            permalink = self._get_instagram_permalink(instagram_post_id)
            return {
                "success": True,
                "platform": "instagram",
                "post_id": instagram_post_id,
                "creation_id": creation_id,
                "url": permalink,
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
                "brand_used": self.brand_name,
                "url": f"https://www.facebook.com/reel/{video_id}" if video_id else None,
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

    # =========================================================================
    #  Threads Publishing
    # =========================================================================

    def _proactive_refresh_threads_token(self) -> Optional[str]:
        """Refresh Threads long-lived token if stale (>6h or expiring within 5 days)."""
        if not self.threads_access_token:
            return None
        try:
            from app.db_connection import SessionLocal
            from app.models.brands import Brand
            from app.services.publishing.threads_token_service import ThreadsTokenService
            from datetime import timedelta

            db = SessionLocal()
            try:
                brand = db.query(Brand).filter(Brand.id == self.brand_name).first()
                if not brand or not brand.threads_access_token:
                    return None

                now = datetime.now(timezone.utc)
                needs_refresh = False

                last_refreshed = brand.threads_token_last_refreshed_at
                if last_refreshed:
                    if last_refreshed.tzinfo is None:
                        last_refreshed = last_refreshed.replace(tzinfo=timezone.utc)
                    needs_refresh = (now - last_refreshed).total_seconds() / 3600 >= 6
                else:
                    needs_refresh = True

                expires_at = brand.threads_token_expires_at
                if expires_at and not needs_refresh:
                    if expires_at.tzinfo is None:
                        expires_at = expires_at.replace(tzinfo=timezone.utc)
                    if (expires_at - now).days <= 5:
                        needs_refresh = True

                if not needs_refresh:
                    return None

                svc = ThreadsTokenService()
                result = svc.refresh_long_lived_token(brand.threads_access_token)
                new_token = result.get("access_token")
                expires_in = result.get("expires_in", 5184000)

                if new_token:
                    brand.threads_access_token = new_token
                    brand.threads_token_expires_at = now + timedelta(seconds=expires_in)
                    brand.threads_token_last_refreshed_at = now
                    db.commit()
                    self.threads_access_token = new_token
                    print(f"   🔑 Refreshed Threads token for {self.brand_name}", flush=True)
                    return new_token
            finally:
                db.close()
        except Exception as e:
            print(f"   ⚠️ Threads token refresh failed: {e}", flush=True)
        return None

    def publish_threads_post(
        self,
        caption: str,
        media_url: Optional[str] = None,
        media_type: str = "TEXT",
    ) -> Dict[str, Any]:
        """
        Publish a post to Threads (text-first, optional media).

        Two-step flow:
          1. Create media container  POST /{user_id}/threads
          2. Publish container       POST /{user_id}/threads_publish

        For VIDEO media, we poll the container status before step 2.

        Args:
            caption: Post text (required — Threads is text-first)
            media_url: Optional public URL to image or video
            media_type: "TEXT", "IMAGE", or "VIDEO"

        Returns:
            Dict with success, post_id, platform
        """
        if not self.threads_access_token or not self.threads_user_id:
            return {
                "success": False,
                "error": "Threads credentials not configured",
                "platform": "threads",
            }

        # Proactively refresh if stale
        self._proactive_refresh_threads_token()

        threads_api = "https://graph.threads.net/v21.0"

        try:
            # Step 1: Create media container
            container_data = {
                "text": caption,
                "access_token": self.threads_access_token,
            }
            if media_url and media_type == "IMAGE":
                container_data["media_type"] = "IMAGE"
                container_data["image_url"] = media_url
            elif media_url and media_type == "VIDEO":
                container_data["media_type"] = "VIDEO"
                container_data["video_url"] = media_url
            else:
                container_data["media_type"] = "TEXT"

            print(f"   🧵 Threads: Creating container (type={container_data['media_type']})...", flush=True)

            resp = requests.post(
                f"{threads_api}/{self.threads_user_id}/threads",
                data=container_data,
                timeout=30,
            )
            resp.raise_for_status()
            creation_id = resp.json().get("id")
            if not creation_id:
                return {
                    "success": False,
                    "error": f"Threads container creation returned no ID: {resp.text}",
                    "platform": "threads",
                }

            # Step 2: Poll for VIDEO processing
            if media_type == "VIDEO":
                self._poll_threads_container(creation_id, threads_api)

            # Step 3: Publish
            print(f"   🧵 Threads: Publishing container {creation_id}...", flush=True)
            pub_resp = requests.post(
                f"{threads_api}/{self.threads_user_id}/threads_publish",
                data={
                    "creation_id": creation_id,
                    "access_token": self.threads_access_token,
                },
                timeout=30,
            )
            pub_resp.raise_for_status()
            thread_id = pub_resp.json().get("id")

            print(f"   ✅ Threads: Published thread {thread_id}", flush=True)
            return {
                "success": True,
                "post_id": thread_id,
                "platform": "threads",
                "brand_used": self.brand_name,
            }

        except requests.exceptions.HTTPError as e:
            error_body = ""
            if e.response is not None:
                try:
                    error_body = e.response.json()
                except Exception:
                    error_body = e.response.text[:500]
            error_msg = f"Threads API error: {e} — {error_body}"
            print(f"   ❌ {error_msg}", flush=True)
            return {"success": False, "error": error_msg, "platform": "threads"}
        except Exception as e:
            error_msg = f"Threads publish failed: {e}"
            print(f"   ❌ {error_msg}", flush=True)
            return {"success": False, "error": error_msg, "platform": "threads"}

    def _poll_threads_container(self, creation_id: str, api_base: str, timeout_s: int = 120):
        """Poll until Threads media container is FINISHED processing."""
        import time as _time
        deadline = _time.monotonic() + timeout_s
        while _time.monotonic() < deadline:
            resp = requests.get(
                f"{api_base}/{creation_id}",
                params={
                    "fields": "status,error_message",
                    "access_token": self.threads_access_token,
                },
                timeout=30,
            )
            data = resp.json()
            status = data.get("status")
            if status == "FINISHED":
                return
            if status == "ERROR":
                raise RuntimeError(f"Threads media processing failed: {data.get('error_message', data)}")
            _time.sleep(5)
        raise TimeoutError("Threads media container processing timed out")

    def publish_threads_carousel(
        self,
        caption: str,
        image_urls: list,
    ) -> Dict[str, Any]:
        """
        Publish a carousel post to Threads (up to 10 images).

        Three-step flow:
          1. Create child containers for each image
          2. Create carousel container referencing children
          3. Publish the carousel container

        Args:
            caption: Post text
            image_urls: List of public image URLs (2-10)

        Returns:
            Dict with success, post_id, platform
        """
        if not self.threads_access_token or not self.threads_user_id:
            return {
                "success": False,
                "error": "Threads credentials not configured",
                "platform": "threads",
            }

        if len(image_urls) < 2 or len(image_urls) > 10:
            return {
                "success": False,
                "error": f"Threads carousels require 2-10 items, got {len(image_urls)}",
                "platform": "threads",
            }

        self._proactive_refresh_threads_token()
        threads_api = "https://graph.threads.net/v21.0"

        try:
            # Step 1: Create child containers
            child_ids = []
            for i, url in enumerate(image_urls):
                print(f"   🧵 Threads carousel: Creating child {i+1}/{len(image_urls)}...", flush=True)
                resp = requests.post(
                    f"{threads_api}/{self.threads_user_id}/threads",
                    data={
                        "media_type": "IMAGE",
                        "image_url": url,
                        "is_carousel_item": "true",
                        "access_token": self.threads_access_token,
                    },
                    timeout=30,
                )
                resp.raise_for_status()
                child_id = resp.json().get("id")
                if not child_id:
                    return {
                        "success": False,
                        "error": f"Threads child container {i+1} returned no ID",
                        "platform": "threads",
                    }
                child_ids.append(child_id)

            # Step 2: Create carousel container
            print(f"   🧵 Threads carousel: Creating carousel container...", flush=True)
            resp = requests.post(
                f"{threads_api}/{self.threads_user_id}/threads",
                data={
                    "media_type": "CAROUSEL",
                    "children": ",".join(child_ids),
                    "text": caption,
                    "access_token": self.threads_access_token,
                },
                timeout=30,
            )
            resp.raise_for_status()
            carousel_id = resp.json().get("id")

            # Step 3: Publish
            print(f"   🧵 Threads carousel: Publishing...", flush=True)
            pub_resp = requests.post(
                f"{threads_api}/{self.threads_user_id}/threads_publish",
                data={
                    "creation_id": carousel_id,
                    "access_token": self.threads_access_token,
                },
                timeout=30,
            )
            pub_resp.raise_for_status()
            thread_id = pub_resp.json().get("id")

            print(f"   ✅ Threads carousel published: {thread_id}", flush=True)
            return {
                "success": True,
                "post_id": thread_id,
                "platform": "threads",
                "brand_used": self.brand_name,
            }

        except Exception as e:
            error_msg = f"Threads carousel publish failed: {e}"
            print(f"   ❌ {error_msg}", flush=True)
            return {"success": False, "error": error_msg, "platform": "threads"}

    # =========================================================================
    #  TikTok Publishing
    # =========================================================================

    def _refresh_tiktok_token(self) -> Optional[str]:
        """
        Refresh TikTok access token (24h expiry) and persist to DB.
        Must be called before every TikTok publish.
        Returns the fresh access token or None on failure.
        """
        if not self.tiktok_refresh_token:
            return None

        try:
            from app.db_connection import SessionLocal
            from app.models.brands import Brand
            from app.services.publishing.tiktok_token_service import TikTokTokenService
            from datetime import timedelta

            svc = TikTokTokenService()
            tokens = svc.refresh_access_token(self.tiktok_refresh_token)
            new_access = tokens.get("access_token")
            if not new_access:
                print(f"   ⚠️ TikTok token refresh returned no access_token", flush=True)
                return None

            expires_in = tokens.get("expires_in", 86400)
            new_refresh = tokens.get("refresh_token")

            # Persist to DB
            db = SessionLocal()
            try:
                brand = db.query(Brand).filter(Brand.id == self.brand_name).first()
                if brand:
                    brand.tiktok_access_token = new_access
                    brand.tiktok_access_token_expires_at = (
                        datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                    )
                    if new_refresh:
                        brand.tiktok_refresh_token = new_refresh
                        refresh_expires = tokens.get("refresh_expires_in", 31536000)
                        brand.tiktok_refresh_token_expires_at = (
                            datetime.now(timezone.utc) + timedelta(seconds=refresh_expires)
                        )
                    db.commit()
                    print(f"   🔑 Refreshed TikTok token for {self.brand_name}", flush=True)
            finally:
                db.close()

            # Update in-memory tokens
            self.tiktok_access_token = new_access
            if new_refresh:
                self.tiktok_refresh_token = new_refresh
            return new_access

        except Exception as e:
            print(f"   ⚠️ TikTok token refresh failed: {e}", flush=True)
            return None

    def publish_tiktok_video(
        self,
        video_url: str,
        caption: str,
    ) -> Dict[str, Any]:
        """
        Publish a video to TikTok using the FILE_UPLOAD method.

        Flow:
          1. Refresh access token (24h expiry)
          2. Download video from Supabase URL to memory
          3. POST /v2/post/publish/video/init/ with FILE_UPLOAD source + video_size
          4. PUT video bytes to the upload_url returned by TikTok
          5. Poll publish status until complete

        Args:
            video_url: Public Supabase URL for the video
            caption: Video caption / description

        Returns:
            Dict with success, post_id (publish_id), platform
        """
        if not self.tiktok_access_token and not self.tiktok_refresh_token:
            return {
                "success": False,
                "error": "TikTok credentials not configured",
                "platform": "tiktok",
            }

        # Always refresh before publish (24h token lifetime)
        fresh_token = self._refresh_tiktok_token()
        if not fresh_token:
            return {
                "success": False,
                "error": "TikTok token refresh failed — cannot publish",
                "platform": "tiktok",
            }

        tiktok_api = "https://open.tiktokapis.com/v2"

        try:
            # Step 1: Download video from Supabase
            print(f"   📱 TikTok: Downloading video from source URL...", flush=True)
            dl_resp = requests.get(video_url, timeout=120)
            dl_resp.raise_for_status()
            video_bytes = dl_resp.content
            video_size = len(video_bytes)
            print(f"   📱 TikTok: Downloaded {video_size} bytes", flush=True)

            # Step 2: Initialize video publish with FILE_UPLOAD
            print(f"   📱 TikTok: Initializing video publish (FILE_UPLOAD)...", flush=True)
            init_resp = requests.post(
                f"{tiktok_api}/post/publish/video/init/",
                headers={
                    "Authorization": f"Bearer {fresh_token}",
                    "Content-Type": "application/json; charset=UTF-8",
                },
                json={
                    "post_info": {
                        "title": caption[:150],
                        "privacy_level": "PUBLIC_TO_EVERYONE",
                        "disable_duet": False,
                        "disable_comment": False,
                        "disable_stitch": False,
                        "video_cover_timestamp_ms": 1000,
                    },
                    "source_info": {
                        "source": "FILE_UPLOAD",
                        "video_size": video_size,
                        "chunk_size": video_size,
                        "total_chunk_count": 1,
                    },
                },
                timeout=30,
            )
            init_resp.raise_for_status()
            init_data = init_resp.json()

            error_block = init_data.get("error", {})
            if error_block.get("code") != "ok":
                error_msg = f"TikTok init failed: {error_block.get('message', init_data)}"
                print(f"   ❌ {error_msg}", flush=True)
                return {"success": False, "error": error_msg, "platform": "tiktok"}

            publish_id = init_data.get("data", {}).get("publish_id")
            upload_url = init_data.get("data", {}).get("upload_url")
            if not publish_id or not upload_url:
                return {
                    "success": False,
                    "error": f"TikTok init returned no publish_id/upload_url: {init_data}",
                    "platform": "tiktok",
                }

            # Step 3: Upload video bytes to TikTok's upload_url
            print(f"   📱 TikTok: Uploading {video_size} bytes to TikTok...", flush=True)
            upload_resp = requests.put(
                upload_url,
                headers={
                    "Content-Range": f"bytes 0-{video_size - 1}/{video_size}",
                    "Content-Type": "video/mp4",
                },
                data=video_bytes,
                timeout=120,
            )
            upload_resp.raise_for_status()
            print(f"   📱 TikTok: Upload complete, polling status...", flush=True)

            # Step 4: Poll for completion
            self._poll_tiktok_status(publish_id, fresh_token)

            print(f"   ✅ TikTok: Video published (publish_id={publish_id})", flush=True)
            return {
                "success": True,
                "post_id": publish_id,
                "platform": "tiktok",
                "brand_used": self.brand_name,
            }

        except requests.exceptions.HTTPError as e:
            error_body = ""
            if e.response is not None:
                try:
                    error_body = e.response.json()
                except Exception:
                    error_body = e.response.text[:500]
            error_msg = f"TikTok API error: {e} — {error_body}"
            print(f"   ❌ {error_msg}", flush=True)
            return {"success": False, "error": error_msg, "platform": "tiktok"}
        except TimeoutError as e:
            error_msg = f"TikTok publish timed out: {e}"
            print(f"   ❌ {error_msg}", flush=True)
            return {"success": False, "error": error_msg, "platform": "tiktok"}
        except Exception as e:
            error_msg = f"TikTok publish failed: {e}"
            print(f"   ❌ {error_msg}", flush=True)
            return {"success": False, "error": error_msg, "platform": "tiktok"}

    def _poll_tiktok_status(self, publish_id: str, token: str, timeout_s: int = 180):
        """Poll TikTok video processing status until PUBLISH_COMPLETE."""
        import time as _time
        deadline = _time.monotonic() + timeout_s
        while _time.monotonic() < deadline:
            resp = requests.post(
                "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json; charset=UTF-8",
                },
                json={"publish_id": publish_id},
                timeout=30,
            )
            data = resp.json()
            status_val = data.get("data", {}).get("status")
            if status_val == "PUBLISH_COMPLETE":
                return
            if status_val in ("FAILED", "PUBLISH_FAILED"):
                fail_reason = data.get("data", {}).get("fail_reason", data)
                raise RuntimeError(f"TikTok video publish failed: {fail_reason}")
            # PROCESSING_UPLOAD / PROCESSING_DOWNLOAD / SENDING_TO_USER_INBOX — keep polling
            _time.sleep(5)
        raise TimeoutError(f"TikTok video processing timed out after {timeout_s}s")
