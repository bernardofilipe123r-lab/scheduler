# AI Team & Observatory Removal — Comprehensive Spec

**Created**: 2026-02-17  
**Purpose**: Complete inventory of all code related to AI Team and Observatory features, with clear deletion vs. modification guidance.

---

## Executive Summary

The AI Team and Observatory features consist of:
- **Frontend**: 2 full pages + 1 legacy page, 2 feature folders, 1 layout component, route definitions, nav links
- **Backend**: 3 API route modules, 1 services folder (maestro — 8 files), 1 services folder (agents — 4 files), 1 learning engine, 1 system log route, 3 model files with AI agent tables
- **Critical dependency**: The Maestro daemon handles **daily content generation + auto-scheduling** — this business logic is tied into the Maestro service but currently ONLY triggered from the AI Team / Observatory UI. If you want content to keep auto-generating, the backend maestro services need to STAY.

---

## 1. FILES TO DELETE ENTIRELY

### 1.1 Frontend — Pages

| File | Description |
|------|-------------|
| `src/pages/Observatory.tsx` | Observatory dashboard (5 modes: overview, countdown, live, recap, history) |
| `src/pages/AITeam.tsx` | AI Team management page (agents, maestro controls, gene pool, diagnostics) |
| `src/pages/MissionControl.tsx` | Legacy mission control page (redirected to Observatory, but code still present) |

### 1.2 Frontend — Feature Folders (DELETE ENTIRE FOLDERS)

| Folder | Contents | Description |
|--------|----------|-------------|
| `src/features/mission-control/` | 11 files | API hooks (useAgents, useLiveLogs, useMaestroLive), Components (AgentPodsGrid, AgentPod, StatsPanel, ActivityFeed, CyclesGrid, ProgressRing), Utils (statsCalculator, logParser, cycleConfig), index.ts |
| `src/features/ai-team/` | 4 files | API hooks (use-ai-team.ts, index.ts), Components (CompetitorSection.tsx), index.ts |
| `src/features/maestro/` | 7 files | Components (InsightsPanel, MaestroActivityPanel, ProposalCard, StatCard, TrendingPanel, components/index.ts), constants.ts, types.ts, utils.ts, index.ts |

**Full file list for `src/features/mission-control/`:**
- `src/features/mission-control/index.ts`
- `src/features/mission-control/api/useAgents.ts`
- `src/features/mission-control/api/useLiveLogs.ts`
- `src/features/mission-control/api/useMaestroLive.ts`
- `src/features/mission-control/components/ActivityFeed.tsx`
- `src/features/mission-control/components/AgentPod.tsx`
- `src/features/mission-control/components/AgentPodsGrid.tsx`
- `src/features/mission-control/components/CyclesGrid.tsx`
- `src/features/mission-control/components/ProgressRing.tsx`
- `src/features/mission-control/components/StatsPanel.tsx`
- `src/features/mission-control/utils/cycleConfig.ts`
- `src/features/mission-control/utils/logParser.ts`
- `src/features/mission-control/utils/statsCalculator.ts`

**Full file list for `src/features/ai-team/`:**
- `src/features/ai-team/index.ts`
- `src/features/ai-team/api/index.ts`
- `src/features/ai-team/api/use-ai-team.ts`
- `src/features/ai-team/components/CompetitorSection.tsx`

**Full file list for `src/features/maestro/`:**
- `src/features/maestro/index.ts`
- `src/features/maestro/types.ts`
- `src/features/maestro/constants.ts`
- `src/features/maestro/utils.ts`
- `src/features/maestro/components/InsightsPanel.tsx`
- `src/features/maestro/components/MaestroActivityPanel.tsx`
- `src/features/maestro/components/ProposalCard.tsx`
- `src/features/maestro/components/StatCard.tsx`
- `src/features/maestro/components/TrendingPanel.tsx`
- `src/features/maestro/components/index.ts`

### 1.3 Frontend — Layout Component

| File | Description |
|------|-------------|
| `src/app/layout/BurstNotifier.tsx` | Global toast notification that polls `/api/maestro/status` and navigates to `/observatory` |

### 1.4 Backend — API Route Modules (DELETE ENTIRE FOLDERS)

| Folder | Description |
|--------|-------------|
| `app/api/maestro/` | Maestro API (status, pause/resume, trigger-burst, proposals CRUD, stats, insights, trending, healing, examiner) — `__init__.py`, `routes.py` |
| `app/api/agents/` | AI Agents CRUD API (list, create, update, delete, mutate, clone, retire, gene-pool, evolution-events, diagnostics) — `__init__.py`, `routes.py` |
| `app/api/ai_team/` | AI Team dashboard API (agent status, quotas, patterns, competitors, learning-cycles) — `__init__.py`, `routes.py`, `__pycache__/` |

### 1.5 Backend — Service Modules (DELETE ENTIRE FOLDER)

| Folder | Contents | Description |
|--------|----------|-------------|
| `app/services/maestro/` | 8 files | The Maestro daemon and all sub-modules |
| `app/services/agents/` | 4 files | Agent management, evolution engine, diagnostics |

**Full file list for `app/services/maestro/`:**
- `app/services/maestro/__init__.py`
- `app/services/maestro/maestro.py` — Main daemon class + `start_maestro()`, `get_maestro()`, `maestro_log()`
- `app/services/maestro/state.py` — MaestroState, AgentState, config constants, `_db_get`/`_db_set`, `is_paused`/`set_paused`
- `app/services/maestro/cycles.py` — CyclesMixin (daily burst, feedback, evolution, diagnostics cycles)
- `app/services/maestro/healing.py` — HealingMixin (auto-retry failed jobs)
- `app/services/maestro/proposals.py` — ProposalsMixin (generate proposals, process jobs)
- `app/services/maestro/scheduler_logic.py` — `auto_schedule_job()`, `schedule_all_ready_reels()`
- `app/services/maestro/examiner.py` — Quality gate for proposals
- `app/services/maestro/__pycache__/`

**Full file list for `app/services/agents/`:**
- `app/services/agents/__init__.py`
- `app/services/agents/generic_agent.py` — `seed_builtin_agents()`, `create_agent_for_brand()`, `get_all_active_agents()`, `refresh_agent_cache()`, `_randomize_dna()`, `_ensure_agents_for_all_brands()`
- `app/services/agents/evolution_engine.py` — FeedbackEngine, AdaptationEngine, SelectionEngine, `pick_agent_name()`
- `app/services/agents/diagnostics_engine.py` — DiagnosticsEngine (self-tests)

### 1.6 Backend — Standalone Service Files

| File | Description |
|------|-------------|
| `app/services/agent_learning_engine.py` | AgentLearningEngine — pattern learning from performance data. Used ONLY by `app/api/ai_team/routes.py` (the `/api/ai-team/patterns` endpoint) |

### 1.7 Backend — System Route Files

| File | Description |
|------|-------------|
| `app/api/system/ai_logs_routes.py` | `/api/ai-logs` endpoint — queries AgentProposal + TrendingContent + imports `get_maestro()` for activity log. **ONLY used by AI Team features.** |

---

## 2. FILES TO MODIFY (NOT DELETE)

### 2.1 `app/main.py` — Router includes & startup

**Remove imports (lines 26-28):**
```python
from app.api.maestro.routes import router as maestro_router
from app.api.agents.routes import router as agents_router
from app.api.ai_team.routes import router as ai_team_router
```

**Remove router includes:**
```python
app.include_router(maestro_router)  # Maestro orchestrator (Toby + Lexi)
app.include_router(agents_router)  # Dynamic AI agents CRUD at /api/agents
app.include_router(ai_team_router)  # AI Team dashboard at /api/ai-team
```

**Remove ai_logs router:**
```python
from app.api.system.ai_logs_routes import router as ai_logs_router
# ...
app.include_router(ai_logs_router)  # AI logs at /ai-logs, /maestro-logs, /ai-about
```

**Remove from startup_event (around line 354):**
```python
# Seed builtin AI agents (Toby + Lexi)
from app.services.agents.generic_agent import seed_builtin_agents
seed_builtin_agents()
```

**Remove from startup_event (around line 807-811):**
```python
# ── Start Maestro (orchestrating Toby + Lexi) ──
print("🎼 Starting Maestro orchestrator...", flush=True)
try:
    from app.services.maestro.maestro import start_maestro
    maestro = start_maestro()
    app.state.maestro = maestro
    print("✅ Maestro active — orchestrating Toby (Explorer) + Lexi (Optimizer)", flush=True)
except Exception as e:
    print(f"⚠️ Maestro failed to start: {e}", flush=True)
```

**Remove from shutdown_event:**
```python
# Shutdown Maestro orchestrator
if hasattr(app.state, 'maestro') and app.state.maestro:
    try:
        if app.state.maestro.scheduler:
            app.state.maestro.scheduler.shutdown()
        print("🎼 Maestro stopped")
    except Exception:
        pass
```

### 2.2 `src/app/routes/index.tsx` — Remove routes

**Remove imports:**
```tsx
import { AITeamPage } from '@/pages/AITeam'
import { ObservatoryPage } from '@/pages/Observatory'
```

**Remove BurstNotifier:**
```tsx
import { BurstNotifier } from '../layout/BurstNotifier'
// ...
{isAuthenticated && <BurstNotifier />}
```

**Remove routes:**
```tsx
<Route path="/observatory" element={<AuthGuard><ObservatoryPage /></AuthGuard>} />
// ...
<Route path="toby" element={<Navigate to="/ai-team" replace />} />
<Route path="maestro" element={<Navigate to="/ai-team?tab=orchestrator" replace />} />
<Route path="mission-control" element={<Navigate to="/observatory" replace />} />
<Route path="ai-team" element={<AITeamPage />} />
```

### 2.3 `src/app/layout/AppLayout.tsx` — Remove nav link

**Remove the AI Team nav link (around line 125):**
```tsx
<NavLink
  to="/ai-team"
  className={({ isActive }) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
      isActive
        ? 'bg-primary-50 text-primary-600'
        : 'text-gray-600 hover:bg-gray-100'
    }`
  }
>
  <Dna className="w-4 h-4" />
  AI Team
</NavLink>
```

Also check if `Dna` icon import from lucide-react can be removed (if unused elsewhere).

### 2.4 `src/pages/index.ts` — Remove export

**Remove:**
```ts
export { AITeamPage } from './AITeam'
```

### 2.5 `src/shared/components/PageLoader.tsx` — Remove ai-team theme

**Remove from type and themes:**
```ts
// Remove 'ai-team' from PageTheme type
type PageTheme = 'ai-team' | 'videos' | 'posts' | ...
// becomes:
type PageTheme = 'videos' | 'posts' | ...

// Remove from themes object:
'ai-team': { emoji: '🤖', message: 'Agents are thinking', accents: ['🧠', '⚡', '💭'] },
```

### 2.6 `app/models/__init__.py` — Remove AI agent model exports

**Remove imports:**
```python
from app.models.agents import AIAgent, AgentPerformance, AgentLearning, GenePool, AgentProposal
from app.models.logs import LogEntry, SystemDiagnostic  # Keep LogEntry, remove SystemDiagnostic
from app.models.config import MaestroConfig, AppSettings  # Keep AppSettings, remove MaestroConfig
from app.models.learning import (
    LearnedPattern,
    BrandPerformanceMemory,
    CompetitorAccount,
    APIQuotaUsage,
    AgentLearningCycle,
)
```

**Remove from `__all__`:**
```python
"AIAgent", "AgentPerformance", "AgentLearning", "GenePool", "AgentProposal",
"SystemDiagnostic",
"MaestroConfig",
"LearnedPattern", "BrandPerformanceMemory", "CompetitorAccount", "APIQuotaUsage", "AgentLearningCycle",
```

### 2.7 `app/api/brands/routes.py` — Remove agent auto-provisioning

**Remove (around line 409-424):**
```python
# Auto-provision an AI agent for this brand
agent_info = None
try:
    from app.services.agents.generic_agent import create_agent_for_brand
    agent_name = request.agent_name
    new_agent = create_agent_for_brand(
        brand_id=request.id.lower(),
        agent_name=agent_name,
    )
    if new_agent:
        agent_info = {
            "agent_id": new_agent.agent_id,
            "display_name": new_agent.display_name,
            "variant": new_agent.variant,
        }
except Exception as e:
    print(f"[BRAND] Agent auto-provision warning: {e}")
```

Also clean up `agent_info` from the response dict, and if `agent_name` is in the request schema, remove it.

### 2.8 `app/api/brands_routes_v2.py` — Remove agent auto-provisioning

**Same pattern as above (around line 267-283):**
```python
# Auto-provision an AI agent for this brand
agent_info = None
try:
    from app.services.agents.generic_agent import create_agent_for_brand
    ...
```

### 2.9 `app/models/logs.py` — Remove SystemDiagnostic class

**Keep** `LogEntry` (used by general logging service).  
**Remove** `SystemDiagnostic` class (only used by agents/diagnostics, Observatory).

### 2.10 `app/models/config.py` — Remove MaestroConfig class

**Keep** `AppSettings` (used by settings routes).  
**Remove** `MaestroConfig` class (only used by maestro state persistence).

### 2.11 `app/services/api_quota_manager.py` — MAY KEEP OR REMOVE

This is used by `app/api/ai_team/routes.py` for the `/api/ai-team/quotas` endpoint. If no other feature uses the quota manager, it can be deleted. **Check for other callers** — if only AI Team uses it, DELETE.

---

## 3. BACKEND MODEL FILES TO DELETE

| File | What to delete | What to keep |
|------|---------------|--------------|
| `app/models/agents.py` | **DELETE ENTIRE FILE** — Contains: AIAgent, AgentPerformance, AgentLearning, GenePool, AgentProposal. All exclusively for AI Team/Maestro. |
| `app/models/learning.py` | **DELETE ENTIRE FILE** — Contains: LearnedPattern, BrandPerformanceMemory, CompetitorAccount, APIQuotaUsage, AgentLearningCycle. All exclusively for AI Team/Agent learning. |

---

## 4. CRITICAL DEPENDENCY ANALYSIS

### 4.1 Maestro Backend — What it does

The Maestro daemon (`app/services/maestro/`) handles:
1. **Daily burst** — Auto-generates content proposals at 12:00 PM Lisbon time
2. **Proposal examiner** — Quality-gates AI proposals before acceptance
3. **Auto-scheduling** — `auto_schedule_job()` schedules completed jobs
4. **Healing** — Retries failed jobs automatically
5. **Evolution** — Mutates/selects AI agents based on performance
6. **Diagnostics** — Self-tests every 4 hours
7. **Feedback** — Collects performance data from published posts

### 4.2 What depends on Maestro?

- **`auto_schedule_job()`** is called from `app/api/maestro/routes.py` after accepting proposals. Since proposals are a Maestro feature, this dependency is circular — removing Maestro removes the need for `auto_schedule_job()`.
- **`schedule_all_ready_reels()`** is called from Maestro resume/burst flows only.
- **`seed_builtin_agents()`** seeds Toby + Lexi at startup — only needed for AI Team.
- **`create_agent_for_brand()`** is called from brand creation routes — this auto-provisions an AI agent when a brand is created. **This reference needs to be removed from brand routes.**

### 4.3 Verdict: Safe to remove ALL Maestro backend

**The Maestro daemon is ONLY used for AI-driven content generation and the Observatory/AI Team UI.** The core publishing scheduler (`check_and_publish()` in `app/main.py`) runs independently via APScheduler and does NOT depend on Maestro. Content can still be manually generated via the Generator page.

The auto-publishing, analytics refresh, log cleanup, and published content cleanup schedulers all live directly in `app/main.py` and do NOT depend on Maestro.

### 4.4 Models used by other features?

- `AgentProposal` — used in `app/api/system/ai_logs_routes.py` (being removed) and `app/api/maestro/routes.py` (being removed). **Safe to remove.**
- `AIAgent` — used in `app/api/system/ai_logs_routes.py` (being removed), brands routes (references being removed). **Safe to remove.**
- `LogEntry` — used by `app/services/logging/service.py` and general logging. **MUST KEEP.**
- `AppSettings` — used by `app/api/system/settings_routes.py`. **MUST KEEP.**
- `MaestroConfig` — used only by `app/services/maestro/state.py`. **Safe to remove.**

---

## 5. SUMMARY CHECKLIST

### Files to DELETE (30+ files):

**Frontend Pages (3):**
- [ ] `src/pages/Observatory.tsx`
- [ ] `src/pages/AITeam.tsx`
- [ ] `src/pages/MissionControl.tsx`

**Frontend Feature Folders (3 folders, ~25 files):**
- [ ] `src/features/mission-control/` (entire folder)
- [ ] `src/features/ai-team/` (entire folder)
- [ ] `src/features/maestro/` (entire folder)

**Frontend Layout (1):**
- [ ] `src/app/layout/BurstNotifier.tsx`

**Backend API Folders (3 folders):**
- [ ] `app/api/maestro/` (entire folder)
- [ ] `app/api/agents/` (entire folder)
- [ ] `app/api/ai_team/` (entire folder)

**Backend Service Folders (2 folders):**
- [ ] `app/services/maestro/` (entire folder)
- [ ] `app/services/agents/` (entire folder)

**Backend Standalone (2):**
- [ ] `app/services/agent_learning_engine.py`
- [ ] `app/api/system/ai_logs_routes.py`

**Backend Model Files (2):**
- [ ] `app/models/agents.py`
- [ ] `app/models/learning.py`

### Files to MODIFY (9):

- [ ] `app/main.py` — Remove maestro/agents/ai_team imports, router includes, startup seed + daemon, shutdown cleanup, ai_logs router
- [ ] `src/app/routes/index.tsx` — Remove Observatory/AITeam imports, BurstNotifier, 5 routes
- [ ] `src/app/layout/AppLayout.tsx` — Remove AI Team nav link + Dna icon import
- [ ] `src/pages/index.ts` — Remove AITeamPage export
- [ ] `src/shared/components/PageLoader.tsx` — Remove 'ai-team' theme
- [ ] `app/models/__init__.py` — Remove agent/maestro model imports and __all__ entries
- [ ] `app/models/logs.py` — Remove SystemDiagnostic class (keep LogEntry)
- [ ] `app/models/config.py` — Remove MaestroConfig class (keep AppSettings)
- [ ] `app/api/brands/routes.py` — Remove agent auto-provisioning block
- [ ] `app/api/brands_routes_v2.py` — Remove agent auto-provisioning block

### Files to KEEP (referenced but NOT part of AI Team/Observatory):

- `app/services/publishing/scheduler.py` — Independent publish scheduler
- `app/services/logging/service.py` — General logging (uses LogEntry)
- `app/services/logging/middleware.py` — Request logging middleware
- `app/api/system/logs_routes.py` — General logs dashboard
- `app/api/system/health_routes.py` — Health check
- `app/api/system/settings_routes.py` — App settings
- `app/api/system/status_routes.py` — System status
- `app/services/analytics/` — Analytics service (independent)
- `app/services/content/` — Content generation (job_processor, job_manager — used by Generator page)
- `app/models/jobs.py` — GenerationJob model (used by Generator)
- `app/models/scheduling.py` — ScheduledReel model (used by Calendar)
- `app/services/api_quota_manager.py` — **DELETE if only used by AI Team** (verify)

---

## 6. DATABASE TABLES AFFECTED

Tables that will become orphaned (no code references after removal):
- `ai_agents`
- `agent_performance`
- `agent_learnings`
- `gene_pool`
- `agent_proposals`
- `maestro_config`
- `system_diagnostics`
- `learned_patterns`
- `brand_performance_memory`
- `competitor_accounts`
- `api_quota_usage`
- `agent_learning_cycles`

**Note**: These tables should NOT be dropped in code — they exist in the database. A separate migration script can clean them up later if desired.

---

## 7. IMPLEMENTATION ORDER

1. **Backend first**: Remove model imports, then service folders, then API routes, then main.py references
2. **Frontend second**: Remove feature folders, pages, then route/nav references
3. **Build verification**: `npm run build` (TypeScript must compile)
4. **Test**: Ensure Generator, Calendar, Brands, Analytics, Posts pages still work
