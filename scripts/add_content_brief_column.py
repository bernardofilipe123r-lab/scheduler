"""Add content_brief column to niche_config table."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db_connection import get_db_session
from sqlalchemy import text

def main():
    with get_db_session() as db:
        # Check if column already exists
        result = db.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'niche_config' AND column_name = 'content_brief'"
        ))
        if result.fetchone():
            print("✓ content_brief column already exists")
            return

        db.execute(text("ALTER TABLE niche_config ADD COLUMN content_brief TEXT DEFAULT ''"))
        db.commit()
        print("✓ Added content_brief column to niche_config table")

if __name__ == "__main__":
    main()
