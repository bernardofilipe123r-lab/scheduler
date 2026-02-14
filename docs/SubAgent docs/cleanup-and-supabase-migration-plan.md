# Cleanup & Supabase Migration Plan

> **Date:** 2026-02-14
> **Status:** PROPOSAL — awaiting review before implementation
> **Scope:** Security fixes, dead code cleanup, Supabase migration, multi-user architecture

---

## Table of Contents

1. [Security Issues (CRITICAL)](#1-security-issues-critical)
2. [Dead Files to Delete](#2-dead-files-to-delete)
3. [.gitignore Updates](#3-gitignore-updates)
4. [Current Database Schema](#4-current-database-schema)
5. [Supabase Migration Strategy](#5-supabase-migration-strategy)
6. [Multi-User Architecture](#6-multi-user-architecture)
7. [Authentication Overhaul](#7-authentication-overhaul)
8. [Implementation Phases](#8-implementation-phases)
9. [Risk Assessment](#9-risk-assessment)

---

## 1. Security Issues (CRITICAL)

### 🚨 P0 — Must fix IMMEDIATELY

| # | Issue | Location | Risk |
|---|-------|----------|------|
| S1 | **SSH private key committed to git history** | `ed25519_key` (root) | Even though `.gitignore` now lists it, the key is **still tracked by git** and persists in commit history. Anyone with repo access has the key. |
| S2 | **Real API key in `.env.example`** | `.env.example` line 6 — `DEAPI_API_KEY=2154\|jTXNfc...` | Template file contains a **live deAPI key**, exposed to anyone with repo access. |
| S3 | **CORS wide open with credentials** | `app/main.py` — `allow_origins=["*"], allow_credentials=True` | Any website can make authenticated cross-origin requests. Violates CORS spec (browsers should block `*` + credentials, but middleware behavior varies). |
| S4 | **Hardcoded default credentials** | `app/api/auth_routes.py:30-31` — `healveth@gmail.com` / `Healveth12345@` | Default login password visible in source code. |
| S5 | **Hardcoded logs password** | `logs_routes.py:35`, `ai_logs_routes.py:24`, `auth_routes.py:293` — `logs12345@` | Default password for logs dashboard, sent as query parameter (visible in URL bars, logs, referrer headers). |
| S6 | **SQLite database committed** | `reels_history.db` (root) | Database file in git history. |

### 🔶 P1 — Fix soon

| # | Issue | Location | Risk |
|---|-------|----------|------|
| S7 | **SHA-256 password hashing with static salt** | `auth_routes.py:49` — salt `reels-automation-salt-2026` | SHA-256 is fast and vulnerable to rainbow tables. Should use bcrypt/argon2. |
| S8 | **In-memory token store** | `auth_routes.py` — `_auth_tokens` dict | All sessions lost on server restart. No persistence. |
| S9 | **No rate limiting** on any endpoint | Entire API | No protection against brute-force login, API abuse. |
| S10 | **All API endpoints unauthenticated** | All routes except 3 auth endpoints | Any client can create jobs, manage brands, trigger Maestro bursts, read all data. |
| S11 | **File upload with no validation** | `brands_routes_v2.py:530` — logo upload | No file type check, no size limit, no content-type verification. |
| S12 | **Zero foreign keys in database** | All 20 models | No referential integrity. Orphaned records possible. |
| S13 | **Logs password sent as query parameter** | `logs_routes.py`, `ai_logs_routes.py` | URL-visible credential: browser history, server logs, referrer headers. |

### Remediation Steps

```bash
# S1: Remove tracked SSH key + rotate
git rm --cached ed25519_key
# Then: generate a NEW SSH key pair, revoke the old one everywhere

# S2: Remove real key from .env.example
# Replace with placeholder: DEAPI_API_KEY=your_deapi_key_here

# S6: Remove tracked SQLite
git rm --cached reels_history.db

# S3: Fix CORS — restrict to known origins
# allow_origins=["https://your-production-domain.com", "http://localhost:5173"]
```

---

## 2. Dead Files to Delete

### Root-level files (10 files, ~1,200 lines)

| File | Lines | Reason |
|------|------:|--------|
| `ed25519_key` | — | SSH private key — security risk, must delete from tracking |
| `reels_history.db` | — | SQLite database — should never be committed |
| `test_content_logic.py` | ~200 | Root-level ad-hoc test, references removed brand `gymcollege` |
| `test_phase2.py` | ~500 | Root-level test, should be in `tests/` if still relevant |
| `test_v2_architecture.py` | ~100 | Root-level smoke test, should be in `tests/` if still relevant |
| `railway_sync.sh` | ~30 | One-time Railway env sync script, already run |
| `railway_sync_scheduler.sh` | ~30 | One-time Railway scheduler sync, already run |
| `link_to_scheduler.sh` | ~10 | Hardcoded path helper, one-time use |
| `run_local.sh` | ~10 | Duplicate of `run_local_dev.sh` |
| `RAILWAY_VOLUME_SETUP.md` | ~50 | One-time setup doc, already completed |

### Backend files

| File | Lines | Reason |
|------|------:|--------|
| `app/database/db.py` | 155 | Legacy SQLite `ReelDatabase` — superseded by SQLAlchemy + `db_connection.py`. Not imported by any service file. |
| `app/database/__init__.py` | ~5 | Package init for legacy DB module |

### Output files still tracked

| File | Reason |
|------|--------|
| `output/test_video.mp4` | Test artifact committed to git |
| `youtube_quota.json` | Runtime quota tracker, resets daily |

**Total removable: ~2,090 lines + binary files**

---

## 3. .gitignore Updates

### Currently missing

```gitignore
# Runtime data
youtube_quota.json
output/brand-data/

# Ensure these are git rm --cached if still tracked
ed25519_key
reels_history.db
output/test_video.mp4
```

### Files to untrack (already in .gitignore but still tracked)

```bash
git rm --cached ed25519_key
git rm --cached reels_history.db
git rm --cached output/test_video.mp4
git rm --cached youtube_quota.json
```

---

## 4. Current Database Schema

### Overview: 20 models across 17 tables

| Domain | Models | Has `user_id` |
|--------|--------|:---:|
| **Jobs** | `GenerationJob` | ✅ |
| **Scheduling** | `ScheduledReel` | ✅ |
| **Brands** | `Brand` | ❌ |
| **AI Agents** | `AIAgent`, `AgentPerformance`, `AgentLearning`, `GenePool`, `TobyProposal` | ❌ |
| **Auth** | `UserProfile` | IS user table |
| **Analytics** | `BrandAnalytics`, `AnalyticsRefreshLog`, `AnalyticsSnapshot`, `ContentHistory`, `PostPerformance`, `TrendingContent` | ❌ (except AnalyticsRefreshLog) |
| **YouTube** | `YouTubeChannel` | ❌ |
| **Logs** | `LogEntry`, `SystemDiagnostic` | ❌ |
| **Config** | `MaestroConfig`, `AppSettings` | ❌ |

### Schema Issues

1. **Zero foreign keys** — All cross-table references are implicit string matches. No referential integrity.
2. **14 of 20 models missing `user_id`** — Single-tenant design throughout.
3. **Sensitive data in plaintext** — Access tokens stored as plain `Text` columns (Instagram, Facebook, Meta, YouTube). Should be encrypted at rest.
4. **No Row Level Security** — Any authenticated user could access all data.
5. **Manual migrations** — `db_connection.py` has ~30 raw SQL `ALTER TABLE` statements instead of a proper migration tool (Alembic).

### Complete Column Reference

<details>
<summary>Click to expand full schema for all 20 models</summary>

#### `generation_jobs`
| Column | Type | Notes |
|--------|------|-------|
| `job_id` | String(20) PK | e.g. "GEN-001234" |
| `user_id` | String(100) NOT NULL, indexed | |
| `status` | String(20) NOT NULL, indexed | "pending"/"generating"/"completed"/"failed" |
| `title` | String(500) NOT NULL | |
| `content_lines` | JSON NOT NULL | |
| `variant` | String(10) NOT NULL | "light"/"dark"/"post" |
| `ai_prompt` | Text | |
| `cta_type` | String(50) | |
| `brands` | JSON NOT NULL | |
| `platforms` | JSON | |
| `fixed_title` | Boolean NOT NULL, default false | |
| `brand_outputs` | JSON, default {} | |
| `ai_background_path` | String(500) | |
| `current_step` | String(100) | |
| `progress_percent` | Integer, default 0 | |
| `created_at` | DateTime(tz) NOT NULL, indexed | |
| `started_at` | DateTime(tz) | |
| `completed_at` | DateTime(tz) | |
| `error_message` | Text | |

#### `scheduled_reels`
| Column | Type | Notes |
|--------|------|-------|
| `schedule_id` | String(36) PK | |
| `user_id` | String(100) NOT NULL, indexed | |
| `user_name` | String(255) | |
| `reel_id` | String(36) NOT NULL, indexed | |
| `caption` | Text | |
| `scheduled_time` | DateTime(tz) NOT NULL, indexed | |
| `created_at` | DateTime(tz) NOT NULL | |
| `status` | String(20) NOT NULL, indexed | |
| `published_at` | DateTime(tz) | |
| `publish_error` | Text | |
| `extra_data` | JSON | |

#### `brands`
| Column | Type | Notes |
|--------|------|-------|
| `id` | String(50) PK | e.g. "healthycollege" |
| `display_name` | String(100) NOT NULL | |
| `short_name` | String(10) NOT NULL | |
| `instagram_handle` | String(100) | |
| `facebook_page_name` | String(100) | |
| `youtube_channel_name` | String(100) | |
| `schedule_offset` | Integer, default 0 | |
| `posts_per_day` | Integer, default 6 | |
| `baseline_for_content` | Boolean, default false | |
| `colors` | JSON NOT NULL, default {} | |
| `instagram_access_token` | Text | ⚠️ sensitive |
| `instagram_business_account_id` | String(100) | |
| `facebook_page_id` | String(100) | |
| `facebook_access_token` | Text | ⚠️ sensitive |
| `meta_access_token` | Text | ⚠️ sensitive |
| `logo_path` | String(255) | |
| `active` | Boolean NOT NULL, default true | |
| `created_at` | DateTime(tz) NOT NULL | |
| `updated_at` | DateTime(tz) NOT NULL | |

#### `ai_agents`
| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `agent_id` | String(50) NOT NULL, unique, indexed | |
| `display_name` | String(100) NOT NULL | |
| `personality` | Text NOT NULL | |
| `temperature` | Float NOT NULL, default 0.85 | |
| `variant` | String(20) NOT NULL, default "dark" | |
| `proposal_prefix` | String(20) NOT NULL, default "AI" | |
| `strategy_names` | Text NOT NULL | JSON string |
| `strategy_weights` | Text NOT NULL | JSON string |
| `risk_tolerance` | String(20) NOT NULL, default "medium" | |
| `proposals_per_brand` | Integer NOT NULL, default 3 | |
| `content_types` | Text NOT NULL, default '["reel"]' | |
| `active` | Boolean NOT NULL, default true | |
| `is_builtin` | Boolean NOT NULL, default false | |
| `created_for_brand` | String(100) | |
| `survival_score` | Float, default 0.0 | |
| `lifetime_views` | Integer, default 0 | |
| `lifetime_proposals` | Integer, default 0 | |
| `lifetime_accepted` | Integer, default 0 | |
| `generation` | Integer, default 1 | |
| `last_mutation_at` | DateTime | |
| `mutation_count` | Integer, default 0 | |
| `parent_agent_id` | String(50) | |
| `created_at` | DateTime | |
| `updated_at` | DateTime | |

#### `toby_proposals`
| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `proposal_id` | String(20) NOT NULL, unique, indexed | |
| `status` | String(20) NOT NULL, indexed, default "pending" | |
| `agent_name` | String(20) NOT NULL, indexed, default "toby" | |
| `content_type` | String(10) NOT NULL, default "reel" | |
| `brand` | String(50), indexed | |
| `variant` | String(10) | |
| `strategy` | String(20) NOT NULL | |
| `reasoning` | Text NOT NULL | |
| `title` | Text NOT NULL | |
| `content_lines` | JSON | |
| `slide_texts` | JSON | |
| `image_prompt` | Text | |
| `caption` | Text | |
| `topic_bucket` | String(50) | |
| `source_type` | String(30) | |
| `source_ig_media_id` | String(100) | |
| `source_title` | Text | |
| `source_performance_score` | Float | |
| `source_account` | String(100) | |
| `quality_score` | Float | |
| `examiner_score` | Float | |
| `examiner_avatar_fit` | Float | |
| `examiner_content_quality` | Float | |
| `examiner_engagement` | Float | |
| `examiner_verdict` | String(20) | |
| `examiner_reason` | Text | |
| `examiner_red_flags` | JSON | |
| `reviewed_at` | DateTime(tz) | |
| `reviewer_notes` | Text | |
| `accepted_job_id` | String(50) | |
| `created_at` | DateTime(tz) NOT NULL, indexed | |

#### `agent_performance`
Composite index: `(agent_id, period, created_at)`
| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `agent_id` | String(50) NOT NULL, indexed | |
| `period` | String(20) NOT NULL, default "feedback" | |
| `total_proposals`–`avg_engagement_rate` | Numeric fields | |
| `strategy_breakdown` | JSON | |
| `best_strategy` / `worst_strategy` | String(30) | |
| `avg_examiner_score` | Float | |
| `survival_score` | Float, default 0.0 | |
| `created_at` | DateTime NOT NULL, indexed | |

#### `agent_learning`
Composite index: `(agent_id, created_at)`
| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `agent_id` | String(50) NOT NULL, indexed | |
| `mutation_type` | String(30) NOT NULL | |
| `description` | Text NOT NULL | |
| `old_value` / `new_value` | JSON | |
| `trigger` | String(30) NOT NULL, default "feedback" | |
| `confidence` | Float | |
| `survival_score_at` | Float | |
| `created_at` | DateTime NOT NULL, indexed | |

#### `gene_pool`
| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `source_agent_id` | String(50) NOT NULL, indexed | |
| `source_agent_name` | String(100) NOT NULL | |
| DNA fields (personality, temperature, etc.) | Various | |
| `survival_score` | Float, default 0.0 | |
| `reason` | String(30) NOT NULL | |
| `times_inherited` | Integer, default 0 | |
| `created_at` | DateTime NOT NULL, indexed | |

#### `user_profiles`
| Column | Type | Notes |
|--------|------|-------|
| `user_id` | String(100) PK | |
| `user_name` | String(255) NOT NULL | |
| `email` | String(255), unique, indexed | |
| Social credentials | Text (IG, FB, Meta tokens) | ⚠️ sensitive |
| `active` | Boolean NOT NULL, default true | |
| `created_at` / `updated_at` | DateTime(tz) | |

#### `brand_analytics`
Composite PK: `(brand, platform)`
| Column | Type | Notes |
|--------|------|-------|
| `brand` | String(50) PK | |
| `platform` | String(20) PK | |
| `followers_count` | Integer, default 0 | |
| Metrics fields | Integer | |
| `extra_metrics` | JSON | |
| `last_fetched_at` / `created_at` | DateTime(tz) | |

#### `analytics_refresh_log`
| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `refreshed_at` | DateTime(tz), indexed | |
| `user_id` | String(100) | Optional |
| `status` | String(20), default "success" | |
| `error_message` | Text | |

#### `analytics_snapshots`
| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `brand` | String(50), indexed | |
| `platform` | String(20), indexed | |
| `snapshot_at` | DateTime(tz), indexed | |
| Metrics fields | Integer | |

#### `content_history`
Multiple composite indexes
| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `content_type` | String(10), indexed | |
| `title` | Text NOT NULL | |
| `keyword_hash` | String(64), indexed | Dedup hash |
| `keywords` | Text | |
| `topic_bucket` | String(50), indexed | |
| `brand` | String(50), indexed | |
| `quality_score` | Float | |
| `was_used` | Boolean, default true | |
| `image_prompt` / `caption` | Text | |
| `created_at` | DateTime(tz), indexed | |

#### `post_performance`
| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `ig_media_id` | String(100), unique, indexed | |
| `fb_post_id` | String(100) | |
| `brand` | String(50), indexed | |
| `content_type` | String(10), default "reel" | |
| `schedule_id` | String(50), indexed | |
| Title, caption, topic fields | Text/String | |
| Engagement metrics (views, likes, etc.) | Integer | |
| `engagement_rate` / `performance_score` / `percentile_rank` | Float | |
| Timestamps (published, fetched, 24h, 48h, 7d) | DateTime(tz) | |

#### `trending_content`
| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `ig_media_id` | String(100), unique, indexed | |
| Source fields (account, url, caption, type) | Various | |
| `hashtags` | JSON | |
| `like_count` / `comments_count` | Integer | |
| Discovery fields (method, hashtag) | String | |
| `used_for_proposal` | Boolean, default false | |
| `proposal_id` | String(20) | |
| Timestamps | DateTime(tz) | |

#### `youtube_channels`
| Column | Type | Notes |
|--------|------|-------|
| `brand` | String(50) PK | |
| `channel_id` | String(100), indexed | |
| `channel_name` | String(255) | |
| `refresh_token` | Text NOT NULL | ⚠️ sensitive |
| `status` | String(20), default "connected" | |
| Timestamps | DateTime(tz) | |

#### `app_logs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `timestamp` | DateTime(tz), indexed | |
| `level` / `category` / `source` | String, indexed | |
| `message` | Text NOT NULL | |
| `details` | JSON | |
| `request_id` / `deployment_id` | String, indexed | |
| HTTP fields (method, path, status) | Various | |

#### `system_diagnostics`
| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `status` | String(20) | |
| Check counts, agent stats | Integer/Float | |
| `checks` | JSON | |
| `created_at` | DateTime, indexed | |

#### `maestro_config`
| Column | Type | Notes |
|--------|------|-------|
| `key` | String(100) PK | |
| `value` | Text NOT NULL | |
| `updated_at` | DateTime | |

#### `app_settings`
| Column | Type | Notes |
|--------|------|-------|
| `key` | String(100) PK | |
| `value` | Text | |
| `description` | Text | |
| `category` | String(50) | |
| `value_type` | String(20), default "string" | |
| `sensitive` | Boolean, default false | |
| `updated_at` | DateTime(tz) | |

</details>

---

## 5. Supabase Migration Strategy

### 5.1 Connection Change

**Current:** Railway PostgreSQL via `DATABASE_URL`
**Target:** Supabase PostgreSQL

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres
```

**Minimal change:** Update `DATABASE_URL` environment variable. SQLAlchemy connects the same way — PostgreSQL is PostgreSQL. The connection string, pool config in `db_connection.py`, and ORM code all work unchanged.

### 5.2 Data Migration

#### Option A: pg_dump / pg_restore (Recommended)

```bash
# 1. Dump from Railway
pg_dump --no-owner --no-acl -Fc \
  "postgresql://postgres:RAILWAY_PASSWORD@HOST:PORT/railway" \
  > railway_dump.sql

# 2. Restore to Supabase
pg_restore --no-owner --no-acl -d \
  "postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres" \
  railway_dump.sql
```

#### Option B: Supabase Migration Files

Write proper SQL migration files in `supabase/migrations/` for a clean schema, then seed data separately. Better for multi-tenant conversion since we can add `user_id` columns in the same migration.

**Recommendation:** Option B — clean migration files. The schema needs `user_id` additions anyway, so a fresh migration with the correct schema is cleaner than dumping + altering.

### 5.3 Migration Tool: Replace Manual SQL with Alembic or Supabase CLI

**Current state:** `db_connection.py` has ~30 hand-written `ALTER TABLE` SQL statements in `run_migrations()`. This is fragile and doesn't track which migrations have run.

**Target:** Use one of:
- **Supabase CLI migrations** (`supabase/migrations/*.sql`) — native to Supabase, version-controlled
- **Alembic** — Python-native, integrates with SQLAlchemy models

**Recommendation:** Supabase CLI migrations for the initial schema + RLS policies. Keep SQLAlchemy models as the source of truth for Python code.

---

## 6. Multi-User Architecture

### 6.1 User Identity

**Current:** Single user. `user_id` is a loose string, sometimes `"maestro"`, sometimes a proposal ID.

**Target:** `user_id` is a UUID from `auth.users` (Supabase Auth). Every tenant-scoped table has a `user_id UUID REFERENCES auth.users(id)` column.

### 6.2 Tables Requiring `user_id`

| Table | Current `user_id` | Action |
|-------|:---:|--------|
| `generation_jobs` | ✅ String(100) | Change type to `UUID`, add FK to `auth.users` |
| `scheduled_reels` | ✅ String(100) | Change type to `UUID`, add FK |
| `brands` | ❌ | **Add** `user_id UUID NOT NULL REFERENCES auth.users(id)` |
| `ai_agents` | ❌ | **Add** `user_id UUID NOT NULL` |
| `agent_performance` | ❌ | **Add** `user_id UUID NOT NULL` |
| `agent_learning` | ❌ | **Add** `user_id UUID NOT NULL` |
| `gene_pool` | ❌ | **Add** `user_id UUID NOT NULL` |
| `toby_proposals` | ❌ | **Add** `user_id UUID NOT NULL` |
| `brand_analytics` | ❌ | **Add** `user_id UUID NOT NULL` |
| `analytics_snapshots` | ❌ | **Add** `user_id UUID NOT NULL` |
| `content_history` | ❌ | **Add** `user_id UUID NOT NULL` |
| `post_performance` | ❌ | **Add** `user_id UUID NOT NULL` |
| `trending_content` | ❌ | **Add** `user_id UUID NOT NULL` |
| `youtube_channels` | ❌ | **Add** `user_id UUID NOT NULL` |
| `analytics_refresh_log` | Optional | **Add** `user_id UUID` (keep optional) |

#### Tables that stay global (no `user_id`)

| Table | Reason |
|-------|--------|
| `app_logs` | System-wide logging |
| `system_diagnostics` | System health checks |
| `maestro_config` | System-wide orchestrator config |
| `app_settings` | System-wide settings |
| `user_profiles` | IS the user table (maps to `auth.users`) |

### 6.3 Row Level Security (RLS)

For every tenant-scoped table:

```sql
-- Enable RLS
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own rows
CREATE POLICY "Users see own brands"
  ON brands FOR SELECT
  USING (user_id = auth.uid());

-- Policy: users can only insert their own rows
CREATE POLICY "Users insert own brands"
  ON brands FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy: users can only update their own rows
CREATE POLICY "Users update own brands"
  ON brands FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: users can only delete their own rows
CREATE POLICY "Users delete own brands"
  ON brands FOR DELETE
  USING (user_id = auth.uid());
```

Repeat for all 14 tenant-scoped tables.

### 6.4 Existing Data Migration

For existing data (single-user), assign all rows to the first (admin) user:

```sql
-- Create the admin user in Supabase Auth first, then:
UPDATE brands SET user_id = 'ADMIN_USER_UUID' WHERE user_id IS NULL;
UPDATE ai_agents SET user_id = 'ADMIN_USER_UUID' WHERE user_id IS NULL;
-- ... repeat for all tables
```

### 6.5 Backend Code Changes

Every database query needs a `user_id` filter:

```python
# BEFORE (single-user)
brands = db.query(Brand).filter(Brand.active == True).all()

# AFTER (multi-user)
brands = db.query(Brand).filter(Brand.active == True, Brand.user_id == current_user.id).all()
```

**Affected code patterns:**
- `brand_resolver.py` — Must be per-user (can no longer be a global singleton)
- `brand_manager.py` — All queries need user_id filter
- `job_manager.py` / `job_processor.py` — Filter by user
- `db_scheduler.py` — Schedule per user
- `maestro.py` + all sub-modules — Per-user orchestration
- `generic_agent.py` — Agents belong to users
- `evolution_engine.py` — Evolution per user
- All API routes — Extract `user_id` from Supabase JWT

#### BrandResolver Becomes Per-User

```python
# BEFORE
brand_resolver = BrandResolver()  # singleton

# AFTER
def get_brand_resolver(user_id: UUID) -> BrandResolver:
    """Get a user-scoped brand resolver."""
    return BrandResolver(user_id=user_id)
```

### 6.6 Maestro Per-User Considerations

The Maestro daemon currently runs as a single background process for all brands. For multi-user:

**Option A: Shared Maestro (simpler)**
- Single Maestro process iterates over all users
- Each cycle: `for user in active_users: run_burst(user)`
- Pros: Simple, one process
- Cons: Slow for many users, no isolation

**Option B: Per-User Workers (scalable)**
- Maestro dispatches per-user tasks to a job queue (Celery, Supabase Edge Functions, etc.)
- Each user's burst runs independently
- Pros: Scalable, isolated
- Cons: More infrastructure

**Recommendation:** Start with Option A. Refactor to Option B when user count exceeds ~20.

---

## 7. Authentication Overhaul

### 7.1 Replace Custom Auth with Supabase Auth

**Current system (to be removed entirely):**
- SHA-256 password hashing with static salt
- In-memory token store (lost on restart)
- Single hardcoded user
- `verify_auth_token()` dependency

**Target: Supabase Auth**
- JWT-based authentication
- Email/password, OAuth (Google, GitHub), magic links
- Supabase manages sessions, refresh tokens, MFA
- Backend validates JWT using Supabase's public key

### 7.2 Backend JWT Verification

```python
# New dependency: verify Supabase JWT
from supabase import create_client

async def get_current_user(authorization: str = Header(...)):
    """Verify Supabase JWT and return user."""
    token = authorization.replace("Bearer ", "")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    user = supabase.auth.get_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user
```

Apply `Depends(get_current_user)` to ALL API routes (except health checks).

### 7.3 Frontend Auth

```typescript
// Install: npm install @supabase/supabase-js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://YOUR_PROJECT.supabase.co',
  'your_supabase_anon_key_here'
)

// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
})

// Attach JWT to all API calls
const token = (await supabase.auth.getSession()).data.session?.access_token
fetch('/api/brands', { headers: { Authorization: `Bearer ${token}` }})
```

### 7.4 Files to Remove/Replace

| File | Action |
|------|--------|
| `app/api/auth_routes.py` | **Rewrite** — replace with Supabase JWT verification |
| `src/pages/Login.tsx` | **Rewrite** — use Supabase Auth UI or SDK |
| `src/features/auth/` | **Rewrite** — Supabase session management |

---

## 8. Implementation Phases

### Phase 1: Security Hardening (Day 1)
**Risk: LOW | Impact: CRITICAL**

1. `git rm --cached ed25519_key reels_history.db output/test_video.mp4 youtube_quota.json`
2. Update `.gitignore` with missing entries
3. Replace real API key in `.env.example` with placeholder
4. Remove hardcoded default credentials from `auth_routes.py`
5. Restrict CORS to specific origins
6. Commit and push

### Phase 2: Dead Code Cleanup (Day 1)
**Risk: LOW | Impact: MEDIUM**

1. Delete 10 root-level dead files
2. Delete `app/database/` (legacy SQLite module)
3. Commit and push

### Phase 3: Supabase Connection (Day 2)
**Risk: MEDIUM | Impact: HIGH**

1. Update `DATABASE_URL` to Supabase connection string
2. Verify SQLAlchemy connects successfully
3. Run `init_db()` to create all tables on Supabase
4. Migrate existing data from Railway via pg_dump/pg_restore
5. Test all endpoints against Supabase

### Phase 4: Authentication (Day 3-4)
**Risk: HIGH | Impact: HIGH**

1. Install `supabase-py` (backend) and `@supabase/supabase-js` (frontend)
2. Create `get_current_user()` dependency from Supabase JWT
3. Apply auth dependency to ALL API routes
4. Rewrite `Login.tsx` to use Supabase Auth
5. Update frontend API client to attach JWT
6. Create initial admin user in Supabase dashboard
7. Test login → API flow end-to-end

### Phase 5: Multi-User Schema (Day 5-7)
**Risk: HIGH | Impact: HIGH**

1. Add `user_id UUID` columns to 14 tables
2. Add foreign key constraints to `auth.users`
3. Backfill existing data with admin user UUID
4. Add NOT NULL constraint after backfill
5. Add indexes on `user_id` columns
6. Create RLS policies for all tenant-scoped tables
7. Update ALL backend queries to filter by `user_id`
8. Refactor `brand_resolver` to be per-user

### Phase 6: Maestro Multi-User (Day 8-10)
**Risk: HIGH | Impact: HIGH**

1. Refactor Maestro to iterate over users
2. Per-user agent management
3. Per-user daily burst
4. Per-user scheduling
5. Test with 2+ users

---

## 9. Risk Assessment

| Phase | Risk | Mitigation |
|-------|------|-----------|
| 1. Security | LOW | Non-breaking file changes |
| 2. Cleanup | LOW | Deleting unused files only |
| 3. Supabase Connection | MEDIUM | Same PostgreSQL dialect — test thoroughly. Keep Railway as fallback until verified. |
| 4. Authentication | HIGH | Breaking change — all endpoints become authenticated. Coordinate frontend + backend deployment. Feature flag recommended. |
| 5. Multi-User Schema | HIGH | Schema migration on production data. Test on staging first. Backup before migration. |
| 6. Maestro Multi-User | HIGH | Core business logic change. Extensive testing required. |

### Rollback Strategy

- **Phases 1-2:** No rollback needed (non-breaking)
- **Phase 3:** Keep Railway `DATABASE_URL` as env var — switch back by changing one variable
- **Phases 4-6:** Feature flag `MULTI_USER_ENABLED=false` — all new code runs behind this flag, old behavior preserved when false

---

## Environment Variables Summary

### Current (to keep)
```
DATABASE_URL              # Change to Supabase connection string
DEEPSEEK_API_KEY          # AI generation
DEAPI_API_KEY             # Background image generation
PORT                      # Server port
PUBLIC_URL_BASE           # Public URL for media serving
```

### New (to add)
```
SUPABASE_URL              # https://YOUR_PROJECT.supabase.co
SUPABASE_KEY              # your_supabase_anon_key_here
SUPABASE_SERVICE_KEY      # your_supabase_service_key_here (backend only)
SUPABASE_JWT_SECRET       # For JWT verification
CORS_ORIGINS              # Comma-separated allowed origins
```

### To remove (after migration)
```
LOGS_PASSWORD             # Replace with Supabase Auth
INSTAGRAM_APP_ID          # Move to per-brand DB config
INSTAGRAM_APP_SECRET      # Move to per-brand DB config
YOUTUBE_CLIENT_ID         # Move to system-level DB config
YOUTUBE_CLIENT_SECRET     # Move to system-level DB config
All {BRAND}_* env vars    # Already in DB, env vars are legacy fallbacks
```

---

## Codebase Size Summary

| Area | Files | Lines |
|------|------:|------:|
| Backend services | 25 | 18,032 |
| Backend API routes | 12 | ~6,500 |
| Backend models | 10 | ~1,370 |
| Backend other (main, db, config) | 8 | ~1,500 |
| Frontend pages | 20 | 12,357 |
| Frontend features | ~30 | ~4,500 |
| Frontend shared | ~10 | ~2,000 |
| **Total** | **~115** | **~46,000** |

### Files to delete in this plan: ~2,090 lines + binaries

---

*End of plan. Awaiting review before implementation.*
