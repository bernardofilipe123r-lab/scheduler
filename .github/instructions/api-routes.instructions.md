---
description: "Use when editing API route files. Covers auth dependency injection, error handling, response format, and validation script requirements."
applyTo: "app/api/**/*.py"
---

# API Route Rules

- **Auth dependency:** Most endpoints need `user = Depends(get_current_user)`. Use `user["id"]` for user_id. Endpoints without auth must be explicitly intentional (health checks, webhooks, legal pages).

- **Brand ownership:** Always verify `brand.user_id == user["id"]` before returning brand data. Never assume — the user might not own the requested brand.

- **Webhook auth exception:** Stripe webhook (`/api/billing/webhook`) uses signature verification via `stripe.Webhook.construct_event()` instead of JWT auth. Do NOT add standard auth to webhook endpoints.

- **Error responses:** Use `HTTPException` with descriptive detail messages. Include `guidance` field for user-facing errors:
  ```python
  raise HTTPException(status_code=400, detail="Brand not found", headers={"guidance": "Check your brand ID"})
  ```

- **After adding/changing routes:**
  1. Register router in `app/main.py` if new
  2. Add to `CRITICAL_MODULES` in `scripts/validate_api.py`
  3. Add endpoint smoke tests to validate_api.py
  4. Run: `python scripts/validate_api.py --imports`
