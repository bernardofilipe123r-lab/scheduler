# Threads & TikTok Integration — Full Architecture Plan

> **Status:** Design document — not yet implemented
> **Date:** 2026-02-27
> **Scope:** Full-stack implementation of Threads (Meta) and TikTok as publishable platforms, integrated into the existing brand connection system (onboarding + existing brands), social publisher, and Toby autonomous agent.

---

## Table of Contents

1. [Platform API Overview](#1-platform-api-overview)
2. [Database Schema Changes](#2-database-schema-changes)
3. [Backend — Token Services](#3-backend--token-services)
4. [Backend — OAuth Route Handlers](#4-backend--oauth-route-handlers)
5. [Backend — Brand Connections Endpoint Update](#5-backend--brand-connections-endpoint-update)
6. [Backend — Social Publisher Update](#6-backend--social-publisher-update)
7. [Backend — Content Formatting Per Platform](#7-backend--content-formatting-per-platform)
8. [Backend — Toby Agent Update](#8-backend--toby-agent-update)
9. [Frontend — Types & API Client](#9-frontend--types--api-client)
10. [Frontend — ConnectionCard UI](#10-frontend--connectioncard-ui)
11. [Frontend — ConnectionsTab (OAuth Redirect Handler)](#11-frontend--connectionstab-oauth-redirect-handler)
12. [Frontend — Onboarding Step 6](#12-frontend--onboarding-step-6)
13. [Token Lifecycle & Refresh Strategy](#13-token-lifecycle--refresh-strategy)
14. [Validation & Pre-commit Checklist](#14-validation--pre-commit-checklist)
15. [Implementation Order](#15-implementation-order)

---

## 1. Platform API Overview

### 1.1 Threads (Meta)

| Property | Value |
|---|---|
| API Domain | `graph.threads.net` |
| OAuth Authorization URL | `https://threads.net/oauth/authorize` |
| Token Exchange URL | `https://graph.threads.net/oauth/access_token` |
| Long-Lived Token URL | `https://graph.threads.net/access_token` |
| Token Duration | Short-lived: 1 hour → exchange for 60-day long-lived |
| Token Refresh | Yes — same refresh endpoint as long-lived exchange |
| Permissions Required | `threads_basic`, `threads_content_publish` |
| Optional Permissions | `threads_read_replies`, `threads_manage_replies`, `threads_manage_insights` |
| App Platform | Same Meta Developer App as Instagram (add Threads product) |
| Content Types | Text-only, Text+Image, Text+Video, Carousel |
| Video Format | MP4, MOV — max 5 min, 1 GB |
| Image Format | JPEG, PNG, WebP |
| Text Limit | 500 characters |
| Publishing Flow | 2-step: create container → publish (same as Instagram) |
| API Version | v21.0 (or latest) |

**Key difference from Instagram:** Threads is **text-first**. The post *starts* with text; media is optional and supplementary. Threads also supports **carousel** posts natively (up to 10 items).

**API Endpoints Used:**
- `POST /{threads_user_id}/threads` — create media container
- `POST /{threads_user_id}/threads_publish` — publish container
- `GET /{threads_user_id}/threads` — list user's threads
- `GET /me?fields=id,username,name,threads_profile_picture_url,threads_biography` — user profile

### 1.2 TikTok

| Property | Value |
|---|---|
| API Domain | `open.tiktokapis.com` |
| OAuth Authorization URL | `https://www.tiktok.com/v2/auth/authorize/` |
| Token Exchange URL | `https://open.tiktokapis.com/v2/oauth/token/` |
| Token Refresh URL | `https://open.tiktokapis.com/v2/oauth/token/` (with `grant_type=refresh_token`) |
| Access Token Duration | 24 hours |
| Refresh Token Duration | 365 days |
| Permissions (Scopes) | `user.info.basic`, `video.publish`, `video.upload` |
| Optional Scopes | `user.info.stats`, `video.list` |
| App Platform | Separate TikTok Developer app (not Meta) |
| Content Types | Video only (no image posts for Content Posting API) |
| Video Format | MP4, WebM — 3s–60s for organic, up to 10 min with extended access |
| Video Ratio | 9:16 preferred (1080×1920), supports 16:9 and 1:1 |
| Caption Limit | 2200 characters |
| Hashtags | Included in caption |
| Publishing Flow | `PULL_FROM_URL` (TikTok pulls from your URL) or `FILE_UPLOAD` (chunk upload) |
| API Access Level | Default = `Client Access` (unverified). Need `Content Posting API` approved for auto-publish |

**Critical TikTok difference:** TikTok requires **app review and approval** for the `video.publish` scope in production. During development, you can test with sandbox accounts only. Production publishing requires submitting the app for review.

**API Endpoints Used:**
- `POST /v2/oauth/token/` — exchange code for tokens
- `POST /v2/oauth/token/` — refresh access token
- `GET /v2/user/info/` — get user profile
- `POST /v2/video/init/` — initialize video upload (returns `publish_id`)
- `POST /v2/video/upload/` — upload video chunks (for FILE_UPLOAD method)
- `POST /v2/video/publish/` — complete and publish video
- `GET /v2/video/query/` — poll for publish status

**Publishing Method Choice: Use `PULL_FROM_URL`** — TikTok fetches the video from our Supabase storage URL. This avoids chunked upload complexity and is simpler to implement. The URL must be publicly accessible (Supabase public bucket).

---

## 2. Database Schema Changes

### 2.1 Migration Script

Create `migrations/add_threads_tiktok_columns.sql`:

```sql
-- Threads credentials (Meta ecosystem, same token as Instagram if authorized)
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS threads_access_token TEXT,
  ADD COLUMN IF NOT EXISTS threads_user_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS threads_username VARCHAR(64),
  ADD COLUMN IF NOT EXISTS threads_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS threads_token_last_refreshed_at TIMESTAMPTZ;

-- TikTok credentials (separate OAuth app)
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS tiktok_access_token TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_user_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS tiktok_username VARCHAR(128),
  ADD COLUMN IF NOT EXISTS tiktok_access_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tiktok_refresh_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tiktok_open_id VARCHAR(128);
```

Run this directly in the Supabase SQL editor.

### 2.2 SQLAlchemy Model Update

**File:** `app/models/brands.py`

Add to the `Brand` class:

```python
# Threads (Meta) credentials
threads_access_token = Column(Text, nullable=True)
threads_user_id = Column(String(64), nullable=True)
threads_username = Column(String(64), nullable=True)
threads_token_expires_at = Column(DateTime(timezone=True), nullable=True)
threads_token_last_refreshed_at = Column(DateTime(timezone=True), nullable=True)

# TikTok credentials
tiktok_access_token = Column(Text, nullable=True)
tiktok_refresh_token = Column(Text, nullable=True)
tiktok_user_id = Column(String(64), nullable=True)
tiktok_username = Column(String(128), nullable=True)
tiktok_open_id = Column(String(128), nullable=True)
tiktok_access_token_expires_at = Column(DateTime(timezone=True), nullable=True)
tiktok_refresh_token_expires_at = Column(DateTime(timezone=True), nullable=True)
```

### 2.3 BrandConfig Dataclass Update

**File:** `app/core/config.py`

Add to `BrandConfig`:

```python
# Threads
threads_access_token: str = ""
threads_user_id: str = ""
threads_username: str = ""

# TikTok
tiktok_access_token: str = ""
tiktok_refresh_token: str = ""
tiktok_user_id: str = ""
tiktok_username: str = ""
tiktok_open_id: str = ""
tiktok_access_token_expires_at: Optional[datetime] = None
```

Update `get_brand_config()` to populate these from the `Brand` row.

### 2.4 oauth_states Platform Enum

The `OAuthState.platform` column already accepts any string. Just ensure the new platforms are documented. Valid values become:
`'instagram'`, `'facebook'`, `'youtube'`, `'threads'`, `'tiktok'`

---

## 3. Backend — Token Services

### 3.1 Threads Token Service

**New file:** `app/services/publishing/threads_token_service.py`

```python
"""
Threads API token exchange and refresh service.
Threads uses a 2-step OAuth: short-lived → long-lived (same as Instagram).
The long-lived token lasts 60 days and must be refreshed before expiry.
"""

import httpx
import os
from datetime import datetime, timedelta, timezone

THREADS_API_BASE = "https://graph.threads.net"
API_VERSION = "v21.0"


class ThreadsTokenService:
    def __init__(self):
        self.app_id = os.environ.get("META_APP_ID")  # SAME app as Instagram
        self.app_secret = os.environ.get("META_APP_SECRET")  # SAME secret
        self.redirect_uri = os.environ.get(
            "THREADS_REDIRECT_URI",
            "https://viraltoby.com/api/auth/threads/callback"
        )

    def exchange_code_for_token(self, code: str) -> dict:
        """Exchange authorization code for short-lived access token."""
        resp = httpx.post(
            f"{THREADS_API_BASE}/oauth/access_token",
            data={
                "client_id": self.app_id,
                "client_secret": self.app_secret,
                "grant_type": "authorization_code",
                "redirect_uri": self.redirect_uri,
                "code": code,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()  # {"access_token": "...", "user_id": "..."}

    def exchange_for_long_lived_token(self, short_token: str) -> dict:
        """Exchange short-lived token for 60-day long-lived token."""
        resp = httpx.get(
            f"{THREADS_API_BASE}/access_token",
            params={
                "grant_type": "th_exchange_token",
                "client_secret": self.app_secret,
                "access_token": short_token,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()  # {"access_token": "...", "token_type": "bearer", "expires_in": 5183944}

    def refresh_long_lived_token(self, long_token: str) -> dict:
        """Refresh a long-lived token (can be done once per day, up to 60 days before expiry)."""
        resp = httpx.get(
            f"{THREADS_API_BASE}/refresh_access_token",
            params={
                "grant_type": "th_refresh_token",
                "access_token": long_token,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()  # {"access_token": "...", "expires_in": 5183944}

    def get_user_profile(self, access_token: str) -> dict:
        """Get Threads user profile to store user_id and username."""
        resp = httpx.get(
            f"{THREADS_API_BASE}/{API_VERSION}/me",
            params={
                "fields": "id,username,name,threads_profile_picture_url,threads_biography",
                "access_token": access_token,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()  # {"id": "...", "username": "...", "name": "..."}
```

### 3.2 TikTok Token Service

**New file:** `app/services/publishing/tiktok_token_service.py`

```python
"""
TikTok Content Posting API token service.
Access tokens expire in 24 hours.
Refresh tokens last 365 days.
Always refresh access token before publishing.
"""

import httpx
import os
from datetime import datetime, timedelta, timezone

TIKTOK_OAUTH_URL = "https://open.tiktokapis.com/v2/oauth/token/"
TIKTOK_API_BASE = "https://open.tiktokapis.com"


class TikTokTokenService:
    def __init__(self):
        self.client_key = os.environ.get("TIKTOK_CLIENT_KEY")
        self.client_secret = os.environ.get("TIKTOK_CLIENT_SECRET")
        self.redirect_uri = os.environ.get(
            "TIKTOK_REDIRECT_URI",
            "https://viraltoby.com/api/auth/tiktok/callback"
        )

    def exchange_code_for_tokens(self, code: str, code_verifier: str) -> dict:
        """
        Exchange authorization code for access_token + refresh_token.
        TikTok uses PKCE — must pass code_verifier.
        """
        resp = httpx.post(
            TIKTOK_OAUTH_URL,
            data={
                "client_key": self.client_key,
                "client_secret": self.client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": self.redirect_uri,
                "code_verifier": code_verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        # Returns: {"data": {"access_token": "...", "refresh_token": "...",
        #           "expires_in": 86400, "refresh_expires_in": 31536000,
        #           "open_id": "...", "scope": "user.info.basic,video.publish"}, "error": {...}}
        if data.get("error", {}).get("code") != "ok":
            raise ValueError(f"TikTok token exchange failed: {data}")
        return data["data"]

    def refresh_access_token(self, refresh_token: str) -> dict:
        """Refresh access token using refresh token. Called before every publish."""
        resp = httpx.post(
            TIKTOK_OAUTH_URL,
            data={
                "client_key": self.client_key,
                "client_secret": self.client_secret,
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("error", {}).get("code") != "ok":
            raise ValueError(f"TikTok token refresh failed: {data}")
        return data["data"]

    def get_user_info(self, access_token: str, open_id: str) -> dict:
        """Get TikTok user info to store username."""
        resp = httpx.get(
            f"{TIKTOK_API_BASE}/v2/user/info/",
            params={"fields": "open_id,union_id,avatar_url,display_name,username"},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("error", {}).get("code") != "ok":
            raise ValueError(f"TikTok user info failed: {data}")
        return data["data"]["user"]  # {"open_id": "...", "display_name": "...", "username": "..."}
```

---

## 4. Backend — OAuth Route Handlers

### 4.1 Threads OAuth Routes

**New file:** `app/api/auth/threads_oauth_routes.py`

The Threads OAuth flow is **identical to Instagram** — same Meta app, same state pattern, same 2-step token exchange. The only differences are the scopes and API endpoints.

**Endpoints:**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/auth/threads/connect` | Initiate OAuth — returns auth URL |
| `GET` | `/api/auth/threads/callback` | Receive code, exchange for token, store |
| `POST` | `/api/auth/threads/disconnect` | Clear all Threads credentials |
| `GET` | `/api/auth/threads/status` | Return current connection status |
| `POST` | `/api/auth/threads/refresh` | Manually refresh long-lived token |

**Connect endpoint logic:**
```python
# GET /api/auth/threads/connect?brand_id=...&return_to=...
# 1. Verify brand belongs to user
# 2. Generate state token, INSERT INTO oauth_states (platform='threads')
# 3. Build Threads auth URL:
auth_url = (
    f"https://threads.net/oauth/authorize"
    f"?client_id={META_APP_ID}"
    f"&redirect_uri={THREADS_REDIRECT_URI}"
    f"&scope=threads_basic,threads_content_publish"
    f"&response_type=code"
    f"&state={state_token}"
)
return {"auth_url": auth_url}
```

**Callback endpoint logic:**
```python
# GET /api/auth/threads/callback?code=...&state=...
# 1. Validate state (same as Instagram)
# 2. ThreadsTokenService.exchange_code_for_token(code) → short-lived token
# 3. ThreadsTokenService.exchange_for_long_lived_token(short) → long-lived
# 4. ThreadsTokenService.get_user_profile(long_token) → {id, username}
# 5. UPDATE brands SET:
#    threads_access_token = long_token,
#    threads_user_id = profile["id"],
#    threads_username = profile["username"],
#    threads_token_expires_at = now + 60 days,
#    threads_token_last_refreshed_at = now
# 6. Redirect to:
#    /onboarding?threads_connected={brand_id}  (if return_to=onboarding)
#    /brands?tab=connections&threads_connected={brand_id}  (default)
```

### 4.2 TikTok OAuth Routes

**New file:** `app/api/auth/tiktok_oauth_routes.py`

TikTok uses **PKCE** (Proof Key for Code Exchange). We must generate `code_verifier` + `code_challenge` and store the verifier in the DB to use during token exchange.

**Extend `OAuthState` model** to add a nullable `code_verifier` column:
```sql
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS code_verifier TEXT;
```

**Endpoints:**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/auth/tiktok/connect` | Initiate OAuth with PKCE |
| `GET` | `/api/auth/tiktok/callback` | Receive code, exchange tokens |
| `POST` | `/api/auth/tiktok/disconnect` | Clear all TikTok credentials |
| `GET` | `/api/auth/tiktok/status` | Return current connection status |

**Connect endpoint logic:**
```python
# GET /api/auth/tiktok/connect?brand_id=...&return_to=...
# 1. Verify brand
# 2. Generate PKCE:
import secrets, hashlib, base64
code_verifier = secrets.token_urlsafe(64)
code_challenge = base64.urlsafe_b64encode(
    hashlib.sha256(code_verifier.encode()).digest()
).rstrip(b'=').decode()
# 3. Generate state token
# 4. INSERT INTO oauth_states:
#    platform='tiktok', state_token=state, brand_id=brand_id,
#    user_id=user_id, return_to=return_to, code_verifier=code_verifier
# 5. Build auth URL:
auth_url = (
    f"https://www.tiktok.com/v2/auth/authorize/"
    f"?client_key={TIKTOK_CLIENT_KEY}"
    f"&scope=user.info.basic,video.publish,video.upload"
    f"&response_type=code"
    f"&redirect_uri={TIKTOK_REDIRECT_URI}"
    f"&state={state_token}"
    f"&code_challenge={code_challenge}"
    f"&code_challenge_method=S256"
)
return {"auth_url": auth_url}
```

**Callback endpoint logic:**
```python
# GET /api/auth/tiktok/callback?code=...&state=...
# 1. Validate state token (same pattern, platform='tiktok')
# 2. Retrieve code_verifier from oauth_states row
# 3. Mark state as consumed
# 4. TikTokTokenService.exchange_code_for_tokens(code, code_verifier)
#    → {access_token, refresh_token, expires_in, refresh_expires_in, open_id}
# 5. TikTokTokenService.get_user_info(access_token, open_id)
#    → {display_name, username}
# 6. UPDATE brands SET:
#    tiktok_access_token = access_token,
#    tiktok_refresh_token = refresh_token,
#    tiktok_user_id = open_id,
#    tiktok_username = user["display_name"],
#    tiktok_open_id = open_id,
#    tiktok_access_token_expires_at = now + 24h,
#    tiktok_refresh_token_expires_at = now + 365 days
# 7. Redirect:
#    /onboarding?tiktok_connected={brand_id}
#    /brands?tab=connections&tiktok_connected={brand_id}
```

### 4.3 Register New Routes

**File:** `app/main.py`

Add imports and router registrations:
```python
from app.api.auth.threads_oauth_routes import router as threads_oauth_router
from app.api.auth.tiktok_oauth_routes import router as tiktok_oauth_router

app.include_router(threads_oauth_router, prefix="/api/auth")
app.include_router(tiktok_oauth_router, prefix="/api/auth")
```

Also ensure the OAuth callback redirect URIs match what's registered in each developer portal (see admin guide).

### 4.4 Update `validate_api.py`

**File:** `scripts/validate_api.py`

Add to `CRITICAL_MODULES`:
```python
"app.api.auth.threads_oauth_routes",
"app.api.auth.tiktok_oauth_routes",
"app.services.publishing.threads_token_service",
"app.services.publishing.tiktok_token_service",
```

---

## 5. Backend — Brand Connections Endpoint Update

**File:** `app/api/brands/routes.py`

Update `GET /brands/connections` to include Threads and TikTok:

```python
# In the brand loop:
brand_data = {
    "brand": brand.name,
    "display_name": brand.display_name,
    "color": brand.primary_color,
    "instagram": {
        "connected": bool(brand.instagram_access_token),
        "account_id": brand.instagram_business_account_id,
        "account_name": f"@{brand.instagram_handle}" if brand.instagram_handle else None,
        "status": "connected" if brand.instagram_access_token else "not_configured",
        "token_expires_at": brand.instagram_token_expires_at.isoformat() if brand.instagram_token_expires_at else None,
        "token_last_refreshed_at": brand.instagram_token_last_refreshed_at.isoformat() if brand.instagram_token_last_refreshed_at else None,
    },
    "facebook": { ... },  # unchanged
    "youtube": { ... },   # unchanged

    # NEW:
    "threads": {
        "connected": bool(brand.threads_access_token),
        "account_id": brand.threads_user_id,
        "account_name": f"@{brand.threads_username}" if brand.threads_username else None,
        "status": "connected" if brand.threads_access_token else "not_configured",
        "token_expires_at": brand.threads_token_expires_at.isoformat() if brand.threads_token_expires_at else None,
        "token_last_refreshed_at": brand.threads_token_last_refreshed_at.isoformat() if brand.threads_token_last_refreshed_at else None,
    },
    "tiktok": {
        "connected": bool(brand.tiktok_access_token and brand.tiktok_refresh_token),
        "account_id": brand.tiktok_open_id,
        "account_name": brand.tiktok_username,
        "status": "connected" if (brand.tiktok_access_token and brand.tiktok_refresh_token) else "not_configured",
        "access_token_expires_at": brand.tiktok_access_token_expires_at.isoformat() if brand.tiktok_access_token_expires_at else None,
        "refresh_token_expires_at": brand.tiktok_refresh_token_expires_at.isoformat() if brand.tiktok_refresh_token_expires_at else None,
    },
}
```

Update `oauth_configured`:
```python
"oauth_configured": {
    "meta": bool(os.environ.get("META_APP_ID")),
    "facebook": bool(os.environ.get("META_APP_ID")),  # same app
    "youtube": bool(os.environ.get("YOUTUBE_CLIENT_ID")),
    "threads": bool(os.environ.get("META_APP_ID")),   # same Meta app
    "tiktok": bool(os.environ.get("TIKTOK_CLIENT_KEY")),
}
```

---

## 6. Backend — Social Publisher Update

**File:** `app/services/publishing/social_publisher.py`

### 6.1 Threads Publisher

Add `publish_threads_post()` method to `SocialPublisher`:

```python
async def publish_threads_post(
    self,
    text: str,
    media_url: str | None = None,
    media_type: str = "IMAGE",  # "IMAGE" | "VIDEO" | "TEXT"
) -> str:
    """
    Publish a post to Threads.
    Two-step: create container, then publish.
    Returns the published thread ID.
    """
    threads_user_id = self.brand_config.threads_user_id
    access_token = self.brand_config.threads_access_token

    # Step 1: Create media container
    container_payload = {
        "text": text,
        "access_token": access_token,
    }
    if media_url and media_type == "IMAGE":
        container_payload["media_type"] = "IMAGE"
        container_payload["image_url"] = media_url
    elif media_url and media_type == "VIDEO":
        container_payload["media_type"] = "VIDEO"
        container_payload["video_url"] = media_url
    else:
        container_payload["media_type"] = "TEXT"

    resp = await self._http.post(
        f"https://graph.threads.net/v21.0/{threads_user_id}/threads",
        json=container_payload,
    )
    resp.raise_for_status()
    creation_id = resp.json()["id"]

    # Step 2: Poll for processing status (especially for video)
    if media_type == "VIDEO":
        await self._poll_threads_status(creation_id, access_token)

    # Step 3: Publish
    pub_resp = await self._http.post(
        f"https://graph.threads.net/v21.0/{threads_user_id}/threads_publish",
        json={"creation_id": creation_id, "access_token": access_token},
    )
    pub_resp.raise_for_status()
    return pub_resp.json()["id"]  # Published thread ID

async def _poll_threads_status(self, creation_id: str, token: str, timeout_s: int = 120):
    """Poll until Threads media container is FINISHED processing."""
    import asyncio
    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        resp = await self._http.get(
            f"https://graph.threads.net/v21.0/{creation_id}",
            params={"fields": "status,error_message", "access_token": token},
        )
        status = resp.json().get("status")
        if status == "FINISHED":
            return
        if status == "ERROR":
            raise RuntimeError(f"Threads media processing failed: {resp.json()}")
        await asyncio.sleep(5)
    raise TimeoutError("Threads media container processing timed out")
```

### 6.2 TikTok Publisher

Add `publish_tiktok_video()` method:

```python
async def publish_tiktok_video(
    self,
    video_url: str,  # Public Supabase URL
    caption: str,
    privacy_level: str = "PUBLIC_TO_EVERYONE",  # or "MUTUAL_FOLLOW_FRIENDS"
    disable_duet: bool = False,
    disable_stitch: bool = False,
    disable_comment: bool = False,
) -> str:
    """
    Publish a video to TikTok using PULL_FROM_URL method.
    TikTok pulls the video from our Supabase storage URL.
    Returns the publish_id for status tracking.
    """
    # 1. Refresh access token first (expires every 24h)
    fresh_token = await self._refresh_tiktok_token()

    # 2. Initialize video upload
    init_resp = await self._http.post(
        "https://open.tiktokapis.com/v2/video/init/",
        headers={"Authorization": f"Bearer {fresh_token}"},
        json={
            "source_info": {
                "source": "PULL_FROM_URL",
                "video_url": video_url,
            }
        },
    )
    init_resp.raise_for_status()
    data = init_resp.json()
    if data.get("error", {}).get("code") != "ok":
        raise RuntimeError(f"TikTok video init failed: {data}")
    publish_id = data["data"]["publish_id"]

    # 3. Poll for completion
    await self._poll_tiktok_status(publish_id, fresh_token)

    return publish_id

async def _refresh_tiktok_token(self) -> str:
    """Refresh TikTok access token and persist to DB."""
    from app.services.publishing.tiktok_token_service import TikTokTokenService
    svc = TikTokTokenService()
    tokens = svc.refresh_access_token(self.brand_config.tiktok_refresh_token)

    # Persist new tokens to DB
    db = SessionLocal()
    try:
        brand = db.query(Brand).filter(Brand.name == self.brand_config.name).first()
        brand.tiktok_access_token = tokens["access_token"]
        brand.tiktok_access_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])
        if tokens.get("refresh_token"):
            brand.tiktok_refresh_token = tokens["refresh_token"]
        db.commit()
    finally:
        db.close()

    return tokens["access_token"]

async def _poll_tiktok_status(self, publish_id: str, token: str, timeout_s: int = 180):
    """Poll TikTok video processing status."""
    import asyncio
    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        resp = await self._http.post(
            "https://open.tiktokapis.com/v2/video/query/",
            headers={"Authorization": f"Bearer {token}"},
            json={"filters": {"video_ids": [publish_id]}},
        )
        data = resp.json()
        videos = data.get("data", {}).get("videos", [])
        if videos and videos[0].get("status") == "PUBLISH_COMPLETE":
            return
        if videos and videos[0].get("status") == "FAILED":
            raise RuntimeError(f"TikTok video publish failed: {videos[0]}")
        await asyncio.sleep(10)
    raise TimeoutError("TikTok video publishing timed out")
```

### 6.3 Update `publish_reel()` Entry Point

Update the main publishing orchestrator to include new platforms:

```python
async def publish_reel(self, reel: Reel) -> dict:
    results = {}

    if reel.publish_to_instagram and self.brand_config.instagram_access_token:
        results["instagram"] = await self.publish_instagram_image_post(...)

    if reel.publish_to_facebook and self.brand_config.facebook_access_token:
        results["facebook"] = await self.publish_facebook_reel(...)

    if reel.publish_to_youtube and self.brand_config.youtube_channel_id:
        results["youtube"] = await self.publish_youtube_video(...)

    # NEW:
    if reel.publish_to_threads and self.brand_config.threads_access_token:
        results["threads"] = await self.publish_threads_post(
            text=reel.caption,
            media_url=reel.video_url,  # or image_url
            media_type="VIDEO",
        )

    if reel.publish_to_tiktok and self.brand_config.tiktok_refresh_token:
        results["tiktok"] = await self.publish_tiktok_video(
            video_url=reel.video_url,
            caption=reel.caption,
        )

    return results
```

**Also update the `Reel` model** (or scheduling model) to add `publish_to_threads` and `publish_to_tiktok` boolean columns.

---

## 7. Backend — Content Formatting Per Platform

**New file:** `app/core/platform_formatters.py`

Each platform has unique content constraints. This module formats captions and validates content before publishing.

```python
"""
Platform-specific content formatters.
Each platform has unique character limits, hashtag rules, and media requirements.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class FormattedContent:
    text: str
    hashtags: list[str]
    media_type: str  # "video" | "image" | "text"
    warnings: list[str]  # Non-fatal issues


def format_for_instagram(caption: str, hashtags: list[str]) -> FormattedContent:
    """Instagram: 2200 char limit, max 30 hashtags"""
    MAX_CHARS = 2200
    MAX_HASHTAGS = 30
    hashtags = hashtags[:MAX_HASHTAGS]
    tag_string = " ".join(f"#{h}" for h in hashtags)
    combined = f"{caption}\n\n{tag_string}"
    warnings = []
    if len(combined) > MAX_CHARS:
        warnings.append(f"Caption truncated from {len(combined)} to {MAX_CHARS} chars")
        combined = combined[:MAX_CHARS]
    return FormattedContent(combined, hashtags, "video", warnings)


def format_for_facebook(caption: str, hashtags: list[str]) -> FormattedContent:
    """Facebook: 63,206 char limit, hashtags less important"""
    MAX_CHARS = 63206
    tag_string = " ".join(f"#{h}" for h in hashtags[:10])  # Cap at 10 for readability
    combined = f"{caption}\n\n{tag_string}"
    return FormattedContent(combined[:MAX_CHARS], hashtags[:10], "video", [])


def format_for_threads(caption: str, hashtags: list[str]) -> FormattedContent:
    """
    Threads: 500 char HARD limit (including hashtags).
    Threads is text-first — keep it conversational, fewer hashtags.
    Strategy: Use caption first, fill remaining with top hashtags.
    """
    MAX_CHARS = 500
    MAX_HASHTAGS = 5  # Threads community norm — don't spam hashtags

    warnings = []
    hashtags = hashtags[:MAX_HASHTAGS]
    tag_string = " ".join(f"#{h}" for h in hashtags)
    combined = f"{caption}\n\n{tag_string}"

    if len(combined) > MAX_CHARS:
        # Truncate caption to fit, keep hashtags
        available_for_caption = MAX_CHARS - len(tag_string) - 4  # 4 for "\n\n" + buffer
        if available_for_caption < 50:
            # Even with no hashtags, caption is too long
            combined = caption[:MAX_CHARS - 3] + "..."
            warnings.append("Caption truncated to fit Threads 500 char limit")
        else:
            truncated = caption[:available_for_caption - 3] + "..."
            combined = f"{truncated}\n\n{tag_string}"
            warnings.append(f"Caption truncated to fit Threads 500 char limit")

    return FormattedContent(combined, hashtags, "video", warnings)


def format_for_tiktok(caption: str, hashtags: list[str]) -> FormattedContent:
    """
    TikTok: 2200 char limit for caption.
    Hashtags go in caption body — TikTok algorithm reads them.
    Recommend 3-5 relevant hashtags. First few characters matter most.
    """
    MAX_CHARS = 2200
    MAX_HASHTAGS = 8  # TikTok best practice

    hashtags = hashtags[:MAX_HASHTAGS]
    tag_string = " ".join(f"#{h}" for h in hashtags)
    combined = f"{caption}\n\n{tag_string}"

    warnings = []
    if len(combined) > MAX_CHARS:
        combined = combined[:MAX_CHARS - 3] + "..."
        warnings.append("Caption truncated to fit TikTok 2200 char limit")

    return FormattedContent(combined, hashtags, "video", warnings)


def format_for_youtube(caption: str, hashtags: list[str], title: str) -> FormattedContent:
    """YouTube: Description max 5000 chars, title max 100 chars."""
    MAX_DESC = 5000
    tag_string = " ".join(f"#{h}" for h in hashtags[:15])
    combined = f"{caption}\n\n{tag_string}"
    return FormattedContent(combined[:MAX_DESC], hashtags[:15], "video", [])
```

---

## 8. Backend — Toby Agent Update

### 8.1 Publisher Agent

**File:** `app/services/toby/agents/publisher.py`

Update the publisher agent to pass platform flags when calling `social_publisher.publish_reel()`. The agent should check which platforms are connected for a brand and only attempt to publish to those.

```python
# In the publisher agent's publish logic:
platforms_to_publish = []
if brand_config.instagram_access_token:
    platforms_to_publish.append("instagram")
if brand_config.facebook_access_token:
    platforms_to_publish.append("facebook")
if brand_config.youtube_channel_id:
    platforms_to_publish.append("youtube")
if brand_config.threads_access_token:
    platforms_to_publish.append("threads")
if brand_config.tiktok_refresh_token:
    platforms_to_publish.append("tiktok")
```

### 8.2 Orchestrator Scheduling Check

**File:** `app/services/toby/orchestrator.py`

The orchestrator's "buffer check" fills slots. Add Threads and TikTok to the platform consideration logic. No rate limit changes needed — Toby publishes to all connected platforms simultaneously per content piece.

### 8.3 Analytics Tracking

When publishing results are collected, track per-platform publish success/failure in the analytics system. Extend the existing analytics model to accept `threads` and `tiktok` as platform values in any platform-keyed data.

---

## 9. Frontend — Types & API Client

### 9.1 Update Types

**File:** `src/features/brands/types.ts` (or `src/shared/types/`)

```typescript
export interface PlatformConnection {
  connected: boolean
  account_id: string | null
  account_name: string | null
  status: 'connected' | 'not_configured' | 'not_connected' | 'error' | 'revoked'
  last_error: string | null
  token_expires_at: string | null
  token_last_refreshed_at: string | null
}

export interface TikTokConnection extends PlatformConnection {
  access_token_expires_at: string | null
  refresh_token_expires_at: string | null
}

export interface BrandConnectionStatus {
  brand: string
  display_name: string
  color: string
  instagram: PlatformConnection
  facebook: PlatformConnection
  youtube: PlatformConnection
  threads: PlatformConnection    // NEW
  tiktok: TikTokConnection       // NEW
}

export interface OAuthConfigured {
  meta: boolean
  facebook: boolean
  youtube: boolean
  threads: boolean    // NEW
  tiktok: boolean     // NEW
}

export interface BrandConnectionsResponse {
  brands: BrandConnectionStatus[]
  oauth_configured: OAuthConfigured
}
```

### 9.2 Update API Client

**File:** `src/features/brands/api/connections-api.ts`

Add new functions:

```typescript
// Threads
export async function connectThreads(brandId: string, returnTo?: string): Promise<{ auth_url: string }> {
  const params = new URLSearchParams({ brand_id: brandId })
  if (returnTo) params.set('return_to', returnTo)
  return apiClient.get(`/api/auth/threads/connect?${params}`)
}

export async function disconnectThreads(brandId: string): Promise<void> {
  return apiClient.post('/api/auth/threads/disconnect', { brand_id: brandId })
}

export async function refreshThreadsToken(brandId: string): Promise<void> {
  return apiClient.post('/api/auth/threads/refresh', { brand_id: brandId })
}

// TikTok
export async function connectTikTok(brandId: string, returnTo?: string): Promise<{ auth_url: string }> {
  const params = new URLSearchParams({ brand_id: brandId })
  if (returnTo) params.set('return_to', returnTo)
  return apiClient.get(`/api/auth/tiktok/connect?${params}`)
}

export async function disconnectTikTok(brandId: string): Promise<void> {
  return apiClient.post('/api/auth/tiktok/disconnect', { brand_id: brandId })
}
```

---

## 10. Frontend — ConnectionCard UI

**File:** `src/features/brands/components/ConnectionCard.tsx`

### 10.1 Platform Icons

Add platform icons. The current icons pattern uses emoji or SVG. For Threads and TikTok:
- **Threads**: Use the Threads logo SVG (available from Meta's brand kit)
- **TikTok**: Use the TikTok logo SVG

Import as inline SVG components or store in `assets/icons/`.

### 10.2 Updated Card Layout

The card currently shows 3 platform rows (Instagram, Facebook, YouTube). Expand to 5:

```
┌─────────────────────────────────────────────────────┐
│  Brand Header                     3/5 connected     │
└─────────────────────────────────────────────────────┘
│  📸  Instagram    @handle          [Connected] [⟳] [×] │
│  👥  Facebook     Page Name        [Connected] [⟳] [×] │
│  ▶️   YouTube      Channel Name     [Connected] [⟳] [×] │
│  ◻   Threads      @handle          [Connect →]          │
│  🎵  TikTok        @username        [Connect →]          │
└─────────────────────────────────────────────────────┘
│  [Test Meta] [Test YouTube] [Test Threads] [Test TikTok]│
└─────────────────────────────────────────────────────┘
```

### 10.3 TikTok Token Expiry Warning

TikTok access tokens expire every 24 hours. The refresh happens server-side before each publish, but show a UI warning if the **refresh token** expires within 30 days:

```tsx
// In TikTok platform row
{tiktok.connected && tiktok.refresh_token_expires_at && (
  <RefreshTokenWarning expiresAt={tiktok.refresh_token_expires_at} threshold={30} />
)}
```

### 10.4 Threads Token Refresh Button

Same as Instagram — show a refresh button for the Threads 60-day token.

### 10.5 Component Structure

```typescript
// Add to the platforms array in ConnectionCard
const platforms = [
  { key: 'instagram', label: 'Instagram', icon: InstagramIcon, connection: brand.instagram },
  { key: 'facebook', label: 'Facebook', icon: FacebookIcon, connection: brand.facebook },
  { key: 'youtube', label: 'YouTube', icon: YouTubeIcon, connection: brand.youtube },
  { key: 'threads', label: 'Threads', icon: ThreadsIcon, connection: brand.threads,
    canRefreshToken: true, tokenExpiresAt: brand.threads.token_expires_at },
  { key: 'tiktok', label: 'TikTok', icon: TikTokIcon, connection: brand.tiktok,
    expiryWarningField: 'refresh_token_expires_at' },
]
```

---

## 11. Frontend — ConnectionsTab (OAuth Redirect Handler)

**File:** `src/features/brands/components/ConnectionsTab.tsx`

### 11.1 Handle New URL Params

The `ConnectionsTab` parses URL params after OAuth redirects. Add the new platform params:

```typescript
const params = new URLSearchParams(window.location.search)

// Existing
const igSuccess = params.get('ig_connected')
const fbSuccess = params.get('fb_connected')
const ytSuccess = params.get('yt_connected')
const igError = params.get('ig_error')
const fbError = params.get('fb_error')
const ytError = params.get('yt_error')

// NEW
const threadsSuccess = params.get('threads_connected')
const threadsError = params.get('threads_error')
const tiktokSuccess = params.get('tiktok_connected')
const tiktokError = params.get('tiktok_error')
```

### 11.2 Connect Handlers

```typescript
const handleConnectThreads = async (brandId: string) => {
  const { auth_url } = await connectThreads(brandId, 'brands')
  window.location.href = auth_url
}

const handleConnectTikTok = async (brandId: string) => {
  const { auth_url } = await connectTikTok(brandId, 'brands')
  window.location.href = auth_url
}
```

No page-selection modal needed for Threads or TikTok — both are single-account.

---

## 12. Frontend — Onboarding Step 6

**File:** `src/pages/Onboarding.tsx`

### 12.1 Expand Platform Section

The onboarding step 6 currently shows 3 platforms. Update to show all 5. Keep the minimum requirement as **at least one** platform connected.

```tsx
// Platform buttons in onboarding step 6
const platforms = [
  {
    key: 'instagram',
    label: 'Instagram',
    icon: <InstagramIcon />,
    description: 'Reels & photo posts',
    connected: !!connections?.instagram?.connected,
    onConnect: () => handleConnectInstagram(brandId),
  },
  {
    key: 'facebook',
    label: 'Facebook',
    icon: <FacebookIcon />,
    description: 'Reels & page posts',
    connected: !!connections?.facebook?.connected,
    onConnect: () => handleConnectFacebook(brandId),
  },
  {
    key: 'youtube',
    label: 'YouTube',
    icon: <YouTubeIcon />,
    description: 'YouTube Shorts',
    connected: !!connections?.youtube?.connected,
    onConnect: () => handleConnectYouTube(brandId),
  },
  {
    key: 'threads',
    label: 'Threads',
    icon: <ThreadsIcon />,
    description: 'Text + video posts',
    connected: !!connections?.threads?.connected,
    onConnect: () => handleConnectThreads(brandId),
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    icon: <TikTokIcon />,
    description: 'Short-form video',
    connected: !!connections?.tiktok?.connected,
    onConnect: () => handleConnectTikTok(brandId),
  },
]
```

### 12.2 URL Param Handlers

Add to the existing URL param detection block:

```typescript
const threadsSuccess = params.get('threads_connected')
const tiktokSuccess = params.get('tiktok_connected')
const threadsError = params.get('threads_error')
const tiktokError = params.get('tiktok_error')

// In the toast/cleanup block:
if (threadsSuccess) toast.success('Threads connected successfully!')
if (tiktokSuccess) toast.success('TikTok connected successfully!')
if (threadsError) toast.error(`Threads connection failed: ${threadsError}`)
if (tiktokError) toast.error(`TikTok connection failed: ${tiktokError}`)
```

---

## 13. Token Lifecycle & Refresh Strategy

### 13.1 Threads Token (60 days — same as Instagram)

| Stage | Action |
|---|---|
| Issued | OAuth callback stores long-lived token |
| Stored | `brands.threads_access_token`, `brands.threads_token_expires_at` |
| Auto-refresh | `scheduler.py` daily job — if expires within 7 days, refresh |
| Manual refresh | Button in UI → `POST /api/auth/threads/refresh` |
| On publish error | Catch error code 190 → refresh → retry once |
| On expiry | User must re-authorize (reconnect button) |

Add Threads refresh to the existing token refresh scheduler:

```python
# In scheduler.py — existing token refresh job
# Add Threads alongside Instagram:
for brand in brands:
    if brand.threads_token_expires_at:
        days_until_expiry = (brand.threads_token_expires_at - now).days
        if days_until_expiry <= 7:
            new_token_data = threads_token_svc.refresh_long_lived_token(brand.threads_access_token)
            brand.threads_access_token = new_token_data["access_token"]
            brand.threads_token_expires_at = now + timedelta(seconds=new_token_data["expires_in"])
            brand.threads_token_last_refreshed_at = now
```

### 13.2 TikTok Token (Access: 24h, Refresh: 365 days)

| Stage | Action |
|---|---|
| Issued | OAuth callback stores both access + refresh tokens |
| Stored | `brands.tiktok_access_token`, `brands.tiktok_refresh_token`, expiry dates |
| Before publish | Always refresh access token first (do not rely on stored access token) |
| Refresh token rotation | TikTok may rotate the refresh token on each refresh — always store returned refresh token |
| Refresh token expiry | User must re-connect when refresh token expires (365 days) |
| Warning | Show UI warning when refresh token expires within 30 days |

**TikTok refresh pattern** — before every publish:
```python
# Always call this before publishing:
fresh_access_token = await publisher._refresh_tiktok_token()
# Then use fresh_access_token for the API call
```

---

## 14. Validation & Pre-commit Checklist

After implementation, run in order:

```bash
# 1. Validate Python imports
python scripts/validate_api.py --imports

# 2. Full validation (imports + endpoint tests)
python scripts/validate_api.py

# 3. Frontend build
npm run build

# 4. Frontend lint
npm run lint
```

**New modules to add to `CRITICAL_MODULES` in `validate_api.py`:**
```python
"app.api.auth.threads_oauth_routes",
"app.api.auth.tiktok_oauth_routes",
"app.services.publishing.threads_token_service",
"app.services.publishing.tiktok_token_service",
"app.core.platform_formatters",
```

**New endpoints to add to validation tests:**
```python
{"method": "GET", "path": "/api/auth/threads/status?brand_id=test", "auth": True},
{"method": "GET", "path": "/api/auth/tiktok/status?brand_id=test", "auth": True},
{"method": "GET", "path": "/api/auth/threads/connect?brand_id=test", "auth": True},
{"method": "GET", "path": "/api/auth/tiktok/connect?brand_id=test", "auth": True},
```

---

## 15. Implementation Order

Follow this order to avoid breaking changes:

### Phase 1 — Database (No downtime risk)
1. Run `migrations/add_threads_tiktok_columns.sql` in Supabase SQL editor
2. Update `app/models/brands.py` (add new columns)
3. Update `app/core/config.py` (add to BrandConfig)
4. Validate: `python scripts/validate_api.py --imports`

### Phase 2 — Backend Services
5. Create `app/services/publishing/threads_token_service.py`
6. Create `app/services/publishing/tiktok_token_service.py`
7. Create `app/core/platform_formatters.py`
8. Update `app/models/oauth_state.py` (add `code_verifier` column)
9. Run migration for `code_verifier` column

### Phase 3 — Backend Routes
10. Create `app/api/auth/threads_oauth_routes.py`
11. Create `app/api/auth/tiktok_oauth_routes.py`
12. Register routes in `app/main.py`
13. Update `app/api/brands/routes.py` (connections endpoint)
14. Update `scripts/validate_api.py` (add new modules + tests)
15. Validate: `python scripts/validate_api.py`

### Phase 4 — Publisher
16. Update `app/services/publishing/social_publisher.py` (add Threads + TikTok methods)
17. Update Reel/scheduling model (add `publish_to_threads`, `publish_to_tiktok` columns)
18. Update Toby publisher agent

### Phase 5 — Frontend
19. Update `src/features/toby/types.ts` (or connection types file)
20. Update `src/features/brands/api/connections-api.ts`
21. Update `src/features/brands/components/ConnectionCard.tsx`
22. Update `src/features/brands/components/ConnectionsTab.tsx`
23. Update `src/pages/Onboarding.tsx`
24. Build: `npm run build`
25. Lint: `npm run lint`

### Phase 6 — Deploy & Verify
26. Add new env vars to Railway (see admin guide)
27. Push to git → Railway deploys
28. Test OAuth flow end-to-end for both platforms with a sandbox account
29. Test publishing a piece of content to Threads and TikTok

---

## Platform-Specific Notes

### Threads
- **Same Meta App** — just add the Threads product in the Meta Developer Portal. No new app needed.
- **No page selection** — unlike Facebook, Threads is tied to the user's personal Instagram account. One account per user.
- **Text is king** — format captions differently: shorter, more conversational, fewer hashtags.
- **Currently in limited rollout** — check Meta's Threads API availability for your region and app status.

### TikTok
- **Separate developer account** — TikTok has no connection to Meta. Requires separate TikTok for Developers account.
- **App review is REQUIRED for production** — the `video.publish` scope must be approved. This can take 2–4 weeks.
- **Sandbox testing** — during development, test with accounts explicitly added to the app's sandbox users list.
- **PKCE is mandatory** — TikTok requires PKCE (S256 method). The `code_verifier` must be stored server-side between the `connect` and `callback` calls.
- **Video URL must be public** — Supabase storage URLs must be public bucket URLs, not signed URLs. Verify this in storage settings.
- **Privacy settings** — `PUBLIC_TO_EVERYONE` requires app review. During testing, use `SELF_ONLY` or `MUTUAL_FOLLOW_FRIENDS`.
