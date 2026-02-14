"""
AI agent models: AIAgent, AgentPerformance, AgentLearning, GenePool, TobyProposal.
"""
from datetime import datetime
from app.models.base import Base, Column, String, DateTime, Text, Boolean, Integer, JSON, Float, Index


class AIAgent(Base):
    """
    Dynamic AI agent — each agent works across ALL brands.

    Number of agents always matches number of brands.
    When a brand is created, a new agent is auto-provisioned.
    """
    __tablename__ = "ai_agents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(String(50), unique=True, nullable=False, index=True)  # e.g. "toby", "lexi", "marco"
    display_name = Column(String(100), nullable=False)  # User-defined name
    personality = Column(Text, nullable=False, default="")  # System prompt personality description
    temperature = Column(Float, nullable=False, default=0.85)  # DeepSeek temperature
    variant = Column(String(20), nullable=False, default="dark")  # dark / light / auto
    proposal_prefix = Column(String(20), nullable=False, default="AI")  # e.g. "TOBY", "LEXI", "MARCO"

    # Strategy config — JSON
    strategy_names = Column(Text, nullable=False, default='["explore","iterate","double_down","trending"]')
    strategy_weights = Column(Text, nullable=False, default='{"explore":0.30,"iterate":0.20,"double_down":0.30,"trending":0.20}')

    # Behaviour tuning
    risk_tolerance = Column(String(20), nullable=False, default="medium")  # low, medium, high
    proposals_per_brand = Column(Integer, nullable=False, default=3)
    content_types = Column(Text, nullable=False, default='["reel"]')  # ["reel"], ["post"], ["reel","post"]

    # Status
    active = Column(Boolean, nullable=False, default=True)
    is_builtin = Column(Boolean, nullable=False, default=False)  # True for Toby/Lexi (cannot delete)

    # Linked brand (the brand that caused this agent's creation)
    created_for_brand = Column(String(100), nullable=True)

    # ── Evolution tracking ──
    survival_score = Column(Float, nullable=True, default=0.0)       # 0-100 composite fitness
    lifetime_views = Column(Integer, nullable=True, default=0)       # Total views across all content
    lifetime_proposals = Column(Integer, nullable=True, default=0)   # Total proposals generated
    lifetime_accepted = Column(Integer, nullable=True, default=0)    # Total proposals accepted
    generation = Column(Integer, nullable=True, default=1)           # Evolution generation (increments on mutation)
    last_mutation_at = Column(DateTime, nullable=True)               # When DNA was last mutated
    mutation_count = Column(Integer, nullable=True, default=0)       # Total mutations applied
    parent_agent_id = Column(String(50), nullable=True)              # If spawned from another agent's DNA

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_strategies(self) -> list:
        import json
        try:
            return json.loads(self.strategy_names)
        except Exception:
            return ["explore", "iterate", "double_down", "trending"]

    def get_strategy_weights(self) -> dict:
        import json
        try:
            return json.loads(self.strategy_weights)
        except Exception:
            return {"explore": 0.30, "iterate": 0.20, "double_down": 0.30, "trending": 0.20}

    def get_content_types(self) -> list:
        import json
        try:
            return json.loads(self.content_types)
        except Exception:
            return ["reel"]

    def to_dict(self):
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "display_name": self.display_name,
            "personality": self.personality[:200] if self.personality else "",
            "temperature": self.temperature,
            "variant": self.variant,
            "proposal_prefix": self.proposal_prefix,
            "strategy_names": self.get_strategies(),
            "strategy_weights": self.get_strategy_weights(),
            "risk_tolerance": self.risk_tolerance,
            "proposals_per_brand": self.proposals_per_brand,
            "content_types": self.get_content_types(),
            "active": self.active,
            "is_builtin": self.is_builtin,
            "created_for_brand": self.created_for_brand,
            "survival_score": self.survival_score or 0.0,
            "lifetime_views": self.lifetime_views or 0,
            "lifetime_proposals": self.lifetime_proposals or 0,
            "lifetime_accepted": self.lifetime_accepted or 0,
            "generation": self.generation or 1,
            "mutation_count": self.mutation_count or 0,
            "parent_agent_id": self.parent_agent_id,
            "last_mutation_at": self.last_mutation_at.isoformat() if self.last_mutation_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class AgentPerformance(Base):
    """
    Periodic performance snapshot for an AI agent.

    Captured every feedback cycle (6h). Tracks per-agent views,
    engagement, best/worst strategies, and survival score over time.
    """
    __tablename__ = "agent_performance"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(String(50), nullable=False, index=True)  # FK to ai_agents.agent_id
    period = Column(String(20), nullable=False, default="feedback")  # "feedback" | "daily" | "weekly"

    # Content attribution
    total_proposals = Column(Integer, default=0)       # Proposals in this period
    accepted_proposals = Column(Integer, default=0)    # Accepted proposals
    published_count = Column(Integer, default=0)       # Published items with metrics

    # Performance metrics
    total_views = Column(Integer, default=0)
    avg_views = Column(Float, default=0.0)
    total_likes = Column(Integer, default=0)
    total_comments = Column(Integer, default=0)
    avg_engagement_rate = Column(Float, default=0.0)   # (likes+comments+saves) / reach

    # Strategy breakdown (JSON: {"explore": {"count": 3, "avg_views": 5000}, ...})
    strategy_breakdown = Column(JSON, nullable=True)
    best_strategy = Column(String(30), nullable=True)  # Strategy with highest avg views
    worst_strategy = Column(String(30), nullable=True)  # Strategy with lowest avg views

    # Quality
    avg_examiner_score = Column(Float, nullable=True)  # Average examiner score

    # Computed fitness
    survival_score = Column(Float, default=0.0)        # Composite score for this period

    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (
        Index("ix_agent_perf_agent_period", "agent_id", "period", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "period": self.period,
            "total_proposals": self.total_proposals,
            "accepted_proposals": self.accepted_proposals,
            "published_count": self.published_count,
            "total_views": self.total_views,
            "avg_views": self.avg_views,
            "total_likes": self.total_likes,
            "total_comments": self.total_comments,
            "avg_engagement_rate": self.avg_engagement_rate,
            "strategy_breakdown": self.strategy_breakdown,
            "best_strategy": self.best_strategy,
            "worst_strategy": self.worst_strategy,
            "avg_examiner_score": self.avg_examiner_score,
            "survival_score": self.survival_score,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AgentLearning(Base):
    """
    Records every mutation/adaptation applied to an agent's DNA.

    This is the evolution audit trail — every weight shift, temperature
    change, strategy swap, and personality tweak is logged here.
    """
    __tablename__ = "agent_learning"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(String(50), nullable=False, index=True)

    # What changed
    mutation_type = Column(String(30), nullable=False)  # "weight_shift" | "temperature" | "strategy_swap" | "personality" | "death" | "spawn"
    description = Column(Text, nullable=False)          # Human-readable description

    # Before/after snapshots (JSON)
    old_value = Column(JSON, nullable=True)  # e.g. {"explore": 0.30, "iterate": 0.25}
    new_value = Column(JSON, nullable=True)  # e.g. {"explore": 0.35, "iterate": 0.20}

    # What triggered this mutation
    trigger = Column(String(30), nullable=False, default="feedback")  # "feedback" | "weekly_evolution" | "manual" | "spawn"
    confidence = Column(Float, nullable=True)  # How confident the system was (0-1)

    # Performance at time of mutation
    survival_score_at = Column(Float, nullable=True)

    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (
        Index("ix_agent_learning_agent_time", "agent_id", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "mutation_type": self.mutation_type,
            "description": self.description,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "trigger": self.trigger,
            "confidence": self.confidence,
            "survival_score_at": self.survival_score_at,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class GenePool(Base):
    """
    DNA archive — snapshot of an agent's config saved before retirement
    or when an agent is a top performer.

    New agents have 80% chance of inheriting from the gene pool,
    20% chance of fully random DNA — preserving proven strategies
    while maintaining genetic diversity.
    """
    __tablename__ = "gene_pool"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_agent_id = Column(String(50), nullable=False, index=True)     # Origin agent
    source_agent_name = Column(String(100), nullable=False)

    # DNA snapshot
    personality = Column(Text, nullable=True)
    temperature = Column(Float, nullable=False)
    variant = Column(String(20), nullable=False)
    strategy_names = Column(Text, nullable=False)    # JSON list
    strategy_weights = Column(Text, nullable=False)  # JSON dict
    risk_tolerance = Column(String(20), nullable=False)

    # Performance at time of archiving
    survival_score = Column(Float, default=0.0)
    lifetime_views = Column(Integer, default=0)
    generation = Column(Integer, default=1)

    # Why archived
    reason = Column(String(30), nullable=False)  # "retirement" | "top_performer" | "manual"

    # Usage tracking
    times_inherited = Column(Integer, default=0)  # How many new agents inherited from this

    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    def to_dict(self):
        import json
        try:
            strats = json.loads(self.strategy_names)
        except Exception:
            strats = []
        try:
            weights = json.loads(self.strategy_weights)
        except Exception:
            weights = {}
        return {
            "id": self.id,
            "source_agent_id": self.source_agent_id,
            "source_agent_name": self.source_agent_name,
            "personality": (self.personality or "")[:200],
            "temperature": self.temperature,
            "variant": self.variant,
            "strategy_names": strats,
            "strategy_weights": weights,
            "risk_tolerance": self.risk_tolerance,
            "survival_score": self.survival_score,
            "lifetime_views": self.lifetime_views,
            "generation": self.generation,
            "reason": self.reason,
            "times_inherited": self.times_inherited,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TobyProposal(Base):
    """
    A content proposal generated by the Toby AI agent.

    Toby analyses performance data, trends, and content gaps,
    then proposes reels (and later posts) that the user can
    accept or reject.  Accepted proposals trigger God Automation
    to create versions for every brand.
    """
    __tablename__ = "toby_proposals"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Human-readable ID (e.g., "TOBY-001")
    proposal_id = Column(String(20), nullable=False, unique=True, index=True)

    # Status: pending | accepted | rejected | expired
    status = Column(String(20), default="pending", nullable=False, index=True)

    # Which agent created this proposal: "toby" or "lexi"
    agent_name = Column(String(20), default="toby", nullable=False, index=True)

    # Content type: "reel" or "post"
    content_type = Column(String(10), nullable=False, default="reel")

    # ── Brand assignment (each proposal targets ONE brand) ──
    brand = Column(String(50), nullable=True, index=True)  # e.g. "healthycollege"
    variant = Column(String(10), nullable=True)  # "dark" or "light"

    # ── Strategy that produced this proposal ──
    # explore      — new topic / angle within the niche
    # iterate      — tweak an underperformer
    # double_down  — variation of our own winner
    # trending     — adapt external viral content
    strategy = Column(String(20), nullable=False)

    # Toby's explanation of WHY he chose this
    reasoning = Column(Text, nullable=False)

    # ── Generated content ──
    title = Column(Text, nullable=False)
    content_lines = Column(JSON, nullable=True)   # List of reel text lines
    slide_texts = Column(JSON, nullable=True)      # List of carousel slide paragraphs (posts only)
    image_prompt = Column(Text, nullable=True)
    caption = Column(Text, nullable=True)

    # Topic classification (from Phase 2)
    topic_bucket = Column(String(50), nullable=True)

    # ── Source context (for iterate / double_down / trending) ──
    # What inspired this proposal
    source_type = Column(String(30), nullable=True)  # own_content | competitor | trending_hashtag
    source_ig_media_id = Column(String(100), nullable=True)
    source_title = Column(Text, nullable=True)
    source_performance_score = Column(Float, nullable=True)
    source_account = Column(String(100), nullable=True)  # IG username for competitor/trending

    # ── Quality metadata ──
    quality_score = Column(Float, nullable=True)  # Phase 2 quality gate score

    # ── Maestro Examiner scores ──
    examiner_score = Column(Float, nullable=True)         # Weighted composite (0-10)
    examiner_avatar_fit = Column(Float, nullable=True)    # Avatar relevance (0-10)
    examiner_content_quality = Column(Float, nullable=True)  # Content value (0-10)
    examiner_engagement = Column(Float, nullable=True)    # Engagement potential (0-10)
    examiner_verdict = Column(String(20), nullable=True)  # accept | reject
    examiner_reason = Column(Text, nullable=True)         # 1-2 sentence explanation
    examiner_red_flags = Column(JSON, nullable=True)      # List of detected red flags

    # ── Review metadata ──
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewer_notes = Column(Text, nullable=True)

    # What job was created when accepted (links to GenerationJob or scheduled item)
    accepted_job_id = Column(String(50), nullable=True)

    # ── Timestamps ──
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (
        Index("ix_toby_status_created", "status", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "proposal_id": self.proposal_id,
            "status": self.status,
            "agent_name": self.agent_name or "toby",
            "content_type": self.content_type,
            "brand": self.brand,
            "variant": self.variant,
            "strategy": self.strategy,
            "reasoning": self.reasoning,
            "title": self.title,
            "content_lines": self.content_lines,
            "slide_texts": self.slide_texts,
            "image_prompt": self.image_prompt,
            "caption": self.caption,
            "topic_bucket": self.topic_bucket,
            "source_type": self.source_type,
            "source_title": self.source_title,
            "source_performance_score": self.source_performance_score,
            "source_account": self.source_account,
            "quality_score": self.quality_score,
            "examiner_score": self.examiner_score,
            "examiner_scores": {
                "avatar_fit": self.examiner_avatar_fit,
                "engagement_potential": self.examiner_engagement,
                "content_quality": self.examiner_content_quality,
            } if self.examiner_score is not None else None,
            "examiner_verdict": self.examiner_verdict,
            "examiner_reason": self.examiner_reason,
            "examiner_red_flags": self.examiner_red_flags,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "accepted_job_id": self.accepted_job_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
