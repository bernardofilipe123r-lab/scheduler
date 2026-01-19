"""
AI background generation service using deAPI.
Uses a global FIFO queue to ensure only one DEAPI request runs at a time.
Includes retry logic with exponential backoff for 429 rate limit errors.
"""
import os
import uuid
import time
import threading
from pathlib import Path
from io import BytesIO
import requests
from PIL import Image
from app.core.constants import REEL_WIDTH, REEL_HEIGHT


# Global lock to ensure only one DEAPI request at a time (FIFO queue)
_deapi_lock = threading.Lock()
_deapi_queue_position = 0
_deapi_current_position = 0

# Retry configuration for 429 errors
MAX_RETRIES = 5
INITIAL_RETRY_DELAY = 5  # seconds
MAX_RETRY_DELAY = 60  # seconds


class AIBackgroundGenerator:
    """Service for generating AI backgrounds for dark mode using deAPI."""
    
    def __init__(self):
        """Initialize the AI background generator with deAPI client."""
        api_key = os.getenv("DEAPI_API_KEY")
        if not api_key:
            raise ValueError("DEAPI_API_KEY not found in environment variables")
        self.api_key = api_key
        self.base_url = "https://api.deapi.ai/api/v1/client"
    
    def _acquire_queue_position(self):
        """Get a position in the FIFO queue and wait for our turn."""
        global _deapi_queue_position, _deapi_current_position
        
        with _deapi_lock:
            my_position = _deapi_queue_position
            _deapi_queue_position += 1
        
        # Wait for our turn
        while True:
            with _deapi_lock:
                if _deapi_current_position == my_position:
                    break
            time.sleep(0.5)  # Poll every 500ms
        
        return my_position
    
    def _release_queue_position(self):
        """Release our position and let the next request proceed."""
        global _deapi_current_position
        with _deapi_lock:
            _deapi_current_position += 1
    
    def _request_with_retry(self, method: str, url: str, headers: dict, **kwargs) -> requests.Response:
        """
        Make an HTTP request with retry logic for 429 errors.
        
        Args:
            method: HTTP method ('get' or 'post')
            url: Request URL
            headers: Request headers
            **kwargs: Additional arguments for requests
            
        Returns:
            Response object
            
        Raises:
            RuntimeError: If all retries exhausted
        """
        retry_delay = INITIAL_RETRY_DELAY
        
        for attempt in range(MAX_RETRIES + 1):
            try:
                if method.lower() == 'get':
                    response = requests.get(url, headers=headers, **kwargs)
                else:
                    response = requests.post(url, headers=headers, **kwargs)
                
                # Check for rate limit
                if response.status_code == 429:
                    if attempt < MAX_RETRIES:
                        # Get retry-after header if available
                        retry_after = response.headers.get('Retry-After')
                        if retry_after:
                            try:
                                wait_time = int(retry_after)
                            except ValueError:
                                wait_time = retry_delay
                        else:
                            wait_time = retry_delay
                        
                        print(f"⚠️  Rate limited (429). Waiting {wait_time}s before retry {attempt + 1}/{MAX_RETRIES}...")
                        time.sleep(wait_time)
                        
                        # Exponential backoff for next attempt
                        retry_delay = min(retry_delay * 2, MAX_RETRY_DELAY)
                        continue
                    else:
                        raise RuntimeError(f"Rate limited after {MAX_RETRIES} retries. DEAPI is overloaded. Try again later.")
                
                # For other errors, raise immediately
                response.raise_for_status()
                return response
                
            except requests.exceptions.HTTPError as e:
                if e.response is not None and e.response.status_code == 429:
                    if attempt < MAX_RETRIES:
                        print(f"⚠️  Rate limited (429). Waiting {retry_delay}s before retry {attempt + 1}/{MAX_RETRIES}...")
                        time.sleep(retry_delay)
                        retry_delay = min(retry_delay * 2, MAX_RETRY_DELAY)
                        continue
                raise
        
        raise RuntimeError(f"Request failed after {MAX_RETRIES} retries")

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
        
        # Brand color palettes - BRIGHT, VIBRANT, SHINY colors
        color_palettes = {
            "gymcollege": {
                "name": "Vibrant Blue",
                "primary": "#2196F3",
                "accent": "#64B5F6",
                "description": "bright sky blue, vibrant azure, luminous cyan, sparkling light blue, with soft white and golden sunlight accents"
            },
            "healthycollege": {
                "name": "Fresh Green", 
                "primary": "#4CAF50",
                "accent": "#81C784",
                "description": "fresh lime green, vibrant leaf green, bright spring green, with soft yellow sunlight and white highlights"
            },
            "vitalitycollege": {
                "name": "Bright Turquoise",
                "primary": "#26C6DA", 
                "accent": "#4DD0E1",
                "description": "bright turquoise, sparkling teal, vibrant aquamarine, with white shimmer and golden sunlight accents"
            },
            "longevitycollege": {
                "name": "Radiant Azure",
                "primary": "#00BCD4",
                "accent": "#80DEEA",
                "description": "radiant azure, bright sky blue, luminous cyan, electric light blue, with white glow and warm sunlight touches"
            }
        }
        
        palette = color_palettes.get(brand_name, color_palettes["gymcollege"])
        
        # BASE STYLE - BRIGHT, COLORFUL, VIBRANT, SHINY (like the NaturaMatrix example)
        base_style = """BRIGHT, COLORFUL, VIBRANT still-life composition with SUNLIT atmosphere. Dense, full-frame layout filling every inch with objects. Light, airy, fresh feeling with SOFT GLOWING LIGHT throughout. Shallow water ripples, water droplets, moisture, and dewy surfaces. Soft bokeh light orbs floating in the background. Objects slightly submerged in shallow crystal-clear water with gentle ripples and reflections. Morning sunlight streaming in with lens flares and light rays. BRIGHT PASTEL background tones - NO DARK OR BLACK AREAS. Polished, glossy, shiny surfaces catching light. Ultra-sharp focus with dreamy soft glow around edges. Fresh, clean, healthy, optimistic, uplifting mood. Magazine-quality product photography style with enhanced saturation and vibrancy. Every surface should sparkle and shine. White highlights, soft shadows, luminous atmosphere."""
        
        # Build content-derived subject matter
        if content_context:
            subject_matter = f"Visual elements inspired by: '{content_context}'. Include relevant health/wellness objects: water bottles, fresh fruits, vegetables, fitness equipment, leaves, citrus slices, herbs, supplements, dumbbells, yoga mats, sneakers, salads, smoothies, clocks, measuring tape - whatever relates to the theme."
        else:
            # Fallback generic health/wellness subjects if no content provided
            subject_matter = "Include an abundance of health and wellness objects: glass water bottles, fresh fruits, colorful vegetables, green leaves, citrus slices, sneakers, dumbbells, yoga accessories, clocks, fresh salads, smoothie glasses, measuring tape, supplements."
        
        # Build the final prompt
        if user_prompt:
            # User provided custom prompt - adapt with brand colors
            prompt = f"{user_prompt} {base_style} COLOR PALETTE: Dominated by {palette['description']}. Primary accent: {palette['primary']}. MANDATORY: Bright, light, colorful image with NO dark areas, NO black backgrounds, NO moody lighting."
        else:
            # Standard prompt with content-derived subjects and brand colors
            prompt = f"{subject_matter} {base_style} COLOR PALETTE: Primary tones of {palette['description']}. Main accent color: {palette['primary']}. MANDATORY: Image must be BRIGHT, LIGHT, and COLORFUL. Absolutely NO dark backgrounds, NO black, NO shadowy or moody atmosphere."
        
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
            progress_callback(f"Waiting in queue for deAPI...", 25)
        
        # FIFO Queue: Wait for our turn to call DEAPI
        queue_pos = self._acquire_queue_position()
        print(f"🔒 Acquired DEAPI queue position: {queue_pos}")
        
        try:
            if progress_callback:
                progress_callback(f"Calling deAPI (FLUX.1-schnell) for {brand_name}...", 30)
            
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
            
            # Use retry wrapper for initial request
            response = self._request_with_retry(
                'post',
                f"{self.base_url}/txt2img",
                headers=headers,
                json=payload,
                timeout=120
            )
            
            print(f"📡 Response status code: {response.status_code}")
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
                
                # Use retry wrapper for status polling (also subject to 429)
                status_response = self._request_with_retry(
                    'get',
                    f"{self.base_url}/request-status/{request_id}",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=30
                )
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
                    
                    # Release queue position before returning
                    self._release_queue_position()
                    print(f"🔓 Released DEAPI queue position: {queue_pos}")
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
            self._release_queue_position()
            print(f"🔓 Released DEAPI queue position: {queue_pos} (timeout error)")
            raise RuntimeError(f"Network timeout connecting to deAPI: {str(e)}. Check your internet connection.")
        except requests.exceptions.RequestException as e:
            self._release_queue_position()
            print(f"🔓 Released DEAPI queue position: {queue_pos} (request error)")
            raise RuntimeError(f"Network error with deAPI: {str(e)}")
        except Exception as e:
            self._release_queue_position()
            print(f"🔓 Released DEAPI queue position: {queue_pos} (general error)")
            raise RuntimeError(f"Failed to generate AI background: {str(e)}")
