"""
Meta-Learner Agent — Weekly meta-cognitive loop (Loop 4).

Evaluates whether Toby's learning is actually improving outcomes and
adjusts the learning system itself:
1. Exploitation premium: Do exploit choices outscore explore?
2. Prediction accuracy: Are Thompson Sampling priors accurate?
3. Learning velocity: Is performance improving over time?
4. Procedural rule ROI: Do rules actually help?
5. Algorithm tuning: Adjust explore ratio, decay priors, prune memory.
"""
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from openai import OpenAI
import numpy as np

from app.models.toby import (
    TobyState,
    TobyStrategyScore,
    TobyContentTag,
    TobyActivityLog,
)
from app.models.toby_cognitive import TobyMetaReport, TobyProceduralMemory
from app.services.toby.memory.gardener import prune_memories, consolidate_memories


# Guardrails
MAX_EXPLORE_RATIO_CHANGE_PER_WEEK = 0.15
MAX_PRIOR_DECAY_PER_WEEK = 0.20


def _get_deepseek_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


def meta_cognitive_loop(db: Session, user_id: str, brand_id: str) -> dict:
    """Run the weekly meta-cognitive evaluation.

    Returns a meta-report dict.
    """
    report = {}

    # 1. Exploitation Premium
    report["exploitation_premium"] = _compute_exploitation_premium(db, user_id)

    # 2. Prediction Accuracy (calibration)
    report["calibration_error"] = _compute_calibration_error(db, user_id)

    # 3. Learning Velocity
    report["learning_velocity"] = _compute_learning_velocity(db, user_id)

    # 4. Procedural Rule ROI
    report["rule_roi"] = _compute_rule_roi(db, user_id)

    # 5. Algorithm Tuning (take actions based on metrics)
    actions = _tune_algorithm(db, user_id, brand_id, report)
    report["actions_taken"] = actions

    # 6. Memory Gardening
    prune_stats = prune_memories(db, user_id)
    consolidate_stats = consolidate_memories(db, user_id)
    report["memory_pruned"] = prune_stats
    report["memory_consolidated"] = consolidate_stats

    # 7. Generate narrative via R1
    report["narrative"] = _generate_meta_narrative(report, user_id)

    # Store meta report
    meta_report = TobyMetaReport(
        user_id=user_id,
        brand_id=brand_id,
        report_type="weekly",
        exploitation_premium=report.get("exploitation_premium"),
        calibration_error=report.get("calibration_error"),
        learning_velocity=report.get("learning_velocity"),
        actions_taken=actions,
        full_report=report,
    )
    db.add(meta_report)

    # Log activity
    premium = report.get("exploitation_premium")
    premium_str = f"{premium:.1f}" if premium is not None else "N/A"
    log = TobyActivityLog(
        user_id=user_id,
        action_type="meta_cognition",
        description=f"Meta-learning report: exploitation_premium={premium_str}, actions={len(actions)}",
        metadata=report,
        level="info",
    )
    db.add(log)

    # Update state timing
    state = db.query(TobyState).filter(TobyState.user_id == user_id).first()
    if state:
        state.last_meta_cognition_at = datetime.now(timezone.utc)

    db.commit()

    return report


def _compute_exploitation_premium(db: Session, user_id: str) -> Optional[float]:
    """Difference between exploit and explore average scores (30 days)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    def _avg_by_explore(is_explore: bool):
        result = (
            db.query(func.avg(TobyContentTag.toby_score))
            .filter(
                TobyContentTag.user_id == user_id,
                TobyContentTag.toby_score.isnot(None),
                TobyContentTag.is_explore == is_explore,
                TobyContentTag.created_at >= cutoff,
            )
            .scalar()
        )
        return float(result) if result else None

    exploit_avg = _avg_by_explore(False)
    explore_avg = _avg_by_explore(True)

    if exploit_avg is not None and explore_avg is not None:
        return round(exploit_avg - explore_avg, 2)
    return None


def _compute_calibration_error(db: Session, user_id: str) -> Optional[float]:
    """Mean absolute error between strategy priors and actual scores (30d).

    Approximation: for each scored post, compare the strategy dimension's avg_score
    (the prior) against the actual toby_score.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    scored_posts = (
        db.query(TobyContentTag)
        .filter(
            TobyContentTag.user_id == user_id,
            TobyContentTag.toby_score.isnot(None),
            TobyContentTag.created_at >= cutoff,
        )
        .limit(100)
        .all()
    )

    if len(scored_posts) < 5:
        return None

    errors = []
    for post in scored_posts:
        # Get the personality prior as a proxy for "predicted score"
        if post.personality:
            prior = (
                db.query(TobyStrategyScore)
                .filter(
                    TobyStrategyScore.user_id == user_id,
                    TobyStrategyScore.content_type == post.content_type,
                    TobyStrategyScore.dimension == "personality",
                    TobyStrategyScore.option_value == post.personality,
                )
                .first()
            )
            if prior and prior.sample_count > 0:
                errors.append(abs(prior.avg_score - post.toby_score))

    if not errors:
        return None

    return round(float(np.mean(errors)), 2)


def _compute_learning_velocity(db: Session, user_id: str) -> Optional[float]:
    """Week-over-week score improvement (slope over last 8 weeks)."""
    weekly_avgs = []
    now = datetime.now(timezone.utc)

    for w in range(8):
        start = now - timedelta(weeks=w + 1)
        end = now - timedelta(weeks=w)
        avg = (
            db.query(func.avg(TobyContentTag.toby_score))
            .filter(
                TobyContentTag.user_id == user_id,
                TobyContentTag.toby_score.isnot(None),
                TobyContentTag.created_at >= start,
                TobyContentTag.created_at <= end,
            )
            .scalar()
        )
        if avg is not None:
            weekly_avgs.append((w, float(avg)))

    if len(weekly_avgs) < 4:
        return None

    # Simple linear regression slope
    xs = np.array([w for w, _ in weekly_avgs])
    ys = np.array([avg for _, avg in weekly_avgs])
    # Note: x=0 is most recent, x=7 is oldest. Negative slope = improving.
    slope = float(np.polyfit(xs, ys, 1)[0])
    return round(-slope, 3)  # Negate so positive = improving


def _compute_rule_roi(db: Session, user_id: str) -> list[dict]:
    """Evaluate procedural rules with 5+ applications."""
    rules = (
        db.query(TobyProceduralMemory)
        .filter(
            TobyProceduralMemory.user_id == user_id,
            TobyProceduralMemory.is_active == True,
            TobyProceduralMemory.applied_count >= 5,
        )
        .all()
    )

    return [
        {
            "rule_id": str(r.id),
            "rule": r.rule_text[:100],
            "success_rate": r.success_rate,
            "applied": r.applied_count,
        }
        for r in rules
    ]


def _tune_algorithm(
    db: Session, user_id: str, brand_id: str, report: dict
) -> list[str]:
    """Take algorithmic tuning actions based on meta-learning metrics."""
    actions = []
    state = db.query(TobyState).filter(TobyState.user_id == user_id).first()
    if not state:
        return actions

    premium = report.get("exploitation_premium")
    calibration = report.get("calibration_error")
    velocity = report.get("learning_velocity")

    # Action 1: Adjust explore ratio based on exploitation premium
    if premium is not None and premium < 5:
        # Learning barely beating random — increase exploration
        current = state.explore_ratio or 0.25
        adjustment = min(0.10, MAX_EXPLORE_RATIO_CHANGE_PER_WEEK)
        new_ratio = min(0.50, current + adjustment)
        state.explore_ratio = new_ratio
        state.meta_explore_ratio_adjustment = adjustment
        actions.append(
            f"Increased explore_ratio from {current:.2f} to {new_ratio:.2f} "
            f"(exploitation premium={premium:.1f} < 5)"
        )

    elif premium is not None and premium > 20:
        # Strong exploitation advantage — reduce exploration
        current = state.explore_ratio or 0.25
        adjustment = min(0.05, MAX_EXPLORE_RATIO_CHANGE_PER_WEEK)
        new_ratio = max(0.10, current - adjustment)
        state.explore_ratio = new_ratio
        state.meta_explore_ratio_adjustment = -adjustment
        actions.append(
            f"Decreased explore_ratio from {current:.2f} to {new_ratio:.2f} "
            f"(exploitation premium={premium:.1f} > 20)"
        )

    # Action 2: Decay stale priors if predictions are way off
    if calibration is not None and calibration > 25:
        decay_factor = 1.0 - MAX_PRIOR_DECAY_PER_WEEK
        _decay_all_priors(db, user_id, decay_factor)
        actions.append(
            f"Decayed all priors by {MAX_PRIOR_DECAY_PER_WEEK:.0%} "
            f"(calibration error={calibration:.1f} > 25)"
        )

    # Action 3: Deactivate underperforming procedural rules
    underperformers = (
        db.query(TobyProceduralMemory)
        .filter(
            TobyProceduralMemory.user_id == user_id,
            TobyProceduralMemory.is_active == True,
            TobyProceduralMemory.applied_count >= 5,
            TobyProceduralMemory.success_rate < 0.4,
        )
        .all()
    )
    for rule in underperformers:
        rule.is_active = False
        actions.append(f"Deactivated rule (success_rate={rule.success_rate:.2f}): {rule.rule_text[:60]}")

    db.flush()
    return actions


def _decay_all_priors(db: Session, user_id: str, factor: float):
    """Decay Thompson Sampling priors toward the mean."""
    scores = (
        db.query(TobyStrategyScore)
        .filter(TobyStrategyScore.user_id == user_id)
        .all()
    )

    for s in scores:
        if s.sample_count > 3:
            # Reduce effective sample count
            s.sample_count = max(3, int(s.sample_count * factor))
            # Increase variance (more uncertainty)
            s.score_variance = s.score_variance * (1.0 / factor) if s.score_variance else 100.0

    db.flush()


def _generate_meta_narrative(report: dict, user_id: str) -> str:
    """Generate a natural-language summary of the meta-learning report."""
    premium = report.get("exploitation_premium")
    calibration = report.get("calibration_error")
    velocity = report.get("learning_velocity")
    actions = report.get("actions_taken", [])

    parts = []
    if premium is not None:
        if premium > 10:
            parts.append(f"Exploitation premium is strong at {premium:.1f} points — learning is effective.")
        elif premium > 5:
            parts.append(f"Exploitation premium is moderate at {premium:.1f} points — learning is working but could improve.")
        else:
            parts.append(f"Exploitation premium is weak at {premium:.1f} points — learning may be stuck.")

    if velocity is not None:
        if velocity > 0:
            parts.append(f"Performance is improving at {velocity:.2f} points/week.")
        else:
            parts.append(f"Performance is declining at {velocity:.2f} points/week.")

    if actions:
        parts.append(f"Took {len(actions)} corrective actions this week.")

    return " ".join(parts) or "Insufficient data for meta-learning evaluation."
