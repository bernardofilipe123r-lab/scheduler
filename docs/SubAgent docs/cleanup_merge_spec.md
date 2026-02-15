# Cleanup & Merge Spec: Toby, Maestro, AI Team Pages

> Generated: 2025-02-15

---

## 1. Route Definitions

From `src/app/routes/index.tsx`:

```tsx
import { TobyPage } from '@/pages/Toby'
import { MaestroPage } from '@/pages/Maestro'
import { AITeamPage } from '@/pages/AITeam'

// Inside <Route path="/" ...>:
<Route path="toby" element={<TobyPage />} />
<Route path="maestro" element={<MaestroPage />} />
<Route path="ai-team" element={<AITeamPage />} />
```

## 2. Navigation Links (AppLayout.tsx)

The header nav in `src/app/layout/AppLayout.tsx` has:

- **Maestro** — direct nav link at `/maestro` (icon: `Music`)
- **AI Team** — direct nav link at `/ai-team` (icon: `Dna`)
- **Toby** — **NO nav link in the header**. The `/toby` route exists but there's no navigation entry for it.

Note: Toby has NO link in the navigation bar. It's only accessible by typing `/toby` in the URL.

## 3. Page Exports (src/pages/index.ts)

```ts
export { TobyPage } from './Toby'
export { MaestroPage } from './Maestro'
export { AITeamPage } from './AITeam'
```

## 4. Template-Related Components in Brands Page

### Brands.tsx imports:
```tsx
import { TemplatesTab } from '@/features/brands/components/TemplatesTab'
```

### BrandsTabBar.tsx tabs:
```tsx
const TABS = [
  { key: 'brands', label: 'My Brands', icon: Layers },
  { key: 'templates', label: 'Templates', icon: Layout },
  { key: 'connections', label: 'Connections', icon: Link2 },
  { key: 'settings', label: 'Settings', icon: Settings },
]
```

### TemplatesTab.tsx — PLACEHOLDER (Coming Soon):
```tsx
export function TemplatesTab() {
  // Just a "Coming Soon" placeholder with no functionality
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <h2>Templates Coming Soon</h2>
      <p>Manage content templates for each brand...</p>
      <div>In Development</div>
    </div>
  )
}
```

## 5. Backend Template Files

| File | Exists? |
|------|---------|
| `app/services/template_loader.py` | **NO** |
| `app/api/templates_routes.py` | **NO** |
| `scripts/upload_templates.py` | **YES** (2319 bytes) |

## 6. Maestro Feature Files

`src/features/maestro/` contains:
- `components/` (directory with shared components)
- `constants.ts`
- `index.ts`
- `types.ts`
- `utils.ts`

Maestro.tsx imports from these feature files:
```tsx
import type { Proposal, ProposalListResponse, MaestroStatus, InsightsResponse, TrendingItem } from '@/features/maestro/types'
import { getAgentMeta } from '@/features/maestro/constants'
import { timeAgo } from '@/features/maestro/utils'
import { ProposalCard, MaestroActivityPanel, InsightsPanel, TrendingPanel, StatCard, StatusPill } from '@/features/maestro/components'
```

---

## 7. Page Analysis

### Toby.tsx (~700 lines)
- **Self-contained monolith** — ALL types, helpers, and sub-components defined inline
- API endpoints: `/api/toby/proposals`, `/api/toby/status`, `/api/toby/insights`, `/api/toby/trending`, `/api/toby/pause`, `/api/toby/resume`
- Components: `TobyPage`, `StatusPill`, `StatCard`, `ProposalCard`, `ActivityPanel`, `InsightsPanel`, `TrendingPanel`
- Has Pause/Resume toggle
- Tabs: proposals, activity, insights, trending
- Single user/AI interaction — no multi-agent concept
- Uses purple/violet gradient header

### Maestro.tsx (~400 lines)
- **Well-factored** — imports types, utils, components from `src/features/maestro/`
- API endpoints: `/api/maestro/proposals`, `/api/maestro/status`, `/api/maestro/insights`, `/api/maestro/trending`, `/api/maestro/pause`, `/api/maestro/resume`, `/api/maestro/trigger-burst`, `/api/maestro/proposals/clear`, `/api/maestro/reset-daily-run`
- Components imported: `ProposalCard`, `MaestroActivityPanel`, `InsightsPanel`, `TrendingPanel`, `StatCard`, `StatusPill`
- Features: Pause/Resume, Trigger Burst, Accept All, Clear Proposals, Reset All, per-agent filtering, daily config tracking
- Multi-agent system: dynamic agents loaded from DB, agent cards grid
- Uses amber/orange/rose gradient header (gray when paused)
- Tabs: proposals, activity, insights, trending

### AITeam.tsx (~700 lines)
- **Self-contained monolith** — ALL types, helpers, and sub-components defined inline
- API endpoints: `/api/agents`, `/api/agents/{id}/performance`, `/api/agents/{id}/learnings`, `/api/agents/{id}/mutate`, `/api/agents/{id}/clone`, `/api/agents/{id}/retire`, `/api/agents/evolution-events/timeline`, `/api/agents/gene-pool/entries`, `/api/agents/diagnostics/latest`, `/api/agents/diagnostics/run`, `/api/maestro/status`
- Components: `AITeamPage`, `OverviewTab`, `StatCard`, `AgentCard`, `MiniChart`, `EvolutionTimeline`, `GenePoolView`, `SystemHealthView`, `StrategyWeights`
- Tabs: overview, leaderboard, timeline, gene-pool, health
- Evolutionary AI system: survival scores, mutations, cloning, retirement, gene pool
- Shows architecture overview (Toby, Lexi, Dynamic Agents, Maestro)
- Uses indigo color scheme

### Key Observations:
1. **Toby is DEAD** — no nav link, its API endpoints are `/api/toby/*` (the old single-agent system). Maestro replaced it as the orchestrator.
2. **Maestro** = orchestrator page (proposals, burst control, agent management)
3. **AI Team** = agents deep-dive page (DNA, evolution, gene pool, diagnostics)
4. **Duplicate components**: Both Toby and AI Team define their own `StatCard`. Maestro imports `StatCard` from features.
5. **Toby's ProposalCard, ActivityPanel, InsightsPanel, TrendingPanel** are duplicates of Maestro's equivalents (just different API endpoints and styling)
6. **AI Team references Toby** in the architecture overview as just one of N agents (explorer), not as a standalone page

---

## 8. Full File Contents

### 8a. Toby.tsx (src/pages/Toby.tsx)

Lines: ~700
Export: `TobyPage`
API base: `/api/toby/*`

Key types defined inline:
- `Proposal`, `ProposalListResponse`, `TobyStats`, `ActivityEntry`, `TobyDaemonStatus`, `PerformanceSummary`, `Performer`, `InsightsResponse`, `TrendingItem`

Key sub-components defined inline:
- `StatusPill` (header row pill)
- `StatCard` (stat cards)
- `ProposalCard` (expandable proposal)
- `ActivityPanel` (activity log with filters)
- `InsightsPanel` (performance insights)
- `TrendingPanel` (trending content)

### 8b. Maestro.tsx (src/pages/Maestro.tsx)

Lines: ~400
Export: `MaestroPage`
API base: `/api/maestro/*`

Imports from `@/features/maestro/`:
- Types: `Proposal`, `ProposalListResponse`, `MaestroStatus`, `InsightsResponse`, `TrendingItem`
- Constants: `getAgentMeta`
- Utils: `timeAgo`
- Components: `ProposalCard`, `MaestroActivityPanel`, `InsightsPanel`, `TrendingPanel`, `StatCard`, `StatusPill`

Additional imports: `get`, `post`, `del` from `@/shared/api/client`

Unique features vs Toby:
- Multi-agent support (dynamic agent cards)
- `agentFilter` state
- `handleAcceptAll` bulk accept
- `handleTriggerBurst` daily burst trigger
- `handleClearProposals` delete all
- `handleResetAll` full reset
- `handleTogglePause` (persisted in DB)
- Daily config tracking (today_reels, today_posts, targets)

### 8c. AITeam.tsx (src/pages/AITeam.tsx)

Lines: ~700
Export: `AITeamPage`
API base: `/api/agents/*` + `/api/maestro/status`

Key types defined inline:
- `Agent`, `AgentStats7d`, `PerformanceSnapshot`, `EvolutionEvent`, `GenePoolEntry`, `DiagnosticCheck`, `DiagnosticReport`, `MaestroStatus`

Key sub-components defined inline:
- `OverviewTab` (system overview, architecture cards, scheduling info)
- `StatCard` (stat cards — different impl from Toby's and Maestro's)
- `AgentCard` (expandable agent with DNA, stats, survival chart)
- `MiniChart` (SVG sparkline for survival history)
- `EvolutionTimeline` (mutation/evolution event list)
- `GenePoolView` (archived DNA grid)
- `SystemHealthView` (diagnostics report with pass/warn/fail checks)
- `StrategyWeights` (horizontal bar chart of strategy weights)

---

## 9. Summary of Overlap & Duplication

| Concept | Toby | Maestro | AI Team |
|---------|------|---------|---------|
| Proposal list + accept/reject | ✅ (inline) | ✅ (feature module) | ❌ |
| Activity log | ✅ (inline) | ✅ (feature module) | ❌ |
| Performance insights | ✅ (inline) | ✅ (feature module) | ❌ |
| Trending content | ✅ (inline) | ✅ (feature module) | ❌ |
| Pause/Resume | ✅ | ✅ | ❌ |
| Agent cards | ❌ | ✅ (dynamic) | ✅ (detailed) |
| Burst trigger | ❌ | ✅ | ❌ |
| Evolution/mutations | ❌ | ❌ | ✅ |
| Gene pool | ❌ | ❌ | ✅ |
| System diagnostics | ❌ | ❌ | ✅ |
| StatCard component | ✅ (inline) | ✅ (feature) | ✅ (inline, different) |
| Nav link | ❌ | ✅ | ✅ |
