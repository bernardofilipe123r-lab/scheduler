"""
Historical Miner — Retroactive learning from historical content.

When Toby is first enabled for a brand (or on demand), analyzes all
historical content to bootstrap memory and Thompson Sampling priors.
Uses the Meta Graph API with rate-limited fetching.
"""
import json
import os
import time
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from openai import OpenAI
from app.models.toby import TobyState, TobyActivityLog, TobyStrategyScore
from app.services.toby.memory.episodic import store_episodic_memory
from app.services.toby.memory.semantic import store_semantic_memory
from app.services.toby.memory.procedural import store_procedural_rule
from app.services.toby.budget_manager import APIBudgetManager


HISTORICAL_ANALYSIS_PROMPT = """Analyze this brand's historical Instagram content performance.

TOP PERFORMING POSTS:
{top_posts}

BOTTOM PERFORMING POSTS:
{bottom_posts}

BRAND CONTEXT:
Niche: {niche}
Tone: {tone}
Total posts analyzed: {total_count}
Average score: {avg_score:.1f}

Provide:
1. What patterns distinguish top performers from bottom performers?
2. What topics generate the most engagement?
3. What hook/title strategies appear in top content?
4. Specific procedural rules Toby should follow.
5. Post timing patterns (if available).

Be specific. Provide confidence levels for each insight.

Return ONLY valid JSON:
{{
    "insights": [
        {{"insight": "...", "confidence": 0.0-1.0, "tags": ["..."]}}
    ],
    "rules": [
        {{"rule": "...", "conditions": "When...", "action": "Do...", "confidence": 0.0-1.0}}
    ]
}}"""


def _get_deepseek_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


def mine_historical_content(
    db: Session,
    user_id: str,
    brand_id: str,
    prompt_context=None,
    max_posts: int = 50,
) -> dict:
    """Retroactively analyze historical content to bootstrap Toby's memory.

    Pulls recently scored content from the database (already collected by
    the metrics pipeline) and runs deep analysis via R1.

    Returns dict with counts of insights and rules generated.
    """
    from app.models.toby import TobyContentTag
    from app.models.analytics import PostPerformance
    from app.models.scheduling import ScheduledReel

    result = {"posts_analyzed": 0, "insights": 0, "rules": 0}

    # Get scored posts — only Toby-created content so manual user
    # uploads don't pollute Toby's bootstrapped memory.
    scored_posts = (
        db.query(PostPerformance)
        .join(ScheduledReel, ScheduledReel.schedule_id == PostPerformance.schedule_id)
        .filter(
            PostPerformance.brand == brand_id,
            PostPerformance.performance_score.isnot(None),
            ScheduledReel.created_by == "toby",
        )
        .order_by(PostPerformance.performance_score.desc())
        .limit(max_posts)
        .all()
    )

    if len(scored_posts) < 5:
        result["error"] = "Not enough historical data (need 5+ scored posts)"
        return result

    result["posts_analyzed"] = len(scored_posts)

    # Split into top / bottom
    top_n = min(10, len(scored_posts) // 3)
    bottom_n = min(10, len(scored_posts) // 3)

    top_posts = scored_posts[:top_n]
    bottom_posts = scored_posts[-bottom_n:] if bottom_n > 0 else []

    # Format for analysis
    def _fmt(posts):
        return "\n".join(
            f"- Score: {p.performance_score:.0f}, "
            f"Likes: {p.likes or 'N/A'}, Saves: {p.saves or 'N/A'}, "
            f"Caption: {(p.caption or '')[:150]}"
            for p in posts
        )

    niche = getattr(prompt_context, "niche_name", "N/A") if prompt_context else "N/A"
    tone = getattr(prompt_context, "content_tone", "N/A") if prompt_context else "N/A"
    avg_score = sum(p.performance_score for p in scored_posts if p.performance_score) / len(scored_posts)

    prompt = HISTORICAL_ANALYSIS_PROMPT.format(
        top_posts=_fmt(top_posts),
        bottom_posts=_fmt(bottom_posts),
        niche=niche,
        tone=tone,
        total_count=len(scored_posts),
        avg_score=avg_score,
    )

    try:
        client = _get_deepseek_client()
        response = client.chat.completions.create(
            model="deepseek-reasoner",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=3000,
        )

        content = response.choices[0].message.content or ""
        analysis = _parse_json(content)

    except Exception as e:
        print(f"[TOBY] Historical mining analysis failed: {e}", flush=True)
        result["error"] = str(e)
        return result

    # Store insights as semantic memories
    for insight_data in analysis.get("insights", []):
        store_semantic_memory(
            db=db,
            user_id=user_id,
            insight=insight_data.get("insight", ""),
            confidence=insight_data.get("confidence", 0.6),
            tags=insight_data.get("tags", ["historical_mining"]) + ["historical_mining"],
        )
        result["insights"] += 1

    # Store rules as procedural memories
    for rule_data in analysis.get("rules", []):
        store_procedural_rule(
            db=db,
            user_id=user_id,
            brand_id=brand_id,
            content_type="reel",  # Default; rules apply broadly
            rule_text=rule_data.get("rule", ""),
            conditions=rule_data.get("conditions", ""),
            action=rule_data.get("action", ""),
            confidence=rule_data.get("confidence", 0.5),
        )
        result["rules"] += 1

    # Store episodic memories for top performers
    for post in top_posts[:5]:
        store_episodic_memory(
            db=db,
            user_id=user_id,
            brand_id=brand_id,
            content_type="reel",
            summary=f"Historical top performer (score: {post.performance_score:.0f}): {(post.caption or 'No caption')[:200]}",
            strategy={},
            quality_score=post.performance_score,
            tags=["historical", "top_performer"],
        )

    # Mark historical mining as complete
    state = db.query(TobyState).filter(TobyState.user_id == user_id).first()
    if state:
        state.historical_mining_complete = True

    # Log
    log = TobyActivityLog(
        user_id=user_id,
        action_type="historical_mining_complete",
        description=f"Analyzed {result['posts_analyzed']} posts, extracted {result['insights']} insights and {result['rules']} rules",
        metadata=result,
        level="success",
    )
    db.add(log)
    db.commit()

    return result


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
        return {"insights": [], "rules": []}
