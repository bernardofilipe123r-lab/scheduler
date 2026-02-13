# Frontend Architecture Analysis

**Generated:** 2026-02-13  
**Codebase:** `src/` — React + TypeScript + Vite  
**Total Files:** 76 (`.ts`, `.tsx`, `.css`)  
**Total Lines:** 21,366

---

## 1. Complete File Inventory

### `src/` Root

| File | Lines | Purpose |
|------|------:|---------|
| `main.tsx` | 22 | App entry point — renders `AppProviders` into DOM |
| `index.css` | 337 | Global Tailwind directives + custom utility classes |
| `vite-env.d.ts` | 1 | Vite client type declarations |

### `src/app/` — Application Shell (475 lines)

| File | Lines | Purpose |
|------|------:|---------|
| `layout/AppLayout.tsx` | 344 | Main app shell with sidebar navigation, mobile drawer, header |
| `layout/NotificationBell.tsx` | 109 | Notification bell showing active/pending job counts |
| `layout/index.ts` | 2 | Barrel export for layout components |
| `providers/QueryProvider.tsx` | 23 | React Query provider with default config |
| `providers/RouterProvider.tsx` | 13 | Wraps AuthProvider + AppRoutes |
| `providers/index.tsx` | 13 | Combined AppProviders wrapper + barrel exports |
| `routes/index.tsx` | 84 | Route definitions, AuthGuard, LoginGuard |

### `src/features/` — Feature Modules (1,556 lines)

#### `features/analytics/` (233 lines)
| File | Lines | Purpose |
|------|------:|---------|
| `api/analytics-api.ts` | 128 | API functions for analytics endpoints (summary, platform, trends) |
| `api/index.ts` | 1 | Barrel export |
| `hooks/use-analytics.ts` | 100 | React Query hooks for analytics data fetching |
| `hooks/index.ts` | 1 | Barrel export |
| `index.ts` | 3 | Module barrel export |

#### `features/auth/` (199 lines)
| File | Lines | Purpose |
|------|------:|---------|
| `AuthContext.tsx` | 91 | Auth context with JWT token management, login/logout |
| `api/auth-api.ts` | 96 | Auth API functions (login, register, profile, change password) |
| `index.ts` | 12 | Barrel export with selective re-exports |

#### `features/brands/` (504 lines)
| File | Lines | Purpose |
|------|------:|---------|
| `api/connections-api.ts` | 75 | API for brand connection status (Meta, YouTube) |
| `api/use-brands.ts` | 281 | React Query hooks for brand CRUD, themes, colors |
| `api/index.ts` | 2 | Barrel export |
| `components/BrandBadge.tsx` | 26 | Colored badge component for brand display |
| `components/index.ts` | 1 | Barrel export |
| `hooks/use-connections.ts` | 50 | Hook wrapper for connection queries |
| `hooks/use-dynamic-brands.ts` | 65 | Dynamic brand registration into runtime config |
| `hooks/index.ts` | 2 | Barrel export |
| `model/brand-config.ts` | 80 | Static brand config map, helpers: `getBrandLabel`, `getBrandColor` |
| `model/index.ts` | 1 | Barrel export |
| `index.ts` | 5 | Module barrel export |

#### `features/jobs/` (320 lines)
| File | Lines | Purpose |
|------|------:|---------|
| `api/jobs-api.ts` | 127 | API functions for job CRUD + batch operations |
| `api/index.ts` | 1 | Barrel export |
| `hooks/use-jobs.ts` | 187 | React Query hooks for jobs (list, delete, regenerate, bulk) |
| `hooks/index.ts` | 1 | Barrel export |
| `index.ts` | 3 | Module barrel export |

#### `features/scheduling/` (444 lines)
| File | Lines | Purpose |
|------|------:|---------|
| `api/scheduling-api.ts` | 122 | API for schedule CRUD, retry, publish, reschedule |
| `api/youtube-api.ts` | 38 | YouTube connection status + OAuth URL helper |
| `api/index.ts` | 1 | Barrel export |
| `components/YouTubeStatusCard.tsx` | 244 | YouTube connection widget with OAuth flow |
| `components/index.ts` | 1 | Barrel export |
| `hooks/use-scheduling.ts` | 121 | React Query hooks for scheduling operations |
| `hooks/use-youtube.ts` | 38 | Hook for YouTube connection status |
| `hooks/index.ts` | 1 | Barrel export |
| `index.ts` | 3 | Module barrel export |

#### `features/settings/` (158 lines) — **INCOMPLETE MODULE**
| File | Lines | Purpose |
|------|------:|---------|
| `api/use-settings.ts` | 158 | Settings CRUD hooks — missing `index.ts`, no barrel, no hooks/ folder |

### `src/pages/` — Page Components (14,650 lines)

| File | Lines | Purpose |
|------|------:|---------|
| `Brands.tsx` | **2,043** | Brand management: CRUD, theme editor, color picker, preview |
| `Maestro.tsx` | **1,719** | AI orchestrator dashboard: agents, logs, controls |
| `Toby.tsx` | **1,302** | Toby AI daemon: proposals, insights, trending, controls |
| `Scheduled.tsx` | **1,345** | Scheduled posts manager: calendar, preview, actions |
| `PostJobDetail.tsx` | **1,273** | Post job detail with canvas editing + carousel preview |
| `About.tsx` | **1,053** | System about/diagnostics page |
| `JobDetail.tsx` | 991 | Reel job detail with video player + scheduling |
| `AITeam.tsx` | 932 | AI agent team manager |
| `Analytics.tsx` | 796 | Analytics dashboard with charts (Recharts) |
| `History.tsx` | 706 | Job history list with filters + bulk actions |
| `Prompts.tsx` | 680 | Prompt template editor |
| `Posts.tsx` | 588 | Post creation form with live PostCanvas preview |
| `Generator.tsx` | 430 | Reel content generator form |
| `Connected.tsx` | 430 | Connected accounts overview |
| `Settings.tsx` | 318 | App settings editor |
| `Carousels.tsx` | 286 | Carousel creation (**DEAD CODE — not in routes**) |
| `Login.tsx` | 227 | Login/register form |
| `Profile.tsx` | 220 | User profile editor |
| `PostsPrompts.tsx` | 5 | Thin wrapper — re-exports `PromptsPage` with contentType='post' |
| `ReelsPrompts.tsx` | 5 | Thin wrapper — re-exports `PromptsPage` with contentType='reel' |
| `index.ts` | 16 | Barrel export for all pages |

### `src/shared/` — Shared Code (1,335 lines)

| File | Lines | Purpose |
|------|------:|---------|
| `api/client.ts` | 92 | HTTP client (get/post/put/del/patch) with error handling |
| `api/index.ts` | 1 | Barrel export |
| `components/GodAutomation.tsx` | **1,633** | Batch generation + Tinder-style review system |
| `components/PostCanvas.tsx` | 553 | Konva canvas for rendering post images |
| `components/CarouselTextSlide.tsx` | 321 | Konva component for carousel text slides |
| `components/Modal.tsx` | 76 | Reusable modal dialog |
| `components/StatusBadge.tsx` | 70 | Status indicator badge |
| `components/LoadingSpinner.tsx` | 43 | Loading spinner + full-page/card variants |
| `components/index.ts` | 5 | Barrel export |
| `lib/captionUtils.ts` | 78 | Facebook caption formatting utilities |
| `types/index.ts` | 115 | Core type definitions (Job, BrandName, ScheduledPost, etc.) |

### `src/assets/` (not .ts/.tsx — icons, fonts, images, logos)

Referenced by `CarouselTextSlide.tsx` (share.png, save.png).

---

## 2. Directory Structure Analysis

```
src/
├── app/                    # Application shell & bootstrapping
│   ├── layout/             # AppLayout + NotificationBell
│   ├── providers/          # QueryProvider + RouterProvider + combined wrapper
│   └── routes/             # Route definitions + auth guards
├── features/               # Feature-sliced modules (FSD-influenced)
│   ├── analytics/          # ✅ Complete: api/ + hooks/ + index
│   ├── auth/               # ✅ Complete: api/ + context + index
│   ├── brands/             # ✅ Complete: api/ + components/ + hooks/ + model/ + index
│   ├── jobs/               # ✅ Complete: api/ + hooks/ + index
│   ├── scheduling/         # ✅ Complete: api/ + components/ + hooks/ + index
│   └── settings/           # ⚠️ Incomplete: only api/use-settings.ts, no barrel, no hooks/
├── pages/                  # Route-level page components
├── shared/                 # Cross-cutting shared code
│   ├── api/                # HTTP client
│   ├── components/         # Reusable UI components
│   ├── lib/                # Utility functions
│   └── types/              # TypeScript type definitions
└── assets/                 # Static assets (icons, fonts, images)
```

### Observations

- **Feature modules** mostly follow a consistent `api/` + `hooks/` + `index.ts` pattern
- **`settings`** feature is incomplete — a single file without proper module structure
- **No `features/toby/`** — Toby page (1,302 lines) has all logic inline with direct API calls
- **No `features/maestro/`** — Maestro page (1,719 lines) has all logic inline
- **No `features/ai-team/`** — AITeam page (932 lines) has all logic inline
- **No `features/prompts/`** — Prompts page (680 lines) has all logic inline

---

## 3. Dependency Graph

### Import Flow (Feature → Shared)

```
Pages ──────────────┬──→ features/auth       ──→ shared/api/client
                    ├──→ features/brands     ──→ shared/api, shared/types
                    ├──→ features/jobs       ──→ shared/api, shared/types
                    ├──→ features/scheduling ──→ shared/api, shared/types, features/brands
                    ├──→ features/analytics  ──→ shared/api
                    ├──→ features/settings   ──→ shared/api/client (direct, no barrel)
                    ├──→ shared/components
                    └──→ shared/types
```

### Pages Bypassing Feature Layer (Direct API Calls)

| Page | Lines | Imports API client directly |
|------|------:|:------------------------:|
| `Toby.tsx` | 1,302 | ✅ `get, post` from `@/shared/api/client` |
| `AITeam.tsx` | 932 | ✅ `get, post` from `@/shared/api/client` |
| `Prompts.tsx` | 680 | ✅ `apiClient` from `@/shared/api/client` |
| `Maestro.tsx` | 1,719 | ✅ `get, post, del` from `@/shared/api/client` |

**Total: 4,633 lines of pages making direct API calls** — these pages have no corresponding feature module and embed all data-fetching, state management, and business logic inline.

### Cross-Feature Dependencies

- `features/scheduling` → `features/brands` (imports `getBrandLabel`, `getBrandColor`)
- `shared/components/GodAutomation` → `features/brands` (violates shared→features direction)

---

## 4. Dead Code Analysis

### Confirmed Dead Code

| Item | File | Lines | Evidence |
|------|------|------:|---------|
| `CarouselsPage` | `src/pages/Carousels.tsx` | 286 | Not imported in routes or any other file. Exported in `pages/index.ts` but never consumed. |
| `CarouselsPage` export | `src/pages/index.ts` (implied) | — | Exported but no consumer exists |

### Potentially Unused Exports from PostCanvas.tsx

`PostCanvas.tsx` exports **30 items** (constants, interfaces, functions). Several exports appear to only be used internally or by 1-2 consumers — worth auditing:

- `PREVIEW_SCALE`, `GRID_PREVIEW_SCALE` — used only inside PostCanvas itself and pages
- `POST_BRAND_OFFSETS` — should be checked for external usage
- `getBrandAbbreviation` — needs usage audit
- `SLIDE_FONT_OPTIONS` — needs usage audit
- `SETTINGS_STORAGE_KEY` — needs usage audit

### Orphaned Utility

- `shared/lib/captionUtils.ts` (78 lines) — imported by only `JobDetail.tsx`. Consider if this belongs in a feature module.

---

## 5. Duplication Analysis

### 🔴 Critical: Duplicate Brand Config Systems

Two completely separate brand configuration systems exist:

1. **`features/brands/model/brand-config.ts`** (80 lines)
   - `BRAND_CONFIG` map, `getBrandLabel()`, `getBrandColor()`, `registerBrand()`
   - Used by: brand feature, scheduling, GodAutomation, Scheduled, JobDetail, Connected

2. **`shared/components/PostCanvas.tsx`** (within 553 lines)
   - `BRAND_CONFIGS` map, `getBrandConfig()`, `getBrandAbbreviation()`
   - Used by: Posts, PostJobDetail, GodAutomation, CarouselTextSlide

These two systems serve the same purpose (brand → color/label mapping) but use different data, different key names, and different APIs. **Any brand change must be updated in two places.**

### Repeated API Call Patterns

Pages without feature modules repeat the same pattern:
```typescript
// In Toby.tsx, AITeam.tsx, Prompts.tsx, Maestro.tsx:
const [data, setData] = useState(...)
const [loading, setLoading] = useState(true)
const fetchData = useCallback(async () => {
  try { setData(await get('/api/...')) }
  catch (e) { console.error(e) }
  finally { setLoading(false) }
}, [])
useEffect(() => { fetchData() }, [fetchData])
```

This pattern is repeated ~15+ times across these 4 pages, while the feature modules use React Query hooks properly.

### Inconsistent Import Styles

- Some pages import from feature barrel (`@/features/brands`)
- Others bypass barrels (`@/features/brands/api/use-brands`, `@/features/settings/api/use-settings`)
- 4 pages skip the feature layer entirely

---

## 6. Architecture Smells

### 🔴 God Components (>500 lines)

| Component | Lines | `useState` | `useEffect` | Severity |
|-----------|------:|:----------:|:-----------:|:--------:|
| `Brands.tsx` | **2,043** | 37 | 4 | 🔴 Critical |
| `Maestro.tsx` | **1,719** | 22 | 4 | 🔴 Critical |
| `GodAutomation.tsx` | **1,633** | — | — | 🔴 Critical |
| `Scheduled.tsx` | **1,345** | 16 | 2 | 🔴 Critical |
| `Toby.tsx` | **1,302** | 18 | 4 | 🔴 Critical |
| `PostJobDetail.tsx` | **1,273** | 16 | 3 | 🔴 Critical |
| `About.tsx` | **1,053** | 2 | 0 | 🟡 Moderate |
| `JobDetail.tsx` | 991 | 10 | 0 | 🟡 Moderate |
| `AITeam.tsx` | 932 | 13 | 3 | 🟡 Moderate |
| `Analytics.tsx` | 796 | 7 | 3 | 🟡 Moderate |
| `History.tsx` | 706 | 9 | 0 | 🟡 Moderate |
| `Prompts.tsx` | 680 | 13 | 2 | 🟡 Moderate |
| `Posts.tsx` | 588 | 12 | 2 | 🟡 Moderate |
| `PostCanvas.tsx` | 553 | — | — | 🟡 Moderate |

**14 out of 20 page/component files exceed 500 lines.** `Brands.tsx` at 2,043 lines with 37 useState calls is the worst offender.

### 🔴 Mixed Concerns

1. **`PostCanvas.tsx`** — exports brand config, layout constants, utility functions, AND a React component. Should be split into:
   - Canvas component
   - Brand config (merge with `features/brands/model/`)
   - Layout constants
   - Typography utilities

2. **Pages embed business logic** — Toby, Maestro, AITeam, Prompts pages contain API calls, state management, data transformation, AND rendering in single files.

3. **`shared/components/GodAutomation.tsx`** (1,633 lines) — Contains 4+ sub-components (`BatchSelector`, `PreGenProgress`, `ReviewCard`, `CompletionSummary`) that are defined inline instead of extracted to separate files.

### 🟡 Inconsistent Feature Module Structure

| Feature | Has api/ | Has hooks/ | Has components/ | Has model/ | Has barrel | Complete |
|---------|:--------:|:----------:|:---------------:|:----------:|:----------:|:--------:|
| analytics | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| auth | ✅ | ❌ (context) | ❌ | ❌ | ✅ | ✅ |
| brands | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| jobs | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| scheduling | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| toby | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| maestro | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ai-team | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| prompts | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**4 major features have no feature module at all.** They collectively represent 4,633 lines.

### 🟡 Dependency Direction Violation

`shared/components/GodAutomation.tsx` imports from `@/features/brands`. Shared code should not depend on feature modules — this creates a circular architectural dependency.

---

## 7. External Dependencies

| Package | Purpose |
|---------|---------|
| `react`, `react-dom` | UI framework |
| `react-router-dom` | Client-side routing |
| `@tanstack/react-query` | Server state management |
| `react-hot-toast` | Toast notifications |
| `lucide-react` | Icon library |
| `recharts` | Charting library (Analytics page) |
| `konva`, `react-konva`, `use-image` | Canvas rendering (PostCanvas, Carousels) |
| `clsx` | Conditional CSS class names |
| `date-fns` | Date formatting |
| `tailwindcss`, `postcss` | Styling |

---

## 8. Summary of Critical Findings

### Priority 1 — Must Fix
1. **Duplicate brand config** in `PostCanvas.tsx` and `features/brands/model/` — merge into single source
2. **`Brands.tsx` is 2,043 lines with 37 useState** — extract sub-components and custom hooks
3. **4 pages bypass the feature layer** (Toby, Maestro, AITeam, Prompts = 4,633 lines of inline API logic)

### Priority 2 — Should Fix
4. **`GodAutomation.tsx` at 1,633 lines** — extract inline sub-components to separate files
5. **`Carousels.tsx` is dead code** (286 lines) — delete or wire to routes
6. **`features/settings/` is incomplete** — add proper module structure
7. **6 god pages (>1,000 lines each)** — need decomposition

### Priority 3 — Nice to Have
8. Merge `shared/lib/captionUtils.ts` into relevant feature module
9. Audit `PostCanvas.tsx` 30 exports for unused items
10. Standardize import style (always use barrel exports)

### Lines Distribution

| Category | Lines | % of Total |
|----------|------:|:----------:|
| Pages | 14,650 | 68.6% |
| Shared components | 2,698 | 12.6% |
| Feature modules | 1,556 | 7.3% |
| App shell | 475 | 2.2% |
| Types + API client | 207 | 1.0% |
| CSS | 337 | 1.6% |
| Barrel exports + glue | 72 | 0.3% |
| **Total** | **21,366** | **100%** |

**68.6% of the codebase lives in page components** — a clear indicator that logic extraction into feature modules has significant room for growth.
