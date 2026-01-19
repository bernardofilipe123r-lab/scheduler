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
from app.api.jobs_routes import router as jobs_router
from app.services.db_scheduler import DatabaseSchedulerService
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
    allow_origins=["*"],  # Configure this appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(reels_router)
app.include_router(jobs_router)

# Mount static files - use absolute path for Railway volume support
# The output directory is at /app/output when running in Docker
output_dir = Path("/app/output") if Path("/app/output").exists() else Path("output")
output_dir.mkdir(parents=True, exist_ok=True)
(output_dir / "videos").mkdir(exist_ok=True)
(output_dir / "thumbnails").mkdir(exist_ok=True)
print(f"📁 Static files directory: {output_dir.absolute()}")
app.mount("/output", StaticFiles(directory=str(output_dir)), name="output")


# Serve React frontend
if FRONTEND_DIR.exists():
    print(f"⚛️ React frontend: {FRONTEND_DIR}")
    
    # Mount React assets
    if (FRONTEND_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="react-assets")
    
    @app.get("/", tags=["frontend"])
    async def serve_root():
        """Serve React app."""
        return FileResponse(FRONTEND_DIR / "index.html")
    
    @app.get("/history", tags=["frontend"])
    async def serve_history():
        """Serve React app for history route."""
        return FileResponse(FRONTEND_DIR / "index.html")
    
    @app.get("/scheduled", tags=["frontend"])
    async def serve_scheduled():
        """Serve React app for scheduled route."""
        return FileResponse(FRONTEND_DIR / "index.html")
    
    @app.get("/test", tags=["frontend"])
    async def serve_test():
        """Serve React app for test route."""
        return FileResponse(FRONTEND_DIR / "index.html")
    
    @app.get("/job/{job_id}", tags=["frontend"])
    async def serve_job_detail(job_id: str):
        """Serve React app for job detail route."""
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
    print("🚀 Starting Instagram Reels Automation API...", flush=True)
    print(f"📍 Python: {sys.version}", flush=True)
    print(f"📍 PORT: {os.getenv('PORT', 'not set')}", flush=True)
    print("📝 Documentation available at: /docs", flush=True)
    print("🔍 Health check available at: /health", flush=True)
    
    # Initialize database
    print("💾 Initializing database...", flush=True)
    try:
        init_db()
        print("✅ Database initialized", flush=True)
    except Exception as e:
        print(f"❌ Database init failed: {e}", flush=True)
        # Continue anyway - don't block startup
    
    # Log brand credentials status at startup (CRITICAL for debugging cross-posting)
    print("\n🏷️ Brand Credentials Status:", flush=True)
    from app.core.config import BRAND_CONFIGS, BrandType
    for brand_type, config in BRAND_CONFIGS.items():
        ig_status = "✅" if config.instagram_business_account_id else "❌ MISSING"
        fb_status = "✅" if config.facebook_page_id else "❌ MISSING"
        token_status = "✅" if config.meta_access_token else "❌ MISSING"
        print(f"   {config.display_name}:", flush=True)
        print(f"      Instagram ID: {ig_status} ({config.instagram_business_account_id or 'None'})", flush=True)
        print(f"      Facebook ID:  {fb_status} ({config.facebook_page_id or 'None'})", flush=True)
        print(f"      Token:        {token_status}", flush=True)
    print("", flush=True)
    
    # Reset any stuck "publishing" posts from previous crashes
    print("🔄 Checking for stuck publishing posts...", flush=True)
    try:
        from app.services.db_scheduler import DatabaseSchedulerService
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
                        
                        # Check for retry_platforms (partial retry) or use original platforms
                        retry_platforms = metadata.get('retry_platforms')
                        succeeded_platforms = metadata.get('succeeded_platforms', [])
                        
                        if retry_platforms:
                            platforms = retry_platforms
                            print(f"   🔄 PARTIAL RETRY: Only retrying {platforms} (skipping already successful: {succeeded_platforms})")
                        
                        platforms = metadata.get('platforms', ['instagram'])
                        # Get paths from metadata or use defaults
                        metadata = schedule.get('metadata', {})
                        video_path_str = metadata.get('video_path')
                        thumbnail_path_str = metadata.get('thumbnail_path')
                        brand = metadata.get('brand', '')
                        
                        print(f"      📦 Metadata: video={video_path_str}, thumbnail={thumbnail_path_str}, brand={brand}")
                        
                        # If paths stored in metadata, use those
                        if video_path_str:
                            video_path = Path(video_path_str)
                            # Handle relative paths (e.g., /output/videos/xxx.mp4)
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
                        print(f"      🏷️ Publishing with brand: {brand}")
                        result = scheduler_service.publish_now(
                            video_path=video_path,
                            thumbnail_path=thumbnail_path,
                            caption=caption,
                            platforms=platforms,
                            brand_name=brand  # Pass brand name to use correct credentials
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
    
    # Run check every 60 seconds
    scheduler.add_job(check_and_publish, 'interval', seconds=60, id='auto_publish')
    scheduler.start()
    
    print("✅ Auto-publishing scheduler started (checks every 60 seconds)", flush=True)
    print("🎉 Startup complete! App is ready.", flush=True)
    
    # Store scheduler for shutdown
    app.state.scheduler = scheduler


@app.on_event("shutdown")
async def shutdown_event():
    """Run shutdown tasks."""
    print("👋 Shutting down Instagram Reels Automation API...")
    
    # Shutdown scheduler
    if hasattr(app.state, 'scheduler'):
        app.state.scheduler.shutdown()
        print("⏰ Auto-publishing scheduler stopped")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
