---
name: toby-agent
description: "Toby autonomous agent system — orchestrator tick loop, cognitive agents, memory subsystem, Thompson Sampling, experiments, feature flags. Use when: modifying Toby agent behavior, adding new agents, changing tick logic, adjusting rate limits, working on memory system, modifying strategy selection, adding feature flags, debugging Toby state machine, changing phase transitions."
---

# Toby Agent System

## When to Use
- Modifying the orchestrator tick loop or decision priority
- Adding or changing agent behavior (Scout, Strategist, Creator, Critic, Publisher, Reflector, Analyst, etc.)
- Working on the memory subsystem (episodic, semantic, procedural, world model)
- Adjusting Thompson Sampling, strategy selection, or experiment design
- Changing phase transitions (bootstrap → learning → optimizing)
- Adding or modifying feature flags
- Debugging Toby state, buffer fill, or billing guard logic

## Architecture Overview

Toby is an autonomous multi-agent system running on a **5-minute APScheduler tick loop**. It operates through 4 cognitive loops:

- **Loop 1 (Reactive):** Scout → Strategist → Creator → Critic → Publisher → Reflector
- **Loop 2 (Analytical):** Analyst scores posts, detects anomalies, updates strategy priors
- **Loop 3 (Deliberative):** Pattern Analyzer daily deep analysis + experiment design (DeepSeek R1)
- **Loop 4 (Meta-Cognitive):** Meta-Learner weekly self-tuning (explore ratio, prior decay, rule eviction)

## Key Source Files

| File | Purpose |
|------|---------|
| `app/services/toby/orchestrator.py` | Main tick loop — `toby_tick()` called every 5 min |
| `app/services/toby/state.py` | Phase state machine, preflight validation, confidence computation |
| `app/services/toby/feature_flags.py` | All feature flags (v2 + v3 cognitive) |
| `app/services/toby/buffer_manager.py` | Buffer fill logic (2-day lookahead) |
| `app/services/toby/learning_engine.py` | Thompson Sampling, strategy selection, experiments |
| `app/services/toby/analysis_engine.py` | Toby Score calculation, metrics update |
| `app/services/toby/budget_manager.py` | Daily per-user budget enforcement |
| `app/services/toby/agents/*.py` | All specialized agents |
| `app/services/toby/agents/quality_guard.py` | Self-monitoring: dedup, fallback rejection, content integrity |
| `app/services/toby/memory/*.py` | Memory subsystem |
| `app/models/toby.py` | TobyState, TobyStrategyScore, TobyExperiment, TobyContentTag, TobyActivityLog |
| `app/models/toby_cognitive.py` | TobyEpisodicMemory, TobySemanticMemory, TobyProceduralMemory, TobyWorldModel |

## Orchestrator Tick Decision Priority

Each check runs independently with its own DB commit scope (failures don't cascade):

0. **Quality Guard** (every tick) → Self-monitoring: cancels fallbacks, title dupes, slot collisions, caption near-dupes
1. **Buffer Check** (5 min interval) → Fills empty slots for next 2 days
2. **Metrics Check** (6h interval) → Collects Instagram analytics via MetricsCollector
3. **Analysis Check** (6h interval) → Scores posts, updates strategy priors, runs cognitive loops
4. **Discovery Check** (dynamic interval) → TrendScout scanning
5. **Phase Check** (every tick) → Validates state machine transitions

## Rate Limiting

```
Steady-State:
  MAX_GENERATIONS_PER_BRAND_PER_HOUR = 2
  MAX_GENERATIONS_PER_USER_PER_HOUR = 6
  GENERATION_COOLDOWN_MINUTES = 15

Bootstrap Mode (first 2 days):
  BOOTSTRAP_MAX_PER_BRAND_PER_HOUR = 6
  BOOTSTRAP_MAX_PER_USER_PER_HOUR = 20
  BOOTSTRAP_COOLDOWN_MINUTES = 2
  BOOTSTRAP_MAX_PLANS_PER_TICK = 4
  BOOTSTRAP_MAX_PARALLEL_WORKERS = 3
```

**CRITICAL:** Parallel execution is DISABLED (2026-03-08 incident). All content generation
is sequential regardless of mode. The parallel codepath caused duplicate content because
separate DB sessions couldn't see each other's uncommitted inserts, resulting in identical
reels being scheduled 4-6 times per brand. See "Anti-Duplicate Safeguards" section below.

## Phase State Machine

```
BOOTSTRAP → LEARNING → OPTIMIZING
```

**Transition Thresholds:**
- Bootstrap → Learning: 15 scored posts, 3+ days, 3+ distinct strategies
- Learning → Optimizing: 7+ days, confidence ≥ 0.60 (15 samples per strategy target)
- **Phase Regression:** If 14-day rolling avg < 80% of 90-day baseline → regress to Learning (explore_ratio=0.50)

**Preflight (enable Toby):**
- ≥1 active brand with Instagram Business Account ID
- NicheConfig has ≥1 topic category
- Errors return: `ValueError("preflight:{failures}")`

## Agent Pipeline (Loop 1)

### Scout Agent (`agents/scout.py`)
Gathers full environmental context: brand baseline, strategy scores, memories (episodic/semantic/procedural by cosine similarity), world model signals, content gaps.

### Strategist Agent (`agents/strategist.py`)
Chain-of-thought strategy reasoning via **DeepSeek R1** (`deepseek-reasoner`, 4000 tokens). Takes Thompson Sampling pick as Bayesian prior, may override with rationale. Output: 5-dimension strategy (personality, topic_bucket, hook_strategy, title_format, visual_style) + confidence + rationale. Fallback: uses Thompson Sampling pick if R1 fails.

### Creator Agent (`agents/creator.py`)
Memory-augmented content generation via **DeepSeek Chat** (`deepseek-chat`). Injects: strategy params, brand DNA constraints, 3 episodic examples, 3 semantic insights, 5 procedural rules, competitor context. Temperature: 0.85, tokens: 1200 (reel) / 8000 (post). Supports revision loop with critic feedback.

### Critic Agent (`agents/critic.py`)
Three-layer ensemble evaluation:
- **Rule-Based** (QualityScorer): 25% weight — structural checks, deterministic
- **Semantic** (DeepSeek Chat, temp=0.2): 45% weight — hook power, novelty, brand alignment (6 dimensions)
- **Audience Simulator** (DeepSeek Chat, temp=0.5): 30% weight — scroll stop, read-through, save, share, follow

Ensemble ≥ 80 → publish. 60-79 → revise. < 60 → kill. Rule score < 50 → early kill (skip API calls).

### Publisher Agent (`agents/publisher.py`)
Tags `TobyContentTag` with cognitive metadata (quality_score, strategy_rationale, thompson_override, critic breakdown).

### Reflector Agent (`agents/reflector.py`)
Triple memory writing via DeepSeek Chat (temp=0.3): creates episodic event, semantic insight, and optional procedural IF-THEN rule. Fallback: basic text memories if LLM fails.

### Experiment Designer Agent (`agents/experiment_designer.py`)
Part of Loop 3 (daily deliberation). Designs hypothesis-driven A/B experiments with sequential testing for early stopping. Creates `TobyExperiment` entries with specific hypotheses and success metrics.

### Meta-Learner Agent (`agents/meta_learner.py`)
Weekly meta-cognitive loop (Loop 4). Evaluates whether Toby's learning is improving outcomes and adjusts the learning system itself — explore ratios, scoring weights, strategy selection parameters.

### Pattern Analyzer Agent (`agents/pattern_analyzer.py`)
Daily deliberation loop (Loop 3). Uses DeepSeek Reasoner R1 for deep pattern analysis across 7 days of performance data. Identifies strategy evolution opportunities, underperforming dimensions, and emergent trends.

## Memory System

| Type | Table | Cap | Key Fields |
|------|-------|-----|------------|
| Episodic | `toby_episodic_memory` | 500/brand | summary, key_facts, tags, embedding (1536d), toby_score |
| Semantic | `toby_semantic_memory` | 200/user | insight, confidence (0-1), confirmed/contradicted counts |
| Procedural | `toby_procedural_memory` | 50/brand | rule_text, conditions, action, success_rate, is_active |
| World Model | `toby_world_model` | auto-expire | signal_type, signal_data, interpretation, expires_at |

**Embeddings:** OpenAI `text-embedding-3-small` (1536 dimensions). Retrieved via pgvector cosine distance.

**Confidence Updates:** Semantic confirm += 0.05*(1-conf), contradict -= 0.10 (floor 0.05). Procedural deactivated if success_rate < 0.40 after 5+ applications.

**Gardener** runs weekly: prunes episodic >90 days with <2 retrievals, enforces caps, expires world model signals.

## Thompson Sampling

Beta-Bernoulli conjugate prior per dimension/option/brand/content_type.

**Selection:** `random() < explore_ratio` → random option. Otherwise: sample from Beta(α, β) per option, pick argmax.

**Score normalization:** `normalized = clip((score - 40) / 60, 0, 1)`. Update: `α += normalized * weight`, `β += (1 - normalized) * weight`.

**Weighted updates:** 48h preliminary = weight 0.6, 7d final = weight 1.0 (undo preliminary + add final).

**Dynamic explore ratio per brand:**
- 0 posts → 1.0 (pure exploration)
- <5 posts → 0.80
- <10 posts → 0.50
- else → base_ratio (from TobyState)

**Cold-start:** Falls back to cross-brand scores (user-level), then random.

## Experiments

A/B testing via `TobyExperiment`. Welch's t-test for significance (p < 0.05, effect size > 0.3). Timeout: 21 days auto-complete. Min 2 options required. Max 8 arms.

## Feature Flags (`feature_flags.py`)

**v2 (mostly enabled):** thompson_sampling, drift_detection, cross_brand_learning, discovery_feedback, experiment_timeouts, fuzzy_slot_matching, auto_retry_publish, credential_refresh

**v3 (mostly disabled):** cognitive_strategist, multi_critic, memory_system, deliberation_loop (enabled), meta_learning, intelligence_pipeline, historical_mining, cross_brand_intelligence

## Toby Score Formula

**Reels:** 20% raw_views (log₁₀ scale vs 500K) + 30% relative_views (vs brand avg) + 40% engagement ((saves×2 + shares×3) / views) + 10% follower_reach (views / followers)

Posts use `reach` instead of `views`. Metrics flagged unreliable if views < 5 or reach < 5.

## Error Handling Patterns
- **Debounced logging:** In-memory dict suppresses repeated errors for same user:action within 30 minutes
- **State isolation:** Each check has own DB commit scope
- **Billing guard:** Skips locked users entirely
- **Budget guard:** Skips users who exceeded daily budget (feature-flagged)

## Anti-Duplicate Safeguards (CRITICAL — added 2026-03-08)

On 2026-03-08, a race condition caused identical reels to be scheduled 4-6 times per brand.
Root cause: parallel DB sessions in `_execute_plans_parallel()` couldn't see each other's
uncommitted inserts, so the dedup guard in `schedule_reel()` passed for all threads.

### Architectural Philosophy

These safeguards are NOT external band-aids — they are part of **Toby's cognitive architecture**.
Toby is self-monitoring: he inspects his own output before every tick and self-corrects.
This makes him resilient by design, not by patch. The Quality Guard agent scales with Toby —
new content types, platforms, and patterns are automatically covered without external scripts.

### 5 layers of protection (all must remain active)

| Layer | Where | What |
|-------|-------|------|
| 0. Quality Guard agent | `agents/quality_guard.py` (step 0 of every tick) | Toby self-monitors: detects fallbacks, title dupes, slot collisions, caption dupes — cancels them |
| 1. Sequential execution | `orchestrator.py` `_run_buffer_check()` | Eliminates the root race condition — never re-enable parallel execution |
| 2. Scheduler 3-layer dedup | `scheduler.py` `schedule_reel()` | L1: time-slot ±30min, L2: same title in 5 days, L3: same caption start in 3 days (all with `FOR UPDATE`) |
| 3. Fallback rejection | `orchestrator.py` `_execute_content_plan()` + `scheduler.py` | Titles matching "content generation temporarily unavailable" are NEVER scheduled |
| 4. Pre-publish dedup | `scheduler.py` `get_pending_publications()` | Catches duplicates in the batch about to publish (same brand+title → keep first, fail rest) |

**External backup:** `scripts/dedup_sweeper.py` exists as a manual tool for incident response,
but the primary mechanism is Toby's own Quality Guard agent.

**DB indexes supporting dedup:**
- `ix_sched_reels_brand_time_status` — fast brand+time+status lookups
- `ix_sched_reels_brand_title` — fast brand+title lookups

## Common Mistakes to Avoid
1. **NEVER re-enable parallel content execution** — this was the root cause of the 2026-03-08 duplicate incident
2. **NEVER schedule fallback content** — raise an exception instead of using placeholder titles
3. **NEVER bypass the Quality Guard agent** — it must run as step 0 of every tick
4. Never modify tick priority order without understanding cascade effects
4. Always check `feature_flags` before using v3 cognitive features
5. Memory retrieval must handle `None` embeddings (graceful fallback to recency sort)
6. Strategy score updates must use proper weight correction for 48h → 7d transition
7. Experiments need ≥2 options — single-arm creation returns None
8. Phase regression check compares 14-day vs 90-day — ensure sufficient data exists
9. Any new content scheduling path MUST go through `schedule_reel()` which has the 3-layer dedup guard
10. The Quality Guard agent must always run as step 0 in `_process_user()` — before buffer check
11. Self-monitoring is Toby's responsibility — external scripts are backups, not primary mechanisms
