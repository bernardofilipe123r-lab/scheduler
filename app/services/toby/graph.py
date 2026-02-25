"""
StateGraph — Formalizes the agent pipeline as a typed execution graph.

Defines the AgentState dataclass and the build_toby_graph() function that
chains Scout → Strategist → Creator → Critic → Publisher → Reflector
with conditional routing (revise loop on critic failure).
"""
from dataclasses import dataclass, field
from typing import Optional
from sqlalchemy.orm import Session


@dataclass
class AgentState:
    """Typed state passed through the agent graph."""
    # Identifiers
    user_id: str = ""
    brand_id: str = ""
    content_type: str = "reel"  # "reel" or "post"
    schedule_id: str = ""

    # Prompt context (brand's NicheConfig)
    prompt_context: object = None

    # Scout output
    performance_context: dict = field(default_factory=dict)
    relevant_memories: dict = field(default_factory=dict)
    world_model: dict = field(default_factory=dict)
    content_gaps: list = field(default_factory=list)

    # Strategist output
    strategy: dict = field(default_factory=dict)
    strategy_rationale: str = ""
    strategy_confidence: float = 0.7
    reasoning_chain: str = ""
    thompson_override: bool = False
    is_explore: bool = False

    # Creator output
    generated_content: dict = field(default_factory=dict)

    # Critic output
    quality_score: float = 0.0
    critic_issues: list = field(default_factory=list)
    critic_feedback: str = ""
    critic_details: dict = field(default_factory=dict)
    should_publish: bool = False
    should_revise: bool = False

    # Revision tracking
    revision_count: int = 0
    max_revisions: int = 3

    # Publisher output
    publish_result: dict = field(default_factory=dict)

    # Reflector output
    reflection_result: dict = field(default_factory=dict)

    # Execution trace
    trace: list = field(default_factory=list)
    error: str = ""


def build_toby_graph():
    """Build the reactive loop (Loop 1) agent graph.

    Returns a callable graph: graph(state: AgentState) -> AgentState
    """
    return _execute_graph


def _execute_graph(state: AgentState, db: Session) -> AgentState:
    """Execute the full reactive loop: Scout → Strategist → Creator → Critic → [Revise] → Publisher → Reflector."""
    from app.services.toby.agents.scout import scout_gather_context
    from app.services.toby.agents.strategist import strategist_reason
    from app.services.toby.agents.creator import creator_generate
    from app.services.toby.agents.critic import critic_evaluate
    from app.services.toby.agents.publisher import publisher_execute
    from app.services.toby.agents.reflector import reflector_reflect
    from app.services.toby.learning_engine import choose_strategy
    import random

    try:
        # ── SCOUT ──
        scout_context = scout_gather_context(
            db, state.user_id, state.brand_id, state.content_type
        )
        state.performance_context = scout_context["performance_context"]
        state.relevant_memories = scout_context["relevant_memories"]
        state.world_model = scout_context["world_model"]
        state.content_gaps = scout_context["content_gaps"]
        state.trace.append({"agent": "scout", "status": "done"})

        # ── STRATEGIST ──
        from app.services.toby.feature_flags import is_enabled

        # Get Thompson Sampling pick as the Bayesian prior
        from app.models.toby import TobyState
        toby_state = db.query(TobyState).filter(TobyState.user_id == state.user_id).first()
        explore_ratio = toby_state.explore_ratio if toby_state else 0.30

        ts_pick = choose_strategy(
            db, state.user_id, state.brand_id, state.content_type,
            explore_ratio=explore_ratio,
        )
        thompson_pick = {
            "personality": ts_pick.personality,
            "topic_bucket": ts_pick.topic_bucket,
            "hook_strategy": ts_pick.hook_strategy,
            "title_format": ts_pick.title_format,
            "visual_style": ts_pick.visual_style,
        }

        state.is_explore = ts_pick.is_experiment

        if not state.is_explore and is_enabled("cognitive_strategist"):
            # R1 chain-of-thought reasoning (exploit mode only)
            decision = strategist_reason(
                db, state.user_id, state.brand_id, state.content_type,
                thompson_pick=thompson_pick,
                scout_context=scout_context,
                prompt_context=state.prompt_context,
            )
            state.strategy = decision.get("strategy", thompson_pick)
            state.strategy_rationale = decision.get("rationale", "")
            state.strategy_confidence = decision.get("confidence", 0.7)
            state.reasoning_chain = decision.get("reasoning_chain", "")
            state.thompson_override = decision.get("thompson_override", False)
        else:
            # Use Thompson Sampling directly (explore mode or flag off)
            state.strategy = thompson_pick
            state.strategy_rationale = "Thompson Sampling selection" if not state.is_explore else "Exploration: random combo"

        state.trace.append({
            "agent": "strategist",
            "status": "done",
            "is_explore": state.is_explore,
            "thompson_override": state.thompson_override,
        })

        # ── CREATOR + CRITIC LOOP ──
        for attempt in range(state.max_revisions + 1):
            state.revision_count = attempt

            # Creator
            if is_enabled("cognitive_strategist"):
                content = creator_generate(
                    db, state.user_id, state.brand_id, state.content_type,
                    strategy=state.strategy,
                    strategy_rationale=state.strategy_rationale,
                    scout_context=scout_context,
                    prompt_context=state.prompt_context,
                    revision_count=attempt,
                    critic_issues=state.critic_issues,
                    critic_feedback=state.critic_feedback,
                )
                state.generated_content = content
            else:
                # Fallback: don't use cognitive creator (handled by existing pipeline)
                state.generated_content = {}
                break

            state.trace.append({
                "agent": "creator",
                "status": "done",
                "revision": attempt,
            })

            # Critic
            if is_enabled("multi_critic"):
                verdict = critic_evaluate(
                    db, state.generated_content, state.content_type,
                    strategy=state.strategy,
                    prompt_context=state.prompt_context,
                )
                state.quality_score = verdict["ensemble_score"]
                state.critic_issues = verdict["issues"]
                state.critic_feedback = verdict["feedback"]
                state.critic_details = verdict["details"]
                state.should_publish = verdict["should_publish"]
                state.should_revise = verdict["should_revise"]

                state.trace.append({
                    "agent": "critic",
                    "status": "done",
                    "ensemble_score": state.quality_score,
                    "should_publish": state.should_publish,
                })

                if state.should_publish or not state.should_revise:
                    break  # Accept or kill
            else:
                # No critic: accept everything
                state.quality_score = 75.0
                state.should_publish = True
                break

        # ── PUBLISHER ──
        if state.should_publish and state.generated_content:
            state.publish_result = publisher_execute(
                db, state.user_id, state.brand_id, state.content_type,
                content=state.generated_content,
                strategy=state.strategy,
                quality_score=state.quality_score,
                reasoning_chain=state.reasoning_chain,
                is_explore=state.is_explore,
                thompson_override=state.thompson_override,
            )
            state.trace.append({"agent": "publisher", "status": "done"})

        # ── REFLECTOR ──
        if is_enabled("memory_system"):
            state.reflection_result = reflector_reflect(
                db, state.user_id, state.brand_id, state.content_type,
                content=state.generated_content,
                strategy=state.strategy,
                quality_score=state.quality_score,
                strategy_rationale=state.strategy_rationale,
                revision_count=state.revision_count,
                was_experiment=state.is_explore,
                schedule_id=state.schedule_id,
            )
            state.trace.append({
                "agent": "reflector",
                "status": "done",
                "memories_stored": state.reflection_result.get("memories_stored", 0),
            })

        # ── IMMEDIATE SIGNAL ──
        # Feed quality score as immediate signal to Thompson Sampling
        if state.quality_score > 0 and state.strategy:
            _update_immediate_signal(
                db, state.user_id, state.brand_id, state.content_type,
                state.strategy, state.quality_score,
            )

        # ── STORE REASONING TRACE ──
        if state.reasoning_chain:
            _store_reasoning_trace(db, state)

    except Exception as e:
        state.error = str(e)
        state.trace.append({"agent": "error", "message": str(e)})
        print(f"[TOBY] Graph execution error: {e}", flush=True)
        import traceback
        traceback.print_exc()

    return state


def _update_immediate_signal(
    db: Session, user_id: str, brand_id: str, content_type: str,
    strategy: dict, quality_score: float,
):
    """Feed critic quality score as immediate signal (30% weight) to Thompson Sampling."""
    from app.services.toby.learning_engine import update_strategy_score

    LEARNING_DIMENSIONS = {
        "personality": "personality",
        "topic_bucket": "topic",
        "hook_strategy": "hook",
        "title_format": "title_format",
        "visual_style": "visual_style",
    }

    weighted_score = quality_score * 0.30  # 30% weight for immediate signal

    for strategy_key, dimension in LEARNING_DIMENSIONS.items():
        option = strategy.get(strategy_key)
        if option:
            update_strategy_score(
                db, user_id, brand_id, content_type,
                dimension, option, weighted_score,
            )


def _store_reasoning_trace(db: Session, state: AgentState):
    """Store the strategist's reasoning chain for observability."""
    from app.models.toby_cognitive import TobyReasoningTrace

    trace = TobyReasoningTrace(
        user_id=state.user_id,
        brand_id=state.brand_id,
        content_type=state.content_type,
        schedule_id=state.schedule_id or None,
        agent="strategist",
        model="deepseek-reasoner",
        reasoning_content=state.reasoning_chain[:10000],
        decision=state.strategy,
        confidence=state.strategy_confidence,
    )
    db.add(trace)
    db.flush()
