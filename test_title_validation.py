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
    
    # Test cases
    test_cases = [
        {
            "name": "✅ VALID - Balanced Lines",
            "title": "FOODS THAT DESTROY\nYOUR SLEEP QUALITY",
            "should_work": True
        },
        {
            "name": "✅ VALID - Auto-wrap (no \\n)",
            "title": "FOODS THAT DESTROY YOUR SLEEP QUALITY",
            "should_work": True
        },
        {
            "name": "❌ INVALID - First line too long",
            "title": "FOODS THAT DESTROY YOUR SLEEP\nQUALITY",
            "should_work": False
        },
        {
            "name": "❌ INVALID - Second line too long",
            "title": "FOODS THAT\nDESTROY YOUR SLEEP QUALITY COMPLETELY",
            "should_work": False
        }
    ]
    
    # Create output directory
    output_dir = Path(__file__).parent / "output"
    output_dir.mkdir(exist_ok=True)
    
    for i, case in enumerate(test_cases, 1):
        print(f"\n🧪 Test {i}: {case['name']}")
        print(f"📝 Title: {case['title'].replace(chr(10), ' | ')}")
        
        try:
            # Create image generator
            generator = ImageGenerator(
                brand_type=BrandType.THE_GYM_COLLEGE,
                variant=variant,
                brand_name=brand_name
            )
            
            # Try to generate the reel image
            output_path = output_dir / f"test_validation_{i}.png"
            result_path = generator.generate_reel_image(
                title=case['title'],
                lines=[
                    "Coffee after 2pm — Blocks adenosine for 8+ hours",
                    "Dark chocolate at night — Hidden caffeine content",
                    "Spicy dinners — Raises body temperature",
                    "Better sleep starts with food choices — Follow this page."
                ],
                output_path=output_path
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
    print("- Manual breaks with \\n: Fixed 56px, validates each line")
    print("- No \\n: Auto-wrap with font scaling (existing logic)")  
    print("- Error if manual line is too long at 56px")
    print("✅ Validation testing complete!")

if __name__ == "__main__":
    try:
        test_manual_breaks()
    except Exception as e:
        print(f"💥 Fatal error: {e}")
        sys.exit(1)