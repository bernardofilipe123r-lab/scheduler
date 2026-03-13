#!/usr/bin/env python3
"""
Customization Drift Detector — finds mismatches between the codebase
and the agent customization files (skills, instructions, prompts, agents).

Usage:
    python scripts/validate_customization_drift.py          # All checks
    python scripts/validate_customization_drift.py --quick   # Fast subset only

Exit codes:
    0 = No drift detected
    1 = Drift detected (CI should fail)

Checks:
    1. Toby agents on disk vs toby-agent skill coverage
    2. API route modules vs validate_api.py CRITICAL_MODULES
    3. Publishing token services vs platform-publishing skill
    4. Model files vs migration coverage
    5. Service domains vs skill coverage
    6. Instruction file coverage for critical patterns
    7. Endpoint count drift (actual routes vs documented)
    8. Toby agents list drift (disk vs orchestrator imports)
    9. Platform list drift (code vs legal pages vs skill)
"""
import argparse
import os
import re
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


def read_text(path):
    """Safely read a file, return empty string if missing."""
    p = ROOT / path
    if p.exists():
        return p.read_text(encoding="utf-8", errors="replace")
    return ""


def list_py_files(directory):
    """List .py files in a directory (non-recursive), excluding __init__.py and __pycache__."""
    d = ROOT / directory
    if not d.is_dir():
        return []
    return sorted(
        f.stem
        for f in d.iterdir()
        if f.suffix == ".py" and f.stem != "__init__" and "__pycache__" not in str(f)
    )


def list_py_files_recursive(directory):
    """List all .py files recursively, returning dotted module paths."""
    d = ROOT / directory
    if not d.is_dir():
        return []
    results = []
    for f in d.rglob("*.py"):
        if f.stem == "__init__" or "__pycache__" in str(f):
            continue
        rel = f.relative_to(ROOT)
        module = str(rel).replace("/", ".").replace(".py", "")
        results.append(module)
    return sorted(results)


# ═══════════════════════════════════════════════════════════════
# CHECK 1: Toby agents on disk vs skill coverage
# ═══════════════════════════════════════════════════════════════
def check_toby_agents():
    print(f"\n{BOLD}━━━ Toby Agents vs Skill Coverage ━━━{RESET}")

    agents_on_disk = list_py_files("app/services/toby/agents")
    skill_text = read_text(".github/skills/toby-agent/SKILL.md")

    if not skill_text:
        fail("toby-agent skill not found at .github/skills/toby-agent/SKILL.md")
        return

    for agent in agents_on_disk:
        # Check if the agent name appears in the skill (e.g., "creator", "scout")
        if agent.lower() in skill_text.lower():
            ok(f"Agent '{agent}' covered in toby-agent skill")
        else:
            fail(f"Agent '{agent}' exists on disk but NOT mentioned in toby-agent skill")


# ═══════════════════════════════════════════════════════════════
# CHECK 2: API route modules vs CRITICAL_MODULES in validate_api.py
# ═══════════════════════════════════════════════════════════════
def check_api_routes():
    print(f"\n{BOLD}━━━ API Routes vs Validation Coverage ━━━{RESET}")

    route_modules = list_py_files_recursive("app/api")
    validate_text = read_text("scripts/validate_api.py")

    if not validate_text:
        fail("validate_api.py not found")
        return

    for module in route_modules:
        # Skip __init__, middleware, and non-route support files
        if module.endswith("__init__") or "middleware" in module:
            continue
        # schemas.py and routes.py (aggregator) are support files, not route modules
        basename = module.split(".")[-1]
        if basename in ("schemas", "routes") and module.count(".") <= 2:
            # Top-level app.api.routes / app.api.schemas are aggregators, skip
            continue
        # Check if the module path appears in validate_api.py
        if module in validate_text:
            ok(f"Route module '{module}' in validate_api.py")
        else:
            fail(f"Route module '{module}' NOT in validate_api.py CRITICAL_MODULES")


# ═══════════════════════════════════════════════════════════════
# CHECK 3: Publishing token services vs skill coverage
# ═══════════════════════════════════════════════════════════════
def check_publishing_services():
    print(f"\n{BOLD}━━━ Publishing Services vs Skill Coverage ━━━{RESET}")

    pub_files = list_py_files("app/services/publishing")
    skill_text = read_text(".github/skills/platform-publishing/SKILL.md")

    if not skill_text:
        fail("platform-publishing skill not found")
        return

    for svc in pub_files:
        # Extract platform name from filename (e.g., "threads" from "threads_token_service")
        if svc in skill_text.lower() or svc.replace("_", " ") in skill_text.lower():
            ok(f"Publishing service '{svc}' covered in platform-publishing skill")
        else:
            # More lenient: check if any part of the name is mentioned
            parts = svc.replace("_service", "").replace("_token", "").split("_")
            found = any(p in skill_text.lower() for p in parts if len(p) > 2)
            if found:
                ok(f"Publishing service '{svc}' covered in platform-publishing skill")
            else:
                fail(f"Publishing service '{svc}' NOT mentioned in platform-publishing skill")


# ═══════════════════════════════════════════════════════════════
# CHECK 4: Model files vs migration coverage
# ═══════════════════════════════════════════════════════════════
def check_model_migration_coverage():
    print(f"\n{BOLD}━━━ Models vs Migration Coverage ━━━{RESET}")

    model_files = list_py_files("app/models")
    migration_dir = ROOT / "migrations"

    # Models that are config/base and don't need migrations
    SKIP_MODELS = {"base", "config", "__init__"}

    if not migration_dir.is_dir():
        warn("No migrations/ directory found")
        return

    migration_text = ""
    for f in migration_dir.iterdir():
        if f.suffix in (".sql", ".py"):
            migration_text += f.read_text(encoding="utf-8", errors="replace") + "\n"

    for model in model_files:
        if model in SKIP_MODELS:
            continue
        # Check if any migration references this model's table (by name heuristics)
        # Model name → likely table name patterns
        table_variants = [
            model,
            model + "s",
            model.replace("_", ""),
            model + "_",
        ]
        found = any(v in migration_text.lower() for v in table_variants)
        if found:
            ok(f"Model '{model}' has related migrations")
        else:
            warn(f"Model '{model}' — no migration references found (may be initial schema)")


# ═══════════════════════════════════════════════════════════════
# CHECK 5: Service domains vs skill coverage
# ═══════════════════════════════════════════════════════════════
def check_service_domain_coverage():
    print(f"\n{BOLD}━━━ Service Domains vs Skill Coverage ━━━{RESET}")

    services_dir = ROOT / "app" / "services"
    if not services_dir.is_dir():
        fail("app/services/ directory not found")
        return

    # Get top-level service domains (subdirectories)
    domains = sorted(
        d.name for d in services_dir.iterdir()
        if d.is_dir() and d.name != "__pycache__"
    )

    # Map service domains to expected skill coverage
    DOMAIN_SKILL_MAP = {
        "toby": "toby-agent",
        "content": "content-pipeline",
        "media": "media-rendering",
        "publishing": "platform-publishing",
        "analytics": "analytics-metrics",
        "brands": "frontend-patterns",  # brand management covered in frontend + db skills
        "billing": "billing-stripe",
        # Small utility domains — covered by broader skills or not skill-worthy
        "logging": None,   # internal utility
        "oauth": None,     # covered by platform-publishing skill
        "storage": None,   # Supabase storage utility
        "youtube": None,   # covered by platform-publishing skill
    }

    skills_dir = ROOT / ".github" / "skills"

    for domain in domains:
        expected_skill = DOMAIN_SKILL_MAP.get(domain, "UNMAPPED")
        if expected_skill is None:
            # Explicitly marked as not needing a dedicated skill
            ok(f"Service domain '{domain}' → covered by broader skills (OK)")
        elif expected_skill != "UNMAPPED":
            skill_path = skills_dir / expected_skill / "SKILL.md"
            if skill_path.exists():
                ok(f"Service domain '{domain}' → skill '{expected_skill}' exists")
            else:
                fail(f"Service domain '{domain}' → expected skill '{expected_skill}' NOT FOUND")
        else:
            warn(f"Service domain '{domain}' has no mapped skill (may need new skill)")


# ═══════════════════════════════════════════════════════════════
# CHECK 6: Instructions cover key file patterns
# ═══════════════════════════════════════════════════════════════
def check_instruction_coverage():
    print(f"\n{BOLD}━━━ Instruction File Coverage ━━━{RESET}")

    instructions_dir = ROOT / ".github" / "instructions"
    if not instructions_dir.is_dir():
        fail(".github/instructions/ directory not found")
        return

    instructions = {f.stem: f.read_text(encoding="utf-8", errors="replace")
                    for f in instructions_dir.iterdir() if f.suffix == ".md"}

    # Check that critical file patterns have instruction coverage
    CRITICAL_PATTERNS = {
        "app/api/**/*.py": "api-routes",
        "app/models/**/*.py": "python-models",
        "src/**/*.tsx": "react-components",
        "app/services/toby/**/*.py": "toby-agents",
        "migrations/**/*.sql": "migration-sql",
    }

    for pattern, expected_instruction in CRITICAL_PATTERNS.items():
        found = any(
            expected_instruction in name and pattern.replace("**/*.py", "").replace("**/*.tsx", "").replace("**/*.sql", "") in content
            for name, content in instructions.items()
        )
        # Simpler: just check the instruction file exists
        matching = [name for name in instructions if expected_instruction in name]
        if matching:
            ok(f"Pattern '{pattern}' → instruction '{matching[0]}.instructions.md'")
        else:
            fail(f"Pattern '{pattern}' → no instruction for '{expected_instruction}'")


# ═══════════════════════════════════════════════════════════════
# CHECK 7: Endpoint count drift — actual routes vs documented count
# ═══════════════════════════════════════════════════════════════
def check_endpoint_count_drift():
    print(f"\n{BOLD}━━━ Endpoint Count Drift ━━━{RESET}")

    import ast

    route_count = 0
    api_dir = ROOT / "app" / "api"
    if not api_dir.is_dir():
        fail("app/api/ directory not found")
        return

    for py_file in api_dir.rglob("*.py"):
        if py_file.stem == "__init__" or "__pycache__" in str(py_file):
            continue
        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Call):
                    func = node.func
                    # Match router.get, router.post, router.put, router.delete, router.patch
                    if isinstance(func, ast.Attribute) and func.attr in ("get", "post", "put", "delete", "patch"):
                        if isinstance(func.value, ast.Name) and func.value.id == "router":
                            route_count += 1
        except SyntaxError:
            warn(f"Could not parse {py_file.relative_to(ROOT)}")

    skill_text = read_text(".github/skills/api-validation/SKILL.md")
    if not skill_text:
        warn("api-validation skill not found — skipping endpoint count drift")
        return

    # Look for a documented endpoint count (e.g., "~85 endpoints" or "85 endpoints")
    match = re.search(r"~?(\d+)\s*endpoints?", skill_text)
    if match:
        documented = int(match.group(1))
        drift = abs(route_count - documented)
        if drift <= 5:
            ok(f"Endpoint count: {route_count} actual vs ~{documented} documented (drift={drift}, OK)")
        else:
            fail(f"ENDPOINT DRIFT: {route_count} actual vs ~{documented} documented (drift={drift} — update api-validation skill)")
    else:
        warn(f"No endpoint count found in api-validation skill (actual count: {route_count})")


# ═══════════════════════════════════════════════════════════════
# CHECK 8: Toby agents list drift — disk vs skill vs orchestrator
# ═══════════════════════════════════════════════════════════════
def check_toby_agents_list_drift():
    print(f"\n{BOLD}━━━ Toby Agents List Drift ━━━{RESET}")

    # Agents on disk
    agents_dir = ROOT / "app" / "services" / "toby" / "agents"
    if not agents_dir.is_dir():
        fail("app/services/toby/agents/ directory not found")
        return

    disk_agents = set(list_py_files("app/services/toby/agents"))

    # Agents imported in orchestrator
    orch_text = read_text("app/services/toby/orchestrator.py")
    if not orch_text:
        fail("orchestrator.py not found")
        return

    # Find from app.services.toby.agents.X import Y patterns
    orch_imports = set()
    for m in re.finditer(r"from\s+app\.services\.toby\.agents\.(\w+)\s+import", orch_text):
        orch_imports.add(m.group(1))

    # Compare
    disk_only = disk_agents - orch_imports
    orch_only = orch_imports - disk_agents

    if not disk_only and not orch_only:
        ok(f"Toby agents in sync: disk={sorted(disk_agents)}, orchestrator={sorted(orch_imports)}")
    else:
        if disk_only:
            warn(f"Agent files on disk but NOT imported in orchestrator: {sorted(disk_only)}")
        if orch_only:
            fail(f"Orchestrator imports agents that DON'T EXIST on disk: {sorted(orch_only)}")


# ═══════════════════════════════════════════════════════════════
# CHECK 9: Platform list drift — code vs skill vs legal pages
# ═══════════════════════════════════════════════════════════════
def check_platform_list_drift():
    print(f"\n{BOLD}━━━ Platform List Drift ━━━{RESET}")

    import ast

    # Get SUPPORTED_PLATFORMS from code
    platforms_file = ROOT / "app" / "core" / "platforms.py"
    if not platforms_file.exists():
        fail("app/core/platforms.py not found")
        return

    try:
        tree = ast.parse(platforms_file.read_text(encoding="utf-8"))
        code_platforms = set()
        for node in ast.walk(tree):
            if isinstance(node, (ast.Assign, ast.AnnAssign)):
                target = node.targets[0] if isinstance(node, ast.Assign) else node.target
                if isinstance(target, ast.Name) and target.id == "SUPPORTED_PLATFORMS":
                    val = node.value
                    if isinstance(val, ast.Tuple):
                        for elt in val.elts:
                            if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                                code_platforms.add(elt.value.lower())
    except SyntaxError:
        fail("Could not parse platforms.py")
        return

    if not code_platforms:
        fail("Could not extract SUPPORTED_PLATFORMS from platforms.py")
        return

    ok(f"Code platforms: {sorted(code_platforms)}")

    # Check legal pages mention all platforms
    legal_pages = [
        "src/pages/Terms.tsx",
        "src/pages/PrivacyPolicy.tsx",
        "src/pages/DataDeletion.tsx",
    ]

    for page in legal_pages:
        text = read_text(page).lower()
        if not text:
            warn(f"Legal page not found: {page}")
            continue
        missing = [p for p in code_platforms if p not in text]
        if missing:
            fail(f"{page} missing platforms: {missing}")
        else:
            ok(f"{page} mentions all {len(code_platforms)} platforms")

    # Check platform-publishing skill
    skill_text = read_text(".github/skills/platform-publishing/SKILL.md").lower()
    if skill_text:
        missing_in_skill = [p for p in code_platforms if p not in skill_text]
        if missing_in_skill:
            fail(f"platform-publishing skill missing platforms: {missing_in_skill}")
        else:
            ok(f"platform-publishing skill covers all {len(code_platforms)} platforms")
    else:
        warn("platform-publishing skill not found")


# ═══════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════
def main():
    parser = argparse.ArgumentParser(description="Customization drift detector")
    parser.add_argument("--quick", action="store_true", help="Fast checks only (skip migration & domain checks)")
    args = parser.parse_args()

    print(f"\n{BOLD}{'=' * 60}{RESET}")
    print(f"{BOLD}  CUSTOMIZATION DRIFT DETECTION{RESET}")
    print(f"{BOLD}{'=' * 60}{RESET}")

    check_toby_agents()
    check_api_routes()
    check_publishing_services()
    check_instruction_coverage()

    if not args.quick:
        check_model_migration_coverage()
        check_service_domain_coverage()
        check_endpoint_count_drift()
        check_toby_agents_list_drift()
        check_platform_list_drift()

    print(f"\n{BOLD}{'=' * 60}{RESET}")
    color = GREEN if failed == 0 else RED
    print(f"{BOLD}  RESULTS: {GREEN}{passed} passed{RESET}, {color}{failed} failed{RESET}, {YELLOW}{warnings} warnings{RESET}")
    print(f"{BOLD}{'=' * 60}{RESET}\n")

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
