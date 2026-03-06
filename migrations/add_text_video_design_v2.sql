-- Migration: Add new text-video design columns for v2 reel format
-- Adds: thumbnail overlay, reel section spacing, padding, word count target

-- Thumbnail overlay intensity (gradient from bottom to top)
ALTER TABLE text_video_design ADD COLUMN IF NOT EXISTS thumbnail_overlay_opacity INTEGER DEFAULT 60;

-- Reel frame spacing controls
ALTER TABLE text_video_design ADD COLUMN IF NOT EXISTS reel_section_gap INTEGER DEFAULT 16;
ALTER TABLE text_video_design ADD COLUMN IF NOT EXISTS reel_padding_top INTEGER DEFAULT 24;
ALTER TABLE text_video_design ADD COLUMN IF NOT EXISTS reel_padding_bottom INTEGER DEFAULT 16;

-- Target word count for reel text content
ALTER TABLE text_video_design ADD COLUMN IF NOT EXISTS reel_avg_word_count INTEGER DEFAULT 50;

-- Brand header text color + size
ALTER TABLE text_video_design ADD COLUMN IF NOT EXISTS reel_brand_name_color VARCHAR(20) DEFAULT '#FFFFFF';
ALTER TABLE text_video_design ADD COLUMN IF NOT EXISTS reel_brand_name_size INTEGER DEFAULT 16;
ALTER TABLE text_video_design ADD COLUMN IF NOT EXISTS reel_handle_color VARCHAR(20) DEFAULT '#AAAAAA';
ALTER TABLE text_video_design ADD COLUMN IF NOT EXISTS reel_handle_size INTEGER DEFAULT 14;

-- Update default font for thumbnail from Poppins to Anton
-- (only affects NEW rows; existing rows keep their current setting)
ALTER TABLE text_video_design ALTER COLUMN thumbnail_title_font SET DEFAULT 'Anton-Regular.ttf';
