# THE TOBY AGENTIC RECONSTRUCTION

**Role:** You are the Lead AI Architect and Senior Systems Engineer. You are tasked with refactoring the "Toby" engine from a linear pipeline into a Multi-Agent Autonomous System (MAS). You have full access to the existing Python 3.11/FastAPI backend, the Supabase/PostgreSQL schema, and the React 18/TypeScript frontend.

You MUST read and understand the existing codebase before making any changes. Every instruction below references real files, real tables, and real functions — not hypotheticals.

---

## 1. THE VISION: FROM AUTOMATION TO AGENCY

The current system is a "smart scheduler with learning." It checks buffer slots, generates content via a single pipeline, posts on schedule, and updates Thompson Sampling scores. We are moving to **Agentic Autonomy**. Toby must no longer just "fill slots"; he must **own the brands**.

### Current State (What Exists Today)

**Architecture:** A 5-priority linear tick loop (`app/services/toby/orchestrator.py`) that runs every 5 minutes via APScheduler:

```
Priority 1: BUFFER CHECK  (every 5 min)   → Fill empty content slots
Priority 2: METRICS CHECK  (every 6 hours) → Collect Instagram/Facebook/YouTube metrics
Priority 3: ANALYSIS CHECK (every 6 hours) → Score posts, update Thompson Sampling
Priority 4: DISCOVERY CHECK (phase-dependent) → TrendScout scanning
Priority 5: PHASE CHECK    (every tick)    → Bootstrap → Learning → Optimizing
```

**Content Generation Pipeline** (`app/services/content/generator.py`):
1. `PatternSelector` picks title archetype, format, hook, topic from static patterns (`app/core/viral_patterns.py`)
2. `ContentGeneratorV2.generate_viral_content()` calls DeepSeek API with a minimal runtime prompt
3. `QualityScorer.score()` evaluates across 5 dimensions (structure, familiarity, novelty, hook, plausibility)
4. If score >= 80: accept. If 65-79: regenerate (up to 3 attempts). If < 65: reject.
5. `JobProcessor` creates images (Pillow), video (FFmpeg), captions (DeepSeek), uploads to Supabase Storage
6. `DatabaseSchedulerService` schedules for auto-publishing at the slot time

**Learning System** (`app/services/toby/learning_engine.py`):
- Thompson Sampling across 5 dimensions: personality, topic, hook, title_format, visual_style
- 30% explore / 70% exploit ratio (configurable via `TobyState.explore_ratio`)
- Strategy scores updated only from 7-day final scores (48h scores are early signals only)
- A/B experiments with min_samples threshold, auto-declares winners

**Key Limitation:** There is NO adversarial quality loop. The `QualityScorer` is a heuristic linter (regex + keyword matching), not an AI critic. Content that passes the score threshold gets published regardless of whether it actually matches the brand's Content DNA examples. There is NO reflection mechanism — Toby never asks "why did this post fail?"

### Target State

A decentralized pod of specialized agents (**Scout, Strategist, Creator, Critic**) that use a **Reasoning + Acting (ReAct)** framework to iterate on content until it hits a **"Viral-Ready" threshold (>85/100)**. The Critic is a separate AI call that compares output against the brand's Content DNA examples.

---

## 2. EXISTING CODEBASE MAP (YOU MUST READ THESE FILES)

### Backend Structure

```
app/
├── main.py                              # FastAPI app init, startup tasks, APScheduler registration
├── db_connection.py                     # SQLAlchemy engine, session factory, migrations
├── api/
│   ├── toby/
│   │   ├── routes.py                    # GET/POST /api/toby/* (status, enable, disable, reset, activity, experiments, insights, config)
│   │   └── schemas.py                   # TobyConfigUpdate pydantic model
│   ├── content/
│   │   ├── routes.py                    # Content endpoints
│   │   ├── jobs_routes.py               # Job CRUD
│   │   ├── reel_routes.py               # Reel generation
│   │   ├── schedule_routes.py           # Scheduling
│   │   └── publish_routes.py            # Publishing
│   ├── brands/routes.py                 # Brand CRUD
│   └── niche_config_routes.py           # NicheConfig (Content DNA) CRUD
├── models/
│   ├── toby.py                          # TobyState, TobyExperiment, TobyStrategyScore, TobyActivityLog, TobyContentTag
│   ├── brands.py                        # Brand model (id, credentials, colors, schedule_offset)
│   ├── niche_config.py                  # NicheConfig model (Content DNA — 40+ fields)
│   ├── scheduling.py                    # ScheduledReel model
│   ├── jobs.py                          # GenerationJob model
│   └── analytics.py                     # BrandAnalytics, PostPerformance, TrendingContent, ContentHistory
├── services/
│   ├── toby/
│   │   ├── orchestrator.py              # Main 5-min tick loop, _execute_content_plan()
│   │   ├── state.py                     # enable/disable/reset, phase transitions (bootstrap → learning → optimizing)
│   │   ├── buffer_manager.py            # Buffer health (healthy/low/critical), slot calculation per brand
│   │   ├── content_planner.py           # ContentPlan dataclass, create_plans_for_empty_slots(), record_content_tag()
│   │   ├── learning_engine.py           # Thompson Sampling: choose_strategy(), update_strategy_score(), experiments
│   │   ├── analysis_engine.py           # compute_toby_score(), get_brand_baseline(), score_pending_posts()
│   │   └── discovery_manager.py         # TrendScout scheduling wrapper (bootstrap=20min, normal=6-12h)
│   ├── content/
│   │   ├── generator.py                 # ContentGeneratorV2 — 3-layer architecture, DeepSeek API calls
│   │   ├── job_processor.py             # Full pipeline: text → images → video → captions → upload
│   │   ├── job_manager.py               # Job CRUD, status transitions
│   │   ├── differentiator.py            # Per-brand content differentiation
│   │   ├── tracker.py                   # Anti-repetition engine
│   │   └── niche_config_service.py      # Loads NicheConfig → PromptContext
│   ├── media/
│   │   ├── image_generator.py           # Pillow-based 1080x1920 image creation
│   │   ├── video_generator.py           # FFmpeg video from image + audio
│   │   ├── ai_background.py            # deAPI AI background generation (dark variant)
│   │   ├── caption_generator.py         # AI caption via DeepSeek
│   │   ├── caption_builder.py           # Caption formatting with CTAs, hashtags, disclaimers
│   │   └── carousel_renderer.py         # Node.js Konva script for carousel/post slides
│   ├── publishing/
│   │   ├── social_publisher.py          # Meta Graph API (IG reels, FB reels, IG carousels) + YouTube Data API
│   │   └── scheduler.py                 # DatabaseSchedulerService, auto-publish loop (60s checks)
│   └── analytics/
│       ├── analytics_service.py         # Fetch/cache brand metrics
│       ├── metrics_collector.py         # Per-brand IG metrics collection
│       └── trend_scout.py              # Trending content discovery (own accounts, competitors, hashtags)
├── core/
│   ├── viral_patterns.py                # LAYER 1: 8 title archetypes, 4 content formats, 5 hooks, PatternSelector
│   ├── prompt_templates.py              # LAYER 2: System prompt, runtime prompt builders, correction prompts
│   ├── prompt_context.py                # PromptContext dataclass (niche_name, topics, tone, examples, personality_modifier)
│   ├── quality_scorer.py                # 5-dimension heuristic scorer (structure, familiarity, novelty, hook, plausibility)
│   ├── viral_ideas.py                   # Static viral ideas database (for rare example injection)
│   ├── constants.py                     # Layout & styling constants
│   └── brand_colors.py                  # Brand color schemes
└── utils/
    ├── ffmpeg.py                        # FFmpeg wrapper
    ├── fonts.py                         # Font loading
    └── text_layout.py                   # Text layout calculations
```

### Frontend Structure

```
src/
├── pages/
│   ├── Toby.tsx                         # Toby dashboard with 4 tabs (Overview, Experiments, Insights, Settings)
│   ├── Home.tsx                         # Dashboard with schedule coverage, brand health
│   ├── Brands.tsx                       # Brand management + NicheConfig form
│   ├── Generator.tsx                    # Manual content generation
│   ├── Scheduled.tsx                    # Scheduled content timeline
│   └── Analytics.tsx                    # Performance metrics
├── features/toby/
│   ├── components/
│   │   ├── TobyStatusBar.tsx            # On/off toggle, phase indicator, buffer health
│   │   ├── TobyLiveStatus.tsx           # Real-time action pipeline visualization
│   │   ├── TobyActivityFeed.tsx         # Timestamped event timeline
│   │   ├── TobyBufferStatus.tsx         # Buffer fill %, per-brand breakdown
│   │   ├── TobyExperiments.tsx          # A/B test card view with results
│   │   ├── TobyInsights.tsx             # Best strategies ranked by dimension
│   │   └── TobySettings.tsx             # Config sliders (buffer days, explore ratio, slots/day)
│   ├── api/toby-api.ts                  # HTTP client for all Toby endpoints
│   ├── hooks/use-toby.ts               # React Query hooks (15s refetch for status)
│   └── types.ts                         # TobyPhase, TobyStatus, TobyExperiment, TobyInsights, etc.
└── features/brands/
    └── components/NicheConfigForm.tsx   # Full Content DNA configuration form
```

### Database Schema (Supabase/PostgreSQL)

**Toby Tables:**
| Table | Purpose | Key Columns |
|---|---|---|
| `toby_state` | Per-user config & lifecycle | enabled, phase (bootstrap\|learning\|optimizing), buffer_days, explore_ratio, reel_slots_per_day, post_slots_per_day, last_*_check_at |
| `toby_experiments` | A/B test definitions | content_type, dimension, options (JSON), results (JSON), status (active\|completed), winner, min_samples |
| `toby_strategy_scores` | Thompson Sampling params | dimension, option_value, sample_count, total_score, avg_score, score_variance, best_score, worst_score, recent_scores (JSON last 10) |
| `toby_content_tags` | Links strategy metadata to content | schedule_id, personality, topic_bucket, hook_strategy, title_format, visual_style, experiment_id, toby_score, score_phase (48h\|7d) |
| `toby_activity_log` | Audit trail | action_type, description, metadata (JSON), level (info\|warning\|error\|success) |

**Content Tables:**
| Table | Purpose | Key Columns |
|---|---|---|
| `generation_jobs` | Media generation tracking | job_id, status, title, content_lines (JSON), variant (light\|dark\|post), brands (JSON), brand_outputs (JSON), created_by (user\|toby) |
| `scheduled_reels` | Auto-publish queue | schedule_id, reel_id, scheduled_time, status (scheduled\|publishing\|published\|failed), extra_data (JSON with media URLs), created_by |
| `niche_config` | Content DNA per brand | 40+ fields: niche_name, content_tone, topic_categories, reel_examples, post_examples, hook_themes, cta_options, competitor_accounts, citation_style, etc. |
| `post_performance` | Per-post Instagram metrics | views, likes, comments, saves, shares, reach, engagement_rate, performance_score, published_at, metrics_*_at |
| `brand_analytics` | Cached brand-level metrics | followers_count, views_7day, likes_7day |
| `trending_content` | Discovery results | source (own\|competitor\|hashtag), metrics |

**Table that does NOT exist yet but is referenced in the vision:**
| Table | Purpose |
|---|---|
| `toby_reflections` | Post-mortem analysis. Toby's self-written analysis of why a post failed or succeeded. |

---

## 3. CORE ARCHITECTURAL REQUIREMENTS

### 3.1 The State Graph

**Current:** `orchestrator.py` uses a flat priority list (`_process_user` → runs checks sequentially).

**Required:** Replace the linear `Step 1 → Step 2` logic with a **StateGraph**. The state must track:

```python
@dataclass
class AgentState:
    """Shared state that flows through the agent graph."""
    brand_id: str
    content_type: str  # "reel" or "post"

    # Research phase
    raw_research: dict          # TrendScout findings, competitor analysis
    brand_dna_context: dict     # Loaded from NicheConfig (reel_examples, post_examples, tone, topics)
    performance_history: dict   # Recent toby_strategy_scores, brand baseline

    # Strategy phase
    strategy_choice: StrategyChoice  # From learning_engine.py
    strategy_reasoning: str          # NEW: Why this strategy was chosen (not just random/exploit)

    # Creation phase
    draft_versions: list[dict]  # Multiple draft attempts with scores
    current_draft: dict         # Active draft being refined

    # Critique phase
    critic_feedback: list[dict] # Detailed JSON of failures per draft
    critic_score: float         # 0-100, must exceed 85 to pass

    # Reflection phase
    reflection_notes: str       # Post-mortem if score < 40 after 7 days
```

**Implementation location:** Create `app/services/toby/agents/state_graph.py`

**Key constraint:** The StateGraph must integrate with the existing `_execute_content_plan()` in `orchestrator.py` — it replaces the linear flow inside that function, not the outer orchestration loop.

### 3.2 The Agent Pod

Create `app/services/toby/agents/` directory with these specialized agents:

#### Scout Agent (`scout.py`)
**Current state:** `discovery_manager.py` wraps `TrendScout` but only stores results in `trending_content` table. Nobody reads them during content creation.

**Required changes:**
- Before content generation, Scout must query `trending_content` for the brand's niche
- Cross-reference trending topics with the brand's `niche_config.topic_categories` and `topic_keywords`
- Query `post_performance` to find which topics are performing above the brand baseline (from `analysis_engine.py:get_brand_baseline()`)
- Return a `ResearchBrief` with: trending_topics, high_performing_patterns, competitor_insights, audience_signals
- Scout must also query the `toby_reflections` table (new) to avoid repeating past mistakes

#### Strategist Agent (`strategist.py`)
**Current state:** `learning_engine.py:choose_strategy()` does a simple explore/exploit coin flip per dimension. It never explains *why* it chose a strategy.

**Required changes:**
- Receive `ResearchBrief` from Scout + `TobyStrategyScore` data from the learning engine
- Instead of random selection during explore, use DeepSeek-Reasoner (R1) to reason about which strategy to test and why
- During exploit, use Thompson Sampling weights as *input* to the AI, not just the selection mechanism. The AI should articulate: "I'm choosing `provoc` personality because it has avg_score 72.3 with only 8 samples vs `edu_calm` at 68.1 with 23 samples — the variance suggests `provoc` may be underexplored for this brand"
- Output a `StrategyDecision` that includes the choice + the reasoning (stored in `toby_activity_log`)
- The strategy reasoning must reference the brand's `niche_config.content_philosophy` and `brand_personality`

#### Creator Agent (`creator.py`)
**Current state:** `ContentGeneratorV2.generate_viral_content()` calls DeepSeek once, scores with `QualityScorer`, retries up to 3 times.

**Required changes:**
- Receive `StrategyDecision` from Strategist
- Generate draft content using the existing 3-layer architecture (Pattern Brain → Prompt Templates → Runtime Input)
- **Critical:** The Creator must also receive the brand's `niche_config.reel_examples` (or `post_examples`) as few-shot examples. Currently this only happens when `build_prompt_with_example()` is called, but it's inconsistent.
- After generating, pass to Critic instead of self-scoring with the heuristic `QualityScorer`
- If Critic rejects, Creator must revise using the specific feedback (not just regenerate from scratch)
- Maximum 4 Creator↔Critic loops before escalating to the Strategist for a strategy pivot

#### Critic Agent (`critic.py`)
**Current state:** `QualityScorer` in `app/core/quality_scorer.py` uses regex and keyword matching. It checks structural rules (ALL CAPS title, word limits, no emojis) and heuristic signals (hook keywords, plausibility blacklist). **It never compares against the brand's actual Content DNA examples.**

**Required changes:**
- The Critic is a separate DeepSeek-Reasoner (R1) call — it does NOT generate content, it only evaluates
- It must receive: (a) the Creator's draft, (b) the brand's `niche_config.reel_examples` or `post_examples`, (c) the `StrategyDecision` reasoning
- Return a detailed JSON evaluation:

```json
{
  "overall_score": 82,
  "viral_ready": false,
  "dimensions": {
    "dna_alignment": {
      "score": 75,
      "issues": ["Hook uses generic 'Did you know...' — brand DNA examples never use question hooks, they use bold claims"],
      "exemplar_comparison": "Example #3 ('8 SIGNS YOUR GUT IS SCREAMING') uses fear+urgency, but draft uses mild curiosity"
    },
    "hook_strength": {
      "score": 88,
      "issues": []
    },
    "structural_compliance": {
      "score": 90,
      "issues": ["Line 4 exceeds 8-word limit for SHORT_FRAGMENT format"]
    },
    "novelty": {
      "score": 70,
      "issues": ["Title pattern '{NUMBER} SIGNS OF {X}' was used 3 times in last 7 days"]
    },
    "plausibility": {
      "score": 95,
      "issues": []
    }
  },
  "revision_directives": [
    "Replace question hook with bold claim hook per brand DNA",
    "Shorten line 4 to under 8 words",
    "Consider using 'HABITS DESTROYING YOUR {X}' archetype instead — less saturated this week"
  ]
}
```

- **Viral-Ready threshold:** `overall_score >= 85` AND no dimension below 70
- The existing `QualityScorer` should still run as a fast pre-filter (reject obvious structural failures before wasting an AI call on the Critic)

### 3.3 Adversarial Loop (Creator ↔ Critic)

```
Scout → Strategist → Creator → Critic
                        ↑         ↓
                        └── (if score < 85, max 4 loops)
                              ↓
                        (if 4 loops exhausted)
                              ↓
                      Strategist (pivot strategy)
                              ↓
                        Creator → Critic (2 more loops max)
                              ↓
                        (if still failing)
                              ↓
                      LOG FAILURE + skip slot
```

**Implementation:** This replaces the current 3-attempt regeneration loop in `ContentGeneratorV2.generate_viral_content()`.

### 3.4 Vectorized Memory: The Reflection Log

**New table:** `toby_reflections`

```sql
CREATE TABLE toby_reflections (
    id          VARCHAR(36) PRIMARY KEY,
    user_id     VARCHAR(100) NOT NULL,
    brand_id    VARCHAR(50),
    schedule_id VARCHAR(36) REFERENCES scheduled_reels(schedule_id),
    content_tag_id VARCHAR(36) REFERENCES toby_content_tags(id),

    -- What happened
    content_type    VARCHAR(10),    -- reel | post
    title           TEXT,
    toby_score      FLOAT,
    score_phase     VARCHAR(10),    -- 48h | 7d

    -- Strategy that was used
    personality     VARCHAR(50),
    topic_bucket    VARCHAR(50),
    hook_strategy   VARCHAR(50),
    title_format    VARCHAR(50),
    visual_style    VARCHAR(50),

    -- The reflection (AI-generated post-mortem)
    reflection_type VARCHAR(20),    -- post_mortem | success_analysis | strategy_pivot
    reflection_text TEXT NOT NULL,  -- Full AI analysis of why it failed/succeeded
    key_learnings   JSON,           -- ["Hook too generic", "Topic over-saturated this week"]
    action_items    JSON,           -- ["Avoid question hooks for this brand", "Increase urgency in titles"]

    -- Metrics at time of reflection
    metrics_snapshot JSON,          -- {views, likes, saves, shares, brand_baseline_avg}

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reflections_user_brand ON toby_reflections(user_id, brand_id);
CREATE INDEX idx_reflections_score ON toby_reflections(toby_score);
```

**How it's used:**
1. **Self-Correction trigger:** In `analysis_engine.py:score_pending_posts()`, after scoring a 7-day post — if `toby_score < 40`, automatically trigger a "Post-Mortem" reflection using DeepSeek-Reasoner
2. **Success analysis:** If `toby_score > 80`, write a "Success Analysis" to understand what worked
3. **Pre-generation query:** Before Scout starts research for a brand, query the last 10 reflections: "Why did the '8 Signs' hook fail for Longevity College last Tuesday?" and inject key_learnings into the ResearchBrief
4. **Strategy pivot:** If 3+ consecutive posts for a brand score < 50, Strategist must consult reflections and explicitly pivot away from the failing patterns

### 3.5 Model Mixing

**Current:** All AI calls go to DeepSeek-Chat via `ContentGeneratorV2` (API: `https://api.deepseek.com/v1`).

**Required model routing:**

| Agent | Model | Rationale |
|---|---|---|
| Creator | DeepSeek-Chat | High-volume content drafting — fast, cheap |
| Critic | DeepSeek-Reasoner (R1) | Deep logical comparison against Content DNA — needs chain-of-thought |
| Strategist | DeepSeek-Reasoner (R1) | Strategic reasoning about explore/exploit decisions |
| Scout | DeepSeek-Chat | Research synthesis — doesn't need deep reasoning |
| Reflection Writer | DeepSeek-Reasoner (R1) | Post-mortem analysis requires nuanced reasoning |

**Implementation:** Add a `model` parameter to the DeepSeek API call in `generator.py`. DeepSeek-Reasoner uses the same API endpoint but with `model: "deepseek-reasoner"` instead of `model: "deepseek-chat"`.

---

## 4. PRODUCT DESIGN & USER EXPERIENCE

### 4.1 The "Thinking" UI: Replace Activity Timeline with Thought Stream

**Current state:** `TobyActivityFeed.tsx` shows a flat list of timestamped events:
```
✅ Generated 1 pieces of content to fill buffer
ℹ️ Collected metrics for 3 posts
ℹ️ Scored 2 posts (48h phase)
```

**Required:** Replace with a **Thought Stream** that shows Toby's internal reasoning:

```
🔍 Scout: Scanning Longevity College trends... Found 3 viral posts about lycopene in competitor @drberg
🧠 Strategist: Selected "Myth Buster" pattern based on new study on Lycopene.
   Reasoning: "provoc" personality has 72.3 avg score (8 samples) vs "edu_calm" at 68.1 (23 samples).
   Brand DNA says "challenge common beliefs" — myth_buster aligns.
✍️ Creator: Draft 1 generated — "8 MYTHS ABOUT LYCOPENE YOUR DOCTOR WON'T TELL YOU"
❌ Critic: Rejected Draft 1 (Score: 71/100)
   - Hook too generic ("Your Doctor Won't Tell You" overused — used 2x this week)
   - DNA mismatch: Brand examples never use conspiracy framing
✍️ Creator: Revised — "LYCOPENE: 8 THINGS MOST PEOPLE GET WRONG"
✅ Critic: Approved Draft 2 (Score: 92/100)
   - Strong myth_buster alignment with brand DNA Example #3
   - Novel title pattern (not used in 14 days)
📅 Scheduled for tomorrow 10:00 AM
```

**Implementation:**
- Extend `toby_activity_log.action_metadata` to include structured agent data:
  ```json
  {
    "agent": "critic",
    "draft_number": 1,
    "score": 71,
    "dimensions": {...},
    "revision_directives": [...]
  }
  ```
- New frontend component: `TobyThoughtStream.tsx` (replaces `TobyActivityFeed.tsx`)
- Group events by content generation session (all events for one piece of content grouped together)
- Collapsible detail view: click to expand full Critic feedback JSON

### 4.2 Brand-Specific Agent Personality

**Current state:** `NicheConfig` stores `brand_personality` as a text field and `content_tone` as a JSON array, but these are only loosely injected into `PromptContext.personality_modifier`.

**Required:** Each brand must feel like it has its own dedicated AI employee. The `NicheConfig` must be treated as a **"Neural Constraint"** that dictates the personality of that brand's specific Agent Pod.

**Implementation:**
- When the Agent Pod starts for a brand, load the full `NicheConfig` and create a `BrandConstraints` object:
  ```python
  @dataclass
  class BrandConstraints:
      brand_id: str
      personality_voice: str       # From niche_config.brand_personality
      allowed_tones: list[str]     # From niche_config.content_tone
      forbidden_tones: list[str]   # From niche_config.tone_avoid
      topic_universe: list[str]    # From niche_config.topic_categories
      forbidden_topics: list[str]  # From niche_config.topic_avoid
      hook_preferences: list[str]  # From niche_config.hook_themes
      reel_exemplars: list[dict]   # From niche_config.reel_examples
      post_exemplars: list[dict]   # From niche_config.post_examples
      content_philosophy: str      # From niche_config.content_philosophy
      cta_templates: list[dict]    # From niche_config.cta_options
      citation_style: str          # From niche_config.citation_style
  ```
- Pass `BrandConstraints` to every agent in the pod
- Critic must validate against `BrandConstraints.reel_exemplars` — if the draft doesn't "feel like" the examples, it fails the `dna_alignment` dimension

### 4.3 Dashboard Enhancements

**New Toby tab: "Agent Insights"**

Beyond the current Insights tab (which only shows strategy rankings), add:
- **Reflection Feed:** Last 20 reflections with expandable post-mortems
- **Brand DNA Compliance Score:** Rolling average of Critic's `dna_alignment` scores per brand
- **Strategy Drift Monitor:** Visualization showing how Toby's strategy preferences have shifted over time (plot `avg_score` per dimension over weeks)
- **Failure Pattern Analysis:** "Your top 3 failure modes: (1) Question hooks score 23% below bold claims, (2) 'nutrition' topic saturated — 12 posts in 7 days, (3) Dark variant underperforms light by 15% for this brand"

---

## 5. TECHNICAL IMPLEMENTATION DETAILS

### 5.1 Directory Structure Changes

```
app/services/toby/
├── orchestrator.py              # MODIFY: Replace _execute_content_plan() internals with agent graph
├── state.py                     # KEEP AS-IS (phase transitions work correctly)
├── buffer_manager.py            # KEEP AS-IS (slot calculation is correct)
├── content_planner.py           # MODIFY: Inject BrandConstraints into ContentPlan
├── learning_engine.py           # MODIFY: Add strategy_reasoning to StrategyChoice
├── analysis_engine.py           # MODIFY: Trigger reflections on extreme scores
├── discovery_manager.py         # MODIFY: Pass discoveries to Scout agent
├── agents/                      # NEW DIRECTORY
│   ├── __init__.py
│   ├── state_graph.py           # AgentState + graph execution
│   ├── scout.py                 # Scout agent (research + reflection query)
│   ├── strategist.py            # Strategist agent (reasoned strategy selection)
│   ├── creator.py               # Creator agent (content generation + revision)
│   ├── critic.py                # Critic agent (adversarial evaluation)
│   ├── reflector.py             # Reflection writer (post-mortem + success analysis)
│   └── brand_constraints.py     # BrandConstraints loader from NicheConfig
└── ...existing files...
```

### 5.2 Refactor Thompson Sampling

**Current (`learning_engine.py:_pick_dimension()`):**
```python
def _pick_dimension(db, user_id, brand_id, content_type, dimension, options, is_explore):
    if is_explore or not options:
        return random.choice(options)  # Pure random — no reasoning

    # Exploit: just pick highest avg_score
    scores = db.query(TobyStrategyScore)...order_by(avg_score.desc()).first()
    return scores.option_value if scores else random.choice(options)
```

**Required:**
```python
def pick_dimension_with_reasoning(db, user_id, brand_id, content_type, dimension, options, is_explore, brand_constraints):
    all_scores = db.query(TobyStrategyScore).filter(
        user_id=user_id, content_type=content_type, dimension=dimension
    ).all()

    scores_summary = {s.option_value: {
        "avg_score": s.avg_score,
        "sample_count": s.sample_count,
        "variance": s.score_variance,
        "recent_trend": s.recent_scores[-5:],
        "best": s.best_score,
        "worst": s.worst_score,
    } for s in all_scores}

    if is_explore:
        # Instead of random, use DeepSeek-Reasoner to pick intelligently
        prompt = f"""You are choosing a {dimension} strategy for a {content_type}.

        Brand personality: {brand_constraints.personality_voice}
        Content philosophy: {brand_constraints.content_philosophy}

        Available options and their performance:
        {json.dumps(scores_summary, indent=2)}

        Pick the option most worth exploring. Consider:
        - Options with high variance (inconsistent) may have untapped potential
        - Options with few samples need more data
        - Options that align with the brand's stated philosophy

        Return JSON: {{"choice": "option_name", "reasoning": "why"}}"""

        result = call_deepseek_reasoner(prompt)
        return result["choice"], result["reasoning"]
    else:
        # Exploit still uses max avg_score, but explain why
        best = max(all_scores, key=lambda s: s.avg_score)
        reasoning = f"Exploiting {best.option_value} (avg {best.avg_score:.1f}, {best.sample_count} samples)"
        return best.option_value, reasoning
```

### 5.3 API Validation: Agent Health Checks

**Current:** `app/api/system/health_routes.py` checks DB connectivity and API availability.

**Required additions to health check:**
- **Agent Loop Health:** Track Creator↔Critic loop counts per generation. Alert if average loops > 3 (suggests prompts need tuning).
- **Hallucination Detection:** If Critic returns a score but its `dimensions` don't contain valid keys, log as hallucination.
- **Infinite Loop Guard:** In `state_graph.py`, hard-cap total agent calls per content piece at 15 (across all agents). If exceeded, abort and log.
- **Cost Tracking:** Track DeepSeek API token usage per agent per generation. Store in `toby_activity_log.metadata`. Alert if a single content piece exceeds 50K tokens (likely a loop).

**New endpoint:**
```
GET /api/toby/agent-health
→ {
    "avg_loops_per_content": 2.3,
    "max_loops_seen": 5,
    "hallucination_count_24h": 0,
    "aborted_generations_24h": 1,
    "avg_tokens_per_content": 12400,
    "total_cost_24h_cents": 34
  }
```

### 5.4 Image Layering: Art Director Intelligence

**Current:** `image_generator.py` uses fixed layout constants from `app/core/constants.py`. Font sizes, positions, and colors are deterministic based on content length.

**Required:** Allow the Creator/Critic loop to influence visual decisions:

- When the visual_style dimension is selected (dark_cinematic, light_clean, vibrant_bold), the Critic should evaluate visual parameters too
- For dark variant backgrounds (AI-generated via `ai_background.py`), the background complexity affects text readability. If the Critic flags "background is busy", the image generator should:
  - Increase overlay opacity (currently from `niche_config.carousel_cover_overlay_opacity`)
  - Increase title font size (suggest 100-120px instead of default)
  - Add text shadow/stroke for readability

**Implementation path:** Add an optional `visual_directives` field to the AgentState that flows from Critic back to Creator, then to `image_generator.py`:
```python
visual_directives = {
    "title_font_size_override": 110,
    "overlay_opacity_override": 0.7,
    "text_shadow": True,
    "reason": "Background is busy — increase contrast"
}
```

### 5.5 Self-Correction Node

**Trigger conditions in `analysis_engine.py:score_pending_posts()`:**

After computing `toby_score` for a 7-day post:
- If `toby_score < 40`: Trigger **Post-Mortem reflection** via DeepSeek-Reasoner
- If `toby_score > 80`: Trigger **Success Analysis** via DeepSeek-Reasoner
- If 3+ consecutive posts for same brand score < 50: Trigger **Strategy Pivot** — increase `explore_ratio` to 0.50 temporarily and log why

**Post-Mortem prompt template:**
```
You are analyzing why a social media post underperformed.

BRAND: {brand_name}
BRAND PERSONALITY: {niche_config.brand_personality}
CONTENT DNA EXAMPLES: {niche_config.reel_examples}

POST THAT FAILED:
- Title: {title}
- Strategy used: personality={personality}, topic={topic}, hook={hook}
- Toby Score: {score}/100 (brand average: {baseline_avg})
- Metrics: views={views}, saves={saves}, shares={shares}

RECENT REFLECTIONS FOR THIS BRAND:
{last_5_reflections}

Analyze:
1. Why did this post fail relative to the brand baseline?
2. Was the strategy choice misaligned with the brand DNA?
3. What specific content elements weakened performance?
4. What should Toby avoid next time for this brand?

Return JSON:
{
  "failure_category": "hook_mismatch" | "topic_saturation" | "poor_timing" | "dna_misalignment" | "low_novelty",
  "root_cause": "detailed explanation",
  "key_learnings": ["learning 1", "learning 2"],
  "action_items": ["avoid X", "try Y instead"],
  "confidence": 0.0-1.0
}
```

---

## 6. THE META-PROMPT: DERIVING THE HIDDEN FORMULA

### 6.1 Content DNA Analysis

The `niche_config.reel_examples` and `post_examples` fields contain the brand owner's curated examples of ideal content. Currently, these are injected as few-shot examples into the generation prompt (via `build_prompt_with_example()` in `prompt_templates.py`), but the system never **analyzes the patterns across examples** to derive a formula.

**Required: The "DNA Extraction" Meta-Prompt**

When a brand's `NicheConfig` is saved (or updated), run this analysis:

```
You are a viral content analyst. Below are {N} curated examples of ideal content for the brand "{brand_name}".

EXAMPLES:
{all_reel_examples_or_post_examples}

Analyze these examples and extract the hidden formula. Look for:

1. EMOTIONAL PATTERN: What emotional arc do these examples follow?
   (e.g., Fear → Curiosity → Hope, or Shock → Authority → Action)

2. HOOK FORMULA: What hook structure appears in 80%+ of examples?
   (e.g., "Counter-intuitive truth" or "Hidden danger reveal")

3. STRUCTURAL FINGERPRINT: What content format dominates?
   (e.g., Short fragments with em-dashes, Cause-effect chains)

4. VOCABULARY DNA: What words/phrases appear repeatedly?
   List the top 20 "signature words" that define this brand's voice.

5. PSYCHOLOGICAL TRIGGERS: Which of these triggers dominate?
   - Fear (damage, disease, silent killers)
   - Curiosity (secrets, hidden truths, counter-intuitive)
   - Authority (experts, research, studies)
   - Control (simple actions, daily habits)
   - Hope (reverse, prevent, improve)

6. ANTI-PATTERNS: What do these examples NEVER do?
   (e.g., "Never use question hooks", "Never reference specific products")

Return JSON:
{
  "emotional_arc": "Fear → Curiosity → Control",
  "primary_hook_formula": "Counter-intuitive truth that challenges a common belief",
  "secondary_hook_formula": "Hidden danger in everyday habit",
  "dominant_format": "SHORT_FRAGMENT with em-dash separators",
  "signature_vocabulary": ["silently", "destroying", "most people", ...],
  "primary_trigger": "fear",
  "secondary_trigger": "curiosity",
  "anti_patterns": ["Never use question hooks", "Never reference specific brands"],
  "golden_rules": [
    "Always open with a bold claim, never a question",
    "Use 7-10 short fragments, not full sentences",
    "End with a hope/control element after fear opening"
  ],
  "confidence": 0.85
}
```

**Storage:** Add a `dna_analysis` JSON column to `niche_config` table. This is the extracted formula that the Critic references.

**Usage:** The Critic's `dna_alignment` dimension compares the draft against `dna_analysis.golden_rules`, `signature_vocabulary`, and `anti_patterns` — not just the raw examples.

### 6.2 The Toby Orchestrator Meta-Prompt

The top-level reasoning prompt that drives the Strategist:

```
You are Toby, an autonomous content strategist for the brand "{brand_name}".

YOUR MISSION: Create content that will go viral for this brand. You "own" this brand.

BRAND DNA (extracted from {N} curated examples):
{dna_analysis JSON}

CURRENT PERFORMANCE:
- Brand followers: {followers}
- 14-day avg views: {baseline_avg_views}
- 14-day avg engagement: {baseline_avg_engagement}
- Best performing strategy: {top_strategy} (avg score: {top_score})
- Worst performing strategy: {worst_strategy} (avg score: {worst_score})

RECENT REFLECTIONS (lessons learned):
{last_5_reflections as bullet points}

THOMPSON SAMPLING STATE:
{strategy_scores_summary per dimension}

TRENDING IN NICHE:
{scout_research_brief}

TASK: Choose the strategy for the next {content_type}.
Consider the brand DNA, recent failures, trending topics, and your Thompson Sampling data.
Explain your reasoning step by step.

Return JSON:
{
  "personality": "choice",
  "topic_bucket": "choice",
  "hook_strategy": "choice",
  "title_format": "choice",
  "visual_style": "choice",
  "reasoning": "detailed explanation of why each dimension was chosen",
  "confidence": 0.0-1.0,
  "risk_level": "safe" | "moderate" | "experimental"
}
```

---

## 7. EVOLUTION MECHANISM: AUTONOMOUS ADAPTATION

### 7.1 Follower Fluctuation Response

**Trigger:** `analytics_service.py` refreshes brand metrics every 6 hours. When `brand_analytics.followers_count` changes:

- **Drop > 1%:** Toby writes a reflection asking "Why are we losing followers?" and temporarily increases `explore_ratio` by 0.1 (max 0.60)
- **Growth > 2%:** Toby writes a success reflection analyzing what's working and slightly decreases `explore_ratio` by 0.05 (min 0.15)
- **Plateau (< 0.1% change for 14 days):** Toby triggers a "Creative Shakeup" — force all next 5 content pieces to use explore mode regardless of exploit score

**Implementation:** New function in `analysis_engine.py`:
```python
def check_follower_health(db, user_id, brand_id):
    """Compare current followers to 7-day-ago snapshot. Trigger adaptation if needed."""
    current = get_current_followers(db, brand_id)
    week_ago = get_followers_at(db, brand_id, days_ago=7)

    if week_ago == 0:
        return  # Not enough data

    change_pct = (current - week_ago) / week_ago * 100

    if change_pct < -1.0:
        trigger_follower_drop_response(db, user_id, brand_id, change_pct)
    elif change_pct > 2.0:
        trigger_growth_response(db, user_id, brand_id, change_pct)
    elif abs(change_pct) < 0.1 and has_been_flat_for_days(db, brand_id, 14):
        trigger_creative_shakeup(db, user_id, brand_id)
```

### 7.2 Continuous DNA Refinement

Every 30 days, Toby should re-run the DNA Extraction meta-prompt but include the brand's **top 10 performing posts from the last 30 days** alongside the original curated examples. This lets the DNA analysis evolve as the brand discovers new patterns that work.

Store the evolution history:
```sql
ALTER TABLE niche_config ADD COLUMN dna_analysis JSON;
ALTER TABLE niche_config ADD COLUMN dna_analysis_history JSON DEFAULT '[]';
ALTER TABLE niche_config ADD COLUMN dna_last_analyzed_at TIMESTAMP WITH TIME ZONE;
```

---

## 8. MIGRATION STRATEGY

### Phase 1: Foundation (Non-Breaking)
1. Create `app/services/toby/agents/` directory
2. Create `toby_reflections` table migration
3. Add `dna_analysis` column to `niche_config`
4. Implement `brand_constraints.py` (loads from existing NicheConfig)
5. Implement `reflector.py` (Post-mortem writer — can run standalone from `analysis_engine.py`)
6. Add reflection trigger to `score_pending_posts()` — this works without other agents

### Phase 2: Agent Implementation
7. Implement `scout.py` (wraps existing TrendScout + reflection queries)
8. Implement `critic.py` (new DeepSeek-Reasoner call for adversarial evaluation)
9. Implement `strategist.py` (enhanced `choose_strategy` with reasoning)
10. Implement `creator.py` (wraps existing `ContentGeneratorV2` with revision support)
11. Implement `state_graph.py` (orchestrates Scout → Strategist → Creator ↔ Critic)

### Phase 3: Integration
12. Modify `orchestrator.py:_execute_content_plan()` to use agent graph instead of direct pipeline
13. Add feature flag: `TOBY_AGENT_MODE=true` env var to switch between old and new paths
14. Update `TobyActivityLog` entries to include agent metadata
15. Implement DNA Extraction on NicheConfig save

### Phase 4: Frontend
16. Create `TobyThoughtStream.tsx` component
17. Add Agent Insights tab with reflection feed and DNA compliance scores
18. Add agent-health endpoint and display in admin

### Phase 5: Evolution
19. Implement follower fluctuation response
20. Implement 30-day DNA re-analysis
21. Implement strategy pivot on consecutive failures
22. Cost tracking and budget alerts

---

## 9. CRITICAL CONSTRAINTS

1. **Backwards compatibility:** The existing manual content generation flow (Generator page → JobProcessor) must not break. Agent mode only activates for Toby-generated content.
2. **Cost awareness:** Each content piece currently costs ~$0.002 in DeepSeek tokens. With the agent pod (Scout + Strategist + Creator + Critic × 2 loops + possible Reflector), expect ~$0.02-0.05 per piece. At 8 pieces/day × 2 brands = $0.32-0.80/day. Track this.
3. **Latency:** Current generation takes ~60-120 seconds (mostly image/video). Agent reasoning adds ~10-30 seconds of AI calls. Total should stay under 180 seconds per content piece.
4. **Rate limits:** DeepSeek-Reasoner has lower rate limits than DeepSeek-Chat. Queue Critic calls with backoff. Never fire more than 2 Reasoner calls in parallel.
5. **Railway deployment:** Single-process, single-container on Railway. All agents run in the same Python process — no need for message queues or microservices. The StateGraph is just function calls with a shared dict.
6. **Database safety:** All Toby state lives in PostgreSQL. If the Railway container restarts mid-generation, the buffer manager will detect the missing slot on the next tick and regenerate. No in-memory state that can't be recovered.

---

## BEGIN THE RECONSTRUCTION.

You have the code. You have the DB. You have the vision. Start with Phase 1 — create the foundation without breaking anything. Then iterate.
