# Template Image Analysis Spec

> Generated: 2026-02-15  
> Purpose: Document the exact layout of all light-mode template PNGs for dynamic recreation

---

## 1. Template File Inventory

All templates are stored under `assets/templates/<brand>/light mode/`.  
Every brand has exactly **2 templates**: `content_template.png` and `thumbnail_template.png`.

| Brand | Path | Size | Mode |
|---|---|---|---|
| healthycollege | `healthycollege/light mode/content_template.png` | 1080×1920 | RGB |
| healthycollege | `healthycollege/light mode/thumbnail_template.png` | 1080×1920 | RGB |
| holisticcollege | `holisticcollege/light mode/content_template.png` | 1080×1920 | RGB |
| holisticcollege | `holisticcollege/light mode/thumbnail_template.png` | 1080×1920 | RGB |
| longevitycollege | `longevitycollege/light mode/content_template.png` | 1080×1920 | RGB |
| longevitycollege | `longevitycollege/light mode/thumbnail_template.png` | 1080×1920 | RGB |
| vitalitycollege | `vitalitycollege/light mode/content_template.png` | 1080×1920 | RGB |
| vitalitycollege | `vitalitycollege/light mode/thumbnail_template.png` | 1080×1920 | RGB |
| wellbeingcollege | `wellbeingcollege/light mode/content_template.png` | 1080×1920 | RGB |
| wellbeingcollege | `wellbeingcollege/light mode/thumbnail_template.png` | 1080×1920 | RGB |

**Total: 10 files, 5 brands × 2 templates each**

---

## 2. Template Layout Structure

### Key Finding: Templates are extremely minimal

Every template is a **solid `#f4f4f4` (244, 244, 244) background** that covers 99.6–100% of pixels. The only non-background elements are **brand name text** rendered in the brand's accent color.

### 2.1 Content Templates (`content_template.png`)

**Layout:** Flat `#f4f4f4` background with brand name text near the very bottom.

| Brand | Brand Text Position | Bounding Box | Text Width × Height | Dominant Color |
|---|---|---|---|---|
| healthycollege | Center-bottom | (436, 1891) → (643, 1906) | 208 × 16 px | `#004f00` (dark green) |
| holisticcollege | Center-bottom | (434, 1891) → (645, 1906) | 212 × 16 px | `#f19b8a` (coral) |
| longevitycollege | Center-bottom | (417, 1888) → (662, 1904) | 246 × 17 px | `#17bbe7` (cyan) |
| vitalitycollege | Center-bottom | (438, 1891) → (641, 1906) | 204 × 16 px | `#028f7a` (teal) |
| wellbeingcollege | Center-bottom | (380, 1873) → (698, 1892) | 319 × 20 px | `#ffcd53` (gold) |

**Common pattern:**
- Brand text is horizontally centered (center X ≈ 539, image center = 540)
- Text sits ~14–47 px from the bottom edge (y ≈ 1873–1906 in a 1920px image)
- Font size is very small: ~15–20px height
- Non-bg pixel count: 1,275–3,881 (0.006–0.019% of total pixels)

### 2.2 Thumbnail Templates (`thumbnail_template.png`)

**Layout:** Flat `#f4f4f4` background with brand name text positioned at vertical center-bottom.

| Brand | Brand Text Position | Bounding Box | Text Width × Height | Dominant Color |
|---|---|---|---|---|
| healthycollege | Center | (351, 1267) → (727, 1292) | 377 × 26 px | `#004f00` (dark green) |
| holisticcollege | Center | (350, 1267) → (728, 1292) | 379 × 26 px | `#f19b8a` (coral) |
| longevitycollege | Center | (324, 1268) → (754, 1294) | 431 × 27 px | `#17bbe7` (cyan) |
| vitalitycollege | Center | (353, 1267) → (726, 1292) | 374 × 26 px | `#028f7a` (teal) |
| wellbeingcollege | Center | (333, 1267) → (746, 1292) | 414 × 26 px | `#ffcd53` (gold) |

**Common pattern:**
- Brand text is horizontally centered (center X = 539)
- Text sits at Y center ≈ 1279 (66.6% from top in a 1920px image)
- Font size: ~26–27px height (larger than content templates)
- Non-bg pixel count: 5,264–6,540

---

## 3. Brand Color Definitions (from `brand_colors.py`)

### 3.1 Per-Brand Colors

| Brand | Light Thumb Text | Light Content Title Text | Light Title BG | Dark Thumb Text | Dark Content Title Text | Dark Title BG |
|---|---|---|---|---|---|---|
| gymcollege | `#000000` | `#000000` | `#c8e1f6` | `#ffffff` | `#ffffff` | `#00435c` |
| healthycollege | `#004f00` | `#000000` | `#dcf6c8` | `#ffffff` | `#ffffff` | `#004f00` |
| vitalitycollege | `#028f7a` | `#ffffff` | `#028f7a` | `#ffffff` | `#ffffff` | `#028f7a` |
| longevitycollege | `#019dc8` | `#000000` | `#c8eaf6` | `#ffffff` | `#ffffff` | `#019dc8` |
| holisticcollege | `#f19b8a` | `#000000` | `#f9e0db` | `#ffffff` | `#ffffff` | `#f0836e` |
| wellbeingcollege | `#ffcd53` | `#000000` | `#fff4d6` | `#ffffff` | `#ffffff` | `#ebbe4d` |

### 3.2 Brand Display Names

| Brand ID | Display Name |
|---|---|
| gymcollege | THE GYM COLLEGE |
| healthycollege | THE HEALTHY COLLEGE |
| vitalitycollege | THE VITALITY COLLEGE |
| longevitycollege | THE LONGEVITY COLLEGE |
| holisticcollege | THE HOLISTIC COLLEGE |
| wellbeingcollege | THE WELLBEING COLLEGE |

### 3.3 Template Brand Text vs. brand_colors.py Values — Validation

The dominant non-bg color in each template matches the `light_mode.thumbnail_text_color` exactly:

| Brand | Template Dominant Color | brand_colors.py thumbnail_text_color | Match? |
|---|---|---|---|
| healthycollege | `#004f00` | `#004f00` | ✅ |
| holisticcollege | `#f19b8a` | `#f19b8a` | ✅ |
| longevitycollege | `#17bbe7` | `#019dc8`* | ⚠️ Close but different |
| vitalitycollege | `#028f7a` | `#028f7a` | ✅ |
| wellbeingcollege | `#ffcd53` | `#ffcd53` | ✅ |

> *Note: longevitycollege's template uses `#17bbe7` but brand_colors.py defines `#019dc8`. The template was likely created with a slightly different shade. The content template brand text also uses `#17bbe7`. For dynamic recreation, use the brand_colors.py value (`#019dc8`) as the authoritative source, or update brand_colors.py to match the templates.

---

## 4. Current Image Generator Rendering Approach

### File: `app/services/media/image_generator.py`

#### 4.1 Light Mode Rendering (Template-Based)
- **Thumbnail:** Loads `thumbnail_template.png` via `template_loader.py`, draws title text centered + brand name below
- **Content:** Loads `content_template.png` via `template_loader.py`, draws title with colored background bars + numbered content lines

#### 4.2 Dark Mode Rendering (AI-Generated)
- **Thumbnail:** AI-generated background → 55% dark overlay → white title text centered → white brand name below
- **Content:** AI-generated background → 85% dark overlay → colored title bars → white content text → white brand name at bottom

#### 4.3 Template Loading Chain (`template_loader.py`)
1. Check local cache (`/tmp/brand-templates/<brand>/<file>.png`) — valid for 24 hours
2. Download from Supabase Storage (`brand-assets/templates/<brand>/light mode/<file>.png`)
3. Fallback to local filesystem (`assets/templates/<brand>/light mode/<file>.png`)

#### 4.4 Key Layout Constants (from `constants.py`)
| Constant | Value | Purpose |
|---|---|---|
| `REEL_WIDTH` | 1080 | Image width |
| `REEL_HEIGHT` | 1920 | Image height |
| `TITLE_FONT_SIZE` | 80 | Default thumbnail title font |
| `CONTENT_FONT_SIZE` | 44 | Content line font size |
| `BRAND_FONT_SIZE` | 40 | Brand name font size |
| `SIDE_MARGIN` | 80 | Side margin for title wrapping |
| `H_PADDING` | 20 | Title bar horizontal padding |
| `TITLE_SIDE_PADDING` | 90 | Title area left/right padding |
| `CONTENT_SIDE_PADDING` | 108 | Content area left/right padding |
| `TITLE_CONTENT_SPACING` | 70 | Gap between title and content |
| `BOTTOM_MARGIN` | 280 | Min distance from bottom edge |
| `BAR_HEIGHT` | 100 | Title background bar height |
| `BAR_GAP` | 0 | Gap between title bars |
| `LINE_SPACING` | 20 | Thumbnail title line spacing |
| `CONTENT_LINE_SPACING` | 1.5 | Content line spacing multiplier |
| `FONT_BOLD` | `Poppins-Bold.ttf` | Title/brand font |
| `FONT_CONTENT_MEDIUM` | `Inter/static/Inter_24pt-Medium.ttf` | Content font |

#### 4.5 Thumbnail Layout (Light Mode)
```
┌────────────────────────┐ 0
│                        │
│      #f4f4f4 bg        │
│                        │
│                        │
│ ┌──────────────────┐   │ ~center-ish
│ │  TITLE LINE 1    │   │  (centered, up to 3 lines)
│ │  TITLE LINE 2    │   │  Font: Poppins-Bold @ 80px
│ └──────────────────┘   │  Color: brand thumbnail_text_color
│                        │
│                        │
│    THE BRAND COLLEGE   │  y ≈ 1279 (from template)
│                        │  Font: Poppins-Bold @ 28px (dark mode draws this)
│                        │  Color: brand thumbnail_text_color
│                        │
└────────────────────────┘ 1920
```
- Title is vertically centered: `title_y = (1920 - title_height) / 2`
- Brand name in template at y≈1279 (thumbnail), y≈1898 (content)
- Dark mode adds brand name at `title_y + 254` below title

#### 4.6 Content/Reel Layout (Light Mode)
```
┌────────────────────────┐ 0
│                        │
│      #f4f4f4 bg        │
│                        │
│  ┌──────────────────┐  │ y=280 (title_start_y)
│  │  TITLE BAR LINE1 │  │  Poppins-Bold, BG color = content_title_bg_color
│  │  TITLE BAR LINE2 │  │  Text color = content_title_text_color
│  └──────────────────┘  │
│                        │ +70px (TITLE_CONTENT_SPACING)
│  1. First content line │  y = 280 + title_h + 70
│  2. Second content     │  Font: Inter Medium @ 44px
│  3. Third content line │  Color: black (#000000) for light mode
│  ...                   │  Left margin: 108px (CONTENT_SIDE_PADDING)
│  N. Last/CTA line      │
│                        │
│                        │ ← BOTTOM_MARGIN = 280px
│  THE BRAND COLLEGE     │ y ≈ 1891–1906 (from template, ~15px font)
└────────────────────────┘ 1920
```

---

## 5. Recommendations for Dynamic Light Mode Rendering

### 5.1 Templates Can Be Replaced With Pure Code

Since every template is just `#f4f4f4` + small brand name text, they can be **entirely replaced** with programmatic rendering:

```python
# Pseudo-code for dynamic light mode
image = Image.new('RGB', (1080, 1920), (244, 244, 244))  # #f4f4f4
draw = ImageDraw.Draw(image)

# For content templates: draw brand name at bottom
brand_font = load_font(FONT_BOLD, 15)  # ~15px for content, ~28px for thumbnail
brand_text = get_brand_display_name(brand_name)
brand_w, _ = get_text_dimensions(brand_text, brand_font)
brand_x = (1080 - brand_w) // 2
brand_y = 1891  # content: ~1891, thumbnail: ~1267
draw.text((brand_x, brand_y), brand_text, font=brand_font, fill=thumbnail_text_color)
```

### 5.2 Benefits of Dynamic Rendering
- **No static file dependency** — eliminates Supabase Storage downloads, local cache, and filesystem fallback
- **Instant brand changes** — update colors in DB/brand_colors.py, no re-upload needed
- **Easier to add new brands** — just add color config, no Figma/PNG export step
- **Smaller Docker images** — remove 10 PNG files from assets

### 5.3 Brand Text Positioning (Exact Specs for Recreation)

**Content template brand text:**
| Parameter | Value |
|---|---|
| Font | Poppins-Bold (estimated ~12–13px, renders ~16px height) |
| Y position | ~1891 (top edge of text bounding box) |
| X position | Centered horizontally |
| Color | Brand's `thumbnail_text_color` |

**Thumbnail template brand text:**
| Parameter | Value |
|---|---|
| Font | Poppins-Bold (estimated ~20–22px, renders ~26px height) |
| Y position | ~1267 (top edge of text bounding box) |
| X position | Centered horizontally |
| Color | Brand's `thumbnail_text_color` |

### 5.4 Color Discrepancy to Resolve
- **longevitycollege**: Template uses `#17bbe7`, brand_colors.py uses `#019dc8`. Decide which is canonical before dynamic rendering.

### 5.5 Suggested Implementation Path
1. Add a `generate_light_background()` method to `ImageGenerator` that creates `#f4f4f4` + brand text programmatically
2. Keep `template_loader.py` as fallback during transition
3. Remove static PNGs from `assets/templates/` once validated
4. Remove the Supabase Storage bucket path `templates/` once fully dynamic
