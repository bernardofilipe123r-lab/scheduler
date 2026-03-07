-- Migration: Add processed_webhooks table for Stripe webhook idempotency
-- Prevents duplicate processing when Stripe retries webhook deliveries

CREATE TABLE IF NOT EXISTS processed_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_event_id ON processed_webhooks (event_id);

-- Auto-cleanup: remove entries older than 7 days (Stripe retries within 72h max)
-- This keeps the table small. Cleanup runs from app scheduler.
