"""
Story Polisher — generates viral reel content + AI image prompts via DeepSeek.

100% self-contained: DeepSeek generates the post text AND image prompts.
No external story discovery needed. Images are generated via DeAPI from the
AI prompts returned by DeepSeek.
"""
import hashlib
import json
import logging
import os
import re
from dataclasses import dataclass, asdict
from typing import Optional

from openai import OpenAI

logger = logging.getLogger(__name__)


@dataclass
class ImagePlan:
    source_type: str  # "ai_generate" | "web_search"
    query: str  # The AI PROMPT for image generation
    fallback_query: Optional[str] = None
    search_query: Optional[str] = None  # Google Images search query (from DeepSeek SEARCH QUERY)


@dataclass
class PolishedStory:
    # Reel text content
    reel_text: str
    reel_lines: list[str]

    # Thumbnail
    thumbnail_title: str
    thumbnail_title_lines: list[str]

    # Image sourcing plan (AI prompts for DeAPI)
    images: list[ImagePlan]
    thumbnail_image: ImagePlan

    # Caption + metadata
    caption: str
    hashtags: list[str]
    story_category: str

    # Fingerprint for dedup
    story_fingerprint: str

    # Debug: prompts used
    deepseek_prompt: str = ""
    deepseek_response: str = ""

    def to_dict(self) -> dict:
        return {
            "reel_text": self.reel_text,
            "reel_lines": self.reel_lines,
            "thumbnail_title": self.thumbnail_title,
            "thumbnail_title_lines": self.thumbnail_title_lines,
            "images": [asdict(ip) for ip in self.images],
            "thumbnail_image": asdict(self.thumbnail_image),
            "caption": self.caption,
            "hashtags": self.hashtags,
            "story_category": self.story_category,
            "story_fingerprint": self.story_fingerprint,
            "deepseek_prompt": self.deepseek_prompt,
            "deepseek_response": self.deepseek_response,
        }


def _compute_fingerprint(text: str, lines: list[str]) -> str:
    """Compute dedup fingerprint from reel text + first few lines."""
    content = text.lower().strip() + "|" + "|".join(
        sorted(l.lower().strip() for l in lines[:3])
    )
    return hashlib.sha256(content.encode()).hexdigest()[:16]


# ── DeepSeek prompt template ───────────────────────────────────────────────
# Generates BOTH the viral post AND AI image prompts in one call.

FORMAT_B_PROMPT = """Niche: {niche}

Task:
Write ONE viral-style insight post.

With ~25% probability, instead base the post on a very recent or emerging topic (e.g., a new study, strange health news, unusual trend, or relevant global development related to the niche). Do not mention that it is recent—just write the post normally.

THUMBNAIL TITLE

Write a short, punchy headline suitable for a social media thumbnail like news pages use.
The title MUST be relevant to the niche above.

Rules:
• 4–10 words
• Bold statement, surprising claim, or dramatic fact
• Written in ALL CAPS
• Designed to stop the scroll and attract attention
• Must relate to the niche provided

These examples show the STYLE and FORMAT only — your title must match the niche above:
"ELON MUSK'S WEALTH BREAKS REALITY"
"GEN Z SAYS WORKING 40 HOURS NO LONGER BUYS A FUTURE"
"ROBOT WITH AN ARTIFICIAL WOMB COULD DELIVER HUMAN BABY BY 2026"
"JAPAN RECORDS LOWEST BIRTHS SINCE 1899"
"NETFLIX SPENT NEARLY $500M ON ONE SEASON"
"CYBERTRUCK IS THE SAFEST PICKUP EVER TESTED"
"MCDONALD'S KIOSKS ARE DESIGNED TO MAKE YOU SPEND MORE"
"BY 2030, A FIT BODY WILL BE RARE LUXURY"
"PIZZA ORDERS NEAR THE PENTAGON SPIKE BEFORE WAR"
"DENMARK GIVES PEOPLE COPYRIGHT OVER THEIR OWN FACE AND VOICE"

POST

Write ONE viral-style insight post explaining the story or phenomenon.

Length:
40–70 words maximum.

Style:
• Start with a strong claim
• Briefly explain the hidden mechanism, system, or reason behind it
• Include one concrete number, statistic, or fact when possible
• End with a sharp insight

Tone:
concise, analytical, authoritative

No emojis, hashtags, fluff, or lists.

VISUALS

Recommend 3–4 visuals that would work well with the post.

For each visual provide:

IMAGE IDEA
Describe what the image should show.

AI PROMPT
A prompt for generating the image with an AI image generator.

SEARCH QUERY
A precise Google Images search query to find a real photo matching this visual. Be specific to avoid ambiguity — e.g., "U.S. Pentagon building aerial view" not just "pentagon", "Apple iPhone 16 Pro" not just "apple", "Donald Trump speech podium" not just "Trump". Include context keywords (location, brand, object type) so the search returns exactly the right subject.

IMAGE RULES

Images must be:
• cinematic 4K
• vivid colors
• dramatic lighting
• high contrast
• realistic photography style
• visually striking and engaging for social media
• no text overlays
• no infographic style

OUTPUT FORMAT

TITLE:
<thumbnail headline>

POST:
<viral insight post>

VISUALS:

1.
IMAGE IDEA:
...

AI PROMPT:
...

SEARCH QUERY:
...

2.
IMAGE IDEA:
...

AI PROMPT:
...

SEARCH QUERY:
...

3.
IMAGE IDEA:
...

AI PROMPT:
...

SEARCH QUERY:
...

4.
IMAGE IDEA:
...

AI PROMPT:
...

SEARCH QUERY:
..."""


def _get_deepseek_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


class StoryPolisher:
    """Generates viral reel content + AI image prompts via DeepSeek."""

    def __init__(self):
        self.client = _get_deepseek_client()

    def generate_content(self, niche: str) -> Optional[PolishedStory]:
        """
        Generate a complete viral reel (text + image prompts) from scratch.

        DeepSeek generates everything — no external story source needed.
        The AI PROMPTs in the response are used directly by DeAPI for image generation.

        Returns a PolishedStory or None on failure.
        """
        try:
            user_prompt = FORMAT_B_PROMPT.format(niche=niche)

            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": "You are a viral content creator. Follow the output format exactly."},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.8,
                max_tokens=2000,
                top_p=0.95,
            )

            content = response.choices[0].message.content
            if not content:
                logger.error("[StoryPolisher] Empty response from DeepSeek")
                return None

            result = self._parse_response(content)
            if result:
                result.deepseek_prompt = user_prompt
                result.deepseek_response = content
            return result

        except Exception as e:
            logger.error(f"[StoryPolisher] DeepSeek error: {e}")
            return None

    def _parse_response(self, content: str) -> Optional[PolishedStory]:
        """Parse DeepSeek structured text response into PolishedStory."""
        try:
            # Extract TITLE section (comes before POST in new format)
            title_match = re.search(r'TITLE:\s*\n(.+?)(?=\nPOST:)', content, re.DOTALL)
            thumbnail_title = title_match.group(1).strip() if title_match else ""
            thumbnail_title_lines = [l.strip() for l in thumbnail_title.split("\n") if l.strip()]

            # Extract POST section
            post_match = re.search(r'POST:\s*\n(.+?)(?=\nVISUALS:)', content, re.DOTALL)
            reel_text = post_match.group(1).strip() if post_match else ""
            reel_lines = [l.strip() for l in reel_text.split("\n") if l.strip()]

            # Extract VISUALS — get AI PROMPTs (these go directly to DeAPI)
            visuals_match = re.search(r'VISUALS:\s*\n(.+)', content, re.DOTALL)
            visuals_text = visuals_match.group(1) if visuals_match else ""

            ai_prompts = re.findall(r'AI PROMPT:\s*\n?(.+)', visuals_text)
            search_queries = re.findall(r'SEARCH QUERY:\s*\n?(.+)', visuals_text)

            images = []
            for i, prompt in enumerate(ai_prompts):
                if not prompt.strip():
                    continue
                sq = search_queries[i].strip() if i < len(search_queries) and search_queries[i].strip() else None
                images.append(ImagePlan(
                    source_type="ai_generate",
                    query=prompt.strip(),
                    search_query=sq,
                ))

            if not reel_text or not images:
                logger.error(f"[StoryPolisher] Missing required fields. reel_text={bool(reel_text)}, images={len(images)}")
                return None

            # Use first image as thumbnail image
            thumbnail_image = images[0] if images else ImagePlan(source_type="ai_generate", query=reel_text[:100])

            fingerprint = _compute_fingerprint(reel_text, reel_lines)

            return PolishedStory(
                reel_text=reel_text,
                reel_lines=reel_lines,
                thumbnail_title=thumbnail_title,
                thumbnail_title_lines=thumbnail_title_lines,
                images=images,
                thumbnail_image=thumbnail_image,
                caption="",
                hashtags=[],
                story_category="insight",
                story_fingerprint=fingerprint,
            )

        except Exception as e:
            logger.error(f"[StoryPolisher] Parse error: {e}, content: {content[:300]}")
            return None
