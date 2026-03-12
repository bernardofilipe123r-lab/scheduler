"""
TikTok trending music fetcher — calls the TikTok Trending Data API (RapidAPI)
up to 3 times per day and stores trending tracks in the database.
"""
import logging
import os
import random
import re
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

# TokInsight API (for refreshing play URLs by music_id)
TOKINSIGHT_HOST = "free-tiktok-api-scraper-mobile-version.p.rapidapi.com"
TOKINSIGHT_MUSIC_DETAIL_URL = f"https://{TOKINSIGHT_HOST}/tok/v1/music_detail/"

# Soundcharts API (for TikTok chart rankings)
SOUNDCHARTS_BASE = "https://customer.api.soundcharts.com"
SOUNDCHARTS_CHART_SLUG = "tiktok-breakout-us"  # US TikTok Breakout chart (daily)

# Language filter — only keep tracks whose title + artist use Latin script.
# This filters out non-English/non-European tracks (Cyrillic, CJK, Arabic, etc.)
_NON_LATIN_RE = re.compile(r'[\u0400-\u04FF\u0500-\u052F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF'
                           r'\uAC00-\uD7AF\u0600-\u06FF\u0980-\u09FF\u0A00-\u0A7F'
                           r'\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F\u0E00-\u0E7F'
                           r'\u1000-\u109F\u1780-\u17FF]')


def _is_latin_script(text: str) -> bool:
    """Return True if text contains only Latin-compatible characters (English/European)."""
    return not _NON_LATIN_RE.search(text)


def _get_api_key() -> Optional[str]:
    """Return the RapidAPI key from environment."""
    return os.getenv("RAPIDAPI_KEY")


def _get_soundcharts_creds() -> Optional[Dict[str, str]]:
    """Return Soundcharts credentials from environment."""
    app_id = os.getenv("SOUNDCHARTS_APP_ID")
    api_key = os.getenv("SOUNDCHARTS_API_KEY")
    if app_id and api_key:
        return {"app_id": app_id, "api_key": api_key}
    return None


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

        # Filter: only keep English/European/instrumental tracks (Latin script)
        if not _is_latin_script(title) or not _is_latin_script(author):
            logger.debug("Skipping non-Latin track: '%s' by '%s'", title, author)
            continue

        tracks.append({
            "tiktok_id": tiktok_id,
            "title": title,
            "author": author,
            "play_url": play_url,
            "cover_url": cover_url,
            "duration_seconds": None,  # /t endpoint doesn't provide duration
            "rank": len(tracks) + 1,
        })

    logger.info("Parsed %d music tracks from /t response", len(tracks))
    return tracks


def fetch_trending_music(db: Session) -> Dict[str, Any]:
    """
    Fetch trending music from TikTok via RapidAPI.

    Strategy (3 layers):
    1. /t trending endpoint (primary, limited to BASIC plan quota)
    2. TokInsight artist music lists (secondary)
    3. Curated seed library of known popular TikTok tracks (always available)

    Returns dict with 'success', 'tracks_stored', 'batch_id', and optionally 'error'.
    """
    api_key = _get_api_key()
    if not api_key:
        return {"success": False, "error": "RAPIDAPI_KEY not configured"}

    if not can_fetch(db):
        return {"success": False, "error": f"Daily limit reached ({MAX_FETCHES_PER_DAY} fetches/day)"}

    # Try primary source: /t trending endpoint
    tracks = _fetch_from_trending_api(api_key)
    source = "tiktok_trending_api"

    # Fallback 1: Soundcharts TikTok chart (real trending data, 1000 req/month)
    if not tracks:
        logger.info("Trending API failed, trying Soundcharts TikTok chart")
        tracks = _fetch_from_soundcharts()
        source = "soundcharts"

    # Fallback 2: TokInsight popular artist music
    if not tracks:
        logger.info("Soundcharts failed, falling back to TokInsight artist music")
        tracks = _fetch_from_tokinsight_artists(api_key)
        source = "tokinsight_artists"

    # Fallback 3: curated seed library (always available, no API calls)
    if not tracks:
        logger.info("TokInsight also failed, falling back to curated seed library")
        tracks = _get_curated_seed_tracks()
        source = "curated_seed"

    if not tracks:
        return {"success": False, "error": "No tracks from any source"}

    return _store_tracks(db, tracks, source)


def _fetch_from_trending_api(api_key: str) -> List[Dict]:
    """Try fetching from the /t trending endpoint."""
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
        return _parse_tracks(raw)
    except requests.RequestException as e:
        logger.warning("Trending API request failed: %s", e)
        return []
    except ValueError:
        logger.warning("Trending API returned non-JSON")
        return []


def _fetch_from_soundcharts() -> List[Dict]:
    """
    Fetch trending TikTok songs from Soundcharts API.

    Uses the TikTok Breakout US chart for daily trending songs, then
    looks up TikTok music IDs for each song via the identifiers endpoint.

    Cost: ~21 API calls per fetch (1 chart + 20 identifier lookups).
    Free plan: 1,000 requests/month ≈ 47 fetches/month.
    """
    creds = _get_soundcharts_creds()
    if not creds:
        logger.info("Soundcharts credentials not configured, skipping")
        return []

    sc_headers = {
        "x-app-id": creds["app_id"],
        "x-api-key": creds["api_key"],
        "Accept": "application/json",
    }

    # Step 1: Get chart ranking (top 20 songs)
    try:
        resp = requests.get(
            f"{SOUNDCHARTS_BASE}/api/v2.14/chart/song/{SOUNDCHARTS_CHART_SLUG}/ranking/latest",
            params={"offset": "0", "limit": "20"},
            headers=sc_headers,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        chart_data = resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning("Soundcharts chart request failed: %s", e)
        return []

    items = chart_data.get("items", [])
    if not items:
        logger.warning("Soundcharts chart returned no items")
        return []

    # Step 2: For each song, look up TikTok identifiers
    tracks: List[Dict] = []
    for i, item in enumerate(items):
        song = item.get("song", {})
        if not isinstance(song, dict):
            continue

        song_uuid = song.get("uuid", "")
        song_name = song.get("name", "Unknown")
        artist = song.get("creditName", "")
        image_url = song.get("imageUrl", "")

        # Look up TikTok music ID
        tiktok_id = ""
        if song_uuid:
            try:
                id_resp = requests.get(
                    f"{SOUNDCHARTS_BASE}/api/v2/song/{song_uuid}/identifiers",
                    params={"platform": "tiktok", "offset": "0", "limit": "1"},
                    headers=sc_headers,
                    timeout=REQUEST_TIMEOUT,
                )
                id_resp.raise_for_status()
                id_data = id_resp.json()
                id_items = id_data.get("items", [])
                if id_items and isinstance(id_items[0], dict):
                    tiktok_id = id_items[0].get("identifier", "")
            except (requests.RequestException, ValueError):
                pass  # Non-critical — we still have song name/artist

        # Filter: only keep English/European/instrumental tracks (Latin script)
        if not _is_latin_script(song_name) or not _is_latin_script(artist):
            logger.debug("Skipping non-Latin track: '%s' by '%s'", song_name, artist)
            continue

        tracks.append({
            "tiktok_id": tiktok_id,
            "title": song_name,
            "author": artist,
            "play_url": "",  # Soundcharts doesn't provide audio URLs
            "cover_url": image_url,
            "duration_seconds": None,
            "rank": len(tracks) + 1,
        })

    logger.info("Soundcharts: fetched %d English/European trending songs from %s", len(tracks), SOUNDCHARTS_CHART_SLUG)
    return tracks


# Popular TikTok artists whose music is widely used in reels.
# Each entry: (uid, sec_uid, artist_name)
POPULAR_ARTISTS = [
    ("6656913964248088581", "MS4wLjABAAAAXvlb5a78QwIAZegmnfJnnKGC2ZfXaC672rP7_PwtVK8lPgqC1O-Qh13yqOB9xqhI", "Doja Cat"),
    ("6833996148498359302", "MS4wLjABAAAA-VASjiXTh7wDDyXvjk10VFhMWUAoxr8bgfO1kLqtSxAVOb2IwyYxVvXFNH3JLQ5x", "The Weeknd"),
    ("7118231785828017158", "MS4wLjABAAAAJgkREZcw7m-3CQLongZh05MXJr2h_osSHNQwJHZFkB8", "Tyla"),
    ("107955", "MS4wLjABAAAAsHntXC3s0AvxcecggxsoVa4eAiT8OVafVZ4OQXxy-9htDnR9QOMTkFByiszF0Afp", "Billie Eilish"),
    ("6881094635498628102", "MS4wLjABAAAAJdCih6v8ISyomFlW4T0D1Fk_oa3cjLy7-h0_XH_Tow35yvpmKY9Kx1AWp22W7rU4", "Sabrina Carpenter"),
]


def _fetch_from_tokinsight_artists(api_key: str) -> List[Dict]:
    """Fetch popular music from TokInsight artist music lists."""
    all_tracks: List[Dict] = []
    seen_ids: set = set()

    for uid, sec_uid, artist_name in POPULAR_ARTISTS:
        try:
            resp = requests.get(
                f"https://{TOKINSIGHT_HOST}/tok/v1/music_original_list/",
                params={"uid": uid, "sec_uid": sec_uid, "cursor": "0", "count": "10"},
                headers={
                    "x-rapidapi-host": TOKINSIGHT_HOST,
                    "x-rapidapi-key": api_key,
                },
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, ValueError) as e:
            logger.warning("TokInsight music_original_list failed for %s: %s", artist_name, e)
            continue

        music_list = data.get("music", [])
        if not isinstance(music_list, list):
            continue

        for item in music_list:
            mid = str(item.get("mid", "") or item.get("id_str", ""))
            if not mid or mid in seen_ids:
                continue

            play_url_obj = item.get("play_url", {})
            if isinstance(play_url_obj, dict):
                url_list = play_url_obj.get("url_list", [])
                play_url = url_list[0] if url_list else play_url_obj.get("uri", "")
            else:
                play_url = ""

            if not play_url or not play_url.startswith("http"):
                continue

            # Filter: only keep English/European/instrumental tracks
            track_title = item.get("title", "Unknown")
            track_author = item.get("author", artist_name)
            if not _is_latin_script(track_title) or not _is_latin_script(track_author):
                continue

            cover_obj = item.get("cover_medium") or item.get("cover_large") or item.get("cover_thumb") or {}
            cover_urls = cover_obj.get("url_list", []) if isinstance(cover_obj, dict) else []
            cover_url = cover_urls[0] if cover_urls else ""

            seen_ids.add(mid)
            all_tracks.append({
                "tiktok_id": mid,
                "title": item.get("title", "Unknown"),
                "author": item.get("author", artist_name),
                "play_url": play_url,
                "cover_url": cover_url,
                "duration_seconds": item.get("duration"),
                "rank": len(all_tracks) + 1,
            })

        logger.info("Fetched %d tracks from %s via TokInsight", len(music_list), artist_name)

    # Sort by user_count (popularity) if available — already sorted by rank assignment order
    logger.info("TokInsight fallback: %d total tracks from %d artists", len(all_tracks), len(POPULAR_ARTISTS))
    return all_tracks


# Curated seed library — known popular TikTok sounds with stable metadata.
# play_url fields are left empty; the scheduler/music_picker will attempt
# to refresh via TokInsight music_detail at use-time. These are stored in
# the DB so the frontend can display titles/artists even when APIs are down.
CURATED_SEED_TRACKS = [
    {"tiktok_id": "6763054442704145158", "title": "Say So", "author": "Doja Cat", "duration_seconds": 60},
    {"tiktok_id": "6757541825337104134", "title": "Blinding Lights", "author": "The Weeknd", "duration_seconds": 60},
    {"tiktok_id": "6750279892782016261", "title": "Lottery (Renegade)", "author": "K CAMP", "duration_seconds": 60},
    {"tiktok_id": "6811389638498453253", "title": "Savage Love", "author": "Jawsh 685 & Jason Derulo", "duration_seconds": 60},
    {"tiktok_id": "6813212936429060870", "title": "Roses - Imanbek Remix", "author": "SAINt JHN", "duration_seconds": 60},
    {"tiktok_id": "6800155412498274053", "title": "Cannibal", "author": "Kesha", "duration_seconds": 60},
    {"tiktok_id": "6843523085498736389", "title": "WAP", "author": "Cardi B ft. Megan Thee Stallion", "duration_seconds": 60},
    {"tiktok_id": "6890994929540020229", "title": "Drivers License", "author": "Olivia Rodrigo", "duration_seconds": 60},
    {"tiktok_id": "6714627411694616326", "title": "Supalonely", "author": "BENEE ft. Gus Dapperton", "duration_seconds": 60},
    {"tiktok_id": "6680036678498027270", "title": "ROXANNE", "author": "Arizona Zervas", "duration_seconds": 60},
    {"tiktok_id": "6795075375298992901", "title": "Toosie Slide", "author": "Drake", "duration_seconds": 60},
    {"tiktok_id": "6833621610998714117", "title": "Mood", "author": "24kGoldn ft. iann dior", "duration_seconds": 60},
    {"tiktok_id": "6896177748541746949", "title": "Beautiful Mistakes", "author": "Maroon 5 ft. Megan Thee Stallion", "duration_seconds": 60},
    {"tiktok_id": "6943666872241369862", "title": "Montero (Call Me By Your Name)", "author": "Lil Nas X", "duration_seconds": 60},
    {"tiktok_id": "6966553735662703361", "title": "Stay", "author": "The Kid LAROI & Justin Bieber", "duration_seconds": 60},
    {"tiktok_id": "7029386552082455297", "title": "About Damn Time", "author": "Lizzo", "duration_seconds": 60},
    {"tiktok_id": "7107965431377133313", "title": "Unholy", "author": "Sam Smith & Kim Petras", "duration_seconds": 60},
    {"tiktok_id": "7196812463797610498", "title": "Flowers", "author": "Miley Cyrus", "duration_seconds": 60},
    {"tiktok_id": "7255803158289458970", "title": "Paint The Town Red", "author": "Doja Cat", "duration_seconds": 60},
    {"tiktok_id": "7304282048225568518", "title": "Water", "author": "Tyla", "duration_seconds": 60},
]


def _get_curated_seed_tracks() -> List[Dict]:
    """
    Return curated seed tracks as a fallback when all APIs are unavailable.

    These tracks have known TikTok music IDs. play_url is empty — the music
    picker will try TokInsight music_detail at use-time to get fresh URLs.
    """
    tracks = []
    for i, seed in enumerate(CURATED_SEED_TRACKS):
        tracks.append({
            "tiktok_id": seed["tiktok_id"],
            "title": seed["title"],
            "author": seed["author"],
            "play_url": "",  # will be resolved at use-time via get_fresh_play_url()
            "cover_url": "",
            "duration_seconds": seed.get("duration_seconds"),
            "rank": i + 1,
        })
    logger.info("Using curated seed library: %d tracks", len(tracks))
    return tracks


def _store_tracks(db: Session, tracks: List[Dict], source: str) -> Dict[str, Any]:
    """Store parsed tracks in the database."""
    batch_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

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

    fetch_record = TrendingMusicFetch(
        id=batch_id,
        fetched_at=now,
        track_count=len(tracks),
        source=source,
    )
    db.add(fetch_record)
    db.commit()

    logger.info("Stored %d tracks from %s (batch %s)", len(tracks), source, batch_id)
    return {"success": True, "tracks_stored": len(tracks), "batch_id": batch_id, "source": source}


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
    """Pick a random play_url from the top 50 trending tracks.

    First tries tracks that already have a play_url. Then tries refreshing
    up to 3 tracks via TokInsight (to avoid hammering a broken API).
    """
    tracks = get_trending_tracks(db, limit=50)
    if not tracks:
        return None
    random.shuffle(tracks)

    # First pass: try tracks that already have a valid play_url
    for chosen in tracks:
        if chosen.play_url:
            logger.info("Random trending pick: '%s' by %s", chosen.title, chosen.author)
            return chosen.play_url

    # Second pass: try TokInsight refresh for up to 3 tracks (fail-fast)
    MAX_REFRESH_ATTEMPTS = 3
    attempts = 0
    for chosen in tracks:
        if attempts >= MAX_REFRESH_ATTEMPTS:
            break
        if chosen.tiktok_id:
            attempts += 1
            fresh = get_fresh_play_url(chosen.tiktok_id)
            if fresh:
                logger.info("Random trending pick (refreshed): '%s' by %s", chosen.title, chosen.author)
                return fresh

    return None


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


def get_fresh_play_url(tiktok_music_id: str) -> Optional[str]:
    """
    Call TokInsight /tok/v1/music_detail/ to get a fresh play_url for a music track.

    This is used as a fallback when stored CDN URLs may have expired.
    Returns the play_url string or None on failure.
    """
    api_key = _get_api_key()
    if not api_key or not tiktok_music_id:
        return None

    try:
        resp = requests.get(
            TOKINSIGHT_MUSIC_DETAIL_URL,
            params={"music_id": tiktok_music_id},
            headers={
                "x-rapidapi-host": TOKINSIGHT_HOST,
                "x-rapidapi-key": api_key,
            },
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        logger.warning("TokInsight music_detail request failed: %s", e)
        return None
    except ValueError:
        logger.warning("TokInsight returned non-JSON response")
        return None

    music_info = data.get("music_info", {})
    if not isinstance(music_info, dict):
        return None

    play_url_obj = music_info.get("play_url", {})
    if isinstance(play_url_obj, dict):
        url_list = play_url_obj.get("url_list", [])
        if url_list:
            logger.info("Got fresh play_url for music %s via TokInsight", tiktok_music_id)
            return url_list[0]
        uri = play_url_obj.get("uri", "")
        if uri and uri.startswith("http"):
            return uri

    return None
