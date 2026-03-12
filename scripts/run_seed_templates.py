"""
Runner: Seed all Content DNA templates from individual data files.

Clears existing templates and inserts all 7 from scripts/seed_templates/.
Maps TEMPLATE_DATA fields → content_dna_templates DB columns.
"""
import importlib.util
import json
import os
import sys
import uuid
import psycopg2

DB_URL = "postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

# Map niche_name → template_category for UI emoji/color styling
CATEGORY_MAP = {
    "Personal Finance & Investing": "finance",
    "Fitness & Body Transformation": "fitness",
    "Self-Improvement & Mindset": "self-improvement",
    "Skincare & Beauty Science": "skincare",
    "Cooking & Quick Recipes": "cooking",
    "Travel & Adventure": "travel",
    "Tech & Productivity": "tech",
    "Fashion & Style": "fashion",
    "Entrepreneurship & Business": "entrepreneurship",
    "Psychology & Mental Health": "psychology",
}

# DB columns that accept direct values from TEMPLATE_DATA
DIRECT_COLUMNS = [
    "niche_name", "niche_description", "content_brief",
    "target_audience", "audience_description",
    "content_philosophy",
    "image_style_description",
    "brand_personality",
    "parent_brand_name",
    "citation_style",
    "carousel_cta_topic",
    "follow_section_text", "save_section_text", "disclaimer_text",
]

# DB columns that need JSON serialization
JSON_COLUMNS = [
    "content_tone", "tone_avoid",
    "topic_categories", "topic_keywords", "topic_avoid",
    "hook_themes",
    "reel_examples", "post_examples",
    "image_palette_keywords",
    "brand_focus_areas",
    "cta_options", "hashtags",
    "competitor_accounts", "discovery_hashtags",
    "citation_source_types",
    "carousel_cta_options",
]


def load_template_data(filepath):
    """Import a seed file and return its TEMPLATE_DATA dict."""
    spec = importlib.util.spec_from_file_location("mod", filepath)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.TEMPLATE_DATA


def build_row(data):
    """Convert TEMPLATE_DATA → dict of DB column→value."""
    name = data.get("name", data.get("template_name", "Untitled"))
    # Deterministic ID from template name so re-seeding keeps the same UUIDs
    row = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"viraltoby.template.{name}")),
        "template_name": name,
        "template_category": CATEGORY_MAP.get(data.get("niche_name", ""), "niche"),
        "is_active": True,
        "popularity_order": data.get("popularity_order", 0),
    }

    for col in DIRECT_COLUMNS:
        if col in data:
            row[col] = data[col]

    for col in JSON_COLUMNS:
        if col in data:
            row[col] = json.dumps(data[col])

    return row


def main():
    seed_dir = os.path.join(os.path.dirname(__file__), "seed_templates")
    files = sorted(f for f in os.listdir(seed_dir) if f.startswith("seed_") and f.endswith(".py"))

    if not files:
        print("No seed files found!")
        sys.exit(1)

    conn = psycopg2.connect(DB_URL, connect_timeout=15)
    conn.autocommit = True
    cur = conn.cursor()

    # Clear existing templates
    cur.execute("DELETE FROM content_dna_templates")
    print("Cleared existing templates.")

    inserted = 0
    for fname in files:
        filepath = os.path.join(seed_dir, fname)
        try:
            data = load_template_data(filepath)
            row = build_row(data)

            cols = list(row.keys())
            placeholders = ", ".join(["%s"] * len(cols))
            col_names = ", ".join(cols)
            values = [row[c] for c in cols]

            cur.execute(f"INSERT INTO content_dna_templates ({col_names}) VALUES ({placeholders})", values)
            inserted += 1
            print(f"  [{inserted}] {row['template_name']} ({row['template_category']}) — OK")
        except Exception as e:
            print(f"  ERROR in {fname}: {e}")

    # Verify
    cur.execute("SELECT COUNT(*) FROM content_dna_templates WHERE is_active = true")
    count = cur.fetchone()[0]
    print(f"\nDone! {inserted} templates inserted, {count} active in DB.")

    conn.close()


if __name__ == "__main__":
    main()
