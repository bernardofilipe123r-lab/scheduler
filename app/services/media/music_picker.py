"""
Helper to pick music for video generation.

Supports:
- Admin-managed music library (assets/music/ directory)
- User-uploaded tracks (legacy, weighted-random)
"""
import random
import logging
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.models.user_music import UserMusic

logger = logging.getLogger(__name__)

# Admin-managed music library — MP3 files uploaded via admin panel
_ASSETS_MUSIC_DIR = Path(__file__).resolve().parent.parent.parent / "assets" / "music"


def get_random_local_music_path() -> Optional[Path]:
    """Return a random local .mp3 file from assets/music/."""
    if not _ASSETS_MUSIC_DIR.is_dir():
        logger.warning("Local music directory not found: %s", _ASSETS_MUSIC_DIR)
        return None
    mp3_files = list(_ASSETS_MUSIC_DIR.glob("*.mp3"))
    if not mp3_files:
        logger.warning("No local .mp3 files in %s", _ASSETS_MUSIC_DIR)
        return None
    chosen = random.choice(mp3_files)
    logger.info("Using music: %s", chosen.name)
    return chosen


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

    music_source values:
      - 'none' / None       → no music (unless music_track_id is set → legacy user-uploaded)
      - 'trending_random'   → (deprecated) pick random local music
      - 'trending_pick'     → (deprecated) pick random local music
      - (legacy) if music_track_id is set without music_source → user-uploaded
    """
    source = (music_source or "none").strip().lower()

    # Deprecated trending sources → just use local music library
    if source in ("trending_random", "trending_pick"):
        return None  # Caller will fall back to get_random_local_music_path()

    if source == "none" or source == "":
        # Legacy path: if music_track_id is set without music_source, use user-uploaded
        if music_track_id:
            url = get_music_url_by_id(db, user_id, music_track_id)
            if url:
                return url
            logger.warning("Track %s not found for user %s, falling back to random", music_track_id, user_id)
            return get_random_user_music_url(db, user_id)
        return None

    logger.warning("Unknown music_source '%s', returning None", source)
    return None
