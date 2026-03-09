---
paths:
  - "migrations/**/*.sql"
  - "migrations/**/*.py"
---

## Database Migration Conventions

### Migration-First Rule (CRITICAL)
**Write and run migration SQL BEFORE adding model columns in Python.**
Missing DB columns crash every query on that table with 500 errors.

### Workflow
1. Create migration file in `migrations/` (SQL preferred, Python for complex logic)
2. Name it descriptively: `add_{feature}_to_{table}.sql` or `add_{table}.sql`
3. Run: `psql "$DATABASE_URL" -f migrations/your_migration.sql`
4. Verify: `psql "$DATABASE_URL" -c "\d {table_name}"` to confirm columns exist
5. THEN update the Python model in `app/models/`
6. Run `python scripts/validate_api.py --imports` to verify no breakage

### SQL Migration Template
```sql
-- migrations/add_feature_to_table.sql
-- Description: [what this migration does]
-- Date: [YYYY-MM-DD]

-- Add column (use IF NOT EXISTS for idempotency)
ALTER TABLE table_name
ADD COLUMN IF NOT EXISTS column_name data_type DEFAULT default_value;

-- Add index if needed
CREATE INDEX IF NOT EXISTS idx_table_column ON table_name(column_name);

-- Backfill if needed (wrap in transaction)
BEGIN;
UPDATE table_name SET column_name = 'value' WHERE column_name IS NULL;
COMMIT;
```

### Data Types
- UUIDs: `UUID DEFAULT gen_random_uuid()` or `VARCHAR(36)`
- JSON: `JSONB` (not `JSON`) for indexable JSON data
- Timestamps: `TIMESTAMPTZ DEFAULT NOW()`
- Booleans: `BOOLEAN DEFAULT false`
- Enums: use `VARCHAR` with CHECK constraints, not Postgres ENUM types

### Idempotency
- Always use `IF NOT EXISTS` / `IF EXISTS` so migrations can be re-run safely
- Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` instead of raw `ADD COLUMN`
- For new tables: `CREATE TABLE IF NOT EXISTS`

### No Alembic
This project does NOT use Alembic autogeneration. All migrations are hand-written SQL run directly via `psql "$DATABASE_URL"`.
