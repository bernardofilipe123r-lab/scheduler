# Architecture Migration Plan

**Date:** 2026-02-13  
**Source:** `architecture-analysis.md`, `architecture-analysis-backend.md`, `architecture-analysis-frontend.md`  
**Codebase:** 136 files, 59,113 lines (37,747 backend + 21,366 frontend)

---

## Guiding Principles

1. **Each phase is independently committable** — the app works after every phase
2. **Phases must be done in order** — later phases depend on earlier ones
3. **All tests must pass after each phase** — `test_content_logic.py`, `test_phase2.py`, `test_v2_architecture.py`, `tests/`
4. **No business logic changes** — only structural moves, deletions, and splits
5. **When in doubt, don't move it** — safety over cleanliness

---

## Phase 0: Dead Code Purge (Zero Risk)

**Risk:** ZERO — these files have no importers  
**Goal:** Remove ~2,400 lines of unreachable code and fix 3 broken imports  
**Estimated scope:** 8 files deleted/gutted, 3 files with import fixes

### 0A. Files to DELETE entirely

| # | File | Lines | Evidence it's dead |
|---|------|------:|-------------------|
| 1 | `app/services/content_generator.py` | 707 | v1 generator. `content_generator_v2.py` line 1045 aliases `ContentGenerator = ContentGeneratorV2`. Every import of `ContentGenerator` comes from `content_generator_v2` (verified: `routes.py:20`, `job_manager.py:635`). Zero imports of `content_generator.py` itself. |
| 2 | `app/services/scheduler.py` | 331 | JSON-based `SchedulerService`. Fully replaced by `DatabaseSchedulerService` in `db_scheduler.py`. Zero external imports. |
| 3 | `app/services/meta_api.py` | 232 | `MetaAPIService` and `MetaAPIError` never imported anywhere. Also has broken import: `from app.core.logger import get_logger` — `app/core/logger.py` does not exist. |
| 4 | `app/services/multi_account_publisher.py` | 366 | `MultiAccountPublisher` never imported anywhere. Zero external references. Also has layer violation (imports from `youtube_routes`) — moot since dead. |
| 5 | `src/pages/Carousels.tsx` | 286 | `CarouselsPage` not in route definitions (`src/app/routes/index.tsx`), not in barrel export (`src/pages/index.ts`), not imported by any file. Completely unreachable. |
| — | **Total** | **1,922** | |

### 0B. File to GUT: `app/services/toby_daemon.py`

**Current state:** 492 lines. Only `toby_log()` (line 465, ~20 lines) is imported externally.

**Consumers of `toby_log()`:**
- `app/services/metrics_collector.py` — 5 lazy imports (lines 102, 176, 257, 379, 387)
- `app/services/trend_scout.py` — 14 lazy imports (lines 177, 255, 333, 395, 410, 463, 484, 563, 600, 659, 689, 937, 999, 1082)

**What `toby_log()` does:** Redirects to `maestro_log()`. Falls back to print. 6 lines of actual logic.

**Action:**
1. Replace `app/services/toby_daemon.py` (492 lines) with just the `toby_log()` function (~15 lines including imports and docstring)
2. Remove `TobyDaemon`, `TobyState`, `start_toby_daemon()`, `get_toby_daemon()`, `_format_uptime()`, all broken imports to `toby_agent`
3. No changes needed in `metrics_collector.py` or `trend_scout.py` — they import `toby_log` from `app.services.toby_daemon`, which still exists

**Result:** ~472 dead lines removed, 2 broken imports eliminated. Import path stays the same.

**New `toby_daemon.py` contents (entire file):**
```python
"""
Toby compatibility — redirects toby_log() to Maestro's unified log.

All other TobyDaemon functionality has been removed (replaced by MaestroDaemon).
"""


def toby_log(action: str, detail: str = "", emoji: str = "🤖", level: str = "detail"):
    """Log to Maestro's activity feed. Legacy bridge kept for metrics_collector and trend_scout."""
    try:
        from app.services.maestro import maestro_log
        maestro_log("toby", action, detail, emoji, level)
    except Exception:
        print(f"   [TOBY-LOG] {action} — {detail}", flush=True)
```

### 0C. Clean up live files

| # | File | What to remove | Why |
|---|------|---------------|-----|
| 1 | `app/services/content_generator_v2.py` | Line 1045: `ContentGenerator = ContentGeneratorV2` | Alias referenced the deleted v1. After Phase 0A, all importers already use `from content_generator_v2 import ContentGenerator` — the alias still works, but rename it to be clear. **Actually: KEEP this alias.** It's imported by `routes.py:20` and `job_manager.py:635`. The alias is live. No change needed here. |
| 2 | `src/pages/index.ts` | No `CarouselsPage` export exists | Already clean — verified. No change needed. |

### 0D. Broken imports fixed by Phase 0

| Broken Import | Location | Fixed By |
|--------------|----------|----------|
| `from app.core.logger import get_logger` | `meta_api.py:9` | Deleting `meta_api.py` (0A-3) |
| `from app.services.toby_agent import get_toby_agent` | `toby_daemon.py:273` | Gutting `toby_daemon.py` (0B) |
| `from app.services.toby_agent import MAX_PROPOSALS_PER_DAY` | `toby_daemon.py:278` | Gutting `toby_daemon.py` (0B) |

### Phase 0 Verification

```bash
# 1. Verify no imports of deleted files
grep -rn "from app.services.content_generator import\|from app.services.scheduler import\|from app.services.meta_api import\|from app.services.multi_account_publisher import" app/

# 2. Verify toby_log still importable
python -c "from app.services.toby_daemon import toby_log; print('OK')"

# 3. Verify no references to Carousels
grep -rn "Carousels\|CarouselsPage" src/ --include="*.ts" --include="*.tsx"

# 4. Run tests
python -m pytest tests/ test_content_logic.py test_phase2.py test_v2_architecture.py -v

# 5. Start the app and verify it loads
python start.py  # Should start without import errors
```

### Phase 0 Summary

| Metric | Count |
|--------|------:|
| Files deleted | 5 |
| Files gutted | 1 |
| Lines removed | ~2,394 |
| Broken imports fixed | 3 |
| Files with import changes | 0 |
| Risk | **ZERO** |

---

## Phase 1: Fix Layer Violations (Low Risk)

**Risk:** LOW — moving functions between modules, updating import paths  
**Goal:** Eliminate 3 service→API import violations  
**Estimated scope:** 5 files modified

### 1A. Move `BRAND_NAME_MAP` from API to core layer

**Current violation:** `app/services/analytics_service.py` line 21 imports `BRAND_NAME_MAP` from `app/api/brands_routes.py` line 31.

**Action:**
1. Move `BRAND_NAME_MAP` dict from `app/api/brands_routes.py:31-39` to `app/core/constants.py`
2. Also move `VALID_BRANDS` (line 40) since it derives from `BRAND_NAME_MAP`
3. Update `app/services/analytics_service.py:21`: change `from app.api.brands_routes import BRAND_NAME_MAP` → `from app.core.constants import BRAND_NAME_MAP`
4. Update `app/api/brands_routes.py`: change to `from app.core.constants import BRAND_NAME_MAP, VALID_BRANDS` (it still uses these internally)

**Files affected:**
| File | Change |
|------|--------|
| `app/core/constants.py` | Add `BRAND_NAME_MAP` and `VALID_BRANDS` |
| `app/api/brands_routes.py` | Remove definition, add import from `core.constants` |
| `app/services/analytics_service.py` | Change import path |

### 1B. Move YouTube credential helpers from API to service layer

**Current violation:** `app/services/db_scheduler.py` line 765 imports `get_youtube_credentials_for_brand` and `update_youtube_channel_status` from `app/api/youtube_routes.py`.

**Complication:** There's already a different `get_youtube_credentials_for_brand` in `app/services/youtube_publisher.py:622` with a different signature (no `db` parameter). The version in `youtube_routes.py:476` takes `(brand: str, db: Session)`.

**Action:**
1. Move `get_youtube_credentials_for_brand(brand, db)` from `app/api/youtube_routes.py:476` to `app/services/youtube_publisher.py` (rename existing one or reconcile)
2. Move `update_youtube_channel_status(...)` from `app/api/youtube_routes.py:505` to `app/services/youtube_publisher.py`
3. Update `app/services/db_scheduler.py:765`: change import to `from app.services.youtube_publisher import ...`
4. Update `app/api/youtube_routes.py`: import back from `youtube_publisher` where it still needs these functions for route handlers
5. The dead `multi_account_publisher.py` is already deleted in Phase 0, so no update needed there

**Files affected:**
| File | Change |
|------|--------|
| `app/services/youtube_publisher.py` | Receive functions, reconcile duplicate |
| `app/api/youtube_routes.py` | Remove function definitions, add imports from service |
| `app/services/db_scheduler.py` | Change import path |

### 1C. Fix `GodAutomation.tsx` shared→feature violation

**Current violation:** `src/shared/components/GodAutomation.tsx:56` imports `getBrandLabel`, `getBrandColor` from `@/features/brands`. Shared code must not depend on feature modules.

**Action:** Pass `getBrandLabel` and `getBrandColor` as props to `GodAutomation` from the pages that use it, instead of importing directly.

**Files affected:**
| File | Change |
|------|--------|
| `src/shared/components/GodAutomation.tsx` | Remove import from `@/features/brands`, accept via props |
| Pages that use `GodAutomation` | Pass `getBrandLabel`, `getBrandColor` as props |

### Phase 1 Verification

```bash
# 1. Verify no service→API imports remain
grep -rn "from app.api" app/services/ --include="*.py"
# Should return ZERO results

# 2. Verify no shared→features imports
grep -rn "from.*@/features" src/shared/ --include="*.ts" --include="*.tsx"
# Should return ZERO results

# 3. Run tests
python -m pytest tests/ test_content_logic.py test_phase2.py test_v2_architecture.py -v

# 4. Typecheck frontend
npx tsc --noEmit

# 5. Start app + verify API responds
python start.py
```

### Phase 1 Summary

| Metric | Count |
|--------|------:|
| Files modified | ~7 |
| Lines moved | ~80 |
| Layer violations fixed | 3 (2 backend, 1 frontend) |
| Risk | **LOW** |

---

## Phase 2: Split God Files — Backend (Medium Risk)

**Risk:** MEDIUM — splitting files requires careful handling of internal function calls  
**Goal:** Break down the 3 worst backend monoliths  
**Estimated scope:** 3 files split → ~8 new files, 5-10 files with import updates

### 2A. Split `app/api/routes.py` (2,251 lines → thin router)

The existing route files (`brands_routes.py`, `jobs_routes.py`, `maestro_routes.py`, etc.) already handle many domains. `routes.py` contains the remaining ~37 endpoints that never got extracted.

**Proposed split:**

| New File | Endpoints (from routes.py) | Approx Lines |
|----------|---------------------------|-------------:|
| `app/api/content_routes.py` | `/generate-content`, `/generate-viral-content`, `/generate-trending-content`, `/generate-post-content`, `/generate-carousel-content`, `/generate-ai-background`, `/generate-ai-prompt` | ~500 |
| `app/api/reel_routes.py` | `/create-reel`, `/create-vertical-reel`, `/create-from-generated` | ~300 |
| `app/api/schedule_routes.py` | `/scheduled` (GET), `/scheduled/{id}` (DELETE), `/scheduled/bulk/*`, `/scheduled/{id}/retry`, `/scheduled/{id}/reschedule`, `/scheduled/{id}/publish-now`, `/next-slot/*`, `/next-slots`, `/schedule-post-image`, `/scheduled/occupied-post-slots`, `/scheduled/clean-reel-slots`, `/scheduled/clean-post-slots` | ~900 |
| `app/api/publish_routes.py` | `/publish` | ~100 |
| `app/api/user_routes.py` | `/users` (POST), `/users/{id}` (GET) | ~60 |
| `app/api/feedback_routes.py` | `/rejection-feedback` (POST, GET) | ~70 |
| `app/api/status_routes.py` | `/status`, `/history`, `/generation/{id}` | ~80 |
| `routes.py` (remaining) | Router assembly — imports and mounts all sub-routers | ~50 |

**Approach:**
1. Create each new route file with its own `router = APIRouter()`
2. Move endpoint functions + their local helpers
3. Move relevant imports with each endpoint
4. Keep `routes.py` as a thin aggregator that imports and includes all sub-routers
5. Update `app/main.py` if it mounts `routes.router` directly (it likely does) — may need to mount individual routers or keep the single mount point

**Internal dependencies to watch:**
- Shared instances: `content_generator`, `image_generator`, etc. are instantiated at module level in `routes.py`. Move instantiation to each new file or to a shared `services/__init__.py`.
- `ReelDatabase` (legacy SQLite) usage — only exists in status/history endpoints

**Files affected:**
| File | Change |
|------|--------|
| `app/api/routes.py` | Reduced to ~50-line router aggregator |
| `app/api/content_routes.py` | **NEW** — content generation endpoints |
| `app/api/reel_routes.py` | **NEW** — reel creation endpoints |
| `app/api/schedule_routes.py` | **NEW** — scheduling endpoints |
| `app/api/publish_routes.py` | **NEW** — publishing endpoint |
| `app/api/user_routes.py` | **NEW** — user management |
| `app/api/feedback_routes.py` | **NEW** — rejection feedback |
| `app/api/status_routes.py` | **NEW** — status/history/generation detail |
| `app/main.py` | May need import updates |

### 2B. Split `app/services/maestro.py` (2,485 lines)

This is the most complex split. `MaestroDaemon` has many internal method calls, shared state, and circular dependencies with `generic_agent.py` and `diagnostics_engine.py`.

**Proposed split by logical concern:**

| New File | Functions/Methods | Approx Lines |
|----------|-------------------|-------------:|
| `app/services/maestro_state.py` | `MaestroState`, `AgentState`, `_db_get()`, `_db_set()`, `is_paused()`, `set_paused()`, `is_posts_paused()`, `set_posts_paused()`, `get_last_daily_run()`, `set_last_daily_run()`, `_get_all_brands()` | ~200 |
| `app/services/maestro_scheduler_logic.py` | `auto_schedule_job()`, `schedule_all_ready_reels()`, `_run_daily_burst()`, `run_smart_burst()`, `trigger_burst_now()` | ~400 |
| `app/services/maestro_healing.py` | `_healing_cycle()`, `_diagnose_failure()`, `_get_retry_count()`, `_retry_failed_job()` | ~350 |
| `app/services/maestro_cycles.py` | `_observe_cycle()`, `_scout_cycle()`, `_bootstrap_cycle()`, `_stop_bootstrap_scheduler()`, `_feedback_cycle()`, `_evolution_cycle()`, `_diagnostics_cycle()` | ~600 |
| `app/services/maestro_proposals.py` | `_auto_accept_and_process()`, `_examine_and_process_single()`, `_create_and_dispatch_job()`, `_regenerate_replacement()`, `_process_and_schedule_job()` | ~400 |
| `app/services/maestro.py` (reduced) | `MaestroDaemon.__init__()`, `start()`, `get_status()`, `_refresh_agent_counts()`, `_check_cycle()`, `get_maestro()`, `maestro_log()`, `start_maestro()`, `_format_uptime()`, `_time_ago()` | ~500 |

**Key challenges:**
- `MaestroDaemon` methods reference `self.state` extensively — extracted cycle methods need `self` or the daemon instance passed in
- Approach: Extract as **methods on the MaestroDaemon class using mixins** or as **standalone functions that take the daemon/state as a parameter**
- Recommended approach: **Standalone functions** that receive needed state/services. The daemon calls them.
- Circular deps with `generic_agent.py` and `diagnostics_engine.py` already use lazy imports — keep that pattern in extracted files

**Files affected:**
| File | Change |
|------|--------|
| `app/services/maestro.py` | Reduced to ~500 lines |
| `app/services/maestro_state.py` | **NEW** — state management |
| `app/services/maestro_scheduler_logic.py` | **NEW** — burst/scheduling |
| `app/services/maestro_healing.py` | **NEW** — self-healing |
| `app/services/maestro_cycles.py` | **NEW** — background cycles |
| `app/services/maestro_proposals.py` | **NEW** — proposal pipeline |
| `app/api/maestro_routes.py` | Update imports (currently imports from `maestro`) |

### 2C. Split `app/services/job_manager.py` (914 lines)

**Proposed split:**

| New File | Content | Approx Lines |
|----------|---------|-------------:|
| `app/services/job_manager.py` (reduced) | `JobManager` class with `create_job()`, `get_job()`, `list_jobs()`, `delete_job()` — job CRUD | ~350 |
| `app/services/job_processor.py` | `process_job()` and its sub-functions — the heavy processing pipeline | ~550 |

**Key point:** `process_job` is the core function that orchestrates image generation, video creation, content generation. It's called by `maestro.py` and `jobs_routes.py`. The split point is clean: creation vs. processing.

**Files affected:**
| File | Change |
|------|--------|
| `app/services/job_manager.py` | Reduced — CRUD only |
| `app/services/job_processor.py` | **NEW** — job processing pipeline |
| `app/services/maestro.py` | Update imports for `process_job` |
| `app/api/jobs_routes.py` | Update imports for `process_job` |

### Phase 2 Verification

```bash
# 1. Verify all route endpoints still exist
python -c "
from app.main import app
routes = [r.path for r in app.routes]
print(f'{len(routes)} routes registered')
# Compare with pre-split count
"

# 2. Verify maestro starts
python -c "from app.services.maestro import MaestroDaemon, get_maestro, maestro_log; print('OK')"

# 3. Verify job processing
python -c "from app.services.job_manager import JobManager; print('OK')"

# 4. Run full test suite
python -m pytest tests/ test_content_logic.py test_phase2.py test_v2_architecture.py -v

# 5. Start app and exercise key flows
python start.py
# Test: content generation, job creation, maestro status
```

### Phase 2 Summary

| Metric | Count |
|--------|------:|
| Files split | 3 |
| New files created | ~13 |
| Files with import updates | ~8 |
| Lines of code moved | ~4,500 (no lines added or removed) |
| Risk | **MEDIUM** |

---

## Phase 3: Split God Files — Frontend (Medium Risk)

**Risk:** MEDIUM — React component extraction requires careful prop threading  
**Goal:** Break down the 6 worst frontend god components  
**Estimated scope:** 6 files split → ~24 new files

### 3A. Decompose `src/shared/components/GodAutomation.tsx` (1,633 lines)

**Identified sub-components defined inline:**
- `BatchSelector` — batch size/brand selection UI
- `PreGenProgress` — progress indicator during generation
- `ReviewCard` — Tinder-style swipe card for reviewing content
- `CompletionSummary` — summary after batch review

**Proposed structure:**
```
src/shared/components/
├── GodAutomation/
│   ├── index.tsx              # Main orchestrator (reduced ~400 lines)
│   ├── BatchSelector.tsx      # ~200 lines
│   ├── PreGenProgress.tsx     # ~150 lines
│   ├── ReviewCard.tsx         # ~400 lines
│   ├── CompletionSummary.tsx  # ~200 lines
│   └── types.ts               # Shared interfaces/types
└── GodAutomation.tsx          # DELETE after extraction, or keep as re-export
```

**Approach:**
1. Identify shared state → lift into main component, pass as props
2. Extract each sub-component with explicit prop interfaces
3. Move API calls that are specific to batch generation into the main component
4. Keep the barrel export at `@/shared/components/GodAutomation` working

### 3B. Decompose `src/pages/Brands.tsx` (2,043 lines, 37 useState)

The worst frontend file. Contains CRUD logic, theme editor, color picker, preview, form validation — all with 37 state variables.

**Proposed structure:**
```
src/features/brands/
├── components/
│   ├── BrandBadge.tsx         # Already exists
│   ├── BrandList.tsx          # NEW — brand list/grid view (~300 lines)
│   ├── BrandEditor.tsx        # NEW — brand create/edit form (~400 lines)
│   ├── ThemeEditor.tsx        # NEW — theme/color picker (~300 lines)
│   ├── BrandPreview.tsx       # NEW — brand preview card (~200 lines)
│   └── index.ts               # Updated barrel
├── hooks/
│   ├── use-brand-form.ts      # NEW — form state management (~200 lines)
│   └── index.ts               # Updated barrel
└── ...existing files...

src/pages/Brands.tsx           # Reduced to ~400 lines — layout + composition
```

**Approach:**
1. Group the 37 `useState` calls by concern → create custom hooks
2. Extract visual sections into sub-components
3. Move brand-specific API calls into `features/brands/api/` (extend existing)
4. Page becomes a thin composition shell

### 3C. Create feature modules for pages with inline API logic

Four pages (4,633 lines combined) bypass the feature layer. Each needs a feature module.

#### `features/maestro/` (from `Maestro.tsx` — 1,719 lines)
```
src/features/maestro/
├── api/
│   ├── maestro-api.ts         # ~150 lines — API functions
│   └── index.ts
├── hooks/
│   ├── use-maestro.ts         # ~200 lines — React Query hooks
│   └── index.ts
└── index.ts

src/pages/Maestro.tsx          # Reduced to ~1,000 lines (still large, but API logic extracted)
```

#### `features/toby/` (from `Toby.tsx` — 1,302 lines)
```
src/features/toby/
├── api/
│   ├── toby-api.ts            # ~120 lines
│   └── index.ts
├── hooks/
│   ├── use-toby.ts            # ~180 lines
│   └── index.ts
└── index.ts

src/pages/Toby.tsx             # Reduced to ~800 lines
```

#### `features/ai-team/` (from `AITeam.tsx` — 932 lines)
```
src/features/ai-team/
├── api/
│   ├── ai-team-api.ts         # ~100 lines
│   └── index.ts
├── hooks/
│   ├── use-ai-team.ts         # ~120 lines
│   └── index.ts
└── index.ts

src/pages/AITeam.tsx           # Reduced to ~600 lines
```

#### `features/prompts/` (from `Prompts.tsx` — 680 lines)
```
src/features/prompts/
├── api/
│   ├── prompts-api.ts         # ~80 lines
│   └── index.ts
├── hooks/
│   ├── use-prompts.ts         # ~100 lines
│   └── index.ts
└── index.ts

src/pages/Prompts.tsx          # Reduced to ~400 lines
```

#### Complete `features/settings/` (currently incomplete)
```
src/features/settings/
├── api/
│   ├── use-settings.ts        # Already exists (158 lines)
│   └── index.ts               # NEW barrel
└── index.ts                   # NEW module barrel
```

### 3D. Decompose remaining god pages (>1,000 lines)

After 3B and 3C, these pages still exceed 1,000 lines:

| Page | Lines | Extraction targets |
|------|------:|-------------------|
| `Scheduled.tsx` | 1,345 | Extract calendar view, post preview card, action menus into components under `features/scheduling/components/` |
| `PostJobDetail.tsx` | 1,273 | Extract canvas editor, carousel preview, job actions into sub-components |
| `About.tsx` | 1,053 | Extract diagnostic sections into sub-components (low priority — mostly static) |

**Note:** These are lower priority than 3A-3C. `About.tsx` only has 2 `useState` calls, so its size is mostly static content — least urgent.

### Phase 3 Verification

```bash
# 1. TypeScript compilation
npx tsc --noEmit

# 2. Vite build
npm run build

# 3. Visual verification
npm run dev
# Navigate to each page: Brands, Maestro, Toby, AITeam, Prompts, Scheduled
# Verify all UI elements render and interactive features work

# 4. Verify all imports resolve
grep -rn "from.*@/features" src/pages/ --include="*.tsx" | head -20
# Should show feature module imports replacing direct API calls
```

### Phase 3 Summary

| Metric | Count |
|--------|------:|
| God components decomposed | 6 |
| New feature modules created | 4 |
| New component files created | ~20 |
| New hook files created | ~8 |
| Lines moved (not added/removed) | ~3,000 |
| Risk | **MEDIUM** |

---

## Phase 4: Consolidate Duplicates (Low-Medium Risk)

**Risk:** LOW-MEDIUM — merging duplicate systems requires careful consumer updates  
**Goal:** Single source of truth for brand config, eliminate copy-paste patterns  
**Estimated scope:** ~10 files modified

### 4A. Merge frontend brand config systems

**Current state:** Two separate brand→color/label maps:
1. `src/features/brands/model/brand-config.ts` — `BRAND_CONFIG`, `getBrandLabel()`, `getBrandColor()`, `registerBrand()`
2. `src/shared/components/PostCanvas.tsx` — `BRAND_CONFIGS`, `getBrandConfig()`, `getBrandAbbreviation()`

**Action:**
1. Merge all brand config data/functions from `PostCanvas.tsx` into `features/brands/model/brand-config.ts`
2. Add `getBrandAbbreviation()` and any missing fields to the unified config
3. Remove brand config from `PostCanvas.tsx` — import from `@/features/brands`
4. Update all consumers of `PostCanvas`'s brand config to import from `@/features/brands`

**Consumers to update:**
- `src/shared/components/PostCanvas.tsx` itself
- `src/shared/components/CarouselTextSlide.tsx`
- `src/pages/Posts.tsx`
- `src/pages/PostJobDetail.tsx`
- `src/shared/components/GodAutomation.tsx` (or its extracted sub-components)

**Note on architectural direction:** After Phase 1C, `GodAutomation` no longer imports from features. This merge would re-introduce an import from `features/brands` into `PostCanvas.tsx` which is in `shared/`. To solve this:
- Option A: Move brand config to `shared/model/brand-config.ts` (so it's shared, not a feature) — **recommended**
- Option B: Move `PostCanvas` into `features/brands/components/` — but PostCanvas is used across many features

**Recommended approach:** Move the unified brand config to `src/shared/model/brand-config.ts`. Both `features/brands/` and `shared/components/PostCanvas.tsx` import from `shared/model/`. The `features/brands/` barrel re-exports everything from `shared/model/brand-config.ts` for backward compatibility.

**Files affected:**
| File | Change |
|------|--------|
| `src/shared/model/brand-config.ts` | **NEW** — unified brand config (merged from both sources) |
| `src/features/brands/model/brand-config.ts` | Re-export from `@/shared/model/brand-config` |
| `src/shared/components/PostCanvas.tsx` | Remove inline brand config, import from `@/shared/model/brand-config` |
| `src/shared/components/CarouselTextSlide.tsx` | Update imports |
| Various pages | Update imports if needed |

### 4B. Remove `app/api/brands_routes.py` (legacy v1 routes)

**Prerequisite:** Phase 1A completed (BRAND_NAME_MAP moved to `core/constants.py`)

After Phase 1A, the only remaining value in `brands_routes.py` is its route handlers (config-based brand CRUD). These are superseded by `brands_routes_v2.py` (DB-backed).

**Action:**
1. Verify no frontend route calls the v1 brand endpoints
2. Remove `brands_routes.py` router registration from `app/main.py`
3. Delete `app/api/brands_routes.py` (392 lines)

**Files affected:**
| File | Change |
|------|--------|
| `app/api/brands_routes.py` | **DELETE** (392 lines) |
| `app/main.py` | Remove router include for legacy brands |

### 4C. Consolidate `_format_uptime()` duplication

After Phase 0B (toby_daemon gutted), `_format_uptime()` only exists in `maestro.py`. No action needed — Phase 0 already resolved this.

### Phase 4 Verification

```bash
# 1. Frontend build
npx tsc --noEmit && npm run build

# 2. Verify brand colors render correctly
npm run dev
# Check: Brands page, Scheduled page, PostCanvas renders, GodAutomation batch view

# 3. Verify v1 brand routes removed
python -c "
from app.main import app
brand_routes = [r.path for r in app.routes if 'brand' in str(r.path).lower()]
print(brand_routes)
# Should only show v2 brand routes
"

# 4. Run backend tests
python -m pytest tests/ -v
```

### Phase 4 Summary

| Metric | Count |
|--------|------:|
| Duplicate systems merged | 1 (brand config) |
| Files deleted | 1 (`brands_routes.py`) |
| Files modified | ~8 |
| Lines removed | ~470 (392 from brands_routes + ~80 inline brand config from PostCanvas) |
| Risk | **LOW-MEDIUM** |

---

## Phase 5: Folder Restructure (Higher Risk)

**Risk:** HIGH — import paths change across many files  
**Goal:** Better organization reflecting current domain boundaries  
**Estimated scope:** 25+ files with import path changes

> ⚠️ **This phase is optional and the most dangerous.** It changes import paths across the entire codebase. Consider whether the organizational improvement justifies the risk. Phases 0-4 deliver most of the value.

### 5A. Backend — Split `app/models.py` (1,370 lines, 17 models)

**Proposed structure:**
```
app/models/
├── __init__.py                # Re-exports all models (backward compat)
├── jobs.py                    # GenerationJob, PostJob, JobLog
├── scheduling.py              # ScheduledReel
├── brands.py                  # Brand
├── agents.py                  # AIAgent, TobyProposal
├── auth.py                    # User, AppSetting
├── analytics.py               # PostPerformance, EngagementMetric
├── youtube.py                 # YouTubeChannel
└── logs.py                    # ActivityLog, SystemLog
```

**Backward compat:** The `__init__.py` re-exports everything, so `from app.models import GenerationJob` still works everywhere. Zero import changes needed externally.

### 5B. Backend — Extract HTML templates from log route files

**Current:** `app/api/logs_routes.py` (1,316 lines) and `app/api/ai_logs_routes.py` (1,445 lines) contain inline HTML.

**Proposed:**
```
app/templates/
├── logs_dashboard.html
└── ai_logs_dashboard.html
```

Route files read and render templates using `Template.render()` or simple string formatting.

### 5C. Frontend — Evaluate shared model vs feature model

After Phase 4A, brand config lives in `shared/model/`. Consider whether other model/type files should follow this pattern:

```
src/shared/
├── model/
│   ├── brand-config.ts       # From Phase 4A
│   └── index.ts
├── types/
│   └── index.ts              # Already exists — core types
└── ...
```

This is a minor reorganization, low risk.

### Phase 5 Verification

```bash
# 1. Full backend import check
python -c "from app.models import GenerationJob, ScheduledReel, Brand, AIAgent; print('All models importable')"

# 2. Full test suite
python -m pytest tests/ test_content_logic.py test_phase2.py test_v2_architecture.py -v

# 3. Frontend build
npx tsc --noEmit && npm run build

# 4. Start app end-to-end
python start.py
```

### Phase 5 Summary

| Metric | Count |
|--------|------:|
| Files reorganized | ~20 |
| New directories | 2-3 |
| Import path changes | Many (mitigated by barrel re-exports) |
| Risk | **HIGH** |

---

## Overall Migration Summary

| Phase | Description | Lines Removed | Lines Moved | Files Touched | Risk | Safe to Do Now? |
|-------|-------------|-------------:|------------:|--------------:|------|:--------------:|
| **0** | Dead Code Purge | **~2,394** | 0 | 8 | ZERO | ✅ YES |
| **1** | Fix Layer Violations | 0 | ~80 | 7 | LOW | ✅ YES |
| **2** | Split Backend God Files | 0 | ~4,500 | ~21 | MEDIUM | After 0+1 |
| **3** | Split Frontend God Files | 0 | ~3,000 | ~30 | MEDIUM | After 0+1 |
| **4** | Consolidate Duplicates | ~470 | ~160 | ~10 | LOW-MED | After 1 |
| **5** | Folder Restructure | 0 | ~1,370 | ~25 | HIGH | After 2+3+4 |
| | **TOTAL** | **~2,864** | **~9,110** | | | |

### Execution Order

```
Phase 0  ──→  Phase 1  ──→  Phase 2  ──→  Phase 5
                        ──→  Phase 3  ──→  Phase 5
                        ──→  Phase 4  ──→  Phase 5
```

- Phase 0 and 1 are sequential prerequisites
- Phases 2, 3, and 4 can be done in any order after Phase 1 (they're independent)
- Phase 5 should be last (depends on clean structure from 2+3+4)
- Phases 2 and 3 can be done in parallel by different people (backend vs frontend)

### Commit Strategy

Each phase should be a single commit (or a small PR) with:
- Clear commit message: `refactor: Phase 0 — delete dead code (2,394 lines)`
- All tests passing
- No functional changes

For larger phases (2, 3), consider sub-commits per file split:
- `refactor: Phase 2A — split routes.py into domain routers`
- `refactor: Phase 2B — extract maestro cycles and state`
- `refactor: Phase 2C — split job_manager into CRUD and processing`
