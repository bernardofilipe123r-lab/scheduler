# Toby — AI Content Automation Agent

## Architecture Specification v2.0 — Verified Implementation Record

**Date:** February 2026
**Audience:** Investors, Product Team, Engineers, Designers
**Status:** v2.0 — All claims verified against production source code (February 2026)

> **Status legend used throughout this document:**
> - ✅ **Live** — implemented and running in production
> - ⚠️ **Partial** — schema/structure exists, full logic not yet built
> - 🔧 **Planned** — designed but not yet implemented

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What is Toby?](#2-what-is-toby)
3. [Product Vision](#3-product-vision)
4. [System Architecture Overview](#4-system-architecture-overview)
5. [Backend Architecture](#5-backend-architecture)
6. [Frontend Architecture](#6-frontend-architecture)
7. [Data Model](#7-data-model)
8. [Core Loops](#8-core-loops)
9. [Intelligence Engine](#9-intelligence-engine)
10. [Edge Cases & Autonomous Behavior](#10-edge-cases--autonomous-behavior)
11. [Toby Today vs. True AI Autonomy](#11-toby-today-vs-true-ai-autonomy)
12. [The Path to Multi-Agent Autonomy](#12-the-path-to-multi-agent-autonomy)
13. [Deployment & Resilience](#13-deployment--resilience)
14. [Scalability & Future-Proofing](#14-scalability--future-proofing)
15. [Implementation Phases](#15-implementation-phases)
16. [Risk Matrix](#16-risk-matrix)
17. [Glossary](#17-glossary)

---

## 1. Executive Summary

Toby is a **per-user AI content automation agent** that takes over the entire content lifecycle — from ideation to publishing to performance analysis — so the user doesn't have to press a single button.

Toby operates as if it were a human social media manager: it creates reels and carousels, publishes them on schedule, tracks how they perform, learns what works, and continuously improves. The user's only job is to set up their brand's Content DNA (niche, tone, topics) and turn Toby on.

### Key Design Principles

| Principle | What It Means |
|---|---|
| **Autonomous but controllable** | Toby runs 24/7 on its own, but the user can pause, reset, or review it at any time |
| **Niche-locked** | Toby never deviates from the user's Content DNA — it experiments within the niche, not outside |
| **Learn by doing** | Toby uses real performance data (not assumptions) to decide what works |
| **Slots never fail** | A 2-day content buffer ensures every scheduled slot has content ready |
| **Reels ≠ Carousels** | Separate analysis, separate strategies, separate learnings — never merged |
| **Database-first** | All Toby state lives in PostgreSQL — survives deploys, crashes, and restarts |
| **Per-user isolation** | Each user has their own Toby instance with independent state and learnings |

---

## 2. What is Toby?

### For Investors & Product Team

Toby transforms our app from a **content tool** (where the user does the work) into a **content engine** (where AI does the work). This is the core differentiator:

- **Without Toby:** User logs in → creates content manually → schedules it → checks performance → adjusts strategy → repeats. Takes 30-60 minutes per day.
- **With Toby:** User turns Toby on → Toby creates, schedules, publishes, analyzes, and improves autonomously. User can review published content from a dashboard. Takes 0 minutes per day.

**Business impact:**
- Users who are too busy to create daily content can still maintain a consistent posting schedule
- Content quality improves over time because Toby optimizes based on real data
- Retention increases because the product delivers value even when the user is away
- Premium feature potential — Toby becomes the reason users upgrade

### For Engineers

Toby is a **background orchestration layer** that ties together existing services (content generation, scheduling, publishing, analytics) into an autonomous loop. It is NOT a new monolith — it's a coordination layer that calls into the services we already have.

**What already exists (and Toby reuses):**
- `ContentGeneratorV2` — DeepSeek-powered content generation (titles, content lines, image prompts)
- `JobProcessor` — Image generation, video creation, carousel composition pipeline
- `DatabaseSchedulerService` — Scheduling and auto-publishing every 60 seconds
- `MetricsCollector` — Per-post Instagram metrics (views, likes, saves, shares, reach)
- `TrendScout` — Hashtag search and competitor discovery via IG Graph API
- `NicheConfig` — Content DNA configuration per user/brand
- `PostPerformance` — Performance scoring and percentile ranking

**What Toby adds:**
- An **orchestrator** (`app/services/toby/orchestrator.py`, 465 lines) that decides when to create, what to create, and how to improve
- A **learning engine** (`app/services/toby/learning_engine.py`, 354 lines) that tracks experiments and allocates more resources to winners using epsilon-greedy bandit selection
- A **content buffer** (`app/services/toby/buffer_manager.py`, 147 lines) that pre-generates 2 days of content to guarantee slots never go empty
- A **personality/angle testing framework** (strategy A/B testing via epsilon-greedy bandit) ✅ Live
- An **analysis engine** (`app/services/toby/analysis_engine.py`, 167 lines) for 48h and 7d performance scoring
- A **state machine** (`app/services/toby/state.py`, 141 lines) managing bootstrap → learning → optimizing phases

---

## 3. Product Vision

### User Journey

```
Day 0: User sets up Content DNA (niche, tone, topics, examples)
        User creates brands, connects Instagram
        User enables Toby

Day 0 (Toby activates):
        → Toby checks all reel + carousel slots for next 2 days
        → Fills empty slots with generated content
        → Begins discovery scan (own accounts, competitors, hashtags)

Day 1-7 (Bootstrap phase):
        → Toby publishes content on schedule
        → Collects 48h early performance signals
        → Starts building a baseline of what "average" and "great" look like
        → Tests 2-3 different personalities per content type

Day 7-30 (Learning phase):
        → Toby has enough data to compare performance
        → Identifies winning topics, hooks, and personalities
        → Allocates ~70% of slots to proven strategies, ~30% to experiments
        → Adapts to seasonal trends and algorithm changes

Day 30+ (Optimization phase):
        → Toby has a rich performance history per brand
        → Cross-brand intelligence helps cold-start new brands faster [Planned]
        → Continuously A/B tests new angles while maximizing winning formulas
        → User can see a clear improvement trend in the Toby dashboard
```

### Toby Dashboard (Frontend)

The Toby page in the sidebar shows:

| Section | What It Shows | Status |
|---|---|---|
| **Status Bar** | Toby ON/OFF toggle, current phase (bootstrap/learning/optimizing), content buffer health | ✅ Live |
| **Activity Feed** | Real-time log of what Toby is doing — "Published reel to @brand", "Analyzing 48h metrics for 5 posts", "Discovered 12 trending reels" | ✅ Live |
| **Published Content** | Gallery of everything Toby has published, with performance scores | ✅ Live |
| **Experiments** | Active A/B tests — which personalities/angles are being tested, preliminary results | ✅ Live |
| **Insights** | Top-performing topics, best hooks, winning personalities, improvement trends | ✅ Live |
| **Discovery** | Trending competitor content and hashtag intelligence visible in activity feed; dedicated Discovery tab | 🔧 Planned |
| **Settings** | Buffer size, slot configuration, reset button, spending limits | ⚠️ Partial |

---

## 4. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────┐   │
│  │   Toby    │ │ Calendar  │ │ Analytics │ │   Generator   │   │
│  │ Dashboard │ │   Page    │ │   Page    │ │     Page      │   │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └───────┬───────┘   │
│        └──────────────┴─────────────┴───────────────┘           │
│                              │ REST API                         │
├──────────────────────────────┼──────────────────────────────────┤
│                        BACKEND (FastAPI)                        │
│                              │                                  │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │                    API Layer (Routes)                      │  │
│  │   /api/toby/*  /api/reels/*  /api/analytics/*  /api/...   │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │              TOBY ORCHESTRATOR                             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐  │  │
│  │  │ Content  │ │ Analysis │ │ Discovery │ │  Learning  │  │  │
│  │  │ Planner  │ │  Engine  │ │  Manager  │ │  Engine    │  │  │
│  │  └────┬─────┘ └────┬─────┘ └─────┬─────┘ └─────┬──────┘  │  │
│  └───────┼────────────┼─────────────┼─────────────┼──────────┘  │
│          │            │             │             │              │
│  ┌───────┴────────────┴─────────────┴─────────────┴──────────┐  │
│  │              EXISTING SERVICES (Unchanged)                 │  │
│  │  ContentGeneratorV2 │ JobProcessor │ MetricsCollector      │  │
│  │  DatabaseScheduler  │ TrendScout   │ SocialPublisher       │  │
│  │  NicheConfigService │ BrandResolver │ AnalyticsService     │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                  │
├──────────────────────────────┼──────────────────────────────────┤
│                     EXTERNAL SERVICES                           │
│  ┌──────────┐ ┌────────────┐ ┌───────────┐ ┌───────────────┐   │
│  │ DeepSeek │ │ AI Image   │ │ Meta/IG   │ │   Supabase    │   │
│  │   API    │ │ Generator  │ │ Graph API │ │  PostgreSQL   │   │
│  └──────────┘ └────────────┘ └───────────┘ └───────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Insight: Toby Doesn't Replace — It Orchestrates

Toby sits **above** the existing service layer and calls into it. This means:

- All existing functionality (manual content creation, manual scheduling) continues to work unchanged
- Toby is an optional layer that can be enabled/disabled without affecting the rest of the system
- Any improvement to the underlying services (better image generation, faster video rendering) automatically benefits Toby

---

## 5. Backend Architecture

### 5.1 New Module: `app/services/toby/` ✅ Live

```
app/services/toby/
├── __init__.py
├── orchestrator.py        (465 lines) # Main loop — the "brain" that coordinates everything
├── content_planner.py     (122 lines) # Decides WHAT to create and WHEN
├── analysis_engine.py     (167 lines) # Evaluates performance, computes scores
├── learning_engine.py     (354 lines) # Epsilon-greedy bandit, personality optimization
├── discovery_manager.py   (106 lines) # Coordinates TrendScout scanning schedules
├── buffer_manager.py      (147 lines) # Ensures 2-day content buffer stays full
└── state.py               (141 lines) # Toby state machine (OFF → BOOTSTRAP → LEARNING → OPTIMIZING)
```

### 5.2 Orchestrator — The Brain

The orchestrator is a **periodic background task** (via APScheduler, already used in `main.py`) that runs every **5 minutes** and executes whichever action is most needed.

```python
class TobyOrchestrator:
    """
    Main coordination loop. Runs every 5 minutes per user.

    Decision priority (highest to lowest):
    1. BUFFER CHECK   — Are all slots for next 2 days filled? If not, generate.
    2. PUBLISH CHECK  — Any due posts? (Handled by existing scheduler, Toby just monitors)
    3. METRICS CHECK  — Any posts older than 48h without metrics? Collect them.
    4. ANALYSIS CHECK — New metrics available? Re-score and update learnings.
    5. DISCOVERY CHECK — Time for a discovery scan? Run TrendScout tick.
    6. EXPERIMENT CHECK — Time to start a new A/B test? Plan one.
    """
```

**Why 5 minutes?**
- Fast enough to react to empty slots or failed content generation
- Slow enough to not waste CPU on a system that mostly needs hourly actions
- Each tick is lightweight — it checks DB state and only acts if needed

### 5.3 Content Planner

The content planner decides **what** to create. It does NOT generate content itself — it produces a **content plan** (a data structure) that gets handed to the existing `ContentGeneratorV2` + `JobProcessor` pipeline.

```python
@dataclass
class ContentPlan:
    """A plan for one piece of content that Toby will create."""
    user_id: str
    brand_id: str
    content_type: str          # "reel" or "post" (carousel)
    scheduled_time: str        # ISO datetime string

    # Strategy fields — filled by the learning engine via StrategyChoice
    personality_id: str        # Which AI personality to use (e.g. "edu_calm", "deep_edu")
    personality_prompt: str    # The actual system prompt modifier text
    topic_bucket: str          # Which topic category (from NicheConfig)
    hook_strategy: str         # Which hook pattern (e.g. "question", "myth_buster")
    title_format: str          # Which title structure (e.g. "how_x_does_y")
    visual_style: str          # Which visual approach (e.g. "dark_cinematic")

    # Optional — if experimenting
    experiment_id: Optional[str] = None  # Links to an active A/B test
    is_experiment: bool = False          # Part of an experiment?
    is_control: bool = False             # Is this the control variant?
```

> **Note:** `variant` (light/dark) is NOT in the ContentPlan. It's determined at execution time from the scheduled_time: `slot_index = hour // 4`, even index = light, odd = dark.

**Planning algorithm (actual implementation):**

```
1. Get all brands for this user
2. For each brand:
   a. Get the slot schedule (reel_slots_per_day + post_slots_per_day)
   b. Check which slots in the next 2 days (buffer_days) are already filled
   c. For each empty slot (up to max_plans=1 per tick):
      - Ask LearningEngine.choose_strategy() for a StrategyChoice
      - choose_strategy() picks 5 dimensions using epsilon-greedy logic:
        personality, topic_bucket, hook_strategy, title_format, visual_style
      - ~70% of selections use PROVEN strategies (highest avg_score)
      - ~30% of selections use EXPLORATION (random picks)
      - Create a ContentPlan with the strategy + personality_prompt text
3. For each ContentPlan:
   a. Build PromptContext from NicheConfig, inject personality_modifier
   b. Call ContentGeneratorV2 to generate title + content_lines (3-attempt quality loop)
   c. Create GenerationJob (job_id "TOBY-XXXXXX")
   d. Run JobProcessor.regenerate_brand() or process_post_brand()
   e. Schedule via DatabaseSchedulerService with full media URLs
   f. Record TobyContentTag with strategy metadata for learning
```

### 5.4 Analysis Engine ✅ Live

The analysis engine evaluates post performance and feeds results back to the learning engine.

**Two-phase scoring:**

| Phase | When | What It Does |
|---|---|---|
| **Early signal** | 48 hours after publish | Fetch metrics, compute preliminary score. Flag outliers (very good or very bad). |
| **Final score** | 7 days after publish | Fetch metrics again, compute final performance score. This is the score used for learning. |

**Scoring formula:**

```python
def compute_toby_score(metrics: dict, brand_stats: dict) -> float:
    """
    Score a post's performance relative to the brand's baseline.

    Components (actual implemented weights):
    1. Raw views score — 20% (absolute performance, logarithmic scale)
    2. Relative views score — 30% (compared to brand's 14-day rolling average)
    3. Engagement quality — 40% (saves + shares, primary learning signal)
    4. Follower context — 10% (mild normalization)

    Returns: 0-100 score
    """
    views = metrics["views"]
    brand_avg_views = brand_stats["avg_views"]
    brand_followers = brand_stats["followers"]

    # 1. Raw views (20%) — absolute performance
    #    Logarithmic scale: 1k=20, 10k=50, 50k=75, 100k=90, 500k=100
    raw_views_score = min(100, math.log10(max(views, 1)) / math.log10(500_000) * 100)

    # 2. Relative views (30%) — how this post compares to brand average
    if brand_avg_views > 0:
        relative_ratio = views / brand_avg_views
        #  0.5x avg = 12.5,  1x avg = 25,  2x avg = 50,  4x+ avg = 100
        relative_score = min(100, relative_ratio * 25)
    else:
        relative_score = 50  # No baseline yet

    # 3. Engagement quality (40%) — THE most important signal
    #    Saves and shares are strongest signals for content value
    saves = metrics.get("saves", 0)
    shares = metrics.get("shares", 0)
    engagement_score = min(100, (saves * 2 + shares * 3) / max(views, 1) * 10000)

    # 4. Follower context (10%) — mild normalization
    if brand_followers > 0:
        views_per_follower = views / brand_followers
        follower_context_score = min(100, views_per_follower * 10)
    else:
        follower_context_score = 50

    final = (
        raw_views_score * 0.20 +
        relative_score * 0.30 +
        engagement_score * 0.40 +
        follower_context_score * 0.10
    )
    return round(final, 1)
```

**Key: engagement quality (saves + shares) is the dominant signal at 40%.** This ensures Toby optimizes for save-worthy, high-value content rather than just views. Relative performance within the brand (30%) is the secondary signal.

### 5.5 Learning Engine — Strategy Selection Framework ✅ Live

The learning engine is Toby's "memory." It tracks what strategies have been tried, how they performed, and decides what to try next.

#### Experiment Dimensions

Toby tracks experiments across these independent dimensions, **separately for reels and carousels:**

| Dimension | Examples | How Toby Tests |
|---|---|---|
| **Personality** | "educational", "provocative", "storytelling", "data-driven", "motivational" | System prompt variations passed to DeepSeek |
| **Topic Bucket** | "superfoods", "sleep", "gut_health", "hormones" (from NicheConfig) | Which topic category to generate about |
| **Hook Strategy** | "question", "myth_buster", "shocking_stat", "personal_story" | Opening line pattern for the reel/carousel |
| **Title Format** | "How X Does Y", "The #1 Mistake...", "Why Doctors Say..." | Title structure template |
| **Visual Style** | "dark_cinematic", "light_clean", "vibrant_bold" | Image generation prompt modifiers |

#### Epsilon-Greedy Multi-Armed Bandit (Not Pure A/B)

Traditional A/B testing requires statistical significance (hundreds of samples per variant). Social media content doesn't generate enough volume for that. Instead, Toby uses an **epsilon-greedy multi-armed bandit** — a well-understood algorithm that is simple, effective, and honest about what it is:

```python
# Simplified view of the actual implementation in learning_engine.py

def choose_strategy(explore_ratio=0.30, ...):
    is_explore = random.random() < explore_ratio  # 30% of the time: EXPLORE

    if is_explore:
        return random.choice(options)             # Pick any option at random
    else:
        return db.query(best_avg_score).first()   # Pick the proven winner (highest avg)

# After each post's 7d final score arrives:
def update_strategy_score(option, score):
    record.sample_count += 1
    record.avg_score = record.total_score / record.sample_count  # Running average
    record.score_variance = welford_update(...)                   # Tracked for observability
```

This naturally:
- Converges on the best strategies as sample counts grow
- Never stops exploring (catches seasonal shifts, algorithm changes)
- Works with small sample sizes — no statistical significance required

> **Note on naming:** Thompson Sampling is a related but distinct algorithm that uses Bayesian posterior distributions (Beta distributions per option) for selection — it is statistically more principled. Toby's current implementation is epsilon-greedy. True Thompson Sampling is on the roadmap (see Section 11.1).

#### Separate Worlds: Reels vs. Carousels

**Reels** and **carousels** have completely separate:
- Experiment pools
- Performance baselines
- Winning strategies
- Scoring parameters

A hook that works for a 7-second reel ("You're destroying your gut with THIS food") may not work for a 4-slide educational carousel. Toby never transfers learnings between these two content types.

### 5.6 Buffer Manager ✅ Live

The buffer manager ensures every slot for the next 2 days has content ready.

```
Buffer Health States:
  HEALTHY    — All slots for next 48h are filled
  LOW        — 1-3 slots in next 48h are empty
  CRITICAL   — 4+ slots empty, or less than 24h of content remaining

When buffer is LOW or CRITICAL:
  1. Content Planner generates plans for empty slots
  2. Plans are processed immediately (not queued)
  3. If DeepSeek API fails → retry with exponential backoff (1min, 5min, 15min)
  4. If all retries fail → use SAFE FALLBACK:
     a. Pick best-performing past content plan (topic + personality that scored highest)
     b. Re-generate with slightly modified prompt ("similar to: {winning_title}")
     c. This guarantees a slot gets filled even during API outages
```

**On first activation (Day 0):**
1. Toby immediately scans all slots for the next 48 hours
2. Fills every empty slot — this may mean generating 12-20 pieces of content at once
3. Uses a throttled queue (max 3 concurrent generations) to avoid API rate limits
4. Shows progress on the Toby dashboard: "Filling buffer: 8/16 slots ready"

### 5.7 Discovery Manager ✅ Live (with partial integration)

Wraps the existing `TrendScout` service with a smart scheduling layer.

**Scanning schedule (actual implementation):**

| Scan Type | Frequency | What It Does |
|---|---|---|
| Bootstrap mode (all scans) | Every 20 minutes | Aggressive scanning during first 7 days to build data |
| Normal mode (own + competitors + hashtags) | Every 6 hours (360 min) | All scans run in sequence per single discovery tick |

> **Interval clarification:** The module defines separate constants (`NORMAL_COMPETITORS_INTERVAL = 480`, `NORMAL_HASHTAG_INTERVAL = 720`) but `should_run_discovery()` gates all scans on a single threshold: `NORMAL_OWN_ACCOUNTS_INTERVAL = 360`. All three scan types execute together in a single tick. Per-type independent scheduling is a planned enhancement.

**Discovery → LearningEngine integration status: 🔧 Planned**

Discovery results are stored in Supabase and visible in the activity feed. The code path from discovery findings into experiment creation does not yet exist. The intended design: when a trending competitor topic is discovered, Toby automatically creates an experiment to test it against the current best topic. This closes the feedback loop: discover → experiment → score → learn. See Section 11.2 for the implementation roadmap.

### 5.8 API Routes: `app/api/toby/` ✅ Live

```
app/api/toby/
├── __init__.py
├── routes.py              (422 lines) # Main Toby API endpoints
└── schemas.py             (11 lines)  # Pydantic schemas for request/response
```

**Single schema (`TobyConfigUpdate`):**
```python
class TobyConfigUpdate(BaseModel):
    buffer_days: Optional[int] = Field(None, ge=1, le=7)
    explore_ratio: Optional[float] = Field(None, ge=0.0, le=1.0)
    reel_slots_per_day: Optional[int] = Field(None, ge=0, le=24)
    post_slots_per_day: Optional[int] = Field(None, ge=0, le=24)
```

**Endpoints (all require `get_current_user` auth):**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/toby/status` | Get Toby's current state (on/off, phase, buffer health, active experiments) |
| `POST` | `/api/toby/enable` | Turn Toby on — starts buffer fill immediately |
| `POST` | `/api/toby/disable` | Turn Toby off — stops content generation, keeps analysis running |
| `POST` | `/api/toby/reset` | Reset all Toby learning data — experiments, scores, personality preferences. Does NOT delete published content or performance history. |
| `GET` | `/api/toby/activity` | Paginated activity log — what Toby has done recently |
| `GET` | `/api/toby/published` | All content Toby has published (with performance scores) |
| `GET` | `/api/toby/experiments` | Active and completed experiments with results |
| `GET` | `/api/toby/insights` | Aggregated insights — best topics, hooks, personalities |
| `GET` | `/api/toby/discovery` | What Toby found from scraping (trending content, competitor analysis) |
| `GET` | `/api/toby/buffer` | Buffer status — which slots are filled, which are empty |
| `GET` | `/api/toby/config` | Toby's configuration (buffer size, explore ratio, etc.) |
| `PATCH` | `/api/toby/config` | Update Toby's configuration |

---

## 6. Frontend Architecture

### 6.1 Sidebar Item ✅ Live

A **"Toby"** entry in the sidebar navigation between "Analytics" and "Brands":

```typescript
// In AppLayout.tsx NAV_ITEMS:
{ to: '/toby', icon: Bot, label: 'Toby', end: false },
```

The icon is `Bot` from `lucide-react`. When Toby is enabled, the icon gets a subtle green pulse animation to indicate it's active.

### 6.2 Page Structure ✅ Live

```
src/
├── pages/
│   └── Toby.tsx                     (90 lines)  # Main Toby page (4-tab layout)
├── features/
│   └── toby/
│       ├── types.ts                 (140 lines) # 15 TypeScript types/interfaces
│       ├── api/toby-api.ts          (64 lines)  # 12 API methods (1:1 with endpoints)
│       ├── hooks/use-toby.ts        (115 lines) # 12 React Query hooks (status refetches every 15s)
│       └── components/
│           ├── index.ts             (7 lines)   # Public exports
│           ├── TobyStatusBar.tsx    (140 lines) # ON/OFF toggle + phase indicator + buffer health
│           ├── TobyLiveStatus.tsx   (199 lines) # Live action hero card + 4-step pipeline viz
│           ├── TobyActivityFeed.tsx (259 lines) # Timeline grouped by time period
│           ├── TobyExperiments.tsx  (120 lines) # A/B test cards with variant comparison
│           ├── TobyInsights.tsx     (75 lines)  # Ranked strategy bars per dimension
│           ├── TobyBufferStatus.tsx (191 lines) # Health indicator + per-brand breakdown
│           └── TobySettings.tsx     (170 lines) # Config sliders + danger zone
```

**Total frontend: ~1,570 lines across 13 files.**

**TypeScript types in `types.ts`:** `TobyPhase`, `TobyConfig`, `TobyBufferBrand`, `TobyBufferStatus`, `TobyLiveAction`, `TobyLiveInfo`, `TobyTimestamps`, `TobyStats`, `TobyStatus`, `TobyActivityItem`, `TobyExperiment`, `TobyInsight`, `TobyInsights`, `TobyContentTag`, `TobyDiscoveryItem`

### 6.3 Toby Page — Tab Layout ✅ Live

The page has **4 tabs:** Overview | Experiments | Insights | Settings

```
┌──────────────────────────────────────────────────────────────┐
│  🤖 Toby AI Agent                            [● Active]      │
│  ─────────────────────────────────────────────────────────── │
│  Buffer: ████████████░░ 85% (14/16 slots filled)             │
│  Phase: Learning (Day 12)    Next action: Metrics check 3m   │
├──────────────────────────────────────────────────────────────┤
│         [Overview] [Experiments] [Insights] [Settings]       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  (Tab content rendered here)                                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.4 Tab Details

**Overview Tab** — Combines Activity Feed + Live Status + Buffer Status:
```
2m ago    Published carousel to @healthycollege (experiment: storytelling-hook-A)
15m ago   Analyzed 48h metrics for 5 reels — 2 above average, 1 outlier (32k views!)
1h ago    Discovered 8 trending reels via #healthylifestyle
2h ago    Generated 3 reels for tomorrow's slots (buffer now 100%)
3h ago    Updated experiment results: "data-driven" personality +12% vs baseline
```

**Experiments Tab** — Live A/B test dashboard:
```
┌─────────────────────────────────────────────────┐
│ REELS — Personality Test                         │
│ Status: Running (started 5 days ago, 18 samples) │
│                                                  │
│ educational     ████████████  Score: 72 (8x)    │
│ provocative     ██████████████ Score: 81 (5x)   │
│ storytelling    ████████     Score: 63 (5x)     │
│                                                  │
│ Current leader: provocative (+12% vs baseline)   │
└─────────────────────────────────────────────────┘
```

**Insights Tab** — Aggregated intelligence:
- Best-performing topic categories (bar chart, split by reels/carousels)
- Best hooks / title formats
- Performance trend over time (are we improving?)
- "Game changers" — posts that got 4x+ the brand average
- Per-brand breakdown

**Settings Tab** — Config sliders + danger zone (reset learning data).

### 6.5 Sidebar Active Indicator

When Toby is enabled, the sidebar icon shows a **green dot** and a subtle glow:

```tsx
<NavLink to="/toby" ...>
  <div className="relative shrink-0">
    <Bot className="w-5 h-5" />
    {tobyEnabled && (
      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-stone-900 animate-pulse" />
    )}
  </div>
  {expanded && <span>Toby</span>}
</NavLink>
```

---

## 7. Data Model

### 7.1 New Tables

#### `toby_state` — Per-user Toby configuration and state ✅ Live

```sql
CREATE TABLE toby_state (
    id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       VARCHAR(100) NOT NULL UNIQUE,

    -- ON/OFF
    enabled       BOOLEAN NOT NULL DEFAULT FALSE,
    enabled_at    TIMESTAMPTZ,
    disabled_at   TIMESTAMPTZ,

    -- Phase: bootstrap | learning | optimizing
    phase         VARCHAR(20) NOT NULL DEFAULT 'bootstrap',
    phase_started_at TIMESTAMPTZ,

    -- Configuration
    buffer_days           INTEGER DEFAULT 2,       -- How many days ahead to buffer
    explore_ratio         FLOAT DEFAULT 0.30,      -- % of slots for experiments (0.0-1.0)
    reel_slots_per_day    INTEGER DEFAULT 6,        -- From brand config
    post_slots_per_day    INTEGER DEFAULT 2,        -- From brand config

    -- Scheduling state (prevents duplicate work)
    last_buffer_check_at    TIMESTAMPTZ,
    last_metrics_check_at   TIMESTAMPTZ,
    last_analysis_at        TIMESTAMPTZ,
    last_discovery_at       TIMESTAMPTZ,

    -- Spending limits [Planned — columns exist, enforcement logic not yet implemented]
    daily_budget_cents    INTEGER,                  -- NULL = unlimited
    spent_today_cents     INTEGER DEFAULT 0,
    budget_reset_at       TIMESTAMPTZ,

    -- Timestamps
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);
```

#### `toby_experiments` — A/B test definitions and results ✅ Live

```sql
CREATE TABLE toby_experiments (
    id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,

    -- What we're testing
    content_type    VARCHAR(10) NOT NULL,        -- "reel" or "post"
    dimension       VARCHAR(30) NOT NULL,        -- "personality", "topic", "hook", "title_format", "visual_style"

    -- The options being tested (JSONB array)
    -- e.g., ["educational", "provocative", "storytelling"]
    options         JSONB NOT NULL,

    -- Results per option (updated after each post scores)
    -- e.g., {"educational": {"count": 8, "total_score": 576, "avg_score": 72, "scores": [70, 75, ...]}}
    results         JSONB NOT NULL DEFAULT '{}',

    -- Status
    status          VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | paused | completed
    winner          VARCHAR(100),   -- Winning option (set when completed)

    -- Timing
    started_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    min_samples     INTEGER DEFAULT 5,  -- Min samples per option before declaring winner

    CONSTRAINT uq_toby_exp_active UNIQUE (user_id, content_type, dimension, status)
);

CREATE INDEX idx_toby_exp_user_status ON toby_experiments(user_id, status);
```

#### `toby_strategy_scores` — Performance aggregates per strategy option ✅ Live

```sql
CREATE TABLE toby_strategy_scores (
    id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    brand_id        VARCHAR(50),  -- [Partial: always stored as NULL in v1.0; per-brand tracking planned]
    content_type    VARCHAR(10) NOT NULL,         -- "reel" or "post"

    -- What strategy dimension this tracks
    dimension       VARCHAR(30) NOT NULL,         -- "personality", "topic", "hook", etc.
    option_value    VARCHAR(100) NOT NULL,        -- e.g., "educational", "superfoods"

    -- Running aggregates (epsilon-greedy selection uses avg_score)
    sample_count    INTEGER DEFAULT 0,
    total_score     FLOAT DEFAULT 0,
    avg_score       FLOAT DEFAULT 0,
    score_variance  FLOAT DEFAULT 0,   -- Tracked for observability; not used in selection
    best_score      FLOAT DEFAULT 0,
    worst_score     FLOAT DEFAULT 100,

    -- Recent trend (last 10 scores)
    recent_scores   JSONB DEFAULT '[]',

    updated_at      TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT uq_toby_strategy UNIQUE (user_id, brand_id, content_type, dimension, option_value)
);

CREATE INDEX idx_toby_strategy_user ON toby_strategy_scores(user_id, content_type, dimension);
```

#### `toby_activity_log` — Audit trail of all Toby actions ✅ Live

```sql
CREATE TABLE toby_activity_log (
    id          SERIAL PRIMARY KEY,
    user_id     VARCHAR(100) NOT NULL,

    action_type VARCHAR(30) NOT NULL,  -- "content_generated", "published", "metrics_collected",
                                       -- "analysis_completed", "discovery_scan", "experiment_started",
                                       -- "experiment_completed", "buffer_filled", "error"
    description TEXT NOT NULL,
    metadata    JSONB,                 -- Structured metadata (varies by action_type)
    level       VARCHAR(10) DEFAULT 'info',  -- "info", "success", "warning", "error"
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_toby_activity_user_time ON toby_activity_log(user_id, created_at DESC);
CREATE INDEX idx_toby_activity_type ON toby_activity_log(user_id, action_type);
```

#### `toby_content_tags` — Links Toby metadata to scheduled content ✅ Live

```sql
CREATE TABLE toby_content_tags (
    id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    schedule_id     VARCHAR(36) NOT NULL REFERENCES scheduled_reels(schedule_id) ON DELETE CASCADE,

    -- Which strategies were used for this content
    content_type    VARCHAR(10) NOT NULL,      -- "reel" or "post"
    personality     VARCHAR(50),
    topic_bucket    VARCHAR(50),
    hook_strategy   VARCHAR(50),
    title_format    VARCHAR(50),
    visual_style    VARCHAR(50),

    -- Experiment link
    experiment_id   VARCHAR(36) REFERENCES toby_experiments(id) ON DELETE SET NULL,
    is_experiment   BOOLEAN DEFAULT FALSE,
    is_control      BOOLEAN DEFAULT FALSE,

    -- Performance (filled after scoring)
    toby_score      FLOAT,          -- The Toby-specific composite score
    scored_at       TIMESTAMPTZ,
    score_phase     VARCHAR(10),    -- "48h" or "7d"

    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_toby_tags_user ON toby_content_tags(user_id);
CREATE INDEX idx_toby_tags_experiment ON toby_content_tags(experiment_id);
CREATE INDEX idx_toby_tags_schedule ON toby_content_tags(schedule_id);
```

### 7.2 Modifications to Existing Tables

#### `scheduled_reels` — Add Toby flag ✅ Live

```sql
ALTER TABLE scheduled_reels ADD COLUMN created_by VARCHAR(20) DEFAULT 'user';
-- Values: 'user' (manual), 'toby' (autonomous)
```

This single column lets us distinguish Toby-created content from user-created content everywhere in the UI and analytics.

#### `post_performance` — Already sufficient ✅ Live

The existing `PostPerformance` table already has everything Toby needs:
- `views`, `likes`, `comments`, `saves`, `shares`, `reach`
- `performance_score`, `percentile_rank`
- `topic_bucket`, `keyword_hash`
- `brand`, `content_type`

No schema changes needed — Toby's `analysis_engine` reads directly from this table.

---

## 8. Core Loops

### 8.1 The Toby Tick (Every 5 Minutes) ✅ Live

```
┌──────────────────────────────────────────────────────┐
│                   TOBY TICK (per user)                │
│                                                       │
│  1. Is Toby enabled for this user?                   │
│     NO → skip                                         │
│                                                       │
│  2. BUFFER CHECK (highest priority)                  │
│     Query: slots in next 48h without content          │
│     If empty slots exist:                             │
│       → ContentPlanner.fill_slots(empty_slots)       │
│       → Log activity: "Generated N pieces of content" │
│                                                       │
│  3. METRICS CHECK (every 6 hours)                    │
│     Query: published posts > 48h old without metrics  │
│     If found:                                         │
│       → MetricsCollector.collect_for_brand(brand)    │
│       → Log activity: "Collected metrics for N posts" │
│                                                       │
│  4. ANALYSIS CHECK (every 6 hours, after metrics)    │
│     Query: posts with new metrics not yet analyzed    │
│     If found:                                         │
│       → AnalysisEngine.score_and_learn(posts)        │
│       → LearningEngine.update_strategies(scores)     │
│       → Log activity: "Analyzed N posts, updated..."  │
│                                                       │
│  5. DISCOVERY CHECK                                   │
│     If in bootstrap phase: every 20 minutes           │
│       → TrendScout.bootstrap_scan_tick()             │
│     If in normal phase: every 6 hours (360 min)       │
│       → DiscoveryManager.scan_tick()                 │
│       (runs own_accounts + competitors + hashtags     │
│        sequentially in a single tick)                 │
│                                                       │
│  6. PHASE CHECK                                       │
│     If bootstrap and 10+ posts + 7 days:             │
│       → transition to learning phase                  │
│     If learning and 30+ days:                        │
│       → transition to optimizing phase               │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### 8.2 Content Generation Flow (Toby-initiated) ✅ Live

```
ContentPlanner                ContentGeneratorV2          JobProcessor           Scheduler
     │                              │                        │                      │
     │  1. Plan: personality=       │                        │                      │
     │     "provocative",           │                        │                      │
     │     topic="gut_health",      │                        │                      │
     │     hook="myth_buster"       │                        │                      │
     │                              │                        │                      │
     │  2. Build custom system      │                        │                      │
     │     prompt with personality  │                        │                      │
     │  ─────────────────────────>  │                        │                      │
     │                              │                        │                      │
     │                     3. Call DeepSeek API              │                      │
     │                        (title + content_lines)        │                      │
     │                              │                        │                      │
     │  4. Receive generated content│                        │                      │
     │  <─────────────────────────  │                        │                      │
     │                              │                        │                      │
     │  5. Send to image/video      │                        │                      │
     │     pipeline                 │                        │                      │
     │  ─────────────────────────────────────────────────>   │                      │
     │                              │                        │                      │
     │                              │   6. Generate thumbnail│                      │
     │                              │      Generate video/   │                      │
     │                              │      compose carousel  │                      │
     │                              │      Upload to Supabase│                      │
     │                              │                        │                      │
     │  7. Schedule for target slot │                        │                      │
     │  ──────────────────────────────────────────────────────────────────────>     │
     │                              │                        │                      │
     │  8. Create toby_content_tags │                        │                      │
     │     with experiment metadata │                        │                      │
     │                              │                        │                      │
     │  9. Log activity             │                        │                      │
     │                              │                        │                      │
```

### 8.3 Learning Feedback Loop ✅ Live

```
Post published (Day 0)
        │
        ▼
48h later: MetricsCollector fetches views, likes, saves, shares, reach
        │
        ▼
AnalysisEngine computes toby_score (relative to brand's baseline)
        │
        ▼
toby_content_tags.toby_score updated (phase="48h")
        │
        ▼
LearningEngine.update_strategies():
  - For each dimension (personality, topic, hook, etc.):
    - Find the strategy_score record
    - Update: sample_count++, recalculate avg_score
    - Update recent_scores (rolling window of last 10)
        │
        ▼
If experiment is active for this dimension:
  - Update experiment results
  - If all options have >= min_samples AND one is significantly better:
    - Mark experiment completed, declare winner
    - Log: "Experiment completed: 'provocative' personality wins (+15% vs baseline)"
        │
        ▼
7d later: Repeat scoring with final metrics
  - toby_content_tags.toby_score updated (phase="7d")
  - This is the authoritative score used for future strategy decisions
```

---

## 9. Intelligence Engine

### 9.1 Personality System ✅ Live

Toby maintains a pool of AI personalities that modify how DeepSeek generates content. These are **system prompt modifiers**, not separate AI models.

**Default personality pool (reel-specific):**

| ID | Name | System Prompt Modifier |
|---|---|---|
| `edu_calm` | Educational Calm | "You are a calm, knowledgeable health educator. Use clear, evidence-based language. Avoid hype." |
| `provoc` | Provocative | "You challenge common health myths with surprising facts. Use bold, attention-grabbing language." |
| `story` | Storyteller | "Frame every health tip as a mini-story. Use 'Imagine...', 'What if...', personal anecdotes." |
| `data` | Data-Driven | "Lead with specific numbers and statistics. '73% of people...', 'Studies show that...'." |
| `urgent` | Urgency | "Create a sense of urgency around health changes. 'Stop doing this TODAY', 'Your gut is screaming'." |

**Default personality pool (carousel-specific):**

| ID | Name | System Prompt Modifier |
|---|---|---|
| `deep_edu` | Deep Educational | "Create thorough, well-structured educational content with clear slide progression." |
| `myth_bust` | Myth Buster | "Structure each carousel as debunking a common belief, with evidence on each slide." |
| `listicle` | Listicle | "Create numbered lists of tips, foods, habits. Each slide = one item." |
| `compare` | Comparison | "'This vs That' format. Compare foods, habits, routines side-by-side." |
| `protocol` | Protocol/How-To | "Step-by-step guides and daily protocols. Actionable and specific." |

**Additional strategy dimensions:**
- **Hook strategies:** `question`, `myth_buster`, `shocking_stat`, `personal_story`, `bold_claim`
- **Title formats:** `how_x_does_y`, `number_one_mistake`, `why_experts_say`, `stop_doing_this`, `hidden_truth`
- **Visual styles:** `dark_cinematic`, `light_clean`, `vibrant_bold`

Personalities are stored in `toby_strategy_scores` with `dimension='personality'` and scored like any other strategy.

### 9.2 Baseline Drift Detection 🔧 Planned

> **Status: Planned — not implemented in v1.0.** The fixed 30% explore ratio is Toby's current mechanism for catching algorithm changes and seasonal shifts.

The intended design — adaptive explore ratio based on detected performance drift:

```python
# PLANNED — not yet implemented
# Every 7 days, compare brand performance windows

def detect_drift(user_id: str) -> None:
    new_avg = avg(scores from last 14 days)
    old_avg = avg(scores from previous 14 days)

    if new_avg < old_avg * 0.80:
        # Performance dropped 20%+ → algorithm change or content fatigue
        # Increase explore ratio to 50% for next 7 days
        toby_state.explore_ratio = 0.50
        log("Performance drop detected — increasing exploration")

    elif new_avg > old_avg * 1.20:
        # Performance improved 20%+ → current strategy is working
        # Reduce explore ratio to 20% to exploit winners more
        toby_state.explore_ratio = 0.20
        log("Performance surge — exploiting winning strategies")
```

**Why it's not implemented yet:** Detecting statistically meaningful drift requires enough historical data and a defined response policy. The fixed 30% explore ratio is a safe default while that history accumulates.

**Seasonal topic rotation** is similarly planned: if a top-scoring topic shows 3 consecutive below-baseline posts, deprioritize it and re-test it later. This logic is not in the current codebase.

### 9.3 Cross-Brand Intelligence ⚠️ Partial

> **Status: Partial** — The database schema supports per-brand and cross-brand tracking (`brand_id` column in `toby_strategy_scores`). In v1.0, all strategy scores are stored with `brand_id = NULL`, meaning scores are aggregated at the user level across all brands. The cold-start transfer logic is planned but not yet implemented.

When a user has multiple brands, the **intended** cross-brand design is:

1. **New brand cold-start [Planned]:** When Toby starts with a new brand that has no performance history, it borrows the best strategies from other brands of the same user. This avoids wasting time re-testing strategies that already won elsewhere.

2. **Cross-brand insights [Planned]:** The insights dashboard will show which strategies work differently across brands. "Brand A does better with 'story' personality, Brand B with 'data-driven'" — this is expected behavior (different audiences).

3. **Follower-adjusted comparison [Live]:** When comparing cross-brand, Toby uses the relative score (vs. brand baseline), not absolute views. A 2x-above-average post is equally impressive whether the brand has 1k or 100k followers.

See Section 11.3 for the concrete implementation roadmap.

---

## 10. Edge Cases & Autonomous Behavior

### How to Read This Section

Each edge case is documented with five fields:

| Field | Meaning |
|---|---|
| **Trigger** | The exact condition or event that causes this edge case |
| **Current Behavior** | What the code actually does right now |
| **Correct Autonomous Behavior** | The desired behavior for a production-grade autonomous system |
| **Status** | ✅ Handled / ⚠️ Partial / 🔧 Planned / ❌ Bug |
| **User Visibility** | Whether this should appear in the Toby activity feed |

---

### A. Brand Lifecycle Events

#### A1. User Adds a New Brand While Toby Is Running

**Trigger:** User creates a new brand while the Toby orchestrator tick is active.

**Current Behavior:** The buffer manager queries `Brand.active == True` live on every 5-minute tick. A brand created between two ticks is picked up automatically on the next tick with no code change needed.

**Correct Autonomous Behavior:** Within 5 minutes, the new brand's empty slots appear in the buffer and Toby begins generating content for them. The activity feed shows `content_generated` entries including the brand ID.

**Status:** ✅ Handled — brand pickup is fully dynamic.

**User Visibility:** Yes — first generated content for the new brand appears in the activity feed.

---

#### A2. User Hard-Deletes a Brand

**Trigger:** User deletes a brand row from the `brands` table.

**Current Behavior:**
- `NicheConfig` rows are CASCADE deleted (FK defined in `niche_config.py:17`).
- The brand disappears from buffer manager queries on the next tick — no new content is planned.
- **Existing `ScheduledReel` rows are NOT automatically deleted.** They remain as `scheduled` and will fail at publish time when `brand_resolver.get_brand_config` returns `None`.
- `TobyStrategyScore` and `TobyContentTag` rows are NOT deleted.

**Correct Autonomous Behavior:**
1. On brand deletion, all future `ScheduledReel` rows for that brand in `scheduled` status should be soft-deleted or marked `cancelled`.
2. `TobyStrategyScore` rows should be retained (valuable for future re-adds).
3. The activity feed should log `brand_removed`.

**Status:** ⚠️ Partial — Buffer correctly stops planning. Existing scheduled posts for deleted brands will fail at publish time rather than being cleaned up proactively.

**User Visibility:** Yes — emit `brand_removed` at `info` level. Upcoming failing publish attempts will appear as `publish_failed` entries pointing to the deleted brand.

---

#### A3. User Deactivates (Soft-Disables) a Brand

**Trigger:** User sets `Brand.active = False` without deleting the brand.

**Current Behavior:** Buffer manager filters `Brand.active == True` — inactive brands are excluded from all new content planning. `_run_metrics_check` also filters by active brands, so metrics collection stops. Posts already in `scheduled` status for an inactive brand still publish (scheduler does not filter by brand active status).

**Correct Autonomous Behavior:** New content generation stops immediately (✅ this works). Existing scheduled posts should be optionally paused. Metrics for already-published posts from the inactive brand could continue collecting for the `days_back` window — currently they do not, creating a minor learning data gap.

**Status:** ⚠️ Partial — Content generation stops correctly. Metrics collection stops for inactive brands, creating a gap. Scheduled posts still publish.

**User Visibility:** Emit `brand_deactivated` at `info` level.

---

#### A4. User Disconnects Instagram Credentials (Token Nulled)

**Trigger:** User removes `meta_access_token` / `instagram_business_account_id` from a brand.

**Current Behavior:** `MetricsCollector` is a singleton that loads credentials at startup. If credentials are removed after startup, the in-memory `_brand_tokens` dict still holds stale credentials until the process restarts. Publishing calls `brand_resolver.get_brand_config` on every attempt (live DB read) — a brand with no `instagram_business_account_id` returns `credential_error: True` and the post is marked `failed`. **Content generation continues producing content that will never publish.**

**Correct Autonomous Behavior:**
1. `MetricsCollector` must re-load credentials from DB on each `collect_for_brand` call, not only at startup.
2. Before planning content for a brand, check that it has valid credentials. Skip brands with no `instagram_business_account_id`.
3. Emit `credential_warning` at `warning` level in the activity feed immediately, not after the first failed publish.

**Status:** ❌ Bug — Publishing fails correctly. Metrics collection silently uses stale credentials. Content is generated and wasted for credential-less brands. No user notification until publish fails.

**User Visibility:** Yes — `credential_warning` at `warning` level is critical. Users need to reconnect before the next scheduled post time.

---

#### A5. User Reconnects Instagram to a Different Account

**Trigger:** User updates `instagram_business_account_id` to a different IG account.

**Current Behavior:** Publishing picks up new credentials immediately (live DB read). MetricsCollector singleton uses old credentials until restart. Historical `PostPerformance` from the old account mixes with new account data in the same brand bucket, distorting the learning baseline.

**Correct Autonomous Behavior:** Publishing works immediately (✅). A `brand_reconnected` event should invalidate the MetricsCollector credential cache. Old `PostPerformance` data should be flagged with a `credential_change_at` timestamp so `get_brand_baseline` can optionally filter to post-reconnect data only.

**Status:** ⚠️ Partial — Publish works. Metrics and baseline do not account for account switches.

**User Visibility:** Yes — emit `brand_reconnected` at `info` level.

---

#### A6. Brand Has No Instagram Credentials (Toby Enabled But Not Connected)

**Trigger:** Toby is enabled for a user with a brand that has no `instagram_business_account_id`.

**Current Behavior:** Content generation proceeds fully — DeepSeek API called, images generated, Supabase uploads succeed, `ScheduledReel` created. At publish time, `brand_resolver` returns `credential_error: True` and the post is marked `failed`. The buffer manager then sees the failed slot as empty and generates **another** post for the same slot on the next tick, creating an **infinite resource-wasting loop** every 5 minutes.

**Correct Autonomous Behavior:** Before planning content for a brand, validate that `instagram_business_account_id` is configured. Skip unconfigured brands and emit `credential_warning` with explicit "Connect Instagram to start publishing" guidance.

**Status:** ❌ Bug — Toby generates real content (DeepSeek + image API quota) that will never publish, repeating every 5 minutes indefinitely.

**User Visibility:** Yes — `credential_warning` at `error` level with brand ID and setup guidance.

---

#### A7. Multiple Brands — One Loses Credentials While Others Are Fine

**Trigger:** One brand's token expires or is revoked in a multi-brand setup.

**Current Behavior:** Per-brand exceptions in `collector.collect_for_brand` are caught and logged but do not halt the loop for other brands. Other brands' metrics are unaffected. The failing brand silently accumulates errors with no persistent notification.

**Correct Autonomous Behavior:** Per-brand isolation is correct (✅). Additionally, after 3 consecutive failures for a specific brand over 18 hours, emit one `credential_expired` warning per brand per day — debounced to prevent activity feed flooding.

**Status:** ⚠️ Partial — Isolation works. Per-brand error notifications are absent.

**User Visibility:** Yes — `credential_expired` at `warning` level, debounced to once per brand per day.

---

### B. Content/Post Lifecycle Events

#### B1. User Manually Deletes a Scheduled (Not Yet Published) Post

**Trigger:** User deletes a Toby-created `ScheduledReel` row in `scheduled` status.

**Current Behavior:** The `ScheduledReel` is hard-deleted. The slot immediately appears empty to the buffer manager on the next tick — **the slot is automatically refilled** (this works correctly). The `TobyContentTag` for that `schedule_id` is NOT deleted (no FK cascade). It persists with `toby_score = NULL`, inflating `total_created` counts but not corrupting learning (scoring queries skip `NULL` scores where no `PostPerformance` exists).

**Correct Autonomous Behavior:** Slot refill is correct (✅). The orphaned `TobyContentTag` is a cosmetic data integrity issue. The activity feed should log `slot_refilled` with the slot time so the user understands why new content appeared.

**Status:** ⚠️ Partial — Slot refill works. Orphaned tags inflate counts. See G1 for the full orphan tag analysis.

**User Visibility:** Yes — `slot_refilled` at `info` level when regenerating a manually deleted slot.

---

#### B2. User Manually Deletes a Published Post From the UI

**Trigger:** User deletes a `ScheduledReel` with `status = published` from the dashboard.

**Current Behavior:** The `ScheduledReel` row is deleted. The associated `PostPerformance` row and `TobyContentTag` with its score remain untouched. The slot is already past (published), so no refill is triggered. Toby's learning data is fully preserved.

**Correct Autonomous Behavior:** This is correct behavior — published post deletion does not affect future content planning and preserves all learning data.

**Status:** ✅ Handled.

**User Visibility:** No Toby activity log needed. User-initiated UI action.

---

#### B3. User Manually Deletes a Published Post Directly on Instagram

**Trigger:** User deletes a post on Instagram directly. Toby receives no webhook.

**Current Behavior:** The next `MetricsCollector` call for that `ig_media_id` receives HTTP 404 and returns `None`. The existing `PostPerformance` row (if already created) is not updated — it retains its last-known metric values. If no `PostPerformance` row exists yet (post deleted before first metric collection), `score_pending_posts` never finds a matching row and `toby_score` remains `NULL` forever — **correctly excluded from learning**. If the post was deleted after metrics were already collected, the real metrics are used for scoring — also correct.

The critical risk: if a post is deleted before 48h scoring, the `TobyContentTag` is never scored, the experiment option loses a data point, and experiment completion is delayed (see E6).

**Correct Autonomous Behavior:**
1. After 3 consecutive 404 responses for the same `ig_media_id`, mark `PostPerformance.deleted_on_platform = True` and set metrics to `NULL` (not 0) to distinguish "deleted" from "zero-performance."
2. The `TobyContentTag` should be marked `invalidated = True` so its missing score does not count as an experiment non-result.
3. Emit `post_deleted_on_platform` at `info` level.

**Status:** ❌ Bug — No distinction between a deleted post and a zero-performing post. Deleted posts before scoring cause experiment stalls. No user notification.

**User Visibility:** Yes — `post_deleted_on_platform` at `info` level.

---

#### B4. User Manually Creates Content in a Slot Toby Was Going to Fill

**Trigger:** User schedules a post at a time slot that Toby's buffer would have targeted.

**Current Behavior:** The buffer manager builds `filled_set` from `ScheduledReel` rows matching `(extra_data["brand"], slot_time_str)`. User-created posts also store `brand` in `extra_data["brand"]`. As long as the user creates the post at **exactly** the slot hour (00 minutes) with the correct brand name in `extra_data`, the slot appears as filled and Toby does not generate for it.

Risk: if the user creates a post at 8:03 AM instead of 8:00 AM, or if `extra_data["brand"]` is missing, the slot is not recognized as filled and Toby generates a duplicate.

**Correct Autonomous Behavior:** Slot matching should use a fuzzy ±15-minute window rather than exact minute matching, making the system robust to user posts created at non-exact times.

**Status:** ⚠️ Partial — Exact-time manual posts correctly prevent duplicates. Off-by-minutes entries cause duplicates.

**User Visibility:** Users see two posts in the calendar for the same hour in the duplicate case.

---

#### B5. User Reschedules a Toby-Created Post to a Different Time

**Trigger:** User calls `reschedule(schedule_id, new_time)` on a Toby post.

**Current Behavior:** `scheduled_time` is updated in DB. The original slot now appears empty to the buffer manager and is refilled on the next tick (correct). The `TobyContentTag` retains the original `schedule_id` — when the post eventually publishes at the new time and is scored, the learning attribution is correct. Risk: if the user reschedules to a time where a post already exists, two posts sit at the same slot.

**Correct Autonomous Behavior:** Current behavior is mostly correct. No conflict detection exists at the destination time slot when rescheduling creates a collision.

**Status:** ⚠️ Partial — Rescheduling works and learning is preserved. No conflict detection at the destination slot.

**User Visibility:** The UI calendar view makes double-booking visible.

---

#### B6. User Edits or Overwrites a Toby-Created Post's Content

**Trigger:** User modifies the title, caption, or media of a Toby-created scheduled post.

**Current Behavior:** The `TobyContentTag` retains the original strategy metadata (personality, hook, visual style). When the post publishes and is scored, the score is attributed to Toby's original strategy, even though the content was human-modified. The correlation is broken.

**Correct Autonomous Behavior:** When a Toby-created post is edited, the `TobyContentTag` should be flagged `human_modified = True`. Scores from human-modified posts should be excluded from strategy learning or down-weighted.

**Status:** 🔧 Planned — No `human_modified` flag exists. Edited posts corrupt strategy learning with false attribution.

**User Visibility:** No — internal data quality concern.

---

#### B7. Post Stuck in "Publishing" State (Server Crash During Publish)

**Trigger:** Railway receives a deploy or crash signal while a post is mid-publish, leaving it in `status = "publishing"`.

**Current Behavior:** `reset_stuck_publishing(max_age_minutes=10)` runs on startup. Any post in `publishing` status older than 10 minutes is reset to `scheduled` for retry.

**Critical race condition:** If the IG API call completed (post went live) but the DB commit of `status = "published"` did not happen before the crash, resetting to `scheduled` causes the post to be **published again to Instagram — a duplicate**.

**Correct Autonomous Behavior:**
1. Before resetting a stuck post, check if an `ig_media_id` was stored in `extra_data["post_ids"]`. If yes, the IG API call completed — mark the post `published`, not `scheduled`.
2. If no `post_ids` exist, the API call never completed — safe to retry.
3. Track a `reset_count` column on `ScheduledReel` and escalate to `failed` after 3 resets to prevent infinite retry loops.

**Status:** ❌ Bug — Server crash during publishing can cause duplicate posts on Instagram. This is the distributed systems two-phase commit problem.

**User Visibility:** Yes — emit `post_reset_after_crash` at `warning` level so the user can manually check Instagram for duplicates.

---

#### B8. Post Fails to Publish (Instagram API Error)

**Trigger:** Instagram Graph API returns a non-2xx error during `check_and_publish`.

**Current Behavior:** Publisher returns `{"success": False, "error": "..."}`. Post is marked `failed`. The slot appears empty to the buffer manager. Toby generates a new post for the same time on the next tick — but if the failure happened near the slot time, the slot is now in the past and cannot be filled. Toby naturally moves on.

For **transient errors** (rate limiting, temporary outage), the post is permanently marked `failed` requiring manual user retry (`retry_failed` endpoint). No automatic retry logic exists for transient errors.

**Correct Autonomous Behavior:** For transient errors (e.g., HTTP 503, timeout), implement automatic retry with exponential backoff (15 min, 1 hour, 4 hours) before marking `failed`. For permanent errors (e.g., invalid credentials, duplicate media), fail immediately.

**Status:** ⚠️ Partial — Failure isolation is correct. No automatic retry for transient errors.

**User Visibility:** Yes — `publish_failed` at `error` level with error message and brand name.

---

#### B9. Post Published as "Partial" (Instagram OK, Facebook/YouTube Fails)

**Trigger:** Multi-platform publish loop succeeds for Instagram but fails for one or more other platforms.

**Current Behavior:** Post is marked `status = "partial"`. Failed platforms and errors are stored in `extra_data["publish_results"]`. Manual retry via `retry_failed(schedule_id)` re-attempts only failed platforms. Instagram metrics are collected normally (scoring unaffected). Toby does NOT automatically retry partial failures.

**Correct Autonomous Behavior:** Current partial handling is well-designed (✅ for tracking and manual retry). Add autonomous retry of `partial` posts after a configurable delay (30 minutes) without user intervention.

**Status:** ⚠️ Partial — Partial status tracking and manual retry implemented. Autonomous retry of partial failures is not.

**User Visibility:** Yes — `publish_partial` at `warning` level showing which platforms succeeded and failed.

---

### C. Instagram API Failures

#### C1. Instagram Access Token Expires (60-Day TTL)

**Trigger:** `meta_access_token` reaches its 60-day expiration. All subsequent Graph API calls return `{"error": {"code": 190, "type": "OAuthException"}}`.

**Current Behavior:** `fetch_media_metrics` receives HTTP 401, returns `None`. `collect_for_brand` increments `errors` and continues. **No persistent notification is written. No user alert. MetricsCollector continues attempting failed calls every 6 hours forever.** Publishing attempts fail with the post marked `failed` — this IS visible to the user, but the root cause (token expiry) is not distinguished.

**Correct Autonomous Behavior:**
1. When HTTP 190 (OAuthException / token expired) is received, emit `token_expired` at `error` level in the activity feed — **once per 24-hour window per brand**, not once per collection cycle.
2. Skip content generation for the affected brand until credentials are refreshed (currently generation continues, publishing fails).
3. Long-term: implement Meta long-lived token refresh flow.

**Status:** ❌ Bug — Token expiry silently kills all metrics collection with no user notification. The activity feed never shows why scores stopped updating.

**User Visibility:** Yes — `token_expired` at `error` level. This is the highest-priority user action notification in the entire system.

---

#### C2. Rate Limiting (429 Too Many Requests)

**Trigger:** The Instagram Graph API returns HTTP 429.

**Current Behavior:** `fetch_media_metrics` returns `None` on any non-200 status. The fallback to individual metric requests (on insights failure) actually **increases** the number of API calls made on failure, potentially worsening rate limit pressure. There is a `time.sleep(0.5)` between brands but no rate limit detection or backoff.

**Correct Autonomous Behavior:** On HTTP 429, stop all metric collection immediately and wait for the retry-after window (typically 1 hour per IG documentation). Suppress the individual-metric fallback when the failure is a rate limit (not a metric unavailability). Implement exponential backoff: first 429 → wait 1 hour, second consecutive → 4 hours, third → 24 hours.

**Status:** ❌ Bug — No rate limit detection. The fallback mechanism can amplify rate limit pressure.

**User Visibility:** No — rate limiting is infrastructure, not a user action event. Internal logging only.

---

#### C3. Account-Level Restrictions or Shadowban

**Trigger:** Instagram restricts the brand account (reduced reach, shadowban, or formal warning) — not detectable via API.

**Current Behavior:** No detection mechanism. Metrics continue to be collected. If a shadowban causes views to drop from 10,000 to 200, the scoring engine records the strategies used during this period as "these strategies score low," contaminating learned preferences with false negatives for potentially weeks.

**Correct Autonomous Behavior:**
1. Monitor for sustained drops in `avg_views` relative to the 14-day baseline. If brand average drops more than 80% in one week and remains low for 14 days, emit `performance_anomaly` at `warning` level.
2. Mark scores from the suspected restriction period as `low_confidence = True`. Down-weight them in `update_strategy_score`.

**Status:** 🔧 Planned — No anomaly detection. Performance drops from external causes corrupt learning data.

**User Visibility:** Yes — `performance_anomaly` at `warning` level if a sustained 80%+ drop is detected.

---

#### C4. IG Graph API Outage or Degraded Performance

**Trigger:** The Meta Graph API is partially or fully unavailable.

**Current Behavior:** `requests.get` with `timeout=15` raises `Timeout` or `ConnectionError`. These are caught and return `None`. The metric collection tick completes with errors, and the next attempt runs in 6 hours. For publishing: timeout causes the post to be permanently marked `failed`.

**Correct Autonomous Behavior:** Metrics gracefully degrade (✅ — skip and retry in 6 hours is correct). For publishing: timeouts should trigger automatic retry (see B8) rather than permanent failure.

**Status:** ⚠️ Partial — Metrics graceful degradation works. Publishing fails permanently on timeout.

**User Visibility:** Publishing timeout: `publish_failed` at `error` level. Metric collection timeout: no user visibility needed.

---

#### C5. Metrics Unavailable for Certain Post Types

**Trigger:** Some IG media types (carousels, images) do not support `plays` as a metric.

**Current Behavior:** The insights endpoint returns HTTP 400. The fallback tries individual metrics (`plays`, then `reach`). If `plays` is unavailable for a carousel post, `metrics["views"]` defaults to 0. `compute_toby_score` computes a false low score based on 0 views — a false negative specific to content type.

**Correct Autonomous Behavior:** `compute_toby_score` should use content-type-aware metric weights. For carousel posts (where `plays` is not applicable), substitute `reach` as the primary view signal. The `content_type` from `ScheduledReel` is available at scoring time.

**Status:** ⚠️ Partial — Fallback handles API errors gracefully. Metric weighting does not account for content type capabilities, causing systematic scoring bias against carousel posts.

**User Visibility:** No — internal data quality concern.

---

#### C6. Instagram Changes or Deprecates Metric Fields

**Trigger:** Meta renames a metric field (e.g., `plays` → `video_views`) or removes it entirely.

**Current Behavior:** The metric mapping uses hardcoded field names (`if name == "plays"`, `elif name == "saved"`). A renamed field silently produces 0 for all subsequent collections. No error is raised. All posts scored after the deprecation receive systematically wrong scores.

**Correct Autonomous Behavior:** Log a warning when an unrecognized field name appears in the API response, and when an expected field name is absent for 3+ consecutive collection cycles. The metric field mapping should be configurable without a code deploy.

**Status:** 🔧 Planned — No field-level deprecation detection. Silent data corruption on API changes.

**User Visibility:** No direct user visibility. Engineering alert is appropriate.

---

### D. Content Generation Failures

#### D1. DeepSeek API Outage or Rate Limit

**Trigger:** `ContentGeneratorV2` cannot reach the DeepSeek API.

**Current Behavior:** Exception propagates to `_run_buffer_check`, is caught, a `TobyActivityLog` error entry is written, and the slot remains empty. On the next tick (5 minutes), Toby tries again. This retry pattern is correct. However, with an extended outage, the error log entry is written **every 5 minutes**, flooding the activity feed.

**Correct Autonomous Behavior:** Retry on next tick is correct (✅). Debounce error logging: emit one `content_generation_failed` entry per hour per brand, not one per tick.

**Status:** ⚠️ Partial — Retry is correct. Activity log flooding during outages is not controlled.

**User Visibility:** Yes — `content_generation_failed` at `error` level, debounced to once per hour.

---

#### D2. All 3 Content Generation Quality Retries Fail

**Trigger:** `ContentGeneratorV2`'s quality gate rejects all 3 generation attempts.

**Current Behavior:** The generator silently falls back to `_fallback_post_title()` — a generic, non-personalized title. The content plan proceeds with fallback content. The user is not notified. The fallback content is treated identically to quality-passing content for learning purposes.

**Correct Autonomous Behavior:** When fallback content is used, the `TobyContentTag` should note `used_fallback = True`. Fallback content scores should not update strategy weights (the content was not chosen by the learning engine — it's arbitrary). Optionally, skip the slot entirely and retry on the next tick rather than publishing fallback content.

**Status:** ⚠️ Partial — Fallback prevents crashes. Fallback content is silently treated the same as normally generated content, polluting learning data.

**User Visibility:** No — generic content quality fallbacks are transparent to the user.

---

#### D3. Image Generation Service Down

**Trigger:** The AI image generation API is unavailable.

**Current Behavior:** Exception propagates, job is marked `failed`, slot remains empty, retried on next tick. Correct behavior.

**Status:** ✅ Handled — See D1 for the activity log debounce improvement needed.

**User Visibility:** Yes — `content_generation_failed` at `error` level (shared with D1 pattern).

---

#### D4. Video Rendering Fails Mid-Pipeline (Thumbnail Uploaded, Video Fails)

**Trigger:** FFmpeg video rendering fails after the thumbnail has already been successfully uploaded to Supabase.

**Current Behavior:** `JobProcessor.regenerate_brand` returns `{"success": False}`. The `ScheduledReel` is never created (correct). The thumbnail file already uploaded to Supabase remains (orphaned storage asset). `JobManager.cleanup_job_files` exists but is only called in the periodic `cleanup_published_jobs` task, not on generation failure.

**Correct Autonomous Behavior:** On any generation failure, clean up all Supabase files uploaded for that `job_id` immediately. `JobManager.cleanup_job_files(job_id)` should be called in the failure path of `_execute_content_plan`.

**Status:** ⚠️ Partial — Generation failure correctly prevents scheduling. Supabase cleanup on failure is not called, leading to orphaned storage files accumulating over time.

**User Visibility:** Yes — `content_generation_failed` at `error` level.

---

#### D5. Supabase Upload Fails (Auth or Storage Quota)

**Trigger:** Supabase storage returns a `StorageError` during media upload.

**Current Behavior:** Per project guidelines: always `raise Exception(f"Failed to upload: {str(e)}")`. The exception propagates, job fails, slot remains empty, retried on next tick. Correct for transient errors.

**Gap:** Storage quota exceeded is a permanent error — no amount of retrying will succeed. It is not distinguished from transient errors.

**Correct Autonomous Behavior:** Detect quota errors from the Supabase error response. On quota exceeded, emit `storage_quota_exceeded` at `error` level and pause all content generation until the issue is resolved.

**Status:** ⚠️ Partial — Transient upload failures handled correctly. Permanent errors (quota) are not distinguished.

**User Visibility:** Yes — `storage_quota_exceeded` at `error` level requires immediate user action.

---

#### D6. Partial Media Pipeline (Thumbnail OK, Video Fails)

Same as D4 — see above.

---

### E. Learning Engine Edge Cases

#### E1. No Strategy Scores Exist Yet (Cold Start)

**Trigger:** First enable, or after a reset. `TobyStrategyScore` table has zero rows.

**Current Behavior:** `_pick_dimension` finds no scores, falls through to `return random.choice(options)`. Every dimension is chosen randomly — correct cold-start behavior.

**Correct Autonomous Behavior:** Random cold start is correct (✅). Enhancement: when the same user has other brands with performance history, use cross-brand scores as warm-start priors rather than pure random (see Section 12, Phase C).

**Status:** ✅ Handled — cold start works correctly.

**User Visibility:** No — cold start is transparent to the user.

---

#### E2. All Strategy Options Have Equal Average Scores (No Winner)

**Trigger:** Multiple options have identical `avg_score` values.

**Current Behavior:** The exploit path uses `ORDER BY avg_score DESC LIMIT 1`. On exact ties, the DB returns an arbitrary row based on insertion order. The same option may "win" ties consistently due to row ordering rather than genuine performance difference.

**Correct Autonomous Behavior:** Break ties by `sample_count` (prefer the better-sampled option) or randomly among tied options to maintain exploration. True Thompson Sampling (roadmap, Section 12) resolves this elegantly through probabilistic sampling.

**Status:** ⚠️ Partial — Works in the non-tie case. Ties resolved by DB insertion order.

**User Visibility:** No — internal learning engine behavior.

---

#### E3. A Strategy Option Is Removed from NicheConfig After Scoring

**Trigger:** User removes a topic category from their Content DNA. Existing `TobyStrategyScore` rows for that topic remain.

**Current Behavior:** `_pick_dimension` checks `if scores and scores.option_value in options` (where `options` = current NicheConfig topics). The removed topic falls through to random selection from remaining options. Stale score records remain but are never selected.

**Status:** ✅ Handled — correct behavior. Removed options are naturally excluded.

**User Visibility:** No.

---

#### E4. Post Scores 0 Because Instagram Deleted It, Not Because Content Was Bad

**Trigger:** User deletes a post from Instagram before metrics are collected.

**Current Behavior:** `fetch_media_metrics` returns `None` (404). `PostPerformance` row is never created. `score_pending_posts` finds no matching row and `toby_score` remains `NULL`. The strategy receives no feedback — neither positive nor negative. This is actually **correct behavior** (`NULL` scores are excluded from learning).

**Status:** ✅ Handled — `NULL` scores correctly exclude deleted posts from strategy learning. The experiment stall risk is documented in E6.

**User Visibility:** No.

---

#### E5. Post Scores ~20 Because Metrics API Failed, Not Because Content Performed Poorly

**Trigger:** `MetricsCollector` returns 0 metrics for a post due to API failure (timeout, 429, etc.) — not because the post actually performed poorly.

**Current Behavior:** If a `PostPerformance` row exists with `views = 0` (metrics were collected but API returned zeros due to failure), `compute_toby_score` calculates:
- `raw_views_score = 0` (log of 1 = 0)
- `relative_score = 50` (no baseline fallback)
- `engagement_score = 0`
- `follower_context_score = 50`
- **Final score = 20**

This false score of **20** is fed into `update_strategy_score`. Strategies used during API outage periods are systematically penalized with phantom `20` scores.

**Correct Autonomous Behavior:** `PostPerformance` rows created from zero-metric API failure responses should be flagged `metrics_unreliable = True`. Scores computed from unreliable metrics should be tagged `score_confidence = "low"` on `TobyContentTag` and excluded (or down-weighted at 0.2×) in `update_strategy_score`.

**Status:** ❌ Bug — Zero-metric records from API failures produce a false score of 20, systematically penalizing strategies used during API outage periods.

**User Visibility:** No direct user visibility. Internal data quality concern.

---

#### E6. Experiment Never Reaches min_samples (One Option Never Explored)

**Trigger:** An active `TobyExperiment` with `options = ["story", "provoc"]` and `min_samples = 5`. The 30% explore phase randomly selects `story` for all explore slots and never selects `provoc`. The `all_sufficient` check requires ALL options to reach `min_samples` — `provoc` stays at count=0 and the experiment never completes.

**Current Behavior:** The experiment remains in `active` status forever. No timeout exists. Every new experiment on the same dimension is blocked because of the unique constraint `(user_id, content_type, dimension, status='active')`.

**Correct Autonomous Behavior:** Implement an experiment timeout: after `max_days` (suggested: 21 days for a 5-sample experiment) without completion, force-complete the experiment by selecting the option with the highest current `avg_score` as the winner, even if `min_samples` was not reached for all options. Log `experiment_timeout` at `warning` level.

**Status:** ❌ Bug — No experiment timeout. Stalled experiments permanently block the experiment slot for that dimension.

**User Visibility:** Yes — `experiment_timeout` at `warning` level after 21 days without completion.

---

#### E7. Extreme Outlier Post (10x Brand Average — Goes Viral)

**Trigger:** A post goes viral with 10x the brand's average views.

**Current Behavior:** `compute_toby_score` caps relative performance at `min(100, ratio * 25)` — a 10x post receives `relative_score = 100`. `avg_score` is used for exploit selection (not `best_score`), so a single viral outlier moves the average but does not permanently dominate selection. Welford's variance update tracks consistency.

**Correct Autonomous Behavior:** The capping mechanism limits outlier inflation, and `avg_score`-based selection is correct (✅). Enhancement: emit a `viral_post_detected` success entry in the activity feed with the post's score and strategy used — valuable feedback for the user.

**Status:** ✅ Handled — outlier inflation is capped. Variance is tracked. Selection correctly uses `avg_score`.

**User Visibility:** Yes — emit `viral_post_detected` at `success` level with the strategy that produced the viral post.

---

### F. Concurrency & Race Conditions

#### F1. Two Toby Ticks Run Simultaneously (APScheduler Overlap)

**Trigger:** The `toby_tick` job takes longer than 5 minutes (e.g., multi-user scenario). APScheduler starts a new tick before the previous one completes.

**Current Behavior:** `max_instances` is not set on the `toby_orchestrator` APScheduler job. APScheduler's default allows multiple concurrent instances of the same job. Two concurrent `toby_tick` calls both query the same empty slots and both call `_execute_content_plan` for the same slot — both succeed, scheduling two `ScheduledReel` rows at the same `scheduled_time` and `brand_id`. There is **no UNIQUE constraint** on `(user_id, brand_id, scheduled_time)` in `scheduled_reels` to prevent this.

**Correct Autonomous Behavior:**
1. Set `max_instances=1` on the `toby_orchestrator` APScheduler job — first line of defense.
2. Add a UNIQUE DB constraint on `(user_id, scheduled_time, (extra_data->>'brand'))` — second line of defense.
3. Introduce a slot reservation step (write `status = "generating"` placeholder row before generation begins) — third line of defense.

```python
# Fix: APScheduler concurrency protection
scheduler.add_job(
    toby_tick, 'interval', minutes=5,
    id='toby_orchestrator', replace_existing=True,
    max_instances=1,  # ADD THIS
)
```

```sql
-- Fix: Prevent duplicate slots at DB level
ALTER TABLE scheduled_reels
  ADD CONSTRAINT uq_brand_slot
  UNIQUE (user_id, scheduled_time, (extra_data->>'brand'));
```

**Status:** ❌ Bug — No concurrency protection at either the scheduler or DB level. Concurrent ticks can produce duplicate posts for the same slot.

**User Visibility:** Users see two posts in the calendar for the same time slot.

---

#### F2. Toby and User Create Content for the Same Slot Simultaneously

**Trigger:** User manually schedules a post via the UI at the exact moment Toby is generating content for the same slot.

**Current Behavior:** Both `schedule_reel` calls succeed (no DB uniqueness constraint). The buffer manager's `filled_set` deduplicates on the next query, preventing a third generation. But two posts now exist for the same slot.

**Correct Autonomous Behavior:** Same UNIQUE constraint as F1 prevents this at the DB level. The `_run_buffer_check` should also re-query the buffer status immediately before `_execute_content_plan` (double-checked locking) to confirm the slot is still empty after content generation completes.

**Status:** ❌ Bug — Same root cause as F1.

**User Visibility:** Two posts appear in the calendar for the same slot.

---

#### F3. Slot Appears Empty While Content Is Being Generated (In-Flight Gap)

**Trigger:** Toby begins generating content for a slot (Steps 1-6 of `_execute_content_plan`). A second tick fires during the 5-30 seconds of generation. The second tick sees the slot as empty (no `ScheduledReel` row yet) and plans another piece of content.

**Current Behavior:** No "generation in progress" state is tracked in the DB. The `ScheduledReel` row is only created at Step 7. Any concurrent tick that overlaps Steps 1-6 sees the slot as empty.

**Correct Autonomous Behavior:** Before beginning `_execute_content_plan`, write a placeholder `ScheduledReel` row with `status = "generating"`. On successful completion, update to `status = "scheduled"` with real media URLs. On failure, delete the placeholder so the slot reverts to empty. This closes the in-flight generation gap.

**Status:** ❌ Bug — No slot reservation. In-flight generation is invisible to concurrent ticks.

**User Visibility:** No — background race condition.

---

#### F4. Railway Deploy Interrupts an In-Progress Generation

**Trigger:** Railway deployment sends SIGTERM while `_execute_content_plan` is running.

**Current Behavior:** Steps 1-3 (NicheConfig loading, DeepSeek text generation) are ephemeral — no persistent state. A crash during Steps 1-3 leaves the slot empty; the next tick refills it. A crash during Steps 4-6 (after `GenerationJob` is created) is recoverable via the existing `resume_job` mechanism in `startup_event`.

**Correct Autonomous Behavior:** The current design is correct — crash during Steps 1-3 is safe (slot remains empty, retried next tick). Crash during Steps 4-6 is handled by startup job recovery. The slot reservation in F3 would further improve recovery.

**Status:** ✅ Handled — crash recovery is correct for all stages of the pipeline.

**User Visibility:** No — brief generation interruptions are transparent to the user.

---

#### F5. User Disables Toby While a Generation Is in Progress

**Trigger:** User calls `POST /api/toby/disable` while `_execute_content_plan` is executing.

**Current Behavior:** `disable_toby` sets `enabled = False` in the DB. The in-progress generation does not check `state.enabled` mid-execution. The generation completes, the post is scheduled, and it appears in the calendar — even though Toby is now disabled. On the next tick, Toby is excluded from processing (`enabled = False` filter). No more content is generated.

**Correct Autonomous Behavior:** Completing an in-flight generation is preferable to crashing mid-pipeline (which would leave orphaned Supabase files). The one in-flight post completing after disable is correct behavior.

**Status:** ✅ Handled — in-flight generation completes gracefully after disable.

**User Visibility:** The scheduled post appears in the calendar after Toby is disabled. The `created_by = "toby"` field identifies it as Toby-created. User can delete it if unwanted.

---

### G. Data Integrity & Orphaned Records

#### G1. TobyContentTag Orphaned When Parent ScheduledReel Is Hard-Deleted

**Trigger:** `delete_scheduled(schedule_id)` removes the `ScheduledReel` row. No FK cascade exists on `toby_content_tags.schedule_id`.

**Current Behavior:** The `TobyContentTag` row persists with `toby_score = NULL`. In `score_pending_posts`, when no `PostPerformance` row exists, the tag is correctly skipped (no learning corruption). However: `total_created` counts in the status API include orphaned tags, inflating the reported number. If the orphaned tag had an `experiment_id`, the experiment is waiting for this option to reach `min_samples` — it never will (see E6).

**Correct Autonomous Behavior:**
1. Add a FK: `FOREIGN KEY (schedule_id) REFERENCES scheduled_reels(schedule_id) ON DELETE SET NULL` — when a parent is deleted, set `schedule_id = NULL` on the tag.
2. Filter `total_created` to exclude tags with `schedule_id IS NULL`.
3. For experiment tracking, dereference orphaned tags' experiment links.

```sql
ALTER TABLE toby_content_tags
  ADD CONSTRAINT fk_toby_tag_schedule
  FOREIGN KEY (schedule_id) REFERENCES scheduled_reels(schedule_id)
  ON DELETE SET NULL;
```

**Status:** ❌ Bug — No FK constraint. Orphaned tags inflate counts and contribute to experiment stalls.

**User Visibility:** No direct user visibility. Inflated `total_created` count is a cosmetic issue.

---

#### G2. Strategy Scores After Their Experiment Completes or Is Deleted

**Trigger:** `TobyExperiment` is marked `completed`. `TobyStrategyScore` rows for the winning option persist.

**Current Behavior:** `reset_toby` deletes all experiments and strategy scores (clean reset). Completed experiments leave score data intact, which continues informing the exploit path — this is correct. Post-completion strategy scores remain as the "learned preference" for that dimension.

**Status:** ✅ Handled — completed experiment scores correctly persist as learned preferences.

**User Visibility:** No.

---

#### G3. Brand Historical Performance Data Is Wiped

**Trigger:** `PostPerformance` rows are deleted (manual cleanup, migration error).

**Current Behavior:** `get_brand_baseline` returns `{"avg_views": 0, ...}`. `compute_toby_score` returns `relative_score = 50` (neutral fallback). System continues functioning with degraded scoring — same as cold start.

**Status:** ✅ Handled — graceful fallback to neutral scoring.

**User Visibility:** No.

---

#### G4. Long-Term Data Accumulation

**Trigger:** Toby has been running for 6-12 months. `toby_activity_log` has millions of entries.

**Current Behavior:** `cleanup_old_logs` deletes log entries older than 7 days. `cleanup_published_jobs` deletes published `ScheduledReel` rows. `PostPerformance`, `TobyStrategyScore`, and `TobyContentTag` rows are never cleaned up. The `get_brand_baseline` query is bounded by `days_back` (14 days), so it does not scan all history. `get_insights` queries all `TobyStrategyScore` rows — manageable at current scale (~50 rows per user).

**Status:** ✅ Handled at current scale. Index on `(brand, published_at)` in `PostPerformance` is recommended when table exceeds 100k rows.

**User Visibility:** No.

---

### H. Phase & State Edge Cases

#### H1. User Resets Toby During Active Experiments

**Trigger:** User clicks "Reset Toby" while experiments are in `active` status.

**Current Behavior:** `reset_toby` deletes all `TobyExperiment`, `TobyStrategyScore`, and `TobyContentTag` rows. Phase resets to `bootstrap`. A `toby_reset` log entry is written at `warning` level.

**Correct Autonomous Behavior:** Current behavior is intentional and correct — the user explicitly requested a reset. Enhancement: before deletion, serialize the current experiment state as metadata in the activity log, giving the user a historical record of what was in progress.

**Status:** ✅ Handled — clean reset as designed.

**User Visibility:** Yes — `toby_reset` at `warning` level, visible in activity feed.

---

#### H2. User Disables Toby Mid-Analysis

**Trigger:** User disables Toby while `_run_analysis_check` is executing.

**Current Behavior:** The in-progress analysis completes — it reads metrics, computes scores, writes `TobyContentTag.toby_score` values and `TobyStrategyScore` updates. Each tag is scored atomically. Completing a partial analysis is correct — aborthing mid-write could leave inconsistent state.

**Status:** ✅ Handled — analysis completes gracefully after disable.

**User Visibility:** No.

---

#### H3. Phase Transition When Nothing Has Published Yet

**Trigger:** Toby has been in bootstrap for 7+ days and has generated 10+ posts, but none have published (e.g., all stuck as `scheduled` due to credential failures).

**Current Behavior:** `check_phase_transition` requires `scored_post_count >= BOOTSTRAP_MIN_POSTS` where `scored_post_count` = count of `TobyContentTag` rows with `toby_score IS NOT NULL`. If no posts have published, `scored_post_count = 0`. Phase stays in bootstrap — **correct behavior**.

**Correct Autonomous Behavior:** Phase transitions correctly require real scored data. Toby staying in bootstrap while publishing is broken is a safeguard. The root cause (publishing failures) is surfaced in the activity feed.

**Status:** ✅ Handled — phase transition requires real data, not just generated data.

**User Visibility:** The user sees Toby stuck in "bootstrap" phase. Repeated `publish_failed` entries in the activity feed explain why.

---

#### H4. Phase Regression: Optimizing Brand Drops in Performance

**Trigger:** A brand in the `optimizing` phase experiences sustained performance drop (algorithm change, shadowban, seasonal shift).

**Current Behavior:** Phase transitions only go forward (`bootstrap → learning → optimizing`). No regression mechanism exists (`state.py:86-121`). A brand stays in `optimizing` forever regardless of performance trajectory. The learning engine continues using exploit-heavy selection (low `explore_ratio`), reinforcing failing strategies.

**Correct Autonomous Behavior:**
1. Add a performance monitoring check comparing the brand's 14-day average score against the rolling 90-day average.
2. If the 14-day average drops below 50% of the 90-day average for 2 consecutive analysis cycles, temporarily increase `explore_ratio` to 0.60 for the next 14 days to force re-exploration.
3. Automatically restore `explore_ratio` when performance recovers.
4. Log `performance_regression_detected` at `warning` level.

**Status:** 🔧 Planned — No dynamic `explore_ratio` adjustment. Performance regressions in optimizing phase are silent.

**User Visibility:** Yes — `performance_regression_detected` at `warning` level.

---

#### H5. Multiple Brands at Different Maturity Levels

**Trigger:** User has Brand A (new, bootstrapping) and Brand B (6 months old, optimizing). Both processed by the same `TobyState`.

**Current Behavior:** `TobyState` is per-user, not per-brand. The phase, `explore_ratio`, and all configuration values apply uniformly to all brands. Brand A (with zero history) receives the same exploit-heavy selection as Brand B, skipping cold-start exploration.

**Correct Autonomous Behavior:** `choose_strategy` should use a brand's own `PostPerformance` history length to determine its effective explore ratio dynamically: if Brand A has 0 records, use `explore_ratio = 1.0` (pure explore). If Brand B has 200, use the configured ratio. No schema change required — query `PostPerformance` count per brand at strategy selection time.

**Status:** ⚠️ Partial — Phase and explore_ratio are per-user. New brands added to mature accounts get suboptimal cold-start behavior.

**User Visibility:** No direct user visibility. New brand content quality may be suboptimal in early weeks.

---

### I. Discovery & Trend Intelligence

#### I1. Competitor Account Becomes Private or Gets Deleted

**Trigger:** A competitor in `NicheConfig.competitor_accounts` makes their IG account private or deletes it.

**Current Behavior:** `TrendScout.scan_competitors` calls the Business Discovery API. A private/deleted account returns empty `business_discovery`. `discover_competitor` returns an empty list silently. The error is logged in the discovery tick. **No circuit breaker exists** — Toby permanently retries the inaccessible account on every discovery cycle (every 6 hours).

**Correct Autonomous Behavior:** Track per-competitor failure counts. After 3 consecutive failures for a competitor, mark it as `unreachable` and stop scanning it. Emit `competitor_unreachable` at `info` level suggesting the user update their Content DNA.

**Status:** ❌ Bug — No circuit breaker for persistent competitor account failures. Toby permanently wastes API quota on inaccessible accounts.

**User Visibility:** Yes — `competitor_unreachable` at `info` level after 3 consecutive failures.

---

#### I2. Hashtag Gets Banned by Instagram

**Trigger:** A hashtag in `NicheConfig.discovery_hashtags` is banned by Instagram.

**Current Behavior:** The hashtag search returns empty results or an error. `scan_hashtags` returns `{"total_found": 0}`. The same hashtag is retried on every discovery cycle indefinitely.

**Correct Autonomous Behavior:** After 5 consecutive empty-result discovery cycles for a hashtag, flag it as `potentially_banned` and reduce scan frequency to weekly. After 4 weeks of empty results, emit `hashtag_potentially_banned` at `info` level.

**Status:** ❌ Bug — No detection of permanently ineffective hashtags. Toby wastes the weekly hashtag quota on banned hashtags.

**User Visibility:** Yes — `hashtag_potentially_banned` at `info` level with hashtag name.

---

#### I3. Own Brand Instagram Account Gets Deleted or Renamed

**Trigger:** The brand's own IG account is deleted or renamed.

**Current Behavior:** Account IDs (numeric `ig_user_id`) do not change on rename — renames are handled gracefully. Deletion causes API errors in `scan_own_accounts`, caught by error handling, logged, retried on next cycle. No critical distinction from a competitor account failure.

**Correct Autonomous Behavior:** Own account discovery failure after 3 consecutive cycles is a critical event (all publishing will also fail). Emit `own_account_unreachable` at `error` level — more severe than competitor failures.

**Status:** ⚠️ Partial — Rename gracefully handled. Deletion caught by error handling but not surfaced as a critical event.

**User Visibility:** Yes — `own_account_unreachable` at `error` level after 3 consecutive failures.

---

#### I4. TrendScout Returns Empty Results for Entire Discovery Cycle

**Trigger:** All scans (own accounts, competitors, hashtags) return 0 results in one cycle.

**Current Behavior:** `run_discovery_tick` returns `{"own_accounts": 0, "competitors": 0, "hashtags": 0}`. Activity log records `discovery_scan` with zero counts. Content generation is unaffected (Toby uses NicheConfig topics regardless of discovery data).

**Correct Autonomous Behavior:** Single zero-result cycles are not inherently a problem. After 5 consecutive zero-result cycles, emit `discovery_dry_spell` at `info` level prompting the user to review their competitor and hashtag lists.

**Status:** ⚠️ Partial — Individual zero-result cycles are graceful. Sustained dry spells are not detected.

**User Visibility:** Yes — `discovery_dry_spell` at `info` level after 5 consecutive zero-result cycles.

---

### J. First-Enable Validation (Pre-Flight Checks)

The `POST /api/toby/enable` endpoint currently has **zero validation** — it sets `enabled = True` regardless of system state.

#### J1. No Brands Exist for User

**Trigger:** User enables Toby before creating any brands.

**Current Behavior:** Toby enables successfully. The buffer manager queries `Brand.active == True`, gets zero brands, returns `{"health": "healthy", "total_slots": 0}`. Toby silently does nothing forever. The user has no feedback that Toby is not working.

**Correct Autonomous Behavior:** `enable_toby` must perform pre-flight validation:
1. At least one active brand exists for the user.
2. At least one brand has `instagram_business_account_id` configured.
3. A `NicheConfig` with at least 1 topic category exists.

If validation fails, return a structured error:
```json
{
  "error": "preflight_failed",
  "preflight_failures": [
    "no_active_brands",
    "no_instagram_credentials",
    "niche_config_empty"
  ],
  "guidance": "Create a brand and connect Instagram before enabling Toby."
}
```

```python
# Required code change in state.py:enable_toby
def enable_toby(db: Session, user_id: str) -> TobyState:
    brands = db.query(Brand).filter(
        Brand.user_id == user_id, Brand.active == True
    ).all()
    if not brands:
        raise ValueError("preflight:no_active_brands")
    credentialed = [b for b in brands if b.instagram_business_account_id]
    if not credentialed:
        raise ValueError("preflight:no_instagram_credentials")
    configs = db.query(NicheConfig).filter(NicheConfig.user_id == user_id).all()
    if not any(c.topic_categories for c in configs):
        raise ValueError("preflight:niche_config_empty")
    # ... proceed with enable
```

**Status:** ❌ Bug — No pre-flight validation. Users can enable Toby into a broken state with no feedback. The system silently wastes resources indefinitely.

**User Visibility:** The enable API response must include `preflight_failures` so the UI can show specific setup guidance.

---

#### J2. Brand Exists But NicheConfig Is Empty or Incomplete

**Trigger:** User creates a brand but never configures Content DNA. `NicheConfig` exists with empty arrays.

**Current Behavior:** `_get_available_topics` returns `["general"]`. Content is generated with `topic_hint="general"` — generic wellness content with no niche specificity. The brand's voice, tone, and CTA preferences are all defaults. Content publishes but is off-brand and likely to underperform.

**Correct Autonomous Behavior:** Pre-flight blocks on completely empty config (see J1). For partially configured NicheConfig (fewer than 3 topics, no tone), emit `content_dna_incomplete` at `warning` level after first generation to prompt the user to improve their setup.

**Status:** ⚠️ Partial — Content generates gracefully using defaults. No warning that output will be generic due to incomplete setup.

**User Visibility:** Yes — `content_dna_incomplete` at `warning` level after first content generation with incomplete NicheConfig.

---

#### J3. Brand Exists But No Instagram Credentials

**Trigger:** User adds a brand without connecting Instagram before enabling Toby.

**Current Behavior:** See A6 — infinite content generation waste cycle.

**Correct Autonomous Behavior:** Pre-flight check in `enable_toby` — see J1.

**Status:** ❌ Bug — see A6.

---

#### J4. Content DNA Has Fewer Than 2 Topic Categories (Insufficient for Experimentation)

**Trigger:** `NicheConfig.topic_categories` has 0-1 entries.

**Current Behavior:** `create_experiment` can create an experiment with `options = ["general"]` — a single-option experiment. The `all_sufficient` check requires ALL options to reach `min_samples`, but with 1 option there is no comparison, and the `len(options) > 1` winner check (line 224) never fires. The experiment remains `active` forever, permanently blocking the `topic` dimension experiment slot.

**Correct Autonomous Behavior:**
1. `create_experiment` must enforce `len(options) >= 2`. Return `None` if fewer options are provided.
2. The topic experiment should only start when at least 2 topic categories exist.
3. Surface as pre-flight warning: "Add at least 2 topic categories to enable topic experimentation."

**Status:** ❌ Bug — Single-option experiments create a permanent stall for the topic dimension experiment slot.

**User Visibility:** Yes — `insufficient_topics_for_experiment` at `info` level on first enable.

---

#### J5. All Brands Are Inactive

**Trigger:** User has brands configured but all have `active = False`.

**Current Behavior:** Same as J1 — zero active brands found, buffer is "healthy" with zero slots, Toby silently does nothing.

**Correct Autonomous Behavior:** Pre-flight check blocks enable if all brands are inactive. If brands are deactivated after Toby is already enabled, emit `no_active_brands` at `warning` level.

**Status:** ❌ Bug — Same root cause as J1. No detection that all brands are inactive after enable.

**User Visibility:** Yes — `no_active_brands` at `warning` level.

---

### Edge Case Status Summary

| Status | Count | Examples |
|---|---|---|
| ✅ Handled | 12 | A1, B2, B4 (exact match), D3, E1, E3, E4, E7, F4, F5, G2, G3, H1, H2, H3 |
| ⚠️ Partial | 16 | A2, A3, A5, A7, B1, B5, B8, B9, C4, C5, D1, D2, D4, D5, E2, G4, H5, I4 |
| 🔧 Planned | 4 | B6, C3, C6, H4 |
| ❌ Bug | 15 | A4, A6, B3, B7, C1, C2, E5, E6, F1, F2, F3, G1, I1, I2, J1, J3, J4, J5 |

### Critical Bugs Requiring Immediate Attention

These bugs cause real data corruption, duplicate posts, or wasted API resources in production:

| Priority | Bug | Impact |
|---|---|---|
| P0 | F1/F2 — No UNIQUE constraint on `(user_id, brand_id, scheduled_time)` | Concurrent ticks can publish duplicate posts to Instagram |
| P0 | B7 — `reset_stuck_publishing` can cause duplicate IG posts | Server crash + recovery can publish same post twice |
| P0 | A4/A6/J1 — No pre-flight validation on `enable_toby` | Infinite wasted DeepSeek + image API quota for credential-less brands |
| P1 | C1 — Token expiry kills metrics silently with no notification | Scores stop updating after 60 days; user has no idea |
| P1 | E5 — Zero-metric API failures produce false score of ~20 | Strategies penalized during outage periods; learning corrupted |
| P1 | E6 — No experiment timeout | Stalled experiments permanently block dimension slots |
| P1 | J4 — Single-option experiments can be created | Permanent topic dimension stall for users with 1 topic |
| P2 | G1 — No FK on `toby_content_tags.schedule_id` | Orphaned tags inflate counts and contribute to experiment stalls |
| P2 | I1/I2 — No circuit breaker for competitor/hashtag failures | Permanent API quota waste on inaccessible accounts/banned hashtags |

### Implementation Notes

**Required Database Changes:**

```sql
-- P0: Prevent duplicate slot scheduling (Fixes F1, F2)
ALTER TABLE scheduled_reels
  ADD CONSTRAINT uq_brand_slot
  UNIQUE (user_id, scheduled_time, (extra_data->>'brand'));

-- P2: Orphan tag prevention (Fixes G1)
ALTER TABLE toby_content_tags
  ADD CONSTRAINT fk_toby_tag_schedule
  FOREIGN KEY (schedule_id) REFERENCES scheduled_reels(schedule_id)
  ON DELETE SET NULL;
```

**Required Code Changes:**

```python
# P0: APScheduler concurrency protection (orchestrator.py)
scheduler.add_job(
    toby_tick, 'interval', minutes=5,
    id='toby_orchestrator', replace_existing=True,
    max_instances=1,  # ADD THIS
)

# P0: Pre-flight validation (state.py:enable_toby)
def enable_toby(db: Session, user_id: str) -> TobyState:
    brands = db.query(Brand).filter(
        Brand.user_id == user_id, Brand.active == True
    ).all()
    if not brands:
        raise ValueError("preflight:no_active_brands")
    if not any(b.instagram_business_account_id for b in brands):
        raise ValueError("preflight:no_instagram_credentials")
    configs = db.query(NicheConfig).filter(NicheConfig.user_id == user_id).all()
    if not any(c.topic_categories for c in configs):
        raise ValueError("preflight:niche_config_empty")
    # ... proceed

# P1: Experiment timeout (learning_engine.py)
EXPERIMENT_TIMEOUT_DAYS = 21

def check_experiment_timeout(db, user_id: str) -> None:
    cutoff = datetime.utcnow() - timedelta(days=EXPERIMENT_TIMEOUT_DAYS)
    stale = db.query(TobyExperiment).filter(
        TobyExperiment.user_id == user_id,
        TobyExperiment.status == "active",
        TobyExperiment.started_at <= cutoff,
    ).all()
    for exp in stale:
        # Force-complete with current best option
        best = max(exp.results.items(),
                   key=lambda x: x[1].get("avg_score", 0),
                   default=(None, {}))[0]
        exp.status = "completed"
        exp.winner = best
        exp.completed_at = datetime.utcnow()
        log_activity(db, user_id, "experiment_timeout", ...)

# P1: Credential refresh on each collection (metrics_collector.py)
def collect_for_brand(self, brand: str, days_back: int = 14) -> Dict:
    # Refresh credentials from DB on each call — not only at init
    self._load_brand_credentials()
    token = self._brand_tokens.get(brand, {}).get("access_token")
    if not token:
        return {"error": "no_credentials", "skipped": True}
    # ... existing logic
```

---

## 11. Toby Today vs. True AI Autonomy

### 10.1 Honest Assessment: What Toby Is

Toby v1.0 is **sophisticated automation with statistical learning** — not autonomous AI in the research sense. This distinction matters because it correctly sets expectations and maps out what "true AI" would actually require to build.

| Dimension | Toby v1.0 (Live) | True Autonomous AI |
|---|---|---|
| **Decision-making** | Deterministic priority queue — buffer first, then metrics, then analysis | LLM-based reasoning: reads data, forms hypotheses, decides strategy in natural language |
| **Strategy selection** | Epsilon-greedy: 70% pick best avg_score, 30% random | True Thompson Sampling (Bayesian Beta distributions) or policy gradient RL |
| **Adaptation** | Fixed 30% exploration forever | Adaptive explore ratio based on detected performance drift |
| **Performance understanding** | Tracks correlation: "this hook got high scores" | Causal reasoning: "this hook works because the audience for this topic responds to urgency" |
| **Discovery integration** | Stores discovered trends, does not act on them | Discovery Agent signals Strategy Agent: "sleep content is spiking — start a hook experiment" |
| **Multi-brand** | All brands share a single strategy pool (brand_id=NULL) | True per-brand learning with cold-start transfer from other brands |
| **Agent architecture** | One orchestrator calling functions sequentially | Specialized agents (Content, Analysis, Discovery, Strategy) communicating asynchronously |
| **Self-modification** | Cannot change its own logic; engineers change code | Strategy Agent adjusts its own experiment priorities based on observed patterns |

### 10.2 What Makes Something "True AI"

For Toby to be accurately called an autonomous AI agent (in the technical sense), it would need to satisfy at minimum:

**1. LLM Reasoning Layer**

The most impactful single addition. Instead of a fixed `choose_strategy()` function that calls `ORDER BY avg_score`, Toby would send a structured prompt to Claude or DeepSeek:

```
You are Toby's Strategy Agent. Here is the performance summary for the last 30 days:

- "educational" personality: avg score 72, 24 samples, declining trend (last 5: 68, 65, 63, 62, 60)
- "provocative" personality: avg score 81, 12 samples, improving trend (last 5: 75, 79, 82, 83, 84)
- "superfoods" topic: avg score 68, saturating (8 posts in last 14 days)
- "sleep" topic: avg score 55, only 3 posts, no conclusion yet

Discovery found: 3 competitors got 500k+ views on "gut microbiome" content this week.

What strategy should Toby use for the next 5 content slots? Explain your reasoning.
```

The LLM response would drive actual decisions. This makes the system capable of reasoning that current code cannot: "The educational personality is declining despite historical strength — this suggests content fatigue. Recommend a 2-week moratorium on educational tone while aggressively testing storytelling."

**2. True Thompson Sampling**

Replace epsilon-greedy with proper Bayesian bandit:

```python
# PLANNED — True Thompson Sampling
# For each option, maintain Beta distribution parameters (alpha, beta)

def thompson_sample(alpha: float, beta: float) -> float:
    return np.random.beta(alpha, beta)  # Sample from posterior

# Selection: for each option, draw a sample from its Beta distribution.
# Pick the option whose sample is highest.
# This naturally handles uncertainty: options with few samples have wide
# distributions, so exploration emerges from math, not a fixed random ratio.
```

This is strictly more principled than epsilon-greedy: exploration automatically decreases for well-understood options and increases for uncertain ones.

**3. Causal Inference**

Current Toby measures correlation: "When we use provocative personality, scores are higher." It cannot ask: "Is that because provocative content is genuinely better, or because we happened to use it for sleep-topic content, which performs well regardless?" Causal reasoning requires controlled experiment design and confound tracking.

**4. Agent-to-Agent Communication**

In a true multi-agent system, each agent operates independently and communicates through a shared message bus:

```
Discovery Agent → "Trending: gut microbiome, 3 competitors, high engagement"
                                    ↓
Strategy Agent  → "Received trend signal. Starting gut microbiome hook experiment.
                   Allocating 4 explore slots over next 48h."
                                    ↓
Content Agent   → "Received experiment parameters. Generating 4 content variants."
                                    ↓
Analysis Agent  → "Scoring results. Will report to Strategy Agent in 48h."
```

In Toby v1.0, the orchestrator calls all of these functions sequentially in a single process. There is no agent-to-agent communication.

### 10.3 The Accurate Positioning

For investor communications, the correct framing is:

> **Today:** Toby is an autonomous content pipeline — it removes the human from the creation-scheduling-publishing loop entirely. The intelligence layer is statistical (epsilon-greedy bandit, composite performance scoring). It works, it learns, and it measurably improves.
>
> **18 months from now:** Toby evolves to AI-native decision-making — an LLM reasoning layer that reads performance data and makes strategy decisions in natural language, true Bayesian exploration, and a multi-agent architecture where specialized agents collaborate.

The current system is a strong foundation precisely because the data layer is correct. `toby_strategy_scores`, `toby_experiments`, and `toby_content_tags` will feed the LLM reasoning layer and Thompson Sampling implementation without any schema changes.

---

## 12. The Path to Multi-Agent Autonomy

This section is a concrete technical roadmap. Each phase includes specific code changes and the capability it unlocks.

### Phase A: Smarter Selection (3-6 months)

**Goal:** Replace epsilon-greedy with algorithms that are statistically principled.

**A1. True Thompson Sampling**

In `learning_engine.py`, replace `_pick_dimension()`:

```python
# Current: epsilon-greedy
def _pick_dimension(..., is_explore: bool) -> str:
    if is_explore:
        return random.choice(options)
    return db.query(best_avg_score).first()

# Target: Thompson Sampling
def _pick_dimension_thompson(...) -> str:
    samples = {}
    for option in options:
        record = get_strategy_score(option)
        # Convert avg_score to Beta distribution parameters
        # alpha = "successes" (scores above threshold, weighted by sample count)
        # beta  = "failures"  (scores below threshold, weighted by sample count)
        alpha = max(1.0, record.sample_count * (record.avg_score / 100))
        beta  = max(1.0, record.sample_count * (1 - record.avg_score / 100))
        samples[option] = np.random.beta(alpha, beta)
    return max(samples, key=samples.get)
```

No schema migration required — computes `alpha` and `beta` from existing `sample_count` and `avg_score` at runtime.

**A2. Adaptive Explore Ratio (Drift Detection)**

Implement `detect_drift()` described in Section 9.2. Runs weekly as part of the Toby tick. Updates `toby_state.explore_ratio` dynamically. New function in `analysis_engine.py` or a dedicated `drift_detector.py`.

### Phase B: Discovery → Strategy Feedback Loop (3-6 months)

**Goal:** Make discovery results actually influence content decisions.

Currently `run_discovery_tick()` stores results but they are never read by `choose_strategy()` or experiment creation logic.

**Required change in `discovery_manager.py`:**

```python
# PLANNED — after discovery scan in discovery_manager.py
def seed_experiments_from_discovery(db, user_id, discovery_results):
    """If discovery finds a trending topic not currently being tested, start an experiment."""
    trending_topics = extract_trending_topics(discovery_results)
    for topic in trending_topics:
        if topic not in current_experiment_options(db, user_id):
            create_experiment(
                db, user_id, content_type="reel",
                dimension="topic", options=[topic, current_best_topic],
            )
            log(f"Discovery seeded experiment: {topic} vs {current_best_topic}")
```

This closes the feedback loop: discover → experiment → score → learn.

### Phase C: Cross-Brand Cold-Start (2-3 months)

**Goal:** New brands benefit from existing brand learnings.

Two changes required:

1. Pass the actual `brand_id` in `_run_analysis_check()` in `orchestrator.py` (currently hardcoded as `None`)
2. Implement cold-start fallback in `choose_strategy()`:

```python
# PLANNED — in choose_strategy()
COLD_START_THRESHOLD = 10  # samples per option

def choose_strategy(db, user_id, brand_id, content_type, ...):
    brand_scores = get_scores(user_id, brand_id, content_type, dimension)

    if len(brand_scores) < COLD_START_THRESHOLD:
        # Not enough brand-specific data — fall back to cross-brand scores
        cross_brand_scores = get_scores(user_id, None, content_type, dimension)
        return _pick_from(cross_brand_scores)

    return _pick_from(brand_scores)
```

No schema change required — `brand_id` column already exists in `toby_strategy_scores`.

### Phase D: LLM Strategy Agent (6-12 months)

**Goal:** Add a reasoning layer that reads performance data and makes strategy decisions in natural language.

This is the step that transforms Toby from automation into AI.

```
StrategyAgent.reason(user_id) → calls Claude/DeepSeek with:
  - Last 30 days of toby_strategy_scores (aggregated)
  - Last 10 experiments and their outcomes
  - Recent discovery results (trending topics, competitor performance)
  - Current phase and explore_ratio
  - Any anomalies (score drops, outlier posts, drift signals)

→ Claude returns structured JSON:
  {
    "recommended_strategy": {...},
    "reasoning": "The provocative personality has shown consistent gains...",
    "new_experiments": [...],
    "explore_ratio_adjustment": 0.25,
    "deprioritize_topics": ["superfoods"]
  }

→ Orchestrator applies recommendations as overrides to epsilon-greedy defaults
```

**Implementation approach:** The LLM layer starts advisory — recommendations are logged and applied with a confidence weight alongside the existing statistical output. This lets us A/B test LLM strategy quality against the epsilon-greedy baseline before fully trusting it.

### Phase E: True Multi-Agent Architecture (12-18 months)

**Goal:** Specialized agents with independent state and async communication.

```
┌─────────────────────────────────────────────────┐
│              MESSAGE BUS (Redis/Postgres)         │
└──┬────────────┬────────────┬──────────────┬──────┘
   │            │            │              │
┌──┴────┐ ┌────┴───┐ ┌──────┴──┐ ┌────────┴────┐
│Content│ │Analysis│ │Discovery│ │  Strategy   │
│ Agent │ │ Agent  │ │  Agent  │ │    Agent    │
│       │ │        │ │         │ │  (LLM core) │
└───────┘ └────────┘ └─────────┘ └─────────────┘
```

Each agent:
- Runs on its own schedule (not a single 5-minute tick)
- Has its own state and memory
- Communicates through typed messages, not function calls
- Can be scaled, restarted, or replaced independently

The current Toby codebase is already architected with boundaries that roughly correspond to the agent boundaries above: `orchestrator.py`, `learning_engine.py`, `discovery_manager.py`, and `analysis_engine.py` become the four agents. The refactor is large but not a rewrite.

**Message exchange example:**

```
Discovery Agent → {type: "TREND_DETECTED", topic: "gut_microbiome",
                   competitor_avg_views: 520000, sample_count: 3}

Strategy Agent  → {type: "START_EXPERIMENT", dimension: "topic",
                   options: ["gut_microbiome", "superfoods"],
                   priority: "high", slots_to_allocate: 4}

Content Agent   → Generates 4 gut_microbiome pieces over next 48h
                → {type: "CONTENT_CREATED", experiment_id: "...", slots: [...]}

Analysis Agent  → After 48h: {type: "SCORES_READY", results: {...}}

Strategy Agent  → Updates posteriors, decides next experiment
```

---

## 13. Deployment & Resilience

### 12.1 Railway Deployment Safety

**Current situation:** The app runs on Railway with Docker. On every deploy, the container restarts. APScheduler runs in-process.

**Why Toby is safe:**

| Concern | How It's Handled |
|---|---|
| Learning data lost on redeploy | All Toby state is in Supabase PostgreSQL — nothing is in-memory |
| Scheduler state lost | `toby_state.last_*_at` timestamps in DB tell Toby where it left off |
| Content buffer gaps | On startup, Toby immediately runs a buffer check and fills any gaps |
| Duplicate content generation | `schedule_id` uniqueness + slot-based scheduling prevents duplicates |
| In-progress generation interrupted | Same as existing `GenerationJob` recovery (already implemented in `startup_event`) |
| Experiments lost mid-test | Experiments are in `toby_experiments` table — survive any restart |

**Startup sequence (addition to existing `startup_event`):**

```python
# After existing startup tasks...
print("🤖 Initializing Toby agents...")
from app.services.toby.orchestrator import start_toby_scheduler

# This registers the 5-minute tick with APScheduler
# On first tick, it checks all users with Toby enabled
# and runs buffer checks, metrics collection, etc.
start_toby_scheduler(app.state.scheduler)
print("✅ Toby scheduler registered (5-minute ticks)")
```

### 12.2 Error Recovery

```
Error during content generation:
  → Retry 3 times with backoff
  → If still failing: log error, mark slot as "failed", try next slot
  → If all retries exhausted: use safe fallback (re-use winning strategy)
  → Never leave a slot empty — buffer manager will catch it on next tick

Error during metrics collection:
  → Skip this post, try again in 6 hours
  → Not critical — Toby works with whatever data it has

Error during discovery:
  → Skip this scan, try again next cycle
  → Not critical — discovery is supplementary intelligence

Error during scoring/analysis:
  → Log error, skip this batch
  → Will re-attempt on next tick when new metrics arrive
```

---

## 14. Scalability & Future-Proofing

### 13.1 Multi-User Scaling

**Current:** Single-user, single-process. Toby tick checks one user.
**Future:** N users, each running their own Toby.

**Scaling strategy:**

1. **Phase 1 (1-10 users):** Single process, iterate over users sequentially. Each Toby tick processes all users. With 5-minute intervals and lightweight DB checks, this handles ~10 users easily.

2. **Phase 2 (10-100 users):** Dedicated background worker process (Celery or similar). Toby ticks become Celery tasks, one per user, distributed across workers. The FastAPI app no longer runs Toby — it just reads state from DB.

3. **Phase 3 (100+ users):** Per-user task queues. Each user's Toby runs on an independent schedule. Priority queues for buffer-critical checks. Horizontal scaling via worker replicas.

### 13.2 Per-User Budget Limits 🔧 Planned

The `toby_state` table already has `daily_budget_cents` and `spent_today_cents` columns. When activated:

- Each DeepSeek API call costs ~X cents (tracked)
- Each image generation costs ~Y cents (tracked)
- Before each generation, Toby checks: `spent_today_cents + estimated_cost <= daily_budget_cents`
- If budget exceeded: pause generation until reset (midnight UTC)
- Admin can set/change budget per user via admin panel

### 13.3 New Platform Support

Toby's architecture is platform-agnostic in the intelligence layer. Adding a new platform (TikTok, YouTube Shorts, LinkedIn) requires:

1. A new publisher implementation (like `SocialPublisher.publish_instagram_reel`)
2. A new metrics collector (like `MetricsCollector.fetch_media_metrics`)
3. Registering the platform in Toby's slot schedule

The learning engine, experiments, and buffer manager work identically regardless of platform.

### 13.4 Feature Flags 🔧 Planned

> **Status: Planned** — Feature flags are not implemented in v1.0. The `TOBY_FEATURES` dict below represents the intended design when feature gating is added.

```python
TOBY_FEATURES = {
    "content_generation": True,    # Can Toby create content?
    "auto_publish": True,          # Can Toby publish automatically?
    "experiments": True,           # Is A/B testing enabled?
    "discovery": True,             # Is competitor/hashtag scanning enabled?
    "cross_brand_learning": False, # Can Toby share intelligence across brands? [Planned]
    "llm_strategy_agent": False,   # LLM reasoning layer [Planned]
}
```

This would let us roll out Toby incrementally and disable any subsystem that's misbehaving without turning off the whole agent.

---

## 15. Implementation Phases

### Phase 1: Foundation ✅ Complete

**Goal:** Toby exists as a data model and can be turned on/off.

- [x] Create all new database tables (migrations)
- [x] Implement `TobyState` model + `toby_state` CRUD
- [x] Create `/api/toby/status`, `/api/toby/enable`, `/api/toby/disable`, `/api/toby/reset` endpoints
- [x] Create frontend Toby page with status bar and ON/OFF toggle
- [x] Add Toby to sidebar navigation (with active indicator)
- [x] Add `created_by` column to `scheduled_reels`
- [x] Register Toby scheduler tick in `main.py` startup (job_id `'toby_orchestrator'`, 5-min interval)

### Phase 2: Buffer Manager + Media Pipeline ✅ Complete

**Goal:** Toby can fill empty slots with content including full media. Slots never fail.

- [x] Implement `BufferManager` — detect empty slots, calculate what's needed (healthy/low/critical)
- [x] Implement `ContentPlanner` — decide topic/personality for each slot via `StrategyChoice`
- [x] Wire planner → `ContentGeneratorV2` → `JobProcessor` → `Scheduler` pipeline
- [x] Full media pipeline integration: Toby creates `GenerationJob` records, runs `regenerate_brand()` for reels and `process_post_brand()` for posts
- [x] `max_plans=1` per tick (orchestrator overrides default of 6)
- [x] Job IDs: `"TOBY-XXXXXX"` format for Toby-created jobs
- [x] Show buffer status on Toby dashboard (TobyBufferStatus component)
- [x] Activity log for generated content (TobyActivityFeed component)

### Phase 3: Metrics & Analysis ✅ Complete

**Goal:** Toby collects performance metrics and scores content.

- [x] Implement `AnalysisEngine` — 48h and 7d scoring with Toby Score composite formula (20/30/40/10 weights)
- [x] Wire metrics collection into Toby tick (leveraging existing `MetricsCollector`)
- [x] Implement `toby_content_tags` — link strategy metadata to scheduled content
- [x] Compute brand baselines (rolling 14-day averages)

### Phase 4: Learning Engine ✅ Complete

**Goal:** Toby learns from performance data and improves strategy selection using epsilon-greedy bandit logic.

- [x] Implement `LearningEngine` — Epsilon-Greedy Bandit for strategy selection (70% exploit / 30% explore)
- [x] Implement `toby_strategy_scores` — running aggregates with Welford's variance
- [x] Implement personality system (5 reel + 5 carousel personalities as system prompt modifiers)
- [x] Implement 70/30 exploit/explore ratio via `choose_strategy()`
- [x] Implement experiment tracking (`toby_experiments`, min_samples=5)
- [x] Show experiments dashboard on frontend (TobyExperiments component)
- [x] Show insights (best topics, hooks, personalities) on frontend (TobyInsights component)

### Phase 5: Discovery Integration ✅ Partially Complete

**Goal:** Toby uses competitor/hashtag intelligence to inspire content.

- [x] Implement `DiscoveryManager` — scheduling layer on top of TrendScout
- [x] Bootstrap mode (20-min scanning for first 7 days, 360-min normal)
- [ ] Feed discovery results into LearningEngine (trending topics → experiment inspiration) — **planned, see Section 11.2**
- [ ] Seasonal/drift detection and adaptive explore ratio — **planned, see Section 11, Phase A2**

> **Note:** Discovery scans run and results are stored in Supabase. The code path from discovery findings to experiment creation does not yet exist — results are visible in the activity feed but do not influence strategy decisions.

### Phase 6: Polish & Production Hardening ⚠️ Partially Complete

**Goal:** Toby is reliable, observable, and production-ready.

- [x] Error handling for content generation failures (slot stays empty, retry on next tick)
- [x] Activity log with action types: `content_generated`, `analysis_completed`, `error`, etc.
- [x] Rate limit protection via `max_plans=1` per tick + existing API retry logic
- [ ] Feature flags for each Toby subsystem — **planned**
- [ ] Admin panel: view all users' Toby states — **planned**
- [ ] Monitoring/alerting for Toby failures — **planned**
- [ ] Per-user budget limits (daily_budget_cents already in schema) — **planned**

### Phase 7: AI Reasoning Layer 🔧 Planned

**Goal:** Elevate Toby from statistical automation to LLM-powered strategy reasoning.

- [ ] Replace epsilon-greedy `_pick_dimension()` with Thompson Sampling (Section 11, Phase A)
- [ ] Implement drift detection and adaptive explore ratio (Section 11, Phase A2)
- [ ] Implement discovery → LearningEngine seeding (Section 11, Phase B)
- [ ] Implement cross-brand cold-start (Section 11, Phase C)
- [ ] Implement `StrategyAgent` — sends performance summaries to Claude/DeepSeek, receives structured strategy recommendations (Section 11, Phase D)
- [ ] A/B test LLM strategy recommendations against epsilon-greedy baseline

### Phase 8: Multi-Agent Architecture 🔧 Planned

**Goal:** Decompose the monolithic orchestrator into specialized, independently deployable agents.

- [ ] Define agent message schema (typed events: TREND_DETECTED, START_EXPERIMENT, SCORES_READY, etc.)
- [ ] Implement message bus (Redis pub/sub or Postgres LISTEN/NOTIFY)
- [ ] Extract Content Agent from `orchestrator._run_buffer_check()`
- [ ] Extract Analysis Agent from `orchestrator._run_analysis_check()`
- [ ] Extract Discovery Agent from `discovery_manager.run_discovery_tick()`
- [ ] Implement Strategy Agent (LLM-powered coordinator)
- [ ] Migrate from APScheduler in-process to per-agent independent schedulers
- [ ] Scale workers per agent independently

---

## 16. Risk Matrix

### 16.1 Critical Bugs — Immediate Fix Required (from Section 10 Audit)

These risks reflect confirmed bugs in the current production codebase, discovered during the Section 10 edge case audit. Each has a specific fix identified.

| Priority | Bug ID | Risk | Impact | Likelihood | Required Fix |
|---|---|---|---|---|---|
| **P0** | F1 | APScheduler `max_instances` not set — concurrent tick execution | **Critical** — duplicate scheduled slots, duplicate IG posts, duplicate experiments | **High** — every Railway deploy or tick overlap | Add `max_instances=1` to `orchestrator.py` APScheduler job + DB unique constraint on `(user_id, scheduled_time, brand)` |
| **P0** | J1 | No pre-flight validation in `enable_toby` — Toby enables with no brands, no credentials, no NicheConfig | **Critical** — infinite wasted generation cycles, zero publishable content | **Medium** — any new user who clicks Enable before setup | Add pre-flight check in `state.py:enable_toby`: validate active brands, Instagram credentials, non-empty topic list |
| **P0** | B7 | `reset_stuck_publishing` does not verify Instagram before re-queuing — server crash can cause duplicate IG post | **Critical** — duplicate published content, spam, brand reputation damage | **Low** — only on server crash mid-publish | Check `extra_data["post_ids"]` before re-publishing; implement idempotency key on IG container creation |
| **P1** | C1 | Instagram access token expiry (60-day TTL) silently kills all metrics collection — no 401 handling, no user notification | **High** — all performance data stops; Toby keeps publishing blind; strategy learning stalls | **High** — every 60 days, every user | Refresh credentials from DB on each `collect_for_brand` call; emit `token_expired` activity event; surface in frontend |
| **P1** | E5 | API-failure posts (0 metrics) score as ~20 — false signal corrupts strategy learning | **High** — epsilon-greedy learns to avoid strategies that actually perform well | **Medium** — any IG API outage or 404 post | Flag zero-metric records as `metrics_unreliable`; exclude from `update_strategy_score()` |
| **P1** | E6 | No experiment timeout — single-option experiment stalls Toby's learning loop indefinitely | **High** — topic dimension with 1 topic creates a permanent stall; Toby never advances | **Medium** — any user with only 1 topic category | Add `EXPERIMENT_TIMEOUT_DAYS = 21`; force-complete stalled experiments with current winner |
| **P1** | J4 | `create_experiment` allows single-option experiments (e.g., NicheConfig with 1 topic) | **High** — single-option experiment can never conclude; permanent stall | **Medium** — any user with sparse NicheConfig | Guard: `if len(options) < 2: skip_experiment(dimension)` in `learning_engine.py:create_experiment` |
| **P2** | G1 | No FK from `toby_content_tags.schedule_id` → orphaned tags inflate experiment counts after post deletion | **Medium** — artificially inflated exposure counts; skewed strategy scores | **High** — every deleted post creates orphans | Add FK with `ON DELETE SET NULL`; filter `NULL schedule_id` in experiment queries |
| **P2** | I1 | Deleted/private competitor accounts in `trend_scout.py` retry forever — no circuit breaker | **Low** — wasted API quota, slower discovery ticks | **Medium** — any competitor that goes private or is deleted | Track consecutive 404/403 failures per account; disable after 3 failures; surface in frontend |
| **P2** | B5 | Buffer manager slot detection uses exact minute match — user-created posts can be missed, slot appears empty | **Medium** — Toby overwrites a user-created post for that slot | **Low** — only when user manually creates content for a Toby slot | Widen buffer detection to ±2 min window OR use `scheduled_by = "toby"` flag for reliable filtering |

---

### 16.2 Operational Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| DeepSeek API outage during buffer fill | High — slots could go empty | Medium | 2-day buffer + safe fallback (re-use winning strategy with modified prompt) |
| AI image generation failure | High — incomplete content | Medium | Retry 3×, then use light-mode variant (no AI background needed) |
| Meta API rate limits during metrics collection | Low — delayed analysis | Medium | Respect rate limits, spread requests over time, skip and retry later |
| Toby generates poor-quality content | Medium — brand reputation | Low | Quality scoring gate exists in `ContentGeneratorV2`; user can review via Observatory |
| Epsilon-greedy converges on local optimum | Medium — content gets stale | Low | 30% exploration ratio always tests new strategies; Thompson Sampling planned (Section 12, Phase A) |
| Database growth from logs/experiments | Low — cost increase | High | Auto-cleanup activity logs older than 30 days; archive completed experiments |
| Railway deploy during active content generation | Medium — interrupted generation | Medium | Job recovery on next tick catches gaps; buffer provides coverage |
| User Content DNA is empty/poorly configured | High — Toby creates off-brand content | Low | Fixed by P0 bug J1 (pre-flight validation before `enable_toby`) |
| Over-fitting to early performance data | Medium — strategies based on small samples | Medium | Minimum sample thresholds per experiment; Thompson Sampling handles this better (roadmap) |
| Multi-brand partial failure (one brand's credentials expire) | Medium — that brand stops but others continue | Medium | Per-brand error isolation; surface per-brand health status in frontend |

---

## 17. Glossary

| Term | Definition |
|---|---|
| **Content DNA** | The user's `NicheConfig` — niche, tone, topics, examples, style. The immutable creative boundaries for Toby. |
| **Toby Tick** | The 5-minute background check loop that determines what action Toby should take next. |
| **Buffer** | Pre-generated content ready to be published when its time slot arrives. Target: 2 days ahead. |
| **Slot** | A specific date + time + brand + content type (reel or post) when content should be published. |
| **Exploit** | Choosing the strategy that has the highest proven average performance score. |
| **Explore** | Choosing a random or new strategy to test whether it might outperform current winners. |
| **Personality** | A system prompt modifier that changes DeepSeek's content generation style. |
| **Experiment** | An A/B test tracking how different options for a specific dimension perform against each other. |
| **Toby Score** | A composite 0-100 metric: 20% raw views + 30% relative views + 40% engagement quality (saves/shares) + 10% follower context. |
| **Phase** | Toby's maturity stage: Bootstrap (collecting data), Learning (running experiments), Optimizing (exploiting winners). |
| **Epsilon-Greedy Bandit** | Toby's current strategy selection algorithm. 70% of the time picks the option with the highest average score (exploit). 30% of the time picks randomly (explore). Simple, effective, and interpretable. |
| **Thompson Sampling** | A Bayesian multi-armed bandit algorithm that maintains Beta probability distributions per option and samples from them for selection. More principled than epsilon-greedy — exploration emerges from statistical uncertainty rather than a fixed random ratio. Planned for Toby Phase 7 (see Section 11, Phase A). |
| **Drift Detection** | Planned mechanism to detect when brand performance shifts significantly (20%+ change in rolling averages) and automatically adjust the explore ratio in response. |
| **LLM Strategy Agent** | A planned component that uses a large language model (Claude or DeepSeek) to reason about performance data in natural language and produce strategy recommendations that override or augment statistical selection. |
| **Game Changer** | A post that scores 4x+ above the brand's rolling average — triggers special analysis to understand what worked. |
| **Safe Fallback** | When API failures prevent normal content generation, Toby re-uses the best-performing strategy with slight prompt modifications to guarantee slot fill. |

---

*Document v2.0 — verified against production source code, February 2026. All implementation status annotations reflect actual code state, not aspirational design.*
