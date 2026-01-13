"""
AI-powered viral content generator using DeepSeek API.
Generates complete viral posts (title, content, and image prompts) from scratch.
"""
import os
import json
import random
import requests
from typing import Dict, List, Optional
from datetime import datetime


class ContentGenerator:
    """Service for generating viral health/wellness content using DeepSeek AI."""
    
    def __init__(self):
        """Initialize the content generator with DeepSeek API."""
        self.api_key = os.getenv("DEEPSEEK_API_KEY")
        self.base_url = "https://api.deepseek.com/v1"
        
        if not self.api_key:
            print("⚠️ Warning: DEEPSEEK_API_KEY not found for content generation")
        else:
            print("✅ Content Generator initialized with DeepSeek API")
    
    def _select_cta(self) -> Optional[str]:
        """
        Select a CTA based on probability distribution.
        Returns None if no CTA should be added (60% chance).
        """
        # Create weighted list based on CTA_OPTIONS
        categories = []
        weights = []
        for category, data in self.CTA_OPTIONS.items():
            categories.append(category)
            weights.append(data["weight"])
        
        # Select category based on weights
        selected_category = random.choices(categories, weights=weights, k=1)[0]
        
        # If "none" selected, return None (no CTA)
        if selected_category == "none":
            return None
        
        # Return random CTA from selected category
        options = self.CTA_OPTIONS[selected_category]["options"]
        if options:
            return random.choice(options)
        return None
    
    def _append_cta_to_content(self, content_data: Dict) -> Dict:
        """
        Append a selected CTA to the content_lines if applicable.
        Modifies content_data in place and returns it.
        """
        cta = self._select_cta()
        if cta:
            content_data["content_lines"].append(cta)
            content_data["cta_added"] = cta
        else:
            content_data["cta_added"] = None
        return content_data
    
    def _add_to_history(self, content_data: Dict) -> None:
        """Add generated content to history to avoid repetition."""
        history_entry = {
            "title": content_data.get("title", ""),
            "topic": content_data.get("topic_category", ""),
            "format": content_data.get("format_style", ""),
            "generated_at": datetime.now().isoformat()
        }
        ContentGenerator._content_history.append(history_entry)
        
        # Keep history size manageable
        if len(ContentGenerator._content_history) > ContentGenerator._max_history_size:
            ContentGenerator._content_history = ContentGenerator._content_history[-ContentGenerator._max_history_size:]
    
    def _get_history_context(self) -> str:
        """
        Generate a context string from recent history to help AI avoid repetition.
        Returns recent titles and topics to include in the prompt.
        """
        if not ContentGenerator._content_history:
            return ""
        
        # Get last 10 entries for context
        recent = ContentGenerator._content_history[-10:]
        
        titles = [entry["title"] for entry in recent if entry.get("title")]
        topics = list(set(entry["topic"] for entry in recent if entry.get("topic")))
        
        context_parts = []
        if titles:
            context_parts.append(f"Recently generated titles (DO NOT repeat or create similar): {', '.join(titles)}")
        if topics:
            context_parts.append(f"Recently covered topics (try different angles): {', '.join(topics)}")
        
        return "\n".join(context_parts)
    
    def get_generation_history(self) -> List[Dict]:
        """Return the content generation history."""
        return ContentGenerator._content_history.copy()
    
    def clear_history(self) -> None:
        """Clear the generation history."""
        ContentGenerator._content_history = []
    
    # Fixed CTA options with probability distribution
    # 80% - No explicit CTA (standard format ends naturally)
    # 20% - Part 2 teaser CTA (engagement hook)
    CTA_OPTIONS = {
        "none": {
            "weight": 80,
            "options": []  # No CTA appended
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
    
    # Content history to avoid repetition (stores recent titles/topics)
    # This is a class-level cache that persists during the app session
    _content_history: List[Dict] = []
    _max_history_size: int = 50  # Remember last 50 generations
    
    # Topic categories for rotation
    TOPIC_CATEGORIES = [
        "Body signals and weird symptoms that reveal hidden health issues",
        "Shocking health facts about common foods or habits",
        "Daily habits that are secretly harmful to your health",
        "Mental strength, mindset, and psychological resilience",
        "Disease prevention and early warning signs",
        "Longevity, anti-aging, and cellular health",
        "Sleep optimization, energy, and hormone balance",
        "Brain health, cognitive function, and memory",
        "Toxic products and hidden dangers in everyday items",
        "Natural remedies that work like medicine",
        "Gut health and microbiome optimization",
        "Heart health and cardiovascular warning signs",
        "Immune system boosting strategies",
        "Inflammation and chronic disease prevention",
        "Metabolism and weight management secrets",
        "Stress, anxiety, and nervous system health",
        "Detoxification and organ cleansing",
        "Nutritional deficiencies and their symptoms",
        "Exercise and recovery optimization",
        "Hydration and electrolyte balance"
    ]
    
    # Format styles
    FORMAT_STYLES = [
        {
            "name": "SHORT_FRAGMENT",
            "description": "Short, punchy fragments with em-dash separators",
            "example": "Loud snoring — Airflow restriction.",
            "point_length": "3-8 words per point"
        },
        {
            "name": "FULL_SENTENCE", 
            "description": "Complete sentences explaining each point",
            "example": "Shortness of breath during mild activity can signal early heart strain.",
            "point_length": "12-20 words per point"
        },
        {
            "name": "CAUSE_EFFECT",
            "description": "Action/item followed by benefit or consequence",
            "example": "Half an avocado each morning — Supports hormones and skin hydration.",
            "point_length": "8-15 words per point"
        }
    ]
    
    def _build_master_prompt(self, topic_hint: Optional[str] = None) -> str:
        """Build the comprehensive master prompt for content generation."""
        
        # Select random topic if not specified
        if topic_hint:
            topic = topic_hint
        else:
            topic = random.choice(self.TOPIC_CATEGORIES)
        
        # Select random format style
        format_style = random.choice(self.FORMAT_STYLES)
        
        prompt = f"""You are an elite viral social media content creator specializing in health, fitness, wellness, body science, psychology, and motivational topics. Your content consistently achieves 1M+ views on Instagram and TikTok.

## YOUR MISSION
Create ONE completely original, scroll-stopping post about: {topic}

## FORMAT STYLE TO USE: {format_style['name']}
- Description: {format_style['description']}
- Example point: "{format_style['example']}"
- Point length: {format_style['point_length']}

## STRICT REQUIREMENTS

### TITLE RULES:
- ALL CAPS
- 3-8 words maximum
- Must create curiosity, urgency, or shock
- Use patterns like:
  * "[NUMBER] THINGS YOUR BODY..." 
  * "[TOPIC] SECRETS DOCTORS DON'T SHARE"
  * "STOP DOING THIS IF YOU..."
  * "YOUR [BODY PART] IS TELLING YOU..."
  * "WHY [COMMON THING] IS DESTROYING..."
  * "[FOOD/HABIT] THAT WORKS LIKE [MEDICINE]"

### CONTENT RULES:
- EXACTLY 7 points (no more, no less)
- DO NOT include numbers (1., 2., etc.) - numbers are added automatically by our system
- Each point must be: concrete, specific, believable but slightly surprising
- Mix: 60% validating (things they suspect), 40% shocking (new revelation)
- DO NOT include any CTA (Call-To-Action) - it will be added automatically by the system
- DO NOT include anything like "follow this page" or "save this post"
- NO medical disclaimers within points
- NO generic advice - be SPECIFIC

### QUALITY CHECKLIST:
✅ Title creates immediate curiosity
✅ Points alternate between familiar and surprising
✅ Each point is dense with value
✅ Information feels insider/exclusive
✅ NO CTA included (system adds it automatically)
"""
        
        # Add history context to avoid repetition
        history_context = self._get_history_context()
        if history_context:
            prompt += f"""

## IMPORTANT - AVOID REPETITION:
{history_context}

Create something FRESH and DIFFERENT from the above!
"""
        
        prompt += """

## VIRAL CONTENT EXAMPLES (1M+ VIEWS):

EXAMPLE 1 - SHORT FRAGMENT STYLE:
Title: PHARMACIES DON'T WANT YOU TO KNOW THIS
Ibuprofen — Causes gut pain without addiction
Benadryl — Brain fog; Shrinks brain's receptors
Aspirin — Stomach ulcers
Tylenol — Misfires; Feeds your liver toxins
Advil — Gut bloating
Aleve — Damages your Vagus Nerve
Diphenhydramine — Confusion, fatigue, anxiety

EXAMPLE 2 - FULL SENTENCE STYLE:
Title: EARLY HEART WARNING SIGNS MOST PEOPLE OVERLOOK
Shortness of breath during mild activity can signal early heart strain.
Unusual fatigue that feels excessive for your activity level is a common warning.
Chest discomfort or pressure during emotional stress may reflect heart overload.
Dizziness when standing up quickly can indicate reduced circulation.
Swelling in the feet or ankles may result from fluid buildup.
Frequent indigestion that doesn't improve can be heart-related.
Irregular heartbeat or fluttering sensations should not be ignored.

EXAMPLE 3 - CAUSE-EFFECT STYLE:
Title: EAT THIS FOR 7 DAYS AND FEEL THE DIFFERENCE
Half an avocado each morning — Supports hormones and skin hydration.
Soaked flaxseeds daily — Improves digestion and bowel regularity.
Warm lemon water on waking — Reduces bloating and supports the liver.
A serving of blueberries — Boosts memory and brain focus.
Ginger tea in the evening — Calms digestion and supports sleep.
Plain yogurt daily — Supports gut balance.
Handful of nuts mid-afternoon — Steady energy levels.

## IMAGE PROMPT REQUIREMENTS

After creating the content, generate a cinematic image prompt with:
- Full-frame composition with minimal empty space
- Dominant focal subject related to the topic
- Blue/teal color palette with controlled warm accents
- Studio-quality cinematic lighting
- Scientific/premium wellness aesthetic
- Element placement: top center, middle, bottom center
- MUST end with: "No text, no letters, no numbers, no symbols, no logos."

## YOUR OUTPUT FORMAT (EXACTLY):

```json
{{
    "title": "YOUR VIRAL TITLE IN ALL CAPS",
    "content_lines": [
        "Point 1 text",
        "Point 2 text",
        "Point 3 text",
        "Point 4 text",
        "Point 5 text",
        "Point 6 text",
        "Point 7 text"
    ],
    "image_prompt": "Your detailed cinematic image prompt here ending with No text, no letters, no numbers, no symbols, no logos.",
    "format_style": "{format_style['name']}",
    "topic_category": "{topic}"
}}
```

Generate the content now. Output ONLY the JSON, nothing else."""

        return prompt
    
    def generate_viral_content(self, topic_hint: Optional[str] = None) -> Dict:
        """
        Generate a complete viral post including title, content, and image prompt.
        
        Args:
            topic_hint: Optional topic to focus on
            
        Returns:
            Dictionary with title, content_lines, image_prompt, and metadata
        """
        if not self.api_key:
            return self._fallback_content()
        
        prompt = self._build_master_prompt(topic_hint)
        
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
                        {
                            "role": "system", 
                            "content": "You are an elite viral content creator. You output ONLY valid JSON, no markdown, no explanations. Your content achieves millions of views."
                        },
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.9,
                    "max_tokens": 1500
                },
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                content_text = result["choices"][0]["message"]["content"].strip()
                
                # Clean up the response - remove markdown code blocks if present
                if content_text.startswith("```"):
                    content_text = content_text.split("```")[1]
                    if content_text.startswith("json"):
                        content_text = content_text[4:]
                content_text = content_text.strip()
                
                # Parse JSON
                try:
                    content_data = json.loads(content_text)
                    
                    # Validate required fields
                    if not all(k in content_data for k in ["title", "content_lines", "image_prompt"]):
                        print("⚠️ Missing required fields in response")
                        return self._fallback_content()
                    
                    # NOTE: CTA is NOT added here - it's added at generation time based on user selection
                    
                    # Add metadata
                    content_data["generated_at"] = datetime.now().isoformat()
                    content_data["success"] = True
                    
                    # Track in history to avoid repetition
                    self._add_to_history(content_data)
                    
                    return content_data
                    
                except json.JSONDecodeError as e:
                    print(f"⚠️ JSON parse error: {e}")
                    print(f"Raw response: {content_text[:500]}")
                    return self._fallback_content()
            else:
                print(f"⚠️ DeepSeek API error: {response.status_code} - {response.text}")
                return self._fallback_content()
                
        except Exception as e:
            print(f"⚠️ Content generation error: {e}")
            return self._fallback_content()
    
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
                "image_prompt": "A cinematic, full-frame wellness visualization centered on a translucent human silhouette with glowing blue water droplets flowing through the body. Highlights on brain, muscles, skin, and digestive system. Blue and teal color palette with soft aqua accents. Studio-quality cinematic lighting, clean medical aesthetic, premium wellness mood. No text, no letters, no numbers, no symbols, no logos."
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
                "image_prompt": "A cinematic, full-frame sleep and nutrition illustration with a peaceful bedroom scene overlaid with floating food elements: coffee cup, chocolate, cheese, wine glass, each with subtle red warning glows. Dominant blue and deep purple palette with controlled warm accents. Soft moonlit cinematic lighting, serene yet educational mood. No text, no letters, no numbers, no symbols, no logos."
            },
            {
                "title": "YOUR TONGUE REVEALS YOUR HEALTH",
                "content_lines": [
                    "White coating — Candida overgrowth or dehydration",
                    "Yellow tint — Liver or digestion issues",
                    "Cracks on surface — Vitamin B deficiency",
                    "Swollen edges — Nutrient malabsorption",
                    "Red tip — Stress or heart strain",
                    "Purple color — Poor circulation",
                    "Pale appearance — Anemia or low iron"
                ],
                "image_prompt": "A cinematic, full-frame medical diagnostic visualization featuring an oversized, hyper-detailed human tongue as the central focal point with subtle color zones highlighted: white, yellow, red, purple areas with soft diagnostic glows. Blue and teal clinical palette with warm accent highlights on problem areas. Studio-quality cinematic lighting, premium scientific wellness aesthetic. No text, no letters, no numbers, no symbols, no logos."
            }
        ]
        
        fallback = random.choice(fallback_posts)
        
        # NOTE: CTA is NOT added here - it's added at generation time based on user selection
        
        fallback["generated_at"] = datetime.now().isoformat()
        fallback["success"] = True
        fallback["is_fallback"] = True
        fallback["format_style"] = "SHORT_FRAGMENT"
        fallback["topic_category"] = "Body signals and health indicators"
        
        # Track in history to avoid repetition
        self._add_to_history(fallback)
        
        return fallback
    
    def get_available_topics(self) -> List[str]:
        """Return list of available topic categories."""
        return self.TOPIC_CATEGORIES.copy()
    
    def get_format_styles(self) -> List[Dict]:
        """Return list of available format styles."""
        return self.FORMAT_STYLES.copy()


# Rating system for future improvement tracking
class ContentRating:
    """Track content performance for AI improvement."""
    
    def __init__(self, db_path: str = "content_ratings.json"):
        self.db_path = db_path
        self.ratings = self._load_ratings()
    
    def _load_ratings(self) -> List[Dict]:
        """Load existing ratings from file."""
        try:
            if os.path.exists(self.db_path):
                with open(self.db_path, 'r') as f:
                    return json.load(f)
        except Exception as e:
            print(f"⚠️ Error loading ratings: {e}")
        return []
    
    def _save_ratings(self):
        """Save ratings to file."""
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
        """Add a performance rating for generated content."""
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
        """Get top performing content by views."""
        sorted_ratings = sorted(self.ratings, key=lambda x: x.get("views", 0), reverse=True)
        return sorted_ratings[:limit]
    
    def get_best_topics(self) -> Dict[str, float]:
        """Analyze which topics perform best."""
        topic_stats = {}
        for rating in self.ratings:
            topic = rating.get("topic_category", "unknown")
            if topic not in topic_stats:
                topic_stats[topic] = {"total_views": 0, "count": 0}
            topic_stats[topic]["total_views"] += rating.get("views", 0)
            topic_stats[topic]["count"] += 1
        
        # Calculate average views per topic
        return {
            topic: stats["total_views"] / stats["count"] 
            for topic, stats in topic_stats.items() 
            if stats["count"] > 0
        }
    
    def get_best_formats(self) -> Dict[str, float]:
        """Analyze which format styles perform best."""
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
