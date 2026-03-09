-- Add reel_content_logo_path column to brands table
-- Per-brand logo shown in the header of video reel content frames.
-- Separate from logo_path (general brand logo) and reel_divider_logo_path (thumbnail divider logo).
-- When not set, the renderer falls back to logo_path.

ALTER TABLE brands ADD COLUMN IF NOT EXISTS reel_content_logo_path VARCHAR(255);
