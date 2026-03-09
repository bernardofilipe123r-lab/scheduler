"""
Bluesky auth routes (App Password based — no OAuth redirect).

  POST /api/auth/bluesky/connect      — store handle + app password, create session
  POST /api/auth/bluesky/disconnect   — clear credentials
  GET  /api/auth/bluesky/status       — check connection status
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.models.brands import Brand
from app.api.auth.middleware import get_current_user
from app.services.publishing.bsky_token_service import BskyTokenService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth/bluesky", tags=["bluesky-auth"])


# ---------------------------------------------------------------------------
# Connect — POST with handle + app password (no OAuth redirect)
# ---------------------------------------------------------------------------

class BskyConnectRequest(BaseModel):
    brand_id: str
    handle: str          # e.g. 'myaccount.bsky.social'
    app_password: str    # App Password from bsky.app/settings/app-passwords


@router.post("/connect")
def bsky_connect(
    body: BskyConnectRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Connect a Bluesky account to a brand using an App Password."""
    brand = db.query(Brand).filter(
        Brand.id == body.brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Validate credentials by creating a session
    token_service = BskyTokenService()
    try:
        session = token_service.create_session(body.handle, body.app_password)
    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg or "Authentication" in error_msg:
            raise HTTPException(
                status_code=422,
                detail="Invalid handle or app password. Create an App Password at bsky.app/settings/app-passwords",
            )
        logger.exception(f"Bluesky session creation failed for brand={body.brand_id}: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to connect to Bluesky: {error_msg}")

    did = session["did"]

    # Check if this Bluesky account is already connected to another brand
    existing = db.query(Brand).filter(
        Brand.bsky_did == did,
        Brand.id != body.brand_id,
    ).first()
    if existing:
        handle_str = f"@{session['handle']}"
        raise HTTPException(
            status_code=409,
            detail=f"Bluesky account {handle_str} is already connected to brand '{existing.display_name or existing.id}'",
        )

    # Store credentials
    now = datetime.now(timezone.utc)
    brand.bsky_handle = session["handle"]
    brand.bsky_did = did
    brand.bsky_app_password = body.app_password
    brand.bsky_access_jwt = session["accessJwt"]
    brand.bsky_refresh_jwt = session["refreshJwt"]
    brand.bsky_access_jwt_expires_at = now + timedelta(hours=2)
    db.commit()

    logger.info(f"Bluesky connected for brand={body.brand_id}, handle={session['handle']}, did={did}")
    return {
        "status": "connected",
        "brand_id": body.brand_id,
        "handle": session["handle"],
        "did": did,
    }


# ---------------------------------------------------------------------------
# Disconnect — clear credentials
# ---------------------------------------------------------------------------

class DisconnectRequest(BaseModel):
    brand_id: str


@router.post("/disconnect")
def bsky_disconnect(
    body: DisconnectRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear all Bluesky credentials for a brand."""
    brand = db.query(Brand).filter(
        Brand.id == body.brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    brand.bsky_handle = None
    brand.bsky_did = None
    brand.bsky_app_password = None
    brand.bsky_access_jwt = None
    brand.bsky_refresh_jwt = None
    brand.bsky_access_jwt_expires_at = None
    db.commit()

    logger.info(f"Bluesky disconnected for brand={body.brand_id}")
    return {"status": "disconnected", "brand_id": body.brand_id}


# ---------------------------------------------------------------------------
# Status — check connection
# ---------------------------------------------------------------------------

@router.get("/status")
def bsky_status(
    brand_id: str = Query(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return Bluesky connection status for a brand."""
    brand = db.query(Brand).filter(
        Brand.id == brand_id,
        Brand.user_id == user["id"],
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    connected = bool(brand.bsky_did and brand.bsky_app_password)

    return {
        "connected": connected,
        "account_id": brand.bsky_did if connected else None,
        "handle": brand.bsky_handle if connected else None,
        "access_jwt_expires_at": brand.bsky_access_jwt_expires_at.isoformat() if (connected and brand.bsky_access_jwt_expires_at) else None,
    }
