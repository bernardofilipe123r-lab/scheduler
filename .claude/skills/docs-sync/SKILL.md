---
name: docs-sync
description: Use after any code change to verify and update documentation, skills, rules, and instructions. Ensures .claude/ files stay in sync with the codebase. Auto-invoked at the end of every coding session.
user-invocable: true
---

## What This Skill Does

This is the **self-healing documentation pipeline**. It detects when code changes have made `.claude/` documentation stale and updates it automatically. Think of it as "documentation drift detection + auto-fix."

This skill should run at the END of every prompt that modifies code.

## Steps

### 1. Identify What Changed
Review the files modified in this session (use `git diff --name-only` or recall from context).

### 2. Check Rule Relevance
For each changed file, determine which `.claude/rules/` files are scoped to it:
- `app/api/**` → check `rules/backend/api-routes.md`
- `app/services/**` → check `rules/backend/python-services.md`
- `app/models/**` → check `rules/backend/python-models.md`
- `src/**/*.tsx` → check `rules/frontend/react-components.md`
- `src/**/api/**` → check `rules/frontend/api-client.md`
- `migrations/**` → check `rules/database/migration-sql.md`
- Auth/security changes → check `rules/security.md`

### 3. Check Skill Relevance
- New database columns added? → verify `/database-migrations` skill still accurate
- New API routes added? → verify `/api-validation` skill still accurate
- New features added? → consider if a new skill would be valuable

### 4. Check CLAUDE.md
- New key source files? → update "Key Source Locations" section
- New commands or tools? → update "Build & Run Commands"
- New conventions introduced? → update "Critical Rules"
- New skill created? → update "Available Skills" list

### 5. Apply Updates
Edit any stale files to reflect the current codebase. Keep changes minimal and precise — don't rewrite entire files when a line or two needs updating.

### 6. Report
Summarize what was checked and what was updated (if anything):
- **Checked**: [list of rules/skills reviewed]
- **Updated**: [list of files modified, or "None — all documentation is current"]
- **Suggested**: [optional — new skills or rules that might be valuable]

## Notes
- Prefer small, surgical edits over full rewrites
- Only update if there's actual drift — don't make changes for the sake of changes
- If a new pattern emerges across 3+ files, consider creating a new rule for it
- This skill pairs with `scripts/validate_customization_drift.py` which does automated drift detection
