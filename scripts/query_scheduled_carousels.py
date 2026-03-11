#!/usr/bin/env python3
"""Query upcoming scheduled carousels that need cover re-rendering."""
import psycopg2
import json

DB_URL = "postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

conn = psycopg2.connect(DB_URL, connect_timeout=15)
cur = conn.cursor()

# Get upcoming scheduled carousels from scheduled_reels
cur.execute("""
SELECT sr.schedule_id, sr.reel_id, sr.status, sr.scheduled_time,
       sr.extra_data, sr.user_id, sr.caption
FROM scheduled_reels sr
WHERE sr.status = 'scheduled'
  AND sr.scheduled_time > now()
ORDER BY sr.scheduled_time ASC
LIMIT 30
""")
rows = cur.fetchall()
print(f"Upcoming scheduled posts: {len(rows)}")
carousels = []
for r in rows:
    ed = r[4] if r[4] else {}
    keys = list(ed.keys()) if isinstance(ed, dict) else []
    carousel = ed.get("carousel_paths", []) if isinstance(ed, dict) else []
    if not carousel:
        continue
    bg = ed.get("background_image", "") if isinstance(ed, dict) else ""
    brand = ed.get("brand", "") if isinstance(ed, dict) else ""
    title = ed.get("title", "") if isinstance(ed, dict) else ""
    slide_texts = ed.get("slide_texts", []) if isinstance(ed, dict) else []
    print(f"  schedule={r[0]}, reel={r[1]}, status={r[2]}, time={r[3]}")
    print(f"    user={r[5]}")
    print(f"    brand={brand}, title={title[:80]}")
    print(f"    carousel_paths: {len(carousel)}")
    if carousel:
        print(f"      cover: {carousel[0][:120]}")
    print(f"    bg: {bg[:120] if bg else 'N/A'}")
    print(f"    slide_texts: {len(slide_texts)} slides")
    print(f"    extra_data keys: {keys}")
    carousels.append(r)
    print()

print(f"\nTotal carousels to repair: {len(carousels)}")

# Also get brand configs
brand_names = list(set(
    (r[4] or {}).get("brand", "") for r in carousels if isinstance(r[4], dict)
))
brand_names = [b for b in brand_names if b]
if brand_names:
    placeholders = ",".join(["%s"] * len(brand_names))
    cur.execute(f"""
    SELECT b.id, b.display_name, b.short_name, b.brand_colors, b.logo_path,
           b.ig_username
    FROM brands b
    WHERE b.id IN ({placeholders})
    """, brand_names)
    brands = cur.fetchall()
    print(f"\nBrand configs ({len(brands)}):")
    for b in brands:
        colors = b[3] if b[3] else {}
        print(f"  {b[0]}: name={b[1]}, short={b[2]}, color={colors}, logo={str(b[4])[:80] if b[4] else 'N/A'}, ig={b[5]}")

conn.close()
