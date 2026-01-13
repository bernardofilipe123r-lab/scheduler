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
    
    ## Note
    
    This system is **template-based**, not AI-generated. It assembles media 
    deterministically from provided inputs.
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

# Include routers
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


@app.get("/", tags=["root"])
async def root():
    """Serve the web interface."""
    static_dir = Path(__file__).parent / "static"
    index_file = static_dir / "index.html"
    return FileResponse(index_file)


@app.get("/scheduled", tags=["root"])
async def scheduled_page():
    """Serve the scheduled posts page."""
    static_dir = Path(__file__).parent / "static"
    scheduled_file = static_dir / "scheduled.html"
    return FileResponse(scheduled_file)


@app.get("/history.html", tags=["root"])
async def history_page():
    """Serve the job history page."""
    static_dir = Path(__file__).parent / "static"
    history_file = static_dir / "history.html"
    return FileResponse(history_file)


@app.get("/history", tags=["root"])
async def history_page_alt():
    """Serve the job history page (alternate URL)."""
    static_dir = Path(__file__).parent / "static"
    history_file = static_dir / "history.html"
    return FileResponse(history_file)


@app.get("/health", tags=["health"])
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
            # Get service instance
            scheduler_service = DatabaseSchedulerService()
            
            # Get pending publications
            pending = scheduler_service.get_pending_publications()
            
            if pending:
                print(f"\n📅 Found {len(pending)} post(s) ready to publish at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
                
                for schedule in pending:
                    schedule_id = schedule['schedule_id']
                    reel_id = schedule['reel_id']
                    caption = schedule.get('caption', 'CHANGE ME')
                    platforms = schedule.get('metadata', {}).get('platforms', ['instagram'])
                    
                    print(f"   📤 Publishing {reel_id} to {', '.join(platforms)}...")
                    
                    try:
                        # Get paths from metadata or use defaults
                        metadata = schedule.get('metadata', {})
                        video_path_str = metadata.get('video_path')
                        thumbnail_path_str = metadata.get('thumbnail_path')
                        
                        # If paths stored in metadata, use those
                        if video_path_str:
                            video_path = Path(video_path_str)
                        else:
                            # Try .mp4 in output/videos
                            video_path = Path(f"output/videos/{reel_id}.mp4")
                        
                        if thumbnail_path_str:
                            thumbnail_path = Path(thumbnail_path_str)
                        else:
                            # Try both .png and .jpg
                            thumbnail_path = Path(f"output/thumbnails/{reel_id}.png")
                            if not thumbnail_path.exists():
                                thumbnail_path = Path(f"output/thumbnails/{reel_id}.jpg")
                        
                        print(f"      🎬 Video: {video_path}")
                        print(f"      🖼️  Thumbnail: {thumbnail_path}")
                        
                        if not video_path.exists():
                            raise FileNotFoundError(f"Video not found: {video_path}")
                        if not thumbnail_path.exists():
                            raise FileNotFoundError(f"Thumbnail not found: {thumbnail_path}")
                        
                        # Publish now
                        result = scheduler_service.publish_now(
                            video_path=video_path,
                            thumbnail_path=thumbnail_path,
                            caption=caption,
                            platforms=platforms
                        )
                        
                        print(f"      📊 Publish result: {result}")
                        
                        # Check if publishing actually succeeded
                        failed_platforms = []
                        success_platforms = []
                        
                        for platform, platform_result in result.items():
                            if platform_result.get('success'):
                                success_platforms.append(platform)
                                print(f"      ✅ {platform}: {platform_result.get('post_id', 'Published')}")
                            else:
                                failed_platforms.append(platform)
                                error = platform_result.get('error', 'Unknown error')
                                print(f"      ❌ {platform}: {error}")
                        
                        # Only mark as published if at least one platform succeeded
                        if success_platforms:
                            # Collect post IDs for storage
                            post_ids = {}
                            for platform in success_platforms:
                                pid = result[platform].get('post_id') or result[platform].get('video_id')
                                if pid:
                                    post_ids[platform] = str(pid)
                            
                            scheduler_service.mark_as_published(schedule_id, post_ids=post_ids)
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
