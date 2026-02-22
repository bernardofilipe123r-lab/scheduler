"""
Logs API routes and HTML dashboard.

Provides:
- GET /logs          → Full HTML dashboard with real-time log viewer
- GET /api/logs      → JSON API for log queries with filtering
- GET /api/logs/stats → Log statistics and counts by category/level
- DELETE /api/logs   → Clear old logs (with retention parameter)
- GET /api/logs/stream → SSE stream for real-time log tailing

Features:
- Filtering by level, category, source, path, request_id, date range
- Full-text search across message and details
- Pagination with configurable page size
- Auto-refresh with configurable interval
- Export to JSON
- Log retention management
"""
import os
import json
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Query, Depends, HTTPException, Cookie, Response
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, or_, and_, cast, String

from app.db_connection import get_db
from app.models import LogEntry
from app.services.logging.service import get_logging_service, DEPLOYMENT_ID
from app.api.auth.middleware import get_current_user, is_admin_user

router = APIRouter(tags=["logs"])

# Logs password (from env or default)
LOGS_PASSWORD = os.environ.get("LOGS_PASSWORD")


def _require_admin(user: dict) -> None:
    """Guard logs endpoints behind admin-only access."""
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Admin access required")


def _apply_user_scope(query, user_id: str):
    """Scope logs to records tagged with the authenticated user_id."""
    marker = f'"user_id": "{user_id}"'
    return query.filter(cast(LogEntry.details, String).ilike(f"%{marker}%"))


@router.get("/api/logs", summary="Query logs with filtering")
def get_logs(
    level: Optional[str] = Query(None, description="Filter by level: DEBUG, INFO, WARNING, ERROR, CRITICAL"),
    category: Optional[str] = Query(None, description="Filter by category: http_request, http_outbound, app_log, user_action, system_event, error, scheduler, publishing, ai_generation"),
    source: Optional[str] = Query(None, description="Filter by source module"),
    search: Optional[str] = Query(None, description="Full-text search in message"),
    request_id: Optional[str] = Query(None, description="Filter by request correlation ID"),
    deployment_id: Optional[str] = Query(None, description="Filter by deployment ID"),
    http_method: Optional[str] = Query(None, description="Filter by HTTP method"),
    http_path: Optional[str] = Query(None, description="Filter by HTTP path (partial match)"),
    http_status_min: Optional[int] = Query(None, description="Filter by minimum HTTP status code"),
    http_status_max: Optional[int] = Query(None, description="Filter by maximum HTTP status code"),
    since: Optional[str] = Query(None, description="Filter logs since this ISO datetime"),
    until: Optional[str] = Query(None, description="Filter logs until this ISO datetime"),
    since_minutes: Optional[int] = Query(None, description="Filter logs from the last N minutes"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=1000, description="Results per page"),
    order: str = Query("desc", description="Sort order: asc or desc"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Query logs with comprehensive filtering.
    
    Returns paginated log entries with total count for pagination.
    """
    _require_admin(user)

    # Flush any buffered logs first
    try:
        get_logging_service().flush()
    except Exception:
        pass
    
    query = db.query(LogEntry)
    query = _apply_user_scope(query, user.get("id", ""))
    
    # Apply filters
    if level:
        levels = [l.strip().upper() for l in level.split(',')]
        query = query.filter(LogEntry.level.in_(levels))
    
    if category:
        categories = [c.strip() for c in category.split(',')]
        query = query.filter(LogEntry.category.in_(categories))
    
    if source:
        query = query.filter(LogEntry.source.ilike(f'%{source}%'))
    
    if search:
        query = query.filter(
            or_(
                LogEntry.message.ilike(f'%{search}%'),
                cast(LogEntry.details, String).ilike(f'%{search}%'),
            )
        )
    
    if request_id:
        query = query.filter(LogEntry.request_id == request_id)
    
    if deployment_id:
        query = query.filter(LogEntry.deployment_id == deployment_id)
    
    if http_method:
        query = query.filter(LogEntry.http_method == http_method.upper())
    
    if http_path:
        query = query.filter(LogEntry.http_path.ilike(f'%{http_path}%'))
    
    if http_status_min:
        query = query.filter(LogEntry.http_status >= http_status_min)
    
    if http_status_max:
        query = query.filter(LogEntry.http_status <= http_status_max)
    
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
            query = query.filter(LogEntry.timestamp >= since_dt)
        except ValueError:
            raise HTTPException(400, f"Invalid 'since' datetime: {since}")
    
    if until:
        try:
            until_dt = datetime.fromisoformat(until.replace('Z', '+00:00'))
            query = query.filter(LogEntry.timestamp <= until_dt)
        except ValueError:
            raise HTTPException(400, f"Invalid 'until' datetime: {until}")
    
    if since_minutes:
        cutoff = datetime.utcnow() - timedelta(minutes=since_minutes)
        query = query.filter(LogEntry.timestamp >= cutoff)
    
    # Get total count
    total = query.count()
    
    # Apply ordering
    if order == 'asc':
        query = query.order_by(LogEntry.timestamp.asc(), LogEntry.id.asc())
    else:
        query = query.order_by(LogEntry.timestamp.desc(), LogEntry.id.desc())
    
    # Apply pagination
    offset = (page - 1) * page_size
    logs = query.offset(offset).limit(page_size).all()
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "deployment_id": DEPLOYMENT_ID,
        "logs": [log.to_dict() for log in logs],
    }


@router.get("/api/logs/stats", summary="Get log statistics")
def get_log_stats(
    since_minutes: int = Query(60, description="Stats for the last N minutes"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get log statistics: counts by level, category, and recent errors."""
    _require_admin(user)

    cutoff = datetime.utcnow() - timedelta(minutes=since_minutes)
    
    # Count by level
    level_counts = (
        db.query(LogEntry.level, func.count(LogEntry.id))
        .filter(LogEntry.timestamp >= cutoff)
        .filter(cast(LogEntry.details, String).ilike(f'%"user_id": "{user.get("id", "")}"%'))
        .group_by(LogEntry.level)
        .all()
    )
    
    # Count by category
    category_counts = (
        db.query(LogEntry.category, func.count(LogEntry.id))
        .filter(LogEntry.timestamp >= cutoff)
        .filter(cast(LogEntry.details, String).ilike(f'%"user_id": "{user.get("id", "")}"%'))
        .group_by(LogEntry.category)
        .all()
    )
    
    # Recent errors
    recent_errors = (
        db.query(LogEntry)
        .filter(LogEntry.timestamp >= cutoff, LogEntry.level.in_(['ERROR', 'CRITICAL']))
        .filter(cast(LogEntry.details, String).ilike(f'%"user_id": "{user.get("id", "")}"%'))
        .order_by(LogEntry.timestamp.desc())
        .limit(10)
        .all()
    )
    
    # Request stats (avg duration, count by status)
    request_stats = (
        db.query(
            func.count(LogEntry.id).label('total_requests'),
            func.avg(LogEntry.duration_ms).label('avg_duration_ms'),
        )
        .filter(
            LogEntry.timestamp >= cutoff,
            LogEntry.category == 'http_request',
            cast(LogEntry.details, String).ilike(f'%"user_id": "{user.get("id", "")}"%'),
        )
        .first()
    )
    
    # Status code distribution
    status_distribution = (
        db.query(LogEntry.http_status, func.count(LogEntry.id))
        .filter(
            LogEntry.timestamp >= cutoff,
            LogEntry.category == 'http_request',
            LogEntry.http_status.isnot(None),
            cast(LogEntry.details, String).ilike(f'%"user_id": "{user.get("id", "")}"%'),
        )
        .group_by(LogEntry.http_status)
        .all()
    )
    
    # Active deployments
    deployments = (
        db.query(
            LogEntry.deployment_id,
            func.min(LogEntry.timestamp).label('first_seen'),
            func.max(LogEntry.timestamp).label('last_seen'),
            func.count(LogEntry.id).label('log_count'),
        )
        .filter(LogEntry.timestamp >= cutoff)
        .filter(cast(LogEntry.details, String).ilike(f'%"user_id": "{user.get("id", "")}"%'))
        .group_by(LogEntry.deployment_id)
        .order_by(func.max(LogEntry.timestamp).desc())
        .all()
    )
    
    # Total log count
    total_logs = (
        db.query(func.count(LogEntry.id))
        .filter(cast(LogEntry.details, String).ilike(f'%"user_id": "{user.get("id", "")}"%'))
        .scalar()
    )
    
    return {
        "period_minutes": since_minutes,
        "current_deployment": DEPLOYMENT_ID,
        "total_logs_in_db": total_logs,
        "levels": {level: count for level, count in level_counts},
        "categories": {cat: count for cat, count in category_counts},
        "recent_errors": [e.to_dict() for e in recent_errors],
        "requests": {
            "total": request_stats[0] if request_stats else 0,
            "avg_duration_ms": round(float(request_stats[1]), 2) if request_stats and request_stats[1] else 0,
        },
        "status_distribution": {str(status): count for status, count in status_distribution},
        "deployments": [
            {
                "deployment_id": d[0],
                "first_seen": d[1].isoformat() if d[1] else None,
                "last_seen": d[2].isoformat() if d[2] else None,
                "log_count": d[3],
                "is_current": d[0] == DEPLOYMENT_ID,
            }
            for d in deployments
        ],
    }


@router.delete("/api/logs", summary="Clear old logs")
def clear_logs(
    retention_days: int = Query(7, ge=0, description="Delete logs older than N days. Use 0 to delete all."),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Delete old log entries to manage database size."""
    _require_admin(user)

    scoped_query = _apply_user_scope(db.query(LogEntry), user.get("id", ""))

    if retention_days == 0:
        deleted = scoped_query.delete()
    else:
        cutoff = datetime.utcnow() - timedelta(days=retention_days)
        deleted = scoped_query.filter(LogEntry.timestamp < cutoff).delete()
    
    db.commit()
    
    return {
        "deleted": deleted,
        "retention_days": retention_days,
        "message": f"Deleted {deleted} log entries",
    }


# NOTE: The /logs HTML dashboard route has been removed.
# /logs is now handled by the React SPA (LogsPage component) which
# uses /api/logs for data and is protected by the app's auth system.


# =============================================================================
# LOGS LOGIN PAGE - Simple password gate
# =============================================================================

LOGS_LOGIN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔒 Logs Access</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #e6edf3;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 12px;
            padding: 40px;
            width: 100%;
            max-width: 400px;
            text-align: center;
        }
        .icon { font-size: 48px; margin-bottom: 16px; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        p { color: #8b949e; margin-bottom: 24px; font-size: 14px; }
        input {
            width: 100%;
            padding: 12px 16px;
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 8px;
            color: #e6edf3;
            font-size: 16px;
            margin-bottom: 16px;
            outline: none;
        }
        input:focus { border-color: #58a6ff; }
        button {
            width: 100%;
            padding: 12px;
            background: #238636;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
        }
        button:hover { background: #2ea043; }
        .error { color: #f85149; font-size: 13px; margin-top: 12px; display: none; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">🔍</div>
        <h1>System Logs</h1>
        <p>Enter the password to access the logs dashboard</p>
        <form onsubmit="doLogin(event)">
            <input type="password" id="pwd" placeholder="Enter password..." autofocus />
            <button type="submit">Unlock Logs</button>
        </form>
        <p class="error" id="error">Invalid password. Try again.</p>
    </div>
    <script>
    function doLogin(e) {
        e.preventDefault();
        const pwd = document.getElementById('pwd').value;
        if (pwd) {
            window.location.href = '/logs?pwd=' + encodeURIComponent(pwd);
        }
    }
    // Show error if redirected back (URL has no pwd but page loaded = wrong pwd attempt)
    if (window.location.search.includes('pwd=')) {
        document.getElementById('error').style.display = 'block';
    }
    </script>
</body>
</html>"""


# =============================================================================
# LOGS HTML DASHBOARD - Self-contained, no external dependencies
# =============================================================================

LOGS_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔍 System Logs — Reels Automation</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        :root {
            --bg-primary: #0d1117;
            --bg-secondary: #161b22;
            --bg-tertiary: #21262d;
            --border: #30363d;
            --text-primary: #e6edf3;
            --text-secondary: #8b949e;
            --text-muted: #484f58;
            --accent: #58a6ff;
            --accent-hover: #79c0ff;
            --green: #3fb950;
            --yellow: #d29922;
            --orange: #db6d28;
            --red: #f85149;
            --purple: #bc8cff;
            --pink: #f778ba;
            --cyan: #39d2c0;
        }
        
        body {
            font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.5;
            font-size: 13px;
        }
        
        /* Header */
        .header {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            padding: 12px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .header-left {
            display: flex;
            align-items: center;
            gap: 16px;
        }
        
        .header h1 {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary);
        }
        
        .header .deployment-badge {
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 2px 10px;
            font-size: 11px;
            color: var(--text-secondary);
        }
        
        .header-right {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        /* Stats bar */
        .stats-bar {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            padding: 8px 20px;
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            align-items: center;
        }
        
        .stat {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }
        
        .stat-label { color: var(--text-secondary); }
        .stat-value { font-weight: 600; }
        .stat-value.green { color: var(--green); }
        .stat-value.yellow { color: var(--yellow); }
        .stat-value.red { color: var(--red); }
        .stat-value.blue { color: var(--accent); }
        
        /* Filter bar */
        .filter-bar {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            padding: 10px 20px;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            align-items: center;
        }
        
        .filter-group {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .filter-group label {
            font-size: 11px;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        input, select {
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            color: var(--text-primary);
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 12px;
            font-family: inherit;
            outline: none;
        }
        
        input:focus, select:focus {
            border-color: var(--accent);
        }
        
        input[type="text"] { width: 180px; }
        select { width: 130px; }
        
        button {
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            color: var(--text-primary);
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-family: inherit;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        button:hover { border-color: var(--accent); color: var(--accent); }
        button.active { background: var(--accent); color: #000; border-color: var(--accent); }
        button.danger { border-color: var(--red); color: var(--red); }
        button.danger:hover { background: var(--red); color: #fff; }
        
        /* Log entries */
        .log-container {
            padding: 0;
        }
        
        .log-entry {
            border-bottom: 1px solid var(--border);
            padding: 6px 20px;
            display: grid;
            grid-template-columns: 90px 65px 110px 1fr auto;
            gap: 12px;
            align-items: start;
            cursor: pointer;
            transition: background 0.1s;
        }
        
        .log-entry:hover {
            background: var(--bg-secondary);
        }
        
        .log-entry.expanded {
            background: var(--bg-secondary);
        }

        .log-entry.level-ERROR, .log-entry.level-CRITICAL {
            border-left: 3px solid var(--red);
        }
        
        .log-entry.level-WARNING {
            border-left: 3px solid var(--yellow);
        }
        
        .log-time {
            color: var(--text-muted);
            font-size: 11px;
            white-space: nowrap;
        }
        
        .log-level {
            font-size: 11px;
            font-weight: 700;
            padding: 1px 6px;
            border-radius: 3px;
            text-align: center;
            white-space: nowrap;
        }
        
        .log-level.DEBUG { color: var(--text-muted); background: rgba(139,148,158,0.1); }
        .log-level.INFO { color: var(--green); background: rgba(63,185,80,0.1); }
        .log-level.WARNING { color: var(--yellow); background: rgba(210,153,34,0.15); }
        .log-level.ERROR { color: var(--red); background: rgba(248,81,73,0.15); }
        .log-level.CRITICAL { color: #fff; background: var(--red); }
        
        .log-category {
            font-size: 11px;
            color: var(--purple);
            white-space: nowrap;
        }
        
        .log-message {
            color: var(--text-primary);
            word-break: break-word;
            white-space: pre-wrap;
        }
        
        .log-meta {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-shrink: 0;
        }
        
        .log-duration {
            font-size: 11px;
            color: var(--cyan);
        }
        
        .log-status {
            font-size: 11px;
            padding: 1px 5px;
            border-radius: 3px;
            font-weight: 600;
        }
        
        .log-status.s2xx { color: var(--green); background: rgba(63,185,80,0.1); }
        .log-status.s3xx { color: var(--accent); background: rgba(88,166,255,0.1); }
        .log-status.s4xx { color: var(--yellow); background: rgba(210,153,34,0.15); }
        .log-status.s5xx { color: var(--red); background: rgba(248,81,73,0.15); }
        
        /* Expanded details */
        .log-details {
            display: none;
            grid-column: 1 / -1;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 6px;
            margin: 6px 0;
            padding: 12px;
            font-size: 12px;
        }
        
        .log-entry.expanded .log-details {
            display: block;
        }
        
        .detail-row {
            display: flex;
            gap: 12px;
            margin-bottom: 4px;
        }
        
        .detail-key {
            color: var(--accent);
            min-width: 120px;
            flex-shrink: 0;
        }
        
        .detail-value {
            color: var(--text-primary);
            word-break: break-all;
        }

        .detail-json {
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 8px;
            margin-top: 6px;
            overflow-x: auto;
            white-space: pre-wrap;
            font-size: 11px;
            max-height: 400px;
            overflow-y: auto;
        }
        
        /* Pagination */
        .pagination {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 16px 20px;
            border-top: 1px solid var(--border);
            background: var(--bg-secondary);
            position: sticky;
            bottom: 0;
        }
        
        .pagination .page-info {
            color: var(--text-secondary);
            font-size: 12px;
        }
        
        /* Loading */
        .loading {
            text-align: center;
            padding: 40px;
            color: var(--text-secondary);
        }
        
        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid var(--border);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin { to { transform: rotate(360deg); } }
        
        /* Auto-refresh indicator */
        .auto-refresh {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .pulse {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--green);
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        
        .pulse.paused {
            background: var(--text-muted);
            animation: none;
        }
        
        /* Request ID link */
        .request-id-link {
            font-size: 10px;
            color: var(--accent);
            cursor: pointer;
            text-decoration: none;
            opacity: 0.7;
        }
        .request-id-link:hover { opacity: 1; }
        
        /* Empty state */
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: var(--text-secondary);
        }
        .empty-state h2 { font-size: 18px; margin-bottom: 8px; color: var(--text-primary); }
        
        /* Tab navigation */
        .tabs {
            display: flex;
            gap: 0;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            padding: 0 20px;
        }
        
        .tab {
            padding: 8px 16px;
            font-size: 13px;
            color: var(--text-secondary);
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.15s;
        }
        
        .tab:hover { color: var(--text-primary); }
        .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
        
        /* Toast notification */
        .toast {
            position: fixed;
            bottom: 60px;
            right: 20px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 10px 16px;
            font-size: 12px;
            color: var(--text-primary);
            z-index: 200;
            opacity: 0;
            transform: translateY(10px);
            transition: all 0.3s;
        }
        .toast.show { opacity: 1; transform: translateY(0); }
        
        /* Responsive */
        @media (max-width: 900px) {
            .log-entry {
                grid-template-columns: 80px 55px 1fr;
                gap: 6px;
            }
            .log-category, .log-meta { display: none; }
            .filter-bar { flex-direction: column; }
            input[type="text"] { width: 100%; }
        }
    </style>
</head>
<body>

<!-- Header -->
<div class="header">
    <div class="header-left">
        <h1>🔍 System Logs</h1>
        <span class="deployment-badge" id="deploymentBadge">Loading...</span>
    </div>
    <div class="header-right">
        <div class="auto-refresh">
            <div class="pulse" id="pulseIndicator"></div>
            <select id="refreshInterval" onchange="setRefreshInterval()">
                <option value="0">Manual</option>
                <option value="2000">2s</option>
                <option value="5000" selected>5s</option>
                <option value="10000">10s</option>
                <option value="30000">30s</option>
            </select>
        </div>
        <button onclick="refreshLogs()">⟳ Refresh</button>
        <button onclick="exportLogs()">📥 Export</button>
        <button class="danger" onclick="clearLogs()">🗑️ Clear Old</button>
    </div>
</div>

<!-- Stats bar -->
<div class="stats-bar" id="statsBar">
    <div class="stat">
        <span class="stat-label">Total:</span>
        <span class="stat-value blue" id="statTotal">-</span>
    </div>
    <div class="stat">
        <span class="stat-label">Errors:</span>
        <span class="stat-value red" id="statErrors">-</span>
    </div>
    <div class="stat">
        <span class="stat-label">Warnings:</span>
        <span class="stat-value yellow" id="statWarnings">-</span>
    </div>
    <div class="stat">
        <span class="stat-label">Requests:</span>
        <span class="stat-value green" id="statRequests">-</span>
    </div>
    <div class="stat">
        <span class="stat-label">Avg Response:</span>
        <span class="stat-value blue" id="statAvgDuration">-</span>
    </div>
    <div class="stat">
        <span class="stat-label">Deployments:</span>
        <span class="stat-value" id="statDeployments">-</span>
    </div>
</div>

<!-- Tabs -->
<div class="tabs">
    <div class="tab active" onclick="switchTab('all')">All Logs</div>
    <div class="tab" onclick="switchTab('http_request')">HTTP Requests</div>
    <div class="tab" onclick="switchTab('error')">Errors</div>
    <div class="tab" onclick="switchTab('http_outbound')">Outbound API</div>
    <div class="tab" onclick="switchTab('scheduler')">Scheduler</div>
    <div class="tab" onclick="switchTab('publishing')">Publishing</div>
    <div class="tab" onclick="switchTab('system_event')">System</div>
    <div class="tab" onclick="switchTab('user_action')">User Actions</div>
    <div class="tab" onclick="switchTab('ai_generation')">AI Gen</div>
</div>

<!-- Filter bar -->
<div class="filter-bar">
    <div class="filter-group">
        <label>Level:</label>
        <select id="filterLevel" onchange="refreshLogs()">
            <option value="">All</option>
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="WARNING,ERROR,CRITICAL">⚠️ Warnings+</option>
            <option value="ERROR,CRITICAL">🔴 Errors+</option>
        </select>
    </div>
    <div class="filter-group">
        <label>Search:</label>
        <input type="text" id="filterSearch" placeholder="Search messages..." onkeyup="debounceRefresh()">
    </div>
    <div class="filter-group">
        <label>Path:</label>
        <input type="text" id="filterPath" placeholder="/api/..." onkeyup="debounceRefresh()" style="width:120px;">
    </div>
    <div class="filter-group">
        <label>Method:</label>
        <select id="filterMethod" onchange="refreshLogs()">
            <option value="">All</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
            <option value="PATCH">PATCH</option>
        </select>
    </div>
    <div class="filter-group">
        <label>Status:</label>
        <select id="filterStatus" onchange="refreshLogs()">
            <option value="">All</option>
            <option value="200-299">2xx Success</option>
            <option value="300-399">3xx Redirect</option>
            <option value="400-499">4xx Client Error</option>
            <option value="500-599">5xx Server Error</option>
        </select>
    </div>
    <div class="filter-group">
        <label>Time:</label>
        <select id="filterTime" onchange="refreshLogs()">
            <option value="">All Time</option>
            <option value="5">Last 5 min</option>
            <option value="15">Last 15 min</option>
            <option value="30" selected>Last 30 min</option>
            <option value="60">Last hour</option>
            <option value="360">Last 6 hours</option>
            <option value="1440">Last 24 hours</option>
            <option value="10080">Last 7 days</option>
        </select>
    </div>
    <div class="filter-group">
        <label>Request ID:</label>
        <input type="text" id="filterRequestId" placeholder="uuid..." onkeyup="debounceRefresh()" style="width:130px;">
    </div>
    <div class="filter-group">
        <label>Per Page:</label>
        <select id="pageSize" onchange="refreshLogs()">
            <option value="50">50</option>
            <option value="100" selected>100</option>
            <option value="250">250</option>
            <option value="500">500</option>
        </select>
    </div>
    <button onclick="clearFilters()">✕ Clear</button>
</div>

<!-- Log entries -->
<div class="log-container" id="logContainer">
    <div class="loading">
        <div class="spinner"></div>
        <p style="margin-top:10px;">Loading logs...</p>
    </div>
</div>

<!-- Pagination -->
<div class="pagination" id="pagination" style="display:none;">
    <button onclick="prevPage()">← Prev</button>
    <span class="page-info" id="pageInfo">Page 1 of 1</span>
    <button onclick="nextPage()">Next →</button>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script>
    // State
    let currentPage = 1;
    let totalPages = 1;
    let currentTab = 'all';
    let refreshTimer = null;
    let debounceTimer = null;
    let allLogs = [];
    
    // API base
    const API_BASE = window.location.origin;
    
    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        refreshLogs();
        refreshStats();
        setRefreshInterval();
    });
    
    // Tab switching
    function switchTab(tab) {
        currentTab = tab;
        currentPage = 1;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        event.target.classList.add('active');
        refreshLogs();
    }
    
    // Refresh controls
    function setRefreshInterval() {
        if (refreshTimer) clearInterval(refreshTimer);
        const interval = parseInt(document.getElementById('refreshInterval').value);
        const pulse = document.getElementById('pulseIndicator');
        
        if (interval > 0) {
            refreshTimer = setInterval(() => {
                refreshLogs(true);
                refreshStats();
            }, interval);
            pulse.classList.remove('paused');
        } else {
            pulse.classList.add('paused');
        }
    }
    
    function debounceRefresh() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => refreshLogs(), 400);
    }
    
    // Fetch logs
    async function refreshLogs(silent = false) {
        try {
            const params = new URLSearchParams();
            params.set('page', currentPage);
            params.set('page_size', document.getElementById('pageSize').value);
            
            // Tab filter
            if (currentTab !== 'all') {
                if (currentTab === 'error') {
                    params.set('level', 'ERROR,CRITICAL');
                } else {
                    params.set('category', currentTab);
                }
            }
            
            // Level filter
            const level = document.getElementById('filterLevel').value;
            if (level && currentTab !== 'error') params.set('level', level);
            
            // Search
            const search = document.getElementById('filterSearch').value;
            if (search) params.set('search', search);
            
            // Path
            const path = document.getElementById('filterPath').value;
            if (path) params.set('http_path', path);
            
            // Method
            const method = document.getElementById('filterMethod').value;
            if (method) params.set('http_method', method);
            
            // Status
            const status = document.getElementById('filterStatus').value;
            if (status) {
                const [min, max] = status.split('-');
                params.set('http_status_min', min);
                params.set('http_status_max', max);
            }
            
            // Time
            const timeMinutes = document.getElementById('filterTime').value;
            if (timeMinutes) params.set('since_minutes', timeMinutes);
            
            // Request ID
            const reqId = document.getElementById('filterRequestId').value;
            if (reqId) params.set('request_id', reqId);
            
            const response = await fetch(`${API_BASE}/api/logs?${params}`);
            const data = await response.json();
            
            allLogs = data.logs;
            totalPages = data.total_pages;
            
            // Update deployment badge
            document.getElementById('deploymentBadge').textContent = 
                `🚀 ${data.deployment_id}`;
            
            renderLogs(data.logs);
            renderPagination(data);
            
        } catch (err) {
            if (!silent) {
                document.getElementById('logContainer').innerHTML = 
                    `<div class="empty-state"><h2>⚠️ Connection Error</h2><p>${err.message}</p></div>`;
            }
        }
    }
    
    // Fetch stats
    async function refreshStats() {
        try {
            const timeMinutes = document.getElementById('filterTime').value || 30;
            const response = await fetch(`${API_BASE}/api/logs/stats?since_minutes=${timeMinutes}`);
            const data = await response.json();
            
            document.getElementById('statTotal').textContent = data.total_logs_in_db?.toLocaleString() || '0';
            document.getElementById('statErrors').textContent = (data.levels?.ERROR || 0) + (data.levels?.CRITICAL || 0);
            document.getElementById('statWarnings').textContent = data.levels?.WARNING || 0;
            document.getElementById('statRequests').textContent = data.requests?.total || 0;
            document.getElementById('statAvgDuration').textContent = 
                data.requests?.avg_duration_ms ? `${data.requests.avg_duration_ms}ms` : '-';
            document.getElementById('statDeployments').textContent = data.deployments?.length || 0;
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        }
    }
    
    // Render logs
    function renderLogs(logs) {
        const container = document.getElementById('logContainer');
        
        if (!logs || logs.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h2>No logs found</h2>
                    <p>Try adjusting your filters or time range</p>
                </div>`;
            return;
        }
        
        container.innerHTML = logs.map((log, i) => {
            const time = new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false });
            const statusClass = log.http_status ? getStatusClass(log.http_status) : '';
            const duration = log.duration_ms ? `${log.duration_ms}ms` : '';
            const requestIdSnippet = log.request_id ? log.request_id.substring(0, 8) : '';
            
            return `
                <div class="log-entry level-${log.level}" onclick="toggleDetails(${i})" id="entry-${i}">
                    <span class="log-time">${time}</span>
                    <span class="log-level ${log.level}">${log.level}</span>
                    <span class="log-category">${log.category}</span>
                    <span class="log-message">${escapeHtml(log.message)}</span>
                    <span class="log-meta">
                        ${duration ? `<span class="log-duration">${duration}</span>` : ''}
                        ${log.http_status ? `<span class="log-status ${statusClass}">${log.http_status}</span>` : ''}
                        ${requestIdSnippet ? `<span class="request-id-link" onclick="filterByRequestId(event, '${log.request_id}')" title="${log.request_id}">${requestIdSnippet}</span>` : ''}
                    </span>
                    <div class="log-details" id="details-${i}">
                        ${renderDetails(log)}
                    </div>
                </div>`;
        }).join('');
    }
    
    // Render log details
    function renderDetails(log) {
        let html = '';
        
        // Basic info
        html += `<div class="detail-row"><span class="detail-key">ID:</span><span class="detail-value">${log.id}</span></div>`;
        html += `<div class="detail-row"><span class="detail-key">Timestamp:</span><span class="detail-value">${log.timestamp}</span></div>`;
        html += `<div class="detail-row"><span class="detail-key">Source:</span><span class="detail-value">${log.source || '-'}</span></div>`;
        html += `<div class="detail-row"><span class="detail-key">Category:</span><span class="detail-value">${log.category}</span></div>`;
        html += `<div class="detail-row"><span class="detail-key">Deployment:</span><span class="detail-value">${log.deployment_id || '-'}</span></div>`;
        
        if (log.request_id) {
            html += `<div class="detail-row"><span class="detail-key">Request ID:</span><span class="detail-value"><a class="request-id-link" onclick="filterByRequestId(event, '${log.request_id}')">${log.request_id}</a></span></div>`;
        }
        
        if (log.http_method) {
            html += `<div class="detail-row"><span class="detail-key">HTTP:</span><span class="detail-value">${log.http_method} ${log.http_path} → ${log.http_status}</span></div>`;
        }
        
        if (log.duration_ms) {
            html += `<div class="detail-row"><span class="detail-key">Duration:</span><span class="detail-value">${log.duration_ms}ms</span></div>`;
        }
        
        // Full details JSON
        if (log.details) {
            html += `<div style="margin-top:8px;"><span class="detail-key">Full Details:</span></div>`;
            html += `<div class="detail-json">${syntaxHighlight(JSON.stringify(log.details, null, 2))}</div>`;
        }
        
        return html;
    }
    
    // Toggle details expansion
    function toggleDetails(index) {
        const entry = document.getElementById(`entry-${index}`);
        entry.classList.toggle('expanded');
    }
    
    // Filter by request ID
    function filterByRequestId(event, requestId) {
        event.stopPropagation();
        document.getElementById('filterRequestId').value = requestId;
        refreshLogs();
    }
    
    // Pagination
    function renderPagination(data) {
        const pagination = document.getElementById('pagination');
        const pageInfo = document.getElementById('pageInfo');
        
        if (data.total_pages > 1) {
            pagination.style.display = 'flex';
            pageInfo.textContent = `Page ${data.page} of ${data.total_pages} (${data.total.toLocaleString()} total)`;
        } else {
            pagination.style.display = data.total > 0 ? 'flex' : 'none';
            pageInfo.textContent = `${data.total.toLocaleString()} entries`;
        }
    }
    
    function prevPage() {
        if (currentPage > 1) { currentPage--; refreshLogs(); }
    }
    
    function nextPage() {
        if (currentPage < totalPages) { currentPage++; refreshLogs(); }
    }
    
    // Clear filters
    function clearFilters() {
        document.getElementById('filterLevel').value = '';
        document.getElementById('filterSearch').value = '';
        document.getElementById('filterPath').value = '';
        document.getElementById('filterMethod').value = '';
        document.getElementById('filterStatus').value = '';
        document.getElementById('filterTime').value = '30';
        document.getElementById('filterRequestId').value = '';
        currentPage = 1;
        refreshLogs();
    }
    
    // Export logs
    async function exportLogs() {
        try {
            const params = new URLSearchParams();
            params.set('page_size', '1000');
            const timeMinutes = document.getElementById('filterTime').value;
            if (timeMinutes) params.set('since_minutes', timeMinutes);
            
            const response = await fetch(`${API_BASE}/api/logs?${params}`);
            const data = await response.json();
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            showToast(`Exported ${data.logs.length} log entries`);
        } catch (err) {
            showToast('Export failed: ' + err.message);
        }
    }
    
    // Clear old logs
    async function clearLogs() {
        const days = prompt('Delete logs older than how many days? (0 = delete all)', '7');
        if (days === null) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/logs?retention_days=${days}`, { method: 'DELETE' });
            const data = await response.json();
            showToast(data.message);
            refreshLogs();
            refreshStats();
        } catch (err) {
            showToast('Clear failed: ' + err.message);
        }
    }
    
    // Helpers
    function getStatusClass(status) {
        if (status >= 500) return 's5xx';
        if (status >= 400) return 's4xx';
        if (status >= 300) return 's3xx';
        return 's2xx';
    }
    
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    function syntaxHighlight(json) {
        if (!json) return '';
        json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return json.replace(
            /("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g,
            function (match) {
                let cls = 'color: var(--orange)'; // number
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'color: var(--accent)'; // key
                    } else {
                        cls = 'color: var(--green)'; // string
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'color: var(--purple)'; // boolean
                } else if (/null/.test(match)) {
                    cls = 'color: var(--red)'; // null
                }
                return '<span style="' + cls + '">' + match + '</span>';
            }
        );
    }
    
    function showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
</script>

</body>
</html>
"""
