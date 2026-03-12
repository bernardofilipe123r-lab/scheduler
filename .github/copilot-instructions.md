# Copilot Instructions

## MANDATORY FIRST STEP — Load Relevant Skill Before Coding

> **BEFORE writing any code, check if an existing skill matches the user's request. If a skill applies, read it FIRST — don't start editing files without domain context.**

| If the request involves... | Read this skill FIRST |
|---|---|
| API routes, endpoints, imports | `.github/skills/api-validation/SKILL.md` |
| Database columns, models, migrations | `.github/skills/database-migrations/SKILL.md` |
| Toby agent, orchestrator, tick loop | `.github/skills/toby-agent/SKILL.md` |
| Image/video rendering, reels, carousel | `.github/skills/media-rendering/SKILL.md` |
| Content generation, prompts, quality score | `.github/skills/content-pipeline/SKILL.md` |
| Billing, Stripe, subscriptions | `.github/skills/billing-stripe/SKILL.md` |
| OAuth, publishing, platform tokens | `.github/skills/platform-publishing/SKILL.md` |
| Metrics, analytics, dashboards | `.github/skills/analytics-metrics/SKILL.md` |
| React components, hooks, routing | `.github/skills/frontend-patterns/SKILL.md` |
| Documentation sync, drift check | `.github/skills/docs-sync/SKILL.md` |
| Commit-aware customization audit | `.github/skills/customization-audit/SKILL.md` |

---

## What is ViralToby

**ViralToby** (`viraltoby.com`) is a multi-tenant SaaS platform for social media content scheduling and publishing across Instagram, Facebook, YouTube, Threads, TikTok, and Bluesky. Its core feature is **Toby** — an autonomous AI agent that generates, scores, and publishes content based on each brand's Content DNA.

**Tech Stack:** Python 3.11+ / FastAPI / SQLAlchemy / PostgreSQL / React 18 / TypeScript / Vite / Tailwind / TanStack React Query / Supabase (auth) / DeepSeek (AI) / Pillow + FFmpeg (media) / Railway (infra)

## 100% Dynamic Architecture — MANDATORY

> **All user-facing data MUST be loaded dynamically from the database or API. Zero exceptions.**

- Brand count, names, colors, platform connections, Content DNA — all from DB
- Frontend: `useDynamicBrands()` hook → `DynamicBrandInfo[]`
- Backend: `Brand` model, `get_brand_config()`, `NicheConfig` model
- **NEVER** hardcode brand names, IDs, color arrays, or platform lists
- Static constants OK for: platform identity colors, UI layout, system defaults

## Critical Rules

### React Hooks (CRASH RISK)
All hooks MUST be called BEFORE any early return. Violation causes React error #310 — crashes pages in production. Details → `react-components.instructions.md`

### Migration-First Database Changes
Write and run migration SQL via `psql "$DATABASE_URL"` BEFORE adding model columns. Missing columns cause 500 errors. Details → `database-migrations` skill

### API Validation
After any route/import/model/service change: `python scripts/validate_api.py --imports`. Exit 0 required. Details → `api-validation` skill

### Legal Page Sync
When adding/removing a social platform, update: `src/pages/Terms.tsx`, `src/pages/PrivacyPolicy.tsx`, `src/pages/DataDeletion.tsx`

## Key Source Locations

| Area | Path |
|---|---|
| API routes | `app/api/{domain}/routes.py` |
| Models | `app/models/` |
| Toby orchestrator | `app/services/toby/orchestrator.py` |
| Toby agents | `app/services/toby/agents/` |
| Content DNA | `app/core/prompt_context.py`, `app/models/niche_config.py` |
| React pages | `src/pages/` |
| Feature modules | `src/features/{domain}/` |
| Dynamic brands | `src/features/brands/hooks/use-dynamic-brands.ts` |

## Toby Agent Architecture

Toby runs a 5-min tick loop (`orchestrator.py`) with these phases:
1. **Quality Guard** — Self-checks scheduled output, cancels duplicates/fallbacks
2. **Buffer Check** — Identifies empty calendar slots, generates content to fill them
3. **Metrics Check** — Fetches post performance from platforms (6h interval)
4. **Analysis Check** — Updates strategy scores via Thompson Sampling (6h interval)
5. **Discovery** — TrendScout scans for trending topics
6. **Phase Check** — Transitions between bootstrap→learning→optimizing

### Pipeline Approval Workflow
Toby generates content → goes to Pipeline (pending_review) → user reviews in Tinder-style modal → Accept schedules it, Decline rejects it, Delete removes it. Content is **never auto-published** — user approval is always required.

### Buffer Configuration
- **Buffer Days**: 1-10 days (user configurable in Toby Settings → General tab)
- **Smart Burst**: For buffer_days > 4, Toby uses a rolling generation window of `ceil(buffer_days/2)` days — e.g. 10-day buffer generates first 5 days, then as time passes the window slides forward
- **Buffer %**: Capped at 100% for display (pipeline pending items count as virtually filling slots)
- **Content Types**: Reels, Carousels (posts), Threads — each independently toggleable globally and per-brand
- **Adaptive**: When user enables a new content type mid-buffer, Toby detects empty slots on next tick and generates content to fill them
- **Rate Limits**: Normal mode: 2/brand/hr, 6/user/hr. Bootstrap: 6/brand/hr, 20/user/hr

## Commands

```bash
# Validation (run before committing)
python scripts/validate_api.py --imports   # Quick: import + hooks check
python scripts/validate_api.py             # Full: routes, auth, schemas

# Database migrations
psql "$DATABASE_URL" -f migrations/{file}.sql

# Railway CLI (production — execute directly, never ask user)
railway variables          # List env vars
railway variables set K=V  # Set env var (triggers auto-redeploy)
railway logs               # View logs
```

## Git Workflow

> **MANDATORY — NO EXCEPTIONS:** After EVERY coding session, commit and push ONLY files changed by that session.

1. Stage only session files: `git add <file1> <file2> ...`
2. Verify staged scope: `git diff --name-only --cached`
3. Commit: `git commit -m "<descriptive message>"`
4. Push: `git push`

Never use `git add -A` by default when unrelated changes are present.

## Self-Healing Documentation Pipeline

### Phase 1: Skill Auto-Detection (START of every prompt)
Check the skill matching table at the top. If a skill applies, read it FIRST.

### Phase 2: Documentation Drift Check (END of every prompt that changes code)
Check the trigger matrix in `self-maintenance.instructions.md`. If code changes map to documentation updates, apply them. Run `python scripts/validate_api.py --imports` to validate.

## Available Skills

| Skill | Domain |
|---|---|
| `database-migrations` | Schema changes, migration-first workflow |
| `api-validation` | Route validation, import checks |
| `toby-agent` | Orchestrator, agents, memory, Thompson Sampling |
| `media-rendering` | Image/video rendering, carousel, captions |
| `content-pipeline` | Content generation, quality scoring, dedup |
| `billing-stripe` | Stripe billing, subscriptions, lifecycle |
| `platform-publishing` | OAuth, multi-platform publishing, tokens |
| `analytics-metrics` | Metrics collection, Toby Score, dashboards |
| `frontend-patterns` | React hooks, routing, React Query, brands |
| `docs-sync` | Self-healing documentation pipeline |
| `customization-audit` | Commit-aware skills/docs/instructions audit with checkpoint history |
| `self-maintenance` | Codebase health audit |
| `skill-builder` | Create or audit skills |

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

## QA Enforcement

| Layer | Trigger | What it checks |
|---|---|---|
| Post-edit hook | After every file edit | Python syntax, React hooks lint |
| Pre-commit hook | `git commit` | TS build, ESLint hooks, API imports |
| CI pipeline | `git push` / PR | Full validation, drift detection, guardrails |
