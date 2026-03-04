"""
Helper to pick music for video generation.

Supports:
- Trending TikTok music (random from top 50 or specific track)
- User-uploaded tracks (legacy, weighted-random)
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


def resolve_music_url(db: Session, user_id: str, music_track_id: Optional[str] = None,
                      music_source: Optional[str] = None) -> Optional[str]:
    """
    Resolve the music URL based on music_source and music_track_id.

    music_source values:
      - 'none' / None → no music
      - 'trending_random'  → random from top 50 trending
      - 'trending_pick'    → specific trending track (music_track_id = trending_music.id)
      - (legacy) if music_source is not set but music_track_id is, treat as user-uploaded
    """
    source = (music_source or "none").strip().lower()

    if source == "trending_random":
        from app.services.media.trending_music_fetcher import get_random_trending_url
        url = get_random_trending_url(db)
        if url:
            logger.info("Using random trending music for user %s", user_id)
            return url
        logger.warning("No trending music available, falling back to no music")
        return None

    if source == "trending_pick" and music_track_id:
        from app.services.media.trending_music_fetcher import get_trending_track_by_id
        track = get_trending_track_by_id(db, music_track_id)
        if track:
            logger.info("Using trending track '%s' for user %s", track.title, user_id)
            return track.play_url
        logger.warning("Trending track %s not found, falling back to no music", music_track_id)
        return None

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
