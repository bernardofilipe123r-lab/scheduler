"""
Music downloader service — downloads songs from YouTube via yt-dlp.

Used by admin panel to populate the music library (assets/music/).
Admin pastes a list of song names, backend downloads each as MP3.
"""
import logging
import re
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

_ASSETS_MUSIC_DIR = Path(__file__).resolve().parent.parent.parent / "assets" / "music"


def _sanitize_filename(name: str) -> str:
    """Remove unsafe chars from filename, keep it readable."""
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name[:100] if name else "track"


def get_music_dir() -> Path:
    """Return the music library directory path."""
    return _ASSETS_MUSIC_DIR


def download_songs(songs_text: str) -> Dict[str, Any]:
    """
    Download songs from YouTube as MP3 into assets/music/.

    Uses a temp directory with UUID filenames to avoid yt-dlp
    FFmpeg post-processor failures with special characters.

    Args:
        songs_text: Newline-separated list of song names/queries.

    Returns:
        Dict with 'downloaded', 'failed', 'skipped' lists.
    """
    import yt_dlp

    songs = [s.strip() for s in songs_text.strip().split("\n") if s.strip()]
    if not songs:
        return {"downloaded": [], "failed": [], "skipped": [], "total": 0}

    _ASSETS_MUSIC_DIR.mkdir(parents=True, exist_ok=True)

    downloaded = []
    failed = []
    skipped = []

    for song in songs:
        safe_name = _sanitize_filename(song)
        output_path = _ASSETS_MUSIC_DIR / f"{safe_name}.mp3"

        # Skip if already exists
        if output_path.exists():
            logger.info("Skipping '%s' — already exists", safe_name)
            skipped.append({"song": song, "filename": f"{safe_name}.mp3"})
            continue

        # Download to temp dir with UUID name to avoid special char issues
        # in yt-dlp's FFmpeg post-processor rename step
        tmpdir = tempfile.mkdtemp()
        try:
            tmp_name = uuid.uuid4().hex[:12]
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': os.path.join(tmpdir, f"{tmp_name}.%(ext)s"),
                'noplaylist': True,
                'quiet': True,
                'no_warnings': True,
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
            }

            search_query = f"ytsearch1:{song}"
            logger.info("Downloading: %s", song)
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([search_query])

            # Find the resulting mp3 in temp dir
            mp3_files = list(Path(tmpdir).glob("*.mp3"))
            if mp3_files:
                shutil.move(str(mp3_files[0]), str(output_path))
                size_mb = output_path.stat().st_size / (1024 * 1024)
                downloaded.append({
                    "song": song,
                    "filename": f"{safe_name}.mp3",
                    "size_mb": round(size_mb, 2),
                })
                logger.info("✅ Downloaded: %s (%.2f MB)", safe_name, size_mb)
            else:
                failed.append({"song": song, "error": "No mp3 file produced after download"})
                logger.warning("❌ Download completed but no mp3 found: %s", safe_name)
        except Exception as e:
            failed.append({"song": song, "error": str(e)[:200]})
            logger.error("❌ Failed to download '%s': %s", song, e)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    return {
        "downloaded": downloaded,
        "failed": failed,
        "skipped": skipped,
        "total": len(songs),
    }


def list_music_files() -> List[Dict[str, Any]]:
    """List all MP3 files in assets/music/."""
    if not _ASSETS_MUSIC_DIR.is_dir():
        return []

    files = []
    for mp3 in sorted(_ASSETS_MUSIC_DIR.glob("*.mp3")):
        size_mb = mp3.stat().st_size / (1024 * 1024)
        files.append({
            "filename": mp3.name,
            "size_mb": round(size_mb, 2),
        })
    return files


def delete_music_file(filename: str) -> bool:
    """Delete a music file from assets/music/. Returns True if deleted."""
    # Prevent path traversal
    safe = Path(filename).name
    target = _ASSETS_MUSIC_DIR / safe
    if target.exists() and target.suffix == ".mp3":
        target.unlink()
        logger.info("Deleted music file: %s", safe)
        return True
    return False
