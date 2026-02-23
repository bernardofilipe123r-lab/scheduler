# TOBY AGENTIC RECONSTRUCTION — Complete Technical Prompt

> **Purpose:** This document is an actionable, code-grounded prompt for refactoring Toby from its current **linear pipeline** into a **Multi-Agent Autonomous System (MAS)** with specialized AI agents, an adversarial quality loop, vectorized memory, model mixing, and a "thinking" UI.
>
> Every file path, function signature, constant, and database column referenced here comes from the actual codebase as of February 2026.

---

## Table of Contents

1. [Current Architecture — What Exists Today](#1-current-architecture)
2. [What's Wrong — Pain Points and Limitations](#2-whats-wrong)
3. [Target Architecture — The Multi-Agent System](#3-target-architecture)
4. [Agent Definitions](#4-agent-definitions)
5. [StateGraph — The Execution DAG](#5-stategraph)
6. [Adversarial Quality Loop — The Ruthless Critic](#6-adversarial-quality-loop)
7. [Vectorized Memory — toby_reflections](#7-vectorized-memory)
8. [Model Mixing — DeepSeek Chat + Reasoner R1](#8-model-mixing)
9. [Thompson Sampling Refactor](#9-thompson-sampling-refactor)
10. [Image Pipeline Upgrade — Layered Composition](#10-image-pipeline-upgrade)
11. [Frontend — "Thinking" UI](#11-frontend-thinking-ui)
12. [Self-Correction Nodes](#12-self-correction-nodes)
13. [File-by-File Migration Map](#13-file-by-file-migration-map)
14. [Database Migrations](#14-database-migrations)
15. [New API Endpoints](#15-new-api-endpoints)
16. [Implementation Phases](#16-implementation-phases)

---

## 1. Current Architecture

### 1.1 The Pipeline (Exactly How It Runs Today)

```
APScheduler (5-min interval)
  └→ toby_tick()                                    # orchestrator.py
       └→ _process_user(db, state) per enabled user
            ├→ 1. Buffer Check (every 5 min)
            │     buffer_manager.get_buffer_status()
            │     content_planner.create_plans_for_empty_slots(max=6)
            │     └→ For each ContentPlan:
            │          learning_engine.choose_strategy()    # Thompson Sampling
            │          _execute_content_plan()              # 8-step pipeline ↓
            │
            ├→ 2. Metrics Check (every 360 min)
            │     MetricsCollector.collect_for_brand()      # Instagram API
            │
            ├→ 3. Analysis Check (every 360 min)
            │     analysis_engine.score_pending_posts()     # 48h + 7d scoring
            │     learning_engine.update_strategy_score()   # Welford's variance
            │     learning_engine.update_experiment_results()
            │
            ├→ 4. Discovery Check (bootstrap: 20min, normal: 360-720min)
            │     TrendScout.scan_own_accounts()
            │     TrendScout.scan_competitors()
            │     TrendScout.scan_hashtags(max=3)
            │
            └→ 5. Phase Check
                  state.check_phase_transition()
                  bootstrap → learning (10 scored + 7 days)
                  learning → optimizing (30 days)
```

### 1.2 The 8-Step Content Execution Pipeline

This is `_execute_content_plan()` in `app/services/toby/orchestrator.py` (line ~172):

| Step | What Happens | Code |
|---|---|---|
| 1 | Build `PromptContext` from `NicheConfigService.get_context()` + inject `personality_modifier` | `ctx = niche_svc.get_context(user_id, brand_id)` |
| 2 | Generate text via `ContentGeneratorV2` — reels: `generate_viral_content()`, posts: `generate_post_titles_batch(count=1)` | Both use 3-attempt quality loop internally |
| 3 | Determine variant: reels → `"light"/"dark"` from `slot_index % 2`, posts → `"post"` | Time-of-day based |
| 4 | Create `GenerationJob` via `JobManager.create_job()` with `created_by="toby"` | Stores in `generation_jobs` table |
| 5 | Run media pipeline: `JobProcessor.process_post_brand()` (posts) or `regenerate_brand()` (reels) | Calls deAPI for images, FFmpeg for video |
| 6 | Read `brand_outputs` from completed job + pre-render carousel PNGs via `render_carousel_images()` | Node.js Konva for carousels |
| 7 | Auto-schedule via `DatabaseSchedulerService.schedule_reel()` | Creates `ScheduledReel` row |
| 8 | Mark `created_by = "toby"` + `record_content_tag()` for learning | Creates `TobyContentTag` row |

### 1.3 Current File Map

```
app/services/toby/
├── __init__.py                    # Package docstring only
├── orchestrator.py       (470 lines)  # Main pipeline + toby_tick()
├── learning_engine.py    (360 lines)  # Thompson Sampling, strategy selection
├── analysis_engine.py    (155 lines)  # Performance scoring (Toby Score)
├── state.py              (125 lines)  # Phase management, enable/disable/reset
├── buffer_manager.py     (140 lines)  # Buffer health calculation
├── content_planner.py    (130 lines)  # ContentPlan creation, record_content_tag
└── discovery_manager.py  (100 lines)  # TrendScout coordination

app/core/
├── prompt_context.py     (160 lines)  # PromptContext dataclass (34 fields)
├── prompt_templates.py   (733 lines)  # All prompt builders (reel + carousel)
├── quality_scorer.py     (474 lines)  # 5-dimension quality scoring
├── viral_patterns.py     (384 lines)  # PatternSelector, archetypes, formats, hooks
├── constants.py                       # Global constants
└── config.py                          # Environment configuration

app/services/content/
├── generator.py         (1126 lines)  # ContentGeneratorV2 — DeepSeek API calls
├── tracker.py            (719 lines)  # ContentTracker — history, dedup, cooldowns
├── job_manager.py                     # GenerationJob CRUD
├── job_processor.py                   # Full media pipeline (images, video, uploads)
└── niche_config_service.py            # NicheConfig → PromptContext conversion

app/services/media/
├── ai_background.py                   # deAPI image generation (ZImageTurbo_INT8)
├── carousel_renderer.py               # Node.js Konva bridge
└── ...

app/models/toby.py       (237 lines)  # 5 models: TobyState, TobyExperiment,
                                       # TobyStrategyScore, TobyActivityLog,
                                       # TobyContentTag

app/api/toby/
├── routes.py             (422 lines)  # 12 authenticated endpoints
└── schemas.py             (10 lines)  # TobyConfigUpdate
```

### 1.4 Current Database Schema (Toby-Owned Tables)

#### `toby_state` — Per-user configuration + operational state
| Column | Type | Purpose |
|---|---|---|
| `user_id` | String(100) | Unique per user |
| `enabled` | Boolean | Master on/off |
| `phase` | String(20) | `"bootstrap"`, `"learning"`, `"optimizing"` |
| `buffer_days` | Integer | Default 2 — how far ahead to plan |
| `explore_ratio` | Float | Default 0.30 — Thompson Sampling exploration rate |
| `reel_slots_per_day` | Integer | Default 6 |
| `post_slots_per_day` | Integer | Default 2 |
| `last_buffer_check_at` | DateTime | Timing gate for buffer loop |
| `last_metrics_check_at` | DateTime | Timing gate for metrics |
| `last_analysis_at` | DateTime | Timing gate for analysis |
| `last_discovery_at` | DateTime | Timing gate for discovery |
| `daily_budget_cents` | Integer | Future: cost control (unused) |
| `spent_today_cents` | Integer | Future: cost tracking (unused) |

#### `toby_content_tags` — Links strategy metadata to scheduled content
| Column | Type | Purpose |
|---|---|---|
| `schedule_id` | String(36) | FK → `scheduled_reels` |
| `content_type` | String(10) | `"reel"` or `"post"` |
| `personality` | String(50) | e.g. `"edu_calm"`, `"myth_bust"` |
| `topic_bucket` | String(50) | e.g. `"sleep"`, `"nutrition"` |
| `hook_strategy` | String(50) | e.g. `"question"`, `"shocking_stat"` |
| `title_format` | String(50) | e.g. `"how_x_does_y"` |
| `visual_style` | String(50) | e.g. `"dark_cinematic"` |
| `experiment_id` | String(36) | FK → `toby_experiments` (if A/B test) |
| `is_experiment` | Boolean | Part of an A/B test? |
| `toby_score` | Float | Composite performance score (0-100) |
| `scored_at` | DateTime | When scored |
| `score_phase` | String(10) | `"48h"` or `"7d"` |

#### `toby_strategy_scores` — Thompson Sampling aggregates
| Column | Type | Purpose |
|---|---|---|
| `user_id` + `content_type` + `dimension` | Composite index | Lookup key |
| `option_value` | String(100) | e.g. `"edu_calm"`, `"sleep"` |
| `sample_count` | Integer | Total observations |
| `total_score` | Float | Sum of scores |
| `avg_score` | Float | Mean |
| `score_variance` | Float | Welford's running variance |
| `best_score` / `worst_score` | Float | Extremes |
| `recent_scores` | JSON | Rolling window of last 10 |

#### `toby_experiments` — A/B test tracking
| Column | Type | Purpose |
|---|---|---|
| `dimension` | String(30) | Which strategy dimension |
| `options` | JSON | List of options being tested |
| `results` | JSON | `{option: {count, total_score}}` |
| `status` | String(20) | `"active"`, `"completed"` |
| `winner` | String(100) | Best option when completed |
| `min_samples` | Integer | Default 5 — auto-completes when all options reach this |

#### `toby_activity_log` — Audit trail
| Column | Type | Purpose |
|---|---|---|
| `action_type` | String(30) | 13 types: `content_generated`, `analysis_completed`, `error`, etc. |
| `description` | Text | Human-readable |
| `action_metadata` | JSON | Structured data |
| `level` | String(10) | `"info"`, `"success"`, `"error"`, `"warning"` |

### 1.5 Current AI Configuration

| Parameter | Current Value | File |
|---|---|---|
| Text model | `deepseek-chat` | `generator.py` |
| Text temperature (reels) | `0.85` | `generator.py` |
| Text temperature (posts) | `0.85` | `generator.py` |
| Text temperature (image prompts) | `0.8` | `generator.py` |
| Max tokens (reels) | `1200` | `generator.py` |
| Max tokens (single post) | `2000` | `generator.py` |
| Max tokens (batch posts) | `8000` | `generator.py` |
| Image model (reels) | `ZImageTurbo_INT8` (8 steps) | `ai_background.py` |
| Image model (posts) | `ZImageTurbo_INT8` (8 steps) | `prompt_templates.py` |
| Quality threshold (publish) | `≥ 80` | `quality_scorer.py` |
| Quality threshold (regenerate) | `65–79` | `quality_scorer.py` |
| Quality threshold (reject) | `< 65` | `quality_scorer.py` |
| Max regeneration attempts | `3` | `generator.py` |
| History window (dedup) | 20 recent | `quality_scorer.py` |
| Fingerprint cooldown | 30 days | `tracker.py` |
| Topic cooldown | 3 days | `tracker.py` |

### 1.6 Current Learning Algorithm

**Thompson Sampling** across 5 dimensions, implemented in `learning_engine.py`:

| Dimension | Reel Options | Post Options |
|---|---|---|
| Personality | `edu_calm`, `provoc`, `story`, `data`, `urgent` | `deep_edu`, `myth_bust`, `listicle`, `compare`, `protocol` |
| Topic bucket | Dynamic from `NicheConfig.topic_categories` | Same |
| Hook strategy | `question`, `myth_buster`, `shocking_stat`, `personal_story`, `bold_claim` | Same |
| Title format | `how_x_does_y`, `number_one_mistake`, `why_experts_say`, `stop_doing_this`, `hidden_truth` | Same |
| Visual style | `dark_cinematic`, `light_clean`, `vibrant_bold` | Same |

**Scoring formula** (`analysis_engine.py`):
- Raw views: 20% — `log10(views) / log10(500,000) * 100`
- Relative views: 30% — `(views / brand_avg_views) * 25`
- Engagement quality: 40% — `(saves*2 + shares*3) / views * 10,000`
- Follower context: 10% — `(views / followers) * 10`

### 1.7 Current Frontend (15 files, 1,577 lines)

```
src/pages/Toby.tsx                    (90 lines)   # 4-tab layout: Overview | Experiments | Insights | Settings
src/features/toby/
├── types.ts                         (140 lines)   # 15 interfaces/types
├── api/toby-api.ts                  (64 lines)    # 12 API methods
├── hooks/use-toby.ts               (115 lines)    # 12 React Query hooks (15s polling)
└── components/
    ├── TobyStatusBar.tsx            (140 lines)   # Enable/disable + phase badge + buffer %
    ├── TobyLiveStatus.tsx           (199 lines)   # Live action hero card + 4-step pipeline viz
    ├── TobyActivityFeed.tsx         (259 lines)   # Timeline grouped by time period
    ├── TobyExperiments.tsx          (120 lines)   # A/B test cards with variant comparison
    ├── TobyInsights.tsx              (75 lines)   # Ranked strategy bars per dimension
    ├── TobyBufferStatus.tsx         (191 lines)   # Health indicator + per-brand breakdown
    └── TobySettings.tsx             (170 lines)   # Config sliders + danger zone
```

**No "thinking" UI exists.** The closest is `TobyLiveStatus` which shows "Working"/"Idle" with a 4-step pipeline indicator (Buffer → Metrics → Analysis → Discovery).

---

## 2. What's Wrong

### 2.1 Architectural Limitations

| Problem | Why It Hurts | Where It Lives |
|---|---|---|
| **Monolithic orchestrator** | `_execute_content_plan()` is a single ~180-line function that handles text gen, media gen, carousel rendering, scheduling, and tag recording. Any failure cascades. No retry granularity. | `orchestrator.py` line ~172 |
| **No agent decomposition** | Scout (discovery), Strategist (planning), Creator (generation), Critic (quality) are all tangled in a single pipeline. No agent can operate independently. | Spread across 7 files |
| **Linear thinking** | The pipeline never reconsiders decisions. If the strategy engine picks `edu_calm`, the generator never pushes back and says "this topic works better with `provoc`". | `content_planner.py` → `generator.py` — no feedback loop |
| **Single model** | Everything uses `deepseek-chat`. No chain-of-thought reasoning for strategy. No fast model for simple tasks. No reasoner model for deep analysis. | `generator.py` — hardcoded |
| **Quality scoring is offline** | `QualityScorer` runs in the generator's quality loop but never informs strategy selection. A personality that consistently scores 60 still gets selected at the same rate until Instagram metrics come in 7 days later. | `quality_scorer.py` vs `learning_engine.py` — disconnected |
| **No reflection memory** | Toby has no way to record _why_ something worked or failed. Strategy scores are just numbers. There's no "this topic resonated because it hit a trending news cycle" insight. | No reflection table exists |
| **Stateless prompting** | Every generation starts from scratch. The system prompt is rebuilt every time but never includes context about recent performance, strategy rationale, or competitive landscape. | `prompt_templates.py` — `build_system_prompt()` |
| **Discovery is disconnected** | `TrendScout` collects trending content but it never feeds into content generation. Discovery data sits in `trending_content` table, unused by the generator. | `discovery_manager.py` → dead end |
| **No adversarial review** | The quality loop uses a rule-based scorer (`QualityScorer`). There is no AI-powered critique that can evaluate content at a semantic level (is this actually interesting? genuinely novel? does the hook land?). | `quality_scorer.py` is pure regex/heuristic |
| **Image generation is disconnected** | Text generation and image prompt generation are separate calls. The image prompt doesn't consider the visual style strategy choice or the content's emotional tone. | `generator.py` → `generate_image_prompt()` is a separate call |

### 2.2 Specific Code Smells

1. **`_execute_content_plan()` does too much** — 8 steps, ~180 lines, 6 service imports inside the function body. Should be decomposed into focused agent steps.

2. **`choose_strategy()` is blind to immediate quality** — It uses historical Instagram metrics (7-day lag) but ignores the quality score from the just-completed generation. A strategy that produces low-quality content today will keep getting selected until Instagram data arrives.

3. **`REEL_PERSONALITIES` and `POST_PERSONALITIES` are static dicts** — Each personality is a 1-line description. A proper system would have rich personality profiles that include writing examples, forbidden patterns, and tone calibration.

4. **`ContentTracker.build_history_context()` builds a flat string** — No semantic understanding of what was produced. Just "avoid these titles". A vector store would allow "find content similar to this trending post" or "what topic cluster hasn't been explored?".

5. **`PatternSelector` and `choose_strategy()` are redundant** — Both select patterns independently. The `PatternSelector` (in `viral_patterns.py`) picks archetypes, formats, and hooks. The learning engine (in `learning_engine.py`) picks personality, topic, hook, title_format, visual_style. They don't coordinate.

6. **Phase transitions are time-based, not skill-based** — `bootstrap → learning` requires 10 posts + 7 days. But what if the 10 posts are all terrible? There's no quality gate.

---

## 3. Target Architecture

### 3.1 The Multi-Agent System

Replace the monolithic pipeline with a **StateGraph** (directed acyclic graph) of specialized agents:

```
                    ┌─────────────┐
                    │   TRIGGER    │  APScheduler tick / empty buffer slot
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    SCOUT    │  Gathers context: trends, gaps, performance
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  STRATEGIST │  Picks strategy: personality × topic × hook × format
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   CREATOR   │  Generates text + image prompts
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    CRITIC   │  Adversarial review (AI-powered + rule-based)
                    └──────┬──────┘
                           │
               ┌───────────┼───────────┐
               │           │           │
          SCORE ≥ 85   65-84       < 65
          ┌────▼───┐  ┌───▼────┐  ┌──▼──┐
          │ ACCEPT │  │ REVISE │  │KILL │
          └────┬───┘  └───┬────┘  └──┬──┘
               │          │          │
               │     Back to CREATOR │
               │     (with critique) │  Log reflection, try new strategy
               │          │          │
          ┌────▼──────────▼──────────┘
          │      PUBLISHER
          │  (media pipeline + scheduling)
          └────────────┬──────────────
                       │
                  ┌────▼────┐
                  │ REFLECT │  Write to toby_reflections
                  └─────────┘
```

### 3.2 Key Architectural Principles

| Principle | Implementation |
|---|---|
| **Each agent is a pure function** | `(AgentState) → AgentState` — takes shared state, returns updated state |
| **State is a typed dictionary** | Flows through the graph, accumulating context at each node |
| **Routing is conditional** | After Critic, the graph branches: accept/revise/kill based on score |
| **Max 3 revisions** | Prevent infinite loops. After 3 Critic rejections, use the best attempt |
| **Reflection is always written** | Every completed content piece (published or killed) generates a reflection record |
| **Agents can be individually tested** | Each agent function can be imported and called in isolation with mock state |

### 3.3 AgentState Schema

```python
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.core.prompt_context import PromptContext

@dataclass
class AgentState:
    """Shared state that flows through the agent graph."""

    # ── Identity ──
    user_id: str = ""
    brand_id: str = ""
    content_type: str = ""  # "reel" or "post"
    scheduled_time: str = ""

    # ── Scout outputs ──
    trending_topics: List[str] = field(default_factory=list)
    content_gaps: List[str] = field(default_factory=list)
    performance_context: Dict[str, Any] = field(default_factory=dict)
    competitor_insights: List[str] = field(default_factory=list)

    # ── Strategist outputs ──
    strategy: Optional[Dict[str, str]] = None  # personality, topic, hook, format, visual
    strategy_rationale: str = ""  # Why this strategy was chosen (from Reasoner)

    # ── Creator outputs ──
    prompt_context: Optional[PromptContext] = None
    generated_content: Optional[Dict[str, Any]] = None  # title, content_lines, caption, image_prompt
    image_prompts: List[str] = field(default_factory=list)

    # ── Critic outputs ──
    quality_score: Optional[float] = None
    critic_feedback: str = ""
    critic_issues: List[str] = field(default_factory=list)
    revision_count: int = 0
    max_revisions: int = 3

    # ── Publisher outputs ──
    job_id: str = ""
    schedule_id: str = ""
    media_urls: Dict[str, str] = field(default_factory=dict)

    # ── Reflection ──
    reflection: str = ""
    reflection_tags: List[str] = field(default_factory=list)

    # ── Execution trace (for "Thinking" UI) ──
    trace: List[Dict[str, Any]] = field(default_factory=list)
    # Each entry: {"agent": "scout", "started_at": ..., "finished_at": ...,
    #              "summary": "...", "tokens_used": 0, "model": "deepseek-chat"}
```

---

## 4. Agent Definitions

### 4.1 Scout Agent

**Purpose:** Gather environmental context before any content decision.

**Current code it replaces/enhances:**
- `discovery_manager.py` → `run_discovery_tick()`
- `buffer_manager.py` → `get_buffer_status()`
- `content_planner.py` → `_get_available_topics()`
- `tracker.py` → `build_history_context()`, `get_topic_cooldowns()`

**What it does:**
1. Query `trending_content` table for recent trends (currently unused)
2. Query `toby_content_tags` for recent strategy + performance data
3. Query `toby_strategy_scores` for dimension-level performance
4. Query `content_history` for topic cooldowns and content fingerprints
5. Query `toby_reflections` (new) for semantic memory retrieval
6. Synthesize into `trending_topics`, `content_gaps`, `performance_context`

**AI call:** None (database-only in v1). Future: Optional DeepSeek call to synthesize insights from raw data.

**Implementation:**
```python
# app/services/toby/agents/scout.py

def scout_agent(state: AgentState) -> AgentState:
    """Gather environmental context for strategy selection."""
    db = get_db_session()

    # Recent performance by dimension
    state.performance_context = _get_recent_performance(db, state.user_id, state.content_type)

    # Topic gaps (topics not used recently)
    state.content_gaps = _get_topic_gaps(db, state.user_id, state.content_type)

    # Trending topics from TrendScout
    state.trending_topics = _get_trending_topics(db, state.user_id)

    # Competitor insights (what's working for similar accounts)
    state.competitor_insights = _get_competitor_insights(db, state.user_id)

    # Retrieve relevant reflections (semantic search against toby_reflections)
    state.performance_context["reflections"] = _get_relevant_reflections(
        db, state.user_id, state.content_type, state.content_gaps
    )

    state.trace.append({
        "agent": "scout",
        "summary": f"Found {len(state.trending_topics)} trends, "
                   f"{len(state.content_gaps)} topic gaps, "
                   f"{len(state.competitor_insights)} competitor insights",
    })

    return state
```

### 4.2 Strategist Agent

**Purpose:** Choose the optimal strategy using context from Scout + Thompson Sampling + AI reasoning.

**Current code it replaces/enhances:**
- `learning_engine.py` → `choose_strategy()`
- `content_planner.py` → `create_plans_for_empty_slots()`
- `viral_patterns.py` → `PatternSelector.select_patterns()`

**What changes:**
1. Receives full Scout context (not just `explore_ratio`)
2. Uses **DeepSeek Reasoner R1** (chain-of-thought) to reason about strategy selection when in exploit mode
3. Unifies `PatternSelector` and `choose_strategy()` into a single coordinated selection
4. Can override Thompson Sampling when trend data suggests a different approach
5. Records `strategy_rationale` explaining _why_ this combination was chosen

**AI call:** DeepSeek Reasoner R1 (`deepseek-reasoner`) for strategy reasoning (exploit mode only). Explore mode still uses Thompson Sampling random selection (no AI cost).

**Key insight:** The Strategist should reason about which personality × topic × hook combination will work, not just pick the highest-scoring individual options. A good `provoc` + `sleep` might beat good `edu_calm` + good `nutrition` individually but outperform when combined.

**Implementation sketch:**

```python
# app/services/toby/agents/strategist.py

def strategist_agent(state: AgentState) -> AgentState:
    """Choose content strategy using AI reasoning + Thompson Sampling."""
    db = get_db_session()

    explore_ratio = _get_explore_ratio(db, state.user_id)
    is_explore = random.random() < explore_ratio

    if is_explore:
        # Random exploration — no AI cost
        strategy = _random_strategy(state.content_type, state.content_gaps)
        state.strategy_rationale = "Exploration: random selection to discover new patterns"
    else:
        # AI-reasoned exploitation
        # Build context: top strategies, recent performance, scout findings
        reasoning_prompt = _build_strategy_reasoning_prompt(
            state.performance_context,
            state.trending_topics,
            state.content_gaps,
            state.competitor_insights,
            state.content_type,
        )

        # DeepSeek Reasoner R1: chain-of-thought reasoning
        reasoning_result = _call_deepseek_reasoner(reasoning_prompt)
        strategy = _parse_strategy_from_reasoning(reasoning_result)
        state.strategy_rationale = reasoning_result.get("reasoning", "")

    state.strategy = strategy
    state.trace.append({
        "agent": "strategist",
        "summary": f"{'Explore' if is_explore else 'Exploit'}: "
                   f"{strategy['personality']} × {strategy['topic']} × {strategy['hook']}",
        "model": "none" if is_explore else "deepseek-reasoner",
    })

    return state
```

### 4.3 Creator Agent

**Purpose:** Generate the actual content (text + image prompts) using the strategy from the Strategist.

**Current code it replaces/enhances:**
- `generator.py` → `generate_viral_content()`, `generate_post_titles_batch()`
- `prompt_templates.py` → `build_runtime_prompt()`, `build_post_content_prompt()`

**What changes:**
1. Receives `strategy_rationale` from Strategist to inform tone and approach
2. Generates text AND image prompts in a single coordinated call (not separate calls)
3. Image prompt considers visual style strategy, content emotion, and image composition style
4. Can receive critique from a previous Critic revision and incorporate it

**AI call:** DeepSeek Chat (`deepseek-chat`) at temperature 0.85.

**Implementation sketch:**

```python
# app/services/toby/agents/creator.py

def creator_agent(state: AgentState) -> AgentState:
    """Generate content using strategy + context."""

    # Build PromptContext
    niche_svc = NicheConfigService()
    ctx = niche_svc.get_context(user_id=state.user_id, brand_id=state.brand_id)
    if not ctx:
        ctx = PromptContext()

    # Inject personality modifier
    personality_prompt = get_personality_prompt(state.content_type, state.strategy["personality"])
    ctx.personality_modifier = personality_prompt

    # Build the generation prompt
    if state.revision_count > 0:
        # Revision mode: include critic feedback
        prompt = _build_revision_prompt(
            state.generated_content,
            state.critic_feedback,
            state.critic_issues,
            ctx,
        )
    else:
        # First attempt: normal generation
        prompt = _build_creation_prompt(state.strategy, state.strategy_rationale, ctx)

    # Single coordinated generation: text + image prompt together
    result = _call_deepseek_chat(prompt, ctx)

    state.generated_content = result
    state.prompt_context = ctx

    state.trace.append({
        "agent": "creator",
        "summary": f"Generated: \"{result.get('title', 'untitled')[:60]}\"",
        "model": "deepseek-chat",
        "revision": state.revision_count,
    })

    return state
```

### 4.4 Critic Agent (The Ruthless Critic)

**Purpose:** Evaluate generated content using both rule-based scoring AND AI-powered semantic critique.

**Current code it replaces/enhances:**
- `quality_scorer.py` → `QualityScorer.score()`
- `generator.py` → quality thresholds in `_generate_with_quality_loop()`

**What changes:**
1. **Two-layer critique**: Rule-based `QualityScorer` (fast, cheap) + AI semantic review (slower, smarter)
2. AI critique uses **DeepSeek Chat** with a specialized "ruthless critic" system prompt
3. Evaluates not just structure and novelty, but semantic quality: Is this genuinely interesting? Would a real human stop scrolling for this? Is the argument logically sound?
4. Returns actionable feedback that the Creator can use to revise
5. Feeds quality scores into Thompson Sampling immediately (not waiting 7 days for Instagram data)

**AI call:** DeepSeek Chat (`deepseek-chat`) with a critic-specific system prompt, temperature 0.3 (low creativity, high judgment).

**Routing logic:**
- Score ≥ 85 → **ACCEPT** → proceed to Publisher
- Score 65–84 → **REVISE** → back to Creator with feedback (if `revision_count < max_revisions`)
- Score < 65 → **KILL** → log reflection, try entirely new strategy

**Implementation sketch:**

```python
# app/services/toby/agents/critic.py

CRITIC_SYSTEM_PROMPT = """You are a ruthless content critic. Your job is to evaluate
content that will be posted on Instagram. Be harsh, specific, and actionable.

Score each piece on these dimensions (0-100):
1. HOOK POWER: Would someone stop scrolling for this title? Be honest.
2. NOVELTY: Is this a genuinely fresh angle, or recycled generic advice?
3. STRUCTURE: Is the format clean, scannable, and optimized for mobile?
4. PLAUSIBILITY: Are the claims credible? No miracle cures, no pseudoscience.
5. EMOTIONAL RESONANCE: Does this make the reader feel something? Urgency? Curiosity? Hope?

Return JSON: {
    "scores": {"hook": N, "novelty": N, "structure": N, "plausibility": N, "emotion": N},
    "total": N,
    "verdict": "accept" | "revise" | "kill",
    "issues": ["specific issue 1", "specific issue 2"],
    "feedback": "Specific, actionable revision instructions",
    "strengths": ["what works well"]
}"""


def critic_agent(state: AgentState) -> AgentState:
    """Two-layer quality evaluation: rule-based + AI semantic."""

    content = state.generated_content
    if not content:
        state.quality_score = 0
        state.critic_feedback = "No content generated"
        return state

    # Layer 1: Rule-based scoring (fast, free)
    rule_score = get_quality_scorer().score(content)

    # Layer 2: AI semantic critique (richer, slower)
    ai_critique = _call_deepseek_critic(content, state.strategy, state.prompt_context)

    # Blend scores: 40% rule-based, 60% AI critique
    blended_score = (rule_score.total_score * 0.4) + (ai_critique["total"] * 0.6)

    state.quality_score = blended_score
    state.critic_feedback = ai_critique.get("feedback", "")
    state.critic_issues = ai_critique.get("issues", [])

    # Immediate strategy signal: feed quality score to learning engine
    # This gives Thompson Sampling a signal BEFORE waiting for Instagram metrics
    _update_immediate_quality_signal(
        state.user_id, state.brand_id, state.content_type,
        state.strategy, blended_score
    )

    state.trace.append({
        "agent": "critic",
        "summary": f"Score: {blended_score:.0f}/100 — "
                   f"{'ACCEPT' if blended_score >= 85 else 'REVISE' if blended_score >= 65 else 'KILL'}",
        "model": "deepseek-chat",
        "scores": ai_critique.get("scores", {}),
    })

    return state
```

### 4.5 Publisher Agent

**Purpose:** Execute the media pipeline and schedule content.

**Current code it replaces:** Steps 3-8 of `_execute_content_plan()` in `orchestrator.py`.

**What changes:** Minimal — this is mostly a wrapper around existing services. The key change is that it receives a fully validated `AgentState` and doesn't need to handle content quality (Critic already did that).

### 4.6 Reflector Agent

**Purpose:** After every content piece (published or killed), write a structured reflection to the `toby_reflections` table.

**What it does:**
1. Summarize what was tried, what worked/failed, and why
2. Extract reusable insights (e.g. "personal_story hooks underperform on weekends for this brand")
3. Tag with strategy dimensions for future retrieval
4. Feed into the Scout's semantic memory search

**AI call:** DeepSeek Chat (`deepseek-chat`) at temperature 0.3.

---

## 5. StateGraph

### 5.1 Graph Definition

```python
# app/services/toby/graph.py

from typing import Literal

# Node functions
from app.services.toby.agents.scout import scout_agent
from app.services.toby.agents.strategist import strategist_agent
from app.services.toby.agents.creator import creator_agent
from app.services.toby.agents.critic import critic_agent
from app.services.toby.agents.publisher import publisher_agent
from app.services.toby.agents.reflector import reflector_agent


def route_after_critic(state: AgentState) -> Literal["accept", "revise", "kill"]:
    """Decide what to do after the Critic scores the content."""
    if state.quality_score >= 85:
        return "accept"
    elif state.quality_score >= 65 and state.revision_count < state.max_revisions:
        return "revise"
    elif state.revision_count >= state.max_revisions:
        # Used all revisions — publish best attempt
        return "accept"
    else:
        return "kill"


def build_toby_graph():
    """Build the Toby agent execution graph."""
    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("scout", scout_agent)
    graph.add_node("strategist", strategist_agent)
    graph.add_node("creator", creator_agent)
    graph.add_node("critic", critic_agent)
    graph.add_node("publisher", publisher_agent)
    graph.add_node("reflector", reflector_agent)

    # Linear flow: scout → strategist → creator → critic
    graph.add_edge("scout", "strategist")
    graph.add_edge("strategist", "creator")
    graph.add_edge("creator", "critic")

    # Conditional routing after critic
    graph.add_conditional_edges("critic", route_after_critic, {
        "accept": "publisher",
        "revise": "creator",      # Loop back with feedback
        "kill": "reflector",      # Skip publishing, just reflect
    })

    # Publisher → Reflector (always reflect after publishing)
    graph.add_edge("publisher", "reflector")

    # Entry point
    graph.set_entry_point("scout")

    return graph.compile()
```

### 5.2 Graph Execution

```python
# In orchestrator.py (refactored)

def _execute_content_plan(db: Session, plan):
    """Execute a content plan through the agent graph."""
    graph = build_toby_graph()

    initial_state = AgentState(
        user_id=plan.user_id,
        brand_id=plan.brand_id,
        content_type=plan.content_type,
        scheduled_time=plan.scheduled_time,
    )

    # Run the graph — returns final state
    final_state = graph.invoke(initial_state)

    # Store trace in activity log for "Thinking" UI
    _store_execution_trace(db, plan.user_id, final_state.trace)

    return final_state
```

---

## 6. Adversarial Quality Loop

### 6.1 Current Quality Loop (What Exists)

In `generator.py`, both reel and carousel generation use a 3-attempt quality loop:

```
Attempt 1: Standard generation + history avoidance
  → QualityScorer.score() → ≥80? Publish.
  → 65-79? Attempt 2.

Attempt 2: Correction prompt with QualityScorer feedback
  → QualityScorer.score() → ≥80? Publish.
  → 65-79? Attempt 3.

Attempt 3: Style anchor (structural ghost example)
  → QualityScorer.score() → Accept best of 3.
```

**Problem:** `QualityScorer` is purely rule-based (regex, word counts, keyword matching). It can catch structural issues but cannot evaluate:
- Is the argument logically sound?
- Is this genuinely novel or just rephrased?
- Would a human actually find this interesting?
- Does the hook create real curiosity or just feel clickbait-y?

### 6.2 The Adversarial Upgrade

Replace the rule-based-only loop with a **two-layer adversarial system**:

**Layer 1 — Rule-Based Pre-Filter (keep existing `QualityScorer`):**
Fast check that catches structural violations immediately. No AI cost. If rule-based score < 50, don't even bother with AI critique — kill and retry.

**Layer 2 — AI Semantic Critic:**
Uses DeepSeek Chat with a specialized critic prompt at temperature 0.3 (deterministic judgment). Evaluates hook power, novelty, emotional resonance, plausibility, and structure.

**Combined score:** 40% rule-based + 60% AI critic. This gives the heuristic scorer a voice while letting the AI evaluate semantic quality.

### 6.3 Escalation Strategy (Across Revisions)

| Attempt | Creator Strategy | Critic Temperature |
|---|---|---|
| 1 | Standard generation with strategy context | 0.3 |
| 2 | Incorporate Critic's specific feedback + issues | 0.2 (more strict) |
| 3 | Full strategy pivot — different personality + hook | 0.3 |

The key innovation: **Attempt 3 doesn't just retry the same strategy harder** — it signals the Strategist to pick a completely different approach. This is the "kill" → "new strategy" path in the StateGraph.

---

## 7. Vectorized Memory — toby_reflections

### 7.1 Why Reflections?

Current Toby has **numeric memory** (strategy scores, content history hashes) but no **semantic memory**. It knows that `edu_calm` scores 72.3 on average but doesn't know _why_. It can't record insights like:

- "Stories about personal health transformation outperform generic tips on Mondays"
- "Carousel posts with exactly 3 content slides get more saves than 4"
- "When competitors post about fasting, our audience responds strongly to counter-content"
- "The shocking_stat hook works best when the stat is counterintuitive, not just big"

### 7.2 New Table: `toby_reflections`

```sql
CREATE TABLE toby_reflections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     VARCHAR(100) NOT NULL,
    brand_id    VARCHAR(50),
    content_type VARCHAR(10),              -- "reel" | "post"

    -- What happened
    schedule_id VARCHAR(36),               -- FK to scheduled_reels (optional)
    strategy    JSONB,                     -- {personality, topic, hook, format, visual}
    quality_score FLOAT,                   -- Combined critic score
    toby_score  FLOAT,                     -- Instagram performance score (filled later)

    -- The reflection
    reflection_text TEXT NOT NULL,          -- AI-generated: what worked, what didn't, why
    insight_tags    JSONB DEFAULT '[]',     -- ["topic:sleep", "hook:weakness", "timing:weekend"]
    lesson_type     VARCHAR(20),           -- "success" | "failure" | "discovery" | "revision"

    -- Embedding for semantic search
    embedding       VECTOR(1536),          -- For pgvector similarity search

    -- Timestamps
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ix_reflections_user_type ON toby_reflections (user_id, content_type);
CREATE INDEX ix_reflections_embedding ON toby_reflections USING ivfflat (embedding vector_cosine_ops);
```

### 7.3 How Reflections Are Used

**Writing (Reflector Agent):**
After every content piece, the Reflector Agent generates:
```json
{
  "reflection_text": "The 'provoc' personality with 'sleep' topic scored 91/100. The hook 'STOP DOING THIS' combined with counterintuitive sleep data created strong engagement. Key factor: the first content line immediately challenged a common belief rather than stating a fact.",
  "insight_tags": ["personality:provoc", "topic:sleep", "hook:bold_claim", "pattern:challenge_first"],
  "lesson_type": "success"
}
```

**Reading (Scout Agent):**
Before any new content generation, the Scout queries relevant reflections:
```python
# Semantic search: "What worked for sleep content recently?"
reflections = db.query(TobyReflection).filter(
    TobyReflection.user_id == user_id,
    TobyReflection.content_type == content_type,
).order_by(
    TobyReflection.embedding.cosine_distance(query_embedding)
).limit(5).all()
```

These reflections are injected into the Strategist's reasoning prompt, giving it semantic context about why certain strategies worked.

### 7.4 Embedding Generation

Use DeepSeek's embedding endpoint or a local embedding model to generate vectors for `reflection_text`. The embedding enables:
- **Similarity search:** "Find reflections relevant to this trending topic"
- **Clustering:** "What patterns emerge from successful content?"
- **Gap detection:** "What topics/strategies have no reflections yet?"

---

## 8. Model Mixing

### 8.1 Current: Single Model Everywhere

All AI calls use `deepseek-chat` at similar temperatures. This is wasteful — simple tasks don't need a full chat model, and complex reasoning tasks need chain-of-thought.

### 8.2 Target: Model Per Agent

| Agent | Model | Temperature | Max Tokens | Why |
|---|---|---|---|---|
| Scout | None (DB-only) | — | — | No AI needed for data collection |
| Strategist (explore) | None | — | — | Random selection — no AI cost |
| Strategist (exploit) | `deepseek-reasoner` | N/A (CoT) | 4000 | Chain-of-thought reasoning for strategy. The `reasoning_content` field shows Toby's thinking process |
| Creator (reels) | `deepseek-chat` | 0.85 | 1200 | Creative generation — same as current |
| Creator (posts) | `deepseek-chat` | 0.85 | 8000 | Creative generation — same as current |
| Critic | `deepseek-chat` | 0.3 | 1500 | Low temperature for consistent evaluation |
| Reflector | `deepseek-chat` | 0.3 | 800 | Structured reflection — low creativity needed |
| Publisher | None | — | — | No AI needed for media pipeline |

### 8.3 DeepSeek Reasoner R1 Integration

The Reasoner model returns a `reasoning_content` field alongside the standard `content` field. This is Toby's "thinking out loud":

```python
response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=[
        {"role": "system", "content": strategist_system_prompt},
        {"role": "user", "content": strategy_context},
    ],
)

# The model's chain-of-thought reasoning (for UI display)
thinking = response.choices[0].message.reasoning_content

# The final strategy decision (for execution)
decision = response.choices[0].message.content
```

The `reasoning_content` is stored in `AgentState.trace` and displayed in the "Thinking" UI, so users can see _why_ Toby chose a particular strategy.

---

## 9. Thompson Sampling Refactor

### 9.1 Current Implementation

`learning_engine.py` → `choose_strategy()`:
- 5 dimensions selected independently
- Binary explore/exploit per dimension
- Welford's running variance for score aggregation
- Rolling window of last 10 scores
- No cross-dimensional reasoning

### 9.2 Proposed Changes

**Keep Thompson Sampling as the foundation** — it's a proven algorithm for this use case. But augment it:

1. **Dual signal feeding:**
   - **Immediate signal:** Critic's quality score (available at generation time)
   - **Delayed signal:** Instagram's Toby Score (available at 48h + 7d)
   - Weight: 30% immediate quality, 70% Instagram performance

2. **Combination-level tracking (new):**
   Currently, each dimension is scored independently. But `provoc + sleep` might be great while `provoc + nutrition` is terrible. Add a `toby_strategy_combos` table:

   ```sql
   CREATE TABLE toby_strategy_combos (
       id          UUID PRIMARY KEY,
       user_id     VARCHAR(100) NOT NULL,
       content_type VARCHAR(10),
       combo_key   VARCHAR(500),  -- "provoc|sleep|question|how_x_does_y|dark_cinematic"
       sample_count INTEGER DEFAULT 0,
       avg_quality_score FLOAT DEFAULT 0,  -- From Critic
       avg_toby_score FLOAT DEFAULT 0,     -- From Instagram
       recent_scores JSONB DEFAULT '[]',
       updated_at  TIMESTAMPTZ
   );
   ```

3. **Bandit warmup from reflections:** New strategies start with zero data. If the reflection memory contains insights about similar strategies, use those to initialize priors (Bayesian prior from semantic similarity).

4. **Auto-expand strategy space:** If all personality options have ≥20 samples, generate a new personality variant by blending the top 2 performers. Add it to the pool and test it.

### 9.3 Updated Score Flow

```
Content published
    │
    ├→ Immediate: Critic score (0-100)
    │   └→ Update toby_strategy_scores (dimension-level)
    │   └→ Update toby_strategy_combos (combo-level)
    │
    ├→ 48h later: analysis_engine scores content
    │   └→ toby_content_tags.score_phase = "48h"
    │   └→ Update toby_strategy_scores (preliminary Instagram signal)
    │
    └→ 7d later: analysis_engine final score
        └→ toby_content_tags.score_phase = "7d"
        └→ Update toby_strategy_scores (authoritative signal)
        └→ Update toby_strategy_combos (authoritative signal)
        └→ Reflector writes/updates reflection
```

---

## 10. Image Pipeline Upgrade

### 10.1 Current: Single Flat Image

Both reels and carousels generate a single AI background image via deAPI (`ZImageTurbo_INT8`, 8 steps, 1088×1360 for posts, 1152×1920 for reels). The image is used as-is — flat, no layering.

### 10.2 Target: Layered Composition

Generate multiple image layers and composite them:

| Layer | Purpose | Generation |
|---|---|---|
| **Background** | Scene/atmosphere | AI-generated (deAPI) — current behavior |
| **Subject** | Main visual focus | AI-generated with transparent background (requires model that supports alpha) |
| **Overlay** | Text treatment, gradients | Programmatic (Pillow/CSS) — current dark overlay behavior |
| **Accent** | Brand elements, icons | Loaded from `assets/icons/` + `assets/logos/` |

**Phase 1 (minimal change):** Add a gradient overlay layer between background and text. Currently, carousels use `carousel_cover_overlay_opacity` (55%) and `carousel_content_overlay_opacity` (85%). Make these dynamic based on the background image's brightness:

```python
# In carousel_renderer or ai_background.py
def compute_overlay_opacity(background_image_path: str) -> int:
    """Auto-adjust overlay based on background brightness."""
    img = Image.open(background_image_path)
    avg_brightness = sum(img.convert("L").getdata()) / (img.width * img.height)
    # Bright images need stronger overlay; dark images need less
    return min(95, max(40, int(100 - avg_brightness * 0.35)))
```

**Phase 2 (advanced):** The Creator Agent generates a `visual_composition` spec alongside text:
```json
{
  "background_prompt": "Dimly lit laboratory with blue ambient light...",
  "subject_prompt": "Close-up of a scientist examining a DNA helix hologram...",
  "mood": "mysterious_authority",
  "dominant_color": "#1a3a5c",
  "composition": "subject_left_text_right"
}
```

This spec drives both image generation and layout decisions.

---

## 11. Frontend — "Thinking" UI

### 11.1 Current UI Limitations

`TobyLiveStatus.tsx` shows a simple "Working"/"Idle" state with a 4-step pipeline indicator. It has no visibility into _what_ Toby is thinking, _why_ it chose a strategy, or _how_ it's evaluating content.

### 11.2 Target: Agent Trace Timeline

When Toby is generating content, show a real-time trace of each agent's activity:

```
┌──────────────────────────────────────────────────┐
│ 🤖 Toby is creating content...                   │
│                                                    │
│ ✅ SCOUT (2.1s)                                   │
│    Found 3 trending topics, 2 content gaps         │
│    No competitor activity in last 6h               │
│                                                    │
│ ✅ STRATEGIST (4.3s) — deepseek-reasoner          │
│    ┌ Thinking...                                  │
│    │ "Sleep content has performed well recently    │
│    │  (avg score 78), but we haven't tried the    │
│    │  'provoc' personality with sleep yet.         │
│    │  The trending topic 'blue light' synergizes  │
│    │  well with a myth_buster hook. Going with    │
│    │  provoc × sleep × myth_buster."               │
│    └                                               │
│    Strategy: provoc × sleep × myth_buster          │
│                                                    │
│ ✅ CREATOR (3.8s) — deepseek-chat                  │
│    Generated: "SLEEP EXPERTS ARE LYING ABOUT       │
│    BLUE LIGHT — HERE'S WHAT ACTUALLY HAPPENS"      │
│                                                    │
│ 🔄 CRITIC (2.1s) — deepseek-chat                  │
│    Score: 78/100 — REVISE                          │
│    Issues: Hook makes a claim but content lines    │
│    don't directly address blue light until point 4 │
│                                                    │
│ 🔄 CREATOR (3.2s) — revision 1                    │
│    Revised: moved blue light content to lines 1-2  │
│                                                    │
│ ✅ CRITIC (1.9s) — Score: 89/100 — ACCEPT          │
│                                                    │
│ ⏳ PUBLISHER — generating media...                 │
└──────────────────────────────────────────────────┘
```

### 11.3 Implementation: Execution Trace API

**New endpoint:** `GET /api/toby/trace/{schedule_id}` — returns the `AgentState.trace` for a specific content piece.

**New endpoint:** `GET /api/toby/trace/live` — returns the trace of the currently-executing pipeline (if any). For real-time updates, use Server-Sent Events (SSE) or poll every 2 seconds.

**New type:**
```typescript
// src/features/toby/types.ts

interface TobyTraceEntry {
  agent: 'scout' | 'strategist' | 'creator' | 'critic' | 'publisher' | 'reflector';
  started_at: string;
  finished_at?: string;
  summary: string;
  model?: string;
  tokens_used?: number;
  thinking?: string;         // Reasoner's chain-of-thought (for Strategist)
  scores?: Record<string, number>;  // Critic's dimension scores
  revision?: number;
}

interface TobyTrace {
  schedule_id: string;
  content_type: 'reel' | 'post';
  brand_id: string;
  entries: TobyTraceEntry[];
  status: 'running' | 'completed' | 'failed';
  final_score?: number;
}
```

**New component:** `TobyThinkingPanel.tsx` — displays the trace timeline. This becomes the centerpiece of the Overview tab, replacing or augmenting `TobyLiveStatus`.

### 11.4 Trace Storage

Store traces in `toby_activity_log.action_metadata` (already JSONB) with `action_type = "execution_trace"`. This avoids a new table and leverages existing activity feed infrastructure.

Alternatively, for richer querying, add a `toby_execution_traces` table:

```sql
CREATE TABLE toby_execution_traces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     VARCHAR(100) NOT NULL,
    schedule_id VARCHAR(36),
    content_type VARCHAR(10),
    brand_id    VARCHAR(50),
    trace       JSONB NOT NULL,  -- Array of TraceEntry objects
    status      VARCHAR(20) DEFAULT 'running',
    started_at  TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    total_tokens INTEGER DEFAULT 0,
    final_score FLOAT
);
```

---

## 12. Self-Correction Nodes

### 12.1 Image Self-Correction

**Problem:** AI image generation sometimes produces images with text (despite "no text" instructions), watermarks, or compositions that don't match the content.

**Solution:** Add an image validation step after deAPI returns:

```python
# app/services/toby/agents/image_validator.py

def validate_image(image_path: str, expected_mood: str) -> dict:
    """Validate AI-generated image for quality issues."""
    img = Image.open(image_path)

    checks = {
        "has_text": _detect_text_in_image(img),          # OCR check
        "too_dark": _check_brightness(img) < 30,
        "too_bright": _check_brightness(img) > 230,
        "wrong_aspect": abs(img.width/img.height - expected_ratio) > 0.05,
        "mostly_white": _check_white_percentage(img) > 0.6,
    }

    if any(checks.values()):
        return {"valid": False, "issues": [k for k, v in checks.items() if v]}
    return {"valid": True}
```

If validation fails, regenerate with a modified prompt (e.g., stronger "no text" instruction, different scene).

### 12.2 Caption Self-Correction

**Problem:** Generated captions sometimes lack required sections (disclaimer, follow CTA, source citation).

**Solution:** Post-generation validation in the Critic Agent:

```python
def _validate_caption(caption: str, ctx: PromptContext) -> List[str]:
    """Check caption meets NicheConfig requirements."""
    issues = []
    if ctx.disclaimer_text and ctx.disclaimer_text.lower() not in caption.lower():
        issues.append("Missing disclaimer text")
    if ctx.follow_section_text and "@" not in caption:
        issues.append("Missing follow CTA with handle")
    if ctx.citation_style != "none" and not re.search(r'\(.*\d{4}\)', caption):
        issues.append("Missing source citation")
    return issues
```

### 12.3 Title Self-Correction

The current `check_post_quality()` in `tracker.py` catches some issues (trailing periods, numbered starts, em dashes) but runs _after_ generation. Move these checks _into_ the Critic Agent so they can trigger revision:

```python
# In critic_agent
quality_check = check_post_quality(content["title"], content.get("caption", ""))
if not quality_check.passed:
    state.critic_issues.extend(quality_check.issues)
    state.quality_score -= quality_check.penalty_total
```

---

## 13. File-by-File Migration Map

### New Files to Create

```
app/services/toby/
├── agents/
│   ├── __init__.py
│   ├── scout.py            # Scout Agent
│   ├── strategist.py       # Strategist Agent (DeepSeek Reasoner)
│   ├── creator.py          # Creator Agent (DeepSeek Chat)
│   ├── critic.py           # Critic Agent (rule-based + AI)
│   ├── publisher.py        # Publisher Agent (existing media pipeline)
│   ├── reflector.py        # Reflector Agent (writes toby_reflections)
│   └── image_validator.py  # Image quality validation
├── graph.py                # StateGraph definition + routing
└── agent_state.py          # AgentState dataclass

app/models/
├── toby_reflections.py     # TobyReflection model

app/api/toby/
├── (update routes.py)      # Add trace endpoints

src/features/toby/
├── components/
│   └── TobyThinkingPanel.tsx  # New: trace visualization
├── types.ts                    # Add TobyTraceEntry, TobyTrace
├── api/toby-api.ts            # Add getTrace(), getLiveTrace()
└── hooks/use-toby.ts          # Add useTobyTrace(), useTobyLiveTrace()
```

### Files to Modify (Not Delete)

| File | Change | Why |
|---|---|---|
| `orchestrator.py` | Replace `_execute_content_plan()` with graph invocation | Core change — pipeline → graph |
| `learning_engine.py` | Add `update_immediate_quality()`, keep existing functions | Dual signal (immediate + delayed) |
| `analysis_engine.py` | No changes needed | Still runs the 48h/7d scoring loop |
| `quality_scorer.py` | No changes needed | Still used as Layer 1 in Critic |
| `generator.py` | Extract creation logic into `agents/creator.py`, keep as utility | Creator Agent calls generator methods |
| `prompt_templates.py` | Add `build_critic_prompt()`, `build_reflection_prompt()` | New prompt templates for new agents |
| `tracker.py` | No changes needed | Still used for history/dedup |
| `content_planner.py` | Simplify — graph handles strategy selection | Remove `create_plans_for_empty_slots` strategy logic |
| `buffer_manager.py` | No changes needed | Scout Agent uses it directly |
| `state.py` | No changes needed | Phase management unchanged |
| `discovery_manager.py` | Expose data retrieval for Scout Agent | Add `get_recent_trends()` function |
| `models/toby.py` | Keep existing, add `TobyReflection` import | New model alongside existing ones |
| `api/toby/routes.py` | Add trace endpoints | 2-3 new endpoints |
| `api/toby/schemas.py` | Add trace response schemas | New Pydantic models |

### Files NOT to Touch

| File | Why |
|---|---|
| `ai_background.py` | Image generation API unchanged (Phase 1) |
| `job_manager.py` | Job CRUD unchanged |
| `job_processor.py` | Media pipeline unchanged |
| `carousel_renderer.py` | Carousel rendering unchanged |
| `niche_config_service.py` | Config loading unchanged |
| `viral_patterns.py` | Pattern definitions still used by Creator |
| `prompt_context.py` | PromptContext dataclass unchanged |

---

## 14. Database Migrations

### Migration 1: `toby_reflections` table

```sql
-- New table for semantic memory
CREATE TABLE toby_reflections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    brand_id        VARCHAR(50),
    content_type    VARCHAR(10),
    schedule_id     VARCHAR(36),
    strategy        JSONB,
    quality_score   FLOAT,
    toby_score      FLOAT,
    reflection_text TEXT NOT NULL,
    insight_tags    JSONB DEFAULT '[]',
    lesson_type     VARCHAR(20),
    embedding       VECTOR(1536),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ix_reflections_user_type ON toby_reflections (user_id, content_type);
CREATE INDEX ix_reflections_lesson ON toby_reflections (user_id, lesson_type);
-- Note: pgvector extension must be enabled: CREATE EXTENSION IF NOT EXISTS vector;
-- CREATE INDEX ix_reflections_embedding ON toby_reflections USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### Migration 2: `toby_strategy_combos` table

```sql
CREATE TABLE toby_strategy_combos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    content_type    VARCHAR(10),
    combo_key       VARCHAR(500) NOT NULL,
    sample_count    INTEGER DEFAULT 0,
    avg_quality_score FLOAT DEFAULT 0.0,
    avg_toby_score  FLOAT DEFAULT 0.0,
    recent_scores   JSONB DEFAULT '[]',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX ix_combos_user_key ON toby_strategy_combos (user_id, content_type, combo_key);
```

### Migration 3: `toby_execution_traces` table

```sql
CREATE TABLE toby_execution_traces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    schedule_id     VARCHAR(36),
    content_type    VARCHAR(10),
    brand_id        VARCHAR(50),
    trace           JSONB NOT NULL,
    status          VARCHAR(20) DEFAULT 'running',
    started_at      TIMESTAMPTZ NOT NULL,
    completed_at    TIMESTAMPTZ,
    total_tokens    INTEGER DEFAULT 0,
    final_score     FLOAT
);

CREATE INDEX ix_traces_user ON toby_execution_traces (user_id, created_at DESC);
CREATE INDEX ix_traces_schedule ON toby_execution_traces (schedule_id);
```

---

## 15. New API Endpoints

### Traces

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/toby/trace/live` | Get trace of currently-running pipeline (if any) |
| `GET` | `/api/toby/trace/{schedule_id}` | Get trace for a specific content piece |
| `GET` | `/api/toby/traces?limit=10` | Recent traces list (paginated) |

### Reflections

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/toby/reflections?limit=10&type=success` | Paginated reflections with type filter |
| `GET` | `/api/toby/reflections/insights` | AI-generated summary of all reflections |

### Strategy Combos

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/toby/combos?content_type=reel` | Top-performing strategy combinations |

---

## 16. Implementation Phases

### Phase 1: Agent Decomposition (Backend Only)

**Goal:** Split `_execute_content_plan()` into agent functions without changing external behavior.

**What to do:**
1. Create `app/services/toby/agents/` directory
2. Extract Scout, Strategist, Creator, Critic, Publisher, Reflector as pure functions
3. Create `AgentState` dataclass in `agent_state.py`
4. Create `graph.py` with the StateGraph and routing logic
5. Refactor `_execute_content_plan()` to invoke the graph
6. Add execution trace logging to `toby_activity_log`

**What NOT to do:** Don't add new AI models, new tables, or frontend changes yet.

**Validation:** All existing tests pass. `validate_api.py` exits 0. Content generation produces the same output quality.

### Phase 2: Adversarial Critic

**Goal:** Add AI-powered critique as Layer 2 of quality evaluation.

**What to do:**
1. Add `build_critic_prompt()` to `prompt_templates.py`
2. Implement AI critique in `agents/critic.py`
3. Wire revision loop (Critic → Creator with feedback)
4. Add immediate quality signal to `learning_engine.py`

**Validation:** Critic catches issues that rule-based scorer misses. Revision loop produces measurably better content in 2nd/3rd attempts.

### Phase 3: Reflection Memory

**Goal:** Toby remembers why things worked or failed.

**What to do:**
1. Create `toby_reflections` migration
2. Implement `agents/reflector.py`
3. Add reflection retrieval to `agents/scout.py`
4. Add `/api/toby/reflections` endpoints

**Validation:** After 20+ content pieces, reflections contain actionable insights that improve subsequent strategy selection.

### Phase 4: Model Mixing (Reasoner R1)

**Goal:** Use DeepSeek Reasoner for strategic reasoning.

**What to do:**
1. Add Reasoner R1 call to `agents/strategist.py` (exploit mode only)
2. Store `reasoning_content` in execution trace
3. Add `/api/toby/trace/*` endpoints
4. Adjust cost tracking in `toby_state.spent_today_cents`

**Validation:** Strategist reasoning text shows genuine analytical thinking about strategy selection. Cost per generation tracked and within budget.

### Phase 5: "Thinking" UI

**Goal:** Show Toby's agent trace in the frontend.

**What to do:**
1. Add `TobyTraceEntry` and `TobyTrace` types
2. Add `getTrace()` and `getLiveTrace()` API methods
3. Add `useTobyTrace()` and `useTobyLiveTrace()` hooks
4. Create `TobyThinkingPanel.tsx` component
5. Integrate into `Toby.tsx` Overview tab

**Validation:** Users can see real-time agent execution when Toby is working. Completed content pieces have viewable traces showing all agent decisions.

### Phase 6: Image Pipeline + Combo Tracking

**Goal:** Smarter image composition and strategy combination awareness.

**What to do:**
1. Add dynamic overlay opacity based on image brightness
2. Create `toby_strategy_combos` table and tracking
3. Add combination-level Thompson Sampling
4. Add image validation node

**Validation:** Images have consistent readability regardless of background brightness. Strategy combos show differentiated performance from individual dimension scores.

---

## Appendix A: Current Constants Reference

From `learning_engine.py`:
```python
REEL_PERSONALITIES = {
    "edu_calm": "Calm, evidence-based health educator…",
    "provoc": "Challenges health myths, bold language…",
    "story": "Frames tips as mini-stories…",
    "data": "Leads with numbers and statistics…",
    "urgent": "Creates urgency around changes…",
}

POST_PERSONALITIES = {
    "deep_edu": "Thorough educational carousel content…",
    "myth_bust": "Each carousel debunks a common belief…",
    "listicle": "Numbered lists, one item per slide…",
    "compare": "'This vs That' comparisons…",
    "protocol": "Step-by-step guides and daily protocols…",
}

HOOK_STRATEGIES = ["question", "myth_buster", "shocking_stat", "personal_story", "bold_claim"]
TITLE_FORMATS = ["how_x_does_y", "number_one_mistake", "why_experts_say", "stop_doing_this", "hidden_truth"]
VISUAL_STYLES = ["dark_cinematic", "light_clean", "vibrant_bold"]
```

From `state.py`:
```python
BOOTSTRAP_MIN_POSTS = 10
BOOTSTRAP_MIN_DAYS = 7
LEARNING_MIN_DAYS = 30
```

From `orchestrator.py`:
```python
BUFFER_CHECK_INTERVAL = 5      # minutes
METRICS_CHECK_INTERVAL = 360   # minutes (6 hours)
ANALYSIS_CHECK_INTERVAL = 360  # minutes (6 hours)
```

From `quality_scorer.py`:
```python
WEIGHTS = {"structure": 0.25, "familiarity": 0.20, "novelty": 0.20, "hook": 0.20, "plausibility": 0.15}
# Thresholds: ≥80 publish, 65-79 regenerate, <65 reject
```

From `analysis_engine.py`:
```python
# Toby Score weights: raw_views=20%, relative_views=30%, engagement=40%, follower_context=10%
```

## Appendix B: External Dependencies

| Service | Current Usage | Agentic Reconstruction Impact |
|---|---|---|
| **DeepSeek Chat API** | All text generation | Same, but add Reasoner R1 for Strategist |
| **deAPI** | Image generation (ZImageTurbo_INT8) | Same, but add image validation step |
| **Instagram Graph API** | Metrics collection via MetricsCollector | No change |
| **Supabase (Postgres)** | All data storage | Add pgvector extension for embeddings |
| **Supabase Storage** | Image/video file storage | No change |
| **FFmpeg** | Video rendering (static image → MP4) | No change |
| **Node.js Konva** | Carousel PNG rendering | No change |
| **APScheduler** | 5-minute tick | No change — still triggers `toby_tick()` |

## Appendix C: Cost Estimation Per Content Piece

| Agent | Model | Input Tokens | Output Tokens | Approx Cost |
|---|---|---|---|---|
| Strategist (exploit only) | deepseek-reasoner | ~2000 | ~1000 | ~$0.015 |
| Creator (attempt 1) | deepseek-chat | ~1500 | ~800 | ~$0.003 |
| Critic | deepseek-chat | ~1200 | ~500 | ~$0.002 |
| Creator (revision, if needed) | deepseek-chat | ~2000 | ~800 | ~$0.003 |
| Critic (revision, if needed) | deepseek-chat | ~1200 | ~500 | ~$0.002 |
| Reflector | deepseek-chat | ~800 | ~300 | ~$0.001 |
| **Total (no revision)** | — | — | — | **~$0.021** |
| **Total (1 revision)** | — | — | — | **~$0.026** |
| **Total (explore, no revision)** | — | — | — | **~$0.006** |
| Image generation | deAPI ZImageTurbo_INT8 | — | — | ~$0.01 |

Current cost (no agentic): ~$0.003 per content piece (text only). The agentic version costs ~7-8x more for exploited content but produces higher-quality output with semantic evaluation and strategic reasoning.

At 8 content pieces/day × 30 days × $0.026 = ~$6.24/month per brand (exploit-heavy). With 30% exploration (no Reasoner): ~$4.50/month per brand.
