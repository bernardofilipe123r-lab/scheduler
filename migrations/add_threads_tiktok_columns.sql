-- Threads credentials (Meta ecosystem)
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS threads_access_token TEXT,
  ADD COLUMN IF NOT EXISTS threads_user_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS threads_username VARCHAR(64),
  ADD COLUMN IF NOT EXISTS threads_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS threads_token_last_refreshed_at TIMESTAMPTZ;

-- TikTok credentials (separate OAuth app)
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS tiktok_access_token TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_user_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS tiktok_username VARCHAR(128),
  ADD COLUMN IF NOT EXISTS tiktok_open_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS tiktok_access_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tiktok_refresh_token_expires_at TIMESTAMPTZ;

-- TikTok PKCE: code_verifier for OAuth state
ALTER TABLE oauth_states
  ADD COLUMN IF NOT EXISTS code_verifier TEXT;
