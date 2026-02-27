# Copilot Instructions

## Database Migrations

The Supabase database is accessible directly via `psql` using the `DATABASE_URL` from `.env`. **All migrations must be run directly** — there is no Alembic or auto-migration system.

```bash
# Run a migration SQL file against Supabase
source .env 2>/dev/null; psql "$DATABASE_URL" -f migrations/<migration_file>.sql

# Verify columns exist after migration
source .env 2>/dev/null; psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name = '<table>' ORDER BY column_name;"
```

**CRITICAL:** When adding or modifying SQLAlchemy model columns (`app/models/`), you MUST:
1. Write the migration SQL in `migrations/`
2. Run it immediately against Supabase using `psql "$DATABASE_URL"` — do NOT defer
3. Verify the columns exist before committing
4. Run `python scripts/validate_api.py --imports` to validate

If model columns exist in Python but not in the database, **every query on that table will 500 in production**. SQLAlchemy includes all mapped columns in SELECT statements — missing columns crash the entire endpoint.

## API Validation

After any change that affects API routes, imports, models, services, or any major refactor:

1. Run `python scripts/validate_api.py --imports` to verify all module imports and symbol checks pass
2. If import checks pass, run `python scripts/validate_api.py` for the full validation (imports + endpoint smoke tests + NicheConfig alignment)
3. Fix any failures before committing — the script must exit with code 0

**When to run validation:**
- Adding, renaming, or removing any route/endpoint
- Changing imports in any `app/` module
- Modifying models (`app/models/`) or services (`app/services/`)
- Refactoring the router structure in `app/main.py`
- Adding new dependencies used by route handlers

**When to update `scripts/validate_api.py`:**
- After adding new route files → add to `CRITICAL_MODULES`
- After adding new endpoints → add to the appropriate endpoint test section
- After changing auth requirements on endpoints → move between no-auth/auth sections

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
