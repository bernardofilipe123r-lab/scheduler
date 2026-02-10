"""
Maestro API routes — Multi-agent orchestrator.

Maestro manages Toby (Explorer) and Lexi (Optimizer).
No pause/resume — Maestro is ALWAYS running.

Endpoints:
    GET  /api/maestro/status                     — Orchestrator status (both agents)
    GET  /api/maestro/proposals                   — List proposals (filterable by agent, status)
    GET  /api/maestro/proposals/{id}              — Get a single proposal
    POST /api/maestro/proposals/{id}/accept        — Accept & trigger brand creation
    POST /api/maestro/proposals/{id}/reject        — Reject with optional notes
    GET  /api/maestro/stats                        — Stats per agent + global
    GET  /api/maestro/insights                     — Performance insights
    GET  /api/maestro/trending                     — Trending content
"""

from typing import Optional
from fastapi import APIRouter, Query, BackgroundTasks
from pydantic import BaseModel

router = APIRouter(prefix="/api/maestro", tags=["maestro"])


class RejectRequest(BaseModel):
    notes: Optional[str] = None


# ── ORCHESTRATOR STATUS ───────────────────────────────────────

@router.get("/status")
async def maestro_status():
    """
    Full Maestro status — always running, both agents, unified activity log.
    """
    from app.services.maestro import get_maestro

    maestro = get_maestro()
    status = maestro.get_status()

    # Include proposal stats (global + per-agent)
    from app.db_connection import SessionLocal
    from app.models import TobyProposal
    from sqlalchemy import func
    from datetime import datetime

    db = SessionLocal()
    try:
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

        # Global stats
        total = db.query(TobyProposal).count()
        pending = db.query(TobyProposal).filter(TobyProposal.status == "pending").count()
        accepted = db.query(TobyProposal).filter(TobyProposal.status == "accepted").count()
        rejected = db.query(TobyProposal).filter(TobyProposal.status == "rejected").count()

        # Per-agent stats
        agent_stats = {}
        for agent_name in ["toby", "lexi"]:
            a_total = db.query(TobyProposal).filter(TobyProposal.agent_name == agent_name).count()
            a_pending = db.query(TobyProposal).filter(
                TobyProposal.agent_name == agent_name, TobyProposal.status == "pending"
            ).count()
            a_accepted = db.query(TobyProposal).filter(
                TobyProposal.agent_name == agent_name, TobyProposal.status == "accepted"
            ).count()
            a_rejected = db.query(TobyProposal).filter(
                TobyProposal.agent_name == agent_name, TobyProposal.status == "rejected"
            ).count()
            a_today = db.query(TobyProposal).filter(
                TobyProposal.agent_name == agent_name, TobyProposal.created_at >= today
            ).count()

            agent_stats[agent_name] = {
                "total": a_total,
                "pending": a_pending,
                "accepted": a_accepted,
                "rejected": a_rejected,
                "today": a_today,
                "acceptance_rate": round(a_accepted / a_total * 100, 1) if a_total > 0 else 0,
            }

        status["proposal_stats"] = {
            "total": total,
            "pending": pending,
            "accepted": accepted,
            "rejected": rejected,
            "agents": agent_stats,
        }
    finally:
        db.close()

    return status


# ── PROPOSALS ─────────────────────────────────────────────────

@router.get("/proposals")
async def list_proposals(
    status: Optional[str] = Query(None, description="Filter: pending, accepted, rejected"),
    agent: Optional[str] = Query(None, description="Filter: toby, lexi"),
    content_type: Optional[str] = Query(None, description="Filter: reel, post"),
    limit: int = Query(50, ge=1, le=200),
):
    """List proposals from all agents, with optional filters."""
    from app.db_connection import SessionLocal
    from app.models import TobyProposal

    db = SessionLocal()
    try:
        q = db.query(TobyProposal)

        if status:
            q = q.filter(TobyProposal.status == status)
        if agent:
            q = q.filter(TobyProposal.agent_name == agent)
        if content_type:
            q = q.filter(TobyProposal.content_type == content_type)

        proposals = q.order_by(TobyProposal.created_at.desc()).limit(limit).all()
        return {
            "count": len(proposals),
            "proposals": [p.to_dict() for p in proposals],
        }
    finally:
        db.close()


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
async def accept_proposal(proposal_id: str, background_tasks: BackgroundTasks):
    """
    Accept a proposal — creates a generation job for ALL brands and processes in background.

    Flow:
      1. Mark proposal as accepted
      2. Create a GenerationJob with all 5 brands
      3. Fire background processing (same as /jobs/create)
      4. Store job_id on the proposal
      5. Return job_id so frontend can navigate to the job page
    """
    from app.db_connection import SessionLocal, get_db_session
    from app.models import TobyProposal
    from app.services.job_manager import JobManager
    from datetime import datetime

    ALL_BRANDS = [
        "healthycollege", "vitalitycollege", "longevitycollege",
        "holisticcollege", "wellbeingcollege",
    ]

    db = SessionLocal()
    try:
        proposal = (
            db.query(TobyProposal)
            .filter(TobyProposal.proposal_id == proposal_id)
            .first()
        )
        if not proposal:
            return {"error": f"Proposal {proposal_id} not found"}

        if proposal.status != "pending":
            return {"error": f"Proposal {proposal_id} is already {proposal.status}"}

        # Determine variant based on content_type
        is_post = proposal.content_type == "post"
        variant = "post" if is_post else "dark"

        # Mark accepted
        proposal.status = "accepted"
        proposal.reviewed_at = datetime.utcnow()
        db.commit()

        # Record in content tracker
        try:
            from app.services.toby_agent import get_toby_agent
            agent = get_toby_agent()
            agent.tracker.record(
                title=proposal.title,
                content_type=proposal.content_type,
                quality_score=proposal.quality_score,
            )
        except Exception:
            pass  # Non-critical

    finally:
        db.close()

    # Create generation job
    with get_db_session() as job_db:
        manager = JobManager(job_db)
        job = manager.create_job(
            user_id=proposal_id,  # Track which proposal created this job
            title=proposal.title,
            content_lines=proposal.content_lines or [],
            brands=ALL_BRANDS,
            variant=variant,
            ai_prompt=proposal.image_prompt,
            cta_type="follow_tips",
            platforms=["instagram", "facebook", "youtube"],
        )
        job_id = job.job_id

    # Store job_id on proposal
    db2 = SessionLocal()
    try:
        p = db2.query(TobyProposal).filter(TobyProposal.proposal_id == proposal_id).first()
        if p:
            p.accepted_job_id = job_id
            db2.commit()
    finally:
        db2.close()

    # Fire background processing (same as /jobs/create does)
    def _process_job(jid: str):
        import traceback, sys
        print(f"\n{'='*60}", flush=True)
        print(f"🎼 MAESTRO: Processing accepted proposal {proposal_id}", flush=True)
        print(f"   Job ID: {jid}", flush=True)
        print(f"{'='*60}", flush=True)
        try:
            with get_db_session() as pdb:
                m = JobManager(pdb)
                m.process_job(jid)
            print(f"✅ MAESTRO: Job {jid} completed for proposal {proposal_id}", flush=True)
        except Exception as e:
            print(f"❌ MAESTRO: Job {jid} failed: {e}", flush=True)
            traceback.print_exc()
            try:
                with get_db_session() as edb:
                    m = JobManager(edb)
                    m.update_job_status(jid, "failed", error_message=str(e))
            except Exception:
                pass

    background_tasks.add_task(_process_job, job_id)

    return {
        "status": "accepted",
        "proposal_id": proposal_id,
        "job_id": job_id,
        "title": proposal.title,
        "content_type": proposal.content_type,
        "brands": ALL_BRANDS,
        "message": f"Job {job_id} created — generating for {len(ALL_BRANDS)} brands",
    }


@router.post("/proposals/{proposal_id}/reject")
async def reject_proposal(proposal_id: str, req: RejectRequest = RejectRequest()):
    """Reject a proposal."""
    from app.services.toby_agent import get_toby_agent

    agent = get_toby_agent()
    result = agent.reject_proposal(proposal_id, notes=req.notes)
    return result


# ── STATS ─────────────────────────────────────────────────────

@router.get("/stats")
async def maestro_stats():
    """Per-agent and global stats."""
    from app.db_connection import SessionLocal
    from app.models import TobyProposal
    from sqlalchemy import func
    from datetime import datetime

    db = SessionLocal()
    try:
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        result = {"global": {}, "agents": {}}

        # Global
        result["global"]["total"] = db.query(TobyProposal).count()
        result["global"]["pending"] = db.query(TobyProposal).filter(TobyProposal.status == "pending").count()
        result["global"]["accepted"] = db.query(TobyProposal).filter(TobyProposal.status == "accepted").count()
        result["global"]["rejected"] = db.query(TobyProposal).filter(TobyProposal.status == "rejected").count()
        result["global"]["today"] = db.query(TobyProposal).filter(TobyProposal.created_at >= today).count()

        # Per agent
        for name in ["toby", "lexi"]:
            aq = db.query(TobyProposal).filter(TobyProposal.agent_name == name)
            total = aq.count()
            accepted = aq.filter(TobyProposal.status == "accepted").count()
            rejected = aq.filter(TobyProposal.status == "rejected").count()

            # Per-strategy breakdown
            strategies = (
                db.query(TobyProposal.strategy, func.count(TobyProposal.id))
                .filter(TobyProposal.agent_name == name)
                .group_by(TobyProposal.strategy)
                .all()
            )

            result["agents"][name] = {
                "total": total,
                "pending": aq.filter(TobyProposal.status == "pending").count(),
                "accepted": accepted,
                "rejected": rejected,
                "today": aq.filter(TobyProposal.created_at >= today).count(),
                "acceptance_rate": round(accepted / total * 100, 1) if total > 0 else 0,
                "strategies": {s: c for s, c in strategies},
            }

        return result
    finally:
        db.close()


# ── INSIGHTS & TRENDING ──────────────────────────────────────

@router.get("/insights")
async def performance_insights(brand: Optional[str] = None):
    """Get performance insights (shared across agents)."""
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
    content_type: Optional[str] = Query(None, description="Filter: reel, post"),
):
    """Get trending content discovered by TrendScout."""
    try:
        from app.services.trend_scout import get_trend_scout

        scout = get_trend_scout()
        trending = scout.get_trending_for_toby(
            min_likes=min_likes, limit=limit, content_type=content_type or "reel"
        )
        return {"count": len(trending), "trending": trending}
    except Exception as e:
        return {"error": str(e)}


# ── OPTIMIZE NOW ──────────────────────────────────────────────

@router.post("/optimize-now")
async def optimize_now(background_tasks: BackgroundTasks):
    """
    Trigger both Toby and Lexi to generate 10 reel proposals each, immediately.

    Runs in background so the response is instant.
    Returns immediately with a confirmation — proposals appear in the feed.
    """
    from app.services.maestro import maestro_log

    def _run_optimize():
        import traceback

        maestro_log("maestro", "⚡ Optimize Now", "Triggered — Toby×10 + Lexi×10 reels", "🚀", "action")

        results = {}

        # Toby: 10 reel proposals
        try:
            from app.services.toby_agent import get_toby_agent
            toby = get_toby_agent()
            maestro_log("maestro", "Optimize Now", "Running Toby × 10 reels...", "🧠", "action")
            toby_result = toby.run(max_proposals=10, content_type="reel")
            results["toby"] = {
                "created": toby_result.get("proposals_created", 0),
                "strategies": toby_result.get("strategies_used", {}),
            }
            maestro_log("maestro", "Optimize Now", f"Toby done — {toby_result.get('proposals_created', 0)} proposals", "✅", "action")
        except Exception as e:
            maestro_log("maestro", "Optimize Now Error", f"Toby failed: {e}", "❌", "action")
            traceback.print_exc()
            results["toby"] = {"error": str(e)}

        # Lexi: 10 reel proposals
        try:
            from app.services.lexi_agent import get_lexi_agent
            lexi = get_lexi_agent()
            maestro_log("maestro", "Optimize Now", "Running Lexi × 10 reels...", "📊", "action")
            lexi_result = lexi.run(max_proposals=10, content_type="reel")
            results["lexi"] = {
                "created": lexi_result.get("proposals_created", 0),
                "strategies": lexi_result.get("strategies_used", {}),
            }
            maestro_log("maestro", "Optimize Now", f"Lexi done — {lexi_result.get('proposals_created', 0)} proposals", "✅", "action")
        except Exception as e:
            maestro_log("maestro", "Optimize Now Error", f"Lexi failed: {e}", "❌", "action")
            traceback.print_exc()
            results["lexi"] = {"error": str(e)}

        total = results.get("toby", {}).get("created", 0) + results.get("lexi", {}).get("created", 0)
        maestro_log("maestro", "⚡ Optimize Now Complete", f"Total: {total} proposals generated", "🏁", "action")

    background_tasks.add_task(_run_optimize)

    return {
        "status": "started",
        "message": "Optimize Now triggered — Toby (10 reels) + Lexi (10 reels) generating in background. Proposals will appear shortly.",
    }
