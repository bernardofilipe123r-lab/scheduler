# Copilot Instructions

## 100% Dynamic Architecture — MANDATORY

ViralToby is a **multi-tenant SaaS platform**. Every user can have any number of brands, each with any combination of connected social platforms, each with its own colors, fonts, topics, tone, and audience. **Nothing about users, brands, or their configuration is hardcoded — ever.**

### The Rule

> **All user-facing data — brand count, brand names, brand colors, platform connections, niche settings, content preferences — MUST be loaded dynamically from the database or API. Zero exceptions.**

### What MUST be dynamic (loaded from DB/API at runtime):
- **Brand count** — a user can have 1 brand or 50. Never assume a fixed number.
- **Brand names & labels** — from `brands.name` in DB
- **Brand colors** — from `brands.colors` JSON column (`{ primary, accent, text, ... }`)
- **Connected platforms per brand** — any subset of Instagram, Facebook, YouTube, Threads, TikTok
- **Content DNA / NicheConfig** — topics, tone, target audience, visual style — all per-brand, user-defined
- **Scheduling, publishing, analytics** — all scoped to whatever brands and platforms the user has configured

### What IS acceptable as static constants:
- **Platform identity** — `PLATFORM_COLORS` (Instagram gradient, YouTube red, Facebook blue), platform icon mappings. These represent the platforms themselves, not user data.
- **UI layout** — breakpoints, spacing, grid sizes. Not user-specific.
- **System defaults** — quality score threshold (80), tick interval (5 min), dedup window (3 days). Operational constants, not user content.

### What is NEVER acceptable:
- Hardcoded brand name arrays, color palettes tied to brand index, or brand ID lists
- Any array/map whose length assumes a specific number of brands or platforms
- Fallback lists that assume specific brands exist (e.g., "Healveth", "brand-1")
- Static color assignments like `BRAND_PALETTE[i % length]` — use the brand's actual `colors.primary` from DB
- Conditional logic that checks for specific brand IDs or names

### Frontend source of truth:
- `useDynamicBrands()` hook → returns `DynamicBrandInfo[]` with `{ id, label, color, shortName, active, ... }`
- Each brand's `color` comes from `b.colors?.primary` in the database
- **Always iterate over dynamic data** — never hardcode assumptions about what brands or platforms exist

### Backend source of truth:
- `Brand` model (`app/models/brands.py`) → `colors = Column(JSON)`
- `get_brand_config(brand_id)` in `app/core/config.py` → returns `BrandConfig` dataclass
- `NicheConfig` model (`app/models/niche_config.py`) → per-brand content identity

**If you are about to write a constant array of brand names, colors, or IDs — STOP. Load it from the database instead.**

---

## Database Migrations

No Alembic — migrations run directly via `psql "$DATABASE_URL"`. **Write and run migration SQL BEFORE adding model columns.** Missing DB columns crash every query on that table with 500.

> Full procedure → `database-migrations` skill. Per-file rules → `python-models.instructions.md` and `migration-sql.instructions.md`.

## API Validation

After any change to routes, imports, models, or services: run `python scripts/validate_api.py --imports`. For route/endpoint changes, run the full suite: `python scripts/validate_api.py`. Exit code must be 0 before committing.

> Full details → `api-validation` skill. Per-file rules → `api-routes.instructions.md`.

## React Rules of Hooks — CRITICAL

**NEVER place React hooks (`useState`, `useEffect`, `useMemo`, `useCallback`, `useQuery`, custom `use*` hooks) after an early return statement.** This violates React's Rules of Hooks and causes **React error #310** ("Rendered more hooks than during the previous render") which crashes the entire page in production.

**Before committing any React component change:**
1. Visually verify ALL hooks are called BEFORE any `if (...) return` early-return statement
2. Run `npx eslint src/ --rule 'react-hooks/rules-of-hooks: error'` to machine-check
3. The `python scripts/validate_api.py --imports` script also runs this check automatically

> Code examples and full patterns → `react-components.instructions.md`

## Railway CLI (Production Infrastructure)

Railway CLI is installed and authenticated. **ALWAYS run Railway commands directly using run_in_terminal — NEVER ask the user to run them manually.**

```bash
# Check current project/service context
railway status

# List all env vars
railway variables

# Set an env var (triggers redeploy)
railway variables set KEY=value

# Delete an env var
railway variables delete KEY

# View recent deployment logs
railway logs

# Redeploy the service
railway redeploy
```

**When to use Railway CLI:**
- Adding or updating environment variables (API keys, secrets, OAuth credentials)
- Checking if an env var is set before code depends on it
- Viewing production logs for debugging
- Triggering redeployments after config changes

**CRITICAL:** When Railway commands are needed (setting env vars, checking logs, etc.), execute them immediately using `run_in_terminal`. Do NOT provide instructions for the user to run manually. The Railway CLI is available and authenticated in the workspace — use it directly.

**Important:** Setting a variable via `railway variables set` triggers an automatic redeploy. The service is `scheduler` in project `responsible-mindfulness` (production environment).

## What is ViralToby / Toby

**ViralToby** (`viraltoby.com`) is a social media content scheduling and publishing platform that lets users connect any brand across Instagram, Facebook, YouTube, Threads, and TikTok, then have content created, scheduled, and published on their behalf.

The core differentiator is **Toby** — an autonomous AI agent that runs in the background, removing the need for manual content work. Toby is not niche-specific; it adapts to **any brand's Content DNA** (niche, tone, target audience, topic categories, visual style) configured by the user via the NicheConfig system.

**What Toby does autonomously:**
- Selects viral content archetypes from 59 trained patterns (`app/core/viral_patterns.py`)
- Generates content via DeepSeek AI, shaped entirely by the brand's Content DNA (`app/core/prompt_context.py`, `app/core/prompt_templates.py`)
- Scores content quality across 5 dimensions (min 80 to publish)
- Deduplicates against a 3-day fingerprint window per brand
- Produces rendered image frames (Pillow) and MP4 videos (FFmpeg/MoviePy)
- Schedules and publishes across all connected platforms
- Tracks performance metrics and feeds them back into strategy decisions

**Toby's tick loop** runs every 5 minutes via APScheduler (`app/services/toby/orchestrator.py`). Each tick checks: buffer fill → metric scoring → strategy analysis → trend discovery → phase advancement. All state persists in PostgreSQL — survives deploys and restarts.

**Content DNA** is the user-defined brand identity stored in `NicheConfig` (per-brand, per-user). It drives every prompt, every visual, every tone decision. Toby never deviates from it.

**Key source locations:**
- Agent tick loop: `app/services/toby/orchestrator.py`
- Specialized agents: `app/services/toby/agents/` (analyst, creator, critic, scout, strategist, publisher, …)
- Memory subsystem: `app/services/toby/memory/` (episodic, semantic, procedural, world_model)
- Content DNA schema: `app/core/prompt_context.py`, `app/models/niche_config.py`
- Brand config: `app/core/config.py` (`BrandConfig` dataclass)

## Legal Pages

Public legal pages live in `src/pages/` and are served at these URLs:

| URL | File | Purpose |
|---|---|---|
| `https://viraltoby.com/terms` | `src/pages/Terms.tsx` | Terms of Service |
| `https://viraltoby.com/privacy` | `src/pages/PrivacyPolicy.tsx` | Privacy Policy |
| `https://viraltoby.com/data-deletion` | `src/pages/DataDeletion.tsx` | Data Deletion Instructions |

**CRITICAL:** When adding or removing a social platform integration (OAuth, publishing), you MUST update all three legal pages to:
1. List the new platform in service description / data collection / third-party services sections
2. Describe what data is collected from the new platform (tokens, IDs, profile info)
3. Include the platform in "Your Rights" / "Revoke access" instructions
4. Include the platform's tokens/IDs in the "What Gets Deleted" list (DataDeletion.tsx)

These URLs are referenced in the TikTok Developer Portal, Meta App Dashboard, and Google API Console — they must stay accurate.

## Git Workflow

After making any changes to the codebase, always:

1. Run `git add -A` to stage all changes
2. Run `git commit -m "<descriptive commit message>"` with a clear, concise message describing what was changed
3. Run `git push` to push the changes to the remote repository
