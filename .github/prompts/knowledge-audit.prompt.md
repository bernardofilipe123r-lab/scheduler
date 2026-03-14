---
agent: "agent"
description: "Audit customization freshness — compare code surface against skills, instructions, and agents to find drift and stale documentation"
tools: ["search/codebase", "edit/editFiles"]
---

Perform a knowledge freshness audit across the entire agent customization layer.

## Audit Scope

For each domain below, compare the current code surface against its corresponding skill/instruction and report drift.

### 1. Toby Agent System
- List all files in `app/services/toby/agents/` and `app/services/toby/`
- Compare against `.github/skills/toby-agent/SKILL.md`
- Flag: new agents, removed agents, changed rate limits, new feature flags

### 2. Platform Publishing
- List all files in `app/services/publishing/` and `app/api/auth/*oauth*`
- Compare against `.github/skills/platform-publishing/SKILL.md`
- Flag: new platforms, changed token flows, new OAuth routes

### 3. Content Pipeline
- Read `app/core/prompt_context.py` (PromptContext dataclass fields)
- Read `app/models/niche_config.py` (NicheConfig columns)
- Compare against `.github/skills/content-pipeline/SKILL.md`
- Flag: new fields not documented, changed quality thresholds

### 4. Billing
- Read `app/api/billing/` routes and `app/models/billing.py`
- Compare against `.github/skills/billing-stripe/SKILL.md`
- Flag: new webhooks, changed lifecycle states, new gates

### 5. Analytics & Metrics
- Read `app/services/analytics/` and `app/api/analytics/`
- Compare against `.github/skills/analytics-metrics/SKILL.md`
- Flag: new metric types, changed Toby Score formula, new API endpoints

### 6. Frontend Patterns
- Scan `src/features/` and `src/shared/hooks/`
- Compare against `.github/skills/frontend-patterns/SKILL.md`
- Flag: new feature modules, new hooks, changed routing

### 7. Media Rendering
- Read `app/services/media/` and `scripts/render-slides.cjs`
- Compare against `.github/skills/media-rendering/SKILL.md`
- Flag: new render modes, changed dimensions, new caption formats

## Output Format

For each domain, produce:
```
## [Domain Name]
Status: ✅ Fresh | ⚠️ Minor drift | ❌ Stale

### Documented but changed:
- [specific item that needs updating]

### Undocumented:
- [new pattern/file not in any skill]

### Oversized sections:
- [sections that have grown too large and should be split]
```

## Final Recommendations
- List consolidation opportunities (skills that overlap)
- Flag instructions that may be too broad or too narrow
- Recommend new skills/instructions if gaps exist
