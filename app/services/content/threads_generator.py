"""
Threads content generator — DeepSeek-powered text post and thread chain generation.

Generates text-only content for the Threads platform:
  - Single posts (≤500 chars)
  - Thread chains (multi-post connected threads, 2-12 parts)

Uses the brand's Content DNA (PromptContext) + Threads-specific fields.
"""

import os
import json
import random
import requests
from typing import Dict, List, Optional, Tuple

from app.core.prompt_context import PromptContext


# ── Thread format types ───────────────────────────────────────────────
THREAD_FORMAT_TYPES = {
    "value_list": {
        "name": "Pure Value List",
        "description": "Numbered list of actionable tips. High save rate.",
        "instruction": "Create a numbered list of actionable tips (5-8 items). Each item should be a concise, standalone insight.",
    },
    "controversial": {
        "name": "Controversial Take",
        "description": "Strong opinion on a polarizing topic. High comment rate.",
        "instruction": "Take a strong, somewhat controversial stance on the topic. Be provocative but not offensive. Make people want to agree or disagree in the comments.",
    },
    "myth_bust": {
        "name": "Myth vs Reality",
        "description": "Debunks a common belief. Educational + shareable.",
        "instruction": "Start with a widely believed myth, then debunk it with evidence or logic. Use 'Everyone says X, but actually Y' framing.",
    },
    "thread_chain": {
        "name": "Thread Chain",
        "description": "Multi-post thread. Creates narrative arc + follow incentive.",
        "instruction": "Create content that naturally splits into multiple connected posts. Build a narrative arc: hook → insights → conclusion.",
    },
    "question_hook": {
        "name": "Question Hook",
        "description": "Opens with a question, delivers insight. Drives comments.",
        "instruction": "Open with a thought-provoking question, then deliver a surprising or insightful answer. End inviting discussion.",
    },
    "hot_take": {
        "name": "Hot Take",
        "description": "Short, punchy, opinion-driven. Maximum engagement bait.",
        "instruction": "Be extremely concise and punchy. One strong opinion, boldly stated. Under 150 characters ideally. Think tweet-style.",
    },
    "story_micro": {
        "name": "Micro Story",
        "description": "Mini narrative arc (setup → tension → insight).",
        "instruction": "Tell a very short story with a clear setup, tension/conflict, and a surprising insight or lesson. Make it feel personal and relatable.",
    },
}

THREAD_FORMAT_IDS = list(THREAD_FORMAT_TYPES.keys())

# Fixed rotation order for sequential format cycling.
# After a random first pick, Toby cycles through this sequence.
THREAD_FORMAT_SEQUENCE = [
    "value_list",
    "controversial",
    "myth_bust",
    "thread_chain",
    "question_hook",
    "hot_take",
    "story_micro",
]


class ThreadsGenerator:
    """Generates text-only content for Threads platform via DeepSeek."""

    def __init__(self):
        self.api_key = os.getenv("DEEPSEEK_API_KEY")
        self.base_url = "https://api.deepseek.com/v1"

    def generate_single_post(
        self,
        ctx: PromptContext,
        format_type: Optional[str] = None,
        topic_hint: Optional[str] = None,
        brand_id: Optional[str] = None,
    ) -> Optional[Dict]:
        """
        Generate a single Threads text post (≤500 chars).

        Returns:
            {"text": str, "format_type": str} or None on failure
        """
        if not self.api_key:
            return None

        if not format_type or format_type not in THREAD_FORMAT_TYPES:
            format_type = self._pick_next_format(brand_id or "", exclude=["thread_chain"])

        fmt = THREAD_FORMAT_TYPES[format_type]

        topic = topic_hint or ""
        if not topic and ctx.topic_keywords:
            topic = random.choice(ctx.topic_keywords)

        system_prompt = self._build_system_prompt(ctx)
        user_prompt = f"""Generate ONE Threads post.

Format type: {fmt['name']}
Instructions: {fmt['instruction']}
{f'Topic focus: {topic}' if topic else ''}

RULES:
- Maximum 500 characters total
- No hashtags, no emojis
- Conversational, scroll-stopping tone
- Must feel native to Threads (not Instagram, not Twitter)
- End with something that invites replies or follows

Return ONLY a JSON object: {{"text": "your post text here", "format_type": "{format_type}"}}
No markdown, no explanations."""

        return self._call_deepseek(system_prompt, user_prompt)

    def generate_thread_chain(
        self,
        ctx: PromptContext,
        num_parts: int = 6,
        topic_hint: Optional[str] = None,
    ) -> Optional[Dict]:
        """
        Generate a multi-post thread chain.

        Returns:
            {"parts": [str, ...], "topic": str, "format_type": "thread_chain"} or None
        """
        if not self.api_key:
            return None

        num_parts = max(2, min(num_parts, 12))

        topic = topic_hint or ""
        if not topic and ctx.topic_keywords:
            topic = random.choice(ctx.topic_keywords)

        system_prompt = self._build_system_prompt(ctx)
        user_prompt = f"""Generate a Threads chain of {num_parts} connected posts.

Topic: {topic or 'Choose a compelling topic from the niche'}

RULES:
- Post 1: Strong hook that makes people want to read the whole thread
- Posts 2-{num_parts - 1}: Each delivers one clear insight, step, or piece of value
- Post {num_parts}: Summary + call to follow
- Each post MUST be ≤ 500 characters
- No hashtags, no emojis
- Conversational, scroll-stopping tone
- Must feel native to Threads

Return ONLY a JSON object: {{"parts": ["post 1 text", "post 2 text", ...], "topic": "the topic", "format_type": "thread_chain"}}
No markdown, no explanations."""

        return self._call_deepseek(system_prompt, user_prompt)

    def generate_bulk(
        self,
        ctx: PromptContext,
        count: int = 4,
        topic_hints: Optional[List[str]] = None,
        format_type: Optional[str] = None,
    ) -> List[Dict]:
        """Generate multiple single posts in one batch call.

        Args:
            format_type: When provided and valid, all posts use this format.
                         When None, a diverse mix of formats is chosen automatically.
        """
        if not self.api_key:
            return []

        count = max(1, min(count, 10))

        # Determine formats to use
        eligible = [f for f in THREAD_FORMAT_IDS if f != "thread_chain"]
        if format_type and format_type in THREAD_FORMAT_TYPES and format_type != "thread_chain":
            formats = [format_type] * count
            diverse = False
        else:
            formats = random.sample(eligible, min(count, len(eligible)))
            while len(formats) < count:
                formats.append(random.choice(eligible))
            diverse = True

        topic_list = topic_hints or []
        if not topic_list and ctx.topic_keywords:
            topic_list = random.sample(ctx.topic_keywords, min(count, len(ctx.topic_keywords)))

        system_prompt = self._build_system_prompt(ctx)

        format_specs = []
        for i in range(count):
            fmt_id = formats[i]
            fmt = THREAD_FORMAT_TYPES[fmt_id]
            topic = topic_list[i] if i < len(topic_list) else ""
            format_specs.append(
                f"Post {i + 1}: format_type={fmt_id} ({fmt['name']}), "
                f"instruction: {fmt['instruction']}"
                + (f", topic: {topic}" if topic else "")
            )

        style_note = (
            "Each post must feel different in style and topic."
            if diverse
            else f"All posts use the '{THREAD_FORMAT_TYPES[formats[0]]['name']}' format — vary topics and angles while keeping the same style."
        )

        user_prompt = f"""Generate {count} Threads posts.

{chr(10).join(format_specs)}

RULES:
- Each post ≤ 500 characters
- No hashtags, no emojis
- {style_note}
- Conversational, scroll-stopping tone

Return ONLY a JSON object: {{"posts": [{{"text": "...", "format_type": "..."}}]}}
No markdown, no explanations."""

        result = self._call_deepseek(system_prompt, user_prompt)
        if result and "posts" in result:
            return result["posts"]
        return []

    def _build_system_prompt(self, ctx: PromptContext) -> str:
        """Build system prompt using Content DNA for Threads."""
        niche = ctx.niche_name or "general"
        tone = ctx.tone_string or "conversational, authentic"
        audience = ctx.target_audience or "engaged social media users"
        philosophy = ctx.content_philosophy or "Create content that sparks genuine conversation"
        avoid = ctx.tone_avoid_string or "nothing specific"

        return f"""You are a viral Threads content creator in the {niche} niche.

AUDIENCE: {audience}
TONE: {tone}
CONTENT PHILOSOPHY: {philosophy}
AVOID: {avoid}

Threads is a text-first platform where conversation and engagement matter more than polish.
Posts should feel authentic, conversational, and scroll-stopping.
The best Threads content sparks replies and reposts — not just likes.

You generate ONLY valid JSON. No markdown, no explanations, no extra text."""

    def _pick_next_format(self, brand_id: str, exclude: list[str] | None = None) -> str:
        """Pick the next thread format in sequence for a brand.

        Looks up the last format used by this brand from scheduled_reels.
        First call for a brand picks randomly; after that it cycles through
        THREAD_FORMAT_SEQUENCE.
        """
        exclude = exclude or []
        seq = [f for f in THREAD_FORMAT_SEQUENCE if f not in exclude]
        if not seq:
            seq = [f for f in THREAD_FORMAT_SEQUENCE]  # ignore exclude if it empties the list

        last_format = self._get_last_threads_format(brand_id)

        if last_format and last_format in seq:
            idx = seq.index(last_format)
            return seq[(idx + 1) % len(seq)]

        # First time or unknown last format — random start
        return random.choice(seq)

    @staticmethod
    def _get_last_threads_format(brand_id: str) -> Optional[str]:
        """Get the format_type of the most recent threads post for a brand."""
        try:
            from app.db_connection import SessionLocal
            from app.models.scheduling import ScheduledReel
            from sqlalchemy import func
            db = SessionLocal()
            try:
                row = (
                    db.query(ScheduledReel)
                    .filter(
                        func.json_extract_path_text(ScheduledReel.extra_data, "brand") == brand_id,
                        func.json_extract_path_text(ScheduledReel.extra_data, "content_type") == "threads_post",
                    )
                    .order_by(ScheduledReel.created_at.desc())
                    .first()
                )
                if row and row.extra_data:
                    return row.extra_data.get("format_type")
            finally:
                db.close()
        except Exception as e:
            print(f"⚠️ Threads format lookup failed: {e}", flush=True)
        return None

    def _call_deepseek(self, system_prompt: str, user_prompt: str) -> Optional[Dict]:
        """Call DeepSeek API and parse JSON response."""
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.9,
                    "max_tokens": 2000,
                },
                timeout=60,
            )

            if response.status_code != 200:
                print(f"❌ Threads generator: DeepSeek API error {response.status_code}", flush=True)
                return None

            result = response.json()
            content_text = result["choices"][0]["message"]["content"].strip()

            # Track cost
            usage = result.get("usage", {})
            try:
                from app.services.monitoring.cost_tracker import record_deepseek_call
                record_deepseek_call(
                    input_tokens=usage.get("prompt_tokens", 0),
                    output_tokens=usage.get("completion_tokens", 0),
                )
            except Exception:
                pass

            return self._parse_json(content_text)

        except Exception as e:
            print(f"❌ Threads generator error: {e}", flush=True)
            return None

    def _parse_json(self, text: str) -> Optional[Dict]:
        """Parse JSON from DeepSeek response, handling markdown fences."""
        # Strip markdown code fences
        cleaned = text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            # Remove first and last lines (fences)
            lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            # Try to find JSON object in the text
            start = cleaned.find("{")
            end = cleaned.rfind("}") + 1
            if start >= 0 and end > start:
                try:
                    return json.loads(cleaned[start:end])
                except json.JSONDecodeError:
                    pass
            print(f"⚠️ Threads generator: Failed to parse JSON: {cleaned[:200]}", flush=True)
            return None
