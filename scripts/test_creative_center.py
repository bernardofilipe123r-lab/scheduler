"""Test TikTok Creative Center public API for trending music."""
import requests
import json

headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en",
    "Origin": "https://ads.tiktok.com",
}

# Try multiple known URL patterns for the Creative Center API
urls = [
    "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/sound/list",
    "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/sound/list?page=1&limit=20&period=7&country_code=&sort_by=popular",
    "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/music/list",
    "https://ads.tiktok.com/api/creative_radar/v1/popular_trend/sound/list",
    "https://ads.tiktok.com/creative_radar_api/v2/popular_trend/sound/list",
]

params = {
    "page": 1,
    "limit": 20,
    "period": 7,
    "country_code": "",
    "sort_by": "popular",
}

for url in urls:
    try:
        # Try with params
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        print(f"[{resp.status_code}] {url}")
        if resp.status_code == 200:
            try:
                data = resp.json()
                if data.get("code") == 0 or "sound_list" in str(data)[:500]:
                    print(f"  SUCCESS! {str(data)[:300]}")
                else:
                    print(f"  {str(data)[:200]}")
            except:
                print(f"  Not JSON: {resp.text[:200]}")
        else:
            print(f"  {resp.text[:150]}")
    except Exception as e:
        print(f"[ERR] {url} -> {e}")
    print()
