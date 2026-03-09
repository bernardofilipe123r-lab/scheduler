-- migrations/add_profile_image_url.sql
-- Description: Add profile_image_url column to brands table for storing
-- the profile picture URL from the first connected social platform
-- Date: 2026-03-09

ALTER TABLE brands
ADD COLUMN IF NOT EXISTS profile_image_url TEXT DEFAULT NULL;
