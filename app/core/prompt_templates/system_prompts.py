"""System and content prompts — cached, sent once per session."""
from typing import Dict
from app.core.viral_patterns import PatternSelection, FORMAT_DEFINITIONS, HOOK_DEFINITIONS
from app.core.prompt_context import PromptContext


def get_content_prompts() -> Dict[str, str]:
    """Load content prompts from the app_settings table.

    Returns a dict with keys 'reels_prompt', 'posts_prompt',
    'brand_description' mapped to their stored values (or empty string).
    """
    try:
        from app.db_connection import get_db_session
        with get_db_session() as db:
            from app.models.config import AppSettings
            rows = (
                db.query(AppSettings.key, AppSettings.value)
                .filter(AppSettings.key.in_([
                    'posts_prompt', 'reels_prompt', 'brand_description',
                ]))
                .all()
            )
            return {row.key: (row.value or '') for row in rows}
    except Exception as e:
        print(f"⚠️ Could not load content prompts: {e}", flush=True)
        return {}


def build_system_prompt(ctx: PromptContext = None) -> str:
    if ctx is None:
        ctx = PromptContext()

    brief_section = ""
    if ctx.content_brief:
        brief_section = f"""

CONTENT BRIEF (follow this closely):
{ctx.content_brief}
"""

    return f"""You are a viral short-form {ctx.niche_name.lower()} content generator.
{brief_section}
TASK:
Generate original Instagram/TikTok reel ideas that match proven viral {ctx.niche_name.lower()} patterns without copying any known content.

CORE RULES:
- Use familiar {ctx.niche_name.lower()} framing ({ctx.topic_framing})
- Optimize for emotional hooks: {', '.join(ctx.hook_themes)}
- Keep language {ctx.tone_string}
- Avoid {ctx.tone_avoid_string} language
- Each content line must be under 18 words
- Total content MUST be 50-60 words across all lines. Never exceed 60 words.

CONTENT PHILOSOPHY:
- {ctx.content_philosophy}
- Use familiar topics and vocabulary
- Plausible > precise (this is social content, not textbooks)

FORMATTING:
- Titles in ALL CAPS
- One format style per reel (do not mix)
- No emojis, hashtags, or disclaimers
- No CTA (call-to-action) - it's added separately
- No numbered lists (numbers added by system)

You generate content that feels familiar, not repeated.
Output ONLY valid JSON, no markdown, no explanations."""


# Backward-compatible default
SYSTEM_PROMPT = build_system_prompt()
