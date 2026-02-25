"""
Critic Agent — Multi-critic ensemble for content evaluation.

Three-layer evaluation:
1. Rule-Based (existing QualityScorer) — fast, free, structural
2. Semantic (DeepSeek Chat t=0.2) — AI-powered quality evaluation
3. Audience Simulator (DeepSeek Chat t=0.5) — simulated audience reaction

Ensemble: 25% Rule + 45% Semantic + 30% Audience
"""
import json
import os
from typing import Optional
from sqlalchemy.orm import Session
from openai import OpenAI
from app.core.quality_scorer import QualityScorer, QualityScore


SEMANTIC_CRITIC_PROMPT = """You are a ruthless content quality critic for social media.
Evaluate this content against the brand's constitution (rules below).

For each dimension, score 0-100:
1. HOOK POWER (0-100): Does the title/cover FORCE someone to stop scrolling? Be brutal — most hooks are generic garbage.
2. NOVELTY (0-100): Is this a fresh angle or recycled content? The internet is drowning in "5 tips for..." posts.
3. ARGUMENT QUALITY (0-100): Are claims well-supported? Is there substance or just fluff?
4. EMOTIONAL RESONANCE (0-100): Does this trigger a specific emotion (curiosity, surprise, recognition)?
5. PLAUSIBILITY (0-100): Are health/science claims defensible? Any pseudo-science red flags?
6. BRAND ALIGNMENT (0-100): Does this match the brand's voice, tone, and topic boundaries?

## Brand Constitution (INVIOLABLE):
{constitution}

## Content to evaluate:
Title: {title}
Content: {body}
Strategy: {strategy}

Return ONLY valid JSON:
{{
    "hook_power": N,
    "novelty": N,
    "argument_quality": N,
    "emotional_resonance": N,
    "plausibility": N,
    "brand_alignment": N,
    "overall": N,
    "issues": ["issue 1", "issue 2"],
    "feedback": "Specific, actionable feedback for improvement"
}}"""


AUDIENCE_SIMULATOR_PROMPT = """You are simulating the reaction of this specific audience:

Target Audience: {target_audience}
Platform: Instagram ({content_type})
Time context: {time_context}

You are scrolling through your Instagram feed. You see this content:

Title/Cover: {title}
First visible text: {first_line}
Content type: {content_type}

Answer AS THIS AUDIENCE MEMBER (not as an AI):
1. SCROLL_STOP (0-100): Would you stop scrolling for this? Most content gets scrolled past.
2. READ_THROUGH (0-100): If you stopped, would you read/watch the whole thing?
3. SAVE (0-100): Would you save this for later?
4. SHARE (0-100): Would you share this? Who would you send it to?
5. FOLLOW (0-100): If not following, would this make you follow?
6. EMOTIONAL_REACTION: What emotion does this trigger?
7. IMPROVEMENT: One specific change to increase engagement.

Return ONLY valid JSON:
{{
    "scroll_stop": N,
    "read_through": N,
    "save": N,
    "share": N,
    "follow": N,
    "overall": N,
    "emotional_reaction": "...",
    "improvement": "...",
    "issues": []
}}"""


def _get_deepseek_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


def critic_evaluate(
    db: Session,
    content: dict,
    content_type: str,
    strategy: dict,
    prompt_context=None,
    run_audience: bool = True,
) -> dict:
    """Run the multi-critic ensemble evaluation.

    Returns:
        dict with 'ensemble_score', 'rule_score', 'semantic_score',
        'audience_score', 'issues', 'feedback', 'should_publish',
        'should_revise', 'details'.
    """
    title = content.get("title", "")
    body = content.get("body", "") or content.get("script", "") or ""
    slides = content.get("slides", [])
    if slides and not body:
        body = "\n".join(slides)

    # ── Critic 1: Rule-Based (fast, free) ──
    rule_result = _rule_based_critique(title, body, content_type, prompt_context)
    rule_score = rule_result.total_score

    # Early kill: if rule-based score < 50, don't spend API calls
    if rule_score < 50:
        return {
            "ensemble_score": rule_score,
            "rule_score": rule_score,
            "semantic_score": None,
            "audience_score": None,
            "issues": rule_result.issues,
            "feedback": "Content failed basic structural checks. Regenerate entirely.",
            "should_publish": False,
            "should_revise": False,
            "should_kill": True,
            "details": {"rule": rule_result.__dict__},
        }

    # ── Critic 2: Semantic (AI-powered) ──
    semantic_result = _semantic_critique(title, body, strategy, prompt_context)
    semantic_score = semantic_result.get("overall", 70)

    # ── Critic 3: Audience Simulator ──
    audience_score = None
    audience_result = {}
    if run_audience:
        audience_result = _audience_critique(
            title, body, content_type, prompt_context
        )
        audience_score = audience_result.get("overall", 70)

    # ── Ensemble Score ──
    if audience_score is not None:
        ensemble = (rule_score * 0.25) + (semantic_score * 0.45) + (audience_score * 0.30)
    else:
        # Without audience: 35% rule + 65% semantic
        ensemble = (rule_score * 0.35) + (semantic_score * 0.65)

    # Aggregate issues
    all_issues = list(rule_result.issues)
    all_issues.extend(semantic_result.get("issues", []))
    all_issues.extend(audience_result.get("issues", []))

    # Best feedback
    feedback = semantic_result.get("feedback", "")
    if audience_result.get("improvement"):
        feedback += f"\nAudience perspective: {audience_result['improvement']}"

    return {
        "ensemble_score": round(ensemble, 1),
        "rule_score": round(rule_score, 1),
        "semantic_score": round(semantic_score, 1),
        "audience_score": round(audience_score, 1) if audience_score is not None else None,
        "issues": all_issues,
        "feedback": feedback,
        "should_publish": ensemble >= 80,
        "should_revise": 60 <= ensemble < 80,
        "should_kill": ensemble < 60,
        "details": {
            "rule": rule_result.__dict__,
            "semantic": semantic_result,
            "audience": audience_result,
        },
    }


def _rule_based_critique(
    title: str, body: str, content_type: str, prompt_context
) -> QualityScore:
    """Run the existing QualityScorer."""
    scorer = QualityScorer()
    # Build a content dict that the scorer expects
    content_dict = {"title": title}
    if content_type == "reel":
        content_dict["script"] = body
    else:
        content_dict["slides"] = body.split("\n") if body else []

    return scorer.score(content_dict, content_type, prompt_context)


def _semantic_critique(
    title: str, body: str, strategy: dict, prompt_context
) -> dict:
    """AI-powered semantic quality evaluation."""
    constitution = _build_constitution(prompt_context)
    strategy_str = ", ".join(f"{k}: {v}" for k, v in strategy.items())

    prompt = SEMANTIC_CRITIC_PROMPT.format(
        constitution=constitution,
        title=title,
        body=body[:2000],
        strategy=strategy_str,
    )

    try:
        client = _get_deepseek_client()
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=800,
        )

        content = response.choices[0].message.content or ""
        return _parse_json_response(content, default_score=70)

    except Exception as e:
        print(f"[TOBY] Semantic critique failed: {e}", flush=True)
        return {"overall": 70, "issues": [], "feedback": f"Semantic critique unavailable: {str(e)[:80]}"}


def _audience_critique(
    title: str, body: str, content_type: str, prompt_context
) -> dict:
    """Simulate audience reaction."""
    target_audience = getattr(prompt_context, "target_audience", "general audience") if prompt_context else "general audience"
    first_line = body[:150] if body else title

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    time_context = f"{now.strftime('%A')} {now.hour}:00"

    prompt = AUDIENCE_SIMULATOR_PROMPT.format(
        target_audience=target_audience,
        content_type=content_type,
        time_context=time_context,
        title=title,
        first_line=first_line,
    )

    try:
        client = _get_deepseek_client()
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=600,
        )

        content = response.choices[0].message.content or ""
        result = _parse_json_response(content, default_score=70)

        # Compute overall from sub-scores if not present
        if "overall" not in result or result["overall"] == 70:
            sub_scores = [
                result.get("scroll_stop", 70),
                result.get("read_through", 70),
                result.get("save", 70),
                result.get("share", 70),
            ]
            result["overall"] = sum(sub_scores) / len(sub_scores)

        return result

    except Exception as e:
        print(f"[TOBY] Audience critique failed: {e}", flush=True)
        return {"overall": 70, "issues": [], "improvement": f"Audience simulation unavailable: {str(e)[:80]}"}


def _build_constitution(prompt_context) -> str:
    """Build the brand's constitution from Content DNA."""
    if not prompt_context:
        return "No brand constitution available."

    rules = []
    tone_avoid = getattr(prompt_context, "tone_avoid", None)
    if tone_avoid:
        rules.append(f"MUST NOT use tone: {tone_avoid}")

    topic_avoid = getattr(prompt_context, "topic_avoid", None)
    if topic_avoid:
        if isinstance(topic_avoid, list):
            rules.append(f"MUST NOT cover topics: {', '.join(topic_avoid)}")
        else:
            rules.append(f"MUST NOT cover topics: {topic_avoid}")

    content_tone = getattr(prompt_context, "content_tone", None)
    if content_tone:
        rules.append(f"MUST match tone: {content_tone}")

    citation_style = getattr(prompt_context, "citation_style", None)
    if citation_style:
        rules.append(f"Citations MUST follow: {citation_style}")

    rules.extend([
        "MUST NOT make unverified health claims",
        "MUST NOT use pure clickbait with no substance",
        "MUST include clear value proposition in the first 3 seconds",
    ])

    return "\n".join(f"Rule {i+1}: {r}" for i, r in enumerate(rules))


def _parse_json_response(content: str, default_score: float = 70) -> dict:
    """Parse JSON from LLM response with fallback."""
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    try:
        return json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return {"overall": default_score, "issues": [], "feedback": "Parse error in critique response"}
