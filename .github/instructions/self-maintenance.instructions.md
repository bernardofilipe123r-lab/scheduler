---
description: "ALWAYS loaded. Ensures Copilot agent customization files (skills, instructions, prompts, agents) stay in sync with code changes. Any structural change to routes, models, Toby agents, platforms, or workflows MUST trigger an update to the corresponding customization file."
applyTo: "**"
---

# Self-Maintenance: Keep Agent Customization Files in Sync

When you make a code change that affects documented patterns, you MUST update the corresponding customization file. This is not optional.

## Trigger Matrix

| Code Change | Update Required |
|---|---|
| Add/remove/rename an API route file | `.github/skills/api-validation/SKILL.md` (CRITICAL_MODULES list) |
| Add/remove/rename an API endpoint | `.github/skills/api-validation/SKILL.md` (endpoint count) |
| Change NicheConfig model fields | `.github/skills/content-pipeline/SKILL.md` (PromptContext fields) |
| Add/remove a Toby agent | `.github/skills/toby-agent/SKILL.md` (agent list) |
| Change Toby rate limits | `.github/skills/toby-agent/SKILL.md` + `.github/instructions/toby-agents.instructions.md` |
| Add/remove a social platform | `.github/skills/platform-publishing/SKILL.md` + legal pages instruction |
| Change OAuth flow for a platform | `.github/skills/platform-publishing/SKILL.md` |
| Change billing lifecycle or gates | `.github/skills/billing-stripe/SKILL.md` |
| Change Toby Score formula | `.github/skills/analytics-metrics/SKILL.md` |
| Change media rendering pipeline | `.github/skills/media-rendering/SKILL.md` |
| Add/remove/change a reel format | `.github/instructions/reel-formats.instructions.md` (format tables, routing chain, checklist) |
| Change Format B layout/compositor | `.github/instructions/reel-formats.instructions.md` (Format B Layout Math section) |
| Change quality score threshold | `.github/skills/content-pipeline/SKILL.md` |
| Change dedup logic or scheduling guards | `.github/skills/toby-agent/SKILL.md` (Anti-Duplicate Safeguards section) + `.github/instructions/toby-agents.instructions.md` |
| Re-enable parallel content execution | **FORBIDDEN** — see 2026-03-08 duplicate content incident in toby-agent SKILL |
| Add new React hook pattern | `.github/instructions/react-components.instructions.md` |
| Change auth pattern in routes | `.github/instructions/api-routes.instructions.md` |
| Change migration workflow | `.github/instructions/migration-sql.instructions.md` + `.github/skills/database-migrations/SKILL.md` |
| Change validate_api.py structure | `.github/skills/api-validation/SKILL.md` |
| Add/remove feature flags | `.github/skills/toby-agent/SKILL.md` (feature flags section) |
| Change frontend routing structure | `.github/skills/frontend-patterns/SKILL.md` |
| Change deployment procedure | `.github/prompts/deploy.prompt.md` |
| Add/remove/change external API with cost or rate limit | `app/services/monitoring/api_usage_tracker.py` (API_LIMITS dict) + `src/pages/Admin.tsx` (API Usage Monitoring section) + `docs/api-usage-monitoring-research.md` |

## How to Update

1. Read the affected customization file
2. Find the specific section that documents the changed pattern
3. Update ONLY the affected section — do not rewrite the entire file
4. Keep the YAML frontmatter unchanged unless the description needs updating

## Validation After Changes

After ANY code change to `app/` or `src/`, run:
- `python scripts/validate_api.py --imports` (fast, catches import breakage)
- If routes/endpoints changed: `python scripts/validate_api.py` (full suite)
- If React components changed: `npx eslint src/ --rule 'react-hooks/rules-of-hooks: error'`
