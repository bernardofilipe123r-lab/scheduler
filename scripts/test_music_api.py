"""Test TokInsight API - check if ANY endpoint works, or if the whole API is down."""
import requests

API_KEY = "91ac726859msh732a3aa7a822aa1p13a729jsn2c7040d3fc9e"
HOST = "free-tiktok-api-scraper-mobile-version.p.rapidapi.com"
headers = {
    "x-rapidapi-host": HOST,
    "x-rapidapi-key": API_KEY,
}

# Test a non-music endpoint first — does the API work AT ALL?
print("=== Profile endpoint (sanity check) ===")
try:
    resp = requests.get(
        f"https://{HOST}/tok/v1/user_profile/",
        params={"uid": "6656913964248088581", "sec_uid": "MS4wLjABAAAAXvlb5a78QwIAZegmnfJnnKGC2ZfXaC672rP7_PwtVK8lPgqC1O-Qh13yqOB9xqhI"},
        headers=headers,
        timeout=15,
    )
    print(f"Status: {resp.status_code}")
    data = resp.json()
    if resp.status_code == 200:
        # Try to find a nickname or username
        user = data.get("user", data.get("userInfo", {}).get("user", {}))
        if user:
            print(f"  WORKS! Nickname: {user.get('nickname', '?')}")
        else:
            print(f"  Response keys: {list(data.keys())}")
            print(f"  {str(data)[:300]}")
    else:
        print(f"  {str(data)[:300]}")
except Exception as e:
    print(f"Error: {e}")

print()

# Test music_detail with a RECENT viral song (Water by Tyla - 2024)
print("=== music_detail (Water by Tyla - recent) ===")
try:
    resp = requests.get(
        f"https://{HOST}/tok/v1/music_detail/",
        params={"music_id": "7304282048225568518"},
        headers=headers,
        timeout=15,
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text[:400]}")
except Exception as e:
    print(f"Error: {e}")

print()

# Test music_original_list with The Weeknd
print("=== music_original_list (The Weeknd) ===")
try:
    resp = requests.get(
        f"https://{HOST}/tok/v1/music_original_list/",
        params={
            "uid": "6833996148498359302",
            "sec_uid": "MS4wLjABAAAA-VASjiXTh7wDDyXvjk10VFhMWUAoxr8bgfO1kLqtSxAVOb2IwyYxVvXFNH3JLQ5x",
            "cursor": "0",
            "count": "5",
        },
        headers=headers,
        timeout=15,
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text[:400]}")
except Exception as e:
    print(f"Error: {e}")

print()

# Also test the OTHER API we were using: tiktok-trending-data
print("=== tiktok-trending-data.p.rapidapi.com /t ===")
try:
    resp = requests.get(
        "https://tiktok-trending-data.p.rapidapi.com/t",
        headers={
            "x-rapidapi-host": "tiktok-trending-data.p.rapidapi.com",
            "x-rapidapi-key": API_KEY,
        },
        timeout=15,
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text[:400]}")
except Exception as e:
    print(f"Error: {e}")
