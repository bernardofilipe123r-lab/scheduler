# AI Orchestration Research — Architecture Decisions

> Generated: 2026-02-15
> Purpose: Research document covering multi-agent RL, content recommendations, and rate-limited distributed systems to inform our Maestro orchestrator redesign.

---

## A) Multi-Agent Reinforcement Learning

### How Production Multi-Agent Systems Share Knowledge

Production multi-agent systems face a fundamental tension: agents must learn from each other to avoid redundant exploration, but must also maintain individual specialization to produce diverse outputs.

**Three architectural patterns exist in practice:**

#### Option A: Fully Shared Memory
All agents read/write to a single shared experience buffer. Every agent sees every other agent's outcomes.

- **DeepMind AlphaZero** uses a single global replay buffer. Self-play games are stored centrally; all training iterations sample from the same pool. This works because Go/Chess have a single objective function — there's no need for diversity in strategy.
- **Downside for content systems:** Agents converge to the same strategy. If "curiosity-hook" gets 2x engagement, all agents shift to curiosity-hooks within 2 feedback cycles. Content becomes homogeneous.

#### Option B: Hybrid Shared + Per-Agent Memory (RECOMMENDED)
A global `learned_patterns` table stores cross-agent insights (what works across all agents), while each agent retains per-agent strategy weights, mutation history, and personal performance data.

- **Google R2D2 (Recurrent Replay Distributed DQN)** distributes actors across hundreds of workers, each collecting experience into local buffers, but periodically syncing high-value experiences to a central learner. Agents diverge in exploration but converge on proven patterns.
- **OpenAI Five** used a similar model: 5 agents shared a global reward signal but maintained separate hidden states. The "team" learned shared macro-strategies while each agent developed positional specialties.
- **Application to our system:** A `learned_patterns` table stores validated cross-agent patterns (e.g., "curiosity hooks outperform stat-hooks for longevitycollege by 40%"). Each agent reads from this table during `_gather_intelligence()` but retains its own `strategy_weights` and `temperature`. Patterns are contributed by any agent whose content exceeds a performance threshold.

#### Option C: Fully Independent Agents
Each agent maintains its own isolated experience. No knowledge sharing.

- **Downside:** Massive waste of API calls. Agent B re-discovers what Agent A already learned. With 150 API calls/hour budget, we can't afford redundant exploration.

### Maintaining Agent Diversity

The convergence problem is real. Left unchecked, shared knowledge causes all agents to adopt identical strategies within 3-4 feedback cycles. Production systems enforce diversity through:

1. **Strategy Reservation:** Each agent is assigned at least 1 "protected" strategy that no other agent uses as primary. Currently we have ~8 strategies × 5+ agents — enough for unique primaries.
2. **Minimum Uniqueness Threshold:** Enforce that each agent maintains ≥20% of its strategy weight in strategies not used as primary by any other agent. Measured at feedback time; mutations that violate this are rejected.
3. **Exploration Bonus:** Agents that try underexplored strategies get a survival score bonus (+5 points) for the first 3 uses, incentivizing experimentation.
4. **Gene Pool Diversity:** When spawning replacements, prefer gene pool entries that fill strategy gaps in the current population rather than cloning the top performer.

### Recommendation: Option B (Hybrid Shared + Per-Agent)

**Reasoning:**
- Shared patterns reduce API waste: when Agent A discovers "stat-hooks underperform for healthycollege," Agent B doesn't need to spend 5 proposals re-learning this.
- Per-agent specialties prevent homogenization: each agent keeps unique strategy weights, personality, and temperature.
- Gene pool crossover already implements partial knowledge sharing — this formalizes it.
- The `learned_patterns` table acts as institutional memory that survives agent death/rebirth.

---

## B) Content Recommendation Systems

### How Production Systems Weight Recent vs Historical Data

Content performance is non-stationary — what worked last month may not work today. Audience preferences shift, platform algorithms change, and seasonal trends create periodic variation. Production recommendation systems handle this through temporal weighting.

#### Option A: Hard Lookback Window
Only consider the last N days of data. Anything older is ignored.

- **Simple to implement.** Current system uses `days_back=14` in MetricsCollector.
- **Problem:** Creates "cliff effects" — a post at day 14 has full weight, day 15 has zero weight. A viral post at day 16 is completely invisible. Also, 14 days may be too short for weekly patterns (only 2 data points for "best day of the week").

#### Option B: Exponential Decay (RECOMMENDED)

Apply a continuous decay function to historical data:

$$\text{decay\_weight} = e^{-\frac{\text{days\_since\_published}}{30}}$$

| Days Old | Weight |
|----------|--------|
| 0 (today) | 1.00 |
| 7 | 0.79 |
| 14 | 0.63 |
| 30 | 0.37 |
| 60 | 0.14 |
| 90 | 0.05 |

- **Netflix** uses a similar approach for their recommendation engine. Recent viewing history is weighted ~5x more than 30-day-old data, but old data never fully disappears. This prevents "cold start" after quiet periods.
- **TikTok For You Page** uses a more aggressive decay (estimated half-life ~3-5 days) because TikTok's content cycle is faster. For Instagram Reels, a 30-day half-life is more appropriate — reels continue gaining views for weeks.
- **YouTube** applies time-aware collaborative filtering where a video's "freshness" decays logarithmically but its absolute performance (total views) retains weight. Their system distinguishes between "this topic is trending now" (high recency weight) and "this topic always performs" (historical weight).

#### Option C: Sliding Window with Seasonal Adjustment
Maintain multiple windows (7-day, 30-day, 90-day) and weight them. Add day-of-week and time-of-day modifiers.

- **Overkill for our scale.** With 5 brands × 6 reels/day, we generate ~30 data points/day. Seasonal adjustment requires hundreds of data points per segment. Not viable until we have 6+ months of data.

### Pattern Decay Handling

Learned patterns must also decay. A pattern like "stat-hooks work for healthycollege" should weaken if recent stat-hook posts underperform, even if historical stat-hook posts were strong.

**Implementation:**
- Each `learned_patterns` entry has a `discovered_at` timestamp and `last_validated_at` timestamp.
- Decay is applied at read time: `effective_confidence = confidence × e^(-days_since_validated / 30)`.
- Patterns with `effective_confidence < 0.1` are archived (not deleted — they serve as institutional memory).
- Validation occurs during the feedback cycle: if a pattern's associated strategy outperforms average, `last_validated_at` is refreshed and confidence may increase.

### Recommendation: Option B (Exponential Decay)

**Reasoning:**
- Netflix-style recency weighting without hard cutoffs ensures we never lose valuable historical data.
- The 30-day half-life matches Instagram Reels' typical performance plateau (most views come within 14-21 days, but long-tail continues).
- Twice-daily decay application (during feedback cycles at 6h intervals) is computationally trivial.
- Avoids the cliff effect of our current hard `days_back=14` cutoff.
- Naturally handles "evergreen" patterns (continuously validated → never decay) vs "one-hit wonders" (validated once → fade out).

---

## C) Rate-Limited Distributed Systems

### Distributing 150 API Calls/Hour Across 5 Agents

Our system makes three types of API calls:
1. **DeepSeek (content generation + examination):** ~80 calls/day during burst, near-zero otherwise.
2. **Meta/Instagram Graph API:** ~200 calls/hr limit. Bootstrap uses 12/hr, scout uses ~4/hr, metrics uses ~20/3hr.
3. **FFmpeg (local resource):** Bounded by `_job_semaphore(3)` — already rate-limited.

The bottleneck is **DeepSeek during daily burst**: 40 proposals × 2 calls each = 80 calls concentrated in a ~20 minute window. Currently no explicit rate limiting — relies on sequential execution speed.

#### Option A: Token Bucket (RECOMMENDED)

A token bucket allows smooth average rate with controlled bursts:

- **Bucket capacity:** 30 tokens (allows bursting 30 calls without waiting)
- **Refill rate:** 2.5 tokens/minute (= 150/hour)
- **Per-call cost:** 1 token for generation, 1 token for examination
- **Priority levels:**
  - P0 (Critical): Healing retries, diagnostics — always served
  - P1 (High): Daily burst proposals — primary workflow
  - P2 (Normal): Scout, observe, feedback cycles
  - P3 (Low): Bootstrap research, gene pool maintenance

**How it works:**
```
              ┌──────────────┐
              │ Token Bucket │
              │ cap=30       │
              │ rate=2.5/min │
              └──────┬───────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    ┌────▼────┐ ┌────▼────┐ ┌───▼─────┐
    │ P0 Queue│ │ P1 Queue│ │ P2/P3   │
    │ (heal)  │ │ (burst) │ │ (scout) │
    └─────────┘ └─────────┘ └─────────┘
```

- **Google Cloud API Gateway** uses token bucket for their public APIs. Simple state: `{tokens: float, last_refill: timestamp}`. Thread-safe with a single mutex.
- **Stripe** uses a sliding window variant but token bucket is simpler for single-process systems like ours.
- **AWS API Gateway** uses token bucket per-client with configurable burst and sustained rate — exactly our use case.

#### Option B: Fixed Window Counter
Count calls per hour. Reset at the top of each hour.

- **Problem:** "Thundering herd" at window boundaries. If we use 149 calls at minute 59, the counter resets and we fire another 30 at minute 60 — effectively 179 calls in 2 minutes.

#### Option C: Sliding Window Log
Track timestamps of every API call. Count calls in the last 60 minutes.

- **More accurate than fixed window** but higher memory/compute cost. Every call requires scanning the log. With 150 calls/hour, the log is small — but token bucket is simpler for the same result.

### Priority Queuing

Not all API calls are equal:

| Priority | Type | Example | Behavior When Exhausted |
|----------|------|---------|------------------------|
| P0 | Critical | Healing retry, diagnostics | Reserve 5 tokens minimum — always available |
| P1 | High | Daily burst generation | Wait for tokens, no skip |
| P2 | Normal | Scout cycle, metrics collection | Defer to next cycle if no tokens |
| P3 | Low | Bootstrap research, gene pool cleanup | Skip entirely if quota <20% remaining |

### Graceful Degradation

When the token bucket is empty:

1. **P0 calls:** Served from a reserved pool (5 tokens held back from the main bucket).
2. **P1 calls:** Queued with backpressure. The burst spreads across a longer window rather than failing. A 20-minute burst becomes a 40-minute burst.
3. **P2 calls:** Cycle is deferred. `maestro_observe` logs "Deferred: API quota exhausted" and reschedules for +30 min.
4. **P3 calls:** Skipped entirely. Bootstrap logs "Skipped: low priority, quota insufficient" and waits for next scheduled run.

### Recommendation: Option A (Token Bucket)

**Reasoning:**
- Smooth rate with controlled bursts matches our usage pattern: quiet most of the day, intense during daily burst.
- Simple implementation: single `TokenBucket` class with `acquire(priority)` method. ~30 lines of code.
- Priority queuing ensures healing and diagnostics always work, even during heavy burst.
- Graceful degradation prevents cascade failures — the system slows down instead of breaking.
- Thread-safe with a single lock, no external dependencies (Redis, etc.), fits our single-process architecture.

---

## D) Recommended Architecture — Synthesis

Based on the three research areas above, here are the concrete implementation decisions for the Maestro orchestrator redesign.

### 1. Knowledge Sharing: Hybrid Model with `learned_patterns` Table

**New table: `learned_patterns`**

| Column | Type | Purpose |
|--------|------|---------|
| id | Integer PK | Auto |
| user_id | String(100) | Multi-user scoping |
| pattern_type | String(30) | `strategy_performance`, `topic_affinity`, `timing`, `format` |
| brand | String(50) | Which brand this applies to (or `_global_`) |
| strategy | String(30) | Which strategy this concerns |
| description | Text | Human-readable pattern description |
| confidence | Float | 0.0–1.0, decays over time |
| evidence_count | Integer | Number of data points supporting this pattern |
| discovered_by | String(50) | agent_id that first identified it |
| discovered_at | DateTime | When pattern was first found |
| last_validated_at | DateTime | Last time evidence confirmed pattern |
| metadata | JSON | Supporting data (avg engagement, sample size, etc.) |

**How agents use it:**
- During `_gather_intelligence()`, agents query `learned_patterns` for their assigned brand.
- Patterns with `effective_confidence > 0.3` are injected into the generation prompt as "institutional knowledge."
- After feedback cycle, patterns are validated or weakened based on recent results.
- New patterns are discovered when an agent's strategy significantly outperforms (+30%) the brand average over ≥5 posts.

### 2. Pattern Decay: Exponential Decay Applied Twice Daily

**Applied during feedback cycle (every 6 hours):**

$$\text{effective\_confidence} = \text{confidence} \times e^{-\frac{\text{days\_since\_validated}}{30}}$$

- Patterns validated within the last 7 days: 79%+ of original confidence retained.
- Patterns not validated for 30 days: 37% — still visible but weak influence.
- Patterns not validated for 90 days: 5% — effectively archived, won't influence proposals.
- Archived patterns (`effective_confidence < 0.1`) are soft-deleted (marked `archived=true`), searchable for historical analysis but excluded from agent intelligence.

**Performance data decay (for MetricsCollector):**
- Replace hard `days_back=14` with exponential-weighted query.
- Each post's metrics weighted by `e^(-days/30)` when calculating strategy performance averages.
- This means a viral post from 45 days ago still contributes 22% of its weight — currently it's invisible.

### 3. Rate Limiting: Token Bucket with Priority Queues

**Implementation:**

```python
class TokenBucket:
    def __init__(self, capacity=30, refill_rate=2.5):
        self.capacity = capacity          # max burst
        self.tokens = capacity            # current tokens
        self.refill_rate = refill_rate    # tokens per minute
        self.last_refill = time.time()
        self.reserved = 5                 # P0 reserve
        self.lock = threading.Lock()

    def acquire(self, priority: int = 1, timeout: float = 60) -> bool:
        """Attempt to acquire a token. Returns True if granted."""
        ...
```

**Integration points:**
- All DeepSeek calls go through `token_bucket.acquire(priority=P1)`.
- All Meta API calls go through `token_bucket.acquire(priority=P2)`.
- Healing/diagnostics go through `token_bucket.acquire(priority=P0)`.
- Bootstrap goes through `token_bucket.acquire(priority=P3)`.

**Monitoring:**
- Log bucket state every cycle: `{tokens_remaining, calls_last_hour, calls_by_priority}`.
- Dashboard endpoint: `GET /api/maestro/rate-limit` shows current quota usage.

### 4. Diversity Enforcement: ≥20% Unique Strategies Per Agent

**Rules applied during AdaptationEngine.adapt():**

1. **Uniqueness Check:** After any weight mutation, verify that the agent's top 2 strategies (by weight) don't match any other agent's top 2 strategies. If they do, the mutation is modified to preserve the agent's next-best unique strategy.

2. **Minimum Unique Weight:** Each agent must have ≥20% of total strategy weight in strategies that are not the primary strategy of any other active agent. Enforced at mutation time.

3. **Diversity Score:** Calculated at population level during weekly evolution:
   $$\text{diversity} = 1 - \frac{\text{count of agents sharing same top strategy}}{\text{total agents}}$$
   Target: diversity ≥ 0.6 (no more than 40% of agents share the same primary strategy).

4. **Spawn Diversity:** When `SelectionEngine` spawns a replacement agent, it checks the current population's strategy distribution and assigns underrepresented strategies as the new agent's primary. Gene pool inheritance is filtered to prefer DNA with underrepresented strategies.

### Summary: Architecture Decision Matrix

| Area | Decision | Pattern | Rationale |
|------|----------|---------|-----------|
| Knowledge Sharing | Hybrid shared + per-agent | `learned_patterns` table | Reduces API waste, preserves agent identity |
| Pattern Decay | Exponential decay, τ=30 days | $e^{-t/30}$ applied at feedback time | Netflix-style recency without cliff effects |
| Rate Limiting | Token bucket + priority queues | cap=30, rate=2.5/min, 4 priority levels | Smooth rate, controlled bursts, graceful degradation |
| Diversity | ≥20% unique strategies | Enforced at mutation time + spawn time | Prevents convergence, maintains content variety |
| Data Lookback | Exponential-weighted, no hard cutoff | Replace `days_back=14` with decay | Historical data contributes proportionally |
| Pattern Lifecycle | Discover → validate → decay → archive | Confidence-based with validation refresh | Institutional memory that adapts to changing trends |

---

*This document informs the implementation spec. Next step: create a detailed implementation plan with file-by-file changes, migration scripts, and rollout order.*
