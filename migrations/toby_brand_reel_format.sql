-- Migration: Add reel_format to toby_brand_config
-- Run: psql "$DATABASE_URL" < migrations/toby_brand_reel_format.sql

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'toby_brand_config' AND column_name = 'reel_format'
    ) THEN
        ALTER TABLE toby_brand_config ADD COLUMN reel_format VARCHAR(30) DEFAULT 'text_based';
    END IF;
END $$;

-- Check constraint: only valid format values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'toby_brand_config' AND constraint_name = 'chk_reel_format'
    ) THEN
        ALTER TABLE toby_brand_config
            ADD CONSTRAINT chk_reel_format
            CHECK (reel_format IN ('text_based', 'text_video'));
    END IF;
END $$;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'toby_brand_config'
  AND column_name = 'reel_format';
