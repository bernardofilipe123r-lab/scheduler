# Complete System Documentation: Reels & Carousel Posts Generation

> **Definitive reference** for the entire content generation, composition, scheduling, and publishing pipeline.
> Covers frontend triggers, backend processing, AI prompts, media generation, and auto-publishing.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [FLOW 1: Auto-Generate Viral Reel (🤖 button)](#3-flow-1-auto-generate-viral-reel--button)
4. [FLOW 2: Generate Reels (🎬 button)](#4-flow-2-generate-reels--button)
5. [FLOW 3: Auto Generate Viral Carousel Posts](#5-flow-3-auto-generate-viral-carousel-posts)
6. [Caption Generation Deep Dive](#6-caption-generation-deep-dive)
7. [YouTube Integration Deep Dive](#7-youtube-integration-deep-dive)
8. [Content Quality & Anti-Repetition Systems](#8-content-quality--anti-repetition-systems)
9. [Scheduling System](#9-scheduling-system)
10. [Brand Differentiation](#10-brand-differentiation)
11. [Technical Reference](#11-technical-reference)

---

## 1. Executive Summary

This system is an **end-to-end automated content factory** for health & wellness social media brands. It generates, composes, schedules, and publishes Instagram Reels/Posts, Facebook Reels/Posts, and YouTube Shorts — across **5 brands** — with minimal human intervention.

**What it does in one sentence:** A user clicks a button, AI generates health content + images, the backend composes videos/carousels, schedules them across 5 brands on 3 platforms, and an auto-publisher pushes them out on a clock.

### Key Capabilities

| Capability | Description |
|---|---|
| **Viral Reel Generation** | AI creates title + 8 content points + background image → composed into thumbnail, reel image, 7-8s video |
| **Carousel Post Generation** | AI creates title + caption + slide texts + background image → rendered into multi-slide carousels |
| **Multi-Brand** | One generation creates unique content for up to 5 brands via content differentiation |
| **Multi-Platform** | Publishes to Instagram, Facebook, and YouTube automatically |
| **Quality Control** | Quality scoring with retry loop (reels), structural quality gate (posts), anti-repetition fingerprinting |
| **Auto-Scheduling** | 6 reel slots/day + 2 post slots/day per brand, staggered across brands |
| **Auto-Publishing** | APScheduler polls every 60s and publishes due content via Meta Graph API + YouTube Data API |

---

## 2. System Architecture Overview

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React + Vite)                       │
│                                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                │
│  │ Generator.tsx │   │  Posts.tsx    │   │  Prompts.tsx │                │
│  │  (Reels)      │   │ (Carousels)  │   │ (Inspection) │                │
│  └──────┬───────┘   └──────┬───────┘   └──────────────┘                │
│         │                   │                                           │
└─────────┼───────────────────┼───────────────────────────────────────────┘
          │ REST API          │ REST API
          ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (FastAPI + Python)                        │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐        │
│  │ Content Generation│  │ Media Pipeline  │  │ Publishing Engine │       │
│  │ (DeepSeek AI)    │  │ (PIL + FFmpeg)  │  │ (APScheduler)     │       │
│  └────────┬────────┘  └────────┬────────┘  └────────┬─────────┘        │
│           │                    │                     │                   │
│  ┌────────▼────────────────────▼─────────────────────▼─────────┐        │
│  │                    Supabase (PostgreSQL + Storage)            │        │
│  └──────────────────────────────────────────────────────────────┘        │
│                                                                         │
│  ┌───────────────────┐  ┌────────────────┐  ┌──────────────────┐        │
│  │ deAPI (AI Images)  │  │ Node.js Konva  │  │ Meta / YouTube   │        │
│  │ Flux1schnell       │  │ (Slide Render) │  │ Graph API / v3   │        │
│  │ ZImageTurbo_INT8   │  │                │  │                  │        │
│  └───────────────────┘  └────────────────┘  └──────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind | UI for content management |
| Backend | FastAPI (Python) | API + job processing pipeline |
| Database | PostgreSQL (Supabase) + SQLAlchemy ORM | Jobs, brands, scheduling, content history |
| AI Text | DeepSeek API (`deepseek-chat`) | Content, captions, titles, image prompts |
| AI Images (Reels) | deAPI — `Flux1schnell` | 1152×1920, 4 steps, ~$0.00136/image |
| AI Images (Posts) | deAPI — `ZImageTurbo_INT8` | 1088×1360, 8 steps |
| Image Composition | PIL/Pillow | Text overlays, brand colors, thumbnails |
| Carousel Rendering | Node.js + Konva (`render-slides.cjs`) | Server-side slide composition |
| Video Creation | FFmpeg | Static image + music → 7-8s MP4 |
| File Storage | Supabase Storage | All media (no local persistence) |
| Auto-Publishing | APScheduler (60s interval) | Polls DB, publishes due content |
| Instagram/Facebook | Meta Graph API v19.0 | Reels, image posts, carousels |
| YouTube | YouTube Data API v3 | Shorts upload + thumbnails |

---

## 3. FLOW 1: Auto-Generate Viral Reel (🤖 button)

> **Frontend:** `src/pages/Generator.tsx` → `handleAutoGenerate()`
> **Backend:** `POST /reels/auto-generate-content`
> **Core logic:** `app/services/content/generator.py` → `ContentGeneratorV2.generate_viral_content()`

### What Happens Step-by-Step

```
User clicks "🤖 Auto-Generate Viral Reel"
    │
    ▼
┌─ FRONTEND ──────────────────────────────────────────────┐
│ POST /reels/auto-generate-content  (empty body)          │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─ BACKEND ───────────────────────────────────────────────┐
│                                                          │
│  1. PatternSelector picks:                               │
│     • Topic (from 16 buckets, avoiding recent)           │
│     • Title archetype (from 11 patterns)                 │
│     • Content format (SHORT_FRAGMENT / FULL_SENTENCE /   │
│       CAUSE_EFFECT / PURE_LIST)                          │
│     • Psychological hook (fear / curiosity / authority /  │
│       control / hope)                                    │
│                                                          │
│  2. build_runtime_prompt() assembles the prompt          │
│     (with history injection if available)                │
│                                                          │
│  3. DeepSeek API call                                    │
│     Temperature: 0.7 | Max tokens: 800                   │
│                                                          │
│  4. QualityScorer evaluates output (score 0-100)         │
│     ≥80 → Accept                                         │
│     65-79 → Regenerate with correction prompt            │
│     <65 → Regenerate from scratch                        │
│     (max 3 attempts)                                     │
│                                                          │
│  5. Return: { title, content_lines[8], image_prompt }    │
│                                                          │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─ FRONTEND ──────────────────────────────────────────────┐
│ • title → balanced across 2 lines via balanceTitle()     │
│ • content_lines → joined with \n into textarea           │
│ • image_prompt → sets aiPrompt, switches variant to dark │
│ • Toast with title, topic_category, format_style         │
│ • Pulse animation on title + content fields              │
│                                                          │
│ ** NO JOB CREATED — user reviews and clicks Generate **  │
└─────────────────────────────────────────────────────────┘
```

### The 3-Layer Architecture

#### Layer 1: Pattern Brain (`app/core/viral_patterns.py`)

**11 Title Archetypes** — pre-selected before the AI call:

| # | Pattern | Template |
|---|---------|----------|
| 1 | body_signal | `"SIGNS YOUR BODY IS {STATE}"` |
| 2 | numbered_signs | `"{NUMBER} SIGNS YOUR {BODY_PART} IS {CONDITION}"` |
| 3 | food_list | `"BEST {CATEGORY} FOR {GOAL}"` |
| 4 | stop_doing | `"STOP {ACTION} IF YOU WANT TO {GOAL}"` |
| 5 | eat_this | `"EAT {FOOD} EVERY DAY FOR {BENEFIT}"` |
| 6 | before_bed | `"DO THIS BEFORE BED TO {BENEFIT}"` |
| 7 | morning_routine | `"DO THIS EVERY MORNING TO {BENEFIT}"` |
| 8 | never_mix | `"NEVER {ACTION} WITH {THING}"` |
| 9 | why_youre | `"THIS IS WHY YOU'RE {STATE}"` |
| 10 | drink_this | `"DRINK THIS IF YOU {CONDITION}"` |
| 11 | real_reason | `"THE REAL REASON YOUR {BODY_PART} IS {STATE}"` |

**4 Content Formats:**

| Format | Max Words/Line | Description |
|---|---|---|
| SHORT_FRAGMENT | 8 | Punchy, incomplete sentence fragments |
| FULL_SENTENCE | 20 | Complete educational sentences |
| CAUSE_EFFECT | 15 | "This happens → because of this" |
| PURE_LIST | 6 | One food/supplement per line |

**5 Psychological Hooks:**

| Hook | Triggers | Language |
|---|---|---|
| fear | disease anxiety, body neglect | "signs", "dangers", "never" |
| curiosity | unknown mechanisms, hidden | "why", "the real reason", "what happens" |
| authority | doctor, research studies | "studies show", "experts say" |
| control | agency, self-optimization | "how to", "do this", "stop doing" |
| hope | transformation, healing | "can help", "supports", "improves" |

**16 Topic Buckets:** gut_health, sleep, nutrition, aging, body_signals, habits, mindset, stress, energy, hydration, inflammation, hormones, brain, detox, cardiovascular, deficiencies

**PatternSelector Anti-Repetition:**
- No consecutive format repeat
- Recent topic tracking (avoids last N topics)
- Archetype rotation
- 70% natural hook selection / 30% random for variety

#### Layer 2: System Prompt (`app/core/prompt_templates.py`)

```
You are an AI that generates viral short-form health & wellness content.
You have studied millions of viral reels and understand what makes content perform.

YOUR ONLY JOB: Generate a title + content points that match the exact format requested.

ABSOLUTE RULES:
- Title MUST be in ALL CAPS
- Follow the exact format_style specified
- Stay within word limits per line
- Output valid JSON only
- No emojis, no hashtags, no numbered lists
- Content must be health/wellness focused
- Each point must be a standalone insight

You will receive: topic, format, hook type, point count, and a title pattern to follow.
Generate content that matches these parameters perfectly.
```

#### Layer 3: Runtime Prompt

```
Generate viral health content with these EXACT parameters:

TOPIC: {topic}
FORMAT STYLE: {format_name} (max {max_words} words per line)
HOOK TYPE: {hook_type} — use language like: {hook_lang}
POINTS: exactly {point_count} content points
TITLE PATTERN: Follow this archetype: "{title_pattern}"

{format_rules}

HOOK LANGUAGE to weave in: {hook_lang}

{brand_section}

Output ONLY this JSON:
{
  "title": "YOUR ALL CAPS TITLE HERE",
  "content_lines": ["point 1", "point 2", ...],
  "format_style": "{format_name}"
}
```

When history is available, the prompt is prefixed with:

```
### PREVIOUSLY GENERATED (DO NOT REPEAT):
Recent titles: {recent_titles}
Recent topics: {recent_topics}
IMPORTANT: Generate something COMPLETELY DIFFERENT from the above.
```

### Quality Scoring Loop

The `QualityScorer` evaluates each AI output across **5 dimensions** (100 points total):

| Dimension | Weight | Key Checks |
|---|---|---|
| Structure (25%) | 25 pts | ALL CAPS title, 3-10 words, point count in range, word limits, no emojis/hashtags |
| Familiarity (20%) | 20 pts | Matches viral title patterns, ≥3 health keywords, simple language |
| Novelty (20%) | 20 pts | SequenceMatcher vs recent outputs (<0.7 similarity) |
| Hook (20%) | 20 pts | Contains keywords matching selected hook type |
| Plausibility (15%) | 15 pts | No blacklist words ("cure", "guaranteed", "miracle"), has softeners ("may", "can", "supports") |

**Decision logic (max 3 attempts):**

```
Score ≥ 80  →  ACCEPT — proceed to return
Score 65-79 →  REGENERATE with self-correction prompt (see below)
Score < 65  →  REJECT — regenerate from scratch
```

**Self-Correction Prompt** (sent when score is 65-79):

```
Your previous output scored {score}/100. Issues found:
{issues_list}

SPECIFIC FIXES NEEDED:
{fix_instructions}

Original request: {original_prompt}

Generate an IMPROVED version fixing ALL issues above.
Output the same JSON format.
```

Fix instructions vary by issue:
- **low_novelty**: "Make the title and content MORE UNIQUE. Use unexpected angles, surprising comparisons, or little-known facts."
- **weak_hook**: "Make the {hook_type} hook STRONGER. Use more powerful {hook_type} language: {hook_triggers}"
- **structure_error**: "Fix structure: title must be ALL CAPS, {point_count} points, max {max_words} words per line, no emojis/hashtags"
- **plausibility_issue**: "Remove any unverifiable claims. Use hedging language (may, can, supports)."

---

## 4. FLOW 2: Generate Reels (🎬 button)

> **Frontend:** `src/pages/Generator.tsx` → `handleSubmit()`
> **Backend:** `POST /jobs/create` → `process_job_async()` → `regenerate_brand()` per brand
> **Used both manually AND after the auto-generate button fills the form**

### What Data Gets Sent

```json
{
  "title": "SIGNS YOUR BODY\nIS BEGGING FOR MAGNESIUM",
  "content_lines": ["Muscle cramps at night", "Constant fatigue", ...],
  "brands": ["healthycollege", "vitalitycollege", "longevitycollege", "holisticcollege", "wellbeingcollege"],
  "variant": "dark",
  "ai_prompt": "Fresh magnesium-rich foods on marble surface with dark leafy greens...",
  "cta_type": "follow_tips",
  "platforms": ["instagram", "facebook", "youtube"]
}
```

If `variant === 'dark'` and `ai_prompt` is blank, frontend auto-calls `POST /reels/generate-image-prompt` first to generate one.

### Complete Pipeline (Per Job)

```
POST /jobs/create
    │
    ├─ Create GenerationJob in DB (status: "pending")
    ├─ Return job_id immediately → frontend polls via useJobs()
    │
    └─ Background: process_job_async() (semaphore: max 2 concurrent jobs)
        │
        ├─── Step A: Content Differentiation ─────────────────────────┐
        │    ContentDifferentiator.differentiate_all_brands()          │
        │    • longevitycollege (baseline) → gets ORIGINAL content     │
        │    • All other brands → ONE DeepSeek call, temp 0.9          │
        │    • Each brand gets shuffled, reworded, ±1-2 items          │
        │    Returns: Dict[brand → unique content_lines]               │
        └─────────────────────────────────────────────────────────────┘
        │
        ├─── Step B: Per-Brand Processing (threaded, max 600s) ───────┐
        │    For EACH brand in parallel:                               │
        │                                                              │
        │    ┌─ regenerate_brand() ──────────────────────────────────┐ │
        │    │                                                        │ │
        │    │  b1. AI Background Image                               │ │
        │    │      • API: deAPI (Flux1schnell)                       │ │
        │    │      • Resolution: 1152×1920 (9:16 portrait)           │ │
        │    │      • Steps: 4                                        │ │
        │    │      • Post-processing: brightness reduced 5%          │ │
        │    │      • Retry: exponential backoff for 429s             │ │
        │    │      • Concurrency: global FIFO semaphore (1 at a time)│ │
        │    │                                                        │ │
        │    │  b2. Thumbnail Composition (PIL)                       │ │
        │    │      • Light: solid #f4f4f4 background                 │ │
        │    │      • Dark: AI bg + 55% dark overlay                  │ │
        │    │      • Text: auto-scaling title font (75-98px, 3 lines)│ │
        │    │      • Bottom: brand name text                         │ │
        │    │                                                        │ │
        │    │  b3. Reel Image Composition (PIL)                      │ │
        │    │      • Light: solid brand-colored background            │ │
        │    │      • Dark: AI bg + 85% overlay                       │ │
        │    │      • Title: stepped background bars (brand color)     │ │
        │    │      • Content: numbered lines with **bold** support    │ │
        │    │      • CTA: appended at bottom                         │ │
        │    │      • Font scaling: content font scales down from 30px │ │
        │    │                                                        │ │
        │    │  b4. Video Creation (FFmpeg)                            │ │
        │    │      • Duration: 7-8 seconds (random)                  │ │
        │    │      • Input: static reel image                        │ │
        │    │      • Audio: random from 3 music tracks               │ │
        │    │      • Random start time within music file              │ │
        │    │      • Codec: libx264 → MP4                            │ │
        │    │                                                        │ │
        │    │  b5. Caption Generation (DeepSeek)                     │ │
        │    │      • AI-generated first paragraph                    │ │
        │    │      • Template sections appended (follow, save, CTA)  │ │
        │    │      • See Section 6 for full details                  │ │
        │    │                                                        │ │
        │    │  b6. YouTube Title (DeepSeek)                          │ │
        │    │      • 40-70 chars, Title Case, no numbers             │ │
        │    │      • Curiosity-driven, search-optimized              │ │
        │    │                                                        │ │
        │    │  b7. YouTube Thumbnail                                  │ │
        │    │      • Clean AI background image, no text overlay       │ │
        │    │      • Saved as JPEG (YouTube 2MB limit)               │ │
        │    │                                                        │ │
        │    │  b8. Upload ALL to Supabase Storage                    │ │
        │    │      → thumbnail_path, reel_image_path, video_path,    │ │
        │    │        yt_thumbnail_path stored in brand_outputs        │ │
        │    │                                                        │ │
        │    └────────────────────────────────────────────────────────┘ │
        └─────────────────────────────────────────────────────────────┘
        │
        ├─── Step C: Scheduling ──────────────────────────────────────┐
        │    • 6 slots/day per brand (every 4 hours)                   │
        │    • Alternating: Light → Dark → Light → Dark → ...          │
        │    • Brands staggered by schedule_offset (0-4)               │
        │    • Creates ScheduledReel records in DB                     │
        └─────────────────────────────────────────────────────────────┘
        │
        └─ Update job status: "completed"
```

### `brand_outputs` Structure (Per Brand, Stored in Job)

```json
{
  "healthycollege": {
    "status": "completed",
    "reel_id": "abc123",
    "title": "BRAND-SPECIFIC TITLE",
    "content_lines": ["differentiated point 1", "..."],
    "thumbnail_path": "https://supabase.../thumb.png",
    "reel_image_path": "https://supabase.../reel.png",
    "video_path": "https://supabase.../video.mp4",
    "yt_thumbnail_path": "https://supabase.../yt_thumb.jpg",
    "caption": "Full Instagram caption...",
    "yt_title": "YouTube Optimized Title",
    "scheduled_time": "2026-02-19T08:00:00Z"
  }
}
```

---

## 5. FLOW 3: Auto Generate Viral Carousel Posts

> **Frontend:** `src/pages/Posts.tsx` → modal → `handleAutoSubmit()`
> **Backend:** `POST /jobs/create` (variant: "post") → `process_job_async()` → `generate_post_titles_batch()` + `process_post_brand()` per brand
> **Publish-time rendering:** `_render_slides_node()` via Node.js Konva

### What Happens Step-by-Step

```
User clicks "Auto Generate Viral Carrousel Posts"
    │
    ▼
┌─ FRONTEND ──────────────────────────────────────────────┐
│ Modal opens:                                              │
│ • Pre-selects all 5 brands                               │
│ • User picks count (1 to N) and toggles brands           │
│ • Clicks "Generate"                                      │
│                                                          │
│ POST /jobs/create {                                      │
│   title: "Auto-generated posts",                         │
│   content_lines: [],                                     │
│   brands: ["brand1", "brand2", ...],                     │
│   variant: "post",                                       │
│   cta_type: "none"                                       │
│ }                                                        │
│                                                          │
│ Key differences from reels:                              │
│ • variant is always "post"                               │
│ • content_lines is always [] (empty)                     │
│ • No platforms field                                     │
│ • No fixed_title flag (backend generates unique titles)  │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─ BACKEND ───────────────────────────────────────────────┐
│                                                          │
│  Step 1: Batch Content Generation (ONE massive AI call)  │
│  ────────────────────────────────────────────────────── │
│  generate_post_titles_batch(count=N, brands)             │
│  • ContentTracker.pick_topic() — picks topic with        │
│    longest cooldown (13 topic buckets, 3-day cooldown)   │
│  • ContentTracker.build_history_context() — last 25      │
│    titles injected for anti-repetition                   │
│  • build_post_content_prompt() — ~3000+ word prompt      │
│  • DeepSeek API: temp 0.95, max_tokens 8000              │
│  • Returns N unique posts, each with:                    │
│    { title, caption, image_prompt, slide_texts }         │
│                                                          │
│  Step 2: Per-Brand Processing                            │
│  ────────────────────────────────────────────────────── │
│  For EACH brand (threaded):                              │
│  process_post_brand()                                    │
│  • AIBackgroundGenerator.generate_post_background()      │
│    - Model: ZImageTurbo_INT8                             │
│    - Resolution: 1088×1360                               │
│    - Steps: 8                                            │
│    - Composition prefix: "subject in top third,          │
│      bottom half clean"                                  │
│  • Upload background to Supabase → background_path      │
│  • That's it — NO video, NO thumbnail, NO separate       │
│    caption generation                                    │
│                                                          │
│  Step 3: Job marked "completed"                          │
│                                                          │
│  ... LATER, at publish time ...                          │
│                                                          │
│  Step 4: Slide Rendering (check_and_publish())           │
│  ────────────────────────────────────────────────────── │
│  • If carousel_paths already exist → publish directly    │
│  • Else → _render_slides_node()                          │
│    - Node.js Konva renders cover slide + text slides     │
│    - Uses brand colors, fonts, layout settings           │
│    - Uploads rendered PNGs to Supabase                   │
│  • Publishes carousel to Instagram + Facebook            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### The Batch Post Generation Prompt

This is the massive ~3000+ word prompt used to generate N posts in a single AI call:

```
You are generating {count} unique educational health & wellness social media posts.
Each post must be completely different from the others.

TARGET AUDIENCE:
- Women aged 35 and older
- Interested in natural health, nutrition, and prevention
- Looking for science-backed but accessible content
- Active on Instagram, values educational content

{brand_section}

TOPIC CATEGORIES (choose different ones for variety):
1. Superfoods & Nutrient-Dense Foods
2. Anti-Aging & Longevity Strategies
3. Gut Health & Digestive Wellness
4. Hormonal Balance & Metabolic Health
5. Sleep Optimization & Recovery
6. Stress Management & Mental Wellness
7. Heart Health & Cardiovascular Support
8. Brain Health & Cognitive Function
9. Inflammation & Immune Support
10. Hydration & Detoxification
11. Skin Health & Natural Beauty
12. Energy & Vitality Boosters
13. Bone & Joint Health
14. Eye Health & Vision Support
15. Hair & Nail Health
16. Blood Sugar & Insulin Sensitivity
17. Herbal Remedies & Traditional Wellness
18. Morning & Evening Wellness Rituals

{history_section}

TITLE REQUIREMENTS:
- 8-14 words, ALL CAPS
- Must be about health/wellness/nutrition
- NO periods at the end
- NO list-style (don't start with numbers)
- Vary style across posts:
  * Style A: Statement ("THESE FOODS CAN HELP SUPPORT HEALTHY BLOOD PRESSURE NATURALLY")
  * Style B: "Why" question framing ("WHY YOUR MORNING COFFEE MIGHT BE AFFECTING YOUR SLEEP QUALITY")
  * Style C: "How" actionable ("HOW TO NATURALLY SUPPORT YOUR GUT HEALTH WITH EVERYDAY FOODS")

CAPTION REQUIREMENTS:
- 4-5 paragraphs of educational content
- Warm, informative tone (like a knowledgeable friend)
- Include specific foods, nutrients, or habits with explanations
- NO emojis, NO hashtags in the caption body
- End with:
  * Source: [Real academic source with DOI link — must be a real, verifiable DOI]
  * Disclaimer: This content is for informational purposes only...

CAROUSEL SLIDE TEXT REQUIREMENTS:
- 3-4 slides of educational content
- Each slide: a heading + 3-5 bullet points
- Bullet points should be concise (6-12 words)
- First slide should hook attention
- Last slide should summarize or give actionable takeaway

{carousel_examples}

IMAGE PROMPT REQUIREMENTS:
- Describe a photorealistic still-life scene
- Focus on foods, ingredients, or wellness items related to the topic
- NO text, NO people, NO abstract concepts
- Style: bright, well-lit, professional food/wellness photography
- Under 40 words

OUTPUT FORMAT (JSON array):
[
  {
    "title": "YOUR ALL CAPS TITLE HERE",
    "caption": "Full multi-paragraph caption...\n\nSource: Author et al. (Year). Title. Journal. DOI\n\nDisclaimer: ...",
    "slide_text": "Slide 1 heading\n- bullet 1\n- bullet 2\n\nSlide 2 heading\n- bullet 1...",
    "image_prompt": "Photorealistic still-life description..."
  }
]
```

The prompt includes **15 few-shot carousel slide examples** covering: Neuroplasticity, Curiosity, Collagen, Iron, Walking, Magnesium, Protein, Strength Training, Fiber, Sleep, Gut Health, Blood Sugar, Cortisol, Walking After Meals, Electrolytes.

### Post Output Per Brand

```json
{
  "title": "THESE 5 MORNING HABITS ARE AGING YOU FASTER THAN SUGAR",
  "caption": "Full Instagram caption with DOI references...",
  "image_prompt": "A serene woman in her 40s doing morning stretches...",
  "slide_texts": [
    "Slide 1: 3-6 sentences about the topic...",
    "Slide 2: Another aspect of the topic...",
    "Slide 3: Supporting evidence..."
  ],
  "background_path": "https://supabase.../bg.png"
}
```

### Manual Post Generation (Single Brand)

The manual flow (`handleSubmit` on Posts page) differs:
- Sends `fixed_title: true` — backend uses the exact user-typed title
- Only 1 brand selected (radio-like single selection)
- User can provide their own `ai_prompt` for the background image
- Same endpoint (`POST /jobs/create`) with `variant: "post"`

---

## 6. Caption Generation Deep Dive

### 6.1 Instagram/Facebook Caption for Reels

**File:** `app/services/media/caption_generator.py` → `generate_caption()`

Reel captions are assembled from an **AI-generated first paragraph** + **fixed template sections**.

#### Final Caption Structure

```
[AI-generated first paragraph — 3-4 sentences, warm educational tone]

👉🏼 Follow {brand_handle} for daily, research-informed content on whole-body health...

🩵 This post is designed to be saved and revisited. Share it with friends and family...

💬 [Selected CTA — see below]

🌱 Content provided for educational purposes. Always seek guidance from a qualified
   healthcare provider...

#habits #interestingfacts #naturalhealing #healthtips #holistichealth
```

#### First Paragraph AI Generation

**System message:**
```
You are a health and wellness content writer. Write clear, informative content without hype
or exaggeration. Always vary your opening sentences to ensure unique content - never repeat
the same opening pattern.
```

**User prompt:**
```
You are writing the first paragraph for an Instagram health/wellness post.
The post is about: {title}

Key points covered:
{content_summary}

STYLE INSTRUCTION: {random_style_hint}

Write a compelling opening paragraph (3-4 sentences) that:
1. Hooks the reader with an interesting fact or insight about the topic
2. Explains why this topic matters for their health
3. Mentions how small, consistent choices can make a difference
4. Uses a warm, educational tone (not salesy)
5. CRITICAL: Start with a COMPLETELY DIFFERENT opening sentence structure and words

DO NOT include:
- Hashtags
- Emojis
- Calls to action
- Brand mentions
- Questions

Just write the paragraph text, nothing else.
```

**Parameters:** Temperature 1.0, Max Tokens 300, Timeout 30s

#### 6 Opening Style Variations (randomized per generation)

1. "Start with a surprising statistic or fact"
2. "Begin with a common misconception to debunk"
3. "Open with how this impacts daily life"
4. "Start by describing what happens in the body"
5. "Begin with why most people overlook this"
6. "Open with a relatable scenario or observation"

#### 3 CTA Options

| CTA Type | Text |
|---|---|
| `sleep_lean` | "💬 If you want to take this one step further, comment LEAN. We'll send you details about Sleep Lean, a targeted nighttime formula designed to support fat loss while you sleep..." |
| `follow_tips` | "💬 If you found this helpful, make sure to follow for more daily tips on nutrition, health, and natural wellness strategies..." |
| `workout_plan` | "💬 If you want to take this one step further, comment PLAN. We'll send you our complete guide to building the best workout and nutrition plan..." |

#### Facebook Caption Shortening

`social_publisher.py` → `create_facebook_caption()`:
- Extracts first paragraph (hook) from full Instagram caption
- Truncates to max **400 characters**
- Appends: "Follow {handle} for daily health tips 🩵"

### 6.2 Instagram/Facebook Caption for Posts

Post captions are **NOT generated by `CaptionGenerator`**. They are produced inline within the batch/single post generation prompt (Section 5).

**Required format:**
- 4-5 paragraphs of educational content
- Warm, informative tone
- Specific foods, nutrients, or habits with explanations
- NO emojis, NO hashtags in body
- Ends with:
  - `Source:` — real academic DOI from PubMed/Nature/JAMA
  - `Disclaimer:` — "This content is for informational purposes only..."

---

## 7. YouTube Integration Deep Dive

### 7.1 YouTube Title Generation

**File:** `app/services/media/caption_generator.py` → `generate_youtube_title()`

**System message:**
```
You are a YouTube SEO expert. Write engaging, searchable titles.
```

**User prompt:**
```
You are creating a YouTube Shorts title for a health/wellness video.

Original reel title: {title}

Key points covered:
{content_summary}

Create a YouTube title that:
1. Is between 40-70 characters (short but descriptive)
2. Uses Title Case (not ALL CAPS)
3. Includes 1-2 searchable health keywords naturally
4. Creates curiosity or urgency WITHOUT using numbers
5. NEVER use numbers like "3 Signs...", "5 Foods...", "This 1 Habit..."
6. Focus on intrigue and emotional hooks instead
7. Avoids clickbait but is engaging

GOOD EXAMPLES (no numbers, curiosity-driven):
- "This Bedtime Habit Is Secretly Ruining Your Sleep"
- "Why You're Always Tired (It's Not Sleep)"
- "The Hidden Reason You Can't Lose Weight"
- "Stop Doing This Every Morning For More Energy"
- "Your Hormones Are Begging You To Eat This"
- "This Common Food Is Destroying Your Gut"

BAD EXAMPLES (avoid these):
- "3 Signs Your Hormones Are Off" (has numbers)
- "5 Foods That Speed Up Fat Loss" (has numbers)
- "EAT THIS IF YOU ARE HORMONE IMBALANCED" (all caps)
- "Amazing Health Tips You Need to Know!!" (vague, excessive punctuation)
- "Watch This Before It's Too Late" (pure clickbait)

Respond with ONLY the title, nothing else.
```

**Parameters:** Temperature 0.8, Max Tokens 100, Timeout 30s, Max Length 100 chars (truncated with "..." if over)

**Fallback:** If AI fails, converts ALL CAPS reel title to Title Case (skipping small words: "a", "an", "the", etc.)

### 7.2 YouTube Description

**File:** `app/services/youtube/publisher.py`

- Max 5000 characters
- " #Shorts" appended to the end
- Category ID: "22" (People & Blogs)
- Privacy: "public"

### 7.3 YouTube Thumbnail

- `ImageGenerator.generate_youtube_thumbnail()` — clean AI background image with NO text overlay
- Saved as JPEG (YouTube 2MB limit, auto-compressed if bigger)

### 7.4 YouTube Shorts Upload Process

**Auth:** OAuth 2.0 flow — `authorization_code` → `refresh_token` stored in DB per brand

**Upload flow:**
1. Download video + thumbnail from Supabase to temp files
2. Get YouTube `refresh_token` from DB for brand
3. Exchange `refresh_token` → fresh `access_token`
4. Upload via YouTube Data API v3 (`upload_youtube_short()`) — resumable upload
5. Set custom thumbnail via `youtube.thumbnails().set()`
6. Clean up temp files

**Quota:** 10,000 units/day; each upload costs ~1,600 units

---

## 8. Content Quality & Anti-Repetition Systems

### 8.1 QualityScorer (Reels Only)

**File:** `app/core/quality_scorer.py`

Evaluates reel content across 5 dimensions (detailed in Section 3). Summary:

```
Score ≥ 80  →  ACCEPT
Score 65-79 →  REGENERATE with correction prompt (up to 3 attempts)
Score < 65  →  REJECT and regenerate from scratch
```

### 8.2 ContentTracker (Posts & Reels)

**File:** `app/services/content/tracker.py`

Persistent, DB-backed anti-repetition system.

#### Keyword Fingerprinting
- `ContentHistory.compute_keyword_hash(title)` — sorted keywords hash
- `is_duplicate()` — checks if same keyword hash used in last **30 days**
- `is_duplicate_for_brand()` — brand-specific duplicate check (**60 days**)

#### Topic Rotation (13 Post Buckets)
superfoods, teas_drinks, supplements, sleep, morning_routines, skin_antiaging, gut_health, hormones, stress_mood, hydration_detox, brain_memory, heart_health, general

- **Cooldown:** 3 days per topic bucket
- `pick_topic()` — picks topic with longest cooldown, avoids last 5 used

#### History Injection
- `build_history_context()` — last 25 titles injected into generation prompts as a "PREVIOUSLY GENERATED" section
- `get_brand_avoidance_prompt()` — combines brand-specific (60 days) + cross-brand (7 days) history

#### Post Quality Gate (`check_post_quality()`)
Structural checks before accepting a post:
- Title length validation
- No period at end of title
- No list-style or em-dash patterns
- Caption must contain a DOI
- Caption must contain a disclaimer

#### Performance Tracking
- `is_high_performer()` — topics with quality_score ≥ 85 can be repeated earlier

### 8.3 CTA Stripping
`job_processor.py` → `_strip_cta_lines()`: Regex removes AI-generated CTAs that leak into content (patterns: "follow for more", "comment below", "share this", etc.)

---

## 9. Scheduling System

**File:** `app/services/publishing/scheduler.py` → `DatabaseSchedulerService`

### 9.1 Reel Scheduling: 6 Slots/Day

Each brand posts **6 times daily** (every 4 hours), alternating Light → Dark:

```
Brand offset=0: 12AM(L)  4AM(D)   8AM(L)  12PM(D)  4PM(L)  8PM(D)
Brand offset=1:  1AM(L)  5AM(D)   9AM(L)   1PM(D)  5PM(L)  9PM(D)
Brand offset=2:  2AM(L)  6AM(D)  10AM(L)   2PM(D)  6PM(L) 10PM(D)
Brand offset=3:  3AM(L)  7AM(D)  11AM(L)   3PM(D)  7PM(L) 11PM(D)
Brand offset=4:  4AM(L)  8AM(D)  12PM(L)   4PM(D)  8PM(L) 12AM(D)
```

### 9.2 Post Scheduling: 2 Slots/Day

Posts get **2 slots per day** — one morning, one afternoon:

```
Morning base: 8 AM + brand offset
Afternoon base: 2 PM + brand offset

Holistic  (offset=0):  8:00 AM / 2:00 PM
Healthy   (offset=1):  9:00 AM / 3:00 PM
Vitality  (offset=2): 10:00 AM / 4:00 PM
Longevity (offset=3): 11:00 AM / 5:00 PM
Wellbeing (offset=4): 12:00 PM / 6:00 PM
```

### 9.3 Auto-Publishing Engine

**Trigger:** APScheduler runs `check_and_publish()` every **60 seconds**.

```
check_and_publish() (every 60s)
    │
    ├─ scheduler.get_pending_publications()
    │   └─ SELECT ... WHERE status='scheduled' AND scheduled_time <= NOW()
    │       FOR UPDATE SKIP LOCKED    ← atomic locking, prevents duplicates
    │   └─ Mark as "publishing" immediately
    │
    ├─ For each due post:
    │   │
    │   ├─ IF REEL (variant = light/dark):
    │   │   ├─ publisher.publish_instagram_reel(video_url, caption, thumbnail)
    │   │   ├─ publisher.publish_facebook_reel(video_url, caption, thumbnail)
    │   │   └─ publish_to_youtube(video, yt_title, yt_thumbnail)
    │   │
    │   ├─ IF POST (variant = post):
    │   │   ├─ Render slides if not pre-rendered:
    │   │   │   └─ _render_slides_node() → Node.js Konva
    │   │   ├─ publisher.publish_instagram_carousel(image_urls, caption)
    │   │   └─ publisher.publish_facebook_carousel(image_urls, caption)
    │   │
    │   └─ Mark as published / failed / partial
    │
    ├─ Reset stuck "publishing" posts (>10 min)
    └─ cleanup_published_jobs() — deletes published jobs older than 1 day
```

### 9.4 Failure Handling

| Status | Meaning |
|---|---|
| `published` | All platforms succeeded |
| `failed` | All platforms failed |
| `partial` | Some platforms succeeded, some failed |

- `reset_stuck_publishing()` — resets posts stuck in "publishing" for >10 minutes
- `retry_failed()` — retries failed/partial posts (only failed platforms for partial)

---

## 10. Brand Differentiation

### How 5 Brands Get Unique Content

**Reels:** Content differentiation via `ContentDifferentiator` — one AI call transforms the original content into unique versions per brand.

**Posts:** Each post in a batch is already unique — no separate differentiation needed. Each brand gets a different post from the batch.

### Differentiation Prompt (Reels)

```
You are a content adaptation expert. Take this health content and create UNIQUE versions
for each brand below. Each version must be genuinely different - not just synonym swaps.

ORIGINAL CONTENT:
Title: {title}
Points:
{numbered_points}
Format style: {format_style}

CREATE VERSIONS FOR THESE BRANDS:
{brand_sections}

FOR EACH BRAND VERSION:
1. COMPLETELY shuffle the position/order of all points
2. REWORD each point using different synonyms and sentence structures
3. REMOVE 1-2 of the original items and ADD 1-2 NEW related items
4. Keep the same format style ({format_style}) and topic focus
5. Title should convey the same concept but use DIFFERENT words and structure

CRITICAL RULES:
- ONLY output valid JSON with the exact structure shown above
- NO markdown, NO code blocks, NO explanations
- Each brand's content must be GENUINELY DIFFERENT from all others
- Point count should be similar to original ({point_count} points ±1)
- Keep the same format style: {format_style}
```

**Parameters:** Temperature 0.9, Max Tokens 4000

### Brand Personality Hints

| Brand | Focus |
|---|---|
| healthycollege | Natural health, herbal remedies, clean eating |
| vitalitycollege | Energy, vitality, active lifestyle |
| longevitycollege | Longevity, anti-aging, long-term health (**baseline — gets original content**) |
| holisticcollege | Holistic wellness, mind-body connection |
| wellbeingcollege | Overall wellbeing, balanced life |

### Brand Color Palettes

| Brand | Light BG | Dark BG / Primary | Accent | Palette Name |
|---|---|---|---|---|
| healthycollege | #dcf6c8 | #004f00 | #22c55e | vibrant green |
| longevitycollege | #c8eaf6 | #019dc8 | #0ea5e9 | electric blue |
| vitalitycollege | #028f7a | #028f7a | #14b8a6 | teal |
| holisticcollege | #f9e0db | #f0836e | #f97316 | coral orange |
| wellbeingcollege | #fff4d6 | #ebbe4d | #eab308 | golden yellow |

### Brand Image Prompt Palettes

```python
"healthycollege":   "fresh greens, natural earth tones, organic garden feel"
"vitalitycollege":  "warm teal and coral, energetic tropical vibes"
"longevitycollege": "deep blues, serene aquatic tones, timeless elegance"
"holisticcollege":  "warm coral and terracotta, holistic spa atmosphere"
"wellbeingcollege": "warm golden yellows, honey tones, cozy comfort"
```

---

## 11. Technical Reference

### 11.1 API Endpoints

#### Job Management

| Method | Endpoint | Description |
|---|---|---|
| POST | `/jobs/create` | Create new generation job (reels or posts) |
| GET | `/jobs/{id}` | Full job details |
| GET | `/jobs/{id}/status` | Polling (status + progress) |
| POST | `/jobs/{id}/regenerate/{brand}` | Regenerate single brand |
| PATCH | `/jobs/{id}/brand/{brand}/content` | Update brand title/caption/slides |
| POST | `/jobs/{id}/brand/{brand}/regenerate-image` | Regenerate brand's background image |
| POST | `/jobs/bulk-delete` | Bulk delete jobs |
| POST | `/jobs/{id}/cancel` | Cancel job |
| DELETE | `/jobs/{id}` | Delete job |

#### Content Generation

| Method | Endpoint | Description |
|---|---|---|
| POST | `/reels/auto-generate-content` | AI generates title + content + image prompt |
| POST | `/reels/generate-image-prompt` | AI generates image prompt from title |
| POST | `/reels/generate-post-title` | Single post title + caption |
| POST | `/reels/generate-post-titles-batch` | Batch post generation (N posts) |
| POST | `/reels/generate-background` | AI background image (returns base64) |
| POST | `/reels/generate-captions` | AI captions for all brands |

#### Scheduling

| Method | Endpoint | Description |
|---|---|---|
| POST | `/reels/schedule` | Manual scheduling |
| POST | `/reels/schedule-auto` | Magic scheduling (auto-picks slots) |
| POST | `/reels/schedule-post-image` | Schedule carousel post |
| POST | `/reels/scheduled/clean-reel-slots` | Fix reel scheduling collisions |
| POST | `/reels/scheduled/clean-post-slots` | Fix post scheduling collisions |

#### Prompts Inspection

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/prompts/overview` | All prompt layers, palettes, models |
| POST | `/api/prompts/test-generate` | Generate test images from prompt |
| POST | `/api/prompts/build-final` | Preview assembled final prompt |

#### Brands

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v2/brands` | List all brands |
| POST | `/api/v2/brands` | Create brand |
| PUT | `/api/v2/brands/{id}` | Update brand |
| DELETE | `/api/v2/brands/{id}` | Soft delete (deactivate) |
| PUT | `/api/v2/brands/{id}/credentials` | Update Meta credentials |
| GET | `/api/v2/brands/{id}/colors` | Brand colors |
| GET | `/api/v2/brands/connections` | Platform connection status |
| GET | `/api/v2/brands/prompts` | Global content prompt settings |
| PUT | `/api/v2/brands/prompts` | Update global prompts |

### 11.2 AI Model Configurations

#### DeepSeek (`deepseek-chat`) — Text Generation

| Use Case | Temperature | Max Tokens | Timeout |
|---|---|---|---|
| Viral reel content | 0.7 | 800 | — |
| Post titles (single) | 1.0 | 2000 | — |
| Post titles (batch) | 0.95 | 8000 | — |
| Image prompts | 0.8 | 300 | — |
| Captions (first paragraph) | 1.0 | 300 | 30s |
| YouTube titles | 0.8 | 100 | 30s |
| Content differentiation | 0.9 | 4000 | — |

#### deAPI — Image Generation

| Model | Use Case | Resolution | Steps | Cost | Timeout |
|---|---|---|---|---|---|
| `Flux1schnell` | Reel backgrounds | 1152×1920 | 4 | ~$0.00136 | 90 polls × 2s ≈ 3 min |
| `ZImageTurbo_INT8` | Post backgrounds | 1088×1360 | 8 | Higher | 120 polls × 2s ≈ 4 min |

Rate limit: 200 requests/day (deAPI free tier). Global FIFO semaphore prevents concurrent image requests.

### 11.3 Image Specifications

| Asset | Resolution | Format | Notes |
|---|---|---|---|
| Reel AI Background | 1152×1920 | PNG | 9:16, brightness -5% |
| Post AI Background | 1088×1360 | PNG | ~4:5 |
| Reel Thumbnail | 1080×1920 | PNG | Title card (bg + overlay + text) |
| Reel Image | 1080×1920 | PNG | Full content image (bg + overlay + title bars + content) |
| YouTube Thumbnail | 1080×1920 | JPEG | Clean AI image, no text, max 2MB |

### 11.4 Video Specifications

| Property | Value |
|---|---|
| Duration | 7-8 seconds (random) |
| Resolution | Same as reel image (1080×1920) |
| Codec | libx264 (H.264) |
| Container | MP4 |
| Audio | Random track from 3 music files, random start offset |
| Tool | FFmpeg |

### 11.5 Image Prompt Guidelines

```
IMPORTANT IMAGE REQUIREMENTS:
- ONLY describe real, tangible, photographable subjects
- Focus on foods, beverages, supplements, nature elements, kitchen scenes
- NO abstract concepts, NO scientific diagrams, NO microscopic views
- NO text, numbers, letters, or typography in the image
- NO people, faces, or body parts
- Think: "What would a food photographer shoot for this topic?"
- Keep descriptions under 30 words
- Style: bright, appealing, editorial food/wellness photography
```

**Post-specific quality suffix appended to all post image prompts:**
```
, 8K UHD, insanely detailed, sharp focus, professional food photography,
upper-half composition with empty space at bottom for text overlay
```

**Reel base style appended to all reel prompts:**
```
bright, colorful, vibrant still-life composition, appetizing food photography,
well-lit studio setup
```

**Fallback prompts** (by category, used when AI fails):
```python
"nutrition": "Fresh colorful fruits and vegetables arrangement on marble surface..."
"sleep":     "Cozy bedroom scene with warm lighting, lavender sprigs..."
"fitness":   "Clean gym equipment with water bottle and fresh towel..."
"wellness":  "Zen garden arrangement with smooth stones, fresh herbs..."
"default":   "Beautiful fresh healthy food arrangement on wooden table..."
```

### 11.6 Data Models Summary

#### `GenerationJob` — Core job record

| Field | Type | Description |
|---|---|---|
| job_id | str | `GEN-XXXXXX` |
| user_id | str | User identifier |
| status | str | pending / generating / completed / failed / cancelled |
| title | str | Content title |
| content_lines | JSON | Main content items |
| variant | str | light / dark / post |
| brands | JSON | List of brand IDs |
| platforms | JSON | List of platforms |
| fixed_title | bool | Don't differentiate title |
| brand_outputs | JSON | Per-brand outputs (paths, captions, etc.) |
| progress | int | 0-100 |

#### `ScheduledReel` — Scheduling record

| Field | Type | Description |
|---|---|---|
| schedule_id | str | UUID |
| reel_id | str | Reference to content |
| caption | str | Publishing caption |
| scheduled_time | datetime | When to publish |
| status | str | scheduled / publishing / published / failed / partial |
| extra_data | JSON | variant, platforms, paths, yt_title, slide_texts, carousel_paths |

#### `ContentHistory` — Anti-repetition tracking

| Field | Type | Description |
|---|---|---|
| content_type | str | "reel" or "post" |
| title | str | Generated title |
| keyword_hash | str | Sorted keywords hash |
| topic_bucket | str | One of 13 topic categories |
| brand | str | Brand ID |
| quality_score | float | 0-100 |
| was_used | bool | Whether content was published |

#### `Brand` — Brand configuration

| Field | Type | Description |
|---|---|---|
| id | str | Lowercase slug (e.g., "healthycollege") |
| display_name | str | "THE HEALTHY COLLEGE" |
| instagram_handle | str | "@thehealthycollege" |
| schedule_offset | int | 0-4 stagger offset |
| baseline_for_content | bool | True for longevitycollege |
| colors | JSON | Primary, accent, light_mode, dark_mode |
| meta_access_token | str | Encrypted Meta API token |

### 11.7 Frontend Polling

| View | Active Interval | Idle Interval |
|---|---|---|
| Jobs list | 3s (when active jobs exist) | 10s |
| Single job | 3s (when generating/pending) | 5s |

---

*Generated from codebase analysis of 40+ files across frontend and backend. Last updated: February 2026.*
