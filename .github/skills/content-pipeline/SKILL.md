---
name: content-pipeline
description: "Content generation pipeline — 3-layer architecture (viral patterns → prompt templates → runtime context), DeepSeek AI calls, quality scoring, deduplication, Content DNA / NicheConfig, content differentiation. Use when: modifying content generation, changing prompts, adjusting quality thresholds, working on dedup/fingerprinting, editing viral patterns, changing NicheConfig fields, adding content types, debugging generation failures."
---

# Content Generation Pipeline

## When to Use
- Modifying content generation logic or DeepSeek API calls
- Changing prompt templates or system prompts
- Adjusting quality scoring thresholds
- Working on dedup/fingerprint logic
- Editing viral patterns or adding new archetypes
- Adding or changing NicheConfig/PromptContext fields
- Working on content differentiation for multi-brand
- Debugging generation failures or quality issues

## 3-Layer Architecture

```
Layer 1: Pattern Brain (viral_patterns.py)
  → 59 viral content archetypes (static, hardcoded patterns)

Layer 2: Prompt Templates (prompt_templates.py)
  → Cached system prompts + runtime prompt builders

Layer 3: Runtime Input (prompt_context.py)
  → Minimal dynamic context per generation (PromptContext dataclass)
```

## Key Source Files

| File | Purpose |
|------|---------|
| `app/services/content/generator.py` | `ContentGeneratorV2` — main generation engine |
| `app/services/content/job_manager.py` | `JobManager` — job lifecycle CRUD |
| `app/services/content/job_processor.py` | `JobProcessor` — full processing flow (reels + posts) |
| `app/services/content/tracker.py` | `ContentTracker` — dedup, fingerprints, topic cooldowns |
| `app/services/content/niche_config_service.py` | `NicheConfigService` — PromptContext cache (5 min TTL) |
| `app/services/content/differentiator.py` | `ContentDifferentiator` — multi-brand variation |
| `app/core/viral_patterns.py` | 59 viral archetypes (hooks, formats, structures) |
| `app/core/prompt_templates.py` | All prompt builders (system, runtime, correction, style anchor) |
| `app/core/prompt_context.py` | `PromptContext` dataclass (30 fields from NicheConfig) |
| `app/core/quality_scorer.py` | Multi-dimensional quality scoring |
| `app/core/cta.py` | CTA templates and formatting |
| `app/models/niche_config.py` | `NicheConfig` model — per-user Content DNA |
| `app/models/jobs.py` | `GenerationJob` model |

## ContentGeneratorV2

### Generation Flow
```
generate_viral_content()
  → Select viral pattern from 59 archetypes
  → Build system prompt (cached per session)
  → Build runtime prompt (title + context + NicheConfig)
  → Call DeepSeek API
  → Parse JSON response
  → Score quality (multi-dimensional)
  → If score < 80: retry (max 3 attempts)
  → Track in content history (dedup)
  → Return: title, body, image_prompt, hook, cta, hashtags
```

### DeepSeek Parameters
| Use Case | Model | Temperature | Max Tokens | Timeout |
|----------|-------|-------------|------------|---------|
| Content generation | `deepseek-chat` | 0.85 | 1200 (reel), 8000 (post) | 30-60s |
| Image prompts | `deepseek-chat` | 0.8 | 300 | 30s |
| Captions | `deepseek-chat` | 1.0 | varies | 30s |
| Variations | `deepseek-chat` | 0.9 | 4000 | 60s |
| YouTube titles | `deepseek-chat` | 0.85 | 2000 | 30s |

### Quality Thresholds
```
quality_threshold_publish = 80    → Content ready to publish
quality_threshold_regenerate = 65 → Content worth retrying
max_regeneration_attempts = 3     → Give up after 3 tries
```

### Example Injection
When 2+ consecutive generations fail quality gate, injects sanitized structure-only examples (no actual content copied) as few-shot guidance.

## PromptContext Dataclass

30 fields mapped from NicheConfig DB model, organized by category:

| Category | Fields |
|----------|--------|
| Identity | niche_name, niche_description, content_brief, target_audience, audience_description |
| Topics | topic_categories, topic_keywords, topic_avoid |
| Tone | content_tone, tone_avoid |
| Content | content_philosophy, hook_themes, reel_examples, post_examples |
| Visuals | image_style_description, image_palette_keywords |
| Citation | citation_style, citation_source_types |
| YouTube | yt_title_examples, yt_title_bad_examples |
| Carousel | carousel_cta_topic, carousel_cta_options, cover/content overlay opacities |
| CTAs | cta_options, hashtags, follow_section_text, save_section_text, disclaimer_text |
| Discovery | competitor_accounts, discovery_hashtags |

**Cache:** NicheConfigService caches PromptContext per user_id with 5-minute TTL.

**CRITICAL:** When adding a new field:
1. Add column to `NicheConfig` model (`app/models/niche_config.py`)
2. Add field to `PromptContext` dataclass (`app/core/prompt_context.py`)
3. Add mapping in `NicheConfigService._apply_config()` (`app/services/content/niche_config_service.py`)
4. Write migration SQL in `migrations/`
5. Run migration against Supabase
6. Run `python scripts/validate_api.py` — it checks NicheConfig ↔ PromptContext field alignment

## Content Tracker (Dedup)

### Fingerprint System
```
TOPIC_COOLDOWN_DAYS = 3         → Same topic can't repeat within 3 days
FINGERPRINT_COOLDOWN_DAYS = 30  → Same keyword hash can't repeat within 30 days
BRAND_HISTORY_DAYS = 60         → History window for brand-specific checks
HIGH_PERFORMER_THRESHOLD = 85.0 → Topics above this get priority weight
```

### Post Quality Gate (`check_post_quality`)
Returns `PostQualityResult` with score 0-100:
- Title checks: not empty, no period-ending, no starting numbers, length 10-150 chars
- Caption checks: length, source/DOI presence, disclaimer
- Minimum 60 to avoid hard fail

### Topic Selection
`pick_topic()` uses weighted random: high performers get priority, cooled-down topics excluded.

## Content Differentiator

For multi-brand generation:
1. First brand (baseline) gets original content
2. Other brands get unique variations via DeepSeek (temp=0.9)
3. Rules: position shuffle mandatory, different wording/synonyms, remove 1-2 items + add 1-2 new items
4. Fallback: original content if DeepSeek fails

## Job Lifecycle

### Job IDs
- Manual: `GEN-{6 random digits}` (e.g., `GEN-482931`)
- Toby: `TOBY-{6 random digits}` (e.g., `TOBY-729401`)

### Processing Flow (Reels)
```
process_job()
  → Check cancellation
  → Generate AI content per brand (unless fixed_title)
  → Run content differentiation for multi-brand
  → For each brand (threaded, 10 min timeout):
      → regenerate_brand(): image + video + caption
      → Track progress
  → Merge results, finalize status
```

### Processing Flow (Posts/Carousels)
```
process_job()
  → Manual: use title as-is
  → Auto: batch generate N unique posts via DeepSeek
  → For each brand (threaded):
      → process_post_brand(): AI background only (no composite)
  → Finalize
```

### CTA Stripping
`_strip_cta_lines()` regex-removes AI-generated CTAs despite prompt instructions (patterns: "follow.*page", "follow.*us", "comment.*", "stay tuned.*follow").

## Common Mistakes to Avoid
1. **NicheConfig field sync:** Every new NicheConfig column MUST have a matching PromptContext field AND a mapping in NicheConfigService — validate_api.py checks this
2. **Temperature tuning:** Content generation uses 0.85, NOT higher — higher causes incoherent output
3. **Dedup scope:** Fingerprints are per-brand, not global — check `is_duplicate_for_brand()`
4. **Quality gate bypass:** Never lower `quality_threshold_publish` below 80 — it's the publish gate
5. **CTA in content:** AI always adds CTAs despite being told not to — that's why `_strip_cta_lines()` exists post-generation
6. **Job timeout:** 10 minutes per brand — long-running renders can hit this
