# Populate Niche Config — Research Spec

> Generated: 2026-02-18

---

## 1. Database Table: `niche_config`

### Full Column List

| Column | DB Type | SQLAlchemy Type | Nullable | Default | Constraint |
|--------|---------|-----------------|----------|---------|------------|
| `id` | `VARCHAR(36)` | `String(36)` | NO (PK) | `uuid4()` | Primary Key |
| `user_id` | `VARCHAR(100)` | `String(100)` | NO | — | Part of unique constraint |
| `brand_id` | `VARCHAR(50)` | `String(50)` | YES | `NULL` | FK → `brands(id)` ON DELETE CASCADE; Part of unique constraint |
| `niche_name` | `VARCHAR(100)` | `String(100)` | NO | `""` | — |
| `niche_description` | `TEXT` | `Text` | YES | `""` | — |
| `target_audience` | `VARCHAR(255)` | `String(255)` | YES | `""` | — |
| `audience_description` | `TEXT` | `Text` | YES | `""` | — |
| `content_tone` | `JSONB` | `JSONB` | YES | `[]` | List of strings |
| `tone_avoid` | `JSONB` | `JSONB` | YES | `[]` | List of strings |
| `topic_categories` | `JSONB` | `JSONB` | YES | `[]` | List of strings |
| `topic_keywords` | `JSONB` | `JSONB` | YES | `[]` | List of strings |
| `topic_avoid` | `JSONB` | `JSONB` | YES | `[]` | List of strings |
| `content_philosophy` | `TEXT` | `Text` | YES | `""` | — |
| `hook_themes` | `JSONB` | `JSONB` | YES | `[]` | List of strings |
| `reel_examples` | `JSONB` | `JSONB` | YES | `[]` | List of `{title, content_lines}` |
| `post_examples` | `JSONB` | `JSONB` | YES | `[]` | List of `{title, slides}` |
| `image_style_description` | `TEXT` | `Text` | YES | `""` | — |
| `image_palette_keywords` | `JSONB` | `JSONB` | YES | `[]` | List of strings |
| `brand_personality` | `TEXT` | `Text` | YES | `NULL` | — |
| `brand_focus_areas` | `JSONB` | `JSONB` | YES | `[]` | List of strings |
| `parent_brand_name` | `VARCHAR(100)` | `String(100)` | YES | `""` | — |
| `cta_options` | `JSONB` | `JSONB` | YES | `[]` | List of `{label, text}` |
| `hashtags` | `JSONB` | `JSONB` | YES | `[]` | List of strings |
| `follow_section_text` | `TEXT` | `Text` | YES | `""` | — |
| `save_section_text` | `TEXT` | `Text` | YES | `""` | — |
| `disclaimer_text` | `TEXT` | `Text` | YES | `""` | — |
| `created_at` | `TIMESTAMP` | `DateTime` | YES | `NOW()` | — |
| `updated_at` | `TIMESTAMP` | `DateTime` | YES | `NOW()` | Auto-updates |

### Constraints
- **PK**: `id` (UUID v4 string)
- **Unique**: `(user_id, brand_id)` — one config per user per brand; `brand_id=NULL` = global config
- **FK**: `brand_id → brands(id) ON DELETE CASCADE`
- **Indexes**: `idx_niche_config_user_id`, `idx_niche_config_brand_id`

---

## 2. Pydantic Schema: `NicheConfigUpdate`

Defined in `app/api/niche_config_routes.py` (NOT in `schemas.py` — the schemas.py file only has Reel schemas):

```python
class NicheConfigUpdate(BaseModel):
    brand_id: Optional[str] = None
    niche_name: Optional[str] = Field(None, max_length=100)
    niche_description: Optional[str] = None
    target_audience: Optional[str] = Field(None, max_length=255)
    audience_description: Optional[str] = None
    content_tone: Optional[list] = None
    tone_avoid: Optional[list] = None
    topic_categories: Optional[list] = None
    topic_keywords: Optional[list] = None
    topic_avoid: Optional[list] = None
    content_philosophy: Optional[str] = None
    hook_themes: Optional[list] = None
    reel_examples: Optional[list] = None
    post_examples: Optional[list] = None
    image_style_description: Optional[str] = None
    image_palette_keywords: Optional[list] = None
    brand_personality: Optional[str] = None
    brand_focus_areas: Optional[list] = None
    parent_brand_name: Optional[str] = Field(None, max_length=100)
    cta_options: Optional[list] = None
    hashtags: Optional[list] = None
    follow_section_text: Optional[str] = None
    save_section_text: Optional[str] = None
    disclaimer_text: Optional[str] = None
```

### API Endpoints
- `GET /niche-config?brand_id=X` — returns config or PromptContext defaults
- `PUT /niche-config` — upsert (create or update) config
- `POST /niche-config/ai-understanding` — AI-generated brand understanding summary

### Example Validation Limits
- Max 20 reel examples, 20 post examples
- Max 15 content lines per reel, 15 slides per post
- Max 200 char title, 500 char per line

---

## 3. PromptContext Dataclass Fields

The `PromptContext` (in `app/core/prompt_context.py`) has a **1:1 mapping** with `niche_config` table columns. The service copies DB values directly to the dataclass.

| PromptContext Field | Type | Default | Maps to DB Column |
|---------------------|------|---------|-------------------|
| `niche_name` | `str` | `""` | `niche_name` |
| `niche_description` | `str` | `""` | `niche_description` |
| `target_audience` | `str` | `""` | `target_audience` |
| `audience_description` | `str` | `""` | `audience_description` |
| `content_tone` | `List[str]` | `[]` | `content_tone` |
| `tone_avoid` | `List[str]` | `[]` | `tone_avoid` |
| `topic_categories` | `List[str]` | `[]` | `topic_categories` |
| `topic_keywords` | `List[str]` | `[]` | `topic_keywords` |
| `topic_avoid` | `List[str]` | `[]` | `topic_avoid` |
| `content_philosophy` | `str` | `""` | `content_philosophy` |
| `hook_themes` | `List[str]` | `[]` | `hook_themes` |
| `reel_examples` | `List[dict]` | `[]` | `reel_examples` |
| `post_examples` | `List[dict]` | `[]` | `post_examples` |
| `image_style_description` | `str` | `""` | `image_style_description` |
| `image_palette_keywords` | `List[str]` | `[]` | `image_palette_keywords` |
| `brand_personality` | `Optional[str]` | `None` | `brand_personality` |
| `brand_focus_areas` | `List[str]` | `[]` | `brand_focus_areas` |
| `parent_brand_name` | `str` | `""` | `parent_brand_name` |
| `cta_options` | `List[dict]` | `[]` | `cta_options` |
| `hashtags` | `List[str]` | `[]` | `hashtags` |
| `follow_section_text` | `str` | `""` | `follow_section_text` |
| `save_section_text` | `str` | `""` | `save_section_text` |
| `disclaimer_text` | `str` | `""` | `disclaimer_text` |

### Computed Properties on PromptContext
- `tone_string` → comma-joined `content_tone`
- `tone_avoid_string` → comma-joined `tone_avoid`
- `topic_framing` → first 6 of `topic_keywords`, comma-joined
- `hashtag_string` → space-joined `hashtags`
- `has_reel_examples` / `has_post_examples` → bool checks
- `example_count` → total examples

---

## 4. NicheConfigService — How Configs Are Loaded

File: `app/services/content/niche_config_service.py`

### Load Strategy
1. Start with empty `PromptContext()` (all defaults are empty strings / empty lists)
2. Load global config: `WHERE user_id = ? AND brand_id IS NULL`
3. Load per-brand config: `WHERE user_id = ? AND brand_id = ?`
4. Merge: per-brand values **override** global values for non-None fields
5. Cache result with **5-minute TTL**

### Key Implication
- A global config (`brand_id = NULL`) sets baseline for ALL brands
- Per-brand config overrides only the fields that are explicitly set
- If no config exists at all, every field is empty → prompts get blank niche data

---

## 5. Current Defaults & Constants

### `app/core/constants.py` — All niche-related defaults are EMPTY
- `DEFAULT_HASHTAGS = []`
- No hardcoded niche content remains

### `app/core/cta.py` — CTA system is dynamic
- `CTA_OPTIONS = {}` (empty dict)
- `get_cta_options(ctx)` loads from `PromptContext.cta_options`
- Falls back to empty dict if no config

### `app/core/viral_ideas.py` — Empty, dynamic
- `VIRAL_IDEAS = []` — hardcoded ideas were removed
- Content now comes from `NicheConfig.reel_examples`

### Prompt Templates (`app/core/prompt_templates.py`)
- `build_system_prompt(ctx)` — uses `ctx.niche_name`, `ctx.topic_framing`, `ctx.hook_themes`, `ctx.tone_string`, `ctx.tone_avoid_string`, `ctx.content_philosophy`
- `build_runtime_prompt(selection, ctx)` — uses the same context
- All prompts expect populated PromptContext; empty context = generic/broken prompts

---

## 6. Existing Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create_niche_config_table.py` | Creates the `niche_config` table DDL. Already run (table exists). |
| `scripts/migrate_brand_colors.py` | Migrates brand color data |
| `scripts/validate_user_data.py` | Validates user data integrity |

**No script exists to populate niche_config rows with actual content data.**

---

## 7. Brand IDs

The `brands` table uses string IDs (e.g., `healthycollege`). Brands are scoped by `user_id`.

To find brands for user `7c7bdcc7-ad79-4554-8d32-e5ef02608e84`, query:
```sql
SELECT id, display_name FROM brands WHERE user_id = '7c7bdcc7-ad79-4554-8d32-e5ef02608e84';
```

Known brand ID patterns from the `assets/examples/` directory:
- `healthycollege`
- `holisticcollege`
- `longevitycollege`
- `vitalitycollege`
- `wellbeingcollege`

---

## 8. Data Flow Summary

```
User fills Content DNA UI
    → PUT /niche-config (NicheConfigUpdate)
        → Upsert into niche_config table
        → Invalidate cache

Content generation request arrives
    → NicheConfigService.get_context(brand_id, user_id)
        → Load global config (brand_id IS NULL)
        → Load per-brand config (brand_id = X)
        → Merge → PromptContext
    → build_system_prompt(ctx) / build_runtime_prompt(selection, ctx)
        → Uses ctx.niche_name, ctx.content_tone, ctx.topic_keywords, etc.
    → DeepSeek API call with populated prompt
```

---

## 9. What's Needed

The `niche_config` table exists but has **no rows**. All PromptContext fields default to empty. This means:
- Content generation prompts have no niche context
- No CTA options are available
- No hashtags are generated
- No examples exist for few-shot prompting

A population script needs to insert rows for each brand with appropriate niche content data.
