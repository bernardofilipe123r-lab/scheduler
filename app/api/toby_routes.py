"""
Toby API routes — Phase 3: AI agent content proposals.

Endpoints:
    POST /api/toby/run              — Trigger Toby to generate proposals
    GET  /api/toby/proposals        — List proposals (filterable by status)
    GET  /api/toby/proposals/{id}   — Get a single proposal
    POST /api/toby/proposals/{id}/accept  — Accept & trigger brand creation
    POST /api/toby/proposals/{id}/reject  — Reject with optional notes
    GET  /api/toby/stats            — Toby's performance stats
    GET  /api/toby/insights         — Performance insights summary
    POST /api/toby/scan             — Trigger trend scout scan
    POST /api/toby/collect-metrics  — Trigger metrics collection
"""

from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api/toby", tags=["toby"])


# ── Request / Response schemas ───────────────────────────────

class RunRequest(BaseModel):
    max_proposals: Optional[int] = None

class RejectRequest(BaseModel):
    notes: Optional[str] = None

class AcceptResponse(BaseModel):
    status: str
    proposal_id: str
    title: Optional[str] = None
    content_lines: Optional[list] = None
    image_prompt: Optional[str] = None


# ── CORE ENDPOINTS ───────────────────────────────────────────

@router.post("/run")
async def run_toby(req: RunRequest = RunRequest(), background_tasks: BackgroundTasks = None):
    """
    Trigger Toby to generate proposals.

    Toby gathers intelligence (our metrics, trending content, topic gaps),
    then generates up to max_proposals reels using 4 strategies.
    """
    from app.services.toby_agent import get_toby_agent

    agent = get_toby_agent()
    result = agent.run(max_proposals=req.max_proposals)
    return result


@router.get("/proposals")
async def list_proposals(
    status: Optional[str] = Query(None, description="Filter: pending, accepted, rejected"),
    limit: int = Query(50, ge=1, le=200),
):
    """List Toby's proposals."""
    from app.services.toby_agent import get_toby_agent

    agent = get_toby_agent()
    proposals = agent.get_proposals(status=status, limit=limit)
    return {"count": len(proposals), "proposals": proposals}


@router.get("/proposals/{proposal_id}")
async def get_proposal(proposal_id: str):
    """Get a single proposal by ID."""
    from app.db_connection import SessionLocal
    from app.models import TobyProposal

    db = SessionLocal()
    try:
        proposal = (
            db.query(TobyProposal)
            .filter(TobyProposal.proposal_id == proposal_id)
            .first()
        )
        if not proposal:
            return {"error": f"Proposal {proposal_id} not found"}
        return proposal.to_dict()
    finally:
        db.close()


@router.post("/proposals/{proposal_id}/accept")
async def accept_proposal(proposal_id: str):
    """
    Accept a proposal — marks it as accepted, records in content tracker.

    The frontend should then use the returned title/content_lines/image_prompt
    to trigger God Automation for brand version creation.
    """
    from app.services.toby_agent import get_toby_agent

    agent = get_toby_agent()
    result = agent.accept_proposal(proposal_id)
    return result


@router.post("/proposals/{proposal_id}/reject")
async def reject_proposal(proposal_id: str, req: RejectRequest = RejectRequest()):
    """Reject a proposal with optional notes."""
    from app.services.toby_agent import get_toby_agent

    agent = get_toby_agent()
    result = agent.reject_proposal(proposal_id, notes=req.notes)
    return result


# ── STATS & INSIGHTS ─────────────────────────────────────────

@router.get("/stats")
async def toby_stats():
    """Get Toby's proposal stats (total, accepted, rejected, per-strategy)."""
    from app.services.toby_agent import get_toby_agent

    agent = get_toby_agent()
    return agent.get_proposal_stats()


@router.get("/insights")
async def performance_insights(brand: Optional[str] = None):
    """Get performance insights summary across all content."""
    try:
        from app.services.metrics_collector import get_metrics_collector

        collector = get_metrics_collector()
        summary = collector.get_performance_summary(brand=brand)
        top = collector.get_top_performers("reel", limit=5, brand=brand)
        under = collector.get_underperformers("reel", limit=5, brand=brand)

        return {
            "summary": summary,
            "top_performers": top,
            "underperformers": under,
        }
    except Exception as e:
        return {"error": str(e)}


# ── SCAN & COLLECT ───────────────────────────────────────────

@router.post("/scan")
async def scan_trends():
    """
    Trigger TrendScout to scan hashtags and competitors for trending content.

    Rate limited: max 5 hashtags per scan, 30 unique per 7 days (IG API limit).
    """
    try:
        from app.services.trend_scout import get_trend_scout

        scout = get_trend_scout()
        hashtag_result = scout.scan_hashtags(max_hashtags=5)
        competitor_result = scout.scan_competitors()

        return {
            "hashtags": hashtag_result,
            "competitors": competitor_result,
        }
    except Exception as e:
        return {"error": str(e)}


@router.post("/collect-metrics")
async def collect_metrics(
    brand: Optional[str] = Query(None, description="Specific brand, or all if empty"),
    days_back: int = Query(14, ge=1, le=90),
):
    """
    Trigger MetricsCollector to fetch per-post IG metrics.

    Polls our published posts for views, likes, saves, shares, reach.
    """
    try:
        from app.services.metrics_collector import get_metrics_collector

        collector = get_metrics_collector()
        if brand:
            result = collector.collect_for_brand(brand, days_back)
            return {"results": [result]}
        else:
            results = collector.collect_all_brands(days_back)
            return {"results": results}
    except Exception as e:
        return {"error": str(e)}


@router.get("/trending")
async def get_trending(
    min_likes: int = Query(200, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    """Get trending content discovered by TrendScout."""
    try:
        from app.services.trend_scout import get_trend_scout

        scout = get_trend_scout()
        trending = scout.get_trending_for_toby(min_likes=min_likes, limit=limit)
        return {"count": len(trending), "trending": trending}
    except Exception as e:
        return {"error": str(e)}
