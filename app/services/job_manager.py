"""
Job management service for tracking and processing reel generation jobs.
"""
import random
import string
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any
from sqlalchemy.orm import Session

from app.models import GenerationJob
from app.services.image_generator import ImageGenerator
from app.services.video_generator import VideoGenerator
from app.services.content_differentiator import ContentDifferentiator
from app.core.config import BrandType, get_brand_config


def generate_job_id() -> str:
    """Generate a short readable job ID like GEN-001234."""
    random_num = ''.join(random.choices(string.digits, k=6))
    return f"GEN-{random_num}"


def get_brand_type(brand_name: str) -> BrandType:
    """Convert brand name to BrandType enum."""
    brand_map = {
        "gymcollege": BrandType.THE_GYM_COLLEGE,
        "healthycollege": BrandType.HEALTHY_COLLEGE,
        "vitalitycollege": BrandType.VITALITY_COLLEGE,
        "longevitycollege": BrandType.LONGEVITY_COLLEGE,
        "holisticcollege": BrandType.HOLISTIC_COLLEGE,
        "wellbeingcollege": BrandType.WELLBEING_COLLEGE,
    }
    return brand_map.get(brand_name, BrandType.HEALTHY_COLLEGE)


class JobManager:
    """Manages generation jobs with database persistence."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_job(
        self,
        user_id: str,
        title: str,
        content_lines: List[str],
        brands: List[str],
        variant: str = "light",
        ai_prompt: Optional[str] = None,
        cta_type: Optional[str] = None,
        platforms: Optional[List[str]] = None
    ) -> GenerationJob:
        """Create a new generation job."""
        job_id = generate_job_id()
        
        # Ensure unique job_id
        while self.db.query(GenerationJob).filter_by(job_id=job_id).first():
            job_id = generate_job_id()
        
        # Default to all platforms if not specified
        if platforms is None:
            platforms = ["instagram", "facebook", "youtube"]
        
        job = GenerationJob(
            job_id=job_id,
            user_id=user_id,
            title=title,
            content_lines=content_lines,
            brands=brands,
            variant=variant,
            ai_prompt=ai_prompt,
            cta_type=cta_type,
            platforms=platforms,
            status="pending",
            brand_outputs={brand: {"status": "pending"} for brand in brands}
        )
        
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        
        return job
    
    def get_job(self, job_id: str) -> Optional[GenerationJob]:
        """Get a job by ID."""
        return self.db.query(GenerationJob).filter_by(job_id=job_id).first()
    
    def get_user_jobs(self, user_id: str, limit: int = 50) -> List[GenerationJob]:
        """Get recent jobs for a user."""
        return (
            self.db.query(GenerationJob)
            .filter_by(user_id=user_id)
            .order_by(GenerationJob.created_at.desc())
            .limit(limit)
            .all()
        )
    
    def get_all_jobs(self, limit: int = 100) -> List[GenerationJob]:
        """Get all recent jobs (for admin/shared view)."""
        return (
            self.db.query(GenerationJob)
            .order_by(GenerationJob.created_at.desc())
            .limit(limit)
            .all()
        )
    
    def update_job_status(
        self,
        job_id: str,
        status: str,
        current_step: Optional[str] = None,
        progress_percent: Optional[int] = None,
        error_message: Optional[str] = None
    ) -> Optional[GenerationJob]:
        """Update job status and progress."""
        job = self.get_job(job_id)
        if not job:
            return None
        
        job.status = status
        if current_step is not None:
            job.current_step = current_step
        if progress_percent is not None:
            job.progress_percent = progress_percent
        if error_message is not None:
            job.error_message = error_message
        
        if status == "generating" and not job.started_at:
            job.started_at = datetime.utcnow()
        elif status in ("completed", "failed"):
            job.completed_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(job)
        return job
    
    def update_brand_output(
        self,
        job_id: str,
        brand: str,
        output_data: Dict[str, Any]
    ) -> Optional[GenerationJob]:
        """Update output data for a specific brand."""
        import sys
        from sqlalchemy.orm.attributes import flag_modified
        
        print(f"\n📝 update_brand_output called:", flush=True)
        print(f"   job_id: {job_id}", flush=True)
        print(f"   brand: {brand}", flush=True)
        print(f"   output_data: {output_data}", flush=True)
        sys.stdout.flush()
        
        job = self.get_job(job_id)
        if not job:
            print(f"   ❌ Job not found!", flush=True)
            return None
        
        print(f"   Current brand_outputs: {job.brand_outputs}", flush=True)
        
        # Create a new dict to ensure SQLAlchemy detects the change
        brand_outputs = dict(job.brand_outputs or {})
        brand_outputs[brand] = {**brand_outputs.get(brand, {}), **output_data}
        job.brand_outputs = brand_outputs
        
        # CRITICAL: Flag the column as modified for SQLAlchemy to commit the change
        flag_modified(job, "brand_outputs")
        
        print(f"   Updated brand_outputs: {job.brand_outputs}", flush=True)
        print(f"   Committing to database (flag_modified applied)...", flush=True)
        sys.stdout.flush()
        
        self.db.commit()
        self.db.refresh(job)
        
        print(f"   ✓ Database committed. brand_outputs after commit: {job.brand_outputs}", flush=True)
        sys.stdout.flush()
        return job
    
    def update_job_inputs(
        self,
        job_id: str,
        title: Optional[str] = None,
        content_lines: Optional[List[str]] = None,
        ai_prompt: Optional[str] = None,
        cta_type: Optional[str] = None
    ) -> Optional[GenerationJob]:
        """Update job inputs (for re-generation with changes)."""
        job = self.get_job(job_id)
        if not job:
            return None
        
        if title is not None:
            job.title = title
        if content_lines is not None:
            job.content_lines = content_lines
        if ai_prompt is not None:
            job.ai_prompt = ai_prompt
        if cta_type is not None:
            job.cta_type = cta_type
        
        self.db.commit()
        self.db.refresh(job)
        return job
    
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
        
        job = self.get_job(job_id)
        if not job:
            error_msg = f"Job not found: {job_id}"
            print(f"❌ ERROR: {error_msg}", flush=True)
            return {"success": False, "error": error_msg}
        
        # Use provided values or fall back to job's stored values
        use_title = title if title is not None else job.title
        use_lines = content_lines if content_lines is not None else job.content_lines
        
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
            self.update_job_inputs(job_id, title=title, content_lines=content_lines)
        
        # Update brand status with initial progress
        self.update_brand_output(job_id, brand, {
            "status": "generating",
            "progress_message": "Starting generation...",
            "progress_percent": 0
        })
        
        try:
            # Get output paths
            output_dir = Path("output")
            reel_id = job.brand_outputs.get(brand, {}).get("reel_id", f"{job_id}_{brand}")
            
            thumbnail_path = output_dir / "thumbnails" / f"{reel_id}_thumbnail.png"
            reel_path = output_dir / "reels" / f"{reel_id}_reel.png"
            video_path = output_dir / "videos" / f"{reel_id}_video.mp4"
            
            print(f"📁 Output paths:", flush=True)
            print(f"   Thumbnail: {thumbnail_path}", flush=True)
            print(f"   Reel: {reel_path}", flush=True)
            print(f"   Video: {video_path}", flush=True)
            sys.stdout.flush()
            
            # Ensure directories exist
            thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
            reel_path.parent.mkdir(parents=True, exist_ok=True)
            video_path.parent.mkdir(parents=True, exist_ok=True)
            print(f"   ✓ Directories created/verified", flush=True)
            
            # Create image generator
            print(f"🔧 Getting brand type for: {brand}", flush=True)
            brand_type = get_brand_type(brand)
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
                ai_prompt=job.ai_prompt
            )
            print(f"   ✓ ImageGenerator initialized successfully", flush=True)
            sys.stdout.flush()
            
            # Update progress for AI background generation (can take 30-60s)
            if job.variant == "dark":
                self.update_brand_output(job_id, brand, {
                    "status": "generating",
                    "progress_message": f"Generating unique AI background for {brand} (this may take ~30s)...",
                    "progress_percent": 5
                })
            
            # Generate thumbnail
            print(f"\n🖼️  Step 1/4: Generating thumbnail...", flush=True)
            sys.stdout.flush()
            self.update_brand_output(job_id, brand, {
                "status": "generating",
                "progress_message": "Generating thumbnail..." if job.variant == "light" else "Generating thumbnail with AI background...",
                "progress_percent": 10
            })
            generator.generate_thumbnail(use_title, thumbnail_path)
            print(f"   ✓ Thumbnail saved: {thumbnail_path}", flush=True)
            self.update_brand_output(job_id, brand, {
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
            self.update_brand_output(job_id, brand, {
                "status": "generating",
                "progress_message": "Generating reel image...",
                "progress_percent": 30
            })
            generator.generate_reel_image(
                title=use_title,
                lines=use_lines,
                output_path=reel_path,
                cta_type=job.cta_type
            )
            print(f"   ✓ Reel image saved: {reel_path}", flush=True)
            self.update_brand_output(job_id, brand, {
                "status": "generating",
                "progress_message": "Reel image complete",
                "progress_percent": 50
            })
            
            # Generate video
            print(f"\n🎬 Step 3/4: Generating video...", flush=True)
            sys.stdout.flush()
            self.update_brand_output(job_id, brand, {
                "status": "generating",
                "progress_message": "Generating video...",
                "progress_percent": 55
            })
            video_gen = VideoGenerator()
            video_gen.generate_reel_video(reel_path, video_path)
            print(f"   ✓ Video saved: {video_path}", flush=True)
            sys.stdout.flush()
            self.update_brand_output(job_id, brand, {
                "status": "generating",
                "progress_message": "Video complete",
                "progress_percent": 75
            })
            
            # Generate caption
            print(f"\n✍️  Step 4/4: Generating caption...", flush=True)
            self.update_brand_output(job_id, brand, {
                "status": "generating",
                "progress_message": "Generating caption...",
                "progress_percent": 80
            })
            from app.services.caption_generator import CaptionGenerator
            caption_gen = CaptionGenerator()
            caption = caption_gen.generate_caption(
                brand_name=brand,
                title=use_title,
                content_lines=use_lines,
                cta_type=job.cta_type or "follow_tips"
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
            yt_thumbnail_path = output_dir / "thumbnails" / f"{reel_id}_yt_thumbnail.png"
            generator.generate_youtube_thumbnail(
                title=use_title,
                lines=use_lines,
                output_path=yt_thumbnail_path
            )
            print(f"   ✓ YouTube thumbnail saved: {yt_thumbnail_path}", flush=True)
            
            self.update_brand_output(job_id, brand, {
                "status": "generating",
                "progress_message": "Finalizing...",
                "progress_percent": 95
            })
            
            # Update brand output - use web-friendly paths with leading slash
            self.update_brand_output(job_id, brand, {
                "status": "completed",
                "reel_id": reel_id,
                "thumbnail_path": f"/output/thumbnails/{reel_id}_thumbnail.png",
                "yt_thumbnail_path": f"/output/thumbnails/{reel_id}_yt_thumbnail.png",  # Clean AI image for YouTube
                "reel_path": f"/output/reels/{reel_id}_reel.png",
                "video_path": f"/output/videos/{reel_id}_video.mp4",
                "caption": caption,
                "yt_title": yt_title,  # YouTube-optimized title (no numbers)
                "content_lines": use_lines,  # Store differentiated content for this brand
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
                "thumbnail_path": f"/output/thumbnails/{reel_id}_thumbnail.png",
                "video_path": f"/output/videos/{reel_id}_video.mp4"
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
            self.update_brand_output(job_id, brand, {
                "status": "failed",
                "error": error_msg,
                "error_traceback": error_details['traceback']
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
        
        job = self.get_job(job_id)
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
            self.update_job_status(job_id, "failed", error_message=error_msg)
            return {"success": False, "error": error_msg}
        
        print(f"📝 Updating job status to 'generating'...", flush=True)
        self.update_job_status(job_id, "generating", "Starting generation...", 0)
        print(f"   ✓ Status updated", flush=True)
        
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
                job = self.get_job(job_id)
                if job.status == "cancelled":
                    print(f"   ⚠️ Job cancelled, stopping", flush=True)
                    return {"success": False, "error": "Job was cancelled", "results": results}
                
                progress = int((i / total_brands) * 100)
                print(f"   📊 Progress: {progress}%", flush=True)
                self.update_job_status(
                    job_id, "generating",
                    f"Generating {brand}...",
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
                
                result = self.regenerate_brand(
                    job_id, 
                    brand, 
                    content_lines=brand_content  # Pass pre-generated content
                )
                results[brand] = result
                
                print(f"   📋 Result for {brand}: {result.get('success', False)}", flush=True)
                if not result.get('success'):
                    print(f"   ❌ Error: {result.get('error', 'Unknown')}", flush=True)
                sys.stdout.flush()
            
            # Final cancellation check
            job = self.get_job(job_id)
            if job.status == "cancelled":
                return {"success": False, "error": "Job was cancelled", "results": results}
            
            print(f"\n   Processing complete. Results: {results}", flush=True)
            sys.stdout.flush()
            
            # Handle empty results (should not happen but just in case)
            if not results:
                error_msg = "No brands were processed - results are empty"
                print(f"❌ {error_msg}", flush=True)
                self.update_job_status(job_id, "failed", error_message=error_msg)
                return {"success": False, "error": error_msg}
            
            # Check if all succeeded
            all_success = all(r.get("success", False) for r in results.values())
            any_success = any(r.get("success", False) for r in results.values())
            
            print(f"   all_success={all_success}, any_success={any_success}", flush=True)
            sys.stdout.flush()
            
            if all_success:
                self.update_job_status(job_id, "completed", "All brands generated!", 100)
            elif any_success:
                # Some succeeded, some failed - partial completion
                failed_brands = [b for b, r in results.items() if not r.get("success")]
                self.update_job_status(
                    job_id, "completed",
                    f"Completed with errors: {', '.join(failed_brands)}",
                    100
                )
            else:
                # All brands failed - mark as failed
                failed_brands = [b for b, r in results.items() if not r.get("success")]
                errors = [r.get("error", "Unknown error") for r in results.values() if r.get("error")]
                error_msg = errors[0] if errors else "All brands failed to generate"
                self.update_job_status(job_id, "failed", error_message=error_msg)
            
            return {"success": any_success, "results": results}
            
        except Exception as e:
            self.update_job_status(job_id, "failed", error_message=str(e))
            return {"success": False, "error": str(e)}
    
    def cleanup_job_files(self, job_id: str) -> bool:
        """Clean up all files associated with a job."""
        job = self.get_job(job_id)
        if not job:
            return False
        
        output_dir = Path("output")
        
        # Clean up files for each brand
        for brand, output in (job.brand_outputs or {}).items():
            reel_id = output.get("reel_id")
            if reel_id:
                # Remove thumbnail
                thumbnail = output_dir / "thumbnails" / f"{reel_id}_thumbnail.png"
                if thumbnail.exists():
                    thumbnail.unlink()
                
                # Remove reel image
                reel_img = output_dir / "reels" / f"{reel_id}_reel.png"
                if reel_img.exists():
                    reel_img.unlink()
                
                # Remove video
                video = output_dir / "videos" / f"{reel_id}_video.mp4"
                if video.exists():
                    video.unlink()
        
        # Clean up AI background if exists
        if job.ai_background_path:
            ai_bg = Path(job.ai_background_path)
            if ai_bg.exists():
                ai_bg.unlink()
        
        return True
    
    def delete_job(self, job_id: str) -> bool:
        """Delete a job and its associated files."""
        job = self.get_job(job_id)
        if not job:
            return False
        
        # Clean up files first
        self.cleanup_job_files(job_id)
        
        self.db.delete(job)
        self.db.commit()
        return True
