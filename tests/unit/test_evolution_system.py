"""
Phase 6: Unit tests for the AI Evolution Engine.

These test pure logic WITHOUT requiring a database, API calls, or network.
Run with: pytest tests/unit/ -v

Covers:
  - DNA randomization (weights sum to 1.0, temp in range)
  - Survival score math
  - Agent naming logic
  - Diagnostics engine check logic
  - Mutation constraints
"""

import json
import random
import sys
import os
from unittest import mock

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))


# ── DNA Integrity ──

class TestDNARandomization:
    """Verify _randomize_dna() produces valid DNA every time."""

    def test_weights_sum_to_one(self):
        """CRITICAL: Broken weights = broken prompts = wasted API money."""
        from app.services.generic_agent import _randomize_dna

        for _ in range(200):
            dna = _randomize_dna()
            weight_sum = sum(dna["strategy_weights"].values())
            assert abs(weight_sum - 1.0) < 0.01, f"Weights sum to {weight_sum}: {dna['strategy_weights']}"

    def test_temperature_in_range(self):
        """Temperature outside DeepSeek's range → API error → silent failure."""
        from app.services.generic_agent import _randomize_dna

        for _ in range(200):
            dna = _randomize_dna()
            assert 0.60 <= dna["temperature"] <= 1.0, f"Temperature {dna['temperature']} out of valid range"

    def test_variant_is_valid(self):
        from app.services.generic_agent import _randomize_dna

        for _ in range(50):
            dna = _randomize_dna()
            assert dna["variant"] in ("dark", "light"), f"Invalid variant: {dna['variant']}"

    def test_risk_tolerance_is_valid(self):
        from app.services.generic_agent import _randomize_dna

        for _ in range(50):
            dna = _randomize_dna()
            assert dna["risk_tolerance"] in ("low", "medium", "high"), f"Invalid risk: {dna['risk_tolerance']}"

    def test_strategies_not_empty(self):
        from app.services.generic_agent import _randomize_dna

        for _ in range(50):
            dna = _randomize_dna()
            assert len(dna["strategies"]) >= 4, f"Too few strategies: {dna['strategies']}"

    def test_no_negative_weights(self):
        """Negative weights would invert strategy behavior."""
        from app.services.generic_agent import _randomize_dna

        for _ in range(200):
            dna = _randomize_dna()
            for name, w in dna["strategy_weights"].items():
                assert w >= 0, f"Negative weight {w} for strategy '{name}'"

    def test_all_strategies_have_weights(self):
        """Every strategy must have a weight entry."""
        from app.services.generic_agent import _randomize_dna

        for _ in range(50):
            dna = _randomize_dna()
            for s in dna["strategies"]:
                assert s in dna["strategy_weights"], f"Strategy '{s}' missing from weights"


# ── Evolution Constants ──

class TestEvolutionConstants:
    """Verify evolution engine constants are sane."""

    def test_weight_shift_cap_reasonable(self):
        from app.services.evolution_engine import WEIGHT_SHIFT_CAP
        assert 0.01 <= WEIGHT_SHIFT_CAP <= 0.15, f"Weight shift cap {WEIGHT_SHIFT_CAP} seems extreme"

    def test_temperature_shift_cap_reasonable(self):
        from app.services.evolution_engine import TEMPERATURE_SHIFT_CAP
        assert 0.01 <= TEMPERATURE_SHIFT_CAP <= 0.10, f"Temp shift cap {TEMPERATURE_SHIFT_CAP} seems extreme"

    def test_min_posts_for_mutation(self):
        from app.services.evolution_engine import MIN_POSTS_FOR_MUTATION
        assert MIN_POSTS_FOR_MUTATION >= 2, "Need at least 2 posts for meaningful mutation"

    def test_confidence_threshold(self):
        from app.services.evolution_engine import MUTATION_CONFIDENCE_THRESHOLD
        assert 0.5 <= MUTATION_CONFIDENCE_THRESHOLD <= 0.95, f"Confidence threshold {MUTATION_CONFIDENCE_THRESHOLD} out of range"

    def test_death_threshold(self):
        from app.services.evolution_engine import DEATH_THRESHOLD
        assert 10 <= DEATH_THRESHOLD <= 50, f"Death threshold {DEATH_THRESHOLD} seems off"


# ── Agent Naming ──

class TestAgentNames:
    """Verify cool agent names system."""

    def test_names_list_not_empty(self):
        from app.services.evolution_engine import AGENT_NAMES
        assert len(AGENT_NAMES) >= 20, f"Only {len(AGENT_NAMES)} names — need more diversity"

    def test_names_are_unique(self):
        from app.services.evolution_engine import AGENT_NAMES
        assert len(AGENT_NAMES) == len(set(AGENT_NAMES)), "Duplicate names found"

    def test_names_are_short(self):
        """Long names break UI layouts."""
        from app.services.evolution_engine import AGENT_NAMES
        for name in AGENT_NAMES:
            assert len(name) <= 12, f"Name '{name}' is too long (max 12 chars)"

    def test_names_are_alphanumeric(self):
        """Names become agent IDs — must be safe for URLs."""
        from app.services.evolution_engine import AGENT_NAMES
        for name in AGENT_NAMES:
            assert name.replace("-", "").isalnum(), f"Name '{name}' has invalid characters"


# ── Model Serialization ──

class TestModelSerialization:
    """Verify to_dict() methods don't crash with None values."""

    def test_ai_agent_to_dict_with_nulls(self):
        """Agents with NULL evolution columns shouldn't crash the API."""
        from app.models import AIAgent

        agent = AIAgent(
            agent_id="test",
            display_name="Test",
            personality="test",
            temperature=0.85,
            variant="dark",
            proposal_prefix="TST",
            strategy_names='["explore"]',
            strategy_weights='{"explore": 1.0}',
            risk_tolerance="medium",
            proposals_per_brand=3,
            content_types='["reel"]',
            active=True,
            is_builtin=False,
            # All evolution fields are None
        )
        d = agent.to_dict()
        assert d["agent_id"] == "test"
        assert d["survival_score"] == 0.0  # Should default, not crash
        assert d["lifetime_views"] == 0
        assert d["generation"] == 1
        assert d["mutation_count"] == 0

    def test_ai_agent_strategy_parsing(self):
        """Verify JSON strategy parsing handles valid and malformed data."""
        from app.models import AIAgent

        agent = AIAgent(
            agent_id="t", display_name="T", personality="", temperature=0.8,
            variant="dark", proposal_prefix="T",
            strategy_names='["a","b"]',
            strategy_weights='{"a":0.5,"b":0.5}',
            risk_tolerance="low", proposals_per_brand=3,
            content_types='["reel"]', active=True, is_builtin=False,
        )
        assert agent.get_strategies() == ["a", "b"]
        assert agent.get_strategy_weights() == {"a": 0.5, "b": 0.5}

    def test_ai_agent_malformed_json(self):
        """Malformed JSON should return defaults, not crash."""
        from app.models import AIAgent

        agent = AIAgent(
            agent_id="t", display_name="T", personality="", temperature=0.8,
            variant="dark", proposal_prefix="T",
            strategy_names="not json",
            strategy_weights="{broken",
            risk_tolerance="low", proposals_per_brand=3,
            content_types='["reel"]', active=True, is_builtin=False,
        )
        strategies = agent.get_strategies()
        weights = agent.get_strategy_weights()
        assert isinstance(strategies, list) and len(strategies) > 0
        assert isinstance(weights, dict) and len(weights) > 0

    def test_gene_pool_to_dict_with_json_strings(self):
        """GenePool stores strategies as JSON strings — to_dict must parse them."""
        from app.models import GenePool

        gp = GenePool(
            source_agent_id="atlas",
            source_agent_name="Atlas",
            temperature=0.85,
            variant="dark",
            strategy_names='["explore","iterate"]',
            strategy_weights='{"explore":0.6,"iterate":0.4}',
            risk_tolerance="medium",
            survival_score=75.0,
            lifetime_views=50000,
            generation=2,
            reason="top_performer",
            times_inherited=3,
        )
        d = gp.to_dict()
        assert d["strategy_names"] == ["explore", "iterate"]
        assert d["strategy_weights"] == {"explore": 0.6, "iterate": 0.4}
        assert d["times_inherited"] == 3

    def test_system_diagnostic_to_dict(self):
        """SystemDiagnostic model serialization."""
        from app.models import SystemDiagnostic

        diag = SystemDiagnostic(
            status="healthy",
            total_checks=10,
            passed=9,
            warnings=1,
            failures=0,
            checks=[{"name": "db", "status": "pass", "detail": "ok", "duration_ms": 5}],
            active_agents=5,
            avg_survival_score=65.0,
            gene_pool_size=3,
            pending_jobs=0,
            failed_jobs_24h=2,
            total_scheduled=15,
        )
        d = diag.to_dict()
        assert d["status"] == "healthy"
        assert d["passed"] == 9
        assert len(d["checks"]) == 1


# ── Diagnostics Check Result ──

class TestDiagnosticsCheckResult:
    """Verify CheckResult serialization."""

    def test_check_result_to_dict(self):
        from app.services.diagnostics_engine import CheckResult

        r = CheckResult("test_check", "pass", "All good", 42)
        d = r.to_dict()
        assert d["name"] == "test_check"
        assert d["status"] == "pass"
        assert d["detail"] == "All good"
        assert d["duration_ms"] == 42

    def test_check_result_fail(self):
        from app.services.diagnostics_engine import CheckResult

        r = CheckResult("broken", "fail", "Something wrong", 100)
        assert r.status == "fail"


# ── Maestro Config ──

class TestMaestroConfig:
    """Verify Maestro timing constants are reasonable."""

    def test_diagnostics_cycle_exists(self):
        """Confirm DIAGNOSTICS_CYCLE_MINUTES is defined and reasonable."""
        from app.services.maestro import DIAGNOSTICS_CYCLE_MINUTES
        assert 60 <= DIAGNOSTICS_CYCLE_MINUTES <= 720, f"Diagnostics cycle {DIAGNOSTICS_CYCLE_MINUTES}m seems off"

    def test_feedback_cycle_exists(self):
        from app.services.maestro import FEEDBACK_CYCLE_MINUTES
        assert 60 <= FEEDBACK_CYCLE_MINUTES <= 720

    def test_healing_cycle_exists(self):
        from app.services.maestro import HEALING_CYCLE_MINUTES
        assert 5 <= HEALING_CYCLE_MINUTES <= 60

    def test_evolution_day_valid(self):
        from app.services.maestro import EVOLUTION_DAY
        assert EVOLUTION_DAY in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

    def test_evolution_hour_valid(self):
        from app.services.maestro import EVOLUTION_HOUR
        assert 0 <= EVOLUTION_HOUR <= 23
