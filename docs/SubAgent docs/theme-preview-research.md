# Theme & Visual Rendering Research

> Comprehensive spec of how reels, thumbnails, and posts are visually generated.

---

## Table of Contents

1. [Canvas Dimensions](#1-canvas-dimensions)
2. [Thumbnail Layout](#2-thumbnail-layout)
3. [Reel/Content Slide Layout](#3-reelcontent-slide-layout)
4. [Post Cover Slide Layout (PostCompositor)](#4-post-cover-slide-layout)
5. [YouTube Thumbnail](#5-youtube-thumbnail)
6. [Light Mode vs Dark Mode](#6-light-mode-vs-dark-mode)
7. [Brand Theme Fields](#7-brand-theme-fields)
8. [Color Mappings Per Brand](#8-color-mappings-per-brand)
9. [Font System](#9-font-system)
10. [Video Assembly](#10-video-assembly)
11. [AI Background Generation](#11-ai-background-generation)
12. [Key Constants Reference](#12-key-constants-reference)

---

## 1. Canvas Dimensions

| Asset Type       | Width | Height | Aspect Ratio | Format |
|------------------|-------|--------|--------------|--------|
| Reel / Thumbnail | 1080  | 1920   | 9:16         | PNG    |
| Post cover slide | 1080  | 1350   | 4:5          | PNG    |
| YouTube thumbnail| 1080  | 1920   | 9:16         | JPEG (quality 90) |

Source: `app/core/constants.py` — `REEL_WIDTH=1080`, `REEL_HEIGHT=1920`, `POST_WIDTH=1080`, `POST_HEIGHT=1350`

---

## 2. Thumbnail Layout

**File:** `app/services/media/image_generator.py` → `generate_thumbnail()`

### Background

| Mode  | Background |
|-------|-----------|
| Light | Solid `#f4f4f4` (RGB 244,244,244) — flat light grey |
| Dark  | AI-generated image + **55% black overlay** (`(0,0,0, alpha=140)`) |

### Visual Elements (top → bottom)

```
┌──────────────────────────────────┐  0px
│                                  │
│                                  │
│                                  │
│         (vertically centered)    │
│      ┌──────────────────────┐    │
│      │   TITLE LINE 1       │    │  ← centered, UPPERCASE
│      │   TITLE LINE 2       │    │  ← Poppins-Bold, 80px (auto-scales down to 40px min)
│      │   TITLE LINE 3       │    │  ← max 3 lines, max-width = 1080 - 160 = 920px
│      └──────────────────────┘    │
│              (gap: 254px)        │
│       THE HEALTHY COLLEGE        │  ← brand display name, Poppins-Bold 28px
│                                  │
│                                  │
└──────────────────────────────────┘  1920px
```

### Title Text
- **Font:** Poppins-Bold (`FONT_BOLD`)
- **Default size:** 80px (`TITLE_FONT_SIZE`), auto-scales down to 40px minimum
- **Transform:** UPPERCASE
- **Alignment:** Horizontally centered
- **Vertical position:** Vertically centered in canvas (`(height - title_height) / 2`)
- **Max width:** `1080 - (SIDE_MARGIN * 2)` = `1080 - 160` = **920px**
- **Line spacing:** 20px (`LINE_SPACING`)
- **Max lines:** 3 (for auto-wrap), manual `\n` breaks are respected
- **Text color (light):** `brand_colors.thumbnail_text_color` — brand-specific (e.g., green for healthycollege)
- **Text color (dark):** `brand_colors.thumbnail_text_color` — always white `#ffffff`

### Brand Name
- **Text:** Display name from `BRAND_DISPLAY_NAMES` (e.g., "THE HEALTHY COLLEGE")
- **Font:** Poppins-Bold 28px
- **Position:** Centered horizontally, `title_y + 254px` below last title line
- **Color (light):** Same as `thumbnail_text_color`
- **Color (dark):** White `(255, 255, 255)`

---

## 3. Reel/Content Slide Layout

**File:** `app/services/media/image_generator.py` → `generate_reel_image()`

### Background

| Mode  | Background |
|-------|-----------|
| Light | Solid `#f4f4f4` (RGB 244,244,244) |
| Dark  | AI-generated image + **85% black overlay** (`(0,0,0, alpha=217)`) |

### Visual Elements (top → bottom)

```
┌──────────────────────────────────┐  0px
│                                  │
│                                  │
│          (280px from top)        │  ← title_start_y = 280
│  ┌────────────────────────────┐  │
│  │  ████ TITLE LINE 1 ████   │  │  ← colored background bar, 100px tall
│  │  ████ TITLE LINE 2 ████   │  │  ← stepped width (narrower bars for shorter lines)
│  └────────────────────────────┘  │
│          (70px gap)              │  ← TITLE_CONTENT_SPACING
│                                  │
│  1. First content point with     │  ← left-aligned at 108px margin
│     **bold** formatting          │  ← Inter Medium 500, 44px
│                                  │  ← spacing: font_size * 0.6 between bullets
│  2. Second content point         │
│                                  │
│  3. Third content point          │
│                                  │
│  4. Fourth content point         │
│                                  │
│  5. CTA line (if present)        │
│                                  │
│                                  │  ← BOTTOM_MARGIN = 280px minimum
│       THE HEALTHY COLLEGE        │  ← brand name, Poppins-Bold 15px, 12px from bottom
└──────────────────────────────────┘  1920px
```

### Title (Background Bars)
- **Font:** Poppins-Bold, default 56px (stepped scaling: 56 → 46 → 40 → 36)
- **Transform:** UPPERCASE
- **Start Y:** 280px from top
- **Max width:** `1080 - (TITLE_SIDE_PADDING * 2)` = `1080 - 180` = **900px**
- **Bar height:** 100px (`BAR_HEIGHT`)
- **Bar gap:** 0px (`BAR_GAP`) — bars touch each other
- **Bar padding:** 20px horizontal (`H_PADDING`) on each side of text
- **Bar style:** Stepped — narrower bars for shorter text lines, centered
- **Bar background color:** `brand_colors.content_title_bg_color` (RGBA, brand-specific)
- **Text color:** `brand_colors.content_title_text_color` (brand-specific)
- **Text vertical correction:** -3px (`VERTICAL_CORRECTION`) + 1.5px offset
- **Max lines:** 2 preferred (auto-scales font to achieve ≤2 lines)

### Content Lines
- **Font:** Inter Medium 500 (`FONT_CONTENT_MEDIUM`) when `USE_BOLD_CONTENT=True`
  - Alternative: Inter Regular 400 (`FONT_CONTENT_REGULAR`) when `USE_BOLD_CONTENT=False`
- **Default size:** 44px (`CONTENT_FONT_SIZE`), auto-scales down to 20px minimum
- **Alignment:** Left-aligned
- **Left margin:** 108px (`CONTENT_SIDE_PADDING`)
- **Max width:** `1080 - (108 * 2)` = **864px**
- **Line spacing multiplier:** 1.5x (`CONTENT_LINE_SPACING`)
- **Bullet spacing:** `font_size * 0.6` between content points
- **Numbering:** All lines get sequential numbers (e.g., "1. ", "2. ") — including CTA
- **Bold support:** `**text**` markdown renders with bold font variant
- **Text color (light):** Black `(0, 0, 0)`
- **Text color (dark):** White `(255, 255, 255)`

### Brand Name (Bottom)
- **Text:** Display name (e.g., "THE HEALTHY COLLEGE")
- **Font:** Poppins-Bold 15px
- **Position:** Centered, `height - brand_height - 12px` from top (≈12px from bottom)
- **Color (light):** `brand_colors.thumbnail_text_color`
- **Color (dark):** White `(255, 255, 255)`

### Dynamic Font Scaling
Content font auto-reduces (1px at a time, down to 20px) if content would exceed the bottom margin (280px from bottom). The system calculates total content height including all wrapped lines and bullet spacing, and reduces font size until it fits.

---

## 4. Post Cover Slide Layout

**File:** `app/services/media/post_compositor.py` → `compose_cover_slide()`

**Canvas:** 1080×1350 (different from reels)

### Background
- Always an AI-generated image (no light/dark distinction for posts)
- Gradient overlay on bottom 60%:
  - Starts at 40% height (y=540)
  - 0→30% of gradient: alpha 0→127 (transparent to 50% black)
  - 30%→100% of gradient: alpha 127→242 (50% to 95% black)

### Visual Elements (bottom-up positioning)

```
┌──────────────────────────────────┐  0px
│                                  │
│     (AI Background Image)        │
│                                  │
│                                  │
│  ─── ─── BRAND ABBR ─── ───     │  ← horizontal lines + brand abbreviation (e.g., "HCO")
│                                  │  ← InterVariable 28px, white
│                                  │
│      TITLE LINE 1                │  ← Poppins-Bold, auto-sized 30-90px
│      TITLE LINE 2                │  ← white text, centered
│      TITLE LINE 3                │  ← balanced line breaks
│                                  │
│            Swipe                 │  ← InterVariable 24px, white (alpha 230)
│                                  │  ← 45px from bottom
└──────────────────────────────────┘  1350px
```

### Key Differences from Reel Slide
| Feature        | Reel Slide              | Post Cover Slide        |
|----------------|-------------------------|-------------------------|
| Canvas         | 1080×1920               | 1080×1350               |
| Title font     | Poppins-Bold 56px       | Poppins-Bold 30-90px (auto-fit) |
| Title bg       | Colored bars            | No bars — gradient overlay only |
| Content        | Numbered bullet points  | No content — just title  |
| Brand element  | Display name at bottom  | Abbreviation with lines  |
| Bottom element | Brand name              | "Swipe" text             |
| Text color     | Brand-specific          | Always white             |

---

## 5. YouTube Thumbnail

**File:** `app/services/media/image_generator.py` → `generate_youtube_thumbnail()`

- **Always uses AI background** (regardless of light/dark mode)
- **No text overlay** — pure AI-generated image only
- **No brand name, no title** — clean visual for maximum YouTube impact
- **Saved as JPEG** (quality 90) to stay under YouTube's 2MB limit
- **Dimensions:** 1080×1920 (same as reel)

---

## 6. Light Mode vs Dark Mode

### Light Mode
- **Background:** Solid `#f4f4f4` (light grey) — both thumbnail and reel
- **Title bar background:** Brand-specific pastel/light color (RGBA from `content_title_bg_color`)
- **Title text:** Brand-specific color (from `content_title_text_color`)
- **Content text:** Black `(0, 0, 0)`
- **Thumbnail title text:** Brand-specific color (from `thumbnail_text_color`)
- **Brand name:** Brand-specific color (same as `thumbnail_text_color`)
- **No AI image generation** for the background

### Dark Mode
- **Background:** AI-generated image via deAPI (FLUX.1-schnell model)
  - Content-aware: uses title + first 3 content lines as context for image generation
  - Brand-specific color palette influences the AI image
  - Image is slightly darkened (5% via brightness reduction to 0.95)
- **Thumbnail overlay:** 55% black overlay on AI background
- **Reel overlay:** 85% black overlay on AI background (darker for readability)
- **Title bar background:** Brand-specific dark/saturated color (RGBA from `content_title_bg_color`)
- **Title text:** White `(255, 255, 255)` (from `content_title_text_color`)
- **Content text:** White `(255, 255, 255)`
- **Thumbnail title text:** White `(255, 255, 255)` (from `thumbnail_text_color`)
- **Brand name:** White `(255, 255, 255)`
- **AI background is cached** — same image reused for thumbnail and reel of same content

---

## 7. Brand Theme Fields

### Database Model (`app/models/brands.py` — `Brand` table)

| Field | Type | Description |
|-------|------|-------------|
| `id` | String(50) | Lowercase identifier, e.g., "healthycollege" |
| `display_name` | String(100) | e.g., "THE HEALTHY COLLEGE" |
| `short_name` | String(10) | Abbreviation for posts, e.g., "HCO" |
| `colors` | JSON | Full color config (primary, accent, light_mode, dark_mode) |
| `logo_path` | String(255) | Relative to assets/logos/ |
| `instagram_handle` | String(100) | e.g., "@thehealthycollege" |

### Colors JSON Structure (in DB)
```json
{
  "primary": "#004f00",
  "accent": "#16a34a",
  "text": "#FFFFFF",
  "color_name": "vibrant green",
  "light_mode": { "background": "#dffbcb", "text": "#004f00" },
  "dark_mode": { "background": "#001f00", "text": "#FFFFFF" }
}
```

### Rendering Color System (`app/core/brand_colors.py`)

The actual rendering uses `BrandModeColors` dataclass with three fields:

```python
@dataclass
class BrandModeColors:
    thumbnail_text_color: Tuple[int, int, int]       # RGB
    content_title_text_color: Tuple[int, int, int]    # RGB
    content_title_bg_color: Tuple[int, int, int, int] # RGBA
```

### Color → Visual Element Mapping

| BrandModeColors field | Used for | Notes |
|----------------------|----------|-------|
| `thumbnail_text_color` | Thumbnail title text | Brand-specific in light, white in dark |
| `thumbnail_text_color` | Thumbnail brand name | Same color as title |
| `thumbnail_text_color` | Reel brand name (light mode) | Bottom brand text |
| `content_title_text_color` | Reel title bar text | Text inside colored bars |
| `content_title_bg_color` | Reel title bar background | The colored rectangles behind title |


### Hardcoded Colors (not from brand config)

| Element | Light Mode | Dark Mode |
|---------|-----------|-----------|
| Background fill | `#f4f4f4` | AI-generated |
| Content text | `(0, 0, 0)` black | `(255, 255, 255)` white |
| Reel brand name | `thumbnail_text_color` | `(255, 255, 255)` white |
| Dark overlay (thumbnail) | N/A | `(0, 0, 0, 140)` 55% |
| Dark overlay (reel) | N/A | `(0, 0, 0, 217)` 85% |

---

## 8. Color Mappings Per Brand

### Light Mode

| Brand | thumbnail_text | title_bar_text | title_bar_bg | content_text |
|-------|---------------|----------------|--------------|-------------|
| gymcollege | `#000000` (black) | `#000000` (black) | `#c8e1f6` (light blue) | `#000000` |
| healthycollege | `#004f00` (green) | `#000000` (black) | `#dcf6c8` (light green) | `#000000` |
| vitalitycollege | `#028f7a` (teal) | `#ffffff` (white) | `#028f7a` (teal) | `#000000` |
| longevitycollege | `#019dc8` (cyan) | `#000000` (black) | `#c8eaf6` (light cyan) | `#000000` |
| holisticcollege | `#f19b8a` (coral) | `#000000` (black) | `#f9e0db` (light coral) | `#000000` |
| wellbeingcollege | `#ffcd53` (gold) | `#000000` (black) | `#fff4d6` (light yellow) | `#000000` |

### Dark Mode

| Brand | thumbnail_text | title_bar_text | title_bar_bg | content_text |
|-------|---------------|----------------|--------------|-------------|
| gymcollege | `#ffffff` | `#ffffff` | `#00435c` (dark blue) | `#ffffff` |
| healthycollege | `#ffffff` | `#ffffff` | `#004f00` (dark green) | `#ffffff` |
| vitalitycollege | `#ffffff` | `#ffffff` | `#028f7a` (teal) | `#ffffff` |
| longevitycollege | `#ffffff` | `#ffffff` | `#019dc8` (cyan) | `#ffffff` |
| holisticcollege | `#ffffff` | `#ffffff` | `#f0836e` (coral) | `#ffffff` |
| wellbeingcollege | `#ffffff` | `#ffffff` | `#ebbe4d` (yellow) | `#ffffff` |

**Note:** vitalitycollege is unique — its light mode title bar text is white (not black), and the title bar bg color is the same in both light and dark modes.

---

## 9. Font System

**Source:** `app/utils/fonts.py`, `app/core/constants.py`

### Font Files (in `assets/fonts/`)
| File | Usage |
|------|-------|
| `Poppins-Bold.ttf` | Title text (thumbnail + reel), brand name, post titles |
| `Inter/static/Inter_24pt-Medium.ttf` | Content lines (when `USE_BOLD_CONTENT=True`) |
| `Inter/static/Inter_24pt-Regular.ttf` | Content lines (when `USE_BOLD_CONTENT=False`) |
| `InterVariable.ttf` | Post cover slide: brand abbreviation + "Swipe" text |
| `Poppins-Regular.ttf` | Available but not currently used in rendering |
| `Poppins-SemiBold.ttf` | Available but not currently used in rendering |

### Font Sizes

| Element | Default Size | Min Size | Scaling |
|---------|-------------|----------|---------|
| Thumbnail title | 80px | 40px | -2px steps |
| Reel title | 56px | 36px | Steps: 56→46→40→36 |
| Reel content | 44px | 20px | -1px steps |
| Thumbnail brand name | 28px | Fixed | — |
| Reel brand name | 15px | Fixed | — |
| Post cover title | 90px | 30px | -2px steps |
| Post cover "Swipe" | 24px | Fixed | — |
| Post cover brand abbr | 28px | Fixed | — |

### Fallback Chain
1. Try `assets/fonts/{filename}`
2. Try system fonts: Helvetica (macOS), DejaVuSans-Bold (Linux), Arial (Windows)
3. PIL default bitmap font (no sizing support)

---

## 10. Video Assembly

**File:** `app/utils/ffmpeg.py`, `app/services/media/video_generator.py`

- **Input:** Static reel image (PNG)
- **Output:** MP4 video with background music
- **Duration:** Random 7 or 8 seconds (50/50)
- **Music:** Random from `music_1`, `music_2`, `music_3` (`.mp3` files in `assets/music/`)
- **Music start:** Random offset within track
- **Audio processing:** -14dB volume + fade-out (0.5s at end)
- **Video codec:** H.264 (`libx264`), preset `medium`, CRF 23, 30fps
- **Audio codec:** AAC 192kbps
- **Pixel format:** yuv420p (converted from RGB via filter_complex)
- **Threading:** Single-thread (for Railway deployment)
- **Retry:** Up to 3 attempts with 8s/16s backoff for transient errors

---

## 11. AI Background Generation

**File:** `app/services/media/ai_background.py`

### For Reels (Dark Mode)
- **API:** deAPI (FLUX.1-schnell model)
- **Cost:** ~$0.00136 per image (512×512, 4 steps)
- **Dimensions:** Rounded to multiples of 128 (1152×1920 or similar), then resized to 1080×1920
- **Steps:** 4 (speed/cost optimized)
- **Post-processing:** 5% brightness reduction
- **Content-aware:** Prompt includes title + first 3 content lines
- **Brand-aware:** Each brand has a color palette built into the prompt:
  - gymcollege: "bright sky blue, vibrant azure, luminous cyan"
  - healthycollege: "fresh lime green, vibrant leaf green, bright spring green"
  - vitalitycollege: "bright turquoise, sparkling teal, vibrant aquamarine"
  - longevitycollege: "radiant azure, bright sky blue, luminous cyan"
- **Style:** Bright, colorful, vibrant still-life composition with wellness objects
- **Caching:** Generated once per content piece, reused for thumbnail + reel

### For Posts
- **API:** deAPI (Z-Image-Turbo INT8 model — higher quality)
- **Dimensions:** Rounded to multiples of 16 (1088×1360), then resized to 1080×1350
- **Steps:** 8 (more steps for quality)
- **Composition:** Top-heavy layout (hero subject in top 30-40%, empty bottom)
- **Queue:** Global FIFO semaphore ensures only 1 concurrent deAPI request

---

## 12. Key Constants Reference

**Source:** `app/core/constants.py`

```
REEL_WIDTH          = 1080
REEL_HEIGHT         = 1920
POST_WIDTH          = 1080
POST_HEIGHT         = 1350

FONT_BOLD           = "Poppins-Bold.ttf"
FONT_CONTENT_REGULAR = "Inter/static/Inter_24pt-Regular.ttf"
FONT_CONTENT_MEDIUM  = "Inter/static/Inter_24pt-Medium.ttf"
USE_BOLD_CONTENT    = True

TITLE_FONT_SIZE     = 80   (thumbnail)
CONTENT_FONT_SIZE   = 44   (reel content lines)
BRAND_FONT_SIZE     = 40   (unused in rendering — override with 28/15)

SIDE_MARGIN         = 80   (thumbnail title max-width margin)
H_PADDING           = 20   (title bar horizontal padding)
TITLE_SIDE_PADDING  = 90   (reel title area left/right margin)
CONTENT_SIDE_PADDING = 108 (reel content area left/right margin)
TITLE_CONTENT_SPACING = 70 (gap between title bars and content)
BOTTOM_MARGIN       = 280  (minimum space from bottom edge)
BAR_HEIGHT          = 100  (title background bar height)
BAR_GAP             = 0    (gap between title bars)
VERTICAL_CORRECTION = -3   (text positioning tweak)
LINE_SPACING        = 20   (thumbnail title line spacing)
CONTENT_LINE_SPACING = 1.5 (content line height multiplier)
```

---

## Summary

The system renders two main content types:

1. **Reels** — 1080×1920 vertical images with:
   - A thumbnail (centered title + brand name) 
   - A content slide (title in colored bars + numbered bullet points)
   - A video (static image + random music track, 7-8s)

2. **Posts** — 1080×1350 images with:
   - AI background + gradient overlay
   - Brand abbreviation bar with horizontal lines
   - Title text (auto-sized, balanced)
   - "Swipe" indicator

Each brand has 3 configurable color fields (`thumbnail_text_color`, `content_title_text_color`, `content_title_bg_color`) for both light and dark modes. Light mode uses a flat grey background; dark mode uses AI-generated imagery with dark overlays. The logo is stored but **not currently rendered** on reels/thumbnails — only the text-based brand display name appears.
