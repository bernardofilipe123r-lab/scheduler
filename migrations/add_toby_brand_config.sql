-- Migration: Add toby_brand_config table for per-brand Toby settings
-- Also adds reels_enabled and posts_enabled columns to toby_state

-- Per-brand Toby configuration
CREATE TABLE IF NOT EXISTS toby_brand_config (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    brand_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    reel_slots_per_day INTEGER NOT NULL DEFAULT 6,
    post_slots_per_day INTEGER NOT NULL DEFAULT 2,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_toby_brand_config_user_id ON toby_brand_config(user_id);

-- Global toggles on toby_state
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS reels_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS posts_enabled BOOLEAN NOT NULL DEFAULT TRUE;
