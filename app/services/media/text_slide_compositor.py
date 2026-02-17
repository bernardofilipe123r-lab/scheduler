"""
Server-side text slide compositor.

Replicates the client-side CarouselTextSlide (Konva) rendering using Pillow,
producing publication-ready text slide images with:
  - Solid beige background (#f8f5f0)
  - Brand header (circle logo + name + handle)
  - Georgia body text with word-wrapping
  - Bottom bar (SHARE / SWIPE / SAVE)
"""

import re
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

# ── Canvas constants (match CarouselTextSlide.tsx) ─────────────────────
CANVAS_WIDTH = 1080
CANVAS_HEIGHT = 1350
PAD_X = 80
BG_COLOR = "#f8f5f0"

HEADER_BLOCK_H = 76
HEADER_TEXT_GAP = 30
TEXT_WIDTH = CANVAS_WIDTH - PAD_X * 2  # 920

BOTTOM_BAR_Y = 1230

LOGO_DIAMETER = 56

# ── Brand data ─────────────────────────────────────────────────────────
BRAND_DISPLAY_NAMES = {
    "healthycollege": "The Healthy College",
    "longevitycollege": "The Longevity College",
    "wellbeingcollege": "The Wellbeing College",
    "vitalitycollege": "The Vitality College",
    "holisticcollege": "The Holistic College",
}
BRAND_HANDLES = {
    "healthycollege": "@thehealthycollege",
    "longevitycollege": "@thelongevitycollege",
    "wellbeingcollege": "@thewellbeingcollege",
    "vitalitycollege": "@thevitalitycollege",
    "holisticcollege": "@theholisticcollege",
}
BRAND_COLORS = {
    "healthycollege": "#22c55e",
    "longevitycollege": "#0ea5e9",
    "wellbeingcollege": "#eab308",
    "vitalitycollege": "#14b8a6",
    "holisticcollege": "#f97316",
}

_HANDLE_PATTERN = re.compile(
    r"@?\{\{?\s*brandhandle\s*\}?\}"
)

# ── Paths ──────────────────────────────────────────────────────────────
_BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
_ASSETS = _BASE_DIR / "assets"
_FONTS = _ASSETS / "fonts"
_ICONS = _ASSETS / "icons"


# ── Font loading ───────────────────────────────────────────────────────

def _load_inter(size: int) -> ImageFont.FreeTypeFont:
    path = _FONTS / "InterVariable.ttf"
    if path.exists():
        return ImageFont.truetype(str(path), size)
    for fallback in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]:
        try:
            return ImageFont.truetype(fallback, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _load_georgia(size: int) -> ImageFont.FreeTypeFont:
    for candidate in [
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSerif.ttf",
    ]:
        try:
            return ImageFont.truetype(candidate, size)
        except Exception:
            continue
    # Fallback to bundled Poppins
    fallback = _FONTS / "Poppins-Regular.ttf"
    if fallback.exists():
        return ImageFont.truetype(str(fallback), size)
    return ImageFont.load_default()


# ── Text helpers ───────────────────────────────────────────────────────

def _replace_handle(text: str, brand: str) -> str:
    handle = BRAND_HANDLES.get(brand, f"@{brand}")
    return _HANDLE_PATTERN.sub(handle, text)


def wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """Word-wrap text respecting explicit paragraph breaks (\n\n)."""
    # Split by double-newline for paragraph breaks; single \n treated as space
    paragraphs = text.split('\n\n')
    all_lines: list[str] = []
    for p_idx, paragraph in enumerate(paragraphs):
        if p_idx > 0:
            # Single empty string = one blank line between paragraphs
            all_lines.append('')
        # Collapse any remaining single newlines into spaces
        cleaned = paragraph.replace('\n', ' ').strip()
        if not cleaned:
            continue
        words = cleaned.split()
        current = ""
        for word in words:
            test = f"{current} {word}" if current else word
            bbox = font.getbbox(test)
            if bbox[2] - bbox[0] > max_width and current:
                all_lines.append(current)
                current = word
            else:
                current = test
        if current:
            all_lines.append(current)
    return all_lines or [""]


def _estimate_text_height(
    text: str, font_size: int, line_height_mult: float, max_width: int, font: ImageFont.FreeTypeFont
) -> int:
    lines = wrap_text(text, font, max_width)
    line_spacing = int(font_size * line_height_mult)
    return max(1, len(lines)) * line_spacing


def compute_stable_content_y(all_texts: list[str], font: ImageFont.FreeTypeFont) -> int:
    available_h = BOTTOM_BAR_Y - 40 - 60  # 1130
    max_total_h = 0
    for t in all_texts:
        text_h = _estimate_text_height(t, 38, 1.55, TEXT_WIDTH, font)
        total_h = HEADER_BLOCK_H + HEADER_TEXT_GAP + text_h
        max_total_h = max(max_total_h, total_h)
    centered = 60 + (available_h - max_total_h) / 2
    return int(max(60, min(centered, 280)))


# ── Drawing helpers ────────────────────────────────────────────────────

def _draw_brand_header(
    img: Image.Image,
    draw: ImageDraw.Draw,
    brand: str,
    content_y: int,
    logo_path: str | None,
) -> None:
    brand_color = BRAND_COLORS.get(brand, "#888888")
    display_name = BRAND_DISPLAY_NAMES.get(brand, brand)
    handle = BRAND_HANDLES.get(brand, f"@{brand}")

    # ── Circle logo ──
    cx, cy = PAD_X, content_y
    r = LOGO_DIAMETER // 2

    if logo_path and Path(logo_path).exists():
        logo = Image.open(logo_path).convert("RGBA").resize(
            (LOGO_DIAMETER, LOGO_DIAMETER), Image.LANCZOS
        )
        # Clip to circle via mask
        mask = Image.new("L", (LOGO_DIAMETER, LOGO_DIAMETER), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, LOGO_DIAMETER, LOGO_DIAMETER), fill=255)
        img.paste(logo, (cx, cy), mask)
    else:
        # Filled circle with first letter
        draw.ellipse(
            (cx, cy, cx + LOGO_DIAMETER, cy + LOGO_DIAMETER),
            fill=brand_color,
        )
        letter_font = _load_inter(28)
        letter = display_name[0].upper()
        bbox = letter_font.getbbox(letter)
        lw, lh = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(
            (cx + (LOGO_DIAMETER - lw) / 2, cy + (LOGO_DIAMETER - lh) / 2 - bbox[1]),
            letter,
            fill="white",
            font=letter_font,
        )

    # ── Brand name ──
    name_font = _load_inter(30)
    name_x = PAD_X + LOGO_DIAMETER + 16
    draw.text((name_x, content_y + 4), display_name, fill="#1a1a1a", font=name_font)

    # ── Handle ──
    handle_font = _load_inter(24)
    draw.text((name_x, content_y + 38), handle, fill="#888888", font=handle_font)


def _draw_body_text(
    draw: ImageDraw.Draw,
    text: str,
    font: ImageFont.FreeTypeFont,
    content_y: int,
) -> None:
    y = content_y + HEADER_BLOCK_H + HEADER_TEXT_GAP
    lines = wrap_text(text, font, TEXT_WIDTH)
    line_spacing = int(38 * 1.55)
    for i, line in enumerate(lines):
        draw.text((PAD_X, y + i * line_spacing), line, fill="#1a1a1a", font=font)


def _draw_bottom_bar(draw: ImageDraw.Draw, is_last_slide: bool) -> None:
    label_font = _load_inter(24)

    # ── Left: SHARE + icon ──
    # Letter-spacing ~2px: draw char-by-char
    share_text = "SHARE"
    sx = PAD_X
    for ch in share_text:
        draw.text((sx, BOTTOM_BAR_Y + 2), ch, fill="#1a1a1a", font=label_font)
        bbox = label_font.getbbox(ch)
        sx += (bbox[2] - bbox[0]) + 2

    share_icon = _ICONS / "share.png"
    if share_icon.exists():
        icon = Image.open(share_icon).convert("RGBA").resize((30, 30), Image.LANCZOS)
        draw._image.paste(icon, (PAD_X + 110, BOTTOM_BAR_Y - 2), icon)

    # ── Center: SWIPE (only if not last slide) ──
    if not is_last_slide:
        swipe_text = "SWIPE"
        bbox = label_font.getbbox(swipe_text)
        tw = bbox[2] - bbox[0]
        swipe_x = (CANVAS_WIDTH - tw) / 2
        draw.text((swipe_x, BOTTOM_BAR_Y + 2), swipe_text, fill="#1a1a1a", font=label_font)

    # ── Right: icon + SAVE ──
    save_icon = _ICONS / "save.png"
    if save_icon.exists():
        icon = Image.open(save_icon).convert("RGBA").resize((28, 28), Image.LANCZOS)
        draw._image.paste(icon, (CANVAS_WIDTH - PAD_X - 140, BOTTOM_BAR_Y - 1), icon)

    save_text = "SAVE"
    save_x = CANVAS_WIDTH - PAD_X - 98
    sx = save_x
    for ch in save_text:
        draw.text((sx, BOTTOM_BAR_Y + 2), ch, fill="#1a1a1a", font=label_font)
        bbox = label_font.getbbox(ch)
        sx += (bbox[2] - bbox[0]) + 2


# ── Public API ─────────────────────────────────────────────────────────

def compose_text_slide(
    brand: str,
    text: str,
    all_slide_texts: list[str],
    is_last_slide: bool,
    output_path: str | None = None,
    logo_path: str | None = None,
) -> Image.Image:
    """
    Compose a publication-ready text slide matching CarouselTextSlide (Konva).

    Args:
        brand: Brand identifier (e.g. "healthycollege").
        text: Body text for this slide.
        all_slide_texts: All slide texts (used to compute stable content_y).
        is_last_slide: Whether this is the last slide (hides SWIPE).
        output_path: If provided, save the composed image here.
        logo_path: Optional path to brand logo image.

    Returns:
        PIL Image of the composed text slide.
    """
    text = _replace_handle(text, brand)

    img = Image.new("RGB", (CANVAS_WIDTH, CANVAS_HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    body_font = _load_georgia(38)
    cleaned_texts = [_replace_handle(t, brand) for t in all_slide_texts]
    content_y = compute_stable_content_y(cleaned_texts, body_font)

    _draw_brand_header(img, draw, brand, content_y, logo_path)
    _draw_body_text(draw, text, body_font, content_y)
    _draw_bottom_bar(draw, is_last_slide)

    if output_path:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        img.save(output_path, format="PNG", quality=95)
        print(f"   📝 Text slide composed → {output_path}", flush=True)

    return img
