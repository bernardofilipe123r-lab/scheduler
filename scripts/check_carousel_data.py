#!/usr/bin/env python3
"""Check where carousel data lives in upcoming scheduled posts and generation_jobs."""
import psycopg2
import json

DB_URL = "postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

conn = psycopg2.connect(DB_URL, connect_timeout=15)
cur = conn.cursor()

# 1. Check extra_data keys in upcoming scheduled_reels
cur.execute("""
SELECT sr.schedule_id, sr.extra_data, sr.scheduled_time
FROM scheduled_reels sr
WHERE sr.status = 'scheduled'
  AND sr.scheduled_time > now()
ORDER BY sr.scheduled_time ASC
LIMIT 5
""")
rows = cur.fetchall()
print(f"=== Upcoming scheduled_reels (first 5) ===")
for r in rows:
    ed = r[1] if r[1] else {}
    if isinstance(ed, dict):
        print(f"  {r[0]} (time={r[2]}) keys={list(ed.keys())}")
        ct = ed.get("content_type", ed.get("contentType", "?"))
        print(f"    content_type={ct}")
        for k in ["carousel_paths", "carousel_image_urls", "image_urls", "background_image", "brand", "title", "slide_texts"]:
            if k in ed:
                val = ed[k]
                if isinstance(val, list):
                    print(f"    {k}: {len(val)} items, first={str(val[0])[:100] if val else 'empty'}")
                else:
                    print(f"    {k}: {str(val)[:100]}")
    print()

# 2. Check recent carousel generation_jobs that are completed
cur.execute("""
SELECT j.job_id, j.brands, j.title, j.status, j.content_format,
       j.brand_outputs, j.created_at
FROM generation_jobs j
WHERE j.content_format = 'carousel'
  OR j.job_id LIKE '%%carousel%%'
  OR (j.brand_outputs IS NOT NULL AND j.brand_outputs::text LIKE '%%carousel%%')
ORDER BY j.created_at DESC
LIMIT 5
""")
rows2 = cur.fetchall()
print(f"=== Recent carousel generation_jobs ===")
for r in rows2:
    bo = r[5] if r[5] else {}
    print(f"  {r[0]} | brands={r[1]} | format={r[4]} | status={r[3]} | created={r[6]}")
    print(f"    title: {(r[2] or '')[:80]}")
    if isinstance(bo, dict):
        for brand_key, brand_data in bo.items():
            if isinstance(brand_data, dict):
                print(f"    brand_outputs[{brand_key}] keys: {list(brand_data.keys())}")
                cp = brand_data.get("carousel_paths", [])
                if cp:
                    print(f"      carousel_paths: {len(cp)} items, cover={str(cp[0])[:100]}")
    elif isinstance(bo, list):
        print(f"    brand_outputs is list, len={len(bo)}")
    print()

# 3. Check recent scheduled_reels that DO have carousel data
cur.execute("""
SELECT sr.schedule_id, sr.scheduled_time, sr.status, sr.extra_data
FROM scheduled_reels sr
WHERE sr.extra_data::text LIKE '%%carousel%%'
ORDER BY sr.scheduled_time DESC
LIMIT 5
""")
rows3 = cur.fetchall()
print(f"=== Recent scheduled_reels with 'carousel' in extra_data ===")
for r in rows3:
    ed = r[3] if r[3] else {}
    if isinstance(ed, dict):
        print(f"  {r[0]} time={r[1]} status={r[2]} keys={list(ed.keys())}")
        for k in ["carousel_paths", "carousel_image_urls"]:
            if k in ed:
                val = ed[k]
                print(f"    {k}: {len(val) if isinstance(val, list) else val}")
    print()

conn.close()
