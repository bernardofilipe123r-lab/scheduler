# Research Findings: 5 Issues

## Issue 1: Posts.tsx Grid Layout — Preview Column Should Be 25% Not 50%

### Current State

**Grid container** — [Posts.tsx](src/pages/Posts.tsx#L159), line 159:
```html
<div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_auto] lg:grid-cols-[1fr_auto] gap-5">
```

This creates:
- On `xl`: 3 columns — `1fr` (inputs) | `1fr` (preview+actions) | `auto` (nothing uses this 3rd col)
- On `lg`: 2 columns — `1fr` (inputs) | `auto` (preview+actions)
- On smaller: 1 column

**The problem**: `1fr_1fr` makes the preview column **50%** width. The user wants it to be **25%**.

**Preview column** — [Posts.tsx](src/pages/Posts.tsx#L303-L322), lines 303-322:
```tsx
{/* Right: Preview + Actions */}
<div className="self-start space-y-4">
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    <h3>Preview</h3>
    ...
    <PostCanvas ... scale={POSTS_PREVIEW_SCALE} />
  </div>
  {/* Action buttons */}
  <div className="flex flex-col gap-3">
    <button>Auto Generate</button>
    <button>Generate Posts</button>
  </div>
</div>
```

**POSTS_PREVIEW_SCALE** — [Posts.tsx](src/pages/Posts.tsx#L35), line 35:
```tsx
const POSTS_PREVIEW_SCALE = 0.2
```

**Canvas dimensions** — [PostCanvas.tsx](src/shared/components/PostCanvas.tsx#L7-L8), lines 7-8:
```tsx
export const CANVAS_WIDTH = 1080
export const CANVAS_HEIGHT = 1350
```

At scale 0.2, the rendered canvas is **216×270px**. So the preview itself is quite small.

### What Needs to Change

1. **Grid layout**: Change from `xl:grid-cols-[1fr_1fr_auto]` to something like `xl:grid-cols-[3fr_1fr]` (75%/25%)
2. **POSTS_PREVIEW_SCALE**: May need adjustment. At 25% column width on a 1600px container, the column width ≈ 400px. The preview at 0.2 scale = 216px wide — fits fine. Could potentially increase to 0.25 (= 270px) or even 0.3 (= 324px).
3. **Action buttons** already sit below the preview in the same column (they're in `space-y-4` container), so no structural change needed there.

---

## Issue 2: Job Progress Not Showing Intermediate States in List View

### Root Cause Found

**History.tsx `getProgress()` function** — [History.tsx](src/pages/History.tsx#L162-L167), lines 162-167:
```tsx
const getProgress = (job: Job) => {
  const total = job.brands?.length || 0
  const completed = Object.values(job.brand_outputs || {})
    .filter(o => o.status === 'completed' || o.status === 'scheduled' || o.status === 'published')
    .length
  return total > 0 ? Math.round((completed / total) * 100) : 0
}
```

**THIS IS THE BUG.** The progress in the list view is calculated by counting how many **brands** have fully completed. It's a binary 0% (no brands done) → 100% (all brands done) calculation. If you have 5 brands and 2.5 are done, it shows 40% — but it NEVER shows intermediate per-brand progress (like 50% within a single brand).

**Contrast with the Job Detail page** which uses `job.progress_percent` — the backend-reported value that updates continuously during generation (10%, 25%, 50%, etc.) per-brand.

### Backend Progress Updates

The backend (`job_processor.py`) updates progress granularly:
- Lines ~140–195 in `regenerate_brand()`: Updates `progress_percent` at 0%, 5%, 10%, 25%, 30%, 50%, 55%, 75%, 80%, 95% for each brand
- Lines ~350–380 in `process_job()`: Updates overall `progress_percent` as `int((i / total_brands) * 100)` for the job level

The **job-level** `progress_percent` field IS updated and available via the list API. But `History.tsx` ignores it and computes its own binary progress.

### How Progress Renders in the List — [History.tsx](src/pages/History.tsx#L519-L528), lines 519-528:
```tsx
{isGenerating && (
  <div className="mt-3">
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div 
        className="h-full bg-blue-500 rounded-full transition-all duration-500"
        style={{ width: `${progress}%` }}
      />
    </div>
    <p className="text-xs text-blue-600 mt-1">
      {progress}% complete
    </p>
  </div>
)}
```

### Fix

Replace the `getProgress()` calculation to use `job.progress_percent` when the job is in `generating` status:
```tsx
const getProgress = (job: Job) => {
  // For actively generating jobs, use the backend-reported progress
  if ((job.status === 'generating' || job.status === 'pending') && job.progress_percent != null) {
    return job.progress_percent
  }
  // For completed jobs, use brand completion count
  const total = job.brands?.length || 0
  const completed = Object.values(job.brand_outputs || {})
    .filter(o => o.status === 'completed' || o.status === 'scheduled' || o.status === 'published')
    .length
  return total > 0 ? Math.round((completed / total) * 100) : 0
}
```

The `progress_percent` field is already in the `BackendJob` interface ([jobs-api.ts](src/features/jobs/api/jobs-api.ts#L18), line 18) and is passed through `transformJob()`.

---

## Issue 3: Font Auto-Fit Producing 5 Lines Instead of Max 4

### Frontend (`PostCanvas.tsx`)

**`autoFitFontSize()`** — [PostCanvas.tsx](src/shared/components/PostCanvas.tsx#L192-L211), lines 192-211:
```tsx
const AUTO_FIT_MAX = 90
const AUTO_FIT_MIN = 80

export function autoFitFontSize(text, maxWidth, _startSize, _maxLines): number {
  // Try preferred line counts: 3 → 4 → 2 with font ≥ 80
  for (const target of [3, 4, 2]) {
    for (let fs = AUTO_FIT_MAX; fs >= AUTO_FIT_MIN; fs -= 2) {
      if (countLines(text, maxWidth, fs) === target) return fs
    }
  }
  // Fallback: 3 lines at any font size (rare long titles)
  for (let fs = AUTO_FIT_MAX; fs >= 30; fs -= 2) {
    if (countLines(text, maxWidth, fs) === 3) return fs
  }
  // Short text
  return AUTO_FIT_MAX
}
```

**`countLines()`** — [PostCanvas.tsx](src/shared/components/PostCanvas.tsx#L174-L189), lines 174-189:
```tsx
function countLines(text, maxWidth, fontSize): number {
  const avgCharWidth = fontSize * 0.48
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth)
  const upperText = (text || '').toUpperCase().trim()
  const words = upperText.split(/\s+/).filter(Boolean)
  let lineCount = 1
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (test.length > maxCharsPerLine && current) {
      lineCount++
      current = word
    } else {
      current = test
    }
  }
  return lineCount
}
```

**The frontend algorithm is correct** — it only targets 2, 3, or 4 lines. It NEVER returns 5. The `autoFitFontSize` tries [3, 4, 2] only, and the greedy fallback targets 3.

**`balanceTitleText()`** — [PostCanvas.tsx](src/shared/components/PostCanvas.tsx#L110-L165), lines 110-165:
The `balanceTitleText` function uses the same character estimation for greedy wrapping. It handles up to 4 lines in optimization but **falls back to greedy wrap for higher counts** (line 165). The greedy wrap itself has NO line limit — if text is very long, it could produce 5+ lines.

**KEY PROBLEM**: The `autoFitFontSize` picks a font size targeting 2/3/4 lines. But `balanceTitleText` then re-wraps the text for visual balance. If `autoFitFontSize` picks a size that `countLines` says is 4 lines, but `balanceTitleText`'s greedy wrap produces 5 lines (due to different rounding or word-break behavior), you get 5 lines.

Both use the same `avgCharWidth = fontSize * 0.48` and `maxCharsPerLine` formula, so they **should** agree. But let's check: `countLines` uses `test.length > maxCharsPerLine` which is char-count based. `balanceTitleText` uses the exact same logic for `greedyLines`. They should be identical... unless there's a mismatch in `maxWidth` passed to each.

In `PostCanvas` component — [PostCanvas.tsx](src/shared/components/PostCanvas.tsx#L319-L322):
```tsx
const maxWidth = CANVAS_WIDTH - gl.titlePaddingX * 2
const effectiveFontSize = autoFitMaxLines > 0
  ? autoFitFontSize(title || 'PLACEHOLDER', maxWidth, settings.fontSize, autoFitMaxLines)
  : settings.fontSize
const balanced = balanceTitleText(title || 'PLACEHOLDER', maxWidth, effectiveFontSize)
```

Both get the **same** `maxWidth`, so there shouldn't be a mismatch on the frontend.

### Backend (`image_generator.py`)

**Thumbnail auto-fit** — [image_generator.py](app/services/media/image_generator.py#L133-L172), lines 133-172:
```python
# No manual breaks - auto-fit with line count priority: 3 → 4 → 2
max_font = 90
min_font = 80
for target_lines in [3, 4, 2]:
    for fs in range(max_font, min_font - 1, -2):
        tf = get_title_font(fs)
        lines_candidate = wrap_text(title_upper, tf, max_title_width)
        if len(lines_candidate) == target_lines:
            ...
```

The backend uses `wrap_text()` (from `app/utils/text_layout.py`) which does **actual pixel-based font measurement** rather than character estimation. This is more accurate but could produce different line counts than the frontend's character-estimation approach.

**The 5-line issue** likely comes from:
1. A title that at font size 80 produces 5 lines via the character estimation, meaning `countLines` returns 5 for all font sizes 80-90 — none match targets [3, 4, 2]
2. The fallback loop tries sizes 90→30 looking for 3 lines, and eventually finds one at a small font — but `balanceTitleText`'s greedy produces more
3. OR: the `_maxLines` parameter is ignored (`autoFitFontSize` receives it but doesn't use it as a guard)

**The fix should**: After `autoFitFontSize` picks a font size, `balanceTitleText` should **enforce** a max of 4 lines. Currently `balanceTitleText` handles 1, 2, 3, 4 line balancing but falls back to greedy (unlimited) for 5+ lines.

---

## Issue 4: Content Prompts Tab Ordering

### Current State — [BrandsTabBar.tsx](src/features/brands/components/BrandsTabBar.tsx#L3-L8)

```tsx
const TABS = [
  { key: 'brands', label: 'My Brands', icon: Layers },
  { key: 'prompts', label: 'Content Prompts', icon: FileText },
  { key: 'connections', label: 'Connections', icon: Link2 },
  { key: 'settings', label: 'Settings', icon: Settings },
] as const
```

### Current order:
1. My Brands
2. Content Prompts ← already in position #2
3. Connections
4. Settings

### User's desired order:
1. My Brands
2. Prompts ← between My Brands and Connections
3. Connections
4. Settings

**The tab order is ALREADY CORRECT.** "Content Prompts" is already between "My Brands" and "Connections". The only possible issue is the label — user says "Prompts" but the tab says "Content Prompts". This may just be a naming preference.

### Tab Content Rendering — [Brands.tsx](src/pages/Brands.tsx#L36-L42)

```tsx
{activeTab === 'brands' && <MyBrandsTab ... />}
{activeTab === 'prompts' && <ContentPromptsCard />}
{activeTab === 'connections' && <ConnectionsTab />}
{activeTab === 'settings' && <SettingsTab />}
```

All wired correctly. Tab order + content rendering are both fine.

---

## Issue 5: Content Prompts Not Wired into Generation — Full Flow Trace

### A. Posts Generation Flow

#### Step 1: Frontend Trigger

**"Auto Generate" button** — [Posts.tsx](src/pages/Posts.tsx#L316-L325):
```tsx
<button onClick={() => {
  setAutoCount(brandIds.length)
  setAutoBrands([...brandIds])
  setShowAutoModal(true)
}}>Auto Generate</button>
```
Opens modal → user selects brands → calls `handleAutoSubmit()`:

**`handleAutoSubmit()`** — [Posts.tsx](src/pages/Posts.tsx#L115-L132):
```tsx
const job = await createJob.mutateAsync({
  title: 'Auto-generated posts',
  content_lines: [],
  brands: autoBrands,
  variant: 'post',
  cta_type: 'none',
})
```

**"Generate Posts" button** — [Posts.tsx](src/pages/Posts.tsx#L326-L337):
Calls `handleSubmit()` — [Posts.tsx](src/pages/Posts.tsx#L135-L155):
```tsx
const job = await createJob.mutateAsync({
  title: title.trim(),
  content_lines: [],
  brands: selectedBrands,
  variant: 'post',
  ai_prompt: aiPrompt.trim() || undefined,
  cta_type: 'none',
  fixed_title: true,  // <-- key difference: uses exact title
})
```

#### Step 2: API Call
Both call `POST /jobs/create` via `jobsApi.create()`.

#### Step 3: Backend Job Creation — [jobs_routes.py](app/api/content/jobs_routes.py#L83-L116)
Creates a `GenerationJob` record in DB, then launches `process_job_async(job_id)` as a background task.

#### Step 4: Job Processing — [job_processor.py](app/services/content/job_processor.py#L278-L360)
For `variant == "post"`:

**AUTO MODE** (no `fixed_title`):
```python
cg = ContentGenerator()
batch_posts = cg.generate_post_titles_batch(total_brands, topic_hint)
```
This calls DeepSeek with the prompt from `build_post_content_prompt()`.

**MANUAL MODE** (`fixed_title=True`):
```python
# Uses the user's title as-is
image_prompt = job.ai_prompt
if not image_prompt:
    prompt_result = cg.generate_image_prompt(job.title)
```

Then for each brand, calls `self.process_post_brand(job_id, brand)` which generates ONLY the AI background image.

#### Step 5: Content Generation via DeepSeek

**`generate_post_titles_batch()`** — [generator.py](app/services/content/generator.py#L395-L470):
```python
prompt = build_post_content_prompt(count=count, history_context=history_context, topic_hint=topic_hint)
response = requests.post(
    f"{self.base_url}/chat/completions",
    json={
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.95,
        "max_tokens": 8000
    },
    timeout=90
)
```

**API**: `https://api.deepseek.com/v1/chat/completions`  
**Model**: `deepseek-chat`

#### Step 6: Prompt Assembly — [prompt_templates.py](app/core/prompt_templates.py#L205-L485)

`build_post_content_prompt()` builds a massive prompt including:
- Topic categories
- Title style guidelines
- Caption requirements
- Carousel slide examples
- Image prompt requirements
- History context for anti-repetition

**CRITICAL — Content Prompts ARE injected!** Lines ~478-486:
```python
prompts = get_content_prompts()
brand_desc = prompts.get('brand_description', '').strip()
posts_prompt = prompts.get('posts_prompt', '').strip()
if brand_desc:
    extra_context += f"\n\n### BRAND CONTEXT:\n{brand_desc}"
if posts_prompt:
    extra_context += f"\n\n### ADDITIONAL INSTRUCTIONS:\n{posts_prompt}"
prompt += extra_context
```

### B. Reels Generation Flow

#### Step 1: Content Generation

`generate_viral_content()` in [generator.py](app/services/content/generator.py#L77-L117):
```python
selection = self.pattern_selector.select_patterns(...)
content, quality_score = self._generate_with_quality_loop(selection)
```

#### Step 2: Prompt → DeepSeek

`build_runtime_prompt()` — [prompt_templates.py](app/core/prompt_templates.py#L51-L91):

**Content Prompts ARE also injected for reels!** Lines ~86-91:
```python
prompts = get_content_prompts()
brand_desc = prompts.get('brand_description', '').strip()
reels_prompt = prompts.get('reels_prompt', '').strip()
if brand_desc:
    prompt += f"\n\nBRAND CONTEXT:\n{brand_desc}"
if reels_prompt:
    prompt += f"\n\nADDITIONAL INSTRUCTIONS:\n{reels_prompt}"
```

### C. Single Post Title — `generate_post_title()`

Also injects content prompts — [generator.py](app/services/content/generator.py#L280-L285):
```python
prompts = get_content_prompts()
brand_desc = prompts.get('brand_description', '').strip()
posts_prompt_text = prompts.get('posts_prompt', '').strip()
if brand_desc:
    prompt += f"\n\n### BRAND CONTEXT:\n{brand_desc}"
if posts_prompt_text:
    prompt += f"\n\n### ADDITIONAL INSTRUCTIONS:\n{posts_prompt_text}"
```

### D. `get_content_prompts()` — [prompt_templates.py](app/core/prompt_templates.py#L17-L33)

```python
def get_content_prompts() -> Dict[str, str]:
    from app.db_connection import get_db_session
    with get_db_session() as db:
        from app.models.config import AppSettings
        rows = (
            db.query(AppSettings.key, AppSettings.value)
            .filter(AppSettings.key.in_(['posts_prompt', 'reels_prompt', 'brand_description']))
            .all()
        )
        return {row.key: (row.value or '') for row in rows}
```

Reads from `app_settings` table where `key in ('posts_prompt', 'reels_prompt', 'brand_description')`.

### E. Frontend ContentPromptsCard

The [ContentPromptsCard.tsx](src/features/brands/components/ContentPromptsCard.tsx) saves to `/api/settings` (via `useUpdateContentPrompts`) which writes to the `app_settings` table.

### Summary: Content Prompts ARE Wired

The full pipeline is:
1. **UI** → ContentPromptsCard saves `reels_prompt`, `posts_prompt`, `brand_description` to `app_settings` table
2. **Backend** → `get_content_prompts()` reads these from DB
3. **Posts** → `build_post_content_prompt()` appends them as `### BRAND CONTEXT` and `### ADDITIONAL INSTRUCTIONS`
4. **Reels** → `build_runtime_prompt()` appends them as `BRAND CONTEXT` and `ADDITIONAL INSTRUCTIONS`
5. **Single posts** → `generate_post_title()` also appends them

Everything is already connected. If the user isn't seeing their prompts reflected, possible causes:
- The prompts are empty in the DB (check app_settings table)
- Caching of the DB query
- The prompts are appended but at the end of a very long prompt, so DeepSeek may not weight them highly

---

## Summary Table

| Issue | Status | Key Finding |
|-------|--------|-------------|
| 1. Posts grid 25% | Needs fix | Grid uses `1fr_1fr`, should be `3fr_1fr` or similar |
| 2. Job progress | Needs fix | `History.tsx getProgress()` counts completed brands (binary), ignoring `job.progress_percent` |
| 3. Font 5 lines | Edge case | `autoFitFontSize` targets [3,4,2] only; `balanceTitleText` greedy fallback has no max. Need to cap at 4 |
| 4. Tab ordering | Already correct | "Content Prompts" is already in position #2, between My Brands and Connections |
| 5. Prompts wiring | Already wired | `get_content_prompts()` reads from DB; injected into all 3 gen paths (batch posts, single posts, reels) |
