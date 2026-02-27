"""
Threads OAuth 2.0 Routes.

Handles the brand-level Threads OAuth flow:
  GET  /api/auth/threads/connect?brand_id=...  → redirect to Threads Login
  GET  /api/auth/threads/callback              → handle the OAuth return
  POST /api/auth/threads/disconnect             → clear credentials
  GET  /api/auth/threads/status?brand_id=...    → check connection status
  POST /api/auth/threads/refresh                → manually refresh long-lived token
"""
import os
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
from app.services.publishing.threads_token_service import ThreadsTokenService
from app.services.oauth import OAuthStateStore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth/threads", tags=["threads-oauth"])

META_APP_ID = os.environ.get("META_APP_ID") or os.environ.get("INSTAGRAM_APP_ID", "")
SITE_URL = os.environ.get("SITE_URL", "https://viraltoby.com")
THREADS_REDIRECT_URI = os.environ.get(
    "THREADS_REDIRECT_URI",
    SITE_URL + "/api/auth/threads/callback",
)

REQUIRED_SCOPES = ",".join([
    "threads_basic",
    "threads_content_publish",
])


# ---------------------------------------------------------------------------
# Step 1: Initiate OAuth — redirect user to Threads authorization
# ---------------------------------------------------------------------------

@router.get("/connect")
def threads_connect(
    brand_id: str = Query(..., description="Brand to connect"),
    return_to: str = Query(None, description="Where to redirect after OAuth (e.g. 'onboarding')"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start the Threads OAuth flow."""
    if not META_APP_ID or not THREADS_REDIRECT_URI:
        raise HTTPException(status_code=503, detail="Threads OAuth not configured")

    brand = db.query(Brand).filter(
        Brand.id == brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    state_token = OAuthStateStore.create(
        db=db,
        platform="threads",
        brand_id=brand_id,
        user_id=user["id"],
        return_to=return_to,
    )

    params = {
        "client_id": META_APP_ID,
        "redirect_uri": THREADS_REDIRECT_URI,
        "scope": REQUIRED_SCOPES,
        "response_type": "code",
        "state": state_token,
    }
    auth_url = f"https://threads.net/oauth/authorize?{urlencode(params)}"

    logger.info(f"Threads OAuth redirect_uri: {THREADS_REDIRECT_URI}")
    return {"auth_url": auth_url, "brand_id": brand_id}


# ---------------------------------------------------------------------------
# Step 2: OAuth Callback — exchange code, store credentials
# ---------------------------------------------------------------------------

@router.get("/callback")
def threads_callback(
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    error_reason: str = Query(None),
    error_description: str = Query(None),
    db: Session = Depends(get_db),
):
    """
    Handle the OAuth redirect from Threads.
    No auth header — security via state parameter.
    """
    frontend_base = SITE_URL

    if error:
        logger.warning(f"Threads OAuth denied: {error} — {error_description}")
        return RedirectResponse(url=f"{frontend_base}/brands?tab=connections&threads_error=denied")

    if not code or not state:
        return RedirectResponse(url=f"{frontend_base}/brands?tab=connections&threads_error=invalid")

    state_data = OAuthStateStore.validate(db, state, "threads")
    if not state_data:
        logger.warning("Threads OAuth callback: invalid or expired state token")
        return RedirectResponse(url=f"{frontend_base}/brands?tab=connections&threads_error=expired")

    brand_id = state_data["brand_id"]
    user_id = state_data["user_id"]
    return_to = state_data.get("return_to")

    try:
        token_service = ThreadsTokenService()

        # 1. Exchange code for short-lived token
        short_lived = token_service.exchange_code_for_token(code)
        short_token = short_lived["access_token"]

        # 2. Exchange for long-lived token (60 days)
        long_lived = token_service.exchange_for_long_lived_token(short_token)
        long_token = long_lived["access_token"]
        expires_in = long_lived.get("expires_in", 5184000)

        # 3. Fetch user profile
        profile = token_service.get_user_profile(long_token)
        threads_user_id = str(profile.get("id", ""))
        threads_username = profile.get("username", "")

        # 4. Store credentials in Brand record
        brand = db.query(Brand).filter(
            Brand.id == brand_id,
            Brand.user_id == user_id,
        ).first()
        if not brand:
            return RedirectResponse(url=f"{frontend_base}/brands?tab=connections&threads_error=brand_not_found")

        now = datetime.now(timezone.utc)
        brand.threads_access_token = long_token
        brand.threads_user_id = threads_user_id
        brand.threads_username = threads_username
        brand.threads_token_expires_at = now + timedelta(seconds=expires_in)
        brand.threads_token_last_refreshed_at = now
        db.commit()

        logger.info(
            f"Threads OAuth complete for brand={brand_id}, "
            f"threads_user={threads_user_id}, username=@{threads_username}"
        )

        if return_to == "onboarding":
            redirect_url = f"{frontend_base}/onboarding?threads_connected={brand_id}"
        else:
            redirect_url = f"{frontend_base}/brands?tab=connections&threads_connected={brand_id}"

        return RedirectResponse(url=redirect_url)

    except Exception as e:
        logger.exception(f"Threads OAuth callback failed for brand {brand_id}: {e}")
        if return_to == "onboarding":
            redirect_url = f"{frontend_base}/onboarding?threads_error=failed"
        else:
            redirect_url = f"{frontend_base}/brands?tab=connections&threads_error=failed"
        return RedirectResponse(url=redirect_url)


# ---------------------------------------------------------------------------
# Disconnect — clear credentials
# ---------------------------------------------------------------------------

class DisconnectRequest(BaseModel):
    brand_id: str


@router.post("/disconnect")
def threads_disconnect(
    body: DisconnectRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear all Threads credentials for a brand."""
    brand = db.query(Brand).filter(
        Brand.id == body.brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    brand.threads_access_token = None
    brand.threads_user_id = None
    brand.threads_username = None
    brand.threads_token_expires_at = None
    brand.threads_token_last_refreshed_at = None
    db.commit()

    logger.info(f"Threads disconnected for brand={body.brand_id}")
    return {"status": "disconnected", "brand_id": body.brand_id}


# ---------------------------------------------------------------------------
# Status — check connection
# ---------------------------------------------------------------------------

@router.get("/status")
def threads_status(
    brand_id: str = Query(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return Threads connection status for a brand."""
    brand = db.query(Brand).filter(
        Brand.id == brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    connected = bool(brand.threads_access_token and brand.threads_user_id)

    return {
        "connected": connected,
        "account_id": brand.threads_user_id if connected else None,
        "username": brand.threads_username if connected else None,
        "token_expires_at": brand.threads_token_expires_at.isoformat() if (connected and brand.threads_token_expires_at) else None,
    }


# ---------------------------------------------------------------------------
# Refresh — manually refresh long-lived token
# ---------------------------------------------------------------------------

class RefreshRequest(BaseModel):
    brand_id: str


@router.post("/refresh")
def threads_refresh_token(
    body: RefreshRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually refresh the Threads long-lived token."""
    brand = db.query(Brand).filter(
        Brand.id == body.brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    if not brand.threads_access_token:
        raise HTTPException(status_code=400, detail="No Threads token to refresh")

    try:
        token_service = ThreadsTokenService()
        refreshed = token_service.refresh_long_lived_token(brand.threads_access_token)

        now = datetime.now(timezone.utc)
        brand.threads_access_token = refreshed["access_token"]
        brand.threads_token_expires_at = now + timedelta(seconds=refreshed.get("expires_in", 5184000))
        brand.threads_token_last_refreshed_at = now
        db.commit()

        logger.info(f"Threads token refreshed for brand={body.brand_id}")
        return {"status": "refreshed", "expires_in": refreshed.get("expires_in")}
    except Exception as e:
        logger.exception(f"Threads token refresh failed for brand {body.brand_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Token refresh failed: {str(e)}")
