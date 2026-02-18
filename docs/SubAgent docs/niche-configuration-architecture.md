# Niche Configuration Architecture Proposal

> **Date:** 2026-02-18  
> **Status:** Proposal — Ready for review  
> **Scope:** Make the entire content generation system niche-configurable by users  
> **Impact:** 393 hardcoded references across 11 backend files + frontend redesign

---

## Table of Contents

1. [Current State Diagnosis](#part-1-current-state-diagnosis)
2. [Design Philosophy](#part-2-design-philosophy)
3. [Data Model](#part-3-data-model)
4. [Backend Architecture](#part-4-backend-architecture)
5. [Frontend Architecture](#part-5-frontend-architecture)
6. [Implementation Phases](#part-6-implementation-phases)
7. [Files That Need Changes](#part-7-files-that-need-changes)
8. [Risks & Mitigations](#part-8-risks--mitigations)

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
| Brand personality hints are 5 hardcoded dicts | Cannot customize brand differentation |
| Content Prompts tab has 3 vague textareas | No guidance on what fields matter or how they're used |

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

### Principle 2: Template Variables, Not Prompt Replacement

The backend prompt templates become templates with `{variables}` that are populated from user config. Format rules, character limits, JSON output structure — these stay hardcoded. Only the **content topic** gets injected from user settings.

```python
# BEFORE (hardcoded)
"You are a viral short-form health content generator."

# AFTER (template variable)
f"You are a viral short-form {context.niche_name} content generator."

# NEVER (user replaces entire prompt)
user_supplied_system_prompt  # ← This would break everything
```

### Principle 3: Global Defaults + Per-Brand Overrides

```
┌─────────────────────────────────────────┐
│        GLOBAL NICHE CONFIG              │
│  niche: "Health & Wellness"             │
│  audience: "U.S. women aged 35+"        │
│  topics: [superfoods, sleep, gut, ...]  │
│  tone: [calm, authoritative]            │
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

### Principle 4: Safe Boundaries

Users can change **WHAT** the content is about, but never **HOW** it's formatted.

| User-configurable (content) | System-controlled (format) |
|-|-|
| Niche name & description | ALL CAPS title format |
| Target audience | Word-per-line limits (6/8/15/20) |
| Topic categories | Point count ranges per format |
| Content tone keywords | "No text, no letters..." image suffix |
| Brand personality | JSON output format rules |
| Visual style description | Quality score thresholds |
| CTA text | Image dimensions (1080×1920) |
| Hashtags | Fingerprint/cooldown algorithms |

---

## PART 3: DATA MODEL

### 3.1 New `niche_config` Table

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

-- Index for fast lookups
CREATE INDEX idx_niche_config_user ON niche_config(user_id);
CREATE INDEX idx_niche_config_brand ON niche_config(brand_id);
```

### 3.2 Key Design Decisions

**Why a separate table, not expanding `brands` or `app_settings`?**

- `brands` is per-brand only — no global config concept
- `app_settings` is a flat key-value store — JSONB arrays and nested objects don't fit well
- A dedicated table allows a clean global+override pattern: `brand_id IS NULL` = global, `brand_id = 'xyz'` = per-brand override
- Easier to add fields as the system evolves

**Why does `brand_id NULL` mean global?**

The merge pattern: query global config WHERE `brand_id IS NULL`, then overlay any per-brand config WHERE `brand_id = ?`. Per-brand rows only need non-NULL values for fields they want to override — everything else falls through to global.

### 3.3 Default Values = Current Hardcoded Values

Every default in the table schema above matches what's currently hardcoded. This means:

- **Zero breaking changes** on first deployment
- Existing content generation produces identical results
- Users only see differences when they actively edit settings

---

## PART 4: BACKEND ARCHITECTURE

### 4A. PromptContext Dataclass

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

    # Derived / computed
    @property
    def tone_string(self) -> str:
        """Comma-separated tone for inline prompt use."""
        return ", ".join(self.content_tone)
    
    @property
    def tone_avoid_string(self) -> str:
        return ", ".join(self.tone_avoid)
    
    @property
    def topic_framing(self) -> str:
        """First 6 topic keywords for framing references."""
        return ", ".join(self.topic_keywords[:6])
    
    @property
    def hashtag_string(self) -> str:
        return " ".join(self.hashtags)
```

### 4B. Template Variable Injection — Before/After Examples

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

#### Example 2: build_post_content_prompt() — Brand/Audience Section

```python
# ❌ BEFORE (prompt_templates.py, line 519-523)
prompt = f"""You are a health content creator for InLight, a wellness brand targeting U.S. women aged 35 and older.

Generate EXACTLY {count} COMPLETELY DIFFERENT health-focused posts...

### TARGET AUDIENCE:
Women 35+ interested in healthy aging, energy, hormones, and longevity."""

# ✅ AFTER
prompt = f"""You are a {ctx.niche_name.lower()} content creator for {ctx.parent_brand_name}, a brand targeting {ctx.target_audience}.

Generate EXACTLY {count} COMPLETELY DIFFERENT {ctx.niche_name.lower()}-focused posts. Each post MUST cover a DIFFERENT topic category.

### TARGET AUDIENCE:
{ctx.audience_description}"""
```

#### Example 3: build_post_content_prompt() — Topic Categories

```python
# ❌ BEFORE (prompt_templates.py, lines 530-547)
"""Pick {count} DIFFERENT categories from this list:
1. Superfoods and healing ingredients (turmeric, ginger, berries, honey, cinnamon)
2. Teas and warm drinks (green tea, chamomile, matcha, golden milk)
3. Supplements and vitamins (collagen, magnesium, vitamin D, omega-3, probiotics)
...
18. Fiber intake and digestive health"""

# ✅ AFTER
topic_list = "\n".join(
    f"{i+1}. {topic}" for i, topic in enumerate(ctx.topic_categories)
)
f"""Pick {{count}} DIFFERENT categories from this list:
{topic_list}"""
```

#### Example 4: ContentDifferentiator — Brand Personality

```python
# ❌ BEFORE (differentiator.py, lines 107-113)
brand_hints = {
    "healthycollege": "natural health, whole foods, healthy habits, wellness lifestyle",
    "vitalitycollege": "energy, vitality, metabolism, active performance, vigor",
    "longevitycollege": "longevity, anti-aging, cellular health, prevention, lifespan",
    "holisticcollege": "holistic wellness, mind-body balance, natural healing, integrative health",
    "wellbeingcollege": "overall wellbeing, mental health, life quality, balanced living"
}

# ✅ AFTER
def _get_brand_hint(self, brand_id: str) -> str:
    """Load brand personality from niche config, falling back to global niche description."""
    ctx = self.niche_config_service.get_context(brand_id=brand_id)
    if ctx.brand_personality:
        return ctx.brand_personality
    return ctx.niche_description
```

### 4C. NicheConfigService

```python
# app/services/content/niche_config_service.py

from functools import lru_cache
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
        """
        Get the merged PromptContext for a given brand (or global default).
        
        Args:
            brand_id: If provided, merges brand-specific overrides on top of global.
            user_id: User scope. If None, uses the first available user.
        Returns:
            Fully populated PromptContext.
        """
        cache_key = f"{user_id}:{brand_id or 'global'}"
        
        # Check cache
        if cache_key in self._cache:
            cached_at = self._cache_timestamps.get(cache_key)
            if cached_at and datetime.utcnow() - cached_at < self._cache_ttl:
                return self._cache[cache_key]
        
        # Load from DB
        ctx = self._load_and_merge(brand_id, user_id)
        
        # Cache
        self._cache[cache_key] = ctx
        self._cache_timestamps[cache_key] = datetime.utcnow()
        
        return ctx
    
    def invalidate_cache(self, brand_id: Optional[str] = None, user_id: Optional[str] = None):
        """Invalidate cache entries after config updates."""
        if brand_id and user_id:
            self._cache.pop(f"{user_id}:{brand_id}", None)
        # Always invalidate global since changes may cascade
        if user_id:
            self._cache.pop(f"{user_id}:global", None)
        else:
            # Nuclear invalidation
            self._cache.clear()
            self._cache_timestamps.clear()
    
    def _load_and_merge(self, brand_id: Optional[str], user_id: Optional[str]) -> PromptContext:
        """Load global config, overlay brand-specific overrides, return PromptContext."""
        from app.db_connection import get_db_session
        from app.models.niche_config import NicheConfig
        
        ctx = PromptContext()  # Start with defaults (= current hardcoded values)
        
        try:
            with get_db_session() as db:
                # Load global config
                global_cfg = (
                    db.query(NicheConfig)
                    .filter(NicheConfig.user_id == user_id, NicheConfig.brand_id.is_(None))
                    .first()
                )
                
                if global_cfg:
                    ctx = self._apply_config(ctx, global_cfg)
                
                # Load per-brand override
                if brand_id:
                    brand_cfg = (
                        db.query(NicheConfig)
                        .filter(NicheConfig.user_id == user_id, NicheConfig.brand_id == brand_id)
                        .first()
                    )
                    if brand_cfg:
                        ctx = self._apply_config(ctx, brand_cfg)
        
        except Exception as e:
            print(f"⚠️ Could not load niche config, using defaults: {e}")
        
        return ctx
    
    def _apply_config(self, ctx: PromptContext, cfg) -> PromptContext:
        """Apply non-NULL config fields onto a PromptContext."""
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

### 4D. Migration Strategy

#### Step 1: Additive-only database changes

- Create `niche_config` table with all columns having defaults matching current hardcoded values.
- Run `INSERT INTO niche_config (user_id, brand_id) VALUES (?, NULL)` for each existing user to seed global config with defaults.
- **No existing tables modified. No columns removed.**

#### Step 2: Backend reads from PromptContext, falls back to defaults

```python
# Every prompt builder gets a ctx argument, but defaults to current behavior:
def build_system_prompt(ctx: PromptContext = None) -> str:
    if ctx is None:
        ctx = PromptContext()  # ← defaults match current hardcoded values
    ...
```

- If `niche_config` table is empty or unreachable → `PromptContext()` defaults are used → **identical to current behavior**.
- All existing code paths continue working unchanged until a user actively modifies their config.

#### Step 3: Gradual replacement

Replace hardcoded strings with `ctx.{field}` references **one file at a time**, running integration tests after each file to verify identical outputs:

```
1. prompt_templates.py — SYSTEM_PROMPT, build_runtime_prompt, build_post_content_prompt
2. generator.py — generate_post_title, fallback content  
3. differentiator.py — brand_hints
4. caption_generator.py — brand handles, CTA text
5. quality_scorer.py — health keywords → niche keywords
6. viral_patterns.py — topic buckets
7. tracker.py — topic buckets (consolidate with viral_patterns)
```

#### Step 4: Frontend migration

The existing `ContentPromptsCard` (3 textareas) continues working during migration. The new `NicheConfigForm` is built alongside it and replaces it once complete.

**The old `reels_prompt`, `posts_prompt`, `brand_description` keys in `app_settings` are kept for backward compatibility** — the `NicheConfigService` can read from them as a migration fallback:

```python
# In NicheConfigService._load_and_merge():
if global_cfg is None:
    # Migration fallback: read from legacy app_settings
    legacy = get_content_prompts()  # existing function
    if legacy.get('brand_description'):
        ctx.niche_description = legacy['brand_description']
```

---

## PART 5: FRONTEND ARCHITECTURE

### 5A. New "Content Prompts" Tab Redesign

The current 3-textarea `ContentPromptsCard` is replaced with a structured form organized in collapsible sections:

```
┌──────────────────────────────────────────────────────────────┐
│  Content Configuration                              [Save]   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📍 NICHE & AUDIENCE                        [always open] │
│  │                                                        │  │
│  │  Niche Name     [Health & Wellness          ▾]         │  │
│  │                  (dropdown with suggestions + custom)   │  │
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
│  │ 🖼️ VISUAL STYLE                          [▸ expand]    │  │
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
│  │           [👁️ Preview Prompt]                           │  │
│  │  Shows the final assembled prompt (read-only)          │  │
│  │  so users see how their fields affect the AI output.   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**"Preview Prompt" button**: Calls the existing `POST /api/prompts/build-final` endpoint (or a new variant), which assembles the full prompt using the user's current config and returns it as read-only text. This gives users transparency into how their fields are used.

### 5B. Global vs Per-Brand Settings

#### On the Brands page → Content Prompts tab

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

When "Use global" is checked → per-brand `niche_config` row has `NULL` for those fields → merge logic falls through to global.

When "Use global" is unchecked → per-brand values are saved → merge logic uses them.

### 5C. TypeScript Interface

```typescript
// src/features/brands/types/niche-config.ts

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
```

### 5D. API Hooks

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
    onSuccess: (_, variables) => {
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

---

## PART 6: IMPLEMENTATION PHASES

### Phase 1: MVP (Do First)

**Goal:** Make the 3 highest-impact variables dynamic so a user can change the niche and see immediate results.

| Task | Details |
|------|---------|
| Create `PromptContext` dataclass | [app/core/prompt_context.py](app/core/prompt_context.py) — all fields with defaults matching current hardcoded values |
| Create `niche_config` table | Migration script — see Part 3 schema |
| Create `NicheConfig` SQLAlchemy model | [app/models/niche_config.py](app/models/niche_config.py) |
| Create `NicheConfigService` | [app/services/content/niche_config_service.py](app/services/content/niche_config_service.py) — load, merge, cache |
| Wire 3 variables into prompts | Replace hardcoded `niche_description`, `target_audience`, `brand_personality` in `prompt_templates.py` and `generator.py` |
| Seed defaults for existing users | Migration: insert global config row with defaults |
| Add API endpoints | `GET/PUT /api/v2/brands/niche-config` |
| Build simple frontend | 5 key fields: niche_name, target_audience, audience_description, brand_personality, parent_brand_name |
| Keep legacy prompts working | `get_content_prompts()` still reads from `app_settings` as fallback |

**Deliverable:** User can change niche name from "Health & Wellness" to "Personal Finance" and see prompts update. The 3 textareas remain functional as a fallback.

### Phase 2: Full Structured Config

**Goal:** All fields from the data model are wired in and editable.

| Task | Details |
|------|---------|
| Wire topic_categories | Replace 3 hardcoded topic lists (prompt_templates, viral_patterns, tracker) with `ctx.topic_categories` |
| Wire content_tone | Replace 14 hardcoded tone references |
| Wire image_style_description | Replace 22 hardcoded visual style references |
| Wire CTA options | Consolidate 3 CTA definition files into DB-backed `ctx.cta_options` |
| Wire hashtags | Replace `DEFAULT_HASHTAGS` and `HASHTAGS` constants |
| Build full NicheConfigForm | All 6 collapsible sections, tag inputs, chips |
| Build prompt preview | "Preview Prompt" button with backend endpoint |
| Update quality_scorer.py | Replace health-specific keywords with `ctx.topic_keywords` |
| Consolidate duplicated topic lists | One source of truth in `PromptContext`, consumed by viral_patterns, tracker, and prompt_templates |

**Deliverable:** Full structured config UI. All hardcoded niche references replaced with template variables.

### Phase 3: Advanced

**Goal:** Per-brand overrides, presets, import/export.

| Task | Details |
|------|---------|
| Per-brand overrides | "Use global ☑" toggle per section, brand-specific config rows |
| Preset templates | Pre-built configs: "Health & Wellness", "Personal Finance", "Tech Review", "Fitness", "Cooking" |
| Import/export | JSON export/import of niche configs for sharing or backup |
| Prompt preview per brand | Show how merged global + brand config produces a different prompt |
| Carousel examples | Make the 15 carousel examples configurable (advanced admin) or auto-generate niche-appropriate examples on first run |
| Viral ideas database | Migrate from `viral_ideas.py` hardcoded list to DB-backed collection |

---

## PART 7: FILES THAT NEED CHANGES

### Backend — New Files

| File | Description |
|------|-------------|
| `app/core/prompt_context.py` | `PromptContext` dataclass — single source of truth for all niche variables |
| `app/models/niche_config.py` | SQLAlchemy model for `niche_config` table |
| `app/services/content/niche_config_service.py` | Service: load global + per-brand config, merge, cache, return `PromptContext` |
| `app/api/niche_config_routes.py` | API endpoints: GET/PUT niche config, preview prompt |

### Backend — Modified Files

| File | Change |
|------|--------|
| `app/core/prompt_templates.py` | Replace `SYSTEM_PROMPT` string with `build_system_prompt(ctx)`. Replace hardcoded audience/niche in `build_runtime_prompt()` and `build_post_content_prompt()` with `ctx.*` variables. Replace `BRAND_PALETTES`, `IMAGE_PROMPT_SYSTEM`, `IMAGE_PROMPT_GUIDELINES` with `ctx.image_style_description`. |
| `app/services/content/generator.py` | Accept `PromptContext` in `generate_viral_content()`, `generate_post_title()`, `generate_post_titles_batch()`. Replace hardcoded audience/niche/topic references in prompts. Parameterize `CTA_OPTIONS` from `ctx.cta_options`. Parameterize `_fallback_content()` and `_fallback_post_title()` to use niche-neutral defaults or skip. |
| `app/services/content/differentiator.py` | Replace hardcoded `brand_hints` dict with DB-backed `ctx.brand_personality` per brand. Replace `BASELINE_BRAND` constant with DB field (`brands.baseline_for_content`). |
| `app/services/media/caption_generator.py` | Replace hardcoded `BRAND_HANDLES` with DB lookup (`brand.instagram_handle`). Replace hardcoded `CTA_OPTIONS` with `ctx.cta_options`. Replace hardcoded `HASHTAGS` with `ctx.hashtag_string`. Replace hardcoded follow/save section text with `ctx.follow_section_text`/`ctx.save_section_text`. Replace "health and wellness content writer" system role with `ctx.niche_name`. |
| `app/core/viral_patterns.py` | Parameterize `TOPIC_BUCKETS` — read from `ctx.topic_categories` or keep as fallback default. Parameterize health-specific variables in `TITLE_ARCHETYPES` (body parts, states, outcomes). |
| `app/core/quality_scorer.py` | Replace `HOOK_KEYWORDS` health-specific words with `ctx.topic_keywords`. Replace `health_keywords` list with `ctx.topic_keywords`. Replace `familiar_items` list with niche-appropriate items. Replace `familiar_patterns` regex with niche-agnostic patterns. |
| `app/core/cta.py` | Read CTA options from `ctx.cta_options` instead of hardcoded dicts. |
| `app/core/constants.py` | Replace `DEFAULT_HASHTAGS` with fallback only; primary source becomes `ctx.hashtags`. |
| `app/services/content/tracker.py` | Replace hardcoded `TOPIC_BUCKETS` with `ctx.topic_categories` (or shared constant). |
| `app/api/brands_routes_v2.py` | Add niche config endpoints (`GET/PUT /api/v2/brands/niche-config`). |
| `app/api/routes.py` | Wire new niche config router. |
| `app/db_connection.py` | Import new `NicheConfig` model for table creation. |

### Frontend — New Files

| File | Description |
|------|-------------|
| `src/features/brands/components/NicheConfigForm.tsx` | New structured form with collapsible sections, tag inputs, chip selectors |
| `src/features/brands/components/TagInput.tsx` | Reusable tag input component (add/remove tags) |
| `src/features/brands/components/ChipSelect.tsx` | Reusable multi-select chip component |
| `src/features/brands/components/PromptPreview.tsx` | Read-only prompt preview modal |
| `src/features/brands/api/use-niche-config.ts` | `useNicheConfig()`, `useUpdateNicheConfig()`, `usePromptPreview()` hooks |
| `src/features/brands/types/niche-config.ts` | `NicheConfig` TypeScript interface |

### Frontend — Modified Files

| File | Change |
|------|--------|
| `src/features/brands/components/ContentPromptsCard.tsx` | Replace with `NicheConfigForm` (or keep as legacy fallback during Phase 1) |
| `src/features/brands/components/BrandsTabBar.tsx` | Update tab label from "Content Prompts" to "Content Configuration" |
| `src/features/brands/components/index.ts` | Export new components |
| `src/features/brands/api/index.ts` | Export new hooks |
| `src/pages/Brands.tsx` | Swap `ContentPromptsCard` for `NicheConfigForm` in the prompts tab |

---

## PART 8: RISKS & MITIGATIONS

### Risk 1: User enters bad niche → garbage content

| Aspect | Detail |
|--------|--------|
| **Scenario** | User types "asdf" as niche name, or "underwater basket weaving" — the AI generates incoherent content |
| **Probability** | Medium |
| **Mitigation** | Suggested niche dropdown with common options (Health & Wellness, Personal Finance, Fitness, Tech, Cooking, Education, Business, Lifestyle). Custom input allowed but shown with a "Custom niche" indicator. Prompt preview lets users inspect the assembled prompt before generating. |

### Risk 2: Empty fields break prompts

| Aspect | Detail |
|--------|--------|
| **Scenario** | User clears `niche_name` or `target_audience` → `f"You are a {ctx.niche_name} content generator"` becomes `"You are a  content generator"` |
| **Probability** | High |
| **Mitigation** | `PromptContext` defaults are *always* populated. Frontend validates required fields (niche_name, target_audience) — cannot be empty. Backend: `NicheConfigService` falls back to `PromptContext()` defaults if DB returns NULL/empty. |

### Risk 3: Too much flexibility breaks output format

| Aspect | Detail |
|--------|--------|
| **Scenario** | User writes instructions in a textarea that contradict JSON output format, slide count rules, or character limits |
| **Probability** | Low (with structured fields) |
| **Mitigation** | Users configure through structured fields, not raw prompt text. Format rules (ALL CAPS, word limits, JSON output, no emojis) remain hardcoded in prompts — not exposed to users. The "safe boundary" principle: users control *what*, system controls *how*. |

### Risk 4: Quality scorer fails for non-health niches

| Aspect | Detail |
|--------|--------|
| **Scenario** | Quality scorer uses `health_keywords = ["body", "health", "sleep", "gut", ...]` for familiarity scoring. A finance post about "compound interest" would score 0 on familiarity. |
| **Probability** | Certain (without changes) |
| **Mitigation** | Phase 2 replaces `health_keywords` with `ctx.topic_keywords` in quality scorer. Phase 1 MVP: lower the familiarity weight from 20% to 10%, log warnings but don't reject. |

### Risk 5: Carousel examples anchor AI to health content

| Aspect | Detail |
|--------|--------|
| **Scenario** | Even if niche is changed to "Personal Finance", the 15 hardcoded carousel examples (all about collagen, magnesium, sleep) bias the AI back toward health topics |
| **Probability** | High |
| **Mitigation** | Phase 1: Add a preamble to examples — "These examples demonstrate STRUCTURE and FORMAT only. The topic must match the niche specified above, not the examples." Phase 2: Allow custom examples per niche (admin feature). Phase 3: Auto-generate niche-appropriate examples using AI on niche config save. |

### Risk 6: Migration breaks existing content generation

| Aspect | Detail |
|--------|--------|
| **Scenario** | Deploying the new system changes prompt outputs, causing different content quality |
| **Probability** | Low (with proper defaults) |
| **Mitigation** | All `PromptContext` defaults match current hardcoded values exactly. Existing users see zero changes until they actively edit their config. Feature flag: `ENABLE_NICHE_CONFIG=false` env var to disable the new system entirely if issues arise. |

### Risk 7: Cache staleness

| Aspect | Detail |
|--------|--------|
| **Scenario** | User updates niche config but the 5-minute cache serves stale values to the next generation |
| **Probability** | Medium |
| **Mitigation** | `NicheConfigService.invalidate_cache()` is called immediately on config save (in the PUT endpoint handler). Cache TTL is a safety net for missed invalidations, not the primary freshness mechanism. |

### Risk 8: Per-brand override complexity

| Aspect | Detail |
|--------|--------|
| **Scenario** | Users accidentally override one field for a brand, forget about it, then wonder why that brand produces different content |
| **Probability** | Medium |
| **Mitigation** | Clear visual indicators in UI: "Using custom settings" badge on brand cards with overrides. "Reset to global" button per section. Hover tooltip showing which fields are overridden. |

---

## APPENDIX: Data Flow Diagram

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
│  └─────────────────┬───────────────────────────┘                         │
└─────────────────────┼────────────────────────────────────────────────────┘
                      │ PUT /api/v2/brands/niche-config
                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  BACKEND                                                                  │
│                                                                          │
│  brands_routes_v2.py                                                     │
│  └─→ Validates & saves to niche_config table                             │
│  └─→ Invalidates NicheConfigService cache                                │
│                                                                          │
│  ┌─ NicheConfigService ──────────────────────────────────────────────┐   │
│  │                                                                    │   │
│  │  1. Load global config (brand_id IS NULL)                          │   │
│  │  2. Load per-brand config (brand_id = ?)                           │   │
│  │  3. Merge: per-brand overrides global (non-NULL fields)            │   │
│  │  4. Return PromptContext                                           │   │
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
│  │  ...all other fields populated...                                │     │
│  └──────────────────────┬─────────────────────────────────────────┘       │
│                         │                                                 │
│           ┌─────────────┼─────────────┬──────────────┐                    │
│           ▼             ▼             ▼              ▼                    │
│  build_system_prompt  build_runtime  build_post   differentiator         │
│  (ctx)               _prompt(ctx)    _prompt(ctx)  .get_hint(ctx)        │
│           │             │             │              │                    │
│           ▼             ▼             ▼              ▼                    │
│  "You are a viral    "Topic:       "You are a     "Brand focuses on     │
│   short-form          budgeting"    personal       investment strategy   │
│   Personal Finance                  finance        and passive income"   │
│   content generator"                creator..."                          │
│                                                                          │
│  ────────────────────── All prompts now niche-aware ──────────────────   │
│                         │                                                 │
│                         ▼                                                 │
│                    DeepSeek API                                           │
│                    → Finance content                                      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

*This architecture proposal was generated from analysis of 4 audit documents and 11 source files. It is designed to be implemented incrementally with zero breaking changes at each phase.*
