"""Maestro self-healing cycle — timeout detection, failure diagnosis, auto-retry."""

import re
import traceback
import threading
from datetime import datetime, timedelta
from typing import Dict, List

from app.services.maestro.state import JOB_TIMEOUT_MINUTES, MAX_AUTO_RETRIES, JOB_STAGGER_DELAY


class HealingMixin:

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
            from app.services.agents.generic_agent import _ensure_agents_for_all_brands
            user_id = getattr(self, '_current_user_id', None)
            spawned = _ensure_agents_for_all_brands(user_id=user_id)
            if spawned:
                names = ", ".join(a.display_name for a in spawned)
                self.state.log(
                    "maestro", "🧬 Population Guard",
                    f"Auto-spawned {len(spawned)} new agents: {names}",
                    "🧬"
                )
                # Refresh cache so daily burst picks them up
                from app.services.agents.generic_agent import refresh_agent_cache
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
