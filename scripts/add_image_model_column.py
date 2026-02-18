"""Add image_model column to generation_jobs table."""
import psycopg2

conn = psycopg2.connect(
    "postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
)
cur = conn.cursor()

# Check if column already exists
cur.execute(
    "SELECT column_name FROM information_schema.columns "
    "WHERE table_name = 'generation_jobs' AND column_name = 'image_model'"
)
if cur.fetchone():
    print("✓ image_model column already exists")
else:
    cur.execute("ALTER TABLE generation_jobs ADD COLUMN image_model VARCHAR(50) DEFAULT NULL")
    conn.commit()
    print("✓ Added image_model column to generation_jobs table")

cur.close()
conn.close()
