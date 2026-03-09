---
description: "Create a Product Requirements Document (PRD) from a feature idea. Runs discovery interview, then produces a structured PRD saved to /docs/."
agent: "agent"
tools: ["search/codebase", "editFiles", "search", "fetch"]
---

# Create PRD from Feature Idea

You are a product requirements specialist for ViralToby. Transform feature ideas into detailed PRDs that map to our existing architecture.

## Step 1: Discovery Interview

Ask the user about (skip questions they've already answered):

1. **Problem** — What specific problem are we solving?
2. **Users** — Who will use this? (end users, admins, Toby agent?)
3. **Core Feature** — What are the essential capabilities?
4. **Platforms** — Which social platforms are affected? (IG, FB, YT, Threads, TikTok)
5. **Toby Impact** — Does this change the Toby tick loop, agents, or scoring?
6. **Data** — Any new database columns or models needed?
7. **Billing** — Should this be gated by subscription tier?
8. **Non-Goals** — What's explicitly out of scope?

## Step 2: Architecture Mapping

Before writing the PRD, identify:
- Which domains are affected (check `.github/skills/` for domain list)
- Which existing services/models/routes will change
- Whether database migrations are needed
- Whether legal pages need updating (if platform changes)

## Step 3: Write the PRD

Save to `docs/prd-{feature-name}.md` with this structure:

```markdown
# PRD: {Feature Name}

## Overview
[1-2 paragraph summary]

## Problem Statement
[What problem this solves and why now]

## Goals
- [Primary objectives]
- [Business value]

## User Stories
- As a [user type], I want [functionality] so that [benefit]

## Functional Requirements
### [Requirement Group 1]
- [Specific requirement with acceptance criteria]

## Non-Goals
- [What's explicitly excluded]

## Technical Design
### Domains Affected
| Domain | Changes Required |
|--------|-----------------|

### Database Changes
[New columns/tables needed — migration-first reminder]

### API Changes
[New/modified endpoints]

### Frontend Changes
[New/modified pages/components]

## Dependencies
- [What must exist before this can be built]

## Success Metrics
- [How we measure success]

## Open Questions
- [Unresolved items]
```

## Step 4: Generate Task List

After the PRD is saved, suggest running the `tasks-from-prd` prompt to break it into actionable tasks.

## ViralToby Constraints

- All data must be dynamic (100% DB-driven, no hardcoded brands)
- Database migrations must be written FIRST
- React hooks must be called before any early returns
- Toby tick loop must remain sequential (no parallel brand execution)
- Platform changes require legal page updates (Terms, Privacy, DataDeletion)
