# Posts Feature Fix — Comprehensive Spec

> **Status**: Research Complete — Ready for Implementation  
> **Date**: 2026-02-13  
> **Scope**: Title line count fix + Maestro post-creation code unification

---

## Table of Contents

1. [Current Architecture](#1-current-architecture)
2. [Identified Bugs](#2-identified-bugs)
3. [Proposed Fix: Title Line Count](#3-proposed-fix-title-line-count)
4. [Proposed Fix: ALL CAPS Quality Scorer](#4-proposed-fix-all-caps-quality-scorer)
5. [Proposed Refactoring: Maestro Post-Creation Unification](#5-proposed-refactoring-maestro-post-creation-unification)
6. [File-by-File Change Plan](#6-file-by-file-change-plan)

---

## 1. Current Architecture

### 1.1 What is a "Post"?

A Post is a `GenerationJob` (in `app/models.py`) with `variant = "post"`. Unlike reels (which produce videos), posts produce:
- A **cover slide** (1080×1350): AI-generated background image + title text overlay + brand logo + gradient
- **Carousel slides** (2-4 additional slides): solid light beige background + black text paragraphs

Posts are composited **client-side** using Konva.js (`PostCanvas.tsx`), with server-side compositing (`post_compositor.py`) used only at publish time.

### 1.2 Architecture Diagram — "Generate Posts" Flow (Source of Truth)

```
User clicks "Generate Posts" on /posts page
    │
    ▼
[src/pages/Posts.tsx]
    │  POST /jobs/create  { variant: "post", brands: [...], ai_prompt: topic_hint }
    ▼
[app/api/jobs_routes.py] → create endpoint
    │  Creates GenerationJob in PostgreSQL
    │  Spawns background: process_job(job_id)
    ▼
[app/services/job_manager.py] → process_job()
    │  Detects variant == "post" (Line 271)
    │  Calls content_generator_v2.generate_post_titles_batch(N, topic_hint)
    ▼
[app/services/content_generator_v2.py] → generate_post_titles_batch()
    │  Builds prompt via prompt_templates.build_post_content_prompt()
    │  Calls DeepSeek API (temperature=0.95, max_tokens=8000)
    │  Returns N unique {title, caption, ai_prompt, slide_texts} objects
    ▼
[app/services/job_manager.py] → process_job() continues
    │  Stores per-brand data in brand_outputs (Lines 286-293)
    │  Loops brands → process_post_brand() per brand
    ▼
[app/services/job_manager.py] → process_post_brand()
    │  Calls AIBackgroundGenerator().generate_post_background(ai_prompt)
    │  Saves PNG to output/posts/
    │  Does NOT render text — that's client-side
    ▼
[src/pages/PostJobDetail.tsx]
    │  Shows brand cards with PostCanvas (Konva.js)
    │  User can edit title, caption, slides, font size
    │  User clicks "Auto Schedule" → captures canvas as PNG
    ▼
[app/api/routes.py] → POST /reels/schedule-post-image
    │  Saves base64 PNG to disk
    │  Creates ScheduledReel with variant="carousel" or "post"
    ▼
[app/services/social_publisher.py]
    │  Publishes to Instagram/Facebook when scheduled time arrives
```

### 1.3 Architecture Diagram — Maestro Flow (Divergent, Needs Unification)

```
Maestro daemon runs on schedule
    │
    ▼
[app/services/maestro.py] → run_cycle()
    │  Picks agent (GenericAgent from DB config)
    │  Calls agent.run(content_type="post", brand=brand)
    ▼
[app/services/generic_agent.py] → _generate_proposal()
    │  Uses POST_SYSTEM_PROMPT_TEMPLATE (Line 113)
    │  Calls DeepSeek with strategy-based prompt
    │  Creates TobyProposal in DB (status="pending")
    ▼
[app/services/maestro_examiner.py]
    │  Scores proposal with 2nd DeepSeek call
    │  Auto-accepts if score ≥ threshold
    ▼
[app/services/maestro.py] → _create_and_dispatch_job()
    │  Creates GenerationJob from proposal
    │  variant="post", brands=[single_brand]
    │  Calls process_job() + auto_schedule_job()
    ▼
  (Same job_manager.py pipeline from here)
```

**Alternative Maestro path** (manual acceptance via UI):
```
User clicks "Accept" on proposal in UI
    │
    ▼
[app/api/maestro_routes.py] → POST /api/maestro/proposals/{id}/accept
    │  DIVERGENT LOGIC (see bugs below)
    │  Creates GenerationJob + processes + auto-schedules
```

### 1.4 Key Files Inventory

| File | Role | LOC (approx) |
|------|------|-------|
| `app/services/job_manager.py` | Job lifecycle + post processing | Core |
| `app/services/content_generator_v2.py` | AI title/content generation (active) | Core |
| `app/core/prompt_templates.py` | Prompt builder for batch post generation | Core |
| `app/services/post_compositor.py` | Server-side image compositing at publish time | Core |
| `app/services/ai_background_generator.py` | AI background image via DALL-E/similar | Core |
| `src/pages/Posts.tsx` | Posts creation UI | Frontend |
| `src/pages/PostJobDetail.tsx` | Post job detail + PostCanvas rendering | Frontend |
| `src/shared/components/PostCanvas.tsx` | Konva.js canvas for post preview | Frontend |
| `app/services/maestro.py` | Maestro orchestrator | Needs unification |
| `app/services/generic_agent.py` | DB-driven AI agent (active) | Needs unification |
| `app/api/maestro_routes.py` | Maestro API endpoints | Needs unification |
| `app/services/maestro_examiner.py` | Proposal quality scoring | Keep |
| `app/services/toby_agent.py` | Legacy hardcoded agent | Dead code |
| `app/services/lexi_agent.py` | Legacy hardcoded agent | Dead code |
| `app/services/maestro_old_backup.py` | Old Maestro orchestrator | Dead code |
| `app/services/toby_daemon.py` | Old daemon (only toby_log redirect used) | Mostly dead |

---

## 2. Identified Bugs

### Bug 1: Title Always Renders as 2 Lines Instead of 3

**Severity**: HIGH — affects visual quality of every post

**Root Cause**: The AI generates titles that are too short for 3-line rendering.

**Technical Details**:

The `_auto_fit_font_size()` algorithm in `post_compositor.py` (Lines 84-98) actually **prefers 3 lines**:
```python
# Step 1: Try 3 lines first (90px → 64px)
for fs in range(90, 64 - 1, -2):
    if _count_lines(text, max_width, fs) == 3:
        return fs

# Step 2: Fall back to 2 lines (90px → 30px)
for fs in range(90, 30 - 1, -2):
    if _count_lines(text, max_width, fs) == 2:
        return fs
```

The `_count_lines()` function uses `avg_char_width = font_size * 0.48` to estimate how many characters fit per line:
- At 90px: `max_chars = 990 / (90 × 0.48) = 22 chars/line`
- For 3 lines: title needs **≥45 characters** (22 × 2 + 1)
- For 3 lines at any font down to 64px: title needs **~45-65 characters**

**But the AI prompts say**: "A short, clear health statement" with **no word/character count target**.

Result: DeepSeek generates titles of ~4-7 words (~30-50 chars), which only fill 2 lines.

**Location of the problem**:
- `app/core/prompt_templates.py` Lines 517-666: `build_post_content_prompt()` — no title length constraint
- `app/services/content_generator_v2.py` Lines 343-536: `generate_post_title()` — inline prompt, no length constraint
- `app/services/generic_agent.py` Lines 113-167: `POST_SYSTEM_PROMPT_TEMPLATE` — no length constraint

**NOT the problem**:
- `post_compositor.py` — the algorithm correctly prefers 3 lines when given enough text
- `PostCanvas.tsx` — uses its own `autoFitFontSize()` but same general approach
- `MAX_TITLE_LENGTH = 50` in `constants.py` — defined but never used/enforced anywhere

### Bug 2: ALL CAPS Quality Scorer Contradiction

**Severity**: LOW — quality scorer for posts is in `content_tracker.py`, not `quality_scorer.py`

**Details**:
- `app/core/quality_scorer.py` Lines 143-146: Penalizes titles that are NOT ALL CAPS (enforces ALL CAPS for reels)
- AI prompts for posts also instruct "ALL CAPS"
- This is actually consistent for reels. For posts, a separate `check_post_quality()` in `content_tracker.py` is used.
- **However**: `content_tracker.py`'s post quality check should also enforce ALL CAPS for consistency.
- User confirmed: ALL CAPS is the desired behavior. Ensure no quality gate contradicts this.

### Bug 3: Maestro `accept_proposal()` Diverges from `_create_and_dispatch_job()`

**Severity**: MEDIUM — can cause wrong data when accepting proposals via UI

**Details** (comparing `maestro_routes.py` Line 239 vs `maestro.py` Line 671):

| Aspect | `maestro_routes.py` accept_proposal | `maestro.py` _create_and_dispatch_job |
|--------|--------------------------------------|---------------------------------------|
| Brands | Falls back to ALL_BRANDS | Always single brand |
| Platforms | Always `["instagram", "facebook", "youtube"]` for ALL types | Posts get `["instagram", "facebook"]` only |
| content_lines | Uses `proposal.content_lines` directly — **ignores `slide_texts`** | Correctly uses `slide_texts if is_post else content_lines` |
| Processing | `background_tasks.add_task()` | `threading.Thread` with semaphore |

**The `content_lines` bug is the most impactful**: When accepting a post proposal via the UI, `slide_texts` are lost and `content_lines` (meant for reels) is used instead.

### Bug 4: ~1,600 Lines of Dead/Duplicate Agent Code

**Severity**: LOW (maintenance burden, not user-facing)

**Details**:
- `toby_agent.py` — legacy hardcoded agent, fully replaced by `generic_agent.py`
- `lexi_agent.py` — legacy hardcoded agent, ~95% duplicated code with `toby_agent.py`
- `maestro_old_backup.py` — old Maestro orchestrator, not imported anywhere active
- `toby_daemon.py` — old daemon, only `toby_log()` function is still imported (as a redirect to `logging_service`)

### Bug 5: Font Mismatch Between Preview and Publish (NON-ISSUE per user)

**Severity**: INFORMATIONAL — user confirmed cover format should not be touched

**Details**:
- Client preview (PostCanvas.tsx) uses **Anton** font
- Server publish (post_compositor.py) uses **Poppins-Bold** font
- Different character widths mean line breaks may differ between preview and published image
- User says the cover format is correct as-is and should not be changed. The font/layout is user-configurable.

---

## 3. Proposed Fix: Title Line Count

### Goal
Titles should **prefer 3 lines but allow 2**. This means the AI should generate longer titles (8-14 words, ~55-90 characters), but shorter titles that naturally fit in 2 lines should not be rejected.

### Changes Required

#### 3.1 Update `build_post_content_prompt()` in `app/core/prompt_templates.py`

**Current** (Line ~530): "A short, clear health statement written in ALL CAPS"

**Proposed**: Add explicit word count guidance:
```
"A bold, impactful health statement written in ALL CAPS.
TITLE MUST BE 8-14 WORDS LONG (approximately 55-90 characters).
The title should fill 3 lines on the cover slide — make it punchy but substantial.
Examples of good length:
- 'HOW YOUR SLEEP SCHEDULE IS DESTROYING YOUR MUSCLE RECOVERY' (10 words)
- 'THE HIDDEN REASON YOUR PROTEIN INTAKE ISN'T BUILDING MUSCLE' (9 words)
- 'WHY MOST PEOPLE FAIL AT BUILDING HEALTHY HABITS AND HOW TO FIX IT' (12 words)"
```

Apply the same constraint to all 3 title style varieties in the prompt.

#### 3.2 Update inline prompt in `generate_post_title()` in `app/services/content_generator_v2.py`

**Location**: Lines 395-496 (the inline f-string prompt)

Add the same 8-14 word constraint to the title generation instructions.

Also update the example titles in the prompt to be longer (8-14 words each) so the AI learns the desired length from examples.

#### 3.3 Update `POST_SYSTEM_PROMPT_TEMPLATE` in `app/services/generic_agent.py`

**Location**: Lines 113-167

Add word count guidance to the title section:
```
1) TITLE — The main hook on the cover slide. ALL CAPS. Bold, statement-based.
   MUST BE 8-14 WORDS (55-90 characters). Should fill 3 lines on the cover.
```

#### 3.4 (Optional) Update `MAX_TITLE_LENGTH` in `app/core/constants.py`

Either:
- Update from 50 to 90 and actually use it as a validation check
- Or remove it entirely since it's unused dead code

Recommended: Update to `MAX_TITLE_LENGTH = 90` and `MIN_TITLE_LENGTH = 55` and add a soft validation in `content_generator_v2.py` that logs a warning if a generated title falls outside the range (but doesn't reject it, since user said "prefer 3, allow 2").

---

## 4. Proposed Fix: ALL CAPS Quality Scorer

### Goal
Ensure ALL CAPS is enforced consistently and no quality gate penalizes it.

### Changes Required

#### 4.1 Verify `check_post_quality()` in `app/services/content_tracker.py`

Read the post-specific quality check and ensure it does NOT penalize ALL CAPS titles. If it does, remove that penalty.

#### 4.2 `app/core/quality_scorer.py` — No change needed

Lines 143-146 already enforce ALL CAPS for reels (penalizes if NOT all caps). This is correct and consistent.

---

## 5. Proposed Refactoring: Maestro Post-Creation Unification

### Goal
Unify Maestro's post-creation path to use the same pipeline as the "Generate Posts" button, eliminating divergent code. Only touch post-creation-related code; leave Maestro's other features (scheduling, reel creation, agent strategies, examiner) intact.

### 5.1 Unify `accept_proposal()` in `maestro_routes.py`

**Problem**: Lines 239-339 have divergent logic from `maestro.py`'s `_create_and_dispatch_job()`.

**Fix**: Refactor `accept_proposal()` to:
1. For posts: use `slide_texts` from the proposal (not `content_lines`)
2. For posts: set platforms to `["instagram", "facebook"]` (no YouTube)
3. For posts: use `variant="post"` (already does this)
4. Delegate to a shared helper or call `maestro._create_and_dispatch_job()` directly

### 5.2 Ensure `_create_and_dispatch_job()` in `maestro.py` stays aligned

**Current code** (Lines 671-726) is mostly correct. Ensure:
- It passes `slide_texts` correctly to `brand_outputs`
- The created job has the same shape as one created by `/jobs/create`

### 5.3 Remove Dead Code

| File | Action | Reason |
|------|--------|--------|
| `app/services/toby_agent.py` | Delete | Fully replaced by `generic_agent.py` |
| `app/services/lexi_agent.py` | Delete | Fully replaced by `generic_agent.py` |
| `app/services/maestro_old_backup.py` | Delete | Old Maestro, not imported |
| `app/services/toby_daemon.py` | Gut contents, keep `toby_log()` redirect | Only `toby_log()` is still imported |

### 5.4 Verify no imports break

After deleting dead files, grep for all imports of:
- `toby_agent` → should only be in `maestro.py`'s `optimize-now` path (needs migration to `generic_agent`)
- `lexi_agent` → should only be in `maestro.py`'s `optimize-now` path
- `maestro_old_backup` → should be zero
- `toby_daemon` → only `toby_log` import (redirect to `logging_service`)

### 5.5 Migrate `optimize-now` away from legacy agents

`maestro.py`'s `optimize-now` mode bypasses GenericAgent and calls Toby/Lexi directly. After deleting those files, `optimize-now` should use GenericAgent instead, or be removed if unused.

---

## 6. File-by-File Change Plan

### Phase 1: Title Line Count Fix (Minimal, High Impact)

| # | File | Change | Lines Affected |
|---|------|--------|----------------|
| 1 | `app/core/prompt_templates.py` | Add "8-14 words" constraint to `build_post_content_prompt()` title rules | ~530-560 |
| 2 | `app/services/content_generator_v2.py` | Add "8-14 words" constraint to inline prompt in `generate_post_title()`. Update example titles to be 8-14 words. | ~395-496 |
| 3 | `app/services/generic_agent.py` | Add "8-14 words" constraint to `POST_SYSTEM_PROMPT_TEMPLATE` | ~113-167 |
| 4 | `app/core/constants.py` | Update `MAX_TITLE_LENGTH = 90`, add `MIN_TITLE_LENGTH = 55` (or delete if we don't use them) | ~20 |

### Phase 2: Quality Scorer Fix (Trivial)

| # | File | Change | Lines Affected |
|---|------|--------|----------------|
| 5 | `app/services/content_tracker.py` | Verify `check_post_quality()` doesn't penalize ALL CAPS. Fix if it does. | TBD |

### Phase 3: Maestro Post-Creation Unification

| # | File | Change | Lines Affected |
|---|------|--------|----------------|
| 6 | `app/api/maestro_routes.py` | Fix `accept_proposal()`: use `slide_texts` for posts, correct platforms, unify with maestro.py logic | ~239-339 |
| 7 | `app/services/maestro.py` | Verify `_create_and_dispatch_job()` alignment. Migrate `optimize-now` from Toby/Lexi to GenericAgent. | ~671-726 + optimize-now section |

### Phase 4: Dead Code Cleanup

| # | File | Change | Lines Affected |
|---|------|--------|----------------|
| 8 | `app/services/toby_agent.py` | Delete file | Entire file |
| 9 | `app/services/lexi_agent.py` | Delete file | Entire file |
| 10 | `app/services/maestro_old_backup.py` | Delete file | Entire file |
| 11 | `app/services/toby_daemon.py` | Gut contents, keep `toby_log()` as redirect to `logging_service` | Most of file |
| 12 | All files importing deleted modules | Update imports, remove references | Grep + fix |

### Phase 5: Verification

| # | Action |
|---|--------|
| 13 | Run existing tests: `test_content_logic.py`, `test_phase2.py`, `test_v2_architecture.py` |
| 14 | Test "Generate Posts" button flow end-to-end |
| 15 | Test Maestro proposal → accept flow |
| 16 | Verify generated titles are 8-14 words |
| 17 | Verify published images match preview (cover + carousel slides) |

---

## Appendix A: Title Length Math

For the `_auto_fit_font_size()` algorithm with `max_width = 990px`:

| Font Size | Char Width (×0.48) | Max Chars/Line | Chars for 3 Lines |
|-----------|-------------------|----------------|-------------------|
| 90px | 43.2px | 22 chars | ≥45 chars |
| 80px | 38.4px | 25 chars | ≥51 chars |
| 72px | 34.6px | 28 chars | ≥57 chars |
| 64px | 30.7px | 32 chars | ≥65 chars |

At the smallest 3-line font (64px), a title needs ≥65 characters. At 90px, only ≥45.
With the "8-14 words" constraint (~55-90 chars), titles will reliably hit 3 lines at font sizes between 90px and 64px.

## Appendix B: Example Title Lengths

**Current titles (too short for 3 lines)**:
- "STOP DOING CARDIO WRONG" — 4 words, 24 chars → 2 lines at 90px
- "YOUR GUT HEALTH MATTERS MORE" — 5 words, 29 chars → 2 lines at 90px

**Target titles (3 lines)**:
- "HOW YOUR SLEEP SCHEDULE IS DESTROYING YOUR MUSCLE RECOVERY" — 10 words, 59 chars → 3 lines at 90px
- "THE HIDDEN REASON YOUR PROTEIN INTAKE ISN'T BUILDING MUSCLE" — 9 words, 60 chars → 3 lines at 90px
- "WHY MOST PEOPLE FAIL AT BUILDING HEALTHY HABITS AND HOW TO FIX IT" — 12 words, 67 chars → 3 lines at 80px

---

*End of spec. Do NOT implement — research only.*
