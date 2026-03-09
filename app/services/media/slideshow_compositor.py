"""
Slideshow Compositor — creates TEXT-VIDEO (Format B) reel MP4s.

Layout matches the design editor preview:
  - Black background
  - Brand header at top (logo + name + verified + handle)
  - Text content (word-wrapped paragraph)
  - Image area at bottom (crossfade slideshow)

Pipeline:
  1. Pre-process each image into the image-box area on a black canvas
  2. Render brand header + text as transparent overlay PNG (Pillow)
  3. Build crossfade slideshow from pre-processed frames (FFmpeg)
  4. Overlay header+text on slideshow
  5. Add black fade-in
  6. Add music with fadeout
  7. Export as 1080x1920 MP4
"""
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

W, H = 1080, 1920

# Font display name → TTF file mapping
FONT_MAP = {
    "Anton": "Anton-Regular.ttf",
    "Inter": "Inter/static/Inter_18pt-Regular.ttf",
    "Poppins": "Poppins-Regular.ttf",
    "Oswald": "Poppins-Regular.ttf",
    "Montserrat": "Poppins-Regular.ttf",
    "Bebas Neue": "Anton-Regular.ttf",
    "Roboto Condensed": "Inter/static/Inter_18pt-Regular.ttf",
}

FONT_MAP_BOLD = {
    "Anton": "Anton-Regular.ttf",
    "Inter": "Inter/static/Inter_18pt-Bold.ttf",
    "Poppins": "Poppins-Bold.ttf",
    "Oswald": "Poppins-Bold.ttf",
    "Montserrat": "Poppins-Bold.ttf",
    "Bebas Neue": "Anton-Regular.ttf",
    "Roboto Condensed": "Inter/static/Inter_18pt-Bold.ttf",
}

# Default design values — aligned with TextVideoDesign model defaults
DEFAULTS = {
    "reel_text_font": "Inter",
    "reel_text_size": 38,
    "reel_line_spacing": 20,
    "reel_text_font_bold": False,
    "image_duration": 3.0,
    "image_fade_duration": 0.2,
    "reel_total_duration": 15,
    "black_fade_duration": 1.0,
    "reel_show_logo": True,
    "reel_show_handle": True,
    "reel_music_enabled": True,
    # Frame layout
    "reel_padding_top": 320,
    "reel_padding_bottom": 40,
    "reel_padding_left": 85,
    "reel_padding_right": 85,
    "reel_section_gap": 40,
    "reel_image_height": 660,
    "reel_logo_size": 96,
    "reel_brand_name_color": "#FFFFFF",
    "reel_brand_name_size": 42,
    "reel_handle_color": "#AAAAAA",
    "reel_handle_size": 32,
    "reel_header_scale": 1.15,
    "reel_text_color": "#FFFFFF",
}

VERIFIED_BADGE_PATH = Path("assets/reel_video/logo/verified.png")


class SlideshowCompositor:
    """Composes the TEXT-VIDEO reel: brand header + text + image slideshow + music."""

    def compose_reel(
        self,
        image_paths: list[Path],
        reel_lines: list[str],
        output_path: Path,
        design=None,
        music_path: Optional[Path] = None,
        logo_path: Optional[Path] = None,
        brand_name: Optional[str] = None,
        handle: Optional[str] = None,
    ) -> Optional[Path]:
        """
        Compose the final reel video matching the design editor layout.

        Args:
            image_paths: 3-4 source images for the slideshow area
            reel_lines: Text content lines (will be joined + word-wrapped)
            output_path: Where to save the MP4
            design: TextVideoDesign model instance (optional)
            music_path: Path to background music
            logo_path: Path to brand logo image
            brand_name: Brand display name for the header
            handle: Instagram handle for the header

        Returns:
            Path to output MP4, or None on failure.
        """
        if not image_paths:
            logger.error("[SlideshowCompositor] No images provided")
            return None

        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Calculate layout positions
        padding_top = self._get(design, "reel_padding_top")
        padding_left = self._get(design, "reel_padding_left")
        padding_right = self._get(design, "reel_padding_right")
        gap = self._get(design, "reel_section_gap")
        image_height = self._get(design, "reel_image_height")
        header_scale = self._get(design, "reel_header_scale")
        logo_size = int(self._get(design, "reel_logo_size") * header_scale)

        # Measure header height
        show_logo = self._get(design, "reel_show_logo")
        show_handle = self._get(design, "reel_show_handle")
        brand_name_size = int(self._get(design, "reel_brand_name_size") * header_scale)
        handle_size_val = int(self._get(design, "reel_handle_size") * header_scale)

        header_height = max(logo_size, brand_name_size + (handle_size_val + 4 if show_handle else 0))

        # Calculate layout
        content_width = W - padding_left - padding_right
        padding_bottom = self._get(design, "reel_padding_bottom")

        # Step 1: Render header + text overlay to find where text ends
        # First pass: generous clamp (full canvas) to measure actual text height
        overlay_path, text_end_y = self.render_text_overlay(
            reel_lines, design=design, logo_path=logo_path,
            brand_name=brand_name, handle=handle,
            image_box_y=H,  # no clamp — measure natural text end
        )

        # Place image right after text + gap (matches frontend flexbox layout)
        image_box_y = text_end_y + gap

        # If image would overflow bottom, cap it and re-render text with clamp
        if image_box_y + image_height > H - padding_bottom:
            image_box_y = H - padding_bottom - image_height
            overlay_path.unlink(missing_ok=True)
            overlay_path, _ = self.render_text_overlay(
                reel_lines, design=design, logo_path=logo_path,
                brand_name=brand_name, handle=handle,
                image_box_y=image_box_y,
            )

        # Step 2: Pre-process images into the image-box area on black canvas
        prepared_paths = []
        for img_path in image_paths:
            prepared = self._prepare_frame_image(
                img_path, content_width, image_height,
                padding_left, image_box_y
            )
            prepared_paths.append(prepared)

        # Step 3-6: Compose with FFmpeg
        success = self._compose_with_ffmpeg(
            image_paths=prepared_paths,
            text_overlay_path=overlay_path,
            music_path=music_path,
            output_path=output_path,
            design=design,
        )

        # Cleanup temp files
        for p in prepared_paths:
            try:
                p.unlink(missing_ok=True)
            except Exception:
                pass
        try:
            overlay_path.unlink(missing_ok=True)
        except Exception:
            pass

        if success:
            return output_path
        return None

    def render_text_overlay(
        self,
        reel_lines: list[str],
        design=None,
        logo_path: Optional[Path] = None,
        brand_name: Optional[str] = None,
        handle: Optional[str] = None,
        image_box_y: int = 1220,
    ) -> tuple[Path, int]:
        """
        Render the header + text overlay as a transparent PNG.

        Returns (overlay_path, text_end_y) — the Y position where text ended.

        Layout (matches design editor preview):
        - Brand header at padding_top: [logo] [name + verified] / [handle]
        - Gap
        - Text content: word-wrapped paragraph
        - (Image area is handled separately via pre-processed frame images)
        """
        padding_top = self._get(design, "reel_padding_top")
        padding_left = self._get(design, "reel_padding_left")
        padding_right = self._get(design, "reel_padding_right")
        gap = self._get(design, "reel_section_gap")
        header_scale = self._get(design, "reel_header_scale")
        show_logo = self._get(design, "reel_show_logo")
        show_handle = self._get(design, "reel_show_handle")
        font_bold = self._get(design, "reel_text_font_bold")

        # Scaled header sizes
        logo_size = int(self._get(design, "reel_logo_size") * header_scale)
        brand_name_size = int(self._get(design, "reel_brand_name_size") * header_scale)
        handle_size_val = int(self._get(design, "reel_handle_size") * header_scale)
        brand_name_color = self._get(design, "reel_brand_name_color")
        handle_color = self._get(design, "reel_handle_color")

        # Text settings
        font_name = self._get(design, "reel_text_font")
        font_size = self._get(design, "reel_text_size")

        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        content_width = W - padding_left - padding_right
        cursor_y = padding_top

        # ── Brand Header ──────────────────────────────────────
        header_x = padding_left
        logo_bottom = cursor_y

        if show_logo and logo_path and Path(logo_path).exists():
            try:
                logo = Image.open(logo_path).convert("RGBA")
                logo = logo.resize((logo_size, logo_size), Image.LANCZOS)
                # Circular mask
                mask = Image.new("L", (logo_size, logo_size), 0)
                mask_draw = ImageDraw.Draw(mask)
                mask_draw.ellipse((0, 0, logo_size, logo_size), fill=255)
                # White circle border
                border_w = max(1, logo_size // 40)
                draw.ellipse(
                    (header_x - border_w, cursor_y - border_w,
                     header_x + logo_size + border_w, cursor_y + logo_size + border_w),
                    outline=(255, 255, 255), width=border_w
                )
                overlay.paste(logo, (header_x, cursor_y), mask)
                logo_bottom = cursor_y + logo_size
                header_x += logo_size + int(12 * header_scale)
            except Exception as e:
                logger.warning(f"[SlideshowCompositor] Logo load failed: {e}")

        # Brand name + verified badge
        if brand_name:
            name_color = self._hex_to_rgb(brand_name_color)
            name_font = self._resolve_font(font_name, brand_name_size, bold=True)
            name_bbox = draw.textbbox((0, 0), brand_name, font=name_font)
            name_h = name_bbox[3] - name_bbox[1]
            name_w = name_bbox[2] - name_bbox[0]

            # Vertically-center name within logo height if logo is shown
            name_y = cursor_y + (max(0, logo_size - name_h - (handle_size_val + 4 if show_handle and handle else 0)) // 2) if show_logo else cursor_y
            draw.text((header_x, name_y), brand_name, fill=name_color, font=name_font)

            # Verified badge
            badge_size = int(brand_name_size * 0.85)
            badge_x = header_x + name_w + int(4 * header_scale)
            if VERIFIED_BADGE_PATH.exists():
                try:
                    badge = Image.open(VERIFIED_BADGE_PATH).convert("RGBA")
                    badge = badge.resize((badge_size, badge_size), Image.LANCZOS)
                    badge_y = name_y + (name_h - badge_size) // 2
                    overlay.paste(badge, (badge_x, badge_y), badge)
                except Exception:
                    pass

            # Handle below name
            if show_handle and handle:
                h_color = self._hex_to_rgb(handle_color)
                h_font = self._resolve_font(font_name, handle_size_val, bold=False)
                handle_text = handle if handle.startswith("@") else f"@{handle}"
                draw.text((header_x, name_y + name_h + 4), handle_text, fill=h_color, font=h_font)

        cursor_y = max(logo_bottom, cursor_y + int(brand_name_size * 1.5)) + gap

        # ── Text Content (word-wrapped paragraph) ─────────────
        text_font = self._resolve_font(font_name, font_size, bold=font_bold)
        text_color = self._hex_to_rgb(self._get(design, "reel_text_color"))
        line_height = int(font_size * 1.45)

        # Join lines into a single paragraph, then word-wrap
        paragraph = " ".join(line.strip() for line in reel_lines if line.strip())
        wrapped_lines = self._word_wrap(draw, paragraph, text_font, content_width)

        # Only draw text up to the image box area
        max_text_y = image_box_y - gap
        for line in wrapped_lines:
            if cursor_y + line_height > max_text_y:
                break
            draw.text((padding_left, cursor_y), line, fill=text_color, font=text_font)
            cursor_y += line_height

        output = Path(tempfile.mktemp(suffix="_overlay.png"))
        overlay.save(str(output), "PNG")
        return output, cursor_y

    def _prepare_frame_image(
        self,
        image_path: Path,
        box_width: int,
        box_height: int,
        box_x: int,
        box_y: int,
    ) -> Path:
        """
        Place an image in the correct box position on a black 1080x1920 canvas.
        This preprocesses each slideshow image so FFmpeg crossfade works on full frames.
        """
        canvas = Image.new("RGB", (W, H), (0, 0, 0))
        try:
            img = Image.open(image_path).convert("RGB")
            img = self._cover_fit(img, box_width, box_height)
            # Round corners
            img = self._round_corners(img, radius=20)
            canvas.paste(img, (box_x, box_y))
        except Exception as e:
            logger.error(f"[SlideshowCompositor] Failed to load image {image_path}: {e}")

        output = Path(tempfile.mktemp(suffix="_frame.jpg"))
        canvas.save(str(output), "JPEG", quality=95)
        return output

    def _compose_with_ffmpeg(
        self,
        image_paths: list[Path],
        text_overlay_path: Path,
        music_path: Optional[Path],
        output_path: Path,
        design=None,
    ) -> bool:
        """Build and execute the FFmpeg command for slideshow + overlay + music."""
        duration_per_image = self._get(design, "image_duration")
        fade_duration = self._get(design, "image_fade_duration")
        black_fade = self._get(design, "black_fade_duration")
        n = len(image_paths)

        total_duration = n * duration_per_image - (n - 1) * fade_duration

        # Build input arguments
        inputs = []
        for img_path in image_paths:
            inputs.extend([
                "-loop", "1",
                "-t", str(duration_per_image + fade_duration),
                "-i", str(img_path),
            ])
        # Text overlay input
        inputs.extend(["-i", str(text_overlay_path)])

        # Build filter_complex
        filter_parts = []

        if n == 1:
            filter_parts.append(f"[0:v]scale={W}:{H},setsar=1,format=yuv420p[bg]")
        else:
            # Scale all inputs first
            for i in range(n):
                filter_parts.append(f"[{i}:v]scale={W}:{H},setsar=1[s{i}]")

            # Crossfade chain
            prev = "s0"
            for i in range(1, n):
                offset = round(i * duration_per_image - fade_duration * i, 2)
                out_label = f"v{i}"
                filter_parts.append(
                    f"[{prev}][s{i}]xfade=transition=fade:duration={fade_duration}:offset={offset}[{out_label}]"
                )
                prev = out_label
            filter_parts.append(f"[{prev}]format=yuv420p[bg]")

        # Overlay text
        text_input_idx = n
        filter_parts.append(f"[bg][{text_input_idx}:v]overlay=0:0[textbg]")

        # Black fade-in (first 1 second)
        filter_parts.append(
            f"[textbg]fade=type=in:start_time=0:duration={black_fade}[final]"
        )

        filter_complex = ";".join(filter_parts)

        cmd = ["ffmpeg", "-y"] + inputs
        if music_path and music_path.exists():
            cmd.extend(["-i", str(music_path)])

        cmd.extend(["-filter_complex", filter_complex, "-map", "[final]"])

        if music_path and music_path.exists():
            music_idx = text_input_idx + 1
            # Fade out music in last 2 seconds
            cmd.extend([
                "-map", f"{music_idx}:a",
                "-af", f"afade=t=out:st={total_duration - 2}:d=2",
                "-c:a", "aac",
                "-b:a", "128k",
            ])

        cmd.extend([
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "23",
            "-r", "30",
            "-threads", "1",
            "-t", str(total_duration),
            "-shortest",
            str(output_path),
        ])

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=120
            )
            if result.returncode != 0:
                logger.error(
                    f"[SlideshowCompositor] FFmpeg failed: {result.stderr[-500:]}"
                )
                return False
            return True
        except subprocess.TimeoutExpired:
            logger.error("[SlideshowCompositor] FFmpeg timed out (120s)")
            return False
        except Exception as e:
            logger.error(f"[SlideshowCompositor] FFmpeg error: {e}")
            return False

    def _resolve_font(self, name: str, size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
        """Resolve a font display name to a TTF file and load it."""
        lookup = FONT_MAP_BOLD if bold else FONT_MAP
        ttf_name = lookup.get(name)

        if ttf_name:
            font_path = Path("assets/fonts") / ttf_name
            try:
                return ImageFont.truetype(str(font_path), size)
            except Exception:
                pass

        # Try direct filename (legacy: "Poppins-Bold.ttf")
        font_path = Path("assets/fonts") / name
        try:
            return ImageFont.truetype(str(font_path), size)
        except Exception:
            pass

        # Fallback chain
        for fallback in [
            "assets/fonts/Inter/static/Inter_18pt-Bold.ttf" if bold else "assets/fonts/Inter/static/Inter_18pt-Regular.ttf",
            "assets/fonts/Poppins-Bold.ttf",
        ]:
            try:
                return ImageFont.truetype(fallback, size)
            except Exception:
                continue
        return ImageFont.load_default()

    def _word_wrap(self, draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
        """Word-wrap text to fit within max_width pixels."""
        words = text.split()
        lines = []
        current_line = ""

        for word in words:
            test = f"{current_line} {word}".strip()
            bbox = draw.textbbox((0, 0), test, font=font)
            if bbox[2] - bbox[0] <= max_width:
                current_line = test
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word

        if current_line:
            lines.append(current_line)

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

    def _round_corners(self, img: Image.Image, radius: int = 20) -> Image.Image:
        """Apply rounded corners to an image."""
        img = img.convert("RGBA")
        mask = Image.new("L", img.size, 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.rounded_rectangle((0, 0, img.width, img.height), radius=radius, fill=255)
        result = Image.new("RGBA", img.size, (0, 0, 0, 0))
        result.paste(img, mask=mask)
        return result.convert("RGB")

    @staticmethod
    def _hex_to_rgb(hex_color: str) -> tuple:
        """Convert hex color string to RGB tuple."""
        try:
            hc = hex_color.lstrip("#")
            return tuple(int(hc[i:i+2], 16) for i in (0, 2, 4))
        except Exception:
            return (255, 255, 255)

    def _get(self, design, key: str):
        """Get a design value with fallback to defaults."""
        if design and hasattr(design, key):
            val = getattr(design, key)
            if val is not None:
                return val
        return DEFAULTS.get(key)
