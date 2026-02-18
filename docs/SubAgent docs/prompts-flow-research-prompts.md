# Prompts & Content Generation — Complete Research Spec

> **Generated from**: Full codebase analysis of 17 files across `app/core/`, `app/services/content/`, `app/services/media/`, `app/services/publishing/`, and `app/services/youtube/`.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Reel Content Generation (3-Layer System)](#2-reel-content-generation-3-layer-system)
3. [Post Content Generation (Batch System)](#3-post-content-generation-batch-system)
4. [Caption Generation (Instagram/Facebook)](#4-caption-generation-instagramfacebook)
5. [YouTube Title Generation](#5-youtube-title-generation)
6. [Image Prompt Generation](#6-image-prompt-generation)
7. [Content Differentiation (Multi-Brand)](#7-content-differentiation-multi-brand)
8. [Quality Scoring Function](#8-quality-scoring-function)
9. [Anti-Repetition System (Content Tracker)](#9-anti-repetition-system-content-tracker)
10. [CTA System](#10-cta-system)
11. [Brand Configuration](#11-brand-configuration)
12. [Publishing Pipeline](#12-publishing-pipeline)
13. [Complete Prompt Templates (Verbatim)](#13-complete-prompt-templates-verbatim)

---

## 1. Architecture Overview

### Technology Stack
- **AI Model**: DeepSeek (`deepseek-chat`) via `https://api.deepseek.com/v1`
- **Image Generation**: `ZImageTurbo_INT8` (posts, 1088×1360, 8 steps) / `Flux1schnell` (reels, 1152×1920, 4 steps)
- **6 Brands**: gymcollege, healthycollege, vitalitycollege, longevitycollege, holisticcollege, wellbeingcollege
- **DB**: PostgreSQL (Supabase) for settings, scheduling, content history
- **Platforms**: Instagram, Facebook, YouTube Shorts

### 3-Layer Architecture (Reels)
```
Layer 1: Pattern Brain (viral_patterns.py)
    → Static archetypes, formats, hooks, topics — selected BEFORE AI call
    
Layer 2: Generator Logic (prompt_templates.py) 
    → Cached system prompt (~200 words), build functions, quality scoring
    
Layer 3: Runtime Input (per-request)
    → Minimal ~500 token prompt with topic, format, hook, pattern, brand-specific settings
```

### Generation Flow Overview
```
User triggers auto-generate
    ↓
JobProcessor.process_job()
    ↓
┌─ REELS ─────────────────────────────────────────┐
│ 1. PatternSelector picks format/hook/archetype   │
│ 2. ContentGeneratorV2.generate_viral_content()   │
│    → build_runtime_prompt() + DeepSeek call      │
│    → QualityScorer validates (up to 3 attempts)  │
│ 3. ContentDifferentiator creates brand variants   │
│ 4. Per-brand: thumbnail → image → video → upload │
│ 5. CaptionGenerator.generate_caption() per brand │
│ 6. CaptionGenerator.generate_youtube_title()     │
└──────────────────────────────────────────────────┘

┌─ POSTS ──────────────────────────────────────────┐
│ 1. build_post_content_prompt() from templates     │
│ 2. DeepSeek batch generates N posts               │
│ 3. ContentTracker validates quality + uniqueness   │
│ 4. Per-post: carousel slides → image → upload     │
│ 5. Caption included in generation (not separate)  │
└──────────────────────────────────────────────────┘
```

---

## 2. Reel Content Generation (3-Layer System)

### Layer 1: Pattern Brain (`app/core/viral_patterns.py`)

**11 Title Archetypes** — selected by PatternSelector before AI call:

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
|--------|---------------|-------------|
| SHORT_FRAGMENT | 8 | Punchy, incomplete sentence fragments |
| FULL_SENTENCE | 20 | Complete educational sentences |
| CAUSE_EFFECT | 15 | "This happens → because of this" |
| PURE_LIST | 6 | One food/supplement per line |

**5 Psychological Hooks:**
| Hook | Triggers | Language |
|------|----------|----------|
| fear | disease anxiety, body neglect | "signs", "dangers", "never" |
| curiosity | unknown mechanisms, hidden | "why", "the real reason", "what happens" |
| authority | doctor, research studies | "studies show", "experts say" |
| control | agency, self-optimization | "how to", "do this", "stop doing" |
| hope | transformation, healing | "can help", "supports", "improves" |

**16 Topic Buckets:**
gut_health, sleep, nutrition, aging, body_signals, habits, mindset, stress, energy, hydration, inflammation, hormones, brain, detox, cardiovascular, deficiencies

**PatternSelector Anti-Repetition Logic:**
- No consecutive format repeat
- Recent topic tracking (avoids last N topics)
- Archetype rotation
- 70% natural hook selection / 30% random for variety

### Layer 2: Cached System Prompt (`app/core/prompt_templates.py`)

See [Section 13.1](#131-reel-system-prompt) for verbatim text.

### Layer 3: Runtime Prompt

Built by `build_runtime_prompt()` — see [Section 13.2](#132-reel-runtime-prompt) for verbatim template.

### Generation Parameters (Reels)
- **Temperature**: 0.7
- **Max Tokens**: 800
- **Max Attempts**: 3 (quality loop)
- **Quality Threshold**: ≥80 to publish, 65-79 regenerate, <65 reject

---

## 3. Post Content Generation (Batch System)

### Single Post Generation (`generate_post_title()` in generator.py)
Contains a ~2000-word inline prompt. See [Section 13.6](#136-single-post-generation-inline-prompt) for verbatim.

**Parameters:**
- Temperature: 1.0
- Max Tokens: 2000

### Batch Post Generation (`generate_post_titles_batch()` → `build_post_content_prompt()`)
Delegates to `prompt_templates.py`'s `build_post_content_prompt()` — a ~3000+ word prompt. See [Section 13.5](#135-batch-post-generation-prompt) for verbatim.

**Parameters:**
- Temperature: 0.95
- Max Tokens: 8000

### Post Content Structure (Required Output)
Each post must include:
- **Title**: 8-14 words, ALL CAPS, health content
- **Caption**: 4-5 paragraphs + Source (with real DOI) + Disclaimer
- **Carousel Slide Text**: 3-4 slides with educational bullet points
- **Image Prompt**: Photorealistic still-life description

### 15 Carousel Slide Examples (Few-Shot)
Stored in `CAROUSEL_SLIDE_EXAMPLES` — topics: Neuroplasticity, Curiosity, Collagen, Iron, Walking, Magnesium, Protein, Strength Training, Fiber, Sleep, Gut Health, Blood Sugar, Cortisol, Walking After Meals, Electrolytes.

---

## 4. Caption Generation (Instagram/Facebook)

**File**: `app/services/media/caption_generator.py`

### Caption Structure (Reels)
```
[AI-generated first paragraph — 3-4 sentences]

👉🏼 Follow {brand_handle} for daily, research-informed content on whole-body health...

🩵 This post is designed to be saved and revisited. Share it with friends and family...

💬 [Selected CTA — sleep_lean / follow_tips / workout_plan]

🌱 Content provided for educational purposes. Always seek guidance from a qualified healthcare provider...

#habits #interestingfacts #naturalhealing #healthtips #holistichealth
```

### First Paragraph Generation Prompt

**System Message:**
```
You are a health and wellness content writer. Write clear, informative content without hype 
or exaggeration. Always vary your opening sentences to ensure unique content - never repeat 
the same opening pattern.
```

**User Prompt** (verbatim template):
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

**Opening Style Randomization** (one selected per generation):
1. "Start with a surprising statistic or fact"
2. "Begin with a common misconception to debunk"
3. "Open with how this impacts daily life"
4. "Start by describing what happens in the body"
5. "Begin with why most people overlook this"
6. "Open with a relatable scenario or observation"

**Parameters:**
- Temperature: 1.0
- Max Tokens: 300
- Timeout: 30s

### Brand Handles
| Brand | Handle |
|-------|--------|
| gymcollege | @thegymcollege |
| healthycollege | @thehealthycollege |
| vitalitycollege | @thevitalitycollege |
| longevitycollege | @thelongevitycollege |
| holisticcollege | @theholisticcollege |
| wellbeingcollege | @thewellbeingcollege |

### Facebook Caption Shortening
`social_publisher.py` → `create_facebook_caption()`:
- Extracts first paragraph (hook) from full Instagram caption
- Truncates to max 400 characters
- Appends simple CTA: "Follow {handle} for daily health tips 🩵"

### Caption for Posts
Post captions are generated as part of the batch/single post generation prompt — NOT through `CaptionGenerator`. The AI generates the full caption (4-5 paragraphs + Source with DOI + Disclaimer) inline with the post content.

---

## 5. YouTube Title Generation

**File**: `app/services/media/caption_generator.py` → `generate_youtube_title()`

### System Message
```
You are a YouTube SEO expert. Write engaging, searchable titles.
```

### User Prompt (Verbatim)
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

**Parameters:**
- Temperature: 0.8
- Max Tokens: 100
- Timeout: 30s
- Max Length: 100 characters (truncated with "..." if over)

### Fallback YouTube Title
If AI fails: converts ALL CAPS reel title to Title Case (skipping small words like "a", "an", "the", etc.).

### YouTube Upload Metadata (from `youtube/publisher.py`)
- **Title**: max 100 chars
- **Description**: max 5000 chars + " #Shorts" appended
- **Category ID**: "22" (People & Blogs)
- **Privacy**: "public"
- **Thumbnail**: JPEG, max 2MB (auto-compressed if bigger)

---

## 6. Image Prompt Generation

### Standalone Image Prompt (`generate_image_prompt()` in generator.py)

**System Message** (`IMAGE_PROMPT_SYSTEM` from prompt_templates.py — verbatim):
```
You create concise, descriptive image prompts for AI image generation. 
Focus on tangible, photographable subjects. Never include text, numbers, 
letters, or typography in prompts.
```

**User Prompt** (inline in generator.py):
```
Create a short image prompt for an AI image generator.
Topic: "{title}"

Requirements:
- Describe a real, tangible still-life scene (foods, supplements, nature elements)
- Focus on the SUBJECT matter that relates to the topic
- Keep it under 40 words
- NO text, numbers, letters, or typography
- NO abstract concepts - only things a camera could photograph
- NO people, faces, or body parts
- Style: bright, well-lit, appetizing/inviting

Examples:
- "Fresh salmon fillet on wooden cutting board with lemon slices, mixed berries, and leafy greens, bright natural lighting"
- "Golden turmeric latte in ceramic cup surrounded by fresh turmeric root, cinnamon sticks, and honey jar"
- "Colorful Mediterranean salad bowl with olives, feta cheese, cherry tomatoes, cucumber, fresh herbs"

Respond with ONLY the image prompt, nothing else.
```

**Parameters:**
- Temperature: 0.8
- Max Tokens: 300

### Image Prompt Guidelines for Reels (`IMAGE_PROMPT_GUIDELINES`):
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

### Brand-Specific Image Palettes (`BRAND_PALETTES`):
```python
{
    "gymcollege": "cool blue tones, clean whites, modern fitness aesthetic",
    "healthycollege": "fresh greens, natural earth tones, organic garden feel",
    "vitalitycollege": "warm teal and coral, energetic tropical vibes",
    "longevitycollege": "deep blues, serene aquatic tones, timeless elegance",
    "holisticcollege": "warm coral and terracotta, holistic spa atmosphere",
    "wellbeingcollege": "warm golden yellows, honey tones, cozy comfort"
}
```

### Post-Specific Quality Suffix (`POST_QUALITY_SUFFIX`):
```
, 8K UHD, insanely detailed, sharp focus, professional food photography, 
upper-half composition with empty space at bottom for text overlay
```

### Reel Base Style (`REEL_BASE_STYLE`):
```
bright, colorful, vibrant still-life composition, appetizing food photography, 
well-lit studio setup
```

### Fallback Image Prompts (by category):
```python
{
    "nutrition": "Fresh colorful fruits and vegetables arrangement on marble surface...",
    "sleep": "Cozy bedroom scene with warm lighting, lavender sprigs...",
    "fitness": "Clean gym equipment with water bottle and fresh towel...",
    "wellness": "Zen garden arrangement with smooth stones, fresh herbs...",
    "default": "Beautiful fresh healthy food arrangement on wooden table..."
}
```

### Image Model Configurations:
```python
IMAGE_MODELS = {
    "post": {
        "model": "ZImageTurbo_INT8",
        "width": 1088,
        "height": 1360,
        "steps": 8
    },
    "reel": {
        "model": "Flux1schnell",
        "width": 1152,
        "height": 1920,
        "steps": 4
    }
}
```

---

## 7. Content Differentiation (Multi-Brand)

**File**: `app/services/content/differentiator.py`

### How It Works
- **Baseline Brand**: `longevitycollege` gets the original content unchanged
- **All other brands**: One DeepSeek call generates differentiated versions for all remaining brands simultaneously

### Differentiation Prompt (Verbatim Template)
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

### Brand Personality Hints (injected per brand):
```python
{
    "healthycollege": "Focus on natural health, herbal remedies, clean eating",
    "vitalitycollege": "Focus on energy, vitality, active lifestyle",
    "longevitycollege": "Focus on longevity, anti-aging, long-term health",
    "holisticcollege": "Focus on holistic wellness, mind-body connection",
    "wellbeingcollege": "Focus on overall wellbeing, balanced life"
}
```

**Parameters:**
- Temperature: 0.9
- Max Tokens: 4000

---

## 8. Quality Scoring Function

**File**: `app/core/quality_scorer.py`

### 5 Dimensions (100 points total):

| Dimension | Weight | Key Checks |
|-----------|--------|------------|
| Structure (25%) | 25 | ALL CAPS title, 3-10 words, point count in range, word limits, no emojis/hashtags/numbered lists |
| Familiarity (20%) | 20 | Matches viral title patterns, ≥3 health keywords, simple language |
| Novelty (20%) | 20 | SequenceMatcher comparison vs recent outputs (<0.7 similarity) |
| Hook (20%) | 20 | Contains keywords matching selected hook type (fear/curiosity/authority/control/hope) |
| Plausibility (15%) | 15 | No blacklist words (cure, guaranteed, miracle), has softeners (may, can, supports), familiar foods |

### Decision Thresholds:
- **≥80**: Accept and publish
- **65-79**: Regenerate with correction prompt
- **<65**: Reject

### Self-Correction Prompt (`build_correction_prompt()`)
When quality is 65-79, a correction prompt is sent. See [Section 13.4](#134-self-correction-prompt).

---

## 9. Anti-Repetition System (Content Tracker)

**File**: `app/services/content/tracker.py`

### 13 Post Topic Buckets:
superfoods, teas_drinks, supplements, sleep, morning_routines, skin_antiaging, gut_health, hormones, stress_mood, hydration_detox, brain_memory, heart_health, general

### Cooldown Timers:
- **Topic cooldown**: 3 days (same topic bucket)
- **Fingerprint cooldown**: 30 days (exact content hash)
- **Brand history**: 60 days (per-brand deduplication)

### History Injection in Prompts
`build_history_context()` generates a `### PREVIOUSLY GENERATED` section listing recent titles/topics that gets injected into generation prompts.

`get_brand_avoidance_prompt()` generates a rich avoidance block with brand-specific + cross-brand history.

### Post Quality Gate (`check_post_quality()`)
Structural checks before accepting a post:
- Title length validation
- No period at end of title
- No list-style or em-dash patterns
- Caption must contain a DOI
- Caption must contain a disclaimer

---

## 10. CTA System

### Reel CTAs (from `caption_generator.py`)

**3 Options** (selected per generation):

1. **sleep_lean**: "💬 If you want to take this one step further, comment LEAN. We'll send you details about Sleep Lean, a targeted nighttime formula designed to support fat loss while you sleep..."

2. **follow_tips**: "💬 If you found this helpful, make sure to follow for more daily tips on nutrition, health, and natural wellness strategies..."

3. **workout_plan**: "💬 If you want to take this one step further, comment PLAN. We'll send you our complete guide to building the best workout and nutrition plan..."

### Reel Video CTA (from `cta.py`)
- 80% of reels get NO CTA overlay
- 20% get "part2_teaser" overlay

Additional CTA system in `cta.py` with 3 types × 3 variations (33% each) for video overlays.

### CTA Stripping
`job_processor.py` → `_strip_cta_lines()`: Regex removes AI-generated CTAs that leak into content (patterns: "follow for more", "comment below", "share this", etc.)

---

## 11. Brand Configuration

### 6 Brands with Colors (`brand_colors.py`)

| Brand | Light BG | Dark BG | Accent |
|-------|----------|---------|--------|
| gymcollege | #c8e1f6 | #00435c | blue |
| healthycollege | #dcf6c8 | #004f00 | green |
| vitalitycollege | #028f7a | #028f7a | teal |
| longevitycollege | #c8eaf6 | #019dc8 | cyan |
| holisticcollege | #f9e0db | #f0836e | coral |
| wellbeingcollege | #fff4d6 | #ebbe4d | yellow |

### DB-Stored Brand Settings
Loaded from `app_settings` table via `get_content_prompts()`:
- `brand_description`: Injected into system prompts
- `reels_prompt`: Custom instructions for reel generation
- `posts_prompt`: Custom instructions for post generation

---

## 12. Publishing Pipeline

### Reel Publishing Flow
```
JobProcessor.regenerate_brand()
    ↓
1. Generate thumbnail (from content)
2. Generate reel background image (Flux1schnell)
3. Render video (FFmpeg, 7s, libx264)
4. Generate caption (CaptionGenerator.generate_caption)
5. Generate YouTube title (CaptionGenerator.generate_youtube_title)
6. Generate YouTube thumbnail
7. Upload assets to Supabase Storage
8. Schedule for publication
```

### Scheduling
- **Reels**: 6 posts/day per brand (every 4 hours, alternating light/dark mode)
- **Posts**: 2 slots/day (morning 8AM + afternoon 2PM base)
- **Brand offset**: Each brand staggered by 1 hour

### Platform Publishing
- **Instagram Reels**: Resumable upload → container → process → publish
- **Facebook Reels**: 3-step (initialize → upload → finish)
- **Instagram Carousel**: Multi-image container publishing
- **YouTube Shorts**: OAuth 2.0 resumable upload + thumbnail set (1600 quota units per upload)

---

## 13. Complete Prompt Templates (Verbatim)

### 13.1 Reel System Prompt

**Location**: `app/core/prompt_templates.py` → `SYSTEM_PROMPT`

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

### 13.2 Reel Runtime Prompt

**Location**: `app/core/prompt_templates.py` → `build_runtime_prompt()`

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
{{
  "title": "YOUR ALL CAPS TITLE HERE",
  "content_lines": ["point 1", "point 2", ...],
  "format_style": "{format_name}"
}}
```

Where `{brand_section}` injects (if DB values exist):
```
BRAND CONTEXT:
Description: {brand_description}
Additional Instructions: {reels_prompt}
```

### 13.3 Reel Runtime Prompt with History

**Location**: `app/core/prompt_templates.py` → `build_runtime_prompt_with_history()`

Same as 13.2 but prepends:
```
### PREVIOUSLY GENERATED (DO NOT REPEAT):
Recent titles: {recent_titles}
Recent topics: {recent_topics}
IMPORTANT: Generate something COMPLETELY DIFFERENT from the above.

{base_runtime_prompt}
```

### 13.4 Self-Correction Prompt

**Location**: `app/core/prompt_templates.py` → `build_correction_prompt()`

```
Your previous output scored {score}/100. Issues found:
{issues_list}

SPECIFIC FIXES NEEDED:
{fix_instructions}

Original request: {original_prompt}

Generate an IMPROVED version fixing ALL issues above.
Output the same JSON format.
```

Fix instructions per issue type:
- **low_novelty**: "Make the title and content MORE UNIQUE. Use unexpected angles, surprising comparisons, or little-known facts. Avoid generic health advice patterns."
- **weak_hook**: "Make the {hook_type} hook STRONGER. Use more powerful {hook_type} language: {hook_triggers}"
- **structure_error**: "Fix structure: title must be ALL CAPS, {point_count} points, max {max_words} words per line, no emojis/hashtags"
- **plausibility_issue**: "Remove any unverifiable claims. Use hedging language (may, can, supports). Focus on well-known foods and habits rather than obscure supplements."

### 13.5 Batch Post Generation Prompt

**Location**: `app/core/prompt_templates.py` → `build_post_content_prompt()`

This is the massive ~3000+ word prompt. Key sections:

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
  {{
    "title": "YOUR ALL CAPS TITLE HERE",
    "caption": "Full multi-paragraph caption text...\n\nSource: Author et al. (Year). Title. Journal. DOI\n\nDisclaimer: ...",
    "slide_text": "Slide 1 heading\\n- bullet 1\\n- bullet 2\\n\\nSlide 2 heading\\n- bullet 1...",
    "image_prompt": "Photorealistic still-life description..."
  }}
]
```

### 13.6 Single Post Generation Inline Prompt

**Location**: `app/services/content/generator.py` → `generate_post_title()`

Similar to 13.5 but generates a single post with an inline prompt (~2000 words). Contains same sections but without batch count. Also includes:

```
15 EXAMPLE TITLES (for inspiration, don't copy):
• "THE SURPRISING BENEFITS OF WALKING AFTER EVERY MEAL"
• "WHY MAGNESIUM IS THE MOST IMPORTANT MINERAL FOR YOUR BODY"
• "HOW FIBER TRANSFORMS YOUR GUT HEALTH AND OVERALL WELLNESS"
• "THE REAL REASON YOU FEEL EXHAUSTED EVEN AFTER SLEEPING"
• "WHAT HAPPENS TO YOUR BODY WHEN YOU STOP EATING SUGAR"
... (15 total examples)
```

### 13.7 Image Prompt System Message

**Location**: `app/core/prompt_templates.py` → `IMAGE_PROMPT_SYSTEM`

```
You create concise, descriptive image prompts for AI image generation. 
Focus on tangible, photographable subjects. Never include text, numbers, 
letters, or typography in prompts.
```

### 13.8 Style Anchor (Ghost Example)

**Location**: `app/core/prompt_templates.py` → `build_style_anchor()`

```
STYLE REFERENCE (structural guide only — do NOT copy content):
A good output in {format_name} format looks like:
- Title: 3-8 words, ALL CAPS, {hook_type}-driven
- Each line: max {max_words} words, {format_description}
- Tone: direct, confident, health-focused

Match this STRUCTURE but generate completely NEW content about {topic}.
```

---

## Key Design Decisions & Notes

1. **Reel captions use a separate AI call** — the `CaptionGenerator` makes its own DeepSeek call for the first paragraph, unlike posts where captions are generated inline with the content.

2. **YouTube titles are generated AFTER reel content** — `generate_youtube_title()` transforms the ALL CAPS reel title into a Title Case, curiosity-driven, number-free YouTube title in a separate DeepSeek call.

3. **Post captions are NOT generated by `CaptionGenerator`** — they come directly from the batch/single generation prompt as part of the JSON output.

4. **Content differentiation happens BEFORE brand processing** — all brand variants are generated in one DeepSeek call, then each brand is processed through the pipeline independently.

5. **DB-stored prompts override static prompts** — `brand_description`, `reels_prompt`, and `posts_prompt` from the `app_settings` table are injected into runtime prompts, allowing per-brand customization without code changes.

6. **Quality scoring is reel-only** — posts use the ContentTracker's `check_post_quality()` structural gate instead of the full QualityScorer.

7. **Facebook captions are shortened** — `create_facebook_caption()` in social_publisher.py truncates Instagram captions to ≤400 chars for Facebook posts.
