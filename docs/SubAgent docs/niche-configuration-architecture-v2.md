# Niche Configuration Architecture v2

> **Date:** 2026-02-18  
> **Version:** 2.0 (supersedes v1)  
> **Status:** Proposal — Ready for review  
> **Scope:** Make the entire content generation system niche-configurable by users  
> **Impact:** 393 hardcoded references across 11 backend files + frontend redesign  
> **Key v2 additions:** User examples (few-shot), format protection boundaries, UX education layer

---

## Table of Contents

1. [Current State Diagnosis](#part-1-current-state-diagnosis)
2. [Design Philosophy](#part-2-design-philosophy)
3. [User Examples — Few-Shot Prompting](#part-3-user-examples--few-shot-prompting)
4. [Format Protection — Hard Boundaries](#part-4-format-protection--hard-boundaries)
5. [Data Model](#part-5-data-model)
6. [Backend Architecture](#part-6-backend-architecture)
7. [Frontend Architecture](#part-7-frontend-architecture)
8. [Page Purpose & User Education](#part-8-page-purpose--user-education)
9. [Implementation Phases](#part-9-implementation-phases)
10. [Files That Need Changes](#part-10-files-that-need-changes)
11. [Risks & Mitigations](#part-11-risks--mitigations)
12. [Appendix: Data Flow Diagram](#appendix-data-flow-diagram)

---

## PART 1: CURRENT STATE DIAGNOSIS

### 1.1 The "Whisper at the End of a Conversation" Problem

The user-facing Content Prompts (`reels_prompt`, `posts_prompt`, `brand_description`) are **not placebo** — they are stored in `app_settings` and injected into AI prompts. But they are **appended at the very end** of massive hardcoded prompts (2000–3000+ words), making their influence negligible.

```
┌──────────────────────────────────────────────────────────────┐
│  SYSTEM_PROMPT (hardcoded)                          ~200 tok │
│  "You are a viral short-form HEALTH content generator..."    │
├──────────────────────────────────────────────────────────────┤
│  Runtime prompt body (hardcoded)                   ~500 tok  │
│  Topic, format, hooks — all health/wellness themed           │
├──────────────────────────────────────────────────────────────┤
│  Post batch prompt (hardcoded)                   ~3000 tok   │
│  18 health topic categories, 15 carousel examples,           │
│  12+ example titles, audience = "Women 35+"                  │
├──────────────────────────────────────────────────────────────┤
│  ... at the very bottom ...                                  │
│                                                              │
│  BRAND CONTEXT: {user's brand_description}          ~50 tok  │
│  ADDITIONAL INSTRUCTIONS: {user's reels/posts prompt} ~50 tok│
│                                                              │
│  ↑ This is what the user controls. ~2% of the total prompt.  │
└──────────────────────────────────────────────────────────────┘
```

The AI follows the 98% of detailed hardcoded instructions first, then *tries* to accommodate the 2% user instructions as a secondary consideration. The user's voice is drowned out.

### 1.2 The 393 Hardcoded References Problem

A surgical audit identified **393 hardcoded niche-specific references** across 11 backend files:

| Group | Description | Count | Files |
|-------|-------------|-------|-------|
| **A** Niche/Topic | Health keywords, topic lists, framing | **179** | 8 |
| **B** Audience | "U.S. women aged 35+" | **10** | 3 |
| **C** Tone/Style | "calm, authoritative, non-clinical" | **17** | 4 |
| **D** Brand Personality | 5 hardcoded brand identities | **20** | 3 |
| **E** Examples | 59 viral ideas + 15 carousel examples | **117** | 2 |
| **F** Visual Style | "wellness aesthetic", color palettes | **20** | 2 |
| **G** CTA/Captions | Hardcoded CTAs, hashtags, disclaimers | **30** | 4 |

**Top 3 offending files:**
- `viral_ideas.py` — 120 references (entire file is the niche)
- `prompt_templates.py` — 80 references
- `generator.py` — 62 references

### 1.3 Why User Prompts Are Drowned Out

Three structural reasons:

1. **Position:** User prompts are appended *after* all hardcoded content. LLMs weight earlier instructions more heavily.

2. **Contradiction:** If the user writes "target audience: tech professionals aged 25-40" in brand_description, the `SYSTEM_PROMPT` still says "viral short-form health content generator", `build_post_content_prompt()` still says "targeting U.S. women aged 35 and older", and the 15 carousel examples are all about collagen, magnesium, and gut health.

3. **Example anchoring:** The 59 viral ideas and 15 carousel examples in few-shot prompting powerfully anchor the AI's output toward health/wellness topics regardless of what the user writes.

### 1.4 Global vs Per-Brand Mismatch

| What exists | Where stored | Scope |
|-------------|-------------|-------|
| `reels_prompt` | `app_settings` table | **Global** — shared across all brands |
| `posts_prompt` | `app_settings` table | **Global** |
| `brand_description` | `app_settings` table | **Global** |
| Brand personality | Hardcoded `brand_hints` dict in `differentiator.py` | **Per brand** (hardcoded) |
| Brand colors/palettes | Hardcoded `BRAND_PALETTES` in `prompt_templates.py` | **Per brand** (hardcoded) |
| Brand handles | Hardcoded `BRAND_HANDLES` in `caption_generator.py` | **Per brand** (hardcoded) |

The system has *per-brand* concepts (personalities, palettes, handles) but stores them as **hardcoded dicts**, while the *user-editable* prompts are **global only**. There's no way to set a different niche per brand.

### 1.5 What's Actually Broken

| Issue | Impact |
|-------|--------|
| Cannot use the system for any niche except health/wellness | Blocks all non-health use cases |
| "Women 35+" is hardcoded in 10 locations | Cannot target a different audience |
| 18 topic categories are hardcoded health topics | Topic rotation only works for health content |
| Quality scorer uses health-specific keywords | Non-health content would fail quality checks |
| All fallback content is health-themed | When AI fails, health content surfaces regardless |
| Brand personality hints are 5 hardcoded dicts | Cannot customize brand differentiation |
| Content Prompts tab has 3 vague textareas | No guidance on what fields matter or how they're used |
| No user examples → AI has no reference content | AI guesses style/depth/topic focus from vague instructions |

---

## PART 2: DESIGN PHILOSOPHY

### Principle 1: Structured Fields > Free-Text Prompts

**Problem:** Today, users have 3 raw textareas. They don't know what to write, what the system already injects, or how their text interacts with hardcoded prompts.

**Solution:** Replace raw textareas with structured fields — niche name, target audience, topic tags, tone chips, etc. Each field maps to a specific variable in the prompt templates.

```
❌ BEFORE: One textarea → User writes "focus on tech for devs"
           → Appended after 3000 words of health content

✅ AFTER:  Structured niche field → "Technology & Development"
           → Injected INTO the system prompt, replacing "health & wellness"
```

### Principle 2: Examples Are the Most Powerful Lever (NEW in v2)

Few-shot prompting is the gold standard for guiding LLM output. User-provided examples of actual content they want to see are **more powerful than any instruction paragraph**.

```
┌────────────────────────────────────────────────────────────────┐
│  POWER RANKING OF PROMPT INFLUENCE ON LLM OUTPUT               │
│                                                                │
│  1. █████████████████████████  FEW-SHOT EXAMPLES               │
│     Concrete examples of desired output.                       │
│     The AI directly mimics style, depth, vocabulary, topics.   │
│                                                                │
│  2. ████████████████████       SYSTEM PROMPT / ROLE             │
│     "You are a {niche} content generator"                      │
│     Sets the domain and persona.                               │
│                                                                │
│  3. ██████████████             STRUCTURED INSTRUCTIONS           │
│     Niche, audience, topics, tone.                             │
│     Guides direction.                                          │
│                                                                │
│  4. ████████                   APPENDED FREE-TEXT               │
│     "ADDITIONAL INSTRUCTIONS: ..."                             │
│     Easily ignored or contradicted by earlier content.         │
│                                                                │
│  Current system uses only #3 and #4.                           │
│  v2 adds #1 (user examples) at the TOP of the prompt.         │
└────────────────────────────────────────────────────────────────┘
```

### Principle 3: Template Variables, Not Prompt Replacement

The backend prompt templates become templates with `{variables}` that are populated from user config. Format rules, character limits, JSON output structure — these stay hardcoded. Only the **content topic** gets injected from user settings.

```python
# BEFORE (hardcoded)
"You are a viral short-form health content generator."

# AFTER (template variable)
f"You are a viral short-form {context.niche_name} content generator."

# NEVER (user replaces entire prompt)
user_supplied_system_prompt  # This would break everything
```

### Principle 4: Global Defaults + Per-Brand Overrides

```
┌─────────────────────────────────────────┐
│        GLOBAL NICHE CONFIG              │
│  niche: "Health & Wellness"             │
│  audience: "U.S. women aged 35+"        │
│  topics: [superfoods, sleep, gut, ...]  │
│  tone: [calm, authoritative]            │
│  examples: [10 reel examples, 8 posts]  │
└────────────────┬────────────────────────┘
                 │ inherited by default
     ┌───────────┼───────────┐
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Brand A │ │ Brand B │ │ Brand C │
│ (uses   │ │ override│ │ override│
│ global) │ │ tone:   │ │ person: │
│         │ │[casual] │ │"expert" │
└─────────┘ └─────────┘ └─────────┘
```

A global niche config is the baseline. Individual brands inherit it by default but can override specific sections (personality, tone, focus areas).

### Principle 5: Safe Boundaries — Content vs Format Separation

Users can change **WHAT** the content is about, but **NEVER HOW** it's formatted. This is enforced architecturally (see Part 4).

| User-configurable (CONTENT layer) | System-controlled (FORMAT layer) |
|-|-|
| Niche name & description | ALL CAPS title format |
| Target audience | Word-per-line limits (6/8/15/20) |
| Topic categories | Point count ranges per format |
| Content tone keywords | "No text, no letters..." image suffix |
| Brand personality | JSON output format rules |
| Visual style description | Quality score thresholds |
| CTA text | Image dimensions (1080×1920) |
| Hashtags | Fingerprint/cooldown algorithms |
| **Reel examples** (NEW) | Number of carousel slides (always 8) |
| **Post examples** (NEW) | Caption structure (DOI, disclaimer, hashtags) |

---

## PART 3: USER EXAMPLES — FEW-SHOT PROMPTING

> **This is the highest-impact feature in v2.** User-provided examples are the single most powerful way to guide an LLM's output — more powerful than instructions, role descriptions, or structured fields.

### 3.1 Why Examples Are Critical

DeepSeek (like all LLMs) learns patterns from context. When you show it 10 examples of exactly what you want, it:

- **Mimics the vocabulary level** — technical vs casual, medical vs everyday
- **Matches the topic depth** — surface-level tips vs deep scientific insights
- **Copies the content style** — listicle fragments vs flowing sentences
- **Stays on-topic** — examples anchor the AI to your niche far better than instructions
- **Matches the quality bar** — the AI produces content at the same quality level as the examples

```
WITHOUT EXAMPLES (current system):
┌────────────────────────────────────┐
│  Instructions: "Generate health    │
│  content for women 35+"            │
│  → AI guesses style, depth, topics │
│  → Output varies wildly            │
│  → Often off-topic or too generic  │
└────────────────────────────────────┘

WITH 10 EXAMPLES (v2):
┌────────────────────────────────────┐
│  Examples:                         │
│  1. "SIGNS YOUR GUT IS..."        │
│  2. "THESE 5 FOODS DESTROY..."    │
│  3. "WHAT HAPPENS WHEN YOU..."    │
│  ... 7 more ...                    │
│  → AI sees exact style/depth       │
│  → Output matches examples closely │
│  → Stays on-topic, consistent      │
└────────────────────────────────────┘
```

### 3.2 Reel Examples

Users can provide **1 to 20** example reels. Each example has:

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | ALL CAPS, exactly as it would appear on screen |
| `content_lines` | `string[]` | Array of bullet points (the reel's content lines) |

**Important:** The CTA is ALWAYS automatically appended as the final line by the system. Users do NOT include it in their examples.

#### Example Reel Data

```json
{
  "reel_examples": [
    {
      "title": "SIGNS YOUR BODY IS BEGGING FOR MAGNESIUM",
      "content_lines": [
        "Muscle cramps that wake you up at night",
        "Constant fatigue even after sleeping 8 hours",
        "Eye twitches that won't go away",
        "Sugar cravings that feel uncontrollable",
        "Anxiety that spikes for no clear reason",
        "Headaches that come and go without warning",
        "Trouble falling asleep despite being exhausted"
      ]
    },
    {
      "title": "WHAT HAPPENS WHEN YOU EAT TURMERIC EVERY DAY",
      "content_lines": [
        "Inflammation markers start dropping within days",
        "Joint stiffness gradually eases up",
        "Your skin starts looking clearer and brighter",
        "Digestion improves noticeably",
        "Brain fog starts to lift",
        "Blood sugar levels stabilize"
      ]
    }
  ]
}
```

### 3.3 Post Examples

Users can provide **1 to 20** example carousel posts. Each example has:

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | ALL CAPS, the carousel cover title |
| `slides` | `string[]` | Array of slide texts — each string is the full text content of one carousel slide |

#### Example Post Data

```json
{
  "post_examples": [
    {
      "title": "WHY COLLAGEN SUPPLEMENTS MIGHT NOT BE ENOUGH",
      "slides": [
        "Your body breaks down collagen supplements into amino acids before rebuilding them. This means the collagen you swallow doesn't go directly to your skin or joints.",
        "Vitamin C is essential for collagen synthesis. Without adequate vitamin C, your body cannot properly assemble collagen fibers, no matter how much supplement you take.",
        "Bone broth provides collagen in a more bioavailable form along with other nutrients like glycine, proline, and glutamine that support the rebuilding process.",
        "Sleep is when your body does most of its collagen repair work. Chronic poor sleep can undermine even the best supplementation strategy.",
        "The most effective approach combines dietary collagen sources with vitamin C-rich foods, adequate sleep, and protection from UV damage which breaks down existing collagen."
      ]
    }
  ]
}
```

### 3.4 How Examples Replace Hardcoded Content

Currently, `prompt_templates.py` contains **15 hardcoded `CAROUSEL_SLIDE_EXAMPLES`** — all health/wellness themed (collagen, magnesium, gut health, etc.). These powerfully anchor the AI toward health content regardless of user settings.

```
BEFORE (v1):
┌─────────────────────────────────────────────────────────────┐
│  15 hardcoded health carousel examples (prompt_templates.py) │
│  + 59 hardcoded health viral ideas (viral_ideas.py)          │
│  + 12+ hardcoded health title examples                       │
│  = AI is anchored to health/wellness no matter what          │
└─────────────────────────────────────────────────────────────┘

AFTER (v2):
┌─────────────────────────────────────────────────────────────┐
│  IF user has post_examples → use them (replace hardcoded)    │
│  IF user has 0 examples → fall back to hardcoded defaults    │
│                                                              │
│  IF user has reel_examples → inject before generation rules  │
│  IF user has 0 examples → no examples section in prompt      │
└─────────────────────────────────────────────────────────────┘
```

### 3.5 Prompt Injection Strategy

Examples are injected **BEFORE** the generation instructions — this is critical because few-shot examples work best when placed early in the prompt, before formatting rules.

#### Reel Prompt Assembly Order

```
┌──────────────────────────────────────────────────────────────────────┐
│  1. SYSTEM PROMPT                                                    │
│     "You are a viral short-form {niche} content generator."          │
│                                                                      │
│  2. USER EXAMPLES (from reel_examples) ← NEW, injected early        │
│     "Here are examples of the exact style and quality to generate:"  │
│     EXAMPLE 1: title + content_lines                                 │
│     EXAMPLE 2: title + content_lines                                 │
│     ...                                                              │
│     "Generate NEW content following the same style."                 │
│                                                                      │
│  3. CONTENT CONTEXT (from PromptContext)                             │
│     Niche, audience, topics, tone                                    │
│                                                                      │
│  4. FORMAT RULES (HARDCODED — never from user)                       │
│     ALL CAPS, word limits, point counts, JSON format                 │
│                                                                      │
│  5. RUNTIME PARAMETERS                                               │
│     Topic, hook type, format style, history                          │
└──────────────────────────────────────────────────────────────────────┘
```

#### Post Prompt Assembly Order

```
┌──────────────────────────────────────────────────────────────────────┐
│  1. SYSTEM PROMPT                                                    │
│     "You are a {niche} content creator for {brand}."                 │
│                                                                      │
│  2. USER EXAMPLES (from post_examples) ← REPLACES CAROUSEL_EXAMPLES │
│     "Here are examples of the exact style of carousel posts:"        │
│     EXAMPLE 1: title + slides                                        │
│     EXAMPLE 2: title + slides                                        │
│     ...                                                              │
│     "Generate NEW posts following the same style and quality."       │
│                                                                      │
│  3. CONTENT CONTEXT (from PromptContext)                             │
│     Niche, audience, topics, tone                                    │
│                                                                      │
│  4. FORMAT RULES (HARDCODED — never from user)                       │
│     8 slides always, DOI required, disclaimer required, etc.         │
│                                                                      │
│  5. GENERATION PARAMETERS                                            │
│     Count, history injection, topic selection                        │
└──────────────────────────────────────────────────────────────────────┘
```

#### Backend Example Formatting Functions

```python
# app/core/prompt_context.py (additions)

def format_reel_examples(examples: list[dict]) -> str:
    """Format reel examples for prompt injection. Returns empty string if no examples."""
    if not examples:
        return ""
    
    lines = [
        "Here are examples of the exact style and quality of reel content to generate.",
        "Study the vocabulary, depth, topic focus, and structure carefully:",
        ""
    ]
    
    for i, ex in enumerate(examples, 1):
        lines.append(f"EXAMPLE {i}:")
        lines.append(f"Title: {ex['title']}")
        lines.append("Content:")
        for point in ex['content_lines']:
            lines.append(f"- {point}")
        lines.append("")
    
    lines.append(
        "Now generate NEW, ORIGINAL content following the same style, "
        "quality, vocabulary level, and topic focus as these examples. "
        "Do NOT copy or closely paraphrase any example — create fresh content."
    )
    
    return "\n".join(lines)


def format_post_examples(examples: list[dict]) -> str:
    """Format post examples for prompt injection. Replaces CAROUSEL_SLIDE_EXAMPLES."""
    if not examples:
        return ""
    
    lines = [
        "Here are examples of the exact style of carousel posts to generate.",
        "Match the depth, tone, and educational quality of these examples:",
        ""
    ]
    
    for i, ex in enumerate(examples, 1):
        lines.append(f"EXAMPLE POST {i}:")
        lines.append(f"Title: {ex['title']}")
        for j, slide in enumerate(ex['slides'], 1):
            lines.append(f"Slide {j}: {slide}")
        lines.append("")
    
    lines.append(
        "Now generate NEW, ORIGINAL posts following the same style, "
        "quality, and topic depth as these examples. "
        "Each post must cover a DIFFERENT topic."
    )
    
    return "\n".join(lines)
```

#### Before/After — Post Prompt with Examples

```python
# ❌ BEFORE: Hardcoded 15 carousel examples (all health)
prompt = f"""You are a health content creator for InLight...
...
### CAROUSEL SLIDE EXAMPLES:
{CAROUSEL_SLIDE_EXAMPLES}  # ← 15 hardcoded health examples, ~2000 tokens
...
"""

# ✅ AFTER: User examples replace hardcoded ones
def build_post_content_prompt(count: int, ctx: PromptContext, ...) -> str:
    # Examples section — user examples if available, else hardcoded fallback
    if ctx.post_examples:
        examples_section = format_post_examples(ctx.post_examples)
    else:
        examples_section = CAROUSEL_SLIDE_EXAMPLES  # Legacy fallback
    
    prompt = f"""You are a {ctx.niche_name.lower()} content creator for {ctx.parent_brand_name}...
...
### REFERENCE EXAMPLES:
{examples_section}
...
"""
```

### 3.6 Example Count Impact

| Examples Provided | Expected Quality | Description |
|:-:|:-:|---|
| 0 | Baseline | System uses hardcoded defaults or no examples. AI relies on instructions only. |
| 1–3 | Improved | AI gets basic style direction. Better than nothing but limited pattern recognition. |
| 4–7 | Good | AI can identify consistent patterns in style, vocabulary, and depth. |
| 8–12 | Very Good | Strong few-shot learning. AI reliably mimics the content style. |
| 13–20 | Excellent | Robust pattern matching. AI output is highly consistent with examples. |

---

## PART 4: FORMAT PROTECTION — HARD BOUNDARIES

> Users control WHAT the content is about. The system controls HOW content is formatted. These boundaries are **architecturally enforced** — not just policy.

### 4.1 Hard-Locked Format Rules (NEVER User-Editable)

These rules are hardcoded in `prompt_templates.py` and are NOT stored in `niche_config`, NOT exposed in the UI, and NOT included in `PromptContext`:

| Rule | Value | Why Fixed |
|------|-------|-----------|
| Carousel slide count | Always 8 slides | Konva render layout depends on it |
| Title format | Always ALL CAPS | Instagram visual format requirement |
| Reel word limit per line | Max 18 words | PIL text rendering would overflow |
| Reel content line count | System-determined (5–8 based on format) | Quality scorer validates this range |
| Caption structure | AI paragraph + follow + save + CTA + disclaimer + hashtags | Publishing pipeline assembles this |
| Video specs | 1080×1920, 7-8s, H.264 | Platform requirements |
| Image dimensions | 1080×1920 (reels), 1088×1360 (posts) | Platform aspect ratios |
| "No text in images" suffix | Always appended to image prompts | AI image generation requirement |
| DOI reference requirement | Posts must cite a real DOI | Content credibility policy |
| "Never use em dashes" | Enforced in quality gate | Rendering compatibility |
| No emojis in reel content | Quality scorer rejects them | Text overlay rendering |
| JSON output format | Strict schema required | Parser depends on exact structure |
| Quality score thresholds | 80 accept / 65 retry / <65 reject | System integrity |
| Plausibility blacklist | "cure", "guaranteed", "miracle" | Legal safety |

### 4.2 Architectural Enforcement

The separation of content (user-controlled) and format (system-controlled) is enforced at the code level:

```python
def build_prompt(ctx: PromptContext) -> str:
    """
    Prompt assembly has 3 clearly separated layers.
    The FORMAT layer is ALWAYS hardcoded and comes AFTER user content,
    ensuring format rules override any conflicting user text.
    """
    
    # ─── LAYER 1: EXAMPLES (from user) ────────────────────────────
    # Placed FIRST for maximum few-shot influence on content style.
    examples_section = format_reel_examples(ctx.reel_examples)
    
    # ─── LAYER 2: CONTENT (from user's PromptContext) ─────────────
    # Defines WHAT the content is about.
    content_section = f"""
    Niche: {ctx.niche_description}
    Target Audience: {ctx.target_audience}
    Topics: {', '.join(ctx.topic_categories)}
    Tone: {ctx.tone_string}
    Content Philosophy: {ctx.content_philosophy}
    """
    
    # ─── LAYER 3: FORMAT (HARDCODED, never from user config) ──────
    # Defines HOW content is structured. Uses "STRICT" / "non-negotiable"
    # language that the LLM treats as higher-priority than user content.
    format_section = """
    STRICT FORMAT RULES (non-negotiable):
    - Title: ALL CAPS, 6-14 words
    - Content: exactly 5-7 content lines
    - Each line: maximum 18 words
    - No emojis, no hashtags, no numbered lists
    - No CTA lines (added separately by system)
    - No em dashes (—)
    - Output ONLY valid JSON, no markdown, no explanations
    
    JSON OUTPUT:
    {
      "title": "YOUR ALL CAPS TITLE HERE",
      "content_lines": ["point 1", "point 2", ...],
      "format_style": "FORMAT_NAME"
    }
    """
    
    return f"{examples_section}\n{content_section}\n{format_section}"
```

### 4.3 Why Format Rules Come AFTER Content

LLMs give higher weight to instructions that appear later in the prompt (recency bias). By placing format rules AFTER user content:

1. If user content accidentally contains format-like text (e.g., "make slides 2 only"), the hardcoded format rules override it.
2. The "STRICT" / "non-negotiable" language signals the LLM to treat these as inviolable constraints.
3. The JSON output schema is the final instruction — the LLM's last reference before generating.

```
┌───────────────────────────────────────────────────────┐
│  Prompt order (top to bottom):                        │
│                                                       │
│  1. System role           → sets persona              │
│  2. User examples         → anchors style/content     │
│  3. Content context       → niche, audience, topics   │
│  4. FORMAT RULES (STRICT) → overrides any conflicts   │
│  5. JSON output schema    → final instruction         │
│                                                       │
│  If user writes "use short 2-slide format" in a       │
│  text field, the FORMAT RULES still enforce 8 slides. │
└───────────────────────────────────────────────────────┘
```

### 4.4 Input Validation & Sanitization

Even though the architecture prevents format override, we add defense-in-depth:

**Backend validation (on save):**
- `niche_config` text fields are stripped of format-like patterns before storage
- Maximum character limits on all text fields (prevents prompt injection via extremely long text)
- Examples are validated: title must be ALL CAPS, content_lines/slides arrays must be non-empty strings

**Why the UI itself is the best defense:**
- The UI provides NO format-related fields — there's literally no way for the user to specify format preferences
- All user input goes through structured fields (tag chips, dropdowns, validated textareas)
- There is no "raw prompt" textarea where a user could sneak in format instructions

### 4.5 PromptContext Has NO Format Fields

The `PromptContext` dataclass contains **only content/niche fields** — no format rules:

```python
@dataclass
class PromptContext:
    # ✅ Content fields (user-configurable)
    niche_name: str
    niche_description: str
    target_audience: str
    topic_categories: List[str]
    content_tone: List[str]
    reel_examples: List[dict]       # NEW
    post_examples: List[dict]       # NEW
    # ... other content fields ...
    
    # ❌ NOT in PromptContext (hardcoded in prompt_templates.py):
    # - title_format (always ALL CAPS)
    # - max_words_per_line (always 18)
    # - slide_count (always 8)
    # - json_output_schema
    # - image_dimensions
    # - video_specs
    # - quality_thresholds
```

---

## PART 5: DATA MODEL

### 5.1 New `niche_config` Table

```sql
CREATE TABLE niche_config (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     VARCHAR(100) NOT NULL,
    
    -- Scope: NULL brand_id = global, non-NULL = per-brand override
    brand_id    VARCHAR(50) REFERENCES brands(id) ON DELETE CASCADE,
    
    -- Core Identity
    niche_name          VARCHAR(100) NOT NULL DEFAULT 'Health & Wellness',
    niche_description   TEXT DEFAULT 'viral short-form health content',
    target_audience     VARCHAR(255) DEFAULT 'U.S. women aged 35+',
    audience_description TEXT DEFAULT 'Women 35+ interested in healthy aging, energy, hormones, and longevity',
    content_tone        JSONB DEFAULT '["calm", "authoritative", "educational", "empowering"]',
    tone_avoid          JSONB DEFAULT '["clinical", "salesy", "aggressive"]',
    
    -- Topic Configuration
    topic_categories    JSONB DEFAULT '["superfoods", "supplements", "sleep rituals", "gut health", "hormones", "hydration", "brain health", "heart health", "stress management", "morning routines", "skin health", "blood sugar", "cortisol", "strength training", "fiber", "electrolytes", "teas and drinks", "walking and movement"]',
    topic_keywords      JSONB DEFAULT '["habits", "symptoms", "food", "sleep", "aging", "body signals"]',
    topic_avoid         JSONB DEFAULT '[]',
    
    -- Content Philosophy
    content_philosophy  TEXT DEFAULT '60% validating (things audience suspects are true), 40% surprising (new revelations that feel plausible)',
    hook_themes         JSONB DEFAULT '["curiosity", "fear of missing out", "authority", "hope", "sense of control"]',
    
    -- ═══════════════════════════════════════════
    -- USER EXAMPLES (NEW in v2 — highest-impact feature)
    -- ═══════════════════════════════════════════
    reel_examples       JSONB DEFAULT '[]',
    -- Array of {title: string, content_lines: string[]}
    -- Max 20 examples. CTA is NOT included (auto-appended by system).
    
    post_examples       JSONB DEFAULT '[]',
    -- Array of {title: string, slides: string[]}
    -- Max 20 examples. Replaces hardcoded CAROUSEL_SLIDE_EXAMPLES when non-empty.
    
    -- Visual Configuration (per-brand relevant)
    image_style_description TEXT DEFAULT 'Soft, minimal, calming wellness aesthetic. Bright modern kitchen or clean lifestyle setting. Neutral tones, gentle morning sunlight.',
    image_palette_keywords  JSONB DEFAULT '["turmeric", "green smoothie", "yoga mat", "fresh herbs"]',
    
    -- Brand Personality (per-brand relevant)
    brand_personality   TEXT,
    brand_focus_areas   JSONB DEFAULT '[]',
    
    -- Parent brand name (for prompts that reference "InLight")
    parent_brand_name   VARCHAR(100) DEFAULT 'InLight',
    
    -- CTA Configuration
    cta_options         JSONB DEFAULT '[
        {"label": "follow_tips", "text": "If you found this helpful, follow for more daily tips on nutrition, health, and natural wellness strategies."},
        {"label": "sleep_lean", "text": "Comment LEAN for details about Sleep Lean, a targeted nighttime formula designed to support fat loss while you sleep."},
        {"label": "workout_plan", "text": "Comment PLAN for our complete workout and nutrition plan designed for fat loss and muscle growth."}
    ]',
    hashtags            JSONB DEFAULT '["#health", "#wellness", "#habits", "#interestingfacts", "#naturalhealing", "#healthtips", "#holistichealth"]',
    
    -- Caption sections
    follow_section_text TEXT DEFAULT 'research-informed content on whole-body health, natural approaches to healing, digestive health support, and long-term wellness strategies centered on nutrition and prevention',
    save_section_text   TEXT DEFAULT 'improving their health, energy levels, metabolic balance, and long-term vitality through natural methods',
    disclaimer_text     TEXT DEFAULT 'This content is intended for educational and informational purposes only and should not be considered medical advice. It is not designed to diagnose, treat, cure, or prevent any medical condition. Always consult a qualified healthcare professional before making dietary, medication, or lifestyle changes, particularly if you have existing health conditions. Individual responses may vary.',
    
    -- Timestamps
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one global + one per brand per user
    UNIQUE(user_id, brand_id)
);

-- Indexes
CREATE INDEX idx_niche_config_user ON niche_config(user_id);
CREATE INDEX idx_niche_config_brand ON niche_config(brand_id);
```

### 5.2 Key Design Decisions

**Why a separate table, not expanding `brands` or `app_settings`?**

- `brands` is per-brand only — no global config concept
- `app_settings` is a flat key-value store — JSONB arrays and nested objects don't fit well
- A dedicated table allows a clean global+override pattern: `brand_id IS NULL` = global, `brand_id = 'xyz'` = per-brand override
- Easier to add fields as the system evolves

**Why does `brand_id NULL` mean global?**

The merge pattern: query global config WHERE `brand_id IS NULL`, then overlay any per-brand config WHERE `brand_id = ?`. Per-brand rows only need non-NULL values for fields they want to override — everything else falls through to global.

**Why JSONB for examples?**

- JSONB supports efficient indexing and querying in PostgreSQL
- No need for separate `reel_examples` or `post_examples` tables — the data is always loaded as a whole
- Maximum 20 examples means the JSONB column stays small (~10-50KB)
- Supabase handles JSONB natively

### 5.3 Default Values = Current Hardcoded Values

Every default in the table schema above matches what's currently hardcoded. This means:

- **Zero breaking changes** on first deployment
- Existing content generation produces identical results
- Users only see differences when they actively edit settings
- `reel_examples` and `post_examples` default to empty arrays — the system falls back to hardcoded examples until the user provides their own

### 5.4 Example Validation Rules

```python
# Backend validation for examples (in API route handler)

EXAMPLE_LIMITS = {
    "max_reel_examples": 20,
    "max_post_examples": 20,
    "max_content_lines_per_reel": 15,
    "max_slides_per_post": 15,
    "max_title_length": 200,
    "max_line_length": 500,
}

def validate_reel_examples(examples: list) -> list:
    """Validate and sanitize reel examples."""
    if len(examples) > EXAMPLE_LIMITS["max_reel_examples"]:
        raise ValueError(f"Maximum {EXAMPLE_LIMITS['max_reel_examples']} reel examples allowed")
    
    validated = []
    for ex in examples:
        if not ex.get("title") or not ex.get("content_lines"):
            continue  # Skip incomplete examples
        title = ex["title"].strip()[:EXAMPLE_LIMITS["max_title_length"]]
        lines = [
            line.strip()[:EXAMPLE_LIMITS["max_line_length"]]
            for line in ex["content_lines"][:EXAMPLE_LIMITS["max_content_lines_per_reel"]]
            if line.strip()
        ]
        if title and lines:
            validated.append({"title": title, "content_lines": lines})
    
    return validated


def validate_post_examples(examples: list) -> list:
    """Validate and sanitize post examples."""
    if len(examples) > EXAMPLE_LIMITS["max_post_examples"]:
        raise ValueError(f"Maximum {EXAMPLE_LIMITS['max_post_examples']} post examples allowed")
    
    validated = []
    for ex in examples:
        if not ex.get("title") or not ex.get("slides"):
            continue
        title = ex["title"].strip()[:EXAMPLE_LIMITS["max_title_length"]]
        slides = [
            slide.strip()[:EXAMPLE_LIMITS["max_line_length"]]
            for slide in ex["slides"][:EXAMPLE_LIMITS["max_slides_per_post"]]
            if slide.strip()
        ]
        if title and slides:
            validated.append({"title": title, "slides": slides})
    
    return validated
```

---

## PART 6: BACKEND ARCHITECTURE

### 6A. PromptContext Dataclass

A single object that aggregates all niche config and gets passed to every prompt builder. Replaces the scattered hardcoded strings.

```python
# app/core/prompt_context.py

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class PromptContext:
    """
    Aggregated niche configuration passed to all prompt builders.
    
    Constructed by NicheConfigService from global + per-brand config.
    Every prompt function receives this instead of reaching for hardcoded strings.
    
    NOTE: This dataclass contains ONLY content/niche fields.
    Format rules (ALL CAPS, word limits, slide counts, JSON schema)
    are NEVER stored here — they remain hardcoded in prompt_templates.py.
    """
    # Core Identity
    niche_name: str = "Health & Wellness"
    niche_description: str = "viral short-form health content"
    target_audience: str = "U.S. women aged 35+"
    audience_description: str = "Women 35+ interested in healthy aging, energy, hormones, and longevity"
    content_tone: List[str] = field(default_factory=lambda: ["calm", "authoritative", "educational", "empowering"])
    tone_avoid: List[str] = field(default_factory=lambda: ["clinical", "salesy", "aggressive"])
    
    # Topic Configuration
    topic_categories: List[str] = field(default_factory=lambda: [
        "superfoods", "supplements", "sleep rituals", "gut health", "hormones",
        "hydration", "brain health", "heart health", "stress management",
        "morning routines", "skin health", "blood sugar", "cortisol",
        "strength training", "fiber", "electrolytes", "teas and drinks",
        "walking and movement"
    ])
    topic_keywords: List[str] = field(default_factory=lambda: [
        "habits", "symptoms", "food", "sleep", "aging", "body signals"
    ])
    topic_avoid: List[str] = field(default_factory=list)
    
    # Content Philosophy
    content_philosophy: str = "60% validating (things audience suspects are true), 40% surprising (new revelations that feel plausible)"
    hook_themes: List[str] = field(default_factory=lambda: ["curiosity", "fear of missing out", "authority", "hope", "sense of control"])
    
    # ═══════════════════════════════════════════════════════════
    # USER EXAMPLES (NEW in v2)
    # ═══════════════════════════════════════════════════════════
    reel_examples: List[dict] = field(default_factory=list)
    # Each: {"title": "ALL CAPS TITLE", "content_lines": ["line1", "line2", ...]}
    # Max 20. CTA is auto-appended — not in examples.
    
    post_examples: List[dict] = field(default_factory=list)
    # Each: {"title": "ALL CAPS TITLE", "slides": ["slide1 text", "slide2 text", ...]}
    # Max 20. Replaces CAROUSEL_SLIDE_EXAMPLES when non-empty.
    
    # Visual Style
    image_style_description: str = "Soft, minimal, calming wellness aesthetic. Bright modern kitchen or clean lifestyle setting. Neutral tones, gentle morning sunlight."
    image_palette_keywords: List[str] = field(default_factory=lambda: ["turmeric", "green smoothie", "yoga mat", "fresh herbs"])
    
    # Brand Personality
    brand_personality: Optional[str] = None
    brand_focus_areas: List[str] = field(default_factory=list)
    parent_brand_name: str = "InLight"
    
    # CTA/Caption
    cta_options: List[dict] = field(default_factory=list)
    hashtags: List[str] = field(default_factory=lambda: [
        "#health", "#wellness", "#habits", "#interestingfacts",
        "#naturalhealing", "#healthtips", "#holistichealth"
    ])
    follow_section_text: str = "research-informed content on whole-body health, natural approaches to healing, digestive health support, and long-term wellness strategies centered on nutrition and prevention"
    save_section_text: str = "improving their health, energy levels, metabolic balance, and long-term vitality through natural methods"
    disclaimer_text: str = "This content is intended for educational and informational purposes only and should not be considered medical advice."

    # ─── Derived / computed ───
    
    @property
    def tone_string(self) -> str:
        return ", ".join(self.content_tone)
    
    @property
    def tone_avoid_string(self) -> str:
        return ", ".join(self.tone_avoid)
    
    @property
    def topic_framing(self) -> str:
        return ", ".join(self.topic_keywords[:6])
    
    @property
    def hashtag_string(self) -> str:
        return " ".join(self.hashtags)
    
    @property
    def has_reel_examples(self) -> bool:
        return len(self.reel_examples) > 0
    
    @property
    def has_post_examples(self) -> bool:
        return len(self.post_examples) > 0
    
    @property
    def example_count(self) -> int:
        return len(self.reel_examples) + len(self.post_examples)
```

### 6B. Template Variable Injection — Before/After Examples

#### Example 1: SYSTEM_PROMPT

```python
# ❌ BEFORE (prompt_templates.py, line 62)
SYSTEM_PROMPT = """You are a viral short-form health content generator.

TASK:
Generate original Instagram/TikTok reel ideas that match proven viral health patterns...

CORE RULES:
- Use familiar health framing (habits, symptoms, food, sleep, aging, body signals)
...
CONTENT PHILOSOPHY:
- 60% validating (things audience suspects are true)
- 40% surprising (new revelation that feels plausible)
- Use familiar foods, habits, and symptoms
..."""

# ✅ AFTER
def build_system_prompt(ctx: PromptContext) -> str:
    return f"""You are a viral short-form {ctx.niche_name} content generator.

TASK:
Generate original Instagram/TikTok reel ideas that match proven viral {ctx.niche_name.lower()} patterns without copying any known content.

CORE RULES:
- Use familiar {ctx.niche_name.lower()} framing ({ctx.topic_framing})
- Optimize for emotional hooks: {', '.join(ctx.hook_themes)}
- Keep language {ctx.tone_string}
- Avoid {ctx.tone_avoid_string} language
- Each content line must be under 18 words

CONTENT PHILOSOPHY:
- {ctx.content_philosophy}
- Use familiar topics and vocabulary
- Plausible > precise (this is social content, not textbooks)

FORMATTING:
- Titles in ALL CAPS
- One format style per reel (do not mix)
- No emojis, hashtags, or disclaimers
- No CTA (call-to-action) - it's added separately
- No numbered lists (numbers added by system)

You generate content that feels familiar, not repeated.
Output ONLY valid JSON, no markdown, no explanations."""
```

#### Example 2: build_runtime_prompt() with reel examples injection

```python
# ✅ AFTER — reel examples injected before generation parameters
def build_runtime_prompt(ctx: PromptContext, topic: str, format_name: str, 
                          hook_type: str, point_count: int, ...) -> str:
    prompt_parts = []
    
    # LAYER 1: User examples (few-shot) — placed FIRST for maximum influence
    if ctx.has_reel_examples:
        prompt_parts.append(format_reel_examples(ctx.reel_examples))
        prompt_parts.append("")
    
    # LAYER 2: Content context
    prompt_parts.append(f"""Generate viral {ctx.niche_name.lower()} content with these parameters:

TOPIC: {topic}
TARGET AUDIENCE: {ctx.target_audience}
FORMAT STYLE: {format_name} (max {max_words} words per line)
HOOK TYPE: {hook_type}
POINTS: exactly {point_count} content points""")
    
    # LAYER 3: Format rules (HARDCODED)
    prompt_parts.append("""
STRICT FORMAT RULES (non-negotiable):
- Title: ALL CAPS, 6-14 words
- Each content line: max 18 words
- No emojis, no hashtags, no numbered lists
- No CTA lines
- Output ONLY valid JSON""")
    
    return "\n".join(prompt_parts)
```

#### Example 3: build_post_content_prompt() — examples replace CAROUSEL_SLIDE_EXAMPLES

```python
# ❌ BEFORE (prompt_templates.py)
prompt = f"""You are a health content creator for InLight...
...
### CAROUSEL SLIDE EXAMPLES:
{CAROUSEL_SLIDE_EXAMPLES}  # 15 hardcoded health examples
...
### BRAND CONTEXT: {brand_desc}
### ADDITIONAL INSTRUCTIONS: {posts_prompt}"""

# ✅ AFTER
def build_post_content_prompt(count: int, ctx: PromptContext, ...) -> str:
    # Build examples section
    if ctx.has_post_examples:
        examples_section = format_post_examples(ctx.post_examples)
    else:
        examples_section = CAROUSEL_SLIDE_EXAMPLES  # Legacy fallback
    
    topic_list = "\n".join(
        f"{i+1}. {topic}" for i, topic in enumerate(ctx.topic_categories)
    )
    
    prompt = f"""You are a {ctx.niche_name.lower()} content creator for {ctx.parent_brand_name}, targeting {ctx.target_audience}.

Generate EXACTLY {count} COMPLETELY DIFFERENT {ctx.niche_name.lower()}-focused posts.

### TARGET AUDIENCE:
{ctx.audience_description}

### TOPIC CATEGORIES (choose different ones):
{topic_list}

### REFERENCE EXAMPLES:
{examples_section}

### STRICT FORMAT RULES (non-negotiable):
- Title: 8-14 words, ALL CAPS, no period at end
- Caption: 4-5 paragraphs, warm and educational
- Slides: 8 slides per post
- Source: Real DOI reference required
- Disclaimer required at end of caption
- No emojis in caption body
- Output as JSON array
"""
    return prompt
```

#### Example 4: ContentDifferentiator — Brand Personality

```python
# ❌ BEFORE (differentiator.py)
brand_hints = {
    "healthycollege": "natural health, whole foods, healthy habits, wellness lifestyle",
    "vitalitycollege": "energy, vitality, metabolism, active performance, vigor",
    ...
}

# ✅ AFTER
def _get_brand_hint(self, brand_id: str) -> str:
    ctx = self.niche_config_service.get_context(brand_id=brand_id)
    if ctx.brand_personality:
        return ctx.brand_personality
    return ctx.niche_description
```

### 6C. NicheConfigService

```python
# app/services/content/niche_config_service.py

from typing import Optional
from datetime import datetime, timedelta
from app.core.prompt_context import PromptContext


class NicheConfigService:
    """
    Loads, merges, and caches niche configuration.
    
    Strategy:
    1. Load global config (brand_id IS NULL)
    2. Load per-brand config (brand_id = ?)
    3. Merge: per-brand values override global values (non-NULL fields only)
    4. Return as PromptContext
    5. Cache with 5-minute TTL
    """
    
    _cache: dict = {}
    _cache_ttl = timedelta(minutes=5)
    _cache_timestamps: dict = {}
    
    def get_context(self, brand_id: Optional[str] = None, user_id: Optional[str] = None) -> PromptContext:
        cache_key = f"{user_id}:{brand_id or 'global'}"
        
        if cache_key in self._cache:
            cached_at = self._cache_timestamps.get(cache_key)
            if cached_at and datetime.utcnow() - cached_at < self._cache_ttl:
                return self._cache[cache_key]
        
        ctx = self._load_and_merge(brand_id, user_id)
        
        self._cache[cache_key] = ctx
        self._cache_timestamps[cache_key] = datetime.utcnow()
        
        return ctx
    
    def invalidate_cache(self, brand_id: Optional[str] = None, user_id: Optional[str] = None):
        if brand_id and user_id:
            self._cache.pop(f"{user_id}:{brand_id}", None)
        if user_id:
            self._cache.pop(f"{user_id}:global", None)
        else:
            self._cache.clear()
            self._cache_timestamps.clear()
    
    def _load_and_merge(self, brand_id: Optional[str], user_id: Optional[str]) -> PromptContext:
        from app.db_connection import get_db_session
        from app.models.niche_config import NicheConfig
        
        ctx = PromptContext()  # Defaults = current hardcoded values
        
        try:
            with get_db_session() as db:
                global_cfg = (
                    db.query(NicheConfig)
                    .filter(NicheConfig.user_id == user_id, NicheConfig.brand_id.is_(None))
                    .first()
                )
                
                if global_cfg:
                    ctx = self._apply_config(ctx, global_cfg)
                
                if brand_id:
                    brand_cfg = (
                        db.query(NicheConfig)
                        .filter(NicheConfig.user_id == user_id, NicheConfig.brand_id == brand_id)
                        .first()
                    )
                    if brand_cfg:
                        ctx = self._apply_config(ctx, brand_cfg)
        
        except Exception as e:
            print(f"Warning: Could not load niche config, using defaults: {e}")
        
        return ctx
    
    def _apply_config(self, ctx: PromptContext, cfg) -> PromptContext:
        field_map = {
            'niche_name': 'niche_name',
            'niche_description': 'niche_description',
            'target_audience': 'target_audience',
            'audience_description': 'audience_description',
            'content_tone': 'content_tone',
            'tone_avoid': 'tone_avoid',
            'topic_categories': 'topic_categories',
            'topic_keywords': 'topic_keywords',
            'topic_avoid': 'topic_avoid',
            'content_philosophy': 'content_philosophy',
            'hook_themes': 'hook_themes',
            'reel_examples': 'reel_examples',       # NEW
            'post_examples': 'post_examples',       # NEW
            'image_style_description': 'image_style_description',
            'image_palette_keywords': 'image_palette_keywords',
            'brand_personality': 'brand_personality',
            'brand_focus_areas': 'brand_focus_areas',
            'parent_brand_name': 'parent_brand_name',
            'cta_options': 'cta_options',
            'hashtags': 'hashtags',
            'follow_section_text': 'follow_section_text',
            'save_section_text': 'save_section_text',
            'disclaimer_text': 'disclaimer_text',
        }
        
        for db_field, ctx_field in field_map.items():
            val = getattr(cfg, db_field, None)
            if val is not None:
                setattr(ctx, ctx_field, val)
        
        return ctx


# Singleton
_instance = None

def get_niche_config_service() -> NicheConfigService:
    global _instance
    if _instance is None:
        _instance = NicheConfigService()
    return _instance
```

### 6D. Migration Strategy

#### Step 1: Additive-only database changes

- Create `niche_config` table with all columns (including `reel_examples` and `post_examples`) having defaults matching current hardcoded values.
- Run `INSERT INTO niche_config (user_id, brand_id) VALUES (?, NULL)` for each existing user to seed global config with defaults.
- **No existing tables modified. No columns removed.**

#### Step 2: Backend reads from PromptContext, falls back to defaults

```python
def build_system_prompt(ctx: PromptContext = None) -> str:
    if ctx is None:
        ctx = PromptContext()  # defaults match current hardcoded values
    ...
```

- If `niche_config` table is empty or unreachable → `PromptContext()` defaults are used → **identical to current behavior**.
- If `reel_examples` / `post_examples` are empty → system uses hardcoded `CAROUSEL_SLIDE_EXAMPLES` as fallback.

#### Step 3: Gradual replacement

Replace hardcoded strings with `ctx.{field}` references **one file at a time**, running integration tests after each file:

```
1. prompt_templates.py — SYSTEM_PROMPT, build_runtime_prompt, build_post_content_prompt
   → Also: inject reel_examples and post_examples into prompt assembly
2. generator.py — generate_post_title, fallback content  
3. differentiator.py — brand_hints
4. caption_generator.py — brand handles, CTA text
5. quality_scorer.py — health keywords → niche keywords
6. viral_patterns.py — topic buckets
7. tracker.py — topic buckets (consolidate with viral_patterns)
```

#### Step 4: Frontend migration

The existing `ContentPromptsCard` (3 textareas) continues working during migration. The new `NicheConfigForm` is built alongside it and replaces it once complete.

**The old `reels_prompt`, `posts_prompt`, `brand_description` keys in `app_settings` are kept for backward compatibility:**

```python
# In NicheConfigService._load_and_merge():
if global_cfg is None:
    legacy = get_content_prompts()
    if legacy.get('brand_description'):
        ctx.niche_description = legacy['brand_description']
```

---

## PART 7: FRONTEND ARCHITECTURE

### 7A. New "Content DNA" Page Redesign

The current 3-textarea `ContentPromptsCard` is replaced with a structured form. The page is renamed from "Content Prompts" to **"Content DNA"** (see Part 8 for UX education details).

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  🧬 Content DNA                                     [Save]   │
│  Define what your AI-generated content is about.             │
│  These settings control every reel, post, and visual.        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Configuration Strength: ████████████░░░  GOOD           │  │
│  │ 5 fields + 3 examples — add more examples to improve   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📍 NICHE & AUDIENCE                        [always open] │
│  │  ℹ️ These define your content's core identity            │  │
│  │                                                        │  │
│  │  Niche Name     [Health & Wellness          ▾]         │  │
│  │                  (dropdown with suggestions + custom)   │  │
│  │                                                        │  │
│  │  Niche Desc.    [viral short-form health content    ]   │  │
│  │                                                        │  │
│  │  Target Audience [U.S. women aged 35+              ]   │  │
│  │                                                        │  │
│  │  Audience        [Women 35+ interested in healthy   ]  │  │
│  │  Description     [aging, energy, hormones, and      ]  │  │
│  │                  [longevity.                         ]  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📂 TOPICS & CATEGORIES                   [▸ expand]    │  │
│  │  ℹ️ What subjects your reels and posts cover             │  │
│  │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  │
│  │  Topic Categories:                                     │  │
│  │  [superfoods] [supplements] [sleep] [gut health] [+]   │  │
│  │                                                        │  │
│  │  Keywords to Emphasize:                                │  │
│  │  [habits] [symptoms] [food] [sleep] [aging] [+]        │  │
│  │                                                        │  │
│  │  Topics to Avoid:                                      │  │
│  │  [+  Add tag...]                                       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🎨 TONE & STYLE                          [▸ expand]    │  │
│  │  ℹ️ The voice and personality of your content            │  │
│  │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  │
│  │  Content Tone (select):                                │  │
│  │  [●calm] [●authoritative] [●educational] [○casual]     │  │
│  │  [○energetic] [●empowering] [○scientific] [○friendly]  │  │
│  │                                                        │  │
│  │  Tone to Avoid:                                        │  │
│  │  [●clinical] [●salesy] [●aggressive] [○academic]       │  │
│  │  [○poetic] [○overly creative]                          │  │
│  │                                                        │  │
│  │  Content Philosophy:                                   │  │
│  │  [60% validating, 40% surprising               ]       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📝 CONTENT EXAMPLES                      [▸ expand]    │  │
│  │  ℹ️ The AI learns directly from your examples.          │  │
│  │  Providing 10+ examples dramatically improves quality.  │  │
│  │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  │
│  │                                                        │  │
│  │  ── Reel Examples (3 of 20) ──────────────────────     │  │
│  │  ℹ️ CTA is automatically added as the final line —     │  │
│  │     don't include it here.                              │  │
│  │                                                        │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │ ▾ Example 1                                      │  │  │
│  │  │   Title: [SIGNS YOUR BODY IS BEGGING FOR MAG... ]│  │  │
│  │  │   Lines:                                         │  │  │
│  │  │     1. [Muscle cramps that wake you up at night ]│  │  │
│  │  │     2. [Constant fatigue even after sleeping 8h ]│  │  │
│  │  │     3. [Eye twitches that won't go away         ]│  │  │
│  │  │     4. [Sugar cravings that feel uncontrollable ]│  │  │
│  │  │     [+ Add line]                         [🗑️]    │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │ ▸ Example 2 — "WHAT HAPPENS WHEN YOU EAT TUR..."│  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │ ▸ Example 3 — "THESE 5 MORNING HABITS ARE AG..." │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  │  [+ Add Reel Example]                                  │  │
│  │                                                        │  │
│  │  ── Post Examples (2 of 20) ──────────────────────     │  │
│  │                                                        │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │ ▸ Example 1 — "WHY COLLAGEN SUPPLEMENTS MIGHT..."│  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │ ▸ Example 2 — "THE TRUTH ABOUT INTERMITTENT..."  │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  │  [+ Add Post Example]                                  │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🖼️ VISUAL STYLE                          [▸ expand]    │  │
│  │  ℹ️ Controls the look and feel of generated images      │  │
│  │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  │
│  │  Image Style:                                          │  │
│  │  [Soft, minimal, calming wellness aesthetic.    ]       │  │
│  │  [Bright modern kitchen or clean lifestyle...   ]       │  │
│  │                                                        │  │
│  │  Image Palette Keywords:                               │  │
│  │  [turmeric] [green smoothie] [yoga mat] [+]            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🏷️ BRAND IDENTITY                        [▸ expand]    │  │
│  │      (per-brand only — not shown on global config)     │  │
│  │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  │
│  │  Brand Personality:                                    │  │
│  │  [natural health, whole foods, healthy habits   ]       │  │
│  │                                                        │  │
│  │  Focus Areas:                                          │  │
│  │  [daily habits] [practical tips] [+]                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 💬 CTAs & HASHTAGS                        [▸ expand]    │  │
│  │  ℹ️ Calls-to-action and discovery tags                  │  │
│  │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  │
│  │  CTA Options:                                          │  │
│  │  ┌─────────────────────────────────────────────────┐   │  │
│  │  │ follow_tips: "If you found this helpful..."  [✎]│   │  │
│  │  │ sleep_lean:  "Comment LEAN for details..."   [✎]│   │  │
│  │  │                                     [+ Add CTA] │   │  │
│  │  └─────────────────────────────────────────────────┘   │  │
│  │                                                        │  │
│  │  Hashtags:                                             │  │
│  │  [#health] [#wellness] [#habits] [#healthtips] [+]     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │           [Preview Prompt]                              │  │
│  │  Shows the final assembled prompt (read-only)          │  │
│  │  so users see how their fields affect the AI output.   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 7B. Global vs Per-Brand Settings

#### On the Brands page → Content DNA tab

Shows the **global** niche config. All fields visible. This is the default for all brands.

#### On individual brand settings (modal or per-brand page)

Each section has a **"Use global defaults" toggle** (on by default). Unchecking reveals brand-specific fields:

```
┌─────────────────────────────────────────────┐
│  Brand: THE HEALTHY COLLEGE                  │
│                                              │
│  ☑ Use global niche & audience               │
│    (Niche: Health & Wellness)                │
│                                              │
│  ☐ Use global tone & style                   │
│    ┌────────────────────────────────────┐    │
│    │ Content Tone: [●casual] [●friendly]│    │
│    │ (overrides global [calm, formal])  │    │
│    └────────────────────────────────────┘    │
│                                              │
│  ☑ Use global topics                         │
│                                              │
│  ☑ Use global examples                       │
│                                              │
│  ☐ Use global brand identity                 │
│    ┌────────────────────────────────────┐    │
│    │ Personality: natural health, whole │    │
│    │   foods, healthy habits            │    │
│    │ Focus: [daily habits] [practical]  │    │
│    └────────────────────────────────────┘    │
│                                              │
│  ☑ Use global CTAs & hashtags                │
│                                              │
│                                    [Save]    │
└─────────────────────────────────────────────┘
```

### 7C. TypeScript Interfaces

```typescript
// src/features/brands/types/niche-config.ts

export interface ReelExample {
  title: string           // ALL CAPS
  content_lines: string[] // 1-15 lines, CTA not included
}

export interface PostExample {
  title: string    // ALL CAPS
  slides: string[] // 1-15 slide texts
}

export interface NicheConfig {
  id?: string
  brand_id?: string | null  // null = global

  // Core Identity
  niche_name: string
  niche_description: string
  target_audience: string
  audience_description: string
  content_tone: string[]
  tone_avoid: string[]

  // Topics
  topic_categories: string[]
  topic_keywords: string[]
  topic_avoid: string[]

  // Content Philosophy
  content_philosophy: string
  hook_themes: string[]

  // Examples (NEW in v2)
  reel_examples: ReelExample[]  // Max 20
  post_examples: PostExample[]  // Max 20

  // Visual
  image_style_description: string
  image_palette_keywords: string[]

  // Brand Identity
  brand_personality: string | null
  brand_focus_areas: string[]
  parent_brand_name: string

  // CTAs
  cta_options: Array<{ label: string; text: string }>
  hashtags: string[]
  follow_section_text: string
  save_section_text: string
  disclaimer_text: string
}

// Configuration strength calculation
export type ConfigStrength = 'basic' | 'good' | 'excellent'

export function getConfigStrength(config: NicheConfig): ConfigStrength {
  let score = 0
  
  // Core fields (1 point each)
  if (config.niche_name && config.niche_name !== 'Health & Wellness') score++
  if (config.niche_description) score++
  if (config.target_audience) score++
  if (config.audience_description) score++
  if (config.content_tone.length > 0) score++
  if (config.topic_categories.length > 0) score++
  if (config.content_philosophy) score++
  if (config.image_style_description) score++
  
  // Examples (high weight)
  const totalExamples = config.reel_examples.length + config.post_examples.length
  
  if (score <= 2 && totalExamples < 3) return 'basic'
  if (score >= 6 && totalExamples >= 5) return 'excellent'
  return 'good'
}
```

### 7D. API Hooks

```typescript
// src/features/brands/api/use-niche-config.ts

const NICHE_CONFIG_KEY = ['niche-config'] as const

// GET /api/v2/brands/niche-config?brand_id=<optional>
export function useNicheConfig(brandId?: string) {
  return useQuery({
    queryKey: [...NICHE_CONFIG_KEY, brandId ?? 'global'],
    queryFn: () => apiClient.get<NicheConfig>(
      `/api/v2/brands/niche-config${brandId ? `?brand_id=${brandId}` : ''}`
    ),
    staleTime: 5 * 60 * 1000,
  })
}

// PUT /api/v2/brands/niche-config
export function useUpdateNicheConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<NicheConfig> & { brand_id?: string }) =>
      apiClient.put<NicheConfig>('/api/v2/brands/niche-config', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NICHE_CONFIG_KEY })
    },
  })
}

// GET /api/v2/brands/niche-config/preview — returns assembled prompt text
export function usePromptPreview(config: Partial<NicheConfig>) {
  return useQuery({
    queryKey: ['prompt-preview', config],
    queryFn: () => apiClient.post<{ prompt: string }>(
      '/api/v2/brands/niche-config/preview', config
    ),
    enabled: false, // Triggered manually
  })
}
```

### 7E. Content Examples Component

```typescript
// src/features/brands/components/ContentExamplesSection.tsx
// Key component structure (not full implementation)

interface ContentExamplesSectionProps {
  reelExamples: ReelExample[]
  postExamples: PostExample[]
  onReelExamplesChange: (examples: ReelExample[]) => void
  onPostExamplesChange: (examples: PostExample[]) => void
}

/*
  Component structure:
  
  <CollapsibleSection title="Content Examples" icon="📝">
    <HelperText>
      Examples are the most powerful way to guide AI. The more examples 
      you provide, the better the AI understands your content style.
    </HelperText>
    
    <SubSection title="Reel Examples" count={reelExamples.length} max={20}>
      <Note>CTA is automatically added as the final line — don't include it here.</Note>
      
      {reelExamples.map(example => (
        <ExpandableCard 
          key={...}
          preview={example.title}
          expanded={
            <TitleField value={example.title} />
            <DynamicList 
              items={example.content_lines}
              addLabel="Add line"
            />
          }
          onDelete={...}
        />
      ))}
      
      <AddButton 
        label="Add Reel Example" 
        disabled={reelExamples.length >= 20}
      />
    </SubSection>
    
    <SubSection title="Post Examples" count={postExamples.length} max={20}>
      {postExamples.map(example => (
        <ExpandableCard 
          key={...}
          preview={example.title}
          expanded={
            <TitleField value={example.title} />
            <DynamicList 
              items={example.slides}
              addLabel="Add slide"
            />
          }
          onDelete={...}
        />
      ))}
      
      <AddButton 
        label="Add Post Example" 
        disabled={postExamples.length >= 20}
      />
    </SubSection>
  </CollapsibleSection>
*/
```

---

## PART 8: PAGE PURPOSE & USER EDUCATION

> The current "Content Prompts" tab has 3 blank textareas with zero guidance. Users don't understand what to write, how it affects output, or why it matters. This section defines the UX education layer.

### 8.1 Page Header & Naming

**Name change:** "Content Prompts" → **"Content DNA"**

| Element | Content |
|---------|---------|
| **Headline** | "Content DNA" |
| **Subtitle** | "Define what your AI-generated content is about. These settings control the topics, audience, and style of every reel and post generated." |
| **Info banner** | "Your settings here define the DNA of your content. The AI uses these to generate titles, slides, captions, and visuals that match your niche perfectly." |

```
┌──────────────────────────────────────────────────────────────┐
│  🧬 Content DNA                                     [Save]   │
│                                                              │
│  Define what your AI-generated content is about.             │
│  These settings control the topics, audience, and style      │
│  of every reel and post generated.                           │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ℹ️ Your settings here define the DNA of your content.  │  │
│  │ The AI uses these to generate titles, slides, captions,│  │
│  │ and visuals that match your niche perfectly.            │  │
│  └────────────────────────────────────────────────────────┘  │
```

### 8.2 Configuration Strength Meter

A visual indicator that gamifies the setup and encourages users to provide more detail:

```
┌────────────────────────────────────────────────────────────┐
│  Configuration Strength                                    │
│                                                            │
│  ███░░░░░░░░░░░░  BASIC                                   │
│  0-2 fields filled, <3 examples                            │
│  "Add more details and examples to improve content quality"│
│                                                            │
│  ████████████░░░  GOOD                                     │
│  3-5 fields filled                                         │
│  "Good start! Adding examples will take it to the next     │
│   level."                                                  │
│                                                            │
│  ███████████████  EXCELLENT                                │
│  6+ fields + 5+ examples                                   │
│  "Your AI knows exactly what to generate."                 │
└────────────────────────────────────────────────────────────┘
```

**Calculation logic:**

| Level | Criteria | Color | Message |
|-------|----------|-------|---------|
| Basic | 0–2 core fields filled AND fewer than 3 examples | Red | "Add more details and examples to improve content quality" |
| Good | 3–5 core fields filled | Yellow | "Good start! Adding examples will take it to the next level." |
| Excellent | 6+ core fields filled AND 5+ total examples | Green | "Your AI knows exactly what to generate." |

### 8.3 Per-Section Contextual Help

Each collapsible section has an inline helper text (info icon + tooltip or subtitle):

| Section | Helper Text |
|---------|-------------|
| Niche & Audience | "These define your content's core identity — who you're creating for and what your brand is about." |
| Topics & Categories | "These categories determine what subjects your reels and posts cover. Add topics relevant to your niche." |
| Tone & Style | "The voice and personality of your content. Select tones that match how you want your brand to sound." |
| Content Examples | "The AI learns directly from your examples. Providing 10+ examples dramatically improves content relevance and quality." |
| Visual Style | "Controls the look and feel of AI-generated background images for your reels and posts." |
| Brand Identity | "Per-brand personality and focus areas. Only shown for individual brand overrides." |
| CTAs & Hashtags | "Calls-to-action appended to reels and hashtags added to captions for discoverability." |

### 8.4 Empty State Guidance

When a section has no data, show contextual guidance:

```
┌────────────────────────────────────────────────────────────┐
│  📝 CONTENT EXAMPLES                        [▸ expand]     │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        No examples added yet                         │  │
│  │                                                      │  │
│  │  Examples are the most powerful way to guide the AI.  │  │
│  │  Add 5-10 examples of your best reels and posts to    │  │
│  │  dramatically improve content quality and relevance.  │  │
│  │                                                      │  │
│  │  Each example should represent the style, depth, and  │  │
│  │  topic focus you want the AI to replicate.            │  │
│  │                                                      │  │
│  │        [+ Add Your First Reel Example]                │  │
│  │        [+ Add Your First Post Example]                │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## PART 9: IMPLEMENTATION PHASES

### Phase 1: MVP — Core Config + Examples (Do First)

> **Goal:** Make the highest-impact variables dynamic. The examples feature is included in Phase 1 because it is the single highest-impact feature for content quality.

| # | Task | Details |
|---|------|---------|
| 1 | Create `PromptContext` dataclass | `app/core/prompt_context.py` — all fields with defaults matching current hardcoded values, including `reel_examples` and `post_examples` |
| 2 | Create `niche_config` table | Migration script — see Part 5 schema, includes `reel_examples JSONB` and `post_examples JSONB` |
| 3 | Create `NicheConfig` SQLAlchemy model | `app/models/niche_config.py` |
| 4 | Create `NicheConfigService` | `app/services/content/niche_config_service.py` — load, merge, cache |
| 5 | Create example formatting functions | `format_reel_examples()` and `format_post_examples()` in `prompt_context.py` |
| 6 | Wire 5 variables into prompts | Replace hardcoded `niche_description`, `target_audience`, `brand_personality` in `prompt_templates.py` and `generator.py`. Inject `reel_examples` into reel prompt. Inject `post_examples` into post prompt (replacing `CAROUSEL_SLIDE_EXAMPLES` when non-empty). |
| 7 | Add example validation | Backend validation for example structure, limits (20 max), field lengths |
| 8 | Seed defaults for existing users | Migration: insert global config row with defaults, empty examples arrays |
| 9 | Add API endpoints | `GET/PUT /api/v2/brands/niche-config` with examples support |
| 10 | Build Phase 1 frontend | 7 key fields: `niche_name`, `niche_description`, `target_audience`, `audience_description`, `brand_personality`, `parent_brand_name` + **Content Examples section** (reel examples + post examples with add/delete/edit) |
| 11 | Add Configuration Strength meter | Simple bar based on field count + example count |
| 12 | Keep legacy prompts working | `get_content_prompts()` still reads from `app_settings` as fallback |

**Deliverable:** User can change niche name from "Health & Wellness" to "Personal Finance", add 10 reel examples of finance content, and see prompts update with their niche AND their examples injected. The 3 textareas remain functional as a fallback.

### Phase 2: Full Structured Config + UX Polish

> **Goal:** All fields from the data model are wired in and editable. Full UX education layer.

| # | Task | Details |
|---|------|---------|
| 1 | Wire topic_categories | Replace 3 hardcoded topic lists (prompt_templates, viral_patterns, tracker) with `ctx.topic_categories` |
| 2 | Wire content_tone | Replace 14 hardcoded tone references |
| 3 | Wire image_style_description | Replace 22 hardcoded visual style references |
| 4 | Wire CTA options | Consolidate 3 CTA definition files into DB-backed `ctx.cta_options` |
| 5 | Wire hashtags | Replace `DEFAULT_HASHTAGS` and `HASHTAGS` constants |
| 6 | Build full NicheConfigForm | All 7 collapsible sections (including Content Examples), tag inputs, chips |
| 7 | Implement page rename & education | "Content DNA" header, subtitle, info banner, per-section helper text |
| 8 | Build prompt preview | "Preview Prompt" button with backend endpoint |
| 9 | Update quality_scorer.py | Replace health-specific keywords with `ctx.topic_keywords` |
| 10 | Consolidate duplicated topic lists | One source of truth in `PromptContext`, consumed by viral_patterns, tracker, and prompt_templates |

**Deliverable:** Full structured config UI with education layer. All hardcoded niche references replaced with template variables.

### Phase 3: Advanced

> **Goal:** Per-brand overrides, presets, import/export.

| # | Task | Details |
|---|------|---------|
| 1 | Per-brand overrides | "Use global" toggle per section, brand-specific config rows (including per-brand examples) |
| 2 | Preset templates | Pre-built configs: "Health & Wellness", "Personal Finance", "Tech Review", "Fitness", "Cooking" — each with 5 starter examples |
| 3 | Import/export | JSON export/import of niche configs (including examples) for sharing or backup |
| 4 | Prompt preview per brand | Show how merged global + brand config produces a different prompt |
| 5 | Viral ideas database | Migrate from `viral_ideas.py` hardcoded list to DB-backed collection, seeded from user reel examples |
| 6 | AI example generation | On niche change, offer to auto-generate 5 starter examples for the new niche using DeepSeek |

---

## PART 10: FILES THAT NEED CHANGES

### Backend — New Files

| File | Description |
|------|-------------|
| `app/core/prompt_context.py` | `PromptContext` dataclass + `format_reel_examples()` + `format_post_examples()` |
| `app/models/niche_config.py` | SQLAlchemy model for `niche_config` table (includes `reel_examples` and `post_examples` JSONB columns) |
| `app/services/content/niche_config_service.py` | Service: load global + per-brand config, merge, cache, return `PromptContext` |
| `app/api/niche_config_routes.py` | API endpoints: GET/PUT niche config (with example validation), preview prompt |

### Backend — Modified Files

| File | Change |
|------|--------|
| `app/core/prompt_templates.py` | Replace `SYSTEM_PROMPT` string with `build_system_prompt(ctx)`. Replace hardcoded audience/niche in `build_runtime_prompt()` and `build_post_content_prompt()` with `ctx.*` variables. **Inject `ctx.reel_examples` into reel prompts via `format_reel_examples()`.** **Replace `CAROUSEL_SLIDE_EXAMPLES` with `ctx.post_examples` when non-empty via `format_post_examples()`.** Replace `BRAND_PALETTES`, `IMAGE_PROMPT_SYSTEM`, `IMAGE_PROMPT_GUIDELINES` with `ctx.image_style_description`. |
| `app/services/content/generator.py` | Accept `PromptContext` in `generate_viral_content()`, `generate_post_title()`, `generate_post_titles_batch()`. Replace hardcoded audience/niche/topic references. Parameterize `CTA_OPTIONS` from `ctx.cta_options`. Parameterize fallback content. |
| `app/services/content/differentiator.py` | Replace hardcoded `brand_hints` dict with DB-backed `ctx.brand_personality`. Replace `BASELINE_BRAND` with DB field. |
| `app/services/media/caption_generator.py` | Replace hardcoded `BRAND_HANDLES`, `CTA_OPTIONS`, `HASHTAGS`, follow/save section text with `ctx.*` fields. Replace "health and wellness content writer" role. |
| `app/core/viral_patterns.py` | Parameterize `TOPIC_BUCKETS` from `ctx.topic_categories`. Parameterize health-specific variables in `TITLE_ARCHETYPES`. |
| `app/core/quality_scorer.py` | Replace `HOOK_KEYWORDS` health-specific words with `ctx.topic_keywords`. Replace `health_keywords` and `familiar_items` lists. |
| `app/core/cta.py` | Read CTA options from `ctx.cta_options`. |
| `app/core/constants.py` | Replace `DEFAULT_HASHTAGS` with fallback only; primary source becomes `ctx.hashtags`. |
| `app/services/content/tracker.py` | Replace hardcoded `TOPIC_BUCKETS` with `ctx.topic_categories`. |
| `app/api/brands_routes_v2.py` | Add niche config endpoints. |
| `app/api/routes.py` | Wire new niche config router. |
| `app/db_connection.py` | Import new `NicheConfig` model. |

### Frontend — New Files

| File | Description |
|------|-------------|
| `src/features/brands/components/NicheConfigForm.tsx` | New structured form with collapsible sections, tag inputs, chip selectors, **Content Examples section** |
| `src/features/brands/components/ContentExamplesSection.tsx` | Expandable cards for reel examples + post examples, dynamic add/remove lines |
| `src/features/brands/components/ConfigStrengthMeter.tsx` | Visual bar showing Basic/Good/Excellent based on completeness |
| `src/features/brands/components/TagInput.tsx` | Reusable tag input component |
| `src/features/brands/components/ChipSelect.tsx` | Reusable multi-select chip component |
| `src/features/brands/components/PromptPreview.tsx` | Read-only prompt preview modal |
| `src/features/brands/api/use-niche-config.ts` | `useNicheConfig()`, `useUpdateNicheConfig()`, `usePromptPreview()` hooks |
| `src/features/brands/types/niche-config.ts` | `NicheConfig`, `ReelExample`, `PostExample` TypeScript interfaces + `getConfigStrength()` |

### Frontend — Modified Files

| File | Change |
|------|--------|
| `src/features/brands/components/ContentPromptsCard.tsx` | Replace with `NicheConfigForm` (or keep as legacy fallback during Phase 1) |
| `src/features/brands/components/BrandsTabBar.tsx` | Update tab label from "Content Prompts" to "Content DNA" |
| `src/features/brands/components/index.ts` | Export new components |
| `src/features/brands/api/index.ts` | Export new hooks |
| `src/pages/Brands.tsx` | Swap `ContentPromptsCard` for `NicheConfigForm` in the prompts tab |

---

## PART 11: RISKS & MITIGATIONS

### Risk 1: User enters bad niche → garbage content

| Aspect | Detail |
|--------|--------|
| **Scenario** | User types "asdf" as niche name, or "underwater basket weaving" — the AI generates incoherent content |
| **Probability** | Medium |
| **Mitigation** | Suggested niche dropdown with common options. Custom input allowed but shown with a "Custom niche" indicator. Prompt preview lets users inspect the assembled prompt. **v2 addition:** If user provides examples, bad niche names are partially rescued — the examples anchor the AI's style regardless. |

### Risk 2: Empty fields break prompts

| Aspect | Detail |
|--------|--------|
| **Scenario** | User clears `niche_name` → `f"You are a {ctx.niche_name} content generator"` becomes `"You are a  content generator"` |
| **Probability** | High |
| **Mitigation** | `PromptContext` defaults are always populated. Frontend validates required fields. Backend falls back to defaults if DB returns NULL/empty. |

### Risk 3: Too much flexibility breaks output format

| Aspect | Detail |
|--------|--------|
| **Scenario** | User writes instructions in a textarea that contradict JSON output format, slide count rules, or character limits |
| **Probability** | Low (with structured fields + format protection) |
| **Mitigation** | Format Protection system (Part 4): format rules are hardcoded AFTER user content in the prompt, use "STRICT" / "non-negotiable" language. No format-related UI fields exist. `PromptContext` has no format fields. |

### Risk 4: Quality scorer fails for non-health niches

| Aspect | Detail |
|--------|--------|
| **Scenario** | Quality scorer uses `health_keywords` for familiarity scoring. A finance post about "compound interest" scores 0 on familiarity. |
| **Probability** | Certain (without changes) |
| **Mitigation** | Phase 2 replaces `health_keywords` with `ctx.topic_keywords`. Phase 1: lower the familiarity weight from 20% to 10%. |

### Risk 5: Hardcoded examples anchor AI to health content

| Aspect | Detail |
|--------|--------|
| **Scenario** | Even if niche is changed to "Personal Finance", the 15 hardcoded carousel examples bias the AI back toward health. |
| **Probability** | High (without user examples) |
| **Mitigation** | **v2 solution:** User-provided examples REPLACE hardcoded ones when present. If `ctx.post_examples` is non-empty, `CAROUSEL_SLIDE_EXAMPLES` is not used. This is the primary reason examples are in Phase 1 — they directly solve the anchoring problem. If user has 0 examples, a preamble is added: "These examples demonstrate STRUCTURE and FORMAT only. Topic must match the niche above." |

### Risk 6: Migration breaks existing content generation

| Aspect | Detail |
|--------|--------|
| **Scenario** | Deploying the new system changes prompt outputs |
| **Probability** | Low (with proper defaults) |
| **Mitigation** | All defaults match current hardcoded values. Empty `reel_examples`/`post_examples` fall back to current behavior. Feature flag: `ENABLE_NICHE_CONFIG=false` env var. |

### Risk 7: Cache staleness

| Aspect | Detail |
|--------|--------|
| **Scenario** | User updates config but cached values served to next generation |
| **Probability** | Medium |
| **Mitigation** | `invalidate_cache()` called immediately on save. TTL is safety net only. |

### Risk 8: Bad user examples poison AI output

| Aspect | Detail |
|--------|--------|
| **Scenario** | User provides low-quality, off-topic, or incorrectly formatted examples → AI mimics the bad examples |
| **Probability** | Medium |
| **Mitigation** | Backend validates example structure (title must exist, content_lines/slides must be non-empty). Quality is the user's responsibility — the system trusts their expertise. The format protection layer (Part 4) ensures format rules aren't overridden even by poorly formatted examples. Help text guides users: "Each example should represent the best quality content you want the AI to replicate." |

### Risk 9: Per-brand override complexity

| Aspect | Detail |
|--------|--------|
| **Scenario** | Users accidentally override one field for a brand, forget about it |
| **Probability** | Medium |
| **Mitigation** | Clear visual indicators: "Using custom settings" badge. "Reset to global" button. Hover tooltip showing overridden fields. |

---

## APPENDIX: DATA FLOW DIAGRAM

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              USER                                        │
│                                                                          │
│  Edits structured fields in NicheConfigForm                              │
│  ┌─────────────────────────────────────────────┐                         │
│  │ Niche: "Personal Finance"                   │                         │
│  │ Audience: "U.S. millennials saving for FIRE"│                         │
│  │ Topics: [budgeting, investing, taxes, ...]  │                         │
│  │ Tone: [confident, educational, direct]      │                         │
│  │ Reel Examples: 8 finance reel examples      │  ← NEW in v2            │
│  │ Post Examples: 5 finance post examples      │  ← NEW in v2            │
│  └─────────────────┬───────────────────────────┘                         │
└─────────────────────┼────────────────────────────────────────────────────┘
                      │ PUT /api/v2/brands/niche-config
                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  BACKEND                                                                  │
│                                                                          │
│  brands_routes_v2.py                                                     │
│  └─→ Validates fields + validates examples (max 20, structure)           │
│  └─→ Saves to niche_config table (including reel_examples, post_examples)│
│  └─→ Invalidates NicheConfigService cache                                │
│                                                                          │
│  ┌─ NicheConfigService ──────────────────────────────────────────────┐   │
│  │                                                                    │   │
│  │  1. Load global config (brand_id IS NULL)                          │   │
│  │  2. Load per-brand config (brand_id = ?)                           │   │
│  │  3. Merge: per-brand overrides global (non-NULL fields)            │   │
│  │  4. Return PromptContext (includes examples)                       │   │
│  │  5. Cache for 5 minutes                                            │   │
│  │                                                                    │   │
│  └────────────────────────┬───────────────────────────────────────────┘   │
│                           │                                               │
│                           ▼                                               │
│  ┌─ PromptContext ──────────────────────────────────────────────────┐     │
│  │  niche_name: "Personal Finance"                                  │     │
│  │  target_audience: "U.S. millennials saving for FIRE"             │     │
│  │  topic_categories: ["budgeting", "investing", "taxes", ...]      │     │
│  │  content_tone: ["confident", "educational", "direct"]            │     │
│  │  reel_examples: [8 finance examples]  ← NEW                     │     │
│  │  post_examples: [5 finance examples]  ← NEW                     │     │
│  │  ...all other fields populated...                                │     │
│  └──────────────────────┬─────────────────────────────────────────┘       │
│                         │                                                 │
│           ┌─────────────┼─────────────┬──────────────┐                    │
│           ▼             ▼             ▼              ▼                    │
│                                                                          │
│  ┌─── PROMPT ASSEMBLY (3-layer architecture) ───────────────────────┐    │
│  │                                                                    │    │
│  │  Layer 1 — EXAMPLES (from user, injected FIRST):                   │    │
│  │  "Here are examples of the exact style and quality..."             │    │
│  │  EXAMPLE 1: "HOW TO START A SINKING FUND FOR..."                   │    │
│  │  EXAMPLE 2: "THESE 5 INVESTING MISTAKES COST..."                   │    │
│  │  ... (8 reel examples OR 5 post examples)                          │    │
│  │                                                                    │    │
│  │  Layer 2 — CONTENT (from PromptContext):                           │    │
│  │  Niche: Personal Finance                                           │    │
│  │  Audience: millennials saving for FIRE                             │    │
│  │  Topics: budgeting, investing, taxes                               │    │
│  │  Tone: confident, educational, direct                              │    │
│  │                                                                    │    │
│  │  Layer 3 — FORMAT (HARDCODED, never from user):                    │    │
│  │  STRICT RULES: ALL CAPS title, 18 word limit, JSON output, etc.   │    │
│  │                                                                    │    │
│  └────────────────────────────────┬───────────────────────────────────┘    │
│                                   │                                       │
│                                   ▼                                       │
│                              DeepSeek API                                 │
│                              → Finance content that matches               │
│                                user's examples in style & depth           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## APPENDIX: CHANGELOG FROM v1

| Section | What Changed |
|---------|-------------|
| **Design Philosophy** | Added Principle 2 (Examples as most powerful lever) and Principle 5 (Safe boundaries). Added influence power ranking diagram. |
| **NEW Part 3** | Entire section on User Examples — few-shot prompting. Covers reel examples (1-20), post examples (1-20), data model, frontend UI, prompt injection strategy, formatting functions, before/after code. |
| **NEW Part 4** | Entire section on Format Protection — hard boundaries. Lists all hard-locked rules, shows 3-layer architectural enforcement, explains PromptContext exclusions, input validation. |
| **Data Model** | Added `reel_examples JSONB` and `post_examples JSONB` columns to `niche_config` table. Added validation rules. |
| **PromptContext** | Added `reel_examples`, `post_examples` fields + `has_reel_examples`, `has_post_examples`, `example_count` properties. Added explicit note that format fields are excluded. |
| **Backend Architecture** | Added `format_reel_examples()` and `format_post_examples()` functions. Updated prompt assembly to show 3-layer architecture. Updated before/after examples to show example injection. Updated `NicheConfigService._apply_config()` to include examples. |
| **Frontend Architecture** | Renamed page from "Content Prompts"/"Content Configuration" to "Content DNA". Added Content Examples section (expandable cards, dynamic lists, counters). Added Configuration Strength meter. Added TypeScript interfaces for `ReelExample` and `PostExample`. Added `ContentExamplesSection.tsx` and `ConfigStrengthMeter.tsx` to new files. |
| **NEW Part 8** | Entire section on Page Purpose & User Education — header/naming, strength meter, per-section helper text, empty state guidance. |
| **Implementation Phases** | Phase 1 now includes reel_examples + post_examples + example formatting + example validation + examples UI + Configuration Strength meter. Phase 2 includes full UX education. Phase 3 adds per-brand examples, AI example generation. |
| **Files List** | Added `ContentExamplesSection.tsx`, `ConfigStrengthMeter.tsx` to new frontend files. Updated `prompt_templates.py` change description to include example injection. Updated `niche_config_routes.py` description to include example validation. |
| **Risks** | Added Risk 5 revision (user examples solve anchoring problem). Added Risk 8 (bad user examples). Updated Risk 3 to reference Format Protection. |

---

*This architecture proposal v2 was generated from analysis of 4 audit documents and 11 source files. It builds on v1 with three major additions: user-provided few-shot examples as the highest-impact feature, format protection as an architectural boundary, and UX education to guide users through configuration.*
