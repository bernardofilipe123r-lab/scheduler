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


class JobProcessor:
    """Processing pipeline — generates images, videos, and captions for jobs."""

    def __init__(self, db):
        from app.services.content.job_manager import JobManager
        self._manager = JobManager(db)
        self.db = db

    def regenerate_brand(
        self,
        job_id: str,
        brand: str,
        title: Optional[str] = None,
        content_lines: Optional[List[str]] = None
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

        # Use provided values or fall back to job's stored values
        use_title = title if title is not None else job.title
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
        self._manager.update_brand_output(job_id, brand, {
            "status": "generating",
            "progress_message": "Starting generation...",
            "progress_percent": 0
        })

        try:
            reel_id = job.brand_outputs.get(brand, {}).get("reel_id", f"{job_id}_{brand}")
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

            print(f"🎨 Initializing ImageGenerator...", flush=True)
            print(f"   Variant: {job.variant}", flush=True)
            print(f"   Brand: {brand}", flush=True)
            print(f"   AI Prompt: {job.ai_prompt[:100] if job.ai_prompt else 'None'}...", flush=True)
            sys.stdout.flush()

            generator = ImageGenerator(
                brand_type=brand_type,
                variant=job.variant,
                brand_name=brand,
                ai_prompt=job.ai_prompt,
                image_model=getattr(job, 'image_model', None)
            )
            print(f"   ✓ ImageGenerator initialized successfully", flush=True)
            sys.stdout.flush()

            # Update progress for AI background generation (can take 30-60s)
            if job.variant == "dark":
                self._manager.update_brand_output(job_id, brand, {
                    "status": "generating",
                    "progress_message": f"Generating unique AI background for {brand} (this may take ~30s)...",
                    "progress_percent": 5
                })

            # Generate thumbnail
            print(f"\n🖼️  Step 1/4: Generating thumbnail...", flush=True)
            sys.stdout.flush()
            self._manager.update_brand_output(job_id, brand, {
                "status": "generating",
                "progress_message": "Generating thumbnail..." if job.variant == "light" else "Generating thumbnail with AI background...",
                "progress_percent": 10
            })
            generator.generate_thumbnail(use_title, thumbnail_path)
            print(f"   ✓ Thumbnail saved: {thumbnail_path}", flush=True)
            self._manager.update_brand_output(job_id, brand, {
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
            self._manager.update_brand_output(job_id, brand, {
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
            self._manager.update_brand_output(job_id, brand, {
                "status": "generating",
                "progress_message": "Reel image complete",
                "progress_percent": 50
            })

            # Generate video
            print(f"\n🎬 Step 3/4: Generating video...", flush=True)
            sys.stdout.flush()
            self._manager.update_brand_output(job_id, brand, {
                "status": "generating",
                "progress_message": "Generating video...",
                "progress_percent": 55
            })
            video_gen = VideoGenerator()
            video_gen.generate_reel_video(reel_path, video_path)
            print(f"   ✓ Video saved: {video_path}", flush=True)
            sys.stdout.flush()
            self._manager.update_brand_output(job_id, brand, {
                "status": "generating",
                "progress_message": "Video complete",
                "progress_percent": 75
            })

            # Generate caption
            print(f"\n✍️  Step 4/4: Generating caption...", flush=True)
            self._manager.update_brand_output(job_id, brand, {
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

            self._manager.update_brand_output(job_id, brand, {
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
            self._manager.update_brand_output(job_id, brand, {
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
            self._manager.update_brand_output(job_id, brand, {
                "status": "failed",
                "error": error_msg,
                "error_traceback": error_details['traceback']
            })

            return {"success": False, "error": error_msg}

    def process_post_brand(self, job_id: str, brand: str) -> Dict[str, Any]:
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

        # Get per-brand content from brand_outputs
        brand_data = (job.brand_outputs or {}).get(brand, {})
        brand_ai_prompt = brand_data.get("ai_prompt") or job.ai_prompt or job.title

        self._manager.update_brand_output(job_id, brand, {
            "status": "generating",
            "progress_message": f"Generating AI background for {brand}...",
            "progress_percent": 10,
        })

        try:
            from app.services.media.ai_background import AIBackgroundGenerator

            reel_id = f"{job_id}_{brand}"
            brand_slug = brand
            user_id = job.user_id

            # Generate AI background using per-brand prompt
            ai_prompt = brand_ai_prompt
            generator = AIBackgroundGenerator()
            print(f"   Prompt: {ai_prompt[:80]}...", flush=True)

            self._manager.update_brand_output(job_id, brand, {
                "status": "generating",
                "progress_message": f"Generating unique AI background (~30s)...",
                "progress_percent": 30,
            })

            image = generator.generate_post_background(
                brand_name=brand,
                user_prompt=ai_prompt,
                model_override=getattr(job, 'image_model', None),
            )

            # Save to temp file, upload to Supabase, delete temp
            tmp_bg = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
            tmp_bg.close()
            bg_path = Path(tmp_bg.name)
            image.save(str(bg_path), format="PNG")
            print(f"   ✓ Background saved to temp: {bg_path}", flush=True)

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
            self._manager.update_brand_output(job_id, brand, {
                "status": "completed",
                "reel_id": reel_id,
                "thumbnail_path": bg_url,
                "thumbnail_url": f"{bg_url}?t={cache_bust}" if bg_url else "",
                "regenerated_at": datetime.utcnow().isoformat(),
            })

            print(f"   ✅ {brand} post background completed", flush=True)
            return {"success": True, "brand": brand, "reel_id": reel_id}

        except Exception as e:
            import traceback
            error_msg = f"{type(e).__name__}: {str(e)}"
            print(f"   ❌ Failed: {error_msg}", flush=True)
            traceback.print_exc()
            self._manager.update_brand_output(job_id, brand, {
                "status": "failed",
                "error": error_msg,
            })
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
                    print(f"   📌 Fixed title mode — using title as-is: {job.title[:80]}", flush=True)
                    self._manager.update_job_status(job_id, "generating", "Using provided title...", 5)

                    # Generate image prompt only if not provided
                    image_prompt = job.ai_prompt
                    if not image_prompt:
                        print(f"   🎨 No image prompt provided — generating from title...", flush=True)
                        prompt_result = cg.generate_image_prompt(job.title)
                        image_prompt = prompt_result.get("image_prompt", "")
                        print(f"   ✓ Generated image prompt: {image_prompt[:80]}...", flush=True)

                    # Apply the SAME title + prompt to each brand
                    for brand in job.brands:
                        self._manager.update_brand_output(job_id, brand, {
                            "title": job.title,
                            "caption": "",
                            "ai_prompt": image_prompt,
                            "slide_texts": [],
                            "status": "pending",
                        })
                        print(f"   📝 {brand}: {job.title[:60]}...", flush=True)
                else:
                    # ── AUTO MODE: AI generates unique posts per brand ───
                    topic_hint = job.ai_prompt or None
                    print(f"   🧠 Generating {total_brands} unique posts...", flush=True)
                    step_msg = "Generating content..." if total_brands == 1 else f"Generating content for {total_brands} brands..."
                    self._manager.update_job_status(job_id, "generating", step_msg, 5)

                    batch_posts = cg.generate_post_titles_batch(total_brands, topic_hint)
                    print(f"   ✓ Got {len(batch_posts)} unique posts", flush=True)

                    # Store unique content per brand in brand_outputs
                    for i, brand in enumerate(job.brands):
                        post_data = batch_posts[i] if i < len(batch_posts) else cg._fallback_post_title()
                        self._manager.update_brand_output(job_id, brand, {
                            "title": post_data.get("title", job.title),
                            "caption": post_data.get("caption", ""),
                            "ai_prompt": post_data.get("image_prompt", ""),
                            "slide_texts": post_data.get("slide_texts", []),
                            "status": "pending",
                        })
                        print(f"   📝 {brand}: {post_data.get('title', '?')[:60]}...", flush=True)

                # Now generate images per brand using their unique prompts
                for i, brand in enumerate(job.brands):
                    job = self._manager.get_job(job_id)
                    if job.status == "cancelled":
                        return {"success": False, "error": "Job was cancelled", "results": results}
                    progress = int(((i + 1) / (total_brands + 1)) * 100)
                    img_msg = "Generating image..." if total_brands == 1 else f"Generating image for {brand}..."
                    self._manager.update_job_status(job_id, "generating", img_msg, progress)

                    # Timeout guard for post brand processing
                    post_result = {"success": False, "error": "Timeout"}
                    def _run_post_brand(b=brand):
                        nonlocal post_result
                        try:
                            post_result = self.process_post_brand(job_id, b)
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

        # ── REEL variants (light / dark) ─────────────────────────────
        results = {}
        total_brands = len(job.brands)

        print(f"   Processing {total_brands} brands: {job.brands}", flush=True)
        sys.stdout.flush()

        # Pre-generate ALL content variations in ONE DeepSeek call
        # This ensures each brand gets truly unique content
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
            for i, brand in enumerate(job.brands):
                print(f"\n{'='*40}", flush=True)
                print(f"🔄 Processing brand {i+1}/{total_brands}: {brand}", flush=True)
                print(f"{'='*40}", flush=True)
                sys.stdout.flush()

                # Check for cancellation before each brand
                job = self._manager.get_job(job_id)
                if job.status == "cancelled":
                    print(f"   ⚠️ Job cancelled, stopping", flush=True)
                    return {"success": False, "error": "Job was cancelled", "results": results}

                progress = int((i / total_brands) * 100)
                print(f"   📊 Progress: {progress}%", flush=True)
                reel_msg = "Generating reel..." if total_brands == 1 else f"Generating {brand}..."
                self._manager.update_job_status(
                    job_id, "generating",
                    reel_msg,
                    progress
                )

                # Get pre-generated content for this brand (if available)
                brand_content = brand_content_map.get(brand.lower())

                print(f"   🎨 Calling regenerate_brand({job_id}, {brand})...", flush=True)
                if brand_content:
                    print(f"   📝 Using pre-generated variation ({len(brand_content)} lines)", flush=True)
                    print(f"      First line: {brand_content[0][:60]}...", flush=True)
                else:
                    print(f"   ⚠️ No pre-generated content found for {brand.lower()}", flush=True)
                    print(f"      Available keys: {list(brand_content_map.keys())}", flush=True)
                sys.stdout.flush()

                # Run regenerate_brand with a timeout to prevent indefinite hangs
                result = {"success": False, "error": "Timeout"}
                brand_error = [None]

                def _run_brand():
                    nonlocal result
                    try:
                        result = self.regenerate_brand(
                            job_id,
                            brand,
                            content_lines=brand_content
                        )
                    except Exception as ex:
                        brand_error[0] = ex
                        result = {"success": False, "error": f"{type(ex).__name__}: {str(ex)}"}

                brand_thread = threading.Thread(target=_run_brand, daemon=True)
                brand_thread.start()
                brand_thread.join(timeout=BRAND_GENERATION_TIMEOUT)

                if brand_thread.is_alive():
                    # Thread is still running after timeout — mark brand as failed
                    timeout_msg = (
                        f"BRAND_TIMEOUT: {brand} generation exceeded {BRAND_GENERATION_TIMEOUT}s timeout. "
                        f"Step: {(self._manager.get_job(job_id) or type('', (), {'current_step': 'unknown'})).current_step}"
                    )
                    print(f"\n⏱️  BRAND TIMEOUT: {brand} exceeded {BRAND_GENERATION_TIMEOUT}s", flush=True)
                    print(f"    Job: {job_id}", flush=True)
                    print(f"    The thread is still running but we'll move on", flush=True)
                    sys.stdout.flush()

                    self._manager.update_brand_output(job_id, brand, {
                        "status": "failed",
                        "error": timeout_msg,
                    })
                    result = {"success": False, "error": timeout_msg}

                results[brand] = result

                print(f"   📋 Result for {brand}: {result.get('success', False)}", flush=True)
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
