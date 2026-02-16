# Reels Automation Platform - AI Agent Instructions

## Project Overview
Production-grade autonomous content engine generating and publishing social media Reels/Posts for multiple brands. **Maestro** orchestrates AI agents → content generation → scheduling → publishing to Instagram, Facebook, YouTube.

**Stack:** FastAPI + PostgreSQL + React 18 + TypeScript + FFmpeg + DeepSeek AI + Meta Graph API

---

## ⚠️ ORCHESTRATOR RULES (CRITICAL)

If `runSubagent` is enabled:
1. **NEVER read/edit files yourself** — spawn subagents
2. Research subagent → creates spec in `docs/SubAgent docs/` → Implementation subagent reads spec
3. Use `runSubagent(description, prompt)` — omit `agentName` param

---

## Architecture Rules

### Database-Driven Configuration (NEVER HARDCODE)
```python
# ✅ CORRECT: Load from DB
from app.services.brands.resolver import brand_resolver
brand_config = brand_resolver.get_brand_config("healthycollege")

# ❌ WRONG: Hardcoded
BRAND_COLORS = {"healthycollege": "#004f00"}
```

### Import Structure
- **Always use absolute imports:** `from app.models import Brand`
- **Never use relative imports:** No `from . import` or `from ..`

### Database Sessions
```python
from app.db_connection import get_db_session

with get_db_session() as db:
    brands = db.query(Brand).all()
```

### Multi-User Isolation
- Always filter by `user_id` for jobs, schedules, brands, agents
- System-wide entities: logs, quotas, settings (no user_id)

---

## Key Directories

| Path | Purpose |
|------|---------|
| `app/main.py` | FastAPI entry point |
| `app/models/` | SQLAlchemy ORM (jobs, brands, agents, scheduling) |
| `app/api/` | REST routes grouped by domain |
| `app/services/maestro/` | AI orchestrator daemon (daily burst + 8 cycles) |
| `app/services/content/` | Content generation pipeline (DeepSeek AI) |
| `app/services/media/` | Image/video production (Pillow + FFmpeg) |
| `app/services/publishing/` | Instagram/Facebook/YouTube publishing |
| `app/services/brands/` | Brand management & resolution |
| `app/core/` | Viral patterns, prompts, configs |
| `src/` | React frontend (TypeScript + Vite + TailwindCSS) |
| `output/` | Generated videos/images (persistent volume) |

---

## Critical Workflows

### Content Generation
`GenerationJob` → Agent proposals → BrandDifferentiator → ImageGenerator + VideoGenerator → Ready to schedule

### Maestro Daily Burst
Runs 12PM Lisbon: Load agents & brands → Generate proposals (6 reels + 2 posts per brand) → Auto-accept → Create jobs

### Auto-Scheduling
Ready jobs → Calculate slot (brand.schedule_offset + FIFO) → Create `ScheduledReel` → Publish at scheduled_time

---

## Content Types

| Type | Dimensions | Media | Platforms |
|------|------------|-------|-----------|
| **reel** | 1080×1920 | Video (MP4 + audio) | Instagram, Facebook, YouTube |
| **post** | 1080×1080 | Image (PNG) | Instagram, Facebook |

---

## Development

```bash
# Backend
uvicorn app.main:app --reload --port 8000

# Frontend
npm run dev

# Test Maestro
curl http://localhost:8000/api/maestro/status
curl -X POST http://localhost:8000/api/maestro/trigger-burst

# Health check
curl http://localhost:8000/health
```
