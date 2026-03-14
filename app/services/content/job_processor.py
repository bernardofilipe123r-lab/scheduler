"""Job processing pipeline — content generation, video creation, post compositing."""
import os
import re
import tempfile
import threading
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any

from app.core.config import get_brand_config
from app.services.media.image_generator import ImageGenerator
from app.services.media.video_generator import VideoGenerator
from app.services.content.differentiator import ContentDifferentiator
from app.services.brands.resolver import brand_resolver
from app.services.storage.supabase_storage import (
    upload_from_path, storage_path, StorageError,
)

# Per-brand generation timeout (in seconds). Default: 10 minutes.
BRAND_GENERATION_TIMEOUT = int(os.getenv("BRAND_GENERATION_TIMEOUT_SECONDS", "600"))

# CTA patterns that the AI sometimes generates despite being told not to.
# These get stripped from content_lines since the real CTA is appended by image_generator.
_CTA_PATTERNS = [
    re.compile(r'follow.*page', re.IGNORECASE),
    re.compile(r'follow.*us', re.IGNORECASE),
    re.compile(r'follow.*for.*part', re.IGNORECASE),
    re.compile(r'follow.*for.*more', re.IGNORECASE),
    re.compile(r'follow.*our', re.IGNORECASE),
    re.compile(r'comment.*"', re.IGNORECASE),
    re.compile(r'comment.*lean', re.IGNORECASE),
    re.compile(r'comment.*plan', re.IGNORECASE),
    re.compile(r'if you want to.*(follow|improve|learn)', re.IGNORECASE),
    re.compile(r'stay tuned.*follow', re.IGNORECASE),
]


def _strip_cta_lines(lines: List[str]) -> List[str]:
    """Remove any CTA-like lines that the AI added despite prompt instructions."""
    cleaned = []
    for line in lines:
        if any(p.search(line) for p in _CTA_PATTERNS):
            print(f"   ⚠️ Stripped AI-generated CTA from content_lines: {line[:60]}...", flush=True)
            continue
        cleaned.append(line)
    return cleaned


def _get_brand_type(brand_name: str) -> str:
    """Resolve brand name to canonical brand ID."""
    return brand_resolver.resolve_brand_name(brand_name) or brand_name


def _download_logo_safe(url: str, label: str) -> Optional[Path]:
    """Download a logo URL to a temp file. Returns Path on success, None on failure."""
    if not url or not url.startswith("http"):
        return None
    try:
        import httpx
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
        tmp.close()
        resp = httpx.get(url, timeout=15, follow_redirects=True)
        if resp.status_code == 200:
            with open(tmp.name, 'wb') as f:
                f.write(resp.content)
            print(f"   ✓ {label} downloaded: {tmp.name}", flush=True)
            return Path(tmp.name)
    except Exception as e:
        print(f"   ⚠️ {label} download failed: {e}", flush=True)
    return None


class JobProcessor:
    """Processing pipeline — generates images, videos, and captions for jobs."""

    # ── Format Registry ───────────────────────────────────────────────
    # Maps job variant → brand processor method name.
    # To add a new format: add one entry here + implement the method.
    # Everything else (process_job, resume_job, regenerate) routes through this.
    VARIANT_PROCESSORS = {
        "light": "regenerate_brand",
        "dark": "regenerate_brand",
        "format_b": "process_format_b_brand",
        "post": "process_post_brand",
        "threads": "process_threads_brand",
    }

    def __init__(self, db):
        from app.services.content.job_manager import JobManager
        self._manager = JobManager(db)
        self.db = db

    def _get_brand_processor(self, variant: str):
        """Return the bound brand-processing method for the given variant.

        Raises ValueError for unknown variants so bugs surface immediately.
        """
        method_name = self.VARIANT_PROCESSORS.get(variant)
        if not method_name:
            raise ValueError(
                f"Unknown variant '{variant}'. "
                f"Registered variants: {list(self.VARIANT_PROCESSORS.keys())}"
            )
        return getattr(self, method_name)

    @staticmethod
    def _ensure_cta_paragraph_break(text: str) -> str:
        """Ensure CTA lines like 'Follow @...' are separated by a blank line."""
        import re
        return re.sub(r'(?<!\n)(Follow @|If you want to learn)', r'\n\n\1', text)

    def _run_brands_loop(
        self,
        job_id: str,
        brands: list[str],
        processor_fn,
        *,
        progress_label: str = "Processing",
        extra_kwargs_per_brand: Optional[Dict[str, dict]] = None,
    ) -> Dict[str, Any]:
        """Run a brand processor for each brand with timeout, progress, and cancellation.

        This is the single loop used by process_job, resume_job, and regenerate.
        It handles: progress updates, cancellation checks, per-brand timeouts,
        and status rollup.

        Args:
            job_id: The job being processed
            brands: List of brand IDs to process
            processor_fn: Callable(job_id, brand, **kwargs) → dict with 'success' key
            progress_label: Human-readable label for progress messages
            extra_kwargs_per_brand: Optional dict of {brand: {kwarg: val}} passed to processor_fn
        """
        results = {}
        total = len(brands)

        for i, brand in enumerate(brands):
            job = self._manager.get_job(job_id)
            if job and job.status == "cancelled":
                return results

            progress = int((i / max(total, 1)) * 100)
            msg = f"{progress_label} {brand}..." if total > 1 else f"{progress_label}..."
            self._manager.update_job_status(job_id, "generating", msg, progress)

            extra = {
                **(extra_kwargs_per_brand or {}).get(brand, {}),
                'brand_index': i,
                'total_brands': total,
            }

            # Pre-initialize brand output so frontend shows progress immediately
            self._manager.update_brand_output(job_id, brand, {
                "status": "generating",
                "progress_percent": 0,
                "progress_message": "Starting...",
            })

            result = {"success": False, "error": "Timeout"}

            def _run(b=brand, kw=extra):
                nonlocal result
                try:
                    result = processor_fn(job_id, b, **kw)
                except Exception as ex:
                    result = {"success": False, "error": f"{type(ex).__name__}: {ex}"}

            t = threading.Thread(target=_run, daemon=True)
            t.start()
            t.join(timeout=BRAND_GENERATION_TIMEOUT)

            if t.is_alive():
                timeout_msg = f"BRAND_TIMEOUT: {brand} {progress_label.lower()} exceeded {BRAND_GENERATION_TIMEOUT}s"
                print(f"⏱️  {timeout_msg}", flush=True)
                self._manager.update_brand_output(job_id, brand, {"status": "failed", "error": timeout_msg})
                result = {"success": False, "error": timeout_msg}

            results[brand] = result

        return results

    def regenerate_brand(
        self,
        job_id: str,
        brand: str,
        title: Optional[str] = None,
        content_lines: Optional[List[str]] = None,
        brand_index: int = 0,
        total_brands: int = 1,
    ) -> Dict[str, Any]:
        """
        Regenerate images/video for a single brand.
        Uses existing AI background if available (no new API call for dark mode).
        """
        import sys
        print(f"\n{'='*60}", flush=True)
        print(f"🎨 regenerate_brand() called", flush=True)
        print(f"   Brand: {brand}", flush=True)
        print(f"   Job ID: {job_id}", flush=True)
        print(f"{'='*60}", flush=True)
        sys.stdout.flush()

        job = self._manager.get_job(job_id)
        if not job:
            error_msg = f"Job not found: {job_id}"
            print(f"❌ ERROR: {error_msg}", flush=True)
            return {"success": False, "error": error_msg}

        # Helper to thread through all update_brand_output calls
        def _update_output(data: dict):
            self._manager.update_brand_output(job_id, brand, data)
            if "progress_percent" in data:
                job_pct = int(
                    (brand_index / max(total_brands, 1)) * 100
                    + (data["progress_percent"] / max(total_brands, 1))
                )
                self._manager.update_job_status(
                    job_id, "generating", data.get("progress_message"), job_pct
                )

        # Use provided values or fall back to per-brand title in brand_outputs, then job title
        brand_data = job.get_brand_output(brand)
        use_title = title if title is not None else (brand_data.get("title") or job.title)
        use_lines = content_lines if content_lines is not None else job.content_lines

        # Strip any CTA lines the AI may have included (real CTA added by image_generator)
        if use_lines and job.variant != 'post':
            use_lines = _strip_cta_lines(use_lines)

        # Only run differentiation if:
        # 1. No pre-generated content was passed
        # 2. We're regenerating a single brand (not part of batch process)
        # When called from process_job, content_lines is already pre-differentiated
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
            self._manager.update_job_inputs(job_id, title=title, content_lines=content_lines)

        # Update brand status with initial progress
        _update_output({
            "status": "generating",
            "progress_message": "Starting generation...",
            "progress_percent": 0
        })

        try:
            # For each brand, generate a unique reel_id
            reel_id = brand_data.get("reel_id", f"{job_id}_{brand}")
            brand_slug = brand
            user_id = job.user_id

            # Build PromptContext from NicheConfig so CTA options load from DB settings
            from app.services.content.niche_config_service import NicheConfigService
            ctx = NicheConfigService().get_context(brand_id=brand, user_id=user_id)

            # Use temp files (FFmpeg/PIL need paths); upload to Supabase then delete
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

            # Create image generator
            print(f"🔧 Getting brand type for: {brand}", flush=True)
            brand_type = _get_brand_type(brand)
            print(f"   Brand type: {brand_type}", flush=True)
            sys.stdout.flush()

            # Each brand gets its own unique AI background (no caching/sharing)
            # The AIBackgroundGenerator uses a unique seed per generation

            # For manual mode (fixed_title=True), the user's ai_prompt goes
            # directly to deAPI, bypassing Layer 2. For auto-generated reels,
            # ai_prompt is None — Layer 2 (DeepSeek) creates the image prompt
            # from the content (title + lines) only.
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

            # Update progress for AI background generation (can take 30-60s)
            if job.variant == "dark":
                _update_output({
                    "status": "generating",
                    "progress_message": f"Generating unique AI background for {brand} (this may take ~30s)...",
                    "progress_percent": 5
                })

            # Generate thumbnail
            print(f"\n🖼️  Step 1/4: Generating thumbnail...", flush=True)
            sys.stdout.flush()
            _update_output({
                "status": "generating",
                "progress_message": "Generating thumbnail..." if job.variant == "light" else "Generating thumbnail with AI background...",
                "progress_percent": 10
            })
            generator.generate_thumbnail(use_title, thumbnail_path)
            print(f"   ✓ Thumbnail saved: {thumbnail_path}", flush=True)

            # After first image generation, update brand_outputs with the actual
            # deAPI prompt so the UI shows what was really sent to the image model
            if job.variant == "dark" and getattr(generator, '_actual_deapi_prompt', None):
                _update_output({
                    "ai_prompt": generator._actual_deapi_prompt,
                })
                print(f"   ✓ Updated ai_prompt with actual deAPI prompt", flush=True)

            _update_output({
                "status": "generating",
                "progress_message": "Thumbnail complete",
                "progress_percent": 25
            })

            # Generate reel image
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

            # Generate video
            print(f"\n🎬 Step 3/4: Generating video...", flush=True)
            sys.stdout.flush()
            _update_output({
                "status": "generating",
                "progress_message": "Generating video...",
                "progress_percent": 55
            })
            video_gen = VideoGenerator()

            # Pick a music track based on music_source
            from app.services.media.music_picker import resolve_music_url
            _music_url = resolve_music_url(
                self.db, user_id,
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

            # Generate caption
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

            # Generate YouTube title (searchable, clickable, no numbers)
            print(f"   📺 Generating YouTube title...", flush=True)
            yt_title = caption_gen.generate_youtube_title(
                title=use_title,
                content_lines=use_lines
            )
            print(f"   ✓ YouTube title: {yt_title}", flush=True)

            # Generate YouTube thumbnail (clean AI image, no text)
            print(f"   📺 Generating YouTube thumbnail...", flush=True)
            tmp_yt_thumb = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
            tmp_yt_thumb.close()
            yt_thumbnail_path = Path(tmp_yt_thumb.name)
            # generate_youtube_thumbnail returns the actual saved path (may be .jpg)
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

            # Upload to Supabase Storage (Supabase-only, no local persistence)
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

            # Clean up temp files after successful uploads
            _cleanup_temps()

            # Update brand output with Supabase URLs
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

            # Track reel generation
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
            import sys

            # Get detailed error information
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

            # Store detailed error in database
            error_msg = f"{error_details['type']}: {error_details['message']}"
            _update_output({
                "status": "failed",
                "error": error_msg,
                "error_traceback": error_details['traceback']
            })

            return {"success": False, "error": error_msg}

    def process_post_brand(
        self, job_id: str, brand: str,
        brand_index: int = 0, total_brands: int = 1,
    ) -> Dict[str, Any]:
        """
        Process a single brand for a POST job.
        Only generates the AI background image — composite rendering happens client-side.
        Uses per-brand content stored in brand_outputs (title, ai_prompt).
        """
        import sys
        print(f"\n📸 process_post_brand() — {brand}", flush=True)

        job = self._manager.get_job(job_id)
        if not job:
            return {"success": False, "error": f"Job not found: {job_id}"}

        # Helper to thread through all update_brand_output calls
        def _update_output(data: dict):
            self._manager.update_brand_output(job_id, brand, data)
            if "progress_percent" in data:
                job_pct = int(
                    (brand_index / max(total_brands, 1)) * 100
                    + (data["progress_percent"] / max(total_brands, 1))
                )
                self._manager.update_job_status(
                    job_id, "generating", data.get("progress_message"), job_pct
                )

        # Get per-brand content from brand_outputs
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

            # Build PromptContext from NicheConfig for niche-specific imagery
            from app.services.content.niche_config_service import NicheConfigService
            ctx = NicheConfigService().get_context(brand_id=brand, user_id=user_id)

            # Build content context from title + slide_texts for Layer 2
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

            # Save to temp file, upload to Supabase, delete temp
            tmp_bg = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
            tmp_bg.close()
            bg_path = Path(tmp_bg.name)
            image.save(str(bg_path), format="PNG")
            print(f"   ✓ Background saved to temp: {bg_path}", flush=True)

            # Store the actual deAPI prompt so the UI shows what was really sent
            actual_prompt = getattr(generator, 'last_deapi_prompt', None)
            if actual_prompt:
                _update_output({
                    "ai_prompt": actual_prompt,
                })
                print(f"   ✓ Updated ai_prompt with actual deAPI prompt", flush=True)

            # Upload to Supabase - CRITICAL: must succeed for post to be valid
            try:
                bg_remote = storage_path(user_id, brand_slug, "posts", f"{reel_id}_background.png")
                bg_url = upload_from_path("media", bg_remote, str(bg_path))
                print(f"   ☁️  Background uploaded: {bg_url}", flush=True)
            except StorageError as e:
                print(f"   ❌ Post background upload failed: {e}", flush=True)
                # Clean up temp file before raising
                try:
                    os.unlink(bg_path)
                except OSError:
                    pass
                # Re-raise to fail the job instead of creating broken post
                raise Exception(f"Failed to upload background image to storage: {str(e)}")
            finally:
                # Clean up temp file if upload succeeded
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

            # ── Pre-render carousel images (cover + text slides) ─────
            # Same approach as the Toby orchestrator: render all slides
            # server-side so the Pipeline can display them without
            # client-side Canvas rendering.
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

            # Track content generation
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

    def process_format_b_brand(
        self, job_id: str, brand: str,
        brand_index: int = 0, total_brands: int = 1,
    ) -> Dict[str, Any]:
        """
        Process a Format B reel for a single brand.
        Sources images, composes thumbnail, composes slideshow video, uploads to Supabase.
        """
        print(f"\n📹 process_format_b_brand() — {brand}", flush=True)

        job = self._manager.get_job(job_id)
        if not job:
            return {"success": False, "error": f"Job not found: {job_id}"}

        # Helper to thread through all update_brand_output calls
        def _update_output(data: dict):
            self._manager.update_brand_output(job_id, brand, data)
            if "progress_percent" in data:
                job_pct = int(
                    (brand_index / max(total_brands, 1)) * 100
                    + (data["progress_percent"] / max(total_brands, 1))
                )
                self._manager.update_job_status(
                    job_id, "generating", data.get("progress_message"), job_pct
                )

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

            # Load user's design preferences + brand info (reuse existing session)
            design = self.db.query(FormatBDesign).filter(
                FormatBDesign.user_id == user_id
            ).first()
            brand_obj = self.db.query(Brand).filter(
                Brand.id == brand, Brand.user_id == user_id
            ).first()

            # Extract brand info for compositor
            brand_display_name = brand_obj.display_name if brand_obj else brand
            brand_handle = brand_obj.instagram_handle if brand_obj else None
            brand_logo_url = brand_obj.logo_path if brand_obj else None
            # Prefer the dedicated divider logo for thumbnails; fall back to main logo
            brand_divider_logo_url = (brand_obj.reel_divider_logo_path if brand_obj else None) or brand_logo_url
            # Prefer the dedicated content logo for reel header; fall back to main logo
            brand_content_logo_url = (brand_obj.reel_content_logo_path if brand_obj else None) or brand_logo_url

            # Download brand logos to temp files
            brand_logo_local = _download_logo_safe(brand_logo_url, "Brand logo")

            # Download divider logo (for thumbnail) if different from main logo
            brand_divider_logo_local = brand_logo_local
            if brand_divider_logo_url and brand_divider_logo_url != brand_logo_url:
                brand_divider_logo_local = _download_logo_safe(brand_divider_logo_url, "Divider logo") or brand_logo_local

            # Download content logo (for reel header) if different from main logo
            brand_content_logo_local = brand_logo_local
            if brand_content_logo_url and brand_content_logo_url != brand_logo_url:
                brand_content_logo_local = _download_logo_safe(brand_content_logo_url, "Content logo") or brand_logo_local

            # ── Step 1: Source images ──────────────────────────
            image_source_mode = get_image_source_mode(db=self.db, user_id=user_id)
            thumbnail_image_source_mode = get_thumbnail_image_source_mode(db=self.db, user_id=user_id)

            # Calculate image box dimensions from user's design settings
            _padding_left = getattr(design, 'reel_padding_left', 85) or 85
            _padding_right = getattr(design, 'reel_padding_right', 85) or 85
            _image_height = getattr(design, 'reel_image_height', 660) or 660
            _image_box_width = 1080 - _padding_left - _padding_right  # Canvas width minus padding

            sourcer = ImageSourcer(
                db=self.db, image_source_mode=image_source_mode,
                image_box_width=_image_box_width, image_box_height=_image_height,
            )
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

            # Store which image service was used in format_b_data
            image_service = sourcer.last_service_used
            if job.format_b_data and isinstance(job.format_b_data, dict):
                updated_format_b_data = dict(job.format_b_data)
                updated_format_b_data["image_service"] = image_service
                updated_format_b_data["image_source_mode"] = image_source_mode
                updated_format_b_data["thumbnail_image_source_mode"] = thumbnail_image_source_mode

                job.format_b_data = updated_format_b_data
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(job, "format_b_data")
                self.db.commit()

            # ── Step 2: Compose thumbnail ─────────────────────
            _update_output({
                "progress_message": "Composing thumbnail...",
                "progress_percent": 40,
            })

            thumb_image_path = None
            if thumb_plan:
                # Thumbnail uses its own image source mode (independent from content slides)
                thumb_sourcer = ImageSourcer(db=self.db, image_source_mode=thumbnail_image_source_mode)
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

            # ── Step 3: Compose slideshow video ───────────────
            _update_output({
                "progress_message": "Composing video slideshow...",
                "progress_percent": 55,
            })

            reel_lines = tv_data.get("reel_lines", job.content_lines or [])
            tmp_video = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
            tmp_video.close()
            video_output = Path(tmp_video.name)

            slideshow = SlideshowCompositor()

            # Resolve music if enabled in design settings
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

            # ── Step 4: Upload to Supabase ────────────────────
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

            # ── Step 5: Update brand output ───────────────────
            import time as _time
            cache_bust = int(_time.time())

            caption = tv_data.get("caption", "")
            # Store title from the polished data
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

    def process_threads_brand(
        self,
        job_id: str,
        brand: str,
        brand_index: int = 0,
        total_brands: int = 1,
    ) -> Dict[str, Any]:
        """Generate thread text content for a single brand.

        Text-only — no media rendering. Uses ThreadsGenerator to produce
        single posts or thread chains via DeepSeek.
        """
        import sys
        print(f"\n🧵 process_threads_brand() — brand={brand}", flush=True)
        sys.stdout.flush()

        job = self._manager.get_job(job_id)
        if not job:
            return {"success": False, "error": f"Job not found: {job_id}"}

        def _update_output(data: dict):
            self._manager.update_brand_output(job_id, brand, data)
            if "progress_percent" in data:
                job_pct = int(
                    (brand_index / max(total_brands, 1)) * 100
                    + (data["progress_percent"] / max(total_brands, 1))
                )
                self._manager.update_job_status(
                    job_id, "generating", data.get("progress_message"), job_pct
                )

        _update_output({"status": "generating", "progress_message": "Generating thread content...", "progress_percent": 10})

        try:
            from app.core.prompt_context import PromptContext
            from app.services.content.threads_generator import ThreadsGenerator
            from app.services.content.niche_config_service import NicheConfigService

            tg = ThreadsGenerator()

            # Build prompt context from brand's Content DNA
            niche_svc = NicheConfigService()
            ctx = niche_svc.get_context(user_id=job.user_id, brand_id=brand)
            if not ctx:
                ctx = PromptContext()

            # Determine mode from job data
            # cta_type stores thread mode: "chain" for chain, anything else for single post
            is_chain = (job.cta_type or "").lower() == "chain"
            # ai_prompt stores format_type preference for auto mode
            format_type = job.ai_prompt if job.ai_prompt in (
                "value_list", "controversial", "myth_bust", "thread_chain",
                "question_hook", "hot_take", "story_micro"
            ) else None
            # content_lines: if provided, use as manual content
            manual_text = job.content_lines[0] if job.content_lines else None

            if manual_text:
                # Manual mode — user provided the text
                if is_chain and len(job.content_lines) >= 2:
                    # Manual chain — content_lines are the chain parts
                    _update_output({
                        "status": "completed",
                        "caption": job.content_lines[0],
                        "is_chain": True,
                        "chain_parts": job.content_lines,
                        "format_type": "thread_chain",
                    })
                else:
                    # Manual single post
                    _update_output({
                        "status": "completed",
                        "caption": manual_text,
                        "is_chain": False,
                        "format_type": format_type or "manual",
                    })
                print(f"   ✅ {brand} manual thread content stored", flush=True)
                return {"success": True, "brand": brand}

            # Auto mode — generate via AI
            if is_chain:
                result = tg.generate_thread_chain(ctx, num_parts=6)
                if result and "parts" in result:
                    _update_output({
                        "status": "completed",
                        "caption": result["parts"][0],
                        "is_chain": True,
                        "chain_parts": result["parts"],
                        "format_type": "thread_chain",
                        "topic": result.get("topic", ""),
                    })
                    print(f"   ✅ {brand} thread chain generated ({len(result['parts'])} parts)", flush=True)
                    return {"success": True, "brand": brand}
                else:
                    raise ValueError("Thread chain generation returned no results")
            else:
                result = tg.generate_single_post(ctx, format_type=format_type)
                if result and "text" in result:
                    _update_output({
                        "status": "completed",
                        "caption": result["text"],
                        "is_chain": False,
                        "format_type": result.get("format_type", format_type or "auto"),
                    })
                    print(f"   ✅ {brand} thread post generated", flush=True)
                    return {"success": True, "brand": brand}
                else:
                    raise ValueError("Thread post generation returned no results")

        except Exception as e:
            import traceback
            error_msg = f"{type(e).__name__}: {str(e)}"
            print(f"   ❌ Threads generation failed: {error_msg}", flush=True)
            traceback.print_exc()
            _update_output({"status": "failed", "error": error_msg})
            return {"success": False, "error": error_msg}

    def process_job(self, job_id: str) -> Dict[str, Any]:
        """
        Process a generation job (generate all brands).
        This is the main entry point for job execution.
        Checks for cancellation between each brand.
        """
        import sys
        print(f"\n🎬 process_job called for: {job_id}", flush=True)
        sys.stdout.flush()

        job = self._manager.get_job(job_id)
        if not job:
            error_msg = f"Job not found: {job_id}"
            print(f"❌ {error_msg}", flush=True)
            return {"success": False, "error": error_msg}

        # Set user context for cost tracking
        try:
            from app.services.monitoring.cost_tracker import set_current_user
            if job.user_id:
                set_current_user(job.user_id)
        except Exception:
            pass

        content_count = 1

        print(f"   Job found - brands: {job.brands}, variant: {job.variant}", flush=True)
        print(f"   Title: {job.title[:50] if job.title else 'None'}...", flush=True)
        print(f"   Content lines: {len(job.content_lines or [])}", flush=True)
        sys.stdout.flush()

        # Check if already cancelled before starting
        if job.status == "cancelled":
            print(f"❌ Job was cancelled", flush=True)
            return {"success": False, "error": "Job was cancelled"}

        # Validate brands list
        if not job.brands or len(job.brands) == 0:
            error_msg = "No brands specified for job"
            print(f"❌ {error_msg}", flush=True)
            self._manager.update_job_status(job_id, "failed", error_message=error_msg)
            return {"success": False, "error": error_msg}

        print(f"📝 Updating job status to 'generating'...", flush=True)
        self._manager.update_job_status(job_id, "generating", "Starting generation...", 0)
        print(f"   ✓ Status updated", flush=True)

        # ── THREADS variant: text-only generation ──────────────────────
        if job.variant == "threads":
            print(f"🧵 THREADS variant — generating text per brand", flush=True)
            results = {}
            total_work = len(job.brands)
            try:
                for wi, brand in enumerate(job.brands):
                    job = self._manager.get_job(job_id)
                    if job.status == "cancelled":
                        return {"success": False, "error": "Job was cancelled", "results": results}

                    progress = int((wi / max(total_work, 1)) * 100)
                    step_msg = f"Generating thread for {brand}..."
                    self._manager.update_job_status(job_id, "generating", step_msg, progress)

                    # Pre-initialize brand output so frontend shows progress immediately
                    self._manager.update_brand_output(job_id, brand, {
                        "status": "generating",
                        "progress_percent": 0,
                        "progress_message": "Starting...",
                    })
                    thread_result = {"success": False, "error": "Timeout"}
                    def _run_thread_brand(b=brand, bi=wi, tot=total_work):
                        nonlocal thread_result
                        try:
                            thread_result = self.process_threads_brand(job_id, b, brand_index=bi, total_brands=tot)
                        except Exception as ex:
                            thread_result = {"success": False, "error": f"{type(ex).__name__}: {str(ex)}"}

                    t = threading.Thread(target=_run_thread_brand, daemon=True)
                    t.start()
                    t.join(timeout=BRAND_GENERATION_TIMEOUT)

                    if t.is_alive():
                        timeout_msg = f"BRAND_TIMEOUT: {brand} thread generation exceeded {BRAND_GENERATION_TIMEOUT}s"
                        print(f"⏱️  {timeout_msg}", flush=True)
                        self._manager.update_brand_output(job_id, brand, {"status": "failed", "error": timeout_msg})
                        thread_result = {"success": False, "error": timeout_msg}

                    results[brand] = thread_result

                all_ok = all(r.get("success") for r in results.values())
                any_ok = any(r.get("success") for r in results.values())
                final_status = "completed" if all_ok else ("completed" if any_ok else "failed")
                self._manager.update_job_status(job_id, final_status, progress_percent=100)
                return {"success": any_ok, "results": results}
            except Exception as e:
                import traceback
                traceback.print_exc()
                self._manager.update_job_status(job_id, "failed", error_message=str(e))
                return {"success": False, "error": str(e)}

        # ── POST variant: only generate backgrounds ──────────────────
        if job.variant == "post":
            print(f"📸 POST variant — generating posts per brand", flush=True)
            results = {}
            total_brands = len(job.brands)
            try:
                from app.services.content.generator import ContentGenerator
                cg = ContentGenerator()

                if getattr(job, 'fixed_title', False):
                    # ── MANUAL MODE: Use the user's title as-is ──────────
                    print(f"   📌 Fixed title mode: {job.title[:80]}", flush=True)
                    self._manager.update_job_status(job_id, "generating", "Using provided title...", 5)

                    image_prompt = job.ai_prompt
                    if not image_prompt:
                        prompt_result = cg.generate_image_prompt(job.title)
                        image_prompt = prompt_result.get("image_prompt", "")

                    for brand in job.brands:
                        existing = job.get_brand_output(brand)
                        self._manager.update_brand_output(job_id, brand, {
                            "title": job.title,
                            "caption": existing.get("caption", ""),
                            "ai_prompt": image_prompt,
                            "slide_texts": existing.get("slide_texts", job.content_lines or []),
                            "status": "pending",
                        })
                        print(f"   📝 {brand}: {job.title[:60]}...", flush=True)
                else:
                    # ── AUTO MODE: AI generates unique posts PER BRAND ───
                    # Each brand gets its own DeepSeek call with brand-specific
                    # Content DNA (topics, tone, examples, citations).
                    topic_hint = job.ai_prompt or None
                    print(f"   🧠 Generating {total_brands} unique posts (per-brand)...", flush=True)
                    self._manager.update_job_status(job_id, "generating", "Generating content...", 5)

                    from app.services.content.unified_generator import generate_carousel_content
                    for i, brand in enumerate(job.brands):
                        try:
                            post_data = generate_carousel_content(
                                user_id=job.user_id,
                                brand_id=brand,
                                topic_hint=topic_hint,
                            )
                            # Ensure CTA on last slide has paragraph break
                            raw_slides = post_data.get("slide_texts", [])
                            if raw_slides:
                                raw_slides = [self._ensure_cta_paragraph_break(s) for s in raw_slides]
                            self._manager.update_brand_output(job_id, brand, {
                                "title": post_data.get("title", job.title),
                                "caption": post_data.get("caption", ""),
                                "ai_prompt": post_data.get("image_prompt", ""),
                                "slide_texts": raw_slides,
                                "status": "pending",
                            })
                            print(f"   📝 {brand}: {post_data.get('title', '?')[:60]}...", flush=True)
                        except Exception as brand_err:
                            print(f"   ⚠️ Post generation failed for {brand}: {brand_err}", flush=True)
                            self._manager.update_brand_output(job_id, brand, {
                                "status": "failed", "error": str(brand_err)
                            })
                    print(f"   ✓ Generated posts for {total_brands} brand(s)", flush=True)

                # Now generate images for each brand
                for wi, brand in enumerate(job.brands):
                    job = self._manager.get_job(job_id)
                    if job.status == "cancelled":
                        return {"success": False, "error": "Job was cancelled", "results": results}
                    progress = int(((wi + 1) / (total_brands + 1)) * 100)
                    self._manager.update_job_status(job_id, "generating", f"Generating image for {brand}...", progress)

                    # Pre-initialize brand output so frontend shows progress immediately
                    self._manager.update_brand_output(job_id, brand, {
                        "status": "generating",
                        "progress_percent": 0,
                        "progress_message": "Starting...",
                    })
                    post_result = {"success": False, "error": "Timeout"}
                    def _run_post_brand(b=brand, bi=wi, tot=total_brands):
                        nonlocal post_result
                        try:
                            post_result = self.process_post_brand(job_id, b, brand_index=bi, total_brands=tot)
                        except Exception as ex:
                            post_result = {"success": False, "error": f"{type(ex).__name__}: {str(ex)}"}

                    pt = threading.Thread(target=_run_post_brand, daemon=True)
                    pt.start()
                    pt.join(timeout=BRAND_GENERATION_TIMEOUT)

                    if pt.is_alive():
                        timeout_msg = f"BRAND_TIMEOUT: {brand} post generation exceeded {BRAND_GENERATION_TIMEOUT}s"
                        print(f"⏱️  POST BRAND TIMEOUT: {brand}", flush=True)
                        self._manager.update_brand_output(job_id, brand, {"status": "failed", "error": timeout_msg})
                        post_result = {"success": False, "error": timeout_msg}

                    results[brand] = post_result

                all_ok = all(r.get("success") for r in results.values())
                any_ok = any(r.get("success") for r in results.values())
                final_status = "completed" if all_ok else ("completed" if any_ok else "failed")
                self._manager.update_job_status(job_id, final_status, progress_percent=100)
                return {"success": any_ok, "results": results}
            except Exception as e:
                import traceback
                traceback.print_exc()
                self._manager.update_job_status(job_id, "failed", error_message=str(e))
                return {"success": False, "error": str(e)}

        # ── Format B variant: source images + compose slideshow ──
        if job.variant == "format_b":
            print(f"📹 Format B variant — processing per brand", flush=True)
            results = {}
            total_brands = len(job.brands)
            try:
                for wi, brand in enumerate(job.brands):
                    job = self._manager.get_job(job_id)
                    if job.status == "cancelled":
                        return {"success": False, "error": "Job was cancelled", "results": results}

                    progress = int((wi / max(total_brands, 1)) * 100)
                    self._manager.update_job_status(job_id, "generating", f"Processing format-b for {brand}...", progress)

                    # Pre-initialize brand output so frontend shows progress immediately
                    self._manager.update_brand_output(job_id, brand, {
                        "status": "generating",
                        "progress_percent": 0,
                        "progress_message": "Starting...",
                    })
                    tv_result = {"success": False, "error": "Timeout"}
                    def _run_tv_brand(b=brand, bi=wi, tot=total_brands):
                        nonlocal tv_result
                        try:
                            tv_result = self.process_format_b_brand(job_id, b, brand_index=bi, total_brands=tot)
                        except Exception as ex:
                            tv_result = {"success": False, "error": f"{type(ex).__name__}: {str(ex)}"}

                    tv_thread = threading.Thread(target=_run_tv_brand, daemon=True)
                    tv_thread.start()
                    tv_thread.join(timeout=BRAND_GENERATION_TIMEOUT)

                    if tv_thread.is_alive():
                        timeout_msg = f"BRAND_TIMEOUT: {brand} format-b exceeded {BRAND_GENERATION_TIMEOUT}s"
                        print(f"⏱️  Format B BRAND TIMEOUT: {brand}", flush=True)
                        self._manager.update_brand_output(job_id, brand, {"status": "failed", "error": timeout_msg})
                        tv_result = {"success": False, "error": timeout_msg}

                    results[brand] = tv_result

                all_ok = all(r.get("success") for r in results.values())
                any_ok = any(r.get("success") for r in results.values())
                final_status = "completed" if all_ok else ("completed" if any_ok else "failed")
                self._manager.update_job_status(job_id, final_status, progress_percent=100)
                return {"success": any_ok, "results": results}
            except Exception as e:
                import traceback
                traceback.print_exc()
                self._manager.update_job_status(job_id, "failed", error_message=str(e))
                return {"success": False, "error": str(e)}

        # ── REEL variants (light / dark) ─────────────────────────────
        results = {}
        total_brands = len(job.brands)

        print(f"   Processing {total_brands} brands: {job.brands}", flush=True)
        sys.stdout.flush()

        # When auto-generated (fixed_title=False), generate AI content per brand.
        if not getattr(job, 'fixed_title', False):
            print(f"\n🧠 Auto mode — generating AI content for {total_brands} brand(s)...", flush=True)
            try:
                from app.services.content.unified_generator import generate_reel_content
                step_msg = "Generating viral content..." if total_brands == 1 else f"Generating content for {total_brands} brands..."
                self._manager.update_job_status(job_id, "generating", step_msg, 5)
                first_title = None
                for i, brand in enumerate(job.brands):
                    viral = generate_reel_content(
                        user_id=job.user_id,
                        brand_id=brand,
                    )
                    brand_title = viral.get("title", job.title)
                    brand_lines = viral.get("content_lines", job.content_lines or [])
                    brand_image_prompt = viral.get("image_prompt", job.ai_prompt or "")
                    self._manager.update_brand_output(job_id, brand, {
                        "title": brand_title,
                        "content_lines": brand_lines,
                        "ai_prompt": brand_image_prompt,
                        "status": "pending",
                    })
                    if first_title is None:
                        first_title = brand_title
                    print(f"   📝 {brand}: {brand_title[:60]}...", flush=True)
                if first_title:
                    self._manager.update_job_inputs(job_id, title=first_title)
                    job = self._manager.get_job(job_id)
                print(f"   ✓ Generated content for {total_brands} brand(s)", flush=True)
            except Exception as e:
                print(f"   ⚠️ AI content generation failed: {e}", flush=True)
                print(f"   Falling back to shared title + content differentiation", flush=True)

        # Pre-generate content variations (only for multi-brand)
        brand_content_map = {}
        if job.content_lines and len(job.content_lines) >= 3 and len(job.brands) > 1:
            print(f"\n🔄 Generating content variations for all {total_brands} brands...", flush=True)
            try:
                differentiator = ContentDifferentiator()
                brand_content_map = differentiator.differentiate_all_brands(
                    title=job.title,
                    content_lines=job.content_lines,
                    brands=job.brands
                )
                print(f"   ✓ Generated variations for {len(brand_content_map)} brands", flush=True)
            except Exception as e:
                print(f"   ⚠️ Content differentiation failed: {e}", flush=True)
                print(f"   Using original content for all brands", flush=True)

        try:
            for wi, brand in enumerate(job.brands):
                print(f"\n{'='*40}", flush=True)
                print(f"🔄 Processing {brand} ({wi+1}/{total_brands})", flush=True)
                print(f"{'='*40}", flush=True)
                sys.stdout.flush()

                job = self._manager.get_job(job_id)
                if job.status == "cancelled":
                    print(f"   ⚠️ Job cancelled, stopping", flush=True)
                    return {"success": False, "error": "Job was cancelled", "results": results}

                progress = int((wi / total_brands) * 100)
                reel_msg = "Generating reel..." if total_brands == 1 else f"Generating {brand}..."
                self._manager.update_job_status(job_id, "generating", reel_msg, progress)

                # Get per-brand content from the correct slot
                job = self._manager.get_job(job_id)
                brand_output_data = job.get_brand_output(brand)
                brand_content = brand_output_data.get("content_lines") or brand_content_map.get(brand.lower())

                if brand_content:
                    print(f"   📝 Using pre-generated content ({len(brand_content)} lines)", flush=True)
                sys.stdout.flush()

                result = {"success": False, "error": "Timeout"}
                brand_error = [None]

                def _run_brand(b=brand, bc=brand_content):
                    nonlocal result
                    try:
                        result = self.regenerate_brand(
                            job_id,
                            b,
                            content_lines=bc,
                        )
                    except Exception as ex:
                        brand_error[0] = ex
                        result = {"success": False, "error": f"{type(ex).__name__}: {str(ex)}"}

                brand_thread = threading.Thread(target=_run_brand, daemon=True)
                brand_thread.start()
                brand_thread.join(timeout=BRAND_GENERATION_TIMEOUT)

                if brand_thread.is_alive():
                    timeout_msg = (
                        f"BRAND_TIMEOUT: {brand} generation exceeded {BRAND_GENERATION_TIMEOUT}s timeout. "
                        f"Step: {(self._manager.get_job(job_id) or type('', (), {'current_step': 'unknown'})).current_step}"
                    )
                    print(f"\n⏱️  BRAND TIMEOUT: {brand} exceeded {BRAND_GENERATION_TIMEOUT}s", flush=True)
                    sys.stdout.flush()

                    self._manager.update_brand_output(job_id, brand, {
                        "status": "failed",
                        "error": timeout_msg,
                    })
                    result = {"success": False, "error": timeout_msg}

                results[brand] = result

                print(f"   📋 Result: {result.get('success', False)}", flush=True)
                if not result.get('success'):
                    print(f"   ❌ Error: {result.get('error', 'Unknown')}", flush=True)
                sys.stdout.flush()

            # Final cancellation check
            job = self._manager.get_job(job_id)
            if job.status == "cancelled":
                return {"success": False, "error": "Job was cancelled", "results": results}

            print(f"\n   Processing complete. Results: {results}", flush=True)
            sys.stdout.flush()

            # Handle empty results (should not happen but just in case)
            if not results:
                error_msg = "No brands were processed - results are empty"
                print(f"❌ {error_msg}", flush=True)
                self._manager.update_job_status(job_id, "failed", error_message=error_msg)
                return {"success": False, "error": error_msg}

            # Check if all succeeded
            all_success = all(r.get("success", False) for r in results.values())
            any_success = any(r.get("success", False) for r in results.values())

            print(f"   all_success={all_success}, any_success={any_success}", flush=True)
            sys.stdout.flush()

            if all_success:
                done_msg = "Generation complete!" if len(results) == 1 else "All brands generated!"
                self._manager.update_job_status(job_id, "completed", done_msg, 100)
            elif any_success:
                # Some succeeded, some failed - partial completion
                failed_brands = [b for b, r in results.items() if not r.get("success")]
                self._manager.update_job_status(
                    job_id, "completed",
                    f"Completed with errors: {', '.join(failed_brands)}",
                    100
                )
            else:
                # All brands failed - mark as failed
                failed_brands = [b for b, r in results.items() if not r.get("success")]
                errors = [r.get("error", "Unknown error") for r in results.values() if r.get("error")]
                error_msg = errors[0] if errors else "All brands failed to generate"
                self._manager.update_job_status(job_id, "failed", error_message=error_msg)

            return {"success": any_success, "results": results}

        except Exception as e:
            self._manager.update_job_status(job_id, "failed", error_message=str(e))
            return {"success": False, "error": str(e)}

    # ── Deploy-resilient resume ───────────────────────────────────────

    def resume_job(self, job_id: str) -> Dict[str, Any]:
        """
        Resume a job that was interrupted by a deploy/restart.

        Inspects ``brand_outputs`` to find which brands still need processing
        and re-runs only those.  Brands that already completed are left intact.
        """
        import sys

        job = self._manager.get_job(job_id)
        if not job:
            return {"success": False, "error": f"Job not found: {job_id}"}

        brand_outputs = job.brand_outputs or {}
        all_brands = job.brands or []

        # Determine which brands need (re-)processing
        incomplete_brands = [
            b for b in all_brands
            if brand_outputs.get(b, {}).get("status") != "completed"
        ]

        if not incomplete_brands:
            # Every brand already finished — just fix the job status
            self._manager.update_job_status(job_id, "completed", "Recovered — all brands were done", 100)
            print(f"✅ Resume {job_id}: all brands already completed, marking done", flush=True)
            return {"success": True, "resumed_brands": [], "skipped": all_brands}

        print(f"🔄 Resuming {job_id}: {len(incomplete_brands)}/{len(all_brands)} brands need processing", flush=True)
        for b in all_brands:
            st = brand_outputs.get(b, {}).get("status", "unknown")
            print(f"   {b}: {st}{'  ← will retry' if b in incomplete_brands else ''}", flush=True)
        sys.stdout.flush()

        # Reset incomplete brands to pending so the UI shows them correctly
        for b in incomplete_brands:
            self._manager.update_brand_output(job_id, b, {
                "status": "pending",
                "progress_message": "Queued for resume after deploy...",
            })

        self._manager.update_job_status(job_id, "generating", "Resuming after deploy...", 0)

        # ── POST variant ─────────────────────────────────────────────
        if job.variant == "post":
            results = {}
            for i, brand in enumerate(incomplete_brands):
                job = self._manager.get_job(job_id)
                if job.status == "cancelled":
                    return {"success": False, "error": "Cancelled", "results": results}

                progress = int(((i + 1) / (len(incomplete_brands) + 1)) * 100)
                self._manager.update_job_status(job_id, "generating", f"Resuming {brand}...", progress)

                post_result = {"success": False, "error": "Timeout"}
                def _run(b=brand):
                    nonlocal post_result
                    try:
                        post_result = self.process_post_brand(job_id, b)
                    except Exception as ex:
                        post_result = {"success": False, "error": f"{type(ex).__name__}: {ex}"}
                t = threading.Thread(target=_run, daemon=True)
                t.start()
                t.join(timeout=BRAND_GENERATION_TIMEOUT)
                if t.is_alive():
                    self._manager.update_brand_output(job_id, brand, {"status": "failed", "error": "Timeout on resume"})
                    post_result = {"success": False, "error": "Timeout"}
                results[brand] = post_result

            self._finalize_job(job_id, results, all_brands, brand_outputs)
            return {"success": any(r.get("success") for r in results.values()), "results": results}

        # ── Format B variant ────────────────────────────────────────
        if job.variant == "format_b":
            results = {}
            try:
                for i, brand in enumerate(incomplete_brands):
                    job = self._manager.get_job(job_id)
                    if job.status == "cancelled":
                        return {"success": False, "error": "Cancelled", "results": results}

                    progress = int((i / len(incomplete_brands)) * 100)
                    self._manager.update_job_status(job_id, "generating", f"Resuming format-b {brand}...", progress)

                    result = {"success": False, "error": "Timeout"}
                    def _run_tv(b=brand):
                        nonlocal result
                        try:
                            result = self.process_format_b_brand(job_id, b)
                        except Exception as ex:
                            result = {"success": False, "error": f"{type(ex).__name__}: {ex}"}

                    bt = threading.Thread(target=_run_tv, daemon=True)
                    bt.start()
                    bt.join(timeout=BRAND_GENERATION_TIMEOUT)
                    if bt.is_alive():
                        self._manager.update_brand_output(job_id, brand, {"status": "failed", "error": "Timeout on resume"})
                        result = {"success": False, "error": "Timeout"}
                    results[brand] = result

                self._finalize_job(job_id, results, all_brands, brand_outputs)
                return {"success": any(r.get("success") for r in results.values()), "results": results}

            except Exception as e:
                self._manager.update_job_status(job_id, "failed", error_message=str(e))
                return {"success": False, "error": str(e)}

        # ── REEL variants (light / dark) ─────────────────────────────
        results = {}

        # Re-run content differentiation only for incomplete brands
        brand_content_map: Dict[str, List[str]] = {}
        if job.content_lines and len(job.content_lines) >= 3 and len(incomplete_brands) > 1:
            try:
                differentiator = ContentDifferentiator()
                brand_content_map = differentiator.differentiate_all_brands(
                    title=job.title,
                    content_lines=job.content_lines,
                    brands=incomplete_brands,
                )
                print(f"   ✓ Re-generated content variations for {len(brand_content_map)} brands", flush=True)
            except Exception as e:
                print(f"   ⚠️ Differentiation failed on resume: {e}", flush=True)

        try:
            for i, brand in enumerate(incomplete_brands):
                job = self._manager.get_job(job_id)
                if job.status == "cancelled":
                    return {"success": False, "error": "Cancelled", "results": results}

                progress = int((i / len(incomplete_brands)) * 100)
                self._manager.update_job_status(job_id, "generating", f"Resuming {brand}...", progress)

                brand_content = brand_content_map.get(brand.lower())

                result = {"success": False, "error": "Timeout"}
                def _run_brand():
                    nonlocal result
                    try:
                        result = self.regenerate_brand(job_id, brand, content_lines=brand_content)
                    except Exception as ex:
                        result = {"success": False, "error": f"{type(ex).__name__}: {ex}"}

                bt = threading.Thread(target=_run_brand, daemon=True)
                bt.start()
                bt.join(timeout=BRAND_GENERATION_TIMEOUT)
                if bt.is_alive():
                    self._manager.update_brand_output(job_id, brand, {"status": "failed", "error": "Timeout on resume"})
                    result = {"success": False, "error": "Timeout"}
                results[brand] = result

            self._finalize_job(job_id, results, all_brands, brand_outputs)
            return {"success": any(r.get("success") for r in results.values()), "results": results}

        except Exception as e:
            self._manager.update_job_status(job_id, "failed", error_message=str(e))
            return {"success": False, "error": str(e)}

    def _finalize_job(
        self,
        job_id: str,
        new_results: Dict[str, Any],
        all_brands: List[str],
        prior_outputs: Dict[str, Any],
    ):
        """Set the final job status considering both previously-completed and newly-processed brands."""
        # Merge: brands that were already completed count as successes
        ok_count = sum(
            1 for b in all_brands
            if prior_outputs.get(b, {}).get("status") == "completed"
            or new_results.get(b, {}).get("success")
        )
        if ok_count == len(all_brands):
            self._manager.update_job_status(job_id, "completed", "All brands generated!", 100)
        elif ok_count > 0:
            self._manager.update_job_status(job_id, "completed", "Completed with some errors", 100)
        else:
            errors = [r.get("error", "Unknown") for r in new_results.values() if r.get("error")]
            self._manager.update_job_status(job_id, "failed", error_message=errors[0] if errors else "All brands failed")
