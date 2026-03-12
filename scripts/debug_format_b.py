"""Debug script to investigate Format B failures."""
import psycopg2

DB_URL = 'postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres'
conn = psycopg2.connect(DB_URL, connect_timeout=15)
cur = conn.cursor()

# 1. Check image_source_mode in format_b_design table
print("=== format_b_design entries ===")
cur.execute("SELECT user_id, image_source_mode FROM format_b_design")
rows = cur.fetchall()
for r in rows:
    print(f"  user_id={r[0][:40]}... mode={r[1]}")

# 2. Check brand info for The Pure College
print("\n=== Brand info for The Pure College ===")
cur.execute("""
    SELECT b.id, b.display_name, nc.niche_name, nc.topic_categories
    FROM brands b
    LEFT JOIN niche_config nc ON nc.user_id = b.user_id
    WHERE b.display_name ILIKE '%pure college%'
    LIMIT 5
""")
rows = cur.fetchall()
for r in rows:
    print(f"  brand_id={r[0]} display={r[1]} niche={r[2]} topics={str(r[3])[:100]}")

# 3. Check content DNA profiles
print("\n=== Content DNA for The Pure College ===")
cur.execute("""
    SELECT cdp.id, cdp.niche_name, cdp.topic_categories, cdp.name
    FROM content_dna_profiles cdp
    JOIN brands b ON b.content_dna_id = cdp.id
    WHERE b.display_name ILIKE '%pure college%'
    LIMIT 5
""")
rows = cur.fetchall()
for r in rows:
    print(f"  dna_id={r[0]} niche={r[1]} topics={str(r[2])[:100]} name={r[3]}")

# 4. Check format_b_data of a failed job to see what prompts were used
print("\n=== Format B data from failed jobs ===")
cur.execute("""
    SELECT job_id, title, format_b_data
    FROM generation_jobs
    WHERE status = 'failed'
      AND content_format = 'format_b'
      AND created_at >= '2025-03-11'
    ORDER BY created_at DESC
    LIMIT 3
""")
rows = cur.fetchall()
for r in rows:
    print(f"\n  job_id={r[0]} title={r[1]}")
    fbd = r[2]
    if fbd:
        import json
        if isinstance(fbd, str):
            fbd = json.loads(fbd)
        # Show image plans
        images = fbd.get("images", [])
        print(f"  images count: {len(images)}")
        for i, img in enumerate(images):
            print(f"    [{i}] source={img.get('source_type')} query={str(img.get('query', ''))[:80]}")
            print(f"         search_query={img.get('search_query', 'None')}")
        print(f"  reel_text: {str(fbd.get('reel_text', ''))[:100]}")
    else:
        print("  format_b_data: None")

# 5. Check toby_brand_config for The Pure College
print("\n=== Toby Brand Config ===")
cur.execute("""
    SELECT tbc.brand_id, tbc.reel_format, tbc.enabled_platforms
    FROM toby_brand_config tbc
    JOIN brands b ON b.id = tbc.brand_id
    WHERE b.display_name ILIKE '%pure college%'
    LIMIT 5
""")
rows = cur.fetchall()
for r in rows:
    print(f"  brand_id={r[0]} reel_format={r[1]} enabled_platforms={r[2]}")

# 6. Check title diversity of ALL format_b jobs in last 7 days
print("\n=== Format B title diversity (last 7 days) ===")
cur.execute("""
    SELECT title, COUNT(*) as cnt
    FROM generation_jobs
    WHERE content_format = 'format_b'
      AND created_at >= NOW() - INTERVAL '7 days'
    GROUP BY title
    ORDER BY cnt DESC
    LIMIT 20
""")
rows = cur.fetchall()
for r in rows:
    print(f"  [{r[1]}x] {r[0]}")

conn.close()
print("\nDone!")
