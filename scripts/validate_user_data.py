import psycopg2

conn = psycopg2.connect("postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres")
cur = conn.cursor()

# Check user exists
cur.execute("SELECT id, email FROM auth.users WHERE id = '7c7bdcc7-ad79-4554-8d32-e5ef02608e84'")
print("User:", cur.fetchone())

# Check brands are preserved
cur.execute("SELECT id, display_name, short_name FROM brands WHERE user_id = '7c7bdcc7-ad79-4554-8d32-e5ef02608e84'")
brands = cur.fetchall()
print(f"Brands ({len(brands)}):", brands)

# Check generation_jobs are preserved
cur.execute("SELECT COUNT(*) FROM generation_jobs WHERE user_id = '7c7bdcc7-ad79-4554-8d32-e5ef02608e84'")
print("Generation jobs:", cur.fetchone())

# Check content_history is preserved
cur.execute("SELECT COUNT(*) FROM content_history WHERE user_id = '7c7bdcc7-ad79-4554-8d32-e5ef02608e84'")
print("Content history:", cur.fetchone())

# Check niche_config table exists and current state
cur.execute("SELECT COUNT(*) FROM niche_config")
print("Niche configs:", cur.fetchone())

# Check if any brand settings were affected
cur.execute("SELECT id, display_name, short_name, active FROM brands WHERE user_id = '7c7bdcc7-ad79-4554-8d32-e5ef02608e84' LIMIT 10")
print("Brand details:", cur.fetchall())

conn.close()
