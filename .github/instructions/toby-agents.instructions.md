---
description: "Use when editing Toby agent or orchestrator files. Covers tick isolation, rate limiting, billing guard, feature flag checks, memory handling."
applyTo: "app/services/toby/**/*.py"
---

# Toby Agent Rules

- **State isolation:** Each tick check (buffer, metrics, analysis, discovery, phase) has its OWN DB commit scope. Never let failures cascade across checks.

- **Billing guard first:** Always check `UserProfile.billing_status != "locked"` before processing a user. Skip locked users entirely.

- **Feature flags:** Check `FeatureFlags` before using v3 cognitive features. Most v3 flags default to `False`. Access via `app/services/toby/feature_flags.py`.

- **Rate limits:**
  - Steady: 2 gen/brand/hour, 6 gen/user/hour, 15 min cooldown
  - Bootstrap: 6/brand/hour, 20/user/hour, 2 min cooldown
  - Never bypass rate limits — they prevent API abuse and budget blowout

- **Memory embeddings:** Always handle `None` embeddings gracefully. `generate_embedding()` returns `None` on failure. Fall back to recency sort if embedding unavailable.

- **Error logging:** Use debounced logging (`_error_log_timestamps` dict) for repeated errors. Don't spam logs with the same error every 5 minutes.

- **Budget check:** If `budget_enforcement` flag is on, check `spent_today_cents < daily_budget_cents` before generating.
