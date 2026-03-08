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
    source_type: str  # "ai_generate" (always — all images from DeAPI now)
    query: str  # The AI PROMPT for DeAPI
    fallback_query: Optional[str] = None


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
        }


def _compute_fingerprint(text: str, lines: list[str]) -> str:
    """Compute dedup fingerprint from reel text + first few lines."""
    content = text.lower().strip() + "|" + "|".join(
        sorted(l.lower().strip() for l in lines[:3])
    )
    return hashlib.sha256(content.encode()).hexdigest()[:16]


# ── DeepSeek prompt template ───────────────────────────────────────────────
# Generates BOTH the viral post AND AI image prompts in one call.

TEXT_VIDEO_PROMPT = """Niche: {niche}

Task:
Write ONE viral-style insight post.

With ~25% probability, instead base the post on a very recent or emerging topic (e.g., a new study, strange health news, unusual trend, or relevant global development related to the niche). Do not mention that it is recent—just write the post normally.

Length:
40–70 words maximum.

Style:
• Start with a strong claim.
• Briefly explain the hidden biological mechanism behind it.
• Include one concrete fact, number, or scientific detail.
• End with a sharp insight.

Tone:
concise, analytical, authoritative.

No fluff, emojis, hashtags, or lists.
Write it like a short viral insight post on social media.

After the post, recommend 3–4 visuals that would work well with the post.

For each visual provide:
• IMAGE IDEA: what the image should show
• AI PROMPT: a prompt someone could use to generate the image with an AI image generator
• SEARCH QUERY: a phrase someone could use to find similar images on Google, stock sites, or social media

Image rules:
• Images must be cinematic 4K visuals
• Use vivid colors, dramatic lighting, and high contrast
• Prefer realistic photography style rather than illustration
• Scenes should feel visually striking and engaging for social media
• Avoid text overlays or infographic-style images

After the visuals, provide:
• THUMBNAIL TITLE: A bold, attention-grabbing title for the reel thumbnail (3-5 words, ALL CAPS, max 4 lines separated by newlines)
• CAPTION: A short engaging caption for the social media post (1-2 sentences with emojis)
• HASHTAGS: 5 relevant hashtags (without # symbol)

Output format:
POST:
<viral insight post>

VISUALS:
1.
IMAGE IDEA: <description>
AI PROMPT: <cinematic 4K vivid color prompt>
SEARCH QUERY: <search phrase>

2.
IMAGE IDEA: <description>
AI PROMPT: <cinematic 4K vivid color prompt>
SEARCH QUERY: <search phrase>

3.
IMAGE IDEA: <description>
AI PROMPT: <cinematic 4K vivid color prompt>
SEARCH QUERY: <search phrase>

THUMBNAIL TITLE:
<BOLD TITLE>

CAPTION:
<caption text>

HASHTAGS:
<tag1, tag2, tag3, tag4, tag5>"""


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
            user_prompt = TEXT_VIDEO_PROMPT.format(niche=niche)

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

            return self._parse_response(content)

        except Exception as e:
            logger.error(f"[StoryPolisher] DeepSeek error: {e}")
            return None

    def _parse_response(self, content: str) -> Optional[PolishedStory]:
        """Parse DeepSeek structured text response into PolishedStory."""
        try:
            # Extract POST section
            post_match = re.search(r'POST:\s*\n(.+?)(?=\nVISUALS:)', content, re.DOTALL)
            reel_text = post_match.group(1).strip() if post_match else ""
            reel_lines = [l.strip() for l in reel_text.split("\n") if l.strip()]

            # Extract VISUALS — get AI PROMPTs (these go directly to DeAPI)
            visuals_match = re.search(r'VISUALS:\s*\n(.+?)(?=\nTHUMBNAIL TITLE:)', content, re.DOTALL)
            visuals_text = visuals_match.group(1) if visuals_match else ""

            ai_prompts = re.findall(r'AI PROMPT:\s*(.+)', visuals_text)
            images = [
                ImagePlan(source_type="ai_generate", query=prompt.strip())
                for prompt in ai_prompts
                if prompt.strip()
            ]

            # Extract THUMBNAIL TITLE
            thumb_match = re.search(r'THUMBNAIL TITLE:\s*\n(.+?)(?=\nCAPTION:)', content, re.DOTALL)
            thumbnail_title = thumb_match.group(1).strip() if thumb_match else ""
            thumbnail_title_lines = [l.strip() for l in thumbnail_title.split("\n") if l.strip()]

            # Extract CAPTION
            caption_match = re.search(r'CAPTION:\s*\n(.+?)(?=\nHASHTAGS:)', content, re.DOTALL)
            caption = caption_match.group(1).strip() if caption_match else ""

            # Extract HASHTAGS
            hashtags_match = re.search(r'HASHTAGS:\s*\n(.+)', content, re.DOTALL)
            hashtags_text = hashtags_match.group(1).strip() if hashtags_match else ""
            hashtags = [t.strip().lstrip("#") for t in hashtags_text.split(",") if t.strip()]

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
                caption=caption,
                hashtags=hashtags,
                story_category="insight",
                story_fingerprint=fingerprint,
            )

        except Exception as e:
            logger.error(f"[StoryPolisher] Parse error: {e}, content: {content[:300]}")
            return None
