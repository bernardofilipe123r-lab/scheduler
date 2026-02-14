"""
Status and history API routes.
"""
from fastapi import APIRouter, HTTPException
from app.services.video_generator import VideoGenerator
from app.database.db import ReelDatabase


# Create router
router = APIRouter()

# Initialize services
db = ReelDatabase()


@router.get("/status")
async def get_status():
    """Get current generation status."""
    active = db.get_active_generation()
    if active:
        progress = db.get_progress(active['id'])
        return {
            "status": "generating",
            "generation": active,
            "progress": progress
        }
    return {"status": "idle"}


@router.get("/history")
async def get_history(limit: int = 10):
    """Get recent generation history."""
    return {
        "generations": db.get_recent_generations(limit)
    }


@router.get("/generation/{generation_id}")
async def get_generation(generation_id: str):
    """Get specific generation details."""
    generation = db.get_generation(generation_id)
    if not generation:
        raise HTTPException(status_code=404, detail="Generation not found")
    
    progress = db.get_progress(generation_id)
    return {
        "generation": generation,
        "progress": progress
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
