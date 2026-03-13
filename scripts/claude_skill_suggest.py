#!/usr/bin/env python3
"""
Claude Code PreToolUse Hook — Skill Suggestion

Runs before Claude edits a file. Reads the file path from the tool input
(passed via stdin as JSON) and suggests the relevant skill if one exists.
Advisory only — always exits 0 so the edit proceeds.

Hook type: PreToolUse (matcher: Write|Edit|MultiEdit)
"""

import json
import sys

# Map file path prefixes → skill name and skill file path
SKILL_MAP = {
    "app/api/": ("api-validation", ".github/skills/api-validation/SKILL.md"),
    "app/models/": ("database-migrations", ".github/skills/database-migrations/SKILL.md"),
    "app/services/toby/": ("toby-agent", ".github/skills/toby-agent/SKILL.md"),
    "app/services/media/": ("media-rendering", ".github/skills/media-rendering/SKILL.md"),
    "app/services/content/": ("content-pipeline", ".github/skills/content-pipeline/SKILL.md"),
    "app/services/discovery/": ("content-pipeline", ".github/skills/content-pipeline/SKILL.md"),
    "app/core/prompt": ("content-pipeline", ".github/skills/content-pipeline/SKILL.md"),
    "app/core/viral_patterns": ("content-pipeline", ".github/skills/content-pipeline/SKILL.md"),
    "app/services/billing/": ("billing-stripe", ".github/skills/billing-stripe/SKILL.md"),
    "app/services/publishing/": ("platform-publishing", ".github/skills/platform-publishing/SKILL.md"),
    "app/services/analytics/": ("analytics-metrics", ".github/skills/analytics-metrics/SKILL.md"),
    "src/features/reels/": ("media-rendering", ".github/skills/media-rendering/SKILL.md"),
    "src/features/auth/": ("frontend-patterns", ".github/skills/frontend-patterns/SKILL.md"),
    "src/features/brands/": ("frontend-patterns", ".github/skills/frontend-patterns/SKILL.md"),
    "src/features/billing/": ("billing-stripe", ".github/skills/billing-stripe/SKILL.md"),
    "src/pages/": ("frontend-patterns", ".github/skills/frontend-patterns/SKILL.md"),
    "src/shared/": ("frontend-patterns", ".github/skills/frontend-patterns/SKILL.md"),
    "migrations/": ("database-migrations", ".github/skills/database-migrations/SKILL.md"),
}

# Track which skills we've already suggested in this session
# (Can't persist across hook invocations, but the output will be visible)
ALREADY_SUGGESTED = set()


def get_file_path_from_input():
    """Extract file path from tool input JSON passed on stdin."""
    try:
        data = json.loads(sys.stdin.read())
        # Claude Code passes tool_input as a nested object
        tool_input = data.get("tool_input", data)
        return (
            tool_input.get("file_path", "")
            or tool_input.get("filePath", "")
            or tool_input.get("path", "")
            or ""
        )
    except Exception:
        return ""


def normalize_path(file_path):
    """Strip absolute path prefix to get workspace-relative path."""
    # Handle absolute paths
    markers = ["/ViralToby/", "/scheduler/"]
    for marker in markers:
        idx = file_path.find(marker)
        if idx != -1:
            return file_path[idx + len(marker):]
    return file_path


def main():
    file_path = get_file_path_from_input()
    if not file_path:
        sys.exit(0)

    rel_path = normalize_path(file_path)

    for pattern, (skill_name, skill_file) in SKILL_MAP.items():
        if rel_path.startswith(pattern):
            print(f"SKILL REMINDER: You're editing {pattern}* files.")
            print(f"Ensure you've read the `{skill_name}` skill: {skill_file}")
            print(f"Load it now if you haven't already.")
            break

    sys.exit(0)  # Always allow the edit


if __name__ == "__main__":
    main()
