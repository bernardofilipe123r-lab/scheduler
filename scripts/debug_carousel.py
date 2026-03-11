#!/usr/bin/env python3
"""Debug carousel publishing issues — query DB for metadata."""
import psycopg2
import json
import sys

DB_URL = 'postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres'
conn = psycopg2.connect(DB_URL, connect_timeout=15)
cur = conn.cursor()

# Find the scheduled_reels for TOBY-216953
cur.execute("""
    SELECT schedule_id, reel_id, extra_data, status, scheduled_time
    FROM scheduled_reels
    WHERE reel_id LIKE '%216953%'
    ORDER BY created_at DESC
    LIMIT 3
""")
rows = cur.fetchall()
for r in rows:
    print(f'=== Schedule {r[0]} ===')
    print(f'  reel_id: {r[1]}')
    print(f'  status: {r[3]}')
    print(f'  scheduled_time: {r[4]}')
    meta = r[2] or {}
    print(f'  variant: {meta.get("variant")}')
    print(f'  thumbnail_path: {(meta.get("thumbnail_path") or "")[:150]}')
    cp = meta.get('carousel_paths') or []
    print(f'  carousel_paths count: {len(cp)}')
    for i, p in enumerate(cp):
        print(f'    [{i}]: {p if p else "EMPTY/NONE"}')
    st = meta.get('slide_texts') or []
    print(f'  slide_texts count: {len(st)}')
    print(f'  title: {(meta.get("title") or "")[:80]}')
    pr = meta.get('publish_results') or {}
    print(f'  publish_results: {json.dumps(pr)[:400]}')
    print(f'  publish_error: {meta.get("publish_error", "none")[:200]}')

# Also check recent failed carousel posts
print("\n\n=== Recent FAILED carousel posts ===")
cur.execute("""
    SELECT schedule_id, reel_id, extra_data, status, scheduled_time, publish_error
    FROM scheduled_reels
    WHERE status = 'failed'
    AND extra_data->>'variant' = 'post'
    ORDER BY scheduled_time DESC
    LIMIT 5
""")
rows = cur.fetchall()
for r in rows:
    print(f'\n--- {r[1]} (status={r[3]}, time={r[4]}) ---')
    meta = r[2] or {}
    cp = meta.get('carousel_paths') or []
    print(f'  carousel_paths count: {len(cp)}')
    for i, p in enumerate(cp):
        print(f'    [{i}]: {p[:150] if p else "EMPTY/NONE"}')
    print(f'  publish_error: {(r[5] or "none")[:300]}')


# Check if the failing URLs for TOBY-216953 are accessible
print("\n\n=== URL Accessibility Check for TOBY-216953 ===")
cur.execute("""
    SELECT extra_data
    FROM scheduled_reels
    WHERE reel_id LIKE '%216953%'
    LIMIT 1
""")
row = cur.fetchone()
if row:
    import requests
    meta = row[0] or {}
    cp = meta.get('carousel_paths') or []
    thumb = meta.get('thumbnail_path', '')

    print(f"\nThumbnail: {thumb}")
    if thumb:
        try:
            r = requests.head(thumb, timeout=10)
            print(f"  Status: {r.status_code}, Content-Type: {r.headers.get('content-type', 'unknown')}")
        except Exception as e:
            print(f"  Error: {e}")

    for i, url in enumerate(cp):
        print(f"\n[{i}]: {url}")
        if url:
            try:
                r = requests.head(url, timeout=10)
                print(f"  Status: {r.status_code}, Content-Type: {r.headers.get('content-type', 'unknown')}, Content-Length: {r.headers.get('content-length', 'unknown')}")
            except Exception as e:
                print(f"  Error: {e}")

# Check if ANY carousel posts have published successfully
print("\n\n=== Recent SUCCESSFUL carousel posts ===")
cur.execute("""
    SELECT schedule_id, reel_id, extra_data, status, scheduled_time
    FROM scheduled_reels
    WHERE status = 'published'
    AND extra_data->>'variant' = 'post'
    AND extra_data::text LIKE '%carousel_paths%'
    ORDER BY scheduled_time DESC
    LIMIT 5
""")
rows = cur.fetchall()
if not rows:
    print("  NO successful carousel posts found!")
else:
    for r in rows:
        meta = r[2] or {}
        cp_count = len(meta.get('carousel_paths') or [])
        print(f"  {r[1]} - published at {r[4]}, carousel_paths: {cp_count}")

conn.close()
