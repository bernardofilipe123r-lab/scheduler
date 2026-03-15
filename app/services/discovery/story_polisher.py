"""
Story Polisher — generates viral reel content + AI image prompts via DeepSeek.

Architecture (v2 — decoupled):
  Call 1: DeepSeek generates text (title + post) only
  Call 2: DeepSeek generates image plans given the text context
  This allows independent retry of image planning without regenerating text.

Images are generated via DeAPI or sourced from Pexels depending on config.
"""
import hashlib
import logging
import os
import random
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
    search_query: Optional[str] = None  # Pexels search query
    search_color: Optional[str] = None  # Pexels color filter
    text_segment: Optional[str] = None  # Which part of the reel text this image illustrates


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
    "garden sunlight flowers",
    "city park people jogging",
    "fresh smoothie fruit counter",
    "cozy reading nook window",
    "sunrise over wheat field",
    "woman walking city streets",
    "healthy breakfast table",
    "person meditating outdoors nature",
    "herbal tea wooden table",
    "friends laughing outdoor cafe",
]


def _sanitize_search_query(query: str | None) -> str | None:
    """Clean up a DeepSeek search query to improve Pexels results."""
    if not query:
        return query

    # Remove parenthetical notes (LLM instruction leak)
    query = re.sub(r'\(.*?\)', '', query).strip()

    # If query starts with "Note:" or similar, it's an instruction — discard
    if re.match(r'^(note|hint|tip|suggestion)\s*:', query, re.IGNORECASE):
        return None

    # Replace overused patterns that return the same few photos
    for pattern in _OVERUSED_PATTERNS:
        if pattern.search(query):
            replacement = random.choice(_DIVERSE_REPLACEMENTS)
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


def _extract_fallback_queries(reel_text: str) -> list[str]:
    """Extract simple noun phrases from reel text as fallback Pexels queries.

    Used when the primary search query fails — extracts key concepts
    from the actual post text as a last resort.
    """
    # Remove common stop words and extract 2-3 word phrases
    stop_words = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "can", "shall", "must", "need", "dare",
        "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
        "into", "through", "during", "before", "after", "above", "below",
        "between", "under", "over", "again", "further", "then", "once",
        "and", "but", "or", "nor", "not", "so", "yet", "both", "either",
        "neither", "each", "every", "all", "any", "few", "more", "most",
        "other", "some", "such", "no", "only", "own", "same", "than",
        "too", "very", "just", "because", "if", "when", "while", "how",
        "what", "which", "who", "whom", "this", "that", "these", "those",
        "it", "its", "they", "them", "their", "we", "us", "our", "you",
        "your", "he", "him", "his", "she", "her", "my", "me", "i",
    }

    words = re.findall(r'[a-zA-Z]+', reel_text.lower())
    keywords = [w for w in words if w not in stop_words and len(w) > 3]

    # Take unique keywords and build 2-3 word queries
    seen = set()
    queries = []
    for i in range(0, len(keywords) - 1, 2):
        pair = f"{keywords[i]} {keywords[i+1]}"
        if pair not in seen:
            seen.add(pair)
            queries.append(pair)
        if len(queries) >= 4:
            break

    return queries


def _compute_fingerprint(text: str, lines: list[str]) -> str:
    """Compute dedup fingerprint from reel text + first few lines."""
    content = text.lower().strip() + "|" + "|".join(
        sorted(l.lower().strip() for l in lines[:3])
    )
    return hashlib.sha256(content.encode()).hexdigest()[:16]


# ── DeepSeek prompt templates ────────────────────────────────────────────

# Call 1: Text generation only (title + post)
TEXT_PROMPT = """Niche: {niche}
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

OUTPUT FORMAT

TITLE:
<thumbnail headline>

POST:
<viral insight post>"""


# Call 2: Image planning given the text (separate call, can be retried independently)
IMAGE_PROMPT = """You are planning visuals for a social media reel video.

The reel title is: {title}
The reel text is: {post_text}

Generate exactly 4 visuals that complement this text. Each image will be shown as a slide in a crossfade slideshow while the text is displayed.

IMPORTANT: Each image should illustrate a DIFFERENT aspect or moment from the text. Think of it like a storyboard — image 1 sets the scene, image 2 shows the mechanism, image 3 shows the impact, image 4 shows the takeaway.

For each visual provide:

TEXT SEGMENT
Quote the exact phrase or sentence from the post text that this image illustrates. This creates a semantic link between the image and the text.

AI PROMPT
A prompt for generating the image with an AI image generator. Must be cinematic 4K, vivid colors, dramatic lighting, high contrast, realistic photography style, no text overlays.

SEARCH QUERY
A 2–4 word stock-photo-friendly search query for Pexels.

CRITICAL SEARCH QUERY RULES:
• 2–4 simple, common words only
• Describe WIDE SCENES, environments, or people doing things
• NEVER use: closeup, close-up, macro, detail, isolated, overhead, aerial, abstract, background
• Each of the 4 queries MUST describe a COMPLETELY DIFFERENT scene type
• Mix at least 3 categories: people in daily life, nature/outdoors, food/ingredients, urban/architecture, textures/patterns
• Think "what would a stock photographer tag this wide-angle shot?"
• NEVER repeat "scientist laboratory" or similar lab/research queries — Pexels returns the same 5 photos every time

Good: "woman running park sunrise", "colorful fruit market stall", "ocean waves sandy beach", "cozy kitchen morning light"
Bad: "scientist laboratory research", "abstract science background", "microscope slide colorful"

SEARCH COLOR
Write "none" — color filters cause repeated images.

CONTENT SAFETY: No nudity, no exposed bodies, all people fully clothed. Focus on environments and objects, not human bodies.

OUTPUT FORMAT

1.
TEXT SEGMENT:
...

AI PROMPT:
...

SEARCH QUERY:
...

SEARCH COLOR:
...

2.
TEXT SEGMENT:
...

AI PROMPT:
...

SEARCH QUERY:
...

SEARCH COLOR:
...

3.
TEXT SEGMENT:
...

AI PROMPT:
...

SEARCH QUERY:
...

SEARCH COLOR:
...

4.
TEXT SEGMENT:
...

AI PROMPT:
...

SEARCH QUERY:
...

SEARCH COLOR:
..."""


def _build_content_dna_block(dna: dict) -> str:
    """Build a Content DNA prompt block from brand-specific DNA fields."""
    lines = []

    desc = dna.get("niche_description")
    if desc:
        lines.append(f"Niche description: {desc}")

    topics = dna.get("topic_categories", [])
    if topics:
        lines.append(f"Stay within these topic areas: {', '.join(topics)}")

    philosophy = dna.get("content_philosophy")
    if philosophy:
        lines.append(f"Content philosophy: {philosophy}")

    avoid = dna.get("topic_avoid", [])
    if avoid:
        lines.append(f"STRICTLY AVOID these topics: {', '.join(avoid)}")

    fb_tone = dna.get("format_b_story_tone")
    if fb_tone:
        lines.append(f"Story tone: {fb_tone}")

    fb_niches = dna.get("format_b_story_niches", [])
    if fb_niches:
        lines.append(f"Preferred story niches: {', '.join(fb_niches)}")

    if not lines:
        return ""

    return "\nCONTENT DNA (brand identity — follow these rules):\n" + "\n".join(f"• {l}" for l in lines) + "\n"


def _format_format_b_examples(examples: list[dict]) -> str:
    """Format Format B reel examples as few-shot prompt block.

    Each example should have: {"title": "...", "post": "..."}
    We select a random subset (max 5) to keep prompts short and varied.
    """
    if not examples:
        return ""

    import random
    # Random subset of max 5 examples — different each generation for variety
    subset = random.sample(examples, min(5, len(examples)))

    parts = []
    for i, ex in enumerate(subset, 1):
        title = ex.get("title", "")
        post = ex.get("post", "")
        if title and post:
            parts.append(f"EXAMPLE {i}:\nTITLE:\n{title}\n\nPOST:\n{post}")

    if not parts:
        return ""

    return (
        "\n--- FEW-SHOT EXAMPLES (study the style, tone, and variety — then generate something COMPLETELY DIFFERENT) ---\n\n"
        + "\n\n---\n\n".join(parts)
        + "\n\n--- END EXAMPLES — Now generate NEW, ORIGINAL content on a DIFFERENT topic. ---\n"
    )


def _get_deepseek_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )


class StoryPolisher:
    """Generates viral reel content + AI image prompts via DeepSeek.

    v2 Architecture: Two decoupled DeepSeek calls.
      Call 1: Generate text (title + post) — fast, deterministic
      Call 2: Generate image plans given the text — can be retried independently
    """

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
        Generate a complete viral reel (text + image prompts).

        Two-phase generation:
          Phase 1: Generate text (title + post) via DeepSeek
          Phase 2: Generate image plans given the text (separate call)

        If image planning fails, retries up to 2 times without regenerating text.
        """
        try:
            content_dna = content_dna or {}

            # ── Phase 1: Generate text ──────────────────────────
            text_result = self._generate_text(
                niche=niche,
                topic_hint=topic_hint,
                hook_hint=hook_hint,
                personality_prompt=personality_prompt,
                story_category=story_category,
                recent_titles=recent_titles,
                content_dna=content_dna,
            )
            if not text_result:
                return None

            title, post_text, text_prompt_used = text_result

            # ── Phase 2: Generate image plans (with retry) ──────
            images = None
            for attempt in range(3):
                images = self._generate_image_plans(title, post_text)
                if images and len(images) >= 2:
                    break
                logger.warning(f"[StoryPolisher] Image planning attempt {attempt + 1} failed, retrying...")

            if not images:
                logger.error("[StoryPolisher] All image planning attempts failed")
                return None

            # Build the PolishedStory
            reel_lines = [l.strip() for l in post_text.split("\n") if l.strip()]
            thumbnail_title_lines = [l.strip() for l in title.split("\n") if l.strip()]
            thumbnail_image = images[0]
            fingerprint = _compute_fingerprint(post_text, reel_lines)

            return PolishedStory(
                reel_text=post_text,
                reel_lines=reel_lines,
                thumbnail_title=title,
                thumbnail_title_lines=thumbnail_title_lines,
                images=images,
                thumbnail_image=thumbnail_image,
                caption="",
                hashtags=[],
                story_category="insight",
                story_fingerprint=fingerprint,
                deepseek_prompt=text_prompt_used,
                deepseek_response=post_text,
            )

        except Exception as e:
            logger.error(f"[StoryPolisher] Error: {e}")
            return None

    def _generate_text(
        self, niche: str, topic_hint: str, hook_hint: str,
        personality_prompt: str, story_category: str,
        recent_titles: list[str], content_dna: dict,
    ) -> Optional[tuple[str, str, str]]:
        """Phase 1: Generate title + post text via DeepSeek.

        Returns (title, post_text, prompt_used) or None.
        """
        try:
            # Build diversity block
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

            content_dna_block = _build_content_dna_block(content_dna)
            tone_list = content_dna.get("content_tone", [])
            tone_directive = ", ".join(tone_list) if tone_list else "concise, analytical, authoritative"

            # Few-shot examples from Content DNA (teaches style + variety)
            examples_block = _format_format_b_examples(
                content_dna.get("format_b_reel_examples", [])
            )

            prompt = TEXT_PROMPT.format(
                niche=niche,
                diversity_block=diversity_block,
                content_dna_block=content_dna_block,
                tone_directive=tone_directive,
            )

            # Prepend examples before the main prompt (like Format A does)
            if examples_block:
                prompt = examples_block + "\n" + prompt

            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": "You are a viral content creator. Follow the output format exactly."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.8,
                max_tokens=800,
                top_p=0.95,
            )

            content = response.choices[0].message.content
            if not content:
                logger.error("[StoryPolisher] Empty text response from DeepSeek")
                return None

            # Parse title and post
            title_match = re.search(r'TITLE:\s*\n(.+?)(?=\nPOST:)', content, re.DOTALL)
            post_match = re.search(r'POST:\s*\n(.+)', content, re.DOTALL)

            title = title_match.group(1).strip() if title_match else ""
            post_text = post_match.group(1).strip() if post_match else ""

            if not title or not post_text:
                logger.error(f"[StoryPolisher] Failed to parse text response: title={bool(title)}, post={bool(post_text)}")
                return None

            logger.info(f"[StoryPolisher] Phase 1 OK: title={title[:50]!r}")
            return title, post_text, prompt

        except Exception as e:
            logger.error(f"[StoryPolisher] Text generation error: {e}")
            return None

    def _generate_image_plans(self, title: str, post_text: str) -> Optional[list[ImagePlan]]:
        """Phase 2: Generate image plans given the text context.

        This is a separate DeepSeek call that can be retried independently.
        Returns list of ImagePlan or None.
        """
        try:
            prompt = IMAGE_PROMPT.format(title=title, post_text=post_text)

            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": "You are a visual planner for social media reels. Follow the output format exactly."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                max_tokens=1200,
                top_p=0.95,
            )

            content = response.choices[0].message.content
            if not content:
                logger.error("[StoryPolisher] Empty image planning response")
                return None

            # Parse image plans
            ai_prompts = re.findall(r'AI PROMPT:\s*\n?(.+)', content)
            search_queries = re.findall(r'SEARCH QUERY:\s*\n?(.+)', content)
            search_colors = re.findall(r'SEARCH COLOR:\s*\n?(.+)', content)
            text_segments = re.findall(r'TEXT SEGMENT:\s*\n?(.+)', content)

            # Extract fallback queries from the post text
            fallback_queries = _extract_fallback_queries(post_text)

            images = []
            for i, prompt_text in enumerate(ai_prompts):
                if not prompt_text.strip():
                    continue
                sq = search_queries[i].strip() if i < len(search_queries) and search_queries[i].strip() else None
                sc_raw = search_colors[i].strip().lower() if i < len(search_colors) and search_colors[i].strip() else None
                sc = sc_raw if sc_raw and sc_raw != "none" else None
                ts = text_segments[i].strip() if i < len(text_segments) and text_segments[i].strip() else None

                # Sanitize search query
                sq = _sanitize_search_query(sq)

                # Assign a fallback query from text extraction
                fq = fallback_queries[i] if i < len(fallback_queries) else None

                images.append(ImagePlan(
                    source_type="ai_generate",
                    query=prompt_text.strip(),
                    search_query=sq,
                    search_color=sc,
                    fallback_query=fq,
                    text_segment=ts,
                ))

            if len(images) < 2:
                logger.error(f"[StoryPolisher] Only {len(images)} images parsed from response")
                return None

            logger.info(f"[StoryPolisher] Phase 2 OK: {len(images)} image plans")
            return images

        except Exception as e:
            logger.error(f"[StoryPolisher] Image planning error: {e}")
            return None
