"""
Maestro — The AI Content Orchestrator (v2).
Split into modules: maestro_state, maestro_cycles, maestro_healing, maestro_proposals, maestro_scheduler_logic.
"""

# ── Re-export everything from sub-modules ─────────────────────────
# So existing `from app.services.maestro import X` keeps working.
from app.services.maestro_state import (  # noqa: F401
    # Constants
    LISBON_TZ, BRAND_HANDLES,
    CHECK_CYCLE_MINUTES, METRICS_CYCLE_MINUTES, SCAN_CYCLE_MINUTES,
    FEEDBACK_CYCLE_MINUTES, HEALING_CYCLE_MINUTES, MAX_AUTO_RETRIES,
    EVOLUTION_DAY, EVOLUTION_HOUR, DIAGNOSTICS_CYCLE_MINUTES,
    BOOTSTRAP_CYCLE_MINUTES, BOOTSTRAP_MAX_DAYS, JOB_TIMEOUT_MINUTES,
    STARTUP_DELAY_SECONDS, MAX_CONCURRENT_JOBS, JOB_STAGGER_DELAY,
    _job_semaphore, PROPOSALS_PER_BRAND_PER_AGENT, POSTS_PER_BRAND,
    # Functions
    _get_all_brands, _get_all_brands_list, ALL_BRANDS,
    _db_get, _db_set,
    is_paused, set_paused, is_posts_paused, set_posts_paused,
    get_last_daily_run, set_last_daily_run,
    _format_uptime, _time_ago,
    # Classes
    AgentState, MaestroState,
)
from app.services.maestro_scheduler_logic import (  # noqa: F401
    auto_schedule_job, schedule_all_ready_reels,
)
from app.services.maestro_cycles import CyclesMixin
from app.services.maestro_healing import HealingMixin
from app.services.maestro_proposals import ProposalsMixin

import threading
import traceback
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger


# ── The Maestro Daemon ────────────────────────────────────────

class MaestroDaemon(ProposalsMixin, CyclesMixin, HealingMixin):
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
                # ── No dynamic agents found — log warning ──
                self.state.log("maestro", "Warning", "No active agents found in DB — skipping burst", "⚠️")

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
