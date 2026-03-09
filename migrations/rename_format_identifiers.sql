-- Migration: Rename format identifiers
-- text_based → format_a, text_video → format_b
-- Run: psql "$DATABASE_URL" < migrations/rename_format_identifiers.sql

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. Update reel_format values in toby_brand_config
-- ══════════════════════════════════════════════════════════════

-- Drop old CHECK constraint FIRST (before updating values)
ALTER TABLE toby_brand_config DROP CONSTRAINT IF EXISTS chk_reel_format;
ALTER TABLE toby_brand_config DROP CONSTRAINT IF EXISTS toby_brand_config_reel_format_check;

UPDATE toby_brand_config SET reel_format = 'format_a' WHERE reel_format = 'text_based';
UPDATE toby_brand_config SET reel_format = 'format_b' WHERE reel_format = 'text_video';

-- Add new CHECK constraint
ALTER TABLE toby_brand_config ADD CONSTRAINT chk_reel_format
    CHECK (reel_format IN ('format_a', 'format_b'));

-- Update default
ALTER TABLE toby_brand_config ALTER COLUMN reel_format SET DEFAULT 'format_a';

-- ══════════════════════════════════════════════════════════════
-- 2. Update generation_jobs values
-- ══════════════════════════════════════════════════════════════
UPDATE generation_jobs SET variant = 'format_b' WHERE variant = 'text_video';
UPDATE generation_jobs SET content_format = 'format_a' WHERE content_format = 'text_based';
UPDATE generation_jobs SET content_format = 'format_b' WHERE content_format = 'text_video';

-- Update default
ALTER TABLE generation_jobs ALTER COLUMN content_format SET DEFAULT 'format_a';

-- ══════════════════════════════════════════════════════════════
-- 3. Rename generation_jobs.text_video_data column
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generation_jobs' AND column_name = 'text_video_data'
    ) THEN
        ALTER TABLE generation_jobs RENAME COLUMN text_video_data TO format_b_data;
    END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- 4. Rename niche_config columns
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_reel_examples'
    ) THEN
        ALTER TABLE niche_config RENAME COLUMN text_video_reel_examples TO format_b_reel_examples;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_story_niches'
    ) THEN
        ALTER TABLE niche_config RENAME COLUMN text_video_story_niches TO format_b_story_niches;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_story_tone'
    ) THEN
        ALTER TABLE niche_config RENAME COLUMN text_video_story_tone TO format_b_story_tone;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_preferred_categories'
    ) THEN
        ALTER TABLE niche_config RENAME COLUMN text_video_preferred_categories TO format_b_preferred_categories;
    END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- 5. Rename tables
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'text_video_design') THEN
        ALTER TABLE text_video_design RENAME TO format_b_design;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'text_video_story_pool') THEN
        ALTER TABLE text_video_story_pool RENAME TO format_b_story_pool;
    END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- 6. Update scheduled_reels extra_data JSON references
-- ══════════════════════════════════════════════════════════════
UPDATE scheduled_reels
SET extra_data = jsonb_set(extra_data::jsonb, '{content_type}', '"format_b_reel"')::json
WHERE extra_data->>'content_type' = 'text_video_reel';

UPDATE scheduled_reels
SET extra_data = jsonb_set(extra_data::jsonb, '{variant}', '"format_b"')::json
WHERE extra_data->>'variant' = 'text_video';

-- ══════════════════════════════════════════════════════════════
-- 7. Update feature_flags
-- ══════════════════════════════════════════════════════════════
UPDATE feature_flags SET flag_name = 'format_b_reels'
WHERE flag_name = 'text_video_reels';

-- ══════════════════════════════════════════════════════════════
-- 8. Update toby_strategy_score content_type values (if table exists)
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'toby_strategy_score') THEN
        EXECUTE 'UPDATE toby_strategy_score SET content_type = ''format_b_reel'' WHERE content_type = ''text_video_reel''';
    END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- 9. Rename indexes/constraints that reference old table names
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_text_video_design_user') THEN
        ALTER INDEX uq_text_video_design_user RENAME TO uq_format_b_design_user;
    END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- Verification
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
    -- Verify no old values remain
    IF EXISTS (SELECT 1 FROM toby_brand_config WHERE reel_format IN ('text_based', 'text_video')) THEN
        RAISE EXCEPTION 'Migration failed: old reel_format values still exist';
    END IF;
    IF EXISTS (SELECT 1 FROM generation_jobs WHERE variant = 'text_video') THEN
        RAISE EXCEPTION 'Migration failed: old variant values still exist';
    END IF;
    IF EXISTS (SELECT 1 FROM generation_jobs WHERE content_format IN ('text_based', 'text_video')) THEN
        RAISE EXCEPTION 'Migration failed: old content_format values still exist';
    END IF;
    -- Verify tables renamed
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'text_video_design') THEN
        RAISE EXCEPTION 'Migration failed: text_video_design table still exists';
    END IF;
    -- Verify columns renamed
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'generation_jobs' AND column_name = 'text_video_data') THEN
        RAISE EXCEPTION 'Migration failed: text_video_data column still exists';
    END IF;
END $$;

COMMIT;

-- Final check (outside transaction)
SELECT 'reel_format values' AS check_name,
       reel_format, COUNT(*) 
FROM toby_brand_config 
GROUP BY reel_format;

SELECT 'content_format values' AS check_name,
       content_format, COUNT(*) 
FROM generation_jobs 
WHERE content_format IS NOT NULL
GROUP BY content_format
LIMIT 10;
