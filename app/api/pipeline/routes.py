"""Pipeline API — unified content hub: approval gate + full job lifecycle."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db_connection import get_db, SessionLocal
from app.api.auth.middleware import get_current_user
from app.models.jobs import GenerationJob
from app.models.scheduling import ScheduledReel
from app.api.pipeline.schemas import (
    ApproveRequest,
    RejectRequest,
    BulkApproveRequest,
    BulkRejectRequest,
    EditRequest,
    RegenerateRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


def _compute_lifecycle(job: GenerationJob) -> str:
    """Compute the effective lifecycle stage of a job for the pipeline view.

    Returns one of: pending_review, generating, scheduled, published, rejected, failed
    """
    # If job is still actively processing, show as generating
    # (regardless of pipeline_status which is set to "pending" at creation)
    if job.status in ("pending", "generating"):
        return "generating"
    if job.status == "failed":
        return "failed"
    if job.status == "cancelled":
        return "failed"

    # Job finished processing — now check pipeline approval gate
    if job.pipeline_status == "pending":
        return "pending_review"
    if job.pipeline_status == "rejected":
        return "rejected"

    # Check brand outputs for published/scheduled state
    outputs = job.brand_outputs or {}
    total = len(job.brands or [])
    if total == 0:
        return "generating"

    published_count = sum(1 for o in outputs.values() if isinstance(o, dict) and o.get("status") == "published")
    scheduled_count = sum(1 for o in outputs.values() if isinstance(o, dict) and o.get("status") == "scheduled")

    if published_count == total:
        return "published"
    if (scheduled_count + published_count) >= total and total > 0:
        return "scheduled"
    if scheduled_count > 0 or published_count > 0:
        return "scheduled"

    # Approved but not yet scheduled (edge case)
    if job.pipeline_status == "approved":
        return "scheduled"

    # Completed but no pipeline_status (manual jobs ready to schedule)
    if job.status == "completed":
        return "scheduled"

    return "generating"


def _serialize_pipeline_item(job: GenerationJob) -> dict:
    """Serialize a GenerationJob for the pipeline API response."""
    return {
        "job_id": job.job_id,
        "id": job.job_id,
        "title": job.title,
        "caption": job.caption,
        "variant": job.variant,
        "content_format": job.content_format,
        "content_lines": job.content_lines or [],
        "brands": job.brands or [],
        "platforms": job.platforms or [],
        "pipeline_status": job.pipeline_status,
        "pipeline_reviewed_at": job.pipeline_reviewed_at.isoformat() if job.pipeline_reviewed_at else None,
        "pipeline_batch_id": job.pipeline_batch_id,
        "quality_score": job.quality_score,
        "created_by": job.created_by or "user",
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "status": job.status,
        "lifecycle": _compute_lifecycle(job),
        "brand_outputs": job.brand_outputs or {},
        "progress_percent": getattr(job, "progress_percent", None),
        "image_source_mode": (job.format_b_data or {}).get("image_source_mode") if job.content_format == "format_b" else None,
        "thumbnail_image_source_mode": (job.format_b_data or {}).get("thumbnail_image_source_mode") if job.content_format == "format_b" else None,
    }


@router.get("")
async def list_pipeline_items(
    status: Optional[str] = Query(
        "generating",
        pattern="^(pending_review|generating|scheduled|published|rejected|failed|all)$",
    ),
    brand: Optional[str] = None,
    content_type: Optional[str] = Query(None, pattern="^(all|reels|carousels|threads)$"),
    batch_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List all content items for the pipeline view."""
    query = db.query(GenerationJob).filter(
        GenerationJob.user_id == user["id"],
    )

    if brand:
        from sqlalchemy import cast, Text
        query = query.filter(GenerationJob.brands.cast(Text).contains(brand))

    if content_type and content_type != "all":
        if content_type == "reels":
            query = query.filter(GenerationJob.variant.in_(["light", "dark", "format_b"]))
        elif content_type == "carousels":
            query = query.filter(GenerationJob.variant == "post")
        elif content_type == "threads":
            query = query.filter(GenerationJob.variant == "threads")

    if batch_id:
        query = query.filter(GenerationJob.pipeline_batch_id == batch_id)

    # Fetch all matching jobs, then apply lifecycle filter in-memory
    # (lifecycle depends on multiple columns + brand_outputs JSON, not a single SQL column)
    all_jobs = query.order_by(GenerationJob.created_at.desc()).all()

    if status and status != "all":
        all_jobs = [j for j in all_jobs if _compute_lifecycle(j) == status]

    total = len(all_jobs)
    items = all_jobs[(page - 1) * limit : page * limit]

    return {
        "items": [_serialize_pipeline_item(j) for j in items],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/stats")
async def get_pipeline_stats(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get pipeline stats grouped by lifecycle stage.

    Uses lightweight SQL queries instead of loading all job objects to minimize
    database egress.
    """
    from sqlalchemy import func, case, and_

    # Single query to count jobs by (status, pipeline_status, variant) — no JSONB loaded
    rows = (
        db.query(
            GenerationJob.status,
            GenerationJob.pipeline_status,
            GenerationJob.variant,
            func.count().label("cnt"),
        )
        .filter(GenerationJob.user_id == user["id"])
        .group_by(
            GenerationJob.status,
            GenerationJob.pipeline_status,
            GenerationJob.variant,
        )
        .all()
    )

    counts = {"pending_review": 0, "generating": 0, "scheduled": 0, "published": 0, "rejected": 0, "failed": 0}
    content_breakdown = {"reels": 0, "carousels": 0, "threads": 0}

    for status, pipeline_status, variant, cnt in rows:
        # Mirror _compute_lifecycle logic
        if status in ("pending", "generating"):
            lifecycle = "generating"
        elif status in ("failed", "cancelled"):
            lifecycle = "failed"
        elif pipeline_status == "pending":
            lifecycle = "pending_review"
        elif pipeline_status == "rejected":
            lifecycle = "rejected"
        elif pipeline_status == "approved" or status == "completed":
            lifecycle = "scheduled"
        else:
            lifecycle = "generating"

        if lifecycle in counts:
            counts[lifecycle] += cnt

        if lifecycle in ("scheduled", "pending_review"):
            v = variant or ""
            if v in ("light", "dark", "format_b"):
                content_breakdown["reels"] += cnt
            elif v == "post":
                content_breakdown["carousels"] += cnt
            elif v == "threads":
                content_breakdown["threads"] += cnt

    # Get the latest scheduled_time for this user
    latest_scheduled = (
        db.query(ScheduledReel.scheduled_time)
        .filter(
            ScheduledReel.user_id == user["id"],
            ScheduledReel.status == "scheduled",
        )
        .order_by(ScheduledReel.scheduled_time.desc())
        .first()
    )
    scheduled_until = latest_scheduled[0].isoformat() if latest_scheduled else None

    reviewed = counts["published"] + counts["scheduled"] + counts["rejected"]
    approved = counts["published"] + counts["scheduled"]
    rate = round((approved / reviewed * 100) if reviewed > 0 else 0)

    return {
        **counts,
        "rate": rate,
        "total": sum(counts.values()),
        "content_breakdown": content_breakdown,
        "scheduled_until": scheduled_until,
    }


def _approve_single_job(
    job: GenerationJob,
    db: Session,
    user: dict,
    caption_override: Optional[str] = None,
) -> dict:
    """Approve a single pipeline item and auto-schedule it.

    Returns dict with approval results.
    """
    from app.services.publishing.scheduler import DatabaseSchedulerService

    job.pipeline_status = "approved"
    job.pipeline_reviewed_at = datetime.now(timezone.utc)
    if caption_override is not None:
        job.caption = caption_override

    scheduler = DatabaseSchedulerService()
    scheduled_results = []

    variant = job.variant or "light"

    for brand_name in (job.brands or []):
        raw_brand_data = (job.brand_outputs or {}).get(brand_name, {})
        # Multi-content jobs store brand_outputs[brand] as a list of dicts;
        # single-content jobs store it as a plain dict.
        brand_items: list[dict] = (
            raw_brand_data if isinstance(raw_brand_data, list) else [raw_brand_data]
        )

        for brand_data in brand_items:
            if not isinstance(brand_data, dict):
                continue
            if brand_data.get("status") not in ("completed", "scheduled"):
                continue

            # Threads content uses post slots, not reel slots
            if variant == "threads":
                slot_time = scheduler.get_next_available_post_slot(brand=brand_name)
            else:
                slot_time = scheduler.get_next_available_slot(
                    brand=brand_name,
                    variant=variant,
                    user_id=user["id"],
                )

            caption = caption_override or job.caption or brand_data.get("caption", "")

            # Prefer per-brand slide_texts (populated by batch generation)
            # over job-level content_lines (which may be empty for auto carousels)
            slide_texts = brand_data.get("slide_texts") or job.content_lines

            # Build a per-item reel_id so multi-content items get unique IDs
            item_idx = brand_data.get("content_index")
            base_reel_id = brand_data.get("reel_id", f"{job.job_id}_{brand_name}")
            reel_id = f"{base_reel_id}_{item_idx}" if item_idx is not None else base_reel_id

            result = scheduler.schedule_reel(
                user_id=user["id"],
                reel_id=reel_id,
                scheduled_time=slot_time,
                caption=caption,
                platforms=job.platforms or ["instagram"],
                video_path=brand_data.get("video_path"),
                thumbnail_path=brand_data.get("thumbnail_path"),
                yt_thumbnail_path=brand_data.get("yt_thumbnail_path"),
                brand=brand_name,
                variant=variant,
                post_title=job.title,
                slide_texts=slide_texts,
                carousel_paths=brand_data.get("carousel_paths"),
                job_id=job.job_id,
                created_by=job.created_by or "user",
            )

            scheduled_results.append({
                "brand": brand_name,
                "scheduled_time": slot_time.isoformat(),
                "schedule_id": result.get("schedule_id"),
            })

    return {"scheduled": scheduled_results}


@router.post("/{job_id}/approve")
async def approve_pipeline_item(
    job_id: str,
    body: ApproveRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Approve a single pipeline item and auto-schedule it."""
    job = db.query(GenerationJob).filter(
        GenerationJob.job_id == job_id,
        GenerationJob.user_id == user["id"],
        GenerationJob.pipeline_status == "pending",
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Pipeline item not found or not pending")

    result = _approve_single_job(job, db, user, caption_override=body.caption)
    db.commit()

    return {"approved": True, **result}


@router.post("/{job_id}/reject")
async def reject_pipeline_item(
    job_id: str,
    body: RejectRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Reject a single pipeline item."""
    job = db.query(GenerationJob).filter(
        GenerationJob.job_id == job_id,
        GenerationJob.user_id == user["id"],
        GenerationJob.pipeline_status == "pending",
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Pipeline item not found or not pending")

    job.pipeline_status = "rejected"
    job.pipeline_reviewed_at = datetime.now(timezone.utc)
    db.commit()

    return {"rejected": True, "job_id": job_id}


def _bulk_schedule_background(job_ids: list[str], user: dict):
    """Background task: schedule approved jobs sequentially (slot allocation)."""
    db = SessionLocal()
    try:
        from app.services.publishing.scheduler import DatabaseSchedulerService

        jobs = (
            db.query(GenerationJob)
            .filter(
                GenerationJob.job_id.in_(job_ids),
                GenerationJob.user_id == user["id"],
                GenerationJob.pipeline_status == "approved",
            )
            .all()
        )

        for job in jobs:
            try:
                scheduler = DatabaseSchedulerService()
                variant = job.variant or "light"

                for brand_name in (job.brands or []):
                    raw_brand_data = (job.brand_outputs or {}).get(brand_name, {})
                    brand_items: list[dict] = (
                        raw_brand_data
                        if isinstance(raw_brand_data, list)
                        else [raw_brand_data]
                    )

                    for brand_data in brand_items:
                        if not isinstance(brand_data, dict):
                            continue
                        if brand_data.get("status") not in (
                            "completed",
                            "scheduled",
                        ):
                            continue

                        if variant == "threads":
                            slot_time = scheduler.get_next_available_post_slot(
                                brand=brand_name
                            )
                        else:
                            slot_time = scheduler.get_next_available_slot(
                                brand=brand_name,
                                variant=variant,
                                user_id=user["id"],
                            )

                        caption = job.caption or brand_data.get("caption", "")
                        slide_texts = brand_data.get("slide_texts") or job.content_lines

                        item_idx = brand_data.get("content_index")
                        base_reel_id = brand_data.get(
                            "reel_id", f"{job.job_id}_{brand_name}"
                        )
                        reel_id = (
                            f"{base_reel_id}_{item_idx}"
                            if item_idx is not None
                            else base_reel_id
                        )

                        scheduler.schedule_reel(
                            user_id=user["id"],
                            reel_id=reel_id,
                            scheduled_time=slot_time,
                            caption=caption,
                            platforms=job.platforms or ["instagram"],
                            video_path=brand_data.get("video_path"),
                            thumbnail_path=brand_data.get("thumbnail_path"),
                            yt_thumbnail_path=brand_data.get("yt_thumbnail_path"),
                            brand=brand_name,
                            variant=variant,
                            post_title=job.title,
                            slide_texts=slide_texts,
                            carousel_paths=brand_data.get("carousel_paths"),
                            job_id=job.job_id,
                            created_by=job.created_by or "user",
                        )
            except Exception as e:
                logger.error("Background scheduling failed for %s: %s", job.job_id, e)

        db.commit()
    except Exception as e:
        logger.error("Background bulk-schedule task failed: %s", e)
    finally:
        db.close()


@router.post("/bulk-approve")
async def bulk_approve_pipeline_items(
    body: BulkApproveRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Approve multiple pipeline items. Returns immediately; scheduling runs in background."""
    now = datetime.now(timezone.utc)
    jobs = (
        db.query(GenerationJob)
        .filter(
            GenerationJob.job_id.in_(body.job_ids),
            GenerationJob.user_id == user["id"],
            GenerationJob.pipeline_status == "pending",
        )
        .all()
    )

    if not jobs:
        raise HTTPException(status_code=404, detail="No pending pipeline items found")

    # Mark all jobs as approved immediately
    approved_ids = []
    for job in jobs:
        job.pipeline_status = "approved"
        job.pipeline_reviewed_at = now
        approved_ids.append(job.job_id)

    db.commit()

    # Schedule the actual slot allocation + reel creation in the background
    background_tasks.add_task(_bulk_schedule_background, approved_ids, user)

    return {"approved": len(approved_ids), "total": len(body.job_ids), "results": []}


@router.post("/bulk-reject")
async def bulk_reject_pipeline_items(
    body: BulkRejectRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Reject multiple pipeline items."""
    now = datetime.now(timezone.utc)
    updated = (
        db.query(GenerationJob)
        .filter(
            GenerationJob.job_id.in_(body.job_ids),
            GenerationJob.user_id == user["id"],
            GenerationJob.pipeline_status == "pending",
        )
        .update(
            {"pipeline_status": "rejected", "pipeline_reviewed_at": now},
            synchronize_session="fetch",
        )
    )
    db.commit()
    return {"rejected": updated, "total": len(body.job_ids)}


@router.patch("/{job_id}/edit")
async def edit_pipeline_item(
    job_id: str,
    body: EditRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Edit caption/title of a pending pipeline item."""
    job = db.query(GenerationJob).filter(
        GenerationJob.job_id == job_id,
        GenerationJob.user_id == user["id"],
        GenerationJob.pipeline_status == "pending",
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Pipeline item not found or not pending")

    if body.caption is not None:
        job.caption = body.caption
    if body.title is not None:
        job.title = body.title

    db.commit()
    return _serialize_pipeline_item(job)


@router.delete("/{job_id}")
async def delete_pipeline_item(
    job_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Delete a pipeline item and any associated scheduled posts."""
    from app.models.scheduling import ScheduledReel

    job = db.query(GenerationJob).filter(
        GenerationJob.job_id == job_id,
        GenerationJob.user_id == user["id"],
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Pipeline item not found")

    # Delete any scheduled reels linked to this job
    db.query(ScheduledReel).filter(
        ScheduledReel.user_id == user["id"],
        ScheduledReel.reel_id.like(f"{job_id}%"),
    ).delete(synchronize_session="fetch")

    db.delete(job)
    db.commit()

    return {"deleted": True, "job_id": job_id}


@router.post("/regenerate")
async def regenerate_pipeline_items(
    body: RegenerateRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Trigger Toby to generate more content items to fill gaps.

    This is a lightweight trigger — actual generation happens asynchronously
    via the orchestrator tick loop. We mark a flag that the next tick picks up.
    """
    from app.models.toby import TobyState

    state = db.query(TobyState).filter(TobyState.user_id == user["id"]).first()
    if not state:
        raise HTTPException(status_code=404, detail="Toby is not configured for this user")

    if not state.enabled:
        raise HTTPException(status_code=400, detail="Toby is currently disabled")

    # Force a buffer check on the next tick by clearing last_buffer_check_at
    state.last_buffer_check_at = None
    db.commit()

    return {
        "triggered": True,
        "message": f"Toby will generate up to {body.count} items on the next tick cycle",
        "requested_count": body.count,
    }
