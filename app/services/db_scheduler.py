"""
PostgreSQL-based scheduler service with multi-user support.
"""
import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy import and_
from app.models import ScheduledReel, UserProfile
from app.db_connection import get_db_session
from app.services.social_publisher import SocialPublisher


class DatabaseSchedulerService:
    """Scheduler service using PostgreSQL for multi-user support."""
    
    def __init__(self):
        """Initialize the database scheduler service."""
        self.publisher = SocialPublisher()
    
    def schedule_reel(
        self,
        user_id: str,
        reel_id: str,
        scheduled_time: datetime,
        caption: str = "CHANGE ME",
        platforms: list[str] = ["instagram"],
        video_path: Optional[Path] = None,
        thumbnail_path: Optional[Path] = None,
        user_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Schedule a reel for future publishing.
        
        Args:
            user_id: User identifier (e.g., email or username)
            reel_id: Unique identifier for the reel
            scheduled_time: When to publish (datetime object)
            caption: Caption for the post
            platforms: List of platforms ("instagram", "facebook")
            video_path: Path to video file
            thumbnail_path: Path to thumbnail
            user_name: Display name for the user
            
        Returns:
            Schedule details with schedule_id
        """
        import uuid
        
        print("\n🔵 DatabaseSchedulerService.schedule_reel() called")
        print(f"   User ID: {user_id}")
        print(f"   Reel ID: {reel_id}")
        print(f"   Scheduled time: {scheduled_time}")
        print(f"   Platforms: {platforms}")
        
        try:
            with get_db_session() as db:
                print("   ✅ Database session created")
                
                # Generate schedule ID
                schedule_id = str(uuid.uuid4())[:8]
                print(f"   ✅ Generated schedule_id: {schedule_id}")
                
                # Prepare metadata
                metadata = {
                    "platforms": platforms,
                    "video_path": str(video_path) if video_path else None,
                    "thumbnail_path": str(thumbnail_path) if thumbnail_path else None
                }
                print(f"   ✅ Metadata prepared: {metadata}")
                
                # Create scheduled reel
                print("   🔄 Creating ScheduledReel object...")
                scheduled_reel = ScheduledReel(
                    schedule_id=schedule_id,
                    user_id=user_id,
                    user_name=user_name or user_id,
                    reel_id=reel_id,
                    caption=caption,
                    scheduled_time=scheduled_time,
                    status="scheduled",
                    extra_data=metadata  # Store in extra_data column
                )
                print("   ✅ ScheduledReel object created")
                
                print("   🔄 Adding to database session...")
                db.add(scheduled_reel)
                print("   ✅ Added to session")
                
                print("   🔄 Committing to database...")
                db.commit()
                print("   ✅ COMMITTED TO DATABASE!")
                
                result = scheduled_reel.to_dict()
                print(f"   ✅ Converted to dict: {result}")
                
                return result
                
        except Exception as e:
            print(f"\n❌ ERROR in DatabaseSchedulerService.schedule_reel()")
            print(f"   Exception type: {type(e).__name__}")
            print(f"   Details: {str(e)}")
            import traceback
            traceback.print_exc()
            raise
    
    def get_pending_publications(self) -> list[Dict[str, Any]]:
        """
        Get all scheduled reels that are due for publishing.
        
        Returns:
            List of schedules ready to publish
        """
        with get_db_session() as db:
            now = datetime.now(timezone.utc)
            
            pending = db.query(ScheduledReel).filter(
                and_(
                    ScheduledReel.status == "scheduled",
                    ScheduledReel.scheduled_time <= now
                )
            ).all()
            
            return [reel.to_dict() for reel in pending]
    
    def get_all_scheduled(self, user_id: Optional[str] = None) -> list[Dict[str, Any]]:
        """
        Get all scheduled reels, optionally filtered by user.
        
        Args:
            user_id: Optional user filter
            
        Returns:
            List of all schedules
        """
        with get_db_session() as db:
            query = db.query(ScheduledReel)
            
            if user_id:
                query = query.filter(ScheduledReel.user_id == user_id)
            
            schedules = query.order_by(ScheduledReel.scheduled_time.desc()).all()
            return [reel.to_dict() for reel in schedules]
    
    def delete_scheduled(self, schedule_id: str, user_id: Optional[str] = None) -> bool:
        """
        Delete a scheduled post.
        
        Args:
            schedule_id: ID of the schedule to delete
            user_id: Optional user filter for security
            
        Returns:
            True if deleted, False if not found
        """
        with get_db_session() as db:
            query = db.query(ScheduledReel).filter(
                ScheduledReel.schedule_id == schedule_id
            )
            
            if user_id:
                query = query.filter(ScheduledReel.user_id == user_id)
            
            scheduled_reel = query.first()
            
            if not scheduled_reel:
                return False
            
            db.delete(scheduled_reel)
            db.commit()
            return True
    
    def mark_as_published(self, schedule_id: str) -> None:
        """Mark a schedule as successfully published."""
        with get_db_session() as db:
            scheduled_reel = db.query(ScheduledReel).filter(
                ScheduledReel.schedule_id == schedule_id
            ).first()
            
            if scheduled_reel:
                scheduled_reel.status = "published"
                scheduled_reel.published_at = datetime.now(timezone.utc)
                db.commit()
    
    def mark_as_failed(self, schedule_id: str, error: str) -> None:
        """Mark a schedule as failed with error message."""
        with get_db_session() as db:
            scheduled_reel = db.query(ScheduledReel).filter(
                ScheduledReel.schedule_id == schedule_id
            ).first()
            
            if scheduled_reel:
                scheduled_reel.status = "failed"
                scheduled_reel.publish_error = error
                db.commit()
    
    def publish_now(
        self,
        video_path: Path,
        thumbnail_path: Path,
        caption: str = "CHANGE ME",
        platforms: list[str] = ["instagram"],
        user_id: Optional[str] = None,
        brand_config: Optional['BrandConfig'] = None
    ) -> Dict[str, Any]:
        """
        Publish a reel immediately using user's credentials or brand credentials.
        
        Args:
            video_path: Path to video file
            thumbnail_path: Path to thumbnail
            caption: Caption for the post
            platforms: List of platforms
            user_id: User ID to use credentials from
            brand_config: Brand configuration with specific credentials
            
        Returns:
            Publishing results
        """
        from app.services.social_publisher import SocialPublisher
        
        # Priority: brand_config > user_id > default
        publisher = None
        
        if brand_config:
            # Use brand-specific credentials
            publisher = SocialPublisher(brand_config=brand_config)
        elif user_id:
            # Get user credentials if user_id provided
            with get_db_session() as db:
                user = db.query(UserProfile).filter(
                    UserProfile.user_id == user_id
                ).first()
                
                if user:
                    # Create temporary brand config from user credentials
                    from app.core.config import BrandConfig
                    user_config = BrandConfig(
                        name="user_custom",
                        display_name="User Custom",
                        primary_color=(0, 0, 0),
                        secondary_color=(0, 0, 0),
                        text_color=(0, 0, 0),
                        highlight_color=(0, 0, 0, 0),
                        logo_filename="",
                        thumbnail_bg_color=(0, 0, 0),
                        thumbnail_text_color=(0, 0, 0),
                        content_title_color=(0, 0, 0),
                        content_highlight_color=(0, 0, 0, 0),
                        instagram_business_account_id=user.instagram_business_account_id,
                        facebook_page_id=user.facebook_page_id,
                        meta_access_token=user.meta_access_token
                    )
                    publisher = SocialPublisher(brand_config=user_config)
        
        if not publisher:
            # Use default credentials
            publisher = SocialPublisher()
        
        # Get public URL - auto-detect Railway or use configured value
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
            results["instagram"] = publisher.publish_instagram_reel(
                video_url=video_url,
                caption=caption,
                thumbnail_url=thumbnail_url
            )
        
        if "facebook" in platforms:
            print("📘 Publishing to Facebook...")
            results["facebook"] = publisher.publish_facebook_reel(
                video_url=video_url,
                caption=caption,
                thumbnail_url=thumbnail_url
            )
        
        return results
    
    def get_or_create_user(
        self,
        user_id: str,
        user_name: str,
        email: Optional[str] = None,
        instagram_account_id: Optional[str] = None,
        facebook_page_id: Optional[str] = None,
        meta_access_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get existing user or create new one.
        
        Args:
            user_id: User identifier
            user_name: Display name
            email: Email address
            instagram_account_id: Instagram Business Account ID
            facebook_page_id: Facebook Page ID
            meta_access_token: Meta API access token
            
        Returns:
            User profile data
        """
        with get_db_session() as db:
            user = db.query(UserProfile).filter(
                UserProfile.user_id == user_id
            ).first()
            
            if not user:
                user = UserProfile(
                    user_id=user_id,
                    user_name=user_name,
                    email=email,
                    instagram_business_account_id=instagram_account_id,
                    facebook_page_id=facebook_page_id,
                    meta_access_token=meta_access_token
                )
                db.add(user)
                db.commit()
            
            return user.to_dict()
