# Bug Analysis: Scheduling Flow & Timezone Errors

## Bug 1: Job Logged as "Scheduled" but Shows "Ready to Schedule"

### Symptom
Observatory log: `📅 Job complete + scheduled: Job GEN-636720 (from TOBY-265)`  
Jobs UI: Shows 1 job "Ready to Schedule" (not scheduled)

### Root Cause: Local File Existence Checks on Supabase URLs

The `auto_schedule_job()` function in `app/services/maestro/scheduler_logic.py` checks whether media files exist **on the local filesystem** before scheduling. But since the migration to Supabase storage, `video_path` and `thumbnail_path` are now **Supabase URLs** (e.g., `https://xxx.supabase.co/storage/v1/object/...`), not local paths. These URLs will never pass a local `Path.exists()` check, so **all brands are silently skipped**.

### Affected Code

**File: `app/services/maestro/scheduler_logic.py`**

**Lines ~59-68 (Reels – post variant check):**
```python
# Posts only need reel_id + thumbnail_path (no video)
if not reel_id:
    continue
# Verify thumbnail exists (strip query string from URL-style paths)
from pathlib import Path as _Path
if thumbnail_path:
    clean_thumb = thumbnail_path.split('?')[0]
    thumb_abs = _Path(clean_thumb.lstrip('/'))
    if not thumb_abs.exists():  # ❌ ALWAYS FALSE for Supabase URLs
        print(f"[AUTO-SCHEDULE] ⚠️ Post image missing for {brand}: {thumb_abs} — skipping", flush=True)
        continue
```

**Lines ~76-85 (Reels – reel variant check):**
```python
# Reels need reel_id + video_path
if not reel_id or not video_path:
    continue
# Verify files actually exist before scheduling (prevents "Video not found" errors)
from pathlib import Path as _Path
video_abs = _Path(video_path.lstrip('/'))
thumbnail_abs = _Path(thumbnail_path.lstrip('/')) if thumbnail_path else None
if not video_abs.exists():  # ❌ ALWAYS FALSE for Supabase URLs
    print(f"[AUTO-SCHEDULE] ⚠️ Video file missing for {brand}: {video_abs} — skipping", flush=True)
    continue
if thumbnail_abs and not thumbnail_abs.exists():  # ❌ ALWAYS FALSE
    print(f"[AUTO-SCHEDULE] ⚠️ Thumbnail missing for {brand}: {thumbnail_abs} — skipping", flush=True)
    continue
```

**Same issue in `schedule_all_ready_reels()` (same file, lines ~175-205)** — identical file existence checks.

### Why the Log Says "Scheduled" Anyway

**File: `app/services/maestro/proposals.py`, lines ~358-365**

```python
# Auto-schedule
auto_schedule_job(job_id)

self.state.log(
    agent_name, "Job complete + scheduled",
    f"Job {job_id} (from {proposal_id})",
    "📅"
)
```

The log is emitted **unconditionally** after calling `auto_schedule_job()`. The function doesn't return a success/failure status, and doesn't raise an exception when 0 brands are scheduled. It just prints to stdout and returns silently.

### How the UI Classifies "Ready to Schedule"

**File: `src/pages/History.tsx`, lines ~83-100**

The UI checks `brand_outputs[brand].status`:
- If status is `"completed"` → counted as "Ready to Schedule"
- If status is `"scheduled"` → counted as "Scheduled"

Since `auto_schedule_job()` never actually schedules anything (due to the file check failure), the brand outputs remain in `"completed"` status, and the UI correctly shows "Ready to Schedule".

### Proposed Fix

1. **In `scheduler_logic.py`**: Replace local file existence checks with URL validity checks. Since media is now stored in Supabase, check if the path is a URL (starts with `http://` or `https://`), and if so, skip the local file check. Only check local existence for non-URL paths (backward compatibility).

```python
# Instead of:
video_abs = _Path(video_path.lstrip('/'))
if not video_abs.exists():
    continue

# Do:
def _media_exists(path: str) -> bool:
    """Check if media path is valid — URL or local file."""
    if not path:
        return False
    if path.startswith("http://") or path.startswith("https://"):
        return True  # Supabase URL — assume valid
    return _Path(path.lstrip('/')).exists()
```

Apply this to all 4 file existence checks in `auto_schedule_job()` and all checks in `schedule_all_ready_reels()`.

2. **In `proposals.py`**: Make the log conditional on actual scheduling success. `auto_schedule_job` should return the count of scheduled brands, and the log should reflect reality.

---

## Bug 2: Timezone Naive vs Aware Datetime Error

### Symptom
```
❌ Learning analysis failed: toby: can't subtract offset-naive and offset-aware datetimes
❌ Learning analysis failed: lexi: can't subtract offset-naive and offset-aware datetimes
(same for raven, apex, hex)
```

### Root Cause: `datetime.utcnow()` (naive) vs PostgreSQL `timestamptz` (aware)

The `AgentLearningCycle` model uses `DateTime(timezone=True)` columns. PostgreSQL stores and returns these as **timezone-aware** datetimes. But the code creates naive datetimes with `datetime.utcnow()`.

The crash happens in **`_complete_cycle()`** and **`_fail_cycle()`** in `app/services/agent_learning_engine.py`.

### Detailed Trace

1. **`_start_cycle()`** (line ~361) creates a cycle with `started_at=datetime.utcnow()` (naive) and commits
2. After `db.commit()`, SQLAlchemy **expires** all attributes on the instance
3. When `_complete_cycle()` accesses `cycle.started_at`, SQLAlchemy **lazy-loads** from PostgreSQL → returns **timezone-aware** datetime
4. `cycle.completed_at = datetime.utcnow()` is timezone-**naive**
5. `(cycle.completed_at - cycle.started_at)` → **naive minus aware → TypeError!**

### Affected Code

**File: `app/services/agent_learning_engine.py`**

**`_complete_cycle()` (lines ~378-387):**
```python
def _complete_cycle(self, cycle: AgentLearningCycle, ...):
    cycle.status = 'completed'
    cycle.completed_at = datetime.utcnow()  # ❌ NAIVE
    cycle.duration_seconds = int((cycle.completed_at - cycle.started_at).total_seconds())
    #                             ^^^^^^^^^^^^ naive    ^^^^^^^^^^^^^^^^ aware (from DB)
    #                             → TypeError: can't subtract offset-naive and offset-aware datetimes
```

**`_fail_cycle()` (lines ~393-400):**
```python
def _fail_cycle(self, cycle: AgentLearningCycle, error: str):
    cycle.status = 'failed'
    cycle.completed_at = datetime.utcnow()  # ❌ NAIVE
    cycle.duration_seconds = int((cycle.completed_at - cycle.started_at).total_seconds())
    #                             Same error as above
```

**Note:** When `_complete_cycle` fails, the except block in `run_own_brand_analysis` calls `_fail_cycle`, which hits the **same bug** — creating a cascading failure.

**`_start_cycle()` (lines ~355-364):**
```python
cycle = AgentLearningCycle(
    ...
    started_at=datetime.utcnow()  # ❌ NAIVE — gets stored as aware in PostgreSQL
)
self.db.add(cycle)
self.db.commit()  # After this, started_at is expired and will be reloaded as aware
```

### Secondary Locations (same pattern, not yet crashing per logs)

**`consolidate_patterns()` (lines ~162-167):**
```python
now = datetime.utcnow()  # ❌ NAIVE
for pattern in patterns:
    days_old = (now - pattern.last_validated_at).total_seconds() / 86400
    #                 ^^^^^^^^^^^^^^^^^^^^^^^^^ aware (from DB)
    # → Same TypeError would occur here
```

**Other `datetime.utcnow()` usages** (these don't involve subtraction, so they don't crash but are still incorrect — they store naive datetimes where aware ones are expected):
- `_upsert_learned_pattern()`: `existing.last_validated_at = datetime.utcnow()` (line ~297)
- `_update_brand_memory()`: `memory.last_analysis_at = datetime.utcnow()` (line ~347)
- `_start_cycle()`: `started_at=datetime.utcnow()` (line ~360)
- `run_competitor_scrape()`: `comp.last_scraped_at = datetime.utcnow()` (line ~131)

### Model Confirmation

**File: `app/models/learning.py`**

`AgentLearningCycle`:
```python
started_at = Column(DateTime(timezone=True), nullable=False)
completed_at = Column(DateTime(timezone=True))
```

`LearnedPattern`:
```python
last_validated_at = Column(DateTime(timezone=True), ...)
```

All columns use `timezone=True`, confirming PostgreSQL returns timezone-aware values.

### Proposed Fix

Replace all `datetime.utcnow()` with `datetime.now(timezone.utc)` in `agent_learning_engine.py`:

```python
from datetime import datetime, timezone

# Every occurrence of:
datetime.utcnow()
# Should become:
datetime.now(timezone.utc)
```

This affects approximately 8 locations in the file. The `datetime.now(timezone.utc)` returns a timezone-**aware** datetime, making subtraction with DB-returned values safe.

---

## Summary

| Bug | Root Cause | Files to Change | Lines |
|-----|-----------|----------------|-------|
| Bug 1: Scheduling | Local file checks fail on Supabase URLs | `app/services/maestro/scheduler_logic.py` | ~59-85 (auto_schedule_job), ~175-205 (schedule_all_ready_reels) |
| Bug 1: False log | Log emitted unconditionally | `app/services/maestro/proposals.py` | ~358-365 |
| Bug 2: Timezone | `datetime.utcnow()` creates naive datetimes, DB returns aware | `app/services/agent_learning_engine.py` | ~162, ~297, ~347, ~360, ~378, ~393 + import |
