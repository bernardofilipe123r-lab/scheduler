"""
Maestro — The AI Content Orchestrator (v2).

Maestro runs a DAILY BURST once per day:
  1. Toby generates 3 unique reel proposals
  2. Lexi generates 3 unique reel proposals
  3. Each proposal → 2 jobs (dark + light) × 5 brands = 60 brand-reels/day
  4. Auto-schedule into the 6 daily slots per brand (3 light + 3 dark)
  5. Publishing daemon posts at scheduled times

Design:
  - Pause/Resume controlled by user, state persisted in DB
  - Survives Railway redeploys: reads is_paused + last_daily_run from DB
  - Daily burst runs ONCE per day (not every 45min)
  - Feedback loop: checks reel performance 48-72h after publish
  - Observe & Scout cycles run independently for intelligence gathering
"""

import os
import threading
import traceback
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger


# ── Configuration ─────────────────────────────────────────────

# Check cycle: how often to check if daily burst should run
CHECK_CYCLE_MINUTES = int(os.getenv("MAESTRO_CHECK_MINUTES", "10"))

# Observe & Scout cycles remain the same
METRICS_CYCLE_MINUTES = int(os.getenv("MAESTRO_METRICS_MINUTES", "180"))
SCAN_CYCLE_MINUTES = int(os.getenv("MAESTRO_SCAN_MINUTES", "240"))

# Feedback cycle: check performance of reels published 48-72h ago
FEEDBACK_CYCLE_MINUTES = int(os.getenv("MAESTRO_FEEDBACK_MINUTES", "360"))

STARTUP_DELAY_SECONDS = 30

# Daily burst: 3 proposals per agent = 6 unique reels
# Each reel → 2 jobs (dark + light) = 12 jobs total
PROPOSALS_PER_AGENT = 3

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
    except Exception:
        return default


def _db_set(key: str, value: str):
    """Write a config value to DB (survives redeploys)."""
    try:
        from app.db_connection import SessionLocal
        from app.models import MaestroConfig
        db = SessionLocal()
        try:
            MaestroConfig.set(db, key, value)
        finally:
            db.close()
    except Exception as e:
        print(f"[MAESTRO] Failed to persist {key}: {e}", flush=True)


def is_paused() -> bool:
    """Check if Maestro is paused (DB-persisted)."""
    return _db_get("is_paused", "true") == "true"  # Default: paused until user resumes


def set_paused(paused: bool):
    """Set paused state (DB-persisted)."""
    _db_set("is_paused", "true" if paused else "false")


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

        # Agent sub-states
        self.agents: Dict[str, AgentState] = {
            "toby": AgentState("toby"),
            "lexi": AgentState("lexi"),
        }

        # Cycle stats
        self.total_cycles: int = 0
        self.total_proposals_generated: int = 0
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

        # Activity log — unified for both agents
        self.activity_log: List[Dict] = []

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
            "total_metrics_collected": self.total_metrics_collected,
            "total_trends_found": self.total_trends_found,
            "errors": self.errors,
            "agents": {
                name: agent.to_dict() for name, agent in self.agents.items()
            },
            "recent_activity": self.activity_log[:30],
            "daily_config": {
                "proposals_per_agent": PROPOSALS_PER_AGENT,
                "total_reels_per_day": PROPOSALS_PER_AGENT * 2,  # 3 Toby + 3 Lexi
                "variants": ["dark", "light"],
                "brands": ALL_BRANDS,
                "jobs_per_day": PROPOSALS_PER_AGENT * 2 * 2,  # × 2 variants
            },
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
    The orchestrator — manages Toby and Lexi.

    Cycles:
      1. CHECK  (every 10min) — Checks if daily burst should run
      2. OBSERVE (every 3h)   — Collect metrics
      3. SCOUT  (every 4h)    — Scan trends
      4. FEEDBACK (every 6h)  — Check 48-72h post performance
    """

    def __init__(self):
        self.state = MaestroState()
        self.scheduler: Optional[BackgroundScheduler] = None
        self._daily_burst_lock = threading.Lock()
        self.state.log("maestro", "Initializing", "Maestro orchestrator created", "🎼")

    def start(self):
        """Start Maestro background jobs. Called on every deployment."""
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

        self.scheduler.start()
        self.state.started_at = datetime.utcnow()

        paused = is_paused()
        status_text = "PAUSED (waiting for Resume)" if paused else "RUNNING"
        self.state.log(
            "maestro", "Started",
            f"Status: {status_text}. Check every {CHECK_CYCLE_MINUTES}m, Observe {METRICS_CYCLE_MINUTES}m, Scout {SCAN_CYCLE_MINUTES}m, Feedback {FEEDBACK_CYCLE_MINUTES}m",
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
        """Refresh per-agent today's proposal counts from DB."""
        from app.db_connection import SessionLocal
        from app.models import TobyProposal

        db = SessionLocal()
        try:
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            for agent_name in ["toby", "lexi"]:
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
          1. Is Maestro paused? → skip
          2. Has the daily burst already run today? → skip
          3. Otherwise → run the daily burst
        """
        if is_paused():
            return  # Silent — don't spam logs when paused

        last_run = get_last_daily_run()
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

        if last_run and last_run >= today:
            # Already ran today
            return

        # Time to run the daily burst!
        self.state.log("maestro", "Daily burst triggered", "Starting generation for today", "🌅")
        self._run_daily_burst()

    # ──────────────────────────────────────────────────────────
    # DAILY BURST — The main event
    # ──────────────────────────────────────────────────────────

    def _run_daily_burst(self):
        """
        Generate 6 unique reels (3 Toby + 3 Lexi).
        Each reel → 2 jobs (dark + light) × 5 brands.
        Auto-accept, process, and schedule everything.
        """
        if not self._daily_burst_lock.acquire(blocking=False):
            self.state.log("maestro", "Burst skipped", "Already running", "⏳")
            return

        try:
            self.state.total_cycles += 1
            self.state.current_phase = "generating"
            burst_start = datetime.utcnow()

            self.state.log(
                "maestro", "🌅 Daily Burst Started",
                f"Generating {PROPOSALS_PER_AGENT} Toby + {PROPOSALS_PER_AGENT} Lexi reels, each in dark + light",
                "🚀"
            )

            all_proposals = []

            # Toby generates 3 reel proposals
            try:
                self.state.current_agent = "toby"
                from app.services.toby_agent import get_toby_agent
                toby = get_toby_agent()
                self.state.log("toby", "Generating", f"{PROPOSALS_PER_AGENT} reel proposals...", "🧠")
                toby_result = toby.run(max_proposals=PROPOSALS_PER_AGENT, content_type="reel")
                toby_proposals = toby_result.get("proposals", [])
                all_proposals.extend(toby_proposals)
                self.state.agents["toby"].total_proposals += len(toby_proposals)
                self.state.log("toby", "Done", f"{len(toby_proposals)} proposals created", "✅")
            except Exception as e:
                self.state.errors += 1
                self.state.agents["toby"].errors += 1
                self.state.log("toby", "Error", f"Generation failed: {str(e)[:200]}", "❌")
                traceback.print_exc()

            # Lexi generates 3 reel proposals
            try:
                self.state.current_agent = "lexi"
                from app.services.lexi_agent import get_lexi_agent
                lexi = get_lexi_agent()
                self.state.log("lexi", "Generating", f"{PROPOSALS_PER_AGENT} reel proposals...", "📊")
                lexi_result = lexi.run(max_proposals=PROPOSALS_PER_AGENT, content_type="reel")
                lexi_proposals = lexi_result.get("proposals", [])
                all_proposals.extend(lexi_proposals)
                self.state.agents["lexi"].total_proposals += len(lexi_proposals)
                self.state.log("lexi", "Done", f"{len(lexi_proposals)} proposals created", "✅")
            except Exception as e:
                self.state.errors += 1
                self.state.agents["lexi"].errors += 1
                self.state.log("lexi", "Error", f"Generation failed: {str(e)[:200]}", "❌")
                traceback.print_exc()

            self.state.total_proposals_generated += len(all_proposals)

            if not all_proposals:
                self.state.log("maestro", "Burst empty", "No proposals generated", "⚠️")
                set_last_daily_run(datetime.utcnow())
                return

            self.state.log(
                "maestro", "Proposals ready",
                f"{len(all_proposals)} unique reels — creating dark + light jobs for 5 brands each",
                "⚡"
            )

            # Auto-accept each proposal and create BOTH dark + light jobs
            self.state.current_phase = "processing"
            self._auto_accept_and_process(all_proposals)

            # Record daily run
            set_last_daily_run(datetime.utcnow())

            elapsed = (datetime.utcnow() - burst_start).total_seconds()
            self.state.log(
                "maestro", "🌅 Daily Burst Complete",
                f"{len(all_proposals)} reels × 2 variants × 5 brands. Jobs processing in background. Took {elapsed:.0f}s to dispatch.",
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
          1. Mark as accepted in DB
          2. Create TWO jobs: dark + light (each for all 5 brands)
          3. Process each job in a background thread
          4. Auto-schedule on completion
        """
        from app.db_connection import SessionLocal, get_db_session
        from app.models import TobyProposal
        from app.services.job_manager import JobManager

        for p_dict in proposals:
            proposal_id = p_dict.get("proposal_id")
            if not proposal_id:
                continue

            try:
                # 1. Mark accepted
                db = SessionLocal()
                try:
                    proposal = db.query(TobyProposal).filter(
                        TobyProposal.proposal_id == proposal_id
                    ).first()
                    if not proposal or proposal.status != "pending":
                        continue

                    proposal.status = "accepted"
                    proposal.reviewed_at = datetime.utcnow()
                    db.commit()

                    title = proposal.title
                    content_lines = proposal.content_lines or []
                    image_prompt = proposal.image_prompt
                    agent_name = proposal.agent_name or "toby"
                finally:
                    db.close()

                # 2. Create TWO jobs: dark + light
                job_ids = []
                for variant in ["dark", "light"]:
                    with get_db_session() as jdb:
                        manager = JobManager(jdb)
                        job = manager.create_job(
                            user_id=proposal_id,
                            title=title,
                            content_lines=content_lines,
                            brands=ALL_BRANDS,
                            variant=variant,
                            ai_prompt=image_prompt,
                            cta_type="follow_tips",
                            platforms=["instagram", "facebook", "youtube"],
                        )
                        job_ids.append(job.job_id)

                # Store first job_id on proposal (for reference)
                db2 = SessionLocal()
                try:
                    p = db2.query(TobyProposal).filter(
                        TobyProposal.proposal_id == proposal_id
                    ).first()
                    if p:
                        p.accepted_job_id = job_ids[0]
                        db2.commit()
                finally:
                    db2.close()

                self.state.log(
                    agent_name, "Auto-accepted",
                    f"{proposal_id} → Jobs {', '.join(job_ids)} (dark + light × 5 brands)",
                    "✅"
                )

                # 3. Process each job in background thread
                for jid in job_ids:
                    thread = threading.Thread(
                        target=self._process_and_schedule_job,
                        args=(jid, proposal_id, agent_name),
                        daemon=True,
                    )
                    thread.start()

            except Exception as e:
                self.state.log(
                    "maestro", "Auto-accept error",
                    f"{proposal_id}: {str(e)[:200]}",
                    "❌"
                )
                traceback.print_exc()

    def _process_and_schedule_job(self, job_id: str, proposal_id: str, agent_name: str):
        """Process a job and auto-schedule on completion. Runs in a thread."""
        try:
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
        """Scan for trending content — runs even when paused."""
        self.state.log("maestro", "Scouting", "Scanning trends for reels + posts...", "🔭")

        try:
            from app.services.trend_scout import get_trend_scout

            scout = get_trend_scout()

            h_result = scout.scan_hashtags(max_hashtags=3)
            h_new = h_result.get("new_stored", 0) if isinstance(h_result, dict) else 0

            c_result = scout.scan_competitors()
            c_new = c_result.get("new_stored", 0) if isinstance(c_result, dict) else 0

            total_found = h_new + c_new
            self.state.total_trends_found += total_found
            self.state.last_scan_at = datetime.utcnow()

            self.state.log(
                "maestro", "Trends discovered",
                f"Found {total_found} new — {h_new} hashtags + {c_new} competitors",
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
        Check performance of reels published 48-72h ago.
        Attribute results back to Toby or Lexi.
        """
        self.state.log("maestro", "Feedback", "Checking 48-72h post performance...", "📈")

        try:
            from app.db_connection import SessionLocal
            from app.models import TobyProposal, ScheduledReel, GenerationJob

            db = SessionLocal()
            try:
                now = datetime.utcnow()
                window_start = now - timedelta(hours=72)
                window_end = now - timedelta(hours=48)

                # Find reels published in the 48-72h window
                published = db.query(ScheduledReel).filter(
                    ScheduledReel.status == "published",
                    ScheduledReel.published_at >= window_start,
                    ScheduledReel.published_at <= window_end,
                ).all()

                if not published:
                    self.state.log("maestro", "Feedback", "No reels in 48-72h window to evaluate", "📊", "detail")
                    self.state.last_feedback_at = now
                    return

                toby_count = 0
                lexi_count = 0
                toby_views = 0
                lexi_views = 0

                for sched in published:
                    reel_id = sched.reel_id
                    if not reel_id:
                        continue

                    # reel_id format: {job_id}_{brand}
                    parts = reel_id.rsplit("_", 1)
                    if len(parts) < 2:
                        continue
                    job_id = parts[0]

                    job = db.query(GenerationJob).filter_by(job_id=job_id).first()
                    if not job:
                        continue

                    # job.user_id stores the proposal_id
                    proposal_id = job.user_id
                    proposal = db.query(TobyProposal).filter_by(proposal_id=proposal_id).first()
                    if not proposal:
                        continue

                    agent = proposal.agent_name or "toby"

                    # Get view count from extra_data if metrics collection has run
                    extra = sched.extra_data or {}
                    views = extra.get("views", 0) or 0

                    if agent == "toby":
                        toby_count += 1
                        toby_views += views
                    else:
                        lexi_count += 1
                        lexi_views += views

                toby_avg_views = round(toby_views / toby_count) if toby_count else 0
                lexi_avg_views = round(lexi_views / lexi_count) if lexi_count else 0

                self.state.log(
                    "maestro", "Feedback Results",
                    f"Toby: {toby_count} reels, {toby_views} total views (avg {toby_avg_views}) | "
                    f"Lexi: {lexi_count} reels, {lexi_views} total views (avg {lexi_avg_views})",
                    "📈"
                )

                # Store latest feedback data in DB for frontend
                import json
                feedback_data = {
                    "timestamp": now.isoformat(),
                    "window": f"{window_start.isoformat()} to {window_end.isoformat()}",
                    "toby": {"count": toby_count, "total_views": toby_views, "avg_views": toby_avg_views},
                    "lexi": {"count": lexi_count, "total_views": lexi_views, "avg_views": lexi_avg_views},
                }
                _db_set("last_feedback_data", json.dumps(feedback_data))

                self.state.last_feedback_at = now

            finally:
                db.close()

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Feedback cycle failed: {str(e)[:200]}", "❌")

    # ──────────────────────────────────────────────────────────
    # Manual trigger
    # ──────────────────────────────────────────────────────────

    def trigger_burst_now(self):
        """Manually trigger the daily burst. Ignores pause state."""
        self.state.log("maestro", "Manual burst", "Triggered by user", "🔘")

        # Reset last_daily_run so the check cycle picks it up
        # Or just run it directly
        thread = threading.Thread(target=self._run_daily_burst, daemon=True)
        thread.start()
        return {"status": "triggered", "message": "Daily burst started in background"}


# ── Auto-Schedule Helper ──────────────────────────────────────

def auto_schedule_job(job_id: str):
    """
    Auto-schedule all brand outputs from a completed job.

    For each brand with completed output:
      1. Find the next available scheduling slot
      2. Create a ScheduledReel entry
      3. The publishing daemon handles the rest
    """
    from app.db_connection import get_db_session
    from app.services.job_manager import JobManager
    from app.services.db_scheduler import DatabaseSchedulerService

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
        scheduler = DatabaseSchedulerService(db)
        scheduled_count = 0

        for brand, output in (job.brand_outputs or {}).items():
            if output.get("status") != "completed":
                continue

            reel_id = output.get("reel_id")
            video_path = output.get("video_path")
            thumbnail_path = output.get("thumbnail_path")
            yt_thumbnail_path = output.get("yt_thumbnail_path")
            caption = output.get("caption", "")
            yt_title = output.get("yt_title")

            if not reel_id or not video_path:
                continue

            try:
                slot = scheduler.get_next_available_slot(brand, variant)

                scheduler.schedule_reel(
                    user_id="maestro",
                    reel_id=reel_id,
                    scheduled_time=slot,
                    caption=caption,
                    yt_title=yt_title,
                    platforms=job.platforms or ["instagram", "facebook", "youtube"],
                    video_path=video_path,
                    thumbnail_path=thumbnail_path,
                    yt_thumbnail_path=yt_thumbnail_path,
                    user_name="Maestro",
                    brand=brand,
                    variant=variant,
                )
                scheduled_count += 1
                print(
                    f"[AUTO-SCHEDULE] {brand}/{variant} → {slot.strftime('%Y-%m-%d %H:%M')} (reel {reel_id})",
                    flush=True,
                )
            except Exception as e:
                print(f"[AUTO-SCHEDULE] Failed to schedule {brand}: {e}", flush=True)

        print(f"[AUTO-SCHEDULE] Job {job_id}: {scheduled_count}/{len(job.brand_outputs or {})} brands scheduled", flush=True)


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
