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
        # Add niche_config discovery columns if they don't exist
        for col in ["competitor_accounts", "discovery_hashtags"]:
            conn.execute(
                text(
                    f"ALTER TABLE niche_config ADD COLUMN IF NOT EXISTS {col} JSONB DEFAULT '[]'::jsonb"
                )
            )
        # NicheConfig v2: citation, composition, YT, carousel fields
        niche_v2_migrations = [
            "ALTER TABLE niche_config ADD COLUMN IF NOT EXISTS citation_style VARCHAR DEFAULT 'none'",
            "ALTER TABLE niche_config ADD COLUMN IF NOT EXISTS citation_source_types JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE niche_config ADD COLUMN IF NOT EXISTS image_composition_style TEXT DEFAULT ''",
            "ALTER TABLE niche_config ADD COLUMN IF NOT EXISTS yt_title_examples JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE niche_config ADD COLUMN IF NOT EXISTS yt_title_bad_examples JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE niche_config ADD COLUMN IF NOT EXISTS carousel_cta_topic VARCHAR DEFAULT ''",
        ]
        for sql in niche_v2_migrations:
            conn.execute(text(sql))
        # Performance indexes
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_scheduled_reels_status_time ON scheduled_reels(status, scheduled_time)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_brands_user_id ON brands(user_id)"))
        # Toby: add created_by column to scheduled_reels
        conn.execute(text("ALTER TABLE scheduled_reels ADD COLUMN IF NOT EXISTS created_by VARCHAR(20) DEFAULT 'user'"))
        # Seed global prompt settings if they don't exist
        for key, desc in [
            ("reels_prompt", "Global prompt describing topics/ideas for reel content"),
            ("posts_prompt", "Global prompt describing topics/ideas for carousel/post content"),
            ("brand_description", "Global brand description (avatar, content topic, audience)"),
        ]:
            conn.execute(
                text(
                    "INSERT INTO app_settings (key, value, description, category, value_type, sensitive, updated_at) "
                    "VALUES (:key, '', :desc, 'content', 'string', false, now()) "
                    "ON CONFLICT (key) DO NOTHING"
                ),
                {"key": key, "desc": desc},
            )

        # Toby V2: new columns on toby_content_tags
        for col, coltype, default in [
            ("metrics_unreliable", "BOOLEAN", "FALSE"),
            ("human_modified", "BOOLEAN", "FALSE"),
            ("used_fallback", "BOOLEAN", "FALSE"),
        ]:
            conn.execute(text(
                f"ALTER TABLE toby_content_tags ADD COLUMN IF NOT EXISTS {col} {coltype} DEFAULT {default}"
            ))

        # Toby V2: budget columns on toby_state
        conn.execute(text("ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS daily_budget_cents INTEGER"))
        conn.execute(text("ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS spent_today_cents INTEGER DEFAULT 0"))
        conn.execute(text("ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS budget_reset_at TIMESTAMPTZ"))

        # ── Toby V3: Cognitive loop columns ──
        v3_state_cols = [
            "ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS last_deliberation_at TIMESTAMPTZ",
            "ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS last_meta_cognition_at TIMESTAMPTZ",
            "ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS last_intelligence_at TIMESTAMPTZ",
            "ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS meta_explore_ratio_adjustment FLOAT",
            "ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS historical_mining_complete BOOLEAN DEFAULT FALSE",
        ]
        for sql in v3_state_cols:
            conn.execute(text(sql))

        # Toby V3: extra columns on toby_content_tags
        v3_tag_cols = [
            "ALTER TABLE toby_content_tags ADD COLUMN IF NOT EXISTS reasoning_trace_id VARCHAR(36)",
            "ALTER TABLE toby_content_tags ADD COLUMN IF NOT EXISTS critic_scores JSONB",
            "ALTER TABLE toby_content_tags ADD COLUMN IF NOT EXISTS strategy_combo_id VARCHAR(36)",
            "ALTER TABLE toby_content_tags ADD COLUMN IF NOT EXISTS cognitive_metadata JSONB",
        ]
        for sql in v3_tag_cols:
            conn.execute(text(sql))

        # Toby V3: extra columns on toby_experiments
        v3_exp_cols = [
            "ALTER TABLE toby_experiments ADD COLUMN IF NOT EXISTS hypothesis TEXT",
            "ALTER TABLE toby_experiments ADD COLUMN IF NOT EXISTS p_value FLOAT",
            "ALTER TABLE toby_experiments ADD COLUMN IF NOT EXISTS effect_size FLOAT",
            "ALTER TABLE toby_experiments ADD COLUMN IF NOT EXISTS early_stopped BOOLEAN DEFAULT FALSE",
        ]
        for sql in v3_exp_cols:
            conn.execute(text(sql))

        # OAuth state store table (persistent CSRF tokens for OAuth flows)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS oauth_states (
                state_token VARCHAR(64) PRIMARY KEY,
                platform VARCHAR(20) NOT NULL,
                brand_id VARCHAR(100) NOT NULL,
                user_id VARCHAR(100) NOT NULL,
                return_to VARCHAR(50),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                used_at TIMESTAMPTZ
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_oauth_states_created ON oauth_states(created_at)"))

        conn.commit()


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
