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
        yt_title: Optional[str] = None,
        platforms: list[str] = ["instagram"],
        video_path: Optional[Path] = None,
        thumbnail_path: Optional[Path] = None,
        yt_thumbnail_path: Optional[Path] = None,  # Clean AI image for YouTube
        user_name: Optional[str] = None,
        brand: Optional[str] = None,
        variant: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Schedule a reel for future publishing.
        
        Args:
            user_id: User identifier (e.g., email or username)
            reel_id: Unique identifier for the reel
            scheduled_time: When to publish (datetime object)
            caption: Caption for the post
            yt_title: YouTube-optimized title (for YouTube Shorts)
            platforms: List of platforms ("instagram", "facebook", "youtube")
            video_path: Path to video file
            thumbnail_path: Path to thumbnail
            yt_thumbnail_path: Clean AI image for YouTube (no text)
            user_name: Display name for the user
            brand: Brand name ("gymcollege" or "healthycollege")
            variant: Variant type ("light" or "dark")
            
        Returns:
            Schedule details with schedule_id
        """
        import uuid
        
        print("\n🔵 DatabaseSchedulerService.schedule_reel() called")
        print(f"   User ID: {user_id}")
        print(f"   Reel ID: {reel_id}")
        print(f"   Scheduled time: {scheduled_time}")
        print(f"   Platforms: {platforms}")
        print(f"   Brand: {brand}, Variant: {variant}")
        if yt_title:
            print(f"   📺 YouTube title: {yt_title}")
        
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
                    "thumbnail_path": str(thumbnail_path) if thumbnail_path else None,
                    "yt_thumbnail_path": str(yt_thumbnail_path) if yt_thumbnail_path else None,  # Clean AI image for YouTube
                    "brand": brand,
                    "variant": variant or "light",
                    "yt_title": yt_title  # Store YouTube title in metadata
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
        Uses atomic locking to prevent duplicate publishing.
        
        Returns:
            List of schedules ready to publish (already marked as 'publishing')
        """
        with get_db_session() as db:
            now = datetime.now(timezone.utc)
            now_naive = datetime.now()  # Local time, no timezone
            
            print(f"\n🔍 get_pending_publications() check at:")
            print(f"   UTC now: {now}")
            print(f"   Local now (naive): {now_naive}")
            
            # Show ALL posts for debugging (any status)
            all_posts = db.query(ScheduledReel).order_by(ScheduledReel.scheduled_time.asc()).limit(50).all()
            
            # Group by status
            by_status = {}
            for post in all_posts:
                status = post.status
                if status not in by_status:
                    by_status[status] = []
                by_status[status].append(post)
            
            print(f"   📊 Posts by status:")
            for status, posts in by_status.items():
                print(f"      {status}: {len(posts)} post(s)")
                # Show details for non-scheduled posts (publishing, failed, published)
                if status != "scheduled":
                    for p in posts[:5]:  # Show first 5
                        print(f"         - {p.schedule_id}: {p.reel_id} @ {p.scheduled_time}")
                        if status == "failed":
                            error = p.publish_error or "No error recorded"
                            print(f"           Error: {error}")
            
            # Get scheduled posts that are DUE
            print(f"\n   📋 Checking for due 'scheduled' posts...")
            all_scheduled = db.query(ScheduledReel).filter(
                ScheduledReel.status == "scheduled"
            ).order_by(ScheduledReel.scheduled_time.asc()).all()
            
            print(f"   Total 'scheduled' posts: {len(all_scheduled)}")
            due_count = 0
            for sched in all_scheduled[:10]:  # Show first 10
                scheduled_time = sched.scheduled_time
                is_due = scheduled_time <= now
                if is_due:
                    due_count += 1
                    print(f"      ✅ DUE: {sched.schedule_id}: {sched.reel_id} @ {scheduled_time}")
                else:
                    time_until = scheduled_time - now
                    print(f"      ⏳ {sched.schedule_id}: {sched.reel_id} @ {scheduled_time} (in {time_until})")
            
            if due_count == 0:
                print(f"   ℹ️ No posts are due yet")
            
            # Use FOR UPDATE to lock rows and prevent race conditions
            pending = db.query(ScheduledReel).filter(
                and_(
                    ScheduledReel.status == "scheduled",
                    ScheduledReel.scheduled_time <= now
                )
            ).with_for_update(skip_locked=True).all()
            
            print(f"\n   ✅ Found {len(pending)} pending post(s) to publish NOW")
            
            # IMMEDIATELY mark all as "publishing" to prevent duplicate picks
            result = []
            for reel in pending:
                print(f"      → Marking {reel.schedule_id} ({reel.reel_id}) as 'publishing'")
                reel.status = "publishing"
                result.append(reel.to_dict())
            
            # Commit the status change before returning
            db.commit()
            
            return result
    
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
    
    def mark_as_published(self, schedule_id: str, post_ids: Dict[str, str] = None, publish_results: Dict[str, Any] = None) -> None:
        """Mark a schedule as successfully published.
        
        Args:
            schedule_id: The schedule ID
            post_ids: Dict of platform -> post_id for storing results (legacy)
            publish_results: Dict of platform -> detailed result info
        """
        with get_db_session() as db:
            scheduled_reel = db.query(ScheduledReel).filter(
                ScheduledReel.schedule_id == schedule_id
            ).first()
            
            if scheduled_reel:
                # Check if this is a partial success (some platforms failed)
                has_failures = False
                has_successes = False
                
                if publish_results:
                    for platform, data in publish_results.items():
                        if isinstance(data, dict):
                            if data.get('success'):
                                has_successes = True
                            else:
                                has_failures = True
                
                # Set status based on results
                if has_failures and has_successes:
                    scheduled_reel.status = "partial"
                    # Extract failed platform errors
                    failed_platforms = []
                    for platform, data in publish_results.items():
                        if isinstance(data, dict) and not data.get('success'):
                            error = data.get('error', 'Unknown error')
                            failed_platforms.append(f"{platform}: {error}")
                    scheduled_reel.publish_error = "; ".join(failed_platforms)
                else:
                    scheduled_reel.status = "published"
                    scheduled_reel.publish_error = None
                
                scheduled_reel.published_at = datetime.now(timezone.utc)
                
                # Store detailed publish results in metadata
                metadata = scheduled_reel.extra_data or {}
                
                if publish_results:
                    metadata['publish_results'] = publish_results
                    # Also extract post_ids for backward compatibility
                    post_ids = {}
                    for platform, data in publish_results.items():
                        if data.get('success') and data.get('post_id'):
                            post_ids[platform] = data['post_id']
                    metadata['post_ids'] = post_ids
                elif post_ids:
                    metadata['post_ids'] = post_ids
                
                scheduled_reel.extra_data = metadata
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
    
    def reset_stuck_publishing(self, max_age_minutes: int = 10) -> int:
        """
        Reset any posts stuck in 'publishing' status for too long.
        This handles cases where the server crashed during publishing.
        
        Args:
            max_age_minutes: Max minutes a post can be in 'publishing' before reset
            
        Returns:
            Number of posts reset
        """
        from datetime import timedelta
        
        with get_db_session() as db:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
            
            # Find posts stuck in 'publishing' for too long
            stuck = db.query(ScheduledReel).filter(
                and_(
                    ScheduledReel.status == "publishing",
                    ScheduledReel.scheduled_time <= cutoff
                )
            ).all()
            
            count = 0
            for reel in stuck:
                reel.status = "scheduled"  # Reset to allow retry
                reel.publish_error = f"Reset after being stuck in publishing for >{max_age_minutes} minutes"
                count += 1
            
            if count > 0:
                db.commit()
                print(f"⚠️ Reset {count} stuck publishing post(s)")
            
            return count
    
    def retry_failed(self, schedule_id: str) -> bool:
        """
        Reset a failed or partial post to 'scheduled' status for retry.
        For partial failures, only retry the failed platforms.
        
        Args:
            schedule_id: ID of the failed/partial schedule
            
        Returns:
            True if reset successfully, False if not found or not retriable
        """
        with get_db_session() as db:
            scheduled_reel = db.query(ScheduledReel).filter(
                ScheduledReel.schedule_id == schedule_id
            ).first()
            
            if not scheduled_reel:
                return False
            
            if scheduled_reel.status not in ["failed", "publishing", "partial"]:
                return False
            
            # For partial failures, determine which platforms to retry
            metadata = scheduled_reel.extra_data or {}
            publish_results = metadata.get('publish_results', {})
            
            if scheduled_reel.status == "partial" and publish_results:
                # Only retry platforms that failed
                failed_platforms = []
                succeeded_platforms = []
                
                for platform, result in publish_results.items():
                    if isinstance(result, dict):
                        if result.get('success'):
                            succeeded_platforms.append(platform)
                        else:
                            failed_platforms.append(platform)
                
                if failed_platforms:
                    # Store which platforms to retry (only the failed ones)
                    metadata['retry_platforms'] = failed_platforms
                    # Keep track of which platforms already succeeded (don't retry these)
                    metadata['succeeded_platforms'] = succeeded_platforms
                    scheduled_reel.extra_data = metadata
                    print(f"🔄 Partial retry: Will retry {failed_platforms}, skip {succeeded_platforms}")
                else:
                    # All platforms succeeded? This shouldn't happen for partial status
                    print(f"⚠️ Partial status but no failed platforms found")
            else:
                # Full retry - clear any previous retry info
                metadata.pop('retry_platforms', None)
                metadata.pop('succeeded_platforms', None)
                scheduled_reel.extra_data = metadata
            
            # Reset to scheduled
            scheduled_reel.status = "scheduled"
            scheduled_reel.publish_error = None
            
            # Update scheduled time to now so it gets picked up immediately
            scheduled_reel.scheduled_time = datetime.now(timezone.utc)
            
            db.commit()
            print(f"🔄 Reset post {schedule_id} for retry")
            return True
    
    def reschedule(self, schedule_id: str, new_time: datetime) -> bool:
        """
        Reschedule a post to a new date/time.
        
        Args:
            schedule_id: ID of the scheduled post
            new_time: New datetime to schedule for
            
        Returns:
            True if rescheduled successfully, False if not found
        """
        with get_db_session() as db:
            scheduled_reel = db.query(ScheduledReel).filter(
                ScheduledReel.schedule_id == schedule_id
            ).first()
            
            if not scheduled_reel:
                return False
            
            # Only allow rescheduling if not already published
            if scheduled_reel.status == "published":
                print(f"⚠️ Cannot reschedule published post {schedule_id}")
                return False
            
            # Update the scheduled time
            scheduled_reel.scheduled_time = new_time
            # Reset to scheduled status if it was failed
            if scheduled_reel.status in ["failed", "partial"]:
                scheduled_reel.status = "scheduled"
                scheduled_reel.publish_error = None
            
            db.commit()
            print(f"📅 Rescheduled post {schedule_id} to {new_time.isoformat()}")
            return True
    
    def publish_scheduled_now(self, schedule_id: str) -> bool:
        """
        Set a scheduled post to publish immediately.
        Updates scheduled_time to now so the auto-publisher picks it up.
        
        Args:
            schedule_id: ID of the scheduled post
            
        Returns:
            True if updated successfully, False if not found
        """
        with get_db_session() as db:
            scheduled_reel = db.query(ScheduledReel).filter(
                ScheduledReel.schedule_id == schedule_id
            ).first()
            
            if not scheduled_reel:
                return False
            
            # Only allow if not already published
            if scheduled_reel.status == "published":
                print(f"⚠️ Post {schedule_id} already published")
                return False
            
            # Set scheduled time to now (will be picked up on next check)
            scheduled_reel.scheduled_time = datetime.now(timezone.utc)
            # Reset to scheduled status if it was failed
            if scheduled_reel.status in ["failed", "partial"]:
                scheduled_reel.status = "scheduled"
                scheduled_reel.publish_error = None
            
            db.commit()
            print(f"🚀 Post {schedule_id} queued for immediate publishing")
            return True
    
    def publish_now(
        self,
        video_path: Path,
        thumbnail_path: Path,
        caption: str = "CHANGE ME",
        platforms: list[str] = ["instagram"],
        user_id: Optional[str] = None,
        brand_config: Optional['BrandConfig'] = None,
        brand_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Publish a reel immediately using user's credentials or brand credentials.
        
        Args:
            video_path: Path to video file
            thumbnail_path: Path to thumbnail
            caption: Caption for the post
            platforms: List of platforms
            user_id: User ID to use credentials from
            metadata: Optional metadata dict containing yt_title, yt_thumbnail_path, etc.
            brand_config: Brand configuration with specific credentials
            brand_name: Brand name string (e.g., 'gymcollege', 'healthycollege')
            
        Returns:
            Publishing results
        """
        from app.services.social_publisher import SocialPublisher
        from app.core.config import BrandType, BRAND_CONFIGS
        
        # Priority: brand_config > brand_name > user_id > default
        publisher = None
        
        if brand_config:
            # Use brand-specific credentials
            print(f"🏷️ Using provided brand_config: {brand_config.name}")
            publisher = SocialPublisher(brand_config=brand_config)
        elif brand_name:
            # Look up brand config by name
            brand_name_normalized = brand_name.lower().replace(' ', '_').replace('-', '_')
            print(f"🏷️ Looking up brand config for: {brand_name} (normalized: {brand_name_normalized})")
            
            # Map common names to BrandType
            brand_mapping = {
                'gymcollege': BrandType.THE_GYM_COLLEGE,
                'gym_college': BrandType.THE_GYM_COLLEGE,
                'the_gym_college': BrandType.THE_GYM_COLLEGE,
                'thegymcollege': BrandType.THE_GYM_COLLEGE,
                'healthycollege': BrandType.HEALTHY_COLLEGE,
                'healthy_college': BrandType.HEALTHY_COLLEGE,
                'thehealthycollege': BrandType.HEALTHY_COLLEGE,
                'vitalitycollege': BrandType.VITALITY_COLLEGE,
                'vitality_college': BrandType.VITALITY_COLLEGE,
                'thevitalitycollege': BrandType.VITALITY_COLLEGE,
                'longevitycollege': BrandType.LONGEVITY_COLLEGE,
                'longevity_college': BrandType.LONGEVITY_COLLEGE,
                'thelongevitycollege': BrandType.LONGEVITY_COLLEGE,
                'holisticcollege': BrandType.HOLISTIC_COLLEGE,
                'holistic_college': BrandType.HOLISTIC_COLLEGE,
                'theholisticcollege': BrandType.HOLISTIC_COLLEGE,
                'wellbeingcollege': BrandType.WELLBEING_COLLEGE,
                'wellbeing_college': BrandType.WELLBEING_COLLEGE,
                'thewellbeingcollege': BrandType.WELLBEING_COLLEGE,
            }
            
            brand_type = brand_mapping.get(brand_name_normalized)
            if brand_type and brand_type in BRAND_CONFIGS:
                resolved_config = BRAND_CONFIGS[brand_type]
                print(f"   ✅ Found brand config: {resolved_config.name}")
                print(f"   📸 Instagram Account ID: {resolved_config.instagram_business_account_id}")
                print(f"   📘 Facebook Page ID: {resolved_config.facebook_page_id}")
                
                # CRITICAL: Validate that brand has its own credentials
                if not resolved_config.instagram_business_account_id:
                    error_msg = f"CRITICAL: Brand '{brand_name}' has no Instagram Business Account ID configured! Cannot publish."
                    print(f"   ❌ {error_msg}")
                    return {
                        "instagram": {"success": False, "error": error_msg, "platform": "instagram"},
                        "facebook": {"success": False, "error": error_msg, "platform": "facebook"},
                        "credential_error": True,
                        "brand": brand_name
                    }
                
                if not resolved_config.facebook_page_id:
                    error_msg = f"CRITICAL: Brand '{brand_name}' has no Facebook Page ID configured! Cannot publish."
                    print(f"   ❌ {error_msg}")
                    return {
                        "instagram": {"success": False, "error": error_msg, "platform": "instagram"},
                        "facebook": {"success": False, "error": error_msg, "platform": "facebook"},
                        "credential_error": True,
                        "brand": brand_name
                    }
                
                publisher = SocialPublisher(brand_config=resolved_config)
            else:
                error_msg = f"CRITICAL: Brand '{brand_name}' not found in config! Cannot publish to unknown brand."
                print(f"   ❌ {error_msg}")
                return {
                    "instagram": {"success": False, "error": error_msg, "platform": "instagram"},
                    "facebook": {"success": False, "error": error_msg, "platform": "facebook"},
                    "credential_error": True,
                    "brand": brand_name
                }
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
            print(f"🌐 Using Railway domain: {railway_domain}")
        else:
            public_url_base = os.getenv("PUBLIC_URL_BASE", "http://localhost:8000")
            print(f"🌐 Using PUBLIC_URL_BASE: {public_url_base}")
        
        video_url = f"{public_url_base}/output/videos/{video_path.name}"
        thumbnail_url = f"{public_url_base}/output/thumbnails/{thumbnail_path.name}"
        
        print(f"🎬 Video URL: {video_url}")
        print(f"🖼️  Thumbnail URL: {thumbnail_url}")
        
        # Verify video file exists
        if not video_path.exists():
            print(f"❌ ERROR: Video file not found at {video_path}")
        else:
            print(f"✅ Video file exists: {video_path} ({video_path.stat().st_size} bytes)")
        
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
        
        if "youtube" in platforms:
            print("📺 Publishing to YouTube...", flush=True)
            print(f"   📺 [YT DEBUG] metadata received: {metadata}", flush=True)
            print(f"   📺 [YT DEBUG] brand_name: {brand_name}", flush=True)
            # Get yt_title from metadata if available
            yt_title = metadata.get("yt_title") if metadata else None
            print(f"   📺 [YT DEBUG] yt_title from metadata: {yt_title}", flush=True)
            # Get yt_thumbnail_path from metadata - clean AI image without text
            yt_thumbnail_path = metadata.get("yt_thumbnail_path") if metadata else None
            print(f"   📺 [YT DEBUG] yt_thumbnail_path from metadata: {yt_thumbnail_path}", flush=True)
            if yt_thumbnail_path:
                yt_thumbnail_path = Path(yt_thumbnail_path)
                if not yt_thumbnail_path.exists():
                    print(f"   ⚠️ YT thumbnail not found, using regular thumbnail: {yt_thumbnail_path}", flush=True)
                    yt_thumbnail_path = thumbnail_path
                else:
                    print(f"   📺 [YT DEBUG] YT thumbnail exists: {yt_thumbnail_path}", flush=True)
            else:
                print(f"   📺 [YT DEBUG] No YT thumbnail in metadata, using regular: {thumbnail_path}", flush=True)
                yt_thumbnail_path = thumbnail_path
            
            print(f"   📺 [YT DEBUG] Calling _publish_to_youtube with:", flush=True)
            print(f"      video_path={video_path}", flush=True)
            print(f"      thumbnail_path={yt_thumbnail_path}", flush=True)
            print(f"      brand_name={brand_name}", flush=True)
            print(f"      yt_title={yt_title}", flush=True)
            
            results["youtube"] = self._publish_to_youtube(
                video_path=video_path,
                thumbnail_path=yt_thumbnail_path,  # Use YT-specific thumbnail (clean AI image)
                caption=caption,
                brand_name=brand_name,
                yt_title=yt_title
            )
            print(f"   📺 [YT DEBUG] _publish_to_youtube result: {results['youtube']}", flush=True)
        
        return results
    
    def _publish_to_youtube(
        self,
        video_path: Path,
        thumbnail_path: Path,
        caption: str,
        brand_name: Optional[str] = None,
        yt_title: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Publish a video to YouTube as a Short.
        
        Architecture:
        1. Load refresh_token from database
        2. Publisher uses refresh_token to get fresh access_token
        3. Upload video using access_token
        4. Discard access_token (it's short-lived anyway)
        5. Update channel status in DB
        
        Args:
            video_path: Path to the video file
            thumbnail_path: Path to the thumbnail
            caption: Caption/description for the video
            brand_name: Brand name for loading credentials
            yt_title: YouTube-optimized title (searchable, clickable)
            
        Returns:
            Publishing result dict
        """
        from app.api.youtube_routes import get_youtube_credentials_for_brand, update_youtube_channel_status
        from app.services.youtube_publisher import YouTubePublisher
        from datetime import datetime
        
        print(f"\n📺 [YT PUBLISH] _publish_to_youtube() called", flush=True)
        print(f"   📺 [YT PUBLISH] video_path: {video_path} (exists: {video_path.exists() if hasattr(video_path, 'exists') else 'N/A'})", flush=True)
        print(f"   📺 [YT PUBLISH] thumbnail_path: {thumbnail_path}", flush=True)
        print(f"   📺 [YT PUBLISH] brand_name: {brand_name}", flush=True)
        print(f"   📺 [YT PUBLISH] yt_title: {yt_title}", flush=True)
        
        if not brand_name:
            print(f"   ❌ [YT PUBLISH] No brand_name provided!", flush=True)
            return {"success": False, "error": "Brand name required for YouTube publishing"}
        
        # Get credentials for this brand from database
        print(f"   📺 [YT PUBLISH] Getting credentials from database for brand: {brand_name}", flush=True)
        with get_db_session() as db:
            credentials = get_youtube_credentials_for_brand(brand_name, db)
            
            if not credentials:
                print(f"   ❌ [YT PUBLISH] No credentials found for {brand_name}!", flush=True)
                return {"success": False, "error": f"YouTube not configured for {brand_name}. Click 'Connect YouTube' in the app."}
            
            print(f"   ✅ [YT PUBLISH] Credentials found: channel_id={credentials.channel_id}, channel_name={credentials.channel_name}", flush=True)
            print(f"   📺 [YT PUBLISH] refresh_token present: {bool(credentials.refresh_token)}", flush=True)
            
            # Create publisher with credentials
            # The publisher will use the refresh_token to get a fresh access_token
            print(f"   📺 [YT PUBLISH] Creating YouTubePublisher with credentials...", flush=True)
            yt_publisher = YouTubePublisher(credentials=credentials)
            
            # Use provided yt_title or extract from caption as fallback
            if yt_title:
                title = yt_title[:100]  # Ensure max 100 chars
                print(f"   📺 [YT PUBLISH] Using stored YouTube title: {title}", flush=True)
            else:
                # Fallback: extract from caption (first line or first sentence)
                lines = caption.split('\n')
                title = lines[0][:100] if lines else "Health & Wellness Tips"
                print(f"   📺 [YT PUBLISH] Using fallback title from caption: {title}", flush=True)
            
            # Upload as a Short
            thumbnail_exists = thumbnail_path.exists() if hasattr(thumbnail_path, 'exists') else False
            print(f"   📺 [YT PUBLISH] Calling upload_youtube_short()...", flush=True)
            print(f"      video_path={video_path}", flush=True)
            print(f"      title={title}", flush=True)
            print(f"      thumbnail_path={thumbnail_path} (exists: {thumbnail_exists})", flush=True)
            
            result = yt_publisher.upload_youtube_short(
                video_path=str(video_path),
                title=title,
                description=caption,
                thumbnail_path=str(thumbnail_path) if thumbnail_exists else None
            )
            
            print(f"   📺 [YT PUBLISH] upload_youtube_short result: {result}", flush=True)
            
            # Update channel status in database
            if result.get("success"):
                update_youtube_channel_status(
                    brand=brand_name,
                    db=db,
                    last_upload_at=datetime.utcnow()
                )
            else:
                error_msg = result.get("error", "Unknown error")
                # Check if this is a token revocation error
                if "401" in str(error_msg) or "403" in str(error_msg) or "invalid_grant" in str(error_msg):
                    update_youtube_channel_status(
                        brand=brand_name,
                        db=db,
                        status="revoked",
                        last_error="Access revoked. Please reconnect YouTube."
                    )
                else:
                    update_youtube_channel_status(
                        brand=brand_name,
                        db=db,
                        status="error",
                        last_error=error_msg
                    )
            
            return result

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

    def get_next_available_slot(
        self,
        brand: str,
        variant: str,
        reference_date: Optional[datetime] = None
    ) -> datetime:
        """
        Get the next available scheduling slot for a brand+variant combo.
        
        MAGIC SCHEDULING RULES:
        ========================
        Each brand posts 6 times daily (every 4 hours), alternating Light → Dark.
        Brands are staggered by 1 hour:
        
        Holistic College:  12AM(L), 4AM(D), 8AM(L), 12PM(D), 4PM(L), 8PM(D)
        Healthy College:   1AM(L), 5AM(D), 9AM(L), 1PM(D), 5PM(L), 9PM(D)
        Vitality College:  2AM(L), 6AM(D), 10AM(L), 2PM(D), 6PM(L), 10PM(D)
        Longevity College: 3AM(L), 7AM(D), 11AM(L), 3PM(D), 7PM(L), 11PM(D)
        Wellbeing College: 4AM(L), 8AM(D), 12PM(L), 4PM(D), 8PM(L), 12AM(D)
        
        Rules:
        1. Start only from January 16, 2026 (everything before is "filled")
        2. If today > Jan 16, start from today's date
        3. Find next slot matching the variant (light/dark)
        4. Skip slots that are already scheduled
        
        Args:
            brand: Brand name ("holisticcollege", "healthycollege", "vitalitycollege", "longevitycollege", "wellbeingcollege")
            variant: "light" or "dark"
            reference_date: Optional reference date (defaults to now)
            
        Returns:
            Next available datetime for scheduling
        """
        from datetime import timedelta
        
        # Brand hour offsets (staggered by 1 hour)
        BRAND_OFFSETS = {
            "holisticcollege": 0,
            "healthycollege": 1,
            "vitalitycollege": 2,
            "longevitycollege": 3,
            "wellbeingcollege": 4,
            # Legacy support
            "gymcollege": 0,
        }
        
        # Base slot pattern (every 4 hours, alternating L/D/L/D/L/D)
        # For holisticcollege at offset 0: 0(L), 4(D), 8(L), 12(D), 16(L), 20(D)
        BASE_SLOTS = [
            (0, "light"),   # 12 AM - Light
            (4, "dark"),    # 4 AM - Dark
            (8, "light"),   # 8 AM - Light
            (12, "dark"),   # 12 PM - Dark
            (16, "light"),  # 4 PM - Light
            (20, "dark"),   # 8 PM - Dark
        ]
        
        # Get brand offset
        brand_lower = brand.lower()
        offset = BRAND_OFFSETS.get(brand_lower, 0)
        
        # Build slots for this brand (apply offset, wrap around 24h)
        brand_slots = [((hour + offset) % 24, v) for hour, v in BASE_SLOTS]
        
        # Filter to only slots matching requested variant
        matching_slots = [hour for hour, v in brand_slots if v == variant]
        
        # Starting reference points
        start_date = datetime(2026, 1, 16, tzinfo=timezone.utc)
        now = reference_date or datetime.now(timezone.utc)
        
        # Use the later of start_date or now (Rule 1 & 2)
        base_date = max(start_date, now)
        
        # Get all scheduled posts for this brand
        with get_db_session() as db:
            schedules = db.query(ScheduledReel).filter(
                and_(
                    ScheduledReel.status.in_(["scheduled", "publishing"]),
                    ScheduledReel.scheduled_time >= start_date
                )
            ).all()
            
            # Filter by brand and variant - build set of occupied timestamps
            occupied_slots = set()
            for schedule in schedules:
                metadata = schedule.extra_data or {}
                schedule_brand = metadata.get("brand", "").lower()
                schedule_variant = metadata.get("variant", "light")
                
                # Match by brand name
                if schedule_brand == brand_lower and schedule_variant == variant:
                    # Store as timestamp for easy comparison
                    ts = schedule.scheduled_time
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    occupied_slots.add(ts.timestamp())
        
        # Find next available slot starting from base_date
        current_day = base_date.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Search up to 365 days ahead
        for day_offset in range(365):
            check_date = current_day + timedelta(days=day_offset)
            
            for hour in matching_slots:
                candidate = check_date.replace(hour=hour, minute=0, second=0, microsecond=0)
                
                # Skip if in the past
                if candidate <= now:
                    continue
                
                # Check if slot is available
                if candidate.timestamp() not in occupied_slots:
                    print(f"📅 Found next slot for {brand}/{variant}: {candidate.isoformat()}")
                    return candidate
        
        # Fallback: just return tomorrow at first matching slot
        tomorrow = now + timedelta(days=1)
        return tomorrow.replace(hour=matching_slots[0], minute=0, second=0, microsecond=0)

    def get_next_slots_for_job(
        self,
        brands: list[str],
        variant: str
    ) -> Dict[str, datetime]:
        """
        Get next available slots for all brands in a job.
        
        Args:
            brands: List of brand names
            variant: "light" or "dark"
            
        Returns:
            Dict mapping brand name to next available slot datetime
        """
        result = {}
        for brand in brands:
            result[brand] = self.get_next_available_slot(brand, variant)
        return result

    def get_scheduled_slots_for_brand(
        self,
        brand: str,
        variant: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> list[datetime]:
        """
        Get all scheduled/occupied slots for a brand+variant combo.
        
        Args:
            brand: Brand name
            variant: "light" or "dark"
            start_date: Optional start filter
            end_date: Optional end filter
            
        Returns:
            List of occupied datetime slots
        """
        with get_db_session() as db:
            query = db.query(ScheduledReel).filter(
                ScheduledReel.status.in_(["scheduled", "publishing"])
            )
            
            if start_date:
                query = query.filter(ScheduledReel.scheduled_time >= start_date)
            if end_date:
                query = query.filter(ScheduledReel.scheduled_time <= end_date)
            
            schedules = query.all()
            
            occupied = []
            for schedule in schedules:
                metadata = schedule.extra_data or {}
                schedule_brand = metadata.get("brand", "").lower()
                schedule_variant = metadata.get("variant", "light")
                
                brand_match = (
                    (brand.lower() == "gymcollege" and schedule_brand in ["gymcollege", "the_gym_college", "thegymcollege", ""]) or
                    (brand.lower() == "healthycollege" and schedule_brand in ["healthycollege", "healthy_college", "thehealthycollege"]) or
                    (brand.lower() == "vitalitycollege" and schedule_brand in ["vitalitycollege", "vitality_college", "thevitalitycollege"]) or
                    (brand.lower() == "longevitycollege" and schedule_brand in ["longevitycollege", "longevity_college", "thelongevitycollege"])
                )
                
                if brand_match and schedule_variant == variant:
                    occupied.append(schedule.scheduled_time)
            
            return sorted(occupied)
