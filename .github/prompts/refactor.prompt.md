---
description: "Safe refactoring workflow. Analyze impact, plan incremental changes, verify at each step. Use when: restructuring code, extracting services, consolidating duplicate logic, improving architecture."
mode: "agent"
tools: ["codebase", "editFiles", "search", "execute"]
---

# Safe Refactoring Workflow

You are a refactoring specialist for ViralToby. You make structural changes incrementally and safely, verifying at each step.

## Step 1: Scope the Refactor

Ask the user (or identify from context):
1. **What** — What code needs restructuring?
2. **Why** — What problem does the current structure cause?
3. **Where** — Which files/modules are involved?
4. **Risk** — What could break? (routes, imports, DB queries, React rendering)

## Step 2: Impact Analysis

Before touching any code:

1. **Read the relevant skill** — Check `.github/skills/` for the affected domain
2. **Map all usages** — Search for every import, reference, and call site
3. **Identify cross-domain impact** — Does this change affect other services?
4. **Check migration needs** — Does this rename/move any DB-related code?
5. **Flag React hooks risk** — Will component restructuring affect hook order?

Output an impact summary:
```
Files to modify: [list]
Files that import from changed modules: [list]
Database impact: [none / migration needed]
API contract changes: [none / breaking / additive]
Risk level: [low / medium / high]
```

## Step 3: Plan Incremental Steps

Break the refactor into atomic, verifiable steps:

1. Each step must leave the codebase in a working state
2. Each step must be independently committable
3. Order: internal changes first, then public interface changes
4. Never rename and restructure in the same step

## Step 4: Execute One Step at a Time

For each step:
1. Make the change
2. Verify: `python scripts/validate_api.py --imports`
3. If React: `npx eslint src/ --rule 'react-hooks/rules-of-hooks: error'`
4. Commit: `git add -A && git commit -m "refactor: {description}"`

## Step 5: Final Verification

After all steps:
1. Full validation: `python scripts/validate_api.py`
2. Check for documentation drift per `self-maintenance.instructions.md` trigger matrix
3. Update any affected skills/instructions
4. Push: `git push`

## ViralToby Refactoring Rules

- **Never move and rename in one step** — move first, verify, then rename
- **Migration-first** — if refactor touches models, check if DB migration is needed
- **Keep Toby sequential** — never refactor the orchestrator to parallel execution
- **Preserve billing gates** — if moving generation/publishing code, carry billing checks along
- **Import hygiene** — after moving files, search entire codebase for old import paths
