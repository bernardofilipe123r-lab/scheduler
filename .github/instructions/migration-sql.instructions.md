---
description: "Use when editing migration SQL files. Covers idempotent migration patterns, verification steps, and Supabase PostgreSQL specifics."
applyTo: "migrations/**/*.sql"
---

# Migration SQL Rules

- **Always use `IF NOT EXISTS`** for columns, tables, indexes, and extensions. Migrations may be re-run.

- **Never use `NOT NULL` without a `DEFAULT`** on existing tables with data — it will fail on existing rows.

- **Run immediately after writing:**
  ```bash
  source .env 2>/dev/null; psql "$DATABASE_URL" -f migrations/<this_file>.sql
  ```

- **Verify after running:**
  ```bash
  source .env 2>/dev/null; psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name = '<table>' ORDER BY column_name;"
  ```

- **pgvector for embeddings:**
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE some_table ADD COLUMN IF NOT EXISTS embedding vector(1536);
  ```

- **UUID primary keys:**
  ```sql
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
  ```

- **Timestamps with timezone:**
  ```sql
  created_at TIMESTAMPTZ DEFAULT NOW()
  ```

- This project does NOT use Alembic — all migrations are raw SQL against Supabase via `psql`.
