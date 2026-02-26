"""
Facebook Token Service — handles all server-side token operations
for the Facebook Login OAuth flow.

Encapsulates:
- Code → short-lived token exchange
- Short-lived → long-lived token exchange (60 days)
- Fetching user's managed Pages
- Getting a Page Access Token
"""
import os
import logging
import requests
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

FB_GRAPH_BASE = "https://graph.facebook.com"
API_VERSION = "v21.0"

FACEBOOK_APP_ID = os.environ.get("FACEBOOK_APP_ID", "")
FACEBOOK_APP_SECRET = os.environ.get("FACEBOOK_APP_SECRET", "")
SITE_URL = os.environ.get("SITE_URL", "https://scheduler-production-29d4.up.railway.app")
FACEBOOK_REDIRECT_URI = os.environ.get(
    "FACEBOOK_REDIRECT_URI",
    SITE_URL + "/api/auth/facebook/callback",
)


class FacebookTokenService:
    """Server-side Facebook token operations. Never exposed to the client."""

    def exchange_code_for_token(self, code: str) -> Dict[str, Any]:
        """
        Exchange an OAuth authorization code for a short-lived user token.
        """
        resp = requests.get(
            f"{FB_GRAPH_BASE}/{API_VERSION}/oauth/access_token",
            params={
                "client_id": FACEBOOK_APP_ID,
                "client_secret": FACEBOOK_APP_SECRET,
                "redirect_uri": FACEBOOK_REDIRECT_URI,
                "code": code,
            },
            timeout=15,
        )
        data = resp.json()

        if "error" in data:
            raise ValueError(
                f"Token exchange failed: {data['error'].get('message', data)}"
            )
        if "access_token" not in data:
            raise ValueError(f"No access_token in response: {data}")

        return data

    def exchange_for_long_lived_token(self, short_lived_token: str) -> Dict[str, Any]:
        """
        Exchange a short-lived token for a long-lived token (~60 days).
        """
        resp = requests.get(
            f"{FB_GRAPH_BASE}/{API_VERSION}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": FACEBOOK_APP_ID,
                "client_secret": FACEBOOK_APP_SECRET,
                "fb_exchange_token": short_lived_token,
            },
            timeout=15,
        )
        data = resp.json()

        if "error" in data:
            raise ValueError(
                f"Long-lived token exchange failed: {data['error'].get('message', data)}"
            )

        return data

    def get_user_pages(self, user_access_token: str) -> List[Dict[str, Any]]:
        """
        Fetch all Facebook Pages the user manages.

        Returns a list of pages with id, name, and access_token (page-level).
        The page access_token returned here is already a long-lived page token
        when the user token is long-lived.
        """
        pages: List[Dict[str, Any]] = []
        url = f"{FB_GRAPH_BASE}/{API_VERSION}/me/accounts"
        params: Dict[str, str] = {
            "fields": "id,name,access_token,category,fan_count,picture",
            "access_token": user_access_token,
            "limit": "100",
        }

        while url:
            resp = requests.get(url, params=params, timeout=15)
            data = resp.json()

            if "error" in data:
                raise ValueError(
                    f"Failed to fetch pages: {data['error'].get('message', data)}"
                )

            pages.extend(data.get("data", []))

            # Handle pagination
            paging = data.get("paging", {})
            url = paging.get("next")
            params = {}  # next URL already includes params

        return pages

    def get_page_info(self, page_id: str, page_access_token: str) -> Dict[str, Any]:
        """
        Fetch basic info about a Facebook Page.
        """
        resp = requests.get(
            f"{FB_GRAPH_BASE}/{API_VERSION}/{page_id}",
            params={
                "fields": "id,name,category,fan_count,picture",
                "access_token": page_access_token,
            },
            timeout=15,
        )
        data = resp.json()

        if "error" in data:
            raise ValueError(
                f"Failed to fetch page info: {data['error'].get('message', data)}"
            )

        return data
