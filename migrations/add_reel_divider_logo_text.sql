-- Add text abbreviation column for thumbnail divider logo
-- When set (e.g., 'HCO'), the thumbnail renders text instead of an image logo
ALTER TABLE brands ADD COLUMN IF NOT EXISTS reel_divider_logo_text VARCHAR(10);
