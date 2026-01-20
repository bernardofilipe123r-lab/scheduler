"""
FFmpeg utilities for video generation.
"""
import subprocess
from pathlib import Path
from typing import Optional
from app.core.constants import (
    VIDEO_DURATION,
    VIDEO_CODEC,
    VIDEO_PIXEL_FORMAT,
    VIDEO_PRESET,
    MUSIC_FADE_DURATION,
)


def create_video_from_image(
    image_path: Path,
    output_path: Path,
    duration: int = VIDEO_DURATION,
    music_path: Optional[Path] = None,
    music_start_time: float = 0
) -> bool:
    """
    Create an MP4 video from a static image with optional background music.
    
    Args:
        image_path: Path to the input image
        output_path: Path to save the output video
        duration: Video duration in seconds
        music_path: Optional path to background music file
        music_start_time: Start time in seconds for the music track
        
    Returns:
        True if successful, False otherwise
        
    Raises:
        RuntimeError: If FFmpeg command fails
    """
    if not image_path.exists():
        raise FileNotFoundError(f"Image file not found: {image_path}")
    
    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Base FFmpeg command for creating video from static image
    cmd = [
        "ffmpeg",
        "-y",  # Overwrite output file if it exists
        "-loop", "1",  # Loop the image
        "-i", str(image_path),  # Input image
        "-t", str(duration),  # Duration
    ]
    
    # Add audio if music is provided
    if music_path and music_path.exists():
        cmd.extend([
            "-ss", str(music_start_time),  # Start position in music
            "-t", str(duration),  # Limit audio duration
            "-i", str(music_path),  # Input audio
            "-filter_complex",
            f"[1:a]volume=-14dB,afade=t=out:st={duration - MUSIC_FADE_DURATION}:d={MUSIC_FADE_DURATION}[audio]",
            "-map", "0:v",  # Map video from first input
            "-map", "[audio]",  # Map processed audio
        ])
    
    # Video encoding settings
    cmd.extend([
        "-c:v", VIDEO_CODEC,  # Video codec
        "-preset", VIDEO_PRESET,  # Encoding preset
        "-pix_fmt", VIDEO_PIXEL_FORMAT,  # Pixel format
        "-r", "30",  # Frame rate
        "-shortest",  # Finish encoding when the shortest input stream ends
    ])
    
    # Audio encoding settings (if audio is present)
    if music_path and music_path.exists():
        cmd.extend([
            "-c:a", "aac",  # Audio codec
            "-b:a", "192k",  # Audio bitrate
        ])
    
    # Output file
    cmd.append(str(output_path))
    
    try:
        # Run FFmpeg command
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )
        
        if not output_path.exists():
            raise RuntimeError("FFmpeg completed but output file was not created")
        
        return True
        
    except subprocess.CalledProcessError as e:
        error_msg = f"FFmpeg error: {e.stderr}"
        raise RuntimeError(error_msg)
    except Exception as e:
        raise RuntimeError(f"Failed to create video: {str(e)}")


def verify_ffmpeg_installation() -> bool:
    """
    Verify that FFmpeg is installed and accessible.
    
    Returns:
        True if FFmpeg is available, False otherwise
    """
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            text=True,
            check=True
        )
        return "ffmpeg version" in result.stdout.lower()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def get_audio_duration(audio_path: Path) -> Optional[float]:
    """
    Get the duration of an audio file using FFprobe.
    
    Args:
        audio_path: Path to the audio file
        
    Returns:
        Duration in seconds, or None if it cannot be determined
    """
    if not audio_path.exists():
        return None
    
    try:
        cmd = [
            "ffprobe",
            "-i", str(audio_path),
            "-show_entries", "format=duration",
            "-v", "quiet",
            "-of", "csv=p=0"
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )
        
        return float(result.stdout.strip())
        
    except (subprocess.CalledProcessError, ValueError, FileNotFoundError):
        return None


def trim_or_loop_audio(
    input_path: Path,
    output_path: Path,
    target_duration: int = VIDEO_DURATION
) -> bool:
    """
    Trim or loop audio to match the target duration.
    
    Args:
        input_path: Path to input audio file
        output_path: Path to save processed audio
        target_duration: Target duration in seconds
        
    Returns:
        True if successful, False otherwise
    """
    if not input_path.exists():
        return False
    
    try:
        duration = get_audio_duration(input_path)
        
        if duration is None:
            return False
        
        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        cmd = [
            "ffmpeg",
            "-y",
            "-i", str(input_path),
        ]
        
        if duration >= target_duration:
            # Trim to target duration
            cmd.extend([
                "-t", str(target_duration),
            ])
        else:
            # Loop until target duration
            cmd.extend([
                "-filter_complex", f"aloop=loop=-1:size=2e9,atrim=duration={target_duration}",
            ])
        
        cmd.extend([
            "-c:a", "aac",
            "-b:a", "192k",
            str(output_path)
        ])
        
        subprocess.run(cmd, capture_output=True, check=True)
        return output_path.exists()
        
    except Exception:
        return False
