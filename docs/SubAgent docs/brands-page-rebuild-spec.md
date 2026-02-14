# Brands Page Rebuild — Comprehensive Spec

> Generated: 2025-02-14  
> Scope: Rebuild the Brands page with 3 tabs (My Brands, Templates, Connections)

---

## 1. Current File Structure & Responsibilities

### Pages
| File | Purpose |
|------|---------|
| `src/pages/Brands.tsx` | Main brands page — lists brands sorted by schedule offset, opens Settings/Theme modals, fetches logos via raw `fetch()` |
| `src/pages/Connected.tsx` | Separate connections page — shows per-brand IG/FB/YT connection status, supports YouTube connect/disconnect |

### Feature: `src/features/brands/`

| File | Purpose |
|------|---------|
| `index.ts` | Barrel — re-exports everything from model, components, hooks, api, constants |
| `constants.ts` | `BrandInfo`, `BrandTheme` types; hardcoded `BRAND_SCHEDULES`, `BRAND_THEMES`, `COLOR_PRESETS`; `generateSchedule()`, `formatHour()`, `generateModeColors()`, `adjustColorBrightness()` |
| **api/** | |
| `api/index.ts` | Re-exports `connections-api` + `use-brands` |
| `api/connections-api.ts` | Types (`PlatformConnection`, `BrandConnectionStatus`, `BrandConnectionsResponse`, `BrandInfo`, `BrandsListResponse`) + functions (`fetchBrandConnections`, `fetchBrandsList`, `getYouTubeConnectUrl`, `disconnectYouTube`) — all use `apiClient` |
| `api/use-brands.ts` | React Query hooks + types for v2 API: `useBrands`, `useBrandIds`, `useBrand`, `useBrandColors`, `useCreateBrand`, `useUpdateBrand`, `useUpdateBrandCredentials`, `useDeleteBrand`, `useReactivateBrand` — all use `apiClient` |
| **hooks/** | |
| `hooks/index.ts` | Re-exports `use-connections` + `use-dynamic-brands` |
| `hooks/use-connections.ts` | React Query wrappers: `useBrandConnections`, `useBrandsList`, `useDisconnectYouTube` |
| `hooks/use-dynamic-brands.ts` | `useDynamicBrands()` — merges API brands with static fallback, registers into BRAND_CONFIG cache |
| **model/** | |
| `model/index.ts` | Re-exports `brand-config` |
| `model/brand-config.ts` | Static `BRAND_CONFIG` map, `ALL_BRANDS` array, `registerBrand()`, `getBrandLabel()`, `getBrandColor()` |
| **components/** | |
| `components/index.ts` | Re-exports all brand components |
| `components/BrandBadge.tsx` | Small colored badge showing brand name |
| `components/BrandSettingsModal.tsx` | Modal: connection status (read-only), schedule offset/posts-per-day editing, save via `useUpdateBrand` |
| `components/BrandThemeModal.tsx` | Modal: logo upload, brand/light/dark color editing, live preview. **BUG: uses raw `fetch()` for theme GET/POST — no auth headers** |
| `components/CreateBrandModal.tsx` | 4-step wizard: (1) Identity (name/id/logo), (2) Colors (presets + custom + reel mockup), (3) Schedule (offset slider + full timeline), (4) Platform credentials. **BUG: logo upload on step 4 uses raw `fetch()` for theme POST — no auth headers** |

### Shared
| File | Purpose |
|------|---------|
| `src/shared/api/client.ts` | `apiClient` — auto-attaches Supabase JWT; has `get`, `post`, `put`, `delete`, `patch` |
| `src/shared/components/Modal.tsx` | Reusable modal with sizes sm/md/lg/xl, Escape close, backdrop click close, scroll lock |
| `src/shared/components/LoadingSpinner.tsx` | `LoadingSpinner`, `FullPageLoader`, `CardLoader` |
| `src/shared/components/StatusBadge.tsx` | Generic status badge |
| `src/shared/types/index.ts` | `BrandName = string`, `Job`, `ScheduledPost`, etc. |

### Routing
| File | Detail |
|------|--------|
| `src/app/routes/index.tsx` | `/brands` → `BrandsPage`, `/connected` → `ConnectedPage` (both behind `AuthGuard`) |
| `src/app/layout/AppLayout.tsx` | Settings dropdown: "Connected Pages" → `/connected`, "Brand Settings" → `/brands` |
| `app/main.py` | FastAPI catch-all routes serve `index.html` for `/brands` and `/connected` |

---

## 2. Current Brands Page Functionality

### What Works
- Lists brands from `useBrandsList()` (legacy `/api/brands/list`)
- Sorts by schedule offset (from `useBrands()` v2 API, with hardcoded fallback)
- Shows brand logo (from theme endpoint), color, name, ID, connection count, schedule preview
- "Create Brand" button → 4-step modal wizard
- "Settings" button → modal with connection status + schedule editing
- "Theme" button → modal with logo/color editing
- "Add new brand" card at bottom

### What's Broken / Sub-optimal
1. **Auth bug**: `Brands.tsx` L36-50, L55-68 use raw `fetch()` for `/api/brands/{id}/theme` — **no auth headers** (will fail with 401 when auth middleware is enforced)
2. **Auth bug**: `BrandThemeModal.tsx` L61-80 (GET theme) and L120-130 (POST theme) use raw `fetch()` — same issue
3. **Auth bug**: `CreateBrandModal.tsx` L203-210 (POST theme for logo upload) uses raw `fetch()` — same issue
4. **Auth bug**: `Connected.tsx` L183-200 (GET theme for logos) uses raw `fetch()` — same issue
5. **Dual data sources**: Uses both `useBrandsList()` (legacy) and `useBrands()` (v2) simultaneously
6. **Hardcoded fallbacks**: `BRAND_SCHEDULES`, `BRAND_THEMES` still have hardcoded data for 5 original brands
7. **No delete UI**: `useDeleteBrand` hook exists but no delete button in UI
8. **Separate pages**: Brands and Connections are two separate pages/routes, causing navigation friction
9. **No template management**: Templates are stored in `assets/templates/{brand}/` but have no UI for managing them

---

## 3. Current Connected Page Functionality

### What Works
- Lists all brands with their IG/FB/YT connection status
- Connection summary (total connected / total possible)
- YouTube: connect (OAuth redirect), disconnect, reconnect (revoked), change channel
- IG/FB: shows status (connected/not connected) with external links
- OAuth config warnings (YouTube not configured)

### What's Broken
1. **Auth bug**: Same raw `fetch()` for logo loading (L183-200)
2. **IG/FB not manageable**: Instagram/Facebook connections can't be connect/disconnect from this UI — only viewable
3. **Duplication**: Header, logo fetching, brand listing logic duplicated between Brands and Connected pages

---

## 4. Backend API Endpoints

All under `/api/v2/brands` (also mounted at `/api/brands` for backward compat).  
All require `Authorization: Bearer <jwt>` header.

### Brand CRUD
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v2/brands` | List all active brands (query: `include_inactive=true`) |
| `GET` | `/api/v2/brands/list` | Legacy format: `{brands: [{id, name, color, logo}]}` |
| `GET` | `/api/v2/brands/ids` | Just brand IDs: `{brand_ids: [...]}` |
| `GET` | `/api/v2/brands/connections` | Connection status for all brands (IG/FB/YT) |
| `POST` | `/api/v2/brands/seed` | Seed default brands if none exist |
| `GET` | `/api/v2/brands/{brand_id}` | Get single brand |
| `GET` | `/api/v2/brands/{brand_id}/colors` | Get brand colors only |
| `POST` | `/api/v2/brands` | Create brand (body: `CreateBrandRequest`) |
| `PUT` | `/api/v2/brands/{brand_id}` | Update brand (body: `UpdateBrandRequest`) |
| `PUT` | `/api/v2/brands/{brand_id}/credentials` | Update platform credentials |
| `DELETE` | `/api/v2/brands/{brand_id}` | Soft delete (deactivate) |
| `POST` | `/api/v2/brands/{brand_id}/reactivate` | Reactivate deleted brand |

### Theme Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v2/brands/{brand_id}/theme` | Get theme (colors + logo path) |
| `POST` | `/api/v2/brands/{brand_id}/theme` | Update theme (multipart: colors + optional logo file) |

### YouTube (separate router)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/youtube/connect?brand=X` | Start YouTube OAuth flow |
| `POST` | `/api/youtube/disconnect/{brand}` | Disconnect YouTube channel |

---

## 5. Implementation Plan: 3-Tab Brands Page

### 5.1 Overview

Merge `/brands` and `/connected` into a single unified Brands page with 3 tabs:

```
┌──────────────────────────────────────────────────┐
│  Brands                              [+ Create]  │
│                                                   │
│  [My Brands]  [Templates]  [Connections]          │
│  ─────────────────────────────────────────────    │
│                                                   │
│  (Tab content)                                    │
│                                                   │
└──────────────────────────────────────────────────┘
```

### 5.2 Tab 1: My Brands

**Purpose**: List, create, edit, delete brands.

**Layout**: Card list (current layout is good). Each card shows:
- Brand color sidebar + logo/initials
- Brand name, ID
- Connection count (X/3)
- Schedule preview (offset + posting times)
- Action buttons: **Settings** | **Theme** | **Delete**

**Changes from current**:
- Add **Delete** button (with confirmation dialog) — calls `useDeleteBrand`
- Remove separate "Brand Features" info box (unnecessary)
- Keep "Create Brand" button in header + dashed card at bottom
- Keep CreateBrandModal, BrandSettingsModal, BrandThemeModal as modals

**Data**: Use `useBrands()` (v2 API) as the single source of truth. Remove `useBrandsList()` usage.

### 5.3 Tab 2: Templates

**Purpose**: View and manage content templates per brand.

**Initial implementation** (MVP):
- Grid of brands, each showing available template files
- Preview template images
- Upload new templates
- Delete templates

**Data**: Templates stored in `assets/templates/{brand}/`. Need a backend API for template CRUD (or use a file-listing endpoint).

> Note: This tab can be a placeholder initially if template API doesn't exist yet. Show "Coming Soon" with a preview of what it will do.

### 5.4 Tab 3: Connections

**Purpose**: Manage platform connections (IG, FB, YouTube) for each brand.

**Layout**: Migrated from current `Connected.tsx`:
- Connection summary bar at top
- Brand cards in grid (2 columns on lg)
- Each card: brand header + IG/FB/YT rows with connect/disconnect actions
- YouTube OAuth connect/disconnect
- Meta credentials editing (moved from CreateBrandModal step 4)

**Changes from current**:
- Fix auth bug (use `apiClient` for theme/logo fetching)
- Add ability to edit Meta credentials inline (IG Account ID, FB Page ID, Meta token) via `useUpdateBrandCredentials`
- Remove standalone `/connected` route (redirect to `/brands?tab=connections`)

---

## 6. Component Hierarchy

```
src/pages/Brands.tsx (rebuilt)
├── BrandsPageHeader         — title, subtitle, Create Brand button
├── BrandsTabBar             — My Brands | Templates | Connections
├── Tab: MyBrandsTab
│   ├── BrandCard (per brand)
│   │   ├── brand color sidebar
│   │   ├── brand info (logo, name, id, connections, schedule)
│   │   └── action buttons (Settings, Theme, Delete)
│   ├── CreateBrandCard (dashed "add new" card)
│   └── ScheduleInfoBanner
├── Tab: TemplatesTab
│   ├── BrandTemplateGroup (per brand)
│   │   └── TemplateCard (per template)
│   └── EmptyState / ComingSoon
├── Tab: ConnectionsTab
│   ├── ConnectionSummaryBar
│   ├── ConnectionCard (per brand) — migrated from Connected.tsx
│   │   ├── BrandHeader (logo, name, X/3 connected)
│   │   └── PlatformRow (per platform: IG, FB, YT)
│   │       ├── status badge
│   │       ├── connect/disconnect/reconnect actions
│   │       └── external link
│   └── OAuthWarnings
│
├── Modal: CreateBrandModal (existing, fix auth)
├── Modal: BrandSettingsModal (existing)
├── Modal: BrandThemeModal (existing, fix auth)
└── Modal: DeleteBrandDialog (new)
```

---

## 7. Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `src/features/brands/components/BrandsTabBar.tsx` | Tab bar component (My Brands / Templates / Connections) |
| `src/features/brands/components/MyBrandsTab.tsx` | Tab 1 content — brand cards list |
| `src/features/brands/components/TemplatesTab.tsx` | Tab 2 content — template management (MVP: placeholder) |
| `src/features/brands/components/ConnectionsTab.tsx` | Tab 3 content — migrated from Connected.tsx |
| `src/features/brands/components/ConnectionCard.tsx` | Single brand connection card (extracted from Connected.tsx) |
| `src/features/brands/components/ConnectionSummaryBar.tsx` | Summary stats bar (extracted from Connected.tsx) |
| `src/features/brands/components/DeleteBrandDialog.tsx` | Confirmation dialog for brand deletion |
| `src/features/brands/components/BrandCard.tsx` | Individual brand card for My Brands tab (extracted from Brands.tsx inline JSX) |

### Modified Files

| File | Changes |
|------|---------|
| `src/pages/Brands.tsx` | **Rebuild**: simple shell with tab state + render selected tab component |
| `src/pages/Connected.tsx` | **Delete** (functionality moves into ConnectionsTab) |
| `src/app/routes/index.tsx` | Remove `/connected` route (or redirect to `/brands`) |
| `src/app/layout/AppLayout.tsx` | Update settings dropdown: remove "Connected Pages" link, rename "Brand Settings" → "Brands" |
| `app/main.py` | Remove `serve_connected()` route (or redirect to `/brands`) |
| `src/features/brands/components/index.ts` | Add new component exports |
| `src/features/brands/components/BrandThemeModal.tsx` | **Fix**: replace raw `fetch()` with `apiClient` for theme GET/POST |
| `src/features/brands/components/CreateBrandModal.tsx` | **Fix**: replace raw `fetch()` with `apiClient` for logo upload |

### Files to Keep Unchanged

| File | Reason |
|------|--------|
| `src/features/brands/api/*` | Already correct, uses `apiClient` |
| `src/features/brands/hooks/*` | Already correct |
| `src/features/brands/model/*` | Static fallback, still needed |
| `src/features/brands/constants.ts` | Utility functions still used |
| `src/shared/api/client.ts` | No changes needed |
| `src/shared/components/Modal.tsx` | Reusable, no changes needed |

---

## 8. Auth Bug Fix Details

### Problem
Theme endpoints use raw `fetch()` without auth headers. The `apiClient` auto-attaches the Supabase JWT.

### Affected Locations

#### `Brands.tsx` — logo fetching (lines 36-50, 55-68)
```ts
// BEFORE (broken):
const response = await fetch(`/api/brands/${brand.id}/theme`)

// AFTER (fixed):
const response = await apiClient.get(`/api/brands/${brand.id}/theme`)
```

#### `BrandThemeModal.tsx` — GET theme (line ~61)
```ts
// BEFORE:
const response = await fetch(`/api/brands/${brand.id}/theme`)

// AFTER:
import { apiClient } from '@/shared/api/client'
const data = await apiClient.get(`/api/brands/${brand.id}/theme`)
```

#### `BrandThemeModal.tsx` — POST theme (line ~120)
```ts
// BEFORE:
const response = await fetch(`/api/brands/${brand.id}/theme`, {
  method: 'POST',
  body: formData
})

// AFTER:
// apiClient doesn't support FormData directly, so use raw fetch with auth headers:
import { supabase } from '@/shared/api/supabase'
const { data: { session } } = await supabase.auth.getSession()
const response = await fetch(`/api/brands/${brand.id}/theme`, {
  method: 'POST',
  headers: {
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  },
  body: formData,
})
```

#### `CreateBrandModal.tsx` — POST logo (line ~203)
```ts
// Same pattern as BrandThemeModal POST — use fetch with manual auth header
```

#### `Connected.tsx` — logo fetching (line ~183)
```ts
// This file will be deleted; the logic moves to ConnectionsTab.tsx using apiClient
```

---

## 9. Design Tokens (from tailwind.config.js + index.css)

### Colors
- **Primary**: `#00435c` (50–900 scale in tailwind)
- **Brand colors**: gym `#00435c`, healthy `#2e7d32`, vitality `#c2185b`, longevity `#6a1b9a`
- **Semantic**: success `#10b981`, warning `#f59e0b`, error `#ef4444`, info `#3b82f6`

### Components (from `@layer components`)
- `.btn` — base button: `inline-flex items-center justify-center gap-2 px-4 py-2 font-medium rounded-lg transition-all`
- `.btn-secondary` — gray bg
- `.btn-success` — green bg
- `.btn-danger` — red bg
- `.input` — `w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500`
- `.card` — `bg-white rounded-xl shadow-sm border border-gray-100`
- `.badge` — `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium`

### Shadows
- `--shadow-sm`, `--shadow`, `--shadow-md`, `--shadow-lg`

### Radii
- `--radius: 8px`, `--radius-lg: 12px`

### Transitions
- `--transition-fast: 150ms`, `--transition: 200ms`

---

## 10. Tab URL Strategy

Use query parameter for tab state (bookmarkable, shareable):

```
/brands              → defaults to "my-brands" tab
/brands?tab=templates
/brands?tab=connections
```

When `/connected` is visited, redirect to `/brands?tab=connections`.

---

## 11. Implementation Order

1. **Fix auth bugs** in existing modals (BrandThemeModal, CreateBrandModal) — quick win, unblocks everything
2. **Extract components** from current Brands.tsx/Connected.tsx into feature components (BrandCard, ConnectionCard, etc.)
3. **Build tab infrastructure** (BrandsTabBar, tab state management)
4. **Build MyBrandsTab** — wrap extracted BrandCard list + add Delete button
5. **Build ConnectionsTab** — migrate Connected.tsx content
6. **Build TemplatesTab** — placeholder / MVP
7. **Rebuild Brands.tsx** — thin shell composing tabs
8. **Update routing** — remove `/connected`, update sidebar nav
9. **Clean up** — remove Connected.tsx, remove unused hardcoded constants

---

## 12. Notes

- The backend already has all CRUD endpoints needed. No backend changes required.
- The `useDeleteBrand` hook already exists but has no UI — just needs a button + confirmation dialog.
- `FormData` uploads (theme POST with logo) can't use `apiClient` directly since it sets `Content-Type: application/json`. Use raw `fetch()` with manual auth header for these cases.
- The `useBrandsList()` hook (legacy) can be deprecated in favor of `useBrands()` (v2) which returns richer data.
- Consider keeping `/connected` as a redirect for a while for backward compat (bookmarks, shared links).
