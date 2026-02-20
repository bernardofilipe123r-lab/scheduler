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
