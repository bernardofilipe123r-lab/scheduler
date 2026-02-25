"""
Reflector Agent — Triple memory writer.

After every content creation, generates three types of memory:
1. Episodic — What happened (factual event log)
2. Semantic — What it means (generalizable insight)
3. Procedural — What to do about it (concrete rule, optional)
"""
import json
import os
from typing import Optional
from sqlalchemy.orm import Session
from openai import OpenAI
from app.services.toby.memory.episodic import store_episodic_memory
from app.services.toby.memory.semantic import store_semantic_memory
from app.services.toby.memory.procedural import store_procedural_rule


REFLECTOR_SYSTEM_PROMPT = """You are Toby's Memory Agent. After each content creation,
you must generate three types of memory entries:

1. EPISODIC MEMORY — What happened
   Record the specific event: strategy used, quality score, any notable circumstances.
   This is a factual log entry.

2. SEMANTIC MEMORY — What it means
   Extract a generalizable insight. Not "Post X scored 91" but "The combination of
   provocative personality + sleep topic creates high engagement because it challenges
   common beliefs, which triggers saves and shares."

3. PROCEDURAL RULE — What to do about it
   If this experience suggests a concrete rule for future behavior, state it.
   E.g., "When the topic is 'sleep' and the audience is health-conscious, prefer
   'shocking_stat' hooks over 'question' hooks."
   Not every experience generates a procedural rule — only clear patterns.

Return ONLY valid JSON:
{
    "episodic": {
        "summary": "...",
        "key_facts": ["...", "..."],
        "tags": ["topic:X", "personality:Y", "outcome:success|failure|mixed"]
    },
    "semantic": {
        "insight": "...",
        "confidence": 0.0-1.0,
        "tags": ["...", "..."]
    },
    "procedural": null or {
        "rule": "...",
        "conditions": "When...",
        "action": "Do...",
        "confidence": 0.0-1.0
    }
}"""


def _get_deepseek_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


def reflector_reflect(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    content: dict,
    strategy: dict,
    quality_score: float,
    strategy_rationale: str = "",
    revision_count: int = 0,
    was_experiment: bool = False,
    schedule_id: str = None,
) -> dict:
    """Generate triple memory entries from content creation experience.

    Returns dict with 'episodic_id', 'semantic_id', 'procedural_id' (or None),
    plus 'memories_stored' count.
    """
    reflection_context = _build_reflection_context(
        content=content,
        strategy=strategy,
        quality_score=quality_score,
        content_type=content_type,
        strategy_rationale=strategy_rationale,
        revision_count=revision_count,
        was_experiment=was_experiment,
    )

    try:
        client = _get_deepseek_client()
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": REFLECTOR_SYSTEM_PROMPT},
                {"role": "user", "content": reflection_context},
            ],
            temperature=0.3,
            max_tokens=1500,
        )

        raw = response.choices[0].message.content or ""
        memories = _parse_reflection(raw)

    except Exception as e:
        print(f"[TOBY] Reflector LLM call failed, using fallback: {e}", flush=True)
        memories = _fallback_memories(content, strategy, quality_score, content_type)

    # Store memories
    result = {"memories_stored": 0}
    from datetime import datetime, timezone

    # 1. Episodic (always)
    ep = memories.get("episodic", {})
    temporal_context = {
        "day_of_week": datetime.now(timezone.utc).strftime("%A"),
        "hour": datetime.now(timezone.utc).hour,
        "is_weekend": datetime.now(timezone.utc).weekday() >= 5,
    }

    ep_id = store_episodic_memory(
        db=db,
        user_id=user_id,
        brand_id=brand_id,
        content_type=content_type,
        summary=ep.get("summary", f"Created {content_type} with {strategy.get('personality', 'unknown')} personality"),
        strategy=strategy,
        quality_score=quality_score,
        tags=ep.get("tags", []),
        key_facts=ep.get("key_facts", []),
        temporal_context=temporal_context,
        revision_count=revision_count,
        was_experiment=was_experiment,
        schedule_id=schedule_id,
    )
    result["episodic_id"] = str(ep_id) if ep_id else None
    result["memories_stored"] += 1

    # 2. Semantic (always)
    sem = memories.get("semantic", {})
    sem_id = store_semantic_memory(
        db=db,
        user_id=user_id,
        insight=sem.get("insight", f"Content using {strategy.get('personality', 'unknown')} scored {quality_score}"),
        confidence=sem.get("confidence", 0.5),
        tags=sem.get("tags", []),
    )
    result["semantic_id"] = str(sem_id) if sem_id else None
    result["memories_stored"] += 1

    # 3. Procedural (only if the reflector produced one)
    proc = memories.get("procedural")
    if proc and isinstance(proc, dict) and proc.get("rule"):
        proc_id = store_procedural_rule(
            db=db,
            user_id=user_id,
            brand_id=brand_id,
            content_type=content_type,
            rule_text=proc["rule"],
            conditions=proc.get("conditions", ""),
            action=proc.get("action", ""),
            confidence=proc.get("confidence", 0.5),
        )
        result["procedural_id"] = str(proc_id) if proc_id else None
        result["memories_stored"] += 1
    else:
        result["procedural_id"] = None

    return result


def _build_reflection_context(
    content: dict,
    strategy: dict,
    quality_score: float,
    content_type: str,
    strategy_rationale: str,
    revision_count: int,
    was_experiment: bool,
) -> str:
    """Build the context for the Reflector's reasoning."""
    title = content.get("title", "N/A")
    outcome = "success" if quality_score >= 80 else "mixed" if quality_score >= 65 else "failure"

    return f"""## Content Just Created
Type: {content_type}
Title: "{title}"
Strategy: personality={strategy.get('personality', 'N/A')}, topic={strategy.get('topic_bucket', 'N/A')}, hook={strategy.get('hook_strategy', 'N/A')}
Quality Score: {quality_score}/100 ({outcome})
Revisions: {revision_count}
Was Experiment: {was_experiment}

## Strategy Rationale
{strategy_rationale or 'No rationale recorded'}

## Your Task
Reflect on this content creation experience and generate memory entries."""


def _parse_reflection(raw: str) -> dict:
    """Parse the Reflector's JSON response."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


def _fallback_memories(content: dict, strategy: dict, quality_score: float, content_type: str) -> dict:
    """Generate basic memories without LLM when the API call fails."""
    title = content.get("title", "untitled")
    personality = strategy.get("personality", "unknown")
    topic = strategy.get("topic_bucket", "unknown")
    outcome = "success" if quality_score >= 80 else "mixed" if quality_score >= 65 else "failure"

    return {
        "episodic": {
            "summary": f"Created {content_type} '{title}' using {personality} personality on {topic} topic. Score: {quality_score:.0f}/100.",
            "key_facts": [f"quality_score: {quality_score:.0f}", f"personality: {personality}", f"topic: {topic}"],
            "tags": [f"topic:{topic}", f"personality:{personality}", f"outcome:{outcome}"],
        },
        "semantic": {
            "insight": f"Content with {personality} personality on {topic} topic scored {quality_score:.0f}/100.",
            "confidence": 0.4,
            "tags": [f"topic:{topic}", f"personality:{personality}"],
        },
        "procedural": None,  # No procedural rule without LLM analysis
    }
