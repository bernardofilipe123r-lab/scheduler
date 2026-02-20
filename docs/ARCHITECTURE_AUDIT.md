# Architecture & Product-Level Audit

**Date:** 2025-02-20
**Scope:** Full codebase review for multi-niche readiness

## Executive Summary

The Content DNA architecture (NicheConfig → PromptContext → prompt builders) is
correctly designed and ~70% implemented. The remaining 30% consists of **6-7
specific call sites** that still contain hardcoded health/wellness assumptions.
These are surgical fixes, not architectural rewrites.

---

## What Works (PASS)

| Component | File | Status |
|---|---|---|
| PromptContext dataclass | `app/core/prompt_context.py` | All fields default to empty. No health hardcoding. |
| NicheConfig DB model | `app/models/niche_config.py` | Clean schema with global + per-brand override. |
| NicheConfigService | `app/services/content/niche_config_service.py` | Correct merge logic: global → per-brand → PromptContext. |
| CTA module | `app/core/cta.py` | Driven by `ctx.cta_options`. No health defaults. |
| viral_ideas.py | `app/core/viral_ideas.py` | Cleaned: `VIRAL_IDEAS = []`. |
| TOPIC_BUCKETS | `app/core/viral_patterns.py:203` | Cleaned: empty list, loads from NicheConfig. |
| DEFAULT_HASHTAGS | `app/core/constants.py:27` | Cleaned: empty list. |
| System prompt | `prompt_templates.py:55-93` | Dynamic: uses ctx.niche_name, ctx.topic_framing, etc. |
| Runtime prompt | `prompt_templates.py:103-160` | Dynamic: uses ctx.niche_name, ctx.reel_examples. |
| Content differentiator | `differentiator.py` | Uses ctx.niche_name and ctx.niche_description. |
| Quality scorer | `quality_scorer.py` | Uses ctx.topic_keywords when configured, skips when empty. |
| Job processor | `job_processor.py:131-132` | Loads per-brand NicheConfig context. |
| Fallback content | `generator.py:416-433` | Neutral: "CONTENT GENERATION TEMPORARILY UNAVAILABLE". |

## What Breaks for Non-Health Niches (FAIL)

### P0 — Critical (breaks content for non-health users)

1. **`ai_background.py:209-212`** — Hardcoded health objects in deAPI prompts
   - Every dark-mode reel gets "water bottles, dumbbells, yoga mats, supplements"
   - Fix: Pass PromptContext, use `ctx.image_style_description` + `ctx.image_palette_keywords`

2. **`ai_background.py:435`** — Wellness fallback for post backgrounds
   - "Soft cinematic wellness still life with natural ingredients"
   - Fix: Use ctx-driven or generic fallback

3. **`prompt_templates.py:508-509`** — Caption instructions assume wellness
   - "metabolism, organs, brain chemistry, skin, energy"
   - Fix: Replace with ctx.niche_description or make generic

4. **`prompt_templates.py:530`** — Hardcoded health topic words in CTA
   - Example words: "health, brain, body, longevity, energy, skin, sleep, nutrition"
   - Fix: Use ctx.topic_keywords

5. **`prompt_templates.py:572`** — JSON template has "your health"
   - Fix: Remove health-specific example

### P1 — High (feature is useless for non-health niches)

6. **`trend_scout.py:44-110`** — 32 health competitors + 24 health hashtags hardcoded
   - Fix: Move to NicheConfig fields (competitor_accounts, discovery_hashtags)

### P2 — Low (cosmetic)

7. **`manager.py:138-184`** — Default brand seeding is all health-themed
   - Fix: Make empty or generic

## Scalability Issues (100+ clients)

| Problem | Trigger | Fix |
|---|---|---|
| Sync AI calls block event loop | 2-3 concurrent jobs | Replace `requests.post()` with `httpx.AsyncClient` |
| APScheduler in web process | 20+ clients | Extract to separate service or Supabase Edge Functions |
| No DB indexes | 5k+ rows | Add indexes on status/scheduled_time columns |
| Connection pool exhaustion | 60 connections (free tier) | PgBouncer on Supabase Pro |
| TrendScout is single-niche | Multi-niche users | Per-user competitor/hashtag config in NicheConfig |

## Supabase Features to Adopt

- **Row-Level Security (RLS)**: No policies exist. Any user can query other users' data.
- **Supabase Auth**: Replace triple JWT fallback middleware with native JWKS validation.
- **Realtime**: Replace job status polling with `postgres_changes` subscriptions.
- **Edge Functions + pg_cron**: Replace in-process APScheduler (requires Pro tier).
- **Vault**: Store social media tokens encrypted instead of plaintext columns.

## Supabase Free vs Pro

Free tier works for now. Pro ($25/mo) needed before 20-30 clients for:
- PgBouncer (connection pooling beyond 60 connections)
- Storage egress (1GB/mo free is insufficient for video)
- pg_cron (for scheduler extraction)
