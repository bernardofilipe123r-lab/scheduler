# Backend Architecture Analysis Report

**Date:** 2025-02-13  
**Scope:** `app/` directory — 60 Python files, 37,747 total lines

---

## Table of Contents

1. [File Inventory](#1-file-inventory)
2. [Dependency Graph](#2-dependency-graph)
3. [Dead Code Analysis](#3-dead-code-analysis)
4. [Duplication Analysis](#4-duplication-analysis)
5. [Architecture Smells](#5-architecture-smells)
6. [Recommendations](#6-recommendations)

---

## 1. File Inventory

### File Sizes (sorted ascending)

| Lines | File | Purpose | Key Exports |
|------:|------|---------|-------------|
| 1 | `app/api/__init__.py` | Package init | — |
| 1 | `app/services/__init__.py` | Package init | — |
| 1 | `app/utils/__init__.py` | Package init | — |
| 4 | `app/database/__init__.py` | Re-exports `ReelDatabase` | `ReelDatabase` |
| 12 | `app/__init__.py` | Package root | — |
| 25 | `app/core/__init__.py` | Re-exports from `viral_patterns`, `prompt_templates`, `quality_scorer` | Various |
| 63 | `app/core/cta.py` | Call-to-action text management | `get_cta_line()`, `get_available_cta_types()` |
| 66 | `app/core/constants.py` | Global constants (dimensions, sizes) | `REEL_WIDTH`, `REEL_HEIGHT`, `POST_WIDTH`, etc. |
| 109 | `app/services/caption_builder.py` | Builds hashtag captions | `CaptionBuilder` |
| 128 | `app/utils/fonts.py` | Font loading utilities | `load_font()`, `get_title_font()`, `get_brand_font()`, `calculate_dynamic_font_size()` |
| 150 | `app/api/schemas.py` | Pydantic request/response schemas | `ReelCreateRequest`, `ReelCreateResponse`, `ErrorResponse` |
| 154 | `app/core/config.py` | Brand configuration management | `BrandType`, `BrandConfig`, `BRAND_CONFIGS`, `get_brand_config()` |
| 159 | `app/services/video_generator.py` | Creates videos from images + audio | `VideoGenerator` |
| 173 | `app/database/db.py` | Legacy SQLite database for reel history | `ReelDatabase` |
| 186 | `app/services/logging_middleware.py` | FastAPI request logging middleware | `RequestLoggingMiddleware` |
| 221 | `app/api/prompts_routes.py` | API routes for prompt management/testing | `router` |
| 231 | `app/core/brand_colors.py` | Brand color definitions and helpers | `BrandModeColors`, `BrandColorConfig`, `get_brand_colors()`, `get_brand_display_name()` |
| 232 | `app/services/meta_api.py` | Meta/Instagram publishing API client | `MetaAPIService`, `MetaAPIError` |
| 247 | `app/utils/ffmpeg.py` | FFmpeg video processing utilities | `create_video_from_image()`, `verify_ffmpeg_installation()`, `get_audio_duration()` |
| 260 | `app/utils/text_formatting.py` | Text rendering with bold/spacing support | `draw_text_with_letter_spacing()`, `parse_bold_text()`, `wrap_text_with_bold()` |
| 269 | `app/utils/text_layout.py` | Text layout/positioning for images | `wrap_text()`, `get_text_dimensions()`, `draw_text_centered()` |
| 282 | `app/services/content_differentiator.py` | Ensures content variety across brands | `ContentDifferentiator` |
| 311 | `app/api/auth_routes.py` | Authentication endpoints | `router`, `verify_auth_token()` |
| 324 | `app/services/caption_generator.py` | AI-powered caption generation | `CaptionGenerator` |
| 331 | `app/services/scheduler.py` | **LEGACY** JSON-based scheduling service | `SchedulerService` |
| 336 | `app/services/maestro_examiner.py` | AI proposal quality examiner | `examine_proposal()`, `examine_batch()` |
| 339 | `app/api/toby_routes.py` | Toby (old agent) API routes | `router` |
| 355 | `app/services/post_compositor.py` | Cover slide image composition | `compose_cover_slide()` |
| 366 | `app/services/multi_account_publisher.py` | Multi-account social publishing | `MultiAccountPublisher` |
| 377 | `app/api/analytics_routes.py` | Analytics API endpoints | `router` |
| 392 | `app/api/brands_routes.py` | **LEGACY** brand management routes (config-based) | `router`, `BRAND_NAME_MAP` |
| 416 | `app/core/viral_patterns.py` | Viral content pattern definitions | `ContentFormat`, `PsychHook`, `PatternSelector`, `PatternSelection` |
| 461 | `app/services/brand_manager.py` | Database-backed brand CRUD | `BrandManager`, `get_brand_manager()`, `seed_brands_if_needed()` |
| 465 | `app/core/quality_scorer.py` | Content quality scoring | `QualityScorer`, `QualityScore`, `quick_score()` |
| 472 | `app/api/agents_routes.py` | AI agent management API | `router` |
| 485 | `app/db_connection.py` | PostgreSQL connection, session, migrations | `init_db()`, `get_db()`, `get_db_session()`, `SessionLocal`, `run_migrations()` |
| 492 | `app/services/toby_daemon.py` | **LEGACY** Toby autonomous daemon | `TobyDaemon`, `toby_log()`, `start_toby_daemon()` |
| 523 | `app/services/logging_service.py` | Structured logging with DB persistence | `LoggingService`, `get_logging_service()`, `LogBuffer`, `DatabaseLogHandler` |
| 533 | `app/services/diagnostics_engine.py` | System health diagnostics | `DiagnosticsEngine`, `CheckResult` |
| 536 | `app/api/youtube_routes.py` | YouTube OAuth + management API | `router`, `get_youtube_credentials_for_brand()`, `update_youtube_channel_status()` |
| 545 | `app/api/settings_routes.py` | App settings CRUD API | `router`, `get_setting_value()`, `seed_settings_if_needed()` |
| 592 | `app/services/ai_background_generator.py` | AI image background generation | `AIBackgroundGenerator` |
| 614 | `app/api/brands_routes_v2.py` | Database-backed brand management API | `router` |
| 649 | `app/services/youtube_publisher.py` | YouTube Shorts publishing | `YouTubePublisher`, `YouTubeCredentials`, `YouTubeQuotaMonitor` |
| 657 | `app/services/image_generator.py` | Full image generation pipeline | `ImageGenerator` |
| 681 | `app/core/prompt_templates.py` | AI prompt template construction | `build_runtime_prompt()`, `build_post_content_prompt()`, `SYSTEM_PROMPT` |
| 689 | `app/main.py` | FastAPI app entry point, startup/shutdown | `app`, `startup_event()`, `shutdown_event()` |
| 693 | `app/services/metrics_collector.py` | Performance metrics collection from IG/Meta | `MetricsCollector`, `get_metrics_collector()` |
| 707 | `app/services/content_generator.py` | **LEGACY** v1 content generator (viral ideas-based) | `ContentGenerator`, `ContentRating` |
| 793 | `app/services/content_tracker.py` | Content history tracking + anti-repetition | `ContentTracker`, `get_content_tracker()`, `check_post_quality()` |
| 870 | `app/api/jobs_routes.py` | Job management API endpoints | `router` |
| 914 | `app/services/evolution_engine.py` | Agent evolution/mutation system | `FeedbackEngine`, `AdaptationEngine`, `SelectionEngine`, `pick_agent_name()` |
| 914 | `app/services/job_manager.py` | Job execution orchestrator | `JobManager` |
| 916 | `app/services/analytics_service.py` | Analytics data collection/processing | `AnalyticsService` |
| 978 | `app/api/maestro_routes.py` | Maestro orchestrator API | `router` |
| 1028 | `app/services/social_publisher.py` | Instagram/Facebook publishing | `SocialPublisher`, `create_facebook_caption()` |
| 1142 | `app/services/content_generator_v2.py` | v2 content generator (3-layer architecture) | `ContentGeneratorV2` (aliased as `ContentGenerator`), `ContentRating` |
| 1189 | `app/services/db_scheduler.py` | Database-backed scheduling service | `DatabaseSchedulerService` |
| 1201 | `app/services/trend_scout.py` | Trend detection and research | `TrendScout`, `get_trend_scout()` |
| 1230 | `app/services/generic_agent.py` | Generic AI agent system | `GenericAgent`, `get_all_active_agents()`, `create_agent_for_brand()`, `seed_builtin_agents()` |
| 1316 | `app/api/logs_routes.py` | Log viewer API + dashboard | `router` |
| 1370 | `app/models.py` | SQLAlchemy ORM models (17 models) | `GenerationJob`, `ScheduledReel`, `Brand`, `AIAgent`, `TobyProposal`, + 12 more |
| 1390 | `app/core/viral_ideas.py` | Database of 59 viral post templates | `VIRAL_IDEAS`, `get_random_ideas()`, `get_ideas_by_tag()` |
| 1445 | `app/api/ai_logs_routes.py` | AI agent log viewer + dashboards | `router` |
| 2251 | `app/api/routes.py` | **MONOLITH** main API routes | `router` (40+ endpoints) |
| 2485 | `app/services/maestro.py` | **MONOLITH** - Master orchestrator daemon | `MaestroDaemon`, `get_maestro()`, `start_maestro()`, `maestro_log()` |

**Total: 60 files, 37,747 lines**

---

## 2. Dependency Graph

### 2.1 Core Layer (imported by many, imports nothing internal)

| Module | Imported By (count) |
|--------|-------------------|
| `app/core/constants.py` | 6 files (image_generator, ai_background_generator, video_generator, caption_builder, fonts, ffmpeg) |
| `app/core/config.py` | 8 files (routes, schemas, image_generator, job_manager, analytics_service, db_scheduler, social_publisher, main) |
| `app/core/brand_colors.py` | 2 files (config, image_generator) |
| `app/core/viral_patterns.py` | 2 files (prompt_templates, content_generator_v2) |
| `app/core/viral_ideas.py` | 2 files (content_generator, content_generator_v2) |
| `app/core/quality_scorer.py` | 1 file (content_generator_v2) |
| `app/core/prompt_templates.py` | 2 files (content_generator_v2, prompts_routes) |
| `app/core/cta.py` | 1 file (image_generator) |

### 2.2 Database Layer

| Module | Imported By (count) |
|--------|-------------------|
| `app/models.py` | 25+ files (nearly every service and API route) |
| `app/db_connection.py` | 25+ files (nearly every service and API route) |
| `app/database/db.py` | 1 file (routes.py — legacy SQLite) |

### 2.3 Service Layer — Who Imports Whom

| Service | Internal Imports FROM | Imported BY |
|---------|---------------------|-------------|
| `maestro.py` | job_manager, generic_agent, metrics_collector, trend_scout, evolution_engine, diagnostics_engine, db_scheduler, maestro_examiner, content_tracker | maestro_routes, diagnostics_engine |
| `generic_agent.py` | content_tracker, metrics_collector, trend_scout, evolution_engine, maestro, brand_manager | maestro, agents_routes, brands_routes_v2, maestro_routes |
| `trend_scout.py` | toby_daemon (toby_log only) | maestro, generic_agent, toby_routes, maestro_routes |
| `metrics_collector.py` | toby_daemon (toby_log only) | maestro, generic_agent, toby_routes, maestro_routes |
| `evolution_engine.py` | brand_manager, generic_agent | maestro, generic_agent, agents_routes |
| `job_manager.py` | image_generator, video_generator, content_differentiator, caption_generator, ai_background_generator, content_generator_v2 | maestro, jobs_routes, maestro_routes |
| `content_tracker.py` | — | content_generator_v2, generic_agent, maestro_routes, toby_routes |
| `db_scheduler.py` | social_publisher, youtube_publisher, youtube_routes (API!) | routes, maestro, main, jobs_routes |
| `social_publisher.py` | config | db_scheduler, scheduler, multi_account_publisher |
| `image_generator.py` | ai_background_generator, config, brand_colors, constants, fonts, text_layout, text_formatting, cta | job_manager |
| `analytics_service.py` | brands_routes (API!), models, config | analytics_routes, main |
| `brand_manager.py` | generic_agent, evolution_engine | brands_routes_v2, maestro, main |
| `content_generator_v2.py` | viral_patterns, prompt_templates, quality_scorer, content_tracker, viral_ideas | routes, job_manager |
| `diagnostics_engine.py` | maestro | agents_routes, maestro |
| `logging_service.py` | db_connection, models | main, logs_routes, logging_middleware |
| `maestro_examiner.py` | — | maestro |
| `toby_daemon.py` | toby_agent (MISSING!), maestro, metrics_collector, trend_scout | trend_scout (toby_log), metrics_collector (toby_log) |

### 2.4 API Layer — Dependencies

| API Route File | Service Imports |
|---------------|----------------|
| `routes.py` (2251 lines) | image_generator, video_generator, caption_builder, caption_generator, content_generator_v2, db_scheduler, social_publisher, ai_background_generator, database/db |
| `maestro_routes.py` | maestro, job_manager, content_tracker, generic_agent, metrics_collector, trend_scout, db_scheduler |
| `jobs_routes.py` | job_manager, db_scheduler, maestro |
| `agents_routes.py` | generic_agent, evolution_engine, diagnostics_engine |
| `brands_routes_v2.py` | brand_manager, generic_agent |
| `analytics_routes.py` | analytics_service |
| `youtube_routes.py` | youtube_publisher |
| `logs_routes.py` | logging_service |
| `settings_routes.py` | — (uses models directly) |
| `auth_routes.py` | — (uses models directly) |
| `toby_routes.py` | content_tracker, metrics_collector, trend_scout |
| `ai_logs_routes.py` | maestro |
| `prompts_routes.py` | ai_background_generator, prompt_templates |
| `brands_routes.py` | config (legacy) |

---

## 3. Dead Code Analysis

### 3.1 Completely Dead Files (0 external references)

| File | Lines | Evidence | Verdict |
|------|------:|----------|---------|
| **`app/services/multi_account_publisher.py`** | 366 | `MultiAccountPublisher` is never imported. Zero references outside its own file. | **DEAD — safe to remove** |
| **`app/services/meta_api.py`** | 232 | `MetaAPIService` and `MetaAPIError` are never imported. Also has a **broken import** (`from app.core.logger import get_logger` — `app/core/logger.py` does not exist). | **DEAD — broken & safe to remove** |

### 3.2 Mostly Dead Files

| File | Lines | Status | Details |
|------|------:|--------|---------|
| **`app/services/toby_daemon.py`** | 492 | ~90% dead | Only `toby_log()` function (20 lines) is used externally. `TobyDaemon` class (317 lines), `TobyState` class, `start_toby_daemon()`, `get_toby_daemon()` are all dead. Also has **broken imports** to `app.services.toby_agent` which does not exist. |
| **`app/services/scheduler.py`** | 331 | 100% dead | `SchedulerService` is never imported. Replaced by `DatabaseSchedulerService` in `db_scheduler.py`. |
| **`app/services/content_generator.py`** | 707 | 100% dead | The v1 `ContentGenerator` class is never imported. `content_generator_v2.py` aliases `ContentGeneratorV2` as `ContentGenerator` at line 1045, and all imports use v2. |
| **`app/database/db.py`** | 173 | Legacy, minimally used | SQLite-based `ReelDatabase` only used in `routes.py` for legacy status/history tracking. The main app uses PostgreSQL via `db_connection.py`. |

### 3.3 Legacy/Duplicate Route Files

| File | Lines | Status | Details |
|------|------:|--------|---------|
| **`app/api/brands_routes.py`** | 392 | Partially legacy | Registered as legacy routes in `main.py`. Still actively needed because `BRAND_NAME_MAP` is imported by `analytics_service.py`. Route endpoints may be duplicated with `brands_routes_v2.py`. |
| **`app/api/routes.py`** | 2251 | Active but monolithic | The main API router. Contains 40+ endpoints mixing concerns: content generation, reel creation, scheduling, publishing, user management, cleaning utilities. |
| **`app/api/toby_routes.py`** | 339 | Partially legacy | Routes reference Toby but the underlying daemon is dead. Some endpoints still work by querying database directly. |

### 3.4 Broken Imports

| File | Line | Import | Issue |
|------|------|--------|-------|
| `app/services/meta_api.py` | 9 | `from app.core.logger import get_logger` | `app/core/logger.py` does not exist |
| `app/services/toby_daemon.py` | 273 | `from app.services.toby_agent import get_toby_agent` | `app/services/toby_agent.py` does not exist |
| `app/services/toby_daemon.py` | 278 | `from app.services.toby_agent import MAX_PROPOSALS_PER_DAY` | `app/services/toby_agent.py` does not exist |

### 3.5 Dead Code Summary

| Category | Files | Lines |
|----------|------:|------:|
| Completely dead files | 3 | 1,270 |
| Mostly dead (>80%) | 1 | ~400 |
| Legacy with some living code | 3 | ~960 |
| **Total removable dead code** | — | **~2,630 lines (7% of codebase)** |

---

## 4. Duplication Analysis

### 4.1 V1/V2 File Pairs

| V1 File (lines) | V2 File (lines) | Status |
|-----------------|-----------------|--------|
| `content_generator.py` (707) | `content_generator_v2.py` (1142) | V1 is 100% dead. V2 aliases `ContentGenerator = ContentGeneratorV2`. Both define `ContentRating`. |
| `scheduler.py` (331) | `db_scheduler.py` (1189) | V1 is 100% dead. All code uses `DatabaseSchedulerService`. |
| `brands_routes.py` (392) | `brands_routes_v2.py` (614) | Both active. V1 has `BRAND_NAME_MAP` still imported by `analytics_service.py`. Likely overlapping endpoints. |

### 4.2 Duplicated Patterns

#### Database Session Management — No Consistent Pattern
There are two patterns used interchangeably throughout the codebase:

**Pattern A: FastAPI dependency injection** (API routes)
```python
def endpoint(db: Session = Depends(get_db)):
```

**Pattern B: Inline SessionLocal** (services — 100+ occurrences)
```python
from app.db_connection import SessionLocal
db = SessionLocal()
try:
    # work
finally:
    db.close()
```

Worst offenders:
- `maestro.py`: 24 inline `SessionLocal` usages
- `diagnostics_engine.py`: 20 inline usages
- `trend_scout.py`: 20 inline usages
- `generic_agent.py`: 16 inline usages
- `metrics_collector.py`: 12 inline usages

#### Duplicated Classes
- `ContentRating` defined in both `content_generator.py:614` AND `content_generator_v2.py:1052`
- `_format_uptime()` function defined in both `toby_daemon.py:109` AND `maestro.py:434`
- `BRAND_NAME_MAP` in `brands_routes.py` duplicates brand mapping logic that exists in `BrandManager`

### 4.3 Toby → Maestro Pattern Duplication
`toby_daemon.py` and `maestro.py` share significant structural similarity:
- Both have a `State` class (`TobyState` / `MaestroState`)
- Both have a daemon class with autonomous loop
- Both have `_format_uptime()` helper (identical)
- Both have `log()` functions
- Maestro fully superseded Toby

---

## 5. Architecture Smells

### 5.1 God Files (>500 lines, mixed responsibilities)

| File | Lines | Responsibilities Mixed |
|------|------:|----------------------|
| **`app/services/maestro.py`** | **2,485** | Orchestration loop, agent management, job scheduling, proposal management, healing, metrics collection, evolution triggers, burst mode, trend scouting triggers, DB state persistence. **The biggest God object in the codebase.** |
| **`app/api/routes.py`** | **2,251** | Content generation, reel creation, scheduling, publishing, user management, slot cleaning, analytics, rejection feedback. **40+ endpoints — should be split.** |
| **`app/api/ai_logs_routes.py`** | **1,445** | Log querying + full HTML dashboard rendering inline. |
| **`app/core/viral_ideas.py`** | **1,390** | Pure data file (59 viral post templates). Size is inherent. |
| **`app/models.py`** | **1,370** | 17 SQLAlchemy models in one file. Could be split by domain. |
| **`app/api/logs_routes.py`** | **1,316** | Log querying + HTML dashboard rendering inline. |
| **`app/services/generic_agent.py`** | **1,230** | Agent loading, caching, creation, mutation, proposal generation, learning — too many concerns. |
| **`app/services/trend_scout.py`** | **1,201** | Trend detection, platform scraping, caching, scoring — acceptable for domain scope. |
| **`app/services/db_scheduler.py`** | **1,189** | Scheduling, publishing orchestration, YouTube publishing, slot management. |
| **`app/services/content_generator_v2.py`** | **1,142** | Content generation + quality loop + rating — acceptable for domain scope. |
| **`app/services/social_publisher.py`** | **1,028** | Instagram + Facebook publishing, caption formatting, error handling. |

### 5.2 Inverted Dependencies (Services importing from API layer)

This is a serious architectural violation. The service layer should NEVER import from the API layer.

| Service | Imports From API | What It Imports |
|---------|-----------------|-----------------|
| **`app/services/analytics_service.py`** | `app.api.brands_routes` | `BRAND_NAME_MAP` |
| **`app/services/db_scheduler.py`** | `app.api.youtube_routes` | `get_youtube_credentials_for_brand`, `update_youtube_channel_status` |
| **`app/services/multi_account_publisher.py`** | `app.api.youtube_routes` | `get_youtube_credentials_for_brand`, `update_youtube_channel_status` |

**Fix:** Move `BRAND_NAME_MAP` to `core/config.py` or `brand_manager.py`. Move YouTube credential helpers to a service.

### 5.3 Circular/Tangled Dependencies

Several service files have bidirectional dependencies (resolved by lazy imports):

```
maestro.py ←→ generic_agent.py  (maestro imports generic_agent; generic_agent imports maestro)
maestro.py ←→ diagnostics_engine.py  (mutual imports)
evolution_engine.py ←→ generic_agent.py  (mutual imports)
evolution_engine.py ←→ brand_manager.py  (mutual imports)
```

These are all resolved via **lazy imports** (importing inside function bodies), which prevents runtime errors but indicates tight coupling.

### 5.4 Excessive Lazy Imports

Many files use function-level imports extensively. While this prevents circular import crashes, it makes dependencies invisible and is a code smell:

| File | Lazy Import Count |
|------|------------------:|
| `maestro.py` | ~40 |
| `diagnostics_engine.py` | ~20 |
| `generic_agent.py` | ~16 |
| `trend_scout.py` | ~20 |
| `metrics_collector.py` | ~12 |
| `evolution_engine.py` | ~10 |
| `maestro_routes.py` | ~25 |

### 5.5 HTML in Python

Both `logs_routes.py` (1,316 lines) and `ai_logs_routes.py` (1,445 lines) contain inline HTML template rendering. This mixes presentation with API logic and inflates file sizes.

### 5.6 Mixed Database Technologies

- **PostgreSQL** via SQLAlchemy (`db_connection.py`, `models.py`) — primary database
- **SQLite** via raw `sqlite3` (`database/db.py`) — legacy `ReelDatabase`
- **JSON file** (`output/scheduled.json`) — legacy `SchedulerService`

---

## 6. Recommendations

### Priority 1: Remove Dead Code (Quick Wins)

| Action | Files | Lines Saved |
|--------|------:|------------:|
| Delete `app/services/content_generator.py` | 1 | 707 |
| Delete `app/services/scheduler.py` | 1 | 331 |
| Delete `app/services/meta_api.py` | 1 | 232 |
| Delete `app/services/multi_account_publisher.py` | 1 | 366 |
| Extract `toby_log()` to a utility, delete rest of `toby_daemon.py` | 1 | ~470 |
| **Total** | **5** | **~2,106** |

### Priority 2: Fix Architectural Violations

1. **Move `BRAND_NAME_MAP`** from `brands_routes.py` to `core/config.py` or `brand_manager.py` — eliminates service→API import in `analytics_service.py`
2. **Move `get_youtube_credentials_for_brand()` and `update_youtube_channel_status()`** from `youtube_routes.py` to a new `youtube_service.py` or into `youtube_publisher.py` — eliminates service→API imports in `db_scheduler.py` and `multi_account_publisher.py`
3. **Fix broken imports** in `meta_api.py` (logger) and `toby_daemon.py` (toby_agent) — these will crash at runtime if their code paths are hit

### Priority 3: Split God Files

1. **`app/api/routes.py` (2,251 lines)** → Split into:
   - `content_routes.py` — content generation endpoints
   - `reel_routes.py` — reel creation/management
   - `schedule_routes.py` — scheduling endpoints
   - `publish_routes.py` — publishing endpoints
   - `user_routes.py` — user management
   - `utility_routes.py` — slot cleaning, status

2. **`app/services/maestro.py` (2,485 lines)** → Consider extracting:
   - Proposal management
   - Healing/recovery logic
   - Burst mode logic
   - State persistence

### Priority 4: Consolidate Legacy

1. **Remove `brands_routes.py`** after moving `BRAND_NAME_MAP` — use only v2 routes
2. **Remove `database/db.py`** (SQLite `ReelDatabase`) — migrate any remaining functionality to PostgreSQL
3. **Merge or deprecate `toby_routes.py`** — Toby concept replaced by Maestro

### Priority 5: Standardize Patterns

1. **Database session management** — Replace 100+ inline `SessionLocal()` patterns with either:
   - Context manager: `with get_session() as db:`
   - Or pass session as parameter from the API layer
2. **Reduce lazy imports** — Refactor circular dependencies by extracting shared interfaces/protocols

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Python files | 60 |
| Total lines of code | 37,747 |
| Dead code (removable) | ~2,630 lines (7%) |
| God files (>500 lines) | 11 files |
| Broken imports | 3 |
| Service→API violations | 3 |
| Circular dependencies | 4 pairs |
| Files with 10+ lazy imports | 7 |
| Largest file | `maestro.py` (2,485 lines) |
| Smallest meaningful file | `cta.py` (63 lines) |
| SQLAlchemy models | 17 |
