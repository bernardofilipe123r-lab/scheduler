#!/usr/bin/env python3
"""
Reviewer Guardrails — deterministic enforcement of critical code patterns.
Scoped to changed files for performance. Runs in CI on every push/PR.

Usage:
    python scripts/reviewer_guardrails.py                    # Check uncommitted changes
    python scripts/reviewer_guardrails.py --base main        # Check diff vs main branch
    python scripts/reviewer_guardrails.py --all              # Check all files (slow)

Exit codes:
    0 = No violations
    1 = Critical violations found (CI should fail)

Checks:
    1. Hardcoded brand names/colors/IDs (dynamic architecture violation)
    2. React hooks after early return (crash in production)
    3. Model columns without migration SQL in same diff
    4. API routes missing auth dependency
    5. Platform changes without legal page updates
"""
import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

# ── Colours ──────────────────────────────────────────────────
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BOLD = "\033[1m"
RESET = "\033[0m"

passed = 0
failed = 0
warnings = 0


def ok(msg):
    global passed
    passed += 1
    print(f"  {GREEN}✓{RESET} {msg}")


def fail(msg):
    global failed
    failed += 1
    print(f"  {RED}✗{RESET} {msg}")


def warn(msg):
    global warnings
    warnings += 1
    print(f"  {YELLOW}⚠{RESET} {msg}")


def get_changed_files(base=None):
    """Get list of changed files."""
    try:
        if base:
            result = subprocess.run(
                ["git", "diff", "--name-only", "--diff-filter=ACMR", base],
                capture_output=True, text=True, check=True
            )
        else:
            # Uncommitted + staged changes
            result = subprocess.run(
                ["git", "diff", "--name-only", "--diff-filter=ACMR", "HEAD~1"],
                capture_output=True, text=True, check=True
            )
        return [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
    except subprocess.CalledProcessError:
        # Fallback: all tracked files
        result = subprocess.run(
            ["git", "ls-files"], capture_output=True, text=True, check=True
        )
        return [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]


def read_file_safe(path):
    """Read a file, return empty string if it doesn't exist."""
    p = ROOT / path
    if p.exists():
        return p.read_text(encoding="utf-8", errors="replace")
    return ""


# ═══════════════════════════════════════════════════════════════
# CHECK 1: Hardcoded brand names/colors/IDs
# ═══════════════════════════════════════════════════════════════
HARDCODED_BRAND_PATTERNS = [
    # Known brand names that should never be hardcoded
    r'\b(?:Healveth|healveth)\b',
    # Hardcoded color arrays indexed by brand
    r'BRAND_PALETTE\s*\[',
    # Hardcoded brand ID checks
    r'brand_id\s*==\s*["\'][0-9a-f-]+["\']',
    r'if\s+brand\.name\s*==',
]

# Files/dirs where hardcoded brand refs are acceptable
BRAND_CHECK_SKIP = {
    "scripts/", ".github/", "docs/", "migrations/", "README",
    "REGISTRATION_ONBOARDING", "node_modules/", "dist/", ".git/",
    "validate_customization_drift", "reviewer_guardrails",
}


def check_hardcoded_brands(changed_files):
    print(f"\n{BOLD}━━━ Dynamic Architecture: Hardcoded Brand Detection ━━━{RESET}")

    violations = 0
    for f in changed_files:
        if any(skip in f for skip in BRAND_CHECK_SKIP):
            continue
        if not (f.endswith(".py") or f.endswith(".tsx") or f.endswith(".ts")):
            continue

        content = read_file_safe(f)
        if not content:
            continue

        lines = content.split("\n")
        in_docstring = False
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            # Track Python triple-quote docstrings
            if f.endswith(".py"):
                triple_count = line.count('"""') + line.count("'''")
                if triple_count == 1:
                    in_docstring = not in_docstring
                elif triple_count >= 2:
                    pass  # open+close on same line, not inside docstring
            if in_docstring:
                continue
            # Skip comments
            if stripped.startswith("#") or stripped.startswith("//") or stripped.startswith("*"):
                continue
            # Skip string literals used as examples/prompts
            if stripped.startswith(('"', "'", 'f"', "f'")):
                continue
            for pattern in HARDCODED_BRAND_PATTERNS:
                if re.search(pattern, line):
                    fail(f"Hardcoded brand ref in {f}:{i} — {stripped[:80]}")
                    violations += 1

    if violations == 0:
        ok("No hardcoded brand names/colors/IDs found")


# ═══════════════════════════════════════════════════════════════
# CHECK 2: React hooks after early return
# ═══════════════════════════════════════════════════════════════
HOOK_PATTERN = re.compile(
    r'\b(useState|useEffect|useMemo|useCallback|useRef|useContext|'
    r'useReducer|useQuery|useMutation|useQueryClient|'
    r'useDynamicBrands|useBillingGate|useSupabase|useNavigate|useParams|useLocation)\s*\('
)
EARLY_RETURN_PATTERN = re.compile(r'^\s*if\s*\(.+\)\s*return\b')


def check_hooks_after_return(changed_files):
    print(f"\n{BOLD}━━━ React Rules of Hooks ━━━{RESET}")

    tsx_files = [f for f in changed_files if f.endswith(".tsx")]
    if not tsx_files:
        ok("No .tsx files changed")
        return

    violations = 0
    for f in tsx_files:
        content = read_file_safe(f)
        if not content:
            continue

        lines = content.split("\n")
        # Track component-level early returns only (not inside callbacks)
        in_component = False
        seen_early_return = False
        brace_depth = 0
        component_start_depth = 0

        for i, line in enumerate(lines, 1):
            # Detect component/function declarations (PascalCase = component)
            if re.search(r'^\s*(export\s+)?(default\s+)?function\s+[A-Z]\w*', line) or \
               re.search(r'^\s*(export\s+)?(const|let)\s+[A-Z]\w*\s*[:=]', line):
                in_component = True
                seen_early_return = False
                component_start_depth = brace_depth

            brace_depth += line.count("{") - line.count("}")

            if brace_depth <= component_start_depth and in_component:
                in_component = False
                seen_early_return = False

            # Only count early returns at component body level (depth == start + 1)
            # This excludes returns inside callbacks (useEffect, useMemo, etc.)
            if in_component and brace_depth == component_start_depth + 1 and EARLY_RETURN_PATTERN.search(line):
                seen_early_return = True

            if in_component and seen_early_return and brace_depth == component_start_depth + 1 and HOOK_PATTERN.search(line):
                # Skip if inside a comment
                stripped = line.strip()
                if stripped.startswith("//") or stripped.startswith("*"):
                    continue
                fail(f"Hook after early return in {f}:{i} — {stripped[:80]}")
                violations += 1

    if violations == 0:
        ok("No hooks-after-return violations in changed .tsx files")


# ═══════════════════════════════════════════════════════════════
# CHECK 3: Model changes without migrations
# ═══════════════════════════════════════════════════════════════
def check_model_migration_pairing(changed_files):
    print(f"\n{BOLD}━━━ Model Changes vs Migration Pairing ━━━{RESET}")

    model_changes = [f for f in changed_files if f.startswith("app/models/") and f.endswith(".py")]
    migration_changes = [f for f in changed_files if f.startswith("migrations/")]

    # Skip non-schema model files
    SKIP_MODELS = {"app/models/__init__.py", "app/models/base.py", "app/models/config.py"}
    model_changes = [f for f in model_changes if f not in SKIP_MODELS]

    if not model_changes:
        ok("No model files changed")
        return

    # Check if model changes include new Column definitions
    column_change = False
    for f in model_changes:
        content = read_file_safe(f)
        # Look for Column() definitions being added
        if "Column(" in content:
            column_change = True

    if column_change and not migration_changes:
        fail(f"Model files changed ({', '.join(model_changes)}) but no migration in this diff")
        warn("If columns were added/modified, run the migration SQL first!")
    elif column_change and migration_changes:
        ok(f"Model changes paired with migrations ({', '.join(migration_changes)})")
    else:
        ok("Model changes don't appear to add/modify columns")


# ═══════════════════════════════════════════════════════════════
# CHECK 4: API routes missing auth
# ═══════════════════════════════════════════════════════════════
# Routes that legitimately skip auth
NO_AUTH_ROUTES = {
    "health_routes", "status_routes", "webhook",
    "legal_routes",  # Public endpoints (Meta data deletion callback)
}


def check_api_auth(changed_files):
    print(f"\n{BOLD}━━━ API Route Auth Checks ━━━{RESET}")

    route_files = [
        f for f in changed_files
        if f.startswith("app/api/") and f.endswith(".py")
        and "middleware" not in f and "__init__" not in f
    ]

    if not route_files:
        ok("No API route files changed")
        return

    for f in route_files:
        basename = Path(f).stem
        if any(skip in basename for skip in NO_AUTH_ROUTES):
            continue

        content = read_file_safe(f)
        if not content:
            continue

        # Check if file has route decorators but no auth dependency
        has_routes = bool(re.search(r'@router\.(get|post|put|patch|delete)', content))
        has_auth = "get_current_user" in content or "Depends(" in content

        if has_routes and not has_auth:
            # Webhook routes use signature verification instead
            if "webhook" in basename.lower() or "stripe" in content.lower():
                ok(f"Route '{basename}' uses webhook signature auth (OK)")
            else:
                fail(f"Route '{basename}' has endpoints but no auth dependency (get_current_user)")
        elif has_routes:
            ok(f"Route '{basename}' has auth dependency")


# ═══════════════════════════════════════════════════════════════
# CHECK 5: Platform changes without legal page updates
# ═══════════════════════════════════════════════════════════════
def check_legal_page_sync(changed_files):
    print(f"\n{BOLD}━━━ Platform Integration vs Legal Pages ━━━{RESET}")

    # Detect new platform integration files
    platform_files = [
        f for f in changed_files
        if ("oauth" in f.lower() or "token_service" in f.lower() or "publisher" in f.lower())
        and f.endswith(".py")
    ]

    legal_files = [
        f for f in changed_files
        if any(legal in f for legal in ["Terms.tsx", "PrivacyPolicy.tsx", "DataDeletion.tsx"])
    ]

    if not platform_files:
        ok("No platform integration files changed")
        return

    if not legal_files:
        fail(f"Platform files changed ({', '.join(Path(f).name for f in platform_files)}) but NO legal pages updated")
        warn("Update Terms.tsx, PrivacyPolicy.tsx, and DataDeletion.tsx when changing platform integrations")
    else:
        ok(f"Platform changes paired with legal page updates ({', '.join(Path(f).name for f in legal_files)})")


# ═══════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════
def main():
    parser = argparse.ArgumentParser(description="Reviewer guardrails — deterministic code review")
    parser.add_argument("--base", default=None, help="Git base branch/ref to diff against")
    parser.add_argument("--all", action="store_true", help="Check ALL files, not just changed ones")
    args = parser.parse_args()

    print(f"\n{BOLD}{'=' * 60}{RESET}")
    print(f"{BOLD}  REVIEWER GUARDRAILS — Deterministic Code Review{RESET}")
    print(f"{BOLD}{'=' * 60}{RESET}")

    if args.all:
        # List all tracked files
        result = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True)
        changed_files = [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
        print(f"  Checking ALL {len(changed_files)} tracked files")
    else:
        changed_files = get_changed_files(args.base)
        print(f"  Checking {len(changed_files)} changed files")

    if not changed_files:
        print("  No files to check.")
        sys.exit(0)

    check_hardcoded_brands(changed_files)
    check_hooks_after_return(changed_files)
    check_model_migration_pairing(changed_files)
    check_api_auth(changed_files)
    check_legal_page_sync(changed_files)

    print(f"\n{BOLD}{'=' * 60}{RESET}")
    color = GREEN if failed == 0 else RED
    print(f"{BOLD}  RESULTS: {GREEN}{passed} passed{RESET}, {color}{failed} failed{RESET}, {YELLOW}{warnings} warnings{RESET}")
    print(f"{BOLD}{'=' * 60}{RESET}\n")

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
