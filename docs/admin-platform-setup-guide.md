# Admin Platform Setup Guide

Step-by-step instructions for configuring Instagram, Facebook, and YouTube OAuth so that users can connect their social accounts through the app.

All three platforms use the same Meta Developer App for Instagram and Facebook, and a Google Cloud project for YouTube.

---

## Table of Contents

1. [Meta App Setup (Instagram + Facebook)](#1-meta-app-setup-instagram--facebook)
2. [Instagram OAuth Configuration](#2-instagram-oauth-configuration)
3. [Facebook OAuth Configuration](#3-facebook-oauth-configuration)
4. [YouTube (Google) OAuth Configuration](#4-youtube-google-oauth-configuration)
5. [Railway Environment Variables](#5-railway-environment-variables)
6. [Going Live: App Review & Verification](#6-going-live-app-review--verification)
7. [Testing Checklist](#7-testing-checklist)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Meta App Setup (Instagram + Facebook)

Both Instagram and Facebook OAuth use the **same Meta App**. You only create one app.

### 1.1 Create a Meta App

1. Go to **[Meta for Developers](https://developers.facebook.com/)**
2. Click **My Apps** (top right) → **Create App**
3. Choose app type: **Business**
4. Fill in:
   - **App Name**: `ViralToby` (or your preferred name)
   - **App Contact Email**: your business email
   - **Business Portfolio**: select your Meta Business account (create one if needed)
5. Click **Create App**

### 1.2 Add Products to the App

From your app dashboard:

1. Click **Add Product** in the left sidebar
2. Add **Facebook Login for Business** → click **Set Up**
3. Add **Instagram API with Instagram Login** → click **Set Up**

### 1.3 Configure Basic Settings

Go to **App Settings** → **Basic**:

1. **App Domains**: Add your production domain:
   ```
   viraltoby.com
   ```
2. **Privacy Policy URL**: A valid, publicly accessible URL. Example:
   ```
   https://viraltoby.com/privacy
   ```
3. **Terms of Service URL**: A valid, publicly accessible URL. Example:
   ```
   https://viraltoby.com/terms
   ```
4. **App Icon**: Upload a 1024×1024 app icon
5. **Category**: Select `Business and Pages`

6. Note down the **App ID** and **App Secret** (click "Show" to reveal). You'll need these for Railway.

### 1.4 Configure OAuth Redirect URIs

Go to **Facebook Login for Business** → **Settings** in the left sidebar:

1. **Valid OAuth Redirect URIs** — add BOTH:
   ```
   https://viraltoby.com/api/auth/instagram/callback
   https://viraltoby.com/api/auth/facebook/callback
   ```
2. **Deauthorize Callback URL** (optional):
   ```
   https://viraltoby.com/api/auth/deauthorize
   ```
3. **Data Deletion Request URL** (required for App Review):
   ```
   https://viraltoby.com/api/auth/data-deletion
   ```
4. Set **Login with the JavaScript SDK** to **No**
5. Set **Force Web OAuth Reauthentication** to **Yes**

### 1.5 Add Test Users (For Development Mode)

While the app is in **Development Mode**, only admin/developer/tester accounts can use OAuth:

1. Go to **App Roles** → **Roles**
2. Click **Add People**
3. Add each tester's Facebook account email
4. They must accept the invitation from their Facebook notifications
5. Alternative: Go to **App Roles** → **Test Users** → **Add** to create test accounts

> **Important**: In Development Mode, only people listed here can complete the OAuth flow. Regular users will see "App Not Setup" errors.

---

## 2. Instagram OAuth Configuration

### 2.1 Required Permissions

The app requests these Instagram scopes:
- `instagram_basic` — read profile info
- `instagram_content_publish` — publish posts
- `instagram_manage_comments` — manage comments (optional)
- `instagram_manage_insights` — read insights/analytics
- `pages_show_list` — list connected Facebook Pages
- `pages_read_engagement` — read page engagement

### 2.2 Environment Variables for Instagram

```
INSTAGRAM_APP_ID=<your Meta App ID>
INSTAGRAM_APP_SECRET=<your Meta App Secret>
INSTAGRAM_REDIRECT_URI=https://viraltoby.com/api/auth/instagram/callback
```

> **Note**: `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` are the exact same values as the Meta App ID and App Secret from section 1.3. Instagram uses Facebook Login under the hood.

### 2.3 How it Works

1. User clicks **Connect Instagram** → app redirects to `https://www.instagram.com/oauth/authorize?...`
2. User logs in to Instagram and clicks **Allow**
3. Instagram redirects to `/api/auth/instagram/callback` with an authorization code
4. Backend exchanges code → short-lived token → long-lived token (60-day)
5. Backend stores the long-lived token on the brand record
6. A background job auto-refreshes the token every 6 hours (before it expires)

---

## 3. Facebook OAuth Configuration

### 3.1 Required Permissions

The app requests these Facebook scopes:
- `pages_show_list` — list user's managed Pages
- `pages_read_engagement` — read page engagement
- `pages_manage_posts` — publish to Facebook Pages
- `pages_read_user_content` — read page content

### 3.2 Environment Variables for Facebook

```
FACEBOOK_APP_ID=<your Meta App ID>
FACEBOOK_APP_SECRET=<your Meta App Secret>
FACEBOOK_REDIRECT_URI=https://viraltoby.com/api/auth/facebook/callback
```

> **Note**: These are typically the **same** App ID and App Secret as Instagram (section 1.3), since both use the same Meta App. However, the code reads them from separate env vars, so set both pairs.

### 3.3 How it Works

1. User clicks **Connect Facebook** → app redirects to `https://www.facebook.com/v21.0/dialog/oauth?...`
2. User logs in to Facebook and authorizes access
3. Facebook redirects to `/api/auth/facebook/callback` with an authorization code
4. Backend exchanges code → short-lived token → long-lived user token (60-day)
5. Backend fetches the user's managed Facebook Pages
6. **If 1 page**: auto-selects it, stores page access token, redirects with `?fb_connected=brandId`
7. **If multiple pages**: redirects to `?fb_select_page=brandId` → frontend shows a page picker UI
8. User picks a page → frontend calls `POST /api/auth/facebook/select-page` → stores page token

### 3.4 Facebook API Version

The code defaults to API version `v21.0`. To change this, set the `FB_API_VERSION` environment variable:
```
FB_API_VERSION=v21.0
```

---

## 4. YouTube (Google) OAuth Configuration

### 4.1 Create a Google Cloud Project

1. Go to **[Google Cloud Console](https://console.cloud.google.com/)**
2. Click the project selector (top bar) → **New Project**
3. Name: `ViralToby` (or your preferred name)
4. Click **Create**

### 4.2 Enable YouTube Data API v3

1. In the project, go to **APIs & Services** → **Library**
2. Search for **YouTube Data API v3**
3. Click on it → click **Enable**

### 4.3 Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** user type → **Create**
3. Fill in the required fields:
   - **App name**: `ViralToby`
   - **User support email**: your email
   - **App logo**: upload your app logo (optional but recommended for verified apps)
   - **App domain**: 
     - **Application home page**: `https://viraltoby.com`
     - **Application privacy policy link**: `https://viraltoby.com/privacy`
     - **Application terms of service link**: `https://viraltoby.com/terms`
   - **Authorized domains**: Add `up.railway.app`
   - **Developer contact email**: your email
4. Click **Save and Continue**

### 4.4 Add Scopes

1. Click **Add or Remove Scopes**
2. Find and select these scopes:
   - `https://www.googleapis.com/auth/youtube.upload` — upload videos
   - `https://www.googleapis.com/auth/youtube.readonly` — read channel info
   - `https://www.googleapis.com/auth/youtube.force-ssl` — manage videos (edit titles, descriptions)
3. Click **Update** → **Save and Continue**

### 4.5 Add Test Users (For Development/Testing)

While the app is in **Testing** status (not yet verified):

1. On the OAuth consent screen page, scroll to **Test users**
2. Click **Add Users**
3. Enter the Gmail addresses of each tester (max 100 test users)
4. These users can complete the OAuth flow even before Google verification

> **Important**: Unverified apps show a "Google hasn't verified this app" warning screen. Test users can click "Continue" to proceed. Once verified, this warning disappears.

### 4.6 Create OAuth Client Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `ViralToby`
5. **Authorized redirect URIs** — add:
   ```
   https://viraltoby.com/api/youtube/callback
   ```
6. Click **Create**
7. Note down the **Client ID** and **Client Secret**

### 4.7 Environment Variables for YouTube

```
YOUTUBE_CLIENT_ID=<your Google OAuth Client ID>
YOUTUBE_CLIENT_SECRET=<your Google OAuth Client Secret>
YOUTUBE_REDIRECT_URI=https://viraltoby.com/api/youtube/callback
```

### 4.8 How it Works

1. User clicks **Connect YouTube** → app redirects to `https://accounts.google.com/o/oauth2/v2/auth?...`
2. User selects their Google account and authorizes
3. Google redirects to `/api/youtube/callback` with an authorization code
4. Backend exchanges code for access token + **refresh token**
5. Refresh token is stored in `youtube_channels` table — it never expires (unless user revokes)
6. For each upload, the backend uses the refresh token to mint a fresh short-lived access token

---

## 5. Railway Environment Variables

Set all of these in your **Railway** project dashboard under **Variables**:

### Meta (Instagram + Facebook)

| Variable | Value | Notes |
|----------|-------|-------|
| `INSTAGRAM_APP_ID` | `<Meta App ID from 1.3>` | Same as your Meta App ID |
| `INSTAGRAM_APP_SECRET` | `<Meta App Secret from 1.3>` | Same as your Meta App Secret |
| `INSTAGRAM_REDIRECT_URI` | `https://viraltoby.com/api/auth/instagram/callback` | Must match exactly what's in Meta app settings |
| `FACEBOOK_APP_ID` | `<Meta App ID from 1.3>` | Same value as INSTAGRAM_APP_ID |
| `FACEBOOK_APP_SECRET` | `<Meta App Secret from 1.3>` | Same value as INSTAGRAM_APP_SECRET |
| `FACEBOOK_REDIRECT_URI` | `https://viraltoby.com/api/auth/facebook/callback` | Must match exactly what's in Meta app settings |
| `FB_API_VERSION` | `v21.0` | Optional — defaults to v21.0 |

### YouTube (Google)

| Variable | Value | Notes |
|----------|-------|-------|
| `YOUTUBE_CLIENT_ID` | `<Google OAuth Client ID from 4.6>` | From Google Cloud Console |
| `YOUTUBE_CLIENT_SECRET` | `<Google OAuth Client Secret from 4.6>` | From Google Cloud Console |
| `YOUTUBE_REDIRECT_URI` | `https://viraltoby.com/api/youtube/callback` | Must match exactly what's in Google Cloud Console |

### General

| Variable | Value | Notes |
|----------|-------|-------|
| `SITE_URL` | `https://viraltoby.com` | Used for OAuth redirect base URL. No trailing slash. |

---

## 6. Going Live: App Review & Verification

### 6.1 Meta App Review (Instagram + Facebook)

While in **Development Mode**, only test users can use OAuth. To allow any user to connect:

1. Go to your Meta App Dashboard → **App Review** → **Requests**
2. Click **Request Permissions or Features**
3. Request these permissions:

| Permission | Why it's needed | Verification |
|---|---|---|
| `instagram_basic` | Read the user's Instagram profile info | Screencast showing the connection flow |
| `instagram_content_publish` | Publish carousel posts and reels to Instagram | Screencast showing a post being published |
| `pages_show_list` | List user's Facebook Pages during connection | Screencast showing page list |
| `pages_manage_posts` | Publish posts to Facebook Pages | Screencast showing a post being published |
| `pages_read_engagement` | Read engagement metrics for analytics | Screencast showing analytics dashboard |

4. For each permission, Meta requires:
   - A **screencast** (video recording) showing how the permission is used
   - A **description** of why you need it
   - Your **Privacy Policy URL** and **Terms of Service URL** must be valid and publicly accessible

5. Click **Submit for Review** → Meta typically reviews within 1-5 business days

6. Once approved, go to **App Settings** → **Basic** → switch **App Mode** from `Development` to `Live`

### 6.2 Meta Business Verification (if required)

Meta may require Business Verification for certain permissions:

1. Go to **[Meta Business Suite](https://business.facebook.com/)** → **Settings** → **Business Verification**
2. Submit business documents:
   - Business registration/incorporation certificate
   - Tax filing document
   - Utility bill showing business address
3. Verification typically takes 2-5 business days

### 6.3 Google App Verification (YouTube)

While in **Testing** mode, only test users (added in 4.5) can use OAuth. To allow any user:

1. Go to **Google Cloud Console** → **APIs & Services** → **OAuth consent screen**
2. Click **Publish App**
3. Google will review because you request sensitive scopes (`youtube.upload`)
4. Required for verification:
   - **Privacy Policy URL** must be valid and publicly accessible
   - **Terms of Service URL** must be valid and publicly accessible
   - **Homepage** must be valid
   - A **YouTube video** demonstrating how OAuth is used (upload to YouTube, make unlisted)
   - A **written justification** for each scope requested
5. Submit and wait — Google typically takes 1-4 weeks for sensitive scope verification

> **Note**: Until verified, users see a "Google hasn't verified this app" warning but can still click "Advanced" → "Go to [App Name]" to proceed. This is acceptable for a small user base but should be resolved for production.

---

## 7. Testing Checklist

After completing setup, verify each flow works:

### Instagram
- [ ] Click "Connect Instagram" on a brand → redirects to Instagram login
- [ ] Log in and authorize → redirects back with `?ig_connected=brandId`
- [ ] Brand shows "Connected" with the correct Instagram handle
- [ ] Disconnecting and reconnecting works
- [ ] Token auto-refresh runs (check logs after 6 hours)

### Facebook
- [ ] Click "Connect Facebook" on a brand → redirects to Facebook login
- [ ] If single page: auto-connects, redirects with `?fb_connected=brandId`
- [ ] If multiple pages: redirects with `?fb_select_page=brandId`, page picker shows
- [ ] Selecting a page stores it correctly
- [ ] Brand shows "Connected" with the correct page name
- [ ] Disconnecting and reconnecting works

### YouTube
- [ ] Click "Connect YouTube" on a brand → redirects to Google login
- [ ] Select channel and authorize → redirects back or shows success page
- [ ] Brand shows "Connected" with the correct channel name
- [ ] Same channel cannot be connected to two different brands (shows warning)
- [ ] Disconnecting and reconnecting works

### Onboarding
- [ ] New user sees all three platforms (Instagram, Facebook, YouTube) in step 6
- [ ] Connecting any platform from onboarding returns correctly to step 6
- [ ] "Complete Setup" button enables after connecting at least one platform
- [ ] Connection status persists after page refresh

---

## 8. Troubleshooting

### "App Not Setup" error on Instagram/Facebook login
**Cause**: App is in Development Mode and the user is not a test user.
**Fix**: Either add the user as a test user (section 1.5) or complete App Review (section 6.1).

### "Invalid redirect_uri" error
**Cause**: The redirect URI in the OAuth request doesn't match what's configured in the Meta/Google app.
**Fix**: Ensure the redirect URIs in Railway env vars match **exactly** what's in Meta App Settings (section 1.4) or Google Cloud Console (section 4.6). No trailing slashes, correct protocol (https).

### Facebook OAuth returns "no pages found"
**Cause**: The Facebook user doesn't manage any Facebook Pages, or the pages are restricted.
**Fix**: The user needs to create a Facebook Page or be added as an admin to an existing one.

### YouTube shows "Google hasn't verified this app"
**Cause**: The Google app is in Testing mode and hasn't been verified.
**Fix**: For test users, they can click "Advanced" → "Go to [App]" to proceed. For production, complete Google verification (section 6.3).

### YouTube "Channel Already Connected" error
**Cause**: The YouTube channel is already linked to a different brand.
**Fix**: Disconnect the channel from the other brand first, then reconnect to the desired brand.

### OAuth state expired / invalid
**Cause**: User took too long between clicking "Connect" and completing the OAuth flow (>1 hour), or the server restarted mid-flow.
**Fix**: Simply try connecting again. The new DB-backed state store handles server restarts gracefully.

### Facebook page selector not showing after OAuth
**Cause**: The `fb_select_page` URL parameter wasn't detected by the frontend.
**Fix**: Check that the backend `SITE_URL` env var is set correctly and matches your frontend URL.
