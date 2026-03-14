"""Reel processor — generates images/video for text-based reels (light/dark variants)."""
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any

from app.services.media.image_generator import ImageGenerator
from app.services.media.video_generator import VideoGenerator
from app.services.content.differentiator import ContentDifferentiator
from app.services.storage.supabase_storage import (
    upload_from_path, storage_path, StorageError,
)
from app.services.content.processors._helpers import strip_cta_lines, get_brand_type


def regenerate_brand(
    manager,
    db,
    job_id: str,
    brand: str,
    title: Optional[str] = None,
    content_lines: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Regenerate images/video for a single brand.
    Uses existing AI background if available (no new API call for dark mode).
    """
    print(f"\n{'='*60}", flush=True)
    print(f"🎨 regenerate_brand() called", flush=True)
    print(f"   Brand: {brand}", flush=True)
    print(f"   Job ID: {job_id}", flush=True)
    print(f"{'='*60}", flush=True)
    sys.stdout.flush()

    job = manager.get_job(job_id)
    if not job:
        error_msg = f"Job not found: {job_id}"
        print(f"❌ ERROR: {error_msg}", flush=True)
        return {"success": False, "error": error_msg}

    def _update_output(data: dict):
        manager.update_brand_output(job_id, brand, data)

    # Use provided values or fall back to per-brand title in brand_outputs, then job title
    brand_data = job.get_brand_output(brand)
    use_title = title if title is not None else (brand_data.get("title") or job.title)
    use_lines = content_lines if content_lines is not None else job.content_lines

    # Strip any CTA lines the AI may have included (real CTA added by image_generator)
    if use_lines and job.variant != 'post':
        use_lines = strip_cta_lines(use_lines)

    # Only run differentiation if:
    # 1. No pre-generated content was passed
    # 2. We're regenerating a single brand (not part of batch process)
    if content_lines is None and job.brands and len(job.brands) > 1 and use_lines and len(use_lines) >= 3:
        print(f"\n🔄 Differentiating content for {brand} (single brand regen)...", flush=True)
        try:
            differentiator = ContentDifferentiator()
            use_lines = differentiator.differentiate_content(
                brand=brand,
                title=use_title,
                content_lines=use_lines,
                all_brands=job.brands
            )
            print(f"   ✓ Content differentiated: {len(use_lines)} lines", flush=True)
        except Exception as e:
            print(f"   ⚠️ Differentiation failed, using original: {e}", flush=True)

    # Update job if inputs changed
    if title is not None or content_lines is not None:
        manager.update_job_inputs(job_id, title=title, content_lines=content_lines)

    _update_output({
        "status": "generating",
        "progress_message": "Starting generation...",
        "progress_percent": 0
    })

    try:
        reel_id = brand_data.get("reel_id", f"{job_id}_{brand}")
        brand_slug = brand
        user_id = job.user_id

        from app.services.content.niche_config_service import NicheConfigService
        ctx = NicheConfigService().get_context(brand_id=brand, user_id=user_id)

        tmp_thumbnail = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
        tmp_reel = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
        tmp_video = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
        tmp_thumbnail.close(); tmp_reel.close(); tmp_video.close()
        thumbnail_path = Path(tmp_thumbnail.name)
        reel_path = Path(tmp_reel.name)
        video_path = Path(tmp_video.name)

        print(f"📁 Temp output paths:", flush=True)
        print(f"   Thumbnail: {thumbnail_path}", flush=True)
        print(f"   Reel: {reel_path}", flush=True)
        print(f"   Video: {video_path}", flush=True)
        sys.stdout.flush()

        print(f"🔧 Getting brand type for: {brand}", flush=True)
        brand_type = get_brand_type(brand)
        print(f"   Brand type: {brand_type}", flush=True)
        sys.stdout.flush()

        is_manual = getattr(job, 'fixed_title', False)
        brand_ai_prompt = job.ai_prompt if is_manual else None

        print(f"🎨 Initializing ImageGenerator...", flush=True)
        print(f"   Variant: {job.variant}", flush=True)
        print(f"   Brand: {brand}", flush=True)
        print(f"   Mode: {'manual' if is_manual else 'auto-gen (Layer 2 will create prompt)'}", flush=True)
        print(f"   AI Prompt: {brand_ai_prompt[:100] if brand_ai_prompt else 'None (Layer 2)'}...", flush=True)
        sys.stdout.flush()

        generator = ImageGenerator(
            brand_type=brand_type,
            variant=job.variant,
            brand_name=brand,
            ai_prompt=brand_ai_prompt,
            image_model=getattr(job, 'image_model', None),
            ctx=ctx
        )
        print(f"   ✓ ImageGenerator initialized successfully", flush=True)
        sys.stdout.flush()

        if job.variant == "dark":
            _update_output({
                "status": "generating",
                "progress_message": f"Generating unique AI background for {brand} (this may take ~30s)...",
                "progress_percent": 5
            })

        # Step 1: Generate thumbnail
        print(f"\n🖼️  Step 1/4: Generating thumbnail...", flush=True)
        sys.stdout.flush()
        _update_output({
            "status": "generating",
            "progress_message": "Generating thumbnail..." if job.variant == "light" else "Generating thumbnail with AI background...",
            "progress_percent": 10
        })
        generator.generate_thumbnail(use_title, thumbnail_path)
        print(f"   ✓ Thumbnail saved: {thumbnail_path}", flush=True)

        if job.variant == "dark" and getattr(generator, '_actual_deapi_prompt', None):
            _update_output({"ai_prompt": generator._actual_deapi_prompt})
            print(f"   ✓ Updated ai_prompt with actual deAPI prompt", flush=True)

        _update_output({
            "status": "generating",
            "progress_message": "Thumbnail complete",
            "progress_percent": 25
        })

        # Step 2: Generate reel image
        print(f"\n🎨 Step 2/4: Generating reel image...", flush=True)
        print(f"   Title: {use_title[:50]}...", flush=True)
        print(f"   Lines: {len(use_lines)} content lines", flush=True)
        print(f"   CTA: {job.cta_type}", flush=True)
        sys.stdout.flush()
        _update_output({
            "status": "generating",
            "progress_message": "Generating reel image...",
            "progress_percent": 30
        })
        generator.generate_reel_image(
            title=use_title,
            lines=use_lines,
            output_path=reel_path,
            cta_type=job.cta_type,
            ctx=ctx
        )
        print(f"   ✓ Reel image saved: {reel_path}", flush=True)
        _update_output({
            "status": "generating",
            "progress_message": "Reel image complete",
            "progress_percent": 50
        })

        # Step 3: Generate video
        print(f"\n🎬 Step 3/4: Generating video...", flush=True)
        sys.stdout.flush()
        _update_output({
            "status": "generating",
            "progress_message": "Generating video...",
            "progress_percent": 55
        })
        video_gen = VideoGenerator()

        from app.services.media.music_picker import resolve_music_url
        _music_url = resolve_music_url(
            db, user_id,
            getattr(job, 'music_track_id', None),
            getattr(job, 'music_source', None),
        )

        video_gen.generate_reel_video(reel_path, video_path, music_url=_music_url)
        print(f"   ✓ Video saved: {video_path}", flush=True)
        sys.stdout.flush()
        _update_output({
            "status": "generating",
            "progress_message": "Video complete",
            "progress_percent": 75
        })

        # Step 4: Generate caption
        print(f"\n✍️  Step 4/4: Generating caption...", flush=True)
        _update_output({
            "status": "generating",
            "progress_message": "Generating caption...",
            "progress_percent": 80
        })
        from app.services.media.caption_generator import CaptionGenerator
        caption_gen = CaptionGenerator()
        caption = caption_gen.generate_caption(
            brand_name=brand,
            title=use_title,
            content_lines=use_lines,
            cta_type=job.cta_type or "follow_tips",
            ctx=ctx
        )
        print(f"   ✓ Caption generated ({len(caption)} chars)", flush=True)

        print(f"   📺 Generating YouTube title...", flush=True)
        yt_title = caption_gen.generate_youtube_title(
            title=use_title,
            content_lines=use_lines
        )
        print(f"   ✓ YouTube title: {yt_title}", flush=True)

        print(f"   📺 Generating YouTube thumbnail...", flush=True)
        tmp_yt_thumb = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
        tmp_yt_thumb.close()
        yt_thumbnail_path = Path(tmp_yt_thumb.name)
        actual_yt_thumb_path = generator.generate_youtube_thumbnail(
            title=use_title,
            lines=use_lines,
            output_path=yt_thumbnail_path
        )
        print(f"   ✓ YouTube thumbnail saved: {actual_yt_thumb_path}", flush=True)

        _update_output({
            "status": "generating",
            "progress_message": "Finalizing...",
            "progress_percent": 95
        })

        # Upload to Supabase Storage
        _tmp_files = [thumbnail_path, reel_path, video_path, Path(str(actual_yt_thumb_path))]

        def _cleanup_temps():
            for tmp in _tmp_files:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass

        try:
            thumb_remote = storage_path(user_id, brand_slug, "thumbnails", f"{reel_id}_thumbnail.png")
            thumb_url = upload_from_path("media", thumb_remote, str(thumbnail_path))
        except StorageError as e:
            print(f"   ❌ Thumbnail upload failed: {e}", flush=True)
            _cleanup_temps()
            raise Exception(f"Failed to upload thumbnail: {str(e)}")
        try:
            reel_remote = storage_path(user_id, brand_slug, "reels", f"{reel_id}_reel.png")
            reel_url = upload_from_path("media", reel_remote, str(reel_path))
        except StorageError as e:
            print(f"   ❌ Reel image upload failed: {e}", flush=True)
            _cleanup_temps()
            raise Exception(f"Failed to upload reel image: {str(e)}")
        try:
            video_remote = storage_path(user_id, brand_slug, "videos", f"{reel_id}_video.mp4")
            video_url = upload_from_path("media", video_remote, str(video_path))
        except StorageError as e:
            print(f"   ❌ Video upload failed: {e}", flush=True)
            _cleanup_temps()
            raise Exception(f"Failed to upload video: {str(e)}")
        try:
            yt_thumb_filename = Path(str(actual_yt_thumb_path)).name
            yt_remote = storage_path(user_id, brand_slug, "thumbnails", yt_thumb_filename)
            yt_thumb_url = upload_from_path("media", yt_remote, str(actual_yt_thumb_path))
        except StorageError as e:
            print(f"   ❌ YouTube thumbnail upload failed: {e}", flush=True)
            _cleanup_temps()
            raise Exception(f"Failed to upload YouTube thumbnail: {str(e)}")

        _cleanup_temps()

        _update_output({
            "status": "completed",
            "reel_id": reel_id,
            "thumbnail_path": thumb_url,
            "yt_thumbnail_path": yt_thumb_url,
            "reel_path": reel_url,
            "video_path": video_url,
            "caption": caption,
            "yt_title": yt_title,
            "content_lines": use_lines,
            "regenerated_at": datetime.utcnow().isoformat()
        })

        print(f"\n{'='*60}", flush=True)
        print(f"✅ SUCCESS: {brand.upper()} generation completed!", flush=True)
        print(f"{'='*60}\n", flush=True)
        sys.stdout.flush()

        try:
            from app.services.monitoring.cost_tracker import record_content_generated
            record_content_generated("reel")
        except Exception:
            pass

        return {
            "success": True,
            "brand": brand,
            "reel_id": reel_id,
            "thumbnail_path": thumb_url,
            "video_path": video_url
        }

    except Exception as e:
        import traceback

        exc_type, exc_value, exc_traceback = sys.exc_info()
        error_details = {
            "type": exc_type.__name__ if exc_type else "Unknown",
            "message": str(e),
            "traceback": traceback.format_exc()
        }

        print(f"\n{'='*60}", flush=True)
        print(f"❌ GENERATION FAILED FOR {brand.upper()}", flush=True)
        print(f"{'='*60}", flush=True)
        print(f"Error Type: {error_details['type']}", flush=True)
        print(f"Error Message: {error_details['message']}", flush=True)
        print(f"\nFull Traceback:", flush=True)
        print(error_details['traceback'], flush=True)
        print(f"{'='*60}\n", flush=True)
        sys.stdout.flush()

        error_msg = f"{error_details['type']}: {error_details['message']}"
        _update_output({
            "status": "failed",
            "error": error_msg,
            "error_traceback": error_details['traceback']
        })

        return {"success": False, "error": error_msg}
