-- Add threads_format_weights JSONB column to niche_config
-- Stores per-user probability weights for thread format selection
-- Example: {"hot_take": 30, "question_hook": 25, "myth_bust": 20, "value_list": 15, "story_micro": 10}

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'threads_format_weights'
    ) THEN
        ALTER TABLE niche_config ADD COLUMN threads_format_weights JSONB DEFAULT '{}';
    END IF;
END $$;
