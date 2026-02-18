"""
AI-powered caption generator using DeepSeek API.
"""
import os
import requests
from typing import List, Dict, Optional

from app.core.prompt_context import PromptContext


class CaptionGenerator:
    """Service for generating Instagram captions using DeepSeek AI."""
    
    @staticmethod
    def _get_brand_handle(brand_name: str) -> str:
        """Look up a brand's Instagram handle from the database."""
        try:
            from app.db_connection import get_db_session
            with get_db_session() as db:
                from app.models.brands import Brand
                brand = db.query(Brand).filter(Brand.brand_name == brand_name).first()
                if brand and getattr(brand, 'instagram_handle', None):
                    handle = brand.instagram_handle
                    return handle if handle.startswith('@') else f"@{handle}"
                if brand and brand.brand_name:
                    return f"@{brand.brand_name.lower().replace(' ', '')}"
        except Exception:
            pass
        return f"@{brand_name}" if brand_name else "@brand"
    
    # CTA options: empty defaults — configured dynamically via NicheConfig
    CTA_OPTIONS = {}
    
    # Hashtags: empty default — configured dynamically via NicheConfig
    HASHTAGS = ""
    
    def __init__(self):
        """Initialize the caption generator with DeepSeek API."""
        self.api_key = os.getenv("DEEPSEEK_API_KEY")
        self.base_url = "https://api.deepseek.com/v1"
        
        if not self.api_key:
            print("⚠️ Warning: DEEPSEEK_API_KEY not found")
        else:
            print("✅ DeepSeek API key loaded")
    
    def generate_first_paragraph(self, title: str, content_lines: List[str], ctx: PromptContext = None) -> str:
        """
        Generate the first paragraph of the caption using AI.
        
        Args:
            title: The post title
            content_lines: List of content bullet points
            ctx: Optional PromptContext for niche-aware generation
            
        Returns:
            Generated first paragraph text
        """
        if ctx is None:
            ctx = PromptContext()
        
        if not self.api_key:
            return self._fallback_paragraph(title, ctx)
        
        # Build context from content lines
        content_summary = "\n".join([f"- {line}" for line in content_lines[:5]])
        
        # Add randomization to ensure different openings
        import random
        opening_styles = [
            "Start with a surprising statistic or fact",
            "Begin with a common misconception to debunk", 
            "Open with how this impacts daily life",
            "Start by describing what happens in the body",
            "Begin with why most people overlook this",
            "Open with a relatable scenario or observation"
        ]
        style_hint = random.choice(opening_styles)
        
        niche_label = ctx.niche_name.lower()
        audience_label = ctx.target_audience

        prompt = f"""You are writing the first paragraph for an Instagram {niche_label} post. 
The post is about: {title}

Key points covered:
{content_summary}

STYLE INSTRUCTION: {style_hint}

Write a compelling opening paragraph (3-4 sentences) that:
1. Hooks the reader with an interesting fact or insight about the topic
2. Explains why this topic matters for {audience_label}
3. Mentions how small, consistent choices can make a difference
4. Uses a warm, educational tone (not salesy)
5. CRITICAL: Start with a COMPLETELY DIFFERENT opening sentence structure and words

DO NOT include:
- Hashtags
- Emojis
- Calls to action
- Brand mentions
- Questions

Just write the paragraph text, nothing else."""

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
                        {"role": "system", "content": f"You are a {niche_label} content writer. Write clear, informative content without hype or exaggeration. Always vary your opening sentences to ensure unique content - never repeat the same opening pattern."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 1.0,
                    "max_tokens": 300
                },
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                paragraph = result["choices"][0]["message"]["content"].strip()
                # Clean up any quotes that might wrap the response
                paragraph = paragraph.strip('"\'')
                return paragraph
            else:
                print(f"⚠️ DeepSeek API error: {response.status_code} - {response.text}")
                return self._fallback_paragraph(title, ctx)
                
        except Exception as e:
            print(f"⚠️ Caption generation error: {e}")
            return self._fallback_paragraph(title, ctx)
    
    def _fallback_paragraph(self, title: str, ctx: PromptContext = None) -> str:
        """Generate a fallback paragraph if AI fails."""
        if ctx is None:
            ctx = PromptContext()
        niche = ctx.niche_name.lower() if ctx.niche_name else "this topic"
        return f"Understanding {title.lower()} is essential for long-term {niche}. Small, consistent choices can compound over time to create meaningful improvements. By paying attention to these foundational elements, you give yourself the support needed to thrive."
    
    def generate_caption(
        self,
        brand_name: str,
        title: str,
        content_lines: List[str],
        cta_type: str = "sleep_lean",
        ctx: PromptContext = None
    ) -> str:
        """
        Generate a complete caption for a brand.
        
        Args:
            brand_name: Brand identifier (gymcollege, healthycollege, etc.)
            title: Post title
            content_lines: List of content bullet points
            cta_type: CTA option (sleep_lean, follow_tips, workout_plan)
            ctx: Optional PromptContext for niche-aware generation
            
        Returns:
            Complete formatted caption
        """
        if ctx is None:
            ctx = PromptContext()
        
        # Get brand handle dynamically
        handle = self._get_brand_handle(brand_name)
        
        # Generate AI first paragraph
        first_paragraph = self.generate_first_paragraph(title, content_lines, ctx=ctx)
        
        # Build follow section — only include if configured
        if ctx.follow_section_text:
            follow_section = f"""👉🏼 Follow {handle} for daily, {ctx.follow_section_text}"""
        else:
            follow_section = f"""👉🏼 Follow {handle} for more content like this."""
        
        # Build save section — only include if configured
        if ctx.save_section_text:
            save_section = f"""🩵 This post is designed to be saved and revisited. Share it with friends and family who are actively working on {ctx.save_section_text}."""
        else:
            save_section = f"""🩵 Save this post and share it with someone who needs to see this."""
        
        # Get CTA using weighted random selection from ctx
        from app.core.cta import get_cta_line
        cta_text = get_cta_line(ctx)
        cta_section = f"💬 {cta_text}" if cta_text else ""
        
        # Disclaimer from PromptContext — only include if configured
        disclaimer = f"🌱 {ctx.disclaimer_text}" if ctx.disclaimer_text else ""
        
        # Hashtags: prefer ctx.hashtag_string, fall back to hardcoded HASHTAGS
        hashtags = ctx.hashtag_string if ctx.hashtags else self.HASHTAGS
        
        # Combine all sections
        caption = f"""{first_paragraph}

{follow_section}

{save_section}

{cta_section}

{disclaimer}

{hashtags}"""
        
        return caption
    
    def generate_all_brand_captions(
        self,
        title: str,
        content_lines: List[str],
        cta_type: str = "sleep_lean",
        ctx: PromptContext = None
    ) -> Dict[str, str]:
        """
        Generate unique captions for all brands with different AI-generated first paragraphs.
        
        Args:
            title: Post title
            content_lines: List of content bullet points
            cta_type: CTA option for all brands
            ctx: Optional PromptContext for niche-aware generation
            
        Returns:
            Dictionary of brand_name -> caption
        """
        if ctx is None:
            ctx = PromptContext()
        
        captions = {}
        
        # Load brand list dynamically from DB
        try:
            from app.db_connection import get_db_session
            with get_db_session() as db:
                from app.models.brands import Brand
                brands = db.query(Brand.brand_name).all()
                brand_names = [b.brand_name for b in brands if b.brand_name]
        except Exception:
            brand_names = []
        
        for brand_name in brand_names:
            captions[brand_name] = self.generate_caption(
                brand_name=brand_name,
                title=title,
                content_lines=content_lines,
                cta_type=cta_type,
                ctx=ctx
            )
        
        return captions
    
    def generate_youtube_title(self, title: str, content_lines: List[str], ctx: PromptContext = None) -> str:
        """
        Generate an attractive, searchable YouTube Shorts title.
        
        YouTube titles should:
        - Be max 100 characters (YouTube truncates at ~70 visible)
        - Be searchable (include relevant keywords)
        - Be clickable (create curiosity)
        - NOT be in ALL CAPS (only the reel overlay is)
        
        Args:
            title: The original reel title (often ALL CAPS)
            content_lines: Content points for context
            ctx: Optional PromptContext for niche-aware generation
            
        Returns:
            YouTube-optimized title string
        """
        if ctx is None:
            ctx = PromptContext()
        if not self.api_key:
            return self._fallback_youtube_title(title)
        
        # Build context from content lines
        content_summary = "\n".join([f"- {line}" for line in content_lines[:3]])
        
        niche_label = ctx.niche_name.lower()

        prompt = f"""You are creating a YouTube Shorts title for a {niche_label} video.

Original reel title: {title}

Key points covered:
{content_summary}

Create a YouTube title that:
1. Is between 40-70 characters (short but descriptive)
2. Uses Title Case (not ALL CAPS)
3. Includes 1-2 searchable {niche_label} keywords naturally
4. Creates curiosity or urgency WITHOUT using numbers
5. NEVER use numbers like "3 Signs...", "5 Foods...", "This 1 Habit..."
6. Focus on intrigue and emotional hooks instead
7. Avoids clickbait but is engaging

GOOD EXAMPLES (no numbers, curiosity-driven):
- "This Bedtime Habit Is Secretly Ruining Your Sleep"
- "Why You're Always Tired (It's Not Sleep)"
- "The Hidden Reason You Can't Lose Weight"
- "Stop Doing This Every Morning For More Energy"
- "Your Hormones Are Begging You To Eat This"
- "This Common Food Is Destroying Your Gut"

BAD EXAMPLES (avoid these):
- "3 Signs Your Hormones Are Off" (has numbers)
- "5 Foods That Speed Up Fat Loss" (has numbers)
- "EAT THIS IF YOU ARE HORMONE IMBALANCED" (all caps)
- "Amazing Health Tips You Need to Know!!" (vague, excessive punctuation)
- "Watch This Before It's Too Late" (pure clickbait)

Respond with ONLY the title, nothing else."""

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
                        {"role": "system", "content": "You are a YouTube SEO expert. Write engaging, searchable titles."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.8,
                    "max_tokens": 100
                },
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                yt_title = result["choices"][0]["message"]["content"].strip()
                # Clean up any quotes that might wrap the response
                yt_title = yt_title.strip('"\'')
                # Ensure max 100 characters
                if len(yt_title) > 100:
                    yt_title = yt_title[:97] + "..."
                return yt_title
            else:
                print(f"⚠️ DeepSeek API error: {response.status_code} - {response.text}")
                return self._fallback_youtube_title(title)
                
        except Exception as e:
            print(f"⚠️ YouTube title generation error: {e}")
            return self._fallback_youtube_title(title)
    
    def _fallback_youtube_title(self, title: str) -> str:
        """Generate a fallback YouTube title from the reel title."""
        # Convert ALL CAPS to Title Case
        words = title.lower().split()
        # Capitalize first letter of each word, except small words
        small_words = {'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'is', 'if', 'of'}
        result = []
        for i, word in enumerate(words):
            if i == 0 or word not in small_words:
                result.append(word.capitalize())
            else:
                result.append(word)
        title_case = ' '.join(result)
        
        # Truncate if needed
        if len(title_case) > 100:
            title_case = title_case[:97] + "..."
        
        return title_case
