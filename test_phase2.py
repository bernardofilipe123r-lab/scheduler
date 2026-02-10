"""
Phase 2 Validation — Anti-Repetition & Quality Engine.

Tests all components end-to-end using an in-memory SQLite database.
Run: python3 test_phase2.py   (inside venv)
"""

import os
import sys
import hashlib
import re
from datetime import datetime, timedelta
from unittest.mock import patch

# ── Environment & dotenv shim ────────────────────────────────
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("DEEPSEEK_API_KEY", "test-key")

# Ensure app.__init__ can load dotenv
try:
    import dotenv
except ImportError:
    import types
    _dotenv = types.ModuleType("dotenv")
    _dotenv.load_dotenv = lambda *a, **k: None
    sys.modules["dotenv"] = _dotenv

# ── Set up in-memory SQLite before any app imports ───────────
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine("sqlite:///:memory:", echo=False)

# Monkey-patch db_connection BEFORE importing anything that uses it
import app.db_connection as db_conn
db_conn.engine = engine
db_conn.SessionLocal = sessionmaker(bind=engine)

# NOW import app code
from app.models import Base, ContentHistory
from app.services.content_tracker import (
    ContentTracker,
    check_post_quality,
    PostQualityResult,
    TOPIC_BUCKETS,
    TOPIC_COOLDOWN_DAYS,
    FINGERPRINT_COOLDOWN_DAYS,
    get_content_tracker,
)

# Create tables
Base.metadata.create_all(bind=engine)

# ── Reset singleton between tests ───────────────────────────
def fresh_tracker() -> ContentTracker:
    ContentTracker._instance = None
    t = ContentTracker()
    return t


# ════════════════════════════════════════════════════════════
#  TEST HELPERS
# ════════════════════════════════════════════════════════════

passed = 0
failed = 0
errors = []

def ok(name: str, condition: bool, detail: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        msg = f"  ❌ {name}" + (f"  →  {detail}" if detail else "")
        print(msg)
        errors.append(msg)


# ════════════════════════════════════════════════════════════
#  1. ContentHistory MODEL — pure methods
# ════════════════════════════════════════════════════════════

def test_model():
    print("\n── 1. ContentHistory model ──")

    # compute_keyword_hash
    h1 = ContentHistory.compute_keyword_hash("Ashwagandha reduces cortisol by 30%")
    h2 = ContentHistory.compute_keyword_hash("By 30% cortisol reduces ashwagandha")  # same words
    h3 = ContentHistory.compute_keyword_hash("Turmeric boosts brain health")
    ok("Same-words titles → same hash", h1 == h2, f"{h1} != {h2}")
    ok("Different titles → different hash", h1 != h3)
    ok("Hash is 16 hex chars", len(h1) == 16 and all(c in "0123456789abcdef" for c in h1))

    # extract_keywords
    kw = ContentHistory.extract_keywords("The Amazing Benefits of Turmeric for Your Skin")
    ok("extract_keywords removes stop words", "the" not in kw and "of" not in kw and "for" not in kw)
    ok("extract_keywords keeps content words", "turmeric" in kw and "skin" in kw and "amazing" in kw)
    ok("Keywords are sorted", kw == " ".join(sorted(kw.split())))

    # classify_topic_bucket
    ok("Turmeric → superfoods", ContentHistory.classify_topic_bucket("Turmeric golden paste recipe") == "superfoods")
    ok("Matcha tea → teas_drinks", ContentHistory.classify_topic_bucket("Matcha tea health benefits") == "teas_drinks")
    ok("Magnesium → supplements", ContentHistory.classify_topic_bucket("Magnesium supplement for sleep") == "supplements")
    ok("Melatonin deep sleep → sleep", ContentHistory.classify_topic_bucket("Melatonin for deep sleep at night") == "sleep")
    ok("Morning routine → morning_routines", ContentHistory.classify_topic_bucket("5 AM morning routine for energy") == "morning_routines")
    ok("Skin collagen → skin_antiaging", ContentHistory.classify_topic_bucket("Collagen for skin elasticity and wrinkles") == "skin_antiaging")
    ok("Gut microbiome → gut_health", ContentHistory.classify_topic_bucket("Your gut microbiome and digestion") == "gut_health")
    ok("Cortisol hormone → hormones", ContentHistory.classify_topic_bucket("How to balance hormones and cortisol") == "hormones")
    ok("Stress anxiety → stress_mood", ContentHistory.classify_topic_bucket("Reduce stress and anxiety naturally") == "stress_mood")
    ok("Detox water → hydration_detox", ContentHistory.classify_topic_bucket("Detox water with lemon for cleanse") == "hydration_detox")
    ok("Brain memory → brain_memory", ContentHistory.classify_topic_bucket("Boost brain memory and cognitive function") == "brain_memory")
    ok("Heart cholesterol → heart_health", ContentHistory.classify_topic_bucket("Lower cholesterol for heart health") == "heart_health")
    ok("Random topic → general", ContentHistory.classify_topic_bucket("The importance of daily habits") == "general")


# ════════════════════════════════════════════════════════════
#  2. QUALITY GATE — check_post_quality
# ════════════════════════════════════════════════════════════

def test_quality_gate():
    print("\n── 2. Quality gate (check_post_quality) ──")

    # Good title + caption → pass
    r = check_post_quality(
        "Ashwagandha can reduce cortisol levels by 30%",
        "Research shows ashwagandha helps lower stress. Source: DOI: 10.xxx. Disclaimer: not medical advice."
    )
    ok("Good post → passes", r.passed, f"score={r.score}, issues={r.issues}")
    ok("Good post → score >= 80", r.score >= 80, f"score={r.score}")

    # Title too short (< 10 chars gets 50-point hard fail)
    r = check_post_quality("Hi", "Full caption here")
    ok("Short title → fails", not r.passed, f"score={r.score}")

    # Title ends with period
    r = check_post_quality("Ashwagandha reduces cortisol levels by 30%.", "")
    ok("Period penalty applied", "ends with period" in " ".join(r.issues).lower())

    # ALL CAPS title
    r = check_post_quality("TURMERIC IS THE BEST SUPERFOOD EVER KNOWN TO MAN", "")
    ok("ALL CAPS penalty", "ALL CAPS" in " ".join(r.issues))

    # Numbered list
    r = check_post_quality("5 Ways to Boost Your Brain Power", "")
    ok("Numbered title penalty", "number" in " ".join(r.issues).lower())

    # Em-dash
    r = check_post_quality("Turmeric — the golden spice of health", "")
    ok("Em-dash penalty", "em-dash" in " ".join(r.issues).lower() or "en-dash" in " ".join(r.issues).lower())

    # Caption missing DOI
    r = check_post_quality(
        "Ashwagandha reduces cortisol levels naturally",
        "Great stuff for your health. Not much else here. Disclaimer: blah."
    )
    ok("Missing DOI penalty", "DOI" in " ".join(r.issues) or "source" in " ".join(r.issues).lower())

    # Caption missing disclaimer
    r = check_post_quality(
        "Ashwagandha reduces cortisol levels naturally",
        "Great stuff for your health. Source: DOI: 10.xxx."
    )
    ok("Missing disclaimer penalty", "disclaimer" in " ".join(r.issues).lower())

    # Caption too short
    r = check_post_quality(
        "Ashwagandha reduces cortisol levels naturally",
        "Short."
    )
    ok("Short caption penalty", "too short" in " ".join(r.issues).lower())

    # Title too long (> 150 chars)
    r = check_post_quality("A" * 160, "")
    ok("Long title penalty", "too long" in " ".join(r.issues).lower())


# ════════════════════════════════════════════════════════════
#  3. CONTENT TRACKER — record, duplicate, topic rotation
# ════════════════════════════════════════════════════════════

def test_tracker_record():
    print("\n── 3. ContentTracker — record & duplicate detection ──")

    tracker = fresh_tracker()

    # Record a post
    entry_id = tracker.record(
        title="Ashwagandha can reduce cortisol levels by 30%",
        content_type="post",
        brand="healthycollege",
        quality_score=85.0,
    )
    ok("record() returns an ID", entry_id is not None and isinstance(entry_id, int))

    # Record a reel
    reel_id = tracker.record(
        title="Top 5 Superfoods You Need in 2025",
        content_type="reel",
        brand="healthycollege",
    )
    ok("record() reel returns an ID", reel_id is not None)

    # Check duplicate detection
    is_dup = tracker.is_duplicate("Ashwagandha can reduce cortisol levels by 30%", "post")
    ok("Exact same title → duplicate", is_dup)

    is_dup2 = tracker.is_duplicate("cortisol levels reduce ashwagandha", "post")
    ok("Same keywords different order → duplicate", is_dup2)

    is_dup3 = tracker.is_duplicate("Turmeric boosts brain health significantly", "post")
    ok("Different title → not duplicate", not is_dup3)

    # Cross-type: same title as post should NOT flag as reel duplicate
    is_dup4 = tracker.is_duplicate("Ashwagandha can reduce cortisol levels by 30%", "reel")
    ok("Cross-type isolation (post title not dup for reel)", not is_dup4)


def test_tracker_topics():
    print("\n── 4. ContentTracker — topic rotation ──")

    tracker = fresh_tracker()

    # No history → all topics available
    available = tracker.get_available_topics("post")
    ok("Fresh DB → all topics available", len(available) == len(TOPIC_BUCKETS),
       f"{len(available)} != {len(TOPIC_BUCKETS)}")

    # Record a supplements post
    tracker.record(title="Collagen supplement for skin", content_type="post",
                   brand="healthycollege", quality_score=80.0)

    # Record a sleep post
    tracker.record(title="How to improve deep sleep at night", content_type="post",
                   brand="healthycollege", quality_score=75.0)

    # Check cooldowns
    cooldowns = tracker.get_topic_cooldowns("post")
    ok("Cooldowns recorded", len(cooldowns) >= 2, f"cooldowns: {list(cooldowns.keys())}")

    # Those topics should be on cooldown (within last TOPIC_COOLDOWN_DAYS)
    available = tracker.get_available_topics("post")
    ok("Recently used topics on cooldown", "sleep" not in available or "supplements" not in available,
       f"available: {available}")

    # Unused topics should still be available
    ok("Unused topics still available", "brain_memory" in available or "heart_health" in available)


def test_tracker_recent_titles():
    print("\n── 5. ContentTracker — recent titles & history context ──")

    tracker = fresh_tracker()

    titles_to_add = [
        "Ashwagandha can reduce cortisol by 30%",
        "Turmeric golden paste for inflammation",
        "Matcha tea antioxidant benefits",
        "Deep sleep with magnesium supplements",
        "Morning stretching routine for energy",
    ]
    for t in titles_to_add:
        tracker.record(title=t, content_type="post", brand="healthycollege")

    # get_recent_titles
    recent = tracker.get_recent_titles("post", limit=10)
    ok("get_recent_titles returns correct count", len(recent) == 5,
       f"got {len(recent)}")
    ok("Most recent title is last added", "Morning stretching" in recent[0],
       f"first: {recent[0]}")

    # Brand filter
    tracker.record(title="Gut health for longevity", content_type="post", brand="longevitycollege")
    brand_titles = tracker.get_recent_titles("post", brand="longevitycollege")
    ok("Brand filter works", len(brand_titles) == 1 and "Gut health" in brand_titles[0])

    # Content-type filter
    tracker.record(title="Some reel about tea", content_type="reel")
    post_titles = tracker.get_recent_titles("post")
    reel_titles = tracker.get_recent_titles("reel")
    ok("Content type filter works", "Some reel about tea" not in post_titles)
    ok("Reel titles separate", "Some reel about tea" in reel_titles)

    # build_history_context
    ctx = tracker.build_history_context("post", limit=10)
    ok("History context is non-empty", len(ctx) > 50, f"len={len(ctx)}")
    ok("Context contains PREVIOUSLY GENERATED header", "PREVIOUSLY GENERATED" in ctx)
    ok("Context contains actual titles", "Ashwagandha" in ctx or "Turmeric" in ctx)


def test_tracker_pick_topic():
    print("\n── 6. ContentTracker — pick_topic ──")

    tracker = fresh_tracker()

    # With topic_hint → classifies
    topic = tracker.pick_topic("post", topic_hint="Turmeric golden benefits")
    ok("topic_hint classifies correctly", topic == "superfoods", f"got: {topic}")

    # Without hint, no history → random from all
    topic = tracker.pick_topic("post")
    ok("No hint → picks from all buckets", topic in TOPIC_BUCKETS, f"got: {topic}")

    # Record several topics, the picked one should avoid recent
    for t in ["Turmeric for skin", "Matcha tea morning", "Deep sleep melatonin",
              "Collagen supplement", "Gut microbiome health"]:
        tracker.record(title=t, content_type="post")

    recent_buckets = tracker.get_recent_topic_buckets("post", limit=5)
    picked = tracker.pick_topic("post")
    ok("Picks a topic NOT recently used", picked not in recent_buckets or len(recent_buckets) >= len(TOPIC_BUCKETS) - 1,
       f"picked={picked}, recent={recent_buckets}")


def test_tracker_stats():
    print("\n── 7. ContentTracker — stats ──")

    tracker = fresh_tracker()

    tracker.record(title="Ashwagandha cortisol benefits", content_type="post",
                   quality_score=85.0, brand="healthycollege")
    tracker.record(title="Turmeric anti-inflammatory power", content_type="post",
                   quality_score=90.0, brand="healthycollege")
    tracker.record(title="Sleep hygiene tips for better rest", content_type="post",
                   quality_score=70.0, brand="longevitycollege")

    stats = tracker.get_stats("post")
    ok("Stats total = 3", stats.get("total_generated") == 3, f"got {stats.get('total_generated')}")
    ok("Stats has avg_quality_score", stats.get("avg_quality_score") is not None)
    ok("Stats avg_quality ≈ 81.7", abs(stats["avg_quality_score"] - 81.7) < 1,
       f"got {stats['avg_quality_score']}")
    ok("Stats has topics_available", "topics_available" in stats)
    ok("Stats has topics_on_cooldown", "topics_on_cooldown" in stats)


# ════════════════════════════════════════════════════════════
#  4. INTEGRATION — ContentGeneratorV2 uses tracker
# ════════════════════════════════════════════════════════════

def test_generator_integration():
    print("\n── 8. ContentGeneratorV2 integration ──")

    from app.services.content_generator_v2 import ContentGeneratorV2

    gen = ContentGeneratorV2()

    ok("Generator has content_tracker attr", hasattr(gen, 'content_tracker'))
    ok("content_tracker is a ContentTracker", isinstance(gen.content_tracker, ContentTracker))

    # Check that the tracker method is used in the code (static analysis)
    import inspect
    source = inspect.getsource(ContentGeneratorV2.generate_post_title)
    ok("generate_post_title uses tracker.build_history_context", "build_history_context" in source)
    ok("generate_post_title uses tracker.pick_topic", "pick_topic" in source)
    ok("generate_post_title uses tracker.record", "tracker.record" in source)
    ok("generate_post_title uses check_post_quality", "check_post_quality" in source)

    # Check generate_post_titles_batch
    source_batch = inspect.getsource(ContentGeneratorV2.generate_post_titles_batch)
    ok("batch uses tracker.build_history_context", "build_history_context" in source_batch)
    ok("batch uses tracker.record", "tracker.record" in source_batch or "content_tracker.record" in source_batch)

    # Check generate_viral_content (reels)
    source_viral = inspect.getsource(ContentGeneratorV2.generate_viral_content)
    ok("generate_viral_content uses tracker.record", "tracker.record" in source_viral or "content_tracker.record" in source_viral)

    # Check _generate_with_quality_loop
    source_loop = inspect.getsource(ContentGeneratorV2._generate_with_quality_loop)
    ok("quality_loop uses tracker titles for prompt", "content_tracker.get_recent_titles" in source_loop)


# ════════════════════════════════════════════════════════════
#  5. DB TABLE SCHEMA — validate model matches expected schema
# ════════════════════════════════════════════════════════════

def test_db_schema():
    print("\n── 9. DB schema validation ──")

    from sqlalchemy import inspect as sa_inspect

    inspector = sa_inspect(engine)
    tables = inspector.get_table_names()
    ok("content_history table exists", "content_history" in tables,
       f"tables: {tables}")

    columns = {col["name"]: col for col in inspector.get_columns("content_history")}
    expected = ["id", "content_type", "title", "keyword_hash", "keywords",
                "topic_bucket", "brand", "quality_score", "was_used",
                "image_prompt", "caption", "created_at"]
    for col_name in expected:
        ok(f"Column '{col_name}' exists", col_name in columns,
           f"missing from {list(columns.keys())}")

    # Check indexes
    indexes = inspector.get_indexes("content_history")
    index_names = [idx["name"] for idx in indexes]
    ok("Composite index type_topic exists",
       any("type_topic" in (n or "") for n in index_names),
       f"indexes: {index_names}")
    ok("Composite index type_brand exists",
       any("type_brand" in (n or "") for n in index_names),
       f"indexes: {index_names}")
    ok("Composite index type_created exists",
       any("type_created" in (n or "") for n in index_names),
       f"indexes: {index_names}")


# ════════════════════════════════════════════════════════════
#  6. EDGE CASES
# ════════════════════════════════════════════════════════════

def test_edge_cases():
    print("\n── 10. Edge cases ──")

    tracker = fresh_tracker()

    # Empty title
    r = check_post_quality("", "")
    ok("Empty title → fails", not r.passed)

    # Unicode / special chars in title
    h = ContentHistory.compute_keyword_hash("Açaí berry — the super-fruit 🍇")
    ok("Unicode title hashes without error", len(h) == 16)

    bucket = ContentHistory.classify_topic_bucket("Açaí berry superfood")
    ok("Unicode title classifies correctly", bucket == "superfoods")

    # Record with None brand
    entry_id = tracker.record(title="Test no brand", content_type="post", brand=None)
    ok("Record with None brand works", entry_id is not None)

    # Topic singleton
    t1 = get_content_tracker()
    t2 = get_content_tracker()
    ok("get_content_tracker is singleton", t1 is t2)

    # TOPIC_BUCKETS list consistency
    ok("13 topic buckets defined", len(TOPIC_BUCKETS) == 13, f"got {len(TOPIC_BUCKETS)}")
    ok("'general' is a bucket", "general" in TOPIC_BUCKETS)

    # get_available_topics with 0-day cooldown → all available even if recently used
    tracker.record(title="Sleep tips for insomnia", content_type="post")
    avail = tracker.get_available_topics("post", cooldown_days=0)
    ok("0-day cooldown → all available", len(avail) == len(TOPIC_BUCKETS),
       f"{len(avail)} != {len(TOPIC_BUCKETS)}")


# ════════════════════════════════════════════════════════════
#  RUN ALL
# ════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("  Phase 2 Validation: Anti-Repetition & Quality Engine")
    print("=" * 60)

    # Reset DB between test groups
    def reset_db():
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        ContentTracker._instance = None

    test_model()

    reset_db()
    test_quality_gate()

    reset_db()
    test_tracker_record()

    reset_db()
    test_tracker_topics()

    reset_db()
    test_tracker_recent_titles()

    reset_db()
    test_tracker_pick_topic()

    reset_db()
    test_tracker_stats()

    reset_db()
    test_generator_integration()

    reset_db()
    test_db_schema()

    reset_db()
    test_edge_cases()

    # ── SUMMARY ──
    print("\n" + "=" * 60)
    total = passed + failed
    print(f"  RESULT: {passed}/{total} passed", end="")
    if failed:
        print(f"  ({failed} FAILED)")
        print("\n  Failures:")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)
    else:
        print("  — ALL PASSED ✅")
        sys.exit(0)
