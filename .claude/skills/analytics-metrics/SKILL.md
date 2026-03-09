---
name: analytics-metrics
description: Use when modifying metrics collection, working on analytics dashboards, changing Toby Score formula, debugging metric fetch failures, working on TrendScout discovery, or adding new analytics dimensions.
---

# Analytics & Metrics System

## Key Source Files

| File | Purpose |
|------|---------|
| `app/services/analytics/metrics_collector.py` | `MetricsCollector` — per-post IG metrics at 24h/48h/7d |
| `app/services/analytics/analytics_service.py` | `AnalyticsService` — brand-level analytics (6h refresh) |
| `app/services/analytics/trend_scout.py` | `TrendScout` — hashtag & competitor discovery via Meta Graph API |
| `app/api/analytics/routes.py` | V1 analytics API |
| `app/api/analytics/v2_routes.py` | V2 analytics API (overview, posts, answers — 3-tab) |
| `app/models/analytics.py` | `PostPerformance`, `BrandAnalytics`, `AnalyticsSnapshot`, `TrendingContent` |
| `app/services/toby/analysis_engine.py` | Toby Score calculation |

## Toby Score Formula

Two-phase: 48h (weight 0.6) and 7d (weight 1.0).

### Reels
```
raw_views_score    = log₁₀(views) / log₁₀(500K) × 100    [20%]
relative_score     = (views / brand_avg_views) × 25         [30%]
engagement_score   = (saves×2 + shares×3) / views × 10K     [40%]
follower_score     = (views / followers) × 10                [10%]
```

Posts use `reach` instead of `views`. Unreliable if views < 5 or reach < 5.

## V2 Analytics API (3-Tab)

1. **Overview** (`GET /api/analytics/v2/overview`) — Period comparison + daily chart
2. **Posts** (`GET /api/analytics/v2/posts`) — Individual post performance, paginated
3. **Answers** (`GET /api/analytics/v2/answers`) — Best day/hour/type recommendations from 90d data

## TrendScout

Uses **official Meta Graph APIs** (not scraping):
- Hashtag Search: `GET /{ig_user_id}/ig_hashtag_search?q={hashtag}` → `GET /{hashtag_id}/top_media`
- Rate limit: 30 unique hashtags per 7-day window
- **CRITICAL:** Uses `graph.facebook.com`, NOT `graph.instagram.com` for hashtag search
- Competitor Discovery: Business Discovery API

## Common Mistakes
1. IG token types: IGAF → `graph.instagram.com`, EAA → `graph.facebook.com`
2. Always check `metrics_unreliable` flag before using scores
3. Brand baseline must filter `created_by == "toby"` only
4. Auto-cleanup disconnected platforms BEFORE fetching new metrics
