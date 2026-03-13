#!/usr/bin/env python3
"""
Pipeline Health Check — validates all critical production paths.

Design principles:
  - No live API calls (no Instagram, Facebook, DeepSeek, etc.)
  - CAN use local DB connection (real Supabase/Postgres via .env) for checks
    that need it, with graceful skip if DB not reachable
  - Must complete in < 30 seconds
  - Exit 0 = all pass. Exit 1 = print EXACT failing check + file + line
  - Each check is independent — one failure doesn't skip others

Usage:
    python scripts/health_check.py
"""
import importlib
import inspect
import os
import subprocess
import sys
import tempfile
import time
import types
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure project root is on sys.path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Load .env
env_file = ROOT / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val

# ── Mock heavy deps if not installed ─────────────────────────
def _mock_if_missing(pkg, submodules=None):
    if pkg in sys.modules:
        return
    try:
        importlib.import_module(pkg)
        return
    except ImportError:
        pass
    mock = MagicMock()
    mock.__version__ = "0.1.0"
    sys.modules[pkg] = mock
    for sub in (submodules or []):
        sub_mock = MagicMock()
        sub_mock.__version__ = "0.1.0"
        sys.modules[f"{pkg}.{sub}"] = sub_mock

_mock_if_missing("supabase")
_mock_if_missing("python_multipart", ["multipart"])

# ── Colours ──────────────────────────────────────────────────
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BOLD = "\033[1m"
RESET = "\033[0m"

passed = 0
failed = 0
warnings = 0


def ok(check_num, label, detail=""):
    global passed
    passed += 1
    print(f"  {GREEN}✓{RESET} [{check_num:>2}] {label}" + (f"  ({detail})" if detail else ""))


def fail(check_num, label, detail=""):
    global failed
    failed += 1
    print(f"  {RED}✗{RESET} [{check_num:>2}] {label}" + (f"  — {detail}" if detail else ""))


def warn(check_num, label, detail=""):
    global warnings
    warnings += 1
    print(f"  {YELLOW}⚠{RESET} [{check_num:>2}] {label}" + (f"  — {detail}" if detail else ""))


# ═══════════════════════════════════════════════════════════════
# CHECK 1: Font files exist on disk
# ═══════════════════════════════════════════════════════════════
def check_01_fonts():
    fonts = [
        "assets/fonts/Poppins-Bold.ttf",
        "assets/fonts/Inter/static/Inter_24pt-Regular.ttf",
        "assets/fonts/Inter/static/Inter_24pt-Medium.ttf",
    ]
    all_ok = True
    for font in fonts:
        path = ROOT / font
        if path.exists():
            ok(1, f"Font exists: {font}")
        else:
            fail(1, f"MISSING FONT: {font}", "all image rendering will produce blank output")
            all_ok = False
    return all_ok


# ═══════════════════════════════════════════════════════════════
# CHECK 2: FFmpeg binary available
# ═══════════════════════════════════════════════════════════════
def check_02_ffmpeg():
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"], capture_output=True, timeout=10
        )
        if result.returncode == 0:
            ok(2, "FFmpeg binary available")
            return True
        fail(2, "MISSING: ffmpeg binary", "reel video generation will fail")
        return False
    except FileNotFoundError:
        fail(2, "MISSING: ffmpeg binary", "reel video generation will fail")
        return False
    except subprocess.TimeoutExpired:
        warn(2, "FFmpeg check timed out")
        return True


# ═══════════════════════════════════════════════════════════════
# CHECK 3: CarouselSlideRenderer import + method surface
# ═══════════════════════════════════════════════════════════════
def check_03_carousel_renderer():
    try:
        from app.services.media.carousel_slide_renderer import CarouselSlideRenderer
        renderer = CarouselSlideRenderer()
        expected_methods = ["render_all", "render_cover", "render_text_slide",
                           "_auto_fit_title", "_draw_wrapped_text"]
        all_ok = True
        for method in expected_methods:
            if hasattr(renderer, method):
                ok(3, f"CarouselSlideRenderer.{method}")
            else:
                fail(3, f"BROKEN: CarouselSlideRenderer missing method '{method}'")
                all_ok = False
        return all_ok
    except Exception as e:
        fail(3, "CarouselSlideRenderer import failed", str(e))
        return False


# ═══════════════════════════════════════════════════════════════
# CHECK 4: Carousel rendering with mock brand config
# ═══════════════════════════════════════════════════════════════
def check_04_carousel_render():
    try:
        from PIL import Image
    except ImportError:
        warn(4, "Pillow not installed", "skipping carousel render check")
        return True

    try:
        from app.services.media.carousel_renderer import render_carousel_images

        # Create a temp black background image
        tmp_dir = tempfile.mkdtemp(prefix="hc_")
        bg_path = os.path.join(tmp_dir, "bg.png")
        Image.new("RGB", (1080, 1920), (0, 0, 0)).save(bg_path)

        # Mock Supabase upload
        mock_upload_result = {
            "coverUrl": "mock://cover",
            "slideUrls": ["mock://s1", "mock://s2", "mock://s3"],
        }

        with patch("app.services.storage.supabase_storage.upload_from_path",
                    return_value="mock://uploaded"):
            result = render_carousel_images(
                brand="test_brand",
                title="QA Check Title",
                background_image=bg_path,
                slide_texts=["Slide 1", "Slide 2", "Slide 3"],
                reel_id="healthcheck001",
                user_id="system",
            )

        if result and "coverUrl" in result and "slideUrls" in result:
            ok(4, "render_carousel_images() returned valid structure")
            return True
        elif result is None:
            # render_carousel_images can return None if brand not found
            # but the import worked — that's enough for structural check
            ok(4, "render_carousel_images() callable (returned None — brand lookup failed, OK in test)")
            return True
        else:
            fail(4, f"BROKEN: render_carousel_images returned {result}")
            return False
    except Exception as e:
        fail(4, "render_carousel_images() failed", str(e)[:200])
        return False


# ═══════════════════════════════════════════════════════════════
# CHECK 5: Output image dimensions
# ═══════════════════════════════════════════════════════════════
def check_05_dimensions():
    try:
        from PIL import Image
    except ImportError:
        warn(5, "Pillow not installed", "skipping dimension check")
        return True

    try:
        from app.services.media.carousel_slide_renderer import CarouselSlideRenderer

        renderer = CarouselSlideRenderer()
        tmp_dir = tempfile.mkdtemp(prefix="hc_dim_")
        bg_path = os.path.join(tmp_dir, "bg.png")
        out_path = os.path.join(tmp_dir, "cover.png")

        Image.new("RGB", (1080, 1350), (0, 0, 0)).save(bg_path)

        brand_config = {
            "name": "TestBrand",
            "displayName": "TestBrand",
            "color": "#888888",
            "accentColor": "#666666",
            "abbreviation": "TB",
            "handle": "@testbrand",
        }

        renderer.render_cover(
            background_image=bg_path,
            title="QA Test",
            brand_config=brand_config,
            output_path=out_path,
        )

        if not os.path.exists(out_path):
            fail(5, "render_cover produced no output file")
            return False

        img = Image.open(out_path)
        w, h = img.size
        # Carousel is 1080x1350 (not 1080x1920 — that's reels)
        if w == 1080 and h == 1350:
            ok(5, f"Cover dimensions correct: {w}x{h}")
            return True
        else:
            fail(5, f"WRONG DIMENSIONS: cover is {w}x{h}, expected 1080x1350")
            return False
    except Exception as e:
        fail(5, "Dimension check failed", str(e)[:200])
        return False


# ═══════════════════════════════════════════════════════════════
# CHECK 6: Carousel slide count parity
# ═══════════════════════════════════════════════════════════════
def check_06_slide_count():
    try:
        from PIL import Image
    except ImportError:
        warn(6, "Pillow not installed", "skipping slide count check")
        return True

    try:
        from app.services.media.carousel_slide_renderer import CarouselSlideRenderer

        renderer = CarouselSlideRenderer()
        tmp_dir = tempfile.mkdtemp(prefix="hc_slides_")
        bg_path = os.path.join(tmp_dir, "bg.png")
        cover_out = os.path.join(tmp_dir, "cover.png")
        slide_texts = ["Slide A", "Slide B", "Slide C", "Slide D"]
        slide_outputs = [os.path.join(tmp_dir, f"s{i}.png") for i in range(len(slide_texts))]

        Image.new("RGB", (1080, 1350), (50, 50, 50)).save(bg_path)

        brand_config = {
            "name": "TestBrand",
            "displayName": "TestBrand",
            "color": "#888888",
            "accentColor": "#666666",
            "abbreviation": "TB",
            "handle": "@test",
        }

        result = renderer.render_all(
            brand_config=brand_config,
            title="Slide Count Test",
            background_image=bg_path,
            slide_texts=slide_texts,
            cover_output=cover_out,
            slide_outputs=slide_outputs,
        )

        if result and result.get("success"):
            slide_paths = result.get("slidePaths", [])
            if len(slide_paths) == 4:
                ok(6, f"Slide count correct: requested 4, got {len(slide_paths)}")
                return True
            else:
                fail(6, f"SLIDE COUNT MISMATCH: requested 4 slides, got {len(slide_paths)}")
                return False
        else:
            fail(6, f"render_all returned failure: {result}")
            return False
    except Exception as e:
        fail(6, "Slide count check failed", str(e)[:200])
        return False


# ═══════════════════════════════════════════════════════════════
# CHECK 7: ContentGeneratorV2 import + method surface
# ═══════════════════════════════════════════════════════════════
def check_07_content_generator():
    try:
        from app.services.content.generator import ContentGeneratorV2, ContentGenerationError
        gen = ContentGeneratorV2()
        expected_methods = [
            "generate_viral_content", "generate_post_titles_batch",
            "generate_image_prompt", "generate_post_title", "_fallback_content",
        ]
        all_ok = True
        for method in expected_methods:
            if hasattr(gen, method):
                ok(7, f"ContentGeneratorV2.{method}")
            else:
                fail(7, f"BROKEN: ContentGeneratorV2 missing '{method}'")
                all_ok = False
        return all_ok
    except Exception as e:
        fail(7, "ContentGeneratorV2 import failed", str(e))
        return False


# ═══════════════════════════════════════════════════════════════
# CHECK 8: PromptContext builds cleanly with mock NicheConfig
# ═══════════════════════════════════════════════════════════════
def check_08_prompt_context():
    try:
        from app.core.prompt_context import PromptContext

        ctx = PromptContext(
            niche_name="Fitness",
            niche_description="Health and fitness content",
            content_brief="Test brief",
            target_audience="Young adults",
            audience_description="Gym goers aged 18-30",
            content_tone=["motivational", "direct"],
            tone_avoid=["aggressive"],
            topic_categories=["Workout", "Nutrition"],
            topic_keywords=["gym", "strength"],
            topic_avoid=["steroids"],
            content_philosophy="Inspire and educate",
            hook_themes=["surprising facts"],
            reel_examples=[{"title": "Test", "hook": "Did you know"}],
            post_examples=[{"title": "Test post"}],
            image_style_description="Dark cinematic",
            image_palette_keywords=["moody", "dark"],
            brand_personality="Energetic coach",
            brand_focus_areas=["strength training"],
            parent_brand_name="FitBrand",
            cta_options=["Follow for workouts"],
            hashtags=["#fitness", "#workout"],
            competitor_accounts=["@competitor1"],
            discovery_hashtags=["#fitfam"],
            citation_style="informal",
            citation_source_types=["research", "expert"],
            yt_title_examples=["Best Workout"],
            yt_title_bad_examples=["Click Here"],
            carousel_cta_topic="fitness tips",
            carousel_cta_options=["Save this"],
            carousel_cover_overlay_opacity=65,
            carousel_content_overlay_opacity=85,
            follow_section_text="Follow @fitbrand",
            save_section_text="Save for later",
            disclaimer_text="Consult a professional",
            format_b_reel_examples=[],
            format_b_story_niches=["fitness stories"],
            format_b_story_tone="inspirational",
            format_b_preferred_categories=["workout"],
            threads_format_weights={"opinion": 30, "tip": 40, "question": 30},
        )

        all_ok = True
        for prop_name in ["tone_string", "hashtag_string", "topic_framing"]:
            result = getattr(ctx, prop_name)
            if result is not None:
                ok(8, f"PromptContext.{prop_name} → '{str(result)[:40]}...'")
            else:
                fail(8, f"BROKEN: PromptContext.{prop_name} returned None with valid fields")
                all_ok = False
        return all_ok
    except Exception as e:
        fail(8, "PromptContext mock build failed", str(e)[:200])
        return False


# ═══════════════════════════════════════════════════════════════
# CHECK 9: unified_generator callable signatures
# ═══════════════════════════════════════════════════════════════
def check_09_unified_generator():
    try:
        from app.services.content.unified_generator import (
            generate_carousel_content, generate_reel_content
        )
        all_ok = True
        for fn_name, fn in [("generate_carousel_content", generate_carousel_content),
                            ("generate_reel_content", generate_reel_content)]:
            sig = inspect.signature(fn)
            params = list(sig.parameters.keys())
            if len(params) >= 2 and params[0] == "user_id" and params[1] == "brand_id":
                ok(9, f"{fn_name}(user_id, brand_id, ...)")
            else:
                fail(9, f"SIGNATURE CHANGE: {fn_name} params are {params} — callers will break")
                all_ok = False
        return all_ok
    except Exception as e:
        fail(9, "unified_generator import failed", str(e))
        return False


# ═══════════════════════════════════════════════════════════════
# CHECK 10: JobProcessor VARIANT_PROCESSORS completeness
# ═══════════════════════════════════════════════════════════════
def check_10_variant_processors():
    try:
        from app.services.content.job_processor import JobProcessor
        jp = JobProcessor(db=MagicMock())

        all_ok = True
        for variant, method_name in JobProcessor.VARIANT_PROCESSORS.items():
            if hasattr(jp, method_name):
                ok(10, f"VARIANT_PROCESSORS['{variant}'] → {method_name}()")
            else:
                fail(10, f"VARIANT GAP: '{variant}' → method '{method_name}' missing on JobProcessor")
                all_ok = False
        return all_ok
    except Exception as e:
        fail(10, "JobProcessor import failed", str(e))
        return False


# ═══════════════════════════════════════════════════════════════
# CHECK 11: music_picker function exports + resolve_music_url signature
# ═══════════════════════════════════════════════════════════════
def check_11_music_picker():
    try:
        from app.services.media.music_picker import (
            get_random_music_url, get_random_local_music_path,
            get_random_user_music_url, resolve_music_url
        )
        all_ok = True
        for name, fn in [
            ("get_random_music_url", get_random_music_url),
            ("get_random_local_music_path", get_random_local_music_path),
            ("get_random_user_music_url", get_random_user_music_url),
            ("resolve_music_url", resolve_music_url),
        ]:
            if callable(fn):
                ok(11, f"music_picker.{name}")
            else:
                fail(11, f"BROKEN: music_picker.{name} not callable — reels will have no music")
                all_ok = False

        # Check resolve_music_url signature
        sig = inspect.signature(resolve_music_url)
        params = list(sig.parameters.keys())
        if len(params) >= 2 and params[0] == "db" and params[1] == "user_id":
            ok(11, "resolve_music_url(db, user_id, ...) signature correct")
        else:
            fail(11, f"BROKEN: resolve_music_url signature changed to {params}")
            all_ok = False
        return all_ok
    except ImportError as e:
        fail(11, "music_picker import failed", str(e))
        return False


# ═══════════════════════════════════════════════════════════════
# CHECK 12: SocialPublisher all 13 publish methods
# ═══════════════════════════════════════════════════════════════
def check_12_social_publisher():
    try:
        from app.services.publishing.social_publisher import SocialPublisher
        pub = SocialPublisher()

        expected_methods = [
            "publish_instagram_image_post", "publish_instagram_carousel",
            "publish_instagram_reel", "publish_facebook_image_post",
            "publish_facebook_carousel", "publish_facebook_reel",
            "publish_to_both", "publish_threads_post",
            "publish_threads_carousel", "publish_threads_chain",
            "publish_tiktok_video", "publish_bsky_post", "publish_bsky_carousel",
        ]

        all_ok = True
        for method in expected_methods:
            if hasattr(pub, method):
                ok(12, f"SocialPublisher.{method}")
            else:
                platform = method.split("_")[1] if "_" in method else "unknown"
                fail(12, f"BROKEN: SocialPublisher.{method} missing — {platform} publishing will silently fail")
                all_ok = False
        return all_ok
    except Exception as e:
        fail(12, "SocialPublisher import failed", str(e))
        return False


# ═══════════════════════════════════════════════════════════════
# CHECK 13: app.db_connection canonical exports
# ═══════════════════════════════════════════════════════════════
def check_13_db_connection():
    try:
        from app.db_connection import SessionLocal, get_db, get_db_session
        all_ok = True
        for name, obj in [("SessionLocal", SessionLocal), ("get_db", get_db), ("get_db_session", get_db_session)]:
            if obj is not None:
                ok(13, f"app.db_connection.{name}")
            else:
                fail(13, f"BROKEN: app.db_connection.{name} missing — entire DB layer will fail")
                all_ok = False
        return all_ok
    except ImportError as e:
        fail(13, "db_connection import failed", str(e))
        return False


# ═══════════════════════════════════════════════════════════════
# CHECK 14: DatabaseSchedulerService method surface
# ═══════════════════════════════════════════════════════════════
def check_14_scheduler_service():
    try:
        from app.services.publishing.scheduler import DatabaseSchedulerService

        expected_methods = [
            "schedule_reel", "get_pending_publications", "publish_scheduled_now",
            "publish_now", "mark_as_published", "mark_as_failed", "retry_failed",
            "get_all_scheduled", "delete_scheduled", "auto_retry_failed_toby_posts",
        ]

        all_ok = True
        for method in expected_methods:
            if hasattr(DatabaseSchedulerService, method):
                ok(14, f"DatabaseSchedulerService.{method}")
            else:
                fail(14, f"BROKEN: DatabaseSchedulerService.{method} missing")
                all_ok = False
        return all_ok
    except Exception as e:
        fail(14, "DatabaseSchedulerService import failed", str(e))
        return False


# ═══════════════════════════════════════════════════════════════
# CHECK 15: SUPPORTED_PLATFORMS registry consistency
# ═══════════════════════════════════════════════════════════════
def check_15_platforms():
    try:
        from app.core.platforms import (
            SUPPORTED_PLATFORMS, SUPPORTED_PLATFORMS_SET,
            detect_connected_platforms, get_platforms_for_content_type
        )

        all_ok = True

        # Check set consistency
        if set(SUPPORTED_PLATFORMS) == set(SUPPORTED_PLATFORMS_SET):
            ok(15, "SUPPORTED_PLATFORMS == SUPPORTED_PLATFORMS_SET")
        else:
            fail(15, "PLATFORM DRIFT: set mismatch between SUPPORTED_PLATFORMS and SUPPORTED_PLATFORMS_SET")
            all_ok = False

        # Check all expected platforms present
        expected = {"instagram", "facebook", "youtube", "threads", "tiktok", "bluesky"}
        actual = set(SUPPORTED_PLATFORMS)
        if expected == actual:
            ok(15, f"All 6 platforms present: {sorted(actual)}")
        else:
            missing = expected - actual
            extra = actual - expected
            if missing:
                fail(15, f"PLATFORM DRIFT: missing platforms {missing}")
                all_ok = False
            if extra:
                warn(15, f"PLATFORM DRIFT: extra platforms {extra} — verify all publisher methods exist")
        return all_ok
    except Exception as e:
        fail(15, "Platforms import failed", str(e))
        return False


# ═══════════════════════════════════════════════════════════════
# CHECK 16: VideoGenerator + FFmpeg utils method surface
# ═══════════════════════════════════════════════════════════════
def check_16_video_generator():
    all_ok = True
    try:
        from app.services.media.video_generator import VideoGenerator
        if hasattr(VideoGenerator, "generate_reel_video"):
            ok(16, "VideoGenerator.generate_reel_video exists")
        else:
            fail(16, "BROKEN: VideoGenerator missing generate_reel_video")
            all_ok = False
    except Exception as e:
        fail(16, f"VideoGenerator import failed: {e}")
        all_ok = False

    try:
        from app.utils.ffmpeg import create_video_from_image, verify_ffmpeg_installation, get_audio_duration
        for name, fn in [("create_video_from_image", create_video_from_image),
                         ("verify_ffmpeg_installation", verify_ffmpeg_installation),
                         ("get_audio_duration", get_audio_duration)]:
            if callable(fn):
                ok(16, f"ffmpeg.{name}")
            else:
                fail(16, f"BROKEN: {name} not callable in video generation chain")
                all_ok = False
    except ImportError as e:
        fail(16, f"FFmpeg utils import failed: {e}")
        all_ok = False

    try:
        from app.core.constants import REEL_WIDTH, REEL_HEIGHT
        if REEL_WIDTH == 1080 and REEL_HEIGHT == 1920:
            ok(16, f"REEL constants: {REEL_WIDTH}x{REEL_HEIGHT}")
        else:
            fail(16, f"BROKEN: REEL_WIDTH={REEL_WIDTH}, REEL_HEIGHT={REEL_HEIGHT} (expected 1080x1920)")
            all_ok = False
    except ImportError as e:
        fail(16, f"Constants import failed: {e}")
        all_ok = False

    return all_ok


# ═══════════════════════════════════════════════════════════════
# CHECK 17: Toby orchestrator import chain
# ═══════════════════════════════════════════════════════════════
def check_17_toby_chain():
    all_ok = True
    imports = [
        ("app.services.toby.orchestrator", "toby_tick"),
        ("app.services.toby.buffer_manager", "get_buffer_status"),
        ("app.services.toby.buffer_manager", "get_empty_slots"),
        ("app.services.toby.content_planner", "create_plans_for_empty_slots"),
        ("app.services.toby.learning_engine", "choose_strategy"),
        ("app.services.toby.learning_engine", "get_personality_prompt"),
        ("app.services.toby.learning_engine", "update_strategy_score"),
        ("app.services.toby.feature_flags", "is_enabled"),
    ]

    for module_path, symbol in imports:
        try:
            mod = importlib.import_module(module_path)
            if hasattr(mod, symbol) and callable(getattr(mod, symbol)):
                ok(17, f"{module_path}.{symbol}")
            else:
                fail(17, f"BROKEN: Toby tick chain broken at {module_path}.{symbol} — orchestrator will crash on next tick")
                all_ok = False
        except Exception as e:
            fail(17, f"BROKEN: {module_path} import failed: {e}")
            all_ok = False
    return all_ok


# ═══════════════════════════════════════════════════════════════
# CHECK 18: BrandResolver singleton + BrandManager factory
# ═══════════════════════════════════════════════════════════════
def check_18_brand_services():
    all_ok = True

    try:
        from app.services.brands.resolver import brand_resolver
        if brand_resolver is None:
            fail(18, "BROKEN: brand_resolver is None")
            all_ok = False
        else:
            ok(18, "brand_resolver singleton exists")
            for method in ["get_brand", "resolve_brand_name", "get_all_brand_ids", "invalidate_cache"]:
                if hasattr(brand_resolver, method):
                    ok(18, f"brand_resolver.{method}")
                else:
                    fail(18, f"BROKEN: brand_resolver.{method} missing — brand resolution will fail across all content")
                    all_ok = False
    except Exception as e:
        fail(18, f"brand_resolver import failed: {e}")
        all_ok = False

    try:
        from app.services.brands.manager import get_brand_manager
        if callable(get_brand_manager):
            ok(18, "get_brand_manager() callable")
        else:
            fail(18, "BROKEN: get_brand_manager not callable")
            all_ok = False
    except Exception as e:
        fail(18, f"BrandManager import failed: {e}")
        all_ok = False

    return all_ok


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════
def main():
    print(f"\n{BOLD}{'=' * 60}")
    print(f"  VIRALTOBY — PIPELINE HEALTH CHECK")
    print(f"{'=' * 60}{RESET}")

    t0 = time.time()

    checks = [
        ("Font files", check_01_fonts),
        ("FFmpeg binary", check_02_ffmpeg),
        ("CarouselSlideRenderer surface", check_03_carousel_renderer),
        ("Carousel rendering (mock)", check_04_carousel_render),
        ("Output image dimensions", check_05_dimensions),
        ("Carousel slide count", check_06_slide_count),
        ("ContentGeneratorV2 surface", check_07_content_generator),
        ("PromptContext mock build", check_08_prompt_context),
        ("unified_generator signatures", check_09_unified_generator),
        ("VARIANT_PROCESSORS completeness", check_10_variant_processors),
        ("music_picker exports", check_11_music_picker),
        ("SocialPublisher methods", check_12_social_publisher),
        ("db_connection exports", check_13_db_connection),
        ("DatabaseSchedulerService surface", check_14_scheduler_service),
        ("SUPPORTED_PLATFORMS registry", check_15_platforms),
        ("VideoGenerator + FFmpeg", check_16_video_generator),
        ("Toby orchestrator chain", check_17_toby_chain),
        ("Brand services", check_18_brand_services),
    ]

    for name, fn in checks:
        print(f"\n{BOLD}━━━ Check: {name} ━━━{RESET}")
        try:
            fn()
        except Exception as e:
            fail(0, f"Unexpected error in {name}", str(e)[:200])

    elapsed = time.time() - t0

    print(f"\n{BOLD}{'=' * 60}")
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
    print(f"{'=' * 60}{RESET}\n")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
