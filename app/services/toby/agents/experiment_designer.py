"""
Experiment Designer Agent — Hypothesis-driven experiment creation.

Part of Loop 3 (daily deliberation). Designs statistically rigorous experiments
with specific hypotheses, using sequential testing for early stopping.
"""
import json
import os
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from openai import OpenAI
from app.models.toby import TobyExperiment, TobyActivityLog, TobyStrategyScore


EXPERIMENT_DESIGNER_PROMPT = """You are an experiment design specialist for social media content strategy.

Based on the following performance data and insights, design the best experiment to run next.

Current top performer: {top_strategy}
Current performance summary: {performance_summary}
Recent insights: {insights}
Content gaps: {gaps}
Active experiments: {active_experiments}

Design an experiment with:
1. A clear HYPOTHESIS (what you expect to happen and why)
2. Exactly TWO options to test (control vs treatment)
3. The DIMENSION being tested (personality, topic_bucket, hook_strategy, title_format, visual_style)
4. Expected minimum effect size (how much better you expect the winner to be)
5. Recommended sample size per variant (minimum 5, maximum 20)

Rules:
- Do NOT test dimensions that already have an active experiment
- Prefer testing untested or under-tested options
- Each experiment should have a SPECIFIC, FALSIFIABLE hypothesis
- Consider the brand's Content DNA constraints

Return ONLY valid JSON:
{{
    "dimension": "...",
    "options": ["control_option", "treatment_option"],
    "hypothesis": "...",
    "expected_effect_size": 0.1-1.0,
    "recommended_samples": 5-20,
    "rationale": "..."
}}"""


def _get_deepseek_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


def design_experiment(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    prompt_context=None,
) -> Optional[dict]:
    """Design a new experiment based on current performance data.

    Returns the experiment dict or None if no good experiment is found.
    """
    context = _build_design_context(db, user_id, brand_id, content_type, prompt_context)

    try:
        client = _get_deepseek_client()
        response = client.chat.completions.create(
            model="deepseek-reasoner",
            messages=[{"role": "user", "content": context}],
            max_tokens=2000,
        )

        choice = response.choices[0]
        content = choice.message.content or ""
        design = _parse_design(content)

        if not design or not design.get("dimension"):
            return None

        # Create the experiment
        experiment = TobyExperiment(
            user_id=user_id,
            content_type=content_type,
            dimension=design["dimension"],
            options=design["options"],
            status="active",
            hypothesis=design.get("hypothesis", ""),
            expected_effect_size=design.get("expected_effect_size"),
        )
        db.add(experiment)

        # Log
        log = TobyActivityLog(
            user_id=user_id,
            action_type="experiment_designed",
            description=f"New experiment: {design['dimension']} — {design['hypothesis'][:100]}",
            metadata=design,
            level="info",
        )
        db.add(log)
        db.commit()

        return design

    except Exception as e:
        print(f"[TOBY] Experiment design failed: {e}", flush=True)
        return None


def check_experiment_significance(db: Session, experiment_id: str) -> dict:
    """Check if an experiment has reached statistical significance.

    Uses Welch's t-test for early stopping when a winner is clear.
    """
    import numpy as np

    experiment = db.query(TobyExperiment).filter(TobyExperiment.id == experiment_id).first()
    if not experiment:
        return {"significant": False, "reason": "not found"}

    options = experiment.options or []
    if len(options) < 2:
        return {"significant": False, "reason": "need 2+ options"}

    # Gather scores per option
    scores = {}
    for option in options:
        option_posts = (
            db.query(TobyContentTag)
            .filter(
                TobyContentTag.user_id == experiment.user_id,
                TobyContentTag.content_type == experiment.content_type,
                TobyContentTag.toby_score.isnot(None),
            )
            .all()
        )

        # Filter by the experiment dimension
        dim = experiment.dimension
        option_scores = []
        for post in option_posts:
            val = getattr(post, dim, None)
            if val == option and post.toby_score is not None:
                option_scores.append(post.toby_score)
        scores[option] = option_scores

    # Need at least 3 samples per option
    if any(len(s) < 3 for s in scores.values()):
        return {
            "significant": False,
            "reason": "insufficient samples",
            "samples": {o: len(s) for o, s in scores.items()},
        }

    # Welch's t-test between top 2
    sorted_options = sorted(
        scores.keys(),
        key=lambda o: np.mean(scores[o]) if scores[o] else 0,
        reverse=True,
    )

    a, b = sorted_options[0], sorted_options[1]
    from scipy import stats
    t_stat, p_value = stats.ttest_ind(scores[a], scores[b], equal_var=False)

    all_scores = scores[a] + scores[b]
    pooled_std = np.std(all_scores) if all_scores else 1.0
    effect_size = (np.mean(scores[a]) - np.mean(scores[b])) / max(pooled_std, 0.01)

    significant = p_value < 0.05 and abs(effect_size) > 0.3

    result = {
        "significant": significant,
        "winner": a if np.mean(scores[a]) > np.mean(scores[b]) else b,
        "p_value": round(float(p_value), 4),
        "effect_size": round(float(effect_size), 3),
        "samples": {o: len(s) for o, s in scores.items()},
        "means": {o: round(float(np.mean(s)), 1) for o, s in scores.items() if s},
    }

    # If significant, mark experiment as complete
    if significant:
        experiment.status = "completed"
        experiment.achieved_significance = True
        experiment.p_value = float(p_value)
        db.commit()

    return result


def _build_design_context(
    db: Session, user_id: str, brand_id: str, content_type: str, prompt_context
) -> str:
    """Build context for experiment design."""
    # Top strategy
    top = (
        db.query(TobyStrategyScore)
        .filter(
            TobyStrategyScore.user_id == user_id,
            TobyStrategyScore.content_type == content_type,
            TobyStrategyScore.sample_count > 2,
        )
        .order_by(TobyStrategyScore.avg_score.desc())
        .limit(5)
        .all()
    )
    top_str = "\n".join(
        f"- {s.dimension}/{s.option_value}: avg={s.avg_score:.1f}, n={s.sample_count}"
        for s in top
    ) or "No data yet"

    # Active experiments
    active = (
        db.query(TobyExperiment)
        .filter(TobyExperiment.user_id == user_id, TobyExperiment.status == "active")
        .all()
    )
    active_str = "\n".join(
        f"- {e.dimension}: {e.options} — {e.hypothesis or 'no hypothesis'}"
        for e in active
    ) or "None"

    # Active experiment dimensions (to avoid)
    active_dims = [e.dimension for e in active]
    avail_dims = [d for d in ["personality", "topic_bucket", "hook_strategy", "title_format", "visual_style"] if d not in active_dims]

    niche = getattr(prompt_context, "niche_name", "N/A") if prompt_context else "N/A"

    return EXPERIMENT_DESIGNER_PROMPT.format(
        top_strategy=top_str,
        performance_summary=f"Niche: {niche}, Available dims to test: {', '.join(avail_dims)}",
        insights="See top strategies above",
        gaps=f"Under-tested dimensions: {', '.join(avail_dims)}",
        active_experiments=active_str,
    )


def _parse_design(content: str) -> Optional[dict]:
    """Parse experiment design JSON."""
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    try:
        return json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return None
