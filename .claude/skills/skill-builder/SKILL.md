---
name: skill-builder
description: Use when creating new skills, optimizing existing skills, or auditing skill quality. Guides skill development following Claude Code official best practices.
---

## What This Skill Does

Guides the creation and optimization of Claude Code skills using official best practices. Use this whenever:
- Building a new skill from scratch
- Optimizing or auditing an existing skill
- Deciding on advanced features (subagent execution, hooks, dynamic context, etc.)

For the complete technical reference on all frontmatter fields, advanced patterns, and troubleshooting, see [reference.md](__reference.md__).

## Quick Start: What Is a Skill?

A skill is a reusable set of instructions that tells Claude Code how to handle a specific task. Skills live in `.claude/skills/[skill-name]/SKILL.md` inside your project. When you type `/skill-name` or describe what you need in natural language, Claude loads the skill's instructions and follows them.

## Mode 1: Build a New Skill

Run the **Discovery Interview** first. Do NOT start writing files until discovery is complete.

### Discovery Interview

Ask questions using AskUserQuestion, one round at a time:

**Round 1: Goal & Name** — What does this skill do? What should we call it?
**Round 2: Trigger** — What would someone say to trigger this? Manual-only or auto-invocable?
**Round 3: Step-by-Step Process** — Walk through the exact workflow from trigger to output.
**Round 4: Inputs, Outputs & Dependencies** — What inputs/outputs? External APIs or tools needed?
**Round 5: Guardrails** — What could go wrong? Hard boundaries? Cost concerns?
**Round 6: Confirmation** — Summarize understanding, get user approval.

### Build Phase

1. **Choose type**: Task skill (step-by-step workflow) or Reference skill (knowledge Claude applies)
2. **Configure frontmatter**: `name`, `description`, and only the fields you need
3. **Write content**: Context → Steps → Output format → Notes. Keep under 500 lines.
4. **Add supporting files** if needed (reference docs, templates, scripts)
5. **Document in CLAUDE.md**: Add brief entry about the new skill
6. **Test**: Both natural language triggers and `/skill-name` invocation

## Mode 2: Audit an Existing Skill

### Frontmatter Audit
- [ ] `name` matches directory name
- [ ] `description` uses natural trigger keywords
- [ ] `disable-model-invocation: true` if skill has side effects
- [ ] No unnecessary fields

### Content Audit
- [ ] Under 500 lines (reference in supporting files)
- [ ] Clear numbered steps for task skills
- [ ] Output format specified
- [ ] All file paths documented
- [ ] No vague instructions

### Integration Audit
- [ ] Documented in CLAUDE.md
- [ ] Supporting files referenced (not orphaned)
- [ ] API keys in env vars, never hardcoded

## Notes
- Skills live in `.claude/skills/[name]/SKILL.md`
- SKILL.md content only loads when invoked — descriptions are always in context
- `context: fork` runs skill in isolated subagent (for self-contained tasks)
- See [reference.md](__reference.md__) for full frontmatter field reference
