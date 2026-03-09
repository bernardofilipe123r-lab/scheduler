---
name: database-migrations
description: Use when adding database columns, creating tables, or modifying the schema. Guides the migration-first workflow to prevent 500 errors from missing columns.
argument-hint: [description of schema change]
---

## What This Skill Does

Guides you through ViralToby's migration-first workflow. This project uses raw SQL migrations via `psql` — NOT Alembic autogeneration. Missing DB columns crash every query on that table with 500 errors, so **migrations must run BEFORE model changes**.

## Steps

1. **Understand the change**: What table(s) are affected? What columns are being added/modified/removed?

2. **Write the migration SQL**:
   - Create a file in `migrations/` named descriptively: `add_{feature}.sql`
   - Use `IF NOT EXISTS` / `IF EXISTS` for idempotency
   - Include column defaults where appropriate
   - Add indexes for frequently-queried columns
   - Wrap backfills in transactions

3. **Run the migration**:
   ```bash
   psql "$DATABASE_URL" -f migrations/{filename}.sql
   ```

4. **Verify the schema**:
   ```bash
   psql "$DATABASE_URL" -c "\d {table_name}"
   ```

5. **Update the Python model** in `app/models/`:
   - Add the new column with matching type and defaults
   - Ensure `nullable` matches the SQL definition

6. **Validate**:
   ```bash
   python scripts/validate_api.py --imports
   ```

7. **Test**: Verify the API endpoints that use this table still work.

## SQL Template

```sql
-- migrations/add_{feature}.sql
-- Description: $ARGUMENTS
-- Date: {today}

ALTER TABLE {table_name}
ADD COLUMN IF NOT EXISTS {column_name} {data_type} DEFAULT {default};

-- Optional: index
CREATE INDEX IF NOT EXISTS idx_{table}_{column} ON {table_name}({column_name});
```

## Notes
- JSONB is preferred over JSON for indexable data
- Use `TIMESTAMPTZ` (not `TIMESTAMP`) for timezone-aware timestamps
- For new tables, include `id`, `user_id`, `created_at`, `updated_at` columns
- Check existing migrations in `migrations/` for naming patterns
- The `scripts/reviewer_guardrails.py` enforces model+migration pairing in CI
