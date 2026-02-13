# Posts Page Restructure — Implementation Spec

## Overview

Two distinct flows for post creation, replacing the current confusing single-form-multiple-modes design. Remove God Automation entirely.

---

## Flow 1: "Generate Posts" (Manual Mode)

**User provides the exact title → backend uses it literally, no AI title generation.**

### Frontend Changes — `src/pages/Posts.tsx`

#### 1. Rename "Topic Hint" → "Title"

**File:** `src/pages/Posts.tsx`  
**Lines ~161-173** — The `<label>` and `<textarea>` inside the "Topic Hint" card.

Replace:
```tsx
<label className="block text-sm font-semibold text-gray-900 mb-2">
  Topic Hint
  <span className="text-xs font-normal text-gray-400 ml-1">
    (optional — AI picks topics if empty)
  </span>
</label>
<textarea
  value={title}
  onChange={(e) => setTitle(e.target.value)}
  rows={3}
  placeholder="e.g. focus on teas and sleep rituals"
```

With:
```tsx
<label className="block text-sm font-semibold text-gray-900 mb-2">
  Title
  <span className="text-xs font-normal text-gray-400 ml-1">
    (exact title shown on the post)
  </span>
</label>
<textarea
  value={title}
  onChange={(e) => setTitle(e.target.value)}
  rows={3}
  placeholder="e.g. Daily ginger consumption may reduce muscle pain by 25%"
```

#### 2. Brand Selector — Change to Single-Select for Manual Mode

**File:** `src/pages/Posts.tsx`  
**Lines ~213-238** — The brand toggle buttons.

Replace multi-toggle `toggleBrand` logic with a single-select radio-style selection. Only ONE brand can be selected at a time.

Replace the `toggleBrand` function (line ~60):
```tsx
const toggleBrand = (brand: BrandName) => {
  setSelectedBrands((prev) =>
    prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
  )
}
```

With:
```tsx
const selectBrand = (brand: BrandName) => {
  setSelectedBrands([brand])
}
```

Update the brand button `onClick` from `toggleBrand(brand)` to `selectBrand(brand)`.

**Default selection:** Change initial state from `[...ALL_BRANDS]` to `[ALL_BRANDS[0]]` (single brand default):
```tsx
const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([ALL_BRANDS[0]])
```

#### 3. Disable "Generate Posts" When Title Is Empty

**File:** `src/pages/Posts.tsx`  
**Line ~306** — The "Generate Posts" button already has `!title.trim()` in its `disabled` prop. ✅ Already correct. No change needed.

Verify the existing disabled condition:
```tsx
disabled={isCreating || selectedBrands.length === 0 || !title.trim()}
```
This is already correct.

#### 4. Update `handleSubmit` — Pass Title as Literal

**File:** `src/pages/Posts.tsx`  
**Lines ~129-144** — The `handleSubmit` function body.

Replace:
```tsx
const job = await createJob.mutateAsync({
  title: title.trim() || 'Auto-generated posts',
  content_lines: [],
  brands: selectedBrands,
  variant: 'post',
  ai_prompt: aiPrompt.trim() || title.trim() || undefined,
  cta_type: 'none',
})
```

With:
```tsx
const job = await createJob.mutateAsync({
  title: title.trim(),
  content_lines: [],
  brands: selectedBrands,
  variant: 'post',
  ai_prompt: aiPrompt.trim() || undefined,
  cta_type: 'none',
  fixed_title: true,
})
```

Key changes:
- `title` is now required (button disabled when empty), so no `|| 'Auto-generated posts'` fallback needed
- `ai_prompt` no longer falls back to `title.trim()` — it's purely for image prompt. If empty, backend generates it.
- New field `fixed_title: true` signals the backend to use the title as-is

#### 5. Remove "Generate Title" Button

**File:** `src/pages/Posts.tsx`  
**Lines ~176-187** — Remove the "Generate Title" `<button>` inside the Title card. This button calls `handleGenerateTitle` which fills the field with an AI-generated title — contradicts the new "Title = literal" design.

Remove this entire block:
```tsx
<button
  onClick={handleGenerateTitle}
  disabled={isGeneratingTitle}
  className="mt-2 flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
>
  {isGeneratingTitle ? (
    <Loader2 className="w-3 h-3 animate-spin" />
  ) : (
    <Wand2 className="w-3 h-3" />
  )}
  Generate Title
</button>
```

Also remove the `handleGenerateTitle` function (lines ~72-90) — no longer needed.

#### 6. Update Helper Text in Footer

**File:** `src/pages/Posts.tsx`  
**Line ~321** — The helper `<p>` below the buttons.

Replace:
```tsx
<p className="text-xs text-gray-400">
  💡 <strong>Generate Posts</strong> needs a topic hint · <strong>God Automation</strong> does everything automatically
</p>
```

With:
```tsx
<p className="text-xs text-gray-400">
  💡 <strong>Generate Posts</strong> uses your exact title · <strong>Auto Generate</strong> lets AI create everything
</p>
```

---

## Flow 2: "Auto Generate" (Full AI Mode)

**Opens a modal → user picks how many brands and which brands → AI generates everything from scratch.**

### Frontend Changes — `src/pages/Posts.tsx`

#### 7. Replace `handleAutoGenerate` with Modal Trigger

**File:** `src/pages/Posts.tsx`

Remove the current `handleAutoGenerate` function (lines ~107-127) that calls `/reels/generate-post-title` and fills form fields.

Replace with a simple modal state toggle:
```tsx
const [showAutoModal, setShowAutoModal] = useState(false)
```

The "Auto Generate" button (line ~296) now opens the modal:
```tsx
<button
  onClick={() => setShowAutoModal(true)}
  disabled={isCreating}
  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-primary-600 text-white rounded-xl hover:from-purple-700 hover:to-primary-700 font-medium disabled:opacity-50"
>
  <Wand2 className="w-4 h-4" />
  Auto Generate
</button>
```

Note: Remove `isGeneratingTitle` and `selectedBrands.length === 0` from the disabled condition — the modal handles brand selection independently.

#### 8. Create Auto Generate Modal

**File:** `src/pages/Posts.tsx`  
Add a new modal component (inline or as a separate component at the bottom of the file).

**Modal UI:**
```
┌─────────────────────────────────┐
│  Auto Generate Posts            │
│                                 │
│  How many brands?               │
│  [1] [2] [3] [4] [5]           │
│                                 │
│  Select brands:                 │
│  ☑ healthycollege               │
│  ☑ longevitycollege             │
│  ☐ wellbeingcollege             │
│  ☐ vitalitycollege              │
│  ☐ holisticcollege              │
│                                 │
│  [Cancel]  [Generate]           │
└─────────────────────────────────┘
```

**State variables for modal:**
```tsx
const [autoCount, setAutoCount] = useState(ALL_BRANDS.length)
const [autoBrands, setAutoBrands] = useState<BrandName[]>([...ALL_BRANDS])
```

**Behavior:**
- Brand count buttons (1–N): when count changes, pre-select the first N brands from `ALL_BRANDS`
- Checkboxes: user can manually toggle individual brands. Count display updates to match.
- "Generate" button: creates a job with `fixed_title: false` (or simply omit `fixed_title`), an empty title, and the selected brands. Backend runs `generate_post_titles_batch()` as usual.

**Modal submit handler:**
```tsx
const handleAutoSubmit = async () => {
  if (autoBrands.length === 0) {
    toast.error('Select at least one brand')
    return
  }
  setIsCreating(true)
  setShowAutoModal(false)
  try {
    const job = await createJob.mutateAsync({
      title: 'Auto-generated posts',
      content_lines: [],
      brands: autoBrands,
      variant: 'post',
      cta_type: 'none',
    })
    toast.success('Auto generate job created!')
    navigate(`/job/${job.id}`)
  } catch {
    toast.error('Failed to create auto generate job')
  } finally {
    setIsCreating(false)
  }
}
```

Key: No `fixed_title` field → backend knows to run AI title generation.

---

## Remove God Automation

#### 9. Remove God Automation Button

**File:** `src/pages/Posts.tsx`  
**Lines ~312-319** — Remove the "God Automation 🔱" button entirely:

```tsx
<button
  onClick={() => setShowGodMode(true)}
  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-white rounded-xl hover:from-amber-600 hover:via-yellow-600 hover:to-amber-700 font-bold shadow-lg shadow-amber-200/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
>
  <Zap className="w-4 h-4" />
  God Automation 🔱
</button>
```

#### 10. Remove God Automation Overlay

**File:** `src/pages/Posts.tsx`  
**Lines ~333-338** — Remove the GodAutomation overlay render:

```tsx
{showGodMode && (
  <GodAutomation
    brands={selectedBrands}
    settings={settings}
    onClose={() => setShowGodMode(false)}
  />
)}
```

#### 11. Remove God Automation Imports & State

**File:** `src/pages/Posts.tsx`

Remove from imports (line ~28):
```tsx
import { GodAutomation } from '@/shared/components/GodAutomation'
```

Remove the `Zap` icon import (line ~13) if not used elsewhere.

Remove state variable (line ~51):
```tsx
const [showGodMode, setShowGodMode] = useState(false)
```

#### 12. Do NOT Delete `GodAutomation.tsx`

Keep the file `src/shared/components/GodAutomation.tsx` in the codebase — it's just no longer imported into Posts.tsx. It may be repurposed later.

---

## Backend Changes

### 13. Add `fixed_title` to Job Creation Schema

**File:** `app/api/jobs_routes.py`  
**Lines ~12-20** — Add `fixed_title` to `JobCreateRequest`:

```python
class JobCreateRequest(BaseModel):
    """Request to create a new generation job."""
    title: str
    content_lines: Optional[List[str]] = None
    brands: List[str]
    variant: str = "light"
    ai_prompt: Optional[str] = None
    cta_type: Optional[str] = "follow_tips"
    user_id: str = "default"
    platforms: Optional[List[str]] = None
    fixed_title: bool = False  # NEW: If True, use title as-is (no AI generation)
```

### 14. Add `fixed_title` to Database Model

**File:** `app/models.py`  
**Line ~33** (after `cta_type` column) — Add a new column:

```python
fixed_title = Column(Boolean, default=False, nullable=False, server_default="false")
```

Also add `fixed_title` to the `to_dict()` method:
```python
"fixed_title": self.fixed_title,
```

**Migration note:** Since this uses `server_default="false"`, existing rows automatically get `False`. No data migration needed — the column is added with a default.

### 15. Pass `fixed_title` Through Job Creation

**File:** `app/api/jobs_routes.py`  
**Lines ~95-105** — In the `create_job` endpoint, pass `fixed_title` to the `JobManager.create_job()` call.

The `create_job` endpoint currently does:
```python
job = manager.create_job(
    user_id=request.user_id,
    title=request.title,
    content_lines=request.content_lines or [],
    brands=request.brands,
    variant=request.variant,
    ai_prompt=request.ai_prompt,
    cta_type=request.cta_type,
    platforms=request.platforms
)
```

Add `fixed_title=request.fixed_title` to this call.

### 16. Update `JobManager.create_job()` to Accept `fixed_title`

**File:** `app/services/job_manager.py`  
**Lines ~63-78** — Add `fixed_title` parameter and store it:

```python
def create_job(
    self,
    user_id: str,
    title: str,
    content_lines: List[str],
    brands: List[str],
    variant: str = "light",
    ai_prompt: Optional[str] = None,
    cta_type: Optional[str] = None,
    platforms: Optional[List[str]] = None,
    fixed_title: bool = False,  # NEW
) -> GenerationJob:
```

And in the `GenerationJob(...)` constructor inside this method:
```python
job = GenerationJob(
    ...
    fixed_title=fixed_title,
    ...
)
```

### 17. Update `process_job()` — Skip AI Generation When `fixed_title=True`

**File:** `app/services/job_manager.py`  
**Lines ~639-690** — The `if job.variant == "post":` block inside `process_job()`.

This is the **critical change**. Currently the code always calls `generate_post_titles_batch()`. With `fixed_title`, it should skip that and use the title directly.

Replace the current post-variant block:

```python
# ── POST variant: only generate backgrounds ──────────────────
if job.variant == "post":
    print(f"📸 POST variant — generating unique posts per brand", flush=True)
    results = {}
    total_brands = len(job.brands)
    try:
        # Generate N unique posts (one per brand) in a single AI call
        from app.services.content_generator_v2 import ContentGenerator
        cg = ContentGenerator()

        topic_hint = job.ai_prompt or None
        print(f"   🧠 Generating {total_brands} unique posts...", flush=True)
        self.update_job_status(job_id, "generating", "Generating unique content for each brand...", 5)

        batch_posts = cg.generate_post_titles_batch(total_brands, topic_hint)
        print(f"   ✓ Got {len(batch_posts)} unique posts", flush=True)

        # Store unique content per brand in brand_outputs
        for i, brand in enumerate(job.brands):
            post_data = batch_posts[i] if i < len(batch_posts) else cg._fallback_post_title()
            self.update_brand_output(job_id, brand, {
                "title": post_data.get("title", job.title),
                "caption": post_data.get("caption", ""),
                "ai_prompt": post_data.get("image_prompt", ""),
                "slide_texts": post_data.get("slide_texts", []),
                "status": "pending",
            })
            print(f"   📝 {brand}: {post_data.get('title', '?')[:60]}...", flush=True)
```

With:

```python
# ── POST variant: only generate backgrounds ──────────────────
if job.variant == "post":
    print(f"📸 POST variant — generating posts per brand", flush=True)
    results = {}
    total_brands = len(job.brands)
    try:
        from app.services.content_generator_v2 import ContentGenerator
        cg = ContentGenerator()

        if job.fixed_title:
            # ── MANUAL MODE: Use the user's title as-is ──────────
            print(f"   📌 Fixed title mode — using title as-is: {job.title[:80]}", flush=True)
            self.update_job_status(job_id, "generating", "Using provided title...", 5)

            # Generate image prompt only if not provided
            image_prompt = job.ai_prompt
            if not image_prompt:
                print(f"   🎨 No image prompt provided — generating from title...", flush=True)
                prompt_result = cg.generate_image_prompt(job.title)
                image_prompt = prompt_result.get("image_prompt", "")
                print(f"   ✓ Generated image prompt: {image_prompt[:80]}...", flush=True)

            # Apply the SAME title + prompt to the single brand
            for brand in job.brands:
                self.update_brand_output(job_id, brand, {
                    "title": job.title,
                    "caption": "",  # Will be generated during process_post_brand or left for user
                    "ai_prompt": image_prompt,
                    "slide_texts": [],
                    "status": "pending",
                })
                print(f"   📝 {brand}: {job.title[:60]}...", flush=True)
        else:
            # ── AUTO MODE: AI generates unique posts per brand ───
            topic_hint = job.ai_prompt or None
            print(f"   🧠 Generating {total_brands} unique posts...", flush=True)
            self.update_job_status(job_id, "generating", "Generating unique content for each brand...", 5)

            batch_posts = cg.generate_post_titles_batch(total_brands, topic_hint)
            print(f"   ✓ Got {len(batch_posts)} unique posts", flush=True)

            # Store unique content per brand in brand_outputs
            for i, brand in enumerate(job.brands):
                post_data = batch_posts[i] if i < len(batch_posts) else cg._fallback_post_title()
                self.update_brand_output(job_id, brand, {
                    "title": post_data.get("title", job.title),
                    "caption": post_data.get("caption", ""),
                    "ai_prompt": post_data.get("image_prompt", ""),
                    "slide_texts": post_data.get("slide_texts", []),
                    "status": "pending",
                })
                print(f"   📝 {brand}: {post_data.get('title', '?')[:60]}...", flush=True)
```

The rest of the `process_job()` post variant code (image generation per brand loop) stays the same — it already reads from `brand_outputs` for the image prompt.

### 18. Add `fixed_title` to Frontend Types

**File:** `src/features/jobs/api/jobs-api.ts`  
**Line ~51** — Add to `JobCreateRequest`:

```typescript
export interface JobCreateRequest {
  title: string
  content_lines?: string[]
  brands: BrandName[]
  variant: 'light' | 'dark' | 'post'
  ai_prompt?: string
  cta_type?: string
  platforms?: string[]
  fixed_title?: boolean  // NEW
}
```

**File:** `src/features/jobs/api/jobs-api.ts`  
Also add to `BackendJob` interface (line ~7) for completeness:
```typescript
fixed_title?: boolean
```

---

## Summary of All File Changes

| File | Changes |
|------|---------|
| `src/pages/Posts.tsx` | Rename label, single-select brands, remove God Automation button + overlay + import + state, remove Generate Title button + handler, replace Auto Generate handler with modal, add modal component, update helper text, update handleSubmit to pass `fixed_title: true` |
| `src/shared/components/GodAutomation.tsx` | **No change** — keep file, just no longer imported |
| `src/features/jobs/api/jobs-api.ts` | Add `fixed_title?: boolean` to `JobCreateRequest` and `BackendJob` |
| `app/models.py` | Add `fixed_title` column + `to_dict()` entry |
| `app/api/jobs_routes.py` | Add `fixed_title` to `JobCreateRequest`, pass through in `create_job` endpoint |
| `app/services/job_manager.py` | Add `fixed_title` param to `create_job()`, branch `process_job()` post variant on `job.fixed_title` |

---

## Logic Flow Diagrams

### Manual Mode (Generate Posts)

```
User types title "Daily ginger helps reduce pain"
User optionally types AI image prompt
User selects ONE brand (single-select)
User clicks "Generate Posts"
    │
    ▼
Frontend sends POST /jobs/create:
  { title: "Daily ginger helps reduce pain",
    brands: ["healthycollege"],
    variant: "post",
    ai_prompt: "<user's image prompt or undefined>",
    fixed_title: true }
    │
    ▼
Backend create_job() stores job with fixed_title=True
    │
    ▼
process_job() → variant=="post" → job.fixed_title is True
    │
    ├── SKIP generate_post_titles_batch()
    ├── Use job.title as-is
    ├── If no ai_prompt: call cg.generate_image_prompt(job.title) for image prompt
    ├── Store { title: job.title, ai_prompt: image_prompt } in brand_outputs
    │
    ▼
Loop: process_post_brand() for the single brand
    │
    ├── Generate AI background image using brand's ai_prompt
    └── Done → job completed
```

### Auto Mode (Auto Generate)

```
User clicks "Auto Generate"
    │
    ▼
Modal opens:
    - How many brands? [1-5]
    - Which brands? [checkboxes]
    │
User clicks "Generate" in modal
    │
    ▼
Frontend sends POST /jobs/create:
  { title: "Auto-generated posts",
    brands: ["healthycollege", "longevitycollege"],
    variant: "post" }
    │  (no fixed_title field → defaults to false)
    │
    ▼
process_job() → variant=="post" → job.fixed_title is False
    │
    ├── Call generate_post_titles_batch(N, topic_hint=None)
    ├── Each brand gets unique AI-generated title, caption, image_prompt
    ├── Store per-brand content in brand_outputs
    │
    ▼
Loop: process_post_brand() for each brand
    │
    ├── Generate AI background image per brand
    └── Done → job completed
```

---

## Database Migration

Add this column to the `generation_jobs` table:

```sql
ALTER TABLE generation_jobs ADD COLUMN fixed_title BOOLEAN NOT NULL DEFAULT FALSE;
```

Or via alembic/SQLAlchemy auto-migration. Since `server_default="false"` is set in the model, existing rows get `False` automatically.

---

## Cleanup Considerations

After implementation, these items become unused and can be removed from `Posts.tsx`:

- `handleGenerateTitle` function
- `isGeneratingTitle` state (only used by the removed Generate Title button and the removed old Auto Generate flow)  
  **Wait** — `isGeneratingTitle` is also used in the Auto Generate button's loading state. Since Auto Generate now just opens a modal (no async call), `isGeneratingTitle` is no longer needed for the Auto Generate button. The `isCreating` state covers the modal's submit loading.
- `Zap` from lucide-react imports (only used by God Automation button)
- The `GodAutomation` import

**Keep:**
- `handleGeneratePrompt` — still useful for the "Generate Prompt" button in the AI Image Prompt card
- `isGeneratingPrompt` — used by Generate Prompt button
- `aiPrompt` state — still used for manual image prompt entry
