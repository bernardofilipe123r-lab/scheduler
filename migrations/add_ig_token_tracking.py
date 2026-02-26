"""
Migration: Add instagram_token_expires_at and instagram_token_last_refreshed_at
to the brands table.

Safe to run multiple times (uses IF NOT EXISTS).
"""
import os
from dotenv import load_dotenv

load_dotenv()

import sqlalchemy
from sqlalchemy import text

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise SystemExit("DATABASE_URL not set")

engine = sqlalchemy.create_engine(DATABASE_URL)
with engine.connect() as conn:
    conn.execute(text("""
        ALTER TABLE brands
        ADD COLUMN IF NOT EXISTS instagram_token_expires_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS instagram_token_last_refreshed_at TIMESTAMPTZ;
    """))
    conn.commit()
    print("✅ Migration complete: instagram_token_expires_at and instagram_token_last_refreshed_at added to brands")
