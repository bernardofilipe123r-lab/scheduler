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
    try:
        from app.db_connection import SessionLocal
        from app.models import Brand
        db = SessionLocal()
        try:
            brands = db.query(Brand.id).filter(Brand.active == True).all()
            return [b[0] for b in brands] if brands else [
                "healthycollege", "vitalitycollege", "longevitycollege",
                "holisticcollege", "wellbeingcollege",
            ]
        finally:
            db.close()
    except Exception:
        return [
            "healthycollege", "vitalitycollege", "longevitycollege",
            "holisticcollege", "wellbeingcollege",
        ]

ALL_BRANDS = [
    "healthycollege", "vitalitycollege", "longevitycollege",
    "holisticcollege", "wellbeingcollege",
]


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


# ── The Maestro Daemon ────────────────────────────────────────

class MaestroDaemon:
    """
    The orchestrator — manages all AI agents.

    Cycles:
      1. CHECK   (every 10min) — Checks if daily burst should run
      2. HEALING (every 15min) — Scans for failed jobs, auto-retries, notifies creator
      3. OBSERVE (every 3h)    — Collect metrics
      4. SCOUT   (every 4h)    — Scan trends
      5. FEEDBACK (every 6h)   — Check 48-72h post performance
      6. EVOLUTION (weekly)    — Natural selection: retire weak agents, spawn new ones
      7. DIAGNOSTICS (every 4h) — Self-testing: validate all subsystems
      8. BOOTSTRAP (every 20min) — Cold-start research: safe incremental API polling
    """

    def __init__(self):
        self.state = MaestroState()
        self.scheduler: Optional[BackgroundScheduler] = None
        self._daily_burst_lock = threading.Lock()
        self.state.log("maestro", "Initializing", "Maestro orchestrator created", "🎼")

    def start(self):
        """Start Maestro background jobs. Called on every deployment."""
        # Ensure posts are never paused (legacy cleanup)
        _db_set("posts_paused", "false")

        self.scheduler = BackgroundScheduler()

        # Check cycle — checks if daily burst should run
        self.scheduler.add_job(
            self._check_cycle,
            trigger=IntervalTrigger(minutes=CHECK_CYCLE_MINUTES),
            id="maestro_check",
            name="Maestro Check Cycle",
            next_run_time=datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS),
            replace_existing=True,
            max_instances=1,
        )

        # Observe cycle — metrics (runs regardless of pause state)
        self.scheduler.add_job(
            self._observe_cycle,
            trigger=IntervalTrigger(minutes=METRICS_CYCLE_MINUTES),
            id="maestro_observe",
            name="Maestro Observe Cycle",
            next_run_time=datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS + 60),
            replace_existing=True,
            max_instances=1,
        )

        # Scout cycle — trends (runs regardless of pause state)
        self.scheduler.add_job(
            self._scout_cycle,
            trigger=IntervalTrigger(minutes=SCAN_CYCLE_MINUTES),
            id="maestro_scout",
            name="Maestro Scout Cycle",
            next_run_time=datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS + 120),
            replace_existing=True,
            max_instances=1,
        )

        # Feedback cycle — performance check (runs regardless of pause state)
        self.scheduler.add_job(
            self._feedback_cycle,
            trigger=IntervalTrigger(minutes=FEEDBACK_CYCLE_MINUTES),
            id="maestro_feedback",
            name="Maestro Feedback Cycle",
            next_run_time=datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS + 300),
            replace_existing=True,
            max_instances=1,
        )

        # Healing cycle — scan for failed jobs, auto-retry, notify creator
        self.scheduler.add_job(
            self._healing_cycle,
            trigger=IntervalTrigger(minutes=HEALING_CYCLE_MINUTES),
            id="maestro_healing",
            name="Maestro Healing Cycle",
            next_run_time=datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS + 180),
            replace_existing=True,
            max_instances=1,
        )

        # Evolution cycle — weekly natural selection (Sunday 2 AM Lisbon)
        self.scheduler.add_job(
            self._evolution_cycle,
            trigger=CronTrigger(
                day_of_week=EVOLUTION_DAY,
                hour=EVOLUTION_HOUR,
                minute=0,
                timezone=LISBON_TZ,
            ),
            id="maestro_evolution",
            name="Maestro Evolution Cycle",
            replace_existing=True,
            max_instances=1,
        )

        # Diagnostics cycle — self-testing (every 4h)
        self.scheduler.add_job(
            self._diagnostics_cycle,
            trigger=IntervalTrigger(minutes=DIAGNOSTICS_CYCLE_MINUTES),
            id="maestro_diagnostics",
            name="Maestro Diagnostics Cycle",
            next_run_time=datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS + 60),
            replace_existing=True,
            max_instances=1,
        )

        # Bootstrap cycle — cold-start research (every 20min, auto-disables)
        self.scheduler.add_job(
            self._bootstrap_cycle,
            trigger=IntervalTrigger(minutes=BOOTSTRAP_CYCLE_MINUTES),
            id="maestro_bootstrap",
            name="Maestro Bootstrap Cycle",
            next_run_time=datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS + 45),
            replace_existing=True,
            max_instances=1,
        )

        self.scheduler.start()
        self.state.started_at = datetime.utcnow()

        paused = is_paused()
        status_text = "PAUSED (waiting for Resume)" if paused else "RUNNING"
        self.state.log(
            "maestro", "Started",
            f"Status: {status_text}. Check {CHECK_CYCLE_MINUTES}m, Healing {HEALING_CYCLE_MINUTES}m, Observe {METRICS_CYCLE_MINUTES}m, Scout {SCAN_CYCLE_MINUTES}m, Feedback {FEEDBACK_CYCLE_MINUTES}m, Evolution {EVOLUTION_DAY}@{EVOLUTION_HOUR}:00, Diagnostics {DIAGNOSTICS_CYCLE_MINUTES}m, Bootstrap {BOOTSTRAP_CYCLE_MINUTES}m (auto-disable)",
            "🚀"
        )

    def get_status(self) -> Dict:
        """Get full orchestrator status."""
        # Refresh today's proposal counts from DB
        try:
            self._refresh_agent_counts()
        except Exception:
            pass

        return self.state.to_dict()

    def _refresh_agent_counts(self):
        """Refresh per-agent today's proposal counts from DB (dynamic)."""
        from app.db_connection import SessionLocal
        from app.models import TobyProposal

        db = SessionLocal()
        try:
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            for agent_name in list(self.state.agents.keys()):
                count = (
                    db.query(TobyProposal)
                    .filter(TobyProposal.agent_name == agent_name)
                    .filter(TobyProposal.created_at >= today)
                    .count()
                )
                self.state.agents[agent_name].proposals_today = count
        finally:
            db.close()

    # ──────────────────────────────────────────────────────────
    # CYCLE: CHECK — Should we run the daily burst?
    # ──────────────────────────────────────────────────────────

    def _check_cycle(self):
        """
        Runs every 10 minutes. Checks:
          1. Schedule any ready-to-schedule reels first
          2. Is Maestro paused? → skip burst
          3. Has the daily burst already run today? → skip burst
          4. Is it past 12PM Lisbon time? → run burst
          5. Otherwise → wait until noon
        """
        # Always schedule ready reels, even when paused
        try:
            count = schedule_all_ready_reels()
            if count > 0:
                self.state.log("maestro", "Auto-scheduled ready reels", f"{count} brand-reels scheduled from completed jobs", "📅")
        except Exception as e:
            self.state.log("maestro", "Schedule-ready error", str(e)[:200], "❌")

        if is_paused():
            return  # Silent — don't spam logs when paused

        # Use Lisbon timezone for daily scheduling
        now_lisbon = datetime.now(LISBON_TZ)
        today_lisbon = now_lisbon.replace(hour=0, minute=0, second=0, microsecond=0)

        last_run = get_last_daily_run()
        if last_run:
            # Convert last_run to Lisbon timezone for comparison
            if last_run.tzinfo is None:
                last_run_aware = last_run.replace(tzinfo=timezone.utc)
            else:
                last_run_aware = last_run
            last_run_lisbon = last_run_aware.astimezone(LISBON_TZ)
            if last_run_lisbon >= today_lisbon:
                # Already ran today (Lisbon time)
                return

        # Wait until 12PM Lisbon time before bursting
        if now_lisbon.hour < 12:
            return  # Not noon yet in Lisbon — wait

        # Time to run the daily burst!
        self.state.log("maestro", "Daily burst triggered", f"12PM Lisbon ({now_lisbon.strftime('%H:%M %Z')}) — generating for tomorrow", "🌅")
        self._run_daily_burst()

    # ──────────────────────────────────────────────────────────
    # DAILY BURST — The main event
    # ──────────────────────────────────────────────────────────

    def _run_daily_burst(self):
        """
        Generate proposals using ALL active agents across ALL brands.
        N agents × M brands × proposals_per_brand × 2 (reel + post) = total proposals.
        Each proposal = 1 job = 1 reel OR 1 post. NO content duplication across brands.

        Phase 1: Generate REEL proposals (6 per brand = 30 total)
        Phase 2: Generate POST proposals (6 per brand = 30 total)
        Total: ~60 unique proposals/jobs per burst.

        Agents are loaded dynamically from the ai_agents DB table.
        Falls back to legacy Toby + Lexi if GenericAgent system fails.
        """
        if not self._daily_burst_lock.acquire(blocking=False):
            self.state.log("maestro", "Burst skipped", "Already running", "⏳")
            return

        try:
            self.state.total_cycles += 1
            self.state.current_phase = "generating"
            burst_start = datetime.utcnow()

            # Load dynamic agents from DB
            try:
                from app.services.generic_agent import get_all_active_agents
                active_agents = get_all_active_agents()
            except Exception as e:
                self.state.log("maestro", "Agent load error", f"Falling back to legacy: {e}", "⚠️")
                active_agents = []

            # Load dynamic brand list
            brands = _get_all_brands()

            # Calculate correct per-brand totals
            reels_per_brand = PROPOSALS_PER_BRAND_PER_AGENT  # 6
            posts_per_brand = POSTS_PER_BRAND  # 2
            total_expected = (reels_per_brand + posts_per_brand) * len(brands)

            if active_agents:
                agent_names = ", ".join(a.display_name for a in active_agents)
                self.state.log(
                    "maestro", "🌅 Daily Burst Started",
                    f"~{total_expected} proposals — {len(active_agents)} agents ({agent_names}) × {len(brands)} brands",
                    "🚀"
                )
            else:
                self.state.log(
                    "maestro", "🌅 Daily Burst Started (legacy)",
                    f"Using legacy Toby + Lexi — {len(brands)} brands",
                    "🚀"
                )

            all_proposals = []

            if active_agents:
                # ── Dynamic agents path ──
                # Distribute proposals across agents round-robin:
                # 3 reels per brand total, split among N agents
                n_agents = len(active_agents)

                # Phase 1: REEL proposals
                self.state.log("maestro", "Phase 1: Reels", f"Generating {reels_per_brand} reel proposals per brand for {len(brands)} brands...", "🎬")
                for brand in brands:
                    remaining = reels_per_brand  # 3 per brand total
                    for i, agent in enumerate(active_agents):
                        if remaining <= 0:
                            break
                        ppb = max(1, remaining // (n_agents - i))  # distribute evenly
                        remaining -= ppb
                        try:
                            self.state.current_agent = agent.agent_id
                            self.state.ensure_agent_state(agent.agent_id)
                            self.state.log(
                                agent.agent_id, "Generating",
                                f"{ppb} {agent.variant} reels for {brand}",
                                "🧠"
                            )
                            result = agent.run(
                                max_proposals=ppb,
                                content_type="reel",
                                brand=brand,
                            )
                            agent_proposals = result.get("proposals", [])
                            all_proposals.extend(agent_proposals)
                            self.state.agents[agent.agent_id].total_proposals += len(agent_proposals)
                            self.state.log(
                                agent.agent_id, f"Done ({brand})",
                                f"{len(agent_proposals)} reel proposals",
                                "✅"
                            )
                        except Exception as e:
                            self.state.errors += 1
                            if agent.agent_id in self.state.agents:
                                self.state.agents[agent.agent_id].errors += 1
                            self.state.log(
                                agent.agent_id, "Error",
                                f"Reel generation failed for {brand}: {str(e)[:200]}",
                                "❌"
                            )
                            traceback.print_exc()

                reel_count = len(all_proposals)

                # Phase 2: POST proposals
                self.state.log("maestro", "Phase 2: Posts", f"Generating {posts_per_brand} post proposals per brand for {len(brands)} brands...", "📄")
                for brand in brands:
                    remaining = posts_per_brand  # 2 per brand total
                    for i, agent in enumerate(active_agents):
                        if remaining <= 0:
                            break
                        ppb = max(1, remaining // (n_agents - i))
                        remaining -= ppb
                        try:
                            self.state.current_agent = agent.agent_id
                            self.state.log(
                                agent.agent_id, "Generating",
                                f"{ppb} posts for {brand}",
                                "📄"
                            )
                            result = agent.run(
                                max_proposals=ppb,
                                content_type="post",
                                brand=brand,
                            )
                            agent_proposals = result.get("proposals", [])
                            all_proposals.extend(agent_proposals)
                            self.state.agents[agent.agent_id].total_proposals += len(agent_proposals)
                            self.state.log(
                                agent.agent_id, f"Done ({brand})",
                                f"{len(agent_proposals)} post proposals",
                                "✅"
                            )
                        except Exception as e:
                            self.state.errors += 1
                            if agent.agent_id in self.state.agents:
                                self.state.agents[agent.agent_id].errors += 1
                            self.state.log(
                                agent.agent_id, "Error",
                                f"Post generation failed for {brand}: {str(e)[:200]}",
                                "❌"
                            )
                            traceback.print_exc()
                post_count = len(all_proposals) - reel_count

                self.state.log("maestro", "Both phases done", f"{reel_count} reels + {post_count} posts = {len(all_proposals)} total", "📊")

            else:
                # ── Legacy fallback (Toby + Lexi hardcoded) ──
                for brand in brands:
                    brand_handle = BRAND_HANDLES.get(brand, brand)

                    # Reels
                    try:
                        self.state.current_agent = "toby"
                        from app.services.toby_agent import get_toby_agent
                        toby = get_toby_agent()
                        self.state.log("toby", "Generating", f"{PROPOSALS_PER_BRAND_PER_AGENT} dark reels for {brand} ({brand_handle})", "🧠")
                        toby_result = toby.run(max_proposals=PROPOSALS_PER_BRAND_PER_AGENT, content_type="reel", brand=brand)
                        toby_proposals = toby_result.get("proposals", [])
                        all_proposals.extend(toby_proposals)
                        self.state.agents["toby"].total_proposals += len(toby_proposals)
                        self.state.log("toby", f"Done ({brand})", f"{len(toby_proposals)} dark proposals", "✅")
                    except Exception as e:
                        self.state.errors += 1
                        self.state.agents["toby"].errors += 1
                        self.state.log("toby", "Error", f"Generation failed for {brand}: {str(e)[:200]}", "❌")
                        traceback.print_exc()

                    try:
                        self.state.current_agent = "lexi"
                        from app.services.lexi_agent import get_lexi_agent
                        lexi = get_lexi_agent()
                        self.state.log("lexi", "Generating", f"{PROPOSALS_PER_BRAND_PER_AGENT} light reels for {brand} ({brand_handle})", "📊")
                        lexi_result = lexi.run(max_proposals=PROPOSALS_PER_BRAND_PER_AGENT, content_type="reel", brand=brand)
                        lexi_proposals = lexi_result.get("proposals", [])
                        all_proposals.extend(lexi_proposals)
                        self.state.agents["lexi"].total_proposals += len(lexi_proposals)
                        self.state.log("lexi", f"Done ({brand})", f"{len(lexi_proposals)} light proposals", "✅")
                    except Exception as e:
                        self.state.errors += 1
                        self.state.agents["lexi"].errors += 1
                        self.state.log("lexi", "Error", f"Generation failed for {brand}: {str(e)[:200]}", "❌")
                        traceback.print_exc()

                    # Posts (legacy: both agents generate posts too)
                    try:
                        self.state.current_agent = "toby"
                        toby = get_toby_agent()
                        self.state.log("toby", "Generating", f"{PROPOSALS_PER_BRAND_PER_AGENT} posts for {brand}", "📄")
                        toby_post_result = toby.run(max_proposals=PROPOSALS_PER_BRAND_PER_AGENT, content_type="post", brand=brand)
                        toby_post_proposals = toby_post_result.get("proposals", [])
                        all_proposals.extend(toby_post_proposals)
                        self.state.agents["toby"].total_proposals += len(toby_post_proposals)
                    except Exception as e:
                        self.state.errors += 1
                        traceback.print_exc()

                    try:
                        self.state.current_agent = "lexi"
                        lexi = get_lexi_agent()
                        self.state.log("lexi", "Generating", f"{PROPOSALS_PER_BRAND_PER_AGENT} posts for {brand}", "📄")
                        lexi_post_result = lexi.run(max_proposals=PROPOSALS_PER_BRAND_PER_AGENT, content_type="post", brand=brand)
                        lexi_post_proposals = lexi_post_result.get("proposals", [])
                        all_proposals.extend(lexi_post_proposals)
                        self.state.agents["lexi"].total_proposals += len(lexi_post_proposals)
                    except Exception as e:
                        self.state.errors += 1
                        traceback.print_exc()

            self.state.total_proposals_generated += len(all_proposals)

            if not all_proposals:
                self.state.log("maestro", "Burst empty", "No proposals generated", "⚠️")
                set_last_daily_run(datetime.utcnow())
                return

            self.state.log(
                "maestro", "Proposals ready",
                f"{len(all_proposals)} unique proposals — each proposal = 1 brand-specific job",
                "⚡"
            )

            # First, schedule any existing ready-to-schedule reels
            try:
                ready_count = schedule_all_ready_reels()
                if ready_count > 0:
                    self.state.log("maestro", "Pre-burst scheduling", f"Scheduled {ready_count} previously ready brand-reels", "📅")
            except Exception as e:
                self.state.log("maestro", "Pre-burst schedule error", str(e)[:200], "❌")

            # Auto-accept each proposal and create its single job
            self.state.current_phase = "processing"
            self._auto_accept_and_process(all_proposals)

            # Record daily run
            set_last_daily_run(datetime.utcnow())

            elapsed = (datetime.utcnow() - burst_start).total_seconds()
            self.state.log(
                "maestro", "🌅 Daily Burst Complete",
                f"{len(all_proposals)} unique proposals = {len(all_proposals)} jobs dispatched. Took {elapsed:.0f}s.",
                "🏁"
            )

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Burst error", f"{str(e)[:200]}", "❌")
            traceback.print_exc()
            set_last_daily_run(datetime.utcnow())  # Don't retry forever on error
        finally:
            self.state.current_agent = None
            self.state.current_phase = None
            self._daily_burst_lock.release()

    def _auto_accept_and_process(self, proposals: List[Dict]):
        """
        For each proposal:
          1. Run through Maestro Examiner quality gate (DeepSeek scoring)
          2. If PASSED: accept, create job, process
          3. If REJECTED: mark rejected with scores/reason, regenerate replacement
          4. Replacement gets one more chance through the gate (max 1 retry)

        Result: ~60 proposals examined → accepted ones become jobs, rejected ones
        get replacement attempts. Maintains volume while filtering bad content.
        """
        from app.db_connection import SessionLocal, get_db_session
        from app.models import TobyProposal
        from app.services.job_manager import JobManager
        from app.services.maestro_examiner import examine_proposal

        MAX_RETRIES = 1  # Max replacement attempts per rejected proposal
        total_examined = 0
        total_accepted = 0
        total_rejected = 0
        total_replaced = 0

        for p_dict in proposals:
            proposal_id = p_dict.get("proposal_id")
            if not proposal_id:
                continue

            try:
                self._examine_and_process_single(
                    p_dict, proposal_id, examine_proposal,
                    retry_count=0, max_retries=MAX_RETRIES,
                    stats={"examined": 0, "accepted": 0, "rejected": 0, "replaced": 0},
                )
            except Exception as e:
                self.state.log(
                    "maestro", "Auto-accept error",
                    f"{proposal_id}: {str(e)[:200]}",
                    "❌"
                )
                traceback.print_exc()

    def _examine_and_process_single(
        self, p_dict: Dict, proposal_id: str,
        examine_fn, retry_count: int, max_retries: int,
        stats: Dict,
    ):
        """
        Examine one proposal, accept or reject, and optionally regenerate replacement.
        """
        from app.db_connection import SessionLocal, get_db_session
        from app.models import TobyProposal
        from app.services.job_manager import JobManager

        # ── Step 1: Examiner quality gate ──
        exam_result = examine_fn(p_dict)
        passed = exam_result["passed"]
        composite = exam_result["composite_score"]
        scores = exam_result["scores"]
        verdict = exam_result["verdict"]
        reason = exam_result["reason"]
        red_flags = exam_result.get("red_flags_found", [])

        is_retry = retry_count > 0
        retry_label = f" (retry #{retry_count})" if is_retry else ""

        # ── Step 2: Store examiner scores on proposal ──
        db = SessionLocal()
        try:
            proposal = db.query(TobyProposal).filter(
                TobyProposal.proposal_id == proposal_id
            ).first()
            if not proposal or proposal.status != "pending":
                return

            # Save examiner scores regardless of pass/fail
            proposal.examiner_score = composite
            proposal.examiner_avatar_fit = scores.get("avatar_fit")
            proposal.examiner_engagement = scores.get("engagement_potential")
            proposal.examiner_content_quality = scores.get("content_quality")
            proposal.examiner_verdict = verdict
            proposal.examiner_reason = reason
            proposal.examiner_red_flags = red_flags
            proposal.reviewed_at = datetime.utcnow()

            if not passed:
                # ── REJECTED ──
                proposal.status = "rejected"
                proposal.reviewer_notes = f"Maestro Examiner: {reason} (score: {composite:.1f}/10)"
                db.commit()

                agent_name = proposal.agent_name or "toby"
                content_type = getattr(proposal, 'content_type', None) or "reel"
                brand = proposal.brand

                self.state.log(
                    "maestro", f"Rejected{retry_label}",
                    f"{proposal_id} ({content_type}/{brand}) — {composite:.1f}/10 — {reason[:120]}",
                    "🚫"
                )
                if red_flags:
                    self.state.log(
                        "maestro", "Red flags",
                        f"{proposal_id}: {', '.join(red_flags[:3])}",
                        "🚩", "detail"
                    )

                db_data = {
                    "agent_name": agent_name,
                    "content_type": content_type,
                    "brand": brand,
                    "strategy": proposal.strategy,
                }
            else:
                # ── ACCEPTED ──
                proposal.status = "accepted"
                proposal.reviewer_notes = f"Maestro Examiner: PASSED ({composite:.1f}/10)"
                db.commit()

                # Read all fields needed for job creation
                title = proposal.title
                content_lines = proposal.content_lines or []
                slide_texts = proposal.slide_texts
                image_prompt = proposal.image_prompt
                agent_name = proposal.agent_name or "toby"
                brand = proposal.brand
                proposal_variant = proposal.variant
                content_type = getattr(proposal, 'content_type', None) or "reel"

                db_data = None  # Not needed for accepted
        finally:
            db.close()

        if passed:
            # ── Process accepted proposal → create job ──
            self.state.log(
                "maestro", f"Accepted{retry_label}",
                f"{proposal_id} ({content_type}/{brand}) — {composite:.1f}/10 ✓",
                "✅"
            )
            self._create_and_dispatch_job(
                proposal_id=proposal_id,
                title=title,
                content_lines=content_lines,
                slide_texts=slide_texts,
                image_prompt=image_prompt,
                agent_name=agent_name,
                brand=brand,
                proposal_variant=proposal_variant,
                content_type=content_type,
            )
        elif retry_count < max_retries:
            # ── Regenerate replacement ──
            self.state.log(
                "maestro", "Regenerating",
                f"Seeking replacement for {proposal_id} ({db_data['content_type']}/{db_data['brand']})...",
                "🔄"
            )
            self._regenerate_replacement(
                original_proposal_id=proposal_id,
                agent_name=db_data["agent_name"],
                content_type=db_data["content_type"],
                brand=db_data["brand"],
                strategy=db_data.get("strategy"),
                rejection_reason=reason,
                examine_fn=examine_fn,
                retry_count=retry_count + 1,
                max_retries=max_retries,
            )
        else:
            self.state.log(
                "maestro", "Final reject",
                f"{proposal_id} — no replacement found after {max_retries} retries",
                "⏭️", "detail"
            )

    def _create_and_dispatch_job(
        self, proposal_id: str, title: str, content_lines: list,
        slide_texts: list, image_prompt: str, agent_name: str,
        brand: str, proposal_variant: str, content_type: str,
    ):
        """Create a job from an accepted proposal and dispatch it for processing."""
        from app.db_connection import SessionLocal, get_db_session
        from app.models import TobyProposal
        from app.services.job_manager import JobManager

        is_post = (content_type == "post")

        if is_post:
            variant = "post"
            platforms = ["instagram", "facebook"]
        else:
            variant = proposal_variant or ("dark" if agent_name == "toby" else "light")
            platforms = ["instagram", "facebook", "youtube"]

        if not brand:
            self.state.log("maestro", "Warning", f"Proposal {proposal_id} has no brand — skipping", "⚠️")
            return

        # Create ONE job for this brand
        with get_db_session() as jdb:
            manager = JobManager(jdb)
            job_kwargs = dict(
                user_id=proposal_id,
                title=title,
                content_lines=slide_texts if is_post and slide_texts else content_lines,
                brands=[brand],
                variant=variant,
                ai_prompt=image_prompt,
                cta_type="follow_tips",
                platforms=platforms,
            )
            job = manager.create_job(**job_kwargs)
            job_id = job.job_id

        # Store job_id on proposal
        db2 = SessionLocal()
        try:
            p = db2.query(TobyProposal).filter(
                TobyProposal.proposal_id == proposal_id
            ).first()
            if p:
                p.accepted_job_id = job_id
                db2.commit()
        finally:
            db2.close()

        self.state.log(
            agent_name, "Job created",
            f"{proposal_id} → 1 {'post' if is_post else 'reel'} job ({variant} × {brand})",
            "⚙️"
        )

        self.state.total_jobs_dispatched += 1

        # Process in background thread
        import time as _time
        thread = threading.Thread(
            target=self._process_and_schedule_job,
            args=(job_id, proposal_id, agent_name),
            daemon=True,
        )
        thread.start()
        _time.sleep(JOB_STAGGER_DELAY)

    def _regenerate_replacement(
        self, original_proposal_id: str, agent_name: str,
        content_type: str, brand: str, strategy: str,
        rejection_reason: str, examine_fn,
        retry_count: int, max_retries: int,
    ):
        """
        Generate a replacement proposal for a rejected one.
        The replacement goes through the examiner gate again (1 retry max).
        """
        try:
            from app.services.generic_agent import get_all_active_agents

            # Find the agent that created the original proposal
            agents = get_all_active_agents()
            agent = None
            for a in agents:
                if a.agent_id == agent_name:
                    agent = a
                    break

            if not agent:
                # Fallback: use first available agent
                if agents:
                    agent = agents[0]
                else:
                    self.state.log("maestro", "No agents", "Cannot regenerate — no active agents", "⚠️")
                    return

            # Generate 1 replacement proposal
            result = agent.run(
                max_proposals=1,
                content_type=content_type,
                brand=brand,
            )

            new_proposals = result.get("proposals", [])
            if not new_proposals:
                self.state.log(
                    "maestro", "Regen failed",
                    f"No replacement generated for {original_proposal_id}",
                    "⚠️", "detail"
                )
                return

            new_p = new_proposals[0]
            new_pid = new_p.get("proposal_id", "unknown")

            self.state.log(
                "maestro", "Replacement",
                f"{new_pid} replaces {original_proposal_id} — examining...",
                "🔄"
            )

            # Run the replacement through the examiner
            self._examine_and_process_single(
                new_p, new_pid, examine_fn,
                retry_count=retry_count, max_retries=max_retries,
                stats={"examined": 0, "accepted": 0, "rejected": 0, "replaced": 0},
            )

        except Exception as e:
            self.state.log(
                "maestro", "Regen error",
                f"Replacement failed for {original_proposal_id}: {str(e)[:200]}",
                "❌"
            )
            traceback.print_exc()

    def _process_and_schedule_job(self, job_id: str, proposal_id: str, agent_name: str):
        """Process a job and auto-schedule on completion. Runs in a thread.
        
        Uses a semaphore to limit concurrent FFmpeg processes — Railway containers
        have limited resources and 30 simultaneous ffmpeg subprocesses cause
        'Resource temporarily unavailable' errors.
        """
        _job_semaphore.acquire()
        try:
            self.state.log(
                agent_name, "Job started",
                f"Processing {job_id} (from {proposal_id}) — slot acquired",
                "⚙️", "detail"
            )

            from app.db_connection import get_db_session
            from app.services.job_manager import JobManager

            with get_db_session() as pdb:
                m = JobManager(pdb)
                m.process_job(job_id)

            # Auto-schedule
            auto_schedule_job(job_id)

            self.state.log(
                agent_name, "Job complete + scheduled",
                f"Job {job_id} (from {proposal_id})",
                "📅"
            )
        except Exception as e:
            self.state.log(
                "maestro", "Job error",
                f"{job_id}: {str(e)[:200]}",
                "❌"
            )
            traceback.print_exc()
        finally:
            _job_semaphore.release()

    # ──────────────────────────────────────────────────────────
    # CYCLE: OBSERVE — Shared metrics collection
    # ──────────────────────────────────────────────────────────

    def _observe_cycle(self):
        """Collect performance metrics — runs even when paused."""
        self.state.log("maestro", "Observing", "Collecting performance metrics from IG...", "👀")

        try:
            from app.services.metrics_collector import get_metrics_collector

            collector = get_metrics_collector()
            results = collector.collect_all_brands(days_back=14)

            total_updated = sum(r.get("updated", 0) for r in results if isinstance(r, dict))
            total_errors = sum(1 for r in results if isinstance(r, dict) and r.get("error"))

            self.state.total_metrics_collected += total_updated
            self.state.last_metrics_at = datetime.utcnow()

            brands_str = ", ".join(
                f"{r.get('brand', '?')}: {r.get('updated', 0)}"
                for r in results if isinstance(r, dict) and not r.get("error")
            )

            self.state.log(
                "maestro", "Metrics collected",
                f"{total_updated} posts updated across brands. {total_errors} errors. [{brands_str}]",
                "📊"
            )

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Observe cycle failed: {str(e)[:200]}", "❌")

    # ──────────────────────────────────────────────────────────
    # CYCLE: SCOUT — Trend scanning
    # ──────────────────────────────────────────────────────────

    def _scout_cycle(self):
        """Scan for trending content — reels AND posts. Runs even when paused."""
        self.state.log("maestro", "Scouting", "Scanning trends for reels + posts...", "🔭")

        try:
            from app.services.trend_scout import get_trend_scout

            scout = get_trend_scout()

            # ── Reel scouting ──
            h_result = scout.scan_hashtags(max_hashtags=3)
            h_new = h_result.get("new_stored", 0) if isinstance(h_result, dict) else 0

            c_result = scout.scan_competitors()
            c_new = c_result.get("new_stored", 0) if isinstance(c_result, dict) else 0

            # ── Post scouting (carousel/image content) ──
            ph_new = 0
            pc_new = 0
            try:
                ph_result = scout.scan_post_hashtags(max_hashtags=3)
                ph_new = ph_result.get("new_stored", 0) if isinstance(ph_result, dict) else 0
            except Exception as pe:
                self.state.log("maestro", "Post hashtag scan error", str(pe)[:150], "⚠️", "detail")

            try:
                pc_result = scout.scan_post_competitors()
                pc_new = pc_result.get("new_stored", 0) if isinstance(pc_result, dict) else 0
            except Exception as pe:
                self.state.log("maestro", "Post competitor scan error", str(pe)[:150], "⚠️", "detail")

            # ── Own account scanning (self-awareness) ──
            own_new = 0
            try:
                own_result = scout.scan_own_accounts()
                own_new = own_result.get("new_stored", 0) if isinstance(own_result, dict) else 0
            except Exception as oe:
                self.state.log("maestro", "Own account scan error", str(oe)[:150], "⚠️", "detail")

            total_found = h_new + c_new + ph_new + pc_new + own_new
            self.state.total_trends_found += total_found
            self.state.last_scan_at = datetime.utcnow()

            self.state.log(
                "maestro", "Trends discovered",
                f"Found {total_found} new — Reels: {h_new} hashtags + {c_new} competitors | Posts: {ph_new} hashtags + {pc_new} competitors | Own: {own_new}",
                "🔥"
            )

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Scout cycle failed: {str(e)[:200]}", "❌")

    # ──────────────────────────────────────────────────────────
    # CYCLE: FEEDBACK — Performance attribution (48-72h)
    # ──────────────────────────────────────────────────────────

    def _feedback_cycle(self):
        """
        Performance attribution + agent learning loop.

        1. FeedbackEngine: attributes published content (48-72h) back to agents
        2. Calculates per-agent survival scores with strategy breakdowns
        3. AdaptationEngine: mutates agent DNA (weights, temperature) based on results
        4. Logs all mutations to AgentLearning for audit trail
        """
        self.state.log("maestro", "Feedback", "Running performance attribution + learning loop...", "📈")

        try:
            from app.services.evolution_engine import FeedbackEngine, AdaptationEngine

            # Phase 2: Attribution
            feedback = FeedbackEngine()
            results = feedback.run()

            if not results:
                self.state.log("maestro", "Feedback", "No published items in 48-72h window to evaluate", "📊", "detail")
                self.state.last_feedback_at = datetime.utcnow()
                return

            # Log results summary
            summary_parts = []
            for agent_id, data in results.items():
                summary_parts.append(
                    f"{agent_id}: {data['published_count']} posts, "
                    f"{data['total_views']} views, "
                    f"survival={data['survival_score']}"
                )
            self.state.log(
                "maestro", "Feedback Results",
                " | ".join(summary_parts),
                "📈"
            )

            # Phase 3: Adaptation (mutate DNA based on performance)
            adaptation = AdaptationEngine()
            mutations = adaptation.adapt(results)

            # Log mutations
            total_mutations = sum(len(m) for m in mutations.values())
            if total_mutations > 0:
                mutation_parts = []
                for agent_id, mlist in mutations.items():
                    if mlist:
                        mutation_parts.append(f"{agent_id}: {len(mlist)} mutations")
                self.state.log(
                    "maestro", "🧬 Evolution",
                    f"{total_mutations} total mutations applied — {', '.join(mutation_parts)}",
                    "🧬"
                )
            else:
                self.state.log("maestro", "Evolution", "No mutations triggered this cycle (insufficient data or confidence)", "🧬", "detail")

            # Store feedback data for frontend
            import json
            feedback_data = {
                "timestamp": datetime.utcnow().isoformat(),
                "agents": results,
                "mutations_applied": total_mutations,
            }
            _db_set("last_feedback_data", json.dumps(feedback_data, default=str))

            self.state.last_feedback_at = datetime.utcnow()

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Feedback cycle failed: {str(e)[:200]}", "❌")
            import traceback
            traceback.print_exc()

    # ──────────────────────────────────────────────────────────
    # CYCLE: EVOLUTION — Weekly natural selection (Sunday 2 AM)
    # ──────────────────────────────────────────────────────────

    def _evolution_cycle(self):
        """
        Weekly natural selection — survival of the fittest.

        1. Rank all active agents by survival_score
        2. Top 40%: thriving (DNA archived to gene pool)
        3. Middle 40%: surviving (standard mutations continue)
        4. Bottom 20%: struggling → retire if below threshold for 2+ weeks → spawn replacement
        5. New agents inherit from gene pool (80%) or random DNA (20%)
        6. Refresh agent cache so Maestro picks up newborns
        """
        self.state.log("maestro", "🧬 EVOLUTION", "Running weekly natural selection...", "🧬")

        try:
            from app.services.evolution_engine import SelectionEngine

            engine = SelectionEngine()
            result = engine.run_weekly_selection()

            if "error" in result:
                self.state.log("maestro", "Evolution", f"Selection skipped: {result['error']}", "⚠️", "detail")
                return

            # Log results
            deaths = result.get("deaths", [])
            births = result.get("births", [])
            thriving = result.get("thriving", [])

            # Thriving agents
            if thriving:
                top_names = ", ".join(f"{a['agent_id']}({a['survival_score']:.0f})" for a in thriving)
                self.state.log("maestro", "🏆 Thriving", top_names, "🏆")

            # Deaths
            for d in deaths:
                self.state.log(
                    "maestro", "💀 Agent Death",
                    f"{d['agent_id']} retired (score={d['survival_score']:.0f}, gen={d['generation']}, reason={d['reason'][:100]})",
                    "💀"
                )

            # Births
            for b in births:
                inherited = f"inherited from {b['inherited_from']}" if b.get("inherited_from") else "random DNA"
                self.state.log(
                    "maestro", "🐣 Agent Born",
                    f"{b['agent_id']} for {b['brand']} (replacing {b['replaced']}, {inherited}, temp={b['temperature']})",
                    "🐣"
                )

            # Summary
            self.state.log(
                "maestro", "🧬 Selection Complete",
                f"{result['total_agents']} agents: {len(thriving)} thriving, "
                f"{len(result.get('surviving', []))} surviving, "
                f"{len(result.get('struggling', []))} struggling | "
                f"{len(deaths)} deaths, {len(births)} births, "
                f"{result.get('gene_pool_entries', 0)} DNA archived",
                "🧬"
            )

            # Refresh agent cache + Maestro agent states for newborns
            if births:
                from app.services.generic_agent import refresh_agent_cache
                refresh_agent_cache()
                self.state._init_agent_states()

            # Store evolution data for frontend
            import json
            evolution_data = {
                "timestamp": datetime.utcnow().isoformat(),
                "result": result,
            }
            _db_set("last_evolution_data", json.dumps(evolution_data, default=str))

            self.state.last_evolution_at = datetime.utcnow()

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Evolution cycle failed: {str(e)[:200]}", "❌")
            import traceback
            traceback.print_exc()

    # ──────────────────────────────────────────────────────────
    # CYCLE: DIAGNOSTICS — Self-testing (every 4h)
    # ──────────────────────────────────────────────────────────

    def _diagnostics_cycle(self):
        """
        Maestro's self-testing daemon — validates every subsystem.

        Runs 10 checks: DB, agents, DNA, pipeline, scheduler,
        evolution, API, publishing, cycle freshness, data consistency.
        Stores results in system_diagnostics table for dashboard.
        """
        self.state.log("maestro", "🔬 Diagnostics", "Running self-test suite...", "🔬")

        try:
            from app.services.diagnostics_engine import DiagnosticsEngine

            engine = DiagnosticsEngine()
            report = engine.run_all()

            status = report["status"]
            passed = report["passed"]
            warnings = report["warnings"]
            failures = report["failures"]

            # Log failed checks specifically
            for check in report.get("checks", []):
                if check["status"] == "fail":
                    self.state.log(
                        "maestro", f"❌ {check['name']}",
                        check["detail"],
                        "❌", "detail"
                    )
                elif check["status"] == "warn":
                    self.state.log(
                        "maestro", f"⚠️ {check['name']}",
                        check["detail"],
                        "⚠️", "detail"
                    )

            # Summary
            emoji = "✅" if status == "healthy" else "⚠️" if status == "degraded" else "🚨"
            self.state.log(
                "maestro", f"{emoji} Diagnostics: {status.upper()}",
                f"{passed} pass, {warnings} warn, {failures} fail | "
                f"Agents: {report.get('active_agents', '?')}, "
                f"Survival: {report.get('avg_survival_score', '?')}, "
                f"Scheduled: {report.get('total_scheduled', '?')}",
                emoji
            )

            self.state.last_diagnostics_at = datetime.utcnow()
            self.state.last_diagnostics_status = status

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Diagnostics cycle failed: {str(e)[:200]}", "❌")
            import traceback
            traceback.print_exc()

    # ──────────────────────────────────────────────────────────
    # CYCLE: HEALING — Self-healing & smart retry
    # ──────────────────────────────────────────────────────────

    def _healing_cycle(self):
        """
        Smart self-healing cycle — runs every 15 minutes.

        1. TIMEOUT — Detect jobs stuck in generating/pending for >30min → mark failed
        2. SCAN    — Find all failed jobs (last 24h)
        3. DIAGNOSE — Classify failure type (FFmpeg, API, resource, timeout, content)
        4. RETRY   — Auto-retry retryable failures (up to MAX_AUTO_RETRIES)
        5. NOTIFY  — Log non-retryable failures as creator notifications
        6. CLEANUP — Mark permanently-failed proposals for review
        """
        self.state.log("maestro", "🩺 Healing Scan", "Scanning for stuck & failed jobs...", "🔍")

        try:
            from app.db_connection import SessionLocal
            from app.models import GenerationJob, TobyProposal

            db = SessionLocal()
            try:
                now = datetime.utcnow()
                lookback = now - timedelta(hours=24)
                timeout_threshold = now - timedelta(minutes=JOB_TIMEOUT_MINUTES)

                # ── 0. TIMEOUT: Find stuck jobs (generating/pending for >30min) ──
                stuck_jobs = (
                    db.query(GenerationJob)
                    .filter(
                        GenerationJob.status.in_(["generating", "pending"]),
                        GenerationJob.created_at <= timeout_threshold,
                    )
                    .order_by(GenerationJob.created_at.asc())
                    .all()
                )

                timed_out_count = 0
                if stuck_jobs:
                    for stuck_job in stuck_jobs:
                        # Calculate how long it's been stuck
                        stuck_since = stuck_job.started_at or stuck_job.created_at
                        minutes_stuck = (now - stuck_since).total_seconds() / 60 if stuck_since else 0

                        # Log detailed timeout info
                        print(f"\n⏱️  JOB TIMEOUT DETECTED", flush=True)
                        print(f"   Job ID: {stuck_job.job_id}", flush=True)
                        print(f"   Title: {(stuck_job.title or '')[:80]}", flush=True)
                        print(f"   Status: {stuck_job.status}", flush=True)
                        print(f"   Brands: {stuck_job.brands}", flush=True)
                        print(f"   Created: {stuck_job.created_at}", flush=True)
                        print(f"   Started: {stuck_job.started_at}", flush=True)
                        print(f"   Minutes stuck: {minutes_stuck:.0f}", flush=True)
                        print(f"   Current step: {stuck_job.current_step}", flush=True)
                        print(f"   Progress: {stuck_job.progress_percent}%", flush=True)

                        # Check brand_outputs for partial progress
                        brand_statuses = {}
                        for brand, output in (stuck_job.brand_outputs or {}).items():
                            brand_statuses[brand] = {
                                "status": output.get("status", "unknown"),
                                "progress": output.get("progress_percent", 0),
                                "message": output.get("progress_message", ""),
                            }
                        print(f"   Brand statuses: {brand_statuses}", flush=True)
                        import sys
                        sys.stdout.flush()

                        # Mark as failed with timeout error
                        timeout_error = (
                            f"JOB_TIMEOUT: Stuck in '{stuck_job.status}' for {minutes_stuck:.0f} minutes "
                            f"(threshold: {JOB_TIMEOUT_MINUTES}min). "
                            f"Last step: {stuck_job.current_step or 'unknown'}. "
                            f"Progress: {stuck_job.progress_percent or 0}%"
                        )
                        stuck_job.status = "failed"
                        stuck_job.error_message = timeout_error
                        stuck_job.completed_at = now
                        db.commit()

                        timed_out_count += 1

                        self.state.log(
                            "maestro", "⏱️ Job Timed Out",
                            f"{stuck_job.job_id} — stuck {minutes_stuck:.0f}min in '{stuck_job.status}' → failed. "
                            f"Brands: {', '.join(stuck_job.brands or ['?'])}",
                            "🚨"
                        )

                    self.state.log(
                        "maestro", "⏱️ Timeout Summary",
                        f"Timed out {timed_out_count} stuck jobs (>{JOB_TIMEOUT_MINUTES}min)",
                        "⏱️"
                    )
                else:
                    self.state.log("maestro", "⏱️ No Stuck Jobs", "All jobs progressing normally ✅", "💚", "detail")

                # ── 1. SCAN: Find all failed jobs (last 24h) ──
                # (includes freshly timed-out jobs)
                failed_jobs = (
                    db.query(GenerationJob)
                    .filter(
                        GenerationJob.status == "failed",
                        GenerationJob.created_at >= lookback,
                    )
                    .order_by(GenerationJob.created_at.desc())
                    .all()
                )

                if not failed_jobs:
                    self.state.log("maestro", "🩺 Healing", "No failed jobs found — all clear ✅", "💚", "detail")
                    self.state.last_healing_at = now
                    return

                # Filter to Maestro-created jobs (those with a linked proposal)
                maestro_failures = []
                other_failures = []
                for job in failed_jobs:
                    proposal = (
                        db.query(TobyProposal)
                        .filter(TobyProposal.accepted_job_id == job.job_id)
                        .first()
                    )
                    if proposal:
                        maestro_failures.append((job, proposal))
                    else:
                        # Also check if user_id looks like a proposal ID
                        if job.user_id and any(
                            job.user_id.upper().startswith(p)
                            for p in ["TOBY-", "LEXI-", "PROP-"]
                        ):
                            maestro_failures.append((job, None))
                        else:
                            other_failures.append(job)

                self.state.log(
                    "maestro", "🩺 Failed Jobs Found",
                    f"{len(maestro_failures)} Maestro-created, {len(other_failures)} manual — analyzing...",
                    "🔎"
                )

                retried = 0
                permanently_failed = 0
                notifications = []

                for job, proposal in maestro_failures:
                    # ── 2. DIAGNOSE: Classify the failure ──
                    diagnosis = self._diagnose_failure(job)

                    # ── 3. RETRY or NOTIFY ──
                    retry_count = self._get_retry_count(job, db)

                    if diagnosis["retryable"] and retry_count < MAX_AUTO_RETRIES:
                        # Auto-retry the job
                        success = self._retry_failed_job(job, proposal, retry_count, db)
                        if success:
                            retried += 1
                            self.state.total_healed += 1
                            self.state.log(
                                "maestro", "🩺 Auto-Retry",
                                f"{job.job_id} ({diagnosis['category']}) — retry #{retry_count + 1}",
                                "🔄"
                            )
                        else:
                            permanently_failed += 1
                    else:
                        # ── 4. NOTIFY: Non-retryable or max retries exceeded ──
                        permanently_failed += 1
                        self.state.total_healing_failures += 1

                        reason = diagnosis["category"]
                        if retry_count >= MAX_AUTO_RETRIES:
                            reason = f"{reason} (max {MAX_AUTO_RETRIES} retries exhausted)"

                        notification = {
                            "time": now.isoformat(),
                            "job_id": job.job_id,
                            "brand": (job.brands or ["unknown"])[0],
                            "title": (job.title or "")[:80],
                            "category": diagnosis["category"],
                            "reason": reason,
                            "error_snippet": (job.error_message or "")[:300],
                            "retry_count": retry_count,
                            "action": diagnosis["suggested_action"],
                        }
                        notifications.append(notification)

                        self.state.log(
                            "maestro", "🩺 Permanent Failure",
                            f"{job.job_id} — {reason}: {diagnosis['suggested_action']}",
                            "🚨"
                        )

                # Store notifications
                if notifications:
                    self.state.healing_notifications = (
                        notifications + self.state.healing_notifications
                    )[:50]  # Keep last 50

                # Summary
                self.state.log(
                    "maestro", "🩺 Healing Complete",
                    f"Retried: {retried}, Permanent failures: {permanently_failed}, "
                    f"Total healed lifetime: {self.state.total_healed}",
                    "🏥"
                )

                self.state.last_healing_at = now

            finally:
                db.close()

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "🩺 Healing Error", f"{str(e)[:200]}", "❌")
            traceback.print_exc()

        # ── POPULATION GUARD: ensure agents == brands ──
        # RULE: Number of agents must equal number of brands.
        # Each agent is born from one brand but generates content for ALL brands.
        # If a brand was added before the evolution engine, it has no agent — fix it.
        try:
            from app.services.generic_agent import _ensure_agents_for_all_brands
            spawned = _ensure_agents_for_all_brands()
            if spawned:
                names = ", ".join(a.display_name for a in spawned)
                self.state.log(
                    "maestro", "🧬 Population Guard",
                    f"Auto-spawned {len(spawned)} new agents: {names}",
                    "🧬"
                )
                # Refresh cache so daily burst picks them up
                from app.services.generic_agent import refresh_agent_cache
                refresh_agent_cache()
        except Exception as e:
            self.state.log("maestro", "🧬 Population Guard Error", str(e)[:200], "⚠️")

    def _diagnose_failure(self, job) -> Dict:
        """
        Classify a job failure into a category with retry recommendation.

        Categories:
          - ffmpeg_encoder:  libx264/encoder errors → RETRYABLE
          - ffmpeg_resource: resource unavailable → RETRYABLE
          - ffmpeg_memory:   memory allocation → RETRYABLE (with delay)
          - api_error:       DeepSeek/Meta API failures → RETRYABLE
          - content_error:   bad content/prompt data → NOT retryable
          - file_not_found:  missing assets → NOT retryable
          - unknown:         unclassifiable → RETRYABLE (once)
        """
        error = (job.error_message or "").lower()

        # Job timeout — stuck generating for too long
        if "job_timeout" in error:
            return {
                "category": "job_timeout",
                "retryable": True,
                "suggested_action": "Job was stuck generating — retrying with fresh resources",
            }

        # FFmpeg encoder issues (the main problem we're fixing)
        if "error while opening encoder" in error or "incorrect parameters" in error:
            return {
                "category": "ffmpeg_encoder",
                "retryable": True,
                "suggested_action": "FFmpeg encoder init failed — will retry with updated pipeline",
            }

        if "resource temporarily unavailable" in error:
            return {
                "category": "ffmpeg_resource",
                "retryable": True,
                "suggested_action": "System resources exhausted — retrying with stagger",
            }

        if "cannot allocate memory" in error or "generic error in an external library" in error:
            return {
                "category": "ffmpeg_memory",
                "retryable": True,
                "suggested_action": "Memory pressure — retrying with thread limit",
            }

        if "ffmpeg" in error or "video" in error:
            return {
                "category": "ffmpeg_other",
                "retryable": True,
                "suggested_action": "FFmpeg failure — retrying with updated parameters",
            }

        # API errors
        if any(k in error for k in ["api", "timeout", "connection", "rate limit", "503", "502", "429"]):
            return {
                "category": "api_error",
                "retryable": True,
                "suggested_action": "External API error — transient, will retry",
            }

        # Content issues
        if any(k in error for k in ["content_lines", "empty", "no content", "validation"]):
            return {
                "category": "content_error",
                "retryable": False,
                "suggested_action": "Content data invalid — needs manual review of proposal",
            }

        # File issues
        if any(k in error for k in ["file not found", "no such file", "filenotfounderror"]):
            return {
                "category": "file_not_found",
                "retryable": False,
                "suggested_action": "Required file missing — check assets/templates",
            }

        # Unknown
        return {
            "category": "unknown",
            "retryable": True,
            "suggested_action": "Unknown failure — attempting one retry",
        }

    def _get_retry_count(self, job, db) -> int:
        """
        Get how many times this job has been retried.
        Uses a convention: retried jobs have error_message containing "[RETRY #N]".
        """
        error = job.error_message or ""
        import re
        match = re.search(r'\[RETRY #(\d+)\]', error)
        if match:
            return int(match.group(1))
        # If it failed but no retry marker, this is the original failure (retry_count=0)
        return 0

    def _retry_failed_job(self, job, proposal, current_retry: int, db) -> bool:
        """
        Retry a failed job by resetting it to pending and re-processing.

        Returns True if retry was initiated, False if it failed to start.
        """
        try:
            # Mark the old error with retry count for tracking
            old_error = job.error_message or ""
            job.error_message = f"[RETRY #{current_retry + 1}] Previous: {old_error[:500]}"
            job.status = "pending"
            job.current_step = f"Queued for retry #{current_retry + 1} by Maestro Healer"
            job.progress_percent = 0
            db.commit()

            # Process in background thread with stagger delay
            import time as _time
            agent_name = "maestro"
            if proposal:
                agent_name = proposal.agent_name or "maestro"
            proposal_id = proposal.proposal_id if proposal else job.user_id or "manual"

            thread = threading.Thread(
                target=self._process_and_schedule_job,
                args=(job.job_id, proposal_id, agent_name),
                daemon=True,
            )
            # Stagger to avoid resource contention
            _time.sleep(JOB_STAGGER_DELAY)
            thread.start()

            return True
        except Exception as e:
            self.state.log(
                "maestro", "🩺 Retry Failed",
                f"Could not retry {job.job_id}: {str(e)[:200]}",
                "❌"
            )
            return False

    # ──────────────────────────────────────────────────────────
    # Manual trigger
    # ──────────────────────────────────────────────────────────

    def trigger_burst_now(self):
        """Manually trigger the daily burst. Ignores pause state."""
        self.state.log("maestro", "Manual burst", "Triggered by user", "🔘")
        thread = threading.Thread(target=self._run_daily_burst, daemon=True)
        thread.start()
        return {"status": "triggered", "message": "Daily burst started in background"}

    def run_smart_burst(self, remaining_reels: int, remaining_posts: int):
        """Generate only the REMAINING proposals for the day.
        Unlike _run_daily_burst which always generates the full quota,
        this method generates exactly remaining_reels reels and remaining_posts posts,
        distributed evenly across brands and agents."""
        if not self._daily_burst_lock.acquire(blocking=False):
            self.state.log("maestro", "Smart burst skipped", "Already running", "⏳")
            return

        try:
            self.state.total_cycles += 1
            self.state.current_phase = "generating"
            burst_start = datetime.utcnow()

            # Load dynamic agents from DB
            try:
                from app.services.generic_agent import get_all_active_agents
                active_agents = get_all_active_agents()
            except Exception as e:
                self.state.log("maestro", "Agent load error", f"{e}", "⚠️")
                active_agents = []

            if not active_agents:
                self.state.log("maestro", "No agents", "Cannot run smart burst without agents", "❌")
                return

            brands = _get_all_brands()
            n_brands = len(brands)
            n_agents = len(active_agents)

            self.state.log(
                "maestro", "🚀 Smart Burst",
                f"Generating {remaining_reels} reels + {remaining_posts} posts across {n_brands} brands",
                "🚀"
            )

            all_proposals = []

            # Phase 1: REEL proposals — distribute remaining_reels across brands
            if remaining_reels > 0:
                reels_per_brand = max(1, remaining_reels // n_brands)
                leftover_reels = remaining_reels - (reels_per_brand * n_brands)
                self.state.log("maestro", "Phase 1: Reels", f"{remaining_reels} reel proposals across {n_brands} brands", "🎬")

                for bi, brand in enumerate(brands):
                    this_brand = reels_per_brand + (1 if bi < leftover_reels else 0)
                    if this_brand <= 0:
                        continue
                    remaining = this_brand
                    for i, agent in enumerate(active_agents):
                        if remaining <= 0:
                            break
                        ppb = max(1, remaining // (n_agents - i))
                        remaining -= ppb
                        try:
                            self.state.current_agent = agent.agent_id
                            self.state.ensure_agent_state(agent.agent_id)
                            self.state.log(agent.agent_id, "Generating", f"{ppb} reels for {brand}", "🧠")
                            result = agent.run(max_proposals=ppb, content_type="reel", brand=brand)
                            props = result.get("proposals", [])
                            all_proposals.extend(props)
                            self.state.agents[agent.agent_id].total_proposals += len(props)
                            self.state.log(agent.agent_id, f"Done ({brand})", f"{len(props)} reel proposals", "✅")
                        except Exception as e:
                            self.state.errors += 1
                            if agent.agent_id in self.state.agents:
                                self.state.agents[agent.agent_id].errors += 1
                            self.state.log(agent.agent_id, "Error", f"{str(e)[:200]}", "❌")
                            traceback.print_exc()

            reel_count = len(all_proposals)

            # Phase 2: POST proposals — distribute remaining_posts across brands
            if remaining_posts > 0:
                posts_per_brand = max(1, remaining_posts // n_brands)
                leftover_posts = remaining_posts - (posts_per_brand * n_brands)
                self.state.log("maestro", "Phase 2: Posts", f"{remaining_posts} post proposals across {n_brands} brands", "📄")

                for bi, brand in enumerate(brands):
                    this_brand = posts_per_brand + (1 if bi < leftover_posts else 0)
                    if this_brand <= 0:
                        continue
                    remaining = this_brand
                    for i, agent in enumerate(active_agents):
                        if remaining <= 0:
                            break
                        ppb = max(1, remaining // (n_agents - i))
                        remaining -= ppb
                        try:
                            self.state.current_agent = agent.agent_id
                            self.state.log(agent.agent_id, "Generating", f"{ppb} posts for {brand}", "📄")
                            result = agent.run(max_proposals=ppb, content_type="post", brand=brand)
                            props = result.get("proposals", [])
                            all_proposals.extend(props)
                            self.state.agents[agent.agent_id].total_proposals += len(props)
                            self.state.log(agent.agent_id, f"Done ({brand})", f"{len(props)} post proposals", "✅")
                        except Exception as e:
                            self.state.errors += 1
                            if agent.agent_id in self.state.agents:
                                self.state.agents[agent.agent_id].errors += 1
                            self.state.log(agent.agent_id, "Error", f"{str(e)[:200]}", "❌")
                            traceback.print_exc()

            post_count = len(all_proposals) - reel_count

            self.state.total_proposals_generated += len(all_proposals)
            self.state.log("maestro", "Smart burst phases done", f"{reel_count} reels + {post_count} posts = {len(all_proposals)} total", "📊")

            if not all_proposals:
                self.state.log("maestro", "Smart burst empty", "No proposals generated", "⚠️")
                set_last_daily_run(datetime.utcnow())
                return

            # Schedule any existing ready reels
            try:
                ready_count = schedule_all_ready_reels()
                if ready_count > 0:
                    self.state.log("maestro", "Pre-process scheduling", f"Scheduled {ready_count} ready brand-reels", "📅")
            except Exception:
                pass

            # Auto-accept and process
            self.state.current_phase = "processing"
            self._auto_accept_and_process(all_proposals)

            set_last_daily_run(datetime.utcnow())
            elapsed = (datetime.utcnow() - burst_start).total_seconds()
            self.state.log(
                "maestro", "🏁 Smart Burst Complete",
                f"{len(all_proposals)} proposals processed. Took {elapsed:.0f}s.",
                "🏁"
            )
        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Smart burst error", f"{str(e)[:200]}", "❌")
            traceback.print_exc()
            set_last_daily_run(datetime.utcnow())
        finally:
            self.state.current_agent = None
            self.state.current_phase = None
            self._daily_burst_lock.release()


# ── Auto-Schedule Helper ──────────────────────────────────────

def auto_schedule_job(job_id: str):
    """
    Auto-schedule all brand outputs from a completed job.

    For each brand with completed output:
      1. Find the next available scheduling slot
      2. Create a ScheduledReel entry
      3. The publishing daemon handles the rest
    """
    import copy
    from app.db_connection import get_db_session
    from app.services.job_manager import JobManager
    from app.services.db_scheduler import DatabaseSchedulerService
    from sqlalchemy.orm.attributes import flag_modified

    with get_db_session() as db:
        manager = JobManager(db)
        job = manager.get_job(job_id)

        if not job:
            print(f"[AUTO-SCHEDULE] Job {job_id} not found", flush=True)
            return

        if job.status not in ("completed",):
            print(f"[AUTO-SCHEDULE] Job {job_id} not completed (status={job.status}), skipping", flush=True)
            return

        variant = job.variant or "dark"
        is_post = (variant == "post")
        scheduler = DatabaseSchedulerService()
        scheduled_count = 0
        brand_outputs = copy.deepcopy(job.brand_outputs or {})

        for brand, output in brand_outputs.items():
            if output.get("status") != "completed":
                continue

            reel_id = output.get("reel_id")
            video_path = output.get("video_path")
            thumbnail_path = output.get("thumbnail_path")
            yt_thumbnail_path = output.get("yt_thumbnail_path")
            caption = output.get("caption", "")
            yt_title = output.get("yt_title")

            if is_post:
                # Posts only need reel_id + thumbnail_path (no video)
                if not reel_id:
                    continue
                # Verify thumbnail exists (strip query string from URL-style paths)
                from pathlib import Path as _Path
                if thumbnail_path:
                    clean_thumb = thumbnail_path.split('?')[0]
                    thumb_abs = _Path(clean_thumb.lstrip('/'))
                    if not thumb_abs.exists():
                        print(f"[AUTO-SCHEDULE] ⚠️ Post image missing for {brand}: {thumb_abs} — skipping", flush=True)
                        continue
            else:
                # Reels need reel_id + video_path
                if not reel_id or not video_path:
                    continue

                # Verify files actually exist before scheduling (prevents "Video not found" errors)
                from pathlib import Path as _Path
                video_abs = _Path(video_path.lstrip('/'))
                thumbnail_abs = _Path(thumbnail_path.lstrip('/')) if thumbnail_path else None
                if not video_abs.exists():
                    print(f"[AUTO-SCHEDULE] ⚠️ Video file missing for {brand}: {video_abs} — skipping", flush=True)
                    continue
                if thumbnail_abs and not thumbnail_abs.exists():
                    print(f"[AUTO-SCHEDULE] ⚠️ Thumbnail missing for {brand}: {thumbnail_abs} — skipping", flush=True)
                    continue

            try:
                # Use post-specific slots for posts
                if is_post:
                    slot = scheduler.get_next_available_post_slot(brand)
                    sched_platforms = job.platforms or ["instagram", "facebook"]
                else:
                    slot = scheduler.get_next_available_slot(brand, variant)
                    sched_platforms = job.platforms or ["instagram", "facebook", "youtube"]

                scheduler.schedule_reel(
                    user_id="maestro",
                    reel_id=reel_id,
                    scheduled_time=slot,
                    caption=caption,
                    yt_title=yt_title if not is_post else None,
                    platforms=sched_platforms,
                    video_path=video_path,
                    thumbnail_path=thumbnail_path,
                    yt_thumbnail_path=yt_thumbnail_path if not is_post else None,
                    user_name="Maestro",
                    brand=brand,
                    variant=variant,
                )

                # Mark brand output as scheduled so it's not re-scheduled
                brand_outputs[brand]["status"] = "scheduled"
                brand_outputs[brand]["scheduled_time"] = slot.isoformat()

                scheduled_count += 1
                content_label = "post" if is_post else "reel"
                print(
                    f"[AUTO-SCHEDULE] {brand}/{variant} → {slot.strftime('%Y-%m-%d %H:%M')} ({content_label} {reel_id})",
                    flush=True,
                )
            except Exception as e:
                print(f"[AUTO-SCHEDULE] Failed to schedule {brand}: {e}", flush=True)

        # Persist all brand_outputs changes at once
        if scheduled_count > 0:
            job.brand_outputs = brand_outputs
            flag_modified(job, "brand_outputs")
            db.commit()

        print(f"[AUTO-SCHEDULE] Job {job_id}: {scheduled_count}/{len(job.brand_outputs or {})} brands scheduled", flush=True)


def schedule_all_ready_reels() -> int:
    """
    Find ALL completed jobs with brand outputs still in 'completed' status
    and auto-schedule them into the next available slot.

    This catches any reels that were generated but never scheduled
    (e.g., from before auto-scheduling was added, or from manual accepts).

    Returns the number of brand-reels scheduled.
    """
    import copy
    from app.db_connection import SessionLocal
    from app.models import GenerationJob
    from app.services.db_scheduler import DatabaseSchedulerService
    from sqlalchemy.orm.attributes import flag_modified

    total_scheduled = 0
    db = SessionLocal()
    try:
        # Find all completed OR failed jobs (failed jobs may have completed brand outputs
        # that weren't scheduled due to earlier bugs)
        completed_jobs = (
            db.query(GenerationJob)
            .filter(GenerationJob.status.in_(["completed", "failed"]))
            .all()
        )

        if not completed_jobs:
            return 0

        scheduler = DatabaseSchedulerService()

        for job in completed_jobs:
            variant = job.variant or "dark"
            brand_outputs = copy.deepcopy(job.brand_outputs or {})
            job_changed = False
            is_post = (variant == "post")

            for brand, output in brand_outputs.items():
                if output.get("status") != "completed":
                    continue  # Already scheduled, failed, or still generating

                reel_id = output.get("reel_id")
                video_path = output.get("video_path")
                thumbnail_path = output.get("thumbnail_path")

                if is_post:
                    # Posts only need reel_id (image-based, no video)
                    if not reel_id:
                        continue
                    if thumbnail_path:
                        from pathlib import Path as _Path
                        clean_thumb = thumbnail_path.split('?')[0]
                        thumb_abs = _Path(clean_thumb.lstrip('/'))
                        if not thumb_abs.exists():
                            print(f"[READY-SCHEDULE] ⚠️ Post image missing for {brand}: {thumb_abs} — skipping", flush=True)
                            continue
                else:
                    # Reels need reel_id + video_path
                    if not reel_id or not video_path:
                        continue
                    # Verify video file actually exists before scheduling
                    from pathlib import Path as _Path
                    video_abs = _Path(video_path.lstrip('/'))
                    if not video_abs.exists():
                        print(f"[READY-SCHEDULE] ⚠️ Video missing for {brand}: {video_abs} — skipping", flush=True)
                        continue

                # Check if already in scheduled_reels (safety check)
                from app.models import ScheduledReel
                existing = (
                    db.query(ScheduledReel)
                    .filter(ScheduledReel.reel_id == reel_id)
                    .first()
                )
                if existing:
                    # Already scheduled — just update brand_output status
                    brand_outputs[brand]["status"] = "scheduled"
                    job_changed = True
                    continue

                try:
                    if is_post:
                        slot = scheduler.get_next_available_post_slot(brand)
                        sched_platforms = job.platforms or ["instagram", "facebook"]
                    else:
                        slot = scheduler.get_next_available_slot(brand, variant)
                        sched_platforms = job.platforms or ["instagram", "facebook", "youtube"]

                    scheduler.schedule_reel(
                        user_id="maestro",
                        reel_id=reel_id,
                        scheduled_time=slot,
                        caption=output.get("caption", ""),
                        yt_title=output.get("yt_title") if not is_post else None,
                        platforms=sched_platforms,
                        video_path=video_path,
                        thumbnail_path=output.get("thumbnail_path"),
                        yt_thumbnail_path=output.get("yt_thumbnail_path") if not is_post else None,
                        user_name="Maestro",
                        brand=brand,
                        variant=variant,
                    )
                    brand_outputs[brand]["status"] = "scheduled"
                    brand_outputs[brand]["scheduled_time"] = slot.isoformat()
                    job_changed = True
                    total_scheduled += 1
                    content_label = "post" if is_post else "reel"
                    print(
                        f"[READY-SCHEDULE] {brand}/{variant} → {slot.strftime('%Y-%m-%d %H:%M')} ({content_label} {reel_id})",
                        flush=True,
                    )
                except Exception as e:
                    print(f"[READY-SCHEDULE] Failed {brand}: {e}", flush=True)

            if job_changed:
                job.brand_outputs = brand_outputs
                flag_modified(job, "brand_outputs")
                db.commit()

    except Exception as e:
        print(f"[READY-SCHEDULE] Error: {e}", flush=True)
    finally:
        db.close()

    if total_scheduled > 0:
        print(f"[READY-SCHEDULE] Total: {total_scheduled} brand-reels auto-scheduled", flush=True)

    return total_scheduled


# ── Singleton ─────────────────────────────────────────────────

_maestro: Optional[MaestroDaemon] = None


def get_maestro() -> MaestroDaemon:
    """Get or create the Maestro singleton."""
    global _maestro
    if _maestro is None:
        _maestro = MaestroDaemon()
    return _maestro


def maestro_log(agent: str, action: str, detail: str = "", emoji: str = "🤖", level: str = "detail"):
    """
    Log to Maestro's unified activity feed from anywhere.

    Import this in toby_agent.py, lexi_agent.py, trend_scout.py, metrics_collector.py
    to have all actions in one timeline.
    """
    try:
        m = get_maestro()
        m.state.log(agent, action, detail, emoji, level)
    except Exception:
        print(f"   [{agent.upper()}-LOG] {action} — {detail}", flush=True)


def start_maestro() -> MaestroDaemon:
    """Initialize and start Maestro. Called on every deployment."""
    maestro = get_maestro()
    if maestro.scheduler is None or not maestro.scheduler.running:
        maestro.start()
        paused = is_paused()
        status = "PAUSED" if paused else "RUNNING"
        print(f"🎼 Maestro started — Status: {status}", flush=True)
    else:
        print("🎼 Maestro already running", flush=True)
    return maestro
