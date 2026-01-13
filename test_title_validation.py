#!/usr/bin/env python3
"""
Test script for manual line break validation.
Tests both valid manual breaks and invalid (too long) cases.
"""
import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw

# Add the app directory to the Python path
sys.path.insert(0, str(Path(__file__).parent / "app"))

from app.core.config import BrandType
from app.services.image_generator import ImageGenerator

def test_manual_breaks():
    """Test manual line break functionality with both valid and invalid cases."""
    
    brand_name = "gymcollege"
    variant = "dark"
    
    print("🧪 Testing Manual Line Break Validation")
    print("=" * 50)
    
    # Test cases with different font sizes
    test_cases = [
        {
            "name": "✅ VALID - Balanced Lines (56px default)",
            "title": "FOODS THAT DESTROY\nYOUR SLEEP QUALITY",
            "font_size": 56,
            "should_work": True
        },
        {
            "name": "✅ VALID - Auto-wrap (no \\n, 56px)",
            "title": "FOODS THAT DESTROY YOUR SLEEP QUALITY",
            "font_size": 56,
            "should_work": True
        },
        {
            "name": "❌ INVALID - First line too long (56px)",
            "title": "FOODS THAT DESTROY YOUR SLEEP\nQUALITY",
            "font_size": 56,
            "should_work": False
        },
        {
            "name": "✅ VALID - Same line works at smaller font (48px)",
            "title": "FOODS THAT DESTROY YOUR SLEEP\nQUALITY",
            "font_size": 48,
            "should_work": True
        },
        {
            "name": "✅ VALID - Custom larger font (64px)",
            "title": "SHORT TITLE\nWORKS GREAT",
            "font_size": 64,
            "should_work": True
        },
        {
            "name": "✅ VALID - Custom smaller font (40px)",
            "title": "EVEN LONGER TITLE LINES CAN FIT\nWHEN YOU USE SMALLER FONTS",
            "font_size": 40,
            "should_work": True
        }
    ]
    
    # Create output directory
    output_dir = Path(__file__).parent / "output"
    output_dir.mkdir(exist_ok=True)
    
    for i, case in enumerate(test_cases, 1):
        print(f"\n🧪 Test {i}: {case['name']}")
        print(f"📝 Title: {case['title'].replace(chr(10), ' | ')}")
        print(f"🔤 Font Size: {case['font_size']}px")
        
        try:
            # Create image generator
            generator = ImageGenerator(
                brand_type=BrandType.THE_GYM_COLLEGE,
                variant=variant,
                brand_name=brand_name
            )
            
            # Try to generate the reel image with specified font size
            output_path = output_dir / f"test_validation_{i}.png"
            result_path = generator.generate_reel_image(
                title=case['title'],
                lines=[
                    "Coffee after 2pm — Blocks adenosine for 8+ hours",
                    "Dark chocolate at night — Hidden caffeine content",
                    "Spicy dinners — Raises body temperature",
                    "Better sleep starts with food choices — Follow this page."
                ],
                output_path=output_path,
                title_font_size=case['font_size']
            )
            
            if case['should_work']:
                print(f"✅ SUCCESS: Generated {result_path}")
            else:
                print(f"⚠️  UNEXPECTED: Should have failed but succeeded")
                
        except ValueError as e:
            if not case['should_work']:
                print(f"✅ EXPECTED ERROR: {str(e)}")
            else:
                print(f"❌ UNEXPECTED ERROR: {str(e)}")
        except Exception as e:
            print(f"💥 UNEXPECTED EXCEPTION: {str(e)}")
    
    print(f"\n{'='*50}")
    print("🎯 Summary:")
    print("- Manual breaks with \\n: Uses specified font size (default 56px)")
    print("- No \\n: Auto-wrap with font scaling from specified size down to 20px")  
    print("- Error if manual line is too long at chosen font size")
    print("- Customize font size to fit longer lines or create different styles")
    print("✅ Font size customization testing complete!")

if __name__ == "__main__":
    try:
        test_manual_breaks()
    except Exception as e:
        print(f"💥 Fatal error: {e}")
        sys.exit(1)