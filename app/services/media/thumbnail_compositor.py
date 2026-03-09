"""
Thumbnail Compositor — composes Instagram reel thumbnails.

Layout (matches design editor preview):
  - Full-bleed background image (cover-fit, entire frame)
  - Dark gradient overlay from bottom (strong at bottom, transparent at top)
  - Content pinned to bottom:
    - Divider line with centered logo (supports gradient/solid/none styles)
    - Title text below divider (bold, ALL CAPS, auto-sized to 2-3 lines)
    - paddingBottom from bottom edge
"""
import logging
import tempfile
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

W, H = 1080, 1920

# Default design values (used if FormatBDesign is None)
DEFAULTS = {
    "thumbnail_title_color": "#FFD700",
    "thumbnail_title_font": "Anton",
    "thumbnail_title_size": 120,
    "thumbnail_title_max_lines": 4,
    "thumbnail_title_padding_x": 220,
    "thumbnail_divider_style": "line_with_logo",
    "thumbnail_divider_thickness": 4,
    "thumbnail_overlay_opacity": 80,
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

SIDE_PADDING = 55     # px from left/right edges for title text
LINE_LOGO_GAP = 20    # px between divider line end and logo
DIVIDER_TITLE_GAP = 24  # px between divider and title top


class ThumbnailCompositor:
    """Composes Instagram reel thumbnails matching the design editor layout."""

    def compose_thumbnail(
        self,
        main_image_path: Path,
        title_lines: list[str],
        logo_path: Optional[Path] = None,
        design=None,
    ) -> Path:
        """
        Compose a thumbnail: full-bleed image + dark bottom gradient + divider + title.

        Args:
            main_image_path: Path to the main image
            title_lines: Title text split into lines (ALL CAPS)
            logo_path: Path to brand logo (optional)
            design: FormatBDesign model instance (optional)

        Returns:
            Path to the composed thumbnail JPEG (1080x1920)
        """
        # Get design values
        title_color = self._get(design, "thumbnail_title_color")
        title_font_name = self._get(design, "thumbnail_title_font")
        title_padding_bottom = self._get(design, "thumbnail_title_padding_x")
        divider_style = self._get(design, "thumbnail_divider_style")
        divider_thickness = self._get(design, "thumbnail_divider_thickness")
        overlay_opacity = self._get(design, "thumbnail_overlay_opacity")
        logo_size = self._get(design, "thumbnail_logo_size")

        # 1. Full-bleed background image (cover-fit to entire frame)
        canvas = Image.new("RGB", (W, H), (0, 0, 0))
        try:
            main_img = Image.open(main_image_path).convert("RGB")
            main_img = self._cover_fit(main_img, W, H)
            canvas.paste(main_img, (0, 0))
        except Exception as e:
            logger.error(f"[ThumbnailCompositor] Failed to load main image: {e}")

        # 2. Dark gradient overlay from bottom
        overlay_alpha = (overlay_opacity + 20) / 100
        gradient = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for y in range(H):
            # Progress from bottom (0.0 = top, 1.0 = bottom)
            frac = y / H
            if frac < 0.35:
                alpha = 0
            elif frac < 0.65:
                # Fade in from 35% to 65%
                t = (frac - 0.35) / 0.30
                alpha = int(255 * overlay_alpha * 0.3 * t)
            else:
                # Solid from 65% to 100%
                t = (frac - 0.65) / 0.35
                alpha = int(255 * overlay_alpha * (0.3 + 0.7 * t))
            alpha = min(alpha, 255)  # clamp for >100% intensity
            # Draw full row at once (much faster than putpixel)
            gradient.paste(Image.new("RGBA", (W, 1), (0, 0, 0, alpha)), (0, y))
        canvas = Image.alpha_composite(canvas.convert("RGBA"), gradient).convert("RGB")
        draw = ImageDraw.Draw(canvas)

        # 3. Auto-size title to fit 2-3 lines within available width
        title_area_width = W - SIDE_PADDING * 2
        raw_title = " ".join(title_lines).upper()
        auto_lines, auto_font_size = self._auto_fit_title(
            draw, raw_title, title_font_name, title_area_width
        )

        font = self._load_font(title_font_name, auto_font_size)
        line_height = int(auto_font_size * 1.05)

        # Calculate total content height (from divider top to title bottom)
        title_block_height = len(auto_lines) * line_height
        divider_height = logo_size if (divider_style != "none" and logo_path) else divider_thickness
        total_content_h = divider_height + DIVIDER_TITLE_GAP + title_block_height

        # Position content pinned to bottom
        content_bottom = H - title_padding_bottom
        title_top_y = content_bottom - title_block_height
        divider_center_y = title_top_y - DIVIDER_TITLE_GAP - divider_height // 2

        # 4. Divider line + logo
        if divider_style != "none":
            self._draw_divider(
                canvas, draw, divider_center_y, divider_style,
                divider_thickness, logo_path, logo_size
            )

        # 5. Title text (centered, ALL CAPS)
        title_color_rgb = self._hex_to_rgb(title_color)
        for i, line in enumerate(auto_lines):
            text_bbox = draw.textbbox((0, 0), line, font=font)
            text_w = text_bbox[2] - text_bbox[0]
            x = (W - text_w) // 2
            y = title_top_y + i * line_height
            # Text shadow for depth
            draw.text((x + 2, y + 2), line, fill=(0, 0, 0), font=font)
            draw.text((x, y), line, fill=title_color_rgb, font=font)

        # 6. Save
        output = Path(tempfile.mktemp(suffix="_thumb.jpg"))
        canvas.save(str(output), "JPEG", quality=95)
        return output

    def _draw_divider(
        self, canvas: Image.Image, draw: ImageDraw.ImageDraw,
        center_y: int, style: str, thickness: int,
        logo_path: Optional[Path], logo_size: int,
    ):
        """Draw divider line with centered logo."""
        has_logo = logo_path and Path(logo_path).exists()
        logo_img = None

        if has_logo:
            try:
                logo_img = Image.open(logo_path).convert("RGBA")
                logo_img = logo_img.resize((logo_size, logo_size), Image.LANCZOS)
            except Exception as e:
                logger.warning(f"[ThumbnailCompositor] Logo load failed: {e}")
                logo_img = None

        if logo_img:
            logo_x = (W - logo_size) // 2
            logo_y = center_y - logo_size // 2
            # Lines on each side of logo
            line_y = center_y
            left_end = logo_x - LINE_LOGO_GAP
            right_start = logo_x + logo_size + LINE_LOGO_GAP

            if style == "gradient":
                self._draw_gradient_line(draw, SIDE_PADDING, left_end, line_y, thickness, from_transparent=True)
                self._draw_gradient_line(draw, right_start, W - SIDE_PADDING, line_y, thickness, from_transparent=False)
            else:
                draw.line([(SIDE_PADDING, line_y), (left_end, line_y)], fill=(255, 255, 255), width=thickness)
                draw.line([(right_start, line_y), (W - SIDE_PADDING, line_y)], fill=(255, 255, 255), width=thickness)

            # Paste logo
            canvas_rgba = canvas.convert("RGBA")
            canvas_rgba.paste(logo_img, (logo_x, logo_y), logo_img)
            canvas.paste(canvas_rgba.convert("RGB"))
        else:
            # No logo — just draw full-width line
            line_y = center_y
            if style == "gradient":
                half = W // 2
                self._draw_gradient_line(draw, SIDE_PADDING, half, line_y, thickness, from_transparent=True)
                self._draw_gradient_line(draw, half, W - SIDE_PADDING, line_y, thickness, from_transparent=False)
            elif style != "none":
                draw.line([(SIDE_PADDING, line_y), (W - SIDE_PADDING, line_y)], fill=(255, 255, 255), width=thickness)

    def _draw_gradient_line(
        self, draw: ImageDraw.ImageDraw, x1: int, x2: int,
        y: int, thickness: int, from_transparent: bool,
    ):
        """Draw a horizontal gradient line (transparent→white or white→transparent)."""
        width = x2 - x1
        if width <= 0:
            return
        for i in range(width):
            t = i / max(width - 1, 1)
            if from_transparent:
                alpha = int(255 * 0.7 * t)
            else:
                alpha = int(255 * 0.7 * (1 - t))
            x = x1 + i
            color = (alpha, alpha, alpha)
            draw.line([(x, y - thickness // 2), (x, y + thickness // 2)], fill=color, width=1)

    def _auto_fit_title(
        self, draw: ImageDraw.ImageDraw, title: str,
        font_name: str, max_width: int,
    ) -> tuple[list[str], int]:
        """
        Auto-fit title text. Prefers 2 lines first (largest font that fits),
        falls back to 3 lines if text is too long for 2.
        Subtracts 2px from found size for breathing room, then re-wraps.
        """
        wrap_width = int(max_width * 0.98)

        # First pass: try to fit in 2 lines
        for size in range(300, 19, -2):
            font = self._load_font(font_name, size)
            lines = self._greedy_wrap(draw, title, font, wrap_width)
            if len(lines) <= 2:
                final = max(20, size - 2)
                final_font = self._load_font(font_name, final)
                return self._greedy_wrap(draw, title, final_font, wrap_width), final

        # Second pass: text too long for 2 lines, try 3
        for size in range(300, 19, -2):
            font = self._load_font(font_name, size)
            lines = self._greedy_wrap(draw, title, font, wrap_width)
            if len(lines) <= 3:
                final = max(20, size - 2)
                final_font = self._load_font(font_name, final)
                return self._greedy_wrap(draw, title, final_font, wrap_width), final

        # Fallback: 4 lines at minimum size
        font = self._load_font(font_name, 20)
        return self._greedy_wrap(draw, title, font, wrap_width), 20

    def _greedy_wrap(
        self, draw: ImageDraw.ImageDraw, text: str,
        font: ImageFont.FreeTypeFont, max_width: int,
    ) -> list[str]:
        """Word-wrap text greedily to fit within max_width pixels."""
        words = text.split()
        lines = []
        current = ""
        for word in words:
            test = f"{current} {word}".strip()
            bbox = draw.textbbox((0, 0), test, font=font)
            if bbox[2] - bbox[0] <= max_width:
                current = test
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines

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
        mapped = FONT_MAP.get(name)
        if mapped:
            font_path = Path("assets/fonts") / mapped
            try:
                return ImageFont.truetype(str(font_path), size)
            except Exception:
                pass
        # Try direct filename
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

    @staticmethod
    def _hex_to_rgb(hex_color: str) -> tuple:
        """Convert hex color string to RGB tuple."""
        try:
            hc = hex_color.lstrip("#")
            return tuple(int(hc[i:i+2], 16) for i in (0, 2, 4))
        except Exception:
            return (255, 215, 0)

    def _get(self, design, key: str):
        """Get a design value with fallback to defaults."""
        if design and hasattr(design, key):
            val = getattr(design, key)
            if val is not None:
                return val
        return DEFAULTS.get(key)
