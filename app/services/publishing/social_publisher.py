"""
Social media publisher — backward-compatible re-export.

Implementation split into platform-specific mixins under publishers/:
  publishers/_base.py      — credentials, __init__
  publishers/_instagram.py — Instagram image/carousel/reel
  publishers/_facebook.py  — Facebook image/carousel/reel + co-publish
  publishers/_threads.py   — Threads post/carousel/chain
  publishers/_tiktok.py    — TikTok video
  publishers/_bluesky.py   — Bluesky post/carousel (AT Protocol)
"""
from app.services.publishing.publishers import SocialPublisher, create_facebook_caption

__all__ = ["SocialPublisher", "create_facebook_caption"]

