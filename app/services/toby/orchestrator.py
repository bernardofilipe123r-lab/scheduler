"""
Toby Orchestrator — the main coordination loop.

Runs every 5 minutes via APScheduler. On each tick it checks all users
with Toby enabled and executes whichever action is most needed.

Decision priority (highest to lowest):
  1. BUFFER CHECK  — Are all slots for next 2 days filled?
  2. METRICS CHECK — Any posts older than 48h without Toby score?
  3. ANALYSIS CHECK — Update strategy scores from new metrics
  4. DISCOVERY CHECK — Time for a TrendScout scan?
  5. PHASE CHECK   — Should Toby transition to the next phase?
"""
import traceback
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.toby import TobyState, TobyContentTag, TobyActivityLog


# Intervals (in minutes) between checks for certain actions
BUFFER_CHECK_INTERVAL = 5
METRICS_CHECK_INTERVAL = 360     # 6 hours
ANALYSIS_CHECK_INTERVAL = 360    # 6 hours


def toby_tick():
    """
    Main orchestrator tick — called by APScheduler every 5 minutes.
    Iterates over all users with Toby enabled and runs their actions.
    """
    from app.db_connection import SessionLocal

    db = SessionLocal()
    try:
        # Find all users with Toby enabled
        enabled_states = db.query(TobyState).filter(TobyState.enabled == True).all()

        for state in enabled_states:
            try:
                _process_user(db, state)
                db.commit()
            except Exception as e:
                db.rollback()
                print(f"[TOBY] Error processing user {state.user_id}: {e}", flush=True)
                traceback.print_exc()
                # Log error but continue with other users
                try:
                    db.add(TobyActivityLog(
                        user_id=state.user_id,
                        action_type="error",
                        description=f"Toby tick error: {str(e)[:500]}",
                        level="error",
                        created_at=datetime.utcnow(),
                    ))
                    db.commit()
                except Exception:
                    db.rollback()
    except Exception as e:
        print(f"[TOBY] Critical orchestrator error: {e}", flush=True)
        traceback.print_exc()
    finally:
        db.close()


def _process_user(db: Session, state: TobyState):
    """Process one user's Toby tick — runs the highest-priority action."""
    now = datetime.utcnow()
    user_id = state.user_id

    # 1. BUFFER CHECK
    if _should_check(state.last_buffer_check_at, BUFFER_CHECK_INTERVAL):
        _run_buffer_check(db, user_id, state)
        state.last_buffer_check_at = now
        state.updated_at = now

    # 2. METRICS CHECK
    if _should_check(state.last_metrics_check_at, METRICS_CHECK_INTERVAL):
        _run_metrics_check(db, user_id, state)
        state.last_metrics_check_at = now
        state.updated_at = now

    # 3. ANALYSIS CHECK
    if _should_check(state.last_analysis_at, ANALYSIS_CHECK_INTERVAL):
        _run_analysis_check(db, user_id, state)
        state.last_analysis_at = now
        state.updated_at = now

    # 4. DISCOVERY CHECK
    from app.services.toby.discovery_manager import should_run_discovery, run_discovery_tick
    if should_run_discovery(state):
        run_discovery_tick(db, user_id, state)

    # 5. PHASE CHECK
    from app.services.toby.state import check_phase_transition
    scored_count = (
        db.query(TobyContentTag)
        .filter(
            TobyContentTag.user_id == user_id,
            TobyContentTag.toby_score.isnot(None),
        )
        .count()
    )
    check_phase_transition(db, state, scored_count)


def _should_check(last_at: datetime, interval_minutes: int) -> bool:
    """Return True if enough time has passed since the last check."""
    if not last_at:
        return True
    return (datetime.utcnow() - last_at).total_seconds() >= interval_minutes * 60


def _run_buffer_check(db: Session, user_id: str, state: TobyState):
    """Check buffer and create plans for empty slots."""
    from app.services.toby.buffer_manager import get_buffer_status
    from app.services.toby.content_planner import create_plans_for_empty_slots

    status = get_buffer_status(db, user_id, state)
    if status["health"] == "healthy":
        return

    plans = create_plans_for_empty_slots(db, user_id, state, max_plans=3)
    if not plans:
        return

    # Execute each plan by calling into existing services
    generated = 0
    for plan in plans:
        try:
            _execute_content_plan(db, plan)
            generated += 1
        except Exception as e:
            print(f"[TOBY] Content generation failed for {plan.brand_id}: {e}", flush=True)
            db.add(TobyActivityLog(
                user_id=user_id,
                action_type="error",
                description=f"Content generation failed for {plan.brand_id}: {str(e)[:300]}",
                level="error",
                created_at=datetime.utcnow(),
            ))

    if generated > 0:
        db.add(TobyActivityLog(
            user_id=user_id,
            action_type="content_generated",
            description=f"Generated {generated} pieces of content to fill buffer",
            level="success",
            action_metadata={"count": generated, "buffer_health": status["health"]},
            created_at=datetime.utcnow(),
        ))


def _execute_content_plan(db: Session, plan):
    """
    Execute a ContentPlan: generate content and schedule it.

    Uses existing ContentGeneratorV2 + DatabaseSchedulerService pipeline.
    """
    from app.services.content.generator import ContentGeneratorV2
    from app.services.publishing.scheduler import DatabaseSchedulerService
    from app.services.toby.content_planner import record_content_tag
    from app.core.prompt_context import PromptContext
    from app.services.content.niche_config_service import NicheConfigService

    # Build PromptContext with personality overlay
    niche_svc = NicheConfigService(db)
    ctx = niche_svc.build_prompt_context(plan.user_id, plan.brand_id)
    if not ctx:
        ctx = PromptContext()

    # Inject Toby personality into context
    if plan.personality_prompt:
        ctx.personality_modifier = plan.personality_prompt

    # Generate content
    generator = ContentGeneratorV2()

    if plan.content_type == "reel":
        result = generator.generate_viral_content(
            topic_hint=plan.topic_bucket,
            hook_hint=plan.hook_strategy,
            ctx=ctx,
        )
    else:
        result = generator.generate_post_title(
            topic_hint=plan.topic_bucket,
            ctx=ctx,
        )

    if not result or not result.get("title"):
        raise ValueError("Content generation returned empty result")

    # Schedule the content
    scheduler = DatabaseSchedulerService()
    sched_result = scheduler.schedule_reel(
        user_id=plan.user_id,
        reel_id=result.get("reel_id", f"toby-{plan.brand_id}-{datetime.utcnow().strftime('%Y%m%d%H%M')}"),
        scheduled_time=datetime.fromisoformat(plan.scheduled_time),
        caption=result.get("caption", ""),
        brand=plan.brand_id,
        variant=plan.content_type,
        post_title=result.get("title", ""),
        slide_texts=result.get("content_lines", []),
    )

    schedule_id = sched_result.get("schedule_id", "")
    if schedule_id:
        # Mark as created by Toby
        from app.models.scheduling import ScheduledReel
        sched = db.query(ScheduledReel).filter(ScheduledReel.schedule_id == schedule_id).first()
        if sched and hasattr(sched, 'created_by'):
            sched.created_by = "toby"

        # Record content tags for learning
        record_content_tag(db, plan.user_id, schedule_id, plan)


def _run_metrics_check(db: Session, user_id: str, state: TobyState):
    """Collect metrics for Toby-created posts that need scoring."""
    try:
        from app.services.analytics.metrics_collector import get_metrics_collector
        collector = get_metrics_collector()

        # Collect metrics for all brands
        from app.models.brands import Brand
        brands = db.query(Brand).filter(Brand.user_id == user_id, Brand.active == True).all()

        total_collected = 0
        for brand in brands:
            try:
                result = collector.collect_for_brand(brand.id)
                total_collected += result.get("new_metrics", 0) if isinstance(result, dict) else 0
            except Exception as e:
                print(f"[TOBY] Metrics collection failed for {brand.id}: {e}", flush=True)

        if total_collected > 0:
            db.add(TobyActivityLog(
                user_id=user_id,
                action_type="metrics_collected",
                description=f"Collected metrics for {total_collected} posts",
                level="info",
                action_metadata={"count": total_collected},
                created_at=datetime.utcnow(),
            ))
    except Exception as e:
        print(f"[TOBY] Metrics check error: {e}", flush=True)


def _run_analysis_check(db: Session, user_id: str, state: TobyState):
    """Score posts and update learning engine."""
    from app.services.toby.analysis_engine import score_pending_posts
    from app.services.toby.learning_engine import update_strategy_score, update_experiment_results

    # Score 48h posts
    scored_48h = score_pending_posts(db, user_id, phase="48h")

    # Score 7d posts
    scored_7d = score_pending_posts(db, user_id, phase="7d")

    if scored_7d > 0:
        # Update strategy scores from final (7d) scores
        tags = (
            db.query(TobyContentTag)
            .filter(
                TobyContentTag.user_id == user_id,
                TobyContentTag.score_phase == "7d",
                TobyContentTag.toby_score.isnot(None),
            )
            .order_by(TobyContentTag.scored_at.desc())
            .limit(scored_7d)
            .all()
        )

        for tag in tags:
            # Update each dimension's strategy score
            for dim, val in [
                ("personality", tag.personality),
                ("topic", tag.topic_bucket),
                ("hook", tag.hook_strategy),
                ("title_format", tag.title_format),
                ("visual_style", tag.visual_style),
            ]:
                if val:
                    update_strategy_score(
                        db, user_id, None, tag.content_type,
                        dim, val, tag.toby_score,
                    )
                    # Update experiment if linked
                    if tag.experiment_id:
                        update_experiment_results(
                            db, user_id, tag.content_type,
                            dim, val, tag.toby_score,
                        )


def start_toby_scheduler(scheduler):
    """Register Toby's 5-minute tick with APScheduler."""
    scheduler.add_job(
        toby_tick,
        'interval',
        minutes=5,
        id='toby_orchestrator',
        replace_existing=True,
    )
    print("🤖 Toby orchestrator registered (5-minute ticks)", flush=True)
