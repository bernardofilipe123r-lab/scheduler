# Hardcoded Niche/Topic/Audience Audit

> **Date:** 2025-02-18  
> **Scope:** Complete surgical audit of all hardcoded niche/topic/audience/brand/CTA content in the backend  
> **Goal:** Design a system where these become dynamic variables populated from user-configurable settings

---

## Executive Summary

| Group | Description | Total Hardcoded Instances | Files Affected |
|-------|-------------|--------------------------|----------------|
| **A** | Niche/Topic | **~145+** | 8 files |
| **B** | Target Audience | **12** | 3 files |
| **C** | Content Tone/Style | **14** | 4 files |
| **D** | Brand Personalities | **18** | 3 files |
| **E** | Examples | **74+** (59 viral ideas + 15 carousel examples) | 2 files |
| **F** | Image/Visual Style | **22** | 2 files |
| **G** | CTA/Captions | **19** | 4 files |

**Total hardcoded references: ~300+**

---

## FILE-BY-FILE AUDIT

---

### FILE 1: `app/core/prompt_templates.py` (636 lines)

| Line(s) | Exact Hardcoded Text | Represents | Group | Proposed Variable |
|---------|---------------------|------------|-------|-------------------|
| 62 | `"viral short-form health content generator"` | Niche identity | A | `system_role_description` |
| 65 | `"Instagram/TikTok reel ideas that match proven viral health patterns"` | Platform + niche | A | `content_platforms` + `niche_description` |
| 68 | `"health framing (habits, symptoms, food, sleep, aging, body signals)"` | Topic framing | A | `topic_framing_keywords` |
| 69 | `"emotional hooks: curiosity, fear, authority, hope, or control"` | Hook types | C | `emotional_hooks` |
| 70 | `"simple, confident, and non-clinical"` | Tone | C | `content_tone` |
| 72 | `"medical diagnosis, treatment instructions, or guarantees"` | Content restrictions | C | `content_restrictions` |
| 73 | `"academic, poetic, or overly creative language"` | Style restrictions | C | `style_restrictions` |
| 194-210 | `FALLBACK_PROMPTS` dict (7 entries: vitamin, sleep, exercise, food, meditation, water, generic) | Niche-specific fallbacks | A+F | `fallback_image_categories` |
| 213-228 | `IMAGE_PROMPT_SYSTEM` — `"wellness and health imagery for Instagram"` + 2 example title→prompt pairs | Visual niche + examples | F+E | `image_prompt_system_text` |
| 229-234 | `IMAGE_PROMPT_GUIDELINES` — `"Blue/teal color palette"`, `"Scientific/premium wellness aesthetic"` | Visual style | F | `image_style_guidelines` |
| 237-239 | `POST_QUALITY_SUFFIX` — `"premium lifestyle aesthetic"` | Visual quality descriptor | F | `post_image_quality_style` |
| 241-249 | `REEL_BASE_STYLE` — `"BRIGHT, COLORFUL, VIBRANT still-life composition..."` | Reel visual style | F | `reel_base_image_style` |
| 253-268 | `IMAGE_PROMPT_SYSTEM` — full prompt with `"wellness and health imagery"`, examples with ginger/vitamin D | Niche visual direction | F+E | `image_prompt_system` |
| 270-287 | `BRAND_PALETTES` — 5 brand entries (healthycollege, longevitycollege, vitalitycollege, wellbeingcollege, holisticcollege) with hex colors and color descriptions | Brand visual identity | D+F | `brand_palettes` (DB-backed per brand) |
| 289-308 | `IMAGE_MODELS` — model names, dimensions, steps | Technical config | — | Already config (keep as-is) |
| 312-510 | `CAROUSEL_SLIDE_EXAMPLES` — 15 full examples covering: Neuroplasticity, Curiosity, Collagen, Iron, Walking, Magnesium, Protein, Strength Training, Fiber, Sleep, Gut Health, Blood Sugar, Cortisol, Walking, Electrolytes | Health niche examples | E | `carousel_examples` (DB or JSON) |
| 519 | `"health content creator for InLight, a wellness brand targeting U.S. women aged 35 and older"` | Brand name + audience | A+B | `brand_identity` + `target_audience` |
| 523 | `"Women 35+ interested in healthy aging, energy, hormones, and longevity"` | Audience detail | B | `audience_description` |
| 530-547 | Topic category list (18 items: superfoods, teas, supplements, sleep, morning routines, skin, gut, hormones, stress, hydration, brain, heart, strength, blood sugar, cortisol, walking, electrolytes, fiber) | Available topics | A | `topic_categories` |
| 549-561 | Title format rules — `"bold, impactful health statement"` | Title style | C | `title_style_rules` |
| 563-583 | Title style examples — 12 hardcoded health titles | Examples | E | `title_style_examples` |
| 585-590 | What to avoid list — `"Reel-style titles"`, `"Intense exercise"` | Niche restrictions | A | `content_avoidance_rules` |
| 607-612 | Carousel slide rules — `"calm, authoritative, educational tone"` | Tone | C | `slide_tone` |
| 616 | `"Follow @{{brandhandle}} to learn more about your {{topic_word}}"` — with health/brain/body/longevity/energy/skin/sleep/nutrition | CTA template | G | `follow_cta_template` |
| 622-627 | Image prompt requirements — `"calming wellness aesthetic"`, `"Neutral tones, gentle morning sunlight"` | Visual style | F | `image_style_description` |
| 632 | `"InLight"` brand name | Brand name | D | `brand_name` |

---

### FILE 2: `app/services/content/generator.py` (706 lines)

| Line(s) | Exact Hardcoded Text | Represents | Group | Proposed Variable |
|---------|---------------------|------------|-------|-------------------|
| 107-121 | `CTA_OPTIONS` — `"Follow for Part 2!"` (5 variations) | CTA options | G | `reel_cta_options` |
| 344-378 | `_fallback_content()` — 3 hardcoded health posts (water signs, sleep-destroying foods, tongue health) | Niche fallbacks | A+E | `reel_fallback_content` |
| 408-415 | `topic_descriptions` dict — 13 entries mapping topic buckets to health descriptions (e.g., `"Foods, superfoods, and healing ingredients"`) | Niche topic descriptions | A | `topic_descriptions` (shared with tracker) |
| 424 | `"health content creator for InLight — a wellness brand targeting U.S. women aged 35 and older"` | Brand + audience | A+B | `brand_identity` + `target_audience` |
| 430 | `"Women 35+ interested in healthy aging, energy, hormones, and longevity."` | Audience | B | `audience_description` |
| 433-435 | `"TITLE MUST BE 8-14 WORDS LONG (approximately 55-90 characters)"` | Format rule | — | Keep as system rule |
| 441-460 | Topic list — same 12 health topics | Topics | A | `topic_categories` |
| 462-478 | 15 example post titles (all health/women 35+) | Examples | E | `example_post_titles` |
| 480-487 | `"What to avoid"` section — `"Content that does not resonate with women 35+"`, `"Intense exercise or gym/strength training topics"` | Audience + niche restrictions | A+B | `content_avoidance_rules` |
| 497-503 | Image prompt requirements — `"calming wellness aesthetic"` | Visual style | F | `image_style_description` |
| 534-618 | `_fallback_post_title()` — 4 hardcoded women's health posts (Vitamin D, chamomile, collagen, turmeric) with full captions, sources, and disclaimers | Niche fallbacks | A+E+G | `post_fallback_content` |
| 677-706 | `_fallback_image_prompt()` — 7 keyword-matched fallback prompts (vitamin, sleep, exercise, food, meditation, water, generic) | Niche image fallbacks | F | `fallback_image_prompts` |

---

### FILE 3: `app/services/content/differentiator.py` (217 lines)

| Line(s) | Exact Hardcoded Text | Represents | Group | Proposed Variable |
|---------|---------------------|------------|-------|-------------------|
| 39 | `BASELINE_BRAND = "longevitycollege"` | Baseline brand | D | `baseline_brand` (DB setting) |
| 107-113 | `brand_hints` dict with 5 entries: | Brand personalities | D | `brand_personalities` (DB per brand) |
| 108 | `"healthycollege": "natural health, whole foods, healthy habits, wellness lifestyle"` | Brand personality | D | — |
| 109 | `"vitalitycollege": "energy, vitality, metabolism, active performance, vigor"` | Brand personality | D | — |
| 110 | `"longevitycollege": "longevity, anti-aging, cellular health, prevention, lifespan"` | Brand personality | D | — |
| 111 | `"holisticcollege": "holistic wellness, mind-body balance, natural healing, integrative health"` | Brand personality | D | — |
| 112 | `"wellbeingcollege": "wellbeingcollege": "overall wellbeing, mental health, life quality, balanced living"` | Brand personality | D | — |
| 148 | `"health/wellness content"` in system prompt | Niche | A | `niche_description` |
| 154 | `"health and wellness"` fallback hint | Niche | A | `default_brand_hint` |

---

### FILE 4: `app/services/media/caption_generator.py` (271 lines)

| Line(s) | Exact Hardcoded Text | Represents | Group | Proposed Variable |
|---------|---------------------|------------|-------|-------------------|
| 13-19 | `BRAND_HANDLES` — 6 entries (`@thegymcollege`, `@thehealthycollege`, etc.) | Brand handles | D | `brand_handles` (DB per brand) |
| 22-29 | `CTA_OPTIONS["sleep_lean"]` — full paragraph about "Sleep Lean" supplement | CTA product pitch | G | `cta_options` (DB-backed) |
| 31-32 | `CTA_OPTIONS["follow_tips"]` — `"nutrition, health, and natural wellness strategies"` | CTA text | G | `cta_options` |
| 34-35 | `CTA_OPTIONS["workout_plan"]` — workout and nutrition plan pitch | CTA text | G | `cta_options` |
| 37 | `HASHTAGS = "#habits #interestingfacts #naturalhealing #healthtips #holistichealth"` | Hashtags | G | `default_hashtags` |
| 130-131 | Follow section: `"research-informed content on whole-body health, natural approaches to healing, digestive health support, and long-term wellness strategies centered on nutrition and prevention"` | Niche description in CTA | A+G | `follow_section_text` |
| 133-134 | Save section: `"improving their health, energy levels, metabolic balance, and long-term vitality through natural methods"` | Niche description in CTA | A+G | `save_section_text` |
| 136 | Disclaimer: `"Content provided for educational purposes. Always seek guidance from a qualified healthcare provider before adjusting your diet."` | Legal text | G | `caption_disclaimer` |
| 83-84 | `"Instagram health/wellness post"` in AI prompt | Niche | A | `content_niche` |
| 90 | `"warm, educational tone (not salesy)"` | Tone | C | `caption_tone` |
| 76 | `"health and wellness content writer"` in system prompt | Niche role | A | `caption_writer_role` |

---

### FILE 5: `app/core/viral_ideas.py` (815 lines)

| Line(s) | Exact Hardcoded Text | Represents | Group | Proposed Variable |
|---------|---------------------|------------|-------|-------------------|
| 1-815 | **59 complete viral ideas** — ALL health/wellness themed | Content examples database | E | `viral_ideas_database` (DB or JSON) |
| All | Tags across all entries: `body signals`, `warning signs`, `health awareness`, `habits`, `nutrition`, `food benefits`, `mindset`, `psychology`, `aging`, `longevity`, `men's health`, `women's health`, `food safety`, `remedies`, `symptoms`, `deficiencies`, `hydration`, etc. | Topic tags | A | `content_tags` |
| Various | `"women"` referenced in items 11 (women aging), 7 (men aging) | Audience segments | B | — |
| Various | Health-specific content in all 59 entries | Niche content | A+E | — |

**Note:** This entire file IS the niche. Every idea is health/wellness. Making this dynamic would mean replacing the entire database.

---

### FILE 6: `app/core/viral_patterns.py` (296 lines)

| Line(s) | Exact Hardcoded Text | Represents | Group | Proposed Variable |
|---------|---------------------|------------|-------|-------------------|
| 12-91 | `TITLE_ARCHETYPES` — 11 patterns, all health-themed: | Title patterns | A+E | `title_archetypes` |
| 16 | `"SIGNS YOUR BODY IS {STATE}"` with states: `"trying to warn you"`, `"starving inside"`, `"aging too fast"`, `"fighting inflammation"` | Health states | A | — |
| 25 | `"BODY_PART"` variables: `"liver"`, `"gut"`, `"brain"`, `"heart"`, `"kidneys"`, `"nervous system"`, `"thyroid"` | Health body parts | A | `body_part_variables` |
| 36 | `"DOCTORS DON'T WANT YOU TO KNOW {SECRET}"` with `"this about sleep"`, `"this about your gut"`, `"natural remedies"` | Authority hook topics | A | — |
| 52 | `TARGET` variables: `"sleep"`, `"health"`, `"energy"`, `"metabolism"`, `"gut"`, `"brain"`, `"hormones"`, `"skin"` | Health targets | A | `health_targets` |
| 65 | `"better sleep"`, `"more energy"`, `"clear skin"`, `"to age slower"` | Health outcomes | A | `desired_outcomes` |
| 91 | `"THESE {PEOPLE} AGE FASTER"` — `"busy professionals"`, `"night owls"`, `"desk workers"` | Audience segments | B | `audience_segments` |
| 128-143 | `TOPIC_BUCKETS` — 16 health topics: `gut health`, `sleep optimization`, `nutrition and food`, `aging and longevity`, `body signals and warnings`, `daily habits`, `mental strength and mindset`, `stress and nervous system`, `energy and metabolism`, `hydration and electrolytes`, `inflammation and immunity`, `hormone balance`, `brain health and memory`, `detoxification`, `heart and cardiovascular`, `nutritional deficiencies` | Topic categories | A | `topic_buckets` |
| 97-114 | `FORMAT_DEFINITIONS` | Content format rules | — | Keep as system rules |
| 118-141 | `HOOK_DEFINITIONS` — `fear`, `curiosity`, `authority`, `control`, `hope` triggers | Hook psychology | C | Partially configurable |

---

### FILE 7: `app/core/cta.py` (60 lines)

| Line(s) | Exact Hardcoded Text | Represents | Group | Proposed Variable |
|---------|---------------------|------------|-------|-------------------|
| 15-19 | `follow_tips` variations: `"health, wellness, and habits"`, `"health"` | CTA text | G | `cta_follow_variations` |
| 21-26 | `sleep_lean` variations: `"LEAN"` keyword, `"nighttime formula"`, `"fat loss support, deeper sleep, and healthier skin"` | CTA product pitch | G | `cta_product_variations` |
| 28-33 | `workout_plan` variations: `"PLAN"` keyword, `"workout and nutrition plan"`, `"fat loss and muscle growth"` | CTA service pitch | G | `cta_plan_variations` |

---

### FILE 8: `app/core/quality_scorer.py` (345 lines)

| Line(s) | Exact Hardcoded Text | Represents | Group | Proposed Variable |
|---------|---------------------|------------|-------|-------------------|
| 93-107 | `HOOK_KEYWORDS` — health-themed trigger words per hook type: | Niche scoring words | A+C | `hook_scoring_keywords` |
| 94 | fear: `"destroy"`, `"damage"`, `"aging"`, `"disease"`, `"harmful"`, `"toxic"` | Health fear words | A | — |
| 98 | curiosity: `"secret"`, `"hidden"`, `"what your"`, `"signs"` | Curiosity triggers | C | — |
| 101 | authority: `"doctor"`, `"expert"`, `"science"`, `"research"` | Authority signals | C | — |
| 111-115 | `PLAUSIBILITY_BLACKLIST` — `"cure"`, `"guaranteed"`, `"miracle"`, `"instantly"`, `"proven to cure"` | Medical claim blockers | A | `plausibility_blacklist` |
| 118-121 | `PLAUSIBILITY_WHITELIST` — `"may"`, `"can"`, `"supports"`, `"linked to"` | Soft language terms | A | `plausibility_whitelist` |
| 124-131 | Familiar items: `"water"`, `"sleep"`, `"walk"`, `"lemon"`, `"ginger"`, `"honey"`, `"apple"`, `"turmeric"`, `"garlic"`, `"green tea"`, `"vitamin"`, `"protein"`, `"fiber"`, `"zinc"`, `"magnesium"` | Health product vocabulary | A | `familiar_niche_items` |
| 195-207 | `familiar_patterns` regex list: `r"SIGNS YOUR"`, `r"DOCTORS"`, `r"EAT THIS"`, `r"HABITS"`, `r"YOUR BODY"` | Health title patterns | A | `viral_title_patterns` |
| 213-220 | `health_keywords` list: `"body"`, `"health"`, `"sleep"`, `"gut"`, `"energy"`, `"food"`, `"symptom"`, `"digestion"`, `"metabolism"`, `"immune"`, `"inflammation"`, `"vitamin"`, `"mineral"`, `"hormone"`, `"detox"` | Niche vocabulary | A | `niche_familiarity_keywords` |

---

### FILE 9: `app/core/constants.py` (68 lines)

| Line(s) | Exact Hardcoded Text | Represents | Group | Proposed Variable |
|---------|---------------------|------------|-------|-------------------|
| 27-35 | `DEFAULT_HASHTAGS` — `#health`, `#fitness`, `#wellness`, `#mindset`, `#motivation`, `#selfimprovement`, `#growth`, `#lifestyle` | Niche hashtags | G | `default_hashtags` (DB-backed) |

---

### FILE 10: `app/services/content/tracker.py` (395 lines)

| Line(s) | Exact Hardcoded Text | Represents | Group | Proposed Variable |
|---------|---------------------|------------|-------|-------------------|
| 28-41 | `TOPIC_BUCKETS` — 13 items: `superfoods`, `teas_drinks`, `supplements`, `sleep`, `morning_routines`, `skin_antiaging`, `gut_health`, `hormones`, `stress_mood`, `hydration_detox`, `brain_memory`, `heart_health`, `general` | Topic categories | A | `topic_buckets` (shared, DB-backed) |
| 44 | `TOPIC_COOLDOWN_DAYS = 3` | Topic rotation rule | — | Config setting |
| 47 | `FINGERPRINT_COOLDOWN_DAYS = 30` | Dedup rule | — | Config setting |
| 50 | `BRAND_HISTORY_DAYS = 60` | History window | — | Config setting |

---

### FILE 11: `app/services/media/caption_builder.py` (83 lines)

| Line(s) | Exact Hardcoded Text | Represents | Group | Proposed Variable |
|---------|---------------------|------------|-------|-------------------|
| 4 | Imports `DEFAULT_HASHTAGS` from constants | Niche hashtags (indirect) | G | Same as constants |

---

## GROUP ANALYSIS

---

### GROUP A — Niche/Topic (145+ instances)

**What's hardcoded:** The entire system assumes "health & wellness" as the niche. This is baked into:
- System prompts (8 places)
- Topic category lists (3 separate lists in 3 files, partially overlapping)
- Title patterns (11 archetypes all health-themed)
- Quality scoring vocabulary (22+ health keywords)
- Fallback content (7+ hardcoded health posts)
- 59 viral ideas (entire database)
- 15 carousel examples 
- Image style descriptions (all "wellness aesthetic")

**Can be user-editable?** YES — this is the #1 priority. A user running a finance, tech, or fitness brand cannot use this system at all.

**Risk if user changes it:** MEDIUM — The quality scorer uses health keywords to validate output. If the niche changes to "finance", the scorer would fail everything. The viral ideas database would be irrelevant.

**Recommended input type:**
- `niche` → Text field (e.g., "personal finance", "fitness", "cooking")
- `topic_categories` → Multi-select / tag input (user defines their topic buckets)
- `topic_framing_keywords` → Comma-separated text (keywords that define the niche framing)
- `familiar_items` → Tag list (niche-specific vocabulary for quality scoring)

**Files requiring changes:** `prompt_templates.py`, `viral_patterns.py`, `generator.py`, `quality_scorer.py`, `tracker.py`, `caption_generator.py`, `differentiator.py`

---

### GROUP B — Target Audience (12 instances)

**What's hardcoded:**
| Text | Location |
|------|----------|
| `"U.S. women aged 35 and older"` | prompt_templates.py L519, generator.py L424 |
| `"Women 35+"` | prompt_templates.py L523, generator.py L430 |
| `"women 35+"` | prompt_templates.py L348 |
| `"Content that does not resonate with women 35+"` | generator.py L500 |
| `"women"` / `"men"` references in viral ideas | viral_ideas.py (items 7, 11) |
| `"busy professionals"`, `"night owls"`, `"desk workers"` | viral_patterns.py L91 |

**Can be user-editable?** YES — absolutely critical. Different brands target different demographics.

**Risk if user changes it:** LOW — audience description is injected into prompts as context. Changing it just redirects the AI's targeting.

**Recommended input type:**
- `target_audience` → Text area (e.g., "U.S. women aged 35 and older interested in healthy aging")
- `audience_short` → Short text (e.g., "Women 35+") for compact prompt references
- `audience_interests` → Tag list (e.g., "healthy aging", "energy", "hormones")

---

### GROUP C — Content Tone/Style (14 instances)

**What's hardcoded:**
| Text | Location |
|------|----------|
| `"simple, confident, and non-clinical"` | prompt_templates.py L70 |
| `"emotional hooks: curiosity, fear, authority, hope, or control"` | prompt_templates.py L69 |
| `"academic, poetic, or overly creative language"` (avoid) | prompt_templates.py L73 |
| `"calm, authoritative, educational tone (NOT salesy)"` | prompt_templates.py L440 |
| `"warm, educational tone (not salesy)"` | caption_generator.py L90 |
| Hook types: fear, curiosity, authority, control, hope | viral_patterns.py L118-141 |
| `"soft, consumable, and lifestyle-oriented"` | generator.py L500 |

**Can be user-editable?** PARTIALLY — tone and style can be a dropdown, but hook psychology should stay system-managed.

**Risk if user changes it:** LOW-MEDIUM — changing tone is safe. Removing all hooks would decrease viral potential.

**Recommended input type:**
- `content_tone` → Dropdown (calm/authoritative, energetic/motivational, casual/friendly, professional/scientific)
- `style_restrictions` → Checklist (avoid academic, avoid poetic, avoid clinical, etc.)
- Hook definitions → NOT user-editable (system-level viral psychology)

---

### GROUP D — Brand Personalities (18 instances)

**What's hardcoded:**
| Text | Location |
|------|----------|
| 5 brand names (healthycollege, longevitycollege, etc.) | prompt_templates.py, differentiator.py, caption_generator.py |
| 5 brand color palettes (hex codes + descriptions) | prompt_templates.py L270-287 |
| 5 brand personality descriptions | differentiator.py L107-113 |
| 6 brand Instagram handles | caption_generator.py L13-19 |
| `BASELINE_BRAND = "longevitycollege"` | differentiator.py L39 |
| `"InLight"` brand name | prompt_templates.py L519, generator.py L424 |

**Can be user-editable?** YES — this is already partially managed via the brands DB table but the code still has hardcoded references.

**Risk if user changes it:** LOW — these are already meant to be per-brand. The hardcoding is technical debt.

**Recommended input type:**
- `brand_personality` → Text area per brand (already in brands table)
- `brand_palette` → Color picker per brand (already partially in brands table)
- `brand_handle` → Text field per brand (already in brands table)
- `baseline_brand` → Dropdown (select which brand gets original content)
- `parent_brand_name` → Text field (e.g., "InLight")

**Note:** Most of this should already come from the `brands` database table. The code just doesn't read from it.

---

### GROUP E — Examples (74+ instances)

**What's hardcoded:**
| Text | Location | Count |
|------|----------|-------|
| 59 viral ideas (full content) | viral_ideas.py | 59 |
| 15 carousel slide examples | prompt_templates.py L312-510 | 15 |
| ~15 example titles in prompts | prompt_templates.py, generator.py | ~15 |
| 2 image prompt examples | prompt_templates.py L222-228 | 2 |
| 7 fallback posts/prompts | generator.py | 7 |

**Can be user-editable?** PARTIALLY — users could add/remove examples, but they need to follow format rules.

**Risk if user changes it:** HIGH — bad examples would poison the AI's output quality. Examples are the "training data" for style.

**Recommended input type:**
- `viral_ideas_database` → Managed JSON/DB collection (admin interface with validation)
- `carousel_examples` → Managed collection with format validation
- `example_titles` → Text list with validation (must be ALL CAPS, 8-14 words)
- Fallback content → NOT user-editable (safety net)

---

### GROUP F — Image/Visual Style (22 instances)

**What's hardcoded:**
| Text | Location |
|------|----------|
| `"Blue/teal color palette with controlled warm accents"` | prompt_templates.py L231 |
| `"Scientific/premium wellness aesthetic"` | prompt_templates.py L233 |
| `"Soft, minimal, calming wellness aesthetic"` | prompt_templates.py L622, generator.py L497 |
| `"Bright modern kitchen or clean lifestyle setting"` | prompt_templates.py L623 |
| `"Neutral tones, gentle morning sunlight"` | prompt_templates.py L624 |
| `"High-end lifestyle photography style"` | prompt_templates.py L625 |
| `POST_QUALITY_SUFFIX` — full image quality description | prompt_templates.py L237-239 |
| `REEL_BASE_STYLE` — full reel style description | prompt_templates.py L241-249 |
| `BRAND_PALETTES` — 5 brand color definitions | prompt_templates.py L270-287 |
| `"No text, no letters, no numbers, no symbols, no logos."` | prompt_templates.py (4 times) |
| 7 fallback image prompts by category | prompt_templates.py L194-210, generator.py L677-706 |

**Can be user-editable?** YES — visual style is highly brand-specific.

**Risk if user changes it:** LOW-MEDIUM — users might write poor image prompts, but the "No text..." suffix should always be appended by the system.

**Recommended input type:**
- `image_style_description` → Text area (the visual aesthetic description)
- `image_color_palette` → Text field + color pickers
- `image_setting` → Dropdown (kitchen, nature, studio, lifestyle, office, etc.)
- `image_prompt_suffix` → NOT user-editable (`"No text, no letters..."` is mandatory)
- `reel_base_style` → Text area (advanced users only)

---

### GROUP G — CTA/Captions (19 instances)

**What's hardcoded:**
| Text | Location |
|------|----------|
| 3 CTA types × 3 variations = 9 CTA texts | cta.py L14-39 |
| 3 CTA types × 1 extended text each | caption_generator.py L22-35 |
| 5 reel CTA options ("Follow for Part 2!") | generator.py L107-121 |
| Follow section text | caption_generator.py L130-131 |
| Save section text | caption_generator.py L133-134 |
| Disclaimer text | caption_generator.py L136 |
| `HASHTAGS` string | caption_generator.py L37 |
| `DEFAULT_HASHTAGS` list | constants.py L27-35 |

**Can be user-editable?** YES — CTAs are business-specific and should be configurable.

**Risk if user changes it:** LOW — CTAs don't affect content quality, just conversion.

**Recommended input type:**
- `cta_options` → List of CTA types, each with name + variations (structured form)
- `default_hashtags` → Tag input
- `follow_section_template` → Text area with `{brand_handle}` placeholder
- `save_section_template` → Text area
- `disclaimer_text` → Text area (with default provided)

---

## WHAT SHOULD NEVER BE USER-EDITABLE

These are **system-level rules** that ensure content quality and format compliance:

| Rule | Location | Why NOT editable |
|------|----------|-----------------|
| ALL CAPS title format | prompt_templates.py, quality_scorer.py | Instagram visual format requirement |
| Word-per-line limits (6/8/15/20) | viral_patterns.py FORMAT_DEFINITIONS | Slide rendering would break |
| Point count ranges per format | quality_scorer.py FORMAT_POINT_RANGES | Visual layout requirement |
| "No text, no letters..." suffix | prompt_templates.py (IMAGE_PROMPT_SUFFIX) | AI image generation requirement |
| No emojis in reel content | quality_scorer.py, prompt_templates.py | Overlay rendering |
| No hashtags in reel content | quality_scorer.py | Rendering |
| No numbered lists in content | quality_scorer.py | System adds numbers |
| JSON output format rules | prompt_templates.py | Parser requirement |
| Quality score thresholds (80/65) | quality_scorer.py, generator.py | System integrity |
| Plausibility blacklist ("cure", "guaranteed") | quality_scorer.py | Legal safety |
| Image dimensions (1080×1920, 1080×1350) | constants.py | Platform requirements |
| Fingerprint/cooldown algorithms | tracker.py | Anti-repetition logic |

---

## DUPLICATE/OVERLAPPING DEFINITIONS

Several concepts are defined in multiple places with slightly different values:

| Concept | File 1 | File 2 | File 3 | Action Needed |
|---------|--------|--------|--------|---------------|
| Topic buckets | `viral_patterns.py` (16 items) | `tracker.py` (13 items) | `prompt_templates.py` (18 items) | **Consolidate to ONE source** |
| CTA options | `cta.py` (3 types) | `caption_generator.py` (3 types, different text) | `generator.py` (2 types) | **Consolidate to ONE source** |
| Brand names | `prompt_templates.py` | `differentiator.py` | `caption_generator.py` | **Read from DB only** |
| Fallback prompts | `prompt_templates.py` | `generator.py` | | **Consolidate** |
| Hashtags | `constants.py` | `caption_generator.py` | | **Consolidate** |
| Image style | `prompt_templates.py` (3 places) | `generator.py` (2 places) | | **Single definition** |
| Audience description | `prompt_templates.py` (2 places) | `generator.py` (3 places) | | **Single variable** |

---

## PROPOSED DYNAMIC SETTINGS SCHEMA

```python
# New table: niche_settings (or extend app_settings)
{
    # GROUP A — Niche/Topic
    "niche_name": "health & wellness",                    # Text field
    "niche_description": "viral short-form health content", # Text area
    "topic_categories": [...],                            # JSON array — multi-select
    "topic_framing_keywords": "habits, symptoms, food...", # Comma-separated
    "familiar_niche_items": ["water", "sleep", ...],      # JSON array — tag input
    "content_avoidance_rules": ["no medical diagnosis..."], # JSON array
    
    # GROUP B — Audience
    "target_audience": "U.S. women aged 35+...",          # Text area
    "audience_short": "Women 35+",                        # Short text
    "audience_interests": ["healthy aging", "energy"...],  # JSON array
    
    # GROUP C — Tone/Style
    "content_tone": "calm, authoritative, educational",    # Dropdown or text
    "style_restrictions": ["no academic", "no poetic"],    # Checklist
    
    # GROUP D — Brand (per-brand, in brands table)
    "brand_personality": "natural health, whole foods...",  # Text area per brand
    "brand_palette": {"primary": "#4CAF50", ...},          # JSON per brand
    "brand_handle": "@thehealthycollege",                  # Text per brand
    
    # GROUP F — Visual Style
    "image_style_description": "Soft, minimal, calming...", # Text area
    "image_color_palette": "Blue/teal with warm accents",   # Text
    "image_setting": "Bright modern kitchen",               # Dropdown
    "reel_base_style": "BRIGHT, COLORFUL...",               # Text area (advanced)
    
    # GROUP G — CTA/Captions
    "cta_options": {...},                                   # Structured JSON
    "default_hashtags": ["#health", "#wellness"...],        # Tag input
    "follow_section_template": "Follow {handle} for...",    # Text area
    "disclaimer_text": "Content provided for...",           # Text area
}
```

---

## IMPLEMENTATION PRIORITY

| Priority | What to Dynamify | Effort | Impact |
|----------|-----------------|--------|--------|
| **P0** | Target audience (`target_audience`, `audience_short`) | Low | HIGH — currently blocks non-women-35+ use |
| **P0** | Niche name + description | Low | HIGH — currently blocks non-health niches |
| **P0** | Brand personalities + handles (read from DB) | Medium | HIGH — eliminates 5-brand hardcoding |
| **P1** | Topic categories (consolidated, DB-backed) | Medium | HIGH — enables custom topic rotation |
| **P1** | CTA options (consolidated, DB-backed) | Medium | MEDIUM — enables custom CTAs |
| **P1** | Default hashtags | Low | MEDIUM — easy win |
| **P1** | Image visual style | Low | MEDIUM — brand differentiation |
| **P2** | Content tone/style | Low | MEDIUM — nice-to-have |
| **P2** | Quality scorer vocabulary (niche keywords) | Medium | MEDIUM — needed for non-health niches |
| **P3** | Carousel/viral examples DB | High | LOW — works fine hardcoded for health niche |
| **P3** | Fallback content | Medium | LOW — rarely used |

---

## COUNTS SUMMARY PER FILE

| File | Group A | Group B | Group C | Group D | Group E | Group F | Group G | Total |
|------|---------|---------|---------|---------|---------|---------|---------|-------|
| `prompt_templates.py` | 22 | 3 | 4 | 6 | 32 | 12 | 1 | **80** |
| `generator.py` | 18 | 3 | 2 | 0 | 26 | 8 | 5 | **62** |
| `differentiator.py` | 2 | 0 | 0 | 7 | 0 | 0 | 0 | **9** |
| `caption_generator.py` | 3 | 0 | 1 | 7 | 0 | 0 | 6 | **17** |
| `viral_ideas.py` | 59 | 2 | 0 | 0 | 59 | 0 | 0 | **120** |
| `viral_patterns.py` | 30 | 2 | 6 | 0 | 0 | 0 | 0 | **38** |
| `cta.py` | 0 | 0 | 0 | 0 | 0 | 0 | 9 | **9** |
| `quality_scorer.py` | 32 | 0 | 4 | 0 | 0 | 0 | 0 | **36** |
| `constants.py` | 0 | 0 | 0 | 0 | 0 | 0 | 8 | **8** |
| `tracker.py` | 13 | 0 | 0 | 0 | 0 | 0 | 0 | **13** |
| `caption_builder.py` | 0 | 0 | 0 | 0 | 0 | 0 | 1 | **1** |
| **TOTAL** | **179** | **10** | **17** | **20** | **117** | **20** | **30** | **393** |
