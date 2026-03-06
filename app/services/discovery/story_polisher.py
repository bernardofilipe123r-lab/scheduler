"""
Story Polisher — rewrites raw stories into viral reel format using DeepSeek.

Takes a RawStory from the discovery pipeline and produces a PolishedStory
with formatted reel text, thumbnail title, image sourcing plan, and metadata.
"""
import json
import logging
import os
from dataclasses import dataclass, field, asdict
from typing import Optional

from openai import OpenAI

from app.services.discovery.story_discoverer import RawStory, compute_story_fingerprint

logger = logging.getLogger(__name__)


@dataclass
class ImagePlan:
    source_type: str  # "web_search" | "ai_generate"
    query: str
    fallback_query: Optional[str] = None


@dataclass
class PolishedStory:
    # Reel text content
    reel_text: str
    reel_lines: list[str]

    # Thumbnail
    thumbnail_title: str
    thumbnail_title_lines: list[str]

    # Image sourcing plan
    images: list[ImagePlan]
    thumbnail_image: ImagePlan

    # Caption + metadata
    caption: str
    hashtags: list[str]
    story_category: str

    # Source attribution
    source_story: RawStory
    story_fingerprint: str

    def to_dict(self) -> dict:
        d = {
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
            "source_headline": self.source_story.headline,
            "source_url": self.source_story.source_url,
            "source_name": self.source_story.source_name,
        }
        return d


TEXT_VIDEO_SYSTEM_PROMPT = """You are a viral content writer for Instagram Reels.
You specialize in the "text-over-black + background images" format.

Your job: Take a raw news story or interesting fact and transform it into:
1. A viral reel script (3-6 punchy lines, shown over images)
2. A thumbnail title (short, ALL CAPS, designed to stop scrollers)
3. Image search queries for sourcing relevant background images
4. A caption with hashtags

Style reference: @execute, @factsdailyy, @luxurylife on Instagram.

RULES:
- Opening line MUST be a bold, attention-grabbing statement
- Use short sentences. Max 15 words per line.
- End with an insight, lesson, or thought-provoking closer
- Thumbnail title: 3-5 words per line, max 4 lines, ALL CAPS
- Image queries must be specific enough to find relevant photos
- For real people/places: use "web_search" source type
- For abstract concepts: use "ai_generate" source type"""

TEXT_VIDEO_POLISH_PROMPT = """Given this story:
HEADLINE: {headline}
SUMMARY: {summary}
SOURCE: {source_name}

Niche: {niche}

Return ONLY valid JSON:
{{
  "reel_text": "Line 1\\nLine 2\\nLine 3\\n...",
  "thumbnail_title": "BOLD\\nTHUMB\\nTITLE",
  "images": [
    {{"source_type": "web_search", "query": "...", "fallback_query": "..."}},
    {{"source_type": "web_search", "query": "...", "fallback_query": "..."}},
    {{"source_type": "ai_generate", "query": "...", "fallback_query": "..."}}
  ],
  "thumbnail_image": {{"source_type": "web_search", "query": "...", "fallback_query": "..."}},
  "caption": "Full caption text with emojis...",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "story_category": "power_moves|controversy|underdog|prediction|shocking_stat|human_moment|industry_shift|failed_bet|hidden_cost|scientific_breakthrough"
}}"""


def _get_deepseek_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


class StoryPolisher:
    """Rewrites raw stories into viral reel format using DeepSeek."""

    def __init__(self):
        self.client = _get_deepseek_client()

    def polish_story(
        self,
        raw_story: RawStory,
        niche: str,
        brand_handle: Optional[str] = None,
    ) -> Optional[PolishedStory]:
        """
        Call DeepSeek to rewrite the story and generate all metadata.

        Returns a PolishedStory or None on failure.
        """
        try:
            user_prompt = TEXT_VIDEO_POLISH_PROMPT.format(
                headline=raw_story.headline,
                summary=raw_story.summary[:500],
                source_name=raw_story.source_name,
                niche=niche,
            )

            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": TEXT_VIDEO_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.7,
                max_tokens=2000,
                top_p=0.95,
            )

            content = response.choices[0].message.content
            if not content:
                logger.error("[StoryPolisher] Empty response from DeepSeek")
                return None

            return self._parse_response(content, raw_story)

        except Exception as e:
            logger.error(f"[StoryPolisher] DeepSeek error: {e}")
            return None

    def _parse_response(self, content: str, raw_story: RawStory) -> Optional[PolishedStory]:
        """Parse DeepSeek JSON response into PolishedStory."""
        try:
            # Strip markdown code fences if present
            text = content.strip()
            if text.startswith("```"):
                lines = text.split("\n")
                # Remove first and last lines (fences)
                text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
                text = text.strip()

            data = json.loads(text)

            reel_text = data.get("reel_text", "")
            reel_lines = reel_text.split("\n") if reel_text else []

            thumbnail_title = data.get("thumbnail_title", "")
            thumbnail_title_lines = thumbnail_title.split("\n") if thumbnail_title else []

            images = [
                ImagePlan(
                    source_type=img.get("source_type", "web_search"),
                    query=img.get("query", ""),
                    fallback_query=img.get("fallback_query"),
                )
                for img in data.get("images", [])
            ]

            thumb_data = data.get("thumbnail_image", {})
            thumbnail_image = ImagePlan(
                source_type=thumb_data.get("source_type", "web_search"),
                query=thumb_data.get("query", ""),
                fallback_query=thumb_data.get("fallback_query"),
            )

            caption = data.get("caption", "")
            hashtags = data.get("hashtags", [])
            story_category = data.get("story_category", "power_moves")

            fingerprint = compute_story_fingerprint(
                raw_story.headline, reel_lines[:3]
            )

            return PolishedStory(
                reel_text=reel_text,
                reel_lines=reel_lines,
                thumbnail_title=thumbnail_title,
                thumbnail_title_lines=thumbnail_title_lines,
                images=images,
                thumbnail_image=thumbnail_image,
                caption=caption,
                hashtags=hashtags,
                story_category=story_category,
                source_story=raw_story,
                story_fingerprint=fingerprint,
            )

        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.error(f"[StoryPolisher] Parse error: {e}, content: {content[:200]}")
            return None
