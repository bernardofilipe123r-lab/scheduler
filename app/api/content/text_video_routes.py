"""API routes for TEXT-VIDEO reel generation."""

import logging
import uuid
from dataclasses import asdict
from typing import Optional, List
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.api.auth.middleware import get_current_user
from app.models.story_pool import StoryPool
from app.models.text_video_design import TextVideoDesign

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
    brand_ids: List[str] = Field(default_factory=list)
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
    """Discover story candidates for the semi-auto mode."""
    from app.services.discovery.story_discoverer import StoryDiscoverer

    discoverer = StoryDiscoverer(db=db)
    stories = discoverer.discover_stories(
        niche=request.niche,
        category=request.category,
        recency=request.recency,
        count=request.count,
    )

    return {
        "stories": [
            {
                "headline": s.headline,
                "summary": s.summary,
                "source_url": s.source_url,
                "source_name": s.source_name,
                "published_at": s.published_at.isoformat() if s.published_at else None,
                "relevance_score": s.relevance_score,
                "image_urls": s.image_urls,
            }
            for s in stories
        ]
    }


@router.post("/polish")
async def polish_story(
    request: PolishRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Polish a selected story into viral reel format."""
    from app.services.discovery.story_discoverer import RawStory
    from app.services.discovery.story_polisher import StoryPolisher

    raw_story = RawStory(
        headline=request.headline,
        summary=request.summary,
        source_url=request.source_url,
        source_name=request.source_name,
    )

    polisher = StoryPolisher()
    polished = polisher.polish_story(raw_story, niche=request.niche)

    if not polished:
        raise HTTPException(status_code=500, detail="Failed to polish story")

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
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Generate a TEXT-VIDEO reel. Supports 3 modes:
    - manual: user provides text + images
    - semi_auto: polished story provided, source images + compose
    - full_auto: discover + polish + source + compose
    """
    user_id = user["id"]

    from app.services.discovery.story_discoverer import StoryDiscoverer, RawStory
    from app.services.discovery.story_polisher import StoryPolisher, ImagePlan
    from app.services.media.image_sourcer import ImageSourcer
    from app.services.media.thumbnail_compositor import ThumbnailCompositor
    from app.services.media.slideshow_compositor import SlideshowCompositor

    polished_data = None
    image_file_paths: list[Path] = []

    if request.mode == "full_auto":
        niche = request.niche or "business"
        category = request.category or "power_moves"

        # 1. Discover
        discoverer = StoryDiscoverer(db=db)
        stories = discoverer.discover_stories(
            niche=niche, category=category, recency="mixed", count=5
        )
        if not stories:
            raise HTTPException(status_code=404, detail="No stories found")

        # 2. Polish
        polisher = StoryPolisher()
        polished = polisher.polish_story(stories[0], niche=niche)
        if not polished:
            raise HTTPException(status_code=500, detail="Failed to polish story")

        polished_data = polished.to_dict()

        # 3. Source images
        sourcer = ImageSourcer(db=db)
        paths = sourcer.source_images_batch(polished.images)
        image_file_paths = [p for p in paths if p and p.exists()]

        # Source thumbnail image
        thumb_img = sourcer.source_image(polished.thumbnail_image)

    elif request.mode == "semi_auto":
        if not request.polished_data:
            raise HTTPException(status_code=400, detail="polished_data required for semi_auto mode")

        polished_data = request.polished_data

        if request.sourced_image_paths:
            image_file_paths = [Path(p) for p in request.sourced_image_paths if Path(p).exists()]
        else:
            # Source images from polished data
            from app.services.discovery.story_polisher import ImagePlan
            plans = [
                ImagePlan(**img) for img in polished_data.get("images", [])
            ]
            sourcer = ImageSourcer(db=db)
            paths = sourcer.source_images_batch(plans)
            image_file_paths = [p for p in paths if p and p.exists()]

        thumb_data = polished_data.get("thumbnail_image", {})
        thumb_img = None
        if thumb_data:
            sourcer = ImageSourcer(db=db)
            thumb_img = sourcer.source_image(ImagePlan(**thumb_data))

    elif request.mode == "manual":
        if not request.reel_text:
            raise HTTPException(status_code=400, detail="reel_text required for manual mode")

        # Enforce max 60 words for layout stability
        word_count = len(request.reel_text.split())
        if word_count > 60:
            raise HTTPException(status_code=400, detail=f"Reel text exceeds 60 words ({word_count}). Shorten it to maintain layout quality.")

        polished_data = {
            "reel_text": request.reel_text,
            "reel_lines": request.reel_text.split("\n"),
            "thumbnail_title": request.thumbnail_title or "",
            "thumbnail_title_lines": (request.thumbnail_title or "").split("\n"),
        }

        if request.image_paths:
            image_file_paths = [Path(p) for p in request.image_paths if Path(p).exists()]

        thumb_img = image_file_paths[0] if image_file_paths else None

    if not image_file_paths:
        raise HTTPException(status_code=400, detail="No images available for reel composition")

    # Get user's design preferences
    design = db.query(TextVideoDesign).filter(TextVideoDesign.user_id == user_id).first()

    # Compose thumbnail
    thumb_compositor = ThumbnailCompositor()
    thumbnail_path = thumb_compositor.compose_thumbnail(
        main_image_path=thumb_img or image_file_paths[0],
        title_lines=polished_data.get("thumbnail_title_lines", []),
        design=design,
    )

    # Compose reel video
    reel_lines = polished_data.get("reel_lines", [])
    output_path = Path(f"output/videos/text_video_{user_id}_{int(__import__('time').time())}.mp4")

    compositor = SlideshowCompositor()
    result_path = compositor.compose_reel(
        image_paths=image_file_paths,
        reel_lines=reel_lines,
        output_path=output_path,
        design=design,
    )

    if not result_path:
        raise HTTPException(status_code=500, detail="Video composition failed")

    # Create generation job
    from app.models.jobs import GenerationJob
    import uuid

    job = GenerationJob(
        job_id=str(uuid.uuid4()),
        user_id=user_id,
        title=polished_data.get("thumbnail_title", "Text-Video Reel"),
        content_lines=polished_data.get("reel_lines", []),
        brands=request.brand_ids,
        platforms=request.platforms,
        content_format="text_video",
        text_video_data=polished_data,
        status="completed",
    )
    db.add(job)
    db.commit()

    return {
        "job_id": job.job_id,
        "status": "completed",
        "video_path": str(result_path),
        "thumbnail_path": str(thumbnail_path),
        "polished_data": polished_data,
    }


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
