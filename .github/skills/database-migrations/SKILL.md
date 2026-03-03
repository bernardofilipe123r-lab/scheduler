---
name: database-migrations
description: "Database migrations, SQLAlchemy models, Supabase PostgreSQL schema changes. Use when: adding or modifying database columns, writing migration SQL, running migrations against Supabase, creating new models, changing model relationships, troubleshooting missing column errors, validating schema alignment."
---

# Database Migrations & Models

## When to Use
- Adding new columns to SQLAlchemy models
- Writing migration SQL files
- Running migrations against Supabase
- Creating new database tables/models
- Changing model relationships or indexes
- Troubleshooting 500 errors from missing columns
- Validating schema alignment between models and database

## CRITICAL RULE

> **If a column exists in Python models but NOT in the database, every query on that table will 500 in production.** SQLAlchemy includes ALL mapped columns in SELECT statements — missing columns crash the entire endpoint.

## Migration Procedure

### Step 1: Write the Migration SQL
Create a file in `migrations/` with a descriptive name:
```sql
-- migrations/add_new_feature_column.sql
ALTER TABLE brands ADD COLUMN IF NOT EXISTS new_feature TEXT DEFAULT NULL;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS feature_enabled BOOLEAN DEFAULT FALSE;
```

### Step 2: Run Against Supabase
```bash
source .env 2>/dev/null; psql "$DATABASE_URL" -f migrations/add_new_feature_column.sql
```

### Step 3: Verify Columns Exist
```bash
source .env 2>/dev/null; psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'brands' ORDER BY column_name;"
```

### Step 4: Update SQLAlchemy Model
Add the column to the corresponding model in `app/models/`:
```python
new_feature = Column(Text, nullable=True)
feature_enabled = Column(Boolean, default=False)
```

### Step 5: Validate
```bash
python scripts/validate_api.py --imports
```

## Key Model Files

| File | Table(s) | Purpose |
|------|----------|---------|
| `app/models/brands.py` | `brands` | Multi-tenant brand store (credentials, colors, handles) |
| `app/models/auth.py` | `user_profiles` | User auth + billing status |
| `app/models/billing.py` | `brand_subscriptions` | Stripe per-brand subscriptions |
| `app/models/niche_config.py` | `niche_config` | Content DNA per user |
| `app/models/jobs.py` | `generation_jobs` | Content generation jobs |
| `app/models/scheduling.py` | `scheduled_reels` | Scheduled/published content |
| `app/models/analytics.py` | `post_performance`, `brand_analytics`, `analytics_snapshot`, etc. |
| `app/models/toby.py` | `toby_state`, `toby_strategy_scores`, `toby_experiments`, `toby_content_tags`, `toby_activity_log` |
| `app/models/toby_cognitive.py` | `toby_episodic_memory`, `toby_semantic_memory`, `toby_procedural_memory`, `toby_world_model`, `toby_meta_reports` |
| `app/models/youtube.py` | `youtube_channels`, `youtube_credentials` |
| `app/models/config.py` | `app_settings` |
| `app/models/oauth_state.py` | `oauth_states` |

## Brand Model (Most Modified)

The `Brand` model in `app/models/brands.py` is the most frequently modified. Key column groups:

| Group | Columns |
|-------|---------|
| Identity | `id` (PK), `user_id` (FK), `display_name`, `short_name` |
| Scheduling | `schedule_offset`, `posts_per_day`, `baseline_for_content` |
| Colors | `colors` (JSON: `{primary, accent, light_mode, dark_mode}`) |
| Instagram | `instagram_access_token`, `instagram_business_account_id`, `instagram_handle`, `instagram_token_expires_at`, `instagram_token_last_refreshed_at`, `meta_access_token` |
| Facebook | `facebook_page_id`, `facebook_access_token`, `facebook_page_name` |
| Threads | `threads_access_token`, `threads_user_id`, `threads_username`, `threads_token_expires_at`, `threads_token_last_refreshed_at` |
| TikTok | `tiktok_access_token`, `tiktok_refresh_token`, `tiktok_user_id`, `tiktok_username`, `tiktok_open_id`, `tiktok_access_token_expires_at`, `tiktok_refresh_token_expires_at` |
| Other | `logo_path`, `active`, `created_at`, `updated_at` |

## JSON Column Pattern

Several models use JSON columns for flexible storage:
```python
# Brand colors
colors = Column(JSON)  # {"primary": "#hex", "accent": "#hex", ...}

# Job outputs per brand
brand_outputs = Column(JSON)  # {"brand_id": {"status": "...", "video_url": "...", ...}}

# Schedule metadata
extra_data = Column(JSON)  # {"platforms": [...], "publish_results": {...}}
```

**CRITICAL:** When modifying JSON column contents, use `flag_modified()`:
```python
from sqlalchemy.orm.attributes import flag_modified

job.brand_outputs["brand_id"]["status"] = "completed"
flag_modified(job, "brand_outputs")  # Required or SQLAlchemy won't detect change
db.commit()
```

## Migration SQL Patterns

### Add Column
```sql
ALTER TABLE brands ADD COLUMN IF NOT EXISTS new_col TEXT DEFAULT NULL;
```

### Add Column with NOT NULL
```sql
ALTER TABLE brands ADD COLUMN IF NOT EXISTS new_col TEXT NOT NULL DEFAULT 'default_value';
```

### Create Table
```sql
CREATE TABLE IF NOT EXISTS new_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Add Index
```sql
CREATE INDEX IF NOT EXISTS idx_new_table_user_id ON new_table(user_id);
```

### Vector Column (pgvector)
```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE toby_episodic_memory ADD COLUMN IF NOT EXISTS embedding vector(1536);
```

## Database Connection

`app/db_connection.py` manages SQLAlchemy sessions:
- `get_db()` — FastAPI dependency (yields session, auto-closes)
- `get_session()` — Direct session for background tasks (Toby tick, schedulers)
- Connection pool: `pool_size=5`, `max_overflow=10`, `pool_timeout=30`

## Existing Migrations

| File | Purpose |
|------|---------|
| `toby_v2.sql` | Initial Toby state table |
| `toby_v3_cognitive.sql` | Memory tables (episodic, semantic, procedural, world model) |
| `toby_v3_phase2_phase3.sql` | Additional learning phases |
| `add_brand_subscriptions.sql` | Stripe per-brand subscriptions |
| `add_threads_tiktok_columns.sql` | Threads & TikTok credentials |
| `add_enabled_platforms.sql` | Track which platforms per brand |
| `add_toby_brand_config.sql` | Toby per-brand configuration |
| `analytics_v2_aggregates.sql` | Performance aggregates view |
| `add_music_track_id_to_jobs.sql` | Music selection per job |
| `add_user_billing.sql` | User billing columns |
| `add_user_music.sql` | User music library |
| `remove_niche_config_brand_id.sql` | Schema normalization |
| `disable_threads_tiktok.sql` | Platform disable columns |

## Common Mistakes to Avoid
1. **Model before migration:** NEVER add a column to the Python model without running the migration SQL first — it will 500 every query on that table
2. **Missing `flag_modified()`:** JSON column changes are silent without it — SQLAlchemy doesn't detect dict mutations
3. **Missing `IF NOT EXISTS`:** Always use `IF NOT EXISTS` for columns, tables, indexes — prevents migration re-run errors
4. **No Alembic:** This project does NOT use Alembic — migrations are raw SQL run via `psql`
5. **Verify after migration:** Always run the column verification query — don't assume the migration succeeded
6. **Run validate_api.py:** After any model change, run `python scripts/validate_api.py --imports` to verify imports still work
