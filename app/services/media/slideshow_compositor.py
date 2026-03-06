"""
Slideshow Compositor — creates TEXT-VIDEO reel MP4s.

Pipeline:
  1. Render text overlay as transparent PNG (Pillow)
  2. Build crossfade slideshow from 3-4 images (FFmpeg)
  3. Overlay text on slideshow
  4. Add 1s black fade-in
  5. Add music with fadeout
  6. Export as 1080x1920 MP4
"""
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

W, H = 1080, 1920

DEFAULTS = {
    "reel_text_font": "Poppins-Bold.ttf",
    "reel_text_size": 52,
    "reel_line_spacing": 20,
    "reel_text_region_pct": 0.55,
    "reel_text_bg_opacity": 85,
    "image_duration": 3.0,
    "image_fade_duration": 0.2,
    "reel_total_duration": 15,
    "black_fade_duration": 1.0,
    "show_logo": True,
    "show_handle": True,
}


class SlideshowCompositor:
    """Composes the TEXT-VIDEO reel: image slideshow + text overlay + music."""

    def compose_reel(
        self,
        image_paths: list[Path],
        reel_lines: list[str],
        output_path: Path,
        design=None,
        music_path: Optional[Path] = None,
        logo_path: Optional[Path] = None,
        handle: Optional[str] = None,
    ) -> Optional[Path]:
        """
        Compose the final reel video.

        Args:
            image_paths: 3-4 background images (already processed to 1080x1920)
            reel_lines: Text lines to overlay
            output_path: Where to save the MP4
            design: TextVideoDesign model instance (optional)
            music_path: Path to background music
            logo_path: Path to brand logo
            handle: Instagram handle for footer

        Returns:
            Path to output MP4, or None on failure.
        """
        if not image_paths:
            logger.error("[SlideshowCompositor] No images provided")
            return None

        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Step 1: Render text overlay PNG
        overlay_path = self.render_text_overlay(
            reel_lines, design=design, logo_path=logo_path, handle=handle
        )

        # Step 2-5: Compose with FFmpeg
        success = self._compose_with_ffmpeg(
            image_paths=image_paths,
            text_overlay_path=overlay_path,
            music_path=music_path,
            output_path=output_path,
            design=design,
        )

        # Cleanup overlay temp file
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
        handle: Optional[str] = None,
    ) -> Path:
        """
        Render the text overlay as a transparent PNG.

        Layout:
        - Small logo at top center
        - Main text centered in upper 50-60% of frame
        - Semi-transparent black background
        - Gradient fade at bottom of text area
        - Divider line + @handle at bottom
        """
        text_region_pct = self._get(design, "reel_text_region_pct")
        bg_opacity = self._get(design, "reel_text_bg_opacity")
        font_name = self._get(design, "reel_text_font")
        font_size = self._get(design, "reel_text_size")
        line_spacing = self._get(design, "reel_line_spacing")
        show_logo = self._get(design, "show_logo")
        show_handle = self._get(design, "show_handle")

        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        # Semi-transparent black region for text area
        text_area_h = int(H * text_region_pct)
        bg_alpha = int(255 * bg_opacity / 100)
        text_bg = Image.new("RGBA", (W, text_area_h), (0, 0, 0, bg_alpha))
        overlay.paste(text_bg, (0, 0), text_bg)

        # Gradient fade at bottom of text area
        gradient_h = 100
        for y in range(gradient_h):
            alpha = int(bg_alpha * (1 - y / gradient_h))
            for x in range(W):
                overlay.putpixel((x, text_area_h + y), (0, 0, 0, alpha))

        # Logo
        logo_y_end = 120
        if show_logo and logo_path and Path(logo_path).exists():
            try:
                logo = Image.open(logo_path).convert("RGBA")
                logo = logo.resize((80, 80), Image.LANCZOS)
                overlay.paste(logo, ((W - 80) // 2, 120), logo)
                logo_y_end = 220
            except Exception as e:
                logger.warning(f"[SlideshowCompositor] Logo load failed: {e}")

        # Main text
        font = self._load_font(font_name, font_size)
        text_y = logo_y_end + 30

        for line in reel_lines:
            bbox = draw.textbbox((0, 0), line, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            x = (W - tw) // 2
            draw.text((x, text_y), line, fill="white", font=font)
            text_y += th + line_spacing

        # Handle / footer text
        if show_handle and handle:
            handle_font = self._load_font(font_name, 28)
            handle_text = f"@{handle}"
            hbbox = draw.textbbox((0, 0), handle_text, font=handle_font)
            hw = hbbox[2] - hbbox[0]

            # Divider line above handle
            divider_y = text_y + 25
            draw.line(
                [(W // 2 - 120, divider_y), (W // 2 + 120, divider_y)],
                fill=(100, 100, 100),
                width=1,
            )
            draw.text(
                ((W - hw) // 2, divider_y + 15),
                handle_text,
                fill=(180, 180, 180),
                font=handle_font,
            )

        output = Path(tempfile.mktemp(suffix="_overlay.png"))
        overlay.save(str(output), "PNG")
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

    def _load_font(self, name: str, size: int) -> ImageFont.FreeTypeFont:
        """Load font from assets/fonts/ with fallback."""
        font_path = Path("assets/fonts") / name
        try:
            return ImageFont.truetype(str(font_path), size)
        except Exception:
            for fallback in [
                "assets/fonts/Poppins-Bold.ttf",
                "assets/fonts/Inter/Inter_18pt-Bold.ttf",
            ]:
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
