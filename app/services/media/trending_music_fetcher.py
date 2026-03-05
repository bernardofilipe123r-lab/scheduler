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
RAPIDAPI_URL = f"https://{RAPIDAPI_HOST}/t"
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
    Parse the /t endpoint response into a list of music track dicts.

    The /t endpoint returns all trending data in a single response:
    {
      "body": [
        { "exploreList": [...] },   // index 0: trending users (type 2)
        { "exploreList": [...] },   // index 1: trending hashtags (type 3)
        { "exploreList": [...] },   // index 2: trending music (type 1)
      ],
      ...
    }

    Music items have type=1 and contain:
    - cardItem.title — song title
    - cardItem.description — artist name
    - cardItem.extraInfo.playUrl — list of audio URLs
    - cardItem.extraInfo.musicId — TikTok music ID
    - cardItem.extraInfo.posts — number of videos using this track
    - cardItem.cover — cover image URL
    """
    if not isinstance(raw, dict):
        logger.error("Unexpected API response type: %s", type(raw))
        return []

    if "message" in raw and not raw.get("body"):
        logger.warning("API returned message: %s", raw["message"])
        return []

    # Extract music items from all exploreList sections
    body = raw.get("body", [])
    if not isinstance(body, list):
        logger.error("Unexpected body type: %s", type(body))
        return []

    music_items: List[Dict] = []
    for section in body:
        if not isinstance(section, dict):
            continue
        explore_list = section.get("exploreList", [])
        if not isinstance(explore_list, list):
            continue
        for entry in explore_list:
            if not isinstance(entry, dict):
                continue
            card = entry.get("cardItem", {})
            if not isinstance(card, dict):
                continue
            # type 1 = music
            if card.get("type") == 1:
                music_items.append(card)

    if not music_items:
        logger.warning("No music items (type=1) found in API response")
        return []

    tracks = []
    for i, card in enumerate(music_items):
        title = card.get("title", "Unknown")
        author = card.get("description", "")  # artist is in description field
        cover_url = card.get("cover", "")

        extra = card.get("extraInfo", {})
        if not isinstance(extra, dict):
            extra = {}

        tiktok_id = str(extra.get("musicId", "") or card.get("id", ""))

        # playUrl is a list of URLs
        play_urls = extra.get("playUrl", [])
        if isinstance(play_urls, list) and play_urls:
            play_url = play_urls[0]
        elif isinstance(play_urls, str):
            play_url = play_urls
        else:
            play_url = ""

        posts = extra.get("posts", 0)

        if not play_url:
            logger.debug("Skipping track '%s' — no play_url", title)
            continue

        tracks.append({
            "tiktok_id": tiktok_id,
            "title": title,
            "author": author,
            "play_url": play_url,
            "cover_url": cover_url,
            "duration_seconds": None,  # /t endpoint doesn't provide duration
            "rank": i + 1,
        })

    logger.info("Parsed %d music tracks from /t response", len(tracks))
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
