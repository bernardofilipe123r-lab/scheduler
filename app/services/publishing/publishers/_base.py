"""SocialPublisher base — credentials, __init__, and shared utilities."""
from typing import Optional, Dict, Any
from app.core.config import BrandConfig


class SocialPublisherBase:
    """Base class for SocialPublisher — handles credential initialization."""

    def __init__(self, brand_config: Optional[BrandConfig] = None):
        """
        Initialize the social publisher with platform credentials.

        Args:
            brand_config: Optional brand configuration with specific credentials.
                         If not provided, uses default environment variables.
        """
        if brand_config:
            self.ig_business_account_id = brand_config.instagram_business_account_id
            self.fb_page_id = brand_config.facebook_page_id
            self.ig_access_token = brand_config.meta_access_token
            self._system_user_token = brand_config.facebook_access_token or brand_config.meta_access_token
            # Threads
            self.threads_access_token = brand_config.threads_access_token
            self.threads_user_id = brand_config.threads_user_id
            # TikTok
            self.tiktok_access_token = brand_config.tiktok_access_token
            self.tiktok_refresh_token = brand_config.tiktok_refresh_token
            self.tiktok_open_id = brand_config.tiktok_open_id
            # Bluesky
            self.bsky_handle = brand_config.bsky_handle
            self.bsky_did = brand_config.bsky_did
            self.bsky_app_password = brand_config.bsky_app_password
            self.bsky_access_jwt = brand_config.bsky_access_jwt
            self.bsky_refresh_jwt = brand_config.bsky_refresh_jwt
        else:
            self._system_user_token = None
            self.ig_access_token = None
            self.ig_business_account_id = None
            self.fb_page_id = None
            self.threads_access_token = None
            self.threads_user_id = None
            self.tiktok_access_token = None
            self.tiktok_refresh_token = None
            self.tiktok_open_id = None
            self.bsky_handle = None
            self.bsky_did = None
            self.bsky_app_password = None
            self.bsky_access_jwt = None
            self.bsky_refresh_jwt = None

        self.api_version = "v21.0"
        self.ig_graph_base = "https://graph.instagram.com"
        self.fb_graph_base = "https://graph.facebook.com"
        self._page_access_token_cache = {}

        # Pre-cache dedicated Facebook page token if available
        if brand_config and brand_config.facebook_access_token and brand_config.facebook_page_id:
            self._page_access_token_cache[brand_config.facebook_page_id] = brand_config.facebook_access_token

        self.brand_name = brand_config.name if brand_config else "default"

        print(f"🏷️ SocialPublisher initialized for: {self.brand_name}")
        print(f"   📸 Instagram Account ID: {self.ig_business_account_id}")
        print(f"   📘 Facebook Page ID: {self.fb_page_id}")
        print(f"   🔑 Token present: {bool(self.ig_access_token)}")

        if not self.ig_access_token:
            print("   ⚠️  Warning: Meta access token not found")
        if not self.ig_business_account_id:
            print("   ⚠️  Warning: Instagram Business Account ID not found")
        if not self.fb_page_id:
            print("   ⚠️  Warning: Facebook Page ID not found")

    def get_credential_info(self) -> Dict[str, Any]:
        """Get info about credentials being used for debugging."""
        return {
            "brand": self.brand_name,
            "instagram_account_id": self.ig_business_account_id,
            "facebook_page_id": self.fb_page_id,
            "has_token": bool(self.ig_access_token)
        }
