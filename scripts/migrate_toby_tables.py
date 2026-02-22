#!/usr/bin/env python3
"""
Migration script: Create all Toby-related database tables.

- toby_state: Per-user Toby configuration and state
- toby_experiments: A/B test definitions and results
- toby_strategy_scores: Performance aggregates per strategy option
- toby_activity_log: Audit trail of all Toby actions
- toby_content_tags: Links Toby metadata to scheduled content
- ALTER scheduled_reels: Add created_by column
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set")
    sys.exit(1)

engine = create_engine(DATABASE_URL)

MIGRATIONS = [
    # ── toby_state ──
    """
    CREATE TABLE IF NOT EXISTS toby_state (
        id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       VARCHAR(100) NOT NULL UNIQUE,
        enabled       BOOLEAN NOT NULL DEFAULT FALSE,
        enabled_at    TIMESTAMPTZ,
        disabled_at   TIMESTAMPTZ,
        phase         VARCHAR(20) NOT NULL DEFAULT 'bootstrap',
        phase_started_at TIMESTAMPTZ,
        buffer_days           INTEGER DEFAULT 2,
        explore_ratio         FLOAT DEFAULT 0.30,
        reel_slots_per_day    INTEGER DEFAULT 6,
        post_slots_per_day    INTEGER DEFAULT 2,
        last_buffer_check_at    TIMESTAMPTZ,
        last_metrics_check_at   TIMESTAMPTZ,
        last_analysis_at        TIMESTAMPTZ,
        last_discovery_at       TIMESTAMPTZ,
        daily_budget_cents    INTEGER,
        spent_today_cents     INTEGER DEFAULT 0,
        budget_reset_at       TIMESTAMPTZ,
        created_at   TIMESTAMPTZ DEFAULT now(),
        updated_at   TIMESTAMPTZ DEFAULT now()
    )
    """,
    # ── toby_experiments ──
    """
    CREATE TABLE IF NOT EXISTS toby_experiments (
        id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         VARCHAR(100) NOT NULL,
        content_type    VARCHAR(10) NOT NULL,
        dimension       VARCHAR(30) NOT NULL,
        options         JSONB NOT NULL,
        results         JSONB NOT NULL DEFAULT '{}',
        status          VARCHAR(20) NOT NULL DEFAULT 'active',
        winner          VARCHAR(100),
        started_at      TIMESTAMPTZ DEFAULT now(),
        completed_at    TIMESTAMPTZ,
        min_samples     INTEGER DEFAULT 5
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_toby_exp_user_status ON toby_experiments(user_id, status)",
    # Unique constraint: one active experiment per user/content_type/dimension
    """
    DO $$ BEGIN
        ALTER TABLE toby_experiments
            ADD CONSTRAINT uq_toby_exp_active UNIQUE (user_id, content_type, dimension, status);
    EXCEPTION WHEN duplicate_table THEN NULL;
              WHEN duplicate_object THEN NULL;
    END $$
    """,
    # ── toby_strategy_scores ──
    """
    CREATE TABLE IF NOT EXISTS toby_strategy_scores (
        id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         VARCHAR(100) NOT NULL,
        brand_id        VARCHAR(50),
        content_type    VARCHAR(10) NOT NULL,
        dimension       VARCHAR(30) NOT NULL,
        option_value    VARCHAR(100) NOT NULL,
        sample_count    INTEGER DEFAULT 0,
        total_score     FLOAT DEFAULT 0,
        avg_score       FLOAT DEFAULT 0,
        score_variance  FLOAT DEFAULT 0,
        best_score      FLOAT DEFAULT 0,
        worst_score     FLOAT DEFAULT 100,
        recent_scores   JSONB DEFAULT '[]',
        updated_at      TIMESTAMPTZ DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_toby_strategy_user ON toby_strategy_scores(user_id, content_type, dimension)",
    """
    DO $$ BEGIN
        ALTER TABLE toby_strategy_scores
            ADD CONSTRAINT uq_toby_strategy UNIQUE (user_id, brand_id, content_type, dimension, option_value);
    EXCEPTION WHEN duplicate_table THEN NULL;
              WHEN duplicate_object THEN NULL;
    END $$
    """,
    # ── toby_activity_log ──
    """
    CREATE TABLE IF NOT EXISTS toby_activity_log (
        id          SERIAL PRIMARY KEY,
        user_id     VARCHAR(100) NOT NULL,
        action_type VARCHAR(30) NOT NULL,
        description TEXT NOT NULL,
        metadata    JSONB,
        level       VARCHAR(10) DEFAULT 'info',
        created_at  TIMESTAMPTZ DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_toby_activity_user_time ON toby_activity_log(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_toby_activity_type ON toby_activity_log(user_id, action_type)",
    # ── toby_content_tags ──
    """
    CREATE TABLE IF NOT EXISTS toby_content_tags (
        id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         VARCHAR(100) NOT NULL,
        schedule_id     VARCHAR(36) NOT NULL,
        content_type    VARCHAR(10) NOT NULL,
        personality     VARCHAR(50),
        topic_bucket    VARCHAR(50),
        hook_strategy   VARCHAR(50),
        title_format    VARCHAR(50),
        visual_style    VARCHAR(50),
        experiment_id   VARCHAR(36),
        is_experiment   BOOLEAN DEFAULT FALSE,
        is_control      BOOLEAN DEFAULT FALSE,
        toby_score      FLOAT,
        scored_at       TIMESTAMPTZ,
        score_phase     VARCHAR(10),
        created_at      TIMESTAMPTZ DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_toby_tags_user ON toby_content_tags(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_toby_tags_experiment ON toby_content_tags(experiment_id)",
    "CREATE INDEX IF NOT EXISTS idx_toby_tags_schedule ON toby_content_tags(schedule_id)",
    # ── scheduled_reels: Add created_by column ──
    "ALTER TABLE scheduled_reels ADD COLUMN IF NOT EXISTS created_by VARCHAR(20) DEFAULT 'user'",
]


def run_migration():
    print("🤖 Running Toby database migrations...")
    with engine.connect() as conn:
        for i, sql in enumerate(MIGRATIONS, 1):
            try:
                conn.execute(text(sql))
                print(f"  ✅ Migration {i}/{len(MIGRATIONS)} applied")
            except Exception as e:
                print(f"  ⚠️  Migration {i}/{len(MIGRATIONS)}: {e}")
        conn.commit()
    print("✅ All Toby migrations complete!")


if __name__ == "__main__":
    run_migration()
