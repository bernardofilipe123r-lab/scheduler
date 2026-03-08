"""API routes for TEXT-VIDEO reel generation."""

import logging
from typing import Optional, List
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db_connection import get_db, get_db_session
from app.api.auth.middleware import get_current_user
from app.models.jobs import GenerationJob
from app.models.story_pool import StoryPool
from app.services.content.job_manager import JobManager
from app.services.content.job_processor import JobProcessor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/content/text-video", tags=["text-video"])


# --- Request/Response Models ---


class DiscoverRequest(BaseModel):
    niche: str = Field(..., min_length=1, max_length=100)
    category: str = Field(default="power_moves", max_length=50)
    recency: str = Field(default="mixed", pattern="^(recent|famous|mixed)$")
    count: int = Field(default=8, ge=1, le=20)


class PolishRequest(BaseModel):
    headline: str = Field(..., min_length=1, max_length=500)
    summary: str = Field(..., min_length=1, max_length=2000)
    source_url: str = Field(default="")
    source_name: str = Field(default="")
    niche: str = Field(..., min_length=1, max_length=100)


class ImageSourceRequest(BaseModel):
    source_type: str = Field(..., pattern="^(web_search|ai_generate)$")
    query: str = Field(..., min_length=1, max_length=300)
    fallback_query: Optional[str] = None


class SourceImagesRequest(BaseModel):
    images: List[ImageSourceRequest]


class TextVideoGenerateRequest(BaseModel):
    mode: str = Field(..., pattern="^(manual|semi_auto|full_auto)$")
    brands: List[str] = Field(default_factory=list)
    platforms: List[str] = Field(default_factory=list)
    niche: Optional[str] = None
    category: Optional[str] = None
    # Manual mode fields
    reel_text: Optional[str] = None
    thumbnail_title: Optional[str] = None
    image_paths: Optional[List[str]] = None
    # Semi-auto mode fields
    polished_data: Optional[dict] = None
    sourced_image_paths: Optional[List[str]] = None
    # Music
    music_source: str = Field(default="trending_random")


# --- Endpoints ---

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/upload-images")
async def upload_images(
    files: List[UploadFile] = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload images for manual text-video reel creation. Returns local file paths."""
    user_id = user["id"]
    upload_dir = Path("output/posts/uploads") / user_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    paths: list[str] = []
    for f in files:
        if f.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {f.content_type}")
        data = await f.read()
        if len(data) > MAX_IMAGE_SIZE:
            raise HTTPException(status_code=400, detail=f"File too large: {f.filename} (max 10 MB)")
        ext = Path(f.filename or "img.jpg").suffix or ".jpg"
        dest = upload_dir / f"{uuid.uuid4().hex}{ext}"
        dest.write_bytes(data)
        paths.append(str(dest))

    return {"paths": paths}


@router.post("/discover")
async def discover_stories(
    request: DiscoverRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Generate story candidates for the semi-auto mode via DeepSeek."""
    from app.services.discovery.story_polisher import StoryPolisher

    polisher = StoryPolisher()
    stories = []
    for _ in range(min(request.count, 5)):
        polished = polisher.generate_content(niche=request.niche)
        if polished:
            stories.append({
                "headline": polished.thumbnail_title,
                "summary": polished.reel_text,
                "source_url": "",
                "source_name": "DeepSeek AI",
                "published_at": None,
                "relevance_score": 1.0,
                "image_urls": [],
            })

    return {"stories": stories}


@router.post("/polish")
async def polish_story(
    request: PolishRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Generate polished viral reel content via DeepSeek."""
    from app.services.discovery.story_polisher import StoryPolisher

    polisher = StoryPolisher()
    polished = polisher.generate_content(niche=request.niche)

    if not polished:
        raise HTTPException(status_code=500, detail="Failed to generate content")

    return {"polished_story": polished.to_dict()}


@router.post("/source-images")
async def source_images(
    request: SourceImagesRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Source images based on search queries or AI generation prompts."""
    from app.services.discovery.story_polisher import ImagePlan
    from app.services.media.image_sourcer import ImageSourcer

    plans = [
        ImagePlan(
            source_type=img.source_type,
            query=img.query,
            fallback_query=img.fallback_query,
        )
        for img in request.images
    ]

    sourcer = ImageSourcer(db=db)
    paths = sourcer.source_images_batch(plans)

    results = []
    for i, path in enumerate(paths):
        if path and path.exists():
            results.append({"index": i, "path": str(path), "success": True})
        else:
            results.append({"index": i, "path": None, "success": False})

    return {"images": results}


@router.post("/generate")
async def generate_text_video_reel(
    request: TextVideoGenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Generate a TEXT-VIDEO reel. Creates a job IMMEDIATELY and processes in background.
    The user is navigated to the job page right away — no waiting.

    Supports 3 modes:
    - manual: user provides text + images → job created with that data → compose in bg
    - semi_auto: polished story provided → job created → source images + compose in bg
    - full_auto: job created INSTANTLY → discover + polish + source + compose ALL in bg
    """
    user_id = user["id"]

    polished_data = None

    if request.mode == "full_auto":
        # full_auto: create job immediately with placeholder, do everything in background
        manager = JobManager(db)
        job = manager.create_job(
            user_id=user_id,
            title="Generating content...",
            content_lines=[],
            brands=request.brands,
            variant="text_video",
            platforms=request.platforms,
            fixed_title=False,
            created_by="user",
            music_source=request.music_source,
            content_format="text_video",
            text_video_data={},
        )

        job_id = job.job_id
        job_dict = job.to_dict()

        # Everything happens in background — generate content, generate images, compose
        background_tasks.add_task(
            _process_full_auto_text_video_async,
            job_id,
            request.niche or "business",
            request.category or "power_moves",
        )

        return {
            "status": "created",
            "job_id": job_id,
            "message": "Text-video job created — generating content in background",
            "job": job_dict,
        }

    elif request.mode == "semi_auto":
        if not request.polished_data:
            raise HTTPException(status_code=400, detail="polished_data required for semi_auto mode")
        polished_data = request.polished_data

    elif request.mode == "manual":
        if not request.reel_text:
            raise HTTPException(status_code=400, detail="reel_text required for manual mode")

        word_count = len(request.reel_text.split())
        if word_count > 60:
            raise HTTPException(status_code=400, detail=f"Reel text exceeds 60 words ({word_count}). Shorten it to maintain layout quality.")

        polished_data = {
            "reel_text": request.reel_text,
            "reel_lines": request.reel_text.split("\n"),
            "thumbnail_title": request.thumbnail_title or "",
            "thumbnail_title_lines": (request.thumbnail_title or "").split("\n"),
            "images": [{"source_type": "web_search", "query": request.reel_text[:80]}] if not request.image_paths else [],
        }

        # For manual mode with uploaded images, store paths in polished_data
        if request.image_paths:
            polished_data["uploaded_image_paths"] = request.image_paths

    # Create job via JobManager (same as text-based reels)
    manager = JobManager(db)
    job = manager.create_job(
        user_id=user_id,
        title=polished_data.get("thumbnail_title", "Text-Video Reel"),
        content_lines=polished_data.get("reel_lines", []),
        brands=request.brands,
        variant="text_video",
        platforms=request.platforms,
        fixed_title=True,
        created_by="user",
        music_source=request.music_source,
        content_format="text_video",
        text_video_data=polished_data,
    )

    job_id = job.job_id
    job_dict = job.to_dict()

    # Process in background (same pattern as text-based reels)
    background_tasks.add_task(_process_text_video_job_async, job_id)

    return {
        "status": "created",
        "job_id": job_id,
        "message": "Text-video job created and queued for processing",
        "job": job_dict,
    }


import threading
_tv_job_semaphore = threading.Semaphore(2)


def _process_full_auto_text_video_async(job_id: str, niche: str, category: str):
    """
    Background task for full_auto text-video: generate content via DeepSeek → update job → compose.
    The job was already created with a placeholder title so the user sees it instantly.
    """
    import traceback
    import sys

    print(f"\n{'='*60}", flush=True)
    print(f"📹 TEXT-VIDEO FULL-AUTO BACKGROUND TASK STARTED", flush=True)
    print(f"   Job ID: {job_id}  Niche: {niche}", flush=True)
    print(f"{'='*60}", flush=True)
    sys.stdout.flush()

    _tv_job_semaphore.acquire()
    try:
        with get_db_session() as db:
            manager = JobManager(db)

            # Step 1: Generate content + image prompts via DeepSeek
            manager.update_job_status(job_id, "generating")
            from app.services.discovery.story_polisher import StoryPolisher

            polisher = StoryPolisher()
            polished = polisher.generate_content(niche=niche)
            if not polished:
                manager.update_job_status(job_id, "failed", error_message="Failed to generate content")
                return

            polished_data = polished.to_dict()

            # Step 2: Update job with real data (title, content, text_video_data)
            job = manager.get_job(job_id)
            if job:
                job.title = polished_data.get("thumbnail_title", "Text-Video Reel")
                job.content_lines = polished_data.get("reel_lines", [])
                job.text_video_data = polished_data
                job.fixed_title = True
                db.commit()

            # Step 3: Process (generate images via DeAPI, compose video, upload)
            processor = JobProcessor(db)
            result = processor.process_job(job_id)

            print(f"\n✅ TEXT-VIDEO FULL-AUTO COMPLETED: {job_id}", flush=True)
            print(f"   Result: {result}", flush=True)
            sys.stdout.flush()

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"\n❌ TEXT-VIDEO FULL-AUTO FAILED: {error_msg}", flush=True)
        traceback.print_exc()
        sys.stdout.flush()

        try:
            with get_db_session() as db:
                manager = JobManager(db)
                manager.update_job_status(job_id, "failed", error_message=error_msg)
        except Exception:
            pass
    finally:
        _tv_job_semaphore.release()


def _process_text_video_job_async(job_id: str):
    """Background task to process a text-video job."""
    import traceback
    import sys

    print(f"\n{'='*60}", flush=True)
    print(f"📹 TEXT-VIDEO BACKGROUND TASK STARTED", flush=True)
    print(f"   Job ID: {job_id}", flush=True)
    print(f"{'='*60}", flush=True)
    sys.stdout.flush()

    _tv_job_semaphore.acquire()
    try:
        with get_db_session() as db:
            processor = JobProcessor(db)
            result = processor.process_job(job_id)

            print(f"\n{'='*60}", flush=True)
            print(f"✅ TEXT-VIDEO JOB COMPLETED", flush=True)
            print(f"   Job ID: {job_id}", flush=True)
            print(f"   Result: {result}", flush=True)
            print(f"{'='*60}\n", flush=True)
            sys.stdout.flush()

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"\n❌ TEXT-VIDEO JOB FAILED: {error_msg}", flush=True)
        traceback.print_exc()
        sys.stdout.flush()

        try:
            with get_db_session() as db:
                manager = JobManager(db)
                manager.update_job_status(job_id, "failed", error_message=error_msg)
        except Exception:
            pass
    finally:
        _tv_job_semaphore.release()


@router.get("/story-pool")
async def get_story_pool(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get user's story pool for dedup visibility."""
    user_id = user["id"]

    stories = (
        db.query(StoryPool)
        .filter(StoryPool.user_id == user_id)
        .order_by(StoryPool.created_at.desc())
        .limit(100)
        .all()
    )

    return {
        "stories": [s.to_dict() for s in stories]
    }
