-- Migration: API usage tracking for admin dashboard (Section 39)
-- Run: psql "$DATABASE_URL" < migrations/api_usage_tracking.sql

CREATE TABLE IF NOT EXISTS api_usage_log (
    id BIGSERIAL PRIMARY KEY,
    api_name VARCHAR(50) NOT NULL,
    endpoint VARCHAR(200) DEFAULT '',
    called_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast time-range queries
CREATE INDEX IF NOT EXISTS idx_api_usage_api_called
    ON api_usage_log (api_name, called_at DESC);

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'api_usage_log'
ORDER BY ordinal_position;
