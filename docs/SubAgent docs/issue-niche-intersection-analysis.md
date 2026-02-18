# Issue ↔ Niche Config Intersection Analysis

> **Date:** 2026-02-18  
> **Purpose:** Deep cross-reference between the 25-issue infrastructure audit and the niche-configuration-architecture-v2 feature  
> **Inputs:** `eight-issues-spec.md`, `five-issues-research.md`, `stuck-jobs-research.md`, `hardcoded-niche-audit.md`, `brand-prompts-audit.md`, `niche-configuration-architecture-v2.md`, plus 8 backend source files  

---

## Issue Classification Legend

| Tag | Meaning |
|-----|---------|
| **BLOCKING** | Must be fixed BEFORE niche config can be safely implemented |
| **SYNERGY** | Fixing this issue AND implementing niche config can share work — refactor once |
| **INDEPENDENT** | No meaningful code-path intersection |
| **CAUTION** | Niche config would make this problem WORSE if implemented before the fix |

---

## Master Issue List (25 Issues)

| # | Issue | Source Doc | Classification |
|---|-------|-----------|----------------|
| 1 | Profile Input Pencil Icon Overlapping Text | eight-issues-spec | INDEPENDENT |
| 2 | Post Title Font Size Auto-Fit Logic | eight-issues-spec | INDEPENDENT |
| 3 | Scheduling Success Messages | eight-issues-spec | INDEPENDENT |
| 4 | Auto-Schedule Slide Flicker | eight-issues-spec | INDEPENDENT |
| 5 | Brand Prompts on /brands Page (3 textareas) | eight-issues-spec | SYNERGY |
| 6 | Railway Volume Cleanup | eight-issues-spec | INDEPENDENT |
| 7 | Calendar Filter Compact Box | eight-issues-spec | INDEPENDENT |
| 8 | Posts Page Title/Prompt Layout | eight-issues-spec | INDEPENDENT |
| 9 | Posts.tsx Grid Layout — Preview 25% | five-issues-research | INDEPENDENT |
| 10 | Job Progress Not Showing Intermediate States | five-issues-research | INDEPENDENT |
| 11 | Font Auto-Fit Producing 5 Lines Instead of 4 | five-issues-research | INDEPENDENT |
| 12 | Content Prompts Tab Ordering | five-issues-research | SYNERGY |
| 13 | Content Prompts Wiring Verification | five-issues-research | SYNERGY |
| 14 | Stuck Jobs — Maestro Semaphore | stuck-jobs-research | BLOCKING |
| 15 | 145+ Hardcoded Niche/Topic References (Group A) | hardcoded-niche-audit | SYNERGY |
| 16 | 12 Hardcoded Target Audience References (Group B) | hardcoded-niche-audit | SYNERGY |
| 17 | 14 Hardcoded Tone/Style References (Group C) | hardcoded-niche-audit | SYNERGY |
| 18 | 18 Hardcoded Brand Personality References (Group D) | hardcoded-niche-audit | SYNERGY |
| 19 | 74+ Hardcoded Examples (Group E) | hardcoded-niche-audit | SYNERGY |
| 20 | 22 Hardcoded Image/Visual Style (Group F) | hardcoded-niche-audit | SYNERGY |
| 21 | 19 Hardcoded CTA/Caption References (Group G) | hardcoded-niche-audit | SYNERGY |
| 22 | Prompts Appended at End ("Whisper Effect") | brand-prompts-audit | SYNERGY |
| 23 | Prompts Are Global Only, Not Per-Brand | brand-prompts-audit | SYNERGY |
| 24 | SYSTEM_PROMPT Hardcoded Niche Identity | brand-prompts-audit | SYNERGY |
| 25 | Duplicate/Overlapping Definitions Across Files | hardcoded-niche-audit | CAUTION |

---

## Classification Summary

| Category | Count | Issues |
|----------|-------|--------|
| **BLOCKING** | 1 | #14 |
| **SYNERGY** | 13 | #5, #12, #13, #15–24 |
| **INDEPENDENT** | 10 | #1–4, #6–11 |
| **CAUTION** | 1 | #25 |

---

## Detailed Per-Issue Analysis

---

### Issue #1: Profile Input Pencil Icon Overlapping Text
**Source:** eight-issues-spec.md  
**Classification:** INDEPENDENT

**Issue → Niche Config Impact:** None. This is a CSS padding issue on `src/pages/Profile.tsx`. The niche config feature does not touch the Profile page.

**Niche Config → Issue Impact:** None. Profile page is entirely unrelated.

**Shared Code Paths:** Zero overlap.

**Dependency Direction:** Fully parallel. Fix anytime.

---

### Issue #2: Post Title Font Size Auto-Fit Logic
**Source:** eight-issues-spec.md  
**Classification:** INDEPENDENT

**Issue → Niche Config Impact:** None. This is frontend rendering logic in `PostCanvas.tsx` and backend `image_generator.py`. These deal with pixel-level text layout, not what content is generated.

**Niche Config → Issue Impact:** None. Niche config changes WHAT content says, not HOW titles are rendered.

**Shared Code Paths:** Zero. `PostCanvas.tsx` and `image_generator.py` are downstream consumers of generated content — they don't interact with prompt templates or niche configuration.

**Dependency Direction:** Fully parallel.

---

### Issue #3: Scheduling Success Messages
**Source:** eight-issues-spec.md  
**Classification:** INDEPENDENT

**Issue → Niche Config Impact:** None. This is a string formatting issue in `PostJobDetail.tsx`.

**Niche Config → Issue Impact:** None.

**Shared Code Paths:** Zero.

**Dependency Direction:** Fully parallel.

---

### Issue #4: Auto-Schedule Slide Flicker
**Source:** eight-issues-spec.md  
**Classification:** INDEPENDENT

**Issue → Niche Config Impact:** None. This is a React rendering optimization issue in `PostJobDetail.tsx` where `setBrandSlideIndex` causes visible UI flickers during capture.

**Niche Config → Issue Impact:** None. Niche config doesn't touch the scheduling/capture pipeline.

**Shared Code Paths:** Zero.

**Dependency Direction:** Fully parallel.

---

### Issue #5: Brand Prompts on /brands Page (3 Textareas)
**Source:** eight-issues-spec.md  
**Classification:** SYNERGY ⭐

**Issue → Niche Config Impact:** This issue requests 3 global textareas (reels_prompt, posts_prompt, brand_description) on the Brands page. Niche config v2 **replaces these 3 textareas entirely** with the structured "Content DNA" form (7+ sections, tag inputs, examples, etc.). Fixing this issue independently would create throwaway UI.

**Niche Config → Issue Impact:** Niche config's Phase 1 frontend task (#10 in v2 plan) directly supersedes this issue. The `ContentPromptsCard` component at `src/features/brands/components/ContentPromptsCard.tsx` is the target of both.

**Shared Code Paths:**
- `src/features/brands/components/ContentPromptsCard.tsx` — replaced by `NicheConfigForm`
- `src/features/brands/api/use-prompts.ts` — replaced by `use-niche-config.ts`
- `src/pages/Brands.tsx` — tab content rendering
- `app/api/brands/routes.py` — GET/PUT `/prompts` endpoint
- `app/core/prompt_templates.py` → `get_content_prompts()` — read path

**Dependency Direction:** Do NOT fix this issue independently. Let niche config Phase 1 handle it. The existing 3 textareas are the legacy fallback during migration.

**Optimal Strategy:** Skip Issue #5 entirely. Niche config Phase 1 frontend (#10) replaces it. If a temporary fix is needed before niche config, keep it minimal (don't invest in UI polish for a component being replaced).

---

### Issue #6: Railway Volume Cleanup
**Source:** eight-issues-spec.md  
**Classification:** INDEPENDENT

**Issue → Niche Config Impact:** None. This is a Railway dashboard infrastructure issue — no code changes.

**Niche Config → Issue Impact:** None.

**Shared Code Paths:** Zero.

**Dependency Direction:** Fully parallel. Handle on Railway dashboard.

---

### Issue #7: Calendar Filter Compact Box
**Source:** eight-issues-spec.md  
**Classification:** INDEPENDENT

**Issue → Niche Config Impact:** None. This is a UI layout issue in `src/pages/Scheduled.tsx`.

**Niche Config → Issue Impact:** None.

**Shared Code Paths:** Zero.

**Dependency Direction:** Fully parallel.

---

### Issue #8: Posts Page Title/Prompt Layout
**Source:** eight-issues-spec.md  
**Classification:** INDEPENDENT

**Issue → Niche Config Impact:** None. This changes grid layout from `md:grid-cols-2` to `grid-cols-1` in `src/pages/Posts.tsx`.

**Niche Config → Issue Impact:** None. The Posts page layout is unrelated to niche configuration.

**Shared Code Paths:** Zero.

**Dependency Direction:** Fully parallel.

---

### Issue #9: Posts.tsx Grid Layout — Preview 25%
**Source:** five-issues-research.md  
**Classification:** INDEPENDENT

**Issue → Niche Config Impact:** None. CSS grid change only.

**Niche Config → Issue Impact:** None.

**Shared Code Paths:** Zero.

**Dependency Direction:** Fully parallel.

---

### Issue #10: Job Progress Not Showing Intermediate States
**Source:** five-issues-research.md  
**Classification:** INDEPENDENT

**Issue → Niche Config Impact:** None. This is a `History.tsx` frontend bug where `getProgress()` counts completed brands instead of using `job.progress_percent`.

**Niche Config → Issue Impact:** Niche config adds a new service layer (`NicheConfigService`) that loads configuration before generation, but this doesn't affect progress reporting. The `JobProcessor` will continue updating `progress_percent` identically.

**Shared Code Paths:** `job_processor.py` is touched by both (niche config passes `PromptContext` to generation functions called by the processor), but the progress tracking code within the processor is untouched by niche config.

**Dependency Direction:** Fully parallel. The job progress bug is purely frontend; niche config is primarily backend.

---

### Issue #11: Font Auto-Fit Producing 5 Lines Instead of 4
**Source:** five-issues-research.md  
**Classification:** INDEPENDENT

**Issue → Niche Config Impact:** None. This is a `PostCanvas.tsx` rendering edge case where `balanceTitleText` produces 5 lines despite `autoFitFontSize` targeting [3, 4, 2].

**Niche Config → Issue Impact:** None. Title rendering is downstream of content generation.

**Shared Code Paths:** Zero.

**Dependency Direction:** Fully parallel.

---

### Issue #12: Content Prompts Tab Ordering
**Source:** five-issues-research.md  
**Classification:** SYNERGY

**Issue → Niche Config Impact:** The finding was that tab order is already correct ("Content Prompts" at position #2). However, niche config v2 renames this tab from "Content Prompts" to **"Content DNA"** (Part 8.1 of v2 doc).

**Niche Config → Issue Impact:** The rename happens in `BrandsTabBar.tsx` as part of niche config frontend work. If the label needs changing for Issue #12, it should use the niche config's final name.

**Shared Code Paths:**
- `src/features/brands/components/BrandsTabBar.tsx` — tab label/order

**Dependency Direction:** Skip Issue #12 independently. Let niche config handle the tab rename.

---

### Issue #13: Content Prompts Wiring Verification
**Source:** five-issues-research.md  
**Classification:** SYNERGY

**Issue → Niche Config Impact:** The research confirmed prompts ARE wired into 3 injection points (reels, batch posts, single posts) via `get_content_prompts()`. But they're appended at the END (the "whisper" problem). Niche config v2 restructures injection: `PromptContext` variables are injected INTO the prompt body (not appended), and examples are injected BEFORE formatting rules.

**Niche Config → Issue Impact:** Niche config directly resolves this issue's root concern. After niche config Phase 1, `get_content_prompts()` becomes a legacy fallback, and `PromptContext` drives all prompt assembly.

**Shared Code Paths:**
- `app/core/prompt_templates.py` → `get_content_prompts()`, `build_runtime_prompt()`, `build_post_content_prompt()`
- `app/services/content/generator.py` → `generate_post_title()`

**Dependency Direction:** Niche config Phase 1 tasks #6 and #12 subsume this issue entirely.

---

### Issue #14: Stuck Jobs — Maestro Semaphore
**Source:** stuck-jobs-research.md  
**Classification:** BLOCKING 🔴

**Issue → Niche Config Impact:** **CRITICAL.** The stuck jobs bug means `process_job_async()` in `jobs_routes.py` crashes on import of the deleted `app.services.maestro.maestro` module. **No jobs can be processed at all.** This means:
- You cannot test niche config changes because no content generation runs
- Deploying niche config to production on a broken job pipeline is pointless
- The backend testing loop for verifying prompt changes is completely blocked

**Niche Config → Issue Impact:** Niche config touches the content generation pipeline that runs INSIDE `process_job_async()`. If jobs can't even start, niche config changes can't be validated.

**Shared Code Paths:**
- `app/api/content/jobs_routes.py` → `process_job_async()` (blocked by broken import)
- `app/services/content/job_processor.py` → `process_job()` (called inside the blocked function)
- `app/services/content/generator.py` → all generation methods (called by job_processor)

**Dependency Direction:** **MUST fix Issue #14 BEFORE any niche config work.** This is a 1-line fix (replace maestro import with local `threading.Semaphore(2)`), but without it, the entire content generation pipeline is dead.

**Fix:** In `app/api/content/jobs_routes.py`, replace:
```python
from app.services.maestro.maestro import _job_semaphore
```
With:
```python
import threading
_job_semaphore = threading.Semaphore(2)
```

---

### Issue #15: 145+ Hardcoded Niche/Topic References (Group A)
**Source:** hardcoded-niche-audit.md  
**Classification:** SYNERGY ⭐⭐ (HIGHEST overlap)

**Issue → Niche Config Impact:** This IS the niche config work. Every one of these 145+ references is what niche config replaces with `ctx.*` template variables. The audit is the roadmap for the niche config backend implementation.

**Niche Config → Issue Impact:** Niche config Phase 1 task #6 directly replaces the top-priority references (niche_description, target_audience in SYSTEM_PROMPT, build_runtime_prompt, build_post_content_prompt, generate_post_title). Phase 2 tasks #1-#5 replace the remaining references.

**Shared Code Paths (ALL of these):**
- `app/core/prompt_templates.py` — SYSTEM_PROMPT (line 62), build_runtime_prompt, build_post_content_prompt (lines 519-632)
- `app/services/content/generator.py` — generate_post_title (line 424), topic_descriptions (lines 408-415), CTA_OPTIONS, _fallback_content, _fallback_post_title
- `app/core/viral_patterns.py` — TITLE_ARCHETYPES (lines 12-91), TOPIC_BUCKETS (lines 128-143)
- `app/core/quality_scorer.py` — HOOK_KEYWORDS (lines 93-107), health_keywords (lines 213-220), familiar_items (lines 124-131)
- `app/services/content/tracker.py` — TOPIC_BUCKETS (lines 28-41)
- `app/services/media/caption_generator.py` — system prompt (line 76), caption tone (line 90)
- `app/services/content/differentiator.py` — system prompt (line 148)

**Dependency Direction:** These ARE the same work. The niche-config implementation plan IS the fix for this issue.

---

### Issue #16: 12 Hardcoded Target Audience References (Group B)
**Source:** hardcoded-niche-audit.md  
**Classification:** SYNERGY ⭐⭐

**Issue → Niche Config Impact:** Niche config Phase 1 task #6 replaces the critical audience references. `ctx.target_audience` and `ctx.audience_description` replace:
- `"U.S. women aged 35 and older"` in `prompt_templates.py` line 519 and `generator.py` line 424
- `"Women 35+"` in `prompt_templates.py` line 523 and `generator.py` line 430
- `"Content that does not resonate with women 35+"` in `generator.py` line 480

**Niche Config → Issue Impact:** Direct resolution. All 12 instances are replaced by template variables.

**Shared Code Paths:**
- `app/core/prompt_templates.py` — lines 519, 523
- `app/services/content/generator.py` — lines 424, 430, 480
- `app/core/viral_patterns.py` — line 91

**Dependency Direction:** Same work stream. Niche config Phase 1 handles the top 5 occurrences, Phase 2 handles the rest.

---

### Issue #17: 14 Hardcoded Tone/Style References (Group C)
**Source:** hardcoded-niche-audit.md  
**Classification:** SYNERGY

**Issue → Niche Config Impact:** Niche config Phase 2 task #2 wires `ctx.content_tone` and `ctx.tone_avoid` to replace these 14 references. Phase 1 establishes the `PromptContext` dataclass with `content_tone` and `tone_avoid` fields.

**Niche Config → Issue Impact:** Phase 2 directly resolves this.

**Shared Code Paths:**
- `app/core/prompt_templates.py` — lines 70, 73 (SYSTEM_PROMPT), lines 440, 607-612
- `app/services/media/caption_generator.py` — line 90
- `app/core/viral_patterns.py` — lines 118-141 (HOOK_DEFINITIONS)

**Dependency Direction:** Phase 1 creates the infrastructure (PromptContext with tone fields + defaults). Phase 2 wires the remaining references. These can be done incrementally.

---

### Issue #18: 18 Hardcoded Brand Personality References (Group D)
**Source:** hardcoded-niche-audit.md  
**Classification:** SYNERGY ⭐

**Issue → Niche Config Impact:** Niche config Phase 1 task #6 replaces `brand_hints` in `differentiator.py` with `ctx.brand_personality`. Phase 3 adds full per-brand override UI.

**Niche Config → Issue Impact:** The `Brand` model already has `baseline_for_content` boolean and `colors` JSON. Niche config adds `brand_personality` and `brand_focus_areas` via the `niche_config` table (per-brand override rows). This is complementary to the existing brand model.

**Shared Code Paths:**
- `app/services/content/differentiator.py` — `brand_hints` dict (lines 107-113), `BASELINE_BRAND` (line 39)
- `app/core/prompt_templates.py` — `BRAND_PALETTES` (lines 270-287)
- `app/services/media/caption_generator.py` — `BRAND_HANDLES` (lines 13-19)
- `app/models/brands.py` — already has per-brand data, but personalities are hardcoded in service code

**Dependency Direction:** Niche config Phase 1 replaces `brand_hints` and `BASELINE_BRAND` in the differentiator. The `Brand` model already exists in DB — niche config reads from the new `niche_config` table for personality, not from the brands table. No brand model migration needed.

---

### Issue #19: 74+ Hardcoded Examples (Group E)
**Source:** hardcoded-niche-audit.md  
**Classification:** SYNERGY ⭐⭐ (v2's highest-impact feature)

**Issue → Niche Config Impact:** Niche config v2's core innovation is replacing hardcoded examples with user-provided few-shot examples. The 15 `CAROUSEL_SLIDE_EXAMPLES` in `prompt_templates.py` (lines 312-510) and the 59 viral ideas in `viral_ideas.py` are the two biggest anchors tying the system to health/wellness.

v2 introduces:
- `ctx.reel_examples` — replaces need for viral_ideas.py in prompt injection
- `ctx.post_examples` — replaces `CAROUSEL_SLIDE_EXAMPLES` when non-empty
- `format_reel_examples()` and `format_post_examples()` formatting functions

**Niche Config → Issue Impact:** Phase 1 tasks #5-#6 directly address this. When `ctx.post_examples` is non-empty, `CAROUSEL_SLIDE_EXAMPLES` is bypassed. When `ctx.reel_examples` is provided, they're injected before generation rules.

**Shared Code Paths:**
- `app/core/prompt_templates.py` — `CAROUSEL_SLIDE_EXAMPLES` (lines 312-510), `build_post_content_prompt()` (consumes examples)
- `app/core/viral_ideas.py` — entire file (59 ideas)
- `app/services/content/generator.py` — `_get_sanitized_example()`, `VIRAL_IDEAS` import

**Dependency Direction:** Same work stream. Fixing this IS implementing the niche config examples feature.

---

### Issue #20: 22 Hardcoded Image/Visual Style (Group F)
**Source:** hardcoded-niche-audit.md  
**Classification:** SYNERGY

**Issue → Niche Config Impact:** Niche config Phase 2 task #3 replaces hardcoded visual style references with `ctx.image_style_description` and `ctx.image_palette_keywords`.

**Niche Config → Issue Impact:** 22 hardcoded references across `prompt_templates.py` and `generator.py` are replaced:
- `IMAGE_PROMPT_SYSTEM` — "wellness and health imagery" → `ctx.niche_name` + `ctx.image_style_description`
- `IMAGE_PROMPT_GUIDELINES` — "Blue/teal color palette" → `ctx.image_palette_keywords`
- `POST_QUALITY_SUFFIX` — "premium lifestyle aesthetic" → `ctx.image_style_description`
- `REEL_BASE_STYLE` — "BRIGHT, COLORFUL" → stays hardcoded (FORMAT layer)
- `BRAND_PALETTES` — 5 brand palettes → `brands.colors` DB field (already exists!) + `ctx.image_palette_keywords`
- `FALLBACK_PROMPTS` — health-specific fallback images → parameterized with `ctx.niche_name`

**Shared Code Paths:**
- `app/core/prompt_templates.py` — lines 194-249, 253-287
- `app/services/content/generator.py` — lines 497-503, 677-706
- Interacts with `app/models/brands.py` → `colors` JSON field (already exists for brand palettes)

**Dependency Direction:** Phase 2 work. Phase 1 establishes `PromptContext` with `image_style_description` and `image_palette_keywords` fields + defaults.

---

### Issue #21: 19 Hardcoded CTA/Caption References (Group G)
**Source:** hardcoded-niche-audit.md  
**Classification:** SYNERGY

**Issue → Niche Config Impact:** Niche config Phase 2 tasks #4-#5 consolidate CTA options and hashtags from 3 separate definition locations into `ctx.cta_options` and `ctx.hashtags`.

**Niche Config → Issue Impact:** Currently, CTA options are defined in 3 files:
- `app/core/cta.py` — 3 types × 3 variations (9 texts)
- `app/services/media/caption_generator.py` — 3 types × 1 extended text
- `app/services/content/generator.py` — 2 types (5 texts for reels)

Default hashtags are in 2 files:
- `app/core/constants.py` — `DEFAULT_HASHTAGS`
- `app/services/media/caption_generator.py` — `HASHTAGS`

Niche config consolidates all of these into DB-backed `ctx.cta_options` and `ctx.hashtags`.

**Shared Code Paths:**
- `app/core/cta.py` — full file
- `app/services/media/caption_generator.py` — lines 22-37 (CTA_OPTIONS, HASHTAGS)
- `app/services/content/generator.py` — lines 107-121 (CTA_OPTIONS)
- `app/core/constants.py` — lines 27-35 (DEFAULT_HASHTAGS)
- `app/services/media/caption_builder.py` — imports DEFAULT_HASHTAGS

**Dependency Direction:** Phase 2 work. Not blocking for Phase 1.

---

### Issue #22: Prompts Appended at End ("Whisper Effect")
**Source:** brand-prompts-audit.md  
**Classification:** SYNERGY ⭐⭐

**Issue → Niche Config Impact:** This is the #1 structural problem niche config solves. Currently:
```
[2000-3000 tokens of hardcoded health content]
... at the very bottom ...
BRAND CONTEXT: {user's brand_description}     ~50 tokens
ADDITIONAL INSTRUCTIONS: {user's reels_prompt} ~50 tokens
```

Niche config v2 restructures prompt assembly into 3 layers:
1. **EXAMPLES** (user examples, injected FIRST) — few-shot anchoring
2. **CONTENT** (from PromptContext) — niche, audience, topics injected INTO the prompt body
3. **FORMAT** (hardcoded rules) — comes LAST for override priority

**Niche Config → Issue Impact:** Complete resolution. `PromptContext` variables replace hardcoded strings inline (not appended), eliminating the "whisper" problem entirely.

**Shared Code Paths:**
- `app/core/prompt_templates.py` → `get_content_prompts()` (lines 27-45), `build_runtime_prompt()` (lines 131-137), `build_post_content_prompt()` (lines 691-698)
- `app/services/content/generator.py` → `generate_post_title()` (lines 678-684)

**Dependency Direction:** Same work stream. Niche config Phase 1 task #6 ("Wire 5 variables into prompts") directly addresses this by replacing appended blocks with inline template variables.

---

### Issue #23: Prompts Are Global Only, Not Per-Brand
**Source:** brand-prompts-audit.md  
**Classification:** SYNERGY ⭐

**Issue → Niche Config Impact:** Today, `reels_prompt`, `posts_prompt`, `brand_description` are stored in `app_settings` (global key-value store) — shared across all brands. The `Brand` model has zero prompt-related columns.

Niche config v2 introduces:
- `niche_config` table with `brand_id` column (NULL = global, non-NULL = per-brand override)
- `NicheConfigService` with merge logic: load global → overlay per-brand
- Phase 3 adds per-brand override UI with "Use global defaults" toggles

**Niche Config → Issue Impact:** Complete resolution in Phase 3. The architecture supports per-brand overrides from day 1 (DB schema has `brand_id` FK), but the UI for it comes in Phase 3.

**Shared Code Paths:**
- `app/models/config.py` → `AppSettings` (current storage, becomes legacy fallback)
- `app/db_connection.py` → migration runs, new model imports
- `app/models/brands.py` → referenced by `niche_config.brand_id` FK
- NEW: `app/models/niche_config.py`, `app/services/content/niche_config_service.py`

**Dependency Direction:** Niche config Phase 1 creates the per-brand-capable infrastructure. Phase 3 builds the UI. The legacy `app_settings` approach remains as fallback during migration (v2 doc, Part 6D, Step 4).

---

### Issue #24: SYSTEM_PROMPT Hardcoded Niche Identity
**Source:** brand-prompts-audit.md  
**Classification:** SYNERGY ⭐⭐

**Issue → Niche Config Impact:** The `SYSTEM_PROMPT` constant in `prompt_templates.py` (line 51-69) says "You are a viral short-form health content generator" and contains health-specific framing, philosophy, and vocabulary restrictions. This is sent as the system message for EVERY reel generation and CANNOT be overridden by user prompts.

Niche config v2 replaces this with `build_system_prompt(ctx)`:
```python
f"You are a viral short-form {ctx.niche_name} content generator."
```

Along with parameterizing:
- `"health framing"` → `ctx.topic_framing`
- `"curiosity, fear, authority, hope, or control"` → `ctx.hook_themes`
- `"simple, confident, and non-clinical"` → `ctx.tone_string`
- `"60% validating, 40% surprising"` → `ctx.content_philosophy`

**Niche Config → Issue Impact:** Direct resolution. Part 6B, Example 1 of the v2 doc shows the exact before/after.

**Shared Code Paths:**
- `app/core/prompt_templates.py` → `SYSTEM_PROMPT` constant (lines 51-69)
- `app/services/content/generator.py` → `_call_deepseek()` line that references `SYSTEM_PROMPT` (line ~223)

**Dependency Direction:** Same work stream. This is niche config Phase 1 task #6, subtask "Replace SYSTEM_PROMPT string with build_system_prompt(ctx)".

---

### Issue #25: Duplicate/Overlapping Definitions Across Files
**Source:** hardcoded-niche-audit.md  
**Classification:** CAUTION ⚠️

**Issue → Niche Config Impact:** The hardcoded audit identified 6 concepts defined redundantly:

| Concept | File 1 | File 2 | File 3 |
|---------|--------|--------|--------|
| Topic buckets | `viral_patterns.py` (16 items) | `tracker.py` (13 items) | `prompt_templates.py` (18 items) |
| CTA options | `cta.py` (3 types) | `caption_generator.py` (3 types) | `generator.py` (2 types) |
| Brand names | `prompt_templates.py` | `differentiator.py` | `caption_generator.py` |
| Fallback prompts | `prompt_templates.py` | `generator.py` | — |
| Hashtags | `constants.py` | `caption_generator.py` | — |
| Audience description | `prompt_templates.py` (2 places) | `generator.py` (3 places) | — |

**Niche Config → Issue Impact:** If niche config is implemented WITHOUT first consolidating these duplicates, it would need to replace the same concept in 2-3 different files. This creates a risk:
- If a developer replaces topic buckets in `prompt_templates.py` with `ctx.topic_categories` but forgets `tracker.py` and `viral_patterns.py`, the system uses DB-backed topics for prompts but hardcoded topics for tracking and pattern selection → **inconsistent behavior**.
- The niche config plan (Phase 2 tasks #1, #4, #10) explicitly accounts for consolidation, but **if done hastily or partially, duplicates create drift**.

**Shared Code Paths (all duplicate sites):**
- Topic buckets: `viral_patterns.py` lines 128-143, `tracker.py` lines 28-41, `prompt_templates.py` lines 530-547
- CTA options: `cta.py` lines 15-33, `caption_generator.py` lines 22-35, `generator.py` lines 107-121
- Hashtags: `constants.py` lines 27-35, `caption_generator.py` line 37

**Dependency Direction:**
- **Option A (safer):** Consolidate duplicates into single source-of-truth files BEFORE niche config. Then niche config replaces one location per concept.
- **Option B (efficient):** Consolidate AS PART OF niche config Phase 2 (task #10: "Consolidate duplicated topic lists"). This is what the v2 plan recommends.

**Risk:** If niche config Phase 1 starts replacing hardcoded strings before consolidation, partial replacements will cause silent inconsistencies (DB topics for prompts, hardcoded topics for tracking).

**Mitigation:** Phase 1 should ONLY replace variables in `prompt_templates.py` and `generator.py` (the 5 highest-priority variables). Do NOT touch `tracker.py`, `viral_patterns.py`, or `quality_scorer.py` until Phase 2 consolidation.

---

## Optimal Ordering Strategy

### Phase 0: Critical Blockers (Do First — Hours)

| Priority | Issue | Effort | Why First |
|----------|-------|--------|-----------|
| **P0** | #14 Stuck Jobs (Maestro semaphore) | 5 min | **Nothing works without this.** 1-line fix enables all testing. |

### Phase 1: Independent Quick Wins (Parallel with Niche Config — Days)

These have ZERO overlap with niche config and can be done by any developer simultaneously:

| Priority | Issue | Effort |
|----------|-------|--------|
| P1 | #1 Profile Input Pencil Icon | 5 min |
| P1 | #3 Scheduling Success Messages | 10 min |
| P1 | #6 Railway Volume Cleanup | 5 min (dashboard) |
| P1 | #8 Posts Page Title/Prompt Layout | 5 min |
| P1 | #9 Posts.tsx Grid Layout 25% | 10 min |
| P1 | #10 Job Progress Intermediate States | 15 min |
| P2 | #2 Post Title Font Auto-Fit | 30 min |
| P2 | #4 Auto-Schedule Slide Flicker | 1-2 hrs |
| P2 | #7 Calendar Filter Compact Box | 1-2 hrs |
| P2 | #11 Font Auto-Fit 5 Lines | 30 min |

### Phase 2: Niche Config Phase 1 — Core Config + Examples (Absorbs Synergy Issues)

This phase resolves Issues #5, #12, #13, #15–16, #18–19, #22–24 as a side effect:

| Step | Niche Config Task | Issues Resolved |
|------|-------------------|-----------------|
| 1 | Create `PromptContext` dataclass | Foundation for #15, #16, #17, #22, #24 |
| 2 | Create `niche_config` table + model | Foundation for #23 |
| 3 | Create `NicheConfigService` | Foundation for #23 |
| 4 | Wire 5 core variables into prompts | **#15 (partial), #16, #22, #24** |
| 5 | Create example formatting functions | **#19** |
| 6 | Inject examples, replace SYSTEM_PROMPT | **#19, #24** |
| 7 | Add API endpoints | Foundation for #5 |
| 8 | Build Phase 1 frontend (NicheConfigForm) | **#5, #12** |
| 9 | Keep legacy prompts as fallback | **#13** (graceful migration) |

### Phase 3: Niche Config Phase 2 — Full Config (Absorbs Remaining Synergies)

| Step | Niche Config Task | Issues Resolved |
|------|-------------------|-----------------|
| 1 | Wire topic_categories (consolidate 3 lists) | **#15 (complete), #25 (topic dupes)** |
| 2 | Wire content_tone | **#17** |
| 3 | Wire image_style_description | **#20** |
| 4 | Consolidate CTA options | **#21, #25 (CTA dupes)** |
| 5 | Wire hashtags | **#21, #25 (hashtag dupes)** |
| 6 | Update quality_scorer.py | **#15 (quality scoring vocabulary)** |
| 7 | Consolidate remaining duplicates | **#25 (complete)** |

### Phase 4: Niche Config Phase 3 — Advanced

| Step | Task | Issues Resolved |
|------|------|-----------------|
| 1 | Per-brand overrides UI | **#23 (complete)** |
| 2 | Preset templates | **#18 (complete)** |

---

## Shared Code Path Heat Map

Files sorted by intersection density (how many issues + niche config tasks touch them):

| File | Issues Touching It | Niche Config Tasks Touching It | Total Touches | Risk Level |
|------|--------------------|-------------------------------|---------------|------------|
| `app/core/prompt_templates.py` | #13, #15, #16, #17, #19, #20, #22, #24, #25 | Phase 1 tasks #1, #4, #6; Phase 2 tasks #1-5 | **21** | 🔴 HIGH |
| `app/services/content/generator.py` | #13, #15, #16, #19, #20, #21, #22, #25 | Phase 1 tasks #4, #6; Phase 2 tasks #1, #3 | **16** | 🔴 HIGH |
| `app/services/content/differentiator.py` | #15, #18 | Phase 1 task #6 | **4** | 🟡 MEDIUM |
| `app/services/media/caption_generator.py` | #17, #18, #21, #25 | Phase 2 tasks #4-5 | **8** | 🟡 MEDIUM |
| `app/core/viral_patterns.py` | #15, #16, #25 | Phase 2 task #1 | **6** | 🟡 MEDIUM |
| `app/core/quality_scorer.py` | #15, #17 | Phase 2 task #6 (v2 plan Phase 2 #9) | **4** | 🟡 MEDIUM |
| `app/services/content/tracker.py` | #15, #25 | Phase 2 task #1 | **4** | 🟡 MEDIUM |
| `app/core/cta.py` | #21, #25 | Phase 2 task #4 | **3** | 🟢 LOW |
| `app/core/constants.py` | #21, #25 | Phase 2 task #5 | **3** | 🟢 LOW |
| `app/db_connection.py` | #14, #23 | Phase 1 tasks #2, #8 | **3** | 🟢 LOW |
| `app/models/brands.py` | #18, #23 | Phase 1 (FK reference only) | **2** | 🟢 LOW |
| `app/models/jobs.py` | #14 | None (unchanged) | **1** | 🟢 LOW |
| `src/features/brands/components/*` | #5, #12 | Phase 1 task #8 | **3** | 🟢 LOW |
| `src/pages/Posts.tsx` | #8, #9 | None | **2** | 🟢 LOW |
| `app/api/content/jobs_routes.py` | #14 | None (unchanged) | **1** | 🟢 LOW |

---

## Merge Conflict Risk Assessment

These file edits will have **merge conflicts** if done on separate branches simultaneously:

### HIGH conflict risk (serialize these edits):
1. `prompt_templates.py` — Issues #15, #16, #17, #22, #24 ALL touch the same functions. Niche config Phase 1 restructures `SYSTEM_PROMPT`, `build_runtime_prompt()`, and `build_post_content_prompt()`. **Do NOT have separate branches editing this file for different issues.**

2. `generator.py` — Issues #15, #16, #22 modify `generate_post_title()`. Niche config adds `PromptContext` parameter. **Same concern.**

### MEDIUM conflict risk (coordinate timing):
3. `differentiator.py` — Issue #18 and niche config both touch `brand_hints`. Small file, easy to merge.

4. `caption_generator.py` — Issues #17, #21 and niche config Phase 2 both replace hardcoded constants.

### ZERO conflict risk (safe to parallelize):
- All frontend-only issues (#1-4, #7-11) — different files from niche config backend work
- Issue #6 (Railway) — no code changes
- Issue #14 — touches `jobs_routes.py` which niche config doesn't modify

---

## Critical Findings Summary

### 1. Only ONE true blocker: Issue #14 (Stuck Jobs)
The 1-line Maestro semaphore fix MUST come first. Without it, no content generation runs, making all niche config backend testing impossible.

### 2. 13 of 25 issues are absorbed by niche config
Issues #5, #12, #13, #15-24 are either directly resolved or substantially addressed by niche config Phases 1-3. Fixing them independently would create throwaway code.

### 3. 10 issues are fully independent
Issues #1-4, #6-11 have zero code-path overlap with niche config. They can proceed in parallel on a separate branch with no merge risk.

### 4. `prompt_templates.py` is the highest-risk file
It's touched by 9 issues AND 8 niche config tasks. All edits to this file should be serialized — one branch at a time.

### 5. The "whisper effect" (#22) and "examples anchoring" (#19) are the same root cause
Both stem from the prompt architecture: hardcoded content dominates, user content is appended at the end. Niche config v2's 3-layer prompt architecture (examples → content → format) resolves both simultaneously.

### 6. Caution on Issue #25 (duplicates)
Partial niche config implementation without consolidation creates drift risk. The v2 plan correctly defers consolidation to Phase 2, but Phase 1 must be SCOPED to only touch `prompt_templates.py` and `generator.py` for the first 5 variables. Do NOT partially replace topic_categories until the 3 duplicate lists are consolidated.

---

## Recommended Execution Order

```
DAY 1:
├── Fix #14 (Stuck Jobs) — 5 min, UNBLOCKS EVERYTHING
├── Deploy + verify jobs run
└── Start independent UI fixes (#1, #3, #6, #8, #9, #10)

DAY 2-3:
├── Complete independent UI fixes (#2, #4, #7, #11)
└── Begin Niche Config Phase 1 backend:
    ├── PromptContext dataclass
    ├── niche_config table + model
    ├── NicheConfigService
    └── Example formatting functions

DAY 4-5:
├── Niche Config Phase 1 wiring:
│   ├── Replace SYSTEM_PROMPT → build_system_prompt(ctx)
│   ├── Wire 5 variables into prompt_templates.py
│   ├── Wire 5 variables into generator.py
│   ├── Inject reel/post examples
│   └── Add API endpoints
│   (Resolves: #15 partial, #16, #19, #22, #24)
└── Test thoroughly with real content generation

DAY 6-7:
├── Niche Config Phase 1 frontend:
│   ├── NicheConfigForm (replaces ContentPromptsCard)
│   ├── ContentExamplesSection
│   ├── ConfigStrengthMeter
│   ├── Tab rename to "Content DNA"
│   └── API hooks
│   (Resolves: #5, #12, #13)
└── End-to-end testing

WEEK 2+:
├── Niche Config Phase 2:
│   ├── Consolidate topic_categories (3 lists → 1)
│   ├── Wire content_tone, image_style, CTAs, hashtags
│   ├── Update quality_scorer.py
│   └── Consolidate all remaining duplicates
│   (Resolves: #15 complete, #17, #18 partial, #20, #21, #25)
└── Niche Config Phase 3: Per-brand overrides
    (Resolves: #18 complete, #23 complete)
```
