---
description: "Use when auditing code quality, checking for drift between code and documentation, or performing periodic maintenance tasks on the ViralToby codebase."
---

# Self-Maintenance Audit

Performs a comprehensive health check. Run periodically (weekly) or after large changes.

## Audit Checklist

### 1. Dynamic Architecture Compliance
- Search for hardcoded brand names, IDs, or color arrays
- `grep -r "Healveth\|brand-1\|brand-2" src/ app/` (should return nothing)
- Verify all brand data flows through `useDynamicBrands()` / `Brand` model

### 2. Migration-Model Sync
- For every model column, verify a migration exists
- Run: `python scripts/reviewer_guardrails.py`

### 3. API Validation
- Run: `python scripts/validate_api.py`
- Verify all routes have auth dependencies

### 4. React Hooks Safety
- Run: `npx eslint src/ --rule 'react-hooks/rules-of-hooks: error'`
- Verify hooks before early returns in complex components

### 5. Legal Page Sync
- List platforms from OAuth routes → verify in Terms, Privacy, DataDeletion

### 6. Customization Drift
- Run: `python scripts/validate_customization_drift.py`
- Update `.github/skills/`, `.github/instructions/`, `.claude/rules/`, `.claude/skills/` if drifted

### 7. Dependency Health
- `npm outdated`, `pip list --outdated`, `npm audit`

## Output
- **PASS**: Items that checked out
- **WARN**: Items needing attention
- **FAIL**: Items needing immediate fixes
