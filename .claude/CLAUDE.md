# ViralToby — Project Instructions

## What Is This?

**ViralToby** (`viraltoby.com`) is a multi-tenant SaaS platform for social media content scheduling and publishing across Instagram, Facebook, YouTube, Threads, and TikTok. Its core feature is **Toby** — an autonomous AI agent that generates, scores, and publishes content based on each brand's Content DNA.

## Tech Stack

- **Backend**: Python 3.11+ / FastAPI / SQLAlchemy / PostgreSQL
- **Frontend**: React 18 / TypeScript / Vite / Tailwind CSS / TanStack React Query
- **Auth**: Supabase (JWT-based)
- **AI**: DeepSeek via OpenAI-compatible client
- **Media**: Pillow (images), FFmpeg/MoviePy (video)
- **Infra**: Railway (production), Supabase (auth + storage + realtime)

## Build & Run Commands

```bash
# Frontend
npm run dev            # Start dev server
npm run build          # tsc && vite build
npm run lint           # ESLint

# Backend
uvicorn app.main:app   # Start API server
python -m pytest       # Run tests

# Validation (run before committing)
python scripts/validate_api.py --imports   # Quick: import + hooks check
python scripts/validate_api.py             # Full: routes, auth, schemas
npx eslint src/ --rule 'react-hooks/rules-of-hooks: error'  # Hooks check

# Database migrations
psql "$DATABASE_URL" -f migrations/{file}.sql   # Run migration

# Railway CLI (production)
railway variables          # List env vars
railway variables set K=V  # Set env var (triggers redeploy)
railway logs               # View logs
railway redeploy           # Redeploy service
```

## 100% Dynamic Architecture — MANDATORY

> **All user-facing data MUST be loaded dynamically from the database or API. Zero exceptions.**

- Brand count, names, colors, platform connections, Content DNA — all from DB
- Frontend source of truth: `useDynamicBrands()` hook
- Backend source of truth: `Brand` model, `get_brand_config()`, `NicheConfig` model
- **NEVER** hardcode brand names, IDs, color arrays, or platform lists for brands
- Static constants OK for: platform identity colors, UI layout, system defaults (quality threshold 80, tick interval 5min)

## Critical Rules

### React Hooks (CRASH RISK)
All hooks (`useState`, `useEffect`, `useQuery`, custom `use*`) MUST be called BEFORE any early return. Violation causes React error #310 — crashes the entire page in production.

### Migration-First Database Changes
Write and run migration SQL via `psql "$DATABASE_URL"` BEFORE adding model columns in Python. Missing columns cause 500 errors. See `/database-migrations` skill.

### API Validation
After any route/import/model/service change: `python scripts/validate_api.py --imports`. Exit code must be 0. See `/api-validation` skill.

### Legal Page Sync
When adding/removing a social platform, update all three pages:
- `src/pages/Terms.tsx`, `src/pages/PrivacyPolicy.tsx`, `src/pages/DataDeletion.tsx`

## Key Source Locations

### Backend
- Entry point: `app/main.py`
- API routes: `app/api/{domain}/routes.py`
- Models: `app/models/`
- Services: `app/services/{domain}/`
- Toby agent: `app/services/toby/orchestrator.py` (5-min tick loop)
- Toby agents: `app/services/toby/agents/` (analyst, creator, critic, scout, strategist, publisher)
- Toby memory: `app/services/toby/memory/` (episodic, semantic, procedural, world_model)
- Content DNA: `app/core/prompt_context.py`, `app/models/niche_config.py`
- Brand config: `app/core/config.py` (`BrandConfig` dataclass)
- Viral patterns: `app/core/viral_patterns.py` (59 archetypes)

### Frontend
- Entry: `src/main.tsx` → `src/app/providers/` → `src/app/routes/`
- Pages: `src/pages/`
- Features: `src/features/{domain}/` (api/, hooks/, components/, types/)
- Shared: `src/shared/` (api/, components/, constants/, hooks/, types/)
- Layout: `src/app/layout/AppLayout.tsx`
- Auth: `src/features/auth/AuthContext.tsx`
- Brands: `src/features/brands/hooks/use-dynamic-brands.ts`

### Scripts
- `scripts/validate_api.py` — Import + route validation
- `scripts/reviewer_guardrails.py` — Pre-push guardrails
- `scripts/validate_customization_drift.py` — Code-docs drift detection

## QA Enforcement

| Layer | Trigger | What it checks |
|---|---|---|
| Post-edit hook | After every edit | Python syntax, React hooks lint |
| Pre-commit hook | `git commit` | TS build, ESLint, API imports |
| CI pipeline | `git push` / PR | Full validation, drift, guardrails |

## Git Workflow

1. Stage changes: `git add -A`
2. Commit: `git commit -m "descriptive message"`
3. Push: `git push`

## Railway CLI

Railway CLI is installed and authenticated. **Execute commands directly — never ask the user to run them manually.** Service: `scheduler` in project `responsible-mindfulness` (production). Setting a variable triggers auto-redeploy.

## Self-Healing Documentation Pipeline

**At the START of every prompt**: Check if any available skill matches the user's request. If a skill applies, invoke it automatically — don't wait for the user to type `/skill-name`.

**At the END of every prompt that changes code**: Spawn a background agent to verify whether any `.claude/rules/`, `.claude/skills/`, or this `CLAUDE.md` file needs updating to reflect the changes made. If code patterns, architecture, or conventions changed, update the relevant documentation. This keeps documentation from drifting.

## Available Skills

- `/database-migrations` — Migration-first schema change workflow
- `/api-validation` — Run validation scripts after code changes
- `/self-maintenance` — Periodic codebase health audit
- `/docs-sync` — Self-healing documentation pipeline
- `/skill-builder` — Create or audit Claude Code skills
- `/analytics-metrics` — Metrics collection, Toby Score, TrendScout, dashboards
- `/billing-stripe` — Stripe billing, subscriptions, soft-lock lifecycle
- `/content-pipeline` — Content generation, quality scoring, dedup, Content DNA
- `/frontend-patterns` — React hooks, routing, React Query, dynamic brands
- `/media-rendering` — Image/video rendering, carousel, caption, fonts
- `/platform-publishing` — OAuth, multi-platform publishing, token lifecycle
- `/toby-agent` — Orchestrator tick loop, agents, memory, Thompson Sampling

## Scoped Rules (auto-loaded by file path)

- `rules/backend/api-routes.md` — API route conventions (`app/api/**`)
- `rules/backend/python-services.md` — Service layer patterns (`app/services/**`)
- `rules/backend/python-models.md` — SQLAlchemy model conventions (`app/models/**`)
- `rules/frontend/react-components.md` — React/TS patterns (`src/**`)
- `rules/frontend/api-client.md` — HTTP client & React Query (`src/**/api/**`)
- `rules/database/migration-sql.md` — Migration SQL conventions (`migrations/**`)
- `rules/security.md` — Auth, data scoping, secrets, OWASP awareness
