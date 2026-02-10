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
from datetime import datetime
import requests
from PIL import Image
from app.core.constants import REEL_WIDTH, REEL_HEIGHT, POST_WIDTH, POST_HEIGHT


# Global semaphore to ensure only one DEAPI request at a time
# Using a Semaphore instead of a custom FIFO queue to prevent deadlocks
_deapi_semaphore = threading.Semaphore(1)
_deapi_request_count = 0  # Track total requests for debugging
_deapi_last_request_time = None  # Track timing
_deapi_lock = threading.Lock()  # Only for protecting counters, NOT for queuing

# Queue acquisition timeout — prevents permanent deadlock
QUEUE_TIMEOUT = 90  # 1.5 minutes max wait for queue position

# Retry configuration for 429 errors
MAX_RETRIES = 5
INITIAL_RETRY_DELAY = 5  # seconds
MAX_RETRY_DELAY = 60  # seconds
MIN_REQUEST_INTERVAL = 0.5  # Minimum seconds between requests


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
        """Acquire the semaphore to make a DEAPI request. Times out after QUEUE_TIMEOUT seconds."""
        acquired = _deapi_semaphore.acquire(timeout=QUEUE_TIMEOUT)
        if not acquired:
            print(f"⚠️  DEAPI queue timeout after {QUEUE_TIMEOUT}s — forcing through (previous request likely deadlocked)", flush=True)
            # Force-reset the semaphore to recover from deadlock
            try:
                _deapi_semaphore.release()
            except ValueError:
                pass  # Already released
            _deapi_semaphore.acquire(timeout=10)
        return 0  # Position no longer tracked
    
    def _release_queue_position(self):
        """Release the semaphore so the next request can proceed."""
        try:
            _deapi_semaphore.release()
        except ValueError:
            pass  # Already released — safe to ignore
    
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
        global _deapi_request_count, _deapi_last_request_time
        
        retry_delay = INITIAL_RETRY_DELAY
        
        for attempt in range(MAX_RETRIES + 1):
            try:
                # Rate limiting: ensure minimum interval between requests
                with _deapi_lock:
                    now = time.time()
                    if _deapi_last_request_time is not None:
                        elapsed = now - _deapi_last_request_time
                        if elapsed < MIN_REQUEST_INTERVAL:
                            sleep_time = MIN_REQUEST_INTERVAL - elapsed
                            time.sleep(sleep_time)
                    
                    _deapi_request_count += 1
                    _deapi_last_request_time = time.time()
                    request_num = _deapi_request_count
                
                # Log request details
                endpoint = url.split("/")[-1] if "/" in url else url
                print(f"🌐 DEAPI Request #{request_num}: {method.upper()} .../{endpoint}", flush=True)
                
                if method.lower() == 'get':
                    response = requests.get(url, headers=headers, **kwargs)
                else:
                    response = requests.post(url, headers=headers, **kwargs)
                
                print(f"   Response: {response.status_code}", flush=True)
                
                # Check for rate limit
                if response.status_code == 429:
                    # Log the full response for debugging
                    print(f"   ❌ 429 Response body: {response.text[:500]}", flush=True)
                    print(f"   ❌ 429 Response headers: {dict(response.headers)}", flush=True)
                    
                    # Check if it's a daily limit (not recoverable by retry)
                    rate_limit_type = response.headers.get('X-RateLimit-Type', '')
                    daily_remaining = response.headers.get('X-RateLimit-Daily-Remaining', '')
                    retry_after = response.headers.get('Retry-After', '')
                    
                    if rate_limit_type == 'daily' or daily_remaining == '0':
                        hours_until_reset = int(retry_after) / 3600 if retry_after.isdigit() else 12
                        error_msg = (
                            f"DEAPI daily limit reached (200 requests/day on free tier). "
                            f"Resets in ~{hours_until_reset:.1f} hours. "
                            f"To remove daily caps, make any payment on deapi.ai to upgrade to Premium."
                        )
                        print(f"❌ DAILY LIMIT HIT: {error_msg}", flush=True)
                        raise RuntimeError(error_msg)
                    
                    if attempt < MAX_RETRIES:
                        # Use exponential backoff, ignore Retry-After header (often unreliable)
                        wait_time = retry_delay
                        
                        print(f"⚠️  Rate limited (429). Waiting {wait_time}s before retry {attempt + 1}/{MAX_RETRIES}...")
                        time.sleep(wait_time)
                        
                        # Exponential backoff for next attempt (5s -> 10s -> 20s -> 40s -> 60s max)
                        retry_delay = min(retry_delay * 2, MAX_RETRY_DELAY)
                        continue
                    else:
                        raise RuntimeError(f"Rate limited after {MAX_RETRIES} retries. DEAPI is overloaded. Try again later.")
                
                # For other errors, log full body and raise
                if response.status_code >= 400:
                    print(f"❌ HTTP {response.status_code} Error!", flush=True)
                    print(f"❌ Response body: {response.text[:1000]}", flush=True)
                    print(f"❌ Response headers: {dict(response.headers)}", flush=True)
                response.raise_for_status()
                return response
                
            except requests.exceptions.HTTPError as e:
                if e.response is not None:
                    print(f"❌ HTTPError {e.response.status_code}: {e.response.text[:1000]}", flush=True)
                    if e.response.status_code == 429:
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
        print(f"🔒 Acquired DEAPI queue position", flush=True)
        
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
        finally:
            self._release_queue_position()
            print(f"🔓 Released DEAPI queue position", flush=True)

    def generate_post_background(self, brand_name: str, user_prompt: str = None, progress_callback=None) -> Image.Image:
        """
        Generate a HIGH QUALITY AI background for posts using FLUX.2 Klein 4B BF16.
        
        This model produces significantly better images than Flux1schnell:
        - Higher fidelity details and textures
        - Better prompt adherence
        - More photorealistic output
        - Supports up to 1536px resolution
        
        Uses 1080x1350 post dimensions (16px steps for Flux2Klein).
        """
        start_time = time.time()
        
        if progress_callback:
            progress_callback("Preparing HQ image prompt...", 10)
        
        # For posts, we use the user prompt directly (already wellness-styled from AI)
        # Add a quality-boosting suffix with composition guidance
        quality_suffix = (
            "Ultra high quality, 8K, sharp focus, professional photography, "
            "soft natural lighting, premium lifestyle aesthetic. "
            "Photorealistic, detailed textures, beautiful composition. "
            "CRITICAL COMPOSITION: Subject must be centered in the UPPER HALF of the frame. "
            "The bottom third of the image should be soft bokeh, clean surface, or subtle gradient — "
            "NOT the main subject. Portrait orientation, slightly overhead camera angle, "
            "hero subject positioned in center-upper area of frame."
        )
        
        prompt = user_prompt or "Soft cinematic wellness still life with natural ingredients on white countertop in morning light."
        prompt = f"{prompt} {quality_suffix}"
        
        # Add unique identifier
        unique_id = str(uuid.uuid4())[:8]
        prompt = f"{prompt} [ID: {unique_id}]"
        
        print(f"\n{'='*80}")
        print(f"🎨 POST BACKGROUND GENERATION (HQ - Z-Image-Turbo)")
        print(f"{'='*80}")
        print(f"🏷️  Brand: {brand_name}")
        print(f"📝 Prompt length: {len(prompt)} chars")
        print(f"📄 Full prompt: {prompt[:200]}...")
        print(f"{'='*80}\n")
        
        if progress_callback:
            progress_callback("Waiting in queue for deAPI...", 25)
        
        queue_pos = self._acquire_queue_position()
        print(f"🔒 Acquired DEAPI queue position", flush=True)
        
        try:
            if progress_callback:
                progress_callback(f"Calling deAPI (Z-Image-Turbo — HQ) for {brand_name}...", 30)
            
            api_start = time.time()
            
            # Z-Image-Turbo INT8: 16px steps, up to 2048px, 1-50 steps
            # Higher quality than Flux1schnell, better prompt adherence
            # Post dimensions: 1080x1350 — round to nearest 16px
            width = ((POST_WIDTH + 15) // 16) * 16   # 1080 → 1088
            height = ((POST_HEIGHT + 15) // 16) * 16  # 1350 → 1360
            
            print(f"📐 Target: {POST_WIDTH}x{POST_HEIGHT} → Rounded: {width}x{height} (16px steps)")
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
            
            payload = {
                "prompt": prompt,
                "model": "ZImageTurbo_INT8",  # Higher quality than Flux1schnell
                "width": width,
                "height": height,
                "steps": 8,  # More steps = better quality (supports 1-50)
                "seed": int(unique_id, 16) % (2**31),
            }
            
            print(f"📊 API Request: model={payload['model']}, {width}x{height}, steps={payload['steps']}")
            print(f"📊 Full payload: {payload}", flush=True)
            
            response = self._request_with_retry(
                'post',
                f"{self.base_url}/txt2img",
                headers=headers,
                json=payload,
                timeout=120
            )
            
            # Log non-200 response bodies for debugging
            if response.status_code != 200:
                print(f"❌ API error {response.status_code}: {response.text[:500]}", flush=True)
            
            result = response.json()
            request_id = result.get("request_id") or result.get("data", {}).get("request_id")
            if not request_id:
                raise RuntimeError(f"No request_id in response: {result}")
            
            print(f"✅ Generation queued — Request ID: {request_id}")
            
            if progress_callback:
                progress_callback(f"Generating HQ image (ID: {request_id})...", 50)
            
            # Poll for results
            max_attempts = 120  # 120 × 2s = 4 minutes max (HQ takes longer)
            attempt = 0
            
            while attempt < max_attempts:
                time.sleep(2)
                attempt += 1
                
                status_response = self._request_with_retry(
                    'get',
                    f"{self.base_url}/request-status/{request_id}",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=30
                )
                status_result = status_response.json()
                data = status_result.get("data", {})
                status = data.get("status")
                
                if status == "done":
                    result_url = data.get("result_url")
                    if not result_url:
                        raise RuntimeError(f"No result_url in completed result: {status_result}")
                    
                    api_duration = time.time() - api_start
                    
                    if progress_callback:
                        progress_callback(f"HQ generation done in {api_duration:.1f}s, downloading...", 70)
                    
                    image_response = requests.get(result_url, timeout=60)
                    image_response.raise_for_status()
                    image = Image.open(BytesIO(image_response.content))
                    
                    # Resize to exact post dimensions
                    if image.size != (POST_WIDTH, POST_HEIGHT):
                        image = image.resize((POST_WIDTH, POST_HEIGHT), Image.Resampling.LANCZOS)
                    
                    total_duration = time.time() - start_time
                    
                    if progress_callback:
                        progress_callback(f"HQ background generated in {total_duration:.1f}s", 100)
                    
                    print(f"✅ HQ post background: {POST_WIDTH}x{POST_HEIGHT} for {brand_name}")
                    print(f"⏱️  Total: {total_duration:.1f}s (API: {api_duration:.1f}s)")
                    
                    return image
                
                elif status == "failed":
                    error_msg = status_result.get("error", "Unknown error")
                    raise RuntimeError(f"HQ generation failed: {error_msg}")
                
                elif status in ["pending", "processing"]:
                    if progress_callback:
                        progress_callback(f"Generating HQ image... ({attempt}/{max_attempts})", 30 + (attempt * 20 // max_attempts))
                    continue
                
                else:
                    raise RuntimeError(f"Unknown status: {status}")
            
            raise RuntimeError(f"HQ generation timed out after {max_attempts * 2}s")
            
        except requests.exceptions.Timeout as e:
            raise RuntimeError(f"Network timeout: {str(e)}")
        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"Network error: {str(e)}")
        except Exception as e:
            raise RuntimeError(f"Failed to generate HQ post background: {str(e)}")
        finally:
            self._release_queue_position()
            print(f"🔓 Released DEAPI queue position", flush=True)
