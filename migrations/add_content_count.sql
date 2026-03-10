-- migrations/add_content_count.sql
-- Description: Add content_count column to generation_jobs for multi-content per job
-- Date: 2026-03-10

ALTER TABLE generation_jobs
ADD COLUMN IF NOT EXISTS content_count INTEGER DEFAULT 1 NOT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN generation_jobs.content_count IS 'Number of content items per brand in this job. Default 1 (single content). When >1, brand_outputs values are arrays of dicts instead of single dicts.';
