"""Job manager — CRUD operations for generation jobs."""
import random
import string
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any
from sqlalchemy.orm import Session

from app.models import GenerationJob
from app.core.config import BrandType
from app.services.brand_resolver import brand_resolver


def generate_job_id() -> str:
    """Generate a short readable job ID like GEN-001234."""
    random_num = ''.join(random.choices(string.digits, k=6))
    return f"GEN-{random_num}"


def get_brand_type(brand_name: str) -> BrandType:
    """Convert brand name to BrandType enum."""
    bt = brand_resolver.get_brand_type(brand_name)
    return bt if bt else BrandType.HEALTHY_COLLEGE


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
        platforms: Optional[List[str]] = None,
        fixed_title: bool = False,
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
            fixed_title=fixed_title,
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


# Backward compatibility — callers using JobManager.process_job() get redirected
from app.services.job_processor import JobProcessor  # noqa: E402, F401
