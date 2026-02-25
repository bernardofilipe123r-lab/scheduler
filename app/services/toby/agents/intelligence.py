"""
Intelligence Agent — Continuous intelligence gathering and signal processing.

Processes raw signals from various sources (Meta Graph API, discovery,
competitor analysis) into structured world model entries.
"""
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from openai import OpenAI
from app.models.toby import TobyActivityLog
from app.models.toby_cognitive import TobyRawSignal, TobyWorldModel


INTELLIGENCE_PROCESSOR_PROMPT = """You are an intelligence analyst for social media strategy.

Here are raw signals gathered in the last 24 hours from various sources.
Synthesize them into actionable intelligence briefings.

Raw signals:
{signals}

For each meaningful signal, produce a structured briefing:
1. Signal type: "trend", "competitor", "platform", or "audience"
2. Summary: what does this mean for content strategy?
3. Relevance score: 0-1 (how actionable is this?)
4. Expiry: days until this intelligence becomes stale

Return ONLY valid JSON:
{{
    "briefings": [
        {{
            "signal_type": "...",
            "signal_data": {{"topic": "...", "detail": "..."}},
            "interpretation": "...",
            "relevance_score": 0.0-1.0,
            "expires_in_days": N
        }}
    ]
}}"""


def _get_deepseek_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


def store_raw_signal(
    db: Session,
    user_id: str,
    brand_id: str,
    source: str,
    signal_type: str,
    raw_data: dict,
) -> str:
    """Store a raw intelligence signal for later processing."""
    signal = TobyRawSignal(
        user_id=user_id,
        brand_id=brand_id,
        source=source,
        signal_type=signal_type,
        raw_data=raw_data,
        processed=False,
    )
    db.add(signal)
    db.commit()
    return str(signal.id)


def process_raw_signals(db: Session, user_id: str) -> dict:
    """Process unprocessed raw signals into world model entries.

    Returns count of processed signals and world model entries created.
    """
    # Fetch unprocessed signals
    unprocessed = (
        db.query(TobyRawSignal)
        .filter(
            TobyRawSignal.user_id == user_id,
            TobyRawSignal.processed == False,
        )
        .order_by(TobyRawSignal.created_at.desc())
        .limit(50)
        .all()
    )

    if not unprocessed:
        return {"processed": 0, "world_model_entries": 0}

    # Format signals for the LLM
    signals_text = "\n".join(
        f"[{s.source}/{s.signal_type}] {json.dumps(s.raw_data)[:300]}"
        for s in unprocessed
    )

    prompt = INTELLIGENCE_PROCESSOR_PROMPT.format(signals=signals_text)

    try:
        client = _get_deepseek_client()
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=2000,
        )

        content = response.choices[0].message.content or ""
        briefings = _parse_briefings(content)

    except Exception as e:
        print(f"[TOBY] Intelligence processing failed: {e}", flush=True)
        # Mark as processed to avoid retrying forever
        for s in unprocessed:
            s.processed = True
        db.commit()
        return {"processed": len(unprocessed), "world_model_entries": 0, "error": str(e)}

    # Store briefings as world model entries
    entries_created = 0
    now = datetime.now(timezone.utc)

    for briefing in briefings.get("briefings", []):
        expires_days = briefing.get("expires_in_days", 7)
        entry = TobyWorldModel(
            user_id=user_id,
            brand_id=unprocessed[0].brand_id if unprocessed else None,
            signal_type=briefing.get("signal_type", "trend"),
            signal_data=briefing.get("signal_data", {}),
            interpretation=briefing.get("interpretation", ""),
            relevance_score=briefing.get("relevance_score", 0.5),
            expires_at=now + timedelta(days=expires_days),
        )
        db.add(entry)
        entries_created += 1

    # Mark signals as processed
    for s in unprocessed:
        s.processed = True

    db.commit()

    return {"processed": len(unprocessed), "world_model_entries": entries_created}


def competitor_deep_analysis(
    db: Session,
    user_id: str,
    brand_id: str,
    competitor_posts: list[dict],
    prompt_context=None,
) -> list[dict]:
    """Perform deep analysis of competitor content.

    Takes raw competitor post data and produces structured signals
    for the world model.
    """
    if not competitor_posts:
        return []

    niche = getattr(prompt_context, "niche_name", "N/A") if prompt_context else "N/A"
    tone = getattr(prompt_context, "content_tone", "N/A") if prompt_context else "N/A"
    topics = ", ".join(getattr(prompt_context, "topic_categories", []) or []) if prompt_context else "N/A"

    posts_text = "\n".join(
        f"- Caption: {p.get('caption', '')[:200]}, Likes: {p.get('like_count', 'N/A')}, Comments: {p.get('comments_count', 'N/A')}"
        for p in competitor_posts[:10]
    )

    prompt = f"""Analyze these competing Instagram posts from accounts in the {niche} space.

For each post, identify:
1. HOOK STRATEGY: What technique does the title/cover use?
2. CONTENT STRUCTURE: How is information organized?
3. ENGAGEMENT DRIVERS: What drives saves/shares?
4. DIFFERENTIATION OPPORTUNITY: How could our brand improve on this?

Competitor posts:
{posts_text}

Our brand: Niche={niche}, Tone={tone}, Topics={topics}

Return ONLY valid JSON:
{{"analysis": [{{"hook_strategy": "...", "engagement_driver": "...", "opportunity": "...", "relevance": 0.0-1.0}}]}}"""

    try:
        client = _get_deepseek_client()
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1500,
        )

        content = response.choices[0].message.content or ""
        parsed = _parse_json(content)

        # Store each analysis as a world model signal
        results = []
        now = datetime.now(timezone.utc)
        for item in parsed.get("analysis", []):
            entry = TobyWorldModel(
                user_id=user_id,
                brand_id=brand_id,
                signal_type="competitor",
                signal_data=item,
                interpretation=item.get("opportunity", ""),
                relevance_score=item.get("relevance", 0.5),
                expires_at=now + timedelta(days=14),
            )
            db.add(entry)
            results.append(item)

        db.commit()
        return results

    except Exception as e:
        print(f"[TOBY] Competitor analysis failed: {e}", flush=True)
        return []


def _parse_briefings(content: str) -> dict:
    """Parse intelligence briefings JSON."""
    return _parse_json(content)


def _parse_json(content: str) -> dict:
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    try:
        return json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return {}
