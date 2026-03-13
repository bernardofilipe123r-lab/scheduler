---
description: "Use when you need a commit-aware audit that checks whether skills, instructions, prompts, and agent docs must be updated after recent code changes."
---

# Customization Audit

## When to Use
- You want a full sync check across `.github/` customization files
- You need to review recent commits and detect documentation drift
- You are about to finish a large coding session and want a final docs/skills audit
- You need a historical log of when audits were run and which commits were reviewed

## Persistent State File
- Audit history: `.github/skills/customization-audit/AUDIT_HISTORY.md`
- This file is the source of truth for:
  - Last audit timestamp
  - Last reviewed commit (newest and oldest in window)
  - Findings and pending actions

## Workflow

### 1. Read Previous Audit State
Open `.github/skills/customization-audit/AUDIT_HISTORY.md` and capture:
- Last checked timestamp
- Last commit window reviewed
- Any unresolved actions

### 2. Collect Current Git Delta
Run:
```bash
git --no-pager log -n 20 --date=iso --pretty=format:'%h|%ad|%an|%s'
```
If a previous checkpoint exists, focus on commits newer than the last reviewed newest hash.

### 3. Map Commits to Trigger Matrix
Cross-check changed files against `.github/instructions/self-maintenance.instructions.md` trigger matrix.
Examples:
- New/renamed route modules -> `api-validation` skill and `validate_api.py`
- NicheConfig field changes -> `content-pipeline` skill
- Toby agents/rate-limits/dedup changes -> `toby-agent` skill + Toby instructions
- Platform or OAuth changes -> `platform-publishing` skill + legal pages instruction

### 4. Run Drift Validator
Run:
```bash
python scripts/validate_customization_drift.py
```
Record FAIL and WARN items in the audit history file.

### 5. Verify Core Index Files
Check and update if needed:
- `.github/copilot-instructions.md`
- Any impacted `SKILL.md`, `.instructions.md`, `.prompt.md`, `.agent.md`

### 6. Apply Minimal Updates
Make only targeted edits for stale sections. Do not rewrite large files if one table row is enough.

### 7. Update Audit History
Append a new entry in `.github/skills/customization-audit/AUDIT_HISTORY.md` with:
- Timestamp (UTC)
- Reviewer
- Commit window reviewed
- Command outputs summary
- Updated files
- Open issues and next action

## Output Format
- **Checked:** list of skills/instructions/docs reviewed
- **Updated:** list of files edited, or `None`
- **Open Issues:** remaining drift or warnings
- **Checkpoint:** newest reviewed commit hash

## Guardrails
- Never mark an item complete without checking real files.
- If drift script fails, do not claim full sync.
- Keep history append-only for traceability.
- If routes or models changed, run API validation (`python scripts/validate_api.py --imports`) after updates.
