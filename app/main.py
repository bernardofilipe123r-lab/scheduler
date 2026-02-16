"""
Main FastAPI application for the reels automation service.
"""
import os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from apscheduler.schedulers.background import BackgroundScheduler
from app.api.routes import router as reels_router
from app.api.content.jobs_routes import router as jobs_router
from app.api.youtube.routes import router as youtube_router
from app.api.brands.routes import router as brands_router
from app.api.system.settings_routes import router as settings_router
from app.api.analytics.routes import router as analytics_router
from app.api.system.logs_routes import router as logs_router
from app.api.auth.routes import router as auth_router
from app.api.content.prompts_routes import router as prompts_router
from app.api.system.ai_logs_routes import router as ai_logs_router
from app.api.system.health_routes import router as health_router
from app.api.maestro.routes import router as maestro_router
from app.api.agents.routes import router as agents_router
from app.api.ai_team.routes import router as ai_team_router
from app.services.publishing.scheduler import DatabaseSchedulerService
from app.services.logging.service import get_logging_service, DEPLOYMENT_ID
from app.services.logging.middleware import RequestLoggingMiddleware
from app.db_connection import init_db

# Load environment variables from .env file
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

# Frontend build directory (at project root /dist)
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "dist"

# Create FastAPI application
app = FastAPI(
    title="Instagram Reels Automation API",
    description="""
    Production-ready backend system for automatically generating Instagram Reels 
    from structured text input.
    
    ## Features
    
    * 📸 Generate thumbnail images
    * 🎨 Create branded reel images with automatic text layout
    * 🎬 Produce 7-second MP4 videos with background music
    * ✍️ Build formatted captions with hashtags
    * ⏰ Schedule reels for future publishing
    
    ## Workflow
    
    1. Send a POST request to `/reels/create` with your content
    2. The system generates thumbnail, reel image, and video
    3. Optionally schedule the reel for future publishing
    4. Integrate with Meta Graph API for actual Instagram posting (placeholder provided)
    """,
    version="1.0.0",
    contact={
        "name": "The Gym College",
        "url": "https://thegymcollege.com",
    },
    license_info={
        "name": "Proprietary",
    }
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add request logging middleware (captures ALL HTTP requests/responses with full detail)
app.add_middleware(RequestLoggingMiddleware)

# Include API routers
app.include_router(reels_router)
app.include_router(jobs_router)
app.include_router(youtube_router, prefix="/api")
app.include_router(brands_router, prefix="/api")  # Backward-compatible mount
app.include_router(brands_router, prefix="/api/v2")  # V2 mount
app.include_router(settings_router, prefix="/api")  # Settings management
app.include_router(analytics_router, prefix="/api")
app.include_router(logs_router)  # Logs dashboard at /logs and API at /api/logs
app.include_router(auth_router)  # Authentication endpoints
app.include_router(prompts_router)  # Prompt transparency / testing
app.include_router(ai_logs_router)  # AI logs at /ai-logs, /maestro-logs, /ai-about
app.include_router(health_router)  # Deep health check at /api/system/health-check
app.include_router(maestro_router)  # Maestro orchestrator (Toby + Lexi)
app.include_router(agents_router)  # Dynamic AI agents CRUD at /api/agents
app.include_router(ai_team_router)  # AI Team dashboard at /api/ai-team

# Mount static files - use absolute path for Railway volume support
# The output directory is at /app/output when running in Docker
output_dir = Path("/app/output") if Path("/app/output").exists() else Path("output")
output_dir.mkdir(parents=True, exist_ok=True)
(output_dir / "videos").mkdir(exist_ok=True)
(output_dir / "thumbnails").mkdir(exist_ok=True)
(output_dir / "posts").mkdir(exist_ok=True)
print(f"📁 Static files directory: {output_dir.absolute()}")
app.mount("/output", StaticFiles(directory=str(output_dir)), name="output")

# Mount brand logos directory for theme customization - use persistent volume
brand_data_dir = output_dir / "brand-data"
brand_data_dir.mkdir(parents=True, exist_ok=True)
logos_dir = brand_data_dir / "logos"
logos_dir.mkdir(parents=True, exist_ok=True)
print(f"🎨 Brand logos directory: {logos_dir.absolute()}")
app.mount("/brand-logos", StaticFiles(directory=str(logos_dir)), name="brand-logos")


# Serve React frontend (SPA catch-all)
if FRONTEND_DIR.exists():
    print(f"⚛️ React frontend: {FRONTEND_DIR}")
    
    # Mount React assets
    if (FRONTEND_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="react-assets")
    
    @app.get("/", tags=["frontend"])
    async def serve_root():
        """Serve React app."""
        return FileResponse(FRONTEND_DIR / "index.html")
    
    @app.get("/{full_path:path}", tags=["frontend"])
    async def serve_spa(full_path: str):
        """Catch-all: serve React app for any non-API route (SPA client-side routing)."""
        return FileResponse(FRONTEND_DIR / "index.html")
else:
    print(f"⚠️ React frontend not found at {FRONTEND_DIR}. Run 'npm run build' to build.")
    
    @app.get("/", tags=["frontend"])
    async def serve_root():
        """Placeholder when frontend not built."""
        return {"message": "Frontend not built. Run 'npm run build' from project root."}


@app.get("/health", tags=["system"])
async def health_check():
    """Simple health check endpoint for Railway."""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.on_event("startup")
async def startup_event():
    """Run startup tasks."""
    import sys
    
    # Initialize persistent logging service FIRST (captures everything from here on)
    logging_service = get_logging_service()
    logging_service.log_system_event(
        'startup', 
        f'Application starting - Deployment: {DEPLOYMENT_ID}',
        details={
            'python_version': sys.version,
            'port': os.getenv('PORT', 'not set'),
            'deployment_id': DEPLOYMENT_ID,
            'database_url': 'set' if os.getenv('DATABASE_URL') else 'NOT SET',
        }
    )
    
    print("🚀 Starting Instagram Reels Automation API...", flush=True)
    print(f"📍 Python: {sys.version}", flush=True)
    print(f"📍 PORT: {os.getenv('PORT', 'not set')}", flush=True)
    print(f"📍 Deployment: {DEPLOYMENT_ID}", flush=True)
    print("📝 Documentation available at: /docs", flush=True)
    print("🔍 Health check available at: /health", flush=True)
    print("📋 Logs dashboard available at: /logs", flush=True)
    
    # Initialize database
    print("💾 Initializing database...", flush=True)
    try:
        init_db()
        print("✅ Database initialized", flush=True)
        
        # Seed brands and settings if needed
        print("🌱 Checking for brand/settings seeds...", flush=True)
        from app.db_connection import SessionLocal
        from app.services.brands.manager import seed_brands_if_needed
        from app.api.system.settings_routes import seed_settings_if_needed
        
        db = SessionLocal()
        try:
            default_user_id = os.getenv("DEFAULT_USER_ID")
            brands_seeded = seed_brands_if_needed(db, user_id=default_user_id)
            settings_seeded = seed_settings_if_needed(db)
            
            if brands_seeded > 0:
                print(f"   🏷️ Seeded {brands_seeded} default brands", flush=True)
            else:
                print(f"   🏷️ Brands already exist", flush=True)
            
            if settings_seeded > 0:
                print(f"   ⚙️ Seeded {settings_seeded} default settings", flush=True)
            else:
                print(f"   ⚙️ Settings already exist", flush=True)

            # Seed builtin AI agents (Toby + Lexi)
            from app.services.agents.generic_agent import seed_builtin_agents
            seed_builtin_agents()
        finally:
            db.close()
        
    except Exception as e:
        print(f"❌ Database init failed: {e}", flush=True)
        # Continue anyway - don't block startup
    
    # Log brand credentials status at startup (CRITICAL for debugging cross-posting)
    print("\n🏷️ Brand Credentials Status:", flush=True)
    from app.services.brands.resolver import brand_resolver
    for brand in brand_resolver.get_all_brands():
        ig_status = "✅" if brand.instagram_business_account_id else "❌ MISSING"
        fb_status = "✅" if brand.facebook_page_id else "❌ MISSING"
        token_status = "✅" if brand.meta_access_token else "❌ MISSING"
        print(f"   {brand.display_name}:", flush=True)
        print(f"      Instagram ID: {ig_status} ({brand.instagram_business_account_id or 'None'})", flush=True)
        print(f"      Facebook ID:  {fb_status} ({brand.facebook_page_id or 'None'})", flush=True)
        print(f"      Token:        {token_status}", flush=True)
    print("", flush=True)
    
    # Reset any stuck "publishing" posts from previous crashes
    print("🔄 Checking for stuck publishing posts...", flush=True)
    try:
        from app.services.publishing.scheduler import DatabaseSchedulerService
        scheduler_service = DatabaseSchedulerService()
        reset_count = scheduler_service.reset_stuck_publishing(max_age_minutes=10)
        if reset_count > 0:
            print(f"⚠️ Reset {reset_count} stuck post(s) from previous run", flush=True)
    except Exception as e:
        print(f"⚠️ Could not check stuck posts: {e}", flush=True)
    
    # Initialize auto-publishing scheduler
    print("⏰ Starting auto-publishing scheduler...")
    scheduler = BackgroundScheduler()
    
    def check_and_publish():
        """Check for due posts and publish them."""
        try:
            from datetime import datetime
            print(f"\n⏰ Auto-publish check running at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} (local time)")
            
            # Get service instance
            scheduler_service = DatabaseSchedulerService()
            
            # Get pending publications
            pending = scheduler_service.get_pending_publications()
            
            if pending:
                print(f"\n📅 Found {len(pending)} post(s) ready to publish")
                
                for schedule in pending:
                    try:
                        schedule_id = schedule['schedule_id']
                        reel_id = schedule['reel_id']
                        caption = schedule.get('caption', 'CHANGE ME')
                        metadata = schedule.get('metadata', {})
                        
                        print(f"\n   📋 [PUBLISH] Processing schedule: {schedule_id}", flush=True)
                        print(f"   📋 [PUBLISH] Metadata keys: {list(metadata.keys())}", flush=True)
                        
                        # Check for retry_platforms (partial retry) or use original platforms
                        retry_platforms = metadata.get('retry_platforms')
                        succeeded_platforms = metadata.get('succeeded_platforms', [])
                        
                        print(f"   📋 [PUBLISH] retry_platforms from metadata: {retry_platforms}", flush=True)
                        print(f"   📋 [PUBLISH] succeeded_platforms from metadata: {succeeded_platforms}", flush=True)
                        
                        if retry_platforms:
                            platforms = retry_platforms
                            print(f"   🔄 PARTIAL RETRY: Only retrying {platforms} (skipping already successful: {succeeded_platforms})", flush=True)
                        else:
                            platforms = metadata.get('platforms', ['instagram'])
                            print(f"   📋 [PUBLISH] Using platforms from metadata: {platforms}", flush=True)
                        
                        # ── Normalize output paths ──
                        # brand_outputs stores paths like /output/videos/... but
                        # the Docker WORKDIR is /app, so files live at /app/output/...
                        def _resolve_output_path(raw: str | None) -> str | None:
                            if not raw:
                                return None
                            clean = raw.strip()
                            # Strip cache-bust query params (e.g. ?t=12345)
                            clean = clean.split('?')[0] if '?' in clean else clean
                            # Normalize: strip all leading /app or app/ segments
                            # to prevent /app/app/... doubling
                            clean = clean.lstrip('/')
                            while clean.startswith('app/'):
                                clean = clean[4:]
                            # clean is now relative like 'output/posts/...'
                            return f'/app/{clean}'

                        # Get paths from metadata or use defaults
                        video_path_str = _resolve_output_path(metadata.get('video_path'))
                        thumbnail_path_str = _resolve_output_path(metadata.get('thumbnail_path'))
                        brand = metadata.get('brand', '')
                        variant = metadata.get('variant', 'light')
                        
                        print(f"      📦 Metadata: video={video_path_str}, thumbnail={thumbnail_path_str}, brand={brand}, variant={variant}")
                        
                        # ── POST (image) vs REEL (video) publishing ──
                        is_post = (variant == 'post')
                        
                        if is_post:
                            # ── IMAGE POST PUBLISHING ──
                            # thumbnail_path_str is already absolute from _resolve_output_path
                            if thumbnail_path_str:
                                image_path = Path(thumbnail_path_str)
                            else:
                                # Try common post paths
                                image_path = Path(f"/app/output/posts/{reel_id}_background.png")
                                if not image_path.exists():
                                    image_path = Path(f"/app/output/posts/{reel_id}.png")
                            
                            print(f"      🖼️  Image post: {image_path} (exists: {image_path.exists()})")
                            
                            if not image_path.exists():
                                raise FileNotFoundError(f"Post image not found: {image_path}")
                            
                            # Cover slide was already composed during scheduling — no re-composition
                            
                            # Build public URL base
                            railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
                            if railway_domain:
                                public_url_base = f"https://{railway_domain}"
                            else:
                                public_url_base = os.getenv("PUBLIC_URL_BASE", "")
                            
                            # Cover image URL
                            image_url = f"{public_url_base}/output/posts/{image_path.name}"
                            
                            print(f"      🌐 Cover image URL: {image_url}")
                            print(f"      🏷️ Publishing IMAGE POST with brand: {brand}")
                            
                            # Resolve brand credentials
                            from app.services.publishing.social_publisher import SocialPublisher
                            from app.services.brands.resolver import brand_resolver
                            
                            publisher = None
                            resolved_config = brand_resolver.get_brand_config(brand)
                            if resolved_config:
                                publisher = SocialPublisher(brand_config=resolved_config)
                            else:
                                publisher = SocialPublisher()
                            
                            # Check for carousel slides
                            carousel_paths_raw = metadata.get('carousel_paths') or []
                            carousel_image_urls = []
                            for cp in carousel_paths_raw:
                                cp_abs = _resolve_output_path(cp)
                                if cp_abs and Path(cp_abs).exists():
                                    carousel_image_urls.append(
                                        f"{public_url_base}/output/posts/{Path(cp_abs).name}"
                                    )
                                else:
                                    print(f"      ⚠️ Carousel slide not found: {cp} → {cp_abs}")
                            
                            result = {}
                            if carousel_image_urls:
                                # ── CAROUSEL PUBLISH (cover + text slides) ──
                                all_urls = [image_url] + carousel_image_urls
                                print(f"      📚 Carousel with {len(all_urls)} slides")
                                
                                if "instagram" in platforms:
                                    print("📸 Publishing carousel to Instagram...")
                                    result["instagram"] = publisher.publish_instagram_carousel(
                                        image_urls=all_urls,
                                        caption=caption,
                                    )
                                if "facebook" in platforms:
                                    print("📘 Publishing carousel to Facebook...")
                                    result["facebook"] = publisher.publish_facebook_carousel(
                                        image_urls=all_urls,
                                        caption=caption,
                                    )
                            else:
                                # ── SINGLE IMAGE PUBLISH ──
                                if "instagram" in platforms:
                                    print("📸 Publishing image post to Instagram...")
                                    result["instagram"] = publisher.publish_instagram_image_post(
                                        image_url=image_url,
                                        caption=caption,
                                    )
                                if "facebook" in platforms:
                                    print("📘 Publishing image post to Facebook...")
                                    result["facebook"] = publisher.publish_facebook_image_post(
                                        image_url=image_url,
                                        caption=caption,
                                    )
                        else:
                            # ── REEL (VIDEO) PUBLISHING ──
                            # If paths stored in metadata, use those
                            if video_path_str:
                                video_path = Path(video_path_str)
                                if not video_path.is_absolute():
                                    video_path = Path("/app") / video_path.as_posix().lstrip('/')
                            else:
                                # Try with _video suffix first (new naming), then without
                                video_path = Path(f"/app/output/videos/{reel_id}_video.mp4")
                                if not video_path.exists():
                                    video_path = Path(f"/app/output/videos/{reel_id}.mp4")
                            
                            if thumbnail_path_str:
                                thumbnail_path = Path(thumbnail_path_str)
                                if not thumbnail_path.is_absolute():
                                    thumbnail_path = Path("/app") / thumbnail_path.as_posix().lstrip('/')
                            else:
                                # Try with _thumbnail suffix first, then without
                                thumbnail_path = Path(f"/app/output/thumbnails/{reel_id}_thumbnail.png")
                                if not thumbnail_path.exists():
                                    thumbnail_path = Path(f"/app/output/thumbnails/{reel_id}.png")
                                if not thumbnail_path.exists():
                                    thumbnail_path = Path(f"/app/output/thumbnails/{reel_id}.jpg")
                            
                            print(f"      🎬 Video: {video_path} (exists: {video_path.exists()})")
                            print(f"      🖼️  Thumbnail: {thumbnail_path} (exists: {thumbnail_path.exists()})")
                            
                            if not video_path.exists():
                                raise FileNotFoundError(f"Video not found: {video_path}")
                            if not thumbnail_path.exists():
                                raise FileNotFoundError(f"Thumbnail not found: {thumbnail_path}")
                            
                            # Publish now - CRITICAL: pass brand name for correct credentials!
                            print(f"      🏷️ Publishing REEL with brand: {brand}")
                            result = scheduler_service.publish_now(
                                video_path=video_path,
                                thumbnail_path=thumbnail_path,
                                caption=caption,
                                platforms=platforms,
                                brand_name=brand,
                                metadata=metadata
                            )
                        
                        print(f"      📊 Publish result: {result}")
                        
                        # Check for credential errors first
                        if result.get('credential_error'):
                            error_msg = f"Credential error for brand {result.get('brand', brand)}: Missing Instagram/Facebook IDs"
                            scheduler_service.mark_as_failed(schedule_id, error_msg)
                            print(f"   ❌ {error_msg}")
                            continue
                        
                        # Check if publishing actually succeeded
                        failed_platforms = []
                        success_platforms = []
                        
                        for platform, platform_result in result.items():
                            # Skip non-platform keys
                            if platform in ('credential_error', 'brand'):
                                continue
                            # Skip if not a dict (safety check)
                            if not isinstance(platform_result, dict):
                                continue
                            if platform_result.get('success'):
                                success_platforms.append(platform)
                                print(f"      ✅ {platform}: {platform_result.get('post_id', 'Published')}")
                            else:
                                failed_platforms.append(platform)
                                error = platform_result.get('error', 'Unknown error')
                                print(f"      ❌ {platform}: {error}")
                        
                        # Only mark as published if at least one platform succeeded
                        if success_platforms:
                            # Collect detailed publish results for storage
                            publish_results = {}
                            
                            # Include previously succeeded platforms from partial retry
                            prev_publish_results = metadata.get('publish_results', {})
                            for platform in succeeded_platforms:
                                if platform in prev_publish_results:
                                    publish_results[platform] = prev_publish_results[platform]
                                    print(f"      ✅ {platform}: (previously succeeded)")
                            
                            # Add newly succeeded platforms
                            for platform in success_platforms:
                                platform_data = result[platform]
                                publish_results[platform] = {
                                    "post_id": str(platform_data.get('post_id') or platform_data.get('video_id', '')),
                                    "account_id": platform_data.get('account_id') or platform_data.get('page_id', ''),
                                    "brand_used": platform_data.get('brand_used', 'unknown'),
                                    "success": True
                                }
                            
                            # Also include failed platforms info
                            for platform in failed_platforms:
                                if platform in result:
                                    publish_results[platform] = {
                                        "success": False,
                                        "error": result[platform].get('error', 'Unknown error')
                                    }
                            
                            # Clear retry tracking since we're updating results
                            if 'retry_platforms' in metadata:
                                del metadata['retry_platforms']
                            if 'succeeded_platforms' in metadata:
                                del metadata['succeeded_platforms']
                            
                            scheduler_service.mark_as_published(schedule_id, publish_results=publish_results)
                            print(f"   ✅ Successfully published {reel_id} to {', '.join(success_platforms)}")
                            
                            if failed_platforms:
                                print(f"   ⚠️  Failed on {', '.join(failed_platforms)}")
                        else:
                            # All platforms failed
                            error_details = ', '.join([f"{p}: {result[p].get('error', 'Unknown')}" for p in failed_platforms])
                            error_msg = f"All platforms failed - {error_details}"
                            scheduler_service.mark_as_failed(schedule_id, error_msg)
                            print(f"   ❌ Failed to publish {reel_id}: {error_msg}")
                        
                    except Exception as e:
                        # Mark as failed
                        error_msg = f"Publishing failed: {str(e)}"
                        scheduler_service.mark_as_failed(schedule_id, error_msg)
                        print(f"   ❌ Failed to publish {reel_id}: {error_msg}")
                        
        except Exception as e:
            print(f"❌ Auto-publish check failed: {str(e)}")
    
    def refresh_analytics():
        """Auto-refresh analytics data every 6 hours."""
        try:
            from app.services.analytics.analytics_service import AnalyticsService
            from app.db_connection import get_db_session
            
            print(f"\n📊 Auto-refresh analytics running at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            
            with get_db_session() as db:
                service = AnalyticsService(db)
                result = service.refresh_all_analytics()
                
                if result["success"]:
                    print(f"   ✅ Analytics refreshed: {result['updated_count']} platforms updated")
                else:
                    print(f"   ⚠️ Analytics refresh had issues: {result.get('errors', [])}")
                    
        except Exception as e:
            print(f"❌ Auto-refresh analytics failed: {str(e)}")
    
    # Run check every 60 seconds
    scheduler.add_job(check_and_publish, 'interval', seconds=60, id='auto_publish')
    
    # Run analytics refresh every 6 hours
    scheduler.add_job(refresh_analytics, 'interval', hours=6, id='analytics_refresh')
    
    # Also run analytics refresh once on startup (after a short delay)
    scheduler.add_job(refresh_analytics, 'date', run_date=datetime.now(), id='analytics_startup')
    
    # Auto-cleanup old logs every 24 hours (keep 7 days of logs)
    def cleanup_old_logs():
        """Cleanup logs older than 7 days to prevent unbounded DB growth."""
        try:
            log_svc = get_logging_service()
            deleted = log_svc.cleanup_old_logs(retention_days=7)
            if deleted > 0:
                print(f"🧹 Cleaned up {deleted} old log entries", flush=True)
        except Exception as e:
            print(f"⚠️ Log cleanup failed: {e}", flush=True)
    
    scheduler.add_job(cleanup_old_logs, 'interval', hours=24, id='log_cleanup')
    
    scheduler.start()
    
    print("✅ Auto-publishing scheduler started (checks every 60 seconds)", flush=True)
    print("✅ Analytics auto-refresh scheduled (every 6 hours)", flush=True)
    print("✅ Log cleanup scheduled (every 24 hours, 7-day retention)", flush=True)
    
    # Store scheduler for shutdown
    app.state.scheduler = scheduler
    
    # ── Start Maestro (orchestrating Toby + Lexi) ──
    print("🎼 Starting Maestro orchestrator...", flush=True)
    try:
        from app.services.maestro.maestro import start_maestro
        maestro = start_maestro()
        app.state.maestro = maestro
        print("✅ Maestro active — orchestrating Toby (Explorer) + Lexi (Optimizer)", flush=True)
    except Exception as e:
        print(f"⚠️ Maestro failed to start: {e}", flush=True)
    
    print("🎉 Startup complete! App is ready.", flush=True)


@app.on_event("shutdown")
async def shutdown_event():
    """Run shutdown tasks."""
    print("👋 Shutting down Instagram Reels Automation API...")
    
    # Log shutdown event
    try:
        logging_service = get_logging_service()
        logging_service.log_system_event('shutdown', 'Application shutting down')
        logging_service.shutdown()
    except Exception:
        pass
    
    # Shutdown scheduler
    if hasattr(app.state, 'scheduler'):
        app.state.scheduler.shutdown()
        print("⏰ Auto-publishing scheduler stopped")
    
    # Shutdown Maestro orchestrator
    if hasattr(app.state, 'maestro') and app.state.maestro:
        try:
            if app.state.maestro.scheduler:
                app.state.maestro.scheduler.shutdown()
            print("🎼 Maestro stopped")
        except Exception:
            pass

