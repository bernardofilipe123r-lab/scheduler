"""
Backfill missing ig_media_id for published scheduled_reels.

The mark_as_published() function had a SQLAlchemy JSON mutation detection bug
that caused post_ids to silently not be saved. This script:
1. For each brand with published reels missing post_ids
2. Calls IG Graph API to list recent media
3. Matches by caption text
4. Updates extra_data with post_ids.instagram
"""
import os
import sys
import json
import requests
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.db_connection import SessionLocal
from app.models.scheduling import ScheduledReel
from app.models.brands import Brand
from sqlalchemy.orm.attributes import flag_modified


def normalize_caption(caption: str) -> str:
    """Normalize caption for matching — first 100 chars, lowered, stripped."""
    if not caption:
        return ""
    return caption[:100].lower().strip()


def fetch_all_ig_media(ig_account_id: str, access_token: str, max_pages: int = 5):
    """Fetch recent media from IG business account, with pagination."""
    # IGAF tokens (Instagram Business Login) require graph.instagram.com
    domain = "graph.instagram.com" if access_token.startswith("IGA") else "graph.facebook.com"
    url = f"https://{domain}/v21.0/{ig_account_id}/media"
    params = {
        "fields": "id,caption,timestamp",
        "limit": 50,
        "access_token": access_token,
    }
    
    all_media = []
    for page in range(max_pages):
        resp = requests.get(url, params=params, timeout=30)
        if resp.status_code != 200:
            print(f"    IG API error {resp.status_code}: {resp.text[:200]}")
            break
        data = resp.json()
        items = data.get("data", [])
        all_media.extend(items)
        
        # Check for next page
        next_url = data.get("paging", {}).get("next")
        if not next_url:
            break
        url = next_url
        params = {}  # URL already contains all params
    
    return all_media


def main():
    db = SessionLocal()
    try:
        # Find published/partial reels missing post_ids.instagram
        all_published = (
            db.query(ScheduledReel)
            .filter(ScheduledReel.status.in_(["published", "partial"]))
            .all()
        )

        missing = []
        for reel in all_published:
            extra = reel.extra_data or {}
            post_ids = extra.get("post_ids", {})
            if post_ids.get("instagram"):
                continue  # Already has IG media ID
            
            # Skip reels where Instagram explicitly failed (nothing to backfill)
            error = reel.publish_error or ""
            if "instagram:" in error.lower():
                continue
            
            missing.append(reel)

        print(f"Found {len(missing)} reels to backfill (IG succeeded but post_ids missing)")
        print(f"  Total published/partial: {len(all_published)}")
        print(f"  Already have post_ids: {len(all_published) - len(missing) - sum(1 for r in all_published if 'instagram:' in (r.publish_error or '').lower() and not (r.extra_data or {}).get('post_ids', {}).get('instagram'))}")
        print(f"  IG failed (skipped): {sum(1 for r in all_published if 'instagram:' in (r.publish_error or '').lower())}")

        if not missing:
            print("Nothing to backfill!")
            return

        # Group by brand
        brand_reels_map = {}
        for reel in missing:
            brand_name = (reel.extra_data or {}).get("brand")
            if brand_name:
                brand_reels_map.setdefault(brand_name, []).append(reel)

        print(f"Brands to backfill: {', '.join(sorted(brand_reels_map.keys()))}")

        # Get brand credentials
        brand_names = list(brand_reels_map.keys())
        brands = db.query(Brand).filter(Brand.id.in_(brand_names)).all()
        brand_creds = {b.id: b for b in brands}

        matched = 0
        unmatched = 0

        for brand_name in sorted(brand_reels_map.keys()):
            brand = brand_creds.get(brand_name)
            if not brand or not brand.instagram_business_account_id or not brand.instagram_access_token:
                print(f"\n  [{brand_name}] No IG credentials, skipping")
                unmatched += len(brand_reels_map[brand_name])
                continue

            print(f"\n  [{brand_name}] Fetching IG media...")
            ig_media = fetch_all_ig_media(
                brand.instagram_business_account_id,
                brand.instagram_access_token,
            )
            print(f"    Got {len(ig_media)} media items from IG")

            # Build caption -> media_id lookup (normalized)
            caption_map = {}
            for item in ig_media:
                cap = normalize_caption(item.get("caption", ""))
                if cap and cap not in caption_map:
                    caption_map[cap] = item["id"]

            brand_reels = brand_reels_map[brand_name]
            for reel in brand_reels:
                reel_caption = normalize_caption(reel.caption or "")
                if not reel_caption:
                    print(f"    [{reel.schedule_id}] No caption, skipping")
                    unmatched += 1
                    continue

                ig_id = caption_map.get(reel_caption)
                
                # Fallback: try shorter prefix match (first 60 chars)
                if not ig_id:
                    short = reel_caption[:60]
                    for cap, mid in caption_map.items():
                        if cap.startswith(short):
                            ig_id = mid
                            break

                if ig_id:
                    extra = dict(reel.extra_data or {})
                    if "post_ids" not in extra:
                        extra["post_ids"] = {}
                    extra["post_ids"]["instagram"] = ig_id
                    if "publish_results" not in extra:
                        extra["publish_results"] = {}
                    if "instagram" not in extra.get("publish_results", {}):
                        extra["publish_results"]["instagram"] = {
                            "post_id": ig_id,
                            "success": True,
                            "backfilled": True,
                        }
                    reel.extra_data = extra
                    flag_modified(reel, "extra_data")
                    matched += 1
                    print(f"    [{reel.schedule_id}] Matched -> {ig_id}")
                else:
                    unmatched += 1
                    cap_preview = reel_caption[:60]
                    print(f"    [{reel.schedule_id}] No match. Caption: {cap_preview}...")

        print(f"\n{'='*60}")
        print(f"Results: {matched} matched, {unmatched} unmatched")

        if matched > 0:
            print(f"Committing {matched} updates...")
            db.commit()
            print("Done!")
        else:
            print("No matches — nothing to commit.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
