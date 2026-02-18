# Prompts & Text Wrapping — Research Spec

## Task 1: Content Prompts

### How the system works now

**Prompt loading**: `get_content_prompts()` at [app/core/prompt_templates.py](app/core/prompt_templates.py#L24) queries the `app_settings` table for 3 keys: `reels_prompt`, `posts_prompt`, `brand_description`. Returns empty string for missing rows.

**GET /prompts endpoint**: [app/api/brands/routes.py](app/api/brands/routes.py#L225-L233) does the same query. Returns `{"reels_prompt": "", "posts_prompt": "", "brand_description": ""}` when no rows exist.

**PUT /prompts endpoint**: [app/api/brands/routes.py](app/api/brands/routes.py#L236-L253) upserts values into `app_settings`.

### Why the page shows empty but generation works

The DB fields are **additive overlays**, not the main prompts. The hardcoded prompts are always used. The DB values are appended at the end only when non-empty:

- **Reels** (`build_runtime_prompt()` at [prompt_templates.py](app/core/prompt_templates.py#L75-L107)):
  - Always sends `SYSTEM_PROMPT` (line 53) as system message
  - Always builds the runtime prompt with format/hook/topic instructions
  - At the end (lines 100-105), **if** `brand_description` has a value → appends `\n\nBRAND CONTEXT:\n{brand_desc}`
  - **If** `reels_prompt` has a value → appends `\n\nADDITIONAL INSTRUCTIONS:\n{reels_prompt}`

- **Posts** (`build_post_content_prompt()` at [prompt_templates.py](app/core/prompt_templates.py#L370-L570)):
  - Always uses the massive hardcoded post prompt (audience, rules, examples, format)
  - Near the end (after the JSON format spec), **if** `brand_description` has a value → appends `### BRAND CONTEXT`
  - **If** `posts_prompt` has a value → appends `### ADDITIONAL INSTRUCTIONS`

### The actual hardcoded prompt text

#### SYSTEM_PROMPT (Reels — sent as system message, line 53)

```
You are a viral short-form health content generator.

TASK:
Generate original Instagram/TikTok reel ideas that match proven viral health patterns without copying any known content.

CORE RULES:
- Use familiar health framing (habits, symptoms, food, sleep, aging, body signals)
- Optimize for emotional hooks: curiosity, fear, authority, hope, or control
- Keep language simple, confident, and non-clinical
- Avoid medical diagnosis, treatment instructions, or guarantees
- Avoid academic, poetic, or overly creative language
- Each content line must be under 18 words

CONTENT PHILOSOPHY:
- 60% validating (things audience suspects are true)
- 40% surprising (new revelation that feels plausible)
- Use familiar foods, habits, and symptoms
- Plausible > precise (this is social content, not textbooks)

FORMATTING:
- Titles in ALL CAPS
- One format style per reel (do not mix)
- No emojis, hashtags, or disclaimers
- No CTA (call-to-action) - it's added separately
- No numbered lists (numbers added by system)

You generate content that feels familiar, not repeated.
Output ONLY valid JSON, no markdown, no explanations.
```

#### Reels runtime prompt (build_runtime_prompt, line 75)

Template (variables filled at runtime):
```
Generate 1 viral health reel.

INSTRUCTIONS:
- Topic: {selection.topic}
- Format: {selection.format_style}
- Hook type: {selection.primary_hook}
- Point count: {selection.point_count} content lines

TITLE PATTERN (modify as needed):
"{pattern_hint}"

FORMAT RULES:
- Structure: {format_info['structure']}
- Max words per line: {format_info['word_limit']}

HOOK LANGUAGE TO USE:
{', '.join(hook_language[:4])}

OUTPUT (JSON only):
{
    "title": "YOUR TITLE IN ALL CAPS",
    "content_lines": ["line 1", "line 2", ...],
    "image_prompt": "Cinematic image description ending with: No text, no letters, no numbers, no symbols, no logos.",
    "format_style": "{selection.format_style}",
    "topic_category": "{selection.topic}",
    "hook_type": "{selection.primary_hook}"
}
```

#### Posts prompt (build_post_content_prompt, line 370)

This prompt is ~500 lines long. Key sections:
- Target audience: Women 35+ interested in healthy aging, energy, hormones, longevity
- Writing rules: no em dashes, natural tone, 8-14 word titles in ALL CAPS
- Title style variety (3 styles: bold statement, direct statement, educational insight)
- Caption requirements (4-5 paragraphs, real DOI sources, disclaimer)
- Carousel slide texts (3-4 slides, standalone paragraphs)
- Image prompt requirements
- 15 full carousel examples for few-shot prompting
- Output format spec (JSON array)

The full function is at [prompt_templates.py](app/core/prompt_templates.py#L370-L570). It's too long to reproduce here but the function `get_post_content_prompt_for_display()` (line 572) already exists to return a clean version for the UI.

### Proposed fix

**Option B (recommended)**: Make the GET /prompts API return the hardcoded defaults when DB values are empty.

Changes needed in [app/api/brands/routes.py](app/api/brands/routes.py#L225-L233):

```python
@router.get("/prompts")
async def get_prompts(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get the 3 global content prompt settings."""
    from app.models.config import AppSettings
    from app.core.prompt_templates import SYSTEM_PROMPT, get_post_content_prompt_for_display
    
    rows = db.query(AppSettings).filter(AppSettings.key.in_(PROMPT_KEYS)).all()
    result = {k: "" for k in PROMPT_KEYS}
    for row in rows:
        result[row.key] = row.value or ""
    
    # Return hardcoded defaults when DB values are empty
    # These are ADDITIONAL instructions appended to the base prompts
    # Show placeholder text explaining what these fields do
    defaults = {
        "reels_prompt": SYSTEM_PROMPT,
        "posts_prompt": get_post_content_prompt_for_display(),
        "brand_description": "",
    }
    
    # Include both current values and defaults
    return {
        **result,
        "defaults": defaults,
    }
```

This way the frontend can show the defaults as placeholder/preview text and the user knows what prompts DeepSeek is using. The actual DB fields remain as "additional instructions" that get appended.

**Alternative simpler approach**: Just return the defaults *as* the values when DB is empty:

```python
    if not result["reels_prompt"]:
        result["reels_prompt"] = SYSTEM_PROMPT.strip()
    if not result["posts_prompt"]:
        result["posts_prompt"] = get_post_content_prompt_for_display()
```

But this is misleading because saving those values back would make them "additional instructions" appended to themselves.

**Best approach**: Return a `defaults` field alongside the actual values, and let the frontend show the defaults as read-only previews or placeholders.

---

## Task 2: Text Wrapping

### The problem

The title "ONE DAILY HABIT CAN CHANGE YOUR HEALTH: A 10-MINUTE WALK AFTER MEALS" is being wrapped with "CAN" pushed to a new line, when it should fit on the previous line. This happens because all 3 canvas renderers use **balanced wrapping** (distribute words evenly across lines) instead of **greedy wrapping** (fill each line as much as possible).

### Current algorithm — all 3 files

The wrapping algorithm is identical in all 3 files:

#### 1. PostCanvas.tsx — `balanceTitleText()` at [line 113](src/shared/components/PostCanvas.tsx#L113-L213)

```typescript
export function balanceTitleText(
  title: string,
  maxWidth: number,
  fontSize: number,
): BalancedTitle {
  const upperText = (title || '').toUpperCase().trim()
  const words = upperText.split(/\s+/).filter(Boolean)

  if (words.length === 0) return { lines: [''], fontSize }

  // Character-count estimation
  const avgCharWidth = fontSize * 0.48
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth)

  // Step 1: Greedy wrap to determine line count
  const greedyLines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (test.length > maxCharsPerLine && current) {
      greedyLines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) greedyLines.push(current)
  const lineCount = greedyLines.length

  if (lineCount <= 1) return { lines: greedyLines, fontSize }

  // Step 2: BALANCING — tries all word splits, picks the one where
  // line lengths are most equal (minimizes max difference)
  // For 2 lines: tries every split point
  // For 3 lines: tries every (i,j) split pair
  // For 4 lines: tries every (i,j,k) split triple
  // ...
```

The greedy wrap is correct and fills lines maximally. But **Step 2** redistributes words across the same number of lines to make them look visually even. This is what causes words like "CAN" to be pushed down.

#### 2. render-slides.cjs — `balanceTitleText()` at [line 138](scripts/render-slides.cjs#L138-L237)

Exact same algorithm as PostCanvas.tsx, ported to Node.js.

#### 3. image_generator.py — uses `wrap_text()` from [text_layout.py](app/utils/text_layout.py#L8-L40)

```python
def wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> List[str]:
    words = text.split()
    lines = []
    current_line = []
    
    for word in words:
        test_line = " ".join(current_line + [word])
        bbox = font.getbbox(test_line)
        width = bbox[2] - bbox[0]
        
        if width <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(" ".join(current_line))
                current_line = [word]
            else:
                lines.append(word)
    
    if current_line:
        lines.append(" ".join(current_line))
    
    return lines if lines else [""]
```

This is already **greedy** — it uses actual pixel measurements (PIL getbbox). No balancing step. This is correct behavior.

However, the **thumbnail generation** in [image_generator.py](app/services/media/image_generator.py#L164-L218) also has font auto-fit logic but uses `wrap_text()` directly (greedy), so it's not affected by the balancing issue. The thumbnail wrapping is fine.

### Demonstration of the problem

Title: `ONE DAILY HABIT CAN CHANGE YOUR HEALTH: A 10-MINUTE WALK AFTER MEALS`

With `fontSize=80`, `maxWidth=990` (1080 - 45*2):
- `avgCharWidth = 80 * 0.48 = 38.4`
- `maxCharsPerLine = floor(990 / 38.4) = 25`

**Greedy wrap** (Step 1):
```
Line 1: "ONE DAILY HABIT CAN CHANGE"     (26 chars — just over 25, so actually...)
```

Wait, let's count more carefully:
- "ONE DAILY HABIT CAN" = 19 chars → fits
- "ONE DAILY HABIT CAN CHANGE" = 26 chars → exceeds 25 → push "CHANGE" to next line
- So greedy gives:
  ```
  Line 1: "ONE DAILY HABIT CAN"          (19 chars)
  Line 2: "CHANGE YOUR HEALTH: A"        (21 chars) 
  Line 3: "10-MINUTE WALK AFTER MEALS"   (26 chars - "10-MINUTE WALK AFTER" = 20, + " MEALS" = 26 → push)
  ```

Actually let me recount. The greedy algorithm compares `test.length > maxCharsPerLine`:
- "ONE" = 3, fits
- "ONE DAILY" = 9, fits
- "ONE DAILY HABIT" = 15, fits
- "ONE DAILY HABIT CAN" = 19, fits
- "ONE DAILY HABIT CAN CHANGE" = 26 > 25 → push! Line 1 = "ONE DAILY HABIT CAN"
- "CHANGE" = 6, fits
- "CHANGE YOUR" = 11, fits
- "CHANGE YOUR HEALTH:" = 19, fits
- "CHANGE YOUR HEALTH: A" = 21, fits
- "CHANGE YOUR HEALTH: A 10-MINUTE" = 31 > 25 → push! Line 2 = "CHANGE YOUR HEALTH: A"
- "10-MINUTE" = 9, fits
- "10-MINUTE WALK" = 14, fits
- "10-MINUTE WALK AFTER" = 20, fits
- "10-MINUTE WALK AFTER MEALS" = 26 > 25 → push! But there's nothing before "MEALS" to push... wait:
  - "10-MINUTE WALK AFTER MEALS" is the test, > 25, current = "10-MINUTE WALK AFTER" → push Line 3 = "10-MINUTE WALK AFTER"
  - current = "MEALS"
  - End → Line 4 = "MEALS"

So greedy gives 4 lines:
```
ONE DAILY HABIT CAN          (19)
CHANGE YOUR HEALTH: A        (21)
10-MINUTE WALK AFTER          (20)
MEALS                         (5)
```

Then balancing (4 lines, 12 words) tries ALL possible (i,j,k) splits and picks the one where max line-length difference is minimized. This could produce something like:
```
ONE DAILY HABIT               (15)
CAN CHANGE YOUR               (15)
HEALTH: A 10-MINUTE           (20)
WALK AFTER MEALS               (16)
```

This is more "balanced" but pushes "CAN" to line 2 when it clearly fits on line 1.

### Proposed fix

**Remove the balancing step** from `balanceTitleText()` in both PostCanvas.tsx and render-slides.cjs. Just return the greedy lines directly.

#### PostCanvas.tsx changes (line 113-213)

Replace the entire `balanceTitleText` function body. After computing `greedyLines`, return them directly instead of running the balancing optimization:

```typescript
export function balanceTitleText(
  title: string,
  maxWidth: number,
  fontSize: number,
): BalancedTitle {
  const upperText = (title || '').toUpperCase().trim()
  const words = upperText.split(/\s+/).filter(Boolean)

  if (words.length === 0) return { lines: [''], fontSize }

  const avgCharWidth = fontSize * 0.48
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth)

  // Greedy wrap: fill each line as much as possible
  const greedyLines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (test.length > maxCharsPerLine && current) {
      greedyLines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) greedyLines.push(current)

  // Clamp to max 4 lines
  if (greedyLines.length > 4) {
    const clamped = greedyLines.slice(0, 3)
    clamped.push(greedyLines.slice(3).join(' '))
    return { lines: clamped, fontSize }
  }

  return { lines: greedyLines, fontSize }
}
```

#### render-slides.cjs changes (line 138-237)

Same change — return greedy lines directly:

```javascript
function balanceTitleText(title, maxWidth, fontSize) {
  const upperText = (title || '').toUpperCase().trim();
  const words = upperText.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [''], fontSize };

  const avgCharWidth = fontSize * 0.48;
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);

  // Greedy wrap: fill each line as much as possible
  const greedyLines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length > maxCharsPerLine && current) {
      greedyLines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) greedyLines.push(current);

  // Clamp to max 4 lines
  if (greedyLines.length > 4) {
    const clamped = greedyLines.slice(0, 3);
    clamped.push(greedyLines.slice(3).join(' '));
    return { lines: clamped, fontSize };
  }

  return { lines: greedyLines, fontSize };
}
```

#### image_generator.py — NO CHANGES NEEDED

The Python `wrap_text()` in [text_layout.py](app/utils/text_layout.py#L8-L40) already uses greedy wrapping with actual pixel measurements. No changes needed.

### Files to modify

| File | Change | Lines |
|------|--------|-------|
| [src/shared/components/PostCanvas.tsx](src/shared/components/PostCanvas.tsx#L113-L213) | Replace `balanceTitleText()` — remove balancing, keep greedy only | L113-L213 |
| [scripts/render-slides.cjs](scripts/render-slides.cjs#L138-L237) | Replace `balanceTitleText()` — same change | L138-L237 |
| [app/api/brands/routes.py](app/api/brands/routes.py#L225-L233) | Modify GET /prompts to return defaults | L225-L233 |
| [app/utils/text_layout.py](app/utils/text_layout.py) | No changes needed (already greedy) | — |
| [app/services/media/image_generator.py](app/services/media/image_generator.py) | No changes needed (uses greedy `wrap_text`) | — |
