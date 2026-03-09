---
name: content-pipeline
description: Use when modifying content generation, changing prompts, adjusting quality thresholds, working on dedup/fingerprinting, editing viral patterns, changing NicheConfig fields, adding content types, or debugging generation failures.
---

# Content Generation Pipeline

## 3-Layer Architecture

```
Layer 1: Pattern Brain (viral_patterns.py) → 59 viral archetypes
Layer 2: Prompt Templates (prompt_templates.py) → Cached system prompts + runtime builders
Layer 3: Runtime Input (prompt_context.py) → PromptContext dataclass (30 fields from NicheConfig)
```

## Key Source Files

| File | Purpose |
|------|---------|
| `app/services/content/generator.py` | `ContentGeneratorV2` — main generation engine |
| `app/services/content/job_processor.py` | `JobProcessor` — full processing flow |
| `app/services/content/tracker.py` | `ContentTracker` — dedup, fingerprints, cooldowns |
| `app/services/content/niche_config_service.py` | `NicheConfigService` — PromptContext cache (5 min TTL) |
| `app/services/content/differentiator.py` | `ContentDifferentiator` — multi-brand variation |
| `app/core/viral_patterns.py` | 59 viral archetypes |
| `app/core/prompt_templates.py` | All prompt builders |
| `app/core/prompt_context.py` | `PromptContext` dataclass |
| `app/core/quality_scorer.py` | Multi-dimensional quality scoring |
| `app/models/niche_config.py` | `NicheConfig` — per-user Content DNA |

## Generation Flow

```
generate_viral_content()
  → Select viral pattern → Build system prompt (cached)
  → Build runtime prompt → Call DeepSeek (temp=0.85)
  → Parse JSON → Score quality (5 dimensions)
  → If score < 80: retry (max 3)
  → Track in content history (dedup)
  → Return: title, body, image_prompt, hook, cta, hashtags
```

## Quality Thresholds
- `quality_threshold_publish = 80` → publish gate
- `quality_threshold_regenerate = 65` → worth retrying
- `max_regeneration_attempts = 3`

## Dedup / Content Tracker
- `TOPIC_COOLDOWN_DAYS = 3`
- `FINGERPRINT_COOLDOWN_DAYS = 30`
- `BRAND_HISTORY_DAYS = 60`
- Fingerprints are per-brand, not global

## Adding a NicheConfig Field (CRITICAL)
1. Add column to `NicheConfig` model
2. Add field to `PromptContext` dataclass
3. Add mapping in `NicheConfigService._apply_config()`
4. Write migration SQL
5. Run migration
6. Run `python scripts/validate_api.py` — checks field alignment

## Common Mistakes
1. Every NicheConfig column MUST have matching PromptContext field + mapping
2. Content generation temp=0.85, not higher
3. No fallback content — raise exception if DeepSeek fails
4. Always strip CTAs post-generation via `_strip_cta_lines()`
5. 10 minute timeout per brand for job processing
