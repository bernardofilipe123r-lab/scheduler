# Content DNA System — Major Refactor Spec

**Created:** 2025-02-18
**Status:** Ready for Implementation

---

## Table of Contents

1. [Overview](#overview)
2. [Change 1: Remove Visual Style Section](#change-1-remove-visual-style-section)
3. [Change 2: Replace CTA Section with Weighted CTA Picker](#change-2-replace-cta-section-with-weighted-cta-picker)
4. [Change 3: Fix AI Understanding Reel Preview (1080×1920)](#change-3-fix-ai-understanding-reel-preview)
5. [Change 4: Update Post Examples for Study-Based DOI Format](#change-4-update-post-examples-for-study-based-doi-format)
6. [Change 5: Update Prompt Templates](#change-5-update-prompt-templates)
7. [File-by-File Implementation Guide](#file-by-file-implementation-guide)

---

## Overview

This refactor touches the Content DNA (niche config) system across frontend and backend. The goals are:

- **Simplify** the UI by removing the unused Visual Style section
- **Fix** the broken CTA system by building a weighted CTA picker UI and backend selection
- **Correct** the reel preview dimensions from 1080×1350 (post) to 1080×1920 (9:16 reel)
- **Upgrade** post examples and prompts to study-based DOI format
- **Do NOT** remove any backend DB columns — only stop showing them in the UI for backward compatibility

---

## Change 1: Remove Visual Style Section

### What to Remove (Frontend Only)

- The "Visual Style" `CollapsibleSection` in `NicheConfigForm.tsx`
  - `image_style_description` textarea
  - `image_palette_keywords` TagInput
- Remove `image_style_description` from `ConfigStrengthMeter` scoring in `niche-config.ts`

### What to Keep

- `image_style_description` and `image_palette_keywords` remain in the backend DB model and API — no backend changes
- In `DEFAULT_CONFIG`, keep empty strings for these fields for backward compatibility:
  ```ts
  image_style_description: '',
  image_palette_keywords: [],
  ```

### Scoring Replacement

In `getConfigStrength()` in `niche-config.ts`:
- Remove the `image_style_description` check from the scoring criteria
- Replace it with a `cta_options` check (see Change 2)

---

## Change 2: Replace CTA Section with Weighted CTA Picker

### Current Broken State

- `cta_options` field exists in the DB but has **no UI form**
- The "CTAs & Hashtags" section only contains: hashtags, follow_section_text, save_section_text, disclaimer_text
- CTAs are hardcoded in `app/services/content/generator.py` and `app/core/cta.py`

### New Design

Replace the entire "CTAs & Hashtags" section with a new **"CTAs & Captions"** section.

#### TypeScript Type Change

**File:** `src/features/brands/types/niche-config.ts`

```ts
// OLD:
export interface CtaOption {
  label: string
  text: string
}

// NEW:
export interface CtaOption {
  text: string
  weight: number  // percentage 0-100, all weights must sum to 100
}
```

#### Frontend CTA UI Specification

The CTA picker component renders inside the "CTAs & Captions" `CollapsibleSection`:

1. **CTA List** — up to 10 rows, each row contains:
   - Text input (wide, flex-grow) — placeholder: `"If you want to improve your health, wellness, and habits, follow our page"`
   - Weight number input (narrow, ~80px, suffix `%`) — min 0, max 100, step 1
   - Delete button (trash icon, `X`, or similar)

2. **Action Buttons Row:**
   - "Add CTA" button — disabled when list has 10 items
   - "Auto-distribute" button — sets all weights to `Math.floor(100 / count)`, distributes remainder to the first items (e.g. 3 CTAs → 34%, 33%, 33%)

3. **Validation:**
   - Show warning banner/text (yellow/amber) if weights don't sum to 100
   - Show error if any CTA text is empty but weight > 0
   - Format: `"Weights sum to {sum}% — must equal 100%"`

4. **Remaining fields in the section:**
   - Hashtags `TagInput` (keep as-is)
   - `disclaimer_text` textarea (keep as-is)

5. **Remove from this section:**
   - `follow_section_text` (replaced by CTA examples)
   - `save_section_text` (replaced by CTA examples)

#### DEFAULT_CONFIG Changes

```ts
// In DEFAULT_CONFIG:
cta_options: [],  // was already []
// Remove or leave empty:
follow_section_text: '',  // keep in DEFAULT_CONFIG for backward compat but remove from UI
save_section_text: '',    // keep in DEFAULT_CONFIG for backward compat but remove from UI
```

#### Backend CTA Changes

**File: `app/core/cta.py`**

Rewrite `get_cta_line()`:

```python
import random
from app.core.prompt_context import PromptContext

def get_cta_line(ctx: PromptContext) -> str:
    """Pick a CTA line using weighted random selection from niche config.
    
    Args:
        ctx: PromptContext containing niche_config with cta_options
        
    Returns:
        Selected CTA text, or empty string if no options configured.
    """
    cta_options = []
    if ctx.niche_config and hasattr(ctx.niche_config, 'cta_options'):
        cta_options = ctx.niche_config.cta_options or []
    
    if not cta_options:
        return ''
    
    texts = [opt['text'] for opt in cta_options if opt.get('text')]
    weights = [opt['weight'] for opt in cta_options if opt.get('text')]
    
    if not texts:
        return ''
    
    # weighted random selection
    selected = random.choices(texts, weights=weights, k=1)
    return selected[0]
```

- Remove any global `CTA_OPTIONS` dict from this file
- Accept `PromptContext` as the argument (not just brand name or niche)

**File: `app/services/content/generator.py`**

- Remove the hardcoded `CTA_OPTIONS` dictionary
- Replace CTA selection with `get_cta_line(ctx)` call:
  ```python
  from app.core.cta import get_cta_line
  
  cta_line = get_cta_line(ctx)
  ```
- Pass `ctx` (PromptContext) which already has niche_config loaded

#### Config Strength Scoring

In `getConfigStrength()` in `niche-config.ts`:

```ts
// ADD to scoring criteria (replacing image_style_description):
if (config.cta_options && config.cta_options.length > 0) {
  score += weight  // use same weight that image_style_description had
}
```

---

## Change 3: Fix AI Understanding Reel Preview

### Problem

The AI Understanding preview in `NicheConfigForm.tsx` currently uses `PostCanvas` (1080×1350) for reel previews. Reels are actually **1080×1920 (9:16 aspect ratio)**.

There is no frontend Konva component for reels — reel images are generated by Python Pillow on the backend.

### Solution: CSS-Based Reel Preview Mockup

Create a CSS mockup component (no Konva/Canvas needed). At preview size, use proportional dimensions like **216×384px** (maintaining 9:16 ratio).

#### Reel Preview #1: Thumbnail

```
┌──────────────────┐
│                   │
│   ── HCO ──      │  ← Brand abbreviation with decorative lines
│                   │
│  STUDY REVEALS    │
│  SLEEPING IN A    │  ← Title text: white, centered, uppercase
│  COLD ROOM        │
│  IMPROVES FAT     │
│  METABOLISM        │
│                   │
│                   │
│   ← SWIPE →      │  ← "Swipe" label at bottom
└──────────────────┘
  Label: "Thumbnail"
```

- Background: dark (#1a1a2e)
- Title: white, centered, uppercase, bold
- Brand abbreviation: shown with horizontal lines on each side
- "Swipe" label at bottom center
- Aspect ratio: 9:16

#### Reel Preview #2: Content

```
┌──────────────────┐
│  ████████████     │  ← Colored accent bars at top
│  TITLE TEXT       │  ← Title at top
│                   │
│  1. Content line  │
│  2. Content line  │  ← Numbered content lines
│  3. Content line  │
│  4. Content line  │
│                   │
│                   │
│  CTA text here    │  ← CTA at bottom
│   ← SWIPE →      │
└──────────────────┘
  Label: "Content"
```

- Background: dark (#1a1a2e)
- Title at top with colored accent bars (use brand primary color)
- Numbered content lines in white/light gray
- CTA text at bottom
- "Swipe" indicator

#### Post/Carousel Preview — No Changes Needed

- Keep using `CarouselTextSlide` for carousel text slides (1080×1350) — this is correct
- Keep using `PostCanvas` (1080×1350) for the cover slide — this is correct for posts

#### Implementation Approach

Create inline styled divs or a small CSS module within the AI Understanding section of `NicheConfigForm.tsx`. No separate component file needed unless it gets complex. Structure:

```tsx
// Reel thumbnail mockup
<div style={{ width: 216, height: 384, background: '#1a1a2e', borderRadius: 12, position: 'relative', overflow: 'hidden' }}>
  {/* Brand abbreviation with lines */}
  <div style={{ position: 'absolute', top: '25%', width: '100%', textAlign: 'center', color: '#fff', fontSize: 10 }}>
    ── {brandAbbrev} ──
  </div>
  {/* Title */}
  <div style={{ position: 'absolute', top: '35%', width: '100%', textAlign: 'center', color: '#fff', fontWeight: 'bold', fontSize: 12, textTransform: 'uppercase', padding: '0 12px' }}>
    {reelExample.title}
  </div>
  {/* Swipe label */}
  <div style={{ position: 'absolute', bottom: 16, width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>
    ← SWIPE →
  </div>
</div>
```

Show both previews side by side with labels "Thumbnail" and "Content" underneath.

---

## Change 4: Update Post Examples for Study-Based DOI Format

### Current State

Post examples use generic format: `{ title: string, slides: string[] }`

### New Study-Based Format

Post examples should reflect the study-based content format the brand actually produces.

#### Placeholder Updates in `ContentExamplesSection.tsx`

**Cover title placeholder:**
```
STUDY REVEALS SLEEPING IN A COLD ROOM IMPROVES FAT METABOLISM
```

**Slide placeholder texts (study-based, 2+ sentences each):**
```
Slide 1: "A 2023 study published in Cell Metabolism found that exposure to mild cold temperatures during sleep (around 19°C/66°F) increased brown fat activity by 42%. Brown fat burns calories to generate heat, potentially boosting overnight metabolism."

Slide 2: "Researchers at the National Institutes of Health tracked 12 healthy men over 4 months. Those sleeping in cooled rooms saw significant improvements in insulin sensitivity and metabolic biomarkers compared to the control group."

Slide 3: "The study also found that cold-exposed sleepers had higher levels of irisin, a hormone that converts white fat to metabolically active beige fat. This adaptation persisted even after returning to normal temperatures."

Slide 4: "To implement this, set your bedroom to 60-67°F (15-19°C). Start gradually — even a 2-3 degree reduction can trigger beneficial metabolic adaptations according to the research."

Slide 5 (CTA): "Follow @healthycollege for evidence-based health content"
```

**Caption placeholder:**
```
New research shows that something as simple as lowering your bedroom temperature could significantly boost your metabolism while you sleep. 🧊

A landmark study published in Cell Metabolism found that sleeping in a cool room (around 66°F/19°C) activated brown fat and improved insulin sensitivity in healthy adults.

DOI: 10.1016/j.cmet.2014.07.002

#health #metabolism #sleep #biohacking #coldexposure
```

#### Hint Text

Add hint/helper text near the post examples section:
```
"Post examples should reference real studies with DOI citations in the caption. Each slide should contain 2+ educational sentences."
```

### AI Understanding Prompt Update

In `app/api/niche_config_routes.py`, update the AI understanding prompt that generates post examples:

- Instruct the AI to generate study-based post examples
- Title must reference a study/research finding
- Slides should contain educational detail (2+ sentences each) citing research
- Last slide should be a CTA
- Caption must include a real DOI reference
- Reel examples stay as cause-effect pairs (current format is correct, no changes)

---

## Change 5: Update Prompt Templates

### File: `app/core/prompt_templates.py`

#### `build_post_content_prompt()` Changes

Add/modify the following instructions in the post content prompt:

1. **Study-based titles:** Post cover titles MUST reference a study or research finding. Format: "STUDY REVEALS [FINDING]" or "RESEARCH SHOWS [FINDING]" or "[YEAR] STUDY FOUND [FINDING]"

2. **DOI requirement:** Every post caption MUST include a real DOI reference at the end. Format: `DOI: 10.xxxx/xxxxx`

3. **Slide content:** Each carousel slide must contain 2+ educational sentences citing the research. Content should be factual and reference-backed.

4. **Last slide CTA:** The last carousel slide should be a CTA, randomly selected from the brand's weighted CTA options (using `get_cta_line(ctx)`).

5. **Caption structure:** Caption should include:
   - Brief hook/summary
   - Key finding explanation
   - DOI reference
   - Hashtags

---

## File-by-File Implementation Guide

### 1. `src/features/brands/types/niche-config.ts`

| Change | Detail |
|--------|--------|
| Update `CtaOption` interface | `{ text: string, weight: number }` — remove `label` field |
| Update `getConfigStrength()` | Remove `image_style_description` scoring, add `cta_options` scoring (check length > 0) |

### 2. `src/features/brands/components/NicheConfigForm.tsx`

| Change | Detail |
|--------|--------|
| Remove "Visual Style" section | Delete entire `CollapsibleSection` containing `image_style_description` textarea and `image_palette_keywords` TagInput |
| Replace "CTAs & Hashtags" section | New "CTAs & Captions" section with weighted CTA picker UI |
| Weighted CTA picker | Up to 10 rows: text input + weight % input + delete button. "Add CTA" button (disabled at 10), "Auto-distribute" button |
| Validation | Warning if weights ≠ 100%. Error if CTA text empty but weight > 0 |
| Keep in section | Hashtags TagInput, disclaimer_text textarea |
| Remove from section | `follow_section_text`, `save_section_text` (keep in DEFAULT_CONFIG for compat) |
| Fix reel preview | Replace PostCanvas usage for reel with CSS mockup div at 9:16 ratio (216×384px). Show two previews: Thumbnail + Content |
| DEFAULT_CONFIG | `cta_options: []`, keep `image_style_description: ''`, `image_palette_keywords: []`, `follow_section_text: ''`, `save_section_text: ''` for backward compat |

### 3. `src/features/brands/components/ContentExamplesSection.tsx`

| Change | Detail |
|--------|--------|
| Update post example placeholder title | `"STUDY REVEALS SLEEPING IN A COLD ROOM IMPROVES FAT METABOLISM"` |
| Update slide placeholders | Study-based educational content (2+ sentences each, citing research) |
| Update caption placeholder | Include DOI reference |
| Add hint text | `"Post examples should reference real studies with DOI citations in the caption."` |

### 4. `app/core/cta.py`

| Change | Detail |
|--------|--------|
| Rewrite `get_cta_line()` | Accept `PromptContext` arg, use weighted random selection from `ctx.niche_config.cta_options` |
| Remove global CTA_OPTIONS | Delete any hardcoded CTA dictionaries |
| Fallback | Return empty string if no cta_options configured |

### 5. `app/services/content/generator.py`

| Change | Detail |
|--------|--------|
| Remove hardcoded CTA_OPTIONS | Delete the CTA_OPTIONS dictionary |
| Use `get_cta_line(ctx)` | Import and call `get_cta_line(ctx)` passing PromptContext |

### 6. `app/core/prompt_templates.py`

| Change | Detail |
|--------|--------|
| Update `build_post_content_prompt()` | Add study-based content instructions, DOI requirement, last slide CTA instruction |
| Title format | Must reference study/research: "STUDY REVEALS...", "RESEARCH SHOWS...", etc. |
| Caption format | Must include DOI at end |
| Slide format | 2+ educational sentences per slide citing research |

### 7. `app/api/niche_config_routes.py`

| Change | Detail |
|--------|--------|
| Update AI understanding prompt | Generate study-based post examples with DOI in caption |
| Reel examples | No changes — keep current cause-effect pair format |

---

## Implementation Order

1. **Types first** — Update `niche-config.ts` (CtaOption interface + scoring)
2. **Backend CTA** — Rewrite `cta.py`, update `generator.py`
3. **Backend prompts** — Update `prompt_templates.py`, `niche_config_routes.py`
4. **Frontend form** — `NicheConfigForm.tsx` (remove Visual Style, add CTA picker, fix reel preview)
5. **Frontend examples** — `ContentExamplesSection.tsx` (study-based placeholders)

---

## Testing Checklist

- [ ] Visual Style section no longer appears in the form
- [ ] CTA picker UI renders with add/delete/auto-distribute functionality
- [ ] Weights validation shows warning when ≠ 100%
- [ ] Max 10 CTAs enforced
- [ ] Auto-distribute correctly splits weights
- [ ] Saving config with CTAs persists to DB correctly
- [ ] Loading config with CTAs populates form correctly
- [ ] Backend `get_cta_line(ctx)` returns weighted random CTA
- [ ] Backend falls back to empty string when no CTAs configured
- [ ] Reel preview shows at 9:16 ratio (not 1080×1350)
- [ ] Two reel previews shown: Thumbnail + Content
- [ ] Post example placeholders show study-based content
- [ ] AI understanding generates study-based post examples with DOI
- [ ] `build_post_content_prompt()` includes study/DOI instructions
- [ ] `follow_section_text` and `save_section_text` no longer visible in UI
- [ ] Old configs with `image_style_description` still load without errors
- [ ] Old configs without `cta_options` still load without errors
