"""
Platform Registry — single source of truth for all supported social platforms
and content types.

When adding a new platform (e.g. LinkedIn):
  1. Add its ID to SUPPORTED_PLATFORMS
  2. Add display name to PLATFORM_DISPLAY_NAMES
  3. Add credential check to PLATFORM_CREDENTIAL_CHECKS
  4. Everything else (validation, detection, filtering) updates automatically.

When adding a new content type:
  1. Add its key to SUPPORTED_CONTENT_TYPES
  2. Add display name to CONTENT_TYPE_DISPLAY_NAMES
  3. Add internal→key mapping to CONTENT_TYPE_KEY_MAP
  4. Everything else updates automatically.
"""
from __future__ import annotations

from typing import Any, Optional, Set

# ── Canonical platform identifiers ────────────────────────────────────
# Every list, set, validation, or type union in the codebase should
# reference this tuple rather than spelling out platform names.
SUPPORTED_PLATFORMS: tuple[str, ...] = (
    "instagram",
    "facebook",
    "youtube",
    "threads",
    "tiktok",
)

SUPPORTED_PLATFORMS_SET: frozenset[str] = frozenset(SUPPORTED_PLATFORMS)

PLATFORM_DISPLAY_NAMES: dict[str, str] = {
    "instagram": "Instagram",
    "facebook": "Facebook",
    "youtube": "YouTube",
    "threads": "Threads",
    "tiktok": "TikTok",
}

# Default platforms used as fallback for legacy jobs created before
# Threads/TikTok existed.  New code should NOT use this — it exists
# only for backwards-compatible deserialization of old DB rows.
LEGACY_DEFAULT_PLATFORMS: list[str] = ["instagram", "facebook", "youtube"]


# ── Content types ─────────────────────────────────────────────────────
# Keys used in the enabled_platforms dict on TobyBrandConfig.
# Internal content_type values ("reel", "post") map to these via
# CONTENT_TYPE_KEY_MAP.
SUPPORTED_CONTENT_TYPES: tuple[str, ...] = ("reels", "posts")

CONTENT_TYPE_DISPLAY_NAMES: dict[str, str] = {
    "reels": "Reels",
    "posts": "Carousels",
}

# Maps the *internal* content_type values (used by ContentPlan, variant
# logic, etc.) to the *user-facing* dict keys stored in enabled_platforms.
# "reel" → "reels", "post" → "posts"
CONTENT_TYPE_KEY_MAP: dict[str, str] = {
    "reel": "reels",
    "post": "posts",
    "text_video_reel": "reels",
}

# Platforms that cannot publish a given content type.
# TikTok's API does not support image carousel publishing.
CONTENT_TYPE_EXCLUDED_PLATFORMS: dict[str, frozenset[str]] = {
    "posts": frozenset({"tiktok"}),
}


# ── Credential checks ────────────────────────────────────────────────
# Each entry maps a platform ID → a callable(brand) → bool.
# `brand` is duck-typed: works with both the SQLAlchemy Brand model
# and the BrandConfig dataclass (they share the same attribute names).
# YouTube is special — it lives in a separate table, handled below.

def _has_instagram(brand: Any) -> bool:
    return bool(
        getattr(brand, "instagram_business_account_id", None)
        and (
            getattr(brand, "meta_access_token", None)
            or getattr(brand, "instagram_access_token", None)
        )
    )

def _has_facebook(brand: Any) -> bool:
    return bool(
        getattr(brand, "facebook_page_id", None)
        and getattr(brand, "facebook_access_token", None)
    )

def _has_threads(brand: Any) -> bool:
    return bool(
        getattr(brand, "threads_access_token", None)
        and getattr(brand, "threads_user_id", None)
    )

def _has_tiktok(brand: Any) -> bool:
    return bool(getattr(brand, "tiktok_refresh_token", None))


# Registry: platform → credential check function.
# YouTube is omitted because it requires a DB query on a separate table.
PLATFORM_CREDENTIAL_CHECKS: dict[str, Any] = {
    "instagram": _has_instagram,
    "facebook": _has_facebook,
    "threads": _has_threads,
    "tiktok": _has_tiktok,
    # "youtube" intentionally omitted — uses YouTubeChannel table
}

# Maps platform → brand attribute that stores the display handle/name.
# Used by endpoints that return connected-platform lists with handles.
PLATFORM_HANDLE_ATTRS: dict[str, str] = {
    "instagram": "instagram_handle",
    "facebook": "facebook_page_name",
    "youtube": "channel_name",      # lives on YouTubeChannel model, not Brand
    "threads": "threads_username",
    "tiktok": "tiktok_username",
}


# ── Helpers ───────────────────────────────────────────────────────────

def is_valid_platform(name: str) -> bool:
    """Return True if *name* is a recognised platform identifier."""
    return name in SUPPORTED_PLATFORMS_SET


def detect_connected_platforms(brand: Any, db: Any = None) -> Set[str]:
    """Return the set of platform IDs that have valid credentials on *brand*.

    Parameters
    ----------
    brand : Brand model instance or BrandConfig dataclass
        Must have the standard credential attributes.
    db : SQLAlchemy Session, optional
        Required to check YouTube (stored in a separate table).
        If *None*, YouTube will be skipped.
    """
    connected: set[str] = set()
    for platform_id, check_fn in PLATFORM_CREDENTIAL_CHECKS.items():
        if check_fn(brand):
            connected.add(platform_id)

    # YouTube — separate table
    if db is not None:
        try:
            from app.models.youtube import YouTubeChannel
            brand_id = getattr(brand, "id", None) or getattr(brand, "name", None)
            if brand_id:
                yt = (
                    db.query(YouTubeChannel)
                    .filter(YouTubeChannel.brand == brand_id, YouTubeChannel.status == "connected")
                    .first()
                )
                if yt:
                    connected.add("youtube")
        except Exception:
            pass  # YouTube table may not exist yet in some envs

    return connected


def get_effective_platforms(
    connected: Set[str],
    user_enabled: Optional[list[str] | set[str] | dict] = None,
) -> list[str]:
    """Intersect connected platforms with user preferences.

    Supports both legacy flat list format and the new per-content-type
    dict format (returns the union of all content-type lists in the latter
    case — use ``get_platforms_for_content_type`` when you know the type).

    Parameters
    ----------
    connected : set of platform IDs with valid credentials.
    user_enabled : explicit list/set, a per-content-type dict, or *None*
        for "all connected".

    Returns
    -------
    Sorted list of platform IDs the system should actually use.
    """
    if user_enabled is None:
        return sorted(connected)
    if isinstance(user_enabled, dict):
        # Dict format: union all content-type platform lists
        all_platforms: set[str] = set()
        for platforms in user_enabled.values():
            if isinstance(platforms, list):
                all_platforms.update(platforms)
        return sorted(connected & all_platforms) if all_platforms else sorted(connected)
    return sorted(connected & set(user_enabled))


def get_platforms_for_content_type(
    connected: Set[str],
    user_enabled: Optional[list[str] | set[str] | dict] = None,
    content_type: Optional[str] = None,
) -> list[str]:
    """Return active platforms for a specific content type.

    Parameters
    ----------
    connected : set of platform IDs with valid credentials.
    user_enabled : the ``enabled_platforms`` value from TobyBrandConfig.
        - *None* → all connected platforms.
        - flat list (legacy) → same platforms for every content type.
        - dict keyed by content-type keys (``"reels"``, ``"posts"``) →
          look up the sub-list for the given *content_type*.
    content_type : internal content-type value (``"reel"``, ``"post"``).
        Mapped to the dict key via ``CONTENT_TYPE_KEY_MAP``.
        When *None* or the key is missing from the dict, falls back to
        all connected platforms.

    Returns
    -------
    Sorted list of platform IDs to publish to.
    """
    # Determine the content-type key for exclusion lookup
    ct_key = CONTENT_TYPE_KEY_MAP.get(content_type, content_type) if content_type else None
    excluded = CONTENT_TYPE_EXCLUDED_PLATFORMS.get(ct_key, frozenset()) if ct_key else frozenset()

    if user_enabled is None:
        return sorted(connected - excluded)

    # Legacy flat list — same for every content type
    if isinstance(user_enabled, (list, set)):
        return sorted((connected & set(user_enabled)) - excluded)

    # Dict format — look up the sub-list for this content type
    if isinstance(user_enabled, dict) and content_type:
        sub_list = user_enabled.get(ct_key)
        if sub_list is not None and isinstance(sub_list, list):
            return sorted((connected & set(sub_list)) - excluded)
        # Key missing from dict → all connected platforms for this type
        return sorted(connected - excluded)

    return sorted(connected - excluded)
