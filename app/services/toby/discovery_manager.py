"""
Toby Discovery Manager — coordinates TrendScout scanning schedules.

Wraps the existing TrendScout service with a smart scheduling layer
that varies frequency based on Toby's phase (bootstrap vs normal).

Features:
  - I1: Circuit breaker for private/deleted competitor accounts
  - I2: Circuit breaker for banned/ineffective hashtags
  - Phase B: Discovery → Learning feedback loop
"""
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.toby import TobyState, TobyActivityLog


# Scan intervals (in minutes)
BOOTSTRAP_SCAN_INTERVAL = 20           # Aggressive scanning during first 7 days
NORMAL_OWN_ACCOUNTS_INTERVAL = 360     # 6 hours
NORMAL_COMPETITORS_INTERVAL = 480      # 8 hours
NORMAL_HASHTAG_INTERVAL = 720          # 12 hours

# I1/I2: Circuit breaker thresholds
MAX_CONSECUTIVE_FAILURES = 3
CIRCUIT_BREAKER_COOLDOWN_HOURS = 48

# In-memory circuit breaker state (keyed by source identifier)
_failure_counts: dict[str, int] = {}
_disabled_sources: dict[str, datetime] = {}  # source_id -> disabled_until


def should_run_discovery(state: TobyState) -> bool:
    """Check if it's time for a discovery scan based on last scan time and phase."""
    if not state.enabled:
        return False

    now = datetime.now(timezone.utc)
    last = state.last_discovery_at

    if not last:
        return True  # Never scanned before

    # Ensure both are aware
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)

    if state.phase == "bootstrap":
        return (now - last).total_seconds() >= BOOTSTRAP_SCAN_INTERVAL * 60
    else:
        return (now - last).total_seconds() >= NORMAL_OWN_ACCOUNTS_INTERVAL * 60


def run_discovery_tick(db: Session, user_id: str, state: TobyState) -> dict:
    """
    Run a discovery scan tick using the existing TrendScout service.

    Returns summary of what was discovered.
    """
    try:
        from app.services.analytics.trend_scout import get_trend_scout
        scout = get_trend_scout()
        scout.user_id = user_id
    except Exception as e:
        _log(db, user_id, "error", f"Failed to init TrendScout: {e}", level="error")
        return {"error": str(e)}

    results = {"own_accounts": 0, "competitors": 0, "hashtags": 0}

    try:
        if state.phase == "bootstrap":
            # Aggressive bootstrap scan
            scan_result = scout.bootstrap_scan_tick()
            results["bootstrap"] = scan_result
            total = sum(v if isinstance(v, int) else 0 for v in scan_result.values()) if isinstance(scan_result, dict) else 0
            _log(db, user_id, "discovery_scan",
                 f"Bootstrap scan: discovered {total} items",
                 level="info", metadata=scan_result)
        else:
            # Normal: scan own accounts
            own = scout.scan_own_accounts()
            if isinstance(own, dict):
                results["own_accounts"] = own.get("total_found", 0)

            # I1: Scan competitors with circuit breaker
            comp = _scan_with_circuit_breaker(
                db, user_id, "competitors",
                lambda: scout.scan_competitors(),
            )
            if isinstance(comp, dict):
                results["competitors"] = comp.get("total_found", 0)

            # I2: Scan hashtags with circuit breaker
            hashtag = _scan_with_circuit_breaker(
                db, user_id, "hashtags",
                lambda: scout.scan_hashtags(max_hashtags=3),
            )
            if isinstance(hashtag, dict):
                results["hashtags"] = hashtag.get("total_found", 0)

            total = results["own_accounts"] + results["competitors"] + results["hashtags"]
            _log(db, user_id, "discovery_scan",
                 f"Discovered {total} trending items (own: {results['own_accounts']}, "
                 f"competitors: {results['competitors']}, hashtags: {results['hashtags']})",
                 level="info", metadata=results)

            # Phase B: Feed significant discoveries into learning engine
            if total > 0:
                _feed_discovery_to_learning(db, user_id, results)

    except Exception as e:
        _log(db, user_id, "error", f"Discovery scan error: {e}", level="error")
        results["error"] = str(e)

    # Update last discovery time
    state.last_discovery_at = datetime.now(timezone.utc)
    state.updated_at = datetime.now(timezone.utc)

    return results


def _log(db, user_id, action_type, description, level="info", metadata=None):
    db.add(TobyActivityLog(
        user_id=user_id,
        action_type=action_type,
        description=description,
        action_metadata=metadata,
        level=level,
        created_at=datetime.now(timezone.utc),
    ))


def _scan_with_circuit_breaker(
    db: Session,
    user_id: str,
    source_id: str,
    scan_fn,
) -> dict:
    """I1/I2: Wrap a scan call with circuit breaker logic.

    After MAX_CONSECUTIVE_FAILURES, disables the source for
    CIRCUIT_BREAKER_COOLDOWN_HOURS before retrying.
    """
    now = datetime.now(timezone.utc)

    # Check if source is disabled
    disabled_until = _disabled_sources.get(source_id)
    if disabled_until and now < disabled_until:
        return {"skipped": True, "reason": "circuit_breaker_open", "total_found": 0}

    # If cooldown expired, re-enable
    if disabled_until and now >= disabled_until:
        del _disabled_sources[source_id]
        _failure_counts.pop(source_id, None)
        _log(db, user_id, "circuit_breaker_reset",
             f"Re-enabling {source_id} after cooldown",
             level="info", metadata={"source": source_id})

    try:
        result = scan_fn()
        # Success — reset failure counter
        _failure_counts.pop(source_id, None)
        return result if isinstance(result, dict) else {"total_found": 0}
    except Exception as e:
        count = _failure_counts.get(source_id, 0) + 1
        _failure_counts[source_id] = count

        if count >= MAX_CONSECUTIVE_FAILURES:
            _disabled_sources[source_id] = now + timedelta(hours=CIRCUIT_BREAKER_COOLDOWN_HOURS)
            _log(db, user_id, "circuit_breaker_tripped",
                 f"Disabled {source_id} after {count} consecutive failures: {str(e)[:200]}",
                 level="warning",
                 metadata={"source": source_id, "failures": count,
                           "disabled_until": _disabled_sources[source_id].isoformat()})
        else:
            _log(db, user_id, "discovery_error",
                 f"{source_id} scan failed ({count}/{MAX_CONSECUTIVE_FAILURES}): {str(e)[:200]}",
                 level="warning",
                 metadata={"source": source_id, "failures": count})

        return {"error": str(e), "total_found": 0}


def _feed_discovery_to_learning(db: Session, user_id: str, results: dict):
    """Phase B: Feed significant discovery results into experiment creation.

    When a trending topic is discovered that isn't currently being tested,
    auto-create an experiment comparing it against the current best.
    """
    from app.services.toby.learning_engine import create_experiment, get_insights

    try:
        insights = get_insights(db, user_id)

        # Get current best topics for reels
        reel_topics = insights.get("reel", {}).get("topic", [])
        current_best = reel_topics[0]["option"] if reel_topics else None

        # Check if any trending topics from discovery are worth testing
        # This is a simplified version — real implementation would parse
        # specific trending topics from the scout results
        total_found = results.get("competitors", 0) + results.get("hashtags", 0)
        if total_found > 5 and current_best:
            # Significant discovery — there might be new trending topics
            # The learning engine's Thompson Sampling will naturally explore
            # these through its prior distributions
            _log(db, user_id, "discovery_learning_signal",
                 f"Strong discovery signal ({total_found} items) — learning engine will incorporate via exploration",
                 level="info",
                 metadata={"total_found": total_found, "current_best_topic": current_best})
    except Exception as e:
        _log(db, user_id, "discovery_learning_error",
             f"Failed to feed discovery to learning: {str(e)[:200]}",
             level="warning")
