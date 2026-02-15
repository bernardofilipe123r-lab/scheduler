"""
Migration script: Rename toby_proposals table to agent_proposals.

This renames the DB table to match the updated SQLAlchemy model (AgentProposal).
Also renames the legacy index.

Usage:
    python scripts/rename_toby_proposals.py

Idempotent — safe to run multiple times.
"""

import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.db_connection import SessionLocal


def run_migration():
    db = SessionLocal()
    try:
        # Check if old table exists
        result = db.execute(text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'toby_proposals')"
        ))
        old_exists = result.scalar()

        if not old_exists:
            print("✅ Table 'toby_proposals' does not exist — migration already applied or table never existed.")
            return

        # Check if new table already exists (avoid conflict)
        result = db.execute(text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'agent_proposals')"
        ))
        new_exists = result.scalar()

        if new_exists:
            print("⚠️  Table 'agent_proposals' already exists. Skipping rename.")
            return

        # Rename table
        print("🔄 Renaming table: toby_proposals → agent_proposals ...")
        db.execute(text("ALTER TABLE toby_proposals RENAME TO agent_proposals"))

        # Rename the composite index if it exists
        result = db.execute(text(
            "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_toby_status_created')"
        ))
        if result.scalar():
            print("🔄 Renaming index: ix_toby_status_created → ix_agent_proposals_status_created ...")
            db.execute(text("ALTER INDEX ix_toby_status_created RENAME TO ix_agent_proposals_status_created"))

        db.commit()
        print("✅ Migration complete: toby_proposals → agent_proposals")

    except Exception as e:
        db.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_migration()
