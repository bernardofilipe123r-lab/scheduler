# Post Slides & Theme Fix — Comprehensive Analysis

> Created: 2026-02-15 | Updated: 2026-02-15 (re-read all source files)
> Covers: data models, slide generation, detail pages, BrandThemeModal issues

---

## 1. Post Data Structure

### GenerationJob Model (`app/models/jobs.py`)

The `GenerationJob` table has these relevant fields:

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | String(20) | Primary key, e.g., "GEN-001234" |
| `title` | String(500) | The main title |
| `content_lines` | JSON | List of content bullet points |
| `variant` | String(10) | `"light"`, `"dark"`, or effectively `"post"` |
| `brands` | JSON | List of brand IDs |
| `brand_outputs` | JSON | Per-brand output data (see below) |
| `ai_background_path` | String(500) | Shared AI background path |

### BrandOutput Structure (inside `brand_outputs` JSON)

From `src/shared/types/index.ts`:

```typescript
interface BrandOutput {
  status: BrandStatus           // 'pending'|'generating'|'completed'|'failed'|'scheduled'
  reel_id?: string
  thumbnail_path?: string       // URL to the cover/background image
  yt_thumbnail_path?: string
  video_path?: string
  caption?: string
  content_lines?: string[]      // Differentiated content (reels)
  background_data?: string      // base64 data URL for post background
  title?: string                // Per-brand unique title (posts)
  ai_prompt?: string
  slide_texts?: string[]        // Carousel text slide content (posts only)
  error?: string
  progress_message?: string
}
```

**Key finding:** For posts, `slide_texts` contains an array of paragraph strings — one per carousel text slide. The cover slide is rendered client-side using `PostCanvas` (Konva). Text slides are rendered client-side using `CarouselTextSlide`. The `thumbnail_path` points to the AI-generated background image for the cover.

### ScheduledReel Model (`app/models/scheduling.py`)

| Field | Type | Description |
|-------|------|-------------|
| `schedule_id` | String(36) | Primary key |
| `reel_id` | String(36) | Links to job output |
| `caption` | Text | Full caption text |
| `scheduled_time` | DateTime | When to publish |
| `status` | String(20) | scheduled/published/failed |
| `extra_data` | JSON | Serialized as `metadata` in API response |

The `extra_data` JSON contains:
```json
{
  "platforms": ["instagram", "facebook"],
  "brand": "healthycollege",
  "variant": "post" | "carousel" | "light" | "dark",
  "video_path": "...",
  "thumbnail_path": "...",
  "title": "...",
  "slide_texts": ["paragraph 1", "paragraph 2", "..."],
  "post_ids": {},
  "publish_results": {}
}
```

---

## 2. How Slides Are Generated & Stored

### Two Content Types

**Reels** (variant = "light" | "dark"):
- 1 thumbnail image (1080×1920) — server-rendered via `ImageGenerator.generate_thumbnail()`
- 1 content slide (1080×1920) — server-rendered via `ImageGenerator.generate_reel_image()`
- 1 video (MP4, 7-8s) — server-rendered via `VideoGenerator`
- All stored as file paths in `brand_outputs`

**Posts** (variant = "post"):
- 1 AI background image (1080×1350) — server-generated, stored at `thumbnail_path`
- Cover slide is composed **client-side** using `PostCanvas` (Konva canvas) with the background image
- Text slides are composed **client-side** using `CarouselTextSlide` (Konva canvas)
- `slide_texts` array contains the text content for each carousel slide
- During scheduling, the client captures all Konva canvases as base64 PNGs and sends them to the API

### Scheduling Flow for Posts (`/schedule-post-image`)

1. Client renders cover using `PostCanvas` → captures as base64 PNG
2. Client renders each text slide using `CarouselTextSlide` → captures as base64 PNG array
3. Client POSTs to `/reels/schedule-post-image` with:
   - `image_data`: base64 cover image
   - `carousel_images`: base64 array of text slide images
   - `slide_texts`: text content for slides
4. Server saves images to `output/posts/{post_id}.png`, `{post_id}_slide1.png`, etc.
5. Server creates carousel metadata JSON at `{post_id}_carousel.json`
6. Server creates a `ScheduledReel` entry with variant "carousel"

### Server-Side Cover Compositor (`post_compositor.py`)

For Maestro-generated posts, there's also `compose_cover_slide()` which renders a cover server-side:
- Canvas: 1080×1350 (4:5 ratio)
- Layers: AI background → gradient overlay → brand abbreviation bar → title text → "Swipe" text
- Uses Poppins-Bold for title (auto-sized 30-90px), InterVariable for brand abbreviation (28px)
- Gradient: starts at 40% height, reaches 95% black at bottom

---

## 3. PostJobDetail.tsx Structure

**Location:** `src/pages/PostJobDetail.tsx`

### What It Shows
- Header with job ID, status badge, "Post" tag, creation date
- Progress bar when generating
- Action buttons: Download All, Auto Schedule (when all completed)
- **Brand preview grid** — one card per brand, each containing:
  - Brand name + status icons
  - Per-brand title preview
  - **Canvas preview** (either cover or text slide, navigable)
  - Carousel navigation dots (Cover + N slides)
  - Caption preview (expandable)
  - Edit button → opens edit modal
- Layout Settings panel (font size, padding, gaps, bar width, slide font)
- Edit Brand Modal (title, caption, slide texts, logo, AI prompt)
- Full-quality preview modal (larger scale canvas)
- Delete confirmation modal

### How Slides Are Displayed
- **Slide 0 (cover):** Rendered via `<PostCanvas>` component (Konva)
- **Slide 1+ (text slides):** Rendered via `<CarouselTextSlide>` component (Konva)
- Navigation: chevron left/right buttons + dot indicators
- Each brand tracks its own `brandSlideIndex`

### Key Components Used
- `PostCanvas` — renders the cover slide with AI background, gradient, brand abbreviation, title
- `CarouselTextSlide` — renders text slides with numbered paragraphs, brand styling
- Both from `@/shared/components/PostCanvas`

---

## 4. Scheduled Post Detail (Calendar Modal)

**Location:** `src/pages/Scheduled.tsx`, lines ~1055-1290

The "Post Details" modal is rendered inline in `Scheduled.tsx` (not a separate component). When a user clicks a calendar entry, `selectedPost` is set, opening a `<Modal>` with:

### Current Modal Content
1. **Header:** Brand badge + formatted date/time + status badge
2. **Title:** `selectedPost.title` in large text
3. **Preview area:**
   - If variant is "post" AND `thumbnail_path` exists AND font is loaded:
     - Renders `<PostCanvas>` at 280px wide (scale = 280/1080 ≈ 0.259)
     - Fixed size: `width: 280, height: 350`
     - Shows only the cover slide — **NO carousel navigation, NO text slides**
   - Else if thumbnail_path exists: shows `<img>` tag
   - If video_path exists: shows `<video>` with controls
4. **Caption:** expandable text block
5. **Publish results:** platform-by-platform success/failure details
6. **Action buttons:** Reschedule, Publish Now, Retry, View Job, Unschedule

### What's Missing in Calendar Modal
- **No carousel slide navigation** — only shows cover, not text slides
- **No slide_texts display** — the text content of slides is not shown
- **No slide count indicator** — user can't tell how many slides exist
- **PostCanvas hardcoded to DEFAULT_GENERAL_SETTINGS** — ignores user's saved settings

---

## 5. How Slides Are Returned from API

### From Jobs API (`/reels/jobs/{job_id}`)
```json
{
  "brand_outputs": {
    "healthycollege": {
      "status": "completed",
      "thumbnail_path": "/output/posts/post_healthycollege_abc12345.png",
      "title": "Per-Brand Unique Title",
      "caption": "Full caption...",
      "slide_texts": ["Paragraph 1...", "Paragraph 2...", "Paragraph 3..."],
      "ai_prompt": "...",
      "background_data": "data:image/png;base64,..."
    }
  }
}
```

### From Scheduled API (`/reels/scheduled`)
```json
{
  "schedules": [{
    "schedule_id": "...",
    "reel_id": "post_healthycollege_abc12345",
    "scheduled_time": "2026-02-16T12:00:00",
    "status": "scheduled",
    "extra_data": {
      "variant": "carousel",
      "brand": "healthycollege",
      "title": "...",
      "thumbnail_path": "/output/posts/post_healthycollege_abc12345.png",
      "slide_texts": ["Para 1", "Para 2", "Para 3"]
    }
  }]
}
```

The `scheduling-api.ts` maps `extra_data` → `metadata` in the frontend:
```typescript
metadata: s.metadata  // contains slide_texts, title, variant, etc.
```

---

## 6. BrandThemeModal — Current State & Issues

**Location:** `src/features/brands/components/BrandThemeModal.tsx`

### What It Currently Shows
- Mode toggle (light/dark)
- **Left side (60%):** Two preview panels side-by-side
  - Thumbnail preview (9:16 aspect ratio)
  - Content/Reel preview (9:16 aspect ratio)
- **Right side (40%):** Color picker controls
  - Logo upload
  - Brand color
  - Thumbnail text color
  - Content title text color
  - Content title bar background color

### Exact List of Preview Issues

#### Thumbnail Preview Issues
1. **Title text too small** — uses `text-sm` (14px) which is tiny compared to actual 80px (scaled). The title should be proportionally large and dominant.
2. **Title not properly centered vertically** — uses flexbox `justify-center` but doesn't account for the brand name below. Actual thumbnail centers title, then places brand name 254px below.
3. **Brand name position wrong** — positioned at `bottom: 30%` via absolute positioning. Actual position is 254px below the title block, not fixed from bottom.
4. **Brand name font size wrong** — uses `fontSize: '5px'` which is unreadable. Should be proportionally scaled from 28px.
5. **No line wrapping on title** — `SAMPLE_TITLE` renders as continuous text. Actual thumbnail auto-wraps to max 3 lines within 920px.
6. **Missing line spacing** — no `LINE_SPACING` (20px) between title lines.
7. **Font weight/family mismatch** — uses `font-extrabold` (800) but actual uses Poppins-Bold (700).

#### Content/Reel Preview Issues
8. **Title bars don't match actual rendering** — uses fixed `barWidths: ['89%', '42%', '75%']` which are arbitrary. Actual bars use "stepped" widths based on text measurement.
9. **Bar height too small** — hardcoded `height: 18px`. Actual BAR_HEIGHT = 100px (should be proportionally scaled).
10. **Bar gap wrong** — bars have `borderRadius: 3px` and appear separated. Actual BAR_GAP = 0 (bars touch).
11. **Title text inside bars too small** — `fontSize: '5.5px'`. Should be proportionally scaled from 56px.
12. **Title start position wrong** — starts at `paddingTop: '14.6%'` (≈280px of 1920 = 14.6%, actually correct proportionally). But the padding values need verification.
13. **Content text too small** — `fontSize: '5px'`. Should be proportionally scaled from 44px.
14. **Content side margins wrong** — `paddingLeft: '10%'`. Actual is 108/1080 = 10%, which is correct.
15. **No bold formatting support** — content lines show plain text. Actual rendering supports `**bold**` markdown.
16. **Content spacing wrong** — uses `space-y-1` (4px). Actual uses `font_size * 0.6` between bullets + `line_spacing_multiplier * 1.5`.
17. **Title bar background has wrong alpha** — appends `'c8'` (200/255 ≈ 78.4%). Actual `content_title_bg_color` is RGBA from `brand_colors` with full alpha.
18. **Brand name at bottom too small** — `fontSize: '4px'`. Actual is 15px, should be proportionally scaled.
19. **No numbering on content lines** — shows raw text. Actual adds "1. ", "2. ", etc.

#### General Issues
20. **Dark mode background is a CSS gradient** — uses `linear-gradient(135deg, ...)`. Actual dark mode uses AI-generated images. A placeholder gradient is acceptable, but could be more representative.
21. **No preview for post format (1080×1350)** — only shows reel format (9:16). Posts use 4:5 ratio with different layout (gradient overlay, brand abbreviation bar, "Swipe" indicator).
22. **Preview scaling is inconsistent** — uses CSS-based rendering that doesn't match PIL rendering proportions. Could use actual percentage-based scaling from the real dimensions.
23. **`SAMPLE_TITLE` is hardcoded** — not a huge issue, but prevents testing with different title lengths.

---

## 7. Exact Rendering Specs from `image_generator.py`

### Canvas Dimensions

| Type | Width | Height | Ratio |
|------|-------|--------|-------|
| Reel/Thumbnail | 1080px | 1920px | 9:16 |
| Post Cover | 1080px | 1350px | 4:5 |

### Thumbnail Rendering Specs

```
Canvas: 1080×1920, bg #f4f4f4 (light) or AI+55% overlay (dark)

Title:
  - Font: Poppins-Bold, default 80px, min 40px (step -2px)
  - Transform: UPPERCASE
  - Max width: 1080 - (80*2) = 920px
  - Vertical center: (1920 - title_height) / 2
  - Line spacing: 20px
  - Max lines: 3
  - Text color: brand_colors.thumbnail_text_color (light) or same (dark, usually white)

Brand Name:
  - Text: display name (e.g., "THE HEALTHY COLLEGE")
  - Font: Poppins-Bold, 28px
  - Position: centered, title_y + 254px below last title line
  - Color: thumbnail_text_color (light) or (255,255,255) (dark)
```

### Reel Content Slide Rendering Specs

```
Canvas: 1080×1920, bg #f4f4f4 (light) or AI+85% overlay (dark)

Title Bars:
  - Start Y: 280px from top
  - Font: Poppins-Bold, default 56px (steps: 56→46→40→36)
  - Transform: UPPERCASE
  - Max width: 1080 - (90*2) = 900px
  - Bar height: 100px (BAR_HEIGHT)
  - Bar gap: 0px (bars touch)
  - Bar horizontal padding: 20px on each side of text
  - Bar style: centered, stepped widths (narrower bars for shorter text)
  - Bar bg: brand_colors.content_title_bg_color (RGBA)
  - Text color: brand_colors.content_title_text_color
  - Text vertical offset: -3px + 1.5px = -1.5px correction
  - Target: ≤2 lines

Content Lines:
  - Font: Inter Medium 500, default 44px, min 20px (step -1px)
  - Left margin: 108px (CONTENT_SIDE_PADDING)
  - Max width: 1080 - (108*2) = 864px
  - Line height multiplier: 1.5x
  - Bullet spacing: font_size * 0.6 (≈26.4px at 44px)
  - Numbering: all lines get sequential numbers
  - Bold: **text** renders with bold variant
  - Text color: (0,0,0) light, (255,255,255) dark

Title→Content gap: 70px (TITLE_CONTENT_SPACING)
Bottom margin: 280px minimum (BOTTOM_MARGIN)

Brand Name:
  - Font: Poppins-Bold, 15px
  - Position: centered, 12px from bottom edge
  - Color: thumbnail_text_color (light) or white (dark)
```

### Post Cover Slide Rendering Specs (`post_compositor.py`)

```
Canvas: 1080×1350

Background: AI image, resized to 1080×1350

Gradient Overlay (bottom 60%):
  - Starts at y = 540 (40% of 1350)
  - 0-30% of gradient range: alpha 0→127
  - 30-100% of gradient range: alpha 127→242

Layout (positioned bottom-up):
  "Swipe" text:
    - Font: InterVariable, 24px
    - Color: white, alpha 230/255
    - Position: 1350 - 45 - 24 = y≈1281

  Title:
    - Font: Poppins-Bold, auto-sized 30-90px
    - Transform: UPPERCASE
    - Balanced line breaks (2 or 3 lines preferred)
    - White text, centered
    - Position: above "Swipe" with 80px gap

  Brand Abbreviation Bar:
    - Font: InterVariable, 28px
    - Horizontal lines on each side (2px white)
    - Logo gap width: 113px
    - Position: above title with 36px gap
```

---

## 8. Key Constants Reference

```python
# From app/core/constants.py
REEL_WIDTH          = 1080
REEL_HEIGHT         = 1920
POST_WIDTH          = 1080
POST_HEIGHT         = 1350

FONT_BOLD           = "Poppins-Bold.ttf"
FONT_CONTENT_REGULAR = "Inter/static/Inter_24pt-Regular.ttf"
FONT_CONTENT_MEDIUM  = "Inter/static/Inter_24pt-Medium.ttf"
USE_BOLD_CONTENT    = True

TITLE_FONT_SIZE     = 80     # thumbnail title
CONTENT_FONT_SIZE   = 44     # reel content lines
BRAND_FONT_SIZE     = 40     # (unused in rendering)

SIDE_MARGIN         = 80     # thumbnail title max-width margin per side
H_PADDING           = 20     # title bar horizontal padding
TITLE_SIDE_PADDING  = 90     # reel title area left/right margin
CONTENT_SIDE_PADDING = 108   # reel content area left/right margin
TITLE_CONTENT_SPACING = 70   # gap between title bars and content
BOTTOM_MARGIN       = 280    # minimum space from bottom edge
BAR_HEIGHT          = 100    # title background bar height
BAR_GAP             = 0      # gap between title bars (they touch)
VERTICAL_CORRECTION = -3     # text positioning tweak inside bars
LINE_SPACING        = 20     # thumbnail title line spacing
CONTENT_LINE_SPACING = 1.5   # content line height multiplier
```

---

## 9. Changes Needed

### For Scheduled Calendar Post Detail Modal (`Scheduled.tsx`)
1. Add carousel navigation (dots + arrows) when `metadata.slide_texts` exists
2. Render `CarouselTextSlide` for slide indexes > 0
3. Show slide count indicator
4. Load user's saved PostCanvas settings instead of `DEFAULT_GENERAL_SETTINGS`

### For BrandThemeModal Preview Fix
The preview needs to be proportionally accurate to real rendering. Key fixes:

1. **Scale all sizes proportionally** — calculate a scale factor based on preview width vs 1080px, apply to all font sizes, paddings, bar heights
2. **Title bars:** remove border-radius, set BAR_GAP to 0, use stepped widths based on text measurement (or realistic approximation)
3. **Font sizes:** scale proportionally (e.g., if preview is 180px wide, scale = 180/1080 = 0.167, so 56px title → ~9.3px)
4. **Content numbering:** add "1. ", "2. ", etc. prefixes
5. **Bar alpha:** use actual brand_colors alpha values, not hardcoded 'c8'
6. **Brand name positioning:** match actual specs (254px gap for thumbnail, 12px from bottom for content)
7. **Title wrapping:** implement basic word wrapping for multi-line titles

---

## 10. Summary

- **Reels** have server-rendered PNG slides (thumbnail + content) and MP4 video
- **Posts** have server-generated AI background, but cover and text slides are rendered **client-side** via Konva canvases
- Posts store `slide_texts` as string arrays in both `brand_outputs` (jobs) and `extra_data/metadata` (scheduled)
- The calendar detail modal shows only the cover — needs carousel navigation
- BrandThemeModal preview has 23 specific inaccuracies documented above, primarily around proportional scaling and positioning
