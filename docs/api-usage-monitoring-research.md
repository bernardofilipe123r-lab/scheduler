# API Usage Monitoring — Endpoint Research

Here is a complete, fully-sourced breakdown for all five APIs, ready to plug into your monitoring dashboard.

## 1. SerpAPI ✅ Confirmed Current

**Endpoint:** `GET https://serpapi.com/account.json`
**Auth:** `?api_key=YOUR_KEY` (query param)
**Cost:** Free — using the Account API will not be counted toward your monthly quota.

The full JSON response looks like this:

```json
{
  "account_id": "5ac54d6adefb2f1dba1663f5",
  "api_key": "SECRET_API_KEY",
  "account_email": "demo@serpapi.com",
  "plan_id": "bigdata",
  "plan_name": "Big Data Plan",
  "plan_monthly_price": 250.0,
  "searches_per_month": 30000,
  "plan_searches_left": 5958,
  "extra_credits": 0,
  "total_searches_left": 5958,
  "this_month_usage": 24042,
  "last_hour_searches": 42,
  "account_rate_limit_per_hour": 6000
}
```

Your known fields (`total_searches_left`, `this_month_usage`, `plan_searches_left`) are confirmed current. Additional useful fields for your dashboard: `searches_per_month` (your plan's ceiling), `extra_credits` (any add-on credits), `last_hour_searches` and `account_rate_limit_per_hour` (live throughput status). There is no explicit reset date field in the response — the month resets on your billing cycle date, which is not exposed in this endpoint. You'd need to track your own cycle start date.

---

## 2. Pexels ✅ Confirmed Current (with important nuances)

No dedicated usage endpoint. Usage data is embedded in response headers on every successful `200 OK` content request.

**Headers returned on every successful request:**

- `X-Ratelimit-Limit` — your total monthly allocation (default 20,000)
- `X-Ratelimit-Remaining` — how many requests you have left
- `X-Ratelimit-Reset` — when your limit resets

**Format of `X-Ratelimit-Reset`:** It is a **Unix timestamp** for when your rate limit will reset to the value in `X-Ratelimit-Limit`.

**Critical caveat for your dashboard:** These response headers are **only returned on successful (2xx) responses**. They are not included with other responses, including `429 Too Many Requests`, which indicates you have exceeded your rate limit. This means you must proactively cache the last-seen `X-Ratelimit-Reset` value before you hit the limit — it disappears from the 429 response.

**On your question about hourly vs. monthly limits:** By default, the API is rate-limited to 200 requests per hour and 20,000 requests per month. However, your total rate limit reported in `X-Ratelimit-Limit` is 20,000 by default. The 200 req/hour limit is enforced server-side but does not have its own dedicated header — it returns a 429 if exceeded. There is no separate status endpoint; the headers are the only programmatic mechanism.

**Best practice for your dashboard:** Make a lightweight content call (e.g., `GET https://api.pexels.com/v1/curated?per_page=1`) with `Authorization: YOUR_API_KEY` in the header, then read the three `X-Ratelimit-*` headers from the response.

---

## 3. NewsData.io ❌ No Programmatic Usage Endpoint

After checking the official documentation, there is **no `/account` endpoint**, no usage field in the response body, and no rate-limit headers exposed by NewsData.io.

Free users receive 200 credits/day. Credits are consumed each time a user makes a request. The response body only contains article results — no `credits_used`, `credits_remaining`, or `reset_time` fields are returned. The credit count is not surfaced programmatically anywhere in the API response.

**Best workaround for your dashboard:** Track calls locally. Since 1 request = 1 credit on the free tier (except archive endpoints which cost 5), you can maintain a counter in a local database (SQLite, Redis, etc.) that increments on each call and resets at midnight UTC (or your account's billing cycle start). Store timestamps so you can calculate time-to-reset. This is the only reliable approach.

---

## 4. Tavily ✅ Dedicated Usage Endpoint (Recently Added)

You can now easily track your API usage and plan limits in real time. Just send a GET request to `https://api.tavily.com/usage` with your API key — and instantly monitor your account activity.

**Endpoint:** `GET https://api.tavily.com/usage`
**Auth:** `Authorization: Bearer tvly-YOUR_API_KEY` (header)

The full response:

```json
{
  "key": {
    "usage": 150,
    "limit": 1000,
    "search_usage": 100,
    "extract_usage": 25,
    "crawl_usage": 15,
    "map_usage": 7,
    "research_usage": 3
  },
  "account": {
    "current_plan": "Bootstrap",
    "plan_usage": 500,
    "plan_limit": 15000,
    "paygo_usage": 25,
    "paygo_limit": 100,
    "search_usage": 350,
    "extract_usage": 75,
    "crawl_usage": 50,
    "map_usage": 15,
    "research_usage": 10
  }
}
```

The `key` object shows usage for the specific API key you authenticated with. `account` shows aggregate plan-level usage. On the free tier, `key.limit` will be 1000 and `key.usage` is your consumed credits. There is no `reset_date` field in the response — credits reset monthly on your billing date, which you'd need to track separately.

---

## 5. Google Gemini API ⚠️ Partial — Headers Only on Errors, No Proactive Quota Endpoint

This is the most limited of the five. There is **no dedicated quota-check endpoint** in the Gemini API or the `google-genai` Python SDK.

**What IS available:**

On **429 errors**, the API returns rate-limit headers in the HTTP response: `retry-after`, `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`, and `x-ratelimit-reset-requests` (ISO 8601 timestamp format). The error body also contains structured quota info: the `quota_metric` field tells you exactly which limit triggered the error (e.g., `generativelanguage.googleapis.com/generate_content_requests`).

On **successful responses**, the API response headers include `x-ratelimit-remaining` values that enable application-level tracking — but this is only documented in third-party guides, not Google's official docs, and community reports suggest they are not consistently returned.

**Google's official stance:** A Google engineer confirmed in September 2024 that there is no programmatic way to get rate limits via the SDK at the moment, calling it a feature request in the backlog that they nudged. A follow-up in October 2025 asked again if it had been bumped. As of March 2026, no such endpoint has shipped.

For **Vertex AI** (paid, not free tier), you can use `gcloud services quotas list --service=aiplatform.googleapis.com` or the Cloud Monitoring API to query metrics programmatically.

**Best workaround for the free tier:** Build a `RateLimitMonitor` class that tracks timestamps of your own outgoing requests locally. Maintain a rolling 60-second window for RPM and a daily counter (resetting at midnight Pacific Time) for RPD. Parse the `x-ratelimit-*` headers from 429 responses to calibrate your local counters. AI Studio's dashboard at `aistudio.google.com` shows quota remaining under your API key profile, but there's no API to read this programmatically.

---

## Summary Table

| API | Endpoint | Method | Auth | Reset Field? |
|---|---|---|---|---|
| **SerpAPI** | `https://serpapi.com/account.json` | GET | `?api_key=` | ❌ None exposed |
| **Pexels** | Any content endpoint | GET | `Authorization: KEY` (header) | `X-Ratelimit-Reset` (Unix timestamp) |
| **NewsData.io** | ❌ None | — | — | ❌ Track locally |
| **Tavily** | `https://api.tavily.com/usage` | GET | `Authorization: Bearer KEY` | ❌ None exposed |
| **Gemini** | ❌ None | — | — | In 429 headers only (`x-ratelimit-reset-requests`, ISO 8601) |
