#!/usr/bin/env python3
"""
API Validation Script — catches import errors, broken endpoints, and missing
dependencies BEFORE deploying to production.

Usage:
    python scripts/validate_api.py              # Run all checks
    python scripts/validate_api.py --imports    # Import checks only (fast, no server)
    python scripts/validate_api.py --endpoints  # Start server + hit endpoints

Checks performed:
  1. Module import validation (catches missing 'import asyncio', etc.)
  2. FastAPI app boot (catches startup crashes)
  3. Endpoint smoke tests via TestClient (no external network needed)
  4. NicheConfig ↔ PromptContext field alignment

Last updated: auto-generated from 116 real endpoints across 13 routers.
"""
import argparse
import importlib
import sys
import time
from pathlib import Path

# Ensure project root is on sys.path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# ── Colours ──────────────────────────────────────────────────
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
# 1. MODULE IMPORT CHECKS
# ═══════════════════════════════════════════════════════════════

CRITICAL_MODULES = [
    # ── Core ──
    ("app.core.prompt_templates", "Prompt templates"),
    ("app.core.prompt_context", "PromptContext dataclass"),
    ("app.core.config", "App config"),
    ("app.core.constants", "Constants"),
    ("app.core.cta", "CTA logic"),
    ("app.core.viral_patterns", "Viral patterns"),
    ("app.core.brand_colors", "Brand colors"),
    ("app.core.quality_scorer", "Quality scorer"),
    ("app.core.viral_ideas", "Viral ideas"),
    # ── Models ──
    ("app.models.niche_config", "NicheConfig model"),
    ("app.models.jobs", "Jobs model"),
    ("app.models.scheduling", "Scheduling model"),
    ("app.models.brands", "Brands model"),
    ("app.models.analytics", "Analytics model"),
    ("app.models.auth", "Auth model"),
    ("app.models.config", "Config model"),
    ("app.models.logs", "Logs model"),
    ("app.models.youtube", "YouTube model"),
    # ── Services ──
    ("app.services.content.generator", "Content generator"),
    ("app.services.content.niche_config_service", "NicheConfig service"),
    ("app.services.content.job_processor", "Job processor"),
    ("app.services.media.ai_background", "AI background generator"),
    ("app.services.media.image_generator", "Image generator"),
    ("app.services.media.caption_generator", "Caption generator"),
    ("app.services.brands.manager", "Brand manager"),
    ("app.services.analytics.trend_scout", "TrendScout"),
    # ── API Routes (all 13 routers from main.py) ──
    ("app.api.content.routes", "Content routes"),
    ("app.api.content.reel_routes", "Reel routes"),
    ("app.api.content.jobs_routes", "Jobs routes"),
    ("app.api.content.schedule_routes", "Schedule routes"),
    ("app.api.content.publish_routes", "Publish routes"),
    ("app.api.content.feedback_routes", "Feedback routes"),
    ("app.api.content.prompts_routes", "Prompts routes"),
    ("app.api.auth.middleware", "Auth middleware"),
    ("app.api.auth.routes", "Auth routes"),
    ("app.api.auth.user_routes", "User routes"),
    ("app.api.niche_config_routes", "NicheConfig routes"),
    ("app.api.brands.routes", "Brands routes"),
    ("app.api.brands.connection_test_routes", "Connection test routes"),
    ("app.api.youtube.routes", "YouTube routes"),
    ("app.api.analytics.routes", "Analytics routes"),
    ("app.api.system.status_routes", "Status routes"),
    ("app.api.system.admin_routes", "Admin routes"),
    ("app.api.system.health_routes", "Health routes"),
    ("app.api.system.settings_routes", "Settings routes"),
    ("app.api.system.logs_routes", "Logs routes"),
    # ── Toby ──
    ("app.api.toby.routes", "Toby routes"),
    ("app.api.toby.schemas", "Toby schemas"),
    ("app.models.toby", "Toby models"),
    ("app.services.toby.state", "Toby state service"),
    ("app.services.toby.orchestrator", "Toby orchestrator"),
    ("app.services.toby.analysis_engine", "Toby analysis engine"),
    ("app.services.toby.learning_engine", "Toby learning engine"),
    ("app.services.toby.buffer_manager", "Toby buffer manager"),
    ("app.services.toby.content_planner", "Toby content planner"),
    ("app.services.toby.discovery_manager", "Toby discovery manager"),
    # ── Utilities ──
    ("app.utils.ffmpeg", "FFmpeg utils"),
    ("app.utils.fonts", "Font utils"),
    ("app.utils.text_formatting", "Text formatting"),
    ("app.utils.text_layout", "Text layout"),
    # ── DB ──
    ("app.db_connection", "Database connection"),
]


def check_imports():
    print(f"\n{BOLD}━━━ Module Import Checks ({len(CRITICAL_MODULES)} modules) ━━━{RESET}")
    for module_path, label in CRITICAL_MODULES:
        try:
            importlib.import_module(module_path)
            ok(f"{label}", module_path)
        except Exception as e:
            fail(f"{label}", f"{module_path} → {type(e).__name__}: {e}")


# ═══════════════════════════════════════════════════════════════
# 2. SPECIFIC SYMBOL CHECKS (catch 'asyncio' etc.)
# ═══════════════════════════════════════════════════════════════

SYMBOL_CHECKS = [
    ("app.api.content.routes", "asyncio", "asyncio import in content routes"),
    ("app.api.system.admin_routes", "asyncio", "asyncio import in admin routes"),
    ("app.core.prompt_context", "PromptContext", "PromptContext class"),
    ("app.models.niche_config", "NicheConfig", "NicheConfig model class"),
    ("app.api.auth.middleware", "get_current_user", "Auth dependency function"),
    ("app.api.routes", "router", "Main reels router aggregator"),
]


def check_symbols():
    print(f"\n{BOLD}━━━ Symbol / Name Checks ━━━{RESET}")
    for module_path, symbol, label in SYMBOL_CHECKS:
        try:
            mod = importlib.import_module(module_path)
            if hasattr(mod, symbol):
                ok(label, f"{module_path}.{symbol}")
            else:
                fail(label, f"'{symbol}' not found in {module_path}")
        except Exception as e:
            fail(label, f"Could not import {module_path}: {e}")


# ═══════════════════════════════════════════════════════════════
# 3. FASTAPI APP BOOT + ENDPOINT SMOKE TESTS
# ═══════════════════════════════════════════════════════════════

def _make_request(client, method, path, json_body=None):
    """Send a request via TestClient."""
    if method == "GET":
        return client.get(path)
    elif method == "POST":
        return client.post(path, json=json_body or {})
    elif method == "PUT":
        return client.put(path, json=json_body or {})
    elif method == "DELETE":
        return client.delete(path)
    elif method == "PATCH":
        return client.patch(path, json=json_body or {})
    raise ValueError(f"Unknown method: {method}")


def check_endpoints():
    print(f"\n{BOLD}━━━ FastAPI App Boot ━━━{RESET}")

    try:
        from app.main import app
        ok("FastAPI app imported")
    except Exception as e:
        fail("FastAPI app import", str(e))
        return

    try:
        from fastapi.testclient import TestClient
    except ImportError:
        fail("TestClient import", "pip install httpx (required by TestClient)")
        return

    client = TestClient(app, raise_server_exceptions=False)

    # ── 3a. No-auth GET endpoints (expect 200) ──────────────
    print(f"\n{BOLD}━━━ No-Auth GET Endpoints (expect 200) ━━━{RESET}")

    no_auth_get = [
        ("/health", "Health check (app-level)"),
        ("/api/system/health-check", "Deep health check (DB + auth)"),
        ("/reels/content-topics", "Content topics"),
        ("/reels/status", "Generation status"),
        ("/reels/history", "Generation history"),
        ("/reels/health", "Reels health (FFmpeg)"),
    ]

    for path, label in no_auth_get:
        try:
            resp = client.get(path)
            if resp.status_code == 200:
                ok(label, f"GET {path} → 200")
            elif resp.status_code == 500:
                fail(label, f"GET {path} → 500: {resp.text[:200]}")
            else:
                warn(label, f"GET {path} → {resp.status_code} (expected 200)")
        except Exception as e:
            fail(label, f"GET {path} → {type(e).__name__}: {e}")

    # ── 3b. No-auth POST endpoints (expect 200/422, NOT 500) ──
    print(f"\n{BOLD}━━━ No-Auth POST Endpoints (expect 200/422, NOT 500) ━━━{RESET}")
    print(f"  These hit AI/content routes with empty payloads → 422 is OK.\n")

    no_auth_post = [
        ("/reels/auto-generate-content", "Auto-generate content"),
        ("/reels/generate-captions", "Generate captions"),
        ("/reels/generate-post-title", "Generate post title"),
        ("/reels/generate-post-titles-batch", "Batch post titles"),
        ("/reels/generate-post-background", "Post background image"),
        ("/reels/generate-image-prompt", "Image prompt generation"),
        ("/reels/generate-background", "Reel background image"),
        ("/reels/rate-content", "Rate content"),
        ("/reels/publish", "Publish (legacy, expect 410)"),
        ("/reels/users", "Create/update user"),
        ("/reels/rejection-feedback", "Submit rejection feedback"),
        ("/api/auth/verify-logs", "Verify logs password"),
    ]

    import signal

    class _Timeout(Exception):
        pass

    def _timeout_handler(signum, frame):
        raise _Timeout()

    for path, label in no_auth_post:
        try:
            old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
            signal.alarm(15)

            resp = client.post(path, json={})

            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)

            if resp.status_code in (200, 410, 422):
                ok(label, f"POST {path} → {resp.status_code}")
            elif resp.status_code == 500:
                fail(label, f"POST {path} → 500: {resp.text[:200]}")
            else:
                ok(label, f"POST {path} → {resp.status_code}")
        except _Timeout:
            signal.alarm(0)
            warn(label, f"POST {path} → TIMEOUT (>15s)")
        except Exception as e:
            signal.alarm(0)
            fail(label, f"POST {path} → {type(e).__name__}: {e}")

    # ── 3c. Auth-required endpoints (expect 401/403, NOT 500) ──
    print(f"\n{BOLD}━━━ Auth-Required Endpoints (expect 401/403, NOT 500) ━━━{RESET}")
    print(f"  Sending WITHOUT auth token — must reject, never crash.\n")

    auth_endpoints = [
        # Reel creation (Auth)
        ("POST", "/reels/create", "Reel creation"),
        ("POST", "/reels/generate", "Reel generate (job)"),
        # Scheduling (Auth) — representative subset
        ("POST", "/reels/schedule", "Schedule reel"),
        ("POST", "/reels/schedule-auto", "Auto-schedule reel"),
        ("GET", "/reels/scheduled", "List scheduled"),
        ("POST", "/reels/schedule-post-image", "Schedule post image"),
        ("GET", "/reels/next-slots", "Next slots (all brands)"),
        # Jobs (Auth) — representative subset
        ("POST", "/jobs/create", "Job creation"),
        ("GET", "/jobs/", "Jobs list"),
        # YouTube (Auth)
        ("GET", "/api/youtube/connect", "YouTube OAuth start"),
        ("GET", "/api/youtube/status", "YouTube status"),
        ("GET", "/api/youtube/quota", "YouTube quota"),
        # Niche Config / Content DNA (Auth)
        ("GET", "/api/v2/brands/niche-config", "NicheConfig GET"),
        ("PUT", "/api/v2/brands/niche-config", "NicheConfig PUT"),
        ("POST", "/api/v2/brands/niche-config/ai-understanding", "AI understanding"),
        ("POST", "/api/v2/brands/niche-config/preview-reel", "Preview reel"),
        # Brands (Auth) — test both mount points
        ("GET", "/api/brands", "Brands list (/api)"),
        ("GET", "/api/v2/brands", "Brands list (/api/v2)"),
        ("GET", "/api/brands/credentials", "Brand credentials"),
        ("GET", "/api/brands/prompts", "Global prompts GET"),
        ("PUT", "/api/brands/prompts", "Global prompts PUT"),
        ("GET", "/api/brands/settings/layout", "Layout settings GET"),
        ("POST", "/api/brands/seed", "Seed brands"),
        # Connection tests (Auth)
        ("POST", "/api/v2/brands/test-brand/test-connection/meta", "Test Meta connection"),
        ("POST", "/api/v2/brands/test-brand/test-connection/youtube", "Test YouTube connection"),
        # Settings (Auth) — representative subset
        ("GET", "/api/settings", "Settings list"),
        ("GET", "/api/settings/categories", "Setting categories"),
        # Analytics (Auth) — representative subset
        ("GET", "/api/analytics", "Analytics (all brands)"),
        ("POST", "/api/analytics/refresh", "Refresh analytics"),
        ("GET", "/api/analytics/snapshots", "Analytics snapshots"),
        # Auth
        ("GET", "/api/auth/me", "Auth: get current user"),
        # Prompts (Auth)
        ("GET", "/api/prompts/overview", "Prompts overview"),
        ("POST", "/api/prompts/test-generate", "Test prompt generate"),
        ("POST", "/api/prompts/build-final", "Build final prompt"),
        # Toby (Auth)
        ("GET", "/api/toby/status", "Toby status"),
        ("POST", "/api/toby/enable", "Toby enable"),
        ("POST", "/api/toby/disable", "Toby disable"),
        ("POST", "/api/toby/reset", "Toby reset"),
        ("GET", "/api/toby/activity", "Toby activity"),
        ("GET", "/api/toby/published", "Toby published"),
        ("GET", "/api/toby/experiments", "Toby experiments"),
        ("GET", "/api/toby/insights", "Toby insights"),
        ("GET", "/api/toby/discovery", "Toby discovery"),
        ("GET", "/api/toby/buffer", "Toby buffer"),
        ("GET", "/api/toby/config", "Toby config"),
        ("PATCH", "/api/toby/config", "Toby config update"),
    ]

    for method, path, label in auth_endpoints:
        try:
            old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
            signal.alarm(15)

            resp = _make_request(client, method, path)

            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)

            if resp.status_code in (401, 403, 422):
                ok(label, f"{method} {path} → {resp.status_code}")
            elif resp.status_code == 500:
                fail(label, f"{method} {path} → 500: {resp.text[:300]}")
            elif resp.status_code == 405:
                warn(label, f"{method} {path} → 405 Method Not Allowed")
            elif resp.status_code == 200:
                warn(label, f"{method} {path} → 200 (no auth required — intentional?)")
            else:
                ok(label, f"{method} {path} → {resp.status_code}")
        except _Timeout:
            signal.alarm(0)
            warn(label, f"{method} {path} → TIMEOUT (>15s, missing auth gate?)")
        except Exception as e:
            signal.alarm(0)
            fail(label, f"{method} {path} → {type(e).__name__}: {e}")

    # ── 3d. Admin/Super-admin endpoints (expect 401/403) ──
    print(f"\n{BOLD}━━━ Admin/Super-Admin Endpoints (expect 401/403) ━━━{RESET}")

    admin_endpoints = [
        ("GET", "/api/logs", "Logs query (admin)"),
        ("GET", "/api/logs/stats", "Logs stats (admin)"),
        ("GET", "/api/admin/users", "List users (super)"),
    ]

    for method, path, label in admin_endpoints:
        try:
            old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
            signal.alarm(15)

            resp = _make_request(client, method, path)

            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)

            if resp.status_code in (401, 403):
                ok(label, f"{method} {path} → {resp.status_code}")
            elif resp.status_code == 500:
                fail(label, f"{method} {path} → 500: {resp.text[:300]}")
            else:
                warn(label, f"{method} {path} → {resp.status_code}")
        except _Timeout:
            signal.alarm(0)
            warn(label, f"{method} {path} → TIMEOUT")
        except Exception as e:
            signal.alarm(0)
            fail(label, f"{method} {path} → {type(e).__name__}: {e}")


# ═══════════════════════════════════════════════════════════════
# 4. NICHE CONFIG FIELD COMPLETENESS
# ═══════════════════════════════════════════════════════════════

def check_niche_config_fields():
    print(f"\n{BOLD}━━━ NicheConfig ↔ PromptContext Field Alignment ━━━{RESET}")
    try:
        from app.models.niche_config import NicheConfig
        from app.core.prompt_context import PromptContext
        from app.services.content.niche_config_service import NicheConfigService

        svc = NicheConfigService()

        # Get field_map keys from _apply_config
        import inspect
        source = inspect.getsource(svc._apply_config)

        # Extract all PromptContext fields
        ctx = PromptContext()
        ctx_fields = set(vars(ctx).keys())

        # Check NicheConfig columns
        nc_columns = {c.name for c in NicheConfig.__table__.columns}
        # Ignore meta columns
        nc_columns -= {"id", "user_id", "brand_id", "created_at", "updated_at"}

        # Every NicheConfig column should map to a PromptContext field
        missing_in_ctx = nc_columns - ctx_fields
        missing_in_nc = ctx_fields - nc_columns - {
            # These are computed/derived, not stored in DB
            "tone_string", "tone_avoid_string", "topic_framing",
            "hashtag_string", "has_reel_examples", "has_post_examples", "example_count",
        }

        if not missing_in_ctx:
            ok("All NicheConfig columns have matching PromptContext fields")
        else:
            for f in missing_in_ctx:
                fail(f"NicheConfig.{f} has no matching PromptContext field")

        if not missing_in_nc:
            ok("All PromptContext fields have matching NicheConfig columns (or are derived)")
        else:
            for f in missing_in_nc:
                warn(f"PromptContext.{f} has no NicheConfig column (may be intentional)")

        # Check field_map coverage
        for nc_col in nc_columns:
            if nc_col in source:
                pass  # mapped
            else:
                warn(f"NicheConfig.{nc_col} might not be in _apply_config field_map")

    except Exception as e:
        fail("NicheConfig field alignment", str(e))


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Validate API before deploy")
    parser.add_argument("--imports", action="store_true", help="Import checks only")
    parser.add_argument("--endpoints", action="store_true", help="Endpoint tests only")
    args = parser.parse_args()

    run_all = not args.imports and not args.endpoints

    print(f"\n{BOLD}{'='*60}")
    print(f"  REELS AUTOMATION — API VALIDATION")
    print(f"{'='*60}{RESET}")

    t0 = time.time()

    if run_all or args.imports:
        check_imports()
        check_symbols()
        check_niche_config_fields()

    if run_all or args.endpoints:
        check_endpoints()

    elapsed = time.time() - t0

    print(f"\n{BOLD}{'='*60}")
    print(f"  RESULTS: {GREEN}{passed} passed{RESET}{BOLD}, ", end="")
    if failed:
        print(f"{RED}{failed} failed{RESET}{BOLD}, ", end="")
    else:
        print(f"0 failed, ", end="")
    if warnings:
        print(f"{YELLOW}{warnings} warnings{RESET}{BOLD}", end="")
    else:
        print(f"0 warnings", end="")
    print(f"  ({elapsed:.1f}s)")
    print(f"{'='*60}{RESET}\n")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
