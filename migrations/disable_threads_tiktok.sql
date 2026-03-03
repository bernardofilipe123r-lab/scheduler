-- Migration: Disable threads + tiktok for all brands
-- Users can re-enable manually via the UI
-- Date: 2026-03-03

-- Step 1: For brands with enabled_platforms = NULL (means "all connected"),
-- set explicit config with only instagram, facebook, youtube
UPDATE toby_brand_config
SET enabled_platforms = jsonb_build_object(
  'reels', (
    SELECT jsonb_agg(p)
    FROM unnest(ARRAY['instagram', 'facebook', 'youtube']) AS p
    WHERE EXISTS (
      SELECT 1 FROM brands b
      WHERE b.id = toby_brand_config.brand_id
    )
  ),
  'posts', (
    SELECT jsonb_agg(p)
    FROM unnest(ARRAY['instagram', 'facebook', 'youtube']) AS p
    WHERE EXISTS (
      SELECT 1 FROM brands b
      WHERE b.id = toby_brand_config.brand_id
    )
  )
)
WHERE enabled_platforms IS NULL;

-- Step 2: For brands with explicit config, remove threads and tiktok from each content type
UPDATE toby_brand_config
SET enabled_platforms = (
  SELECT jsonb_object_agg(
    kv.key,
    (SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
     FROM jsonb_array_elements_text(kv.value) AS elem
     WHERE elem NOT IN ('threads', 'tiktok'))
  )
  FROM jsonb_each(enabled_platforms) AS kv
)
WHERE enabled_platforms IS NOT NULL;
