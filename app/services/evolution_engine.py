"""
Evolution Engine — The brain that makes AI agents learn, adapt, and compete.

Phase 2+3: Per-agent performance attribution + learning loop.

Components:
  - FeedbackEngine: Attributes published content performance back to agents,
    calculates survival scores, identifies best/worst strategies.
  - AdaptationEngine: Mutates agent DNA (strategy weights, temperature) based
    on performance data. Conservative mutations: ±5% weight, ±0.03 temperature.
  - Survival score formula:
      views(40%) + engagement_rate(30%) + consistency(20%) + examiner_avg(10%)

Called from Maestro's _feedback_cycle() every 6 hours.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from statistics import mean, stdev

logger = logging.getLogger(__name__)


# ── Constants ──────────────────────────────────────────────────
WEIGHT_SHIFT_CAP = 0.05          # Max ±5% weight change per cycle
TEMPERATURE_SHIFT_CAP = 0.03     # Max ±0.03 temperature change per cycle
MIN_TEMPERATURE = 0.60
MAX_TEMPERATURE = 0.98
MIN_WEIGHT = 0.05                # No strategy can drop below 5%
MUTATION_CONFIDENCE_THRESHOLD = 0.70  # Only mutate if confidence >= 70%
MIN_POSTS_FOR_MUTATION = 3       # Need at least 3 published posts to learn from
STRATEGY_DOMINANCE_RATIO = 1.5   # Best must be 50%+ better than worst to shift


class FeedbackEngine:
    """
    Attributes published content performance back to individual agents.

    Queries the 48-72h window for published reels/posts, traces them back
    to their originating agent and strategy, then calculates:
    - Per-agent total/avg views, likes, comments
    - Per-strategy performance breakdown
    - Survival score
    """

    def run(self, window_hours: Tuple[int, int] = (72, 48)) -> Dict:
        """
        Run full feedback attribution for all agents.

        Returns dict of {agent_id: AgentPerformance data}.
        """
        from app.db_connection import SessionLocal
        from app.models import (
            AIAgent, TobyProposal, ScheduledReel, GenerationJob,
            AgentPerformance,
        )

        db = SessionLocal()
        try:
            now = datetime.utcnow()
            window_start = now - timedelta(hours=window_hours[0])
            window_end = now - timedelta(hours=window_hours[1])

            # 1. Find all published items in window
            published = db.query(ScheduledReel).filter(
                ScheduledReel.status == "published",
                ScheduledReel.published_at >= window_start,
                ScheduledReel.published_at <= window_end,
            ).all()

            if not published:
                logger.info("📊 Feedback: No published items in window")
                return {}

            # 2. Trace each published item back to its agent + strategy
            agent_data: Dict[str, Dict] = {}  # agent_id → {views, likes, ...}

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

                agent_id = proposal.agent_name or "toby"
                strategy = proposal.strategy or "explore"
                examiner_score = proposal.examiner_score

                # Extract metrics from extra_data
                extra = sched.extra_data or {}
                views = extra.get("views", 0) or 0
                likes = extra.get("likes", 0) or 0
                comments = extra.get("comments", 0) or 0
                saves = extra.get("saves", 0) or 0
                reach = extra.get("reach", 0) or 0

                # Initialize agent bucket
                if agent_id not in agent_data:
                    agent_data[agent_id] = {
                        "views": [],
                        "likes": [],
                        "comments": [],
                        "saves": [],
                        "reach": [],
                        "strategies": {},
                        "examiner_scores": [],
                    }

                ad = agent_data[agent_id]
                ad["views"].append(views)
                ad["likes"].append(likes)
                ad["comments"].append(comments)
                ad["saves"].append(saves)
                ad["reach"].append(reach)
                if examiner_score is not None:
                    ad["examiner_scores"].append(examiner_score)

                # Per-strategy tracking
                if strategy not in ad["strategies"]:
                    ad["strategies"][strategy] = {"views": [], "count": 0}
                ad["strategies"][strategy]["views"].append(views)
                ad["strategies"][strategy]["count"] += 1

            # 3. Calculate metrics and save AgentPerformance snapshots
            results = {}
            for agent_id, data in agent_data.items():
                total_views = sum(data["views"])
                avg_views = mean(data["views"]) if data["views"] else 0
                total_likes = sum(data["likes"])
                total_comments = sum(data["comments"])
                total_saves = sum(data["saves"])
                total_reach = sum(data["reach"])
                published_count = len(data["views"])

                # Engagement rate = (likes + comments + saves) / reach
                engagement_rate = 0.0
                if total_reach > 0:
                    engagement_rate = (total_likes + total_comments + total_saves) / total_reach

                # Strategy breakdown
                strategy_breakdown = {}
                best_strategy = None
                worst_strategy = None
                best_avg = -1
                worst_avg = float("inf")

                for strat, sdata in data["strategies"].items():
                    s_avg = mean(sdata["views"]) if sdata["views"] else 0
                    strategy_breakdown[strat] = {
                        "count": sdata["count"],
                        "avg_views": round(s_avg),
                        "total_views": sum(sdata["views"]),
                    }
                    if s_avg > best_avg:
                        best_avg = s_avg
                        best_strategy = strat
                    if s_avg < worst_avg:
                        worst_avg = s_avg
                        worst_strategy = strat

                # Average examiner score
                avg_examiner = mean(data["examiner_scores"]) if data["examiner_scores"] else None

                # Consistency score: 1 - (stdev/mean) clamped to 0-100
                consistency = 0.0
                if len(data["views"]) >= 2 and avg_views > 0:
                    cv = stdev(data["views"]) / avg_views
                    consistency = max(0, min(100, (1 - cv) * 100))
                elif len(data["views"]) == 1:
                    consistency = 50.0  # Neutral for single post

                # Survival score: views(40%) + engagement(30%) + consistency(20%) + examiner(10%)
                # Normalize views to 0-100 scale (cap at 100K as "perfect")
                view_score = min(100, (avg_views / 100_000) * 100) * 0.40
                engagement_score = min(100, engagement_rate * 100 * 10) * 0.30  # 10% ER = 100 score
                consistency_score = consistency * 0.20
                examiner_component = ((avg_examiner or 5.0) / 10.0 * 100) * 0.10
                survival_score = round(view_score + engagement_score + consistency_score + examiner_component, 1)

                # Save to DB
                perf = AgentPerformance(
                    agent_id=agent_id,
                    period="feedback",
                    published_count=published_count,
                    total_views=total_views,
                    avg_views=round(avg_views),
                    total_likes=total_likes,
                    total_comments=total_comments,
                    avg_engagement_rate=round(engagement_rate, 4),
                    strategy_breakdown=strategy_breakdown,
                    best_strategy=best_strategy,
                    worst_strategy=worst_strategy,
                    avg_examiner_score=round(avg_examiner, 2) if avg_examiner else None,
                    survival_score=survival_score,
                )
                db.add(perf)

                # Update lifetime stats on AIAgent
                agent = db.query(AIAgent).filter_by(agent_id=agent_id).first()
                if agent:
                    agent.lifetime_views = (agent.lifetime_views or 0) + total_views
                    agent.survival_score = survival_score

                results[agent_id] = {
                    "published_count": published_count,
                    "total_views": total_views,
                    "avg_views": round(avg_views),
                    "engagement_rate": round(engagement_rate, 4),
                    "best_strategy": best_strategy,
                    "worst_strategy": worst_strategy,
                    "survival_score": survival_score,
                    "strategy_breakdown": strategy_breakdown,
                }

                logger.info(
                    f"📊 {agent_id}: {published_count} posts, {total_views} views, "
                    f"survival={survival_score}, best={best_strategy}, worst={worst_strategy}"
                )

            # Also count proposals generated per agent (regardless of publication)
            for agent_id in results:
                proposal_count = db.query(TobyProposal).filter(
                    TobyProposal.agent_name == agent_id,
                    TobyProposal.created_at >= window_start,
                ).count()
                accepted_count = db.query(TobyProposal).filter(
                    TobyProposal.agent_name == agent_id,
                    TobyProposal.status == "accepted",
                    TobyProposal.created_at >= window_start,
                ).count()
                results[agent_id]["total_proposals"] = proposal_count
                results[agent_id]["accepted_proposals"] = accepted_count

                # Update agent lifetime counters
                agent = db.query(AIAgent).filter_by(agent_id=agent_id).first()
                if agent:
                    agent.lifetime_proposals = (agent.lifetime_proposals or 0) + proposal_count
                    agent.lifetime_accepted = (agent.lifetime_accepted or 0) + accepted_count

            db.commit()
            return results

        except Exception as e:
            db.rollback()
            logger.error(f"❌ FeedbackEngine error: {e}")
            return {}
        finally:
            db.close()


class AdaptationEngine:
    """
    Mutates agent DNA based on performance data.

    Rules:
    - Only mutate if >= MIN_POSTS_FOR_MUTATION published posts with data
    - Only shift weights if confidence >= MUTATION_CONFIDENCE_THRESHOLD
    - Best strategy must be >= 50% better than worst to trigger weight shift
    - Max ±5% weight shift per cycle (WEIGHT_SHIFT_CAP)
    - Max ±0.03 temperature shift per cycle
    - No strategy can drop below 5% weight (MIN_WEIGHT)
    - All weights must sum to 1.0 after mutation
    """

    def adapt(self, feedback_results: Dict) -> Dict[str, List[str]]:
        """
        Apply mutations to all agents based on feedback results.

        Returns dict of {agent_id: [list of mutations applied]}.
        """
        from app.db_connection import SessionLocal
        from app.models import AIAgent, AgentLearning

        if not feedback_results:
            return {}

        db = SessionLocal()
        try:
            all_mutations: Dict[str, List[str]] = {}

            for agent_id, perf in feedback_results.items():
                mutations = []
                agent = db.query(AIAgent).filter_by(agent_id=agent_id, active=True).first()
                if not agent:
                    continue

                published_count = perf.get("published_count", 0)
                if published_count < MIN_POSTS_FOR_MUTATION:
                    logger.info(f"🧬 {agent_id}: Only {published_count} posts, skipping mutation (need {MIN_POSTS_FOR_MUTATION})")
                    continue

                survival_score = perf.get("survival_score", 0)
                breakdown = perf.get("strategy_breakdown", {})
                best_strategy = perf.get("best_strategy")
                worst_strategy = perf.get("worst_strategy")

                # ── 1. Strategy weight mutation ──
                if best_strategy and worst_strategy and best_strategy != worst_strategy:
                    best_avg = breakdown.get(best_strategy, {}).get("avg_views", 0)
                    worst_avg = breakdown.get(worst_strategy, {}).get("avg_views", 0)

                    # Confidence: how much better is best vs worst
                    if worst_avg > 0:
                        ratio = best_avg / worst_avg
                        confidence = min(1.0, (ratio - 1.0) / 2.0)  # ratio 2.0 = confidence 0.5, ratio 3.0 = 1.0
                    else:
                        confidence = 0.9 if best_avg > 0 else 0.0

                    if confidence >= MUTATION_CONFIDENCE_THRESHOLD and ratio >= STRATEGY_DOMINANCE_RATIO:
                        weights = agent.get_strategy_weights()
                        old_weights = dict(weights)

                        # Shift weight from worst to best
                        shift = min(WEIGHT_SHIFT_CAP, weights.get(worst_strategy, 0) - MIN_WEIGHT)
                        shift = max(0, shift)

                        if shift > 0:
                            weights[worst_strategy] = round(weights.get(worst_strategy, 0) - shift, 3)
                            weights[best_strategy] = round(weights.get(best_strategy, 0) + shift, 3)

                            # Normalize to sum=1.0
                            total = sum(weights.values())
                            if total > 0:
                                weights = {k: round(v / total, 3) for k, v in weights.items()}

                            agent.strategy_weights = json.dumps(weights)
                            mutation_desc = (
                                f"Weight shift: {worst_strategy} (-{shift:.1%}) → {best_strategy} (+{shift:.1%}). "
                                f"Best avg {best_avg} views vs worst avg {worst_avg} views. "
                                f"Confidence: {confidence:.0%}"
                            )
                            mutations.append(mutation_desc)

                            # Log to AgentLearning
                            db.add(AgentLearning(
                                agent_id=agent_id,
                                mutation_type="weight_shift",
                                description=mutation_desc,
                                old_value=old_weights,
                                new_value=weights,
                                trigger="feedback",
                                confidence=round(confidence, 2),
                                survival_score_at=survival_score,
                            ))

                            logger.info(f"🧬 {agent_id}: {mutation_desc}")

                # ── 2. Temperature adaptation ──
                # High survival → lower temperature (exploit what works)
                # Low survival → higher temperature (explore more)
                if survival_score > 60:
                    # Doing well → slightly reduce creativity for consistency
                    new_temp = max(MIN_TEMPERATURE, agent.temperature - TEMPERATURE_SHIFT_CAP)
                    if new_temp != agent.temperature:
                        old_temp = agent.temperature
                        agent.temperature = round(new_temp, 2)
                        temp_desc = f"Temperature ↓ {old_temp} → {new_temp} (survival {survival_score} > 60, exploiting)"
                        mutations.append(temp_desc)
                        db.add(AgentLearning(
                            agent_id=agent_id,
                            mutation_type="temperature",
                            description=temp_desc,
                            old_value={"temperature": old_temp},
                            new_value={"temperature": new_temp},
                            trigger="feedback",
                            confidence=0.8,
                            survival_score_at=survival_score,
                        ))
                elif survival_score < 30:
                    # Struggling → increase creativity to find new patterns
                    new_temp = min(MAX_TEMPERATURE, agent.temperature + TEMPERATURE_SHIFT_CAP)
                    if new_temp != agent.temperature:
                        old_temp = agent.temperature
                        agent.temperature = round(new_temp, 2)
                        temp_desc = f"Temperature ↑ {old_temp} → {new_temp} (survival {survival_score} < 30, exploring)"
                        mutations.append(temp_desc)
                        db.add(AgentLearning(
                            agent_id=agent_id,
                            mutation_type="temperature",
                            description=temp_desc,
                            old_value={"temperature": old_temp},
                            new_value={"temperature": new_temp},
                            trigger="feedback",
                            confidence=0.8,
                            survival_score_at=survival_score,
                        ))

                # ── 3. Update agent evolution counters ──
                if mutations:
                    agent.mutation_count = (agent.mutation_count or 0) + len(mutations)
                    agent.generation = (agent.generation or 1) + 1
                    agent.last_mutation_at = datetime.utcnow()

                all_mutations[agent_id] = mutations

            db.commit()
            return all_mutations

        except Exception as e:
            db.rollback()
            logger.error(f"❌ AdaptationEngine error: {e}")
            return {}
        finally:
            db.close()


def get_agent_lessons(agent_id: str, limit: int = 5) -> str:
    """
    Get a compact summary of recent agent learnings for injection into prompts.

    Returns a human-readable string that can be added to the agent's
    system prompt / intelligence context.
    """
    from app.db_connection import SessionLocal
    from app.models import AgentLearning, AgentPerformance
    from sqlalchemy import desc

    db = SessionLocal()
    try:
        # Recent mutations
        mutations = (
            db.query(AgentLearning)
            .filter(AgentLearning.agent_id == agent_id)
            .order_by(desc(AgentLearning.created_at))
            .limit(limit)
            .all()
        )

        # Latest performance snapshot
        latest_perf = (
            db.query(AgentPerformance)
            .filter(AgentPerformance.agent_id == agent_id)
            .order_by(desc(AgentPerformance.created_at))
            .first()
        )

        if not mutations and not latest_perf:
            return ""

        lines = []
        if latest_perf:
            lines.append(f"PERFORMANCE: survival_score={latest_perf.survival_score}, "
                        f"avg_views={latest_perf.avg_views}, "
                        f"best_strategy={latest_perf.best_strategy}, "
                        f"worst_strategy={latest_perf.worst_strategy}")

        if mutations:
            lines.append("RECENT LEARNINGS:")
            for m in mutations:
                lines.append(f"  - [{m.mutation_type}] {m.description}")

        return "\n".join(lines)
    except Exception:
        return ""
    finally:
        db.close()


# ──────────────────────────────────────────────────────────────
# Phase 4: NATURAL SELECTION — Weekly survival of the fittest
# ──────────────────────────────────────────────────────────────

# Selection constants
DEATH_THRESHOLD = 30.0              # Survival score below which agent can die
CONSECUTIVE_LOW_WEEKS = 2           # Must be struggling for this many consecutive feedback cycles (2-week equivalent)
GENE_POOL_INHERIT_CHANCE = 0.80     # 80% chance to inherit from gene pool
MIN_ACTIVE_AGENTS = 2              # Never kill below this many active agents
MIN_CYCLES_BEFORE_ELIGIBLE = 4     # Agent must have at least 4 feedback cycles before eligible for death


class SelectionEngine:
    """
    Weekly Natural Selection — survival of the fittest.

    Runs every Sunday at 2 AM (via Maestro scheduler):
    1. Rank all active agents by survival_score
    2. Top 40%: "thriving" — celebrated, no changes
    3. Middle 40%: "surviving" — standard mutations continue via feedback cycle
    4. Bottom 20%: "struggling" — retired if survival_score < 30 for consecutive cycles
    5. Retired agents → DNA saved to gene_pool → new agent spawned
    6. New agents: 80% inherit from gene pool (crossover), 20% random DNA

    Safety rails:
    - Built-in agents (toby, lexi) can NEVER be killed
    - Must have at least MIN_ACTIVE_AGENTS alive at all times
    - New agents need MIN_CYCLES_BEFORE_ELIGIBLE feedback cycles before being death-eligible
    - Only non-builtin agents can die
    """

    def run_weekly_selection(self) -> Dict:
        """
        Execute weekly natural selection across all active agents.

        Returns summary dict with thriving/surviving/struggling lists,
        deaths, births, and gene pool entries.
        """
        from app.db_connection import SessionLocal
        from app.models import AIAgent, AgentPerformance, AgentLearning, GenePool

        db = SessionLocal()
        try:
            # 1. Load all active agents
            agents = db.query(AIAgent).filter(AIAgent.active == True).all()
            if not agents:
                logger.info("🧬 Selection: No active agents found")
                return {"error": "no_agents"}

            # 2. Rank by survival_score (descending)
            ranked = sorted(agents, key=lambda a: (a.survival_score or 0), reverse=True)
            total = len(ranked)

            # Calculate tier boundaries
            top_cutoff = max(1, int(total * 0.4))     # Top 40%
            mid_cutoff = max(top_cutoff + 1, int(total * 0.8))  # Middle 40%

            thriving = ranked[:top_cutoff]
            surviving = ranked[top_cutoff:mid_cutoff]
            struggling = ranked[mid_cutoff:]

            logger.info(f"🏆 Selection: {total} agents — {len(thriving)} thriving, "
                       f"{len(surviving)} surviving, {len(struggling)} struggling")

            # 3. Process each tier
            result = {
                "total_agents": total,
                "thriving": [],
                "surviving": [],
                "struggling": [],
                "deaths": [],
                "births": [],
                "gene_pool_entries": 0,
            }

            # ── Thriving: archive their DNA as "top_performer" (if not already) ──
            for agent in thriving:
                result["thriving"].append({
                    "agent_id": agent.agent_id,
                    "survival_score": agent.survival_score or 0,
                })
                # Archive top performers to gene pool (once per high score)
                existing_archive = db.query(GenePool).filter(
                    GenePool.source_agent_id == agent.agent_id,
                    GenePool.reason == "top_performer",
                ).first()
                if not existing_archive and (agent.survival_score or 0) > 50:
                    self._archive_dna(db, agent, reason="top_performer")
                    result["gene_pool_entries"] += 1

            # ── Surviving: log status, no special action ──
            for agent in surviving:
                result["surviving"].append({
                    "agent_id": agent.agent_id,
                    "survival_score": agent.survival_score or 0,
                })

            # ── Struggling: check death eligibility ──
            active_non_builtin = [a for a in agents if not a.is_builtin]
            active_count = len(agents)

            for agent in struggling:
                agent_info = {
                    "agent_id": agent.agent_id,
                    "survival_score": agent.survival_score or 0,
                    "eligible_for_death": False,
                    "died": False,
                }

                # Safety: never kill built-in agents
                if agent.is_builtin:
                    agent_info["protected"] = "builtin"
                    result["struggling"].append(agent_info)
                    continue

                # Safety: keep minimum active agents
                if active_count <= MIN_ACTIVE_AGENTS:
                    agent_info["protected"] = "min_agents"
                    result["struggling"].append(agent_info)
                    continue

                # Check death eligibility
                eligible, reason = self._check_death_eligibility(db, agent)
                agent_info["eligible_for_death"] = eligible
                agent_info["eligibility_reason"] = reason

                if eligible:
                    # DEATH: archive DNA → retire → spawn replacement
                    logger.info(f"💀 {agent.agent_id}: DEATH — {reason}")

                    # Archive DNA before killing
                    self._archive_dna(db, agent, reason="retirement")
                    result["gene_pool_entries"] += 1

                    # Retire the agent
                    old_score = agent.survival_score or 0
                    agent.active = False
                    agent_info["died"] = True
                    result["deaths"].append({
                        "agent_id": agent.agent_id,
                        "survival_score": old_score,
                        "generation": agent.generation or 1,
                        "reason": reason,
                    })

                    # Log death to AgentLearning
                    db.add(AgentLearning(
                        agent_id=agent.agent_id,
                        mutation_type="death",
                        description=f"Retired by natural selection. {reason}",
                        old_value={"survival_score": old_score, "generation": agent.generation or 1},
                        new_value={"active": False},
                        trigger="weekly_evolution",
                        confidence=1.0,
                        survival_score_at=old_score,
                    ))

                    active_count -= 1

                    # Spawn replacement
                    birth_info = self._spawn_replacement(db, agent)
                    if birth_info:
                        result["births"].append(birth_info)
                        active_count += 1

                result["struggling"].append(agent_info)

            db.commit()

            # Summary log
            logger.info(
                f"🧬 Weekly selection complete: "
                f"{len(result['deaths'])} deaths, {len(result['births'])} births, "
                f"{result['gene_pool_entries']} DNA archived"
            )

            return result

        except Exception as e:
            db.rollback()
            logger.error(f"❌ SelectionEngine error: {e}")
            import traceback
            traceback.print_exc()
            return {"error": str(e)}
        finally:
            db.close()

    def _check_death_eligibility(self, db, agent) -> tuple:
        """
        Check if an agent is eligible for death.

        Returns (eligible: bool, reason: str).

        Death criteria:
        - survival_score < DEATH_THRESHOLD
        - Last N performance snapshots ALL below threshold (sustained failure)
        - Has at least MIN_CYCLES_BEFORE_ELIGIBLE feedback cycles (give newborns a chance)
        """
        from app.models import AgentPerformance
        from sqlalchemy import desc

        # Count total feedback cycles for this agent
        total_cycles = db.query(AgentPerformance).filter(
            AgentPerformance.agent_id == agent.agent_id,
        ).count()

        if total_cycles < MIN_CYCLES_BEFORE_ELIGIBLE:
            return False, f"Too young: only {total_cycles}/{MIN_CYCLES_BEFORE_ELIGIBLE} feedback cycles"

        # Current score must be below threshold
        current_score = agent.survival_score or 0
        if current_score >= DEATH_THRESHOLD:
            return False, f"Score {current_score} >= threshold {DEATH_THRESHOLD}"

        # Check last CONSECUTIVE_LOW_WEEKS snapshots — all must be below threshold
        recent_perfs = (
            db.query(AgentPerformance)
            .filter(AgentPerformance.agent_id == agent.agent_id)
            .order_by(desc(AgentPerformance.created_at))
            .limit(CONSECUTIVE_LOW_WEEKS * 4)  # ~4 feedback cycles per week (every 6h) × 2 weeks = 8
            .all()
        )

        if len(recent_perfs) < CONSECUTIVE_LOW_WEEKS * 2:  # Need at least a week's worth
            return False, f"Not enough history: {len(recent_perfs)} snapshots"

        # All recent snapshots must be below threshold
        all_below = all(
            (p.survival_score or 0) < DEATH_THRESHOLD
            for p in recent_perfs
        )

        if not all_below:
            return False, f"Had survival > {DEATH_THRESHOLD} in recent history"

        return True, (
            f"Survival score {current_score} < {DEATH_THRESHOLD} "
            f"for {len(recent_perfs)} consecutive cycles"
        )

    def _archive_dna(self, db, agent, reason: str = "retirement"):
        """Save an agent's current DNA to the gene pool before retirement."""
        from app.models import GenePool

        entry = GenePool(
            source_agent_id=agent.agent_id,
            source_agent_name=agent.display_name,
            personality=agent.personality,
            temperature=agent.temperature,
            variant=agent.variant,
            strategy_names=agent.strategy_names,
            strategy_weights=agent.strategy_weights,
            risk_tolerance=agent.risk_tolerance,
            survival_score=agent.survival_score or 0,
            lifetime_views=agent.lifetime_views or 0,
            generation=agent.generation or 1,
            reason=reason,
        )
        db.add(entry)
        logger.info(f"🧬 Archived DNA: {agent.agent_id} (reason={reason}, score={agent.survival_score})")

    def _spawn_replacement(self, db, dead_agent) -> Optional[Dict]:
        """
        Spawn a new agent to replace a retired one.

        80% chance: inherit from gene pool (crossover of best DNA)
        20% chance: fully random DNA (genetic diversity)

        The new agent inherits the dead agent's brand linkage.
        """
        import json
        import random
        from app.models import AIAgent, AgentLearning, GenePool

        brand_id = dead_agent.created_for_brand or "unknown"

        # Decide: inherit or random?
        use_gene_pool = random.random() < GENE_POOL_INHERIT_CHANCE

        if use_gene_pool:
            # Pick from gene pool — prefer top performers, avoid the dead agent's own DNA
            pool_entries = (
                db.query(GenePool)
                .filter(GenePool.source_agent_id != dead_agent.agent_id)
                .order_by(GenePool.survival_score.desc())
                .limit(5)
                .all()
            )

            if pool_entries:
                # Weighted random from top 5 (higher score = higher chance)
                weights = [(p.survival_score or 1) for p in pool_entries]
                parent_dna = random.choices(pool_entries, weights=weights, k=1)[0]

                # Crossover: inherit parent's DNA with small mutations
                temperature = parent_dna.temperature + round(random.uniform(-0.05, 0.05), 2)
                temperature = max(MIN_TEMPERATURE, min(MAX_TEMPERATURE, temperature))
                variant = parent_dna.variant
                risk = parent_dna.risk_tolerance

                try:
                    strategies = json.loads(parent_dna.strategy_names)
                except Exception:
                    strategies = ["explore", "iterate", "double_down", "trending"]
                try:
                    weights_dict = json.loads(parent_dna.strategy_weights)
                except Exception:
                    weights_dict = {"explore": 0.25, "iterate": 0.25, "double_down": 0.25, "trending": 0.25}

                # Small weight jitter (±3% per strategy)
                for s in weights_dict:
                    jitter = round(random.uniform(-0.03, 0.03), 3)
                    weights_dict[s] = max(MIN_WEIGHT, weights_dict[s] + jitter)
                # Re-normalize
                total_w = sum(weights_dict.values())
                weights_dict = {k: round(v / total_w, 3) for k, v in weights_dict.items()}

                # Pick personality from archetypes (fresh start)
                from app.services.brand_manager import _AGENT_ARCHETYPES
                personality = f"{random.choice(_AGENT_ARCHETYPES)} Specialized for {brand_id}."

                inheritance_source = parent_dna.source_agent_id
                parent_dna.times_inherited = (parent_dna.times_inherited or 0) + 1

                logger.info(f"🧬 Spawning from gene pool: inheriting from {inheritance_source} (score={parent_dna.survival_score})")
            else:
                # No gene pool entries available — fall back to random
                use_gene_pool = False

        if not use_gene_pool:
            # Fully random DNA
            from app.services.generic_agent import _randomize_dna
            dna = _randomize_dna()
            temperature = dna["temperature"]
            variant = dna["variant"]
            risk = dna["risk_tolerance"]
            strategies = dna["strategies"]
            weights_dict = dna["strategy_weights"]
            from app.services.brand_manager import _AGENT_ARCHETYPES
            personality = f"{random.choice(_AGENT_ARCHETYPES)} Specialized for {brand_id}."
            inheritance_source = None
            logger.info("🧬 Spawning with random DNA (genetic diversity)")

        # Generate new unique agent_id
        import hashlib
        timestamp = datetime.utcnow().strftime("%m%d%H%M")
        hash_suffix = hashlib.md5(f"{brand_id}{timestamp}".encode()).hexdigest()[:4]
        new_agent_id = f"agent_{hash_suffix}"
        new_name = f"Agent-{hash_suffix.upper()}"
        prefix = new_name.upper()[:6].replace("-", "")

        # Create the new agent
        new_agent = AIAgent(
            agent_id=new_agent_id,
            display_name=new_name,
            personality=personality,
            temperature=temperature,
            variant=variant,
            proposal_prefix=prefix,
            strategy_names=json.dumps(strategies),
            strategy_weights=json.dumps(weights_dict),
            risk_tolerance=risk,
            proposals_per_brand=3,
            content_types=json.dumps(["reel", "post"]),
            active=True,
            is_builtin=False,
            created_for_brand=brand_id,
            generation=1,
            parent_agent_id=inheritance_source or dead_agent.agent_id,
        )
        db.add(new_agent)

        # Log birth
        birth_desc = (
            f"Born to replace {dead_agent.agent_id}. "
            f"{'Inherited from ' + inheritance_source if inheritance_source else 'Random DNA'}. "
            f"temp={temperature}, strategies={strategies}"
        )
        db.add(AgentLearning(
            agent_id=new_agent_id,
            mutation_type="spawn",
            description=birth_desc,
            old_value=None,
            new_value={
                "temperature": temperature,
                "variant": variant,
                "strategies": strategies,
                "weights": weights_dict,
                "risk": risk,
                "inherited_from": inheritance_source,
            },
            trigger="weekly_evolution",
            confidence=1.0,
            survival_score_at=0.0,
        ))

        logger.info(f"🐣 New agent born: {new_agent_id} for {brand_id} (replacing {dead_agent.agent_id})")

        return {
            "agent_id": new_agent_id,
            "display_name": new_name,
            "brand": brand_id,
            "replaced": dead_agent.agent_id,
            "inherited_from": inheritance_source,
            "temperature": temperature,
            "strategies": strategies,
        }
