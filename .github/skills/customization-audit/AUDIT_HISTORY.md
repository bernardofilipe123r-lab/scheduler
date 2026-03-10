# Customization Audit History

This file is append-only. Each entry records what commit range was reviewed and what customization drift was found.

## Audit Entry 2026-03-10T12:00:00Z
- Reviewer: GitHub Copilot
- Scope: Baseline setup for new `customization-audit` skill
- Commit window reviewed (newest -> oldest):
  - 8ae78e21 | 2026-03-10 11:14:32 +0000 | Filipe Peixoto | Sidebar: reduce row height (py-2.5 -> py-1.5), hide scrollbar
  - 2eb6a114 | 2026-03-10 11:09:20 +0000 | Filipe Peixoto | Redesign Threads page - light theme matching Reels, 20% smaller rows, clean stone/gray palette
  - a1fdef4c | 2026-03-10 11:04:15 +0000 | Filipe Peixoto | feat: add Freepik as primary image generator for Format B, DeAPI as fallback
  - 694743de | 2026-03-10 10:53:01 +0000 | Filipe Peixoto | feat: add Threads content pipeline - generation, publishing, and manual creation page
  - 45fb7a91 | 2026-03-10 10:44:59 +0000 | bernardofilipe123r-lab | Merge pull request #3 from bernardofilipe123r-lab/claude/fix-toby-ai-agent-G9PWD
  - a6932606 | 2026-03-10 10:44:10 +0000 | Claude | docs: comprehensive diagnosis of Toby experiments bug + upgrade plan
  - 313d87e8 | 2026-03-10 10:27:43 +0000 | Filipe Peixoto | fix: enforce Threads as text-only across ALL publishing paths
  - 75b54bfe | 2026-03-10 10:09:28 +0000 | Filipe Peixoto | fix: exclude Threads from reels and carousels - text-only platform
  - 80824aa6 | 2026-03-09 20:28:27 +0000 | Filipe Peixoto | Add platform filter to Jobs page, remove Content DNA auto-save
  - 46680bee | 2026-03-09 19:58:23 +0000 | Filipe Peixoto | Fix: serve favicon and static files correctly in production
  - 81705eb2 | 2026-03-09 19:55:47 +0000 | Filipe Peixoto | Open OAuth connect in new tab, auto-refresh on return (brands page only)
  - f8a0c0f3 | 2026-03-09 19:45:23 +0000 | Filipe Peixoto | Fix: switch brand cards to CSS columns for masonry layout (independent column flow)

- Drift validator result:
  - Command: /opt/homebrew/bin/python3 scripts/validate_customization_drift.py
  - Status: FAIL (exit code 1)
  - Summary: 85 passed, 3 failed, 4 warnings

- Failed items found:
  - Route module app.api.auth.bsky_auth_routes not in scripts/validate_api.py CRITICAL_MODULES
  - Route module app.api.threads.routes not in scripts/validate_api.py CRITICAL_MODULES
  - Publishing service bsky_token_service not mentioned in .github/skills/platform-publishing/SKILL.md

- Warning items found:
  - app/models/toby_cognitive has no migration references found (may be initial schema)
  - app/models/user_costs has no migration references found (may be initial schema)
  - app/services/discovery has no mapped skill (may need new skill)
  - app/services/monitoring has no mapped skill (may need new skill)

- Files updated in this audit:
  - .github/skills/customization-audit/SKILL.md
  - .claude/skills/customization-audit/SKILL.md
  - .github/skills/customization-audit/AUDIT_HISTORY.md

- Open actions for next audit:
  1. Update scripts/validate_api.py CRITICAL_MODULES for missing route modules.
  2. Update .github/skills/platform-publishing/SKILL.md with Bluesky token service coverage.
  3. Decide whether discovery and monitoring require dedicated skills or explicit mapping in docs.

- Checkpoint hash for next run:
  - newest reviewed: 8ae78e21
