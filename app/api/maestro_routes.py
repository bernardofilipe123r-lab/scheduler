"""
Maestro API routes — Multi-agent orchestrator (v2).

Maestro manages Toby (Explorer) and Lexi (Optimizer).
Pause/Resume controlled — state persisted in DB across deploys.

Endpoints:
    GET  /api/maestro/status                     — Orchestrator status (both agents)
    POST /api/maestro/pause                       — Pause Maestro (persisted in DB)
    POST /api/maestro/resume                      — Resume Maestro (triggers burst if needed)
    POST /api/maestro/trigger-burst               — Manually trigger daily burst
    GET  /api/maestro/proposals                   — List proposals (filterable by agent, status)
    GET  /api/maestro/proposals/{id}              — Get a single proposal
    POST /api/maestro/proposals/{id}/accept        — Accept & trigger brand creation (dark + light)
    POST /api/maestro/proposals/{id}/reject        — Reject with optional notes
    GET  /api/maestro/stats                        — Stats per agent + global
    GET  /api/maestro/insights                     — Performance insights
    GET  /api/maestro/trending                     — Trending content
    GET  /api/maestro/feedback                     — Latest agent performance feedback
    POST /api/maestro/optimize-now                 — Trigger Toby×10 + Lexi×10
    GET  /api/maestro/examiner/stats               — Examiner quality gate statistics
    GET  /api/maestro/examiner/rejected            — Recently rejected proposals with details
"""

from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Query, BackgroundTasks
from pydantic import BaseModel
from app.services.brand_resolver import brand_resolver

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
    from app.models import TobyProposal, AIAgent
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

        # Per-agent stats — dynamic, all active agents
        agent_stats = {}
        agent_ids = [a_id for (a_id,) in db.query(AIAgent.agent_id).filter(AIAgent.active == True).all()]
        # Always include toby/lexi even if inactive (backwards compat)
        for fallback in ["toby", "lexi"]:
            if fallback not in agent_ids:
                agent_ids.append(fallback)

        for agent_name in agent_ids:
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

        # Count today's reel vs post proposals for smart burst button
        today_reels = db.query(TobyProposal).filter(
            TobyProposal.created_at >= today,
            TobyProposal.content_type == "reel",
        ).count()
        today_posts = db.query(TobyProposal).filter(
            TobyProposal.created_at >= today,
            TobyProposal.content_type == "post",
        ).count()
        if "daily_config" in status and status["daily_config"]:
            status["daily_config"]["today_reels"] = today_reels
            status["daily_config"]["today_posts"] = today_posts
    except Exception as e:
        print(f"[MAESTRO-STATUS] DB query failed (proposals may not have new columns yet): {e}", flush=True)
        status["proposal_stats"] = {
            "total": 0, "pending": 0, "accepted": 0, "rejected": 0,
            "agents": {}, "db_error": str(e)[:200],
        }
    finally:
        db.close()

    return status


# ── PAUSE / RESUME / TRIGGER ─────────────────────────────────

@router.post("/pause")
async def pause_maestro():
    """Pause Maestro — stops daily burst generation. State persisted in DB."""
    from app.services.maestro import set_paused, is_paused, maestro_log

    if is_paused():
        return {"status": "already_paused", "message": "Maestro is already paused"}

    persisted = set_paused(True)
    if not persisted:
        return {
            "status": "error",
            "message": "Failed to persist pause state to database. Check DB connection.",
        }
    maestro_log("maestro", "PAUSED", "User paused Maestro — no more daily bursts until resumed", "⏸️", "action")
    return {"status": "paused", "message": "Maestro paused. Daily burst generation stopped."}



@router.post("/resume")
async def resume_maestro(background_tasks: BackgroundTasks):
    """
    Resume Maestro — re-enables daily burst generation.
    First schedules any ready-to-schedule reels, then triggers burst if needed.
    """
    from app.services.maestro import (
        set_paused, is_paused, get_last_daily_run, get_maestro,
        maestro_log, schedule_all_ready_reels,
    )
    from datetime import datetime

    if not is_paused():
        return {"status": "already_running", "message": "Maestro is already running"}

    persisted = set_paused(False)
    if not persisted:
        return {
            "status": "error",
            "message": "Failed to persist resume state to database. Check DB connection.",
        }
    maestro_log("maestro", "RESUMED", "User resumed Maestro — daily burst generation enabled", "▶️", "action")

    # First: schedule any completed reels that are sitting in "Ready"
    ready_scheduled = 0
    try:
        ready_scheduled = schedule_all_ready_reels()
        if ready_scheduled > 0:
            maestro_log(
                "maestro", "Resume: Scheduled ready reels",
                f"{ready_scheduled} brand-reels from completed jobs auto-scheduled",
                "📅", "action",
            )
    except Exception as e:
        maestro_log("maestro", "Resume: Schedule-ready error", str(e)[:200], "❌", "action")

    # Then: check if daily burst should run
    last_run = get_last_daily_run()
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    trigger_now = not last_run or last_run < today

    if trigger_now:
        maestro_log("maestro", "Resume Trigger", "Daily burst hasn't run today — triggering now", "🌅", "action")
        maestro = get_maestro()
        background_tasks.add_task(maestro._run_daily_burst)

    return {
        "status": "resumed",
        "message": (
            f"Maestro resumed."
            f"{f' Scheduled {ready_scheduled} ready reels.' if ready_scheduled > 0 else ''}"
            f"{' Daily burst triggered.' if trigger_now else ' Daily burst already ran today.'}"
        ),
        "burst_triggered": trigger_now,
        "ready_scheduled": ready_scheduled,
    }


@router.post("/trigger-burst")
async def trigger_burst(background_tasks: BackgroundTasks):
    """Smart burst — counts existing proposals today and generates only the remaining.
    If all proposals for today are complete, returns 'complete' status."""
    from app.services.maestro import get_maestro, maestro_log, schedule_all_ready_reels
    from app.db_connection import SessionLocal
    from app.models import TobyProposal
    from datetime import datetime

    maestro = get_maestro()
    config = maestro.state._get_daily_config()
    target_reels = config.get("total_reels", 30)
    target_posts = config.get("total_posts", 10)

    # Count today's existing proposals by type
    db = SessionLocal()
    try:
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_reels = db.query(TobyProposal).filter(
            TobyProposal.created_at >= today,
            TobyProposal.content_type == "reel",
        ).count()
        today_posts = db.query(TobyProposal).filter(
            TobyProposal.created_at >= today,
            TobyProposal.content_type == "post",
        ).count()
    finally:
        db.close()

    remaining_reels = max(0, target_reels - today_reels)
    remaining_posts = max(0, target_posts - today_posts)
    remaining_total = remaining_reels + remaining_posts

    if remaining_total == 0:
        return {
            "status": "complete",
            "message": "All proposals for today are complete!",
            "today_reels": today_reels,
            "today_posts": today_posts,
            "target_reels": target_reels,
            "target_posts": target_posts,
        }

    # Schedule any ready reels first
    ready_scheduled = 0
    try:
        ready_scheduled = schedule_all_ready_reels()
        if ready_scheduled > 0:
            maestro_log("maestro", "Pre-burst: Scheduled ready reels", f"{ready_scheduled} brand-reels", "📅", "action")
    except Exception:
        pass

    maestro_log(
        "maestro", "Smart Burst",
        f"Generating {remaining_reels} reels + {remaining_posts} posts (already have {today_reels} reels + {today_posts} posts)",
        "🔘", "action"
    )
    background_tasks.add_task(maestro.run_smart_burst, remaining_reels, remaining_posts)

    return {
        "status": "triggered",
        "message": f"Smart burst: generating {remaining_reels} reels + {remaining_posts} posts.",
        "remaining_reels": remaining_reels,
        "remaining_posts": remaining_posts,
        "today_reels": today_reels,
        "today_posts": today_posts,
        "ready_scheduled": ready_scheduled,
    }


@router.get("/feedback")
async def get_feedback():
    """Get latest agent performance feedback data."""
    import json
    from app.services.maestro import _db_get

    raw = _db_get("last_feedback_data", "")
    if not raw:
        return {"feedback": None, "message": "No feedback data yet — runs every 6h after reels are published 48-72h"}

    try:
        return {"feedback": json.loads(raw)}
    except Exception:
        return {"feedback": None, "error": "Failed to parse feedback data"}


@router.post("/reset-daily-run")
async def reset_daily_run():
    """Reset today's daily burst limit so it can be triggered again."""
    from app.services.maestro import _db_set
    # Set last_daily_run to yesterday so the burst check passes
    from datetime import datetime, timedelta
    yesterday = (datetime.utcnow() - timedelta(days=1)).isoformat()
    _db_set("last_daily_run", yesterday)
    return {"status": "reset", "message": "Daily burst limit reset. You can now trigger a burst."}


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
    Accept a proposal — creates 1 generation job for the proposal's assigned brand.

    Flow:
      1. Mark proposal as accepted
      2. Read brand + variant from proposal (assigned at generation time)
      3. Create 1 GenerationJob for that specific brand
      4. Fire background processing
      5. Auto-schedule on completion
      6. Return job_id
    """
    from app.db_connection import SessionLocal, get_db_session
    from app.models import TobyProposal
    from app.services.job_manager import JobManager
    from datetime import datetime

    ALL_BRANDS = brand_resolver.get_all_brand_ids()

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

        is_post = proposal.content_type == "post"

        # Mark accepted
        proposal.status = "accepted"
        proposal.reviewed_at = datetime.utcnow()
        db.commit()

        title = proposal.title
        content_lines = proposal.content_lines or []
        slide_texts = proposal.slide_texts or []
        image_prompt = proposal.image_prompt
        content_type = proposal.content_type
        proposal_brand = proposal.brand
        proposal_variant = proposal.variant

        # Record in content tracker
        try:
            from app.services.content_tracker import ContentTracker
            tracker = ContentTracker()
            tracker.record(
                title=title,
                content_type=content_type,
                quality_score=proposal.quality_score,
            )
        except Exception:
            pass  # Non-critical

    finally:
        db.close()

    # Determine brand and variant from proposal
    if proposal_brand:
        # New flow: proposal already has brand assigned
        brands = [proposal_brand]
    else:
        # Legacy fallback: no brand on proposal → all brands
        brands = ALL_BRANDS

    if is_post:
        variants = ["post"]
    elif proposal_variant:
        variants = [proposal_variant]
    else:
        # Legacy fallback: agent-based variant
        variants = ["dark", "light"]

    job_ids = []

    for variant in variants:
        with get_db_session() as job_db:
            manager = JobManager(job_db)
            # For posts, use slide_texts instead of content_lines
            job_content = slide_texts if is_post and slide_texts else content_lines
            # Posts don't go to YouTube
            job_platforms = ["instagram", "facebook"] if is_post else ["instagram", "facebook", "youtube"]
            job = manager.create_job(
                user_id=proposal_id,
                title=title,
                content_lines=job_content,
                brands=brands,
                variant=variant,
                ai_prompt=image_prompt,
                cta_type="follow_tips",
                platforms=job_platforms,
            )
            job_ids.append(job.job_id)

    # Store first job_id on proposal
    db2 = SessionLocal()
    try:
        p = db2.query(TobyProposal).filter(TobyProposal.proposal_id == proposal_id).first()
        if p:
            p.accepted_job_id = job_ids[0]
            db2.commit()
    finally:
        db2.close()

    # Fire background processing for each job
    def _process_job(jid: str, var: str):
        import traceback
        print(f"\n{'='*60}", flush=True)
        print(f"🎼 MAESTRO: Processing {var} variant for proposal {proposal_id}", flush=True)
        print(f"   Job ID: {jid}", flush=True)
        print(f"{'='*60}", flush=True)
        try:
            with get_db_session() as pdb:
                m = JobManager(pdb)
                m.process_job(jid)
            print(f"✅ MAESTRO: Job {jid} ({var}) completed", flush=True)
        except Exception as e:
            print(f"❌ MAESTRO: Job {jid} ({var}) failed: {e}", flush=True)
            traceback.print_exc()
            try:
                with get_db_session() as edb:
                    m = JobManager(edb)
                    m.update_job_status(jid, "failed", error_message=str(e))
            except Exception:
                pass
            return  # Don't try to schedule if generation failed

        # Auto-schedule separately — don't let scheduling errors mark job as failed
        try:
            from app.services.maestro import auto_schedule_job
            auto_schedule_job(jid)
            print(f"📅 MAESTRO: Job {jid} ({var}) auto-scheduled", flush=True)
        except Exception as e:
            print(f"⚠️ MAESTRO: Job {jid} ({var}) auto-schedule failed (job still completed): {e}", flush=True)

    for jid, var in zip(job_ids, variants):
        background_tasks.add_task(_process_job, jid, var)

    return {
        "status": "accepted",
        "proposal_id": proposal_id,
        "job_ids": job_ids,
        "job_id": job_ids[0],  # backward compat
        "title": title,
        "content_type": content_type,
        "variants": variants,
        "brands": brands,
        "message": f"{len(job_ids)} job(s) created for {', '.join(brands)} ({', '.join(variants)})",
    }


@router.post("/proposals/{proposal_id}/reject")
async def reject_proposal(proposal_id: str, req: RejectRequest = RejectRequest()):
    """Reject a proposal."""
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


@router.delete("/proposals/clear")
async def clear_proposals():
    """Delete ALL proposals from the database."""
    from app.db_connection import SessionLocal
    from app.models import TobyProposal

    db = SessionLocal()
    try:
        count = db.query(TobyProposal).count()
        db.query(TobyProposal).delete()
        db.commit()
        return {"status": "cleared", "deleted": count}
    except Exception as e:
        db.rollback()
        return {"status": "error", "error": str(e)}
    finally:
        db.close()


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
    Trigger all active agents to generate proposals immediately.
    Uses GenericAgent system (DB-driven agents).

    Runs in background so the response is instant.
    Returns immediately with a confirmation — proposals appear in the feed.
    """
    from app.services.maestro import maestro_log

    def _run_optimize():
        import traceback
        from app.services.generic_agent import get_all_active_agents

        agents = get_all_active_agents()
        if not agents:
            maestro_log("maestro", "⚡ Optimize Now", "No active agents found in DB", "⚠️", "action")
            return

        agent_names = ", ".join(a.agent_id for a in agents)
        maestro_log("maestro", "⚡ Optimize Now", f"Triggered — {len(agents)} agents: {agent_names}", "🚀", "action")

        results = {}
        total = 0

        for agent in agents:
            agent_results = {"reels": 0, "posts": 0, "errors": []}

            for content_type, ct_count in [("reel", 5), ("post", 5)]:
                try:
                    maestro_log("maestro", "Optimize Now", f"Running {agent.agent_id} × {ct_count} {content_type}s...", "🧠", "action")
                    result = agent.run(max_proposals=ct_count, content_type=content_type)
                    created = result.get("proposals_created", 0)
                    agent_results[f"{content_type}s"] = created
                    total += created
                    maestro_log("maestro", "Optimize Now", f"{agent.agent_id} done — {created} {content_type} proposals", "✅", "action")
                except Exception as e:
                    maestro_log("maestro", "Optimize Now Error", f"{agent.agent_id} {content_type}s failed: {e}", "❌", "action")
                    traceback.print_exc()
                    agent_results["errors"].append(f"{content_type}: {str(e)[:100]}")

            results[agent.agent_id] = agent_results

        maestro_log("maestro", "⚡ Optimize Now Complete", f"Total: {total} proposals (reels + posts)", "🏁", "action")

    background_tasks.add_task(_run_optimize)

    return {
        "status": "started",
        "message": "Optimize Now triggered — all active agents generating 5 reels + 5 posts each in background.",
    }


# ── HEALING: Smart self-repair ────────────────────────────────

@router.get("/healing")
async def maestro_healing_status():
    """
    Get healing status — failed jobs, retry history, notifications.
    """
    from app.services.maestro import get_maestro
    from app.db_connection import SessionLocal
    from app.models import GenerationJob, TobyProposal
    from datetime import datetime, timedelta

    maestro = get_maestro()
    status = maestro.state.to_dict()

    # Get current failed jobs
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        lookback = now - timedelta(hours=24)

        failed_jobs = (
            db.query(GenerationJob)
            .filter(
                GenerationJob.status == "failed",
                GenerationJob.created_at >= lookback,
            )
            .order_by(GenerationJob.created_at.desc())
            .all()
        )

        failed_details = []
        for job in failed_jobs:
            proposal = (
                db.query(TobyProposal)
                .filter(TobyProposal.accepted_job_id == job.job_id)
                .first()
            )
            is_maestro = proposal is not None or (
                job.user_id and any(
                    job.user_id.upper().startswith(p)
                    for p in ["TOBY-", "LEXI-", "PROP-"]
                )
            )
            diagnosis = maestro._diagnose_failure(job)

            failed_details.append({
                "job_id": job.job_id,
                "brand": (job.brands or ["unknown"])[0],
                "variant": job.variant,
                "title": (job.title or "")[:100],
                "error_snippet": (job.error_message or "")[:300],
                "created_at": job.created_at.isoformat() if job.created_at else None,
                "is_maestro_created": is_maestro,
                "agent": proposal.agent_name if proposal else None,
                "diagnosis": diagnosis,
                "retry_count": maestro._get_retry_count(job, db),
            })

    finally:
        db.close()

    return {
        "healing": status.get("healing", {}),
        "failed_jobs_24h": failed_details,
        "total_failed": len(failed_details),
        "maestro_created_failures": sum(1 for f in failed_details if f["is_maestro_created"]),
    }


@router.post("/trigger-healing")
async def trigger_healing(background_tasks: BackgroundTasks):
    """Manually trigger the healing cycle — scan, diagnose, retry failed jobs."""
    from app.services.maestro import get_maestro

    maestro = get_maestro()

    def _run_healing():
        maestro._healing_cycle()

    background_tasks.add_task(_run_healing)

    return {
        "status": "started",
        "message": "Healing cycle triggered — scanning for failed jobs, analyzing, and auto-retrying.",
    }


@router.post("/retry-job/{job_id}")
async def retry_specific_job(job_id: str, background_tasks: BackgroundTasks):
    """Manually retry a specific failed job."""
    from app.services.maestro import get_maestro
    from app.db_connection import SessionLocal
    from app.models import GenerationJob, TobyProposal

    maestro = get_maestro()

    db = SessionLocal()
    try:
        job = db.query(GenerationJob).filter_by(job_id=job_id).first()
        if not job:
            return {"success": False, "error": f"Job {job_id} not found"}

        if job.status != "failed":
            return {"success": False, "error": f"Job {job_id} is not failed (status={job.status})"}

        proposal = (
            db.query(TobyProposal)
            .filter(TobyProposal.accepted_job_id == job.job_id)
            .first()
        )

        retry_count = maestro._get_retry_count(job, db)
        success = maestro._retry_failed_job(job, proposal, retry_count, db)

        return {
            "success": success,
            "job_id": job_id,
            "retry_number": retry_count + 1,
            "message": f"Job {job_id} queued for retry #{retry_count + 1}" if success else "Retry failed to start",
        }
    finally:
        db.close()


# ── Examiner Stats ────────────────────────────────────────────

@router.get("/examiner/stats")
def get_examiner_stats(days: int = 7):
    """
    Examiner quality gate statistics: acceptance rate, avg scores,
    top rejection reasons, score distributions.
    """
    from app.db_connection import SessionLocal
    from app.models import TobyProposal
    from sqlalchemy import func

    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(days=days)

        # All examined proposals (have examiner_score)
        examined = (
            db.query(TobyProposal)
            .filter(
                TobyProposal.examiner_score.isnot(None),
                TobyProposal.created_at >= cutoff,
            )
            .all()
        )

        if not examined:
            return {"period_days": days, "total_examined": 0, "message": "No examined proposals found"}

        accepted = [p for p in examined if p.examiner_verdict == "accept"]
        rejected = [p for p in examined if p.examiner_verdict == "reject"]

        # Average scores
        def avg_scores(proposals):
            if not proposals:
                return None
            return {
                "composite": round(sum(p.examiner_score or 0 for p in proposals) / len(proposals), 2),
                "avatar_fit": round(sum(p.examiner_avatar_fit or 0 for p in proposals) / len(proposals), 2),
                "engagement": round(sum(p.examiner_engagement or 0 for p in proposals) / len(proposals), 2),
                "content_quality": round(sum(p.examiner_content_quality or 0 for p in proposals) / len(proposals), 2),
            }

        # Rejection reasons
        rejection_reasons = []
        for p in rejected:
            if p.examiner_reason:
                rejection_reasons.append({
                    "proposal_id": p.proposal_id,
                    "brand": p.brand,
                    "content_type": p.content_type,
                    "score": p.examiner_score,
                    "reason": p.examiner_reason,
                    "red_flags": p.examiner_red_flags or [],
                    "title": p.title[:80] if p.title else None,
                })

        # Per-agent breakdown
        agent_stats = {}
        for p in examined:
            agent = p.agent_name or "unknown"
            if agent not in agent_stats:
                agent_stats[agent] = {"examined": 0, "accepted": 0, "rejected": 0, "scores": []}
            agent_stats[agent]["examined"] += 1
            agent_stats[agent]["scores"].append(p.examiner_score or 0)
            if p.examiner_verdict == "accept":
                agent_stats[agent]["accepted"] += 1
            else:
                agent_stats[agent]["rejected"] += 1

        for agent, stats in agent_stats.items():
            stats["avg_score"] = round(sum(stats["scores"]) / len(stats["scores"]), 2) if stats["scores"] else 0
            stats["acceptance_rate"] = round(stats["accepted"] / stats["examined"] * 100, 1) if stats["examined"] else 0
            del stats["scores"]

        # Per-brand breakdown
        brand_stats = {}
        for p in examined:
            b = p.brand or "unknown"
            if b not in brand_stats:
                brand_stats[b] = {"examined": 0, "accepted": 0, "rejected": 0}
            brand_stats[b]["examined"] += 1
            if p.examiner_verdict == "accept":
                brand_stats[b]["accepted"] += 1
            else:
                brand_stats[b]["rejected"] += 1

        return {
            "period_days": days,
            "total_examined": len(examined),
            "total_accepted": len(accepted),
            "total_rejected": len(rejected),
            "acceptance_rate": round(len(accepted) / len(examined) * 100, 1) if examined else 0,
            "avg_scores_accepted": avg_scores(accepted),
            "avg_scores_rejected": avg_scores(rejected),
            "avg_scores_all": avg_scores(examined),
            "per_agent": agent_stats,
            "per_brand": brand_stats,
            "recent_rejections": sorted(rejection_reasons, key=lambda x: x.get("score", 0))[:20],
        }
    finally:
        db.close()


@router.get("/examiner/rejected")
def get_rejected_proposals(
    limit: int = 50,
    brand: str = None,
    content_type: str = None,
):
    """List recently rejected proposals with examiner details."""
    from app.db_connection import SessionLocal
    from app.models import TobyProposal

    db = SessionLocal()
    try:
        query = (
            db.query(TobyProposal)
            .filter(TobyProposal.examiner_verdict == "reject")
        )

        if brand:
            query = query.filter(TobyProposal.brand == brand)
        if content_type:
            query = query.filter(TobyProposal.content_type == content_type)

        proposals = (
            query.order_by(TobyProposal.created_at.desc())
            .limit(limit)
            .all()
        )

        return {
            "count": len(proposals),
            "proposals": [p.to_dict() for p in proposals],
        }
    finally:
        db.close()
