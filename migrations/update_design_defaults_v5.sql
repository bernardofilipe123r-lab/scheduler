-- Migration: Update default values for text_video_design columns
-- Changes: reel_text_size 52->38, reel_avg_word_count 50->55, reel_header_scale 1.0->1.15

-- Update column defaults
ALTER TABLE text_video_design ALTER COLUMN reel_text_size SET DEFAULT 38;
ALTER TABLE text_video_design ALTER COLUMN reel_avg_word_count SET DEFAULT 55;
ALTER TABLE text_video_design ALTER COLUMN reel_header_scale SET DEFAULT 1.15;

-- Verify
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_name = 'text_video_design'
  AND column_name IN ('reel_text_size', 'reel_avg_word_count', 'reel_header_scale')
ORDER BY column_name;
