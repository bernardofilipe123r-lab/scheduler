"""
Fix carousel_paths for existing posts: prepend the cover (thumbnail_path) to carousel_paths.

Uses raw SQL (psycopg2) to avoid ORM lazy-loading overhead on remote Supabase DB.

Usage:
    python3 scripts/fix_carousel_paths.py          # dry-run
    python3 scripts/fix_carousel_paths.py --apply   # apply fix
"""
import json, os, sys
from dotenv import load_dotenv; load_dotenv()
import psycopg2

def main():
    apply = "--apply" in sys.argv
    if not apply:
        print("DRY-RUN — pass --apply to update DB\n", flush=True)

    url = os.getenv("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL not set", flush=True); return

    conn = psycopg2.connect(url)
    print("Connected to DB", flush=True)
    cur = conn.cursor()

    cur.execute("""
        SELECT schedule_id, extra_data
        FROM scheduled_reels
        WHERE status = 'scheduled'
          AND extra_data->>'variant' = 'post'
          AND extra_data->'carousel_paths' IS NOT NULL
          AND extra_data->>'thumbnail_path' IS NOT NULL
    """)
    rows = cur.fetchall()
    print(f"Found {len(rows)} post-variant scheduled posts", flush=True)

    fixed = 0
    for schedule_id, ed in rows:
        if not isinstance(ed, dict):
            ed = json.loads(ed) if ed else {}
        cp = ed.get("carousel_paths") or []
        st = ed.get("slide_texts") or []
        tp = ed.get("thumbnail_path", "")

        if not cp or not tp:
            continue
        # Only fix if carousel_paths count matches slide_texts (missing cover)
        if len(cp) != len(st):
            continue
        # Already has cover prepended
        if cp[0] == tp:
            continue

        new_cp = [tp] + cp
        print(f"  [{schedule_id}] {ed.get('brand','')} — {len(cp)} -> {len(new_cp)} paths", flush=True)

        if apply:
            ed["carousel_paths"] = new_cp
            cur.execute(
                "UPDATE scheduled_reels SET extra_data = %s WHERE schedule_id = %s",
                (json.dumps(ed), schedule_id)
            )
        fixed += 1

    if apply and fixed > 0:
        conn.commit()
        print(f"\n✅ Fixed {fixed} post(s)", flush=True)
    elif apply:
        print("\nNo posts needed fixing", flush=True)
    else:
        print(f"\n{fixed} post(s) would be fixed", flush=True)

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
