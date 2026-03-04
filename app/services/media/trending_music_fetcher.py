"""
TikTok trending music fetcher — calls the TikTok Trending Data API (RapidAPI)
up to 3 times per day and stores trending tracks in the database.
"""
import logging
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import requests
from sqlalchemy.orm import Session

from app.models.trending_music import TrendingMusic, TrendingMusicFetch

logger = logging.getLogger(__name__)

RAPIDAPI_HOST = "tiktok-trending-data.p.rapidapi.com"
RAPIDAPI_URL = f"https://{RAPIDAPI_HOST}/m"
MAX_FETCHES_PER_DAY = 3
REQUEST_TIMEOUT = 30


def _get_api_key() -> Optional[str]:
    """Return the RapidAPI key from environment."""
    return os.getenv("RAPIDAPI_KEY")


def _fetches_today(db: Session) -> int:
    """Count how many fetches have been made today (UTC)."""
    start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(TrendingMusicFetch)
        .filter(TrendingMusicFetch.fetched_at >= start_of_day)
        .count()
    )


def can_fetch(db: Session) -> bool:
    """Check if we haven't exceeded the 3x/day limit."""
    return _fetches_today(db) < MAX_FETCHES_PER_DAY


def get_latest_batch_id(db: Session) -> Optional[str]:
    """Return the most recent batch_id, or None if no data."""
    latest = (
        db.query(TrendingMusicFetch)
        .order_by(TrendingMusicFetch.fetched_at.desc())
        .first()
    )
    return latest.id if latest else None


def _parse_tracks(raw: Any) -> List[Dict]:
    """
    Parse the API response into a list of track dicts.

    The TikTok Trending Data API may return:
    - A list of track objects directly
    - A dict with a 'data' key containing the list
    - A dict with a 'music_list' key

    Each track may have varying field names — we normalise them here.
    """
    items: List[Any] = []
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, dict):
        items = raw.get("data") or raw.get("music_list") or raw.get("musics") or raw.get("items") or []
        if not items and isinstance(raw, dict):
            # Maybe the whole dict is an error
            if "message" in raw:
                logger.warning("API returned message: %s", raw["message"])
                return []
    else:
        logger.error("Unexpected API response type: %s", type(raw))
        return []

    tracks = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            continue

        # Normalise field names across API versions
        title = (
            item.get("title")
            or item.get("musicName")
            or item.get("music_name")
            or item.get("name")
            or "Unknown"
        )
        author = (
            item.get("author")
            or item.get("authorName")
            or item.get("author_name")
            or item.get("creator")
            or ""
        )
        play_url = (
            item.get("playUrl")
            or item.get("play_url")
            or item.get("musicUrl")
            or item.get("music_url")
            or item.get("url")
            or ""
        )
        cover_url = (
            item.get("coverLarge")
            or item.get("cover_large")
            or item.get("coverMedium")
            or item.get("cover")
            or item.get("coverUrl")
            or ""
        )
        tiktok_id = str(
            item.get("id")
            or item.get("musicId")
            or item.get("music_id")
            or ""
        )
        duration = (
            item.get("duration")
            or item.get("duration_seconds")
            or item.get("musicDuration")
            or None
        )
        if duration is not None:
            try:
                duration = float(duration)
            except (ValueError, TypeError):
                duration = None

        if not play_url:
            logger.debug("Skipping track '%s' — no play_url", title)
            continue

        tracks.append({
            "tiktok_id": tiktok_id,
            "title": title,
            "author": author,
            "play_url": play_url,
            "cover_url": cover_url,
            "duration_seconds": duration,
            "rank": i + 1,
        })

    return tracks


def fetch_trending_music(db: Session) -> Dict[str, Any]:
    """
    Fetch trending music from TikTok via RapidAPI.

    Returns dict with 'success', 'tracks_stored', 'batch_id', and optionally 'error'.
    """
    api_key = _get_api_key()
    if not api_key:
        return {"success": False, "error": "RAPIDAPI_KEY not configured"}

    if not can_fetch(db):
        return {"success": False, "error": f"Daily limit reached ({MAX_FETCHES_PER_DAY} fetches/day)"}

    batch_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    try:
        resp = requests.get(
            RAPIDAPI_URL,
            headers={
                "x-rapidapi-host": RAPIDAPI_HOST,
                "x-rapidapi-key": api_key,
            },
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        raw = resp.json()
    except requests.RequestException as e:
        logger.error("TikTok trending API request failed: %s", e)
        return {"success": False, "error": str(e)}
    except ValueError:
        logger.error("TikTok trending API returned non-JSON: %s", resp.text[:200])
        return {"success": False, "error": "Non-JSON response"}

    tracks = _parse_tracks(raw)
    if not tracks:
        logger.warning("No tracks parsed from API response")
        return {"success": False, "error": "No tracks in response", "raw_sample": str(raw)[:500]}

    # Store tracks
    for t in tracks:
        tm = TrendingMusic(
            id=str(uuid.uuid4()),
            tiktok_id=t["tiktok_id"],
            title=t["title"],
            author=t["author"],
            play_url=t["play_url"],
            cover_url=t["cover_url"],
            duration_seconds=t["duration_seconds"],
            rank=t["rank"],
            batch_id=batch_id,
            fetched_at=now,
        )
        db.add(tm)

    # Record the fetch
    fetch_record = TrendingMusicFetch(
        id=batch_id,
        fetched_at=now,
        track_count=len(tracks),
        source="tiktok_rapidapi",
    )
    db.add(fetch_record)
    db.commit()

    logger.info("Stored %d trending tracks (batch %s)", len(tracks), batch_id)
    return {"success": True, "tracks_stored": len(tracks), "batch_id": batch_id}


def get_trending_tracks(db: Session, limit: int = 50) -> List[TrendingMusic]:
    """Return up to `limit` tracks from the latest batch, ordered by rank."""
    batch_id = get_latest_batch_id(db)
    if not batch_id:
        return []
    return (
        db.query(TrendingMusic)
        .filter(TrendingMusic.batch_id == batch_id)
        .order_by(TrendingMusic.rank)
        .limit(limit)
        .all()
    )


def get_random_trending_url(db: Session) -> Optional[str]:
    """Pick a random play_url from the top 50 trending tracks."""
    tracks = get_trending_tracks(db, limit=50)
    if not tracks:
        return None
    chosen = random.choice(tracks)
    return chosen.play_url


def get_trending_sample(db: Session, count: int = 10) -> List[TrendingMusic]:
    """Return `count` random tracks from the latest batch (for user selection UI)."""
    tracks = get_trending_tracks(db, limit=50)
    if not tracks:
        return []
    sample_size = min(count, len(tracks))
    return random.sample(tracks, sample_size)


def get_trending_track_by_id(db: Session, track_id: str) -> Optional[TrendingMusic]:
    """Return a specific trending track by ID."""
    return db.query(TrendingMusic).filter(TrendingMusic.id == track_id).first()


def cleanup_old_batches(db: Session, keep_days: int = 3):
    """Delete trending music batches older than `keep_days`."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    old_tracks = db.query(TrendingMusic).filter(TrendingMusic.fetched_at < cutoff).delete(
        synchronize_session=False
    )
    old_fetches = db.query(TrendingMusicFetch).filter(TrendingMusicFetch.fetched_at < cutoff).delete(
        synchronize_session=False
    )
    if old_tracks or old_fetches:
        db.commit()
        logger.info("Cleaned up %d old trending tracks and %d fetch records", old_tracks, old_fetches)
