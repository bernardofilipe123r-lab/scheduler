"""Test all v3 module imports."""
import sys

print("Testing v3 imports...")

try:
    # Models
    from app.models.toby_cognitive import (
        TobyEpisodicMemory, TobySemanticMemory, TobyProceduralMemory,
        TobyWorldModel, TobyStrategyCombos, TobyRawSignal,
        TobyMetaReport, TobyReasoningTrace
    )
    print("  OK toby_cognitive models")

    # Memory subsystem
    from app.services.toby.memory.embeddings import generate_embedding
    from app.services.toby.memory.episodic import store_episodic_memory, retrieve_episodic_memories
    from app.services.toby.memory.semantic import store_semantic_memory, retrieve_semantic_memories
    from app.services.toby.memory.procedural import store_procedural_rule, retrieve_procedural_rules
    from app.services.toby.memory.world_model import store_world_signal, get_active_signals
    from app.services.toby.memory.gardener import prune_memories, consolidate_memories
    print("  OK memory subsystem")

    # Agents
    from app.services.toby.agents.scout import scout_gather_context
    from app.services.toby.agents.strategist import strategist_reason
    from app.services.toby.agents.creator import creator_generate
    from app.services.toby.agents.critic import critic_evaluate
    from app.services.toby.agents.publisher import publisher_execute
    from app.services.toby.agents.reflector import reflector_reflect
    from app.services.toby.agents.analyst import analyst_loop
    from app.services.toby.agents.pattern_analyzer import pattern_analysis_loop
    from app.services.toby.agents.experiment_designer import design_experiment
    from app.services.toby.agents.meta_learner import meta_cognitive_loop
    from app.services.toby.agents.intelligence import process_raw_signals
    print("  OK all 11 agents")

    # Infrastructure
    from app.services.toby.graph import build_toby_graph, AgentState
    from app.services.toby.budget_manager import APIBudgetManager
    from app.services.toby.historical_miner import mine_historical_content
    from app.services.toby.cross_brand import CrossBrandIntelligence
    print("  OK infrastructure (graph, budget, historical, cross-brand)")

    # Feature flags
    from app.services.toby.feature_flags import is_enabled, get_all_flags
    flags = get_all_flags()
    v3_flags = [k for k in flags if k in [
        'cognitive_strategist', 'multi_critic', 'memory_system',
        'deliberation_loop', 'meta_learning', 'intelligence_pipeline',
        'historical_mining', 'cross_brand_intelligence'
    ]]
    print(f"  OK feature flags ({len(v3_flags)} v3 flags)")

    # Updated model
    from app.models.toby import TobyState
    # Verify new columns exist on the model
    assert hasattr(TobyState, 'last_deliberation_at'), "Missing last_deliberation_at"
    assert hasattr(TobyState, 'last_meta_cognition_at'), "Missing last_meta_cognition_at"
    assert hasattr(TobyState, 'last_intelligence_at'), "Missing last_intelligence_at"
    assert hasattr(TobyState, 'meta_explore_ratio_adjustment'), "Missing meta_explore_ratio_adjustment"
    assert hasattr(TobyState, 'historical_mining_complete'), "Missing historical_mining_complete"
    print("  OK TobyState model with v3 columns")

    # Updated learning engine
    from app.services.toby.learning_engine import _thompson_sample
    sample = _thompson_sample(60.0, 25)
    assert 0 <= sample <= 1, f"Thompson sample out of range: {sample}"
    print(f"  OK learning_engine._thompson_sample (sample={sample:.4f})")

    # Orchestrator imports
    from app.services.toby.orchestrator import toby_tick, _process_user
    print("  OK orchestrator")

    print("\nAll v3 imports passed!")
    sys.exit(0)

except Exception as e:
    print(f"\nIMPORT FAILED: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
