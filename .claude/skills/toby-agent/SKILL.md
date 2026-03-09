---
name: toby-agent
description: Use when modifying Toby agent behavior, adding new agents, changing tick logic, adjusting rate limits, working on memory system, modifying strategy selection, adding feature flags, debugging Toby state machine, or changing phase transitions.
---

# Toby Agent System

## Architecture

5-minute APScheduler tick loop with 4 cognitive loops:
- **Loop 1 (Reactive):** Scout → Strategist → Creator → Critic → Publisher → Reflector
- **Loop 2 (Analytical):** Analyst scores posts, updates strategy priors
- **Loop 3 (Deliberative):** Pattern Analyzer daily deep analysis (DeepSeek R1)
- **Loop 4 (Meta-Cognitive):** Meta-Learner weekly self-tuning

## Key Source Files

| File | Purpose |
|------|---------|
| `app/services/toby/orchestrator.py` | Main tick loop — `toby_tick()` every 5 min |
| `app/services/toby/state.py` | Phase state machine, preflight validation |
| `app/services/toby/feature_flags.py` | v2 + v3 flags |
| `app/services/toby/buffer_manager.py` | Buffer fill (2-day lookahead) |
| `app/services/toby/learning_engine.py` | Thompson Sampling, strategy selection |
| `app/services/toby/analysis_engine.py` | Toby Score, metrics update |
| `app/services/toby/agents/*.py` | All specialized agents |
| `app/services/toby/agents/quality_guard.py` | Self-monitoring: dedup, fallback rejection |
| `app/services/toby/memory/*.py` | Memory subsystem |
| `app/models/toby.py` | TobyState, TobyStrategyScore, TobyExperiment, TobyContentTag |
| `app/models/toby_cognitive.py` | Episodic, Semantic, Procedural, WorldModel |

## Tick Decision Priority
0. **Quality Guard** (every tick) — self-monitoring
1. **Buffer Check** (5 min) — fill empty slots
2. **Metrics Check** (6h) — collect analytics
3. **Analysis Check** (6h) — score posts, update priors
4. **Discovery Check** (dynamic) — TrendScout
5. **Phase Check** (every tick) — state transitions

## Rate Limits
- Steady: 2 gen/brand/hour, 6 gen/user/hour, 15 min cooldown
- Bootstrap (first 2 days): 6/brand/hour, 20/user/hour, 2 min cooldown

## Phase State Machine
```
BOOTSTRAP → LEARNING → OPTIMIZING
```
- Bootstrap → Learning: 15 scored posts, 3+ days, 3+ strategies
- Learning → Optimizing: 7+ days, confidence ≥ 0.60
- Regression: 14-day avg < 80% of 90-day baseline → Learning

## Anti-Duplicate Safeguards (CRITICAL — 2026-03-08 incident)

5 layers — all must remain active:
1. Quality Guard agent (step 0 of every tick)
2. Sequential execution (NEVER re-enable parallel)
3. Scheduler 3-layer dedup (±30min slot, 5-day title, 3-day caption)
4. Fallback rejection (never schedule placeholder titles)
5. Pre-publish dedup (catch duplicates in batch)

## Memory System
| Type | Cap | Purpose |
|------|-----|---------|
| Episodic | 500/brand | Events with embeddings (1536d), cosine retrieval |
| Semantic | 200/user | Insights with confidence scores |
| Procedural | 50/brand | IF-THEN rules, deactivated if success < 0.40 |
| World Model | auto-expire | External signals with TTL |

## Thompson Sampling
Beta-Bernoulli per dimension/option/brand/content_type. Score: `clip((score - 40) / 60, 0, 1)`. Dynamic explore ratio: 0 posts → 1.0, <5 → 0.80, <10 → 0.50.

## Feature Flags
- v2 (mostly enabled): thompson_sampling, drift_detection, cross_brand_learning, auto_retry_publish
- v3 (mostly disabled): cognitive_strategist, multi_critic, memory_system, meta_learning

## Common Mistakes
1. **NEVER re-enable parallel content execution** — root cause of duplicate incident
2. **NEVER schedule fallback content** — raise exception instead
3. **NEVER bypass Quality Guard** — must run as step 0
4. Always check `feature_flags` before v3 features
5. Memory retrieval must handle `None` embeddings
6. Any new scheduling path MUST go through `schedule_reel()` with 3-layer dedup
