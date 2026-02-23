"""Fix existing Toby posts: generate slide_texts from caption paragraphs."""
from app.db_connection import SessionLocal
from app.models.scheduling import ScheduledReel
from app.models.jobs import GenerationJob
from sqlalchemy.orm.attributes import flag_modified


def split_caption_to_slides(caption: str) -> list:
    """Split a caption into slide texts, filtering out disclaimers."""
    if not caption:
        return []
    paras = [p.strip() for p in caption.split("\n\n") if p.strip()]
    slides = []
    for para in paras:
        lower = para.lower()
        # Skip disclaimer paragraphs
        if lower.startswith("\u26a0") or lower.startswith("disclaimer"):
            continue
        slides.append(para)
    return slides


def main():
    db = SessionLocal()
    try:
        # Fix scheduled_reels (extra_data metadata)
        toby_posts = db.query(ScheduledReel).filter(
            ScheduledReel.created_by == "toby"
        ).all()

        sched_fixed = 0
        for sr in toby_posts:
            md = sr.extra_data or {}
            variant = md.get("variant", "")
            existing = md.get("slide_texts") or []
            caption = sr.caption or ""

            if variant == "post" and not existing and caption:
                slides = split_caption_to_slides(caption)
                if slides:
                    new_md = dict(md)
                    new_md["slide_texts"] = slides
                    sr.extra_data = new_md
                    flag_modified(sr, "extra_data")
                    sched_fixed += 1
                    print(f"  Fixed sched {sr.schedule_id}: {len(slides)} slides")

        # Fix GenerationJob brand_outputs
        toby_jobs = db.query(GenerationJob).filter(
            GenerationJob.created_by == "toby"
        ).all()

        job_fixed = 0
        for job in toby_jobs:
            if job.variant != "post":
                continue
            bo = dict(job.brand_outputs or {})
            changed = False
            for brand, data in bo.items():
                existing = data.get("slide_texts") or data.get("content_lines") or []
                caption = data.get("caption", "")
                if not existing and caption:
                    slides = split_caption_to_slides(caption)
                    if slides:
                        data["slide_texts"] = slides
                        data["content_lines"] = slides
                        changed = True
                        print(f"  Fixed job {job.job_id}/{brand}: {len(slides)} slides")
            if changed:
                job.brand_outputs = bo
                flag_modified(job, "brand_outputs")
                job_fixed += 1

        db.commit()
        print(f"\nDone: Fixed {sched_fixed} scheduled posts and {job_fixed} jobs")
    finally:
        db.close()


if __name__ == "__main__":
    main()
