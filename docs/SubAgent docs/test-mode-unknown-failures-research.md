# Test Mode "Unknown" Failures — Root Cause Analysis

## Summary

When a test burst is triggered from the Observatory UI (e.g., 1 post for healthycollege), the job consistently fails with **"unknown (max 2 retries exhausted): Unknown failure — attempting one retry"**. The "unknown" classification means the actual exception message doesn't match any of the known failure categories in the healing diagnosis engine. The error is being swallowed or not propagated properly, making it invisible.

---

## Complete Flow: Test Trigger → Job Creation → Failure

### 1. UI Trigger → API Route

**File:** [app/api/maestro/routes.py](../../app/api/maestro/routes.py) — `trigger_burst` endpoint (line ~160)

The Observatory UI sends `POST /api/maestro/trigger-burst` with body:
```json
{ "test_mode": true, "posts": 1, "reels": 0, "brands": ["healthycollege"] }
```

The route detects `request.posts > 0` and calls:
```python
background_tasks.add_task(
    maestro.run_smart_burst,
    request.reels,     # 0
    request.posts,     # 1
    user_id,
    target_brands      # ["healthycollege"]
)
```

Log: `"🧪 Test Mode: Creating 1 post for healthycollege"`

### 2. Smart Burst → Proposal Generation

**File:** [app/services/maestro/maestro.py](../../app/services/maestro/maestro.py) — `run_smart_burst()` (line ~320)

The smart burst:
1. Loads active agents via `get_all_active_agents(user_id)`
2. Since `remaining_posts = 1` and `brands = ["healthycollege"]`, it assigns 1 post to 1 agent
3. Calls `agent.run(max_proposals=1, content_type="post", brand="healthycollege")`
4. The agent calls DeepSeek API to generate a proposal, saves it to `agent_proposals` table
5. Returns the proposal dict

### 3. Auto-Accept → Job Creation → Processing

**File:** [app/services/maestro/proposals.py](../../app/services/maestro/proposals.py) — `_auto_accept_and_process()` (line ~20)

For each proposal:
1. **Examiner quality gate** (`examine_proposal()`) — DeepSeek scores the proposal
2. If passed → accept, create job via `_create_and_dispatch_job()`
3. Job is created via `JobManager.create_job()` with `variant="post"`, `brands=["healthycollege"]`
4. Processing dispatched in background thread via `_process_and_schedule_job()`

### 4. Job Processing (WHERE THE FAILURE OCCURS)

**File:** [app/services/maestro/proposals.py](../../app/services/maestro/proposals.py) — `_process_and_schedule_job()` (line ~160)

```python
def _process_and_schedule_job(self, job_id, proposal_id, agent_name):
    _job_semaphore.acquire()
    try:
        with get_db_session() as pdb:
            p = JobProcessor(pdb)
            p.process_job(job_id)   # ← THIS IS WHERE IT FAILS
        auto_schedule_job(job_id)
    except Exception as e:
        self.state.log("maestro", "Job error", f"{job_id}: {str(e)[:200]}", "❌")
        traceback.print_exc()
    finally:
        _job_semaphore.release()
```

**CRITICAL BUG:** When `process_job()` fails, the exception is caught and logged, but **the job status is NOT explicitly set to "failed" here**. The job status update happens INSIDE `process_job()` itself.

### 5. Inside `process_job()` for POST variant

**File:** [app/services/content/job_processor.py](../../app/services/content/job_processor.py) — `process_job()` (line ~310)

For `variant == "post"`:
1. Creates a `ContentGenerator` instance
2. Calls `cg.generate_post_titles_batch(total_brands, topic_hint)` — generates unique post content via DeepSeek API
3. Stores per-brand content (title, caption, ai_prompt, slide_texts) in `brand_outputs`
4. For each brand, calls `process_post_brand(job_id, brand)` with a timeout thread

### 6. Inside `process_post_brand()`

**File:** [app/services/content/job_processor.py](../../app/services/content/job_processor.py) — `process_post_brand()` (line ~255)

This is where the **AI background image** is generated:
1. Creates `AIBackgroundGenerator()` — **THIS CAN FAIL** if `DEAPI_API_KEY` is not set (raises `ValueError`)
2. Calls `generator.generate_post_background(brand_name, user_prompt)` — calls deAPI
3. Saves result to temp file, uploads to Supabase
4. Updates brand output with URLs

---

## Where "Unknown" Error Classification Happens

**File:** [app/services/maestro/healing.py](../../app/services/maestro/healing.py) — `_diagnose_failure()` (line ~145)

The healing cycle runs every 15 minutes and scans for failed jobs. For each failed job, it classifies the error:

```python
def _diagnose_failure(self, job) -> Dict:
    error = (job.error_message or "").lower()
    
    if "job_timeout" in error: return "job_timeout" (retryable)
    if "error while opening encoder" in error: return "ffmpeg_encoder" (retryable)
    if "resource temporarily unavailable" in error: return "ffmpeg_resource" (retryable)
    if "cannot allocate memory" in error: return "ffmpeg_memory" (retryable)
    if "ffmpeg" or "video" in error: return "ffmpeg_other" (retryable)
    if "api" or "timeout" or "connection" in error: return "api_error" (retryable)
    if "content_lines" or "empty" in error: return "content_error" (not retryable)
    if "file not found" in error: return "file_not_found" (not retryable)
    
    # FALLBACK — THIS IS THE "unknown" CATEGORY
    return {
        "category": "unknown",
        "retryable": True,
        "suggested_action": "Unknown failure — attempting one retry",
    }
```

The "unknown" category means the `job.error_message` doesn't contain any of the recognized keywords. This happens when:
- The error message is `None` or empty
- The error message contains an unrecognized error type

### The Healing Cycle Logging

When `_healing_cycle()` processes a failed job with `retry_count >= MAX_AUTO_RETRIES (2)`:

```python
reason = f"{reason} (max {MAX_AUTO_RETRIES} retries exhausted)"
self.state.log(
    "maestro", "🩺 Permanent Failure",
    f"{job.job_id} — {reason}: {diagnosis['suggested_action']}",
    "🚨"
)
```

This produces the exact log message:
`"🚨 🩺 Permanent Failure: GEN-XXXXX — unknown (max 2 retries exhausted): Unknown failure — attempting one retry"`

---

## Root Cause Analysis: WHY "unknown"?

### Hypothesis 1: DEAPI_API_KEY Not Set (MOST LIKELY)

**File:** [app/services/media/ai_background.py](../../app/services/media/ai_background.py) — `__init__()` (line ~35)

```python
def __init__(self):
    api_key = os.getenv("DEAPI_API_KEY")
    if not api_key:
        raise ValueError("DEAPI_API_KEY not found in environment variables")
```

If `DEAPI_API_KEY` is missing from the Railway environment, `AIBackgroundGenerator()` raises `ValueError`. This gets caught by `process_post_brand()`:

```python
except Exception as e:
    error_msg = f"{type(e).__name__}: {str(e)}"  
    # → "ValueError: DEAPI_API_KEY not found in environment variables"
```

Then in `process_job()`, the post processing catches this in the outer try/except:
```python
except Exception as e:
    self._manager.update_job_status(job_id, "failed", error_message=str(e))
```

The error message `"ValueError: DEAPI_API_KEY not found in environment variables"` doesn't contain any of the keywords checked by `_diagnose_failure()` (no "api", "timeout", "connection", "ffmpeg", etc.), so it's classified as **"unknown"**.

**Wait — actually "DEAPI_API_KEY" does NOT contain "api" after `.lower()`... it does! "deapi_api_key" contains "api"!** So this would match `api_error`, not `unknown`.

Let me re-examine the diagnosis code more carefully:

```python
if any(k in error for k in ["api", "timeout", "connection", "rate limit", "503", "502", "429"]):
    return {"category": "api_error", ...}
```

`"valueerror: deapi_api_key not found in environment variables"` — YES, this contains "api" (in "deapi_api_key"). So this would be classified as `api_error`, NOT `unknown`.

### Hypothesis 2: DeepSeek API Failure During Content Generation (LIKELY)

**File:** [app/services/content/generator.py](../../app/services/content/generator.py) — `generate_post_titles_batch()` (line ~480)

Before the AI background is generated, `process_job()` calls `cg.generate_post_titles_batch()` to generate the post content. If DeepSeek fails here, the fallback `_fallback_post_title()` is used — this shouldn't cause a failure.

BUT — if the ContentGenerator itself fails to initialize (e.g., no `DEEPSEEK_API_KEY`), it falls back gracefully. So this isn't the issue.

### Hypothesis 3: Error Message is Empty/None (MOST LIKELY)

Looking more carefully at the flow in `_process_and_schedule_job()`:

```python
def _process_and_schedule_job(self, job_id, proposal_id, agent_name):
    _job_semaphore.acquire()
    try:
        with get_db_session() as pdb:
            p = JobProcessor(pdb)
            p.process_job(job_id)
        auto_schedule_job(job_id)
    except Exception as e:
        self.state.log("maestro", "Job error", f"{job_id}: {str(e)[:200]}", "❌")
        traceback.print_exc()
    finally:
        _job_semaphore.release()
```

**KEY OBSERVATION:** The exception is caught and logged, but **`update_job_status(job_id, "failed", error_message=...)` is NOT called here**. The job status update to "failed" only happens INSIDE `process_job()`.

Now look inside `process_job()` for the POST variant (line ~310):

```python
if job.variant == "post":
    try:
        # ... content generation and processing ...
        all_ok = all(r.get("success") for r in results.values())
        any_ok = any(r.get("success") for r in results.values())
        final_status = "completed" if all_ok else ("completed" if any_ok else "failed")
        self._manager.update_job_status(job_id, final_status, progress_percent=100)
        return {"success": any_ok, "results": results}
    except Exception as e:
        traceback.print_exc()
        self._manager.update_job_status(job_id, "failed", error_message=str(e))
        return {"success": False, "error": str(e)}
```

If the exception occurs BEFORE the inner try/except (e.g., during ContentGenerator initialization), the error_message would be set. But what if:

1. `process_post_brand()` fails for healthycollege
2. It returns `{"success": False, "error": "..."}`
3. `all_ok = False`, `any_ok = False` → `final_status = "failed"`
4. `update_job_status(job_id, "failed", progress_percent=100)` — **NO error_message passed!**

**THIS IS THE BUG.** When all brands fail, the code calls:
```python
self._manager.update_job_status(job_id, final_status, progress_percent=100)
```

**Without passing `error_message`!** The error details are in the per-brand results but not propagated to the job-level status.

Let me trace this more carefully. After the POST variant loop:

```python
all_ok = all(r.get("success") for r in results.values())
any_ok = any(r.get("success") for r in results.values())
final_status = "completed" if all_ok else ("completed" if any_ok else "failed")
self._manager.update_job_status(job_id, final_status, progress_percent=100)
```

When `final_status = "failed"`, `error_message` is NOT passed. The job goes to `status="failed"` with `error_message=None`.

Then the healing cycle picks it up:
```python
error = (job.error_message or "").lower()  # → ""
```

An empty string doesn't match ANY of the diagnosis patterns, so it falls through to:
```python
return {"category": "unknown", ...}
```

**This is the root cause.**

### Hypothesis 4: deAPI Rate Limit / Daily Limit

**File:** [app/services/media/ai_background.py](../../app/services/media/ai_background.py) — `_request_with_retry()` (line ~65)

The deAPI has a daily limit of 200 requests on the free tier. If exceeded:
```python
raise RuntimeError(
    f"DEAPI daily limit reached (200 requests/day on free tier). "
    f"Resets in ~{hours_until_reset:.1f} hours. ..."
)
```

This error message contains "daily limit reached" which doesn't match any healing diagnosis keywords ("api" is there but in "deapi" which... does contain "api" actually). So this would be classified as `api_error`.

### Hypothesis 5: Network Error to deAPI

```python
except requests.exceptions.RequestException as e:
    raise RuntimeError(f"Network error: {str(e)}")
```

"Network error" doesn't contain "api", "timeout", or "connection" keywords. Wait — it might contain "connection" if the underlying error is a `ConnectionError`. But `RuntimeError(f"Network error: ...")` wraps it. If the original error message is `"Network error: ConnectionRefusedError(...)"`, the `.lower()` would contain "connection" → classified as `api_error`.

But if it's just `"Network error: ..."` without "connection", it would be `unknown`.

---

## The Exact Bug Location

### Primary Bug: Missing error_message in POST variant failure path

**File:** [app/services/content/job_processor.py](../../app/services/content/job_processor.py)  
**Line:** ~370-375 (inside `process_job()` POST variant)

```python
# BUG: When all brands fail, error_message is NOT propagated to job status
all_ok = all(r.get("success") for r in results.values())
any_ok = any(r.get("success") for r in results.values())
final_status = "completed" if all_ok else ("completed" if any_ok else "failed")
self._manager.update_job_status(job_id, final_status, progress_percent=100)
# ↑ Missing: error_message parameter when final_status == "failed"
```

**Fix:**
```python
if all_ok:
    self._manager.update_job_status(job_id, "completed", progress_percent=100)
elif any_ok:
    failed_brands = [b for b, r in results.items() if not r.get("success")]
    self._manager.update_job_status(
        job_id, "completed",
        f"Completed with errors: {', '.join(failed_brands)}",
        100
    )
else:
    # All brands failed — propagate the actual error
    errors = [r.get("error", "Unknown error") for r in results.values() if r.get("error")]
    error_msg = errors[0] if errors else "All brands failed to generate"
    self._manager.update_job_status(job_id, "failed", error_message=error_msg)
```

### Secondary Issue: The REEL variant handles this correctly but POST doesn't

Compare the REEL variant code (line ~430):
```python
if all_success:
    self._manager.update_job_status(job_id, "completed", "All brands generated!", 100)
elif any_success:
    failed_brands = [b for b, r in results.items() if not r.get("success")]
    self._manager.update_job_status(job_id, "completed", f"Completed with errors...", 100)
else:
    # All brands failed
    errors = [r.get("error", "Unknown error") for r in results.values() if r.get("error")]
    error_msg = errors[0] if errors else "All brands failed to generate"
    self._manager.update_job_status(job_id, "failed", error_message=error_msg)  # ✅ CORRECT
```

The REEL variant DOES propagate error messages. The POST variant does NOT.

---

## What's Actually Causing the POST to Fail?

Even with the error propagation fixed, we need to know WHY the post generation is failing. The most likely causes:

### 1. `DEAPI_API_KEY` Environment Variable Missing
- `AIBackgroundGenerator.__init__()` raises `ValueError`
- This is the most common reason for post failures on new deployments

### 2. deAPI Daily Rate Limit (200 requests/day on free tier)
- `_request_with_retry()` raises `RuntimeError("DEAPI daily limit reached...")`
- After a full burst of 30+ posts, the limit is easily hit

### 3. deAPI 429 Rate Limit (per-minute/per-second)
- After `MAX_RETRIES` (5) attempts with exponential backoff, raises `RuntimeError`

### 4. Network Timeout to deAPI
- `requests.exceptions.Timeout` → `RuntimeError("Network timeout: ...")`

### 5. deAPI Generation Failure
- Status polling returns `"failed"` → `RuntimeError("HQ generation failed: ...")`

### 6. deAPI Generation Timeout
- 120 polling attempts × 2s = 4min → `RuntimeError("HQ generation timed out...")`

---

## Code Paths Summary

```
Observatory UI → POST /api/maestro/trigger-burst
    │
    ├─ routes.py:L160 → maestro.run_smart_burst(0, 1, user_id, ["healthycollege"])
    │
    ├─ maestro.py:L320 → run_smart_burst()
    │   ├─ Loads agents via get_all_active_agents()
    │   ├─ Agent generates 1 post proposal via agent.run(content_type="post")
    │   │   └─ generic_agent.py → _call_ai_and_save() → DeepSeek API → saves to DB
    │   ├─ _auto_accept_and_process(proposals)
    │   │   └─ proposals.py:L20 → examine_proposal() → accept → _create_and_dispatch_job()
    │   │       ├─ Creates GenerationJob (variant="post", brands=["healthycollege"])
    │   │       └─ Spawns thread → _process_and_schedule_job()
    │   │           └─ proposals.py:L160 → JobProcessor.process_job()
    │   │               ├─ job_processor.py:L310 → POST variant branch
    │   │               │   ├─ ContentGenerator.generate_post_titles_batch(1)  ← DeepSeek
    │   │               │   ├─ Stores per-brand content in brand_outputs
    │   │               │   └─ process_post_brand("healthycollege")
    │   │               │       ├─ AIBackgroundGenerator()  ← CAN FAIL (no DEAPI_API_KEY)
    │   │               │       ├─ generate_post_background()  ← CAN FAIL (rate limit, timeout)
    │   │               │       ├─ upload_from_path()  ← CAN FAIL (StorageError)
    │   │               │       └─ Returns {"success": False, "error": "..."} on failure
    │   │               │
    │   │               └─ ALL BRANDS FAILED:
    │   │                   update_job_status("failed", progress_percent=100)
    │   │                   ↑ BUG: error_message NOT passed! → job.error_message = None
    │   │
    │   └─ Healing cycle (every 15min)
    │       ├─ healing.py:L30 → Finds failed jobs
    │       ├─ _diagnose_failure() → error_message is "" → falls to "unknown"
    │       ├─ Retry #1: resets job, re-processes → fails again (same underlying issue)
    │       ├─ Retry #2: resets job, re-processes → fails again
    │       └─ retry_count >= MAX_AUTO_RETRIES (2):
    │           Logs "🚨 🩺 Permanent Failure: GEN-XXXXX — unknown (max 2 retries exhausted)"
```

---

## Proposed Fixes

### Fix 1: Propagate error_message in POST variant (CRITICAL)

**File:** `app/services/content/job_processor.py` — `process_job()` POST branch (~L370)

Change:
```python
final_status = "completed" if all_ok else ("completed" if any_ok else "failed")
self._manager.update_job_status(job_id, final_status, progress_percent=100)
```

To:
```python
if all_ok:
    self._manager.update_job_status(job_id, "completed", progress_percent=100)
elif any_ok:
    failed_brands = [b for b, r in results.items() if not r.get("success")]
    self._manager.update_job_status(
        job_id, "completed",
        current_step=f"Completed with errors: {', '.join(failed_brands)}",
        progress_percent=100,
    )
else:
    errors = [r.get("error", "Unknown error") for r in results.values() if r.get("error")]
    error_msg = errors[0] if errors else "All brands failed to generate"
    self._manager.update_job_status(job_id, "failed", error_message=error_msg)
```

### Fix 2: Add "deapi" and "valueerror" to healing diagnosis

**File:** `app/services/maestro/healing.py` — `_diagnose_failure()` (~L145)

Add before the "unknown" fallback:
```python
# DEAPI / image generation errors
if any(k in error for k in ["deapi", "background", "image generation", "hq generation"]):
    return {
        "category": "deapi_error",
        "retryable": True,
        "suggested_action": "AI image generation failed — retrying",
    }

# Storage/upload errors
if any(k in error for k in ["storage", "upload", "supabase"]):
    return {
        "category": "storage_error",
        "retryable": True,
        "suggested_action": "File storage/upload failed — retrying",
    }

# Configuration errors (missing env vars, etc.)
if any(k in error for k in ["not found in environment", "not configured", "missing config"]):
    return {
        "category": "config_error",
        "retryable": False,
        "suggested_action": "Missing configuration — check environment variables",
    }
```

### Fix 3: Fallback error capture in `_process_and_schedule_job()`

**File:** `app/services/maestro/proposals.py` — `_process_and_schedule_job()` (~L160)

Add a job status update in the except block:
```python
except Exception as e:
    self.state.log("maestro", "Job error", f"{job_id}: {str(e)[:200]}", "❌")
    traceback.print_exc()
    # Ensure job is marked as failed with the actual error
    try:
        from app.db_connection import get_db_session
        from app.services.content.job_manager import JobManager
        with get_db_session() as edb:
            m = JobManager(edb)
            job = m.get_job(job_id)
            if job and job.status != "failed":
                m.update_job_status(job_id, "failed", error_message=str(e)[:500])
    except Exception:
        pass
```

### Fix 4: Check DEAPI_API_KEY availability before attempting generation

In `process_post_brand()`, add an early check:
```python
if not os.getenv("DEAPI_API_KEY"):
    error_msg = "DEAPI_API_KEY not configured — cannot generate AI backgrounds"
    self._manager.update_brand_output(job_id, brand, {"status": "failed", "error": error_msg})
    return {"success": False, "error": error_msg}
```

---

## Priority Order

1. **Fix 1** (CRITICAL) — Propagate error_message in POST failure path. This is the direct cause of "unknown" errors.
2. **Fix 3** (HIGH) — Fallback error capture in `_process_and_schedule_job()` to catch any case where process_job() doesn't set the error.
3. **Fix 2** (MEDIUM) — Better healing diagnosis categories for deAPI and storage errors.
4. **Fix 4** (LOW) — Early DEAPI_API_KEY check for faster failures.

---

## How to Verify the Actual Root Cause

To confirm what's actually failing under the "unknown" classification, check Railway logs for the test burst period. Look for:
- `❌ Failed:` messages from `process_post_brand()`
- `DEAPI_API_KEY not found` errors
- `RuntimeError` stack traces
- Any `429` or timeout errors from deAPI

The fix to propagate error messages (Fix 1) will make all future failures clearly visible in the healing log instead of showing "unknown".
