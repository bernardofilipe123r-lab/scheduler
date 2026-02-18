"""Verify the niche_config data was populated correctly."""
import psycopg2
import json

conn = psycopg2.connect(
    "postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
)
cur = conn.cursor()

cur.execute("""
    SELECT niche_name, niche_description, target_audience, audience_description,
           content_tone, tone_avoid, topic_categories, topic_keywords, topic_avoid,
           content_philosophy, hook_themes, reel_examples, post_examples,
           image_style_description, image_palette_keywords, brand_personality,
           brand_focus_areas, parent_brand_name, cta_options, hashtags,
           follow_section_text, save_section_text, disclaimer_text
    FROM niche_config
    WHERE user_id = '7c7bdcc7-ad79-4554-8d32-e5ef02608e84'
      AND brand_id IS NULL
""")

row = cur.fetchone()
if not row:
    print("ERROR: No global niche_config found!")
    exit(1)

cols = [
    'niche_name', 'niche_description', 'target_audience', 'audience_description',
    'content_tone', 'tone_avoid', 'topic_categories', 'topic_keywords', 'topic_avoid',
    'content_philosophy', 'hook_themes', 'reel_examples', 'post_examples',
    'image_style_description', 'image_palette_keywords', 'brand_personality',
    'brand_focus_areas', 'parent_brand_name', 'cta_options', 'hashtags',
    'follow_section_text', 'save_section_text', 'disclaimer_text'
]

print("=== Global Niche Config Verification ===\n")
all_ok = True
for i, col in enumerate(cols):
    val = row[i]
    if isinstance(val, list):
        count = len(val)
        if count == 0 and col not in ('post_examples',):
            print(f"  WARNING {col}: EMPTY list")
            all_ok = False
        else:
            preview = json.dumps(val[:2], ensure_ascii=False)[:80]
            print(f"  OK {col}: {count} items -> {preview}...")
    elif isinstance(val, str):
        if not val.strip() and col not in ('post_examples',):
            print(f"  WARNING {col}: EMPTY string")
            all_ok = False
        else:
            print(f"  OK {col}: \"{val[:70]}...\"" if len(str(val)) > 70 else f"  OK {col}: \"{val}\"")
    else:
        print(f"  ?? {col}: {val}")

print(f"\n{'ALL FIELDS POPULATED' if all_ok else 'SOME FIELDS MISSING'}")

cur.close()
conn.close()
