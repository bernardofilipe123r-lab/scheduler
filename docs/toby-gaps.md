# Toby — Implementation Gaps

**Date:** February 2026
**Source:** Audit of production codebase vs `docs/toby-architecture-spec.md`
**Scope:** Everything in the spec not yet fully live

---

## How to Read This Document

You should have already read `docs/toby-architecture-spec.md` in full. That document describes the complete intended architecture for Toby, an autonomous per-user AI content agent. It covers the 5-minute orchestration tick loop, epsilon-greedy / Thompson Sampling strategy selection, content buffer management, Instagram publishing, metrics collection, drift detection, and the React frontend.

**This document is the delta.** It lists only the features, logic, and fixes that the spec describes but the codebase does not yet fully implement. Every item here has a direct reference back to the spec section that defines the expected behavior, so you can cross-reference for full detail.

**Do not re-implement what is already live.** The spec clearly marks implemented items as `✅ Live`. Everything marked `⚠️ Partial`, `❌ Missing`, or `🔧 Planned` in the spec is what this document covers.

---

## Environment Access

The following tools are available for implementation. Use them freely:

- ✅ **Supabase** — full access via `DATABASE_URL` connection string. Run SQL migrations directly, inspect tables, alter schema, query live data.
- ✅ **Railway CLI** — full access to deploy, run one-off commands (`railway run`), stream logs, and trigger restarts on the production environment.

---

## Architecture Orientation (brief recap)

Toby runs as a background APScheduler job every 5 minutes (the "tick") inside a FastAPI backend deployed on Railway. The tick calls `orchestrator.py`, which runs a priority queue:

```
buffer check → metrics check → analysis check → discovery check → phase check
```

Key services involved:
- `app/services/toby/orchestrator.py` — the tick loop and coordination
- `app/services/toby/learning_engine.py` — Thompson Sampling experiment selection
- `app/services/toby/state.py` — phase state machine (bootstrap → learning → optimizing)
- `app/services/toby/analysis_engine.py` — composite Toby Score + drift detection
- `app/services/toby/discovery_manager.py` — hashtag/competitor scanning
- `app/services/toby/buffer_manager.py` — 2-day content pre-generation
- `app/services/analytics/metrics_collector.py` — Instagram Graph API metrics
- `app/services/publishing/social_publisher.py` — Instagram publishing
- `app/services/toby/strategy_agent.py` — LLM advisory layer (disabled)

All Toby state lives in PostgreSQL (Supabase). The frontend (React + TypeScript, Vite) consumes it via FastAPI endpoints. The Observatory page (`src/pages/Observatory.tsx`) shows Toby's activity log and experiment status in real time.

---

## Status Legend

- ⚠️ **Partial** — structure/skeleton exists, logic incomplete
- ❌ **Missing** — no code exists at all
- 🔧 **Disabled** — code written but gated behind a feature flag and not wired into the live loop

---

## Gap 1 — Instagram Token Expiry: Full Handling ⚠️ Partial

**Spec ref:** Section 10-C1, Section 16.1 (P1 bug)

**Why this matters in Toby's loop:**
Every analysis tick, the orchestrator calls `metrics_collector.py` to fetch Instagram stats for each brand. Those stats feed into the Toby Score, which drives the learning engine's strategy selection. If the token is silently expired, the API returns a 401 that gets swallowed — metrics return as zero or `None`, those zero-metric posts get flagged `metrics_unreliable`, and the strategy learning engine receives no signal for weeks without anyone knowing why. Toby keeps publishing blind.

**What exists:**
- `metrics_collector.py` returns `{"token_expired": True}` when the token field is empty in DB
- `_check_token_validity()` logs a warning if the token string is missing

**What's missing:**
- No HTTP 401 / Instagram error code 190 detection inside `fetch_media_metrics()`. If the token is present in DB but has expired (60-day TTL), the IG API returns a 401 JSON error that is currently silently treated as a failed fetch
- No `TobyActivityLog` entry with `action_type="token_expired"` — the user never sees this in the Observatory feed and doesn't know to re-authenticate
- No debounce — the event should emit at most once per 24 hours, not on every 5-minute tick

**Required changes:**
1. `app/services/analytics/metrics_collector.py` — inside `fetch_media_metrics()`, inspect the HTTP response body for `{"error": {"code": 190}}` or HTTP 401, and on detection: set a per-brand `token_expired` flag in DB and call `emit_token_expired_event(user_id, brand_id)`
2. `app/services/toby/orchestrator.py` — when `collect_metrics()` returns `token_expired=True` for a brand, skip `update_strategy_score()` for that brand (don't corrupt learning with zero-signal data)
3. Debounce: check `TobyActivityLog` for an existing `token_expired` entry in the last 24h before emitting a new one

---

## Gap 2 — Discovery → LearningEngine Auto-Experiment Creation ⚠️ Partial

**Spec ref:** Section 9.3 (Discovery Integration), Section 10-D, Section 12 Phase B

**Why this matters in Toby's loop:**
Toby's discovery system (`discovery_manager.py`) scans Instagram for trending hashtags and competitor content every 6 hours. The spec says discovery results should feed back into the learning engine — new trending hashtags become new options in the `hashtag_style` experiment dimension, letting Toby test them against current performers. Without this, discovery is a one-way data collection with no downstream effect on what Toby actually produces.

**What exists:**
- `discovery_manager.py:183–213` — `_feed_discovery_to_learning()` exists, is called when discovery returns results > 0
- The function computes a basic "significance" score for discovered hashtags and logs a `"discovery_learning_signal"` activity entry

**What's missing:**
- The function logs the string "learning engine will incorporate via exploration" as a comment but makes **zero calls** to the learning engine — no experiment is created or modified
- There is no `add_option_to_experiment()` function in `learning_engine.py`
- Newly discovered trending hashtags never become testable options in any live experiment

**Required changes:**
1. `app/services/toby/learning_engine.py` — implement `add_option_to_experiment(db, user_id, dimension, new_option)`:
   - Find the active experiment for that dimension
   - If `new_option` is not already an arm, append it with a prior score equal to the current experiment mean (so it gets a fair chance without cold-start disadvantage)
   - Guard: only add if experiment has fewer than `MAX_ARMS` (e.g. 8)
2. `app/services/toby/discovery_manager.py:_feed_discovery_to_learning()` — for each hashtag with significance above threshold, call `learning_engine.add_option_to_experiment(db, user_id, dimension="hashtag_style", new_option=hashtag)`

---

## Gap 3 — Phase Regression (Optimizing → Learning) ❌ Missing

**Spec ref:** Section 10-H4, Section 8 (State Machine Core Loop)

**Why this matters in Toby's loop:**
Toby's state machine has three phases: `bootstrap → learning → optimizing`. The spec requires a fourth transition direction: backward. If a brand's performance drops 20%+ versus its 90-day baseline (e.g. algorithm change, niche shift, seasonal effect), Toby should regress from `optimizing` back to `learning`, increase the `explore_ratio` from the default 0.30 to 0.50, and start testing again. Without this, Toby stays in `optimizing` phase, keeps exploiting a now-stale strategy, and performance continues to decline with no autonomous recovery.

**What exists:**
- `state.py` — phase transitions go forward only: `bootstrap → learning → optimizing`
- `analysis_engine.py` — drift detection exists and adjusts `explore_ratio` dynamically (✅ implemented), but it does **not** change the phase label itself
- No backward phase transition anywhere in the codebase

**What's missing:**
- No function to compare 14-day rolling avg vs. 90-day baseline avg for a brand
- No mechanism to set `current_phase = "learning"` when performance regresses
- No `TobyActivityLog` entry to tell the user Toby detected a performance drop and is re-entering learning mode

**Required changes:**
1. `app/services/toby/state.py` — add `check_phase_regression(db, user_id)`:
   - Query `TobyContentTag` (or `PostPerformance`) for the brand's 14-day avg Toby Score vs. 90-day avg
   - If 14-day avg < 90-day avg × 0.80 (20% drop), and current phase is `"optimizing"`:
     - Set `current_phase = "learning"`
     - Set `explore_ratio = 0.50`
     - Emit `action_type="phase_regression"` to `TobyActivityLog`
2. `app/services/toby/orchestrator.py` — call `check_phase_regression()` at the end of every analysis tick (after scoring is complete, so the data is fresh)

---

## Gap 4 — Brand Removal: Full Cascade Cleanup ⚠️ Partial

**Spec ref:** Section 10-A2

**Why this matters in Toby's loop:**
When a user removes a brand from the platform, Toby must treat it as a full teardown — not just stopping generation, but cleaning up all downstream state. Without cleanup: (a) future `scheduled_reels` slots for the deleted brand remain and the publisher tries to post to a non-existent brand, (b) `toby_strategy_scores` for the deleted brand remain in the DB and can leak into cross-brand cold-start for other brands, (c) the user sees no acknowledgement in the Observatory feed that Toby registered the brand removal.

**What exists:**
- `NicheConfig` rows CASCADE delete when a brand is removed (DB FK confirmed)

**What's missing:**
- `scheduled_reels` rows where `extra_data->>'brand' = brand_id` are **not** deleted — future slots orphaned, publisher will attempt to post to a deleted brand
- `toby_strategy_scores` rows for the brand are **not** deleted — stale winning strategies persist and can pollute cross-brand cold-start for sibling brands
- No `TobyActivityLog` entry emitted for brand deletion

**Required changes:**
1. DB migration (run via Supabase connection string):
   - Delete future `scheduled_reels` for the brand on deletion: either add an application-level cleanup call, or add a DB trigger. Note: `extra_data->>'brand'` is a JSONB field so a standard FK cascade won't work — needs explicit query
2. `app/api/brands/routes.py` (or equivalent brand delete endpoint) — after deleting the brand row, run:
   - `DELETE FROM scheduled_reels WHERE user_id = :uid AND extra_data->>'brand' = :brand_id AND scheduled_time > NOW()`
   - `DELETE FROM toby_strategy_scores WHERE user_id = :uid AND brand_id = :brand_id`
   - Insert a `TobyActivityLog` entry: `action_type="brand_removed"`, `details={"brand_id": brand_id, "slots_cancelled": N}`

---

## Gap 5 — LLM Strategy Agent: Wire Into Live Loop 🔧 Disabled

**Spec ref:** Section 12 (Phase B roadmap), Section 9 (Intelligence Engine)

**Why this matters in Toby's loop:**
The LLM Strategy Agent is a planned component that replaces (or augments) pure epsilon-greedy / Thompson Sampling with natural-language reasoning over performance data. Instead of pure statistics, an LLM (Claude or DeepSeek) reasons: "Toby Score dropped 15% this week. The competitor @fitbrand posted 3x more reels with motivational hooks. Recommend shifting to the 'motivational' personality angle and increasing post frequency." This is the bridge from statistical automation to genuine AI decision-making.

**What exists:**
- `app/services/toby/strategy_agent.py` — 160+ lines of agent logic exists
- `app/services/toby/feature_flags.py:17` — `"llm_strategy_agent": False` (disabled by default)

**What's missing:**
- The feature flag is `False` — the agent is never invoked
- No call to `strategy_agent.advise()` anywhere in `orchestrator.py`
- Discovery results and performance summaries are never serialized and passed to the LLM
- The agent's output (strategy recommendations) is never applied to `explore_ratio`, experiment weights, or personality selection

**Required changes:**
1. `app/services/toby/orchestrator.py` — in the analysis tick branch, after `check_experiment_results()` and before returning:
   ```python
   if feature_flags.get("llm_strategy_agent"):
       summary = build_performance_summary(db, user_id)
       recommendations = await strategy_agent.advise(user_id, summary)
       apply_strategy_recommendations(db, user_id, recommendations)
   ```
2. Enable the flag via `feature_flags.py` or per-user DB toggle — recommend a gradual rollout (enable for 10% of users first)
3. Ensure `strategy_agent.advise()` is idempotent and has a timeout (max 10s) so a slow LLM call never blocks the tick loop

---

## Gap 6 — Buffer Slot Window: Spec vs. Code Mismatch ⚠️ Differs

**Spec ref:** Section 10-B5

**Why this matters:**
The buffer manager detects whether a scheduled slot is "already filled" before generating new content. It uses a fuzzy time window to account for user-created posts that might not be at the exact scheduled minute.

**Spec says:** ±2 minute fuzzy window
**Code uses:** `SLOT_FUZZY_MINUTES = 15` (`buffer_manager.py:20`)

**Impact:** The 15-minute window is more permissive — better at detecting user-created posts and avoiding overwrites. The spec's 2-minute window is more conservative and more likely to accidentally overwrite a user post that's 5 minutes off the slot time. This is not a bug — the code behavior is safer.

**Decision required:** Align spec and code. Recommendation: keep 15 min in code and update the spec to reflect ±15 min. Do not tighten the code to 2 min — it would increase false positives (Toby overwriting user content).

**Required change:** Update `docs/toby-architecture-spec.md` Section 10-B5 to say ±15 minutes instead of ±2 minutes.

---

## Summary

| # | Gap | Severity | Primary Files |
|---|-----|----------|---------------|
| 1 | Token expiry 401 detection + activity log | **High** | `metrics_collector.py`, `orchestrator.py` |
| 2 | Discovery → auto-experiment creation | **High** | `discovery_manager.py`, `learning_engine.py` |
| 3 | Phase regression (optimizing → learning) | **High** | `state.py`, `orchestrator.py` |
| 4 | Brand removal cascade cleanup | **Medium** | DB migration, brand delete endpoint |
| 5 | LLM Strategy Agent wired into loop | **Medium** | `orchestrator.py`, `feature_flags.py`, `strategy_agent.py` |
| 6 | Buffer slot window spec/code mismatch | **Low** | Update spec only (keep ±15min in code) |

**Implement in order: 3 → 1 → 2 → 4 → 5 → 6.** Phase regression (3) is the highest-value autonomous behavior gap. Token expiry (1) is the most common silent failure in production. Discovery feedback (2) completes the intelligence loop. Brand cleanup (4) prevents data corruption. LLM agent (5) is the most complex and should come last.

---

*Generated February 2026 — companion document to `docs/toby-architecture-spec.md` v2.0. Reflects production codebase state post-v2.0 implementation sprint.*
