-- Migration: Add TEXT-VIDEO support to generation_jobs
-- Run: psql "$DATABASE_URL" < migrations/text_video_format.sql

-- 1. Add content_format column (default text_based for backward compat)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generation_jobs' AND column_name = 'content_format'
    ) THEN
        ALTER TABLE generation_jobs ADD COLUMN content_format VARCHAR(30) DEFAULT 'text_based';
    END IF;
END $$;

-- 2. Add text_video_data JSON column for TEXT-VIDEO specific metadata
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generation_jobs' AND column_name = 'text_video_data'
    ) THEN
        ALTER TABLE generation_jobs ADD COLUMN text_video_data JSONB;
    END IF;
END $$;

-- 3. Index on content_format for filtering
CREATE INDEX IF NOT EXISTS ix_generation_jobs_content_format
    ON generation_jobs (content_format);

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'generation_jobs'
  AND column_name IN ('content_format', 'text_video_data')
ORDER BY column_name;
