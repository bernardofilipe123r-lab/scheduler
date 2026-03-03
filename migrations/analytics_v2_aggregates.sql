-- Analytics V2: Tiered aggregation for 1-year+ data retention
-- Run: source .env 2>/dev/null; psql "$DATABASE_URL" -f migrations/analytics_v2_aggregates.sql

-- 1. Aggregated analytics for weekly/monthly rollups (older data)
CREATE TABLE IF NOT EXISTS analytics_aggregates (
    id              SERIAL PRIMARY KEY,
    user_id         VARCHAR(100) NOT NULL,
    brand           VARCHAR(50) NOT NULL,
    platform        VARCHAR(20) NOT NULL,
    period_type     VARCHAR(10) NOT NULL,  -- 'daily', 'weekly', 'monthly'
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    -- Averaged/summed metrics for the period
    avg_followers   INTEGER DEFAULT 0,
    min_followers   INTEGER DEFAULT 0,
    max_followers   INTEGER DEFAULT 0,
    avg_views       INTEGER DEFAULT 0,
    total_views     INTEGER DEFAULT 0,
    avg_likes       INTEGER DEFAULT 0,
    total_likes     INTEGER DEFAULT 0,
    snapshot_count  INTEGER DEFAULT 1,     -- how many daily snapshots were averaged
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_agg_user ON analytics_aggregates(user_id);
CREATE INDEX IF NOT EXISTS ix_agg_brand ON analytics_aggregates(brand);
CREATE INDEX IF NOT EXISTS ix_agg_period ON analytics_aggregates(period_type, period_start);
CREATE UNIQUE INDEX IF NOT EXISTS ix_agg_unique ON analytics_aggregates(user_id, brand, platform, period_type, period_start);

-- 2. Audience demographics (from IG audience insights API)
CREATE TABLE IF NOT EXISTS audience_demographics (
    id              SERIAL PRIMARY KEY,
    user_id         VARCHAR(100) NOT NULL,
    brand           VARCHAR(50) NOT NULL,
    platform        VARCHAR(20) NOT NULL DEFAULT 'instagram',
    -- Demographic data stored as JSON for flexibility
    gender_age      JSONB,       -- {"M.18-24": 1200, "F.25-34": 3400, ...}
    top_cities      JSONB,       -- {"London": 5000, "New York": 3000, ...}
    top_countries   JSONB,       -- {"GB": 8000, "US": 5000, ...}
    -- Computed summary
    top_gender      VARCHAR(20),  -- "Male" / "Female" / "Undisclosed"
    top_age_range   VARCHAR(10),  -- "25-34"
    top_city        VARCHAR(100), -- "London, United Kingdom"
    total_audience  INTEGER DEFAULT 0,
    fetched_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_demo_user ON audience_demographics(user_id);
CREATE INDEX IF NOT EXISTS ix_demo_brand ON audience_demographics(brand);
CREATE UNIQUE INDEX IF NOT EXISTS ix_demo_unique ON audience_demographics(user_id, brand, platform);

-- 3. Add engagement metrics columns to analytics_snapshots for richer tracking
ALTER TABLE analytics_snapshots ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0;
ALTER TABLE analytics_snapshots ADD COLUMN IF NOT EXISTS engagement_rate FLOAT;
ALTER TABLE analytics_snapshots ADD COLUMN IF NOT EXISTS posts_count INTEGER DEFAULT 0;

-- 4. Add published_hour and day_of_week to post_performance for Answers tab
ALTER TABLE post_performance ADD COLUMN IF NOT EXISTS published_hour INTEGER;
ALTER TABLE post_performance ADD COLUMN IF NOT EXISTS published_day_of_week INTEGER;
CREATE INDEX IF NOT EXISTS ix_post_perf_hour ON post_performance(published_hour);
CREATE INDEX IF NOT EXISTS ix_post_perf_dow ON post_performance(published_day_of_week);

-- Backfill published_hour/day_of_week from published_at
UPDATE post_performance
SET published_hour = EXTRACT(HOUR FROM published_at),
    published_day_of_week = EXTRACT(DOW FROM published_at)
WHERE published_at IS NOT NULL AND published_hour IS NULL;
