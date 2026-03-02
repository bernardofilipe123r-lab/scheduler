#!/usr/bin/env python3
"""
Onboarding Flow Validation Script — catches common onboarding bugs
before they reach production.

Usage:
    python scripts/validate_onboarding.py              # Run all checks
    python scripts/validate_onboarding.py --frontend   # Frontend-only checks
    python scripts/validate_onboarding.py --backend    # Backend endpoint checks

Checks performed:
  1. Frontend step ordering & consistency (STEP_INFO matches JSX blocks)
  2. React hooks placement (no hooks after early returns)
  3. Error handling patterns (no bare 'instanceof Error' for API errors)
  4. 409 conflict recovery logic exists
  5. Loading-aware guards (prevent race conditions)
  6. Backend endpoint smoke tests (409 returns detail, auth guards work)
  7. Cross-step navigation consistency (footer buttons match step numbers)
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# ── Colours ──
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BOLD = "\033[1m"
RESET = "\033[0m"

passed = 0
failed = 0
warnings = 0


def ok(label: str, detail: str = ""):
    global passed
    passed += 1
    print(f"  {GREEN}✓{RESET} {label}" + (f"  ({detail})" if detail else ""))


def fail(label: str, detail: str = ""):
    global failed
    failed += 1
    print(f"  {RED}✗{RESET} {label}" + (f"  — {detail}" if detail else ""))


def warn(label: str, detail: str = ""):
    global warnings
    warnings += 1
    print(f"  {YELLOW}⚠{RESET} {label}" + (f"  — {detail}" if detail else ""))


# ═══════════════════════════════════════════════════════════════
# FRONTEND CHECKS
# ═══════════════════════════════════════════════════════════════

ONBOARDING_FILE = ROOT / "src" / "pages" / "Onboarding.tsx"

# Expected step order — update this when reordering steps
EXPECTED_STEPS = [
    (1, "brand", "Create"),
    (2, "theme", "Theme"),
    (3, "platform", "Connect"),
    (4, "dna", "Content DNA"),
    (5, "reel", "Reel"),
    (6, "carousel", "Carousel|Post"),
]


def check_frontend():
    print(f"\n{BOLD}── Frontend: Onboarding.tsx ──{RESET}")

    if not ONBOARDING_FILE.exists():
        fail("Onboarding.tsx exists", f"Not found at {ONBOARDING_FILE}")
        return

    src = ONBOARDING_FILE.read_text()
    lines = src.split("\n")

    # ── 1. STEP_INFO array matches expected steps ──
    print(f"\n  {BOLD}Step ordering:{RESET}")
    step_info_match = re.search(
        r"const STEP_INFO.*?=\s*\[(.*?)\]", src, re.DOTALL
    )
    if not step_info_match:
        fail("STEP_INFO array found")
    else:
        step_block = step_info_match.group(1)
        # Extract num values
        nums = [int(m) for m in re.findall(r"num:\s*(\d+)", step_block)]
        labels = re.findall(r"label:\s*'([^']*)'", step_block)
        if nums == [1, 2, 3, 4, 5, 6]:
            ok("STEP_INFO has steps 1-6 in order")
        else:
            fail("STEP_INFO step numbers", f"Got {nums}, expected [1,2,3,4,5,6]")

        # Check labels roughly match expected
        for i, (num, keyword, label_hint) in enumerate(EXPECTED_STEPS):
            if i < len(labels):
                if re.search(label_hint, labels[i], re.IGNORECASE):
                    ok(f"Step {num} label matches '{label_hint}'", labels[i])
                else:
                    fail(
                        f"Step {num} label matches '{label_hint}'",
                        f"Got '{labels[i]}'",
                    )
            else:
                fail(f"Step {num} label exists", "STEP_INFO too short")

    # ── 2. JSX step blocks: verify each step === N exists ──
    print(f"\n  {BOLD}JSX step blocks:{RESET}")
    for num, keyword, _ in EXPECTED_STEPS:
        # Pattern: {step === N && (
        pattern = rf"\{{step\s*===\s*{num}\s*&&\s*\("
        matches = re.findall(pattern, src)
        if matches:
            ok(f"Step {num} JSX block exists", f"{len(matches)} occurrence(s)")
        else:
            fail(f"Step {num} JSX block exists", "Not found")

    # ── 3. Step comment markers match step numbers ──
    print(f"\n  {BOLD}Step comment markers:{RESET}")
    comment_steps = re.findall(r"═══ Step (\d+):", src)
    comment_nums = [int(n) for n in comment_steps]
    if sorted(set(comment_nums)) == [1, 2, 3, 4, 5, 6]:
        ok("All 6 step comment markers present")
    else:
        fail("Step comment markers", f"Found steps {sorted(set(comment_nums))}")

    # ── 4. No hooks after early returns ──
    print(f"\n  {BOLD}React hooks safety:{RESET}")
    # Instead of fragile regex heuristics, just delegate to ESLint
    # which has the authoritative rules-of-hooks check
    import subprocess

    eslint_result = subprocess.run(
        [
            "npx",
            "eslint",
            str(ONBOARDING_FILE),
            "--rule",
            "react-hooks/rules-of-hooks: error",
            "--format",
            "compact",
        ],
        capture_output=True,
        text=True,
        cwd=str(ROOT),
        timeout=30,
    )
    eslint_errors = [
        line
        for line in eslint_result.stdout.strip().split("\n")
        if "Error" in line and "rules-of-hooks" in line
    ]
    if eslint_errors:
        for err_line in eslint_errors:
            fail("React hooks rules", err_line.strip()[:120])
    else:
        ok("React hooks rules-of-hooks (ESLint)", "no violations")

    # ── 5. Error handling: no bare 'instanceof Error' for API calls ──
    print(f"\n  {BOLD}Error handling patterns:{RESET}")
    instanceof_matches = list(
        re.finditer(r"err\s+instanceof\s+Error\s*\?", src)
    )
    if instanceof_matches:
        for m in instanceof_matches:
            line_num = src[: m.start()].count("\n") + 1
            fail(
                "No bare 'instanceof Error' pattern",
                f"line {line_num} — API errors are plain objects, not Error instances",
            )
    else:
        ok("No bare 'instanceof Error' pattern found")

    # Check getErrorMsg helper exists
    if "getErrorMsg" in src:
        ok("getErrorMsg helper function exists")
    else:
        warn(
            "getErrorMsg helper missing",
            "catch blocks may not extract API error messages correctly",
        )

    # ── 6. 409 conflict recovery ──
    print(f"\n  {BOLD}409 conflict handling:{RESET}")
    if "status === 409" in src or "status=== 409" in src or ".status === 409" in src:
        ok("409 conflict recovery logic exists")
    else:
        fail(
            "409 conflict recovery",
            "handleCreateBrand should detect 409 and auto-advance",
        )

    # ── 7. Loading-aware guards ──
    print(f"\n  {BOLD}Loading-aware guards:{RESET}")
    if "brandsLoading" in src or "isLoading" in src:
        # Check that isStep1Valid includes a loading guard
        step1_valid = re.search(
            r"const isStep1Valid\s*=[\s\S]*?(?=\n\s*\n|\n\s*const\s)", src
        )
        if step1_valid:
            block = step1_valid.group()
            if "brandsLoading" in block or "isLoading" in block or "Loading" in block:
                ok(
                    "isStep1Valid includes loading guard",
                    "prevents race condition",
                )
            else:
                fail(
                    "isStep1Valid loading guard",
                    "brands may still be loading when user clicks Continue",
                )
        else:
            warn("Could not find isStep1Valid definition")
    else:
        fail(
            "Loading-aware guards",
            "no brandsLoading/isLoading found — race condition risk",
        )

    # ── 8. OAuth redirect returns to correct step ──
    print(f"\n  {BOLD}OAuth redirect handling:{RESET}")
    # Look for the useState initializer that checks OAuth params
    oauth_block = re.search(
        r"ig_connected.*?yt_connected.*?return\s+(\d+)", src, re.DOTALL
    )
    if oauth_block:
        step_num = int(oauth_block.group(1))
        if step_num == 3:
            ok("OAuth redirect returns to step 3 (Connect Platforms)")
        else:
            fail(
                "OAuth redirect target",
                f"Returns to step {step_num}, expected 3",
            )
    else:
        warn("Could not find OAuth redirect step logic")

    # ── 9. Footer buttons: every step has a continue/complete button ──
    print(f"\n  {BOLD}Footer navigation:{RESET}")
    for num in range(1, 7):
        pattern = rf"step\s*===\s*{num}\b"
        # Look in the footer section (after "Sticky footer" comment)
        footer_idx = src.find("Sticky footer")
        if footer_idx > 0:
            footer_src = src[footer_idx:]
            if re.search(pattern, footer_src):
                ok(f"Step {num} has footer button logic")
            else:
                # Steps 3-5 may be handled by a range check
                range_pattern = rf"step\s*>=\s*\d+\s*&&\s*step\s*<=\s*\d+"
                range_matches = re.findall(range_pattern, footer_src)
                covered = False
                for rm in range_matches:
                    nums_in_range = [int(x) for x in re.findall(r"\d+", rm)]
                    if len(nums_in_range) >= 2 and nums_in_range[0] <= num <= nums_in_range[1]:
                        covered = True
                        break
                if covered:
                    ok(f"Step {num} covered by range in footer")
                else:
                    fail(f"Step {num} footer button", "No button logic found")
        else:
            warn("Could not find footer section")
            break

    # ── 10. DNA method choice screen (step 4) ──
    print(f"\n  {BOLD}Content DNA choice screen:{RESET}")
    if "dnaMethod" in src:
        ok("dnaMethod state variable exists")
        if "handleDnaMethodAi" in src:
            ok("AI import handler exists")
        else:
            fail("handleDnaMethodAi handler missing")

        if "'manual'" in src and "setDnaMethod('manual')" in src:
            ok("Manual DNA option exists")
        else:
            fail("Manual DNA option", "setDnaMethod('manual') not found")
    else:
        fail("dnaMethod state", "Content DNA choice screen missing")

    # ── 11. Back button resets DNA method ──
    print(f"\n  {BOLD}Back button edge cases:{RESET}")
    if "setDnaMethod(null)" in src:
        ok("Back button resets dnaMethod")
    else:
        warn("Back button may not reset dnaMethod when going back from step 4")

    # ── 12. Auto-advance logic ──
    print(f"\n  {BOLD}Auto-advance logic:{RESET}")
    if re.search(r"if\s*\(step\s*===\s*1\)\s*setStep\(3\)", src):
        ok("Auto-advance from step 1 to step 3 when brand exists")
    else:
        warn("Auto-advance logic not found or changed")

    # ── 13. Complete Setup on last step ──
    print(f"\n  {BOLD}Complete Setup:{RESET}")
    if re.search(r"handleComplete", src):
        ok("handleComplete function referenced")
        # Check it's called on step 6
        complete_pattern = re.search(
            r"step\s*===\s*6[\s\S]{0,500}handleComplete", src
        )
        if complete_pattern:
            ok("handleComplete called on step 6")
        else:
            warn("handleComplete may not be on step 6")
    else:
        fail("handleComplete function missing")


# ═══════════════════════════════════════════════════════════════
# BACKEND CHECKS
# ═══════════════════════════════════════════════════════════════


def _install_mock_packages():
    """Pre-populate sys.modules with lightweight mocks for heavy deps."""
    from unittest.mock import MagicMock

    MOCK_PACKAGES = {
        "PIL": ["Image", "ImageFont", "ImageDraw", "ImageEnhance"],
        "supabase": [],
        "python_multipart": ["multipart"],
    }

    for pkg, submodules in MOCK_PACKAGES.items():
        if pkg in sys.modules:
            continue
        try:
            import importlib as _imp
            _imp.import_module(pkg)
            continue
        except ImportError:
            pass
        mock = MagicMock()
        mock.__version__ = "0.1.0"
        sys.modules[pkg] = mock
        for sub in submodules:
            sub_mock = MagicMock()
            sub_mock.__version__ = "0.1.0"
            sys.modules[f"{pkg}.{sub}"] = sub_mock


def check_backend():
    print(f"\n{BOLD}── Backend: Endpoint Smoke Tests ──{RESET}")

    _install_mock_packages()

    try:
        from starlette.testclient import TestClient
    except ImportError:
        try:
            from fastapi.testclient import TestClient
        except ImportError:
            warn("TestClient not available", "pip install httpx starlette")
            return

    try:
        from app.main import app

        client = TestClient(app, raise_server_exceptions=False)
    except Exception as e:
        fail("FastAPI app boots", str(e))
        return

    ok("FastAPI app boots successfully")

    # ── Auth-required endpoints should return 401/403, not 500 ──
    print(f"\n  {BOLD}Auth guard checks (expect 401/403):{RESET}")
    auth_endpoints = [
        ("GET", "/api/v2/brands"),
        ("GET", "/api/v2/brands/ids"),
        ("POST", "/api/v2/brands"),
        ("GET", "/api/v2/brands/connections"),
        ("GET", "/api/v2/brands/niche-config"),
        ("PUT", "/api/v2/brands/niche-config"),
        ("GET", "/api/auth/instagram/connect"),
        ("GET", "/api/auth/facebook/connect"),
        ("GET", "/api/youtube/connect"),
        ("GET", "/api/auth/threads/connect"),
        ("GET", "/api/auth/tiktok/connect"),
    ]

    for method, path in auth_endpoints:
        try:
            if method == "GET":
                resp = client.get(path)
            elif method == "POST":
                resp = client.post(path, json={})
            elif method == "PUT":
                resp = client.put(path, json={})
            else:
                resp = client.request(method, path)

            if resp.status_code in (401, 403):
                ok(f"{method} {path}", f"{resp.status_code}")
            elif resp.status_code == 500:
                fail(
                    f"{method} {path}",
                    f"500 Server Error (should be 401/403)",
                )
            else:
                warn(
                    f"{method} {path}",
                    f"Unexpected {resp.status_code} (expected 401/403)",
                )
        except Exception as e:
            fail(f"{method} {path}", str(e)[:100])

    # ── Brand creation 409 check: POST with duplicate ID ──
    print(f"\n  {BOLD}409 conflict response format:{RESET}")
    # We can't actually test authenticated flows without a token,
    # but we can verify the route file has proper 409 handling
    brands_routes = ROOT / "app" / "api" / "brands" / "routes.py"
    if brands_routes.exists():
        routes_src = brands_routes.read_text()
        if "status_code=409" in routes_src:
            ok("Brand creation has 409 conflict handling")
            if "detail=" in routes_src:
                ok("409 response includes detail message")
            else:
                fail("409 response detail", "Should include helpful detail message")
        else:
            fail("Brand creation 409 handling", "No 409 status code found")
    else:
        warn("brands/routes.py not found")

    # ── Niche config import endpoint exists ──
    print(f"\n  {BOLD}Niche config endpoints:{RESET}")
    nc_routes = ROOT / "app" / "api" / "niche_config_routes.py"
    if nc_routes.exists():
        nc_src = nc_routes.read_text()
        if "import-from-instagram" in nc_src:
            ok("Import from Instagram endpoint exists")
        else:
            fail("Import from Instagram endpoint missing")
        if "ai-understanding" in nc_src:
            ok("AI understanding endpoint exists")
        else:
            warn("AI understanding endpoint missing")
    else:
        fail("niche_config_routes.py not found")

    # ── OAuth connect endpoints exist ──
    print(f"\n  {BOLD}OAuth connect endpoints:{RESET}")
    oauth_files = {
        "Instagram": ROOT / "app" / "api" / "auth" / "ig_oauth_routes.py",
        "Facebook": ROOT / "app" / "api" / "auth" / "fb_oauth_routes.py",
        "YouTube": ROOT / "app" / "api" / "youtube" / "routes.py",
        "Threads": ROOT / "app" / "api" / "auth" / "threads_oauth_routes.py",
        "TikTok": ROOT / "app" / "api" / "auth" / "tiktok_oauth_routes.py",
    }
    for name, filepath in oauth_files.items():
        if filepath.exists():
            content = filepath.read_text()
            if "/connect" in content:
                ok(f"{name} OAuth connect endpoint exists")
            else:
                fail(f"{name} OAuth connect endpoint", "No /connect route found")
        else:
            warn(f"{name} OAuth file not found: {filepath.name}")


# ═══════════════════════════════════════════════════════════════
# CLIENT ERROR HANDLING CHECK
# ═══════════════════════════════════════════════════════════════


def check_client_error_handling():
    """Verify the API client throws errors that catch blocks can handle."""
    print(f"\n{BOLD}── API Client Error Patterns ──{RESET}")

    client_file = ROOT / "src" / "shared" / "api" / "client.ts"
    if not client_file.exists():
        fail("client.ts exists", str(client_file))
        return

    client_src = client_file.read_text()

    # The error thrown should have a .message property
    if re.search(r"throw\s+error", client_src) or re.search(
        r"throw\s+\{", client_src
    ):
        ok("API client throws error objects")
    else:
        warn("Could not verify API client error throwing pattern")

    # Check that ApiError interface has message
    if "message: string" in client_src:
        ok("ApiError has message field")
    else:
        fail("ApiError message field", "Error objects need .message for catch blocks")

    # Check that apiClient is exported
    if "export const apiClient" in client_src or "export { apiClient" in client_src:
        ok("apiClient is exported")
    else:
        fail("apiClient export", "Needed for direct API calls in 409 recovery")


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate onboarding flow")
    parser.add_argument(
        "--frontend", action="store_true", help="Frontend checks only"
    )
    parser.add_argument(
        "--backend", action="store_true", help="Backend checks only"
    )
    args = parser.parse_args()

    run_all = not args.frontend and not args.backend

    print(f"\n{BOLD}{'═' * 50}")
    print(f"  Onboarding Flow Validation")
    print(f"{'═' * 50}{RESET}")

    if run_all or args.frontend:
        check_frontend()
        check_client_error_handling()
    if run_all or args.backend:
        check_backend()

    print(f"\n{BOLD}{'─' * 50}{RESET}")
    print(
        f"  {GREEN}{passed} passed{RESET}  "
        f"{RED}{failed} failed{RESET}  "
        f"{YELLOW}{warnings} warnings{RESET}"
    )
    print(f"{'─' * 50}\n")

    if failed > 0:
        print(f"{RED}✗ Onboarding validation FAILED — fix {failed} issue(s) before committing.{RESET}\n")
        sys.exit(1)
    else:
        print(f"{GREEN}✓ Onboarding validation passed.{RESET}\n")
        sys.exit(0)
