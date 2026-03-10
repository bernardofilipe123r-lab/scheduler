-- Add Freepik cost tracking columns to user_cost_daily and user_cost_monthly
-- Tracks Freepik Classic Fast image generation usage

ALTER TABLE user_cost_daily
  ADD COLUMN IF NOT EXISTS freepik_calls INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freepik_cost_usd FLOAT DEFAULT 0.0;

ALTER TABLE user_cost_monthly
  ADD COLUMN IF NOT EXISTS freepik_calls INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freepik_cost_usd FLOAT DEFAULT 0.0;
