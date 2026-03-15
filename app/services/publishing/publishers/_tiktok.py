"""TikTok publishing — video upload via FILE_UPLOAD method."""
import requests
from datetime import datetime, timezone
from typing import Optional, Dict, Any


class TikTokMixin:
    """TikTok publishing methods for SocialPublisher."""

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
        """
        if not self.tiktok_access_token and not self.tiktok_refresh_token:
            return {
                "success": False,
                "error": "TikTok credentials not configured",
                "platform": "tiktok",
            }

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
            privacy_level = "PUBLIC_TO_EVERYONE"
            init_data = self._tiktok_init_publish(
                fresh_token, tiktok_api, caption, video_size, privacy_level
            )

            error_block = init_data.get("error", {})
            error_code = str(error_block.get("code", ""))
            error_msg_raw = str(error_block.get("message", ""))
            combined_error = f"{error_code} {error_msg_raw}".lower()

            # Handle unaudited app — Direct Post audit is separate from app review
            if (error_code != "ok" and "unaudited_client" in combined_error):
                print(f"   ⚠️ TikTok Direct Post audit pending — cannot post publicly. "
                      f"Retrying with SELF_ONLY privacy (posts to creator's account only). "
                      f"Apply for Direct Post audit at TikTok Developer Portal → "
                      f"Content Posting API → Direct Post → Apply",
                      flush=True)
                privacy_level = "SELF_ONLY"
                init_data = self._tiktok_init_publish(
                    fresh_token, tiktok_api, caption, video_size, privacy_level
                )
                error_block = init_data.get("error", {})
                error_code = str(error_block.get("code", ""))

            if error_code != "ok":
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

            error_str = str(error_body).lower()
            if "unaudited_client" in error_str:
                error_msg = (f"TikTok UNAUDITED APP: Cannot post to public accounts. "
                             f"Submit app for audit at https://developers.tiktok.com/ — "
                             f"unaudited_client_can_only_post_to_private_accounts")
                print(f"   ⚠️ {error_msg}", flush=True)
            else:
                error_msg = f"TikTok API error: {e.response.status_code} — {error_body}"
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

    def _tiktok_init_publish(self, token: str, tiktok_api: str,
                             caption: str, video_size: int,
                             privacy_level: str) -> dict:
        """Initialize a TikTok video publish with FILE_UPLOAD. Returns the JSON response.

        NOTE: Does NOT raise on HTTP errors — returns the JSON body so the
        caller can inspect TikTok-specific error codes (e.g. unaudited_client)
        and decide whether to retry with a different privacy_level.
        """
        print(f"   📱 TikTok: Initializing video publish (FILE_UPLOAD, privacy={privacy_level})...", flush=True)
        init_resp = requests.post(
            f"{tiktok_api}/post/publish/video/init/",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=UTF-8",
            },
            json={
                "post_info": {
                    "title": caption[:150],
                    "privacy_level": privacy_level,
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
        # Always try to return JSON so caller can inspect TikTok error codes.
        # Only raise for non-JSON responses (e.g. 5xx HTML error pages).
        try:
            return init_resp.json()
        except ValueError:
            init_resp.raise_for_status()
            return {"error": {"code": "unknown", "message": init_resp.text[:500]}}

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
            _time.sleep(5)
        raise TimeoutError(f"TikTok video processing timed out after {timeout_s}s")
