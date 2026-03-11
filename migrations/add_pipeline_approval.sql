-- Pipeline approval system for Meta ToS compliance
-- Adds human-in-the-loop approval gate between content generation and scheduling
-- Date: 2026-03-11

-- 1. Pipeline columns on generation_jobs
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS pipeline_status VARCHAR(20);
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS pipeline_reviewed_at TIMESTAMPTZ;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS pipeline_batch_id VARCHAR(36);
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS quality_score INTEGER;

-- 2. Indexes for pipeline queries
CREATE INDEX IF NOT EXISTS ix_gen_jobs_pipeline_status
    ON generation_jobs (pipeline_status) WHERE pipeline_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_gen_jobs_user_pipeline
    ON generation_jobs (user_id, pipeline_status) WHERE pipeline_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_gen_jobs_batch
    ON generation_jobs (pipeline_batch_id) WHERE pipeline_batch_id IS NOT NULL;

-- 3. Notification tracking on toby_state
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS last_pipeline_notification_at TIMESTAMPTZ;
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS pipeline_notification_interval_hours INTEGER DEFAULT 24;

-- 4. Verification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'generation_jobs'
  AND column_name IN ('pipeline_status', 'pipeline_reviewed_at', 'caption', 'pipeline_batch_id', 'quality_score')
ORDER BY column_name;
