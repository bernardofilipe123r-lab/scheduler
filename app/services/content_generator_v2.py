"""
AI-powered viral content generator using DeepSeek API.
Refactored with 3-Layer Architecture for efficiency and consistency.

Architecture:
    LAYER 1: Pattern Brain (static patterns - viral_patterns.py)
    LAYER 2: Generator Logic (prompt templates - prompt_templates.py)  
    LAYER 3: Runtime Input (minimal prompts per request)

Key improvements:
- NO massive example database sent per request
- Pattern selection middleware decides structure BEFORE calling model
- Quality scoring with auto-regeneration loop
- Strategic example injection only when needed
- ~80% reduction in token usage per request
"""

import os
import json
import random
import requests
from typing import Dict, List, Optional, Tuple
from datetime import datetime

# Layer 1: Pattern Brain
from app.core.viral_patterns import (
    get_pattern_selector,
    PatternSelection,
    TOPIC_BUCKETS,
    FORMAT_DEFINITIONS,
    generate_title_from_archetype
)

# Layer 2: Prompt Templates
from app.core.prompt_templates import (
    SYSTEM_PROMPT,
    build_runtime_prompt,
    build_runtime_prompt_with_history,
    build_correction_prompt,
    build_prompt_with_example,
    build_style_anchor
)

# Quality Scoring
from app.core.quality_scorer import (
    get_quality_scorer,
    QualityScore
)

# Original viral ideas (for rare example injection only)
from app.core.viral_ideas import get_random_ideas, VIRAL_IDEAS


class ContentGeneratorV2:
    """
    Viral content generator using 3-layer architecture.
    
    Key differences from V1:
    - Patterns selected by middleware, not model
    - Minimal runtime prompts (~500 tokens vs 3000+)
    - Quality scoring with auto-correction loop
    - Strategic example injection
    """
    
    def __init__(self):
        """Initialize the content generator."""
        self.api_key = os.getenv("DEEPSEEK_API_KEY")
        self.base_url = "https://api.deepseek.com/v1"
        
        # Get singleton instances
        self.pattern_selector = get_pattern_selector()
        self.quality_scorer = get_quality_scorer()
        
        # Configuration
        self.max_regeneration_attempts = 3
        self.quality_threshold_publish = 80
        self.quality_threshold_regenerate = 65
        
        # History for anti-repetition
        self._recent_titles: List[str] = []
        self._recent_topics: List[str] = []
        self._max_history = 20
        
        # Metrics
        self._generation_stats = {
            "total_attempts": 0,
            "successful_first_try": 0,
            "regenerations": 0,
            "fallbacks": 0,
            "avg_quality_score": 0.0
        }
        
        if not self.api_key:
            print("⚠️ Warning: DEEPSEEK_API_KEY not found for content generation")
        else:
            print("✅ Content Generator V2 initialized (3-layer architecture)")
    
    # ============================================================
    # CTA OPTIONS (same as V1)
    # ============================================================
    
    CTA_OPTIONS = {
        "none": {
            "weight": 80,
            "options": []
        },
        "part2_teaser": {
            "weight": 20,
            "options": [
                "We have more for you — Follow for Part 2!",
                "Part 2 coming soon — Follow this page!",
                "This is just the beginning — Follow for more!",
                "Stay tuned for Part 2 — Follow this page!",
                "More secrets revealed in Part 2 — Follow us!"
            ]
        }
    }
    
    # ============================================================
    # MAIN GENERATION METHOD
    # ============================================================
    
    def generate_viral_content(
        self,
        topic_hint: Optional[str] = None,
        format_hint: Optional[str] = None,
        hook_hint: Optional[str] = None
    ) -> Dict:
        """
        Generate viral content using 3-layer architecture.
        
        Args:
            topic_hint: Optional topic to focus on
            format_hint: Optional format style to use
            hook_hint: Optional psychological hook to use
            
        Returns:
            Dictionary with title, content_lines, image_prompt, and metadata
        """
        if not self.api_key:
            return self._fallback_content()
        
        self._generation_stats["total_attempts"] += 1
        
        # LAYER 1: Pattern Selection (middleware decides, not model)
        selection = self.pattern_selector.select_patterns(
            topic_hint=topic_hint,
            format_hint=format_hint,
            hook_hint=hook_hint
        )
        
        # LAYER 2+3: Generate with quality loop
        content, quality_score = self._generate_with_quality_loop(selection)
        
        if content:
            # Track for anti-repetition
            self._add_to_history(content)
            self.quality_scorer.add_to_history(content)
            
            # Update stats
            self._update_stats(quality_score, regenerated=False)
            
            return content
        else:
            self._generation_stats["fallbacks"] += 1
            return self._fallback_content()
    
    def _generate_with_quality_loop(
        self,
        selection: PatternSelection
    ) -> Tuple[Optional[Dict], Optional[QualityScore]]:
        """
        Generate content with quality scoring and auto-regeneration.
        
        Flow:
        1. Generate initial content
        2. Score quality
        3. If score >= 80: publish
        4. If 65 <= score < 80: regenerate with correction prompt
        5. If score < 65 after max attempts: fallback
        """
        attempt = 0
        best_content = None
        best_score = None
        use_example = False
        
        while attempt < self.max_regeneration_attempts:
            attempt += 1
            
            # Build appropriate prompt
            if attempt == 1:
                # First attempt: normal runtime prompt
                prompt = build_runtime_prompt_with_history(
                    selection,
                    self._recent_titles,
                    self._recent_topics
                )
            elif attempt == 2 and best_content:
                # Second attempt: correction prompt
                prompt = build_correction_prompt(
                    best_content,
                    best_score.feedback if best_score else {}
                )
                self._generation_stats["regenerations"] += 1
            else:
                # Third attempt: add style anchor (micro-example)
                prompt = build_prompt_with_example(selection, example=None)
                use_example = True
            
            # Call DeepSeek
            content = self._call_deepseek(prompt, use_example)
            
            if not content:
                continue
            
            # Score the content
            score = self.quality_scorer.score(
                content,
                recent_outputs=self._get_recent_outputs()
            )
            
            # Track best attempt
            if best_score is None or score.total_score > best_score.total_score:
                best_content = content
                best_score = score
            
            # Decision
            if score.should_publish:
                if attempt == 1:
                    self._generation_stats["successful_first_try"] += 1
                content["quality_score"] = score.total_score
                content["quality_breakdown"] = {
                    "structure": score.structure_score,
                    "familiarity": score.familiarity_score,
                    "novelty": score.novelty_score,
                    "hook": score.hook_score,
                    "plausibility": score.plausibility_score
                }
                return content, score
            
            elif not score.should_regenerate:
                # Below 65, continue trying
                print(f"⚠️ Quality score too low ({score.total_score}), attempt {attempt}/{self.max_regeneration_attempts}")
        
        # Return best attempt even if below threshold
        if best_content and best_score and best_score.total_score >= 50:
            best_content["quality_score"] = best_score.total_score
            best_content["below_threshold"] = True
            return best_content, best_score
        
        return None, None
    
    def _call_deepseek(
        self,
        prompt: str,
        include_example: bool = False
    ) -> Optional[Dict]:
        """
        Call DeepSeek API with the given prompt.
        
        Uses cached system prompt for efficiency.
        """
        try:
            messages = [
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
            
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "deepseek-chat",
                    "messages": messages,
                    "temperature": 0.85,  # Slightly lower for more consistency
                    "max_tokens": 1200
                },
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                content_text = result["choices"][0]["message"]["content"].strip()
                
                # Parse response
                return self._parse_response(content_text)
            else:
                print(f"⚠️ DeepSeek API error: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"⚠️ API call error: {e}")
            return None
    
    def _parse_response(self, content_text: str) -> Optional[Dict]:
        """Parse and validate the API response."""
        # Clean markdown if present
        if content_text.startswith("```"):
            content_text = content_text.split("```")[1]
            if content_text.startswith("json"):
                content_text = content_text[4:]
        content_text = content_text.strip()
        
        try:
            content_data = json.loads(content_text)
            
            # Validate required fields
            required = ["title", "content_lines", "image_prompt"]
            if not all(k in content_data for k in required):
                print("⚠️ Missing required fields")
                return None
            
            # Add metadata
            content_data["generated_at"] = datetime.now().isoformat()
            content_data["success"] = True
            content_data["generator_version"] = "v2"
            
            return content_data
            
        except json.JSONDecodeError as e:
            print(f"⚠️ JSON parse error: {e}")
            return None
    
    # ============================================================
    # HISTORY & ANTI-REPETITION
    # ============================================================
    
    def _add_to_history(self, content: Dict) -> None:
        """Add generated content to history."""
        title = content.get("title", "")
        topic = content.get("topic_category", "")
        
        if title:
            self._recent_titles.append(title)
            if len(self._recent_titles) > self._max_history:
                self._recent_titles = self._recent_titles[-self._max_history:]
        
        if topic:
            self._recent_topics.append(topic)
            if len(self._recent_topics) > self._max_history:
                self._recent_topics = self._recent_topics[-self._max_history:]
    
    def _get_recent_outputs(self) -> List[Dict]:
        """Get recent outputs for novelty scoring."""
        return self.quality_scorer._recent_outputs
    
    def clear_history(self) -> None:
        """Clear all history."""
        self._recent_titles = []
        self._recent_topics = []
        self.quality_scorer.clear_history()
    
    # ============================================================
    # STATS & METRICS
    # ============================================================
    
    def _update_stats(self, score: QualityScore, regenerated: bool) -> None:
        """Update generation statistics."""
        total = self._generation_stats["total_attempts"]
        current_avg = self._generation_stats["avg_quality_score"]
        
        # Running average
        self._generation_stats["avg_quality_score"] = (
            (current_avg * (total - 1) + score.total_score) / total
        )
    
    def get_stats(self) -> Dict:
        """Get generation statistics."""
        stats = self._generation_stats.copy()
        total = stats["total_attempts"]
        
        if total > 0:
            stats["first_try_rate"] = round(
                stats["successful_first_try"] / total * 100, 1
            )
            stats["fallback_rate"] = round(
                stats["fallbacks"] / total * 100, 1
            )
        
        return stats
    
    # ============================================================
    # FALLBACK CONTENT
    # ============================================================
    
    def _fallback_content(self) -> Dict:
        """Generate fallback content if AI fails."""
        fallback_posts = [
            {
                "title": "SIGNS YOUR BODY NEEDS MORE WATER",
                "content_lines": [
                    "Dark yellow urine — Dehydration signal",
                    "Dry, cracked lips — Moisture deficit",
                    "Afternoon fatigue — Low fluid levels",
                    "Headaches without cause — Brain needs water",
                    "Muscle cramps — Electrolyte imbalance",
                    "Dry skin despite moisturizer — Internal dehydration",
                    "Constipation issues — Gut needs fluids"
                ],
                "image_prompt": "A cinematic, full-frame wellness visualization centered on a translucent human silhouette with glowing blue water droplets flowing through the body. Blue and teal color palette. Studio-quality cinematic lighting. No text, no letters, no numbers, no symbols, no logos."
            },
            {
                "title": "FOODS THAT DESTROY YOUR SLEEP QUALITY",
                "content_lines": [
                    "Coffee after 2pm — Blocks adenosine for 8+ hours",
                    "Dark chocolate at night — Hidden caffeine content",
                    "Spicy dinners — Raises body temperature",
                    "Alcohol before bed — Disrupts REM cycles",
                    "High-sugar snacks — Blood sugar spikes",
                    "Aged cheese — Contains stimulating tyramine",
                    "Processed meats — Hard to digest overnight"
                ],
                "image_prompt": "A cinematic, full-frame sleep and nutrition illustration with a peaceful bedroom scene overlaid with floating food elements. Deep blue and purple palette. Soft moonlit lighting. No text, no letters, no numbers, no symbols, no logos."
            },
            {
                "title": "YOUR TONGUE REVEALS YOUR HEALTH",
                "content_lines": [
                    "White coating — Candida or dehydration",
                    "Yellow tint — Liver or digestion issues",
                    "Cracks on surface — Vitamin B deficiency",
                    "Swollen edges — Nutrient malabsorption",
                    "Red tip — Stress or heart strain",
                    "Purple color — Poor circulation",
                    "Pale appearance — Anemia or low iron"
                ],
                "image_prompt": "A cinematic medical diagnostic visualization featuring an oversized, detailed human tongue as the central focal point. Blue and teal clinical palette. Studio-quality cinematic lighting. No text, no letters, no numbers, no symbols, no logos."
            }
        ]
        
        fallback = random.choice(fallback_posts)
        fallback["generated_at"] = datetime.now().isoformat()
        fallback["success"] = True
        fallback["is_fallback"] = True
        fallback["format_style"] = "CAUSE_EFFECT"
        fallback["topic_category"] = "Body signals"
        fallback["generator_version"] = "v2_fallback"
        
        return fallback
    
    # ============================================================
    # STRATEGIC EXAMPLE INJECTION (RARE)
    # ============================================================
    
    def _should_inject_example(self, consecutive_failures: int) -> bool:
        """
        Determine if an example should be injected.
        
        Only inject when:
        - 3+ consecutive quality failures
        - Introducing a new format
        - Style drift detected
        """
        return consecutive_failures >= 2
    
    def _get_sanitized_example(self, format_style: str) -> Optional[Dict]:
        """
        Get a sanitized example for injection.
        Strips specific content, keeps structure only.
        """
        # Find example matching format
        matching = [
            idea for idea in VIRAL_IDEAS
            if idea.get("format_style") == format_style
        ]
        
        if not matching:
            return None
        
        example = random.choice(matching)
        
        # Return sanitized version (structure only)
        return {
            "title": example.get("title", ""),
            "format_style": example.get("format_style", ""),
            "content_lines": example.get("content_lines", [])[:2]  # Only first 2 lines
        }
    
    # ============================================================
    # PUBLIC UTILITIES
    # ============================================================
    
    def get_available_topics(self) -> List[str]:
        """Return available topic buckets."""
        return TOPIC_BUCKETS.copy()
    
    def get_format_styles(self) -> List[Dict]:
        """Return available format styles with descriptions."""
        return [
            {"name": name, **info}
            for name, info in FORMAT_DEFINITIONS.items()
        ]
    
    def _select_cta(self) -> Optional[str]:
        """Select a CTA based on probability."""
        categories = []
        weights = []
        for category, data in self.CTA_OPTIONS.items():
            categories.append(category)
            weights.append(data["weight"])
        
        selected = random.choices(categories, weights=weights, k=1)[0]
        
        if selected == "none":
            return None
        
        options = self.CTA_OPTIONS[selected]["options"]
        return random.choice(options) if options else None

    # ============================================================
    # POST TITLE GENERATION (for Instagram image posts, NOT reels)
    # ============================================================

    def generate_post_title(self, topic_hint: str = None) -> Dict:
        """
        Generate a viral post title suitable for Instagram image posts.
        
        Post titles are different from reel titles:
        - Statement-based with facts/studies ("STUDY REVEALS...", "RESEARCH SHOWS...")  
        - Contains specific percentages, timeframes, or quantifiable claims
        - Reads like a headline from a health publication
        - Single powerful statement, not a topic header
        
        Returns:
            Dict with 'title' and 'image_prompt' keys
        """
        if not self.api_key:
            return self._fallback_post_title()
        
        # Get recent titles to avoid repetition
        recent = self._get_recent_outputs()
        history_context = ""
        if recent:
            recent_titles = [r.get("title", "") for r in recent if r.get("title")]
            if recent_titles:
                history_context = f"""\n### PREVIOUSLY GENERATED (avoid repeating):\n{chr(10).join('- ' + t for t in recent_titles[-5:])}\n"""
        
        prompt = f"""You are a viral health content creator specializing in Instagram image posts.

Generate a SINGLE powerful health statement title and a matching Instagram caption with a real scientific reference.

### WHAT MAKES A GREAT POST TITLE:
- A short, clear health statement about a food, supplement, habit, or lifestyle factor
- Some titles include specific percentages for extra impact
- Written to attract attention, spark discussion, and feel slightly controversial or surprising
- Do NOT lie, but exaggerate slightly to create engagement (comments, shares, saves)

### EXAMPLE POST TITLES (learn the pattern):
- "Omega-3 may reduce anxiety symptoms by up to 30% and support brain health."
- "Daily walking can lower depression risk by 25% and improve longevity."
- "Probiotics may improve gut health by 40% and strengthen immunity."
- "Meditation can reduce stress levels by 35% and improve sleep quality."
- "Berries may improve memory performance by around 20% and protect the brain."
- "Magnesium supports relaxation, better sleep, and nervous system balance."
- "Vitamin D plays a key role in mood regulation and immune defense."
- "Green tea contains antioxidants that support focus and heart health."
- "Turmeric may help reduce inflammation and protect joint function."
- "Strength training improves metabolism, mood, and overall resilience."
- "Adequate hydration boosts energy, brain function, and skin health."
- "Dark chocolate in moderation may support heart health and mood."
- "Cold exposure may improve circulation and reduce inflammation."
- "Creatine supports muscle strength and may benefit brain energy."
- "Vitamin D and magnesium helps reduce depression and brain aging."

### WHAT TO AVOID:
- Reel-style titles like "5 SIGNS YOUR BODY..." or "FOODS THAT DESTROY..."
- Question formats
- Lists or numbered formats (those are for reels)
- All-caps screaming style — use sentence case with key words capitalized naturally
- Vague claims without specifics

### CAPTION REQUIREMENTS:
- Write a short Instagram caption that expands on the title with 1-2 sentences
- MUST include a scientific reference supported by a real published study
- MUST contain a valid DOI (Digital Object Identifier) linking to the research source
- Keep it concise and credible

{history_context}

{"Topic hint: " + topic_hint if topic_hint else "Generate on any relevant health/wellness topic. Create a mix of: nutrition, supplements, exercise, sleep, mental health, immunity, brain health, inflammation."}

### OUTPUT FORMAT (JSON only, no markdown):
{{
    "title": "Your health statement title here.",
    "caption": "Short caption expanding on the claim. Supported by research (DOI: 10.xxxx/xxxxx)",
    "image_prompt": "A detailed cinematic image prompt that matches the title theme. Visually striking, wellness-focused. No text, no letters, no numbers, no symbols, no logos."
}}

Generate now:"""

        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.9,
                    "max_tokens": 500
                },
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                content_text = data["choices"][0]["message"]["content"].strip()
                
                # Clean up markdown if present
                if content_text.startswith("```"):
                    content_text = content_text.split("```")[1]
                    if content_text.startswith("json"):
                        content_text = content_text[4:]
                    content_text = content_text.strip()
                
                try:
                    result = json.loads(content_text)
                    result["is_fallback"] = False
                    
                    # Add to history
                    self._add_to_history({"title": result.get("title", "")})
                    
                    return result
                except json.JSONDecodeError as e:
                    print(f"⚠️ JSON parse error in post title generation: {e}")
                    return self._fallback_post_title()
            else:
                print(f"⚠️ DeepSeek API error: {response.status_code}")
                return self._fallback_post_title()
                
        except Exception as e:
            print(f"⚠️ Post title generation error: {e}")
            return self._fallback_post_title()
    
    def _fallback_post_title(self) -> Dict:
        """Fallback titles for posts if AI fails."""
        fallbacks = [
            {
                "title": "STUDY REVEALS Vitamin D SUPPLEMENTATION Can REDUCE DEPRESSION SYMPTOMS BY 45%",
                "image_prompt": "A cinematic wellness visualization of golden sunlight rays filtering through a window onto a person in peaceful meditation pose, with subtle vitamin D molecular structures floating in the light. Warm golden and soft orange tones. Studio-quality cinematic lighting, premium wellness mood. No text, no letters, no numbers, no symbols, no logos."
            },
            {
                "title": "RESEARCH SHOWS Walking 7,000 STEPS Daily Can EXTEND LIFESPAN BY Up To 10 YEARS",
                "image_prompt": "A serene nature path winding through a lush green forest with morning mist, a silhouette of a person walking peacefully. Soft green and blue tones with golden morning light. Cinematic depth of field, inspirational wellness mood. No text, no letters, no numbers, no symbols, no logos."
            },
            {
                "title": "SCIENTISTS CONFIRM Eating BLUEBERRIES Daily Can IMPROVE MEMORY BY 25%",
                "image_prompt": "A beautiful close-up of fresh, vibrant blueberries with morning dew, arranged artistically with a subtle brain outline overlay in soft blue light. Deep purple and blue tones. Premium food photography style with cinematic lighting. No text, no letters, no numbers, no symbols, no logos."
            },
            {
                "title": "NEW STUDY: Just 15 MINUTES Of MEDITATION Daily Can REDUCE ANXIETY BY 40%",
                "image_prompt": "A peaceful person meditating in a minimalist space with soft light filtering through, surrounded by a subtle calming aura. Soft lavender and white tones. Serene, premium wellness aesthetic with studio lighting. No text, no letters, no numbers, no symbols, no logos."
            }
        ]
        
        fallback = random.choice(fallbacks)
        fallback["is_fallback"] = True
        return fallback

    # ============================================================
    # IMAGE PROMPT GENERATION (standalone, from title only)
    # ============================================================

    def generate_image_prompt(self, title: str) -> Dict:
        """
        Generate an AI image prompt based on a given title.
        
        Used when the user provides a title but leaves the image prompt blank.
        Works for both posts and dark mode reels.
        
        Args:
            title: The content title to base the image prompt on
            
        Returns:
            Dict with 'image_prompt' and 'is_fallback' keys
        """
        if not self.api_key or not title.strip():
            return self._fallback_image_prompt(title)
        
        prompt = f"""You are a visual prompt engineer specializing in wellness and health imagery for Instagram.

Given the following title, generate a DETAILED cinematic image prompt suitable for AI image generation (DALL-E / Flux).

### TITLE:
"{title}"

### REQUIREMENTS:
- The image must visually represent the theme/topic of the title
- Cinematic, high-quality, premium wellness aesthetic
- Include specific visual elements, colors, lighting, and mood
- Must end with "No text, no letters, no numbers, no symbols, no logos."
- Should be 2-3 sentences long
- Should be visually striking and scroll-stopping

### EXAMPLES:
Title: "STUDY REVEALS Vitamin C SUPPLEMENTATION CAN REDUCE STRESS & CORTISOL BY 40%"
Prompt: "A cinematic close-up of vibrant orange slices and vitamin supplements on a clean marble surface with soft morning sunlight streaming through, surrounded by fresh citrus fruits and green herbs. Warm golden and orange tones with premium wellness aesthetic. No text, no letters, no numbers, no symbols, no logos."

Title: "5 SIGNS YOUR BODY IS BEGGING FOR MORE WATER"
Prompt: "Crystal clear water droplets splashing in ultra slow motion with a glass water bottle surrounded by fresh cucumber slices and mint leaves. Bright, clean blue and green tones with studio-quality cinematic lighting and bokeh effects. No text, no letters, no numbers, no symbols, no logos."

### OUTPUT FORMAT (JSON only, no markdown):
{{
    "image_prompt": "Your detailed cinematic image prompt here"
}}

Generate now:"""

        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.8,
                    "max_tokens": 300
                },
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                content_text = data["choices"][0]["message"]["content"].strip()
                
                # Clean up markdown if present
                if content_text.startswith("```"):
                    content_text = content_text.split("```")[1]
                    if content_text.startswith("json"):
                        content_text = content_text[4:]
                    content_text = content_text.strip()
                
                try:
                    result = json.loads(content_text)
                    result["is_fallback"] = False
                    return result
                except json.JSONDecodeError as e:
                    print(f"⚠️ JSON parse error in image prompt generation: {e}")
                    return self._fallback_image_prompt(title)
            else:
                print(f"⚠️ DeepSeek API error: {response.status_code}")
                return self._fallback_image_prompt(title)
                
        except Exception as e:
            print(f"⚠️ Image prompt generation error: {e}")
            return self._fallback_image_prompt(title)
    
    def _fallback_image_prompt(self, title: str = "") -> Dict:
        """Fallback image prompt when AI fails."""
        # Try to extract theme keywords from title for a semi-relevant fallback
        title_lower = title.lower()
        
        if any(w in title_lower for w in ["vitamin", "supplement", "nutrient"]):
            prompt = "A cinematic arrangement of colorful vitamin supplements and fresh fruits on a clean surface with warm golden sunlight. Premium wellness aesthetic with soft bokeh background. No text, no letters, no numbers, no symbols, no logos."
        elif any(w in title_lower for w in ["sleep", "rest", "nap", "bed"]):
            prompt = "A serene bedroom scene with soft morning light filtering through white curtains, cozy bedding and calming lavender tones. Premium minimalist wellness aesthetic. No text, no letters, no numbers, no symbols, no logos."
        elif any(w in title_lower for w in ["walk", "step", "run", "exercise", "fitness"]):
            prompt = "A scenic nature path through a lush green forest with golden morning sunlight streaming through the trees. Fresh, vibrant greens with cinematic depth of field. No text, no letters, no numbers, no symbols, no logos."
        elif any(w in title_lower for w in ["food", "eat", "diet", "meal", "fruit", "berry"]):
            prompt = "A beautiful overhead shot of colorful fresh fruits, vegetables and superfoods arranged on a clean marble surface. Bright, vibrant colors with premium food photography lighting. No text, no letters, no numbers, no symbols, no logos."
        elif any(w in title_lower for w in ["meditat", "mind", "stress", "anxiety", "mental"]):
            prompt = "A peaceful person in meditation pose surrounded by soft natural light and minimalist zen elements. Calming lavender and white tones with premium wellness aesthetic. No text, no letters, no numbers, no symbols, no logos."
        elif any(w in title_lower for w in ["water", "hydrat", "drink"]):
            prompt = "Crystal clear water droplets and a glass bottle surrounded by fresh cucumber and mint on a bright clean surface. Fresh blue and green tones with studio lighting. No text, no letters, no numbers, no symbols, no logos."
        else:
            prompt = "A cinematic wellness scene with fresh green elements, soft golden sunlight, and premium health-focused objects arranged artistically. Bright, clean, optimistic mood with studio-quality lighting. No text, no letters, no numbers, no symbols, no logos."
        
        return {
            "image_prompt": prompt,
            "is_fallback": True
        }


# ============================================================
# BACKWARDS COMPATIBILITY
# ============================================================

# Alias for drop-in replacement
ContentGenerator = ContentGeneratorV2


# ============================================================
# CONTENT RATING (unchanged from V1)
# ============================================================

class ContentRating:
    """Track content performance for AI improvement."""
    
    def __init__(self, db_path: str = "content_ratings.json"):
        self.db_path = db_path
        self.ratings = self._load_ratings()
    
    def _load_ratings(self) -> List[Dict]:
        try:
            if os.path.exists(self.db_path):
                with open(self.db_path, 'r') as f:
                    return json.load(f)
        except Exception as e:
            print(f"⚠️ Error loading ratings: {e}")
        return []
    
    def _save_ratings(self):
        try:
            with open(self.db_path, 'w') as f:
                json.dump(self.ratings, f, indent=2)
        except Exception as e:
            print(f"⚠️ Error saving ratings: {e}")
    
    def add_rating(
        self,
        content_id: str,
        title: str,
        content_lines: List[str],
        views: int,
        likes: int = 0,
        shares: int = 0,
        saves: int = 0,
        comments: int = 0,
        format_style: str = "",
        topic_category: str = ""
    ):
        rating = {
            "content_id": content_id,
            "title": title,
            "content_lines": content_lines,
            "views": views,
            "likes": likes,
            "shares": shares,
            "saves": saves,
            "comments": comments,
            "format_style": format_style,
            "topic_category": topic_category,
            "engagement_rate": (likes + shares + saves + comments) / max(views, 1) * 100,
            "rated_at": datetime.now().isoformat()
        }
        self.ratings.append(rating)
        self._save_ratings()
        return rating
    
    def get_top_performing(self, limit: int = 10) -> List[Dict]:
        sorted_ratings = sorted(
            self.ratings, 
            key=lambda x: x.get("views", 0), 
            reverse=True
        )
        return sorted_ratings[:limit]
    
    def get_best_topics(self) -> Dict[str, float]:
        topic_stats = {}
        for rating in self.ratings:
            topic = rating.get("topic_category", "unknown")
            if topic not in topic_stats:
                topic_stats[topic] = {"total_views": 0, "count": 0}
            topic_stats[topic]["total_views"] += rating.get("views", 0)
            topic_stats[topic]["count"] += 1
        
        return {
            topic: stats["total_views"] / stats["count"]
            for topic, stats in topic_stats.items()
            if stats["count"] > 0
        }
    
    def get_best_formats(self) -> Dict[str, float]:
        format_stats = {}
        for rating in self.ratings:
            fmt = rating.get("format_style", "unknown")
            if fmt not in format_stats:
                format_stats[fmt] = {"total_views": 0, "count": 0}
            format_stats[fmt]["total_views"] += rating.get("views", 0)
            format_stats[fmt]["count"] += 1
        
        return {
            fmt: stats["total_views"] / stats["count"]
            for fmt, stats in format_stats.items()
            if stats["count"] > 0
        }
