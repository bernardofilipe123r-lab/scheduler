"""
Carousel slide renderer — pure Python/Pillow.

Renders carousel cover + text slides without Node.js dependency.
Uses the same auto-fit title algorithm as Format B thumbnail compositor.

Layout:
  Cover (1080×1350): background + gradient + logo bar + auto-sized title + "Swipe"
  Text  (1080×1350): beige bg + brand header + body text + bottom bar (SHARE/SWIPE/SAVE)
"""
import logging
import re
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

# Canvas dimensions (Instagram carousel)
W, H = 1080, 1350

# ─── Cover slide constants ────────────────────────────────────────────────────
COVER_SIDE_PADDING = 55
COVER_READ_CAPTION_BOTTOM = 45
COVER_TITLE_GAP = 40
COVER_LOGO_GAP = 36
COVER_LOGO_HEIGHT = 40
COVER_ABBR_GAP_WIDTH = 113

# ─── Text slide constants ─────────────────────────────────────────────────────
BG_COLOR = (248, 245, 240)       # #f8f5f0
TEXT_COLOR = (26, 26, 26)         # #1a1a1a
SUBTLE_COLOR = (136, 136, 136)    # #888888
PAD_X = 80
LOGO_SIZE = 56
TEXT_WIDTH = W - PAD_X * 2        # 920
BOTTOM_BAR_Y = H - 120           # 1230
HEADER_BLOCK_H = LOGO_SIZE + 20  # 76
HEADER_TEXT_GAP = 30
TEXT_FONT_SIZE = 38
TEXT_LINE_HEIGHT = 1.55


class CarouselSlideRenderer:
    """Renders carousel cover + text slides in pure Pillow."""

    def __init__(self, project_root: Optional[Path] = None):
        if project_root:
            self._root = Path(project_root)
        else:
            self._root = Path(__file__).resolve().parent.parent.parent.parent

        # Docker paths take priority
        if Path("/app/assets/fonts").exists():
            self._font_dir = Path("/app/assets/fonts")
            self._icon_dir = Path("/app/assets/icons")
        else:
            self._font_dir = self._root / "assets" / "fonts"
            self._icon_dir = self._root / "assets" / "icons"

    def render_all(
        self,
        brand_config: dict,
        title: str,
        background_image: str,
        slide_texts: list,
        cover_output: str,
        slide_outputs: list,
        logo_path: Optional[str] = None,
    ) -> dict:
        """
        Render cover + all text slides.

        Returns dict with success, coverPath, slidePaths.
        """
        try:
            self.render_cover(
                background_image=background_image,
                title=title,
                brand_config=brand_config,
                output_path=cover_output,
                logo_path=logo_path,
            )

            content_y = self._compute_stable_content_y(slide_texts)

            # Pre-load logo for text slides
            logo_img = None
            if logo_path and Path(logo_path).exists():
                try:
                    logo_img = Image.open(logo_path).convert("RGBA")
                except Exception:
                    pass

            slide_paths = []
            for i, text in enumerate(slide_texts):
                if i >= len(slide_outputs):
                    break
                out = slide_outputs[i]
                is_last = i == len(slide_texts) - 1
                self.render_text_slide(
                    slide_text=text,
                    brand_config=brand_config,
                    output_path=out,
                    is_last=is_last,
                    content_y=content_y,
                    logo_img=logo_img,
                )
                slide_paths.append(out)

            return {"success": True, "coverPath": cover_output, "slidePaths": slide_paths}
        except Exception as e:
            logger.error(f"[CarouselSlideRenderer] Error: {e}")
            return {"success": False, "error": str(e)}

    # ─── Cover slide ──────────────────────────────────────────────────────────

    def render_cover(
        self,
        background_image: str,
        title: str,
        brand_config: dict,
        output_path: str,
        logo_path: Optional[str] = None,
    ):
        """Render the carousel cover slide."""
        canvas = Image.new("RGB", (W, H), (0, 0, 0))

        # 1. Background image (cover-fit)
        try:
            bg = Image.open(background_image).convert("RGB")
            bg = self._cover_fit(bg, W, H)
            canvas.paste(bg, (0, 0))
        except Exception as e:
            logger.error(f"[Cover] Failed to load background: {e}")

        # 2. Gradient overlay — subtle from very top, strong at bottom (+30% intensity)
        gradient = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for y in range(H):
            frac = y / H
            if frac < 0.30:
                # Top 30%: subtle darkening (0 → 10%)
                alpha = int(255 * 0.10 * (frac / 0.30))
            elif frac < 0.50:
                # 30-50%: ramp (10% → 33%)
                t = (frac - 0.30) / 0.20
                alpha = int(255 * (0.10 + 0.23 * t))
            elif frac < 0.70:
                # 50-70%: moderate (33% → 78%)
                t = (frac - 0.50) / 0.20
                alpha = int(255 * (0.33 + 0.45 * t))
            else:
                # 70-100%: strong (78% → 100%)
                t = (frac - 0.70) / 0.30
                alpha = int(255 * (0.78 + 0.22 * t))
            alpha = min(alpha, 255)
            gradient.paste(Image.new("RGBA", (W, 1), (0, 0, 0, alpha)), (0, y))

        canvas = Image.alpha_composite(canvas.convert("RGBA"), gradient).convert("RGB")
        draw = ImageDraw.Draw(canvas)

        # 3. Auto-fit title (Format B algorithm)
        title_max_w = W - COVER_SIDE_PADDING * 2  # 970
        title_lines, font_size = self._auto_fit_title(draw, title, "Anton", title_max_w)
        line_h = int(font_size * 1.1)
        title_height = (len(title_lines) - 1) * line_h + font_size

        # 4. Vertical positioning — center title between divider and "Swipe"
        swipe_y = H - COVER_READ_CAPTION_BOTTOM - 24
        logo_size = 60  # Logo circle/image size

        # Divider line Y is fixed relative to the bottom
        # Space: divider_y → gap → title_block → gap → swipe_y
        # Place divider so that title is visually centered in the remaining space
        divider_gap = 30  # gap between divider and title
        swipe_gap = 70    # gap between title bottom and swipe
        total_content_h = divider_gap + title_height + swipe_gap
        # Title block center should be between divider and swipe
        title_top_y = swipe_y - swipe_gap - title_height
        divider_y = title_top_y - divider_gap
        logo_center_y = divider_y

        # 5. Divider lines with centered logo
        logo_img = None
        if logo_path and Path(logo_path).exists():
            try:
                logo_img = Image.open(logo_path).convert("RGBA")
                logo_img = logo_img.resize((logo_size, logo_size), Image.LANCZOS)
            except Exception:
                logo_img = None

        line_gap = 20  # gap between line end and logo
        if logo_img:
            logo_x = (W - logo_size) // 2
            logo_y = logo_center_y - logo_size // 2
            # Divider lines on each side
            left_end = logo_x - line_gap
            right_start = logo_x + logo_size + line_gap
            draw.line(
                [(COVER_SIDE_PADDING, logo_center_y), (left_end, logo_center_y)],
                fill=(255, 255, 255), width=2,
            )
            draw.line(
                [(right_start, logo_center_y), (W - COVER_SIDE_PADDING, logo_center_y)],
                fill=(255, 255, 255), width=2,
            )
            # Paste logo with circular mask
            mask = Image.new("L", (logo_size, logo_size), 0)
            mask_draw = ImageDraw.Draw(mask)
            mask_draw.ellipse([0, 0, logo_size - 1, logo_size - 1], fill=255)
            canvas_rgba = canvas.convert("RGBA")
            canvas_rgba.paste(logo_img, (logo_x, logo_y), mask)
            canvas = canvas_rgba.convert("RGB")
            draw = ImageDraw.Draw(canvas)
        else:
            # No logo — show abbreviation text between lines
            abbr = brand_config.get("abbreviation", "CO")
            abbr_font = self._load_font("Inter", 28)
            abbr_bbox = draw.textbbox((0, 0), abbr, font=abbr_font)
            abbr_w = abbr_bbox[2] - abbr_bbox[0]
            abbr_h = abbr_bbox[3] - abbr_bbox[1]
            gap_width = max(abbr_w + 40, 113)
            bar_width = int((title_max_w - gap_width) / 2)
            if bar_width > 0:
                draw.line(
                    [(COVER_SIDE_PADDING, logo_center_y), (COVER_SIDE_PADDING + bar_width, logo_center_y)],
                    fill=(255, 255, 255), width=2,
                )
                right_start = W - COVER_SIDE_PADDING - bar_width
                draw.line(
                    [(right_start, logo_center_y), (W - COVER_SIDE_PADDING, logo_center_y)],
                    fill=(255, 255, 255), width=2,
                )
            draw.text(
                ((W - abbr_w) // 2, logo_center_y - abbr_h // 2),
                abbr, fill=(255, 255, 255), font=abbr_font,
            )

        # 6. Title text (centered, ALL CAPS)
        title_font = self._load_font("Anton", font_size)
        for i, line in enumerate(title_lines):
            text_y = title_top_y + i * line_h
            bbox = draw.textbbox((0, 0), line, font=title_font)
            text_w = bbox[2] - bbox[0]
            draw.text(((W - text_w) // 2, text_y), line, fill=(255, 255, 255), font=title_font)

        # 7. "Swipe" label
        swipe_font = self._load_font("Inter", 24)
        swipe_bbox = draw.textbbox((0, 0), "Swipe", font=swipe_font)
        swipe_w = swipe_bbox[2] - swipe_bbox[0]
        draw.text(((W - swipe_w) // 2, swipe_y), "Swipe", fill=(230, 230, 230), font=swipe_font)

        # Save
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        canvas.save(output_path, "PNG")

    # ─── Text slide ───────────────────────────────────────────────────────────

    def render_text_slide(
        self,
        slide_text: str,
        brand_config: dict,
        output_path: str,
        is_last: bool,
        content_y: int,
        logo_img: Optional[Image.Image] = None,
    ):
        """Render a single text slide."""
        canvas = Image.new("RGB", (W, H), BG_COLOR)
        draw = ImageDraw.Draw(canvas)

        brand_color = self._hex_to_rgb(brand_config.get("color", "#888888"))
        display_name = brand_config.get("displayName", brand_config.get("name", "Brand"))
        handle = brand_config.get("handle", "@brand")
        initial = display_name[0].upper() if display_name else "B"

        header_x = PAD_X
        header_y = content_y

        # 1. Brand header — logo circle
        if logo_img:
            resized = logo_img.resize((LOGO_SIZE, LOGO_SIZE), Image.LANCZOS)
            mask = Image.new("L", (LOGO_SIZE, LOGO_SIZE), 0)
            mask_draw = ImageDraw.Draw(mask)
            mask_draw.ellipse([0, 0, LOGO_SIZE - 1, LOGO_SIZE - 1], fill=255)
            canvas.paste(resized.convert("RGB"), (header_x, header_y), mask)
        else:
            draw.ellipse(
                [header_x, header_y, header_x + LOGO_SIZE, header_y + LOGO_SIZE],
                fill=brand_color,
            )
            init_font = self._load_font("Inter", 28)
            init_bbox = draw.textbbox((0, 0), initial, font=init_font)
            init_w = init_bbox[2] - init_bbox[0]
            init_h = init_bbox[3] - init_bbox[1]
            draw.text(
                (header_x + (LOGO_SIZE - init_w) // 2, header_y + (LOGO_SIZE - init_h) // 2),
                initial, fill=(255, 255, 255), font=init_font,
            )

        # Brand name
        name_font = self._load_font("Inter", 30)
        draw.text(
            (header_x + LOGO_SIZE + 16, header_y + 4),
            display_name, fill=TEXT_COLOR, font=name_font,
        )

        # Handle
        handle_font = self._load_font("Inter", 24)
        draw.text(
            (header_x + LOGO_SIZE + 16, header_y + 38),
            handle, fill=SUBTLE_COLOR, font=handle_font,
        )

        # 2. Body text (word-wrapped)
        display_text = self._replace_handles(slide_text, handle)
        body_font = self._load_font("Poppins", TEXT_FONT_SIZE)
        body_y = content_y + HEADER_BLOCK_H + HEADER_TEXT_GAP
        self._draw_wrapped_text(draw, display_text, body_font, PAD_X, body_y, TEXT_WIDTH, TEXT_COLOR)

        # 3. Bottom bar
        bar_font = self._load_font("Inter", 24)

        # "SHARE"
        draw.text((PAD_X, BOTTOM_BAR_Y + 2), "SHARE", fill=TEXT_COLOR, font=bar_font)

        # Share icon
        share_path = self._icon_dir / "share.png"
        if share_path.exists():
            share_icon = Image.open(share_path).convert("RGBA").resize((30, 30), Image.LANCZOS)
            canvas.paste(share_icon, (PAD_X + 110, BOTTOM_BAR_Y - 2), share_icon)

        # "SWIPE" centered (hidden on last slide)
        if not is_last:
            swipe_bbox = draw.textbbox((0, 0), "SWIPE", font=bar_font)
            swipe_w = swipe_bbox[2] - swipe_bbox[0]
            draw.text(((W - swipe_w) // 2, BOTTOM_BAR_Y + 2), "SWIPE", fill=TEXT_COLOR, font=bar_font)

        # Save icon + "SAVE"
        save_path = self._icon_dir / "save.png"
        if save_path.exists():
            save_icon = Image.open(save_path).convert("RGBA").resize((28, 28), Image.LANCZOS)
            canvas.paste(save_icon, (W - PAD_X - 140, BOTTOM_BAR_Y - 1), save_icon)
        draw.text((W - PAD_X - 98, BOTTOM_BAR_Y + 2), "SAVE", fill=TEXT_COLOR, font=bar_font)

        # Save
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        canvas.save(output_path, "PNG")

    # ─── Auto-fit title (Format B algorithm) ──────────────────────────────────

    def _auto_fit_title(
        self, draw: ImageDraw.ImageDraw, title: str,
        font_name: str, max_width: int,
    ) -> tuple:
        """
        Prioritize 3 lines for better readability.
        Try 3 lines first (largest font 300→20), shave -2px.
        Fall back to 2 lines only if text is short enough.
        """
        wrap_width = int(max_width * 0.98)

        # Try 3 lines first (preferred — bigger font, more balanced)
        for size in range(300, 19, -2):
            font = self._load_font(font_name, size)
            lines = self._greedy_wrap(draw, title, font, wrap_width)
            if len(lines) <= 3:
                final = max(20, size - 2)
                final_font = self._load_font(font_name, final)
                return self._greedy_wrap(draw, title, final_font, wrap_width), final

        font = self._load_font(font_name, 20)
        return self._greedy_wrap(draw, title, font, wrap_width), 20

    def _greedy_wrap(
        self, draw: ImageDraw.ImageDraw, text: str,
        font: ImageFont.FreeTypeFont, max_width: int,
    ) -> list:
        """Word-wrap text greedily (uppercase)."""
        words = text.upper().split()
        if not words:
            return [""]
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

    # ─── Text slide helpers ───────────────────────────────────────────────────

    def _compute_stable_content_y(self, all_texts: list) -> int:
        """Compute a stable Y across all text slides so content doesn't jump."""
        available_h = BOTTOM_BAR_Y - 40 - 60  # 1130
        max_total_h = 0
        for text in all_texts:
            text_h = self._estimate_text_height(text, TEXT_FONT_SIZE, TEXT_LINE_HEIGHT, TEXT_WIDTH)
            total_h = HEADER_BLOCK_H + HEADER_TEXT_GAP + text_h
            max_total_h = max(max_total_h, total_h)
        centered = 60 + (available_h - max_total_h) / 2
        return max(60, min(int(centered), 280))

    @staticmethod
    def _estimate_text_height(text: str, font_size: int, line_height: float, max_width: int) -> int:
        """Estimate text height using character-width approximation."""
        avg_char_width = font_size * 0.48
        words = text.split()
        lines = 1
        line_width = 0.0
        for word in words:
            word_width = len(word) * avg_char_width
            if line_width + word_width > max_width and line_width > 0:
                lines += 1
                line_width = word_width + avg_char_width
            else:
                line_width += word_width + avg_char_width
        return int(lines * font_size * line_height)

    def _draw_wrapped_text(
        self, draw: ImageDraw.ImageDraw, text: str,
        font: ImageFont.FreeTypeFont, x: int, y: int,
        max_width: int, color: tuple,
    ):
        """Draw word-wrapped text with line height, respecting paragraph breaks."""
        paragraphs = text.split("\n\n")
        current_y = y
        line_spacing = int(TEXT_FONT_SIZE * TEXT_LINE_HEIGHT)
        paragraph_spacing = int(line_spacing * 0.6)

        for p_idx, paragraph in enumerate(paragraphs):
            if p_idx > 0:
                current_y += paragraph_spacing
            words = paragraph.split()
            current = ""
            for word in words:
                test = f"{current} {word}".strip()
                bbox = draw.textbbox((0, 0), test, font=font)
                if bbox[2] - bbox[0] <= max_width:
                    current = test
                else:
                    if current:
                        draw.text((x, current_y), current, fill=color, font=font)
                        current_y += line_spacing
                    current = word
            if current:
                draw.text((x, current_y), current, fill=color, font=font)
                current_y += line_spacing

    @staticmethod
    def _replace_handles(text: str, handle: str) -> str:
        """Replace brand handle placeholders."""
        # Replace @BRANDHANDLE (plain caps token used in AI-generated CTAs)
        result = re.sub(r'@BRANDHANDLE\b', handle, text)
        # Replace brace-style placeholders: @{{brandhandle}}, @{brandhandle}, {{brandhandle}}, {brandhandle}
        result = re.sub(r'@?\{\{?brandhandle\}?\}?', handle, result, flags=re.IGNORECASE)
        return result

    # ─── Shared helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _cover_fit(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
        """Scale to cover target dimensions, then center-crop."""
        ratio = max(target_w / img.width, target_h / img.height)
        new_w, new_h = int(img.width * ratio), int(img.height * ratio)
        img = img.resize((new_w, new_h), Image.LANCZOS)
        left = (new_w - target_w) // 2
        top = (new_h - target_h) // 2
        return img.crop((left, top, left + target_w, top + target_h))

    def _load_font(self, name: str, size: int) -> ImageFont.FreeTypeFont:
        """Load font from assets/fonts/."""
        font_map = {
            "Anton": "Anton-Regular.ttf",
            "Inter": "InterVariable.ttf",
            "Poppins": "Poppins-Regular.ttf",
        }
        filename = font_map.get(name, name)
        font_path = self._font_dir / filename
        try:
            return ImageFont.truetype(str(font_path), size)
        except Exception:
            for fallback in ["Anton-Regular.ttf", "Poppins-Bold.ttf"]:
                try:
                    return ImageFont.truetype(str(self._font_dir / fallback), size)
                except Exception:
                    continue
            return ImageFont.load_default()

    @staticmethod
    def _hex_to_rgb(hex_color: str) -> tuple:
        try:
            hc = hex_color.lstrip("#")
            return tuple(int(hc[i:i + 2], 16) for i in (0, 2, 4))
        except Exception:
            return (136, 136, 136)
