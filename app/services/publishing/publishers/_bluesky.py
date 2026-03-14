"""Bluesky (AT Protocol) publishing — posts and carousels."""
import requests
from typing import Optional, Dict, Any, List


class BlueskyMixin:
    """Bluesky publishing methods for SocialPublisher."""

    def _ensure_bsky_session(self) -> Optional[str]:
        """
        Ensure we have a valid Bluesky access JWT.
        Refreshes or re-creates session as needed.
        Returns the access JWT or None on failure.
        """
        if not self.bsky_did or not self.bsky_app_password:
            return None

        from app.services.publishing.bsky_token_service import BskyTokenService

        token_service = BskyTokenService()

        if self.bsky_refresh_jwt:
            try:
                session = token_service.refresh_session(self.bsky_refresh_jwt)
                self.bsky_access_jwt = session["accessJwt"]
                self.bsky_refresh_jwt = session["refreshJwt"]
                self._persist_bsky_tokens()
                return self.bsky_access_jwt
            except Exception as e:
                print(f"   🦋 Bluesky: refresh failed ({e}), re-creating session...", flush=True)

        try:
            session = token_service.create_session(self.bsky_handle or self.bsky_did, self.bsky_app_password)
            self.bsky_access_jwt = session["accessJwt"]
            self.bsky_refresh_jwt = session["refreshJwt"]
            self._persist_bsky_tokens()
            return self.bsky_access_jwt
        except Exception as e:
            print(f"   ❌ Bluesky: session creation failed: {e}", flush=True)
            return None

    def _persist_bsky_tokens(self):
        """Persist refreshed Bluesky JWTs back to the DB."""
        try:
            from app.db_connection import get_db_session
            from app.models.brands import Brand
            from datetime import datetime, timedelta, timezone

            with get_db_session() as db:
                brand = db.query(Brand).filter(Brand.bsky_did == self.bsky_did).first()
                if brand:
                    brand.bsky_access_jwt = self.bsky_access_jwt
                    brand.bsky_refresh_jwt = self.bsky_refresh_jwt
                    brand.bsky_access_jwt_expires_at = datetime.now(timezone.utc) + timedelta(hours=2)
                    db.commit()
        except Exception as e:
            print(f"   ⚠️ Bluesky: failed to persist tokens: {e}", flush=True)

    @staticmethod
    def _truncate_to_graphemes(text: str, max_graphemes: int = 300) -> str:
        """Truncate text to max grapheme clusters for Bluesky's 300-grapheme limit."""
        import unicodedata
        graphemes = []
        i = 0
        while i < len(text) and len(graphemes) < max_graphemes:
            char = text[i]
            cluster = char
            i += 1
            while i < len(text) and unicodedata.category(text[i]).startswith('M'):
                cluster += text[i]
                i += 1
            graphemes.append(cluster)
        result = "".join(graphemes)
        if len(result) < len(text):
            if len(graphemes) >= max_graphemes:
                result = result[:result.rfind(' ')] + "..." if ' ' in result else result[:max_graphemes - 3] + "..."
        return result

    @staticmethod
    def _extract_url_facets(text: str) -> list:
        """Extract URL facets from text for Bluesky rich text."""
        import re as _re
        url_pattern = _re.compile(r'https?://[^\s<>\[\]()]+')
        facets = []
        text_bytes = text.encode('utf-8')
        for match in url_pattern.finditer(text):
            url = match.group()
            byte_start = len(text[:match.start()].encode('utf-8'))
            byte_end = len(text[:match.end()].encode('utf-8'))
            facets.append({
                "index": {"byteStart": byte_start, "byteEnd": byte_end},
                "features": [{"$type": "app.bsky.richtext.facet#link", "uri": url}],
            })
        return facets

    def publish_bsky_post(
        self,
        caption: str,
        media_url: Optional[str] = None,
        media_type: str = "TEXT",
    ) -> Dict[str, Any]:
        """
        Publish a post to Bluesky.

        Flow:
          1. Ensure valid session (refresh/recreate as needed)
          2. If image: download from URL -> upload blob -> build embed
          3. Create post record via com.atproto.repo.createRecord
        """
        if not self.bsky_did or not self.bsky_app_password:
            return {
                "success": False,
                "error": "Bluesky credentials not configured",
                "platform": "bluesky",
            }

        access_jwt = self._ensure_bsky_session()
        if not access_jwt:
            return {
                "success": False,
                "error": "Bluesky session creation failed — cannot publish",
                "platform": "bluesky",
            }

        from app.services.publishing.bsky_token_service import BskyTokenService
        token_service = BskyTokenService()

        try:
            bsky_text = self._truncate_to_graphemes(caption, 300)
            facets = self._extract_url_facets(bsky_text)

            embed = None

            # Handle image upload
            if media_url and media_type == "IMAGE":
                print(f"   🦋 Bluesky: Downloading image...", flush=True)
                img_resp = requests.get(media_url, timeout=60)
                img_resp.raise_for_status()
                img_data = img_resp.content

                if len(img_data) > 1_000_000:
                    print(f"   ⚠️ Bluesky: Image too large ({len(img_data)} bytes), skipping image embed", flush=True)
                else:
                    content_type = img_resp.headers.get("Content-Type", "image/jpeg")
                    print(f"   🦋 Bluesky: Uploading blob ({len(img_data)} bytes)...", flush=True)
                    blob = token_service.upload_blob(access_jwt, img_data, content_type)
                    embed = {
                        "$type": "app.bsky.embed.images",
                        "images": [{
                            "image": blob,
                            "alt": "",
                        }],
                    }

            # Handle video
            elif media_url and media_type == "VIDEO":
                print(f"   🦋 Bluesky: Downloading video...", flush=True)
                vid_resp = requests.get(media_url, timeout=120)
                vid_resp.raise_for_status()
                vid_data = vid_resp.content
                vid_size = len(vid_data)
                print(f"   🦋 Bluesky: Video is {vid_size} bytes", flush=True)

                import httpx
                auth_resp = httpx.get(
                    f"https://bsky.social/xrpc/com.atproto.server.getServiceAuth",
                    params={
                        "aud": "did:web:video.bsky.app",
                        "lxm": "com.atproto.repo.uploadBlob",
                    },
                    headers={"Authorization": f"Bearer {access_jwt}"},
                    timeout=30,
                )
                auth_resp.raise_for_status()
                service_token = auth_resp.json()["token"]

                print(f"   🦋 Bluesky: Uploading video to video.bsky.app...", flush=True)
                upload_resp = httpx.post(
                    "https://video.bsky.app/xrpc/app.bsky.video.uploadVideo",
                    params={"did": self.bsky_did, "name": "video.mp4"},
                    headers={
                        "Authorization": f"Bearer {service_token}",
                        "Content-Type": "video/mp4",
                        "Content-Length": str(vid_size),
                    },
                    content=vid_data,
                    timeout=300,
                )
                upload_resp.raise_for_status()
                job_status = upload_resp.json()

                job_id = job_status.get("jobId")
                blob = job_status.get("blob")
                if not blob and job_id:
                    import time as _time
                    print(f"   🦋 Bluesky: Polling video processing (job={job_id})...", flush=True)
                    deadline = _time.monotonic() + 180
                    while _time.monotonic() < deadline:
                        status_resp = httpx.get(
                            "https://video.bsky.app/xrpc/app.bsky.video.getJobStatus",
                            params={"jobId": job_id},
                            timeout=30,
                        )
                        status_resp.raise_for_status()
                        status_data = status_resp.json()["jobStatus"]
                        blob = status_data.get("blob")
                        if blob:
                            break
                        state = status_data.get("state", "")
                        if state == "JOB_STATE_FAILED":
                            error_msg = status_data.get("error", "Unknown error")
                            raise RuntimeError(f"Bluesky video processing failed: {error_msg}")
                        _time.sleep(5)
                    if not blob:
                        raise TimeoutError("Bluesky video processing timed out after 180s")

                embed = {
                    "$type": "app.bsky.embed.video",
                    "video": blob,
                }

            # Create post
            print(f"   🦋 Bluesky: Creating post...", flush=True)
            result = token_service.create_post(
                access_jwt=access_jwt,
                did=self.bsky_did,
                text=bsky_text,
                embed=embed,
                facets=facets if facets else None,
            )

            post_uri = result.get("uri", "")
            print(f"   ✅ Bluesky: Published post {post_uri}", flush=True)
            return {
                "success": True,
                "post_id": post_uri,
                "platform": "bluesky",
                "brand_used": self.brand_name,
            }

        except requests.exceptions.HTTPError as e:
            error_body = ""
            if e.response is not None:
                try:
                    error_body = e.response.json()
                except Exception:
                    error_body = e.response.text[:500]
            error_msg = f"Bluesky API error: {e} — {error_body}"
            print(f"   ❌ {error_msg}", flush=True)
            return {"success": False, "error": error_msg, "platform": "bluesky"}

        except Exception as e:
            error_msg = f"Bluesky publish failed: {e}"
            print(f"   ❌ {error_msg}", flush=True)
            return {"success": False, "error": error_msg, "platform": "bluesky"}

    def publish_bsky_carousel(
        self,
        image_urls: List[str],
        caption: str,
    ) -> Dict[str, Any]:
        """Publish a multi-image post to Bluesky (up to 4 images)."""
        if not self.bsky_did or not self.bsky_app_password:
            return {
                "success": False,
                "error": "Bluesky credentials not configured",
                "platform": "bluesky",
            }

        access_jwt = self._ensure_bsky_session()
        if not access_jwt:
            return {
                "success": False,
                "error": "Bluesky session creation failed — cannot publish",
                "platform": "bluesky",
            }

        from app.services.publishing.bsky_token_service import BskyTokenService
        token_service = BskyTokenService()

        try:
            urls = image_urls[:4]
            images = []

            for i, url in enumerate(urls):
                print(f"   🦋 Bluesky: Uploading image {i + 1}/{len(urls)}...", flush=True)
                img_resp = requests.get(url, timeout=60)
                img_resp.raise_for_status()
                img_data = img_resp.content

                if len(img_data) > 1_000_000:
                    print(f"   ⚠️ Bluesky: Image {i + 1} too large ({len(img_data)} bytes), skipping", flush=True)
                    continue

                content_type = img_resp.headers.get("Content-Type", "image/jpeg")
                blob = token_service.upload_blob(access_jwt, img_data, content_type)
                images.append({"image": blob, "alt": ""})

            if not images:
                return {
                    "success": False,
                    "error": "No images could be uploaded (all exceeded 1 MB limit)",
                    "platform": "bluesky",
                }

            bsky_text = self._truncate_to_graphemes(caption, 300)
            facets = self._extract_url_facets(bsky_text)

            embed = {
                "$type": "app.bsky.embed.images",
                "images": images,
            }

            print(f"   🦋 Bluesky: Creating post with {len(images)} images...", flush=True)
            result = token_service.create_post(
                access_jwt=access_jwt,
                did=self.bsky_did,
                text=bsky_text,
                embed=embed,
                facets=facets if facets else None,
            )

            post_uri = result.get("uri", "")
            print(f"   ✅ Bluesky: Published carousel post {post_uri}", flush=True)
            return {
                "success": True,
                "post_id": post_uri,
                "platform": "bluesky",
                "brand_used": self.brand_name,
            }

        except Exception as e:
            error_msg = f"Bluesky carousel publish failed: {e}"
            print(f"   ❌ {error_msg}", flush=True)
            return {"success": False, "error": error_msg, "platform": "bluesky"}
