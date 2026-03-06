-- Migration: Create story pool for TEXT-VIDEO dedup
-- Run: psql "$DATABASE_URL" < migrations/text_video_story_pool.sql

CREATE TABLE IF NOT EXISTS text_video_story_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    fingerprint VARCHAR(64) NOT NULL,
    headline TEXT NOT NULL,
    summary TEXT,
    source_url TEXT,
    source_name VARCHAR(200),
    published_at TIMESTAMPTZ,
    story_category VARCHAR(50),
    niche VARCHAR(100),
    polished_data JSONB,
    status VARCHAR(20) DEFAULT 'available',
    used_at TIMESTAMPTZ,
    used_by_job_id VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate stories per user
    CONSTRAINT uq_story_pool_user_fingerprint UNIQUE (user_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS ix_story_pool_user_status
    ON text_video_story_pool (user_id, status);

CREATE INDEX IF NOT EXISTS ix_story_pool_niche
    ON text_video_story_pool (user_id, niche, status);

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'text_video_story_pool'
ORDER BY ordinal_position;
