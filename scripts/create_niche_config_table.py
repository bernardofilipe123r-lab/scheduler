"""Create the niche_config table in the production database."""
import psycopg2

conn = psycopg2.connect(
    "postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
)
cur = conn.cursor()

cur.execute("""
CREATE TABLE IF NOT EXISTS niche_config (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    brand_id VARCHAR(50) REFERENCES brands(id) ON DELETE CASCADE,
    niche_name VARCHAR(100) NOT NULL DEFAULT '',
    niche_description TEXT DEFAULT '',
    target_audience VARCHAR(255) DEFAULT '',
    audience_description TEXT DEFAULT '',
    content_tone JSONB DEFAULT '[]'::jsonb,
    tone_avoid JSONB DEFAULT '[]'::jsonb,
    topic_categories JSONB DEFAULT '[]'::jsonb,
    topic_keywords JSONB DEFAULT '[]'::jsonb,
    topic_avoid JSONB DEFAULT '[]'::jsonb,
    content_philosophy TEXT DEFAULT '',
    hook_themes JSONB DEFAULT '[]'::jsonb,
    reel_examples JSONB DEFAULT '[]'::jsonb,
    post_examples JSONB DEFAULT '[]'::jsonb,
    image_style_description TEXT DEFAULT '',
    image_palette_keywords JSONB DEFAULT '[]'::jsonb,
    brand_personality TEXT,
    brand_focus_areas JSONB DEFAULT '[]'::jsonb,
    parent_brand_name VARCHAR(100) DEFAULT '',
    cta_options JSONB DEFAULT '[]'::jsonb,
    hashtags JSONB DEFAULT '[]'::jsonb,
    follow_section_text TEXT DEFAULT '',
    save_section_text TEXT DEFAULT '',
    disclaimer_text TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_niche_config_user_brand UNIQUE (user_id, brand_id)
);
""")

cur.execute("CREATE INDEX IF NOT EXISTS idx_niche_config_user_id ON niche_config(user_id);")
cur.execute("CREATE INDEX IF NOT EXISTS idx_niche_config_brand_id ON niche_config(brand_id);")

conn.commit()
print("niche_config table created successfully")

cur.execute(
    "SELECT column_name, data_type FROM information_schema.columns "
    "WHERE table_name = 'niche_config' ORDER BY ordinal_position"
)
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]}")

cur.close()
conn.close()
