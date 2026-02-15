# Eleven Tasks Research — Comprehensive Codebase Analysis

> Generated: 2026-02-15

---

## Table of Contents
1. [Post Slides (Scheduled Post Detail)](#1-post-slides-scheduled-post-detail)
2. [BrandThemeModal Text Editability](#2-brandthememodal-text-editability)
3. [toby_proposals Table & Agent System](#3-toby_proposals-table--agent-system)
4. [Competitors Section](#4-competitors-section)
5. [Brands Not Found Bug](#5-brands-not-found-bug)
6. [deAPI Quota Display](#6-deapi-quota-display)
7. [AI Team Page Empty States](#7-ai-team-page-empty-states)
8. [Post Generation Redirect](#8-post-generation-redirect)
9. [Layout Settings Save](#9-layout-settings-save)
10. [Post Edit Persistence](#10-post-edit-persistence)
11. [Post Auto-Schedule](#11-post-auto-schedule)

---

## 1. Post Slides (Scheduled Post Detail)

### Files Involved
- `src/pages/Scheduled.tsx` — Post Detail Modal (lines ~500-650)

### Current Code
The Post Detail Modal in Scheduled.tsx **does support carousel slides**. The implementation:

1. State: `detailSlideIndex` tracks current slide (line ~100)
2. `totalSlides` = `1 + slideTexts.length` when variant is `post` (line ~536)
3. Cover slide (index 0): Renders `PostCanvas` or fallback image
4. Text slides (index 1+): Renders a CSS-based text slide preview with brand header bar, body text, and pagination

**Key code (Scheduled.tsx ~530-600):**
```tsx
const slideTexts = selectedPost.metadata?.slide_texts || []
const totalSlides = selectedPost.metadata?.variant === 'post' ? 1 + slideTexts.length : 1
const isPost = selectedPost.metadata?.variant === 'post'
```

The carousel navigation (prev/next arrows + dot indicators) is present at lines ~580-610.

### Issue Analysis
The carousel feature **IS implemented** in the code. Potential reasons the user can't see slides:

1. **`metadata.slide_texts` might be empty/missing**: If the scheduled post's metadata doesn't contain `slide_texts`, `totalSlides` will be 1, hiding all navigation.
2. **`metadata.variant` check**: The code checks `selectedPost.metadata?.variant === 'post'` — if variant isn't exactly `'post'`, it falls through to the non-carousel path showing just a thumbnail image.
3. **The `isPost` branching**: When `isPost` is true AND `thumbnail_path` exists, carousel is shown. If `isPost` is false OR no `thumbnail_path`, only a simple image or video is displayed.

### What Needs to Change
- **Debug**: Check that scheduled posts have `metadata.variant === 'post'` and `metadata.slide_texts` populated in the DB/API response.
- If `slide_texts` aren't being saved to the scheduled post metadata during scheduling, the fix is in the scheduling endpoint (`/reels/schedule-post-image`) — ensure `slide_texts` is persisted in the scheduled item's metadata.
- The `detailSlideIndex` is correctly reset to 0 when opening a post (`setDetailSlideIndex(0)` in click handlers).

---

## 2. BrandThemeModal Text Editability

### Files Involved
- `src/features/brands/components/BrandThemeModal.tsx`

### Current Code
The BrandThemeModal uses **hardcoded sample text** for both previews:

```tsx
const SAMPLE_TITLE = 'SURPRISING TRUTHS ABOUT DETOXIFICATION'
const TITLE_LINES = ['SURPRISING TRUTHS', 'ABOUT', 'DETOXIFICATION']
const SAMPLE_CONTENT = [
  'Your liver does an incredible job filtering toxins',
  'Drinking more water supports natural detox',
  'Sleep is the most underrated detox mechanism',
]
```

These constants are rendered directly into the preview — there are **NO input fields** allowing the user to type custom text to test.

### What Needs to Change
To let users type custom title/content text to preview how their theme looks:

1. Convert `SAMPLE_TITLE`, `TITLE_LINES`, and `SAMPLE_CONTENT` from constants to state variables
2. Add text input fields (or textareas) in the right panel under controls
3. When user types, split title into `TITLE_LINES` by word-wrapping or manual line breaks
4. Update `BAR_WIDTHS` calculation to be dynamic based on text length

**Suggested approach:**
```tsx
const [sampleTitle, setSampleTitle] = useState(SAMPLE_TITLE)
const titleLines = sampleTitle.split('\n').filter(Boolean)
// ... render with titleLines instead of TITLE_LINES
```

---

## 3. toby_proposals Table & Agent System

### Files Involved

**Model:** `app/models/agents.py` — `TobyProposal` class at line 299
**Usage in services:**
- `app/services/content/tracker.py` — lines 426, 438, 511, 549, 574 (duplicate checking, recent titles)
- `app/services/agents/generic_agent.py` — the `GenericAgent._call_ai_and_save()` method creates proposals
- `app/services/agents/evolution_engine.py` — `FeedbackEngine.run()` traces published items back to proposals
- `app/services/agents/diagnostics_engine.py` — `_check_content_pipeline()` counts recent proposals

**API routes:**
- `app/api/agents/routes.py` — full CRUD for agents, evolution endpoints, gene pool, diagnostics

### Table Definition (`toby_proposals`)
```python
class TobyProposal(Base):
    __tablename__ = "toby_proposals"
    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    proposal_id = Column(String(20), unique=True, index=True)  # "TOBY-001"
    status = Column(String(20), default="pending", index=True)  # pending|accepted|rejected|expired
    agent_name = Column(String(20), default="toby", index=True)
    content_type = Column(String(10), default="reel")  # reel|post
    brand = Column(String(50), nullable=True, index=True)
    variant = Column(String(10), nullable=True)
    strategy = Column(String(20))
    reasoning = Column(Text)
    title = Column(Text)
    content_lines = Column(JSON)      # reel text lines
    slide_texts = Column(JSON)        # carousel slide paragraphs (posts)
    image_prompt = Column(Text)
    caption = Column(Text)
    topic_bucket = Column(String(50))
    quality_score = Column(Float)
    examiner_score = Column(Float)
    examiner_verdict = Column(String(20))
    created_at = Column(DateTime)
```

### Agent Service Files
- **`generic_agent.py`**: Core agent class — `GenericAgent` reads config from `AIAgent` model, generates proposals via DeepSeek API. Has strategy routing (explore/iterate/double_down/trending), intelligence gathering (performance data, trending content, cross-brand insights), and saves to `toby_proposals`.
- **`evolution_engine.py`**: Three engines:
  - `FeedbackEngine`: Attributes published content performance back to agents (every 6h)
  - `AdaptationEngine`: Mutates DNA (strategy weights ±5%, temperature ±0.03) based on performance
  - `SelectionEngine`: Weekly natural selection — death/rebirth/gene pool
- **`diagnostics_engine.py`**: 10 self-test checks (DB, agents, DNA integrity, content pipeline, scheduler, evolution, API, publishing, cycle freshness, data consistency)

### API Routes (`app/api/agents/routes.py`)
Full REST API: list/get/create/update/delete agents, performance history, learnings, force mutate, clone, retire, gene pool browse, evolution timeline, diagnostics.

---

## 4. Competitors Section

### Files Involved
- `src/features/brands/components/SettingsTab.tsx` — bottom of file, lines ~340-350
- `src/features/ai-team/components/CompetitorSection.tsx` — the actual component
- `src/features/ai-team/api/use-ai-team.ts` — API hooks
- `src/pages/AITeam.tsx` — AI Team page (competitors NOT shown here currently)

### Current Code
The `CompetitorSection` is imported and rendered at the **bottom of SettingsTab** inside a dark-themed wrapper:

```tsx
{/* Competitor Accounts Section */}
<div className="mt-8 border-t border-gray-700 pt-6">
  <h3 className="text-lg font-semibold text-white mb-2">Competitor Accounts</h3>
  <p className="text-sm text-gray-400 mb-4">...</p>
  <CompetitorSection />
</div>
```

**Bug**: The wrapper uses dark theme styling (`text-white`, `border-gray-700`, `text-gray-400`) while the rest of SettingsTab uses a light theme. This creates a visual mismatch — the section heading is white text on a white background, making it invisible.

### CompetitorSection Component
- Uses `useCompetitors()`, `useAddCompetitor()`, `useRemoveCompetitor()` hooks
- Input field + Add button to add Instagram handles
- Lists competitors with scrape status
- Also uses dark styling (bg-gray-800 inputs, text-white) — **originally designed for a dark-themed page**

### What Needs to Change
1. **Fix dark-on-light styling**: The CompetitorSection and its wrapper in SettingsTab use dark theme classes but SettingsTab is light. Need to convert to light theme styling.
2. **Consider moving to AI Team page**: The AI Team page (`src/pages/AITeam.tsx`) doesn't currently show competitors — adding a tab there might make more sense architecturally.

---

## 5. Brands Not Found Bug

### Files Involved
- `src/features/brands/components/SettingsTab.tsx` — brand credentials loading

### How Brands Are Loaded in SettingsTab

**Brand credentials** are fetched in a `useEffect` on mount:
```tsx
useEffect(() => {
  const fetchCreds = async () => {
    try {
      const resp = await apiClient.get<{ brands: BrandCredentials[] }>('/api/v2/brands/credentials')
      setBrandCreds(resp.brands)
    } catch {
      // ignore
    }
    setBrandsLoading(false)
  }
  fetchCreds()
}, [])
```

This uses `/api/v2/brands/credentials` endpoint.

**Settings** are loaded via `useSettings()` hook which hits a different endpoint.

**Empty state rendering:**
```tsx
brandCreds.length === 0 ? (
  <div className="px-6 py-8 text-center text-gray-500">
    No brands found
  </div>
)
```

### Potential Issue
- The `/api/v2/brands/credentials` endpoint might not return brands if:
  1. The user's auth token doesn't match (user_id filtering)
  2. The brands table returns no rows for this user
  3. API error is silently swallowed (`catch { // ignore }`)

### What Needs to Change
- Add error handling/display instead of silent catch
- Log the error or show a retry button
- Verify the `/api/v2/brands/credentials` endpoint returns data for the current user

---

## 6. deAPI Quota Display

### Files Involved
- `app/services/api_quota_manager.py` — backend quota logic
- `src/features/ai-team/api/use-ai-team.ts` — frontend quota hooks
- `src/pages/AITeam.tsx` — `QuotasTab` component (lines ~520-620)

### Backend Quota Logic
```python
class APIQuotaManager:
    LIMITS = {
        'meta': 150,        # Calls per hour
        'deapi': 500,       # Daily limit
        'deepseek': 1000,   # Daily limit
    }
    HOURLY_SERVICES = {'meta'}
    DAILY_SERVICES = {'deapi', 'deepseek'}
```

- Tracks usage per hour window in `APIQuotaUsage` table
- `fetch_deapi_balance()`: Calls `https://api.deapi.co/v1/balance` to get real-time balance
- `fetch_deepseek_info()`: Gets rate limit from DeepSeek API headers
- Priority-aware throttling: reserves 30% capacity for high-priority operations

### Frontend Display
The `QuotasTab` in AITeam.tsx renders two cards (deAPI + DeepSeek) with:
- Usage bar (used/limit)
- Balance (for deAPI)
- Account type badge
- RPM limit
- Agent breakdown
- 24-hour history

### API Flow
`useQuotas()` → `GET /api/ai-team/quotas` → returns `QuotaData` with `deapi`, `deepseek` fields, each containing `used`, `limit`, `remaining`, `balance`, `account_type`, `rpm_limit`, `period`, `error`, `agent_breakdown`.

---

## 7. AI Team Page Empty States

### Files Involved
- `src/pages/AITeam.tsx`

### Empty State Locations

**Evolution Timeline** (line ~1045-1053):
```tsx
function EvolutionTimeline({ events }: ...) {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-lg">No evolution events yet</p>
        <p className="text-gray-400 text-sm mt-1">Events will appear after the first feedback cycle</p>
      </div>
    )
  }
```

**Gene Pool** (line ~1095-1105):
```tsx
function GenePoolView({ entries }: ...) {
  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <Dna className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-lg">Gene pool is empty</p>
        <p className="text-gray-400 text-sm mt-1">DNA gets archived when agents are retired or perform well</p>
      </div>
    )
  }
```

Both emit appropriate empty-state messages. These are working correctly — they display when no data exists yet.

---

## 8. Post Generation Redirect

### Files Involved
- `src/pages/Posts.tsx` — the "Auto Generate" and "Generate Posts" buttons

### Auto Generate Flow
1. User clicks "Auto Generate" button → opens modal (`setShowAutoModal(true)`)
2. User selects brand count + specific brands
3. User clicks "Generate" in modal → `handleAutoSubmit()`:

```tsx
const handleAutoSubmit = async () => {
  const job = await createJob.mutateAsync({
    title: 'Auto-generated posts',
    content_lines: [],
    brands: autoBrands,
    variant: 'post',
    cta_type: 'none',
  })
  toast.success('Auto generate job created!')
  navigate(`/job/${job.id}`)  // ← REDIRECTS TO JOB DETAIL
}
```

### Manual Generate Posts Flow
```tsx
const handleSubmit = async () => {
  const job = await createJob.mutateAsync({
    title: title.trim(),
    content_lines: [],
    brands: selectedBrands,
    variant: 'post',
    ai_prompt: aiPrompt.trim() || undefined,
    cta_type: 'none',
    fixed_title: true,
  })
  toast.success('Post job created!')
  navigate(`/job/${job.id}`)  // ← REDIRECTS TO JOB DETAIL
}
```

Both redirect to `/job/${job.id}` which renders the PostJobDetail component (when variant is `post`).

---

## 9. Layout Settings Save

### Files Involved
- `src/pages/PostJobDetail.tsx` — lines ~960-985
- `src/pages/Posts.tsx` — lines ~172-180
- `src/shared/components/PostCanvas.tsx` — `loadGeneralSettings()` / `saveGeneralSettings()`

### Current Code in PostJobDetail.tsx

**Settings storage key**: `SETTINGS_STORAGE_KEY` (from PostCanvas module)

**Load on mount:**
```tsx
const [settings, setSettings] = useState<GeneralSettings>(loadGeneralSettings)
```

**Save handler:**
```tsx
const saveSettings = () => {
  persistSettings(settings)      // saves to localStorage
  toast.success('Settings saved!')
}
```

**Save button (line ~975):**
```tsx
<button onClick={saveSettings} className="...">
  <Save className="w-4 h-4" />
  Save Settings
</button>
```

### How It Works
- `loadGeneralSettings()` reads from `localStorage` (key: `posts-general-settings` or similar from `SETTINGS_STORAGE_KEY`)
- `saveGeneralSettings()` (aliased as `persistSettings`) writes to `localStorage`
- Settings persist across sessions via localStorage — NOT saved to the server/DB
- Same mechanism in Posts.tsx page

### What Needs to Change
Settings are **localStorage-only** — they don't sync across devices or users. If server persistence is needed, a new API endpoint would be required.

---

## 10. Post Edit Persistence

### Files Involved
- `src/pages/PostJobDetail.tsx` — edit modal (lines ~850-950)

### Pencil Icon Edit Flow

1. **Open**: Pencil icon button calls `openEditBrand(brand)`:
```tsx
const openEditBrand = useCallback((brand: string) => {
  const output = job.brand_outputs[brand as BrandName]
  setEditTitle(output?.title || job.title || '')
  setEditCaption(output?.caption || '')
  setEditPrompt(output?.ai_prompt || '')
  setEditSlideTexts([...(output?.slide_texts || [])])
  setEditingBrand(brand)
}, [job])
```

2. **Edit modal** shows: Title input, Caption textarea, Carousel Slide Texts textareas, Logo upload, AI Image Prompt textarea

3. **Save**: "Save Content" button calls `saveEditBrand()`:
```tsx
const saveEditBrand = async () => {
  if (!editingBrand) return
  await updateBrandContent.mutateAsync({
    id: job.id,
    brand: editingBrand as BrandName,
    data: {
      title: editTitle,
      caption: editCaption,
      slide_texts: editSlideTexts,
    },
  })
  toast.success('Content updated!')
  refetch()
}
```

This calls `useUpdateBrandContent` mutation which hits the backend API to persist changes to the job's brand output.

### What This Saves
- Title (per-brand)
- Caption (per-brand)
- Slide texts (per-brand carousel content)

**NOT saved**: AI image prompt changes (those are only used for regeneration). Logo is saved to localStorage.

---

## 11. Post Auto-Schedule

### Files Involved
- `src/pages/PostJobDetail.tsx` — `handleAutoSchedule()` function (lines ~280-395)

### Auto-Schedule Handler Flow

```tsx
const handleAutoSchedule = async () => {
  // 1. Guard: all brands must be completed
  if (!allCompleted) { toast.error('Wait...'); return }

  // 2. Fetch occupied post slots from backend
  const occResp = await fetch('/reels/scheduled/occupied-post-slots')
  const occupiedByBrand = occData.occupied || {}

  for (const brand of job.brands) {
    // 3. Capture cover image from Konva canvas
    setBrandSlideIndex(prev => ({ ...prev, [brand]: 0 }))
    await new Promise(r => setTimeout(r, 100))
    const imageData = stage.toDataURL(...)

    // 4. Capture each carousel text slide
    const carouselImages = []
    for (let s = 0; s < slideTexts.length; s++) {
      setBrandSlideIndex(prev => ({ ...prev, [brand]: s + 1 }))
      await new Promise(r => setTimeout(r, 150))
      const textStage = textSlideRefs.current.get(brand)
      carouselImages.push(textStage.toDataURL(...))
    }

    // 5. Find next free slot (base hours 0 and 12, with offset)
    const offset = POST_BRAND_OFFSETS[brand] || 0
    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      for (const baseHour of [0, 12]) {
        slot.setHours(baseHour + offset, 0, 0, 0)
        if (slot > now && !isSlotOccupied(brand, slot)) {
          scheduleTime = slot; break
        }
      }
    }

    // 6. POST to backend
    await fetch('/reels/schedule-post-image', {
      method: 'POST',
      body: JSON.stringify({
        brand, title, caption, image_data, carousel_images,
        slide_texts, schedule_time
      })
    })

    // 7. Mark brand status as 'scheduled'
    await updateBrandStatus.mutateAsync({...})
  }
}
```

### Key Details
- **Slot algorithm**: Base hours `[0, 12]` (midnight and noon) + brand offset
- **Collision avoidance**: Fetches occupied slots, skips occupied ones, marks new slots as used within the batch
- **Carousel capture**: Uses Konva stage refs to render each slide as image data (cover + text slides)
- **Endpoint**: `POST /reels/schedule-post-image` receives base64 image data + carousel images + metadata
- **Fallback**: If no free slot found in 30 days, schedules 30 days out at offset hour

### Auto-Schedule Button Location
```tsx
{allCompleted && !allScheduled && (
  <button onClick={handleAutoSchedule} disabled={isScheduling}>
    Auto Schedule
  </button>
)}
```
Only visible when all brands completed but not yet scheduled.

---

## Summary of Key Findings

| # | Task | Status | Key Issue |
|---|------|--------|-----------|
| 1 | Post slides in Scheduled | Code exists | Check if `metadata.slide_texts` and `metadata.variant` are populated in scheduled posts |
| 2 | BrandThemeModal editable text | Not editable | Sample title/content are hardcoded constants — need to convert to state with input fields |
| 3 | toby_proposals | Fully implemented | Table defined in `agents.py`, used by GenericAgent, FeedbackEngine, tracker, diagnostics |
| 4 | Competitors section | Styling bug | Dark theme classes on light background — text invisible. Consider moving to AI Team page |
| 5 | Brands not found | Silent error | `/api/v2/brands/credentials` errors silently swallowed — need error display |
| 6 | deAPI quota | Working | Quota system tracks daily deAPI/deepseek usage with balance fetching from live API |
| 7 | AI Team empty states | Working | "Events will appear..." and "DNA gets archived..." messages display when no data |
| 8 | Post generation redirect | Working | Both Auto Generate and Generate Posts redirect to `/job/${job.id}` |
| 9 | Layout settings save | localStorage only | `saveGeneralSettings()` persists to localStorage, not server — works per-browser only |
| 10 | Post edit persistence | Working | Pencil edit saves title/caption/slide_texts via `updateBrandContent` mutation to backend |
| 11 | Post auto-schedule | Working | Captures Konva canvas images, finds free slots with collision avoidance, POSTs to backend |
