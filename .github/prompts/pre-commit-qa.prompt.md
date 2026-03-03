---
description: "Full pre-commit QA — build, lint, validate imports, check hooks, verify everything before committing"
agent: "agent"
tools: [execute, read, search]
---

Run the complete QA suite before committing. This is more thorough than the git pre-commit hook.

## Steps (run in order)

### 1. TypeScript Build
```bash
npm run build
```
Must exit 0. Fix any TypeScript errors before proceeding.

### 2. ESLint — React Hooks
```bash
npx eslint src/ --rule 'react-hooks/rules-of-hooks: error' --no-error-on-unmatched-pattern
```
Must exit 0. Any hook called after an early return will crash in production.

### 3. Python Import Validation
```bash
python scripts/validate_api.py --imports
```
Must exit 0. Catches broken imports, missing modules, circular dependencies.

### 4. Full API Validation (if routes/models changed)
```bash
python scripts/validate_api.py
```
Tests 117 endpoints, NicheConfig alignment, DB column alignment.

### 5. Check for Unstaged Changes
```bash
git diff --stat
```
Make sure all changes are intentional.

### 6. Commit
```bash
git add -A && git commit -m "<descriptive message>" && git push
```

## If Any Check Fails
- **Build failure**: Fix TypeScript errors (check the error output for file:line)
- **Hooks violation**: Move all hooks BEFORE early returns in the component
- **Import failure**: Check for typos, missing `__init__.py`, or circular imports
- **Endpoint 500**: Read the route handler — there's an unhandled exception
- **NicheConfig misalignment**: Sync fields between `niche_config.py` model and `prompt_context.py` dataclass
