# TOBY NEXT-GEN ARCHITECTURE — Cognitive Autonomous Agent

> **Version:** 3.0 — Next-Generation Design  
> **Status:** Architecture Proposal  
> **Prerequisite:** Read `toby-architecture-spec.md` (v2.0) and `toby-agentic-reconstruction.md` first.  
> **Scope:** This document proposes the complete evolution of Toby from a statistical automation system into a **cognitive autonomous agent** that continuously learns, reasons, and improves — leveraging the latest advances in AI agent design, reinforcement learning, and self-supervised systems.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Philosophy — Why This Architecture](#2-design-philosophy)
3. [Cognitive Architecture Overview](#3-cognitive-architecture-overview)
4. [The Four Cognitive Loops](#4-the-four-cognitive-loops)
5. [Agent Definitions — The Cognitive Cortex](#5-agent-definitions)
6. [Memory Architecture — Multi-Tier Semantic Memory](#6-memory-architecture)
7. [Reasoning Engine — Chain-of-Thought Strategy](#7-reasoning-engine)
8. [Self-Improving Learning System](#8-self-improving-learning-system)
9. [Continuous Intelligence Pipeline](#9-continuous-intelligence-pipeline)
10. [Adversarial Quality System — Multi-Critic Ensemble](#10-adversarial-quality-system)
11. [Retroactive Learning — Mining Historical Performance](#11-retroactive-learning)
12. [Tool Use & External Knowledge](#12-tool-use--external-knowledge)
13. [Adaptive Experimentation Framework](#13-adaptive-experimentation-framework)
14. [Cross-Brand Intelligence Network](#14-cross-brand-intelligence-network)
15. [Safety, Rate Limits & Guardrails](#15-safety-rate-limits--guardrails)
16. [Frontend — The Cognitive Dashboard](#16-frontend)
17. [Database Schema Extensions](#17-database-schema-extensions)
18. [Migration Path from Current Architecture](#18-migration-path)
19. [Implementation Phases](#19-implementation-phases)
20. [Risk Assessment](#20-risk-assessment)
21. [Multi-User Scalability — One Toby Per User](#21-multi-user-scalability)
22. [Toby's Access Boundaries & Operational Sandbox](#22-tobys-access-boundaries)
23. [The North Star — Viral Growth at All Costs (Within the Niche)](#23-the-north-star)

---

## 1. Executive Summary

### What Toby Is Today

Toby v2.0 is a **statistical automation system**. It generates content on a fixed 5-minute tick, selects strategies via epsilon-greedy / Thompson Sampling across 5 independent dimensions, scores performance with a rule-based composite formula, and publishes to Instagram. The learning loop relies entirely on Instagram metrics with a 48h–7d feedback delay. Discovery runs but results don't feed into generation. Quality scoring is heuristic-only — no semantic evaluation. There is no reflection, no causal reasoning, no self-improvement.

### What Toby Becomes

Toby v3.0 is a **cognitive autonomous agent** — a system that:

1. **Thinks before acting:** Every content decision goes through an LLM reasoning chain that considers performance data, competitive landscape, audience behavior patterns, and temporal context.

2. **Remembers and reflects:** A multi-tier semantic memory system (episodic, semantic, procedural) stores not just what happened, but *why* it happened and what to do differently next time.

3. **Learns continuously in 3 time horizons:** Real-time (quality feedback during generation), short-term (48h–7d Instagram metrics), and long-term (monthly pattern analysis and strategy evolution).

4. **Improves its own learning:** A meta-learning loop evaluates the effectiveness of Toby's strategy selection itself — "Is my Thompson Sampling actually picking better strategies over time, or am I stuck in a local optimum?"

5. **Gathers intelligence autonomously:** Continuous web scanning, Meta Graph API monitoring, and competitor content analysis feed an always-current environmental model.

6. **Mines the past:** When a new brand connects, Toby retroactively analyzes all their historical content to bootstrap its understanding — no cold-start problem.

7. **Critiques adversarially:** A multi-layer evaluation system (rule-based → AI critic → audience simulation → cross-brand comparison) ensures content quality before publication.

### Key Design Constraints

| Constraint | Impact |
|---|---|
| **Almost infinite API requests** | DeepSeek, image generation, etc. are not cost-constrained. Architecture should leverage this aggressively — more reasoning passes, deeper analysis, richer reflections. |
| **Meta Graph API rate limits** | Instagram Business Discovery: 200 calls/hour per user-token. Design must respect this strictly with request budgeting and priority queuing. |
| **Single Railway process** | All agents run in-process. No distributed message bus (yet). StateGraph pattern with sequential execution per content piece. |
| **Existing data must be preserved** | All migrations are additive. No destructive schema changes. Current `toby_*` tables remain and are extended. |

---

## 2. Design Philosophy

### 2.1 Inspired By: Modern AI Agent Architectures

This architecture draws from four state-of-the-art paradigms:

**1. ReAct (Reasoning + Acting)** — Yao et al., 2023  
Agents interleave reasoning traces with tool use. Instead of generating content directly, Toby first *reasons* about what to create, *acts* to gather context, *observes* the result, and *reasons* again before committing. Every content decision has an explicit chain-of-thought.

**2. Reflexion** — Shinn et al., 2023  
After each action, the agent generates a verbal self-reflection stored in memory. Future actions retrieve relevant reflections via semantic search. Toby adapts this with a triple-memory architecture: episodic (what happened), semantic (what it means), and procedural (what to do about it).

**3. Cognitive Architectures (ACT-R / SOAR)** — Anderson / Laird  
Production systems with declarative + procedural memory, goal stacks, and conflict resolution. Toby adopts the concept of **cognitive loops** operating at different timescales — a fast reactive loop for generation, a slow deliberative loop for strategy, and an even slower reflective loop for self-improvement.

**4. Constitutional AI** — Anthropic, 2023  
The system critiques its own outputs against a constitution (set of principles). Toby's Constitution is derived from the brand's Content DNA plus platform-specific rules. The Critic Agent evaluates content against this Constitution, not just abstract quality metrics.

### 2.2 The Five Principles

| # | Principle | What It Means |
|---|---|---|
| 1 | **Reason before you act** | No content decision is made without an explicit chain-of-thought reasoning trace. Every strategy choice has a recorded rationale. |
| 2 | **Remember everything, forget nothing** | All outcomes — successes, failures, near-misses, competitive observations — are stored as searchable semantic memory. |
| 3 | **Learn at three speeds** | Real-time (quality loops), short-term (days, Instagram metrics), long-term (months, pattern evolution). |
| 4 | **Question your own judgment** | A meta-learning system evaluates whether Toby's learning is actually improving outcomes — and adjusts the learning algorithm itself. |
| 5 | **Respect boundaries, maximize within them** | Content DNA is inviolable. Toby maximizes creative diversity *within* the brand's identity constraints, never outside them. |

---

## 3. Cognitive Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TOBY COGNITIVE CORE                          │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    REASONING ENGINE                            │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │  │
│  │  │ DeepSeek │  │ DeepSeek │  │ DeepSeek │  │ DeepSeek │     │  │
│  │  │ Reasoner │  │   Chat   │  │   Chat   │  │   Chat   │     │  │
│  │  │   (R1)   │  │(Creative)│  │ (Critic) │  │(Reflect) │     │  │
│  │  │ Strategy │  │Generation│  │Evaluation│  │ Memory   │     │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  MEMORY ARCHITECTURE                           │  │
│  │                                                                │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐   │  │
│  │  │  EPISODIC   │  │   SEMANTIC    │  │    PROCEDURAL      │   │  │
│  │  │  "What"     │  │   "Why"       │  │    "How"           │   │  │
│  │  │             │  │               │  │                    │   │  │
│  │  │ • Post ID X │  │ • "Sleep +    │  │ • "For sleep →     │   │  │
│  │  │   scored 91 │  │   provoc =    │  │   use provoc       │   │  │
│  │  │ • Strategy: │  │   engagement  │  │   + shocking_stat   │   │  │
│  │  │   provoc +  │  │   because it  │  │   + dark_cinematic" │   │  │
│  │  │   sleep     │  │   challenges  │  │                    │   │  │
│  │  │ • Context:  │  │   beliefs"    │  │ • "After 3 posts   │   │  │
│  │  │   Tuesday   │  │               │  │   on same topic →  │   │  │
│  │  │   morning   │  │ • "Morning    │  │   switch topic for │   │  │
│  │  │             │  │   posts get   │  │   2 days"          │   │  │
│  │  │             │  │   2x saves"   │  │                    │   │  │
│  │  └─────────────┘  └──────────────┘  └────────────────────┘   │  │
│  │                                                                │  │
│  │  ┌────────────────────────────────────────────────────────┐   │  │
│  │  │              WORLD MODEL (Environmental State)          │   │  │
│  │  │                                                         │   │  │
│  │  │  • Brand baselines (14d rolling)                        │   │  │
│  │  │  • Competitor performance (weekly snapshots)             │   │  │
│  │  │  • Trending topics (from discovery + web scanning)      │   │  │
│  │  │  • Audience behavior patterns (day-of-week, time)       │   │  │
│  │  │  • Platform algorithm signals (reach/impressions ratio) │   │  │
│  │  │  • Content saturation map (topic freshness)             │   │  │
│  │  └────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    FOUR COGNITIVE LOOPS                        │  │
│  │                                                                │  │
│  │  Loop 1 — REACTIVE (per content piece, ~minutes)              │  │
│  │    Scout → Strategist → Creator → Critic → Publisher          │  │
│  │                                                                │  │
│  │  Loop 2 — ANALYTICAL (every 6 hours)                          │  │
│  │    Metrics → Scoring → Strategy Update → Reflection           │  │
│  │                                                                │  │
│  │  Loop 3 — DELIBERATIVE (daily)                                │  │
│  │    Pattern Analysis → Strategy Evolution → Experiment Design  │  │
│  │                                                                │  │
│  │  Loop 4 — META-COGNITIVE (weekly)                             │  │
│  │    Learning Evaluation → Algorithm Tuning → Memory Pruning    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                 INTELLIGENCE PIPELINE                          │  │
│  │                                                                │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │  │
│  │  │ Meta     │  │ Web      │  │ Own      │  │Historical│     │  │
│  │  │ Graph    │  │ Research │  │ Account  │  │ Content  │     │  │
│  │  │ API      │  │ Agent    │  │ Analysis │  │ Mining   │     │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. The Four Cognitive Loops

Traditional AI agents operate on a single loop. Toby operates on **four nested loops at different timescales**, each feeding intelligence into the others.

### Loop 1 — Reactive Loop (per content piece, ~2-10 minutes)

**Trigger:** Empty buffer slot detected.  
**Agents:** Scout → Strategist → Creator → Critic → Publisher → Reflector  
**Purpose:** Generate, evaluate, and publish one piece of content.

This is the core StateGraph execution described in `toby-agentic-reconstruction.md`, upgraded with:
- **Reasoner R1** for strategy selection (chain-of-thought)
- **Multi-critic ensemble** (rule-based + AI semantic + audience simulator)
- **Memory-augmented generation** (relevant reflections injected into creator prompt)
- **Real-time world model** (trending topics, competitor signals, timing context)

```
Slot detected → Scout gathers context from memory + world model
             → Strategist reasons (R1) about optimal strategy
             → Creator generates content with memory-augmented prompts
             → Critics evaluate (rule → semantic → audience simulation)
             → Publisher handles media pipeline + scheduling
             → Reflector writes episodic + procedural memories
```

### Loop 2 — Analytical Loop (every 6 hours)

**Trigger:** Timer-based (6-hour interval, same as current `METRICS_CHECK_INTERVAL`).  
**Agents:** Analyst → Scorer → Strategist (update mode) → Reflector  
**Purpose:** Score recent content, update strategy priors, detect anomalies.

Upgrades from current `analysis_engine.py`:
- **Anomaly detection:** Identify posts that significantly over- or under-performed expectations. Trigger deep analysis: "Why did this post get 5x views? Was it the hook, the topic, the timing, or an external event?"
- **Causal attribution:** When a post performs unexpectedly, the Analyst uses the LLM to hypothesize causal factors, not just record correlation.
- **Drift detection:** Compare 14-day rolling averages against 90-day baselines. Detect performance shifts and automatically adjust exploration ratio.

```python
# Analyst Agent — runs every 6 hours
def analyst_loop(db: Session, user_id: str):
    # 1. Score pending posts (48h + 7d phases)
    scored = score_pending_posts(db, user_id)
    
    # 2. Detect anomalies (posts scoring >2σ above/below expectation)
    anomalies = detect_anomalies(db, user_id)
    for anomaly in anomalies:
        # Deep causal analysis via LLM
        analysis = reason_about_anomaly(anomaly)
        store_semantic_memory(db, user_id, analysis)
    
    # 3. Drift detection
    drift = detect_performance_drift(db, user_id)
    if drift.significant:
        adjust_explore_ratio(db, user_id, drift)
        store_procedural_memory(db, user_id, f"Drift detected: {drift.summary}")
    
    # 4. Update strategy Thompson Sampling priors
    update_all_strategy_priors(db, user_id, scored)
```

### Loop 3 — Deliberative Loop (daily)

**Trigger:** Runs once per day at a configurable hour (e.g. 3 AM UTC).  
**Agents:** Pattern Analyzer → Strategy Evolver → Experiment Designer  
**Purpose:** Step back and think about the big picture. Evolve strategy based on accumulated evidence.

This loop doesn't exist at all in the current system. It represents Toby's capacity for **slow, deliberate thinking** — the kind of analysis a human social media manager would do weekly.

```python
# Daily Deliberation — "What patterns am I seeing? What should I change?"
def deliberation_loop(db: Session, user_id: str):
    # 1. Pattern Analysis: use LLM to analyze last 7 days of reflections
    recent_reflections = get_recent_reflections(db, user_id, days=7)
    recent_scores = get_recent_scores(db, user_id, days=7)
    
    pattern_analysis = call_deepseek_reasoner(
        f"""Analyze these content performance patterns for the last 7 days.
        
        Reflections: {format_reflections(recent_reflections)}
        Scores: {format_scores(recent_scores)}
        
        Questions to answer:
        1. What content strategies are consistently working? Why?
        2. What strategies are declining? What changed?
        3. Are there untested combinations that might outperform?
        4. Are there seasonal/temporal patterns?
        5. What should I test next?
        
        Return structured analysis with specific recommendations."""
    )
    
    # 2. Strategy Evolution: adjust priors based on analysis
    recommendations = parse_recommendations(pattern_analysis)
    for rec in recommendations:
        if rec.type == "boost_strategy":
            boost_thompson_prior(db, user_id, rec.strategy, rec.magnitude)
        elif rec.type == "penalize_strategy":
            penalize_thompson_prior(db, user_id, rec.strategy, rec.magnitude)
        elif rec.type == "new_experiment":
            create_experiment(db, user_id, rec.dimension, rec.options)
    
    # 3. Store deliberation as high-value semantic memory
    store_semantic_memory(db, user_id, pattern_analysis, priority="high")
```

### Loop 4 — Meta-Cognitive Loop (weekly)

**Trigger:** Runs once per week.  
**Agents:** Meta-Learner → Algorithm Tuner → Memory Gardener  
**Purpose:** Evaluate whether Toby's learning is actually improving outcomes — and adjust the learning system itself.

This is the most advanced loop. It implements **learning to learn** — Toby evaluates its own performance *as a learner* and adjusts its algorithms accordingly.

```python
# Weekly Meta-Cognition — "Am I actually getting better at this?"
def meta_cognitive_loop(db: Session, user_id: str):
    # 1. Learning Effectiveness Score
    # Compare: Are Toby's exploit-mode selections actually outperforming
    # explore-mode selections? If not, the learning isn't working.
    exploit_avg = get_avg_score(db, user_id, is_explore=False, days=30)
    explore_avg = get_avg_score(db, user_id, is_explore=True, days=30)
    
    learning_effectiveness = exploit_avg - explore_avg
    # If this is negative, exploitation is worse than random — learning is broken
    
    # 2. Prediction Accuracy
    # For each strategy choice, compare Toby's expected score
    # (from Thompson Sampling prior) vs actual score
    prediction_errors = compute_prediction_errors(db, user_id, days=30)
    mae = mean_absolute_error(prediction_errors)
    
    # 3. Algorithm Tuning
    if learning_effectiveness < 5:
        # Learning barely beating random — increase exploration
        increase_explore_ratio(db, user_id, by=0.10)
        log_meta_insight(db, user_id, 
            "Learning effectiveness low — increasing exploration to gather "
            "more diverse data before exploitation.")
    
    if mae > 25:
        # Predictions are way off — priors are stale
        decay_all_priors(db, user_id, factor=0.8)  # Forget 20% of old data
        log_meta_insight(db, user_id,
            "Prediction accuracy degraded — decaying old priors to be more "
            "responsive to recent data.")
    
    # 4. Memory Gardening
    # Consolidate episodic memories into semantic memories
    consolidate_memories(db, user_id)
    # Prune low-value memories (low retrieval count, old, low relevance)
    prune_memories(db, user_id, max_age_days=90, min_retrievals=2)
    
    # 5. Strategy Evolution Score 
    # Track Toby's overall improvement trajectory
    week_over_week = compute_weekly_improvement(db, user_id, weeks=4)
    store_meta_report(db, user_id, {
        "learning_effectiveness": learning_effectiveness,
        "prediction_mae": mae,
        "week_over_week_improvement": week_over_week,
        "actions_taken": [...],
    })
```

---

## 5. Agent Definitions — The Cognitive Cortex

### 5.1 Agent Overview

| Agent | Model | Temperature | Runs In | Purpose |
|---|---|---|---|---|
| **Scout** | None (DB + API) | — | Loop 1 | Gather environmental context from memory + world model |
| **Strategist** | DeepSeek Reasoner R1 | CoT | Loop 1 | Chain-of-thought strategy reasoning |
| **Creator** | DeepSeek Chat | 0.85 | Loop 1 | Generate content text + image prompts |
| **Critic (Rule)** | None (heuristic) | — | Loop 1 | Fast structural quality check |
| **Critic (Semantic)** | DeepSeek Chat | 0.2 | Loop 1 | AI-powered semantic quality evaluation |
| **Critic (Audience)** | DeepSeek Chat | 0.5 | Loop 1 | Simulate audience reaction |
| **Publisher** | None (pipeline) | — | Loop 1 | Media generation + scheduling |
| **Reflector** | DeepSeek Chat | 0.3 | Loop 1, 2 | Generate structured reflections for memory |
| **Analyst** | DeepSeek Chat | 0.3 | Loop 2 | Score content, detect anomalies, attribute causes |
| **Pattern Analyzer** | DeepSeek Reasoner R1 | CoT | Loop 3 | Deep pattern analysis across performance data |
| **Experiment Designer** | DeepSeek Reasoner R1 | CoT | Loop 3 | Design new experiments based on analysis |
| **Meta-Learner** | DeepSeek Reasoner R1 | CoT | Loop 4 | Evaluate and tune the learning system itself |
| **Intelligence Gatherer** | DeepSeek Chat | 0.3 | Continuous | Process raw intelligence into structured insights |

### 5.2 Scout Agent (Enhanced)

**Enhancements over `toby-agentic-reconstruction.md`:**

The Scout now queries the full memory architecture, not just DB tables. It performs **semantic retrieval** from reflections, pulling the most relevant past experiences for the current generation context.

```python
def scout_agent(state: AgentState) -> AgentState:
    """Gather comprehensive environmental context."""
    db = get_db_session()
    
    # ── Performance Context ──
    state.performance_context = {
        "brand_baseline": get_brand_baseline(db, state.brand_id),
        "strategy_scores": get_top_strategies(db, state.user_id, state.content_type, top_k=10),
        "recent_posts": get_recent_post_summaries(db, state.brand_id, days=14),
        "day_of_week_patterns": get_temporal_patterns(db, state.brand_id),
    }
    
    # ── Memory Retrieval (Semantic) ──
    # Build a query from current context to find relevant memories
    memory_query = f"content for {state.content_type} about topics: " + \
                   ", ".join(state.performance_context.get("top_topics", ["general"]))
    
    state.relevant_memories = {
        "episodic": retrieve_episodic_memories(db, state.user_id, memory_query, k=5),
        "semantic": retrieve_semantic_memories(db, state.user_id, memory_query, k=3),
        "procedural": retrieve_procedural_rules(db, state.user_id, state.content_type, k=5),
    }
    
    # ── World Model ──
    state.world_model = {
        "trending_topics": get_trending_topics(db, state.user_id),
        "competitor_signals": get_competitor_signals(db, state.user_id, days=7),
        "content_saturation": compute_content_saturation(db, state.brand_id),
        "platform_signals": get_platform_health(db, state.brand_id),
        "temporal_context": {
            "day_of_week": datetime.now().strftime("%A"),
            "hour": datetime.now().hour,
            "is_weekend": datetime.now().weekday() >= 5,
        },
    }
    
    # ── Content Gaps ──
    state.content_gaps = identify_content_gaps(
        db, state.user_id, state.brand_id, state.content_type,
        saturation=state.world_model["content_saturation"],
    )
    
    state.trace.append({
        "agent": "scout",
        "summary": f"Found {len(state.relevant_memories['episodic'])} relevant memories, "
                   f"{len(state.world_model['trending_topics'])} trends, "
                   f"{len(state.content_gaps)} gaps",
    })
    return state
```

### 5.3 Strategist Agent (Chain-of-Thought)

The Strategist is the cognitive heart of Toby v3.0. It replaces the current `choose_strategy()` epsilon-greedy/Thompson Sampling with **LLM-powered reasoning** that considers the full context.

**Critical design:** Thompson Sampling is NOT removed. It serves as the **Bayesian prior** that constrains the LLM's reasoning. The LLM can override Thompson Sampling's top pick, but only with explicit reasoning about why.

```python
STRATEGIST_SYSTEM_PROMPT = """You are Toby's Strategy Engine — a world-class social media strategist.

You are deciding the content strategy for the next piece of content. You will receive:
1. Thompson Sampling's statistical recommendation (the "prior")
2. Recent performance data across all strategy dimensions
3. Relevant memories from past content creation
4. Current world model (trends, competitor signals, timing context)
5. Content gaps (what hasn't been covered recently)
6. Procedural rules Toby has learned (hard-won lessons)

Your job:
- REASON step by step about what strategy will maximize engagement
- Consider WHY strategies have worked or failed (from memories), not just scores
- Factor in temporal context (day of week, time of day, recent content frequency)
- Consider content saturation — if a topic has been posted 3 times this week, diversify
- You may OVERRIDE Thompson Sampling's recommendation, but you must explain why
- You may PROPOSE novel combinations that haven't been tested yet

You MUST respect the brand's Content DNA constraints:
- Only topics within the brand's topic_categories
- Tone must match content_tone / tone_avoid
- CTA style must match brand preferences

Output JSON:
{
    "strategy": {
        "personality": "...",
        "topic_bucket": "...",
        "hook_strategy": "...",
        "title_format": "...",
        "visual_style": "..."
    },
    "rationale": "Multi-paragraph explanation of your reasoning",
    "confidence": 0.0-1.0,
    "thompson_override": true/false,
    "override_reason": "..." (if overriding),
    "experiment_suggestion": null or {"dimension": "...", "options": [...], "hypothesis": "..."}
}"""


def strategist_agent(state: AgentState) -> AgentState:
    """Chain-of-thought strategy reasoning using DeepSeek Reasoner R1."""
    db = get_db_session()
    
    explore_ratio = get_effective_explore_ratio(db, state.user_id, state.brand_id)
    is_explore = random.random() < explore_ratio
    
    if is_explore:
        # Pure exploration — random selection, no AI cost
        state.strategy = random_strategy(state.content_type, state.content_gaps)
        state.strategy_rationale = "Exploration: testing new strategy combination"
        state.is_explore = True
    else:
        # ── Get Thompson Sampling's recommendation (the Bayesian prior) ──
        thompson_pick = thompson_sample_strategy(
            db, state.user_id, state.brand_id, state.content_type
        )
        
        # ── Build reasoning context ──
        context = build_strategy_context(
            thompson_pick=thompson_pick,
            performance=state.performance_context,
            memories=state.relevant_memories,
            world_model=state.world_model,
            content_gaps=state.content_gaps,
            content_dna=state.prompt_context,
        )
        
        # ── Chain-of-thought reasoning (DeepSeek Reasoner R1) ──
        response = call_deepseek_reasoner(
            system_prompt=STRATEGIST_SYSTEM_PROMPT,
            user_prompt=context,
            max_tokens=4000,
        )
        
        # Store the reasoning chain for the "Thinking" UI
        state.reasoning_chain = response.reasoning_content
        
        # Parse the strategy decision
        decision = parse_strategy_decision(response.content)
        state.strategy = decision["strategy"]
        state.strategy_rationale = decision["rationale"]
        state.strategy_confidence = decision.get("confidence", 0.7)
        state.thompson_override = decision.get("thompson_override", False)
        state.is_explore = False
        
        # If the strategist suggests a new experiment, queue it
        if decision.get("experiment_suggestion"):
            queue_experiment_suggestion(db, state.user_id, decision["experiment_suggestion"])
    
    state.trace.append({
        "agent": "strategist",
        "model": "none" if is_explore else "deepseek-reasoner",
        "summary": format_strategy_summary(state.strategy, state.is_explore),
        "reasoning_length": len(state.reasoning_chain) if hasattr(state, 'reasoning_chain') else 0,
    })
    return state
```

### 5.4 Creator Agent (Memory-Augmented)

The Creator receives not just strategy parameters but **relevant memories** that inform the generation. Past successes and failures are injected into the prompt, creating a few-shot learning effect.

```python
def creator_agent(state: AgentState) -> AgentState:
    """Generate content with memory-augmented prompting."""
    
    # ── Build enhanced prompt with memory injection ──
    prompt_parts = []
    
    # 1. Standard generation prompt (from current system)
    base_prompt = build_generation_prompt(state.strategy, state.prompt_context)
    prompt_parts.append(base_prompt)
    
    # 2. Inject relevant procedural rules
    if state.relevant_memories.get("procedural"):
        rules = "\n".join([f"- {r.rule_text}" for r in state.relevant_memories["procedural"]])
        prompt_parts.append(f"\n\n## Lessons from past experience:\n{rules}")
    
    # 3. Inject relevant episodic examples (few-shot from Toby's own history)
    if state.relevant_memories.get("episodic"):
        examples = format_episodic_examples(state.relevant_memories["episodic"])
        prompt_parts.append(f"\n\n## Examples of what worked well before:\n{examples}")
    
    # 4. Inject strategy rationale (from Strategist's reasoning)
    prompt_parts.append(
        f"\n\n## Strategy context (from the strategy engine):\n{state.strategy_rationale}"
    )
    
    # 5. If this is a revision, inject critic feedback
    if state.revision_count > 0:
        prompt_parts.append(
            f"\n\n## REVISION REQUEST (attempt {state.revision_count + 1}):\n"
            f"The previous version had these issues:\n"
            + "\n".join(f"- {issue}" for issue in state.critic_issues)
            + f"\n\nSpecific feedback: {state.critic_feedback}"
        )
    
    # 6. Inject competitor context if available
    if state.world_model.get("competitor_signals"):
        signals = format_competitor_signals(state.world_model["competitor_signals"][:3])
        prompt_parts.append(
            f"\n\n## Recent competitor trends (for inspiration, not copying):\n{signals}"
        )
    
    full_prompt = "\n".join(prompt_parts)
    
    # ── Generate (using existing ContentGeneratorV2 pipeline) ──
    result = call_deepseek_chat(
        system_prompt=build_system_prompt_with_personality(state.strategy, state.prompt_context),
        user_prompt=full_prompt,
        temperature=0.85,
        max_tokens=1200 if state.content_type == "reel" else 8000,
    )
    
    state.generated_content = parse_content_result(result, state.content_type)
    
    # ── Generate image prompt (coordinated with text content) ──
    image_prompt = generate_coordinated_image_prompt(
        content=state.generated_content,
        visual_style=state.strategy["visual_style"],
        prompt_context=state.prompt_context,
    )
    state.image_prompts = [image_prompt]
    
    state.trace.append({
        "agent": "creator",
        "model": "deepseek-chat",
        "summary": f"Generated: \"{state.generated_content.get('title', '')[:60]}\"",
        "revision": state.revision_count,
        "memories_used": len(state.relevant_memories.get("procedural", [])),
    })
    return state
```

### 5.5 Reflector Agent (Triple Memory Writer)

The Reflector is the most conceptually important new agent. After every content piece, it generates three types of memory:

```python
REFLECTOR_SYSTEM_PROMPT = """You are Toby's Memory Agent. After each content creation,
you must generate three types of memory entries:

1. EPISODIC MEMORY — What happened
   Record the specific event: strategy used, quality score, any notable circumstances.
   This is a factual log entry.

2. SEMANTIC MEMORY — What it means
   Extract a generalizable insight. Not "Post X scored 91" but "The combination of
   provocative personality + sleep topic creates high engagement because it challenges
   common beliefs, which triggers saves and shares."
   
3. PROCEDURAL RULE — What to do about it
   If this experience suggests a concrete rule for future behavior, state it.
   E.g., "When the topic is 'sleep' and the audience is health-conscious, prefer
   'shocking_stat' hooks over 'question' hooks."
   Not every experience generates a procedural rule — only clear patterns.

Return JSON:
{
    "episodic": {
        "summary": "...",
        "key_facts": ["...", "..."],
        "tags": ["topic:sleep", "personality:provoc", "outcome:success"]
    },
    "semantic": {
        "insight": "...",
        "confidence": 0.0-1.0,
        "tags": ["...", "..."]
    },
    "procedural": null or {
        "rule": "...",
        "conditions": "When...",
        "action": "Do...",
        "confidence": 0.0-1.0
    }
}"""


def reflector_agent(state: AgentState) -> AgentState:
    """Generate triple memory entries from content creation experience."""
    
    reflection_context = build_reflection_context(state)
    
    response = call_deepseek_chat(
        system_prompt=REFLECTOR_SYSTEM_PROMPT,
        user_prompt=reflection_context,
        temperature=0.3,
        max_tokens=1500,
    )
    
    memories = parse_reflection_response(response)
    
    # Store episodic memory (always)
    store_episodic_memory(
        db, state.user_id, state.brand_id,
        summary=memories["episodic"]["summary"],
        tags=memories["episodic"]["tags"],
        schedule_id=state.schedule_id,
        strategy=state.strategy,
        quality_score=state.quality_score,
    )
    
    # Store semantic memory (always)
    store_semantic_memory(
        db, state.user_id,
        insight=memories["semantic"]["insight"],
        confidence=memories["semantic"]["confidence"],
        tags=memories["semantic"]["tags"],
    )
    
    # Store procedural rule (only if the reflector produced one)
    if memories.get("procedural"):
        store_procedural_rule(
            db, state.user_id,
            rule=memories["procedural"]["rule"],
            conditions=memories["procedural"]["conditions"],
            action=memories["procedural"]["action"],
            confidence=memories["procedural"]["confidence"],
        )
    
    state.trace.append({
        "agent": "reflector",
        "model": "deepseek-chat",
        "summary": f"Stored {1 + 1 + (1 if memories.get('procedural') else 0)} memory entries",
    })
    return state
```

---

## 6. Memory Architecture — Multi-Tier Semantic Memory

### 6.1 Why Three Memory Types?

Human cognition uses distinct memory systems for different purposes. Toby adopts the same structure:

| Memory Type | Human Analogy | Purpose | Example |
|---|---|---|---|
| **Episodic** | "I remember that time..." | Record specific events with full context | "On Tuesday, post #X with provoc+sleep scored 91. It was revision 2 after critic flagged weak hook." |
| **Semantic** | "I know that..." | Generalized knowledge extracted from episodes | "Sleep content + provocative tone generates 2x engagement vs educational tone for this brand." |
| **Procedural** | "I know how to..." | Concrete rules for action | "When topic=sleep AND brand=X → use personality=provoc, hook=shocking_stat, visual=dark_cinematic" |

### 6.2 Memory Tables

```sql
-- Episodic Memory: What happened
CREATE TABLE toby_episodic_memory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    brand_id        VARCHAR(50),
    content_type    VARCHAR(10),
    
    -- Event record
    schedule_id     VARCHAR(36),
    strategy        JSONB NOT NULL,           -- {personality, topic, hook, format, visual}
    quality_score   FLOAT,                    -- Critic score at creation
    toby_score      FLOAT,                    -- Instagram score (backfilled later)
    
    -- AI-generated summary
    summary         TEXT NOT NULL,
    key_facts       JSONB DEFAULT '[]',       -- ["hook was revised", "used trending topic"]
    tags            JSONB DEFAULT '[]',       -- ["topic:sleep", "outcome:success"]
    
    -- Context
    temporal_context JSONB,                   -- {day_of_week, hour, is_weekend}
    revision_count  INTEGER DEFAULT 0,
    was_experiment  BOOLEAN DEFAULT FALSE,
    
    -- Embedding for retrieval
    embedding       VECTOR(1536),
    
    -- Usage tracking (for memory pruning)
    retrieval_count INTEGER DEFAULT 0,
    last_retrieved  TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Semantic Memory: What it means
CREATE TABLE toby_semantic_memory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    
    -- The insight
    insight         TEXT NOT NULL,
    confidence      FLOAT DEFAULT 0.5,        -- How confident we are (0-1)
    tags            JSONB DEFAULT '[]',
    
    -- Provenance: which episodic memories generated this
    source_episode_ids JSONB DEFAULT '[]',    -- UUIDs of episodic memories
    
    -- Validation
    confirmed_count INTEGER DEFAULT 0,        -- Times this insight was confirmed
    contradicted_count INTEGER DEFAULT 0,     -- Times this was contradicted
    
    -- Embedding for retrieval
    embedding       VECTOR(1536),
    
    -- Usage tracking
    retrieval_count INTEGER DEFAULT 0,
    last_retrieved  TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Procedural Memory: What to do
CREATE TABLE toby_procedural_memory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    brand_id        VARCHAR(50),
    content_type    VARCHAR(10),
    
    -- The rule
    rule_text       TEXT NOT NULL,             -- "When sleep + health audience → use provoc"
    conditions      TEXT,                      -- Machine-parseable conditions
    action          TEXT,                      -- Recommended action
    confidence      FLOAT DEFAULT 0.5,
    
    -- Provenance
    source_semantic_ids JSONB DEFAULT '[]',   -- Which semantic memories led to this
    
    -- Validation
    applied_count   INTEGER DEFAULT 0,        -- Times this rule was used
    success_count   INTEGER DEFAULT 0,        -- Times it led to good outcomes
    failure_count   INTEGER DEFAULT 0,        -- Times it led to bad outcomes
    success_rate    FLOAT,                    -- Computed: success / applied
    
    -- Status
    is_active       BOOLEAN DEFAULT TRUE,     -- Can be deactivated by meta-learner
    
    -- Embedding for retrieval
    embedding       VECTOR(1536),
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- World Model: Environmental state
CREATE TABLE toby_world_model (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    brand_id        VARCHAR(50),
    
    -- What was observed
    signal_type     VARCHAR(30) NOT NULL,      -- "trend", "competitor", "platform", "audience"
    signal_data     JSONB NOT NULL,
    
    -- AI-generated summary
    interpretation  TEXT,
    
    -- Relevance
    relevance_score FLOAT DEFAULT 0.5,
    expires_at      TIMESTAMPTZ,              -- World model signals decay
    
    -- Embedding
    embedding       VECTOR(1536),
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX ix_episodic_user_brand ON toby_episodic_memory (user_id, brand_id, content_type);
CREATE INDEX ix_episodic_embedding ON toby_episodic_memory USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ix_semantic_user ON toby_semantic_memory (user_id);
CREATE INDEX ix_semantic_embedding ON toby_semantic_memory USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ix_procedural_user_brand ON toby_procedural_memory (user_id, brand_id, content_type);
CREATE INDEX ix_procedural_active ON toby_procedural_memory (user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX ix_world_model_user ON toby_world_model (user_id, signal_type);
CREATE INDEX ix_world_model_expires ON toby_world_model (expires_at) WHERE expires_at IS NOT NULL;
```

### 6.3 Memory Lifecycle

```
Content Created → Reflector writes episodic + semantic + procedural
                     │
                     ▼
Instagram Data → Analyst backfills toby_score on episodic memory
Arrives (48h)    → If score contradicts semantic insight → decrement confidence
                 → If score confirms semantic insight → increment confirmed_count
                     │
                     ▼
Daily Loop     → Pattern Analyzer consolidates episodic → semantic
               → Identifies new procedural rules from repeated patterns
               → Strengthens high-confidence rules, weakens contradicted ones
                     │
                     ▼
Weekly Loop    → Meta-Learner prunes stale memories
               → Deactivates procedural rules with success_rate < 0.4
               → Consolidates similar semantic memories
               → Archives episodic memories older than 90 days
```

### 6.4 Embedding Generation

Use DeepSeek's embedding model or a dedicated lightweight model for vector generation:

```python
async def generate_embedding(text: str) -> list[float]:
    """Generate a 1536-d embedding for memory storage and retrieval."""
    response = await client.embeddings.create(
        model="text-embedding-3-small",  # or DeepSeek's embedding endpoint
        input=text,
        dimensions=1536,
    )
    return response.data[0].embedding
```

**Retrieval pattern:**
```python
def retrieve_relevant_memories(
    db: Session,
    user_id: str,
    query: str,
    memory_type: str = "semantic",
    k: int = 5,
) -> list:
    """Retrieve the k most relevant memories using cosine similarity."""
    query_embedding = generate_embedding(query)
    
    table = {
        "episodic": TobyEpisodicMemory,
        "semantic": TobySemanticMemory,
        "procedural": TobyProceduralMemory,
    }[memory_type]
    
    results = (
        db.query(table)
        .filter(table.user_id == user_id)
        .order_by(table.embedding.cosine_distance(query_embedding))
        .limit(k)
        .all()
    )
    
    # Update retrieval tracking
    for r in results:
        r.retrieval_count += 1
        r.last_retrieved = datetime.now(timezone.utc)
    db.commit()
    
    return results
```

---

## 7. Reasoning Engine — Chain-of-Thought Strategy

### 7.1 Why DeepSeek Reasoner R1?

DeepSeek-R1 returns two fields:
- `reasoning_content`: The model's internal chain-of-thought (the "thinking")
- `content`: The final answer

This is critical for Toby because:
1. **Transparency:** Users can see *why* Toby made a strategy decision
2. **Debuggability:** Developers can inspect reasoning chains to find logic errors
3. **Self-improvement:** The meta-learner can evaluate reasoning quality over time
4. **Trust:** Users are more likely to trust an AI that shows its work

### 7.2 Reasoning Context Template

```python
def build_strategy_context(
    thompson_pick: StrategyChoice,
    performance: dict,
    memories: dict,
    world_model: dict,
    content_gaps: list,
    content_dna: PromptContext,
) -> str:
    """Build the context prompt that the Strategist will reason about."""
    
    context = f"""## Statistical Recommendation (Thompson Sampling Prior)
Personality: {thompson_pick.personality} (avg score: {thompson_pick.personality_score:.1f})
Topic: {thompson_pick.topic_bucket} (avg score: {thompson_pick.topic_score:.1f})
Hook: {thompson_pick.hook_strategy} (avg score: {thompson_pick.hook_score:.1f})
Title format: {thompson_pick.title_format}
Visual style: {thompson_pick.visual_style}

## Brand Identity (Content DNA — INVIOLABLE CONSTRAINTS)
Niche: {content_dna.niche_name}
Tone: {content_dna.content_tone}
Avoid: {content_dna.tone_avoid}
Topics: {', '.join(content_dna.topic_categories)}
Target Audience: {content_dna.target_audience}

## Performance Data (Last 14 Days)
Top strategies: {format_top_strategies(performance['strategy_scores'])}
Recent trend: {format_trend(performance['recent_posts'])}
Day-of-week patterns: {format_temporal(performance['day_of_week_patterns'])}

## Relevant Memories
{format_memories(memories)}

## World Model
Trending: {', '.join(world_model['trending_topics'][:5])}
Competitor signals: {format_competitor_signals(world_model['competitor_signals'][:3])}
Content saturation: {format_saturation(world_model['content_saturation'])}
Current time: {world_model['temporal_context']['day_of_week']} {world_model['temporal_context']['hour']}:00

## Content Gaps (Under-explored)
{chr(10).join(f'- {gap}' for gap in content_gaps[:5])}

## Your Task
Choose the optimal strategy for the next {content_dna.niche_name} content piece.
Consider all context above. You may agree with or override the statistical recommendation.
If you override, explain why. Think step by step."""
    
    return context
```

### 7.3 Reasoning Chain Storage

```python
# Store the full reasoning chain for observability
def store_reasoning_trace(
    db: Session,
    user_id: str,
    schedule_id: str,
    reasoning_chain: str,
    final_decision: dict,
):
    """Store the Strategist's reasoning for the Thinking UI and auditing."""
    log = TobyActivityLog(
        user_id=user_id,
        action_type="strategy_reasoning",
        description=f"Strategy decided: {final_decision['personality']} × {final_decision['topic_bucket']}",
        metadata={
            "schedule_id": schedule_id,
            "reasoning_chain": reasoning_chain,  # Full CoT from R1
            "decision": final_decision,
            "model": "deepseek-reasoner",
        },
        level="info",
    )
    db.add(log)
    db.commit()
```

---

## 8. Self-Improving Learning System

### 8.1 Three-Speed Learning

```
                    ┌──────────────────────────────────────────┐
                    │          LEARNING TIMELINE                │
                    │                                           │
   Real-time        │  ●─────────────────────────────────────●  │
   (minutes)        │  Critic score → immediate signal         │
                    │                                           │
   Short-term       │        ●──────────────────────●          │
   (48h–7d)         │        Instagram metrics → Toby Score    │
                    │                                           │
   Long-term        │                   ●────────────●         │
   (weeks–months)   │                   Pattern analysis       │
                    │                   Strategy evolution      │
                    └──────────────────────────────────────────┘
```

**Real-time Signal (new):**

Currently, the only learning signal is Instagram metrics (48h–7d delayed). This means a bad strategy keeps getting selected for days before the system knows it's bad.

The fix: Feed the Critic's quality score as an **immediate signal** to Thompson Sampling:

```python
def update_immediate_signal(
    db: Session, user_id: str, brand_id: str,
    content_type: str, strategy: dict, quality_score: float
):
    """Update Thompson Sampling priors with immediate quality signal.
    
    Weighted at 30% compared to Instagram metrics (70%).
    This gives the learning system a fast feedback loop.
    """
    for dimension, option in strategy.items():
        if dimension not in LEARNING_DIMENSIONS:
            continue
        
        score = db.query(TobyStrategyScore).filter(
            TobyStrategyScore.user_id == user_id,
            TobyStrategyScore.content_type == content_type,
            TobyStrategyScore.dimension == dimension,
            TobyStrategyScore.option_value == option,
        ).first()
        
        if score:
            # Blend: 30% weight for immediate quality signal
            # (Instagram metrics get 70% when they arrive later)
            weighted_score = quality_score * 0.30
            update_welford(score, weighted_score)
            db.commit()
```

### 8.2 Thompson Sampling with Bayesian Priors

Replace epsilon-greedy with proper Thompson Sampling using Beta distributions:

```python
import numpy as np

def thompson_sample_dimension(
    db: Session, user_id: str, brand_id: str,
    content_type: str, dimension: str, options: list[str],
) -> tuple[str, float]:
    """True Thompson Sampling: sample from Beta posteriors.
    
    For each option, maintain Alpha (successes) and Beta (failures)
    parameters. Sample from each option's Beta distribution and pick
    the highest sample.
    
    This naturally handles the explore/exploit tradeoff:
    - Options with few data points have wide distributions → more likely
      to be sampled high (automatic exploration)
    - Options with many data points have narrow distributions → converge
      on their true mean (automatic exploitation)
    """
    samples = {}
    
    for option in options:
        score = get_or_create_strategy_score(
            db, user_id, brand_id, content_type, dimension, option
        )
        
        # Convert avg_score (0-100) and sample_count to Beta parameters
        # Alpha = "pseudo-successes", Beta = "pseudo-failures"
        if score.sample_count == 0:
            # Uninformative prior: Beta(1, 1) = uniform
            alpha, beta = 1.0, 1.0
        else:
            # Score is 0-100, normalize to 0-1
            normalized = score.avg_score / 100.0
            # Scale by sample count (with diminishing returns)
            effective_n = min(score.sample_count, 50)  # Cap influence at 50 samples
            alpha = max(1.0, effective_n * normalized + 1)
            beta = max(1.0, effective_n * (1 - normalized) + 1)
        
        # Sample from the posterior
        samples[option] = np.random.beta(alpha, beta)
    
    winner = max(samples, key=samples.get)
    return winner, samples[winner]
```

### 8.3 Combination-Level Tracking

The current system tracks each dimension independently. But `provoc + sleep` might be great while `provoc + nutrition` is terrible. The combination matters.

```sql
CREATE TABLE toby_strategy_combos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    brand_id        VARCHAR(50),
    content_type    VARCHAR(10),
    
    -- The combination (sorted, deterministic key)
    combo_key       VARCHAR(500) NOT NULL,     -- "provoc|sleep|question|how_x_does_y|dark"
    
    -- Statistics
    sample_count    INTEGER DEFAULT 0,
    avg_quality     FLOAT DEFAULT 0,           -- From Critic (immediate)
    avg_toby_score  FLOAT DEFAULT 0,           -- From Instagram (delayed)
    score_variance  FLOAT DEFAULT 0,
    
    -- Trend
    recent_scores   JSONB DEFAULT '[]',        -- Last 10 scores
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE (user_id, brand_id, content_type, combo_key)
);
```

The Strategist Agent can then query: "What are the top 5 strategy *combinations*, not just individual dimension winners?"

### 8.4 Meta-Learning: Learning to Learn

The most advanced component. The Meta-Learner evaluates weekly whether Toby's learning system is actually working:

```python
def meta_learning_evaluation(db: Session, user_id: str) -> dict:
    """Evaluate the learning system's effectiveness.
    
    Key metrics:
    1. Exploitation Premium: Do exploit choices outscore explore choices?
    2. Prediction Calibration: Are Thompson Sampling priors accurate?
    3. Learning Velocity: Is performance improving over time?
    4. Procedural Rule ROI: Do rules actually improve outcomes?
    """
    
    # 1. Exploitation Premium
    exploit_scores = get_scores_by_mode(db, user_id, is_explore=False, days=30)
    explore_scores = get_scores_by_mode(db, user_id, is_explore=True, days=30)
    exploitation_premium = mean(exploit_scores) - mean(explore_scores)
    
    # 2. Prediction Calibration
    # For each recent post, compare Thompson Sampling's expected score
    # (the prior mean for the chosen strategy) vs actual score
    predictions_vs_actuals = get_prediction_pairs(db, user_id, days=30)
    calibration_error = mean_absolute_error(
        [p.predicted for p in predictions_vs_actuals],
        [p.actual for p in predictions_vs_actuals]
    )
    
    # 3. Learning Velocity (are scores trending up?)
    weekly_avgs = get_weekly_averages(db, user_id, weeks=8)
    if len(weekly_avgs) >= 4:
        # Linear regression on weekly averages
        slope = compute_trend_slope(weekly_avgs)
        learning_velocity = slope  # Positive = improving
    else:
        learning_velocity = None
    
    # 4. Procedural Rule ROI
    rules = get_active_rules(db, user_id)
    rule_roi = []
    for rule in rules:
        if rule.applied_count >= 5:
            rule_roi.append({
                "rule": rule.rule_text[:100],
                "success_rate": rule.success_rate,
                "applied": rule.applied_count,
            })
    
    return {
        "exploitation_premium": exploitation_premium,
        "calibration_error": calibration_error,
        "learning_velocity": learning_velocity,
        "rule_roi": rule_roi,
        "recommendations": generate_meta_recommendations(
            exploitation_premium, calibration_error, learning_velocity, rule_roi
        ),
    }
```

---

## 9. Continuous Intelligence Pipeline

### 9.1 Architecture

Toby should be continuously gathering intelligence, not just during discovery ticks. The Intelligence Pipeline runs asynchronously and feeds the World Model.

```
┌─────────────────────────────────────────────────────────────┐
│                  INTELLIGENCE PIPELINE                        │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ Meta Graph API   │  │ Web Research     │                 │
│  │ (Rate-Limited)   │  │ Agent            │                 │
│  │                  │  │                  │                 │
│  │ • Own account    │  │ • Google Trends  │                 │
│  │   media scan     │  │ • Reddit health  │                 │
│  │ • Competitor     │  │   subreddits     │                 │
│  │   business       │  │ • PubMed recent  │                 │
│  │   discovery      │  │   health studies │                 │
│  │ • Hashtag        │  │ • News headlines │                 │
│  │   searches       │  │   in niche       │                 │
│  └────────┬─────────┘  └────────┬─────────┘                 │
│           │                     │                            │
│           ▼                     ▼                            │
│  ┌─────────────────────────────────────────┐                │
│  │          RAW SIGNAL BUFFER              │                │
│  │  (toby_raw_signals — unprocessed)       │                │
│  └────────────────┬────────────────────────┘                │
│                   │                                          │
│                   ▼                                          │
│  ┌─────────────────────────────────────────┐                │
│  │     INTELLIGENCE PROCESSOR              │                │
│  │     (DeepSeek Chat, temp 0.3)           │                │
│  │                                          │                │
│  │  "Here are 50 raw signals from the      │                │
│  │   last 24 hours. Synthesize them into   │                │
│  │   actionable intelligence briefings."   │                │
│  └────────────────┬────────────────────────┘                │
│                   │                                          │
│                   ▼                                          │
│  ┌─────────────────────────────────────────┐                │
│  │          WORLD MODEL UPDATE              │                │
│  │  (toby_world_model — structured)        │                │
│  └─────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Meta Graph API Budget Manager

The Instagram/Meta Graph API has strict rate limits. Toby must manage its API budget carefully:

```python
# Rate limits reference (per user token):
# - Business Discovery: 200 calls/hour
# - Media insights: 200 calls/hour
# - Hashtag search: 30 unique hashtags per 7-day rolling window
# - Media list: 200 calls/hour

class APIBudgetManager:
    """Manage Meta Graph API rate limits across all Toby operations.
    
    Budget allocation strategy:
    - 40% for own account monitoring (metrics collection)
    - 30% for competitor scanning (business discovery)
    - 20% for hashtag research
    - 10% for reserve (burst capacity for anomaly investigation)
    """
    
    MAX_CALLS_PER_HOUR = 200
    BUDGET_ALLOCATION = {
        "own_account": 0.40,     # 80 calls/hour
        "competitors": 0.30,     # 60 calls/hour
        "hashtags": 0.20,        # 40 calls/hour
        "reserve": 0.10,         # 20 calls/hour
    }
    
    # Hashtag-specific limit
    MAX_UNIQUE_HASHTAGS_PER_WEEK = 30
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        self._call_log: list[datetime] = []
        self._hashtag_log: dict[str, datetime] = {}  # hashtag → first_used
    
    def can_call(self, category: str) -> bool:
        """Check if we have budget for this API call category."""
        now = datetime.now(timezone.utc)
        hour_ago = now - timedelta(hours=1)
        
        # Count calls in the last hour
        recent_calls = [t for t in self._call_log if t > hour_ago]
        
        # Category budget
        max_for_category = int(self.MAX_CALLS_PER_HOUR * self.BUDGET_ALLOCATION[category])
        category_calls = len([c for c in recent_calls])  # simplified
        
        return category_calls < max_for_category
    
    def can_search_hashtag(self, hashtag: str) -> bool:
        """Check if we can search a new unique hashtag this week."""
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        recent_hashtags = {
            h for h, t in self._hashtag_log.items() if t > week_ago
        }
        
        if hashtag in recent_hashtags:
            return True  # Already searched this week, doesn't count as new
        
        return len(recent_hashtags) < self.MAX_UNIQUE_HASHTAGS_PER_WEEK
    
    def record_call(self, category: str):
        """Record an API call for budget tracking."""
        self._call_log.append(datetime.now(timezone.utc))
    
    def get_budget_status(self) -> dict:
        """Return current budget utilization for monitoring."""
        now = datetime.now(timezone.utc)
        hour_ago = now - timedelta(hours=1)
        recent = len([t for t in self._call_log if t > hour_ago])
        
        return {
            "calls_last_hour": recent,
            "max_per_hour": self.MAX_CALLS_PER_HOUR,
            "utilization_pct": round(recent / self.MAX_CALLS_PER_HOUR * 100, 1),
            "hashtags_this_week": len(self._hashtag_log),
            "max_hashtags_per_week": self.MAX_UNIQUE_HASHTAGS_PER_WEEK,
        }
```

### 9.3 Web Research Agent

For brands in competitive niches, Toby can gather intelligence beyond Instagram:

```python
WEB_RESEARCH_SYSTEM_PROMPT = """You are a health/wellness content research agent.
Given a brand's niche and recent topics, search for:
1. Trending health studies or findings relevant to the niche
2. Trending social media topics in this space
3. Seasonal health topics (e.g., winter immunity, summer hydration)
4. Viral content patterns in the niche

Return structured signals that can inform content strategy.
Do NOT fabricate studies or statistics. Only report verifiable information.

Return JSON: {
    "signals": [
        {
            "type": "trending_topic" | "new_study" | "seasonal" | "viral_pattern",
            "title": "...",
            "summary": "...",
            "relevance": 0.0-1.0,
            "source": "...",
            "expires_in_days": N
        }
    ]
}"""
```

**Implementation note:** Web research uses a tool-use pattern. The Intelligence Gatherer agent is given tools (search, fetch) and uses them in a ReAct loop to find relevant information. This is a standard LLM agent pattern — the agent decides what to search for, evaluates results, and decides whether to search more.

### 9.4 Competitor Deep Analysis

Instead of just collecting competitor posts, Toby should **analyze** them:

```python
COMPETITOR_ANALYSIS_PROMPT = """Analyze these competing Instagram posts from accounts 
in the {niche} space. For each post, identify:

1. HOOK STRATEGY: What technique does the title/cover use to grab attention?
2. CONTENT STRUCTURE: How is information organized?
3. VISUAL STYLE: What is the aesthetic approach?
4. ENGAGEMENT DRIVERS: What about this post drives saves/shares?
5. DIFFERENTIATION OPPORTUNITY: How could our brand's unique angle improve on this?

Posts to analyze:
{competitor_posts}

Our brand's Content DNA:
- Niche: {niche}
- Tone: {tone}
- Topics: {topics}
- Unique angle: {brand_personality}

Return structured analysis with specific, actionable takeaways."""
```

---

## 10. Adversarial Quality System — Multi-Critic Ensemble

### 10.1 Three Critics, One Gate

Replace the current single-layer rule-based scorer with a **three-critic ensemble**:

```
Generated Content
        │
        ▼
┌───────────────┐
│ CRITIC 1:     │  Fast, free, structural
│ Rule-Based    │  → Score < 50? KILL immediately (save AI costs)
│ (QualityScorer│  → Score ≥ 50? Pass to Critic 2
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ CRITIC 2:     │  AI-powered semantic evaluation
│ Semantic      │  → Hook power, novelty, argument quality
│ (DeepSeek     │  → Emotional resonance, plausibility
│  Chat, t=0.2) │  → Specific, actionable feedback
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ CRITIC 3:     │  Simulated audience reaction
│ Audience      │  → "Pretend you are {target_audience}"
│ Simulator     │  → "Would you stop scrolling? Save this? Share?"
│ (DeepSeek     │  → Tests emotional impact from audience POV
│  Chat, t=0.5) │
└───────┬───────┘
        │
        ▼
  ENSEMBLE VERDICT
  Score = 25% Rule + 45% Semantic + 30% Audience
```

### 10.2 Audience Simulator

This is a novel critique layer. Instead of evaluating content from a quality perspective, it simulates the target audience's reaction:

```python
AUDIENCE_SIMULATOR_PROMPT = """You are simulating the reaction of this specific audience:

Target Audience: {target_audience}
Platform: Instagram ({content_type})
Time of day: {time_context}
Scrolling context: {scrolling_context}

You are scrolling through your Instagram feed. You see this content:

Title/Cover: {title}
First visible text: {first_line}
Content type: {content_type}

Answer AS THIS AUDIENCE MEMBER (not as an AI):
1. SCROLL STOP (0-100): Would you stop scrolling for this? Be brutally honest. Most content gets scrolled past.
2. READ THROUGH (0-100): If you stopped, would you read/watch the whole thing?
3. SAVE (0-100): Would you save this for later? What would make you save it?
4. SHARE (0-100): Would you share this? Who would you send it to?
5. FOLLOW (0-100): If you weren't following this account, would this post make you follow?
6. EMOTIONAL REACTION: What emotion does this trigger? (curiosity, surprise, recognition, skepticism, boredom...)
7. IMPROVEMENT: One specific change that would make you more likely to engage.

Return JSON with all scores and commentary."""
```

### 10.3 Constitutional Critique

Inspired by Constitutional AI, every critic evaluation checks content against the brand's "constitution" — rules derived from Content DNA:

```python
def build_brand_constitution(content_dna: PromptContext) -> str:
    """Convert Content DNA into a critique constitution."""
    rules = []
    
    if content_dna.tone_avoid:
        rules.append(f"MUST NOT use tone: {content_dna.tone_avoid}")
    if content_dna.topic_avoid:
        rules.append(f"MUST NOT cover topics: {', '.join(content_dna.topic_avoid)}")
    if content_dna.content_tone:
        rules.append(f"MUST match tone: {content_dna.content_tone}")
    if content_dna.citation_style:
        rules.append(f"Citations MUST follow: {content_dna.citation_style}")
    
    # Platform-specific rules
    rules.extend([
        "MUST NOT make unverified health claims",
        "MUST NOT use pure clickbait with no substance",
        "MUST include a clear value proposition in the first 3 seconds",
        "MUST NOT exceed platform character/time limits",
    ])
    
    return "\n".join(f"Rule {i+1}: {r}" for i, r in enumerate(rules))
```

---

## 11. Retroactive Learning — Mining Historical Performance

### 11.1 The Cold-Start Problem

When Toby is enabled for a brand, it starts with zero knowledge. But the brand often has months or years of published content with real performance data. This historical content is a goldmine of learning that Toby currently ignores.

### 11.2 Historical Content Mining Pipeline

When Toby is first enabled (or when explicitly triggered), run a one-time deep analysis of all historical content:

```python
async def mine_historical_content(db: Session, user_id: str, brand_id: str):
    """Retroactively analyze all historical content to bootstrap Toby's memory.
    
    This runs once when Toby is first enabled for a brand, or on demand.
    Uses the Meta Graph API to fetch all historical posts and their metrics,
    then uses the LLM to extract learning signals.
    
    API Budget: Uses the 'reserve' budget category, spread across hours
    to avoid rate limit violations.
    """
    budget = APIBudgetManager(user_id)
    
    # 1. Fetch all historical posts (paginated, rate-limited)
    all_posts = []
    cursor = None
    while True:
        if not budget.can_call("reserve"):
            await asyncio.sleep(60)  # Wait for budget to replenish
            continue
        
        batch, cursor = fetch_media_page(brand_id, cursor, limit=25)
        budget.record_call("reserve")
        all_posts.extend(batch)
        
        if not cursor:
            break
    
    # 2. Fetch metrics for each post (rate-limited)
    for post in all_posts:
        if not budget.can_call("reserve"):
            await asyncio.sleep(60)
            continue
        
        post["metrics"] = fetch_post_metrics(post["id"])
        budget.record_call("reserve")
    
    # 3. Rank and categorize
    scored_posts = []
    brand_stats = get_brand_baseline(db, brand_id, days=365)
    for post in all_posts:
        score, _ = compute_toby_score(post["metrics"], brand_stats)
        scored_posts.append({**post, "toby_score": score})
    
    scored_posts.sort(key=lambda p: p["toby_score"], reverse=True)
    
    # 4. Deep analysis of top performers and worst performers
    top_10 = scored_posts[:10]
    bottom_10 = scored_posts[-10:]
    
    analysis = call_deepseek_reasoner(f"""
    Analyze this brand's historical Instagram content performance.
    
    TOP 10 PERFORMING POSTS:
    {format_posts_for_analysis(top_10)}
    
    BOTTOM 10 PERFORMING POSTS:
    {format_posts_for_analysis(bottom_10)}
    
    BRAND CONTEXT:
    Niche: {content_dna.niche_name}
    Tone: {content_dna.content_tone}
    Total posts analyzed: {len(scored_posts)}
    Average score: {mean(p['toby_score'] for p in scored_posts):.1f}
    
    Provide:
    1. What patterns distinguish top performers from bottom performers?
    2. What topics generate the most engagement?
    3. What content formats (carousel, reel, single image) work best?
    4. What posting times correlate with higher engagement?
    5. What hook/title strategies appear in top content?
    6. Specific procedural rules Toby should follow for this brand.
    
    Be specific, reference actual examples, and provide confidence levels.
    """)
    
    # 5. Store as memories
    # Episodic: One entry per analyzed post
    for post in top_10 + bottom_10:
        store_episodic_memory(db, user_id, brand_id, ...)
    
    # Semantic: Insights from the analysis
    insights = parse_insights(analysis)
    for insight in insights:
        store_semantic_memory(db, user_id, insight)
    
    # Procedural: Rules extracted from the analysis
    rules = parse_rules(analysis)
    for rule in rules:
        store_procedural_rule(db, user_id, brand_id, rule)
    
    # 6. Bootstrap Thompson Sampling priors
    # Use historical data to set initial priors instead of uniform
    bootstrap_priors_from_history(db, user_id, brand_id, scored_posts)
    
    log_activity(db, user_id, "historical_mining_complete",
                 f"Analyzed {len(scored_posts)} posts, extracted "
                 f"{len(insights)} insights and {len(rules)} rules")
```

### 11.3 Historical Mining Scheduling

To respect API rate limits, historical mining runs as a background job spread across hours:

```python
# Estimated API calls per mining operation:
# - 1 call per 25 posts (pagination) → 40 posts = 2 calls
# - 1 call per post for metrics → 40 calls
# - Total: ~42 API calls per brand
# - Using "reserve" budget (20 calls/hour) → ~2.1 hours per brand
# - For 5 brands → ~10.5 hours (runs overnight, one-time)
```

---

## 12. Tool Use & External Knowledge

### 12.1 Agent Tool Definitions

Modern AI agents use tools to extend their capabilities. Toby agents are given specific tools they can invoke:

```python
# Tool definitions available to Toby agents

AGENT_TOOLS = {
    "scout": [
        {
            "name": "query_performance",
            "description": "Query Toby's performance database for strategy scores, brand baselines, and post history",
            "parameters": {"dimension": "str", "days_back": "int", "brand_id": "str"},
        },
        {
            "name": "retrieve_memory",
            "description": "Search Toby's memory for relevant past experiences using semantic similarity",
            "parameters": {"query": "str", "memory_type": "str", "k": "int"},
        },
        {
            "name": "get_trending_topics",
            "description": "Get current trending topics from the world model",
            "parameters": {"niche": "str"},
        },
    ],
    "strategist": [
        {
            "name": "thompson_sample",
            "description": "Get Thompson Sampling's statistical recommendation for a dimension",
            "parameters": {"dimension": "str", "options": "list[str]"},
        },
        {
            "name": "get_combination_performance",
            "description": "Look up historical performance of a specific strategy combination",
            "parameters": {"combo": "dict"},
        },
        {
            "name": "create_experiment",
            "description": "Create a new A/B experiment to test a hypothesis",
            "parameters": {"dimension": "str", "options": "list[str]", "hypothesis": "str"},
        },
    ],
    "analyst": [
        {
            "name": "query_metrics",
            "description": "Fetch Instagram metrics for a post",
            "parameters": {"media_id": "str"},
        },
        {
            "name": "compute_baseline",
            "description": "Compute rolling baseline for a brand",
            "parameters": {"brand_id": "str", "days": "int"},
        },
        {
            "name": "detect_anomaly",
            "description": "Check if a score is an anomaly relative to the baseline",
            "parameters": {"score": "float", "baseline_avg": "float", "baseline_std": "float"},
        },
    ],
}
```

### 12.2 ReAct Pattern for Complex Analysis

For deep analysis tasks (anomaly investigation, competitor analysis), Toby uses the ReAct (Reason-Act-Observe) loop:

```python
def react_analysis(agent: str, task: str, tools: list, max_steps: int = 5) -> str:
    """Run a ReAct loop for multi-step analysis tasks.
    
    The LLM reasons about what to do, uses tools to gather data,
    observes results, and repeats until it has enough information
    to form a conclusion.
    """
    messages = [
        {"role": "system", "content": REACT_SYSTEM_PROMPT},
        {"role": "user", "content": task},
    ]
    
    for step in range(max_steps):
        response = call_deepseek_chat(messages, tools=tools)
        
        if response.tool_calls:
            # Agent wants to use a tool
            for tool_call in response.tool_calls:
                result = execute_tool(tool_call)
                messages.append({
                    "role": "tool",
                    "content": json.dumps(result),
                    "tool_call_id": tool_call.id,
                })
        elif response.content and "FINAL ANSWER:" in response.content:
            # Agent has reached a conclusion
            return extract_final_answer(response.content)
        else:
            # Agent is still thinking
            messages.append({"role": "assistant", "content": response.content})
    
    return "Analysis inconclusive after max steps"
```

---

## 13. Adaptive Experimentation Framework

### 13.1 Beyond A/B Testing

Current experiments are simple A/B tests with a fixed `min_samples` threshold. The next-gen system uses **adaptive experimentation** with several improvements:

**Sequential Testing:** Don't wait for all options to reach `min_samples`. Use sequential hypothesis testing to stop experiments early when a winner is statistically clear:

```python
def check_experiment_significance(experiment: dict) -> dict:
    """Check if an experiment has reached statistical significance.
    
    Uses a sequential probability ratio test (SPRT) to detect
    winners as early as possible without inflating false positive rate.
    
    Returns:
        {"significant": bool, "winner": str, "p_value": float, "effect_size": float}
    """
    options = experiment["options"]
    results = experiment["results"]
    
    if len(options) < 2:
        return {"significant": False}
    
    # Get score arrays for each option
    scores = {}
    for option in options:
        opt_data = results.get(option, {})
        scores[option] = opt_data.get("scores", [])
    
    # Need at least 3 samples per option for any test
    if any(len(s) < 3 for s in scores.values()):
        return {"significant": False}
    
    # Pairwise comparison using Welch's t-test between top 2
    sorted_options = sorted(
        scores.keys(),
        key=lambda o: np.mean(scores[o]) if scores[o] else 0,
        reverse=True
    )
    
    a, b = sorted_options[0], sorted_options[1]
    from scipy import stats
    t_stat, p_value = stats.ttest_ind(scores[a], scores[b], equal_var=False)
    
    effect_size = (np.mean(scores[a]) - np.mean(scores[b])) / np.std(scores[a] + scores[b])
    
    return {
        "significant": p_value < 0.05 and effect_size > 0.3,
        "winner": a if np.mean(scores[a]) > np.mean(scores[b]) else b,
        "p_value": round(p_value, 4),
        "effect_size": round(effect_size, 3),
        "samples": {o: len(s) for o, s in scores.items()},
    }
```

### 13.2 Hypothesis-Driven Experiments

Instead of random A/B tests, the Experiment Designer Agent creates experiments with specific hypotheses:

```python
EXPERIMENT_DESIGNER_PROMPT = """Based on the following performance data and insights,
design the next experiment for this brand.

Current top performer: {top_strategy}
Current performance: {performance_summary}
Recent insights: {insights}
Content gaps: {gaps}
Competitor signals: {signals}

Design an experiment with:
1. A clear HYPOTHESIS (what you expect to happen and why)
2. Two options to test
3. The DIMENSION being tested (personality, topic, hook, format, visual)
4. Expected minimum effect size (how much better you expect the winner to be)
5. Recommended sample size per variant

Return JSON: {
    "dimension": "...",
    "options": ["a", "b"],
    "hypothesis": "...",
    "expected_effect_size": 0.0-1.0,
    "recommended_samples": N,
    "rationale": "..."
}"""
```

### 13.3 Multi-Armed Bandit with Contextual Features

Upgrade from basic Thompson Sampling to **contextual bandits** that consider features of the context when selecting arms:

```python
# Features that affect strategy performance:
CONTEXTUAL_FEATURES = [
    "day_of_week",           # Mon=0 ... Sun=6
    "hour_bucket",           # morning/afternoon/evening/night
    "days_since_last_topic", # Content freshness
    "brand_momentum",        # 14d rolling average trend (up/down/flat)
    "recent_competitor_activity", # High/medium/low
    "content_saturation_score",   # How much of this topic recently
]
```

The contextual bandit learns that `provoc` might work great on weekdays but underperform on weekends — something a standard bandit cannot capture.

---

## 14. Cross-Brand Intelligence Network

### 14.1 Knowledge Transfer Between Brands

When a user has multiple brands, intelligence from one should accelerate learning for others:

```python
class CrossBrandIntelligence:
    """Transfer learning between brands under the same user.
    
    Three types of transfer:
    1. Cold-Start: New brand inherits priors from similar existing brand
    2. Universal Rules: Some rules apply across all brands (e.g., "morning posts get more saves")
    3. Negative Transfer Guard: Prevent transferring brand-specific rules that would hurt other brands
    """
    
    def get_transferable_rules(
        self, db: Session, user_id: str,
        source_brand: str, target_brand: str,
    ) -> list[dict]:
        """Find procedural rules from source brand that might help target brand."""
        
        source_rules = (
            db.query(TobyProceduralMemory)
            .filter(
                TobyProceduralMemory.user_id == user_id,
                TobyProceduralMemory.brand_id == source_brand,
                TobyProceduralMemory.is_active == True,
                TobyProceduralMemory.success_rate >= 0.6,
                TobyProceduralMemory.applied_count >= 5,
            )
            .all()
        )
        
        # Filter: only transfer rules that are likely universal
        # (not brand-specific like "use brand X's mascot name")
        transferable = []
        for rule in source_rules:
            if is_brand_agnostic(rule):
                transferable.append({
                    "rule": rule.rule_text,
                    "source_brand": source_brand,
                    "source_success_rate": rule.success_rate,
                    "transfer_confidence": rule.confidence * 0.7,  # Discount for transfer
                })
        
        return transferable
    
    def bootstrap_new_brand(
        self, db: Session, user_id: str,
        new_brand_id: str, similar_brand_id: str,
    ):
        """Bootstrap a new brand's priors from a similar existing brand."""
        
        # Copy Thompson Sampling priors at 50% weight
        source_scores = (
            db.query(TobyStrategyScore)
            .filter(
                TobyStrategyScore.user_id == user_id,
                TobyStrategyScore.brand_id == similar_brand_id,
            )
            .all()
        )
        
        for score in source_scores:
            new_score = TobyStrategyScore(
                user_id=user_id,
                brand_id=new_brand_id,
                content_type=score.content_type,
                dimension=score.dimension,
                option_value=score.option_value,
                # Transfer at 50% weight (uncertainty discount)
                sample_count=max(1, score.sample_count // 2),
                avg_score=score.avg_score,
                score_variance=score.score_variance * 2,  # Increase uncertainty
            )
            db.add(new_score)
        
        db.commit()
```

### 14.2 Niche-Level Intelligence (Future)

When multiple users operate in the same niche, anonymized aggregate intelligence could be shared:

```python
# Future: Cross-user intelligence (requires consent + privacy framework)
# "In the health/wellness niche, these hook strategies perform 40% above average:
#  1. shocking_stat (avg score: 78, 500 samples across 50 brands)
#  2. personal_story (avg score: 74, 350 samples across 45 brands)"
#
# This requires:
# - User consent for anonymized data sharing
# - Differential privacy for aggregated statistics
# - Minimum k-anonymity (50+ brands per niche before sharing)
```

---

## 15. Safety, Rate Limits & Guardrails

### 15.1 Content Safety

```python
CONTENT_GUARDRAILS = {
    "health_claims": {
        "rule": "Never make unverified health claims or suggest medical treatments",
        "check": "LLM review with medical claim detection prompt",
        "action": "KILL if detected — do not revise, completely regenerate",
    },
    "brand_consistency": {
        "rule": "All content must match Content DNA tone and topics",
        "check": "Constitutional critique against Content DNA",
        "action": "REVISE with specific tone correction",
    },
    "platform_compliance": {
        "rule": "Must comply with Instagram content policies",
        "check": "Keyword/pattern blocklist + LLM review",
        "action": "REVISE to remove violating content",
    },
    "originality": {
        "rule": "Content must not closely resemble competitor posts",
        "check": "Embedding similarity against recent competitor content",
        "action": "REVISE if similarity > 0.85",
    },
}
```

### 15.2 API Rate Limit Summary

| API | Limit | Toby's Budget | Enforcement |
|---|---|---|---|
| Meta Graph API — Business Discovery | 200/hour per token | 60/hour (30%) | `APIBudgetManager` |
| Meta Graph API — Media Insights | 200/hour per token | 80/hour (40%) | `APIBudgetManager` |
| Meta Graph API — Hashtag Search | 30 unique/week | Managed via `_hashtag_log` | `APIBudgetManager` |
| DeepSeek Chat | Effectively unlimited | No hard cap | Cost tracking only |
| DeepSeek Reasoner R1 | Effectively unlimited | No hard cap | Cost tracking only |
| deAPI (Image Generation) | Per-plan limits | Existing retry logic | Backoff on 429 |

### 15.3 Cognitive Guardrails

```python
# Prevent infinite revision loops
MAX_REVISIONS_PER_CONTENT = 3

# Prevent the Strategist from always overriding Thompson Sampling
MAX_THOMPSON_OVERRIDE_RATE = 0.30  # Alert if >30% of decisions override TS

# Prevent memory bloat
MAX_EPISODIC_MEMORIES_PER_BRAND = 500   # Prune oldest after limit
MAX_SEMANTIC_MEMORIES_PER_USER = 200
MAX_PROCEDURAL_RULES_PER_BRAND = 50

# Prevent the meta-learner from making drastic changes
MAX_EXPLORE_RATIO_CHANGE_PER_WEEK = 0.15  # Can't change by more than ±15%
MAX_PRIOR_DECAY_PER_WEEK = 0.20           # Can't decay priors by more than 20%

# Prevent excessive API spend
MAX_REASONING_CALLS_PER_HOUR = 30    # R1 reasoner calls
MAX_CRITIC_CALLS_PER_HOUR = 50       # Semantic critique calls
```

### 15.4 Observability & Alerts

```python
ALERT_CONDITIONS = {
    "learning_stagnation": {
        "condition": "exploitation_premium < 3 for 2 consecutive weeks",
        "severity": "warning",
        "description": "Toby's learning is not improving exploit selections over random",
    },
    "content_quality_degradation": {
        "condition": "7-day avg quality_score drops below 65",
        "severity": "warning",
        "description": "Average content quality is declining",
    },
    "api_budget_exhaustion": {
        "condition": "Meta Graph API utilization > 90% for 3 consecutive hours",
        "severity": "info",
        "description": "API budget running low — some scans may be deferred",
    },
    "memory_bloat": {
        "condition": "episodic_memories > 400 for any brand",
        "severity": "info",
        "description": "Memory approaching limit — pruning will occur",
    },
    "thompson_override_high": {
        "condition": "strategist override rate > 30% over last 50 decisions",
        "severity": "warning",
        "description": "Strategist is frequently overriding Thompson Sampling — may indicate stale priors",
    },
}
```

---

## 16. Frontend — The Cognitive Dashboard

### 16.1 "Thinking" UI — Toby's Reasoning Visible

The most impactful UX change: show users Toby's reasoning process in real time.

```
┌─────────────────────────────────────────────────────┐
│ 🧠 Toby is thinking...                              │
│                                                      │
│ ┌─ Scout ─────────────────────────────────────────┐ │
│ │ ✅ Found 3 trending topics, 5 relevant memories  │ │
│ │    "gut microbiome" trending across 3 competitors │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ Strategist ────────────────────────────────────┐ │
│ │ 🔄 Reasoning about strategy...                   │ │
│ │                                                   │ │
│ │ "The 'sleep' topic has been covered 3 times this  │ │
│ │  week — risk of content fatigue. Thompson Sampling │ │
│ │  suggests 'edu_calm × nutrition' but competitor   │ │
│ │  data shows 'gut microbiome' is surging. I'm      │ │
│ │  overriding TS to test 'provoc × gut microbiome'  │ │
│ │  with a 'shocking_stat' hook because this brand's  │ │
│ │  audience responds strongly to counterintuitive    │ │
│ │  health data."                                     │ │
│ │                                                   │ │
│ │ Confidence: 82%  |  Override: Yes (trend signal)  │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ Creator ───────────────────────────────────────┐ │
│ │ ✅ Generated: "Your Gut Has a Second Brain"      │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ Critics ───────────────────────────────────────┐ │
│ │ Rule:     78/100 — structure good, hook strong   │ │
│ │ Semantic: 85/100 — novel angle, credible claims  │ │
│ │ Audience: 82/100 — would stop scrolling, likely  │ │
│ │                     to save                      │ │
│ │ ─────────────────────────────────────────────── │ │
│ │ ENSEMBLE: 82/100 → ✅ ACCEPTED                   │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ Publisher ─────────────────────────────────────┐ │
│ │ ✅ Scheduled for Thursday 10:00 AM               │ │
│ └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 16.2 Memory Explorer

A new tab showing Toby's semantic memory:

```
┌──────────────────────────────────────────────────────┐
│ 🧠 Toby's Memory  [Episodic] [Semantic] [Procedural]│
│                                                       │
│ SEMANTIC INSIGHTS (sorted by confidence)              │
│                                                       │
│ ┌─ 96% confidence ──────────────────────────────────┐│
│ │ "Sleep content + provocative tone = 2x engagement  ││
│ │  for Brand X because it challenges common beliefs, ││
│ │  which drives saves and shares."                   ││
│ │  📊 Confirmed 8 times | Contradicted 0 times      ││
│ └────────────────────────────────────────────────────┘│
│                                                       │
│ ┌─ 78% confidence ──────────────────────────────────┐│
│ │ "Morning posts (before 9 AM) get 40% more saves   ││
│ │  than afternoon posts for health content."          ││
│ │  📊 Confirmed 5 times | Contradicted 1 time        ││
│ └────────────────────────────────────────────────────┘│
│                                                       │
│ PROCEDURAL RULES (active)                             │
│                                                       │
│ ┌─ Success rate: 85% ──────────────────────────────┐ │
│ │ "When sleep + health audience → use provoc +      │ │
│ │  shocking_stat + dark_cinematic"                   │ │
│ │  Applied 20 times | Success 17 | Failure 3        │ │
│ └────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

### 16.3 Meta-Learning Dashboard

Show users Toby's self-assessment:

```
┌──────────────────────────────────────────────────────┐
│ 📈 Toby's Self-Assessment (Weekly Report)            │
│                                                       │
│ Learning Effectiveness: ████████░░ 78%                │
│ "My exploit choices outscore random by 12 points"     │
│                                                       │
│ Prediction Accuracy: ██████░░░░ 62%                   │
│ "My predictions are off by an average of 15 points"   │
│                                                       │
│ Week-over-Week Improvement: ▲ +3.2%                   │
│ "Content is performing better each week"              │
│                                                       │
│ Actions Taken This Week:                              │
│ • Increased exploration for 'hook' dimension (was     │
│   stuck in local optimum with 'question')             │
│ • Deactivated rule "always use dark_cinematic on      │
│   weekends" (success rate dropped to 35%)             │
│ • Consolidated 12 episodic memories into 3 semantic   │
│   insights                                            │
└──────────────────────────────────────────────────────┘
```

---

## 17. Database Schema Extensions

### 17.1 New Tables Summary

| Table | Purpose | Key Columns |
|---|---|---|
| `toby_episodic_memory` | Record of each content creation event | strategy, quality_score, toby_score, embedding |
| `toby_semantic_memory` | Generalized insights extracted from episodes | insight, confidence, confirmed_count, embedding |
| `toby_procedural_memory` | Concrete action rules | rule_text, conditions, success_rate, is_active |
| `toby_world_model` | Environmental signals (trends, competitors, platform) | signal_type, signal_data, expires_at, embedding |
| `toby_strategy_combos` | Performance tracking of full strategy combinations | combo_key, avg_quality, avg_toby_score |
| `toby_raw_signals` | Unprocessed intelligence from APIs/web | source, raw_data, processed |
| `toby_meta_reports` | Weekly meta-learning evaluation reports | exploitation_premium, calibration_error, velocity |
| `toby_reasoning_traces` | Strategist chain-of-thought transcripts | reasoning_content, decision, model |

### 17.2 Extensions to Existing Tables

```sql
-- Extend toby_state with new cognitive loop timing
ALTER TABLE toby_state ADD COLUMN last_deliberation_at TIMESTAMPTZ;
ALTER TABLE toby_state ADD COLUMN last_meta_cognition_at TIMESTAMPTZ;
ALTER TABLE toby_state ADD COLUMN last_intelligence_at TIMESTAMPTZ;
ALTER TABLE toby_state ADD COLUMN meta_explore_ratio_adjustment FLOAT DEFAULT 0;
ALTER TABLE toby_state ADD COLUMN historical_mining_complete BOOLEAN DEFAULT FALSE;

-- Extend toby_content_tags with immediate quality signal
ALTER TABLE toby_content_tags ADD COLUMN quality_score FLOAT;
ALTER TABLE toby_content_tags ADD COLUMN critic_scores JSONB;
ALTER TABLE toby_content_tags ADD COLUMN strategy_rationale TEXT;
ALTER TABLE toby_content_tags ADD COLUMN thompson_override BOOLEAN DEFAULT FALSE;

-- Extend toby_experiments with hypothesis tracking
ALTER TABLE toby_experiments ADD COLUMN hypothesis TEXT;
ALTER TABLE toby_experiments ADD COLUMN expected_effect_size FLOAT;
ALTER TABLE toby_experiments ADD COLUMN achieved_significance BOOLEAN;
ALTER TABLE toby_experiments ADD COLUMN p_value FLOAT;
```

### 17.3 pgvector Requirement

The memory architecture requires the `pgvector` extension for semantic search:

```sql
-- Enable pgvector (must be done by Supabase superuser or via dashboard)
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify
SELECT * FROM pg_extension WHERE extname = 'vector';
```

Supabase provides pgvector out of the box. No infrastructure changes needed.

---

## 18. Migration Path from Current Architecture

### 18.1 Guiding Principle: Incremental Enhancement, Not Rewrite

Every phase must:
1. Be deployable independently
2. Not break existing functionality
3. Show measurable improvement before proceeding

### 18.2 File-Level Changes

```
CURRENT FILE                    → NEXT-GEN CHANGE
────────────────────────────────────────────────────────────────
app/services/toby/
├── orchestrator.py             → Refactored: calls StateGraph instead of linear pipeline
├── learning_engine.py          → Enhanced: Thompson Sampling + immediate signal + combos
├── analysis_engine.py          → Enhanced: anomaly detection + causal attribution
├── state.py                    → Extended: new timing columns + meta-cognition state
├── buffer_manager.py           → Unchanged (stable)
├── content_planner.py          → Mostly unchanged (Scout replaces context gathering)
├── discovery_manager.py        → Refactored into Intelligence Pipeline
├── seed_discovery.py           → Unchanged (stable)
│
├── agents/                     → NEW DIRECTORY
│   ├── __init__.py
│   ├── scout.py                → NEW: Environment + memory gathering
│   ├── strategist.py           → NEW: R1 chain-of-thought strategy
│   ├── creator.py              → NEW: Memory-augmented generation
│   ├── critic.py               → NEW: Multi-critic ensemble
│   ├── publisher.py            → NEW: Wrapper around existing media pipeline
│   ├── reflector.py            → NEW: Triple memory writer
│   ├── analyst.py              → NEW: Enhanced scoring + anomaly detection
│   ├── pattern_analyzer.py     → NEW: Daily deliberation loop
│   ├── experiment_designer.py  → NEW: Hypothesis-driven experiments
│   ├── meta_learner.py         → NEW: Weekly self-evaluation
│   └── intelligence.py         → NEW: Continuous intelligence gathering
│
├── memory/                     → NEW DIRECTORY
│   ├── __init__.py
│   ├── episodic.py             → NEW: Episodic memory CRUD + retrieval
│   ├── semantic.py             → NEW: Semantic memory CRUD + retrieval
│   ├── procedural.py           → NEW: Procedural rules CRUD + validation
│   ├── world_model.py          → NEW: World model updates + queries
│   ├── embeddings.py           → NEW: Embedding generation + caching
│   └── gardener.py             → NEW: Memory consolidation + pruning
│
├── graph.py                    → NEW: StateGraph definition + routing
├── budget_manager.py           → NEW: API rate limit management
└── historical_miner.py         → NEW: Historical content analysis
```

### 18.3 Migration Order

The key insight: **each phase adds a new capability without modifying the critical path**. The StateGraph starts as a wrapper around the existing pipeline, then gradually replaces it.

---

## 19. Implementation Phases

### Phase 1: Memory Foundation (2 weeks)

**Goal:** Add semantic memory infrastructure without changing any generation logic.

- [ ] Enable pgvector in Supabase
- [ ] Create `toby_episodic_memory`, `toby_semantic_memory`, `toby_procedural_memory` tables
- [ ] Implement embedding generation using DeepSeek or OpenAI embeddings API
- [ ] Implement memory CRUD (store, retrieve, update)
- [ ] Add Reflector Agent: runs after every successful content generation, writes episodic + semantic memories
- [ ] Wire Reflector into existing `_execute_content_plan()` (append step 9)
- [ ] Add Memory Explorer tab to frontend (read-only)

**Verification:** After 1 week of operation, check that memories are being written and semantic search returns relevant results.

### Phase 2: Enhanced Critics (1 week)

**Goal:** Add AI semantic critique without removing existing quality scorer.

- [ ] Implement Critic Agent with two-layer evaluation (rule + semantic)
- [ ] Implement Audience Simulator critique
- [ ] Replace existing 3-attempt quality loop with multi-critic ensemble
- [ ] Feed immediate quality signal to Thompson Sampling
- [ ] Add quality score to `toby_content_tags`

**Verification:** Compare average quality scores before/after. Track revision rates.

### Phase 3: True Thompson Sampling (1 week)

**Goal:** Replace epsilon-greedy with proper Bayesian Thompson Sampling.

- [ ] Implement Beta distribution sampling in `learning_engine.py`
- [ ] Add combination-level tracking (`toby_strategy_combos` table)
- [ ] Remove hardcoded `explore_ratio` — let Thompson Sampling handle exploration naturally
- [ ] Implement per-brand priors (H5 fix for real this time)

**Verification:** A/B test Thompson Sampling against epsilon-greedy for 2 weeks. Compare average Toby scores.

### Phase 4: Chain-of-Thought Strategist (2 weeks)

**Goal:** Add DeepSeek Reasoner R1 for strategy reasoning.

- [ ] Implement Strategist Agent with R1 integration
- [ ] Build strategy context template
- [ ] Store reasoning traces for observability
- [ ] Add "Thinking" UI to frontend (shows reasoning chain)
- [ ] Wire Strategist into generation flow (replaces `choose_strategy()` in exploit mode)
- [ ] Implement Thompson override tracking

**Verification:** Compare exploit-mode strategy performance before/after R1 integration.

### Phase 5: StateGraph (1 week)

**Goal:** Formalize the agent pipeline as a StateGraph.

- [ ] Implement `AgentState` dataclass
- [ ] Implement `build_toby_graph()` with conditional routing
- [ ] Refactor `_execute_content_plan()` to use graph.invoke()
- [ ] Add execution trace storage and display

**Verification:** All existing tests pass. Content generation produces equivalent output.

### Phase 6: Cognitive Loops 2-4 (2 weeks)

**Goal:** Add the analytical, deliberative, and meta-cognitive loops.

- [ ] Implement Analyst Agent with anomaly detection
- [ ] Implement daily deliberation loop (Pattern Analyzer + Experiment Designer)
- [ ] Implement weekly meta-cognitive loop (Meta-Learner)
- [ ] Add `toby_meta_reports` table
- [ ] Add Meta-Learning Dashboard to frontend

**Verification:** Weekly meta-reports show positive learning effectiveness. Deliberation loop suggests and creates meaningful experiments.

### Phase 7: Intelligence Pipeline (2 weeks)

**Goal:** Continuous intelligence gathering from APIs and web.

- [ ] Implement `APIBudgetManager` for Meta Graph API rate limits
- [ ] Refactor `discovery_manager.py` into intelligence pipeline
- [ ] Add `toby_world_model` and `toby_raw_signals` tables
- [ ] Implement Intelligence Processor (synthesizes raw signals into actionable intelligence)
- [ ] Wire intelligence into Scout Agent's world model queries
- [ ] Add competitor deep analysis with LLM

**Verification:** World model is populated. Scout Agent receives relevant trend and competitor signals.

### Phase 8: Historical Mining (1 week)

**Goal:** Bootstrap brand knowledge from historical content.

- [ ] Implement `mine_historical_content()` 
- [ ] Rate-limited API fetching spread across hours
- [ ] LLM analysis of top/bottom performers
- [ ] Automatic memory generation from historical data
- [ ] Thompson Sampling prior bootstrapping from historical patterns
- [ ] Trigger on first Toby enable or manual request

**Verification:** New brand with 100+ historical posts has populated memory and non-uniform priors after mining.

### Phase 9: Cross-Brand Intelligence (1 week)

**Goal:** Brands learning from each other within the same user.

- [ ] Implement `CrossBrandIntelligence` service
- [ ] Cold-start prior transfer with uncertainty discount
- [ ] Transferable rule identification and sharing
- [ ] Negative transfer guards

**Verification:** New brand under an existing user starts with informed priors instead of uniform.

### Phase 10: Adaptive Experimentation (1 week)

**Goal:** Statistical rigor in experiment design and evaluation.

- [ ] Implement sequential hypothesis testing (SPRT)
- [ ] Implement hypothesis-driven experiment creation
- [ ] Add contextual features to bandit selection
- [ ] Implement experiment auto-design from deliberation loop

**Verification:** Experiments converge faster. Experiment designer proposes reasonable hypotheses.

---

## 20. Risk Assessment

### 20.1 Technical Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| pgvector queries too slow | Medium | Low | IVFFlat indexes; limit k in retrieval; monitor p99 latency |
| R1 reasoning inconsistent | High | Medium | Thompson Sampling is always the fallback; R1 is advisory unless confidence > 0.8 |
| Memory bloat degrades search quality | Medium | Medium | Memory gardener with strict caps; periodic consolidation |
| Over-reliance on LLM judgment | High | Low | All LLM decisions have statistical fallbacks; meta-learner monitors override rates |
| Historical mining exceeds API budget | Medium | Low | Spread across hours using reserve budget; pausable/resumable |
| Critic feedback loops (AI critiquing AI) | Medium | Medium | Rule-based layer as independent check; constitutional constraints |
| Meta-learner makes destructive changes | High | Low | Max change limits per week; all adjustments logged and reversible |

### 20.2 Product Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| "Thinking" UI is confusing to non-technical users | Medium | Medium | Progressive disclosure: summary by default, detail on click |
| Memory explorer reveals "stupid" memories | Low | High | AI-generated memories may occasionally be wrong; show confidence scores |
| Users expect perfection after seeing reasoning | High | Medium | Set expectations: Toby explains its reasoning but is still learning |
| Over-personalization reduces content diversity | Medium | Medium | Minimum exploration enforced by Thompson Sampling + diversity constraints |

### 20.3 Critical Success Metrics

| Metric | Measurement | Target |
|---|---|---|
| **Exploitation Premium** | Avg score (exploit) − avg score (explore) | > 10 points after 30 days |
| **Content Quality** | Average critic ensemble score | > 80/100 |
| **Learning Velocity** | Week-over-week average Toby Score improvement | > 1% per week for first 3 months |
| **Prediction Accuracy** | MAE between Thompson prior and actual score | < 20 points |
| **Memory Utility** | % of generations that use at least 1 memory | > 70% |
| **Experiment Efficiency** | Avg samples to reach significance | < 15 per variant |
| **Meta-Learning Health** | Exploitation premium sustains > 5 for 4 consecutive weeks | Achieved |

---

## 21. Multi-User Scalability — One Toby Per User

### 21.1 Design Principle: Every User Gets Their Own Toby

Toby is **not** a shared singleton. Every user in the system has their own independent Toby instance — their own state, their own learning history, their own strategies, their own experiments, their own memories. Two users in completely different niches (e.g., fitness vs. finance) will have two Tobys that learn, adapt, and evolve independently, each becoming an expert in its user's specific domain.

This is already the foundational design in the current codebase:

```python
# orchestrator.py — toby_tick()
enabled_states = db.query(TobyState).filter(TobyState.enabled == True).all()
for state in enabled_states:
    _process_user(db, state)  # Each user processed independently
```

Every table in the Toby system is keyed by `user_id`:
- `toby_state.user_id` — one row per user, stores phase, explore ratio, slot config, scheduling timestamps
- `toby_experiments.user_id` — experiments are scoped per user
- `toby_strategy_scores.user_id` — Thompson Sampling priors are per user (and per brand)
- `toby_content_tags.user_id` — content metadata is per user
- `toby_activity_log.user_id` — all activity is logged per user

**There is no shared state between users.** User A's Thompson Sampling priors never leak into User B's decisions. User A's memory never contaminates User B's reasoning. User A's experiments never affect User B's strategy selection.

### 21.2 Multi-Brand Per User

Each user can own **multiple brands**, and each brand operates as an independent content stream:

```
User "alice"
├── Brand "healthycollege" (fitness niche, Instagram @thehealthycollege)
├── Brand "moneyminds" (finance niche, Instagram @moneyminds)
└── Brand "cozyrecipes" (cooking niche, Instagram @cozyrecipes)
```

The `brands` table ties brands to users via `brands.user_id`. Every brand has its own:
- **NicheConfig** (`niche_config.user_id`) — niche name, target audience, content tone, topic categories, visual style, CTAs, hashtags, competitor accounts, discovery hashtags. Every field is user-defined, not hardcoded. The user fills in everything; Toby respects it.
- **Colors & visual identity** (`brands.colors`) — primary, accent, text, light/dark mode palettes
- **Social credentials** (`brands.instagram_access_token`, `brands.meta_access_token`, etc.)
- **Scheduling config** (`brands.schedule_offset`, `brands.posts_per_day`)
- **Strategy scores** — Thompson Sampling priors are tracked per `(user_id, brand_id, content_type, dimension, option)`. A strategy that works for fitness won't be blindly applied to finance.
- **Content buffer** — scheduled posts are per brand, buffer health is checked per brand
- **Experiments** — A/B tests run independently per brand

### 21.3 Niche Adaptation — Toby Learns Each Brand's Language

When Toby generates content for a brand, it reads that brand's `NicheConfig` to understand:

| NicheConfig Field | What Toby Learns |
|---|---|
| `niche_name` + `niche_description` | The domain Toby operates in for this brand |
| `content_brief` | High-level editorial direction |
| `target_audience` + `audience_description` | Who Toby is speaking to |
| `content_tone` + `tone_avoid` | The voice Toby uses (and avoids) |
| `topic_categories` + `topic_keywords` | What Toby talks about |
| `topic_avoid` | What Toby never mentions |
| `content_philosophy` | The brand's editorial worldview |
| `hook_themes` | Proven attention-grabbing angles |
| `reel_examples` + `post_examples` | Few-shot examples for style calibration |
| `image_style_description` + `image_palette_keywords` | Visual generation guidance |
| `brand_personality` + `brand_focus_areas` | The brand's character |
| `cta_options` + `carousel_cta_options` | Call-to-action templates |
| `competitor_accounts` + `discovery_hashtags` | Who to watch and what trends to track |
| `citation_style` + `citation_source_types` | Academic vs. data vs. quote sourcing |

This means two brands owned by the same user can have **completely different** Tobys in practice — different tones, different topics, different visual styles, different strategies. The fitness brand's Toby is bold and urgent ("STOP eating this TODAY"); the finance brand's Toby is calm and data-driven ("Studies show that 73% of investors...").

### 21.4 Everything Is Changeable — Hot-Reload Architecture

A key design principle: **nothing is permanent, everything is configurable, and changes take effect immediately.**

| What Can Change | How It Changes | When It Takes Effect |
|---|---|---|
| User enables/disables Toby | `TobyState.enabled` toggle | Next tick (5 minutes) |
| User changes phase | `TobyState.phase` update | Next tick |
| User adjusts explore ratio | `TobyState.explore_ratio` | Next strategy selection |
| User modifies slots per day | `TobyState.reel_slots_per_day`, `post_slots_per_day` | Next buffer check |
| User adds a new brand | New `Brand` row + new `NicheConfig` row | Next tick picks it up automatically |
| User deletes a brand | `Brand.active = False` | Next tick skips it |
| User changes niche config | Any field in `NicheConfig` | Next content generation reads fresh config |
| User updates brand colors | `Brand.colors` JSON | Next content generation uses new palette |
| User rotates API credentials | `Brand.instagram_access_token` etc. | Next publish uses new credentials |
| User changes CTAs | `NicheConfig.cta_options` | Next content generation uses updated CTAs |
| User adds competitor accounts | `NicheConfig.competitor_accounts` | Next discovery scan includes them |

There are no caches that hold stale NicheConfig. Every generation reads the current database state. This is by design — Toby is always working with the latest instructions from the user.

### 21.5 Cross-Brand Cold-Start Intelligence

When a user adds a **new brand**, that brand has zero performance data. Toby handles this through the **cross-brand cold-start fallback** (Phase C in the learning engine):

```python
# learning_engine.py
COLD_START_THRESHOLD = 10

# If brand has fewer than 10 scored pieces, borrow aggregated
# priors from all of the user's other brands
if brand_sample_count < COLD_START_THRESHOLD:
    # Use cross-brand aggregate as prior
    ...
```

This means a user who already has a successful fitness brand doesn't start from absolute zero when they launch a finance brand — Toby borrows broad structural insights (e.g., "question hooks outperform bold claims for this user's audience") while keeping niche-specific content completely independent.

In v3.0 with the Cross-Brand Intelligence Network (Section 14), this becomes even smarter — Toby can identify which structural patterns transfer across niches and which don't:
- **Transfers:** Posting time preferences, CTA effectiveness, engagement patterns by day-of-week
- **Doesn't transfer:** Topic specifics, tone, visual style, audience demographics

### 21.6 Scaling: 1 → 10 → 100 → 1,000 Users

The architecture scales cleanly because of per-user isolation:

| Scale | Architecture | Rate Limiting |
|---|---|---|
| **1–10 users** | Single `toby_tick()` loop, sequential processing | Current: 2 gens/brand/hour, 6 gens/user/hour |
| **10–50 users** | Parallel user processing within tick (`concurrent.futures`) | Already implemented for bootstrap mode |
| **50–200 users** | Worker pool with user queue; each worker claims N users per tick | Add Redis-based user lock to prevent double-processing |
| **200–1,000 users** | Dedicated background workers per tier (free vs. premium); Railway horizontal scale | Premium users get dedicated workers; free users share pool |
| **1,000+ users** | Separate orchestrator service; event-driven via message queue | Per-shard user partitioning; Supabase connection pooling via PgBouncer |

**Current bottleneck:** DeepSeek API rate limits, not database or CPU. Each content generation requires 1–3 LLM calls. At current rates (10 req/min for DeepSeek), the practical ceiling is ~200 generations per hour across all users.

### 21.7 User Isolation Guarantees

| Guarantee | Implementation |
|---|---|
| **Data isolation** | All queries filter by `user_id`; no table scan returns cross-user data |
| **Learning isolation** | Thompson Sampling priors, experiments, strategy scores all keyed by `(user_id, brand_id)` |
| **Memory isolation** | Semantic memory (v3.0) will be keyed by `user_id`; pgvector searches always include `WHERE user_id = :uid` |
| **Rate limit isolation** | Generation rate limits tracked per `"user_id:brand_id"` key; one user can't starve another |
| **Error isolation** | Each `_process_user()` is wrapped in try/except; one user's failure can't crash others |
| **Scheduling isolation** | Buffer checks, metrics checks, analysis runs independently per user |
| **Activity log isolation** | All `TobyActivityLog` entries are per user; the dashboard only shows your own Toby's thoughts |

### 21.8 Dynamic User Lifecycle

```
User signs up
  → Creates first Brand (fills NicheConfig)
  → Connects Instagram (OAuth flow stores access_token)
  → Enables Toby (TobyState.enabled = True)
  → Toby enters "bootstrap" phase
  → Toby fills 2-day buffer aggressively (6 gens/brand/hour)
  → After buffer is healthy, transitions to "learning" phase
  → After enough data, transitions to "optimizing" phase
  
User adds second brand
  → Creates new Brand + NicheConfig
  → Cold-start fallback borrows priors from first brand
  → Second brand runs independently with its own learning curve
  
User pauses Toby
  → TobyState.enabled = False
  → Next tick skips this user entirely
  → All state is preserved — resume picks up exactly where it left off
  
User deletes a brand
  → Brand.active = False
  → Toby stops generating for that brand
  → Historical data preserved for cross-brand intelligence
  
User changes niche
  → Updates NicheConfig fields
  → Optionally resets strategy scores (or lets them adapt naturally)
  → Toby immediately generates content in the new direction
```

### 21.9 Toby Is Prepared for Change

The architecture is built on the assumption that **everything will change**. Users will:
- Switch niches mid-month
- Add brands in new languages
- Remove brands that aren't working
- Change their visual style overnight
- Pivot their content strategy after seeing competitor success
- Modify their posting frequency based on their schedule

Toby handles all of this because:
1. **No hardcoded assumptions** — everything comes from NicheConfig and Brand tables, which are user-editable
2. **Stateless generation** — each generation reads fresh config from the database; there's no cached "plan" that goes stale
3. **Adaptive learning** — Thompson Sampling naturally adapts to new data; if the niche changes, the priors will shift within a few weeks
4. **Phase awareness** — if a drastic change happens (e.g., niche pivot), Toby can be reset to "bootstrap" phase to re-learn faster
5. **Drift detection** — the analysis engine (Section 9) detects when performance patterns shift, triggering re-evaluation even without user intervention

---

## 22. Toby's Access Boundaries & Operational Sandbox

### 22.1 The Critical Distinction: Toby vs. The Engineer

**Toby is NOT an infrastructure admin.** This is a non-negotiable architectural principle.

There are two completely separate roles in this system:

| | **Toby** (Autonomous Agent) | **The Engineer** (Human / AI Developer) |
|---|---|---|
| **What it is** | An AI agent that generates content, selects strategies, learns from metrics, and optimizes for viral growth | The human developer (or AI assistant) that builds, deploys, and maintains the platform |
| **Database access** | Read/write through SQLAlchemy ORM, scoped to content-related tables | Full Supabase admin access — migrations, RLS policies, SQL console, schema changes |
| **Infrastructure access** | None. Zero. Toby has no concept of "Railway" or "Docker" | Full Railway access — deployments, env vars, health checks, scaling, logs |
| **Migration access** | Toby cannot alter schema, create tables, or modify indexes | Runs `alembic` migrations, manual SQL scripts, schema evolution |
| **Script execution** | Toby cannot run arbitrary scripts on the server | Runs `scripts/*.py` for data migrations, backfills, repairs |
| **User data** | Read-only access to user preferences via NicheConfig; can create content, schedule posts | Full CRUD on all tables; can reset users, fix corrupted data, manage credentials |
| **Failure mode** | Toby fails? Content generation pauses. Data is safe. | Engineer makes a mistake? Potential data loss. That's why engineers are careful. |

### 22.2 Why Toby Must Never Have Admin Access

Toby is an **autonomous agent** that makes hundreds of decisions per hour across all users. It runs on a 5-minute tick, processes multiple users and brands, generates content, selects strategies, and learns continuously. It is, by design, a system that acts independently.

**Giving an autonomous agent admin access to delete users, drop tables, or modify infrastructure is reckless.** Consider the failure scenarios:

| Scenario | What Could Happen | Why It's Unacceptable |
|---|---|---|
| Toby's LLM hallucinates a "cleanup" action | Deletes user data it considers "stale" | Permanent data loss for real users |
| Toby decides a table schema is suboptimal | Attempts ALTER TABLE in production | Breaks all running queries, potential downtime |
| Toby's retry logic enters a loop | Repeatedly creates resources, fills storage | Cost explosion, service degradation |
| Toby misinterprets a poor-performing brand | Deletes the brand's content history | Destroys irreplaceable learning data |
| Prompt injection via user-supplied NicheConfig | Toby executes embedded SQL/commands | Full database compromise |

**The rule is simple:** Toby operates inside a sandbox. The sandbox gives it everything it needs to do its job — generate content, learn from metrics, run experiments — and nothing more.

### 22.3 Toby's Allowed Operations (The Sandbox)

Toby has a clearly defined set of operations it CAN perform:

**Content Operations (Read/Write):**
- Create `ScheduledPost` entries (generate and schedule content)
- Create `ContentPlan` entries (plan future content)
- Read `Brand`, `NicheConfig` to understand what to generate
- Read `PostPerformance` to learn from past results
- Write `TobyContentTag` entries (tag content with strategy metadata)

**Learning Operations (Read/Write):**
- Read/write `TobyStrategyScore` (update Thompson Sampling priors)
- Read/write `TobyExperiment` (create and resolve A/B tests)
- Read `PostPerformance` aggregate metrics for scoring
- Compute Toby Score via the analysis engine

**State Operations (Read/Write, self-scoped):**
- Read/write own `TobyState` (update timestamps, phase transitions)
- Write `TobyActivityLog` (log decisions and reasoning)

**Discovery Operations (Read-Only + External):**
- Read `NicheConfig.competitor_accounts` and `discovery_hashtags`
- Call external APIs for trend data (Instagram Graph API — read-only)
- Store discovered trends in memory/content tags

**Publishing Operations (Write via API):**
- Call Instagram Graph API to publish scheduled content
- Call Supabase Storage to upload generated media files

### 22.4 Toby's Forbidden Operations (The Walls)

Toby CANNOT and MUST NEVER:

| Forbidden Operation | Why |
|---|---|
| Execute raw SQL | All database access goes through ORM models with parameterized queries |
| ALTER/DROP/CREATE tables | Schema changes are the engineer's job, done via migration scripts |
| Delete users or brands | Only users (via UI) or engineers can delete accounts |
| Modify authentication data | Toby cannot touch `users`, `auth_tokens`, or OAuth credentials |
| Access other users' data | All queries are scoped by `user_id`; there is no "superuser" mode |
| Run shell commands | Toby has no subprocess access; it's a Python function called by APScheduler |
| Modify environment variables | Toby reads config through `app.core.config`, never writes to it |
| Deploy code or restart services | Toby is code that runs on Railway; it cannot modify its own deployment |
| Make financial transactions | Even with future billing, Toby tracks usage but never charges users |
| Bypass rate limits | Rate limits are enforced in the orchestrator, above Toby's decision layer |

### 22.5 The Engineer's Domain — Full Infrastructure Access

The **engineer** (human developer or AI coding assistant implementing Toby) has full access to:

**Supabase (PostgreSQL):**
- SQL Console for ad-hoc queries and debugging
- Schema management — creating/altering tables, indexes, constraints
- RLS (Row Level Security) policies — defining access rules
- Supabase Storage — managing buckets, policies, file lifecycle
- Database backups and point-in-time recovery
- Connection pooling configuration (PgBouncer)
- Edge Functions (if needed for webhooks or realtime)

**Railway (Deployment):**
- Docker deployment configuration (`Dockerfile`, `railway.json`)
- Environment variables (API keys, database URLs, feature flags)
- Health checks and restart policies
- Horizontal scaling and resource allocation
- Build and deployment logs
- Cron jobs and scheduled tasks configuration

**Migration & Script Tooling:**
- `scripts/validate_api.py` — import and endpoint validation
- `scripts/migrate_*.py` — data migration scripts
- `scripts/populate_niche_config.py` — default configuration seeding
- `migrations/*.sql` — SQL migration files
- Manual SQL scripts for data repair and backfill

**Monitoring & Debugging:**
- Full application logs (Railway dashboard)
- Database query performance (Supabase dashboard)
- APScheduler job monitoring
- Error tracking and alerting

### 22.6 Architectural Enforcement

The sandbox isn't just a policy document — it's enforced at the code level:

```
Toby's Call Stack:
  APScheduler → toby_tick() → _process_user() → [buffer/metrics/analysis/discovery]
                                                        ↓
                                                  SQLAlchemy ORM only
                                                  (no raw SQL, no subprocess)
                                                        ↓
                                                  Specific model classes
                                                  (TobyState, TobyExperiment, etc.)
                                                        ↓
                                                  External APIs via safe wrappers
                                                  (Instagram Graph API, DeepSeek)
```

Toby's code lives entirely within `app/services/toby/`. It has no imports from `os`, `subprocess`, `shutil`, or any system-level module. It accesses the database exclusively through SQLAlchemy model classes. It calls external APIs through dedicated service wrappers that handle auth, rate limiting, and error recovery.

**If Toby needs something it can't do — a new table, a schema change, a data backfill — it logs the need in `TobyActivityLog`, and the engineer handles it.**

### 22.7 Future: Toby Requesting Infrastructure Changes

In the v3.0 cognitive architecture, Toby may identify that it needs schema changes to improve (e.g., "I need a new column to track audience sentiment over time"). The correct flow is:

```
Toby identifies a need
  → Logs a structured request in TobyActivityLog:
    {
      "action": "infrastructure_request",
      "request_type": "schema_change",
      "description": "Need sentiment_trend column on toby_strategy_scores",
      "reasoning": "Current schema can't track sentiment drift, limiting learning",
      "priority": "medium"
    }
  → Engineer reviews the request
  → Engineer implements the migration
  → Engineer deploys
  → Toby detects the new column and starts using it
```

Toby **proposes**. The engineer **decides and executes**. This is the fundamental boundary, and it will never change.

---

## 23. The North Star — Viral Growth at All Costs (Within the Niche)

### 23.1 Toby's Prime Directive

Every cognitive loop, every strategy decision, every experiment, every line of reasoning in Toby's architecture serves one singular, overriding objective:

> **Make the user's accounts go viral. Maximize followers. Maximize views. In the shortest time possible. Always within the user's niche.**

This is not a secondary goal. This is not one of many objectives. This is **THE** objective. Everything else — learning, memory, experiments, discovery, quality scoring, cross-brand intelligence — exists only because it serves this goal.

### 23.2 The Three Pillars of Viral Growth

Toby optimizes across three tightly coupled dimensions:

```
                    ┌─────────────────┐
                    │   VIRAL GROWTH  │
                    │   (North Star)  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
        │  MAXIMIZE  │ │  MAXIMIZE  │ │  MINIMIZE  │
        │  FOLLOWERS │ │   VIEWS    │ │    TIME    │
        └─────┬─────┘ └─────┴─────┘ └─────┬─────┘
              │              │              │
              │    Viral Coefficient > 1    │
              └──────────────┴──────────────┘
```

**Pillar 1 — Maximize Followers:**
- Every piece of content should attract new followers, not just views
- CTAs are optimized for follow actions ("Follow for more [niche] content")
- Profile visit → follow conversion is a key tracking metric
- Content variety ensures the profile grid appeals to new visitors
- Bio optimization suggestions (future) based on what converts

**Pillar 2 — Maximize Views:**
- Hook optimization is the #1 lever — the first 1-3 seconds (reels) or first slide (carousels) determine everything
- Share rate is the viral multiplier — content that gets shared reaches non-followers
- Save rate indicates evergreen value — saved content resurfaces in recommendations
- Watch time (reels) and swipe-through rate (carousels) signal quality to the algorithm
- Posting time optimization — reach the audience when they're most active

**Pillar 3 — Minimize Time to Virality:**
- Aggressive experimentation in bootstrap phase — try many strategies fast
- Rapid learning — short feedback loops, quick strategy adaptation
- Bootstrap mode: 6 gens/brand/hour to fill the buffer and start collecting data immediately
- Phase transitions triggered by data readiness, not calendar time
- No wasted generations — every piece of content is an experiment that teaches something

### 23.3 How Every Component Serves the North Star

| Component | How It Serves Viral Growth |
|---|---|
| **Thompson Sampling** | Converges on the highest-performing strategies faster than uniform exploration; exploitation premium directly translates to more views |
| **Multi-Critic Ensemble** | Catches low-quality content before it wastes a posting slot; every published piece meets a quality bar |
| **Semantic Memory** | Remembers what worked and why; "This hook pattern got 3x average views for fitness brands" — reuse it |
| **Chain-of-Thought Strategy** | DeepSeek R1 reasons about *why* certain content went viral, not just that it did; enables intentional viral content creation |
| **Discovery / TrendScout** | Spots trending topics before competitors; first-mover advantage on viral trends is enormous |
| **Cross-Brand Intelligence** | Transfers structural insights (timing, format, CTA positioning) from successful brands to new ones; faster ramp-up |
| **Drift Detection** | Catches algorithm changes or audience shifts early; adapts before performance degrades |
| **Retroactive Learning** | Mines historical winners to build an instant playbook; no cold-start performance gap |
| **Meta-Learning** | Ensures the learning system itself is improving; prevents stagnation in local optima |
| **Adaptive Experiments** | Bayesian A/B testing finds winners with fewer samples; faster strategy convergence = faster growth |
| **Buffer Management** | Ensures consistent posting cadence; algorithm rewards consistency over sporadic bursts |

### 23.4 Key Performance Indicators — The Viral Growth Scorecard

Toby tracks these metrics relentlessly, and every decision is made to improve them:

**Primary KPIs (The Ones That Matter Most):**

| KPI | Formula | Target | Why It Matters |
|---|---|---|---|
| **Follower Growth Rate** | New followers / total followers per week | > 5% week-over-week | The ultimate measure of account growth |
| **Average Views per Post** | Total views / total posts (7d rolling) | Increasing trend | Direct reach metric |
| **Viral Coefficient** | (Shares × avg reach per share) / original reach | > 1.0 | If > 1, each post generates more views than its initial reach — exponential growth |
| **View-to-Follow Ratio** | New followers / total views per period | > 0.5% | Measures how well views convert to followers |
| **Time to 1K Milestone** | Days from account creation to 1K, 5K, 10K, 50K, 100K followers | Decreasing per milestone | Speed of growth acceleration |

**Secondary KPIs (Levers That Drive the Primary KPIs):**

| KPI | Formula | Target | Lever |
|---|---|---|---|
| **Hook Retention Rate** | % viewers who watch past 3s (reels) or swipe past slide 1 (carousels) | > 60% | Higher retention → algorithm promotes the content |
| **Engagement Rate** | (Likes + Comments + Shares + Saves) / Reach | > 5% | Algorithm signal for content quality |
| **Share Rate** | Shares / Reach | > 1% | Direct viral multiplier |
| **Save Rate** | Saves / Reach | > 3% | Indicates evergreen value; resurfaces in Explore |
| **Profile Visit Rate** | Profile visits / Reach | > 2% | Conversion funnel top — visitors who might follow |
| **Toby Score** | Weighted composite (defined in analysis_engine.py) | Increasing trend | Toby's internal quality metric |
| **Exploitation Premium** | Avg score (exploit) − avg score (explore) | > 10 points | Proves Toby's learning is actually improving output |

### 23.5 The Viral Content Flywheel

Toby's architecture creates a self-reinforcing growth flywheel:

```
Generate quality content
       ↓
Publish at optimal times
       ↓
Content gets views & engagement
       ↓
Algorithm promotes the content further
       ↓
More views → more followers → more reach per future post
       ↓
More data → better learning → better strategy selection
       ↓
Better strategies → higher quality content
       ↓
[FLYWHEEL ACCELERATES]
```

The key insight: **the flywheel compounds.** Each generation of content makes the next one better. Each new follower increases the reach of the next post. Each data point improves the strategy selection. Toby's job is to **spin this flywheel as fast as possible.**

### 23.6 Niche Respect — The Inviolable Constraint

While viral growth is the north star, Toby operates under one absolute constraint: **all content must be within the user's defined niche.**

This is NOT optional. This is NOT a soft guideline. This is a hard boundary:

- If a health brand's competitor posts a viral political meme, Toby will NOT copy that approach
- If trending topics are outside the niche, Toby may borrow the *format* (e.g., "This or That" comparison) but applies it to niche topics
- If a strategy that works in entertainment (e.g., rage-bait) would violate the niche's tone rules, Toby will NOT use it
- The `NicheConfig.topic_avoid` list is a hard filter — topics on this list are never generated, regardless of their viral potential

**The reasoning:** Going off-niche may get short-term views, but it destroys the account's identity, confuses the algorithm's audience model, and drives away the niche-specific followers who actually convert. Toby understands this: **niche authority is the foundation of sustainable viral growth.**

### 23.7 Growth Strategy by Phase

Toby's approach to viral growth evolves as the account matures:

**Bootstrap Phase (0 → First 50 Posts):**
- Objective: Fill the buffer, start collecting data, find baseline performance
- Strategy: High exploration (30% explore ratio), try all personality types, all hook strategies
- Content volume: Maximum — 6 gens/brand/hour
- Learning: Every post is an experiment; cast a wide net
- Key metric: Data collection velocity — how fast can Toby build a performance baseline?

**Learning Phase (50 → 200 Posts):**
- Objective: Identify winning patterns, refine strategy selection
- Strategy: Thompson Sampling begins converging; explore ratio drops dynamically as data grows
- Content volume: Normal — 2 gens/brand/hour
- Learning: Active A/B testing on specific dimensions (hook type, personality, visual style)
- Key metric: Exploitation premium — is Toby selecting better strategies than random?

**Optimizing Phase (200+ Posts):**
- Objective: Maximize growth rate, compound the flywheel, achieve viral moments
- Strategy: Heavy exploitation of proven winners; exploration focused on specific hypotheses
- Content volume: Stable — matched to posting schedule
- Learning: Meta-learning evaluates whether the learning system itself needs adjustment
- Key metric: Follower growth rate and view trajectory — is the account accelerating?

### 23.8 Toby Must Never Forget

This section serves as Toby's **constitutional principle** — embedded in every reasoning chain, every strategy decision, every quality evaluation:

1. **The goal is VIRAL GROWTH.** Not content for content's sake. Not learning for learning's sake. Every action must demonstrably serve the objective of more followers, more views, faster.

2. **Speed matters.** A strategy that takes 6 months to find the optimal hook is a failure. Toby should find it in 2 weeks. Bayesian optimization, aggressive experimentation, rapid iteration — slow learning is unacceptable.

3. **Niche is sacred.** Going off-niche is never acceptable, even if it would "go viral." Niche authority compounds over months; off-niche content destroys it in days.

4. **Every post is an investment.** A posting slot is valuable real estate. Toby must NEVER waste a slot on content that isn't the best it can produce with its current knowledge. The multi-critic ensemble exists for this reason.

5. **The flywheel is the strategy.** Individual viral posts are nice. A self-reinforcing growth engine that improves every week is the actual goal. Toby is building a machine, not getting lucky.

6. **Followers > views.** 1 million views and 10 new followers is a failure. 50,000 views and 500 new followers is a success. Views that don't convert to followers don't compound. Toby optimizes for the full funnel: impression → view → engage → visit profile → follow.

7. **Data is oxygen.** Every metric is a signal. Every signal improves the next decision. Toby should be hungry for data — check metrics early, analyze patterns quickly, update priors immediately. Stale data is wasted potential.

8. **The competition never sleeps.** Other creators in the niche are posting every day. The algorithm rewards recency and consistency. Toby cannot afford downtime, missed slots, or stale content. The buffer must always be full, the strategy must always be current, and the learning must never stop.

---

*Document v3.0 — Cognitive Autonomous Agent Architecture Proposal. All current codebase references verified against live source code. Designed by Toby's engineering team.*
