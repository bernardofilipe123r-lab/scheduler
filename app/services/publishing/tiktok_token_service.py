"""
TikTok Content Posting API token service.
Access tokens expire in 24 hours.
Refresh tokens last 365 days.
Always refresh access token before publishing.
"""
import os
import logging

import httpx

logger = logging.getLogger(__name__)

TIKTOK_OAUTH_URL = "https://open.tiktokapis.com/v2/oauth/token/"
TIKTOK_API_BASE = "https://open.tiktokapis.com"


class TikTokTokenService:
    def __init__(self):
        self.client_key = os.environ.get("TIKTOK_CLIENT_KEY", "")
        self.client_secret = os.environ.get("TIKTOK_CLIENT_SECRET", "")
        site_url = os.environ.get("SITE_URL", "https://viraltoby.com")
        self.redirect_uri = os.environ.get(
            "TIKTOK_REDIRECT_URI",
            site_url + "/api/auth/tiktok/callback",
        )

    def exchange_code_for_tokens(self, code: str, code_verifier: str) -> dict:
        """
        Exchange authorization code for access_token + refresh_token.
        TikTok uses PKCE — must pass code_verifier.
        """
        resp = httpx.post(
            TIKTOK_OAUTH_URL,
            data={
                "client_key": self.client_key,
                "client_secret": self.client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": self.redirect_uri,
                "code_verifier": code_verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        # TikTok can return either:
        # 1) Wrapped payload: {"error": {"code": "ok"}, "data": {...}}
        # 2) Direct payload: {"access_token": ..., "refresh_token": ...}
        if isinstance(data, dict) and "access_token" in data:
            return data

        error_block = data.get("error", {}) if isinstance(data, dict) else {}
        if error_block.get("code") not in (None, "ok"):
            raise ValueError(f"TikTok token exchange failed: {data}")

        if isinstance(data, dict) and isinstance(data.get("data"), dict):
            return data["data"]

        raise ValueError(f"TikTok token exchange returned unexpected format: {data}")

    def refresh_access_token(self, refresh_token: str) -> dict:
        """Refresh access token using refresh token. Called before every publish."""
        resp = httpx.post(
            TIKTOK_OAUTH_URL,
            data={
                "client_key": self.client_key,
                "client_secret": self.client_secret,
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and "access_token" in data:
            return data

        error_block = data.get("error", {}) if isinstance(data, dict) else {}
        if error_block.get("code") not in (None, "ok"):
            raise ValueError(f"TikTok token refresh failed: {data}")

        if isinstance(data, dict) and isinstance(data.get("data"), dict):
            return data["data"]

        raise ValueError(f"TikTok token refresh returned unexpected format: {data}")

    def get_user_info(self, access_token: str) -> dict:
        """Get TikTok user info to store username."""
        resp = httpx.get(
            f"{TIKTOK_API_BASE}/v2/user/info/",
            params={"fields": "open_id,union_id,avatar_url,display_name,username"},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("error", {}).get("code") != "ok":
            raise ValueError(f"TikTok user info failed: {data}")
        return data["data"]["user"]
