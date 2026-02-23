# Architecture Analysis: Scheduler (Social Content Automation Platform)

## 1. What This App Does

A **multi-tenant SaaS platform** for automated social media content creation and publishing. It generates viral short-form content (Instagram Reels, carousel posts, Facebook posts, YouTube Shorts) using AI, renders branded images/videos, and auto-publishes on schedule.

**Core workflow:**
1. User creates a **Brand** with niche config (topic, audience, tone, visual style)
2. AI generates content (titles, text, image prompts) via **DeepSeek API**
3. Images are generated via **Flux1schnell / ZImageTurbo** models
4. Videos are rendered via **FFmpeg**, carousels via **Node.js Konva**
5. Content is stored in **Supabase Storage**
6. A background scheduler auto-publishes to Instagram/Facebook/YouTube at configured times
7. **Toby** (autonomous agent) can auto-plan and generate content on 5-minute ticks

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS |
| **State Management** | React Query (TanStack Query v5) |
| **Routing** | React Router v6 (SPA) |
| **Backend** | Python FastAPI |
| **ORM** | SQLAlchemy (direct PostgreSQL) |
| **Database** | Supabase PostgreSQL |
| **Auth** | Supabase Auth (JWT ES256/HS256) |
| **File Storage** | Supabase Storage (REST API, raw HTTP) |
| **AI Content** | DeepSeek API |
| **Image Generation** | Custom API (Flux1schnell for reels, ZImageTurbo for posts) |
| **Video Rendering** | FFmpeg (Python subprocess) |
| **Carousel Rendering** | Node.js + Konva (server-side canvas) |
| **Task Scheduling** | APScheduler (BackgroundScheduler) |
| **Social Publishing** | Meta Graph API (Instagram/Facebook), YouTube Data API |
| **Analytics** | Recharts (frontend), custom metrics collector (backend) |
| **Deployment** | Railway (inferred from health check comments) |

---

## 3. Main Entry Points

| Entry Point | File | Purpose |
|-------------|------|---------|
| **Backend** | `app/main.py` | FastAPI app, startup tasks, scheduler init, SPA serving |
| **Frontend** | `src/main.tsx` | React app bootstrap |
| **DB Init** | `app/db_connection.py` | SQLAlchemy engine, session factory, startup migrations |
| **Content Gen** | `app/services/content/generator.py` | `ContentGeneratorV2` - DeepSeek AI content pipeline |
| **Job Processing** | `app/services/content/job_processor.py` | `JobProcessor` - image/video/carousel pipeline |
| **Publishing** | `app/services/publishing/scheduler.py` | `DatabaseSchedulerService` - auto-publish loop |
| **Brand Management** | `app/services/brands/manager.py` | `BrandManager` - CRUD, seeding |
| **Toby Agent** | `app/services/toby/orchestrator.py` | Autonomous content planning agent |

---

## 4. Critical Issues (Current)

### 4.1 CRITICAL: API Credentials Stored in Plaintext in PostgreSQL

```python
# app/models/brands.py
instagram_access_token = Column(Text, nullable=True)
meta_access_token = Column(Text, nullable=True)
```

**Problem:** Meta access tokens, Instagram tokens, and Facebook tokens are stored as plaintext `Text` columns. Anyone with database read access (or a SQL injection) gets all your users' social media tokens.

**Fix:** Use Supabase Vault (available on Pro tier) or application-level encryption (e.g., `cryptography.fernet`) with a key in environment variables. At minimum, enable Row Level Security on the `brands` table.

### 4.2 CRITICAL: No Row Level Security (RLS) on Supabase

The application relies **entirely on application-level filtering** (`Brand.user_id == user["id"]`) for multi-tenant isolation. There are no RLS policies on any table.

**Problem:** If any code path forgets to filter by `user_id`, data leaks across tenants. The `BrandResolver` singleton caches brands per-user but falls back to `user_id=None` in several code paths (startup, scheduler, Toby).

**Affected tables:** `brands`, `generation_jobs`, `scheduled_reels`, `niche_config`, `app_settings`, `log_entries`

**Fix:** Add RLS policies to all tables. Example:
```sql
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own brands"
  ON brands FOR ALL
  USING (user_id = auth.uid()::text);
```

### 4.3 CRITICAL: Monolithic `main.py` Startup (800+ lines)

The entire publishing pipeline (`check_and_publish`) is a 300+ line function defined **inside** `startup_event()` in `main.py`. This function:
- Downloads images from Supabase
- Renders carousel slides (calls Node.js subprocess)
- Publishes to Instagram/Facebook/YouTube
- Handles partial retries and error recovery

**Problems:**
- Untestable (nested function inside startup)
- Single point of failure (if publishing crashes, the entire scheduler stops)
- No retry with backoff on Meta API rate limits
- Blocking I/O in the scheduler thread

### 4.4 HIGH: `app_settings` is Global (Not Per-User)

```python
# app/core/prompt_templates.py:28
def get_content_prompts() -> Dict[str, str]:
    rows = db.query(AppSettings.key, AppSettings.value)
        .filter(AppSettings.key.in_(['posts_prompt', 'reels_prompt', 'brand_description']))
```

**Problem:** `reels_prompt`, `posts_prompt`, and `brand_description` are loaded from a **global** `app_settings` table with no `user_id` filter. When you have 100 clients, they will all share the same global prompts.

**Fix:** Move these to the existing `NicheConfig` model (which already supports per-user, per-brand config) or add `user_id` to `app_settings`.

### 4.5 HIGH: No Rate Limiting on API Endpoints

No rate limiting middleware on any endpoint. A single client can spam `/reels/content/generate` and exhaust your DeepSeek API budget.

**Fix:** Add `slowapi` or a custom middleware with per-user rate limits. Supabase Edge Functions could also handle rate limiting at the edge.

### 4.6 HIGH: Synchronous DB Operations in Async Endpoints

```python
# FastAPI endpoints are async but all DB operations are synchronous SQLAlchemy
async def list_brands(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    brands = manager.get_all_brands(user_id=user["id"])  # Blocking!
```

**Problem:** Synchronous SQLAlchemy queries block the event loop. Under load (100+ concurrent users), this will cause request timeouts and poor throughput.

**Fix:** Either switch to `sqlalchemy[asyncio]` with `asyncpg`, or use `def` (sync) endpoints instead of `async def` so FastAPI runs them in a thread pool automatically.

### 4.7 MEDIUM: Thread-Based Job Processing

```python
# app/main.py:371
t = threading.Thread(target=_resume_jobs, args=(resume_ids,), daemon=True)
t.start()
```

Jobs are processed in Python threads with no worker pool, no queue, and no backpressure. If 100 users each trigger content generation simultaneously, you get 100 threads all calling DeepSeek API + image generation + FFmpeg concurrently.

**Fix:** Use a proper task queue (Celery/Redis, or Supabase Edge Functions for lightweight tasks). For now, at minimum add a `ThreadPoolExecutor` with a bounded pool size.

---

## 5. Scalability Issues at 100+ Clients

### 5.1 Database Connection Pool Too Small

```python
# app/db_connection.py
engine = create_engine(DATABASE_URL, pool_size=5, max_overflow=10)
```

With 100 clients, you get 15 max connections. Supabase Free tier allows ~60 direct connections (with connection pooler). Pro tier with PgBouncer supports more.

**Recommendation:** Use Supabase connection pooler (port 6543 instead of 5432) and increase `pool_size` to 10-20 on Pro tier.

### 5.2 `BrandResolver` Cache is In-Process

The `BrandResolver` singleton caches brands per-user in memory with a 60-second TTL. With 100 users, this means:
- Up to 100 cache entries refreshed every 60 seconds = ~100 DB queries/minute just for brand resolution
- If you scale to multiple server instances, each has its own cache (no shared invalidation)

**Recommendation:** Use Redis for caching (or Supabase Realtime for cache invalidation across instances).

### 5.3 APScheduler is Single-Instance

`BackgroundScheduler` runs in-process. If you deploy multiple instances (horizontal scaling), each instance runs its own scheduler, causing **duplicate publishes**.

**Recommendation:** Use a distributed scheduler (APScheduler with a database job store, or Supabase `pg_cron` + Edge Functions).

### 5.4 Storage Paths Assume Single Bucket

All files go to one bucket with path-based isolation (`user_id/brand/category/file`). Supabase Free tier has limited storage (1GB). With 100 clients generating images and videos, this fills up quickly.

**Recommendation:** Supabase Pro tier (100GB storage) is likely necessary. Consider lifecycle policies to auto-delete old generated content.

### 5.5 No Pagination on List Endpoints

```python
# Several endpoints return ALL records
brands = query.order_by(Brand.display_name).all()
```

No pagination on brands, jobs, scheduled reels, or logs. Fine for 5 brands, not for 100+ clients with thousands of jobs.

---

## 6. Health/Wellness Domain Assumptions

### 6.1 Hardcoded Default Brands (Low Impact)

```python
# app/services/brands/manager.py
DEFAULT_BRANDS = {
    "healthycollege": {...},
    "longevitycollege": {...},
    "vitalitycollege": {...},
    "holisticcollege": {...},
    "wellbeingcollege": {...},
}
```

These are **only used for seeding** (and seeding is currently disabled: `seed_default_brands` returns 0). The data itself is harmless but adds confusion for developers.

**Impact:** Low. New users create their own brands via the UI.
**Fix:** Remove `DEFAULT_BRANDS` and `DEFAULT_BRAND_COLORS` dicts entirely since seeding is disabled.

### 6.2 Hardcoded Citation Examples Still Reference Health/Medical

```python
# app/core/prompt_templates.py:459
source_names = "PubMed, Nature, The Lancet, JAMA, BMJ"  # Default for academic_doi
```

```python
# app/core/prompt_templates.py:522-525
return (
    'e.g. "STUDY REVEALS COLD EXPOSURE ACTIVATES BROWN FAT THERMOGENESIS" or '
    '"RESEARCH SHOWS SLEEP DEBT DOUBLES CORTISOL WITHIN 72 HOURS"'
)
```

**Problem:** When `citation_style == "academic_doi"` and no `citation_source_types` are configured, the defaults are medical journals and health-related examples.

**Fix:** Make these defaults truly generic or require them to be set in NicheConfig.

### 6.3 38 Python Files Reference Health/Wellness Terms

Most are in brand-related code, test scripts, or comments. The **prompt system itself is niche-agnostic** (it uses `ctx.niche_name` everywhere). The remaining references are:
- Default brand names/handles in `manager.py`, `resolver.py`
- Example titles in `prompt_templates.py` citation fallbacks
- Test/script files (`validate_api.py`, `populate_niche_config.py`, etc.)
- Health check endpoints (these are system health, not domain health)

### 6.4 Frontend References (8 files)

Mostly in `CreateBrand.tsx` (placeholder/example text), `NicheConfigForm.tsx` (example values), and Toby components (status descriptions). These are cosmetic — the UI itself is niche-agnostic.

---

## 7. Prompt Architecture Assessment

The 3-layer prompt architecture is well-designed:

1. **Layer 1 (Pattern Brain):** Static viral patterns — format definitions, hook types, title archetypes. Not sent to the model.
2. **Layer 2 (Generator Logic):** System prompt (cached), runtime prompt (~500 tokens), correction prompt. Clean separation.
3. **Layer 3 (Runtime Input):** Minimal per-request data from `PromptContext` dataclass.

**Strengths:**
- `PromptContext` is fully niche-agnostic — all domain data comes from `NicheConfig`
- Quality scoring with auto-regeneration loop
- Anti-repetition via content history tracking
- Few-shot examples loaded from user config, not hardcoded

**Issues:**
- `get_content_prompts()` opens a new DB session on **every call** (inside `build_runtime_prompt`). This means every content generation request opens an extra DB connection just to read 3 settings rows.
- `SYSTEM_PROMPT = build_system_prompt()` is evaluated at import time with an empty `PromptContext()`, which means the module-level constant has no niche context. It's only used as a fallback but could confuse developers.
- `BRAND_PALETTES = {}` is defined but never populated (leftover from refactor).

---

## 8. Supabase Usage Assessment

### Currently Using:
- **PostgreSQL** (via SQLAlchemy, direct connection)
- **Auth** (JWT validation in middleware)
- **Storage** (via raw REST API for images/videos)

### NOT Using (Opportunities):

| Feature | Use Case | Impact |
|---------|----------|--------|
| **Row Level Security** | Multi-tenant data isolation | CRITICAL for 100+ clients |
| **Realtime** | Live job progress, publish status, Toby activity | Great UX improvement — replace polling |
| **Edge Functions** | Rate limiting, webhook handlers, image processing | Reduce backend load |
| **Database Webhooks** | Trigger actions on data changes (e.g., auto-publish when status changes) | Replace APScheduler polling |
| **pg_cron** | Scheduled jobs (log cleanup, analytics refresh) | Replace APScheduler for scheduling |
| **Vault** | Encrypt Meta/Instagram tokens at rest | CRITICAL for security |
| **Supabase Auth Hooks** | Custom signup flow, onboarding | Better user creation |
| **Storage Policies** | Per-user file access control | Security + multi-tenant |
| **Database Functions** | Move business logic to DB (e.g., schedule offset calculation) | Reduce app-level race conditions |

### Free Tier Limitations for 100+ Clients:

| Resource | Free Tier | Pro Tier ($25/mo) | Assessment |
|----------|-----------|-------------------|------------|
| Database | 500MB | 8GB | Will hit 500MB with ~20-30 active brands generating content daily |
| Storage | 1GB | 100GB | Will hit 1GB quickly — each reel generates ~5-10MB of images + video |
| Auth Users | 50,000 MAU | 100,000 MAU | Free tier is fine |
| Edge Functions | 500K invocations | 2M invocations | Free tier may be fine depending on usage |
| Realtime | 200 concurrent | 500 concurrent | Free tier likely fine for 100 clients |
| DB Connections | ~60 direct | ~200 with pooler | Need pooler for 100+ clients |

**Verdict:** Pro tier is necessary for 100+ clients. The $25/month is worth it for storage alone, plus you get Vault, more connections, and better performance.

---

## 9. Recommended Refactors (Priority Order)

### P0 — Must-Do Before Scaling

1. **Enable RLS on all tables** with `user_id` policies
2. **Encrypt API credentials** (Supabase Vault on Pro tier, or Fernet encryption)
3. **Add `user_id` to `app_settings`** (or migrate global prompts to NicheConfig)
4. **Fix sync/async mismatch** — use `def` endpoints or switch to async SQLAlchemy
5. **Add rate limiting** (`slowapi` or edge-level)

### P1 — Do Soon After Scaling

6. **Extract publishing logic** from `main.py` into a dedicated service class
7. **Use Supabase connection pooler** (switch to port 6543)
8. **Add pagination** to all list endpoints
9. **Replace APScheduler** with `pg_cron` + database webhooks for auto-publish
10. **Use Supabase Realtime** for job progress and publish status (replace polling)

### P2 — Nice to Have

11. **Remove dead default brand data** (`DEFAULT_BRANDS`, `DEFAULT_BRAND_COLORS`, `BRAND_PALETTES = {}`)
12. **Replace raw HTTP storage calls** with `supabase-py` storage client (already a dependency)
13. **Add Supabase Storage policies** for per-user file isolation
14. **Make citation defaults configurable** (remove health-specific fallback examples)
15. **Cache `get_content_prompts()`** instead of opening a new DB session per call
16. **Add structured logging** (JSON format) instead of `print()` with emoji prefixes
17. **Use Supabase Edge Functions** for lightweight processing (image prompt generation, content rating)

---

## 10. Supabase Pro Tier Feature Opportunities

If you upgrade to Pro tier, here are high-impact features you should adopt:

### Realtime Subscriptions (Replace Polling)
```typescript
// Frontend: Live job progress instead of polling every 2 seconds
supabase
  .channel('job-progress')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'generation_jobs',
    filter: `user_id=eq.${userId}`,
  }, (payload) => {
    updateJobProgress(payload.new);
  })
  .subscribe();
```

### Database Webhooks (Replace APScheduler for Publishing)
Instead of polling every 60 seconds, trigger publishing when a scheduled reel's time arrives using `pg_cron`:
```sql
-- Run every minute: find due posts and call Edge Function
SELECT cron.schedule('auto-publish', '* * * * *', $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/auto-publish',
    body := json_build_object('due_before', now())::text
  )
$$);
```

### Vault (Credential Security)
```sql
-- Store Meta tokens encrypted
SELECT vault.create_secret('meta_token_brand_123', 'EAABsb...');
-- Retrieve in application
SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'meta_token_brand_123';
```

### Edge Functions (Offload Processing)
- Content quality scoring (lightweight, no FFmpeg needed)
- Webhook receivers for Meta API callbacks
- Rate limiting middleware
- Image prompt generation (proxy to DeepSeek with caching)

---

## 11. Summary

**What's working well:**
- Clean 3-layer prompt architecture with `PromptContext` abstraction
- Niche-agnostic design (NicheConfig makes any vertical possible)
- Supabase Auth integration is solid
- Multi-tenant user scoping at the application layer
- Content quality scoring with auto-regeneration
- Graceful error handling with fallbacks

**What needs immediate attention for multi-tenant scale:**
- No RLS (data isolation depends entirely on application code)
- Plaintext credential storage
- Global `app_settings` shared across all users
- Synchronous DB in async endpoints
- No rate limiting
- Monolithic main.py with 800+ lines
- In-process scheduling (APScheduler) won't survive horizontal scaling

**Supabase tier recommendation:** **Upgrade to Pro ($25/month)**. The 1GB storage limit alone will block you with 10+ active brands. Pro also unlocks Vault for credential encryption, connection pooling, and more database space.
