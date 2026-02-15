"""
Learning & knowledge models: LearnedPattern, BrandPerformanceMemory,
CompetitorAccount, APIQuotaUsage, AgentLearningCycle.
"""
from datetime import datetime
from sqlalchemy import UniqueConstraint
from app.models.base import Base, Column, String, DateTime, Text, Boolean, Integer, JSON, Float


class LearnedPattern(Base):
    """
    Patterns discovered from analysing content performance.

    Types: 'title_structure', 'topic_cluster', 'keyword_combo', 'posting_time'
    """
    __tablename__ = 'learned_patterns'

    id = Column(Integer, primary_key=True, autoincrement=True)
    pattern_type = Column(String(50), nullable=False, index=True)

    pattern_data = Column(JSON, nullable=False)
    confidence_score = Column(Float, nullable=False, default=0.5)
    views_avg = Column(Integer, default=0)
    engagement_rate_avg = Column(Float, default=0.0)
    sample_size = Column(Integer, default=0)

    learned_from_brands = Column(JSON, nullable=False, default=list)
    learned_from_agents = Column(JSON, nullable=False, default=list)

    first_seen_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    last_validated_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    validation_count = Column(Integer, default=1)
    decay_weight = Column(Float, default=1.0)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class BrandPerformanceMemory(Base):
    """
    Aggregated performance memory per brand.
    """
    __tablename__ = 'brand_performance_memory'

    brand_id = Column(String(50), primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)

    top_topics = Column(JSON)
    top_keywords = Column(JSON)
    top_title_patterns = Column(JSON)

    avg_views = Column(Integer, default=0)
    avg_engagement_rate = Column(Float, default=0.0)
    best_posting_hours = Column(JSON)

    total_reels_analyzed = Column(Integer, default=0)
    last_analysis_at = Column(DateTime(timezone=True), index=True)
    analysis_version = Column(Integer, default=1)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class CompetitorAccount(Base):
    """
    Competitor Instagram accounts tracked for inspiration.
    """
    __tablename__ = 'competitor_accounts'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(100), nullable=False, index=True)
    brand_id = Column(String(50), nullable=True)

    instagram_handle = Column(String(100), nullable=False)
    account_type = Column(String(50), default='competitor')
    priority = Column(Integer, default=5, index=True)
    active = Column(Boolean, default=True, index=True)

    last_scraped_at = Column(DateTime(timezone=True))
    posts_scraped_count = Column(Integer, default=0)
    avg_views = Column(Integer, default=0)

    added_by = Column(String(50), default='user')
    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('user_id', 'instagram_handle', name='uq_user_handle'),
    )


class APIQuotaUsage(Base):
    """
    Tracks API call quotas per service per hour window.
    """
    __tablename__ = 'api_quota_usage'

    id = Column(Integer, primary_key=True, autoincrement=True)
    service = Column(String(50), nullable=False, index=True)
    hour_window = Column(DateTime(timezone=True), nullable=False, index=True)

    calls_made = Column(Integer, default=0)
    quota_limit = Column(Integer, nullable=False)

    agent_breakdown = Column(JSON)
    operation_breakdown = Column(JSON)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('service', 'hour_window', name='uq_service_hour'),
    )


class AgentLearningCycle(Base):
    """
    Tracks each learning/analysis cycle run by an agent.
    """
    __tablename__ = 'agent_learning_cycles'

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(String(50), nullable=False, index=True)
    cycle_type = Column(String(50), nullable=False, index=True)

    status = Column(String(20), nullable=False, index=True)

    started_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True))
    duration_seconds = Column(Integer)
    api_calls_used = Column(Integer, default=0)

    items_processed = Column(Integer, default=0)
    patterns_discovered = Column(Integer, default=0)
    patterns_updated = Column(Integer, default=0)
    error_message = Column(Text)

    cycle_metadata = Column(JSON)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, index=True)
