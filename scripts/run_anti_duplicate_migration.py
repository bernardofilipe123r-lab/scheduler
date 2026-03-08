"""Run the anti-duplicate scheduling migration."""
import sys
sys.path.insert(0, '.')

from app.db_connection import SessionLocal
from sqlalchemy import text

db = SessionLocal()

sql_statements = [
    """CREATE INDEX IF NOT EXISTS ix_sched_reels_brand_time_status
    ON scheduled_reels (
        user_id,
        (extra_data->>'brand'),
        scheduled_time,
        status
    )
    WHERE status IN ('scheduled', 'publishing', 'partial', 'published')""",

    """CREATE INDEX IF NOT EXISTS ix_sched_reels_brand_title
    ON scheduled_reels (
        user_id,
        (extra_data->>'brand'),
        (extra_data->>'title'),
        scheduled_time
    )
    WHERE status IN ('scheduled', 'publishing', 'partial', 'published')""",
]

for sql in sql_statements:
    print(f"Running: {sql[:70]}...")
    db.execute(text(sql))
    print("  OK")

db.commit()

rows = db.execute(text("""
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'scheduled_reels'
    AND indexname IN ('ix_sched_reels_brand_time_status', 'ix_sched_reels_brand_title')
""")).fetchall()
print(f"Verified indexes: {[r[0] for r in rows]}")
db.close()
print("Migration complete.")
