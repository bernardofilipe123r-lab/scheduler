---
name: customization-audit
description: Run a commit-aware audit that checks whether skills, instructions, prompts, and agent docs need updates after recent code changes.
user-invocable: true
---

## What This Skill Does

Runs a full documentation-customization audit for the repository and records a durable checkpoint so the next invocation knows exactly where the last audit stopped.

## Persistent State File

- `.github/skills/customization-audit/AUDIT_HISTORY.md`

This log tracks:
- Last checked timestamp
- Commit window reviewed
- Findings and unresolved items

## Steps

### 1. Load Previous Checkpoint
Read `.github/skills/customization-audit/AUDIT_HISTORY.md`.
Capture the newest reviewed commit hash and unresolved issues.

### 2. Inspect Recent Commits
Run:
```bash
git --no-pager log -n 20 --date=iso --pretty=format:'%h|%ad|%an|%s'
```
Map each relevant commit to changed paths.

### 3. Evaluate Trigger Matrix Requirements
Use `.github/instructions/self-maintenance.instructions.md` as the required mapping source.
For each commit/path pattern, decide whether a skill/rule/instruction should have been updated.

### 4. Run Drift Detection
Run:
```bash
python scripts/validate_customization_drift.py
```
Classify output as PASS/WARN/FAIL and include exact missing coverage items.

### 5. Verify Primary Customization Indexes
Review and update when stale:
- `.github/copilot-instructions.md`
- `.claude/CLAUDE.md`
- impacted files in `.github/skills/`, `.claude/skills/`, `.github/instructions/`, `.claude/rules/`

### 6. Apply Surgical Fixes
Only edit sections that drifted. Avoid broad rewrites.

### 7. Write New Audit Entry
Append a new section to `.github/skills/customization-audit/AUDIT_HISTORY.md` including:
- Timestamp (UTC)
- Reviewer
- Commit window (newest -> oldest)
- Files reviewed
- Files updated
- Open issues
- Next checkpoint hash

## Report Template

- Checked: ...
- Updated: ...
- Open Issues: ...
- Checkpoint: ...

## Guardrails

- Do not report all-clear if drift validator returns non-zero.
- Do not delete previous audit entries.
- If code changes include routes/models/services, run import validation before finalizing:
```bash
python scripts/validate_api.py --imports
```
