-- Add reel_text_color column to text_video_design table
-- Stores the user's chosen text color for Format B reel content
ALTER TABLE text_video_design
ADD COLUMN IF NOT EXISTS reel_text_color VARCHAR(20) DEFAULT '#FFFFFF';
