"""
Instagram Token Service — handles all server-side token operations
for the Instagram Business Login OAuth flow.

Encapsulates:
- Code → short-lived token exchange
- Short-lived → long-lived token exchange (60 days)
- Fetching user profile info (user_id, username, etc.)
- Token refresh
"""
import os
import logging
import requests
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Instagram API uses api.instagram.com for initial token exchange,
# then graph.instagram.com for everything else.
IG_OAUTH_BASE = "https://api.instagram.com/oauth/access_token"
IG_GRAPH_BASE = "https://graph.instagram.com"

INSTAGRAM_APP_ID = os.environ.get("INSTAGRAM_APP_ID", "")
INSTAGRAM_APP_SECRET = os.environ.get("INSTAGRAM_APP_SECRET", "")
INSTAGRAM_REDIRECT_URI = os.environ.get(
    "INSTAGRAM_REDIRECT_URI",
    os.environ.get("SITE_URL", "https://viraltoby.com")
    + "/api/auth/instagram/callback",
)


class InstagramTokenService:
    """Server-side Instagram token operations. Never exposed to the client."""

    def exchange_code_for_token(self, code: str) -> Dict[str, Any]:
        """
        Exchange an OAuth authorization code for a short-lived user token.
        
        Instagram Business Login returns a short-lived token (~1 hour)
        via a POST to api.instagram.com/oauth/access_token.
        """
        resp = requests.post(
            IG_OAUTH_BASE,
            data={
                "client_id": INSTAGRAM_APP_ID,
                "client_secret": INSTAGRAM_APP_SECRET,
                "grant_type": "authorization_code",
                "redirect_uri": INSTAGRAM_REDIRECT_URI,
                "code": code,
            },
            timeout=15,
        )
        data = resp.json()

        if "error_type" in data or "error_message" in data:
            raise ValueError(
                f"Token exchange failed: {data.get('error_message', data)}"
            )
        if "access_token" not in data:
            raise ValueError(f"No access_token in response: {data}")

        # Response: {"access_token": "...", "user_id": 17841430244624033}
        return data

    def exchange_for_long_lived_token(self, short_lived_token: str) -> Dict[str, Any]:
        """
        Exchange a short-lived token for a long-lived token (~60 days).
        
        Uses graph.instagram.com/access_token with grant_type=ig_exchange_token.
        """
        resp = requests.get(
            f"{IG_GRAPH_BASE}/access_token",
            params={
                "grant_type": "ig_exchange_token",
                "client_secret": INSTAGRAM_APP_SECRET,
                "access_token": short_lived_token,
            },
            timeout=15,
        )
        data = resp.json()

        if "error" in data:
            raise ValueError(
                f"Long-lived token exchange failed: {data['error'].get('message', data)}"
            )

        # Response: {"access_token": "...", "token_type": "bearer", "expires_in": 5184000}
        return data

    def refresh_long_lived_token(self, token: str) -> Dict[str, Any]:
        """
        Refresh a valid long-lived token to get a new 60-day token.
        
        Can only be called once per day. Token must still be valid (not expired).
        """
        resp = requests.get(
            f"{IG_GRAPH_BASE}/refresh_access_token",
            params={
                "grant_type": "ig_refresh_token",
                "access_token": token,
            },
            timeout=15,
        )
        data = resp.json()

        if "error" in data:
            raise ValueError(
                f"Token refresh failed: {data['error'].get('message', data)}"
            )

        return data

    def get_user_profile(self, access_token: str) -> Dict[str, Any]:
        """
        Fetch the authenticated user's Instagram profile info.
        
        Returns user_id, username, name, profile_picture_url, etc.
        """
        resp = requests.get(
            f"{IG_GRAPH_BASE}/v21.0/me",
            params={
                "fields": "user_id,username,name,profile_picture_url,followers_count,account_type",
                "access_token": access_token,
            },
            timeout=15,
        )
        data = resp.json()

        if "error" in data:
            raise ValueError(
                f"Failed to fetch user profile: {data['error'].get('message', data)}"
            )

        return data
