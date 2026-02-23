# How Toby Learns — Carousel Posts

> This document explains exactly how Toby generates, learns from, and improves carousel posts over time.

---

## 1. What Feeds Toby's Carousel Brain

Toby pulls from your **Content DNA** configuration to generate carousels. Here's every input and its role:

| Content DNA Field | What It Does | Required? |
|---|---|---|
| **Content Brief** | Injected verbatim into every prompt. This is your strategic direction — topics, tone, audience, philosophy. The AI follows this closely. | No, but critical for quality |
| **Post Examples** | Few-shot learning: the AI studies your examples to match style, depth, slide structure, vocabulary, and citation patterns. **10+ examples dramatically improve output.** | No, but the single biggest quality lever |
| **Citation Style** | Controls how the AI references sources: academic (study name, institution, year), financial data, case study, expert quote, or none | No — defaults to "none" |
| **Carousel CTA Options** | Weighted random selection for the final slide. Templates support `{cta_topic}` and `@{brandhandle}` placeholders | No — 3 defaults built in |
| **Image Composition Style** | Controls the visual aesthetic of AI-generated background images | No — fallback: "Premium studio photography" |
| **Niche Name** | Used in prompts to frame the content domain (e.g., "Health & Wellness") | No — falls back to generic "content" |
| **Topic Categories** | The AI picks from these for content diversity | No — falls back to "general" |
| **Topic Keywords** | First 6 keywords used for content framing in prompts | No |

---

## 2. How Toby Generates a Carousel (Step by Step)

### Step 1 — Check Buffer
Every 5 minutes, Toby checks if your content calendar has empty post slots (default: 2 posts/day per brand). If slots are empty, it triggers generation.

### Step 2 — Pick a Strategy
Toby's **learning engine** selects 5 strategic dimensions using Thompson Sampling (a multi-armed bandit algorithm):

| Dimension | Options |
|---|---|
| **Personality** | `deep_edu`, `myth_bust`, `listicle`, `compare`, `protocol` |
| **Topic bucket** | From your NicheConfig `topic_categories` |
| **Hook strategy** | `question`, `myth_buster`, `shocking_stat`, `personal_story`, `bold_claim` |
| **Title format** | `how_x_does_y`, `number_one_mistake`, `why_experts_say`, `stop_doing_this`, `hidden_truth` |
| **Visual style** | `dark_cinematic`, `light_clean`, `vibrant_bold` |

Early on (bootstrap phase), selection is mostly random. As Toby learns what performs well, it **exploits** winning combinations 70% of the time and **explores** new ones 30%.

### Step 3 — Build the AI Prompt
A rich prompt is assembled from your Content DNA:

1. **System context**: niche, tone, audience, content brief, philosophy
2. **Few-shot examples block** (if you have post examples): the AI sees your real carousel examples formatted as title + slides + optional study reference
3. **Citation instructions**: how to reference sources based on your citation style
4. **Slide structure rules**: slide 1 instruction (varies by citation style), slides 2-3 educational content, slide 4 CTA
5. **Title format guidance**: uses your own post example titles first, falls back to citation-style-specific generic examples
6. **Topic hint**: from the strategy engine
7. **Anti-repetition context**: recent titles and topics to avoid

### Step 4 — AI Generates Content (with Quality Loop)
**Model**: DeepSeek Chat (`deepseek-chat`) — temperature 0.85, max 8,000 tokens for batch generation.

The generation has up to **3 attempts** with escalating fixes (same quality loop as reels):
1. **Attempt 1**: Standard prompt with anti-repetition history
2. **Attempt 2**: Correction prompt — references weak titles from attempt 1 and asks for stronger hooks, better structure, more novelty, more plausible claims
3. **Attempt 3**: Repeats with fresh correction guidance

Each attempt scores the generated content across 5 quality dimensions:
- Structure correctness
- Topic familiarity
- Content novelty
- Hook strength
- Plausibility

If average quality score is ≥ 80 → publish immediately.
If all 3 attempts score below 80 → uses the best attempt.

Returns for each post:
- `title` — ALL CAPS, 8–14 words
- `slide_texts` — 3 text slides (educational paragraphs with 2+ sentences each)
- `caption` — 4–5 paragraphs with optional citation + disclaimer
- `image_prompt` — cinematic image description for the background
- `quality_breakdown` — per-dimension scores for transparency

### Step 5 — Generate Visual Assets
1. **AI Background Image**: DeepSeek crafts a professional image prompt → sent to `deAPI` using the `ZImageTurbo_INT8` model (8 steps) → returns a background PNG
2. Background is uploaded to Supabase Storage

### Step 6 — Render Carousel Slides
A **Node.js Konva script** (`scripts/render-slides.cjs`) composites the final carousel:
- Cover slide (title + background)
- 3 text slides (content over background)
- CTA slide (weighted random from your carousel CTA options)

All slides are uploaded to Supabase Storage as PNGs.

### Step 7 — Schedule
The finished carousel is auto-scheduled to the next empty slot in your content calendar with `created_by = "toby"`.

### Step 8 — Tag for Learning
A `TobyContentTag` record links the scheduled post to the exact strategy dimensions used (personality, topic, hook, title_format, visual_style), so performance can be attributed later.

---

## 3. The Learning Loop (How Toby Gets Smarter Over Time)

### Performance Scoring
After a carousel is published:
- **48 hours**: Early signal score (preliminary)
- **7 days**: Final authoritative score — this is what drives learning

**Score formula**:
| Component | Weight | Logic |
|---|---|---|
| Raw views | 20% | Logarithmic scale, capped at 500k |
| Relative views | 30% | Your views vs. brand average × 25 (capped at 100) |
| Engagement quality | 40% | `(saves×2 + shares×3) / views × 10,000` — **primary signal** |
| Follower context | 10% | `views / followers × 10` |

Engagement quality (saves + shares) is the dominant signal at 40%, ensuring Toby optimizes for save-worthy, valuable content rather than just high-view clickbait.

### Strategy Score Updates
After the 7-day score, each of the 5 strategy dimensions gets its running average updated:
- If `deep_edu` + `shocking_stat` + `health` topic scored 85/100 → those options all get boosted
- If `listicle` + `bold_claim` scored 30/100 → those get dampened

Next time Toby generates, it **exploits** high-scoring combinations more often.

### Phase Progression
| Phase | When | Behavior |
|---|---|---|
| **Bootstrap** | Days 0–7, < 10 scored posts | Aggressive exploration — mostly random strategy picks |
| **Learning** | Days 7–30 | 70% exploit best strategies, 30% explore new ones |
| **Optimizing** | Day 30+ | Refined exploitation with rich performance history |

### A/B Experiments
Toby can isolate a single dimension (e.g., test `deep_edu` vs. `myth_bust` personality). Each option runs until it reaches `min_samples` (default 5), then the winner is declared and used going forward.

---

## 4. How Post Examples Power Few-Shot Learning

When you add Post Examples in Content DNA, they are **injected directly into the AI prompt** as few-shot examples:

```
Here are examples of the exact style of carousel posts to generate.
Match the depth, tone, and educational quality of these examples:

EXAMPLE POST 1:
Title: YOUR MORNING COFFEE MIGHT BE BLOCKING KEY NUTRIENTS FROM YOUR BREAKFAST
Slide 1: Coffee contains tannins and chlorogenic acid...
Slide 2: A 2019 study from the European Journal of Clinical Nutrition...
Slide 3: The simple fix is a 30-minute buffer...
Study: European Journal of Clinical Nutrition, 2019

EXAMPLE POST 2:
...

Now generate NEW, ORIGINAL posts following the same style,
quality, and topic depth as these examples.
Each post must cover a DIFFERENT topic.
```

**Why this matters**: The AI doesn't just follow rules — it *imitates patterns*. By seeing your real examples with their:
- Specific vocabulary level
- Sentence structure and depth
- How studies are referenced
- Tone and authority style
- Slide-by-slide information flow

...it learns to reproduce that exact quality and style. **More examples = better pattern matching = more on-brand content.**

### Without Examples
When no post examples exist, the prompt still works using:
- Your **Content Brief** for strategic direction
- **Citation-style-specific title examples** (generic, not your brand's voice)
- **Format rules** (slide counts, word limits, ALL CAPS titles)
- **Topic categories and keywords** for subject matter

This produces functional carousels, but they won't match your brand's specific voice and style as precisely.

---

## 5. What Happens When Data Is Missing

| Missing | What Toby Does |
|---|---|
| No Post Examples | Prompt runs without few-shot block; uses generic citation-style title examples. Content is functional but less on-brand |
| No Content Brief | Omitted from prompt — AI generates generic content for the niche |
| No Citation Style | Treated as "none" — no source references required |
| No Carousel CTA Options | Falls back to 3 built-in defaults: "Follow @{brandhandle} for more {cta_topic}" variants |
| No Image Style | "Premium studio photography. Clean, full-frame composition." |
| No Topic Categories | Falls back to "general" |
| No NicheConfig at all | All defaults — completely generic content |
| AI generation fails | `_fallback_post_title()` returns "Content generation temporarily unavailable" |
| All 3 attempts score below 80 | Uses the best attempt from all 3 tries |

---

## 6. The A Few Days Ago Scenario: Carousels Without Post Ideas

**Toby doesn't need pre-existing "post ideas" to generate carousels.** The old system had 59 hardcoded viral ideas (`VIRAL_IDEAS`), but those were removed. The current system is **entirely generative**:

1. **Strategy engine** picks topic + personality + hook + format randomly (or from learned preferences)
2. **DeepSeek AI** generates original title, slides, caption, and image prompt from scratch
3. **Content Brief + Citation Style + Topic Keywords** guide the AI even without examples
4. **The AI itself is the idea source** — it creates new content based on your niche configuration

So even with zero post examples, Toby:
- Uses your Content Brief to understand what to write about
- Uses citation style to know how to reference sources
- Uses topic categories/keywords for subject diversity
- Generates original educational carousel content via DeepSeek
- Creates AI background images via deAPI
- Renders full carousel slides via Node.js/Konva
- Schedules everything automatically

**Post examples make it better, but they're not required to function.**
