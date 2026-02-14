"""
Maestro — The AI Content Orchestrator (v2).

┌──────────────────────────────────────────────────────────────────────┐
│  ARCHITECTURE RULE — Agent ↔ Brand relationship:                     │
│                                                                      │
│  • Number of AI agents MUST equal number of brands (5 brands =       │
│    5 agents). Each agent is "born from" one brand (created_for_brand) │
│    but that's just for tracking lineage + evolution.                  │
│                                                                      │
│  • Every agent generates content for EVERY brand in the daily burst. │
│    The 1:1 mapping is organisational, not a content restriction.      │
│                                                                      │
│  • Enforced by: seed_builtin_agents() on startup,                    │
│    _ensure_agents_for_all_brands() in healing cycle (every 15min),   │
│    auto-provision on brand creation (brand_manager.py).               │
└──────────────────────────────────────────────────────────────────────┘

Maestro runs a DAILY BURST once per day:
  1. ALL active agents × ALL brands × proposals_per_brand × 2 (reel+post)
  2. Each proposal → 1 job = 1 reel OR 1 post (NO content duplication)
  3. Auto-schedule into daily slots per brand
  4. Publishing daemon posts at scheduled times

Design:
  - Pause/Resume controlled by user, state persisted in DB
  - Survives Railway redeploys: reads is_paused + last_daily_run from DB
  - Daily burst runs ONCE per day (not every 45min)
  - Feedback loop: checks reel performance 48-72h after publish
  - Observe & Scout cycles run independently for intelligence gathering
  - Brand @handle baked into caption at generation time (not replaced later)
  - Population guard in healing cycle auto-spawns agents for new brands
"""

import os
import threading
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

# Lisbon/Portugal timezone — burst at noon local time
LISBON_TZ = ZoneInfo("Europe/Lisbon")

# Brand Instagram handles (for caption @brandhandle replacement)
BRAND_HANDLES = {
    "healthycollege": "@thehealthycollege",
    "vitalitycollege": "@thevitalitycollege",
    "longevitycollege": "@thelongevitycollege",
    "holisticcollege": "@theholisticcollege",
    "wellbeingcollege": "@thewellbeingcollege",
}


# ── Configuration ─────────────────────────────────────────────

# Check cycle: how often to check if daily burst should run
CHECK_CYCLE_MINUTES = int(os.getenv("MAESTRO_CHECK_MINUTES", "10"))

# Observe & Scout cycles remain the same
METRICS_CYCLE_MINUTES = int(os.getenv("MAESTRO_METRICS_MINUTES", "180"))
SCAN_CYCLE_MINUTES = int(os.getenv("MAESTRO_SCAN_MINUTES", "240"))

# Feedback cycle: check performance of reels published 48-72h ago
FEEDBACK_CYCLE_MINUTES = int(os.getenv("MAESTRO_FEEDBACK_MINUTES", "360"))

# Healing cycle: scan for failed jobs, retry, notify
HEALING_CYCLE_MINUTES = int(os.getenv("MAESTRO_HEALING_MINUTES", "15"))
MAX_AUTO_RETRIES = int(os.getenv("MAESTRO_MAX_AUTO_RETRIES", "2"))  # Max retries per job

# Evolution cycle: weekly natural selection (default: Sunday at 2 AM Lisbon time)
EVOLUTION_DAY = os.getenv("MAESTRO_EVOLUTION_DAY", "sun")  # Day of week
EVOLUTION_HOUR = int(os.getenv("MAESTRO_EVOLUTION_HOUR", "2"))  # Hour (0-23)

# Diagnostics cycle: self-testing (every 4 hours)
DIAGNOSTICS_CYCLE_MINUTES = int(os.getenv("MAESTRO_DIAGNOSTICS_MINUTES", "240"))

# Bootstrap cycle: aggressive-but-safe research during cold-start (every 20 minutes)
# Auto-disables after maturity (50+ own-account entries OR 150+ total trending OR 14 days)
BOOTSTRAP_CYCLE_MINUTES = int(os.getenv("MAESTRO_BOOTSTRAP_MINUTES", "20"))
BOOTSTRAP_MAX_DAYS = int(os.getenv("MAESTRO_BOOTSTRAP_MAX_DAYS", "14"))

# Job timeout: if a job is stuck in "generating" or "pending" for longer than this, mark it failed
JOB_TIMEOUT_MINUTES = int(os.getenv("MAESTRO_JOB_TIMEOUT_MINUTES", "30"))

STARTUP_DELAY_SECONDS = 30

# ── Concurrency Control ───────────────────────────────────────
# Limit concurrent FFmpeg/generation processes to avoid "Resource temporarily unavailable"
MAX_CONCURRENT_JOBS = int(os.getenv("MAESTRO_MAX_CONCURRENT_JOBS", "3"))
JOB_STAGGER_DELAY = int(os.getenv("MAESTRO_JOB_STAGGER_SECONDS", "8"))  # seconds between job launches
_job_semaphore = threading.Semaphore(MAX_CONCURRENT_JOBS)

# Daily burst: dynamic — N agents × M brands × proposals_per_brand
# Each proposal is for ONE specific brand with the correct @handle
# Number of agents equals number of brands (automatically)
PROPOSALS_PER_BRAND_PER_AGENT = 6  # 6 reels per brand
POSTS_PER_BRAND = 2  # 2 posts per brand per day (morning + afternoon slots)

def _get_all_brands() -> List[str]:
    """Load brand IDs from DB (dynamic, not hardcoded)."""
    from app.services.brand_resolver import brand_resolver
    ids = brand_resolver.get_all_brand_ids()
    return ids if ids else ["healthycollege"]


def _get_all_brands_list() -> List[str]:
    """Alias kept for backward-compat; prefer _get_all_brands()."""
    return _get_all_brands()

# Dynamic — always call _get_all_brands() instead of using this directly
ALL_BRANDS = _get_all_brands()


# ── DB-Persisted State ───────────────────────────────────────

def _db_get(key: str, default: str = "") -> str:
    """Read a config value from DB (survives redeploys)."""
    try:
        from app.db_connection import SessionLocal
        from app.models import MaestroConfig
        db = SessionLocal()
        try:
            return MaestroConfig.get(db, key, default)
        finally:
            db.close()
    except Exception as e:
        print(f"[MAESTRO] _db_get({key}) failed, using default '{default}': {e}", flush=True)
        return default


def _db_set(key: str, value: str) -> bool:
    """Write a config value to DB (survives redeploys). Returns True if persisted."""
    try:
        from app.db_connection import SessionLocal
        from app.models import MaestroConfig
        db = SessionLocal()
        try:
            MaestroConfig.set(db, key, value)
        finally:
            db.close()
        return True
    except Exception as e:
        print(f"[MAESTRO] Failed to persist {key}: {e}", flush=True)
        return False


def is_paused() -> bool:
    """Check if Maestro is paused (DB-persisted). Default: paused on first-ever run."""
    return _db_get("is_paused", "true") == "true"


def set_paused(paused: bool) -> bool:
    """Set paused state (DB-persisted). Returns True if successfully persisted."""
    value = "true" if paused else "false"
    if not _db_set("is_paused", value):
        print(f"[MAESTRO] CRITICAL: set_paused({paused}) failed to persist!", flush=True)
        return False
    # Verify the write by reading back
    actual = _db_get("is_paused", "")
    if actual != value:
        print(f"[MAESTRO] CRITICAL: set_paused({paused}) verify failed! Wrote '{value}' but read back '{actual}'", flush=True)
        return False
    return True


def is_posts_paused() -> bool:
    """Check if post generation is paused (DB-persisted). Default: not paused."""
    return _db_get("posts_paused", "false") == "true"


def set_posts_paused(paused: bool) -> bool:
    """Set posts-paused state (DB-persisted). Returns True if successfully persisted."""
    value = "true" if paused else "false"
    if not _db_set("posts_paused", value):
        print(f"[MAESTRO] CRITICAL: set_posts_paused({paused}) failed to persist!", flush=True)
        return False
    actual = _db_get("posts_paused", "")
    if actual != value:
        print(f"[MAESTRO] CRITICAL: set_posts_paused({paused}) verify failed!", flush=True)
        return False
    return True


def get_last_daily_run() -> Optional[datetime]:
    """Get the last time the daily burst ran."""
    val = _db_get("last_daily_run", "")
    if val:
        try:
            return datetime.fromisoformat(val)
        except Exception:
            pass
    return None


def set_last_daily_run(dt: datetime):
    """Record when the daily burst ran."""
    _db_set("last_daily_run", dt.isoformat())


# ── Maestro State (in-memory, rebuilt on deploy) ──────────────

class AgentState:
    """Per-agent tracking."""

    def __init__(self, name: str):
        self.name = name
        self.proposals_today: int = 0
        self.total_proposals: int = 0
        self.last_thought: Optional[str] = None
        self.last_thought_at: Optional[datetime] = None
        self.errors: int = 0

    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "proposals_today": self.proposals_today,
            "total_proposals": self.total_proposals,
            "last_thought": self.last_thought,
            "last_thought_at": self.last_thought_at.isoformat() if self.last_thought_at else None,
            "errors": self.errors,
        }


class MaestroState:
    """In-memory state for the Maestro orchestrator."""

    def __init__(self):
        self.started_at: datetime = datetime.utcnow()

        # Agent sub-states (dynamic — loaded from DB, falls back to toby+lexi)
        self.agents: Dict[str, AgentState] = {}
        self._init_agent_states()

        # Cycle stats
        self.total_cycles: int = 0
        self.total_proposals_generated: int = 0
        self.total_jobs_dispatched: int = 0
        self.total_metrics_collected: int = 0
        self.total_trends_found: int = 0
        self.errors: int = 0

        # What's happening right now
        self.current_agent: Optional[str] = None
        self.current_phase: Optional[str] = None  # "generating", "processing", "scheduling"

        # Timestamps
        self.last_metrics_at: Optional[datetime] = None
        self.last_scan_at: Optional[datetime] = None
        self.last_feedback_at: Optional[datetime] = None
        self.last_healing_at: Optional[datetime] = None
        self.last_evolution_at: Optional[datetime] = None
        self.last_diagnostics_at: Optional[datetime] = None
        self.last_diagnostics_status: Optional[str] = None  # "healthy"/"degraded"/"critical"

        # Bootstrap (cold-start research)
        self.last_bootstrap_at: Optional[datetime] = None
        self.bootstrap_complete: bool = False
        self.bootstrap_ticks: int = 0
        self.bootstrap_items_collected: int = 0

        # Healing stats
        self.total_healed: int = 0          # Jobs successfully retried
        self.total_healing_failures: int = 0 # Jobs that failed even after retry
        self.healing_notifications: List[Dict] = []  # Creator notifications

        # Activity log — unified for all agents
        self.activity_log: List[Dict] = []

    def _init_agent_states(self):
        """Load agent names from DB and create AgentState for each."""
        try:
            from app.db_connection import SessionLocal
            from app.models import AIAgent as AIAgentModel
            db = SessionLocal()
            try:
                agents = db.query(AIAgentModel).filter(AIAgentModel.active == True).all()
                for a in agents:
                    self.agents[a.agent_id] = AgentState(a.agent_id)
            finally:
                db.close()
        except Exception:
            pass
        # Ensure at least toby + lexi exist
        for name in ["toby", "lexi"]:
            if name not in self.agents:
                self.agents[name] = AgentState(name)

    def ensure_agent_state(self, agent_id: str):
        """Lazily create an AgentState if a new agent appears."""
        if agent_id not in self.agents:
            self.agents[agent_id] = AgentState(agent_id)

    def _get_daily_config(self) -> Dict:
        """Build daily config dict dynamically from DB agents + brands.

        Formula: 6 reels + 2 posts per brand.
        Posts can be paused via is_posts_paused().
        Proposals are split evenly across agents (round-robin).
        """
        try:
            from app.services.generic_agent import get_all_active_agents
            agents = get_all_active_agents()
            brands = _get_all_brands()
            n_brands = len(brands)
            reels_per_brand = PROPOSALS_PER_BRAND_PER_AGENT  # 6
            posts_per_brand = POSTS_PER_BRAND  # 2
            reels_total = reels_per_brand * n_brands
            posts_total = posts_per_brand * n_brands
            total = reels_total + posts_total

            return {
                "agents": [{"id": a.agent_id, "name": a.display_name, "variant": a.variant,
                            "proposals_per_brand": a.proposals_per_brand} for a in agents],
                "brands": brands,
                "total_agents": len(agents),
                "total_brands": n_brands,
                "total_proposals": total,
                "total_reels": reels_total,
                "total_posts": posts_total,
                "reels_per_brand": reels_per_brand,
                "posts_per_brand": posts_per_brand,
                "jobs_per_day": total,
            }
        except Exception:
            n_brands = len(ALL_BRANDS)
            reels = PROPOSALS_PER_BRAND_PER_AGENT * n_brands  # 3 per brand
            posts = POSTS_PER_BRAND * n_brands
            return {
                "proposals_per_brand_per_agent": PROPOSALS_PER_BRAND_PER_AGENT,
                "brands": ALL_BRANDS,
                "total_proposals": reels + posts,
                "total_reels": reels,
                "total_posts": posts,
                "reels_per_brand": PROPOSALS_PER_BRAND_PER_AGENT,
                "posts_per_brand": POSTS_PER_BRAND,
                "jobs_per_day": reels + posts,
                "fallback": True,
            }

    def log(self, agent: str, action: str, detail: str = "", emoji: str = "🤖", level: str = "action"):
        entry = {
            "time": datetime.utcnow().isoformat(),
            "agent": agent,
            "action": action,
            "detail": detail,
            "emoji": emoji,
            "level": level,
        }
        self.activity_log.insert(0, entry)
        if len(self.activity_log) > 500:
            self.activity_log = self.activity_log[:500]

        if level == "action" and agent in self.agents:
            self.agents[agent].last_thought = f"{action}: {detail}" if detail else action
            self.agents[agent].last_thought_at = datetime.utcnow()

        prefix_map = {"action": "🤖", "detail": "  ├─", "api": "  🌐", "data": "  📊"}
        prefix = prefix_map.get(level, "  ")
        tag = agent.upper()
        print(f"   {prefix} [{tag}] {action} — {detail}", flush=True)

    def to_dict(self) -> Dict:
        now = datetime.utcnow()
        uptime = (now - self.started_at).total_seconds() if self.started_at else 0
        paused = is_paused()
        last_run = get_last_daily_run()

        return {
            "is_running": not paused,
            "is_paused": paused,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "uptime_seconds": int(uptime),
            "uptime_human": _format_uptime(uptime),
            "current_agent": self.current_agent,
            "current_phase": self.current_phase,
            "last_daily_run": last_run.isoformat() if last_run else None,
            "last_daily_run_human": _time_ago(last_run) if last_run else "never",
            "total_cycles": self.total_cycles,
            "total_proposals_generated": self.total_proposals_generated,
            "total_jobs_dispatched": self.total_jobs_dispatched,
            "total_metrics_collected": self.total_metrics_collected,
            "total_trends_found": self.total_trends_found,
            "errors": self.errors,
            "agents": {
                name: agent.to_dict() for name, agent in self.agents.items()
            },
            "healing": {
                "last_healing_at": self.last_healing_at.isoformat() if self.last_healing_at else None,
                "last_healing_human": _time_ago(self.last_healing_at) if self.last_healing_at else "never",
                "total_healed": self.total_healed,
                "total_healing_failures": self.total_healing_failures,
                "recent_notifications": self.healing_notifications[:20],
            },
            "evolution": {
                "last_evolution_at": self.last_evolution_at.isoformat() if self.last_evolution_at else None,
                "last_evolution_human": _time_ago(self.last_evolution_at) if self.last_evolution_at else "never",
                "schedule": f"{EVOLUTION_DAY} @ {EVOLUTION_HOUR}:00",
            },
            "diagnostics": {
                "last_diagnostics_at": self.last_diagnostics_at.isoformat() if self.last_diagnostics_at else None,
                "last_diagnostics_human": _time_ago(self.last_diagnostics_at) if self.last_diagnostics_at else "never",
                "last_status": self.last_diagnostics_status,
                "cycle_minutes": DIAGNOSTICS_CYCLE_MINUTES,
            },
            "bootstrap": {
                "last_bootstrap_at": self.last_bootstrap_at.isoformat() if self.last_bootstrap_at else None,
                "last_bootstrap_human": _time_ago(self.last_bootstrap_at) if self.last_bootstrap_at else "never",
                "is_complete": self.bootstrap_complete,
                "total_ticks": self.bootstrap_ticks,
                "items_collected": self.bootstrap_items_collected,
                "cycle_minutes": BOOTSTRAP_CYCLE_MINUTES,
            },
            "recent_activity": self.activity_log[:30],
            "daily_config": self._get_daily_config(),
        }


def _format_uptime(seconds: float) -> str:
    if seconds < 60:
        return f"{int(seconds)}s"
    if seconds < 3600:
        return f"{int(seconds // 60)}m {int(seconds % 60)}s"
    hours = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    if hours < 24:
        return f"{hours}h {mins}m"
    days = hours // 24
    hours = hours % 24
    return f"{days}d {hours}h {mins}m"


def _time_ago(dt: Optional[datetime]) -> str:
    if not dt:
        return "never"
    diff = (datetime.utcnow() - dt).total_seconds()
    return _format_uptime(diff) + " ago"
