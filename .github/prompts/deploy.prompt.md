---
description: "Deploy to Railway — check status, set env vars, redeploy, verify logs"
agent: "agent"
tools: [execute, read, search]
---

Deploy the current state to Railway production.

## Steps

1. Run `railway status` to confirm the correct project/service context (`scheduler` in `responsible-mindfulness`, production)
2. Run `git status` — if there are uncommitted changes, stage and commit them first (`git add -A && git commit -m "..."`)
3. Run `git push` to push changes to the remote
4. Run `railway redeploy` to trigger a redeployment
5. Wait 30 seconds, then run `railway logs --tail 50` to verify the deployment started successfully
6. Look for any startup errors in the logs — if found, investigate and fix

## Notes
- Setting env vars via `railway variables set KEY=value` triggers an automatic redeploy — no separate redeploy needed
- The backend is a FastAPI app with APScheduler (Toby tick loop) — successful startup shows "Application startup complete"
- If deployment fails, check `railway logs` for the error before making changes
