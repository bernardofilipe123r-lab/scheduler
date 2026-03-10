"""
Threads content API routes.

Handles text-only content generation and publishing for Threads.
Supports single posts, thread chains, and bulk generation.
"""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth.middleware import get_current_user
from app.db_connection import get_db
from app.models.brands import Brand
from app.models.scheduling import ScheduledReel


router = APIRouter(prefix="/api/threads", tags=["threads"])


# ── Pydantic schemas ─────────────────────────────────────────────────

class GenerateSingleRequest(BaseModel):
    brand_id: str
    format_type: Optional[str] = None
    topic_hint: Optional[str] = None


class GenerateChainRequest(BaseModel):
    brand_id: str
    num_parts: int = Field(default=6, ge=2, le=12)
    topic_hint: Optional[str] = None


class BulkGenerateRequest(BaseModel):
    brand_id: str
    count: int = Field(default=4, ge=1, le=10)
    topic_hints: Optional[List[str]] = None


class PublishSingleRequest(BaseModel):
    brand_id: str
    text: str = Field(..., max_length=500)


class PublishChainRequest(BaseModel):
    brand_id: str
    parts: List[str] = Field(..., min_length=2, max_length=12)


class ScheduleThreadRequest(BaseModel):
    brand_id: str
    text: str = Field(..., max_length=500)
    scheduled_time: str
    is_chain: bool = False
    chain_parts: Optional[List[str]] = None


class AutoScheduleRequest(BaseModel):
    brand_id: str
    text: str = Field(..., max_length=500)
    is_chain: bool = False
    chain_parts: Optional[List[str]] = None


# ── Helpers ───────────────────────────────────────────────────────────

def _get_user_brand(db: Session, user_id: str, brand_id: str) -> Brand:
    """Get a brand ensuring it belongs to the user."""
    brand = db.query(Brand).filter(
        Brand.id == brand_id,
        Brand.user_id == user_id,
        Brand.active == True,
    ).first()
    if not brand:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Brand '{brand_id}' not found or not accessible",
        )
    return brand


def _get_prompt_context(user_id: str):
    """Build PromptContext from user's NicheConfig."""
    from app.services.content.niche_config_service import NicheConfigService
    return NicheConfigService().get_context(user_id=user_id)


def _get_publisher(brand: Brand):
    """Build a SocialPublisher for the brand."""
    from app.services.brands.resolver import brand_resolver
    brand_config = brand_resolver.get_brand_config(brand.id) or brand_resolver.get_brand_config(brand.display_name)
    if not brand_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No publishing config found for brand '{brand.display_name}'",
        )
    from app.services.publishing.social_publisher import SocialPublisher
    return SocialPublisher(brand_config=brand_config)


# ── Generation endpoints ──────────────────────────────────────────────

@router.post("/generate")
async def generate_single_post(
    request: GenerateSingleRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Generate a single Threads text post using AI."""
    _get_user_brand(db, user["id"], request.brand_id)
    ctx = _get_prompt_context(user["id"])

    from app.services.content.threads_generator import ThreadsGenerator
    generator = ThreadsGenerator()

    result = await asyncio.to_thread(
        generator.generate_single_post,
        ctx=ctx,
        format_type=request.format_type,
        topic_hint=request.topic_hint,
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate Threads post. Check AI service availability.",
        )

    return {"status": "ok", "post": result}


@router.post("/generate-chain")
async def generate_chain(
    request: GenerateChainRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Generate a multi-post thread chain using AI."""
    _get_user_brand(db, user["id"], request.brand_id)
    ctx = _get_prompt_context(user["id"])

    from app.services.content.threads_generator import ThreadsGenerator
    generator = ThreadsGenerator()

    result = await asyncio.to_thread(
        generator.generate_thread_chain,
        ctx=ctx,
        num_parts=request.num_parts,
        topic_hint=request.topic_hint,
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate thread chain. Check AI service availability.",
        )

    return {"status": "ok", "chain": result}


@router.post("/generate-bulk")
async def generate_bulk(
    request: BulkGenerateRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Generate multiple Threads posts at once."""
    _get_user_brand(db, user["id"], request.brand_id)
    ctx = _get_prompt_context(user["id"])

    from app.services.content.threads_generator import ThreadsGenerator
    generator = ThreadsGenerator()

    posts = await asyncio.to_thread(
        generator.generate_bulk,
        ctx=ctx,
        count=request.count,
        topic_hints=request.topic_hints,
    )

    return {"status": "ok", "posts": posts, "count": len(posts)}


# ── Publishing endpoints ──────────────────────────────────────────────

@router.post("/publish")
async def publish_single(
    request: PublishSingleRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Publish a single text post to Threads immediately."""
    brand = _get_user_brand(db, user["id"], request.brand_id)

    if not brand.threads_access_token or not brand.threads_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Threads is not connected for this brand. Connect it in Brand settings.",
        )

    publisher = _get_publisher(brand)
    result = await asyncio.to_thread(
        publisher.publish_threads_post,
        caption=request.text,
        media_type="TEXT",
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Threads publish failed"),
        )

    return {"status": "published", "post_id": result.get("post_id"), "platform": "threads"}


@router.post("/publish-chain")
async def publish_chain(
    request: PublishChainRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Publish a multi-post thread chain to Threads immediately."""
    brand = _get_user_brand(db, user["id"], request.brand_id)

    if not brand.threads_access_token or not brand.threads_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Threads is not connected for this brand. Connect it in Brand settings.",
        )

    # Validate each part
    for i, part in enumerate(request.parts):
        if len(part) > 500:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Part {i + 1} exceeds 500 character limit ({len(part)} chars)",
            )

    publisher = _get_publisher(brand)
    result = await asyncio.to_thread(
        publisher.publish_threads_chain,
        parts=request.parts,
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Thread chain publish failed"),
        )

    return {
        "status": "published",
        "post_id": result.get("post_id"),
        "post_ids": result.get("post_ids", []),
        "platform": "threads",
    }


# ── Scheduling endpoints ─────────────────────────────────────────────

@router.post("/schedule")
async def schedule_thread(
    request: ScheduleThreadRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Schedule a Threads post or chain for future publishing."""
    brand = _get_user_brand(db, user["id"], request.brand_id)

    if not brand.threads_access_token or not brand.threads_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Threads is not connected for this brand.",
        )

    # Parse scheduled time
    try:
        scheduled_dt = datetime.fromisoformat(
            request.scheduled_time.replace("Z", "+00:00")
        )
        if scheduled_dt.tzinfo is not None:
            scheduled_dt = scheduled_dt.astimezone(timezone.utc)
        else:
            scheduled_dt = scheduled_dt.replace(tzinfo=timezone.utc)

        if scheduled_dt <= datetime.now(timezone.utc):
            raise ValueError("Must be in the future")
    except (ValueError, TypeError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid scheduled time: {e}",
        )

    schedule_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    extra_data = {
        "brand": request.brand_id,
        "content_type": "threads_post",
        "platforms": ["threads"],
        "manual": True,
        "variant": "threads",
        "is_chain": request.is_chain,
    }

    if request.is_chain and request.chain_parts:
        extra_data["chain_parts"] = request.chain_parts

    entry = ScheduledReel(
        schedule_id=schedule_id,
        user_id=user["id"],
        user_name=user.get("email", "Web User"),
        reel_id=f"threads_{request.brand_id}_{str(uuid.uuid4())[:8]}",
        caption=request.text,
        scheduled_time=scheduled_dt,
        created_at=now,
        status="scheduled",
        created_by="user",
        extra_data=extra_data,
    )

    db.add(entry)
    db.commit()

    return {
        "status": "scheduled",
        "schedule_id": schedule_id,
        "scheduled_for": scheduled_dt.isoformat(),
    }


@router.post("/auto-schedule")
async def auto_schedule_thread(
    request: AutoScheduleRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Auto-schedule a Threads post to the next available brand slot.

    Uses the same posting hours as Instagram reels (6/day, 4h apart)
    offset by the brand's schedule_offset.
    """
    from datetime import timedelta

    brand = _get_user_brand(db, user["id"], request.brand_id)

    if not brand.threads_access_token or not brand.threads_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Threads is not connected for this brand.",
        )

    # Same slot hours as Instagram reels
    BASE_THREAD_HOURS = [0, 4, 8, 12, 16, 20]
    SLOT_FUZZY_MINUTES = 15
    offset_hours = brand.schedule_offset or 0
    now = datetime.now(timezone.utc)

    # Get already-scheduled threads for this brand in the next 7 days
    horizon = now + timedelta(days=7)
    scheduled = (
        db.query(ScheduledReel)
        .filter(
            ScheduledReel.user_id == user["id"],
            ScheduledReel.scheduled_time >= now,
            ScheduledReel.scheduled_time <= horizon,
            ScheduledReel.status.in_(["scheduled", "publishing", "partial", "published"]),
        )
        .all()
    )

    def _slot_is_filled(slot_time: datetime) -> bool:
        for s in scheduled:
            ed = s.extra_data or {}
            if ed.get("brand") != request.brand_id:
                continue
            if ed.get("content_type") != "threads_post":
                continue
            diff = abs((s.scheduled_time - slot_time).total_seconds())
            if diff <= SLOT_FUZZY_MINUTES * 60:
                return True
        return False

    # Find next empty thread slot
    next_slot = None
    for day_offset in range(7):
        day = now.date() + timedelta(days=day_offset)
        for base_hour in BASE_THREAD_HOURS:
            hour = (base_hour + offset_hours) % 24
            slot_time = datetime(day.year, day.month, day.day, hour, 0, tzinfo=timezone.utc)
            if slot_time <= now:
                continue
            if not _slot_is_filled(slot_time):
                next_slot = slot_time
                break
        if next_slot:
            break

    if not next_slot:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No available thread slots in the next 7 days.",
        )

    schedule_id = str(uuid.uuid4())
    extra_data = {
        "brand": request.brand_id,
        "content_type": "threads_post",
        "platforms": ["threads"],
        "manual": True,
        "variant": "threads",
        "is_chain": request.is_chain,
    }
    if request.is_chain and request.chain_parts:
        extra_data["chain_parts"] = request.chain_parts

    entry = ScheduledReel(
        schedule_id=schedule_id,
        user_id=user["id"],
        user_name=user.get("email", "Web User"),
        reel_id=f"threads_{request.brand_id}_{str(uuid.uuid4())[:8]}",
        caption=request.text,
        scheduled_time=next_slot,
        created_at=now,
        status="scheduled",
        created_by="user",
        extra_data=extra_data,
    )

    db.add(entry)
    db.commit()

    return {
        "status": "scheduled",
        "schedule_id": schedule_id,
        "scheduled_for": next_slot.isoformat(),
    }


# ── Format types endpoint ────────────────────────────────────────────

@router.get("/format-types")
async def get_format_types(user: dict = Depends(get_current_user)):
    """Return available Threads post format types."""
    from app.services.content.threads_generator import THREAD_FORMAT_TYPES
    return {
        "format_types": [
            {"id": k, "name": v["name"], "description": v["description"]}
            for k, v in THREAD_FORMAT_TYPES.items()
        ]
    }
