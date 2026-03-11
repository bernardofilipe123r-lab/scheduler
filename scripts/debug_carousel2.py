#!/usr/bin/env python3
"""Compare successful vs failed carousel posts."""
import psycopg2
import json

DB_URL = 'postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres'
conn = psycopg2.connect(DB_URL, connect_timeout=15)
cur = conn.cursor()

# Check holisticcollege recent posts
cur.execute("""
    SELECT reel_id, status, scheduled_time, publish_error,
           extra_data->>'variant' as variant
    FROM scheduled_reels
    WHERE reel_id LIKE '%%holisticcollege%%'
    ORDER BY scheduled_time DESC
    LIMIT 10
""")
rows = cur.fetchall()
print('=== holisticcollege recent posts ===')
for r in rows:
    err_str = str(r[3])[:100] if r[3] else "none"
    print(f'  {r[0]}: status={r[1]}, time={r[2]}, variant={r[4]}, error={err_str}')

# Check a SUCCESSFUL carousel post
cur.execute("""
    SELECT extra_data
    FROM scheduled_reels
    WHERE reel_id = 'TOBY-653406_theharmonycollege'
    LIMIT 1
""")
row = cur.fetchone()
if row:
    meta = row[0] or {}
    cp = meta.get('carousel_paths') or []
    print(f'\n=== Successful post TOBY-653406_theharmonycollege ===')
    print(f'carousel_paths count: {len(cp)}')
    for i, p in enumerate(cp):
        print(f'  [{i}]: {p}')

# Check the FAILED carousel post for comparison
cur.execute("""
    SELECT extra_data
    FROM scheduled_reels
    WHERE reel_id = 'TOBY-216953_holisticcollege'
    LIMIT 1
""")
row = cur.fetchone()
if row:
    meta = row[0] or {}
    cp = meta.get('carousel_paths') or []
    print(f'\n=== Failed post TOBY-216953_holisticcollege ===')
    print(f'carousel_paths count: {len(cp)}')
    for i, p in enumerate(cp):
        print(f'  [{i}]: {p}')

# Also check image dimensions
import requests
from io import BytesIO
from PIL import Image

print('\n=== Image dimension check ===')
# Check first few images from the failed post
cur.execute("""
    SELECT extra_data
    FROM scheduled_reels
    WHERE reel_id = 'TOBY-216953_holisticcollege'
    LIMIT 1
""")
row = cur.fetchone()
if row:
    meta = row[0] or {}
    cp = meta.get('carousel_paths') or []
    for i, url in enumerate(cp[:2]):  # Just check first 2
        try:
            r = requests.get(url, timeout=30)
            img = Image.open(BytesIO(r.content))
            print(f'  [{i}]: {img.size} mode={img.mode} format={img.format}')
        except Exception as e:
            print(f'  [{i}]: Error: {e}')

# Check first image from successful post
cur.execute("""
    SELECT extra_data
    FROM scheduled_reels
    WHERE reel_id = 'TOBY-653406_theharmonycollege'
    LIMIT 1
""")
row = cur.fetchone()
if row:
    meta = row[0] or {}
    cp = meta.get('carousel_paths') or []
    for i, url in enumerate(cp[:2]):  # Just check first 2
        try:
            r = requests.get(url, timeout=30)
            img = Image.open(BytesIO(r.content))
            print(f'  Successful [{i}]: {img.size} mode={img.mode} format={img.format}')
        except Exception as e:
            print(f'  Successful [{i}]: Error: {e}')

conn.close()
