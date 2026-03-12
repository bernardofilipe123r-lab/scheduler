"""Test SearchAPI directly with queries from failed Format B jobs."""
import json
import os
import subprocess
import sys
import requests

# Get SearchAPI key from Railway
result = subprocess.run(
    ['railway', 'variables', '--json'],
    capture_output=True, text=True, cwd=os.path.dirname(__file__) or '.'
)
if result.returncode != 0:
    print("Failed to get Railway variables")
    sys.exit(1)

env_vars = json.loads(result.stdout)
api_key = env_vars.get('SEARCHAPI_API_KEY')
if not api_key:
    print("SEARCHAPI_API_KEY not found in Railway vars")
    sys.exit(1)

print(f"API Key: {api_key[:8]}...")

# Test queries from the actual failed jobs
test_queries = [
    "antique brass clock mechanism macro close-up glowing blue light dark background",
    "healthy artery vs atherosclerotic artery cross-section medical photography side by side",
    "human bone tissue osteoclast activity microscope slide photomicrograph colorful",
    "elderly woman hands holding young plant seedling growth symbolism close-up",
]

SEARCHAPI_BASE_URL = "https://www.searchapi.io/api/v1/search"

for i, query in enumerate(test_queries):
    print(f"\n--- Test {i+1}: {query[:60]}... ---")
    try:
        params = {
            "engine": "google_images",
            "q": query,
            "api_key": api_key,
        }
        resp = requests.get(SEARCHAPI_BASE_URL, params=params, timeout=15)
        print(f"  Status: {resp.status_code}")

        if resp.status_code != 200:
            print(f"  Response: {resp.text[:200]}")
            continue

        data = resp.json()
        images = data.get("images", [])
        print(f"  Images returned: {len(images)}")

        if images:
            # Check first few images
            for j, img in enumerate(images[:3]):
                w = img.get("original_width", 0)
                h = img.get("original_height", 0)
                url = img.get("original", "")[:80]
                print(f"    [{j}] {w}x{h} — {url}...")
        else:
            # Show what keys are in the response
            print(f"  Response keys: {list(data.keys())}")
            # Maybe images are under a different key?
            for key in data.keys():
                val = data[key]
                if isinstance(val, list) and len(val) > 0:
                    print(f"    {key}: {len(val)} items, first item keys: {list(val[0].keys()) if isinstance(val[0], dict) else type(val[0])}")
                elif isinstance(val, dict):
                    print(f"    {key}: dict with keys {list(val.keys())[:10]}")
                else:
                    print(f"    {key}: {str(val)[:80]}")
    except Exception as e:
        print(f"  ERROR: {e}")

print("\nDone!")
