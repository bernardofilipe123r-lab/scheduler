# How Toby Learns — Reels

> This document explains exactly how Toby generates, learns from, and improves reels over time.

---

## 1. What Feeds Toby's Reel Brain

Toby pulls from your **Content DNA** configuration to generate reels. Here's every input and its role:

| Content DNA Field | What It Does | Required? |
|---|---|---|
| **Content Brief** | Injected into the system prompt as strategic direction. The AI follows this closely for topics, tone, and audience. | No, but critical for quality |
| **Reel Examples** | Few-shot learning: the AI studies your examples to match vocabulary, structure, depth, and topic focus. **More examples = dramatically better output.** | No, but the single biggest quality lever |
| **CTA Options** | Weighted random selection for the call-to-action line added to the reel image. Supports `{cta_topic}` and `@{brandhandle}` placeholders | No — returns no CTA if empty |
| **Image Composition Style** | Controls the visual aesthetic of AI-generated background images for dark-mode reels | No — fallback: "Premium studio photography" |
| **Niche Name** | Used in prompts to frame the content domain | No — falls back to generic framing |
| **Content Tone** | Words like "educational, empowering, calm authority" — guides the AI's language | No |
| **Tone Avoid** | Words to avoid: "clinical jargon, fear-mongering, salesy" | No |
| **Topic Categories** | The AI picks from these for content diversity. Also used by the strategy engine. | No — falls back to "general" |
| **Topic Keywords** | First 6 keywords used for content framing | No |
| **Hook Themes** | Emotional hooks the AI should optimize for | No |
| **Content Philosophy** | Higher-level content direction injected into the system prompt | No |
| **YouTube Title Examples** | Style guides for generating YouTube-optimized titles for cross-posting | No |

---

## 2. How Toby Generates a Reel (Step by Step)

### Step 1 — Check Buffer
Every 5 minutes, Toby checks if your content calendar has empty reel slots (default: 6 reels/day per brand). If slots are empty, it triggers generation.

### Step 2 — Pick a Strategy
Toby's **learning engine** selects 5 strategic dimensions using Thompson Sampling (multi-armed bandit):

| Dimension | Options |
|---|---|
| **Personality** | `edu_calm`, `provoc`, `story`, `data`, `urgent` — each injects a different system prompt modifier |
| **Topic bucket** | From your NicheConfig `topic_categories` |
| **Hook strategy** | `question`, `myth_buster`, `shocking_stat`, `personal_story`, `bold_claim` |
| **Title format** | `how_x_does_y`, `number_one_mistake`, `why_experts_say`, `stop_doing_this`, `hidden_truth` |
| **Visual style** | `dark_cinematic`, `light_clean`, `vibrant_bold` |

Early on (bootstrap phase), picks are mostly random. As performance data builds, Toby **exploits** winning combinations 70% and **explores** new ones 30%.

### Step 3 — Build the AI Prompt (Two Parts)

#### Part A: System Prompt (sent once per session)
```
You are a viral short-form {niche_name} content generator.

CONTENT BRIEF (follow this closely): {content_brief}

CORE RULES:
- Use familiar {niche_name} framing ({first 6 topic_keywords})
- Optimize for emotional hooks: {hook_themes}
- Keep language {content_tone}
- Avoid {tone_avoid}
- Each content line must be under 18 words

CONTENT PHILOSOPHY: {content_philosophy}
```

#### Part B: Runtime Prompt (per reel)
```
[FEW-SHOT REEL EXAMPLES — if you have them]

Generate 1 viral {niche_name} reel.

INSTRUCTIONS:
- Topic: {selected topic}
- Format: SHORT_FRAGMENT | FULL_SENTENCE | CAUSE_EFFECT | PURE_LIST
- Hook type: fear | curiosity | authority | control | hope
- Point count: {number of content lines}

TITLE PATTERN: "{archetype pattern, e.g. '{NUMBER} SIGNS OF {ISSUE}'}"

FORMAT RULES:
- Structure: {format structure}
- Max words per line: {word limit}

HOOK LANGUAGE: {hook-specific vocabulary}

AVOID RECENTLY USED:
  Titles: {last 5 titles}
  Angles: {last 3 topics}

OUTPUT: JSON with title, content_lines, image_prompt, format_style,
        topic_category, hook_type
```

### Step 4 — AI Generates Content (with Quality Loop)
**Model**: DeepSeek Chat (`deepseek-chat`) — temperature 0.85, max 1,200 tokens.

The generation has up to **3 attempts** with escalating fixes:
1. **Attempt 1**: Standard prompt with anti-repetition history
2. **Attempt 2**: Correction prompt — references specific failures (low_novelty, weak_hook, structure_error, plausibility_issue) and asks DeepSeek to fix them
3. **Attempt 3**: Adds a "style anchor" — a ghost example describing the desired structure

**Quality scoring** (5 dimensions):
- Structure correctness
- Topic familiarity
- Content novelty
- Hook strength
- Plausibility

If quality score is < 50 after all 3 attempts → falls back to placeholder content.
If quality score is 50–79 → uses best attempt but marks it `below_threshold`.

Returns:
- `title` — ALL CAPS
- `content_lines` — numbered points (each under 18 words)
- `image_prompt` — description for AI image generation
- `format_style` — which format was used
- `topic_category` — which topic bucket
- `hook_type` — which emotional hook

### Step 5 — Determine Visual Variant
Based on time slot: `slot_index = hour ÷ 4` → even = **light mode**, odd = **dark mode**. This alternates visual styles throughout the day.

### Step 6 — Generate Visual Assets

| Asset | How It's Made |
|---|---|
| **Thumbnail PNG** | Light: solid color + centered ALL-CAPS title + brand name. Dark: AI background + 55% dark overlay + white text. Auto-fit font 75–98px, max 4 lines. |
| **Reel Image PNG** | Light: solid background. Dark: AI background + 85% dark overlay. Title at top with highlight banner. Numbered content lines with bold support. CTA as last numbered line. Auto-scaling content font. |
| **Video MP4** | Static reel image PNG + random background music (7 or 8 seconds, 50/50) via FFmpeg. Music randomly starts at a different offset each time. |
| **YouTube Thumbnail** | Always AI-generated (even for light mode). Pure image, no text overlay. Saved as JPEG for YouTube's 2MB limit. |

**AI Background Generation** (for dark mode + YouTube thumbnails):
1. Content is parsed into structured data
2. DeepSeek crafts a professional image prompt
3. Prompt is sent to `deAPI` using the `Flux1schnell` model (fast, 4 steps, 1152×1920)

**Caption**: DeepSeek generates an AI first paragraph → assembled with: follow section + save section + CTA (weighted random) + disclaimer + hashtags.

**YouTube Title**: DeepSeek generates a searchable, clickable title (max ~100 chars, not ALL CAPS) using your `yt_title_examples` as style guides.

### Step 7 — Schedule
The finished reel (video MP4 + thumbnail + YT thumbnail + caption + YT title) is auto-scheduled to the next empty slot with `created_by = "toby"`.

### Step 8 — Tag for Learning
A `TobyContentTag` record links the scheduled reel to the exact strategy dimensions used, so performance can be attributed later.

---

## 3. The Learning Loop (How Toby Gets Smarter Over Time)

### Performance Scoring
After a reel is published:
- **48 hours**: Early signal score (preliminary)
- **7 days**: Final authoritative score — this drives learning

**Score formula**:
| Component | Weight | Logic |
|---|---|---|
| Raw views | 30% | Logarithmic scale, capped at 500k |
| Relative views | 35% | Your views vs. brand average × 25 (capped at 100) |
| Engagement quality | 25% | `(saves×2 + shares×3) / views × 10,000` |
| Follower context | 10% | `views / followers × 10` |

### Strategy Score Updates
After the 7-day score, each of the 5 strategy dimensions gets its running average updated:
- If `edu_calm` + `curiosity` hook + `health` topic scored 90 → those options all get boosted
- If `provoc` + `bold_claim` scored 25 → those get dampened

Running averages, variance, and the last 10 scores are tracked per dimension per brand. Next time Toby generates, it **exploits** high-scoring combinations more often.

### Phase Progression
| Phase | When | Behavior |
|---|---|---|
| **Bootstrap** | Days 0–7, < 10 scored reels | Aggressive exploration — mostly random strategy picks |
| **Learning** | Days 7–30 | 70% exploit best strategies, 30% explore new ones |
| **Optimizing** | Day 30+ | Refined exploitation with rich performance history |

### A/B Experiments
Toby can isolate a single dimension (e.g., test `edu_calm` vs. `provoc` personality). Each option runs until it reaches `min_samples` (default 5 scored reels), then the winner is declared and used going forward.

---

## 4. How Reel Examples Power Few-Shot Learning

When you add Reel Examples in Content DNA, they are **injected directly into the runtime prompt** as few-shot examples:

```
Here are examples of the exact style and quality of reel content to generate.
Study the vocabulary, depth, topic focus, and structure carefully:

EXAMPLE 1:
Title: 5 SIGNS YOUR BODY IS SILENTLY INFLAMED
Content:
- You wake up stiff even after 8 hours of sleep
- Your skin breaks out in the same spot every month
- You crave sugar by 3 PM every single day
- Your digestion slows down after meals you used to tolerate
- You feel exhausted despite "doing everything right"

EXAMPLE 2:
Title: THE TRUTH ABOUT MAGNESIUM NOBODY TELLS YOU
Content:
- Most magnesium supplements barely absorb past your gut lining
- Magnesium glycinate crosses the blood-brain barrier for better sleep
- ...

Now generate NEW, ORIGINAL content following the same style,
quality, vocabulary level, and topic focus as these examples.
Do NOT copy or closely paraphrase any example — create fresh content.
```

**Why this matters**: The AI doesn't just follow rules — it **imitates patterns**. By seeing your real examples with their:
- Specific vocabulary level and word choices
- Sentence length and rhythm
- How points are structured (fragments vs. full sentences)
- Topic depth and specificity
- Hook patterns and emotional triggers

...it learns to reproduce that exact quality and style. **More examples = better pattern matching = more on-brand content.**

### Without Examples
When no reel examples exist, the prompt still works using:
- **Pattern archetypes** from `viral_patterns.py` (e.g., `"{NUMBER} SIGNS OF {ISSUE}"`)
- **Format rules** (SHORT_FRAGMENT, FULL_SENTENCE, CAUSE_EFFECT, PURE_LIST)
- **Content Brief** for strategic direction
- **Topic categories and keywords** for subject matter
- **Hook language vocabulary** per hook type

This produces functional reels, but they won't match your brand's specific voice and content style as precisely.

---

## 5. Reel Content Formats

Toby uses 4 content formats, each with different structure rules:

| Format | Structure | Example Line |
|---|---|---|
| **SHORT_FRAGMENT** | Punchy phrases, 3–8 words | "Your gut lining repairs overnight" |
| **FULL_SENTENCE** | Complete educational sentences | "Magnesium glycinate crosses the blood-brain barrier for deeper sleep" |
| **CAUSE_EFFECT** | "X leads to Y" pattern | "Chronic dehydration forces cortisol spikes that age your cells" |
| **PURE_LIST** | Standalone items | "Wild-caught salmon" / "Fermented vegetables" |

The strategy engine picks the format, and the AI generates content matching that structure.

---

## 6. What Happens When Data Is Missing

| Missing | What Toby Does |
|---|---|
| No Reel Examples | Prompt runs without few-shot block; relies on pattern archetypes + format rules. Content works but is less on-brand |
| No Content Brief | Omitted from system prompt — AI generates generic niche content |
| No Content Tone | Empty in system prompt — AI uses its own judgment |
| No Hook Themes | Empty — AI defaults to general viral hooks |
| No CTA Options | No CTA line added to the reel image |
| No Image Style | "Premium studio photography. Clean, full-frame composition." |
| No Topic Categories | Falls back to "general" |
| No NicheConfig at all | All defaults — completely generic content |
| DeepSeek API fails | `_fallback_content()` returns "CONTENT GENERATION TEMPORARILY UNAVAILABLE" |
| Quality < 50 after 3 tries | Falls back to placeholder content |
| deAPI image fails | `_fallback_prompt()` assembles a template image prompt from content data |
| No brand baseline metrics | Relative score defaults to 50 |

---

## 7. Key Differences: Reel vs. Carousel Learning

| Aspect | Reel | Carousel |
|---|---|---|
| **Personalities** | `edu_calm`, `provoc`, `story`, `data`, `urgent` | `deep_edu`, `myth_bust`, `listicle`, `compare`, `protocol` |
| **Content structure** | Numbered points (3–8 lines, ≤18 words each) | 3 text slides (paragraphs with 2+ sentences) + 1 CTA slide |
| **Formats** | SHORT_FRAGMENT, FULL_SENTENCE, CAUSE_EFFECT, PURE_LIST | Paragraph-based educational content |
| **Citations** | None | Based on citation_style setting |
| **Visual output** | PNG image → MP4 video (7–8s with music) | Carousel PNGs (cover + slides) rendered via Konva |
| **Image model** | `Flux1schnell` (fast, 4 steps) | `ZImageTurbo_INT8` (higher quality, 8 steps) |
| **Quality loop** | 3-attempt escalation with quality scorer | Single attempt with retry if slide_texts empty |
| **AI temperature** | 0.85 | 0.95 (slightly more creative) |
| **Default slots/day** | 6 per brand | 2 per brand |
| **Examples field** | `reel_examples` (title + content_lines) | `post_examples` (title + slides + optional study ref) |

---

## 8. How Reel Generation Improves With More Data

### Week 1 (Bootstrap)
- Random strategy selection across all dimensions
- Every combination gets tried
- Quality loop catches the worst outputs
- Produces usable but unoptimized content

### Weeks 2–4 (Learning)
- 7-day scores start flowing in
- Toby identifies which personalities, hooks, and topics perform best for your audience
- 70/30 exploit/explore ratio kicks in
- Content becomes noticeably more aligned with what works

### Month 2+ (Optimizing)
- Rich performance history across all dimensions
- A/B experiments isolate winning strategies
- Content quality and engagement consistently improve
- Explore ratio may decrease further as confidence grows

### The Compounding Effect
Toby optimizes 5 dimensions independently, which means improvements compound:
- Best personality × best hook × best topic × best title format × best visual style
- Each dimension improving 10% → overall improvement far exceeds 10%
- The system continuously self-corrects as audience preferences shift
