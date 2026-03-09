# ViralToby — Project Instructions

## MANDATORY FIRST STEP — Read Before Coding

> **BEFORE writing any code, you MUST identify which skill applies to the user's request and read it.** This is not optional. Do not skip this step. Do not start editing files without first loading the relevant skill.

**Skill matching checklist** (run mentally at the START of every prompt):

| If the request involves... | Read this skill FIRST |
|---|---|
| API routes, endpoints, imports | `.claude/skills/api-validation/SKILL.md` |
| Database columns, models, migrations | `.claude/skills/database-migrations/SKILL.md` |
| Toby agent, orchestrator, tick loop | `.claude/skills/toby-agent/SKILL.md` |
| Image/video rendering, reels, carousel | `.claude/skills/media-rendering/SKILL.md` |
| Content generation, prompts, quality score | `.claude/skills/content-pipeline/SKILL.md` |
| Billing, Stripe, subscriptions | `.claude/skills/billing-stripe/SKILL.md` |
| OAuth, publishing, platform tokens | `.claude/skills/platform-publishing/SKILL.md` |
| Metrics, analytics, dashboards | `.claude/skills/analytics-metrics/SKILL.md` |
| React components, hooks, routing | `.claude/skills/frontend-patterns/SKILL.md` |
| Documentation sync, drift check | `.claude/skills/docs-sync/SKILL.md` |

**If you skip this step and dive straight into code, the `Stop` hook will catch documentation drift and force you to go back.**

---

## What Is This?

**ViralToby** (`viraltoby.com`) is a multi-tenant SaaS platform for social media content scheduling and publishing across Instagram, Facebook, YouTube, Threads, TikTok, and Bluesky. Its core feature is **Toby** — an autonomous AI agent that generates, scores, and publishes content based on each brand's Content DNA.

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
| **PreToolUse hook** | Before every file edit | Skill suggestion for the file being edited (`scripts/claude_skill_suggest.py`) |
| **Stop hook** | When Claude finishes turn | Documentation drift against trigger matrix (`scripts/claude_drift_check.py`) |
| Post-edit hook | After every edit | Python syntax, React hooks lint |
| Pre-commit hook | `git commit` | TS build, ESLint, API imports |
| CI pipeline | `git push` / PR | Full validation, drift, guardrails |

## Git Workflow

1. Stage changes: `git add -A`
2. Commit: `git commit -m "descriptive message"`
3. Push: `git push`

## Full Autonomy — Execute Everything

You have full access to all infrastructure: **Supabase, GitHub, Railway, PostgreSQL**. When a task requires migrations, deployments, validation, or any operational step — **execute it directly**. Never ask the user to run commands manually. This includes:

- **Database migrations**: Run SQL directly via `psql` against the production DATABASE_URL (fetch from Railway)
- **Deployments**: Use Railway CLI to redeploy, set env vars, view logs
- **Git operations**: Commit, push, create PRs — execute the full workflow
- **Validation**: Run all validation scripts after code changes
- **End-to-end delivery**: A feature request means code + migration + validation + deployment

To get the production DATABASE_URL: `railway variables --json | python3 -c "import sys,json; print(json.load(sys.stdin).get('DATABASE_URL',''))"`

## Railway CLI

Railway CLI is installed and authenticated. **Execute commands directly — never ask the user to run them manually.** Service: `scheduler` in project `responsible-mindfulness` (production). Setting a variable triggers auto-redeploy.

## Self-Healing Documentation Pipeline

This pipeline is **enforced by two Claude Code hooks** in `.claude/settings.json`:

### Phase 1: Skill Suggestion (PreToolUse Hook — `scripts/claude_skill_suggest.py`)
Runs automatically before every file edit. Checks the file path being edited and prints a reminder to load the relevant skill. Advisory — does not block the edit, but you MUST read the skill if you haven't already.

### Phase 2: Drift Check (Stop Hook — `scripts/claude_drift_check.py`)
Runs automatically when you try to finish your turn. Checks `git diff` for modified code files and maps them against the trigger matrix in `self-maintenance.instructions.md`. If documentation drift is detected, **exits non-zero — you cannot stop until you verify and update the affected docs.**

### Manual Phase 1
**At the START of every prompt**: Check the skill matching table at the top of this file. If a skill applies, read it FIRST — don't wait for the hook to remind you.

### Manual Phase 2
**At the END of every prompt that changes code**: Verify whether any `.claude/rules/`, `.claude/skills/`, or this `CLAUDE.md` file needs updating. The Stop hook will catch this automatically, but proactive checking is faster.

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

## Available Agents

| Agent | Purpose | Tools |
|---|---|---|
| `reviewer` | Read-only code review for anti-patterns, hooks violations, security | read, search |
| `architect` | System design, ADRs, trade-off analysis for complex features | codebase, search, fetch |
| `pipeline-debugger` | Debug Toby tick loop, content generation, publishing failures | codebase, search, execute |
| `tech-debt-auditor` | Identify and prioritize technical debt across the codebase | codebase, search |

## Available Prompts

| Prompt | Purpose |
|---|---|
| `prd-feature` | Create PRD from feature idea (discovery → structure → save) |
| `tasks-from-prd` | Break PRD into actionable tasks with dependencies |
| `refactor` | Safe incremental refactoring workflow |
| `add-nicheconfig-field` | Add Content DNA field (8-step workflow) |
| `add-platform` | Add social platform (OAuth + legal + publishing) |
| `debug-production` | Debug Railway production issues |
| `deploy` | Deploy to Railway |
| `knowledge-audit` | Audit customization freshness |
| `pre-commit-qa` | Full pre-commit validation suite |
| `validate` | Run API validation + fix failures |

## Scoped Rules (auto-loaded by file path)

- `rules/backend/api-routes.md` — API route conventions (`app/api/**`)
- `rules/backend/python-services.md` — Service layer patterns (`app/services/**`)
- `rules/backend/python-models.md` — SQLAlchemy model conventions (`app/models/**`)
- `rules/frontend/react-components.md` — React/TS patterns (`src/**`)
- `rules/frontend/api-client.md` — HTTP client & React Query (`src/**/api/**`)
- `rules/database/migration-sql.md` — Migration SQL conventions (`migrations/**`)
- `rules/security.md` — Auth, data scoping, secrets, OWASP awareness
