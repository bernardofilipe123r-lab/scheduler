"""Threads publishing — posts, carousels, and thread chains."""
import requests
from datetime import datetime, timezone
from typing import Optional, Dict, Any


class ThreadsMixin:
    """Threads publishing methods for SocialPublisher."""

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
        """
        if not self.threads_access_token or not self.threads_user_id:
            return {
                "success": False,
                "error": "Threads credentials not configured",
                "platform": "threads",
            }

        self._proactive_refresh_threads_token()

        threads_api = "https://graph.threads.net/v1.0"

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
        threads_api = "https://graph.threads.net/v1.0"

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

    def publish_threads_chain(
        self,
        parts: list[str],
    ) -> Dict[str, Any]:
        """
        Publish a multi-post thread chain to Threads.

        Uses reply_to_id chaining: each subsequent post is a reply to the
        previous one, creating a connected thread.
        """
        if not self.threads_access_token or not self.threads_user_id:
            return {
                "success": False,
                "error": "Threads credentials not configured",
                "platform": "threads",
            }

        if not parts or len(parts) < 2:
            return {
                "success": False,
                "error": f"Thread chains require at least 2 parts, got {len(parts) if parts else 0}",
                "platform": "threads",
            }

        self._proactive_refresh_threads_token()
        threads_api = "https://graph.threads.net/v1.0"

        try:
            post_ids: list[str] = []
            reply_to_id: str | None = None

            for i, text in enumerate(parts):
                print(f"   🧵 Thread chain: Publishing part {i + 1}/{len(parts)}...", flush=True)

                container_data: dict[str, str] = {
                    "text": text,
                    "media_type": "TEXT",
                    "access_token": self.threads_access_token,
                }
                if reply_to_id:
                    container_data["reply_to_id"] = reply_to_id

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
                        "error": f"Thread chain part {i + 1} container returned no ID: {resp.text}",
                        "platform": "threads",
                    }

                pub_resp = requests.post(
                    f"{threads_api}/{self.threads_user_id}/threads_publish",
                    data={
                        "creation_id": creation_id,
                        "access_token": self.threads_access_token,
                    },
                    timeout=30,
                )
                pub_resp.raise_for_status()
                published_id = pub_resp.json().get("id")
                if not published_id:
                    return {
                        "success": False,
                        "error": f"Thread chain part {i + 1} publish returned no ID",
                        "platform": "threads",
                    }

                post_ids.append(published_id)
                reply_to_id = published_id

            print(f"   ✅ Thread chain published: {len(post_ids)} parts", flush=True)
            return {
                "success": True,
                "post_id": post_ids[0],
                "post_ids": post_ids,
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
            error_msg = f"Threads chain API error: {e} — {error_body}"
            print(f"   ❌ {error_msg}", flush=True)
            return {"success": False, "error": error_msg, "platform": "threads"}
        except Exception as e:
            error_msg = f"Threads chain publish failed: {e}"
            print(f"   ❌ {error_msg}", flush=True)
            return {"success": False, "error": error_msg, "platform": "threads"}
