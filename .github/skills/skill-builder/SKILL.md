---
description: "Use when creating new skills, optimizing existing skills, or auditing skill quality for either .github/ (Copilot) or .claude/ (Claude Code). Guides skill development following best practices."
---

# Skill Builder

Guides creation and optimization of agent skills for both GitHub Copilot (`.github/skills/`) and Claude Code (`.claude/skills/`).

## Mode 1: Build a New Skill

Run the **Discovery Interview** first before writing any files.

### Discovery Interview

**Round 1: Goal & Name** — What does this skill do? What should we call it?
**Round 2: Trigger** — What phrases trigger it? Manual-only or auto-invocable?
**Round 3: Step-by-Step Process** — Walk through exact workflow from trigger to output.
**Round 4: Inputs, Outputs & Dependencies** — What inputs/outputs? External tools needed?
**Round 5: Guardrails** — What could go wrong? Hard boundaries? Cost concerns?
**Round 6: Confirmation** — Summarize understanding, get user approval.

### Build Phase

1. **Choose type**: Task skill (step-by-step workflow) or Reference skill (knowledge to apply)
2. **Write SKILL.md**: Context → Steps → Output format → Notes. Keep under 500 lines.
3. **Create in BOTH locations**:
   - `.github/skills/{name}/SKILL.md` (GitHub Copilot - uses `description` in YAML frontmatter)
   - `.claude/skills/{name}/SKILL.md` (Claude Code - uses `name` + `description` in YAML frontmatter)
4. **Update main instruction files**: Add brief entry to `copilot-instructions.md` and `.claude/CLAUDE.md`
5. **Test**: Natural language triggers and `/skill-name` invocation

### Frontmatter Differences

GitHub Copilot (`.github/skills/`):
```yaml
---
description: "Use when someone asks to [action], [action], or [action]."
---
```

Claude Code (`.claude/skills/`):
```yaml
---
name: skill-name
description: Use when someone asks to [action], [action], or [action].
argument-hint: [optional args]
disable-model-invocation: true  # if has side effects
---
```

## Mode 2: Audit an Existing Skill

### Checklist
- [ ] Description uses natural trigger keywords
- [ ] Under 500 lines (reference in supporting files)
- [ ] Clear numbered steps for task skills
- [ ] Output format specified
- [ ] All file paths documented
- [ ] Documented in copilot-instructions.md AND .claude/CLAUDE.md
- [ ] Exists in BOTH `.github/skills/` AND `.claude/skills/`

## Notes
- Always create skills in BOTH locations so the user can use either GitHub Copilot or Claude Code
- Skill content can differ slightly to match each tool's conventions
- SKILL.md content only loads when invoked — descriptions are always in context
