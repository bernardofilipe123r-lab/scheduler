"""
Strategist Agent — Chain-of-Thought strategy reasoning using DeepSeek Reasoner R1.

Replaces the simple Thompson Sampling pick with LLM-powered reasoning that
considers the full context (performance data, memories, world model, content gaps).
Thompson Sampling serves as the Bayesian prior — the LLM can override it with
explicit reasoning.
"""
import json
import os
import random
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from openai import OpenAI
from app.models.toby import TobyStrategyScore


STRATEGIST_SYSTEM_PROMPT = """You are Toby's Strategy Engine — a world-class social media strategist.

You are deciding the content strategy for the next piece of content. You will receive:
1. Thompson Sampling's statistical recommendation (the "prior")
2. Recent performance data across all strategy dimensions
3. Relevant memories from past content creation
4. Current world model (trends, competitor signals, timing context)
5. Content gaps (what hasn't been covered recently)
6. Procedural rules Toby has learned (hard-won lessons)

Your job:
- REASON step by step about what strategy will maximize engagement
- Consider WHY strategies have worked or failed (from memories), not just scores
- Factor in temporal context (day of week, time of day, recent content frequency)
- Consider content saturation — if a topic has been posted 3 times this week, diversify
- You may OVERRIDE Thompson Sampling's recommendation, but you must explain why
- You may PROPOSE novel combinations that haven't been tested yet

You MUST respect the brand's Content DNA constraints:
- Only topics within the brand's topic_categories
- Tone must match content_tone / tone_avoid
- CTA style must match brand preferences

Output ONLY valid JSON (no markdown):
{
    "strategy": {
        "personality": "...",
        "topic_bucket": "...",
        "hook_strategy": "...",
        "title_format": "...",
        "visual_style": "..."
    },
    "rationale": "Multi-paragraph explanation of your reasoning",
    "confidence": 0.0-1.0,
    "thompson_override": true/false,
    "override_reason": "..." 
}"""


def _get_deepseek_client() -> OpenAI:
    """Get the DeepSeek client."""
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


def strategist_reason(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    thompson_pick: dict,
    scout_context: dict,
    prompt_context=None,
) -> dict:
    """Run chain-of-thought strategy reasoning using DeepSeek.

    Args:
        thompson_pick: The Thompson Sampling statistical recommendation
        scout_context: Full context from the Scout agent
        prompt_context: Brand's NicheConfig/PromptContext

    Returns:
        dict with 'strategy', 'rationale', 'confidence', 'thompson_override',
        and 'reasoning_chain' (the R1 thinking content).
    """
    context = _build_strategy_context(
        thompson_pick, scout_context, prompt_context, content_type
    )

    try:
        client = _get_deepseek_client()
        response = client.chat.completions.create(
            model="deepseek-reasoner",
            messages=[
                {"role": "system", "content": STRATEGIST_SYSTEM_PROMPT},
                {"role": "user", "content": context},
            ],
            max_tokens=4000,
        )

        choice = response.choices[0]
        reasoning_chain = getattr(choice.message, "reasoning_content", "") or ""
        content = choice.message.content or ""

        # Parse the JSON response
        decision = _parse_strategy_decision(content)
        decision["reasoning_chain"] = reasoning_chain

        return decision

    except Exception as e:
        print(f"[TOBY] Strategist reasoning failed, falling back to Thompson: {e}", flush=True)
        return {
            "strategy": thompson_pick,
            "rationale": f"Thompson Sampling selection (R1 reasoning failed: {str(e)[:100]})",
            "confidence": 0.5,
            "thompson_override": False,
            "reasoning_chain": "",
        }


def _build_strategy_context(
    thompson_pick: dict,
    scout_context: dict,
    prompt_context,
    content_type: str,
) -> str:
    """Build the context prompt for the Strategist's reasoning."""
    perf = scout_context.get("performance_context", {})
    memories = scout_context.get("relevant_memories", {})
    world = scout_context.get("world_model", {})
    gaps = scout_context.get("content_gaps", [])

    # Format strategy scores
    strategy_str = "\n".join(
        f"  - {s['dimension']}/{s['option']}: avg {s['avg_score']}, n={s['samples']}"
        for s in perf.get("strategy_scores", [])[:10]
    )

    # Format memories
    episodic_str = "\n".join(
        f"  - {m.summary[:100]}" for m in memories.get("episodic", [])[:5]
    )
    semantic_str = "\n".join(
        f"  - [{m.confidence:.0%}] {m.insight[:100]}" for m in memories.get("semantic", [])[:3]
    )
    procedural_str = "\n".join(
        f"  - {r.rule_text[:100]}" for r in memories.get("procedural", [])[:5]
    )
    insights_str = "\n".join(
        f"  - [{m.confidence:.0%}] {m.insight[:100]}" for m in memories.get("high_confidence_insights", [])[:5]
    )

    # Format world model
    trends = ", ".join(t.get("topic", "") for t in world.get("trending_topics", [])[:5])
    competitor_str = "\n".join(
        f"  - {c.get('interpretation', '')[:100]}" for c in world.get("competitor_signals", [])[:3]
    )
    temporal = world.get("temporal_context", {})

    # Brand DNA
    brand_info = ""
    if prompt_context:
        brand_info = f"""## Brand Identity (Content DNA — INVIOLABLE CONSTRAINTS)
Niche: {getattr(prompt_context, 'niche_name', 'N/A')}
Tone: {getattr(prompt_context, 'content_tone', 'N/A')}
Avoid: {getattr(prompt_context, 'tone_avoid', 'N/A')}
Topics: {', '.join(getattr(prompt_context, 'topic_categories', []) or [])}
Target Audience: {getattr(prompt_context, 'target_audience', 'N/A')}"""

    context = f"""## Statistical Recommendation (Thompson Sampling Prior)
Personality: {thompson_pick.get('personality', 'N/A')}
Topic: {thompson_pick.get('topic_bucket', 'N/A')}
Hook: {thompson_pick.get('hook_strategy', 'N/A')}
Title format: {thompson_pick.get('title_format', 'N/A')}
Visual style: {thompson_pick.get('visual_style', 'N/A')}

{brand_info}

## Performance Data (Recent)
{strategy_str or 'No data yet'}

## Relevant Memories
Episodic (what happened):
{episodic_str or '  None yet'}

Semantic (what it means):
{semantic_str or '  None yet'}

High-confidence insights:
{insights_str or '  None yet'}

Procedural rules (what to do):
{procedural_str or '  None yet'}

## World Model
Trending: {trends or 'None'}
Competitor signals:
{competitor_str or '  None'}
Time: {temporal.get('day_of_week', 'N/A')} {temporal.get('hour', 'N/A')}:00, Weekend: {temporal.get('is_weekend', False)}

## Content Gaps (Under-explored)
{chr(10).join(f'- {g}' for g in gaps[:5]) if gaps else 'None'}

## Your Task
Choose the optimal strategy for the next {content_type} content piece.
Consider all context above. Think step by step."""

    return context


def _parse_strategy_decision(content: str) -> dict:
    """Parse the Strategist's JSON response, with fallback handling."""
    try:
        # Try to extract JSON from the response
        content = content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        decision = json.loads(content)

        # Validate required fields
        strategy = decision.get("strategy", {})
        return {
            "strategy": {
                "personality": strategy.get("personality", "edu_calm"),
                "topic_bucket": strategy.get("topic_bucket", "general"),
                "hook_strategy": strategy.get("hook_strategy", "question"),
                "title_format": strategy.get("title_format", "how_x_does_y"),
                "visual_style": strategy.get("visual_style", "dark_cinematic"),
            },
            "rationale": decision.get("rationale", "No rationale provided"),
            "confidence": float(decision.get("confidence", 0.7)),
            "thompson_override": bool(decision.get("thompson_override", False)),
            "override_reason": decision.get("override_reason", ""),
        }
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        print(f"[TOBY] Failed to parse strategist response: {e}", flush=True)
        return {
            "strategy": {},
            "rationale": f"Parse error — using Thompson Sampling fallback. Raw: {content[:200]}",
            "confidence": 0.3,
            "thompson_override": False,
        }
