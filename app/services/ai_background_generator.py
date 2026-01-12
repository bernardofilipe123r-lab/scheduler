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
    
    def generate_background(self, brand_name: str, user_prompt: str = None, progress_callback=None) -> Image.Image:
        """
        Generate an AI background image based on brand.
        
        Args:
            brand_name: Brand name ("gymcollege" or "healthycollege")
            user_prompt: Custom prompt from user (optional)
            progress_callback: Callback function for progress updates (optional)
            
        Returns:
            PIL Image object with AI-generated background
        """
        start_time = time.time()
        
        if progress_callback:
            progress_callback("Preparing AI prompt...", 10)
        
        # If user provides custom prompt, adapt it with brand color tones
        if user_prompt:
            color_adaptations = {
                "gymcollege": " Overall color palette MUST be dominated by dark navy blue tones specifically #00435c (dark navy blue), absolutely NO green tones, use only deep midnight blues, dark navy blues, and steel blue hues with moody dark atmospheric lighting. Think deep ocean depths and midnight environments.",
                "healthycollege": " Overall color palette dominated by dark green tones specifically #004f00, deep forest greens, and rich emerald green hues with moody atmospheric lighting. Think dense forest and natural wellness environments.",
                "vitalitycollege": " Overall color palette MUST be dominated by vivid turquoise tones specifically #028f7a, bright teals, cyan, and aqua hues with vibrant atmospheric lighting. Think energetic tropical waters and dynamic vitality energy. Absolutely NO pinks or roses.",
                "longevitycollege": " Overall color palette MUST be dominated by light blue and cyan tones specifically #00c9ff (light blue), sky blues, bright cyan tones, and luminous blue hues with clear atmospheric lighting. Think clear skies, pristine waters, and cellular clarity. Absolutely NO warm tones like amber, gold, or yellows."
            }
            prompt = user_prompt + color_adaptations.get(brand_name, color_adaptations["gymcollege"])
        else:
            # Default prompts
            prompts = {
                "gymcollege": "A high-detail, cinematic health concept scene filling the entire frame with no empty space, featuring an oversized anatomical muscle fiber or human heart as the central focal subject, surrounded by molecular structures, protein chains, and energy particles in carefully arranged layers creating depth. Sharp, tactile microscopic cellular structures in the foreground with dark navy blue (#00435c) and deep midnight blue gradients, NO green tones whatsoever, glowing dark blue particles, and liquid effects in the background. Vivid saturated colors dominated by dark navy #00435c, deep midnight blue, and steel blue with contrasting warm yellow and orange accents for ATP energy and muscle activation. Studio-quality cinematic lighting with soft global illumination, subtle translucent glow on biological structures, and crisp highlights making everything pristine and idealized. Scientific, powerful mood visualizing hidden performance processes inside the athletic body, instantly readable at thumbnail size. Overall color palette strictly dark navy blue #00435c, deep midnight blues, and steel blues with moody dark atmospheric lighting, absolutely NO green.",
                "healthycollege": "A high-detail, cinematic health concept scene filling the entire frame with no empty space, featuring an oversized cluster of vibrant superfoods, fresh produce, or anatomical digestive system as the central focal subject, surrounded by vitamin molecules, antioxidant particles, and nutrient symbols in carefully arranged layers creating depth. Sharp, tactile food textures and cellular structures in the foreground with dark green (#004f00) and deep forest green gradients, glowing dark green wellness particles, and liquid nutrient effects in the background. Vivid saturated colors dominated by dark green #004f00, deep forest greens, and emerald tones with contrasting warm yellow, red, and orange accents from fruits and vital energy. Studio-quality cinematic lighting with soft global illumination, subtle translucent glow on organic elements, and crisp highlights making everything pristine and premium. Scientific, natural mood visualizing hidden wellness processes inside the healthy body, instantly readable at thumbnail size. Overall color palette dominated by dark green #004f00, deep forest greens, and rich emerald hues with moody atmospheric lighting.",
                "vitalitycollege": "A high-detail, cinematic vitality and wellness concept scene filling the entire frame with no empty space, featuring an oversized cellular rejuvenation structure, energy molecules, or flowing vitality streams as the central focal subject, surrounded by energy spirals, dynamic particles, and vitality elements in carefully arranged layers creating depth. Sharp, tactile organic structures in the foreground with vivid turquoise (#028f7a), bright teal, and cyan gradients, glowing turquoise particles, and flowing energy effects in the background. Vivid saturated colors dominated by vivid turquoise #028f7a, bright teal, and cyan with contrasting warm golden and coral accents for vitality energy and life force. Studio-quality cinematic lighting with soft global illumination, subtle translucent glow on organic structures, and crisp highlights making everything pristine and energetic. Dynamic, invigorating mood visualizing hidden vitality processes and cellular energy, instantly readable at thumbnail size. Overall color palette strictly vivid turquoise #028f7a, bright teals, cyan tones, and aqua hues with vibrant atmospheric lighting.",
                "longevitycollege": "A high-detail, cinematic longevity and cellular energy concept scene filling the entire frame with no empty space, featuring an oversized mitochondria, DNA helix, or telomere structures as the central focal subject, surrounded by ATP molecules, cellular particles, and bright light bursts in carefully arranged layers creating depth. Sharp, tactile cellular structures in the foreground with light blue (#00c9ff), sky blue, and cyan gradients, glowing bright blue energy particles, and radiant light effects in the background. Vivid saturated colors dominated by light blue #00c9ff, sky blues, and bright cyan tones with contrasting subtle silver and white accents for cellular clarity and longevity. Studio-quality cinematic lighting with soft global illumination, subtle translucent glow on biological structures, and crisp highlights making everything pristine and enlightened. Scientific, calm mood visualizing hidden longevity processes and cellular optimization, instantly readable at thumbnail size. Overall color palette strictly light blue #00c9ff, sky blues, bright cyan tones, and luminous blue hues with clear atmospheric lighting."
            }
            prompt = prompts.get(brand_name, prompts["gymcollege"])
        
        # Add unique identifier to ensure different images each time
        unique_id = str(uuid.uuid4())[:8]
        prompt = f"{prompt} [ID: {unique_id}]"
        
        print(f"🎨 Generating AI background for brand: {brand_name}")
        print(f"📝 Prompt length: {len(prompt)} chars")
        print(f"🆔 Unique ID: {unique_id}")
        
        if progress_callback:
            progress_callback(f"Calling deAPI (FLUX.1-schnell) for {brand_name}...", 30)
        
        try:
            # Generate image using deAPI with FLUX.1-schnell (cheapest model)
            api_start = time.time()
            
            # Calculate dimensions (FLUX.1-schnell requires multiples of 128)
            # Our target is 1080x1920, round to nearest valid dimensions
            width = ((REEL_WIDTH + 127) // 128) * 128  # Round up to nearest 128
            height = ((REEL_HEIGHT + 127) // 128) * 128  # Round up to nearest 128
            
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
            
            print(f"📊 Request params: {width}x{height}, {payload['steps']} steps")
            
            response = requests.post(
                f"{self.base_url}/txt2img",
                headers=headers,
                json=payload,
                timeout=120
            )
            response.raise_for_status()
            result = response.json()
            
            # Extract request_id from response (can be at root or nested in 'data')
            request_id = result.get("request_id") or result.get("data", {}).get("request_id")
            if not request_id:
                raise RuntimeError(f"No request_id in response: {result}")
            
            print(f"📝 Request ID: {request_id}")
            
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
