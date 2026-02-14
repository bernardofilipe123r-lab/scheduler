"""
Status and history API routes.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.services.media.video_generator import VideoGenerator
from app.db_connection import get_db
from app.models.jobs import GenerationJob


# Create router
router = APIRouter()


@router.get("/status")
async def get_status(db: Session = Depends(get_db)):
    """Get current generation status."""
    active = db.query(GenerationJob).filter(
        GenerationJob.status.in_(["pending", "generating"])
    ).order_by(GenerationJob.created_at.desc()).first()
    if active:
        return {
            "status": "generating",
            "generation": active.to_dict(),
            "progress": {
                "step": active.current_step,
                "percent": active.progress_percent,
            }
        }
    return {"status": "idle"}


@router.get("/history")
async def get_history(limit: int = 10, db: Session = Depends(get_db)):
    """Get recent generation history."""
    jobs = db.query(GenerationJob).order_by(
        GenerationJob.created_at.desc()
    ).limit(limit).all()
    return {
        "generations": [j.to_dict() for j in jobs]
    }


@router.get("/generation/{generation_id}")
async def get_generation(generation_id: str, db: Session = Depends(get_db)):
    """Get specific generation details."""
    job = db.query(GenerationJob).filter(
        GenerationJob.job_id == generation_id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Generation not found")
    
    return {
        "generation": job.to_dict(),
        "progress": {
            "step": job.current_step,
            "percent": job.progress_percent,
        }
    }


@router.get(
    "/health",
    summary="Health check",
    description="Check if the service and its dependencies are healthy"
)
async def health_check():
    """
    Health check endpoint.
    
    Verifies that FFmpeg is installed and the service is ready.
    """
    try:
        video_generator = VideoGenerator()
        ffmpeg_available = video_generator.verify_installation()
        
        return {
            "status": "healthy" if ffmpeg_available else "degraded",
            "ffmpeg_available": ffmpeg_available,
            "message": "Service is operational" if ffmpeg_available else "FFmpeg not available - video generation disabled"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "ffmpeg_available": False,
            "message": str(e)
        }
