-- Migration: Add feature_flags table for persistent, DB-backed feature flags.
-- Replaces the in-memory dict that was lost on every redeploy.

CREATE TABLE IF NOT EXISTS feature_flags (
    flag_name VARCHAR(100) PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed current defaults so existing flags survive
INSERT INTO feature_flags (flag_name, enabled) VALUES
    ('thompson_sampling', true),
    ('drift_detection', true),
    ('cross_brand_learning', true),
    ('discovery_feedback', true),
    ('experiment_timeouts', true),
    ('fuzzy_slot_matching', true),
    ('auto_retry_publish', true),
    ('credential_refresh', true),
    ('llm_strategy_agent', false),
    ('budget_enforcement', false),
    ('anomaly_detection', false),
    ('cognitive_strategist', false),
    ('multi_critic', false),
    ('memory_system', false),
    ('deliberation_loop', true),
    ('meta_learning', false),
    ('intelligence_pipeline', false),
    ('historical_mining', false),
    ('cross_brand_intelligence', false),
    ('text_video_reels', false)
ON CONFLICT (flag_name) DO NOTHING;
