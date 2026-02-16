"""Maestro scheduling helpers — auto_schedule_job and schedule_all_ready_reels."""


def auto_schedule_job(job_id: str):
    """
    Auto-schedule all brand outputs from a completed job.

    For each brand with completed output:
      1. Find the next available scheduling slot
      2. Create a ScheduledReel entry
      3. The publishing daemon handles the rest
    """
    import copy
    from app.db_connection import get_db_session
    from app.services.content.job_manager import JobManager
    from app.services.publishing.scheduler import DatabaseSchedulerService
    from sqlalchemy.orm.attributes import flag_modified

    with get_db_session() as db:
        manager = JobManager(db)
        job = manager.get_job(job_id)

        if not job:
            print(f"[AUTO-SCHEDULE] Job {job_id} not found", flush=True)
            return

        if job.status not in ("completed",):
            print(f"[AUTO-SCHEDULE] Job {job_id} not completed (status={job.status}), skipping", flush=True)
            return

        variant = job.variant or "dark"
        is_post = (variant == "post")
        scheduler = DatabaseSchedulerService()
        scheduled_count = 0
        brand_outputs = copy.deepcopy(job.brand_outputs or {})

        for brand, output in brand_outputs.items():
            if output.get("status") != "completed":
                continue

            reel_id = output.get("reel_id")
            video_path = output.get("video_path")
            thumbnail_path = output.get("thumbnail_path")
            yt_thumbnail_path = output.get("yt_thumbnail_path")
            caption = output.get("caption", "")
            yt_title = output.get("yt_title")
            post_title = output.get("title", "")
            slide_texts = output.get("slide_texts", [])

            if is_post:
                # Posts only need reel_id + thumbnail_path (no video)
                if not reel_id:
                    continue
                # Verify thumbnail exists (strip query string from URL-style paths)
                from pathlib import Path as _Path
                if thumbnail_path:
                    clean_thumb = thumbnail_path.split('?')[0]
                    thumb_abs = _Path(clean_thumb.lstrip('/'))
                    if not thumb_abs.exists():
                        print(f"[AUTO-SCHEDULE] ⚠️ Post image missing for {brand}: {thumb_abs} — skipping", flush=True)
                        continue

                # ── Compose cover + text slides for the post ──
                try:
                    from app.services.media.post_compositor import compose_cover_slide
                    from app.services.media.text_slide_compositor import compose_text_slide

                    uid8 = reel_id[:8] if reel_id else "unknown"
                    cover_out = f"output/posts/post_{brand}_{uid8}.png"
                    # Normalize path: strip leading '/' so Image.open resolves relative to CWD
                    bg_path = thumbnail_path.lstrip('/') if thumbnail_path else thumbnail_path
                    compose_cover_slide(bg_path, post_title, brand, cover_out)
                    thumbnail_path = cover_out

                    carousel_paths = []
                    for idx, stxt in enumerate(slide_texts):
                        is_last = idx == len(slide_texts) - 1
                        slide_out = f"output/posts/post_{brand}_{uid8}_slide{idx}.png"
                        compose_text_slide(brand, stxt, slide_texts, is_last, slide_out)
                        carousel_paths.append(slide_out)
                except Exception as comp_err:
                    import traceback
                    print(f"[AUTO-SCHEDULE] ⚠️ Slide composition failed for {brand}: {comp_err}", flush=True)
                    traceback.print_exc()
                    carousel_paths = []
            else:
                # Reels need reel_id + video_path
                if not reel_id or not video_path:
                    continue

                # Verify files actually exist before scheduling (prevents "Video not found" errors)
                from pathlib import Path as _Path
                video_abs = _Path(video_path.lstrip('/'))
                thumbnail_abs = _Path(thumbnail_path.lstrip('/')) if thumbnail_path else None
                if not video_abs.exists():
                    print(f"[AUTO-SCHEDULE] ⚠️ Video file missing for {brand}: {video_abs} — skipping", flush=True)
                    continue
                if thumbnail_abs and not thumbnail_abs.exists():
                    print(f"[AUTO-SCHEDULE] ⚠️ Thumbnail missing for {brand}: {thumbnail_abs} — skipping", flush=True)
                    continue

            try:
                # Use post-specific slots for posts
                if is_post:
                    slot = scheduler.get_next_available_post_slot(brand)
                    sched_platforms = job.platforms or ["instagram", "facebook"]
                else:
                    slot = scheduler.get_next_available_slot(brand, variant)
                    sched_platforms = job.platforms or ["instagram", "facebook", "youtube"]

                # Strip YouTube from platforms if not connected for this brand
                if "youtube" in sched_platforms:
                    from app.services.youtube.publisher import get_youtube_credentials_for_brand
                    yt_creds = get_youtube_credentials_for_brand(brand, db)
                    if not yt_creds:
                        sched_platforms = [p for p in sched_platforms if p != "youtube"]
                        print(f"[AUTO-SCHEDULE] ℹ️ YouTube not connected for {brand} — scheduling without YouTube", flush=True)

                scheduler.schedule_reel(
                    user_id=job.user_id,
                    reel_id=reel_id,
                    scheduled_time=slot,
                    caption=caption,
                    yt_title=yt_title if not is_post else None,
                    platforms=sched_platforms,
                    video_path=video_path,
                    thumbnail_path=thumbnail_path,
                    yt_thumbnail_path=yt_thumbnail_path if not is_post else None,
                    user_name="Maestro",
                    brand=brand,
                    variant=variant,
                    post_title=post_title if is_post else None,
                    slide_texts=slide_texts if is_post else None,
                    carousel_paths=carousel_paths if is_post else None,
                    job_id=job_id,
                )

                # Mark brand output as scheduled so it's not re-scheduled
                brand_outputs[brand]["status"] = "scheduled"
                brand_outputs[brand]["scheduled_time"] = slot.isoformat()

                scheduled_count += 1
                content_label = "post" if is_post else "reel"
                print(
                    f"[AUTO-SCHEDULE] {brand}/{variant} → {slot.strftime('%Y-%m-%d %H:%M')} ({content_label} {reel_id})",
                    flush=True,
                )
            except Exception as e:
                print(f"[AUTO-SCHEDULE] Failed to schedule {brand}: {e}", flush=True)

        # Persist all brand_outputs changes at once
        if scheduled_count > 0:
            job.brand_outputs = brand_outputs
            flag_modified(job, "brand_outputs")
            db.commit()

        print(f"[AUTO-SCHEDULE] Job {job_id}: {scheduled_count}/{len(job.brand_outputs or {})} brands scheduled", flush=True)


def schedule_all_ready_reels() -> int:
    """
    Find ALL completed jobs with brand outputs still in 'completed' status
    and auto-schedule them into the next available slot.

    This catches any reels that were generated but never scheduled
    (e.g., from before auto-scheduling was added, or from manual accepts).

    Returns the number of brand-reels scheduled.
    """
    import copy
    from app.db_connection import SessionLocal
    from app.models import GenerationJob
    from app.services.publishing.scheduler import DatabaseSchedulerService
    from sqlalchemy.orm.attributes import flag_modified

    total_scheduled = 0
    db = SessionLocal()
    try:
        # Find all completed OR failed jobs (failed jobs may have completed brand outputs
        # that weren't scheduled due to earlier bugs)
        completed_jobs = (
            db.query(GenerationJob)
            .filter(GenerationJob.status.in_(["completed", "failed"]))
            .all()
        )

        if not completed_jobs:
            return 0

        scheduler = DatabaseSchedulerService()

        for job in completed_jobs:
            variant = job.variant or "dark"
            brand_outputs = copy.deepcopy(job.brand_outputs or {})
            job_changed = False
            is_post = (variant == "post")

            for brand, output in brand_outputs.items():
                if output.get("status") != "completed":
                    continue  # Already scheduled, failed, or still generating

                reel_id = output.get("reel_id")
                video_path = output.get("video_path")
                thumbnail_path = output.get("thumbnail_path")
                post_title = output.get("title", "")
                slide_texts = output.get("slide_texts", [])
                carousel_paths = []

                if is_post:
                    # Posts only need reel_id (image-based, no video)
                    if not reel_id:
                        continue
                    if thumbnail_path:
                        from pathlib import Path as _Path
                        clean_thumb = thumbnail_path.split('?')[0]
                        thumb_abs = _Path(clean_thumb.lstrip('/'))
                        if not thumb_abs.exists():
                            print(f"[READY-SCHEDULE] ⚠️ Post image missing for {brand}: {thumb_abs} — skipping", flush=True)
                            continue

                    # ── Compose cover + text slides for the post ──
                    try:
                        from app.services.media.post_compositor import compose_cover_slide
                        from app.services.media.text_slide_compositor import compose_text_slide

                        uid8 = reel_id[:8] if reel_id else "unknown"
                        cover_out = f"output/posts/post_{brand}_{uid8}.png"
                        # Normalize path: strip leading '/' so Image.open resolves relative to CWD
                        bg_path = thumbnail_path.lstrip('/') if thumbnail_path else thumbnail_path
                        compose_cover_slide(bg_path, post_title, brand, cover_out)
                        thumbnail_path = cover_out

                        for idx, stxt in enumerate(slide_texts):
                            is_last_slide = idx == len(slide_texts) - 1
                            slide_out = f"output/posts/post_{brand}_{uid8}_slide{idx}.png"
                            compose_text_slide(brand, stxt, slide_texts, is_last_slide, slide_out)
                            carousel_paths.append(slide_out)
                    except Exception as comp_err:
                        import traceback
                        print(f"[READY-SCHEDULE] ⚠️ Slide composition failed for {brand}: {comp_err}", flush=True)
                        traceback.print_exc()
                        carousel_paths = []
                else:
                    # Reels need reel_id + video_path
                    if not reel_id or not video_path:
                        continue
                    # Verify video file actually exists before scheduling
                    from pathlib import Path as _Path
                    video_abs = _Path(video_path.lstrip('/'))
                    if not video_abs.exists():
                        print(f"[READY-SCHEDULE] ⚠️ Video missing for {brand}: {video_abs} — skipping", flush=True)
                        continue

                # Check if already in scheduled_reels (safety check)
                from app.models import ScheduledReel
                existing = (
                    db.query(ScheduledReel)
                    .filter(ScheduledReel.reel_id == reel_id)
                    .first()
                )
                if existing:
                    # Already scheduled — just update brand_output status
                    brand_outputs[brand]["status"] = "scheduled"
                    job_changed = True
                    continue

                try:
                    if is_post:
                        slot = scheduler.get_next_available_post_slot(brand)
                        sched_platforms = job.platforms or ["instagram", "facebook"]
                    else:
                        slot = scheduler.get_next_available_slot(brand, variant)
                        sched_platforms = job.platforms or ["instagram", "facebook", "youtube"]

                    # Strip YouTube from platforms if not connected for this brand
                    if "youtube" in sched_platforms:
                        from app.services.youtube.publisher import get_youtube_credentials_for_brand
                        yt_creds = get_youtube_credentials_for_brand(brand, db)
                        if not yt_creds:
                            sched_platforms = [p for p in sched_platforms if p != "youtube"]
                            print(f"[READY-SCHEDULE] ℹ️ YouTube not connected for {brand} — scheduling without YouTube", flush=True)

                    scheduler.schedule_reel(
                        user_id=job.user_id,
                        reel_id=reel_id,
                        scheduled_time=slot,
                        caption=output.get("caption", ""),
                        yt_title=output.get("yt_title") if not is_post else None,
                        platforms=sched_platforms,
                        video_path=video_path,
                        thumbnail_path=thumbnail_path,
                        yt_thumbnail_path=output.get("yt_thumbnail_path") if not is_post else None,
                        user_name="Maestro",
                        brand=brand,
                        variant=variant,
                        carousel_paths=carousel_paths if is_post else None,
                        job_id=job.job_id,
                    )
                    brand_outputs[brand]["status"] = "scheduled"
                    brand_outputs[brand]["scheduled_time"] = slot.isoformat()
                    job_changed = True
                    total_scheduled += 1
                    content_label = "post" if is_post else "reel"
                    print(
                        f"[READY-SCHEDULE] {brand}/{variant} → {slot.strftime('%Y-%m-%d %H:%M')} ({content_label} {reel_id})",
                        flush=True,
                    )
                except Exception as e:
                    print(f"[READY-SCHEDULE] Failed {brand}: {e}", flush=True)

            if job_changed:
                job.brand_outputs = brand_outputs
                flag_modified(job, "brand_outputs")
                db.commit()

    except Exception as e:
        print(f"[READY-SCHEDULE] Error: {e}", flush=True)
    finally:
        db.close()

    if total_scheduled > 0:
        print(f"[READY-SCHEDULE] Total: {total_scheduled} brand-reels auto-scheduled", flush=True)

    return total_scheduled
