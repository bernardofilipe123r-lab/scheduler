# Current vs Target Architecture Analysis

> Generated: 2026-02-15
> Scope: Complete analysis of the AI orchestration system

---

## What EXISTS Now

### File Inventory

| # | File Path | Exists | Key Contents |
|---|-----------|--------|--------------|
| 1 | `app/services/maestro/maestro.py` | ✅ | `MaestroDaemon` class (L44-L362), singleton `get_maestro()` (L683), `start_maestro()` (L707), `maestro_log()` (L694) |
| 2 | `app/services/maestro/cycles.py` | ✅ | `CyclesMixin` — observe (L27), scout (L68), bootstrap (L120), feedback (L253), evolution (L362), diagnostics (L422) |
| 3 | `app/services/maestro/healing.py` | ✅ | `HealingMixin` — timeout detection (L18), failure diagnosis (L168), auto-retry (L229), population guard (L260) |
| 4 | `app/services/maestro/scheduler_logic.py` | ✅ | `auto_schedule_job()` (L5), `schedule_all_ready_reels()` (L97) |
| 5 | `app/services/maestro/proposals.py` | ✅ | `ProposalsMixin` — `_auto_accept_and_process()` (L12), examiner quality gate integration, `_process_and_schedule_job()` (L202) |
| 6 | `app/services/maestro/state.py` | ✅ | Constants, `AgentState` (L133), `MaestroState` (L152), `_db_get/_db_set` (L96-L115), `is_paused/set_paused` (L118-L130), brand handles, config |
| 7 | `app/services/maestro/examiner.py` | ✅ | `examine_proposal()` (L99) — DeepSeek quality gate, 3-dimension scoring, red flag detection |
| 8 | `app/services/agents/generic_agent.py` | ✅ | `GenericAgent` class (L240-L507), `get_all_active_agents()` (L510), `seed_builtin_agents()` (L546), `_ensure_agents_for_all_brands()` (L590), `create_agent_for_brand()` (L660) |
| 9 | `app/services/agents/toby_daemon.py` | ✅ | **LEGACY STUB** — only `toby_log()` function (7 lines), redirects to `maestro_log()` |
| 10 | `app/services/agents/evolution_engine.py` | ✅ | `FeedbackEngine` (L74), `AdaptationEngine` (L306), `SelectionEngine` (L477), `get_agent_lessons()` (L464), `pick_agent_name()` (L51) |
| 11 | `app/services/agents/diagnostics_engine.py` | ✅ | `DiagnosticsEngine` — 10 checks: db, agents, DNA, pipeline, scheduler, evolution, API, publishing, cycle freshness, data consistency |
| 12 | `app/services/analytics/trend_scout.py` | ✅ | Not fully read — referenced by scout cycle |
| 13 | `app/services/analytics/metrics_collector.py` | ✅ | Not fully read — referenced by observe cycle |
| 14 | `app/models/` | ✅ Directory | Separate files: `agents.py`, `analytics.py`, `auth.py`, `base.py`, `brands.py`, `config.py`, `jobs.py`, `logs.py`, `scheduling.py`, `youtube.py` |
| 15 | `app/api/agents/routes.py` | ✅ | Full CRUD for agents + evolution endpoints + diagnostics endpoints |
| 16 | `app/api/maestro/routes.py` | ✅ | Status, pause/resume, trigger-burst, proposals CRUD, healing, examiner stats |
| 17 | `app/main.py` | ✅ | Router registration, startup/shutdown events, APScheduler for publishing + analytics |
| 18 | `app/db_connection.py` | ✅ | SQLAlchemy engine, `SessionLocal`, `init_db()`, `get_db()`, `get_db_session()` |
| 19 | `app/api/agents/toby_routes.py` | ✅ | **LEGACY** — backward-compat Toby-specific endpoints, mostly duplicates Maestro routes |
| 20 | `app/services/agents/__init__.py` | ✅ | Empty |
| 21 | `app/services/maestro/__init__.py` | ✅ | Not read |

**Files that do NOT exist:**
- ❌ `app/services/maestro.py` — replaced by `app/services/maestro/` package
- ❌ `app/services/lexi_agent.py` — replaced by `GenericAgent`
- ❌ `app/services/toby_agent.py` — replaced by `GenericAgent`
- ❌ `app/services/adaptation_engine.py` — lives inside `evolution_engine.py`
- ❌ `app/models.py` — replaced by `app/models/` package

---

### Learning Cycles (Current)

| Cycle | ID | Interval | What It Does | Runs When Paused? |
|-------|----|----------|-------------|-------------------|
| **CHECK** | `maestro_check` | 10 min | Checks if daily burst should run (noon Lisbon). Schedules ready reels. | ❌ (skips burst, but still schedules ready reels) |
| **OBSERVE** | `maestro_observe` | 180 min (3h) | Calls `MetricsCollector.collect_all_brands(days_back=14)` — polls IG Graph API for post metrics | ✅ |
| **SCOUT** | `maestro_scout` | 240 min (4h) | Calls `TrendScout` — scans hashtags, competitors, own accounts for reels + posts | ✅ |
| **FEEDBACK** | `maestro_feedback` | 360 min (6h) | `FeedbackEngine.run()` — attributes 48-72h published content back to agents. `AdaptationEngine.adapt()` — mutates DNA based on results | ✅ |
| **HEALING** | `maestro_healing` | 15 min | Timeout detection (>30min stuck), failure diagnosis, auto-retry (max 2), population guard (agents == brands) | ✅ |
| **EVOLUTION** | `maestro_evolution` | Weekly (Sun 2AM Lisbon) | `SelectionEngine.run_weekly_selection()` — rank agents, retire bottom 20% if below threshold for 2+ weeks, spawn replacements from gene pool | ✅ |
| **DIAGNOSTICS** | `maestro_diagnostics` | 240 min (4h) | 10 self-test checks, stores results in `system_diagnostics` table | ✅ |
| **BOOTSTRAP** | `maestro_bootstrap` | 20 min | Cold-start research: 1 own account + 1 competitor + 1 hashtag per tick. Auto-disables when mature (50+ own entries & 150+ total, or 14 days) | ✅ |

**Scheduling technology:** APScheduler `BackgroundScheduler` with `IntervalTrigger` and `CronTrigger`.

**Startup stagger:**
- CHECK: +30s
- OBSERVE: +90s
- SCOUT: +150s
- FEEDBACK: +330s
- HEALING: +210s
- BOOTSTRAP: +75s
- DIAGNOSTICS: +90s

**Daily Burst Formula:**
- `6 reels/brand + 2 posts/brand × N brands = total proposals/day`
- With 5 brands: 30 reels + 10 posts = 40 proposals/day
- Proposals distributed round-robin across N agents
- Each proposal → Examiner quality gate → Accept/Reject → Job → Auto-schedule

---

### Database Schema (Current)

#### `ai_agents` — AIAgent (agents.py L8)
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | auto |
| user_id | String(100) | indexed |
| agent_id | String(50) | unique, indexed |
| display_name | String(100) | |
| personality | Text | system prompt personality |
| temperature | Float | default 0.85 |
| variant | String(20) | dark/light/auto |
| proposal_prefix | String(20) | e.g. "TOBY" |
| strategy_names | Text (JSON) | list of strategy names |
| strategy_weights | Text (JSON) | weighted dict |
| risk_tolerance | String(20) | low/medium/high |
| proposals_per_brand | Integer | default 3 |
| content_types | Text (JSON) | ["reel"] or ["reel","post"] |
| active | Boolean | |
| is_builtin | Boolean | protects Toby/Lexi from deletion |
| created_for_brand | String(100) | nullable |
| survival_score | Float | 0-100 |
| lifetime_views | Integer | |
| lifetime_proposals | Integer | |
| lifetime_accepted | Integer | |
| generation | Integer | evolution gen |
| last_mutation_at | DateTime | |
| mutation_count | Integer | |
| parent_agent_id | String(50) | if spawned from gene pool |
| created_at | DateTime | |
| updated_at | DateTime | |

#### `agent_performance` — AgentPerformance (agents.py L87)
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| user_id | String(100) | indexed |
| agent_id | String(50) | indexed |
| period | String(20) | "feedback"/"daily"/"weekly" |
| total_proposals | Integer | |
| accepted_proposals | Integer | |
| published_count | Integer | |
| total_views | Integer | |
| avg_views | Float | |
| total_likes | Integer | |
| total_comments | Integer | |
| avg_engagement_rate | Float | |
| strategy_breakdown | JSON | per-strategy metrics |
| best_strategy | String(30) | |
| worst_strategy | String(30) | |
| avg_examiner_score | Float | |
| survival_score | Float | |
| created_at | DateTime | indexed |

#### `agent_learning` — AgentLearning (agents.py L137)
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| user_id | String(100) | indexed |
| agent_id | String(50) | indexed |
| mutation_type | String(30) | weight_shift/temperature/death/spawn |
| description | Text | human-readable |
| old_value | JSON | before snapshot |
| new_value | JSON | after snapshot |
| trigger | String(30) | feedback/weekly_evolution/manual |
| confidence | Float | 0-1 |
| survival_score_at | Float | |
| created_at | DateTime | indexed |

#### `gene_pool` — GenePool (agents.py L180)
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| user_id | String(100) | indexed |
| source_agent_id | String(50) | indexed |
| source_agent_name | String(100) | |
| personality | Text | |
| temperature | Float | |
| variant | String(20) | |
| strategy_names | Text (JSON) | |
| strategy_weights | Text (JSON) | |
| risk_tolerance | String(20) | |
| survival_score | Float | |
| lifetime_views | Integer | |
| generation | Integer | |
| reason | String(30) | retirement/top_performer/manual |
| times_inherited | Integer | |
| created_at | DateTime | indexed |

#### `toby_proposals` — TobyProposal (agents.py L234)
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| user_id | String(100) | indexed |
| proposal_id | String(20) | unique, indexed |
| status | String(20) | pending/accepted/rejected/expired |
| agent_name | String(20) | indexed |
| content_type | String(10) | reel/post |
| brand | String(50) | indexed |
| variant | String(10) | dark/light |
| strategy | String(20) | |
| reasoning | Text | |
| title | Text | |
| content_lines | JSON | reel text lines |
| slide_texts | JSON | post carousel slides |
| image_prompt | Text | |
| caption | Text | |
| topic_bucket | String(50) | |
| source_type | String(30) | |
| source_ig_media_id | String(100) | |
| source_title | Text | |
| source_performance_score | Float | |
| source_account | String(100) | |
| quality_score | Float | |
| examiner_score | Float | weighted composite 0-10 |
| examiner_avatar_fit | Float | 0-10 |
| examiner_content_quality | Float | 0-10 |
| examiner_engagement | Float | 0-10 |
| examiner_verdict | String(20) | accept/reject |
| examiner_reason | Text | |
| examiner_red_flags | JSON | |
| reviewed_at | DateTime | |
| reviewer_notes | Text | |
| accepted_job_id | String(50) | |
| created_at | DateTime | indexed |

#### `generation_jobs` — GenerationJob (jobs.py L7)
| Column | Type | Notes |
|--------|------|-------|
| job_id | String(20) PK | "GEN-001234" |
| user_id | String(100) | indexed, stores proposal_id for Maestro-created jobs |
| status | String(20) | pending/generating/completed/failed |
| title | String(500) | |
| content_lines | JSON | |
| variant | String(10) | light/dark/post |
| ai_prompt | Text | |
| cta_type | String(50) | |
| brands | JSON | list |
| platforms | JSON | |
| fixed_title | Boolean | |
| brand_outputs | JSON | per-brand generation results |
| ai_background_path | String(500) | |
| current_step | String(100) | |
| progress_percent | Integer | |
| created_at | DateTime | indexed |
| started_at | DateTime | |
| completed_at | DateTime | |
| error_message | Text | |

#### `scheduled_reels` — ScheduledReel (scheduling.py L7)
| Column | Type | Notes |
|--------|------|-------|
| schedule_id | String(36) PK | |
| user_id | String(100) | indexed |
| user_name | String(255) | |
| reel_id | String(36) | indexed |
| caption | Text | |
| scheduled_time | DateTime | indexed |
| created_at | DateTime | |
| status | String(20) | scheduled/published/failed |
| published_at | DateTime | |
| publish_error | Text | |
| extra_data | JSON | platforms, video_path, thumbnail_path, etc. |

#### `brands` — Brand (brands.py L7)
| Column | Type | Notes |
|--------|------|-------|
| id | String(50) PK | lowercase identifier |
| user_id | String(100) | indexed |
| display_name | String(100) | |
| short_name | String(10) | logo fallback |
| instagram_handle | String(100) | |
| facebook_page_name | String(100) | |
| youtube_channel_name | String(100) | |
| schedule_offset | Integer | 0-23 |
| posts_per_day | Integer | default 6 |
| baseline_for_content | Boolean | |
| colors | JSON | full color config |
| instagram_access_token | Text | |
| instagram_business_account_id | String(100) | |
| facebook_page_id | String(100) | |
| facebook_access_token | Text | |
| meta_access_token | Text | |
| logo_path | String(255) | |
| active | Boolean | |
| created_at | DateTime | |
| updated_at | DateTime | |

#### `user_profiles` — UserProfile (auth.py)
| Column | Type | Notes |
|--------|------|-------|
| user_id | String(100) PK | |
| user_name | String(255) | |
| email | String(255) | unique, indexed |
| instagram_business_account_id | String(255) | |
| instagram_access_token | Text | |
| facebook_page_id | String(255) | |
| facebook_access_token | Text | |
| meta_access_token | Text | |
| active | Boolean | |
| created_at | DateTime | |
| updated_at | DateTime | |

#### `brand_analytics` — BrandAnalytics (analytics.py)
Composite PK: brand + platform. Stores followers, views, likes per brand per platform.

#### `analytics_refresh_log` — AnalyticsRefreshLog (analytics.py)
Rate limiting for analytics refresh (3 per hour).

#### `analytics_snapshots` — AnalyticsSnapshot (analytics.py)
Historical snapshots for trend graphs.

#### `content_history` — ContentHistory (analytics.py)
Content fingerprinting, topic rotation, duplicate detection. Keyword hash via SHA-256.

#### `post_performance` — PostPerformance (analytics.py)
Per-post Instagram metrics (views, likes, comments, saves, shares, reach, engagement_rate, performance_score).

#### `trending_content` — TrendingContent (analytics.py)
External viral content found via IG Hashtag Search / Business Discovery. Used for "trending" strategy.

#### `youtube_channels` — YouTubeChannel (youtube.py)
YouTube OAuth refresh tokens per brand.

#### `maestro_config` — MaestroConfig (config.py)
Key-value store for Maestro persistent state (is_paused, last_daily_run, bootstrap_complete, etc.).

#### `app_settings` — AppSettings (config.py)
Application-wide settings configurable via UI.

#### `app_logs` — LogEntry (logs.py)
Persistent log entries for debugging.

#### `system_diagnostics` — SystemDiagnostic (logs.py)
Stores diagnostic run results.

**Total: 17 database tables**

---

### Agent Knowledge Flow (Current)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DAILY BURST (noon Lisbon)                     │
│                                                                      │
│  1. Load active agents from DB (GenericAgent instances)              │
│  2. Load brands from DB                                              │
│  3. For each brand × each agent:                                     │
│     a. _gather_intelligence():                                       │
│        - MetricsCollector → top/underperformers, performance summary │
│        - MetricsCollector → cross-brand top performers               │
│        - TrendScout → trending content (hashtags, competitors)       │
│        - TrendScout → own account top performers                     │
│        - EvolutionEngine → agent lessons (recent mutations)          │
│        - ContentTracker → recent titles, cooldown topics, brand      │
│          avoidance prompt                                            │
│     b. _plan_strategies(): weighted allocation with data adjustments │
│     c. _generate_proposal(): DeepSeek API call per proposal         │
│     d. Examiner quality gate (DeepSeek scoring, 6.0 threshold)      │
│     e. Accept → create GenerationJob → process → auto-schedule      │
│     f. Reject → regenerate replacement (max 1 retry)                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     FEEDBACK LOOP (every 6h)                         │
│                                                                      │
│  FeedbackEngine:                                                     │
│   - Query published items in 48-72h window                           │
│   - Trace: ScheduledReel → GenerationJob → TobyProposal → agent_id  │
│   - Calculate per-agent: views, engagement, consistency              │
│   - Survival score = views(40%) + engagement(30%) +                  │
│     consistency(20%) + examiner_avg(10%)                             │
│   - Save AgentPerformance snapshot                                   │
│                                                                      │
│  AdaptationEngine:                                                   │
│   - If ≥3 published posts with data:                                 │
│     - Weight shift: best_strategy +5%, worst_strategy -5%            │
│       (only if best is 50%+ better than worst, confidence ≥70%)      │
│     - Temperature: survival>60 → decrease (exploit),                 │
│       survival<30 → increase (explore)                               │
│   - Log to AgentLearning table                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                  WEEKLY EVOLUTION (Sunday 2AM)                        │
│                                                                      │
│  SelectionEngine:                                                    │
│   - Rank all agents by survival_score                                │
│   - Top 40%: "thriving" → DNA archived to gene_pool                 │
│   - Middle 40%: "surviving" → no action                              │
│   - Bottom 20%: "struggling" → eligible for death if:                │
│     - survival < 30 for 2+ consecutive weeks                         │
│     - Not builtin (Toby/Lexi protected)                              │
│     - System has > 2 active agents                                   │
│     - Agent has ≥4 feedback cycles                                   │
│   - Death: archive DNA → deactivate → spawn replacement              │
│   - Birth: 80% inherit from gene pool, 20% random DNA               │
│   - Refresh agent cache                                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Knowledge sharing between agents:**
- Agents do NOT directly communicate with each other
- All agents read from the SAME intelligence sources:
  - `post_performance` table (via MetricsCollector)
  - `trending_content` table (via TrendScout)
  - `content_history` table (via ContentTracker — prevents duplicates)
- Cross-brand intelligence: all agents see top performers across ALL brands
- Agent lessons: each agent's own mutation history is injected into its prompts
- Gene pool: dead agents' DNA can be inherited by new agents (crossover)

---

### API Endpoints (Current)

#### Maestro Routes (`/api/maestro`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/maestro/status` | Full orchestrator status with proposal stats |
| POST | `/api/maestro/pause` | Pause daily burst generation |
| POST | `/api/maestro/resume` | Resume + trigger burst if needed |
| POST | `/api/maestro/trigger-burst` | Smart burst — generates only remaining proposals |
| GET | `/api/maestro/feedback` | Latest agent performance feedback |
| POST | `/api/maestro/reset-daily-run` | Reset daily limit to allow re-trigger |
| GET | `/api/maestro/proposals` | List proposals (filter: status, agent, content_type) |
| GET | `/api/maestro/proposals/{id}` | Get single proposal |
| POST | `/api/maestro/proposals/{id}/accept` | Accept → create job → process → schedule |
| POST | `/api/maestro/proposals/{id}/reject` | Reject with optional notes |
| DELETE | `/api/maestro/proposals/clear` | Delete ALL proposals |
| GET | `/api/maestro/stats` | Per-agent and global stats |
| GET | `/api/maestro/insights` | Performance insights |
| GET | `/api/maestro/trending` | Trending content |
| POST | `/api/maestro/optimize-now` | All agents × 5 reels + 5 posts |
| GET | `/api/maestro/healing` | Healing status + failed jobs |
| POST | `/api/maestro/trigger-healing` | Force healing cycle |
| POST | `/api/maestro/retry-job/{job_id}` | Retry specific failed job |
| GET | `/api/maestro/examiner/stats` | Examiner quality gate statistics |
| GET | `/api/maestro/examiner/rejected` | Recently rejected proposals |

#### Agent Routes (`/api/agents`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents` | List all agents with tier + 7-day stats |
| GET | `/api/agents/{id}` | Get single agent |
| POST | `/api/agents` | Create new agent |
| PUT | `/api/agents/{id}` | Update agent config |
| DELETE | `/api/agents/{id}` | Deactivate (not delete) |
| POST | `/api/agents/seed` | Seed Toby + Lexi |
| POST | `/api/agents/refresh` | Refresh cache |
| GET | `/api/agents/{id}/performance` | Survival score history |
| GET | `/api/agents/{id}/learnings` | Mutation/learning log |
| POST | `/api/agents/{id}/mutate` | Force DNA re-roll |
| POST | `/api/agents/{id}/clone` | Clone agent DNA |
| POST | `/api/agents/{id}/retire` | Manual retirement |
| GET | `/api/agents/gene-pool/entries` | Browse archived DNA |
| GET | `/api/agents/evolution-events/timeline` | Deaths/births/mutations feed |
| GET | `/api/agents/diagnostics/latest` | Latest diagnostics report |
| GET | `/api/agents/diagnostics/history` | Historical diagnostics |
| POST | `/api/agents/diagnostics/run` | Force diagnostics |

#### Legacy Toby Routes (`/api/toby`) — BACKWARD COMPAT
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/toby/status` | Legacy status (returns "daemon is legacy") |
| POST | `/api/toby/pause` | No-op |
| POST | `/api/toby/resume` | No-op |
| GET | `/api/toby/proposals` | List proposals (duplicates Maestro) |
| GET | `/api/toby/proposals/{id}` | Get proposal (duplicates Maestro) |
| POST | `/api/toby/proposals/{id}/accept` | Accept (simpler version — no auto-schedule) |
| POST | `/api/toby/proposals/{id}/reject` | Reject (duplicates Maestro) |
| GET | `/api/toby/stats` | Stats (hardcodes "toby"/"lexi" only) |
| GET | `/api/toby/insights` | Same as `/api/maestro/insights` |
| GET | `/api/toby/trending` | Same as `/api/maestro/trending` |

---

### Dead Code / References to Delete

1. **`app/services/agents/toby_daemon.py`** — Entire file is a legacy stub. Only contains `toby_log()` which redirects to `maestro_log()`. Can be deleted if all callers are updated.

2. **`app/api/agents/toby_routes.py`** — Legacy backward-compat routes. Most functionality duplicated by `/api/maestro` and `/api/agents`. The `POST /api/toby/proposals/{id}/accept` endpoint does NOT auto-schedule (unlike the Maestro version), creating inconsistent behavior.

3. **Comment references to deleted files:**
   - `app/services/maestro/maestro.py` L699: _"Import this in toby_agent.py, lexi_agent.py..."_ — these files don't exist
   - `app/services/agents/generic_agent.py` L6: _"replaces TobyAgent and LexiAgent classes"_ — explanatory, not harmful
   - `app/services/agents/generic_agent.py` L273: _"same interface as TobyAgent.run()"_ — comment-only

4. **`app/api/maestro/routes.py` `/stats` endpoint** (L411): Hardcodes `for name in ["toby", "lexi"]` instead of querying all active agents dynamically. Won't show stats for auto-spawned agents.

5. **`app/api/maestro/routes.py` `/status` endpoint** (L62-L65): Includes `for fallback in ["toby", "lexi"]` as backward compat — always adds toby/lexi to stats even if inactive.

6. **`app/main.py` routes registration:**
   - L15: `from app.api.agents.toby_routes import router as toby_router`
   - L97: `app.include_router(toby_router)  # Toby AI agent (Phase 3) — backward compat`
   - L98: `app.include_router(ai_logs_router)  # AI logs at /ai-logs, /toby-logs, /lexi-logs, /maestro-logs, /ai-about`
   - These keep legacy toby/lexi-specific log pages alive

7. **`MaestroState._init_agent_states()`** (state.py L172): Has fallback `for name in ["toby", "lexi"]` — always creates AgentState for toby+lexi even if they don't exist in DB.

---

### Existing Patterns

#### Rate Limiting / API Call Tracking
- **DeepSeek API:** No explicit rate limiting. Each proposal = 1 API call. Examiner = 1 API call per proposal. With 40 proposals/day + 40 examiner calls = ~80 DeepSeek calls/day.
- **Meta/Instagram API:** Bootstrap cycle is rate-aware: 4 calls / 20 min = 12/hr (under Meta's 200/hr). Regular scout cycle: ~10-15 calls per 4h run. Metrics collector: polls post insights for all brands every 3h.
- **Job concurrency:** `_job_semaphore = threading.Semaphore(3)` — max 3 concurrent FFmpeg processes. Stagger delay: 8 seconds between job launches.
- **Analytics refresh:** Rate limited to 3 refreshes per hour via `AnalyticsRefreshLog` table.

#### Multi-User Architecture
- All major operations accept `user_id` parameter
- Daily burst iterates over all active `UserProfile` records
- Brands, agents, proposals all have `user_id` column
- Falls back to unscoped operation if no users exist (backward compat)

#### Error Handling
- Examiner auto-passes proposals if DeepSeek API fails (doesn't block pipeline)
- Healing cycle auto-retries failed jobs (max 2 retries)
- Population guard ensures agents == brands every 15 minutes
- Diagnostics stores results in DB for dashboard

---

### Current Limitations

1. **No inter-agent communication.** Agents can't share insights directly. They all read from the same DB tables but don't have a "conversation" mechanism or shared memory beyond post_performance and trending_content.

2. **Duplicate DeepSeek calls for generation + examination.** Every proposal requires 2 API calls (generate + examine). With 40 proposals/day that's 80 API calls. The examiner could potentially be integrated into the generation prompt.

3. **No API call budget tracking.** There's no table or counter tracking total DeepSeek/Meta API calls per day/hour. Rate limiting is implicit (cycle intervals) rather than explicit (call counting).

4. **Legacy toby_routes.py creates inconsistent behavior.** The `/api/toby/proposals/{id}/accept` endpoint does NOT auto-schedule jobs, unlike the Maestro version. If the frontend uses the wrong endpoint, content won't publish.

5. **Hardcoded "toby"/"lexi" fallbacks scattered across codebase.** State initialization, stats endpoints, and agent states all have hardcoded toby/lexi references instead of being fully dynamic.

6. **Content history deduplication is brand-level only.** `is_duplicate_for_brand()` checks per-brand, but cross-brand deduplication (same title used for different brands) is not explicitly prevented beyond the `content_history.keyword_hash`.

7. **No persistent Maestro activity log.** `MaestroState.activity_log` is in-memory (max 500 entries), lost on every Railway redeploy. Only diagnostics and learning mutations are persisted to DB.

8. **Survival score normalization.** The survival score formula caps views at 100K for "perfect" score, which may not be calibrated for the actual account sizes. Small accounts could never reach high view scores.

9. **Thread-based job processing.** Jobs are processed in daemon threads (`threading.Thread`). On Railway, container restarts kill all in-progress threads. There's no job resumption mechanism — stuck jobs get caught by the healing cycle 15 min later.

10. **No scheduled downtime or maintenance window.** All cycles run continuously. Evolution runs at 2 AM Sunday but the system can't gracefully drain in-progress jobs before evolution changes agent DNA.

11. **`user_id` on agent models is set to empty string `""` for unscoped agents.** This creates ambiguity — an empty string is not null, making user-scoped queries potentially match unscoped agents.

12. **No YouTube metrics collection.** The metrics collector only handles Instagram. YouTube analytics are not tracked, so YouTube performance doesn't influence agent evolution.

13. **Publishing check runs every 60 seconds via APScheduler in main.py**, separate from Maestro's APScheduler. Two independent schedulers running in the same process.

14. **Single-process architecture.** All background cycles (Maestro, publishing, analytics refresh) run in the same FastAPI process. Resource-intensive operations (FFmpeg video generation) compete with API request handling.

15. **Gene pool has no expiration.** Old DNA entries accumulate forever. There's no pruning of low-scoring or ancient gene pool entries.

16. **Examiner scoring weights are global constants** (not per-brand). Since all brands share the same niche, this works now but won't scale to different niches.
