# Copilot Instructions

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

## Git Workflow

After making any changes to the codebase, always:

1. Run `git add -A` to stage all changes
2. Run `git commit -m "<descriptive commit message>"` with a clear, concise message describing what was changed
3. Run `git push` to push the changes to the remote repository
