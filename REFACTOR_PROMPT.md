# Comprehensive Refactoring Prompt: Scheduler — Social Content Automation Platform

---

## Part 1: What This Application Is

### The Big Picture

**Scheduler** is a multi-tenant SaaS platform that automates social media content creation and publishing. Think of it as an autonomous content factory: a user creates a "Brand" (any niche — fitness, finance, cooking, tech), and the platform uses AI to generate viral short-form content (Instagram Reels, carousel posts, Facebook posts, YouTube Shorts), renders branded images and videos, and auto-publishes them on a configurable schedule.

### How It Works (End-to-End Flow)

1. **Brand Onboarding:** A user signs up via Supabase Auth, creates a Brand with a niche configuration (target audience, tone, visual style, topics, citation preferences), and connects their Instagram/Facebook/YouTube accounts by providing API tokens.

2. **Content Generation:** When a generation job is triggered (manually or by the autonomous agent "Toby"), the system calls the **DeepSeek AI API** with a carefully layered prompt system to produce titles, body text, image descriptions, and captions tailored to the brand's niche.

3. **Asset Rendering:** Generated content is turned into visual assets:
   - **Reels:** Background images generated via Flux1schnell, then composed with text overlays and rendered into video via FFmpeg.
   - **Carousel posts:** Multiple slides rendered server-side using Node.js + Konva (a canvas library).
   - All assets are uploaded to **Supabase Storage**.

4. **Scheduling & Publishing:** A background scheduler (APScheduler) runs inside the Python backend. Every 60 seconds it checks for posts whose scheduled time has arrived, downloads their assets from Supabase Storage, and publishes them via the Meta Graph API (Instagram/Facebook) or YouTube Data API.

5. **Toby (Autonomous Agent):** An optional autonomous mode where an AI agent named "Toby" runs on 5-minute intervals, analyzes the brand's content buffer, and auto-generates new content to keep a steady pipeline ready for publishing.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite 5 + Tailwind CSS |
| **Client State** | TanStack React Query v5 (server state), React Context (auth) |
| **Routing** | React Router v6 (SPA with auth guards) |
| **Backend** | Python FastAPI |
| **ORM** | SQLAlchemy (synchronous, direct PostgreSQL) |
| **Database** | Supabase PostgreSQL |
| **Auth** | Supabase Auth (JWT tokens, ES256/HS256 validation) |
| **File Storage** | Supabase Storage (via raw REST API calls) |
| **AI Content** | DeepSeek API |
| **Image Gen** | Flux1schnell (reels), ZImageTurbo (posts) |
| **Video Rendering** | FFmpeg (via Python subprocess) |
| **Carousel Rendering** | Node.js + Konva (server-side canvas) |
| **Task Scheduling** | APScheduler (BackgroundScheduler, in-process) |
| **Social APIs** | Meta Graph API (Instagram/Facebook), YouTube Data API |
| **Realtime** | Supabase Postgres Changes (frontend subscribes for live updates) |
| **Deployment** | Railway |

### Code Structure

```
scheduler/
├── app/                          # Python backend (FastAPI)
│   ├── main.py                   # App entry, startup, scheduler init (~800 lines)
│   ├── db_connection.py          # SQLAlchemy engine, session factory, migrations
│   ├── models/                   # SQLAlchemy models
│   │   ├── brands.py             # Brand model (credentials, colors, config)
│   │   ├── generation_job.py     # Content generation jobs
│   │   ├── scheduled_reel.py     # Scheduled posts awaiting publish
│   │   ├── niche_config.py       # Per-brand niche configuration
│   │   └── app_settings.py       # Global application settings
│   ├── api/                      # Route handlers (brands, jobs, auth, etc.)
│   ├── services/
│   │   ├── content/              # AI content generation + job processing
│   │   │   ├── generator.py      # ContentGeneratorV2 (DeepSeek prompting)
│   │   │   └── job_processor.py  # Image/video/carousel pipeline
│   │   ├── publishing/           # Auto-publish scheduler
│   │   │   └── scheduler.py      # DatabaseSchedulerService
│   │   ├── brands/               # Brand CRUD, resolver, cache
│   │   │   ├── manager.py        # BrandManager (with hardcoded defaults)
│   │   │   └── resolver.py       # BrandResolver (in-memory cache, 60s TTL)
│   │   ├── toby/                 # Autonomous agent
│   │   │   └── orchestrator.py   # TobyOrchestrator
│   │   └── logging/              # Custom logging service
│   └── core/
│       ├── prompt_templates.py   # 3-layer prompt system (700+ lines)
│       └── auth.py               # JWT validation middleware
├── src/                          # React frontend
│   ├── app/                      # Layout, providers, routes
│   ├── features/                 # Feature modules (auth, jobs, brands, scheduling, toby...)
│   ├── pages/                    # Page components
│   └── shared/                   # API client, Supabase client, hooks, UI components
├── vite.config.ts                # Vite config (dev proxy to Railway backend)
├── tailwind.config.js            # Tailwind config (custom brand colors)
└── package.json                  # Frontend dependencies
```

### The Prompt Architecture (Worth Preserving)

The AI content generation uses a well-designed 3-layer prompt system:

- **Layer 1 (Pattern Brain):** A static library of viral content patterns — hook types, title archetypes, formatting rules. This is reference data, not sent to the AI model directly.
- **Layer 2 (Generator Logic):** The system prompt (cacheable), a concise runtime prompt (~500 tokens), and a correction prompt for quality control. Clean separation of concerns.
- **Layer 3 (Runtime Input):** A `PromptContext` dataclass that carries only per-request data (brand name, niche, audience, topics, few-shot examples). Fully niche-agnostic — all domain-specific data comes from the `NicheConfig` database model.

This architecture is **good** and should be preserved. The issues are elsewhere.

---

## Part 2: What Is Wrong

The application works for a single user or a small handful of brands. But it has **critical architectural and security issues** that will break it — or worse, expose user data — as it grows to 100+ clients. Here are the problems, categorized by severity.

---

### CRITICAL Issues (Must Fix Before Multi-Tenant Use)

#### 1. API Credentials Stored in Plaintext

**Where:** `app/models/brands.py`, lines 49-53

```python
instagram_access_token = Column(Text, nullable=True)
facebook_access_token = Column(Text, nullable=True)
meta_access_token = Column(Text, nullable=True)
```

**What's wrong:** Meta API access tokens — which grant full control over a user's Instagram and Facebook accounts — are stored as plaintext strings in PostgreSQL. Anyone with database read access (a developer, a compromised backup, a SQL injection vulnerability) immediately gets every user's social media tokens. This is a textbook credential exposure vulnerability.

**Why this matters:** Meta access tokens allow posting, deleting, and reading data from a user's business accounts. A leak exposes every connected client's social media presence to unauthorized control.

#### 2. No Row Level Security (RLS) on Any Table

**Where:** The entire Supabase PostgreSQL database — `brands`, `generation_jobs`, `scheduled_reels`, `niche_config`, `app_settings`, `log_entries`.

**What's wrong:** Multi-tenant data isolation relies **entirely** on application code remembering to add `WHERE user_id = :uid` to every query. There are no database-level RLS policies enforcing this. If a single code path in any service, endpoint, or background job forgets to filter by `user_id`, one user's data leaks to another. The `BrandResolver` singleton already falls back to `user_id=None` in several code paths (startup, scheduler, Toby), which means the publishing scheduler and Toby agent currently operate without tenant isolation.

**Why this matters:** This is the most fundamental security requirement for any multi-tenant SaaS. Without RLS, you are one bug away from a data breach affecting all clients simultaneously.

#### 3. `app_settings` Is Global (Not Per-User)

**Where:** `app/core/prompt_templates.py`, line 28

```python
def get_content_prompts() -> Dict[str, str]:
    rows = db.query(AppSettings.key, AppSettings.value)
        .filter(AppSettings.key.in_(['posts_prompt', 'reels_prompt', 'brand_description']))
```

**What's wrong:** The content generation prompts (`reels_prompt`, `posts_prompt`, `brand_description`) are loaded from a **global** `app_settings` table with no `user_id` column. Every user in the system shares the same prompts. When client A customizes their reels prompt, it changes for client B too.

**Why this matters:** Content generation is the core value proposition. If users can't have their own prompt configurations, they can't differentiate their content. Worse, one user's changes silently affect everyone else.

#### 4. Monolithic `main.py` (~800+ Lines)

**Where:** `app/main.py`

**What's wrong:** The entire auto-publishing pipeline (`check_and_publish`) is a ~300-line function defined **inside** the `startup_event()` function. This function downloads images from Supabase Storage, renders carousel slides by calling a Node.js subprocess, publishes to Instagram/Facebook/YouTube, and handles partial retries and error recovery. Because it's nested inside `startup_event`, it:
- **Cannot be unit tested** without starting the entire application
- **Is a single point of failure** — if the publishing function crashes, the entire APScheduler stops, and no more posts go out until the server restarts
- **Has no retry with backoff** on Meta API rate limits (429 responses)
- **Uses blocking I/O** inside the scheduler thread, which can freeze the scheduler for other brands while one brand's publish is in progress

---

### HIGH Severity Issues (Will Break Under Load)

#### 5. Synchronous Database in Async Endpoints

**Where:** Every `async def` route handler that calls SQLAlchemy.

```python
async def list_brands(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    brands = manager.get_all_brands(user_id=user["id"])  # Blocking call!
```

**What's wrong:** FastAPI endpoints are declared `async def`, but all database calls go through synchronous SQLAlchemy. When you `await` nothing and call a blocking function inside `async def`, **it blocks the entire asyncio event loop**. Under load (100+ concurrent users), this means one slow database query freezes every other request in the process.

**Why this matters:** This is the #1 performance killer for FastAPI at scale. With 5 users you won't notice. With 100 concurrent users making API calls while content generation is running, you'll see request timeouts and cascading failures.

#### 6. No Rate Limiting

**Where:** No rate limiting middleware exists anywhere in the application.

**What's wrong:** Any authenticated user can call `/reels/content/generate` as fast as they want. Each call triggers a DeepSeek API request (billed per token) and potentially image generation. A single misbehaving client — or a script someone writes — can exhaust your entire AI API budget in minutes.

**Why this matters:** AI API costs are the primary operational expense. Without rate limiting, you have no protection against accidental or intentional abuse.

#### 7. Unbounded Thread-Based Job Processing

**Where:** `app/main.py`, line ~371

```python
t = threading.Thread(target=_resume_jobs, args=(resume_ids,), daemon=True)
t.start()
```

**What's wrong:** Content generation jobs are processed in unbounded Python threads. There is no thread pool, no queue, and no backpressure mechanism. If 100 users each trigger content generation simultaneously, the system spawns 100 threads — each calling DeepSeek API, image generation APIs, and FFmpeg concurrently. This will overwhelm both the server (CPU/memory) and the external APIs (rate limits).

---

### MEDIUM Severity Issues (Scaling Bottlenecks)

#### 8. Database Connection Pool Too Small

**Where:** `app/db_connection.py`

```python
engine = create_engine(DATABASE_URL, pool_size=5, max_overflow=10)
```

With a max of 15 connections and 100 concurrent users plus background jobs, database connections will be exhausted quickly, causing requests to queue and timeout.

#### 9. In-Memory Brand Cache Won't Survive Horizontal Scaling

**Where:** `app/services/brands/resolver.py`

The `BrandResolver` singleton caches brands per-user in a Python dict with a 60-second TTL. If you deploy 2+ backend instances (which you'll need for 100+ clients), each instance has its own cache. Brand updates on instance A won't be reflected on instance B until the cache expires.

#### 10. APScheduler Is Single-Instance

**Where:** `app/main.py` (scheduler initialization at startup)

`BackgroundScheduler` runs in-process. If you deploy 2 instances for load balancing, both instances run the scheduler, causing **every post to be published twice** — once by each instance.

#### 11. No Pagination on List Endpoints

Multiple endpoints return all records without pagination:
```python
brands = query.order_by(Brand.display_name).all()
```
Fine for 5 brands; catastrophic for thousands of jobs across 100+ clients.

---

### LOW Severity Issues (Code Quality / Cleanup)

#### 12. Hardcoded Health/Wellness References

The app was originally built for health/wellness brands. Remnants remain:

- `app/services/brands/manager.py`: `DEFAULT_BRANDS` dict with "healthycollege", "longevitycollege", etc. (seeding is disabled, so this is dead code)
- `app/core/prompt_templates.py`: Citation fallbacks reference "PubMed, Nature, The Lancet, JAMA, BMJ" and example titles like "STUDY REVEALS COLD EXPOSURE ACTIVATES BROWN FAT THERMOGENESIS"
- `tailwind.config.js`: Hardcoded brand colors (`brand.healthy`, `brand.vitality`, `brand.longevity`, `brand.gym`)
- Frontend placeholders in `CreateBrand.tsx` and `NicheConfigForm.tsx` with health-specific examples

None of this affects functionality (the prompt system is niche-agnostic via `NicheConfig`), but it confuses developers and looks unprofessional if a non-health client sees these examples.

#### 13. Prompt System Opens Extra DB Connections

`get_content_prompts()` in `prompt_templates.py` opens a new database session **every time it's called** (inside `build_runtime_prompt`). Every content generation request opens an extra DB connection just to read 3 settings rows that rarely change.

#### 14. Dead Code and Leftovers

- `BRAND_PALETTES = {}` defined but never populated
- `SYSTEM_PROMPT` evaluated at import time with an empty `PromptContext()` (no niche data)
- `DEFAULT_BRAND_COLORS` dict in the brand manager (unused since seeding is disabled)

---

## Part 3: How to Fix It

### Priority 0 — Must-Do Before Scaling to Multiple Clients

#### Fix 1: Encrypt API Credentials

**Approach:** Use application-level encryption with `cryptography.fernet`. Store an encryption key in an environment variable (`CREDENTIAL_ENCRYPTION_KEY`). Encrypt tokens before writing to the database; decrypt when reading.

**Why this works:** Even if the database is compromised (backup leak, SQL injection, unauthorized access), the attacker gets ciphertext, not usable tokens. The encryption key lives in the environment (Railway secrets), separate from the data.

**Implementation sketch:**
```python
from cryptography.fernet import Fernet

FERNET_KEY = os.environ["CREDENTIAL_ENCRYPTION_KEY"]
cipher = Fernet(FERNET_KEY)

# On write:
brand.instagram_access_token = cipher.encrypt(raw_token.encode()).decode()

# On read:
raw_token = cipher.decrypt(brand.instagram_access_token.encode()).decode()
```

Add a one-time migration script to encrypt existing plaintext tokens. If/when you upgrade to Supabase Pro, migrate to Supabase Vault for even stronger security (encryption at the database layer with automatic key rotation).

#### Fix 2: Enable Row Level Security

**Approach:** Add RLS policies to every table that contains user data. Each policy enforces `user_id = auth.uid()::text`.

**Why this works:** RLS is enforced at the PostgreSQL level. Even if application code forgets to filter by `user_id`, the database itself refuses to return another user's rows. This is defense-in-depth — application-level filtering is the first line, RLS is the second.

```sql
-- For each table:
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON brands
  FOR ALL USING (user_id = auth.uid()::text);

-- Repeat for: generation_jobs, scheduled_reels, niche_config, log_entries
-- For app_settings, add user_id column first, then apply RLS
```

**Important:** The backend uses a service-role connection (bypasses RLS). The protection is primarily for: (a) preventing bugs in application code from leaking data, (b) securing direct Supabase client access from the frontend, (c) defense against SQL injection.

#### Fix 3: Make `app_settings` Per-User

**Approach:** Add a `user_id` column to the `app_settings` table. Update `get_content_prompts()` to accept a `user_id` parameter. Fall back to global defaults (where `user_id IS NULL`) if a user hasn't customized their prompts.

**Why this works:** Each user gets their own prompt configuration. The global row serves as a default template. This is backward-compatible — existing settings become the defaults, and users can override them per-account.

**Alternative approach (cleaner):** Move `posts_prompt`, `reels_prompt`, and `brand_description` into the existing `NicheConfig` model, which already has per-user, per-brand scoping. This eliminates the need for `app_settings` entirely for content-related configuration.

#### Fix 4: Fix the Sync/Async Mismatch

**Approach (simplest):** Change all route handlers that call synchronous SQLAlchemy from `async def` to `def`. FastAPI automatically runs `def` endpoints in a thread pool, preventing them from blocking the event loop.

**Why this works:** FastAPI has built-in support for this. A `def` endpoint runs in a `ThreadPoolExecutor`, so blocking DB calls don't freeze other requests. This is a one-word change per endpoint (`async def` → `def`) with massive impact on concurrency.

**Alternative (more work, better long-term):** Migrate to `sqlalchemy[asyncio]` with `asyncpg` driver. This gives true non-blocking database access but requires rewriting all queries to use `await session.execute(...)`.

#### Fix 5: Add Rate Limiting

**Approach:** Add `slowapi` middleware with per-user rate limits on expensive endpoints.

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.post("/reels/content/generate")
@limiter.limit("10/minute")
async def generate_content(...):
    ...
```

**Why this works:** `slowapi` is a battle-tested FastAPI rate limiting library. It uses in-memory storage by default (fine for single instance) and can be configured with Redis for multi-instance deployments. This protects your AI API budget from abuse.

---

### Priority 1 — Do Soon After Scaling

#### Fix 6: Extract Publishing Logic from `main.py`

**Approach:** Move `check_and_publish` and all related publishing logic into `app/services/publishing/publisher.py` as a proper class (`PublishingService`). The class should:
- Be independently testable
- Have try/catch with retry+backoff per-brand (one brand's failure doesn't stop others)
- Use async I/O for downloads and API calls
- Log structured events for observability

**Why this works:** The publishing pipeline is the most critical background process. By extracting it into a service class, you can unit test it, add proper error handling per brand, and eventually replace APScheduler with a more robust distributed system.

#### Fix 7: Use Supabase Connection Pooler

**Approach:** Change the database URL to use Supabase's PgBouncer pooler (port 6543 instead of 5432). Increase `pool_size` to 10-20.

**Why this works:** Supabase's connection pooler multiplexes many application connections over fewer database connections. This is essential when you have 100+ users plus background jobs competing for connections.

#### Fix 8: Add Pagination to List Endpoints

**Approach:** Add `page` and `page_size` query parameters to all list endpoints. Default to `page_size=50`. Return total count in response headers or body.

**Why this works:** Without pagination, listing all jobs for 100 clients returns thousands of rows per request. With pagination, each request returns a bounded set, keeping response times predictable.

#### Fix 9: Bound the Thread Pool for Job Processing

**Approach:** Replace unbounded `threading.Thread` spawning with a `concurrent.futures.ThreadPoolExecutor(max_workers=5)`.

**Why this works:** This puts a hard cap on concurrent job processing. If 100 users all trigger generation at once, 5 run immediately and the rest queue up. This prevents resource exhaustion and protects external APIs from rate limiting.

---

### Priority 2 — Nice to Have (Polish & Future-Proofing)

#### Fix 10: Remove Hardcoded Health/Wellness References

Remove `DEFAULT_BRANDS`, `DEFAULT_BRAND_COLORS` from `manager.py` (seeding is disabled anyway). Replace citation fallback examples in `prompt_templates.py` with generic ones. Remove hardcoded brand colors from `tailwind.config.js`. Update frontend placeholder text to be niche-neutral.

#### Fix 11: Cache `get_content_prompts()`

Add a simple TTL cache (e.g., `@lru_cache` with a 60-second expiry) so that the same 3 settings rows aren't fetched from the database on every single content generation call.

#### Fix 12: Clean Up Dead Code

Remove `BRAND_PALETTES = {}`, fix the module-level `SYSTEM_PROMPT` evaluation, and remove any other remnants of the pre-refactor codebase.

---

## Part 4: Why These Fixes Matter

### The Security Argument

Issues #1 (plaintext credentials) and #2 (no RLS) are not theoretical risks — they are **active vulnerabilities**. If you onboard 100 clients and any one of the following happens, you have a breach:

- A developer accidentally logs a database query that includes tokens
- A database backup is stored in an insufficiently secured location
- A SQL injection is found in any endpoint (even read-only)
- A bug in any service forgets the `user_id` filter
- The Supabase dashboard is accessed by an unauthorized team member

With RLS and encryption, these scenarios go from "full breach" to "non-event." That's the difference between losing every client's Instagram account and a contained incident.

### The Scalability Argument

The sync/async mismatch (#5) and unbounded threading (#7) create a ceiling. Right now, the app works because you have few concurrent users. At 100 clients:

- 100 users hit the API simultaneously → async event loop blocks → requests timeout → users see errors
- 50 users trigger content generation → 50 threads spawn → server runs out of memory or DeepSeek rate-limits you → jobs fail silently
- APScheduler tries to publish for 100 brands → publishes are slow (Meta API is not instant) → scheduler falls behind → posts go out late

The fixes (thread pool, `def` endpoints, rate limiting) are all small changes that remove hard ceilings on concurrency.

### The Multi-Tenancy Argument

Issue #3 (global `app_settings`) is a design flaw that becomes a product flaw at scale. The whole value of this platform is that each brand gets unique, AI-generated content. If every user shares the same prompts, the content isn't truly customized. Making prompts per-user isn't just a technical fix — it's a **product requirement** for a multi-tenant SaaS.

### The Operational Argument

The monolithic `main.py` (#4) and in-process scheduler (#10) mean:

- You **cannot deploy more than one instance** without double-publishing
- You **cannot update the publishing logic** without restarting the entire backend
- You **cannot debug publishing failures** without reading through an 800-line file
- You **cannot test the publishing pipeline** without starting the full application

Extracting the publishing service is not refactoring for aesthetics — it's the prerequisite for horizontal scaling, zero-downtime deploys, and production observability.

### The Cost Argument

Without rate limiting (#6), your AI API costs are unbounded. DeepSeek charges per token. Image generation APIs charge per image. A single user writing a script that calls your generate endpoint in a loop could cost you hundreds of dollars in minutes. Rate limiting is the simplest form of cost control.

---

## Summary: Minimum Viable Fixes for 100-Client Scale

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | Encrypt credentials (Fernet) | 1-2 days | Eliminates credential exposure risk |
| 2 | Enable RLS on all tables | 1 day | Eliminates cross-tenant data leaks |
| 3 | Make `app_settings` per-user | Half day | Enables per-client prompt customization |
| 4 | `async def` → `def` on endpoints | 1 hour | Removes concurrency ceiling |
| 5 | Add `slowapi` rate limiting | Half day | Protects AI API budget |
| 6 | `ThreadPoolExecutor(max_workers=5)` | 1 hour | Prevents resource exhaustion |
| 7 | Extract publishing service | 2-3 days | Enables testing, debugging, horizontal scaling |
| 8 | Add pagination | 1 day | Prevents slow queries at scale |

**Total estimated effort: ~7-10 days of focused work to make this production-ready for 100+ clients.**

The application's core architecture — the prompt system, the content pipeline, the Supabase integration — is solid. The issues are all in the operational/security layer, and every fix proposed above is incremental (no rewrites needed). The app is closer to production-ready than it might seem from this list; it just needs the guardrails that any multi-tenant SaaS requires before onboarding real clients.
