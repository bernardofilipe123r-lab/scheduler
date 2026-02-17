"""
API routes for job management - create, track, edit, regenerate generation jobs.
"""
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status, BackgroundTasks, Depends

from sqlalchemy import type_coerce
from sqlalchemy.dialects.postgresql import JSONB
from app.db_connection import get_db_session
from app.services.content.job_manager import JobManager
from app.services.content.job_processor import JobProcessor
from app.services.brands.resolver import brand_resolver
from app.api.auth.middleware import get_current_user

import threading
_job_semaphore = threading.Semaphore(2)


# Request/Response models
class JobCreateRequest(BaseModel):
    """Request to create a new generation job."""
    title: str
    content_lines: Optional[List[str]] = None  # Not needed for post variant
    brands: List[str]  # ["gymcollege", "healthycollege", etc.]
    variant: str = "light"
    ai_prompt: Optional[str] = None
    cta_type: Optional[str] = "follow_tips"
    user_id: str = "default"
    platforms: Optional[List[str]] = None  # ["instagram", "facebook", "youtube"] - defaults to all if None
    fixed_title: bool = False  # If True, use title as-is (no AI generation)


class JobUpdateRequest(BaseModel):
    """Request to update job inputs (title, content) without regenerating."""
    title: Optional[str] = None
    content_lines: Optional[List[str]] = None
    ai_prompt: Optional[str] = None
    cta_type: Optional[str] = None


class BrandRegenerateRequest(BaseModel):
    """Request to regenerate a single brand's outputs."""
    title: Optional[str] = None  # Override title
    content_lines: Optional[List[str]] = None  # Override content


# Create router
router = APIRouter(prefix="/jobs", tags=["jobs"])


def process_job_async(job_id: str):
    """Background task to process a job (with concurrency control)."""
    import traceback
    import sys
    
    # Force flush ALL print statements
    print(f"\n{'='*60}", flush=True)
    print(f"🚀 BACKGROUND TASK STARTED", flush=True)
    print(f"   Job ID: {job_id}", flush=True)
    print(f"   Timestamp: {datetime.now().isoformat()}", flush=True)
    print(f"{'='*60}", flush=True)
    sys.stdout.flush()
    
    _job_semaphore.acquire()
    try:
        print(f"📂 Opening database session...", flush=True)
        with get_db_session() as db:
            print(f"   ✓ Database session opened", flush=True)
            
            print(f"🔧 Creating JobProcessor...", flush=True)
            processor = JobProcessor(db)
            print(f"   ✓ JobProcessor created", flush=True)
            
            print(f"🎬 Calling process_job({job_id})...", flush=True)
            sys.stdout.flush()
            
            result = processor.process_job(job_id)
            
            print(f"\n{'='*60}", flush=True)
            print(f"✅ JOB PROCESSING COMPLETED", flush=True)
            print(f"   Job ID: {job_id}", flush=True)
            print(f"   Result: {result}", flush=True)
            print(f"{'='*60}\n", flush=True)
            sys.stdout.flush()
            
    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"\n{'='*60}", flush=True)
        print(f"❌ CRITICAL ERROR IN BACKGROUND JOB", flush=True)
        print(f"   Job ID: {job_id}", flush=True)
        print(f"   Error: {error_msg}", flush=True)
        print(f"\nFull Traceback:", flush=True)
        traceback.print_exc()
        sys.stdout.flush()
        print(f"{'='*60}\n", flush=True)
        
        # Try to update job status to failed
        try:
            print(f"📝 Updating job status to failed...", flush=True)
            with get_db_session() as db:
                manager = JobManager(db)
                manager.update_job_status(job_id, "failed", error_message=error_msg)
            print(f"   ✓ Job status updated", flush=True)
        except Exception as update_error:
            print(f"   ❌ Failed to update job status: {update_error}", flush=True)
        sys.stdout.flush()
    finally:
        _job_semaphore.release()


@router.post(
    "/create",
    summary="Create a new generation job",
    description="Creates a job and starts processing in the background. Returns job ID immediately."
)
async def create_job(request: JobCreateRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    """
    Create a new generation job.
    
    Returns the job ID immediately - generation happens in background.
    Use /jobs/{job_id}/status to track progress.
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            
            job = manager.create_job(
                user_id=user["id"],
                title=request.title,
                content_lines=request.content_lines or [],
                brands=request.brands,
                variant=request.variant,
                ai_prompt=request.ai_prompt,
                cta_type=request.cta_type,
                platforms=request.platforms,
                fixed_title=request.fixed_title
            )
            
            job_id = job.job_id
            job_dict = job.to_dict()
        
        # Start processing in background
        background_tasks.add_task(process_job_async, job_id)
        
        return {
            "status": "created",
            "job_id": job_id,
            "message": "Job created and queued for processing",
            "job": job_dict
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create job: {str(e)}"
        )


@router.get(
    "/{job_id}",
    summary="Get job details and status"
)
async def get_job(job_id: str, user: dict = Depends(get_current_user)):
    """
    Get full job details including status, progress, and outputs.
    
    Returns all brand outputs with their thumbnail/video paths.
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            job = manager.get_job(job_id, user_id=user["id"])
            
            if not job:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Job not found: {job_id}"
                )
            
            return job.to_dict()
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get job: {str(e)}"
        )


@router.get(
    "/{job_id}/status",
    summary="Get job status (lightweight)"
)
async def get_job_status(job_id: str, user: dict = Depends(get_current_user)):
    """
    Get just the job status - useful for polling during generation.
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            job = manager.get_job(job_id, user_id=user["id"])
            
            if not job:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Job not found: {job_id}"
                )
            
            return {
                "job_id": job.job_id,
                "status": job.status,
                "current_step": job.current_step,
                "progress_percent": job.progress_percent,
                "error_message": job.error_message
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get job status: {str(e)}"
        )


@router.put(
    "/{job_id}",
    summary="Update job inputs",
    description="Update title/content without regenerating. Use regenerate endpoints to apply changes."
)
async def update_job(job_id: str, request: JobUpdateRequest, user: dict = Depends(get_current_user)):
    """
    Update job inputs (title, content, CTA).
    
    This only updates the stored values - call regenerate endpoint to apply.
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            
            job = manager.update_job_inputs(
                job_id=job_id,
                user_id=user["id"],
                title=request.title,
                content_lines=request.content_lines,
                ai_prompt=request.ai_prompt,
                cta_type=request.cta_type
            )
            
            if not job:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Job not found: {job_id}"
                )
            
            return {
                "status": "updated",
                "job_id": job_id,
                "message": "Job inputs updated. Use regenerate endpoint to apply changes.",
                "job": job.to_dict()
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update job: {str(e)}"
        )


@router.post(
    "/{job_id}/regenerate/{brand}",
    summary="Regenerate single brand",
    description="Regenerate images/video for one brand only. Can optionally override title/content."
)
async def regenerate_brand(
    job_id: str,
    brand: str,
    request: Optional[BrandRegenerateRequest] = None,
    background_tasks: BackgroundTasks = None,
    user: dict = Depends(get_current_user),
):
    """
    Regenerate just one brand's outputs.
    
    - Uses the job's stored title/content unless overridden
    - For dark mode, reuses the AI background (no new API call!)
    - Optionally override title/content just for this regeneration
    """
    try:
        def regenerate_async():
            with get_db_session() as db:
                processor = JobProcessor(db)
                processor.regenerate_brand(
                    job_id=job_id,
                    brand=brand,
                    title=request.title if request else None,
                    content_lines=request.content_lines if request else None
                )
        
        # Validate brand
        valid_brands = brand_resolver.get_all_brand_ids()
        if brand.lower() not in valid_brands:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid brand: {brand}. Must be one of: {valid_brands}"
            )
        
        # Check job exists
        with get_db_session() as db:
            manager = JobManager(db)
            job = manager.get_job(job_id, user_id=user["id"])
            if not job:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Job not found: {job_id}"
                )
            
            if brand.lower() not in [b.lower() for b in job.brands]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Brand {brand} not in job's brands: {job.brands}"
                )
            
            # Update status
            manager.update_brand_output(job_id, brand.lower(), {"status": "queued"})
        
        # Run in background
        if background_tasks:
            background_tasks.add_task(regenerate_async)
            return {
                "status": "queued",
                "job_id": job_id,
                "brand": brand.lower(),
                "message": f"Regeneration queued for {brand}"
            }
        else:
            # Run synchronously if no background tasks
            regenerate_async()
            return {
                "status": "completed",
                "job_id": job_id,
                "brand": brand.lower(),
                "message": f"Regeneration completed for {brand}"
            }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to regenerate brand: {str(e)}"
        )


@router.post(
    "/{job_id}/regenerate",
    summary="Regenerate all brands",
    description="Regenerate all brand outputs with current (or updated) inputs"
)
async def regenerate_all(
    job_id: str,
    request: Optional[JobUpdateRequest] = None,
    background_tasks: BackgroundTasks = None,
    user: dict = Depends(get_current_user),
):
    """
    Regenerate all brand outputs.
    
    Optionally update inputs first, then regenerate all.
    """
    try:
        # Update inputs if provided
        with get_db_session() as db:
            manager = JobManager(db)
            
            if request:
                manager.update_job_inputs(
                    job_id=job_id,
                    user_id=user["id"],
                    title=request.title,
                    content_lines=request.content_lines,
                    ai_prompt=request.ai_prompt,
                    cta_type=request.cta_type
                )
            
            job = manager.get_job(job_id, user_id=user["id"])
            if not job:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Job not found: {job_id}"
                )
            
            # Reset status
            manager.update_job_status(job_id, "pending", "Queued for regeneration", 0)
        
        # Run in background
        if background_tasks:
            background_tasks.add_task(process_job_async, job_id)
            return {
                "status": "queued",
                "job_id": job_id,
                "message": "Full regeneration queued"
            }
        else:
            process_job_async(job_id)
            return {
                "status": "completed",
                "job_id": job_id,
                "message": "Full regeneration completed"
            }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to regenerate: {str(e)}"
        )


@router.get(
    "/",
    summary="List all jobs (history)"
)
async def list_jobs(
    limit: int = 100,
    user: dict = Depends(get_current_user),
):
    """
    Get job history for the current user.
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            jobs = manager.get_all_jobs(limit=limit, user_id=user["id"])

            # Cross-reference with ScheduledReel to enrich brand_outputs
            # with published/publishing status
            from app.models import ScheduledReel
            reel_ids = []
            for job in jobs:
                for output in (job.brand_outputs or {}).values():
                    rid = output.get("reel_id")
                    if rid:
                        reel_ids.append(rid)

            published_map: dict[str, str] = {}  # reel_id -> status
            if reel_ids:
                scheduled_rows = (
                    db.query(ScheduledReel.reel_id, ScheduledReel.status)
                    .filter(ScheduledReel.reel_id.in_(reel_ids))
                    .all()
                )
                for rid, sr_status in scheduled_rows:
                    published_map[rid] = sr_status

            results = []
            for job in jobs:
                d = job.to_dict()
                for brand, output in d.get("brand_outputs", {}).items():
                    rid = output.get("reel_id")
                    if rid and rid in published_map:
                        sr_status = published_map[rid]
                        if sr_status in ("published", "partial"):
                            output["status"] = "published"
                results.append(d)

            return {
                "jobs": results,
                "total": len(results)
            }
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list jobs: {str(e)}"
        )


@router.delete(
    "/bulk/by-status",
    summary="Delete all jobs matching a status"
)
async def delete_jobs_by_status(job_status: str = "completed", user: dict = Depends(get_current_user)):
    """Delete all jobs matching a given status (completed, failed, etc.).
    Also deletes the corresponding scheduled_reels entries."""
    from app.db_connection import SessionLocal
    from app.models import GenerationJob, ScheduledReel

    db = SessionLocal()
    try:
        # Find matching jobs for this user
        jobs = db.query(GenerationJob).filter(
            GenerationJob.status.in_([job_status, "failed"]),
            GenerationJob.user_id == user["id"]
        ).all()
        if not jobs:
            return {"status": "ok", "deleted": 0}

        deleted_count = 0
        for job in jobs:
            # Delete associated scheduled reels by reel_id
            brand_outputs = job.brand_outputs or {}
            for brand, output in brand_outputs.items():
                reel_id = output.get("reel_id")
                if reel_id:
                    db.query(ScheduledReel).filter(ScheduledReel.reel_id == reel_id).delete()
            # Also delete any scheduled reels linked via extra_data->job_id
            db.query(ScheduledReel).filter(
                type_coerce(ScheduledReel.extra_data, JSONB)["job_id"].astext == job.job_id
            ).delete(synchronize_session=False)
            # Delete the job
            db.delete(job)
            deleted_count += 1

        db.commit()
        return {"status": "deleted", "deleted": deleted_count}
    except Exception as e:
        db.rollback()
        return {"status": "error", "error": str(e)}
    finally:
        db.close()


class BulkDeleteByIdsRequest(BaseModel):
    """Request to delete jobs by a list of IDs."""
    job_ids: List[str]


@router.post(
    "/bulk/delete-by-ids",
    summary="Delete multiple jobs by their IDs"
)
async def delete_jobs_by_ids(request: BulkDeleteByIdsRequest, user: dict = Depends(get_current_user)):
    """Delete multiple jobs by their IDs in a single operation.
    Also deletes associated scheduled_reels entries and cleans up files."""
    from app.models import ScheduledReel

    try:
        with get_db_session() as db:
            manager = JobManager(db)
            deleted_count = 0
            errors = []

            for job_id in request.job_ids:
                try:
                    job = manager.get_job(job_id, user_id=user["id"])
                    if not job:
                        continue  # Skip missing jobs silently

                    # Delete associated scheduled reels by reel_id
                    brand_outputs = job.brand_outputs or {}
                    for brand, output in brand_outputs.items():
                        reel_id = output.get("reel_id") if isinstance(output, dict) else None
                        if reel_id:
                            db.query(ScheduledReel).filter(
                                ScheduledReel.reel_id == reel_id
                            ).delete(synchronize_session=False)

                    # Also delete any scheduled reels linked via extra_data->job_id
                    db.query(ScheduledReel).filter(
                        type_coerce(ScheduledReel.extra_data, JSONB)["job_id"].astext == job_id
                    ).delete(synchronize_session=False)

                    # Clean up files (best-effort, don't fail on file errors)
                    try:
                        manager.cleanup_job_files(job_id)
                    except Exception:
                        pass  # File cleanup is best-effort

                    # Delete the job record
                    db.delete(job)
                    deleted_count += 1
                except Exception as e:
                    errors.append({"job_id": job_id, "error": str(e)})

            db.commit()

            return {
                "status": "deleted",
                "deleted": deleted_count,
                "requested": len(request.job_ids),
                "errors": errors
            }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to bulk delete jobs: {str(e)}"
        )


@router.delete(
    "/{job_id}",
    summary="Delete a job"
)
async def delete_job(job_id: str, user: dict = Depends(get_current_user)):
    """Delete a job and its associated files and scheduled reels."""
    from app.models import ScheduledReel

    try:
        with get_db_session() as db:
            manager = JobManager(db)
            job = manager.get_job(job_id, user_id=user["id"])

            if not job:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Job not found: {job_id}"
                )

            # Delete associated scheduled reels by reel_id
            brand_outputs = job.brand_outputs or {}
            for brand, output in brand_outputs.items():
                reel_id = output.get("reel_id") if isinstance(output, dict) else None
                if reel_id:
                    db.query(ScheduledReel).filter(
                        ScheduledReel.reel_id == reel_id
                    ).delete(synchronize_session=False)

            # Also delete any scheduled reels linked via extra_data->job_id
            db.query(ScheduledReel).filter(
                type_coerce(ScheduledReel.extra_data, JSONB)["job_id"].astext == job_id
            ).delete(synchronize_session=False)

            # Clean up files (best-effort)
            try:
                manager.cleanup_job_files(job_id)
            except Exception:
                pass

            # Delete the job
            db.delete(job)
            db.commit()

            return {
                "status": "deleted",
                "job_id": job_id
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete job: {str(e)}"
        )


@router.post(
    "/{job_id}/cancel",
    summary="Cancel a running job"
)
async def cancel_job(job_id: str, user: dict = Depends(get_current_user)):
    """
    Cancel a job that's pending or generating.
    
    - Marks job as 'cancelled'
    - Stops further processing
    - Deletes partial outputs
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            
            job = manager.get_job(job_id, user_id=user["id"])
            if not job:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Job not found: {job_id}"
                )
            
            if job.status in ("completed", "cancelled"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot cancel job with status: {job.status}"
                )
            
            # Mark as cancelled
            manager.update_job_status(
                job_id=job_id,
                status="cancelled",
                current_step="Cancelled by user",
                error_message="Job cancelled by user"
            )
            
            # Clean up any partial files
            manager.cleanup_job_files(job_id)
            
            return {
                "status": "cancelled",
                "job_id": job_id,
                "message": "Job cancelled successfully"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel job: {str(e)}"
        )


@router.get(
    "/{job_id}/next-slots",
    summary="Get next available schedule slots for all brands in a job"
)
async def get_next_slots(job_id: str, user: dict = Depends(get_current_user)):
    """
    Get the next available scheduling slots for all brands in a job.
    
    Uses the magic scheduling system:
    - Each brand has 6 daily slots (every 4 hours)
    - Slots alternate Light → Dark → Light → Dark → Light → Dark
    - Brands are staggered by 1 hour
    - Finds next available slot matching the job's variant
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            
            job = manager.get_job(job_id, user_id=user["id"])
            if not job:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Job not found: {job_id}"
                )
            
            from app.services.publishing.scheduler import DatabaseSchedulerService
            scheduler = DatabaseSchedulerService()
            
            # Get next slots for all brands
            slots = scheduler.get_next_slots_for_job(
                brands=job.brands,
                variant=job.variant
            )
            
            # Convert to ISO format
            return {brand: slot.isoformat() for brand, slot in slots.items()}
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get slots: {str(e)}"
        )


class BrandStatusUpdate(BaseModel):
    """Request to update a brand's status."""
    status: str  # "scheduled", "completed", "failed", etc.
    scheduled_time: Optional[str] = None


@router.post(
    "/{job_id}/brand/{brand}/status",
    summary="Update a brand's status (e.g., mark as scheduled)"
)
async def update_brand_status(job_id: str, brand: str, request: BrandStatusUpdate, user: dict = Depends(get_current_user)):
    """
    Update a brand's status within a job.
    Used to mark brands as 'scheduled' after scheduling, preventing re-scheduling.
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            
            job = manager.get_job(job_id, user_id=user["id"])
            if not job:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Job not found: {job_id}"
                )
            
            # Check brand exists
            if brand not in job.brands:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Brand '{brand}' not in job"
                )
            
            # Update the brand output status
            brand_outputs = job.brand_outputs or {}
            if brand not in brand_outputs:
                brand_outputs[brand] = {}
            
            brand_outputs[brand]["status"] = request.status
            if request.scheduled_time:
                brand_outputs[brand]["scheduled_time"] = request.scheduled_time
            
            # Save updated brand outputs
            manager.update_brand_output(
                job_id=job_id,
                brand=brand,
                output_data=brand_outputs[brand]
            )
            
            return {
                "success": True,
                "job_id": job_id,
                "brand": brand,
                "status": request.status,
                "message": f"Brand {brand} status updated to {request.status}"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update brand status: {str(e)}"
        )


# ── Per-brand content update (title, caption) ────────────────────────

class BrandContentUpdate(BaseModel):
    """Update a brand's title and/or caption."""
    title: Optional[str] = None
    caption: Optional[str] = None
    slide_texts: Optional[list[str]] = None


@router.patch(
    "/{job_id}/brand/{brand}/content",
    summary="Update a brand's title and/or caption"
)
async def update_brand_content(job_id: str, brand: str, request: BrandContentUpdate, user: dict = Depends(get_current_user)):
    """Update the per-brand title and/or caption stored in brand_outputs."""
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            job = manager.get_job(job_id, user_id=user["id"])
            if not job:
                raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
            if brand not in job.brands:
                raise HTTPException(status_code=400, detail=f"Brand '{brand}' not in job")

            updates: Dict[str, Any] = {}
            if request.title is not None:
                updates["title"] = request.title
            if request.caption is not None:
                updates["caption"] = request.caption
            if request.slide_texts is not None:
                updates["slide_texts"] = request.slide_texts

            if updates:
                manager.update_brand_output(job_id, brand, updates)

            return {
                "success": True,
                "job_id": job_id,
                "brand": brand,
                "message": f"Brand content updated",
                "updates": updates,
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Per-brand image regeneration ─────────────────────────────────────

class BrandImageRegenRequest(BaseModel):
    """Regenerate a single brand's background image."""
    ai_prompt: Optional[str] = None  # Custom prompt override; if None uses stored prompt


@router.post(
    "/{job_id}/brand/{brand}/regenerate-image",
    summary="Regenerate a single brand's background image"
)
async def regenerate_brand_image(
    job_id: str,
    brand: str,
    request: Optional[BrandImageRegenRequest] = None,
    background_tasks: BackgroundTasks = None,
    user: dict = Depends(get_current_user),
):
    """
    Regenerate only the background image for one brand.
    Optionally supply a custom AI prompt; otherwise the stored per-brand prompt is used.
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            job = manager.get_job(job_id, user_id=user["id"])
            if not job:
                raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
            if brand not in job.brands:
                raise HTTPException(status_code=400, detail=f"Brand '{brand}' not in job")

            # If custom prompt provided, store it
            if request and request.ai_prompt:
                manager.update_brand_output(job_id, brand, {"ai_prompt": request.ai_prompt})

            manager.update_brand_output(job_id, brand, {"status": "queued"})

        def regen_async():
            with get_db_session() as db2:
                processor = JobProcessor(db2)
                processor.process_post_brand(job_id, brand)

        if background_tasks:
            background_tasks.add_task(regen_async)
            return {"status": "queued", "job_id": job_id, "brand": brand}
        else:
            regen_async()
            return {"status": "completed", "job_id": job_id, "brand": brand}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
