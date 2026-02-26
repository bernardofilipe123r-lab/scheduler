"""
PostgreSQL-based scheduler service with multi-user support.
"""
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, TYPE_CHECKING
from sqlalchemy import and_
from app.models import ScheduledReel, UserProfile
from app.db_connection import get_db_session
from app.services.publishing.social_publisher import SocialPublisher

if TYPE_CHECKING:
    from app.core.config import BrandConfig


def _proactive_refresh_ig_token(brand_name: str) -> Optional[str]:
    """
    Proactively refresh the Instagram token for a brand if it hasn't been
    refreshed in the last 6 hours or expires within 5 days.
    Returns the new token if refreshed, None otherwise.
    Safe to call before every Instagram publish.
    """
    from app.db_connection import SessionLocal
    from app.models.brands import Brand
    from app.services.publishing.ig_token_service import InstagramTokenService

    try:
        db = SessionLocal()
        try:
            brand = db.query(Brand).filter(Brand.id == brand_name).first()
            if not brand:
                return None

            token = brand.instagram_access_token or brand.meta_access_token
            if not token:
                return None

            now = datetime.now(timezone.utc)

            # Decide whether a refresh is needed
            needs_refresh = False
            last_refreshed = brand.instagram_token_last_refreshed_at
            if last_refreshed:
                if last_refreshed.tzinfo is None:
                    last_refreshed = last_refreshed.replace(tzinfo=timezone.utc)
                hours_since = (now - last_refreshed).total_seconds() / 3600
                needs_refresh = hours_since >= 6
            else:
                needs_refresh = True  # Never refreshed — do it now

            # Also force refresh if token is expiring within 5 days
            expires_at = brand.instagram_token_expires_at
            if expires_at and not needs_refresh:
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                days_left = (expires_at - now).days
                if days_left <= 5:
                    needs_refresh = True

            if not needs_refresh:
                return None

            token_service = InstagramTokenService()
            result = token_service.refresh_long_lived_token(token)
            new_token = result.get("access_token")
            expires_in = result.get("expires_in", 5184000)  # default 60 days

            if new_token:
                brand.instagram_access_token = new_token
                brand.meta_access_token = new_token
                brand.instagram_token_expires_at = now + timedelta(seconds=expires_in)
                brand.instagram_token_last_refreshed_at = now
                db.commit()
                print(f"🔑 [PRE-PUBLISH] Refreshed IG token for {brand_name}", flush=True)
                return new_token
        finally:
            db.close()
    except Exception as e:
        print(f"⚠️ [PRE-PUBLISH] IG token refresh failed for {brand_name}: {e}", flush=True)
        return None


class DatabaseSchedulerService:
    """Scheduler service using PostgreSQL for multi-user support."""
    
    def __init__(self):
        """Initialize the database scheduler service."""
        self.publisher = SocialPublisher()

    @staticmethod
    def _brands_match(brand: str, schedule_brand: str) -> bool:
        """Check if a brand ID matches a schedule's brand string dynamically."""
        from app.services.brands.resolver import brand_resolver
        resolved = brand_resolver.resolve_brand_name(schedule_brand)
        return resolved is not None and resolved == brand.lower()
    
    def schedule_reel(
        self,
        user_id: str,
        reel_id: str,
        scheduled_time: datetime,
        caption: str = "CHANGE ME",
        yt_title: Optional[str] = None,
        platforms: list[str] = ["instagram"],
        video_path: Optional[str] = None,
        thumbnail_path: Optional[str] = None,
        yt_thumbnail_path: Optional[str] = None,  # Clean AI image for YouTube
        user_name: Optional[str] = None,
        brand: Optional[str] = None,
        variant: Optional[str] = None,
        post_title: Optional[str] = None,
        slide_texts: Optional[list] = None,
        carousel_paths: Optional[list] = None,
        job_id: Optional[str] = None,
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
                    "yt_title": yt_title,  # Store YouTube title in metadata
                    "title": post_title,  # Store post title for cover slide compositing
                    "slide_texts": slide_texts,  # Store carousel text slides
                    "carousel_paths": [str(p) for p in carousel_paths] if carousel_paths else None,
                    "raw_background_url": str(thumbnail_path) if thumbnail_path else None,
                    "job_id": job_id,  # Link back to generation job
                }
                print(f"   ✅ Metadata prepared: {metadata}")
                
                # ── DEDUPLICATION GUARD ──────────────────────────────
                # Prevent scheduling duplicate content for the same brand
                # in the same time slot (±30 min window). This catches
                # races between parallel Toby ticks and auto-retries.
                if brand and scheduled_time:
                    from datetime import timedelta as _td
                    window_start = scheduled_time - _td(minutes=30)
                    window_end = scheduled_time + _td(minutes=30)
                    existing = db.query(ScheduledReel).filter(
                        ScheduledReel.user_id == user_id,
                        ScheduledReel.scheduled_time >= window_start,
                        ScheduledReel.scheduled_time <= window_end,
                        ScheduledReel.status.in_(["scheduled", "publishing", "partial", "published"]),
                    ).all()
                    for ex in existing:
                        ex_brand = (ex.extra_data or {}).get("brand", "")
                        ex_variant = (ex.extra_data or {}).get("variant", "")
                        # Same brand + same variant type (reel vs post)
                        is_same_type = (
                            (variant in ("light", "dark") and ex_variant in ("light", "dark"))
                            or (variant == "post" and ex_variant == "post")
                        )
                        if ex_brand == brand and is_same_type:
                            print(f"   ⚠️ DEDUP: Slot already filled for {brand} "
                                  f"at {scheduled_time} (existing: {ex.schedule_id})")
                            return {"schedule_id": ex.schedule_id, "deduplicated": True}

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
            
            print(f"\n🔍 get_pending_publications() check at:")
            print(f"   UTC now: {now}")
            
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
                success_platforms = []
                failed_platforms = []
                
                if publish_results:
                    for platform, data in publish_results.items():
                        if isinstance(data, dict):
                            if data.get('success'):
                                has_successes = True
                                success_platforms.append(platform)
                            else:
                                error_msg = data.get('error', '')
                                # "Not configured" / FB credential errors are skips, not real failures
                                error_lower = error_msg.lower()
                                is_not_configured = (
                                    'not configured' in error_lower
                                    or 'page access token' in error_lower
                                    or 'credentials not configured' in error_lower
                                )
                                if not is_not_configured:
                                    has_failures = True
                                    failed_platforms.append(platform)
                
                # Set status based on results
                if has_failures and has_successes:
                    scheduled_reel.status = "partial"
                    # Extract failed platform errors
                    failed_platform_errors = []
                    for platform, data in publish_results.items():
                        if isinstance(data, dict) and not data.get('success'):
                            error = data.get('error', 'Unknown error')
                            failed_platform_errors.append(f"{platform}: {error}")
                    scheduled_reel.publish_error = "; ".join(failed_platform_errors)
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
                
                # CRITICAL: Force SQLAlchemy to detect the change
                scheduled_reel.extra_data = dict(metadata)
                
                # Sync status back to generation_jobs.brand_outputs
                self._sync_brand_output_status(
                    db, metadata, scheduled_reel.status
                )

                # Log successful publish events so Toby "Recent" includes real outcomes.
                try:
                    from app.models.toby import TobyActivityLog

                    brand = metadata.get('brand')
                    variant = metadata.get('variant')
                    content_kind = "post" if variant == "post" else "reel"

                    if scheduled_reel.status == "published":
                        description = (
                            f"Published {content_kind}"
                            f"{f' for {brand}' if brand else ''}"
                            f" to {', '.join(success_platforms) if success_platforms else 'configured platforms'}"
                        )
                        action_type = "publish_success"
                    elif scheduled_reel.status == "partial":
                        description = (
                            f"Partially published {content_kind}"
                            f"{f' for {brand}' if brand else ''}"
                            f" (success: {', '.join(success_platforms) if success_platforms else 'none'}, "
                            f"failed: {', '.join(failed_platforms) if failed_platforms else 'none'})"
                        )
                        action_type = "publish_partial"
                    else:
                        description = f"Publish status updated to {scheduled_reel.status}"
                        action_type = "publish_update"

                    db.add(TobyActivityLog(
                        user_id=scheduled_reel.user_id,
                        action_type=action_type,
                        description=description,
                        level="success" if scheduled_reel.status == "published" else "info",
                        action_metadata={
                            "schedule_id": scheduled_reel.schedule_id,
                            "reel_id": scheduled_reel.reel_id,
                            "brand": brand,
                            "content_type": content_kind,
                            "status": scheduled_reel.status,
                            "created_by": scheduled_reel.created_by or "user",
                            "success_platforms": success_platforms,
                            "failed_platforms": failed_platforms,
                            "publish_results": publish_results or {},
                        },
                        created_at=datetime.now(timezone.utc),
                    ))
                except Exception as log_err:
                    print(f"⚠️ Failed to write publish activity log for {schedule_id}: {log_err}")
                
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
                
                # Sync status back to generation_jobs.brand_outputs
                metadata = scheduled_reel.extra_data or {}
                self._sync_brand_output_status(db, metadata, "failed")

                # Log failed publish events so users can diagnose what happened.
                try:
                    from app.models.toby import TobyActivityLog

                    brand = metadata.get("brand")
                    variant = metadata.get("variant")
                    content_kind = "post" if variant == "post" else "reel"
                    description = (
                        f"Failed to publish {content_kind}"
                        f"{f' for {brand}' if brand else ''}: {error}"
                    )

                    db.add(TobyActivityLog(
                        user_id=scheduled_reel.user_id,
                        action_type="publish_failed",
                        description=description,
                        level="error",
                        action_metadata={
                            "schedule_id": scheduled_reel.schedule_id,
                            "reel_id": scheduled_reel.reel_id,
                            "brand": brand,
                            "content_type": content_kind,
                            "status": "failed",
                            "created_by": scheduled_reel.created_by or "user",
                            "error": error,
                        },
                        created_at=datetime.now(timezone.utc),
                    ))
                except Exception as log_err:
                    print(f"⚠️ Failed to write publish failure activity log for {schedule_id}: {log_err}")
                
                db.commit()
    
    @staticmethod
    def _sync_brand_output_status(db, metadata: dict, new_status: str) -> None:
        """Sync scheduled_reels status back into generation_jobs.brand_outputs.
        
        This prevents desync where brand_outputs says 'scheduled' but the
        scheduled_reels entry has moved to published/partial/failed.
        """
        from app.models.jobs import GenerationJob
        from sqlalchemy.orm.attributes import flag_modified
        
        job_id = metadata.get("job_id")
        brand = metadata.get("brand")
        if not job_id or not brand:
            return
        
        try:
            job = db.query(GenerationJob).filter(
                GenerationJob.job_id == job_id
            ).first()
            if job and job.brand_outputs and brand in job.brand_outputs:
                job.brand_outputs[brand]["status"] = new_status
                flag_modified(job, "brand_outputs")
        except Exception as e:
            print(f"⚠️ Failed to sync brand_output status for {job_id}/{brand}: {e}")
    
    def reset_stuck_publishing(self, max_age_minutes: int = 10) -> int:
        """
        Reset any posts stuck in 'publishing' status for too long.
        This handles cases where the server crashed during publishing.

        B7 fix: Check if IG API already completed (post_ids exist) before
        resetting — avoids duplicate Instagram posts on crash recovery.

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
                extra = reel.extra_data or {}
                post_ids = extra.get("post_ids", {})

                if post_ids.get("instagram"):
                    # B7: IG API call completed — mark as published, not scheduled
                    reel.status = "published"
                    reel.published_at = reel.published_at or datetime.now(timezone.utc)
                    reel.publish_error = f"Recovered after crash — IG post already live (id: {post_ids['instagram']})"
                    print(f"⚠️ Post {reel.schedule_id} already published to IG — marking as published", flush=True)
                else:
                    # No post_ids — safe to retry
                    reset_count = extra.get("reset_count", 0) + 1
                    extra["reset_count"] = reset_count
                    reel.extra_data = extra

                    if reset_count >= 3:
                        # Escalate to failed after 3 resets
                        reel.status = "failed"
                        reel.publish_error = f"Failed after {reset_count} reset attempts"
                        print(f"❌ Post {reel.schedule_id} failed after {reset_count} reset attempts", flush=True)
                    else:
                        reel.status = "scheduled"
                        reel.publish_error = f"Reset #{reset_count} after stuck in publishing >{max_age_minutes} min"

                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(reel, "extra_data")
                count += 1
            
            if count > 0:
                db.commit()
                print(f"⚠️ Processed {count} stuck publishing post(s)")
            
            return count
    
    def retry_failed(self, schedule_id: str, user_id: Optional[str] = None) -> bool:
        """
        Reset a failed or partial post to 'scheduled' status for retry.
        For partial failures, only retry the failed platforms.
        
        Args:
            schedule_id: ID of the failed/partial schedule
            user_id: Optional user filter for security
            
        Returns:
            True if reset successfully, False if not found or not retriable
        """
        print(f"\n🔄 [RETRY] retry_failed called for schedule_id: {schedule_id}", flush=True)
        
        with get_db_session() as db:
            query = db.query(ScheduledReel).filter(
                ScheduledReel.schedule_id == schedule_id
            )
            if user_id:
                query = query.filter(ScheduledReel.user_id == user_id)
            scheduled_reel = query.first()
            
            if not scheduled_reel:
                print(f"   ❌ [RETRY] Schedule not found: {schedule_id}", flush=True)
                return False
            
            print(f"   📋 [RETRY] Current status: {scheduled_reel.status}", flush=True)
            
            if scheduled_reel.status not in ["failed", "publishing", "partial"]:
                print(f"   ❌ [RETRY] Status '{scheduled_reel.status}' not retriable", flush=True)
                return False
            
            # For partial failures, determine which platforms to retry
            metadata = scheduled_reel.extra_data or {}
            publish_results = metadata.get('publish_results', {})
            
            print(f"   📊 [RETRY] Current metadata keys: {list(metadata.keys())}", flush=True)
            print(f"   📊 [RETRY] publish_results: {publish_results}", flush=True)
            
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
                
                print(f"   📊 [RETRY] Failed platforms: {failed_platforms}", flush=True)
                print(f"   📊 [RETRY] Succeeded platforms: {succeeded_platforms}", flush=True)
                
                if failed_platforms:
                    # Store which platforms to retry (only the failed ones)
                    metadata['retry_platforms'] = failed_platforms
                    # Keep track of which platforms already succeeded (don't retry these)
                    metadata['succeeded_platforms'] = succeeded_platforms
                    # CRITICAL: Force SQLAlchemy to detect the change by creating a new dict
                    scheduled_reel.extra_data = dict(metadata)
                    print(f"🔄 Partial retry: Will retry {failed_platforms}, skip {succeeded_platforms}", flush=True)
                    print(f"   📊 [RETRY] Updated extra_data: {scheduled_reel.extra_data}", flush=True)
                else:
                    # All platforms succeeded? This shouldn't happen for partial status
                    print(f"⚠️ Partial status but no failed platforms found", flush=True)
            else:
                # Full retry - clear any previous retry info
                print(f"   📊 [RETRY] Full retry - clearing retry_platforms", flush=True)
                metadata.pop('retry_platforms', None)
                metadata.pop('succeeded_platforms', None)
                # CRITICAL: Force SQLAlchemy to detect the change
                scheduled_reel.extra_data = dict(metadata)
            
            # Reset to scheduled
            scheduled_reel.status = "scheduled"
            scheduled_reel.publish_error = None
            
            # Update scheduled time to now so it gets picked up immediately
            scheduled_reel.scheduled_time = datetime.now(timezone.utc)
            
            db.commit()
            print(f"🔄 Reset post {schedule_id} for retry")
            return True
    
    def reschedule(self, schedule_id: str, new_time: datetime, user_id: Optional[str] = None) -> bool:
        """
        Reschedule a post to a new date/time.
        
        Args:
            schedule_id: ID of the scheduled post
            new_time: New datetime to schedule for
            user_id: Optional user filter for security
            
        Returns:
            True if rescheduled successfully, False if not found
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

    def auto_retry_failed_toby_posts(self, user_id: str, max_age_hours: int = 24) -> int:
        """
        B8/B9/C4: Auto-retry Toby-created posts that failed due to transient errors.

        Only retries posts created by Toby within the last max_age_hours,
        and only if they haven't been retried too many times.

        Returns number of posts queued for retry.
        """
        TRANSIENT_KEYWORDS = ["timeout", "rate limit", "429", "500", "502", "503",
                              "connection", "temporarily", "unavailable"]
        MAX_AUTO_RETRIES = 3

        with get_db_session() as db:
            from datetime import timedelta
            cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)

            failed = db.query(ScheduledReel).filter(
                ScheduledReel.user_id == user_id,
                ScheduledReel.status.in_(["failed", "partial"]),
                ScheduledReel.scheduled_time >= cutoff,
            ).all()

            retried = 0
            for reel in failed:
                extra = reel.extra_data or {}
                # Only retry Toby-created content
                if extra.get("created_by") != "toby" and not hasattr(reel, 'created_by'):
                    continue
                if hasattr(reel, 'created_by') and reel.created_by != "toby":
                    continue

                # Check retry count
                auto_retries = extra.get("auto_retry_count", 0)
                if auto_retries >= MAX_AUTO_RETRIES:
                    continue

                # Check if error is transient
                error = (reel.publish_error or "").lower()
                is_transient = any(kw in error for kw in TRANSIENT_KEYWORDS)

                # For partial failures, always retry
                if reel.status == "partial":
                    is_transient = True

                if not is_transient:
                    continue

                # Increment auto_retry_count and queue for retry
                extra["auto_retry_count"] = auto_retries + 1
                reel.extra_data = extra
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(reel, "extra_data")

                reel.status = "scheduled"
                reel.publish_error = None
                # Keep the ORIGINAL scheduled_time for the slot — changing it
                # causes the original slot to look empty, triggering duplicate
                # content generation by Toby's buffer manager.
                # Only set to now+5min if the original time is in the past.
                if reel.scheduled_time < datetime.now(timezone.utc):
                    reel.scheduled_time = datetime.now(timezone.utc) + timedelta(minutes=5)
                retried += 1

                print(f"[TOBY] Auto-retry #{auto_retries + 1} for {reel.schedule_id}", flush=True)

            if retried > 0:
                db.commit()

            return retried
    
    def publish_scheduled_now(self, schedule_id: str, user_id: Optional[str] = None) -> bool:
        """
        Set a scheduled post to publish immediately.
        Updates scheduled_time to now so the auto-publisher picks it up.
        
        Args:
            schedule_id: ID of the scheduled post
            user_id: Optional user filter for security
            
        Returns:
            True if updated successfully, False if not found
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
        video_url: str,
        thumbnail_url: str,
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
            video_url: Supabase public URL for the video
            thumbnail_url: Supabase public URL for the thumbnail
            caption: Caption for the post
            platforms: List of platforms
            user_id: User ID to use credentials from
            metadata: Optional metadata dict containing yt_title, yt_thumbnail_path, etc.
            brand_config: Brand configuration with specific credentials
            brand_name: Brand name string (e.g., 'gymcollege', 'healthycollege')
            
        Returns:
            Publishing results
        """
        from app.services.publishing.social_publisher import SocialPublisher
        from app.services.brands.resolver import brand_resolver
        
        # Priority: brand_config > brand_name > user_id > default
        publisher = None
        _skip_facebook = False  # FB not configured → graceful skip, not a credential error
        
        if brand_config:
            # Use brand-specific credentials
            print(f"🏷️ Using provided brand_config: {brand_config.name}")
            publisher = SocialPublisher(brand_config=brand_config)
        elif brand_name:
            # Look up brand config by name
            print(f"🏷️ Looking up brand config for: {brand_name}")
            
            resolved_config = brand_resolver.get_brand_config(brand_name)
            if resolved_config:
                print(f"   ✅ Found brand config: {resolved_config.name}")
                print(f"   📸 Instagram Account ID: {resolved_config.instagram_business_account_id}")
                print(f"   📘 Facebook Page ID: {resolved_config.facebook_page_id}")
                
                # Validate credentials only for the platforms being published to (avoid error)
                if "instagram" in platforms and not resolved_config.instagram_business_account_id:
                    error_msg = f"CRITICAL: Brand '{brand_name}' has no Instagram Business Account ID configured! Cannot publish."
                    print(f"   ❌ {error_msg}")
                    return {
                        "instagram": {"success": False, "error": error_msg, "platform": "instagram"},
                        "credential_error": True,
                        "brand": brand_name
                    }
                
                if "facebook" in platforms and not resolved_config.facebook_page_id:
                    _skip_facebook = True
                    print(f"   ⚠️  Facebook not configured for '{brand_name}' — will skip gracefully (not a credential error)")
                
                publisher = SocialPublisher(brand_config=resolved_config)
            else:
                error_msg = f"CRITICAL: Brand '{brand_name}' not found in DB! Cannot publish to unknown brand."
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
        
        print(f"🎬 Video URL: {video_url}")
        print(f"🖼️  Thumbnail URL: {thumbnail_url}")
        
        # Pre-filter: skip Facebook if page_id not configured (not an error)
        # Pre-filter: skip YouTube if credentials don't exist (not an error)
        effective_platforms = list(platforms)
        if _skip_facebook and "facebook" in effective_platforms:
            effective_platforms.remove("facebook")
            print(f"📘 Facebook not configured for {brand_name} — skipping (not an error)")
        if "youtube" in effective_platforms:
            from app.services.youtube.publisher import get_youtube_credentials_for_brand
            try:
                with get_db_session() as db:
                    yt_creds = get_youtube_credentials_for_brand(brand_name, db) if brand_name else None
                if not yt_creds:
                    effective_platforms.remove("youtube")
                    print(f"📺 YouTube not configured for {brand_name or 'unknown'} — skipping (not an error)")
            except Exception:
                effective_platforms.remove("youtube")
                print(f"📺 YouTube credential check failed — skipping")
        
        results = {}
        
        # Add not_connected result for Facebook so UI can show amber ⚠ warning
        if _skip_facebook:
            results["facebook"] = {
                "success": False,
                "not_connected": True,
                "error": "Facebook not configured for this brand",
                "platform": "facebook",
            }
        
        if "instagram" in effective_platforms:
            # Proactively refresh the token if stale (>6h since last refresh or expiring soon)
            if brand_name:
                fresh_token = _proactive_refresh_ig_token(brand_name)
                if fresh_token and hasattr(publisher, 'ig_access_token'):
                    publisher.ig_access_token = fresh_token
            print("📸 Publishing to Instagram...")
            results["instagram"] = publisher.publish_instagram_reel(
                video_url=video_url,
                caption=caption,
                thumbnail_url=thumbnail_url
            )
        
        if "facebook" in effective_platforms:
            print("📘 Publishing to Facebook...")
            results["facebook"] = publisher.publish_facebook_reel(
                video_url=video_url,
                caption=caption,
                thumbnail_url=thumbnail_url
            )
        
        if "youtube" in effective_platforms:
            print("📺 Publishing to YouTube...", flush=True)
            
            # Get yt_title from metadata if available
            yt_title = metadata.get("yt_title") if metadata else None
            # Get yt_thumbnail_path from metadata - clean AI image without text
            yt_thumbnail_url = metadata.get("yt_thumbnail_path") if metadata else None
            if not yt_thumbnail_url:
                yt_thumbnail_url = thumbnail_url
            
            results["youtube"] = self._publish_to_youtube(
                video_url=video_url,
                thumbnail_url=yt_thumbnail_url,
                caption=caption,
                brand_name=brand_name,
                yt_title=yt_title
            )
        
        return results
    
    def _publish_to_youtube(
        self,
        video_url: str,
        thumbnail_url: str,
        caption: str,
        brand_name: Optional[str] = None,
        yt_title: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Publish a video to YouTube as a Short.
        Downloads video and thumbnail from Supabase URLs to temp files,
        uploads to YouTube, then cleans up.
        
        Args:
            video_url: Supabase public URL for the video
            thumbnail_url: Supabase public URL for the thumbnail
            caption: Caption/description for the video
            brand_name: Brand name for loading credentials
            yt_title: YouTube-optimized title (searchable, clickable)
            
        Returns:
            Publishing result dict
        """
        from app.services.youtube.publisher import get_youtube_credentials_for_brand, update_youtube_channel_status
        from app.services.youtube.publisher import YouTubePublisher
        from datetime import datetime
        import tempfile
        import requests as _requests
        
        print(f"\n📺 [YT PUBLISH] _publish_to_youtube() called", flush=True)
        print(f"   📺 [YT PUBLISH] video_url: {video_url}", flush=True)
        print(f"   📺 [YT PUBLISH] thumbnail_url: {thumbnail_url}", flush=True)
        print(f"   📺 [YT PUBLISH] brand_name: {brand_name}", flush=True)
        print(f"   📺 [YT PUBLISH] yt_title: {yt_title}", flush=True)
        
        if not brand_name:
            print(f"   ❌ [YT PUBLISH] No brand_name provided!", flush=True)
            return {"success": False, "error": "Brand name required for YouTube publishing"}
        
        # Download video from Supabase to temp file
        tmp_video = None
        tmp_thumb = None
        try:
            print(f"   📺 [YT PUBLISH] Downloading video from Supabase...", flush=True)
            resp = _requests.get(video_url, timeout=120)
            resp.raise_for_status()
            tmp_video = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            tmp_video.write(resp.content)
            tmp_video.close()
            print(f"   ✅ [YT PUBLISH] Video downloaded to {tmp_video.name} ({len(resp.content)} bytes)", flush=True)
            
            # Download thumbnail
            print(f"   📺 [YT PUBLISH] Downloading thumbnail from Supabase...", flush=True)
            resp_thumb = _requests.get(thumbnail_url, timeout=60)
            resp_thumb.raise_for_status()
            tmp_thumb = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            tmp_thumb.write(resp_thumb.content)
            tmp_thumb.close()
            print(f"   ✅ [YT PUBLISH] Thumbnail downloaded to {tmp_thumb.name}", flush=True)
        except Exception as dl_err:
            print(f"   ❌ [YT PUBLISH] Download failed: {dl_err}", flush=True)
            # Clean up any temp files created
            for f in [tmp_video, tmp_thumb]:
                if f:
                    try:
                        os.unlink(f.name)
                    except Exception:
                        pass
            return {"success": False, "error": f"Failed to download media from Supabase: {dl_err}"}
        
        try:
            # Get credentials for this brand from database
            print(f"   📺 [YT PUBLISH] Getting credentials from database for brand: {brand_name}", flush=True)
            with get_db_session() as db:
                credentials = get_youtube_credentials_for_brand(brand_name, db)
                
                if not credentials:
                    print(f"   ❌ [YT PUBLISH] No credentials found for {brand_name}!", flush=True)
                    return {"success": False, "error": f"YouTube not configured for {brand_name}. Click 'Connect YouTube' in the app."}
                
                print(f"   ✅ [YT PUBLISH] Credentials found: channel_id={credentials.channel_id}, channel_name={credentials.channel_name}", flush=True)
                print(f"   📺 [YT PUBLISH] refresh_token present: {bool(credentials.refresh_token)}", flush=True)
                
                yt_publisher = YouTubePublisher(credentials=credentials)
                
                # Use provided yt_title or extract from caption as fallback
                if yt_title:
                    title = yt_title[:100]
                    print(f"   📺 [YT PUBLISH] Using stored YouTube title: {title}", flush=True)
                else:
                    lines = caption.split('\n')
                    title = lines[0][:100] if lines else "Health & Wellness Tips"
                    print(f"   📺 [YT PUBLISH] Using fallback title from caption: {title}", flush=True)
                
                print(f"   📺 [YT PUBLISH] Calling upload_youtube_short()...", flush=True)
                print(f"      video_path={tmp_video.name}", flush=True)
                print(f"      title={title}", flush=True)
                print(f"      thumbnail_path={tmp_thumb.name}", flush=True)
                
                # Save original refresh token so we can detect rotation after upload
                original_refresh_token = credentials.refresh_token
                
                result = yt_publisher.upload_youtube_short(
                    video_path=tmp_video.name,
                    title=title,
                    description=caption,
                    thumbnail_path=tmp_thumb.name
                )
            
                print(f"   📺 [YT PUBLISH] upload_youtube_short result: {result}", flush=True)
                
                # Google may have rotated the refresh token during upload — persist it!
                if credentials.refresh_token != original_refresh_token:
                    yt_channel = db.query(YouTubeChannel).filter(YouTubeChannel.brand == brand_name.lower()).first()
                    if yt_channel:
                        yt_channel.refresh_token = credentials.refresh_token
                        print(f"   🔄 [YT PUBLISH] Refresh token rotated during upload — saved to DB", flush=True)
                
                # Log thumbnail status specifically
                if result.get("success"):
                    if result.get("thumbnail_set"):
                        print(f"   ✅ [YT PUBLISH] Custom thumbnail applied successfully!", flush=True)
                    else:
                        thumb_err = result.get("thumbnail_error", "unknown")
                        print(f"   ⚠️ [YT PUBLISH] Video uploaded but THUMBNAIL FAILED: {thumb_err}", flush=True)
                
                # Update channel status in database
                if result.get("success"):
                    update_youtube_channel_status(
                        brand=brand_name,
                        db=db,
                        last_upload_at=datetime.utcnow()
                    )
                else:
                    error_msg = result.get("error", "Unknown error")
                    error_lower = error_msg.lower()
                    # Only mark as revoked for definitive auth failures, NOT quota/rate limits
                    is_revoked = (
                        "invalid_grant" in error_lower
                        or "token has been expired or revoked" in error_lower
                        or "token has been revoked" in error_lower
                    )
                    # 403 with quota keywords is NOT a revocation
                    is_quota = (
                        "quota" in error_lower
                        or "rateLimitExceeded" in error_msg
                        or "dailyLimitExceeded" in error_msg
                        or "uploadLimitExceeded" in error_msg
                    )
                    if is_revoked and not is_quota:
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
        finally:
            # Clean up temp files
            for f in [tmp_video, tmp_thumb]:
                if f:
                    try:
                        os.unlink(f.name)
                    except Exception:
                        pass

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
        reference_date: Optional[datetime] = None,
        user_id: str | None = None,
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
        
        # Base slot pattern (every 4 hours, alternating L/D/L/D/L/D)
        BASE_SLOTS = [
            (0, "light"),   # 12 AM - Light
            (4, "dark"),    # 4 AM - Dark
            (8, "light"),   # 8 AM - Light
            (12, "dark"),   # 12 PM - Dark
            (16, "light"),  # 4 PM - Light
            (20, "dark"),   # 8 PM - Dark
        ]
        
        # Get brand offset from database
        brand_lower = brand.lower()
        offset = 0
        with get_db_session() as db:
            from app.models import Brand as BrandModel
            db_brand = db.query(BrandModel).filter(BrandModel.id == brand_lower).first()
            if db_brand:
                offset = db_brand.schedule_offset or 0
        
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
            sched_query = db.query(ScheduledReel).filter(
                and_(
                    ScheduledReel.status.in_(["scheduled", "publishing"]),
                    ScheduledReel.scheduled_time >= start_date
                )
            )
            if user_id:
                sched_query = sched_query.filter(ScheduledReel.user_id == user_id)
            schedules = sched_query.all()
            
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
            variant: "light", "dark", or "post"
            
        Returns:
            Dict mapping brand name to next available slot datetime
        """
        result = {}
        for brand in brands:
            if variant == "post":
                result[brand] = self.get_next_available_post_slot(brand)
            else:
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
                
                brand_match = self._brands_match(brand, schedule_brand)
                
                if brand_match and schedule_variant == variant:
                    occupied.append(schedule.scheduled_time)
            
            return sorted(occupied)
    def get_next_available_post_slot(
        self,
        brand: str,
        reference_date: Optional[datetime] = None,
        user_id: str | None = None,
    ) -> datetime:
        """
        Get the next available scheduling slot for a POST (image/carousel) for a brand.

        POST SCHEDULING RULES:
        ======================
        Posts get 2 slots per day — one morning, one afternoon:
        - Morning base: 8 AM
        - Afternoon base: 14 (2 PM)

        Brands use 1-hour stagger offsets so no two brands ever publish
        at exactly the same time:
          Holistic  → 8:00 / 14:00
          Healthy   → 9:00 / 15:00
          Vitality  → 10:00 / 16:00
          Longevity → 11:00 / 17:00
          Wellbeing → 12:00 / 18:00
        """
        from datetime import timedelta

        # Post base slots: 2 per day — morning + afternoon
        BASE_POST_SLOTS = [8, 14]

        # Get brand offset from database
        brand_lower = brand.lower()
        offset = 0
        with get_db_session() as db:
            from app.models import Brand as BrandModel
            db_brand = db.query(BrandModel).filter(BrandModel.id == brand_lower).first()
            if db_brand:
                offset = db_brand.schedule_offset or 0

        # Apply brand offset and wrap around 24h
        brand_post_slots = sorted([(hour + offset) % 24 for hour in BASE_POST_SLOTS])

        # Starting reference
        start_date = datetime(2026, 1, 16, tzinfo=timezone.utc)
        now = reference_date or datetime.now(timezone.utc)
        base_date = max(start_date, now)

        # Get all scheduled posts for this brand with variant="post"
        with get_db_session() as db:
            sched_query = db.query(ScheduledReel).filter(
                and_(
                    ScheduledReel.status.in_(["scheduled", "publishing"]),
                    ScheduledReel.scheduled_time >= start_date
                )
            )
            if user_id:
                sched_query = sched_query.filter(ScheduledReel.user_id == user_id)
            schedules = sched_query.all()

            occupied_slots = set()
            for schedule in schedules:
                metadata = schedule.extra_data or {}
                schedule_brand = metadata.get("brand", "").lower()
                schedule_variant = metadata.get("variant", "")

                if schedule_brand == brand_lower and schedule_variant == "post":
                    ts = schedule.scheduled_time
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    occupied_slots.add(ts.timestamp())

        # Find next available slot
        current_day = base_date.replace(hour=0, minute=0, second=0, microsecond=0)

        for day_offset in range(365):
            check_date = current_day + timedelta(days=day_offset)

            for hour in brand_post_slots:
                candidate = check_date.replace(hour=hour, minute=0, second=0, microsecond=0)

                if candidate <= now:
                    continue

                if candidate.timestamp() not in occupied_slots:
                    print(f"📅 Found next POST slot for {brand}: {candidate.isoformat()}")
                    return candidate

        # Fallback
        tomorrow = now + timedelta(days=1)
        return tomorrow.replace(hour=brand_post_slots[0], minute=0, second=0, microsecond=0)