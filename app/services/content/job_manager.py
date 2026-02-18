"""Job manager — CRUD operations for generation jobs."""
import random
import string
from datetime import datetime
from typing import List, Dict, Optional, Any
from sqlalchemy.orm import Session

from app.models import GenerationJob
from app.services.brands.resolver import brand_resolver


def generate_job_id() -> str:
    """Generate a short readable job ID like GEN-001234."""
    random_num = ''.join(random.choices(string.digits, k=6))
    return f"GEN-{random_num}"


def get_brand_type(brand_name: str) -> str:
    """Resolve brand name to canonical brand ID."""
    return brand_resolver.resolve_brand_name(brand_name) or brand_name


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
        image_model: Optional[str] = None,
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
            image_model=image_model,
            status="pending",
            brand_outputs={brand: {"status": "pending"} for brand in brands}
        )
        
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        
        return job
    
    def get_job(self, job_id: str, user_id: str | None = None) -> Optional[GenerationJob]:
        """Get a job by ID, optionally filtered by user."""
        query = self.db.query(GenerationJob).filter_by(job_id=job_id)
        if user_id:
            query = query.filter(GenerationJob.user_id == user_id)
        return query.first()
    
    def get_user_jobs(self, user_id: str, limit: int = 50) -> List[GenerationJob]:
        """Get recent jobs for a user."""
        return (
            self.db.query(GenerationJob)
            .filter_by(user_id=user_id)
            .order_by(GenerationJob.created_at.desc())
            .limit(limit)
            .all()
        )
    
    def get_all_jobs(self, limit: int = 100, user_id: str | None = None) -> List[GenerationJob]:
        """Get all recent jobs, optionally filtered by user."""
        query = self.db.query(GenerationJob)
        if user_id:
            query = query.filter(GenerationJob.user_id == user_id)
        return (
            query
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
        user_id: str | None = None,
        title: Optional[str] = None,
        content_lines: Optional[List[str]] = None,
        ai_prompt: Optional[str] = None,
        cta_type: Optional[str] = None
    ) -> Optional[GenerationJob]:
        """Update job inputs (for re-generation with changes)."""
        job = self.get_job(job_id, user_id=user_id)
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
        """Clean up all files associated with a job from Supabase Storage."""
        job = self.get_job(job_id)
        if not job:
            return False
        
        from app.services.storage.supabase_storage import delete_file
        
        def _parse_supabase_url(url: str) -> tuple[str, str] | None:
            """Extract (bucket, path) from a Supabase Storage public URL."""
            if not url or not isinstance(url, str):
                return None
            marker = "/storage/v1/object/public/"
            idx = url.find(marker)
            if idx == -1:
                return None
            remainder = url[idx + len(marker):]
            parts = remainder.split("/", 1)
            if len(parts) != 2:
                return None
            return (parts[0], parts[1])
        
        # Clean up files for each brand
        for brand, output in (job.brand_outputs or {}).items():
            if not isinstance(output, dict):
                continue
            # Collect all URL fields that might contain Supabase URLs
            url_keys = ["video_url", "thumbnail_url", "yt_thumbnail_url",
                        "video_path", "thumbnail_path", "yt_thumbnail_path"]
            for key in url_keys:
                url = output.get(key)
                parsed = _parse_supabase_url(url)
                if parsed:
                    bucket, path = parsed
                    try:
                        delete_file(bucket, path)
                    except Exception:
                        pass
        
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
from app.services.content.job_processor import JobProcessor  # noqa: E402, F401
