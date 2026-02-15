"""
AI Logs — JSON API for agent activity.

Provides:
- GET /api/ai-logs        → JSON API for all agent activity (filterable)
"""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Query
from sqlalchemy import desc, func

from app.db_connection import SessionLocal
from app.models import TobyProposal, TrendingContent, PostPerformance

router = APIRouter(tags=["ai-logs"])


# ─── JSON API ────────────────────────────────────────────────

@router.get("/api/ai-logs", summary="All AI agent activity log (JSON)")
def get_ai_logs(
    limit: int = Query(100, ge=1, le=500),
    agent: Optional[str] = Query(None, description="toby, lexi, or all"),
    brand: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    strategy: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
):
    """Full activity log for all AI agents — proposals, trending, metrics."""
    db = SessionLocal()
    try:
        since = datetime.utcnow() - timedelta(days=days)

        # ── Base query ──
        q = db.query(TobyProposal).filter(TobyProposal.created_at >= since)
        if agent and agent != "all":
            q = q.filter(TobyProposal.agent_name == agent)
        if brand:
            q = q.filter(TobyProposal.brand == brand)
        if status:
            q = q.filter(TobyProposal.status == status)
        if strategy:
            q = q.filter(TobyProposal.strategy == strategy)
        proposals = q.order_by(desc(TobyProposal.created_at)).limit(limit).all()

        # ── Global stats ──
        def count_q(extra_filters=None):
            cq = db.query(func.count(TobyProposal.id)).filter(TobyProposal.created_at >= since)
            if agent and agent != "all":
                cq = cq.filter(TobyProposal.agent_name == agent)
            if brand:
                cq = cq.filter(TobyProposal.brand == brand)
            if extra_filters:
                for f in extra_filters:
                    cq = cq.filter(f)
            return cq.scalar() or 0

        total = count_q()
        accepted = count_q([TobyProposal.status == "accepted"])
        rejected = count_q([TobyProposal.status == "rejected"])
        pending = count_q([TobyProposal.status == "pending"])

        # ── Per-agent stats — dynamic from DB ──
        agent_stats = {}
        try:
            from app.models import AIAgent
            agent_rows = db.query(AIAgent.agent_id, AIAgent.display_name, AIAgent.variant).filter(AIAgent.active == True).all()
            agent_ids = [a.agent_id for a in agent_rows]
            agent_meta = {a.agent_id: {"name": a.display_name, "variant": a.variant} for a in agent_rows}
        except Exception:
            agent_ids = []
            agent_meta = {}
        for an in agent_ids:
            a_total = db.query(func.count(TobyProposal.id)).filter(
                TobyProposal.created_at >= since, TobyProposal.agent_name == an
            ).scalar() or 0
            a_accepted = db.query(func.count(TobyProposal.id)).filter(
                TobyProposal.created_at >= since, TobyProposal.agent_name == an,
                TobyProposal.status == "accepted"
            ).scalar() or 0
            agent_stats[an] = {"total": a_total, "accepted": a_accepted, **(agent_meta.get(an, {}))}

        # ── Per-brand stats ──
        brand_rows = (
            db.query(TobyProposal.brand, TobyProposal.status, func.count(TobyProposal.id))
            .filter(TobyProposal.created_at >= since)
            .group_by(TobyProposal.brand, TobyProposal.status)
            .all()
        )
        brand_stats = {}
        for b, st, c in brand_rows:
            bname = b or "unassigned"
            if bname not in brand_stats:
                brand_stats[bname] = {"total": 0, "accepted": 0, "rejected": 0, "pending": 0}
            brand_stats[bname]["total"] += c
            if st in brand_stats[bname]:
                brand_stats[bname][st] += c

        # ── Strategy breakdown ──
        strat_q = db.query(TobyProposal.strategy, TobyProposal.status, func.count(TobyProposal.id)).filter(
            TobyProposal.created_at >= since
        )
        if agent and agent != "all":
            strat_q = strat_q.filter(TobyProposal.agent_name == agent)
        strat_rows = strat_q.group_by(TobyProposal.strategy, TobyProposal.status).all()
        strategies = {}
        for s, st, c in strat_rows:
            if s not in strategies:
                strategies[s] = {"total": 0, "accepted": 0, "rejected": 0, "pending": 0}
            strategies[s]["total"] += c
            if st in strategies[s]:
                strategies[s][st] += c

        # ── Trending ──
        trending_count = db.query(func.count(TrendingContent.id)).filter(
            TrendingContent.discovered_at >= since
        ).scalar() or 0
        trending_used = db.query(func.count(TrendingContent.id)).filter(
            TrendingContent.discovered_at >= since,
            TrendingContent.used_for_proposal == True
        ).scalar() or 0

        # ── Performance ──
        perf_count = db.query(func.count(PostPerformance.id)).scalar() or 0

        # ── Today ──
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_proposals = db.query(func.count(TobyProposal.id)).filter(
            TobyProposal.created_at >= today_start
        ).scalar() or 0

        # ── Daily breakdown (7 days) ──
        daily = []
        for d in range(7):
            day_start = (datetime.utcnow() - timedelta(days=d)).replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            dq = db.query(func.count(TobyProposal.id)).filter(
                TobyProposal.created_at >= day_start, TobyProposal.created_at < day_end,
            )
            da = db.query(func.count(TobyProposal.id)).filter(
                TobyProposal.created_at >= day_start, TobyProposal.created_at < day_end,
                TobyProposal.status == "accepted",
            )
            daily.append({
                "date": day_start.strftime("%Y-%m-%d"),
                "total": dq.scalar() or 0,
                "accepted": da.scalar() or 0,
            })

        # ── Maestro real-time activity log ──
        maestro_log = []
        try:
            from app.services.maestro.maestro import get_maestro
            m = get_maestro()
            maestro_log = m.state.activity_log[:100]  # last 100 entries
        except Exception:
            pass

        return {
            "stats": {
                "total": total,
                "accepted": accepted,
                "rejected": rejected,
                "pending": pending,
                "acceptance_rate": round(accepted / total * 100, 1) if total > 0 else 0,
                "today": today_proposals,
                "trending_discovered": trending_count,
                "trending_used": trending_used,
                "posts_tracked": perf_count,
            },
            "agent_stats": agent_stats,
            "brand_stats": brand_stats,
            "strategies": strategies,
            "daily": daily,
            "maestro_log": maestro_log,
            "proposals": [
                {
                    "proposal_id": p.proposal_id,
                    "status": p.status,
                    "strategy": p.strategy,
                    "agent_name": p.agent_name or "unknown",
                    "brand": p.brand,
                    "variant": p.variant,
                    "title": p.title,
                    "content_lines": p.content_lines,
                    "reasoning": p.reasoning,
                    "topic_bucket": p.topic_bucket,
                    "quality_score": p.quality_score,
                    "source_type": p.source_type,
                    "source_title": p.source_title,
                    "source_account": p.source_account,
                    "reviewer_notes": p.reviewer_notes,
                    "accepted_job_id": p.accepted_job_id,
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                    "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
                }
                for p in proposals
            ],
        }
    finally:
        db.close()
