"""Format B processor — sources images, composes thumbnail + slideshow video."""
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

from app.services.storage.supabase_storage import (
    upload_from_path, storage_path, StorageError,
)
from app.services.content.processors._helpers import download_logo_safe


def process_format_b_brand(manager, db, job_id: str, brand: str) -> Dict[str, Any]:
    """
    Process a Format B reel for a single brand.
    Sources images, composes thumbnail, composes slideshow video, uploads to Supabase.
    """
    print(f"\n📹 process_format_b_brand() — {brand}", flush=True)

    job = manager.get_job(job_id)
    if not job:
        return {"success": False, "error": f"Job not found: {job_id}"}

    def _update_output(data: dict):
        manager.update_brand_output(job_id, brand, data)

    tv_data = job.format_b_data or {}
    brand_data = job.get_brand_output(brand)
    reel_id = f"{job_id}_{brand}"
    user_id = job.user_id

    _update_output({
        "status": "generating",
        "progress_message": "Generating images...",
        "progress_percent": 5,
    })

    try:
        from app.services.media.image_sourcer import ImageSourcer, get_image_source_mode, get_thumbnail_image_source_mode
        from app.services.media.thumbnail_compositor import ThumbnailCompositor
        from app.services.media.slideshow_compositor import SlideshowCompositor
        from app.services.discovery.story_polisher import ImagePlan
        from app.models.format_b_design import FormatBDesign
        from app.models.brands import Brand

        design = db.query(FormatBDesign).filter(
            FormatBDesign.user_id == user_id
        ).first()
        brand_obj = db.query(Brand).filter(
            Brand.id == brand, Brand.user_id == user_id
        ).first()

        brand_display_name = brand_obj.display_name if brand_obj else brand
        brand_handle = brand_obj.instagram_handle if brand_obj else None
        brand_logo_url = brand_obj.logo_path if brand_obj else None
        brand_divider_logo_url = (brand_obj.reel_divider_logo_path if brand_obj else None) or brand_logo_url
        brand_content_logo_url = (brand_obj.reel_content_logo_path if brand_obj else None) or brand_logo_url

        brand_logo_local = download_logo_safe(brand_logo_url, "Brand logo")

        brand_divider_logo_local = brand_logo_local
        if brand_divider_logo_url and brand_divider_logo_url != brand_logo_url:
            brand_divider_logo_local = download_logo_safe(brand_divider_logo_url, "Divider logo") or brand_logo_local

        brand_content_logo_local = brand_logo_local
        if brand_content_logo_url and brand_content_logo_url != brand_logo_url:
            brand_content_logo_local = download_logo_safe(brand_content_logo_url, "Content logo") or brand_logo_local

        # Step 1: Source images
        image_source_mode = get_image_source_mode(db=db, user_id=user_id)
        thumbnail_image_source_mode = get_thumbnail_image_source_mode(db=db, user_id=user_id)
        sourcer = ImageSourcer(db=db, image_source_mode=image_source_mode)
        image_plans = [
            ImagePlan(**ip) for ip in tv_data.get("images", [])
        ]
        thumb_plan_raw = tv_data.get("thumbnail_image", {})
        thumb_plan = ImagePlan(**thumb_plan_raw) if thumb_plan_raw else (
            image_plans[0] if image_plans else None
        )

        image_paths = []
        for i, plan in enumerate(image_plans):
            _update_output({
                "progress_message": f"Generating image {i+1}/{len(image_plans)}...",
                "progress_percent": 5 + int(30 * (i / max(len(image_plans), 1))),
            })
            path = sourcer.source_image(plan)
            if path:
                image_paths.append(path)
                print(f"   ✓ Image {i+1}: {path}", flush=True)
            else:
                print(f"   ⚠️ Image {i+1} failed to source", flush=True)

        if not image_paths:
            raise ValueError("Failed to source any images for format-b reel")

        image_service = sourcer.last_service_used
        if job.format_b_data and isinstance(job.format_b_data, dict):
            updated_format_b_data = dict(job.format_b_data)
            updated_format_b_data["image_service"] = image_service
            updated_format_b_data["image_source_mode"] = image_source_mode
            updated_format_b_data["thumbnail_image_source_mode"] = thumbnail_image_source_mode

            job.format_b_data = updated_format_b_data
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(job, "format_b_data")
            db.commit()

        # Step 2: Compose thumbnail
        _update_output({
            "progress_message": "Composing thumbnail...",
            "progress_percent": 40,
        })

        thumb_image_path = None
        if thumb_plan:
            thumb_sourcer = ImageSourcer(db=db, image_source_mode=thumbnail_image_source_mode)
            thumb_image_path = thumb_sourcer.source_image(thumb_plan)
        if not thumb_image_path:
            thumb_image_path = image_paths[0]

        title_lines = tv_data.get("thumbnail_title_lines", [])
        if not title_lines:
            raw_title = tv_data.get("thumbnail_title", job.title or "")
            title_lines = [l.strip() for l in raw_title.split("\n") if l.strip()]

        compositor = ThumbnailCompositor()
        thumbnail_path = compositor.compose_thumbnail(
            main_image_path=thumb_image_path,
            title_lines=title_lines,
            logo_path=brand_divider_logo_local,
            design=design,
        )
        print(f"   ✓ Thumbnail composed: {thumbnail_path}", flush=True)

        # Step 3: Compose slideshow video
        _update_output({
            "progress_message": "Composing video slideshow...",
            "progress_percent": 55,
        })

        reel_lines = tv_data.get("reel_lines", job.content_lines or [])
        tmp_video = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
        tmp_video.close()
        video_output = Path(tmp_video.name)

        slideshow = SlideshowCompositor()

        music_path = None
        music_enabled = getattr(design, 'reel_music_enabled', True) if design else True
        if music_enabled:
            from app.services.media.music_picker import get_random_local_music_path
            music_path = get_random_local_music_path()
            if music_path:
                print(f"   🎵 Using music: {music_path.name}", flush=True)
            else:
                print(f"   ⚠️ No music files available", flush=True)

        result_path = slideshow.compose_reel(
            image_paths=image_paths,
            reel_lines=reel_lines,
            output_path=video_output,
            design=design,
            music_path=music_path,
            logo_path=brand_content_logo_local,
            brand_name=brand_display_name,
            handle=brand_handle,
        )
        if not result_path:
            raise ValueError("Slideshow composition failed (FFmpeg error)")
        print(f"   ✓ Video composed: {result_path}", flush=True)

        # Step 4: Upload to Supabase
        _update_output({
            "progress_message": "Uploading to storage...",
            "progress_percent": 80,
        })

        brand_slug = brand
        all_tmp = list(image_paths) + [thumbnail_path, video_output]
        if music_path:
            all_tmp.append(music_path)
        if brand_logo_local:
            all_tmp.append(brand_logo_local)

        def _cleanup():
            for p in all_tmp:
                try:
                    os.unlink(p)
                except OSError:
                    pass

        try:
            thumb_remote = storage_path(user_id, brand_slug, "thumbnails", f"{reel_id}_thumbnail.jpg")
            thumb_url = upload_from_path("media", thumb_remote, str(thumbnail_path))
            print(f"   ☁️  Thumbnail uploaded: {thumb_url}", flush=True)
        except StorageError as e:
            _cleanup()
            raise Exception(f"Thumbnail upload failed: {e}")

        try:
            video_remote = storage_path(user_id, brand_slug, "videos", f"{reel_id}_format_b.mp4")
            video_url = upload_from_path("media", video_remote, str(video_output))
            print(f"   ☁️  Video uploaded: {video_url}", flush=True)
        except StorageError as e:
            _cleanup()
            raise Exception(f"Video upload failed: {e}")

        _cleanup()

        # Step 5: Update brand output
        import time as _time
        cache_bust = int(_time.time())

        caption = tv_data.get("caption", "")
        content_title = " ".join(
            tv_data.get("thumbnail_title", job.title or "").replace("\n", " ").split()
        ).title()
        _update_output({
            "status": "completed",
            "reel_id": reel_id,
            "thumbnail_path": thumb_url,
            "thumbnail_url": f"{thumb_url}?t={cache_bust}" if thumb_url else "",
            "video_path": video_url,
            "caption": caption,
            "title": content_title,
            "content_format": "format_b",
            "content_lines": reel_lines,
            "regenerated_at": datetime.utcnow().isoformat(),
        })

        print(f"   ✅ {brand} format-b reel completed", flush=True)
        return {
            "success": True,
            "brand": brand,
            "reel_id": reel_id,
            "thumbnail_path": thumb_url,
            "video_path": video_url,
        }

    except Exception as e:
        import traceback
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"   ❌ Format B failed: {error_msg}", flush=True)
        traceback.print_exc()
        _update_output({
            "status": "failed",
            "error": error_msg,
        })
        return {"success": False, "error": error_msg}
