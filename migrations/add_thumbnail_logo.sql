-- Add reel_divider_logo_path column to brands table
-- Per-brand logo used in the divider line of video reel thumbnails.
-- Separate from logo_path (brand header logo in reel frames).

ALTER TABLE brands ADD COLUMN IF NOT EXISTS reel_divider_logo_path VARCHAR(255);
