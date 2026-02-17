# Observatory Refactor + Storage Migration Plan

## Executive Summary

The Observatory has two critical bugs and a fundamental design problem:
1. **Phase resets too early**: `run_smart_burst()` clears `current_phase = None` in its `finally` block as soon as proposals are dispatched to background threads, but the actual job processing (AI image generation, Supabase upload) takes 30-120s more. Frontend sees `current_phase=None` → switches from LIVE to RECAP/COMPLETE.
2. **Daily burst never resets phase**: `_run_burst_for_user()` sets `current_phase = "generating"` then `"processing"` but never clears it to `None`. The Observatory would be stuck in LIVE mode forever after a daily burst.
3. **Stats always show 0**: `calculateStats()` pattern-matches against log messages that don't exist anymore.

The storage system is also partially broken:
- 4/5 upload sites silently swallow `StorageError` and store empty strings
- This creates "completed" jobs with blank media URLs → black thumbnails

## Part 1: Observatory Backend Fixes

### Fix 1: Atomic Phase Tracking (Backend)

**Problem**: Phase is tracked as a simple string on `MaestroState` (`current_phase`), but actual work happens in background daemon threads spawned by `_create_and_dispatch_job()`. The phase resets as soon as the main burst thread finishes dispatching, not when all jobs complete.

**Solution**: Track active job count alongside the phase.

File: `app/services/maestro/state.py`
- Add `_active_jobs: int = 0` counter to `MaestroState`
- Add `_phase_lock: threading.Lock()` for thread-safe updates
- Add methods:
  - `begin_phase(phase: str)` — sets `current_phase` and increments counter
  - `job_started()` — increments `_active_jobs`
  - `job_finished()` — decrements `_active_jobs`, if 0 → sets `current_phase = None`
  - `effective_phase` property — returns `current_phase` if `_active_jobs > 0`, else `None`

File: `app/services/maestro/maestro.py`
- In `run_smart_burst()`: Remove the `self.state.current_phase = None` from the `finally` block. Instead, the phase clears automatically when the last job finishes.
- In `_run_burst_for_user()`: Same — don't manually clear phase.

File: `app/services/maestro/proposals.py`
- In `_create_and_dispatch_job()`: Call `self.state.job_started()` before spawning the thread
- In `_process_and_schedule_job()`: Call `self.state.job_finished()` in a `finally` block after job completes

File: `app/services/maestro/state.py` → `to_dict()`
- Return `effective_phase` instead of raw `current_phase`

### Fix 2: Daily Burst Phase Reset (Backend)

File: `app/services/maestro/maestro.py`
- In `_run_daily_burst_for_user()` or `_run_burst_for_user()`: Add a `finally` block that acts as a fallback — if `_active_jobs == 0`, clear `current_phase`.

### Fix 3: Better Status Data (Backend)

File: `app/services/maestro/state.py` → `to_dict()`
- Add `active_jobs` count to the returned dict
- Add `burst_started_at` timestamp (set when phase begins)
- Add `burst_id` (a UUID per burst) so frontend can track individual bursts

File: `app/api/maestro/routes.py` → `/status` endpoint
- Already returns `maestro.get_status()` — the new fields flow through automatically

## Part 2: Observatory Frontend Redesign

### Current Problems:
1. Mode detection is fragile (falls back to log-based detection)
2. Stats calculation pattern-matches against nonexistent log patterns
3. "COMPLETE" is confusing — should show what was accomplished
4. Elapsed time tracks page open time, not burst duration
5. No visibility into individual job progress
6. Activity log messages aren't user-friendly enough

### Redesign Principles:
- **Backend is sole source of truth** for phase, timing, and progress
- **No log-based phase detection** — use `current_phase` only
- **Show what AI is doing** in plain English
- **Show individual job status** during processing
- **Elegant, simple, calming** — like watching a space mission control

### New Mode Logic:
```
if (maestro.current_phase) → LIVE mode (show what's happening)
if (maestro.current_phase === null && recent_burst_completed) → RECAP mode (show results, auto-dismiss after 30s)
if (!maestro.current_phase && no_recent_burst) → OVERVIEW mode (idle state, show next scheduled run)
if (forced === 'history') → HISTORY mode
```

No more `detectActiveCycle()` function. No more `calculatePhase()`. Only `maestro.current_phase`.

### New LIVE Mode Design:
Instead of just a phase label and log dump, show:
- Current phase in plain English: "AI is creating content for Healthy College..."
- Per-job progress cards: "Generating image... → Uploading... → Scheduling..."
- Agent avatars/names with what they're doing
- A simple progress indicator (X/Y jobs complete)

### New RECAP Mode:
- "Today's session complete" with actual results
- Jobs created, scheduled, failed
- Duration of the burst
- Auto-returns to overview after 30s

### Files to Change:
- `src/pages/Observatory.tsx` — Simplify mode detection, fix elapsed timer, improve LIVE/RECAP/OVERVIEW
- `src/features/mission-control/utils/statsCalculator.ts` — Remove log-based stat calculation, use backend data
- `src/features/mission-control/api/useMaestroLive.ts` — Update `MaestroLiveStatus` type for new fields

## Part 3: Storage Migration Completion

### Fix 4: Propagate All Upload Errors (Backend)

File: `app/services/content/job_processor.py`
- In `regenerate_brand()`: Change all 4 silent StorageError catches from `thumb_url = ""` to `raise Exception(...)` — same pattern as the background upload fix
- This ensures jobs fail fast on upload errors instead of creating broken posts

### Fix 5: Remove Railway Volume Dependencies

Search for and remove:
- Any references to `/app/output/` paths
- Dockerfile volume mounts for output
- `output/` directory usage for persistent storage
- Local file serving endpoints (if any)

All files should use `tempfile` exclusively and upload to Supabase.

### Fix 6: Storage Path Consistency

Ensure ALL uploads use user-scoped paths: `{user_id}/{brand_slug}/{category}/{filename}`
- thumbnails: `{user_id}/{brand}/thumbnails/{reel_id}_thumbnail.png`
- reels: `{user_id}/{brand}/reels/{reel_id}_reel.mp4`
- posts: `{user_id}/{brand}/posts/{job_id}_background.png`
- carousel: `{user_id}/{brand}/posts/{job_id}_slide_{n}.png`

## Implementation Order

### Phase A: Backend Stability (Critical)
1. Fix `MaestroState` with atomic job tracking
2. Fix `run_smart_burst()` and `_run_burst_for_user()` phase lifecycle
3. Fix `proposals.py` job dispatch with `job_started()`/`job_finished()`
4. Fix upload error propagation in `job_processor.py`
5. Build + push + test

### Phase B: Frontend Observatory Redesign
1. Update `MaestroLiveStatus` type
2. Simplify `detectMode()` to use only `current_phase`
3. Redesign LIVE mode with job progress
4. Redesign RECAP mode with actual results
5. Clean up unused log-based detection code
6. Build + push + test

### Phase C: Storage Cleanup
1. Remove Railway volume references
2. Verify all uploads use user-scoped Supabase paths
3. Build + push + test

## Risk Assessment

- **Phase A** is purely backend, no UI changes — low risk, high impact
- **Phase B** changes the Observatory UI — medium risk, should be tested manually
- **Phase C** is cleanup — low risk
