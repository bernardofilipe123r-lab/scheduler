"""
Scheduler service for managing scheduled reel publications.

Integrates with Instagram and Facebook APIs for actual publishing.
"""
import os
from datetime import datetime
from typing import Optional, Dict, Any
from pathlib import Path
import json
import uuid
from app.services.social_publisher import SocialPublisher


class SchedulerService:
    """
    Service for scheduling reel publications.
    
    Handles scheduling metadata and triggers actual publishing to Instagram/Facebook.
    """
    
    def __init__(self, storage_path: Optional[Path] = None):
        """
        Initialize the scheduler service.
        
        Args:
            storage_path: Path to store scheduling metadata. Defaults to output/scheduled.json
        """
        if storage_path is None:
            base_dir = Path(__file__).resolve().parent.parent.parent
            storage_path = base_dir / "output" / "scheduled.json"
        
        self.storage_path = storage_path
        self.publisher = SocialPublisher()
        self._ensure_storage()
    
    def _ensure_storage(self) -> None:
        """Ensure the storage file exists."""
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.storage_path.exists():
            self.storage_path.write_text("[]")
    
    def schedule_reel(
        self,
        reel_id: str,
        scheduled_time: datetime,
        video_path: Path,
        caption: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Schedule a reel for publication.
        
        This method stores the scheduling information. In a production system,
        this would integrate with a task queue (e.g., Celery) or cron job
        that checks for scheduled posts and publishes them via Meta Graph API.
        
        Args:
            reel_id: Unique identifier for the reel
            scheduled_time: When to publish the reel
            video_path: Path to the video file
            caption: Caption text
            metadata: Optional additional metadata
            
        Returns:
            Scheduling record with confirmation
        """
        # Load existing schedules
        schedules = self._load_schedules()
        
        # Create scheduling record
        schedule_record = {
            "schedule_id": str(uuid.uuid4()),
            "reel_id": reel_id,
            "scheduled_time": scheduled_time.isoformat(),
            "video_path": str(video_path),
            "caption": caption,
            "status": "scheduled",
            "created_at": datetime.now().isoformat(),
            "metadata": metadata or {},
            # Meta Graph API integration fields (to be implemented)
            "instagram_post_id": None,
            "published_at": None,
            "publish_error": None,
        }
        
        # Add to schedules
        schedules.append(schedule_record)
        
        # Save updated schedules
        self._save_schedules(schedules)
        
        return schedule_record
    
    def get_scheduled_reels(
        self,
        status: Optional[str] = None
    ) -> list[Dict[str, Any]]:
        """
        Get all scheduled reels, optionally filtered by status.
        
        Args:
            status: Optional status filter ('scheduled', 'published', 'failed')
            
        Returns:
            List of scheduling records
        """
        schedules = self._load_schedules()
        
        if status:
            schedules = [s for s in schedules if s.get("status") == status]
        
        return schedules
    
    def get_all_scheduled(self) -> list[Dict[str, Any]]:
        """
        Get all scheduled reels (convenience method).
        
        Returns:
            List of all scheduling records
        """
        return self._load_schedules()
    
    def get_pending_publications(self) -> list[Dict[str, Any]]:
        """
        Get reels scheduled for publication that are due to be posted.
        
        Returns:
            List of reels that should be published now
        """
        schedules = self._load_schedules()
        now = datetime.now()
        
        pending = []
        for schedule in schedules:
            if schedule.get("status") != "scheduled":
                continue
            
            scheduled_time = datetime.fromisoformat(schedule["scheduled_time"])
            if scheduled_time <= now:
                pending.append(schedule)
        
        return pending
    
    def mark_as_published(
        self,
        schedule_id: str,
        instagram_post_id: Optional[str] = None
    ) -> bool:
        """
        Mark a scheduled reel as published.
        
        Args:
            schedule_id: The schedule ID
            instagram_post_id: Optional Instagram post ID from Meta API
            
        Returns:
            True if successful, False otherwise
        """
        schedules = self._load_schedules()
        
        for schedule in schedules:
            if schedule.get("schedule_id") == schedule_id:
                schedule["status"] = "published"
                schedule["published_at"] = datetime.now().isoformat()
                if instagram_post_id:
                    schedule["instagram_post_id"] = instagram_post_id
                
                self._save_schedules(schedules)
                return True
        
        return False
    
    def mark_as_failed(
        self,
        schedule_id: str,
        error_message: str
    ) -> bool:
        """
        Mark a scheduled reel as failed.
        
        Args:
            schedule_id: The schedule ID
            error_message: Error message
            
        Returns:
            True if successful, False otherwise
        """
        schedules = self._load_schedules()
        
        for schedule in schedules:
            if schedule.get("schedule_id") == schedule_id:
                schedule["status"] = "failed"
                schedule["publish_error"] = error_message
                
                self._save_schedules(schedules)
                return True
        
        return False
    
    def _load_schedules(self) -> list[Dict[str, Any]]:
        """Load schedules from storage file."""
        try:
            with open(self.storage_path, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return []
    
    def _save_schedules(self, schedules: list[Dict[str, Any]]) -> None:
        """Save schedules to storage file."""
        with open(self.storage_path, 'w') as f:
            json.dump(schedules, f, indent=2)
    
    def delete_scheduled(self, schedule_id: str) -> bool:
        """
        Delete a scheduled post.
        
        Args:
            schedule_id: ID of the schedule to delete
            
        Returns:
            True if deleted successfully, False if not found
        """
        schedules = self._load_schedules()
        original_count = len(schedules)
        
        # Filter out the schedule with matching ID
        schedules = [s for s in schedules if s['schedule_id'] != schedule_id]
        
        if len(schedules) == original_count:
            return False  # Schedule not found
        
        self._save_schedules(schedules)
        return True
    
    def publish_now(
        self,
        video_path: Path,
        thumbnail_path: Path,
        caption: str = "CHANGE ME",
        platforms: list[str] = ["instagram"]
    ) -> Dict[str, Any]:
        """
        Publish a reel immediately to specified platforms.
        
        Args:
            video_path: Path to video file
            thumbnail_path: Path to thumbnail image
            caption: Caption for the post
            platforms: List of platforms ("instagram", "facebook", or both)
            
        Returns:
            Publishing results
        """
        # Get public URLs - auto-detect Railway or use configured value
        # Railway sets RAILWAY_PUBLIC_DOMAIN automatically
        railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
        if railway_domain:
            public_url_base = f"https://{railway_domain}"
        else:
            public_url_base = os.getenv("PUBLIC_URL_BASE", "http://localhost:8000")
        
        video_url = f"{public_url_base}/output/videos/{video_path.name}"
        thumbnail_url = f"{public_url_base}/output/thumbnails/{thumbnail_path.name}"
        
        results = {}
        
        if "instagram" in platforms:
            print("📸 Publishing to Instagram...")
            results["instagram"] = self.publisher.publish_instagram_reel(
                video_url=video_url,
                caption=caption,
                thumbnail_url=thumbnail_url
            )
        
        if "facebook" in platforms:
            print("📘 Publishing to Facebook...")
            results["facebook"] = self.publisher.publish_facebook_reel(
                video_url=video_url,
                caption=caption,
                thumbnail_url=thumbnail_url
            )
        
        return results

    
    # ============================================================================
    # META GRAPH API INTEGRATION PLACEHOLDER
    # ============================================================================
    #
    # The following methods are placeholders for future Meta Graph API integration.
    # When implementing, you will need to:
    #
    # 1. Set up Meta App credentials (App ID, App Secret)
    # 2. Implement OAuth flow for Instagram Business Account access
    # 3. Use the Instagram Content Publishing API
    #
    # Reference: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
    #
    # Example implementation flow:
    #
    # def publish_to_instagram(self, video_path: Path, caption: str) -> str:
    #     """
    #     Publish a video to Instagram using Meta Graph API.
    #     
    #     Steps:
    #     1. Upload video to Instagram (create container)
    #     2. Publish the container
    #     3. Return the Instagram media ID
    #     """
    #     # Step 1: Create container
    #     container_id = self._create_instagram_container(video_path, caption)
    #     
    #     # Step 2: Publish container
    #     media_id = self._publish_instagram_container(container_id)
    #     
    #     return media_id
    #
    # def _create_instagram_container(self, video_path: Path, caption: str) -> str:
    #     """Create an Instagram media container."""
    #     # POST to: https://graph.facebook.com/v18.0/{ig-user-id}/media
    #     # params: video_url, caption, media_type=REELS
    #     pass
    #
    # def _publish_instagram_container(self, container_id: str) -> str:
    #     """Publish an Instagram media container."""
    #     # POST to: https://graph.facebook.com/v18.0/{ig-user-id}/media_publish
    #     # params: creation_id={container_id}
    #     pass
    #
    # ============================================================================
