"""
API routes for job management - create, track, edit, regenerate generation jobs.
"""
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status, BackgroundTasks

from app.db_connection import get_db_session
from app.services.job_manager import JobManager


# Request/Response models
class JobCreateRequest(BaseModel):
    """Request to create a new generation job."""
    title: str
    content_lines: List[str]
    brands: List[str]  # ["gymcollege", "healthycollege", etc.]
    variant: str = "light"
    ai_prompt: Optional[str] = None
    cta_type: Optional[str] = "follow_tips"
    user_id: str = "default"


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
    """Background task to process a job."""
    with get_db_session() as db:
        manager = JobManager(db)
        manager.process_job(job_id)


@router.post(
    "/create",
    summary="Create a new generation job",
    description="Creates a job and starts processing in the background. Returns job ID immediately."
)
async def create_job(request: JobCreateRequest, background_tasks: BackgroundTasks):
    """
    Create a new generation job.
    
    Returns the job ID immediately - generation happens in background.
    Use /jobs/{job_id}/status to track progress.
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            
            job = manager.create_job(
                user_id=request.user_id,
                title=request.title,
                content_lines=request.content_lines,
                brands=request.brands,
                variant=request.variant,
                ai_prompt=request.ai_prompt,
                cta_type=request.cta_type
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
async def get_job(job_id: str):
    """
    Get full job details including status, progress, and outputs.
    
    Returns all brand outputs with their thumbnail/video paths.
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            job = manager.get_job(job_id)
            
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
async def get_job_status(job_id: str):
    """
    Get just the job status - useful for polling during generation.
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            job = manager.get_job(job_id)
            
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
async def update_job(job_id: str, request: JobUpdateRequest):
    """
    Update job inputs (title, content, CTA).
    
    This only updates the stored values - call regenerate endpoint to apply.
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            
            job = manager.update_job_inputs(
                job_id=job_id,
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
    background_tasks: BackgroundTasks = None
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
                manager = JobManager(db)
                manager.regenerate_brand(
                    job_id=job_id,
                    brand=brand,
                    title=request.title if request else None,
                    content_lines=request.content_lines if request else None
                )
        
        # Validate brand
        valid_brands = ["gymcollege", "healthycollege", "vitalitycollege", "longevitycollege"]
        if brand.lower() not in valid_brands:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid brand: {brand}. Must be one of: {valid_brands}"
            )
        
        # Check job exists
        with get_db_session() as db:
            manager = JobManager(db)
            job = manager.get_job(job_id)
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
    background_tasks: BackgroundTasks = None
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
                    title=request.title,
                    content_lines=request.content_lines,
                    ai_prompt=request.ai_prompt,
                    cta_type=request.cta_type
                )
            
            job = manager.get_job(job_id)
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
    user_id: Optional[str] = None,
    limit: int = 50
):
    """
    Get job history.
    
    - If user_id provided, shows only that user's jobs
    - Otherwise shows all recent jobs
    """
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            
            if user_id:
                jobs = manager.get_user_jobs(user_id, limit)
            else:
                jobs = manager.get_all_jobs(limit)
            
            return {
                "jobs": [job.to_dict() for job in jobs],
                "total": len(jobs)
            }
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list jobs: {str(e)}"
        )


@router.delete(
    "/{job_id}",
    summary="Delete a job"
)
async def delete_job(job_id: str):
    """Delete a job and optionally its associated files."""
    try:
        with get_db_session() as db:
            manager = JobManager(db)
            
            if not manager.delete_job(job_id):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Job not found: {job_id}"
                )
            
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
