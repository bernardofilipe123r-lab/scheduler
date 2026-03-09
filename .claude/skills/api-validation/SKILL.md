---
name: api-validation
description: Use when changing routes, imports, models, or services. Runs validation scripts to catch broken imports, missing auth, and route registration issues.
---

## What This Skill Does

Runs ViralToby's validation suite to catch common issues before they hit production. Use after ANY change to routes, imports, models, or services.

## Steps

### Quick Check (after import/model changes)
```bash
python scripts/validate_api.py --imports
```
This checks:
- All Python imports resolve correctly
- No circular import issues
- React hooks ESLint rule compliance

### Full Validation (after route/endpoint changes)
```bash
python scripts/validate_api.py
```
This additionally checks:
- All routes are registered on the FastAPI app
- Auth dependencies are present on protected routes
- Request/response schemas are valid
- No duplicate route paths

### Reviewer Guardrails (pre-push)
```bash
python scripts/reviewer_guardrails.py
```
Enforces:
- No hardcoded brand names/IDs/colors
- No React hooks after early returns
- Model changes paired with migration files
- Auth present on API routes
- Legal pages synced with platform integrations

### Customization Drift Check
```bash
python scripts/validate_customization_drift.py
```
Detects when code changes outpace the skills/instructions that document them.

## Exit Criteria
- All scripts must exit with code 0
- Fix any errors before committing
- If a check fails, read the error output carefully — it usually points to the exact file and line
