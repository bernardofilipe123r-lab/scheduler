# Brand Settings Frontend Audit

> Complete component tree, data flow, and save/load mechanics for the Brands page.

---

## 1. Files Read (35 files total)

### Page
| File | Key Contents |
|------|-------------|
| `src/pages/Brands.tsx` | Top-level page: renders `BrandsTabBar` + 4 tab panels based on URL `?tab=` param |

### Components (`src/features/brands/components/`)
| File | Key Contents |
|------|-------------|
| `index.ts` | Barrel export for all 13 brand components |
| `BrandsTabBar.tsx` | 4 tabs: `brands`, `prompts`, `connections`, `settings` — type `BrandsTab` |
| `MyBrandsTab.tsx` | Lists brands via `useBrands()`, shows BrandCard per brand, opens Settings/Theme/Create/Delete modals |
| `BrandCard.tsx` | Card with schedule preview, connection count badge, Settings/Theme/Delete buttons |
| `BrandSettingsModal.tsx` | Per-brand schedule editor (offset + posts_per_day) — saves via `useUpdateBrand()` |
| `BrandThemeModal.tsx` | Per-brand theme/color editor with live preview — saves via `POST /api/brands/{id}/theme` (FormData) |
| `CreateBrandModal.tsx` | 3-step wizard: Identity → Colors → Platform Credentials — saves via `useCreateBrand()` + logo upload |
| `DeleteBrandDialog.tsx` | Confirmation dialog — calls `useDeleteBrand()` (soft delete) |
| `ContentPromptsCard.tsx` | **Content Prompts tab** — 3 textareas, fetches/saves via `useContentPrompts()`/`useUpdateContentPrompts()` |
| `SettingsTab.tsx` | Settings tab — global app settings + per-brand Meta credentials |
| `ConnectionsTab.tsx` | Lists brand connections (IG/FB/YT status) via `useBrandConnections()` |
| `ConnectionCard.tsx` | Single brand connection card with YouTube connect/disconnect |
| `ConnectionSummaryBar.tsx` | Summary bar: total connections across all brands |
| `BrandBadge.tsx` | Colored badge component for brand names |

### API Hooks (`src/features/brands/api/`)
| File | Key Contents |
|------|-------------|
| `index.ts` | Barrel: re-exports `connections-api` and `use-brands` |
| `use-brands.ts` | Full CRUD hooks: `useBrands`, `useBrand`, `useCreateBrand`, `useUpdateBrand`, `useDeleteBrand`, `useUpdateBrandCredentials`, etc. All use `apiClient` and TanStack Query |
| `use-prompts.ts` | `useContentPrompts()` → `GET /api/v2/brands/prompts`; `useUpdateContentPrompts()` → `PUT /api/v2/brands/prompts` |
| `connections-api.ts` | Functions: `fetchBrandConnections`, `fetchBrandsList`, `connectYouTube`, `disconnectYouTube` |

### Model (`src/features/brands/model/`)
| File | Key Contents |
|------|-------------|
| `index.ts` | Re-exports `brand-config` |
| `brand-config.ts` | Static fallback `BRAND_CONFIG`, `registerBrand()`, `getBrandLabel()`, `getBrandColor()` |

### Hooks (`src/features/brands/hooks/`)
| File | Key Contents |
|------|-------------|
| `index.ts` | Re-exports `use-connections` and `use-dynamic-brands` |
| `use-connections.ts` | `useBrandConnections()` (TanStack Query, 30s refetch), `useBrandsList()`, `useDisconnectYouTube()` |
| `use-dynamic-brands.ts` | `useDynamicBrands()` — merges API brands into runtime config cache, returns `DynamicBrandInfo[]` |

### Constants
| File | Key Contents |
|------|-------------|
| `constants.ts` | `BrandInfo`, `BrandTheme` interfaces; hardcoded `BRAND_THEMES`; `COLOR_PRESETS`; `generateSchedule()`; `generateModeColors()` |
| `index.ts` (feature) | Barrel: re-exports model, components, hooks, api, constants |

### Shared API (`src/shared/api/`)
| File | Key Contents |
|------|-------------|
| `client.ts` | `apiClient` with `get/post/put/delete/patch` — auto-attaches Supabase JWT, 30s timeout |
| `supabase.ts` | Supabase client init from env vars |
| `index.ts` | Re-exports `client.ts` |
| `use-layout-settings.ts` | `useLayoutSettings()` → `GET /api/v2/brands/settings/layout`; `useUpdateLayoutSettings()` → `PUT /api/v2/brands/settings/layout` |

### Shared Types (`src/shared/types/`)
| File | Key Contents |
|------|-------------|
| `index.ts` | `BrandName = string`; `JobStatus`, `BrandStatus`, `Variant`, `BrandOutput`, `Job`, `ScheduledPost`, etc. |

### Settings Feature
| File | Key Contents |
|------|-------------|
| `src/features/settings/api/use-settings.ts` | `useSettings()`, `useBulkUpdateSettings()` — for global `app_settings` table |

### Backend
| File | Key Contents |
|------|-------------|
| `app/api/brands_routes_v2.py` | All `/api/v2/brands/*` endpoints: CRUD, prompts, credentials, connections, theme, layout settings, seed |
| `app/models/config.py` | `AppSettings` model — `app_settings` table with key/value/category/value_type/sensitive columns |

---

## 2. Component Tree

```
BrandsPage (src/pages/Brands.tsx)
├── BrandsTabBar
│   └── 4 tabs: [brands, prompts, connections, settings]
│
├── Tab: "brands" → MyBrandsTab
│   ├── BrandCard[] (one per brand)
│   │   └── Buttons: Settings, Theme, Delete
│   ├── "Create New Brand" card
│   ├── Modal → BrandSettingsModal (schedule offset, posts/day)
│   ├── Modal → BrandThemeModal (per-brand color editor + logo)
│   ├── Modal → CreateBrandModal (3-step wizard)
│   └── DeleteBrandDialog
│
├── Tab: "prompts" → ContentPromptsCard
│   └── 3 textarea fields + Save button
│
├── Tab: "connections" → ConnectionsTab
│   ├── ConnectionSummaryBar
│   └── ConnectionCard[] (one per brand)
│       └── Platform rows: Instagram, Facebook, YouTube
│
└── Tab: "settings" → SettingsTab
    ├── Brand Connections section (per-brand Meta credentials)
    └── Settings by Category (from app_settings table)
```

---

## 3. Tabs Structure

| Tab Key | Label | Component | Icon |
|---------|-------|-----------|------|
| `brands` | My Brands | `MyBrandsTab` | `Layers` |
| `prompts` | Content Prompts | `ContentPromptsCard` | `FileText` |
| `connections` | Connections | `ConnectionsTab` | `Link2` |
| `settings` | Settings | `SettingsTab` | `Settings` |

Tab selection is URL-driven via `?tab=` search param. Default is `brands` (no param).

---

## 4. Content Prompts Tab — Complete Implementation

### Component: `ContentPromptsCard`

#### Fields
| Key | Label | Placeholder |
|-----|-------|-------------|
| `reels_prompt` | Reels Prompt | Instructions for AI reel generation: topics, hooks, tone, format rules... |
| `posts_prompt` | Posts Prompt | Instructions for AI carousel generation: topics, title styles, slide format, references... |
| `brand_description` | Brand Description | Brand identity: target audience, content focus, tone of voice, content philosophy... |

All 3 fields are `<textarea rows={3}>` with `resize-y`.

#### State Management
- Local state: `values = { reels_prompt, posts_prompt, brand_description }` (strings)
- `dirty` boolean tracks if any field changed since last load/save
- On data load (`useEffect` on `data`): populate `values`, reset `dirty`
- On field change: update `values`, set `dirty = true`

#### Load Flow
```
ContentPromptsCard mounts
  → useContentPrompts() hook
    → TanStack Query, key: ['brand-prompts'], staleTime: 5min
      → fetchPrompts()
        → apiClient.get<ContentPrompts>('/api/v2/brands/prompts')
          → Backend: GET /api/v2/brands/prompts
            → Queries app_settings WHERE key IN ('reels_prompt', 'posts_prompt', 'brand_description')
            → Returns { reels_prompt: "", posts_prompt: "", brand_description: "" }
```

#### Save Flow
```
User edits textareas → dirty = true → Save button enables
  → handleSave()
    → updateMutation.mutateAsync(values)
      → useUpdateContentPrompts() hook
        → updatePrompts(data)
          → apiClient.put<ContentPrompts>('/api/v2/brands/prompts', data)
            → Backend: PUT /api/v2/brands/prompts
              → UpdatePromptsRequest Pydantic model validates
              → For each non-null key: upsert into app_settings table
                → If row exists: update value
                → If row doesn't exist: INSERT with category="content", value_type="string"
              → db.commit()
              → Returns { success: true, reels_prompt, posts_prompt, brand_description }
    → On success: toast.success('Prompts saved'), dirty = false
    → On error: toast.error('Failed to save prompts')
    → Query invalidation: ['brand-prompts'] key
```

#### TypeScript Interface
```typescript
// From use-prompts.ts
export interface ContentPrompts {
  reels_prompt: string
  posts_prompt: string
  brand_description: string
}
```

#### Backend Model (Pydantic)
```python
class UpdatePromptsRequest(BaseModel):
    reels_prompt: Optional[str] = None
    posts_prompt: Optional[str] = None
    brand_description: Optional[str] = None
```

---

## 5. Types/Interfaces Used for Brand Data

### Frontend Types

```typescript
// use-brands.ts
interface Brand {
  id: string
  display_name: string
  short_name: string
  instagram_handle?: string
  facebook_page_name?: string
  youtube_channel_name?: string
  schedule_offset: number
  posts_per_day: number
  baseline_for_content: boolean
  colors: BrandColors
  logo_path?: string
  active: boolean
  has_instagram: boolean
  has_facebook: boolean
  created_at?: string
  updated_at?: string
}

interface BrandColors {
  primary: string
  accent: string
  color_name: string
  light_mode?: { background, gradient_start?, gradient_end?, text, cta_bg?, cta_text? }
  dark_mode?: { background, gradient_start?, gradient_end?, text, cta_bg?, cta_text? }
}

// constants.ts
interface BrandInfo { id: string; name: string; color: string; logo: string }
interface BrandTheme { brandColor, light/darkThumbnailTextColor, light/darkContentTitleTextColor, light/darkContentTitleBgColor }

// brand-config.ts
interface BrandConfig { id: BrandName; label: string; color: string; bgClass: string; textClass: string }

// use-dynamic-brands.ts
interface DynamicBrandInfo { id, label, color, shortName, scheduleOffset, active }

// shared/types
type BrandName = string  // dynamic, accepts any brand ID
```

### Backend Types (Pydantic)

```python
class BrandResponse:
    id, display_name, short_name, instagram_handle?, facebook_page_name?,
    youtube_channel_name?, schedule_offset, posts_per_day, baseline_for_content,
    colors: Dict, logo_path?, active, has_instagram, has_facebook, created_at?, updated_at?

class ColorConfig:
    primary, accent, color_name, light_mode?: Dict, dark_mode?: Dict
```

---

## 6. Settings Storage Architecture

### Two Storage Mechanisms

#### 1. `app_settings` table (global key-value store)
- **Model**: `AppSettings` (key PK, value TEXT, description, category, value_type, sensitive, updated_at)
- **Used by**:
  - Content Prompts: keys `reels_prompt`, `posts_prompt`, `brand_description` (category: "content")
  - Layout Settings: key `layout_settings_{user_id}` (category: "layout", type: "json")
  - Global Settings: `youtube_client_id`, `youtube_client_secret`, `youtube_redirect_uri`, `default_caption_count`, `default_content_lines`, `default_posts_per_day`, `scheduling_timezone` (various categories)
- **API**: `/api/settings/*` for global settings; `/api/v2/brands/prompts` for content prompts; `/api/v2/brands/settings/layout` for layout

#### 2. `brands` table (per-brand data)
- **Model**: `Brand` (SQLAlchemy)
- **Used by**: All per-brand data (name, colors, schedule, credentials, theme, logo)
- **API**: `/api/v2/brands/*`

### What's Stored Where

| Data | Table | Access Pattern |
|------|-------|---------------|
| Brand identity (name, ID, short_name) | brands | `GET/PUT /api/v2/brands/{id}` |
| Brand colors/theme | brands (colors JSON) | `GET/POST /api/v2/brands/{id}/theme` |
| Schedule (offset, posts_per_day) | brands | `PUT /api/v2/brands/{id}` |
| Platform credentials (Meta tokens) | brands | `GET /api/v2/brands/credentials`, `PUT /api/v2/brands/{id}/credentials` |
| Logo | brands (logo_path) + Supabase Storage | `POST /api/v2/brands/{id}/theme` (FormData) |
| Content prompts (reels, posts, brand desc) | app_settings | `GET/PUT /api/v2/brands/prompts` |
| Layout settings | app_settings | `GET/PUT /api/v2/brands/settings/layout` |
| Global app settings (YouTube keys, defaults) | app_settings | `GET/PUT /api/settings/*` |
| YouTube OAuth channels | youtube_channels | `GET /api/v2/brands/connections` |

---

## 7. API Hooks Summary

### Brand CRUD (`use-brands.ts`)
| Hook | Method | Endpoint | Query Key |
|------|--------|----------|-----------|
| `useBrands()` | GET | `/api/v2/brands` | `['brands', 'list']` |
| `useBrandIds()` | GET | `/api/v2/brands/ids` | `['brands', 'ids']` |
| `useBrand(id)` | GET | `/api/v2/brands/{id}` | `['brands', 'detail', id]` |
| `useBrandColors(id)` | GET | `/api/v2/brands/{id}/colors` | `['brands', 'colors', id]` |
| `useCreateBrand()` | POST | `/api/v2/brands` | invalidates `['brands']` |
| `useUpdateBrand()` | PUT | `/api/v2/brands/{id}` | invalidates detail + list |
| `useDeleteBrand()` | DELETE | `/api/v2/brands/{id}` | invalidates `['brands']` |
| `useReactivateBrand()` | POST | `/api/v2/brands/{id}/reactivate` | invalidates `['brands']` |
| `useUpdateBrandCredentials()` | PUT | `/api/v2/brands/{id}/credentials` | invalidates detail + connections |

### Content Prompts (`use-prompts.ts`)
| Hook | Method | Endpoint | Query Key |
|------|--------|----------|-----------|
| `useContentPrompts()` | GET | `/api/v2/brands/prompts` | `['brand-prompts']` |
| `useUpdateContentPrompts()` | PUT | `/api/v2/brands/prompts` | invalidates `['brand-prompts']` |

### Connections (`use-connections.ts`)
| Hook | Method | Endpoint | Query Key |
|------|--------|----------|-----------|
| `useBrandConnections()` | GET | `/api/brands/connections` | `['brand-connections']` (30s refetch) |
| `useBrandsList()` | GET | `/api/brands/list` | `['brands-list']` |
| `useDisconnectYouTube()` | POST | `/api/youtube/disconnect/{brand}` | invalidates `['brand-connections']` |

### Layout Settings (`use-layout-settings.ts`)
| Hook | Method | Endpoint | Query Key |
|------|--------|----------|-----------|
| `useLayoutSettings()` | GET | `/api/v2/brands/settings/layout` | `['layout-settings']` |
| `useUpdateLayoutSettings()` | PUT | `/api/v2/brands/settings/layout` | invalidates `['layout-settings']` |

### Global Settings (`use-settings.ts`)
| Hook | Method | Endpoint | Query Key |
|------|--------|----------|-----------|
| `useSettings()` | GET | `/api/settings` | `['settings', 'list', category]` |
| `useBulkUpdateSettings()` | POST | `/api/settings/bulk` | invalidates `['settings']` |

---

## 8. Key Observations

1. **Content Prompts are GLOBAL** — stored in `app_settings`, NOT per-brand. All brands share the same `reels_prompt`, `posts_prompt`, and `brand_description`.

2. **Theme colors are stored in brands table** as a nested JSON `colors` column, accessed via legacy-style `/api/brands/{id}/theme` endpoints (FormData POST, not JSON).

3. **Two separate connections APIs exist**: legacy `/api/brands/connections` and v2 `/api/v2/brands/connections` — the frontend currently uses the legacy path from `connections-api.ts` but also hits v2 credentials endpoint from `SettingsTab`.

4. **BrandThemeModal saves via raw fetch** (not `apiClient`) because it uses FormData for logo upload — it manually gets the Supabase JWT.

5. **Static fallbacks still exist** in `brand-config.ts` and `constants.ts` with hardcoded brand data — used when API hasn't loaded yet.

6. **No per-brand prompts** — the Content Prompts tab is a single set of prompts shared across all brands. There's no way to set different reels/posts prompts per brand from the UI.

7. **Layout settings are per-user** — stored as `layout_settings_{user_id}` in app_settings with JSON value type.
