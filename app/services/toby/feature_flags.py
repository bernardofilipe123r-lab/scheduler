"""
Toby Feature Flags — controls rollout of experimental features.

Section 13.4: Feature flag system for gradual feature enablement.

Flags are persisted in the `feature_flags` DB table so they survive
redeploys.  An in-memory cache (5-minute TTL) avoids a DB round-trip
on every check.
"""
import time
import logging
import threading
from datetime import datetime, timezone

log = logging.getLogger(__name__)

# ── Compile-time defaults (used ONLY to seed new flags) ─────────────────────
_DEFAULTS = {
    # ── v2 flags ──
    "thompson_sampling": True,
    "drift_detection": True,
    "cross_brand_learning": True,
    "discovery_feedback": True,
    "experiment_timeouts": True,
    "fuzzy_slot_matching": True,
    "auto_retry_publish": True,
    "credential_refresh": True,
    "llm_strategy_agent": False,
    "budget_enforcement": False,
    "anomaly_detection": False,
    # ── v3 cognitive flags ──
    "cognitive_strategist": False,
    "multi_critic": False,
    "memory_system": False,
    "deliberation_loop": True,
    "meta_learning": False,
    "intelligence_pipeline": False,
    "historical_mining": False,
    "cross_brand_intelligence": False,
    # ── text-video flags ──
    "text_video_reels": False,
}

# ── In-memory cache ─────────────────────────────────────────────────────────
_cache: dict[str, bool] = {}
_cache_loaded_at: float = 0.0
_CACHE_TTL = 300  # seconds (5 minutes)
_lock = threading.Lock()


def _refresh_cache() -> dict[str, bool]:
    """Load all flags from DB into the in-memory cache."""
    global _cache, _cache_loaded_at
    try:
        from app.db_connection import SessionLocal
        from app.models.feature_flag import FeatureFlag

        db = SessionLocal()
        try:
            rows = db.query(FeatureFlag).all()
            new_cache = {r.flag_name: r.enabled for r in rows}
            # Merge defaults for any flags that exist in code but not yet in DB
            for name, default in _DEFAULTS.items():
                if name not in new_cache:
                    new_cache[name] = default
            _cache = new_cache
            _cache_loaded_at = time.time()
        finally:
            db.close()
    except Exception as e:
        # If DB unavailable, fall back to defaults
        log.warning("feature_flags: DB unavailable, using defaults — %s", e)
        if not _cache:
            _cache = dict(_DEFAULTS)
            _cache_loaded_at = time.time()
    return _cache


def _get_cache() -> dict[str, bool]:
    """Return the cached flags, refreshing if stale."""
    if time.time() - _cache_loaded_at > _CACHE_TTL:
        with _lock:
            # Double-check after acquiring lock
            if time.time() - _cache_loaded_at > _CACHE_TTL:
                _refresh_cache()
    return _cache


# ── Public API (unchanged signatures) ───────────────────────────────────────

def is_enabled(feature: str) -> bool:
    """Check if a feature flag is enabled."""
    return _get_cache().get(feature, False)


def get_all_flags() -> dict:
    """Get all feature flags and their states."""
    return dict(_get_cache())


def set_flag(feature: str, enabled: bool) -> bool:
    """Set a feature flag — persists to DB and refreshes cache."""
    global _cache_loaded_at
    try:
        from app.db_connection import SessionLocal
        from app.models.feature_flag import FeatureFlag

        db = SessionLocal()
        try:
            row = db.query(FeatureFlag).filter_by(flag_name=feature).first()
            if row:
                row.enabled = enabled
                row.updated_at = datetime.now(timezone.utc)
            else:
                db.add(FeatureFlag(flag_name=feature, enabled=enabled))
            db.commit()
            # Bust cache so next read is fresh
            _cache_loaded_at = 0.0
            return True
        finally:
            db.close()
    except Exception as e:
        log.error("feature_flags: set_flag(%s) DB write failed — %s", feature, e)
        return False


# Keep TOBY_FEATURES as a read-through alias for backward compatibility
class _FlagProxy(dict):
    def __getitem__(self, key):
        return _get_cache().get(key, False)
    def get(self, key, default=False):
        return _get_cache().get(key, default)
    def __contains__(self, key):
        return key in _get_cache()
    def items(self):
        return _get_cache().items()
    def keys(self):
        return _get_cache().keys()
    def values(self):
        return _get_cache().values()


TOBY_FEATURES = _FlagProxy()
