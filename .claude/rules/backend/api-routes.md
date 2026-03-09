---
paths:
  - "app/api/**/*.py"
---

## API Route Conventions

### Route Organization
- Routes are organized by domain: `app/api/{domain}/routes.py`
- Each domain has its own `__init__.py` that re-exports the router
- The main router (`app/api/routes.py`) includes all domain routers with prefixes

### Route Patterns
- All routes MUST use FastAPI dependency injection for auth: `current_user = Depends(get_current_user)`
- Request/response models go in `app/api/schemas.py` or domain-specific schema files
- Use Pydantic v2 models for all request bodies and response shapes
- Return explicit HTTP status codes: `status_code=200` for success, `201` for creation
- Use `HTTPException` for error responses — never return raw dicts with error messages

### Auth Middleware
- Auth middleware lives in `app/api/auth/middleware.py`
- `get_current_user` validates Supabase JWT from `Authorization: Bearer <token>` header
- Admin routes use `get_admin_user` / `get_super_admin_user` dependencies
- Public routes (health, legal, OAuth callbacks) skip auth

### After Any Route Change
1. Run `python scripts/validate_api.py --imports` to verify imports
2. Run `python scripts/validate_api.py` for full route validation
3. Exit code MUST be 0 before committing

### Common Gotchas
- Circular imports: import models/services inside route functions if needed
- Missing `__init__.py` in new API subdirectories breaks router discovery
- OAuth callback routes must be public (no auth dependency)
- File upload routes need `python-multipart` and `UploadFile` type
