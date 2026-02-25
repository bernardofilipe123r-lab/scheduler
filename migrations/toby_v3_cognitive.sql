-- ============================================================
-- Toby v3.0 — Cognitive Architecture Migration
-- ============================================================
-- This migration adds the memory architecture, world model,
-- strategy combos, meta-learning tables, and extends existing
-- tables for the cognitive loop system.
--
-- All operations are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- 1. Enable pgvector (Supabase has it available)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- NEW TABLES
-- ============================================================

-- Episodic Memory: What happened
CREATE TABLE IF NOT EXISTS toby_episodic_memory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    brand_id        VARCHAR(50),
    content_type    VARCHAR(10),

    -- Event record
    schedule_id     VARCHAR(36),
    strategy        JSONB NOT NULL DEFAULT '{}',
    quality_score   FLOAT,
    toby_score      FLOAT,

    -- AI-generated summary
    summary         TEXT NOT NULL,
    key_facts       JSONB DEFAULT '[]',
    tags            JSONB DEFAULT '[]',

    -- Context
    temporal_context JSONB,
    revision_count  INTEGER DEFAULT 0,
    was_experiment  BOOLEAN DEFAULT FALSE,

    -- Embedding for retrieval
    embedding       vector(1536),

    -- Usage tracking (for memory pruning)
    retrieval_count INTEGER DEFAULT 0,
    last_retrieved  TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Semantic Memory: What it means
CREATE TABLE IF NOT EXISTS toby_semantic_memory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,

    -- The insight
    insight         TEXT NOT NULL,
    confidence      FLOAT DEFAULT 0.5,
    tags            JSONB DEFAULT '[]',

    -- Provenance
    source_episode_ids JSONB DEFAULT '[]',

    -- Validation
    confirmed_count INTEGER DEFAULT 0,
    contradicted_count INTEGER DEFAULT 0,

    -- Embedding for retrieval
    embedding       vector(1536),

    -- Usage tracking
    retrieval_count INTEGER DEFAULT 0,
    last_retrieved  TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Procedural Memory: What to do
CREATE TABLE IF NOT EXISTS toby_procedural_memory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    brand_id        VARCHAR(50),
    content_type    VARCHAR(10),

    -- The rule
    rule_text       TEXT NOT NULL,
    conditions      TEXT,
    action          TEXT,
    confidence      FLOAT DEFAULT 0.5,

    -- Provenance
    source_semantic_ids JSONB DEFAULT '[]',

    -- Validation
    applied_count   INTEGER DEFAULT 0,
    success_count   INTEGER DEFAULT 0,
    failure_count   INTEGER DEFAULT 0,
    success_rate    FLOAT,

    -- Status
    is_active       BOOLEAN DEFAULT TRUE,

    -- Embedding for retrieval
    embedding       vector(1536),

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- World Model: Environmental state
CREATE TABLE IF NOT EXISTS toby_world_model (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    brand_id        VARCHAR(50),

    -- What was observed
    signal_type     VARCHAR(30) NOT NULL,
    signal_data     JSONB NOT NULL,

    -- AI-generated summary
    interpretation  TEXT,

    -- Relevance
    relevance_score FLOAT DEFAULT 0.5,
    expires_at      TIMESTAMPTZ,

    -- Embedding
    embedding       vector(1536),

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Strategy Combos: Track full strategy combination performance
CREATE TABLE IF NOT EXISTS toby_strategy_combos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    brand_id        VARCHAR(50),
    content_type    VARCHAR(10),

    -- The combination (sorted, deterministic key)
    combo_key       VARCHAR(500) NOT NULL,

    -- Statistics
    sample_count    INTEGER DEFAULT 0,
    avg_quality     FLOAT DEFAULT 0,
    avg_toby_score  FLOAT DEFAULT 0,
    score_variance  FLOAT DEFAULT 0,

    -- Trend
    recent_scores   JSONB DEFAULT '[]',

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (user_id, brand_id, content_type, combo_key)
);

-- Raw Signals: Unprocessed intelligence from APIs/web
CREATE TABLE IF NOT EXISTS toby_raw_signals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    brand_id        VARCHAR(50),

    source          VARCHAR(50) NOT NULL,
    signal_type     VARCHAR(30) NOT NULL,
    raw_data        JSONB NOT NULL,
    processed       BOOLEAN DEFAULT FALSE,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Meta Reports: Weekly meta-learning evaluation reports
CREATE TABLE IF NOT EXISTS toby_meta_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,

    -- Key metrics
    exploitation_premium FLOAT,
    calibration_error    FLOAT,
    learning_velocity    FLOAT,
    week_over_week       FLOAT,

    -- Details
    report_data     JSONB NOT NULL DEFAULT '{}',
    actions_taken   JSONB DEFAULT '[]',

    period_start    TIMESTAMPTZ,
    period_end      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Reasoning Traces: Strategist chain-of-thought transcripts
CREATE TABLE IF NOT EXISTS toby_reasoning_traces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(100) NOT NULL,
    schedule_id     VARCHAR(36),

    -- The reasoning
    reasoning_content TEXT,
    decision        JSONB,
    model           VARCHAR(50),
    confidence      FLOAT,
    thompson_override BOOLEAN DEFAULT FALSE,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS ix_episodic_user_brand ON toby_episodic_memory (user_id, brand_id, content_type);
CREATE INDEX IF NOT EXISTS ix_episodic_user_created ON toby_episodic_memory (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_semantic_user ON toby_semantic_memory (user_id);
CREATE INDEX IF NOT EXISTS ix_semantic_user_confidence ON toby_semantic_memory (user_id, confidence DESC);
CREATE INDEX IF NOT EXISTS ix_procedural_user_brand ON toby_procedural_memory (user_id, brand_id, content_type);
CREATE INDEX IF NOT EXISTS ix_procedural_active ON toby_procedural_memory (user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS ix_world_model_user ON toby_world_model (user_id, signal_type);
CREATE INDEX IF NOT EXISTS ix_world_model_expires ON toby_world_model (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_combo_user_brand ON toby_strategy_combos (user_id, brand_id, content_type);
CREATE INDEX IF NOT EXISTS ix_raw_signals_unprocessed ON toby_raw_signals (user_id, processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS ix_meta_reports_user ON toby_meta_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_reasoning_traces_user ON toby_reasoning_traces (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_reasoning_traces_schedule ON toby_reasoning_traces (schedule_id);


-- ============================================================
-- EXTENSIONS TO EXISTING TABLES
-- ============================================================

-- Extend toby_state with cognitive loop timing
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS last_deliberation_at TIMESTAMPTZ;
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS last_meta_cognition_at TIMESTAMPTZ;
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS last_intelligence_at TIMESTAMPTZ;
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS meta_explore_ratio_adjustment FLOAT DEFAULT 0;
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS historical_mining_complete BOOLEAN DEFAULT FALSE;

-- Extend toby_content_tags with immediate quality signal
ALTER TABLE toby_content_tags ADD COLUMN IF NOT EXISTS quality_score FLOAT;
ALTER TABLE toby_content_tags ADD COLUMN IF NOT EXISTS critic_scores JSONB;
ALTER TABLE toby_content_tags ADD COLUMN IF NOT EXISTS strategy_rationale TEXT;
ALTER TABLE toby_content_tags ADD COLUMN IF NOT EXISTS thompson_override BOOLEAN DEFAULT FALSE;

-- Extend toby_experiments with hypothesis tracking
ALTER TABLE toby_experiments ADD COLUMN IF NOT EXISTS hypothesis TEXT;
ALTER TABLE toby_experiments ADD COLUMN IF NOT EXISTS expected_effect_size FLOAT;
ALTER TABLE toby_experiments ADD COLUMN IF NOT EXISTS achieved_significance BOOLEAN;
ALTER TABLE toby_experiments ADD COLUMN IF NOT EXISTS p_value FLOAT;


-- ============================================================
-- VECTOR INDEXES (IVFFlat — created after initial data load is ideal, 
-- but we create them now with small list count for low-data scenarios)
-- ============================================================

-- Note: IVFFlat indexes need at least some rows to build properly.
-- For small datasets, cosine_distance ordering without an index is fine.
-- These indexes will help once memory tables have 100+ rows.

-- We use DO blocks to handle the case where indexes might already exist
DO $$ BEGIN
    CREATE INDEX ix_episodic_embedding ON toby_episodic_memory 
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
    CREATE INDEX ix_semantic_embedding ON toby_semantic_memory 
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
    CREATE INDEX ix_procedural_embedding ON toby_procedural_memory 
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
    CREATE INDEX ix_world_model_embedding ON toby_world_model 
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
