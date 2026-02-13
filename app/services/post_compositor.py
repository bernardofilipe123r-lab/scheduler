"""
Server-side post cover slide compositor.

Replicates the client-side PostCanvas (Konva) rendering using Pillow,
producing a publication-ready cover slide image with:
  - AI-generated background (1080×1350)
  - Gradient overlay (bottom 60%, transparent→near-black)
  - Brand abbreviation bar with horizontal lines
  - Title text (uppercase, balanced line-breaks, Poppins-Bold)
  - "Swipe" indicator at the bottom
"""

from pathlib import Path
from typing import List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont

# ── Canvas constants (match PostCanvas.tsx) ────────────────────────────
CANVAS_WIDTH = 1080
CANVAS_HEIGHT = 1350

# Layout defaults (match DEFAULT_GENERAL_SETTINGS in PostCanvas.tsx)
TITLE_PADDING_X = 45
READ_CAPTION_BOTTOM = 45
TITLE_GAP = 80
LOGO_GAP = 36

# Font sizing
AUTO_FIT_MAX = 90
AUTO_FIT_MIN = 30
THREE_LINE_FLOOR = 64

# Brand abbreviations (match PostCanvas.tsx)
BRAND_ABBREVIATIONS = {
    "healthycollege": "HCO",
    "holisticcollege": "HCO",
    "longevitycollege": "LCO",
    "vitalitycollege": "VCO",
    "wellbeingcollege": "WCO",
}


def _get_brand_abbreviation(brand_id: str) -> str:
    """Get brand abbreviation with dynamic fallback."""
    if brand_id in BRAND_ABBREVIATIONS:
        return BRAND_ABBREVIATIONS[brand_id]
    # Generate abbreviation: first letter of each word + 'CO'
    parts = brand_id.replace("college", "").strip()
    return (parts[0].upper() if parts else "X") + "CO"


def _load_font(name: str, size: int) -> ImageFont.FreeTypeFont:
    """Load a font from assets/fonts/ (searches subdirectories too)."""
    base_dir = Path(__file__).resolve().parent.parent.parent
    fonts_dir = base_dir / "assets" / "fonts"

    # Direct path
    font_path = fonts_dir / name
    if font_path.exists():
        try:
            return ImageFont.truetype(str(font_path), size)
        except Exception:
            pass

    # Search subdirectories
    for p in fonts_dir.rglob(name):
        try:
            return ImageFont.truetype(str(p), size)
        except Exception:
            continue

    # Fallback: try system fonts
    for sys_font in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "arial.ttf",
    ]:
        try:
            return ImageFont.truetype(sys_font, size)
        except Exception:
            continue
    return ImageFont.load_default()


# ── Text layout helpers (replicate PostCanvas.tsx logic) ───────────────

def _count_lines(text: str, max_width: int, font_size: int) -> int:
    """
    Count how many lines `text` needs at `font_size` using the
    same character-count estimation as PostCanvas.tsx.
    """
    avg_char_width = font_size * 0.48
    max_chars = int(max_width / avg_char_width)
    words = text.upper().split()
    if not words:
        return 1
    line_count = 1
    current = ""
    for word in words:
        test = f"{current} {word}" if current else word
        if len(test) > max_chars and current:
            line_count += 1
            current = word
        else:
            current = test
    return line_count


def _auto_fit_font_size(text: str, max_width: int) -> int:
    """
    Find the LARGEST font size that produces the best layout.
    Matches autoFitFontSize() in PostCanvas.tsx:
      1. Try 3 lines: 90px → 64px
      2. Try 2 lines: 90px → 30px
      3. 1 line: largest that fits
    """
    # Try 3 lines: 90px → 64px
    for fs in range(AUTO_FIT_MAX, THREE_LINE_FLOOR - 1, -2):
        if _count_lines(text, max_width, fs) == 3:
            return fs
    # Try 2 lines: 90px → 30px
    for fs in range(AUTO_FIT_MAX, AUTO_FIT_MIN - 1, -2):
        if _count_lines(text, max_width, fs) == 2:
            return fs
    # 1 line: largest that fits
    for fs in range(AUTO_FIT_MAX, AUTO_FIT_MIN - 1, -2):
        if _count_lines(text, max_width, fs) <= 1:
            return fs
    return AUTO_FIT_MIN


def _balance_title(text: str, max_width: int, font_size: int) -> Tuple[List[str], int]:
    """
    Balance title text across lines, matching balanceTitleText() in PostCanvas.tsx.
    Returns (lines, font_size).
    """
    upper = text.upper().strip()
    words = upper.split()
    if not words:
        return ([""], font_size)

    avg_char_width = font_size * 0.48
    max_chars = int(max_width / avg_char_width)

    # ── Step 1: Greedy wrap ──
    greedy: List[str] = []
    current = ""
    for word in words:
        test = f"{current} {word}" if current else word
        if len(test) > max_chars and current:
            greedy.append(current)
            current = word
        else:
            current = test
    if current:
        greedy.append(current)

    n = len(greedy)
    if n <= 1:
        return (greedy, font_size)

    # ── Step 2: Balance 2 lines ──
    if n == 2:
        best_lines = None
        best_diff = float("inf")
        for i in range(1, len(words)):
            l1 = " ".join(words[:i])
            l2 = " ".join(words[i:])
            if len(l1) > max_chars or len(l2) > max_chars:
                continue
            diff = abs(len(l1) - len(l2))
            if diff < best_diff:
                best_diff = diff
                best_lines = [l1, l2]
        if best_lines:
            return (best_lines, font_size)

    # ── Step 3: Balance 3 lines ──
    if n == 3 and len(words) >= 3:
        best_lines = None
        best_diff = float("inf")
        for i in range(1, len(words) - 1):
            for j in range(i + 1, len(words)):
                l1 = " ".join(words[:i])
                l2 = " ".join(words[i:j])
                l3 = " ".join(words[j:])
                if len(l1) > max_chars or len(l2) > max_chars or len(l3) > max_chars:
                    continue
                diff = max(abs(len(l1) - len(l2)), abs(len(l2) - len(l3)), abs(len(l1) - len(l3)))
                if diff < best_diff:
                    best_diff = diff
                    best_lines = [l1, l2, l3]
        if best_lines:
            return (best_lines, font_size)

    return (greedy, font_size)


# ── Drawing helpers ───────────────────────────────────────────────────

def _draw_gradient(img: Image.Image) -> None:
    """
    Draw a gradient overlay on the bottom 60% of the image.
    Matches GradientOverlay in PostCanvas.tsx:
      starts at 40% height, transparent → 50% black at 30% → 95% black at bottom.
    """
    overlay = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    gradient_start = int(CANVAS_HEIGHT * 0.4)
    gradient_height = CANVAS_HEIGHT - gradient_start

    for y in range(gradient_height):
        ratio = y / gradient_height  # 0.0 at top of gradient → 1.0 at bottom
        if ratio < 0.3:
            # 0..0.3 → alpha 0..127 (50% opacity)
            alpha = int((ratio / 0.3) * 127)
        else:
            # 0.3..1.0 → alpha 127..242 (50%..95% opacity)
            alpha = int(127 + ((ratio - 0.3) / 0.7) * (242 - 127))
        draw.line([(0, gradient_start + y), (CANVAS_WIDTH, gradient_start + y)],
                  fill=(0, 0, 0, alpha))

    img.paste(Image.alpha_composite(img, overlay))


def _draw_logo_bar(draw: ImageDraw.Draw, y: int, brand: str, title_width: int) -> None:
    """
    Draw the brand abbreviation centered with horizontal lines.
    Matches LogoWithLines in PostCanvas.tsx.
    """
    logo_gap_width = 113
    logo_height = 40
    abbreviation = _get_brand_abbreviation(brand)

    # Bar width matches title width / 2 - gap/2 when barWidth is 0
    bar_width = title_width / 2 - logo_gap_width / 2

    center_x = CANVAS_WIDTH / 2
    left_line_end = center_x - logo_gap_width / 2
    left_line_start = left_line_end - bar_width
    right_line_start = center_x + logo_gap_width / 2
    right_line_end = right_line_start + bar_width

    line_y = y + logo_height / 2

    # Horizontal lines
    draw.line(
        [(max(0, int(left_line_start)), int(line_y)),
         (int(left_line_end), int(line_y))],
        fill="white", width=2,
    )
    draw.line(
        [(int(right_line_start), int(line_y)),
         (min(CANVAS_WIDTH, int(right_line_end)), int(line_y))],
        fill="white", width=2,
    )

    # Brand abbreviation text
    abbr_font = _load_font("InterVariable.ttf", 28)
    bbox = draw.textbbox((0, 0), abbreviation, font=abbr_font)
    tw = bbox[2] - bbox[0]
    ax = (CANVAS_WIDTH - tw) / 2
    ay = y + logo_height / 2 - 14
    draw.text((ax, ay), abbreviation, fill="white", font=abbr_font)


def _draw_title(draw: ImageDraw.Draw, lines: List[str], font_size: int, y: int) -> None:
    """
    Draw the title lines centered, matching TitleLayer in PostCanvas.tsx.
    """
    font = _load_font("Poppins-Bold.ttf", font_size)
    line_height = font_size * 1.1
    text_width = CANVAS_WIDTH - TITLE_PADDING_X * 2

    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        x = TITLE_PADDING_X + (text_width - tw) / 2
        ly = y + i * line_height
        draw.text((x, ly), line, fill="white", font=font)


def _draw_swipe(draw: ImageDraw.Draw, y: int) -> None:
    """Draw the 'Swipe' label, matching ReadCaption in PostCanvas.tsx."""
    font = _load_font("InterVariable.ttf", 24)
    text = "Swipe"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    x = (CANVAS_WIDTH - tw) / 2
    # Slight opacity — use light grey to simulate 0.9 opacity white on dark bg
    draw.text((x, y), text, fill=(255, 255, 255, 230), font=font)


# ── Public API ────────────────────────────────────────────────────────

def compose_cover_slide(
    background_path: str,
    title: str,
    brand: str,
    output_path: Optional[str] = None,
) -> Image.Image:
    """
    Compose a publication-ready cover slide from a background image.

    Layers (bottom to top):
      1. Background image (1080×1350)
      2. Gradient overlay (bottom 60%)
      3. Brand abbreviation bar with horizontal lines
      4. Title text (uppercase, balanced, Poppins-Bold)
      5. "Swipe" indicator

    Args:
        background_path: Path to the AI background image.
        title: Title text to render on the cover slide.
        brand: Brand identifier (e.g. "wellbeingcollege").
        output_path: If provided, save the composed image here.

    Returns:
        PIL Image of the composed cover slide.
    """
    # Load & resize background
    bg = Image.open(background_path).convert("RGBA")
    if bg.size != (CANVAS_WIDTH, CANVAS_HEIGHT):
        bg = bg.resize((CANVAS_WIDTH, CANVAS_HEIGHT), Image.LANCZOS)

    # Apply gradient
    _draw_gradient(bg)

    # Compute title layout
    max_width = CANVAS_WIDTH - TITLE_PADDING_X * 2
    font_size = _auto_fit_font_size(title, max_width)
    lines, font_size = _balance_title(title, max_width, font_size)

    # Calculate vertical positions (bottom-up, matching PostCanvas.tsx)
    line_height = font_size * 1.1
    title_height = (len(lines) - 1) * line_height + font_size

    rcy = CANVAS_HEIGHT - READ_CAPTION_BOTTOM - 24        # "Swipe" y
    ty = rcy - TITLE_GAP - title_height                    # Title y
    ly = ty - LOGO_GAP - 40                                # Logo bar y

    # Draw elements
    draw = ImageDraw.Draw(bg)
    _draw_logo_bar(draw, int(ly), brand, max_width)
    _draw_title(draw, lines, font_size, int(ty))
    _draw_swipe(draw, int(rcy))

    # Save if requested
    if output_path:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        bg.convert("RGB").save(output_path, format="PNG", quality=95)
        print(f"   📸 Cover slide composed → {output_path}", flush=True)

    return bg
