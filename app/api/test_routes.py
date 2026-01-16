"""
Test routes for brand connection testing.
"""
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta, timezone
from app.services.image_generator import ImageGenerator
from app.services.video_generator import VideoGenerator
from app.services.caption_builder import CaptionBuilder
from app.services.db_scheduler import DatabaseSchedulerService

router = APIRouter(prefix="/api/test", tags=["test"])


class TestBrandRequest(BaseModel):
    brand: str
    variant: str  # "light" or "dark"


class TestBrandResponse(BaseModel):
    success: bool
    job_id: str
    brand: str
    variant: str
    message: str
    video_path: Optional[str] = None
    thumbnail_path: Optional[str] = None
    schedule_id: Optional[str] = None


@router.post("/brand", response_model=TestBrandResponse)
async def test_brand_connection(request: TestBrandRequest):
    """
    Test a brand connection by generating a single reel.
    
    This endpoint:
    1. Generates a test reel for the specified brand and variant
    2. Schedules it for immediate publication (now + 1 minute)
    3. Returns the job details and schedule info
    """
    print(f"\n{'='*100}")
    print(f"🧪 TEST BRAND CONNECTION ENDPOINT CALLED")
    print(f"{'='*100}")
    print(f"🏷️  Brand: {request.brand}")
    print(f"🎨 Variant: {request.variant}")
    print(f"⏰ Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print(f"{'='*100}\n")
    
    # Validate brand
    valid_brands = ['gymcollege', 'healthycollege', 'vitalitycollege', 'longevitycollege']
    if request.brand not in valid_brands:
        print(f"❌ Invalid brand: {request.brand}")
        raise HTTPException(status_code=400, detail=f"Invalid brand. Must be one of: {valid_brands}")
    
    # Validate variant
    if request.variant not in ['light', 'dark']:
        print(f"❌ Invalid variant: {request.variant}")
        raise HTTPException(status_code=400, detail="Invalid variant. Must be 'light' or 'dark'")
    
    try:
        # Generate unique reel ID
        reel_id = f"TEST-{uuid.uuid4().hex[:8]}_{request.brand}"
        print(f"🆔 Generated reel ID: {reel_id}")
        
        # Test content
        title = "🧪 Connection Test"
        lines = [
            "This is an automated test",
            "Verifying brand configuration",
            "All systems operational"
        ]
        
        print(f"📝 Test content prepared:")
        print(f"   Title: {title}")
        print(f"   Lines: {lines}")
        
        # Define output paths
        base_dir = Path(__file__).resolve().parent.parent.parent
        thumbnail_path = base_dir / "output" / "thumbnails" / f"{reel_id}.png"
        reel_image_path = base_dir / "output" / "reels" / f"{reel_id}.png"
        video_path = base_dir / "output" / "videos" / f"{reel_id}.mp4"
        
        print(f"\n📁 Output paths:")
        print(f"   Thumbnail: {thumbnail_path}")
        print(f"   Reel image: {reel_image_path}")
        print(f"   Video: {video_path}")
        
        # Initialize services
        print(f"\n🔧 Initializing generators...")
        image_generator = ImageGenerator(request.brand, variant=request.variant)
        video_generator = VideoGenerator()
        caption_builder = CaptionBuilder()
        
        # Step 1: Generate thumbnail
        print(f"\n🖼️  Step 1: Generating thumbnail...")
        try:
            image_generator.generate_thumbnail(
                title=title,
                output_path=thumbnail_path
            )
            print(f"   ✅ Thumbnail generated: {thumbnail_path.name}")
        except Exception as e:
            print(f"   ❌ Thumbnail generation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Thumbnail generation failed: {str(e)}")
        
        # Step 2: Generate reel image
        print(f"\n🎨 Step 2: Generating reel image...")
        try:
            image_generator.generate_reel_image(
                title=title,
                lines=lines,
                output_path=reel_image_path,
                cta_type="follow"
            )
            print(f"   ✅ Reel image generated: {reel_image_path.name}")
        except Exception as e:
            print(f"   ❌ Reel image generation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Reel image generation failed: {str(e)}")
        
        # Step 3: Generate video
        print(f"\n🎬 Step 3: Generating video...")
        try:
            video_generator.generate_reel_video(
                reel_image_path=reel_image_path,
                output_path=video_path,
                music_id=None  # Random music
            )
            print(f"   ✅ Video generated: {video_path.name}")
        except Exception as e:
            print(f"   ❌ Video generation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Video generation failed: {str(e)}")
        
        # Step 4: Generate caption
        print(f"\n✍️  Step 4: Generating caption...")
        try:
            caption = caption_builder.build_caption(
                title=title,
                lines=lines
            )
            print(f"   ✅ Caption generated: {len(caption)} characters")
        except Exception as e:
            print(f"   ❌ Caption generation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Caption generation failed: {str(e)}")
        
        # Schedule for immediate publication (1 minute from now)
        scheduled_time = datetime.now(timezone.utc) + timedelta(minutes=1)
        
        print(f"\n📅 Step 5: Scheduling test reel for immediate publication...")
        print(f"   Scheduled time: {scheduled_time.isoformat()}")
        
        scheduler = DatabaseSchedulerService()
        schedule_result = scheduler.schedule_reel(
            user_id="test@system",
            reel_id=reel_id,
            scheduled_time=scheduled_time,
            caption=caption,
            platforms=["instagram", "facebook"],
            video_path=str(video_path),
            thumbnail_path=str(thumbnail_path),
            user_name="Test User",
            brand=request.brand,
            variant=request.variant
        )
        
        print(f"   ✅ Scheduled successfully!")
        print(f"   📋 Schedule ID: {schedule_result.get('schedule_id')}")
        print(f"   ⏰ Will publish at: {schedule_result.get('scheduled_time')}")
        
        print(f"\n{'='*100}")
        print(f"🎉 TEST COMPLETED SUCCESSFULLY")
        print(f"{'='*100}\n")
        
        return TestBrandResponse(
            success=True,
            job_id=reel_id,
            brand=request.brand,
            variant=request.variant,
            message=f"Test reel generated and scheduled for {scheduled_time.strftime('%Y-%m-%d %H:%M:%S UTC')}",
            video_path=f"/output/videos/{reel_id}.mp4",
            thumbnail_path=f"/output/thumbnails/{reel_id}.png",
            schedule_id=schedule_result.get('schedule_id')
        )
        
    except Exception as e:
        print(f"\n{'='*100}")
        print(f"❌ TEST FAILED WITH ERROR")
        print(f"{'='*100}")
        print(f"🔥 Error type: {type(e).__name__}")
        print(f"📄 Error message: {str(e)}")
        import traceback
        print(f"📜 Traceback:\n{traceback.format_exc()}")
        print(f"{'='*100}\n")
        
        raise HTTPException(status_code=500, detail=str(e))
