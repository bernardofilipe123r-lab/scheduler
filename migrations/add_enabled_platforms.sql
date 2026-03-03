-- Add enabled_platforms column to toby_brand_config table.
-- JSON list of platform names the user wants Toby to publish to for this brand.
-- NULL = "all connected platforms" (backwards-compatible default).
ALTER TABLE toby_brand_config
  ADD COLUMN IF NOT EXISTS enabled_platforms JSONB DEFAULT NULL;
