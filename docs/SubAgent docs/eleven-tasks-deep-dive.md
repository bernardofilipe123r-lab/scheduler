# Eleven Tasks — Deep Dive Analysis

## 1. Post Detail Slides in Scheduled.tsx — Carousel Not Showing

### Relevant Code

**Post Detail Modal** — [Scheduled.tsx](src/pages/Scheduled.tsx#L557-L629): The carousel code IS present and correctly structured. It renders `PostCanvas` for slide 0 (cover), and a CSS-based text slide preview for slides 1+.

**Carousel navigation arrows** — [Scheduled.tsx](src/pages/Scheduled.tsx#L617-L629): Arrows render ONLY when `totalSlides > 1`.

**totalSlides calculation** — [Scheduled.tsx](src/pages/Scheduled.tsx#L553):
```ts
const totalSlides = selectedPost.metadata?.variant === 'post' ? 1 + slideTexts.length : 1
```

**slideTexts source** — [Scheduled.tsx](src/pages/Scheduled.tsx#L552):
```ts
const slideTexts = selectedPost.metadata?.slide_texts || []
```

### Root Cause

The `schedule-post-image` endpoint in [schedule_routes.py](app/api/content/schedule_routes.py#L700-L709) calls `schedule_reel()` but **does NOT pass `slide_texts` or `post_title`**:

```python
result = scheduler_service.schedule_reel(
    user_id=user["id"],
    reel_id=post_id,
    scheduled_time=schedule_dt,
    video_path=None,
    thumbnail_path=image_path,
    caption=request.caption or request.title,
    platforms=["instagram", "facebook"],
    user_name="Web Interface User",
    brand=request.brand,
    variant="carousel" if carousel_paths else "post"
)
```

Missing: `slide_texts=request.slide_texts` and `post_title=request.title`.

The `scheduler_service.schedule_reel()` method ([scheduler.py](app/services/publishing/scheduler.py#L78-L88)) DOES support `slide_texts` and `post_title` parameters — they get stored in `metadata`. But the route never passes them.

**Result chain:**
1. `slide_texts` not passed → `metadata.slide_texts` is `None` in DB
2. GET `/reels/scheduled` → [schedule_routes.py](app/api/content/schedule_routes.py#L255) returns `metadata.slide_texts: null`
3. Frontend: `slideTexts = selectedPost.metadata?.slide_texts || []` → empty array
4. `totalSlides = 1 + 0 = 1` → arrows don't render, only cover shows

Additionally, the `variant` is set to `"carousel"` instead of `"post"`, which means the condition `isPost = selectedPost.metadata?.variant === 'post'` evaluates to `false`, so the carousel branch in the detail modal doesn't render at all — it falls through to the plain thumbnail `<img>`.

### Fix

In [schedule_routes.py](app/api/content/schedule_routes.py#L700-L709), add the missing parameters:

```python
result = scheduler_service.schedule_reel(
    user_id=user["id"],
    reel_id=post_id,
    scheduled_time=schedule_dt,
    video_path=None,
    thumbnail_path=image_path,
    caption=request.caption or request.title,
    platforms=["instagram", "facebook"],
    user_name="Web Interface User",
    brand=request.brand,
    variant="post",                          # ← Changed from "carousel"
    post_title=request.title,                # ← Added
    slide_texts=request.slide_texts,         # ← Added
)
```

Also in [Scheduled.tsx](src/pages/Scheduled.tsx#L553), the `isPost` condition should also handle `carousel` variant:
```ts
const isPost = selectedPost.metadata?.variant === 'post' || selectedPost.metadata?.variant === 'carousel'
```

---

## 2. Brands Not Found in Settings Tab

### Relevant Code

**SettingsTab** — [SettingsTab.tsx](src/features/brands/components/SettingsTab.tsx#L68-L79):
```ts
useEffect(() => {
    const fetchCreds = async () => {
      try {
        const resp = await apiClient.get<{ brands: BrandCredentials[] }>('/api/v2/brands/credentials')
        setBrandCreds(resp.brands)
      } catch {
        // ignore         ← SILENTLY SWALLOWS ERRORS
      }
      setBrandsLoading(false)
    }
    fetchCreds()
  }, [])
```

**MyBrandsTab** — [MyBrandsTab.tsx](src/features/brands/components/MyBrandsTab.tsx#L22):
```ts
const { data: v2Brands, isLoading: brandsLoading } = useBrands()
```

### Root Cause

- **MyBrandsTab** uses `useBrands()` React Query hook which calls `GET /api/v2/brands` — this works.
- **SettingsTab** uses a **different endpoint**: `GET /api/v2/brands/credentials` — a separate manual `useEffect` fetch.
- The `catch` block silently ignores all errors. If the `/credentials` endpoint returns a 404 or error, `brandCreds` stays empty (`[]`) and the UI shows "No brands found".
- There's no retry mechanism, no error state displayed for brands, and the error goes unnoticed.

### Fix

1. Check if `/api/v2/brands/credentials` endpoint actually exists and returns data properly.
2. Add error handling to the `useEffect`:
```ts
} catch (e) {
    console.error('Failed to fetch brand credentials:', e)
    toast.error('Failed to load brand connections')
}
```
3. Alternatively, use `useBrands()` to get brand list and fetch credentials separately, so at minimum the brand names/colors show even if credentials fail.

---

## 3. Posts Auto-Generate Redirect

### Relevant Code

**Auto Generate button** — [Posts.tsx](src/pages/Posts.tsx#L175-L183):
```ts
<button
  onClick={() => {
    setAutoCount(brandIds.length)
    setAutoBrands([...brandIds])
    setShowAutoModal(true)
  }}
```

This opens a modal — it does NOT navigate away. The actual submit is `handleAutoSubmit`:

**handleAutoSubmit** — [Posts.tsx](src/pages/Posts.tsx#L91-L107):
```ts
const handleAutoSubmit = async () => {
    if (autoBrands.length === 0) {
      toast.error('Select at least one brand')
      return
    }
    setIsCreating(true)
    setShowAutoModal(false)
    try {
      const job = await createJob.mutateAsync({
        title: 'Auto-generated posts',
        content_lines: [],
        brands: autoBrands,
        variant: 'post',
        cta_type: 'none',
      })
      toast.success('Auto generate job created!')
      navigate(`/job/${job.id}`)               // ← Navigates to job detail
    } catch {
      toast.error('Failed to create auto generate job')
    } finally {
      setIsCreating(false)
    }
  }
```

**Manual Generate Posts** — [Posts.tsx](src/pages/Posts.tsx#L110-L131):
```ts
const handleSubmit = async () => {
    ...
    const job = await createJob.mutateAsync({...})
    toast.success('Post job created!')
    navigate(`/job/${job.id}`)                 // ← Navigates to job detail
    ...
}
```

### Root Cause

Both buttons work correctly by design — they create a job via `createJob.mutateAsync()` and then `navigate('/job/${job.id}')` to the job detail page. This is **expected behavior**, not a bug.

**PostsPromptsPage** — [PostsPrompts.tsx](src/pages/PostsPrompts.tsx) is just `<PromptsPage contentType="posts" />` — a completely separate page for viewing prompt layers. It has no auto-generate functionality.

### Conclusion

There is NO auto-generate redirect bug. The flow is: click Auto Generate → modal opens → confirm → creates job → navigates to job detail for monitoring. This is correct. If the user is reporting being redirected somewhere unexpected, verify the route configuration for `/job/:id`.

---

## 4. Layout Settings Save — PostJobDetail.tsx

### Relevant Code

**Save Settings button** — [PostJobDetail.tsx](src/pages/PostJobDetail.tsx#L152-L155):
```ts
const saveSettings = () => {
    persistSettings(settings)
    toast.success('Settings saved!')
}
```

**persistSettings** is `saveGeneralSettings` imported from PostCanvas:
```ts
import { saveGeneralSettings as persistSettings } from '@/shared/components/PostCanvas'
```

### Root Cause

`saveGeneralSettings` saves to **localStorage only** — it does NOT call any API:

```ts
// From PostCanvas module:
export function saveGeneralSettings(settings: GeneralSettings) {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}
```

This is **by design** — layout settings (fontSize, titleGap, logoGap, etc.) are client-side preferences that affect the canvas rendering locally. They control how the PostCanvas component renders but are NOT persisted to the server.

### Impact

- Settings survive page refreshes (localStorage persists across sessions)
- Settings do NOT sync across devices/browsers
- The cover image exported during auto-schedule uses these settings (rendered at schedule time from the canvas)
- This is likely working as intended since layout is a local rendering concern

---

## 5. Post Auto-Schedule Button — PostJobDetail.tsx

### Relevant Code

**Auto Schedule button** — [PostJobDetail.tsx](src/pages/PostJobDetail.tsx#L287-L295):
```ts
<button
    onClick={handleAutoSchedule}
    disabled={isScheduling}
    className="..."
>
    Auto Schedule
</button>
```

Appears only when `allCompleted && !allScheduled`.

**handleAutoSchedule** — [PostJobDetail.tsx](src/pages/PostJobDetail.tsx#L199-L273):

The function:
1. Checks all brands are completed
2. Fetches occupied post slots from `/reels/scheduled/occupied-post-slots`
3. For each brand:
   - Captures cover image from Konva canvas via `stage.toDataURL()`
   - Captures carousel text slides from `textSlideRefs`
   - Calculates next free slot (base hours 0 and 12, with brand offset)
   - POSTs to `/reels/schedule-post-image` with `image_data`, `carousel_images`, `slide_texts`, `schedule_time`
4. Updates brand status to `scheduled`

### Potential Errors

1. **`stage` is null**: If the Konva canvas ref wasn't captured → `failed++` silently. This can happen if fonts haven't loaded or the PostCanvas component didn't mount its ref.

2. **Slide capture timing issues**: The code sets `setBrandSlideIndex` and waits 150ms for React to re-render each slide before capturing. If the render takes longer, the captured image may be wrong or incomplete.

3. **The slot finding logic uses only hours 0 and 12 with offset**:
   ```ts
   for (const baseHour of [0, 12]) {
       const slot = new Date(now)
       slot.setHours(baseHour + offset, 0, 0, 0)
   ```
   This gives only 2 post slots per day per brand. If both are occupied, it tries the next day.

4. **Root issue with data loss**: As identified in Task 1, the `/reels/schedule-post-image` endpoint doesn't pass `slide_texts` to the scheduler. So even though the frontend sends `slide_texts` correctly, they're not stored in DB metadata.

---

## 6. toby_proposals Deep Dive

### Table Definition

[agents.py](app/models/agents.py#L290-L386) — `TobyProposal` with `__tablename__ = "toby_proposals"`.

### Is It Only Used by Toby?

**NO.** Despite the name, it is a **generic proposal table used by ALL AI agents**:

- Column `agent_name` — [agents.py](app/models/agents.py#L310): `Column(String(20), default="toby", nullable=False, index=True)` — defaults to "toby" but accepts any agent name.
- `proposal_id` uses the agent's `proposal_prefix` (e.g., "TOBY-001", "LEXI-002", "MARCO-003").

### All References Across Codebase

| File | Usage |
|------|-------|
| **app/models/agents.py** | Model definition |
| **app/models/__init__.py** | Exported in `__all__` |
| **app/services/agents/generic_agent.py** | `GenericAgent._generic_strategy()` creates `TobyProposal` instances for ANY agent. Uses `agent_name` field to track which agent created it. |
| **app/services/agents/diagnostics_engine.py** | Queries proposals for diagnostics: counts, recent proposals per agent |
| **app/services/agents/evolution_engine.py** | Counts proposals per agent_id for fitness scoring: `TobyProposal.agent_name == agent_id` |
| **app/services/maestro/proposals.py** | Maestro accepts/rejects proposals, queries by `proposal_id` |
| **app/services/maestro/maestro.py** | Checks daily proposal count per agent: `TobyProposal.agent_name == agent_name` |
| **app/services/maestro/healing.py** | Links proposals to generation jobs via `TobyProposal.accepted_job_id` |
| **app/services/content/tracker.py** | Pulls recent titles from `toby_proposals` for duplicate detection across brands |

### Conclusion

The table name `toby_proposals` is a legacy naming artifact from when Toby was the only agent. It now serves as the **universal proposal table for all AI agents**. Every agent (Toby, Lexi, Marco, etc.) stores proposals here with their `agent_name` in the column. Renaming the table would be a purely cosmetic change requiring migrations and touching ~15 files.

---

## 7. deAPI Balance Endpoint

### Relevant Code

**fetch_deapi_balance** — [api_quota_manager.py](app/services/api_quota_manager.py#L115-L138):
```python
async def fetch_deapi_balance(self) -> dict:
    """Fetch deAPI account balance. Endpoint: GET https://api.deapi.co/v1/balance"""
    import os
    import aiohttp

    api_key = os.getenv('DEAPI_API_KEY')
    if not api_key:
        return {'error': 'No DEAPI_API_KEY configured'}

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                'https://api.deapi.co/v1/balance',           # ← WRONG URL
                headers={'Authorization': f'Bearer {api_key}'},
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                ...
```

### Root Cause

**Wrong API URL.** The code calls:
- `https://api.deapi.co/v1/balance`

The user says the correct endpoint is:
- `https://api.deapi.ai/api/v1/client/balance`

Two issues:
1. **Wrong domain**: `deapi.co` vs `deapi.ai`
2. **Wrong path**: `/v1/balance` vs `/api/v1/client/balance`

### Current Response Parsing

The code expects:
```python
balance = data.get('balance', 0)
account_type = data.get('account_type', 'basic')
```

This may also need updating depending on the actual response format from the correct endpoint.

### Fix

```python
async with session.get(
    'https://api.deapi.ai/api/v1/client/balance',
    headers={'Authorization': f'Bearer {api_key}'},
    timeout=aiohttp.ClientTimeout(total=5)
) as resp:
```

Also update the docstring to match. The response parsing should be validated against the actual API response format. The current quota manager only exposes this as `get_usage_summary()` (hourly internal tracking) and `get_daily_summary()` (daily internal tracking) — neither exposes the actual account credit balance. A new endpoint or field needs to be added to surface the real credit balance to the frontend.

---

## Summary Table

| # | Issue | Root Cause | Fix Complexity |
|---|-------|-----------|----------------|
| 1 | Post slides not showing in Scheduled | `schedule-post-image` doesn't pass `slide_texts`/`post_title` to scheduler; variant set to "carousel" not "post" | Small — add 2 params + fix variant |
| 2 | Brands not found in Settings | Silent error swallowing on `/api/v2/brands/credentials` fetch | Small — add error handling, verify endpoint |
| 3 | Posts auto-generate redirect | Not a bug — navigate to job detail is intended behavior | None |
| 4 | Layout settings save | localStorage only — by design | None (working as intended) |
| 5 | Post auto-schedule errors | Canvas ref capture + data loss from Task 1 | Medium — fix Task 1, review canvas refs |
| 6 | toby_proposals | Generic table for ALL agents, legacy name | None (cosmetic only) |
| 7 | deAPI balance URL | Wrong domain (`deapi.co` → `deapi.ai`) and path | Small — fix URL |
