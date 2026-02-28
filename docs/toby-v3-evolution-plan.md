# Toby v3.0 Evolution Plan

## Continuous Learning Architecture + Frontend Redesign

**Date:** February 2026  
**Status:** Phase 1 implemented · Phase 2 & 3 proposed  
**Scope:** Backend learning loop, phase system, frontend UX

---

## Table of Contents

1. [Why This Matters](#1-why-this-matters)
2. [What Was Wrong (v2)](#2-what-was-wrong-v2)
3. [What Was Just Shipped (v3.0 Phase 1)](#3-what-was-just-shipped-v30-phase-1)
4. [Frontend Redesign — Detailed Spec](#4-frontend-redesign--detailed-spec)
5. [Toby v3.0 Phase 2 — Bayesian Per-Post Learning](#5-toby-v30-phase-2--bayesian-per-post-learning)
6. [Toby v3.0 Phase 3 — Contextual Bandits + Content DNA Feedback](#6-toby-v30-phase-3--contextual-bandits--content-dna-feedback)
7. [Architecture Comparison: v2 vs v3](#7-architecture-comparison-v2-vs-v3)
8. [Implementation Roadmap](#8-implementation-roadmap)
9. [File Change Map](#9-file-change-map)
10. [Research References](#10-research-references)

---

## 1. Why This Matters

Toby is the core value proposition of ViralToby. When a user enables Toby, they hand over control of their content strategy to an AI agent. That agent needs to:

1. **Learn fast** — every post should make the next one better
2. **Show its work** — users need to trust what Toby is doing
3. **Be transparent about progress** — not "wait 4 weeks"

The old system failed at all three. It used calendar time as a proxy for knowledge ("after week 4, you're optimized"), hidden all learning behind opaque phase labels, and made users scroll through 10+ unstructured components to understand what was happening.

---

## 2. What Was Wrong (v2)

### 2.1 Time-Gated Phases

```
v2 Phase System (REMOVED):
  Bootstrap: 10 scored posts + minimum 7 days
  Learning:  minimum 30 days (regardless of data quality)
  Optimizing: after 30+ days in learning
```

**Problem:** A brand that publishes 5 posts/day with great engagement data still waits 30 days to enter "Optimizing." Meanwhile, a brand that publishes once a week might enter Optimizing on day 30 with only 4 data points. The time gate has zero correlation with actual learning quality.

**Real-world systems don't work this way.** TikTok's recommendation engine (Monolith) updates embeddings on every interaction. LinkedIn's content recommendation uses contextual bandits that learn per-impression. Time gates are an anti-pattern — data confidence gates are the correct approach.

### 2.2 Delayed Learning Feedback

```
v2 Scoring Timeline:
  Post published → 48h: "early signal" collected (logged but NOT used for learning)
                → 7 days: final score → update_strategy_score() called
```

Strategy scores were only updated after the 7-day scoring window. The 48h signal was literally thrown away. This means Toby learned from a post **a full week** after publishing it, and the user saw zero learning activity for 7 days after each post.

### 2.3 Frontend UX — Everything At Once

The Toby page was a single scroll page with ~12 components laid out vertically:

```
TobyHero (status + toggle + 4 metric cards + phase badge)
TobyGuide (3-phase timeline with time estimates)
TobyPhaseTimeline (detailed phase progress with day counts)
TobyBufferHealth (buffer fill status)
TobyBufferStatus (buffer details)
TobyStatusBar (live status)
TobyInsights (strategy insights)
TobyExperiments (A/B experiment cards)
TobyDiscoveries (trend scout results)
TobyTickMonitor (tick-by-tick activity)
TobyPipeline (10-stage pipeline status)
TobyActivityFeed (raw activity log)
TobySettings (configuration)
```

No hierarchy. No tabs. A user who just wants to see "what is Toby learning?" has to scroll past buffer health, status bars, and tick monitors to find the insights section. The page tried to show everything to everyone — which means it showed nothing effectively.

### 2.4 Confusing Phase Language

Phase labels like "Bootstrap," "Learning," and "Optimizing" are developer jargon. Users reported not understanding:
- What "learning" means (is it learning from my content? From the internet?)
- Why they were stuck in "Phase 2" for weeks
- Whether Toby was actually doing anything useful during "learning"
- What would change when they reached "Phase 3"

---

## 3. What Was Just Shipped (v3.0 Phase 1)

### 3.1 Backend Changes

#### Data-Confidence-Gated Phase Transitions

```python
# NEW thresholds (state.py):
BOOTSTRAP_MIN_POSTS = 15         # 15 scored posts (was 10)
BOOTSTRAP_MIN_DAYS = 3           # 3-day soft min (was 7)
BOOTSTRAP_MIN_DIVERSE_STRATEGIES = 3  # Must have tried 3+ strategies

LEARNING_MIN_DAYS = 7            # 7-day soft min (was 30!)
LEARNING_TARGET_CONFIDENCE = 0.60     # 60% statistical confidence
```

Bootstrap → Learning now requires:
- 15 scored posts (enough data to start pattern recognition)
- 3-day minimum (prevents noise from day-1 virality)
- 3+ strategies tried with ≥3 samples each (ensures diversity)

Learning → Optimizing now requires:
- `compute_learning_confidence()` ≥ 0.60 (statistical measure, not calendar)
- 7-day minimum (soft gate)

**Key function: `compute_learning_confidence()`**

```python
def compute_learning_confidence(db, user_id) -> float:
    """0.0–1.0 based on top strategy sample coverage across all dimensions."""
    dimensions = ["personality", "topic", "hook", "title_format", "visual_style"]
    for dim in dimensions:
        top_3 = query top 3 strategies by avg_score where sample_count > 0
        for each: confidence += min(1.0, sample_count / 15)  # 15 = target
    return average confidence
```

This replaces "30 days" with a real statistical signal: "do we have enough data points per strategy dimension to trust the rankings?"

#### 48h Learning Events

```python
# orchestrator.py — after 48h scoring:
if scored_48h > 0:
    _generate_48h_learning_events(db, user_id, scored_48h)
```

Every post that gets its 48h score now generates a human-readable "learning event" in the activity log:

```
"Strong signal: provocative + shocking stat hook outperformed brand average by 42%"
"Weak signal: educational + question hook underperformed by 28% — deprioritizing"
"Neutral result: story + bold claim performed close to average (score: 67.3)"
```

These are rule-based (no LLM cost) and visible immediately in the new Learning Feed component.

#### New Status API Fields

```json
{
  "learning_confidence": 0.72,
  "posts_learned_from": 47,
  "current_top_strategies": [
    {"dimension": "personality", "value": "provocative", "avg_score": 78.3, "sample_count": 12},
    {"dimension": "hook", "value": "shocking_stat", "avg_score": 74.1, "sample_count": 9}
  ]
}
```

### 3.2 Frontend Changes

#### Tab-Based Layout (5 tabs)

| Tab | Contents | Purpose |
|---|---|---|
| **Overview** | KnowledgeMeter + BufferHealth + LearningFeed | "What's happening right now?" |
| **Brain** | Insights + Experiments | "What has Toby learned?" |
| **Scout** | Discoveries | "What trends is Toby watching?" |
| **Operations** | TickMonitor + Pipeline | "Technical tick-by-tick details" |
| **Settings** | BufferDays, ExploreRatio, Slots, Reset | "Configure Toby's behavior" |

#### New Components

- **TobyKnowledgeMeter** — Replaces TobyPhaseTimeline. Shows:
  - Current phase with data-based labels (Knowledge Base Building → Pattern Recognition → Precision Mode)
  - Posts analyzed count (not days elapsed)
  - Phase progress bar based on posts scored (bootstrap) or strategy confidence (learning)
  - "Toby is currently betting on: [top strategies]" summary
  - Horizontal 3-phase card layout with completion indicators

- **TobyLearningFeed** — Brand new. Shows:
  - Color-coded learning events (green = positive signal, red = weak signal)
  - Per-post score + topic + time ago
  - Empty state that explains "Toby will log what it learns as posts get scored at 48h"

#### Redesigned Components

- **TobyHero** — Simplified to: avatar + status + 1-line summary:
  `"Managing 2 brands · Learned from 47 posts · 3 experiments active · 18h uptime"`

- **TobyGuide** — Rewritten from "3 phases with time estimates" to:
  - Visual continuous loop: Publish → Collect engagement (48h) → Update strategies → Next post is smarter
  - 3 mode cards with data-based triggers instead of week counts

### 3.3 Files Changed

| File | Change Type | Lines |
|---|---|---|
| `app/services/toby/state.py` | Modified | +50 (new thresholds, `compute_learning_confidence()`, updated transitions) |
| `app/services/toby/orchestrator.py` | Modified | +94 (48h learning events, `_generate_learning_lesson()`) |
| `app/api/toby/routes.py` | Modified | +44 (new status fields, updated `_compute_phase_progress()`) |
| `src/features/toby/types.ts` | Modified | +17 (new interfaces) |
| `src/pages/Toby.tsx` | Rewritten | 74 lines (tab-based layout) |
| `src/features/toby/components/TobyHero.tsx` | Modified | +15 (natural language summary) |
| `src/features/toby/components/TobyGuide.tsx` | Rewritten | 139 lines (continuous loop narrative) |
| `src/features/toby/components/TobyKnowledgeMeter.tsx` | **New** | 242 lines |
| `src/features/toby/components/TobyLearningFeed.tsx` | **New** | 116 lines |
| `src/features/toby/components/TobyOverviewTab.tsx` | **New** | 23 lines |
| `src/features/toby/components/TobyBrainTab.tsx` | **New** | 14 lines |
| `src/features/toby/components/TobyScoutTab.tsx` | **New** | 10 lines |
| `src/features/toby/components/TobyOperationsTab.tsx` | **New** | 12 lines |
| `src/features/toby/components/index.ts` | Modified | +6 exports |
| `src/features/toby/index.ts` | Modified | +1 type export |

---

## 4. Frontend Redesign — Detailed Spec

### 4.1 Information Architecture

The core insight: **different users visit the Toby page for different reasons at different stages.** The tab structure maps to these use cases:

**New user (just enabled Toby):**
→ Lands on Overview → sees KnowledgeMeter at 0 posts → reads "Knowledge Base Building" → sees empty Learning Feed (explains what will appear soon) → trusts the process

**User checking in after a few days:**
→ Lands on Overview → sees "47 posts analyzed, Pattern Recognition" → reads Learning Feed ("Provocative tone outperformed by 42%!") → clicks Brain tab → sees full strategy rankings + experiments → feels confident Toby is working

**Power user debugging:**
→ Goes straight to Operations → sees tick-by-tick activity → checks Pipeline for stuck jobs → views recent ticks

**User tweaking settings:**
→ Settings tab → adjusts buffer days or explore ratio → done

### 4.2 Knowledge Meter Design Spec

The Knowledge Meter is the centerpiece of the Overview tab. It replaces the old phase timeline.

```
┌─────────────────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░  (gradient bar) │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🧱 Knowledge Base Building    BOOTSTRAP          47   │
│  Collecting first data points...              posts    │
│                                              analyzed  │
│                                                         │
│  ┌─────────────┐ → ┌─────────────┐ → ┌──────────────┐ │
│  │  Knowledge   │   │  Pattern    │   │  Precision   │ │
│  │  Base ██████ │   │  Recogn.    │   │  Mode        │ │
│  │  73% done    │   │  (locked)   │   │  (locked)    │ │
│  │  11/15 posts │   │             │   │              │ │
│  └─────────────┘   └─────────────┘   └──────────────┘ │
│                                                         │
│  📈 Toby is currently betting on:                      │
│  ┌──────────────────────┐ ┌──────────────────────┐     │
│  │ personality: provoc.  │ │ hook: shocking stat   │     │
│  │ (78.3 avg)           │ │ (74.1 avg)           │     │
│  └──────────────────────┘ └──────────────────────┘     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Learning Feed Design Spec

```
┌──────────────────────────────────────────┐
│  🧠 Learning Feed          8 signals    │
├──────────────────────────────────────────┤
│                                          │
│  📈 Strong signal: provocative +         │
│     shocking stat hook outperformed       │
│     brand average by 42%                 │
│     Score: 78.3 · sleep topics · 2h ago  │
│                                          │
│  📉 Weak signal: educational + question  │
│     hook underperformed by 28% — Toby    │
│     will deprioritize this               │
│     Score: 48.1 · nutrition · 6h ago     │
│                                          │
│  ─ Neutral result: story + bold claim    │
│     performed close to average           │
│     Score: 67.3 · fitness · 1d ago       │
│                                          │
└──────────────────────────────────────────┘
```

### 4.4 Future Frontend Improvements (Not Yet Implemented)

1. **Brand-scoped views** — Tab content should filter by brand when the user selects a specific brand
2. **Learning Feed drill-down** — Click a learning event to see the actual post and its metrics
3. **Strategy comparison chart** — Radar chart showing top strategy per dimension over time
4. **Confidence trend line** — Line chart showing learning_confidence over the last 30 days
5. **Experiment timelines** — Gantt-style view of A/B experiments with outcomes

---

## 5. Toby v3.0 Phase 2 — Bayesian Per-Post Learning

### The Core Problem (Not Yet Solved)

Phase 1 moved the **phase transitions** from time-gated to data-gated. But the actual **learning mechanism** — `update_strategy_score()` — is still only called at the 7-day scoring window. The 48h score triggers a *log event* but does not yet update strategy scores.

The ideal system: **every scored post immediately updates Toby's beliefs about which strategies work.**

### 5.1 Bayesian Score Updating

Replace the simple moving-average strategy scores with a proper Bayesian update mechanism.

**Current approach (learning_engine.py):**
```python
def update_strategy_score(db, user_id, brand_id, content_type, dimension, option_value, score):
    # Simple cumulative moving average
    existing.total_score += score
    existing.sample_count += 1
    existing.avg_score = existing.total_score / existing.sample_count
```

**Proposed Bayesian approach:**
```python
def update_strategy_score(db, user_id, brand_id, content_type, dimension, option_value, score, weight=1.0):
    """
    Bayesian update with weighted observations.
    
    weight=0.6 for 48h preliminary scores (less reliable)
    weight=1.0 for 7d final scores (full confidence)
    
    When a 7d score arrives for a post that already has a 48h score,
    we subtract the preliminary weight and add the final weight.
    """
    existing.weighted_total += score * weight
    existing.weight_sum += weight
    existing.sample_count += 1
    existing.avg_score = existing.weighted_total / existing.weight_sum
    
    # Thompson Sampling: update Beta distribution parameters
    # normalized_score: 0-1 mapping of the raw score
    normalized = max(0.0, min(1.0, (score - 40) / 60))
    existing.alpha += normalized * weight       # success parameter
    existing.beta_param += (1 - normalized) * weight  # failure parameter
```

**Why this is better:**
- 48h scores contribute immediately (weight=0.6) — Toby learns within 2 days
- 7d scores refine the estimate (weight=1.0) — accuracy improves with time
- Thompson Sampling naturally handles exploration vs exploitation
- Bayesian updating is mathematically sound for online learning

### 5.2 Score Correction (48h → 7d)

When a 7d score arrives for a post that already contributed at 48h:

```python
# At 48h: update_strategy_score(score=72, weight=0.6)
# At 7d:  the same post now has score=68

# Correction step:
existing.weighted_total -= old_48h_score * 0.6   # undo preliminary
existing.weight_sum -= 0.6
existing.weighted_total += final_7d_score * 1.0   # replace with final
existing.weight_sum += 1.0
existing.avg_score = existing.weighted_total / existing.weight_sum
```

This requires storing `preliminary_score` on `TobyContentTag` so we can compute the delta.

### 5.3 Database Changes

```sql
-- Add weighted scoring columns to toby_strategy_scores
ALTER TABLE toby_strategy_scores 
  ADD COLUMN weighted_total FLOAT DEFAULT 0,
  ADD COLUMN weight_sum FLOAT DEFAULT 0,
  ADD COLUMN alpha FLOAT DEFAULT 1.0,
  ADD COLUMN beta_param FLOAT DEFAULT 1.0;

-- Backfill from existing data
UPDATE toby_strategy_scores 
SET weighted_total = total_score,
    weight_sum = sample_count,
    alpha = 1.0 + (CASE WHEN avg_score > 60 THEN (avg_score - 40) / 60 * sample_count ELSE 0 END),
    beta_param = 1.0 + (CASE WHEN avg_score <= 60 THEN (1 - (avg_score - 40) / 60) * sample_count ELSE 0 END);

-- Track preliminary scores for correction
ALTER TABLE toby_content_tags
  ADD COLUMN preliminary_score FLOAT,
  ADD COLUMN preliminary_scored_at TIMESTAMPTZ;
```

### 5.4 Strategy Selection with Thompson Sampling

The learning engine already has Thompson Sampling code, but it's gated behind a feature flag and doesn't use the Beta distribution parameters properly. The update:

```python
def select_strategy_thompson(db, user_id, dimension, options):
    """Thompson Sampling: sample from each option's Beta posterior."""
    import numpy as np
    
    samples = {}
    for option in options:
        score = get_strategy_score(db, user_id, dimension, option)
        if score and score.alpha and score.beta_param:
            # Sample from Beta distribution
            samples[option] = np.random.beta(score.alpha, score.beta_param)
        else:
            # Uninformative prior for cold-start
            samples[option] = np.random.beta(1.0, 1.0)
    
    # Select the option with highest sampled value
    return max(samples, key=samples.get)
```

### 5.5 Files to Change

| File | Change |
|---|---|
| `app/services/toby/learning_engine.py` | Add `weight` param to `update_strategy_score()`, implement Bayesian update with alpha/beta |
| `app/services/toby/orchestrator.py` | Call `update_strategy_score(weight=0.6)` at 48h and `update_strategy_score(weight=1.0)` at 7d with correction |
| `app/models/toby.py` | Add `weighted_total`, `weight_sum`, `alpha`, `beta_param` to `TobyStrategyScore` |
| `app/models/toby.py` | Add `preliminary_score`, `preliminary_scored_at` to `TobyContentTag` |
| `migrations/toby_v3_bayesian.sql` | Schema migration for new columns |

---

## 6. Toby v3.0 Phase 3 — Contextual Bandits + Content DNA Feedback

### The Vision

Phase 2 treats each strategy dimension independently. But in reality, **combinations matter**: "provocative tone + shocking stat hook + sleep topic" might be a winning combo, while "provocative + question hook + nutrition" bombs. Phase 3 introduces contextual awareness.

### 6.1 Contextual Bandit Architecture

Instead of treating each dimension as an independent multi-armed bandit, model the problem as a **contextual bandit** where the context includes:

- Brand's Content DNA (niche, tone, target audience)
- Day of week + time of day
- Recent trend signals from TrendScout
- Current audience engagement patterns
- Platform (Instagram vs Facebook vs YouTube)

**Algorithm: LinUCB (Upper Confidence Bound)**

```python
class ContextualStrategySelector:
    """LinUCB-based strategy selection.
    
    Instead of treating each strategy option independently,
    this models the expected reward as a linear function of context features.
    """
    
    def __init__(self, alpha=0.5):
        self.alpha = alpha  # exploration parameter
    
    def select(self, context_features, available_strategies):
        """
        context_features: numpy array of [brand_niche_embedding, day_of_week, 
                          hour, trend_score, recent_engagement_avg, platform_id]
        
        For each strategy, compute UCB = theta^T * x + alpha * sqrt(x^T * A_inv * x)
        Select strategy with highest UCB.
        """
        best_score = -float('inf')
        best_strategy = None
        
        for strategy in available_strategies:
            A_inv = strategy.A_inverse  # d×d matrix
            b = strategy.b_vector       # d×1 vector
            theta = A_inv @ b           # estimated parameters
            
            x = context_features
            ucb = theta.T @ x + self.alpha * np.sqrt(x.T @ A_inv @ x)
            
            if ucb > best_score:
                best_score = ucb
                best_strategy = strategy
        
        return best_strategy
    
    def update(self, strategy, context_features, reward):
        """Update LinUCB parameters after observing reward."""
        x = context_features
        strategy.A += np.outer(x, x)
        strategy.b += reward * x
        strategy.A_inverse = np.linalg.inv(strategy.A)
```

### 6.2 Content DNA → Strategy Feedback Loop

Currently, Content DNA (NicheConfig) is a static input. The user sets it once during onboarding and it drives all prompts. But Toby should **suggest Content DNA refinements** based on what it learns.

```
Current flow:
  User sets Content DNA → Toby generates content → measures performance

Proposed flow (v3.0 Phase 3):
  User sets Content DNA → Toby generates content → measures performance
       ↑                                                    │
       └── Toby suggests: "Your audience responds 3x        │
           better to 'sleep' topics than 'nutrition'.       │
           Should I adjust your topic priorities?"    ←─────┘
```

This requires:
1. A new `ContentDNARecommendation` model to store suggestions
2. A new API endpoint `GET /api/toby/content-dna-suggestions`
3. Frontend: A notification in the Overview tab showing pending suggestions
4. User approval flow: "Accept" applies the change, "Dismiss" logs the rejection

### 6.3 Combo Tracking (Already Partially Implemented)

The existing `TobyStrategyCombos` model (toby_cognitive.py) tracks performance of strategy combinations. Phase 3 would promote this from a logging-only feature to an active decision input:

```python
# Current: combos are tracked but not used for selection
# Proposed: use combo performance during content planning

def select_strategy_combo(db, user_id, brand_id, content_type):
    """Select a full strategy combination (personality + hook + topic + format + visual)
    based on historical combo performance, not independent dimension selection."""
    
    top_combos = get_top_combos(db, user_id, brand_id, min_samples=3)
    
    if len(top_combos) >= 5:
        # Enough combo data: use Thompson Sampling on combos directly
        return thompson_sample_combos(top_combos)
    else:
        # Fallback: independent dimension selection (current behavior)
        return select_per_dimension(db, user_id, content_type)
```

### 6.4 Temporal Decay

Strategy scores should decay over time to account for audience preference shifts:

```python
# Exponential decay: older observations count less
DECAY_HALFLIFE_DAYS = 30

def get_decayed_score(score_entry):
    """Apply temporal decay to a strategy score observation."""
    age_days = (now - score_entry.scored_at).days
    decay_factor = 0.5 ** (age_days / DECAY_HALFLIFE_DAYS)
    return score_entry.raw_score * decay_factor
```

This ensures that a strategy that worked 90 days ago but stopped working 14 days ago gets properly deprioritized, without needing explicit drift detection.

### 6.5 Files to Create/Change

| File | Change |
|---|---|
| `app/services/toby/contextual_selector.py` | **New** — LinUCB contextual bandit implementation |
| `app/services/toby/content_dna_advisor.py` | **New** — Content DNA suggestion generation |
| `app/services/toby/learning_engine.py` | Add temporal decay to score retrieval |
| `app/services/toby/content_planner.py` | Use combo-based selection when data exists |
| `app/models/toby_cognitive.py` | Add `ContentDNARecommendation` model |
| `app/api/toby/routes.py` | Add `/api/toby/content-dna-suggestions` endpoint |
| `migrations/toby_v3_contextual.sql` | LinUCB parameter storage + Content DNA suggestions table |
| `src/features/toby/components/TobyContentDNASuggestions.tsx` | **New** — Frontend for Content DNA suggestions |

---

## 7. Architecture Comparison: v2 vs v3

### Learning Feedback Latency

| | v2 | v3 Phase 1 | v3 Phase 2 | v3 Phase 3 |
|---|---|---|---|---|
| **First learning signal** | 7 days | 48 hours | 48 hours | 48 hours |
| **Strategy score update** | 7 days | 7 days | 48 hours (weighted) | 48 hours (contextual) |
| **Phase transition trigger** | Calendar time | Data confidence | Data confidence | Data confidence |
| **User sees learning** | Never (opaque) | Learning Feed | Learning Feed | Learning Feed + DNA suggestions |

### Strategy Selection Quality

| | v2 | v3 Phase 2 | v3 Phase 3 |
|---|---|---|---|
| **Method** | Epsilon-greedy | Thompson Sampling (proper Beta) | LinUCB contextual bandit |
| **Dimensions** | Independent | Independent | Context-aware combinations |
| **Temporal awareness** | None (all data weighted equally) | 7d correction of 48h | Exponential decay (30d halflife) |
| **Cold start** | Random for 7 days | Uninformative Beta prior | Cross-brand transfer learning |
| **Exploration** | Fixed epsilon | Automatic (Beta sampling) | UCB-based (adaptive) |

### Phase System

| | v2 | v3 |
|---|---|---|
| **Bootstrap exit** | 10 posts + 7 days | 15 posts + 3 days + 3 diverse strategies |
| **Learning exit** | 30 days | 60% strategy confidence (typically 2-3 weeks) |
| **Regression** | 14d/90d ratio < 0.80 | Same (unchanged) |
| **Frontend label** | "Phase 1: Bootstrap" | "Knowledge Base Building" |
| **Progress metric** | Days elapsed | Posts analyzed / confidence % |

---

## 8. Implementation Roadmap

### Phase 1 — ✅ SHIPPED

- [x] Data-confidence-gated phase transitions
- [x] `compute_learning_confidence()`
- [x] 48h learning event generation
- [x] Status API: `learning_confidence`, `posts_learned_from`, `current_top_strategies`
- [x] Tab-based Toby frontend (5 tabs)
- [x] TobyKnowledgeMeter (replaces phase timeline)
- [x] TobyLearningFeed (per-post learning signals)
- [x] TobyGuide rewrite (continuous learning narrative)
- [x] TobyHero simplification (natural language summary)

### Phase 2 — Bayesian Per-Post Learning

- [ ] Add `weighted_total`, `weight_sum`, `alpha`, `beta_param` to `TobyStrategyScore`
- [ ] Add `preliminary_score`, `preliminary_scored_at` to `TobyContentTag`
- [ ] Run migration `toby_v3_bayesian.sql`
- [ ] Modify `update_strategy_score()` to support weighted Bayesian updates
- [ ] Call `update_strategy_score(weight=0.6)` at 48h scoring
- [ ] Implement 48h→7d score correction (subtract preliminary, add final)
- [ ] Activate Thompson Sampling with proper Beta parameters
- [ ] Update frontend KnowledgeMeter to show Bayesian confidence intervals
- [ ] Add "Strategy Confidence" tooltip showing sample sizes + distributions

### Phase 3 — Contextual Bandits + Content DNA Feedback

- [ ] Implement `ContextualStrategySelector` with LinUCB
- [ ] Build context feature vector (brand DNA embedding, time, trends, platform)
- [ ] Implement combo-first strategy selection (fall back to per-dimension)
- [ ] Add temporal decay (30d halflife) to strategy score retrieval
- [ ] Build `ContentDNAAdvisor` — suggest DNA refinements based on performance data
- [ ] Create `ContentDNARecommendation` model + API endpoint
- [ ] Frontend: Content DNA suggestions notification in Overview tab
- [ ] Frontend: Strategy comparison radar chart in Brain tab

---

## 9. File Change Map

### Already Changed (Phase 1)

```
Backend:
  app/services/toby/state.py              ← Data-gated transitions + compute_learning_confidence()
  app/services/toby/orchestrator.py        ← 48h learning events
  app/api/toby/routes.py                   ← New status fields + updated phase progress

Frontend:
  src/pages/Toby.tsx                       ← Tab navigation
  src/features/toby/types.ts               ← New types (TobyTopStrategy, TobyPhaseRequirements)
  src/features/toby/components/TobyKnowledgeMeter.tsx  ← NEW
  src/features/toby/components/TobyLearningFeed.tsx    ← NEW
  src/features/toby/components/TobyOverviewTab.tsx     ← NEW
  src/features/toby/components/TobyBrainTab.tsx        ← NEW
  src/features/toby/components/TobyScoutTab.tsx        ← NEW
  src/features/toby/components/TobyOperationsTab.tsx   ← NEW
  src/features/toby/components/TobyHero.tsx            ← Modified
  src/features/toby/components/TobyGuide.tsx           ← Rewritten
  src/features/toby/components/index.ts                ← Updated exports
  src/features/toby/index.ts                           ← Updated type exports
```

### Phase 2 Changes

```
Backend:
  app/services/toby/learning_engine.py     ← Weighted Bayesian updates + proper Thompson Sampling
  app/services/toby/orchestrator.py        ← 48h score updates + 7d correction
  app/models/toby.py                       ← New columns on TobyStrategyScore + TobyContentTag
  migrations/toby_v3_bayesian.sql          ← NEW

Frontend:
  src/features/toby/components/TobyKnowledgeMeter.tsx  ← Show confidence intervals
```

### Phase 3 Changes

```
Backend:
  app/services/toby/contextual_selector.py ← NEW — LinUCB implementation
  app/services/toby/content_dna_advisor.py ← NEW — DNA refinement suggestions
  app/services/toby/learning_engine.py     ← Temporal decay
  app/services/toby/content_planner.py     ← Combo-based selection
  app/models/toby_cognitive.py             ← ContentDNARecommendation model
  app/api/toby/routes.py                   ← DNA suggestions endpoint
  migrations/toby_v3_contextual.sql        ← NEW

Frontend:
  src/features/toby/components/TobyContentDNASuggestions.tsx  ← NEW
  src/features/toby/components/TobyBrainTab.tsx              ← Add strategy radar chart
  src/features/toby/components/TobyOverviewTab.tsx           ← Add DNA suggestions
```

---

## 10. Research References

### Bandit Algorithms for Content Systems

- **Thompson Sampling** — Bayesian approach that naturally balances exploration/exploitation. Each strategy maintains a Beta distribution; sampling from it gives higher variance (more exploration) when data is sparse and converges to exploitation when data is rich. Already partially implemented in `learning_engine.py`.

- **LinUCB (Contextual Bandits)** — [Li et al., 2010] "A Contextual-Bandit Approach to Personalized News Article Recommendation." Models expected reward as a linear function of context features. Used by Yahoo for news recommendation. Ideal for Toby because brand DNA + temporal features = rich context.

- **Monolith (TikTok)** — [Zhao et al., 2022] Real-time recommendation system that updates embeddings on every user interaction. Key insight: batched learning (weekly/monthly) leaves value on the table; online learning is strictly superior for engagement prediction.

### Cold Start Solutions

- [Bandits Warm-up Cold Recommender Systems](https://arxiv.org/abs/1407.2806) — Uses bandit algorithms to explore during cold start, then transitions to collaborative filtering. Relevant to Phase 2's uninformative Beta prior approach.

- [Cold-start Problems in Recommendation Systems via Contextual-bandit Algorithms](https://www.researchgate.net/publication/262732636_Cold-start_Problems_in_Recommendation_Systems_via_Contextual-bandit_Algorithms) — LinUCB-based approach to cold start that outperforms random exploration. Directly applicable to Phase 3.

### Continuous Learning vs Batch Learning

Real-world recommendation systems (TikTok, YouTube, LinkedIn) all moved from batch learning (weekly model retraining) to online/continuous learning because:

1. **Freshness** — User preferences change faster than batch windows
2. **Data efficiency** — Every observation is immediately useful
3. **Compounding** — Earlier learning → better next decisions → more data → faster convergence

Toby v2's "wait 30 days" approach was effectively batch learning with a 30-day window. Phase 1's 48h learning events + Phase 2's weighted score updates move toward continuous learning.

### Key Principle: Statistical Confidence > Calendar Time

The fundamental design change in v3.0: **gate decisions on data quality, not time elapsed.**

- Phase transitions: confidence score, not day count
- Strategy scores: sample count + variance, not age
- Exploration ratio: Beta distribution width, not manual epsilon

This aligns with how A/B testing platforms (Statsig, LaunchDarkly, Optimizely) determine experiment duration: they wait for statistical significance, not a fixed number of days.
