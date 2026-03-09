---
name: self-maintenance
description: Use when auditing code quality, checking for drift between code and documentation, or performing periodic maintenance tasks on the ViralToby codebase.
disable-model-invocation: true
---

## What This Skill Does

Performs a comprehensive health check on the ViralToby codebase. Run periodically (weekly recommended) or after large changes to catch issues before they compound.

## Audit Checklist

### 1. Dynamic Architecture Compliance
- Search for hardcoded brand names, IDs, or color arrays
- Verify all brand data flows through `useDynamicBrands()` on frontend
- Verify all brand data flows through `Brand` model queries on backend
- Check: `grep -r "Healveth\|brand-1\|brand-2" src/ app/` (should return nothing)

### 2. Migration-Model Sync
- For every model column, verify a corresponding migration exists
- Run: `python scripts/reviewer_guardrails.py`

### 3. API Validation
- Run: `python scripts/validate_api.py`
- Verify all routes have auth dependencies
- Check for unused route imports

### 4. React Hooks Safety
- Run: `npx eslint src/ --rule 'react-hooks/rules-of-hooks: error'`
- Manually verify hooks are before early returns in complex components

### 5. Legal Page Sync
- List connected platforms from `app/api/auth/` OAuth route files
- Verify each platform appears in Terms, Privacy Policy, and Data Deletion pages

### 6. Customization Drift
- Run: `python scripts/validate_customization_drift.py`
- Update `.claude/rules/` and `.claude/skills/` if code has drifted

### 7. Dependency Health
- Check for outdated packages: `npm outdated`, `pip list --outdated`
- Review security advisories: `npm audit`

## Output
Summarize findings as:
- **PASS**: Items that checked out
- **WARN**: Items that need attention but aren't breaking
- **FAIL**: Items that need immediate fixes
