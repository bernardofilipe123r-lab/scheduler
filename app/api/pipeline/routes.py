"""Pipeline API — human-in-the-loop approval gate for content publishing."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db_connection import get_db
from app.api.auth.middleware import get_current_user
from app.models.jobs import GenerationJob
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


def _serialize_pipeline_item(job: GenerationJob) -> dict:
    """Serialize a GenerationJob for the pipeline API response."""
    return {
        "job_id": job.job_id,
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
        "brand_outputs": job.brand_outputs or {},
    }


@router.get("")
async def list_pipeline_items(
    status: Optional[str] = Query("pending", regex="^(pending|approved|rejected|all)$"),
    brand: Optional[str] = None,
    content_type: Optional[str] = Query(None, regex="^(all|reels|carousels|threads)$"),
    batch_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List pipeline items for the current user."""
    query = db.query(GenerationJob).filter(
        GenerationJob.user_id == user["id"],
        GenerationJob.pipeline_status.isnot(None),
    )

    if status and status != "all":
        query = query.filter(GenerationJob.pipeline_status == status)

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

    total = query.count()
    items = (
        query
        .order_by(GenerationJob.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

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
    """Get pipeline stats for the current user."""
    rows = (
        db.query(GenerationJob.pipeline_status, func.count())
        .filter(
            GenerationJob.user_id == user["id"],
            GenerationJob.pipeline_status.isnot(None),
        )
        .group_by(GenerationJob.pipeline_status)
        .all()
    )

    counts = {s: c for s, c in rows}
    pending = counts.get("pending", 0)
    approved = counts.get("approved", 0)
    rejected = counts.get("rejected", 0)
    reviewed = approved + rejected
    rate = round((approved / reviewed * 100) if reviewed > 0 else 0)

    return {
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "rate": rate,
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

    for brand_name in (job.brands or []):
        brand_data = (job.brand_outputs or {}).get(brand_name, {})
        if not brand_data or brand_data.get("status") not in ("completed", "scheduled"):
            continue

        # Pick variant for slot lookup
        variant = job.variant or "light"
        slot_time = scheduler.get_next_available_slot(
            brand=brand_name,
            variant=variant,
            user_id=user["id"],
        )

        caption = caption_override or job.caption or brand_data.get("caption", "")

        result = scheduler.schedule_reel(
            user_id=user["id"],
            reel_id=brand_data.get("reel_id", f"{job.job_id}_{brand_name}"),
            scheduled_time=slot_time,
            caption=caption,
            platforms=job.platforms or ["instagram"],
            video_path=brand_data.get("video_path"),
            thumbnail_path=brand_data.get("thumbnail_path"),
            yt_thumbnail_path=brand_data.get("yt_thumbnail_path"),
            brand=brand_name,
            variant=variant,
            post_title=job.title,
            slide_texts=job.content_lines,
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


@router.post("/bulk-approve")
async def bulk_approve_pipeline_items(
    body: BulkApproveRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Approve multiple pipeline items. Processes sequentially to avoid slot collision."""
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

    results = []
    for job in jobs:
        try:
            result = _approve_single_job(job, db, user)
            results.append({"job_id": job.job_id, "approved": True, **result})
        except Exception as e:
            logger.error("Failed to approve %s: %s", job.job_id, e)
            results.append({"job_id": job.job_id, "approved": False, "error": str(e)})

    db.commit()
    approved_count = sum(1 for r in results if r.get("approved"))
    return {"approved": approved_count, "total": len(body.job_ids), "results": results}


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
