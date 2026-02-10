"""
Toby Daemon — Always-running autonomous AI agent.

Toby runs in the background like a human content strategist:
  - Collects performance metrics periodically
  - Scans for trending content
  - Generates proposals when he has new intelligence
  - Makes autonomous decisions about WHEN and HOW MANY to generate
  - Logs every thought and action

The user can only PAUSE or RESUME Toby — he's always thinking.
"""

import os
import time
import traceback
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger


# ── Daemon State ──────────────────────────────────────────────

class TobyState:
    """In-memory state for the Toby daemon."""

    def __init__(self):
        self.is_running: bool = True
        self.started_at: datetime = datetime.utcnow()
        self.paused_at: Optional[datetime] = None

        # Activity tracking
        self.last_thought: Optional[str] = None
        self.last_thought_at: Optional[datetime] = None
        self.last_metrics_at: Optional[datetime] = None
        self.last_scan_at: Optional[datetime] = None
        self.last_proposals_at: Optional[datetime] = None
        self.next_cycle_at: Optional[datetime] = None

        # Cycle stats
        self.total_cycles: int = 0
        self.total_proposals_generated: int = 0
        self.total_metrics_collected: int = 0
        self.total_trends_found: int = 0
        self.errors: int = 0

        # Activity log (last N actions)
        self.activity_log: list = []

    def log(self, action: str, detail: str = "", emoji: str = "🤖"):
        """Log an activity."""
        entry = {
            "time": datetime.utcnow().isoformat(),
            "action": action,
            "detail": detail,
            "emoji": emoji,
        }
        self.activity_log.insert(0, entry)
        # Keep last 100 entries
        if len(self.activity_log) > 100:
            self.activity_log = self.activity_log[:100]

        self.last_thought = f"{action}: {detail}" if detail else action
        self.last_thought_at = datetime.utcnow()
        print(f"   {emoji} [TOBY] {action} — {detail}", flush=True)

    def to_dict(self) -> Dict:
        """Get full status as dict."""
        now = datetime.utcnow()
        uptime_seconds = (now - self.started_at).total_seconds() if self.started_at else 0

        return {
            "is_running": self.is_running,
            "is_paused": not self.is_running,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "paused_at": self.paused_at.isoformat() if self.paused_at else None,
            "uptime_seconds": int(uptime_seconds),
            "uptime_human": _format_uptime(uptime_seconds),
            "last_thought": self.last_thought,
            "last_thought_at": self.last_thought_at.isoformat() if self.last_thought_at else None,
            "last_metrics_at": self.last_metrics_at.isoformat() if self.last_metrics_at else None,
            "last_scan_at": self.last_scan_at.isoformat() if self.last_scan_at else None,
            "last_proposals_at": self.last_proposals_at.isoformat() if self.last_proposals_at else None,
            "next_cycle_at": self.next_cycle_at.isoformat() if self.next_cycle_at else None,
            "total_cycles": self.total_cycles,
            "total_proposals_generated": self.total_proposals_generated,
            "total_metrics_collected": self.total_metrics_collected,
            "total_trends_found": self.total_trends_found,
            "errors": self.errors,
            "recent_activity": self.activity_log[:20],
        }


def _format_uptime(seconds: float) -> str:
    """Format seconds into human-readable uptime."""
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


# ── Daemon Configuration ─────────────────────────────────────

# How often each cycle runs (in minutes)
THINKING_CYCLE_MINUTES = int(os.getenv("TOBY_CYCLE_MINUTES", "120"))     # Main brain cycle: 2 hours
METRICS_CYCLE_MINUTES = int(os.getenv("TOBY_METRICS_MINUTES", "360"))    # Metrics: every 6 hours
SCAN_CYCLE_MINUTES = int(os.getenv("TOBY_SCAN_MINUTES", "240"))          # Trend scan: every 4 hours

# Controls
MAX_PROPOSALS_PER_CYCLE = 3   # Don't overwhelm — think in small batches
MIN_PROPOSALS_BEFORE_REST = 2  # If less than 2 remaining today, rest
STARTUP_DELAY_SECONDS = 30     # Wait 30s after app boot before first cycle


# ── The Daemon ────────────────────────────────────────────────

class TobyDaemon:
    """
    Toby's autonomous loop — runs like a human content strategist.

    Three independent cycles:
      1. THINK  (every 2h) — Main brain: gather intel, decide if proposals needed, generate
      2. OBSERVE (every 6h) — Collect metrics from published posts
      3. SCOUT  (every 4h) — Scan external trends and competitors
    """

    def __init__(self):
        self.state = TobyState()
        self.scheduler: Optional[BackgroundScheduler] = None
        self.state.log("Initializing", "Toby daemon created", "🧠")

    def start(self):
        """Start the autonomous daemon."""
        self.scheduler = BackgroundScheduler()

        # Main thinking cycle
        self.scheduler.add_job(
            self._think_cycle,
            trigger=IntervalTrigger(minutes=THINKING_CYCLE_MINUTES),
            id="toby_think",
            name="Toby Think Cycle",
            next_run_time=datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS),
            replace_existing=True,
            max_instances=1,
        )

        # Metrics collection cycle
        self.scheduler.add_job(
            self._observe_cycle,
            trigger=IntervalTrigger(minutes=METRICS_CYCLE_MINUTES),
            id="toby_observe",
            name="Toby Observe Cycle",
            next_run_time=datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS + 60),
            replace_existing=True,
            max_instances=1,
        )

        # Trend scanning cycle
        self.scheduler.add_job(
            self._scout_cycle,
            trigger=IntervalTrigger(minutes=SCAN_CYCLE_MINUTES),
            id="toby_scout",
            name="Toby Scout Cycle",
            next_run_time=datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS + 120),
            replace_existing=True,
            max_instances=1,
        )

        self.scheduler.start()
        self.state.is_running = True
        self.state.started_at = datetime.utcnow()
        self.state.next_cycle_at = datetime.utcnow() + timedelta(seconds=STARTUP_DELAY_SECONDS)
        self.state.log("Started", f"Autonomous daemon running. Think every {THINKING_CYCLE_MINUTES}m, Observe every {METRICS_CYCLE_MINUTES}m, Scout every {SCAN_CYCLE_MINUTES}m", "🚀")

    def pause(self) -> Dict:
        """Pause Toby — stops all cycles but keeps state."""
        if not self.state.is_running:
            return {"status": "already_paused", "message": "Toby is already paused"}

        if self.scheduler:
            self.scheduler.pause()

        self.state.is_running = False
        self.state.paused_at = datetime.utcnow()
        self.state.log("Paused", "User paused Toby. All cycles suspended.", "⏸️")

        return {
            "status": "paused",
            "message": "Toby is now paused. Resume anytime.",
            "paused_at": self.state.paused_at.isoformat(),
        }

    def resume(self) -> Dict:
        """Resume Toby — restarts all cycles."""
        if self.state.is_running:
            return {"status": "already_running", "message": "Toby is already running"}

        if self.scheduler:
            self.scheduler.resume()

        self.state.is_running = True
        pause_duration = ""
        if self.state.paused_at:
            duration = datetime.utcnow() - self.state.paused_at
            pause_duration = f" Was paused for {_format_uptime(duration.total_seconds())}."
        self.state.paused_at = None
        self.state.log("Resumed", f"Toby is back.{pause_duration}", "▶️")

        return {
            "status": "running",
            "message": f"Toby resumed.{pause_duration}",
        }

    def get_status(self) -> Dict:
        """Get full daemon status."""
        # Update next_cycle_at from scheduler
        if self.scheduler and self.state.is_running:
            try:
                think_job = self.scheduler.get_job("toby_think")
                if think_job and think_job.next_run_time:
                    self.state.next_cycle_at = think_job.next_run_time.replace(tzinfo=None)
            except Exception:
                pass

        return self.state.to_dict()

    # ──────────────────────────────────────────────────────────
    # CYCLE 1: THINK — Main brain loop
    # ──────────────────────────────────────────────────────────

    def _think_cycle(self):
        """
        Main thinking cycle — Toby's brain.

        Decision flow:
        1. Check if we're paused
        2. Gather latest intelligence
        3. Decide IF we need new proposals (based on pending count, today's quota)
        4. If yes, generate a small batch
        5. Log everything
        """
        if not self.state.is_running:
            return

        self.state.total_cycles += 1
        cycle_start = datetime.utcnow()
        self.state.log("Thinking", f"Cycle #{self.state.total_cycles} starting...", "💭")

        try:
            from app.services.toby_agent import get_toby_agent

            agent = get_toby_agent()

            # 1. Check today's quota
            today_count = agent._count_proposals_today()
            remaining = max(0, 10 - today_count)  # MAX_PROPOSALS_PER_DAY

            if remaining == 0:
                self.state.log("Resting", f"Already made {today_count} proposals today. Will try tomorrow.", "😴")
                return

            # 2. Check pending proposals — don't flood if user hasn't reviewed
            from app.db_connection import SessionLocal
            from app.models import TobyProposal

            db = SessionLocal()
            try:
                pending_count = (
                    db.query(TobyProposal)
                    .filter(TobyProposal.status == "pending")
                    .count()
                )
            finally:
                db.close()

            if pending_count >= 8:
                self.state.log(
                    "Waiting",
                    f"{pending_count} proposals pending review. Won't generate more until user reviews some.",
                    "⏳"
                )
                return

            # 3. Decide how many to generate this cycle
            batch_size = min(MAX_PROPOSALS_PER_CYCLE, remaining)

            # If many pending, reduce batch
            if pending_count >= 5:
                batch_size = min(batch_size, 1)
                self.state.log("Throttling", f"{pending_count} pending — generating only 1 this cycle", "🎛️")

            self.state.log("Generating", f"Creating {batch_size} proposals (today: {today_count}/{10}, pending: {pending_count})", "⚡")

            # 4. Run Toby
            result = agent.run(max_proposals=batch_size)
            created = result.get("proposals_created", 0)

            self.state.total_proposals_generated += created
            self.state.last_proposals_at = datetime.utcnow()

            # Log result
            strategies = result.get("strategies_used", {})
            strategy_str = ", ".join(f"{k}:{v}" for k, v in strategies.items() if v > 0)
            self.state.log(
                "Generated",
                f"{created} proposal(s) using [{strategy_str}]. Today total: {result.get('today_total', 0)}/10",
                "✨"
            )

            # Log intel summary
            intel = result.get("intel_summary", {})
            if intel:
                self.state.log(
                    "Intel",
                    f"Top performers: {intel.get('top_performers', 0)}, "
                    f"Underperformers: {intel.get('underperformers', 0)}, "
                    f"Trending: {intel.get('trending_available', 0)}, "
                    f"Topics on cooldown: {len(intel.get('topics_on_cooldown', []))}",
                    "📊"
                )

        except Exception as e:
            self.state.errors += 1
            self.state.log("Error", f"Think cycle failed: {str(e)[:200]}", "❌")
            traceback.print_exc()

        elapsed = (datetime.utcnow() - cycle_start).total_seconds()
        self.state.log("Cycle complete", f"Took {elapsed:.1f}s", "✅")

    # ──────────────────────────────────────────────────────────
    # CYCLE 2: OBSERVE — Metrics collection
    # ──────────────────────────────────────────────────────────

    def _observe_cycle(self):
        """
        Observe cycle — collect performance metrics from published posts.

        Feeds Toby's intelligence about what's working and what's not.
        """
        if not self.state.is_running:
            return

        self.state.log("Observing", "Collecting performance metrics from IG...", "👀")

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
                "Metrics collected",
                f"Updated {total_updated} posts across brands. {f'({total_errors} errors)' if total_errors else ''} [{brands_str}]",
                "📈"
            )

        except Exception as e:
            self.state.errors += 1
            self.state.log("Error", f"Observe cycle failed: {str(e)[:200]}", "❌")

    # ──────────────────────────────────────────────────────────
    # CYCLE 3: SCOUT — Trend scanning
    # ──────────────────────────────────────────────────────────

    def _scout_cycle(self):
        """
        Scout cycle — scan for trending health/wellness content.

        Discovers viral content Toby can adapt.
        """
        if not self.state.is_running:
            return

        self.state.log("Scouting", "Scanning for trending health/wellness content...", "🔍")

        try:
            from app.services.trend_scout import get_trend_scout

            scout = get_trend_scout()

            # Scan hashtags (max 5 to respect rate limits)
            hashtag_result = scout.scan_hashtags(max_hashtags=3)
            h_discovered = hashtag_result.get("discovered", 0) if isinstance(hashtag_result, dict) else 0

            # Scan competitors
            competitor_result = scout.scan_competitors()
            c_discovered = competitor_result.get("discovered", 0) if isinstance(competitor_result, dict) else 0

            total_found = h_discovered + c_discovered
            self.state.total_trends_found += total_found
            self.state.last_scan_at = datetime.utcnow()

            self.state.log(
                "Trends discovered",
                f"Found {total_found} trending pieces ({h_discovered} from hashtags, {c_discovered} from competitors)",
                "🔥"
            )

        except Exception as e:
            self.state.errors += 1
            self.state.log("Error", f"Scout cycle failed: {str(e)[:200]}", "❌")


# ── Singleton ─────────────────────────────────────────────────

_daemon: Optional[TobyDaemon] = None


def get_toby_daemon() -> TobyDaemon:
    """Get or create the Toby daemon singleton."""
    global _daemon
    if _daemon is None:
        _daemon = TobyDaemon()
    return _daemon


def start_toby_daemon():
    """Initialize and start the Toby daemon. Called on app startup."""
    daemon = get_toby_daemon()
    if daemon.scheduler is None or not daemon.scheduler.running:
        daemon.start()
        print("🧠 Toby daemon started — autonomous mode active", flush=True)
    else:
        print("🧠 Toby daemon already running", flush=True)
    return daemon
