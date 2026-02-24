# Toby — Autonomous AI Content Agent

## Architecture Specification v1.0

**Date:** February 2026  
**Audience:** Investors, Product Team, Engineers, Designers  
**Status:** Partially Implemented — Core architecture is live; some advanced features (cross-brand intelligence, spending limits) are planned

> **Implementation status:** Sections 1-8 reflect the live system. Sections 9-13 include both implemented features and planned enhancements. See inline status notes for specifics.

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
10. [Deployment & Resilience](#10-deployment--resilience)
11. [Scalability & Future-Proofing](#11-scalability--future-proofing)
12. [Implementation Phases](#12-implementation-phases)
13. [Risk Matrix](#13-risk-matrix)
14. [Glossary](#14-glossary)

---

## 1. Executive Summary

Toby is a **per-user autonomous AI agent** that takes over the entire content lifecycle — from ideation to publishing to performance analysis — so the user doesn't have to press a single button.

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
- A **learning engine** (`app/services/toby/learning_engine.py`, 354 lines) that tracks experiments and allocates more resources to winners
- A **content buffer** (`app/services/toby/buffer_manager.py`, 147 lines) that pre-generates 2 days of content to guarantee slots never go empty
- A **personality/angle testing framework** (A/B testing for AI prompts via Thompson Sampling)
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
        → Cross-brand intelligence helps cold-start new brands faster
        → Continuously A/B tests new angles while maximizing winning formulas
        → User can see a clear improvement trend in the Toby dashboard
```

### Toby Dashboard (Frontend)

The Toby page in the sidebar shows:

| Section | What It Shows |
|---|---|
| **Status Bar** | Toby ON/OFF toggle, current phase (bootstrap/learning/optimizing), content buffer health |
| **Activity Feed** | Real-time log of what Toby is doing — "Published reel to @brand", "Analyzing 48h metrics for 5 posts", "Discovered 12 trending reels" |
| **Published Content** | Gallery of everything Toby has published, with performance scores |
| **Experiments** | Active A/B tests — which personalities/angles are being tested, preliminary results |
| **Insights** | Top-performing topics, best hooks, winning personalities, improvement trends |
| **Discovery** | What Toby found from competitor/hashtag scanning, what influenced content decisions |
| **Settings** | Buffer size, slot configuration, reset button, spending (future: per-user limits) |

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
│  │              TOBY ORCHESTRATOR (New)                       │  │
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

### 5.1 New Module: `app/services/toby/` (Implemented)

```
app/services/toby/
├── __init__.py
├── orchestrator.py        (465 lines) # Main loop — the "brain" that coordinates everything
├── content_planner.py     (122 lines) # Decides WHAT to create and WHEN
├── analysis_engine.py     (167 lines) # Evaluates performance, computes scores
├── learning_engine.py     (354 lines) # Thompson Sampling, personality optimization
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
    2. PUBLISH CHECK   — Any due posts? (Handled by existing scheduler, Toby just monitors)
    3. METRICS CHECK   — Any posts older than 48h without metrics? Collect them.
    4. ANALYSIS CHECK   — New metrics available? Re-score and update learnings.
    5. DISCOVERY CHECK  — Time for a discovery scan? Run TrendScout tick.
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
      - choose_strategy() picks 5 dimensions using Thompson Sampling:
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

### 5.4 Analysis Engine

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

### 5.5 Learning Engine — A/B Testing Framework

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

#### Multi-Armed Bandit (Not Pure A/B)

Traditional A/B testing requires statistical significance (hundreds of samples per variant). Social media content doesn't generate enough volume for that. Instead, Toby uses a **Thompson Sampling (Multi-Armed Bandit)** approach:

```
For each dimension (personality, topic, hook, etc.):
  1. Maintain a performance distribution per option
     (e.g., "educational" personality has mean score 72, std 15)
  2. When choosing what to create next:
     - 70% of the time: pick the option with the highest expected score (EXPLOIT)
     - 30% of the time: pick a random option (EXPLORE)
  3. After each post's final score comes in:
     - Update the distribution for the options used in that post
  
This naturally:
  - Converges on the best strategies over time
  - Never stops exploring (catches seasonal shifts, algorithm changes)
  - Works with small sample sizes (doesn't need statistical significance)
```

#### Separate Worlds: Reels vs. Carousels

**Reels** and **carousels** have completely separate:
- Experiment pools
- Performance baselines  
- Winning strategies
- Scoring parameters

A hook that works for a 7-second reel ("You're destroying your gut with THIS food") may not work for a 4-slide educational carousel. Toby never transfers learnings between these two content types.

### 5.6 Buffer Manager

The buffer manager ensures every slot for the next 2 days has content ready.

```
Buffer Health States:
  🟢 HEALTHY    — All slots for next 48h are filled
  🟡 LOW        — 1-3 slots in next 48h are empty
  🔴 CRITICAL   — 4+ slots empty, or less than 24h of content remaining

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

### 5.7 Discovery Manager

Wraps the existing `TrendScout` service with a smart scheduling layer.

**Scanning schedule (actual implementation):**

| Scan Type | Frequency | What It Does |
|---|---|---|
| Bootstrap mode (all scans) | Every 20 minutes | Aggressive scanning during first 7 days to build data |
| Normal mode (own + competitors + hashtags) | Every 6 hours (360 min) | All scans run in sequence per tick |

> **Note:** The initial design proposed separate intervals per scan type (6h/8h/12h), but the implementation uses a single discovery interval: 20 min (bootstrap) or 360 min (normal). In normal mode, `scan_own_accounts()`, `scan_competitors()`, and `scan_hashtags(max=3)` run sequentially in a single discovery tick.

The discovery manager feeds trending content into the learning engine, which may use it to inspire new experiments (e.g., "Competitor X got 500k likes on a 'myth buster' reel about sleep — let's test myth_buster hooks for sleep content").

### 5.8 API Routes: `app/api/toby/` (Implemented)

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

### 6.1 New Sidebar Item

Add a **"Toby"** entry to the sidebar navigation between "Analytics" and "Brands":

```typescript
// In AppLayout.tsx NAV_ITEMS:
{ to: '/toby', icon: Bot, label: 'Toby', end: false },
```

The icon will be `Bot` from `lucide-react` (a robot icon). When Toby is enabled, the icon gets a subtle green pulse animation to indicate it's active.

### 6.2 Page Structure (Implemented)

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

### 6.3 Toby Page — Tab Layout (Implemented)

The page has 4 tabs: **Overview** | **Experiments** | **Insights** | **Settings**

> **Note:** The original design proposed 5 tabs (Activity, Published, Experiments, Insights, Discovery). The implementation consolidated these into 4 tabs: Overview (combines Activity Feed + Live Status + Buffer Status), Experiments, Insights, and Settings.

```
┌──────────────────────────────────────────────────────────────┐
│  🤖 Toby AI Agent                            [● Active]      │
│  ─────────────────────────────────────────────────────────── │
│  Buffer: ████████████░░ 85% (14/16 slots filled)             │
│  Phase: Learning (Day 12)    Next action: Metrics check 3m   │
├──────────────────────────────────────────────────────────────┤
│  [Activity] [Published] [Experiments] [Insights] [Discovery] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  (Tab content rendered here)                                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.4 Tab Details

**Activity Tab** — Reverse-chronological feed of Toby actions:
```
🟢 2m ago    Published carousel to @healthycollege (experiment: storytelling-hook-A)
📊 15m ago   Analyzed 48h metrics for 5 reels — 2 above average, 1 outlier (32k views!)
🔍 1h ago    Discovered 8 trending reels via #healthylifestyle
🎨 2h ago    Generated 3 reels for tomorrow's slots (buffer now 100%)
📈 3h ago    Updated experiment results: "data-driven" personality +12% vs baseline
```

**Published Tab** — Grid/list of content Toby created:
- Thumbnail preview
- Brand badge
- Content type (reel/carousel)
- Performance score + views + engagement
- Which experiment/personality was used
- "Winner" / "Average" / "Underperformer" badge

**Experiments Tab** — Live A/B test dashboard:
```
┌─────────────────────────────────────────────────┐
│ REELS — Personality Test                         │
│ Status: Running (started 5 days ago, 18 samples) │
│                                                  │
│ 📊 educational     ████████████  Score: 72 (8x) │
│ 🔥 provocative     ██████████████ Score: 81 (5x)│
│ 📖 storytelling    ████████     Score: 63 (5x)  │
│                                                  │
│ Current leader: provocative (+12% vs baseline)   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ CAROUSELS — Hook Strategy Test                   │
│ Status: Running (started 3 days ago, 8 samples)  │
│                                                  │
│ ❓ question_hook   ████████████  Score: 68 (3x) │
│ 💥 myth_buster     ██████████     Score: 59 (3x)│
│ 📊 shocking_stat   ████████████  Score: 71 (2x) │
│                                                  │
│ Current leader: shocking_stat (+5% vs baseline)  │
└─────────────────────────────────────────────────┘
```

**Insights Tab** — Aggregated intelligence:
- Best-performing topic categories (bar chart, split by reels/carousels)
- Best hooks / title formats
- Performance trend over time (are we improving?)
- "Game changers" — posts that got 4x+ the brand average
- Per-brand breakdown

**Discovery Tab** — What Toby found externally:
- Trending competitor content (thumbnails + engagement counts)
- Top hashtags by engagement
- Content inspiration feed (what Toby might adapt next)

### 6.5 Sidebar Active Indicator

When Toby is enabled, the sidebar icon shows a **green dot** and a subtle glow:

```tsx
// Toby nav item with active indicator
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

#### `toby_state` — Per-user Toby configuration and state

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
    
    -- Future: spending limits
    daily_budget_cents    INTEGER,                  -- NULL = unlimited
    spent_today_cents     INTEGER DEFAULT 0,
    budget_reset_at       TIMESTAMPTZ,
    
    -- Timestamps
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);
```

#### `toby_experiments` — A/B test definitions and results

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
    
    -- Indexes
    CONSTRAINT uq_toby_exp_active UNIQUE (user_id, content_type, dimension, status)
);

CREATE INDEX idx_toby_exp_user_status ON toby_experiments(user_id, status);
```

#### `toby_strategy_scores` — Performance aggregates per strategy option

```sql
CREATE TABLE toby_strategy_scores (
    id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    brand_id        VARCHAR(50),                 -- NULL = cross-brand
    content_type    VARCHAR(10) NOT NULL,         -- "reel" or "post"
    
    -- What strategy dimension this tracks
    dimension       VARCHAR(30) NOT NULL,         -- "personality", "topic", "hook", etc.
    option_value    VARCHAR(100) NOT NULL,        -- e.g., "educational", "superfoods"
    
    -- Running aggregates (Thompson Sampling parameters)
    sample_count    INTEGER DEFAULT 0,
    total_score     FLOAT DEFAULT 0,
    avg_score       FLOAT DEFAULT 0,
    score_variance  FLOAT DEFAULT 0,
    best_score      FLOAT DEFAULT 0,
    worst_score     FLOAT DEFAULT 100,
    
    -- Recent trend (last 10 scores)
    recent_scores   JSONB DEFAULT '[]',
    
    updated_at      TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT uq_toby_strategy UNIQUE (user_id, brand_id, content_type, dimension, option_value)
);

CREATE INDEX idx_toby_strategy_user ON toby_strategy_scores(user_id, content_type, dimension);
```

#### `toby_activity_log` — Audit trail of all Toby actions

```sql
CREATE TABLE toby_activity_log (
    id          SERIAL PRIMARY KEY,
    user_id     VARCHAR(100) NOT NULL,
    
    -- Action categorization
    action_type VARCHAR(30) NOT NULL,  -- "content_generated", "published", "metrics_collected",
                                       -- "analysis_completed", "discovery_scan", "experiment_started",
                                       -- "experiment_completed", "buffer_filled", "error"
    
    -- Human-readable description
    description TEXT NOT NULL,
    
    -- Structured metadata (varies by action_type)
    -- Note: SQLAlchemy column name is "metadata" (mapped from action_metadata field)
    metadata    JSONB,
    
    -- Severity for filtering
    level       VARCHAR(10) DEFAULT 'info',  -- "info", "success", "warning", "error"
    
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_toby_activity_user_time ON toby_activity_log(user_id, created_at DESC);
CREATE INDEX idx_toby_activity_type ON toby_activity_log(user_id, action_type);
```

#### `toby_content_tags` — Links Toby metadata to scheduled content

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

#### `scheduled_reels` — Add Toby flag

```sql
ALTER TABLE scheduled_reels ADD COLUMN created_by VARCHAR(20) DEFAULT 'user';
-- Values: 'user' (manual), 'toby' (autonomous)
```

This single column lets us distinguish Toby-created content from user-created content everywhere in the UI and analytics.

#### `post_performance` — Already sufficient

The existing `PostPerformance` table already has everything Toby needs:
- `views`, `likes`, `comments`, `saves`, `shares`, `reach`
- `performance_score`, `percentile_rank`
- `topic_bucket`, `keyword_hash`
- `brand`, `content_type`

No schema changes needed — Toby's `analysis_engine` reads directly from this table.

---

## 8. Core Loops

### 8.1 The Toby Tick (Every 5 Minutes)

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
│  4. ANALYSIS CHECK (after metrics)                   │
│     Query: posts with new metrics not yet analyzed    │
│     If found:                                         │
│       → AnalysisEngine.score_and_learn(posts)        │
│       → LearningEngine.update_strategies(scores)     │
│       → Log activity: "Analyzed N posts, updated..."  │
│                                                       │
│  5. DISCOVERY CHECK (every 8-12 hours)               │
│     If in bootstrap phase: every 20 minutes           │
│       → TrendScout.bootstrap_scan_tick()             │
│     If in normal phase: every 8-12 hours              │
│       → DiscoveryManager.scan_tick()                 │
│       → Log activity: "Discovered N trending items"   │
│                                                       │
│  6. PHASE CHECK                                       │
│     If bootstrap and enough data → transition to      │
│     learning phase                                    │
│     If learning and 30+ days → transition to          │
│     optimizing phase                                  │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### 8.2 Content Generation Flow (Toby-initiated)

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

### 8.3 Learning Feedback Loop

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

### 9.1 Personality System

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

### 9.2 Seasonal & Algorithmic Adaptation

Toby's 30% exploration ratio ensures it continuously tests new approaches. But it also has specific mechanisms for detecting shifts:

**Baseline drift detection:**
```python
# Every 7 days, recalculate brand baseline
new_avg = avg(last 14 days of scores)
old_avg = avg(previous 14 days of scores)

if new_avg < old_avg * 0.8:
    # Performance dropped 20%+ → algorithm may have changed
    # Increase explore ratio to 50% for next 7 days
    toby_state.explore_ratio = 0.50
    log("Performance drop detected — increasing exploration")
elif new_avg > old_avg * 1.2:
    # Performance improved 20%+ → current strategy is working
    # Decrease explore ratio to 20% to exploit more
    toby_state.explore_ratio = 0.20
    log("Performance surge — exploiting winning strategies")
```

**Seasonal topic rotation:**
- Toby tracks which topics perform well over time
- If a top topic starts declining (3 consecutive posts below baseline), it deprioritizes it
- A previously deprioritized topic can come back if a new experiment shows it's working again

### 9.3 Cross-Brand Intelligence

When a user has multiple brands (all sharing the same niche, per your requirement):

1. **New brand cold-start:** When Toby starts with a new brand that has no performance history, it borrows the best strategies from other brands of the same user. This avoids wasting time re-testing strategies that already won elsewhere.

2. **Cross-brand insights:** The insights dashboard shows which strategies work differently across brands. "Brand A does better with 'story' personality, Brand B with 'data-driven'" — this is expected behavior (different audiences).

3. **Follower-adjusted comparison:** When comparing cross-brand, Toby uses the relative score (vs. brand baseline), not absolute views. A 2x-above-average post is equally impressive whether the brand has 1k or 100k followers.

---

## 10. Deployment & Resilience

### 10.1 Railway Deployment Safety

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

### 10.2 Error Recovery

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

## 11. Scalability & Future-Proofing

### 11.1 Multi-User Scaling

**Current:** Single-user, single-process. Toby tick checks one user.  
**Future:** N users, each running their own Toby.

**Scaling strategy:**

1. **Phase 1 (1-10 users):** Single process, iterate over users sequentially. Each Toby tick processes all users. With 5-minute intervals and lightweight DB checks, this handles ~10 users easily.

2. **Phase 2 (10-100 users):** Dedicated background worker process (Celery or similar). Toby ticks become Celery tasks, one per user, distributed across workers. The FastAPI app no longer runs Toby — it just reads state from DB.

3. **Phase 3 (100+ users):** Per-user task queues. Each user's Toby runs on an independent schedule. Priority queues for buffer-critical checks. Horizontal scaling via worker replicas.

### 11.2 Per-User Budget Limits (Future)

The `toby_state` table already has `daily_budget_cents` and `spent_today_cents` columns. When activated:

- Each DeepSeek API call costs ~X cents (tracked)
- Each image generation costs ~Y cents (tracked)
- Before each generation, Toby checks: `spent_today_cents + estimated_cost <= daily_budget_cents`
- If budget exceeded: pause generation until reset (midnight UTC)
- Admin can set/change budget per user via admin panel

### 11.3 New Platform Support

Toby's architecture is platform-agnostic in the intelligence layer. Adding a new platform (TikTok, YouTube Shorts, LinkedIn) requires:

1. A new publisher implementation (like `SocialPublisher.publish_instagram_reel`)
2. A new metrics collector (like `MetricsCollector.fetch_media_metrics`)
3. Registering the platform in Toby's slot schedule

The learning engine, experiments, and buffer manager work identically regardless of platform.

### 11.4 Feature Flags

Toby features should be gated behind feature flags from the start:

```python
TOBY_FEATURES = {
    "content_generation": True,    # Can Toby create content?
    "auto_publish": True,          # Can Toby publish automatically?
    "experiments": True,           # Is A/B testing enabled?
    "discovery": True,             # Is competitor/hashtag scanning enabled?
    "cross_brand_learning": True,  # Can Toby share intelligence across brands?
}
```

This lets us roll out Toby incrementally and disable any subsystem that's misbehaving without turning off the whole agent.

---

## 12. Implementation Phases

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

**Goal:** Toby learns from performance data and improves strategy selection.

- [x] Implement `LearningEngine` — Thompson Sampling for strategy selection
- [x] Implement `toby_strategy_scores` — running aggregates with Welford's variance
- [x] Implement personality system (5 reel + 5 carousel personalities as system prompt modifiers)
- [x] Implement 70/30 exploit/explore ratio via `choose_strategy()`
- [x] Implement experiment tracking (`toby_experiments`, min_samples=5)
- [x] Show experiments dashboard on frontend (TobyExperiments component)
- [x] Show insights (best topics, hooks, personalities) on frontend (TobyInsights component)

### Phase 5: Discovery Integration ✅ Complete

**Goal:** Toby uses competitor/hashtag intelligence to inspire content.

- [x] Implement `DiscoveryManager` — scheduling layer on top of TrendScout
- [x] Bootstrap mode (20-min scanning for first 7 days, 360-min normal)
- [ ] Feed discovery results into LearningEngine (trending topics → experiment inspiration) — **planned enhancement**
- [ ] Seasonal/drift detection and adaptive explore ratio — **planned enhancement**

### Phase 6: Polish & Production Hardening — Partially Complete

**Goal:** Toby is reliable, observable, and production-ready.

- [x] Error handling for content generation failures (slot stays empty, retry on next tick)
- [x] Activity log with action types: `content_generated`, `analysis_completed`, `error`, etc.
- [x] Rate limit protection via `max_plans=1` per tick + existing deAPI retry logic
- [ ] Feature flags for each Toby subsystem — **planned**
- [ ] Admin panel: view all users' Toby states — **planned**
- [ ] Monitoring/alerting for Toby failures — **planned**
- [ ] Per-user budget limits (daily_budget_cents already in schema) — **planned**

---

## 13. Risk Matrix

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| DeepSeek API outage during buffer fill | High — slots could go empty | Medium | 2-day buffer + safe fallback (re-use winning strategy with modified prompt) |
| AI image generation failure | High — incomplete content | Medium | Retry 3x, then use light-mode variant (no AI background needed) |
| Meta API rate limits during metrics collection | Low — delayed analysis | Medium | Respect rate limits, spread requests over time, skip and retry later |
| Toby generates poor-quality content | Medium — brand reputation | Low | Quality scoring gate already exists in `ContentGeneratorV2`, plus user can review |
| Learning engine converges on local optimum | Medium — content gets stale | Low | 30% exploration ratio always tests new strategies |
| Database growth from logs/experiments | Low — cost increase | High | Auto-cleanup older than 30 days for activity logs, archive old experiments |
| Railway deploy during active generation | Medium — interrupted generation | Medium | Existing job recovery handles this; buffer manager catches gaps on next tick |
| User Content DNA is empty/poorly configured | High — Toby creates off-brand content | Low | Validation check before enabling Toby: NicheConfig must have core fields filled |

---

## 14. Glossary

| Term | Definition |
|---|---|
| **Content DNA** | The user's `NicheConfig` — niche, tone, topics, examples, style. The immutable creative boundaries for Toby. |
| **Toby Tick** | The 5-minute background check loop that determines what action Toby should take next. |
| **Buffer** | Pre-generated content ready to be published when its time slot arrives. Target: 2 days ahead. |
| **Slot** | A specific date + time + brand + content type (reel or post) when content should be published. |
| **Exploit** | Choosing the strategy that has the highest proven performance. |
| **Explore** | Choosing a random or new strategy to test whether it might outperform current winners. |
| **Personality** | A system prompt modifier that changes DeepSeek's content generation style. |
| **Experiment** | An A/B test tracking how different options for a specific dimension perform. |
| **Toby Score** | A composite 0-100 metric: 20% raw views + 30% relative views + 40% engagement quality (saves/shares) + 10% follower context. |
| **Phase** | Toby's maturity stage: Bootstrap (collecting data), Learning (running experiments), Optimizing (exploiting winners). |
| **Game Changer** | A post that scores 4x+ above the brand's rolling average — triggers special analysis to understand what worked. |
| **Safe Fallback** | When API failures prevent normal content generation, Toby re-uses the best-performing strategy with slight modifications. |
| **Thompson Sampling** | A multi-armed bandit algorithm that balances exploitation and exploration without needing large sample sizes. |

---

*Document authored by the engineering team. For questions, ping the #toby-architecture channel.*
