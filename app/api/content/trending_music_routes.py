"""
Trending music API — list trending TikTok music for reel video creation.
"""
import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth.middleware import get_current_user, is_admin_user
from app.db_connection import get_db
from app.services.media.trending_music_fetcher import (
    get_trending_sample,
    get_trending_tracks,
    get_trending_track_by_id,
    get_latest_batch_id,
    fetch_trending_music,
    cleanup_old_batches,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/trending-music", tags=["trending-music"])


@router.get("", response_model=None)
async def list_trending_music(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return 10 random trending tracks from the latest batch (for user selection)."""
    sample = get_trending_sample(db, count=10)
    return {
        "tracks": [t.to_dict() for t in sample],
        "count": len(sample),
        "batch_id": get_latest_batch_id(db),
    }


@router.get("/all", response_model=None)
async def list_all_trending(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return all tracks from the latest batch (up to 50)."""
    tracks = get_trending_tracks(db, limit=50)
    return {
        "tracks": [t.to_dict() for t in tracks],
        "count": len(tracks),
        "batch_id": get_latest_batch_id(db),
    }


@router.get("/{track_id}", response_model=None)
async def get_trending_track(
    track_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get a specific trending track by ID."""
    track = get_trending_track_by_id(db, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Trending track not found")
    return {"track": track.to_dict()}


@router.post("/fetch", response_model=None)
async def trigger_fetch(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Admin-only: manually trigger a trending music fetch."""
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    result = fetch_trending_music(db)
    cleanup_old_batches(db, keep_days=3)
    return result
