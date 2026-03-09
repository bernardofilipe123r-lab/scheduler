-- Add Bluesky (AT Protocol) columns to brands table
-- Bluesky uses App Passwords for auth: handle + app_password → session JWTs

ALTER TABLE brands ADD COLUMN IF NOT EXISTS bsky_handle VARCHAR(128);
ALTER TABLE brands ADD COLUMN IF NOT EXISTS bsky_did VARCHAR(128);
ALTER TABLE brands ADD COLUMN IF NOT EXISTS bsky_app_password TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS bsky_access_jwt TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS bsky_refresh_jwt TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS bsky_access_jwt_expires_at TIMESTAMPTZ;
