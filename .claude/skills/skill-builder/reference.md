# Skill Builder Reference

Complete technical reference for Claude Code skills.

## Frontmatter Field Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | directory name | Display name and `/slash-command`. Lowercase, hyphens, max 64 chars. |
| `description` | string | first paragraph | What skill does and when to use it. Write as: "Use when someone asks to [action]." |
| `argument-hint` | string | none | Autocomplete hint. Examples: `[issue-number]`, `[filename]` |
| `disable-model-invocation` | boolean | false | When true, only user can invoke via `/name`. |
| `user-invocable` | boolean | true | When false, hides from `/` menu. Only Claude can invoke. |
| `allowed-tools` | string | all tools | Comma-separated: `Read, Grep, Bash(npm *)` |
| `model` | string | inherit | Override model: `sonnet`, `opus`, `haiku` |
| `context` | string | none | Set to `fork` for isolated subagent execution. |
| `agent` | string | general-purpose | Subagent type when `context: fork`: `Explore`, `Plan`, `general-purpose` |

## String Substitutions

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments passed to skill |
| `$0`, `$1`, `$N` | Positional arguments (0-indexed) |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `${CLAUDE_SKILL_DIR}` | Skill directory path |

## Invocation Control Matrix

| Config | User can invoke? | Claude can invoke? |
|--------|------------------|--------------------|
| Default (both omitted) | Yes | Yes |
| `disable-model-invocation: true` | Yes | No |
| `user-invocable: false` | No | Yes |

## Dynamic Context Injection

Use `` !`command` `` to run shell commands before skill loads. Output replaces placeholder inline.

```yaml
## Git context
- Current branch: !`git branch --show-current`
- Recent changes: !`git diff --stat HEAD~1`
```

## Skill Locations (Priority Order)

1. Enterprise (managed settings) — highest
2. Personal (`~/.claude/skills/`)
3. Project (`.claude/skills/`)
4. Plugin — lowest

## allowed-tools Patterns

```yaml
# Read-only
allowed-tools: Read, Grep, Glob

# Specific commands only
allowed-tools: Bash(git status), Bash(npm test), Read

# Any bash (no restriction)
allowed-tools: Bash, Read, Write
```

## Hooks in Skills

```yaml
hooks:
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "./scripts/run-linter.sh"
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Skill not triggering | Check `description` keywords match what users say |
| Triggers too often | Make description more specific or add `disable-model-invocation: true` |
| Subagent returns nothing | Add concrete task instructions, not just guidelines |
| Arguments not substituted | Verify `$ARGUMENTS` or `$N` appears in content |
| Too many skills | Check total description size with `/context`. Budget is ~16K chars. |
