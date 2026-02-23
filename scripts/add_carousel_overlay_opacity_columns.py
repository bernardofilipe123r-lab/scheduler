"""Add carousel overlay opacity columns to niche_config table."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv; load_dotenv()
import psycopg2

SQL = """
ALTER TABLE niche_config
ADD COLUMN IF NOT EXISTS carousel_cover_overlay_opacity INTEGER DEFAULT 55;

ALTER TABLE niche_config
ADD COLUMN IF NOT EXISTS carousel_content_overlay_opacity INTEGER DEFAULT 85;
"""

def main():
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    cur = conn.cursor()
    try:
        cur.execute(SQL)
        conn.commit()
        print("✅ Added carousel_cover_overlay_opacity and carousel_content_overlay_opacity columns to niche_config")
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
