"""
Platform-specific content formatters.
Each platform has unique character limits, hashtag rules, and media requirements.
"""

from dataclasses import dataclass


@dataclass
class FormattedContent:
    text: str
    hashtags: list[str]
    media_type: str  # "video" | "image" | "text"
    warnings: list[str]  # Non-fatal issues


def format_for_instagram(caption: str, hashtags: list[str]) -> FormattedContent:
    """Instagram: 2200 char limit, max 30 hashtags"""
    MAX_CHARS = 2200
    MAX_HASHTAGS = 30
    hashtags = hashtags[:MAX_HASHTAGS]
    tag_string = " ".join(f"#{h}" for h in hashtags)
    combined = f"{caption}\n\n{tag_string}"
    warnings = []
    if len(combined) > MAX_CHARS:
        warnings.append(f"Caption truncated from {len(combined)} to {MAX_CHARS} chars")
        combined = combined[:MAX_CHARS]
    return FormattedContent(combined, hashtags, "video", warnings)


def format_for_facebook(caption: str, hashtags: list[str]) -> FormattedContent:
    """Facebook: 63,206 char limit, hashtags less important"""
    MAX_CHARS = 63206
    tag_string = " ".join(f"#{h}" for h in hashtags[:10])
    combined = f"{caption}\n\n{tag_string}"
    return FormattedContent(combined[:MAX_CHARS], hashtags[:10], "video", [])


def format_for_threads(caption: str, hashtags: list[str]) -> FormattedContent:
    """
    Threads: 500 char HARD limit (including hashtags).
    Threads is text-first — keep it conversational, fewer hashtags.
    Strategy: Use caption first, fill remaining with top hashtags.
    """
    MAX_CHARS = 500
    MAX_HASHTAGS = 5

    warnings = []
    hashtags = hashtags[:MAX_HASHTAGS]
    tag_string = " ".join(f"#{h}" for h in hashtags)
    combined = f"{caption}\n\n{tag_string}"

    if len(combined) > MAX_CHARS:
        available_for_caption = MAX_CHARS - len(tag_string) - 4
        if available_for_caption < 50:
            combined = caption[:MAX_CHARS - 3] + "..."
            warnings.append("Caption truncated to fit Threads 500 char limit")
        else:
            truncated = caption[:available_for_caption - 3] + "..."
            combined = f"{truncated}\n\n{tag_string}"
            warnings.append("Caption truncated to fit Threads 500 char limit")

    return FormattedContent(combined, hashtags, "video", warnings)


def format_for_tiktok(caption: str, hashtags: list[str]) -> FormattedContent:
    """
    TikTok: 2200 char limit for caption.
    Hashtags go in caption body — TikTok algorithm reads them.
    Recommend 3-5 relevant hashtags. First few characters matter most.
    """
    MAX_CHARS = 2200
    MAX_HASHTAGS = 8

    hashtags = hashtags[:MAX_HASHTAGS]
    tag_string = " ".join(f"#{h}" for h in hashtags)
    combined = f"{caption}\n\n{tag_string}"

    warnings = []
    if len(combined) > MAX_CHARS:
        combined = combined[:MAX_CHARS - 3] + "..."
        warnings.append("Caption truncated to fit TikTok 2200 char limit")

    return FormattedContent(combined, hashtags, "video", warnings)


def format_for_youtube(caption: str, hashtags: list[str], title: str = "") -> FormattedContent:
    """YouTube: Description max 5000 chars, title max 100 chars."""
    MAX_DESC = 5000
    tag_string = " ".join(f"#{h}" for h in hashtags[:15])
    combined = f"{caption}\n\n{tag_string}"
    return FormattedContent(combined[:MAX_DESC], hashtags[:15], "video", [])
