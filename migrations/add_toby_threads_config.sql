-- Add threads support to Toby state and brand config
-- Enables Toby to generate and schedule threads posts automatically

-- TobyState: global threads toggle + slots per day
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'toby_state' AND column_name = 'threads_enabled'
    ) THEN
        ALTER TABLE toby_state ADD COLUMN threads_enabled BOOLEAN NOT NULL DEFAULT true;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'toby_state' AND column_name = 'threads_posts_per_day'
    ) THEN
        ALTER TABLE toby_state ADD COLUMN threads_posts_per_day INTEGER DEFAULT 6;
    END IF;
END $$;

-- TobyBrandConfig: per-brand threads slots override
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'toby_brand_config' AND column_name = 'threads_posts_per_day'
    ) THEN
        ALTER TABLE toby_brand_config ADD COLUMN threads_posts_per_day INTEGER DEFAULT 6;
    END IF;
END $$;
