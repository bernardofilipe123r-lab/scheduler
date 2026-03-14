"""
Platform-specific publisher mixins composed into SocialPublisher.

Each mixin handles one platform's publish methods:
  _instagram.py — Instagram image/carousel/reel
  _facebook.py  — Facebook image/carousel/reel + co-publish
  _threads.py   — Threads post/carousel/chain
  _tiktok.py    — TikTok video
  _bluesky.py   — Bluesky post/carousel (AT Protocol)
  _base.py      — __init__, credentials, shared utilities
"""
from app.services.publishing.publishers._base import SocialPublisherBase
from app.services.publishing.publishers._instagram import InstagramMixin
from app.services.publishing.publishers._facebook import FacebookMixin, create_facebook_caption
from app.services.publishing.publishers._threads import ThreadsMixin
from app.services.publishing.publishers._tiktok import TikTokMixin
from app.services.publishing.publishers._bluesky import BlueskyMixin


class SocialPublisher(
    InstagramMixin,
    FacebookMixin,
    ThreadsMixin,
    TikTokMixin,
    BlueskyMixin,
    SocialPublisherBase,
):
    """Service for publishing content to Instagram, Facebook, Threads, TikTok, and Bluesky."""
    pass


__all__ = ["SocialPublisher", "create_facebook_caption"]
