import psycopg2

conn = psycopg2.connect(
    'postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
    connect_timeout=15
)
cur = conn.cursor()

# Get a sample of items that would show as "scheduled" in the pipeline
cur.execute("""
    SELECT job_id, status, pipeline_status, created_by, char_length(job_id) as id_len
    FROM generation_jobs
    WHERE status = 'completed' AND (pipeline_status = 'approved' OR pipeline_status IS NULL)
    ORDER BY created_at DESC
    LIMIT 10
""")
print("Scheduled pipeline items:")
for r in cur.fetchall():
    print(f"  job_id={r[0]}, status={r[1]}, pipeline_status={r[2]}, created_by={r[3]}, id_len={r[4]}")

# Check scheduled_reels for those jobs
cur.execute("""
    SELECT sr.reel_id, sr.schedule_id, char_length(sr.reel_id) as reel_len
    FROM scheduled_reels sr
    JOIN generation_jobs gj ON sr.reel_id LIKE gj.job_id || '%%'
    WHERE gj.status = 'completed' AND (gj.pipeline_status = 'approved' OR gj.pipeline_status IS NULL)
    LIMIT 10
""")
print("\nLinked scheduled_reels:")
for r in cur.fetchall():
    print(f"  reel_id={r[0]} (len={r[2]}), schedule_id={r[1]}")

# Try to delete and rollback (test)
cur.execute("SELECT job_id FROM generation_jobs WHERE status='completed' AND pipeline_status='approved' LIMIT 1")
row = cur.fetchone()
if row:
    test_id = row[0]
    print(f"\nTest delete for job_id={test_id}:")
    try:
        cur.execute("DELETE FROM scheduled_reels WHERE user_id IS NOT NULL AND reel_id LIKE %s", (f"{test_id}%",))
        print(f"  Deleted {cur.rowcount} scheduled_reels")
        cur.execute("DELETE FROM generation_jobs WHERE job_id = %s", (test_id,))
        print(f"  Deleted {cur.rowcount} generation_jobs")
        conn.rollback()
        print("  ROLLBACK - test only, no data changed")
    except Exception as e:
        conn.rollback()
        print(f"  ERROR: {e}")
else:
    print("\nNo scheduled item to test delete")

conn.close()
