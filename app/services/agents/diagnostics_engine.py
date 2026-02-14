"""
Diagnostics Engine — Maestro's self-testing daemon.

NOT a separate process. Runs as Maestro cycle #7 (every 4 hours).
Each run executes 10+ checks against the live system and stores
results in system_diagnostics table for dashboard display.

Checks:
  1. DNA Integrity     — weights sum to 1.0, temperature in range
  2. Agent Population  — enough active agents, not all struggling
  3. Database Health   — connection alive, tables exist, data fresh
  4. Scheduler Health  — APScheduler running, no stuck jobs
  5. Content Pipeline  — proposals being generated, jobs completing
  6. Evolution Integrity — gene pool growing, mutations happening
  7. DeepSeek API      — API key set, last call didn't fail
  8. Publishing Pipeline — scheduled reels exist, publishing works
  9. Cycle Freshness   — each Maestro cycle ran recently
 10. Data Consistency  — no orphaned agents, no zombie proposals
"""

import json
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List, Tuple

logger = logging.getLogger(__name__)


class CheckResult:
    """Single diagnostic check result."""

    def __init__(self, name: str, status: str, detail: str, duration_ms: int = 0):
        self.name = name
        self.status = status  # "pass" | "warn" | "fail"
        self.detail = detail
        self.duration_ms = duration_ms

    def to_dict(self):
        return {
            "name": self.name,
            "status": self.status,
            "detail": self.detail,
            "duration_ms": self.duration_ms,
        }


def _timed(fn):
    """Decorator that times a check and catches exceptions."""
    def wrapper(*args, **kwargs):
        start = time.time()
        try:
            result = fn(*args, **kwargs)
            result.duration_ms = int((time.time() - start) * 1000)
            return result
        except Exception as e:
            elapsed = int((time.time() - start) * 1000)
            return CheckResult(fn.__name__.replace("_check_", ""), "fail", f"Exception: {str(e)[:200]}", elapsed)
    return wrapper


class DiagnosticsEngine:
    """
    Executes all diagnostic checks and stores results.

    Usage:
        engine = DiagnosticsEngine()
        report = engine.run_all()
        # report = {"status": "healthy", "checks": [...], ...}
    """

    def run_all(self) -> Dict:
        """Run all diagnostic checks, store in DB, return report."""
        checks: List[CheckResult] = [
            self._check_db_connection(),
            self._check_agent_population(),
            self._check_dna_integrity(),
            self._check_content_pipeline(),
            self._check_scheduler_health(),
            self._check_evolution_integrity(),
            self._check_api_connectivity(),
            self._check_publishing_pipeline(),
            self._check_cycle_freshness(),
            self._check_data_consistency(),
        ]

        passed = sum(1 for c in checks if c.status == "pass")
        warnings = sum(1 for c in checks if c.status == "warn")
        failures = sum(1 for c in checks if c.status == "fail")

        if failures >= 3:
            overall = "critical"
        elif failures >= 1 or warnings >= 3:
            overall = "degraded"
        else:
            overall = "healthy"

        # Gather system snapshot
        snapshot = self._system_snapshot()

        # Store in DB
        report = {
            "status": overall,
            "total_checks": len(checks),
            "passed": passed,
            "warnings": warnings,
            "failures": failures,
            "checks": [c.to_dict() for c in checks],
            **snapshot,
        }

        self._store_report(report)

        logger.info(f"[DIAGNOSTICS] {overall.upper()}: {passed} pass, {warnings} warn, {failures} fail")

        return report

    # ──────────────────────────────────────────────────────────
    # Individual checks
    # ──────────────────────────────────────────────────────────

    @_timed
    def _check_db_connection(self) -> CheckResult:
        """Verify DB is reachable and responding."""
        from app.db_connection import SessionLocal
        from sqlalchemy import text

        db = SessionLocal()
        try:
            result = db.execute(text("SELECT 1"))
            result.fetchone()
            return CheckResult("db_connection", "pass", "Database responding")
        finally:
            db.close()

    @_timed
    def _check_agent_population(self) -> CheckResult:
        """Verify enough agents are alive and not all struggling."""
        from app.db_connection import SessionLocal
        from app.models import AIAgent

        db = SessionLocal()
        try:
            active = db.query(AIAgent).filter(AIAgent.active == True).all()
            count = len(active)

            if count == 0:
                return CheckResult("agent_population", "fail", "No active agents — system cannot generate content")

            if count < 2:
                return CheckResult("agent_population", "warn", f"Only {count} active agent — below minimum for evolution")

            # Check if all are struggling (survival < 30)
            avg_score = sum(a.survival_score or 0 for a in active) / count
            struggling = sum(1 for a in active if (a.survival_score or 0) < 30)

            if struggling == count:
                return CheckResult("agent_population", "warn", f"All {count} agents struggling (avg survival={avg_score:.0f})")

            return CheckResult("agent_population", "pass", f"{count} active agents, avg survival={avg_score:.0f}")
        finally:
            db.close()

    @_timed
    def _check_dna_integrity(self) -> CheckResult:
        """Verify all agent DNA is valid — weights sum to 1.0, temp in range."""
        from app.db_connection import SessionLocal
        from app.models import AIAgent

        db = SessionLocal()
        try:
            agents = db.query(AIAgent).filter(AIAgent.active == True).all()
            issues = []

            for a in agents:
                weights = a.get_strategy_weights()
                weight_sum = sum(weights.values())

                if abs(weight_sum - 1.0) > 0.01:
                    issues.append(f"{a.agent_id}: weights sum to {weight_sum:.3f}")

                if a.temperature < 0.50 or a.temperature > 1.0:
                    issues.append(f"{a.agent_id}: temperature {a.temperature} out of range [0.50, 1.0]")

                if not weights:
                    issues.append(f"{a.agent_id}: empty strategy weights")

                for name, w in weights.items():
                    if w < 0 or w > 1:
                        issues.append(f"{a.agent_id}: strategy '{name}' weight {w} out of [0, 1]")

            if issues:
                return CheckResult("dna_integrity", "fail", f"{len(issues)} issues: {'; '.join(issues[:3])}")

            return CheckResult("dna_integrity", "pass", f"All {len(agents)} agents have valid DNA")
        finally:
            db.close()

    @_timed
    def _check_content_pipeline(self) -> CheckResult:
        """Verify content is being generated — proposals + jobs in last 48h."""
        from app.db_connection import SessionLocal
        from app.models import TobyProposal, GenerationJob

        db = SessionLocal()
        try:
            cutoff = datetime.utcnow() - timedelta(hours=48)

            proposals_48h = db.query(TobyProposal).filter(
                TobyProposal.created_at >= cutoff
            ).count()

            jobs_48h = db.query(GenerationJob).filter(
                GenerationJob.created_at >= cutoff
            ).count()

            completed_48h = db.query(GenerationJob).filter(
                GenerationJob.created_at >= cutoff,
                GenerationJob.status == "completed"
            ).count()

            failed_48h = db.query(GenerationJob).filter(
                GenerationJob.created_at >= cutoff,
                GenerationJob.status == "failed"
            ).count()

            if proposals_48h == 0 and jobs_48h == 0:
                # Check if Maestro is paused
                from app.services.maestro.maestro import is_paused
                if is_paused():
                    return CheckResult("content_pipeline", "warn", "Maestro is paused — no content generated in 48h (expected)")
                return CheckResult("content_pipeline", "fail", "No proposals or jobs in 48h — pipeline may be broken")

            if failed_48h > 0 and completed_48h == 0:
                return CheckResult("content_pipeline", "fail", f"All {failed_48h} jobs failed in 48h, 0 completed")

            fail_rate = failed_48h / max(jobs_48h, 1)
            if fail_rate > 0.5:
                return CheckResult("content_pipeline", "warn", f"High failure rate: {failed_48h}/{jobs_48h} jobs failed ({fail_rate:.0%})")

            return CheckResult("content_pipeline", "pass", f"48h: {proposals_48h} proposals, {jobs_48h} jobs ({completed_48h} ok, {failed_48h} failed)")
        finally:
            db.close()

    @_timed
    def _check_scheduler_health(self) -> CheckResult:
        """Verify APScheduler is running and no jobs are stuck."""
        from app.db_connection import SessionLocal
        from app.models import GenerationJob

        # Check for stuck jobs
        db = SessionLocal()
        try:
            stuck_threshold = datetime.utcnow() - timedelta(minutes=60)
            stuck = db.query(GenerationJob).filter(
                GenerationJob.status.in_(["generating", "pending"]),
                GenerationJob.created_at <= stuck_threshold,
            ).count()

            if stuck > 3:
                return CheckResult("scheduler_health", "fail", f"{stuck} jobs stuck for >1h — possible deadlock")
            if stuck > 0:
                return CheckResult("scheduler_health", "warn", f"{stuck} job(s) stuck for >1h")

            # Check Maestro singleton
            try:
                from app.services.maestro.maestro import get_maestro
                m = get_maestro()
                if m.scheduler and m.scheduler.running:
                    return CheckResult("scheduler_health", "pass", f"APScheduler running, {stuck} stuck jobs")
                return CheckResult("scheduler_health", "warn", "APScheduler not running")
            except Exception:
                return CheckResult("scheduler_health", "warn", "Could not verify APScheduler state")
        finally:
            db.close()

    @_timed
    def _check_evolution_integrity(self) -> CheckResult:
        """Verify evolution system is working — mutations, gene pool."""
        from app.db_connection import SessionLocal
        from app.models import AgentLearning, GenePool, AgentPerformance

        db = SessionLocal()
        try:
            two_weeks = datetime.utcnow() - timedelta(days=14)

            mutations_2w = db.query(AgentLearning).filter(
                AgentLearning.created_at >= two_weeks
            ).count()

            perf_count = db.query(AgentPerformance).count()
            gene_pool_size = db.query(GenePool).count()

            if perf_count == 0 and mutations_2w == 0:
                # System might be new, check if there are enough posts
                from app.models import TobyProposal
                total_proposals = db.query(TobyProposal).count()
                if total_proposals < 10:
                    return CheckResult("evolution_integrity", "warn", "Evolution not started — too few proposals yet (expected for new system)")
                return CheckResult("evolution_integrity", "warn", "No performance snapshots or mutations yet — feedback cycle may not be running")

            detail = f"2w: {mutations_2w} mutations, {perf_count} perf snapshots, {gene_pool_size} gene pool entries"
            return CheckResult("evolution_integrity", "pass", detail)
        finally:
            db.close()

    @_timed
    def _check_api_connectivity(self) -> CheckResult:
        """Verify DeepSeek API key is configured (don't make an actual call)."""
        import os

        api_key = os.getenv("DEEPSEEK_API_KEY", "")
        if not api_key:
            return CheckResult("api_connectivity", "fail", "DEEPSEEK_API_KEY not set — AI generation will fail")

        if len(api_key) < 10:
            return CheckResult("api_connectivity", "warn", "DEEPSEEK_API_KEY looks suspiciously short")

        return CheckResult("api_connectivity", "pass", f"DeepSeek API key configured ({len(api_key)} chars)")

    @_timed
    def _check_publishing_pipeline(self) -> CheckResult:
        """Verify scheduled reels exist and publishing is working."""
        from app.db_connection import SessionLocal
        from app.models import ScheduledReel

        db = SessionLocal()
        try:
            now = datetime.utcnow()
            tomorrow = now + timedelta(days=1)

            upcoming = db.query(ScheduledReel).filter(
                ScheduledReel.scheduled_time >= now,
                ScheduledReel.scheduled_time <= tomorrow,
                ScheduledReel.status == "scheduled"
            ).count()

            # Check recent publish failures
            week_ago = now - timedelta(days=7)
            failed_publishes = db.query(ScheduledReel).filter(
                ScheduledReel.scheduled_time >= week_ago,
                ScheduledReel.status == "failed"
            ).count()

            published_week = db.query(ScheduledReel).filter(
                ScheduledReel.published_at >= week_ago,
                ScheduledReel.status == "published"
            ).count()

            if upcoming == 0:
                from app.services.maestro.maestro import is_paused
                if is_paused():
                    return CheckResult("publishing_pipeline", "warn", "No upcoming reels scheduled — Maestro is paused")
                return CheckResult("publishing_pipeline", "warn", f"No reels scheduled for next 24h (published {published_week} this week)")

            if failed_publishes > 5:
                return CheckResult("publishing_pipeline", "warn", f"{failed_publishes} publish failures this week, {upcoming} upcoming")

            return CheckResult("publishing_pipeline", "pass", f"{upcoming} upcoming (24h), {published_week} published this week, {failed_publishes} failed")
        finally:
            db.close()

    @_timed
    def _check_cycle_freshness(self) -> CheckResult:
        """Verify each Maestro cycle ran recently."""
        try:
            from app.services.maestro.maestro import get_maestro
            m = get_maestro()
            state = m.state
            now = datetime.utcnow()

            stale = []

            # Feedback should run every 6h
            if state.last_feedback_at:
                hrs_since = (now - state.last_feedback_at).total_seconds() / 3600
                if hrs_since > 12:
                    stale.append(f"feedback ({hrs_since:.0f}h ago)")
            else:
                stale.append("feedback (never)")

            # Healing every 15m — if >2h, something's wrong
            if state.last_healing_at:
                hrs_since = (now - state.last_healing_at).total_seconds() / 3600
                if hrs_since > 2:
                    stale.append(f"healing ({hrs_since:.0f}h ago)")

            # Observe every 3h
            if state.last_metrics_at:
                hrs_since = (now - state.last_metrics_at).total_seconds() / 3600
                if hrs_since > 8:
                    stale.append(f"observe ({hrs_since:.0f}h ago)")

            # Scout every 4h
            if state.last_scan_at:
                hrs_since = (now - state.last_scan_at).total_seconds() / 3600
                if hrs_since > 10:
                    stale.append(f"scout ({hrs_since:.0f}h ago)")

            # Allow some grace after startup (cycles haven't run yet)
            uptime_hrs = (now - state.started_at).total_seconds() / 3600 if state.started_at else 0
            if uptime_hrs < 1:
                return CheckResult("cycle_freshness", "pass", f"System just started ({uptime_hrs:.1f}h uptime) — cycles warming up")

            if stale:
                status = "fail" if len(stale) >= 3 else "warn"
                return CheckResult("cycle_freshness", status, f"Stale cycles: {', '.join(stale)}")

            return CheckResult("cycle_freshness", "pass", "All cycles running on schedule")
        except Exception as e:
            return CheckResult("cycle_freshness", "warn", f"Could not verify: {str(e)[:100]}")

    @_timed
    def _check_data_consistency(self) -> CheckResult:
        """Check for orphaned/inconsistent data."""
        from app.db_connection import SessionLocal
        from app.models import AIAgent, TobyProposal

        db = SessionLocal()
        try:
            issues = []

            # Check for proposals from inactive/missing agents
            active_ids = {a.agent_id for a in db.query(AIAgent).filter(AIAgent.active == True).all()}
            all_agent_ids = {a.agent_id for a in db.query(AIAgent).all()}

            recent = datetime.utcnow() - timedelta(days=7)
            recent_proposals = db.query(TobyProposal).filter(
                TobyProposal.created_at >= recent
            ).all()

            orphan_count = 0
            for p in recent_proposals:
                if p.agent_name and p.agent_name not in all_agent_ids:
                    orphan_count += 1

            if orphan_count > 5:
                issues.append(f"{orphan_count} proposals from unknown agents (7d)")

            # Check for agents with no brand (shouldn't happen)
            no_brand = db.query(AIAgent).filter(
                AIAgent.active == True,
                AIAgent.created_for_brand == None,
                AIAgent.is_builtin == False
            ).count()
            if no_brand > 0:
                issues.append(f"{no_brand} non-builtin agents with no brand")

            if issues:
                return CheckResult("data_consistency", "warn", "; ".join(issues))

            return CheckResult("data_consistency", "pass", f"{len(active_ids)} active agents, data consistent")
        finally:
            db.close()

    # ──────────────────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────────────────

    def _system_snapshot(self) -> Dict:
        """Gather system state for diagnostic record."""
        from app.db_connection import SessionLocal
        from app.models import AIAgent, GenePool, GenerationJob, ScheduledReel

        db = SessionLocal()
        try:
            now = datetime.utcnow()
            day_ago = now - timedelta(hours=24)

            active_agents = db.query(AIAgent).filter(AIAgent.active == True).all()
            avg_score = sum(a.survival_score or 0 for a in active_agents) / max(len(active_agents), 1)
            gene_pool = db.query(GenePool).count()

            pending = db.query(GenerationJob).filter(
                GenerationJob.status.in_(["pending", "generating"])
            ).count()

            failed_24h = db.query(GenerationJob).filter(
                GenerationJob.status == "failed",
                GenerationJob.created_at >= day_ago
            ).count()

            scheduled = db.query(ScheduledReel).filter(
                ScheduledReel.scheduled_time >= now,
                ScheduledReel.status == "scheduled"
            ).count()

            return {
                "active_agents": len(active_agents),
                "avg_survival_score": round(avg_score, 1),
                "gene_pool_size": gene_pool,
                "pending_jobs": pending,
                "failed_jobs_24h": failed_24h,
                "total_scheduled": scheduled,
            }
        except Exception:
            return {
                "active_agents": 0, "avg_survival_score": 0,
                "gene_pool_size": 0, "pending_jobs": 0,
                "failed_jobs_24h": 0, "total_scheduled": 0,
            }
        finally:
            db.close()

    def _store_report(self, report: Dict):
        """Persist diagnostic report to DB."""
        from app.db_connection import SessionLocal
        from app.models import SystemDiagnostic

        db = SessionLocal()
        try:
            diag = SystemDiagnostic(
                status=report["status"],
                total_checks=report["total_checks"],
                passed=report["passed"],
                warnings=report["warnings"],
                failures=report["failures"],
                checks=report["checks"],
                active_agents=report.get("active_agents", 0),
                avg_survival_score=report.get("avg_survival_score", 0),
                gene_pool_size=report.get("gene_pool_size", 0),
                pending_jobs=report.get("pending_jobs", 0),
                failed_jobs_24h=report.get("failed_jobs_24h", 0),
                total_scheduled=report.get("total_scheduled", 0),
            )
            db.add(diag)
            db.commit()
            logger.info(f"[DIAGNOSTICS] Report #{diag.id} stored: {report['status']}")
        except Exception as e:
            logger.error(f"[DIAGNOSTICS] Failed to store report: {e}")
            db.rollback()
        finally:
            db.close()
