# CLAUDE.md — Healveth Autonomous Content Engine
 
This file documents the codebase structure, development workflows, and conventions for AI assistants working in this repository.
 
---
 
## Project Overview
 
An autonomous content engine that observes, creates, and publishes short-form video content across Instagram, Facebook, and YouTube — for multiple health & wellness brands simultaneously, with zero human input per post.
 
**Core concept:** A 10-stage pipeline (pattern → prompt → generate → score → deduplicate → differentiate → render → produce → caption → publish) driven by an autonomous AI agent called **Toby**.
 
---
 
## Tech Stack
 
| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy, APScheduler |
| Frontend | React 18, TypeScript, Vite, TailwindCSS, TanStack Query |
| Database | PostgreSQL via Supabase |
| AI | DeepSeek (content), OpenAI-compatible API |
| Media | Pillow (images), FFmpeg/MoviePy (video) |
| Auth | Supabase Auth + Meta OAuth + YouTube OAuth |
| Deployment | Docker + Railway |
 
---
 
## Directory Structure
 
```
scheduler/
├── app/                        # Python backend (FastAPI)
│   ├── main.py                 # App entrypoint: routers, middleware, APScheduler
│   ├── db_connection.py        # SessionLocal + DB engine setup
│   ├── api/                    # Route handlers — one file per domain
│   │   ├── routes.py           # Aggregator: includes all sub-routers under /reels
│   │   ├── schemas.py          # Shared Pydantic schemas
│   │   ├── analytics/          # Analytics endpoints
│   │   ├── auth/               # User auth, IG OAuth, FB OAuth routes
│   │   ├── brands/             # Brand management + connection tests
│   │   ├── content/            # Reels, schedules, publish, jobs, prompts, feedback
│   │   ├── system/             # Health, logs, settings, admin, legal
│   │   ├── toby/               # Toby agent control endpoints
│   │   ├── youtube/            # YouTube-specific endpoints
│   │   └── niche_config_routes.py
│   ├── core/                   # Shared logic (no DB access)
│   │   ├── config.py           # BrandConfig dataclass + get_brand_config()
│   │   ├── constants.py        # Image/video dimensions, font sizes, spacing
│   │   ├── brand_colors.py     # Color helpers (hex_to_rgb, hex_to_rgba)
│   │   ├── quality_scorer.py   # 5-dimension content quality gate
│   │   ├── prompt_context.py   # NicheConfig → prompt context builder
│   │   ├── prompt_templates.py # Reusable AI prompt templates
│   │   ├── viral_patterns.py   # 59 trained viral archetypes
│   │   └── cta.py              # Call-to-action variations
│   ├── models/                 # SQLAlchemy ORM models (one file per domain)
│   │   ├── base.py             # declarative_base() — import from here
│   │   ├── brands.py, jobs.py, scheduling.py, analytics.py
│   │   ├── toby.py             # TobyState, TobyActivityLog, TobyContentTag
│   │   ├── toby_cognitive.py   # Cognitive memory models
│   │   ├── auth.py, config.py, logs.py, niche_config.py, youtube.py
│   └── services/               # Business logic (domain-organized)
│       ├── brands/             # Brand resolution and config loading
│       ├── content/            # generator, differentiator, job_manager, job_processor, tracker
│       ├── publishing/         # scheduler, social_publisher, fb_token, ig_token
│       ├── toby/               # Autonomous Toby agent
│       │   ├── orchestrator.py # Main tick loop (runs every 5 min via APScheduler)
│       │   ├── agents/         # analyst, creator, critic, scout, strategist, publisher, etc.
│       │   └── memory/         # episodic, semantic, procedural, world_model, embeddings
│       ├── analytics/, logging/, media/, storage/, youtube/
├── src/                        # React 18 frontend (TypeScript)
│   ├── main.tsx                # App entrypoint
│   ├── app/                    # Router, layout, providers
│   ├── features/               # Domain-organized feature modules
│   │   ├── analytics/, auth/, brands/, jobs/, onboarding/
│   │   ├── scheduling/, settings/, toby/
│   ├── pages/                  # Top-level page components (one per route)
│   └── shared/                 # Cross-feature utilities
│       ├── api/                # client.ts, supabase.ts, use-layout-settings.ts
│       ├── components/         # Reusable UI (Modal, Skeleton, StatusBadge, PostCanvas…)
│       ├── hooks/, lib/, types/
├── assets/                     # Static assets (fonts, icons, logos, music)
├── migrations/                 # SQL migration scripts (run manually)
├── scripts/                    # Utility and maintenance scripts
│   └── validate_api.py         # CRITICAL: API validation (see below)
├── docs/                       # Toby agent architecture documentation
├── Dockerfile                  # Multi-stage build (Python + Node.js)
├── railway.json                # Railway deployment config
├── requirements.txt            # Python dependencies
├── package.json                # Node/npm dependencies
├── vite.config.ts              # Vite dev server + API proxy config
└── tailwind.config.js
```
 
---
 
## API Route Prefixes
 
The FastAPI app (`app/main.py`) mounts these router prefixes:
 
| Prefix | Domain |
|---|---|
| `/reels` | Core content (reels, schedules, publish, feedback, status, user) |
| `/api/jobs` | Job management |
| `/api/youtube` | YouTube publishing |
| `/api/brands` | Brand management + OAuth connection tests |
| `/api/analytics` | Analytics data |
| `/api/system` | Settings, logs, admin, health, legal |
| `/api/auth` | User auth, Instagram OAuth, Facebook OAuth |
| `/api/toby` | Toby agent control |
| `/api/niche-config` | Per-brand niche configuration |
| `/api/prompts` | Prompt management |
| `/api/ig-oauth`, `/api/fb-oauth` | OAuth callback endpoints |
 
The frontend dev server proxies `/api`, `/reels`, `/health`, `/logs`, `/output`, `/docs`, `/jobs` to the production Railway backend.
 
---
 
## CRITICAL: Validation Before Committing
 
After any change to API routes, models, services, or imports, run:
 
```bash
# Fast check — validates all module imports (no server needed)
python scripts/validate_api.py --imports
 
# Full check — imports + endpoint smoke tests + NicheConfig alignment
python scripts/validate_api.py
```
 
The script must exit with code 0 before committing. Keep `scripts/validate_api.py` up to date:
- Add new route files to `CRITICAL_MODULES`
- Add new endpoints to the appropriate test section
- Adjust auth requirements when endpoints change
 
---
 
## Development Workflows
 
### Frontend Development
 
```bash
npm run dev      # Vite dev server at localhost:5173 (proxies API to production Railway)
npm run build    # TypeScript check + Vite production build → dist/
npm run lint     # ESLint — must have 0 errors (rules-of-hooks) before commit
npm run preview  # Preview production build locally
```
 
### Backend Development
 
No local backend server setup — the Vite dev proxy forwards all API calls to the live Railway production backend. To test backend changes, deploy to Railway.
 
```bash
# Validate imports before pushing backend changes
python scripts/validate_api.py --imports
 
# Run a specific utility/migration script
python scripts/<script_name>.py
```
 
### Deployment
 
Deployment is fully automated via Railway on push to `master`:
1. Docker builds with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build args (Vite bakes them into the frontend at build time)
2. Python dependencies installed, then `npm run build` runs
3. `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}` starts the server
4. Railway restarts on failure (max 5 retries)
 
---
 
## Environment Variables
 
These must be set in Railway (never committed to git):
 
```bash
# Supabase
SUPABASE_URL=
SUPABASE_KEY=              # Anon/publishable key
SUPABASE_SERVICE_KEY=      # Service role key (backend only — never exposed to frontend)
 
# Frontend (baked into build — also set as Railway build args)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
 
# AI Services
DEEPSEEK_API_KEY=          # Content generation (OpenAI-compatible)
DEAPI_KEY=                 # AI background image generation
 
# Social Platforms
META_APP_ID=               # Facebook/Instagram OAuth app
META_APP_SECRET=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
 
# Runtime
PORT=8000                  # Set automatically by Railway
```
 
---
 
## Key Conventions
 
### Python Backend
 
- **SQLAlchemy models** — all inherit from `app.models.base.Base` (declarative_base)
- **DB sessions** — use `app.db_connection.SessionLocal`; always close in `finally` blocks
- **Route organization** — one router file per domain; aggregate in `app/api/routes.py` or mount directly in `main.py`
- **Brand config** — load via `app.core.config.get_brand_config(brand_id)`; returns `BrandConfig` dataclass; always falls back to neutral defaults
- **Constants** — image dimensions, font sizes, video settings all live in `app/core/constants.py`; do not hardcode these values elsewhere
- **Quality gate** — content must score ≥ 80 to publish; 65–79 triggers regeneration; < 65 is rejected
- **Toby rate limits** — MAX 2 pieces/brand/hour (steady-state), 6 pieces/user/hour; respect bootstrap vs. normal limits in `orchestrator.py`
- **Error logging** — Toby uses debounced error logging (30-minute cooldown per action) to suppress log spam
 
### Frontend (React/TypeScript)
 
- **Path alias** — `@/` resolves to `./src/` (configured in `vite.config.ts` and `tsconfig.json`)
- **Feature-first** — organize new code under `src/features/<domain>/` with `api/`, `components/`, `hooks/`, `types/` subdirectories; export through `index.ts`
- **Server state** — TanStack Query (`@tanstack/react-query`) for all API calls
- **Auth** — Supabase Auth via `src/shared/api/supabase.ts`
- **API client** — use `src/shared/api/client.ts` for all backend requests
- **Routing** — React Router v6 (`react-router-dom`)
- **Styling** — TailwindCSS utility classes; no CSS modules
- **Animations** — Framer Motion for transitions
- **Canvas rendering** — Konva / react-konva for the in-browser post canvas preview
 
### Content Pipeline
 
The 10-stage pipeline runs inside `app/services/content/`:
1. `viral_patterns.py` — pattern selection (archetype + topic + format)
2. `prompt_templates.py` — prompt construction (< 500 tokens, cached context)
3. `generator.py` — AI generation via DeepSeek
4. `quality_scorer.py` — 5-dimension scoring gate
5. `tracker.py` — fingerprint + cooldown deduplication (3-day per brand)
6. `differentiator.py` — brand variation generation (1 piece → N unique versions)
7. Media services — Pillow renders 1080×1920 branded frames
8. Video services — FFmpeg/MoviePy produces MP4 with background music
9. Caption services — AI paragraph + CTA + hashtags
10. `publishing/social_publisher.py` — Meta Graph API + YouTube Data API
 
### Toby Agent
 
Toby runs every 5 minutes via APScheduler (`toby_tick()` in `orchestrator.py`).
 
Decision priority per tick:
1. **Buffer check** — fill any empty scheduling slots for the next 2 days
2. **Metrics check** — score posts > 48h old that lack a Toby score
3. **Analysis check** — update strategy scores from new metrics
4. **Discovery check** — TrendScout scan (every 4h)
5. **Phase check** — advance to next content phase if criteria met
 
Agents in `app/services/toby/agents/`: `analyst`, `creator`, `critic`, `experiment_designer`, `intelligence`, `meta_learner`, `pattern_analyzer`, `publisher`, `reflector`, `scout`, `strategist`
 
Memory subsystem in `app/services/toby/memory/`: `episodic`, `semantic`, `procedural`, `world_model`, `embeddings`, `gardener`
 
---
 
## Database Migrations
 
Database migrations are manual SQL scripts in `migrations/` or one-off Python scripts in `scripts/`. There is no Alembic auto-migration workflow — apply migrations directly to the Supabase project dashboard or via psql. Check `migrations/` and `scripts/` for naming patterns before adding new migration scripts.
 
---
 
## Asset Conventions
 
```
assets/
├── fonts/          # Poppins-Bold.ttf, Inter/ — referenced by constants.py
├── icons/          # Platform icons
├── logos/          # Per-brand logo files (referenced by BrandConfig.logo_filename)
└── music/          # Background music tracks (referenced by DEFAULT_MUSIC_ID)
```
 
The `output/` directory (generated video/image files) is gitignored — never commit it.
 
---
 
## Git Workflow
 
```bash
git add <specific-files>   # Stage specific files (avoid git add -A)
git commit -m "<message>"
git push -u origin <branch>
```
 
- Never commit `.env`, `output/`, `*.log`, `ed25519_key`, `youtube_quota.json`
- Run `python scripts/validate_api.py --imports` before any commit touching `app/` (also checks React hooks)
- Run `npm run lint` before any commit touching `src/` — 0 errors required
- **NEVER place React hooks after an early return** — this causes React error #310 in production. The validate script and ESLint both catch this.
- Commit messages use conventional format: `feat:`, `fix:`, `refactor:`, `UX:`, `UI:`