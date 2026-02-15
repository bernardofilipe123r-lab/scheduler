# Eight Issues Research & Root Cause Analysis

## Issue 1 & 4: Post Calendar Preview Uses Replica Instead of Actual Saved Image

### Findings

**How post images are saved (backend):**
- `schedule_routes.py` → `schedule_post_image()` endpoint:
  - Cover image: decoded from base64, saved to `output/posts/{post_id}.png`
  - Carousel slides: saved to `output/posts/{post_id}_slide1.png`, `_slide2.png`, etc.
  - Carousel metadata JSON: saved to `output/posts/{post_id}_carousel.json` with paths
  - **Only the cover image path** is stored in the ScheduledReel metadata as `thumbnail_path`
  - Carousel slide paths are **NOT stored** in the schedule metadata — only in the separate JSON file

**How the calendar renders the preview (frontend):**
- `Scheduled.tsx` Post Detail Modal (line ~680-750):
  - **Slide 0 (cover):** Uses `<PostCanvas>` component to **recreate** the image with CSS/canvas, NOT the saved PNG! Falls back to `<img src={thumbnail_path}>` only if font hasn't loaded yet.
  - **Slides 1+ (text slides):** Rendered as CSS divs with hardcoded styles (brand header bar, body text, share/save bar). These are **replicas**, not the actual saved slide PNGs.

**What's stored in DB (ScheduledReel model):**
- `extra_data` JSON column contains metadata including `thumbnail_path` (cover image filesystem path)
- The `/scheduled` GET endpoint converts filesystem paths to URL paths (`/output/posts/...`)
- `slide_texts` array is stored for text content, but no `carousel_image_paths`

### Root Cause
1. Cover image IS saved and accessible via `thumbnail_path` URL, but the modal uses `PostCanvas` to recreate it instead of displaying the saved image
2. Carousel slide images ARE saved to disk but their paths are only in a separate JSON file, not in the schedule's metadata. The frontend has no way to fetch them.
3. The CSS replica for text slides doesn't match the actual rendered output from `image_generator.py`

### Fix Required
1. For cover slide: use `<img src={selectedPost.thumbnail_path}>` directly instead of `PostCanvas`
2. For carousel slides: either (a) store `carousel_image_paths` in schedule metadata so frontend can load them as `<img>` tags, or (b) add an API endpoint to serve carousel slide images by post_id
3. Remove CSS replica code entirely

---

## Issue 2: Maestro Resume Button Loading State

### Findings

**Current implementation in `AITeam.tsx` → `OverviewTab` (line ~540-580):**
- `pauseLoading` state bool exists
- `handlePauseResume()`: sets `setPauseLoading(true)`, calls API, sets `setPauseLoading(false)`
- Button renders spinner via `{pauseLoading && <Loader2 className="w-4 h-4 animate-spin" />}`
- Button is disabled with `disabled={pauseLoading}`

### Root Cause
The loading state **IS implemented correctly**. The button:
- Shows a spinner icon while the API call is in flight
- Is disabled to prevent double-clicks
- Calls `onRefresh()` after success to re-fetch Maestro status

**Potential UX issue:** After the API call completes, `onRefresh()` calls `fetchMaestroStatus()` which is async. There's a brief moment where the button returns to its old state before the status refetch completes, so it could briefly show "Resume" then flip to "Pause" (or vice versa). This could be perceived as broken.

### Fix Required
- Optimistically update `maestroStatus` locally after successful API call (before the refetch completes)
- Or: keep `pauseLoading = true` until `onRefresh()` fully resolves

---

## Issue 3: Delete All Posts/Reels/Content Buttons Per Day

### Findings

**Current implementation in `Scheduled.tsx` Day Modal (line ~825-850):**
- Single "Delete All Posts" button
- Calls `deleteScheduledForDay.mutateAsync(dayStr)` which hits:
  - `DELETE /reels/scheduled/bulk/day/{date}`

**Backend `schedule_routes.py` → `delete_scheduled_for_day()`:**
- Deletes ALL `ScheduledReel` entries where `scheduled_time` falls within that day
- **No filtering** by variant/type — deletes reels AND posts indiscriminately

### Root Cause
- Only one delete button exists; it deletes everything for that day
- Backend endpoint has no `content_type` or `variant` filter parameter
- User wants three separate buttons: "Delete All Posts", "Delete All Reels", "Delete All Content"

### Fix Required
1. **Backend**: Add optional `variant` query parameter to the bulk day delete endpoint (or create separate endpoints)
   - `variant=post` → delete only posts
   - `variant=reel` (or `light,dark`) → delete only reels  
   - No filter → delete all
2. **Frontend**: Add three buttons in Day Modal: "Delete Reels" (variant != post), "Delete Posts" (variant == post), "Delete All"

---

## Issue 5: Brand Theme Modal Bar Spacing vs Actual Rendering

### Exact Pixel Values from `image_generator.py`

From `constants.py`:
| Constant | Value | Description |
|---|---|---|
| `BAR_HEIGHT` | **100px** | Height of each title bar |
| `BAR_GAP` | **0px** | Gap between title bars (touching) |
| `H_PADDING` | **20px** | Horizontal padding inside bars |
| `VERTICAL_CORRECTION` | **-3px** | Text Y offset correction |
| `TITLE_SIDE_PADDING` | **90px** | Max title area width margin |
| `CONTENT_SIDE_PADDING` | **108px** | Content area margin |
| `TITLE_CONTENT_SPACING` | **70px** | Gap between title bars and content |

From `image_generator.py` → `generate_reel_image()`:
| Property | Value | Code |
|---|---|---|
| Title start Y | **280px** | `title_start_y = 280` |
| Bar Y position | `y` starts at 280, increments by `BAR_HEIGHT + BAR_GAP` (100) | Sequential stacking |
| Bar width | `max_text_width + H_PADDING * 2` with stepped inset | `center_x ± max_bar_width/2 ∓ inset` |
| Bar corners | **Sharp** (no border radius) | `draw.rectangle()` — no rounded corners |
| Text X | `center_x - text_w / 2` | Centered within bar |
| Text Y | `bar_top + (BAR_HEIGHT - glyph_height)/2 - glyph_top + VERTICAL_CORRECTION + 1.5` | Vertically centered with corrections |

### BrandThemeModal.tsx Preview Values

```typescript
const PX = {
  barStartY: Math.round(280 * S),    // 62px preview (correct: 280 canvas)
  barHeight: Math.round(100 * S),     // 22px preview (correct: 100 canvas)  
  barRadius: Math.round(20 * S),      // 4px preview (WRONG: 20px canvas, but actual is 0!)
  barTitleFont: Math.round(56 * S),   // 12px preview (correct: 56 canvas default)
  titleContentGap: Math.round(70 * S) // 16px preview (correct: 70 canvas)
}
```

### Root Cause — Mismatches

1. **Border radius: BrandThemeModal uses `barRadius = 20px` (canvas) → 4px preview. But `image_generator.py` uses `draw.rectangle()` which has NO border radius (sharp corners).** This is incorrect.

2. **Bar width calculation differs:**
   - **Backend**: pixel-exact based on actual font glyph measurements: `max_text_width + H_PADDING * 2`, with `inset = (max_text_width - text_w) / 2` per line for stepped effect
   - **Frontend**: percentage-based on character count ratio: `Math.max(25, Math.round((l.length / maxLen) * 85))%` — this is an approximation

3. **Bar gap is correct**: Both use 0px gap (bars touch)

4. **Bars don't have margins between them in either implementation** — they stack directly

### Fix Required
1. Remove `barRadius` from the preview (set to 0 — sharp corners like the backend)
2. Bar width calculation could be improved but percentage-based is acceptable for a preview

---

## Issue 6: Page-Specific Loading Animations

### Findings

**Current loading components:**
- `src/shared/components/LoadingSpinner.tsx`: 
  - `LoadingSpinner` — simple centered `Loader2` icon with optional text
  - `FullPageLoader` — wrapper for min-height 60vh centered spinner
  - `CardLoader` — skeleton card placeholder

**Route definitions (`src/app/routes/index.tsx`):**
- No `<Suspense>` boundaries wrapping any routes
- `AuthGuard` shows a basic `<Loader2>` spinner while auth loads
- Each page independently handles loading (e.g., `Scheduled.tsx` uses `FullPageLoader`)

**Current state:**
- All pages show the same generic spinner while loading
- No lazy loading (`React.lazy`) on any route
- No route-level Suspense
- No page-specific themed loading (e.g., calendar skeleton for Scheduled, card grid skeleton for AI Team)

### Root Cause
Only one generic spinner exists (`FullPageLoader`). No page-specific skeleton loaders or animated transitions.

### Fix Required
1. Create page-specific skeleton/loading components (calendar skeleton, card grid skeleton, etc.)
2. Optionally add `React.lazy` + `<Suspense>` for code splitting at route level
3. Each page can use its own themed loader that matches the page's layout shape

---

## Issue 7: Quota Display — deAPI Balance "Unavailable"

### Findings

**Backend flow:**
1. `ai_team/routes.py` → `get_api_quotas()`:
   - Calls `await qm.fetch_deapi_balance()` 
   - If no error: merges balance data into `deapi_data`
   - If error: sets `deapi_data['error'] = error_msg`
   - On exception: **silently passes** (balance never set)

2. `api_quota_manager.py` → `fetch_deapi_balance()`:
   - Reads `DEAPI_API_KEY` from env
   - If missing: returns `{'error': 'No DEAPI_API_KEY configured'}`
   - Calls: `GET https://api.deapi.ai/api/v1/client/balance`
   - Header: `Authorization: Bearer {api_key}`
   - On success (200): returns `{balance, account_type, rpm_limit, ...}`
   - On non-200: returns `{'error': f'HTTP {resp.status}'}`
   - On exception: returns `{'error': str(e)[:100]}`

**Frontend flow:**
3. `use-ai-team.ts` → `fetchQuotas()`: calls `GET /api/ai-team/quotas`
4. `AITeam.tsx` → `QuotasTab`:
   - If `deapi.balance !== undefined`: shows dollar amount
   - If `deapi.balance === undefined`: shows "Balance unavailable"
   - If `deapi.error`: shows error message

### Root Cause — Why Balance Would Be "Unavailable"

The "Balance unavailable" text appears when `deapi.balance` is `undefined`. This happens when:

1. **`DEAPI_API_KEY` env var not set** → returns `{error: '...'}`, no `balance` key → balance is undefined
2. **API returns non-200** → returns `{error: 'HTTP 401'}` etc → balance is undefined  
3. **Exception during fetch** (network error, timeout) → returns `{error: '...'}` → balance is undefined
4. **Silent exception in route handler** → the `except Exception: pass` block means if `fetch_deapi_balance()` itself throws, balance is never set

**Most likely cause**: `DEAPI_API_KEY` is not set in the environment, OR the API key is invalid causing HTTP 401/403.

### Fix Required
1. Check that `DEAPI_API_KEY` is set in `.env` / Railway env vars
2. Verify the API key is valid by testing: `curl -H "Authorization: Bearer $KEY" https://api.deapi.ai/api/v1/client/balance`
3. In the frontend: when `deapi.error` exists, show the specific error message instead of just "Balance unavailable"
4. Consider logging the error in the backend so it's visible in server logs

---

## Issue 8: "View Job" from Calendar Goes to "Job Not Found"

### Findings

**Frontend navigation (`Scheduled.tsx` line ~1392):**
```tsx
const jobId = selectedPost.job_id?.includes('_') 
  ? selectedPost.job_id.split('_')[0]
  : selectedPost.job_id
navigate(`/job/${jobId}`)
```

**How `job_id` is populated (`scheduling-api.ts` line ~91):**
```typescript
job_id: s.reel_id,  // ← mapped from reel_id, NOT an actual job ID!
```

**ScheduledReel model (`scheduling.py`):**
- Has `reel_id` column — this is set to various things:
  - For auto-scheduled reels from Maestro: format like `{brand}_{variant}_{uuid}` (e.g., `gymcollege_light_abc123`)
  - For posts: format like `post_{brand}_{uuid}` (e.g., `post_gymcollege_def456`)
- **NO `job_id` column exists** in the `ScheduledReel` model

**Scheduler service (`scheduler.py`):**
- `schedule_reel()` never receives or stores a `job_id`
- Only stores `reel_id` in the `ScheduledReel.reel_id` column

**JobDetail page (`JobDetail.tsx`):**
- Uses `useParams<{ jobId: string }>()` to get URL param
- Calls `useJob(id)` which fetches from `/api/jobs/{jobId}`
- Job model uses `job_id` as primary key (format: auto-incrementing or specific ID)

### Root Cause

**There is no link between `ScheduledReel` and `Job` tables.** 

- The `ScheduledReel` model has no `job_id` column
- The scheduler service doesn't receive or store job references
- The frontend maps `reel_id` as `job_id`, but `reel_id` is a UUID/string that has NOTHING to do with the jobs table primary key
- When Maestro generates content and schedules it, it creates a Job AND a ScheduledReel separately, but never links them via a foreign key
- Clicking "View Job" navigates to `/job/{reel_id}` which doesn't match any job

### Fix Required

**Option A (recommended):** Add `job_id` to the scheduling flow:
1. Add `job_id` column to `ScheduledReel` model
2. When scheduling (especially from Maestro), pass the `job_id` from the Job that generated the reel
3. Return `job_id` in the `/scheduled` API response
4. Map it properly in `scheduling-api.ts`

**Option B (quick fix):** Remove or disable the "View Job" button for scheduled posts that don't have a valid job_id link

---

## Summary of Root Causes

| # | Issue | Root Cause |
|---|---|---|
| 1/4 | Post preview uses replica | Frontend recreates with PostCanvas/CSS instead of displaying saved PNG. Carousel slide paths not stored in schedule metadata. |
| 2 | Resume button loading | Loading state EXISTS and works. Minor UX: brief state flicker between API response and status refetch. |
| 3 | Delete by type | Only one "Delete All" button exists. Backend has no variant/type filter on bulk delete. |
| 5 | Bar spacing mismatch | Preview uses border-radius (20px canvas) but backend renders sharp corners. Width calculation method differs. |
| 6 | Loading animations | Single generic spinner used everywhere. No page-specific skeletons or Suspense boundaries. |
| 7 | Balance unavailable | Most likely `DEAPI_API_KEY` not set or invalid. Silent exception handling hides the actual error. |
| 8 | Job not found | No `job_id` column in ScheduledReel model. Frontend maps `reel_id` as `job_id` but it's not a valid job reference. |
