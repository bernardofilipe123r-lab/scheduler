-- ============================================================
-- Migration: Add billing columns to user_profiles
-- Run: source .env 2>/dev/null; psql "$DATABASE_URL" -f migrations/add_user_billing.sql
-- ============================================================

BEGIN;

-- User classification tag
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS tag VARCHAR(20) NOT NULL DEFAULT 'user';

-- Stripe linkage
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

-- Aggregate billing state
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS billing_status VARCHAR(20) NOT NULL DEFAULT 'none';

-- Grace period: 7 days after first payment failure
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS billing_grace_deadline TIMESTAMPTZ;

-- When soft-lock was applied
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS billing_locked_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_tag ON user_profiles(tag);
CREATE INDEX IF NOT EXISTS idx_user_profiles_billing_status ON user_profiles(billing_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_stripe_cust ON user_profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- GRANDFATHERING: All existing users become 'special' (free forever)
UPDATE user_profiles
  SET tag = 'special'
  WHERE tag = 'user' OR tag IS NULL;

COMMIT;
