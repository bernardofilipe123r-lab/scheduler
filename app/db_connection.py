"""
Database connection and session management.
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import NullPool
from contextlib import contextmanager
from app.models import Base

# Get database URL from environment (Railway provides DATABASE_URL)
DATABASE_URL = os.getenv("DATABASE_URL")

# Fallback to SQLite for local development
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./output/schedules.db"
    print("⚠️  Warning: DATABASE_URL not found, using SQLite fallback")
else:
    print(f"✅ Connected to PostgreSQL database")

# Create engine
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    # PostgreSQL connection
    engine = create_engine(
        DATABASE_URL,
        poolclass=NullPool,  # Railway manages connections
        pool_pre_ping=True   # Verify connections before using
    )

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def run_migrations():
    """Run database migrations to add missing columns."""
    print("🔄 Running database migrations...", flush=True)
    
    migrations = [
        # Add platforms column to generation_jobs if not exists
        {
            "name": "Add platforms column to generation_jobs",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='generation_jobs' AND column_name='platforms'
            """,
            "migration_sql": """
                ALTER TABLE generation_jobs ADD COLUMN platforms JSON;
            """
        },
        # Add slide_texts column to toby_proposals for carousel post support
        {
            "name": "Add slide_texts column to toby_proposals",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='toby_proposals' AND column_name='slide_texts'
            """,
            "migration_sql": """
                ALTER TABLE toby_proposals ADD COLUMN slide_texts JSON;
            """
        },
        # Add agent_name column to toby_proposals for Maestro multi-agent support
        {
            "name": "Add agent_name column to toby_proposals",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='toby_proposals' AND column_name='agent_name'
            """,
            "migration_sql": """
                ALTER TABLE toby_proposals ADD COLUMN agent_name VARCHAR(20) DEFAULT 'toby' NOT NULL;
                CREATE INDEX ix_toby_proposals_agent ON toby_proposals(agent_name);
            """
        },
    ]
    
    with engine.connect() as conn:
        for migration in migrations:
            try:
                # Check if migration is needed
                result = conn.execute(text(migration["check_sql"]))
                exists = result.fetchone() is not None
                
                if not exists:
                    print(f"   📝 Running: {migration['name']}", flush=True)
                    conn.execute(text(migration["migration_sql"]))
                    conn.commit()
                    print(f"   ✅ {migration['name']} - completed", flush=True)
                else:
                    print(f"   ✓ {migration['name']} - already exists", flush=True)
            except Exception as e:
                print(f"   ⚠️ {migration['name']} - skipped ({e})", flush=True)
    
    print("✅ Database migrations complete", flush=True)


def init_db():
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created/verified")
    
    # Run migrations to add any missing columns
    if not DATABASE_URL.startswith("sqlite"):
        run_migrations()


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
