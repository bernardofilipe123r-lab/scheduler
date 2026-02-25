"""
Creator Agent — Memory-augmented content generation.

Wraps the existing content generation pipeline with memory injection:
procedural rules, episodic examples, strategy rationale, competitor context.
"""
import json
import os
from typing import Optional
from sqlalchemy.orm import Session
from openai import OpenAI


CREATOR_SYSTEM_BASE = """You are a world-class social media content creator.
You produce high-engagement content that is both valuable and attention-grabbing.

You will receive:
1. Strategy parameters (personality, topic, hook, format, visual)
2. Brand identity constraints (Content DNA)
3. Lessons from past content creation
4. Examples of what worked well before
5. The strategist's rationale for this approach
6. Competitor context for inspiration

Generate content that maximizes engagement while staying authentic to the brand's voice.
Never copy competitors — use their signals for inspiration only.
Every claim must be plausible and defensible."""


def _get_deepseek_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


def creator_generate(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    strategy: dict,
    strategy_rationale: str,
    scout_context: dict,
    prompt_context=None,
    revision_count: int = 0,
    critic_issues: list = None,
    critic_feedback: str = "",
) -> dict:
    """Generate content with memory-augmented prompting.

    Returns dict with keys: title, body, slides (for carousel), image_prompt,
    hook, cta, hashtags, etc. depending on content_type.
    """
    full_prompt = _build_enhanced_prompt(
        strategy=strategy,
        strategy_rationale=strategy_rationale,
        scout_context=scout_context,
        prompt_context=prompt_context,
        content_type=content_type,
        revision_count=revision_count,
        critic_issues=critic_issues or [],
        critic_feedback=critic_feedback,
    )

    system_prompt = _build_system_prompt(strategy, prompt_context, content_type)

    try:
        client = _get_deepseek_client()
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": full_prompt},
            ],
            temperature=0.85,
            max_tokens=1200 if content_type == "reel" else 8000,
        )

        content_text = response.choices[0].message.content or ""
        result = _parse_generated_content(content_text, content_type)
        result["_raw"] = content_text
        result["revision_count"] = revision_count
        return result

    except Exception as e:
        print(f"[TOBY] Creator generation failed: {e}", flush=True)
        return {
            "title": "",
            "body": "",
            "error": str(e),
            "revision_count": revision_count,
        }


def _build_system_prompt(strategy: dict, prompt_context, content_type: str) -> str:
    """Build a system prompt incorporating personality and brand identity."""
    personality = strategy.get("personality", "edu_calm")
    tone = ""
    brand_info = ""

    if prompt_context:
        tone = getattr(prompt_context, "content_tone", "") or ""
        brand_info = f"""
Brand: {getattr(prompt_context, 'niche_name', 'N/A')}
Target Audience: {getattr(prompt_context, 'target_audience', 'N/A')}
Tone: {tone}
Avoid: {getattr(prompt_context, 'tone_avoid', 'N/A')}
Content Philosophy: {getattr(prompt_context, 'content_philosophy', 'N/A')}"""

    return f"""{CREATOR_SYSTEM_BASE}

## Your Personality for This Piece: {personality}
{brand_info}

## Content Type: {content_type}
"""


def _build_enhanced_prompt(
    strategy: dict,
    strategy_rationale: str,
    scout_context: dict,
    prompt_context,
    content_type: str,
    revision_count: int,
    critic_issues: list,
    critic_feedback: str,
) -> str:
    """Build the full memory-augmented prompt."""
    memories = scout_context.get("relevant_memories", {})
    world = scout_context.get("world_model", {})

    parts = []

    # 1. Strategy parameters
    parts.append(f"""## Strategy
Personality: {strategy.get('personality', 'N/A')}
Topic: {strategy.get('topic_bucket', 'N/A')}
Hook strategy: {strategy.get('hook_strategy', 'N/A')}
Title format: {strategy.get('title_format', 'N/A')}
Visual style: {strategy.get('visual_style', 'N/A')}""")

    # 2. Strategy rationale from the Strategist
    if strategy_rationale:
        parts.append(f"\n## Strategy Rationale\n{strategy_rationale}")

    # 3. Procedural rules (hard-won lessons)
    procedural = memories.get("procedural", [])
    if procedural:
        rules = "\n".join(f"- {r.rule_text[:200]}" for r in procedural[:5])
        parts.append(f"\n## Lessons from Past Experience\n{rules}")

    # 4. Episodic examples (few-shot from own history)
    episodic = memories.get("episodic", [])
    if episodic:
        examples = []
        for ep in episodic[:3]:
            score_str = f"score: {ep.toby_score:.0f}" if ep.toby_score else f"quality: {ep.quality_score:.0f}" if ep.quality_score else "unscored"
            examples.append(f"- [{score_str}] {ep.summary[:150]}")
        parts.append(f"\n## Examples of What Worked Well Before\n" + "\n".join(examples))

    # 5. Semantic insights
    semantic = memories.get("semantic", [])
    if semantic:
        insights = "\n".join(f"- [{m.confidence:.0%}] {m.insight[:150]}" for m in semantic[:3])
        parts.append(f"\n## Key Insights\n{insights}")

    # 6. Competitor context
    competitor_signals = world.get("competitor_signals", [])
    if competitor_signals:
        signals = "\n".join(
            f"- {c.get('interpretation', '')[:120]}" for c in competitor_signals[:3]
        )
        parts.append(f"\n## Competitor Trends (for inspiration, NOT copying)\n{signals}")

    # 7. Brand-specific content guidelines
    if prompt_context:
        topics = ", ".join(getattr(prompt_context, "topic_categories", []) or [])
        cta_opts = getattr(prompt_context, "cta_options", []) or []
        if topics:
            parts.append(f"\n## Allowed Topics\n{topics}")
        if cta_opts:
            parts.append(f"\n## CTA Options\n{', '.join(cta_opts[:5])}")

    # 8. Revision feedback
    if revision_count > 0 and (critic_issues or critic_feedback):
        issues_str = "\n".join(f"- {i}" for i in critic_issues)
        parts.append(
            f"\n## ⚠️ REVISION REQUEST (attempt {revision_count + 1})\n"
            f"Previous version had these issues:\n{issues_str}\n"
            f"Specific feedback: {critic_feedback}"
        )

    # 9. Output format instructions
    if content_type == "reel":
        parts.append("""
## Output Format (JSON)
{
    "title": "The reel title/cover text",
    "script": "The narration script for the reel",
    "hook": "The first line that stops the scroll",
    "cta": "Call to action",
    "hashtags": ["tag1", "tag2", ...],
    "image_prompt": "Detailed prompt for the cover image"
}""")
    else:
        parts.append("""
## Output Format (JSON)
{
    "title": "The carousel/post title",
    "slides": ["Slide 1 text", "Slide 2 text", ...],
    "hook": "The first line that stops the scroll",
    "cta": "Call to action",
    "hashtags": ["tag1", "tag2", ...],
    "image_prompt": "Detailed prompt for the first slide image"
}""")

    return "\n".join(parts)


def _parse_generated_content(content_text: str, content_type: str) -> dict:
    """Parse the generated content, handling JSON or raw text."""
    content_text = content_text.strip()

    # Try to extract JSON
    if content_text.startswith("```"):
        content_text = content_text.split("```")[1]
        if content_text.startswith("json"):
            content_text = content_text[4:]
        content_text = content_text.strip()

    try:
        return json.loads(content_text)
    except json.JSONDecodeError:
        # Fallback: treat as raw text
        return {
            "title": content_text[:100],
            "body": content_text,
            "parse_error": True,
        }
