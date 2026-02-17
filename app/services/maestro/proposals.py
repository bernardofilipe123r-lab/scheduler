"""Maestro proposal processing — examine, accept/reject, create jobs, regenerate."""

import threading
import traceback
from datetime import datetime
from typing import Dict, List

from app.services.maestro.state import _job_semaphore, JOB_STAGGER_DELAY
from app.services.maestro.scheduler_logic import auto_schedule_job


class ProposalsMixin:

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
        from app.models import AgentProposal
        from app.services.content.job_manager import JobManager
        from app.services.maestro.examiner import examine_proposal

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
        from app.models import AgentProposal
        from app.services.content.job_manager import JobManager

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
            proposal = db.query(AgentProposal).filter(
                AgentProposal.proposal_id == proposal_id
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

                agent_name = proposal.agent_name or "unknown"
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
                agent_name = proposal.agent_name or "unknown"
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
        from app.models import AgentProposal
        from app.services.content.job_manager import JobManager

        is_post = (content_type == "post")

        if is_post:
            variant = "post"
            platforms = ["instagram", "facebook"]
        else:
            variant = proposal_variant or "dark"
            platforms = ["instagram", "facebook", "youtube"]

        if not brand:
            self.state.log("maestro", "Warning", f"Proposal {proposal_id} has no brand — skipping", "⚠️")
            return

        # Create ONE job for this brand
        with get_db_session() as jdb:
            # Get the actual user_id — from maestro state or from the proposal itself
            actual_user_id = getattr(self, '_current_user_id', None)
            if not actual_user_id:
                prop = jdb.query(AgentProposal).filter(
                    AgentProposal.proposal_id == proposal_id
                ).first()
                if prop:
                    actual_user_id = prop.user_id

            manager = JobManager(jdb)
            job_kwargs = dict(
                user_id=actual_user_id or proposal_id,
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
            p = db2.query(AgentProposal).filter(
                AgentProposal.proposal_id == proposal_id
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
        self.state.job_started()

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
            from app.services.agents.generic_agent import get_all_active_agents

            # Find the agent that created the original proposal
            user_id = getattr(self, '_current_user_id', None)
            agents = get_all_active_agents(user_id=user_id)
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
            from app.services.content.job_processor import JobProcessor

            with get_db_session() as pdb:
                p = JobProcessor(pdb)
                p.process_job(job_id)

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
            self.state.job_finished()
