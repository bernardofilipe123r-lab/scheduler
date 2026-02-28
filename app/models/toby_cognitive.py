"""
Toby v3.0 cognitive memory models:
  - TobyEpisodicMemory
  - TobySemanticMemory
  - TobyProceduralMemory
  - TobyWorldModel
  - TobyStrategyCombos
  - TobyRawSignal
  - TobyMetaReport
  - TobyReasoningTrace
"""
from datetime import datetime, timezone
from app.models.base import Base, Column, String, DateTime, Text, Boolean, Integer, JSON, Float, Index
from pgvector.sqlalchemy import Vector


def _utc_now():
    return datetime.now(timezone.utc)


class TobyEpisodicMemory(Base):
    """Record of each content creation event — 'what happened'."""
    __tablename__ = "toby_episodic_memory"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    brand_id = Column(String(50), nullable=True)
    content_type = Column(String(10), nullable=True)

    schedule_id = Column(String(36), nullable=True)
    strategy = Column(JSON, nullable=False, default=dict)
    quality_score = Column(Float, nullable=True)
    toby_score = Column(Float, nullable=True)

    summary = Column(Text, nullable=False)
    key_facts = Column(JSON, default=list)
    tags = Column(JSON, default=list)

    temporal_context = Column(JSON, nullable=True)
    revision_count = Column(Integer, default=0)
    was_experiment = Column(Boolean, default=False)

    embedding = Column(Vector(1536), nullable=True)

    retrieval_count = Column(Integer, default=0)
    last_retrieved = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "brand_id": self.brand_id,
            "content_type": self.content_type,
            "schedule_id": self.schedule_id,
            "strategy": self.strategy,
            "quality_score": self.quality_score,
            "toby_score": self.toby_score,
            "summary": self.summary,
            "key_facts": self.key_facts,
            "tags": self.tags,
            "temporal_context": self.temporal_context,
            "revision_count": self.revision_count,
            "was_experiment": self.was_experiment,
            "retrieval_count": self.retrieval_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TobySemanticMemory(Base):
    """Generalized insights extracted from episodes — 'what it means'."""
    __tablename__ = "toby_semantic_memory"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)

    insight = Column(Text, nullable=False)
    confidence = Column(Float, default=0.5)
    tags = Column(JSON, default=list)

    source_episode_ids = Column(JSON, default=list)

    confirmed_count = Column(Integer, default=0)
    contradicted_count = Column(Integer, default=0)

    embedding = Column(Vector(1536), nullable=True)

    retrieval_count = Column(Integer, default=0)
    last_retrieved = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utc_now, onupdate=_utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "insight": self.insight,
            "confidence": self.confidence,
            "tags": self.tags,
            "confirmed_count": self.confirmed_count,
            "contradicted_count": self.contradicted_count,
            "retrieval_count": self.retrieval_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class TobyProceduralMemory(Base):
    """Concrete action rules — 'what to do'."""
    __tablename__ = "toby_procedural_memory"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    brand_id = Column(String(50), nullable=True)
    content_type = Column(String(10), nullable=True)

    rule_text = Column(Text, nullable=False)
    conditions = Column(Text, nullable=True)
    action = Column(Text, nullable=True)
    confidence = Column(Float, default=0.5)

    source_semantic_ids = Column(JSON, default=list)

    applied_count = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
    success_rate = Column(Float, nullable=True)

    is_active = Column(Boolean, default=True)

    embedding = Column(Vector(1536), nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utc_now, onupdate=_utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "brand_id": self.brand_id,
            "content_type": self.content_type,
            "rule_text": self.rule_text,
            "conditions": self.conditions,
            "action": self.action,
            "confidence": self.confidence,
            "applied_count": self.applied_count,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "success_rate": self.success_rate,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TobyWorldModel(Base):
    """Environmental signals (trends, competitors, platform)."""
    __tablename__ = "toby_world_model"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    brand_id = Column(String(50), nullable=True)

    signal_type = Column(String(30), nullable=False)
    signal_data = Column(JSON, nullable=False)
    interpretation = Column(Text, nullable=True)

    relevance_score = Column(Float, default=0.5)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    embedding = Column(Vector(1536), nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "brand_id": self.brand_id,
            "signal_type": self.signal_type,
            "signal_data": self.signal_data,
            "interpretation": self.interpretation,
            "relevance_score": self.relevance_score,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TobyStrategyCombos(Base):
    """Performance tracking of full strategy combinations."""
    __tablename__ = "toby_strategy_combos"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False)
    brand_id = Column(String(50), nullable=True)
    content_type = Column(String(10), nullable=True)

    combo_key = Column(String(500), nullable=False)
    dimensions = Column(JSON, default=dict)  # {personality, topic, hook, title_format, visual_style}

    sample_count = Column(Integer, default=0)
    total_score = Column(Float, default=0)
    avg_quality = Column(Float, default=0)
    avg_toby_score = Column(Float, default=0)
    score_variance = Column(Float, default=0)

    recent_scores = Column(JSON, default=list)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utc_now, onupdate=_utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "combo_key": self.combo_key,
            "sample_count": self.sample_count,
            "avg_quality": self.avg_quality,
            "avg_toby_score": self.avg_toby_score,
            "score_variance": self.score_variance,
            "recent_scores": self.recent_scores,
        }


class TobyRawSignal(Base):
    """Unprocessed intelligence from APIs/web."""
    __tablename__ = "toby_raw_signals"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    brand_id = Column(String(50), nullable=True)

    source = Column(String(50), nullable=False)
    signal_type = Column(String(30), nullable=False)
    raw_data = Column(JSON, nullable=False)
    processed = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), default=_utc_now, nullable=False)


class TobyMetaReport(Base):
    """Weekly meta-learning evaluation reports."""
    __tablename__ = "toby_meta_reports"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)

    exploitation_premium = Column(Float, nullable=True)
    calibration_error = Column(Float, nullable=True)
    learning_velocity = Column(Float, nullable=True)
    week_over_week = Column(Float, nullable=True)

    report_data = Column(JSON, nullable=False, default=dict)
    actions_taken = Column(JSON, default=list)

    period_start = Column(DateTime(timezone=True), nullable=True)
    period_end = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "exploitation_premium": self.exploitation_premium,
            "calibration_error": self.calibration_error,
            "learning_velocity": self.learning_velocity,
            "week_over_week": self.week_over_week,
            "report_data": self.report_data,
            "actions_taken": self.actions_taken,
            "period_start": self.period_start.isoformat() if self.period_start else None,
            "period_end": self.period_end.isoformat() if self.period_end else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TobyReasoningTrace(Base):
    """Strategist chain-of-thought transcripts."""
    __tablename__ = "toby_reasoning_traces"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    schedule_id = Column(String(36), nullable=True, index=True)

    reasoning_content = Column(Text, nullable=True)
    decision = Column(JSON, nullable=True)
    model = Column(String(50), nullable=True)
    confidence = Column(Float, nullable=True)
    thompson_override = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), default=_utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "schedule_id": self.schedule_id,
            "reasoning_content": self.reasoning_content[:500] if self.reasoning_content else None,
            "decision": self.decision,
            "model": self.model,
            "confidence": self.confidence,
            "thompson_override": self.thompson_override,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ContentDNARecommendation(Base):
    """Phase 3: Toby-generated suggestions for Content DNA refinements."""
    __tablename__ = "content_dna_recommendations"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    brand_id = Column(String(50), nullable=True)

    recommendation_type = Column(String(50), nullable=False)  # topic_priority, tone_shift, audience_expansion
    dimension = Column(String(30), nullable=True)  # personality, topic, hook, etc.
    current_value = Column(Text, nullable=True)
    suggested_value = Column(Text, nullable=True)
    evidence = Column(JSON, default=dict)  # Supporting data (scores, samples, rationale)
    confidence = Column(Float, default=0)

    status = Column(String(20), default="pending")  # pending, accepted, dismissed
    created_at = Column(DateTime(timezone=True), default=_utc_now, nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "brand_id": self.brand_id,
            "recommendation_type": self.recommendation_type,
            "dimension": self.dimension,
            "current_value": self.current_value,
            "suggested_value": self.suggested_value,
            "evidence": self.evidence,
            "confidence": self.confidence,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }
