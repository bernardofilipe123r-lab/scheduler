# Stuck Jobs Research — GEN-981548

## Root Cause: CONFIRMED

**The Maestro removal broke job processing.** Jobs are created but the background task that processes them crashes immediately on startup due to a missing import.

---

## 1. How Jobs Were Previously Processed

The flow is entirely in `app/api/content/jobs_routes.py`:

1. **User creates job** via `POST /jobs/create` → `create_job()` endpoint (line 124)
2. `JobManager.create_job()` inserts a DB record with `status="pending"`
3. **Immediately**, FastAPI's `BackgroundTasks` dispatches processing:
   ```python
   background_tasks.add_task(process_job_async, job_id)
   ```
4. `process_job_async()` (line 52) runs in a background thread, calls `JobProcessor.process_job(job_id)`

**Maestro was NOT the dispatcher for UI-created jobs.** The `/jobs/create` endpoint has always used FastAPI `BackgroundTasks` directly. Maestro ran its own separate daily burst flow via proposals.

---

## 2. What Was Removed That Broke It

The `process_job_async()` function at line 52-110 of `jobs_routes.py` contains:

```python
def process_job_async(job_id: str):
    from app.services.maestro.maestro import _job_semaphore   # ← LINE 56: THIS IMPORT FAILS
    
    _job_semaphore.acquire()   # concurrency limiter
    try:
        with get_db_session() as db:
            processor = JobProcessor(db)
            result = processor.process_job(job_id)
    finally:
        _job_semaphore.release()
```

The directory `app/services/maestro/` **no longer exists**. The import on line 56 raises `ModuleNotFoundError`, which:
- Crashes the background task silently (FastAPI BackgroundTasks swallows exceptions)
- The job stays at `status="pending"` / 0% forever
- No error is logged because the crash happens BEFORE the try/except block

---

## 3. The Fix

**Replace the maestro semaphore with a local threading.Semaphore in `jobs_routes.py`.**

The semaphore was just a concurrency limiter (max 2 concurrent generations). It can be trivially recreated:

### File: `app/api/content/jobs_routes.py`

**Change at line 52-56:**

FROM:
```python
def process_job_async(job_id: str):
    """Background task to process a job (with concurrency control)."""
    import traceback
    import sys
    from app.services.maestro.maestro import _job_semaphore
```

TO:
```python
import threading

# Concurrency limiter — max 2 jobs generating simultaneously
_job_semaphore = threading.Semaphore(2)


def process_job_async(job_id: str):
    """Background task to process a job (with concurrency control)."""
    import traceback
    import sys
```

This is the **only change needed**. The semaphore variable name and acquire/release calls stay identical.

### Also check: `app/services/maestro/proposals.py`

This file also imports from maestro (`_job_semaphore`, `JOB_STAGGER_DELAY`), but since the entire maestro directory is deleted, this file shouldn't exist either. If it's still referenced somewhere, those references would also need cleanup — but they're not on the critical path for user-initiated job processing.

---

## 4. Verification

After the fix:
1. Create a new job via UI → should immediately start processing (status changes to "generating")
2. Check Railway logs for `🚀 BACKGROUND TASK STARTED` and `🎬 process_job called for: ...`
3. Job should progress through percentage updates and complete

---

## Summary

| Question | Answer |
|----------|--------|
| What triggered job processing? | `BackgroundTasks.add_task(process_job_async, job_id)` in the `/jobs/create` endpoint |
| What broke? | `process_job_async()` imports `_job_semaphore` from deleted `app.services.maestro.maestro` module |
| Why does it fail silently? | FastAPI BackgroundTasks swallows exceptions; the import crashes before the try/except |
| Fix complexity | **1 line change** — replace the import with a local `threading.Semaphore(2)` |
