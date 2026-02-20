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

    def generate_background(self, brand_name: str, user_prompt: str = None, progress_callback=None, content_context: str = None, model_override: str = None, ctx=None) -> Image.Image:
        """
        Generate an AI background image based on brand.
        
        Args:
            brand_name: Brand name
            user_prompt: Custom prompt from user (optional)
            progress_callback: Callback function for progress updates (optional)
            content_context: Title or content lines to derive visual elements from (optional)
            ctx: Optional PromptContext for niche-specific imagery
            
        Returns:
            PIL Image object with AI-generated background
        """
        start_time = time.time()
        
        if progress_callback:
            progress_callback("Preparing AI prompt...", 10)
        
        # Load brand color palette from DB
        palette = {"name": "Default", "primary": "#2196F3", "accent": "#64B5F6", "description": "bright, vibrant, colorful tones with soft sunlight accents"}
        try:
            from app.services.brands.resolver import brand_resolver
            brand = brand_resolver.get_brand(brand_name)
            if brand and brand.colors:
                colors = brand.colors
                color_name = colors.get("color_name", "vibrant")
                primary = colors.get("primary", "#2196F3")
                accent = colors.get("accent", "#64B5F6")
                palette = {
                    "name": color_name.title(),
                    "primary": primary,
                    "accent": accent,
                    "description": f"vibrant {color_name} tones with luminous highlights"
                }
        except Exception:
            pass
        
        from app.core.prompt_templates import build_reel_base_style
        from app.core.prompt_context import PromptContext as _PC
        _ctx = ctx if ctx is not None else _PC()

        # Visual style — fully driven by NicheConfig, no health defaults
        base_style = build_reel_base_style(_ctx)

        # Subject matter — objects/elements to include in the image
        subject_matter = self._build_subject_matter(content_context, _ctx)
        
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
            # Determine which model to use
            use_model = model_override or "Flux1schnell"
            
            if progress_callback:
                progress_callback(f"Calling deAPI ({use_model}) for {brand_name}...", 30)
            
            api_start = time.time()
            
            # Calculate dimensions based on model requirements
            if use_model == "ZImageTurbo_INT8":
                # ZImageTurbo: 16px step multiples
                width = ((REEL_WIDTH + 15) // 16) * 16
                height = ((REEL_HEIGHT + 15) // 16) * 16
            else:
                # Flux1schnell: 128px step multiples
                width = ((REEL_WIDTH + 127) // 128) * 128
                height = ((REEL_HEIGHT + 127) // 128) * 128
            
            print(f"📐 Target dimensions: {REEL_WIDTH}x{REEL_HEIGHT}")
            print(f"📐 Rounded dimensions: {width}x{height} (model: {use_model})")
            
            # Submit generation request
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
            
            payload = {
                "prompt": prompt,
                "model": use_model,
                "width": width,
                "height": height,
                "seed": int(unique_id, 16) % (2**31),
            }
            
            # Model-specific parameters
            if use_model == "Flux1schnell":
                payload["steps"] = 4
                payload["guidance"] = 0
                payload["loras"] = []
            else:
                payload["steps"] = 8
            
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

    def _build_subject_matter(self, content_context: str = None, ctx=None) -> str:
        """
        Build the subject matter description for the deAPI image prompt.
        Uses NicheConfig when available. Never hardcodes niche-specific objects.
        Priority: palette_keywords > image_style_description > content_context > generic fallback.
        """
        from app.core.prompt_context import PromptContext as _PC
        if ctx is None:
            ctx = _PC()

        # Priority 1: explicit visual keywords from NicheConfig
        if ctx.image_palette_keywords:
            keywords_str = ", ".join(ctx.image_palette_keywords[:12])
            if content_context:
                return (
                    f"Visual elements inspired by the theme: '{content_context}'. "
                    f"Include niche-relevant objects: {keywords_str}."
                )
            return f"Niche-relevant objects arranged artistically: {keywords_str}."

        # Priority 2: general image style description
        if ctx.image_style_description:
            if content_context:
                return (
                    f"Visual elements inspired by: '{content_context}'. "
                    f"{ctx.image_style_description}."
                )
            return ctx.image_style_description

        # Priority 3: derive from content context alone
        if content_context:
            return (
                f"Premium, close-up visual elements inspired by the theme: '{content_context}'. "
                f"Contemporary, clean composition with objects that naturally match the concept. "
                f"High-quality studio aesthetic."
            )

        # Priority 4: truly generic
        return (
            "Premium studio still-life with elegant, contemporary objects arranged artistically. "
            "Clean surfaces, soft professional lighting, modern minimal aesthetic. "
            "High-quality, polished, sophisticated visual."
        )

    def generate_post_background(self, brand_name: str, user_prompt: str = None, progress_callback=None, model_override: str = None, ctx=None) -> Image.Image:
        """
        Generate a HIGH QUALITY AI background for posts.
        
        Uses 1080x1350 post dimensions (16px steps for ZImageTurbo).
        """
        start_time = time.time()
        
        if progress_callback:
            progress_callback("Preparing HQ image prompt...", 10)
        
        # For posts, we use the user prompt directly (already wellness-styled from AI)
        # Quality suffix imported from prompt_templates (single source of truth)
        from app.core.prompt_templates import POST_QUALITY_SUFFIX
        
        from app.core.prompt_context import PromptContext as _PC
        _ctx = ctx if ctx is not None else _PC()
        if user_prompt:
            prompt = user_prompt
        elif _ctx.image_style_description:
            prompt = f"{_ctx.image_style_description}. Premium close-up photography style."
        elif _ctx.image_composition_style:
            prompt = f"{_ctx.image_composition_style}. Clean, close-up, professional studio shot."
        else:
            prompt = (
                "Soft cinematic premium still-life with elegant contemporary objects "
                "on a clean surface in soft studio light."
            )
        prompt = f"{prompt} {POST_QUALITY_SUFFIX}"
        
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
            # Determine which model to use
            use_model = model_override or "ZImageTurbo_INT8"
            
            if progress_callback:
                progress_callback(f"Calling deAPI ({use_model}) for {brand_name}...", 30)
            
            api_start = time.time()
            
            # Calculate dimensions based on model requirements
            if use_model == "Flux1schnell":
                width = ((POST_WIDTH + 127) // 128) * 128
                height = ((POST_HEIGHT + 127) // 128) * 128
            else:
                # ZImageTurbo: 16px step multiples
                width = ((POST_WIDTH + 15) // 16) * 16   # 1080 → 1088
                height = ((POST_HEIGHT + 15) // 16) * 16  # 1350 → 1360
            
            print(f"📐 Target: {POST_WIDTH}x{POST_HEIGHT} → Rounded: {width}x{height} (model: {use_model})")
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
            
            payload = {
                "prompt": prompt,
                "model": use_model,
                "width": width,
                "height": height,
                "seed": int(unique_id, 16) % (2**31),
            }
            
            # Model-specific parameters
            if use_model == "Flux1schnell":
                payload["steps"] = 4
                payload["guidance"] = 0
                payload["loras"] = []
            else:
                payload["steps"] = 8
            
            print(f"📊 API Request: model={payload['model']}, {width}x{height}, steps={payload.get('steps')}")
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
