# Toby — Full Media Pipeline Integration

## Architecture Specification v2.0

**Date:** 22 February 2026  
**Status:** Proposal — Pending Review  
**Depends on:** [toby-architecture-spec.md](toby-architecture-spec.md) (v1.0)

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Current State Analysis](#2-current-state-analysis)
3. [Target Architecture](#3-target-architecture)
4. [The Gap — What Needs to Change](#4-the-gap--what-needs-to-change)
5. [Backend Changes](#5-backend-changes)
6. [Frontend Changes](#6-frontend-changes)
7. [Data Model Changes](#7-data-model-changes)
8. [Revised Content Generation Flow](#8-revised-content-generation-flow)
9. [Scheduling & Calendar Integration](#9-scheduling--calendar-integration)
10. [Error Handling & Resilience](#10-error-handling--resilience)
11. [Performance & Rate Limiting](#11-performance--rate-limiting)
12. [Implementation Phases](#12-implementation-phases)
13. [Risk Matrix](#13-risk-matrix)

---

## 1. Problem Statement

Toby v1.0 (as implemented in [toby-architecture-spec.md](toby-architecture-spec.md)) generates **text-only content** — titles, content lines, captions — and schedules them directly. The result:

| What v1.0 Does | What's Missing |
|---|---|
| Generates title + content lines via `ContentGeneratorV2` | No `GenerationJob` created → invisible in Jobs/History page |
| Generates caption from `ContentGeneratorV2` | No AI background image (dark mode) |
| Schedules via `DatabaseSchedulerService.schedule_reel()` | No thumbnail PNG, no reel image PNG, no video MP4 |
| Records `toby_content_tags` for learning | No YouTube thumbnail, no YouTube title |
| Sets `created_by = "toby"` on `ScheduledReel` | No Supabase Storage uploads |
| Computes light/dark variant from slot time | Calendar shows "Cover not available" / "Video pending" |

**The consequence:** When the auto-publisher picks up a Toby-created `ScheduledReel`, it finds `video_path: null` and fails with `"No video URL found in metadata"`. Toby creates text plans that can never actually be published.

**The goal of this spec:** Make Toby produce **identical output** to the manual pipeline — real `GenerationJob` records, real images, real videos, real Supabase URLs. Content created by Toby should be indistinguishable from user-created content in the Calendar and Jobs pages, except for a "🤖 Toby" badge.

---

## 2. Current State Analysis

### 2.1 Manual Pipeline (What Works Today)

The user-triggered content creation follows this exact flow:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MANUAL CONTENT PIPELINE                          │
│                                                                     │
│  1. User clicks "Generate" → POST /api/content/jobs/create         │
│     Creates GenerationJob (status="pending")                        │
│     Returns job_id immediately                                      │
│                                                                     │
│  2. Background: process_job_async(job_id)                           │
│     Acquires _job_semaphore (max 2 concurrent)                      │
│     Opens DB session → JobProcessor(db).process_job(job_id)         │
│                                                                     │
│  3. process_job() determines variant:                               │
│     ├── variant="post" → AI generates title → process_post_brand()  │
│     │   └── Generates AI background only (compositing is frontend)  │
│     └── variant="light"/"dark" → per-brand pipeline:                │
│         a. If fixed_title=False: generate_viral_content()           │
│         b. Content differentiation (multi-brand)                    │
│         c. regenerate_brand() per brand:                            │
│                                                                     │
│  4. regenerate_brand() — THE CORE MEDIA PIPELINE:                   │
│     ┌─────────────────────────────────────────────────────┐         │
│     │ 1. Build PromptContext from NicheConfig              │         │
│     │ 2. Create ImageGenerator(brand, variant, ctx)        │         │
│     │    → For dark mode: triggers AIBackgroundGenerator   │         │
│     │      (DeepSeek → deAPI → PIL composite)             │         │
│     │ 3. generate_thumbnail(title) → thumbnail.png        │         │
│     │ 4. generate_reel_image(title, lines) → reel.png     │         │
│     │ 5. VideoGenerator.generate_reel_video() → video.mp4 │         │
│     │ 6. CaptionGenerator.generate_caption() → caption    │         │
│     │ 7. CaptionGenerator.generate_youtube_title()        │         │
│     │ 8. generate_youtube_thumbnail() → yt_thumb.jpg      │         │
│     │ 9. Upload all 4 files to Supabase Storage           │         │
│     │ 10. Update brand_outputs with Supabase URLs         │         │
│     └─────────────────────────────────────────────────────┘         │
│                                                                     │
│  5. User sees completed job in History page with preview            │
│     User clicks "Schedule" → schedule_auto or schedule              │
│     ScheduledReel created with video_path, thumbnail_path, etc.     │
│                                                                     │
│  6. Auto-publisher picks up due ScheduledReels → publishes          │
│     with real media URLs to Instagram/Facebook/YouTube              │
└─────────────────────────────────────────────────────────────────────┘
```

**Key data structures produced by the manual pipeline:**

```python
# GenerationJob.brand_outputs["gymcollege"] after completion:
{
    "status": "completed",
    "reel_id": "GEN-001234_gymcollege",
    "title": "Why Your Morning Coffee Is Destroying Your Gut",
    "content_lines": ["Line 1...", "Line 2...", "Line 3..."],
    "caption": "Full Instagram caption with hashtags...",
    "yt_title": "Why COFFEE Destroys Your Gut (And What To Drink Instead)",
    "ai_prompt": "The actual prompt sent to image AI...",
    "thumbnail_path": "https://supabase.../thumbnails/GEN-001234_gymcollege_thumbnail.png",
    "yt_thumbnail_path": "https://supabase.../thumbnails/GEN-001234_gymcollege_yt_thumbnail.jpg",
    "reel_path": "https://supabase.../reels/GEN-001234_gymcollege_reel.png",
    "video_path": "https://supabase.../videos/GEN-001234_gymcollege_video.mp4",
}

# ScheduledReel.extra_data after scheduling:
{
    "platforms": ["instagram", "facebook", "youtube"],
    "video_path": "https://supabase.../videos/GEN-001234_gymcollege_video.mp4",
    "thumbnail_path": "https://supabase.../thumbnails/GEN-001234_gymcollege_thumbnail.png",
    "yt_thumbnail_path": "https://supabase.../thumbnails/GEN-001234_gymcollege_yt_thumbnail.jpg",
    "brand": "gymcollege",
    "variant": "light",
    "yt_title": "Why COFFEE Destroys Your Gut...",
    "title": "Why Your Morning Coffee Is Destroying Your Gut",
    "slide_texts": null,
    "carousel_paths": null,
    "job_id": "GEN-001234",
}
```

### 2.2 Toby's Current Pipeline (What's Broken)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TOBY v1.0 PIPELINE (Current)                     │
│                                                                     │
│  1. Toby tick → _run_buffer_check()                                │
│     Finds empty slots → create_plans_for_empty_slots()              │
│                                                                     │
│  2. _execute_content_plan() per plan:                               │
│     a. Build PromptContext from NicheConfig                         │
│     b. ContentGeneratorV2.generate_viral_content() → text only     │
│        Returns: { title, content_lines, caption, image_prompt }     │
│     c. DatabaseSchedulerService.schedule_reel() DIRECTLY            │
│        ⚠️ video_path=None, thumbnail_path=None                     │
│        ⚠️ No GenerationJob created                                 │
│        ⚠️ No images, no video, no Supabase uploads                 │
│                                                                     │
│  3. Result: ScheduledReel exists but has NO media                   │
│     Calendar shows "Cover not available" / "Video pending"          │
│     Publisher fails: "No video URL found"                           │
│     No record in History/Jobs page                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 What `ContentGeneratorV2.generate_viral_content()` Returns

```python
# For reels:
{
    "title": "Why Your Morning Coffee Is Destroying Your Gut",
    "content_lines": ["73% of people...", "The hidden danger...", "Try this instead..."],
    "caption": "Full Instagram caption with hashtags...",
    "image_prompt": "A dramatic scene of coffee beans and gut bacteria...",
    "reel_id": "GEN-587421",  # auto-generated ID
}

# For posts (generate_post_title):
{
    "title": "Studies Show 73% of College Students Are Sleep Deprived",
    "image_prompt": "A dramatic photograph of a tired student...",
}
```

**Note:** `generate_viral_content()` already returns an `image_prompt` that the manual pipeline uses for AI background generation. Toby v1.0 simply ignores it.

---

## 3. Target Architecture

### 3.1 The New Toby Pipeline

After this change, Toby will use the **exact same `JobProcessor` pipeline** as manual content creation. No duplicated media generation logic.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TOBY v2.0 PIPELINE (Target)                      │
│                                                                     │
│  1. Toby tick → _run_buffer_check()                                │
│     Finds empty slots → create_plans_for_empty_slots()              │
│                                                                     │
│  2. _execute_content_plan() per plan:                               │
│     a. Build PromptContext from NicheConfig                         │
│     b. ContentGeneratorV2.generate_viral_content() → text + prompt  │
│                                                                     │
│  3. ✨ NEW: Create a GenerationJob via JobManager.create_job()      │
│     job_id = "TOBY-{timestamp}"                                     │
│     created_by = "toby"                                             │
│     brands = [plan.brand_id]         (single brand per plan)        │
│     variant = "light"/"dark"/"post"  (from slot pattern)            │
│     fixed_title = True               (content already generated)    │
│     title, content_lines, ai_prompt  (from step 2b)                 │
│                                                                     │
│  4. ✨ NEW: Run JobProcessor.regenerate_brand(job_id, brand)        │
│     Same pipeline as manual:                                        │
│     → generate_thumbnail() → generate_reel_image()                  │
│     → generate_reel_video() → generate_caption()                   │
│     → generate_youtube_title() → generate_youtube_thumbnail()       │
│     → Upload all to Supabase Storage                                │
│     → Update brand_outputs with URLs                                │
│                                                                     │
│  5. ✨ NEW: Auto-schedule with media URLs                           │
│     Read brand_outputs from completed job                           │
│     schedule_reel() with video_path, thumbnail_path, etc.           │
│     Set created_by = "toby" and job_id link                         │
│                                                                     │
│  6. Record toby_content_tags for learning (unchanged)               │
│                                                                     │
│  Result:                                                            │
│  ✅ GenerationJob visible in History page (with "🤖 Toby" badge)    │
│  ✅ ScheduledReel has real media URLs                               │
│  ✅ Calendar shows real thumbnails/previews                         │
│  ✅ Publisher can publish successfully                              │
│  ✅ User can review, regenerate, or cancel before publishing        │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Design Principle: Reuse, Don't Duplicate

Toby should call `JobProcessor.regenerate_brand()` directly — the same function the manual pipeline uses. This means:

- Any future improvements to image generation, video quality, or caption format automatically benefit Toby
- No separate "Toby image pipeline" to maintain
- The media output is identical whether a human or Toby created it
- Job progress tracking, error handling, and retry logic come for free

### 3.3 Design Principle: One Brand Per Job (Toby)

The manual pipeline supports multi-brand jobs (one job → N brands). Toby creates **one job per brand per slot** because:

- Each slot has a specific brand + time + variant
- The learning engine needs per-brand content tagging
- It simplifies error recovery (one brand failure doesn't block others)
- Content differentiation is irrelevant (only one brand per job)

---

## 4. The Gap — What Needs to Change

### 4.1 Full Gap Analysis

| Component | Current State | Target State | Change Required |
|---|---|---|---|
| **`_execute_content_plan()`** | Calls `schedule_reel()` directly with text only | Creates `GenerationJob` → runs `JobProcessor` → schedules with media | **Major rewrite** |
| **`GenerationJob` model** | No `created_by` column | Has `created_by` column (`"user"` or `"toby"`) | **DB migration + model change** |
| **`JobManager.create_job()`** | No `created_by` parameter | Accepts `created_by` parameter | **Parameter addition** |
| **`GenerationJob.to_dict()`** | Doesn't include `created_by` | Returns `created_by` in API response | **Method update** |
| **Frontend `Job` type** | No `created_by` field | Has `created_by?: 'user' \| 'toby'` | **Type addition** |
| **Frontend `ScheduledPost` type** | No `created_by` field | Has `created_by?: 'user' \| 'toby'` | **Type addition** |
| **History page** | No Toby filter | "🤖 Toby" badge + creator filter | **UI addition** |
| **Calendar page** | No Toby indicator | "🤖" badge on Toby content + creator filter | **UI addition** |
| **Scheduling API mapper** | Doesn't map `created_by` | Maps `created_by` from API response | **Mapper update** |
| **Buffer manager** | Calculates empty slots | No change needed | **None** |
| **Content planner** | Creates `ContentPlan` objects | No change needed | **None** |
| **Learning engine** | Tracks experiments/scores | No change needed | **None** |
| **Toby tick interval** | 5 minutes | May need adjustment (media gen takes 60-90s per brand) | **Config tuning** |

### 4.2 Timing Implications

Currently, `_execute_content_plan()` takes ~5-10 seconds (text generation only). After this change, each plan execution will take **60-120 seconds** because of:

| Step | Time (approximate) |
|---|---|
| Text generation (DeepSeek) | 5-10s |
| AI background generation (dark mode only) | 30-60s |
| Thumbnail generation (PIL) | 1-2s |
| Reel image generation (PIL) | 1-2s |
| Video generation (FFmpeg) | 3-5s |
| Caption generation (DeepSeek) | 3-5s |
| YouTube title (DeepSeek) | 2-3s |
| YouTube thumbnail (deAPI) | 10-20s |
| Supabase uploads (4 files) | 3-5s |
| **Total per reel (light)** | **~25-45s** |
| **Total per reel (dark)** | **~60-100s** |
| **Total per post** | **~40-70s** |

**Impact on the Toby tick:** Currently `max_plans=3` per tick. With media generation, 3 dark-mode reels could take ~5 minutes — the entire tick interval. Options:

1. **Reduce `max_plans` to 1-2 per tick** — Safer, fills buffer more slowly but reliably
2. **Run media generation in background threads** — More complex but fills buffer faster
3. **Keep `max_plans=3` but increase tick interval** — Simple but slower to react

**Recommendation:** Start with `max_plans=1` per tick. Since the tick runs every 5 minutes and a single reel takes ~60-100s, Toby can generate ~60-70 pieces per day (more than enough for 6 reels + 2 posts × 5 brands = 40 slots). If buffer gets critical, temporarily increase to `max_plans=2`.

---

## 5. Backend Changes

### 5.1 Revised `_execute_content_plan()`

This is the core change. The function will:

1. Generate text content (unchanged)
2. Create a `GenerationJob` record (NEW)
3. Run `JobProcessor.regenerate_brand()` for reels or `process_post_brand()` for posts (NEW)
4. Read the completed `brand_outputs` for media URLs (NEW)
5. Auto-schedule with full media (REVISED)
6. Record Toby content tags (unchanged)

```python
def _execute_content_plan(db: Session, plan):
    """
    Execute a ContentPlan: generate content, create media, and schedule.

    v2.0: Creates a real GenerationJob and runs the full JobProcessor pipeline
    so that Toby-created content has real images, video, and Supabase URLs.
    """
    from app.services.content.generator import ContentGeneratorV2
    from app.services.content.job_manager import JobManager
    from app.services.content.job_processor import JobProcessor
    from app.services.publishing.scheduler import DatabaseSchedulerService
    from app.services.toby.content_planner import record_content_tag
    from app.core.prompt_context import PromptContext
    from app.services.content.niche_config_service import NicheConfigService

    # ── Step 1: Build PromptContext ──────────────────────────
    niche_svc = NicheConfigService()
    ctx = niche_svc.get_context(user_id=plan.user_id, brand_id=plan.brand_id)
    if not ctx:
        ctx = PromptContext()
    if plan.personality_prompt:
        ctx.personality_modifier = plan.personality_prompt

    # ── Step 2: Generate text content ────────────────────────
    generator = ContentGeneratorV2()
    if plan.content_type == "reel":
        result = generator.generate_viral_content(
            topic_hint=plan.topic_bucket,
            hook_hint=plan.hook_strategy,
            ctx=ctx,
        )
    else:
        result = generator.generate_post_title(
            topic_hint=plan.topic_bucket,
            ctx=ctx,
        )

    if not result or not result.get("title"):
        raise ValueError("Content generation returned empty result")

    # ── Step 3: Determine variant ────────────────────────────
    if plan.content_type == "reel":
        sched_time = datetime.fromisoformat(plan.scheduled_time)
        slot_index = sched_time.hour // 4
        variant = "light" if slot_index % 2 == 0 else "dark"
    else:
        variant = "post"

    # ── Step 4: Create a GenerationJob ───────────────────────
    job_manager = JobManager(db)
    job_id = job_manager.create_job(
        user_id=plan.user_id,
        title=result["title"],
        content_lines=result.get("content_lines", []),
        brands=[plan.brand_id],
        variant=variant,
        ai_prompt=result.get("image_prompt"),
        cta_type=None,                  # Uses NicheConfig default
        platforms=["instagram", "facebook", "youtube"],
        fixed_title=True,               # Content already generated
        created_by="toby",              # ← NEW: marks job as Toby-created
    )

    # Store per-brand content in brand_outputs (so regenerate_brand finds it)
    job_manager.update_brand_output(job_id, plan.brand_id, {
        "title": result["title"],
        "content_lines": result.get("content_lines", []),
        "ai_prompt": result.get("image_prompt", ""),
        "status": "pending",
    })

    # ── Step 5: Run the media pipeline ───────────────────────
    processor = JobProcessor(db)
    if variant == "post":
        media_result = processor.process_post_brand(job_id, plan.brand_id)
    else:
        media_result = processor.regenerate_brand(job_id, plan.brand_id)

    if not media_result.get("success"):
        error = media_result.get("error", "Unknown media generation error")
        raise ValueError(f"Media generation failed: {error}")

    # ── Step 6: Read completed brand_outputs ─────────────────
    job = job_manager.get_job(job_id)
    brand_data = (job.brand_outputs or {}).get(plan.brand_id, {})

    # Update job status to completed
    job_manager.update_job_status(job_id, "completed", progress_percent=100)

    # ── Step 7: Auto-schedule with real media URLs ───────────
    scheduler = DatabaseSchedulerService()
    reel_id = brand_data.get("reel_id", f"toby-{plan.brand_id}-{...}")

    sched_result = scheduler.schedule_reel(
        user_id=plan.user_id,
        reel_id=reel_id,
        scheduled_time=datetime.fromisoformat(plan.scheduled_time),
        caption=brand_data.get("caption", result.get("caption", "")),
        yt_title=brand_data.get("yt_title"),
        platforms=["instagram", "facebook", "youtube"],
        video_path=brand_data.get("video_path"),
        thumbnail_path=brand_data.get("thumbnail_path"),
        yt_thumbnail_path=brand_data.get("yt_thumbnail_path"),
        brand=plan.brand_id,
        variant=variant,
        post_title=result["title"],
        slide_texts=result.get("content_lines", []),
        job_id=job_id,
    )

    # ── Step 8: Mark as Toby-created + record tags ───────────
    schedule_id = sched_result.get("schedule_id", "")
    if schedule_id:
        from app.models.scheduling import ScheduledReel
        sched = db.query(ScheduledReel).filter(
            ScheduledReel.schedule_id == schedule_id
        ).first()
        if sched:
            sched.created_by = "toby"
        record_content_tag(db, plan.user_id, schedule_id, plan)
```

### 5.2 `GenerationJob` Model — Add `created_by`

```python
# In app/models/jobs.py — add column:
created_by = Column(String(20), default="user", nullable=True)

# In to_dict() — add field:
"created_by": self.created_by or "user",
```

**DB migration:**
```sql
ALTER TABLE generation_jobs ADD COLUMN created_by VARCHAR(20) DEFAULT 'user';
```

### 5.3 `JobManager.create_job()` — Add `created_by` Parameter

```python
def create_job(
    self, user_id, title, content_lines, brands, variant,
    ai_prompt=None, cta_type=None, platforms=None, fixed_title=False,
    image_model=None,
    created_by="user",  # ← NEW
) -> str:
    job = GenerationJob(
        ...,
        created_by=created_by,  # ← NEW
    )
```

### 5.4 Reduce `max_plans` Per Tick

In `_run_buffer_check`:

```python
# Before (text-only was fast):
plans = create_plans_for_empty_slots(db, user_id, state, max_plans=3)

# After (media generation takes 60-100s per plan):
plans = create_plans_for_empty_slots(db, user_id, state, max_plans=1)
```

**Rationale:** With 5-minute ticks and ~90s per plan, `max_plans=1` ensures the tick completes well within the interval. The buffer still fills at 12 pieces/hour, which covers 40 daily slots in ~3.5 hours.

### 5.5 Post Variant — Special Handling

For `variant="post"`, the manual pipeline works differently:

1. `process_post_brand()` generates **only an AI background image** (no reel image, no video)
2. The cover slide compositing (title text over background) happens **client-side** in the frontend
3. Carousel text slides are rendered **client-side** via `CarouselTextSlide` component
4. When scheduling, the frontend sends base64-encoded cover + carousel images via `schedule-post-image`

**For Toby posts, the approach is:**

Option A (Simpler): Toby creates the job + generates the AI background, then schedules with the background URL as `thumbnail_path`. The Calendar already handles rendering `CarouselTextSlide` from `slide_texts` metadata for slides 2+. For the cover (slide 0), we use the background image + title from metadata.

Option B (Full parity): Toby renders the cover slide server-side (PIL compositing of title text over background), encodes carousel slides as images, and schedules the fully composed post.

**Recommendation:** Option A for initial implementation. The Calendar frontend already handles text-slide rendering from `slide_texts`. The only missing piece is cover rendering, which can use the AI background + title overlay. Option B can be added later if needed.

---

## 6. Frontend Changes

### 6.1 Types — Add `created_by`

```typescript
// In src/shared/types/index.ts

// Add to Job type:
export interface Job {
    // ... existing fields ...
    created_by?: 'user' | 'toby'
}

// Add to ScheduledPost type:
export interface ScheduledPost {
    // ... existing fields ...
    created_by?: 'user' | 'toby'
}
```

### 6.2 Scheduling API Mapper

```typescript
// In src/features/scheduling/api/scheduling-api.ts
// Add to the getScheduled() response mapper:
created_by: item.created_by || 'user',
```

### 6.3 Calendar Page — Toby Badge + Filter

**Badge on each calendar cell entry:**

When a post has `created_by === 'toby'`, show a small "🤖" icon next to the brand badge. This is subtle enough to not clutter the calendar but immediately tells the user which content Toby created.

```
┌─────────────────────────────────┐
│ 22                              │
│ ┌─────────────────────────────┐ │
│ │ 10:00  🏷️ Gym College 🤖 ☀️│ │  ← 🤖 = Toby created this
│ │ 11:00  🏷️ Healthy College ☀️│ │  ← No 🤖 = user created
│ │ 14:00  🏷️ Gym College 🤖 🌙│ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

**New filter in the filter panel:**

```
Creator
[All] [🤖 Toby] [👤 Manual]
```

This filter is added alongside the existing Content, Platform, and Brand filters.

**Implementation in the filter logic:**

```typescript
type CreatorFilter = 'all' | 'toby' | 'user'

// In postsByDate filtering:
if (creatorFilter !== 'all') {
    const postCreator = post.created_by || 'user'
    if (creatorFilter === 'toby' && postCreator !== 'toby') return
    if (creatorFilter === 'user' && postCreator !== 'user') return
}
```

### 6.4 Calendar Post Detail Modal — Toby Indicator

In the post detail modal, when the post was created by Toby:

```
┌─────────────────────────────────────────┐
│ Post Details                        ✕   │
│ ─────────────────────────────────────── │
│ 🏷️ Gym College  Feb 22, 4:00 PM        │
│ 🤖 Created by Toby                      │  ← NEW: Toby attribution line
│                                          │
│ Why Your Morning Coffee Is...            │
│ [Thumbnail/Video preview]                │  ← NOW: Real media (not "pending")
│                                          │
│ Caption: ...                             │
└──────────────────────────────────────────┘
```

### 6.5 History/Jobs Page — Toby Badge + Filter

**Badge on job cards:**

Each job card that has `created_by === 'toby'` gets a "🤖 Toby" badge:

```
┌──────────────────────────────────────────┐
│ GEN-TOBY-223847                          │
│ 🤖 Toby · Gym College · ☀️ Light        │  ← 🤖 badge
│ "Why Your Morning Coffee..."              │
│ ✅ Completed · Scheduled for Feb 23      │
└──────────────────────────────────────────┘
```

**New filter option:**

Add to the existing `ViewFilter` type:

```typescript
type ViewFilter = 'all' | 'to-schedule' | 'published' | 'scheduled'
                | 'in-progress' | 'other'
                | 'toby'    // ← NEW: show only Toby-created jobs
```

Or add a separate creator filter (similar to Calendar):

```
Creator: [All] [🤖 Toby] [👤 Manual]
```

### 6.6 Job Detail Page — Toby Attribution

When viewing a Toby-created job's detail page, show the Toby attribution:

- "🤖 Created by Toby" label in the header
- All the same functionality is available — the user can regenerate images, edit caption, reschedule, or delete
- This is important: **Toby creates, but the user retains full control**

---

## 7. Data Model Changes

### 7.1 `generation_jobs` Table

```sql
-- Add created_by column
ALTER TABLE generation_jobs ADD COLUMN created_by VARCHAR(20) DEFAULT 'user';
-- Backfill: all existing jobs were user-created
UPDATE generation_jobs SET created_by = 'user' WHERE created_by IS NULL;
```

### 7.2 `scheduled_reels` Table

Already has `created_by` column — no changes needed.

### 7.3 Type Alignment Check

| Field | `GenerationJob` | `ScheduledReel` | Frontend `Job` | Frontend `ScheduledPost` |
|---|---|---|---|---|
| `created_by` | ✅ Add | ✅ Exists | ✅ Add | ✅ Add |
| `job_id` link | N/A | ✅ In `extra_data.job_id` | N/A | ✅ `job_id` field |

---

## 8. Revised Content Generation Flow

### 8.1 Reel Flow (Toby v2.0)

```
ContentPlanner          Orchestrator           JobManager         JobProcessor        Scheduler
     │                      │                      │                  │                  │
     │  ContentPlan:        │                      │                  │                  │
     │  brand=gymcollege    │                      │                  │                  │
     │  type=reel           │                      │                  │                  │
     │  time=2026-02-23T08  │                      │                  │                  │
     │                      │                      │                  │                  │
     │  ──────────────────> │                      │                  │                  │
     │                      │                      │                  │                  │
     │                      │ 1. generate_viral_   │                  │                  │
     │                      │    content()         │                  │                  │
     │                      │    → title, lines,   │                  │                  │
     │                      │      caption, prompt │                  │                  │
     │                      │                      │                  │                  │
     │                      │ 2. create_job(       │                  │                  │
     │                      │    created_by="toby",│                  │                  │
     │                      │    fixed_title=True) │                  │                  │
     │                      │ ──────────────────> │                  │                  │
     │                      │     ← job_id        │                  │                  │
     │                      │                      │                  │                  │
     │                      │ 3. regenerate_brand( │                  │                  │
     │                      │    job_id, brand)    │                  │                  │
     │                      │ ──────────────────────────────────────> │                  │
     │                      │                      │                  │                  │
     │                      │     ← { success,     │  4. thumbnail   │                  │
     │                      │        video_path,   │     reel_image  │                  │
     │                      │        thumb_path }  │     video       │                  │
     │                      │                      │     caption     │                  │
     │                      │                      │     yt_title    │                  │
     │                      │                      │     yt_thumb    │                  │
     │                      │                      │     → Supabase  │                  │
     │                      │                      │                  │                  │
     │                      │ 5. schedule_reel(    │                  │                  │
     │                      │    video_path=url,   │                  │                  │
     │                      │    thumbnail=url,    │                  │                  │
     │                      │    yt_thumb=url)     │                  │                  │
     │                      │ ─────────────────────────────────────────────────────────> │
     │                      │                      │                  │                  │
     │                      │ 6. sched.created_by  │                  │                  │
     │                      │    = "toby"          │                  │                  │
     │                      │    record_content_tag│                  │                  │
     │                      │                      │                  │                  │
```

### 8.2 Post (Carousel) Flow (Toby v2.0)

```
ContentPlanner          Orchestrator           JobManager         JobProcessor        Scheduler
     │                      │                      │                  │                  │
     │  ContentPlan:        │                      │                  │                  │
     │  brand=gymcollege    │                      │                  │                  │
     │  type=post           │                      │                  │                  │
     │                      │                      │                  │                  │
     │  ──────────────────> │                      │                  │                  │
     │                      │                      │                  │                  │
     │                      │ 1. generate_post_    │                  │                  │
     │                      │    title()           │                  │                  │
     │                      │    → title, prompt   │                  │                  │
     │                      │                      │                  │                  │
     │                      │ 2. create_job(       │                  │                  │
     │                      │    variant="post",   │                  │                  │
     │                      │    created_by="toby")│                  │                  │
     │                      │ ──────────────────> │                  │                  │
     │                      │                      │                  │                  │
     │                      │ 3. process_post_     │                  │                  │
     │                      │    brand(job, brand) │                  │                  │
     │                      │ ──────────────────────────────────────> │                  │
     │                      │                      │                  │                  │
     │                      │     ← { success,     │  4. AI          │                  │
     │                      │        thumbnail }   │     background  │                  │
     │                      │                      │     → Supabase  │                  │
     │                      │                      │                  │                  │
     │                      │ 5. schedule_reel(    │                  │                  │
     │                      │    thumbnail=url,    │                  │                  │
     │                      │    slide_texts=...,  │                  │                  │
     │                      │    post_title=...)   │                  │                  │
     │                      │ ─────────────────────────────────────────────────────────> │
     │                      │                      │                  │                  │
```

---

## 9. Scheduling & Calendar Integration

### 9.1 How Toby Content Appears in Calendar

After v2.0, Toby content in the Calendar will look exactly like user content, with these additions:

| Element | User Content | Toby Content |
|---|---|---|
| Month view cell | `10:00 Gym College` | `10:00 Gym College 🤖` |
| Day view card | Brand badge + ☀️/🌙 | Brand badge + ☀️/🌙 + 🤖 |
| Post detail modal | Normal preview | Normal preview + "🤖 Created by Toby" |
| Cover image (post) | Rendered AI background | Same — real AI background from pipeline |
| Reel thumbnail | Real thumbnail PNG | Same — real thumbnail from pipeline |
| Video player | Real video MP4 | Same — real video from pipeline |
| "Schedule" button | Manual scheduling | Auto-scheduled (already set) |

### 9.2 How Toby Content Appears in History/Jobs

| Element | User Content | Toby Content |
|---|---|---|
| Job card | `GEN-001234` | `TOBY-223847 🤖` |
| Brand outputs | Same | Same — real thumbnails, video, caption |
| Schedule button | User clicks to schedule | Already auto-scheduled, button shows "Scheduled ✓" |
| Regenerate | Available | Available — user can regenerate Toby's images |
| Delete | Available | Available — user can delete Toby-created jobs |

### 9.3 Job ID Format

To make Toby jobs easily distinguishable in logs and URLs:

```python
# Current manual job IDs:
"GEN-001234"

# Toby job IDs:
"TOBY-001234"
```

This is purely visual — the same `GenerationJob` model is used.

---

## 10. Error Handling & Resilience

### 10.1 Media Generation Failure

```
_execute_content_plan():
  try:
    result = processor.regenerate_brand(job_id, brand)
  except Exception:
    # Media generation failed — job stays in "failed" state
    # The empty slot will be detected on next buffer check
    # Toby will create a new plan for the same slot
    job_manager.update_job_status(job_id, "failed", error_message=str(e))
    raise  # Re-raise so the caller logs it
```

**Key resilience property:** The slot remains empty and the buffer manager will detect it on the next tick. It will try again with a new `ContentPlan` — potentially with different content, which avoids getting stuck on one bad image prompt.

### 10.2 Supabase Storage Failure

Handled by `regenerate_brand()` — it already retries and raises `StorageError` on failure. The Toby error handling wraps this.

### 10.3 DeepSeek API Failure

Two AI calls can fail:
1. **Text generation** (`generate_viral_content()`) — fails fast, slot remains empty, will retry next tick
2. **AI background** (dark variant only, via `AIBackgroundGenerator`) — fails during `regenerate_brand()`, same as 10.1

### 10.4 Railway Deploy During Media Generation

If Railway deploys while `regenerate_brand()` is running:
- The `GenerationJob` will have `status="generating"` in the DB
- On next startup, the existing `startup_event` recovery logic detects stale "generating" jobs and resets them to "failed"
- Toby's buffer check will detect the empty slot and create a new plan

**No data corruption risk.** Temp files are cleaned up, Supabase uploads are atomic (partial uploads don't create broken objects).

---

## 11. Performance & Rate Limiting

### 11.1 API Rate Limits

| Service | Rate Limit | Toby's Usage | Safety Margin |
|---|---|---|---|
| DeepSeek API | ~60 req/min | ~2-3 calls/plan (text + caption + yt_title) | Plenty — 1 plan per 5min tick = 0.6 req/min |
| deAPI (image gen) | ~10 req/min | 1-2 calls/plan (background + yt_thumb) | OK with `max_plans=1` |
| Supabase Storage | ~100 uploads/min | 4 files/plan | Plenty |
| Instagram Graph API | 200 req/hour | Only during metrics check (every 6h) | Plenty |

### 11.2 Supabase Storage Growth

Each reel generates ~4 files:
- Thumbnail PNG: ~200KB
- Reel PNG: ~300KB
- Video MP4: ~2MB
- YT Thumbnail: ~150KB
- **Total: ~2.7MB per reel**

At 40 slots/day × 2.7MB = **~108MB/day** → **~3.2GB/month**

Each post generates ~1 file:
- AI Background PNG: ~500KB

This is manageable for Supabase's free tier (1GB) in the short term, and easily scalable with their paid plans.

### 11.3 Database Growth

Each Toby plan creates:
- 1 `GenerationJob` row (~2KB)
- 1 `ScheduledReel` row (~1KB)
- 1 `toby_content_tags` row (~0.5KB)
- 1 `toby_activity_log` row (~0.3KB)

At 40 plans/day: **~150KB/day** → **~4.5MB/month** — negligible.

---

## 12. Implementation Phases

### Phase 1: Foundation (Backend — 2-3 hours)

**Goal:** Toby creates real `GenerationJob` records and runs the media pipeline.

- [ ] Add `created_by` column to `generation_jobs` table (DB migration)
- [ ] Add `created_by` to `GenerationJob` model + `to_dict()`
- [ ] Add `created_by` parameter to `JobManager.create_job()`
- [ ] Rewrite `_execute_content_plan()` to use `JobManager` + `JobProcessor`
- [ ] Reduce `max_plans` to 1 per tick
- [ ] Test: Enable Toby, verify a `GenerationJob` is created with real media

### Phase 2: Frontend Types & API (1-2 hours)

**Goal:** Frontend can read `created_by` from API responses.

- [ ] Add `created_by` to `Job` and `ScheduledPost` TypeScript types
- [ ] Update `scheduling-api.ts` mapper to include `created_by`
- [ ] Update jobs API mapper to include `created_by`
- [ ] Verify data flows from DB → API → Frontend correctly

### Phase 3: Calendar Integration (1-2 hours)

**Goal:** Calendar shows Toby badge and creator filter.

- [ ] Add 🤖 badge to calendar cell entries when `created_by === 'toby'`
- [ ] Add 🤖 badge to day-view cards
- [ ] Add "🤖 Created by Toby" line in post detail modal
- [ ] Add creator filter (`[All] [🤖 Toby] [👤 Manual]`) to filter panel
- [ ] Include creator filter in `postsByDate` filtering logic

### Phase 4: History/Jobs Integration (1-2 hours)

**Goal:** Jobs page shows Toby badge and filter.

- [ ] Add 🤖 badge to job cards when `created_by === 'toby'`
- [ ] Add creator filter to History page
- [ ] Show "🤖 Created by Toby" in job detail header
- [ ] Verify Toby jobs have correct brand_outputs with media URLs

### Phase 5: Testing & Tuning (1-2 hours)

**Goal:** Full end-to-end verification.

- [ ] Enable Toby, let it create 2-3 pieces of content
- [ ] Verify Calendar shows real previews (no more "Cover not available")
- [ ] Verify History page shows Toby jobs with real media
- [ ] Verify auto-publisher can publish Toby content successfully
- [ ] Tune `max_plans` if needed based on observed generation times
- [ ] Monitor Railway logs for errors during Toby ticks

---

## 13. Risk Matrix

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Media generation takes longer than tick interval | Medium — buffer fills slowly | Medium | `max_plans=1`, monitor timing, adjust if needed |
| deAPI image gen fails frequently | High — no AI background | Low | Light variant doesn't need AI background; fallback to light |
| Supabase storage fills up | Medium — uploads fail | Low | Monitor usage; storage is cheap to scale |
| `JobProcessor` blocks the Toby tick thread | High — tick stops entirely | Medium | Use thread timeout (existing pattern in `process_job`) |
| User confused by Toby jobs in History | Low — UI clutter | Medium | Clear 🤖 badge + filter to hide Toby jobs |
| Content differentiation not needed but still runs | Low — wasted time | Low | `fixed_title=True` + single brand = no differentiation |
| Caption quality differs between manual and Toby | Low — inconsistency | Low | Both use same `CaptionGenerator` — identical output |
| YouTube thumbnail gen adds 10-20s | Low — slower overall | High | Accept the cost; YT thumbnails are valuable for cross-platform |

---

*This spec builds on [toby-architecture-spec.md](toby-architecture-spec.md). The intelligence engine (learning, experiments, discovery) is unchanged — this spec only addresses the media pipeline gap.*
