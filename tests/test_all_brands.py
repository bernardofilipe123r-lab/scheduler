#!/usr/bin/env python3
"""
Test script to generate reels for all brands in both light and dark modes.
This will save examples to assets/examples/ directory.
"""
import sys
import os
from pathlib import Path

# Add app directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.services.image_generator import ImageGenerator
from app.services.video_generator import VideoGenerator
from app.core.config import BrandType

# Test content
TITLE = "5 Body Warning Signals You Shouldn't Ignore"
CONTENT_LINES = [
    "Waking at 3 AM — repeatedly during the night.",
    "Sudden ear ringing — without noise exposure.",
    "Muscle twitching — in eyes, lips, or face.",
    "Unexplained anxiety — or inner restlessness.",
    "Brain fog — with poor focus or clarity.",
    "Follow for health tips — improve wellness daily."
]

# Custom AI prompt for dark mode (Sora-style)
AI_PROMPT = """A cinematic, full-frame medical wellness visualization with almost no empty space, centered on a single oversized human brain as the dominant focal subject. The brain appears hyper-detailed and semi-translucent, with subtle internal glow, visible neural pathways, and pulsing energy suggesting overload and stress signals. Surrounding elements include soft electrical arcs, flowing particles, and layered depth to evoke nervous system communication. Deep blue and teal tones dominate the scene, with controlled warm amber highlights inside neural networks. Photorealistic, cinematic lighting with a premium medical wellness aesthetic. Symbolic, clinical, and thought-provoking mood. No text, no letters, no numbers, no logos."""

# Brand configurations
BRANDS = [
    ("gymcollege", BrandType.THE_GYM_COLLEGE, "Gym College"),
    ("healthycollege", BrandType.WELLNESS_LIFE, "Healthy College"),
    ("vitalitycollege", BrandType.VITALITY_COLLEGE, "Vitality College"),
    ("longevitycollege", BrandType.LONGEVITY_COLLEGE, "Longevity College"),
]

def main():
    """Generate test reels for all brands."""
    # Create base examples directory
    base_examples_dir = Path("assets/examples")
    base_examples_dir.mkdir(parents=True, exist_ok=True)
    
    print("🎬 Starting brand reel generation test...")
    print(f"📁 Output directory: {base_examples_dir.absolute()}\n")
    
    for brand_name, brand_type, display_name in BRANDS:
        print(f"\n{'='*60}")
        print(f"🎨 Generating reels for: {display_name}")
        print(f"{'='*60}\n")
        
        # Create brand-specific directories
        light_dir = base_examples_dir / brand_name / "lightmode"
        dark_dir = base_examples_dir / brand_name / "darkmode"
        light_dir.mkdir(parents=True, exist_ok=True)
        dark_dir.mkdir(parents=True, exist_ok=True)
        
        # Light mode
        print(f"  📝 Light Mode...")
        try:
            light_gen = ImageGenerator(brand_type, variant="light", brand_name=brand_name)
            
            # Generate thumbnail
            thumb_path = light_dir / "thumbnail.png"
            light_gen.generate_thumbnail(TITLE, thumb_path)
            print(f"    ✅ Thumbnail: {thumb_path}")
            
            # Generate content image
            content_path = light_dir / "content.png"
            light_gen.generate_reel_image(TITLE, CONTENT_LINES, content_path)
            print(f"    ✅ Content: {content_path}")
            
            # Generate video
            video_path = light_dir / "video.mp4"
            video_gen = VideoGenerator()
            video_gen.generate_reel_video(
                reel_image_path=content_path,
                output_path=video_path,
                music_id=None  # Will randomly pick music_1 or music_2
            )
            print(f"    ✅ Video: {video_path}")
            
        except Exception as e:
            print(f"    ❌ Light mode failed: {e}")
        
        # Dark mode with AI background
        print(f"\n  🌙 Dark Mode (AI Background)...")
        try:
            dark_gen = ImageGenerator(
                brand_type, 
                variant="dark", 
                brand_name=brand_name,
                ai_prompt=AI_PROMPT
            )
            
            # Generate thumbnail
            thumb_path = dark_dir / "thumbnail.png"
            dark_gen.generate_thumbnail(TITLE, thumb_path)
            print(f"    ✅ Thumbnail: {thumb_path}")
            
            # Generate content image
            content_path = dark_dir / "content.png"
            dark_gen.generate_reel_image(TITLE, CONTENT_LINES, content_path)
            print(f"    ✅ Content: {content_path}")
            
            # Generate video
            video_path = dark_dir / "video.mp4"
            video_gen = VideoGenerator()
            video_gen.generate_reel_video(
                reel_image_path=content_path,
                output_path=video_path,
                music_id=None  # Will randomly pick music_1 or music_2
            )
            print(f"    ✅ Video: {video_path}")
            
        except Exception as e:
            print(f"    ❌ Dark mode failed: {e}")
    
    print(f"\n{'='*60}")
    print("✨ All brand tests completed!")
    print(f"📂 Check {base_examples_dir.absolute()} for results")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
