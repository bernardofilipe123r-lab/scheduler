"""Run the updated_at migration for generation_jobs - step by step."""
import psycopg2

print("Starting migration...", flush=True)

DB_URL = "postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

conn = psycopg2.connect(DB_URL, connect_timeout=15)
print("Connected!", flush=True)
conn.autocommit = True
cur = conn.cursor()

# First check if column already exists
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'generation_jobs' AND column_name = 'updated_at'")
exists = cur.fetchone()
print(f"Column exists: {bool(exists)}", flush=True)

if not exists:
    # Add bare nullable column - absolutely instant, no default, no constraint
    print("Adding column (nullable, no default)...", flush=True)
    cur.execute("ALTER TABLE generation_jobs ADD COLUMN updated_at TIMESTAMPTZ")
    print("OK: Column added", flush=True)

# Backfill in batches to avoid timeout
print("Backfilling existing rows...", flush=True)
cur.execute("UPDATE generation_jobs SET updated_at = COALESCE(completed_at, started_at, created_at, now()) WHERE updated_at IS NULL")
cur.execute("SELECT COUNT(*) FROM generation_jobs WHERE updated_at IS NULL")
nulls = cur.fetchone()[0]
print(f"Remaining nulls: {nulls}", flush=True)

if nulls == 0:
    print("Setting NOT NULL + DEFAULT...", flush=True)
    cur.execute("ALTER TABLE generation_jobs ALTER COLUMN updated_at SET DEFAULT now()")
    cur.execute("ALTER TABLE generation_jobs ALTER COLUMN updated_at SET NOT NULL")
    print("OK: Constraints set", flush=True)

# Create trigger
print("Creating trigger...", flush=True)
cur.execute("CREATE OR REPLACE FUNCTION trigger_set_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql")
cur.execute("DROP TRIGGER IF EXISTS set_updated_at ON generation_jobs")
cur.execute("CREATE TRIGGER set_updated_at BEFORE UPDATE ON generation_jobs FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()")
print("OK: Trigger created", flush=True)

# Verify
cur.execute("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'generation_jobs' AND column_name = 'updated_at'")
print(f"Result: {cur.fetchall()}", flush=True)
conn.close()
print("Migration complete!", flush=True)
