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
    build_system_prompt,
    build_runtime_prompt,
    build_runtime_prompt_with_history,
    build_correction_prompt,
    build_prompt_with_example,
    build_style_anchor,
    build_post_content_prompt,
    get_content_prompts,
)

# Niche Context
from app.core.prompt_context import PromptContext

# Quality Scoring
from app.core.quality_scorer import (
    get_quality_scorer,
    QualityScore
)

# Phase 2: Anti-Repetition & Quality Engine
from app.services.content.tracker import (
    get_content_tracker,
    check_post_quality,
    TOPIC_BUCKETS as TRACKER_TOPIC_BUCKETS,
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
        self.content_tracker = get_content_tracker()
        
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
            print("✅ Content Generator V2 initialized (3-layer architecture + Phase 2 tracker)")
    
    # CTA options are now managed via NicheConfig (Content DNA)
    # Use get_cta_line(ctx) from app.core.cta for weighted random selection
    
    # ============================================================
    # MAIN GENERATION METHOD
    # ============================================================
    
    def generate_viral_content(
        self,
        topic_hint: Optional[str] = None,
        format_hint: Optional[str] = None,
        hook_hint: Optional[str] = None,
        ctx: PromptContext = None
    ) -> Dict:
        """
        Generate viral content using 3-layer architecture.
        
        Args:
            topic_hint: Optional topic to focus on
            format_hint: Optional format style to use
            hook_hint: Optional psychological hook to use
            ctx: Optional PromptContext for niche-aware prompts
            
        Returns:
            Dictionary with title, content_lines, image_prompt, and metadata
        """
        if ctx is None:
            ctx = PromptContext()
        
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
        content, quality_score = self._generate_with_quality_loop(selection, ctx=ctx)
        
        if content:
            # Track for anti-repetition (in-memory)
            self._add_to_history(content)
            self.quality_scorer.add_to_history(content)
            
            # Track in persistent DB via Phase 2 tracker
            title = content.get("title", "")
            if title:
                self.content_tracker.record(
                    title=title,
                    content_type="reel",
                    image_prompt=content.get("image_prompt", ""),
                    caption="",
                    quality_score=content.get("quality_score", 0),
                    brand=getattr(self, '_current_brand', None)
                )
            
            # Update stats
            self._update_stats(quality_score, regenerated=False)
            
            return content
        else:
            self._generation_stats["fallbacks"] += 1
            return self._fallback_content()
    
    def _generate_with_quality_loop(
        self,
        selection: PatternSelection,
        ctx: PromptContext = None
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
                # First attempt: use tracker DB history for avoidance
                tracker_titles = self.content_tracker.get_recent_titles("reel", limit=10)
                tracker_topics = self.content_tracker.get_recent_topic_buckets("reel", limit=5)
                # Merge with in-memory for maximum coverage
                all_titles = list(dict.fromkeys(tracker_titles + self._recent_titles))
                all_topics = list(dict.fromkeys(tracker_topics + self._recent_topics))
                prompt = build_runtime_prompt_with_history(
                    selection,
                    all_titles,
                    all_topics,
                    ctx=ctx
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
            content = self._call_deepseek(prompt, use_example, ctx=ctx)
            
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
        include_example: bool = False,
        ctx: PromptContext = None
    ) -> Optional[Dict]:
        """
        Call DeepSeek API with the given prompt.
        
        Uses build_system_prompt(ctx) for niche-aware system prompt.
        """
        try:
            messages = [
                {
                    "role": "system",
                    "content": build_system_prompt(ctx)
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
        """Generic fallback content if AI fails. Uses neutral, niche-agnostic content."""
        fallback = {
            "title": "CONTENT GENERATION TEMPORARILY UNAVAILABLE",
            "content_lines": [
                "Our content engine is experiencing a brief delay",
                "Your next piece of content will be generated shortly",
                "Check back in a few minutes for fresh content"
            ],
            "image_prompt": "A cinematic lifestyle scene with soft golden sunlight and premium objects arranged artistically. Bright, clean, optimistic mood with studio-quality lighting. No text, no letters, no numbers, no symbols, no logos.",
            "generated_at": datetime.now().isoformat(),
            "success": True,
            "is_fallback": True,
            "format_style": "SHORT_FRAGMENT",
            "topic_category": "general",
            "generator_version": "v2_fallback"
        }
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
    
    def _select_cta(self, ctx: PromptContext = None) -> Optional[str]:
        """Select a CTA using weighted random selection from NicheConfig."""
        from app.core.cta import get_cta_line
        cta = get_cta_line(ctx)
        return cta if cta else None

    def _get_recent_post_titles_from_db(self, limit: int = 25) -> List[str]:
        """Fetch recent post titles from the database.
        
        Now delegates to ContentTracker which reads from content_history
        table + legacy generation_jobs for backward compat.
        """
        return self.content_tracker.get_recent_titles("post", limit)

    # ============================================================
    # POST TITLE GENERATION (for Instagram image posts, NOT reels)
    # ============================================================

    def generate_post_title(self, topic_hint: str = None, ctx: PromptContext = None) -> Dict:
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
        if ctx is None:
            ctx = PromptContext()
        
        if not self.api_key:
            return self._fallback_post_title()
        
        # Phase 2: Use ContentTracker for persistent anti-repetition
        history_context = self.content_tracker.build_history_context("post")
        
        # Pick topic using DB-backed cooldown rotation
        topic_bucket = self.content_tracker.pick_topic("post", topic_hint)
        
        # Use ctx topic categories when available, fall back to topic bucket name
        if ctx.topic_categories:
            topic_descriptions = {cat.lower().replace(" ", "_"): cat for cat in ctx.topic_categories}
            topic_descriptions["general"] = f"Any relevant {ctx.niche_name} topic" if ctx.niche_name else "Any relevant topic"
        else:
            topic_descriptions = {"general": "Any relevant topic for the target audience"}
        forced_topic = topic_hint if topic_hint else topic_descriptions.get(topic_bucket, topic_descriptions.get("general", "general topic"))
        
        niche_label = ctx.niche_name.lower() if ctx.niche_name else "content"
        brand_label = ctx.parent_brand_name if ctx.parent_brand_name else "the brand"
        audience_label = ctx.target_audience if ctx.target_audience else "the target audience"
        audience_desc = ctx.audience_description if ctx.audience_description else audience_label

        # Build topic list from ctx
        topic_list = ""
        if ctx.topic_categories:
            topic_list = "\n### OTHER VALID TOPICS (for reference only):\n"
            topic_list += "\n".join(f"- {t}" for t in ctx.topic_categories)

        # Build examples from ctx
        examples_section = ""
        if ctx.has_post_examples:
            examples_section = "\n### EXAMPLE POST TITLES (learn the pattern):\n"
            for ex in ctx.post_examples[:5]:
                examples_section += f'- "{ex.get("title", "")}"\n'

        # Build avoidance from ctx
        avoid_topics = ""
        if ctx.topic_avoid:
            avoid_topics = "\n- " + "\n- ".join(ctx.topic_avoid)

        disclaimer = ctx.disclaimer_text if ctx.disclaimer_text else "This content is intended for educational and informational purposes only. Individual results may vary."

        prompt = f"""You are a {niche_label} content creator for {brand_label}, targeting {audience_label}.

Generate a SINGLE short, engaging, {niche_label}-focused title and a matching Instagram caption with a real scientific reference.

### TARGET AUDIENCE:
{audience_desc}

### WHAT MAKES A GREAT POST TITLE:
- A bold, impactful statement written in ALL CAPS
- TITLE MUST BE 8-14 WORDS LONG (approximately 55-90 characters)
- Focused on one or two main benefits
- Some titles may include percentages for extra impact
- Positive, empowering, and slightly exaggerated to create scroll-stop engagement
- Do NOT lie, but dramatize slightly to spark discussion
- Do NOT end the title with a period (.)

### TOPIC FOR THIS POST (mandatory — write about this topic):
{topic_hint if topic_hint else forced_topic}
{topic_list}
{examples_section}
### WHAT TO AVOID:
- Reel-style titles like "5 SIGNS..." or "THINGS THAT DESTROY..."
- Question formats
- Lists or numbered formats (those are for reels)
- Vague claims without specifics
- Topics outside the configured niche{avoid_topics}

### CAPTION REQUIREMENTS:
Write a full Instagram caption (4-5 paragraphs) that:
- Paragraph 1: Hook — expand on the title with a surprising or counterintuitive angle
- Paragraph 2-3: Explain the science/mechanism in accessible language
- Paragraph 4: Summarize the takeaway
- After the paragraphs, add a "Source:" section with a REAL, EXISTING academic reference:
  Author(s). (Year). Title. Journal, Volume(Issue), Pages.
  DOI: 10.xxxx/xxxxx
  THE DOI MUST BE A REAL, VERIFIABLE DOI. NEVER invent or fabricate a DOI.
- End with a disclaimer block:
  ⚠️ Disclaimer:
  {disclaimer}
- Separate each section with a blank line

{history_context}

IMPORTANT: Generate about the MANDATORY topic above. Do NOT repeat any title from the PREVIOUSLY GENERATED list."""

        # Inject user-configured content prompts
        prompts = get_content_prompts()
        brand_desc = prompts.get('brand_description', '').strip()
        posts_prompt_text = prompts.get('posts_prompt', '').strip()
        if brand_desc:
            prompt += f"\n\n### BRAND CONTEXT:\n{brand_desc}"
        if posts_prompt_text:
            prompt += f"\n\n### ADDITIONAL INSTRUCTIONS:\n{posts_prompt_text}"

        image_style = ctx.image_style_description if ctx.image_style_description else "High-end lifestyle photography style"
        prompt += f"""

### IMAGE PROMPT REQUIREMENTS:
- {image_style}
- Must end with: "No text, no letters, no numbers, no symbols, no logos."

### OUTPUT FORMAT (JSON only, no markdown):
{{{{{{
    "title": "Your statement title here.",
    "caption": "Hook paragraph.\\n\\nExplanation...\\n\\nTakeaway.\\n\\nSource:\\nAuthor. (Year). Title. Journal.\\nDOI: 10.xxxx/xxxxx\\n\\n⚠️ Disclaimer:\\n{disclaimer}",
    "image_prompt": "Detailed cinematic image description. No text, no letters, no numbers, no symbols, no logos."
}}}}}}

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
                    "temperature": 1.0,
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
                    
                    title = result.get("title", "")
                    caption = result.get("caption", "")
                    
                    # Phase 2: Quality gate check
                    quality = check_post_quality(title, caption)
                    result["quality_score"] = quality.score
                    result["quality_issues"] = quality.issues
                    
                    if not quality.passed:
                        print(f"⚠️ Post quality gate FAILED ({quality.score:.0f}): {quality.issues}", flush=True)
                        # Still return it but mark it — don't waste the API call
                        result["quality_warning"] = True
                    
                    # Phase 2: Duplicate check
                    if title and self.content_tracker.is_duplicate(title, "post"):
                        print(f"⚠️ Duplicate detected: '{title[:60]}...' — returning anyway (marked)", flush=True)
                        result["is_duplicate"] = True
                    
                    # Phase 2: Record in persistent content_history
                    self.content_tracker.record(
                        title=title,
                        content_type="post",
                        caption=caption,
                        image_prompt=result.get("image_prompt"),
                        quality_score=quality.score,
                    )
                    
                    # Also keep in-memory for backward compat
                    self._add_to_history({
                        "title": title,
                        "topic_category": topic_hint or forced_topic
                    })
                    
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
        """Generic fallback when AI generation fails."""
        return {
            "title": "Content generation temporarily unavailable",
            "caption": "Our AI content engine is experiencing a brief delay. Your content will be generated shortly.\n\nPlease try again in a few minutes.",
            "image_prompt": "A cinematic lifestyle scene with soft golden sunlight and premium objects arranged artistically. Bright, clean, optimistic mood with studio-quality lighting. No text, no letters, no numbers, no symbols, no logos.",
            "is_fallback": True,
            "slide_texts": [],
        }

    # ============================================================
    # BATCH POST GENERATION (unique post per brand)
    # ============================================================

    def generate_post_titles_batch(self, count: int, topic_hint: str = None, ctx: PromptContext = None) -> List[Dict]:
        """
        Generate N completely unique posts in a single AI call.
        Each post has a different topic, title, caption, and image prompt.
        Used so each brand gets a completely different post.

        Args:
            count: Number of unique posts to generate
            topic_hint: Optional hint to guide topic selection
            ctx: Optional PromptContext for niche-aware prompts

        Returns:
            List of dicts, each with 'title', 'caption', 'image_prompt', 'is_fallback'
        """
        if ctx is None:
            ctx = PromptContext()
        
        if not self.api_key or count <= 0:
            return [self._fallback_post_title() for _ in range(max(count, 1))]

        # Phase 2: Use ContentTracker for persistent anti-repetition
        history_context = self.content_tracker.build_history_context("post")

        prompt = build_post_content_prompt(
            count=count,
            history_context=history_context,
            topic_hint=topic_hint,
            ctx=ctx,
        )

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
                            title = r.get("title", "")
                            # Phase 2: Quality gate + record
                            quality = check_post_quality(title, r.get("caption", ""))
                            r["quality_score"] = quality.score
                            r["quality_issues"] = quality.issues
                            self.content_tracker.record(
                                title=title,
                                content_type="post",
                                caption=r.get("caption"),
                                image_prompt=r.get("image_prompt"),
                                quality_score=quality.score,
                            )
                            self._add_to_history({"title": title})
                        return results[:count]
                    elif isinstance(results, list) and len(results) > 0:
                        # Got fewer than requested — pad with fallbacks
                        for r in results:
                            r["is_fallback"] = False
                            if r.get("title"):
                                r["title"] = r["title"].rstrip(".")
                            title = r.get("title", "")
                            quality = check_post_quality(title, r.get("caption", ""))
                            r["quality_score"] = quality.score
                            r["quality_issues"] = quality.issues
                            self.content_tracker.record(
                                title=title,
                                content_type="post",
                                caption=r.get("caption"),
                                image_prompt=r.get("image_prompt"),
                                quality_score=quality.score,
                            )
                            self._add_to_history({"title": title})
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

    def generate_image_prompt(self, title: str, ctx: PromptContext = None) -> Dict:
        """
        Generate an AI image prompt based on a given title.
        
        Used when the user provides a title but leaves the image prompt blank.
        Works for both posts and dark mode reels.
        
        Args:
            title: The content title to base the image prompt on
            ctx: Optional PromptContext for niche-aware prompts
            
        Returns:
            Dict with 'image_prompt' and 'is_fallback' keys
        """
        if ctx is None:
            ctx = PromptContext()
        
        if not self.api_key or not title.strip():
            return self._fallback_image_prompt(title)
        
        niche_label = ctx.niche_name if ctx.niche_name else "lifestyle"
        image_style = ctx.image_style_description if ctx.image_style_description else "High-end lifestyle photography style"

        prompt = f"""You are a visual prompt engineer specializing in {niche_label.lower()} imagery for Instagram.

Given the following title, generate a DETAILED cinematic image prompt suitable for AI image generation (DALL-E / Flux).

### TITLE:
"{title}"

### REQUIREMENTS:
- {image_style}
- Must end with "No text, no letters, no numbers, no symbols, no logos."
- Should be 2-3 sentences long

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
        """Generic fallback image prompt when AI fails."""
        return {
            "image_prompt": "A cinematic lifestyle scene with soft golden sunlight and premium objects arranged artistically. Bright, clean, optimistic mood with studio-quality lighting. No text, no letters, no numbers, no symbols, no logos.",
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
