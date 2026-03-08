-- Migration: Anti-Duplicate Content Scheduling
-- Date: 2026-03-08
-- Purpose: Add database-level safeguards against duplicate content scheduling.
--
-- INCIDENT: Toby scheduled the same content (same title) 4-6 times for the
-- same brand due to a race condition in parallel DB sessions. This migration
-- adds indexes that make duplicate detection queries fast and reliable.
--
-- This migration is IDEMPOTENT — safe to run multiple times.

-- Index 1: Fast lookup for time-slot dedup queries
-- Used by: scheduler.py DEDUP-L1 (same brand + same time window)
CREATE INDEX IF NOT EXISTS ix_sched_reels_brand_time_status
ON scheduled_reels (
    user_id,
    (extra_data->>'brand'),
    scheduled_time,
    status
)
WHERE status IN ('scheduled', 'publishing', 'partial', 'published');

-- Index 2: Fast lookup for title dedup queries
-- Used by: scheduler.py DEDUP-L2 (same brand + same title)
CREATE INDEX IF NOT EXISTS ix_sched_reels_brand_title
ON scheduled_reels (
    user_id,
    (extra_data->>'brand'),
    (extra_data->>'title'),
    scheduled_time
)
WHERE status IN ('scheduled', 'publishing', 'partial', 'published');

-- Verify indexes exist
SELECT indexname FROM pg_indexes
WHERE tablename = 'scheduled_reels'
AND indexname IN ('ix_sched_reels_brand_time_status', 'ix_sched_reels_brand_title');
