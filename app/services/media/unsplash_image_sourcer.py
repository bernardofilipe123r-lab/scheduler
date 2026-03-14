"""
Unsplash Image Sourcer — fetches high-quality images from Unsplash API.

Alternative to Pexels for Format B video slide images.
Configured via web_image_provider setting in format_b_design.

Unsplash TOS requirements:
  - Hotlink images (use Unsplash CDN URLs directly, don't re-host)
  - Trigger download endpoint when a photo is used
  - Attribute photographer and Unsplash

Rate limits:
  - Demo: 50 requests/hour
  - Production: 5,000 requests/hour

Fallback: returns None → caller falls back to next strategy.
"""
import logging
import os
import random
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np
import requests
from PIL import Image

logger = logging.getLogger(__name__)

UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos"

# Valid Unsplash color filter values
VALID_UNSPLASH_COLORS = {
    "black_and_white", "black", "white", "yellow", "orange",
    "red", "purple", "magenta", "green", "teal", "blue",
}

# Map Pexels color names to Unsplash equivalents
PEXELS_TO_UNSPLASH_COLOR = {
    "turquoise": "teal",
    "violet": "purple",
    "pink": "magenta",
    "brown": None,  # No Unsplash equivalent
    "gray": None,
}

# Target aspect ratio for slideshow image box (910w / 660h ≈ 1.38)
TARGET_RATIO_LANDSCAPE = 910 / 660
TARGET_RATIO_PORTRAIT = 9 / 16

# Acceptable ratio ranges
LANDSCAPE_MIN_RATIO = 1.0
LANDSCAPE_MAX_RATIO = 2.0
PORTRAIT_MIN_RATIO = 0.4
PORTRAIT_MAX_RATIO = 0.9

MIN_DIMENSION = 400
MAX_CANDIDATES = 10

# Visual complexity thresholds (same as Pexels sourcer)
MIN_VISUAL_COMPLEXITY = 35
MAX_DOMINANT_COLOR_PCT = 0.55

# Module-level cross-story dedup
_global_used_photo_ids: set[str] = set()
_global_used_photo_ids_max = 500


class UnsplashImageSourcer:
    """Fetches high-quality web images via Unsplash Search API."""

    def __init__(self, db=None):
        self.db = db
        self._access_key = os.environ.get("UNSPLASH_ACCESS_KEY")
        self._used_photo_ids: set[str] = set()

    def is_available(self) -> bool:
        """Check if Unsplash API key is configured."""
        return bool(self._access_key)

    def search_image(
        self,
        query: str,
        orientation: str = "landscape",
        color: Optional[str] = None,
        target_ratio: Optional[float] = None,
    ) -> Optional[Path]:
        """
        Search Unsplash for the query and download the best candidate.

        Args:
            query: Search query string.
            orientation: "landscape" or "portrait".
            color: Optional color filter (Pexels color names are mapped).
            target_ratio: Target width/height ratio from user's design settings.

        Returns path to downloaded image file, or None on failure.
        """
        if not self._access_key:
            logger.warning("[UnsplashSourcer] UNSPLASH_ACCESS_KEY not set")
            return None

        try:
            headers = {
                "Authorization": f"Client-ID {self._access_key}",
                "Accept-Version": "v1",
            }

            page = random.randint(1, 3)
            params = {
                "query": query,
                "orientation": orientation,
                "per_page": 30,
                "page": page,
                "content_filter": "high",  # Safe for younger audiences
            }

            # Map color filter
            if color:
                unsplash_color = self._map_color(color)
                if unsplash_color:
                    params["color"] = unsplash_color

            color_log = f", color={color}" if color else ""
            logger.info(f"[UnsplashSourcer] Searching: {query!r} (orientation={orientation}{color_log})")

            resp = requests.get(UNSPLASH_SEARCH_URL, headers=headers, params=params, timeout=15)

            if resp.status_code == 403:
                remaining = resp.headers.get("X-Ratelimit-Remaining", "?")
                logger.warning(f"[UnsplashSourcer] Rate limited (403), remaining={remaining}")
                return None

            if resp.status_code == 401:
                logger.error("[UnsplashSourcer] Auth failed (401) — check UNSPLASH_ACCESS_KEY")
                return None

            resp.raise_for_status()
            data = resp.json()

            self._record_api_call()

            results = data.get("results", [])
            if not results:
                logger.warning(f"[UnsplashSourcer] No results for: {query!r}")
                return None

            # Filter and rank candidates
            candidates = self._rank_candidates(results, orientation=orientation, target_ratio=target_ratio)
            if not candidates:
                logger.warning(f"[UnsplashSourcer] No suitable candidates for: {query!r}")
                return None

            # Try downloading top candidates with dedup
            global _global_used_photo_ids
            for photo in candidates[:MAX_CANDIDATES]:
                photo_id = photo.get("id")
                if photo_id and (photo_id in self._used_photo_ids or photo_id in _global_used_photo_ids):
                    logger.debug(f"[UnsplashSourcer] Skipping duplicate {photo_id}")
                    continue

                # Use raw URL with custom width for optimal quality
                raw_url = photo.get("urls", {}).get("raw")
                if raw_url:
                    # Request image at exact width we need (Unsplash Imgix CDN)
                    download_url = f"{raw_url}&w=1200&q=80&fm=jpg&fit=crop"
                else:
                    # Fallback to regular (1080w)
                    download_url = photo.get("urls", {}).get("regular")

                if not download_url:
                    continue

                path = self._download_image(download_url)
                if path:
                    if photo_id:
                        self._used_photo_ids.add(photo_id)
                        if len(_global_used_photo_ids) >= _global_used_photo_ids_max:
                            _global_used_photo_ids.clear()
                        _global_used_photo_ids.add(photo_id)

                    # Trigger download event (Unsplash TOS requirement)
                    self._trigger_download(photo, headers)

                    photographer = photo.get("user", {}).get("name", "Unknown")
                    logger.info(f"[UnsplashSourcer] Downloaded image by {photographer} (id={photo_id})")
                    return path

            logger.warning(f"[UnsplashSourcer] All downloads failed for: {query!r}")
            return None

        except requests.exceptions.RequestException as e:
            logger.error(f"[UnsplashSourcer] API request error: {e}")
            return None
        except Exception as e:
            logger.error(f"[UnsplashSourcer] Error: {e}")
            return None

    def _map_color(self, color: str) -> Optional[str]:
        """Map a Pexels color name to an Unsplash color value."""
        color = color.lower()
        if color in VALID_UNSPLASH_COLORS:
            return color
        return PEXELS_TO_UNSPLASH_COLOR.get(color)

    def _rank_candidates(
        self,
        photos: list[dict],
        orientation: str = "landscape",
        target_ratio: Optional[float] = None,
    ) -> list[dict]:
        """Filter and rank candidates by aspect ratio closeness."""
        if orientation == "portrait":
            effective_target = target_ratio or TARGET_RATIO_PORTRAIT
            min_ratio = PORTRAIT_MIN_RATIO
            max_ratio = PORTRAIT_MAX_RATIO
        else:
            effective_target = target_ratio or TARGET_RATIO_LANDSCAPE
            min_ratio = LANDSCAPE_MIN_RATIO
            max_ratio = LANDSCAPE_MAX_RATIO

        scored = []
        for photo in photos:
            w = photo.get("width", 0)
            h = photo.get("height", 0)

            if not w or not h or h == 0:
                continue
            if w < MIN_DIMENSION or h < MIN_DIMENSION:
                continue

            ratio = w / h
            if ratio < min_ratio or ratio > max_ratio:
                continue

            distance = abs(ratio - effective_target)
            scored.append((distance, photo))

        scored.sort(key=lambda x: x[0])
        return [photo for _, photo in scored]

    def _download_image(self, url: str) -> Optional[Path]:
        """Download an image URL, validate it, and reject visually empty images."""
        try:
            resp = requests.get(url, timeout=15, headers={
                "User-Agent": "Mozilla/5.0 (compatible; ViralToby/1.0)",
            })
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            if not content_type.startswith("image/"):
                return None

            suffix = ".jpg"
            if "png" in content_type:
                suffix = ".png"
            elif "webp" in content_type:
                suffix = ".webp"

            path = Path(tempfile.mktemp(suffix=suffix))
            path.write_bytes(resp.content)

            # Validate with Pillow
            try:
                img = Image.open(path)
                img.verify()
            except Exception:
                path.unlink(missing_ok=True)
                return None

            # Visual complexity check
            if not self._has_sufficient_detail(path):
                logger.info(f"[UnsplashSourcer] Skipping low-detail image: {url[:60]}...")
                path.unlink(missing_ok=True)
                return None

            return path

        except Exception:
            return None

    def _has_sufficient_detail(self, path: Path) -> bool:
        """Check if image has enough visual detail (reject solid backgrounds)."""
        try:
            img = Image.open(path).convert("RGB")
            thumb = img.resize((100, 100), Image.LANCZOS)
            arr = np.array(thumb, dtype=np.float32)

            overall_std = arr.std()
            if overall_std < MIN_VISUAL_COMPLEXITY:
                return False

            avg_color = arr.mean(axis=(0, 1))
            distances = np.sqrt(((arr - avg_color) ** 2).sum(axis=2))
            close_pixels = (distances < 40).mean()
            if close_pixels > MAX_DOMINANT_COLOR_PCT:
                return False

            return True
        except Exception:
            return True

    def _trigger_download(self, photo: dict, headers: dict):
        """Trigger the Unsplash download endpoint (TOS requirement).

        This tells Unsplash a photo was used, giving the photographer credit.
        """
        try:
            download_location = photo.get("links", {}).get("download_location")
            if download_location:
                requests.get(download_location, headers=headers, timeout=5)
        except Exception:
            pass  # Non-critical — don't block on this

    def _record_api_call(self):
        """Record Unsplash API call for usage tracking."""
        if not self.db:
            return
        try:
            from app.models.api_usage import APIUsageLog
            log = APIUsageLog(api_name="unsplash", endpoint="search")
            self.db.add(log)
            self.db.commit()
        except Exception:
            try:
                self.db.rollback()
            except Exception:
                pass
