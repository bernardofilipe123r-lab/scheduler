---
description: "Use when editing Toby agent or orchestrator files. Covers tick isolation, rate limiting, billing guard, feature flag checks, memory handling."
applyTo: "app/services/toby/**/*.py"
---

# Toby Agent Rules

- **State isolation:** Each tick check (buffer, metrics, analysis, discovery, phase) has its OWN DB commit scope. Never let failures cascade across checks.

- **Billing guard first:** Always check `UserProfile.billing_status != "locked"` before processing a user. Skip locked users entirely.

- **Feature flags:** Check `FeatureFlags` before using v3 cognitive features. Most v3 flags default to `False`. Access via `app/services/toby/feature_flags.py`.

- **Rate limits:**
  - Steady: 2 gen/brand/hour, 6 gen/user/hour, 15 min cooldown
  - Bootstrap: 6/brand/hour, 20/user/hour, 2 min cooldown
  - Never bypass rate limits — they prevent API abuse and budget blowout

- **Memory embeddings:** Always handle `None` embeddings gracefully. `generate_embedding()` returns `None` on failure. Fall back to recency sort if embedding unavailable.

- **Error logging:** Use debounced logging (`_error_log_timestamps` dict) for repeated errors. Don't spam logs with the same error every 5 minutes.

- **Budget check:** If `budget_enforcement` flag is on, check `spent_today_cents < daily_budget_cents` before generating.

- **NEVER use parallel execution for content generation.** The `_execute_plans_parallel()` function caused a critical duplicate content incident (2026-03-08) because separate DB sessions can't see each other's uncommitted inserts. Always use `_execute_plans_sequential()`. The parallel codepath is kept for reference but must never be re-enabled.

- **Anti-duplicate safeguards (CRITICAL — 5 layers, Toby-native):**
  Toby is self-monitoring by design. He doesn't need external supervision to avoid mistakes.
  1. **Quality Guard agent** (step 0 of every tick) — Toby inspects his own scheduled output: cancels fallbacks, title dupes, slot collisions, caption dupes
  2. **Sequential execution only** — eliminates the root race condition
  3. **Scheduler 3-layer dedup** — time-slot + title + caption checks with `FOR UPDATE` locking
  4. **Fallback content rejection** — titles matching "content generation temporarily unavailable" are NEVER scheduled
  5. **Pre-publish dedup guard** — `get_pending_publications()` catches any remaining duplicates before publishing

- **Never schedule fallback content.** If AI generation fails, raise an exception instead of using fallback titles. Empty buffer slots are preferable to publishing placeholder content.

- **Self-monitoring philosophy:** Dedup and quality checks are Toby's cognitive responsibility, not external patches. The Quality Guard agent (`agents/quality_guard.py`) runs as step 0 of every tick — before buffer fill. `scripts/dedup_sweeper.py` exists as a manual backup for incident response only.
