"""
Re-compose carousel images for scheduled posts that are missing them.

The compose_cover_slide / compose_text_slide calls failed on earlier posts
due to a leading '/' path bug (now fixed). This script re-runs composition
for all scheduled posts where carousel_paths is None but slide_texts exist.

Run via: railway run -- python3 scripts/recompose_carousel.py
"""
import os
import sys
import json

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set. Run via: railway run -- python3 scripts/recompose_carousel.py")
    sys.exit(1)

# Add project root to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.media.post_compositor import compose_cover_slide
from app.services.media.text_slide_compositor import compose_text_slide

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Find posts with slide_texts but no carousel_paths
    rows = conn.execute(text("""
        SELECT schedule_id, reel_id, extra_data
        FROM scheduled_reels
        WHERE status IN ('scheduled', 'publishing')
          AND extra_data->>'variant' = 'post'
          AND extra_data->'slide_texts' IS NOT NULL
          AND jsonb_array_length(extra_data->'slide_texts') > 0
          AND (extra_data->'carousel_paths' IS NULL
               OR extra_data->>'carousel_paths' = 'null')
    """)).fetchall()

    print(f"Found {len(rows)} posts needing re-composition")

    for row in rows:
        sid = row[0]
        reel_id = row[1]
        ed = json.loads(row[2]) if isinstance(row[2], str) else row[2]

        brand = ed.get("brand", "unknown")
        title = ed.get("title", "")
        slide_texts = ed.get("slide_texts", [])
        bg_path = ed.get("thumbnail_path", "")

        print(f"\n--- {sid} | {brand} | reel={reel_id} ---")
        print(f"  title: {title[:60]}")
        print(f"  slide_texts: {len(slide_texts)} slides")
        print(f"  bg_path (raw): {bg_path}")

        # Find the raw background image
        # The thumbnail_path may already be the composed cover or the raw background
        # We need the raw _background.png file
        # Try to find it from the reel_id
        uid8 = reel_id[:8] if reel_id else "unknown"

        # Look for the raw background
        raw_bg_candidates = [
            f"output/posts/post_{brand}_{uid8}_background.png",
            bg_path.lstrip("/") if bg_path else "",
        ]

        raw_bg = None
        for candidate in raw_bg_candidates:
            if candidate and os.path.exists(candidate):
                raw_bg = candidate
                break

        if not raw_bg:
            print(f"  SKIP: No background image found. Tried: {raw_bg_candidates}")
            continue

        print(f"  bg_path (resolved): {raw_bg}")

        # Compose cover slide
        cover_out = f"output/posts/post_{brand}_{uid8}.png"
        try:
            compose_cover_slide(raw_bg, title, brand, cover_out)
            print(f"  OK cover -> {cover_out}")
        except Exception as e:
            print(f"  FAIL cover: {e}")
            continue

        # Compose text slides
        carousel_paths = []
        all_ok = True
        for idx, stxt in enumerate(slide_texts):
            is_last = idx == len(slide_texts) - 1
            slide_out = f"output/posts/post_{brand}_{uid8}_slide{idx}.png"
            try:
                compose_text_slide(brand, stxt, slide_texts, is_last, slide_out)
                carousel_paths.append(slide_out)
                print(f"  OK slide {idx} -> {slide_out}")
            except Exception as e:
                print(f"  FAIL slide {idx}: {e}")
                all_ok = False
                break

        if not all_ok:
            print(f"  SKIP DB update due to slide failure")
            continue

        # Update DB: set thumbnail_path to composed cover, add carousel_paths
        conn.execute(
            text("""
                UPDATE scheduled_reels
                SET extra_data = jsonb_set(
                    jsonb_set(extra_data, '{thumbnail_path}', :cover::jsonb),
                    '{carousel_paths}', :carousel::jsonb
                )
                WHERE schedule_id = :sid
            """),
            {
                "cover": json.dumps(cover_out),
                "carousel": json.dumps(carousel_paths),
                "sid": sid,
            }
        )
        print(f"  DB updated: thumbnail_path={cover_out}, carousel_paths={len(carousel_paths)} slides")

    conn.commit()
    print(f"\nDone. Processed {len(rows)} posts.")
