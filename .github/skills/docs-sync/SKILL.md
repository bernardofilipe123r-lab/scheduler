---
name: docs-sync
description: "Use after any code change to verify and update documentation, skills, rules, and instructions. Ensures .github/ and .claude/ customization files stay in sync with the codebase. Auto-invoked at the end of every coding session."
---

# Self-Healing Documentation Pipeline

Detects when code changes have made customization files stale and updates them. Runs at the END of every prompt that modifies code.

## Steps

### 1. Identify What Changed
Review the files modified in this session (use `git diff --name-only` or recall from context).

### 2. Check the Trigger Matrix
Cross-reference changed files against the trigger matrix in `self-maintenance.instructions.md`:

| Code Change | Update Required |
|---|---|
| Add/remove/rename API route file | `api-validation` skill (CRITICAL_MODULES list) |
| Change NicheConfig model fields | `content-pipeline` skill (PromptContext fields) |
| Add/remove a Toby agent | `toby-agent` skill (agent list) |
| Add/remove a social platform | `platform-publishing` skill + legal pages instruction |
| Change billing lifecycle | `billing-stripe` skill |
| Change Toby Score formula | `analytics-metrics` skill |
| Change media rendering pipeline | `media-rendering` skill |
| Add/remove/change a reel format | `reel-formats.instructions.md` |
| Change dedup logic | `toby-agent` skill (Anti-Duplicate section) |
| Add/remove feature flags | `toby-agent` skill |
| Add external API with cost/rate limit | `api_usage_tracker.py` + Admin page |

### 3. Check Instruction Relevance
For each changed file, determine which instruction files are scoped to it:
- `app/api/**` → `api-routes.instructions.md`
- `app/models/**` → `python-models.instructions.md`
- `app/services/toby/**` → `toby-agents.instructions.md`
- `app/services/media/**` → `reel-formats.instructions.md`
- `src/**/*.tsx` → `react-components.instructions.md`
- `migrations/**` → `migration-sql.instructions.md`

### 4. Check copilot-instructions.md and CLAUDE.md
- New key source files? → update source locations
- New commands or tools? → update build/run commands
- New conventions? → update critical rules
- New skill created? → update available skills list

### 5. Apply Updates
Edit stale files with surgical, minimal changes. Don't rewrite entire files.

### 6. Report
Summarize:
- **Checked**: [list of files reviewed]
- **Updated**: [list of files modified, or "None — all documentation is current"]
- **Suggested**: [optional — new skills or rules that might be valuable]

## Notes
- Prefer small edits over full rewrites
- Only update if there's actual drift
- This pairs with `scripts/validate_customization_drift.py` for CI-level detection
