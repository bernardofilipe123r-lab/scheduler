"""
Maestro — The AI Content Orchestrator.

Maestro manages two AI agents — Toby (Explorer) and Lexi (Optimizer) —
running them in a deterministic 4-cycle rotation:

    Cycle 1: Toby  🎬 Reel
    Cycle 2: Lexi  🎬 Reel
    Cycle 3: Toby  📄 Post
    Cycle 4: Lexi  📄 Post
    (repeat)

Design principles:
    - ALWAYS auto-starts on deployment. No pause/resume. No manual intervention.
    - Both agents share the same DB table (TobyProposal) with agent_name column.
    - Observe & Scout cycles are shared between both agents.
    - All exceptions are caught and logged — Maestro never stops.
    - Unified activity log for full transparency.
"""

import os
import traceback
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger


# ── Configuration ─────────────────────────────────────────────

THINKING_CYCLE_MINUTES = int(os.getenv("MAESTRO_CYCLE_MINUTES", os.getenv("TOBY_CYCLE_MINUTES", "45")))
METRICS_CYCLE_MINUTES = int(os.getenv("MAESTRO_METRICS_MINUTES", os.getenv("TOBY_METRICS_MINUTES", "180")))
SCAN_CYCLE_MINUTES = int(os.getenv("MAESTRO_SCAN_MINUTES", os.getenv("TOBY_SCAN_MINUTES", "240")))

MAX_PROPOSALS_PER_CYCLE = 3
MAX_PENDING_HARD_STOP = 100  # Effectively disabled — auto-accept handles it
MAX_PENDING_THROTTLE = 50    # Effectively disabled — auto-accept handles it
STARTUP_DELAY_SECONDS = 30

# Daily limit shared across agents
DAILY_PROPOSAL_LIMIT = int(os.getenv("MAESTRO_DAILY_LIMIT", "30"))

# 4-cycle rotation
ROTATION = [
    ("toby", "reel"),   # Phase 0
    ("lexi", "reel"),   # Phase 1
    ("toby", "post"),   # Phase 2
    ("lexi", "post"),   # Phase 3
]


# ── Maestro State ─────────────────────────────────────────────

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
    """Unified state for the Maestro orchestrator.  Always running."""

    def __init__(self):
        self.is_running: bool = True  # ALWAYS True — Maestro never pauses
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
        self.current_content_type: Optional[str] = None
        self.next_cycle_at: Optional[datetime] = None

        # Timestamps
        self.last_metrics_at: Optional[datetime] = None
        self.last_scan_at: Optional[datetime] = None

        # Activity log — unified for both agents
        self.activity_log: List[Dict] = []

    def log(self, agent: str, action: str, detail: str = "", emoji: str = "🤖", level: str = "action"):
        """
        Log an activity with agent tag.

        agent: "maestro" | "toby" | "lexi"
        level: "action" | "detail" | "api" | "data"
        """
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

        # Update agent-level last_thought for high-level actions
        if level == "action" and agent in self.agents:
            self.agents[agent].last_thought = f"{action}: {detail}" if detail else action
            self.agents[agent].last_thought_at = datetime.utcnow()

        prefix_map = {"action": "🤖", "detail": "  ├─", "api": "  🌐", "data": "  📊"}
        prefix = prefix_map.get(level, "  ")
        tag = agent.upper()
        print(f"   {prefix} [{tag}] {action} — {detail}", flush=True)

    def to_dict(self) -> Dict:
        """Full Maestro status dict."""
        now = datetime.utcnow()
        uptime = (now - self.started_at).total_seconds() if self.started_at else 0

        # Determine what's coming next
        phase = self.total_cycles % len(ROTATION)
        next_agent, next_type = ROTATION[phase]

        return {
            "is_running": True,  # ALWAYS True
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "uptime_seconds": int(uptime),
            "uptime_human": _format_uptime(uptime),
            "current_agent": self.current_agent,
            "current_content_type": self.current_content_type,
            "next_agent": next_agent,
            "next_content_type": next_type,
            "next_cycle_at": self.next_cycle_at.isoformat() if self.next_cycle_at else None,
            "total_cycles": self.total_cycles,
            "total_proposals_generated": self.total_proposals_generated,
            "total_metrics_collected": self.total_metrics_collected,
            "total_trends_found": self.total_trends_found,
            "errors": self.errors,
            "agents": {
                name: agent.to_dict() for name, agent in self.agents.items()
            },
            "recent_activity": self.activity_log[:30],
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


# ── The Maestro Daemon ────────────────────────────────────────

class MaestroDaemon:
    """
    The orchestrator — manages Toby and Lexi.

    Three cycles:
      1. THINK  — 4-phase rotation between agents and content types
      2. OBSERVE — Collect metrics (shared between agents)
      3. SCOUT — Scan trends (shared between agents)

    Auto-starts. Never pauses. Catches all errors.
    """

    def __init__(self):
        self.state = MaestroState()
        self.scheduler: Optional[BackgroundScheduler] = None
        self.state.log("maestro", "Initializing", "Maestro orchestrator created", "🎼")

    def start(self):
        """Start Maestro — called on every deployment. No manual action needed."""
        self.scheduler = BackgroundScheduler()

        # Think cycle — main brain
        self.scheduler.add_job(
            self._think_cycle,
            trigger=IntervalTrigger(minutes=THINKING_CYCLE_MINUTES),
            id="maestro_think",
            name="Maestro Think Cycle",
            next_run_time=datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS),
            replace_existing=True,
            max_instances=1,
        )

        # Observe cycle — metrics
        self.scheduler.add_job(
            self._observe_cycle,
            trigger=IntervalTrigger(minutes=METRICS_CYCLE_MINUTES),
            id="maestro_observe",
            name="Maestro Observe Cycle",
            next_run_time=datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS + 60),
            replace_existing=True,
            max_instances=1,
        )

        # Scout cycle — trends
        self.scheduler.add_job(
            self._scout_cycle,
            trigger=IntervalTrigger(minutes=SCAN_CYCLE_MINUTES),
            id="maestro_scout",
            name="Maestro Scout Cycle",
            next_run_time=datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS + 120),
            replace_existing=True,
            max_instances=1,
        )

        self.scheduler.start()
        self.state.is_running = True
        self.state.started_at = datetime.utcnow()
        self.state.next_cycle_at = datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS)

        self.state.log(
            "maestro", "Started",
            f"Orchestrating Toby + Lexi. Think every {THINKING_CYCLE_MINUTES}m, Observe every {METRICS_CYCLE_MINUTES}m, Scout every {SCAN_CYCLE_MINUTES}m",
            "🚀"
        )

    def get_status(self) -> Dict:
        """Get full orchestrator status."""
        if self.scheduler and self.state.is_running:
            try:
                job = self.scheduler.get_job("maestro_think")
                if job and job.next_run_time:
                    self.state.next_cycle_at = job.next_run_time.replace(tzinfo=None)
            except Exception:
                pass

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
    # CYCLE 1: THINK — 4-phase rotation
    # ──────────────────────────────────────────────────────────

    def _think_cycle(self):
        """
        Main brain — rotates between Toby+Lexi and Reel+Post.

        Phase rotation:
          0: Toby Reel      1: Lexi Reel
          2: Toby Post       3: Lexi Post
        """
        self.state.total_cycles += 1
        cycle_start = datetime.utcnow()

        # Determine which agent + content type this cycle
        phase = (self.state.total_cycles - 1) % len(ROTATION)
        agent_name, content_type = ROTATION[phase]

        self.state.current_agent = agent_name
        self.state.current_content_type = content_type

        ct_label = "📄 Post" if content_type == "post" else "🎬 Reel"
        agent_label = "🧠 Toby" if agent_name == "toby" else "📊 Lexi"

        self.state.log(
            "maestro", "Thinking",
            f"Cycle #{self.state.total_cycles} — {agent_label} {ct_label} (phase {phase + 1}/4)",
            "💭"
        )

        try:
            # 1. Global quota check
            from app.db_connection import SessionLocal
            from app.models import TobyProposal

            db = SessionLocal()
            try:
                today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
                today_total = db.query(TobyProposal).filter(TobyProposal.created_at >= today).count()
                pending_count = db.query(TobyProposal).filter(TobyProposal.status == "pending").count()
            finally:
                db.close()

            remaining = max(0, DAILY_PROPOSAL_LIMIT - today_total)

            if remaining == 0:
                self.state.log(
                    "maestro", "Resting",
                    f"Daily limit reached ({today_total}/{DAILY_PROPOSAL_LIMIT}). Will try tomorrow.",
                    "😴"
                )
                self.state.current_agent = None
                self.state.current_content_type = None
                return

            if pending_count >= MAX_PENDING_HARD_STOP:
                self.state.log(
                    "maestro", "Waiting",
                    f"{pending_count} proposals pending review. Won't generate more until user reviews.",
                    "⏳"
                )
                self.state.current_agent = None
                self.state.current_content_type = None
                return

            # 2. Calculate batch size
            batch_size = min(MAX_PROPOSALS_PER_CYCLE, remaining)
            if pending_count >= MAX_PENDING_THROTTLE:
                batch_size = min(batch_size, 1)
                self.state.log(
                    "maestro", "Throttling",
                    f"{pending_count} pending — generating only 1 this cycle",
                    "🎛️", "detail"
                )

            self.state.log(
                "maestro", "Dispatching",
                f"{agent_label} generating {batch_size} {ct_label}(s) — today: {today_total}/{DAILY_PROPOSAL_LIMIT}, pending: {pending_count}",
                "⚡"
            )

            # 3. Get agent and run
            if agent_name == "toby":
                from app.services.toby_agent import get_toby_agent
                agent = get_toby_agent()
            else:
                from app.services.lexi_agent import get_lexi_agent
                agent = get_lexi_agent()

            result = agent.run(max_proposals=batch_size, content_type=content_type)
            created = result.get("proposals_created", 0)

            # 4. Update stats
            self.state.total_proposals_generated += created
            self.state.agents[agent_name].total_proposals += created

            strategies = result.get("strategies_used", {})
            strategy_str = ", ".join(f"{k}:{v}" for k, v in strategies.items() if v > 0)

            self.state.log(
                agent_name, "Generated",
                f"{created} {ct_label}(s) [{strategy_str}]. Today total: {result.get('today_total', 0)}",
                "✨"
            )

            # Log intel summary
            intel = result.get("intel_summary", {})
            if intel:
                self.state.log(
                    agent_name, "Intel",
                    f"Top: {intel.get('top_performers', 0)}, Under: {intel.get('underperformers', 0)}, "
                    f"Trending: {intel.get('trending_available', 0)}, Cooldown: {len(intel.get('topics_on_cooldown', []))}",
                    "📊", "detail"
                )

            # 5. AUTO-ACCEPT — immediately accept all new proposals and create jobs
            proposals = result.get("proposals", [])
            if proposals:
                self._auto_accept_proposals(proposals, agent_name, content_type)

        except Exception as e:
            self.state.errors += 1
            self.state.agents[agent_name].errors += 1
            self.state.log(agent_name, "Error", f"Think cycle failed: {str(e)[:200]}", "❌")
            traceback.print_exc()

        elapsed = (datetime.utcnow() - cycle_start).total_seconds()
        self.state.log("maestro", "Cycle complete", f"Took {elapsed:.1f}s", "✅", "detail")
        self.state.current_agent = None
        self.state.current_content_type = None

    # ──────────────────────────────────────────────────────────
    # CYCLE 2: OBSERVE — Shared metrics collection
    # ──────────────────────────────────────────────────────────

    def _observe_cycle(self):
        """Collect performance metrics — shared across agents."""
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
                f"Updated {total_updated} posts. {f'({total_errors} errors)' if total_errors else ''} [{brands_str}]",
                "📈"
            )

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Observe cycle failed: {str(e)[:200]}", "❌")

    # ──────────────────────────────────────────────────────────
    # CYCLE 3: SCOUT — Shared trend scanning
    # ──────────────────────────────────────────────────────────

    def _scout_cycle(self):
        """Scan for trending content — shared across agents."""
        self.state.log("maestro", "Scouting", "Scanning for trending health/wellness content...", "🔍")

        try:
            from app.services.trend_scout import get_trend_scout

            scout = get_trend_scout()

            # Reel hashtags (max 3 to respect rate limits)
            hashtag_result = scout.scan_hashtags(max_hashtags=3)
            h_new = hashtag_result.get("new_stored", 0) if isinstance(hashtag_result, dict) else 0

            # Reel competitors
            competitor_result = scout.scan_competitors()
            c_new = competitor_result.get("new_stored", 0) if isinstance(competitor_result, dict) else 0

            # Post hashtags
            post_h_result = scout.scan_post_hashtags(max_hashtags=3)
            ph_new = post_h_result.get("new_stored", 0) if isinstance(post_h_result, dict) else 0

            # Post competitors (8 per run, rotates through 32)
            post_c_result = scout.scan_post_competitors(max_accounts=8)
            pc_new = post_c_result.get("new_stored", 0) if isinstance(post_c_result, dict) else 0

            total_found = h_new + c_new + ph_new + pc_new
            self.state.total_trends_found += total_found
            self.state.last_scan_at = datetime.utcnow()

            self.state.log(
                "maestro", "Trends discovered",
                f"Found {total_found} new — Reels: {h_new} hashtags + {c_new} competitors | Posts: {ph_new} hashtags + {pc_new} competitors",
                "🔥"
            )

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Scout cycle failed: {str(e)[:200]}", "❌")

    # ──────────────────────────────────────────────────────────
    # AUTO-ACCEPT — proposals automatically become jobs
    # ──────────────────────────────────────────────────────────

    def _auto_accept_proposals(self, proposals: List[Dict], agent_name: str, content_type: str):
        """
        Auto-accept proposals immediately after generation.

        For each proposal:
          1. Mark as accepted in DB
          2. Create a GenerationJob for ALL 5 brands
          3. Process job in background thread (generates content)
          4. Auto-schedule after completion
        """
        import threading
        from app.db_connection import SessionLocal, get_db_session
        from app.models import TobyProposal
        from app.services.job_manager import JobManager

        ALL_BRANDS = [
            "healthycollege", "vitalitycollege", "longevitycollege",
            "holisticcollege", "wellbeingcollege",
        ]

        for p_dict in proposals:
            proposal_id = p_dict.get("proposal_id")
            if not proposal_id:
                continue

            try:
                # 1. Mark accepted in DB
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
                    p_content_type = proposal.content_type or content_type
                finally:
                    db.close()

                # 2. Create job
                variant = "post" if p_content_type == "post" else "dark"
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
                    job_id = job.job_id

                # 3. Store job_id on proposal
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
                    agent_name, "Auto-accepted",
                    f"{proposal_id} → Job {job_id} (5 brands)",
                    "✅"
                )

                # 4. Process job in separate thread (non-blocking)
                def _process_and_schedule(jid: str, pid: str):
                    try:
                        with get_db_session() as pdb:
                            m = JobManager(pdb)
                            m.process_job(jid)

                        # After job completes → auto-schedule
                        auto_schedule_job(jid)

                        self.state.log(
                            "maestro", "Auto-scheduled",
                            f"Job {jid} (from {pid}) → content generated & scheduled",
                            "📅"
                        )
                    except Exception as e:
                        self.state.log(
                            "maestro", "Auto-process error",
                            f"Job {jid}: {str(e)[:200]}",
                            "❌"
                        )
                        traceback.print_exc()

                thread = threading.Thread(
                    target=_process_and_schedule,
                    args=(job_id, proposal_id),
                    daemon=True,
                )
                thread.start()

            except Exception as e:
                self.state.log(
                    agent_name, "Auto-accept error",
                    f"{proposal_id}: {str(e)[:200]}",
                    "❌"
                )
                traceback.print_exc()


# ── Auto-Schedule Helper ──────────────────────────────────────

def auto_schedule_job(job_id: str):
    """
    Auto-schedule all brand outputs from a completed job.

    For each brand:
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
                    f"[AUTO-SCHEDULE] {brand} → {slot.strftime('%Y-%m-%d %H:%M')} (reel {reel_id})",
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

    Args:
        agent: "maestro" | "toby" | "lexi"
        action: High-level action name
        detail: Details string
        emoji: Emoji for display
        level: "action" | "detail" | "api" | "data"
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
        print("🎼 Maestro started — orchestrating Toby + Lexi (autonomous mode)", flush=True)
    else:
        print("🎼 Maestro already running", flush=True)
    return maestro
