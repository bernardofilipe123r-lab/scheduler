"""
AI background generation service using deAPI.

REEL BACKGROUND ARCHITECTURE (3-layer):
  Layer 1 — Content Extraction: Receives title + content_lines, structures them
  Layer 2 — DeepSeek Prompt Engineering: Sends structured content to DeepSeek,
            receives a professional image-generation prompt
  Layer 3 — deAPI Image Generation: Sends the DeepSeek-crafted prompt to Flux/SDXL

POST BACKGROUNDS use a different path (prompt comes from content generation)
and are NOT affected by the reel 3-layer pipeline.

Uses a global FIFO queue to ensure only one DEAPI request runs at a time.
Includes retry logic with exponential backoff for 429 rate limit errors.
"""
import os
import json
import random
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
        self.last_deapi_prompt = None  # Stores the actual prompt sent to deAPI
    
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
        Generate an AI background image for a REEL using the 3-layer pipeline.

        Layer 1 — Content Extraction:
            Receives title + content_lines (via content_context) and structures
            them alongside NicheConfig visual settings.

        Layer 2 — DeepSeek Prompt Engineering:
            Sends the structured content to DeepSeek to generate a professional,
            cinematic image prompt optimized for Flux/SDXL.

        Layer 3 — deAPI Image Generation:
            Sends the DeepSeek-crafted prompt to deAPI for image generation.

        Args:
            brand_name: Brand name
            user_prompt: Custom prompt from user (optional — bypasses Layer 2)
            progress_callback: Callback function for progress updates (optional)
            content_context: Title or content lines to derive visuals from
            model_override: Force a specific deAPI model
            ctx: Optional PromptContext for niche-specific imagery

        Returns:
            PIL Image object with AI-generated background
        """
        start_time = time.time()

        if progress_callback:
            progress_callback("Preparing AI prompt...", 10)

        from app.core.prompt_context import PromptContext as _PC
        _ctx = ctx if ctx is not None else _PC()

        # ── LAYER 1: Content Extraction ──────────────────────────────
        # Gather structured content + visual settings from NicheConfig
        content_data = self._extract_content(content_context, _ctx, brand_name)

        if progress_callback:
            progress_callback("Generating image prompt via DeepSeek...", 15)

        # ── LAYER 2: DeepSeek Prompt Engineering ─────────────────────
        if user_prompt:
            # User explicitly provided a prompt — skip DeepSeek
            deapi_prompt = user_prompt
            print(f"📝 Using user-provided prompt (skipping DeepSeek)", flush=True)
        else:
            deapi_prompt = self._generate_prompt_via_deepseek(content_data)

        # Safety net: ensure no-text instruction is always present
        no_text_tag = "no text, no letters, no numbers, no words, no symbols, no logos, no watermarks"
        if no_text_tag not in deapi_prompt.lower():
            deapi_prompt = f"{deapi_prompt} Absolutely {no_text_tag}."

        # Store the final prompt so callers can read it back
        self.last_deapi_prompt = deapi_prompt

        print(f"\n{'='*80}")
        print(f"🎨 REEL BACKGROUND — 3-LAYER PIPELINE")
        print(f"{'='*80}")
        print(f"🏷️  Brand: {brand_name}")
        print(f"📝 DeepSeek prompt ({len(deapi_prompt)} chars):")
        print(f"   {deapi_prompt[:300]}{'...' if len(deapi_prompt) > 300 else ''}")
        print(f"{'='*80}\n")

        if progress_callback:
            progress_callback("Waiting in queue for deAPI...", 25)

        # ── LAYER 3: deAPI Image Generation ──────────────────────────
        return self._call_deapi(
            prompt=deapi_prompt,
            brand_name=brand_name,
            target_width=REEL_WIDTH,
            target_height=REEL_HEIGHT,
            model_override=model_override or "Flux1schnell",
            progress_callback=progress_callback,
            start_time=start_time,
            darken=0.95,  # 5% darker for reel backgrounds
        )

    # ================================================================
    # LAYER 1: Content Extraction
    # ================================================================

    def _extract_content(self, content_context: str, ctx, brand_name: str) -> dict:
        """
        Layer 1: Structure the reel content + NicheConfig visual settings
        into a clean dict that Layer 2 (DeepSeek) can reason over.

        This is pure data extraction — no prompt engineering here.
        """
        # Parse content_context (format: "TITLE | line1 | line2 | ...")
        title = ""
        content_lines = []
        if content_context:
            parts = [p.strip() for p in content_context.split("|")]
            title = parts[0] if parts else ""
            content_lines = parts[1:] if len(parts) > 1 else []

        # Load brand color palette
        color_description = "vibrant, colorful"
        try:
            from app.services.brands.resolver import brand_resolver
            brand = brand_resolver.get_brand(brand_name)
            if brand and brand.colors:
                color_name = brand.colors.get("color_name", "vibrant")
                color_description = f"vibrant {color_name} tones"
        except Exception:
            pass

        return {
            "title": title,
            "content_lines": content_lines,
            "niche_name": ctx.niche_name or "",
            "niche_description": ctx.niche_description or "",
            "image_style": ctx.image_style_description or "",
            "palette_keywords": ctx.image_palette_keywords or [],
            "composition_style": ctx.image_composition_style or "",
            "color_description": color_description,
        }

    # ================================================================
    # LAYER 2: DeepSeek Prompt Engineering
    # ================================================================

    def _generate_prompt_via_deepseek(self, content_data: dict) -> str:
        """
        Layer 2: Send structured content to DeepSeek and receive a
        professional image-generation prompt optimized for Flux/SDXL.

        The prompt DeepSeek returns is sent directly to deAPI (Layer 3).
        Falls back to a simple assembled prompt if DeepSeek is unavailable.
        """
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            print("⚠️ No DEEPSEEK_API_KEY — falling back to template prompt", flush=True)
            return self._fallback_prompt(content_data)

        # Build the DeepSeek request
        system_msg = self._build_layer2_system_prompt()
        user_msg = self._build_layer2_user_prompt(content_data)

        try:
            response = requests.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": system_msg},
                        {"role": "user", "content": user_msg},
                    ],
                    "temperature": 1.0,
                    "max_tokens": 300,
                },
                timeout=20,
            )

            if response.status_code == 200:
                data = response.json()
                prompt_text = data["choices"][0]["message"]["content"].strip()

                # Clean markdown fences if DeepSeek wrapped in ```
                if prompt_text.startswith("```"):
                    prompt_text = prompt_text.split("```")[1]
                    if prompt_text.startswith("json"):
                        prompt_text = prompt_text[4:]
                    prompt_text = prompt_text.strip()

                # Try JSON extraction if DeepSeek returned {"prompt": "..."}
                try:
                    parsed = json.loads(prompt_text)
                    if isinstance(parsed, dict) and "prompt" in parsed:
                        prompt_text = parsed["prompt"]
                except (json.JSONDecodeError, TypeError):
                    pass  # Not JSON — use raw text

                # Validate: must be at least 30 chars and not contain code/JSON
                if len(prompt_text) >= 30 and not prompt_text.startswith("{"):
                    print(f"✅ DeepSeek image prompt received ({len(prompt_text)} chars)", flush=True)
                    return prompt_text
                else:
                    print(f"⚠️ DeepSeek returned invalid prompt, falling back", flush=True)
                    return self._fallback_prompt(content_data)
            else:
                print(f"⚠️ DeepSeek API error {response.status_code}, falling back", flush=True)
                return self._fallback_prompt(content_data)

        except Exception as e:
            print(f"⚠️ DeepSeek call failed: {e}, falling back", flush=True)
            return self._fallback_prompt(content_data)

    def _build_layer2_system_prompt(self) -> str:
        """System prompt for DeepSeek Layer 2 — image prompt engineering."""
        return (
            "You are an expert visual prompt engineer for AI image generation models "
            "(Flux, Stable Diffusion). Your job is to create a **content-specific** "
            "background image prompt for an Instagram Reel.\n\n"
            "CRITICAL — CONTENT MATCHING:\n"
            "- The image MUST visually represent the SPECIFIC topic of the reel.\n"
            "- If the reel is about energy habits, show something related to energy.\n"
            "- If it's about hormones, show something related to hormonal health.\n"
            "- If it's about aging, show something about vitality or time.\n"
            "- NEVER default to a generic 'woman by a window' or 'glass of water' scene.\n"
            "- Each prompt must be UNIQUE — vary subjects, settings, compositions.\n\n"
            "CRITICAL — VARIETY:\n"
            "- Alternate between: aerial/bird's-eye, wide establishing, macro detail, \n"
            "  environmental portrait (no face), abstract texture, flat lay, dramatic angle.\n"
            "- Use DIFFERENT settings: labs, gyms, nature, cities, kitchens, studios, \n"
            "  bathrooms, bedrooms, markets, gardens, clinics, trails.\n"
            "- NEVER repeat the same composition style twice in a row.\n\n"
            "OUTPUT RULES:\n"
            "- Output ONLY the image prompt text. No JSON, no markdown, no explanation.\n"
            "- Describe a VISUAL SCENE with specific objects, textures, materials.\n"
            "- Always specify: lighting type, camera angle, depth of field, color mood.\n"
            "- NEVER include people's faces (backs, hands, silhouettes are OK).\n"
            "- NEVER include any written text, letters, numbers, or symbols.\n"
            "- End with: 'No text, no letters, no numbers, no symbols, no logos.'\n"
            "- Keep prompts 2-4 sentences (60-120 words).\n"
            "- Be SPECIFIC and UNEXPECTED. Surprise me."
        )

    # Palette terms that image models interpret as literal plants/objects
    _PALETTE_BLOCKLIST = {
        "sage", "eucalyptus", "linen", "terracotta", "lavender",
        "mint", "olive", "moss", "fern", "cedar", "rosemary",
    }

    # Scene-description phrases in image_style_description to strip
    _STYLE_SCENE_PHRASES = [
        "Think:",
        "morning kitchen counter",
        "sunlit herbs",
        "peaceful nature close-ups",
        "soft greenery",
    ]

    def _clean_style_description(self, raw_style: str) -> str:
        """Strip literal scene instructions from image_style_description so
        it only conveys mood/aesthetic, not specific scene content."""
        if not raw_style:
            return ""
        cleaned = raw_style
        for phrase in self._STYLE_SCENE_PHRASES:
            # Remove phrase and any trailing sentence fragment
            idx = cleaned.find(phrase)
            if idx != -1:
                # Remove from phrase to end of sentence (or end of string)
                end = cleaned.find(".", idx)
                if end != -1:
                    cleaned = cleaned[:idx] + cleaned[end + 1:]
                else:
                    cleaned = cleaned[:idx]
        # Clean up double spaces / leading-trailing
        return " ".join(cleaned.split()).strip(" .—-")

    def _clean_palette_keywords(self, keywords: list) -> list:
        """Filter out palette keywords that image models render as literal
        plants/objects instead of treating as colors."""
        return [
            kw for kw in keywords
            if kw.lower().strip() not in self._PALETTE_BLOCKLIST
        ]

    def _build_layer2_user_prompt(self, content_data: dict) -> str:
        """Build the user message for DeepSeek Layer 2 from structured content.
        Content topic is the PRIMARY driver; niche style is secondary mood guidance."""
        parts = []

        # ── Primary: Content (must drive the visual) ─────────────────
        parts.append(
            "Create a CONTENT-SPECIFIC image prompt for an Instagram Reel background."
        )

        if content_data["title"]:
            parts.append(f"\n>>> REEL TOPIC (this is what the image MUST represent): {content_data['title']}")

        if content_data["content_lines"]:
            lines_text = "; ".join(content_data["content_lines"][:4])
            parts.append(f">>> KEY POINTS (use these to choose scene elements): {lines_text}")

        # ── Secondary: Mood / color guidance (do NOT dictate the scene) ──
        if content_data["niche_name"]:
            parts.append(f"\nNiche (for mood only, NOT for scene content): {content_data['niche_name']}")

        cleaned_style = self._clean_style_description(content_data.get("image_style", ""))
        if cleaned_style:
            parts.append(f"Mood reference: {cleaned_style}")

        clean_palette = self._clean_palette_keywords(content_data.get("palette_keywords", []))
        if clean_palette:
            kw = ", ".join(clean_palette[:6])
            parts.append(f"Color palette (use as COLOR guidance only, not as objects): {kw}")

        if content_data.get("color_description"):
            parts.append(f"Brand color mood: {content_data['color_description']}")

        # ── Instructions ────────────────────────────────────────────
        parts.append(
            "\nIMPORTANT: The image must be ABOUT the reel topic, not a generic "
            "wellness/nature scene. Choose objects, settings, and compositions that "
            "a viewer would immediately associate with the specific subject matter. "
            "The image will have text overlaid, so keep the composition clean."
        )

        return "\n".join(parts)

    def _fallback_prompt(self, content_data: dict) -> str:
        """
        Fallback prompt when DeepSeek is unavailable.
        Derives a content-specific scene from the title + key points.
        """
        parts = []

        # Content-driven scene description
        title = content_data.get("title", "")
        if title:
            # Use title keywords to drive scene
            parts.append(
                f"A cinematic, atmospheric photograph representing the concept of: {title.lower()}"
            )
        else:
            parts.append(
                "Premium cinematic photography with dramatic lighting"
            )

        # Add key points for specificity
        lines = content_data.get("content_lines", [])
        if lines:
            subjects = ", ".join(lines[:2])
            parts.append(f"Visual elements related to: {subjects.lower()}")

        # Color palette (cleaned)
        clean_palette = self._clean_palette_keywords(
            content_data.get("palette_keywords", [])
        )
        if clean_palette:
            kw = ", ".join(clean_palette[:4])
            parts.append(f"Color palette: {kw}")

        parts.append("Sharp focus, magazine-quality, clean composition for text overlay.")
        parts.append(
            "No text, no letters, no numbers, no words, no symbols, "
            "no logos, no watermarks."
        )

        return " ".join(parts)

    # ================================================================
    # LAYER 3: deAPI Image Generation (shared by reels and posts)
    # ================================================================

    def _call_deapi(
        self,
        prompt: str,
        brand_name: str,
        target_width: int,
        target_height: int,
        model_override: str = "Flux1schnell",
        progress_callback=None,
        start_time: float = None,
        darken: float = None,
    ) -> Image.Image:
        """
        Layer 3: Submit a prompt to deAPI, poll for results, download image.

        Shared by both reel and post background generation.
        Handles queue, retry, polling, resize, and optional darkening.
        """
        if start_time is None:
            start_time = time.time()

        queue_pos = self._acquire_queue_position()
        print(f"🔒 Acquired DEAPI queue position", flush=True)

        try:
            use_model = model_override
            if progress_callback:
                progress_callback(f"Calling deAPI ({use_model}) for {brand_name}...", 30)

            api_start = time.time()

            # Dimension rounding per model
            if use_model == "ZImageTurbo_INT8":
                width = ((target_width + 15) // 16) * 16
                height = ((target_height + 15) // 16) * 16
            else:
                width = ((target_width + 127) // 128) * 128
                height = ((target_height + 127) // 128) * 128

            print(f"📐 Target: {target_width}x{target_height} → Rounded: {width}x{height} (model: {use_model})")

            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }

            seed = random.randint(0, 2**31 - 1)
            payload = {
                "prompt": prompt,
                "model": use_model,
                "width": width,
                "height": height,
                "seed": seed,
            }

            if use_model == "Flux1schnell":
                payload["steps"] = 4
                payload["guidance"] = 0
                payload["loras"] = []
            else:
                payload["steps"] = 8

            print(f"📊 model={use_model}, {width}x{height}, steps={payload['steps']}, seed={seed}")
            print(f"🌐 POST {self.base_url}/txt2img ...", flush=True)

            response = self._request_with_retry(
                "post",
                f"{self.base_url}/txt2img",
                headers=headers,
                json=payload,
                timeout=120,
            )

            result = response.json()
            request_id = result.get("request_id") or result.get("data", {}).get("request_id")
            if not request_id:
                raise RuntimeError(f"No request_id in response: {result}")

            print(f"✅ Queued — request_id: {request_id}", flush=True)

            if progress_callback:
                progress_callback(f"Generating image (ID: {request_id})...", 50)

            # Poll for result
            max_polls = 120 if use_model != "Flux1schnell" else 90
            for poll in range(1, max_polls + 1):
                time.sleep(2)

                status_resp = self._request_with_retry(
                    "get",
                    f"{self.base_url}/request-status/{request_id}",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=30,
                )
                data = status_resp.json().get("data", {})
                st = data.get("status")

                if st == "done":
                    result_url = data.get("result_url")
                    if not result_url:
                        raise RuntimeError(f"No result_url: {data}")

                    api_dur = time.time() - api_start
                    if progress_callback:
                        progress_callback(f"Done in {api_dur:.1f}s, downloading...", 70)

                    img_resp = requests.get(result_url, timeout=60)
                    img_resp.raise_for_status()
                    image = Image.open(BytesIO(img_resp.content))

                    if image.size != (target_width, target_height):
                        image = image.resize((target_width, target_height), Image.Resampling.LANCZOS)

                    if darken and darken < 1.0:
                        from PIL import ImageEnhance
                        image = ImageEnhance.Brightness(image).enhance(darken)

                    total_dur = time.time() - start_time
                    if progress_callback:
                        progress_callback(f"Background generated in {total_dur:.1f}s", 100)

                    print(f"✅ {target_width}x{target_height} background for {brand_name}")
                    print(f"⏱️  Total: {total_dur:.1f}s (API: {api_dur:.1f}s)", flush=True)
                    return image

                elif st == "failed":
                    raise RuntimeError(f"Generation failed: {data.get('error', 'Unknown')}")

                elif st in ("pending", "processing"):
                    if progress_callback:
                        progress_callback(
                            f"Generating... ({poll}/{max_polls})",
                            30 + (poll * 20 // max_polls),
                        )
                    continue
                else:
                    raise RuntimeError(f"Unknown status: {st}")

            raise RuntimeError(f"Generation timed out after {max_polls * 2}s")

        except requests.exceptions.Timeout as e:
            raise RuntimeError(f"Network timeout: {e}")
        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"Network error: {e}")
        except Exception as e:
            raise RuntimeError(f"Failed to generate background: {e}")
        finally:
            self._release_queue_position()
            print(f"🔓 Released DEAPI queue position", flush=True)

    # ================================================================
    # POST BACKGROUND (unaffected by the 3-layer reel pipeline)
    # ================================================================

    def generate_post_background(self, brand_name: str, user_prompt: str = None, progress_callback=None, model_override: str = None, ctx=None) -> Image.Image:
        """
        Generate a HIGH QUALITY AI background for carousel posts.

        Posts get their image prompts from DeepSeek during content generation
        (via ContentGenerator.generate_post_titles_batch), so this method
        receives the prompt directly — NO Layer 2 call needed.

        Uses 1080x1350 post dimensions.
        """
        start_time = time.time()

        if progress_callback:
            progress_callback("Preparing HQ image prompt...", 10)

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

        print(f"\n{'='*80}")
        print(f"🎨 POST BACKGROUND GENERATION (HQ)")
        print(f"{'='*80}")
        print(f"🏷️  Brand: {brand_name}")
        print(f"📝 Prompt ({len(prompt)} chars): {prompt[:200]}...")
        print(f"{'='*80}\n")

        if progress_callback:
            progress_callback("Waiting in queue for deAPI...", 25)

        return self._call_deapi(
            prompt=prompt,
            brand_name=brand_name,
            target_width=POST_WIDTH,
            target_height=POST_HEIGHT,
            model_override=model_override or "ZImageTurbo_INT8",
            progress_callback=progress_callback,
            start_time=start_time,
        )
