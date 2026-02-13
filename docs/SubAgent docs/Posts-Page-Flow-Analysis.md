# Posts Page Flow Analysis

## File Paths

| Component | Path |
|-----------|------|
| Frontend Posts page | `src/pages/Posts.tsx` |
| Jobs API (frontend) | `src/features/jobs/api/jobs-api.ts` |
| Jobs hooks | `src/features/jobs/hooks/use-jobs.ts` |
| Backend routes (routes.py) | `app/api/routes.py` |
| Backend job routes | `app/api/jobs_routes.py` |
| Job manager | `app/services/job_manager.py` |
| Content generator V2 | `app/services/content_generator_v2.py` |
| God Automation component | `src/shared/components/GodAutomation.tsx` |

---

## Buttons on the Posts Page

There are **3 action buttons** on the page:

1. **Auto Generate** — purple gradient button
2. **Generate Posts** — primary blue button
3. **God Automation 🔱** — amber/gold button

Plus 2 smaller helper buttons inside the form cards:
- **Generate Title** (inside "Topic Hint" card)
- **Generate Prompt** (inside "AI Image Prompt" card)

---

## Form Fields

### "Topic Hint" (textarea)
- **Label**: `Topic Hint` with subtext `(optional — AI picks topics if empty)`
- **State variable**: `title` (confusingly named — it's state `title` but labeled "Topic Hint" in the UI)
- **Placeholder**: `"e.g. focus on teas and sleep rituals"`
- **Location**: `Posts.tsx` line ~161-173

### "AI Image Prompt" (textarea)
- **Label**: `AI Image Prompt` with subtext `(auto-generated if empty)`
- **State variable**: `aiPrompt`
- **Placeholder**: `"Describe the background image..."`

### Brand Selection
- Multi-select toggle buttons for all 5 brands
- Default: **all 5 brands selected**
- State: `selectedBrands: BrandName[]`

---

## Flow Diagrams

### 1. "Generate Posts" Button (`handleSubmit`)

```
User clicks "Generate Posts"
    │
    ├── Guard: selectedBrands.length === 0 → toast error, stop
    │
    ▼
createJob.mutateAsync({
    title: title.trim() || 'Auto-generated posts',   ← from "Topic Hint" field
    content_lines: [],                                ← always empty for posts
    brands: selectedBrands,                           ← array of selected brands
    variant: 'post',                                  ← always 'post'
    ai_prompt: aiPrompt.trim() || title.trim() || undefined,  ← image prompt or title fallback
    cta_type: 'none',
})
    │
    ▼
Frontend API: POST /jobs/create  (jobs-api.ts)
    │
    ▼
Backend: jobs_routes.py → create_job()
    │
    ├── Creates GenerationJob in database
    │   - title = request.title (the "Topic Hint" value)
    │   - ai_prompt = request.ai_prompt
    │   - brands = request.brands
    │   - variant = 'post'
    │
    ├── Starts background task: process_job_async(job_id)
    │
    ▼
job_manager.py → process_job()
    │
    ├── Detects variant == 'post'
    │
    ├── ⚠️ KEY: topic_hint = job.ai_prompt or None
    │   (NOT job.title — it uses ai_prompt as topic_hint for content generation)
    │
    ├── Calls: cg.generate_post_titles_batch(total_brands, topic_hint)
    │   This generates N COMPLETELY NEW titles — one per brand
    │   The topic_hint is only a HINT, not a title to use directly
    │
    ├── Stores each brand's unique title/caption/image_prompt in brand_outputs
    │
    └── For each brand: process_post_brand() → generates AI background image
```

### 2. "Auto Generate" Button (`handleAutoGenerate`)

```
User clicks "Auto Generate"
    │
    ▼
POST /reels/generate-post-title  (body: {})
    │
    ├── NO topic_hint is sent (empty body)
    │
    ▼
Backend: routes.py → generate_post_title()
    │
    ├── topic_hint = request.topic_hint → None (not provided)
    │
    ▼
content_generator_v2.py → generate_post_title(topic_hint=None)
    │
    ├── AI generates a single title + caption + image_prompt
    │
    ▼
Returns to frontend:
    ├── Sets `title` state = data.title (fills "Topic Hint" field)
    ├── Sets `aiPrompt` state = data.image_prompt (fills "AI Image Prompt" field)
    │
    ▼
User sees the filled form and must click "Generate Posts" manually
```

**Key difference**: Auto Generate just fills the form fields. It does NOT create a job. The user still needs to click "Generate Posts" afterward.

### 3. "Generate Title" Button (`handleGenerateTitle`)

```
Same as Auto Generate — calls POST /reels/generate-post-title with empty body
Fills both title and aiPrompt fields
```

### 4. "Generate Prompt" Button (`handleGeneratePrompt`)

```
User clicks "Generate Prompt" (requires title to be non-empty)
    │
    ▼
POST /reels/generate-image-prompt  (body: { title })
    │
    ▼
Backend: routes.py → generate_image_prompt()
    │
    ▼
content_generator_v2.py → generate_image_prompt(title)
    │
    ├── AI generates an image prompt based on the given title
    │
    ▼
Returns to frontend → fills `aiPrompt` field only
```

### 5. "God Automation 🔱" Button

```
User clicks "God Automation 🔱"
    │
    ▼
Opens GodAutomation overlay component
    │
    ├── User selects batch size (2/4/8/10 rounds per brand)
    │
    ├── Clicks "Start God Mode"
    │
    ▼
startGeneration(rounds)
    │
    ├── Builds queue: rounds × brands posts
    │
    ├── Fetches occupied schedule slots
    │
    ├── POST /reels/generate-post-titles-batch  { count: 5 }
    │   → Generates 5 unique posts (title + caption + image_prompt) all at once
    │
    ├── For each post: POST /reels/generate-post-background  { brand, prompt }
    │   → Generates AI background image → returns base64
    │
    ├── Enters "reviewing" phase (Tinder-style swipe review)
    │   - YES → captures canvas → POST /reels/schedule-post-image
    │   - NO  → regenerates (bad_image = retry image, bad_topic = regenerate all)
    │
    ├── Background: generates remaining posts in pairs while user reviews
    │
    └── When all reviewed → "done" phase → summary screen
```

**Key difference from "Generate Posts"**:
- God Automation does NOT use the Jobs system at all
- It calls `/reels/generate-post-titles-batch` directly (N unique posts per API call)
- It generates backgrounds directly via `/reels/generate-post-background`
- It schedules directly via `/reels/schedule-post-image`
- It NEVER reads the "Topic Hint" field from the Posts page — it always passes `topic_hint: undefined`

---

## Root Cause: Why Generated Posts Don't Match What the User Typed

### The Problem

When a user types a topic in the "Topic Hint" field (e.g., "focus on teas and sleep rituals") and clicks **"Generate Posts"**, the generated posts have COMPLETELY DIFFERENT titles/topics than what was typed.

### The Root Cause Chain

1. **Frontend sends `title` as the "Topic Hint" value** (Posts.tsx line ~110):
   ```ts
   title: title.trim() || 'Auto-generated posts'
   ```

2. **Frontend sends `ai_prompt`** as either the image prompt text or the title as fallback:
   ```ts
   ai_prompt: aiPrompt.trim() || title.trim() || undefined
   ```

3. **Backend `process_job()`** (job_manager.py line ~648):
   ```python
   topic_hint = job.ai_prompt or None
   ```
   It uses `job.ai_prompt` (which is the AI Image Prompt field, not the Title field) as the `topic_hint` for content generation.

4. **If the user typed a Topic Hint but left AI Image Prompt empty**, then:
   - `ai_prompt` on the frontend = `title.trim()` (the Topic Hint value) — OK, this gets sent
   - `job.ai_prompt` on the backend = that same Topic Hint value — OK
   - `topic_hint` = `job.ai_prompt` — this is the Topic Hint ✅

5. **If the user typed BOTH Topic Hint AND AI Image Prompt**, then:
   - `ai_prompt` = the AI Image Prompt text (NOT the topic hint)
   - `topic_hint` = `job.ai_prompt` = the AI Image Prompt text ❌
   - The actual Topic Hint (`job.title`) is **IGNORED** during content generation

6. **The `generate_post_titles_batch()` generates N NEW titles regardless**:
   - Even when `topic_hint` is provided, it's just a soft hint in the AI prompt
   - The AI generates completely new titles, captions, and topics
   - It does NOT use the user's typed text as the actual title
   - The user's Topic Hint is passed as `topic_hint` to the AI, but the AI decides the final title

### Summary of the Disconnect

| What user expects | What actually happens |
|---|---|
| "I type a topic, the posts are about that topic" | The topic hint is only weakly suggested to the AI; it generates whatever it wants |
| "The title I typed becomes the post title" | The `title` state is labeled "Topic Hint" — it's never used as the literal title |
| "Generate Posts uses my Topic Hint" | `process_job()` uses `job.ai_prompt` as topic_hint, not `job.title` |
| "Each brand gets my topic" | Each brand gets a completely unique, AI-generated topic/title |

### Additional Issue: `title` State Naming Confusion

The state variable is called `title` but the UI label says "Topic Hint". This creates confusion:
- The `title` state maps to `job.title` in the database
- But `job.title` is never used for content generation in the post variant
- The actual content generation uses `job.ai_prompt` as the topic hint
- So even the relationship between form field → backend field → AI prompt has a naming gap

---

## How the `generate_post_title()` Method Works

Located in `content_generator_v2.py` starting at line 556:

1. **Topic Selection**: `content_tracker.pick_topic("post", topic_hint)` — picks a topic bucket using DB-backed cooldown rotation
2. **If `topic_hint` is provided**: It becomes the `forced_topic` in the AI prompt
3. **If `topic_hint` is None**: A random topic bucket is selected, and its description becomes the `forced_topic`
4. **AI Prompt**: The topic is embedded as `### TOPIC FOR THIS POST (mandatory — write about this topic):` in the prompt
5. **The AI generates**: `{ title, caption, image_prompt }` — a complete post from scratch
6. **Quality gates**: Checks quality score, duplicate detection
7. **Records**: Stores in `content_history` table for anti-repetition

---

## How Multi-Brand Content Works

### "Generate Posts" Flow (Jobs system)
- `process_job()` calls `generate_post_titles_batch(total_brands, topic_hint)`
- This generates N unique posts in ONE AI call
- Each brand gets a DIFFERENT title, caption, and image prompt
- The page subtitle confirms this: *"Each brand gets a unique post with different topic, title, and image."*

### "God Automation" Flow
- Also calls `generate-post-titles-batch` in chunks
- Each brand gets a unique post (not the same content across brands)
- Posts are reviewed in Tinder-style cards, one at a time

---

## API Endpoints Summary

| Endpoint | Method | Used By | Purpose |
|----------|--------|---------|---------|
| `/jobs/create` | POST | "Generate Posts" button | Creates job, starts background generation |
| `/reels/generate-post-title` | POST | "Auto Generate" + "Generate Title" buttons | Generates 1 title + caption + image_prompt |
| `/reels/generate-image-prompt` | POST | "Generate Prompt" button | Generates image prompt from a title |
| `/reels/generate-post-titles-batch` | POST | God Automation | Generates N unique posts in 1 AI call |
| `/reels/generate-post-background` | POST | God Automation | Generates AI background image (returns base64) |
| `/reels/schedule-post-image` | POST | God Automation | Schedules a completed post |
