"""
Thumbnail Compositor — composes Instagram reel thumbnails in @execute style.

Layout:
  - Top ~60%: main image (cover-fit, bottom gradient)
  - Divider line with centered logo
  - Bottom ~40%: black background + bold title text (golden yellow, ALL CAPS)
"""
import logging
import tempfile
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

W, H = 1080, 1920

# Default design values (used if TextVideoDesign is None)
DEFAULTS = {
    "thumbnail_image_ratio": 0.6,
    "thumbnail_title_color": "#FFD700",
    "thumbnail_title_font": "Anton",
    "thumbnail_title_size": 120,
    "thumbnail_title_max_lines": 4,
    "thumbnail_title_padding_x": 150,
    "thumbnail_divider_style": "line_with_logo",
    "thumbnail_divider_thickness": 4,
    "thumbnail_overlay_opacity": 90,
    "thumbnail_logo_size": 100,
}

# Font display name → TTF file mapping
FONT_MAP = {
    "Anton": "Anton-Regular.ttf",
    "Inter": "Inter/static/Inter_18pt-Bold.ttf",
    "Poppins": "Poppins-Bold.ttf",
    "Oswald": "Poppins-Bold.ttf",
    "Montserrat": "Poppins-Bold.ttf",
    "Bebas Neue": "Anton-Regular.ttf",
    "Roboto Condensed": "Inter/static/Inter_18pt-Bold.ttf",
}


class ThumbnailCompositor:
    """Composes Instagram reel thumbnails in the @execute style."""

    def compose_thumbnail(
        self,
        main_image_path: Path,
        title_lines: list[str],
        logo_path: Optional[Path] = None,
        design=None,
    ) -> Path:
        """
        Compose a thumbnail: top image + divider + bottom title text.

        Args:
            main_image_path: Path to the main image
            title_lines: Title text split into lines (ALL CAPS)
            logo_path: Path to brand logo (optional)
            design: TextVideoDesign model instance (optional)

        Returns:
            Path to the composed thumbnail JPEG (1080x1920)
        """
        canvas = Image.new("RGB", (W, H), (0, 0, 0))
        draw = ImageDraw.Draw(canvas)

        # Get design values
        image_ratio = self._get(design, "thumbnail_image_ratio")
        title_color = self._get(design, "thumbnail_title_color")
        title_font_name = self._get(design, "thumbnail_title_font")
        title_size = self._get(design, "thumbnail_title_size")
        title_padding = self._get(design, "thumbnail_title_padding_x")
        divider_thickness = self._get(design, "thumbnail_divider_thickness")
        overlay_opacity = self._get(design, "thumbnail_overlay_opacity")
        logo_size = self._get(design, "thumbnail_logo_size")

        # 1. Place main image in top portion
        image_h = int(H * image_ratio)
        try:
            main_img = Image.open(main_image_path).convert("RGB")
            main_img = self._cover_fit(main_img, W, image_h)
            canvas.paste(main_img, (0, 0))
        except Exception as e:
            logger.error(f"[ThumbnailCompositor] Failed to load main image: {e}")
            draw.rectangle([(0, 0), (W, image_h)], fill=(30, 30, 30))

        # 2. Bottom gradient on image (blends into divider area)
        grad_h = max(80, int(image_h * 0.15))
        gradient = Image.new("RGBA", (W, grad_h), (0, 0, 0, 0))
        overlay_alpha = int(255 * overlay_opacity / 100)
        for y in range(grad_h):
            alpha = int(overlay_alpha * (y / grad_h))
            for x in range(W):
                gradient.putpixel((x, y), (0, 0, 0, alpha))
        canvas.paste(
            Image.composite(
                gradient.convert("RGB"),
                canvas.crop((0, image_h - grad_h, W, image_h)),
                gradient.split()[3],
            ),
            (0, image_h - grad_h),
        )

        # 3. Divider line + logo
        divider_y = image_h + 10
        draw.line([(40, divider_y), (W - 40, divider_y)], fill=(80, 80, 80), width=divider_thickness)

        if logo_path and Path(logo_path).exists():
            try:
                logo = Image.open(logo_path).convert("RGBA")
                logo = logo.resize((logo_size, logo_size), Image.LANCZOS)
                logo_x = (W - logo_size) // 2
                half = logo_size // 2
                draw.rectangle(
                    [(logo_x - 10, divider_y - half), (logo_x + logo_size + 10, divider_y + half)],
                    fill=(0, 0, 0),
                )
                canvas.paste(logo, (logo_x, divider_y - half), logo)
            except Exception as e:
                logger.warning(f"[ThumbnailCompositor] Logo load failed: {e}")

        # 4. Title text in bottom portion
        title_y_start = divider_y + title_padding
        font = self._load_font(title_font_name, title_size)

        for i, line in enumerate(title_lines):
            text_bbox = draw.textbbox((0, 0), line, font=font)
            text_w = text_bbox[2] - text_bbox[0]
            text_h = text_bbox[3] - text_bbox[1]
            x = (W - text_w) // 2
            y = title_y_start + i * (text_h + 15)
            draw.text((x, y), line, fill=title_color, font=font)

        # 5. Save
        output = Path(tempfile.mktemp(suffix="_thumb.jpg"))
        canvas.save(str(output), "JPEG", quality=95)
        return output

    def _cover_fit(self, img: Image.Image, target_w: int, target_h: int) -> Image.Image:
        """Scale image to cover target dimensions, then center-crop."""
        ratio_w = target_w / img.width
        ratio_h = target_h / img.height
        scale = max(ratio_w, ratio_h)

        new_w = int(img.width * scale)
        new_h = int(img.height * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)

        left = (new_w - target_w) // 2
        top = (new_h - target_h) // 2
        return img.crop((left, top, left + target_w, top + target_h))

    def _load_font(self, name: str, size: int) -> ImageFont.FreeTypeFont:
        """Load a font from assets/fonts/, mapping display names to TTF files."""
        # Try mapped font name first
        mapped = FONT_MAP.get(name)
        if mapped:
            font_path = Path("assets/fonts") / mapped
            try:
                return ImageFont.truetype(str(font_path), size)
            except Exception:
                pass

        # Try direct filename (e.g., "Anton-Regular.ttf")
        font_path = Path("assets/fonts") / name
        try:
            return ImageFont.truetype(str(font_path), size)
        except Exception:
            for fallback in ["assets/fonts/Anton-Regular.ttf", "assets/fonts/Poppins-Bold.ttf"]:
                try:
                    return ImageFont.truetype(fallback, size)
                except Exception:
                    continue
            return ImageFont.load_default()

    def _get(self, design, key: str):
        """Get a design value with fallback to defaults."""
        if design and hasattr(design, key):
            val = getattr(design, key)
            if val is not None:
                return val
        return DEFAULTS.get(key)
