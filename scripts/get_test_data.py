#!/usr/bin/env python3
"""Get sample data for local test rendering — download a background image + brand configs."""
import psycopg2
import json
import urllib.request
import os

DB_URL = "postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

conn = psycopg2.connect(DB_URL, connect_timeout=15)
cur = conn.cursor()

# Get a few upcoming scheduled carousels with their data
cur.execute("""
SELECT sr.schedule_id, sr.extra_data
FROM scheduled_reels sr
WHERE sr.status = 'scheduled'
  AND sr.scheduled_time > now()
  AND sr.extra_data->>'slide_texts' IS NOT NULL
ORDER BY sr.scheduled_time ASC
LIMIT 10
""")
rows = cur.fetchall()

# Pick 3 diverse entries
test_data = []
seen_brands = set()
for r in rows:
    ed = r[1] if r[1] else {}
    if not isinstance(ed, dict):
        continue
    brand = ed.get("brand", "")
    if brand in seen_brands:
        continue
    title = ed.get("title", "")
    slide_texts = ed.get("slide_texts", [])
    raw_bg = ed.get("raw_background_url", "")
    if title and slide_texts and raw_bg:
        test_data.append({
            "schedule_id": r[0],
            "brand": brand,
            "title": title,
            "slide_texts": slide_texts[:4],  # max 4 slides for test
            "raw_background_url": raw_bg,
        })
        seen_brands.add(brand)
    if len(test_data) >= 3:
        break

# Get brand configs
brand_ids = [td["brand"] for td in test_data]
if brand_ids:
    placeholders = ",".join(["%s"] * len(brand_ids))
    cur.execute(f"""
    SELECT b.id, b.display_name, b.short_name, b.colors, b.logo_path,
           b.instagram_handle
    FROM brands b
    WHERE b.id IN ({placeholders})
    """, brand_ids)
    brand_rows = cur.fetchall()
    brand_map = {}
    for b in brand_rows:
        colors = b[3] if b[3] else {}
        brand_map[b[0]] = {
            "name": b[1] or b[0],
            "displayName": b[1] or b[0],
            "color": colors.get("primary", "#888888") if isinstance(colors, dict) else "#888888",
            "accentColor": colors.get("accent", "#666666") if isinstance(colors, dict) else "#666666",
            "abbreviation": b[2] or (b[0][0].upper() + "CO"),
            "handle": b[5] or b[0],
        }
    for td in test_data:
        td["brandConfig"] = brand_map.get(td["brand"], {
            "name": td["brand"], "displayName": td["brand"],
            "color": "#888888", "accentColor": "#666666",
            "abbreviation": td["brand"][:2].upper(), "handle": td["brand"]
        })

conn.close()

# Download background images
output_dir = os.path.join(os.path.dirname(__file__), "..", "output", "test_covers")
os.makedirs(output_dir, exist_ok=True)

for i, td in enumerate(test_data):
    bg_url = td["raw_background_url"]
    bg_path = os.path.join(output_dir, f"bg_{td['brand']}.jpg")
    if not os.path.exists(bg_path):
        print(f"Downloading background for {td['brand']}...")
        try:
            urllib.request.urlretrieve(bg_url, bg_path)
            print(f"  Saved to {bg_path}")
        except Exception as e:
            print(f"  ERROR downloading: {e}")
            continue
    td["backgroundImage"] = bg_path

# Save test data as JSON
json_path = os.path.join(output_dir, "test_data.json")
with open(json_path, "w") as f:
    json.dump(test_data, f, indent=2)
print(f"\nSaved {len(test_data)} test entries to {json_path}")

for td in test_data:
    print(f"\n  Brand: {td['brand']}")
    print(f"  Title: {td['title']}")
    print(f"  Slides: {len(td['slide_texts'])}")
    print(f"  BG: {td.get('backgroundImage', 'N/A')}")
    print(f"  Config: {td.get('brandConfig', {})}")
