# Reels Automation Platform — AI Agent Instructions

## Project Overview

**Multi-tenant** autonomous content engine that generates and publishes social media Reels and Posts for multiple health/wellness brands. Each user has their own isolated set of brands, AI agents, jobs, schedules, and proposals — all scoped by `user_id` (Supabase UUID). **Maestro** (singleton daemon with per-user state) orchestrates per-user AI agents that propose content → examiner quality-gates it → content pipeline generates media → scheduler assigns time slots → publisher pushes to Instagram, Facebook, YouTube.

**Stack:** FastAPI 0.115 + PostgreSQL (Supabase-hosted) + SQLAlchemy 2.0 + React 18 + TypeScript + Vite + TailwindCSS + FFmpeg + Pillow + DeepSeek AI + deAPI (image gen) + Meta Graph API v19.0 + YouTube Data API v3

**Deployed on Railway** via Docker (`python:3.11-slim` + Node 20 for frontend build). Frontend is built at Docker build time into `/dist` and served as static files by FastAPI.

---

## ⚠️ ORCHESTRATOR RULES (CRITICAL)

If `runSubagent` is enabled:
1. **NEVER read/edit files yourself** — spawn subagents
2. Research subagent → creates spec in `docs/SubAgent docs/` → Implementation subagent reads spec
3. Use `runSubagent(description, prompt)` — omit `agentName` param

---

## Architecture & Data Flow

### End-to-End Pipeline

```
Maestro Daily Burst (12PM Lisbon)
  │
  ├── For each user → For each agent × brand:
  │     GenericAgent.generate_proposals() → 6 reels + 2 posts per brand
  │     │
  │     └── Examiner quality gate (DeepSeek, score ≥6.0 to accept)
  │           │
  │           └── Auto-accept → Create GenerationJob(s)
  │
  ├── JobProcessor.process_job() [threaded, 1 thread per brand, 600s timeout]
  │     │
  │     ├── REELS: ContentDifferentiator (1 DeepSeek call for ALL brands)
  │     │     → ImageGenerator.generate_thumbnail() → PNG 1080×1920
  │     │     → ImageGenerator.generate_reel_image() → PNG 1080×1920
  │     │     → VideoGenerator.generate_reel_video() → MP4 (FFmpeg, 7-8s, random music)
  │     │     → CaptionGenerator + YT thumbnail
  │     │
  │     └── POSTS: ContentGenerator.generate_post_titles_batch() (1 DeepSeek call)
  │           → AIBackgroundGenerator.generate_post_background() (deAPI)
  │           → Carousel compositing happens at SCHEDULING time, not generation
  │
  └── auto_schedule_job() → DatabaseSchedulerService
        → 6 reel slots/day (every 4h, alternating light/dark)
        → 2 post slots/day (8AM + 2PM)
        → Brand stagger via schedule_offset
        → APScheduler checks every 60s → publish_now() via Meta Graph API
```

### Maestro Cycles (Background Daemon)

| Cycle | Interval | Purpose |
|-------|----------|---------|
| Daily Burst | 12PM Lisbon | Main content generation (above pipeline) |
| CHECK | 10min | Auto-publish check |
| HEALING | 15min | Fix stuck jobs, ensure agents match brands |
| OBSERVE | 3h | Fetch post metrics via Meta API |
| SCOUT | 4h | Discover trending content (hashtags + competitors) |
| FEEDBACK | 6h | Mutate agent DNA based on performance |
| EVOLUTION | Weekly Sun 2AM | Top 40% thrive, bottom 20% retired/replaced |
| DIAGNOSTICS | 4h | System health checks |
| BOOTSTRAP | 20min | Cold-start research (auto-disables when mature) |

### Content Types

| Type | Variant | Dimensions | Media Output | Platforms |
|------|---------|------------|--------------|-----------|
| Reel | `light` / `dark` | 1080×1920 | MP4 video + PNG thumbnail + JPEG YT thumbnail | Instagram, Facebook, YouTube |
| Post | `post` | 1080×1350 | PNG cover + carousel slides | Instagram, Facebook |

---

## Code Conventions (MANDATORY)

### Imports — Always Absolute
```python
# ✅ CORRECT
from app.models import Brand, GenerationJob
from app.services.brands.resolver import brand_resolver

# ❌ WRONG — never use relative imports
from . import models
from ..services import something
```

### Database-Driven Configuration — NEVER HARDCODE
```python
# ✅ CORRECT — all brand config lives in the brands DB table
from app.services.brands.resolver import brand_resolver
brand_config = brand_resolver.get_brand_config("healthycollege")

# ❌ WRONG — no hardcoded brand data
BRAND_COLORS = {"healthycollege": "#004f00"}
```

### Database Sessions — Three Patterns
```python
# 1. FastAPI route dependency (auto-closes)
from app.db_connection import get_db
@router.get("/example")
async def example(db: Session = Depends(get_db)):
    brands = db.query(Brand).filter(Brand.user_id == user["id"]).all()

# 2. Context manager in services (auto-commit/rollback)
from app.db_connection import get_db_session
with get_db_session() as db:
    brands = db.query(Brand).all()

# 3. Manual session for background tasks (must close!)
from app.db_connection import SessionLocal
db = SessionLocal()
try:
    ...
finally:
    db.close()
```

### JSON Column Updates — flag_modified Required
```python
from sqlalchemy.orm.attributes import flag_modified

# SQLAlchemy doesn't detect in-place mutations on JSON columns
job.brand_outputs["healthycollege"]["status"] = "scheduled"
flag_modified(job, "brand_outputs")  # ← REQUIRED or change is silently lost
db.commit()
```

### Multi-User Isolation
Every user gets a fully isolated data silo. **This is the most critical architectural constraint.**

- **Every tenant-scoped model** has `user_id = Column(String(100), nullable=False, index=True)`: `Brand`, `GenerationJob`, `AIAgent`, `AgentProposal`, `AgentPerformance`, `AgentLearning`, `GenePool`, `ScheduledReel`, `MaestroConfig`
- **System-wide entities (no `user_id`):** `LogEntry`, `SystemDiagnostic`, `AppSettings`, `APIQuotaUsage`
- **Auth:** `user: dict = Depends(get_current_user)` → `user["id"]` is Supabase UUID
- **Every route MUST** extract `user_id = user["id"]` and filter all queries by it
- **BrandResolver** caches brands **per user**: `_brands_by_user: dict[Optional[str], list[Brand]]` with 60s TTL
- **Maestro state is per-user**: `is_paused(user_id)`, `get_last_daily_run(user_id)`, `set_paused(paused, user_id)` — each user controls their own Maestro independently
- **Maestro Daily Burst** iterates over all `UserProfile` records and runs `_run_daily_burst_for_user(uid)` — each user's pause/last_run state is independent
- **MaestroConfig** table uses composite PK `(key, user_id)` — each user has their own config rows
- **Agent auto-provisioning** ensures each user has `count(agents) == count(active brands)` — agents are siloed per user
- **Startup seeding** uses `DEFAULT_USER_ID` env var for initial brands/agents

```python
# ✅ CORRECT — always scope queries by user
@router.get("/brands")
async def list_brands(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = user["id"]
    brands = db.query(Brand).filter(Brand.user_id == user_id, Brand.active == True).all()

# ❌ WRONG — leaks data across users
brands = db.query(Brand).filter(Brand.active == True).all()
```

---

## Key Directory Map

| Path | Purpose |
|------|---------|
| `app/main.py` | FastAPI app, startup sequence, APScheduler jobs, frontend serving |
| `app/models/` | SQLAlchemy ORM — all models re-exported from `__init__.py` |
| `app/api/` | REST routes grouped by domain (`brands/`, `content/`, `maestro/`, `agents/`, `system/`, `auth/`, `analytics/`, `youtube/`, `ai_team/`) |
| `app/services/maestro/` | `MaestroDaemon` singleton, examiner, scheduler_logic, healing, evolution |
| `app/services/content/` | `JobProcessor`, `ContentGenerator`, `ContentDifferentiator`, `ContentTracker` |
| `app/services/media/` | `ImageGenerator` (Pillow), `VideoGenerator` (FFmpeg), `AIBackgroundGenerator` (deAPI), `PostCompositor`, `TextSlideCompositor` |
| `app/services/publishing/` | `DatabaseSchedulerService` (slot calculation + DB scheduling), `SocialPublisher` (Meta Graph API) |
| `app/services/brands/` | `BrandResolver` (thread-safe singleton, 60s TTL cache), `BrandManager` (CRUD + agent provisioning) |
| `app/services/agents/` | `GenericAgent` (DB-driven, 8 strategies), `EvolutionEngine` (weekly DNA mutation) |
| `app/services/youtube/` | OAuth flow, `YouTubePublisher`, quota monitoring |
| `app/core/` | Constants (dimensions, fonts), prompt templates, viral patterns, quality scorer |
| `src/` | React frontend — `pages/`, `features/` (domain modules), `shared/` (api client, types, components) |
| `output/` | Generated media (persistent Docker volume at `/app/output`) |

---

## Database Schema (Key Tables)

| Model | Table | PK | Key Fields |
|-------|-------|----|------------|
| `GenerationJob` | `generation_jobs` | `job_id` ("GEN-XXXXXX") | `brands` (JSON list), `brand_outputs` (JSON dict), `variant`, `status`, `user_id` |
| `Brand` | `brands` | `id` (e.g. "healthycollege") | `colors` (JSON), `schedule_offset`, `meta_access_token`, `ig_business_account_id`, `fb_page_id`, `active` (soft delete) |
| `ScheduledReel` | `scheduled_reels` | `schedule_id` (UUID) | `reel_id`, `scheduled_time`, `status`, `extra_data` (JSON metadata with paths, platforms, caption) |
| `AIAgent` | `ai_agents` | auto int | `agent_id`, `agent_name`, `brand`, `strategy_names` (JSON), `strategy_weights` (JSON), `temperature` |
| `AgentProposal` | `agent_proposals` | auto int | `proposal_id`, `agent_name`, `brand`, `content_type`, `status`, `examiner_score` |
| `ContentHistory` | `content_history` | auto int | `keyword_hash` (SHA-256), `topic_bucket` (13 categories), duplicate detection |

**Critical JSON columns** (require `flag_modified` on update): `brand_outputs`, `colors`, `strategy_names`, `strategy_weights`, `extra_data`, `content_lines`, `slide_texts`

---

## API Route Map

| Prefix | Domain | Key Endpoints |
|--------|--------|---------------|
| `/reels/*` | Content CRUD | `/reels/create`, `/reels/schedule`, `/reels/publish` |
| `/reels/jobs/*` | Job management | `POST /create`, `GET /{id}`, `POST /{id}/regenerate/{brand}`, `DELETE /{id}` |
| `/api/v2/brands` | Brand CRUD | `GET /`, `POST /`, `PUT /{id}`, `PUT /{id}/credentials`, `POST /{id}/theme` |
| `/api/maestro` | Orchestrator control | `/status`, `/pause`, `/resume`, `/trigger-burst`, `/proposals`, `/proposals/{id}/accept` |
| `/api/agents` | AI agent CRUD | CRUD for `AIAgent` records |
| `/api/ai-team` | Dashboard data | Agent performance, Maestro status |
| `/api/analytics` | Metrics | Brand analytics, snapshots, refresh |
| `/api/youtube` | YouTube integration | OAuth connect, channel status, quota |
| `/api/auth` | Authentication | Login, profile, token validation |
| `/api/system/*` | System | Health check, settings, logs |
| `/api/prompts` | Prompt transparency | View/test AI prompts |

---

## Frontend Architecture

### Stack & Patterns
- **React 18 + TypeScript + Vite + TailwindCSS**
- **State:** React Query (`@tanstack/react-query`) — `staleTime: 5000`, `retry: 1`
- **Auth:** Supabase JWT via `AuthProvider` → `useAuth()` hook → auto-attached to all API calls
- **API Client:** `src/shared/api/client.ts` — `apiClient.get/post/put/patch/delete` with 30s timeout
- **Routing:** React Router v6 with `AuthGuard` wrapper

### Feature Module Pattern
Each domain in `src/features/` follows: `api/` (React Query hooks) + `model/` (types/config) + `hooks/` (custom hooks) + `components/` (UI)

**Query key convention:**
```typescript
export const brandKeys = {
  all: ['brands'] as const,
  list: () => [...brandKeys.all, 'list'] as const,
  detail: (id: string) => [...brandKeys.all, 'detail', id] as const,
};
```

**Brand resolution on frontend:** `useDynamicBrands()` is the single source of truth — fetches from API, registers into runtime cache, falls back to static `ALL_BRANDS` while loading.

---

## Singletons & Thread Safety

| Singleton | Access Pattern | Notes |
|-----------|---------------|-------|
| `brand_resolver` | Module-level instance | Thread-safe, 60s TTL cache, per-user queries |
| `get_maestro()` | Module-level function | Returns `MaestroDaemon` singleton; all state (pause, last_daily_run) is per-user via `MaestroConfig(key, user_id)` |
| `get_content_tracker()` | Module-level function | Anti-repetition engine (topic cooldown 3d, fingerprint 30d) |
| AI background generation | `threading.Semaphore(1)` | Only 1 deAPI request at a time, 90s queue timeout |
| Job processing | `threading.Semaphore(MAX_CONCURRENT_JOBS)` | Max 3 concurrent jobs |

---

## External Service Integration

| Service | Purpose | Key Env Var | Rate Limits |
|---------|---------|-------------|-------------|
| **DeepSeek** | Content generation, examination, agent intelligence | `DEEPSEEK_API_KEY` | Model: `deepseek-chat` |
| **deAPI** | AI image generation (backgrounds) | `DEAPI_API_KEY` | 200 req/day free tier, Semaphore(1) |
| **Meta Graph API** | IG/FB publishing (reels, posts, carousels) | Per-brand `meta_access_token` in DB | API v19.0, resumable upload |
| **YouTube Data API** | Shorts upload, custom thumbnails | Per-brand OAuth `refresh_token` in DB | 10,000 units/day |
| **Supabase** | Auth (JWT), PostgreSQL hosting | `SUPABASE_URL`, `SUPABASE_KEY` | — |

---

## Startup Sequence (`app/main.py`)

1. Initialize logging service
2. `init_db()` — create all tables
3. Seed default brands (5) + settings + AI agents (Toby + Lexi)
4. Log brand credential status (IG/FB IDs, token presence)
5. Reset stuck "publishing" posts (>10 min)
6. Start APScheduler: auto-publish (60s), analytics refresh (6h), log cleanup (24h, 7-day retention)
7. Start Maestro daemon (all background cycles)

---

## Critical Gotchas

- **Carousel slides are composed at scheduling time** (in `scheduler_logic.py`), not during job processing
- **Facebook captions are truncated to 400 chars** in `social_publisher.py`
- **Brand `schedule_offset`** is auto-assigned (count of existing brands) — staggers publishing times
- **`_resolve_output_path()`** in `main.py` normalizes paths between Docker (`/app/output/...`) and local (`output/...`) — critical for publishing
- **No test suite exists** — `pytest` is commented out in `requirements.txt`
- **`flag_modified()` is mandatory** when mutating JSON columns, otherwise changes are silently lost
- **Agent auto-provisioning:** Creating a brand auto-creates an AI agent with randomized DNA archetype
- **deAPI models:** `Flux1schnell` for reel backgrounds (~$0.00136), `ZImageTurbo_INT8` for post backgrounds (higher quality)
- **Content deduplication:** `ContentTracker` uses SHA-256 keyword hashing with 3-day topic cooldown and 30-day fingerprint cooldown

---

## Publishing Flow (Meta Graph API + YouTube)

### Instagram Reel — Resumable Upload (4 steps)
1. **Create container:** `POST /{ig_account_id}/media` with `media_type=REELS`, `upload_type=resumable`, `video_url`, `caption` → gets `creation_id` + `upload_uri`
2. **Upload video:** `POST https://rupload.facebook.com/.../{container_id}` with `file_url` header
3. **Poll status:** `GET /{container_id}?fields=status_code` every 5s, max 180s, until `FINISHED`
4. **Publish:** `POST /{ig_account_id}/media_publish` with `creation_id`

### Facebook Reel — 3-Step
1. **Start:** `POST /{page_id}/video_reels` with `upload_phase=start` → gets `video_id` + `upload_url`
2. **Upload:** POST to `rupload.facebook.com` with `file_url` header, poll `upload_complete` (60s)
3. **Finish:** `POST /{page_id}/video_reels` with `upload_phase=finish`, `video_state=PUBLISHED`

Facebook gets a shortened caption (max 400 chars) via `create_facebook_caption()`: extracts first paragraph, removes emoji CTA lines, truncates at sentence boundary with "...", appends generic follow CTA.

### Instagram Carousel — 4-Step
1. Create each item container with `is_carousel_item=true` → poll each until `FINISHED`
2. Create `CAROUSEL` container referencing all children IDs
3. Publish carousel container
Falls back to single image if < 2 URLs. Max 10 items.

### Facebook Carousel — 2-Step
1. Upload each photo as `published=false` → get `media_fbid`
2. Create feed post with `attached_media[i]={media_fbid: id}`

### YouTube Shorts
Uses per-brand OAuth `refresh_token` from `youtube_channels` table. `YouTubePublisher.upload_youtube_short()` with title (max 100 chars), description, custom JPEG thumbnail (<2MB). Quota: 10,000 units/day (upload=1600 units, thumbnail=50 units).

### Page Access Token Resolution
`SocialPublisher._get_page_access_token(page_id)`: resolves Page Access Token from System User Token via `GET /{page_id}?fields=access_token`. Falls back to `GET /me/accounts`. Cached per page_id.

### Auto-Publish Daemon
`get_pending_publications()` runs every 60s via APScheduler: queries `ScheduledReel` where `status == "scheduled"` and `scheduled_time <= now`. Uses `FOR UPDATE SKIP LOCKED` for atomic locking. Immediately marks as `"publishing"` to prevent duplicates. Supports partial success (`"partial"` status with per-platform results in `extra_data.publish_results`).

---

## Scheduling Slot System

### Reel Slots — 6 Per Day Per Brand
Every 4 hours, alternating Light/Dark:
```
BASE_SLOTS = [(0, light), (4, dark), (8, light), (12, dark), (16, light), (20, dark)]
```

Each brand's `schedule_offset` (0–4, auto-assigned) staggers slots by N hours:
| Brand | Offset | Light Slots | Dark Slots |
|-------|--------|-------------|------------|
| Brand A | 0 | 12AM, 8AM, 4PM | 4AM, 12PM, 8PM |
| Brand B | 1 | 1AM, 9AM, 5PM | 5AM, 1PM, 9PM |
| Brand C | 2 | 2AM, 10AM, 6PM | 6AM, 2PM, 10PM |

### Post Slots — 2 Per Day Per Brand
```
BASE_POST_SLOTS = [8, 14]  # 8 AM + 2 PM
```
Same brand offset applied (e.g., offset=2 → 10AM + 4PM).

### Slot Algorithm
1. Start date = `max(Jan 16 2026, now)`
2. Filter slots matching requested variant
3. Query all `ScheduledReel` (status `scheduled`/`publishing`) from start date, filtered by brand + variant
4. Build `occupied_slots` set
5. Scan day-by-day (up to 365 days) through matching slots
6. Return first unoccupied slot not in the past

### Auto-Schedule Flow (`scheduler_logic.py`)
For completed jobs: verify media files exist → compose carousel slides (posts only) → `get_next_available_slot()` → `schedule_reel()` → mark `brand_outputs[brand]["status"] = "scheduled"` with `flag_modified()`.

Frontend (`src/pages/Scheduled.tsx`) mirrors the exact same slot pattern for calendar visualization with per-brand fill analysis (green=full, amber=partial).

---

## AI Agent System & Evolution

### 8 Strategies
| Strategy | Type | Purpose |
|----------|------|---------|
| `explore` | Creative | Brand new angles, fresh topics |
| `iterate` | Refinement | Build on past top performers |
| `double_down` | Exploitation | Double down on proven winners |
| `trending` | External | Leverage trending content from Scout cycle |
| `analyze` | Research | Data-driven topic selection |
| `refine` | Polish | Improve existing content quality |
| `systematic` | Methodical | Cover topic gaps systematically |
| `compound` | Growth | Long-form series, compound engagement |

### Built-in Agents (Seeded Per User)
| Agent | Temp | Variant | Risk | Strategies |
|-------|------|---------|------|------------|
| **Toby** (Explorer) | 0.90 | dark | high | explore, iterate, double_down, trending |
| **Lexi** (Optimizer) | 0.75 | light | low | analyze, refine, systematic, compound |

### Agent Auto-Provisioning
`_ensure_agents_for_all_brands()`: total active agents == total active brands (per user). Auto-spawns agents with randomized DNA:
- Temperature: 0.70–0.95
- Variant: random light/dark
- Risk: random low/medium/high
- 4–5 random strategies with weights summing to 1.0
- Name from pool of 40 (Atlas, Nova, Cipher, Orion, Zenith, Phoenix…)
- Random archetype from 6: Bold Explorer, Precision Optimizer, Trend Surfer, Story Weaver, Pattern Breaker, Consistency Engine

### Proposal Generation Flow
1. `_gather_intelligence()` — top/under performers, trending content, cooldown topics, brand avoidance
2. `_plan_strategies(count, intel)` — weighted allocation with dynamic kills (e.g., kills `double_down` if no performance data)
3. Per strategy: `_generic_strategy()` → build prompt → DeepSeek call → parse JSON → duplicate check (SHA-256, 60-day) → quality check → save `AgentProposal`

### Examiner Quality Gate (`app/services/maestro/examiner.py`)
- **Scoring:** `avatar_fit` (35%), `engagement_potential` (35%), `content_quality` (30%)
- **Target avatar:** Women aged 45+ in the US — health, daily habits, mental health, wellness, nutrition, aging gracefully
- **Thresholds:** Accept ≥ 6.0, Hard reject < 4.5
- **Red flags:** extreme physical challenges, youth aesthetics, dangerous supplements, gym bro culture, medical claims
- Uses `temperature=0.3` for consistent scoring. Auto-passes (score 7.0) on API errors.

### Evolution Engine (Weekly, Sunday 2AM)

**Survival Score:**
```
S = 0.4 × views + 0.3 × engagement_rate + 0.2 × consistency + 0.1 × examiner_avg
```
Views normalized to 100K cap. Engagement: 10% ER = 100. Consistency = 1 - σ/μ.

**Feedback Cycle (every 6h):** Traces published `ScheduledReel` → `AgentProposal` via `job_id` → `proposal_id`. Saves `AgentPerformance` snapshots.

**Adaptation Mutations:**
- **Strategy weight shift:** best vs worst strategy, confidence ≥ 70%, dominance ratio ≥ 1.5×, max ±5%
- **Temperature shift:** survival > 60 → decrease (exploit), survival < 30 → increase (explore), max ±0.03, bounds [0.60, 0.98]

**Selection:**
- **Top 40%:** Thriving — DNA archived to `GenePool`
- **Middle 40%:** Surviving — no change
- **Bottom 20%:** Death eligible if survival < 30 for 2 consecutive cycles, ≥ 4 feedback cycles, not builtin, and won't drop below `MIN_ACTIVE_AGENTS=2`
- Dead agent → DNA archived → new agent spawned (80% inherit from pool with crossover, 20% fully random)

---

## Frontend Pages & Components

### Page Inventory
| Page | File | Purpose |
|------|------|---------|
| Generator | `src/pages/Generator.tsx` | Reel creation form — title, content lines, brand selection, variant (light/dark), CTA type, platforms, AI prompt |
| Posts | `src/pages/Posts.tsx` | Post/carousel creation with live Konva canvas preview |
| Jobs | `src/pages/History.tsx` | Job list with status filters, bulk actions |
| Job Detail | `src/pages/JobDetail.tsx` | Per-brand output preview, regeneration, scheduling |
| Post Detail | `src/pages/PostJobDetail.tsx` | Post-specific detail with carousel slide preview |
| Scheduled | `src/pages/Scheduled.tsx` | Calendar (month/week) with slot tracker, filters by content type/platform/brand, bulk publish/delete |
| Brands | `src/pages/Brands.tsx` | 3-tab layout: My Brands / Connections / Settings |
| AI Team | `src/pages/AITeam.tsx` | 7-tab dashboard: Overview, Leaderboard, Timeline, Gene Pool, Health, Quotas, Competitors |
| Analytics | `src/pages/Analytics.tsx` | Recharts: Followers Over Time, Daily New Followers, Daily Views + brand cards |
| Profile | `src/pages/Profile.tsx` | User profile management |
| Logs | `src/pages/Logs.tsx` | System/AI/Maestro log viewer |

### Feature Modules (`src/features/`)
Each domain follows: `api/` (React Query hooks) + `model/` (types/config) + `hooks/` (custom hooks) + `components/` (UI)

| Module | Key Hooks |
|--------|-----------|
| `brands/` | `useBrands`, `useCreateBrand`, `useUpdateBrand`, `useDynamicBrands` (single source of truth) |
| `jobs/` | `useJobs`, `useJob`, `useCreateJob`, `useDeleteJob`, `useCancelJob` |
| `scheduling/` | `useScheduledPosts`, `usePublishNow`, `useBulkPublishNow`, `useRetryScheduled` |
| `ai-team/` | `useMaestroStatus`, `useProposals`, `useAgents`, `useAcceptProposal`, `useExaminerStats` |
| `analytics/` | `useAnalytics`, `useAnalyticsSnapshots`, `useRefreshAnalytics` |
| `settings/` | `useBrandCredentials`, `useDeapiBalance`, `useMaestroConfig` |
| `auth/` | `AuthProvider`, `useAuth`, `AuthGuard`, `LoginGuard` |

### Frontend Route Redirects
| Old Path | Redirects To |
|----------|-------------|
| `/history` | `/jobs` |
| `/connected` | `/brands?tab=connections` |
| `/settings` | `/brands?tab=settings` |
| `/toby` | `/ai-team` |
| `/maestro` | `/ai-team?tab=orchestrator` |

### Brand Management Flow
- **Create:** `CreateBrandModal` → `POST /api/v2/brands` → backend auto-provisions AI agent + assigns `schedule_offset`
- **Theme:** `BrandThemeModal` → `POST /api/v2/brands/{id}/theme` (FormData with optional logo upload)
- **Credentials:** `ConnectionsTab` → `PUT /api/v2/brands/{id}/credentials` (Meta token, IG/FB IDs)
- **Delete:** Soft delete (`active=false`), reactivate available
- **Runtime cache:** `registerBrand(id, label, color)` inserts into `BRAND_CONFIG` map; `getBrandLabel()`/`getBrandColor()` provide lookups with smart fallbacks
