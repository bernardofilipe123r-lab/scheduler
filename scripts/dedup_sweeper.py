"""
Dedup Sweeper — External safety mechanism against duplicate scheduled content.

PURPOSE:
    This script is an INDEPENDENT LAST LINE OF DEFENSE that detects and cancels
    duplicate scheduled posts that somehow slipped through Toby's dedup guards.
    It runs OUTSIDE the Toby tick loop and can be triggered:
      1. As a cron job (e.g., every 30 minutes via APScheduler or Railway cron)
      2. Manually via: python3 scripts/dedup_sweeper.py
      3. From the orchestrator as an additional safety check

WHAT IT CHECKS (3 layers):
    Layer A: Same brand + same title scheduled within 5 days → cancel duplicates
    Layer B: Same brand + overlapping time slot (±30min) → cancel duplicates
    Layer C: Fallback/placeholder titles → cancel immediately

WHY THIS EXISTS:
    On 2026-03-08, a race condition in parallel DB sessions caused identical
    reels to be scheduled 4-6 times for the same brand. The root cause was
    fixed (parallel execution removed, 3-layer dedup in scheduler), but this
    sweeper provides belt-and-suspenders protection.

SAFETY:
    - Only touches rows with status='scheduled' (never published/publishing)
    - Keeps the FIRST occurrence (earliest created_at), cancels later duplicates
    - Marks cancelled rows as status='failed' with clear error message
    - Logs all actions for audit trail
    - Idempotent — safe to run repeatedly
"""
import sys
sys.path.insert(0, '.')

from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from app.db_connection import SessionLocal


# ── Forbidden title patterns (fallback/placeholder content) ──────────────────
FORBIDDEN_TITLE_PATTERNS = [
    "content generation temporarily unavailable",
    "temporarily unavailable",
]


def sweep_duplicates(dry_run: bool = False) -> dict:
    """
    Scan scheduled_reels for duplicates and cancel them.

    Args:
        dry_run: If True, only report duplicates without cancelling them.

    Returns:
        Summary dict with counts of duplicates found and cancelled.
    """
    db = SessionLocal()
    try:
        cancelled = 0
        fallback_cancelled = 0
        title_dupes_cancelled = 0

        # ── Layer C: Cancel fallback/placeholder content ─────────────────
        print("[DEDUP-SWEEPER] Layer C: Checking for fallback content...")
        for pattern in FORBIDDEN_TITLE_PATTERNS:
            fallbacks = db.execute(text("""
                SELECT schedule_id, extra_data->>'brand' as brand, extra_data->>'title' as title
                FROM scheduled_reels
                WHERE status = 'scheduled'
                AND LOWER(extra_data->>'title') LIKE :pattern
            """), {"pattern": f"%{pattern}%"}).fetchall()

            for row in fallbacks:
                print(f"  🚫 FALLBACK: {row[0]} | brand={row[1]} | title={row[2][:60]}")
                if not dry_run:
                    db.execute(text("""
                        UPDATE scheduled_reels
                        SET status = 'failed',
                            publish_error = 'Cancelled by dedup sweeper: fallback/placeholder content'
                        WHERE schedule_id = :sid AND status = 'scheduled'
                    """), {"sid": row[0]})
                    fallback_cancelled += 1

        # ── Layer A: Cancel title duplicates (same brand + same title) ───
        print("[DEDUP-SWEEPER] Layer A: Checking for title duplicates...")
        title_dupes = db.execute(text("""
            WITH ranked AS (
                SELECT
                    schedule_id,
                    extra_data->>'brand' as brand,
                    extra_data->>'title' as title,
                    scheduled_time,
                    created_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY user_id, extra_data->>'brand', LOWER(extra_data->>'title')
                        ORDER BY created_at ASC
                    ) as rn
                FROM scheduled_reels
                WHERE status = 'scheduled'
                AND extra_data->>'title' IS NOT NULL
                AND scheduled_time > NOW()
                AND scheduled_time < NOW() + INTERVAL '5 days'
            )
            SELECT schedule_id, brand, title, scheduled_time::text, created_at::text
            FROM ranked
            WHERE rn > 1
            ORDER BY brand, title
        """)).fetchall()

        for row in title_dupes:
            print(f"  ⚠️ TITLE-DUPE: {row[0]} | brand={row[1]} | title={row[2][:60]} | sched={row[3]}")
            if not dry_run:
                db.execute(text("""
                    UPDATE scheduled_reels
                    SET status = 'failed',
                        publish_error = 'Cancelled by dedup sweeper: duplicate title for same brand'
                    WHERE schedule_id = :sid AND status = 'scheduled'
                """), {"sid": row[0]})
                title_dupes_cancelled += 1

        # ── Layer B: Cancel time-slot duplicates (same brand + ±30min) ───
        print("[DEDUP-SWEEPER] Layer B: Checking for time-slot duplicates...")
        slot_dupes = db.execute(text("""
            WITH ranked AS (
                SELECT
                    schedule_id,
                    extra_data->>'brand' as brand,
                    extra_data->>'variant' as variant,
                    extra_data->>'title' as title,
                    scheduled_time,
                    created_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY
                            user_id,
                            extra_data->>'brand',
                            CASE
                                WHEN extra_data->>'variant' IN ('light', 'dark') THEN 'reel'
                                WHEN extra_data->>'variant' = 'text_video' THEN 'text_video'
                                ELSE extra_data->>'variant'
                            END,
                            date_trunc('hour', scheduled_time)
                        ORDER BY created_at ASC
                    ) as rn
                FROM scheduled_reels
                WHERE status = 'scheduled'
                AND scheduled_time > NOW()
            )
            SELECT schedule_id, brand, variant, title, scheduled_time::text
            FROM ranked
            WHERE rn > 1
            ORDER BY brand, scheduled_time
        """)).fetchall()

        for row in slot_dupes:
            print(f"  ⚠️ SLOT-DUPE: {row[0]} | brand={row[1]} | variant={row[2]} | title={row[3][:50]} | sched={row[4]}")
            if not dry_run:
                db.execute(text("""
                    UPDATE scheduled_reels
                    SET status = 'failed',
                        publish_error = 'Cancelled by dedup sweeper: duplicate time slot for same brand'
                    WHERE schedule_id = :sid AND status = 'scheduled'
                """), {"sid": row[0]})
                cancelled += 1

        if not dry_run:
            db.commit()

        total = fallback_cancelled + title_dupes_cancelled + cancelled
        summary = {
            "fallback_cancelled": fallback_cancelled,
            "title_dupes_cancelled": title_dupes_cancelled,
            "slot_dupes_cancelled": cancelled,
            "total_cancelled": total,
        }
        print(f"\n[DEDUP-SWEEPER] Summary: {summary}")
        return summary

    except Exception as e:
        db.rollback()
        print(f"[DEDUP-SWEEPER] ERROR: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Dedup sweeper for scheduled content")
    parser.add_argument("--dry-run", action="store_true", help="Only report, don't cancel")
    args = parser.parse_args()
    sweep_duplicates(dry_run=args.dry_run)
