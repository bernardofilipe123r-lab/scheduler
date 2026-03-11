-- Add image_source_mode column to format_b_design
-- Persists the AI/Web image source toggle so it survives deployments.
-- Values: 'ai' (default, Freepik/DeAPI) or 'web' (SearchApi + fallback)

ALTER TABLE format_b_design
ADD COLUMN IF NOT EXISTS image_source_mode VARCHAR(10) NOT NULL DEFAULT 'ai';

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'format_b_design' AND column_name = 'image_source_mode';
