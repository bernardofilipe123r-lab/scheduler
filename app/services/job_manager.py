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
    }
    return brand_map.get(brand_name, BrandType.THE_GYM_COLLEGE)


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
        cta_type: Optional[str] = None
    ) -> GenerationJob:
        """Create a new generation job."""
        job_id = generate_job_id()
        
        # Ensure unique job_id
        while self.db.query(GenerationJob).filter_by(job_id=job_id).first():
            job_id = generate_job_id()
        
        job = GenerationJob(
            job_id=job_id,
            user_id=user_id,
            title=title,
            content_lines=content_lines,
            brands=brands,
            variant=variant,
            ai_prompt=ai_prompt,
            cta_type=cta_type,
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
        job = self.get_job(job_id)
        if not job:
            return None
        
        brand_outputs = job.brand_outputs or {}
        brand_outputs[brand] = {**brand_outputs.get(brand, {}), **output_data}
        job.brand_outputs = brand_outputs
        
        self.db.commit()
        self.db.refresh(job)
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
        print(f"\n{'='*60}")
        print(f"🎨 Starting generation for brand: {brand}")
        print(f"   Job ID: {job_id}")
        print(f"{'='*60}")
        
        job = self.get_job(job_id)
        if not job:
            error_msg = f"Job not found: {job_id}"
            print(f"❌ ERROR: {error_msg}")
            return {"success": False, "error": error_msg}
        
        # Use provided values or fall back to job's stored values
        use_title = title if title is not None else job.title
        use_lines = content_lines if content_lines is not None else job.content_lines
        
        # Update job if inputs changed
        if title is not None or content_lines is not None:
            self.update_job_inputs(job_id, title=title, content_lines=content_lines)
        
        # Update brand status
        self.update_brand_output(job_id, brand, {"status": "generating"})
        
        try:
            # Get output paths
            output_dir = Path("output")
            reel_id = job.brand_outputs.get(brand, {}).get("reel_id", f"{job_id}_{brand}")
            
            thumbnail_path = output_dir / "thumbnails" / f"{reel_id}_thumbnail.png"
            reel_path = output_dir / "reels" / f"{reel_id}_reel.png"
            video_path = output_dir / "videos" / f"{reel_id}_video.mp4"
            
            print(f"📁 Output paths:")
            print(f"   Thumbnail: {thumbnail_path}")
            print(f"   Reel: {reel_path}")
            print(f"   Video: {video_path}")
            
            # Create image generator
            print(f"🔧 Getting brand type for: {brand}")
            brand_type = get_brand_type(brand)
            print(f"   Brand type: {brand_type}")
            
            # For dark mode, try to reuse existing AI background
            ai_background_image = None
            if job.variant == "dark" and job.ai_background_path:
                print(f"🌙 Dark mode - attempting to reuse AI background: {job.ai_background_path}")
                from PIL import Image
                try:
                    ai_background_image = Image.open(job.ai_background_path)
                    print(f"   ✓ Loaded existing AI background")
                except Exception as e:
                    print(f"   ⚠️ Could not load existing background: {e}")
                    print(f"   Will generate new background")
            
            print(f"🎨 Initializing ImageGenerator...")
            print(f"   Variant: {job.variant}")
            print(f"   Brand: {brand}")
            print(f"   AI Prompt: {job.ai_prompt[:100] if job.ai_prompt else 'None'}...")
            
            generator = ImageGenerator(
                brand_type=brand_type,
                variant=job.variant,
                brand_name=brand,
                ai_prompt=job.ai_prompt
            )
            print(f"   ✓ ImageGenerator initialized successfully")
            
            # If we have a cached background, inject it
            if ai_background_image and job.variant == "dark":
                print(f"🌙 Injecting cached AI background")
                generator._ai_background = ai_background_image
            
            # Generate thumbnail
            print(f"\n🖼️  Step 1/3: Generating thumbnail...")
            generator.generate_thumbnail(use_title, thumbnail_path)
            print(f"   ✓ Thumbnail saved: {thumbnail_path}")
            
            # Generate reel image
            print(f"\n🎨 Step 2/3: Generating reel image...")
            print(f"   Title: {use_title[:50]}...")
            print(f"   Lines: {len(use_lines)} content lines")
            print(f"   CTA: {job.cta_type}")
            generator.generate_reel_image(
                title=use_title,
                lines=use_lines,
                output_path=reel_path,
                cta_type=job.cta_type
            )
            print(f"   ✓ Reel image saved: {reel_path}")
            
            # Generate video
            print(f"\n🎬 Step 3/3: Generating video...")
            video_gen = VideoGenerator()
            video_gen.generate_reel_video(reel_path, video_path)
            print(f"   ✓ Video saved: {video_path}")
            
            # Update brand output
            self.update_brand_output(job_id, brand, {
                "status": "completed",
                "reel_id": reel_id,
                "thumbnail_path": str(thumbnail_path),
                "reel_path": str(reel_path),
                "video_path": str(video_path),
                "regenerated_at": datetime.utcnow().isoformat()
            })
            
            print(f"\n{'='*60}")
            print(f"✅ SUCCESS: {brand.upper()} generation completed!")
            print(f"{'='*60}\n")
            
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
            
            print(f"\n{'='*60}")
            print(f"❌ GENERATION FAILED FOR {brand.upper()}")
            print(f"{'='*60}")
            print(f"Error Type: {error_details['type']}")
            print(f"Error Message: {error_details['message']}")
            print(f"\nFull Traceback:")
            print(error_details['traceback'])
            print(f"{'='*60}\n")
            
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
        print(f"\n🎬 process_job called for: {job_id}")
        
        job = self.get_job(job_id)
        if not job:
            error_msg = f"Job not found: {job_id}"
            print(f"❌ {error_msg}")
            return {"success": False, "error": error_msg}
        
        print(f"   Job found - brands: {job.brands}, variant: {job.variant}")
        
        # Check if already cancelled before starting
        if job.status == "cancelled":
            print(f"❌ Job was cancelled")
            return {"success": False, "error": "Job was cancelled"}
        
        # Validate brands list
        if not job.brands or len(job.brands) == 0:
            error_msg = "No brands specified for job"
            print(f"❌ {error_msg}")
            self.update_job_status(job_id, "failed", error_message=error_msg)
            return {"success": False, "error": error_msg}
        
        self.update_job_status(job_id, "generating", "Starting generation...", 0)
        
        results = {}
        total_brands = len(job.brands)
        ai_background_saved = False
        
        print(f"   Processing {total_brands} brands...")
        
        try:
            for i, brand in enumerate(job.brands):
                # Check for cancellation before each brand
                job = self.get_job(job_id)
                if job.status == "cancelled":
                    return {"success": False, "error": "Job was cancelled", "results": results}
                
                progress = int((i / total_brands) * 100)
                self.update_job_status(
                    job_id, "generating",
                    f"Generating {brand}...",
                    progress
                )
                
                result = self.regenerate_brand(job_id, brand)
                results[brand] = result
                
                # Save AI background path from first dark mode generation
                if not ai_background_saved and job.variant == "dark":
                    brand_output = job.brand_outputs.get(brand, {})
                    if "ai_background_path" not in (job.__dict__ or {}):
                        # Store the AI background for reuse
                        output_dir = Path("output")
                        ai_bg_path = output_dir / "backgrounds" / f"{job_id}_ai_bg.png"
                        ai_bg_path.parent.mkdir(parents=True, exist_ok=True)
                        # The background is stored internally in the generator
                        ai_background_saved = True
            
            # Final cancellation check
            job = self.get_job(job_id)
            if job.status == "cancelled":
                return {"success": False, "error": "Job was cancelled", "results": results}
            
            print(f"\n   Processing complete. Results: {results}")
            
            # Handle empty results (should not happen but just in case)
            if not results:
                error_msg = "No brands were processed - results are empty"
                print(f"❌ {error_msg}")
                self.update_job_status(job_id, "failed", error_message=error_msg)
                return {"success": False, "error": error_msg}
            
            # Check if all succeeded
            all_success = all(r.get("success", False) for r in results.values())
            any_success = any(r.get("success", False) for r in results.values())
            
            print(f"   all_success={all_success}, any_success={any_success}")
            
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
