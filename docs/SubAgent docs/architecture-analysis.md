# Comprehensive Architecture Analysis

**Date:** 2026-02-13  
**Scope:** Full-stack — Backend (`app/`) + Frontend (`src/`)  
**Total:** 136 files, 59,113 lines

---

## 1. Executive Summary

This codebase is a full-stack social media automation platform (FastAPI + React/TypeScript) that has grown organically through several generations of features (Toby → Maestro, v1 → v2 content generators, JSON → DB scheduler, config-based → DB-based brands). The rapid evolution has left significant technical debt:

| Metric | Backend | Frontend | Total |
|--------|--------:|----------:|------:|
| Files | 60 | 76 | 136 |
| Lines of code | 37,747 | 21,366 | 59,113 |
| Dead code (removable) | ~2,630 (7%) | ~286 (1.3%) | ~2,916 |
| God files (>500 lines) | 11 | 14 | 25 |
| Broken imports | 3 | 0 | 3 |
| Architectural violations | 3 service→API | 1 shared→feature | 4 |
| Circular dependencies | 4 pairs | 0 | 4 |

**Top 5 issues by impact:**

1. **3 broken imports** — `meta_api.py` and `toby_daemon.py` will crash at runtime if their code paths are entered
2. **~2,900 lines of dead code** — 5 fully dead files, plus orphaned classes and functions
3. **Duplicate brand config** — two divergent brand configuration systems on the frontend (`PostCanvas.tsx` vs `features/brands/model/`)
4. **God files everywhere** — 25 files exceed 500 lines; `maestro.py` (2,485), `routes.py` (2,251), `Brands.tsx` (2,043) are the worst
5. **4 frontend pages bypass the feature layer** — 4,633 lines of inline API logic in Toby, Maestro, AITeam, and Prompts pages

---

## 2. Current Structure

### Backend (`app/` — 60 files, 37,747 lines)

```
app/
├── __init__.py                     # 12 lines
├── db_connection.py                # 485 — PostgreSQL connection, sessions, migrations
├── main.py                         # 689 — FastAPI entry point, startup/shutdown
├── models.py                       # 1,370 — 17 SQLAlchemy ORM models
├── api/                            # API route handlers
│   ├── agents_routes.py            # 472
│   ├── ai_logs_routes.py           # 1,445 — log viewer + inline HTML dashboards
│   ├── analytics_routes.py         # 377
│   ├── auth_routes.py              # 311
│   ├── brands_routes.py            # 392 — LEGACY config-based routes
│   ├── brands_routes_v2.py         # 614 — DB-backed brand routes
│   ├── jobs_routes.py              # 870
│   ├── logs_routes.py              # 1,316 — log viewer + inline HTML dashboards
│   ├── maestro_routes.py           # 978
│   ├── prompts_routes.py           # 221
│   ├── routes.py                   # 2,251 — MONOLITH: 40+ mixed endpoints
│   ├── schemas.py                  # 150
│   ├── settings_routes.py          # 545
│   ├── toby_routes.py              # 339 — partially legacy
│   └── youtube_routes.py           # 536
├── core/                           # Business logic, config, patterns
│   ├── brand_colors.py             # 231
│   ├── config.py                   # 154
│   ├── constants.py                # 66
│   ├── cta.py                      # 63
│   ├── prompt_templates.py         # 681
│   ├── quality_scorer.py           # 465
│   ├── viral_ideas.py              # 1,390 — 59 viral templates (data file)
│   └── viral_patterns.py           # 416
├── database/
│   └── db.py                       # 173 — LEGACY SQLite ReelDatabase
├── services/                       # Business services
│   ├── ai_background_generator.py  # 592
│   ├── analytics_service.py        # 916
│   ├── brand_manager.py            # 461
│   ├── caption_builder.py          # 109
│   ├── caption_generator.py        # 324
│   ├── content_differentiator.py   # 282
│   ├── content_generator.py        # 707 — DEAD (v1, replaced by v2)
│   ├── content_generator_v2.py     # 1,142
│   ├── content_tracker.py          # 793
│   ├── db_scheduler.py             # 1,189
│   ├── diagnostics_engine.py       # 533
│   ├── evolution_engine.py         # 914
│   ├── generic_agent.py            # 1,230
│   ├── image_generator.py          # 657
│   ├── job_manager.py              # 914
│   ├── logging_middleware.py       # 186
│   ├── logging_service.py          # 523
│   ├── maestro.py                  # 2,485 — MONOLITH: master orchestrator daemon
│   ├── maestro_examiner.py         # 336
│   ├── meta_api.py                 # 232 — DEAD + broken import
│   ├── metrics_collector.py        # 693
│   ├── multi_account_publisher.py  # 366 — DEAD
│   ├── post_compositor.py          # 355
│   ├── scheduler.py                # 331 — DEAD (replaced by db_scheduler)
│   ├── social_publisher.py         # 1,028
│   ├── toby_daemon.py              # 492 — ~90% dead + broken imports
│   ├── trend_scout.py              # 1,201
│   ├── video_generator.py          # 159
│   └── youtube_publisher.py        # 649
└── utils/
    ├── ffmpeg.py                   # 247
    ├── fonts.py                    # 128
    ├── text_formatting.py          # 260
    └── text_layout.py              # 269
```

### Frontend (`src/` — 76 files, 21,366 lines)

```
src/
├── main.tsx                        # 22 — App entry point
├── index.css                       # 337 — Tailwind + custom utilities
├── vite-env.d.ts                   # 1
├── app/                            # Application shell (475 lines)
│   ├── layout/
│   │   ├── AppLayout.tsx           # 344
│   │   └── NotificationBell.tsx    # 109
│   ├── providers/
│   │   ├── QueryProvider.tsx       # 23
│   │   ├── RouterProvider.tsx      # 13
│   │   └── index.tsx               # 13
│   └── routes/
│       └── index.tsx               # 84
├── features/                       # Feature modules (1,556 lines)
│   ├── analytics/                  # ✅ Complete (233 lines)
│   ├── auth/                       # ✅ Complete (199 lines)
│   ├── brands/                     # ✅ Complete (504 lines)
│   ├── jobs/                       # ✅ Complete (320 lines)
│   ├── scheduling/                 # ✅ Complete (444 lines)
│   └── settings/                   # ⚠️ Incomplete — 1 file, no barrel (158 lines)
├── pages/                          # Page components (14,650 lines)
│   ├── Brands.tsx                  # 2,043 — GOD COMPONENT (37 useState)
│   ├── Maestro.tsx                 # 1,719 — no feature module, inline API
│   ├── Scheduled.tsx               # 1,345
│   ├── Toby.tsx                    # 1,302 — no feature module, inline API
│   ├── PostJobDetail.tsx           # 1,273
│   ├── About.tsx                   # 1,053
│   ├── JobDetail.tsx               # 991
│   ├── AITeam.tsx                  # 932 — no feature module, inline API
│   ├── Analytics.tsx               # 796
│   ├── History.tsx                 # 706
│   ├── Prompts.tsx                 # 680 — no feature module, inline API
│   ├── Posts.tsx                   # 588
│   ├── Generator.tsx               # 430
│   ├── Connected.tsx               # 430
│   ├── Settings.tsx                # 318
│   ├── Carousels.tsx               # 286 — DEAD CODE (not in routes)
│   ├── Login.tsx                   # 227
│   ├── Profile.tsx                 # 220
│   ├── PostsPrompts.tsx            # 5
│   └── ReelsPrompts.tsx            # 5
└── shared/                         # Shared code (1,335 lines)
    ├── api/
    │   └── client.ts               # 92
    ├── components/
    │   ├── GodAutomation.tsx       # 1,633 — GOD COMPONENT
    │   ├── PostCanvas.tsx          # 553 — mixed concerns
    │   ├── CarouselTextSlide.tsx   # 321
    │   ├── Modal.tsx               # 76
    │   ├── StatusBadge.tsx         # 70
    │   └── LoadingSpinner.tsx      # 43
    ├── lib/
    │   └── captionUtils.ts         # 78
    └── types/
        └── index.ts                # 115
```

---

## 3. Dead Code Inventory

### Fully Dead Files (can delete entirely)

| File | Lines | Evidence |
|------|------:|---------|
| `app/services/content_generator.py` | 707 | v1 generator — `ContentGeneratorV2` in `content_generator_v2.py` aliases itself as `ContentGenerator` (line 1045). Zero external imports of the v1 file. |
| `app/services/scheduler.py` | 331 | JSON-based `SchedulerService` — fully replaced by `DatabaseSchedulerService` in `db_scheduler.py`. Never imported. |
| `app/services/meta_api.py` | 232 | `MetaAPIService` and `MetaAPIError` never imported. Also has **broken import** (`from app.core.logger import get_logger` — file doesn't exist). |
| `app/services/multi_account_publisher.py` | 366 | `MultiAccountPublisher` never imported anywhere. Zero external references. |
| `src/pages/Carousels.tsx` | 286 | `CarouselsPage` exported in `pages/index.ts` but **not wired to any route** in `src/app/routes/index.tsx`. Unreachable. |
| **Total** | **1,922** | |

### Mostly Dead Files (few live exports in otherwise dead code)

| File | Lines | Live Code | Dead Code | Details |
|------|------:|-----------|-----------|---------|
| `app/services/toby_daemon.py` | 492 | `toby_log()` (~20 lines) | ~472 lines | `TobyDaemon`, `TobyState`, `start_toby_daemon()`, `get_toby_daemon()` all unused. Also has **2 broken imports** to nonexistent `app.services.toby_agent`. Only `toby_log()` is imported by `trend_scout.py` and `metrics_collector.py`. |
| **Total** | **492** | **~20** | **~472** | |

### Dead Functions/Constants Within Otherwise Live Files

| File | Dead Item | Lines | Evidence |
|------|-----------|------:|---------|
| `app/services/content_generator_v2.py` | `ContentRating` (duplicate) | ~10 | Also defined in dead `content_generator.py`. The v2 copy is technically used, but blocks removal of the concept from v1. |
| `app/services/maestro.py` | `_format_uptime()` | ~15 | Duplicated identically in `toby_daemon.py`. One copy can be removed. |
| `app/api/brands_routes.py` | All routes except `BRAND_NAME_MAP` | ~350 | Legacy config-based routes superseded by `brands_routes_v2.py`. Only `BRAND_NAME_MAP` is still imported by `analytics_service.py`. |
| `app/api/toby_routes.py` | Endpoints referencing `TobyDaemon` | ~150 | Some routes query DB directly (alive), others try to use dead `TobyDaemon` (dead paths). |
| `src/pages/index.ts` | `CarouselsPage` export | 1 | Export exists but no consumer. |
| `src/shared/components/PostCanvas.tsx` | Several of 30 exports | ~? | `PREVIEW_SCALE`, `GRID_PREVIEW_SCALE`, `POST_BRAND_OFFSETS`, `getBrandAbbreviation`, `SLIDE_FONT_OPTIONS`, `SETTINGS_STORAGE_KEY` — need usage audit. |

### Broken Imports (would crash if reached)

| File | Line | Broken Import | Why |
|------|------|--------------|-----|
| `app/services/meta_api.py` | 9 | `from app.core.logger import get_logger` | `app/core/logger.py` does not exist |
| `app/services/toby_daemon.py` | 273 | `from app.services.toby_agent import get_toby_agent` | `app/services/toby_agent.py` does not exist |
| `app/services/toby_daemon.py` | 278 | `from app.services.toby_agent import MAX_PROPOSALS_PER_DAY` | `app/services/toby_agent.py` does not exist |

### Dead Code Summary

| Category | Files Affected | Removable Lines |
|----------|---------------:|----------------:|
| Fully dead files | 5 | 1,922 |
| Mostly dead files | 1 | ~472 |
| Dead code in live files | 5 | ~525 |
| **Total** | **11** | **~2,919** |

---

## 4. Duplication Map

### V1/V2 File Pairs (Superseded Systems)

| V1 (dead) | V2 (active) | What's duplicated |
|-----------|-------------|-------------------|
| `content_generator.py` (707 lines) | `content_generator_v2.py` (1,142 lines) | Content generation pipeline. Both define `ContentRating`. V2 aliases `ContentGeneratorV2 → ContentGenerator`. |
| `scheduler.py` (331 lines) | `db_scheduler.py` (1,189 lines) | Scheduling service. V1 used JSON files, V2 uses PostgreSQL. |
| `brands_routes.py` (392 lines) | `brands_routes_v2.py` (614 lines) | Brand management API. V1 config-based, V2 database-backed. Both registered in `main.py`. |

### Frontend Duplicate Brand Config Systems

| System | Location | Lines | API |
|--------|----------|------:|-----|
| Feature-level config | `features/brands/model/brand-config.ts` | 80 | `BRAND_CONFIG` map, `getBrandLabel()`, `getBrandColor()`, `registerBrand()` |
| Canvas-level config | `shared/components/PostCanvas.tsx` | ~80 (within 553) | `BRAND_CONFIGS` map, `getBrandConfig()`, `getBrandAbbreviation()` |

**Impact:** Same purpose (brand → color/label mapping) but divergent data, different key names, different APIs. Brand changes require updates in two places. Used by different consumers across the app.

### Duplicated Backend Patterns

| Pattern | Locations | Impact |
|---------|-----------|--------|
| `_format_uptime()` | `toby_daemon.py:109`, `maestro.py:434` | Identical function in both files |
| `ContentRating` class | `content_generator.py:614`, `content_generator_v2.py:1052` | Same class defined twice (v1 is dead) |
| `BRAND_NAME_MAP` | `brands_routes.py` | Duplicates mapping logic in `BrandManager` |
| Toby/Maestro daemon pattern | `toby_daemon.py`, `maestro.py` | Both have State class, daemon loop, log function, uptime formatter |

### Repeated Frontend API-Call Pattern

Four pages (Toby, Maestro, AITeam, Prompts — 4,633 lines combined) repeat this boilerplate ~15 times instead of using React Query hooks:

```typescript
const [data, setData] = useState(...)
const [loading, setLoading] = useState(true)
const fetchData = useCallback(async () => {
  try { setData(await get('/api/...')) }
  catch (e) { console.error(e) }
  finally { setLoading(false) }
}, [])
useEffect(() => { fetchData() }, [fetchData])
```

The other 6 feature modules use React Query properly via `useQuery`/`useMutation` hooks.

### Database Session Duplication (~100+ occurrences)

Two session patterns used interchangeably across the backend:

| Pattern | Where | Count |
|---------|-------|------:|
| `db: Session = Depends(get_db)` | API routes | Standard |
| Inline `db = SessionLocal(); try/finally: db.close()` | Services | 100+ |

Worst offenders for inline `SessionLocal`:

| File | Inline SessionLocal Count |
|------|-------------------------:|
| `maestro.py` | 24 |
| `diagnostics_engine.py` | 20 |
| `trend_scout.py` | 20 |
| `generic_agent.py` | 16 |
| `metrics_collector.py` | 12 |

---

## 5. Architecture Smells

### God Files (>500 lines)

#### Backend (11 files)

| Rank | File | Lines | Responsibilities |
|-----:|------|------:|-----------------|
| 1 | `services/maestro.py` | **2,485** | Orchestration loop, agent mgmt, job scheduling, proposal mgmt, healing, metrics, evolution, burst mode, trend scouting, DB state |
| 2 | `api/routes.py` | **2,251** | 40+ endpoints: content gen, reel creation, scheduling, publishing, user mgmt, slot cleaning, analytics, rejection feedback |
| 3 | `api/ai_logs_routes.py` | **1,445** | Log querying + full HTML dashboard rendering inline |
| 4 | `core/viral_ideas.py` | **1,390** | Data file — 59 viral templates (size inherent) |
| 5 | `models.py` | **1,370** | 17 SQLAlchemy models in one file |
| 6 | `api/logs_routes.py` | **1,316** | Log querying + HTML dashboard rendering inline |
| 7 | `services/generic_agent.py` | **1,230** | Agent loading, caching, creation, mutation, proposals, learning |
| 8 | `services/trend_scout.py` | **1,201** | Trend detection, platform scraping, caching, scoring |
| 9 | `services/db_scheduler.py` | **1,189** | Scheduling, publishing orchestration, YouTube, slot mgmt |
| 10 | `services/content_generator_v2.py` | **1,142** | Content generation + quality loop + rating |
| 11 | `services/social_publisher.py` | **1,028** | Instagram + Facebook publishing, captions, error handling |

#### Frontend (14 files)

| Rank | File | Lines | useState | useEffect | Severity |
|-----:|------|------:|:--------:|:---------:|:--------:|
| 1 | `pages/Brands.tsx` | **2,043** | 37 | 4 | Critical |
| 2 | `pages/Maestro.tsx` | **1,719** | 22 | 4 | Critical |
| 3 | `shared/components/GodAutomation.tsx` | **1,633** | — | — | Critical |
| 4 | `pages/Scheduled.tsx` | **1,345** | 16 | 2 | Critical |
| 5 | `pages/Toby.tsx` | **1,302** | 18 | 4 | Critical |
| 6 | `pages/PostJobDetail.tsx` | **1,273** | 16 | 3 | Critical |
| 7 | `pages/About.tsx` | **1,053** | 2 | 0 | Moderate |
| 8 | `pages/JobDetail.tsx` | 991 | 10 | 0 | Moderate |
| 9 | `pages/AITeam.tsx` | 932 | 13 | 3 | Moderate |
| 10 | `pages/Analytics.tsx` | 796 | 7 | 3 | Moderate |
| 11 | `pages/History.tsx` | 706 | 9 | 0 | Moderate |
| 12 | `pages/Prompts.tsx` | 680 | 13 | 2 | Moderate |
| 13 | `pages/Posts.tsx` | 588 | 12 | 2 | Moderate |
| 14 | `shared/components/PostCanvas.tsx` | 553 | — | — | Moderate |

### Circular Dependencies (Backend)

All resolved via lazy (in-function) imports, which hides coupling:

| Pair | Direction |
|------|-----------|
| `maestro.py` ↔ `generic_agent.py` | Maestro imports GenericAgent; GenericAgent imports Maestro |
| `maestro.py` ↔ `diagnostics_engine.py` | Mutual imports |
| `evolution_engine.py` ↔ `generic_agent.py` | Mutual imports |
| `evolution_engine.py` ↔ `brand_manager.py` | Mutual imports |

**Excessive lazy imports** to work around circular deps:

| File | Lazy Import Count |
|------|------------------:|
| `maestro.py` | ~40 |
| `maestro_routes.py` | ~25 |
| `diagnostics_engine.py` | ~20 |
| `trend_scout.py` | ~20 |
| `generic_agent.py` | ~16 |
| `metrics_collector.py` | ~12 |
| `evolution_engine.py` | ~10 |

### Layer Violations

#### Backend: Service → API (inverted dependency)

| Service | Imports From API | What It Imports |
|---------|-----------------|-----------------|
| `analytics_service.py` | `app.api.brands_routes` | `BRAND_NAME_MAP` |
| `db_scheduler.py` | `app.api.youtube_routes` | `get_youtube_credentials_for_brand`, `update_youtube_channel_status` |
| `multi_account_publisher.py` | `app.api.youtube_routes` | `get_youtube_credentials_for_brand`, `update_youtube_channel_status` |

#### Frontend: Shared → Feature (inverted dependency)

| Shared Module | Imports From Feature | What It Imports |
|---------------|---------------------|-----------------|
| `shared/components/GodAutomation.tsx` | `@/features/brands` | `getBrandLabel`, `getBrandColor` |

### Mixed Concerns

| File | What's Mixed |
|------|-------------|
| `api/logs_routes.py` (1,316 lines) | API route logic + inline HTML template rendering |
| `api/ai_logs_routes.py` (1,445 lines) | API route logic + inline HTML template rendering |
| `shared/components/PostCanvas.tsx` (553 lines) | Brand config data, layout constants, typography utils, AND a React canvas component |
| `shared/components/GodAutomation.tsx` (1,633 lines) | 4+ sub-components (`BatchSelector`, `PreGenProgress`, `ReviewCard`, `CompletionSummary`) defined inline |
| `pages/Brands.tsx` (2,043 lines) | CRUD logic, theme editor, color picker, preview, 37 state variables — all in one component |

### Mixed Database Technologies (Backend)

| Technology | Where | Status |
|-----------|-------|--------|
| PostgreSQL via SQLAlchemy | `db_connection.py`, `models.py` | Primary — used everywhere |
| SQLite via raw `sqlite3` | `database/db.py` | Legacy — only `routes.py` uses `ReelDatabase` |
| JSON file | `output/scheduled.json` | Legacy — dead `SchedulerService` |

### Inconsistent Frontend Feature Modules

| Feature | api/ | hooks/ | components/ | model/ | barrel | Status |
|---------|:----:|:------:|:-----------:|:------:|:------:|:------:|
| analytics | ✅ | ✅ | — | — | ✅ | Complete |
| auth | ✅ | — | — | — | ✅ | Complete |
| brands | ✅ | ✅ | ✅ | ✅ | ✅ | Complete |
| jobs | ✅ | ✅ | — | — | ✅ | Complete |
| scheduling | ✅ | ✅ | ✅ | — | ✅ | Complete |
| settings | ✅ | — | — | — | — | Incomplete |
| toby | — | — | — | — | — | Missing |
| maestro | — | — | — | — | — | Missing |
| ai-team | — | — | — | — | — | Missing |
| prompts | — | — | — | — | — | Missing |

---

## 6. File Size Distribution

### Backend — Top 15 Largest Files

| Rank | File | Lines |
|-----:|------|------:|
| 1 | `app/services/maestro.py` | 2,485 |
| 2 | `app/api/routes.py` | 2,251 |
| 3 | `app/api/ai_logs_routes.py` | 1,445 |
| 4 | `app/core/viral_ideas.py` | 1,390 |
| 5 | `app/models.py` | 1,370 |
| 6 | `app/api/logs_routes.py` | 1,316 |
| 7 | `app/services/generic_agent.py` | 1,230 |
| 8 | `app/services/trend_scout.py` | 1,201 |
| 9 | `app/services/db_scheduler.py` | 1,189 |
| 10 | `app/services/content_generator_v2.py` | 1,142 |
| 11 | `app/services/social_publisher.py` | 1,028 |
| 12 | `app/api/maestro_routes.py` | 978 |
| 13 | `app/services/evolution_engine.py` | 914 |
| 14 | `app/services/job_manager.py` | 914 |
| 15 | `app/services/analytics_service.py` | 916 |

### Frontend — Top 15 Largest Files

| Rank | File | Lines |
|-----:|------|------:|
| 1 | `src/pages/Brands.tsx` | 2,043 |
| 2 | `src/pages/Maestro.tsx` | 1,719 |
| 3 | `src/shared/components/GodAutomation.tsx` | 1,633 |
| 4 | `src/pages/Scheduled.tsx` | 1,345 |
| 5 | `src/pages/Toby.tsx` | 1,302 |
| 6 | `src/pages/PostJobDetail.tsx` | 1,273 |
| 7 | `src/pages/About.tsx` | 1,053 |
| 8 | `src/pages/JobDetail.tsx` | 991 |
| 9 | `src/pages/AITeam.tsx` | 932 |
| 10 | `src/pages/Analytics.tsx` | 796 |
| 11 | `src/pages/History.tsx` | 706 |
| 12 | `src/pages/Prompts.tsx` | 680 |
| 13 | `src/pages/Posts.tsx` | 588 |
| 14 | `src/shared/components/PostCanvas.tsx` | 553 |
| 15 | `src/pages/Connected.tsx` | 430 |

### Lines Distribution — Frontend

| Category | Lines | % |
|----------|------:|--:|
| Pages | 14,650 | 68.6% |
| Shared components | 2,698 | 12.6% |
| Feature modules | 1,556 | 7.3% |
| App shell | 475 | 2.2% |
| Types + API client | 207 | 1.0% |
| CSS | 337 | 1.6% |
| Barrel exports + glue | 72 | 0.3% |

**68.6% of the frontend lives in god-page components** — logic extraction into feature modules has significant room for growth.

---

## 7. Dependency Graph Issues

### Backend: Problematic Dependency Chains

```
maestro.py (2,485 lines)
  ├── job_manager → image_generator, video_generator, content_generator_v2, ...
  ├── generic_agent ←→ maestro (CIRCULAR)
  ├── diagnostics_engine ←→ maestro (CIRCULAR)
  ├── evolution_engine ←→ generic_agent (CIRCULAR)
  ├── metrics_collector
  ├── trend_scout
  ├── db_scheduler → youtube_routes (LAYER VIOLATION)
  │                → social_publisher
  └── maestro_examiner
```

**`maestro.py` is the hub of a tightly coupled web.** It has bidirectional dependencies with 2 services and transitive dependencies on nearly every other service. Refactoring any service requires understanding maestro.

### Backend: Service → API Inversions

```
services/analytics_service.py ──→ api/brands_routes.py (BRAND_NAME_MAP)
services/db_scheduler.py ──→ api/youtube_routes.py (credentials helpers)
services/multi_account_publisher.py ──→ api/youtube_routes.py (credentials helpers)
```

**Fix:** Move `BRAND_NAME_MAP` to `core/config.py`. Move YouTube credential helpers to `youtube_publisher.py` or a new `youtube_service.py`.

### Frontend: Architectural Direction Violations

```
shared/components/GodAutomation.tsx ──→ features/brands (INVERSION)
```

Shared code should not depend on feature modules. This creates an implicit coupling that prevents `shared/` from being truly shared.

### Frontend: Pages Bypassing Feature Layer

```
pages/Toby.tsx ──→ shared/api/client (DIRECT, no feature module)
pages/Maestro.tsx ──→ shared/api/client (DIRECT, no feature module)
pages/AITeam.tsx ──→ shared/api/client (DIRECT, no feature module)
pages/Prompts.tsx ──→ shared/api/client (DIRECT, no feature module)
```

4,633 lines of page components making direct API calls, bypassing the React Query hook pattern used by the other 6 feature modules.

---

## 8. Recommendations Summary

### Priority 1: Eliminate Crash Risks (Critical — Zero risk)

| # | Action | Impact | Risk |
|---|--------|--------|------|
| 1a | Delete `app/services/meta_api.py` (232 lines) — dead + broken import | Removes crash risk | None — zero importers |
| 1b | Delete `app/services/multi_account_publisher.py` (366 lines) — dead | Removes 366 dead lines | None — zero importers |
| 1c | Delete `app/services/content_generator.py` (707 lines) — dead v1 | Removes 707 dead lines | None — v2 aliases itself as `ContentGenerator` |
| 1d | Delete `app/services/scheduler.py` (331 lines) — dead v1 | Removes 331 dead lines | None — replaced by `db_scheduler.py` |
| 1e | Extract `toby_log()` to utility, delete rest of `toby_daemon.py` (~472 lines) | Removes dead code + broken imports | Low — toby_log() used by 2 files |
| 1f | Delete `src/pages/Carousels.tsx` (286 lines) — not in routes | Removes unreachable code | None — no route points to it |

**Total: ~2,394 lines removed, 0 risk.**

### Priority 2: Fix Architectural Violations (High impact)

| # | Action | Impact | Risk |
|---|--------|--------|------|
| 2a | Move `BRAND_NAME_MAP` from `brands_routes.py` to `core/config.py` or `brand_manager.py` | Fixes service→API import in `analytics_service.py` | Low |
| 2b | Move `get_youtube_credentials_for_brand()` and `update_youtube_channel_status()` from `youtube_routes.py` to `youtube_publisher.py` | Fixes service→API imports in `db_scheduler.py` | Low |
| 2c | Merge frontend brand configs: `PostCanvas.tsx` config → `features/brands/model/brand-config.ts` | Eliminates duplicate brand system, single source of truth | Medium — touches multiple consumers |
| 2d | Move brand imports out of `shared/components/GodAutomation.tsx` — pass via props or context | Fixes shared→feature inversion | Low |

### Priority 3: Decompose God Files (High impact, higher effort)

| # | Action | Target | Impact |
|---|--------|--------|--------|
| 3a | Split `app/api/routes.py` (2,251 lines) into domain-specific route files | `content_routes.py`, `reel_routes.py`, `schedule_routes.py`, `publish_routes.py`, etc. | Massive readability improvement |
| 3b | Extract sub-concerns from `app/services/maestro.py` (2,485 lines) | Proposal mgmt, healing logic, burst mode, state persistence | Reduces coupling |
| 3c | Decompose `src/pages/Brands.tsx` (2,043 lines, 37 useState) | Extract sub-components + custom hooks into `features/brands/` | Most impactful frontend change |
| 3d | Extract sub-components from `GodAutomation.tsx` (1,633 lines) | `BatchSelector`, `PreGenProgress`, `ReviewCard`, `CompletionSummary` → separate files | Readability |

### Priority 4: Create Missing Feature Modules (Medium impact)

| # | Action | Lines Affected |
|---|--------|---------------:|
| 4a | Create `features/toby/` — extract API + hooks from `Toby.tsx` (1,302 lines) | ~300 lines extracted |
| 4b | Create `features/maestro/` — extract API + hooks from `Maestro.tsx` (1,719 lines) | ~400 lines extracted |
| 4c | Create `features/ai-team/` — extract API + hooks from `AITeam.tsx` (932 lines) | ~200 lines extracted |
| 4d | Create `features/prompts/` — extract API + hooks from `Prompts.tsx` (680 lines) | ~150 lines extracted |
| 4e | Complete `features/settings/` — add barrel, hooks folder | ~20 lines of structure |

### Priority 5: Consolidate Legacy Systems (Medium impact)

| # | Action | Impact |
|---|--------|--------|
| 5a | Remove `app/api/brands_routes.py` entirely (after 2a moves `BRAND_NAME_MAP`) | Removes 392 lines of legacy code |
| 5b | Remove `app/database/db.py` — migrate remaining SQLite usage to PostgreSQL | Eliminates mixed DB technology |
| 5c | Audit & deprecate `app/api/toby_routes.py` — Toby concept replaced by Maestro | Removes ~339 lines of legacy endpoints |
| 5d | Extract inline HTML from `logs_routes.py` and `ai_logs_routes.py` | Separates presentation from API logic |

### Priority 6: Standardize Patterns (Long-term)

| # | Action | Impact |
|---|--------|--------|
| 6a | Replace 100+ inline `SessionLocal()` patterns with context manager (`with get_session() as db:`) | Consistency, less boilerplate |
| 6b | Refactor circular dependencies — extract shared interfaces/protocols to break cycles | Reduces lazy imports from ~140 to near-zero |
| 6c | Standardize frontend import style — always import from feature barrel exports | Consistency |
| 6d | Split `app/models.py` (1,370 lines, 17 models) by domain | Better organization |

---

*Generated from analysis of `architecture-analysis-backend.md` and `architecture-analysis-frontend.md`.*
