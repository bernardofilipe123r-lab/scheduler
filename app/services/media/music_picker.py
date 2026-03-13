"""
Helper to pick music for video generation.

Supports:
- Admin-managed music library (Supabase Storage, tracked in music_library table)
- User-uploaded tracks (legacy, weighted-random)
"""
import random
import logging
import tempfile
from pathlib import Path
from typing import Optional

import requests
from sqlalchemy.orm import Session
from sqlalchemy import func as sqla_func

from app.models.user_music import UserMusic

logger = logging.getLogger(__name__)


def get_random_music_url() -> Optional[str]:
    """Return the Supabase Storage URL for a random admin music track, or None."""
    from app.db_connection import SessionLocal
    db = SessionLocal()
    try:
        from app.models.music_library import MusicLibrary
        track = db.query(MusicLibrary.storage_url).order_by(sqla_func.random()).first()
        return track[0] if track else None
    finally:
        db.close()


def get_random_local_music_path() -> Optional[Path]:
    """Return a temp file with a random admin music track downloaded from Supabase Storage.

    Downloads the file to a temp path so FFmpeg can use it directly.
    Returns None if no tracks are available or download fails.
    """
    url = get_random_music_url()
    if not url:
        logger.warning("No tracks in music_library table")
        return None

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
        tmp.write(resp.content)
        tmp.close()
        logger.info("Downloaded admin music track to %s (%d bytes)", tmp.name, len(resp.content))
        return Path(tmp.name)
    except Exception as e:
        logger.error("Failed to download admin music from %s: %s", url[:80], e)
        return None


def get_random_user_music_url(db: Session, user_id: str) -> Optional[str]:
    """Return the storage URL of a weighted-random music track, or None.

    Tracks with weight=0 are excluded. Selection probability is proportional
    to each track's weight (e.g. weight 200 is twice as likely as weight 100).
    """
    tracks = (
        db.query(UserMusic.storage_url, UserMusic.weight)
        .filter(UserMusic.user_id == user_id, UserMusic.weight > 0)
        .all()
    )
    if not tracks:
        return None
    urls = [t[0] for t in tracks]
    weights = [t[1] for t in tracks]
    return random.choices(urls, weights=weights, k=1)[0]


def get_music_url_by_id(db: Session, user_id: str, track_id: str) -> Optional[str]:
    """Return the storage URL for a specific track, or None if not found."""
    track = (
        db.query(UserMusic.storage_url)
        .filter(UserMusic.id == track_id, UserMusic.user_id == user_id)
        .first()
    )
    return track[0] if track else None


def resolve_music_url(db: Session, user_id: str, music_track_id: Optional[str] = None,
                      music_source: Optional[str] = None) -> Optional[str]:
    """
    Resolve the music URL based on music_source and music_track_id.

    Falls back to the admin music library if no user-specific track is found.
    """
    source = (music_source or "none").strip().lower()

    # Deprecated trending sources → use admin music library
    if source in ("trending_random", "trending_pick"):
        return get_random_music_url()

    if source == "none" or source == "":
        # Legacy path: if music_track_id is set, try user-uploaded first
        if music_track_id:
            url = get_music_url_by_id(db, user_id, music_track_id)
            if url:
                return url
            logger.warning("Track %s not found for user %s, falling back", music_track_id, user_id)
            return get_random_user_music_url(db, user_id) or get_random_music_url()
        # No specific track requested — use admin music library
        return get_random_music_url()

    logger.warning("Unknown music_source '%s', falling back to admin music", source)
    return get_random_music_url()
