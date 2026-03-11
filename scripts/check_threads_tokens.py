#!/usr/bin/env python3
"""Check Threads token configuration for all brands."""
import psycopg2

DB_URL = "postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

conn = psycopg2.connect(DB_URL, connect_timeout=15)
cur = conn.cursor()
cur.execute("""
SELECT id, display_name,
       CASE WHEN threads_access_token IS NOT NULL THEN LEFT(threads_access_token, 20) || '...' ELSE 'NULL' END,
       threads_user_id,
       CASE WHEN meta_access_token IS NOT NULL THEN LEFT(meta_access_token, 20) || '...' ELSE 'NULL' END,
       threads_token_expires_at,
       threads_token_last_refreshed_at
FROM brands
WHERE threads_access_token IS NOT NULL AND threads_user_id IS NOT NULL
ORDER BY display_name
LIMIT 20
""")
rows = cur.fetchall()
for r in rows:
    print(f"Brand: {r[1]} (id={r[0]})")
    print(f"  threads_token: {r[2]}")
    print(f"  threads_user_id: {r[3]}")
    print(f"  meta_token: {r[4]}")
    print(f"  threads_expires_at: {r[5]}")
    print(f"  threads_last_refreshed: {r[6]}")
    print()

# Also check: are threads_access_token and meta_access_token the same?
cur.execute("""
SELECT id, display_name,
       (threads_access_token = meta_access_token) as tokens_same,
       threads_user_id,
       instagram_business_account_id
FROM brands
WHERE threads_access_token IS NOT NULL AND threads_user_id IS NOT NULL
ORDER BY display_name
LIMIT 20
""")
rows2 = cur.fetchall()
print("=== TOKEN COMPARISON ===")
for r in rows2:
    print(f"Brand: {r[1]} | tokens_same: {r[2]} | threads_uid: {r[3]} | ig_account_id: {r[4]}")

conn.close()
