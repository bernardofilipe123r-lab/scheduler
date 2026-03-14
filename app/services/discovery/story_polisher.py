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
    search_color: Optional[str] = None  # Pexels color filter (from DeepSeek SEARCH COLOR)


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


# Words that produce bad stock photo results — strip from search queries
_BAD_QUERY_WORDS = {
    "closeup", "close-up", "close", "macro", "detail", "detailed",
    "isolated", "overhead", "aerial", "extreme",
    "abstract", "background", "concept", "hologram",
}

# Overused query patterns that return the same few photos on Pexels.
# If a query matches any of these, we replace it with a random alternative.
_OVERUSED_PATTERNS = [
    re.compile(r'scientist.*lab', re.IGNORECASE),
    re.compile(r'lab.*scientist', re.IGNORECASE),
    re.compile(r'research.*lab', re.IGNORECASE),
    re.compile(r'doctor.*office', re.IGNORECASE),
    re.compile(r'medical.*research', re.IGNORECASE),
]

# Replacement queries when overused patterns are detected
_DIVERSE_REPLACEMENTS = [
    "woman stretching morning yoga",
    "colorful farmers market stall",
    "person hiking mountain trail",
    "family cooking kitchen together",
    "ocean waves beach sunrise",
    "garden sunlight flowers close",
    "city park people jogging",
    "fresh smoothie fruit counter",
    "cozy reading nook window",
    "sunrise over wheat field",
    "woman walking city streets",
    "healthy breakfast table overhead",
    "person meditating outdoors nature",
    "herbal tea wooden table",
    "friends laughing outdoor cafe",
]


def _sanitize_search_query(query: str | None) -> str | None:
    """Clean up a DeepSeek search query to improve Pexels results.

    - Strips words that cause bad results (closeup, macro, etc.)
    - Removes parenthetical notes/instructions that the LLM sometimes leaks
    - Replaces overused patterns (scientist laboratory) with diverse alternatives
    - Caps length at 5 words
    """
    if not query:
        return query

    # Remove parenthetical notes (LLM instruction leak)
    query = re.sub(r'\(.*?\)', '', query).strip()

    # If query starts with "Note:" or similar, it's an instruction — discard
    if re.match(r'^(note|hint|tip|suggestion)\s*:', query, re.IGNORECASE):
        return None

    # Replace overused patterns that return the same few photos
    import random as _rand
    for pattern in _OVERUSED_PATTERNS:
        if pattern.search(query):
            replacement = _rand.choice(_DIVERSE_REPLACEMENTS)
            logger.info(f"[StoryPolisher] Replacing overused query {query!r} → {replacement!r}")
            query = replacement
            break

    # Strip bad words
    words = query.split()
    words = [w for w in words if w.lower().rstrip('.,;:') not in _BAD_QUERY_WORDS]

    # Cap at 5 words
    words = words[:5]

    cleaned = " ".join(words).strip()
    return cleaned if cleaned else None


def _compute_fingerprint(text: str, lines: list[str]) -> str:
    """Compute dedup fingerprint from reel text + first few lines."""
    content = text.lower().strip() + "|" + "|".join(
        sorted(l.lower().strip() for l in lines[:3])
    )
    return hashlib.sha256(content.encode()).hexdigest()[:16]


# ── DeepSeek prompt template ───────────────────────────────────────────────
# Generates BOTH the viral post AND AI image prompts in one call.

FORMAT_B_PROMPT = """Niche: {niche}
{diversity_block}{content_dna_block}
Task:
Write ONE viral-style insight post.

With ~25% probability, instead base the post on a very recent or emerging topic (e.g., a new study, strange health news, unusual trend, or relevant global development related to the niche). Do not mention that it is recent—just write the post normally.

FACTUAL ACCURACY (MANDATORY)

Every claim in the post MUST be based on real, verifiable information:
• Reference real studies, organizations, universities, or public data when possible
• Numbers and statistics must be plausible and grounded in reality — do NOT invent statistics
• If citing a study, mention who conducted it (e.g., "Harvard researchers found..." or "A 2024 BMJ study showed...")
• The post should be something a curious person could fact-check and find supporting evidence for
• General knowledge claims (e.g., "Vitamin C supports immune function") are fine without specific citations
• Do NOT fabricate sensational stories, conspiracy theories, or unverifiable claims

THUMBNAIL TITLE

Write a short, punchy headline suitable for a social media thumbnail like news pages use.
The title MUST be relevant to the niche above.

Rules:
• 4–10 words
• Bold statement, surprising claim, or dramatic fact
• Written in ALL CAPS
• Designed to stop the scroll and attract attention
• Must relate to the niche provided
• NEVER start with "BREAKING:", "JUST IN:", "ALERT:", "URGENT:", "SHOCKING:", or similar news prefixes — just state the fact directly

These examples show the STYLE and FORMAT only — your title must match the niche above:
"YOUR BODY REPLACES ITSELF EVERY 7 YEARS"
"VITAMIN D DEFICIENCY AFFECTS 1 BILLION PEOPLE"
"WALKING 30 MINUTES DAILY CUTS HEART DISEASE BY 35%"
"JAPAN RECORDS LOWEST BIRTHS SINCE 1899"
"YOUR GUT BACTERIA CONTROL YOUR MOOD"
"COLD SHOWERS BOOST IMMUNE CELLS BY 300%"
"PROCESSED FOOD NOW MAKES UP 60% OF AMERICAN DIETS"
"BY 2030, A FIT BODY WILL BE RARE LUXURY"
"SLEEP DEPRIVATION AGES YOUR BRAIN 3–5 YEARS"
"MAGNESIUM DEFICIENCY IS BEHIND MOST MUSCLE CRAMPS"

POST

Write ONE viral-style insight post explaining the story or phenomenon.

Length:
40–70 words maximum.

Style:
• Start with a strong claim
• Briefly explain the hidden mechanism, system, or reason behind it
• Include one concrete number, statistic, or fact when possible (from a real source)
• End with a sharp insight

Tone:
{tone_directive}

No emojis, hashtags, fluff, or lists.

VISUALS

Recommend 3–4 visuals that would work well with the post.

For each visual provide:

IMAGE IDEA
Describe what the image should show.

AI PROMPT
A prompt for generating the image with an AI image generator.

SEARCH QUERY
A short 2–4 word stock-photo-friendly search query to find a real photo on Pexels.

CRITICAL RULES for search queries:
• Keep it SHORT: 2–4 simple, common words
• Describe WIDE SCENES, environments, or people doing things — NEVER close-ups of objects
• NEVER use the words: closeup, close-up, macro, detail, isolated, overhead, aerial
• Use the simplest, most common words a photographer would tag
• Think "what scene would a stock photographer shoot with a wide lens?"
• Queries must describe scenes that THOUSANDS of stock photos exist for — not niche/specific scenarios
• Each of the 4 queries MUST describe a COMPLETELY DIFFERENT scene type — different subject, different setting, different visual mood
• The query is ONLY the search terms — never include notes, instructions, or parenthetical comments
• Avoid disturbing imagery (dead animals, injuries, destruction)

DIVERSITY RULE (MANDATORY):
• NEVER use "scientist laboratory" or any lab/research query more than ONCE across all 4 visuals
• NEVER repeat the same scene category (e.g., don't use "woman gym" AND "woman exercise" — those return the same photos)
• Mix at least 3 DIFFERENT visual categories from this list:
  - People in daily life (cooking, walking, working, exercising, eating)
  - Nature & outdoors (forest, ocean, mountains, sunset, garden)
  - Food & ingredients (fruits, vegetables, meals, kitchen, market)
  - Urban & architecture (city streets, buildings, cafes, homes)
  - Abstract & textures (water droplets, light patterns, colors, textures)
• Stock photo sites return the SAME FEW IMAGES for generic queries like "scientist laboratory" — use specific, varied scenes instead

Good examples: "woman running park sunrise", "colorful fruit market stall", "ocean waves aerial view", "cozy kitchen morning light", "yoga class group stretching", "fresh vegetables wooden table", "city rooftop sunset view"
Bad examples: "scientist laboratory research" (overused, returns same 5 photos), "abstract science background" (too vague), "microscope slide colorful" (too niche), "healthy food table" (too generic)

SEARCH COLOR
Write "none" for all queries. Color filters severely limit Pexels results and cause repeated images. Only use a color if the image concept ABSOLUTELY requires it (e.g., a story specifically about a red dress).

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

CONTENT SAFETY (MANDATORY)

• NEVER depict nudity, nude silhouettes, exposed bodies, or sexualized content
• All people in images MUST be fully clothed (professional attire, casual wear, lab coats, etc.)
• No see-through clothing, body-revealing poses, or suggestive compositions
• No bare torsos, exposed skin beyond face/hands/arms
• When describing body-related topics, focus on objects, technology, documents, or environments — NOT on the human body itself
• Violating these rules will result in account bans on social media platforms

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

SEARCH COLOR:
...

2.
IMAGE IDEA:
...

AI PROMPT:
...

SEARCH QUERY:
...

SEARCH COLOR:
...

3.
IMAGE IDEA:
...

AI PROMPT:
...

SEARCH QUERY:
...

SEARCH COLOR:
...

4.
IMAGE IDEA:
...

AI PROMPT:
...

SEARCH QUERY:
...

SEARCH COLOR:
..."""


def _build_content_dna_block(dna: dict) -> str:
    """Build a Content DNA prompt block from brand-specific DNA fields.

    Injects topic guardrails, tone, philosophy, and topic avoidance into the prompt.
    Returns empty string if no DNA fields are set.
    """
    lines = []

    # Niche description for richer context
    desc = dna.get("niche_description")
    if desc:
        lines.append(f"Niche description: {desc}")

    # Topic categories to stay on-brand
    topics = dna.get("topic_categories", [])
    if topics:
        lines.append(f"Stay within these topic areas: {', '.join(topics)}")

    # Content philosophy
    philosophy = dna.get("content_philosophy")
    if philosophy:
        lines.append(f"Content philosophy: {philosophy}")

    # Topics to AVOID — critical guardrail
    avoid = dna.get("topic_avoid", [])
    if avoid:
        lines.append(f"STRICTLY AVOID these topics: {', '.join(avoid)}")

    # Format B specific tone
    fb_tone = dna.get("format_b_story_tone")
    if fb_tone:
        lines.append(f"Story tone: {fb_tone}")

    # Format B specific niches
    fb_niches = dna.get("format_b_story_niches", [])
    if fb_niches:
        lines.append(f"Preferred story niches: {', '.join(fb_niches)}")

    if not lines:
        return ""

    return "\nCONTENT DNA (brand identity — follow these rules):\n" + "\n".join(f"• {l}" for l in lines) + "\n"


def _get_deepseek_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


class StoryPolisher:
    """Generates viral reel content + AI image prompts via DeepSeek."""

    def __init__(self):
        self.client = _get_deepseek_client()

    def generate_content(
        self,
        niche: str,
        topic_hint: str = "",
        hook_hint: str = "",
        personality_prompt: str = "",
        story_category: str = "",
        recent_titles: list[str] = None,
        content_dna: dict = None,
    ) -> Optional[PolishedStory]:
        """
        Generate a complete viral reel (text + image prompts) from scratch.

        DeepSeek generates everything — no external story source needed.
        The AI PROMPTs in the response are used directly by DeAPI for image generation.

        Diversity parameters guide DeepSeek to produce varied content:
          - topic_hint: Topic bucket (e.g., "Nutrition & Food Benefits")
          - hook_hint: Hook style (e.g., "statistic_lead", "controversy_opener")
          - personality_prompt: Tone modifier (e.g., "You report just-happened stories with urgency.")
          - story_category: Category (e.g., "scientific_breakthrough", "hidden_cost")
          - recent_titles: Titles to avoid (prevents repetitive content)
          - content_dna: Dict with Content DNA fields (topic_avoid, content_tone, etc.)

        Returns a PolishedStory or None on failure.
        """
        try:
            content_dna = content_dna or {}

            # Build diversity block for the prompt
            diversity_lines = []
            if topic_hint and topic_hint != "general":
                diversity_lines.append(f"Topic focus: {topic_hint}")
            if story_category:
                diversity_lines.append(f"Story angle: {story_category.replace('_', ' ')}")
            if hook_hint:
                diversity_lines.append(f"Hook style: {hook_hint.replace('_', ' ')}")
            if personality_prompt:
                diversity_lines.append(f"Tone: {personality_prompt}")
            if recent_titles:
                avoid_list = "\n".join(f"- {t}" for t in recent_titles[:8])
                diversity_lines.append(f"IMPORTANT: Do NOT repeat or closely paraphrase any of these recent titles:\n{avoid_list}")

            diversity_block = "\n".join(diversity_lines)
            if diversity_block:
                diversity_block = "\n" + diversity_block + "\n"

            # Build Content DNA block — injects brand-specific guardrails
            content_dna_block = _build_content_dna_block(content_dna)

            # Build tone directive from Content DNA or fallback
            tone_list = content_dna.get("content_tone", [])
            tone_directive = ", ".join(tone_list) if tone_list else "concise, analytical, authoritative"

            user_prompt = FORMAT_B_PROMPT.format(
                niche=niche,
                diversity_block=diversity_block,
                content_dna_block=content_dna_block,
                tone_directive=tone_directive,
            )

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
            search_colors = re.findall(r'SEARCH COLOR:\s*\n?(.+)', visuals_text)

            images = []
            for i, prompt in enumerate(ai_prompts):
                if not prompt.strip():
                    continue
                sq = search_queries[i].strip() if i < len(search_queries) and search_queries[i].strip() else None
                sc_raw = search_colors[i].strip().lower() if i < len(search_colors) and search_colors[i].strip() else None
                sc = sc_raw if sc_raw and sc_raw != "none" else None
                # Sanitize search query
                sq = _sanitize_search_query(sq)
                images.append(ImagePlan(
                    source_type="ai_generate",
                    query=prompt.strip(),
                    search_query=sq,
                    search_color=sc,
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
