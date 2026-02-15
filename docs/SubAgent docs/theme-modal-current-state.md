# BrandThemeModal — Current State Analysis

> Full analysis of the current theme modal component, its preview rendering, API integration, and gaps versus actual backend rendering.

---

## Table of Contents

1. [Component Overview](#1-component-overview)
2. [State Variables](#2-state-variables)
3. [Data Flow & API Integration](#3-data-flow--api-integration)
4. [UI Layout Structure](#4-ui-layout-structure)
5. [Preview Rendering — Current vs Reality](#5-preview-rendering--current-vs-reality)
6. [Color Fields — Current vs Rendering System](#6-color-fields--current-vs-rendering-system)
7. [Light/Dark Mode Toggle](#7-lightdark-mode-toggle)
8. [Parent Integration (MyBrandsTab)](#8-parent-integration-mybrandstab)
9. [Brand Model (DB)](#9-brand-model-db)
10. [Backend Theme Endpoints](#10-backend-theme-endpoints)
11. [Gaps & What Needs to Change](#11-gaps--what-needs-to-change)

---

## 1. Component Overview

**File:** `src/features/brands/components/BrandThemeModal.tsx`

A modal that lets users edit a brand's visual theme and see a live preview. It is rendered inside a `<Modal size="xl">` wrapper from `MyBrandsTab`.

**Props:**
```ts
interface BrandThemeModalProps {
  brand: BrandInfo        // { id, name, color, logo }
  onClose: () => void
  onSave?: () => void     // called on successful save — parent uses it to refresh logo
}
```

**Sub-components:**
- `ColorPicker` — inline helper (color swatch + hex text input)

**External dependencies:**
- `apiClient` for GET (theme fetch)
- Raw `fetch()` with `FormData` for POST (theme save) - bypasses apiClient to send multipart
- `supabase.auth.getSession()` for auth token on save
- `BRAND_THEMES` from constants (hardcoded fallback defaults)

---

## 2. State Variables

| Variable | Type | Initial Value | Purpose |
|----------|------|---------------|---------|
| `mode` | `'light' \| 'dark'` | `'light'` | Current preview mode toggle |
| `loading` | `boolean` | `true` | Shows spinner while fetching theme from API |
| `saving` | `boolean` | `false` | Disables save button during POST |
| `logoFile` | `File \| null` | `null` | New logo file selected by user |
| `logoPreview` | `string \| null` | `null` | URL for logo preview (blob URL or server URL) |
| `brandColor` | `string` | From `BRAND_THEMES[brand.id]` or `brand.color` | The brand's primary/accent color |
| `lightTitleColor` | `string` | `'#000000'` | Title text color in light mode |
| `lightBgColor` | `string` | `'#FFFFFF'` | Background color in light mode |
| `darkTitleColor` | `string` | `'#F7FAFC'` | Title text color in dark mode |
| `darkBgColor` | `string` | `'#000000'` | Background color in dark mode |

**Derived values:**
```ts
const titleColor = mode === 'light' ? lightTitleColor : darkTitleColor
const bgColor    = mode === 'light' ? lightBgColor : darkBgColor
const contentTextColor = mode === 'light' ? '#374151' : '#D1D5DB'
```

---

## 3. Data Flow & API Integration

### Fetch (on mount)
```
GET /api/brands/{brand_id}/theme
→ { has_overrides: bool, theme: { brand_color, light_title_color, light_bg_color, dark_title_color, dark_bg_color, logo } }
```
- If `has_overrides` is true, populates state from `data.theme.*`
- Logo is loaded via `HEAD /brand-logos/{logo_filename}` to verify it exists before displaying
- Falls back to `BRAND_THEMES` hardcoded constants if API fails

### Save
```
POST /api/brands/{brand_id}/theme   (multipart/form-data)
Fields: brand_color, light_title_color, light_bg_color, dark_title_color, dark_bg_color
Optional file: logo
```
- Uses raw `fetch()` with `FormData` (not `apiClient`) because of file upload
- Manually gets Supabase auth token for `Authorization: Bearer` header
- On success: calls `onSave?.()` then `onClose()`

### Backend Processing (POST endpoint in `brands_routes_v2.py`)
The POST endpoint maps these form fields into the DB `colors` JSON:
```python
updated_colors = {
    "primary": brand_color,           # ← from form field "brand_color"
    "light_mode": {
        "text": light_title_color,    # ← from form field "light_title_color"
        "background": light_bg_color  # ← from form field "light_bg_color"
    },
    "dark_mode": {
        "text": dark_title_color,     # ← from form field "dark_title_color"
        "background": dark_bg_color   # ← from form field "dark_bg_color"
    }
}
```

### GET endpoint reverses the mapping:
```python
theme = {
    "brand_color": colors.get("primary", "#000000"),
    "light_title_color": colors.get("light_mode", {}).get("text", "#000000"),
    "light_bg_color": colors.get("light_mode", {}).get("background", "#ffffff"),
    "dark_title_color": colors.get("dark_mode", {}).get("text", "#ffffff"),
    "dark_bg_color": colors.get("dark_mode", {}).get("background", "#000000"),
    "logo": brand.get("logo_path")
}
```

---

## 4. UI Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  flex gap-6                                                  │
│  ┌──────────────────────────┐  ┌──────────────────────────┐  │
│  │  LEFT: Live Preview      │  │  RIGHT: Controls         │  │
│  │  flex-[3]                │  │  flex-[2]                │  │
│  │                          │  │                          │  │
│  │  ┌────────────────────┐  │  │  Logo Upload             │  │
│  │  │ ☀️ Light | 🌙 Dark │  │  │  [drag/drop area]       │  │
│  │  └────────────────────┘  │  │                          │  │
│  │                          │  │  Brand Color             │  │
│  │  Thumbnail Preview       │  │  [■ #004f00]             │  │
│  │  ┌────────────────────┐  │  │                          │  │
│  │  │  16:9 aspect ratio │  │  │  ─── mode colors ───    │  │
│  │  │  bg: bgColor       │  │  │                          │  │
│  │  │  SAMPLE TITLE TEXT │  │  │  Title Color             │  │
│  │  │          logo ↘    │  │  │  [■ #000000]             │  │
│  │  └────────────────────┘  │  │                          │  │
│  │                          │  │  Background              │  │
│  │  Reel Preview            │  │  [■ #FFFFFF]             │  │
│  │  ┌──────────┐            │  │                          │  │
│  │  │  9:16    │            │  └──────────────────────────┘  │
│  │  │ max-240px│            │                                │
│  │  │          │            │                                │
│  │  │ [brand]  │            │                                │
│  │  │ bar      │            │                                │
│  │  │ TITLE    │            │                                │
│  │  │          │            │                                │
│  │  │ 1. line  │            │                                │
│  │  │ 2. line  │            │                                │
│  │  │ 3. line  │            │                                │
│  │  │          │            │                                │
│  │  │ brand ↓  │            │                                │
│  │  └──────────┘            │                                │
│  └──────────────────────────┘                                │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │              [Cancel]  [Save Theme]                      ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Preview Rendering — Current vs Reality

### Current Thumbnail Preview (in Modal)

```tsx
// 16:9 aspect ratio container with bgColor fill
<div style={{ backgroundColor: bgColor, aspectRatio: '16/9' }}>
  <h2 style={{ color: titleColor }}>SAMPLE TITLE TEXT</h2>
  {logoPreview && <img src={logoPreview} />}
</div>
```

**What's wrong:**
| Aspect | Modal Preview | Actual Rendering |
|--------|--------------|-----------------|
| Aspect ratio | **16:9** | **9:16** (1080×1920) — thumbnails are vertical! |
| Background (light) | `bgColor` (user-picked, e.g. `#dcf6c8`) | **Always `#f4f4f4` flat grey** |
| Background (dark) | `bgColor` (user-picked, e.g. `#004f00`) | **AI-generated image + 55% black overlay** |
| Title color (light) | `lightTitleColor` = user-picked | `thumbnail_text_color` (brand-specific, e.g. green for healthy) |
| Title color (dark) | `darkTitleColor` = user-picked | Always `#ffffff` white |
| Logo | Shows in preview | **Logo is NOT rendered on thumbnails** — only text brand name appears |
| Brand name | Not shown | **"THE HEALTHY COLLEGE" in Poppins-Bold 28px, centered, 254px below title** |
| Font | Browser default (CSS `font-black`) | Poppins-Bold 80px (auto-scales to 40px min) |
| Title position | Centered in 16:9 box | Centered vertically in **9:16** canvas |

### Current Reel Preview (in Modal)

```tsx
// 9:16 aspect ratio, max-w-240px
<div style={{ backgroundColor: bgColor, aspectRatio: '9/16' }}>
  {/* Title bar */}
  <div style={{ backgroundColor: brandColor }}>
    <p style={{ color: titleColor }}>SAMPLE TITLE</p>
  </div>
  {/* Content lines */}
  <div>
    1. First content line here
    2. Second content line
    3. Third content line
  </div>
  {/* Brand name */}
  <p>{brand.name}</p>
</div>
```

**What's wrong:**
| Aspect | Modal Preview | Actual Rendering |
|--------|--------------|-----------------|
| Background (light) | `bgColor` (user-picked) | **Always `#f4f4f4` flat grey** |
| Background (dark) | `bgColor` (user-picked) | **AI image + 85% black overlay** |
| Title bar style | Single rounded div with `brandColor` bg | **Stepped-width bars** — narrower bars for shorter lines, touching each other, 100px tall each |
| Title bar bg color | `brandColor` (= `colors.primary`) | `content_title_bg_color` — a **separate** color (often a light/pastel version in light mode) |
| Title text color | `titleColor` (= `lightTitleColor` / `darkTitleColor`) | `content_title_text_color` — can differ from thumbnail text color |
| Content text color | `#374151` (light) / `#D1D5DB` (dark) — grey tones | `#000000` black (light) / `#ffffff` white (dark) — pure B&W |
| Title font | CSS text-xs (~12px) | Poppins-Bold 56px (stepped: 56→46→40→36) |
| Content font | CSS text-xs (~12px) | Inter Medium 44px (auto-scales to 20px) |
| Title position | Near top, rounded card | 280px from top, full-width bars |
| Content position | Below title, centered | Left-aligned at 108px margin |
| Brand name position | Absolute bottom center | 12px from bottom |
| Brand name font | text-[10px] | Poppins-Bold 15px |

---

## 6. Color Fields — Current vs Rendering System

### What the modal edits (5 fields):

| Modal Field | Stored As | Description |
|------------|-----------|-------------|
| `brandColor` | `colors.primary` | The brand's main color |
| `lightTitleColor` | `colors.light_mode.text` | Text color in light mode |
| `lightBgColor` | `colors.light_mode.background` | Background in light mode |
| `darkTitleColor` | `colors.dark_mode.text` | Text color in dark mode |
| `darkBgColor` | `colors.dark_mode.background` | Background in dark mode |

### What the actual renderer uses (3 per mode from `BrandModeColors`):

| Render Field | Used For | Modal Equivalent | Match? |
|-------------|----------|-----------------|--------|
| `thumbnail_text_color` | Thumbnail title text + brand name | `lightTitleColor` / `darkTitleColor` | ⚠️ Partially — modal calls this "Title Color" but it's actually the thumbnail-specific text color |
| `content_title_text_color` | Reel title bar text | **Not separately editable** — modal uses same `titleColor` | ❌ Missing — this is a separate field in rendering |
| `content_title_bg_color` | Reel title bar background | **Not editable** — modal uses `brandColor` for bar bg | ❌ Missing — this is the most visible mismatch |

### Critical mismatch: The rendering has 3 distinct color fields per mode, but the modal only exposes 2 per mode (title + background). The title bar background color (`content_title_bg_color`) is completely missing from the modal.

### What's hardcoded in rendering and NOT editable:
- **Light mode background:** Always `#f4f4f4` — the modal's `lightBgColor` field is misleading
- **Dark mode background:** Always AI-generated — the modal's `darkBgColor` field is misleading
- **Content text color:** Always black (light) / white (dark) — not editable
- **Dark mode overlay opacity:** 55% for thumbnails, 85% for reels — not editable

---

## 7. Light/Dark Mode Toggle

The toggle is a segmented button at the top of the left (preview) column:

```tsx
<div className="flex gap-1 bg-gray-100 rounded-lg p-1">
  <button onClick={() => setMode('light')}>☀️ Light Mode</button>
  <button onClick={() => setMode('dark')}>🌙 Dark Mode</button>
</div>
```

**Behavior:**
- Switching mode changes which color values are displayed in the right panel
- The `setTitleColor` and `setBgColorForMode` helper functions route to the correct state setter based on `mode`
- Both previews (thumbnail + reel) update instantly
- `brandColor` is **mode-independent** — same value regardless of light/dark toggle

**Under the controls section:**
- The section header dynamically shows "☀️ Light Mode Colors" or "🌙 Dark Mode Colors"
- Only 2 pickers show: "Title Color" and "Background"
- These map to `lightTitleColor`/`darkTitleColor` and `lightBgColor`/`darkBgColor` respectively

---

## 8. Parent Integration (MyBrandsTab)

**File:** `src/features/brands/components/MyBrandsTab.tsx`

The modal is triggered from `BrandCard` → "Theme" button:
```tsx
<Modal isOpen={!!selectedBrandForTheme} onClose={...} title={`${brand.name} Theme`} size="xl">
  <BrandThemeModal
    brand={selectedBrandForTheme}
    onClose={() => setSelectedBrandForTheme(null)}
    onSave={() => refreshBrandLogo(selectedBrandForTheme.id)}
  />
</Modal>
```

The `onSave` callback triggers `refreshBrandLogo()` which re-fetches the theme endpoint and updates the logo URL in `MyBrandsTab`'s local state.

`BrandInfo` passed to the modal comes from v2 API brands mapped as:
```ts
{ id: b.id, name: b.display_name, color: b.colors?.primary || '#666666', logo: b.logo_path || '' }
```

---

## 9. Brand Model (DB)

**File:** `app/models/brands.py`

Key theme-related fields in the `brands` table:

| Column | Type | Description |
|--------|------|-------------|
| `colors` | JSON | Full color config object |
| `logo_path` | String(255) | Logo filename relative to `output/brand-data/logos/` |
| `display_name` | String(100) | e.g. "THE HEALTHY COLLEGE" |
| `short_name` | String(10) | e.g. "HCO" — used for post cover abbreviation |

### Colors JSON structure in DB:
```json
{
  "primary": "#004f00",
  "accent": "#16a34a",
  "color_name": "vibrant green",
  "text": "#FFFFFF",
  "light_mode": {
    "background": "#dffbcb",
    "text": "#004f00",
    "gradient_start": "...",
    "gradient_end": "..."
  },
  "dark_mode": {
    "background": "#001f00",
    "text": "#FFFFFF",
    "gradient_start": "...",
    "gradient_end": "..."
  }
}
```

**Note:** The actual rendering system (`brand_colors.py`) does NOT read from the DB — it uses hardcoded `BRAND_COLORS` dict. So changes in the modal's theme editor **only update the DB** but **don't affect actual rendering**. The rendering pipeline reads from `app/core/brand_colors.py` hardcoded values.

---

## 10. Backend Theme Endpoints

Both exist in `app/api/brands_routes_v2.py` AND duplicated in `app/api/brands/routes.py` (same code):

### GET `/api/brands/{brand_id}/theme` (also `/api/v2/brands/{brand_id}/theme`)
- Reads `colors` JSON from brand DB record
- Maps `colors.primary` → `brand_color`, `colors.light_mode.text` → `light_title_color`, etc.
- Returns `{ brand_id, theme: {...}, has_overrides: true }`
- Always returns `has_overrides: true` since data comes from DB

### POST `/api/brands/{brand_id}/theme` (also `/api/v2/brands/{brand_id}/theme`)
- Accepts `multipart/form-data` with 5 color fields + optional logo file
- Maps back to `colors` JSON structure and merges with existing colors (preserves `accent`, `color_name`, etc.)
- Saves logo to `output/brand-data/logos/{brand_id}_logo.{ext}` on disk
- Updates `logo_path` in DB

---

## 11. Gaps & What Needs to Change

### Critical Issues

1. **Thumbnail preview is 16:9 but actual thumbnails are 9:16**
   - The modal shows a landscape preview, but rendered thumbnails are portrait (1080×1920)
   - Fix: Change aspect ratio to 9:16

2. **Background color fields are misleading**
   - `lightBgColor` / `darkBgColor` are editable in the modal but the actual renderer uses:
     - Light: hardcoded `#f4f4f4` grey
     - Dark: AI-generated image
   - The "Background" color picker in the modal has NO effect on actual rendering
   - Fix: Either remove the background pickers or repurpose them for the title bar background color

3. **Missing title bar background color (`content_title_bg_color`)**
   - The most distinctive visual element of reels — the colored title bars — has no editor
   - The modal currently uses `brandColor` for the title bar, but the actual rendering uses a **separate** RGBA color that is often a pastel/light version (e.g., `#dcf6c8` light green vs `#004f00` brand color)
   - Fix: Add a "Title Bar Color" picker per mode

4. **Title text vs thumbnail text conflation**
   - The renderer has separate `thumbnail_text_color` and `content_title_text_color` fields
   - The modal has only one "Title Color" per mode
   - For most brands these differ (e.g., healthycollege light: thumbnail text is `#004f00` green, but reel title text is `#000000` black)
   - Fix: Either split into two fields or document which one the user is editing

5. **Logo shown in preview but NOT rendered on actual output**
   - The logo file IS uploaded and stored, but the rendering pipeline (`image_generator.py`) only renders the text-based brand display name — never the logo image
   - The modal gives a false impression that the logo will appear on thumbnails/reels
   - Fix: Either implement logo rendering in the backend, or remove logo from preview

6. **Rendering reads from hardcoded `brand_colors.py`, not from DB**
   - The theme modal saves to DB but the rendering engine reads from `BRAND_COLORS` dict in `app/core/brand_colors.py`
   - Changes in the modal don't affect actual asset generation
   - Fix: Make the renderer read from DB, or sync the DB values into `brand_colors.py`

7. **Content text color not editable**
   - Content bullet text is hardcoded: black in light, white in dark
   - The modal shows content with grey tones (`#374151` / `#D1D5DB`) which is also wrong
   - Fix: Either add content text color picker or fix preview to show correct B&W

8. **Modal hardcoded fallback colors in `BRAND_THEMES` constants are partially wrong**
   - `BRAND_THEMES` in `constants.ts` stores `lightBgColor`/`darkBgColor` as the title bar background colors (e.g., `#dcf6c8`), but the modal treats them as the overall background
   - The naming is confusing and the mapping between frontend constants, DB fields, and rendering colors is inconsistent

### Minor Issues

9. **Reel preview doesn't show stepped title bars** — shows a single rounded card instead of the actual multi-bar layout
10. **Font mismatch** — CSS uses system fonts, actual rendering uses Poppins-Bold and Inter Medium
11. **Brand name not shown in thumbnail preview** — rendering always shows brand display name below title
12. **Dark mode preview has no overlay simulation** — shows flat dark color instead of representing AI image + overlay
