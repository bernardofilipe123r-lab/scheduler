"""One-time DB cleanup — fix stuck jobs and wrong user_ids."""
import os
from sqlalchemy import create_engine, text

db_url = os.environ.get("DATABASE_URL", "")
if not db_url:
    print("ERROR: DATABASE_URL not set")
    exit(1)

CORRECT_USER_ID = "7c7bdcc7-ad79-4554-8d32-e5ef02608e84"

engine = create_engine(db_url)

with engine.connect() as conn:
    # 1. Mark stuck jobs as failed
    result = conn.execute(text(
        "UPDATE generation_jobs SET status = 'failed' "
        "WHERE status IN ('generating', 'pending')"
    ))
    print(f"=== STUCK JOBS MARKED FAILED: {result.rowcount} ===")

    # 2. Fix user_id on ALL generation_jobs that don't have a valid UUID
    result2 = conn.execute(text(
        "UPDATE generation_jobs SET user_id = :uid "
        "WHERE user_id IS NULL OR user_id NOT LIKE '________-____-____-____-____________'"
    ), {"uid": CORRECT_USER_ID})
    print(f"=== JOBS USER_ID FIXED: {result2.rowcount} ===")

    # 3. Also fix scheduled_reels with wrong user_ids
    result3 = conn.execute(text(
        "UPDATE scheduled_reels SET user_id = :uid "
        "WHERE user_id IS NULL OR user_id NOT LIKE '________-____-____-____-____________'"
    ), {"uid": CORRECT_USER_ID})
    print(f"=== SCHEDULED_REELS USER_ID FIXED: {result3.rowcount} ===")

    # 4. Fix agent_proposals with wrong user_ids
    result4 = conn.execute(text(
        "UPDATE agent_proposals SET user_id = :uid "
        "WHERE user_id IS NULL OR user_id NOT LIKE '________-____-____-____-____________'"
    ), {"uid": CORRECT_USER_ID})
    print(f"=== AGENT_PROPOSALS USER_ID FIXED: {result4.rowcount} ===")

    conn.commit()
    print("\n✅ All fixes committed successfully.")
