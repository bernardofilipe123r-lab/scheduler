---
description: "Add a new social platform integration — OAuth, publishing, token management, legal pages"
agent: "agent"
tools: [execute, read, edit, search]
---

Add a new social platform integration to ViralToby. This is a multi-step workflow that touches many parts of the codebase.

## Pre-requisites
- Platform API credentials (app ID, app secret) set in Railway env vars
- Platform developer portal account configured with redirect URIs

## Steps

### 1. OAuth Route
Create `app/api/auth/<platform>_oauth_routes.py`:
- `/api/auth/<platform>/connect` → redirect to platform OAuth
- `/api/auth/<platform>/callback` → handle code exchange, store tokens
- Follow patterns from `ig_oauth_routes.py` or `tiktok_oauth_routes.py`
- Register router in `app/main.py`

### 2. Token Service
Create `app/services/publishing/<platform>_token_service.py`:
- `refresh_token()` — handle token refresh before expiry
- `get_valid_token()` — return valid token, auto-refresh if needed
- Note platform-specific token lifetimes (TikTok: 24h, Meta: 60d, YouTube: 1h)

### 3. Publisher
Add platform to `app/services/publishing/social_publisher.py`:
- Add publish method for the new platform
- Handle platform-specific media upload requirements
- Add retry logic with exponential backoff

### 4. Brand Model
Add platform connection fields to `app/models/brands.py`:
- `<platform>_connected`, `<platform>_token`, `<platform>_page_id`, etc.
- **Migration first!** Write and run the SQL before adding model columns

### 5. Enabled Platforms
Add to `enabled_platforms` JSON column handling in brand manager

### 6. Legal Pages (CRITICAL)
Update ALL THREE legal pages:
- `src/pages/Terms.tsx` — add platform to service description
- `src/pages/PrivacyPolicy.tsx` — describe data collected, add to third-party services
- `src/pages/DataDeletion.tsx` — add platform tokens/IDs to deletion list

### 7. Validation
- Run `python scripts/validate_api.py` (full suite, not just --imports)
- Update `CRITICAL_MODULES` in `validate_api.py` with new route and service files
- Add endpoint smoke tests for new OAuth routes

### 8. Update Customization Files
- Update `.github/skills/platform-publishing/SKILL.md` with new platform details
- Update `.github/skills/api-validation/SKILL.md` with new module count
