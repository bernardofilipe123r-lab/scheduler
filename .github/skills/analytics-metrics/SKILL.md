---
name: analytics-metrics
description: "Analytics and metrics system — Instagram/Facebook/YouTube metrics collection, Toby Score calculation, trend discovery, performance dashboards, V2 analytics API. Use when: modifying metrics collection, working on analytics dashboards, changing Toby Score formula, debugging metric fetch failures, working on TrendScout discovery, adding new analytics dimensions, fixing expired token handling in metrics."
---

# Analytics & Metrics System

## When to Use
- Modifying metrics collection (Instagram Graph API calls)
- Working on analytics dashboard (V1 or V2 routes)
- Changing how Toby Score is calculated
- Debugging metric fetch failures or expired tokens
- Working on TrendScout hashtag/competitor discovery
- Adding new analytics dimensions or aggregations
- Fixing issues with performance scoring or percentile ranking

## Key Source Files

| File | Purpose |
|------|---------|
| `app/services/analytics/metrics_collector.py` | `MetricsCollector` — per-post IG metrics at 24h/48h/7d |
| `app/services/analytics/analytics_service.py` | `AnalyticsService` — brand-level analytics (6h refresh) |
| `app/services/analytics/trend_scout.py` | `TrendScout` — hashtag & competitor discovery via Meta Graph API |
| `app/api/analytics/routes.py` | V1 analytics API (brand metrics, refresh, rate limit) |
| `app/api/analytics/v2_routes.py` | V2 analytics API (overview, posts, answers — 3-tab architecture) |
| `app/models/analytics.py` | `PostPerformance`, `BrandAnalytics`, `AnalyticsSnapshot`, `TrendingContent` |
| `app/services/toby/analysis_engine.py` | Toby Score calculation (used by orchestrator) |

## Toby Score Formula

Two-phase scoring: 48h (early signal, weight 0.6) and 7d (final, weight 1.0).

### Reels
```
raw_views_score    = log₁₀(views) / log₁₀(500K) × 100    [20% weight]
relative_score     = (views / brand_avg_views) × 25         [30% weight]
engagement_score   = (saves×2 + shares×3) / views × 10K     [40% weight]
follower_score     = (views / followers) × 10                [10% weight]

final = 0.20×raw + 0.30×relative + 0.40×engagement + 0.10×follower
```

### Posts/Carousels
Same formula but uses `reach` instead of `views` (plays unavailable for posts).

### Unreliable Flag
If `views < 5` (reel) or `reach < 5` (post) → `metrics_unreliable = True`. Excluded from strategy score updates. Protects against zero-view content (API delays, throttling).

### Brand Baseline
Only includes Toby-created content (`created_by == "toby"`). 14-day rolling window.

## MetricsCollector

Fetches per-post Instagram metrics via Graph API:
- `GET /{media_id}?fields=like_count,comments_count,timestamp` — basic metrics
- `GET /{media_id}/insights?metric=plays,reach,saved,shares` — engagement

### Performance Score (per post)
```python
Composite 0-100:
  Views (30%)      — virality (normalized: 5k views = 100)
  Engagement (30%) — quality ((likes+saves+shares+comments)/reach × 100)
  Saves (20%)      — intent (normalized: 100 saves = 100)
  Shares (20%)     — amplification (normalized: 50 shares = 100)
```

### Token Expiry Handling
- HTTP 401 or IG error code 190 → `{"token_expired": True}`
- HTTP 400/404 → `{"deleted": True}` (post deleted)
- Flags `TobyContentTag.metrics_unreliable = True` for deleted posts

## AnalyticsService

Brand-level analytics with auto-refresh every 6 hours.

### Data Sources
| Platform | Metrics | API |
|----------|---------|-----|
| Instagram | followers_count, views_last_7d, likes_last_7d | IG Graph API (impressions time_series) |
| Facebook | followers_count, views_last_7d, likes_last_7d | FB Graph API page insights |
| YouTube | subscribers, views_last_7d, likes_last_7d | YouTube Data API |

### Auto-cleanup
Before each refresh, removes analytics for:
- Brands that no longer exist
- YouTube channels that have been disconnected

## V2 Analytics API (3-Tab Architecture)

### 1. Overview (`GET /api/analytics/v2/overview`)
Period comparison + daily chart. Params: `brand`, `platform`, `days=30`
Returns: current period metrics, previous period, percentage changes, daily breakdown, per-brand, per-channel.

### 2. Posts (`GET /api/analytics/v2/posts`)
Individual post performance. Params: `brand`, `content_type`, `sort_by`, `sort_dir`, `days`, `limit`, `offset`
Returns: summary aggregates + paginated post list with all metrics.

### 3. Answers (`GET /api/analytics/v2/answers`)
Recommendations from historical data. Params: `brand`, `days=90`
Returns: best_day, best_hour, best_type (content format), recommended_frequency.

## TrendScout

Discovers trending content via **official Meta Graph APIs** (not scraping):

### Hashtag Search
```python
# 1. Get hashtag_id
GET /{ig_user_id}/ig_hashtag_search?q={hashtag}

# 2. Get top media
GET /{hashtag_id}/top_media?user_id={ig_user_id}&fields=...
```
**Rate limit:** 30 unique hashtags per 7-day rolling window (Meta imposed).
**CRITICAL:** Uses `graph.facebook.com`, NOT `graph.instagram.com` for hashtag search.

### Competitor Discovery (Business Discovery API)
```python
GET /{ig_user_id}?fields=business_discovery.fields(...).username({competitor})
```

### Configuration Sources
- Hashtags: from NicheConfig `discovery_hashtags` → env `TOBY_HASHTAGS`
- Reel competitors: from NicheConfig `competitor_accounts` → env `TOBY_COMPETITOR_ACCOUNTS`
- Post competitors: from NicheConfig → env `TOBY_POST_COMPETITOR_ACCOUNTS`

## Common Mistakes to Avoid
1. **IG token types:** IGAF tokens use `graph.instagram.com`, EAA tokens use `graph.facebook.com` — know which you have
2. **Hashtag API domain:** Use `graph.facebook.com` for hashtag search, NOT `graph.instagram.com`
3. **Unreliable metrics:** Always check `metrics_unreliable` flag before using scores in strategy updates
4. **Brand baseline filter:** Must filter `created_by == "toby"` — don't include manual user content in Toby's baseline
5. **Refresh race condition:** `is_refresh_in_progress()` with 5 min timeout prevents concurrent refreshes
6. **Auto-cleanup timing:** Run disconnected platform cleanup BEFORE fetching new metrics
