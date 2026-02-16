"""
Database connection and session management.
Connects to Supabase PostgreSQL via DATABASE_URL.
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from app.models import Base

# Get database URL from environment — must point to Supabase PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is not set. "
        "Set it to your Supabase PostgreSQL connection string."
    )

print("✅ Connected to PostgreSQL database (Supabase)")

# PostgreSQL connection
engine = create_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initialize database tables via SQLAlchemy metadata."""
    Base.metadata.create_all(bind=engine)
    run_migrations()
    print("✅ Database tables created/verified")


def run_migrations():
    """Run idempotent SQL migrations for indexes and constraints not handled by create_all."""
    with engine.connect() as conn:
        # Migration: Learning & Knowledge tables (v2.0)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS learned_patterns (
                id SERIAL PRIMARY KEY,
                pattern_type VARCHAR(50) NOT NULL,
                pattern_data JSONB NOT NULL,
                confidence_score FLOAT NOT NULL DEFAULT 0.5,
                views_avg INTEGER DEFAULT 0,
                engagement_rate_avg FLOAT DEFAULT 0.0,
                sample_size INTEGER DEFAULT 0,
                learned_from_brands JSONB NOT NULL DEFAULT '[]'::jsonb,
                learned_from_agents JSONB NOT NULL DEFAULT '[]'::jsonb,
                first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                validation_count INTEGER DEFAULT 1,
                decay_weight FLOAT DEFAULT 1.0,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_lp_pattern_type ON learned_patterns(pattern_type);
            CREATE INDEX IF NOT EXISTS idx_lp_confidence ON learned_patterns(confidence_score DESC);
            CREATE INDEX IF NOT EXISTS idx_lp_validated ON learned_patterns(last_validated_at DESC);
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS brand_performance_memory (
                brand_id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL,
                top_topics JSONB,
                top_keywords JSONB,
                top_title_patterns JSONB,
                avg_views INTEGER DEFAULT 0,
                avg_engagement_rate FLOAT DEFAULT 0.0,
                best_posting_hours JSONB,
                total_reels_analyzed INTEGER DEFAULT 0,
                last_analysis_at TIMESTAMPTZ,
                analysis_version INTEGER DEFAULT 1,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_bpm_user ON brand_performance_memory(user_id);
            CREATE INDEX IF NOT EXISTS idx_bpm_analysis ON brand_performance_memory(last_analysis_at DESC);
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS competitor_accounts (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL,
                brand_id VARCHAR(50),
                instagram_handle VARCHAR(100) NOT NULL,
                account_type VARCHAR(50) DEFAULT 'competitor',
                priority INTEGER DEFAULT 5,
                active BOOLEAN DEFAULT TRUE,
                last_scraped_at TIMESTAMPTZ,
                posts_scraped_count INTEGER DEFAULT 0,
                avg_views INTEGER DEFAULT 0,
                added_by VARCHAR(50) DEFAULT 'user',
                notes TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT uq_user_handle UNIQUE (user_id, instagram_handle)
            );
            CREATE INDEX IF NOT EXISTS idx_ca_user ON competitor_accounts(user_id);
            CREATE INDEX IF NOT EXISTS idx_ca_priority ON competitor_accounts(priority);
            CREATE INDEX IF NOT EXISTS idx_ca_active ON competitor_accounts(active);
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS api_quota_usage (
                id SERIAL PRIMARY KEY,
                service VARCHAR(50) NOT NULL,
                hour_window TIMESTAMPTZ NOT NULL,
                calls_made INTEGER DEFAULT 0,
                quota_limit INTEGER NOT NULL,
                agent_breakdown JSONB,
                operation_breakdown JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT uq_service_hour UNIQUE (service, hour_window)
            );
            CREATE INDEX IF NOT EXISTS idx_aqu_service ON api_quota_usage(service);
            CREATE INDEX IF NOT EXISTS idx_aqu_window ON api_quota_usage(hour_window DESC);
            CREATE INDEX IF NOT EXISTS idx_aqu_service_created ON api_quota_usage(service, created_at);
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS agent_learning_cycles (
                id SERIAL PRIMARY KEY,
                agent_id VARCHAR(50) NOT NULL,
                cycle_type VARCHAR(50) NOT NULL,
                status VARCHAR(20) NOT NULL,
                started_at TIMESTAMPTZ NOT NULL,
                completed_at TIMESTAMPTZ,
                duration_seconds INTEGER,
                api_calls_used INTEGER DEFAULT 0,
                items_processed INTEGER DEFAULT 0,
                patterns_discovered INTEGER DEFAULT 0,
                patterns_updated INTEGER DEFAULT 0,
                error_message TEXT,
                cycle_metadata JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_alc_agent ON agent_learning_cycles(agent_id);
            CREATE INDEX IF NOT EXISTS idx_alc_type ON agent_learning_cycles(cycle_type);
            CREATE INDEX IF NOT EXISTS idx_alc_status ON agent_learning_cycles(status);
            CREATE INDEX IF NOT EXISTS idx_alc_created ON agent_learning_cycles(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_alc_agent_status ON agent_learning_cycles(agent_id, status);
            CREATE INDEX IF NOT EXISTS idx_alc_agent_completed ON agent_learning_cycles(agent_id, completed_at DESC);
        """))

        conn.commit()

        # Migration: MaestroConfig — add user_id column and make composite PK
        # This migrates the table from single PK (key) to composite PK (key, user_id)
        # Existing rows get user_id set to the DEFAULT_USER_ID or first active user
        _migrate_maestro_config_per_user(conn)
        conn.commit()


def _migrate_maestro_config_per_user(conn):
    """Add user_id to maestro_config table if not present, migrate existing data."""
    # Check if user_id column already exists
    result = conn.execute(text("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'maestro_config' AND column_name = 'user_id'
    """))
    if result.fetchone():
        return  # Already migrated

    print("🔄 Migrating maestro_config to per-user schema...", flush=True)

    # Determine the admin user_id to assign to existing rows
    admin_user_id = os.getenv("DEFAULT_USER_ID", "__system__")
    if admin_user_id == "__system__":
        # Try to find the first active user
        user_row = conn.execute(text(
            "SELECT user_id FROM user_profiles WHERE active = true ORDER BY created_at ASC LIMIT 1"
        )).fetchone()
        if user_row:
            admin_user_id = user_row[0]

    # 1. Add user_id column (nullable temporarily)
    conn.execute(text(
        "ALTER TABLE maestro_config ADD COLUMN user_id VARCHAR(100)"
    ))

    # 2. Set existing rows to admin user_id
    conn.execute(text(
        "UPDATE maestro_config SET user_id = :uid WHERE user_id IS NULL"
    ), {"uid": admin_user_id})

    # 3. Make user_id NOT NULL
    conn.execute(text(
        "ALTER TABLE maestro_config ALTER COLUMN user_id SET NOT NULL"
    ))

    # 4. Set default for new rows
    conn.execute(text(
        "ALTER TABLE maestro_config ALTER COLUMN user_id SET DEFAULT '__system__'"
    ))

    # 5. Drop old PK and create composite PK
    conn.execute(text(
        "ALTER TABLE maestro_config DROP CONSTRAINT IF EXISTS maestro_config_pkey"
    ))
    conn.execute(text(
        "ALTER TABLE maestro_config ADD PRIMARY KEY (key, user_id)"
    ))

    print(f"✅ maestro_config migrated to per-user (existing rows → user_id={admin_user_id})", flush=True)


def get_db() -> Session:
    """
    Dependency for FastAPI routes.
    
    Usage:
        @app.get("/items")
        def get_items(db: Session = Depends(get_db)):
            return db.query(Item).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session():
    """
    Context manager for database sessions.
    
    Usage:
        with get_db_session() as db:
            user = db.query(User).first()
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
