# Threads & TikTok — Admin Setup Guide

> **Who this is for:** You (the admin). This is a plain-English walkthrough of every manual step you need to complete before the code can be deployed and tested. No coding required here — just clicking through developer portals and copying values.
>
> **Time estimate:** Threads setup ~30 minutes. TikTok setup ~45 minutes (plus waiting days/weeks for app review).

---

## Part 1 — Threads (Meta)

Good news: **Threads uses the same Facebook/Instagram app you already have.** You don't need to create a new app. You just need to add the Threads product to your existing Meta app and configure a new redirect URI.

---

### Step 1.1 — Open your existing Meta App

1. Go to **[Meta for Developers](https://developers.facebook.com/apps/)**
2. Click on your existing app (the one you use for Instagram and Facebook OAuth — it's the one with `META_APP_ID` and `META_APP_SECRET` already in Railway).
3. You'll land on the app dashboard.

---

### Step 1.2 — Add the Threads Product

1. In the left sidebar, look for **"Add Product"** (or scroll down to the Products section).
2. Find **"Threads API"** and click **"Set up"**.
3. If you don't see it, make sure your app is of type **"Business"** or **"Consumer"**. Threads API is not available for utility apps.

> **Note:** As of early 2026, the Threads API is in general availability but some regions or app types may still be in limited access. If you see a "request access" button instead of "set up", click it and submit the form. Approval can take a few days.

---

### Step 1.3 — Configure Threads OAuth Redirect URI

1. In the left sidebar, click **"Threads API"** → **"Quickstart"** or **"Settings"**.
2. Find the **"Valid OAuth Redirect URIs"** field.
3. Add this URI:
   ```
   https://viraltoby.com/api/auth/threads/callback
   ```
4. Click **"Save changes"**.

---

### Step 1.4 — Note Required Permissions (Scopes)

The Threads product uses these scopes. Make sure they are listed as "ready" in your app:
- `threads_basic` — read profile info and threads
- `threads_content_publish` — create and publish threads

You may also want (optional):
- `threads_manage_replies` — reply management
- `threads_manage_insights` — analytics

To check/request these:
1. Go to **App Review** → **Permissions and Features** in the left sidebar.
2. Search for `threads_basic` and `threads_content_publish`.
3. If they show "Not Requested", click the name → Request access → Complete the form.
4. Standard access (publish on behalf of the connected user only) is usually auto-approved. Advanced access (publish for all Meta users) requires full app review.

> **For our use case** (the brand owner connects their own account), standard access is sufficient. You don't need advanced access.

---

### Step 1.5 — No New Environment Variables Needed for Threads

Threads uses the same `META_APP_ID` and `META_APP_SECRET` that are already in Railway. The only thing needed in code is the new redirect URI (`/api/auth/threads/callback`), which is hardcoded in the token service.

Double-check in Railway that these are already set:
- `META_APP_ID` ✓ (you have this)
- `META_APP_SECRET` ✓ (you have this)

---

### Step 1.6 — Test the Threads Connection (After Code is Deployed)

1. In your app's **Roles** section, add your personal Instagram/Threads account as a **Tester**.
2. Deploy the code changes.
3. Go to your app's brand settings → Connections tab → click "Connect Threads".
4. You'll be redirected to Threads to authorize.
5. After authorization, you should be redirected back and see your Threads username appear.

---

## Part 2 — TikTok

TikTok is more work than Threads because it's a completely separate developer ecosystem (not Meta). You'll need a new developer account and a new app.

> **Critical warning:** TikTok requires **app review and approval** before your app can publish videos on behalf of real users. This is a hard requirement, not optional. Until approval, you can only test with accounts explicitly listed as "sandbox users" in your app. Plan for 1–4 weeks of review time.

---

### Step 2.1 — Create a TikTok Developer Account

1. Go to **[TikTok for Developers](https://developers.tiktok.com/)**
2. Click **"Login"** → log in with a TikTok account (ideally use a business/admin account, not a brand account).
3. You'll be asked to agree to the developer terms. Accept them.
4. You now have a TikTok developer account.

---

### Step 2.2 — Create a New App

1. In the TikTok developer portal, click **"Manage apps"** → **"Create an app"**.
2. Fill in the details:
   - **App name:** `Viral Toby` (or whatever name you want — this is what users see on the permission screen)
   - **App description:** `Automated short-form video publishing for health and wellness brands`
   - **App category:** `Content & Media` or `Marketing`
   - **Platform:** Select **"Web"**
3. Click **"Create"**.
4. You'll get a **Client Key** and **Client Secret** — copy both. These go into Railway.

---

### Step 2.3 — Add Required Products/Scopes

After creating the app, you need to add the scopes your app needs:

1. In your app's settings, go to **"Add products"** or **"Products"** section.
2. Find **"Login Kit"** — add it. This handles OAuth.
3. Find **"Content Posting API"** — add it. This allows video publishing.

> **Note:** Content Posting API may show as "pending review" immediately. That's expected. You can still configure it and test with sandbox accounts while waiting.

---

### Step 2.4 — Configure OAuth Redirect URI

1. In the app settings, find **"Login Kit"** settings.
2. Look for **"Redirect URI / Callback URL"**.
3. Add:
   ```
   https://viraltoby.com/api/auth/tiktok/callback
   ```
4. Save.

---

### Step 2.5 — Request Required Scopes

1. Go to the **"Scope"** or **"Permissions"** section of your app.
2. Request the following scopes:
   - `user.info.basic` — read user's basic profile info (required, usually auto-approved)
   - `video.upload` — upload video files (required for Content Posting API)
   - `video.publish` — publish videos (the main one, requires app review)
3. For each scope, click **"Request"** or **"Add"** and complete the required form:
   - Describe how you'll use it
   - Provide a demo video or screenshots (for review purposes)
   - Explain that it's for automated brand content publishing

> **For `video.publish`:** This scope requires a detailed app review. You'll need to explain the use case, show the OAuth flow, and possibly provide a live demo. Budget 1–4 weeks.

---

### Step 2.6 — Add Sandbox Users (For Testing Before Approval)

While waiting for app review, you can test with sandbox users:

1. In your app settings, go to **"Sandbox"** section.
2. Click **"Add sandbox user"**.
3. Enter the TikTok username of an account you control (ideally a test account).
4. That account will now be able to authorize your app even before app review is complete.
5. Any video published will go to that account's profile but only visible to the account itself (private/sandbox).

> **Tip:** Create a dedicated test TikTok account for this. Don't use a real brand account for sandbox testing.

---

### Step 2.7 — Add Environment Variables to Railway

Go to your Railway project settings → Environment Variables and add:

| Variable | Where to find it | Example |
|---|---|---|
| `TIKTOK_CLIENT_KEY` | Your TikTok app's "Client Key" field | `aw1234abc...` |
| `TIKTOK_CLIENT_SECRET` | Your TikTok app's "Client Secret" field | `abc123xyz...` |

Also optionally set:
| Variable | Value |
|---|---|
| `TIKTOK_REDIRECT_URI` | `https://viraltoby.com/api/auth/tiktok/callback` |

> The redirect URI is hardcoded as default in the code, but setting it as an env var makes it easy to change for local testing.

---

### Step 2.8 — Test the TikTok Connection (After Code is Deployed + Sandbox Users Added)

1. Deploy the code changes to Railway.
2. Log into the app with an account associated with the sandbox TikTok account.
3. Go to a brand's connections → click "Connect TikTok".
4. You'll be redirected to TikTok to authorize.
5. **Important:** When the TikTok auth page shows, the logged-in TikTok account must be one of your sandbox users. If it's not, authorization will fail silently.
6. After authorization, you'll be redirected back and should see the TikTok display name appear.

---

### Step 2.9 — What Happens After App Review is Approved

Once TikTok approves your app:
1. The sandbox restrictions are lifted.
2. Any TikTok user can authorize your app (not just sandbox users).
3. Published videos will be fully public (based on the `privacy_level` you choose).
4. Remove sandbox test accounts from the sandbox users list (they'll now just be regular users).

---

## Part 3 — Quick Reference Checklist

### Threads Checklist
- [ ] Opened existing Meta app at developers.facebook.com
- [ ] Added **Threads API** product to the app
- [ ] Added redirect URI: `https://viraltoby.com/api/auth/threads/callback`
- [ ] Confirmed `threads_basic` and `threads_content_publish` are requested/approved
- [ ] Verified `META_APP_ID` and `META_APP_SECRET` are in Railway (already done)
- [ ] Added personal account as a Tester role for testing
- [ ] Confirmed code is deployed and tested the OAuth flow

### TikTok Checklist
- [ ] Created TikTok developer account at developers.tiktok.com
- [ ] Created new app named "Viral Toby" (or similar)
- [ ] Added **Login Kit** and **Content Posting API** products
- [ ] Added redirect URI: `https://viraltoby.com/api/auth/tiktok/callback`
- [ ] Requested scopes: `user.info.basic`, `video.upload`, `video.publish`
- [ ] Added sandbox users for testing
- [ ] Copied `Client Key` → added as `TIKTOK_CLIENT_KEY` in Railway
- [ ] Copied `Client Secret` → added as `TIKTOK_CLIENT_SECRET` in Railway
- [ ] Submitted app for review (for `video.publish` scope)
- [ ] Confirmed code is deployed and tested with sandbox account
- [ ] [ WAITING ] App review approved by TikTok

---

## Part 4 — Common Problems & How to Fix Them

### "Threads connection fails with 'App not allowed'"
**Cause:** The Threads API product isn't fully set up, or permissions aren't approved yet.
**Fix:** Go back to Meta Developer Portal → your app → Threads API settings. Make sure `threads_content_publish` is in "Approved" status, not "Requested". If it says "Requested", submit the review form.

### "TikTok redirects back with an error code"
**Cause:** The redirect URI doesn't match exactly what's registered in the TikTok developer portal.
**Fix:** Go to TikTok Developer Portal → your app → Login Kit settings → check the redirect URI field. Must be an exact match including the protocol (`https://`).

### "TikTok says the account is not authorized during testing"
**Cause:** The TikTok account you're testing with is not in the sandbox users list.
**Fix:** Add the account's TikTok username to the sandbox users list in your app settings.

### "TikTok video upload fails even after connecting"
**Cause:** The `video.publish` scope is still pending review, or you're not using a sandbox account.
**Fix:** During review period, use only the sandbox accounts you added. Check the scope status in TikTok Developer Portal.

### "Threads token expired after 60 days"
**Cause:** Token wasn't refreshed before expiry. The auto-refresh scheduler should handle this, but if it failed...
**Fix:** User clicks "Refresh token" button in the ConnectionCard UI. This calls `POST /api/auth/threads/refresh` which exchanges for a new 60-day token without requiring the user to re-authorize.

### "TikTok access token expired" during publishing
**Cause:** The publisher didn't refresh before the API call.
**Fix:** This should not happen in normal operation — the publisher always refreshes before calling TikTok. If it does happen, check the `_refresh_tiktok_token()` logs for errors. Likely cause: the refresh token itself expired (365-day limit), which requires the user to re-connect TikTok.

---

## Part 5 — Ongoing Maintenance

### Monthly tasks you DON'T need to do manually:
- Refresh Instagram tokens (auto every day via scheduler)
- Refresh Threads tokens (auto every day via scheduler)
- Refresh TikTok access tokens (auto before every publish)

### Things you may need to do occasionally:
- **Every 365 days:** TikTok refresh tokens expire. If a brand's TikTok goes dark, the user needs to reconnect TikTok from the Connections tab.
- **If Meta revokes your app permissions:** Re-submit for review in Meta Developer Portal.
- **If TikTok API changes:** TikTok updates their API more frequently than Meta. Check TikTok developer changelog every few months.
- **If a brand's Instagram/Threads handle changes:** The stored username won't update automatically. User must reconnect to refresh it (or there can be a manual profile re-fetch endpoint added later).

---

## Part 6 — Where to Find Things Later

| Thing you need | Where to find it |
|---|---|
| Meta App ID | Meta Developer Portal → your app → Settings → Basic |
| Meta App Secret | Meta Developer Portal → your app → Settings → Basic → Show |
| Threads redirect URI | Meta Developer Portal → your app → Threads API → Settings |
| TikTok Client Key | TikTok Developer Portal → your app → Basic info |
| TikTok Client Secret | TikTok Developer Portal → your app → Basic info |
| TikTok sandbox users | TikTok Developer Portal → your app → Sandbox |
| TikTok review status | TikTok Developer Portal → your app → Manage Permissions |
| Railway env vars | viraltoby.com Railway dashboard → your service → Variables tab |
