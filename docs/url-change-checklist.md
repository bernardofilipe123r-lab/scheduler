# App URL Change Checklist

> **Current production URL:** `https://viraltoby.com`
>
> Every time the production URL changes, go through every item in this list. Missing any one of them will cause OAuth flows, emails, or API calls to break.

---

## 1. Railway — Environment Variables

Update these in the Railway project dashboard (or via `railway variables --set`):

| Variable | Current Value | Purpose |
|---|---|---|
| `VITE_APP_URL` | `https://viraltoby.com` | Email confirmation redirect (React, baked at build time) |
| `PUBLIC_URL_BASE` | `https://viraltoby.com` | Used by backend for generating public links |
| `YOUTUBE_REDIRECT_URI` | `https://viraltoby.com/api/youtube/callback` | YouTube OAuth callback |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000,https://viraltoby.com` | CORS allowed origins for the FastAPI backend |

```bash
railway variables --set "VITE_APP_URL=https://NEW_URL"
railway variables --set "PUBLIC_URL_BASE=https://NEW_URL"
railway variables --set "YOUTUBE_REDIRECT_URI=https://NEW_URL/api/youtube/callback"
railway variables --set "CORS_ORIGINS=http://localhost:5173,http://localhost:3000,https://NEW_URL"
```

---

## 2. Local `.env` File

Mirror the same changes so local dev registers emails pointing to the right place:

```env
VITE_APP_URL=https://NEW_URL
PUBLIC_URL_BASE=https://NEW_URL
YOUTUBE_REDIRECT_URI=https://NEW_URL/api/youtube/callback
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,https://NEW_URL
```

---

## 3. Supabase Dashboard

**URL:** https://supabase.com/dashboard/project/kzsbyzroknbradzyjvrc/auth/url-configuration

| Field | Value to Set |
|---|---|
| **Site URL** | `https://NEW_URL` — this is used as the base for ALL auth emails (confirmation, reset password, magic link). **This is the most critical one.** |
| **Redirect URLs** | Add `https://NEW_URL`, keep `http://localhost:5173`, `http://localhost:3000` |

> ⚠️ Supabase's Site URL overrides any `emailRedirectTo` value sent from code if the URL isn't in the allowlist. Always update this first.

---

## 4. Google Cloud Console — YouTube OAuth

**URL:** https://console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client IDs

- Open your OAuth client (the one matching `YOUTUBE_CLIENT_ID = 474229192527-...`)
- Under **Authorized redirect URIs**, add: `https://NEW_URL/api/youtube/callback`
- Remove the old URL once confirmed working
- Click **Save**

> The env var `YOUTUBE_REDIRECT_URI` must exactly match what's registered in Google Console — even a trailing slash difference will cause OAuth to fail.

---

## 5. Meta / Facebook Developer Console — Instagram OAuth

**URL:** https://developers.facebook.com → Your App

### 5a. App Settings → Basic

- **App Domains:** Add the new domain (e.g. `viraltoby.com`)
- **Privacy Policy URL:** Update if it includes the old domain
- **Terms of Service URL:** Update if it includes the old domain
- **Site URL** (under Website): `https://NEW_URL`

### 5b. Facebook Login for Business → Settings

- **Valid OAuth Redirect URIs:** Add `https://NEW_URL/api/auth/meta/callback`
- Remove the old URL once confirmed working

### 5c. Instagram → Basic Display (if configured)

- **Valid OAuth Redirect URIs:** Add `https://NEW_URL/api/auth/meta/callback`
- **Deauthorize Callback URL:** Update to `https://NEW_URL/api/auth/meta/deauthorize`
- **Data Deletion Request URL:** Update to `https://NEW_URL/api/auth/meta/data-deletion`

### 5d. Environment Variables

Update in Railway **and** local `.env`:

| Variable | Value |
|---|---|
| `INSTAGRAM_REDIRECT_URI` | `https://NEW_URL/api/auth/meta/callback` |
| `SITE_URL` | `https://NEW_URL` |

> ⚠️ The redirect URI in the env var must **exactly** match what's registered in the Facebook Developer Console — including protocol, path, and no trailing slash.

---

## 6. Code — `vite.config.ts`

The dev proxy hardcodes the production URL as a fallback target. Update if needed:

**File:** [vite.config.ts](../vite.config.ts) (lines ~20–44)

```ts
target: 'https://NEW_URL',
```

There are 7 proxy entries — all point to the same host so one find-and-replace handles it.

---

## 7. Code — `auth-api.ts`

**File:** [src/features/auth/api/auth-api.ts](../src/features/auth/api/auth-api.ts#L66)

This still has the old `window.location.origin` fallback (used by a legacy path). The primary fix is `AuthContext.tsx` using `VITE_APP_URL`, but this file should also be updated if it gets used:

```ts
emailRedirectTo: import.meta.env.VITE_APP_URL || window.location.origin,
```

---

## Quick Verification After Changing URL

1. Visit `https://NEW_URL/api/health` — should return `200 OK`
2. Register a new test account → confirmation email should link to `https://NEW_URL/...`
3. Connect a YouTube account → OAuth callback should land on `https://NEW_URL/api/youtube/callback`
4. Check CORS: open browser devtools on the new URL and confirm no CORS errors on API calls

---

## History of URL Changes

| Date | Old URL | New URL | Changed By |
|---|---|---|---|
| Feb 2026 | (initial) | `https://viraltoby.com` | Filipe |
