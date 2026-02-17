# Observatory & Storage Deep Audit

**Date**: 2025-02-17  
**Scope**: Observatory frontend architecture + Storage backend audit  
**Status**: Complete

---

## AREA 1: OBSERVATORY — Full Architecture Audit

### 1.1 Modes (5 total)

| Mode | Trigger | Description |
|------|---------|-------------|
| **overview** | Default fallback | Shows operations timeline, weekly schedule, recent activity, system panel |
| **countdown** | Next operation ≤5 min away | Full-screen countdown timer with operation briefing |
| **live** | `maestro.current_phase` is truthy OR recent activity ≤30s old | Real-time view: agent pods (burst), stats bar, activity log |
| **recap** | Recent activity 30s–120s old (and no `current_phase`) | "COMPLETE" banner with production summary stats |
| **history** | User clicks "History" button (sets `forcedMode = 'history'`) | Full activity log with cycle-type filter buttons |

### 1.2 Mode Detection Logic (`detectMode()`)

```
Priority order:
1. forcedMode === 'history' → return 'history'
2. maestro?.current_phase is truthy → return 'live'
3. Recent logs (≤5min) with activity keywords:
   a. Latest within 30s → return 'live'
   b. Latest within 120s → return 'recap'
4. Next operation ≤5min away → return 'countdown'
5. → return 'overview'
```

Activity keywords checked in step 3:
```
'generating', 'planning', 'saved:', 'examiner', 'auto-accepting',
'burst', 'healing', 'publishing', 'scout', 'observe',
'feedback', 'mutation', 'evolution', 'diagnostic', 'bootstrap'
```

### 1.3 The Phase Transition Bug — ROOT CAUSE

**User report**: After "Test 1 brand 1 post", shows GENERATING for ~24s, then suddenly "COMPLETE - All tasks finished successfully" even though generation is still ongoing.

#### What happens step-by-step:

1. User clicks "Test 1 brand 1 post" → POST to `/api/maestro/trigger-burst` with `{ posts: 1, brands: ["healthycollege"] }`
2. Backend calls `background_tasks.add_task(maestro.run_smart_burst, 0, 1, user_id, ["healthycollege"])`
3. `run_smart_burst()` executes:
   - Sets `self.state.current_phase = "generating"` ← **Frontend enters LIVE mode**
   - Loads agents, generates 1 post proposal (~5-10s for AI call)
   - Sets `self.state.current_phase = "processing"`
   - Calls `_auto_accept_and_process(proposals)` → runs examiner, creates job, dispatches to **background thread** via `_process_and_schedule_job()`
   - The dispatch launches a new thread and returns immediately
4. `run_smart_burst()` **finally** block executes:
   ```python
   self.state.current_phase = None  # ← THIS IS THE BUG
   ```
5. But the actual work (AI image generation ~30s, Supabase upload) is running in a **separate thread** spawned by `_process_and_schedule_job()`

#### Timeline visualization:

```
T+0s   run_smart_burst() starts → current_phase = "generating"
T+5s   AI proposal generated (DeepSeek API call)
T+10s  Examiner scores proposal
T+15s  Job created, thread dispatched for process_post_brand()
T+20s  run_smart_burst() finally block → current_phase = None  ← BUG
T+20s  Frontend sees current_phase = null → mode detection falls to log-based
T+22s  Recent log "Smart Burst Complete" is <30s old → still 'live' briefly
T+24s  Log ages past 30s → mode switches to 'recap' → shows "COMPLETE"
T+25-60s  Background thread STILL running: generating AI image, uploading to Supabase
T+60s  Background thread finishes → job status = "completed" (but nobody watching)
```

#### Why `current_phase` is cleared too early:

In `maestro.py:run_smart_burst()`, the finally block:
```python
finally:
    self._current_user_id = None
    self.state.current_agent = None
    self.state.current_phase = None           # ← Clears phase
    self._daily_burst_lock.release()
```

This runs as soon as job threads are **dispatched**, not when they **complete**. The job threads run via `_process_and_schedule_job()` in `proposals.py`, which:
1. Acquires `_job_semaphore`
2. Calls `JobProcessor.process_job()`
3. Calls `auto_schedule_job()`
4. Releases semaphore

None of this updates `current_phase` — it's fire-and-forget.

### 1.4 The State Machine (All Possible States & Transitions)

```
Backend current_phase values:
  null → "generating" → "processing" → null

    null:         No burst running
    "generating": Proposals being created (AI calls happening)
    "processing": Proposals being examined and jobs dispatched
    null:         Burst function returned (BUT jobs may still be processing)

Frontend mode derivation:
  current_phase = "generating" or "processing" → LIVE
  current_phase = null + recent logs <30s → LIVE (log-based)
  current_phase = null + recent logs 30-120s → RECAP ("COMPLETE")
  current_phase = null + no recent logs → OVERVIEW or COUNTDOWN
```

**Missing state**: There is no `current_phase = "jobs_running"` for when individual job threads are processing media.

### 1.5 Activity Log Architecture

**Source**: `maestro?.recent_activity` (NOT `useLiveLogs()`)
- `useLiveLogs()` exists but is **NOT used** by Observatory
- Activity comes from `MaestroState.activity_log` (in-memory list, max 500 entries)
- Returned as `recent_activity` in status endpoint (last 30 entries)
- Polling via `useMaestroLive()` at 5000ms intervals

**Transformation**: Raw maestro logs are transformed in a `useMemo()` block that:
- Converts technical actions to user-friendly messages
- Filters out background maintenance during active generation
- Maps each entry to `{ id, timestamp, message, level, category }`

### 1.6 Elapsed Time

**What it tracks**: Time since the Observatory **component mounted**, NOT time since burst started.

```typescript
const [startTime] = useState(Date.now())  // Set on component mount, never changes
const stats = calculateStats(logs, startTime, agents)
// stats.elapsed_seconds = Math.floor((Date.now() - startTime) / 1000)
```

This is misleading — if the user navigates to Observatory mid-burst, the timer starts from when they opened the page, not when the burst began.

### 1.7 TODAY'S PRODUCTION Stats

**Source**: `maestro.daily_config` from the `/api/maestro/status` endpoint

Backend calculation in `routes.py:maestro_status()`:
```python
today_reels = db.query(AgentProposal).filter(
    AgentProposal.created_at >= today,
    AgentProposal.content_type == "reel",
).count()
today_posts = db.query(AgentProposal).filter(
    AgentProposal.created_at >= today,
    AgentProposal.content_type == "post",
).count()
```

Targets come from `_get_daily_config()`:
- `total_reels = PROPOSALS_PER_BRAND_PER_AGENT × n_brands` (6 × 5 = 30)
- `total_posts = POSTS_PER_BRAND × n_brands` (2 × 5 = 10)

Displayed in Overview sidebar and Recap mode as progress bars.

### 1.8 Production Stats (Live Mode header)

Calculated by `calculateStats()` in `statsCalculator.ts`, which counts by **pattern matching log messages**:
- Proposals: looks for messages containing `saved:` + agent name
- Accepted: `auto-accepting` or `examiner: accept`
- Rejected: `examiner: reject` or `rejected`
- Jobs: `created generation job` or `job id: gen-`
- Scheduled: `scheduled reel/post` or `auto-scheduled`

**Problem**: These patterns match against the **transformed** user-friendly messages, not the raw technical ones. The transformed messages don't contain keywords like "saved:" or "job id: gen-" — they contain things like "Creating 1 carousel post for healthycollege" or "✓ Generated 1 proposal(s)". So **stats will always show 0** in the current implementation.

### 1.9 Polling Intervals

| Hook | Endpoint | Interval | staleTime |
|------|----------|----------|-----------|
| `useMaestroLive()` | `/api/maestro/status` | 5000ms | 2000ms |
| `useAgents()` | `/api/agents` | 5000ms | 2000ms |
| `useLiveLogs()` | `/api/logs?since_minutes=60` | 2000ms | 0ms |

Note: `useLiveLogs()` is imported but **never used** in Observatory. All log data comes through the maestro status endpoint's `recent_activity` field.

### 1.10 Race Conditions & Timing Issues

1. **Phase cleared too early** (main bug): `current_phase = None` in `run_smart_burst()` finally block, before job threads finish
2. **5-second poll gap**: Frontend polls every 5s, so a phase change from `"generating"` → `None` can be missed entirely if it happens between polls
3. **Activity log truncation**: Only last 30 entries returned in status. During burst with many agents, important entries may scroll off
4. **Stats pattern mismatch**: `calculateStats()` searches for patterns that don't exist in the transformed messages
5. **Elapsed time is component-relative**: Shows time since page open, not burst duration
6. **`detectActiveCycle()` vs `maestro.current_phase`**: Both are used — `activeCycle = maestro?.current_phase || detectedCycle`. If `current_phase` is null but logs mention "burst", `detectActiveCycle()` returns "daily_burst" and Recap mode shows "Daily Burst Complete" even though it was a test burst

---

## AREA 2: STORAGE — Railway vs Supabase Audit

### 2.1 Storage Architecture Status

**Result: Supabase is the sole storage backend.**

- `supabase_storage.py` provides `upload_file()`, `upload_from_path()`, `upload_bytes()`, `download_file()`, `delete_file()`
- All file I/O uses `tempfile.NamedTemporaryFile()` → upload → `os.unlink()`
- No local persistence of generated content
- Dockerfile creates `output/` dirs, but these are only used as temp workspace by `job_processor.py`

### 2.2 All Upload Call Sites in `job_processor.py`

#### REEL path — `regenerate_brand()` (4 uploads)

| # | What | Remote Path | Error Handling | Impact |
|---|------|------------|----------------|--------|
| 1 | Thumbnail | `{user}/{brand}/thumbnails/{id}_thumbnail.png` | **SWALLOWS** — sets `thumb_url = ""` | Black cover images |
| 2 | Reel Image | `{user}/{brand}/reels/{id}_reel.png` | **SWALLOWS** — sets `reel_url = ""` | Missing reel preview |
| 3 | Video | `{user}/{brand}/videos/{id}_video.mp4` | **SWALLOWS** — sets `video_url = ""` | No video playback |
| 4 | YT Thumbnail | `{user}/{brand}/thumbnails/{yt_filename}` | **SWALLOWS** — sets `yt_thumb_url = ""` | No YT thumbnail |

**Code pattern (all 4 use this):**
```python
try:
    thumb_url = upload_from_path("media", thumb_remote, str(thumbnail_path))
except StorageError as e:
    print(f"   ⚠️ Thumbnail upload failed: {e}", flush=True)
    thumb_url = ""            # ← STORES EMPTY STRING
```

The empty string then gets saved to the database via `update_brand_output()`:
```python
self._manager.update_brand_output(job_id, brand, {
    "status": "completed",      # ← JOB MARKED AS COMPLETED
    "thumbnail_path": thumb_url,  # ← "" (empty)
    ...
})
```

This means a job can be marked "completed" even though ALL its media uploads failed silently.

#### POST path — `process_post_brand()` (1 upload)

| # | What | Remote Path | Error Handling | Impact |
|---|------|------------|----------------|--------|
| 5 | Background | `{user}/{brand}/posts/{id}_background.png` | **RAISES** exception → fails job | Correct behavior |

**Code pattern:**
```python
try:
    bg_url = upload_from_path("media", bg_remote, str(bg_path))
except StorageError as e:
    os.unlink(bg_path)
    raise Exception(f"Failed to upload background image to storage: {str(e)}")
```

This was already fixed per CLAUDE.md guidance — post uploads fail the job properly.

### 2.3 Bucket Structure

```
Bucket: "media" (single bucket for everything)

Path convention:
  {user_id}/{brand_slug}/{category}/{filename}

Categories:
  thumbnails/     — Reel thumbnails, YT thumbnails
  reels/          — Reel images (static PNG)
  videos/         — MP4 video files
  posts/          — Post background images

Example paths:
  abc-123/healthycollege/thumbnails/gen-xxx_healthycollege_thumbnail.png
  abc-123/healthycollege/videos/gen-xxx_healthycollege_video.mp4
  abc-123/healthycollege/posts/gen-xxx_healthycollege_background.png
```

### 2.4 Temporary Files & Cleanup

`job_processor.py` creates temp files using `tempfile.NamedTemporaryFile()`:
- Temp files are created for thumbnail, reel image, video, and YT thumbnail
- Cleanup happens in a loop after upload:
  ```python
  for tmp in [thumbnail_path, reel_path, video_path, Path(str(actual_yt_thumb_path))]:
      try:
          os.unlink(tmp)
      except OSError:
          pass
  ```
- **Issue**: If upload fails (silently), the temp file is still deleted — the generated content is lost

### 2.5 Dockerfile Local Directories

```dockerfile
RUN mkdir -p output/videos output/thumbnails output/reels output/schedules output/posts
```

These directories exist in the container but are NOT used for persistent storage. They may be remnants from an earlier version that stored files locally. Current code uses `tempfile` exclusively.

### 2.6 Local Assets (Legitimate)

Two types of local file access in the codebase are intentional:
1. **Music files**: `assets/music/` — bundled in Docker image, read by `VideoGenerator._get_music_path()`
2. **Fonts**: `assets/fonts/` — bundled in Docker image, read by image generation

These are static assets, not user-generated content. They should remain local.

### 2.7 No Railway Volume Mounts

- No Railway volume mount configuration found in `railway.json` or Dockerfile
- `About.tsx` mentions "persistent volumes" descriptively but there is no actual volume configuration
- All persistence is via Supabase Storage (files) and Supabase DB (metadata)

---

## CRITICAL FINDINGS SUMMARY

### Observatory Bug — Severity: HIGH

**Problem**: `current_phase` is cleared in `run_smart_burst()` finally block before background job threads complete. This causes the Observatory to show "COMPLETE" while AI image generation and uploads are still running.

**Fix needed**: Track active job threads and only clear `current_phase` when ALL dispatched jobs have finished. Options:
1. Maintain a counter of active jobs in `MaestroState` — set `current_phase = None` only when counter reaches 0
2. Have `_process_and_schedule_job()` update `current_phase` on completion
3. Add a new phase like `"jobs_running"` that gets cleared by the last completing job thread

### Stats Display — Severity: MEDIUM

**Problem**: `calculateStats()` pattern-matches against transformed log messages, but the patterns (like "saved:", "job id: gen-") don't appear in the user-friendly transformed text. Stats always show 0.

**Fix needed**: Either match against the transformed message patterns, or calculate stats from backend data (e.g., actual DB counts from the status endpoint).

### Elapsed Time — Severity: LOW

**Problem**: Shows time since component mount, not burst duration. Misleading but not broken.

**Fix needed**: Use burst start time from backend (e.g., derive from first log entry timestamp).

### Reel Upload Error Handling — Severity: HIGH

**Problem**: 4 upload call sites in `regenerate_brand()` silently swallow `StorageError`, storing empty strings. Jobs are marked "completed" even with zero successfully uploaded media.

**Fix needed**: Apply the same pattern used in `process_post_brand()` — raise exceptions on upload failure, or at minimum mark the brand output as "failed" instead of "completed".

### Unused `useLiveLogs` Hook — Severity: LOW

**Problem**: `useLiveLogs()` polls `/api/logs` every 2s but is never consumed by Observatory. Wasted network/server resources if imported elsewhere.

**Status**: Informational — may be used by other components.
