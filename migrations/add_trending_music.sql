-- Trending music table: stores TikTok trending music fetched via RapidAPI
-- Fetched up to 3 times per day; Toby picks randomly from top 50

CREATE TABLE IF NOT EXISTS trending_music (
    id TEXT PRIMARY KEY,
    tiktok_id TEXT,
    title TEXT NOT NULL,
    author TEXT,
    play_url TEXT NOT NULL,
    cover_url TEXT,
    duration_seconds FLOAT,
    rank INTEGER,
    batch_id TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trending_music_batch ON trending_music(batch_id);
CREATE INDEX IF NOT EXISTS idx_trending_music_fetched ON trending_music(fetched_at DESC);

-- Track fetch metadata to enforce 3x/day limit
CREATE TABLE IF NOT EXISTS trending_music_fetches (
    id TEXT PRIMARY KEY,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    track_count INTEGER NOT NULL DEFAULT 0,
    source TEXT DEFAULT 'tiktok_rapidapi'
);

CREATE INDEX IF NOT EXISTS idx_trending_music_fetches_at ON trending_music_fetches(fetched_at DESC);

-- Add music_source column to generation_jobs
-- Values: 'none', 'trending_random', 'trending_pick'
-- 'none' = no music, 'trending_random' = auto-pick from top 50, 'trending_pick' = user chose specific trending track
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generation_jobs' AND column_name = 'music_source'
    ) THEN
        ALTER TABLE generation_jobs ADD COLUMN music_source TEXT DEFAULT 'none';
    END IF;
END $$;
