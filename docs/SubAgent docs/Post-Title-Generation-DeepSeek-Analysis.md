# Post Title Generation via DeepSeek AI — Complete Analysis

## Executive Summary

Post titles are generated through **3 distinct code paths**, each sending different prompts to the DeepSeek API. The "always 2 lines" issue is **NOT caused by the AI prompt** — it's caused by the **`autoFitFontSize()` algorithm** in the renderer, which has a strong **structural bias toward 2-line layouts**.

---

## 1. Code Paths for Post Title Generation

### Path A: `generate_post_title()` — Single post generation
**File:** `app/services/content_generator_v2.py` lines ~330-480

### Path B: `generate_post_titles_batch()` — Batch generation (multiple brands)
**File:** `app/services/content_generator_v2.py` lines ~530-620
**Delegates to:** `prompt_templates.py → build_post_content_prompt()`

### Path C: `GenericAgent._generate_proposal()` — Agent-based generation (Toby/Lexi)
**File:** `app/services/generic_agent.py` lines ~300-370
**Uses strategy-specific prompt builders:** `_build_explore_prompt()`, `_build_iterate_prompt()`, etc.

---

## 2. Exact Prompts Sent to DeepSeek

### Path A: `generate_post_title()` — Inline prompt

**System Message:** NONE (no system prompt — sent only as user message)

**Temperature:** `1.0`  
**Max Tokens:** `2000`  
**Model:** `deepseek-chat`

**User prompt (verbatim template):**
```
You are a health content creator for InLight — a wellness brand targeting U.S. women aged 35 and older.

Generate a SINGLE short, engaging, health-focused title and a matching Instagram caption with a real scientific reference.

### TARGET AUDIENCE:
Women 35+ interested in healthy aging, energy, hormones, and longevity.

### WHAT MAKES A GREAT POST TITLE:
- A short, clear health statement written in simple, wellness-friendly tone (not overly technical)
- Focused on one or two main benefits
- Some titles may include percentages for extra impact
- Positive, empowering, and slightly exaggerated to create scroll-stop engagement
- Do NOT lie, but dramatize slightly to spark discussion (comments, shares, saves)
- Do NOT end the title with a period (.)  — end cleanly without punctuation or with a question mark only

### TOPIC FOR THIS POST (mandatory — write about this topic):
{topic_hint or forced_topic}

### EXAMPLE POST TITLES (learn the pattern):
- "Vitamin D and magnesium helps reduce depression and brain aging."
- "Collagen may improve skin elasticity by up to 20% after 8 weeks."
- "Magnesium supports better sleep and stress relief during midlife."
... (15 examples total)

### IMAGE PROMPT REQUIREMENTS:
- Soft, minimal, calming wellness aesthetic
...

### OUTPUT FORMAT (JSON only, no markdown):
{
    "title": "Your health statement title here.",
    "caption": "...",
    "image_prompt": "..."
}
```

**Key observations about Path A:**
- Tells AI to write "short, clear" titles → short = 1-2 lines
- Example titles average ~55-65 characters
- **NO `slide_texts` field requested** — single posts don't generate carousel slides
- Title is sentence-case (not ALL CAPS) per the prompt
- **NO character or line count constraints given**

---

### Path B: `generate_post_titles_batch()` → `build_post_content_prompt()`

**System Message:** NONE (sent only as user message)

**Temperature:** `0.95`  
**Max Tokens:** `8000`  
**Model:** `deepseek-chat`

**User prompt (from `prompt_templates.py → build_post_content_prompt()`):**
```
You are a health content creator for InLight, a wellness brand targeting U.S. women aged 35 and older.

Generate EXACTLY {count} COMPLETELY DIFFERENT health-focused posts.

### WHAT MAKES A GREAT POST TITLE (Slide 1):
- A short, clear health statement written in ALL CAPS
- Focused on one or two main benefits
- Positive, empowering, and slightly exaggerated
- Do NOT end the title with a period (.) unless it's a two-part statement

### TITLE STYLE VARIETY (CRITICAL):
**Style A: Bold statement with impact**
- "YOUR SKIN LOSES 1% OF ITS COLLAGEN EVERY YEAR AFTER AGE 30. BUT YOU CAN SLOW THAT DOWN."
- "CHRONIC STRESS DOESN'T JUST FEEL BAD. IT LITERALLY AGES YOUR CELLS FASTER."

**Style B: Direct statement or question**
- "IF YOU'RE EXHAUSTED BUT YOUR SLEEP IS FINE, CHECK YOUR IRON LEVELS."
- "ONE DAILY HABIT CAN CHANGE YOUR HEALTH: A 10-MINUTE WALK AFTER MEALS."

**Style C: Educational insight**
- "YOUR GUT PRODUCES 90% OF YOUR SEROTONIN..."
- "WALKING AFTER MEALS IS ONE OF THE MOST UNDERRATED HABITS..."

### CAROUSEL SLIDE TEXTS (CRITICAL):
Generate 3-4 slide texts for each post.
Each slide text should be:
- A standalone paragraph (3-6 sentences)
- Written in a calm, authoritative, educational tone

### OUTPUT FORMAT (JSON array):
[
  {
    "title": "TITLE IN ALL CAPS FOR SLIDE 1",
    "caption": "...",
    "slide_texts": [
      "First slide paragraph...",
      "Second slide paragraph...",
      "Third slide paragraph...",
      "Fourth slide paragraph..."
    ],
    "image_prompt": "..."
  }
]
```

**Key observations about Path B:**
- Titles are ALL CAPS
- Example titles range from **49 to 92 characters**
- Example titles from `CAROUSEL_SLIDE_EXAMPLES` go up to **~100 characters** (e.g., "WHEN YOU FOCUS ON THE GOOD IN YOUR LIFE, YOUR BRAIN LITERALLY REWIRES ITSELF TO LOOK FOR MORE GOOD. THAT'S THE MAGIC OF NEUROPLASTICITY" = 133 chars)
- **slide_texts** are generated as 3-4 paragraphs
- **NO explicit character/line-count constraints for titles**

---

### Path C: `GenericAgent` — Strategy-based generation

**System Message:** Uses `POST_SYSTEM_PROMPT_TEMPLATE` or `REEL_SYSTEM_PROMPT_TEMPLATE`

**For posts, the system prompt says:**
```
OUR POST TEMPLATE (fixed format — cover slide + 3-4 text carousel slides):

1) TITLE — The main hook on the cover slide. ALL CAPS. Bold, statement-based.

2) SLIDE TEXTS — 3-4 paragraph slides (carousel slides 2, 3, 4, optionally 5):
   Each slide is a standalone paragraph (3-6 sentences)...

3) IMAGE PROMPT — ...
4) CAPTION — ...
```

**User prompt (explore strategy example):**
```
Generate a fresh carousel post with slide_texts about: {topic}
...
Respond with a JSON object:
{
  "title": "YOUR TITLE IN ALL CAPS",
  "slide_texts": ["paragraph 1", "paragraph 2", "paragraph 3"],
  "image_prompt": "...",
  "caption": "...",
  "reasoning": "..."
}
```

**Temperature:** Agent-specific (0.75 for Lexi, 0.9 for Toby)  
**Max Tokens:** `2500` for posts  
**Model:** `deepseek-chat`

**Key observations about Path C:**
- Title instruction is just "ALL CAPS. Bold, statement-based" — **no length guidance**
- **NO character/line constraints**
- slide_texts are requested but only as `["paragraph 1", "paragraph 2", "paragraph 3"]`

---

## 3. Response Parsing

### All paths use the same JSON parsing pattern:

```python
# Clean markdown if present
if content_text.startswith("```"):
    content_text = content_text.split("```")[1]
    if content_text.startswith("json"):
        content_text = content_text[4:]
    content_text = content_text.strip()

result = json.loads(content_text)
```

### Expected JSON schema per path:

| Path | Required Fields | Optional Fields |
|------|----------------|-----------------|
| **Path A** (single post) | `title`, `caption`, `image_prompt` | — |
| **Path B** (batch) | `title`, `caption`, `image_prompt`, `slide_texts` | — |
| **Path C** (agent) | `title`, `slide_texts` (posts) or `content_lines` (reels), `image_prompt`, `caption` | `reasoning` |

### Post-parse processing:
- `title.rstrip(".")` — trailing period stripped (Path A & B)
- `check_post_quality(title, caption)` — quality gate check
- `content_tracker.is_duplicate(title)` — duplicate check
- `content_tracker.record(...)` — persist to DB

---

## 4. How `slide_texts` Are Generated

- **Path A:** NOT generated. Single `generate_post_title()` does NOT produce `slide_texts`. Fallbacks have `slide_texts: []`.
- **Path B:** Generated by AI as part of the JSON response. The prompt includes 15 detailed examples from `CAROUSEL_SLIDE_EXAMPLES` that show 2-4 slides each with 3-6 sentences.
- **Path C:** Generated by AI based on `"slide_texts": ["paragraph 1", "paragraph 2", "paragraph 3"]` in the JSON template.

---

## 5. How `image_prompt` Is Generated

### All paths ask the AI to generate the image prompt inline:
```
"image_prompt": "Soft cinematic close-up description... No text, no letters, no numbers, no symbols, no logos."
```

### Standalone `generate_image_prompt(title)` method:
When a user provides a title but no image prompt, this method calls DeepSeek separately:
- **Temperature:** `0.8`
- **Max Tokens:** `300`
- Uses a dedicated prompt with 2 examples
- Returns `{"image_prompt": "..."}` JSON

### Fallback image prompts:
Keyword-based matching in `_fallback_image_prompt()` — checks for vitamin/sleep/exercise/food/meditation/water keywords and returns a pre-written prompt.

---

## 6. Quality Scoring for Titles

### `quality_scorer.py` — For reels only (content_generator_v2 reel flow)
5 dimensions, 0-100 scale:
- **Structural Compliance (25%):** Title ALL CAPS, 3-10 words, no emojis/hashtags
- **Pattern Familiarity (20%):** Matches viral title patterns (SIGNS YOUR, DOCTORS, EAT THIS, etc.)
- **Novelty (20%):** SequenceMatcher comparison with recent outputs
- **Hook Strength (20%):** Presence of hook trigger words
- **Plausibility (15%):** No blacklisted words (cure, guaranteed, miracle), soft language bonus

### `content_tracker.check_post_quality()` — For posts
Simpler structural checks:
- Title ≥10 chars (hard fail < 10)
- Title doesn't end with period (-5)
- Title not mostly ALL CAPS (-15) ← **NOTE: This conflicts with batch/agent prompts that say "ALL CAPS"!**
- Title doesn't start with a number (-15)
- No em-dash/en-dash (-5)
- Title 20-150 chars (sweet spot 40-120)
- Caption has DOI/Source, disclaimer, ≥100 chars

---

## 7. Anti-Repetition System

### `content_tracker.py` — Persistent DB-backed tracker
- **Fingerprinting:** `ContentHistory.compute_keyword_hash(title)` — same sorted keywords = duplicate
- **Topic Cooldown:** 3-day cooldown per topic bucket (13 buckets defined)
- **Brand-Aware:** `get_brand_avoidance_prompt()` provides brand-specific + cross-brand title lists
- **History Injection:** `build_history_context()` builds `### PREVIOUSLY GENERATED` block for prompts

### `content_differentiator.py` — Brand variation
- Creates unique content variations per brand in a single DeepSeek call
- Operates on **content_lines** (reel content), **not post titles**
- Each brand gets reworded, reshuffled content lines

---

## 8. Constants (from `constants.py`)

| Constant | Value | Usage |
|----------|-------|-------|
| `MAX_TITLE_LENGTH` | 50 | **DEFINED BUT NEVER ENFORCED ANYWHERE** |
| `MAX_LINE_LENGTH` | 80 | **DEFINED BUT NEVER ENFORCED** |
| `MAX_CONTENT_LINES` | 10 | **DEFINED BUT NEVER ENFORCED** |
| `TITLE_FONT_SIZE` | 80 | Reel title font (thumbnail) |
| `POST_WIDTH` | 1080 | Post canvas width |
| `POST_HEIGHT` | 1350 | Post canvas height |
| `TITLE_SIDE_PADDING` | 90 | Reel title side padding |
| `SIDE_MARGIN` | 80 | Reel side margin |

---

## 9. ROOT CAUSE ANALYSIS: Why Titles Are Always 2 Lines

### The Problem
Post titles consistently render as 2 lines instead of 3. The user expected 3-line layouts.

### Finding: The `autoFitFontSize()` algorithm HAS A STRUCTURAL BIAS TOWARD 2 LINES

**Location:** `post_compositor.py` lines 91-108 AND `PostCanvas.tsx` lines 269-291

```python
def _auto_fit_font_size(text: str, max_width: int) -> int:
    # Try 3 lines: 90px → 64px
    for fs in range(AUTO_FIT_MAX, THREE_LINE_FLOOR - 1, -2):
        if _count_lines(text, max_width, fs) == 3:
            return fs
    # Try 2 lines: 90px → 30px
    for fs in range(AUTO_FIT_MAX, AUTO_FIT_MIN - 1, -2):
        if _count_lines(text, max_width, fs) == 2:
            return fs
    # 1 line: largest that fits
    ...
```

**The math:**
- `max_width = 1080 - (45 * 2) = 990px`
- `avg_char_width = font_size * 0.48`
- At 90px: `max_chars = 990 / (90 * 0.48) = 22 chars per line`
- At 64px: `max_chars = 990 / (64 * 0.48) = 32 chars per line`
- At 30px: `max_chars = 990 / (30 * 0.48) = 68 chars per line`

**For a title to render as 3 lines, it needs to be exactly 3 lines at some font size between 90px and 64px:**
- At 90px (22 chars/line): needs 45-66 chars to be 3 lines
- At 64px (32 chars/line): needs 65-96 chars to be 3 lines

**For a title to render as 2 lines, font size drops from 90px to 30px:**
- At 90px (22 chars/line): needs 23-44 chars to be 2 lines
- At 70px (29 chars/line): needs 30-58 chars to be 2 lines
- At 50px (41 chars/line): needs 42-82 chars to be 2 lines
- At 30px (68 chars/line): needs 69-136 chars to be 2 lines

**The critical issue:** The algorithm **first tries to find a font size where the title is exactly 3 lines** (90px→64px range only). If no font size in that narrow range produces exactly 3 lines, it **immediately falls through to the 2-line search** which has a MUCH wider font-size range (90px→30px).

### Why most titles end up as 2 lines:

1. **The AI generates titles around 50-80 characters** (based on example patterns)
2. **The 3-line search window (90px→64px) is narrow** — only 13 font size steps
3. **A 60-char title:**
   - At 90px (22 chars/line): `ceil(60/22) = 3 lines` ✅ → returns 90px, 3 lines!
   - But wait — at 88px (23 chars/line): `ceil(60/23) = 3 lines` → also 3 lines
   - The algorithm starts at 90px and returns the FIRST match
   
4. **A 45-char title** (common for shorter titles like "Magnesium supports better sleep and stress relief"):
   - At 90px (22 chars/line): `ceil(45/22) = 3 lines` → returns 90px
   - BUT the `_count_lines()` function uses WORD-LEVEL wrapping, not char-count ceiling!

### The REAL issue: Character estimation vs. word-boundary wrapping mismatch

The `_count_lines()` function wraps at WORD boundaries:
```python
def _count_lines(text, max_width, font_size):
    avg_char_width = font_size * 0.48
    max_chars = int(max_width / avg_char_width)
    words = text.upper().split()
    line_count = 1
    current = ""
    for word in words:
        test = f"{current} {word}" if current else word
        if len(test) > max_chars and current:
            line_count += 1
            current = word
        else:
            current = test
    return line_count
```

**Example: "MAGNESIUM SUPPORTS BETTER SLEEP AND STRESS RELIEF DURING MIDLIFE" (65 chars)**
- At 90px, max_chars = 22:
  - Line 1: "MAGNESIUM SUPPORTS" (18 chars) ← "BETTER" would make 25, exceeds 22
  - Line 2: "BETTER SLEEP AND" (16 chars) ← "STRESS" would make 23, exceeds 22
  - Line 3: "STRESS RELIEF DURING" (20 chars) ← "MIDLIFE" would make 28, exceeds 22
  - Line 4: "MIDLIFE" (7 chars)
  - **Result: 4 lines at 90px** → doesn't match 3, skip!
  
- At 88px, max_chars = 23:
  - Line 1: "MAGNESIUM SUPPORTS" (18) ← "BETTER" = 25, exceeds 23
  - Line 2: "BETTER SLEEP AND" (16) ← "STRESS" = 23, fits!
  - Wait: "BETTER SLEEP AND STRESS" = 23 chars exactly... `23 > 23`? No, `len("BETTER SLEEP AND STRESS") = 23`, and `23 > 23` is FALSE. So it fits!
  - Line 2: "BETTER SLEEP AND STRESS" (23)
  - Line 3: "RELIEF DURING MIDLIFE" (21)
  - **Result: 3 lines at 88px** ✅ → returns 88px!

So this specific title WOULD render as 3 lines. But shorter titles won't.

**Example: "COLLAGEN MAY IMPROVE SKIN ELASTICITY BY UP TO 20% AFTER 8 WEEKS" (64 chars)**
- At 90px, max_chars = 22:
  - "COLLAGEN MAY IMPROVE" (20) ← "SKIN" would make 25
  - "SKIN ELASTICITY BY UP" (21) ← "TO" would make 24
  - "TO 20% AFTER 8 WEEKS" (20)
  - **3 lines at 90px** ✅ → returns 90px!

**Example: "VITAMIN D AND MAGNESIUM HELPS REDUCE DEPRESSION AND BRAIN AGING" (63 chars)**
- At 90px, max_chars = 22:
  - "VITAMIN D AND" (13) ← "MAGNESIUM" = 23, exceeds
  - "MAGNESIUM HELPS" (15) ← "REDUCE" = 22, fits!
  - "MAGNESIUM HELPS REDUCE" (22) ← "DEPRESSION" = 33, exceeds
  - "DEPRESSION AND BRAIN" (20) ← "AGING" = 26, exceeds
  - "AGING" (5)
  - **4 lines at 90px** → skip!
  
- At 76px, max_chars = 27:
  - "VITAMIN D AND MAGNESIUM" (23) ← "HELPS" = 29, exceeds
  - Wait: 23 vs 27... "VITAMIN D AND MAGNESIUM HELPS" = 29, exceeds 27
  - "VITAMIN D AND MAGNESIUM" (23)
  - "HELPS REDUCE DEPRESSION AND" (27) ← "BRAIN" = 33, exceeds
  - "BRAIN AGING" (11)
  - **3 lines at 76px** ✅ → returns 76px

So this title WOULD also render as 3 lines at 76px. **The algorithm should work for most ~60+ char titles.**

### REVISED ANALYSIS: When does 2-line happen?

Let me check titles **shorter than ~45 chars**:

**Example: "GREEN TEA SUPPORTS METABOLISM AND HEALTHY AGING" (48 chars)**
- At 90px, max_chars = 22:
  - "GREEN TEA SUPPORTS" (18) ← "METABOLISM" = 29, exceeds
  - "METABOLISM AND HEALTHY" (22) ← "AGING" = 28, exceeds
  - "AGING" (5)
  - **3 lines at 90px** ✅ → returns 90px!

**Example: "PROBIOTICS SUPPORT GUT HEALTH AFTER 40" (38 chars)**
- At 90px, max_chars = 22:
  - "PROBIOTICS SUPPORT GUT" (22) ← "HEALTH" = 29, exceeds
  - "HEALTH AFTER 40" (15)
  - **2 lines at 90px** → but we're looking for 3 lines! Skip.
  
- At 88px through 64px: all produce 2 lines (38 chars can't split into 3 lines at any reasonable max_chars)
  
- Falls through to 2-line search → found at 90px: **2 lines** ✅

**So the root cause is: titles shorter than ~45 characters CANNOT physically be 3 lines at font sizes 64-90px.**

### The ACTUAL Fix Depends on What You Want

**If you want MORE 3-line titles:**
1. **Tell the AI to write longer titles** — add character count or word count constraints to the prompt (e.g., "TITLE MUST BE 60-90 CHARACTERS" or "TITLE MUST BE 8-14 WORDS")
2. **Lower `THREE_LINE_FLOOR`** from 64px to ~50px — this gives the 3-line search more font sizes to try
3. **Both together** for best results

**The prompt currently says "short, clear" (Path A) or just "Bold, statement-based" (Path C) — neither encourages long titles.**

---

## 10. Summary of All Issues Found

### Issue 1: AI prompt encourages short titles (MAIN cause of 2-line rendering)
- Path A says "A short, clear health statement" → AI writes 40-60 char titles
- Path C says "Bold, statement-based" — no length guidance
- Path B has example titles ranging 49-133 chars BUT says "A short, clear health statement"
- **No prompt tells the AI a target character count or word count**

### Issue 2: `MAX_TITLE_LENGTH = 50` defined but never enforced
- The constant exists in `constants.py` but is never imported or checked
- Most AI-generated titles exceed 50 chars anyway
- This constant is misleading — it implies titles should be ≤50 chars when actually they need to be ≥60 chars for 3-line rendering

### Issue 3: Quality gate contradicts batch/agent prompts
- `check_post_quality()` penalizes ALL CAPS titles (-15 points: "Title is mostly ALL CAPS (reel-style)")
- But `build_post_content_prompt()` and GenericAgent both instruct "ALL CAPS"
- This means every batch/agent-generated title gets a -15 quality penalty

### Issue 4: No `slide_texts` in single post generation (Path A)
- `generate_post_title()` doesn't generate or request `slide_texts`
- `_fallback_post_title()` sets `slide_texts: []`
- Only Path B and C generate slide_texts

### Issue 5: Font rendering mismatch (server vs client)
- Server (`post_compositor.py`): Uses Poppins-Bold, character-estimation based wrapping (`fontSize * 0.48`)
- Client (`PostCanvas.tsx`): Uses the same algorithm but renders with Konva (which may use different fonts)
- The `0.48` multiplier is a rough estimate that may not match actual font metrics

### Issue 6: `autoFitFontSize()` prefers 3 lines over 2 (surprising!)
- The algorithm actually TRIES 3 lines first (90px→64px)
- Only falls to 2 lines if no font size produces exactly 3 lines
- This means the issue is NOT the algorithm preferring 2 lines — it's the AI generating titles too short for 3 lines

---

## 11. Recommended Fixes

### Fix 1: Add title length guidance to ALL prompts
Add to prompts:
```
TITLE LENGTH: Your title MUST be between 8 and 14 words (approximately 60-90 characters).
Titles with fewer than 8 words appear too small on the cover slide.
```

### Fix 2: Remove `MAX_TITLE_LENGTH = 50` or update it
Either delete the unused constant or change it to `MAX_TITLE_LENGTH = 90` with enforcement.

### Fix 3: Fix the quality gate ALL-CAPS contradiction
Either:
- Remove the ALL-CAPS penalty from `check_post_quality()`, OR
- Change prompts to use sentence case

### Fix 4: Add `slide_texts` to single post generation (Path A)
Update `generate_post_title()` prompt to also request `slide_texts`.
