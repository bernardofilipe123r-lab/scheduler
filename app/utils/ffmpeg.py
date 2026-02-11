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

# Transient errors that should be retried
_RETRYABLE_ERRORS = [
    "Resource temporarily unavailable",
    "Error while opening encoder",
    "Cannot allocate memory",
    "Generic error in an external library",
]


def create_video_from_image(
    image_path: Path,
    output_path: Path,
    duration: int = VIDEO_DURATION,
    music_path: Optional[Path] = None,
    music_start_time: float = 0
) -> bool:
    """
    Create an MP4 video from a static image with optional background music.
    
    Uses filter_complex to handle both video format conversion (rgb24→yuv420p)
    and audio processing in one graph. Thread-limited and retryable for
    resource-constrained environments (Railway).
    """
    if not image_path.exists():
        raise FileNotFoundError(f"Image file not found: {image_path}")
    
    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Build FFmpeg command with filter_complex for reliable pixel format conversion
    cmd = [
        "ffmpeg",
        "-y",                    # Overwrite output
        "-loop", "1",            # Loop the image
        "-i", str(image_path),   # Input image
    ]
    
    if music_path and music_path.exists():
        # With audio: build a combined filter_complex for video + audio
        cmd.extend([
            "-ss", str(music_start_time),
            "-t", str(duration),
            "-i", str(music_path),
            "-filter_complex",
            # Convert video to yuv420p in the filter graph (fixes rgb24 encoder errors)
            # AND process audio (volume + fade) in the same graph
            f"[0:v]format=pix_fmts={VIDEO_PIXEL_FORMAT}[vid];"
            f"[1:a]volume=-14dB,afade=t=out:st={duration - MUSIC_FADE_DURATION}:d={MUSIC_FADE_DURATION}[audio]",
            "-map", "[vid]",
            "-map", "[audio]",
        ])
    else:
        # No audio: simple video filter for format conversion
        cmd.extend([
            "-vf", f"format=pix_fmts={VIDEO_PIXEL_FORMAT}",
        ])
    
    # Video encoding settings
    cmd.extend([
        "-c:v", VIDEO_CODEC,
        "-preset", VIDEO_PRESET,
        "-crf", "23",            # Explicit quality (prevents encoder init failures)
        "-r", "30",
        "-threads", "1",         # Single-thread: prevents resource exhaustion on Railway
        "-t", str(duration),
        "-shortest",
    ])
    
    # Audio encoding (if audio present)
    if music_path and music_path.exists():
        cmd.extend([
            "-c:a", "aac",
            "-b:a", "192k",
        ])
    
    cmd.append(str(output_path))
    
    # Retry with backoff — transient resource and encoder errors
    import time as _time
    max_retries = 3
    last_error = None
    for attempt in range(max_retries):
        try:
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
            error_msg = e.stderr or str(e)
            last_error = error_msg
            
            # Check if this is a retryable error
            is_retryable = any(err in error_msg for err in _RETRYABLE_ERRORS)
            
            if is_retryable and attempt < max_retries - 1:
                wait = (attempt + 1) * 8  # 8s, 16s
                print(
                    f"⚠️ FFmpeg error (attempt {attempt + 1}/{max_retries}), "
                    f"retrying in {wait}s: {error_msg[:200]}",
                    flush=True
                )
                _time.sleep(wait)
                # Clean up partial output before retry
                if output_path.exists():
                    try:
                        output_path.unlink()
                    except Exception:
                        pass
                continue
            
            raise RuntimeError(f"Failed to generate video: FFmpeg error: {error_msg}")
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
