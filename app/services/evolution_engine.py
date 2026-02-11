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
