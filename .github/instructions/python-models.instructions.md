---
description: "Use when editing Python model files. Enforces migration-first workflow — never add a column to a model without running the migration SQL first. Covers JSON column flag_modified pattern."
applyTo: "app/models/**/*.py"
---

# SQLAlchemy Model Rules

- **NEVER add a column to a model without first running the migration SQL against Supabase.** SQLAlchemy includes ALL mapped columns in SELECT — missing columns crash the entire endpoint with a 500.

- **Migration-first workflow:**
  1. Write SQL in `migrations/`
  2. Run: `source .env 2>/dev/null; psql "$DATABASE_URL" -f migrations/<file>.sql`
  3. Verify: `source .env 2>/dev/null; psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name = '<table>' ORDER BY column_name;"`
  4. THEN add the column to the Python model
  5. Run: `python scripts/validate_api.py --imports`

- **JSON column mutations require `flag_modified()`:**
  ```python
  from sqlalchemy.orm.attributes import flag_modified
  job.brand_outputs["brand_id"]["status"] = "completed"
  flag_modified(job, "brand_outputs")  # Required!
  db.commit()
  ```

- Always use `Column(... , nullable=True)` or provide a `default` for new columns to avoid breaking existing rows.
