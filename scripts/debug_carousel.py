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
    SELECT id, reel_id, metadata, status, publish_results, scheduled_time
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
    print(f'  scheduled_time: {r[5]}')
    meta = r[2] or {}
    print(f'  variant: {meta.get("variant")}')
    print(f'  thumbnail_path: {(meta.get("thumbnail_path") or "")[:150]}')
    cp = meta.get('carousel_paths') or []
    print(f'  carousel_paths count: {len(cp)}')
    for i, p in enumerate(cp):
        print(f'    [{i}]: {p[:150] if p else "EMPTY/NONE"}')
    st = meta.get('slide_texts') or []
    print(f'  slide_texts count: {len(st)}')
    print(f'  title: {(meta.get("title") or "")[:80]}')
    pr = r[4] or {}
    print(f'  publish_results: {json.dumps(pr)[:400]}')

# Also check recent failed carousel posts
print("\n\n=== Recent FAILED carousel posts ===")
cur.execute("""
    SELECT id, reel_id, metadata, status, publish_results, scheduled_time
    FROM scheduled_reels
    WHERE status = 'failed'
    AND metadata->>'variant' = 'post'
    ORDER BY scheduled_time DESC
    LIMIT 5
""")
rows = cur.fetchall()
for r in rows:
    print(f'\n--- {r[1]} (status={r[3]}, time={r[5]}) ---')
    meta = r[2] or {}
    cp = meta.get('carousel_paths') or []
    print(f'  carousel_paths count: {len(cp)}')
    for i, p in enumerate(cp):
        print(f'    [{i}]: {p[:150] if p else "EMPTY/NONE"}')
    pr = r[4] or {}
    ig = pr.get('instagram', {})
    print(f'  ig error: {ig.get("error", "none")[:200]}')

conn.close()
