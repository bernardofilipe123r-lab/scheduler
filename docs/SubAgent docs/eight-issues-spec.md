# Eight Issues Research Spec

## Issue 1: Profile Input Pencil Icon Overlapping Text

### Findings

**File:** [src/pages/Profile.tsx](src/pages/Profile.tsx)

The Profile page has **3 input fields with left-positioned icons**:

1. **Display Name** (line ~112-119): Uses `<Pencil>` icon with `absolute left-3 top-1/2 -translate-y-1/2`. Input has `pl-11 pr-4 py-3` — the `pl-11` (2.75rem = 44px) provides left padding. The icon is `w-5 h-5` (20px) positioned at `left-3` (12px). So the icon occupies 12px–32px, and text starts at 44px. **This should be fine** but if the icon appears to overlap, it's because `pl-11` may not be enough for `w-5 h-5` + visual breathing room — the gap between icon end (32px) and text start (44px) is only 12px, which can look tight.

2. **Email Address (read-only)** (line ~131-138): Uses `<Mail>` icon, same pattern: `absolute left-3`, input has `pl-11`. Same potential issue.

3. **New Email Address** (line ~158-165): Uses `<Mail>` icon, identical pattern.

### Root Cause
The `pl-11` padding is 44px while the icon occupies up to 32px from the left edge. The 12px gap between icon and text is tight but technically non-overlapping. If the user sees overlap, it might be that:
- The actual rendered icon width + padding isn't accounting for optical alignment
- The input text cursor starts right where the icon ends

### Fix Direction
Increase left padding from `pl-11` to `pl-12` or even `pl-14` on all three inputs. Or move the icon to `left-4` instead of `left-3`.

---

## Issue 2: Post Title Font Size Auto-Fit Logic

### Findings

There are **two separate font-sizing systems**: one for the backend (Python/PIL) and one for the frontend (Konva/Canvas).

#### Frontend: [src/shared/components/PostCanvas.tsx](src/shared/components/PostCanvas.tsx) (lines 263-294)

```
AUTO_FIT_MAX = 90
AUTO_FIT_MIN = 30
THREE_LINE_FLOOR = 64
```

Current algorithm (`autoFitFontSize`):
1. Try 3 lines: iterate font size 90→64 (step -2). If `countLines()` returns exactly 3, use that font size.
2. If 3 lines never worked, try 2 lines: 90→30.
3. If 2 lines never worked, try 1 line: 90→30.

The `countLines` function (lines 233-260) measures text width using `ctx.measureText()` with the Anton font and counts how many lines it wraps to at a given width.

**Used at:** PostCanvas receives `autoFitMaxLines` prop (default 3). When `autoFitMaxLines > 0`, it calls `autoFitFontSize()`. If the user has manually set a per-brand font size, `autoFitMaxLines` is set to `0` (disabled).

#### Backend: [app/services/media/image_generator.py](app/services/media/image_generator.py) (lines ~260-310)

Constants from [app/core/constants.py](app/core/constants.py):
```
TITLE_FONT_SIZE = 80
```

Backend algorithm:
- If title has `\n` (manual breaks): starts at 80px, scales down to min 40px until all lines fit within `max_title_width`.
- If no manual breaks: starts at 80px, wraps text, scales down to min 40px until result is ≤3 lines with all lines fitting.

#### User's Desired Algorithm
Priority: try **3 lines first**, then **4 lines**, then **2 lines**. Always maximize font size while staying close to borders. Minimum font size: **80** (rare exceptions allowed).

#### Gap Analysis
- Current frontend: tries 3→2→1 lines. Missing: **4 lines** option. Min is 30, user wants 80.
- Current backend: tries to fit in ≤3 lines. No 4-line option. Min is 40, user wants 80.
- Current flow is 3→2→1. User wants **3→4→2**.

---

## Issue 3: Scheduling Success Messages

### Findings

**File:** [src/pages/PostJobDetail.tsx](src/pages/PostJobDetail.tsx)

There are **two places** where scheduling success messages appear:

#### 1. Toast message in `handleAutoSchedule` (lines ~303-308)
```typescript
const msg =
  failed > 0
    ? `${names} scheduled! ${failed} failed.`
    : scheduledBrands.length === 1
      ? `${scheduledBrands[0]} was scheduled successfully!`
      : `All ${scheduled} brands scheduled: ${names}`
```
- Single brand: `"Healthy College was scheduled successfully!"` — **close but not matching** desired: `"Post was scheduled successfully"`
- Multiple brands: `"All 5 brands scheduled: HC, HO, LC, VC, WB"` — **not matching** desired: `"Posts were scheduled successfully for all brands"`

#### 2. Static banner when `allScheduled` is true (lines ~345-356)
```typescript
{job.brands.length === 1
  ? `${getBrandConfig(job.brands[0]).name} was scheduled successfully`
  : `All ${job.brands.length} brands scheduled: ${job.brands.map(b => getBrandConfig(b).name).join(', ')}`}
```
- Single brand: `"Healthy College was scheduled successfully"` — **not matching** desired
- Multiple brands: `"All 5 brands scheduled: HC, HO, LC, VC, WB"` — **not matching** desired

### Desired Messages
- **Single brand:** `"Post was scheduled successfully"`
- **Multiple brands:** `"Posts were scheduled successfully for all brands"`
- Apply to both toast and static banner.

---

## Issue 4: Auto-Schedule Slide Flicker (STILL EXISTS)

### Findings

**File:** [src/pages/PostJobDetail.tsx](src/pages/PostJobDetail.tsx)

The `handleAutoSchedule` function (lines ~218-320) calls `setBrandSlideIndex` **multiple times per brand**, causing visible UI slide changes during capture:

#### All `setBrandSlideIndex` calls within `handleAutoSchedule`:

1. **Line ~244:** `setBrandSlideIndex((prev) => ({ ...prev, [brand]: 0 }))` — force to cover slide before capture
2. **Line ~250:** `setBrandSlideIndex((prev) => ({ ...prev, [brand]: 0 }))` — retry: force to cover slide again
3. **Line ~265:** `setBrandSlideIndex((prev) => ({ ...prev, [brand]: s + 1 }))` — switch to each text slide for capture (inside a loop)
4. **Line ~279:** `setBrandSlideIndex((prev) => ({ ...prev, [brand]: 0 }))` — reset back to cover after capturing text slides
5. **Line ~315:** `setBrandSlideIndex({})` — final reset after all brands complete

**The problem:** Each of these calls triggers a React re-render, which visually flips the slides in the UI. The `await new Promise((r) => setTimeout(r, 300-500))` delays make it even more visible — the user sees slides flickering through cover→slide1→slide2→...→cover for each brand.

### User Request
> "Can you just not force to go to the cover image?" — meaning don't change `brandSlideIndex` during capture. The capture needs to happen **off-screen** or the slide switching needs to be invisible.

### Fix Direction Options
1. **Capture off-screen**: Create a hidden Konva stage for captures instead of using the visible one.
2. **Batch capture with CSS hide**: Temporarily hide the grid or overlay it during capture.
3. **Use `display: none` wrapper** during auto-schedule and render slides to off-screen canvases.

---

## Issue 5: Brand Prompts on /brands Page

### Findings

#### Frontend: [src/pages/Brands.tsx](src/pages/Brands.tsx)
The Brands page has 3 tabs: `brands`, `connections`, `settings`. The `settings` tab renders `<SettingsTab />`.

#### Settings Tab: [src/features/brands/components/SettingsTab.tsx](src/features/brands/components/SettingsTab.tsx)
Currently shows:
- Per-brand connection credentials (Facebook, Instagram, Meta tokens)
- Global settings filtered to: `youtube_*`, `default_caption_count`, `default_content_lines`, `default_posts_per_day`, `scheduling_timezone`
- **No prompts/content description fields exist** in the current UI.

#### Brand Model: [app/models/brands.py](app/models/brands.py)
The `Brand` model has these content-related fields:
- `baseline_for_content` — boolean flag
- **No prompt fields** exist (no reels_prompt, no posts_prompt, no content_description).

#### AppSettings Model: [app/models/config.py](app/models/config.py)
The `AppSettings` model stores key-value pairs with categories. This **could** hold global prompts as new settings entries.

### What the User Wants
3 **shared/global** settings (NOT per-brand):
1. **Reels prompt** — idea/topic guidance for reel content generation (not format)
2. **Posts/carousel prompt** — idea/topic guidance for post content generation (not format)
3. **Brand content description** — describes what the brand is about (avatar, topic, etc.)

### Gap Analysis
- No DB fields exist for these prompts.
- The `AppSettings` model is the ideal place — just add 3 new keys with category `content`.
- The SettingsTab UI on the Brands page needs to be extended to show these 3 new textarea fields.
- Backend content generation services would need to read these from AppSettings and inject into AI prompts.

---

## Issue 6: Railway Volume Cleanup

### Findings

#### Dockerfile: [Dockerfile](Dockerfile)
- **No volume mounts** or `VOLUME` directives exist.
- **No references** to output directories in Dockerfile.
- Only copies code and builds; no persistent storage configuration.

#### railway.json: [railway.json](railway.json)
- Contains only `build` and `deploy` sections.
- **No volume configuration** — no `volumes`, `mounts`, or storage-related settings.
- Deploy section only has restart policy.

#### railway.toml
- **Does not exist** in the codebase.

### Conclusion
The codebase itself has **zero references to Railway volumes**. The 78% usage issue is **entirely on Railway's dashboard side** — the volume was likely created manually via Railway's UI or CLI and hasn't been deleted from there. The codebase is clean and doesn't depend on or reference any volume. The user needs to **manually delete the volume from Railway's dashboard** (Settings → Volumes → Delete).

---

## Issue 7: Calendar Filter Compact Box

### Findings

**File:** [src/pages/Scheduled.tsx](src/pages/Scheduled.tsx)

Currently there are **3 separate filter sections**, each in its own `bg-gray-50 rounded-lg p-3 mb-4` block:

#### 1. Slot Tracker (lines ~396-434)
- Row with `Filter` icon + "Slot Tracker:" label + brand buttons + clear button
- When active, shows a legend below with color meanings
- Wrapped in `<div className="mb-4 p-3 bg-gray-50 rounded-lg">`

#### 2. Content Type Filter (lines ~436-476)
- Row with `Filter` icon + "Content:" label + All/Reels/Posts toggle buttons
- Wrapped in `<div className="mb-4 p-3 bg-gray-50 rounded-lg">`

#### 3. Platform Filter (lines ~478-546)
- Row with `Filter` icon + "Platform:" label + All/Instagram/Facebook/YouTube toggle buttons
- Wrapped in `<div className="mb-4 p-3 bg-gray-50 rounded-lg">`

### Current Layout Issues
- 3 stacked full-width boxes take up significant vertical space
- Each has the same `Filter` icon + label pattern, creating visual redundancy
- They push the calendar content down considerably

### User Request
Merge all 3 filters into **one compact floating box** with a dropdown/popover. Ideas:
- Single "Filters" button that opens a popover/dropdown with all 3 filter groups
- Active filter badges shown inline when popover is closed
- Reduce vertical footprint dramatically

---

## Issue 8: Posts Page Title/Prompt Layout

### Findings

**File:** [src/pages/Posts.tsx](src/pages/Posts.tsx)

The current layout for Title and AI Image Prompt is at lines ~206-247:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {/* Title */}
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    ...
    <textarea rows={3} ... />
  </div>

  {/* AI Image Prompt */}
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    ...
    <textarea rows={3} ... />
  </div>
</div>
```

**Current layout:** `grid grid-cols-1 md:grid-cols-2` — side-by-side on medium+ screens (desktop), stacked on mobile.

### User Request
Simple **stacked layout**: Title on one full-width row, AI Image Prompt on the next row underneath. No side-by-side.

### Fix Direction
Change `grid grid-cols-1 md:grid-cols-2 gap-4` to `grid grid-cols-1 gap-4` (or just `space-y-4`).
