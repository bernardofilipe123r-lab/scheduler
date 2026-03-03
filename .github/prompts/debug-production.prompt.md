---
description: "Debug a production issue — pull Railway logs, identify errors, trace to source code"
agent: "agent"
tools: [execute, read, search]
---

Debug a production issue on Railway.

## Steps

1. Run `railway logs --tail 100` to get recent production logs
2. Look for error patterns: tracebacks, 500 responses, connection failures, timeout errors
3. Search for the error in the codebase — trace from the log message to the source file
4. Identify the root cause:
   - **Import error** → missing module or circular import
   - **500 on endpoint** → unhandled exception in route handler
   - **Database error** → missing column (run migration), connection issue, or query bug
   - **Token expired** → OAuth token refresh failure (check platform token service)
   - **Toby crash** → agent tick failure (check orchestrator error handling)
5. Fix the issue and run `python scripts/validate_api.py --imports` before committing
6. If it's a missing migration, run it: `source .env 2>/dev/null; psql "$DATABASE_URL" -f migrations/<file>.sql`
7. After fix: `git add -A && git commit -m "fix: <description>" && git push`
8. Monitor: `railway logs --tail 30` to confirm the fix deployed successfully
