"""
AI Agents CRUD API — manage dynamic AI agents.

Endpoints:
  GET    /api/agents          — list all agents
  GET    /api/agents/:id      — get single agent
  POST   /api/agents          — create new agent
  PUT    /api/agents/:id      — update agent config
  DELETE /api/agents/:id      — deactivate agent (builtin agents cannot be deleted)
  POST   /api/agents/seed     — seed builtin Toby + Lexi agents
  POST   /api/agents/refresh  — refresh agent cache
"""

import json
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.models import AIAgent

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

@router.get("", summary="List all AI agents")
def list_agents(db: Session = Depends(get_db), include_inactive: bool = Query(False)):
    q = db.query(AIAgent).order_by(AIAgent.id)
    if not include_inactive:
        q = q.filter(AIAgent.active == True)
    agents = q.all()
    return {"agents": [a.to_dict() for a in agents], "total": len(agents)}


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
