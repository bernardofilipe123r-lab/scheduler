"""Check carousel paths for existing scheduled posts."""
import os
import json
from sqlalchemy import create_engine, text

db_url = os.environ.get("DATABASE_URL", "")
if not db_url:
    print("ERROR: DATABASE_URL not set")
    exit(1)

engine = create_engine(db_url)

with engine.connect() as conn:
    rows = conn.execute(text(
        "SELECT schedule_id, reel_id, extra_data "
        "FROM scheduled_reels "
        "WHERE extra_data->>'variant' = 'post' "
        "ORDER BY scheduled_time DESC "
        "LIMIT 5"
    )).fetchall()
    print(f"=== POST SCHEDULED REELS: {len(rows)} ===")
    for r in rows:
        ed = r[2] or {}
        print(f"\nschedule_id: {r[0]}")
        print(f"  reel_id: {r[1]}")
        print(f"  thumbnail_path: {ed.get('thumbnail_path')}")
        print(f"  variant: {ed.get('variant')}")
        print(f"  carousel_image_paths: {ed.get('carousel_image_paths')}")
        print(f"  title: {(ed.get('title', '') or '')[:60]}")
        print(f"  slide_texts count: {len(ed.get('slide_texts') or [])}")
