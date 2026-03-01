"""
Helper to pick a random user-uploaded music track for video generation.
"""
import random
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models.user_music import UserMusic

logger = logging.getLogger(__name__)


def get_random_user_music_url(db: Session, user_id: str) -> Optional[str]:
    """Return the storage URL of a random music track for the given user, or None."""
    tracks = (
        db.query(UserMusic.storage_url)
        .filter(UserMusic.user_id == user_id)
        .all()
    )
    if not tracks:
        return None
    return random.choice(tracks)[0]
