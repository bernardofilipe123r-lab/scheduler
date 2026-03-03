---
description: "Run API validation and fix any failures — imports, endpoints, NicheConfig alignment"
agent: "agent"
tools: [execute, read, edit, search]
---

Run the full API validation suite and fix any failures.

## Steps

1. Run `python scripts/validate_api.py --imports` first (fast — checks module imports and symbol resolution)
2. If import checks pass, run `python scripts/validate_api.py` for the full suite (imports + 117 endpoint smoke tests + NicheConfig alignment)
3. If any failures occur:
   - **Import error**: Fix the broken import — check for typos, missing modules, circular imports
   - **Endpoint 500**: The route handler is crashing — read the route file and fix the error
   - **NicheConfig misalignment**: A field exists in the model but not in PromptContext, or vice versa — sync them
4. Re-run until exit code 0
5. If you added new routes or modules, update `scripts/validate_api.py`:
   - New route files → add to `CRITICAL_MODULES` list
   - New endpoints → add to the endpoint test section
   - Changed auth requirements → move between no-auth/auth test sections
