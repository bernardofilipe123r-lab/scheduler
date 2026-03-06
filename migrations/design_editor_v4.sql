-- Migration: design_editor_v4
-- Adds: reel_music_enabled, reel_text_font_bold, reel_header_scale
-- Updates defaults: reel_brand_name_size→42, reel_handle_size→32, reel_logo_size→96, reel_image_height→660
-- Idempotent: safe to re-run

-- New columns
ALTER TABLE text_video_design ADD COLUMN IF NOT EXISTS reel_music_enabled BOOLEAN DEFAULT true;
ALTER TABLE text_video_design ADD COLUMN IF NOT EXISTS reel_text_font_bold BOOLEAN DEFAULT false;
ALTER TABLE text_video_design ADD COLUMN IF NOT EXISTS reel_header_scale REAL DEFAULT 1.0;

-- Update column defaults (doesn't change existing rows, only new inserts)
ALTER TABLE text_video_design ALTER COLUMN reel_brand_name_size SET DEFAULT 42;
ALTER TABLE text_video_design ALTER COLUMN reel_handle_size SET DEFAULT 32;
ALTER TABLE text_video_design ALTER COLUMN reel_logo_size SET DEFAULT 96;
ALTER TABLE text_video_design ALTER COLUMN reel_image_height SET DEFAULT 660;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'text_video_design'
  AND column_name IN ('reel_music_enabled', 'reel_text_font_bold', 'reel_header_scale',
                       'reel_brand_name_size', 'reel_handle_size', 'reel_logo_size', 'reel_image_height')
ORDER BY column_name;
