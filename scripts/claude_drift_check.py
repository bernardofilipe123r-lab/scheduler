#!/usr/bin/env python3
"""
Claude Code Stop Hook — Documentation Drift Check

Runs when Claude tries to finish its turn. Checks if any code files were
modified that might require documentation updates per the self-maintenance
trigger matrix. Exits non-zero if drift is detected, forcing Claude to
verify and update documentation before stopping.

Hook type: Stop
Exit 0 = Claude can stop normally
Exit 1 = Claude must continue and address the output
"""

import subprocess
import sys
import os


# Map code path prefixes → documentation files that may need updating
TRIGGER_MATRIX = {
    "app/api/": [
        ".github/skills/api-validation/SKILL.md",
        ".claude/skills/api-validation/SKILL.md",
    ],
    "app/models/": [
        ".github/skills/database-migrations/SKILL.md",
        ".claude/skills/database-migrations/SKILL.md",
    ],
    "app/services/toby/": [
        ".github/skills/toby-agent/SKILL.md",
        ".claude/skills/toby-agent/SKILL.md",
        ".github/instructions/toby-agents.instructions.md",
    ],
    "app/services/media/": [
        ".github/skills/media-rendering/SKILL.md",
        ".claude/skills/media-rendering/SKILL.md",
        ".github/instructions/reel-formats.instructions.md",
    ],
    "app/services/content/": [
        ".github/skills/content-pipeline/SKILL.md",
        ".claude/skills/content-pipeline/SKILL.md",
    ],
    "app/services/discovery/": [
        ".github/skills/content-pipeline/SKILL.md",
        ".github/instructions/reel-formats.instructions.md",
    ],
    "app/core/prompt": [
        ".github/skills/content-pipeline/SKILL.md",
        ".claude/skills/content-pipeline/SKILL.md",
    ],
    "app/core/viral_patterns": [
        ".github/skills/content-pipeline/SKILL.md",
        ".claude/skills/content-pipeline/SKILL.md",
    ],
    "app/services/billing/": [
        ".github/skills/billing-stripe/SKILL.md",
        ".claude/skills/billing-stripe/SKILL.md",
    ],
    "app/services/publishing/": [
        ".github/skills/platform-publishing/SKILL.md",
        ".claude/skills/platform-publishing/SKILL.md",
    ],
    "app/services/analytics/": [
        ".github/skills/analytics-metrics/SKILL.md",
        ".claude/skills/analytics-metrics/SKILL.md",
    ],
    "src/pages/Terms": [
        ".github/instructions/legal-pages.instructions.md",
    ],
    "src/pages/PrivacyPolicy": [
        ".github/instructions/legal-pages.instructions.md",
    ],
    "src/pages/DataDeletion": [
        ".github/instructions/legal-pages.instructions.md",
    ],
    "src/features/reels/": [
        ".github/instructions/reel-formats.instructions.md",
        ".github/skills/media-rendering/SKILL.md",
    ],
    "migrations/": [
        ".github/skills/database-migrations/SKILL.md",
        ".claude/skills/database-migrations/SKILL.md",
        ".github/instructions/migration-sql.instructions.md",
    ],
}


def get_modified_files():
    """Get files modified since last commit (staged + unstaged + untracked)."""
    files = set()
    try:
        # Unstaged changes
        result = subprocess.run(
            ["git", "diff", "--name-only"],
            capture_output=True, text=True, timeout=5
        )
        if result.stdout.strip():
            files.update(result.stdout.strip().split("\n"))

        # Staged changes
        result = subprocess.run(
            ["git", "diff", "--name-only", "--cached"],
            capture_output=True, text=True, timeout=5
        )
        if result.stdout.strip():
            files.update(result.stdout.strip().split("\n"))

        # Untracked new files
        result = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard"],
            capture_output=True, text=True, timeout=5
        )
        if result.stdout.strip():
            files.update(result.stdout.strip().split("\n"))

    except Exception:
        return []

    return list(files)


def check_drift(modified_files):
    """Check if any modified files trigger documentation updates."""
    drift_warnings = {}

    for filepath in modified_files:
        for pattern, doc_files in TRIGGER_MATRIX.items():
            if filepath.startswith(pattern):
                for doc_file in doc_files:
                    if doc_file not in drift_warnings:
                        drift_warnings[doc_file] = []
                    drift_warnings[doc_file].append(filepath)

    return drift_warnings


def main():
    modified_files = get_modified_files()

    if not modified_files:
        sys.exit(0)

    # Only check code files, not docs/config themselves
    code_files = [
        f for f in modified_files
        if not f.startswith((".github/", ".claude/", "docs/", "scripts/claude_"))
        and not f.endswith((".md", ".json", ".yaml", ".yml"))
        or f.startswith(("app/", "src/", "migrations/"))
    ]

    if not code_files:
        sys.exit(0)

    drift_warnings = check_drift(code_files)

    if drift_warnings:
        print("DOCUMENTATION DRIFT CHECK — Action Required")
        print("=" * 50)
        print()
        print("Code changes detected that may require documentation updates:")
        print()
        for doc_file, source_files in sorted(drift_warnings.items()):
            print(f"  {doc_file}")
            for sf in sorted(set(source_files)):
                print(f"    <- {sf}")
            print()
        print("Before finishing, verify these documentation files are still")
        print("accurate. If they need updates, make them now. If no update")
        print("is needed, briefly acknowledge why in your response.")
        print()
        print("Also run: python scripts/validate_api.py --imports")
        # Exit 1 = force Claude to continue and address this
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
