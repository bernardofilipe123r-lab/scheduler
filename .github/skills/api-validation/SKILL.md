---
name: api-validation
description: "API validation, testing, and route management — validate_api.py script, endpoint smoke tests, import checks, NicheConfig alignment, adding new routes. Use when: adding or changing API routes, modifying imports in app/ modules, running validation checks, updating validate_api.py for new endpoints, debugging import errors, checking NicheConfig field alignment."
---

# API Validation & Route Management

## When to Use
- Adding, renaming, or removing API routes/endpoints
- Changing imports in any `app/` module
- Modifying models or services
- Refactoring the router structure in `app/main.py`
- Running validation checks before committing
- Updating `validate_api.py` for new endpoints
- Debugging import errors after refactoring

## Key Source Files

| File | Purpose |
|------|---------|
| `scripts/validate_api.py` | Comprehensive validation script (imports + endpoints + NicheConfig) |
| `app/main.py` | FastAPI app creation, middleware, router registration |
| `app/db_connection.py` | SQLAlchemy session management |

## Running Validation

```bash
# Fast: imports only (use after any code change)
python scripts/validate_api.py --imports

# Full: imports + endpoint smoke tests + NicheConfig alignment
python scripts/validate_api.py

# Endpoints only
python scripts/validate_api.py --endpoints

# External service health
python scripts/validate_api.py --services
```

**RULE:** The script must exit with code 0 before committing.

## What Gets Validated

### 1. Module Import Checks (70+ modules)
Validates all critical modules can be imported without errors:
- **Core:** prompt_templates, prompt_context, config, constants, cta, viral_patterns, quality_scorer
- **Models:** niche_config, jobs, scheduling, brands, analytics, auth, billing, toby, toby_cognitive
- **Services:** content generator, media generators, publishers, token services, toby agents
- **API Routers:** all registered route modules, including `app.api.auth.bsky_auth_routes` and `app.api.threads.routes`
- **Utilities:** ffmpeg, fonts, text_formatting, text_layout

### 2. Symbol Checks
Verifies specific symbols exist in modules:
- `PromptContext` class in `app.core.prompt_context`
- `NicheConfig` class in `app.models.niche_config`
- `get_current_user` in auth middleware
- `router` in main routes

### 3. FastAPI Boot
Loads `app.main:app` and validates startup doesn't crash.

### 4. Endpoint Smoke Tests (~246 endpoints)
Uses FastAPI `TestClient` (no network) in three categories:

| Category | Expected | Count |
|----------|----------|-------|
| No-auth GET | 200 | ~10 |
| No-auth POST | 200/422, NOT 500 | ~14 |
| Auth-required | 401/403, NOT 500 | ~80 |
| Admin-required | 401/403 | ~5 |

### 5. NicheConfig ↔ PromptContext Alignment
Verifies every NicheConfig database column has a matching PromptContext dataclass field.

## When to Update `validate_api.py`

| Change | Update Needed |
|--------|---------------|
| New route file | Add to `CRITICAL_MODULES` |
| New endpoint | Add to endpoint test section (no-auth, auth, or admin) |
| Change auth requirement | Move between no-auth/auth sections |
| New model | Add to model import checks |
| New service | Add to service import checks |
| New NicheConfig field | Auto-detected by alignment check |

## Router Registration Pattern

In `app/main.py`, routers are registered like:
```python
app.include_router(content_router, prefix="/reels", tags=["content"])
app.include_router(billing_router, prefix="/api/billing", tags=["billing"])
```

When adding a new router:
1. Create route file in `app/api/{domain}/routes.py`
2. Import and register in `app/main.py`
3. Add to `CRITICAL_MODULES` in `validate_api.py`
4. Add endpoint smoke tests
5. Run full validation

## Common Mistakes to Avoid
1. **Skipping validation:** ALWAYS run `--imports` at minimum before committing
2. **New routes without tests:** Every new endpoint needs a smoke test in validate_api.py
3. **Import order issues:** Circular imports crash the whole app — validate catches these
4. **Auth vs no-auth:** Endpoints that return 500 without auth need auth middleware — smoke test exposes this
5. **Missing modules:** Adding a new file that's imported by routes MUST be in CRITICAL_MODULES
