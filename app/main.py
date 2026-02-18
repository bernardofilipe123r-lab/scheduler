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
from sqlalchemy import type_coerce
from sqlalchemy.dialects.postgresql import JSONB
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
from app.api.system.health_routes import router as health_router
from app.api.niche_config_routes import router as niche_config_router
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
app.include_router(health_router)  # Deep health check at /api/system/health-check
app.include_router(niche_config_router, prefix="/api/v2/brands")  # Niche config (Content DNA)


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


def _render_slides_node(brand: str, title: str, background_image: str, slide_texts: list, reel_id: str, user_id: str = "system") -> dict | None:
    """Render carousel slides using Node.js Konva (pixel-perfect match to frontend)."""
    import json
    import subprocess
    import tempfile

    uid8 = reel_id[:8] if reel_id else "unknown"

    # Render to a temp directory
    tmp_dir = tempfile.mkdtemp(prefix="slides_")
    cover_out = os.path.join(tmp_dir, f"post_{brand}_{uid8}.png")
    slide_outputs = [
        os.path.join(tmp_dir, f"post_{brand}_{uid8}_slide{idx}.png")
        for idx in range(len(slide_texts))
    ]

    input_data = {
        "brand": brand,
        "title": title,
        "backgroundImage": background_image,
        "slideTexts": slide_texts,
        "coverOutput": cover_out,
        "slideOutputs": slide_outputs,
        "logoPath": None,
        "shareIconPath": "/app/assets/icons/share.png",
        "saveIconPath": "/app/assets/icons/save.png",
        "fontPaths": {
            "anton": "/app/assets/fonts/Anton-Regular.ttf",
            "inter": "/app/assets/fonts/InterVariable.ttf",
        },
    }

    # Write input JSON to temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(input_data, f)
        json_path = f.name

    try:
        result = subprocess.run(
            ["node", "/app/scripts/render-slides.cjs", json_path],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            print(f"[NODE-RENDER] stderr: {result.stderr}", flush=True)
            return None
        output = json.loads(result.stdout.strip())
        if output.get("success"):
            # Upload rendered slides to Supabase Storage
            try:
                from app.services.storage.supabase_storage import upload_from_path, storage_path
                cover_path = output.get("coverPath", "")
                if cover_path and Path(cover_path).exists():
                    cover_name = Path(cover_path).name
                    cover_remote = storage_path(user_id, brand, "posts", cover_name)
                    output["coverUrl"] = upload_from_path("media", cover_remote, cover_path)
                slide_urls = []
                for sp in output.get("slidePaths", []):
                    if sp and Path(sp).exists():
                        slide_name = Path(sp).name
                        slide_remote = storage_path(user_id, brand, "posts", slide_name)
                        slide_urls.append(upload_from_path("media", slide_remote, sp))
                output["slideUrls"] = slide_urls
            except Exception as upload_err:
                print(f"[NODE-RENDER] Supabase upload warning: {upload_err}", flush=True)
            return output
        else:
            print(f"[NODE-RENDER] Error: {output.get('error')}", flush=True)
            return None
    except subprocess.TimeoutExpired:
        print("[NODE-RENDER] Timeout after 60s", flush=True)
        return None
    except Exception as e:
        print(f"[NODE-RENDER] Exception: {e}", flush=True)
        return None
    finally:
        import shutil as _shutil
        os.unlink(json_path)
        # Clean up temp rendered slides directory
        try:
            _shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass


def _repair_missing_carousel_images():
    """Re-compose carousel slides for all scheduled posts to ensure correct rendering."""
    import tempfile
    import requests as _req
    from app.db_connection import SessionLocal
    from app.models import ScheduledReel
    from sqlalchemy.orm.attributes import flag_modified

    db = SessionLocal()
    try:
        posts = db.query(ScheduledReel).filter(
            ScheduledReel.status.in_(["scheduled", "publishing"]),
        ).all()

        repaired = 0
        for post in posts:
            ed = post.extra_data or {}
            if ed.get("variant") != "post":
                continue
            slide_texts = ed.get("slide_texts") or []
            if not slide_texts:
                continue

            brand = ed.get("brand", "unknown")
            title = ed.get("title", "")
            reel_id = post.reel_id or ""
            bg_url = ed.get("thumbnail_path", "")

            if not bg_url or not bg_url.startswith("https://"):
                print(f"  ⚠️ [{post.schedule_id}] No Supabase background URL for {brand}/{reel_id}", flush=True)
                continue

            tmp_bg_path = None
            try:
                # Download background image from Supabase to temp file
                resp = _req.get(bg_url, timeout=60)
                resp.raise_for_status()
                tmp_bg = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                tmp_bg.write(resp.content)
                tmp_bg.close()
                tmp_bg_path = tmp_bg.name

                composed = _render_slides_node(
                    brand=brand,
                    title=title,
                    background_image=tmp_bg_path,
                    slide_texts=slide_texts,
                    reel_id=reel_id,
                    user_id=getattr(post, 'user_id', 'system'),
                )
                if composed:
                    ed["thumbnail_path"] = composed.get("coverUrl") or composed["coverPath"]
                    ed["carousel_paths"] = composed.get("slideUrls") or composed["slidePaths"]
                    post.extra_data = dict(ed)
                    flag_modified(post, "extra_data")
                    repaired += 1
                    print(f"  ✅ [{post.schedule_id}] Rendered {1 + len(composed.get('slidePaths', []))} slides for {brand}", flush=True)
                else:
                    print(f"  ❌ [{post.schedule_id}] Node renderer failed for {brand}", flush=True)
            except Exception as e:
                print(f"  ❌ [{post.schedule_id}] Composition failed for {brand}: {e}", flush=True)
            finally:
                if tmp_bg_path:
                    try:
                        os.unlink(tmp_bg_path)
                    except Exception:
                        pass

        if repaired > 0:
            db.commit()
            print(f"🔧 Repaired carousel images for {repaired} post(s)", flush=True)
        else:
            print("✅ All scheduled posts have carousel images", flush=True)
    finally:
        db.close()


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
    
    # Reset any stuck "generating" jobs from previous crashes/deploys
    print("🔄 Checking for stuck generating jobs...", flush=True)
    try:
        from app.models import GenerationJob
        db_stuck = SessionLocal()
        try:
            stuck_jobs = db_stuck.query(GenerationJob).filter(
                GenerationJob.status == "generating"
            ).all()
            if stuck_jobs:
                for job in stuck_jobs:
                    job.status = "failed"
                    job.error_message = "Reset on startup — interrupted by deploy"
                    job.completed_at = datetime.utcnow()
                db_stuck.commit()
                print(f"⚠️ Reset {len(stuck_jobs)} stuck generating job(s) from previous run", flush=True)
        finally:
            db_stuck.close()
    except Exception as e:
        print(f"⚠️ Could not check stuck jobs: {e}", flush=True)

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
    
    # Re-compose carousel images for scheduled posts that are missing them
    print("🔄 Checking for posts with missing carousel images...", flush=True)
    try:
        _repair_missing_carousel_images()
    except Exception as e:
        print(f"⚠️ Carousel repair failed: {e}", flush=True)
    
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
                        
                        # All paths in metadata are now Supabase URLs
                        video_path_str = metadata.get('video_path')
                        thumbnail_path_str = metadata.get('thumbnail_path')
                        brand = metadata.get('brand', '')
                        variant = metadata.get('variant', 'light')
                        
                        print(f"      📦 Metadata: video={video_path_str}, thumbnail={thumbnail_path_str}, brand={brand}, variant={variant}")
                        
                        # ── POST (image) vs REEL (video) publishing ──
                        is_post = (variant == 'post')
                        
                        if is_post:
                            # ── IMAGE POST PUBLISHING ──
                            # thumbnail_path_str is a Supabase URL
                            image_url = thumbnail_path_str
                            if not image_url:
                                raise ValueError(f"No thumbnail/cover URL found in metadata for post {reel_id}")
                            
                            print(f"      🖼️  Image post cover URL: {image_url}")
                            
                            # ── Just-in-time composition at publish time (Node.js Konva) ──
                            # Note: JIT composition needs a local background image.
                            # If slide_texts are present, download the background from Supabase
                            # to a temp file, render slides, and use the resulting Supabase URLs.
                            post_title = metadata.get('title', '')
                            slide_texts = metadata.get('slide_texts') or []
                            supabase_slide_urls = []

                            if (post_title or slide_texts) and image_url.startswith("https://"):
                                try:
                                    import tempfile
                                    import requests as _req
                                    # Download background image to temp file for node renderer
                                    resp = _req.get(image_url, timeout=60)
                                    resp.raise_for_status()
                                    tmp_bg = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                                    tmp_bg.write(resp.content)
                                    tmp_bg.close()
                                    
                                    composed = _render_slides_node(
                                        brand=brand,
                                        title=post_title,
                                        background_image=tmp_bg.name,
                                        slide_texts=slide_texts,
                                        reel_id=reel_id,
                                        user_id=schedule.get('user_id', 'system'),
                                    )
                                    if composed:
                                        if composed.get("coverUrl"):
                                            image_url = composed["coverUrl"]
                                        supabase_slide_urls = composed.get("slideUrls", [])
                                        print(f"      ✅ Konva rendered: cover + {len(supabase_slide_urls)} slides")
                                    else:
                                        print(f"      ⚠️ Node renderer returned no result", flush=True)
                                    
                                    # Clean up temp file
                                    try:
                                        os.unlink(tmp_bg.name)
                                    except Exception:
                                        pass
                                except Exception as comp_err:
                                    import traceback
                                    print(f"      ⚠️ JIT composition failed: {comp_err}", flush=True)
                                    traceback.print_exc()
                            
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
                            
                            # Check for carousel slides — prefer JIT-composed, fall back to metadata
                            if supabase_slide_urls:
                                carousel_image_urls = supabase_slide_urls
                            else:
                                carousel_paths_raw = metadata.get('carousel_paths') or []
                                carousel_image_urls = [url for url in carousel_paths_raw if url]
                            
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
                            # All paths are now Supabase URLs
                            if not video_path_str:
                                raise ValueError(f"No video URL found in metadata for reel {reel_id}")
                            if not thumbnail_path_str:
                                raise ValueError(f"No thumbnail URL found in metadata for reel {reel_id}")
                            
                            print(f"      🎬 Video URL: {video_path_str}")
                            print(f"      🖼️  Thumbnail URL: {thumbnail_path_str}")
                            
                            # Publish now - pass URLs directly
                            print(f"      🏷️ Publishing REEL with brand: {brand}")
                            result = scheduler_service.publish_now(
                                video_url=video_path_str,
                                thumbnail_url=thumbnail_path_str,
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
    
    # Auto-cleanup published jobs/reels older than 1 day
    def cleanup_published_jobs():
        """Delete jobs and scheduled reels that were published more than 1 day ago."""
        from app.db_connection import SessionLocal
        from app.models import GenerationJob, ScheduledReel
        from datetime import timedelta

        db = SessionLocal()
        try:
            cutoff = datetime.utcnow() - timedelta(days=1)

            # Delete scheduled reels published more than 1 day ago
            old_published_reels = db.query(ScheduledReel).filter(
                ScheduledReel.status == "published",
                ScheduledReel.published_at < cutoff
            ).all()

            deleted_reels = 0
            for reel in old_published_reels:
                db.delete(reel)
                deleted_reels += 1

            # Delete jobs where ALL brand outputs are published and created > 1 day ago
            old_jobs = db.query(GenerationJob).filter(
                GenerationJob.created_at < cutoff
            ).all()

            deleted_jobs = 0
            for job in old_jobs:
                outputs = job.brand_outputs or {}
                brands = job.brands or []
                if not brands or not outputs:
                    continue
                # Check if ALL brands are published
                all_published = all(
                    isinstance(outputs.get(b), dict) and outputs.get(b, {}).get("status") == "published"
                    for b in brands
                )
                if all_published:
                    # Clean up any remaining scheduled reels
                    for brand, output in outputs.items():
                        reel_id = output.get("reel_id") if isinstance(output, dict) else None
                        if reel_id:
                            db.query(ScheduledReel).filter(
                                ScheduledReel.reel_id == reel_id
                            ).delete(synchronize_session=False)
                    db.query(ScheduledReel).filter(
                        type_coerce(ScheduledReel.extra_data, JSONB)["job_id"].astext == job.job_id
                    ).delete(synchronize_session=False)
                    # Clean up files (best-effort)
                    try:
                        from app.services.content.job_manager import JobManager
                        manager = JobManager(db)
                        manager.cleanup_job_files(job.job_id)
                    except Exception:
                        pass
                    db.delete(job)
                    deleted_jobs += 1

            if deleted_reels > 0 or deleted_jobs > 0:
                db.commit()
                print(f"🧹 Published cleanup: {deleted_jobs} jobs + {deleted_reels} scheduled reels (>1 day old)", flush=True)
        except Exception as e:
            db.rollback()
            print(f"⚠️ Published cleanup failed: {e}", flush=True)
        finally:
            db.close()
    
    scheduler.add_job(cleanup_old_logs, 'interval', hours=24, id='log_cleanup')
    scheduler.add_job(cleanup_published_jobs, 'interval', hours=6, id='published_cleanup')
    
    scheduler.start()
    
    print("✅ Auto-publishing scheduler started (checks every 60 seconds)", flush=True)
    print("✅ Analytics auto-refresh scheduled (every 6 hours)", flush=True)
    print("✅ Log cleanup scheduled (every 24 hours, 7-day retention)", flush=True)
    print("✅ Published content cleanup scheduled (every 6 hours, 1-day retention)", flush=True)
    
    # Store scheduler for shutdown
    app.state.scheduler = scheduler
    
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

