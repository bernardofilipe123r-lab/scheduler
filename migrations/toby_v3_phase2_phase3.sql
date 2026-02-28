-- Toby v3.0 Phase 2 + Phase 3 Migration
-- Fixes critical scoring bugs + adds Bayesian learning + contextual bandits

-- ============================================================
-- BUG FIX: Add brand_id to toby_content_tags
-- (previously missing — caused _generate_48h_learning_events to crash)
-- ============================================================
ALTER TABLE toby_content_tags ADD COLUMN IF NOT EXISTS brand_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS ix_toby_content_tags_brand ON toby_content_tags(brand_id);

-- Backfill brand_id from scheduled_reels extra_data where possible
UPDATE toby_content_tags t
SET brand_id = (s.extra_data->>'brand')
FROM scheduled_reels s
WHERE t.schedule_id = s.schedule_id
  AND t.brand_id IS NULL
  AND s.extra_data->>'brand' IS NOT NULL;

-- ============================================================
-- PHASE 2: Bayesian weighted scoring columns on strategy scores
-- ============================================================
ALTER TABLE toby_strategy_scores ADD COLUMN IF NOT EXISTS weighted_total FLOAT DEFAULT 0;
ALTER TABLE toby_strategy_scores ADD COLUMN IF NOT EXISTS weight_sum FLOAT DEFAULT 0;
ALTER TABLE toby_strategy_scores ADD COLUMN IF NOT EXISTS alpha FLOAT DEFAULT 1.0;
ALTER TABLE toby_strategy_scores ADD COLUMN IF NOT EXISTS beta_param FLOAT DEFAULT 1.0;

-- Backfill weighted columns from existing data
UPDATE toby_strategy_scores
SET weighted_total = COALESCE(total_score, 0),
    weight_sum = COALESCE(sample_count, 0),
    alpha = 1.0 + GREATEST(0, COALESCE(sample_count, 0) * GREATEST(0, LEAST(1, (COALESCE(avg_score, 50) - 40) / 60.0))),
    beta_param = 1.0 + GREATEST(0, COALESCE(sample_count, 0) * (1 - GREATEST(0, LEAST(1, (COALESCE(avg_score, 50) - 40) / 60.0))))
WHERE sample_count > 0;

-- ============================================================
-- PHASE 2: Track preliminary scores for 48h->7d correction
-- ============================================================
ALTER TABLE toby_content_tags ADD COLUMN IF NOT EXISTS preliminary_score FLOAT;
ALTER TABLE toby_content_tags ADD COLUMN IF NOT EXISTS preliminary_scored_at TIMESTAMPTZ;

-- ============================================================
-- PHASE 3: Content DNA Recommendations table
-- ============================================================
CREATE TABLE IF NOT EXISTS content_dna_recommendations (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    brand_id VARCHAR(50),
    recommendation_type VARCHAR(50) NOT NULL,
    dimension VARCHAR(30),
    current_value TEXT,
    suggested_value TEXT,
    evidence JSONB DEFAULT '{}',
    confidence FLOAT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_dna_rec_user_status ON content_dna_recommendations(user_id, status);
