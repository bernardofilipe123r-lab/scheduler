"""
Facebook Login OAuth 2.0 Routes.

Handles the brand-level Facebook OAuth flow:
  GET  /api/auth/facebook/connect?brand_id=...     → redirect to Facebook Login
  GET  /api/auth/facebook/callback                  → handle the OAuth return
  GET  /api/auth/facebook/pages?brand_id=...        → list pages user manages + brands
  POST /api/auth/facebook/select-page               → store chosen page credentials
  POST /api/auth/facebook/bulk-connect              → map multiple pages to brands at once
  POST /api/auth/facebook/disconnect                → clear credentials
  GET  /api/auth/facebook/status?brand_id=...       → check connection status
"""
import os
import logging
from datetime import datetime, timedelta, timezone
from typing import List
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.models.brands import Brand
from app.api.auth.middleware import get_current_user
from app.services.publishing.fb_token_service import FacebookTokenService
from app.services.oauth import OAuthStateStore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth/facebook", tags=["facebook-oauth"])

FACEBOOK_APP_ID = os.environ.get("FACEBOOK_APP_ID", "")
SITE_URL = os.environ.get("SITE_URL", "https://viraltoby.com")
FACEBOOK_REDIRECT_URI = os.environ.get(
    "FACEBOOK_REDIRECT_URI",
    SITE_URL + "/api/auth/facebook/callback",
)

# Facebook Login scopes needed for Page publishing
REQUIRED_SCOPES = ",".join([
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_read_user_content",
])

# Temporary store for user tokens after callback, keyed by brand_id + user_id
# Used between callback → page selection flow.
_pending_tokens: dict = {}


# ---------------------------------------------------------------------------
# Step 1: Initiate OAuth — redirect user to Facebook Login
# ---------------------------------------------------------------------------

@router.get("/connect")
def facebook_connect(
    brand_id: str = Query(..., description="Brand to connect"),
    return_to: str = Query(None, description="Where to redirect after OAuth"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start the Facebook Login OAuth flow."""
    if not FACEBOOK_APP_ID or not FACEBOOK_REDIRECT_URI:
        raise HTTPException(status_code=503, detail="Facebook OAuth not configured")

    brand = db.query(Brand).filter(
        Brand.id == brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    state_token = OAuthStateStore.create(
        db=db,
        platform="facebook",
        brand_id=brand_id,
        user_id=user["id"],
        return_to=return_to,
    )

    params = {
        "client_id": FACEBOOK_APP_ID,
        "redirect_uri": FACEBOOK_REDIRECT_URI,
        "response_type": "code",
        "scope": REQUIRED_SCOPES,
        "state": state_token,
    }
    auth_url = f"https://www.facebook.com/{os.environ.get('FB_API_VERSION', 'v21.0')}/dialog/oauth?{urlencode(params)}"

    logger.info(f"Facebook OAuth redirect_uri: {FACEBOOK_REDIRECT_URI}")
    return {"auth_url": auth_url, "brand_id": brand_id}


# ---------------------------------------------------------------------------
# Step 2: OAuth Callback — exchange code, store user token temporarily
# ---------------------------------------------------------------------------

@router.get("/callback")
def facebook_callback(
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    error_reason: str = Query(None),
    error_description: str = Query(None),
    db: Session = Depends(get_db),
):
    """
    Handle the OAuth redirect from Facebook.

    After exchanging the code for a long-lived user token, redirects the
    frontend to a page-selection screen so the user can pick which
    Facebook Page to connect.
    """
    frontend_base = SITE_URL

    if error:
        logger.warning(f"Facebook OAuth denied: {error} — {error_description}")
        return RedirectResponse(url=f"{frontend_base}/brands?fb_error=denied")

    if not code or not state:
        return RedirectResponse(url=f"{frontend_base}/brands?fb_error=invalid")

    state_data = OAuthStateStore.validate(db, state, "facebook")
    if not state_data:
        logger.warning("Facebook OAuth callback: invalid or expired state token")
        return RedirectResponse(url=f"{frontend_base}/brands?fb_error=expired")

    brand_id = state_data["brand_id"]
    user_id = state_data["user_id"]
    return_to = state_data.get("return_to")

    try:
        token_service = FacebookTokenService()

        # 1. Exchange code for short-lived token
        short_lived = token_service.exchange_code_for_token(code)
        short_token = short_lived["access_token"]

        # 2. Exchange for long-lived token (60 days)
        long_lived = token_service.exchange_for_long_lived_token(short_token)
        long_token = long_lived["access_token"]

        # 3. Get user's managed pages
        pages = token_service.get_user_pages(long_token)

        if not pages:
            logger.warning(f"No Facebook Pages found for brand={brand_id}")
            return RedirectResponse(
                url=f"{frontend_base}/brands?fb_error=no_pages"
            )

        # If only one page, auto-select it
        if len(pages) == 1:
            page = pages[0]

            # Check if this FB page is already connected to another brand
            fb_existing = db.query(Brand).filter(
                Brand.facebook_page_id == page["id"],
                Brand.id != brand_id,
            ).first()
            if fb_existing:
                page_name = page.get("name", page["id"])
                logger.warning(
                    f"Facebook page {page_name} already connected to brand={fb_existing.id}, "
                    f"rejected for brand={brand_id}"
                )
                error_msg = f"duplicate&fb_duplicate_account={page_name}&fb_duplicate_brand={fb_existing.display_name or fb_existing.id}"
                if return_to == "onboarding":
                    return RedirectResponse(url=f"{frontend_base}/onboarding?fb_error={error_msg}")
                return RedirectResponse(url=f"{frontend_base}/brands?fb_error={error_msg}")

            brand = db.query(Brand).filter(
                Brand.id == brand_id,
                Brand.user_id == user_id,
            ).first()
            if not brand:
                return RedirectResponse(
                    url=f"{frontend_base}/brands?fb_error=brand_not_found"
                )

            brand.facebook_page_id = page["id"]
            brand.facebook_access_token = page["access_token"]
            brand.facebook_page_name = page.get("name", "")

            # Store page picture as default brand image if none set
            page_picture = (page.get("picture", {}).get("data", {}).get("url") if isinstance(page.get("picture"), dict) else None)
            if page_picture and not brand.profile_image_url:
                brand.profile_image_url = page_picture

            db.commit()

            logger.info(
                f"Facebook OAuth complete (auto-selected) for brand={brand_id}, "
                f"page_id={page['id']}, page_name={page.get('name')}"
            )

            if return_to == "onboarding":
                return RedirectResponse(
                    url=f"{frontend_base}/onboarding?fb_connected={brand_id}"
                )
            return RedirectResponse(
                url=f"{frontend_base}/brands?fb_connected={brand_id}"
            )

        # Multiple pages — store token temporarily and redirect to page selector
        pending_key = f"{user_id}:{brand_id}"
        _pending_tokens[pending_key] = {
            "token": long_token,
            "created_at": datetime.now(timezone.utc),
            "return_to": return_to,
        }

        # Clean up old pending tokens
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
        expired_keys = [
            k for k, v in _pending_tokens.items() if v["created_at"] < cutoff
        ]
        for k in expired_keys:
            _pending_tokens.pop(k, None)

        redirect_url = (
            f"{frontend_base}/brands"
            f"?fb_select_page={brand_id}"
        )
        return RedirectResponse(url=redirect_url)

    except Exception as e:
        logger.exception(f"Facebook OAuth callback failed for brand {brand_id}: {e}")
        if return_to == "onboarding":
            return RedirectResponse(url=f"{frontend_base}/onboarding?fb_error=failed")
        return RedirectResponse(url=f"{frontend_base}/brands?fb_error=failed")


# ---------------------------------------------------------------------------
# Step 2b: List available pages (called from frontend page-selector)
# ---------------------------------------------------------------------------

@router.get("/pages")
def facebook_list_pages(
    brand_id: str = Query(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the list of Facebook Pages the user can choose from, plus user's brands for bulk mapping."""
    pending_key = f"{user['id']}:{brand_id}"
    pending = _pending_tokens.get(pending_key)

    if not pending:
        raise HTTPException(
            status_code=400,
            detail="No pending Facebook connection. Please start the flow again.",
        )

    # Check expiry
    if datetime.now(timezone.utc) - pending["created_at"] > timedelta(minutes=10):
        _pending_tokens.pop(pending_key, None)
        raise HTTPException(status_code=400, detail="Session expired. Please reconnect.")

    try:
        token_service = FacebookTokenService()
        pages = token_service.get_user_pages(pending["token"])

        # Also return user's brands for the bulk mapping UI
        user_brands = db.query(Brand).filter(Brand.user_id == user["id"]).all()

        return {
            "pages": [
                {
                    "id": p["id"],
                    "name": p.get("name", ""),
                    "category": p.get("category", ""),
                    "fan_count": p.get("fan_count"),
                    "picture": (p.get("picture", {}).get("data", {}).get("url") if isinstance(p.get("picture"), dict) else None),
                }
                for p in pages
            ],
            "brands": [
                {
                    "id": b.id,
                    "display_name": b.display_name or b.id,
                    "facebook_page_id": b.facebook_page_id,
                }
                for b in user_brands
            ],
        }
    except Exception as e:
        logger.exception(f"Failed to list Facebook pages: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch Facebook pages")


# ---------------------------------------------------------------------------
# Step 2c: Select a page — store page credentials on the brand
# ---------------------------------------------------------------------------

class SelectPageRequest(BaseModel):
    brand_id: str
    page_id: str


@router.post("/select-page")
def facebook_select_page(
    body: SelectPageRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Finish the Facebook connection by choosing which Page to link.
    Stores the page access_token and page_id on the brand.
    """
    pending_key = f"{user['id']}:{body.brand_id}"
    pending = _pending_tokens.pop(pending_key, None)

    if not pending:
        raise HTTPException(
            status_code=400,
            detail="No pending Facebook connection. Please start the flow again.",
        )

    if datetime.now(timezone.utc) - pending["created_at"] > timedelta(minutes=10):
        raise HTTPException(status_code=400, detail="Session expired. Please reconnect.")

    try:
        token_service = FacebookTokenService()
        pages = token_service.get_user_pages(pending["token"])

        # Find the selected page
        selected = next((p for p in pages if p["id"] == body.page_id), None)
        if not selected:
            raise HTTPException(status_code=400, detail="Selected page not found")

        # Check if this FB page is already connected to another brand
        fb_existing = db.query(Brand).filter(
            Brand.facebook_page_id == selected["id"],
            Brand.id != body.brand_id,
        ).first()
        if fb_existing:
            page_name = selected.get("name", selected["id"])
            logger.warning(
                f"Facebook page {page_name} already connected to brand={fb_existing.id}, "
                f"rejected for brand={body.brand_id}"
            )
            raise HTTPException(
                status_code=409,
                detail=f"This Facebook page is already connected to {fb_existing.display_name or fb_existing.id}. Disconnect it there first."
            )

        brand = db.query(Brand).filter(
            Brand.id == body.brand_id,
            Brand.user_id == user["id"],
        ).first()
        if not brand:
            raise HTTPException(status_code=404, detail="Brand not found")

        brand.facebook_page_id = selected["id"]
        brand.facebook_access_token = selected["access_token"]
        brand.facebook_page_name = selected.get("name", "")

        # Store page picture as default brand image if none set
        page_picture = (selected.get("picture", {}).get("data", {}).get("url") if isinstance(selected.get("picture"), dict) else None)
        if page_picture and not brand.profile_image_url:
            brand.profile_image_url = page_picture

        db.commit()

        logger.info(
            f"Facebook page selected for brand={body.brand_id}: "
            f"page_id={selected['id']}, name={selected.get('name')}"
        )

        return {
            "status": "connected",
            "brand_id": body.brand_id,
            "page_id": selected["id"],
            "page_name": selected.get("name", ""),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to select Facebook page: {e}")
        raise HTTPException(status_code=500, detail="Failed to connect Facebook page")


# ---------------------------------------------------------------------------
# Step 2d: Bulk connect — map multiple pages to brands in one request
# ---------------------------------------------------------------------------

class BulkMapping(BaseModel):
    brand_id: str
    page_id: str

class BulkConnectRequest(BaseModel):
    origin_brand_id: str  # The brand that started the OAuth flow (to find pending token)
    mappings: List[BulkMapping]

@router.post("/bulk-connect")
def facebook_bulk_connect(
    body: BulkConnectRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Connect multiple Facebook Pages to multiple brands in one request.
    Uses the pending token from the origin brand's OAuth flow.
    """
    pending_key = f"{user['id']}:{body.origin_brand_id}"
    pending = _pending_tokens.pop(pending_key, None)

    if not pending:
        raise HTTPException(
            status_code=400,
            detail="No pending Facebook connection. Please start the flow again.",
        )

    if datetime.now(timezone.utc) - pending["created_at"] > timedelta(minutes=10):
        raise HTTPException(status_code=400, detail="Session expired. Please reconnect.")

    try:
        token_service = FacebookTokenService()
        pages = token_service.get_user_pages(pending["token"])
        pages_by_id = {p["id"]: p for p in pages}

        results = []
        for mapping in body.mappings:
            page = pages_by_id.get(mapping.page_id)
            if not page:
                results.append({"brand_id": mapping.brand_id, "status": "error", "message": "Page not found"})
                continue

            brand = db.query(Brand).filter(
                Brand.id == mapping.brand_id,
                Brand.user_id == user["id"],
            ).first()
            if not brand:
                results.append({"brand_id": mapping.brand_id, "status": "error", "message": "Brand not found"})
                continue

            # Check if page is already connected to ANOTHER brand (not this one)
            existing = db.query(Brand).filter(
                Brand.facebook_page_id == mapping.page_id,
                Brand.id != mapping.brand_id,
            ).first()
            if existing:
                results.append({
                    "brand_id": mapping.brand_id,
                    "status": "error",
                    "message": f"Page already connected to {existing.display_name or existing.id}",
                })
                continue

            brand.facebook_page_id = page["id"]
            brand.facebook_access_token = page["access_token"]
            brand.facebook_page_name = page.get("name", "")

            page_picture = (page.get("picture", {}).get("data", {}).get("url") if isinstance(page.get("picture"), dict) else None)
            if page_picture and not brand.profile_image_url:
                brand.profile_image_url = page_picture

            results.append({
                "brand_id": mapping.brand_id,
                "status": "connected",
                "page_name": page.get("name", ""),
            })

        db.commit()
        connected_count = sum(1 for r in results if r["status"] == "connected")
        logger.info(f"Bulk Facebook connect: {connected_count}/{len(body.mappings)} pages connected for user={user['id']}")

        return {"results": results, "connected_count": connected_count}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Bulk Facebook connect failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to bulk connect Facebook pages")


# ---------------------------------------------------------------------------
# Disconnect — clear credentials
# ---------------------------------------------------------------------------

class DisconnectRequest(BaseModel):
    brand_id: str


@router.post("/disconnect")
def facebook_disconnect(
    body: DisconnectRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear all Facebook credentials for a brand."""
    brand = db.query(Brand).filter(
        Brand.id == body.brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    brand.facebook_page_id = None
    brand.facebook_access_token = None
    brand.facebook_page_name = None
    db.commit()

    logger.info(f"Facebook disconnected for brand={body.brand_id}")
    return {"status": "disconnected", "brand_id": body.brand_id}


# ---------------------------------------------------------------------------
# Status — check connection
# ---------------------------------------------------------------------------

@router.get("/status")
def facebook_status(
    brand_id: str = Query(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return Facebook connection status for a brand."""
    brand = db.query(Brand).filter(
        Brand.id == brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    connected = bool(brand.facebook_page_id and brand.facebook_access_token)

    return {
        "connected": connected,
        "page_id": brand.facebook_page_id if connected else None,
        "page_name": brand.facebook_page_name if connected else None,
    }
