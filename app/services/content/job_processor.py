"""Job processing pipeline — orchestrator that delegates to format-specific processors.

Processors live in app.services.content.processors/:
  - reel_processor.py    (light/dark text-based reels)
  - post_processor.py    (carousel posts)
  - format_b_processor.py (Format B slideshow reels)
  - threads_processor.py  (Threads text content)
"""
import threading
from typing import List, Dict, Optional, Any

from app.services.content.differentiator import ContentDifferentiator
from app.services.content.processors._helpers import BRAND_GENERATION_TIMEOUT
from app.services.content.processors.reel_processor import regenerate_brand as _regenerate_brand
from app.services.content.processors.post_processor import process_post_brand as _process_post_brand
from app.services.content.processors.format_b_processor import process_format_b_brand as _process_format_b_brand
from app.services.content.processors.threads_processor import process_threads_brand as _process_threads_brand


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

            extra = (extra_kwargs_per_brand or {}).get(brand, {})
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
    ) -> Dict[str, Any]:
        """Regenerate images/video for a single brand. Delegates to reel_processor."""
        return _regenerate_brand(self._manager, self.db, job_id, brand, title=title, content_lines=content_lines)

    def process_post_brand(self, job_id: str, brand: str) -> Dict[str, Any]:
        """Process a single brand for a POST job. Delegates to post_processor."""
        return _process_post_brand(self._manager, self.db, job_id, brand)

    def process_format_b_brand(self, job_id: str, brand: str) -> Dict[str, Any]:
        """Process a Format B reel for a single brand. Delegates to format_b_processor."""
        return _process_format_b_brand(self._manager, self.db, job_id, brand)

    def process_threads_brand(
        self,
        job_id: str,
        brand: str,
    ) -> Dict[str, Any]:
        """Generate thread text content for a single brand. Delegates to threads_processor."""
        return _process_threads_brand(self._manager, self.db, job_id, brand)

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

                    thread_result = {"success": False, "error": "Timeout"}
                    def _run_thread_brand(b=brand):
                        nonlocal thread_result
                        try:
                            thread_result = self.process_threads_brand(job_id, b)
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

                    tv_result = {"success": False, "error": "Timeout"}
                    def _run_tv_brand(b=brand):
                        nonlocal tv_result
                        try:
                            tv_result = self.process_format_b_brand(job_id, b)
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
