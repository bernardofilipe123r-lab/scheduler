# Pipeline Architecture — Human-in-the-Loop Approval System

> **Status:** Architecture Plan (Pre-Implementation)  
> **Date:** 2026-03-11  
> **Author:** Filipe + Claude  
> **Trigger:** Meta ToS compliance — transform ViralToby from "AI-autonomous" to "AI-assisted"

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [Content Lifecycle State Machine](#4-content-lifecycle-state-machine)
5. [Data Model Changes](#5-data-model-changes)
6. [Backend Architecture](#6-backend-architecture)
7. [Auto-Scheduling Algorithm](#7-auto-scheduling-algorithm)
8. [Frontend Architecture — Pipeline Page](#8-frontend-architecture--pipeline-page)
9. [React Tooling & Component Spec](#9-react-tooling--component-spec)
10. [Notification System](#10-notification-system)
11. [AI Content Labeling](#11-ai-content-labeling)
12. [Rejection & Regeneration Flow](#12-rejection--regeneration-flow)
13. [DB Cleanup Policy](#13-db-cleanup-policy)
14. [Migration & Rollout Plan](#14-migration--rollout-plan)
15. [Landing Page (Deferred)](#15-landing-page-deferred)
16. [File-by-File Change Map](#16-file-by-file-change-map)

---

## 1. Executive Summary

Insert a **mandatory human approval gate** between content generation and publishing. Toby still does 95% of the work (generation, scoring, media rendering), but the user must explicitly approve each piece before it enters the publish queue. Content sits in a **Pipeline** — a new `/pipeline` route — where users review, approve, or reject items in a clean, mobile-friendly interface with platform-native content previews.

**Key decisions (from Q&A):**

| Decision | Answer |
|----------|--------|
| Manual creations also go to pipeline? | **Yes** — all content passes through approval |
| Preview style | **Single preview per card** (no per-platform tabs), extreme design quality |
| Email service | **Supabase Auth mailer** |
| AI content labeling | **API metadata flag only** (no visible caption text) |
| Rejection behavior | No auto-regen. Count missing slots, propose "Toby generates X more?" |
| Scheduled time at creation? | **No.** Content has no time until approved. Auto-scheduler assigns slots on approval |
| Expiry policy | Delete pending items after 1 month of inactivity |
| Landing page | **Deferred** — separate agent, after UI is built + video captured for Meta review |

---

## 2. Problem Statement

Meta's Platform Terms flag three things ViralToby currently does:

1. **Fully autonomous publishing** — no human in the loop per post
2. **Multi-account management** from one platform with identical patterns
3. **AI-generated content without API-level labeling**

The combination reads as "Coordinated Inauthentic Behavior" (CIB) to Meta's enforcement systems. They can revoke API access and ban all test accounts at their discretion.

**The fix is structural, not cosmetic.** Adding an approval gate makes ViralToby provably "AI-assisted" — every published post has a human approval event linked to it.

---

## 3. Solution Overview

### Current Flow (DANGEROUS)

```
Toby generates → quality score → media pipeline → schedule_reel(status="scheduled") → auto-publishes at time
                                                    ↑ NO HUMAN TOUCH
```

### New Flow (COMPLIANT)

```
Toby generates → quality score → media pipeline → GenerationJob(pipeline_status="pending")
                                                           ↓
                                                   User reviews in /pipeline
                                                    ↙              ↘
                                              ✅ Approve          ❌ Reject
                                                    ↓                  ↓
                                        auto-schedule_reel()    Mark rejected
                                        (assigns next slot)     (count for regen prompt)
                                                    ↓
                                              Calendar filled
                                                    ↓
                                           Auto-publish at time
```

### Manual Creation Flow (also through pipeline)

```
User creates in /creation → GenerationJob created → background processing → pipeline_status="pending"
                                                                                    ↓
                                                                          User goes to /pipeline
                                                                           ↙              ↘
                                                                     ✅ Approve      ❌ Reject
                                                                           ↓
                                                                  auto-schedule → Calendar
```

**Critical insight:** Content in the pipeline has **no scheduled time**. It's just rendered media waiting for approval. Time slots are assigned ONLY when the user approves. This is simpler, cleaner, and avoids stale time slots sitting in the DB.

---

## 4. Content Lifecycle State Machine

```
                ┌──────────────────┐
                │   GenerationJob  │
                │  status: pending │ (processing media)
                └────────┬─────────┘
                         │ media pipeline completes
                         ▼
                ┌──────────────────┐
                │   GenerationJob  │
                │ status: completed│  ← pipeline_status: "pending"
                │ pipeline: pending│
                └───────┬──┬───────┘
                        │  │
                 ✅ Approve  ❌ Reject
                        │     │
                        ▼     ▼
              ┌──────────┐  ┌───────────┐
              │ pipeline: │  │ pipeline: │
              │ "approved"│  │ "rejected"│
              └─────┬─────┘  └───────────┘
                    │
        auto-scheduler assigns
         next available slot
                    │
                    ▼
              ┌──────────────┐
              │ ScheduledReel│
              │ status:      │
              │ "scheduled"  │
              └──────┬───────┘
                     │ time is due
                     ▼
              ┌──────────────┐
              │ ScheduledReel│
              │ status:      │
              │ "publishing" │
              └──────┬───────┘
                     │
              ┌──────┴──────┐
              ▼             ▼
        ┌──────────┐  ┌──────────┐
        │PUBLISHED │  │  FAILED  │
        └──────────┘  └──────────┘
```

**Key separation of concerns:**

- `GenerationJob` = content + media + approval status (the "what")
- `ScheduledReel` = time slot + publish status (the "when")
- Pipeline operates ONLY on GenerationJob
- Calendar/publishing operates ONLY on ScheduledReel
- The bridge is the approval action: approve GenerationJob → create ScheduledReel

---

## 5. Data Model Changes

### 5.1 GenerationJob — New Columns

**File:** `app/models/jobs.py`

```python
# Pipeline approval columns
pipeline_status = Column(String(20), nullable=True, index=True)
# Values: NULL (legacy, pre-pipeline), 'pending', 'approved', 'rejected'

pipeline_reviewed_at = Column(DateTime(timezone=True), nullable=True)
# When user approved or rejected

caption = Column(Text, nullable=True)
# Editable caption — user can modify before approving
# (For Toby content, set from generator output)

pipeline_batch_id = Column(String(36), nullable=True, index=True)
# Groups items from the same Toby generation burst
# Used for: "batch complete?" detection, bulk operations, stats

quality_score = Column(Integer, nullable=True)
# Toby's critic ensemble score (for display in pipeline card)
```

**Index:**

```sql
CREATE INDEX IF NOT EXISTS ix_gen_jobs_pipeline_status ON generation_jobs (pipeline_status)
    WHERE pipeline_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_gen_jobs_user_pipeline ON generation_jobs (user_id, pipeline_status)
    WHERE pipeline_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_gen_jobs_batch ON generation_jobs (pipeline_batch_id)
    WHERE pipeline_batch_id IS NOT NULL;
```

**Why GenerationJob and not a new table?**

GenerationJob already has everything needed for the pipeline card:
- `title` — the content title
- `brand_outputs` → per-brand `thumbnail_path`, `video_path`, `reel_id`, `carousel_paths`
- `variant` — light/dark/format_b/post/threads
- `content_format` — format_a/format_b
- `content_lines` — the slide text
- `platforms` — target platforms
- `brands` — which brands
- `created_by` — "toby" or "user"

Adding 4 columns to an existing table is dramatically simpler than creating a new table + joins.

### 5.2 TobyState — New Columns

**File:** `app/models/toby.py`

```python
# Pipeline notification tracking
last_pipeline_notification_at = Column(DateTime(timezone=True), nullable=True)
pipeline_notification_interval_hours = Column(Integer, default=24)
```

### 5.3 TobyBrandConfig — No Changes

`buffer_days` already exists on `TobyState` (range validated 1–7 in schema). We extend range to 1–10.

### 5.4 Migration SQL

**File:** `migrations/add_pipeline_approval.sql`

```sql
-- Pipeline approval system for Meta ToS compliance
-- Adds human-in-the-loop approval gate between content generation and scheduling

-- 1. Pipeline columns on generation_jobs
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS pipeline_status VARCHAR(20);
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS pipeline_reviewed_at TIMESTAMPTZ;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS pipeline_batch_id VARCHAR(36);
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS quality_score INTEGER;

-- 2. Indexes for pipeline queries
CREATE INDEX IF NOT EXISTS ix_gen_jobs_pipeline_status
    ON generation_jobs (pipeline_status) WHERE pipeline_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_gen_jobs_user_pipeline
    ON generation_jobs (user_id, pipeline_status) WHERE pipeline_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_gen_jobs_batch
    ON generation_jobs (pipeline_batch_id) WHERE pipeline_batch_id IS NOT NULL;

-- 3. Notification tracking on toby_state
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS last_pipeline_notification_at TIMESTAMPTZ;
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS pipeline_notification_interval_hours INTEGER DEFAULT 24;

-- 4. Extend buffer_days validation range (handled in app code, not DB constraint)
-- Current: ge=1, le=7 in schemas.py → change to ge=1, le=10

-- 5. Verification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'generation_jobs'
  AND column_name IN ('pipeline_status', 'pipeline_reviewed_at', 'caption', 'pipeline_batch_id', 'quality_score')
ORDER BY column_name;
```

---

## 6. Backend Architecture

### 6.1 Toby Orchestrator Changes

**File:** `app/services/toby/orchestrator.py`

**`_execute_content_plan()` — the critical change (currently ~line 472):**

Currently this function:
1. Generates text content (DeepSeek)
2. Creates GenerationJob
3. Runs media pipeline (images/video)
4. Calls `schedule_reel()` → creates ScheduledReel with `status="scheduled"`

**New behavior:**
1. Generates text content (DeepSeek) — unchanged
2. Creates GenerationJob — add `pipeline_status="pending"`, `caption=<generated>`, `quality_score=<critic_score>`, `pipeline_batch_id=<batch_id>`
3. Runs media pipeline — unchanged
4. **STOP HERE.** Do NOT call `schedule_reel()`. The content sits in GenerationJob awaiting approval.

**Batch ID generation (new):**

At the start of each buffer check (in `_run_buffer_check()`), generate a `batch_id = str(uuid4())[:8]`. Pass it through to every `_execute_content_plan()` call in that tick. All items generated in the same burst share a batch_id. This enables:
- Pipeline UI: "Show items from this generation batch"
- Stats: "This batch has 42 items, 38 approved, 4 rejected"
- Notification: "Toby prepared batch X with Y items"

**Buffer manager change (`buffer_manager.py`):**

Currently `get_buffer_status()` queries ScheduledReel to find filled slots. Since Toby-generated content no longer creates ScheduledReel entries immediately, we need to also count `GenerationJob` records with `pipeline_status IN ('pending', 'approved')` as "filling" those future slots.

However — since pipeline items have no scheduled time, we can't map them to specific slots. Instead, the buffer manager counts:
- Total slots needed for next N days
- ScheduledReel entries (excluding cancelled/rejected) = slots definitely filled
- GenerationJob entries with `pipeline_status='pending'` = slots awaiting approval (don't generate more)
- If (scheduled_count + pending_count) >= total_slots → buffer is HEALTHY

This prevents Toby from generating duplicate content while items are awaiting approval.

### 6.2 Pipeline API Routes

**New file:** `app/api/pipeline/routes.py`

```python
router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])
```

| Endpoint | Method | Purpose | Request Body |
|----------|--------|---------|-------------|
| `/api/pipeline` | GET | List pipeline items for user | Query params: `status` (pending/approved/rejected/all), `brand`, `content_type`, `batch_id`, `page`, `limit` |
| `/api/pipeline/stats` | GET | Counts by status + batch info | — |
| `/api/pipeline/{job_id}/approve` | POST | Approve single item → auto-schedule | `{ caption?: string }` (optional caption edit) |
| `/api/pipeline/{job_id}/reject` | POST | Reject single item | `{ reason?: string }` |
| `/api/pipeline/bulk-approve` | POST | Approve multiple items | `{ job_ids: string[] }` |
| `/api/pipeline/bulk-reject` | POST | Reject multiple items | `{ job_ids: string[] }` |
| `/api/pipeline/{job_id}/edit` | PATCH | Edit caption/title before approving | `{ caption?: string, title?: string }` |
| `/api/pipeline/regenerate` | POST | Toby generates X more items for empty slots | `{ count: number }` |

**Approve endpoint logic (critical):**

```python
@router.post("/{job_id}/approve")
async def approve_pipeline_item(job_id: str, body: ApproveRequest, user, db):
    job = db.query(GenerationJob).filter(
        GenerationJob.job_id == job_id,
        GenerationJob.user_id == user["id"],
        GenerationJob.pipeline_status == "pending"
    ).first()
    if not job:
        raise HTTPException(404)

    # 1. Update pipeline status
    job.pipeline_status = "approved"
    job.pipeline_reviewed_at = datetime.now(timezone.utc)
    if body.caption:
        job.caption = body.caption  # User edited caption

    # 2. Auto-schedule for EACH brand in the job
    scheduler = DatabaseSchedulerService()
    scheduled_results = []

    for brand_name in (job.brands or []):
        brand_data = (job.brand_outputs or {}).get(brand_name, {})
        if not brand_data or brand_data.get("status") != "completed":
            continue

        # Find next available slot from today
        content_type = _infer_content_type(job.variant, job.content_format)
        slot_time = scheduler.get_next_available_slot(
            brand=brand_name,
            variant=job.variant,
            user_id=user["id"],
        )

        # Create ScheduledReel
        result = scheduler.schedule_reel(
            user_id=user["id"],
            reel_id=brand_data.get("reel_id", f"{job_id}_{brand_name}"),
            scheduled_time=slot_time,
            caption=body.caption or job.caption or brand_data.get("caption", ""),
            platforms=job.platforms or ["instagram"],
            video_path=brand_data.get("video_path"),
            thumbnail_path=brand_data.get("thumbnail_path"),
            brand=brand_name,
            variant=job.variant,
            post_title=job.title,
            slide_texts=job.content_lines,
            carousel_paths=brand_data.get("carousel_paths"),
            job_id=job_id,
            created_by=job.created_by or "user",
        )
        scheduled_results.append({
            "brand": brand_name,
            "scheduled_time": slot_time.isoformat(),
            "schedule_id": result.get("schedule_id"),
        })

    db.commit()
    return { "approved": True, "scheduled": scheduled_results }
```

### 6.3 Manual Creation Changes

**File:** `app/api/content/reel_routes.py` (and similar creation endpoints)

After media pipeline completes in background task:
- Set `job.pipeline_status = "pending"` (instead of calling auto-schedule)
- The job appears in `/pipeline` automatically

**Navigate immediately:** Frontend navigates to `/pipeline` as soon as the job is created (before background processing finishes). The pipeline page shows the job with a "Processing..." state until media is ready.

### 6.4 Register Pipeline Router

**File:** `app/main.py`

```python
from app.api.pipeline.routes import router as pipeline_router
app.include_router(pipeline_router)
```

---

## 7. Auto-Scheduling Algorithm

### The "Fill-Forward" Strategy

When a user approves an item, the auto-scheduler assigns it to the **earliest available empty slot** starting from today, looking up to N days ahead (user-configured `buffer_days`, default 7).

```
Day 1: [slot1=filled] [slot2=filled] [slot3=filled] [slot4=filled] [slot5=filled] [slot6=filled]
Day 2: [slot1=filled] [slot2=filled] [slot3=EMPTY]  [slot4=EMPTY]  [slot5=EMPTY]  [slot6=EMPTY]
Day 3: [slot1=EMPTY]  [slot2=EMPTY]  [slot3=EMPTY]  [slot4=EMPTY]  [slot5=EMPTY]  [slot6=EMPTY]
...
                           ↑
              Next approval lands HERE (Day 2, slot 3)
```

**Why this works for rejections:**

If Toby generates 42 items (7 days × 6 slots) and user rejects 4:
- 38 approved items fill slots from Day 1 forward
- Day 1: 6/6, Day 2: 6/6, ... Day 6: 6/6, Day 7: 2/6 (4 empty slots)
- Only the LAST day is affected

### Slot assignment uses existing infrastructure

`DatabaseSchedulerService.get_next_available_slot()` already exists (line ~1565 of scheduler.py). It:
1. Uses the brand's `schedule_offset` for stagger
2. Checks existing ScheduledReel entries to skip filled slots
3. Returns the next empty slot datetime

We call this per-approval. It naturally fills forward because it always returns the earliest empty slot.

### Bulk approve optimization

For `POST /api/pipeline/bulk-approve`, process items sequentially so each `get_next_available_slot()` sees the ScheduledReel created by the previous approval. This ensures no slot collisions.

### Post (carousel) slots vs Reel slots

The existing scheduler already distinguishes reel slots (6/day, every 4h alternating L/D) from post slots (2/day, 8AM + 2PM). The `variant` field on GenerationJob determines which slot type is used:
- `variant` in ("light", "dark", "format_b") → reel slot
- `variant` = "post" → post slot
- `variant` = "threads" → threads slot (uses `threads_posts_per_day` from TobyBrandConfig)

### Smart slot assignment for threads

Threads posts are text-only and don't follow the reel time grid. They need their own slot logic. Currently `threads_posts_per_day` exists on TobyBrandConfig. Thread slots should be evenly distributed across the day based on this count.

---

## 8. Frontend Architecture — Pipeline Page

### 8.1 New Route & Sidebar

**File:** `src/app/routes/index.tsx`

```tsx
<Route path="pipeline" element={<PipelinePage />} />
<Route path="jobs" element={<Navigate to="/pipeline" replace />} />
<Route path="history" element={<Navigate to="/pipeline" replace />} />
```

**File:** `src/app/layout/AppLayout.tsx` — `NAV_ITEMS`

```tsx
// BEFORE:
{ to: '/jobs', icon: Briefcase, label: 'Jobs', end: false },

// AFTER:
{ to: '/pipeline', icon: GitPullRequestDraft, label: 'Pipeline', end: false },
```

The Pipeline nav item gets a **notification badge** showing the count of `pending` items. This is the primary nudge that brings users back to approve content.

```tsx
// Badge component on sidebar
{pendingCount > 0 && (
  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
    {pendingCount > 99 ? '99+' : pendingCount}
  </span>
)}
```

### 8.2 Page Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Pipeline                                                               │
│  "Review and approve content before it goes live."                      │
│  ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ STATS BAR                                                          │  │
│  │  [📋 12 Pending]  [✅ 34 Approved]  [❌ 3 Rejected]  [📊 92% rate]│  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │ FILTERS                     │  │ BULK ACTIONS                      │  │
│  │ [Pending▾] [All Brands▾]    │  │ [✅ Approve All (12)] [❌ Reject]│  │
│  │ [Reels|Carousels|Threads]   │  │ [☐ Select All]                   │  │
│  └──────────────────────────────┘  └──────────────────────────────────┘  │
│                                                                         │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐            │
│  │           │  │           │  │           │  │           │            │
│  │   9:16    │  │   4:5     │  │  Thread   │  │   9:16    │            │
│  │   REEL    │  │ CAROUSEL  │  │  TEXT     │  │   REEL    │            │
│  │  Preview  │  │  Preview  │  │  Card     │  │  Preview  │            │
│  │           │  │           │  │           │  │           │            │
│  │           │  │ 1 / 5 ●●  │  │           │  │           │            │
│  │     ▶     │  │           │  │           │  │     ▶     │            │
│  ├───────────┤  ├───────────┤  ├───────────┤  ├───────────┤            │
│  │"10 Tips.."│  │"Why You.."│  │"Thread ab"│  │"How to .."│            │
│  │GymCollege │  │HealthyCo  │  │GymCollege │  │VitalityCo │            │
│  │📸 📘 ▶️   │  │📸 📘      │  │🧵         │  │📸 📘 ▶️ 🎵│            │
│  │[✅] [❌]  │  │[✅] [❌]  │  │[✅] [❌]  │  │[✅] [❌]  │            │
│  │ [✏️ Edit] │  │ [✏️ Edit] │  │ [✏️ Edit] │  │ [✏️ Edit] │            │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘            │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ POST-REVIEW BANNER (shows after all pending items are reviewed)     ││
│  │                                                                     ││
│  │ ✅ All done! 38 items approved, 4 rejected.                         ││
│  │ ⚠️  4 slots are missing for the next 7 days.                        ││
│  │ [🤖 Let Toby generate 4 more]    [Skip — I'll fill manually]       ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Card Design Variants

**Reel Card (Format A — Light/Dark):**

```
┌─────────────────────┐
│                     │
│   ┌─────────────┐   │  ← 9:16 aspect container with rounded corners
│   │             │   │    bg: thumbnail_path image
│   │             │   │
│   │     ▶       │   │  ← Centered play icon (semi-transparent white circle)
│   │             │   │
│   │             │   │
│   │  ░░░░░░░░░  │   │  ← Bottom gradient overlay (black 0% → 60%)
│   │  "Title..." │   │  ← Title text, max 2 lines, white, font-semibold
│   └─────────────┘   │
│                     │
│  GymCollege          │  ← Brand badge (colored dot + name)
│  📸 📘 ▶️ 🎵          │  ← Platform icons (small, in a row)
│  Score: 87           │  ← Quality score badge (green/yellow/red)
│                     │
│  ┌─────┐  ┌─────┐   │
│  │ ✅  │  │ ❌  │   │  ← Approve / Reject buttons
│  │Appro│  │Reje │   │
│  └─────┘  └─────┘   │
│  [✏️ Review & Edit]  │  ← Opens detail modal
└─────────────────────┘
```

**Carousel Card (Post):**

```
┌─────────────────────┐
│                     │
│   ┌─────────────┐   │  ← 4:5 aspect container
│   │  COVER      │   │    bg: first carousel image
│   │  SLIDE      │   │
│   │             │   │
│   │  "Title..." │   │
│   │         1/5 │   │  ← Slide count pill
│   └─────────────┘   │
│  ...                │
└─────────────────────┘
```

**Thread Card (Text):**

```
┌─────────────────────┐
│                     │
│   ┌─────────────┐   │  ← Neutral bg (stone-50), no image
│   │  🧵          │   │  ← Threads icon
│   │             │   │
│   │ "Here's why │   │  ← First ~100 chars of thread text
│   │  intermitte │   │
│   │  nt fasting │   │
│   │  is overra  │   │
│   │  ted..."    │   │
│   └─────────────┘   │
│  ...                │
└─────────────────────┘
```

### 8.4 Detail Modal

When user clicks "Review & Edit" on a card, a modal opens with a full-size preview and editing capabilities.

```
┌──────────────────────────────────────────────────────────────┐
│                                                    [✕ Close] │
│                                                              │
│  ┌──────────────────┐  ┌─────────────────────────────────┐   │
│  │                  │  │  Title                           │   │
│  │                  │  │  ┌───────────────────────────┐   │   │
│  │   FULL PREVIEW   │  │  │ 10 Tips for Better Sleep  │   │   │
│  │   (phone-size    │  │  └───────────────────────────┘   │   │
│  │    9:16 or 4:5)  │  │                                 │   │
│  │                  │  │  Caption                        │   │
│  │                  │  │  ┌───────────────────────────┐   │   │
│  │                  │  │  │ Here's what nobody tells  │   │   │
│  │                  │  │  │ you about sleep quality...│   │   │
│  │                  │  │  │                           │   │   │
│  │                  │  │  │ (editable textarea)       │   │   │
│  │                  │  │  └───────────────────────────┘   │   │
│  │                  │  │                                 │   │
│  │                  │  │  Brand: GymCollege               │   │
│  │                  │  │  Platforms: 📸 📘 ▶️ 🎵           │   │
│  │                  │  │  Format: Reel (Format A — Dark)  │   │
│  │                  │  │  Created by: 🤖 Toby             │   │
│  │                  │  │  Quality: 87/100 ████████░░       │   │
│  │                  │  │                                 │   │
│  └──────────────────┘  │  ┌────────┐  ┌────────┐         │   │
│                        │  │✅ Appro│  │❌ Rejec│         │   │
│                        │  │  ve    │  │  t     │         │   │
│                        │  └────────┘  └────────┘         │   │
│                        └─────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The modal is a **two-column layout** on desktop (preview left, metadata+actions right), and stacks vertically on mobile (preview on top, metadata below).

---

## 9. React Tooling & Component Spec

### 9.1 Required Libraries (all already in the stack — no new dependencies)

| Library | Version | Purpose in Pipeline |
|---------|---------|-------------------|
| **React 18** | 18.x | Component framework |
| **TypeScript** | 5.x | Type safety for pipeline types, API shapes |
| **Tailwind CSS** | 3.x | All styling — utility-first, responsive breakpoints, dark gradients |
| **TanStack React Query** | 5.x | Pipeline data fetching, mutations (approve/reject), cache invalidation, optimistic updates |
| **Framer Motion** | 11.x | Card exit animations (fade out on approve/reject), modal enter/exit, skeleton shimmer |
| **React Router v6** | 6.x | `/pipeline` route, navigation from `/creation` |
| **Lucide React** | 0.4x | Icons: `Check`, `X`, `Edit3`, `Filter`, `GitPullRequestDraft`, `Sparkles`, `Film`, `LayoutGrid`, `MessageSquare` |
| **clsx** | 2.x | Conditional className merging for card variants |
| **date-fns** | 3.x | Relative timestamps ("2 hours ago"), date formatting |
| **react-hot-toast** | 2.x | Approval/rejection confirmations, error toasts |

### 9.2 Component Tree

```
PipelinePage
├── PipelineStats               ← Stats bar (pending/approved/rejected counts)
├── PipelineToolbar             ← Filters + bulk actions (approve all, select mode)
├── PipelineGrid                ← Responsive CSS grid of cards
│   ├── PipelineCard            ← One card per GenerationJob
│   │   ├── ContentPreview      ← Platform-native visual preview
│   │   │   ├── ReelPreview     ← 9:16 thumbnail + play icon + gradient overlay
│   │   │   ├── CarouselPreview ← 4:5 cover + slide count pill
│   │   │   └── ThreadPreview   ← Text card with Threads styling
│   │   ├── CardMeta            ← Brand badge, platforms, score, timestamps
│   │   └── CardActions         ← Approve/Reject/Edit buttons
│   └── ...more cards
├── PipelineDetailModal         ← Full preview + caption editor + approve/reject
│   ├── DetailPreview           ← Large content preview (phone-size)
│   ├── DetailEditor            ← Title + caption textareas
│   └── DetailActions           ← Approve / Reject buttons
├── PostReviewBanner            ← Shows after all pending items reviewed
│   └── RegenerationPrompt     ← "4 slots missing. Let Toby generate more?"
└── EmptyState                  ← When pipeline has zero items
```

### 9.3 Component Specs

#### `PipelineCard` — The Core Visual Unit

```tsx
interface PipelineCardProps {
  job: PipelineItem         // API response shape
  onApprove: (jobId: string) => void
  onReject: (jobId: string) => void
  onEdit: (jobId: string) => void   // Opens detail modal
  isSelected: boolean               // Bulk selection mode
  onToggleSelect: () => void
}
```

**CSS (Tailwind) — Card Layout:**

```
Container:
  bg-white rounded-2xl shadow-sm border border-gray-100
  overflow-hidden transition-all duration-300
  hover:shadow-md hover:border-gray-200
  w-full (grid-controlled width)

  When approved (animating out):
    framer-motion: opacity → 0, scale → 0.95, y → -10
    After animation: removed from grid (optimistic update)

  When rejected (animating out):
    framer-motion: opacity → 0, x → -20
    After animation: removed from grid (optimistic update)
```

**Aspect Ratio Containers:**

- Reel: `aspect-[9/16]` (Tailwind arbitrary value) — critical for Instagram/TikTok native feel
- Carousel: `aspect-[4/5]` — standard Instagram post ratio
- Thread: `min-h-[200px]` — text fills vertically, no fixed ratio

**Image Loading Strategy:**

- `<img loading="lazy">` — native lazy loading, critical for 100+ cards
- Skeleton placeholder: `bg-gray-100 animate-pulse rounded-xl` while loading
- `object-cover` for all images — always fill the container, never letterbox
- Supabase storage URLs are direct-access (no token needed for public buckets)

#### `PipelineGrid` — Responsive Layout

```tsx
// Grid: 1 col mobile, 2 cols tablet, 3 cols laptop, 4 cols desktop
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  <AnimatePresence mode="popLayout">
    {items.map(item => (
      <motion.div
        key={item.job_id}
        layout                           // Smooth reflow when items are removed
        initial={{ opacity: 0, y: 20 }}  // Enter animation
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }} // Exit animation on approve/reject
        transition={{ duration: 0.25 }}
      >
        <PipelineCard job={item} ... />
      </motion.div>
    ))}
  </AnimatePresence>
</div>
```

**Key Framer Motion features used:**

- `AnimatePresence` with `mode="popLayout"` — enables exit animations AND automatic grid reflow
- `layout` prop on each card — Framer Motion auto-animates position changes when neighbors disappear
- This gives the satisfying "card disappears, remaining cards slide into place" effect

#### `PipelineDetailModal` — Full Review

```tsx
// Framer Motion modal backdrop + content
<AnimatePresence>
  {isOpen && (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}    // Click backdrop to close
    >
      <motion.div
        className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()} // Prevent backdrop close on content click
      >
        {/* Two-column layout on desktop */}
        <div className="flex flex-col md:flex-row gap-6 p-6">
          <div className="flex-shrink-0 md:w-[280px]">
            <DetailPreview {...} />
          </div>
          <div className="flex-1 flex flex-col gap-4">
            <DetailEditor {...} />
            <DetailActions {...} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
```

#### `PipelineStats` — Dashboard Strip

```tsx
// Horizontal strip of stat cards
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  <StatCard icon={Clock} label="Pending" value={stats.pending} color="amber" />
  <StatCard icon={CheckCircle2} label="Approved" value={stats.approved} color="green" />
  <StatCard icon={XCircle} label="Rejected" value={stats.rejected} color="red" />
  <StatCard icon={Percent} label="Approval Rate" value={`${stats.rate}%`} color="blue" />
</div>
```

### 9.4 React Query Hooks

**File:** `src/features/pipeline/api/pipeline-api.ts`

```typescript
// Query keys
export const pipelineKeys = {
  all: ['pipeline'] as const,
  list: (filters: PipelineFilters) => [...pipelineKeys.all, 'list', filters] as const,
  stats: () => [...pipelineKeys.all, 'stats'] as const,
  detail: (jobId: string) => [...pipelineKeys.all, 'detail', jobId] as const,
}

// Hooks
export function usePipelineItems(filters: PipelineFilters) {
  return useQuery({
    queryKey: pipelineKeys.list(filters),
    queryFn: () => apiClient.get<PipelineResponse>('/api/pipeline', { params: filters }),
    staleTime: 30_000,       // 30s — pipeline changes frequently during review sessions
  })
}

export function usePipelineStats() {
  return useQuery({
    queryKey: pipelineKeys.stats(),
    queryFn: () => apiClient.get<PipelineStats>('/api/pipeline/stats'),
    staleTime: 60_000,        // 1 min
    refetchInterval: 60_000,  // Auto-refresh every minute (for sidebar badge)
  })
}

export function useApprovePipelineItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, caption }: { jobId: string; caption?: string }) =>
      apiClient.post(`/api/pipeline/${jobId}/approve`, { caption }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      queryClient.invalidateQueries({ queryKey: schedulingKeys.all })  // Calendar refresh
      toast.success('Content approved and scheduled!')
    },
  })
}

export function useRejectPipelineItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, reason }: { jobId: string; reason?: string }) =>
      apiClient.post(`/api/pipeline/${jobId}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      toast('Content rejected', { icon: '🗑️' })
    },
  })
}

export function useBulkApprovePipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobIds: string[]) =>
      apiClient.post('/api/pipeline/bulk-approve', { job_ids: jobIds }),
    onSuccess: (_, jobIds) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      queryClient.invalidateQueries({ queryKey: schedulingKeys.all })
      toast.success(`${jobIds.length} items approved and scheduled!`)
    },
  })
}
```

### 9.5 Optimistic Updates

When user clicks approve/reject, the card should **immediately** animate out (don't wait for the API response). This uses React Query's optimistic update pattern:

```typescript
// In useApprovePipelineItem
onMutate: async ({ jobId }) => {
  // Cancel in-flight queries
  await queryClient.cancelQueries({ queryKey: pipelineKeys.all })

  // Snapshot current data
  const previous = queryClient.getQueryData(pipelineKeys.list(currentFilters))

  // Optimistically remove the item from the list
  queryClient.setQueryData(pipelineKeys.list(currentFilters), (old) => ({
    ...old,
    items: old.items.filter(i => i.job_id !== jobId),
    total: old.total - 1,
  }))

  return { previous }
},
onError: (err, { jobId }, context) => {
  // Rollback on failure
  queryClient.setQueryData(pipelineKeys.list(currentFilters), context.previous)
  toast.error('Failed to approve — please try again')
},
```

### 9.6 Supabase Realtime Integration

Reuse the existing `useRealtimeSync()` pattern to auto-refresh pipeline data when Toby generates new content in the background:

```typescript
// In src/shared/hooks/use-realtime-sync.ts — add:
supabase.channel('pipeline-updates')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'generation_jobs',
    filter: `pipeline_status=eq.pending`,
  }, () => {
    queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
  })
  .subscribe()
```

This means: when Toby finishes generating a new batch in the background, the pipeline page auto-refreshes without the user needing to reload.

### 9.7 Sidebar Badge (Pending Count)

**File:** `src/app/layout/AppLayout.tsx`

The Pipeline nav item shows a live badge with the pending count. This is fetched via `usePipelineStats()` with a 60s auto-refetch interval. The badge renders inline with the nav icon:

```tsx
function NavItemWithBadge({ item, pendingCount }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} className={...}>
      <div className="relative">
        <Icon className="w-5 h-5" />
        {item.badge && pendingCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </div>
    </NavLink>
  )
}
```

### 9.8 Feature Module Structure

```
src/features/pipeline/
├── api/
│   └── pipeline-api.ts          # API client + React Query hooks
├── components/
│   ├── PipelineCard.tsx          # Individual card with preview + actions
│   ├── PipelineGrid.tsx          # Responsive grid with AnimatePresence
│   ├── PipelineStats.tsx         # Stats dashboard strip
│   ├── PipelineToolbar.tsx       # Filters + bulk actions
│   ├── PipelineDetailModal.tsx   # Full review modal
│   ├── ContentPreview.tsx        # Preview renderer (switches by variant)
│   ├── ReelPreview.tsx           # 9:16 thumbnail + play + gradient
│   ├── CarouselPreview.tsx       # 4:5 cover + slide count
│   ├── ThreadPreview.tsx         # Text-only card
│   ├── PostReviewBanner.tsx      # "All reviewed" + regen prompt
│   └── EmptyState.tsx            # Zero items state
├── hooks/
│   └── use-pipeline-filters.ts   # Filter state management
├── model/
│   └── types.ts                  # PipelineItem, PipelineStats, PipelineFilters
└── index.ts                      # Public exports
```

### 9.9 TypeScript Types

```typescript
// src/features/pipeline/model/types.ts

export type PipelineStatus = 'pending' | 'approved' | 'rejected'

export type ContentVariant = 'light' | 'dark' | 'format_b' | 'post' | 'threads'

export interface PipelineItem {
  job_id: string
  title: string
  caption: string | null
  variant: ContentVariant
  content_format: string          // 'format_a' | 'format_b'
  content_lines: string[]
  brands: string[]
  platforms: string[]
  pipeline_status: PipelineStatus
  pipeline_reviewed_at: string | null
  pipeline_batch_id: string | null
  quality_score: number | null
  created_by: 'user' | 'toby'
  created_at: string
  // Per-brand data
  brand_outputs: Record<string, {
    status: string
    thumbnail_path?: string
    video_path?: string
    reel_id?: string
    carousel_paths?: string[]
    caption?: string
  }>
}

export interface PipelineStats {
  pending: number
  approved: number
  rejected: number
  rate: number                    // Approval rate (approved / (approved + rejected) * 100)
  total_slots_needed: number      // For the configured buffer_days
  slots_filled: number            // Approved items + existing scheduled
}

export interface PipelineFilters {
  status: PipelineStatus | 'all'
  brand: string | null
  content_type: 'all' | 'reels' | 'carousels' | 'threads'
  batch_id: string | null
}
```

---

## 10. Notification System

### Email via Supabase Auth Mailer

Supabase already handles transactional email (signup confirmation, password reset). We can use the same infrastructure for pipeline notifications.

**Approach:** Use Supabase's `supabase.auth.admin` API or Edge Functions to send templated emails.

**Trigger:** In the orchestrator tick, after buffer check generates new content:

```python
# In orchestrator.py — new step after buffer check
def _check_pipeline_notification(db, user_id, state):
    """Send email if there are pending pipeline items and enough time has passed."""
    if not state.last_pipeline_notification_at:
        should_notify = True
    else:
        interval = timedelta(hours=state.pipeline_notification_interval_hours or 24)
        should_notify = datetime.now(timezone.utc) - state.last_pipeline_notification_at > interval

    if not should_notify:
        return

    pending_count = db.query(GenerationJob).filter(
        GenerationJob.user_id == user_id,
        GenerationJob.pipeline_status == "pending",
    ).count()

    if pending_count == 0:
        return

    # Send notification
    _send_pipeline_email(db, user_id, pending_count)
    state.last_pipeline_notification_at = datetime.now(timezone.utc)
    db.commit()
```

**Email template:**

```
Subject: 🎬 Toby has {count} posts ready for your review

Hi {user_name},

Toby has prepared {count} pieces of content for your brands:
{brand_summaries}

Head to your Pipeline to review and approve them:
→ https://viraltoby.com/pipeline

Once approved, they'll be automatically scheduled to your calendar.

— ViralToby
```

**Supabase Edge Function approach (recommended):**

Create a Supabase Edge Function `send-pipeline-notification` that the Python backend calls via HTTP. This keeps email delivery fast and non-blocking.

---

## 11. AI Content Labeling

### API Metadata Flag Only (No Visible Caption Text)

When publishing to platforms that support an AI-generated flag, set it in the API call:

**Instagram Graph API:**

```python
# In social_publisher.py — when creating a container
params = {
    "image_url": image_url,
    "caption": caption,
    "is_ai_generated": True,  # Meta's AI label
}
```

**Facebook Graph API:**

```python
# Similar parameter for Facebook posts
params["ai_generated"] = True
```

**TikTok:** Check their latest API for `is_ai_generated` support.

**YouTube:** YouTube doesn't have an API-level AI flag yet; they handle it via YouTube Studio settings.

**Implementation:** Add the flag in `app/services/publishing/social_publisher.py` for all publish methods. Since ALL ViralToby content is AI-generated (DeepSeek writes it, DeAPI generates images), this flag should be True for every publish call.

---

## 12. Rejection & Regeneration Flow

### No Auto-Regeneration on Reject

When a user rejects a pipeline item:
1. `GenerationJob.pipeline_status = "rejected"`
2. `GenerationJob.pipeline_reviewed_at = now()`
3. The item disappears from the pending view (with exit animation)
4. **Nothing else happens immediately**

### Post-Review Slot Gap Detection

After the user finishes reviewing all pending items (pending count drops to 0), the frontend shows the **PostReviewBanner**:

```
┌────────────────────────────────────────────────────────────┐
│ ✅ All reviewed! 38 approved → scheduled to your calendar  │
│                                                            │
│ ⚠️ 4 slots are still empty for the next 7 days.            │
│                                                            │
│   [🤖 Let Toby generate 4 more]  [Skip for now]           │
└────────────────────────────────────────────────────────────┘
```

**"Let Toby generate 4 more"** calls `POST /api/pipeline/regenerate` with `{ count: 4 }`. This triggers Toby to generate exactly 4 more items, which appear in the pipeline as new pending items. The user reviews them → approve → auto-schedule → slots filled.

### Smart Slot Filling

Since auto-scheduling fills from Day 1 forward (earliest empty slot first), rejected items naturally create gaps at the END of the buffer window. Example:

```
7 days × 6 reels/day = 42 slots needed
Toby generates 42 items → user approves 38, rejects 4
38 approvals fill: Day 1 (6), Day 2 (6), Day 3 (6), Day 4 (6), Day 5 (6), Day 6 (6), Day 7 (2)
Missing: 4 slots on Day 7
```

If user clicks "generate 4 more" → Toby creates 4 items → user approves → they fill Day 7 slots 3-6.

---

## 13. DB Cleanup Policy

### Pipeline Items — 30 Day Expiry

```python
# Cron job or orchestrator tick (daily)
def cleanup_stale_pipeline_items(db):
    """Delete pipeline items that have been pending for > 30 days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    stale = db.query(GenerationJob).filter(
        GenerationJob.pipeline_status == "pending",
        GenerationJob.created_at < cutoff,
    ).all()

    for job in stale:
        job.pipeline_status = "expired"
        # Also clean up Supabase storage files
        _cleanup_supabase_on_failure(job.job_id, ...)

    db.commit()
    return len(stale)
```

### Rejected Items — 7 Day Retention

Rejected items are kept for 7 days (for the "Rejected" tab in pipeline), then hard-deleted.

### Approved Items — Follow GenerationJob Lifecycle

Approved jobs that successfully created ScheduledReel entries follow the existing job retention policy.

---

## 14. Migration & Rollout Plan

### Phase 1: Database (Day 1)

1. Run `migrations/add_pipeline_approval.sql`
2. Verify columns exist
3. Existing GenerationJob records have `pipeline_status=NULL` → treated as legacy (not in pipeline)
4. Existing ScheduledReel records are unaffected

### Phase 2: Backend — Pipeline API (Days 2-3)

1. Create `app/api/pipeline/routes.py` with all endpoints
2. Register in `app/main.py`
3. Add `pipeline_status`, `caption`, `pipeline_batch_id`, `quality_score` columns to `GenerationJob` model
4. Update `TobyState` model with notification columns
5. Extend `buffer_days` schema validation to `ge=1, le=10`
6. Run `python scripts/validate_api.py --imports`

### Phase 3: Backend — Toby Orchestrator (Days 3-4)

1. Modify `_execute_content_plan()` to set `pipeline_status="pending"` and NOT call `schedule_reel()`
2. Add `batch_id` generation in `_run_buffer_check()`
3. Update `get_buffer_status()` to count pending pipeline items as "filled"
4. Add `_check_pipeline_notification()` to tick loop
5. **CRITICAL TEST:** Verify that `get_pending_publications()` does NOT pick up pending pipeline items (it shouldn't — it filters status="scheduled" on ScheduledReel, which we don't create until approval)

### Phase 4: Backend — Manual Creation (Day 4)

1. Modify reel/post/thread creation endpoints to set `pipeline_status="pending"`
2. Remove auto-schedule call from creation flow (it happens on approval now)

### Phase 5: Frontend — Pipeline Page (Days 5-8)

1. Create `src/features/pipeline/` module structure
2. Build all components (cards, grid, toolbar, stats, detail modal)
3. Create `src/pages/Pipeline.tsx`
4. Update routes (add `/pipeline`, redirect `/jobs`)
5. Update sidebar NAV_ITEMS + add badge
6. Update Creation wizard to navigate to `/pipeline`

### Phase 6: Frontend — Toby Settings (Day 8)

1. Add buffer_days slider (1-10) to Toby Settings tab
2. Connect to `PATCH /api/toby/config`

### Phase 7: AI Content Labeling (Day 9)

1. Add `is_ai_generated: True` to all platform publish calls in `social_publisher.py`

### Phase 8: Email Notifications (Day 9-10)

1. Create Supabase Edge Function or direct mailer for pipeline notifications
2. Wire into orchestrator tick

### Phase 9: Cleanup & QA (Day 10)

1. Run full validation: `python scripts/validate_api.py`
2. Run frontend lint: `npx eslint src/ --rule 'react-hooks/rules-of-hooks: error'`
3. Test full flow: Toby generates → pipeline shows items → approve → calendar shows scheduled
4. Test rejection flow: reject items → banner shows → regenerate → fill gaps
5. Test manual creation: create in `/creation` → appears in `/pipeline` → approve
6. Verify old `/jobs` redirects to `/pipeline`

---

## 15. Landing Page (Deferred)

The landing page needs to change from "full autopilot" / "0hrs manual work" messaging to "AI-assisted" / "2 minutes for a week of content" positioning.

**This is deferred because:**
1. We need the Pipeline UI built first
2. We need a screen recording of the actual UX for Meta's review
3. It requires its own design pass (separate agent)

**New messaging direction:**
- "AI that creates — you approve. 2 minutes for a week of content."
- "Your AI content team. Review, approve, publish."
- Keep the time-saving angle but frame it as human-in-the-loop

**Action:** After Pipeline is built and deployed, spawn a dedicated agent to redesign the landing page with new copy, screenshots, and video.

---

## 16. File-by-File Change Map

### New Files

| File | Purpose |
|------|---------|
| `migrations/add_pipeline_approval.sql` | DB migration |
| `app/api/pipeline/__init__.py` | Package init |
| `app/api/pipeline/routes.py` | Pipeline API endpoints |
| `app/api/pipeline/schemas.py` | Pydantic request/response models |
| `src/pages/Pipeline.tsx` | Pipeline page |
| `src/features/pipeline/api/pipeline-api.ts` | API client + React Query hooks |
| `src/features/pipeline/components/PipelineCard.tsx` | Card component |
| `src/features/pipeline/components/PipelineGrid.tsx` | Grid layout |
| `src/features/pipeline/components/PipelineStats.tsx` | Stats strip |
| `src/features/pipeline/components/PipelineToolbar.tsx` | Filters + bulk |
| `src/features/pipeline/components/PipelineDetailModal.tsx` | Detail modal |
| `src/features/pipeline/components/ContentPreview.tsx` | Preview switcher |
| `src/features/pipeline/components/ReelPreview.tsx` | 9:16 reel preview |
| `src/features/pipeline/components/CarouselPreview.tsx` | 4:5 carousel preview |
| `src/features/pipeline/components/ThreadPreview.tsx` | Text thread preview |
| `src/features/pipeline/components/PostReviewBanner.tsx` | Regen prompt |
| `src/features/pipeline/components/EmptyState.tsx` | Empty pipeline |
| `src/features/pipeline/hooks/use-pipeline-filters.ts` | Filter state |
| `src/features/pipeline/model/types.ts` | TypeScript types |
| `src/features/pipeline/index.ts` | Public exports |

### Modified Files

| File | Change |
|------|--------|
| `app/models/jobs.py` | Add pipeline_status, caption, pipeline_batch_id, quality_score, pipeline_reviewed_at columns |
| `app/models/toby.py` | Add last_pipeline_notification_at, pipeline_notification_interval_hours to TobyState |
| `app/services/toby/orchestrator.py` | pipeline_status="pending" instead of schedule_reel(); batch_id; notification check |
| `app/services/toby/buffer_manager.py` | Count pending pipeline items as "filled" in buffer health |
| `app/services/publishing/social_publisher.py` | Add is_ai_generated flag to all publish calls |
| `app/api/toby/schemas.py` | Extend buffer_days range to `ge=1, le=10` |
| `app/main.py` | Include pipeline_router |
| `src/app/routes/index.tsx` | Add /pipeline route, redirect /jobs → /pipeline |
| `src/app/layout/AppLayout.tsx` | Replace Jobs nav item with Pipeline + badge |
| `src/pages/Creation.tsx` | Navigate to /pipeline instead of /jobs after creation |
| `src/shared/hooks/use-realtime-sync.ts` | Add generation_jobs pipeline listener |
| `src/pages/index.ts` | Export PipelinePage |

### Potentially Deprecated (but keep for backward compatibility)

| File | Status |
|------|--------|
| `src/pages/History.tsx` | Still exists but `/jobs` redirects to `/pipeline`. Keep for `/job/:jobId` deep links. |
| `src/pages/JobDetail.tsx` | Keep — useful for debugging, linked from pipeline cards. |

---

## Appendix: Key Architectural Decisions (ADR Log)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Use GenerationJob for pipeline storage (not new table) | Already has all content/media data; 4 new columns vs an entire new table |
| 2 | No scheduled_time until approval | User's explicit requirement; cleaner separation of "what" vs "when" |
| 3 | Fill-forward slot assignment | Naturally pushes gaps to last days; works with existing get_next_available_slot() |
| 4 | Manual creations also go through pipeline | Consistent UX; user always previews before publish |
| 5 | API metadata flag only for AI labeling | Less intrusive; platform-native; user preference |
| 6 | No auto-regeneration on reject | Count gaps, propose regeneration; user stays in control |
| 7 | Supabase Auth mailer for notifications | Already in stack; no new service dependency |
| 8 | 30-day cleanup for stale pending items | Prevents DB bloat; inactive users don't accumulate indefinitely |
| 9 | Optimistic UI updates with Framer Motion | Instant feedback; cards animate out immediately on approve/reject |
| 10 | Sidebar badge for pending count | Primary driver to bring users back to approve content |
