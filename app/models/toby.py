"""
Toby models: TobyState, TobyExperiment, TobyStrategyScore,
TobyActivityLog, TobyContentTag.
"""
from datetime import datetime
from app.models.base import Base, Column, String, DateTime, Text, Boolean, Integer, JSON, Float, Index


class TobyState(Base):
    """Per-user Toby configuration and state."""
    __tablename__ = "toby_state"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False, unique=True, index=True)

    # ON/OFF
    enabled = Column(Boolean, nullable=False, default=False)
    enabled_at = Column(DateTime(timezone=True), nullable=True)
    disabled_at = Column(DateTime(timezone=True), nullable=True)

    # Phase: bootstrap | learning | optimizing
    phase = Column(String(20), nullable=False, default="bootstrap")
    phase_started_at = Column(DateTime(timezone=True), nullable=True)

    # Configuration
    buffer_days = Column(Integer, default=2)
    explore_ratio = Column(Float, default=0.30)
    reel_slots_per_day = Column(Integer, default=6)
    post_slots_per_day = Column(Integer, default=2)

    # Scheduling state
    last_buffer_check_at = Column(DateTime(timezone=True), nullable=True)
    last_metrics_check_at = Column(DateTime(timezone=True), nullable=True)
    last_analysis_at = Column(DateTime(timezone=True), nullable=True)
    last_discovery_at = Column(DateTime(timezone=True), nullable=True)

    # Future: spending limits
    daily_budget_cents = Column(Integer, nullable=True)
    spent_today_cents = Column(Integer, default=0)
    budget_reset_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "enabled": self.enabled,
            "enabled_at": self.enabled_at.isoformat() if self.enabled_at else None,
            "disabled_at": self.disabled_at.isoformat() if self.disabled_at else None,
            "phase": self.phase,
            "phase_started_at": self.phase_started_at.isoformat() if self.phase_started_at else None,
            "buffer_days": self.buffer_days,
            "explore_ratio": self.explore_ratio,
            "reel_slots_per_day": self.reel_slots_per_day,
            "post_slots_per_day": self.post_slots_per_day,
            "last_buffer_check_at": self.last_buffer_check_at.isoformat() if self.last_buffer_check_at else None,
            "last_metrics_check_at": self.last_metrics_check_at.isoformat() if self.last_metrics_check_at else None,
            "last_analysis_at": self.last_analysis_at.isoformat() if self.last_analysis_at else None,
            "last_discovery_at": self.last_discovery_at.isoformat() if self.last_discovery_at else None,
            "daily_budget_cents": self.daily_budget_cents,
            "spent_today_cents": self.spent_today_cents,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class TobyExperiment(Base):
    """A/B test definitions and results."""
    __tablename__ = "toby_experiments"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)

    content_type = Column(String(10), nullable=False)  # reel | post
    dimension = Column(String(30), nullable=False)      # personality, topic, hook, etc.
    options = Column(JSON, nullable=False)               # ["educational", "provocative", ...]
    results = Column(JSON, nullable=False, default=dict) # {option: {count, total_score, ...}}

    status = Column(String(20), nullable=False, default="active")  # active | paused | completed
    winner = Column(String(100), nullable=True)

    started_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    min_samples = Column(Integer, default=5)

    __table_args__ = (
        Index("ix_toby_exp_user_status", "user_id", "status"),
        {"extend_existing": True},
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "content_type": self.content_type,
            "dimension": self.dimension,
            "options": self.options,
            "results": self.results,
            "status": self.status,
            "winner": self.winner,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "min_samples": self.min_samples,
        }


class TobyStrategyScore(Base):
    """Performance aggregates per strategy option (Thompson Sampling params)."""
    __tablename__ = "toby_strategy_scores"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False)
    brand_id = Column(String(50), nullable=True)  # NULL = cross-brand
    content_type = Column(String(10), nullable=False)

    dimension = Column(String(30), nullable=False)
    option_value = Column(String(100), nullable=False)

    sample_count = Column(Integer, default=0)
    total_score = Column(Float, default=0)
    avg_score = Column(Float, default=0)
    score_variance = Column(Float, default=0)
    best_score = Column(Float, default=0)
    worst_score = Column(Float, default=100)

    recent_scores = Column(JSON, default=list)

    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_toby_strategy_user_dim", "user_id", "content_type", "dimension"),
        {"extend_existing": True},
    )

    def to_dict(self):
        return {
            "id": self.id,
            "brand_id": self.brand_id,
            "content_type": self.content_type,
            "dimension": self.dimension,
            "option_value": self.option_value,
            "sample_count": self.sample_count,
            "avg_score": self.avg_score,
            "score_variance": self.score_variance,
            "best_score": self.best_score,
            "worst_score": self.worst_score,
            "recent_scores": self.recent_scores,
        }


class TobyActivityLog(Base):
    """Audit trail of all Toby actions."""
    __tablename__ = "toby_activity_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(100), nullable=False, index=True)

    action_type = Column(String(30), nullable=False)
    description = Column(Text, nullable=False)
    action_metadata = Column("metadata", JSON, nullable=True)
    level = Column(String(10), default="info")

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_toby_activity_user_time", "user_id", "created_at"),
        {"extend_existing": True},
    )

    def to_dict(self):
        return {
            "id": self.id,
            "action_type": self.action_type,
            "description": self.description,
            "metadata": self.action_metadata,
            "level": self.level,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TobyContentTag(Base):
    """Links Toby strategy metadata to scheduled content."""
    __tablename__ = "toby_content_tags"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    schedule_id = Column(String(36), nullable=False, index=True)

    content_type = Column(String(10), nullable=False)
    personality = Column(String(50), nullable=True)
    topic_bucket = Column(String(50), nullable=True)
    hook_strategy = Column(String(50), nullable=True)
    title_format = Column(String(50), nullable=True)
    visual_style = Column(String(50), nullable=True)

    experiment_id = Column(String(36), nullable=True, index=True)
    is_experiment = Column(Boolean, default=False)
    is_control = Column(Boolean, default=False)

    toby_score = Column(Float, nullable=True)
    scored_at = Column(DateTime(timezone=True), nullable=True)
    score_phase = Column(String(10), nullable=True)  # "48h" | "7d"

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "schedule_id": self.schedule_id,
            "content_type": self.content_type,
            "personality": self.personality,
            "topic_bucket": self.topic_bucket,
            "hook_strategy": self.hook_strategy,
            "title_format": self.title_format,
            "visual_style": self.visual_style,
            "experiment_id": self.experiment_id,
            "is_experiment": self.is_experiment,
            "is_control": self.is_control,
            "toby_score": self.toby_score,
            "scored_at": self.scored_at.isoformat() if self.scored_at else None,
            "score_phase": self.score_phase,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
