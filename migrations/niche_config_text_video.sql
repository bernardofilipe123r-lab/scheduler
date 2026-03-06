-- Migration: Add text-video specific columns to niche_config
-- Run: psql "$DATABASE_URL" < migrations/niche_config_text_video.sql

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_reel_examples'
    ) THEN
        ALTER TABLE niche_config ADD COLUMN text_video_reel_examples JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_story_niches'
    ) THEN
        ALTER TABLE niche_config ADD COLUMN text_video_story_niches JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_story_tone'
    ) THEN
        ALTER TABLE niche_config ADD COLUMN text_video_story_tone TEXT DEFAULT '';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_preferred_categories'
    ) THEN
        ALTER TABLE niche_config ADD COLUMN text_video_preferred_categories JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'niche_config'
  AND column_name LIKE 'text_video_%'
ORDER BY column_name;
