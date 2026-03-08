"""Investigate duplicate content scheduling bug."""
import sys
sys.path.insert(0, '.')

from app.db_connection import SessionLocal
from sqlalchemy import text

db = SessionLocal()

# 1. Check for duplicate TITLES per brand (last 30 days)
print("=" * 80)
print("DUPLICATE TITLES PER BRAND (last 30 days)")
print("=" * 80)
rows = db.execute(text("""
    SELECT 
        extra_data->>'brand' as brand,
        extra_data->>'title' as title,
        COUNT(*) as cnt,
        array_agg(schedule_id ORDER BY scheduled_time) as schedule_ids,
        array_agg(status ORDER BY scheduled_time) as statuses,
        array_agg(scheduled_time::text ORDER BY scheduled_time) as times,
        array_agg(extra_data->>'variant' ORDER BY scheduled_time) as variants,
        array_agg(created_by ORDER BY scheduled_time) as created_bys
    FROM scheduled_reels
    WHERE created_at > NOW() - INTERVAL '30 days'
    AND extra_data->>'title' IS NOT NULL
    GROUP BY extra_data->>'brand', extra_data->>'title'
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 30
""")).fetchall()

if not rows:
    print("  No duplicate titles found\n")
else:
    for r in rows:
        print(f"  Brand: {r[0]}")
        print(f"  Title: {(r[1] or '')[:100]}")
        print(f"  Count: {r[2]}")
        print(f"  IDs: {r[3]}")
        print(f"  Statuses: {r[4]}")
        print(f"  Times: {r[5]}")
        print(f"  Variants: {r[6]}")
        print(f"  Created by: {r[7]}")
        print()

# 2. Check for duplicate captions per brand
print("=" * 80)
print("DUPLICATE CAPTIONS PER BRAND (last 30 days)")
print("=" * 80)
rows2 = db.execute(text("""
    SELECT 
        extra_data->>'brand' as brand,
        LEFT(caption, 100) as caption_start,
        COUNT(*) as cnt,
        array_agg(schedule_id ORDER BY scheduled_time) as schedule_ids,
        array_agg(status ORDER BY scheduled_time) as statuses,
        array_agg(scheduled_time::text ORDER BY scheduled_time) as times
    FROM scheduled_reels
    WHERE created_at > NOW() - INTERVAL '30 days'
    AND caption IS NOT NULL AND caption != 'CHANGE ME'
    GROUP BY extra_data->>'brand', LEFT(caption, 100)
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 30
""")).fetchall()

if not rows2:
    print("  No duplicate captions found\n")
else:
    for r in rows2:
        print(f"  Brand: {r[0]}")
        print(f"  Caption: {(r[1] or '')[:80]}...")
        print(f"  Count: {r[2]}")
        print(f"  IDs: {r[3]}")
        print(f"  Statuses: {r[4]}")
        print(f"  Times: {r[5]}")
        print()

# 3. ALL posts for longevity brand (last 14 days)
print("=" * 80)
print("ALL POSTS FOR thelongevitycollege (last 14 days)")
print("=" * 80)
rows3 = db.execute(text("""
    SELECT 
        schedule_id,
        scheduled_time,
        status,
        created_at,
        created_by,
        extra_data->>'variant' as variant,
        extra_data->>'title' as title,
        LEFT(caption, 60) as caption_preview
    FROM scheduled_reels
    WHERE extra_data->>'brand' LIKE '%longevity%'
    AND created_at > NOW() - INTERVAL '14 days'
    ORDER BY scheduled_time ASC
""")).fetchall()

print(f"  Total posts: {len(rows3)}")
for r in rows3:
    print(f"  [{r[2]:12}] {r[0]} | sched={r[1]} | created={r[3]} | by={r[4]} | {r[5]}")
    t = (r[6] or '')[:80]
    c = (r[7] or '').replace('\n', ' ')[:60]
    print(f"    title: {t}")
    print(f"    caption: {c}")
    print()

# 4. Check ALL brands for longevity user
print("=" * 80)
print("ALL BRANDS FOR THE USER WHO OWNS thelongevitycollege")
print("=" * 80)
rows4 = db.execute(text("""
    SELECT DISTINCT sr.user_id, b.id, b.name
    FROM scheduled_reels sr
    JOIN brands b ON b.user_id = sr.user_id
    WHERE sr.extra_data->>'brand' LIKE '%longevity%'
    LIMIT 20
""")).fetchall()
for r in rows4:
    print(f"  User: {r[0][:30]}... | Brand ID: {r[1]} | Name: {r[2]}")

# 5. Check for exact reel_id duplicates
print()
print("=" * 80)
print("DUPLICATE REEL_IDs (any brand, last 30 days)")
print("=" * 80)
rows5 = db.execute(text("""
    SELECT 
        reel_id,
        extra_data->>'brand' as brand,
        COUNT(*) as cnt,
        array_agg(schedule_id) as schedule_ids,
        array_agg(status) as statuses
    FROM scheduled_reels
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY reel_id, extra_data->>'brand'
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 20
""")).fetchall()

if not rows5:
    print("  No duplicate reel_ids found\n")
else:
    for r in rows5:
        print(f"  Reel ID: {r[0]} | Brand: {r[1]} | Count: {r[2]}")
        print(f"    Schedule IDs: {r[3]}")
        print(f"    Statuses: {r[4]}")
        print()

# 6. Check content tracker fingerprints for longevity  
print("=" * 80)
print("CONTENT FINGERPRINTS (recent, longevity brand)")
print("=" * 80)
try:
    rows6 = db.execute(text("""
        SELECT 
            brand_id, fingerprint, title, created_at, content_type
        FROM content_fingerprints
        WHERE brand_id LIKE '%longevity%'
        AND created_at > NOW() - INTERVAL '14 days'
        ORDER BY created_at DESC
        LIMIT 30
    """)).fetchall()
    for r in rows6:
        print(f"  Brand: {r[0]} | FP: {r[1][:20]}... | Title: {(r[2] or '')[:60]} | {r[3]} | {r[4]}")
except Exception as e:
    print(f"  Content fingerprints table query failed: {e}")

db.close()
print("\nDone.")
