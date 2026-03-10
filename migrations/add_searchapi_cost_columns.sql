-- Add SearchApi cost tracking columns to user_cost_daily and user_cost_monthly
-- SearchApi Google Images: free tier 100 credits total, ~$0.01 per search

ALTER TABLE user_cost_daily
  ADD COLUMN IF NOT EXISTS searchapi_calls INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS searchapi_cost_usd FLOAT DEFAULT 0.0;

ALTER TABLE user_cost_monthly
  ADD COLUMN IF NOT EXISTS searchapi_calls INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS searchapi_cost_usd FLOAT DEFAULT 0.0;
