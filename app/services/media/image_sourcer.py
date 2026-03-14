"""
Image Sourcer — generates/fetches images for Format B reels.

Image source is controlled by FORMAT_B_IMAGE_SOURCE env var (or DB setting):
  - "ai" (default): Freepik primary, DeAPI fallback (AI-generated images)
  - "web": Pexels API photos (real web images, no AI fallback)

Applies to both video slide images and thumbnails.
"""
import base64
import logging
import os
import random
import tempfile
import time
import threading
from pathlib import Path
from typing import Optional

import requests
from PIL import Image

from app.services.discovery.story_polisher import ImagePlan

logger = logging.getLogger(__name__)

TARGET_WIDTH = 1080
TARGET_HEIGHT = 1920

# DeAPI concurrency control (shared with ai_background.py's semaphore)
_sourcer_semaphore = threading.Semaphore(1)
QUEUE_TIMEOUT = 90
MAX_RETRIES = 5
INITIAL_RETRY_DELAY = 5
MAX_RETRY_DELAY = 60

# Freepik daily limit (Free Trial: 100/day, Pay-per-use: 10,000/day)
FREEPIK_DAILY_LIMIT = 100
GLOBAL_FORMAT_B_SETTINGS_USER_ID = "__global_format_b_settings__"

# Safety suffix appended to all AI image generation prompts
_SAFETY_SUFFIX = ", safe for work, no nudity, no exposed bodies, all people fully clothed"


def _sanitize_ai_prompt(prompt: str) -> str:
    """Append safety suffix to AI image prompts to prevent NSFW generation."""
    if not prompt:
        return prompt
    return prompt.rstrip(".") + _SAFETY_SUFFIX


def get_image_source_mode(db=None, user_id: str = None) -> str:
    """Get the configured image source mode for Format B video slides.

    Reads from format_b_design table (persistent across deploys).
    Falls back to FORMAT_B_IMAGE_SOURCE env var, then "ai".
    """
    if db:
        try:
            from app.models.format_b_design import FormatBDesign

            # Admin page toggle is global for all users.
            global_design = db.query(FormatBDesign).filter(
                FormatBDesign.user_id == GLOBAL_FORMAT_B_SETTINGS_USER_ID
            ).first()
            if global_design and global_design.image_source_mode:
                return global_design.image_source_mode.lower()

            if user_id:
                design = db.query(FormatBDesign).filter(
                    FormatBDesign.user_id == user_id
                ).first()
                if design and design.image_source_mode:
                    return design.image_source_mode.lower()
        except Exception as e:
            logger.warning(f"[ImageSourcer] Could not read image_source_mode from DB: {e}")
    return os.environ.get("FORMAT_B_IMAGE_SOURCE", "ai").lower()


def get_thumbnail_image_source_mode(db=None, user_id: str = None) -> str:
    """Get the configured image source mode for Format B thumbnails.

    Reads thumbnail_image_source_mode from format_b_design table.
    Falls back to 'ai' (AI generation is the default for thumbnails).
    """
    if db:
        try:
            from app.models.format_b_design import FormatBDesign

            global_design = db.query(FormatBDesign).filter(
                FormatBDesign.user_id == GLOBAL_FORMAT_B_SETTINGS_USER_ID
            ).first()
            if global_design and global_design.thumbnail_image_source_mode:
                return global_design.thumbnail_image_source_mode.lower()

            if user_id:
                design = db.query(FormatBDesign).filter(
                    FormatBDesign.user_id == user_id
                ).first()
                if design and design.thumbnail_image_source_mode:
                    return design.thumbnail_image_source_mode.lower()
        except Exception as e:
            logger.warning(f"[ImageSourcer] Could not read thumbnail_image_source_mode from DB: {e}")
    return "ai"


class ImageSourcer:
    """Sources images for format-b reels. Supports AI-generated and web images."""

    def __init__(self, db=None, image_source_mode: str = None, image_box_width: int = 910, image_box_height: int = 660):
        self.db = db
        self._image_source_mode = image_source_mode  # Override from caller
        self._deapi_key = os.environ.get("DEAPI_API_KEY")
        self._deapi_base_url = "https://api.deapi.ai/api/v1/client"
        self._freepik_key = os.environ.get("FREEPIK_API_KEY")
        self._freepik_base_url = "https://api.freepik.com/v1/ai/text-to-image"
        self.last_service_used: str = "unknown"  # "freepik", "deapi", or "pexels"
        # Design dimensions for Pexels target ratio adaptation
        self._image_box_width = image_box_width
        self._image_box_height = image_box_height

    def _is_freepik_available(self) -> bool:
        """Check if Freepik API key is set and daily usage is under 100%."""
        if not self._freepik_key:
            return False
        try:
            from app.services.monitoring.api_usage_tracker import APIUsageTracker, API_LIMITS
            if not self.db:
                return True  # No DB session — optimistically allow
            tracker = APIUsageTracker(self.db)
            limit_info = API_LIMITS.get("freepik", {})
            daily_limit = limit_info.get("daily", FREEPIK_DAILY_LIMIT)
            from datetime import datetime, timezone
            since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0)
            count = tracker._count_calls("freepik", since)
            usage_pct = (count / daily_limit * 100) if daily_limit else 100
            if usage_pct >= 100:
                logger.info(f"[ImageSourcer] Freepik daily limit reached ({count}/{daily_limit}), falling back to DeAPI")
                return False
            return True
        except Exception as e:
            logger.warning(f"[ImageSourcer] Could not check Freepik usage: {e}")
            return True  # Optimistic — try Freepik anyway

    def source_image(self, plan: ImagePlan, orientation: str = "landscape") -> Optional[Path]:
        """
        Source a single image based on the configured mode.

        Args:
            plan: Image generation/search plan.
            orientation: "landscape" for horizontal content images,
                         "portrait" for vertical thumbnail images.

        When FORMAT_B_IMAGE_SOURCE=web:
          1. Try Pexels API photos (using plan.search_query)
          2. If Pexels fails, return None (strict mode)

        When FORMAT_B_IMAGE_SOURCE=ai (default):
          1. Try Freepik (if available)
          2. Fall back to DeAPI

        Returns path to processed image or None.
        """
        mode = self._image_source_mode or get_image_source_mode(db=self.db)

        if mode == "web":
            path = self._source_via_web(plan, orientation=orientation)
            if path:
                return path
            logger.warning("[ImageSourcer] Web mode selected and Pexels returned no image (strict mode, no AI fallback)")
            return None

        # AI generation path (default)
        return self._source_via_ai(plan, orientation=orientation)

    def source_image_ai_only(self, plan: ImagePlan) -> Optional[Path]:
        """Source an image using AI generation only (for thumbnails)."""
        return self._source_via_ai(plan)

    def _source_via_web(self, plan: ImagePlan, orientation: str = "landscape") -> Optional[Path]:
        """Try to fetch a real web image via Pexels API.

        Uses a fallback cascade:
          1. Primary search_query from DeepSeek
          2. fallback_query (extracted from reel text nouns)
          3. Simplified 2-word version of the AI prompt
        """
        try:
            from app.services.media.web_image_sourcer import WebImageSourcer
            web_sourcer = WebImageSourcer(db=self.db)

            if not web_sourcer.is_available():
                logger.warning("[ImageSourcer] Pexels API not configured, skipping web source")
                return None

            target_ratio = self._image_box_width / max(self._image_box_height, 1)

            # Build query cascade: primary → fallback → simplified AI prompt
            queries_to_try = []
            if plan.search_query:
                queries_to_try.append(plan.search_query)
            if plan.fallback_query and plan.fallback_query != plan.search_query:
                queries_to_try.append(plan.fallback_query)
            # Last resort: extract first 3 meaningful words from AI prompt
            if plan.query:
                import re
                words = re.findall(r'[a-zA-Z]+', plan.query)
                simple = " ".join(w for w in words[:4] if len(w) > 3)
                if simple and simple not in queries_to_try:
                    queries_to_try.append(simple)

            if not queries_to_try:
                return None

            for i, query in enumerate(queries_to_try):
                if i > 0:
                    logger.info(f"[ImageSourcer] Pexels fallback #{i+1}: trying {query!r}")
                path = web_sourcer.search_image(
                    query, orientation=orientation, color=plan.search_color,
                    target_ratio=target_ratio,
                )
                if path:
                    self.last_service_used = "pexels"
                    return path

            return None
        except Exception as e:
            logger.error(f"[ImageSourcer] Web image source error: {e}")
            return None

    def _source_via_ai(self, plan: ImagePlan, orientation: str = "landscape") -> Optional[Path]:
        """Generate an image via AI (Freepik primary, DeAPI fallback)."""
        use_freepik = self._is_freepik_available()

        freepik_size = "social_story_9_16" if orientation == "portrait" else "widescreen_16_9"

        if use_freepik:
            path = self._generate_via_freepik(plan.query, size=freepik_size)
            if not path and plan.fallback_query:
                path = self._generate_via_freepik(plan.fallback_query, size=freepik_size)
            if path:
                self.last_service_used = "freepik"
                return self._process_image(path)
            logger.warning("[ImageSourcer] Freepik failed, falling back to DeAPI")

        # Fallback to DeAPI
        if not self._deapi_key:
            logger.error("[ImageSourcer] DEAPI_API_KEY not set and Freepik unavailable")
            return None

        path = self._generate_via_deapi(plan.query, orientation=orientation)
        if not path and plan.fallback_query:
            path = self._generate_via_deapi(plan.fallback_query, orientation=orientation)

        if path:
            self.last_service_used = "deapi"
            return self._process_image(path)

        return None

    def source_images_batch(self, plans: list[ImagePlan]) -> list[Optional[Path]]:
        """Generate multiple images, returning results in order."""
        return [self.source_image(plan) for plan in plans]

    def _generate_via_freepik(self, prompt: str, size: str = "widescreen_16_9") -> Optional[Path]:
        """Generate an image via Freepik Classic Fast API.

        Args:
            prompt: Text prompt for image generation.
            size: Aspect ratio. Use 'widescreen_16_9' for content images (rectangular),
                  'social_story_9_16' for vertical thumbnails.
        """
        prompt = _sanitize_ai_prompt(prompt)
        try:
            headers = {
                "x-freepik-api-key": self._freepik_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            }

            payload = {
                "prompt": prompt,
                "num_images": 1,
                "image": {"size": size},
                "guidance_scale": 1,
                "filter_nsfw": True,
            }

            logger.info(f"[ImageSourcer] Freepik generating image, size={size}")

            response = requests.post(
                self._freepik_base_url,
                headers=headers,
                json=payload,
                timeout=60,
            )

            if response.status_code == 429:
                logger.warning("[ImageSourcer] Freepik rate limited (429)")
                return None

            if response.status_code == 401:
                logger.error("[ImageSourcer] Freepik auth failed (401) — check API key")
                return None

            response.raise_for_status()
            data = response.json()

            images = data.get("data", [])
            if not images:
                logger.error("[ImageSourcer] Freepik returned no images")
                return None

            img_data = images[0]
            if img_data.get("has_nsfw"):
                logger.warning("[ImageSourcer] Freepik image flagged NSFW, skipping")
                return None

            # Decode base64 image
            b64_str = img_data.get("base64")
            if not b64_str:
                logger.error("[ImageSourcer] Freepik returned no base64 data")
                return None

            img_bytes = base64.b64decode(b64_str)
            path = Path(tempfile.mktemp(suffix=".png"))
            path.write_bytes(img_bytes)

            # Track usage
            self._record_api_call("freepik", "text-to-image")
            try:
                from app.services.monitoring.cost_tracker import record_freepik_call
                record_freepik_call()
            except Exception:
                pass

            logger.info("[ImageSourcer] Freepik image generated successfully")
            return path

        except requests.exceptions.RequestException as e:
            logger.error(f"[ImageSourcer] Freepik request error: {e}")
            return None
        except Exception as e:
            logger.error(f"[ImageSourcer] Freepik error: {e}")
            return None

    def _generate_via_deapi(self, prompt: str, orientation: str = "landscape") -> Optional[Path]:
        """Generate an image via DeAPI using Flux1schnell model."""
        prompt = _sanitize_ai_prompt(prompt)
        acquired = _sourcer_semaphore.acquire(timeout=QUEUE_TIMEOUT)
        if not acquired:
            logger.warning("[ImageSourcer] DeAPI queue timeout")
            try:
                _sourcer_semaphore.release()
            except ValueError:
                pass
            _sourcer_semaphore.acquire(timeout=10)

        try:
            headers = {
                "Authorization": f"Bearer {self._deapi_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }

            # 128-aligned dimensions for Flux1schnell
            if orientation == "portrait":
                width = 768    # 128-aligned
                height = 1280  # 128-aligned (9:16 portrait)
            else:
                width = 1280   # 128-aligned
                height = 768   # 128-aligned (16:9 landscape)

            seed = random.randint(0, 2**31 - 1)
            payload = {
                "prompt": prompt,
                "model": "Flux1schnell",
                "width": width,
                "height": height,
                "seed": seed,
                "steps": 4,
                "guidance": 0,
                "loras": [],
            }

            logger.info(f"[ImageSourcer] DeAPI generating {width}x{height}, seed={seed}")

            # Submit request with retry
            response = self._request_with_retry("post", f"{self._deapi_base_url}/txt2img", headers, json=payload, timeout=120)
            result = response.json()
            request_id = result.get("request_id") or result.get("data", {}).get("request_id")

            if not request_id:
                logger.error("[ImageSourcer] DeAPI returned no request_id")
                return None

            logger.info(f"[ImageSourcer] DeAPI queued — request_id: {request_id}")

            # Poll for result
            max_polls = 90
            for poll in range(1, max_polls + 1):
                time.sleep(2)

                status_resp = self._request_with_retry(
                    "get",
                    f"{self._deapi_base_url}/request-status/{request_id}",
                    {"Authorization": f"Bearer {self._deapi_key}"},
                    timeout=30,
                )
                data = status_resp.json().get("data", {})
                st = data.get("status")

                if st == "done":
                    result_url = data.get("result_url")
                    if not result_url:
                        logger.error("[ImageSourcer] DeAPI completed but no result_url")
                        return None

                    # Download the image
                    img_resp = requests.get(result_url, timeout=60)
                    img_resp.raise_for_status()

                    path = Path(tempfile.mktemp(suffix=".png"))
                    path.write_bytes(img_resp.content)

                    # Track DeAPI cost
                    self._record_api_call("deapi", "txt2img")
                    try:
                        from app.services.monitoring.cost_tracker import record_deapi_call
                        record_deapi_call()
                    except Exception:
                        pass

                    logger.info(f"[ImageSourcer] DeAPI image generated in {poll * 2}s")
                    return path

                elif st == "failed":
                    logger.error(f"[ImageSourcer] DeAPI failed: {data.get('error', 'Unknown')}")
                    return None

                elif st in ("pending", "processing"):
                    continue
                else:
                    logger.error(f"[ImageSourcer] DeAPI unexpected status: {st}")
                    return None

            logger.error(f"[ImageSourcer] DeAPI timed out after {max_polls * 2}s")
            return None

        except Exception as e:
            logger.error(f"[ImageSourcer] DeAPI error: {e}")
            return None
        finally:
            try:
                _sourcer_semaphore.release()
            except ValueError:
                pass

    def _request_with_retry(self, method: str, url: str, headers: dict, **kwargs) -> requests.Response:
        """HTTP request with retry logic for 429 errors."""
        retry_delay = INITIAL_RETRY_DELAY

        for attempt in range(MAX_RETRIES + 1):
            try:
                if method.lower() == "get":
                    response = requests.get(url, headers=headers, **kwargs)
                else:
                    response = requests.post(url, headers=headers, **kwargs)

                if response.status_code == 429:
                    if attempt < MAX_RETRIES:
                        logger.warning(f"[ImageSourcer] DeAPI 429, retry {attempt + 1}/{MAX_RETRIES} in {retry_delay}s")
                        time.sleep(retry_delay)
                        retry_delay = min(retry_delay * 2, MAX_RETRY_DELAY)
                        continue
                    else:
                        raise RuntimeError("DeAPI rate limit exceeded after retries")

                response.raise_for_status()
                return response

            except requests.exceptions.RequestException as e:
                if attempt < MAX_RETRIES:
                    logger.warning(f"[ImageSourcer] Request error, retry {attempt + 1}: {e}")
                    time.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, MAX_RETRY_DELAY)
                    continue
                raise

        raise RuntimeError("DeAPI request failed after all retries")

    def _process_image(
        self, raw_path: Path, target_size: tuple[int, int] = (TARGET_WIDTH, TARGET_HEIGHT)
    ) -> Path:
        """Resize/crop image to target dimensions (cover-fit, center-crop)."""
        img = Image.open(raw_path).convert("RGB")

        target_w, target_h = target_size
        ratio_w = target_w / img.width
        ratio_h = target_h / img.height
        scale = max(ratio_w, ratio_h)

        new_w = int(img.width * scale)
        new_h = int(img.height * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)

        # Center crop
        left = (new_w - target_w) // 2
        top = (new_h - target_h) // 2
        img = img.crop((left, top, left + target_w, top + target_h))

        output = raw_path.parent / (raw_path.stem + "_processed.jpg")
        img.save(str(output), "JPEG", quality=95)
        return output

    def _record_api_call(self, api_name: str, endpoint: str = ""):
        """Record API call for usage tracking."""
        if not self.db:
            return
        try:
            from app.models.api_usage import APIUsageLog

            log = APIUsageLog(api_name=api_name, endpoint=endpoint)
            self.db.add(log)
            self.db.commit()
        except Exception:
            try:
                self.db.rollback()
            except Exception:
                pass
