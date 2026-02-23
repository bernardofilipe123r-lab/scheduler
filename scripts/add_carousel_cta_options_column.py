"""Add carousel_cta_options JSONB column to niche_config table."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv; load_dotenv()
import psycopg2

SQL = """
ALTER TABLE niche_config
ADD COLUMN IF NOT EXISTS carousel_cta_options JSONB DEFAULT '[]'::jsonb;
"""

def main():
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    cur = conn.cursor()
    try:
        cur.execute(SQL)
        conn.commit()
        print("✅ Added carousel_cta_options column to niche_config")
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
