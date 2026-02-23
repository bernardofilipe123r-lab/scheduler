"""Fix existing Toby posts: append Follow @brandhandle CTA to last slide."""
import re
from app.db_connection import SessionLocal
from app.models.scheduling import ScheduledReel
from app.models.jobs import GenerationJob
from sqlalchemy.orm.attributes import flag_modified

FOLLOW_PATTERN = re.compile(r"follow\s+@", re.IGNORECASE)


def main():
    db = SessionLocal()
    try:
        toby_posts = db.query(ScheduledReel).filter(
            ScheduledReel.created_by == "toby"
        ).all()

        sched_fixed = 0
        for sr in toby_posts:
            md = sr.extra_data or {}
            if md.get("variant") != "post":
                continue
            slides = list(md.get("slide_texts") or [])  # independent copy
            if not slides:
                continue
            last = slides[-1]
            if FOLLOW_PATTERN.search(last):
                continue  # Already has Follow CTA
            # Append Follow CTA using {{brandhandle}} placeholder
            slides[-1] = last + "\n\nFollow @{{brandhandle}} to learn more about your health."
            new_md = dict(md)
            new_md["slide_texts"] = slides
            sr.extra_data = new_md
            flag_modified(sr, "extra_data")
            sched_fixed += 1
            print(f"  Fixed sched {sr.schedule_id}: appended Follow CTA")

        db.commit()
        print(f"\nDone: Fixed {sched_fixed} scheduled posts")
    finally:
        db.close()


if __name__ == "__main__":
    main()
