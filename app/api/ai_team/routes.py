"""
AI Team API routes — agent status, quotas, patterns, competitors, learning cycles.

Endpoints:
    GET  /api/ai-team/agents/status       — Real-time status for all agents
    GET  /api/ai-team/quotas              — API quota usage for all services
    GET  /api/ai-team/patterns            — Active learned patterns
    GET  /api/ai-team/competitors         — List competitor accounts
    POST /api/ai-team/competitors         — Add competitor account
    DELETE /api/ai-team/competitors/{id}  — Remove competitor account
    GET  /api/ai-team/learning-cycles     — Recent learning cycle history
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.models import AIAgent, AgentLearningCycle, APIQuotaUsage, CompetitorAccount
from app.api.auth.middleware import get_current_user

router = APIRouter(prefix="/api/ai-team", tags=["ai-team"])


# ── AGENT STATUS ──────────────────────────────────────────────

@router.get("/agents/status")
async def get_agents_status(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Get real-time status for all agents."""
    # 1. Fetch all active agents in one query
    agents = db.query(AIAgent).filter(AIAgent.active == True).all()
    if not agents:
        return []

    agent_ids = [a.agent_id for a in agents]

    # 2. Batch fetch all running cycles (one query)
    running_cycles = db.query(AgentLearningCycle).filter(
        AgentLearningCycle.agent_id.in_(agent_ids),
        AgentLearningCycle.status == 'running'
    ).all()
    running_map = {}
    for c in running_cycles:
        prev = running_map.get(c.agent_id)
        if not prev or (c.started_at and prev.started_at and c.started_at > prev.started_at):
            running_map[c.agent_id] = c

    # 3. Batch fetch last completed cycle per agent (one query with subquery)
    latest_sq = db.query(
        AgentLearningCycle.agent_id,
        func.max(AgentLearningCycle.completed_at).label('max_completed')
    ).filter(
        AgentLearningCycle.agent_id.in_(agent_ids),
        AgentLearningCycle.status == 'completed'
    ).group_by(AgentLearningCycle.agent_id).subquery()

    last_cycles = db.query(AgentLearningCycle).join(
        latest_sq,
        (AgentLearningCycle.agent_id == latest_sq.c.agent_id) &
        (AgentLearningCycle.completed_at == latest_sq.c.max_completed)
    ).all()
    last_cycle_map = {c.agent_id: c for c in last_cycles}

    # 4. Fetch API usage once (same row for all agents)
    current_hour = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    meta_usage = db.query(APIQuotaUsage).filter(
        APIQuotaUsage.service == 'meta',
        APIQuotaUsage.hour_window == current_hour
    ).first()

    status_map = {
        'own_brand_analysis': 'analyzing',
        'competitor_scrape': 'scraping',
        'content_generation': 'generating',
    }

    result = []
    for agent in agents:
        current_cycle = running_map.get(agent.agent_id)
        last_cycle = last_cycle_map.get(agent.agent_id)

        agent_calls = 0
        if meta_usage and meta_usage.agent_breakdown:
            agent_calls = meta_usage.agent_breakdown.get(agent.agent_id, 0)

        current_status = 'idle'
        learning_progress = None
        if current_cycle:
            current_status = status_map.get(current_cycle.cycle_type, 'working')
            if current_cycle.cycle_metadata:
                learning_progress = {
                    'current': current_cycle.cycle_metadata.get('current', 0),
                    'total': current_cycle.cycle_metadata.get('total', 100)
                }

        last_activity = None
        if last_cycle:
            action_map = {
                'own_brand_analysis': f"Analyzed {last_cycle.items_processed} reels",
                'competitor_scrape': f"Scraped {last_cycle.items_processed} posts",
                'content_generation': "Generated reel",
            }
            last_activity = {
                'action': action_map.get(last_cycle.cycle_type, last_cycle.cycle_type),
                'timestamp': last_cycle.completed_at.isoformat() if last_cycle.completed_at else None,
                'duration_seconds': last_cycle.duration_seconds
            }

        result.append({
            'agent_id': agent.agent_id,
            'display_name': agent.display_name,
            'current_status': current_status,
            'learning_progress': learning_progress,
            'api_calls_this_hour': agent_calls,
            'last_activity': last_activity,
            'survival_score': agent.survival_score,
            'generation': agent.generation
        })

    return result


# ── QUOTAS ────────────────────────────────────────────────────

@router.get("/quotas")
async def get_api_quotas(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Get API quota usage for all services."""
    from app.services.api_quota_manager import APIQuotaManager

    manager = APIQuotaManager(db)

    # Meta uses hourly limits
    hourly = manager.get_usage_summary()
    meta_info = hourly.get('meta', {})

    # deAPI and DeepSeek use daily limits
    daily = manager.get_daily_summary()

    deepseek_used = daily.get('deepseek', {}).get('used', 0)
    cost_estimate = round(deepseek_used * 0.002, 2)

    return {
        'quotas': {
            'meta': {
                'used': meta_info.get('used', 0),
                'limit': meta_info.get('limit', 150),
                'remaining': meta_info.get('remaining', 150),
                'period': 'hourly',
            },
            'deapi': {
                'used': daily.get('deapi', {}).get('used', 0),
                'limit': daily.get('deapi', {}).get('limit', 500),
                'remaining': daily.get('deapi', {}).get('remaining', 500),
                'period': 'daily',
            },
            'deepseek': {
                'used': deepseek_used,
                'limit': daily.get('deepseek', {}).get('limit', 1000),
                'remaining': daily.get('deepseek', {}).get('remaining', 1000),
                'period': 'daily',
            },
        },
        'cost_estimate': {'today_usd': cost_estimate},
        'history': manager.get_history(hours=24),
    }


# ── PATTERNS ──────────────────────────────────────────────────

@router.get("/patterns")
async def get_learned_patterns(
    pattern_type: Optional[str] = Query(None),
    min_confidence: float = Query(0.3, ge=0.0, le=1.0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get active learned patterns."""
    from app.services.agent_learning_engine import AgentLearningEngine

    engine = AgentLearningEngine(db)
    patterns = engine.get_active_patterns(pattern_type, min_confidence, limit)

    return [
        {
            'id': p.id,
            'pattern_type': p.pattern_type,
            'pattern_data': p.pattern_data,
            'confidence_score': p.confidence_score,
            'views_avg': p.views_avg,
            'sample_size': p.sample_size,
            'decay_weight': p.decay_weight,
            'learned_from_brands': p.learned_from_brands,
            'last_validated_at': p.last_validated_at.isoformat() if p.last_validated_at else None,
            'validation_count': p.validation_count
        }
        for p in patterns
    ]


# ── COMPETITORS ───────────────────────────────────────────────

@router.get("/competitors")
async def get_competitors(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Get all competitor accounts."""
    user_id = user.get("id")

    competitors = db.query(CompetitorAccount).filter(
        CompetitorAccount.user_id == user_id
    ).order_by(CompetitorAccount.priority).all()

    return [
        {
            'id': c.id,
            'instagram_handle': c.instagram_handle,
            'brand_id': c.brand_id,
            'account_type': c.account_type,
            'priority': c.priority,
            'active': c.active,
            'last_scraped_at': c.last_scraped_at.isoformat() if c.last_scraped_at else None,
            'posts_scraped_count': c.posts_scraped_count,
            'avg_views': c.avg_views,
            'notes': c.notes,
            'created_at': c.created_at.isoformat() if c.created_at else None
        }
        for c in competitors
    ]


@router.post("/competitors")
async def add_competitor(
    request: dict,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Add a competitor account to scrape."""
    handle = (request.get('instagram_handle') or '').strip()
    brand_id = request.get('brand_id')
    notes = request.get('notes', '')

    if not handle:
        raise HTTPException(status_code=400, detail="instagram_handle is required")

    # Normalize handle
    handle = handle.lstrip('@')

    user_id = user.get("id")

    # Check duplicate
    existing = db.query(CompetitorAccount).filter(
        CompetitorAccount.user_id == user_id,
        CompetitorAccount.instagram_handle == handle
    ).first()

    if existing:
        raise HTTPException(status_code=409, detail="Account already added")

    competitor = CompetitorAccount(
        user_id=user_id,
        brand_id=brand_id,
        instagram_handle=handle,
        priority=5,
        active=True,
        added_by='user',
        notes=notes
    )
    db.add(competitor)
    db.commit()
    db.refresh(competitor)

    return {'id': competitor.id, 'instagram_handle': handle}


@router.delete("/competitors/{competitor_id}")
async def remove_competitor(
    competitor_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Remove a competitor account."""
    user_id = user.get("id")

    competitor = db.query(CompetitorAccount).filter(
        CompetitorAccount.id == competitor_id,
        CompetitorAccount.user_id == user_id
    ).first()

    if not competitor:
        raise HTTPException(status_code=404, detail="Competitor not found")

    db.delete(competitor)
    db.commit()

    return {'success': True}


# ── LEARNING CYCLES ──────────────────────────────────────────

@router.get("/learning-cycles")
async def get_learning_cycles(
    agent_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get recent learning cycle audit trail."""
    query = db.query(AgentLearningCycle).order_by(AgentLearningCycle.created_at.desc())

    if agent_id:
        query = query.filter(AgentLearningCycle.agent_id == agent_id)

    cycles = query.limit(limit).all()

    return [
        {
            'id': c.id,
            'agent_id': c.agent_id,
            'cycle_type': c.cycle_type,
            'status': c.status,
            'started_at': c.started_at.isoformat() if c.started_at else None,
            'completed_at': c.completed_at.isoformat() if c.completed_at else None,
            'duration_seconds': c.duration_seconds,
            'api_calls_used': c.api_calls_used,
            'items_processed': c.items_processed,
            'patterns_discovered': c.patterns_discovered,
            'error_message': c.error_message,
        }
        for c in cycles
    ]
