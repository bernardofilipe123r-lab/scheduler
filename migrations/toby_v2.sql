-- Toby V2 Migration
-- Run against your Supabase/PostgreSQL database.
-- All statements are idempotent (safe to re-run).

-- ============================================================
-- 1. P0: Prevent duplicate slot scheduling (Fixes F1, F2)
--    Adds a UNIQUE constraint so two concurrent toby_tick calls
--    cannot create two ScheduledReels for the same brand + time.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_brand_slot'
  ) THEN
    ALTER TABLE scheduled_reels
      ADD CONSTRAINT uq_brand_slot
      UNIQUE (user_id, scheduled_time, (extra_data->>'brand'));
  END IF;
END $$;


-- ============================================================
-- 2. P2: Orphan tag prevention (Fixes G1)
--    When a scheduled_reel is deleted, NULL-out the reference
--    on the content tag instead of leaving a dangling FK.
-- ============================================================
-- First make schedule_id nullable (it already is in the model)
ALTER TABLE toby_content_tags
  ALTER COLUMN schedule_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_toby_tag_schedule'
  ) THEN
    ALTER TABLE toby_content_tags
      ADD CONSTRAINT fk_toby_tag_schedule
      FOREIGN KEY (schedule_id) REFERENCES scheduled_reels(schedule_id)
      ON DELETE SET NULL;
  END IF;
END $$;


-- ============================================================
-- 3. E5: Zero-metric false scoring flag
-- ============================================================
ALTER TABLE toby_content_tags
  ADD COLUMN IF NOT EXISTS metrics_unreliable BOOLEAN DEFAULT FALSE;


-- ============================================================
-- 4. B6: Human-modified content flag
-- ============================================================
ALTER TABLE toby_content_tags
  ADD COLUMN IF NOT EXISTS human_modified BOOLEAN DEFAULT FALSE;


-- ============================================================
-- 5. D2: Fallback content flag
-- ============================================================
ALTER TABLE toby_content_tags
  ADD COLUMN IF NOT EXISTS used_fallback BOOLEAN DEFAULT FALSE;


-- ============================================================
-- 6. Section 13.2: Budget enforcement columns on toby_state
-- ============================================================
ALTER TABLE toby_state
  ADD COLUMN IF NOT EXISTS daily_budget_cents INTEGER;

ALTER TABLE toby_state
  ADD COLUMN IF NOT EXISTS spent_today_cents INTEGER DEFAULT 0;

ALTER TABLE toby_state
  ADD COLUMN IF NOT EXISTS budget_reset_at TIMESTAMPTZ;
