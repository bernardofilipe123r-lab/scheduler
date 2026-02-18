# Frontend Generation Flows — Research Spec

## Overview

Three main generation flows exist in the frontend:

1. **Reels Generation** — `Generator.tsx` page (`/generator` route)
2. **Carousel Posts Generation** — `Posts.tsx` page (`/posts` route)
3. **Prompts Inspection** — `Prompts.tsx` page (shared between reels & posts via `contentType` prop)

---

## 1. Reels Flow (`src/pages/Generator.tsx`)

### Page: `GeneratorPage`

Two action buttons at the bottom:

### 1a. "🎬 Generate Reels" (Manual Submit)

**Trigger:** Form submit (`handleSubmit`)

**Validation:**
- Title must not be empty
- At least one brand selected
- At least one content line (newline-separated)
- At least one platform selected

**Pre-processing (dark variant only):**
If `variant === 'dark'` and `aiPrompt` is blank, auto-generates an image prompt first:
- **Endpoint:** `POST /reels/generate-image-prompt`
- **Payload:** `{ title: string }`
- **Response:** `{ image_prompt: string }`

**Job creation:**
- **Hook:** `useCreateJob()` → `jobsApi.create()`
- **Endpoint:** `POST /jobs/create`
- **Payload (`JobCreateRequest`):**
  ```json
  {
    "title": "string (may contain \\n for line breaks)",
    "content_lines": ["line1", "line2", ...],
    "brands": ["healthycollege", "vitalitycollege", ...],
    "variant": "light" | "dark",
    "ai_prompt": "string | undefined (only for dark variant)",
    "cta_type": "follow_tips" | "sleep_lean" | "workout_plan",
    "platforms": ["instagram", "facebook", "youtube"]
  }
  ```

**After creation:**
- Clears form fields (title, content, aiPrompt)
- Invalidates `['jobs']` query cache
- Shows toast with job ID

### 1b. "🤖 Auto-Generate Viral Reel" Button

**Trigger:** `handleAutoGenerate` (type="button", not form submit)

**Step 1 — AI content generation:**
- **Endpoint:** `POST /reels/auto-generate-content`
- **Payload:** `{}` (empty body)
- **Response:**
  ```json
  {
    "title": "string",
    "content_lines": ["string", ...],
    "image_prompt": "string (optional)",
    "topic_category": "string (optional)",
    "format_style": "string (optional)"
  }
  ```

**What it does:**
- Populates the form with AI-generated content:
  - `title` → balanced across 2 lines via `balanceTitle()`
  - `content_lines` → joined with `\n` into content textarea
  - `image_prompt` → sets `aiPrompt` and switches `variant` to `'dark'`
- Shows toast with title, topic category, and format style
- Pulses highlight animation on title + content fields
- **Does NOT create a job** — user must click "Generate Reels" manually after reviewing

### Form Fields (Reels)

| Field | State Variable | UI Element | Notes |
|-------|---------------|------------|-------|
| Title | `title` | textarea (3 rows) | Line breaks via Enter |
| Variant | `variant` | Radio buttons | `'light'` or `'dark'` |
| AI Background Prompt | `aiPrompt` | textarea (3 rows) | Only shown when `variant === 'dark'` |
| Brands | `selectedBrands` | Checkboxes | Multi-select, all auto-selected on load |
| CTA Type | `ctaType` | Select dropdown | Default: `'follow_tips'` |
| Platforms | `selectedPlatforms` | Checkboxes | Default: all 3 (instagram, facebook, youtube) |
| Content Lines | `content` | textarea (8 rows, mono) | One item per line, `—` or `-` separator |

### CTA Options (Reels)
- `follow_tips` → "👉 Follow for more healthy tips"
- `sleep_lean` → "💬 Comment LEAN - Sleep Lean product"
- `workout_plan` → "💬 Comment PLAN - Workout & nutrition plan"

### Platforms (Reels)
- `instagram` — 📸 Instagram
- `facebook` — 📘 Facebook
- `youtube` — 📺 YouTube

---

## 2. Carousel Posts Flow (`src/pages/Posts.tsx`)

### Page: `PostsPage`

Two action buttons on the right column:

### 2a. "Generate Posts" (Manual Submit)

**Trigger:** `handleSubmit`

**Validation:**
- At least one brand selected
- Title must not be empty

**Job creation:**
- **Hook:** `useCreateJob()` → `jobsApi.create()`
- **Endpoint:** `POST /jobs/create`
- **Payload:**
  ```json
  {
    "title": "string (exact user title)",
    "content_lines": [],
    "brands": ["brandId"],
    "variant": "post",
    "ai_prompt": "string | undefined (user-typed image prompt)",
    "cta_type": "none",
    "fixed_title": true
  }
  ```

**Key differences from Reels:**
- `variant` is always `"post"`
- `content_lines` is always `[]` (empty)
- `cta_type` is always `"none"`
- `fixed_title: true` — tells backend to use exact title (not AI-generated)
- Only ONE brand selected at a time (radio-like behavior via `selectBrand`)
- No platforms field sent

### 2b. "Auto Generate Viral Carrousel Posts" Button

**Trigger:** Opens modal → `handleAutoSubmit`

**Modal behavior:**
- Pre-selects all brands
- User can choose count (1 to N) and toggle individual brands
- Count picker auto-selects first N brands

**Job creation:**
- **Endpoint:** `POST /jobs/create`
- **Payload:**
  ```json
  {
    "title": "Auto-generated posts",
    "content_lines": [],
    "brands": ["brand1", "brand2", ...],
    "variant": "post",
    "cta_type": "none"
  }
  ```

**Key differences from manual:**
- Title is hardcoded: `"Auto-generated posts"`
- No `ai_prompt` sent
- No `fixed_title` flag (so backend generates unique titles per brand)
- Multiple brands can be selected

### 2c. "Generate Prompt" Helper Button

- **Endpoint:** `POST /reels/generate-image-prompt`
- **Payload:** `{ title: string }`
- **Response:** `{ prompt: string }`
- Populates the AI Image Prompt field

### Form Fields (Posts)

| Field | State Variable | UI Element | Notes |
|-------|---------------|------------|-------|
| Title | `title` | textarea (3 rows) | Required for manual generate |
| AI Image Prompt | `aiPrompt` | textarea (3 rows) | Auto-generated if empty |
| Brands | `selectedBrands` | Pills (single select) | Only 1 brand for manual |
| Layout Settings | `settings` | Collapsible panel | fontSize, captionBottom, titleGap, logoGap, titlePaddingX, barWidth, slideFontFamily |

### Layout Settings (Posts only)
Persisted both to `localStorage` and to DB via:
- **Read:** `GET /api/v2/brands/settings/layout`
- **Write:** `PUT /api/v2/brands/settings/layout`

Settings fields:
- `fontSize` (40-90px, default from `DEFAULT_GENERAL_SETTINGS`)
- `layout.readCaptionBottom` (20-80px)
- `layout.titleGap` (10-300px)
- `layout.logoGap` (20-60px)
- `layout.titlePaddingX` (0-200px)
- `barWidth` (0=Auto, up to 400px)
- `slideFontFamily` (from `SLIDE_FONT_OPTIONS`)

### PostCanvas Preview
- Uses `PostCanvas` component from `@/shared/components/PostCanvas`
- Shows real-time preview at 0.2 scale
- Auto-fits font size via `autoFitFontSize()` function

---

## 3. Prompts Inspection Flow (`src/pages/Prompts.tsx`)

### Page: `PromptsPage` (shared)

Used by both:
- `ReelsPromptsPage` → `<PromptsPage contentType="reels" />`
- `PostsPromptsPage` → `<PromptsPage contentType="posts" />`

### Data Fetching
- **Endpoint:** `GET /api/prompts/overview`
- **Response (`PromptOverview`):**
  ```json
  {
    "layers": [{ "id", "name", "description", "content", "type" }],
    "brand_palettes": { "brandName": { "name", "primary", "accent", "color_description" } },
    "models": { "posts"|"reels": { "name", "dimensions", "steps", "description" } },
    "fallback_prompts": { "category": "prompt_text" },
    "pipeline_summary": "string",
    "carousel_examples": [{ "topic", "title", "slides": ["..."] }],
    "carousel_examples_count": number
  }
  ```

### Content Filtering
- **Posts** excludes layers: `['reel_base_style']`
- **Reels** excludes layers: `['quality_suffix', 'post_content_prompt']`
- Models filtered to show only the matching `contentType` key

### Test Image Generation
- **Endpoint:** `POST /api/prompts/test-generate`
- **Payload:** `{ prompt: string, brand: string, count: 2 }`
- **Response:** `{ results: [{ index, image_data?, error?, generation_time, prompt_used }] }`

### Preview Final Prompt
- **Endpoint:** `POST /api/prompts/build-final`
- **Payload:** `{ prompt: string, brand: string }`
- **Response:** `{ user_prompt, quality_suffix, final_prompt, total_chars, model, dimensions, steps }`

---

## 4. API Endpoints Summary

### Job Management (via `jobsApi`)
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `/jobs/` | List all jobs |
| GET | `/jobs/:id` | Get single job |
| POST | `/jobs/create` | Create new job (reels & posts) |
| PUT | `/jobs/:id` | Update job |
| DELETE | `/jobs/:id` | Delete job |
| POST | `/jobs/:id/cancel` | Cancel job |
| POST | `/jobs/:id/regenerate` | Regenerate entire job |
| POST | `/jobs/:id/regenerate/:brand` | Regenerate single brand |
| GET | `/jobs/:id/next-slots` | Get next scheduling slots |
| POST | `/jobs/:id/brand/:brand/status` | Update brand status |
| PATCH | `/jobs/:id/brand/:brand/content` | Update brand content |
| POST | `/jobs/:id/brand/:brand/regenerate-image` | Regenerate brand image |
| DELETE | `/jobs/bulk/by-status?job_status=X` | Bulk delete by status |
| POST | `/jobs/bulk/delete-by-ids` | Bulk delete by IDs |

### Content Generation
| Method | Endpoint | Used For |
|--------|----------|----------|
| POST | `/reels/auto-generate-content` | AI generates title + content + image prompt |
| POST | `/reels/generate-image-prompt` | AI generates image prompt from title |

### Prompts Inspection
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `/api/prompts/overview` | Get all prompt layers, palettes, models |
| POST | `/api/prompts/test-generate` | Generate test images from prompt |
| POST | `/api/prompts/build-final` | Preview the final assembled prompt |

### Brands
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `/api/v2/brands` | List all brands |
| GET | `/api/v2/brands/ids` | List brand IDs only |
| GET | `/api/v2/brands/:id` | Get single brand |
| GET | `/api/v2/brands/:id/colors` | Get brand colors |
| POST | `/api/v2/brands` | Create brand |
| PUT | `/api/v2/brands/:id` | Update brand |
| PUT | `/api/v2/brands/:id/credentials` | Update credentials |
| DELETE | `/api/v2/brands/:id` | Delete (deactivate) brand |
| POST | `/api/v2/brands/:id/reactivate` | Reactivate brand |

### Layout Settings
| Method | Endpoint | Used For |
|--------|----------|----------|
| GET | `/api/v2/brands/settings/layout` | Get saved layout settings |
| PUT | `/api/v2/brands/settings/layout` | Save layout settings |

---

## 5. API Client Architecture

- **File:** `src/shared/api/client.ts`
- **Base URL:** `VITE_API_URL` env var or empty string (same origin)
- **Auth:** Automatically attaches Supabase JWT via `Authorization: Bearer <token>`
- **Timeout:** 30 seconds
- **Methods:** `get`, `post`, `put`, `del`, `patch`

**Note:** The Reels page (`Generator.tsx`) uses raw `fetch()` directly for:
- `/reels/auto-generate-content`
- `/reels/generate-image-prompt`

These calls do NOT use `apiClient` and therefore do NOT attach Supabase JWT auth headers. The Posts page also uses raw `fetch()` for `/reels/generate-image-prompt`.

---

## 6. State Management

- **React Query (`@tanstack/react-query`)** for server state
- **Local component state** for form fields
- **Polling:**
  - Jobs list: 3s when active jobs, 10s otherwise
  - Single job: 3s when generating/pending, 5s otherwise

### Key Hooks
| Hook | Source | Purpose |
|------|--------|---------|
| `useCreateJob()` | `src/features/jobs/hooks/use-jobs.ts` | Create job mutation |
| `useJobs()` | same | List all jobs with polling |
| `useJob(id)` | same | Single job with polling |
| `useDynamicBrands()` | `src/features/brands/hooks/use-dynamic-brands.ts` | Dynamic brand list from API |
| `useLayoutSettings()` | `src/shared/api/use-layout-settings.ts` | Layout settings from DB |
| `useUpdateLayoutSettings()` | same | Save layout settings to DB |

---

## 7. Key Type Definitions (`src/shared/types/index.ts`)

### `JobCreateRequest` (sent to POST /jobs/create)
```typescript
{
  title: string
  content_lines?: string[]
  brands: BrandName[]        // string[]
  variant: 'light' | 'dark' | 'post'
  ai_prompt?: string
  cta_type?: string
  platforms?: string[]       // ['instagram', 'facebook', 'youtube']
  fixed_title?: boolean
}
```

### `Variant`
- `'light'` — Light mode reels
- `'dark'` — Dark mode reels (with AI background)
- `'post'` — Carousel posts

### `BrandOutput` (per-brand result)
Includes: `status`, `reel_id`, `thumbnail_path`, `video_path`, `caption`, `yt_title`, `content_lines`, `scheduled_time`, `error`, `progress_message`, `progress_percent`, `background_data`, `title`, `ai_prompt`, `slide_texts`

---

## 8. Flow Diagrams

### Reels Manual Flow
```
User fills form → clicks "Generate Reels"
  → [if dark + no prompt] POST /reels/generate-image-prompt
  → POST /jobs/create { title, content_lines, brands, variant, ai_prompt?, cta_type, platforms }
  → Job created, toast shown, form cleared
  → useJobs() polling picks up the new job
```

### Reels Auto-Generate Flow
```
User clicks "Auto-Generate Viral Reel"
  → POST /reels/auto-generate-content {}
  → Form populated with AI content (title, content, image_prompt)
  → variant set to 'dark'
  → User reviews and clicks "Generate Reels" (manual flow from here)
```

### Posts Manual Flow
```
User enters title, optionally writes AI prompt, selects 1 brand
  → clicks "Generate Posts"
  → POST /jobs/create { title, content_lines:[], brands:[1], variant:"post", ai_prompt?, cta_type:"none", fixed_title:true }
  → Job created, toast shown, form cleared
```

### Posts Auto-Generate Flow
```
User clicks "Auto Generate Viral Carrousel Posts"
  → Modal opens with brand selection
  → User selects brands, clicks "Generate"
  → POST /jobs/create { title:"Auto-generated posts", content_lines:[], brands:[N], variant:"post", cta_type:"none" }
  → Job created, toast shown
```

---

## 9. Notable Observations

1. **Reels auto-generate is 2-step**: AI fills the form, then user submits. Posts auto-generate is 1-step (directly creates job).

2. **Raw fetch vs apiClient**: Reels page uses raw `fetch()` for `/reels/*` endpoints without auth headers. Posts page also uses raw `fetch()` for `/reels/generate-image-prompt`. All other calls use `apiClient` with Supabase JWT.

3. **Single brand selection for manual posts**: The Posts page uses radio-like single brand selection (`selectBrand` replaces array), while Reels allows multi-brand checkbox selection.

4. **Post jobs send empty content_lines**: Content is generated entirely by the backend for posts. The `content_lines` field is always `[]`.

5. **`fixed_title` flag**: Only sent on manual post generation. Tells backend to use the exact title provided instead of AI-generating one.

6. **No Platforms for Posts**: The posts flow doesn't send a `platforms` field — only Reels has platform selection.

7. **ReelsPrompts and PostsPrompts pages**: Both are thin wrappers around `PromptsPage` with a `contentType` prop. They share all prompt inspection functionality.

8. **Layout settings dual persistence**: Posts layout settings are saved both to localStorage and to the database via API calls.
