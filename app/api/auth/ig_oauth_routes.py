"""
Instagram Business Login OAuth 2.0 Routes.

Handles the brand-level OAuth flow:
  GET  /api/auth/instagram/connect?brand_id=...  → redirect to Instagram Login
  GET  /api/auth/instagram/callback               → handle the OAuth return
  POST /api/auth/instagram/disconnect              → revoke and clear credentials
  GET  /api/auth/instagram/status?brand_id=...     → check connection status
"""
import os
import secrets
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.models.brands import Brand
from app.api.auth.middleware import get_current_user
from app.services.publishing.ig_token_service import InstagramTokenService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth/instagram", tags=["instagram-oauth"])

INSTAGRAM_APP_ID = os.environ.get("INSTAGRAM_APP_ID", "")
SITE_URL = os.environ.get("SITE_URL", "https://scheduler-production-29d4.up.railway.app")
INSTAGRAM_REDIRECT_URI = os.environ.get(
    "INSTAGRAM_REDIRECT_URI",
    SITE_URL + "/api/auth/instagram/callback",
)

# These are the scopes from the Meta dashboard embed URL
REQUIRED_SCOPES = ",".join([
    "instagram_business_basic",
    "instagram_business_content_publish",
    "instagram_business_manage_insights",
    "instagram_business_manage_messages",
    "instagram_business_manage_comments",
])

# In-memory state store (maps state_token → {brand_id, user_id, created_at})
# In production with multiple instances, use Redis or DB instead.
_oauth_states: dict = {}


# ---------------------------------------------------------------------------
# Step 1: Initiate OAuth — redirect user to Instagram Login
# ---------------------------------------------------------------------------

@router.get("/connect")
def instagram_connect(
    brand_id: str = Query(..., description="Brand to connect"),
    return_to: str = Query(None, description="Where to redirect after OAuth (e.g. 'onboarding')"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Start the Instagram Business Login OAuth flow.
    Redirects the user to Instagram's authorization screen.
    """
    if not INSTAGRAM_APP_ID or not INSTAGRAM_REDIRECT_URI:
        raise HTTPException(status_code=503, detail="Instagram OAuth not configured")

    # Verify brand belongs to user
    brand = db.query(Brand).filter(
        Brand.id == brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Generate CSRF state token
    state_token = secrets.token_urlsafe(32)
    _oauth_states[state_token] = {
        "brand_id": brand_id,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc),
        "return_to": return_to,
    }

    # Clean up old states (older than 10 minutes)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    expired = [k for k, v in _oauth_states.items() if v["created_at"] < cutoff]
    for k in expired:
        _oauth_states.pop(k, None)

    # Build Instagram authorization URL
    params = {
        "client_id": INSTAGRAM_APP_ID,
        "redirect_uri": INSTAGRAM_REDIRECT_URI,
        "response_type": "code",
        "scope": REQUIRED_SCOPES,
        "state": state_token,
        "auth_type": "reauthenticate",
    }
    auth_url = f"https://www.instagram.com/oauth/authorize?{urlencode(params)}"

    logger.info(f"Instagram OAuth redirect_uri: {INSTAGRAM_REDIRECT_URI}")
    return {"auth_url": auth_url, "brand_id": brand_id}


# ---------------------------------------------------------------------------
# Step 2: OAuth Callback — exchange code, store credentials
# ---------------------------------------------------------------------------

@router.get("/callback")
def instagram_callback(
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    error_reason: str = Query(None),
    error_description: str = Query(None),
    db: Session = Depends(get_db),
):
    """
    Handle the OAuth redirect from Instagram.
    
    This is called by Instagram's servers after the user authorizes.
    No auth header required — security is via the state parameter.
    """
    frontend_base = SITE_URL

    # User denied or error
    if error:
        logger.warning(f"Instagram OAuth denied: {error} — {error_description}")
        return RedirectResponse(url=f"{frontend_base}/brands?tab=connections&ig_error=denied")

    if not code or not state:
        return RedirectResponse(url=f"{frontend_base}/brands?tab=connections&ig_error=invalid")

    # Validate state token
    state_data = _oauth_states.pop(state, None)
    if not state_data:
        logger.warning("Instagram OAuth callback: invalid or expired state token")
        return RedirectResponse(url=f"{frontend_base}/brands?tab=connections&ig_error=expired")

    brand_id = state_data["brand_id"]
    user_id = state_data["user_id"]
    return_to = state_data.get("return_to")

    try:
        token_service = InstagramTokenService()

        # 1. Exchange code for short-lived token
        short_lived = token_service.exchange_code_for_token(code)
        short_token = short_lived["access_token"]
        ig_user_id = str(short_lived.get("user_id", ""))

        # 2. Exchange for long-lived token (60 days)
        long_lived = token_service.exchange_for_long_lived_token(short_token)
        long_token = long_lived["access_token"]
        expires_in = long_lived.get("expires_in", 5184000)  # default 60 days

        # 3. Fetch user profile
        profile = token_service.get_user_profile(long_token)
        username = profile.get("username", "")
        ig_user_id = str(profile.get("user_id", ig_user_id))

        # 4. Store credentials in Brand record
        brand = db.query(Brand).filter(
            Brand.id == brand_id,
            Brand.user_id == user_id,
        ).first()
        if not brand:
            return RedirectResponse(url=f"{frontend_base}/brands?tab=connections&ig_error=brand_not_found")

        brand.instagram_access_token = long_token
        brand.instagram_business_account_id = ig_user_id
        brand.instagram_handle = f"@{username}" if username and not username.startswith("@") else username
        # Also store as meta_access_token for compatibility with existing publisher code
        brand.meta_access_token = long_token

        db.commit()

        logger.info(
            f"Instagram OAuth complete for brand={brand_id}, "
            f"ig_user={ig_user_id}, username=@{username}"
        )

        # Redirect back to onboarding or brands page depending on flow
        if return_to == "onboarding":
            redirect_url = f"{frontend_base}/onboarding?ig_connected={brand_id}"
        else:
            redirect_url = f"{frontend_base}/brands?tab=connections&ig_connected={brand_id}"

        return RedirectResponse(url=redirect_url)

    except Exception as e:
        logger.exception(f"Instagram OAuth callback failed for brand {brand_id}: {e}")
        if return_to == "onboarding":
            redirect_url = f"{frontend_base}/onboarding?ig_error=failed"
        else:
            redirect_url = f"{frontend_base}/brands?tab=connections&ig_error=failed"
        return RedirectResponse(url=redirect_url)


# ---------------------------------------------------------------------------
# Disconnect — clear credentials
# ---------------------------------------------------------------------------

class DisconnectRequest(BaseModel):
    brand_id: str


@router.post("/disconnect")
def instagram_disconnect(
    body: DisconnectRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear all Instagram credentials for a brand."""
    brand = db.query(Brand).filter(
        Brand.id == body.brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    brand.instagram_access_token = None
    brand.instagram_business_account_id = None
    brand.meta_access_token = None
    db.commit()

    logger.info(f"Instagram disconnected for brand={body.brand_id}")
    return {"status": "disconnected", "brand_id": body.brand_id}


# ---------------------------------------------------------------------------
# Status — check connection
# ---------------------------------------------------------------------------

@router.get("/status")
def instagram_status(
    brand_id: str = Query(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return Instagram connection status for a brand."""
    brand = db.query(Brand).filter(
        Brand.id == brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    connected = bool(brand.instagram_business_account_id and (brand.instagram_access_token or brand.meta_access_token))

    return {
        "connected": connected,
        "account_id": brand.instagram_business_account_id if connected else None,
        "handle": brand.instagram_handle if connected else None,
    }
