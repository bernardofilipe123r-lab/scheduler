#!/usr/bin/env python3
"""Check all holisticcollege carousel posts."""
import psycopg2

DB_URL = 'postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres'
conn = psycopg2.connect(DB_URL, connect_timeout=15)
cur = conn.cursor()

# All holisticcollege posts (carousel/post variant)
cur.execute("""
    SELECT reel_id, status, scheduled_time, publish_error
    FROM scheduled_reels
    WHERE reel_id LIKE '%%holisticcollege%%'
    AND extra_data->>'variant' = 'post'
    ORDER BY scheduled_time DESC
    LIMIT 20
""")
rows = cur.fetchall()
print("=== All holisticcollege carousel posts ===")
for r in rows:
    err = (r[3] or "")[:100]
    print(f"  {r[0]}: {r[1]} at {r[2]} | {err}")

# Count by status
cur.execute("""
    SELECT status, COUNT(*)
    FROM scheduled_reels
    WHERE reel_id LIKE '%%holisticcollege%%'
    AND extra_data->>'variant' = 'post'
    GROUP BY status
""")
print("\n=== holisticcollege carousel status counts ===")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}")

# Check ALL carousel posts across all brands for "Only photo" error
cur.execute("""
    SELECT reel_id, publish_error, scheduled_time
    FROM scheduled_reels
    WHERE publish_error LIKE '%%Only photo%%'
    ORDER BY scheduled_time DESC
    LIMIT 10
""")
rows = cur.fetchall()
print("\n=== ALL posts with 'Only photo or video' error ===")
for r in rows:
    print(f"  {r[0]} at {r[2]}")

# Check what URL the publish actually used - look at successful carousel too
cur.execute("""
    SELECT reel_id, status, extra_data->>'thumbnail_path' as thumb
    FROM scheduled_reels
    WHERE reel_id LIKE '%%holisticcollege%%'
    AND extra_data->>'variant' = 'post'
    AND status = 'published'
    ORDER BY scheduled_time DESC
    LIMIT 3
""")
rows = cur.fetchall()
print("\n=== Successful holisticcollege carousels ===")
for r in rows:
    print(f"  {r[0]}: thumb={r[2]}")

conn.close()
