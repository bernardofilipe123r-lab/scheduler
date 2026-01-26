"""
AI-powered caption generator using DeepSeek API.
"""
import os
import requests
from typing import List, Dict, Optional


class CaptionGenerator:
    """Service for generating Instagram captions using DeepSeek AI."""
    
    # Brand Instagram handles
    BRAND_HANDLES = {
        "gymcollege": "@thegymcollege",
        "healthycollege": "@thehealthycollege",
        "vitalitycollege": "@thevitalitycollege",
        "longevitycollege": "@thelongevitycollege",
        "holisticcollege": "@theholisticcollege",
        "wellbeingcollege": "@thewellbeingcollege",
    }
    
    # CTA options
    CTA_OPTIONS = {
        "sleep_lean": """💬 If you want to take this one step further, comment LEAN. We'll send you details about Sleep Lean, a targeted nighttime formula designed to support fat loss while you sleep by promoting deep rest, metabolic efficiency, and overnight recovery. When your body sleeps better, it burns fat more effectively. Built on ingredients rooted in traditional use and supported by modern research, Sleep Lean addresses a critical but often overlooked piece of sustainable fat loss — quality sleep. Thousands worldwide are already using it as part of their nightly routine for fat-loss and overall health support.""",
        
        "follow_tips": """💬 If you found this helpful, make sure to follow for more daily tips on nutrition, health, and natural wellness strategies. We share research-backed content designed to help you make better choices for your body and long-term vitality.""",
        
        "workout_plan": """💬 If you want to take this one step further, comment PLAN. We'll send you our complete guide to building the best workout and nutrition plan to lose fat effectively. This includes meal timing strategies, exercise protocols, and lifestyle adjustments that work together to optimize your metabolism and support sustainable fat loss.""",
    }
    
    # Fixed hashtags
    HASHTAGS = "#habits #interestingfacts #naturalhealing #healthtips #holistichealth"
    
    def __init__(self):
        """Initialize the caption generator with DeepSeek API."""
        self.api_key = os.getenv("DEEPSEEK_API_KEY")
        self.base_url = "https://api.deepseek.com/v1"
        
        if not self.api_key:
            print("⚠️ Warning: DEEPSEEK_API_KEY not found")
        else:
            print("✅ DeepSeek API key loaded")
    
    def generate_first_paragraph(self, title: str, content_lines: List[str]) -> str:
        """
        Generate the first paragraph of the caption using AI.
        
        Args:
            title: The post title
            content_lines: List of content bullet points
            
        Returns:
            Generated first paragraph text
        """
        if not self.api_key:
            return self._fallback_paragraph(title)
        
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
        
        prompt = f"""You are writing the first paragraph for an Instagram health/wellness post. 
The post is about: {title}

Key points covered:
{content_summary}

STYLE INSTRUCTION: {style_hint}

Write a compelling opening paragraph (3-4 sentences) that:
1. Hooks the reader with an interesting fact or insight about the topic
2. Explains why this topic matters for their health
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
                        {"role": "system", "content": "You are a health and wellness content writer. Write clear, informative content without hype or exaggeration. Always vary your opening sentences to ensure unique content - never repeat the same opening pattern."},
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
                return self._fallback_paragraph(title)
                
        except Exception as e:
            print(f"⚠️ Caption generation error: {e}")
            return self._fallback_paragraph(title)
    
    def _fallback_paragraph(self, title: str) -> str:
        """Generate a fallback paragraph if AI fails."""
        return f"Understanding {title.lower()} is essential for long-term health and wellness. Small, consistent choices in nutrition, movement, and lifestyle can compound over time to create meaningful improvements in how you feel and function. By paying attention to these foundational elements, you give your body the support it needs to thrive naturally."
    
    def generate_caption(
        self,
        brand_name: str,
        title: str,
        content_lines: List[str],
        cta_type: str = "sleep_lean"
    ) -> str:
        """
        Generate a complete caption for a brand.
        
        Args:
            brand_name: Brand identifier (gymcollege, healthycollege, etc.)
            title: Post title
            content_lines: List of content bullet points
            cta_type: CTA option (sleep_lean, follow_tips, workout_plan)
            
        Returns:
            Complete formatted caption
        """
        # Get brand handle
        handle = self.BRAND_HANDLES.get(brand_name, "@thegymcollege")
        
        # Generate AI first paragraph
        first_paragraph = self.generate_first_paragraph(title, content_lines)
        
        # Build fixed sections with brand handle
        follow_section = f"""👉🏼 Follow {handle} for daily, research-informed content on whole-body health, natural approaches to healing, digestive health support, and long-term wellness strategies centered on nutrition and prevention."""
        
        save_section = """🩵 This post is designed to be saved and revisited. Share it with friends and family who are actively working on improving their health, energy levels, metabolic balance, and long-term vitality through natural methods."""
        
        # Get selected CTA
        cta_section = self.CTA_OPTIONS.get(cta_type, self.CTA_OPTIONS["sleep_lean"])
        
        disclaimer = """🌱 Content provided for educational purposes. Always seek guidance from a qualified healthcare provider before adjusting your diet."""
        
        # Combine all sections
        caption = f"""{first_paragraph}

{follow_section}

{save_section}

{cta_section}

{disclaimer}

{self.HASHTAGS}"""
        
        return caption
    
    def generate_all_brand_captions(
        self,
        title: str,
        content_lines: List[str],
        cta_type: str = "sleep_lean"
    ) -> Dict[str, str]:
        """
        Generate unique captions for all brands with different AI-generated first paragraphs.
        
        Args:
            title: Post title
            content_lines: List of content bullet points
            cta_type: CTA option for all brands
            
        Returns:
            Dictionary of brand_name -> caption
        """
        captions = {}
        
        for brand_name in self.BRAND_HANDLES.keys():
            # Use the generate_caption method for each brand
            captions[brand_name] = self.generate_caption(
                brand_name=brand_name,
                title=title,
                content_lines=content_lines,
                cta_type=cta_type
            )
        
        return captions
    
    def generate_youtube_title(self, title: str, content_lines: List[str]) -> str:
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
            
        Returns:
            YouTube-optimized title string
        """
        if not self.api_key:
            return self._fallback_youtube_title(title)
        
        # Build context from content lines
        content_summary = "\n".join([f"- {line}" for line in content_lines[:3]])
        
        prompt = f"""You are creating a YouTube Shorts title for a health/wellness video.

Original reel title: {title}

Key points covered:
{content_summary}

Create a YouTube title that:
1. Is between 40-70 characters (short but descriptive)
2. Uses Title Case (not ALL CAPS)
3. Includes 1-2 searchable health keywords naturally
4. Creates curiosity or urgency
5. Could include a number if appropriate (e.g., "5 Signs...", "This 1 Food...")
6. Avoids clickbait but is engaging

GOOD EXAMPLES:
- "5 Signs Your Hormones Are Out of Balance"
- "This Bedtime Habit Is Secretly Ruining Your Sleep"
- "Foods That Actually Speed Up Fat Loss"
- "Why You're Always Tired (It's Not Sleep)"

BAD EXAMPLES (avoid):
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
