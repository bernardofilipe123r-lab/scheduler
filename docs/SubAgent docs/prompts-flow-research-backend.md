# Backend Pipeline Research: Reels & Carousel Posts Generation

> Full backend pipeline documentation from API endpoint to final output.
> Generated from reading 25+ backend Python files.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [API Route Structure](#2-api-route-structure)
3. [Job Creation Pipeline](#3-job-creation-pipeline)
4. [Reels vs Posts Differentiation](#4-reels-vs-posts-differentiation)
5. [Auto-Generate Content Flow](#5-auto-generate-content-flow)
6. [Carousel Post AI Generation](#6-carousel-post-ai-generation)
7. [Reel Content Generation (3-Layer Architecture)](#7-reel-content-generation-3-layer-architecture)
8. [Content Differentiation (Per-Brand)](#8-content-differentiation-per-brand)
9. [Image Generation Pipeline](#9-image-generation-pipeline)
10. [Video Generation Pipeline](#10-video-generation-pipeline)
11. [Caption Generation](#11-caption-generation)
12. [YouTube Title & Thumbnail Generation](#12-youtube-title--thumbnail-generation)
13. [Anti-Repetition System](#13-anti-repetition-system)
14. [Scheduling System](#14-scheduling-system)
15. [Publishing Pipeline](#15-publishing-pipeline)
16. [Brand Management](#16-brand-management)
17. [AI Models & External APIs](#17-ai-models--external-apis)
18. [Data Models](#18-data-models)
19. [Complete Flow Diagrams](#19-complete-flow-diagrams)

---

## 1. Architecture Overview

### Tech Stack
| Component | Technology |
|-----------|-----------|
| Backend Framework | FastAPI (Python) |
| Database | PostgreSQL + SQLAlchemy ORM |
| AI Text Generation | DeepSeek API (`deepseek-chat` model) |
| AI Image Generation | deAPI (`Flux1schnell` for reels, `ZImageTurbo_INT8` for posts) |
| Video Generation | FFmpeg (static image + music → MP4) |
| Image Composition | PIL/Pillow (text overlays, brand colors) |
| Carousel Rendering | Node.js Konva (`render-slides.cjs`) — server-side |
| Media Storage | Supabase Storage (no local persistence) |
| Auto-Publishing | APScheduler (60s interval background job) |
| Social APIs | Meta Graph API (IG/FB), YouTube Data API v3 |

### High-Level Flow
```
User Request → API → Job Creation → Background Processing → Media Generation → Supabase Upload → Scheduling → Auto-Publishing
```

### File: `app/main.py`
- Registers all routers (reels, jobs, youtube, brands, settings, analytics, logs, auth, prompts, health)
- Startup events: seed brands, repair missing carousel images, start APScheduler
- `check_and_publish()`: 60s interval, finds due posts, publishes to IG/FB/YT
- `_render_slides_node()`: Calls Node.js to render carousel slides, uploads to Supabase
- `cleanup_published_jobs()`: Deletes published jobs older than 1 day

---

## 2. API Route Structure

### File: `app/api/routes.py`
Main aggregator router with prefix `/reels`, includes sub-routers:

| Router | Prefix | File |
|--------|--------|------|
| `content_router` | `/reels` | `api/content/routes.py` |
| `reel_router` | `/reels` | `api/content/reel_routes.py` |
| `jobs_router` | `/jobs` | `api/content/jobs_routes.py` |
| `schedule_router` | `/reels` | `api/content/schedule_routes.py` |
| `publish_router` | `/reels` | `api/content/publish_routes.py` |
| `prompts_router` | `/api/prompts` | `api/content/prompts_routes.py` |
| `feedback_router` | `/reels` | `api/content/feedback_routes.py` |
| `youtube_router` | `/api/youtube` | `api/youtube/routes.py` |
| `brands_router` | `/api/brands` + `/api/v2/brands` | `api/brands/routes.py` |

---

## 3. Job Creation Pipeline

### File: `app/api/content/jobs_routes.py`

#### Endpoint: `POST /jobs/create`
```python
class JobCreateRequest:
    title: str              # Content title
    content_lines: list     # Main content items
    brands: list[str]       # e.g., ["healthycollege", "longevitycollege"]
    variant: str            # "light" | "dark" | "post"
    ai_prompt: str          # Optional AI prompt override
    cta_type: str           # CTA type (sleep_lean, follow_tips, workout_plan)
    platforms: list[str]    # ["instagram", "facebook", "youtube"]
    fixed_title: bool       # If true, don't generate new title per brand
```

#### Flow:
1. Creates `GenerationJob` in DB with status `"pending"`
2. Starts `process_job_async()` in background with semaphore (max 2 concurrent jobs)
3. Returns job ID immediately for polling

#### Other Job Endpoints:
- `GET /jobs/{id}` — Full job details
- `GET /jobs/{id}/status` — Polling endpoint (status + progress)
- `POST /jobs/{id}/regenerate/{brand}` — Regenerate single brand
- `PATCH /jobs/{id}/brand/{brand}/content` — Update per-brand title/caption/slide_texts
- `POST /jobs/{id}/brand/{brand}/regenerate-image` — Regenerate single brand's background image
- `POST /jobs/bulk-delete` — Bulk delete jobs

---

## 4. Reels vs Posts Differentiation

### File: `app/services/content/job_processor.py`

The `variant` field determines the entire pipeline:

| Aspect | REEL (`light`/`dark`) | POST (`post`) |
|--------|----------------------|---------------|
| Content Generation | `ContentDifferentiator.differentiate_all_brands()` | `generate_post_titles_batch()` (or `fixed_title`) |
| Image Generation | AI background (Flux1schnell) + PIL composition | AI background only (ZImageTurbo_INT8) |
| Video | Yes (FFmpeg 7–8s) | No |
| Caption | AI-generated (DeepSeek) | Included in batch generation |
| YouTube Title | Generated per brand | N/A |
| YouTube Thumbnail | Clean AI image (no text) | N/A |
| Carousel Slides | N/A | Rendered at publish-time via Node.js Konva |
| Output Files | thumbnail + reel_image + video + yt_thumbnail | background_path only |

### REEL Pipeline (`regenerate_brand()`):
```
1. ImageGenerator.generate_thumbnail()     → thumbnail image (title card)
2. ImageGenerator.generate_reel_image()    → main reel image (content + title)
3. VideoGenerator.generate_reel_video()    → MP4 video (image + random music)
4. CaptionGenerator.generate_caption()     → Instagram caption
5. CaptionGenerator.generate_youtube_title() → YouTube-optimized title
6. ImageGenerator.generate_youtube_thumbnail() → Clean AI image (no text overlay)
All outputs uploaded to Supabase
```

### POST Pipeline (`process_post_brand()`):
```
1. AIBackgroundGenerator.generate_post_background() → AI background image only
   Upload to Supabase → stored as background_path in brand_outputs
2. (Carousel slide rendering happens at publish-time via Node.js Konva)
```

### Key Insight:
POST variant only generates the AI background image server-side. The carousel slide composition (cover + text slides) is rendered either:
- Client-side in the frontend
- At publish-time via `_render_slides_node()` in `main.py` using Node.js Konva

---

## 5. Auto-Generate Content Flow

### File: `app/api/content/routes.py`

#### Endpoint: `POST /auto-generate-content`
Generates viral reel content (title + 8 content_lines + image_prompt).

**Request:**
```python
{
    "brands": [...],               # Optional brand names
    "content_type": "reel",        # or "post"
    "topic_hint": "sleep",         # Optional topic guidance
    "fixed_title": false,          # Use exact title without modification
    "custom_prompt": "..."         # Optional prompt override
}
```

**Flow:**
1. Calls `ContentGeneratorV2.generate_viral_content()`
2. Uses 3-layer architecture (patterns + templates + runtime input)
3. Quality scoring loop (max 3 attempts, score ≥80 to accept, ≥65 to regenerate with correction)
4. Returns: `{ title, content_lines[], image_prompt }`

#### Endpoint: `POST /generate-post-title`
Single post title + caption for carousel posts.

#### Endpoint: `POST /generate-post-titles-batch`
Generate N unique posts in one AI call ("God Automation"). Each post includes:
- `title` — 8-14 words, ALL CAPS
- `caption` — Full Instagram caption with DOIs
- `image_prompt` — For AI background generation
- `slide_texts` — Array of carousel slide content (3-6 sentences each)

#### Endpoint: `POST /generate-image-prompt`
Standalone image prompt from title using DeepSeek.

#### Endpoint: `POST /generate-background`
AI background image for canvas (returns base64).

#### Endpoint: `POST /generate-captions`
AI captions for all brands from content.

---

## 6. Carousel Post AI Generation

### File: `app/services/content/generator.py` — `ContentGeneratorV2`

#### Method: `generate_post_titles_batch(count, brands, user_id)`

This is the core carousel post generation used for "God Automation":

1. **Topic Selection**: `ContentTracker.pick_topic()` — picks topic with longest cooldown
2. **History Injection**: `ContentTracker.build_history_context()` — last 25 titles for anti-repetition
3. **Prompt Construction**: `build_post_content_prompt()` — massive prompt with:
   - Target audience: U.S. women aged 35+
   - Health topics: superfoods, hormones, sleep, gut health, blood sugar, etc.
   - Title rules: 8-14 words, ALL CAPS, bold impactful statements
   - Caption rules: scientific depth, DOI references from PubMed/Nature/JAMA
   - Slide texts: 3-6 sentences each, calm authoritative tone
   - Anti-repetition: injects recent titles list
4. **AI Call**: DeepSeek `deepseek-chat`, temperature 1.0, max_tokens 8000
5. **Parsing**: JSON response with array of post objects
6. **Recording**: Each post recorded in `content_history` table

#### Output per post:
```json
{
    "title": "THESE 5 MORNING HABITS ARE AGING YOU FASTER THAN SUGAR",
    "caption": "Full Instagram caption with DOI references...",
    "image_prompt": "A serene woman in her 40s doing morning stretches...",
    "slide_texts": [
        "Slide 1: 3-6 sentences about the topic...",
        "Slide 2: Another aspect of the topic...",
        "Slide 3: Supporting evidence..."
    ]
}
```

#### Method: `generate_post_title(brands, previous_titles, user_id)`
Single post generation with similar prompt structure but for one post at a time.

---

## 7. Reel Content Generation (3-Layer Architecture)

### File: `app/services/content/generator.py` — `ContentGeneratorV2`

#### 3-Layer System:
1. **Layer 1 — Pattern Brain** (`app/core/viral_patterns.py`): Pre-defined viral content patterns with hooks, structures, emotional triggers
2. **Layer 2 — Prompt Templates** (`app/core/prompt_templates.py`): Reusable prompt fragments for different content types
3. **Layer 3 — Runtime Input**: Brand-specific context, user overrides, topic hints

#### Method: `generate_viral_content(topic_hint, brands, custom_prompt, user_id)`

1. Pattern selection from Layer 1
2. Prompt assembly from Layer 2 + Layer 3
3. DeepSeek API call (temperature 0.85, max_tokens 2000)
4. **Quality Scoring Loop** (max 3 attempts):
   - `QualityScorer` evaluates: structure, familiarity, novelty, hook, plausibility
   - Score ≥ 80 → Accept
   - Score ≥ 65 → Regenerate with correction feedback
   - Score < 65 → Regenerate from scratch
5. Returns: `{ title, content_lines[8], image_prompt }`

---

## 8. Content Differentiation (Per-Brand)

### File: `app/services/content/differentiator.py` — `ContentDifferentiator`

Used for **REELS only** (posts get unique content from batch generation).

#### Strategy:
- **Baseline Brand** (longevitycollege) gets the ORIGINAL content
- Other brands get variations from ONE DeepSeek call

#### Method: `differentiate_all_brands(title, content_lines, brands)`

1. Separate CTA (last line) — never modified
2. Baseline brand → original content
3. All other brands → single API call to DeepSeek with rules:
   - Complete position shuffle (no item in same position as original)
   - Rewording with different synonyms/sentence structures
   - Remove 1-2 items + add 1-2 new related items
   - Brand personality hints (e.g., "vitalitycollege" → energy, metabolism, active performance)
4. Temperature 0.9 for maximum variation
5. Returns: `Dict[brand_id → content_lines]`

#### Brand Personality Hints:
| Brand | Focus |
|-------|-------|
| healthycollege | Natural health, whole foods, healthy habits |
| vitalitycollege | Energy, vitality, metabolism, active performance |
| longevitycollege | Longevity, anti-aging, cellular health, lifespan |
| holisticcollege | Holistic wellness, mind-body balance, natural healing |
| wellbeingcollege | Overall wellbeing, mental health, life quality |

---

## 9. Image Generation Pipeline

### 9.1 AI Background Generation

#### File: `app/services/media/ai_background.py` — `AIBackgroundGenerator`

##### For REELS: `generate_background(prompt)`
| Setting | Value |
|---------|-------|
| API | deAPI (api.deapi.ai) |
| Model | `Flux1schnell` |
| Resolution | 1080×1920 (rounded to 128px multiples → 1152×1920) |
| Steps | 4 |
| Cost | ~$0.00136/image |
| Post-processing | Brightness reduced 5% |
| Concurrency | Global FIFO semaphore (1 concurrent request) |
| Retry | Exponential backoff (5s→10s→20s→40s→60s) for 429s |
| Timeout | 90 poll attempts × 2s = ~3 min |

##### For POSTS: `generate_post_background(prompt)`
| Setting | Value |
|---------|-------|
| API | deAPI (api.deapi.ai) |
| Model | `ZImageTurbo_INT8` |
| Resolution | 1088×1360 (16px step rounding) |
| Steps | 8 (higher quality) |
| Composition prefix | Forces "subject in top third, bottom half clean" |
| Timeout | 120 poll attempts × 2s = ~4 min |

##### Rate Limiting:
- deAPI free tier: 200 requests/day
- Detects daily limit via response headers
- Global FIFO semaphore prevents concurrent requests

### 9.2 PIL Image Composition

#### File: `app/services/media/image_generator.py` — `ImageGenerator`

##### `generate_thumbnail()` — Title Card
| Mode | Description |
|------|-------------|
| Light | Solid `#f4f4f4` background |
| Dark | AI background + 55% dark overlay |
| Text | Auto-scaling title font (75–98px range, prefers 3 lines) |
| Bottom | Brand name text |

##### `generate_reel_image()` — Main Content Image
| Mode | Description |
|------|-------------|
| Light | Solid brand-colored background |
| Dark | AI background + 85% overlay |
| Title | Stepped background bars (brand-colored), auto-scaling font |
| Content | Numbered lines with **bold** markdown support, auto-wrapping |
| CTA | Appended at bottom |
| Font scaling | Content font scales down from 30px if needed to fit |

##### `generate_youtube_thumbnail()` — Clean Image
- AI background only, no text overlay
- Saved as JPEG (YouTube 2MB limit)

---

## 10. Video Generation Pipeline

### File: `app/services/media/video_generator.py` — `VideoGenerator`

- Creates 7–8 second video (random duration)
- Input: static reel image (from `generate_reel_image()`)
- Audio: random selection from 3 music tracks (`music_1`, `music_2`, `music_3`)
- Random start time within music file
- Uses FFmpeg for compositing
- Output: MP4 video uploaded to Supabase

---

## 11. Caption Generation

### File: `app/services/media/caption_generator.py` — `CaptionGenerator`

#### Method: `generate_caption(title, content_lines, brand_name, cta_type)`

**Structure:**
```
[AI-generated first paragraph — hook/curiosity/authority]

👉 Follow @{brand_handle} for more

💾 Save this for later

[CTA block based on cta_type]

⚠️ Disclaimer: ...

#hashtags
```

**AI First Paragraph:**
- DeepSeek API call (temperature 0.85, max_tokens 300)
- Must relate to the content but NOT repeat it
- 2-4 sentences, warm and educational tone
- Must include brand handle

**CTA Types:**
| Type | Text |
|------|------|
| `sleep_lean` | "Want to sleep better and stay lean? Comment GUIDE..." |
| `follow_tips` | "Follow for daily health tips..." |
| `workout_plan` | "Want a personalized workout? Comment PLAN..." |

**Brand Handles:**
| Brand | Handle |
|-------|--------|
| gymcollege | @thegymcollege |
| healthycollege | @thehealthycollege |
| vitalitycollege | @thevitalitycollege |
| longevitycollege | @thelongevitycollege |
| holisticcollege | @theholisticcollege |
| wellbeingcollege | @thewellbeingcollege |

### File: `app/services/media/caption_builder.py` — `CaptionBuilder`
Legacy deterministic caption builder (simpler): `TITLE → numbered lines → hashtags`

---

## 12. YouTube Title & Thumbnail Generation

### File: `app/services/media/caption_generator.py`

#### Method: `generate_youtube_title(title, content_lines)`
- DeepSeek API call
- Rules: 40–70 chars, Title Case, no numbers, curiosity-driven
- Optimized for YouTube search & suggested videos
- Never starts with numbers or uses clickbait

#### YouTube Thumbnail:
- `ImageGenerator.generate_youtube_thumbnail()` — clean AI image, no text overlay
- Saved as JPEG (YouTube 2MB limit)

---

## 13. Anti-Repetition System

### File: `app/services/content/tracker.py` — `ContentTracker`

Persistent, DB-backed system replacing fragile in-memory lists.

#### Components:

##### 1. Content Fingerprinting
- `ContentHistory.compute_keyword_hash(title)` — sorted keywords hash
- `is_duplicate()` — checks if same keyword hash used in last 30 days
- `is_duplicate_for_brand()` — brand-specific duplicate check (60 days)

##### 2. Topic Rotation
- 13 topic buckets: superfoods, teas_drinks, supplements, sleep, morning_routines, skin_antiaging, gut_health, hormones, stress_mood, hydration_detox, brain_memory, heart_health, general
- Cooldown: 3 days per topic bucket
- `pick_topic()` — picks topic with longest cooldown, avoids last 5 used

##### 3. History Injection for Prompts
- `build_history_context()` — last 25 titles injected into AI prompt
- `get_brand_avoidance_prompt()` — combines brand-specific (60 days) + cross-brand (7 days) history
- Legacy backward compatibility with `generation_jobs` table

##### 4. Quality Gate (Posts)
- `check_post_quality()` — structural checks on title and caption
- Checks: title length, ending punctuation, em-dashes, numbered titles, DOI references, disclaimer

##### 5. Performance Tracking
- `is_high_performer()` — topics with quality_score ≥ 85 can be repeated earlier

---

## 14. Scheduling System

### File: `app/services/publishing/scheduler.py` — `DatabaseSchedulerService`

#### Magic Scheduling (Reels)
Each brand posts 6 times daily (every 4 hours), alternating Light → Dark.
Brands staggered by schedule_offset (from DB):

```
Brand offset=0: 12AM(L), 4AM(D),  8AM(L), 12PM(D), 4PM(L), 8PM(D)
Brand offset=1:  1AM(L), 5AM(D),  9AM(L),  1PM(D), 5PM(L), 9PM(D)
Brand offset=2:  2AM(L), 6AM(D), 10AM(L),  2PM(D), 6PM(L), 10PM(D)
Brand offset=3:  3AM(L), 7AM(D), 11AM(L),  3PM(D), 7PM(L), 11PM(D)
Brand offset=4:  4AM(L), 8AM(D), 12PM(L),  4PM(D), 8PM(L), 12AM(D)
```

#### Magic Scheduling (Posts)
Posts get 2 slots per day — one morning, one afternoon:
- Morning base: 8 AM + brand offset
- Afternoon base: 2 PM + brand offset

```
Holistic  (offset=0): 8:00 / 14:00
Healthy   (offset=1): 9:00 / 15:00
Vitality  (offset=2): 10:00 / 16:00
Longevity (offset=3): 11:00 / 17:00
Wellbeing (offset=4): 12:00 / 18:00
```

#### Key Methods:
- `schedule_reel()` — creates `ScheduledReel` in DB
- `get_next_available_slot(brand, variant)` — finds next open reel slot
- `get_next_available_post_slot(brand)` — finds next open post slot
- `get_pending_publications()` — atomic locking (`FOR UPDATE SKIP LOCKED`) to prevent duplicate publishing
- `mark_as_published()` — handles partial success (some platforms failed)
- `reset_stuck_publishing()` — resets posts stuck in "publishing" for >10 min
- `retry_failed()` — retries failed/partial posts (only failed platforms for partial)

#### Schedule API Endpoints (`app/api/content/schedule_routes.py`):
- `POST /schedule` — manual scheduling
- `POST /schedule-auto` — magic scheduling (auto-picks slots)
- `POST /schedule-post-image` — schedule carousel post (uploads cover + slides to Supabase)
- `POST /scheduled/clean-reel-slots` / `clean-post-slots` — fix scheduling collisions

---

## 15. Publishing Pipeline

### File: `app/services/publishing/social_publisher.py` — `SocialPublisher`

Initialized with `BrandConfig` containing brand-specific Meta credentials.

### 15.1 Instagram Reel Publishing
**Method: `publish_instagram_reel(video_url, caption, thumbnail_url)`**
1. Create RESUMABLE upload session (`media_type=REELS`, `upload_type=resumable`)
2. Upload video via `file_url` header to `rupload.facebook.com`
3. Poll for processing (max 3 min, check every 5s)
4. Publish container via `media_publish` endpoint

### 15.2 Facebook Reel Publishing
**Method: `publish_facebook_reel(video_url, caption, thumbnail_url)`**
1. Get Page Access Token from System User Token
2. Initialize upload session (`POST /{page_id}/video_reels`, `upload_phase=start`)
3. Upload video via `file_url` header to `rupload.facebook.com`
4. Wait for upload completion (max 60s)
5. Publish (`upload_phase=finish`, `video_state=PUBLISHED`)
6. Caption shortened to 400 chars for Facebook

### 15.3 Instagram Image Post Publishing
**Method: `publish_instagram_image_post(image_url, caption)`**
1. Create media container (`image_url` + `caption`)
2. Wait for processing (max 60s, check every 3s)
3. Publish via `media_publish`

### 15.4 Instagram Carousel Publishing
**Method: `publish_instagram_carousel(image_urls, caption)`**
1. Create container per image (`is_carousel_item=true`) — max 10 items
2. Wait for each item to finish processing
3. Create carousel container (`media_type=CAROUSEL`, `children=id1,id2,...`)
4. Wait for carousel container processing
5. Publish via `media_publish`
- Falls back to single image if only 1 URL provided

### 15.5 Facebook Image Post Publishing
**Method: `publish_facebook_image_post(image_url, caption)`**
- `POST /{page_id}/photos` with `url` + `message`
- Uses Page Access Token
- Caption shortened to 400 chars

### 15.6 Facebook Carousel Publishing
**Method: `publish_facebook_carousel(image_urls, caption)`**
1. Upload each photo as unpublished (`POST /{page_id}/photos`, `published=false`)
2. Create feed post with `attached_media[0]`, `attached_media[1]`, etc.

### 15.7 YouTube Publishing
**In: `DatabaseSchedulerService._publish_to_youtube()`**
1. Download video + thumbnail from Supabase to temp files
2. Get YouTube refresh_token from DB for brand
3. Exchange refresh_token → fresh access_token
4. Upload via YouTube Data API v3 (`upload_youtube_short()`)
5. Set custom thumbnail
6. Clean up temp files

### Auto-Publisher (`main.py` → `check_and_publish()`)
Runs every 60 seconds:
1. `scheduler.get_pending_publications()` — atomic locking
2. For each due post:
   - Determine type from `extra_data.variant` (REEL or POST)
   - **REEL**: `publish_now(video_url, ...)` → Instagram + Facebook + YouTube
   - **POST**: 
     - If carousel_paths exist → `publish_instagram_carousel()` + `publish_facebook_carousel()`
     - Else → render slides via `_render_slides_node()` then carousel publish
     - Falls back to cover image only if rendering fails
3. Mark as published/failed/partial
4. Reset stuck "publishing" posts (>10 min)

---

## 16. Brand Management

### File: `app/services/brands/manager.py` — `BrandManager`

- Full CRUD for brands stored in PostgreSQL
- `seed_default_brands()` — seeds 5 default brands on first run
- `get_brand_with_credentials()` — includes fallback to environment variables
- Soft delete (sets `active=False`)

### Default Brands:
| ID | Display Name | Handle | Offset |
|----|-------------|--------|--------|
| healthycollege | THE HEALTHY COLLEGE | @thehealthycollege | 0* |
| longevitycollege | THE LONGEVITY COLLEGE | @thelongevitycollege | 1* |
| vitalitycollege | THE VITALITY COLLEGE | @thevitalitycollege | 2* |
| holisticcollege | THE HOLISTIC COLLEGE | @theholisticcollege | 3* |
| wellbeingcollege | THE WELLBEING COLLEGE | @thewellbeingcollege | 4* |

*Offset auto-assigned based on creation order

### File: `app/services/brands/resolver.py` — `BrandResolver`
- Thread-safe singleton with 60s TTL cache
- `resolve_brand_name()` — fuzzy matching (handles `healthy_college`, `Healthy College`, `thehealthycollege`, etc.)
- `get_brand_config()` — builds legacy `BrandConfig` from DB data
- Module-level singleton: `brand_resolver`

### Brand Colors (from `manager.py` defaults):
| Brand | Primary | Accent | Color Name |
|-------|---------|--------|------------|
| healthycollege | #004f00 | #22c55e | vibrant green |
| longevitycollege | #019dc8 | #0ea5e9 | electric blue |
| vitalitycollege | #028f7a | #14b8a6 | teal |
| holisticcollege | #f0836e | #f97316 | coral orange |
| wellbeingcollege | #ebbe4d | #eab308 | golden yellow |

### Brand API Endpoints (`app/api/brands/routes.py`):
- `GET /brands` — list all brands
- `POST /brands` — create brand
- `PUT /brands/{id}` — update brand
- `DELETE /brands/{id}` — soft delete
- `PUT /brands/{id}/credentials` — update Meta credentials
- `GET /brands/{id}/colors` — brand colors
- `POST /brands/{id}/theme` — update theme + logo upload
- `GET /brands/connections` — platform connection status (IG/FB/YT)
- `GET /brands/prompts` — global content prompt settings
- `PUT /brands/prompts` — update prompts (reels_prompt, posts_prompt, brand_description)

### Global Prompt Settings (stored in `app_settings` table):
| Key | Purpose |
|-----|---------|
| `brand_description` | Health & wellness content brand description for AI context |
| `reels_prompt` | Base prompt for reel content generation |
| `posts_prompt` | Base prompt for carousel post generation |

---

## 17. AI Models & External APIs

### DeepSeek API (`deepseek-chat`)
| Use Case | Temperature | Max Tokens | File |
|----------|-------------|------------|------|
| Viral reel content | 0.85 | 2000 | `generator.py` |
| Post titles (single) | 1.0 | 4000 | `generator.py` |
| Post titles (batch) | 1.0 | 8000 | `generator.py` |
| Image prompts | 0.7 | 300 | `generator.py` |
| Captions (first paragraph) | 0.85 | 300 | `caption_generator.py` |
| YouTube titles | 0.7 | 100 | `caption_generator.py` |
| Content differentiation | 0.9 | 4000 | `differentiator.py` |

### deAPI Image Generation
| Model | Use Case | Resolution | Steps | Cost |
|-------|----------|-----------|-------|------|
| Flux1schnell | Reel backgrounds | 1152×1920 | 4 | ~$0.00136 |
| ZImageTurbo_INT8 | Post backgrounds | 1088×1360 | 8 | Higher |

### Meta Graph API (v19.0)
| Endpoint | Use Case |
|----------|----------|
| `/{ig_account}/media` | Create media containers |
| `/{ig_account}/media_publish` | Publish containers |
| `/{page_id}/video_reels` | Facebook Reel init/publish |
| `/{page_id}/photos` | Facebook image posts |
| `/{page_id}/feed` | Facebook carousel posts |
| `rupload.facebook.com` | Video upload (IG + FB) |

### YouTube Data API v3
| Feature | Details |
|---------|---------|
| Auth | OAuth2 (authorization_code → refresh_token stored in DB) |
| Upload | Resumable upload via `youtube.videos().insert()` |
| Quota | 10,000 units/day; uploads cost ~1,600 units each |
| Thumbnails | `youtube.thumbnails().set()` |

---

## 18. Data Models

### `GenerationJob` (`app/models/jobs.py`)
| Field | Type | Description |
|-------|------|-------------|
| job_id | str | `GEN-XXXXXX` |
| user_id | str | User identifier |
| status | str | pending/generating/completed/failed/cancelled |
| title | str | Content title |
| content_lines | JSON | Main content items |
| variant | str | light/dark/post |
| brands | JSON | List of brand IDs |
| platforms | JSON | List of platforms |
| fixed_title | bool | Don't differentiate title |
| brand_outputs | JSON | Per-brand outputs (see below) |
| progress | int | 0-100 |
| total_brands / completed_brands | int | Progress tracking |

#### `brand_outputs` structure (per brand):
```json
{
    "healthycollege": {
        "status": "completed",
        "reel_id": "abc123",
        "title": "BRAND-SPECIFIC TITLE",
        "content_lines": [...],
        "thumbnail_path": "https://supabase.../thumb.png",
        "reel_image_path": "https://supabase.../reel.png",
        "video_path": "https://supabase.../video.mp4",
        "yt_thumbnail_path": "https://supabase.../yt_thumb.jpg",
        "caption": "Full Instagram caption...",
        "yt_title": "YouTube Optimized Title",
        "background_path": "https://supabase.../bg.png"  // POST only
    }
}
```

### `Brand` (`app/models/brands.py`)
| Field | Type | Description |
|-------|------|-------------|
| id | str | Lowercase slug (e.g., "healthycollege") |
| user_id | str | Owner |
| display_name | str | "THE HEALTHY COLLEGE" |
| short_name | str | "HCO" |
| instagram_handle | str | "@thehealthycollege" |
| schedule_offset | int | Stagger offset (0-4) |
| posts_per_day | int | Default 6 |
| baseline_for_content | bool | True for longevitycollege |
| colors | JSON | Primary, accent, light_mode, dark_mode |
| meta_access_token | str | Encrypted Meta API token |
| instagram_business_account_id | str | IG Business Account |
| facebook_page_id | str | FB Page ID |
| logo_path | str | Supabase URL |

### `ScheduledReel` (`app/models/scheduling.py`)
| Field | Type | Description |
|-------|------|-------------|
| schedule_id | str | UUID |
| user_id | str | Owner |
| reel_id | str | Reference to content |
| caption | str | Publishing caption |
| scheduled_time | datetime | When to publish |
| status | str | scheduled/publishing/published/failed/partial |
| published_at | datetime | When published |
| publish_error | str | Error message |
| extra_data | JSON | Metadata (platforms, paths, brand, variant, yt_title, slide_texts, carousel_paths, job_id) |

### `ContentHistory` (`app/models/` — referenced in tracker.py)
| Field | Type | Description |
|-------|------|-------------|
| id | int | PK |
| content_type | str | "reel" or "post" |
| title | str | Generated title |
| keyword_hash | str | Sorted keywords hash |
| keywords | JSON | Extracted keywords |
| topic_bucket | str | One of 13 topic categories |
| brand | str | Brand ID |
| quality_score | float | 0-100 |
| was_used | bool | Whether content was published |
| image_prompt | str | AI image prompt |
| caption | str | Generated caption |
| user_id | str | Owner |
| created_at | datetime | Timestamp |

### `YouTubeChannel` (`app/models/youtube.py`)
| Field | Type | Description |
|-------|------|-------------|
| brand | str | Brand ID |
| channel_id | str | YouTube channel ID |
| channel_name | str | Channel display name |
| refresh_token | str | OAuth refresh token (long-lived) |
| status | str | connected/revoked/error |
| last_upload_at | datetime | Last successful upload |
| last_error | str | Last error message |

---

## 19. Complete Flow Diagrams

### Reel Generation Flow (variant = "dark")
```
POST /jobs/create { variant: "dark", brands: [...], title, content_lines }
    │
    ├─ Create GenerationJob (status: "pending")
    ├─ Return job_id immediately
    │
    └─ Background: process_job_async()
        │
        ├─ ContentDifferentiator.differentiate_all_brands()
        │   └─ DeepSeek: Generate unique content per brand (1 API call)
        │
        ├─ For each brand (threaded, max 600s timeout):
        │   └─ regenerate_brand()
        │       │
        │       ├─ 1. AIBackgroundGenerator.generate_background()
        │       │      └─ deAPI Flux1schnell → 1152×1920 AI image
        │       │
        │       ├─ 2. ImageGenerator.generate_thumbnail()
        │       │      └─ PIL: AI bg + 55% overlay + title text
        │       │
        │       ├─ 3. ImageGenerator.generate_reel_image()
        │       │      └─ PIL: AI bg + 85% overlay + title bars + content lines
        │       │
        │       ├─ 4. VideoGenerator.generate_reel_video()
        │       │      └─ FFmpeg: reel_image + random music → 7-8s MP4
        │       │
        │       ├─ 5. CaptionGenerator.generate_caption()
        │       │      └─ DeepSeek: AI first paragraph + template
        │       │
        │       ├─ 6. CaptionGenerator.generate_youtube_title()
        │       │      └─ DeepSeek: 40-70 char curiosity title
        │       │
        │       ├─ 7. ImageGenerator.generate_youtube_thumbnail()
        │       │      └─ Clean AI image as JPEG
        │       │
        │       └─ Upload all to Supabase → store paths in brand_outputs
        │
        └─ Update job status: "completed"
```

### Post Generation Flow (variant = "post")
```
POST /jobs/create { variant: "post", brands: [...] }
    │
    ├─ Create GenerationJob (status: "pending")
    ├─ Return job_id immediately
    │
    └─ Background: process_job_async()
        │
        ├─ generate_post_titles_batch(count=N)
        │   └─ DeepSeek: N unique posts (title + caption + image_prompt + slide_texts)
        │
        ├─ For each brand (threaded):
        │   └─ process_post_brand()
        │       │
        │       ├─ 1. AIBackgroundGenerator.generate_post_background()
        │       │      └─ deAPI ZImageTurbo_INT8 → 1088×1360 AI image
        │       │
        │       └─ Upload to Supabase → store as background_path
        │
        └─ Update job status: "completed"
        
        ... Later at publish time ...
        
        check_and_publish() (60s interval)
            │
            ├─ If carousel_paths exist → publish directly
            ├─ Else → _render_slides_node()
            │          └─ Node.js Konva renders cover + slides
            │          └─ Upload rendered images to Supabase
            │
            └─ publish_instagram_carousel() + publish_facebook_carousel()
```

### Publishing Flow
```
APScheduler (every 60s) → check_and_publish()
    │
    ├─ scheduler.get_pending_publications()
    │   └─ SELECT ... WHERE status='scheduled' AND scheduled_time <= NOW()
    │       FOR UPDATE SKIP LOCKED  (atomic locking)
    │   └─ Mark as "publishing" immediately
    │
    ├─ For each due post:
    │   │
    │   ├─ Determine type from extra_data.variant
    │   │
    │   ├─ IF REEL:
    │   │   ├─ publisher.publish_instagram_reel(video_url, caption)
    │   │   ├─ publisher.publish_facebook_reel(video_url, caption)
    │   │   └─ publisher.publish_to_youtube(video_url, yt_title)
    │   │
    │   ├─ IF POST:
    │   │   ├─ Render carousel slides (Node.js Konva if not pre-rendered)
    │   │   ├─ publisher.publish_instagram_carousel(image_urls, caption)
    │   │   └─ publisher.publish_facebook_carousel(image_urls, caption)
    │   │
    │   └─ Mark as published / failed / partial
    │
    └─ Reset stuck "publishing" posts (>10 min)
```
