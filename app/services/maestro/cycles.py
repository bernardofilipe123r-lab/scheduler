"""Maestro background cycle methods — observe, scout, bootstrap, feedback, evolution, diagnostics."""

import traceback
from datetime import datetime
from typing import Dict, List, Optional

from app.services.maestro.state import (
    _db_get,
    _db_set,
    is_paused,
    BOOTSTRAP_CYCLE_MINUTES,
    BOOTSTRAP_MAX_DAYS,
    DIAGNOSTICS_CYCLE_MINUTES,
    EVOLUTION_DAY,
    EVOLUTION_HOUR,
)
from app.models import AIAgent


def _get_active_user_ids() -> List[str]:
    """Return user_ids for all active UserProfile records, or empty list."""
    try:
        from app.db_connection import SessionLocal
        from app.models import UserProfile
        db = SessionLocal()
        try:
            users = db.query(UserProfile.user_id).filter(UserProfile.active == True).all()
            return [u[0] for u in users]
        finally:
            db.close()
    except Exception:
        return []


class CyclesMixin:
    # ──────────────────────────────────────────────────────────
    # CYCLE: OBSERVE — Shared metrics collection
    # ──────────────────────────────────────────────────────────

    def _observe_cycle(self):
        """Collect performance metrics — runs even when paused."""
        self.state.log("maestro", "Observing", "Collecting performance metrics from IG...", "👀")

        try:
            from app.services.analytics.metrics_collector import get_metrics_collector

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

            # Record API usage for quota tracking (~2 calls per post updated)
            from app.services.api_quota_manager import get_quota_manager
            estimated_calls = max(total_updated * 2, 1)
            quota = get_quota_manager()
            quota.record_usage('meta', estimated_calls, operation='observe_cycle')

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Observe cycle failed: {str(e)[:200]}", "❌")

    # ──────────────────────────────────────────────────────────
    # CYCLE: SCOUT — Trend scanning
    # ──────────────────────────────────────────────────────────

    def _scout_cycle(self):
        """Scan for trending content — reels AND posts. Runs even when paused."""
        # Quota gate — defer if API budget is reserved for higher-priority work
        from app.services.api_quota_manager import get_quota_manager
        quota = get_quota_manager()
        if not quota.should_allow('meta', 'competitor_scrape', calls_needed=10):
            self.state.log("maestro", "Scout deferred", "API quota reserved for higher priority", "⏸️", "detail")
            return

        self.state.log("maestro", "Scouting", "Scanning trends for reels + posts...", "🔭")

        try:
            from app.services.analytics.trend_scout import get_trend_scout

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

            # Record API usage for quota tracking (~10 calls for full scout)
            quota.record_usage('meta', 10, operation='scout_cycle')

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Scout cycle failed: {str(e)[:200]}", "❌")

    # ──────────────────────────────────────────────────────────
    # CYCLE: BOOTSTRAP — Cold-start safe research (every 20min)
    # ──────────────────────────────────────────────────────────

    def _bootstrap_cycle(self):
        """
        Cold-start research cycle — populates agents' knowledge base safely.

        Runs every 20 minutes and auto-disables once mature.

        Rate-limit strategy (Meta API friendly):
          - Each tick: 1 own account + 1 competitor + 1 hashtag = ~4 API calls
          - 4 calls / 20 min = 12 calls/hour — well under Meta's 200/hour limit
          - 2-second pauses between API calls inside bootstrap_scan_tick()
          - Rotates through accounts/hashtags naturally (picks least-scanned)

        Auto-disable conditions (checked BEFORE each tick):
          - 50+ own-account entries in trending_content
          - AND 150+ total trending entries
          - OR system has been running for 14+ days
          - OR bootstrap_complete flag set manually

        Once disabled, removes itself from the scheduler permanently.
        """
        # Skip if already complete
        if self.state.bootstrap_complete:
            return

        # Check if bootstrap was already marked complete in DB
        if _db_get("bootstrap_complete", "false") == "true":
            self.state.bootstrap_complete = True
            self._stop_bootstrap_scheduler()
            return

        try:
            from app.services.analytics.trend_scout import get_trend_scout
            scout = get_trend_scout()

            # ── Check maturity — should we stop? ──
            maturity = scout.get_bootstrap_maturity()

            if maturity.get("is_mature"):
                self.state.bootstrap_complete = True
                _db_set("bootstrap_complete", "true")
                self._stop_bootstrap_scheduler()
                self.state.log(
                    "maestro", "🌱 Bootstrap Complete",
                    f"System is mature — own: {maturity['own_account_entries']}, "
                    f"competitors: {maturity['competitor_entries']}, "
                    f"hashtags: {maturity['hashtag_entries']}, "
                    f"performances: {maturity['tracked_performances']}. "
                    f"Collected {self.state.bootstrap_items_collected} items over {self.state.bootstrap_ticks} ticks. "
                    f"Bootstrap cycle disabled — regular Scout cycle handles ongoing research.",
                    "✅"
                )
                return

            # Check age-based auto-disable (14 days)
            bootstrap_started = _db_get("bootstrap_started_at", "")
            if bootstrap_started:
                try:
                    started = datetime.fromisoformat(bootstrap_started)
                    age_days = (datetime.utcnow() - started).days
                    if age_days >= BOOTSTRAP_MAX_DAYS:
                        self.state.bootstrap_complete = True
                        _db_set("bootstrap_complete", "true")
                        self._stop_bootstrap_scheduler()
                        self.state.log(
                            "maestro", "🌱 Bootstrap Aged Out",
                            f"Running for {age_days} days (max {BOOTSTRAP_MAX_DAYS}). "
                            f"Collected {self.state.bootstrap_items_collected} items. Disabling.",
                            "✅"
                        )
                        return
                except Exception:
                    pass
            else:
                # First ever run — record start time
                _db_set("bootstrap_started_at", datetime.utcnow().isoformat())

            # ── Run one safe tick ──
            self.state.log(
                "maestro", "🌱 Bootstrap Tick",
                f"Tick #{self.state.bootstrap_ticks + 1} — "
                f"own: {maturity.get('own_account_entries', 0)}, "
                f"comp: {maturity.get('competitor_entries', 0)}, "
                f"hash: {maturity.get('hashtag_entries', 0)} "
                f"(mature at: own≥50 & total≥150)",
                "🌱"
            )

            result = scout.bootstrap_scan_tick()

            if "error" not in result:
                tick_total = (
                    result.get("own_account_new", 0) +
                    result.get("competitor_new", 0) +
                    result.get("hashtag_new", 0)
                )
                self.state.bootstrap_ticks += 1
                self.state.bootstrap_items_collected += tick_total
                self.state.last_bootstrap_at = datetime.utcnow()

                self.state.log(
                    "maestro", "🌱 Bootstrap Done",
                    f"+{tick_total} items (own: +{result.get('own_account_new', 0)}, "
                    f"comp: +{result.get('competitor_new', 0)}, "
                    f"hash: +{result.get('hashtag_new', 0)}) — "
                    f"{result.get('api_calls', 0)} API calls used. "
                    f"Total collected: {self.state.bootstrap_items_collected}",
                    "🌱"
                )
            else:
                self.state.log(
                    "maestro", "Bootstrap tick error",
                    f"{result.get('error', 'unknown')[:200]}",
                    "⚠️", "detail"
                )

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Bootstrap cycle failed: {str(e)[:200]}", "❌")

    def _stop_bootstrap_scheduler(self):
        """Remove the bootstrap job from the scheduler."""
        try:
            if self.scheduler and self.scheduler.running:
                self.scheduler.remove_job("maestro_bootstrap")
                self.state.log("maestro", "Bootstrap scheduler removed", "No longer needed", "🌱", "detail")
        except Exception:
            pass  # Job may not exist

    # ──────────────────────────────────────────────────────────
    # CYCLE: FEEDBACK — Performance attribution (48-72h)
    # ──────────────────────────────────────────────────────────

    def _feedback_cycle(self):
        """
        Performance attribution + agent learning loop.
        Multi-user: iterates over all active users, falls back to unscoped if none.

        1. FeedbackEngine: attributes published content (48-72h) back to agents
        2. Calculates per-agent survival scores with strategy breakdowns
        3. AdaptationEngine: mutates agent DNA (weights, temperature) based on results
        4. Logs all mutations to AgentLearning for audit trail
        """
        self.state.log("maestro", "Feedback", "Running performance attribution + learning loop...", "📈")

        user_ids = _get_active_user_ids()
        targets = user_ids if user_ids else [None]  # None = unscoped fallback

        for uid in targets:
            try:
                self._current_user_id = uid
                user_label = f" [user={uid}]" if uid else ""
                self._run_feedback_for_context(user_label)
            except Exception as e:
                self.state.errors += 1
                self.state.log("maestro", "Error", f"Feedback cycle failed{f' for user {uid}' if uid else ''}: {str(e)[:200]}", "❌")
                traceback.print_exc()
            finally:
                self._current_user_id = None

    def _run_feedback_for_context(self, user_label: str = ""):
        """Run feedback attribution + adaptation for the current context."""

        try:
            from app.services.agents.evolution_engine import FeedbackEngine, AdaptationEngine

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
            _db_set("last_feedback_data", json.dumps(feedback_data, default=str), user_id=self._current_user_id or "__system__")

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
        Multi-user: iterates over all active users, falls back to unscoped if none.

        1. Rank all active agents by survival_score
        2. Top 40%: thriving (DNA archived to gene pool)
        3. Middle 40%: surviving (standard mutations continue)
        4. Bottom 20%: struggling → retire if below threshold for 2+ weeks → spawn replacement
        5. New agents inherit from gene pool (80%) or random DNA (20%)
        6. Refresh agent cache so Maestro picks up newborns
        """
        self.state.log("maestro", "🧬 EVOLUTION", "Running weekly natural selection...", "🧬")

        user_ids = _get_active_user_ids()
        targets = user_ids if user_ids else [None]

        for uid in targets:
            try:
                self._current_user_id = uid
                user_label = f" [user={uid}]" if uid else ""
                self._run_evolution_for_context(user_label)
            except Exception as e:
                self.state.errors += 1
                self.state.log("maestro", "Error", f"Evolution cycle failed{f' for user {uid}' if uid else ''}: {str(e)[:200]}", "❌")
                traceback.print_exc()
            finally:
                self._current_user_id = None

    def _run_evolution_for_context(self, user_label: str = ""):
        """Run weekly natural selection for the current context."""

        try:
            from app.services.agents.evolution_engine import SelectionEngine

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
                from app.services.agents.generic_agent import refresh_agent_cache
                refresh_agent_cache()
                self.state._init_agent_states()

            # Store evolution data for frontend
            import json
            evolution_data = {
                "timestamp": datetime.utcnow().isoformat(),
                "result": result,
            }
            _db_set("last_evolution_data", json.dumps(evolution_data, default=str), user_id=self._current_user_id or "__system__")

            self.state.last_evolution_at = datetime.utcnow()

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Evolution cycle failed: {str(e)[:200]}", "❌")
            import traceback
            traceback.print_exc()

    # ──────────────────────────────────────────────────────────
    # CYCLE: LEARNING ANALYSIS — Own-brand pattern extraction
    # ──────────────────────────────────────────────────────────

    def _learning_analysis_cycle(self):
        """Staggered own-brand analysis for each agent, per user."""
        try:
            from app.services.agent_learning_engine import AgentLearningEngine
            from app.db_connection import SessionLocal

            user_ids = _get_active_user_ids()
            if not user_ids:
                return

            db = SessionLocal()
            try:
                total_agents = 0
                for uid in user_ids:
                    if is_paused(user_id=uid):
                        continue

                    engine = AgentLearningEngine(db)
                    agents = db.query(AIAgent).filter(AIAgent.active == True, AIAgent.user_id == uid).all()
                    for agent in agents:
                        try:
                            engine.run_own_brand_analysis(agent.agent_id)
                            total_agents += 1
                        except Exception as e:
                            self.state.log("maestro", "Learning analysis failed", f"{agent.agent_id}: {str(e)[:150]}", "❌", "detail")

                self.state.log("maestro", "Learning analysis", f"Cycle complete — {total_agents} agents analyzed", "🧠")
            finally:
                db.close()

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Learning analysis cycle error: {str(e)[:200]}", "❌")

    # ──────────────────────────────────────────────────────────
    # CYCLE: PATTERN CONSOLIDATION — Decay and pruning
    # ──────────────────────────────────────────────────────────

    def _pattern_consolidation_cycle(self):
        """Apply pattern decay and prune stale patterns, per user."""
        try:
            from app.services.agent_learning_engine import AgentLearningEngine
            from app.db_connection import SessionLocal

            user_ids = _get_active_user_ids()
            if not user_ids:
                return

            db = SessionLocal()
            try:
                for uid in user_ids:
                    if is_paused(user_id=uid):
                        continue
                    engine = AgentLearningEngine(db)
                    engine.consolidate_patterns()
            finally:
                db.close()

            self.state.log("maestro", "Pattern consolidation", "Complete", "🔄")

        except Exception as e:
            self.state.errors += 1
            self.state.log("maestro", "Error", f"Pattern consolidation error: {str(e)[:200]}", "❌")

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
            from app.services.agents.diagnostics_engine import DiagnosticsEngine

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
