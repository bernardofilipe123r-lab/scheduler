# Onboarding & Social Media Connection — Production Architecture

**Date:** February 2026  
**Goal:** Bug-free onboarding with production-grade social media OAuth for any user — no admin intervention needed.  
**App Category:** Social media scheduling tool (like Buffer / Later / Hootsuite)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Audit](#2-current-state-audit)
3. [Content DNA (Steps 1–5) — Already Working](#3-content-dna-steps-15--already-working)
4. [Social Media Connection Architecture (Step 6)](#4-social-media-connection-architecture-step-6)
5. [Platform-by-Platform: Going Public](#5-platform-by-platform-going-public)
6. [Admin Manual Steps (One-Time Per Platform)](#6-admin-manual-steps-one-time-per-platform)
7. [Backend Architecture Changes](#7-backend-architecture-changes)
8. [Frontend Architecture Changes](#8-frontend-architecture-changes)
9. [UI Resilience & Edge Cases](#9-ui-resilience--edge-cases)
10. [Adding Future Platforms (Threads, X, TikTok, etc.)](#10-adding-future-platforms-threads-x-tiktok-etc)
11. [Security & Legal Compliance](#11-security--legal-compliance)
12. [Implementation Phases](#12-implementation-phases)
13. [Environment Variables Checklist](#13-environment-variables-checklist)

---

## 1. Executive Summary

### What We Are
A **social media scheduling and content automation app** — like Buffer. We use platform APIs **only** to publish content on behalf of the user. This framing is critical for app review submissions.

### What Needs to Happen

| Area | Current Status | Target |
|------|---------------|--------|
| Content DNA (steps 1–5) | ✅ Working | No changes needed |
| Instagram OAuth | ⚠️ Dev mode (test users only) | Public app — any user can connect |
| Facebook OAuth | ⚠️ Routes exist, missing `APP_ID`/`APP_SECRET` | Public app — any user can connect |
| YouTube OAuth | ✅ Production-ready | Already working |
| OAuth state storage | ❌ In-memory (breaks on restart) | Redis or Supabase-backed |
| UI after OAuth redirect | ⚠️ Works but fragile on refresh | Bulletproof state restoration |
| Multiple IG/FB pages | ❌ No page selector for Facebook | Full page/account selector |
| Wrong-account protection | ❌ Only a dismissible warning | Force re-auth + clear session |
| Future platform support | ❌ Hardcoded per-platform | Pluggable adapter pattern |

---

## 2. Current State Audit

### 2.1 Files Involved

**Backend — OAuth:**
| File | Platform | Status |
|------|----------|--------|
| `app/api/auth/ig_oauth_routes.py` | Instagram | ✅ Implemented, dev mode |
| `app/api/auth/fb_oauth_routes.py` | Facebook | ⚠️ Implemented, missing credentials |
| `app/api/youtube/routes.py` | YouTube | ✅ Production |
| `app/services/publishing/ig_token_service.py` | Instagram | ✅ Token exchange + refresh |
| `app/services/publishing/fb_token_service.py` | Facebook | ✅ Token exchange + pages |
| `app/services/youtube/publisher.py` | YouTube | ✅ Full lifecycle |

**Backend — Models & Publishing:**
| File | Purpose |
|------|---------|
| `app/models/brands.py` | Brand model with all credential columns |
| `app/services/publishing/social_publisher.py` | Publishes to IG/FB using stored tokens |
| `app/services/publishing/scheduler.py` | Proactive IG token refresh before publish |

**Frontend — Onboarding:**
| File | Purpose |
|------|---------|
| `src/pages/Onboarding.tsx` | 6-step wizard (step 6 = platform connections) |
| `src/features/onboarding/use-onboarding-status.ts` | Determines if user needs onboarding |
| `src/features/brands/components/ConnectionCard.tsx` | Connection UI in brand settings |
| `src/features/brands/components/ConnectionsTab.tsx` | Tab handling OAuth redirect params |
| `src/features/brands/api/connections-api.ts` | API calls for connect/disconnect/status |

### 2.2 Bugs & Gaps Found

| Bug/Gap | Severity | Details |
|---------|----------|---------|
| **In-memory OAuth state** | 🔴 Critical | `_oauth_states` dict in IG/FB routes is lost on server restart or multi-instance deploy. If the user authorizes while the server restarts, the callback fails. |
| **Facebook page selector missing in UI** | 🔴 Critical | Backend supports multi-page selection (`/api/auth/facebook/pages` + `/select-page`), but the frontend never renders a page picker. Users with multiple FB pages get stuck. |
| **Facebook credentials not configured** | 🔴 Critical | `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are missing from env vars. FB OAuth will fail at runtime. |
| **Meta app in dev mode** | 🔴 Critical | Instagram/Facebook OAuth only works for test users. Regular users cannot connect. |
| **Wrong-account login** | 🟡 Medium | User clicks "Connect Instagram for BrandX" → Instagram shows whichever account is already logged in the browser. No way to force a different account. Handle mismatch warning is dismissible. |
| **Hard refresh after OAuth** | 🟡 Medium | If user refreshes immediately after OAuth redirect, before `fetchBrandConnections()` completes, the success toast is lost. Connection still works (data is in DB), but UX feels broken. |
| **YouTube quota stored in file** | 🟡 Medium | `youtube_quota.json` is lost on Railway redeploys. Should be in database. |
| **No token encryption at rest** | 🟡 Medium | Access tokens stored as plain text in Supabase. |
| **No visibility-based refetch** | 🟠 Low | When user returns to the tab after OAuth, connection status doesn't auto-refresh until manual action or 30s polling. |

---

## 3. Content DNA (Steps 1–5) — Already Working

### Current Flow (No Changes Needed)

```
Step 1: Brand name, ID, short name     → Brand created in DB
Step 2: Colors, logo, pixel preview     → Brand theme saved
Step 3: Niche, brief, audience, tone    → Auto-saved to NicheConfig
Step 4: Reel examples, hooks, YT titles → Auto-saved to NicheConfig  
Step 5: Post examples, CTAs, citations  → Auto-saved to NicheConfig
```

### Why It Already Works

1. **Persistence:** NicheConfig is auto-saved via debounced mutations every 3 seconds. Before navigating to the next step, `saveNow()` is called to flush pending saves.

2. **Resume on close/return:** If the user closes the browser at step 3 and returns:
   - Auth session is restored from Supabase (localStorage)
   - `onboarding_completed === false` → redirected to `/onboarding`
   - Brand exists → wizard starts at step 3 (not step 1)
   - NicheConfig form loads the saved partial data

3. **Logout/login persistence:** `onboarding_completed` is stored in Supabase `user_metadata`. On login, the flag is checked. If `false`, the user is redirected to `/onboarding` with their saved progress.

### Strength Scoring

| Score | Strength | Can Complete? |
|-------|----------|---------------|
| < 40% (< 5/12) | Basic | ❌ Blocked |
| 40–74% (5–8/12) | Good | ✅ Allowed |
| ≥ 75% (9+/12) | Excellent | ✅ Allowed |

Minimum to unlock: niche name + content brief (>50 chars) + 3 reel examples + brand name + pre-filled CTA = ~6 points → "good". Achievable in ~5 minutes.

---

## 4. Social Media Connection Architecture (Step 6)

### 4.1 Core Rules

1. **At least one platform must be connected** to complete onboarding
2. **Any combination is valid** — only Instagram, only YouTube, all three, etc.
3. **Platforms are independent** — connecting Instagram doesn't require Facebook
4. **Multiple accounts per platform** — user with 10 Instagram pages can connect them to different brands
5. **Disconnect at any time** — after onboarding, users can disconnect/reconnect in brand settings

### 4.2 Proposed Unified OAuth Architecture

Instead of 3 independent route files with duplicated logic, introduce an **adapter pattern**:

```
┌─────────────────────────────────────────────────┐
│            Frontend (Onboarding Step 6)          │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐      │
│  │ Instagram  │ │ Facebook  │ │  YouTube  │      │
│  │  Button    │ │  Button   │ │  Button   │      │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘      │
│        │              │              │            │
│        ▼              ▼              ▼            │
│   GET /api/auth/{platform}/connect?brand_id=X    │
└────────────────────┬────────────────────────────┘
                     │
         ┌───────────▼───────────┐
         │   OAuth State Store   │  ← Supabase table (not in-memory!)
         │  (platform, brand_id, │
         │   user_id, nonce,     │
         │   created_at)         │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │  Platform Adapter     │
         │  ┌─────────────────┐  │
         │  │ InstagramAdapter│  │  → instagram.com/oauth/authorize
         │  │ FacebookAdapter │  │  → facebook.com/v21.0/dialog/oauth
         │  │ YouTubeAdapter  │  │  → accounts.google.com/o/oauth2
         │  │ ThreadsAdapter  │  │  → (future)
         │  │ TikTokAdapter   │  │  → (future)
         │  └─────────────────┘  │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │  /api/auth/{platform} │
         │      /callback        │
         │                       │
         │  1. Validate state    │
         │  2. Exchange code     │
         │  3. Get long-lived    │
         │  4. Fetch account     │
         │  5. Store credentials │
         │  6. Redirect to UI    │
         └───────────────────────┘
```

### 4.3 OAuth State Store — Move to Supabase

**Current problem:** `_oauth_states = {}` in each route file. Lost on restart.

**Solution:** Create an `oauth_states` table in Supabase:

```sql
CREATE TABLE oauth_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state_token VARCHAR(64) UNIQUE NOT NULL,
    platform VARCHAR(20) NOT NULL,         -- 'instagram', 'facebook', 'youtube'
    brand_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL,
    return_to VARCHAR(50) DEFAULT 'brands', -- 'onboarding' or 'brands'
    created_at TIMESTAMPTZ DEFAULT now(),
    used_at TIMESTAMPTZ,                    -- NULL until callback processes it
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Auto-cleanup: delete states older than 15 minutes
CREATE INDEX idx_oauth_states_created ON oauth_states(created_at);
```

**Cleanup:** A periodic task (or DB trigger) deletes rows older than 15 minutes.

**Benefits:**
- Survives server restarts and redeployments
- Works across multiple Railway instances
- Prevents replay attacks (mark `used_at` on callback)
- Audit trail of all OAuth attempts

### 4.4 Platform Adapter Interface

```python
# app/services/oauth/base.py
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, List

@dataclass
class OAuthCredentials:
    """Unified credential result from any platform."""
    platform: str                    # 'instagram', 'facebook', 'youtube'
    account_id: str                  # Platform-specific account/channel ID
    account_name: str                # Display name (@handle or channel name)
    access_token: str                # Long-lived or refresh token
    token_expires_at: Optional[datetime] = None
    extra: dict = field(default_factory=dict)  # Platform-specific extras

@dataclass  
class PageOption:
    """For platforms that require page/account selection."""
    page_id: str
    page_name: str
    page_picture_url: Optional[str] = None

class OAuthAdapter(ABC):
    """Base class for all social media OAuth adapters."""
    
    @property
    @abstractmethod
    def platform_name(self) -> str:
        """e.g., 'instagram', 'facebook', 'youtube'"""
    
    @abstractmethod
    def get_authorization_url(self, state: str) -> str:
        """Generate the OAuth consent URL."""
    
    @abstractmethod
    async def exchange_code(self, code: str) -> OAuthCredentials:
        """Exchange authorization code for credentials."""
    
    async def get_account_options(self, token: str) -> Optional[List[PageOption]]:
        """For platforms with page selection (Facebook). Return None if N/A."""
        return None
    
    async def finalize_selection(self, token: str, page_id: str) -> OAuthCredentials:
        """Called after user selects a page. Default: raise NotImplemented."""
        raise NotImplementedError(f"{self.platform_name} doesn't support page selection")
```

This means adding Threads, X, or TikTok later is just:
1. Create `ThreadsAdapter(OAuthAdapter)` 
2. Register the adapter
3. Add a button in the frontend

No route changes, no new endpoints.

---

## 5. Platform-by-Platform: Going Public

### 5.1 Meta (Instagram + Facebook) — From Dev Mode to Production

#### Current Status
- **App Mode:** Development (test users only)
- **Instagram OAuth:** Routes implemented, scopes correct
- **Facebook OAuth:** Routes implemented, credentials missing from env
- **App Review:** Not submitted

#### What "Going Public" Means for Meta

Meta requires **App Review** before your app can be used by non-test-users. This is a one-time process per app.

**Our app category:** `Business` → subcategory: `Manage content on Pages and Instagram accounts`

This is identical to how Buffer, Later, Hootsuite, and Sprout Social are categorized.

#### Permissions We Need & Justification

| Permission | Why We Need It | Review Required? |
|------------|---------------|-----------------|
| `instagram_business_basic` | Read account info (username, profile) | ✅ Yes |
| `instagram_business_content_publish` | Publish reels and carousels | ✅ Yes |
| `instagram_business_manage_comments` | Read/reply to comments (analytics) | ✅ Yes |
| `instagram_business_manage_insights` | View post performance metrics | ✅ Yes |
| `pages_show_list` | List user's Facebook Pages | ✅ Yes |
| `pages_read_engagement` | Read page engagement metrics | ✅ Yes |
| `pages_manage_posts` | Publish content to Facebook Pages | ✅ Yes |

#### Meta App Review Submission Guide

**Step 1: Prepare the App Dashboard**
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Select your app (or create: Type = `Business`)
3. Add products: **Facebook Login for Business**, **Instagram Graph API**
4. In **Facebook Login → Settings:**
   - Valid OAuth Redirect URIs: `https://scheduler-production-29d4.up.railway.app/api/auth/instagram/callback` AND `https://scheduler-production-29d4.up.railway.app/api/auth/facebook/callback`
   - Deauthorize Callback URL: `https://scheduler-production-29d4.up.railway.app/api/legal/deauthorize`
   - Data Deletion Request URL: `https://scheduler-production-29d4.up.railway.app/api/legal/data-deletion`
5. In **Settings → Basic:**
   - App Domains: `scheduler-production-29d4.up.railway.app`
   - Privacy Policy URL: `https://scheduler-production-29d4.up.railway.app/privacy`
   - Terms of Service URL: `https://scheduler-production-29d4.up.railway.app/terms`
   - App Icon: Upload a 1024×1024 icon
   - Category: "Business and Pages"

**Step 2: Business Verification**
1. Go to **Settings → Business Verification**
2. Provide:
   - Legal business name
   - Business address
   - Business phone number
   - Upload business document (utility bill, bank statement, or business license)
3. Meta verifies in 1–5 business days

**Step 3: Submit for App Review**
1. Go to **App Review → Permissions and Features**
2. For each permission, provide:
   - **What it does:** "Our app is a social media scheduling tool. We use `instagram_business_content_publish` to publish reels, carousels, and image posts on behalf of the user at their scheduled time."
   - **Screencast:** Record a 2-minute video showing:  
     a. User clicks "Connect Instagram" in our app  
     b. Redirected to Facebook Login, grants permissions  
     c. Returned to our app, Instagram shows as connected  
     d. User schedules a post  
     e. Post appears on their Instagram at the scheduled time  
   - **Test instructions:** Provide test account credentials for the reviewer

**Step 4: Go Live**
1. Once approved, toggle app from **Development** → **Live** in App Dashboard
2. Now any Facebook/Instagram user can connect — no test user setup needed

#### Important: Instagram vs. Facebook — Same Meta App, Different Scopes

You only need **ONE** Meta app. The same App ID and App Secret work for both Instagram and Facebook. The difference is which scopes you request during OAuth:

- **Instagram connect:** Request `instagram_business_*` scopes → user grants Instagram permissions
- **Facebook connect:** Request `pages_*` scopes → user grants Facebook Page permissions

Current implementation already does this correctly with separate route files (`ig_oauth_routes.py` and `fb_oauth_routes.py`), each requesting different scopes. This is fine — no need to merge into a single "Meta" route.

**However:** You can optionally use the same `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` for both IG and FB OAuth. The current setup uses `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` for IG and separate `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` for FB. Since they're the same Meta app, you can consolidate to one pair of env vars if you want (optional optimization).

### 5.2 YouTube (Google) — Already Public

#### Current Status
- **App Mode:** ✅ Production
- **OAuth Consent Screen:** ✅ Configured
- **Any user can connect:** ✅ Yes

#### What's Already Working
- OAuth consent screen configured in Google Cloud Console
- Redirect URI registered: `https://scheduler-production-29d4.up.railway.app/api/youtube/callback`
- Scopes: `youtube.upload`, `youtube.readonly`, `youtube.force-ssl`
- Refresh token stored permanently, auto-refreshed before each upload
- Quota monitoring with daily reset

#### Potential Improvement: Google App Verification

Currently, Google OAuth consent screen may show an "unverified app" warning to users. To remove this:

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → OAuth consent screen
2. Submit for verification
3. Provide: privacy policy URL, terms of service URL, authorized domains
4. Google reviews sensitive scopes (`youtube.upload`) — takes 2–6 weeks
5. Once verified, no more "unverified app" warning

**This is optional** — the app works without verification, users just see a warning they can click through.

### 5.3 Future Platforms — What's Needed

| Platform | API Type | OAuth Standard | Key Permission | App Review? |
|----------|----------|---------------|----------------|-------------|
| **Threads** | Meta Graph API | OAuth 2.0 (same Meta app) | `threads_content_publish` | Yes (Meta) |
| **X (Twitter)** | X API v2 | OAuth 2.0 PKCE | `tweet.write` | Yes (elevated access) |
| **TikTok** | TikTok for Developers | OAuth 2.0 | `video.publish` | Yes |
| **LinkedIn** | LinkedIn Marketing API | OAuth 2.0 | `w_member_social` | Yes (partner program) |
| **Pinterest** | Pinterest API | OAuth 2.0 | `pins:write` | Yes |

Each requires a separate developer account and app review, but the same adapter pattern applies.

---

## 6. Admin Manual Steps (One-Time Per Platform)

These are things **you (the admin)** must do once. After this, any user can connect without admin involvement.

### 6.1 Meta (Instagram + Facebook)

| Step | Action | Where | One-Time? |
|------|--------|-------|-----------|
| 1 | Create Meta App (type: Business) | developers.facebook.com | ✅ Yes |
| 2 | Add Facebook Login + Instagram Graph API products | App Dashboard | ✅ Yes |
| 3 | Set redirect URIs for IG + FB callbacks | Facebook Login Settings | ✅ Yes |
| 4 | Set privacy policy + terms URLs | App Settings → Basic | ✅ Yes |
| 5 | Complete Business Verification | App Settings → Verification | ✅ Yes |
| 6 | Submit each permission for App Review | App Review | ✅ Yes |
| 7 | Record screencast demo for each permission | Local → Upload | ✅ Yes |
| 8 | Toggle app to **Live** mode after approval | App Dashboard | ✅ Yes |
| 9 | Set `FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET` in Railway env | Railway Dashboard | ✅ Yes |
| 10 | Set `INSTAGRAM_APP_ID` + `INSTAGRAM_APP_SECRET` in Railway env | Railway Dashboard | ✅ Yes |

**After this, no more admin steps.** Users connect via OAuth like any normal app.

### 6.2 YouTube (Google)

| Step | Action | Where | One-Time? |
|------|--------|-------|-----------|
| 1 | ✅ Already done — OAuth client created | Google Cloud Console | ✅ Done |
| 2 | Optional: Submit for app verification | OAuth consent screen | ✅ Yes |

### 6.3 Future Platform (Template)

| Step | Action |
|------|--------|
| 1 | Create developer account on platform |
| 2 | Create app, set OAuth redirect URI |
| 3 | Apply for required permissions/scopes |
| 4 | Wait for approval |
| 5 | Add env vars to Railway |
| 6 | Create `PlatformAdapter(OAuthAdapter)` class |
| 7 | Register adapter in backend |
| 8 | Add button in frontend |
| 9 | Deploy |

---

## 7. Backend Architecture Changes

### 7.1 OAuth State Store Migration

**Replace in:** `ig_oauth_routes.py`, `fb_oauth_routes.py`, `youtube/routes.py`

**Current (broken):**
```python
_oauth_states: dict[str, dict] = {}  # Lost on restart!
```

**Proposed (resilient):**
```python
# app/services/oauth/state_store.py
from app.db_connection import get_db
from app.models.oauth_state import OAuthState

class OAuthStateStore:
    """Persistent OAuth state backed by Supabase/PostgreSQL."""
    
    @staticmethod
    def create(platform: str, brand_id: str, user_id: str, return_to: str) -> str:
        """Generate state token, store in DB, return token."""
        token = secrets.token_urlsafe(32)
        db = next(get_db())
        state = OAuthState(
            state_token=token,
            platform=platform,
            brand_id=brand_id,
            user_id=user_id,
            return_to=return_to,
        )
        db.add(state)
        db.commit()
        return token
    
    @staticmethod
    def validate(token: str, platform: str) -> Optional[dict]:
        """Validate and consume a state token. Returns None if invalid/expired/used."""
        db = next(get_db())
        state = db.query(OAuthState).filter(
            OAuthState.state_token == token,
            OAuthState.platform == platform,
            OAuthState.used_at.is_(None),
            OAuthState.created_at > datetime.now(timezone.utc) - timedelta(minutes=15),
        ).first()
        
        if not state:
            return None
        
        # Mark as used (prevent replay)
        state.used_at = datetime.now(timezone.utc)
        db.commit()
        
        return {
            "brand_id": state.brand_id,
            "user_id": state.user_id,
            "return_to": state.return_to,
        }
    
    @staticmethod
    def cleanup():
        """Delete states older than 1 hour."""
        db = next(get_db())
        cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
        db.query(OAuthState).filter(OAuthState.created_at < cutoff).delete()
        db.commit()
```

### 7.2 Token Encryption at Rest

Access tokens in the database should be encrypted. Use Fernet symmetric encryption with a key stored in Railway env vars:

```python
# app/services/oauth/token_encryption.py
from cryptography.fernet import Fernet
import os

_KEY = os.environ.get("TOKEN_ENCRYPTION_KEY")  # Generate with Fernet.generate_key()

def encrypt_token(token: str) -> str:
    if not _KEY:
        return token  # Fallback: no encryption in dev
    f = Fernet(_KEY.encode())
    return f.encrypt(token.encode()).decode()

def decrypt_token(encrypted: str) -> str:
    if not _KEY:
        return encrypted
    f = Fernet(_KEY.encode())
    return f.decrypt(encrypted.encode()).decode()
```

Apply to all token writes/reads in the Brand model.

### 7.3 YouTube Quota — Move to Database

Replace `youtube_quota.json` with a database table:

```sql
CREATE TABLE youtube_quota (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,          -- Resets daily
    units_used INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT now()
);
```

This survives Railway redeployments.

### 7.4 Force Re-Auth Parameter

Add `auth_type=rerequest` (Meta) and `prompt=consent` (Google) to force the user to re-authenticate, preventing wrong-account connections:

**Instagram:**
```python
# In ig_oauth_routes.py, add to authorization URL:
params["auth_type"] = "rerequest"  # Forces re-login on Instagram
```

**Facebook:**
```python
# In fb_oauth_routes.py, add to authorization URL:
params["auth_type"] = "rerequest"
```

**YouTube (already correct):**
```python
# Already uses prompt=consent+select_account in publisher.py
prompt = "consent select_account"  # Forces channel selection
```

This is the key fix for the "user is already logged into the wrong account" problem. `auth_type=rerequest` tells Meta to show the login screen even if the user has an active session, so they can switch accounts. YouTube's `select_account` already does this.

---

## 8. Frontend Architecture Changes

### 8.1 Platform Connection Component — Pluggable Design

```tsx
// src/features/onboarding/components/PlatformConnector.tsx

interface PlatformConfig {
  id: string                    // 'instagram', 'facebook', 'youtube'
  name: string                  // 'Instagram'
  icon: React.ReactNode         // <InstagramIcon />
  color: string                 // 'bg-gradient-to-r from-purple-500 to-pink-500'
  connectFn: (brandId: string, returnTo: string) => Promise<string>
  disconnectFn: (brandId: string) => Promise<void>
  requiresPageSelection?: boolean  // true for Facebook
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    icon: <InstagramIcon />,
    color: 'bg-gradient-to-r from-purple-500 to-pink-500',
    connectFn: connectInstagram,
    disconnectFn: disconnectInstagram,
  },
  {
    id: 'facebook', 
    name: 'Facebook',
    icon: <FacebookIcon />,
    color: 'bg-blue-600',
    connectFn: connectFacebook,
    disconnectFn: disconnectFacebook,
    requiresPageSelection: true,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: <YouTubeIcon />,
    color: 'bg-red-600',
    connectFn: connectYouTube,
    disconnectFn: disconnectYouTube,
  },
]
```

Adding a new platform = add one entry to the `PLATFORMS` array + create the API functions. No changes to the component logic.

### 8.2 Facebook Page Selector Modal

**Must implement — currently missing in the frontend:**

```tsx
// src/features/brands/components/FacebookPageSelector.tsx

interface FacebookPage {
  id: string
  name: string
  picture_url?: string
}

function FacebookPageSelector({ brandId, onSelect, onCancel }) {
  const [pages, setPages] = useState<FacebookPage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFacebookPages(brandId).then(setPages).finally(() => setLoading(false))
  }, [brandId])

  return (
    <Modal>
      <h3>Select a Facebook Page</h3>
      <p>Choose which page to connect for publishing:</p>
      {pages.map(page => (
        <button key={page.id} onClick={() => onSelect(page.id)}>
          <img src={page.picture_url} />
          <span>{page.name}</span>
        </button>
      ))}
    </Modal>
  )
}
```

The backend already supports this (`/api/auth/facebook/pages` + `/api/auth/facebook/select-page`). Just the UI is missing.

### 8.3 OAuth Return Handling — Bulletproof

**Problem:** If user refreshes immediately after OAuth redirect, the success state can be lost.

**Solution:** Don't rely on URL params for state — always fetch from backend:

```tsx
// Improved OAuth return handling
useEffect(() => {
  if (step !== 6 || !brandId) return

  // 1. Check URL params (from OAuth redirect)
  const params = new URLSearchParams(window.location.search)
  const justConnected = params.get('ig_connected') || params.get('fb_connected') || params.get('yt_connected')
  const error = params.get('ig_error') || params.get('fb_error') || params.get('yt_error')

  // 2. Clean URL immediately (before any async work)
  if (justConnected || error) {
    const url = new URL(window.location.href)
    ;['ig_connected', 'fb_connected', 'yt_connected', 'ig_error', 'fb_error', 'yt_error'].forEach(p => url.searchParams.delete(p))
    window.history.replaceState({}, '', url.pathname)
  }

  // 3. Show toast if just connected
  if (justConnected) toast.success(`Platform connected!`)
  if (error) toast.error(`Connection failed: ${decodeURIComponent(error)}`)

  // 4. ALWAYS fetch actual status from backend (source of truth)
  fetchBrandConnections().then(updateConnectionState)
}, [step, brandId])
```

**Key principle:** The URL param is only for showing a toast. The actual connection state is always fetched from the backend. This makes refreshes harmless.

### 8.4 Tab Focus Auto-Refetch

When the user switches back to the tab after completing OAuth in another tab:

```tsx
// In ConnectionsTab or Onboarding Step 6
useEffect(() => {
  const handleFocus = () => {
    // User came back to this tab — maybe they just completed OAuth
    queryClient.invalidateQueries({ queryKey: ['brand-connections'] })
  }
  window.addEventListener('focus', handleFocus)
  return () => window.removeEventListener('focus', handleFocus)
}, [])
```

### 8.5 "Complete Setup" Validation

The "Complete Setup" button should only be enabled when at least one platform is connected:

```tsx
const anyPlatformConnected = igConnected || fbConnected || ytConnected

<Button
  disabled={!anyPlatformConnected}
  onClick={handleCompleteOnboarding}
>
  Complete Setup
</Button>

{!anyPlatformConnected && (
  <p className="text-sm text-amber-600 mt-2">
    Connect at least one social media platform to continue
  </p>
)}
```

This is already partially implemented but should be verified for all three platforms.

---

## 9. UI Resilience & Edge Cases

### 9.1 Wrong Account Protection

**Problem:** User clicks "Connect Instagram for BrandX" → browser already has an Instagram session for their personal account → connects wrong account.

**Solution (Multi-Layer):**

1. **Force re-auth on OAuth redirect** (backend): Add `auth_type=rerequest` to Meta URLs, already using `prompt=select_account` for Google. This forces a fresh login screen.

2. **Pre-connect warning** (frontend): Already implemented in `ConnectionCard.tsx` with confirm dialog. Enhance the message:
   ```
   "You'll be redirected to Instagram. Please log into the account 
    you want to use for [BrandName]. If you're logged into a 
    different account, you'll be asked to switch."
   ```

3. **Post-connect verification** (frontend): After connecting, show the connected account name prominently. If it doesn't match, show a clear "Wrong account? Disconnect and try again" action.

### 9.2 Multiple Accounts Per Platform

| Scenario | Supported? | How |
|----------|------------|-----|
| 10 Instagram accounts, 0 YouTube | ✅ Yes | Each brand gets its own IG connection |
| Same IG account on 2 brands | ⚠️ Allowed but warned | Handle mismatch warning shows |
| 1 YouTube channel on 2 brands | ❌ Blocked | Backend enforces uniqueness per channel |
| 5 Facebook pages from same user | ✅ Yes | Page selector lets user pick per brand |

### 9.3 Refresh/Back Button Safety

| User Action | Expected Behavior | Implementation |
|-------------|-------------------|----------------|
| Hard refresh after OAuth return | Connection persists, toast gone (OK) | Fetch from backend, not URL |
| Back button after OAuth | Stays on current page, no re-auth | `replaceState()` removes OAuth URL |
| Close tab during OAuth consent | On return, stays on step 6, no connection | Backend state expires after 15 min |
| OAuth callback server error | User sees error toast, can retry | Error param in redirect URL |
| Network offline after OAuth | Toast shows "offline", retry on reconnect | React Query retry logic |

### 9.4 Loading States

Every connection action should show a clear loading state:

```
[Connecting Instagram...] ← spinner visible, button disabled
      ↓ (redirect to Instagram)
      ↓ (return from Instagram)
[Verifying connection...] ← spinner while fetching status
      ↓
[✅ Connected as @handle] ← success state
```

### 9.5 Facebook Page Selection Flow

```
User clicks "Connect Facebook"
      ↓
Redirected to Facebook login
      ↓
Returns to app with fb_select_page=brandId
      ↓
Frontend detects param → opens PageSelector modal
      ↓
Modal fetches GET /api/auth/facebook/pages?brand_id=X
      ↓
User selects a page
      ↓
Frontend calls POST /api/auth/facebook/select-page {brand_id, page_id}
      ↓
Backend stores page credentials
      ↓
Modal closes, status refreshes, shows "Connected to PageName"
```

**Edge case:** If user has only 1 Facebook page, backend auto-selects it and redirects with `fb_connected=brandId` (no modal needed).

---

## 10. Adding Future Platforms (Threads, X, TikTok, etc.)

### Backend: Add an Adapter

```python
# app/services/oauth/threads_adapter.py
class ThreadsAdapter(OAuthAdapter):
    platform_name = "threads"
    
    def get_authorization_url(self, state: str) -> str:
        return f"https://threads.net/oauth/authorize?..." 
    
    async def exchange_code(self, code: str) -> OAuthCredentials:
        # Exchange code → token
        ...
```

### Backend: Register the Adapter

```python
# app/services/oauth/registry.py
ADAPTERS = {
    "instagram": InstagramAdapter(),
    "facebook": FacebookAdapter(),
    "youtube": YouTubeAdapter(),
    # Future:
    # "threads": ThreadsAdapter(),
    # "tiktok": TikTokAdapter(),
    # "x": XAdapter(),
}
```

### Backend: Generic Routes (Optional Refactor)

```python
# app/api/auth/oauth_routes.py
@router.get("/api/auth/{platform}/connect")
async def connect_platform(platform: str, brand_id: str, ...):
    adapter = ADAPTERS.get(platform)
    if not adapter:
        raise HTTPException(404, f"Platform '{platform}' not supported")
    state = OAuthStateStore.create(platform, brand_id, user_id, return_to)
    return {"auth_url": adapter.get_authorization_url(state)}

@router.get("/api/auth/{platform}/callback")
async def oauth_callback(platform: str, code: str, state: str, ...):
    adapter = ADAPTERS.get(platform)
    state_data = OAuthStateStore.validate(state, platform)
    credentials = await adapter.exchange_code(code)
    # Store credentials in brand...
```

### Frontend: Add to Platform Array

```tsx
// Just add one entry:
PLATFORMS.push({
  id: 'threads',
  name: 'Threads',
  icon: <ThreadsIcon />,
  color: 'bg-black',
  connectFn: connectThreads,
  disconnectFn: disconnectThreads,
})
```

### Database: Add Columns

```sql
ALTER TABLE brands
ADD COLUMN IF NOT EXISTS threads_access_token TEXT,
ADD COLUMN IF NOT EXISTS threads_account_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS threads_handle VARCHAR(100);
```

**Total effort to add a new platform:** ~2–4 hours (mostly understanding the specific platform's OAuth docs).

---

## 11. Security & Legal Compliance

### 11.1 Our App's Identity to Platforms

We present ourselves as a **social media scheduling tool**. Here's exactly what each platform sees:

| Platform | App Category | What We Use | What We Don't Use |
|----------|-------------|-------------|-------------------|
| Meta | Business — Content Scheduling | Publish reels/carousels/posts on schedule | No data scraping, no messaging, no ads |
| YouTube | Content Upload Tool | Upload Shorts + set thumbnails | No comments, no livestreaming, no analytics scraping |

This is truthful and compliant. The AI content generation happens locally — platforms don't see or interact with it. The only API interaction is: **upload media + set caption/description at scheduled time**.

### 11.2 Required Legal Pages

These must exist at publicly accessible URLs before Meta App Review:

| Page | URL | Status |
|------|-----|--------|
| Privacy Policy | `/privacy` | Needs to be created/verified |
| Terms of Service | `/terms` | Needs to be created/verified |
| Data Deletion Instructions | `/api/legal/data-deletion` | Backend route exists |
| Deauthorization Callback | `/api/legal/deauthorize` | Backend route exists |

**Privacy Policy must cover:**
- What data we collect (account IDs, access tokens, content metadata)
- How we store it (encrypted in Supabase PostgreSQL)
- How long we retain it (until user disconnects or deletes account)
- Who has access (only the user and automated publishing system)
- How to request deletion (disconnect platform or delete account)

### 11.3 Token Security

| Requirement | Status | Action |
|-------------|--------|--------|
| Tokens never sent to frontend | ✅ Done | Backend-only storage |
| Tokens not logged in production | ⚠️ Verify | Audit all `logger.info()` calls for token content |
| Tokens encrypted at rest | ❌ Not yet | Add Fernet encryption (see §7.2) |
| OAuth callback uses HTTPS | ✅ Done | Railway provides HTTPS |
| State token validates CSRF | ✅ Done | State param checked on callback |
| State token single-use | ❌ Not yet | Move to DB store with `used_at` flag |

### 11.4 Data Handling

- **We only store what we need:** account ID, access token, display name
- **We never store:** passwords, payment info, personal messages, follower lists
- **Tokens are scoped:** Each token only has permissions for publishing
- **User can disconnect at any time:** Clears all stored credentials for that platform
- **Account deletion:** Removes all brand data including tokens from our database

---

## 12. Implementation Phases

### Phase 1: Fix Critical Bugs (1–2 days)

- [ ] **Add Facebook credentials** — Set `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` in Railway env
- [ ] **Migrate OAuth state to Supabase** — Replace in-memory `_oauth_states` in all three route files with DB-backed store
- [ ] **Add `auth_type=rerequest`** to Instagram and Facebook OAuth URLs to force fresh login
- [ ] **Build Facebook page selector modal** — Frontend component that calls `/api/auth/facebook/pages` and `/select-page`
- [ ] **Fix OAuth return handling** — Always fetch status from backend, don't rely on URL params alone
- [ ] **Add `window.focus` refetch** — Auto-refetch connection status when tab regains focus

### Phase 2: Go Public with Meta (3–7 days)

- [ ] **Create/configure Meta App** (if not already Business type)
- [ ] **Set redirect URIs** for both Instagram and Facebook callbacks
- [ ] **Create Privacy Policy page** at `/privacy`
- [ ] **Create Terms of Service page** at `/terms`
- [ ] **Complete Business Verification** on Meta
- [ ] **Record screencast demos** for each permission
- [ ] **Submit for App Review** — all 7 permissions
- [ ] **Wait for approval** (2–5 business days)
- [ ] **Toggle to Live mode** after approval

### Phase 3: Harden & Polish (2–3 days)

- [ ] **Add token encryption at rest** — Fernet encryption for all stored tokens
- [ ] **Move YouTube quota to database** — Replace `youtube_quota.json`
- [ ] **Audit token logging** — Ensure no tokens appear in production logs
- [ ] **Add connected-account display** — Show account name/handle prominently after connection
- [ ] **Add "wrong account" quick-disconnect** — One-click to disconnect and retry
- [ ] **Test all edge cases** — refresh, back button, multiple pages, account switching
- [ ] **Optional: Submit Google app for verification** — Remove "unverified app" warning

### Phase 4: Scalable Architecture (Future)

- [ ] **Implement adapter pattern** — Refactor platform-specific routes into pluggable adapters
- [ ] **Create generic OAuth routes** — Single `/api/auth/{platform}/connect` and `/callback`
- [ ] **Add platform registry** — Register adapters declaratively
- [ ] **Add first new platform** (Threads, TikTok, or X) using the new pattern

---

## 13. Environment Variables Checklist

### Currently Required (Railway)

```env
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...                        # Anon/publishable key
SUPABASE_SERVICE_KEY=eyJ...                # Service role key (backend)

# Instagram OAuth (Meta)
INSTAGRAM_APP_ID=264539962542...
INSTAGRAM_APP_SECRET=c919b803be...
INSTAGRAM_REDIRECT_URI=https://scheduler-production-29d4.up.railway.app/api/auth/instagram/callback

# Facebook OAuth (Meta — same app, different scopes)
FACEBOOK_APP_ID=<same as IG or separate>   # ❌ MISSING — ADD THIS
FACEBOOK_APP_SECRET=<same as IG or sep>    # ❌ MISSING — ADD THIS  
FACEBOOK_REDIRECT_URI=https://scheduler-production-29d4.up.railway.app/api/auth/facebook/callback

# YouTube OAuth (Google)
YOUTUBE_CLIENT_ID=474229192527-r7pkq...
YOUTUBE_CLIENT_SECRET=GOCSPX-tCf4dBO...
YOUTUBE_REDIRECT_URI=https://scheduler-production-29d4.up.railway.app/api/youtube/callback

# App
SITE_URL=https://scheduler-production-29d4.up.railway.app
DATABASE_URL=postgres://...
```

### To Add (New)

```env
# Token encryption (generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
TOKEN_ENCRYPTION_KEY=<generated-key>
```

### Platform Dashboard Redirect URIs to Configure

| Platform | Dashboard | Redirect URI |
|----------|-----------|-------------|
| Instagram | developers.facebook.com → Facebook Login Settings | `https://scheduler-production-29d4.up.railway.app/api/auth/instagram/callback` |
| Facebook | developers.facebook.com → Facebook Login Settings | `https://scheduler-production-29d4.up.railway.app/api/auth/facebook/callback` |
| YouTube | console.cloud.google.com → OAuth 2.0 Client | `https://scheduler-production-29d4.up.railway.app/api/youtube/callback` |

---

## Summary

The onboarding system is 95% complete. Content DNA works perfectly with full persistence. The remaining work is:

1. **Fix 3 critical bugs** (OAuth state, FB page selector, FB credentials)
2. **Submit Meta App Review** (one-time admin task, then any user can connect)
3. **Harden the UI** (force re-auth, bulletproof refresh handling, focus refetch)
4. **Optional future:** Refactor to pluggable adapter pattern for easy platform additions

The app is a legitimate social media scheduling tool. Presenting it correctly to Meta and Google during app review is straightforward — we only use their APIs for content publishing, which is a well-understood and approved use case.
