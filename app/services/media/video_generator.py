"""
Video generation service for creating MP4 reels from images.
"""
import os
import random
import tempfile
from pathlib import Path
from typing import Optional
from app.utils.ffmpeg import create_video_from_image, verify_ffmpeg_installation, get_audio_duration
from app.core.constants import VIDEO_DURATION


class VideoGenerator:
    """Service for generating video reels from static images."""

    def __init__(self):
        """Initialize the video generator and verify FFmpeg installation."""
        if not verify_ffmpeg_installation():
            raise RuntimeError(
                "FFmpeg is not installed or not accessible. "
                "Please install FFmpeg to use video generation features."
            )

    def generate_reel_video(
        self,
        reel_image_path: Path,
        output_path: Path,
        music_id: Optional[str] = None,
        duration: Optional[int] = None,
        music_url: Optional[str] = None,
    ) -> Path:
        """
        Generate a video reel from a static image with background music.

        Args:
            reel_image_path: Path to the reel image
            output_path: Path to save the video
            music_id: Background music identifier (fallback if no music_url)
            duration: Video duration in seconds (if None, randomly picks 7-8s)
            music_url: URL to a user-uploaded music file (takes priority over music_id)

        Returns:
            Path to the generated video
        """
        if not reel_image_path.exists():
            raise FileNotFoundError(f"Reel image not found: {reel_image_path}")

        # Random duration if not specified
        if duration is None:
            duration = random.choice([7, 8])
            print(f"🎲 Randomly selected video duration: {duration}s")

        # Resolve music path: user-uploaded URL > music_id > random default
        music_path: Optional[Path] = None
        _tmp_music_file: Optional[str] = None

        if music_url:
            # Download user-uploaded music from Supabase to a temp file
            _tmp_music_file = self._download_music_url(music_url)
            if _tmp_music_file:
                music_path = Path(_tmp_music_file)
                print(f"🎵 Using user-uploaded music: {music_url[:80]}...")

        if music_path is None:
            # Fallback to local assets
            from app.services.media.music_picker import get_random_local_music_path
            music_path = get_random_local_music_path()
            if music_path:
                print(f"🎵 Using local fallback music: {music_path.name}")
            elif music_id is None:
                music_id = random.choice(["music_1", "music_2"])
                print(f"🎵 Randomly selected music: {music_id}")
                music_path = self._get_music_path(music_id)

        print(f"\n{'='*80}")
        print(f"🎬 VIDEO GENERATION STARTED")
        print(f"{'='*80}")
        print(f"📁 Output path: {output_path}")
        print(f"🖼️  Image path: {reel_image_path}")
        print(f"🎵 Music ID: {music_id}")
        print(f"🎶 Music path: {music_path}")
        print(f"⏱️  Duration: {duration}s")

        # Get random start time for music
        music_start = 0
        if music_path:
            music_duration = get_audio_duration(music_path)
            print(f"🎼 Music duration: {music_duration}s")
            if music_duration and music_duration > duration:
                # Pick random start time ensuring we have enough duration
                max_start = music_duration - duration
                music_start = random.uniform(0, max_start)
                print(f"🔀 Random music start time: {music_start:.2f}s (max: {max_start:.2f}s)")

        print(f"{'='*80}\n")

        # Generate the video
        try:
            print(f"🔧 Calling FFmpeg to create video...")
            success = create_video_from_image(
                image_path=reel_image_path,
                output_path=output_path,
                duration=duration,
                music_path=music_path,
                music_start_time=music_start
            )

            print(f"📊 FFmpeg result: {'success' if success else 'failed'}")
            print(f"📂 Output exists: {output_path.exists()}")
            if output_path.exists():
                file_size = output_path.stat().st_size
                print(f"📦 Output file size: {file_size:,} bytes ({file_size / 1024 / 1024:.2f} MB)")

            if not success or not output_path.exists():
                raise RuntimeError("Video generation failed")

            return output_path

        except Exception as e:
            raise RuntimeError(f"Failed to generate video: {str(e)}")
        finally:
            # Clean up downloaded temp music file
            if _tmp_music_file:
                try:
                    os.unlink(_tmp_music_file)
                except OSError:
                    pass

    def _get_music_path(self, music_id: str) -> Optional[Path]:
        """
        Get the path to a music file by its ID.
        """
        base_dir = Path(__file__).resolve().parent.parent.parent
        music_dir = base_dir / "assets" / "music"

        music_map = {
            "default_01": "default_01.mp3",
            "default_02": "default_02.mp3",
            "energetic_01": "energetic_01.mp3",
            "calm_01": "calm_01.mp3",
            "motivational_01": "motivational_01.mp3",
        }

        if music_id not in music_map:
            music_filename = f"{music_id}.mp3"
        else:
            music_filename = music_map[music_id]

        music_path = music_dir / music_filename

        if music_path.exists():
            return music_path

        for ext in ['.mp3', '.m4a', '.wav', '.aac']:
            alt_path = music_dir / f"{music_id}{ext}"
            if alt_path.exists():
                return alt_path

        print(f"Warning: Music file not found for ID '{music_id}'. Creating video without music.")
        return None

    @staticmethod
    def _download_music_url(url: str) -> Optional[str]:
        """Download a music file from a URL to a temp file. Returns path or None."""
        import requests
        try:
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            ext = ".mp3"
            for candidate in [".m4a", ".wav", ".aac", ".ogg"]:
                if candidate in url:
                    ext = candidate
                    break
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            tmp.write(resp.content)
            tmp.close()
            return tmp.name
        except Exception as e:
            print(f"Warning: Failed to download music from URL: {e}")
            return None

    def verify_installation(self) -> bool:
        """
        Verify that all required tools are installed.

        Returns:
            True if all tools are available
        """
        return verify_ffmpeg_installation()
