# Toby — Implementation Gaps

**Date:** February 2026
**Source:** Audit of production codebase vs `docs/toby-architecture-spec.md`
**Scope:** Everything in the spec not yet fully live

> **Environment access available for implementation:**
> - ✅ **Supabase** — full access via `DATABASE_URL` connection string (run migrations directly, inspect tables, alter schema)
> - ✅ **Railway CLI** — full access to deploy, run one-off commands, inspect logs, and trigger restarts on the production environment

> **Status legend:**
> - ⚠️ **Partial** — structure/skeleton exists, logic incomplete
> - ❌ **Missing** — no code exists at all
> - 🔧 **Disabled** — code written, gated behind feature flag, not wired into the live loop

---

## 1. Instagram Token Expiry — Full Handling ⚠️ Partial

**Spec ref:** Section 10-C1, Section 16.1

**What exists:**
- `metrics_collector.py` returns `{"token_expired": True}` when no token found
- `_check_token_validity()` warns if token is missing

**What's missing:**
- No HTTP 401 / error code 190 detection inside `fetch_media_metrics()` — if the token is present but expired, the API returns a 401 that is silently swallowed
- No `TobyActivityLog` entry with `action_type="token_expired"` — user never sees it in the Observatory feed
- No debounce to avoid flooding the activity log (emit once per day, not on every failed tick)

**Required changes:**
- `app/services/analytics/metrics_collector.py` — catch 401/code-190 in the HTTP response, call `emit_token_expired_event(user_id, brand)`
- `app/services/toby/orchestrator.py` — on `token_expired` flag, skip strategy score updates for that brand

---

## 2. Discovery → LearningEngine Auto-Experiment Creation ⚠️ Partial

**Spec ref:** Section 9.3, Section 10-D (cross-brand / discovery feedback)

**What exists:**
- `discovery_manager.py:183–213` — `_feed_discovery_to_learning()` computes insights and logs `"discovery_learning_signal"` activity
- Called when total discovery results > 0

**What's missing:**
- The function logs a message saying "learning engine will incorporate via exploration" but does **not** actually create or update any experiment
- No call to `learning_engine.create_experiment()` or `update_strategy_score()` from discovery results
- New trending hashtags/topics discovered are never seeded into a live experiment option

**Required changes:**
- `app/services/toby/discovery_manager.py:_feed_discovery_to_learning()` — for each significant discovery (e.g. trending hashtag not in current experiment options), call `learning_engine.add_option_to_experiment(user_id, dimension="hashtag_style", option=tag)`
- `app/services/toby/learning_engine.py` — implement `add_option_to_experiment()` that appends a new arm to an active experiment (with prior of the current mean score)

---

## 3. Phase Regression (Optimizing → Learning) ❌ Missing

**Spec ref:** Section 10-H4, Section 8 (Core Loops — State Machine)

**What exists:**
- Phase transitions in `state.py` go forward only: bootstrap → learning → optimizing
- No code to detect performance drops or revert phase

**What's missing:**
- No comparison of 14-day rolling avg vs. 90-day baseline
- No backward transition mechanism
- No increase of `explore_ratio` when performance regresses
- No `TobyActivityLog` entry for phase regression

**Required changes:**
- `app/services/toby/state.py` — add `check_phase_regression(db, user_id)` that:
  1. Computes 14-day avg Toby score vs. 90-day rolling avg
  2. If drop ≥ 20%, revert phase to `"learning"` and set `explore_ratio = 0.50`
  3. Emits `action_type="phase_regression"` activity log entry
- `app/services/toby/orchestrator.py` — call `check_phase_regression()` after every analysis tick

---

## 4. Brand Removal — Full Cascade Cleanup ⚠️ Partial

**Spec ref:** Section 10-A2

**What exists:**
- `NicheConfig` rows CASCADE delete when brand is removed (DB FK)

**What's missing:**
- `scheduled_reels` rows belonging to the deleted brand are **not** cleaned up — orphaned future slots remain
- `toby_strategy_scores` rows for the brand are **not** deleted — stale scores remain and can pollute cross-brand cold-start
- No `TobyActivityLog` entry emitted for brand deletion so the user knows Toby acknowledged it

**Required changes:**
- DB migration: Add `ON DELETE CASCADE` (or explicit cleanup) for `scheduled_reels` where `extra_data->>'brand' = deleted_brand_id`
- `app/api/brands/routes.py` (or equivalent delete endpoint): after deleting brand, run cleanup query for `toby_strategy_scores` and emit `action_type="brand_removed"` activity log

---

## 5. LLM Strategy Agent — Wire Into Live Loop 🔧 Disabled

**Spec ref:** Section 12 (Phase B), Section 9 (Intelligence Engine)

**What exists:**
- `app/services/toby/strategy_agent.py` — 160+ line file with the agent logic
- `app/services/toby/feature_flags.py:17` — `"llm_strategy_agent": False`

**What's missing:**
- Feature flag is `False` — agent never runs
- No call from `orchestrator.py` to the strategy agent at any tick
- Discovery results and performance summaries are never passed to the LLM for reasoning
- Agent output (strategy recommendations) is never applied to experiment weights or explore_ratio

**Required changes:**
- `app/services/toby/orchestrator.py` — in the analysis tick branch, after scoring: if `feature_flags["llm_strategy_agent"]`, call `strategy_agent.advise(user_id, performance_summary)` and apply returned adjustments
- Enable flag via admin panel or per-user toggle (Phase B rollout)

---

## 6. Buffer Slot Window — Spec vs. Implementation Mismatch ⚠️ Differs

**Spec ref:** Section 10-B5

**Spec says:** ±2 minute fuzzy window for slot detection
**Code uses:** `SLOT_FUZZY_MINUTES = 15` (`buffer_manager.py:20`)

**Impact:** 15-minute window is more permissive (less likely to miss user-created posts). The spec is more conservative. This is not a bug per se, but the spec should either be updated to reflect 15 min, or the code should be tightened to 2 min.

**Decision required:** Pick one and align spec + code. Recommendation: keep 15 min (safer) and update the spec.

---

## Summary

| # | Gap | Severity | Files to Change |
|---|-----|----------|----------------|
| 1 | Token expiry 401 detection + activity log | **High** | `metrics_collector.py`, `orchestrator.py` |
| 2 | Discovery → auto-experiment creation | **High** | `discovery_manager.py`, `learning_engine.py` |
| 3 | Phase regression (optimizing → learning) | **High** | `state.py`, `orchestrator.py` |
| 4 | Brand removal cascade cleanup | **Medium** | DB migration, brand delete endpoint |
| 5 | LLM Strategy Agent integration | **Medium** | `orchestrator.py`, `feature_flags.py` |
| 6 | Buffer slot window spec/code mismatch | **Low** | Decision only — update spec or code |

---

*Generated February 2026 — reflects production codebase state post-v2.0 implementation sprint.*
