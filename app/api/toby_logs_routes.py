"""
Toby Logs — Activity dashboard for the AI content strategist.

Provides:
- GET /toby-logs          → HTML dashboard (password-protected)
- GET /api/toby-logs      → JSON API for Toby activity log

Shows:
- Real-time proposals timeline (created, accepted, rejected)
- Strategy distribution and acceptance rates
- Intelligence gathering results
- Trending content discovery log
- Performance metrics collection log
"""
import os
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Query, Cookie
from fastapi.responses import HTMLResponse
from sqlalchemy import desc, func

from app.db_connection import SessionLocal
from app.models import TobyProposal, TrendingContent, PostPerformance

router = APIRouter(tags=["toby-logs"])

LOGS_PASSWORD = os.getenv("LOGS_PASSWORD", "logs12345@")


# ─── JSON API ────────────────────────────────────────────────

@router.get("/api/toby-logs", summary="Toby activity log (JSON)")
def get_toby_logs(
    limit: int = Query(100, ge=1, le=500),
    status: Optional[str] = Query(None),
    strategy: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
):
    """Full activity log for Toby — proposals, trending, metrics."""
    db = SessionLocal()
    try:
        since = datetime.utcnow() - timedelta(days=days)

        # ── Proposals ──
        q = db.query(TobyProposal).filter(TobyProposal.created_at >= since)
        if status:
            q = q.filter(TobyProposal.status == status)
        if strategy:
            q = q.filter(TobyProposal.strategy == strategy)
        proposals = q.order_by(desc(TobyProposal.created_at)).limit(limit).all()

        # ── Stats ──
        total = db.query(func.count(TobyProposal.id)).filter(TobyProposal.created_at >= since).scalar() or 0
        accepted = db.query(func.count(TobyProposal.id)).filter(
            TobyProposal.created_at >= since, TobyProposal.status == "accepted"
        ).scalar() or 0
        rejected = db.query(func.count(TobyProposal.id)).filter(
            TobyProposal.created_at >= since, TobyProposal.status == "rejected"
        ).scalar() or 0
        pending = db.query(func.count(TobyProposal.id)).filter(
            TobyProposal.created_at >= since, TobyProposal.status == "pending"
        ).scalar() or 0

        # Strategy breakdown
        strat_rows = (
            db.query(TobyProposal.strategy, TobyProposal.status, func.count(TobyProposal.id))
            .filter(TobyProposal.created_at >= since)
            .group_by(TobyProposal.strategy, TobyProposal.status)
            .all()
        )
        strategies = {}
        for s, st, c in strat_rows:
            if s not in strategies:
                strategies[s] = {"total": 0, "accepted": 0, "rejected": 0, "pending": 0}
            strategies[s]["total"] += c
            if st in strategies[s]:
                strategies[s][st] += c

        # ── Trending content ──
        trending_count = db.query(func.count(TrendingContent.id)).filter(
            TrendingContent.discovered_at >= since
        ).scalar() or 0
        trending_used = db.query(func.count(TrendingContent.id)).filter(
            TrendingContent.discovered_at >= since,
            TrendingContent.used_for_proposal == True
        ).scalar() or 0

        # ── Performance tracking ──
        perf_count = db.query(func.count(PostPerformance.id)).scalar() or 0

        # ── Today's activity ──
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_proposals = db.query(func.count(TobyProposal.id)).filter(
            TobyProposal.created_at >= today_start
        ).scalar() or 0

        # Daily breakdown (last 7 days)
        daily = []
        for d in range(7):
            day_start = (datetime.utcnow() - timedelta(days=d)).replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            day_total = db.query(func.count(TobyProposal.id)).filter(
                TobyProposal.created_at >= day_start,
                TobyProposal.created_at < day_end,
            ).scalar() or 0
            day_accepted = db.query(func.count(TobyProposal.id)).filter(
                TobyProposal.created_at >= day_start,
                TobyProposal.created_at < day_end,
                TobyProposal.status == "accepted",
            ).scalar() or 0
            daily.append({
                "date": day_start.strftime("%Y-%m-%d"),
                "total": day_total,
                "accepted": day_accepted,
            })

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
            "strategies": strategies,
            "daily": daily,
            "proposals": [
                {
                    "proposal_id": p.proposal_id,
                    "status": p.status,
                    "strategy": p.strategy,
                    "title": p.title,
                    "reasoning": p.reasoning,
                    "topic_bucket": p.topic_bucket,
                    "quality_score": p.quality_score,
                    "source_type": p.source_type,
                    "source_title": p.source_title,
                    "source_account": p.source_account,
                    "reviewer_notes": p.reviewer_notes,
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                    "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
                }
                for p in proposals
            ],
        }
    finally:
        db.close()


# ─── HTML DASHBOARD ──────────────────────────────────────────

@router.get("/toby-logs", response_class=HTMLResponse, summary="Toby activity dashboard")
def toby_logs_dashboard(logs_token: Optional[str] = Cookie(None), pwd: Optional[str] = Query(None)):
    """
    Toby activity dashboard — password-protected.
    Access via: /toby-logs?pwd=<password>
    """
    expected = os.getenv("LOGS_PASSWORD", LOGS_PASSWORD)

    if pwd == expected:
        response = HTMLResponse(content=TOBY_LOGS_HTML)
        response.set_cookie("logs_token", expected, max_age=60*60*24*30, httponly=True, samesite="lax")
        return response

    if logs_token == expected:
        return HTMLResponse(content=TOBY_LOGS_HTML)

    return HTMLResponse(content=TOBY_LOGIN_HTML)


# ─── Login page ──────────────────────────────────────────────

TOBY_LOGIN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🤖 Toby Logs — Access</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #e6edf3;
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
            color: #e6edf3; font-size: 14px; margin-bottom: 16px;
            outline: none;
        }
        input:focus { border-color: #a78bfa; }
        button {
            width: 100%; padding: 12px; border-radius: 8px; border: none;
            background: linear-gradient(135deg, #7c3aed, #a78bfa);
            color: white; font-weight: 600; font-size: 14px; cursor: pointer;
        }
        button:hover { opacity: 0.9; }
        #error {
            display: none; color: #f85149; font-size: 13px;
            margin-bottom: 12px;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">🤖</div>
        <h1>Toby Activity Logs</h1>
        <p>Enter password to view Toby's decision history</p>
        <div id="error">Wrong password</div>
        <input type="password" id="pwd" placeholder="Password" onkeydown="if(event.key==='Enter')go()">
        <button onclick="go()">Access Logs</button>
    </div>
    <script>
    function go() {
        const pwd = document.getElementById('pwd').value;
        if (pwd) window.location.href = '/toby-logs?pwd=' + encodeURIComponent(pwd);
    }
    if (window.location.search.includes('pwd=')) document.getElementById('error').style.display = 'block';
    </script>
</body>
</html>"""


# ─── Main dashboard ─────────────────────────────────────────

TOBY_LOGS_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🤖 Toby Logs — Activity Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --bg: #0d1117; --bg2: #161b22; --bg3: #21262d;
            --border: #30363d; --text: #e6edf3; --muted: #8b949e;
            --dim: #484f58;
            --purple: #a78bfa; --blue: #58a6ff; --green: #3fb950;
            --yellow: #d29922; --red: #f85149; --orange: #db6d28;
            --pink: #f778ba; --cyan: #39d2c0;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg); color: var(--text);
            line-height: 1.5; font-size: 14px;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 24px; }

        /* Header */
        .header {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);
        }
        .header-left { display: flex; align-items: center; gap: 12px; }
        .header h1 { font-size: 24px; font-weight: 700; }
        .header p { color: var(--muted); font-size: 13px; }
        .refresh-btn {
            padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border);
            background: var(--bg2); color: var(--text); cursor: pointer;
            font-size: 13px; display: flex; align-items: center; gap: 6px;
        }
        .refresh-btn:hover { border-color: var(--purple); }

        /* Stats grid */
        .stats-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 12px; margin-bottom: 24px;
        }
        .stat-card {
            background: var(--bg2); border: 1px solid var(--border);
            border-radius: 10px; padding: 16px;
        }
        .stat-value { font-size: 28px; font-weight: 700; }
        .stat-label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }

        /* Sections */
        .section { margin-bottom: 24px; }
        .section-title {
            font-size: 16px; font-weight: 600; margin-bottom: 12px;
            display: flex; align-items: center; gap: 8px;
        }

        /* Strategy bars */
        .strat-row {
            display: flex; align-items: center; gap: 12px;
            padding: 10px 14px; background: var(--bg2);
            border: 1px solid var(--border); border-radius: 8px;
            margin-bottom: 6px;
        }
        .strat-name { width: 110px; font-weight: 600; font-size: 13px; }
        .strat-bar-wrap { flex: 1; height: 8px; background: var(--bg3); border-radius: 4px; overflow: hidden; }
        .strat-bar { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
        .strat-nums { font-size: 12px; color: var(--muted); width: 100px; text-align: right; }

        /* Daily chart */
        .daily-grid {
            display: flex; gap: 6px; align-items: flex-end; height: 80px;
            padding: 12px 14px; background: var(--bg2);
            border: 1px solid var(--border); border-radius: 8px;
        }
        .day-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .day-bar { width: 100%; border-radius: 3px 3px 0 0; min-height: 2px; transition: height 0.3s; }
        .day-label { font-size: 10px; color: var(--dim); }

        /* Timeline */
        .timeline { position: relative; }
        .tl-item {
            display: flex; gap: 14px; padding: 14px 16px;
            background: var(--bg2); border: 1px solid var(--border);
            border-radius: 10px; margin-bottom: 8px;
            transition: border-color 0.2s;
        }
        .tl-item:hover { border-color: var(--purple); }

        .tl-icon {
            width: 36px; height: 36px; border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            font-size: 16px; flex-shrink: 0;
        }
        .tl-icon.explore   { background: #1d2d50; }
        .tl-icon.iterate   { background: #3d2f00; }
        .tl-icon.double_down { background: #0d3320; }
        .tl-icon.trending  { background: #3d1519; }

        .tl-body { flex: 1; min-width: 0; }
        .tl-title { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
        .tl-meta { font-size: 12px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 8px; }
        .tl-reasoning {
            font-size: 13px; color: var(--muted); margin-top: 6px;
            padding: 8px 12px; background: var(--bg3); border-radius: 6px;
            line-height: 1.5; border-left: 3px solid var(--purple);
        }

        .badge {
            display: inline-block; padding: 2px 8px; border-radius: 4px;
            font-size: 11px; font-weight: 600; text-transform: uppercase;
        }
        .badge.pending  { background: #3d2f00; color: var(--yellow); }
        .badge.accepted { background: #0d3320; color: var(--green); }
        .badge.rejected { background: #3d1519; color: var(--red); }
        .badge.expired  { background: var(--bg3); color: var(--dim); }

        .badge.explore    { background: #1d2d50; color: var(--blue); }
        .badge.iterate    { background: #3d2f00; color: var(--orange); }
        .badge.double_down { background: #0d3320; color: var(--green); }
        .badge.trending   { background: #3d1519; color: var(--red); }

        /* Filters */
        .filters {
            display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;
        }
        .filter-btn {
            padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border);
            background: var(--bg2); color: var(--muted); cursor: pointer;
            font-size: 12px; font-weight: 500;
        }
        .filter-btn.active { border-color: var(--purple); color: var(--purple); }
        .filter-btn:hover { border-color: var(--purple); }

        /* Auto-refresh indicator */
        .auto-ref {
            font-size: 11px; color: var(--dim); display: flex; align-items: center; gap: 6px;
        }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

        /* Source info */
        .source-tag {
            font-size: 11px; padding: 1px 6px; border-radius: 3px;
            background: var(--bg3); color: var(--dim);
        }

        /* Empty state */
        .empty {
            text-align: center; padding: 60px 20px; color: var(--dim);
        }
        .empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.3; }

        /* Reviewer notes */
        .reviewer-notes {
            font-size: 12px; color: var(--yellow); margin-top: 4px;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="header-left">
                <div style="font-size: 36px;">🤖</div>
                <div>
                    <h1>Toby Activity Logs</h1>
                    <p>AI content strategist decision history</p>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <div class="auto-ref"><div class="dot"></div> Auto-refresh 30s</div>
                <button class="refresh-btn" onclick="loadData()">↻ Refresh</button>
            </div>
        </div>

        <!-- Stats -->
        <div class="stats-grid" id="stats-grid"></div>

        <!-- Strategy breakdown -->
        <div class="section">
            <div class="section-title">📊 Strategy Distribution</div>
            <div id="strategies"></div>
        </div>

        <!-- Daily chart -->
        <div class="section">
            <div class="section-title">📅 Last 7 Days</div>
            <div class="daily-grid" id="daily-chart"></div>
        </div>

        <!-- Timeline -->
        <div class="section">
            <div class="section-title">📜 Proposal Timeline</div>
            <div class="filters" id="filters">
                <button class="filter-btn active" data-filter="all" onclick="setFilter('all')">All</button>
                <button class="filter-btn" data-filter="pending" onclick="setFilter('pending')">⏳ Pending</button>
                <button class="filter-btn" data-filter="accepted" onclick="setFilter('accepted')">✅ Accepted</button>
                <button class="filter-btn" data-filter="rejected" onclick="setFilter('rejected')">❌ Rejected</button>
                <span style="border-left: 1px solid #30363d; margin: 0 4px;"></span>
                <button class="filter-btn" data-filter="explore" onclick="setFilter('explore')">💡 Explore</button>
                <button class="filter-btn" data-filter="iterate" onclick="setFilter('iterate')">🔄 Iterate</button>
                <button class="filter-btn" data-filter="double_down" onclick="setFilter('double_down')">📈 Double Down</button>
                <button class="filter-btn" data-filter="trending" onclick="setFilter('trending')">🔥 Trending</button>
            </div>
            <div id="timeline"></div>
        </div>
    </div>

    <script>
    const API = '/api/toby-logs';
    let allProposals = [];
    let currentFilter = 'all';

    const STRATEGY_ICONS = { explore: '💡', iterate: '🔄', double_down: '📈', trending: '🔥' };
    const STRATEGY_COLORS = { explore: 'var(--blue)', iterate: 'var(--orange)', double_down: 'var(--green)', trending: 'var(--red)' };
    const STATUS_ICONS = { pending: '⏳', accepted: '✅', rejected: '❌', expired: '⏰' };

    function timeAgo(iso) {
        if (!iso) return '';
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'just now';
        if (m < 60) return m + 'm ago';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h ago';
        const d = Math.floor(h / 24);
        return d + 'd ago';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    async function loadData() {
        try {
            const res = await fetch(API + '?limit=200&days=30');
            const data = await res.json();
            renderStats(data.stats);
            renderStrategies(data.strategies);
            renderDaily(data.daily);
            allProposals = data.proposals || [];
            renderTimeline();
        } catch (e) {
            console.error('Failed to load Toby logs:', e);
        }
    }

    function renderStats(s) {
        const grid = document.getElementById('stats-grid');
        grid.innerHTML = `
            <div class="stat-card"><div class="stat-value" style="color:var(--purple)">${s.today}</div><div class="stat-label">Today</div></div>
            <div class="stat-card"><div class="stat-value" style="color:var(--yellow)">${s.pending}</div><div class="stat-label">Pending</div></div>
            <div class="stat-card"><div class="stat-value" style="color:var(--green)">${s.accepted}</div><div class="stat-label">Accepted</div></div>
            <div class="stat-card"><div class="stat-value" style="color:var(--red)">${s.rejected}</div><div class="stat-label">Rejected</div></div>
            <div class="stat-card"><div class="stat-value">${s.total}</div><div class="stat-label">Total</div></div>
            <div class="stat-card"><div class="stat-value" style="color:var(--cyan)">${s.acceptance_rate}%</div><div class="stat-label">Accept Rate</div></div>
            <div class="stat-card"><div class="stat-value" style="color:var(--pink)">${s.trending_discovered}</div><div class="stat-label">Trending Found</div></div>
            <div class="stat-card"><div class="stat-value">${s.posts_tracked}</div><div class="stat-label">Posts Tracked</div></div>
        `;
    }

    function renderStrategies(strats) {
        const el = document.getElementById('strategies');
        if (!strats || Object.keys(strats).length === 0) {
            el.innerHTML = '<div style="color:var(--dim);font-size:13px;padding:12px;">No strategy data yet — run Toby first</div>';
            return;
        }
        const maxTotal = Math.max(...Object.values(strats).map(s => s.total), 1);
        el.innerHTML = Object.entries(strats).map(([name, s]) => {
            const pct = Math.round(s.total / maxTotal * 100);
            const accPct = s.total > 0 ? Math.round(s.accepted / s.total * 100) : 0;
            return `
                <div class="strat-row">
                    <span class="strat-name">${STRATEGY_ICONS[name] || '📌'} ${name.replace('_',' ')}</span>
                    <div class="strat-bar-wrap">
                        <div class="strat-bar" style="width:${pct}%;background:${STRATEGY_COLORS[name] || 'var(--muted)'}"></div>
                    </div>
                    <span class="strat-nums">${s.accepted}/${s.total} (${accPct}%)</span>
                </div>
            `;
        }).join('');
    }

    function renderDaily(daily) {
        const el = document.getElementById('daily-chart');
        if (!daily || daily.length === 0) { el.innerHTML = '<div style="color:var(--dim);">No data</div>'; return; }
        const maxVal = Math.max(...daily.map(d => d.total), 1);
        // Reverse so oldest is left
        const days = [...daily].reverse();
        el.innerHTML = days.map(d => {
            const hTotal = Math.max(Math.round(d.total / maxVal * 60), 2);
            const hAccepted = d.total > 0 ? Math.max(Math.round(d.accepted / maxVal * 60), d.accepted > 0 ? 2 : 0) : 0;
            const label = new Date(d.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' });
            return `
                <div class="day-col">
                    <div style="display:flex;flex-direction:column;align-items:center;gap:1px;width:100%;">
                        <div class="day-bar" style="height:${hTotal}px;background:var(--purple);opacity:0.4;"></div>
                        <div class="day-bar" style="height:${hAccepted}px;background:var(--green);margin-top:-${hAccepted}px;"></div>
                    </div>
                    <div class="day-label">${label}</div>
                    <div class="day-label">${d.total}</div>
                </div>
            `;
        }).join('');
    }

    function setFilter(f) {
        currentFilter = f;
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === f);
        });
        renderTimeline();
    }

    function renderTimeline() {
        const el = document.getElementById('timeline');
        let filtered = allProposals;
        if (currentFilter !== 'all') {
            filtered = allProposals.filter(p =>
                p.status === currentFilter || p.strategy === currentFilter
            );
        }

        if (filtered.length === 0) {
            el.innerHTML = `
                <div class="empty">
                    <div class="empty-icon">🤖</div>
                    <div>No proposals matching filter</div>
                </div>
            `;
            return;
        }

        el.innerHTML = filtered.map(p => {
            const icon = STRATEGY_ICONS[p.strategy] || '📌';
            const sourceInfo = p.source_type
                ? `<span class="source-tag">${p.source_type === 'own_content' ? '📊 Own' : p.source_account ? '@' + escapeHtml(p.source_account) : '🌐 External'}</span>`
                : '';
            const sourceTitle = p.source_title
                ? `<span class="source-tag" title="${escapeHtml(p.source_title)}">${escapeHtml(p.source_title.substring(0, 40))}${p.source_title.length > 40 ? '…' : ''}</span>`
                : '';
            const notes = p.reviewer_notes
                ? `<div class="reviewer-notes">💬 "${escapeHtml(p.reviewer_notes)}"</div>`
                : '';
            const qScore = p.quality_score != null
                ? `<span style="color:${p.quality_score >= 80 ? 'var(--green)' : p.quality_score >= 60 ? 'var(--yellow)' : 'var(--red)'}">Q${Math.round(p.quality_score)}</span>`
                : '';

            return `
                <div class="tl-item">
                    <div class="tl-icon ${p.strategy}">${icon}</div>
                    <div class="tl-body">
                        <div class="tl-title">${escapeHtml(p.title)}</div>
                        <div class="tl-meta">
                            <span class="badge ${p.status}">${STATUS_ICONS[p.status] || ''} ${p.status}</span>
                            <span class="badge ${p.strategy}">${p.strategy.replace('_', ' ')}</span>
                            ${p.topic_bucket ? '<span class="source-tag">' + escapeHtml(p.topic_bucket) + '</span>' : ''}
                            ${sourceInfo}
                            ${sourceTitle}
                            ${qScore}
                            <span style="color:var(--dim)">${p.proposal_id}</span>
                            <span style="color:var(--dim)">${timeAgo(p.created_at)}</span>
                            ${p.reviewed_at ? '<span style="color:var(--dim)">reviewed ' + timeAgo(p.reviewed_at) + '</span>' : ''}
                        </div>
                        <div class="tl-reasoning">${escapeHtml(p.reasoning)}</div>
                        ${notes}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Initial load + auto-refresh
    loadData();
    setInterval(loadData, 30000);
    </script>
</body>
</html>"""
