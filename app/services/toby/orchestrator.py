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
import concurrent.futures
import threading
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.toby import TobyState, TobyContentTag, TobyActivityLog


# Intervals (in minutes) between checks for certain actions
BUFFER_CHECK_INTERVAL = 5
METRICS_CHECK_INTERVAL = 360     # 6 hours
ANALYSIS_CHECK_INTERVAL = 360    # 6 hours

# D1: Error log debouncing — suppress repeated error logs for the same action
_error_log_timestamps: dict[str, datetime] = {}
ERROR_LOG_DEBOUNCE_MINUTES = 30

# Generation rate-limiting: prevent burst-posting
# Track recent generations per brand to enforce cooldown
_recent_generations: dict[str, list[datetime]] = {}  # "user:brand" -> [timestamps]
_generation_lock = threading.Lock()  # Thread-safe access to _recent_generations

# --- Normal rate limits (steady-state) ---
MAX_GENERATIONS_PER_BRAND_PER_HOUR = 2   # Max 2 pieces per brand per hour
MAX_GENERATIONS_PER_USER_PER_HOUR = 6    # Max 6 pieces per user per hour
GENERATION_COOLDOWN_MINUTES = 15         # Min gap between generations for same brand

# --- Bootstrap / critical rate limits (aggressive fill) ---
BOOTSTRAP_MAX_PER_BRAND_PER_HOUR = 6    # 6 per brand per hour in bootstrap
BOOTSTRAP_MAX_PER_USER_PER_HOUR = 20    # 20 total per hour in bootstrap
BOOTSTRAP_COOLDOWN_MINUTES = 2          # Only 2-min gap between same-brand gens
BOOTSTRAP_MAX_PLANS_PER_TICK = 4        # Generate up to 4 plans per tick
BOOTSTRAP_MAX_PARALLEL_WORKERS = 3      # Run up to 3 generations in parallel


def toby_tick():
    """
    Main orchestrator tick — called by APScheduler every 5 minutes.
    Iterates over all users with Toby enabled and runs their actions.
    Each step is committed independently so a failure in one step
    does not roll back earlier steps (prevents cascade-rerun bugs).
    """
    from app.db_connection import SessionLocal

    db = SessionLocal()
    try:
        # Find all users with Toby enabled
        enabled_states = db.query(TobyState).filter(TobyState.enabled == True).all()

        for state in enabled_states:
            try:
                _process_user(db, state)
            except Exception as e:
                db.rollback()
                print(f"[TOBY] Error processing user {state.user_id}: {e}", flush=True)
                traceback.print_exc()
                # D1: Debounced error logging
                _log_debounced(db, state.user_id, "error",
                               f"Toby tick error: {str(e)[:500]}", level="error")
    except Exception as e:
        print(f"[TOBY] Critical orchestrator error: {e}", flush=True)
        traceback.print_exc()
    finally:
        db.close()


def _process_user(db: Session, state: TobyState):
    """Process one user's Toby tick — runs the highest-priority action.
    
    Each step is wrapped in its own try/commit so that a failure in a
    later step (e.g. phase check) does not roll back timestamp updates
    from earlier steps (e.g. buffer check). This prevents the cascade
    where content gets re-generated on every tick.
    """
    now = datetime.now(timezone.utc)
    user_id = state.user_id

    # 1. BUFFER CHECK — isolated commit
    if _should_check(state.last_buffer_check_at, BUFFER_CHECK_INTERVAL):
        try:
            _run_buffer_check(db, user_id, state)
            state.last_buffer_check_at = now
            state.updated_at = now
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[TOBY] Buffer check failed for {user_id}: {e}", flush=True)

    # 2. METRICS CHECK — isolated commit
    if _should_check(state.last_metrics_check_at, METRICS_CHECK_INTERVAL):
        try:
            _run_metrics_check(db, user_id, state)
            state.last_metrics_check_at = now
            state.updated_at = now
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[TOBY] Metrics check failed for {user_id}: {e}", flush=True)

    # 3. ANALYSIS CHECK — isolated commit
    if _should_check(state.last_analysis_at, ANALYSIS_CHECK_INTERVAL):
        try:
            _run_analysis_check(db, user_id, state)

            # E6: Check for stalled experiments and force-complete them
            from app.services.toby.learning_engine import check_experiment_timeouts
            timed_out = check_experiment_timeouts(db, user_id)
            if timed_out > 0:
                print(f"[TOBY] Force-completed {timed_out} stalled experiments for {user_id}", flush=True)

            # 9.2: Drift detection (weekly, using analysis interval)
            from app.services.toby.analysis_engine import detect_drift
            drift_result = detect_drift(db, user_id)
            if drift_result.get("ratio_change") is not None:
                state.explore_ratio = drift_result["ratio_change"]
                print(f"[TOBY] Drift detected for {user_id}: adjusting explore_ratio to {drift_result['ratio_change']}", flush=True)

            # Gap 5: LLM Strategy Agent (advisory mode behind feature flag)
            try:
                from app.services.toby.feature_flags import is_enabled
                if is_enabled("llm_strategy_agent"):
                    import concurrent.futures
                    from app.services.toby.strategy_agent import get_strategy_recommendation, apply_recommendation
                    from app.services.toby.learning_engine import get_insights

                    insights = get_insights(db, user_id)
                    performance_summary = {
                        "reel_insights": insights.get("reel", {}),
                        "post_insights": insights.get("post", {}),
                        "explore_ratio": state.explore_ratio,
                        "phase": state.phase,
                    }
                    current_strategy = {"explore_ratio": state.explore_ratio, "phase": state.phase}

                    # 10s timeout to prevent slow LLM calls from blocking the tick
                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                        future = executor.submit(
                            get_strategy_recommendation,
                            db, user_id, "reel", performance_summary, current_strategy,
                        )
                        recommendation = future.result(timeout=10)

                    if recommendation:
                        apply_recommendation(db, user_id, recommendation)
            except concurrent.futures.TimeoutError:
                print(f"[TOBY] LLM strategy agent timed out for {user_id} — skipping", flush=True)
            except Exception as agent_err:
                print(f"[TOBY] LLM strategy agent error for {user_id}: {agent_err}", flush=True)

            # v3: Cognitive analyst loop (Loop 2) — anomaly detection + episodic backfill
            try:
                from app.services.toby.feature_flags import is_enabled
                if is_enabled("memory_system"):
                    from app.services.toby.agents.analyst import analyst_loop
                    from app.models.brands import Brand
                    user_brands = db.query(Brand).filter(Brand.user_id == user_id, Brand.active == True).all()
                    for brand in user_brands:
                        try:
                            analyst_loop(db, user_id, brand.id)
                        except Exception as brand_err:
                            print(f"[TOBY] Cognitive analyst error for {user_id}/{brand.id}: {brand_err}", flush=True)
            except Exception as analyst_err:
                print(f"[TOBY] Cognitive analyst error for {user_id}: {analyst_err}", flush=True)

            state.last_analysis_at = now
            state.updated_at = now
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[TOBY] Analysis check failed for {user_id}: {e}", flush=True)

    # 3b. DELIBERATION LOOP (v3 Loop 3) — daily pattern analysis via DeepSeek R1
    try:
        from app.services.toby.feature_flags import is_enabled
        if is_enabled("deliberation_loop") and _should_check(state.last_deliberation_at, 1440):  # 24h
            from app.services.toby.agents.pattern_analyzer import pattern_analysis_loop
            from app.services.toby.agents.experiment_designer import design_experiment
            pattern_analysis_loop(db, user_id)
            # After pattern analysis, check if we should design new experiments
            design_experiment(db, user_id)
            state.last_deliberation_at = now
            state.updated_at = now
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"[TOBY] Deliberation loop failed for {user_id}: {e}", flush=True)

    # 3c. META-COGNITIVE LOOP (v3 Loop 4) — weekly self-tuning
    try:
        from app.services.toby.feature_flags import is_enabled
        if is_enabled("meta_learning") and _should_check(state.last_meta_cognition_at, 10080):  # 7 days
            from app.services.toby.agents.meta_learner import meta_cognitive_loop
            meta_cognitive_loop(db, user_id, state)
            state.last_meta_cognition_at = now
            state.updated_at = now
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"[TOBY] Meta-cognitive loop failed for {user_id}: {e}", flush=True)

    # 3d. INTELLIGENCE PIPELINE (v3) — process raw signals
    try:
        from app.services.toby.feature_flags import is_enabled
        if is_enabled("intelligence_pipeline") and _should_check(state.last_intelligence_at, 720):  # 12h
            from app.services.toby.agents.intelligence import process_raw_signals
            process_raw_signals(db, user_id)
            state.last_intelligence_at = now
            state.updated_at = now
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"[TOBY] Intelligence pipeline failed for {user_id}: {e}", flush=True)

    # 3e. HISTORICAL MINING (v3) — one-time retroactive learning
    try:
        from app.services.toby.feature_flags import is_enabled
        if is_enabled("historical_mining") and not state.historical_mining_complete:
            from app.services.toby.historical_miner import mine_historical_content
            mine_historical_content(db, user_id, state)
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"[TOBY] Historical mining failed for {user_id}: {e}", flush=True)

    # 4. DISCOVERY CHECK — isolated commit
    try:
        from app.services.toby.discovery_manager import should_run_discovery, run_discovery_tick
        if should_run_discovery(state):
            if state.phase == "bootstrap":
                from app.services.toby.buffer_manager import get_buffer_status
                buf = get_buffer_status(db, user_id, state)
                if buf["health"] not in ("critical", "low"):
                    run_discovery_tick(db, user_id, state)
            else:
                run_discovery_tick(db, user_id, state)
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"[TOBY] Discovery check failed for {user_id}: {e}", flush=True)

    # 5. PHASE CHECK — isolated commit
    try:
        from app.services.toby.state import check_phase_transition, check_phase_regression
        scored_count = (
            db.query(TobyContentTag)
            .filter(
                TobyContentTag.user_id == user_id,
                TobyContentTag.toby_score.isnot(None),
            )
            .count()
        )
        check_phase_transition(db, state, scored_count)

        # Gap 3: Check for phase regression (optimizing → learning)
        check_phase_regression(db, user_id)

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[TOBY] Phase check failed for {user_id}: {e}", flush=True)


def _should_check(last_at: datetime, interval_minutes: int) -> bool:
    """Return True if enough time has passed since the last check."""
    if not last_at:
        return True
    # Ensure both datetimes are comparable (handle naive vs aware)
    now = datetime.now(timezone.utc)
    if last_at.tzinfo is None:
        from datetime import timezone as _tz
        last_at = last_at.replace(tzinfo=_tz.utc)
    return (now - last_at).total_seconds() >= interval_minutes * 60


def _run_buffer_check(db: Session, user_id: str, state: TobyState):
    """Check buffer and create plans for empty slots (rate-limited)."""
    from app.services.toby.buffer_manager import get_buffer_status
    from app.services.toby.content_planner import create_plans_for_empty_slots

    # A4/A6: Verify at least one brand has valid credentials before generating
    from app.models.brands import Brand
    brands = db.query(Brand).filter(Brand.user_id == user_id, Brand.active == True).all()
    valid_brands = [
        b for b in brands
        if (b.meta_access_token or b.instagram_access_token)
        and b.instagram_business_account_id
    ]
    if not valid_brands:
        return  # No brands with credentials — skip buffer fill to avoid wasting resources

    # Section 13.2: Budget enforcement — skip if daily budget exhausted
    if _check_budget_exceeded(state):
        return

    # Determine if we're in aggressive mode (bootstrap or critical buffer)
    is_bootstrap = state.phase == "bootstrap"

    # Rate-limit: check user-level hourly cap before even querying buffer
    if _user_at_hourly_cap(user_id, aggressive=is_bootstrap):
        return

    status = get_buffer_status(db, user_id, state)
    if status["health"] == "healthy":
        return

    is_aggressive = is_bootstrap or status["health"] == "critical"
    max_plans = BOOTSTRAP_MAX_PLANS_PER_TICK if is_aggressive else 1

    plans = create_plans_for_empty_slots(db, user_id, state, max_plans=max_plans)
    if not plans:
        return

    # Filter out plans that hit brand cooldown
    eligible_plans = []
    for plan in plans:
        if _brand_at_cooldown(user_id, plan.brand_id, aggressive=is_aggressive):
            print(f"[TOBY] Skipping {plan.brand_id} — generation cooldown active", flush=True)
        else:
            eligible_plans.append(plan)

    if not eligible_plans:
        return

    # Execute plans — parallel in aggressive mode, sequential otherwise
    if is_aggressive and len(eligible_plans) > 1:
        generated, job_details = _execute_plans_parallel(eligible_plans, user_id, state)
    else:
        generated, job_details = _execute_plans_sequential(db, eligible_plans, user_id, state)

    if generated > 0:
        db.add(TobyActivityLog(
            user_id=user_id,
            action_type="content_generated",
            description=f"Toby created {generated} piece{'s' if generated != 1 else ''} of content to fill empty buffer slots",
            level="success",
            action_metadata={
                "count": generated,
                "buffer_health": status["health"],
                "parallel": is_aggressive and len(eligible_plans) > 1,
                "jobs": job_details,
            },
            created_at=datetime.now(timezone.utc),
        ))

    # B8/B9/C4: Auto-retry any Toby-created posts that failed due to transient errors
    try:
        from app.services.publishing.scheduler import DatabaseSchedulerService
        sched_svc = DatabaseSchedulerService()
        retried = sched_svc.auto_retry_failed_toby_posts(user_id)
        if retried > 0:
            db.add(TobyActivityLog(
                user_id=user_id,
                action_type="auto_retry",
                description=f"Auto-retried {retried} failed posts with transient errors",
                level="info",
                action_metadata={"retried": retried},
                created_at=datetime.now(timezone.utc),
            ))
    except Exception as e:
        print(f"[TOBY] Auto-retry check error: {e}", flush=True)


def _execute_content_plan(db: Session, plan):
    """
    Execute a ContentPlan: generate content, create media, and schedule.

    v2.0: Creates a real GenerationJob and runs the full JobProcessor pipeline
    so that Toby-created content has real images, video, and Supabase URLs.
    """
    from app.services.content.generator import ContentGeneratorV2
    from app.services.content.job_manager import JobManager
    from app.services.content.job_processor import JobProcessor
    from app.services.publishing.scheduler import DatabaseSchedulerService
    from app.services.toby.content_planner import record_content_tag
    from app.core.prompt_context import PromptContext
    from app.services.content.niche_config_service import NicheConfigService

    # ── Step 1: Build PromptContext ──────────────────────────
    niche_svc = NicheConfigService()
    ctx = niche_svc.get_context(user_id=plan.user_id, brand_id=plan.brand_id)
    if not ctx:
        ctx = PromptContext()

    # Inject Toby personality into context
    if plan.personality_prompt:
        ctx.personality_modifier = plan.personality_prompt

    # ── Step 2: Generate text content ────────────────────────
    generator = ContentGeneratorV2()

    if plan.content_type == "reel":
        result = generator.generate_viral_content(
            topic_hint=plan.topic_bucket,
            hook_hint=plan.hook_strategy,
            ctx=ctx,
        )
    else:
        # Batch generation with built-in 3-attempt quality loop
        results = generator.generate_post_titles_batch(
            count=1,
            topic_hint=plan.topic_bucket,
            ctx=ctx,
        )
        result = results[0] if results else None

    # D2: Detect fallback content and tag it
    if not result or not result.get("title"):
        if plan.content_type == "post":
            result = generator._fallback_post_title()
        if not result or not result.get("title"):
            raise ValueError("Content generation returned empty result")
        plan.used_fallback = True

    # ── Step 3: Determine variant from slot pattern ──────────
    if plan.content_type == "reel":
        sched_time = datetime.fromisoformat(plan.scheduled_time)
        slot_index = sched_time.hour // 4  # 0-5 across 24h
        variant = "light" if slot_index % 2 == 0 else "dark"
    else:
        variant = "post"

    # ── Step 4: Create a GenerationJob ───────────────────────
    job_manager = JobManager(db)
    slide_texts = result.get("slide_texts", result.get("content_lines", []))

    # Determine platforms based on brand’s actual connections
    from app.services.brands.resolver import brand_resolver as _brand_resolver
    _brand_conf = _brand_resolver.get_brand_config(plan.brand_id)
    _toby_platforms = ["instagram", "youtube"]  # always attempt these
    if _brand_conf and _brand_conf.facebook_page_id:
        _toby_platforms = ["instagram", "facebook", "youtube"]
    else:
        print(f"[TOBY] Facebook not configured for {plan.brand_id} — skipping (not an error)", flush=True)

    job = job_manager.create_job(
        user_id=plan.user_id,
        title=result["title"],
        content_lines=slide_texts,
        brands=[plan.brand_id],
        variant=variant,
        ai_prompt=result.get("image_prompt"),
        cta_type=None,
        platforms=_toby_platforms,
        fixed_title=True,
        created_by="toby",
    )
    job_id = job.job_id

    # Store per-brand content in brand_outputs (so regenerate_brand finds it)
    brand_output_data = {
        "title": result["title"],
        "content_lines": slide_texts,
        "ai_prompt": result.get("image_prompt", ""),
        "status": "pending",
    }
    if variant == "post":
        brand_output_data["slide_texts"] = slide_texts
        brand_output_data["caption"] = result.get("caption", "")
    job_manager.update_brand_output(job_id, plan.brand_id, brand_output_data)

    print(f"[TOBY] Created job {job_id} for {plan.brand_id} ({variant})", flush=True)

    # ── Step 5: Run the media pipeline ───────────────────────
    processor = JobProcessor(db)
    job_manager.update_job_status(job_id, "generating", "Toby generating media...", 5)

    try:
        if variant == "post":
            media_result = processor.process_post_brand(job_id, plan.brand_id)
        else:
            media_result = processor.regenerate_brand(job_id, plan.brand_id)

        if not media_result.get("success"):
            error = media_result.get("error", "Unknown media generation error")
            job_manager.update_job_status(job_id, "failed", error_message=error)
            _cleanup_supabase_on_failure(job_id, plan.brand_id)  # D4
            raise ValueError(f"Media generation failed: {error}")
    except Exception:
        # Ensure job is marked failed on any exception
        job = job_manager.get_job(job_id)
        if job and job.status != "failed":
            job_manager.update_job_status(job_id, "failed", error_message="Media pipeline exception")
        _cleanup_supabase_on_failure(job_id, plan.brand_id)  # D4
        raise

    # ── Step 6: Read completed brand_outputs ─────────────────
    db.expire_all()
    job = job_manager.get_job(job_id)
    brand_data = (job.brand_outputs or {}).get(plan.brand_id, {})

    # Update job status to completed
    job_manager.update_job_status(job_id, "completed", progress_percent=100)
    print(f"[TOBY] Job {job_id} completed — media ready", flush=True)

    # ── Step 6b: Pre-render carousel images ──────────────────
    # Render cover + text slides as PNGs and store in Supabase so the
    # calendar / job-detail page can show simple <img> tags instead of
    # re-rendering via live Konva on the frontend.
    carousel_paths = []
    if variant == "post" and slide_texts and brand_data.get("thumbnail_path"):
        try:
            import tempfile
            import requests as _req

            bg_url = brand_data["thumbnail_path"]
            if bg_url.startswith("https://"):
                resp = _req.get(bg_url, timeout=60)
                resp.raise_for_status()
                tmp_bg = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                tmp_bg.write(resp.content)
                tmp_bg.close()
                tmp_bg_path = tmp_bg.name
            else:
                tmp_bg_path = bg_url

            from app.services.media.carousel_renderer import render_carousel_images
            composed = render_carousel_images(
                brand=plan.brand_id,
                title=result["title"],
                background_image=tmp_bg_path,
                slide_texts=slide_texts,
                reel_id=brand_data.get("reel_id", f"{job_id}_{plan.brand_id}"),
                user_id=plan.user_id,
            )
            if composed:
                cover_url = composed.get("coverUrl")
                slide_urls = composed.get("slideUrls", [])
                if cover_url:
                    carousel_paths = [cover_url] + slide_urls
                    # Store in brand_outputs so frontend can grab them
                    job_manager.update_brand_output(job_id, plan.brand_id, {
                        "carousel_paths": carousel_paths,
                    })
                    print(f"[TOBY] Pre-rendered {len(carousel_paths)} carousel images for {plan.brand_id}", flush=True)
            # Clean up temp file
            if bg_url.startswith("https://"):
                try:
                    import os as _os
                    _os.unlink(tmp_bg_path)
                except Exception:
                    pass
        except Exception as render_err:
            print(f"[TOBY] Pre-render warning (non-fatal): {render_err}", flush=True)

    # ── Step 7: Auto-schedule with real media URLs ───────────
    scheduler = DatabaseSchedulerService()
    reel_id = brand_data.get("reel_id", f"{job_id}_{plan.brand_id}")

    sched_result = scheduler.schedule_reel(
        user_id=plan.user_id,
        reel_id=reel_id,
        scheduled_time=datetime.fromisoformat(plan.scheduled_time),
        caption=brand_data.get("caption", result.get("caption", "")),
        yt_title=brand_data.get("yt_title"),
        platforms=_toby_platforms,
        video_path=brand_data.get("video_path"),
        thumbnail_path=brand_data.get("thumbnail_path"),
        yt_thumbnail_path=brand_data.get("yt_thumbnail_path"),
        brand=plan.brand_id,
        variant=variant,
        post_title=result["title"],
        slide_texts=slide_texts,
        carousel_paths=carousel_paths or None,
        job_id=job_id,
    )

    # Deduplication: if scheduler detected a duplicate, skip remaining steps
    if sched_result.get("deduplicated"):
        print(f"[TOBY] Skipping duplicate slot for {plan.brand_id} at {plan.scheduled_time}", flush=True)
        return None

    # ── Step 8: Mark brand as scheduled + Toby-created + record tags ──
    # Update the job's brand_output status so Jobs page shows "scheduled"
    job_manager.update_brand_output(job_id, plan.brand_id, {
        "status": "scheduled",
        "scheduled_time": plan.scheduled_time,
    })

    schedule_id = sched_result.get("schedule_id", "")
    if schedule_id:
        from app.models.scheduling import ScheduledReel
        sched = db.query(ScheduledReel).filter(
            ScheduledReel.schedule_id == schedule_id
        ).first()
        if sched and hasattr(sched, 'created_by'):
            sched.created_by = "toby"

        # Record content tags for learning
        record_content_tag(db, plan.user_id, schedule_id, plan)

    print(f"[TOBY] Scheduled {reel_id} for {plan.brand_id} at {plan.scheduled_time}", flush=True)
    return {"job_id": job_id, "brand_id": plan.brand_id, "content_type": plan.content_type, "variant": variant}


def _run_metrics_check(db: Session, user_id: str, state: TobyState):
    """Collect metrics for Toby-created posts that need scoring."""
    try:
        from app.services.analytics.metrics_collector import get_metrics_collector
        collector = get_metrics_collector()

        # Collect metrics for all brands
        from app.models.brands import Brand
        brands = db.query(Brand).filter(Brand.user_id == user_id, Brand.active == True).all()

        total_collected = 0
        expired_brands = []
        for brand in brands:
            try:
                result = collector.collect_for_brand(brand.id, user_id=user_id)
                # Gap 1: Track brands with expired tokens
                if isinstance(result, dict) and result.get("token_expired"):
                    expired_brands.append(brand.id)
                    continue
                total_collected += result.get("updated", 0) if isinstance(result, dict) else 0
            except Exception as e:
                print(f"[TOBY] Metrics collection failed for {brand.id}: {e}", flush=True)

        # Gap 1: Store expired brand IDs on state for analysis check to skip
        if expired_brands:
            state._token_expired_brands = expired_brands
            print(f"[TOBY] Token expired for brands: {expired_brands} — skipping strategy score updates", flush=True)

        if total_collected > 0:
            db.add(TobyActivityLog(
                user_id=user_id,
                action_type="metrics_collected",
                description=f"Collected metrics for {total_collected} posts",
                level="info",
                action_metadata={"count": total_collected},
                created_at=datetime.now(timezone.utc),
            ))
    except Exception as e:
        print(f"[TOBY] Metrics check error: {e}", flush=True)


def _run_analysis_check(db: Session, user_id: str, state: TobyState):
    """Score posts and update learning engine."""
    from app.services.toby.analysis_engine import score_pending_posts
    from app.services.toby.learning_engine import update_strategy_score, update_experiment_results, correct_preliminary_score

    # Score 48h posts
    scored_48h = score_pending_posts(db, user_id, phase="48h")

    # v3.0: Generate per-post learning events at 48h so users see Toby learning quickly
    if scored_48h > 0:
        try:
            _generate_48h_learning_events(db, user_id, scored_48h)
        except Exception as e:
            print(f"[TOBY] Learning event generation failed for {user_id}: {e}", flush=True)

        # Phase 2: Update strategy scores at 48h with weight=0.6 (preliminary)
        try:
            tags_48h = (
                db.query(TobyContentTag)
                .filter(
                    TobyContentTag.user_id == user_id,
                    TobyContentTag.score_phase == "48h",
                    TobyContentTag.toby_score.isnot(None),
                    TobyContentTag.metrics_unreliable != True,
                    TobyContentTag.human_modified != True,
                    TobyContentTag.preliminary_score.is_(None),  # Not yet recorded as preliminary
                )
                .order_by(TobyContentTag.scored_at.desc())
                .limit(scored_48h)
                .all()
            )
            for tag in tags_48h:
                # Store preliminary score for later correction
                tag.preliminary_score = tag.toby_score
                tag.preliminary_scored_at = datetime.now(timezone.utc)

                for dim, val in [
                    ("personality", tag.personality),
                    ("topic", tag.topic_bucket),
                    ("hook", tag.hook_strategy),
                    ("title_format", tag.title_format),
                    ("visual_style", tag.visual_style),
                ]:
                    if val:
                        update_strategy_score(
                            db, user_id, tag.brand_id, tag.content_type,
                            dim, val, tag.toby_score, weight=0.6,
                        )
        except Exception as e:
            print(f"[TOBY] 48h strategy score update failed for {user_id}: {e}", flush=True)

    # Score 7d posts
    scored_7d = score_pending_posts(db, user_id, phase="7d")

    if scored_7d > 0:
        # Update strategy scores from final (7d) scores
        # E5: Exclude posts flagged as metrics_unreliable
        tags = (
            db.query(TobyContentTag)
            .filter(
                TobyContentTag.user_id == user_id,
                TobyContentTag.score_phase == "7d",
                TobyContentTag.toby_score.isnot(None),
                TobyContentTag.metrics_unreliable != True,
                TobyContentTag.human_modified != True,
            )
            .order_by(TobyContentTag.scored_at.desc())
            .limit(scored_7d)
            .all()
        )

        for tag in tags:
            # Phase 2: Correct preliminary 48h score before adding final 7d score
            if tag.preliminary_score is not None:
                correct_preliminary_score(
                    db, user_id, tag.brand_id, tag.content_type,
                    tag, tag.toby_score,
                )
            else:
                # No preliminary score — add final with full weight
                for dim, val in [
                    ("personality", tag.personality),
                    ("topic", tag.topic_bucket),
                    ("hook", tag.hook_strategy),
                    ("title_format", tag.title_format),
                    ("visual_style", tag.visual_style),
                ]:
                    if val:
                        update_strategy_score(
                            db, user_id, tag.brand_id, tag.content_type,
                            dim, val, tag.toby_score, weight=1.0,
                        )

            # Update experiment if linked
            for dim, val in [
                ("personality", tag.personality),
                ("topic", tag.topic_bucket),
                ("hook", tag.hook_strategy),
                ("title_format", tag.title_format),
                ("visual_style", tag.visual_style),
            ]:
                if val and tag.experiment_id:
                    update_experiment_results(
                        db, user_id, tag.content_type,
                        dim, val, tag.toby_score,
                    )

            # v3: Record combo performance for strategy-combination tracking
            try:
                from app.services.toby.feature_flags import is_enabled
                if is_enabled("memory_system"):
                    _record_strategy_combo(db, user_id, tag)
            except Exception:
                pass  # Non-critical — don't break scoring


def start_toby_scheduler(scheduler):
    """Register Toby's 5-minute tick with APScheduler."""
    scheduler.add_job(
        toby_tick,
        'interval',
        minutes=5,
        id='toby_orchestrator',
        replace_existing=True,
        max_instances=1,  # F1: Prevent concurrent tick execution
    )
    print("🤖 Toby orchestrator registered (5-minute ticks)", flush=True)


def _log_debounced(db: Session, user_id: str, action_type: str,
                   description: str, level: str = "error"):
    """D1: Log an error only if it hasn't been logged recently for this action."""
    key = f"{user_id}:{action_type}"
    now = datetime.now(timezone.utc)
    last = _error_log_timestamps.get(key)

    if last and (now - last).total_seconds() < ERROR_LOG_DEBOUNCE_MINUTES * 60:
        return  # Suppressed — already logged recently

    _error_log_timestamps[key] = now
    try:
        db.add(TobyActivityLog(
            user_id=user_id,
            action_type=action_type,
            description=description,
            level=level,
            created_at=now,
        ))
        db.commit()
    except Exception:
        db.rollback()


def _sanitize_error(msg: str) -> str:
    """Strip internal service names and URLs from user-facing error messages."""
    import re
    msg = re.sub(r'https?://[^\s)]+', '', msg)          # strip URLs
    msg = re.sub(r'(?i)\bDEAPI\b', 'AI Image Generation', msg)
    msg = re.sub(r'(?i)\bDeepSeek\b', 'AI Reasoning Model', msg)
    msg = re.sub(r'\s{2,}', ' ', msg).strip()            # collapse whitespace
    return msg


def _execute_plans_sequential(db: Session, plans: list, user_id: str, state: TobyState) -> tuple:
    """Execute content plans one at a time (steady-state mode). Returns (count, job_details)."""
    generated = 0
    job_details: list[dict] = []
    for plan in plans:
        try:
            result = _execute_content_plan(db, plan)
            generated += 1
            _record_generation(user_id, plan.brand_id)
            _increment_budget(state)
            if result:
                job_details.append(result)
        except Exception as e:
            print(f"[TOBY] Content generation failed for {plan.brand_id}: {e}", flush=True)
            clean = _sanitize_error(str(e)[:300])
            db.add(TobyActivityLog(
                user_id=user_id,
                action_type="error",
                description=f"Content generation failed for {plan.brand_id}: {clean}",
                level="error",
                created_at=datetime.now(timezone.utc),
            ))
    return generated, job_details


def _execute_plans_parallel(plans: list, user_id: str, state: TobyState) -> int:
    """Execute content plans in parallel using separate DB sessions per thread.

    Each plan gets its own DB session so SQLAlchemy sessions stay thread-local.
    """
    from app.db_connection import SessionLocal

    max_workers = min(len(plans), BOOTSTRAP_MAX_PARALLEL_WORKERS)
    generated = 0
    print(f"[TOBY] Parallel generation: {len(plans)} plans, {max_workers} workers", flush=True)

    def _run_one(plan):
        """Run a single content plan in its own DB session."""
        thread_db = SessionLocal()
        try:
            job_detail = _execute_content_plan(thread_db, plan)
            _record_generation(plan.user_id, plan.brand_id)
            thread_db.commit()
            return {"success": True, "brand_id": plan.brand_id, "job_detail": job_detail}
        except Exception as e:
            thread_db.rollback()
            print(f"[TOBY] Parallel gen failed for {plan.brand_id}: {e}", flush=True)
            clean = _sanitize_error(str(e)[:300])
            thread_db.add(TobyActivityLog(
                user_id=plan.user_id,
                action_type="error",
                description=f"Content generation failed for {plan.brand_id}: {clean}",
                level="error",
                created_at=datetime.now(timezone.utc),
            ))
            try:
                thread_db.commit()
            except Exception:
                thread_db.rollback()
            return {"success": False, "brand_id": plan.brand_id, "error": str(e)}
        finally:
            thread_db.close()

    job_details: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_run_one, plan): plan for plan in plans}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            if result["success"]:
                generated += 1
                _increment_budget(state)
                print(f"[TOBY] ✓ Parallel gen completed for {result['brand_id']}", flush=True)
                if result.get("job_detail"):
                    job_details.append(result["job_detail"])

    print(f"[TOBY] Parallel generation done: {generated}/{len(plans)} succeeded", flush=True)
    return generated, job_details


def _cleanup_supabase_on_failure(job_id: str, brand_id: str):
    """D4: Clean up orphaned Supabase storage files when media generation fails."""
    try:
        from app.services.storage.supabase_storage import get_supabase_storage
        storage = get_supabase_storage()
        # Clean up any files uploaded for this job
        prefix = f"reels/{brand_id}/{job_id}"
        storage.delete_folder(prefix)
        print(f"[TOBY] Cleaned up Supabase files for failed job {job_id}", flush=True)
    except Exception as e:
        print(f"[TOBY] Supabase cleanup warning (non-fatal): {e}", flush=True)


# ---------------------------------------------------------------------------
#  Generation rate-limiting helpers
# ---------------------------------------------------------------------------

def _prune_old_timestamps(key: str):
    """Remove generation timestamps older than 1 hour."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    if key in _recent_generations:
        _recent_generations[key] = [t for t in _recent_generations[key] if t > cutoff]

def _brand_at_cooldown(user_id: str, brand_id: str, aggressive: bool = False) -> bool:
    """Return True if this brand has been generated for too recently."""
    cooldown = BOOTSTRAP_COOLDOWN_MINUTES if aggressive else GENERATION_COOLDOWN_MINUTES
    max_per_brand = BOOTSTRAP_MAX_PER_BRAND_PER_HOUR if aggressive else MAX_GENERATIONS_PER_BRAND_PER_HOUR

    key = f"{user_id}:{brand_id}"
    with _generation_lock:
        _prune_old_timestamps(key)
        timestamps = _recent_generations.get(key, [])
    if not timestamps:
        return False
    # Check cooldown (min gap between consecutive generations for same brand)
    last = max(timestamps)
    if (datetime.now(timezone.utc) - last).total_seconds() < cooldown * 60:
        return True
    # Check hourly cap per brand
    return len(timestamps) >= max_per_brand

def _user_at_hourly_cap(user_id: str, aggressive: bool = False) -> bool:
    """Return True if the user has hit the hourly generation cap across all brands."""
    max_per_user = BOOTSTRAP_MAX_PER_USER_PER_HOUR if aggressive else MAX_GENERATIONS_PER_USER_PER_HOUR
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    total = 0
    with _generation_lock:
        for key, timestamps in _recent_generations.items():
            if key.startswith(f"{user_id}:"):
                total += sum(1 for t in timestamps if t > cutoff)
    return total >= max_per_user

def _record_generation(user_id: str, brand_id: str):
    """Record that a piece of content was generated for rate-limiting."""
    key = f"{user_id}:{brand_id}"
    with _generation_lock:
        if key not in _recent_generations:
            _recent_generations[key] = []
        _recent_generations[key].append(datetime.now(timezone.utc))


def _check_budget_exceeded(state: TobyState) -> bool:
    """Section 13.2: Check if daily budget is exceeded.

    Returns True if generation should be skipped.
    """
    from app.services.toby.feature_flags import is_enabled
    if not is_enabled("budget_enforcement"):
        return False

    if not state.daily_budget_cents or state.daily_budget_cents <= 0:
        return False  # No budget set — unlimited

    # Reset budget counter if it's a new day
    now = datetime.now(timezone.utc)
    if state.budget_reset_at:
        reset_at = state.budget_reset_at
        if reset_at.tzinfo is None:
            reset_at = reset_at.replace(tzinfo=timezone.utc)
        if now.date() > reset_at.date():
            state.spent_today_cents = 0
            state.budget_reset_at = now

    spent = state.spent_today_cents or 0
    if spent >= state.daily_budget_cents:
        return True

    return False


def _increment_budget(state: TobyState, cost_cents: int = 5):
    """Section 13.2: Increment daily spend counter after content generation.

    Default cost: 5 cents per generation (approximate DeepSeek + image API cost).
    """
    from app.services.toby.feature_flags import is_enabled
    if not is_enabled("budget_enforcement"):
        return

    state.spent_today_cents = (state.spent_today_cents or 0) + cost_cents
    if not state.budget_reset_at:
        state.budget_reset_at = datetime.now(timezone.utc)


def _generate_48h_learning_events(db: Session, user_id: str, count: int):
    """Generate human-readable learning event logs for newly 48h-scored posts.

    v3.0: These fire within 48h of publishing so users see Toby actively learning,
    rather than waiting 7 days for strategy updates.
    """
    from sqlalchemy import func

    # Get per-brand average scores for comparison
    brand_avg_results = (
        db.query(TobyContentTag.brand_id, func.avg(TobyContentTag.toby_score))
        .filter(
            TobyContentTag.user_id == user_id,
            TobyContentTag.toby_score.isnot(None),
        )
        .group_by(TobyContentTag.brand_id)
        .all()
    )
    brand_avgs = {bid: float(avg) for bid, avg in brand_avg_results if avg}

    # Fetch the recently 48h-scored tags (in order of scoring time)
    recently_scored = (
        db.query(TobyContentTag)
        .filter(
            TobyContentTag.user_id == user_id,
            TobyContentTag.score_phase == "48h",
            TobyContentTag.toby_score.isnot(None),
            TobyContentTag.metrics_unreliable != True,
        )
        .order_by(TobyContentTag.scored_at.desc())
        .limit(count)
        .all()
    )

    for tag in recently_scored:
        lesson = _generate_learning_lesson(tag, brand_avgs.get(tag.brand_id, 50.0))
        if lesson:
            db.add(TobyActivityLog(
                user_id=user_id,
                action_type="learning_event",
                description=lesson,
                level="info",
                action_metadata={
                    "schedule_id": tag.schedule_id,
                    "brand_id": tag.brand_id,
                    "score": round(tag.toby_score, 1) if tag.toby_score else None,
                    "personality": tag.personality,
                    "hook": tag.hook_strategy,
                    "topic": tag.topic_bucket,
                    "score_phase": "48h",
                },
                created_at=datetime.now(timezone.utc),
            ))
    db.flush()


def _generate_learning_lesson(tag, brand_avg: float) -> str:
    """Generate a human-readable lesson from a scored post (rule-based, no LLM cost)."""
    if not tag.toby_score:
        return ""

    score = tag.toby_score
    ratio = score / brand_avg if brand_avg > 0 else 1.0

    parts = []
    if tag.personality:
        parts.append(tag.personality.replace("_", " "))
    if tag.hook_strategy:
        parts.append(f"{tag.hook_strategy.replace('_', ' ')} hook")
    if tag.topic_bucket:
        parts.append(tag.topic_bucket.replace("_", " "))

    strategy = " + ".join(parts) if parts else "this strategy"

    if ratio >= 1.3:
        pct = round((ratio - 1) * 100)
        return f"Strong signal: {strategy} outperformed brand average by {pct}% — boosting this pattern"
    elif ratio >= 1.1:
        pct = round((ratio - 1) * 100)
        return f"Positive signal: {strategy} beat average by {pct}% — adding to winning patterns"
    elif ratio <= 0.7:
        pct = round((1 - ratio) * 100)
        return f"Weak signal: {strategy} underperformed by {pct}% — Toby will deprioritize this"
    else:
        return f"Neutral result: {strategy} performed close to average (score: {round(score, 1)})"


def _record_strategy_combo(db: Session, user_id: str, tag):
    """v3: Record strategy-combination performance for combo tracking."""
    from app.models.toby_cognitive import TobyStrategyCombos

    combo_key = f"{tag.personality}|{tag.topic_bucket}|{tag.hook_strategy}"
    existing = (
        db.query(TobyStrategyCombos)
        .filter(
            TobyStrategyCombos.user_id == user_id,
            TobyStrategyCombos.brand_id == tag.brand_id,
            TobyStrategyCombos.combo_key == combo_key,
        )
        .first()
    )

    if existing:
        n = existing.sample_count + 1
        existing.total_score += tag.toby_score
        existing.avg_score = existing.total_score / n
        existing.sample_count = n
        existing.last_used_at = datetime.now(timezone.utc)
    else:
        combo = TobyStrategyCombos(
            user_id=user_id,
            brand_id=tag.brand_id,
            content_type=tag.content_type,
            combo_key=combo_key,
            dimensions={
                "personality": tag.personality,
                "topic": tag.topic_bucket,
                "hook": tag.hook_strategy,
                "title_format": tag.title_format,
                "visual_style": tag.visual_style,
            },
            sample_count=1,
            total_score=tag.toby_score,
            avg_score=tag.toby_score,
            last_used_at=datetime.now(timezone.utc),
        )
        db.add(combo)
