"""
AI background generation service using deAPI.
"""
import os
import uuid
import time
from pathlib import Path
from io import BytesIO
import requests
from PIL import Image
from app.core.constants import REEL_WIDTH, REEL_HEIGHT


class AIBackgroundGenerator:
    """Service for generating AI backgrounds for dark mode using deAPI."""
    
    def __init__(self):
        """Initialize the AI background generator with deAPI client."""
        api_key = os.getenv("DEAPI_API_KEY")
        if not api_key:
            raise ValueError("DEAPI_API_KEY not found in environment variables")
        self.api_key = api_key
        self.base_url = "https://api.deapi.ai/api/v1/client"
    
    def generate_background(self, brand_name: str, user_prompt: str = None, progress_callback=None, content_context: str = None) -> Image.Image:
        """
        Generate an AI background image based on brand.
        
        Args:
            brand_name: Brand name ("gymcollege", "healthycollege", "vitalitycollege", "longevitycollege")
            user_prompt: Custom prompt from user (optional)
            progress_callback: Callback function for progress updates (optional)
            content_context: Title or content lines to derive visual elements from (optional)
            
        Returns:
            PIL Image object with AI-generated background
        """
        start_time = time.time()
        
        if progress_callback:
            progress_callback("Preparing AI prompt...", 10)
        
        # Brand color palettes - ONLY the color changes, everything else stays identical
        color_palettes = {
            "gymcollege": {
                "name": "Dark Blue",
                "primary": "#00435c",
                "description": "dark navy blue, midnight blue, deep steel blue, and ocean blue tones"
            },
            "healthycollege": {
                "name": "Dark Green", 
                "primary": "#004f00",
                "description": "dark forest green, deep emerald green, rich hunter green, and moss green tones"
            },
            "vitalitycollege": {
                "name": "Vivid Turquoise",
                "primary": "#028f7a", 
                "description": "vivid turquoise, bright teal, vibrant cyan, and aquamarine tones"
            },
            "longevitycollege": {
                "name": "Vivid Azure",
                "primary": "#00c9ff",
                "description": "vivid azure, bright sky blue, luminous cyan, and electric blue tones"
            }
        }
        
        palette = color_palettes.get(brand_name, color_palettes["gymcollege"])
        
        # BASE STYLE - IDENTICAL FOR ALL BRANDS (only color and content change)
        base_style = """Highly stylized, hyper-detailed still-life composition. Dense, full-frame layout with absolutely NO empty or negative space. Objects must interlock, overlap, and fill the frame completely edge-to-edge. Semi-flat or slightly top-down perspective with controlled depth. Balanced but abundant composition - never sparse, never chaotic. NO centered subject, NO isolated focal object, NO plain or gradient backgrounds. Studio-crafted, digitally enhanced look - NOT candid, NOT natural photography. Polished surfaces, crisp edges, enhanced textures throughout. Ultra-sharp focus across the entire frame. Soft, even studio lighting with minimal harsh shadows. Subtle atmospheric depth with light bloom, fine particles, reflections, and surface detail. Every single pixel must contain intentional visual information."""
        
        # Build content-derived subject matter
        if content_context:
            subject_matter = f"Visual elements directly derived from this content: '{content_context}'. All objects, forms, structures, and motifs must clearly relate to this theme."
        else:
            # Fallback generic health/wellness subjects if no content provided
            subject_matter = "Visual elements depicting health, wellness, fitness, and vitality concepts. Objects representing nutrition, exercise, cellular biology, and healthy lifestyle."
        
        # Build the final prompt
        if user_prompt:
            # User provided custom prompt - adapt with brand colors
            prompt = f"{user_prompt} {base_style} COLOR PALETTE (MANDATORY): The entire image must be dominated by {palette['description']}. Primary color: {palette['primary']} ({palette['name']}). Use only subtle secondary accents. No cross-brand color leakage."
        else:
            # Standard prompt with content-derived subjects and brand colors
            prompt = f"{subject_matter} {base_style} COLOR PALETTE (MANDATORY): The entire image must be dominated by {palette['description']}. Primary color: {palette['primary']} ({palette['name']}). Use only subtle secondary accents for contrast. No other color families allowed."
        
        # Add unique identifier to ensure different images each time
        unique_id = str(uuid.uuid4())[:8]
        prompt = f"{prompt} [ID: {unique_id}]"
        
        print(f"\n{'='*80}")
        print(f"🎨 AI BACKGROUND GENERATION STARTED")
        print(f"{'='*80}")
        print(f"🏷️  Brand: {brand_name}")
        print(f"📝 Prompt length: {len(prompt)} chars")
        print(f"🆔 Unique ID: {unique_id}")
        print(f"📄 Full prompt: {prompt[:200]}...")  # Show first 200 chars
        print(f"{'='*80}\n")
        
        if progress_callback:
            progress_callback(f"Calling deAPI (FLUX.1-schnell) for {brand_name}...", 30)
        
        try:
            # Generate image using deAPI with FLUX.1-schnell (cheapest model)
            api_start = time.time()
            
            # Calculate dimensions (FLUX.1-schnell requires multiples of 128)
            # Our target is 1080x1920, round to nearest valid dimensions
            width = ((REEL_WIDTH + 127) // 128) * 128  # Round up to nearest 128
            height = ((REEL_HEIGHT + 127) // 128) * 128  # Round up to nearest 128
            
            print(f"📐 Target dimensions: {REEL_WIDTH}x{REEL_HEIGHT}")
            print(f"📐 Rounded dimensions: {width}x{height} (multiples of 128 required)")
            
            # Submit generation request
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
            
            payload = {
                "prompt": prompt,
                "model": "Flux1schnell",  # Cheapest model at $0.00136 for 512x512, 4 steps
                "width": width,
                "height": height,
                "steps": 4,  # Max steps for Flux1schnell is 10, using 4 for speed/cost
                "guidance": 0,  # Flux1schnell does not support guidance (must be 0)
                "seed": int(unique_id, 16) % (2**31),  # Convert unique_id to seed
                "loras": []
            }
            
            print(f"📊 API Request Parameters:")
            print(f"   Model: {payload['model']}")
            print(f"   Dimensions: {width}x{height}")
            print(f"   Steps: {payload['steps']}")
            print(f"   Seed: {payload['seed']}")
            print(f"🌐 Sending POST request to {self.base_url}/txt2img...")
            
            response = requests.post(
                f"{self.base_url}/txt2img",
                headers=headers,
                json=payload,
                timeout=120
            )
            
            print(f"📡 Response status code: {response.status_code}")
            response.raise_for_status()
            result = response.json()
            
            # Extract request_id from response (can be at root or nested in 'data')
            request_id = result.get("request_id") or result.get("data", {}).get("request_id")
            if not request_id:
                print(f"❌ ERROR: No request_id in response!")
                print(f"📄 Response: {result}")
                raise RuntimeError(f"No request_id in response: {result}")
            
            print(f"✅ Generation queued successfully!")
            print(f"📝 Request ID: {request_id}")
            print(f"⏳ Polling for results...")
            
            if progress_callback:
                progress_callback(f"Waiting for generation (ID: {request_id})...", 50)
            
            # Poll for results
            max_attempts = 90  # 90 attempts x 2 seconds = 3 minutes max
            attempt = 0
            
            while attempt < max_attempts:
                time.sleep(2)  # Wait 2 seconds between polls
                attempt += 1
                
                status_response = requests.get(
                    f"{self.base_url}/request-status/{request_id}",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=30
                )
                status_response.raise_for_status()
                status_result = status_response.json()
                
                # Extract data from response (deAPI nests everything in 'data')
                data = status_result.get("data", {})
                status = data.get("status")
                progress = data.get("progress", 0)
                
                if status == "done":
                    # Get result_url from the response
                    result_url = data.get("result_url")
                    if not result_url:
                        raise RuntimeError(f"No result_url in completed result: {status_result}")
                    
                    api_duration = time.time() - api_start
                    
                    if progress_callback:
                        progress_callback(f"Generation completed in {api_duration:.1f}s, downloading...", 70)
                    
                    # Download the generated image
                    download_start = time.time()
                    image_response = requests.get(result_url, timeout=60)
                    image_response.raise_for_status()
                    image = Image.open(BytesIO(image_response.content))
                    download_duration = time.time() - download_start
                    
                    if progress_callback:
                        progress_callback(f"Downloaded in {download_duration:.1f}s, resizing...", 85)
                    
                    # Resize to exact dimensions if needed
                    if image.size != (REEL_WIDTH, REEL_HEIGHT):
                        image = image.resize((REEL_WIDTH, REEL_HEIGHT), Image.Resampling.LANCZOS)
                    
                    # Darken the image by 5%
                    from PIL import ImageEnhance
                    enhancer = ImageEnhance.Brightness(image)
                    image = enhancer.enhance(0.95)  # 95% brightness = 5% darker
                    
                    total_duration = time.time() - start_time
                    
                    if progress_callback:
                        progress_callback(f"Background generated in {total_duration:.1f}s total", 100)
                    
                    print(f"✅ Successfully generated {REEL_WIDTH}x{REEL_HEIGHT} background for {brand_name}")
                    print(f"⏱️  Total time: {total_duration:.1f}s (API: {api_duration:.1f}s, Download: {download_duration:.1f}s)")
                    
                    return image
                
                elif status == "failed":
                    error_msg = status_result.get("error", "Unknown error")
                    raise RuntimeError(f"Generation failed: {error_msg}")
                
                elif status in ["pending", "processing"]:
                    if progress_callback:
                        progress_callback(f"Generating... (attempt {attempt}/{max_attempts})", 30 + (attempt * 20 // max_attempts))
                    continue
                
                else:
                    raise RuntimeError(f"Unknown status: {status}")
            
            raise RuntimeError(f"Generation timed out after {max_attempts} attempts (~{max_attempts * 2}s). The deAPI server may be overloaded. Try again or use a shorter prompt.")
            
        except requests.exceptions.Timeout as e:
            raise RuntimeError(f"Network timeout connecting to deAPI: {str(e)}. Check your internet connection.")
        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"Network error with deAPI: {str(e)}")
        except Exception as e:
            raise RuntimeError(f"Failed to generate AI background: {str(e)}")
