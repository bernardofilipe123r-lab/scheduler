"""Test the trending music fetch pipeline with the new code."""
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env
from dotenv import load_dotenv
load_dotenv()

from app.db_connection import SessionLocal
from app.services.media.trending_music_fetcher import fetch_trending_music, get_trending_tracks

db = SessionLocal()
try:
    # Run the fetch
    print("Running fetch_trending_music()...")
    result = fetch_trending_music(db)
    print(f"Result: {result}")

    if result.get("success"):
        # Check what we got
        tracks = get_trending_tracks(db, limit=50)
        print(f"\nStored {len(tracks)} tracks:")
        with_url = 0
        without_url = 0
        for t in tracks[:5]:
            has_url = bool(t.play_url)
            status = "✅" if has_url else "❌"
            print(f"  {status} '{t.title}' by {t.author} — url={'yes' if has_url else 'EMPTY'}")
            if has_url:
                with_url += 1
            else:
                without_url += 1
        for t in tracks[5:]:
            if t.play_url:
                with_url += 1
            else:
                without_url += 1
        print(f"\nTotal: {with_url} with URL, {without_url} without URL")

        # Test one URL if available
        if with_url > 0:
            import urllib.request
            for t in tracks:
                if t.play_url:
                    try:
                        req = urllib.request.Request(t.play_url, method='HEAD')
                        resp = urllib.request.urlopen(req, timeout=10)
                        print(f"\n🎵 URL test: {resp.status} OK — '{t.title}' play_url is accessible!")
                    except Exception as e:
                        print(f"\n⚠️ URL test failed for '{t.title}': {e}")
                    break
    else:
        print(f"\nFetch failed: {result.get('error', 'unknown')}")
finally:
    db.close()
    print("\nDone")
