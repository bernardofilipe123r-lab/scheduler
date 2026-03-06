"""
Toby Feature Flags — controls rollout of experimental features.

Section 13.4: Feature flag system for gradual feature enablement.
"""

# Feature flag defaults
TOBY_FEATURES = {
    # ── v2 flags ──
    "thompson_sampling": True,       # Phase A1: Use Thompson Sampling instead of epsilon-greedy
    "drift_detection": True,         # Section 9.2: Adaptive explore ratio from drift detection
    "cross_brand_learning": True,    # Phase C: Cross-brand cold-start in learning engine
    "discovery_feedback": True,      # Phase B: Discovery → Learning feedback loop
    "experiment_timeouts": True,     # E6: Force-complete stalled experiments
    "fuzzy_slot_matching": True,     # B4: ±15min slot matching
    "auto_retry_publish": True,      # B8/B9/C4: Auto-retry transient publish failures
    "credential_refresh": True,      # C1: Refresh MetricsCollector credentials before collection
    "llm_strategy_agent": False,     # Phase D: LLM-based strategy recommendations (advisory only)
    "budget_enforcement": False,     # Section 13.2: Per-user spending limits
    "anomaly_detection": False,      # C3: Shadowban/restriction detection
    # ── v3 cognitive flags (default off for safe rollout) ──
    "cognitive_strategist": False,   # v3: DeepSeek R1 chain-of-thought strategy reasoning
    "multi_critic": False,           # v3: Multi-critic ensemble (rule + semantic + audience)
    "memory_system": False,          # v3: Episodic / semantic / procedural memory subsystem
    "deliberation_loop": True,       # v3: Loop 3 — daily pattern analysis via R1
    "meta_learning": False,          # v3: Loop 4 — weekly meta-cognitive self-tuning
    "intelligence_pipeline": False,  # v3: Raw signal processing + competitor analysis
    "historical_mining": False,      # v3: Retroactive learning from historical content
    "cross_brand_intelligence": False,  # v3: Rule/prior transfer between brands
    # ── text-video flags ──
    "text_video_reels": False,           # TEXT-VIDEO reel format support in Toby
}


def is_enabled(feature: str) -> bool:
    """Check if a feature flag is enabled."""
    return TOBY_FEATURES.get(feature, False)


def get_all_flags() -> dict:
    """Get all feature flags and their states."""
    return dict(TOBY_FEATURES)


def set_flag(feature: str, enabled: bool) -> bool:
    """Set a feature flag. Returns True if the flag exists."""
    if feature not in TOBY_FEATURES:
        return False
    TOBY_FEATURES[feature] = enabled
    return True
