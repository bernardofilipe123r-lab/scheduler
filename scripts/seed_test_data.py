#!/usr/bin/env python3
"""
Seed Test Data — populates the database with deterministic test fixtures.

Safety: Requires TEST_MODE=1 env var. All records use user_id="test-user-001"
and are cleaned up before insert (idempotent).

Usage:
    TEST_MODE=1 python scripts/seed_test_data.py
    TEST_MODE=1 python scripts/seed_test_data.py --clean   # Remove only
"""
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

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

# ── Safety gate ──────────────────────────────────────────────
if os.environ.get("TEST_MODE") != "1":
    print("ERROR: seed_test_data.py requires TEST_MODE=1 environment variable")
    print("Usage: TEST_MODE=1 python scripts/seed_test_data.py")
    sys.exit(1)

from app.db_connection import get_db_session
from app.models.brands import Brand
from app.models.jobs import GenerationJob
from app.models.music_library import MusicLibrary
from app.models.niche_config import NicheConfig
from app.models.scheduling import ScheduledReel

# ── Constants ────────────────────────────────────────────────
TEST_USER = "test-user-001"
BRAND_A = "test-brand-alpha"
BRAND_B = "test-brand-beta"
DNA_ID = "test-dna-001"
NOW = datetime.now(timezone.utc)

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BOLD = "\033[1m"
RESET = "\033[0m"


def clean(db):
    """Remove all test data for test-user-001."""
    counts = {}
    for model, filt in [
        (ScheduledReel, ScheduledReel.user_id == TEST_USER),
        (GenerationJob, GenerationJob.user_id == TEST_USER),
        (Brand, Brand.user_id == TEST_USER),
        (NicheConfig, NicheConfig.user_id == TEST_USER),
        (MusicLibrary, MusicLibrary.id.like("test-%")),
    ]:
        n = db.query(model).filter(filt).delete(synchronize_session=False)
        counts[model.__tablename__] = n
    db.flush()
    return counts


def seed_niche_config(db):
    """Seed Content DNA for test user."""
    nc = NicheConfig(
        id=DNA_ID,
        user_id=TEST_USER,
        niche_name="Test Fitness",
        niche_description="Fitness and wellness content for QA testing",
        content_brief="Daily workout tips and nutrition advice",
        target_audience="Young adults 18-35",
        audience_description="Gym enthusiasts and health-conscious millennials",
        content_tone=["motivational", "direct", "educational"],
        tone_avoid=["aggressive", "condescending"],
        topic_categories=["Workout", "Nutrition", "Recovery"],
        topic_keywords=["strength", "protein", "HIIT", "muscle"],
        topic_avoid=["steroids", "extreme diets"],
        content_philosophy="Inspire through science-backed fitness advice",
        hook_themes=["surprising facts", "myth-busting", "quick tips"],
        reel_examples=[
            {"title": "5 EXERCISES YOU'RE DOING WRONG", "content_lines": ["Line 1", "Line 2"]},
        ],
        post_examples=[
            {"title": "THE PROTEIN MYTH", "slides": ["Slide 1", "Slide 2", "Slide 3"]},
        ],
        image_style_description="Dark cinematic fitness photography",
        image_palette_keywords=["dark", "moody", "gym"],
        brand_personality="Energetic fitness coach",
        brand_focus_areas=["strength training", "nutrition science"],
        parent_brand_name="TestFitBrand",
        cta_options=[{"text": "Follow for daily workouts", "weight": 1}],
        hashtags=["#fitness", "#workout", "#health", "#gym"],
        competitor_accounts=["@fitcompetitor"],
        discovery_hashtags=["#fitfam", "#gymlife"],
        citation_style="none",
        citation_source_types=[],
        yt_title_examples=["Best Home Workout 2025"],
        yt_title_bad_examples=["Click Here!!!"],
        carousel_cta_topic="fitness tips",
        carousel_cta_options=[{"text": "Save this {topic} guide", "weight": 1}],
        carousel_cover_overlay_opacity=65,
        carousel_content_overlay_opacity=85,
        follow_section_text="Follow @testfitbrand for daily tips",
        save_section_text="Save this for your next workout",
        disclaimer_text="Consult a healthcare professional",
        format_b_reel_examples=[],
        format_b_story_niches=["fitness transformations"],
        format_b_story_tone="inspirational",
        format_b_preferred_categories=["workout routines"],
        threads_format_weights={"opinion": 25, "tip": 40, "question": 20, "hot_take": 15},
    )
    db.add(nc)
    db.flush()
    return 1


def seed_brands(db):
    """Seed 2 test brands linked to Content DNA."""
    brands = [
        Brand(
            id=BRAND_A,
            user_id=TEST_USER,
            display_name="TEST BRAND ALPHA",
            short_name="TBA",
            instagram_handle="@testbrandalpha",
            schedule_offset=0,
            posts_per_day=4,
            colors={
                "primary": "#FF5733", "accent": "#33FF57",
                "text": "#FFFFFF", "color_name": "Orange",
                "light_mode": {"bg": "#FFF", "text": "#333"},
                "dark_mode": {"bg": "#1a1a1a", "text": "#FFF"},
            },
            content_dna_id=DNA_ID,
            active=True,
        ),
        Brand(
            id=BRAND_B,
            user_id=TEST_USER,
            display_name="TEST BRAND BETA",
            short_name="TBB",
            instagram_handle="@testbrandbeta",
            schedule_offset=6,
            posts_per_day=3,
            colors={
                "primary": "#3357FF", "accent": "#FF33A1",
                "text": "#FFFFFF", "color_name": "Blue",
                "light_mode": {"bg": "#FFF", "text": "#333"},
                "dark_mode": {"bg": "#0d0d2b", "text": "#FFF"},
            },
            content_dna_id=DNA_ID,
            active=True,
        ),
    ]
    for b in brands:
        db.add(b)
    db.flush()
    return len(brands)


def seed_generation_jobs(db):
    """Seed jobs covering all variants and statuses."""
    variants = ["light", "dark", "format_b", "post", "threads"]
    statuses = ["pending", "generating", "completed", "failed"]
    pipeline_statuses = [None, "pending_review", "approved", "rejected"]
    creators = ["user", "toby"]
    count = 0

    for i, variant in enumerate(variants):
        for j, status in enumerate(statuses):
            job_num = i * len(statuses) + j + 1
            job_id = f"TST-{job_num:06d}"
            pipeline_status = pipeline_statuses[j % len(pipeline_statuses)]
            creator = creators[j % len(creators)]
            brand = BRAND_A if i % 2 == 0 else BRAND_B

            job = GenerationJob(
                job_id=job_id,
                user_id=TEST_USER,
                status=status,
                title=f"TEST {variant.upper()} JOB {job_num}",
                content_lines=["Test line 1", "Test line 2", "Test line 3"],
                variant=variant if variant in ("light", "dark") else "light",
                content_format="format_b" if variant == "format_b" else "format_a",
                brands=[brand],
                platforms=["instagram", "facebook"],
                created_by=creator,
                pipeline_status=pipeline_status,
                quality_score=75 if status == "completed" else None,
                brand_outputs={brand: {"image_url": f"mock://img/{job_id}"}} if status == "completed" else {},
                created_at=NOW - timedelta(hours=job_num),
                completed_at=(NOW - timedelta(hours=job_num - 1)) if status == "completed" else None,
                error_message="Test error" if status == "failed" else None,
            )
            db.add(job)
            count += 1

    db.flush()
    return count


def seed_scheduled_reels(db):
    """Seed scheduled posts across time horizons."""
    entries = [
        # Past — already published
        {"offset_hours": -24, "status": "published", "brand": BRAND_A, "creator": "toby"},
        {"offset_hours": -12, "status": "published", "brand": BRAND_B, "creator": "user"},
        # Past — failed
        {"offset_hours": -6, "status": "failed", "brand": BRAND_A, "creator": "toby"},
        # Future — scheduled
        {"offset_hours": 6, "status": "scheduled", "brand": BRAND_A, "creator": "toby"},
        {"offset_hours": 12, "status": "scheduled", "brand": BRAND_B, "creator": "toby"},
        {"offset_hours": 24, "status": "scheduled", "brand": BRAND_A, "creator": "user"},
        {"offset_hours": 48, "status": "scheduled", "brand": BRAND_B, "creator": "toby"},
    ]

    count = 0
    for i, entry in enumerate(entries):
        sched = ScheduledReel(
            schedule_id=str(uuid.uuid4()),
            user_id=TEST_USER,
            reel_id=f"TST-{i + 1:06d}",
            caption=f"Test caption for scheduled post {i + 1}",
            scheduled_time=NOW + timedelta(hours=entry["offset_hours"]),
            status=entry["status"],
            created_by=entry["creator"],
            published_at=(NOW + timedelta(hours=entry["offset_hours"])) if entry["status"] == "published" else None,
            publish_error="Network timeout" if entry["status"] == "failed" else None,
            extra_data={
                "brand_id": entry["brand"],
                "platforms": ["instagram", "facebook"],
                "content_type": "carousel",
            },
        )
        db.add(sched)
        count += 1

    db.flush()
    return count


def seed_music_library(db):
    """Seed a test music entry."""
    track = MusicLibrary(
        id="test-music-001",
        filename="test_track.mp3",
        storage_url="mock://music/test_track.mp3",
        size_bytes=3145728,
        duration_seconds=15.0,
    )
    db.add(track)
    db.flush()
    return 1


def main():
    clean_only = "--clean" in sys.argv

    print(f"\n{BOLD}{'=' * 50}")
    print(f"  VIRALTOBY — SEED TEST DATA")
    print(f"{'=' * 50}{RESET}")
    print(f"  User: {TEST_USER}")
    print(f"  Mode: {'CLEAN ONLY' if clean_only else 'CLEAN + SEED'}\n")

    with get_db_session() as db:
        # Always clean first
        counts = clean(db)
        for table, n in counts.items():
            if n:
                print(f"  {YELLOW}🧹 Cleaned {n} rows from {table}{RESET}")

        if clean_only:
            print(f"\n  {GREEN}✓ Clean complete{RESET}\n")
            return

        # Seed in dependency order
        seeders = [
            ("Content DNA", seed_niche_config),
            ("Brands", seed_brands),
            ("Generation Jobs", seed_generation_jobs),
            ("Scheduled Reels", seed_scheduled_reels),
            ("Music Library", seed_music_library),
        ]

        total = 0
        for name, fn in seeders:
            n = fn(db)
            total += n
            print(f"  {GREEN}✓ {name}: {n} rows{RESET}")

        print(f"\n{BOLD}  Total: {total} rows seeded")
        print(f"{'=' * 50}{RESET}\n")


if __name__ == "__main__":
    main()
