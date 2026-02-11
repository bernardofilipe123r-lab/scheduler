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
        # Add brand column to toby_proposals — each proposal is for 1 specific brand
        {
            "name": "Add brand column to toby_proposals",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='toby_proposals' AND column_name='brand'
            """,
            "migration_sql": """
                ALTER TABLE toby_proposals ADD COLUMN brand VARCHAR(50);
                CREATE INDEX ix_toby_proposals_brand ON toby_proposals(brand);
            """
        },
        # Add variant column to toby_proposals — dark or light
        {
            "name": "Add variant column to toby_proposals",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='toby_proposals' AND column_name='variant'
            """,
            "migration_sql": """
                ALTER TABLE toby_proposals ADD COLUMN variant VARCHAR(10);
            """
        },
        # Add content_type column to toby_proposals
        {
            "name": "Add content_type column to toby_proposals",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='toby_proposals' AND column_name='content_type'
            """,
            "migration_sql": """
                ALTER TABLE toby_proposals ADD COLUMN content_type VARCHAR(10) DEFAULT 'reel' NOT NULL;
            """
        },
        # ── Maestro Examiner scoring columns ──
        {
            "name": "Add examiner_score column to toby_proposals",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='toby_proposals' AND column_name='examiner_score'
            """,
            "migration_sql": """
                ALTER TABLE toby_proposals ADD COLUMN examiner_score FLOAT;
            """
        },
        {
            "name": "Add examiner_avatar_fit column to toby_proposals",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='toby_proposals' AND column_name='examiner_avatar_fit'
            """,
            "migration_sql": """
                ALTER TABLE toby_proposals ADD COLUMN examiner_avatar_fit FLOAT;
            """
        },
        {
            "name": "Add examiner_content_quality column to toby_proposals",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='toby_proposals' AND column_name='examiner_content_quality'
            """,
            "migration_sql": """
                ALTER TABLE toby_proposals ADD COLUMN examiner_content_quality FLOAT;
            """
        },
        {
            "name": "Add examiner_engagement column to toby_proposals",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='toby_proposals' AND column_name='examiner_engagement'
            """,
            "migration_sql": """
                ALTER TABLE toby_proposals ADD COLUMN examiner_engagement FLOAT;
            """
        },
        {
            "name": "Add examiner_verdict column to toby_proposals",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='toby_proposals' AND column_name='examiner_verdict'
            """,
            "migration_sql": """
                ALTER TABLE toby_proposals ADD COLUMN examiner_verdict VARCHAR(20);
            """
        },
        {
            "name": "Add examiner_reason column to toby_proposals",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='toby_proposals' AND column_name='examiner_reason'
            """,
            "migration_sql": """
                ALTER TABLE toby_proposals ADD COLUMN examiner_reason TEXT;
            """
        },
        {
            "name": "Add examiner_red_flags column to toby_proposals",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='toby_proposals' AND column_name='examiner_red_flags'
            """,
            "migration_sql": """
                ALTER TABLE toby_proposals ADD COLUMN examiner_red_flags JSON;
            """
        },
        # ── AI Evolution Engine: AIAgent evolution columns ──
        {
            "name": "Add survival_score column to ai_agents",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='ai_agents' AND column_name='survival_score'
            """,
            "migration_sql": """
                ALTER TABLE ai_agents ADD COLUMN survival_score FLOAT DEFAULT 0.0;
            """
        },
        {
            "name": "Add lifetime_views column to ai_agents",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='ai_agents' AND column_name='lifetime_views'
            """,
            "migration_sql": """
                ALTER TABLE ai_agents ADD COLUMN lifetime_views INTEGER DEFAULT 0;
            """
        },
        {
            "name": "Add lifetime_proposals column to ai_agents",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='ai_agents' AND column_name='lifetime_proposals'
            """,
            "migration_sql": """
                ALTER TABLE ai_agents ADD COLUMN lifetime_proposals INTEGER DEFAULT 0;
            """
        },
        {
            "name": "Add lifetime_accepted column to ai_agents",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='ai_agents' AND column_name='lifetime_accepted'
            """,
            "migration_sql": """
                ALTER TABLE ai_agents ADD COLUMN lifetime_accepted INTEGER DEFAULT 0;
            """
        },
        {
            "name": "Add generation column to ai_agents",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='ai_agents' AND column_name='generation'
            """,
            "migration_sql": """
                ALTER TABLE ai_agents ADD COLUMN generation INTEGER DEFAULT 1;
            """
        },
        {
            "name": "Add last_mutation_at column to ai_agents",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='ai_agents' AND column_name='last_mutation_at'
            """,
            "migration_sql": """
                ALTER TABLE ai_agents ADD COLUMN last_mutation_at TIMESTAMP;
            """
        },
        {
            "name": "Add mutation_count column to ai_agents",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='ai_agents' AND column_name='mutation_count'
            """,
            "migration_sql": """
                ALTER TABLE ai_agents ADD COLUMN mutation_count INTEGER DEFAULT 0;
            """
        },
        {
            "name": "Add parent_agent_id column to ai_agents",
            "check_sql": """
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='ai_agents' AND column_name='parent_agent_id'
            """,
            "migration_sql": """
                ALTER TABLE ai_agents ADD COLUMN parent_agent_id VARCHAR(50);
            """
        },
        # ── AI Evolution Engine: agent_performance table ──
        {
            "name": "Create agent_performance table",
            "check_sql": """
                SELECT table_name FROM information_schema.tables 
                WHERE table_name='agent_performance'
            """,
            "migration_sql": """
                CREATE TABLE agent_performance (
                    id SERIAL PRIMARY KEY,
                    agent_id VARCHAR(50) NOT NULL,
                    period VARCHAR(20) NOT NULL DEFAULT 'feedback',
                    total_proposals INTEGER DEFAULT 0,
                    accepted_proposals INTEGER DEFAULT 0,
                    published_count INTEGER DEFAULT 0,
                    total_views INTEGER DEFAULT 0,
                    avg_views FLOAT DEFAULT 0.0,
                    total_likes INTEGER DEFAULT 0,
                    total_comments INTEGER DEFAULT 0,
                    avg_engagement_rate FLOAT DEFAULT 0.0,
                    strategy_breakdown JSON,
                    best_strategy VARCHAR(30),
                    worst_strategy VARCHAR(30),
                    avg_examiner_score FLOAT,
                    survival_score FLOAT DEFAULT 0.0,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW()
                );
                CREATE INDEX ix_agent_perf_agent_id ON agent_performance(agent_id);
                CREATE INDEX ix_agent_perf_created ON agent_performance(created_at);
                CREATE INDEX ix_agent_perf_agent_period ON agent_performance(agent_id, period, created_at);
            """
        },
        # ── AI Evolution Engine: agent_learning table ──
        {
            "name": "Create agent_learning table",
            "check_sql": """
                SELECT table_name FROM information_schema.tables 
                WHERE table_name='agent_learning'
            """,
            "migration_sql": """
                CREATE TABLE agent_learning (
                    id SERIAL PRIMARY KEY,
                    agent_id VARCHAR(50) NOT NULL,
                    mutation_type VARCHAR(30) NOT NULL,
                    description TEXT NOT NULL,
                    old_value JSON,
                    new_value JSON,
                    trigger VARCHAR(30) NOT NULL DEFAULT 'feedback',
                    confidence FLOAT,
                    survival_score_at FLOAT,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW()
                );
                CREATE INDEX ix_agent_learning_agent_id ON agent_learning(agent_id);
                CREATE INDEX ix_agent_learning_created ON agent_learning(created_at);
                CREATE INDEX ix_agent_learning_agent_time ON agent_learning(agent_id, created_at);
            """
        },
        # ── Phase 4: Gene Pool table (DNA archive for inheritance) ──
        {
            "name": "Create gene_pool table",
            "check_sql": """
                SELECT table_name FROM information_schema.tables 
                WHERE table_name='gene_pool'
            """,
            "migration_sql": """
                CREATE TABLE gene_pool (
                    id SERIAL PRIMARY KEY,
                    source_agent_id VARCHAR(50) NOT NULL,
                    source_agent_name VARCHAR(100) NOT NULL,
                    personality TEXT,
                    temperature FLOAT NOT NULL,
                    variant VARCHAR(20) NOT NULL,
                    strategy_names TEXT NOT NULL,
                    strategy_weights TEXT NOT NULL,
                    risk_tolerance VARCHAR(20) NOT NULL,
                    survival_score FLOAT DEFAULT 0.0,
                    lifetime_views INTEGER DEFAULT 0,
                    generation INTEGER DEFAULT 1,
                    reason VARCHAR(30) NOT NULL,
                    times_inherited INTEGER DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW()
                );
                CREATE INDEX ix_gene_pool_source ON gene_pool(source_agent_id);
                CREATE INDEX ix_gene_pool_created ON gene_pool(created_at);
                CREATE INDEX ix_gene_pool_reason ON gene_pool(reason);
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
