# Four Issues Research — Root Cause Analysis

## Issue 1: Double `/app/app/` Path in Carousel Publishing

### Root Cause
There are **two different scheduling flows** that store paths in different formats, but the auto-publish daemon in `app/main.py` applies a blanket `/app` prefix that causes double-pathing.

#### Flow A — Manual scheduling via `schedule_routes.py` (`POST /schedule-post-image`)
- `schedule_routes.py` line ~699: Saves images using `Path(__file__).resolve().parent.parent.parent` which resolves to `/app` in the Docker container (WORKDIR is `/app`).
- `image_path = posts_dir / f"{post_id}.png"` → absolute path like `/app/output/posts/post_healthycollege_abc123.png`
- `carousel_paths.append(str(slide_path))` → also absolute paths: `/app/output/posts/post_healthycollege_abc123_slide1.png`
- These **absolute paths** are passed to `scheduler_service.schedule_reel()` which stores them as-is in `extra_data` JSON.

#### Flow B — Maestro auto-scheduling via `scheduler_logic.py`
- `scheduler_logic.py` line ~68: Uses **relative paths**: `cover_out = f"output/posts/post_{brand}_{uid8}.png"`
- `carousel_paths.append(slide_out)` → relative paths like `output/posts/post_healthycollege_abc123_slide1.png`
- These **relative paths** are stored in `extra_data` JSON.

#### The GET `/scheduled` endpoint (`schedule_routes.py` line ~347-354)
- Reads `carousel_paths` from metadata and normalizes:
  ```python
  if "/output/" in cp:
      carousel_urls.append("/output/" + cp.split("/output/", 1)[1])
  ```
- This works for BOTH absolute (`/app/output/...` → `/output/...`) and relative (`output/...` → `/output/...`) paths.
- Returns URL-style paths like `/output/posts/...` to the frontend.

#### The Auto-Publish Daemon (`app/main.py` line ~342)
The `_resolve_output_path()` helper:
```python
def _resolve_output_path(raw: str | None) -> str | None:
    if clean.startswith('/output/'):
        clean = '/app' + clean
    return clean
```

**This is the bug site.** When the GET endpoint returns `thumbnail_path` as `/output/posts/...`, the auto-publish daemon reads it back and prepends `/app`, creating `/app/output/posts/...`. That's correct for paths coming from the API response format.

**BUT** — for Flow A (manual scheduling), the raw `thumbnail_path` stored in DB is already `/app/output/posts/...`. The `_resolve_output_path` doesn't match `/app/output/` (it only checks `startsWith('/output/')`) so it leaves it as-is. That's also correct.

**The actual double `/app/app/` path** would occur if:
1. The `thumbnail_path` stored in metadata somehow gets normalized to `/output/...` format (e.g., by passing through the GET endpoint and then being re-stored), AND
2. The auto-publish daemon later adds `/app` prefix again.

OR more likely:
- In `app/main.py` line ~363, for the **is_post** path, after resolving `thumbnail_path_str`, it does:
  ```python
  if not image_path.is_absolute():
      image_path = Path("/app") / image_path.as_posix().lstrip('/')
  ```
- For Flow B (relative paths like `output/posts/...`): `_resolve_output_path` returns it as-is (doesn't start with `/output/`), then the `is_absolute()` check catches it and correctly prepends `/app`.
- But if the path is `output/posts/...` and it DOES get treated as not absolute → `Path("/app") / "output/posts/..."` = `/app/output/posts/...` ✅ correct.

**Actual bug scenario**: The `_resolve_output_path` runs on ALL metadata values. For carousel publishing, the `carousel_paths` are NOT individually resolved through `_resolve_output_path` in the auto-publish daemon — the daemon only resolves `video_path` and `thumbnail_path`. **The carousel images are never published by the auto-publish daemon at all** — it only publishes the cover image as a single image post, not a multi-image carousel. The carousel slides are stored but ignored during auto-publish.

**This means**: The double `/app/app/` path likely manifests when displaying carousel images in the frontend, not during publishing. The GET endpoint's normalization to `/output/...` paths works for display, but if these paths are fed back to a file-reading endpoint that also prepends `/app`, you'd get `/app/output/...` → file found. The problem path would be if raw DB values like `/app/output/posts/...` are normalized to `/output//output/posts/...` — but the `split("/output/", 1)[1]` logic prevents that.

### Verdict
The path normalization is fragile but currently functional for single-image posts. **The real issue is that carousel (multi-image) posts are stored but never actually published as carousels** — only the cover image gets published. The Meta Graph API requires a container creation approach for carousels that isn't implemented. The path doubling would occur if a stored path like `/app/output/posts/file.png` gets re-processed through both the GET endpoint normalizer AND then the `_resolve_output_path` in sequence.

---

## Issue 2: Maestro Pause/Resume UX Delay

### Root Cause
The `handlePauseResume()` function in `AITeam.tsx` has a **polling loop** that creates unnecessary delay and a brief UI inconsistency.

#### The Flow:
1. User clicks Pause/Resume → `maestroToggling = true` (shows "Stopping..."/"Starting..." spinner)
2. `POST /api/maestro/pause` (or `/resume`) is called
3. The backend (`app/api/maestro/routes.py`) immediately updates the DB via `set_paused(True/False)`, verifies the write, and returns the new status.
4. A toast fires immediately: `toast.success('Maestro paused')`
5. **Then a polling loop starts**: up to 15 attempts × 1 second apart, calling `GET /api/maestro/status` and waiting for `is_paused` to change.
6. After polling confirms, `onRefresh()` is called to update parent state.
7. `maestroToggling` becomes `false`.

#### Why the Delay:
- The backend pause/resume endpoints are **synchronous** — they immediately write to DB and return. When the POST returns successfully, the state IS already changed.
- The polling loop (steps 5-6) is **completely unnecessary** for pause/resume. It was likely added because `resume` can trigger a `background_tasks.add_task(maestro._run_daily_burst)` which is async, but the `is_paused` flag itself changes instantly.
- The 15-attempt × 1-second polling adds up to **1-15 seconds** of "Stopping..."/"Starting..." spinner time even though the action completed in <100ms.

#### Why UI Inconsistency:
- After the polling loop finishes and `maestroToggling` becomes `false`, there's a brief render where the OLD `maestroStatus.is_paused` value is displayed (button shows wrong label) until `onRefresh()` triggers a re-render with the new status.
- The `onRefresh()` callback is `fetchMaestroStatus` which does another `GET /api/maestro/status` — redundant since polling already confirmed the change.

### Fix Direction
Remove the polling loop entirely. After the POST succeeds, optimistically update the local state OR use the response payload to update `is_paused` immediately. The `fetchMaestroStatus` call can follow as a background refresh to sync other status fields.

---

## Issue 3: Delete Posts/Reels Not Unscheduling

### Root Cause
**The backend delete logic is correct and functional.** The issue is either intermittent or misdiagnosed.

#### Backend Analysis:
- **Individual delete** (`DELETE /reels/scheduled/{schedule_id}`): `schedule_routes.py` calls `scheduler_service.delete_scheduled(schedule_id)` which does:
  ```python
  scheduled_reel = db.query(ScheduledReel).filter(ScheduledReel.id == schedule_id).first()
  if scheduled_reel:
      db.delete(scheduled_reel)
      db.commit()
      return True
  ```
  This is a hard delete from the database.

- **Bulk day delete** (`DELETE /reels/scheduled/bulk/day/{date}`): `schedule_routes.py` queries `ScheduledReel` records for the given day, optionally filtering by variant, then does `db.delete(sr)` for each one + `db.commit()`. Also a hard delete.

#### Frontend Analysis:
- **Individual delete**: `Scheduled.tsx`'s `handleDelete()` calls `deleteScheduled.mutateAsync(post.id)` where `post.id` is mapped from `schedule_id` by `scheduling-api.ts`'s `getScheduled()` function.
- **Day delete**: Uses `deleteScheduledForDay.mutateAsync({ date: dayStr, variant: 'reel'|'post' })`.
- Both mutations call `queryClient.invalidateQueries({ queryKey: schedulingKeys.scheduled() })` on success, which triggers a refetch.

#### Potential Issues:
1. **Cache staleness**: `useScheduledPosts` has `refetchInterval: 30000` (30s) and `staleTime: 0`. The invalidation should trigger immediate refetch, but if the API returns cached data from a separate in-memory cache, deleted items could reappear.
2. **Status filter**: The GET `/scheduled` endpoint only returns items with `status IN ('scheduled', 'failed', 'publishing')`. If a post was deleted but the same reel_id gets re-scheduled by Maestro before the UI refreshes, it would appear to "come back."
3. **Maestro re-scheduling**: `schedule_all_ready_reels()` runs on resume and periodically. If a reel's job is still in "completed" state, Maestro may re-create a schedule entry for it after the user deletes it. This is the most likely cause of "deletes not sticking."

### Verdict
The delete operations work correctly at the DB level. The most likely explanation for "deletes not working" is that **Maestro re-schedules the same content** shortly after deletion, making it appear as if the delete didn't work. Verify by checking if the `schedule_id` changes after deletion (new auto-scheduled entry) vs. the same `schedule_id` persisting (actual delete failure).

---

## Issue 4: Analytics Only Shows Cumulative, No Daily History

### Root Cause
**The infrastructure for daily snapshots exists but data collection is too sparse.**

#### What's Implemented:
- `AnalyticsSnapshot` model has all needed fields (followers, views, likes, engagement_rate, recorded_at)
- `analytics_service.py`'s `_update_analytics()` creates a snapshot on every refresh
- `get_snapshots()` deduplicates to latest snapshot per (brand, platform, day)
- Frontend `Analytics.tsx` has `buildDailyGainData()` that computes day-over-day deltas from snapshots
- The chart shows "Need at least 2 days of data to show growth" when `cum.length < 2`

#### Why Daily Charts Appear Empty:
1. **Auto-refresh runs every 12 hours** (`main.py` line ~587): This only creates ~2 snapshots/day, which gives just 1 daily delta point per day. For short-lived deployments or recent setups, there may be <2 days of data.
2. **The `backfill_historical_data()` endpoint** (`analytics routes.py`) fetches 28 days of Instagram insights but sets `followers_count=0` for historical entries because Instagram's API doesn't provide historical follower counts. This means backfilled snapshots have incomplete data.
3. **Deduplication logic**: `get_snapshots()` keeps only the LATEST snapshot per (brand, platform, day). If the same day has multiple snapshots, only the last one is kept. With 12h refresh intervals, that's 2 snapshots reduced to 1 per day — which is correct but means you need to wait for real days to pass.
4. **No initial seed**: When the system first starts, there are no snapshots. The analytics refresh on startup creates the first one. You need at least 2 calendar days of uptime before any daily growth data appears.

### Verdict
The system works but requires patience — at least 2 full calendar days of uptime before daily growth charts populate. The UX issue is that there's no indication of when data will become available, and the 12-hour refresh interval is acceptable but slow. The backfill endpoint is a workaround but produces incomplete data (zero followers).

---

## Dead Code Audit

### Confirmed Dead Code:

1. **`app/services/maestro/scheduler_logic.py`** — `import copy` appears THREE times:
   - Line 3: top-level import
   - Line 15: inside `auto_schedule_job()` function
   - Line 160: inside `schedule_all_ready_reels()` function
   - The local imports shadow the top-level one. Only the local imports are used (inside `copy.deepcopy()` calls). The top-level import on line 3 is dead.

2. **Auto-publish daemon carousel handling** — `app/main.py` auto-publish
   - The `carousel_paths` are stored in metadata by both scheduling flows but **never used during auto-publishing**. The auto-publish daemon only publishes:
     - Single image posts (cover image only)
     - Reels (video + thumbnail)
   - Multi-image carousel publishing (where you'd use `carousel_paths`) is not implemented. The stored carousel slide paths are dead data from the publishing perspective.

3. **`app/main.py` cover composition during auto-publish** (line ~375-391):
   - During auto-publish of image posts, `compose_cover_slide()` is called AGAIN to composite title/gradient onto the background. But the cover was already composed when it was scheduled via `schedule_routes.py` or `scheduler_logic.py`. This creates a **double-composited** cover image (title rendered twice on top of each other) if the stored `thumbnail_path` already points to a composited cover rather than raw background.
   - This is either dead code (if the path points to an already-composited image) or a bug (double-compositing).

### Suspicious but Not Confirmed Dead:

4. **`app/services/analytics/metrics_collector.py`**: Collects per-post Instagram metrics (`PostPerformance`). Not called from any visible route or scheduled job in the files read. May be called from Maestro's learning engine or an unread module.

5. **`app/services/publishing/scheduler.py` `publish_scheduled_now()`** (line ~482): Sets `scheduled_time` to now so the auto-publisher picks it up. The frontend has `usePublishNow()` that calls `POST /reels/scheduled/{id}/publish-now`. This may or may not be actively used — needs UX verification.

---

## Summary Table

| Issue | Root Cause | Severity | Fix Complexity |
|-------|-----------|----------|----------------|
| 1. Double `/app/app/` path | Fragile path normalization across 2 scheduling flows + auto-publish daemon; carousel publishing not implemented | Medium | Medium — unify path storage format, implement carousel publishing |
| 2. Maestro Pause/Resume delay | Unnecessary 15-attempt polling loop after synchronous backend operation | Low | Low — remove polling, use POST response directly |
| 3. Delete not unscheduling | Backend deletes work; Maestro likely re-schedules same content after deletion | Medium | Medium — need "do not reschedule" flag or mark job as user-cancelled |
| 4. Analytics cumulative only | System works but requires 2+ days of uptime; 12h refresh creates sparse snapshots | Low | Low — reduce refresh interval or improve backfill quality |
