"""Facebook publishing — image posts, carousels, reels, and co-publish with Instagram."""
import re
import time
import requests
from typing import Optional, Dict, Any


def create_facebook_caption(full_caption: str, max_length: int = 400) -> str:
    """
    Create a short, punchy Facebook caption from the full Instagram caption.

    Facebook works better with shorter captions. This function:
    1. Extracts the opening hook/intro paragraph
    2. Adds a simple CTA
    3. Keeps it under max_length characters
    """
    if not full_caption or len(full_caption) <= max_length:
        return full_caption

    paragraphs = full_caption.split('\n\n')
    first_para = paragraphs[0].strip() if paragraphs else ""

    if len(first_para) < 50 and len(paragraphs) > 1:
        first_para = paragraphs[0].strip() + "\n\n" + paragraphs[1].strip()

    lines = first_para.split('\n')
    clean_lines = []
    for line in lines:
        if line and not re.match(r'^[\U0001F300-\U0001F9FF\u2600-\u26FF\u2700-\u27BF]', line.strip()):
            clean_lines.append(line)

    intro_text = '\n'.join(clean_lines).strip()

    fb_cta = "\n\n💡 Follow for more content like this!"
    available_space = max_length - len(fb_cta)

    if len(intro_text) > available_space:
        truncated = intro_text[:available_space]
        last_period = truncated.rfind('.')
        last_question = truncated.rfind('?')
        last_exclaim = truncated.rfind('!')
        cut_point = max(last_period, last_question, last_exclaim)

        if cut_point > available_space * 0.5:
            intro_text = truncated[:cut_point + 1]
        else:
            intro_text = truncated[:truncated.rfind(' ')] + "..."

    return intro_text + fb_cta


class FacebookMixin:
    """Facebook publishing methods for SocialPublisher."""

    def _get_page_access_token(self, page_id: str) -> Optional[str]:
        """
        Get a Page Access Token from the System User Token.
        Facebook Reels API requires a Page Access Token, not a User/System User token.
        """
        if page_id in self._page_access_token_cache:
            return self._page_access_token_cache[page_id]

        if not self._system_user_token:
            print("⚠️  No system user token available")
            return None

        try:
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
        """Alternative method: Get page token via /me/accounts endpoint."""
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

    def publish_facebook_image_post(
        self,
        image_url: str,
        caption: str = "CHANGE ME",
    ) -> Dict[str, Any]:
        """
        Publish a single image post to a Facebook Page using the Photos API.
        Uses: POST /{page_id}/photos with url + message
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
            page_access_token = self._get_page_access_token(self.fb_page_id)

            if not page_access_token:
                return {
                    "success": False,
                    "error": "Failed to get Page Access Token",
                    "platform": "facebook",
                    "step": "auth"
                }

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
        """Publish an image post to both Instagram and Facebook."""
        instagram_result = self.publish_instagram_image_post(image_url, caption)
        facebook_result = self.publish_facebook_image_post(image_url, caption)

        return {
            "instagram": instagram_result,
            "facebook": facebook_result,
            "overall_success": instagram_result.get("success") and facebook_result.get("success")
        }

    # ==================== CAROUSEL PUBLISHING ====================

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
            print(f"📤 Uploading video to Facebook...")

            if "rupload.facebook.com" in upload_url:
                actual_upload_url = upload_url
            else:
                actual_upload_url = f"https://rupload.facebook.com/video-upload/{self.api_version}/{video_id}"

            print(f"   Upload URL: {actual_upload_url}")

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
                if upload_data.get("success") == True:
                    print(f"   ✅ Upload confirmed successful")
            except Exception as json_err:
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

            # Step 2.5: Wait for video processing
            print(f"⏳ Waiting for Facebook to process video...")
            max_wait = 60
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
        """Publish to both Instagram and Facebook."""
        instagram_result = self.publish_instagram_reel(video_url, caption, thumbnail_url)
        facebook_result = self.publish_facebook_reel(video_url, caption, thumbnail_url)

        return {
            "instagram": instagram_result,
            "facebook": facebook_result,
            "overall_success": instagram_result.get("success") and facebook_result.get("success")
        }
