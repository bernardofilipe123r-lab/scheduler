# Content DNA Re-Architecture: Multi-DNA Brand Grouping

> **ADR Status**: Proposed  
> **Date**: 2026-03-11  
> **Scope**: Backend data model, Toby agent, Content DNA services, Onboarding, Brands UI  
> **Preserves**: Pipeline approval gate (Meta ToS compliance, commit `881dd889`)

---

## 1. Problem Statement

Today, Content DNA is a **single user-level record** (`niche_config` table, `UniqueConstraint("user_id")`). The service explicitly says _"Content DNA is user-level, not per-brand"_ and **ignores `brand_id`** even though Toby passes it.

This means:
- All brands share ONE editorial identity — impossible for users managing brands in different niches.
- Toby's learning engine groups by `(user_id, brand_id, content_type)` but the **prompt context** it generates comes from a single DNA, so strategy differentiation is illusory.
- There is no way to create, select, or assign multiple DNA profiles.

### What the user wants

| Concept | Definition |
|---|---|
| **Content DNA** | A reusable editorial blueprint: audience, tone, topics, examples, CTA rules, visual style, format-specific config. Think of it as a **basket** — brands are placed inside it. |
| **Brand** | A publishing identity (social accounts, colors, logos). A brand belongs to **exactly one** Content DNA. |
| **Relationship** | **1 Content DNA → N Brands**. A brand CANNOT belong to multiple DNAs. A user MUST have at least 1 DNA. |

### Toby learning isolation requirement

Toby already has partial format separation (brain-per-format: `reel` vs `format_b_reel` vs `post` vs `threads_post`). But the learning key today is `(user_id, brand_id, content_type)`. The new requirement is that **learning must also be isolated by Content DNA**, so:

- Two brands in the same DNA share learning (same editorial intent).
- Two brands in different DNAs never share learning.
- Within one DNA, learning stays separate across content types (Format A reel ≠ carousel ≠ threads ≠ Format B reel).

---

## 2. Design Decisions

### 2.1 Core Relationship: 1 DNA → N Brands

```
┌─────────────────────────┐
│  Content DNA Profile    │  (user-owned, reusable)
│  "Health & Wellness"    │
│                         │
│  audience, tone, topics,│
│  examples, CTA, visual, │
│  format-specific config │
├─────────────────────────┤
│  Brands:                │
│   ├─ @healthycollege    │
│   ├─ @gymcollege        │
│   └─ @longevitycollege  │
└─────────────────────────┘

┌─────────────────────────┐
│  Content DNA Profile    │
│  "Finance & Investing"  │
│                         │
├─────────────────────────┤
│  Brands:                │
│   └─ @wealthbuilderhq   │
└─────────────────────────┘
```

- One DNA can hold 1 or more brands.
- One brand belongs to exactly 1 DNA at a time.
- Moving a brand to another DNA is a simple FK update (no data duplication).

### 2.2 Toby Learning Key

**Old**: `(user_id, brand_id, content_type)` — brand-scoped, DNA-unaware  
**New**: `(user_id, content_dna_id, content_type)` — DNA-scoped, brand-independent

When brands share a DNA, they **pool learning data together**. This is correct because they share the same editorial blueprint. Toby can learn faster with more signal from the same creative intent.

When brands are in different DNAs, learning is completely isolated.

### 2.3 Four First-Class Content Lanes

Each lane has its own strategy dimensions within Toby:

| Lane | `content_type` value | Strategy dimensions |
|---|---|---|
| Reel Format A | `reel` | personality, topic, hook, title_format, visual_style |
| Reel Format B | `format_b_reel` | personality, topic, hook, title_format, visual_style, story_category |
| Carousel Post | `post` | personality, topic, hook, title_format, visual_style |
| Threads Post | `threads_post` | personality, topic, hook, title_format, visual_style + threads-specific weights |

Learning is isolated per `(content_dna_id, content_type)`. Format A reel learning never leaks into carousel learning, even within the same DNA.

---

## 3. Data Model

### 3.1 New Table: `content_dna_profiles`

This table replaces `niche_config` as the source of truth. It holds all editorial configuration fields currently in `NicheConfig`.

```sql
CREATE TABLE content_dna_profiles (
    id            VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id       VARCHAR(100) NOT NULL,
    
    -- Display
    name          VARCHAR(100) NOT NULL,        -- User-chosen name, e.g. "Health & Wellness"
    description   TEXT         DEFAULT '',       -- Optional description for the user
    
    -- Core Identity (same fields as current NicheConfig)
    niche_name              VARCHAR(100) NOT NULL DEFAULT '',
    niche_description       TEXT         DEFAULT '',
    content_brief           TEXT         DEFAULT '',
    target_audience         VARCHAR(255) DEFAULT '',
    audience_description    TEXT         DEFAULT '',
    content_tone            JSONB        DEFAULT '[]',
    tone_avoid              JSONB        DEFAULT '[]',
    
    -- Topic Configuration
    topic_categories        JSONB        DEFAULT '[]',
    topic_keywords          JSONB        DEFAULT '[]',
    topic_avoid             JSONB        DEFAULT '[]',
    
    -- Content Philosophy
    content_philosophy      TEXT         DEFAULT '',
    hook_themes             JSONB        DEFAULT '[]',
    
    -- User Examples (few-shot prompting)
    reel_examples           JSONB        DEFAULT '[]',
    post_examples           JSONB        DEFAULT '[]',
    
    -- Visual Configuration
    image_style_description TEXT         DEFAULT '',
    image_palette_keywords  JSONB        DEFAULT '[]',
    
    -- Brand Personality
    brand_personality       TEXT,
    brand_focus_areas       JSONB        DEFAULT '[]',
    parent_brand_name       VARCHAR(100) DEFAULT '',
    
    -- CTA Configuration
    cta_options             JSONB        DEFAULT '[]',
    hashtags                JSONB        DEFAULT '[]',
    
    -- Discovery Configuration
    competitor_accounts     JSONB        DEFAULT '[]',
    discovery_hashtags      JSONB        DEFAULT '[]',
    
    -- Citation / Source style
    citation_style          VARCHAR(50)  DEFAULT 'none',
    citation_source_types   JSONB        DEFAULT '[]',
    
    -- YouTube
    yt_title_examples       JSONB        DEFAULT '[]',
    yt_title_bad_examples   JSONB        DEFAULT '[]',
    
    -- Carousel
    carousel_cta_topic              VARCHAR(255) DEFAULT '',
    carousel_cta_options            JSONB        DEFAULT '[]',
    carousel_cover_overlay_opacity  INTEGER      DEFAULT 65,
    carousel_content_overlay_opacity INTEGER     DEFAULT 85,
    
    -- Caption sections
    follow_section_text     TEXT     DEFAULT '',
    save_section_text       TEXT     DEFAULT '',
    disclaimer_text         TEXT     DEFAULT '',
    
    -- Format B Reel Configuration
    format_b_reel_examples          JSONB DEFAULT '[]',
    format_b_story_niches           JSONB DEFAULT '[]',
    format_b_story_tone             TEXT  DEFAULT '',
    format_b_preferred_categories   JSONB DEFAULT '[]',
    
    -- Threads
    threads_format_weights  JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_content_dna_user ON content_dna_profiles(user_id);
```

### 3.2 Brand Table Change: Add `content_dna_id` FK

```sql
ALTER TABLE brands
ADD COLUMN content_dna_id VARCHAR(36) REFERENCES content_dna_profiles(id);

CREATE INDEX ix_brands_content_dna ON brands(content_dna_id);
```

The `brands.content_dna_id` column is the **sole link** between a brand and its editorial blueprint. Nullable initially for migration safety; after backfill, enforce NOT NULL or application-level validation.

### 3.3 Toby Tables: Add `content_dna_id`

Add `content_dna_id VARCHAR(36)` to every Toby learning/memory table, and update indexes accordingly:

| Table | Current learning key | New learning key |
|---|---|---|
| `toby_strategy_scores` | `(user_id, brand_id, content_type, dimension)` | `(user_id, content_dna_id, content_type, dimension)` |
| `toby_experiments` | `(user_id, content_type)` | `(user_id, content_dna_id, content_type)` |
| `toby_content_tags` | `(user_id, brand_id)` | `(user_id, brand_id, content_dna_id)` |
| `toby_episodic_memory` | `(user_id, brand_id)` | `(user_id, brand_id, content_dna_id)` |
| `toby_semantic_memory` | `(user_id)` | `(user_id)` — stays user-level (generalized insights) |
| `toby_procedural_memory` | `(user_id)` | `(user_id, content_dna_id)` |
| `toby_strategy_combos` | `(user_id)` | `(user_id, content_dna_id)` |

```sql
-- Example for toby_strategy_scores
ALTER TABLE toby_strategy_scores ADD COLUMN content_dna_id VARCHAR(36);
CREATE INDEX ix_strategy_dna_dim ON toby_strategy_scores(user_id, content_dna_id, content_type, dimension);

-- Example for toby_experiments 
ALTER TABLE toby_experiments ADD COLUMN content_dna_id VARCHAR(36);
CREATE INDEX ix_exp_dna ON toby_experiments(user_id, content_dna_id, content_type, status);

-- Similar for other tables...
```

### 3.4 ContentPlan: Add `content_dna_id`

The `ContentPlan` dataclass in `content_planner.py` gets a new field:

```python
@dataclass
class ContentPlan:
    user_id: str
    brand_id: str
    content_dna_id: str          # NEW — resolved from brand.content_dna_id
    content_type: str
    # ... rest unchanged
```

---

## 4. Service Layer Changes

### 4.1 NicheConfigService → ContentDNAService

**Replace the resolver** to accept and use `content_dna_id`:

```python
class ContentDNAService:
    """Loads Content DNA profile and returns PromptContext."""
    
    _cache: dict = {}
    _cache_ttl = timedelta(minutes=5)
    _cache_timestamps: dict = {}

    def get_context(
        self, 
        user_id: str, 
        content_dna_id: str,   # NEW: required  
        db=None,
        **kwargs
    ) -> PromptContext:
        cache_key = f"{user_id}:{content_dna_id}"
        # ... cache logic same as today ...
        return self._load(user_id, content_dna_id, db=db)


    def get_dna_for_brand(self, brand_id: str, db) -> Optional[str]:
        """Resolve brand → content_dna_id."""
        brand = db.query(Brand).filter(Brand.id == brand_id).first()
        return brand.content_dna_id if brand else None
```

**Backward compatibility**: Keep the old `NicheConfigService` as a thin wrapper that internally resolves the user's first DNA profile and delegates. Remove after full frontend migration.

### 4.2 Toby Orchestrator

Currently in `orchestrator.py`:
```python
niche_svc = NicheConfigService()
ctx = niche_svc.get_context(user_id=plan.user_id, brand_id=plan.brand_id)
```

After change:
```python
dna_svc = ContentDNAService()
ctx = dna_svc.get_context(
    user_id=plan.user_id,
    content_dna_id=plan.content_dna_id,
)
```

The `plan.content_dna_id` is resolved at planning time (see §4.3).

### 4.3 Content Planner

At the start of `create_plans_for_empty_slots`, resolve each brand's DNA:

```python
# In the slot loop:
brand = db.query(Brand).filter(Brand.id == brand_id).first()
content_dna_id = brand.content_dna_id

# Pass to learning engine:
strategy = choose_strategy(
    db, user_id, brand_id, content_dna_id, content_type, ...
)

# Attach to plan:
plan = ContentPlan(
    content_dna_id=content_dna_id,
    ...
)
```

### 4.4 Learning Engine

All functions that query/update `TobyStrategyScore` shift from brand_id to content_dna_id:

```python
def choose_strategy(
    db, user_id, brand_id, content_dna_id, content_type, ...
) -> StrategyChoice:
    # Thompson Sampling queries now filter by content_dna_id instead of brand_id
    ...

def update_strategy_score(
    db, user_id, content_dna_id, content_type, dimension, option_value, score, ...
):
    # Strategy score rows keyed by content_dna_id
    ...
```

**Cold-start fallback order** when a DNA has insufficient data:
1. Same DNA, same content_type → use directly
2. Same DNA, any content_type → warm-start from related lane (with dampening)
3. Same user, any DNA, same content_type → cross-DNA fallback (weak prior only)
4. Global defaults (current behavior)

### 4.5 Toby Preflight (state.py)

Update `enable_toby` validation:

```python
# Old check:
configs = db.query(NicheConfig).filter(NicheConfig.user_id == user_id).all()
if not configs or not any(c.topic_categories and len(c.topic_categories) > 0 for c in configs):
    preflight_failures.append("niche_config_empty")

# New check:
from app.models.content_dna import ContentDNAProfile
dna_profiles = db.query(ContentDNAProfile).filter(ContentDNAProfile.user_id == user_id).all()
if not dna_profiles:
    preflight_failures.append("no_content_dna")

# Check every active brand has a DNA assigned
for brand in brands:
    if not brand.content_dna_id:
        preflight_failures.append(f"brand_no_dna:{brand.id}")

# Check at least one assigned DNA has topic categories
assigned_dna_ids = {b.content_dna_id for b in brands if b.content_dna_id}
assigned_dnas = db.query(ContentDNAProfile).filter(
    ContentDNAProfile.id.in_(assigned_dna_ids)
).all()
if not any(d.topic_categories and len(d.topic_categories) > 0 for d in assigned_dnas):
    preflight_failures.append("dna_topics_empty")
```

---

## 5. API Design

### 5.1 New Content DNA Endpoints

```
# Content DNA CRUD
GET    /api/v2/content-dna                          → List all user's DNA profiles
POST   /api/v2/content-dna                          → Create new DNA profile
GET    /api/v2/content-dna/{dna_id}                 → Get single DNA profile
PUT    /api/v2/content-dna/{dna_id}                 → Update DNA profile
DELETE /api/v2/content-dna/{dna_id}                 → Delete DNA profile (guarded)

# Brand assignment
PUT    /api/v2/brands/{brand_id}/assign-dna         → Assign brand to a DNA
GET    /api/v2/content-dna/{dna_id}/brands          → List brands in a DNA

# AI import (existing, re-scoped)
POST   /api/v2/content-dna/{dna_id}/import-instagram → AI-analyze IG and populate DNA
```

### 5.2 Deletion Guards

A DNA **cannot** be deleted if:
1. It's the user's **last** DNA profile.
2. It has brands assigned to it (must reassign brands first).
3. It has pending Toby plans in the pipeline.

### 5.3 Legacy Compatibility

Keep existing endpoints functional during migration:
- `GET /api/v2/brands/niche-config` → Returns the DNA of the user's first brand
- `PUT /api/v2/brands/niche-config` → Updates that same DNA
- Both are deprecated and will be removed after frontend migration

---

## 6. Frontend Changes

### 6.1 Onboarding Flow

Current steps:
1. Create first brand (Identity)
2. Brand Theme (colors)
3. Connect Platforms (OAuth)
4. **General Content DNA** ← singular
5. Reels Configuration
6. Carousel Posts

New steps:
1. Create first brand (Identity)
2. Brand Theme (colors)
3. Connect Platforms (OAuth)
4. **Create your first Content DNA** ← new wording + new explanation
5. Reels Configuration (edits selected DNA)
6. Carousel Posts (edits selected DNA)

**Step 4 changes**:
- Title: "Create your first Content DNA"
- Explanation text:
  > A Content DNA is the editorial blueprint that powers your content. It tells our AI what topics to cover, what tone to use, who your audience is, and what examples to follow. You can create multiple Content DNAs and group different brands under each one.
- The created DNA is automatically assigned to the brand from step 1.
- Steps 5 and 6 edit format-specific fields of that **same DNA**.
- The `useOnboardingStatus` hook checks: `hasBrand && hasDNA` where `hasDNA` means at least 1 `content_dna_profiles` row exists for the user.

### 6.2 Brands Page: Content DNA Manager

The current "Content DNA" tab on the Brands page shows a single `NicheConfigForm`. Replace with:

#### DNA Library Panel
- Lists all user's Content DNA profiles as cards.
- Each card shows: DNA name, brand count, config strength indicator.
- Actions: Create new DNA, Edit, Delete (guarded).

#### DNA Editor
- When a DNA card is selected, show the full editor (same fields as current `NicheConfigForm`, but scoped to that DNA).
- Tabs within editor: Core Identity, Reels Config, Carousel Config, Format B, Threads.

#### Brand Assignment
- Within each DNA card, show assigned brands as chips/avatars.
- Drag-and-drop or dropdown to reassign a brand between DNAs.
- When a brand is unassigned from one DNA and moved to another, Toby learning stays with the original DNA (correct, since learning is DNA-scoped, not brand-scoped).

#### Empty State
- If no DNA exists (shouldn't happen post-onboarding): "Create your first Content DNA to start generating content."

### 6.3 Frontend State & Hooks

```typescript
// New hooks
useContentDNAs()          → List<ContentDNA>      // All user's DNA profiles
useContentDNA(dnaId)      → ContentDNA             // Single DNA profile
useCreateContentDNA()     → Mutation
useUpdateContentDNA()     → Mutation
useDeleteContentDNA()     → Mutation (guarded)
useAssignBrandDNA()       → Mutation               // Assign brand to DNA

// Updated hooks
useBrands()               → Brand[]                // Brand now includes content_dna_id
useOnboardingStatus()     → { hasDNA: boolean }     // Check content_dna_profiles exists
```

```typescript
// Brand type update
interface Brand {
  id: string
  content_dna_id: string | null  // NEW
  // ... rest unchanged
}

// New type
interface ContentDNA {
  id: string
  user_id: string
  name: string
  description: string
  niche_name: string
  // ... all NicheConfig fields
  brands: Brand[]           // populated on list endpoint
  created_at: string
  updated_at: string
}
```

---

## 7. Migration Strategy

### Phase 1: Schema (non-breaking)

1. **Create `content_dna_profiles` table** with all fields.
2. **Add `content_dna_id` to `brands`** (nullable).
3. **Add `content_dna_id` to all Toby learning tables** (nullable).
4. **Add new indexes**.

### Phase 2: Backfill

For each existing user with a `niche_config` row:
1. Create one `content_dna_profiles` row, copying all fields. Set `name` = `niche_name` or "My Content DNA".
2. Set `brands.content_dna_id` = that new DNA profile ID for all active brands.
3. Set `content_dna_id` on all existing `toby_strategy_scores`, `toby_experiments`, `toby_content_tags`, `toby_episodic_memory`, `toby_procedural_memory`, `toby_strategy_combos` rows.

```sql
-- Backfill DNA profiles from niche_config
INSERT INTO content_dna_profiles (id, user_id, name, niche_name, niche_description, ...)
SELECT id, user_id, COALESCE(NULLIF(niche_name, ''), 'My Content DNA'), niche_name, niche_description, ...
FROM niche_config;

-- Backfill brands
UPDATE brands b
SET content_dna_id = (
    SELECT cdp.id FROM content_dna_profiles cdp
    WHERE cdp.user_id = b.user_id
    LIMIT 1
);

-- Backfill Toby tables
UPDATE toby_strategy_scores ts
SET content_dna_id = (
    SELECT cdp.id FROM content_dna_profiles cdp
    WHERE cdp.user_id = ts.user_id
    LIMIT 1
)
WHERE ts.content_dna_id IS NULL;

-- Same pattern for other Toby tables...
```

### Phase 3: Backend switch

1. Deploy `ContentDNAService` alongside old `NicheConfigService`.
2. New endpoints go live (`/api/v2/content-dna/*`).
3. Toby planner and orchestrator switch to `content_dna_id`-aware code.
4. Learning engine queries filtered by `content_dna_id`.
5. Old endpoints become thin wrappers.

### Phase 4: Frontend switch

1. Onboarding step 4 uses new DNA creation endpoint.
2. Brands page gets DNA library panel.
3. All `useNicheConfig()` calls migrated to `useContentDNA(dnaId)`.

### Phase 5: Cleanup

1. Remove `NicheConfigService` compatibility wrapper.
2. Remove old `/api/v2/brands/niche-config` endpoints.
3. Drop `niche_config` table (after confirming no references remain).
4. Make `brands.content_dna_id` NOT NULL.

---

## 8. Toby Learning Details

### 8.1 Learning Flow After Change

```
Content Published
       │
       ▼
Metrics Collected (48h + 7d)
       │
       ▼
Score Computed (Toby Score)
       │
       ▼
Strategy Score Updated
  key: (user_id, content_dna_id, content_type, dimension, option_value)
       │
       ▼
Episodic Memory Created
  key: (user_id, brand_id, content_dna_id, content_type)
       │
       ▼
Semantic Memory Updated (user-level generalizations)
  key: (user_id)
```

### 8.2 Cross-DNA Learning Rules

| Scenario | Learning shared? |
|---|---|
| Two brands, same DNA, same content_type | **Yes** — pooled |
| Two brands, same DNA, different content_type | **No** — lane-isolated |
| Two brands, different DNAs, same content_type | **No** — DNA-isolated |
| Two brands, different DNAs, different content_type | **No** — fully isolated |
| Semantic memory (generalized insights) | **Yes** — always user-level |

### 8.3 Brand Moved Between DNAs

When a brand is reassigned from DNA-A to DNA-B:
- **New content** uses DNA-B's strategy scores and editorial config.
- **Historic Toby scores** remain tagged with DNA-A (correct — they were generated under that DNA).
- **Episodic memory** from that brand stays with DNA-A (or optionally tagged with brand_id for future replay).
- No learning data is moved or copied.

### 8.4 Explore Ratio per DNA

The existing `_get_effective_explore_ratio` logic in `learning_engine.py` currently queries `PostPerformance` by brand. Update to query by `content_dna_id`:
- DNA with 0 scored posts → 100% exploration
- DNA with < 5 → 80%
- DNA with < COLD_START_THRESHOLD → 50%
- Otherwise → base ratio

---

## 9. Risks & Mitigations

### 9.1 Learning Fragmentation

**Risk**: Users creating many DNAs with few brands each → sparse data per lane.  
**Mitigation**: 
- Onboarding creates only 1 DNA.
- UI warns when creating a DNA with < 2 brands.
- Cross-DNA cold-start fallback (§4.4) ensures new DNAs aren't starting from zero.

### 9.2 Migration Data Integrity

**Risk**: Backfill creates incorrect DNA assignments.  
**Mitigation**:
- All existing users get exactly 1 DNA (their current niche_config).
- All brands assigned to that DNA.
- All Toby learning tagged with that DNA.
- Verified with count checks before/after.

### 9.3 API/Frontend Sync

**Risk**: Old frontend calling new backend or vice versa.  
**Mitigation**: Legacy endpoints remain functional throughout migration. New endpoints are additive.

### 9.4 Policy Compliance

**Risk**: More editorial flexibility → risk of policy-unsafe content.  
**Mitigation**: Pipeline approval gate (commit `881dd889`) stays active regardless of DNA count. Every piece of content still goes through pending → approved → published.

---

## 10. Files Affected (Complete List)

### Backend — Models
- `app/models/content_dna.py` — **NEW**: ContentDNAProfile model
- `app/models/brands.py` — Add `content_dna_id` column
- `app/models/niche_config.py` — Deprecated (kept for compatibility)
- `app/models/toby.py` — Add `content_dna_id` to TobyStrategyScore, TobyExperiment, TobyContentTag
- `app/models/toby_cognitive.py` — Add `content_dna_id` to episodic, procedural, strategy_combos

### Backend — Services
- `app/services/content/content_dna_service.py` — **NEW**: replaces NicheConfigService
- `app/services/content/niche_config_service.py` — Thin compatibility wrapper
- `app/services/toby/orchestrator.py` — Use ContentDNAService, pass content_dna_id
- `app/services/toby/content_planner.py` — Resolve brand→DNA, add to ContentPlan
- `app/services/toby/learning_engine.py` — All queries by content_dna_id
- `app/services/toby/state.py` — Updated preflight checks
- `app/services/content/threads_generator.py` — Accept content_dna_id for format weights
- `app/core/prompt_context.py` — No structural change (fields stay the same)

### Backend — API
- `app/api/content_dna/routes.py` — **NEW**: CRUD + assignment + import endpoints
- `app/api/content_dna/__init__.py` — **NEW**
- `app/api/content_dna/schemas.py` — **NEW**: Pydantic schemas
- `app/api/niche_config_routes.py` — Deprecated compatibility wrapper
- `app/main.py` — Register new router

### Migrations
- `migrations/content_dna_profiles.sql` — Create table
- `migrations/brands_content_dna_fk.sql` — Add FK to brands
- `migrations/toby_content_dna_columns.sql` — Add columns to all Toby tables
- `migrations/backfill_content_dna.sql` — Data migration

### Frontend — Features
- `src/features/content-dna/` — **NEW**: feature module
  - `api/content-dna-api.ts` — API client
  - `hooks/use-content-dnas.ts` — List hook
  - `hooks/use-content-dna.ts` — Single hook
  - `hooks/use-create-content-dna.ts` — Create mutation
  - `hooks/use-update-content-dna.ts` — Update mutation
  - `hooks/use-delete-content-dna.ts` — Delete mutation (guarded)
  - `hooks/use-assign-brand-dna.ts` — Brand assignment mutation
  - `components/DNALibrary.tsx` — Library panel
  - `components/DNACard.tsx` — Card component
  - `components/DNAEditor.tsx` — Full editor (reuses NicheConfigForm logic)
  - `components/BrandAssignment.tsx` — Brand chips + assignment UI
  - `model/types.ts` — ContentDNA TypeScript types

### Frontend — Pages
- `src/pages/Brands.tsx` — Replace Content DNA tab with DNA Manager
- `src/pages/Onboarding.tsx` — Step 4 reworded + creates DNA profile

### Frontend — Hooks
- `src/features/onboarding/use-onboarding-status.ts` — Check `content_dna_profiles` existence
- `src/features/brands/api/use-niche-config.ts` — Deprecated, delegates to new hooks
- `src/features/brands/types/niche-config.ts` — Keep for compatibility, export from new types

---

## 11. Implementation Order

```
Week 1: Schema + Backfill + Backend Service
  ├─ Migration: content_dna_profiles table
  ├─ Migration: brands.content_dna_id FK
  ├─ Migration: Toby tables content_dna_id columns
  ├─ Migration: backfill script
  ├─ ContentDNAProfile model
  ├─ ContentDNAService
  ├─ Content DNA API routes + schemas
  └─ Legacy wrapper for NicheConfigService

Week 2: Toby Integration
  ├─ ContentPlan.content_dna_id
  ├─ Planner: resolve brand → DNA
  ├─ Learning engine: query/update by content_dna_id
  ├─ Orchestrator: use ContentDNAService
  ├─ Preflight: updated validation
  └─ Test: verify DNA-scoped learning isolation

Week 3: Frontend
  ├─ content-dna feature module
  ├─ Onboarding step 4 rewrite
  ├─ Brands page DNA Manager
  ├─ Brand assignment UI
  └─ Migrate useNicheConfig → useContentDNA

Week 4: Cleanup + QA
  ├─ Remove legacy endpoints
  ├─ Drop niche_config table
  ├─ Full validation suite
  └─ Documentation sync
```

---

## 12. Open Design Questions (None — All Resolved)

| # | Question | Answer |
|---|---|---|
| 1 | What is a basket? | A Content DNA IS the basket. Brands are placed inside it. |
| 2 | Can a brand have multiple DNAs? | No. 1 DNA → N brands. 1 brand → exactly 1 DNA. |
| 3 | Do brands in the same DNA share learning? | Yes. Same editorial intent = pooled learning. |
| 4 | Minimum requirement? | 1 DNA minimum. User can create more and assign brands to each. |
