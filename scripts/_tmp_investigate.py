"""Temporary investigation script — delete after use."""
import sys
sys.path.insert(0, ".")
from app.db_connection import SessionLocal
from sqlalchemy import text

db = SessionLocal()

# 1. Recent published reels (all brands)
print("=" * 120)
print("RECENT PUBLISHED REELS (last 30)")
print("=" * 120)
rows = db.execute(text("""
    SELECT schedule_id, status, scheduled_time, published_at, created_by,
           extra_data->>'title' as title,
           extra_data->>'brand' as brand,
           extra_data->>'variant' as variant,
           reel_id
    FROM scheduled_reels
    WHERE status = 'published'
    ORDER BY published_at DESC NULLS LAST
    LIMIT 30
""")).fetchall()
for r in rows:
    title = (r.title or 'N/A')[:55]
    print(f"{r.schedule_id[:14]} | {r.brand or '?':20} | {str(r.published_at)[:19]} | {r.variant or '?':6} | {r.created_by:5} | {title}")

# 2. Find duplicates: same brand + same title published within 7 days
print("\n" + "=" * 120)
print("DUPLICATE TITLES (same brand, same title, published within 7 days)")
print("=" * 120)
dupes = db.execute(text("""
    SELECT extra_data->>'brand' as brand,
           extra_data->>'title' as title,
           COUNT(*) as cnt,
           array_agg(schedule_id ORDER BY published_at) as ids,
           array_agg(published_at::text ORDER BY published_at) as pub_times
    FROM scheduled_reels
    WHERE status = 'published'
      AND published_at > NOW() - INTERVAL '7 days'
    GROUP BY extra_data->>'brand', extra_data->>'title'
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
""")).fetchall()
if not dupes:
    print("  No duplicates found in last 7 days.")
else:
    for d in dupes:
        print(f"\n  BRAND: {d.brand} | COUNT: {d.cnt} | TITLE: {(d.title or '?')[:70]}")
        for sid, pt in zip(d.ids, d.pub_times):
            print(f"    ID: {sid} | published_at: {pt}")

# 3. Check if same reel_id was published multiple times
print("\n" + "=" * 120)
print("SAME REEL_ID PUBLISHED MULTIPLE TIMES (last 14 days)")
print("=" * 120)
reel_dupes = db.execute(text("""
    SELECT reel_id, COUNT(*) as cnt,
           array_agg(schedule_id ORDER BY published_at) as ids,
           array_agg(extra_data->>'brand' ORDER BY published_at) as brands,
           array_agg(published_at::text ORDER BY published_at) as pub_times
    FROM scheduled_reels
    WHERE status = 'published'
      AND published_at > NOW() - INTERVAL '14 days'
    GROUP BY reel_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
""")).fetchall()
if not reel_dupes:
    print("  No reel_id duplicates found.")
else:
    for d in reel_dupes:
        print(f"\n  REEL_ID: {d.reel_id} | COUNT: {d.cnt}")
        for sid, b, pt in zip(d.ids, d.brands, d.pub_times):
            print(f"    ID: {sid} | brand: {b} | published_at: {pt}")

# 4. All longevity entries (scheduled or published) in last 7 days
print("\n" + "=" * 120)
print("ALL LONGEVITY ENTRIES (last 7 days, any status)")
print("=" * 120)
longevity = db.execute(text("""
    SELECT schedule_id, status, scheduled_time, published_at, created_by,
           extra_data->>'title' as title,
           extra_data->>'brand' as brand,
           reel_id,
           publish_error
    FROM scheduled_reels
    WHERE (extra_data->>'brand' ILIKE '%longevity%'
           OR user_id IN (SELECT DISTINCT user_id FROM scheduled_reels WHERE extra_data->>'brand' ILIKE '%longevity%'))
      AND created_at > NOW() - INTERVAL '7 days'
    ORDER BY scheduled_time DESC
""")).fetchall()
for r in longevity:
    title = (r.title or 'N/A')[:50]
    err = (r.publish_error or '')[:40]
    print(f"{r.schedule_id[:14]} | {r.status:10} | sched={str(r.scheduled_time)[:16]} | pub={str(r.published_at)[:16] if r.published_at else 'None':16} | {r.brand or '?':20} | reel={r.reel_id[:10] if r.reel_id else '?'} | {title} | err={err}")

# 5. Check for multiple scheduled_reels pointing to the same generation job
print("\n" + "=" * 120)
print("CHECK: Multiple schedule entries from same generation job (last 7 days)")
print("=" * 120)
job_dupes = db.execute(text("""
    SELECT extra_data->>'job_id' as job_id,
           extra_data->>'brand' as brand,
           COUNT(*) as cnt,
           array_agg(schedule_id ORDER BY scheduled_time) as sched_ids
    FROM scheduled_reels
    WHERE extra_data->>'job_id' IS NOT NULL
      AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY extra_data->>'job_id', extra_data->>'brand'
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 10
""")).fetchall()
if not job_dupes:
    print("  No job_id duplicates found.")
else:
    for d in job_dupes:
        print(f"  JOB: {d.job_id} | BRAND: {d.brand} | COUNT: {d.cnt} | IDs: {d.sched_ids}")

db.close()
print("\nDone.")
