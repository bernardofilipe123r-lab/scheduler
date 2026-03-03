-- ============================================================
-- Migration: Create brand_subscriptions table
-- Run: source .env 2>/dev/null; psql "$DATABASE_URL" -f migrations/add_brand_subscriptions.sql
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS brand_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  brand_id VARCHAR(50) NOT NULL REFERENCES brands(id) ON DELETE CASCADE,

  -- Stripe objects
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_price_id VARCHAR(255),

  -- Subscription state (synced from Stripe webhooks)
  status VARCHAR(20) NOT NULL DEFAULT 'incomplete',
    -- Values: incomplete | active | past_due | cancelled | unpaid

  -- Billing period
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,

  -- Cancellation
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One subscription per user+brand
  UNIQUE(user_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_sub_user ON brand_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_brand_sub_brand ON brand_subscriptions(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_sub_stripe ON brand_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_brand_sub_status ON brand_subscriptions(status);

COMMIT;
