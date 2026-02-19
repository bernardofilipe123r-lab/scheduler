"""
Content differentiation service using DeepSeek API.
Creates unique content variations for each brand while maintaining the core message.

STRATEGY:
- Longevity College gets the ORIGINAL content (baseline)
- Other brands get variations from ONE DeepSeek call (ensures diversity)
- ALL items (except CTA) must be in DIFFERENT positions across brands
- Different wording/synonyms for each brand variation
"""
import os
import json
import requests
from typing import List, Dict, Optional

from app.core.prompt_context import PromptContext


class ContentDifferentiator:
    """
    Service for creating brand-specific content variations.
    
    For each brand variation, this service ensures:
    - Complete reordering of ALL content items (no item in same position as original)
    - Different wording/synonyms for each point
    - Removal of 1-2 topics and addition of 1-2 new related topics
    - CTA line always stays at the end (never modified)
    
    Longevity College always gets the original content as baseline.
    """
    
    BASELINE_BRAND = None  # First brand in the list gets original content
    
    def __init__(self, niche_config_service=None):
        """Initialize the content differentiator with DeepSeek API."""
        self.api_key = os.getenv("DEEPSEEK_API_KEY")
        self.base_url = "https://api.deepseek.com/v1"
        
        if niche_config_service is None:
            from app.services.content.niche_config_service import get_niche_config_service
            niche_config_service = get_niche_config_service()
        self.niche_config_service = niche_config_service
        
        if not self.api_key:
            print("⚠️ Warning: DEEPSEEK_API_KEY not found - content differentiation disabled")
        else:
            print("✅ Content Differentiator initialized with DeepSeek API")
    
    def _get_brand_hint(self, brand_id: str, ctx: PromptContext = None) -> str:
        """Get brand personality hint from PromptContext."""
        if ctx and ctx.brand_personality:
            return ctx.brand_personality
        if ctx and ctx.niche_description:
            return ctx.niche_description
        return "content creation"

    def differentiate_all_brands(
        self,
        title: str,
        content_lines: List[str],
        brands: List[str],
        ctx: PromptContext = None
    ) -> Dict[str, List[str]]:
        """
        Create unique content variations for ALL brands in one call.
        
        Args:
            title: The post title
            content_lines: Original content lines (including CTA at end)
            brands: List of all brands to generate for
            
        Returns:
            Dict mapping brand -> content_lines
        """
        if ctx is None:
            ctx = PromptContext()
        
        result = {}
        
        # Separate CTA from content (last line is always CTA - never touch it)
        main_content = content_lines[:-1]
        cta_line = content_lines[-1]
        
        # Brands that need variations (exclude baseline brand — first brand is baseline)
        baseline_brand = brands[0].lower() if brands else None
        variation_brands = [b for b in brands if b.lower() != baseline_brand]
        
        # Baseline brand gets original content
        if baseline_brand:
            result[baseline_brand] = content_lines.copy()
            print(f"✅ {baseline_brand}: Using original content (baseline)")
        
        # If no API key or not enough brands/content, return originals for all
        if not self.api_key or len(variation_brands) == 0 or len(main_content) < 3:
            for brand in brands:
                if brand.lower() not in result:
                    result[brand.lower()] = content_lines.copy()
            return result
        
        # Generate all variations in ONE API call
        try:
            variations = self._generate_all_variations(
                title=title,
                main_content=main_content,
                brands=variation_brands,
                ctx=ctx
            )
            
            # Add CTA to each variation and store
            for brand_key, lines in variations.items():
                bk = brand_key.lower()
                if bk != baseline_brand:
                    lines.append(cta_line)
                    result[bk] = lines
                    print(f"✅ {bk}: Generated unique variation ({len(lines)} lines)")
            
            # Fallback for any missing brands
            for brand in brands:
                brand_lower = brand.lower()
                if brand_lower not in result:
                    result[brand_lower] = content_lines.copy()
                    print(f"⚠️ {brand_lower}: Using original (fallback)")
                    
        except Exception as e:
            print(f"❌ Failed to generate variations: {e}")
            # Fallback to original for all
            for brand in brands:
                result[brand.lower()] = content_lines.copy()
        
        return result
    
    def _generate_all_variations(
        self,
        title: str,
        main_content: List[str],
        brands: List[str],
        ctx: PromptContext = None
    ) -> Dict[str, List[str]]:
        """
        Generate variations for all brands in ONE API call.
        This ensures DeepSeek can see all variations and make them truly different.
        """
        if ctx is None:
            ctx = PromptContext()
        
        num_brands = len(brands)
        num_items = len(main_content)
        
        # Format original content
        content_text = "\n".join([f"{i+1}. {line}" for i, line in enumerate(main_content)])
        
        # Build brand list with hints from PromptContext or fallback dict
        brands_info = "\n".join([
            f"- {brand}: {self._get_brand_hint(brand.lower(), ctx)}"
            for brand in brands
        ])
        
        niche_label = ctx.niche_name.lower() if ctx.niche_name else "content"
        
        prompt = f"""You are creating {num_brands} UNIQUE variations of {niche_label} content for different brands.

TITLE: {title}

ORIGINAL CONTENT ({num_items} items):
{content_text}

BRANDS TO CREATE VARIATIONS FOR:
{brands_info}

═══════════════════════════════════════════════════════════════════════════════
CRITICAL RULES - READ CAREFULLY:
═══════════════════════════════════════════════════════════════════════════════

1. COMPLETE POSITION SHUFFLE (MANDATORY):
   - If original has items A,B,C,D,E,F,G,H,I,J at positions 1-10
   - Each brand must have items in COMPLETELY DIFFERENT positions
   - Example: Brand1 might start with item G, Brand2 with item C, Brand3 with item I
   - NO two brands should have the same item in the same position

2. REWORDING (MANDATORY):
   - Each point must be reworded differently per brand
   - Use different sentence structures:
     * Active: "Static stretching reduces power by 30%"
     * Passive: "Muscle power is reduced 30% by static stretching"
     * Different opening: "Up to 30% power loss occurs with static stretching"
   - Use different synonyms: reduce/lower/decrease/diminish/cut
   - Keep grammar 100% correct and English easy to understand

3. ITEM CHANGES:
   - Remove 1-2 items from the original list
   - Add 1-2 NEW related items that weren't in the original
   - Final count should be similar (within ±2 of original)

4. NO NUMBERING in output (numbers will be added later)

5. NO CTA LINE - that's handled separately

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON only, no explanation):
═══════════════════════════════════════════════════════════════════════════════

{{
  "brand1": ["item1", "item2", "item3", ...],
  "brand2": ["item1", "item2", "item3", ...],
  ...
}}

Use exact brand names as keys: {', '.join(brands)}

OUTPUT ONLY THE JSON OBJECT:"""

        print(f"\n🔄 Generating {num_brands} unique variations in one call...")
        
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
                        "content": f"You are an expert content variation generator. You create multiple unique versions of {ctx.niche_description or 'content'}. Your output is ALWAYS valid JSON with brand names as keys and arrays of strings as values. Each variation must be meaningfully different in: word order within sentences, synonyms used, item order in the list, sentence structure (active/passive/inverted). Keep language simple, grammatically perfect, and easy to understand."
                    },
                    {
                        "role": "user", 
                        "content": prompt
                    }
                ],
                "temperature": 0.9,  # High temperature for maximum variation
                "max_tokens": 4000
            },
            timeout=60
        )
        
        response.raise_for_status()
        result = response.json()
        
        # Extract and parse response
        ai_content = result["choices"][0]["message"]["content"].strip()
        
        # Clean up JSON if wrapped in markdown
        if ai_content.startswith("```"):
            ai_content = ai_content.split("```")[1]
            if ai_content.startswith("json"):
                ai_content = ai_content[4:]
            ai_content = ai_content.strip()
        
        variations = json.loads(ai_content)
        
        # Validate structure
        if not isinstance(variations, dict):
            raise ValueError("Response is not a dictionary")
        
        # Normalize brand keys - handle various formats DeepSeek might return
        # e.g., "Healthy College", "healthy_college", "healthycollege", "HealthyCollege"
        normalized = {}
        for brand_key, lines in variations.items():
            # Normalize: remove spaces, underscores, hyphens and lowercase
            brand_normalized = brand_key.lower().replace(" ", "").replace("_", "").replace("-", "")
            if isinstance(lines, list) and len(lines) >= 2:
                normalized[brand_normalized] = lines
                print(f"   ✓ {brand_key} -> {brand_normalized}: {len(lines)} lines")
            else:
                print(f"⚠️ Invalid variation for {brand_key}, skipping")
        
        print(f"✅ Generated {len(normalized)} unique variations")
        print(f"   Brands in response: {list(normalized.keys())}")
        return normalized
    
    # Keep legacy method for backward compatibility
    def differentiate_content(
        self,
        brand: str,
        title: str,
        content_lines: List[str],
        all_brands: List[str]
    ) -> List[str]:
        """
        Legacy method - now redirects to differentiate_all_brands.
        Kept for backward compatibility.
        """
        # Use the new unified approach
        all_variations = self.differentiate_all_brands(
            title=title,
            content_lines=content_lines,
            brands=all_brands
        )
        return all_variations.get(brand.lower(), content_lines)
