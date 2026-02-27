"""
TikTok OAuth 2.0 Routes with PKCE.

Handles the brand-level TikTok OAuth flow:
  GET  /api/auth/tiktok/connect?brand_id=...  → redirect to TikTok Login
  GET  /api/auth/tiktok/callback              → handle the OAuth return
  POST /api/auth/tiktok/disconnect             → clear credentials
  GET  /api/auth/tiktok/status?brand_id=...    → check connection status
"""
import os
import secrets
import hashlib
import base64
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.models.brands import Brand
from app.api.auth.middleware import get_current_user
from app.services.publishing.tiktok_token_service import TikTokTokenService
from app.services.oauth import OAuthStateStore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth/tiktok", tags=["tiktok-oauth"])

REQUIRED_SCOPES = ",".join([
    "user.info.basic",
    "user.info.profile",
    "user.info.stats",
    "video.list",
    "video.publish",
    "video.upload",
])


def _get_tiktok_config():
    """Read env vars at request time (not import time) to avoid load-order issues."""
    client_key = os.environ.get("TIKTOK_CLIENT_KEY", "")
    site_url = os.environ.get("SITE_URL", "https://viraltoby.com")
    redirect_uri = os.environ.get("TIKTOK_REDIRECT_URI", site_url + "/api/auth/tiktok/callback")
    return client_key, site_url, redirect_uri


def _generate_pkce_pair() -> tuple[str, str]:
    """Generate PKCE code_verifier and code_challenge (S256)."""
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return code_verifier, code_challenge


# ---------------------------------------------------------------------------
# Step 1: Initiate OAuth with PKCE
# ---------------------------------------------------------------------------

@router.get("/connect")
def tiktok_connect(
    brand_id: str = Query(..., description="Brand to connect"),
    return_to: str = Query(None, description="Where to redirect after OAuth (e.g. 'onboarding')"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start the TikTok OAuth flow with PKCE."""
    client_key, site_url, redirect_uri = _get_tiktok_config()

    if not client_key:
        logger.error("TikTok OAuth: TIKTOK_CLIENT_KEY not set. Configure it in Railway env vars.")
        raise HTTPException(status_code=503, detail="TikTok OAuth not configured — TIKTOK_CLIENT_KEY required")
    if not redirect_uri:
        raise HTTPException(status_code=503, detail="TikTok OAuth not configured — redirect URI missing")

    brand = db.query(Brand).filter(
        Brand.id == brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Generate PKCE pair
    code_verifier, code_challenge = _generate_pkce_pair()

    # Persist state + code_verifier
    state_token = OAuthStateStore.create(
        db=db,
        platform="tiktok",
        brand_id=brand_id,
        user_id=user["id"],
        return_to=return_to,
        code_verifier=code_verifier,
    )

    params = {
        "client_key": client_key,
        "scope": REQUIRED_SCOPES,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "state": state_token,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    auth_url = f"https://www.tiktok.com/v2/auth/authorize/?{urlencode(params)}"

    logger.info(f"TikTok OAuth: client_key={client_key[:6]}..., redirect_uri={redirect_uri}")
    return {"auth_url": auth_url, "brand_id": brand_id}


# ---------------------------------------------------------------------------
# Step 2: OAuth Callback — exchange code with PKCE verifier
# ---------------------------------------------------------------------------

@router.get("/callback")
def tiktok_callback(
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    error_description: str = Query(None),
    db: Session = Depends(get_db),
):
    """
    Handle the OAuth redirect from TikTok.
    No auth header — security via state parameter + PKCE.
    """
    _, site_url, _ = _get_tiktok_config()
    frontend_base = site_url

    if error:
        logger.warning(f"TikTok OAuth denied: {error} — {error_description}")
        return RedirectResponse(url=f"{frontend_base}/brands?tab=connections&tiktok_error=denied")

    if not code or not state:
        return RedirectResponse(url=f"{frontend_base}/brands?tab=connections&tiktok_error=invalid")

    state_data = OAuthStateStore.validate(db, state, "tiktok")
    if not state_data:
        logger.warning("TikTok OAuth callback: invalid or expired state token")
        return RedirectResponse(url=f"{frontend_base}/brands?tab=connections&tiktok_error=expired")

    brand_id = state_data["brand_id"]
    user_id = state_data["user_id"]
    return_to = state_data.get("return_to")
    code_verifier = state_data.get("code_verifier")

    if not code_verifier:
        logger.error("TikTok OAuth callback: missing code_verifier from state")
        return RedirectResponse(url=f"{frontend_base}/brands?tab=connections&tiktok_error=pkce_error")

    try:
        token_service = TikTokTokenService()

        # 1. Exchange code for tokens (needs code_verifier for PKCE)
        tokens = token_service.exchange_code_for_tokens(code, code_verifier)
        access_token = tokens["access_token"]
        refresh_token = tokens["refresh_token"]
        open_id = tokens["open_id"]
        expires_in = tokens.get("expires_in", 86400)
        refresh_expires_in = tokens.get("refresh_expires_in", 31536000)

        # 2. Get user info
        user_info = token_service.get_user_info(access_token)
        display_name = user_info.get("display_name", "")
        username = user_info.get("username", display_name)

        # 3. Store credentials in Brand record
        brand = db.query(Brand).filter(
            Brand.id == brand_id,
            Brand.user_id == user_id,
        ).first()
        if not brand:
            return RedirectResponse(url=f"{frontend_base}/brands?tab=connections&tiktok_error=brand_not_found")

        now = datetime.now(timezone.utc)
        brand.tiktok_access_token = access_token
        brand.tiktok_refresh_token = refresh_token
        brand.tiktok_user_id = open_id
        brand.tiktok_username = username or display_name
        brand.tiktok_open_id = open_id
        brand.tiktok_access_token_expires_at = now + timedelta(seconds=expires_in)
        brand.tiktok_refresh_token_expires_at = now + timedelta(seconds=refresh_expires_in)
        db.commit()

        logger.info(
            f"TikTok OAuth complete for brand={brand_id}, "
            f"open_id={open_id}, username={username}"
        )

        if return_to == "onboarding":
            redirect_url = f"{frontend_base}/onboarding?tiktok_connected={brand_id}"
        else:
            redirect_url = f"{frontend_base}/brands?tab=connections&tiktok_connected={brand_id}"

        return RedirectResponse(url=redirect_url)

    except Exception as e:
        logger.exception(f"TikTok OAuth callback failed for brand {brand_id}: {e}")
        if return_to == "onboarding":
            redirect_url = f"{frontend_base}/onboarding?tiktok_error=failed"
        else:
            redirect_url = f"{frontend_base}/brands?tab=connections&tiktok_error=failed"
        return RedirectResponse(url=redirect_url)


# ---------------------------------------------------------------------------
# Disconnect — clear credentials
# ---------------------------------------------------------------------------

class DisconnectRequest(BaseModel):
    brand_id: str


@router.post("/disconnect")
def tiktok_disconnect(
    body: DisconnectRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear all TikTok credentials for a brand."""
    brand = db.query(Brand).filter(
        Brand.id == body.brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    brand.tiktok_access_token = None
    brand.tiktok_refresh_token = None
    brand.tiktok_user_id = None
    brand.tiktok_username = None
    brand.tiktok_open_id = None
    brand.tiktok_access_token_expires_at = None
    brand.tiktok_refresh_token_expires_at = None
    db.commit()

    logger.info(f"TikTok disconnected for brand={body.brand_id}")
    return {"status": "disconnected", "brand_id": body.brand_id}


# ---------------------------------------------------------------------------
# Status — check connection
# ---------------------------------------------------------------------------

@router.get("/status")
def tiktok_status(
    brand_id: str = Query(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return TikTok connection status for a brand."""
    brand = db.query(Brand).filter(
        Brand.id == brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    connected = bool(brand.tiktok_access_token and brand.tiktok_refresh_token)

    return {
        "connected": connected,
        "account_id": brand.tiktok_open_id if connected else None,
        "username": brand.tiktok_username if connected else None,
        "access_token_expires_at": brand.tiktok_access_token_expires_at.isoformat() if (connected and brand.tiktok_access_token_expires_at) else None,
        "refresh_token_expires_at": brand.tiktok_refresh_token_expires_at.isoformat() if (connected and brand.tiktok_refresh_token_expires_at) else None,
    }
