-- Migration: Remove brand_id from niche_config
-- Content DNA is per-user, not per-brand.
--
-- Strategy:
-- 1. Deduplicate: for each user_id, keep only the most recently updated row.
-- 2. Drop the brand_id column and old constraint.
-- 3. Add new unique constraint on user_id alone.

BEGIN;

-- Step 1: Delete duplicate rows per user_id, keeping the most recently updated one.
-- Uses a CTE to identify the "keeper" row per user_id.
DELETE FROM niche_config
WHERE id NOT IN (
    SELECT DISTINCT ON (user_id) id
    FROM niche_config
    ORDER BY user_id, updated_at DESC NULLS LAST, id
);

-- Step 2: Nullify brand_id on any remaining per-brand rows (in case they were the "kept" ones)
UPDATE niche_config SET brand_id = NULL WHERE brand_id IS NOT NULL;

-- Step 3: Drop old constraint and index
ALTER TABLE niche_config DROP CONSTRAINT IF EXISTS uq_niche_config_user_brand;
DROP INDEX IF EXISTS ix_niche_config_brand_id;

-- Step 4: Drop the brand_id column
ALTER TABLE niche_config DROP COLUMN IF EXISTS brand_id;

-- Step 5: Add new unique constraint on user_id
ALTER TABLE niche_config ADD CONSTRAINT uq_niche_config_user UNIQUE (user_id);

COMMIT;
