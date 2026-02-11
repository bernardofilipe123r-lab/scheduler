"""
AI Agents CRUD API — manage dynamic AI agents + evolution.

Endpoints:
  GET    /api/agents               — list all agents with evolution stats
  GET    /api/agents/:id           — get single agent with full details
  GET    /api/agents/:id/performance — performance history (survival scores over time)
  GET    /api/agents/:id/learnings — recent mutation/learning log
  POST   /api/agents               — create new agent
  PUT    /api/agents/:id           — update agent config
  DELETE /api/agents/:id           — deactivate agent (builtin agents cannot be deleted)
  POST   /api/agents/:id/mutate   — force DNA mutation
  POST   /api/agents/:id/clone    — duplicate agent DNA into new agent
  POST   /api/agents/:id/retire   — manual retirement (archive DNA + deactivate)
  GET    /api/agents/gene-pool    — browse archived DNA
  GET    /api/agents/evolution-events — timeline of deaths, births, mutations
  POST   /api/agents/seed          — seed builtin Toby + Lexi agents
  POST   /api/agents/refresh       — refresh agent cache
"""

import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.models import AIAgent, AgentPerformance, AgentLearning

router = APIRouter(prefix="/api/agents", tags=["ai-agents"])


# ── Schemas ──

class CreateAgentRequest(BaseModel):
    agent_name: str  # Display name (e.g. "Marco")
    personality: Optional[str] = None
    temperature: float = 0.85
    variant: str = "dark"  # dark / light
    strategies: Optional[List[str]] = None
    strategy_weights: Optional[Dict[str, float]] = None
    proposals_per_brand: int = 3
    content_types: Optional[List[str]] = None
    created_for_brand: Optional[str] = None  # Which brand triggered this


class UpdateAgentRequest(BaseModel):
    display_name: Optional[str] = None
    personality: Optional[str] = None
    temperature: Optional[float] = None
    variant: Optional[str] = None
    strategy_names: Optional[List[str]] = None
    strategy_weights: Optional[Dict[str, float]] = None
    proposals_per_brand: Optional[int] = None
    content_types: Optional[List[str]] = None
    active: Optional[bool] = None


# ── Endpoints ──

@router.get("", summary="List all AI agents with evolution stats")
def list_agents(db: Session = Depends(get_db), include_inactive: bool = Query(False)):
    q = db.query(AIAgent).order_by(desc(AIAgent.survival_score))
    if not include_inactive:
        q = q.filter(AIAgent.active == True)
    agents = q.all()

    # Compute tier labels based on ranking
    total = len(agents)
    top_cutoff = max(1, int(total * 0.4))
    mid_cutoff = max(top_cutoff + 1, int(total * 0.8))

    enriched = []
    for i, a in enumerate(agents):
        d = a.to_dict()
        if i < top_cutoff:
            d["tier"] = "thriving"
        elif i < mid_cutoff:
            d["tier"] = "surviving"
        else:
            d["tier"] = "struggling"
        # Quick 7-day stats
        week_ago = datetime.utcnow() - timedelta(days=7)
        recent_perf = (
            db.query(AgentPerformance)
            .filter(AgentPerformance.agent_id == a.agent_id, AgentPerformance.created_at >= week_ago)
            .order_by(desc(AgentPerformance.created_at))
            .first()
        )
        if recent_perf:
            d["stats_7d"] = {
                "posts": recent_perf.published_count or 0,
                "views": recent_perf.total_views or 0,
                "engagement_rate": recent_perf.avg_engagement_rate or 0,
                "best_strategy": recent_perf.best_strategy,
            }
        else:
            d["stats_7d"] = {"posts": 0, "views": 0, "engagement_rate": 0, "best_strategy": None}
        enriched.append(d)

    # Gene pool size
    try:
        from app.models import GenePool
        gene_pool_size = db.query(GenePool).count()
    except Exception:
        gene_pool_size = 0

    return {
        "agents": enriched,
        "total": len(enriched),
        "gene_pool_size": gene_pool_size,
    }


@router.get("/{agent_id}", summary="Get single agent")
def get_agent_detail(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(AIAgent).filter(AIAgent.agent_id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return agent.to_dict()


@router.post("", summary="Create new AI agent")
def create_agent(req: CreateAgentRequest, db: Session = Depends(get_db)):
    from app.services.generic_agent import create_agent_for_brand

    agent = create_agent_for_brand(
        brand_id=req.created_for_brand or "manual",
        agent_name=req.agent_name,
        personality=req.personality,
        temperature=req.temperature,
        variant=req.variant,
        strategies=req.strategies,
        strategy_weights=req.strategy_weights,
    )

    # Update extra fields if provided
    if req.proposals_per_brand != 3:
        agent_db = db.query(AIAgent).filter(AIAgent.agent_id == agent.agent_id).first()
        if agent_db:
            agent_db.proposals_per_brand = req.proposals_per_brand
            if req.content_types:
                agent_db.content_types = json.dumps(req.content_types)
            db.commit()
            db.refresh(agent_db)
            return {"created": True, "agent": agent_db.to_dict()}

    return {"created": True, "agent": agent.to_dict()}


@router.put("/{agent_id}", summary="Update agent config")
def update_agent(agent_id: str, req: UpdateAgentRequest, db: Session = Depends(get_db)):
    agent = db.query(AIAgent).filter(AIAgent.agent_id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")

    if req.display_name is not None:
        agent.display_name = req.display_name
    if req.personality is not None:
        agent.personality = req.personality
    if req.temperature is not None:
        agent.temperature = req.temperature
    if req.variant is not None:
        agent.variant = req.variant
    if req.strategy_names is not None:
        agent.strategy_names = json.dumps(req.strategy_names)
    if req.strategy_weights is not None:
        agent.strategy_weights = json.dumps(req.strategy_weights)
    if req.proposals_per_brand is not None:
        agent.proposals_per_brand = req.proposals_per_brand
    if req.content_types is not None:
        agent.content_types = json.dumps(req.content_types)
    if req.active is not None:
        agent.active = req.active

    db.commit()
    db.refresh(agent)

    # Refresh cache so running agents pick up changes
    from app.services.generic_agent import refresh_agent_cache
    refresh_agent_cache()

    return {"updated": True, "agent": agent.to_dict()}


@router.delete("/{agent_id}", summary="Deactivate agent")
def delete_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(AIAgent).filter(AIAgent.agent_id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    if agent.is_builtin:
        raise HTTPException(status_code=400, detail=f"Cannot delete builtin agent '{agent_id}'. Use PUT to deactivate instead.")

    agent.active = False
    db.commit()

    from app.services.generic_agent import refresh_agent_cache
    refresh_agent_cache()

    return {"deactivated": True, "agent_id": agent_id}


@router.post("/seed", summary="Seed builtin agents (Toby + Lexi)")
def seed_agents():
    from app.services.generic_agent import seed_builtin_agents
    seed_builtin_agents()
    return {"seeded": True}


@router.post("/refresh", summary="Refresh agent cache")
def refresh_cache():
    from app.services.generic_agent import refresh_agent_cache
    refresh_agent_cache()
    return {"refreshed": True}


# ── Evolution endpoints ──

@router.get("/{agent_id}/performance", summary="Agent performance history")
def get_agent_performance(agent_id: str, limit: int = Query(30), db: Session = Depends(get_db)):
    """Get survival score + metrics over time for charting."""
    agent = db.query(AIAgent).filter(AIAgent.agent_id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")

    snapshots = (
        db.query(AgentPerformance)
        .filter(AgentPerformance.agent_id == agent_id)
        .order_by(desc(AgentPerformance.created_at))
        .limit(limit)
        .all()
    )
    return {
        "agent_id": agent_id,
        "display_name": agent.display_name,
        "snapshots": [s.to_dict() for s in reversed(snapshots)],  # chronological
        "total": len(snapshots),
    }


@router.get("/{agent_id}/learnings", summary="Agent mutation/learning log")
def get_agent_learnings(agent_id: str, limit: int = Query(20), db: Session = Depends(get_db)):
    """Recent evolution events for this agent — mutations, births, deaths."""
    agent = db.query(AIAgent).filter(AIAgent.agent_id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")

    learnings = (
        db.query(AgentLearning)
        .filter(AgentLearning.agent_id == agent_id)
        .order_by(desc(AgentLearning.created_at))
        .limit(limit)
        .all()
    )
    return {
        "agent_id": agent_id,
        "learnings": [l.to_dict() for l in learnings],
        "total": len(learnings),
    }


@router.post("/{agent_id}/mutate", summary="Force DNA mutation")
def force_mutate(agent_id: str, db: Session = Depends(get_db)):
    """Manually re-roll an agent's DNA (random mutation)."""
    agent = db.query(AIAgent).filter(AIAgent.agent_id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")

    from app.services.generic_agent import _randomize_dna
    old_weights = agent.get_strategy_weights()
    old_temp = agent.temperature

    dna = _randomize_dna()
    agent.temperature = dna["temperature"]
    agent.variant = dna["variant"]
    agent.strategy_names = json.dumps(dna["strategies"])
    agent.strategy_weights = json.dumps(dna["strategy_weights"])
    agent.risk_tolerance = dna["risk_tolerance"]
    agent.generation = (agent.generation or 1) + 1
    agent.mutation_count = (agent.mutation_count or 0) + 1
    agent.last_mutation_at = datetime.utcnow()

    # Log the manual mutation
    db.add(AgentLearning(
        agent_id=agent_id,
        mutation_type="manual_mutation",
        description=f"Manual DNA re-roll. Old temp={old_temp}, new temp={dna['temperature']}",
        old_value={"temperature": old_temp, "weights": old_weights},
        new_value={"temperature": dna["temperature"], "weights": dna["strategy_weights"]},
        trigger="manual",
        confidence=1.0,
        survival_score_at=agent.survival_score or 0,
    ))

    db.commit()
    db.refresh(agent)

    from app.services.generic_agent import refresh_agent_cache
    refresh_agent_cache()

    return {"mutated": True, "agent": agent.to_dict()}


@router.post("/{agent_id}/clone", summary="Clone agent DNA into new agent")
def clone_agent(agent_id: str, db: Session = Depends(get_db)):
    """Duplicate a winning agent's DNA into a brand-new agent."""
    source = db.query(AIAgent).filter(AIAgent.agent_id == agent_id).first()
    if not source:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")

    from app.services.evolution_engine import pick_agent_name
    from app.services.generic_agent import create_agent_for_brand, refresh_agent_cache

    clone_name = pick_agent_name()
    clone = create_agent_for_brand(
        brand_id=source.created_for_brand or "clone",
        agent_name=clone_name,
        personality=source.personality,
        temperature=source.temperature,
        variant=source.variant,
        strategies=source.get_strategies(),
        strategy_weights=source.get_strategy_weights(),
    )

    # Set parent reference
    cloned = db.query(AIAgent).filter(AIAgent.agent_id == clone.agent_id).first()
    if cloned:
        cloned.parent_agent_id = agent_id

    # Log the clone
    db.add(AgentLearning(
        agent_id=clone.agent_id,
        mutation_type="spawn",
        description=f"Cloned from {source.display_name} ({agent_id}). Exact DNA copy.",
        old_value=None,
        new_value={"source": agent_id, "temperature": source.temperature},
        trigger="manual",
        confidence=1.0,
        survival_score_at=0.0,
    ))

    db.commit()
    refresh_agent_cache()

    return {"cloned": True, "source": source.to_dict(), "clone": clone.to_dict() if hasattr(clone, 'to_dict') else {"agent_id": clone.agent_id}}


@router.post("/{agent_id}/retire", summary="Manual retirement")
def retire_agent(agent_id: str, db: Session = Depends(get_db)):
    """Manually retire an agent — archives DNA to gene pool first."""
    agent = db.query(AIAgent).filter(AIAgent.agent_id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    if agent.is_builtin:
        raise HTTPException(status_code=400, detail=f"Cannot retire builtin agent '{agent_id}'")
    if not agent.active:
        raise HTTPException(status_code=400, detail=f"Agent '{agent_id}' is already retired")

    # Archive DNA
    try:
        from app.models import GenePool
        db.add(GenePool(
            source_agent_id=agent.agent_id,
            source_agent_name=agent.display_name,
            personality=agent.personality,
            temperature=agent.temperature,
            variant=agent.variant,
            strategy_names=agent.strategy_names,
            strategy_weights=agent.strategy_weights,
            risk_tolerance=agent.risk_tolerance,
            survival_score=agent.survival_score or 0,
            lifetime_views=agent.lifetime_views or 0,
            generation=agent.generation or 1,
            reason="manual",
        ))
    except Exception:
        pass

    agent.active = False
    db.add(AgentLearning(
        agent_id=agent_id,
        mutation_type="death",
        description="Manually retired by user.",
        old_value={"survival_score": agent.survival_score or 0},
        new_value={"active": False},
        trigger="manual",
        confidence=1.0,
        survival_score_at=agent.survival_score or 0,
    ))
    db.commit()

    from app.services.generic_agent import refresh_agent_cache
    refresh_agent_cache()

    return {"retired": True, "agent_id": agent_id, "display_name": agent.display_name}


@router.get("/gene-pool/entries", summary="Browse archived DNA in gene pool")
def get_gene_pool(limit: int = Query(50), db: Session = Depends(get_db)):
    """List all DNA entries in the gene pool."""
    try:
        from app.models import GenePool
        entries = (
            db.query(GenePool)
            .order_by(desc(GenePool.survival_score))
            .limit(limit)
            .all()
        )
        return {"entries": [e.to_dict() for e in entries], "total": len(entries)}
    except Exception as e:
        return {"entries": [], "total": 0, "error": str(e)}


@router.get("/evolution-events/timeline", summary="Evolution timeline events")
def get_evolution_events(limit: int = Query(50), db: Session = Depends(get_db)):
    """Timeline of deaths, births, mutations across all agents — for the event feed."""
    events = (
        db.query(AgentLearning)
        .order_by(desc(AgentLearning.created_at))
        .limit(limit)
        .all()
    )
    return {"events": [e.to_dict() for e in events], "total": len(events)}
