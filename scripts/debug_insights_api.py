"""Debug the IG Insights API response to understand why plays/saves/shares fail."""
import os, sys, requests
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db_connection import SessionLocal
from app.models.brands import Brand

db = SessionLocal()
try:
    # Get a brand with valid token
    brand = db.query(Brand).filter(Brand.id == 'vitalitycollege').first()
    token = brand.meta_access_token or brand.instagram_access_token
    
    # Get a known IG media ID  
    ig_media_id = "18089168060323070"  # vitalitycollege post
    
    BASE = "https://graph.instagram.com/v21.0"
    
    # 1. Test full insights call (the one that 400s)
    print("=== Test 1: Full insights (plays,reach,saved,shares) ===")
    resp = requests.get(f"{BASE}/{ig_media_id}/insights", params={
        "metric": "plays,reach,saved,shares",
        "access_token": token,
    }, timeout=15)
    print(f"HTTP {resp.status_code}")
    print(f"Response: {resp.json()}")
    
    # 2. Try individual metrics
    for metric in ["plays", "reach", "saved", "shares", "ig_reels_aggregated_all_plays_count", "ig_reels_video_view_total_count", "total_interactions"]:
        print(f"\n=== Test: {metric} ===")
        resp = requests.get(f"{BASE}/{ig_media_id}/insights", params={
            "metric": metric,
            "access_token": token,
        }, timeout=15)
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            for item in data:
                values = item.get("values", [{}])
                value = values[0].get("value", "N/A") if values else "N/A"
                print(f"  {item.get('name')}: {value}")
        else:
            print(f"  HTTP {resp.status_code}: {resp.json().get('error', {}).get('message', resp.text[:200])}")
    
    # 3. Try the media fields endpoint for play_count
    print(f"\n=== Test: Media fields (play_count etc) ===")
    resp = requests.get(f"{BASE}/{ig_media_id}", params={
        "fields": "like_count,comments_count,play_count,media_type,timestamp",
        "access_token": token,
    }, timeout=15)
    print(f"HTTP {resp.status_code}")
    if resp.status_code == 200:
        print(f"Response: {resp.json()}")
    else:
        print(f"Error: {resp.json()}")

finally:
    db.close()
