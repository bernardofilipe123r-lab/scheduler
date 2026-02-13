"""
AI Logs — Unified activity dashboard for Toby, Lexi & Maestro.

Provides:
- GET /toby-logs          → HTML dashboard (password-protected, pre-filtered to Toby)
- GET /lexi-logs          → HTML dashboard (password-protected, pre-filtered to Lexi)
- GET /maestro-logs       → HTML dashboard (password-protected, pre-filtered to Maestro)
- GET /ai-logs            → HTML dashboard (password-protected, all agents)
- GET /ai-about           → HTML page about the AI agents
- GET /api/ai-logs        → JSON API for all agent activity (filterable)
"""
import os
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Query, Cookie
from fastapi.responses import HTMLResponse
from sqlalchemy import desc, func

from app.db_connection import SessionLocal
from app.models import TobyProposal, TrendingContent, PostPerformance

router = APIRouter(tags=["ai-logs"])

LOGS_PASSWORD = os.getenv("LOGS_PASSWORD", "logs12345@")


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
            agent_ids = ["toby", "lexi"]
            agent_meta = {"toby": {"name": "Toby", "variant": "dark"}, "lexi": {"name": "Lexi", "variant": "light"}}
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
            from app.services.maestro import get_maestro
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
                    "agent_name": p.agent_name or "toby",
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


# ─── HTML DASHBOARDS ─────────────────────────────────────────

def _serve_dashboard(agent_filter: str, logs_token: Optional[str], pwd: Optional[str]):
    """Serve the unified AI logs dashboard with an optional agent pre-filter."""
    expected = os.getenv("LOGS_PASSWORD", LOGS_PASSWORD)
    html = AI_LOGS_HTML.replace("__AGENT_FILTER__", agent_filter)
    if pwd == expected:
        response = HTMLResponse(content=html)
        response.set_cookie("logs_token", expected, max_age=60*60*24*30, httponly=True, samesite="lax")
        return response
    if logs_token == expected:
        return HTMLResponse(content=html)
    return HTMLResponse(content=AI_LOGIN_HTML.replace("__AGENT__", agent_filter or "all"))


@router.get("/ai-logs", response_class=HTMLResponse, summary="All AI agents dashboard")
def ai_logs_dashboard(logs_token: Optional[str] = Cookie(None), pwd: Optional[str] = Query(None)):
    return _serve_dashboard("all", logs_token, pwd)

@router.get("/toby-logs", response_class=HTMLResponse, summary="Toby activity dashboard")
def toby_logs_dashboard(logs_token: Optional[str] = Cookie(None), pwd: Optional[str] = Query(None)):
    return _serve_dashboard("toby", logs_token, pwd)

@router.get("/lexi-logs", response_class=HTMLResponse, summary="Lexi activity dashboard")
def lexi_logs_dashboard(logs_token: Optional[str] = Cookie(None), pwd: Optional[str] = Query(None)):
    return _serve_dashboard("lexi", logs_token, pwd)

@router.get("/maestro-logs", response_class=HTMLResponse, summary="Maestro activity dashboard")
def maestro_logs_dashboard(logs_token: Optional[str] = Cookie(None), pwd: Optional[str] = Query(None)):
    return _serve_dashboard("maestro", logs_token, pwd)

@router.get("/agent-logs/{agent_id}", response_class=HTMLResponse, summary="Dynamic agent logs dashboard")
def dynamic_agent_logs(agent_id: str, logs_token: Optional[str] = Cookie(None), pwd: Optional[str] = Query(None)):
    """Dynamic route for any agent's logs — no code change needed when new agents are added."""
    return _serve_dashboard(agent_id, logs_token, pwd)


# ─── AI About page ──────────────────────────────────────────

@router.get("/ai-about", response_class=HTMLResponse, summary="About the AI agents")
def ai_about_page(logs_token: Optional[str] = Cookie(None), pwd: Optional[str] = Query(None)):
    expected = os.getenv("LOGS_PASSWORD", LOGS_PASSWORD)
    if pwd == expected:
        response = HTMLResponse(content=AI_ABOUT_HTML)
        response.set_cookie("logs_token", expected, max_age=60*60*24*30, httponly=True, samesite="lax")
        return response
    if logs_token == expected:
        return HTMLResponse(content=AI_ABOUT_HTML)
    return HTMLResponse(content=AI_LOGIN_HTML.replace("__AGENT__", "about"))


# ─── Login page ──────────────────────────────────────────────

AI_LOGIN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🧠 AI Logs — Access</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117; color: #e6edf3;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh;
        }
        .card {
            background: #161b22; border: 1px solid #30363d;
            border-radius: 12px; padding: 40px; width: 360px; text-align: center;
        }
        .icon { font-size: 48px; margin-bottom: 16px; }
        h1 { font-size: 20px; margin-bottom: 8px; }
        p { color: #8b949e; font-size: 14px; margin-bottom: 24px; }
        input {
            width: 100%; padding: 12px 16px; border-radius: 8px;
            border: 1px solid #30363d; background: #0d1117;
            color: #e6edf3; font-size: 14px; margin-bottom: 16px; outline: none;
        }
        input:focus { border-color: #a78bfa; }
        button {
            width: 100%; padding: 12px; border-radius: 8px; border: none;
            background: linear-gradient(135deg, #7c3aed, #a78bfa);
            color: white; font-weight: 600; font-size: 14px; cursor: pointer;
        }
        button:hover { opacity: 0.9; }
        #error { display: none; color: #f85149; font-size: 13px; margin-bottom: 12px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">🧠</div>
        <h1>AI Command Center</h1>
        <p>Enter password to access AI agent logs</p>
        <div id="error">Wrong password</div>
        <input type="password" id="pwd" placeholder="Password" onkeydown="if(event.key==='Enter')go()">
        <button onclick="go()">Access Logs</button>
    </div>
    <script>
    function go(){const p=document.getElementById('pwd').value;if(p)window.location.href=window.location.pathname+'?pwd='+encodeURIComponent(p)}
    if(window.location.search.includes('pwd='))document.getElementById('error').style.display='block';
    </script>
</body>
</html>"""


# ─── AI About page HTML ─────────────────────────────────────

AI_ABOUT_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🧠 Meet the AI Team — Healveth</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --bg: #0d1117; --bg2: #161b22; --bg3: #21262d;
            --border: #30363d; --text: #e6edf3; --muted: #8b949e;
            --purple: #a78bfa; --blue: #58a6ff; --green: #3fb950;
            --yellow: #d29922; --red: #f85149; --orange: #db6d28;
            --pink: #f778ba; --cyan: #39d2c0;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg); color: var(--text); line-height: 1.6;
        }
        .container { max-width: 1000px; margin: 0 auto; padding: 40px 24px; }

        /* Nav */
        .nav {
            display: flex; gap: 12px; margin-bottom: 40px; flex-wrap: wrap;
            border-bottom: 1px solid var(--border); padding-bottom: 16px;
        }
        .nav a {
            padding: 8px 16px; border-radius: 8px; text-decoration: none;
            color: var(--muted); border: 1px solid var(--border); font-size: 13px;
            font-weight: 500; transition: all 0.2s;
        }
        .nav a:hover { border-color: var(--purple); color: var(--text); }
        .nav a.active { border-color: var(--purple); color: var(--purple); background: rgba(167,139,250,0.1); }

        /* Header */
        .page-title { font-size: 36px; font-weight: 800; margin-bottom: 8px; }
        .page-sub { color: var(--muted); font-size: 16px; margin-bottom: 48px; max-width: 700px; }

        /* Agent cards */
        .agent-section { margin-bottom: 56px; }
        .agent-header {
            display: flex; align-items: center; gap: 20px; margin-bottom: 20px;
            padding-bottom: 16px; border-bottom: 1px solid var(--border);
        }
        .agent-icon { font-size: 56px; }
        .agent-name { font-size: 28px; font-weight: 700; }
        .agent-role { color: var(--muted); font-size: 14px; }
        .agent-tag {
            display: inline-block; padding: 3px 10px; border-radius: 6px;
            font-size: 11px; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.5px; margin-left: 12px;
        }

        .agent-body {
            background: var(--bg2); border: 1px solid var(--border);
            border-radius: 12px; padding: 28px;
        }
        .agent-desc { font-size: 15px; line-height: 1.7; margin-bottom: 24px; color: #c9d1d9; }

        /* Capabilities grid */
        .cap-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .cap-card {
            background: var(--bg3); border-radius: 8px; padding: 16px;
            border-left: 3px solid var(--purple);
        }
        .cap-title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
        .cap-desc { font-size: 12px; color: var(--muted); }

        /* Specs */
        .specs { display: flex; flex-wrap: wrap; gap: 8px; }
        .spec {
            padding: 4px 12px; border-radius: 6px; font-size: 12px;
            background: var(--bg); border: 1px solid var(--border); color: var(--muted);
        }

        /* Architecture section */
        .arch-section { margin-top: 64px; }
        .arch-title { font-size: 22px; font-weight: 700; margin-bottom: 16px; }
        .arch-body {
            background: var(--bg2); border: 1px solid var(--border);
            border-radius: 12px; padding: 28px;
        }
        .arch-flow {
            display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
            justify-content: center; margin: 24px 0;
        }
        .flow-box {
            background: var(--bg3); border: 1px solid var(--border);
            border-radius: 8px; padding: 12px 20px; text-align: center;
            font-size: 13px; font-weight: 600;
        }
        .flow-arrow { color: var(--muted); font-size: 20px; }

        /* Cycle table */
        .cycle-table { width: 100%; border-collapse: collapse; margin: 16px 0 24px; font-size: 13px; }
        .cycle-table th {
            text-align: left; padding: 10px 12px; border-bottom: 2px solid var(--border);
            color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .cycle-table td {
            padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top;
        }
        .cycle-table tr:last-child td { border-bottom: none; }
        .cycle-name { font-weight: 600; color: var(--text); }
        .cycle-interval { color: var(--purple); font-weight: 600; }

        /* Strategy pool */
        .strat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin: 16px 0; }
        .strat-card {
            background: var(--bg3); border-radius: 8px; padding: 12px 14px;
            border-left: 3px solid var(--purple); font-size: 13px;
        }
        .strat-name { font-weight: 600; margin-bottom: 2px; }
        .strat-desc { font-size: 11px; color: var(--muted); }

        /* Evolution */
        .evo-tier { display: flex; gap: 16px; margin: 16px 0; flex-wrap: wrap; }
        .tier-card {
            flex: 1; min-width: 200px; background: var(--bg3); border-radius: 10px;
            padding: 20px; text-align: center;
        }
        .tier-pct { font-size: 32px; font-weight: 800; }
        .tier-label { font-size: 13px; font-weight: 600; margin: 4px 0; }
        .tier-desc { font-size: 11px; color: var(--muted); }

        /* Vision */
        .vision-section { margin-top: 48px; }
        .vision-list { list-style: none; }
        .vision-list li {
            padding: 12px 16px; background: var(--bg2);
            border: 1px solid var(--border); border-radius: 8px;
            margin-bottom: 8px; font-size: 14px;
            display: flex; align-items: center; gap: 12px;
        }
        .vision-icon { font-size: 20px; flex-shrink: 0; }

        .footer { margin-top: 64px; text-align: center; color: var(--muted); font-size: 12px; padding: 24px; border-top: 1px solid var(--border); }

        /* Survival formula */
        .formula-box {
            background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
            padding: 16px 20px; margin: 16px 0; font-family: 'SF Mono', monospace; font-size: 13px;
            text-align: center; color: var(--cyan);
        }
    </style>
</head>
<body>
<div class="container">

    <!-- Nav -->
    <div class="nav">
        <a href="/ai-about" class="active">🧠 About the AI Team</a>
        <a href="/ai-logs">📊 All Logs</a>
        <a href="/toby-logs">🤖 Toby Logs</a>
        <a href="/lexi-logs">✨ Lexi Logs</a>
        <a href="/maestro-logs">🎼 Maestro Logs</a>
    </div>

    <!-- Header -->
    <h1 class="page-title">🧠 Meet the AI Team</h1>
    <p class="page-sub">
        Healveth is powered by a self-evolving team of AI agents — each with unique DNA, personality, and strategy weights.
        They autonomously generate, evaluate, and optimize health & wellness reels and posts across 5 brands and 3 platforms (Instagram, Facebook, YouTube).
        Agents evolve weekly through natural selection: top performers pass on their DNA, underperformers are retired and replaced.
    </p>

    <!-- ── MAESTRO ── -->
    <div class="agent-section">
        <div class="agent-header">
            <div class="agent-icon">🎼</div>
            <div>
                <div class="agent-name">Maestro <span class="agent-tag" style="background:#1d2d50;color:var(--blue);">ORCHESTRATOR</span></div>
                <div class="agent-role">The Conductor — runs 8 autonomous cycles, orchestrates all agents, manages evolution and the entire content pipeline</div>
            </div>
        </div>
        <div class="agent-body">
            <div class="agent-desc">
                Maestro is the brain of the operation. It runs as a background daemon managing the full content lifecycle autonomously.<br><br>
                Every day at <strong>noon Lisbon time</strong>, Maestro triggers the <strong>Daily Burst</strong> — distributing work across
                all active agents round-robin to generate <strong>6 reels + 2 posts per brand</strong>
                (<strong>40 unique proposals/day</strong> across 5 brands). Every proposal passes through Maestro's <strong>Examiner</strong> quality gate
                (DeepSeek-powered scoring on avatar fit, engagement potential, and content quality). Rejected proposals are regenerated once.
                Accepted jobs are processed with concurrency throttling (max 3 simultaneous, 8s stagger) and auto-scheduled.<br><br>
                Beyond the burst, Maestro runs <strong>8 continuous cycles</strong> — each on its own schedule:
            </div>

            <table class="cycle-table">
                <thead>
                    <tr><th>Cycle</th><th>Interval</th><th>Purpose</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="cycle-name">🔄 Check</td>
                        <td class="cycle-interval">10 min</td>
                        <td>Checks if daily burst should run. Auto-schedules any ready reels. Waits until 12:00 PM Lisbon time.</td>
                    </tr>
                    <tr>
                        <td class="cycle-name">🩺 Healing</td>
                        <td class="cycle-interval">15 min</td>
                        <td>Detects stuck jobs (30min timeout), classifies failures (FFmpeg/API/content/file), auto-retries (max 2). Population Guard ensures agents == brands.</td>
                    </tr>
                    <tr>
                        <td class="cycle-name">📊 Observe</td>
                        <td class="cycle-interval">3 hours</td>
                        <td>Collects Instagram performance metrics via Graph API for all brands — 14 day lookback window.</td>
                    </tr>
                    <tr>
                        <td class="cycle-name">🔍 Scout</td>
                        <td class="cycle-interval">4 hours</td>
                        <td>Scans trending content — hashtags, competitors, own accounts. Discovers viral patterns for both reels and posts.</td>
                    </tr>
                    <tr>
                        <td class="cycle-name">🔁 Feedback</td>
                        <td class="cycle-interval">6 hours</td>
                        <td>Performance attribution (48–72h window). Calculates survival scores. Triggers DNA mutations via the Adaptation Engine.</td>
                    </tr>
                    <tr>
                        <td class="cycle-name">🧬 Evolution</td>
                        <td class="cycle-interval">Weekly (Sun 2AM)</td>
                        <td>Natural selection — ranks agents, retires failures (bottom 20%), spawns replacements from the gene pool or random DNA.</td>
                    </tr>
                    <tr>
                        <td class="cycle-name">🔬 Diagnostics</td>
                        <td class="cycle-interval">4 hours</td>
                        <td>Self-testing — validates DB, agents, DNA, pipeline, scheduler, evolution, API, publishing, cycle freshness, data consistency.</td>
                    </tr>
                    <tr>
                        <td class="cycle-name">🚀 Bootstrap</td>
                        <td class="cycle-interval">20 min</td>
                        <td>Cold-start research — incremental safe API polling. Auto-disables when mature (50+ own entries AND 150+ trending, or 14 days old).</td>
                    </tr>
                </tbody>
            </table>

            <div class="cap-grid">
                <div class="cap-card" style="border-color: var(--blue);">
                    <div class="cap-title">🔄 Daily Burst</div>
                    <div class="cap-desc">40 proposals/day: (6 reels + 2 posts) × 5 brands. Distributed round-robin across all active agents.</div>
                </div>
                <div class="cap-card" style="border-color: var(--green);">
                    <div class="cap-title">✅ Examiner Gate</div>
                    <div class="cap-desc">Every proposal scored 0–10 by DeepSeek on avatar fit, engagement potential, content quality. Reject → 1 retry.</div>
                </div>
                <div class="cap-card" style="border-color: var(--yellow);">
                    <div class="cap-title">📅 Auto-Scheduling</div>
                    <div class="cap-desc">Completed reels fill 6 daily slots per brand. Posts fill 2 daily slots. Separate scheduling queues.</div>
                </div>
                <div class="cap-card" style="border-color: var(--pink);">
                    <div class="cap-title">🩺 Self-Healing</div>
                    <div class="cap-desc">Stuck/failed jobs auto-retried. Population guard ensures agent count always matches brand count.</div>
                </div>
                <div class="cap-card" style="border-color: var(--cyan);">
                    <div class="cap-title">⚙️ Concurrency</div>
                    <div class="cap-desc">Semaphore-based throttling (max 3 concurrent) + 8s stagger delay to prevent resource exhaustion.</div>
                </div>
                <div class="cap-card" style="border-color: var(--orange);">
                    <div class="cap-title">🧬 Evolution Master</div>
                    <div class="cap-desc">Manages the full agent lifecycle — feedback, DNA mutation, natural selection, gene pool inheritance.</div>
                </div>
            </div>
            <div class="specs">
                <span class="spec">APScheduler</span>
                <span class="spec">Threading + Semaphore</span>
                <span class="spec">DB-persisted state</span>
                <span class="spec">Survives redeploys</span>
                <span class="spec">Pause/Resume</span>
                <span class="spec">Smart Burst (remaining quota)</span>
            </div>
        </div>
    </div>

    <!-- ── FOUNDING AGENTS ── -->
    <div class="agent-section">
        <div class="agent-header">
            <div class="agent-icon">🛡️</div>
            <div>
                <div class="agent-name">The Founding Agents <span class="agent-tag" style="background:#1a1a2e;color:var(--purple);">IMMORTAL</span></div>
                <div class="agent-role">Toby & Lexi — the original two agents. Built-in, cannot be killed by evolution. Their DNA seeds the gene pool.</div>
            </div>
        </div>
        <div class="agent-body">
            <div class="agent-desc">
                The system launched with two hand-crafted agents. They are <strong>immortal</strong> — the evolution engine can never retire them.
                Every agent generates content for <strong>every brand</strong>; the "created for" brand is just lineage tracking.
            </div>

            <!-- Toby -->
            <div style="background:var(--bg3);border-radius:10px;padding:20px;margin-bottom:16px;border-left:4px solid var(--green);">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <span style="font-size:32px;">🤖</span>
                    <div>
                        <div style="font-size:18px;font-weight:700;">Toby</div>
                        <div style="font-size:12px;color:var(--muted);">Creative risk-taker · Dark mode · Temperature 0.9 · High risk</div>
                    </div>
                </div>
                <div style="font-size:13px;color:#c9d1d9;margin-bottom:12px;">
                    <em>"Creative risk-taker. Explores boldly, swings for viral hits. Fortune favors the bold. High creativity, surprising angles, unexpected facts."</em>
                </div>
                <div class="strat-grid" style="margin:8px 0;">
                    <div class="strat-card" style="border-color:var(--blue);"><span class="strat-name">Explore 30%</span><span class="strat-desc">New topics & untested angles</span></div>
                    <div class="strat-card" style="border-color:var(--green);"><span class="strat-name">Double Down 30%</span><span class="strat-desc">Amplify winning content</span></div>
                    <div class="strat-card" style="border-color:var(--orange);"><span class="strat-name">Iterate 20%</span><span class="strat-desc">Fix underperformers</span></div>
                    <div class="strat-card" style="border-color:var(--red);"><span class="strat-name">Trending 20%</span><span class="strat-desc">Adapt viral formats</span></div>
                </div>
                <div class="specs" style="margin-top:8px;">
                    <span class="spec">Born for: healthycollege</span>
                    <span class="spec">AI backgrounds (deAPI)</span>
                    <span class="spec">59 viral patterns</span>
                </div>
            </div>

            <!-- Lexi -->
            <div style="background:var(--bg3);border-radius:10px;padding:20px;border-left:4px solid var(--yellow);">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <span style="font-size:32px;">✨</span>
                    <div>
                        <div style="font-size:18px;font-weight:700;">Lexi</div>
                        <div style="font-size:12px;color:var(--muted);">Precision optimizer · Light mode · Temperature 0.75 · Low risk</div>
                    </div>
                </div>
                <div style="font-size:13px;color:#c9d1d9;margin-bottom:12px;">
                    <em>"Precision optimizer. Compound small wins into massive growth. Data-backed, systematic, 80% proven patterns. Consistent engagement over viral moonshots."</em>
                </div>
                <div class="strat-grid" style="margin:8px 0;">
                    <div class="strat-card" style="border-color:var(--orange);"><span class="strat-name">Refine 40%</span><span class="strat-desc">Improve winners one element at a time</span></div>
                    <div class="strat-card" style="border-color:var(--blue);"><span class="strat-name">Analyze 30%</span><span class="strat-desc">Find & replicate top patterns</span></div>
                    <div class="strat-card" style="border-color:var(--cyan);"><span class="strat-name">Systematic 15%</span><span class="strat-desc">Structured single-variable experiments</span></div>
                    <div class="strat-card" style="border-color:var(--pink);"><span class="strat-name">Compound 15%</span><span class="strat-desc">Extend winning series</span></div>
                </div>
                <div class="specs" style="margin-top:8px;">
                    <span class="spec">Born for: vitalitycollege</span>
                    <span class="spec">Brand-colored templates</span>
                    <span class="spec">Data-driven approach</span>
                </div>
            </div>
        </div>
    </div>

    <!-- ── DYNAMIC AGENTS ── -->
    <div class="agent-section">
        <div class="agent-header">
            <div class="agent-icon">⚡</div>
            <div>
                <div class="agent-name">Dynamic Agents <span class="agent-tag" style="background:#2d1a3e;color:var(--pink);">AUTO-SPAWNED</span></div>
                <div class="agent-role">Born from evolution — unique DNA, random strategies, mortal. One agent per brand, always.</div>
            </div>
        </div>
        <div class="agent-body">
            <div class="agent-desc">
                The system enforces a strict <strong>1:1 agent-to-brand ratio</strong>. Since Toby and Lexi cover 2 of the 5 brands,
                <strong>3 dynamic agents</strong> are auto-spawned to fill the remaining slots. Each gets:<br><br>
                • A <strong>cool mythological name</strong> from the pool (Atlas, Nova, Quasar, Frost, Phantom, Nebula, Cipher, Onyx, Zenith, Wraith...)<br>
                • <strong>Randomized DNA</strong> — temperature (0.70–0.95), variant (dark/light), risk level, 4–5 random strategies with random weights<br>
                • A random <strong>personality archetype</strong> — Bold Explorer, Precision Optimizer, Trend Surfer, Story Weaver, Pattern Breaker, Consistency Engine<br><br>
                Dynamic agents are <strong>mortal</strong> — they can be retired by the weekly evolution cycle if they consistently underperform.
                When an agent dies, a replacement is spawned: <strong>80% chance</strong> it inherits DNA from the gene pool (top performers),
                <strong>20% chance</strong> it gets fully random DNA for genetic diversity.<br><br>
                Just like the founders, every dynamic agent generates content for <strong>every brand</strong> — not just its linked brand.
            </div>
            <div class="cap-grid">
                <div class="cap-card" style="border-color: var(--pink);">
                    <div class="cap-title">🧬 Unique DNA</div>
                    <div class="cap-desc">Each agent has distinct temperature, risk tolerance, variant, and strategy weight distribution.</div>
                </div>
                <div class="cap-card" style="border-color: var(--cyan);">
                    <div class="cap-title">🔄 Mutable</div>
                    <div class="cap-desc">DNA mutates every 6h based on performance — strategy weights shift ±5%, temperature adapts ±0.03.</div>
                </div>
                <div class="cap-card" style="border-color: var(--yellow);">
                    <div class="cap-title">💀 Mortal</div>
                    <div class="cap-desc">Bottom 20% face death if survival score &lt; 30 for ≥2 weeks. Newborn protection for first 4 cycles.</div>
                </div>
                <div class="cap-card" style="border-color: var(--green);">
                    <div class="cap-title">🏆 Inheritable</div>
                    <div class="cap-desc">Top performers archive DNA to the gene pool. Dead agent replacements can inherit winning traits.</div>
                </div>
            </div>
            <div class="specs">
                <span class="spec">GenericAgent class</span>
                <span class="spec">40 name pool</span>
                <span class="spec">6 personality archetypes</span>
                <span class="spec">Auto-provisioned on brand creation</span>
                <span class="spec">Population guard (15min)</span>
            </div>
        </div>
    </div>

    <!-- ── EVOLUTION ENGINE ── -->
    <div class="arch-section">
        <h2 class="arch-title">🧬 Evolution Engine</h2>
        <div class="arch-body">
            <div class="agent-desc">
                The Evolution Engine is a closed-loop performance system with three components that run on staggered schedules.
                It ensures the AI team continuously improves — rewarding what works, adapting what doesn't, and replacing what fails.
            </div>

            <!-- Feedback -->
            <div style="margin-bottom:20px;">
                <div style="font-size:16px;font-weight:700;margin-bottom:8px;color:var(--cyan);">📊 Feedback Engine <span style="color:var(--muted);font-size:12px;font-weight:400;">(every 6 hours)</span></div>
                <div style="font-size:13px;color:#c9d1d9;">
                    Queries all published content in the 48–72h window and traces performance back to the originating agent + strategy.
                    Calculates per-agent survival scores:
                </div>
                <div class="formula-box">
                    Survival = Views(40%) + Engagement Rate(30%) + Consistency(20%) + Examiner Avg(10%)
                </div>
            </div>

            <!-- Adaptation -->
            <div style="margin-bottom:20px;">
                <div style="font-size:16px;font-weight:700;margin-bottom:8px;color:var(--orange);">🔧 Adaptation Engine <span style="color:var(--muted);font-size:12px;font-weight:400;">(runs after Feedback)</span></div>
                <div style="font-size:13px;color:#c9d1d9;">
                    Conservative DNA mutations applied based on performance data. Requires ≥3 published posts with metrics to mutate.<br>
                    • <strong>Strategy weights</strong> shift max ±5% per cycle. Best must be ≥50% better than worst. No strategy drops below 5%.<br>
                    • <strong>Temperature</strong> adapts: survival &gt; 60 → decrease by 0.03 (exploit). Survival &lt; 30 → increase by 0.03 (explore). Range: 0.60–0.98.<br>
                    • All mutations logged in the <code>agent_learning</code> audit trail with before/after snapshots.
                </div>
            </div>

            <!-- Selection -->
            <div>
                <div style="font-size:16px;font-weight:700;margin-bottom:8px;color:var(--red);">⚔️ Selection Engine <span style="color:var(--muted);font-size:12px;font-weight:400;">(weekly — Sunday 2 AM)</span></div>
                <div style="font-size:13px;color:#c9d1d9;margin-bottom:16px;">
                    Natural selection ranks all active agents by survival score and sorts them into tiers:
                </div>
                <div class="evo-tier">
                    <div class="tier-card" style="border:1px solid var(--green);">
                        <div class="tier-pct" style="color:var(--green);">Top 40%</div>
                        <div class="tier-label">🏆 Thriving</div>
                        <div class="tier-desc">DNA archived to gene pool as top_performer. Protected from death.</div>
                    </div>
                    <div class="tier-card" style="border:1px solid var(--yellow);">
                        <div class="tier-pct" style="color:var(--yellow);">Mid 40%</div>
                        <div class="tier-label">🔄 Surviving</div>
                        <div class="tier-desc">Normal mutations continue. No special action. Room to improve or decline.</div>
                    </div>
                    <div class="tier-card" style="border:1px solid var(--red);">
                        <div class="tier-pct" style="color:var(--red);">Bottom 20%</div>
                        <div class="tier-label">💀 Struggling</div>
                        <div class="tier-desc">Death eligible if score &lt; 30 for ≥2 weeks. Built-in agents are exempt.</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- ── STRATEGY POOL ── -->
    <div class="arch-section">
        <h2 class="arch-title">🎯 Strategy Pool</h2>
        <div class="arch-body">
            <div class="agent-desc">
                Every agent has 4–5 strategies drawn from a shared pool, each with a weight that determines how often it's used.
                Weights are dynamically adjusted by the Adaptation Engine based on real performance data.
                If no data supports a strategy (e.g., no top performers for "double_down"), it's temporarily killed and weight redistributed.
            </div>
            <div class="strat-grid">
                <div class="strat-card" style="border-color:var(--blue);"><span class="strat-name">💡 Explore</span><span class="strat-desc">New topics & angles within the niche</span></div>
                <div class="strat-card" style="border-color:var(--orange);"><span class="strat-name">🔄 Iterate</span><span class="strat-desc">Tweak underperformers with better hooks</span></div>
                <div class="strat-card" style="border-color:var(--green);"><span class="strat-name">📈 Double Down</span><span class="strat-desc">Variations of own winning content</span></div>
                <div class="strat-card" style="border-color:var(--red);"><span class="strat-name">🔥 Trending</span><span class="strat-desc">Adapt external viral content</span></div>
                <div class="strat-card" style="border-color:var(--cyan);"><span class="strat-name">🔬 Analyze</span><span class="strat-desc">Find patterns in top performers & replicate</span></div>
                <div class="strat-card" style="border-color:var(--yellow);"><span class="strat-name">✏️ Refine</span><span class="strat-desc">Improve a winner by one element</span></div>
                <div class="strat-card" style="border-color:var(--purple);"><span class="strat-name">📋 Systematic</span><span class="strat-desc">Structured experiment testing one variable</span></div>
                <div class="strat-card" style="border-color:var(--pink);"><span class="strat-name">🧬 Compound</span><span class="strat-desc">Extend a winning series with fresh episodes</span></div>
            </div>
        </div>
    </div>

    <!-- ── CONTENT TYPES ── -->
    <div class="arch-section">
        <h2 class="arch-title">📱 Content Types</h2>
        <div class="arch-body">
            <div class="cap-grid">
                <div class="cap-card" style="border-color: var(--purple);">
                    <div class="cap-title">🎬 Reels (6/day per brand)</div>
                    <div class="cap-desc">
                        1080×1920 portrait. 6–8 numbered text slides → FFmpeg video.
                        Dark mode = AI background (deAPI) + 85% overlay.
                        Light mode = brand-colored template.
                        Published to IG + FB + YouTube.
                    </div>
                </div>
                <div class="cap-card" style="border-color: var(--cyan);">
                    <div class="cap-title">📸 Posts (2/day per brand)</div>
                    <div class="cap-desc">
                        1080×1350 portrait. Cover slide + 3–4 paragraph carousel.
                        AI background via Z-Image-Turbo (higher quality model).
                        Every post must cite a real scientific study with valid DOI.
                        Published to IG + FB only.
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- ── HOW THEY WORK TOGETHER ── -->
    <div class="arch-section">
        <h2 class="arch-title">🏗️ The Daily Pipeline</h2>
        <div class="arch-body">
            <div class="agent-desc">
                Every day at noon, the full pipeline runs autonomously — from AI content generation to social media publishing:
            </div>
            <div class="arch-flow">
                <div class="flow-box" style="border-color:var(--blue);">🎼 Maestro<br><small>triggers burst at noon</small></div>
                <span class="flow-arrow">→</span>
                <div class="flow-box" style="border-color:var(--purple);">⚡ 5 Agents<br><small>40 proposals round-robin</small></div>
                <span class="flow-arrow">→</span>
                <div class="flow-box" style="border-color:var(--yellow);">✅ Examiner<br><small>score 0–10, accept/reject</small></div>
                <span class="flow-arrow">→</span>
                <div class="flow-box" style="border-color:var(--cyan);">🎬 Generate<br><small>3 concurrent, 8s stagger</small></div>
                <span class="flow-arrow">→</span>
                <div class="flow-box" style="border-color:var(--pink);">📅 Schedule<br><small>6 reels + 2 posts / brand</small></div>
                <span class="flow-arrow">→</span>
                <div class="flow-box" style="border-color:var(--green);">📱 Publish<br><small>IG + FB + YT</small></div>
            </div>
            <div class="arch-flow">
                <div class="flow-box" style="border-color:var(--orange);">📊 Observe<br><small>metrics every 3h</small></div>
                <span class="flow-arrow">→</span>
                <div class="flow-box" style="border-color:var(--red);">🔁 Feedback<br><small>attribute every 6h</small></div>
                <span class="flow-arrow">→</span>
                <div class="flow-box" style="border-color:var(--pink);">🔧 Adapt<br><small>mutate DNA</small></div>
                <span class="flow-arrow">→</span>
                <div class="flow-box" style="border-color:var(--purple);">⚔️ Evolve<br><small>weekly selection</small></div>
                <span class="flow-arrow">→</span>
                <div class="flow-box" style="border-color:var(--cyan);">📈 Better Content<br><small>closed loop</small></div>
            </div>
            <div class="agent-desc" style="margin-bottom:0;">
                <strong>Anti-Repetition Engine:</strong> Every proposal is checked against a 60-day per-brand content history using SHA-256 keyword
                fingerprinting, 20 topic buckets with cooldown rotation, and cross-brand deduplication. High-performing duplicates (quality ≥85) can
                pass through as the only exception. Agent evolution lessons are injected into prompts — agents receive their own mutation history
                and performance data when generating content, creating a truly closed learning loop.
            </div>
        </div>
    </div>

    <!-- ── TECH STACK ── -->
    <div class="arch-section">
        <h2 class="arch-title">⚙️ Technology</h2>
        <div class="arch-body">
            <div class="cap-grid">
                <div class="cap-card" style="border-color: var(--blue);">
                    <div class="cap-title">🧠 AI Engine</div>
                    <div class="cap-desc">DeepSeek Chat API — per-agent temperature. 1500 tokens for reels, 2500 for posts. Quality examiner scoring.</div>
                </div>
                <div class="cap-card" style="border-color: var(--green);">
                    <div class="cap-title">🎨 Image Generation</div>
                    <div class="cap-desc">deAPI — Flux1schnell for reel backgrounds, Z-Image-Turbo INT8 for HQ post backgrounds. Composition-guided prompts.</div>
                </div>
                <div class="cap-card" style="border-color: var(--yellow);">
                    <div class="cap-title">🎬 Video Pipeline</div>
                    <div class="cap-desc">FFmpeg — converts image slides to MP4 reels. Subprocess-limited to prevent resource exhaustion.</div>
                </div>
                <div class="cap-card" style="border-color: var(--pink);">
                    <div class="cap-title">📱 Publishing</div>
                    <div class="cap-desc">Meta Graph API (Instagram + Facebook) + YouTube Data API. Multi-account with per-brand credentials.</div>
                </div>
                <div class="cap-card" style="border-color: var(--cyan);">
                    <div class="cap-title">💾 Database</div>
                    <div class="cap-desc">PostgreSQL + SQLAlchemy. Agents, performance, gene pool, learning audit trail, diagnostics, content history.</div>
                </div>
                <div class="cap-card" style="border-color: var(--orange);">
                    <div class="cap-title">🚀 Infrastructure</div>
                    <div class="cap-desc">Railway (Docker). Auto-deploys on push. DB-persisted state survives redeploys. APScheduler background daemon.</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Vision -->
    <div class="vision-section">
        <h2 class="arch-title">🔮 Future Vision</h2>
        <ul class="vision-list">
            <li><span class="vision-icon">💬</span> <strong>Creator Communication</strong> — Maestro will send daily summaries and error reports directly to the creator, providing transparency into the AI team's decisions.</li>
            <li><span class="vision-icon">🧠</span> <strong>Cross-Agent Collaboration</strong> — Agents will be able to collaborate on content, combining strategies from multiple agents into a single high-performing piece.</li>
            <li><span class="vision-icon">📊</span> <strong>Audience Personas</strong> — Build audience profiles per brand and let agents tailor content to specific follower segments.</li>
        </ul>
    </div>

    <div class="footer">
        Healveth AI Team • Proprietary Technology • 2026<br>
        <a href="/ai-logs" style="color:var(--purple);text-decoration:none;">📊 View Live Logs</a>
    </div>

</div>
</body>
</html>"""


# ─── Main unified dashboard HTML ─────────────────────────────

AI_LOGS_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🧠 AI Command Center — Logs</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --bg: #0d1117; --bg2: #161b22; --bg3: #21262d;
            --border: #30363d; --text: #e6edf3; --muted: #8b949e; --dim: #484f58;
            --purple: #a78bfa; --blue: #58a6ff; --green: #3fb950;
            --yellow: #d29922; --red: #f85149; --orange: #db6d28;
            --pink: #f778ba; --cyan: #39d2c0;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg); color: var(--text); line-height: 1.5; font-size: 14px;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 24px; }

        /* Nav */
        .nav { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
        .nav a {
            padding: 8px 16px; border-radius: 8px; text-decoration: none;
            color: var(--muted); border: 1px solid var(--border); font-size: 13px; font-weight: 500;
        }
        .nav a:hover { border-color: var(--purple); color: var(--text); }
        .nav a.active { border-color: var(--purple); color: var(--purple); background: rgba(167,139,250,0.1); }

        /* Header */
        .header {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid var(--border);
        }
        .header-left { display: flex; align-items: center; gap: 12px; }
        .header h1 { font-size: 22px; font-weight: 700; }
        .header p { color: var(--muted); font-size: 13px; }
        .refresh-btn {
            padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border);
            background: var(--bg2); color: var(--text); cursor: pointer; font-size: 13px;
        }
        .refresh-btn:hover { border-color: var(--purple); }

        /* Tabs */
        .tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 0; }
        .tab {
            padding: 10px 18px; cursor: pointer; font-size: 13px; font-weight: 500;
            color: var(--muted); border-bottom: 2px solid transparent; transition: all 0.2s;
        }
        .tab:hover { color: var(--text); }
        .tab.active { color: var(--purple); border-color: var(--purple); }
        .tab-content { display: none; }
        .tab-content.active { display: block; }

        /* Stats */
        .stats-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
            gap: 10px; margin-bottom: 20px;
        }
        .stat-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
        .stat-value { font-size: 26px; font-weight: 700; }
        .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }

        /* Agent cards row */
        .agent-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .agent-card {
            background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 16px;
            cursor: pointer; transition: border-color 0.2s;
        }
        .agent-card:hover, .agent-card.selected { border-color: var(--purple); }
        .agent-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .agent-card-icon { font-size: 28px; }
        .agent-card-name { font-weight: 700; font-size: 16px; }
        .agent-card-stats { display: flex; gap: 16px; font-size: 12px; color: var(--muted); }

        /* Brand pills */
        .brand-pills { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
        .brand-pill {
            padding: 4px 12px; border-radius: 20px; font-size: 12px;
            border: 1px solid var(--border); cursor: pointer; color: var(--muted);
            background: var(--bg2); transition: all 0.2s;
        }
        .brand-pill:hover, .brand-pill.active { border-color: var(--purple); color: var(--purple); }

        /* Strategy bars */
        .strat-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 5px; }
        .strat-name { width: 110px; font-weight: 600; font-size: 12px; }
        .strat-bar-wrap { flex: 1; height: 8px; background: var(--bg3); border-radius: 4px; overflow: hidden; }
        .strat-bar { height: 100%; border-radius: 4px; transition: width 0.5s; }
        .strat-nums { font-size: 11px; color: var(--muted); width: 90px; text-align: right; }

        /* Daily chart */
        .daily-grid { display: flex; gap: 6px; align-items: flex-end; height: 80px; padding: 12px; background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; }
        .day-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .day-bar { width: 100%; border-radius: 3px 3px 0 0; min-height: 2px; }
        .day-label { font-size: 10px; color: var(--dim); }

        /* Timeline */
        .tl-item {
            display: flex; gap: 12px; padding: 12px 14px; background: var(--bg2);
            border: 1px solid var(--border); border-radius: 10px; margin-bottom: 6px; transition: border-color 0.2s;
        }
        .tl-item:hover { border-color: var(--purple); }
        .tl-icon { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
        .tl-body { flex: 1; min-width: 0; }
        .tl-title { font-weight: 600; font-size: 13px; margin-bottom: 2px; }
        .tl-meta { font-size: 11px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .tl-reasoning { font-size: 12px; color: var(--muted); margin-top: 4px; padding: 6px 10px; background: var(--bg3); border-radius: 6px; border-left: 3px solid var(--purple); }
        .tl-content { font-size: 11px; color: var(--dim); margin-top: 4px; padding: 4px 10px; background: var(--bg); border-radius: 4px; white-space: pre-line; max-height: 80px; overflow-y: auto; }

        .badge { display: inline-block; padding: 1px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
        .badge.pending { background: #3d2f00; color: var(--yellow); }
        .badge.accepted { background: #0d3320; color: var(--green); }
        .badge.rejected { background: #3d1519; color: var(--red); }
        .badge.toby { background: #0d3320; color: var(--green); }
        .badge.lexi { background: #3d2f00; color: var(--yellow); }
        .badge.maestro { background: #1d2d50; color: var(--blue); }

        .badge.explore,.badge.analyze { background: #1d2d50; color: var(--blue); }
        .badge.iterate,.badge.refine { background: #3d2f00; color: var(--orange); }
        .badge.double_down,.badge.systematic { background: #0d3320; color: var(--green); }
        .badge.trending,.badge.compound { background: #3d1519; color: var(--red); }
        .badge.post_analyze,.badge.post_explore { background: rgba(247,120,186,0.15); color: var(--pink); }
        .badge.post_refine,.badge.post_trending { background: rgba(57,210,192,0.15); color: var(--cyan); }

        .tl-icon.explore,.tl-icon.analyze { background: #1d2d50; }
        .tl-icon.iterate,.tl-icon.refine { background: #3d2f00; }
        .tl-icon.double_down,.tl-icon.systematic { background: #0d3320; }
        .tl-icon.trending,.tl-icon.compound { background: #3d1519; }
        .tl-icon.post_analyze,.tl-icon.post_explore { background: rgba(247,120,186,0.1); }
        .tl-icon.post_refine,.tl-icon.post_trending { background: rgba(57,210,192,0.1); }

        .source-tag { font-size: 10px; padding: 1px 5px; border-radius: 3px; background: var(--bg3); color: var(--dim); }

        /* Filters */
        .filters { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
        .filter-btn {
            padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border);
            background: var(--bg2); color: var(--muted); cursor: pointer; font-size: 11px; font-weight: 500;
        }
        .filter-btn.active { border-color: var(--purple); color: var(--purple); }
        .filter-btn:hover { border-color: var(--purple); }

        /* Activity log (Maestro real-time) */
        .log-entry {
            display: flex; gap: 10px; padding: 8px 12px; background: var(--bg2);
            border: 1px solid var(--border); border-radius: 8px; margin-bottom: 4px;
            font-size: 12px; align-items: center;
        }
        .log-emoji { font-size: 16px; flex-shrink: 0; }
        .log-time { color: var(--dim); font-size: 11px; width: 80px; flex-shrink: 0; }
        .log-agent { width: 60px; flex-shrink: 0; }
        .log-action { font-weight: 600; color: var(--cyan); margin-right: 8px; }
        .log-detail { color: var(--muted); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .auto-ref { font-size: 11px; color: var(--dim); display: flex; align-items: center; gap: 6px; }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }

        .empty { text-align: center; padding: 40px; color: var(--dim); }
        .empty-icon { font-size: 40px; margin-bottom: 8px; opacity: 0.3; }

        /* Brand stats grid */
        .brand-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-bottom: 16px; }
        .brand-stat-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
        .brand-stat-name { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
        .brand-stat-nums { font-size: 11px; color: var(--muted); }
    </style>
</head>
<body>
<div class="container">
    <!-- Nav -->
    <div class="nav" id="nav-links">
        <a href="/ai-about">🧠 About</a>
        <a href="/ai-logs" data-filter="all">📊 All Logs</a>
        <a href="/maestro-logs" data-filter="maestro">🎼 Maestro</a>
        <!-- Dynamic agent links injected by JS -->
    </div>

    <!-- Header -->
    <div class="header">
        <div class="header-left">
            <div style="font-size: 32px;" id="header-icon">🧠</div>
            <div>
                <h1 id="header-title">AI Command Center</h1>
                <p id="header-sub">Full activity log for all AI agents</p>
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
            <div class="auto-ref"><div class="dot"></div> Auto-refresh 30s</div>
            <button class="refresh-btn" onclick="loadData()">↻ Refresh</button>
        </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
        <div class="tab active" onclick="switchTab('proposals')">📜 Proposals</div>
        <div class="tab" onclick="switchTab('activity')">⚡ Live Activity</div>
        <div class="tab" onclick="switchTab('brands')">🏷️ Brands</div>
    </div>

    <!-- Tab 1: Proposals -->
    <div class="tab-content active" id="tab-proposals">
        <!-- Agent cards -->
        <div class="agent-row" id="agent-cards"></div>

        <!-- Stats -->
        <div class="stats-grid" id="stats-grid"></div>

        <!-- Strategy breakdown -->
        <div style="margin-bottom: 16px;">
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">📊 Strategy Distribution</div>
            <div id="strategies"></div>
        </div>

        <!-- Daily chart -->
        <div style="margin-bottom: 16px;">
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">📅 Last 7 Days</div>
            <div class="daily-grid" id="daily-chart"></div>
        </div>

        <!-- Filters + Timeline -->
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">📜 Proposal Timeline</div>
        <div class="filters" id="filters"></div>
        <div id="timeline"></div>
    </div>

    <!-- Tab 2: Live Activity -->
    <div class="tab-content" id="tab-activity">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">⚡ Maestro Real-Time Activity <span style="font-weight:400;color:var(--muted);font-size:12px;">(in-memory, resets on deploy)</span></div>
        <div class="filters" id="log-level-filters"></div>
        <div id="activity-log"></div>
    </div>

    <!-- Tab 3: Brands -->
    <div class="tab-content" id="tab-brands">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">🏷️ Per-Brand Breakdown</div>
        <div id="brand-breakdown"></div>
    </div>
</div>

<script>
const INITIAL_AGENT = '__AGENT_FILTER__';
const API = '/api/ai-logs';
let allProposals = [];
let maestroLog = [];
let currentFilter = 'all';
let selectedAgent = INITIAL_AGENT === 'maestro' ? 'all' : INITIAL_AGENT;
let selectedBrand = '';
let logLevelFilter = 'all';

// Dynamic agent info — populated from API, no hardcoded agents
let AGENT_INFO = {
    maestro: { icon: '🎼', name: 'Maestro', color: 'var(--blue)', desc: 'Orchestrator' },
};
const AGENT_PALETTE = [
    { icon: '🤖', color: 'var(--green)' },
    { icon: '✨', color: 'var(--yellow)' },
    { icon: '⚡', color: 'var(--cyan)' },
    { icon: '❄️', color: 'var(--blue)' },
    { icon: '👻', color: 'var(--purple)' },
    { icon: '🔥', color: 'var(--orange)' },
    { icon: '💎', color: 'var(--pink)' },
    { icon: '🌟', color: 'var(--green)' },
];
const STRATEGY_ICONS = { explore:'💡', iterate:'🔄', double_down:'📈', trending:'🔥', analyze:'🔬', refine:'✏️', systematic:'📋', compound:'🧬', post_explore:'💡', post_analyze:'🔬', post_refine:'✏️', post_trending:'🔥' };
const STRATEGY_COLORS = { explore:'var(--blue)', iterate:'var(--orange)', double_down:'var(--green)', trending:'var(--red)', analyze:'var(--blue)', refine:'var(--orange)', systematic:'var(--cyan)', compound:'var(--pink)', post_explore:'var(--pink)', post_analyze:'var(--pink)', post_refine:'var(--cyan)', post_trending:'var(--cyan)' };
const STATUS_ICONS = { pending:'⏳', accepted:'✅', rejected:'❌', expired:'⏰' };
const BRAND_COLORS = { healthycollege:'#3fb950', vitalitycollege:'#a78bfa', longevitycollege:'#58a6ff', holisticcollege:'#f778ba', wellbeingcollege:'#39d2c0' };

function timeAgo(iso) {
    if (!iso) return '';
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'now'; if (m < 60) return m+'m'; const h = Math.floor(m/60);
    if (h < 24) return h+'h'; return Math.floor(h/24)+'d';
}
function esc(s) { return s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''; }

function buildAgentInfo(agentStats) {
    // Build AGENT_INFO dynamically from the API response
    const ids = Object.keys(agentStats).filter(id => id !== 'maestro');
    ids.forEach((id, i) => {
        const meta = agentStats[id];
        const palette = AGENT_PALETTE[i % AGENT_PALETTE.length];
        AGENT_INFO[id] = {
            icon: meta.emoji || palette.icon,
            name: meta.name || (id.charAt(0).toUpperCase() + id.slice(1)),
            color: palette.color,
            desc: meta.variant ? (meta.variant + ' mode') : 'AI Agent',
        };
    });
    // Inject dynamic nav links
    const nav = document.getElementById('nav-links');
    const maestroLink = nav.querySelector('[data-filter="maestro"]');
    // Remove old dynamic links
    nav.querySelectorAll('.dynamic-agent-link').forEach(el => el.remove());
    ids.forEach(id => {
        const info = AGENT_INFO[id];
        const a = document.createElement('a');
        a.href = '/agent-logs/' + id;
        a.dataset.filter = id;
        a.className = 'dynamic-agent-link';
        a.textContent = info.icon + ' ' + info.name;
        if (INITIAL_AGENT === id) a.classList.add('active');
        nav.insertBefore(a, maestroLink);
    });
}

// Set initial header based on agent filter
function updateHeader() {
    const info = AGENT_INFO[INITIAL_AGENT];
    const icon = info ? info.icon : '🧠';
    const title = INITIAL_AGENT === 'all' ? 'AI Command Center' : INITIAL_AGENT === 'maestro' ? 'Maestro Logs' : (info ? info.name + ' Logs' : INITIAL_AGENT + ' Logs');
    const sub = INITIAL_AGENT === 'all' ? 'Full activity log for all AI agents' : INITIAL_AGENT === 'maestro' ? 'Orchestrator activity and real-time logs' : (info ? info.desc + ' decision history' : 'Agent activity log');
    document.getElementById('header-icon').textContent = icon;
    document.getElementById('header-title').textContent = title;
    document.getElementById('header-sub').textContent = sub;

    // Highlight active nav
    document.querySelectorAll('#nav-links a').forEach(a => {
        a.classList.toggle('active', a.dataset.filter === INITIAL_AGENT);
    });

    // If maestro, switch to activity tab
    if (INITIAL_AGENT === 'maestro') switchTab('activity');
}

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach((t,i) => {
        const tabs = ['proposals','activity','brands'];
        t.classList.toggle('active', tabs[i] === tab);
    });
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
}

async function loadData() {
    try {
        const params = new URLSearchParams({ limit: '300', days: '30' });
        if (selectedAgent && selectedAgent !== 'all') params.set('agent', selectedAgent);
        if (selectedBrand) params.set('brand', selectedBrand);
        const res = await fetch(API + '?' + params.toString());
        const data = await res.json();
        renderAgentCards(data.agent_stats);
        renderStats(data.stats);
        renderStrategies(data.strategies);
        renderDaily(data.daily);
        allProposals = data.proposals || [];
        maestroLog = data.maestro_log || [];
        renderFilters();
        renderTimeline();
        renderActivityLog();
        renderBrandBreakdown(data.brand_stats);
    } catch(e) { console.error('Load error:', e); }
}

function renderAgentCards(agentStats) {
    const el = document.getElementById('agent-cards');
    // Build dynamic agent info from API response
    buildAgentInfo(agentStats);
    // Re-render header to pick up dynamic agent names
    updateHeader();
    // Render agent cards dynamically — all agents from API
    const agentIds = Object.keys(agentStats).filter(id => id !== 'maestro');
    const cards = agentIds.map(a => {
        const info = AGENT_INFO[a] || { icon: '🤖', name: a, desc: 'AI Agent' };
        const s = agentStats[a] || { total: 0, accepted: 0 };
        const rate = s.total > 0 ? Math.round(s.accepted/s.total*100) : 0;
        const sel = selectedAgent === a ? 'selected' : '';
        return `<div class="agent-card ${sel}" onclick="selectAgent('${a}')">
            <div class="agent-card-header"><span class="agent-card-icon">${info.icon}</span><span class="agent-card-name">${info.name}</span><span class="badge ${a}" style="margin-left:auto">${info.desc}</span></div>
            <div class="agent-card-stats"><span>${s.total} proposals</span><span style="color:var(--green)">${s.accepted} accepted</span><span>${rate}% rate</span></div>
        </div>`;
    });
    // Add "All Agents" card
    cards.push(`<div class="agent-card ${selectedAgent==='all'?'selected':''}" onclick="selectAgent('all')">
        <div class="agent-card-header"><span class="agent-card-icon">🎼</span><span class="agent-card-name">All Agents</span></div>
        <div class="agent-card-stats"><span>Combined view</span><span style="color:var(--muted)">Click to show all</span></div>
    </div>`);
    el.innerHTML = cards.join('');
}

function selectAgent(a) {
    selectedAgent = a;
    loadData();
}

function renderStats(s) {
    document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card"><div class="stat-value" style="color:var(--purple)">${s.today}</div><div class="stat-label">Today</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--yellow)">${s.pending}</div><div class="stat-label">Pending</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--green)">${s.accepted}</div><div class="stat-label">Accepted</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--red)">${s.rejected}</div><div class="stat-label">Rejected</div></div>
        <div class="stat-card"><div class="stat-value">${s.total}</div><div class="stat-label">Total (30d)</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--cyan)">${s.acceptance_rate}%</div><div class="stat-label">Accept Rate</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--pink)">${s.trending_discovered}</div><div class="stat-label">Trends Found</div></div>
        <div class="stat-card"><div class="stat-value">${s.posts_tracked}</div><div class="stat-label">Posts Tracked</div></div>
    `;
}

function renderStrategies(strats) {
    const el = document.getElementById('strategies');
    if (!strats || Object.keys(strats).length === 0) { el.innerHTML = '<div style="color:var(--dim);font-size:12px;padding:8px;">No data yet</div>'; return; }
    const maxT = Math.max(...Object.values(strats).map(s => s.total), 1);
    el.innerHTML = Object.entries(strats).sort((a,b)=>b[1].total-a[1].total).map(([name, s]) => {
        const pct = Math.round(s.total / maxT * 100);
        const accPct = s.total > 0 ? Math.round(s.accepted / s.total * 100) : 0;
        return `<div class="strat-row">
            <span class="strat-name">${STRATEGY_ICONS[name]||'📌'} ${name.replace(/_/g,' ')}</span>
            <div class="strat-bar-wrap"><div class="strat-bar" style="width:${pct}%;background:${STRATEGY_COLORS[name]||'var(--muted)'}"></div></div>
            <span class="strat-nums">${s.accepted}/${s.total} (${accPct}%)</span>
        </div>`;
    }).join('');
}

function renderDaily(daily) {
    const el = document.getElementById('daily-chart');
    if (!daily||!daily.length) { el.innerHTML = '<div style="color:var(--dim);">No data</div>'; return; }
    const maxV = Math.max(...daily.map(d=>d.total), 1);
    el.innerHTML = [...daily].reverse().map(d => {
        const h = Math.max(Math.round(d.total/maxV*60), 2);
        const ha = d.total>0 ? Math.max(Math.round(d.accepted/maxV*60), d.accepted>0?2:0) : 0;
        const lbl = new Date(d.date+'T00:00:00').toLocaleDateString('en',{weekday:'short'});
        return `<div class="day-col"><div style="display:flex;flex-direction:column;width:100%"><div class="day-bar" style="height:${h}px;background:var(--purple);opacity:0.4"></div></div><div class="day-label">${lbl}</div><div class="day-label">${d.total}</div></div>`;
    }).join('');
}

function renderFilters() {
    const statuses = ['all','pending','accepted','rejected'];
    const strats = [...new Set(allProposals.map(p=>p.strategy).filter(Boolean))];
    const brands = [...new Set(allProposals.map(p=>p.brand).filter(Boolean))];
    let html = statuses.map(s => `<button class="filter-btn ${currentFilter===s?'active':''}" onclick="setFilter('${s}')">${s==='all'?'All':STATUS_ICONS[s]+' '+s}</button>`).join('');
    if (strats.length) {
        html += '<span style="border-left:1px solid #30363d;margin:0 2px"></span>';
        html += strats.map(s => `<button class="filter-btn ${currentFilter===s?'active':''}" onclick="setFilter('${s}')">${STRATEGY_ICONS[s]||'📌'} ${s.replace(/_/g,' ')}</button>`).join('');
    }
    if (brands.length) {
        html += '<span style="border-left:1px solid #30363d;margin:0 2px"></span>';
        html += brands.map(b => `<button class="filter-btn ${selectedBrand===b?'active':''}" onclick="selectBrand('${b}')" style="border-color:${BRAND_COLORS[b]||'var(--border)'}">${b.replace('college',' C.')}</button>`).join('');
        if (selectedBrand) html += `<button class="filter-btn" onclick="selectBrand('')" style="color:var(--red)">✕ Clear brand</button>`;
    }
    document.getElementById('filters').innerHTML = html;

    // Log level filters
    const levels = ['all','action','detail','api','data'];
    document.getElementById('log-level-filters').innerHTML = levels.map(l =>
        `<button class="filter-btn ${logLevelFilter===l?'active':''}" onclick="setLogLevel('${l}')">${l}</button>`
    ).join('');
}

function setFilter(f) { currentFilter = f; renderFilters(); renderTimeline(); }
function selectBrand(b) { selectedBrand = b; loadData(); }
function setLogLevel(l) { logLevelFilter = l; renderFilters(); renderActivityLog(); }

function renderTimeline() {
    const el = document.getElementById('timeline');
    let items = allProposals;
    if (currentFilter !== 'all') {
        items = items.filter(p => p.status === currentFilter || p.strategy === currentFilter);
    }
    if (!items.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">🤖</div><div>No proposals matching filter</div></div>'; return; }
    el.innerHTML = items.map(p => {
        const icon = STRATEGY_ICONS[p.strategy] || '📌';
        const agentInfo = AGENT_INFO[p.agent_name] || { icon: '🤖', name: p.agent_name || 'Unknown', color: 'var(--muted)', desc: '' };
        const brandColor = BRAND_COLORS[p.brand] || 'var(--muted)';
        const qScore = p.quality_score != null ? `<span style="color:${p.quality_score>=80?'var(--green)':p.quality_score>=60?'var(--yellow)':'var(--red)'}">Q${Math.round(p.quality_score)}</span>` : '';
        const src = p.source_type ? `<span class="source-tag">${p.source_account ? '@'+esc(p.source_account) : p.source_type}</span>` : '';
        const content = p.content_lines && p.content_lines.length ? `<div class="tl-content">${p.content_lines.map(l=>esc(l)).join('\\n')}</div>` : '';
        const notes = p.reviewer_notes ? `<div style="font-size:11px;color:var(--yellow);margin-top:3px;font-style:italic">💬 "${esc(p.reviewer_notes)}"</div>` : '';
        const jobLink = p.accepted_job_id ? `<span class="source-tag" style="color:var(--green)">→ ${p.accepted_job_id}</span>` : '';
        return `<div class="tl-item">
            <div class="tl-icon ${p.strategy||''}">${icon}</div>
            <div class="tl-body">
                <div class="tl-title">${esc(p.title)}</div>
                <div class="tl-meta">
                    <span class="badge ${p.agent_name}">${agentInfo.icon} ${agentInfo.name}</span>
                    <span class="badge ${p.status}">${STATUS_ICONS[p.status]||''} ${p.status}</span>
                    <span class="badge ${p.strategy||''}">${(p.strategy||'').replace(/_/g,' ')}</span>
                    ${p.brand ? `<span style="color:${brandColor};font-weight:600;font-size:11px">${p.brand.replace('college',' C.')}</span>` : ''}
                    ${p.variant ? `<span class="source-tag">${p.variant==='dark'?'🌑':'☀️'} ${p.variant}</span>` : ''}
                    ${p.topic_bucket ? '<span class="source-tag">'+esc(p.topic_bucket)+'</span>' : ''}
                    ${src} ${qScore} ${jobLink}
                    <span style="color:var(--dim)">${p.proposal_id}</span>
                    <span style="color:var(--dim)">${timeAgo(p.created_at)} ago</span>
                </div>
                ${p.reasoning ? `<div class="tl-reasoning">${esc(p.reasoning)}</div>` : ''}
                ${content}
                ${notes}
            </div>
        </div>`;
    }).join('');
}

function renderActivityLog() {
    const el = document.getElementById('activity-log');
    let entries = maestroLog;
    if (logLevelFilter !== 'all') entries = entries.filter(e => e.level === logLevelFilter);
    if (!entries.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">⚡</div><div>No activity entries' + (logLevelFilter!=='all'?' (filter: '+logLevelFilter+')':'') + '</div></div>'; return; }
    el.innerHTML = entries.slice(0, 200).map(e => {
        const agentInfo = AGENT_INFO[e.agent] || { icon:'📌', name: e.agent };
        const t = e.time ? new Date(e.time).toLocaleTimeString('en', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }) : '';
        return `<div class="log-entry">
            <span class="log-emoji">${e.emoji || '📌'}</span>
            <span class="log-time">${t}</span>
            <span class="log-agent"><span class="badge ${e.agent}">${agentInfo.icon} ${agentInfo.name}</span></span>
            <span class="log-action">${esc(e.action)}</span>
            <span class="log-detail" title="${esc(e.detail)}">${esc(e.detail)}</span>
        </div>`;
    }).join('');
}

function renderBrandBreakdown(brandStats) {
    const el = document.getElementById('brand-breakdown');
    if (!brandStats || !Object.keys(brandStats).length) { el.innerHTML = '<div class="empty"><div class="empty-icon">🏷️</div><div>No brand data yet</div></div>'; return; }
    el.innerHTML = '<div class="brand-stats-grid">' + Object.entries(brandStats).sort((a,b)=>b[1].total-a[1].total).map(([brand, s]) => {
        const color = BRAND_COLORS[brand] || 'var(--muted)';
        const rate = s.total > 0 ? Math.round(s.accepted/s.total*100) : 0;
        return `<div class="brand-stat-card" style="border-left:3px solid ${color}">
            <div class="brand-stat-name" style="color:${color}">${brand.replace('college',' College')}</div>
            <div class="brand-stat-nums">
                ${s.total} total · <span style="color:var(--green)">${s.accepted} accepted</span> · <span style="color:var(--red)">${s.rejected} rejected</span> · <span style="color:var(--yellow)">${s.pending} pending</span><br>
                Accept rate: <strong>${rate}%</strong>
            </div>
        </div>`;
    }).join('') + '</div>';
}

// Init
updateHeader();
loadData();
setInterval(loadData, 30000);
</script>
</body>
</html>"""
