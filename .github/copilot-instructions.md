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

Railway CLI is installed and authenticated. **Use it directly** to manage production env vars, check deployments, and view logs.

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

**Important:** Setting a variable via `railway variables set` triggers an automatic redeploy. The service is `scheduler` in project `responsible-mindfulness` (production environment).

## Git Workflow

After making any changes to the codebase, always:

1. Run `git add -A` to stage all changes
2. Run `git commit -m "<descriptive commit message>"` with a clear, concise message describing what was changed
3. Run `git push` to push the changes to the remote repository
