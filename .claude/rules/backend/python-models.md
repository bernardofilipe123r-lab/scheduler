---
paths:
  - "app/models/**/*.py"
---

## SQLAlchemy Model Conventions

### Model Organization
- All models inherit from `Base` defined in `app/models/base.py`
- One model per concern, named after the DB table (e.g., `Brand`, `Job`, `ScheduledReel`)
- Models are re-exported from `app/models/__init__.py`

### Column Rules
- Always specify `nullable=True/False` explicitly
- JSON columns use `Column(JSON)` — store dicts, not strings
- Timestamps use `Column(DateTime, default=func.now())`
- UUIDs stored as `String(36)` or `UUID` type depending on context
- Foreign keys reference the actual table name, not the model class

### CRITICAL: Migration-First Workflow
**NEVER add a column to a model without first running the migration SQL.**
1. Write migration SQL in `migrations/` directory
2. Run migration: `psql "$DATABASE_URL" -f migrations/your_migration.sql`
3. THEN add the column to the Python model
4. Missing DB columns cause 500 errors on every query to that table

### Key Models
- `Brand` (`brands.py`): `colors = Column(JSON)` with `{ primary, accent, text, ... }`
- `Job` (`jobs.py`): `brand_outputs = Column(JSON)` — per-brand rendering results
- `ScheduledReel` (`scheduling.py`): `metadata = Column(JSON)` — platform targets, publish results
- `NicheConfig` (`niche_config.py`): Per-brand Content DNA (topics, tone, audience, visual style)
- `TobyState`, `TobyCognitiveState` (`toby.py`, `toby_cognitive.py`): Agent state persistence

### Dynamic Architecture
- Brand-related queries must NEVER assume specific brand IDs or names
- Always filter by `user_id` + `brand_id` from the authenticated request
- The `brands` table is the source of truth for brand count, names, and colors
