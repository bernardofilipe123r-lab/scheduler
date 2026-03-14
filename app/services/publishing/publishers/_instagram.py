"""Instagram publishing — image posts, carousels, and reels."""
import io
import time
import requests
from typing import Optional, Dict, Any


class InstagramMixin:
    """Instagram publishing methods for SocialPublisher."""

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

            self.ig_access_token = new_token

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
        """
        if not self.ig_access_token or not self.ig_business_account_id:
            return {
                "success": False,
                "error": "Instagram credentials not configured",
                "platform": "instagram"
            }

        try:
            container_url = f"{self.ig_graph_base}/{self.api_version}/{self.ig_business_account_id}/media"

            print(f"📤 Image URL for Instagram post: {image_url}")
            print(f"   Instagram Account ID: {self.ig_business_account_id}")
            print(f"   Using IMAGE POST method (not Reels)...")

            container_payload = {
                "image_url": image_url,
                "caption": caption,
                "access_token": self.ig_access_token,
                "is_ai_generated": True,
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
        """
        if not self.ig_access_token or not self.ig_business_account_id:
            return {
                "success": False,
                "error": "Instagram credentials not configured",
                "platform": "instagram",
            }

        if len(image_urls) < 2:
            return self.publish_instagram_image_post(
                image_url=image_urls[0], caption=caption
            )

        if len(image_urls) > 10:
            image_urls = image_urls[:10]

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
                            "media_type": "IMAGE",
                            "is_carousel_item": "true",
                            "access_token": self.ig_access_token,
                        },
                        timeout=30,
                    )
                    item_data = item_resp.json()

                    if "error" not in item_data:
                        break

                    last_error_msg = item_data["error"].get("message", "Unknown error")
                    error_code = item_data["error"].get("code", "")

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

                    is_transient = (
                        "unexpected" in last_error_msg.lower()
                        or "retry" in last_error_msg.lower()
                        or "only photo or video" in last_error_msg.lower()
                        or error_code in (2, "2")
                    )
                    if attempt < max_retries - 1 and is_transient:
                        wait_time = (attempt + 1) * 3
                        print(f"   ⏳ Carousel item {idx + 1} attempt {attempt + 1} failed: {last_error_msg}. Retrying in {wait_time}s...")
                        time.sleep(wait_time)
                        continue

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
                    "is_ai_generated": True,
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

    # ==================== REEL (VIDEO) PUBLISHING ====================

    def publish_instagram_reel(
        self,
        video_url: str,
        caption: str = "CHANGE ME",
        thumbnail_url: Optional[str] = None,
        share_to_feed: bool = True
    ) -> Dict[str, Any]:
        """
        Publish a Reel to Instagram using the video_url method.
        Instagram fetches the video from the URL directly — no rupload step.

        Steps:
        1. Create media container with video_url
        2. Wait for processing (status_code == FINISHED)
        3. Publish the container
        """
        if not self.ig_access_token or not self.ig_business_account_id:
            return {
                "success": False,
                "error": "Instagram credentials not configured",
                "platform": "instagram"
            }

        try:
            container_url = f"{self.ig_graph_base}/{self.api_version}/{self.ig_business_account_id}/media"

            print(f"📤 Video URL for Instagram: {video_url}")
            print(f"   Instagram Account ID: {self.ig_business_account_id}")
            print(f"   Using video_url method (Instagram fetches video directly)...")

            container_payload = {
                "media_type": "REELS",
                "video_url": video_url,
                "caption": caption,
                "access_token": self.ig_access_token,
                "is_ai_generated": True,
            }

            if not share_to_feed:
                container_payload["share_to_feed"] = "false"

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

            # Step 2: Wait for video processing
            status_url = f"{self.ig_graph_base}/{self.api_version}/{creation_id}"
            max_wait_seconds = 180
            check_interval = 5
            waited = 0

            print(f"⏳ Waiting for Instagram to process video...")
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
