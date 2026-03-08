"""
Image Sourcer — downloads or generates images for TEXT-VIDEO reels.

Sources:
  - SerpAPI Google Images (web search, SERPAPI_KEY)
  - Gemini Imagen 3 (AI generation, GEMINI_API_KEY)
  - Pexels (fallback, PEXELS_API_KEY)
"""
import logging
import os
import tempfile
from pathlib import Path
from typing import Optional

import requests
from PIL import Image

from app.services.discovery.story_polisher import ImagePlan

logger = logging.getLogger(__name__)

TARGET_WIDTH = 1080
TARGET_HEIGHT = 1920


class ImageSourcer:
    """Sources images from web search APIs and AI generators."""

    def __init__(self, db=None):
        self.db = db
        self._serpapi_key = os.environ.get("SERPAPI_KEY")
        self._gemini_key = os.environ.get("GEMINI_API_KEY")
        self._pexels_key = os.environ.get("PEXELS_API_KEY")

    def source_image(self, plan: ImagePlan) -> Optional[Path]:
        """
        Source a single image based on the plan.

        Tries primary query, then fallback, then Pexels.
        Returns path to processed image (1080x1920) or None.
        """
        path = None

        # Primary attempt
        if plan.source_type == "ai_generate":
            path = self._generate_ai_image(plan.query)
        elif plan.source_type == "web_search":
            path = self._search_and_download(plan.query)

        # Fallback query
        if not path and plan.fallback_query:
            if plan.source_type == "ai_generate":
                path = self._search_and_download(plan.fallback_query)
            else:
                path = self._search_and_download(plan.fallback_query)

        # Last resort: Pexels
        if not path:
            path = self._search_pexels(plan.query)

        # Process to target dimensions
        if path:
            return self._process_image(path)

        return None

    def source_images_batch(self, plans: list[ImagePlan]) -> list[Optional[Path]]:
        """Source multiple images, returning results in order."""
        return [self.source_image(plan) for plan in plans]

    def _search_and_download(self, query: str) -> Optional[Path]:
        """Search Google Images via SerpAPI and download best result."""
        if not self._serpapi_key:
            logger.warning("[ImageSourcer] SERPAPI_KEY not set, skipping web search")
            return None

        try:
            resp = requests.get(
                "https://serpapi.com/search",
                params={
                    "engine": "google_images",
                    "q": query,
                    "api_key": self._serpapi_key,
                    "num": 5,
                    "ijn": "0",
                    "safe": "active",
                },
                timeout=15,
            )
            resp.raise_for_status()
            self._record_api_call("serpapi", "google_images")

            results = resp.json().get("images_results", [])
            # Filter for minimum resolution
            candidates = [
                r for r in results
                if r.get("original_width", 0) >= 800
                and r.get("original_height", 0) >= 600
            ]

            for candidate in candidates[:3]:
                url = candidate.get("original")
                if url:
                    path = self._download_image(url)
                    if path:
                        return path

        except Exception as e:
            logger.error(f"[ImageSourcer] SerpAPI search error: {e}")

        return None

    def _generate_ai_image(self, prompt: str) -> Optional[Path]:
        """Generate image using Google Gemini Developer API (Imagen 3) via REST."""
        if not self._gemini_key:
            logger.warning("[ImageSourcer] GEMINI_API_KEY not set, skipping AI generation")
            return None

        try:
            import json
            import base64

            url = (
                "https://generativelanguage.googleapis.com/v1beta/models/"
                "imagen-3.0-generate-002:predict"
                f"?key={self._gemini_key}"
            )
            payload = {
                "instances": [{"prompt": prompt}],
                "parameters": {
                    "sampleCount": 1,
                    "aspectRatio": "9:16",
                    "safetyFilterLevel": "BLOCK_ONLY_HIGH",
                },
            }
            resp = requests.post(url, json=payload, timeout=60)

            self._record_api_call("gemini", "generate_images")

            if resp.status_code != 200:
                logger.error(f"[ImageSourcer] Gemini Imagen error: {resp.status_code} {resp.text[:300]}")
                return None

            data = resp.json()
            predictions = data.get("predictions", [])
            if predictions and predictions[0].get("bytesBase64Encoded"):
                img_bytes = base64.b64decode(predictions[0]["bytesBase64Encoded"])
                path = Path(tempfile.mktemp(suffix=".png"))
                path.write_bytes(img_bytes)
                return path

        except Exception as e:
            logger.error(f"[ImageSourcer] Gemini Imagen error: {e}")

        return None

    def _search_pexels(self, query: str) -> Optional[Path]:
        """Search Pexels photos as fallback source."""
        if not self._pexels_key:
            logger.warning("[ImageSourcer] PEXELS_API_KEY not set, skipping Pexels")
            return None

        try:
            resp = requests.get(
                "https://api.pexels.com/v1/search",
                params={
                    "query": query,
                    "per_page": 3,
                    "orientation": "portrait",
                    "size": "large",
                },
                headers={"Authorization": self._pexels_key},
                timeout=10,
            )
            resp.raise_for_status()
            self._record_api_call("pexels", "search")

            photos = resp.json().get("photos", [])
            for photo in photos:
                url = photo.get("src", {}).get("large2x") or photo.get("src", {}).get("original")
                if url:
                    path = self._download_image(url)
                    if path:
                        return path

        except Exception as e:
            logger.error(f"[ImageSourcer] Pexels error: {e}")

        return None

    def _download_image(self, url: str, timeout: int = 15) -> Optional[Path]:
        """Download an image from URL to a temp file."""
        try:
            resp = requests.get(url, timeout=timeout, stream=True)
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            if "image" not in content_type and not url.lower().endswith(
                (".jpg", ".jpeg", ".png", ".webp")
            ):
                return None

            suffix = ".jpg"
            if "png" in content_type or url.lower().endswith(".png"):
                suffix = ".png"
            elif "webp" in content_type or url.lower().endswith(".webp"):
                suffix = ".webp"

            path = Path(tempfile.mktemp(suffix=suffix))
            with open(path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)

            # Validate it's actually an image
            img = Image.open(path)
            img.verify()
            return path

        except Exception as e:
            logger.debug(f"[ImageSourcer] Download failed for {url[:80]}: {e}")
            return None

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
