"""
Threads API token exchange and refresh service.
Threads uses a 2-step OAuth: short-lived → long-lived (same pattern as Instagram).
The long-lived token lasts 60 days and must be refreshed before expiry.
"""
import os
import logging

import httpx

logger = logging.getLogger(__name__)

THREADS_API_BASE = "https://graph.threads.net"
API_VERSION = "v21.0"


class ThreadsTokenService:
    def __init__(self):
        # Threads has its own app ID/secret separate from Facebook/Instagram
        self.app_id = os.environ.get("THREADS_APP_ID") or os.environ.get("META_APP_ID") or os.environ.get("INSTAGRAM_APP_ID", "")
        self.app_secret = os.environ.get("THREADS_APP_SECRET") or os.environ.get("META_APP_SECRET") or os.environ.get("INSTAGRAM_APP_SECRET", "")
        site_url = os.environ.get("SITE_URL", "https://viraltoby.com")
        self.redirect_uri = os.environ.get(
            "THREADS_REDIRECT_URI",
            site_url + "/api/auth/threads/callback",
        )

    def exchange_code_for_token(self, code: str) -> dict:
        """Exchange authorization code for short-lived access token."""
        logger.info(f"Threads token exchange: app_id={self.app_id[:6]}..., redirect_uri={self.redirect_uri}")
        resp = httpx.post(
            f"{THREADS_API_BASE}/oauth/access_token",
            data={
                "client_id": self.app_id,
                "client_secret": self.app_secret,
                "grant_type": "authorization_code",
                "redirect_uri": self.redirect_uri,
                "code": code,
            },
            timeout=30,
        )
        if resp.status_code != 200:
            print(f"[THREADS] Token exchange failed: status={resp.status_code}, body={resp.text}")
            logger.error(f"Threads token exchange failed: status={resp.status_code}, body={resp.text}")
            resp.raise_for_status()
        return resp.json()  # {"access_token": "...", "user_id": "..."}

    def exchange_for_long_lived_token(self, short_token: str) -> dict:
        """Exchange short-lived token for 60-day long-lived token."""
        resp = httpx.get(
            f"{THREADS_API_BASE}/access_token",
            params={
                "grant_type": "th_exchange_token",
                "client_secret": self.app_secret,
                "access_token": short_token,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()  # {"access_token": "...", "token_type": "bearer", "expires_in": 5183944}

    def refresh_long_lived_token(self, long_token: str) -> dict:
        """Refresh a long-lived token (can be done once per day, up to 60 days before expiry)."""
        resp = httpx.get(
            f"{THREADS_API_BASE}/refresh_access_token",
            params={
                "grant_type": "th_refresh_token",
                "access_token": long_token,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()  # {"access_token": "...", "expires_in": 5183944}

    def get_user_profile(self, access_token: str) -> dict:
        """Get Threads user profile to store user_id and username."""
        resp = httpx.get(
            f"{THREADS_API_BASE}/{API_VERSION}/me",
            params={
                "fields": "id,username,name,threads_profile_picture_url,threads_biography",
                "access_token": access_token,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()  # {"id": "...", "username": "...", "name": "..."}
