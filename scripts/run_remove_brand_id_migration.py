"""Run the niche_config brand_id removal migration."""
from dotenv import load_dotenv
load_dotenv()

from app.db_connection import get_db_session
from sqlalchemy import text


def run():
    migration_sql = open("migrations/remove_niche_config_brand_id.sql").read()

    with get_db_session() as db:
        # Run migration
        db.execute(text(migration_sql))
        db.commit()
        print("Migration executed successfully")

        # Verify
        result = db.execute(
            text("SELECT id, user_id, niche_name, updated_at FROM niche_config ORDER BY user_id")
        )
        rows = result.fetchall()
        print(f"Remaining rows: {len(rows)}")
        for r in rows:
            print(f"  id={r[0][:8]} user={r[1][:12]} niche={r[2]} updated={r[3]}")

        # Check column doesn't exist
        cols = db.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'niche_config' AND column_name = 'brand_id'"
            )
        )
        brand_col = cols.fetchall()
        print(f"brand_id column exists: {len(brand_col) > 0}")

        # Check constraints
        constraints = db.execute(
            text(
                "SELECT constraint_name FROM information_schema.table_constraints "
                "WHERE table_name = 'niche_config' AND constraint_type = 'UNIQUE'"
            )
        )
        for c in constraints.fetchall():
            print(f"Constraint: {c[0]}")


if __name__ == "__main__":
    run()
