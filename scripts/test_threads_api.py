#!/usr/bin/env python3
"""Test Threads API call to diagnose publishing error."""
import psycopg2
import requests

DB_URL = "postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

conn = psycopg2.connect(DB_URL, connect_timeout=15)
cur = conn.cursor()
cur.execute("""
SELECT id, threads_access_token, threads_user_id
FROM brands
WHERE id = 'thegainscollege'
""")
row = cur.fetchone()
conn.close()

if not row:
    print("Brand not found!")
    exit(1)

brand_id, token, user_id = row
print(f"Brand: {brand_id}")
print(f"Threads user ID: {user_id}")
print(f"Token prefix: {token[:10]}...")

# Test 1: Try GET /me to verify token works
print("\n=== Test 1: GET /me (token validation) ===")
resp = requests.get(
    f"https://graph.threads.net/v21.0/me",
    params={"fields": "id,username,threads_profile_picture_url", "access_token": token},
    timeout=15,
)
print(f"Status: {resp.status_code}")
print(f"Response: {resp.json()}")

# Test 2: Try creating a container (the exact call that fails)
print("\n=== Test 2: POST /{user_id}/threads (container creation - DRY RUN) ===")
resp2 = requests.post(
    f"https://graph.threads.net/v21.0/{user_id}/threads",
    data={
        "text": "TEST - will delete (DO NOT PUBLISH)",
        "media_type": "TEXT",
        "access_token": token,
    },
    timeout=15,
)
print(f"Status: {resp2.status_code}")
print(f"Response: {resp2.json()}")

# If container was created, DON'T publish it
if resp2.status_code == 200:
    container_id = resp2.json().get("id")
    print(f"\nContainer created (NOT publishing): {container_id}")
    print("Container will expire automatically. Thread NOT published.")
