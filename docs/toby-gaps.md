# Toby — Implementation Gaps

**Date:** February 2026
**Source:** Audit of production codebase vs `docs/toby-architecture-spec.md`
**Last updated:** Post-commit `5b67693` — "Remove per-brand Content DNA — make it user-level only"

---

## How to Read This Document

You should have already read `docs/toby-architecture-spec.md` in full. That document describes the complete intended architecture for Toby, an autonomous per-user AI content agent. It covers the 5-minute orchestration tick loop, Thompson Sampling strategy selection, content buffer management, Instagram publishing, metrics collection, drift detection, and the React frontend.

**This document is the delta.** It lists only the features, logic, and fixes that the spec describes but the codebase does not yet fully implement. Every item has a reference to the affected file and line where it matters.

**Do not re-implement what is already live.** The spec marks implemented items as `✅ Live`. Do not touch those.

---

## Environment Access

- ✅ **Supabase** — full access via `DATABASE_URL` connection string. Run migrations directly, inspect tables, alter schema, query live data.
- ✅ **Railway CLI** — full access to deploy, run one-off commands (`railway run`), stream logs, and trigger restarts on the production environment.

---

## Architecture Orientation (brief recap)

Toby runs as a background APScheduler job every 5 minutes (the "tick") inside a FastAPI backend deployed on Railway. The tick calls `orchestrator.py`, which runs a priority queue:

```
buffer check → metrics check → analysis check → discovery check → phase check
```

Key services:
- `app/services/toby/orchestrator.py` — tick loop and coordination
- `app/services/toby/learning_engine.py` — Thompson Sampling, experiment selection
- `app/services/toby/state.py` — phase state machine (bootstrap → learning → optimizing), **scoped per-user**
- `app/services/toby/analysis_engine.py` — composite Toby Score + drift detection
- `app/services/toby/discovery_manager.py` — hashtag/competitor scanning
- `app/services/toby/buffer_manager.py` — 2-day content pre-generation
- `app/services/analytics/metrics_collector.py` — Instagram Graph API metrics, **scoped per-brand**
- `app/services/publishing/social_publisher.py` — Instagram publishing
- `app/services/toby/strategy_agent.py` — LLM advisory layer (disabled)

**Important architectural state after the most recent commit:**
- `NicheConfig` (Content DNA) is now **per-user only** — `brand_id` column dropped, one config per user
- `TobyState` (phase, explore_ratio) is **per-user** — one state machine for all of a user's brands
- `TobyStrategyScore` is still **per-brand** — strategy performance is tracked per-brand
- `TobyExperiment` is **per-user** — experiments run at the user level
- Instagram metrics collection and publishing are **per-brand** (unchanged)

This creates an intentional but important split: *learning and phases are user-level, execution and metrics are brand-level.* The gaps below operate in that context.

---

## Status Legend

- ⚠️ **Partial** — structure/skeleton exists, logic incomplete
- ❌ **Missing** — no code exists at all
- 🔧 **Disabled** — code written but gated behind a feature flag, not wired into the live loop

---

## Gap 1 — Instagram Token Expiry: Full Handling ⚠️ Partial

**Spec ref:** Section 10-C1, Section 16.1 (P1 bug)
**Affected files:** `app/services/analytics/metrics_collector.py`, `app/services/toby/orchestrator.py`

**Why this matters:**
Every analysis tick, the orchestrator calls `metrics_collector.py` to fetch Instagram stats for each brand. Those stats feed into the Toby Score, which drives strategy selection. If the token is silently expired, the API returns a 401 that gets swallowed — metrics return as zero, those posts get flagged `metrics_unreliable`, and the strategy learning engine receives no signal for weeks without anyone knowing. Toby keeps publishing blind.

**What exists:**
- Returns `{"token_expired": True}` when the token field is empty in DB
- `_check_token_validity()` warns if the token string is missing at all

**What's missing:**
- No HTTP 401 / Instagram error code 190 detection inside `fetch_media_metrics()`. If the token is present in DB but expired (60-day TTL), the IG API returns a 401 JSON error that is silently treated as a failed fetch
- No `TobyActivityLog` entry with `action_type="token_expired"` — user never sees this in the Observatory feed
- No debounce — should emit at most once per 24h, not on every tick

**Required changes:**
1. `metrics_collector.py` — inside `fetch_media_metrics()`, inspect the HTTP response body for `{"error": {"code": 190}}` or HTTP 401. On detection: set a per-brand `token_expired` flag in DB and call `emit_token_expired_event(user_id, brand_id)`
2. `orchestrator.py` — when `collect_metrics()` returns `token_expired=True` for a brand, skip `update_strategy_score()` for that brand to avoid corrupting learning with zero-signal data
3. Debounce: check `TobyActivityLog` for an existing `token_expired` entry in the last 24h before emitting a new one

---

## Gap 2 — Discovery → LearningEngine Auto-Experiment Creation ⚠️ Partial

**Spec ref:** Section 9.3, Section 10-D, Section 12 Phase B
**Affected files:** `app/services/toby/discovery_manager.py`, `app/services/toby/learning_engine.py`

**Why this matters:**
The discovery system scans Instagram for trending hashtags and competitor content every 6 hours. The spec says these results should feed back into the learning engine — new trending hashtags become new options in the `hashtag_style` experiment dimension. Without this, discovery collects data that is never acted upon.

**What exists:**
- `discovery_manager.py:183–213` — `_feed_discovery_to_learning()` exists and is called when results > 0
- Computes a "significance" score and logs a `"discovery_learning_signal"` activity entry

**What's missing:**
- The function logs "learning engine will incorporate via exploration" but makes **zero calls** to the learning engine — no experiment is created or modified
- There is no `add_option_to_experiment()` function in `learning_engine.py`
- Newly discovered trending hashtags never become testable experiment arms

**Required changes:**
1. `learning_engine.py` — implement `add_option_to_experiment(db, user_id, dimension, new_option)`:
   - Find the active experiment for that `dimension`
   - If `new_option` is not already an arm, append it with a prior score equal to the current experiment mean (fair cold-start)
   - Guard: skip if experiment already has `MAX_ARMS` (e.g. 8)
2. `discovery_manager.py:_feed_discovery_to_learning()` — for each hashtag above significance threshold, call `learning_engine.add_option_to_experiment(db, user_id, dimension="hashtag_style", new_option=hashtag)`

**Note:** Experiments are scoped per-user (no `brand_id` on `TobyExperiment`). A discovery from Brand A's competitors will seed an experiment arm that is tested across all brands of that user. This is consistent with the current user-level NicheConfig architecture.

---

## Gap 3 — Phase Regression (Optimizing → Learning) ❌ Missing

**Spec ref:** Section 10-H4, Section 8 (State Machine Core Loop)
**Affected files:** `app/services/toby/state.py`, `app/services/toby/orchestrator.py`

**Why this matters:**
The state machine only moves forward: `bootstrap → learning → optimizing`. If a brand's performance drops 20%+ (algorithm change, niche shift, seasonal effect), Toby stays in `optimizing` phase, keeps exploiting a now-stale strategy, and declines with no autonomous recovery.

**What exists:**
- Forward-only phase transitions in `state.py`
- `analysis_engine.py` adjusts `explore_ratio` dynamically on drift (✅ already implemented), but does NOT change the phase label

**What's missing:**
- No function to detect performance drops vs. baseline
- No mechanism to set `current_phase = "learning"` when regression is detected
- No `TobyActivityLog` entry to surface this to the user

**Scope clarification (important for implementation):**
`TobyState.phase` is **per-user** (unique constraint on `user_id` only — `app/models/toby.py:19`). However, Instagram metrics and `toby_strategy_scores` are **per-brand**. Phase regression logic must aggregate across all active brands for the user.

**Required changes:**
1. `state.py` — add `check_phase_regression(db, user_id)`:
   - For each active brand of the user, query `TobyContentTag` / `PostPerformance` for 14-day avg Toby Score
   - Compute the user-level 90-day baseline avg (aggregate across brands)
   - If user-level 14-day avg < 90-day avg × 0.80 AND `current_phase == "optimizing"`:
     - Set `current_phase = "learning"`, `explore_ratio = 0.50`
     - Emit `action_type="phase_regression"` to `TobyActivityLog`
2. `orchestrator.py` — call `check_phase_regression()` at the end of every analysis tick

---

## Gap 4 — Brand Removal: Full Cascade Cleanup ⚠️ Partial

**Spec ref:** Section 10-A2
**Affected files:** `app/services/brands/manager.py`, DB migration

**Why this matters:**
When a user removes a brand, Toby must clean up all downstream state. Currently brand deletion is a **soft delete only** — `brand.active = False` is set in `manager.py:385` and nothing else is touched. Future scheduled slots for the deleted brand remain in the DB, and the publisher skips them (it checks `brand.active`), but they accumulate as dead rows forever. Strategy scores also remain and can pollute cross-brand cold-start logic.

**What changed in the last commit:**
NicheConfig is now **per-user** and is no longer deleted on brand removal (it was per-brand before). This is correct — the user's content DNA should survive a brand deletion. No action needed there.

**What's still missing:**
- `scheduled_reels` rows where `extra_data->>'brand' = brand_id` are never cleaned up. The publisher won't post them (brand is inactive), but they accumulate indefinitely
- `toby_strategy_scores` rows for the brand are never deleted — stale scores persist and can leak into cross-brand cold-start fallback queries (`learning_engine.py:469-483`)
- No `TobyActivityLog` entry emitted when a brand is deleted so the user sees Toby acknowledged the teardown

**Required changes:**
1. `app/services/brands/manager.py` — after setting `brand.active = False`, run:
   ```python
   db.execute("UPDATE scheduled_reels SET status='cancelled' WHERE user_id=:uid AND extra_data->>'brand'=:bid AND scheduled_time > NOW()", {"uid": user_id, "bid": brand_id})
   db.execute("DELETE FROM toby_strategy_scores WHERE user_id=:uid AND brand_id=:bid", {"uid": user_id, "bid": brand_id})
   ```
2. Emit `action_type="brand_removed"` to `TobyActivityLog` with `details={"brand_id": brand_id, "slots_cancelled": N}`

---

## Gap 5 — LLM Strategy Agent: Wire Into Live Loop 🔧 Disabled

**Spec ref:** Section 12 (Phase B roadmap), Section 9 (Intelligence Engine)
**Affected files:** `app/services/toby/orchestrator.py`, `app/services/toby/feature_flags.py`, `app/services/toby/strategy_agent.py`

**Why this matters:**
The LLM Strategy Agent lets an LLM reason over performance data in natural language and produce strategy recommendations. This is the bridge from statistical automation to genuine AI decision-making. The code exists but is never called.

**What exists:**
- `app/services/toby/strategy_agent.py` — 160+ lines of agent logic, scoped per-user (no `brand_id`), not referencing NicheConfig directly
- `feature_flags.py:17` — `"llm_strategy_agent": False`

**What's missing:**
- Feature flag is `False` — agent never runs
- No call to `strategy_agent.advise()` from `orchestrator.py`
- No serialization of discovery results or performance summaries to pass to the agent
- Agent output never applied to `explore_ratio`, experiment weights, or personality selection

**Required changes:**
1. `orchestrator.py` — in the analysis tick branch, after `check_experiment_results()`:
   ```python
   if feature_flags.get("llm_strategy_agent"):
       summary = build_performance_summary(db, user_id)
       recommendations = await strategy_agent.advise(user_id, summary)
       apply_strategy_recommendations(db, user_id, recommendations)
   ```
2. Add a timeout (max 10s) on `strategy_agent.advise()` so a slow LLM call never blocks the tick loop
3. Enable the flag gradually — per-user toggle recommended before a global rollout

---

## Gap 6 — Strategy Scores Per-Brand vs. Topics Per-User: Architectural Tension ⚠️ Partial

**Introduced by:** Commit `5b67693` — NicheConfig made user-level
**Affected files:** `app/services/toby/learning_engine.py`, `app/models/toby.py`

**Why this matters:**
After the recent commit, there is a structural split: `NicheConfig` (the source of topics and tone) is per-user, but `TobyStrategyScore` (which tracks how well each strategy performs) is still per-brand (`app/models/toby.py:121` — `brand_id = Column(String(50), nullable=True)`). `learning_engine.py:194` stores scores per-brand, and the cross-brand cold-start fallback at `learning_engine.py:469-483` queries for `brand_id.is_(None)`.

This means: the topic options available for experimentation come from user-level NicheConfig, but the success of each topic is tracked per-brand. If a user has two brands in different niches but a single NicheConfig (which can now only represent one niche), Brand B may be scored on topics that are only relevant to Brand A.

**Clarification needed before implementing:**

**Option A — Intended design (acceptable):** Strategy scores are per-brand so that Brand A's performance doesn't pollute Brand B's strategy. Topics come from the shared user-level NicheConfig, which the user configures to cover their overall niche (assumed to be one niche across all brands). Cross-brand cold-start (`brand_id=None`) scores act as a warm prior for new brands. This is coherent if the user is assumed to have one niche.

**Option B — Needs fix:** If users are expected to have multiple brands in different niches, NicheConfig must be per-brand again (revert the recent commit) or a brand-to-config mapping must be added.

**Required action:**
- If Option A (one niche per user): document this constraint in the frontend so users understand that all brands share the same content topics. No code change needed, but update the spec.
- If Option B (multi-niche users are valid): add a `niche_config_id` FK to the `brands` table and allow each brand to reference a different NicheConfig. This is a significant reversal of the recent commit.

**Recommendation:** Decide and align — then update `docs/toby-architecture-spec.md` Section 2 and Section 7 to reflect the current model explicitly.

---

## Gap 7 — Buffer Slot Window: Spec vs. Code Mismatch ⚠️ Differs

**Spec ref:** Section 10-B5
**Affected files:** `app/services/toby/buffer_manager.py:20` (code only — no change needed)

**Spec says:** ±2 minute fuzzy window for slot detection
**Code uses:** `SLOT_FUZZY_MINUTES = 15`

The 15-minute window is safer — it is less likely to accidentally overwrite a user-created post that is a few minutes off the expected slot time. Tightening to 2 minutes would increase false positives (Toby generating duplicate content for slots the user already filled manually).

**Required change:** Update `docs/toby-architecture-spec.md` Section 10-B5 to say ±15 minutes. Do not change the code.

---

## Summary

| # | Gap | Severity | Primary Files |
|---|-----|----------|---------------|
| 1 | Token expiry 401 detection + activity log | **High** | `metrics_collector.py`, `orchestrator.py` |
| 2 | Discovery → auto-experiment creation | **High** | `discovery_manager.py`, `learning_engine.py` |
| 3 | Phase regression (optimizing → learning) | **High** | `state.py`, `orchestrator.py` |
| 4 | Brand removal cascade cleanup | **Medium** | `brands/manager.py`, DB migration |
| 5 | LLM Strategy Agent wired into loop | **Medium** | `orchestrator.py`, `feature_flags.py` |
| 6 | Strategy scores per-brand vs. topics per-user | **Medium** | Decision required — clarify before implementing |
| 7 | Buffer slot window spec/code mismatch | **Low** | Update spec only |

**Implement in order: 3 → 1 → 2 → 4 → 6 (decision) → 5 → 7.**
- Phase regression (3) is the highest-value missing autonomous behavior
- Token expiry (1) is the most common silent production failure
- Discovery feedback (2) closes the intelligence loop
- Brand cleanup (4) prevents data accumulation
- Gap 6 requires a product decision before any code touches strategy scores or NicheConfig
- LLM agent (5) is the most complex, save for last

---

*Generated February 2026 — companion document to `docs/toby-architecture-spec.md` v2.0. Reflects production codebase state after commit `5b67693` (NicheConfig made user-level).*
