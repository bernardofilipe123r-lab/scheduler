"""
Music management API — upload, list, delete per-user background music tracks.
Max 20 tracks per user. Weighted random selection during reel video generation.
"""
import uuid
import logging
from typing import Dict, Any, List

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.auth.middleware import get_current_user
from app.db_connection import get_db
from app.models.user_music import UserMusic
from app.services.storage.supabase_storage import (
    delete_file as storage_delete,
    storage_path,
    upload_file,
)
from app.utils.ffmpeg import get_audio_duration_from_bytes

logger = logging.getLogger(__name__)

MAX_MUSIC_PER_USER = 20
ALLOWED_EXTENSIONS = {".mp3", ".m4a", ".wav", ".aac", ".ogg"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

router = APIRouter(prefix="/api/music", tags=["music"])


@router.get("", response_model=None)
async def list_music(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """List all music tracks for the current user."""
    tracks = (
        db.query(UserMusic)
        .filter(UserMusic.user_id == user["id"])
        .order_by(UserMusic.created_at)
        .all()
    )
    return {
        "tracks": [t.to_dict() for t in tracks],
        "count": len(tracks),
        "max": MAX_MUSIC_PER_USER,
    }


@router.post("", status_code=status.HTTP_201_CREATED, response_model=None)
async def upload_music(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Upload a new music track (max 20 per user, max 20 MB)."""
    user_id: str = user["id"]

    # Check limit
    count = db.query(UserMusic).filter(UserMusic.user_id == user_id).count()
    if count >= MAX_MUSIC_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_MUSIC_PER_USER} music tracks allowed. Delete one first.",
        )

    # Validate extension
    filename = file.filename or "track.mp3"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Read and check size
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large ({len(data) / 1024 / 1024:.1f} MB). Max {MAX_FILE_SIZE // 1024 // 1024} MB.",
        )

    track_id = str(uuid.uuid4())
    safe_filename = f"{track_id}{ext}"

    # Upload to Supabase Storage
    remote = storage_path(user_id, None, "music", safe_filename)
    content_type = file.content_type or "audio/mpeg"
    storage_url = upload_file("media", remote, data, content_type)

    # Probe duration
    duration = get_audio_duration_from_bytes(data, ext)

    # Persist
    track = UserMusic(
        id=track_id,
        user_id=user_id,
        filename=filename,
        storage_url=storage_url,
        duration_seconds=duration,
    )
    db.add(track)
    db.commit()
    db.refresh(track)

    return {"track": track.to_dict()}


@router.delete("/{track_id}", response_model=None)
async def delete_music(
    track_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Delete a music track."""
    track = (
        db.query(UserMusic)
        .filter(UserMusic.id == track_id, UserMusic.user_id == user["id"])
        .first()
    )
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Delete from storage
    try:
        url = track.storage_url
        # Extract bucket path from public URL: .../object/public/media/<path>
        marker = "/object/public/media/"
        idx = url.find(marker)
        if idx != -1:
            remote_path = url[idx + len(marker):]
            storage_delete("media", remote_path)
    except Exception as e:
        logger.warning("Failed to delete music file from storage: %s", e)

    db.delete(track)
    db.commit()

    return {"success": True, "message": "Track deleted"}


@router.patch("/{track_id}/weight", response_model=None)
async def update_weight(
    track_id: str,
    weight: int = Body(..., ge=0, le=100, embed=True),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update the selection weight (0–100) for a music track."""
    track = (
        db.query(UserMusic)
        .filter(UserMusic.id == track_id, UserMusic.user_id == user["id"])
        .first()
    )
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    track.weight = weight
    db.commit()
    db.refresh(track)
    return {"track": track.to_dict()}
