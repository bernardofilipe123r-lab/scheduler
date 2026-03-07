"""Quick DB connectivity and lock check."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text

url = os.getenv("DATABASE_URL", "")
if not url:
    print("No DATABASE_URL found in environment")
    sys.exit(1)

print(f"Testing connection to: {url[:60]}...")
eng = create_engine(url, connect_args={"connect_timeout": 10})

try:
    with eng.connect() as c:
        r = c.execute(text("SELECT 1"))
        print(f"Connection OK: {r.fetchone()}")

        # Check for active queries / locks
        r = c.execute(text("""
            SELECT pid, state, wait_event_type, wait_event, 
                   age(now(), query_start) as duration, 
                   left(query, 120) as query_preview
            FROM pg_stat_activity
            WHERE state != 'idle' 
              AND query NOT LIKE '%pg_stat_activity%'
              AND pid != pg_backend_pid()
            ORDER BY query_start
            LIMIT 20
        """))
        rows = r.fetchall()
        if rows:
            print(f"\n{len(rows)} non-idle connections:")
            for row in rows:
                print(f"  pid={row[0]} state={row[1]} wait={row[2]}/{row[3]} duration={row[4]} query={row[5]}")
        else:
            print("No active queries found (all idle)")

        # Check lock waits
        r = c.execute(text("""
            SELECT blocked_locks.pid AS blocked_pid,
                   blocking_locks.pid AS blocking_pid,
                   blocked_activity.query AS blocked_query
            FROM pg_catalog.pg_locks blocked_locks
            JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
            JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
                AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
                AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
                AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
                AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
                AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
                AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
                AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
                AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
                AND blocking_locks.pid != blocked_locks.pid
            WHERE NOT blocked_locks.granted
            LIMIT 10
        """))
        locks = r.fetchall()
        if locks:
            print(f"\n⚠️  {len(locks)} BLOCKED QUERIES:")
            for lock in locks:
                print(f"  blocked_pid={lock[0]} by blocking_pid={lock[1]} query={lock[2][:100]}")
        else:
            print("No lock waits detected")

        # Check total connections
        r = c.execute(text("SELECT count(*) FROM pg_stat_activity"))
        total = r.fetchone()[0]
        r = c.execute(text("SHOW max_connections"))
        max_conn = r.fetchone()[0]
        print(f"\nConnections: {total} / {max_conn}")

except Exception as e:
    print(f"Connection FAILED: {e}")
    sys.exit(1)
