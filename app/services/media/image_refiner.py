"""
Image Refiner — the "Refinement" layer for the content pipeline.

Applies post-processing to sourced images before they enter the compositor.
This bridges the gap between raw stock photos (Pexels) and polished video output.

Refinement steps (all Pillow-based, zero API cost):
  1. Upscale — if image is below target box resolution, upscale with LANCZOS
  2. Auto-contrast — normalize histogram for better dynamic range
  3. Sharpness — subtle sharpening to counteract stock photo softness
  4. Color boost — slight saturation increase to make images pop on dark backgrounds
  5. Brightness normalization — ensure images aren't too dark or washed out

Design note: each step is individually toggleable and tuned to be subtle.
The goal is "better stock photo", not "Instagram filter".
"""
import logging
from pathlib import Path
from typing import Optional

from PIL import Image, ImageEnhance, ImageFilter, ImageStat

logger = logging.getLogger(__name__)

# ── Tuning knobs ──────────────────────────────────────────────
# Sharpness: 1.0 = original, >1 = sharper. Subtle boost.
SHARPNESS_FACTOR = 1.15

# Color saturation: 1.0 = original, >1 = more saturated.
SATURATION_FACTOR = 1.10

# Contrast: 1.0 = original, >1 = more contrast.
CONTRAST_FACTOR = 1.08

# Brightness target: mean pixel value we consider "well exposed" (0-255)
BRIGHTNESS_TARGET = 115
# How far from target before we correct (±)
BRIGHTNESS_TOLERANCE = 25
# Max brightness adjustment factor (safety clamp)
BRIGHTNESS_MAX_ADJUST = 1.35
BRIGHTNESS_MIN_ADJUST = 0.75

# Minimum resolution: below this, image gets upscaled before enhancement
MIN_USEFUL_PIXELS = 500  # on the shorter dimension


class ImageRefiner:
    """Applies post-processing refinements to sourced images."""

    def __init__(
        self,
        target_width: int = 910,
        target_height: int = 660,
        enable_upscale: bool = True,
        enable_sharpen: bool = True,
        enable_contrast: bool = True,
        enable_color: bool = True,
        enable_brightness: bool = True,
    ):
        self.target_width = target_width
        self.target_height = target_height
        self.enable_upscale = enable_upscale
        self.enable_sharpen = enable_sharpen
        self.enable_contrast = enable_contrast
        self.enable_color = enable_color
        self.enable_brightness = enable_brightness

    def refine(self, image_path: Path) -> Path:
        """
        Apply refinement pipeline to a single image file (in-place).

        Returns the same path (modified) or original on failure.
        """
        try:
            img = Image.open(image_path).convert("RGB")
            original_size = img.size

            # Step 1: Upscale if too small for the target box
            if self.enable_upscale:
                img = self._upscale_if_needed(img)

            # Step 2: Auto-contrast (histogram stretch)
            if self.enable_contrast:
                img = self._auto_contrast(img)

            # Step 3: Brightness normalization
            if self.enable_brightness:
                img = self._normalize_brightness(img)

            # Step 4: Color saturation boost
            if self.enable_color:
                img = self._boost_saturation(img)

            # Step 5: Sharpness (last — after all color work)
            if self.enable_sharpen:
                img = self._sharpen(img)

            # Save back
            img.save(str(image_path), quality=95)
            logger.info(
                f"[ImageRefiner] Refined {image_path.name}: "
                f"{original_size[0]}x{original_size[1]} → {img.size[0]}x{img.size[1]}"
            )
            return image_path

        except Exception as e:
            logger.warning(f"[ImageRefiner] Failed to refine {image_path}: {e}")
            return image_path  # Return original on any error

    def refine_batch(self, image_paths: list[Path]) -> list[Path]:
        """Refine multiple images. Returns paths (same list, modified in-place)."""
        return [self.refine(p) for p in image_paths]

    def _upscale_if_needed(self, img: Image.Image) -> Image.Image:
        """Upscale image if it's significantly smaller than the target box."""
        w, h = img.size
        min_dim = min(w, h)

        # Only upscale if the image is notably smaller than what we need
        needs_upscale = (
            w < self.target_width * 0.9 or
            h < self.target_height * 0.9 or
            min_dim < MIN_USEFUL_PIXELS
        )

        if not needs_upscale:
            return img

        # Calculate scale to reach at least target dimensions
        scale_w = self.target_width / w
        scale_h = self.target_height / h
        scale = max(scale_w, scale_h, 1.0)

        # Cap upscale at 2x to avoid extreme blurriness
        scale = min(scale, 2.0)

        if scale <= 1.05:  # Not worth upscaling for <5%
            return img

        new_w = int(w * scale)
        new_h = int(h * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)

        # Apply a slight unsharp mask after upscale to recover detail
        img = img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=80, threshold=2))

        logger.debug(f"[ImageRefiner] Upscaled {w}x{h} → {new_w}x{new_h} ({scale:.2f}x)")
        return img

    def _auto_contrast(self, img: Image.Image) -> Image.Image:
        """Subtle contrast enhancement — Pillow's autocontrast equivalent but gentler."""
        enhancer = ImageEnhance.Contrast(img)
        return enhancer.enhance(CONTRAST_FACTOR)

    def _normalize_brightness(self, img: Image.Image) -> Image.Image:
        """Adjust brightness if the image is too dark or too bright."""
        stat = ImageStat.Stat(img)
        # Weighted luminance from RGB means
        mean_brightness = (
            stat.mean[0] * 0.299 +
            stat.mean[1] * 0.587 +
            stat.mean[2] * 0.114
        )

        if abs(mean_brightness - BRIGHTNESS_TARGET) < BRIGHTNESS_TOLERANCE:
            return img  # Already well-exposed

        # Calculate adjustment factor
        factor = BRIGHTNESS_TARGET / max(mean_brightness, 1)
        factor = max(BRIGHTNESS_MIN_ADJUST, min(factor, BRIGHTNESS_MAX_ADJUST))

        enhancer = ImageEnhance.Brightness(img)
        result = enhancer.enhance(factor)
        logger.debug(
            f"[ImageRefiner] Brightness adjusted: mean={mean_brightness:.0f} → "
            f"factor={factor:.2f}"
        )
        return result

    def _boost_saturation(self, img: Image.Image) -> Image.Image:
        """Slight saturation increase — makes stock photos pop on dark backgrounds."""
        enhancer = ImageEnhance.Color(img)
        return enhancer.enhance(SATURATION_FACTOR)

    def _sharpen(self, img: Image.Image) -> Image.Image:
        """Subtle sharpening to counteract stock photo softness and upscale blur."""
        enhancer = ImageEnhance.Sharpness(img)
        return enhancer.enhance(SHARPNESS_FACTOR)
