"""
Toby API routes — Phase 3: Autonomous AI agent.

Toby runs autonomously in the background. User can only:
  - View his status (running/paused, activity log)
  - Pause / Resume him
  - Review proposals (accept/reject)
  - View insights & trending

Endpoints:
    GET  /api/toby/status             — Daemon status (running, uptime, activity)
    POST /api/toby/pause              — Pause Toby
    POST /api/toby/resume             — Resume Toby
    GET  /api/toby/proposals          — List proposals (filterable by status)
    GET  /api/toby/proposals/{id}     — Get a single proposal
    POST /api/toby/proposals/{id}/accept  — Accept & trigger brand creation
    POST /api/toby/proposals/{id}/reject  — Reject with optional notes
    GET  /api/toby/stats              — Toby's performance stats
    GET  /api/toby/insights           — Performance insights summary
    GET  /api/toby/trending           — Trending content discovered by scout
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query, Depends
from pydantic import BaseModel
from sqlalchemy import desc, func

from app.db_connection import SessionLocal
from app.models import TobyProposal
from app.api.auth_middleware import get_current_user

router = APIRouter(prefix="/api/toby", tags=["toby"])


# ── Request / Response schemas ───────────────────────────────

class RejectRequest(BaseModel):
    notes: Optional[str] = None

class AcceptResponse(BaseModel):
    status: str
    proposal_id: str
    title: Optional[str] = None
    content_lines: Optional[list] = None
    image_prompt: Optional[str] = None


# ── DAEMON CONTROL ────────────────────────────────────────────

@router.get("/status")
async def toby_status(user: dict = Depends(get_current_user)):
    """
    Get Toby's status and proposal stats.
    Daemon is legacy — returns a simple status response.
    """
    status = {
        "running": False,
        "paused": True,
        "message": "Toby daemon is legacy. Proposals are managed via Maestro.",
    }

    # Proposal stats inline
    db = SessionLocal()
    try:
        total = db.query(func.count(TobyProposal.id)).filter(TobyProposal.user_id == user["id"]).scalar() or 0
        pending = db.query(func.count(TobyProposal.id)).filter(TobyProposal.status == "pending", TobyProposal.user_id == user["id"]).scalar() or 0
        accepted = db.query(func.count(TobyProposal.id)).filter(TobyProposal.status == "accepted", TobyProposal.user_id == user["id"]).scalar() or 0
        rejected = db.query(func.count(TobyProposal.id)).filter(TobyProposal.status == "rejected", TobyProposal.user_id == user["id"]).scalar() or 0

        strategy_counts = (
            db.query(TobyProposal.strategy, func.count(TobyProposal.id))
            .filter(TobyProposal.user_id == user["id"])
            .group_by(TobyProposal.strategy)
            .all()
        )
        strategy_acceptance = {}
        for strategy, count in strategy_counts:
            strat_accepted = (
                db.query(func.count(TobyProposal.id))
                .filter(TobyProposal.strategy == strategy, TobyProposal.status == "accepted", TobyProposal.user_id == user["id"])
                .scalar() or 0
            )
            strategy_acceptance[strategy] = {
                "total": count,
                "accepted": strat_accepted,
                "rate": round(strat_accepted / count * 100, 1) if count > 0 else 0,
            }

        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_count = (
            db.query(func.count(TobyProposal.id))
            .filter(TobyProposal.agent_name == "toby")
            .filter(TobyProposal.created_at >= today_start)
            .scalar() or 0
        )

        stats = {
            "total": total,
            "today": today_count,
            "daily_limit": 15,
            "pending": pending,
            "accepted": accepted,
            "rejected": rejected,
            "acceptance_rate": round(accepted / total * 100, 1) if total > 0 else 0,
            "strategies": strategy_acceptance,
        }
    except Exception as e:
        stats = {"error": str(e)}
    finally:
        db.close()

    return {**status, "proposal_stats": stats}


@router.post("/pause")
async def pause_toby(user: dict = Depends(get_current_user)):
    """Pause Toby — legacy endpoint, daemon no longer runs."""
    return {"status": "paused", "message": "Toby daemon is legacy. No action taken."}


@router.post("/resume")
async def resume_toby(user: dict = Depends(get_current_user)):
    """Resume Toby — legacy endpoint, daemon no longer runs."""
    return {"status": "resumed", "message": "Toby daemon is legacy. No action taken."}


# ── PROPOSALS ─────────────────────────────────────────────────

@router.get("/proposals")
async def list_proposals(
    status: Optional[str] = Query(None, description="Filter: pending, accepted, rejected"),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    """List Toby's proposals."""
    db = SessionLocal()
    try:
        query = db.query(TobyProposal).filter(TobyProposal.user_id == user["id"])
        if status:
            query = query.filter(TobyProposal.status == status)

        proposals = (
            query
            .order_by(desc(TobyProposal.created_at))
            .limit(limit)
            .all()
        )
        result = [p.to_dict() for p in proposals]
        return {"count": len(result), "proposals": result}
    finally:
        db.close()


@router.get("/proposals/{proposal_id}")
async def get_proposal(proposal_id: str, user: dict = Depends(get_current_user)):
    """Get a single proposal by ID."""
    from app.db_connection import SessionLocal
    from app.models import TobyProposal

    db = SessionLocal()
    try:
        proposal = (
            db.query(TobyProposal)
            .filter(TobyProposal.proposal_id == proposal_id, TobyProposal.user_id == user["id"])
            .first()
        )
        if not proposal:
            return {"error": f"Proposal {proposal_id} not found"}
        return proposal.to_dict()
    finally:
        db.close()


@router.post("/proposals/{proposal_id}/accept")
async def accept_proposal(proposal_id: str, user: dict = Depends(get_current_user)):
    """
    Accept a proposal — marks it as accepted, records in content tracker.

    The frontend should then use the returned title/content_lines/image_prompt
    to trigger God Automation for brand version creation.
    """
    db = SessionLocal()
    try:
        proposal = (
            db.query(TobyProposal)
            .filter(TobyProposal.proposal_id == proposal_id, TobyProposal.user_id == user["id"])
            .first()
        )
        if not proposal:
            return {"error": f"Proposal {proposal_id} not found"}

        if proposal.status != "pending":
            return {"error": f"Proposal {proposal_id} is already {proposal.status}"}

        proposal.status = "accepted"
        proposal.reviewed_at = datetime.utcnow()
        db.commit()

        # Record in content tracker
        from app.services.content_tracker import ContentTracker
        tracker = ContentTracker()
        tracker.record(
            title=proposal.title,
            content_type=proposal.content_type,
            quality_score=proposal.quality_score,
        )

        return {
            "status": "accepted",
            "proposal_id": proposal_id,
            "title": proposal.title,
            "content_lines": proposal.content_lines,
            "slide_texts": proposal.slide_texts,
            "image_prompt": proposal.image_prompt,
            "caption": proposal.caption,
            "content_type": proposal.content_type,
            "strategy": proposal.strategy,
        }
    except Exception as e:
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()


@router.post("/proposals/{proposal_id}/reject")
async def reject_proposal(proposal_id: str, req: RejectRequest = RejectRequest(), user: dict = Depends(get_current_user)):
    """Reject a proposal with optional notes."""
    db = SessionLocal()
    try:
        proposal = (
            db.query(TobyProposal)
            .filter(TobyProposal.proposal_id == proposal_id, TobyProposal.user_id == user["id"])
            .first()
        )
        if not proposal:
            return {"error": f"Proposal {proposal_id} not found"}

        proposal.status = "rejected"
        proposal.reviewed_at = datetime.utcnow()
        if req.notes:
            proposal.reviewer_notes = req.notes
        db.commit()

        return {"status": "rejected", "proposal_id": proposal_id}
    except Exception as e:
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()


# ── STATS & INSIGHTS ─────────────────────────────────────────

@router.get("/stats")
async def toby_stats(user: dict = Depends(get_current_user)):
    """Get Toby's proposal stats (total, accepted, rejected, per-strategy)."""
    db = SessionLocal()
    try:
        total = db.query(func.count(TobyProposal.id)).filter(TobyProposal.user_id == user["id"]).scalar() or 0
        pending = db.query(func.count(TobyProposal.id)).filter(TobyProposal.status == "pending", TobyProposal.user_id == user["id"]).scalar() or 0
        accepted = db.query(func.count(TobyProposal.id)).filter(TobyProposal.status == "accepted", TobyProposal.user_id == user["id"]).scalar() or 0
        rejected = db.query(func.count(TobyProposal.id)).filter(TobyProposal.status == "rejected", TobyProposal.user_id == user["id"]).scalar() or 0

        strategy_counts = (
            db.query(TobyProposal.strategy, func.count(TobyProposal.id))
            .filter(TobyProposal.user_id == user["id"])
            .group_by(TobyProposal.strategy)
            .all()
        )
        strategy_acceptance = {}
        for strategy, count in strategy_counts:
            strat_accepted = (
                db.query(func.count(TobyProposal.id))
                .filter(TobyProposal.strategy == strategy, TobyProposal.status == "accepted", TobyProposal.user_id == user["id"])
                .scalar() or 0
            )
            strategy_acceptance[strategy] = {
                "total": count,
                "accepted": strat_accepted,
                "rate": round(strat_accepted / count * 100, 1) if count > 0 else 0,
            }

        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_count = (
            db.query(func.count(TobyProposal.id))
            .filter(TobyProposal.agent_name == "toby")
            .filter(TobyProposal.created_at >= today_start)
            .scalar() or 0
        )

        return {
            "total": total,
            "today": today_count,
            "daily_limit": 15,
            "pending": pending,
            "accepted": accepted,
            "rejected": rejected,
            "acceptance_rate": round(accepted / total * 100, 1) if total > 0 else 0,
            "strategies": strategy_acceptance,
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@router.get("/insights")
async def performance_insights(brand: Optional[str] = None, user: dict = Depends(get_current_user)):
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


@router.get("/trending")
async def get_trending(
    min_likes: int = Query(200, ge=0),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    """Get trending content discovered by TrendScout."""
    try:
        from app.services.trend_scout import get_trend_scout

        scout = get_trend_scout()
        trending = scout.get_trending_for_toby(min_likes=min_likes, limit=limit)
        return {"count": len(trending), "trending": trending}
    except Exception as e:
        return {"error": str(e)}
