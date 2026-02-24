# Meta OAuth Integration — Implementation Spec

## Direct Facebook & Instagram Connection (No Third-Party)

**Date:** February 2026  
**Scope:** IG + FB OAuth 2.0 for brand-level account connection  
**Status Legend:**
- ✅ **Already exists** — code in place, no changes needed
- 🔧 **To build** — needs to be implemented

---

## Table of Contents

1. [Overview](#1-overview)
2. [How Meta OAuth Works](#2-how-meta-oauth-works)
3. [Prerequisites & Meta App Setup](#3-prerequisites--meta-app-setup)
4. [Database Changes](#4-database-changes)
5. [Backend — OAuth Routes](#5-backend--oauth-routes)
6. [Backend — Token Exchange Service](#6-backend--token-exchange-service)
7. [Frontend — Connect Button & Consent Flow](#7-frontend--connect-button--consent-flow)
8. [Token Lifecycle Management](#8-token-lifecycle-management)
9. [Publisher Integration](#9-publisher-integration)
10. [Environment Variables](#10-environment-variables)
11. [Security Considerations](#11-security-considerations)
12. [Implementation Order](#12-implementation-order)

---

## 1. Overview

### The Problem
Currently, connecting a brand to Instagram and Facebook requires users to manually supply:
- `meta_access_token` — a System User Token from Meta Business Suite
- `instagram_business_account_id` — a numeric ID found inside Meta Business Manager
- `facebook_page_id` — another numeric ID

This is a multi-step technical process that non-technical users cannot reasonably complete.

### The Solution
Replace manual credential entry with a standard **OAuth 2.0 consent flow**:

```
User clicks "Connect Instagram" in the Brand Settings UI
  → Redirect to Facebook Login (Meta's hosted page)
  → User grants permissions to your app
  → Meta redirects back to /api/auth/meta/callback?code=...&state=...
  → Backend exchanges code for short-lived token
  → Backend exchanges short-lived for long-lived token (60-day)
  → Backend fetches Instagram Business Account ID + Facebook Page ID automatically
  → All credentials stored in the brands table
  → Brand shows as "Connected" in UI
```

The user never sees an API key, an account ID, or a developer portal.

---

## 2. How Meta OAuth Works

### Token Types
Meta uses a layered token system. You need to collect them in order:

```
Short-lived User Token (1 hour)     ← returned by OAuth code exchange
        ↓
Long-lived User Token (60 days)     ← exchanged server-side
        ↓
Page Access Token (never expires*)  ← derived from long-lived user token
        ↓
Instagram Business Account ID       ← fetched from the Page's linked IG account
```

*Page Access Tokens generated from long-lived User Tokens never expire unless revoked.

### Required Permissions

| Permission | Why |
|---|---|
| `pages_show_list` | List Facebook Pages the user manages |
| `pages_read_engagement` | Read analytics from Facebook Pages |
| `pages_manage_posts` | Publish Reels to Facebook Pages |
| `instagram_basic` | Access basic Instagram account info |
| `instagram_content_publish` | Publish Reels/posts to Instagram |
| `instagram_manage_insights` | Read Instagram analytics |
| `business_management` | Access business accounts (needed for IG Business accounts) |

These are **Advanced Access** permissions — requires Meta App Review before going to production. For development/testing, add test accounts in the Meta App Dashboard.

---

## 3. Prerequisites & Meta App Setup

### One-time Developer Setup (done once per project, not per user)

1. Go to [developers.facebook.com](https://developers.facebook.com) → **Create App**
2. App type: **Business**
3. Add products: **Facebook Login**, **Instagram Graph API**
4. In **Facebook Login → Settings**:
   - Valid OAuth Redirect URIs: `https://yourdomain.com/api/auth/meta/callback`
   - For local dev: `http://localhost:8000/api/auth/meta/callback`
5. Copy from **Settings → Basic**:
   - `App ID` → `META_APP_ID` env var
   - `App Secret` → `META_APP_SECRET` env var
6. Submit for App Review to get Advanced Access permissions (for production)

### Environment Variables Required
```
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
META_REDIRECT_URI=https://yourdomain.com/api/auth/meta/callback
```

---

## 4. Database Changes

### ✅ Already Exists in `brands` table

The `Brand` model ([app/models/brands.py](../app/models/brands.py)) already has all required fields:

```python
instagram_access_token = Column(Text, nullable=True)
instagram_business_account_id = Column(String(100), nullable=True)
facebook_page_id = Column(String(100), nullable=True)
facebook_access_token = Column(Text, nullable=True)
meta_access_token = Column(Text, nullable=True)
```

### 🔧 New Fields Needed

Add these columns to `Brand` to support token lifecycle:

```python
meta_token_expires_at = Column(DateTime(timezone=True), nullable=True)   # When long-lived token expires
meta_user_id = Column(String(100), nullable=True)                        # Meta user ID who connected
meta_connected_at = Column(DateTime(timezone=True), nullable=True)       # When OAuth was completed
```

**Migration script** (`scripts/add_meta_oauth_columns.py`):

```python
"""Add Meta OAuth lifecycle columns to brands table."""
import os
from sqlalchemy import create_engine, text

engine = create_engine(os.environ["DATABASE_URL"])
with engine.connect() as conn:
    conn.execute(text("""
        ALTER TABLE brands
        ADD COLUMN IF NOT EXISTS meta_token_expires_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS meta_user_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS meta_connected_at TIMESTAMPTZ;
    """))
    conn.commit()
print("✅ Meta OAuth columns added")
```

---

## 5. Backend — OAuth Routes

### New file: `app/api/auth/meta_routes.py`

```python
"""
Meta (Facebook/Instagram) OAuth 2.0 Routes.

Handles the brand-level OAuth flow:
  GET  /api/auth/meta/connect?brand_id=...  → redirect to Facebook Login
  GET  /api/auth/meta/callback              → handle the OAuth return
  POST /api/auth/meta/disconnect            → revoke and clear credentials
  GET  /api/auth/meta/status?brand_id=...   → check connection status
"""
import os
import hmac
import hashlib
import secrets
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.models import Brand
from app.api.auth.middleware import get_current_user
from app.services.publishing.meta_token_service import MetaTokenService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth/meta", tags=["meta-oauth"])

META_APP_ID = os.environ.get("META_APP_ID", "")
META_REDIRECT_URI = os.environ.get("META_REDIRECT_URI", "")

REQUIRED_SCOPES = ",".join([
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_insights",
    "business_management",
])


# ---------------------------------------------------------------------------
# Step 1: Initiate OAuth — redirect user to Facebook Login
# ---------------------------------------------------------------------------

@router.get("/connect")
def meta_connect(
    brand_id: str = Query(..., description="Brand to connect"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Start the Meta OAuth flow for a specific brand.
    Redirect the user to Facebook's OAuth consent screen.
    """
    if not META_APP_ID or not META_REDIRECT_URI:
        raise HTTPException(status_code=503, detail="Meta OAuth not configured")

    # Verify this brand belongs to this user
    brand = db.query(Brand).filter(
        Brand.id == brand_id,
        Brand.user_id == user["id"]
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Generate a CSRF state token: encode brand_id + random nonce
    # This prevents OAuth callback forgery
    nonce = secrets.token_urlsafe(16)
    state = f"{brand_id}:{nonce}"
    # In production, store nonce in a short-lived cache (Redis/DB) for validation
    # For simplicity here, we encode brand_id in state and verify brand ownership on callback

    facebook_oauth_url = (
        f"https://www.facebook.com/v19.0/dialog/oauth"
        f"?client_id={META_APP_ID}"
        f"&redirect_uri={META_REDIRECT_URI}"
        f"&scope={REQUIRED_SCOPES}"
        f"&state={state}"
        f"&response_type=code"
    )

    return RedirectResponse(url=facebook_oauth_url)


# ---------------------------------------------------------------------------
# Step 2: OAuth Callback — exchange code, store credentials
# ---------------------------------------------------------------------------

@router.get("/callback")
def meta_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Handle the OAuth redirect from Facebook.
    Exchanges the code for tokens, fetches account IDs, stores everything.
    
    Note: This endpoint is called by Facebook's servers (no auth header).
    Security is provided by the `state` parameter and brand_id ownership check.
    After storing credentials, redirects to the frontend brand settings page.
    """
    # User denied or error occurred
    if error:
        logger.warning(f"Meta OAuth error: {error} — {error_description}")
        return RedirectResponse(url=f"/settings/brands?error=meta_auth_denied")

    if not code or not state:
        return RedirectResponse(url=f"/settings/brands?error=meta_auth_invalid")

    # Parse state to extract brand_id
    # state format: "brand_id:nonce"
    try:
        brand_id, nonce = state.split(":", 1)
    except ValueError:
        return RedirectResponse(url=f"/settings/brands?error=meta_auth_invalid_state")

    try:
        token_service = MetaTokenService()

        # 1. Exchange short-lived code for short-lived token
        short_lived = token_service.exchange_code_for_token(code)

        # 2. Exchange short-lived for long-lived user token (60 days)
        long_lived = token_service.exchange_for_long_lived_token(short_lived["access_token"])

        # 3. Get list of Facebook Pages the user manages
        pages = token_service.get_pages(long_lived["access_token"])
        if not pages:
            logger.error(f"No Facebook Pages found for brand {brand_id}")
            return RedirectResponse(url=f"/settings/brands/{brand_id}?error=meta_no_pages")

        # 4. Get a permanent Page Access Token for the first page
        # For multi-page brands, the frontend can let the user select which page
        page = pages[0]
        page_id = page["id"]
        page_access_token = page["access_token"]

        # 5. Fetch the Instagram Business Account linked to this page
        ig_account = token_service.get_instagram_account(page_id, page_access_token)

        # 6. Store all credentials in the Brand record
        brand = db.query(Brand).filter(Brand.id == brand_id).first()
        if not brand:
            return RedirectResponse(url=f"/settings/brands?error=meta_brand_not_found")

        brand.meta_access_token = long_lived["access_token"]
        brand.facebook_page_id = page_id
        brand.facebook_access_token = page_access_token
        brand.facebook_page_name = page.get("name")

        if ig_account:
            brand.instagram_business_account_id = ig_account["id"]
            brand.instagram_access_token = page_access_token  # IG uses same token as the page
            brand.instagram_handle = ig_account.get("username", "")

        # Token expiry (long-lived = ~60 days)
        from datetime import timedelta
        expires_in = long_lived.get("expires_in", 5184000)  # default 60 days in seconds
        brand.meta_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        brand.meta_connected_at = datetime.now(timezone.utc)
        brand.meta_user_id = long_lived.get("user_id")

        db.commit()
        db.refresh(brand)

        logger.info(f"✅ Meta OAuth complete for brand {brand_id} — IG: {ig_account and ig_account.get('id')}, FB Page: {page_id}")
        return RedirectResponse(url=f"/settings/brands/{brand_id}?meta_connected=true")

    except Exception as e:
        logger.exception(f"Meta OAuth callback failed for brand {brand_id}: {e}")
        return RedirectResponse(url=f"/settings/brands/{brand_id}?error=meta_auth_failed")


# ---------------------------------------------------------------------------
# Disconnect — revoke token and clear credentials
# ---------------------------------------------------------------------------

class DisconnectRequest(BaseModel):
    brand_id: str

@router.post("/disconnect")
def meta_disconnect(
    body: DisconnectRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke Meta access and clear all stored credentials for the brand."""
    brand = db.query(Brand).filter(
        Brand.id == body.brand_id,
        Brand.user_id == user["id"]
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Revoke the token with Meta (best-effort, don't fail if it errors)
    if brand.meta_access_token:
        try:
            MetaTokenService().revoke_token(brand.meta_access_token)
        except Exception as e:
            logger.warning(f"Token revocation failed (non-fatal): {e}")

    # Clear all Meta credentials
    brand.meta_access_token = None
    brand.facebook_page_id = None
    brand.facebook_access_token = None
    brand.instagram_business_account_id = None
    brand.instagram_access_token = None
    brand.meta_token_expires_at = None
    brand.meta_connected_at = None
    brand.meta_user_id = None
    db.commit()

    return {"status": "disconnected", "brand_id": body.brand_id}


# ---------------------------------------------------------------------------
# Status — check if a brand is connected
# ---------------------------------------------------------------------------

@router.get("/status")
def meta_status(
    brand_id: str = Query(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return Meta connection status for a brand."""
    brand = db.query(Brand).filter(
        Brand.id == brand_id,
        Brand.user_id == user["id"]
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    has_ig = bool(brand.instagram_business_account_id and brand.instagram_access_token)
    has_fb = bool(brand.facebook_page_id and brand.facebook_access_token)
    connected = has_ig or has_fb

    expires_at = brand.meta_token_expires_at
    days_until_expiry = None
    if expires_at:
        delta = expires_at - datetime.now(timezone.utc)
        days_until_expiry = delta.days

    return {
        "connected": connected,
        "instagram": {
            "connected": has_ig,
            "account_id": brand.instagram_business_account_id,
            "handle": brand.instagram_handle,
        },
        "facebook": {
            "connected": has_fb,
            "page_id": brand.facebook_page_id,
            "page_name": brand.facebook_page_name,
        },
        "token_expires_at": expires_at.isoformat() if expires_at else None,
        "days_until_expiry": days_until_expiry,
        "connected_at": brand.meta_connected_at.isoformat() if brand.meta_connected_at else None,
    }
```

### Register in `app/main.py`

```python
from app.api.auth.meta_routes import router as meta_oauth_router
app.include_router(meta_oauth_router)
```

---

## 6. Backend — Token Exchange Service

### New file: `app/services/publishing/meta_token_service.py`

```python
"""
Meta Token Service — handles all server-side token operations.

Encapsulates:
- Code → short-lived token exchange
- Short-lived → long-lived token exchange
- Fetching Facebook Pages
- Fetching linked Instagram Business Accounts
- Token revocation
"""
import os
import logging
import requests
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

META_GRAPH_BASE = "https://graph.facebook.com/v19.0"
META_APP_ID = os.environ.get("META_APP_ID", "")
META_APP_SECRET = os.environ.get("META_APP_SECRET", "")
META_REDIRECT_URI = os.environ.get("META_REDIRECT_URI", "")


class MetaTokenService:
    """Server-side Meta token operations. Never exposed to the client."""

    def exchange_code_for_token(self, code: str) -> Dict[str, Any]:
        """
        Exchange an OAuth authorization code for a short-lived user token.
        Short-lived tokens expire in 1 hour.
        """
        url = f"{META_GRAPH_BASE}/oauth/access_token"
        params = {
            "client_id": META_APP_ID,
            "client_secret": META_APP_SECRET,
            "redirect_uri": META_REDIRECT_URI,
            "code": code,
        }
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()

        if "error" in data:
            raise ValueError(f"Token exchange failed: {data['error'].get('message', data)}")
        if "access_token" not in data:
            raise ValueError(f"No access_token in response: {data}")

        return data  # {"access_token": "...", "token_type": "bearer"}

    def exchange_for_long_lived_token(self, short_lived_token: str) -> Dict[str, Any]:
        """
        Exchange a short-lived user token for a long-lived token (~60 days).
        Must be done server-side — requires APP_SECRET.
        """
        url = f"{META_GRAPH_BASE}/oauth/access_token"
        params = {
            "grant_type": "fb_exchange_token",
            "client_id": META_APP_ID,
            "client_secret": META_APP_SECRET,
            "fb_exchange_token": short_lived_token,
        }
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()

        if "error" in data:
            raise ValueError(f"Long-lived token exchange failed: {data['error'].get('message', data)}")

        return data  # {"access_token": "...", "token_type": "bearer", "expires_in": 5183944}

    def get_pages(self, user_access_token: str) -> List[Dict[str, Any]]:
        """
        Get the list of Facebook Pages managed by this user.
        Each page comes with its own permanent Page Access Token.
        """
        url = f"{META_GRAPH_BASE}/me/accounts"
        params = {
            "access_token": user_access_token,
            "fields": "id,name,access_token,instagram_business_account",
        }
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()

        if "error" in data:
            raise ValueError(f"Failed to fetch pages: {data['error'].get('message', data)}")

        return data.get("data", [])

    def get_instagram_account(
        self, page_id: str, page_access_token: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get the Instagram Business Account linked to a Facebook Page.
        Returns None if no IG account is linked.
        """
        url = f"{META_GRAPH_BASE}/{page_id}"
        params = {
            "fields": "instagram_business_account{id,username,name,followers_count}",
            "access_token": page_access_token,
        }
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()

        if "error" in data:
            logger.warning(f"Failed to fetch IG account for page {page_id}: {data['error']}")
            return None

        ig = data.get("instagram_business_account")
        return ig  # {"id": "...", "username": "...", ...} or None

    def revoke_token(self, access_token: str) -> bool:
        """
        Revoke a Meta access token (best-effort on disconnect).
        """
        url = f"{META_GRAPH_BASE}/me/permissions"
        params = {"access_token": access_token}
        resp = requests.delete(url, params=params, timeout=10)
        return resp.status_code == 200

    def inspect_token(self, access_token: str) -> Dict[str, Any]:
        """
        Inspect a token's validity and expiry using the Debug Token API.
        Useful for building token health-check logic.
        """
        url = f"{META_GRAPH_BASE}/debug_token"
        params = {
            "input_token": access_token,
            "access_token": f"{META_APP_ID}|{META_APP_SECRET}",  # App token
        }
        resp = requests.get(url, params=params, timeout=10)
        return resp.json().get("data", {})
```

---

## 7. Frontend — Connect Button & Consent Flow

### Replace Credential Form Fields

In [src/features/brands/](../src/features/brands/) (wherever brand credentials are currently entered), replace the raw token input fields with:

```tsx
// src/features/brands/components/MetaConnectButton.tsx

import { useState } from "react";
import { useApiGet, useApiPost } from "@/shared/hooks/useApi";

interface MetaStatus {
  connected: boolean;
  instagram: { connected: boolean; handle: string | null };
  facebook: { connected: boolean; page_name: string | null };
  days_until_expiry: number | null;
}

export function MetaConnectButton({ brandId }: { brandId: string }) {
  const { data: status, refetch } = useApiGet<MetaStatus>(
    `/api/auth/meta/status?brand_id=${brandId}`
  );
  const [disconnecting, setDisconnecting] = useState(false);
  const post = useApiPost();

  const handleConnect = () => {
    // Navigate to our backend route, which redirects to Facebook
    window.location.href = `/api/auth/meta/connect?brand_id=${brandId}`;
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await post("/api/auth/meta/disconnect", { brand_id: brandId });
    await refetch();
    setDisconnecting(false);
  };

  if (!status) return null;

  if (status.connected) {
    return (
      <div className="space-y-3">
        {/* Connection status badges */}
        <div className="flex gap-2">
          {status.instagram.connected && (
            <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 px-3 py-1 text-sm font-medium text-pink-700">
              ✅ Instagram connected
              {status.instagram.handle && ` @${status.instagram.handle}`}
            </span>
          )}
          {status.facebook.connected && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
              ✅ Facebook connected
              {status.facebook.page_name && ` — ${status.facebook.page_name}`}
            </span>
          )}
        </div>

        {/* Token expiry warning */}
        {status.days_until_expiry !== null && status.days_until_expiry < 14 && (
          <p className="text-sm text-amber-600">
            ⚠️ Your Meta connection expires in {status.days_until_expiry} days.{" "}
            <button onClick={handleConnect} className="underline">
              Reconnect now
            </button>
          </p>
        )}

        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="text-sm text-red-600 underline hover:text-red-800"
        >
          {disconnecting ? "Disconnecting..." : "Disconnect Meta accounts"}
        </button>
      </div>
    );
  }

  // Not connected — show the primary CTA
  return (
    <button
      onClick={handleConnect}
      className="flex items-center gap-2 rounded-lg bg-[#1877F2] px-5 py-3 text-white font-semibold hover:bg-[#166FE5] transition-colors"
    >
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        {/* Facebook logo icon path */}
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
      Connect Instagram &amp; Facebook
    </button>
  );
}
```

### Handle the Redirect-Back Success/Error State

In the brand settings page, read the URL query param after callback:

```tsx
// In your brand settings page component
import { useSearchParams } from "react-router-dom";

const [searchParams] = useSearchParams();
const metaConnected = searchParams.get("meta_connected");
const metaError = searchParams.get("error");

// Show success toast
useEffect(() => {
  if (metaConnected === "true") {
    toast.success("Instagram & Facebook connected successfully!");
  }
  if (metaError === "meta_auth_denied") {
    toast.error("Meta connection was cancelled.");
  }
}, [metaConnected, metaError]);
```

---

## 8. Token Lifecycle Management

### Token Expiry Reality

| Token Type | Lifetime | Stored Where |
|---|---|---|
| Short-lived user token | 1 hour | Never stored — used immediately |
| Long-lived user token | 60 days | `brands.meta_access_token` |
| Page access token | Never expires* | `brands.facebook_access_token` |
| IG access token | Never expires* | `brands.instagram_access_token` |

*Page/IG tokens generated from a long-lived user token never expire unless:
- The user revokes app access in Facebook Settings
- The user changes their Facebook password
- The token hasn't been used for 90 days

### Token Refresh Strategy

Since long-lived tokens expire in 60 days, build a **proactive refresh** step:

**Option A (Recommended): Refresh on use**  
In `SocialPublisher`, before any publish call, check `meta_token_expires_at`. If < 7 days remaining, silently exchange the stored long-lived token for a new one:

```python
# In MetaTokenService — add this method:
def refresh_long_lived_token(self, existing_long_lived_token: str) -> Dict[str, Any]:
    """
    Refresh a long-lived token. Works the same as exchange_for_long_lived_token.
    Can be called with the existing long-lived token to get a fresh 60-day token.
    Only works if the token is still valid (not expired).
    """
    return self.exchange_for_long_lived_token(existing_long_lived_token)
```

**Option B: Scheduled job**  
Add a daily cron (inside `app/main.py`'s APScheduler) that scans all brands and refreshes tokens expiring within 7 days.

### Frontend Expiry Warning

The `/api/auth/meta/status` endpoint already returns `days_until_expiry`.  
The `MetaConnectButton` component above shows a warning when < 14 days remain.

---

## 9. Publisher Integration

### ✅ `SocialPublisher` Already Works

The existing [app/services/publishing/social_publisher.py](../app/services/publishing/social_publisher.py) already uses `brand_config.instagram_business_account_id`, `brand_config.facebook_page_id`, and `brand_config.meta_access_token`.

Once the OAuth flow stores these in the `Brand` record and `BrandConfig` is loaded from the DB, **publishing works with zero changes to `SocialPublisher`**.

### The Token Routing

After OAuth completes, the `Brand` record contains:

| Field | Value source |
|---|---|
| `instagram_business_account_id` | Fetched automatically from page's linked IG account |
| `instagram_access_token` | = Page Access Token (page token works for IG Graph API) |
| `facebook_page_id` | = Page ID from `/me/accounts` |
| `facebook_access_token` | = Page Access Token from `/me/accounts` |
| `meta_access_token` | = Long-lived User Token (backup / token refresh source) |

The publisher already reads these fields — no changes needed there.

---

## 10. Environment Variables

Add to `.env` and Railway/production environment:

```bash
# Meta OAuth App Credentials (from developers.facebook.com)
META_APP_ID=your_facebook_app_id
META_APP_SECRET=your_facebook_app_secret
META_REDIRECT_URI=https://yourdomain.com/api/auth/meta/callback
```

For local development:
```bash
META_REDIRECT_URI=http://localhost:8000/api/auth/meta/callback
```

> **Note:** `META_APP_SECRET` must **never** be exposed to the client. It is used only server-side in `MetaTokenService`.

---

## 11. Security Considerations

| Risk | Mitigation |
|---|---|
| CSRF on OAuth callback | `state` param encodes `brand_id:nonce`; callback verifies brand ownership via DB lookup |
| `META_APP_SECRET` leakage | Server-side only — never returned in any API response |
| Token stored in DB | Access tokens are equivalent to passwords — ensure DB is not publicly accessible; tokens excluded from `to_dict()` by default |
| Open redirect | Callback only redirects to internal `/settings/...` paths — never to external URLs from state param |
| Token theft via logs | `MetaTokenService` and `SocialPublisher` must **never** log full token strings — log only `bool(token)` or last 6 chars |

---

## 12. Implementation Order

```
Phase 1 — Backend skeleton (no UI changes needed)
  1. Create MetaTokenService      → app/services/publishing/meta_token_service.py
  2. Create meta_routes.py        → app/api/auth/meta_routes.py
  3. Register router in main.py
  4. Run migration script         → scripts/add_meta_oauth_columns.py
  5. Add env vars to .env + Railway

Phase 2 — Test with a real Meta account
  6. Add your own FB/IG account as a test user in the Meta App Dashboard
  7. Test the connect flow end-to-end in development
  8. Verify brand credentials are stored correctly
  9. Run a manual publish to verify SocialPublisher still works

Phase 3 — Frontend
  10. Build MetaConnectButton component
  11. Replace raw credential fields in brand settings UI
  12. Handle post-redirect success/error state
  13. Show token expiry warning badge

Phase 4 — Token lifecycle
  14. Add proactive token refresh to SocialPublisher (check before publish)
  15. Add daily token-health cron to APScheduler (scan all brands)
  16. Wire up days_until_expiry warning in frontend

Phase 5 — Production readiness
  17. Submit Meta App for Advanced Access review
  18. Handle multi-page brands (let user pick which page to connect)
  19. Add /api/auth/meta/status to the brands list endpoint response
  20. Run validate_api.py
```
