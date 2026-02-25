"""
Analyst Agent — Enhanced scoring, anomaly detection, and causal attribution.

Runs in Loop 2 (Analytical Loop, every 6 hours):
1. Score pending posts (48h + 7d phases)
2. Detect anomalies (posts scoring >2σ above/below expectation)
3. Drift detection (14d vs 90d rolling averages)
4. Update strategy Thompson Sampling priors
5. Backfill toby_score on episodic memories
"""
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from openai import OpenAI
from app.models.toby import TobyStrategyScore, TobyContentTag, TobyActivityLog
from app.services.toby.memory.episodic import backfill_toby_score
from app.services.toby.memory.semantic import store_semantic_memory


def _get_deepseek_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


def analyst_loop(db: Session, user_id: str, brand_id: str) -> dict:
    """Run the full analytical loop for a user/brand.

    Returns summary of actions taken.
    """
    results = {
        "scored_posts": 0,
        "anomalies_found": 0,
        "drift_detected": False,
        "memories_backfilled": 0,
    }

    # 1. Score pending posts — backfill toby_score on episodic memories
    results["memories_backfilled"] = _backfill_episodic_scores(db, user_id, brand_id)

    # 2. Detect anomalies
    anomalies = detect_anomalies(db, user_id, brand_id)
    results["anomalies_found"] = len(anomalies)

    for anomaly in anomalies:
        # Deep causal analysis via LLM
        analysis = _reason_about_anomaly(anomaly, user_id)
        if analysis:
            store_semantic_memory(
                db=db,
                user_id=user_id,
                insight=analysis,
                confidence=0.6,
                tags=["anomaly", f"direction:{anomaly.get('direction', 'unknown')}"],
            )

    # 3. Drift detection
    drift = detect_performance_drift(db, user_id, brand_id)
    if drift.get("significant"):
        results["drift_detected"] = True
        _log_drift(db, user_id, drift)

    # 4. Log activity
    log = TobyActivityLog(
        user_id=user_id,
        action_type="analyst_loop",
        description=f"Analyst: {results['memories_backfilled']} backfilled, {results['anomalies_found']} anomalies",
        metadata=results,
        level="info",
    )
    db.add(log)
    db.commit()

    return results


def _backfill_episodic_scores(db: Session, user_id: str, brand_id: str) -> int:
    """Backfill toby_score on episodic memories from scored content tags."""
    from app.models.toby_cognitive import TobyEpisodicMemory

    # Find episodic memories without toby_score
    unscored = (
        db.query(TobyEpisodicMemory)
        .filter(
            TobyEpisodicMemory.user_id == user_id,
            TobyEpisodicMemory.brand_id == brand_id,
            TobyEpisodicMemory.toby_score.is_(None),
            TobyEpisodicMemory.schedule_id.isnot(None),
        )
        .limit(50)
        .all()
    )

    count = 0
    for mem in unscored:
        # Try to find the matching content tag with a toby_score
        tag = (
            db.query(TobyContentTag)
            .filter(
                TobyContentTag.user_id == user_id,
                TobyContentTag.schedule_id == mem.schedule_id,
                TobyContentTag.toby_score.isnot(None),
            )
            .first()
        )
        if tag and tag.toby_score:
            mem.toby_score = tag.toby_score
            count += 1

    if count > 0:
        db.commit()

    return count


def detect_anomalies(
    db: Session, user_id: str, brand_id: str, sigma_threshold: float = 2.0
) -> list[dict]:
    """Detect posts that scored >2σ above or below expectation.

    Returns list of anomaly dicts with post info and deviation details.
    """
    import numpy as np

    # Get recent scored posts (last 14 days)
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    scored = (
        db.query(TobyContentTag)
        .filter(
            TobyContentTag.user_id == user_id,
            TobyContentTag.toby_score.isnot(None),
            TobyContentTag.created_at >= cutoff,
        )
        .all()
    )

    if len(scored) < 5:
        return []  # Not enough data for anomaly detection

    scores = [t.toby_score for t in scored]
    mean = np.mean(scores)
    std = np.std(scores)

    if std < 1.0:
        return []  # Scores too uniform

    anomalies = []
    for tag in scored:
        z_score = (tag.toby_score - mean) / std
        if abs(z_score) >= sigma_threshold:
            anomalies.append({
                "schedule_id": tag.schedule_id,
                "content_type": tag.content_type,
                "toby_score": tag.toby_score,
                "z_score": round(z_score, 2),
                "direction": "over" if z_score > 0 else "under",
                "mean": round(mean, 1),
                "std": round(std, 1),
                "personality": tag.personality,
                "topic_bucket": tag.topic_bucket,
                "hook_strategy": tag.hook_strategy,
                "title_format": tag.title_format,
                "created_at": tag.created_at.isoformat() if tag.created_at else None,
            })

    return anomalies


def _reason_about_anomaly(anomaly: dict, user_id: str) -> Optional[str]:
    """Use LLM to hypothesize causal factors for an anomaly."""
    direction = "significantly outperformed" if anomaly["direction"] == "over" else "significantly underperformed"

    prompt = f"""A piece of content {direction} expectations.

Score: {anomaly['toby_score']:.1f} (mean: {anomaly['mean']:.1f}, std: {anomaly['std']:.1f}, z-score: {anomaly['z_score']:.1f})
Content type: {anomaly['content_type']}
Personality: {anomaly.get('personality', 'N/A')}
Topic: {anomaly.get('topic_bucket', 'N/A')}
Hook: {anomaly.get('hook_strategy', 'N/A')}
Posted: {anomaly.get('created_at', 'N/A')}

Hypothesize 2-3 possible causal factors for this anomalous performance.
Consider: strategy choice, timing, topic freshness, audience mood, platform algorithm.
Be specific and actionable — this becomes a semantic memory for future strategy decisions.

Return a single paragraph insight (max 200 words)."""

    try:
        client = _get_deepseek_client()
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=400,
        )
        return response.choices[0].message.content or None
    except Exception as e:
        print(f"[TOBY] Anomaly reasoning failed: {e}", flush=True)
        return None


def detect_performance_drift(
    db: Session, user_id: str, brand_id: str
) -> dict:
    """Compare 14-day rolling average against 90-day baseline.

    Returns drift info dict with 'significant', 'direction', 'magnitude'.
    """
    import numpy as np

    now = datetime.now(timezone.utc)

    def _avg_score(days_back: int, days_range: int) -> Optional[float]:
        start = now - timedelta(days=days_back)
        end = now - timedelta(days=days_back - days_range)
        result = (
            db.query(func.avg(TobyContentTag.toby_score))
            .filter(
                TobyContentTag.user_id == user_id,
                TobyContentTag.toby_score.isnot(None),
                TobyContentTag.created_at >= start,
                TobyContentTag.created_at <= end,
            )
            .scalar()
        )
        return float(result) if result else None

    recent_avg = _avg_score(0, 14)
    baseline_avg = _avg_score(14, 90)

    if recent_avg is None or baseline_avg is None:
        return {"significant": False, "reason": "insufficient data"}

    drift_magnitude = recent_avg - baseline_avg
    # Consider significant if > 10 points difference
    significant = abs(drift_magnitude) > 10

    return {
        "significant": significant,
        "direction": "improving" if drift_magnitude > 0 else "declining",
        "magnitude": round(drift_magnitude, 1),
        "recent_avg": round(recent_avg, 1),
        "baseline_avg": round(baseline_avg, 1),
    }


def _log_drift(db: Session, user_id: str, drift: dict):
    """Log performance drift detection."""
    log = TobyActivityLog(
        user_id=user_id,
        action_type="drift_detected",
        description=f"Performance drift: {drift['direction']} by {drift['magnitude']:.1f} points",
        metadata=drift,
        level="warning" if drift["direction"] == "declining" else "info",
    )
    db.add(log)
    db.commit()
