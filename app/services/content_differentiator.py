"""
Content differentiation service using DeepSeek API.
Creates unique content variations for each brand while maintaining the core message.
"""
import os
import json
import requests
from typing import List, Optional


class ContentDifferentiator:
    """
    Service for creating brand-specific content variations.
    
    For each brand, this service:
    - Changes 1-2 words (synonyms, rephrasing)
    - Reorders content lines
    - Removes 1-2 topics
    - Adds 1-2 completely new related topics
    - NEVER touches the last CTA line
    """
    
    def __init__(self):
        """Initialize the content differentiator with DeepSeek API."""
        self.api_key = os.getenv("DEEPSEEK_API_KEY")
        self.base_url = "https://api.deepseek.com/v1"
        
        if not self.api_key:
            print("⚠️ Warning: DEEPSEEK_API_KEY not found - content differentiation disabled")
        else:
            print("✅ Content Differentiator initialized with DeepSeek API")
    
    def differentiate_content(
        self,
        brand: str,
        title: str,
        content_lines: List[str],
        all_brands: List[str]
    ) -> List[str]:
        """
        Create a unique content variation for a specific brand.
        
        Args:
            brand: The brand to generate content for (e.g., "healthycollege")
            title: The post title
            content_lines: Original content lines
            all_brands: List of all brands being generated (for context)
            
        Returns:
            Modified content lines unique to this brand
        """
        # If no API key, return original content
        if not self.api_key:
            print(f"⚠️ No DEEPSEEK_API_KEY - returning original content for {brand}")
            return content_lines
        
        # If only one brand or less than 3 content lines, skip differentiation
        if len(all_brands) <= 1 or len(content_lines) < 3:
            return content_lines
        
        # Separate CTA from content (last line is always CTA - never touch it)
        main_content = content_lines[:-1]
        cta_line = content_lines[-1]
        
        # Get brand position for variation instructions
        brand_position = all_brands.index(brand) if brand in all_brands else 0
        
        # Build the differentiation prompt
        prompt = self._build_differentiation_prompt(
            brand=brand,
            title=title,
            main_content=main_content,
            brand_position=brand_position,
            total_brands=len(all_brands)
        )
        
        try:
            print(f"\n🔄 Differentiating content for {brand}...")
            
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
                            "content": """You are a content variation expert. Your job is to create unique variations of health/wellness content for different brands.

RULES:
1. Keep the same overall message and topic
2. Change 1-2 words in each point (use synonyms, rephrase slightly)
3. Reorder the points differently
4. Remove 1-2 existing points
5. Add 1-2 NEW related points that weren't in the original
6. Keep the total number of points similar (within ±1)
7. Output ONLY a JSON array of strings, no explanation
8. Each point should be concise (under 100 characters)
9. Use markdown **bold** for key terms
10. Points should NOT have numbering (no "1.", "2.", etc.)"""
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    "temperature": 0.8,  # Higher temperature for more variation
                    "max_tokens": 1000
                },
                timeout=30
            )
            
            response.raise_for_status()
            result = response.json()
            
            # Extract the content from the response
            ai_content = result["choices"][0]["message"]["content"].strip()
            
            # Parse the JSON array
            # Remove markdown code blocks if present
            if ai_content.startswith("```"):
                ai_content = ai_content.split("```")[1]
                if ai_content.startswith("json"):
                    ai_content = ai_content[4:]
                ai_content = ai_content.strip()
            
            differentiated_lines = json.loads(ai_content)
            
            # Validate the output
            if not isinstance(differentiated_lines, list):
                print(f"⚠️ Invalid response format for {brand}, using original content")
                return content_lines
            
            if len(differentiated_lines) < 2:
                print(f"⚠️ Too few lines returned for {brand}, using original content")
                return content_lines
            
            # Add CTA back at the end (never modified)
            differentiated_lines.append(cta_line)
            
            print(f"✅ Content differentiated for {brand}: {len(differentiated_lines)} lines")
            return differentiated_lines
            
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse AI response for {brand}: {e}")
            return content_lines
        except requests.exceptions.RequestException as e:
            print(f"❌ API error differentiating content for {brand}: {e}")
            return content_lines
        except Exception as e:
            print(f"❌ Unexpected error differentiating content for {brand}: {e}")
            return content_lines
    
    def _build_differentiation_prompt(
        self,
        brand: str,
        title: str,
        main_content: List[str],
        brand_position: int,
        total_brands: int
    ) -> str:
        """Build the prompt for content differentiation."""
        
        # Brand-specific personality/focus hints
        brand_hints = {
            "healthycollege": "Focus on natural remedies, whole foods, and holistic approaches",
            "vitalitycollege": "Emphasize energy, vitality, metabolism, and active lifestyle",
            "longevitycollege": "Highlight longevity, anti-aging, cellular health, and prevention",
            "gymcollege": "Focus on fitness, exercise, muscle, and physical training"
        }
        
        hint = brand_hints.get(brand, "Focus on health and wellness")
        
        # Variation strength based on position (later brands = more different)
        variation_level = "moderate" if brand_position == 0 else "significant" if brand_position == 1 else "substantial"
        
        # Format content for prompt
        content_text = "\n".join([f"- {line}" for line in main_content])
        
        return f"""Create a {variation_level} variation of this health content for the brand "{brand}".

TITLE: {title}

ORIGINAL CONTENT:
{content_text}

BRAND FOCUS: {hint}

REQUIREMENTS:
- This is brand {brand_position + 1} of {total_brands}, so make it noticeably different from the original
- Change at least 1-2 words per point (synonyms, rephrasing)
- Reorder the points
- Remove 1-2 existing points
- Add 1-2 NEW related points
- Keep points concise
- Use **bold** for key terms
- NO numbering (no "1.", "2.")
- Output ONLY a JSON array of strings

OUTPUT FORMAT:
["point 1 text", "point 2 text", "point 3 text", ...]"""
