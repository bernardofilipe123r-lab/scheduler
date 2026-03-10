---
name: platform-publishing
description: "Multi-platform publishing and OAuth — Instagram, Facebook, Threads, TikTok, YouTube, Bluesky. Token lifecycle, publishing flows, OAuth routes, scheduling, retry logic, legal page updates. Use when: adding new social platform, fixing OAuth flow, debugging publish failures, modifying token refresh, changing scheduling logic, updating legal pages for platform changes, working on retry/recovery."
---

# Platform Publishing & OAuth

## When to Use
- Adding a new social platform integration
- Fixing or modifying OAuth flows (connect/disconnect/callback)
- Debugging publish failures or token expiry
- Modifying token refresh logic
- Changing scheduling slot logic or dedup guards
- Working on retry/recovery for failed publishes
- **MUST-READ when adding/removing a platform** (legal page updates required)

## Key Source Files

| File | Purpose |
|------|---------|
| `app/services/publishing/social_publisher.py` | `SocialPublisher` — multi-platform orchestration |
| `app/services/publishing/scheduler.py` | `DatabaseSchedulerService` — scheduling + publish execution |
| `app/services/publishing/ig_token_service.py` | Instagram token exchange & refresh (60-day) |
| `app/services/publishing/fb_token_service.py` | Facebook token exchange & page tokens |
| `app/services/publishing/bsky_token_service.py` | Bluesky token exchange & refresh |
| `app/services/publishing/threads_token_service.py` | Threads token exchange & refresh (60-day) |
| `app/services/publishing/tiktok_token_service.py` | TikTok PKCE flow & refresh (24h!) |
| `app/api/auth/ig_oauth_routes.py` | Instagram OAuth routes |
| `app/api/auth/fb_oauth_routes.py` | Facebook OAuth routes (multi-page selection) |
| `app/api/auth/bsky_auth_routes.py` | Bluesky OAuth routes |
| `app/api/auth/threads_oauth_routes.py` | Threads OAuth routes |
| `app/api/auth/tiktok_oauth_routes.py` | TikTok OAuth routes (PKCE) |
| `app/api/youtube/routes.py` | YouTube OAuth & channel management |
| `app/models/brands.py` | Brand model — stores all platform credentials |
| `src/pages/Terms.tsx` | Terms of Service (must list platforms) |
| `src/pages/PrivacyPolicy.tsx` | Privacy Policy (must list data collected) |
| `src/pages/DataDeletion.tsx` | Data Deletion (must list tokens/IDs deleted) |

## Platform-Specific Publishing

### Instagram
- **Image Post:** 3-step: create container → poll status → publish
- **Reel:** `media_type: "REELS"` with `video_url`. Poll max 180s
- **Carousel:** Create child containers (`is_carousel_item=true`) → create carousel container → publish. PNG→JPEG auto-conversion
- **Token:** 60-day long-lived, refreshable once/day
- **Auto-refresh:** On HTTP 401 or IG error code 190

### Facebook
- **Image Post:** `/{page_id}/photos` with page access token
- **Reel:** 3-phase: init (`upload_phase=start`) → upload via `rupload.facebook.com` → finish (`upload_phase=finish`)
- **Carousel:** Upload each photo unpublished → create feed post with `attached_media`
- **Token:** Page access token from system user token. Cached in `_page_access_token_cache`
- **Fallback:** `_get_page_token_via_accounts()` if direct method fails

### Threads
- **Post:** 2-step: create container → publish. Video: poll before publish
- **Carousel:** 2-10 items. Child containers → carousel container → publish
- **Token:** 60-day long-lived, refreshable (`th_refresh_token` grant type)
- **Proactive refresh:** Auto-refreshes if >6h since last refresh or <5 days to expiry

### TikTok
- **Video:** POST to `/v2/post/publish/video/init/` with `source_info: PULL_FROM_URL`
- **Status polling:** `PROCESSING_UPLOAD` → `PROCESSING_DOWNLOAD` → `SENDING_TO_USER_INBOX` → `PUBLISH_COMPLETE`
- **Token:** **24-hour lifetime!** Mandatory refresh before every publish
- **PKCE flow:** Uses `code_verifier` + `code_challenge` (S256)

### YouTube
- **Shorts:** Download video + thumbnail to temp files → `YouTubePublisher.upload_youtube_short()`
- **Token rotation:** Google may rotate refresh_token during upload — must persist new one
- **Quota:** 10,000 units/day. Track via `youtube_quota.json`
- **Error distinction:** `invalid_grant` (revocation) vs `rateLimitExceeded` (quota)

## OAuth Flow Pattern

All platforms follow the same pattern:

```
1. GET /api/auth/{platform}/connect?brand_id
   → Create DB-backed CSRF state (OAuthStateStore)
   → Return authorization URL

2. GET /api/auth/{platform}/callback?code&state
   → Validate state (single-use)
   → Exchange code → short-lived token
   → Exchange → long-lived token (except TikTok: already long-lived-ish)
   → Get user profile (account ID, username)
   → Duplicate check (reject if same account on different brand)
   → Store credentials on Brand model
   → Redirect to UI with success flag

3. POST /api/auth/{platform}/disconnect
   → NULL all credentials for that platform on brand

4. GET /api/auth/{platform}/status?brand_id
   → Return connection status + expiry info
```

**Facebook special case:** After callback, if user has multiple Pages, store token in `_pending_tokens` dict (10 min TTL) → redirect to page selector UI → POST `/select-page` to finalize.

**TikTok special case:** PKCE flow — `code_verifier` stored in OAuthStateStore, used in callback exchange.

## Scheduling System

### Slot Assignment
- **Reels:** 6 slots/day (every 4h), alternating Light→Dark variants
- **Posts:** 2 slots/day (8 AM, 2 PM)
- **Brand stagger:** Each brand offset 0-5 hours to prevent simultaneous posts
- **Dedup guard:** ±30 min window around scheduled_time, same brand+variant → prevents duplicates

### Publish Execution
```
get_pending_publications() → atomically marks 'publishing' (FOR UPDATE SKIP LOCKED)
  → SocialPublisher.publish_*() per platform
  → mark_as_published() or mark_as_failed()
  → Partial success detection: some platforms succeed, others fail → status='partial'
```

### Recovery
- **Stuck reset:** `reset_stuck_publishing(max_age_minutes=10)` — if has post_ids → mark published, else reset to scheduled (max 3 resets)
- **Auto-retry:** `auto_retry_failed_toby_posts()` — retries transient errors (timeout, rate limit, 429, 500-503, connection, unexpected, retry your request). Max 3 auto-retries per post
- **Partial retry:** Only re-publishes to failed platforms, skips already-succeeded ones

## Token Lifetime Summary

| Platform | Token Type | Lifetime | Refresh Method |
|----------|-----------|----------|----------------|
| Instagram | Long-lived | 60 days | `ig_refresh_token` grant, once/day |
| Facebook | Page token | ~60 days | Via system user token |
| Threads | Long-lived | 60 days | `th_refresh_token` grant |
| TikTok | Access | **24 hours** | `refresh_token` grant (every publish!) |
| TikTok | Refresh | 365 days | Re-authorize if expired |
| YouTube | Refresh | Indefinite | Google may rotate during use |

## CRITICAL: Legal Page Updates

When adding or removing a social platform, you **MUST** update all three legal pages:

1. **Terms.tsx** — List platform in service description & third-party services
2. **PrivacyPolicy.tsx** — Describe what data is collected (tokens, IDs, profile info)
3. **DataDeletion.tsx** — Include platform's tokens/IDs in "What Gets Deleted" list

These URLs are referenced in Meta App Dashboard, TikTok Developer Portal, and Google API Console.

## Common Mistakes to Avoid
1. **TikTok 24h token:** ALWAYS refresh before publish — stale tokens fail silently
2. **Facebook multi-page:** Don't auto-select if user has multiple pages — redirect to selector
3. **Duplicate accounts:** Never allow same social account on multiple brands — check in callback
4. **PNG on Instagram:** Instagram rejects PNG carousels — auto-convert to JPEG
5. **YouTube quota:** Check quota before upload — `rateLimitExceeded` is different from auth failure
6. **State reuse:** OAuth state is single-use and DB-backed — never reuse or skip validation
7. **Threads App ID fallback:** Falls back through `THREADS_APP_ID` → `META_APP_ID` → `INSTAGRAM_APP_ID`
