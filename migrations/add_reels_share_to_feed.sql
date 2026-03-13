-- Migration: Add reels_share_to_feed column to toby_brand_config
-- When false, Instagram Reels are published only to the Reels tab
-- (not shown on the profile grid/feed), using Meta's share_to_feed parameter.
-- Default true = current behavior (reels appear on both grid and Reels tab).

ALTER TABLE toby_brand_config
ADD COLUMN IF NOT EXISTS reels_share_to_feed BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN toby_brand_config.reels_share_to_feed IS
  'When false, reels published to Instagram will only appear in the Reels tab, not the profile grid.';
