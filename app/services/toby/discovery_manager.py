"""
Toby Discovery Manager — coordinates TrendScout scanning schedules.

Wraps the existing TrendScout service with a smart scheduling layer
that varies frequency based on Toby's phase (bootstrap vs normal).
"""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.toby import TobyState, TobyActivityLog


# Scan intervals (in minutes)
BOOTSTRAP_SCAN_INTERVAL = 20           # Aggressive scanning during first 7 days
NORMAL_OWN_ACCOUNTS_INTERVAL = 360     # 6 hours
NORMAL_COMPETITORS_INTERVAL = 480      # 8 hours
NORMAL_HASHTAG_INTERVAL = 720          # 12 hours


def should_run_discovery(state: TobyState) -> bool:
    """Check if it's time for a discovery scan based on last scan time and phase."""
    if not state.enabled:
        return False

    now = datetime.utcnow()
    last = state.last_discovery_at

    if not last:
        return True  # Never scanned before

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

            # Scan competitors (reels + posts separately)
            comp = scout.scan_competitors()
            if isinstance(comp, dict):
                results["competitors"] = comp.get("total_found", 0)

            # Scan hashtags
            hashtag = scout.scan_hashtags(max_hashtags=3)
            if isinstance(hashtag, dict):
                results["hashtags"] = hashtag.get("total_found", 0)

            total = results["own_accounts"] + results["competitors"] + results["hashtags"]
            _log(db, user_id, "discovery_scan",
                 f"Discovered {total} trending items (own: {results['own_accounts']}, "
                 f"competitors: {results['competitors']}, hashtags: {results['hashtags']})",
                 level="info", metadata=results)

    except Exception as e:
        _log(db, user_id, "error", f"Discovery scan error: {e}", level="error")
        results["error"] = str(e)

    # Update last discovery time
    state.last_discovery_at = datetime.utcnow()
    state.updated_at = datetime.utcnow()

    return results


def _log(db, user_id, action_type, description, level="info", metadata=None):
    db.add(TobyActivityLog(
        user_id=user_id,
        action_type=action_type,
        description=description,
        action_metadata=metadata,
        level=level,
        created_at=datetime.utcnow(),
    ))
