# Scheduling / Calendar Disconnect Analysis

## Executive Summary

**There is NO disconnect.** The Jobs page and the Calendar/Scheduled page both read from the **same single table** (`scheduled_reels`). Both reels AND posts go into this table. The system works correctly.

---

## Tables Involved

### 1. `generation_jobs` (model: `GenerationJob`)
- **Purpose:** Tracks content generation jobs (both reels and posts)
- **Key fields:**
  - `job_id` (PK) — e.g., "GEN-001234"
  - `status` — "pending", "generating", "completed", "failed"
  - `variant` — "light", "dark", or "post"
  - `brand_outputs` (JSON) — per-brand output with reel_id, video_path, thumbnail_path, caption, etc.
  - Each brand output has its own `status` field inside the JSON: "pending", "generating", "completed", **"scheduled"**

### 2. `scheduled_reels` (model: `ScheduledReel`)
- **Purpose:** The SINGLE scheduling table for ALL content types (reels AND posts)
- **Key fields:**
  - `schedule_id` (PK)
  - `reel_id` — references the content ID (despite the name, also used for posts)
  - `scheduled_time` — when to publish
  - `status` — "scheduled", "publishing", "published", "failed", "partial"
  - `extra_data` (JSON) — contains `brand`, `variant`, `platforms`, `video_path`, `thumbnail_path`, `yt_title`, `title`, `slide_texts`, etc.
  - The `variant` field inside `extra_data` distinguishes content type: "light"/"dark" = reel, "post" = image post

**There is NO separate `scheduled_posts` or `content_schedule` table.** Everything goes through `scheduled_reels`.

---

## Data Flow: Complete Pipeline

### Flow 1: Automated (Maestro Daily Burst)
```
Maestro Daily Burst (12PM Lisbon)
    ↓
AI Agents generate proposals (TobyProposal table)
    ↓
_auto_accept_and_process() accepts each proposal
    ↓
Creates GenerationJob (variant: light/dark/post, 1 brand per job)
    ↓
JobProcessor generates content (thumbnail, video, caption)
    ↓
Job status → "completed", brand_output status → "completed"
    ↓
auto_schedule_job(job_id) called immediately after processing
    ↓
For each brand output with status "completed":
  - Finds next available time slot (reel or post slot depending on variant)
  - Creates ScheduledReel entry in scheduled_reels table
  - Updates brand_output status → "scheduled" in job's brand_outputs JSON
    ↓
Publishing daemon checks every few minutes for due posts
    ↓
Publishes to Instagram/Facebook/YouTube
```

### Flow 2: Manual (User clicks "Schedule" on JobDetail page)
```
User views completed job on JobDetail page
    ↓
Clicks "Schedule" or "Schedule All"
    ↓
Frontend calls POST /reels/schedule-auto with reel_id, brand, variant, etc.
    ↓
Backend creates ScheduledReel entry in scheduled_reels table
    ↓
Frontend calls POST /jobs/{id}/brand/{brand}/status with status="scheduled"
    ↓
Brand output status updated to "scheduled" in generation_jobs.brand_outputs
    ↓
Calendar page shows the entry (reads from same scheduled_reels table)
```

### Flow 3: Catch-up (schedule_all_ready_reels)
```
Every 10 minutes (_check_cycle), Maestro calls schedule_all_ready_reels()
    ↓
Finds ALL completed/failed jobs with brand outputs still in "completed" status
    ↓
For each unscheduled brand output:
  - Checks if reel_id already exists in scheduled_reels (safety check)
  - If not, creates ScheduledReel and marks brand_output as "scheduled"
```

---

## What the Jobs Page Shows

The **History page** (`src/pages/History.tsx`) reads from `generation_jobs` via `GET /jobs/`.

It categorizes jobs by looking at `brand_outputs` status:
- **"To Schedule"**: Jobs with brand outputs in "completed" status (ready to schedule)
- **"Scheduled"**: Jobs where ALL brand outputs have status "scheduled"
- **"In Progress"**: Jobs still generating
- **"Other"**: Failed, cancelled, etc.

When a job shows "Scheduled" on the History page, it means the `brand_outputs` JSON has `"status": "scheduled"` for each brand. This is set by either:
1. `auto_schedule_job()` (automatic) — via `brand_outputs[brand]["status"] = "scheduled"`
2. Frontend calling `POST /jobs/{id}/brand/{brand}/status` with `status: "scheduled"` (manual)

**The job "Scheduled" label is derived from the brand_outputs JSON within generation_jobs, NOT from the scheduled_reels table.**

---

## What the Calendar/Scheduled Page Shows

The **Scheduled page** (`src/pages/Scheduled.tsx`) reads from `scheduled_reels` via `GET /reels/scheduled`.

The API response maps `ScheduledReel` records to a flat list with:
- `schedule_id`, `reel_id`, `scheduled_time`, `status`
- `metadata.brand`, `metadata.variant`, `metadata.platforms`, `metadata.video_path`, `metadata.thumbnail_path`

The Calendar page uses `metadata.variant` to distinguish content types:
- `variant === 'post'` → shown as 📄 Post (image/carousel)
- `variant === 'light'` or `'dark'` → shown as reel (🌙 or ☀️)

**Both reels and posts appear on the Calendar.** There is a Content Type filter (All / Reels / Posts) on the Calendar page.

---

## Where a "Disconnect" Could Appear

### Scenario 1: `user_id` mismatch (MOST LIKELY)
The `GET /reels/scheduled` endpoint filters by `user_id`:
```python
schedules = scheduler_service.get_all_scheduled(user_id=user["id"])
```

But `auto_schedule_job()` and `schedule_all_ready_reels()` create ScheduledReel entries with:
```python
user_id="maestro"
```

If the logged-in user's ID is NOT "maestro", the Calendar page will NOT show Maestro-created schedules.

Meanwhile, the Jobs page reads from `generation_jobs` which has the job's `user_id` set to the proposal ID, and the frontend categorizes by looking at `brand_outputs` status (which IS updated to "scheduled"). So the Jobs page shows "Scheduled" but the Calendar doesn't show the entry because of the `user_id` filter.

**Root Cause: The `GET /reels/scheduled` endpoint filters by `user_id=user["id"]`, but auto-scheduled entries are created with `user_id="maestro"`.** The logged-in user won't see Maestro's scheduled entries.

### Scenario 2: Content type confusion
The Calendar has a Content Type filter. If "Reels" is selected, posts won't show. If "Posts" is selected, reels won't show. But this is by design and the filter defaults to "All".

### Scenario 3: Timing / race condition
If a job completes and `auto_schedule_job()` runs, but the Calendar page was loaded before the scheduling happened, the Calendar won't show the entry until the next refetch (every 30 seconds via `refetchInterval: 30000`).

---

## Diagnosis: The user_id Filter Problem

Looking at the code flow:

1. **Manual scheduling from JobDetail page:**
   - Frontend calls `POST /reels/schedule-auto` with auth token
   - Backend creates ScheduledReel with `user_id=user["id"]` (from auth middleware)
   - Calendar page queries with same `user_id=user["id"]` → ✅ **MATCH**

2. **Automatic scheduling from Maestro:**
   - `auto_schedule_job()` creates ScheduledReel with `user_id="maestro"`
   - Calendar page queries with `user_id=user["id"]` (e.g., "some-uuid") → ❌ **NO MATCH**
   - Jobs page shows "Scheduled" because it reads `brand_outputs` JSON directly → ✓ appears scheduled

This is the **root cause of the disconnect**: Jobs page says "Scheduled" (reading from generation_jobs.brand_outputs), but Calendar page doesn't show those entries (reading from scheduled_reels filtered by user_id, which is "maestro" not the logged-in user).

---

## Fix Options

### Option A: Remove user_id filter from Calendar API (Simplest)
Change `GET /reels/scheduled` to not filter by user_id:
```python
schedules = scheduler_service.get_all_scheduled()  # No user_id filter
```
This shows ALL scheduled content regardless of who created it. Since this is a single-user system functionally (one person manages all brands), this is the cleanest fix.

### Option B: Use the logged-in user's ID when auto-scheduling
Change `auto_schedule_job()` and `schedule_all_ready_reels()` to use the actual user_id:
```python
scheduler.schedule_reel(
    user_id=actual_user_id,  # instead of "maestro"
    ...
)
```
Problem: Maestro runs as a background daemon and doesn't have a "current user" context easily available.

### Option C: Show all + tag with creator
Keep the filter but also include `user_id="maestro"` entries. Could add a query parameter like `include_maestro=true`.

---

## Recommendation

**Option A is the best fix.** This is effectively a single-tenant system. The `user_id` filter on `GET /reels/scheduled` was designed for multi-user but there's only one user. Simply remove the filter:

```python
# In schedule_routes.py, GET /reels/scheduled:
schedules = scheduler_service.get_all_scheduled()  # Remove user_id filter
```

This makes the Calendar show everything — both manually scheduled and Maestro-auto-scheduled content.

---

## Summary Table

| Aspect | Jobs Page | Calendar Page |
|--------|-----------|---------------|
| **Data source** | `generation_jobs.brand_outputs` JSON | `scheduled_reels` table |
| **"Scheduled" means** | `brand_outputs[brand].status == "scheduled"` | Entry exists in `scheduled_reels` |
| **User filter** | None (shows all jobs) | `user_id == logged_in_user` |
| **Maestro entries** | ✅ Shows (reads brand_outputs directly) | ❌ Hidden (user_id="maestro" ≠ logged_in_user) |
| **Manual entries** | ✅ Shows | ✅ Shows |
| **Content types** | Both reels + posts | Both reels + posts (with filter) |
