# Content Prompts System Audit

## VERDICT: NOT PLACEBO — Prompts ARE connected, but heavily overshadowed by hardcoded content

The user-editable prompts (`reels_prompt`, `posts_prompt`, `brand_description`) **are stored in the DB** and **are injected into the AI generation pipeline**. However, they are **appended at the very end** of massive hardcoded prompts (2000+ words), making their influence minimal. The hardcoded content dominates the AI's behavior.

---

## 1. Frontend — How Prompts Are Saved

### Component: `src/features/brands/components/ContentPromptsCard.tsx`
- Renders 3 `<textarea>` fields: `reels_prompt`, `posts_prompt`, `brand_description`
- Uses `useContentPrompts()` hook to fetch, `useUpdateContentPrompts()` to save

### API Hook: `src/features/brands/api/use-prompts.ts`
- **GET** `/api/v2/brands/prompts` → fetches all 3 prompt values
- **PUT** `/api/v2/brands/prompts` → saves all 3 prompt values
- Uses React Query with `['brand-prompts']` cache key

### Brands Page: `src/pages/Brands.tsx`
- Tab `prompts` renders `<ContentPromptsCard />`
- Accessible via `/brands?tab=prompts`

---

## 2. Backend — How Prompts Are Stored

### Storage: `app_settings` table (NOT the `brands` table)
- Model: `app/models/config.py` → `AppSettings` (key-value store)
- Keys: `reels_prompt`, `posts_prompt`, `brand_description`
- Category: `content`, value_type: `string`
- **These are GLOBAL settings** — not per-brand. All brands share the same prompts.

### Seeding: `app/db_connection.py` (lines 47-49)
- On DB init, seeds empty string values for all 3 keys via `ON CONFLICT DO NOTHING`

### Default Values: `app/api/brands/routes.py` (lines ~260-290)
The GET `/prompts` endpoint auto-populates defaults on first access:

| Key | Default Value |
|-----|--------------|
| `brand_description` | "Health & wellness content brand targeting U.S. women aged 35+. Focus areas: healthy aging, energy optimization, hormonal balance, longevity, evidence-based nutrition, and lifestyle habits. Tone: calm, authoritative, educational, empowering — never clinical or salesy. Content philosophy: 60% validating, 40% surprising." |
| `reels_prompt` | "Generate viral short-form health content for Instagram Reels and TikTok. Focus on: daily habits, body signals, food as medicine, sleep optimization, aging markers, and hormonal health. Use emotional hooks: curiosity, fear of missing out, authority, hope, or sense of control..." |
| `posts_prompt` | "Generate Instagram carousel posts about health & wellness for women 35+. Topic categories: superfoods, supplements, sleep rituals, gut health, hormones, blood sugar balance, cortisol management, strength training, fiber, hydration, brain health..." |

### IMPORTANT: The `brands` table has NO prompt columns
- `app/models/brands.py` — The Brand model has NO `reels_prompt`, `posts_prompt`, or `brand_description` columns
- Prompts are stored in `app_settings`, completely separate from brand data

---

## 3. Backend — Where Prompts ARE Injected (3 locations)

### Location 1: Reel Generation — `app/core/prompt_templates.py` → `build_runtime_prompt()`
```python
# Line 131-137
prompts = get_content_prompts()
brand_desc = prompts.get('brand_description', '').strip()
reels_prompt = prompts.get('reels_prompt', '').strip()
if brand_desc:
    prompt += f"\n\nBRAND CONTEXT:\n{brand_desc}"
if reels_prompt:
    prompt += f"\n\nADDITIONAL INSTRUCTIONS:\n{reels_prompt}"
```
**Position**: Appended at the END of a ~500 token structured prompt.

### Location 2: Post Batch Generation — `app/core/prompt_templates.py` → `build_post_content_prompt()`
```python
# Line 691-698
prompts = get_content_prompts()
brand_desc = prompts.get('brand_description', '').strip()
posts_prompt = prompts.get('posts_prompt', '').strip()
if brand_desc:
    extra_context += f"\n\n### BRAND CONTEXT:\n{brand_desc}"
if posts_prompt:
    extra_context += f"\n\n### ADDITIONAL INSTRUCTIONS:\n{posts_prompt}"
```
**Position**: Appended at the END of a ~2500+ word prompt with 15 full carousel examples.

### Location 3: Single Post Generation — `app/services/content/generator.py` → `generate_post_title()`
```python
# Line 678-684
prompts = get_content_prompts()
brand_desc = prompts.get('brand_description', '').strip()
posts_prompt_text = prompts.get('posts_prompt', '').strip()
if brand_desc:
    prompt += f"\n\n### BRAND CONTEXT:\n{brand_desc}"
if posts_prompt_text:
    prompt += f"\n\n### ADDITIONAL INSTRUCTIONS:\n{posts_prompt_text}"
```
**Position**: Appended at the END of a ~1500 word prompt.

### The `get_content_prompts()` function (prompt_templates.py, line 27-45):
```python
def get_content_prompts() -> Dict[str, str]:
    """Load content prompts from the app_settings table."""
    try:
        from app.db_connection import get_db_session
        with get_db_session() as db:
            from app.models.config import AppSettings
            rows = db.query(AppSettings.key, AppSettings.value)
                .filter(AppSettings.key.in_(['posts_prompt', 'reels_prompt', 'brand_description']))
                .all()
            return {row.key: (row.value or '') for row in rows}
    except Exception as e:
        print(f"⚠️ Could not load content prompts: {e}")
        return {}
```

---

## 4. Hardcoded Content — The Real Problem

The user-editable prompts are **dwarfed** by massive hardcoded instructions. Here's every hardcoded location:

### 4a. `SYSTEM_PROMPT` (prompt_templates.py, line 51-69) — HARDCODED
```
"You are a viral short-form health content generator."
"Use familiar health framing (habits, symptoms, food, sleep, aging, body signals)"
"CONTENT PHILOSOPHY: 60% validating, 40% surprising"
```
**This is sent as the system message for EVERY reel generation and cannot be overridden by user prompts.**

### 4b. `build_runtime_prompt()` (prompt_templates.py, line 75-138) — HARDCODED STRUCTURE
- Topic comes from `PatternSelection` (auto-selected viral patterns)
- Format, hook type, point count all pre-determined by pattern middleware
- User prompts only appended at the very end as "BRAND CONTEXT" and "ADDITIONAL INSTRUCTIONS"

### 4c. `build_post_content_prompt()` (prompt_templates.py, line 554-720) — MASSIVE HARDCODED PROMPT
The function builds a ~2500 word prompt with ALL of these hardcoded:
- **"targeting U.S. women aged 35 and older"** (line 574)
- **"Women 35+ interested in healthy aging, energy, hormones, and longevity"** (line 579)
- 18 hardcoded topic categories (superfoods, supplements, sleep, gut health, hormones, etc.)
- Title style rules with 12+ example titles
- Caption format with DOI requirements
- Carousel slide examples (`CAROUSEL_SLIDE_EXAMPLES` — 15 full examples with slides)
- Image prompt requirements
- All formatting rules

### 4d. `generate_post_title()` (generator.py, line ~510-700) — HARDCODED SINGLE POST PROMPT
Another massive hardcoded prompt:
- **"InLight — a wellness brand"** (line ~530)
- **"U.S. women aged 35 and older"** (line ~530)
- 15+ example titles hardcoded
- Topic descriptions hardcoded
- Caption format rules hardcoded

### 4e. `CAROUSEL_SLIDE_EXAMPLES` (prompt_templates.py, lines 399-553) — 15 FULL EXAMPLES
Hardcoded carousel examples covering:
- Neuroplasticity, Curiosity vs Fear, Collagen, Iron Deficiency
- Post-Meal Walking, Magnesium, Protein After 35, Strength Training
- Fiber, Sleep Quality, Gut Health, Blood Sugar Balance
- Cortisol Management, Walking After Meals, Electrolytes

### 4f. `BRAND_PALETTES` (prompt_templates.py, lines 346-380) — HARDCODED BRAND COLORS
5 brand color palettes hardcoded with color descriptions for AI image generation.

### 4g. `ContentDifferentiator.BASELINE_BRAND` (differentiator.py, line 25)
```python
BASELINE_BRAND = "longevitycollege"  # This brand gets original content
```
And hardcoded brand personality hints (line ~120-127):
```python
brand_hints = {
    "healthycollege": "natural health, whole foods, healthy habits, wellness lifestyle",
    "vitalitycollege": "energy, vitality, metabolism, active performance, vigor",
    "longevitycollege": "longevity, anti-aging, cellular health, prevention, lifespan",
    "holisticcollege": "holistic wellness, mind-body balance, natural healing, integrative health",
    "wellbeingcollege": "overall wellbeing, mental health, life quality, balanced living"
}
```

### 4h. Fallback content (generator.py) — HARDCODED
- `_fallback_content()`: 3 hardcoded reel posts
- `_fallback_post_title()`: 4 hardcoded post fallbacks with full captions
- ALL about health/wellness for women 35+

---

## 5. Summary Table

| Question | Answer |
|----------|--------|
| Are prompts stored in DB? | **YES** — in `app_settings` table as key-value pairs |
| Are they per-brand? | **NO** — they are global (shared across all brands) |
| Are they injected into AI? | **YES** — in 3 locations (reels, batch posts, single posts) |
| Where are they injected? | At the **END** of the prompt as "BRAND CONTEXT" / "ADDITIONAL INSTRUCTIONS" |
| Do they override hardcoded content? | **NO** — they supplement it. The hardcoded 2000+ word prompt dominates. |
| Could a user change the niche? | **Partially** — changing `brand_description` adds context but doesn't remove the hardcoded "women 35+", "health & wellness", topic categories, example titles, etc. |
| Is the Brand model involved? | **NO** — Brand model has zero prompt-related fields |

---

## 6. What Would Need to Change for Truly User-Editable Prompts

### Minimum changes to make prompts actually impactful:

1. **Replace hardcoded audience/niche in `build_post_content_prompt()`**: The string "targeting U.S. women aged 35 and older" and all the hardcoded topic categories need to be dynamic, reading from `brand_description`.

2. **Replace hardcoded audience/niche in `generate_post_title()`**: Same issue — "InLight — a wellness brand targeting U.S. women aged 35 and older" is hardcoded.

3. **Replace hardcoded audience in `SYSTEM_PROMPT`**: "viral short-form health content generator" should be dynamic.

4. **Make `CAROUSEL_SLIDE_EXAMPLES` configurable or removable**: The 15 hardcoded health examples bias the AI heavily toward health/wellness topics regardless of user prompts.

5. **Make prompts per-brand** (optional): Currently global. Add `reels_prompt`, `posts_prompt`, `brand_description` columns to the `brands` table if per-brand customization is needed.

6. **Move user prompts BEFORE hardcoded rules**: Currently appended at the end. The AI may deprioritize them in favor of the massive instruction set above.

7. **The differentiator has hardcoded brand personalities**: `brand_hints` dict in `ContentDifferentiator` would need to read from DB.

### Files that need modification:
- `app/core/prompt_templates.py` — Main target: SYSTEM_PROMPT, build_runtime_prompt, build_post_content_prompt
- `app/services/content/generator.py` — generate_post_title, fallback content
- `app/services/content/differentiator.py` — brand_hints dict
- `app/models/brands.py` — Add prompt columns (if per-brand)
- `app/api/brands_routes_v2.py` / `app/api/brands/routes.py` — Update API if per-brand

---

## 7. Injection Points Diagram

```
User edits prompts in UI
    ↓
PUT /api/v2/brands/prompts → app_settings table
    ↓
get_content_prompts() reads from app_settings
    ↓
REEL GENERATION:
    SYSTEM_PROMPT (hardcoded: "health content generator")    ← NOT overridable
    + build_runtime_prompt() (hardcoded topic/format/hook)   ← NOT overridable  
    + "BRAND CONTEXT: {brand_description}"                   ← FROM DB ✓
    + "ADDITIONAL INSTRUCTIONS: {reels_prompt}"              ← FROM DB ✓

POST GENERATION:
    build_post_content_prompt() (~2500 words hardcoded)      ← NOT overridable
    + 15 carousel examples (all health/wellness)             ← NOT overridable
    + "BRAND CONTEXT: {brand_description}"                   ← FROM DB ✓
    + "ADDITIONAL INSTRUCTIONS: {posts_prompt}"              ← FROM DB ✓

SINGLE POST:
    generate_post_title() (~1500 words hardcoded)            ← NOT overridable
    + "BRAND CONTEXT: {brand_description}"                   ← FROM DB ✓
    + "ADDITIONAL INSTRUCTIONS: {posts_prompt}"              ← FROM DB ✓
```

**Bottom line**: The prompts work, but they're a whisper at the end of a very long conversation. The AI follows the detailed hardcoded instructions first, then tries to accommodate the appended user prompts as a secondary consideration.
