"""Post processor — generates AI background images for carousel posts."""
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

from app.services.storage.supabase_storage import (
    upload_from_path, storage_path, StorageError,
)


def process_post_brand(manager, db, job_id: str, brand: str) -> Dict[str, Any]:
    """
    Process a single brand for a POST job.
    Only generates the AI background image — composite rendering happens client-side.
    Uses per-brand content stored in brand_outputs (title, ai_prompt).
    """
    print(f"\n📸 process_post_brand() — {brand}", flush=True)

    job = manager.get_job(job_id)
    if not job:
        return {"success": False, "error": f"Job not found: {job_id}"}

    def _update_output(data: dict):
        manager.update_brand_output(job_id, brand, data)

    brand_data = job.get_brand_output(brand)

    _update_output({
        "status": "generating",
        "progress_message": f"Generating AI background for {brand}...",
        "progress_percent": 10,
    })

    try:
        from app.services.media.ai_background import AIBackgroundGenerator

        reel_id = f"{job_id}_{brand}"
        brand_slug = brand
        user_id = job.user_id

        from app.services.content.niche_config_service import NicheConfigService
        ctx = NicheConfigService().get_context(brand_id=brand, user_id=user_id)

        brand_title = brand_data.get("title", "") or job.title or ""
        brand_slides = brand_data.get("slide_texts", []) or job.content_lines or []
        content_context = " | ".join([brand_title] + brand_slides[:4]) if brand_title else None

        generator = AIBackgroundGenerator()
        print(f"   Content context: {content_context[:100] if content_context else 'None'}...", flush=True)

        _update_output({
            "status": "generating",
            "progress_message": f"Generating unique AI background (~30s)...",
            "progress_percent": 30,
        })

        image = generator.generate_post_background(
            brand_name=brand,
            content_context=content_context,
            model_override=getattr(job, 'image_model', None),
            ctx=ctx,
        )

        tmp_bg = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
        tmp_bg.close()
        bg_path = Path(tmp_bg.name)
        image.save(str(bg_path), format="PNG")
        print(f"   ✓ Background saved to temp: {bg_path}", flush=True)

        actual_prompt = getattr(generator, 'last_deapi_prompt', None)
        if actual_prompt:
            _update_output({"ai_prompt": actual_prompt})
            print(f"   ✓ Updated ai_prompt with actual deAPI prompt", flush=True)

        try:
            bg_remote = storage_path(user_id, brand_slug, "posts", f"{reel_id}_background.png")
            bg_url = upload_from_path("media", bg_remote, str(bg_path))
            print(f"   ☁️  Background uploaded: {bg_url}", flush=True)
        except StorageError as e:
            print(f"   ❌ Post background upload failed: {e}", flush=True)
            try:
                os.unlink(bg_path)
            except OSError:
                pass
            raise Exception(f"Failed to upload background image to storage: {str(e)}")
        finally:
            try:
                if os.path.exists(bg_path):
                    os.unlink(bg_path)
            except OSError:
                pass

        import time as _time
        cache_bust = int(_time.time())
        _update_output({
            "status": "completed",
            "reel_id": reel_id,
            "thumbnail_path": bg_url,
            "thumbnail_url": f"{bg_url}?t={cache_bust}" if bg_url else "",
            "regenerated_at": datetime.utcnow().isoformat(),
        })

        print(f"   ✅ {brand} post background completed", flush=True)

        # Pre-render carousel images (cover + text slides)
        if brand_slides and bg_url:
            try:
                import requests as _req
                resp = _req.get(bg_url, timeout=60)
                resp.raise_for_status()
                tmp_bg_render = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                tmp_bg_render.write(resp.content)
                tmp_bg_render.close()

                from app.services.media.carousel_renderer import render_carousel_images
                composed = render_carousel_images(
                    brand=brand,
                    title=brand_title,
                    background_image=tmp_bg_render.name,
                    slide_texts=brand_slides,
                    reel_id=reel_id,
                    user_id=user_id,
                )
                if composed:
                    cover_url = composed.get("coverUrl")
                    slide_urls = composed.get("slideUrls", [])
                    if cover_url:
                        carousel_paths = [cover_url] + slide_urls
                        _update_output({"carousel_paths": carousel_paths})
                        print(f"   📑 Pre-rendered {len(carousel_paths)} carousel images", flush=True)

                try:
                    os.unlink(tmp_bg_render.name)
                except OSError:
                    pass
            except Exception as render_err:
                print(f"   ⚠️ Carousel pre-render warning (non-fatal): {render_err}", flush=True)

        try:
            from app.services.monitoring.cost_tracker import record_content_generated
            record_content_generated("carousel")
        except Exception:
            pass

        return {"success": True, "brand": brand, "reel_id": reel_id}

    except Exception as e:
        import traceback
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"   ❌ Failed: {error_msg}", flush=True)
        traceback.print_exc()
        _update_output({
            "status": "failed",
            "error": error_msg,
        })
        return {"success": False, "error": error_msg}
