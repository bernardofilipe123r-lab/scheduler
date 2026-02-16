# Maestro vs Manual Post Flow — Complete Analysis

## 1. What Data Does Maestro Have When Scheduling a Post?

When Maestro creates a post job, the flow is:

1. **Agent generates proposal** → `AgentProposal` with: `title`, `slide_texts[]`, `image_prompt`, `brand`, `content_type="post"`, `variant="post"`
2. **Examiner accepts** → `_create_and_dispatch_job()` in `app/services/maestro/proposals.py`
3. **Job created** via `JobManager.create_job()` with `variant="post"`, single brand
4. **`process_job()` detects `variant=="post"`** → calls `process_post_brand()` in `app/services/content/job_processor.py`
5. **`process_post_brand()` only generates an AI background image** — NO compositing, NO text slides
6. **`auto_schedule_job()` schedules** with these fields from `brand_outputs`:
   - `reel_id` ✅
   - `thumbnail_path` (= the raw AI background PNG at `/output/posts/{reel_id}_background.png`) ✅
   - `caption` ✅
   - `post_title` ✅ (title from brand_outputs)
   - `slide_texts` ✅ (text array for carousel slides)
   - `video_path` = None (posts have no video) ✅

### Critical Gap
**Maestro only saves the raw AI background image.** There is NO server-side composition of:
- Cover slide (background + gradient + abbreviation bar + title + "Swipe")
- Text slides (beige bg + brand header + body text + footer icons)

The manual flow uses **Konva (client-side canvas)** to composite these and sends base64 screenshots to the server.

---

## 2. Cover Slide Visual Layout (from PostCanvas.tsx Konva Code)

**File:** `src/shared/components/PostCanvas.tsx`

### Canvas Size
```
CANVAS_WIDTH  = 1080
CANVAS_HEIGHT = 1350
```
Aspect ratio: 4:5 (Instagram portrait post)

### Layer Stack (bottom → top)

#### Layer 1: Background Image
- Full canvas coverage (1080×1350)
- AI-generated image from `/output/posts/{reel_id}_background.png`
- If no image: solid `#1a1a2e`

#### Layer 2: Gradient Overlay
```tsx
// Starts at 40% from top, covers bottom 60%
y={CANVAS_HEIGHT * 0.4}  // y=540
height={CANVAS_HEIGHT * 0.6}  // height=810

// Color stops:
[0, 'rgba(0,0,0,0)',      // top: transparent
 0.3, 'rgba(0,0,0,0.5)',  // 30%: half-black
 1, 'rgba(0,0,0,0.95)']   // bottom: near-black
```

#### Layer 3: Brand Abbreviation Bar (LogoWithLines)
- Position: `y = ly` (computed from bottom-up layout)
- `logoGapWidth = 113` px between lines
- `logoHeight = 40` px
- **Left horizontal line:** from `leftLineStart` → `CANVAS_WIDTH/2 - 56.5`, stroke=white, width=2
- **Right horizontal line:** from `CANVAS_WIDTH/2 + 56.5` → `rightLineEnd`, stroke=white, width=2
- **Abbreviation text:** centered, fontSize=28, fontFamily="Inter, sans-serif", fontStyle="bold", fill="white"
- Bar width: `titleWidth/2 - logoGapWidth/2` when `barWidth=0` (Auto mode)

Abbreviations:
| Brand | Abbreviation |
|-------|-------------|
| healthycollege | HCO |
| holisticcollege | HCO |
| longevitycollege | LCO |
| vitalitycollege | VCO |
| wellbeingcollege | WCO |
| (unknown) | First letter + CO |

#### Layer 4: Title Text (TitleLayer)
- Text: **UPPERCASE** version of title
- Font: `Anton` (Google font)
- Font size: auto-fitted via `autoFitFontSize()`:
  - Tries 3 lines: 90px → 64px
  - Tries 2 lines: 90px → 30px
  - 1 line: largest that fits ≤ 90px
- Line height: `fontSize * 1.1`
- Alignment: **center** within `CANVAS_WIDTH - titlePaddingX * 2`
- Default `titlePaddingX = 45`
- Fill: **white**
- Lines are **balanced** (word distribution minimizes length difference between lines)

#### Layer 5: "Swipe" Label (ReadCaption)
- Text: `"Swipe"`
- fontSize=24, fontFamily="Inter, sans-serif", fill="white", opacity=0.9
- Centered horizontally
- Position: `y = CANVAS_HEIGHT - readCaptionBottom - 24 = 1350 - 45 - 24 = 1281`

### Vertical Layout Computation (bottom-up)
```
readCaptionBottom = 45    (default)
titleGap = 80             (default)
logoGap = 36              (default)
titlePaddingX = 45        (default)

rcy = CANVAS_HEIGHT - readCaptionBottom - 24  // "Swipe" y = 1281
ty  = rcy - titleGap - titleHeight            // Title y (depends on text)
ly  = ty - logoGap - 40                       // Logo bar y
```

---

## 3. Text Slides Visual Layout (from CarouselTextSlide.tsx)

**File:** `src/shared/components/CarouselTextSlide.tsx`

### Canvas Size
Same: `1080 × 1350`

### Layout Constants
```tsx
PAD_X = 80
LOGO_SIZE = 56
TEXT_WIDTH = CANVAS_WIDTH - PAD_X * 2  // 920
BOTTOM_BAR_Y = CANVAS_HEIGHT - 120     // 1230
ICON_SIZE = 30
HEADER_BLOCK_H = LOGO_SIZE + 20       // 76
HEADER_TEXT_GAP = 30
TEXT_FONT_SIZE = 38
TEXT_LINE_HEIGHT = 1.55
```

### Layer Stack

#### Background
- Solid color `#f8f5f0` (warm beige/off-white)

#### Brand Header (top area, vertically centered)
- **Position:** `x=PAD_X(80)`, `y=contentY` (computed for vertical centering)
- **Logo circle:** 56px diameter
  - If brand logo image available: circular clipped image
  - Else: colored circle (brand color) with white initial letter (fontSize=28, Inter bold)
- **Brand name:** `x=LOGO_SIZE+16=72` from logo left, `y=contentY+4`
  - fontSize=30, Inter bold, fill="#1a1a1a"
  - E.g., "The Healthy College"
- **Handle:** `x=LOGO_SIZE+16`, `y=contentY+38`
  - fontSize=24, Inter regular, fill="#888888"
  - E.g., "@thehealthycollege"

Brand handles:
| Brand | Handle |
|-------|--------|
| healthycollege | @thehealthycollege |
| longevitycollege | @thelongevitycollege |
| wellbeingcollege | @thewellbeingcollege |
| vitalitycollege | @thevitalitycollege |
| holisticcollege | @theholisticcollege |

Brand display names:
| Brand | Display |
|-------|---------|
| healthycollege | The Healthy College |
| longevitycollege | The Longevity College |
| wellbeingcollege | The Wellbeing College |
| vitalitycollege | The Vitality College |
| holisticcollege | The Holistic College |

Brand colors:
| Brand | Color |
|-------|-------|
| healthycollege | #22c55e |
| longevitycollege | #0ea5e9 |
| wellbeingcollege | #eab308 |
| vitalitycollege | #14b8a6 |
| holisticcollege | #f97316 |

#### Body Text
- Position: `x=PAD_X(80)`, `y=contentY + HEADER_BLOCK_H + HEADER_TEXT_GAP` (= contentY + 76 + 30 = contentY + 106)
- width=920 (TEXT_WIDTH)
- fontSize=38
- fontFamily: configurable, default `Georgia, 'Times New Roman', serif`
- fill="#1a1a1a"
- lineHeight=1.55
- wrap="word"
- Text has `{{brandhandle}}` placeholders replaced with actual handle

#### ContentY Computation (stable across all slides)
```tsx
function computeStableContentY(allTexts: string[]): number {
  // Find tallest slide text
  const availableH = BOTTOM_BAR_Y - 40 - 60  // 1230 - 100 = 1130
  let maxTotalH = 0
  for (const t of allTexts) {
    const textH = estimateTextHeight(t, 38, 1.55, 920)
    const totalH = 76 + 30 + textH  // header + gap + text
    if (totalH > maxTotalH) maxTotalH = totalH
  }
  const centered = 60 + (availableH - maxTotalH) / 2
  return Math.max(60, Math.min(centered, 280))
}
```

#### Bottom Footer Bar (y=1230)
- **"SHARE" text:** x=80, y=1232, fontSize=24, Inter bold, fill="#1a1a1a", letterSpacing=2
- **Share icon:** x=190 (PAD_X+110), y=1228, 30×30, loaded from `assets/icons/share.png`
- **"SWIPE" text:** centered, fontSize=24, Inter bold, fill="#1a1a1a", letterSpacing=2
  - Only shown if NOT last slide
- **Save icon:** x=CANVAS_WIDTH-PAD_X-140=860, y=1229, 28×28, loaded from `assets/icons/save.png`
- **"SAVE" text:** x=CANVAS_WIDTH-PAD_X-98=902, y=1232, fontSize=24, Inter bold, fill="#1a1a1a", letterSpacing=2

---

## 4. Existing PIL/Pillow Code That Can Be Reused

### A. Cover Slide Compositor (ALREADY EXISTS!)
**File:** `app/services/media/post_compositor.py`

This file **already replicates the PostCanvas Konva layout** for cover slides! It has:
- `compose_cover_slide(background_path, title, brand, output_path)` → returns PIL Image
- `_draw_gradient()` — matches the Konva GradientOverlay
- `_auto_fit_font_size()` — matches autoFitFontSize() from PostCanvas
- `_balance_title()` — matches balanceTitleText() from PostCanvas
- `_draw_logo_bar()` — matches LogoWithLines (abbreviation + lines)
- `_draw_title()` — matches TitleLayer
- `_draw_swipe()` — matches ReadCaption

**Differences from Konva:**
1. Uses `Poppins-Bold.ttf` instead of `Anton` font for title
2. Uses `InterVariable.ttf` instead of `Inter` for abbreviation/swipe
3. No logo image support (only abbreviation text)
4. titlePaddingX hardcoded to 0 (Konva default is 45)

### B. Reel Image Generator
**File:** `app/services/media/image_generator.py`

`ImageGenerator.generate_reel_image()` — comprehensive PIL renderer for reel content slides:
- Bold text support (`**text**` markdown)
- Dynamic font scaling
- Text wrapping with bold segments
- Brand colors from `brand_colors.py`
- This is for REELS (1080×1920), not posts (1080×1350)

### C. Text Utilities
**File:** `app/utils/text_layout.py`
- `wrap_text()`, `get_text_dimensions()`, `draw_text_centered()`, `draw_multiline_text_centered()`
- `draw_text_with_background()`

**File:** `app/utils/text_formatting.py`
- `parse_bold_text()`, `wrap_text_with_bold()`, `draw_mixed_text()`

**File:** `app/utils/fonts.py`
- `load_font()`, `get_font_path()` — loads from `assets/fonts/`

---

## 5. Available Fonts, Logos, and Icons

### Fonts (`assets/fonts/`)
| File | Usage |
|------|-------|
| `Poppins-Bold.ttf` | Titles (reel), cover slide title in post_compositor |
| `Poppins-Regular.ttf` | Available but unused |
| `Poppins-SemiBold.ttf` | Available but unused |
| `InterVariable.ttf` | Variable weight Inter (abbreviation/swipe in post_compositor) |
| `InterVariable-Italic.ttf` | Variable weight Inter italic |
| `Inter/static/Inter_24pt-Regular.ttf` | Content text (reels) |
| `Inter/static/Inter_24pt-Medium.ttf` | Content text bold (reels) |
| `Inter/Inter-VariableFont_opsz,wght.ttf` | Full variable Inter |
| `BrowalliaNew-Bold.ttf` | Available but unused |

**Note:** The Konva PostCanvas uses `Anton` font for titles. Anton is **not** in assets/fonts/. The PIL post_compositor uses Poppins-Bold as fallback.

### Logos (`assets/logos/`)
- Only `README.md` — **no logo image files exist on disk**
- Brand logos come from: (a) user upload stored in localStorage as data URLs, (b) brand theme logos fetched from `/api/brands/{brand}/theme` → served from `/brand-logos/` static path
- The PIL renderer would need to fetch logos from the database/API or skip them (show colored circle + initial letter like the Konva fallback)

### Icons (`assets/icons/`)
| File | Usage |
|------|-------|
| `share.png` | Text slide footer — "SHARE" icon |
| `save.png` | Text slide footer — "SAVE" icon |

---

## 6. Post Image Size

**1080 × 1350 pixels** (4:5 aspect ratio, Instagram portrait post)

Defined in:
- `src/shared/components/PostCanvas.tsx`: `CANVAS_WIDTH=1080, CANVAS_HEIGHT=1350`
- `app/services/media/post_compositor.py`: `CANVAS_WIDTH=1080, CANVAS_HEIGHT=1350`
- `app/core/constants.py`: `POST_WIDTH=1080, POST_HEIGHT=1350`

---

## 7. The Gap: What's Missing for Maestro Server-Side Rendering

### Current Maestro Post Flow
```
Agent → Proposal → Job → process_post_brand() → ONLY saves raw AI background
                                                  → auto_schedule_job() schedules with:
                                                     thumbnail_path = raw background
                                                     slide_texts = text array
                                                     post_title = title
```

### Current Manual Post Flow  
```
PostJobDetail.tsx:
  1. Fetches raw AI background from server
  2. Renders cover slide via Konva (PostCanvas component) on client
  3. Renders text slides via Konva (CarouselTextSlide component) on client
  4. Takes base64 screenshots of each Konva Stage
  5. POSTs to /reels/schedule-post-image with:
     - image_data = base64 of cover slide screenshot
     - carousel_images = [base64 of each text slide screenshot]
     - slide_texts, title, caption, schedule_time
  6. Server decodes base64 and saves as files
```

### What Needs to Be Built
A server-side PIL renderer that produces the **same output** as the Konva screenshots:

1. **Cover slide compositor** — `post_compositor.py` already exists but needs:
   - Switch from Poppins-Bold to Anton font (or add Anton to assets/fonts/)
   - Fix titlePaddingX default (should be 45, not 0)
   - Add logo image support (circular clipped brand logo)
   
2. **Text slide compositor** — **DOES NOT EXIST** yet. Needs to render:
   - Beige background `#f8f5f0`
   - Brand header: circular logo/initial + name + handle
   - Body text: Georgia font, fontSize=38, lineHeight=1.55
   - Footer bar: SHARE icon + text, SWIPE text (optional), SAVE icon + text
   - contentY computation for stable vertical centering across all slides

3. **Integration into Maestro flow** (`process_post_brand()` or `auto_schedule_job()`):
   - After generating AI background, composite cover + text slides
   - Save as individual PNG files
   - Store paths in `carousel_paths` field of the scheduled reel
   - So the publisher has actual rendered images instead of raw backgrounds

### Key Constants for the PIL Text Slide Renderer
```python
CANVAS_WIDTH = 1080
CANVAS_HEIGHT = 1350
BG_COLOR = '#f8f5f0'          # Warm beige
TEXT_COLOR = '#1a1a1a'         # Near-black
SUBTLE_COLOR = '#888888'       # Gray for handle
PAD_X = 80                     # Side padding
LOGO_SIZE = 56                 # Brand logo circle diameter
TEXT_WIDTH = 920               # CANVAS_WIDTH - PAD_X * 2
BOTTOM_BAR_Y = 1230           # CANVAS_HEIGHT - 120
ICON_SIZE = 30
HEADER_BLOCK_H = 76           # LOGO_SIZE + 20
HEADER_TEXT_GAP = 30
TEXT_FONT_SIZE = 38
TEXT_LINE_HEIGHT = 1.55
BRAND_NAME_FONT_SIZE = 30
HANDLE_FONT_SIZE = 24
FOOTER_FONT_SIZE = 24
FOOTER_LETTER_SPACING = 2
```

### Brand Config for Text Slides
```python
BRAND_HANDLES = {
    'healthycollege': '@thehealthycollege',
    'longevitycollege': '@thelongevitycollege',
    'wellbeingcollege': '@thewellbeingcollege',
    'vitalitycollege': '@thevitalitycollege',
    'holisticcollege': '@theholisticcollege',
}

BRAND_DISPLAY_NAMES = {
    'healthycollege': 'The Healthy College',
    'longevitycollege': 'The Longevity College',
    'wellbeingcollege': 'The Wellbeing College',
    'vitalitycollege': 'The Vitality College',
    'holisticcollege': 'The Holistic College',
}

BRAND_COLORS = {
    'healthycollege': '#22c55e',
    'longevitycollege': '#0ea5e9',
    'wellbeingcollege': '#eab308',
    'vitalitycollege': '#14b8a6',
    'holisticcollege': '#f97316',
}
```

### Font Requirements for Text Slides
| Element | Font | Size | Style | Color |
|---------|------|------|-------|-------|
| Brand initial (fallback) | Inter | 28 | bold | white |
| Brand name | Inter | 30 | bold | #1a1a1a |
| Handle | Inter | 24 | regular | #888888 |
| Body text | Georgia (default) | 38 | normal | #1a1a1a |
| Footer text (SHARE/SWIPE/SAVE) | Inter | 24 | bold | #1a1a1a |

**Note:** Georgia is a system font — available on macOS/Windows but may need a fallback on Linux/Docker. The font family in Konva is `"Georgia, 'Times New Roman', serif"`.

### Footer Icon Positioning (exact pixel coords at 1080×1350)
```
BOTTOM_BAR_Y = 1230 (baseline for footer)

SHARE text:  x=80,  y=1232
Share icon:  x=190, y=1228, size=30×30

SWIPE text:  centered (x=0, width=1080, align=center), y=1232
             (only if NOT last slide)

Save icon:   x=860, y=1229, size=28×28
SAVE text:   x=902, y=1232
```
