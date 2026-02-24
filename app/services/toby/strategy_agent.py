"""
Toby LLM Strategy Agent — Phase D: AI-powered strategy recommendations.

Sends performance summaries to an LLM and receives structured JSON
strategy recommendations. Starts as advisory-only (logged alongside
Thompson Sampling decisions, not controlling them).

Trust model:
  - Advisory: recommendations are logged but not auto-applied
  - Weighted: recommendations influence Thompson Sampling priors
  - Full: LLM directly chooses strategies (future, requires A/B validation)

This module is behind the `llm_strategy_agent` feature flag.
"""
import json
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.toby import TobyActivityLog


# Default trust level
TRUST_LEVEL = "advisory"  # advisory | weighted | full


def get_strategy_recommendation(
    db: Session,
    user_id: str,
    content_type: str,
    performance_summary: dict,
    current_strategy: dict,
) -> Optional[dict]:
    """
    Get strategy recommendations from the LLM.

    Args:
        performance_summary: Dict with top topics, avg scores, recent trends
        current_strategy: Dict with current Thompson Sampling choices

    Returns:
        Dict with recommendations, or None if feature is disabled or fails.
    """
    from app.services.toby.feature_flags import is_enabled
    if not is_enabled("llm_strategy_agent"):
        return None

    try:
        from app.services.content.generator import ContentGeneratorV2
        generator = ContentGeneratorV2()

        prompt = _build_strategy_prompt(
            content_type=content_type,
            performance_summary=performance_summary,
            current_strategy=current_strategy,
        )

        # Call the LLM with structured output request
        response = generator._call_deepseek(
            system_prompt=(
                "You are an expert social media strategist analyzing content performance data. "
                "Respond ONLY with valid JSON. No markdown, no explanation."
            ),
            user_prompt=prompt,
            temperature=0.3,  # Low temperature for analytical tasks
        )

        if not response:
            return None

        recommendation = json.loads(response)

        # Log the recommendation
        _log(db, user_id, "strategy_recommendation",
             f"LLM recommends: {recommendation.get('summary', 'No summary')}",
             level="info",
             metadata={
                 "recommendation": recommendation,
                 "trust_level": TRUST_LEVEL,
                 "content_type": content_type,
             })

        return recommendation

    except (json.JSONDecodeError, Exception) as e:
        _log(db, user_id, "strategy_agent_error",
             f"LLM strategy agent error: {str(e)[:300]}",
             level="warning")
        return None


def _build_strategy_prompt(
    content_type: str,
    performance_summary: dict,
    current_strategy: dict,
) -> str:
    """Build the prompt that summarizes performance data for the LLM."""
    return f"""Analyze this {content_type} content performance data and recommend strategy adjustments.

## Current Performance Summary
{json.dumps(performance_summary, indent=2, default=str)}

## Current Strategy Choices (Thompson Sampling)
{json.dumps(current_strategy, indent=2, default=str)}

## Your Task
Based on the performance data, provide recommendations in this JSON format:
{{
  "summary": "One-sentence summary of your recommendation",
  "confidence": 0.0-1.0,
  "adjustments": [
    {{
      "dimension": "personality|topic|hook|title_format|visual_style",
      "action": "increase|decrease|explore|avoid",
      "target": "option_value",
      "reason": "Brief reason"
    }}
  ],
  "explore_ratio_suggestion": null or 0.0-1.0,
  "content_mix_suggestion": null or {{"reels_per_day": N, "posts_per_day": N}}
}}

Only suggest changes you're confident about. Set confidence < 0.5 if data is insufficient."""


def apply_recommendation(
    db: Session,
    user_id: str,
    recommendation: dict,
    trust_level: str = TRUST_LEVEL,
) -> dict:
    """
    Apply a strategy recommendation based on trust level.

    - advisory: Log only, no changes
    - weighted: Adjust Thompson Sampling priors
    - full: Override strategy choices (future)
    """
    if not recommendation:
        return {"applied": False, "reason": "No recommendation"}

    confidence = recommendation.get("confidence", 0)

    if trust_level == "advisory":
        return {
            "applied": False,
            "reason": "Advisory mode — recommendation logged but not applied",
            "confidence": confidence,
        }

    if trust_level == "weighted" and confidence >= 0.7:
        # Adjust explore ratio if suggested
        explore_suggestion = recommendation.get("explore_ratio_suggestion")
        if explore_suggestion is not None:
            from app.models.toby import TobyState
            state = db.query(TobyState).filter(
                TobyState.user_id == user_id,
            ).first()
            if state:
                old_ratio = state.explore_ratio
                # Blend: 70% current + 30% LLM suggestion
                state.explore_ratio = round(old_ratio * 0.7 + explore_suggestion * 0.3, 2)
                _log(db, user_id, "strategy_applied",
                     f"Adjusted explore_ratio: {old_ratio} → {state.explore_ratio} "
                     f"(LLM suggested {explore_suggestion}, confidence {confidence})",
                     level="info",
                     metadata={"old": old_ratio, "new": state.explore_ratio})

        return {
            "applied": True,
            "reason": f"Weighted application at confidence {confidence}",
            "confidence": confidence,
        }

    return {"applied": False, "reason": f"Trust level '{trust_level}' with confidence {confidence}"}


def _log(db, user_id, action_type, description, level="info", metadata=None):
    db.add(TobyActivityLog(
        user_id=user_id,
        action_type=action_type,
        description=description,
        action_metadata=metadata,
        level=level,
        created_at=datetime.now(timezone.utc),
    ))
