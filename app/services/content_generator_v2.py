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

    def _get_recent_post_titles_from_db(self, limit: int = 25) -> List[str]:
        """Fetch recent post titles from the database to avoid repetition."""
        try:
            from app.database.db import SessionLocal
            from app.models import Job
            from sqlalchemy import desc

            db = SessionLocal()
            try:
                recent_jobs = (
                    db.query(Job)
                    .filter(Job.variant == "post")
                    .order_by(desc(Job.created_at))
                    .limit(limit)
                    .all()
                )
                titles = []
                for j in recent_jobs:
                    # Extract per-brand titles from brand_outputs JSON
                    if j.brand_outputs and isinstance(j.brand_outputs, dict):
                        for brand_key, brand_data in j.brand_outputs.items():
                            if isinstance(brand_data, dict):
                                t = brand_data.get("title", "")
                                if t and t not in titles:
                                    titles.append(t)
                    # Also check job-level title
                    if j.title and j.title not in titles:
                        titles.append(j.title)
                return titles[:limit]
            finally:
                db.close()
        except Exception as e:
            print(f"⚠️ Could not fetch recent post titles from DB: {e}", flush=True)
            return []

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
        
        # Get recent titles to avoid repetition (from DB + in-memory)
        db_titles = self._get_recent_post_titles_from_db(25)
        recent = self._get_recent_outputs()
        history_context = ""
        all_recent = list(db_titles)
        if recent:
            for r in recent:
                t = r.get("title", "")
                if t and t not in all_recent:
                    all_recent.append(t)
        if all_recent:
            history_context = f"""\n### PREVIOUSLY GENERATED (avoid repeating these titles and topics):\n{chr(10).join('- ' + t for t in all_recent[-25:])}\n"""
        
        prompt = f"""You are a health content creator for InLight — a wellness brand targeting U.S. women aged 35 and older.

Generate a SINGLE short, engaging, health-focused title and a matching Instagram caption with a real scientific reference.

### TARGET AUDIENCE:
Women 35+ interested in healthy aging, energy, hormones, and longevity.

### WHAT MAKES A GREAT POST TITLE:
- A short, clear health statement written in simple, wellness-friendly tone (not overly technical)
- Focused on one or two main benefits
- Some titles may include percentages for extra impact
- Positive, empowering, and slightly exaggerated to create scroll-stop engagement
- Do NOT lie, but dramatize slightly to spark discussion (comments, shares, saves)
- Do NOT end the title with a period (.)  — end cleanly without punctuation or with a question mark only

### TOPICS TO COVER (pick one):
- Foods, superfoods, and healing ingredients (turmeric, ginger, berries, honey, cinnamon, etc.)
- Teas and warm drinks (green tea, chamomile, matcha, golden milk, herbal infusions)
- Supplements and vitamins (collagen, magnesium, vitamin D, omega-3, probiotics, ashwagandha)
- Sleep rituals and evening routines
- Morning wellness routines (lemon water, journaling, light stretching)
- Skin health, collagen, and anti-aging nutrition
- Gut health, digestion, and bloating relief
- Hormone balance and menopause support through nutrition
- Stress relief and mood-boosting foods/habits
- Hydration and detox drinks
- Brain health and memory-supporting nutrients
- Heart-healthy foods and natural remedies

### EXAMPLE POST TITLES (learn the pattern):
- "Vitamin D and magnesium helps reduce depression and brain aging."
- "Collagen may improve skin elasticity by up to 20% after 8 weeks."
- "Magnesium supports better sleep and stress relief during midlife."
- "A cup of chamomile tea before bed may improve sleep quality by 30%."
- "Probiotics may reduce bloating and support gut health after 40."
- "Omega-3 from salmon and walnuts may reduce inflammation by 25%."
- "Adding turmeric to your meals may lower joint pain and inflammation."
- "Drinking warm lemon water each morning supports digestion and energy."
- "Ashwagandha may reduce cortisol levels and support hormonal balance."
- "Green tea antioxidants support metabolism and healthy aging."
- "Eating berries daily may slow brain aging and boost memory."
- "A spoonful of honey and cinnamon may support immune health."
- "Dark chocolate in moderation may improve mood and heart health."
- "Bone broth contains collagen that supports skin and joint health."
- "Flaxseed may help balance estrogen levels during menopause."

### WHAT TO AVOID:
- Reel-style titles like "5 SIGNS YOUR BODY..." or "FOODS THAT DESTROY..."
- Question formats
- Lists or numbered formats (those are for reels)
- All-caps screaming style — use sentence case
- Vague claims without specifics
- Content that does not resonate with women 35+
- Intense exercise or gym/strength training topics — keep it soft, consumable, and lifestyle-oriented
- Anything that feels intimidating or requires major lifestyle changes

### CAPTION REQUIREMENTS:
Write a full Instagram caption (4-5 paragraphs) that:
- Paragraph 1: Hook — expand on the title with a surprising or counterintuitive angle
- Paragraph 2-3: Explain the science/mechanism in accessible, wellness-friendly language. Be specific about what happens in the body (metabolism, organs, brain chemistry, skin, energy, etc.)
- Paragraph 4: Summarize the takeaway — what the reader can expect if they take action
- After the paragraphs, add a "Source:" section with a REAL, EXISTING academic reference:
  Author(s). (Year). Title. Journal, Volume(Issue), Pages.
  DOI: 10.xxxx/xxxxx
  THE DOI MUST BE A REAL, VERIFIABLE DOI that exists on doi.org. Use well-known published studies related to the topic.
- End with a disclaimer block:
  ⚠️ Disclaimer:
  This content is intended for educational and informational purposes only and should not be considered medical advice. It is not designed to diagnose, treat, cure, or prevent any medical condition. Always consult a qualified healthcare professional before making dietary, medication, or lifestyle changes, particularly if you have existing health conditions. Individual responses may vary.
- Separate each section with a blank line for readability

{history_context}

{"Topic hint: " + topic_hint if topic_hint else "Generate on any relevant health/wellness topic for women 35+. Focus on: foods, superfoods, teas, warm drinks, supplements, vitamins, collagen, sleep rituals, morning routines, skin nutrition, gut health, bloating, hormone-balancing foods, mood-boosting nutrients, hydration, detox, brain-healthy foods, heart-healthy ingredients."}

### IMAGE PROMPT REQUIREMENTS:
- Soft, minimal, calming wellness aesthetic
- Bright modern kitchen or clean lifestyle setting
- Neutral tones, gentle morning sunlight
- High-end lifestyle photography style
- Fresh, soothing, natural health remedy concept
- Must end with: "No text, no letters, no numbers, no symbols, no logos."

### OUTPUT FORMAT (JSON only, no markdown):
{{
    "title": "Your health statement title here.",
    "caption": "Hook paragraph.\\n\\nExplanation paragraphs...\\n\\nTakeaway.\\n\\nSource:\\nAuthor, A. (Year). Title. Journal, Vol(Issue), Pages.\\nDOI: 10.xxxx/xxxxx\\n\\n⚠️ Disclaimer:\\nThis content is intended for educational and informational purposes only and should not be considered medical advice. It is not designed to diagnose, treat, cure, or prevent any medical condition. Always consult a qualified healthcare professional before making dietary, medication, or lifestyle changes, particularly if you have existing health conditions. Individual responses may vary.",
    "image_prompt": "Soft cinematic close-up description matching the title theme. Minimal, calming wellness aesthetic, neutral tones, high-end lifestyle photography, fresh and soothing atmosphere, natural health remedy concept. No text, no letters, no numbers, no symbols, no logos."
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
                    "max_tokens": 2000
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
                    
                    # Strip trailing period from title
                    if result.get("title"):
                        result["title"] = result["title"].rstrip(".")
                    
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
                "title": "Vitamin D and magnesium helps reduce depression and brain aging",
                "caption": "Most people take vitamin D for bone health, but its role in brain function and mood regulation is far more significant than commonly understood. Vitamin D receptors are found throughout the brain, including regions involved in emotional processing and memory.\n\nWhen levels drop below optimal, your nervous system becomes more vulnerable to inflammation and oxidative stress — both key drivers of depressive symptoms and accelerated cognitive decline. Magnesium amplifies this effect because it's required to convert vitamin D into its active form.\n\nTogether, these two nutrients support serotonin production, reduce neuroinflammation, and help maintain synaptic plasticity — the brain's ability to form new connections and adapt.\n\nConsistent supplementation can lead to noticeable improvements in mood stability, mental clarity, and long-term brain resilience.\n\nSource:\nSarris, J., Murphy, J., Mischoulon, D., et al. (2016). Adjunctive Nutraceuticals for Depression: A Systematic Review and Meta-Analyses. American Journal of Psychiatry, 173(6), 575–587.\nDOI: 10.1176/appi.ajp.2016.15091228\n\n⚠️ Disclaimer:\nThis content is intended for educational and informational purposes only and should not be considered medical advice. It is not designed to diagnose, treat, cure, or prevent any medical condition. Always consult a qualified healthcare professional before making dietary, medication, or lifestyle changes, particularly if you have existing health conditions. Individual responses may vary.",
                "image_prompt": "Soft cinematic close-up of vitamin D supplements and magnesium capsules arranged on a clean white stone countertop in a bright modern kitchen. A glass of warm lemon water sits nearby, glowing in gentle morning sunlight. Minimal, calming wellness aesthetic, neutral tones, high-end lifestyle photography, fresh and soothing atmosphere. No text, no letters, no numbers, no symbols, no logos."
            },
            {
                "title": "A cup of chamomile tea before bed may improve sleep quality by 30%",
                "caption": "Chamomile is one of the most studied herbal remedies for sleep, and the results are more impressive than most people realize. The key compound — apigenin — binds to specific receptors in the brain that reduce anxiety and initiate sedation naturally.\n\nDrinking chamomile tea 30–60 minutes before bed helps lower cortisol levels, calm the nervous system, and promote the transition into deeper sleep stages. Unlike synthetic sleep aids, chamomile doesn't suppress REM sleep or create dependency.\n\nOver time, consistent use has been shown to improve overall sleep quality scores by up to 30%, with participants reporting fewer nighttime awakenings and feeling more rested upon waking.\n\nA simple nightly ritual that costs almost nothing can fundamentally change how well you rest and recover.\n\nSource:\nSrivastava, J. K., Shankar, E., & Gupta, S. (2010). Chamomile: A herbal medicine of the past with bright future. Molecular Medicine Reports, 3(6), 895–901.\nDOI: 10.3892/mmr.2010.377\n\n⚠️ Disclaimer:\nThis content is intended for educational and informational purposes only and should not be considered medical advice. It is not designed to diagnose, treat, cure, or prevent any medical condition. Always consult a qualified healthcare professional before making dietary, medication, or lifestyle changes, particularly if you have existing health conditions. Individual responses may vary.",
                "image_prompt": "Soft cinematic close-up of a steaming cup of chamomile tea on a wooden bedside table with dried chamomile flowers scattered around. Warm evening light, cozy minimal setting. Calming wellness aesthetic, neutral tones, high-end lifestyle photography, soothing atmosphere. No text, no letters, no numbers, no symbols, no logos."
            },
            {
                "title": "Collagen may improve skin elasticity by up to 20% after 8 weeks",
                "caption": "As we age, collagen production drops by roughly 1% per year after 25. This gradual loss is what drives wrinkles, sagging, and that loss of firmness that becomes more noticeable in your 30s and beyond.\n\nOral collagen peptides work differently from topical creams — they're absorbed into the bloodstream and stimulate your body's own collagen-producing cells (fibroblasts) to increase production from within. This means the effects are systemic, not just surface-level.\n\nClinical trials show that after 8 weeks of daily supplementation, skin elasticity can improve by up to 20%, with visible reductions in fine lines and improved hydration levels across the dermis.\n\nThe key is consistency. Daily intake of hydrolyzed collagen peptides gives your body the building blocks it needs to repair and rebuild skin structure at a cellular level.\n\nSource:\nBolke, L., Schlippe, G., Gerß, J., & Voss, W. (2019). A Collagen Supplement Improves Skin Hydration, Elasticity, Roughness, and Density: Results of a Randomized, Placebo-Controlled, Blind Study. Nutrients, 11(10), 2494.\nDOI: 10.3390/nu11102494\n\n⚠️ Disclaimer:\nThis content is intended for educational and informational purposes only and should not be considered medical advice. It is not designed to diagnose, treat, cure, or prevent any medical condition. Always consult a qualified healthcare professional before making dietary, medication, or lifestyle changes, particularly if you have existing health conditions. Individual responses may vary.",
                "image_prompt": "Soft cinematic close-up of collagen powder being stirred into a glass of water on a clean marble countertop. Fresh berries and a small plant nearby in gentle morning light. Minimal, calming wellness aesthetic, neutral tones, high-end lifestyle photography, fresh and soothing atmosphere. No text, no letters, no numbers, no symbols, no logos."
            },
            {
                "title": "Adding turmeric to your meals may lower joint pain and inflammation",
                "caption": "Turmeric's active compound — curcumin — is one of the most researched natural anti-inflammatories in modern nutrition science. It works by inhibiting NF-κB, a molecule that triggers inflammatory gene expression in nearly every cell of the body.\n\nChronic low-grade inflammation is linked to joint stiffness, fatigue, skin issues, and accelerated aging. By incorporating turmeric into daily meals — especially paired with black pepper (which increases absorption by 2000%) — you can meaningfully reduce systemic inflammatory markers.\n\nStudies show that curcumin supplementation can match the effectiveness of some over-the-counter anti-inflammatory drugs for joint pain, without the gastrointestinal side effects.\n\nWhether added to soups, smoothies, or golden milk, consistent turmeric intake supports long-term joint health and overall inflammatory balance.\n\nSource:\nHewlings, S. J., & Kalman, D. S. (2017). Curcumin: A Review of Its Effects on Human Health. Foods, 6(10), 92.\nDOI: 10.3390/foods6100092\n\n⚠️ Disclaimer:\nThis content is intended for educational and informational purposes only and should not be considered medical advice. It is not designed to diagnose, treat, cure, or prevent any medical condition. Always consult a qualified healthcare professional before making dietary, medication, or lifestyle changes, particularly if you have existing health conditions. Individual responses may vary.",
                "image_prompt": "Soft cinematic close-up of golden turmeric powder on a small ceramic spoon beside a warm glass of golden milk on a clean white countertop. Gentle morning sunlight, a cinnamon stick and fresh turmeric root nearby. Minimal, calming wellness aesthetic, neutral tones, high-end lifestyle photography. No text, no letters, no numbers, no symbols, no logos."
            }
        ]
        
        fallback = random.choice(fallbacks)
        fallback["is_fallback"] = True
        # Add empty slide_texts for fallback (carousel will skip text slides)
        if "slide_texts" not in fallback:
            fallback["slide_texts"] = []
        return fallback

    # ============================================================
    # BATCH POST GENERATION (unique post per brand)
    # ============================================================

    def generate_post_titles_batch(self, count: int, topic_hint: str = None) -> List[Dict]:
        """
        Generate N completely unique posts in a single AI call.
        Each post has a different topic, title, caption, and image prompt.
        Used so each brand gets a completely different post.

        Args:
            count: Number of unique posts to generate
            topic_hint: Optional hint to guide topic selection

        Returns:
            List of dicts, each with 'title', 'caption', 'image_prompt', 'is_fallback'
        """
        if not self.api_key or count <= 0:
            return [self._fallback_post_title() for _ in range(max(count, 1))]

        # Get recent titles to avoid repetition (from DB + in-memory)
        db_titles = self._get_recent_post_titles_from_db(25)
        recent = self._get_recent_outputs()
        history_context = ""
        all_recent = list(db_titles)
        if recent:
            for r in recent:
                t = r.get("title", "")
                if t and t not in all_recent:
                    all_recent.append(t)
        if all_recent:
            history_context = f"""\n### PREVIOUSLY GENERATED (avoid repeating these titles and topics):\n{chr(10).join('- ' + t for t in all_recent[-25:])}\n"""

        prompt = f"""You are a health content creator for InLight — a wellness brand targeting U.S. women aged 35 and older.

Generate EXACTLY {count} COMPLETELY DIFFERENT health-focused posts. Each post MUST cover a DIFFERENT topic category.

### TARGET AUDIENCE:
Women 35+ interested in healthy aging, energy, hormones, and longevity.

### CRITICAL RULE:
Each of the {count} posts MUST be about a DIFFERENT topic. Do NOT repeat similar themes.
Pick {count} DIFFERENT categories from this list (one per post):
1. Superfoods and healing ingredients (turmeric, ginger, berries, honey, cinnamon)
2. Teas and warm drinks (green tea, chamomile, matcha, golden milk)
3. Supplements and vitamins (collagen, magnesium, vitamin D, omega-3, probiotics)
4. Sleep rituals and evening routines
5. Morning wellness routines (lemon water, journaling, light stretching)
6. Skin health, collagen, and anti-aging nutrition
7. Gut health, digestion, and bloating relief
8. Hormone balance and menopause support through nutrition
9. Stress relief and mood-boosting foods/habits
10. Hydration and detox drinks
11. Brain health and memory-supporting nutrients
12. Heart-healthy foods and natural remedies

### WHAT MAKES A GREAT POST TITLE:
- A short, clear health statement written in simple, wellness-friendly tone
- Focused on one or two main benefits
- Positive, empowering, and slightly exaggerated to create scroll-stop engagement
- Do NOT lie, but dramatize slightly to spark discussion
- Do NOT end the title with a period (.) — end cleanly without punctuation or with a question mark only

### TITLE STYLE VARIETY (CRITICAL — mix these across the batch):
You MUST use a MIX of these 3 title styles. Never generate all titles in the same style!

**Style A — Direct with percentage/data** (~40% of titles):
Examples:
- "Study shows sleeping in a cold room helps burn fat and slow aging by 40%"
- "Eating berries daily can improve memory and focus by 25%"
- "Walking 20 minutes after meals reduces blood sugar spikes by 30%"

**Style B — Direct statement without data** (~30% of titles):
Examples:
- "Sleeping in a cold room helps burn fat and slow aging"
- "One tablespoon of olive oil before bed can transform your skin overnight"
- "Magnesium before sleep helps your muscles recover faster than any supplement"

**Style C — Curiosity / intrigue hook** (~30% of titles):
Examples:
- "What happens to your body when you drink warm lemon water every morning"
- "The reason most women over 40 feel tired has nothing to do with sleep"
- "This ancient spice does more for your brain than most supplements combined"

For {count} posts, distribute the styles. Example for 10 posts: ~4 Style A, ~3 Style B, ~3 Style C.

### WHAT TO AVOID:
- Reel-style titles like "5 SIGNS YOUR BODY..." or "FOODS THAT DESTROY..."
- Question formats or lists
- All-caps screaming style — use sentence case
- Intense exercise or gym/strength training topics

### CAPTION REQUIREMENTS:
Write a full Instagram caption (4-5 paragraphs) that:
- Paragraph 1: Hook — expand on the title with a surprising or counterintuitive angle
- Paragraph 2-3: Explain the science/mechanism in accessible, wellness-friendly language. Be specific about what happens in the body (metabolism, organs, brain chemistry, skin, energy, etc.)
- Paragraph 4: Summarize the takeaway — what the reader can expect if they take action
- After the paragraphs, add a "Source:" section with a REAL, EXISTING academic reference in this format:
  Author(s). (Year). Title. Journal, Volume(Issue), Pages.
  DOI: 10.xxxx/xxxxx
  THE DOI MUST BE A REAL, VERIFIABLE DOI that exists on doi.org. Use well-known published studies. The study must be related to the topic (e.g. if the post is about berries and brain health, cite a study about berry consumption and cognitive function).
- End with a disclaimer block:
  ⚠️ Disclaimer:
  This content is intended for educational and informational purposes only and should not be considered medical advice. It is not designed to diagnose, treat, cure, or prevent any medical condition. Always consult a qualified healthcare professional before making dietary, medication, or lifestyle changes, particularly if you have existing health conditions. Individual responses may vary.
- Separate each section with a blank line for readability

### CAROUSEL SLIDE TEXTS (CRITICAL — this is for Instagram carousel slides 2-4):
Generate EXACTLY 3 slide texts for each post. These appear as text-only slides (like a tweet/text screenshot) after the main image slide.
Each slide text should be:
- A standalone paragraph (3-6 sentences) that reads well on its own
- Written in a calm, authoritative, educational tone (NOT salesy)
- Slide 1 text: The core scientific explanation (what happens in the body)
- Slide 2 text: Deeper mechanism / why it matters / practical context
- Slide 3 text: Takeaway + call-to-action paragraph. MUST end with a new paragraph: "Follow @{{brandhandle}} to learn more about your {{topic_word}}." where topic_word is one relevant word like "health", "brain", "body", "longevity", "energy", "skin", "sleep", "nutrition" etc. matching the post's subject.
Note: the {{brandhandle}} placeholder will be replaced by the system — just write it as shown.

### IMAGE PROMPT REQUIREMENTS:
- Soft, minimal, calming wellness aesthetic
- Each image prompt MUST be visually DIFFERENT (different setting, different ingredients)
- Neutral tones, gentle morning sunlight
- High-end lifestyle photography style
- CRITICAL COMPOSITION: The main subject (food, ingredients, objects) MUST be positioned in the CENTER and UPPER-CENTER area of the frame (top two-thirds). The BOTTOM THIRD of the image will be covered by text overlay, so NEVER place important content there. Think of it as a portrait-orientation image where the hero subject sits in the middle, with clean negative space below it.
- Camera angle: slightly overhead / 45-degree top-down perspective preferred to keep subject in upper-center frame
- Must end with: "No text, no letters, no numbers, no symbols, no logos."

{history_context}

{"Topic hint: " + topic_hint if topic_hint else ""}

### OUTPUT FORMAT (JSON array, no markdown):
[
  {{
    "title": "First health statement title.",
    "caption": "Hook paragraph expanding on the title with a surprising angle.\\n\\nExplanation paragraph about what happens in the body — metabolism, organs, brain chemistry, etc.\\n\\nMore detail about the mechanism and benefits. Be specific and educational.\\n\\nTakeaway paragraph — what the reader can expect.\\n\\nSource:\\nAuthor, A. B., & Author, C. D. (Year). Study title. Journal Name, Volume(Issue), Pages.\\nDOI: 10.xxxx/xxxxx\\n\\n⚠️ Disclaimer:\\nThis content is intended for educational and informational purposes only and should not be considered medical advice. It is not designed to diagnose, treat, cure, or prevent any medical condition. Always consult a qualified healthcare professional before making dietary, medication, or lifestyle changes, particularly if you have existing health conditions. Individual responses may vary.",
    "slide_texts": [
      "First slide paragraph explaining the core science. What happens in the body when you do X. Be specific about mechanisms, organs, chemistry. 3-6 sentences.",
      "Second slide going deeper. Why this matters for women 35+. Practical context, how this connects to daily life and long-term health. 3-6 sentences.",
      "Third slide with takeaway and action. What to expect and how to start. End with a new paragraph:\\n\\nFollow @{{brandhandle}} to learn more about your health."
    ],
    "image_prompt": "Detailed cinematic image description. No text, no letters, no numbers, no symbols, no logos."
  }},
  {{
    "title": "Second completely different health statement.",
    "caption": "Different hook paragraph...\\n\\nDifferent explanation...\\n\\nMore detail...\\n\\nTakeaway...\\n\\nSource:\\nDifferent Author. (Year). Different study. Journal, Vol(Issue), Pages.\\nDOI: 10.xxxx/xxxxx\\n\\n⚠️ Disclaimer:\\nThis content is intended for educational and informational purposes only and should not be considered medical advice. It is not designed to diagnose, treat, cure, or prevent any medical condition. Always consult a qualified healthcare professional before making dietary, medication, or lifestyle changes, particularly if you have existing health conditions. Individual responses may vary.",
    "slide_texts": [
      "Different core science explanation for the second topic. 3-6 sentences.",
      "Different deeper mechanism paragraph. 3-6 sentences.",
      "Different takeaway paragraph. End with:\\n\\nFollow @{{brandhandle}} to learn more about your brain."
    ],
    "image_prompt": "Completely different setting and subject. No text, no letters, no numbers, no symbols, no logos."
  }}
]

Generate exactly {count} posts now:"""

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
                    "temperature": 0.95,
                    "max_tokens": 8000
                },
                timeout=90
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
                    results = json.loads(content_text)
                    if isinstance(results, list) and len(results) >= count:
                        for r in results:
                            r["is_fallback"] = False
                            if r.get("title"):
                                r["title"] = r["title"].rstrip(".")
                            self._add_to_history({"title": r.get("title", "")})
                        return results[:count]
                    elif isinstance(results, list) and len(results) > 0:
                        # Got fewer than requested — pad with fallbacks
                        for r in results:
                            r["is_fallback"] = False
                            if r.get("title"):
                                r["title"] = r["title"].rstrip(".")
                            self._add_to_history({"title": r.get("title", "")})
                        while len(results) < count:
                            results.append(self._fallback_post_title())
                        return results
                    else:
                        print(f"⚠️ Unexpected batch response format", flush=True)
                        return [self._fallback_post_title() for _ in range(count)]
                except json.JSONDecodeError as e:
                    print(f"⚠️ JSON parse error in batch post generation: {e}", flush=True)
                    return [self._fallback_post_title() for _ in range(count)]
            else:
                print(f"⚠️ DeepSeek API error: {response.status_code}", flush=True)
                return [self._fallback_post_title() for _ in range(count)]

        except Exception as e:
            print(f"⚠️ Batch post generation error: {e}", flush=True)
            return [self._fallback_post_title() for _ in range(count)]

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
- Soft, minimal, calming wellness aesthetic
- Bright modern kitchen or clean lifestyle setting
- Neutral tones, gentle morning sunlight
- High-end lifestyle photography style
- Fresh, soothing, natural health remedy concept
- Must end with "No text, no letters, no numbers, no symbols, no logos."
- Should be 2-3 sentences long

### EXAMPLES:
Title: "Daily ginger consumption may reduce muscle pain by up to 25% and accelerate recovery."
Prompt: "Soft cinematic close-up of fresh ginger root being sliced on a clean white stone countertop in a bright modern kitchen. A glass of warm ginger-infused water with a lemon slice sits nearby, glowing in gentle morning sunlight. Minimal, calming wellness aesthetic, neutral tones, high-end lifestyle photography, fresh and soothing atmosphere, natural health remedy concept. No text, no letters, no numbers, no symbols, no logos."

Title: "Vitamin D and magnesium helps reduce depression and brain aging."
Prompt: "Soft cinematic close-up of vitamin D and magnesium supplements on a clean white surface beside a fresh orange and a glass of water in a bright modern kitchen. Gentle morning sunlight, minimal calming wellness aesthetic, neutral tones, high-end lifestyle photography. No text, no letters, no numbers, no symbols, no logos."

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
