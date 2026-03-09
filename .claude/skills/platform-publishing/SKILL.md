---
name: platform-publishing
description: Use when adding a social platform, fixing OAuth flow, debugging publish failures, modifying token refresh, changing scheduling logic, updating legal pages for platform changes, or working on retry/recovery.
---

# Platform Publishing & OAuth

## Key Source Files

| File | Purpose |
|------|---------|
| `app/services/publishing/social_publisher.py` | `SocialPublisher` — multi-platform orchestration |
| `app/services/publishing/scheduler.py` | `DatabaseSchedulerService` — scheduling + publish |
| `app/services/publishing/ig_token_service.py` | Instagram token (60-day) |
| `app/services/publishing/fb_token_service.py` | Facebook page tokens |
| `app/services/publishing/threads_token_service.py` | Threads token (60-day) |
| `app/services/publishing/tiktok_token_service.py` | TikTok PKCE (24h!) |
| `app/services/publishing/bsky_token_service.py` | Bluesky AT Protocol sessions |
| `app/api/auth/` | OAuth routes per platform |
| `app/api/auth/bsky_auth_routes.py` | Bluesky App Password connect/disconnect |
| `app/api/youtube/routes.py` | YouTube OAuth & channel management |

## Platform Publishing

| Platform | Method | Token Lifetime |
|----------|--------|---------------|
| Instagram | Container → poll → publish. Reels poll max 180s | 60 days (refreshable) |
| Facebook | Page token. Reel: 3-phase upload | ~60 days |
| Threads | Container → publish. Carousel: 2-10 items | 60 days (refreshable) |
| TikTok | `PULL_FROM_URL`. Status polling | **24 hours** (refresh every publish!) |
| YouTube | Download → upload via API. Quota: 10K units/day | Refresh indefinite |
| Bluesky | AT Protocol `createRecord`. Upload via `uploadBlob` | accessJwt ~2h (auto-refresh), App Password permanent |

## OAuth Flow Pattern
```
1. GET /api/auth/{platform}/connect?brand_id → auth URL + CSRF state
2. GET /api/auth/{platform}/callback → exchange code → store token → redirect
3. POST /api/auth/{platform}/disconnect → NULL credentials
```
- Facebook: multi-page selector after callback if user has multiple Pages
- TikTok: PKCE flow with code_verifier
- Bluesky: NOT OAuth — uses App Password. POST /api/auth/bluesky/connect with handle + app_password. Frontend shows modal (not redirect).

## Scheduling
- Reels: 6 slots/day (every 4h), alternating Light→Dark
- Posts: 2 slots/day (8 AM, 2 PM)
- Brand stagger: 0-5 hours offset per brand
- Dedup guard: ±30 min window, same brand+variant

## Recovery
- `reset_stuck_publishing(max_age_minutes=10)` — crash recovery
- `auto_retry_failed_toby_posts()` — transient error retry (max 3)
- Partial retry: only re-publishes to failed platforms

## CRITICAL: Legal Page Updates
When adding/removing a platform, update:
1. `src/pages/Terms.tsx` — list platform
2. `src/pages/PrivacyPolicy.tsx` — describe data collected
3. `src/pages/DataDeletion.tsx` — list tokens/IDs deleted

## Common Mistakes
1. TikTok: ALWAYS refresh token before publish — 24h lifetime
2. Facebook: don't auto-select page if user has multiple
3. Never allow same social account on multiple brands
4. Instagram rejects PNG carousels
5. YouTube: `invalid_grant` (revocation) vs `rateLimitExceeded` (quota) are different
6. OAuth state is single-use and DB-backed
7. Bluesky: 300-grapheme text limit (not chars). Use `_truncate_to_graphemes()` for safe truncation
8. Bluesky: accessJwt expires ~2h — always call `_ensure_bsky_session()` before publishing
9. Bluesky video: upload to video.bsky.app, poll jobStatus, then embed in post (max 3min, 25/day)
