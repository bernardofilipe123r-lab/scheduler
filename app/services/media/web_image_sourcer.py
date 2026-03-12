"""
Web Image Sourcer — fetches real images from Pexels API.

Used for Format B video slide images when FORMAT_B_IMAGE_SOURCE=web.
Thumbnails always use AI-generated images (Freepik/DeAPI), not this service.

Candidate selection strategy:
  - Search Pexels for landscape-oriented photos matching the query
  - Prefer images closest to 1.38:1 (the slideshow image box ratio: 910x660)
  - Minimum resolution: 400px on both dimensions
  - Try top candidates in order until one downloads successfully

Pexels attribution: "Photos provided by Pexels" — link back required per TOS.
Rate limit: 200 requests/hour, 20,000 requests/month (free).

Fallback: returns None → caller falls back to Freepik/DeAPI.
"""
import logging
import os
import tempfile
from pathlib import Path
from typing import Optional

import requests
from PIL import Image

logger = logging.getLogger(__name__)

PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"

# Target aspect ratio for slideshow image box (910w / 660h ≈ 1.38)
TARGET_RATIO = 910 / 660  # ~1.378

# Accept images with aspect ratio between 1.0 (square) and 2.0 (wide landscape)
MIN_RATIO = 1.0
MAX_RATIO = 2.0

# Minimum resolution — below this images look blurry when scaled
MIN_DIMENSION = 400

# How many candidate images to try before giving up
MAX_CANDIDATES = 5


class WebImageSourcer:
    """Fetches real web images via Pexels Search API."""

    def __init__(self, db=None):
        self.db = db
        self._api_key = os.environ.get("PEXELS_API_KEY")

    def is_available(self) -> bool:
        """Check if Pexels API key is configured."""
        return bool(self._api_key)

    def search_image(self, query: str) -> Optional[Path]:
        """
        Search Pexels for the query and download the best candidate.

        Returns path to downloaded image file, or None on any failure.
        """
        if not self._api_key:
            logger.warning("[WebImageSourcer] PEXELS_API_KEY not set")
            return None

        try:
            headers = {
                "Authorization": self._api_key,
            }
            params = {
                "query": query,
                "orientation": "landscape",
                "per_page": 15,
            }

            logger.info(f"[WebImageSourcer] Pexels searching: {query!r}")
            resp = requests.get(PEXELS_SEARCH_URL, headers=headers, params=params, timeout=15)

            if resp.status_code == 429:
                logger.warning("[WebImageSourcer] Pexels rate limited (429)")
                return None

            if resp.status_code == 401:
                logger.error("[WebImageSourcer] Pexels auth failed (401)")
                return None

            resp.raise_for_status()
            data = resp.json()

            # Track the API call
            self._record_api_call()

            # Get photo results
            photos = data.get("photos", [])
            if not photos:
                logger.warning(f"[WebImageSourcer] No Pexels results for: {query!r}")
                return None

            # Filter and rank candidates
            candidates = self._rank_candidates(photos)
            if not candidates:
                logger.warning(f"[WebImageSourcer] No suitable Pexels candidates for: {query!r}")
                return None

            # Try downloading top candidates
            for photo in candidates[:MAX_CANDIDATES]:
                # Use 'landscape' size (1200x627) — good quality, not too large
                url = photo.get("src", {}).get("landscape") or photo.get("src", {}).get("large")
                if not url:
                    continue

                path = self._download_image(url)
                if path:
                    photographer = photo.get("photographer", "Unknown")
                    logger.info(f"[WebImageSourcer] Downloaded Pexels image by {photographer}: {url[:80]}...")
                    return path

            logger.warning(f"[WebImageSourcer] All Pexels candidate downloads failed for: {query!r}")
            return None

        except requests.exceptions.RequestException as e:
            logger.error(f"[WebImageSourcer] Pexels API request error: {e}")
            return None
        except Exception as e:
            logger.error(f"[WebImageSourcer] Error: {e}")
            return None

    def _rank_candidates(self, photos: list[dict]) -> list[dict]:
        """
        Filter and rank photo candidates by suitability.

        Filters:
          - Must have width and height metadata
          - Aspect ratio between 1.0 and 2.0
          - Both dimensions >= MIN_DIMENSION

        Ranks by closeness to TARGET_RATIO (1.38:1).
        """
        scored = []
        for photo in photos:
            w = photo.get("width", 0)
            h = photo.get("height", 0)

            if not w or not h or h == 0:
                continue

            if w < MIN_DIMENSION or h < MIN_DIMENSION:
                continue

            ratio = w / h
            if ratio < MIN_RATIO or ratio > MAX_RATIO:
                continue

            # Score: distance from target ratio (lower = better)
            distance = abs(ratio - TARGET_RATIO)
            scored.append((distance, photo))

        # Sort by distance (closest to target ratio first)
        scored.sort(key=lambda x: x[0])
        return [photo for _, photo in scored]

    def _download_image(self, url: str) -> Optional[Path]:
        """Download an image URL and validate it can be opened by Pillow."""
        try:
            resp = requests.get(url, timeout=15, headers={
                "User-Agent": "Mozilla/5.0 (compatible; ViralToby/1.0)",
            })
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            if not content_type.startswith("image/"):
                return None

            # Save to temp file
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

            return path

        except Exception:
            return None

    def _record_api_call(self):
        """Record Pexels API call for usage tracking."""
        if not self.db:
            return
        try:
            from app.models.api_usage import APIUsageLog
            log = APIUsageLog(api_name="pexels", endpoint="search")
            self.db.add(log)
            self.db.commit()
        except Exception:
            try:
                self.db.rollback()
            except Exception:
                pass

        # Cost tracking (Pexels is free, but track for monitoring)
        try:
            from app.services.monitoring.cost_tracker import record_pexels_call
            record_pexels_call()
        except Exception:
            pass
