"""
One-off script: Set onboarding_completed=True in user_metadata for all existing users.
Safe to run multiple times — skips users who already have the flag.
"""
import os, requests
from dotenv import load_dotenv

load_dotenv()

url = os.environ["SUPABASE_URL"].rstrip("/")
key = os.environ["SUPABASE_SERVICE_KEY"]

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
}

# List all users (paginated)
all_users = []
page = 1
while True:
    r = requests.get(
        f"{url}/auth/v1/admin/users",
        headers=headers,
        params={"page": page, "per_page": 100},
        timeout=15,
    )
    if r.status_code != 200:
        print(f"Error listing users: {r.status_code} {r.text}")
        break
    data = r.json()
    batch = data.get("users", [])
    all_users.extend(batch)
    if len(batch) < 100:
        break
    page += 1

print(f"Total users found: {len(all_users)}")

updated = 0
already_set = 0
errors = 0

for u in all_users:
    uid = u["id"]
    email = u.get("email", "")
    meta = u.get("user_metadata") or {}

    if meta.get("onboarding_completed") is True:
        already_set += 1
        print(f"  SKIP  {email}")
    else:
        # Merge — preserve existing metadata fields
        new_meta = {**meta, "onboarding_completed": True}
        r2 = requests.put(
            f"{url}/auth/v1/admin/users/{uid}",
            headers=headers,
            json={"user_metadata": new_meta},
            timeout=15,
        )
        if r2.status_code == 200:
            updated += 1
            print(f"  SET   {email}")
        else:
            errors += 1
            print(f"  ERROR {email}: {r2.status_code} {r2.text}")

print(f"\nDone. Updated: {updated}  |  Already had flag: {already_set}  |  Errors: {errors}")
