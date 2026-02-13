# Visual Rendering Pipeline Analysis

## Complete Trace: AI Text → Rendered Image

---

## Table of Contents
1. [Pipeline Overview](#1-pipeline-overview)
2. [Two Distinct Rendering Pipelines](#2-two-distinct-rendering-pipelines)
3. [Post Pipeline (Cover Slide)](#3-post-pipeline-cover-slide)
4. [Reel Pipeline (Thumbnail + Content Slides)](#4-reel-pipeline-thumbnail--content-slides)
5. [Frontend Rendering (PostCanvas / Konva.js)](#5-frontend-rendering-postcanvas--konvajs)
6. [Title Rendering Deep Dive](#6-title-rendering-deep-dive)
7. [Font Inventory](#7-font-inventory)
8. [Template & Asset Inventory](#8-template--asset-inventory)
9. [Brand Color System](#9-brand-color-system)
10. [Constants Reference](#10-constants-reference)
11. [Identified Bugs & Mismatches](#11-identified-bugs--mismatches)

---

## 1. Pipeline Overview

There are **two completely separate rendering systems** in this codebase:

| System | Purpose | Renderer | Dimensions | Title Font/Logic |
|--------|---------|----------|------------|-----------------|
| **Post Pipeline** | Instagram image posts (cover slides) | `post_compositor.py` (Pillow server-side) + `PostCanvas.tsx` (Konva client-side) | **1080×1350** | `Poppins-Bold` (server) / `Anton` (client), auto-fit 90→30px, char-count estimation |
| **Reel Pipeline** | Instagram reels (thumbnail + content slides) | `image_generator.py` (Pillow server-side) | **1080×1920** | `Poppins-Bold`, starts at 80px, pixel-measured wrapping |

These two pipelines use **fundamentally different title layout algorithms**.

---

## 2. Two Distinct Rendering Pipelines

### Flow: Post (variant="post")
```
1. ContentGenerator.generate_post_titles_batch() → AI generates title, caption, image_prompt
2. JobManager.process_post_brand() → AIBackgroundGenerator.generate_post_background() → 1080×1350 AI image
3. Image saved as raw background PNG
4. CLIENT-SIDE: PostCanvas.tsx renders preview in browser (Konva.js)
5. AT PUBLISH TIME: post_compositor.compose_cover_slide() composites title onto background (server-side Pillow)
```

### Flow: Reel (variant="light" or "dark")
```
1. Reel content generated (title + content_lines)
2. JobManager.process_brand_generation() calls:
   a. ImageGenerator.generate_thumbnail() → 1080×1920 thumbnail image
   b. ImageGenerator.generate_reel_image() → 1080×1920 content slide(s)
3. Images → video pipeline
```

---

## 3. Post Pipeline (Cover Slide)

### File: `app/services/post_compositor.py`

**Purpose:** Server-side replication of the client-side PostCanvas (Konva) rendering.

**Canvas dimensions:** `1080×1350`

**Layer stack (bottom to top):**
1. Background image (AI-generated, resized to 1080×1350)
2. Gradient overlay (bottom 60%: starts at 40% height, transparent → 50% black at 30% → 95% black at bottom)
3. Brand abbreviation bar with horizontal lines (e.g., "HCO", "LCO", "VCO", "WCO")
4. Title text (uppercase, balanced line-breaks, Poppins-Bold)
5. "Swipe" indicator at bottom

**Layout constants (mirroring PostCanvas.tsx):**
- `TITLE_PADDING_X = 45` → max text width = 1080 - 90 = **990px**
- `READ_CAPTION_BOTTOM = 45`
- `TITLE_GAP = 80` (gap between title bottom and "Swipe")
- `LOGO_GAP = 36` (gap between logo bar and title top)

**Vertical positioning (bottom-up):**
```
rcy = 1350 - 45 - 24 = 1281  (Swipe label y)
ty  = 1281 - 80 - titleHeight  (Title y)
ly  = ty - 36 - 40             (Logo bar y)
```

### Title Auto-Fit Algorithm (`_auto_fit_font_size`)

Uses **character-count estimation** (NOT pixel measurement):
```python
avg_char_width = font_size * 0.48
max_chars = int(max_width / avg_char_width)
```

**Strategy — prefer MORE lines at LARGER font sizes:**
1. **Try 3 lines:** Scan from 90px → 64px. If text wraps to exactly 3 lines, use that font size.
2. **Try 2 lines:** Scan from 90px → 30px. If text wraps to exactly 2 lines, use that font size.
3. **Try 1 line:** Scan from 90px → 30px. Largest size where text fits in 1 line.

**Key constants:**
- `AUTO_FIT_MAX = 90` (largest font size tried)
- `AUTO_FIT_MIN = 30` (smallest font size tried)
- `THREE_LINE_FLOOR = 64` (below this, stop trying 3 lines)

### Title Balancing Algorithm (`_balance_title`)

After determining line count via greedy wrap, redistributes words to minimize length difference between lines:

1. **Greedy wrap** → determines natural line count
2. **If 2 lines:** Try all word split positions, pick the one with smallest `|len(line1) - len(line2)|`
3. **If 3 lines:** Try all `(i, j)` split positions, pick smallest `max(|l1-l2|, |l2-l3|, |l1-l3|)`

**Max chars per line at each font size (at 990px max width):**

| Font Size | avg_char_width | max_chars_per_line |
|-----------|---------------|-------------------|
| 90px | 43.2px | 22 chars |
| 80px | 38.4px | 25 chars |
| 70px | 33.6px | 29 chars |
| 64px | 30.7px | 32 chars |
| 50px | 24.0px | 41 chars |
| 30px | 14.4px | 68 chars |

---

## 4. Reel Pipeline (Thumbnail + Content Slides)

### File: `app/services/image_generator.py`

**Canvas dimensions:** `1080×1920`

### Thumbnail Generation (`generate_thumbnail`)

- **Light mode:** Loads template from `assets/templates/{brand}/light mode/thumbnail_template.png`
- **Dark mode:** Uses AI background + 55% dark overlay
- Title: **UPPERCASE**, centered, auto-wrapped with **pixel-based measurement** (`wrap_text()` uses `font.getbbox()`)
- Font: `Poppins-Bold` at `TITLE_FONT_SIZE = 80px`, scales down to 40px minimum
- Max width: `1080 - (80 * 2) = 920px`
- Max 2-3 lines for thumbnail
- Supports manual `\n` line breaks

### Content Slide Generation (`generate_reel_image`)

- **Light mode:** Loads template from `assets/templates/{brand}/light mode/content_template.png`
- **Dark mode:** Uses AI background + 85% dark overlay
- Title starts at `y = 280`, with colored background bars (stepped effect)
- Title font: `Poppins-Bold` at `title_font_size` (default 56px), scales down to 20px
- Title max width: `1080 - (90 * 2) = 900px` (`TITLE_SIDE_PADDING = 90`)
- Content max width: `1080 - (108 * 2) = 864px` (`CONTENT_SIDE_PADDING = 108`)
- Content font: `Inter_24pt-Medium.ttf` at 44px (`CONTENT_FONT_SIZE`)
- Title wraps to max 2 lines (auto-wrap stops at ≤2 lines)
- Content lines support `**bold**` markdown
- Sequential numbering forced on all content lines
- Dynamic font scaling if content overflows bottom margin (280px from bottom)
- Background bars: height=100px, gap=0px, horizontal padding=20px

---

## 5. Frontend Rendering (PostCanvas / Konva.js)

### File: `src/shared/components/PostCanvas.tsx`

**Used by:** Posts page, PostJobDetail page, Scheduled page

**Canvas:** 1080×1350 (same as post_compositor.py)

**Components (layer stack):**
1. `BackgroundImageLayer` — full-canvas AI background
2. `GradientOverlay` — bottom 60%, same stops as server
3. `LogoWithLines` — brand abbreviation (HCO, LCO, etc.) with horizontal lines
4. `TitleLayer` — title lines centered, uppercase
5. `ReadCaption` — "Swipe" label at bottom

**Title font:** `Anton` (NOT Poppins-Bold like the server!)

**Default settings:**
```typescript
fontSize: 70,
barWidth: 0,
titlePaddingX: 45,
readCaptionBottom: 45,
titleGap: 80,
logoGap: 36,
```

**`autoFitFontSize()` — identical algorithm to server:**
1. Try 3 lines: 90px → 64px
2. Try 2 lines: 90px → 30px
3. 1 line: largest that fits

**`balanceTitleText()` — identical algorithm to server:**
Same greedy wrap → balance redistribution.

**`countLines()` — identical character estimation:**
```typescript
avgCharWidth = fontSize * 0.48
maxCharsPerLine = Math.floor(maxWidth / avgCharWidth)
```

---

## 6. Title Rendering Deep Dive

### How the system decides line count

The system does NOT decide line count directly from the text. Instead:

1. It iterates font sizes from 90px down
2. At each size, it calculates `max_chars_per_line = floor(max_width / (fontSize * 0.48))`
3. It does a greedy word-wrap against that character limit
4. **Priority: 3 lines at the largest possible font > 2 lines > 1 line**

This means the **same text** can render as:
- 3 lines at 90px (if ~50-66 total chars)
- 2 lines at 70px (if ~30-48 total chars)
- 1 line at 90px (if ≤22 total chars)

### Maximum character count per line

At the post pipeline's max width of **990px**:

| Font Size | Max Chars Per Line |
|-----------|-------------------|
| 90px | 22 |
| 88px | 23 |
| 80px | 25 |
| 70px | 29 |
| 64px | 32 |

### How title text is split across lines

1. **Greedy wrap:** Words are added to current line until adding the next word exceeds `max_chars_per_line`, then a new line starts.
2. **Balancing:** The greedy line count is preserved, but words are redistributed to minimize the difference in character counts between lines.

### AI Title Generation Constraints

**From `content_generator_v2.py` — Post titles:**
- No explicit character limit in the prompt
- Example titles range from ~40 to ~75 characters
- Quality gate only checks: length 10-150 chars, not all-caps, no list format, no em-dashes
- **No constraint matching the renderer's expectations**

**Critical:** The AI has NO guidance about the 22-char-per-line limit at 90px. A title like "Collagen may improve skin elasticity by up to 20% after 8 weeks" (65 chars) will render as 3 lines at 90px (22 chars/line), which is fine. But there's no guarantee the AI won't produce titles that render as 4+ lines (which would force font size down to 30px).

---

## 7. Font Inventory

### Available fonts in `assets/fonts/`:

| File | Usage |
|------|-------|
| `Poppins-Bold.ttf` | Post cover title (server), Reel thumbnail title, Reel content title bars |
| `Poppins-Regular.ttf` | Available but not used in rendering |
| `Poppins-SemiBold.ttf` | Available but not used in rendering |
| `InterVariable.ttf` | Post cover brand abbreviation (28px), Post cover "Swipe" label (24px) |
| `InterVariable-Italic.ttf` | Available but not used |
| `BrowalliaNew-Bold.ttf` | Available but not used in rendering |
| `Inter/static/Inter_24pt-Regular.ttf` | Reel content (when `USE_BOLD_CONTENT=False`) |
| `Inter/static/Inter_24pt-Medium.ttf` | Reel content (when `USE_BOLD_CONTENT=True` — current default) |
| `Inter/static/` | Contains 56 font files: 18pt, 24pt, 28pt variants in all weights |

### Font mismatch: Client vs Server

| Component | Server (Pillow) | Client (Konva) |
|-----------|----------------|----------------|
| Post cover title | **Poppins-Bold** | **Anton** |
| Brand abbreviation | InterVariable | Inter, sans-serif |
| "Swipe" label | InterVariable | Inter, sans-serif |

**⚠️ BUG: The server uses Poppins-Bold for post titles, but the client uses Anton.** These fonts have very different character widths, meaning the char-count estimation (`fontSize * 0.48`) is calibrated for one but not the other. The preview in the browser (Anton) will not match the published image (Poppins-Bold).

---

## 8. Template & Asset Inventory

### Templates (`assets/templates/`)

Each brand folder has a `light mode/` subfolder containing:
- `thumbnail_template.png` — 1080×1920 template for reel thumbnails
- `content_template.png` — 1080×1920 template for reel content slides

**Brands with templates:**
- healthycollege
- holisticcollege
- longevitycollege
- vitalitycollege
- wellbeingcollege

**Note:** No `gymcollege` templates exist. No dark mode templates exist (dark mode uses AI backgrounds).

### Template usage:
- Reel thumbnails (light mode) → `thumbnail_template.png`
- Reel content slides (light mode) → `content_template.png`
- Post covers → NO templates, always AI-generated backgrounds

---

## 9. Brand Color System

### File: `app/core/brand_colors.py`

Six brands, each with light and dark mode colors:

| Brand | Light Thumb Text | Light Title BG | Dark Title BG |
|-------|-----------------|---------------|--------------|
| gymcollege | #000000 (black) | #c8e1f6 (light blue) | #00435c (dark blue) |
| healthycollege | #004f00 (green) | #dcf6c8 (light green) | #004f00 (dark green) |
| vitalitycollege | #028f7a (teal) | #028f7a (teal) | #028f7a (teal) |
| longevitycollege | #019dc8 (cyan) | #c8eaf6 (cyan) | #019dc8 (cyan) |
| holisticcollege | #f19b8a (coral) | #f9e0db (light coral) | #f0836e (coral) |
| wellbeingcollege | #ffcd53 (gold) | #fff4d6 (light yellow) | #ebbe4d (yellow) |

### Brand Abbreviations (used in cover slides):
- healthycollege → HCO
- holisticcollege → HCO
- longevitycollege → LCO
- vitalitycollege → VCO
- wellbeingcollege → WCO

### Frontend Brand Colors (`PostCanvas.tsx`):
- healthycollege → #22c55e
- longevitycollege → #0ea5e9
- vitalitycollege → #14b8a6
- wellbeingcollege → #eab308
- holisticcollege → #f97316

*(These are accent colors for UI, not used in image rendering.)*

---

## 10. Constants Reference

### File: `app/core/constants.py`

| Constant | Value | Used In |
|----------|-------|---------|
| `REEL_WIDTH` | 1080 | Reels |
| `REEL_HEIGHT` | 1920 | Reels |
| `POST_WIDTH` | 1080 | Posts (AI background gen) |
| `POST_HEIGHT` | 1350 | Posts (AI background gen) |
| `TITLE_FONT_SIZE` | 80 | Reel thumbnails |
| `CONTENT_FONT_SIZE` | 44 | Reel content slides |
| `SIDE_MARGIN` | 80 | Reel thumbnail text margin |
| `H_PADDING` | 20 | Reel title bar padding |
| `TITLE_SIDE_PADDING` | 90 | Reel content title margin |
| `CONTENT_SIDE_PADDING` | 108 | Reel content body margin |
| `TITLE_CONTENT_SPACING` | 70 | Gap between title and content (reels) |
| `BOTTOM_MARGIN` | 280 | Reel content bottom clearance |
| `BAR_HEIGHT` | 100 | Reel title bar height |
| `BAR_GAP` | 0 | Gap between reel title bars |
| `VERTICAL_CORRECTION` | -3 | Reel title text y-offset |
| `LINE_SPACING` | 20 | Reel thumbnail line spacing |
| `CONTENT_LINE_SPACING` | 1.5 | Reel content line height multiplier |
| `MAX_TITLE_LENGTH` | 50 | **Defined but NEVER enforced** |
| `MAX_LINE_LENGTH` | 80 | **Defined but NEVER enforced** |
| `MAX_CONTENT_LINES` | 10 | **Defined but NEVER enforced** |

---

## 11. Identified Bugs & Mismatches

### BUG 1: Font Mismatch Between Client Preview and Server Render (CRITICAL)

**Location:** `PostCanvas.tsx` line ~347 vs `post_compositor.py` line ~214

- **Client preview (PostCanvas.tsx):** Uses `Anton` font family for title
- **Server render (post_compositor.py):** Uses `Poppins-Bold.ttf` for title
- **Impact:** The preview users see in the browser does NOT match the final published image. Different fonts have different character widths, so line breaks may differ.
- **Both use the same `fontSize * 0.48` estimation**, but this constant is only accurate for one font, not both.

### BUG 2: Character-Count Estimation vs Actual Pixel Width (MODERATE)

**Location:** `_count_lines()` in `post_compositor.py` and `countLines()` in `PostCanvas.tsx`

Both use `avgCharWidth = fontSize * 0.48` to estimate whether text fits. This is a heuristic that:
- Assumes all characters are the same width (monospace approximation)
- Doesn't account for uppercase text being wider than lowercase
- Doesn't account for narrow letters (I, l) vs wide letters (W, M)
- The estimation is applied to UPPERCASE text, but `0.48` was likely calibrated for mixed case

For Poppins-Bold uppercase at 90px, actual average char width may be closer to 0.55-0.60, meaning the estimator **overestimates** available chars per line, potentially causing text to overflow the rendered width.

### BUG 3: No Title Length Constraint in AI Prompt (MODERATE)

**Location:** `content_generator_v2.py` `generate_post_title()` prompt

- `MAX_TITLE_LENGTH = 50` is defined in constants but **never enforced anywhere**
- The AI prompt does not mention character limits for titles
- The quality gate only rejects titles > 150 chars
- Example titles in the prompt range from 40-75 chars
- Very long titles (100+ chars) could still pass and would render at very small font sizes (down to 30px)

### BUG 4: Post Compositor Renders at Publish Time Only (DESIGN ISSUE)

**Location:** `app/main.py` lines 377-388

- The `compose_cover_slide()` function is called **at publish time**, not at generation time
- During generation, only the raw AI background is saved
- The client-side PostCanvas.tsx renders the preview (with Anton font)
- At publish time, the server composites title onto background (with Poppins-Bold)
- **Users never see the actual published image before it goes live**

### BUG 5: Unused/Unenforced Constants (LOW)

- `MAX_TITLE_LENGTH = 50`, `MAX_LINE_LENGTH = 80`, `MAX_CONTENT_LINES = 10` are defined but never checked anywhere in the codebase
- These could be useful guardrails but are dead code

### BUG 6: Post vs Reel Title Font Size Logic is Completely Different (BY DESIGN, but confusing)

| Aspect | Post (1080×1350) | Reel (1080×1920) |
|--------|-----------------|-----------------|
| Title font | Poppins-Bold (server) / Anton (client) | Poppins-Bold |
| Font size | Auto-fit 90→30px | Fixed 80px (or 56px for content), scales down |
| Line count target | Prefers 3 > 2 > 1 | Max 2 lines (content), max 3 (thumbnail) |
| Width estimation | Character count (`fontSize * 0.48`) | Pixel measurement (`font.getbbox()`) |
| Max text width | 990px (padX=45) | 920px (sideMargin=80) for thumbnail, 900px (sideMargin=90) for content |

### BUG 7: Carousel/Multiple Slides for Posts

**Observation:** The PostCanvas renders only the **cover slide**. The `slide_texts` field exists in the data model and is stored in `brand_outputs`, but:
- `post_compositor.py` only renders **one cover slide**
- The client-side PostCanvas only renders one canvas per brand
- `PostJobDetail.tsx` has carousel navigation UI, but this is for switching between brands, not between slides of the same post
- Slide texts are passed to the scheduler but there's no evidence of multi-slide image generation on the server side

---

## Summary: Complete Title Trace

```
AI (DeepSeek) generates title
    ↓ No character/line constraints in prompt
    ↓ Quality gate: only checks 10-150 chars, no ALL-CAPS
    
Title stored in brand_outputs as plain text
    ↓
CLIENT PREVIEW (PostCanvas.tsx):
    ↓ title.toUpperCase()
    ↓ autoFitFontSize(text, 990px, 70, 3) → tries 90→64 for 3 lines, 90→30 for 2, etc.
    ↓ Estimation: avgCharWidth = fontSize * 0.48, maxChars = floor(990 / avgCharWidth)
    ↓ balanceTitleText() → greedy wrap then balance redistribution
    ↓ Render with Anton font family at calculated fontSize
    
AT PUBLISH TIME (post_compositor.py):
    ↓ title.upper()
    ↓ _auto_fit_font_size(text, 990px) → identical algorithm
    ↓ _balance_title(text, 990, fontSize) → identical algorithm
    ↓ Render with Poppins-Bold.ttf at calculated fontSize
    ↓ compose_cover_slide() → saves PNG
    ↓
PUBLISHED TO INSTAGRAM
```

**The core mismatch:** Preview uses Anton, publish uses Poppins-Bold. The `0.48` character width factor doesn't account for the actual glyph widths of either font, especially in UPPERCASE. This means line breaks in the preview may not match line breaks in the published image.
