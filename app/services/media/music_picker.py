"""
Helper to pick a weighted-random user-uploaded music track for video generation.
"""
import random
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models.user_music import UserMusic

logger = logging.getLogger(__name__)


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


def resolve_music_url(db: Session, user_id: str, music_track_id: Optional[str] = None) -> Optional[str]:
    """Resolve the music URL: use specific track if given, else weighted random."""
    if music_track_id:
        url = get_music_url_by_id(db, user_id, music_track_id)
        if url:
            return url
        logger.warning("Track %s not found for user %s, falling back to random", music_track_id, user_id)
    return get_random_user_music_url(db, user_id)
