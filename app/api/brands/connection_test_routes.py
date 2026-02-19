"""
Connection test endpoints for validating platform credentials.

Allows testing Meta (Instagram + Facebook) and YouTube connections
without actually publishing any content.
"""
import os
import logging
import requests
from typing import Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.models import YouTubeChannel
from app.services.brands.manager import get_brand_manager
from app.services.youtube.publisher import YouTubePublisher
from app.api.auth.middleware import get_current_user


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/brands", tags=["connection-tests"])

META_API_VERSION = "v19.0"
META_REQUIRED_SCOPES = {
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement",
}


@router.post("/{brand_id}/test-connection/meta")
async def test_meta_connection(
    brand_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Test Meta (Instagram + Facebook) connection for a brand.

    Validates:
    1. Token validity and expiry via /debug_token
    2. Instagram Business Account access
    3. Facebook Page access and page token retrieval
    4. Required scopes

    Does NOT publish anything.
    """
    manager = get_brand_manager(db)
    creds = manager.get_brand_with_credentials(brand_id, user_id=user["id"])
    if not creds:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")

    access_token = creds.get("meta_access_token") or creds.get("instagram_access_token")
    ig_account_id = creds.get("instagram_business_account_id")
    fb_page_id = creds.get("facebook_page_id")

    results: Dict[str, Any] = {
        "brand_id": brand_id,
        "token_valid": False,
        "instagram": {"valid": False},
        "facebook": {"valid": False},
        "scopes": [],
        "missing_scopes": [],
        "errors": [],
    }

    if not access_token:
        results["errors"].append("No Meta access token configured")
        return results

    # 1. Validate token via /debug_token
    try:
        resp = requests.get(
            f"https://graph.facebook.com/{META_API_VERSION}/debug_token",
            params={"input_token": access_token, "access_token": access_token},
            timeout=10,
        )
        token_data = resp.json().get("data", {})

        if not token_data.get("is_valid"):
            results["errors"].append("Token is invalid or expired")
            return results

        results["token_valid"] = True
        scopes = token_data.get("scopes", [])
        results["scopes"] = scopes
        results["expires_at"] = token_data.get("expires_at", 0)
        results["token_type"] = token_data.get("type", "unknown")

        missing = META_REQUIRED_SCOPES - set(scopes)
        results["missing_scopes"] = list(missing)
    except Exception as e:
        results["errors"].append(f"Token validation failed: {str(e)}")
        return results

    # 2. Validate Instagram Business Account
    if ig_account_id:
        try:
            resp = requests.get(
                f"https://graph.facebook.com/{META_API_VERSION}/{ig_account_id}",
                params={"fields": "id,username,name", "access_token": access_token},
                timeout=10,
            )
            ig_data = resp.json()
            if "error" in ig_data:
                results["instagram"]["error"] = ig_data["error"].get("message", "Unknown error")
                results["errors"].append(f"Instagram: {results['instagram']['error']}")
            else:
                results["instagram"] = {
                    "valid": True,
                    "account_id": ig_data.get("id"),
                    "username": ig_data.get("username"),
                    "name": ig_data.get("name"),
                }
        except Exception as e:
            results["instagram"]["error"] = str(e)
            results["errors"].append(f"Instagram validation failed: {str(e)}")
    else:
        results["instagram"]["error"] = "No Instagram Business Account ID configured"

    # 3. Validate Facebook Page
    if fb_page_id:
        try:
            resp = requests.get(
                f"https://graph.facebook.com/{META_API_VERSION}/{fb_page_id}",
                params={"fields": "id,name,access_token", "access_token": access_token},
                timeout=10,
            )
            fb_data = resp.json()
            if "error" in fb_data:
                results["facebook"]["error"] = fb_data["error"].get("message", "Unknown error")
                results["errors"].append(f"Facebook: {results['facebook']['error']}")
            else:
                results["facebook"] = {
                    "valid": True,
                    "page_id": fb_data.get("id"),
                    "page_name": fb_data.get("name"),
                    "has_page_token": bool(fb_data.get("access_token")),
                }
        except Exception as e:
            results["facebook"]["error"] = str(e)
            results["errors"].append(f"Facebook validation failed: {str(e)}")
    else:
        results["facebook"]["error"] = "No Facebook Page ID configured"

    results["success"] = (
        results["token_valid"]
        and results["instagram"].get("valid", False)
        and results["facebook"].get("valid", False)
        and len(results["missing_scopes"]) == 0
    )

    return results


@router.post("/{brand_id}/test-connection/youtube")
async def test_youtube_connection(
    brand_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Test YouTube connection for a brand.

    Validates:
    1. Refresh token can be exchanged for an access token
    2. Channel access via channels.list (1 quota unit)
    3. Required scopes

    Does NOT upload anything.
    """
    brand_id = brand_id.lower()

    results: Dict[str, Any] = {
        "brand_id": brand_id,
        "token_valid": False,
        "channel": {"valid": False},
        "scopes": [],
        "missing_scopes": [],
        "errors": [],
    }

    # Get YouTube channel from DB
    query = db.query(YouTubeChannel).filter(YouTubeChannel.brand == brand_id)
    user_id = user.get("id")
    if user_id:
        query = query.filter(YouTubeChannel.user_id == user_id)
    channel = query.first()

    if not channel:
        results["errors"].append("No YouTube channel connected")
        return results

    if not channel.refresh_token:
        results["errors"].append("No refresh token stored")
        return results

    publisher = YouTubePublisher()

    if not publisher.client_id or not publisher.client_secret:
        results["errors"].append("YouTube OAuth not configured on server")
        return results

    # 1. Test token refresh
    try:
        success, token_result = publisher.refresh_access_token(channel.refresh_token)
        if not success:
            results["errors"].append(f"Token refresh failed: {token_result.get('error', 'Unknown')}")
            return results

        results["token_valid"] = True
        access_token = token_result["access_token"]
        results["expires_in"] = token_result.get("expires_in", 0)
    except Exception as e:
        results["errors"].append(f"Token refresh error: {str(e)}")
        return results

    # 2. Test channel access via channels.list
    try:
        resp = requests.get(
            "https://www.googleapis.com/youtube/v3/channels",
            params={"part": "id,snippet,status", "mine": "true"},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )

        if resp.status_code == 403:
            results["errors"].append("Quota exceeded or insufficient permissions")
            return results
        if resp.status_code == 401:
            results["errors"].append("Access token invalid after refresh")
            return results

        data = resp.json()
        items = data.get("items", [])

        if not items:
            results["errors"].append("No channel found for this account")
            return results

        ch = items[0]
        results["channel"] = {
            "valid": True,
            "channel_id": ch["id"],
            "channel_name": ch["snippet"]["title"],
            "stored_channel_id": channel.channel_id,
            "match": ch["id"] == channel.channel_id,
        }
    except Exception as e:
        results["errors"].append(f"Channel access error: {str(e)}")
        return results

    # 3. Check scopes via tokeninfo
    try:
        resp = requests.get(
            "https://www.googleapis.com/oauth2/v1/tokeninfo",
            params={"access_token": access_token},
            timeout=10,
        )
        if resp.status_code == 200:
            scope_str = resp.json().get("scope", "")
            granted_scopes = scope_str.split() if scope_str else []
            results["scopes"] = granted_scopes

            required = {
                "https://www.googleapis.com/auth/youtube.upload",
                "https://www.googleapis.com/auth/youtube.readonly",
                "https://www.googleapis.com/auth/youtube.force-ssl",
            }
            missing = required - set(granted_scopes)
            results["missing_scopes"] = list(missing)
    except Exception:
        pass  # Scope check is optional

    results["success"] = (
        results["token_valid"]
        and results["channel"].get("valid", False)
    )

    return results
