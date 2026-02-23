#!/usr/bin/env python3
"""
Fix old Toby carousel posts by regenerating slide_texts using the same
AI generation flow as manual post creation (generate_post_titles_batch).

The old posts had slide_texts that were just caption paragraphs (broken hack).
This script:
1. Finds all Toby post-variant carousels with bad slide_texts
2. Calls generate_post_titles_batch(count=1) to get proper slide_texts
3. Updates the scheduled_reel extra_data with correct slide_texts
4. Clears carousel_paths so they get re-rendered at publish time via JIT

Only touches posts with status='scheduled' (not published ones).
"""
import sys
import types
from pathlib import Path

# Mock packages not available locally (same as validate_api.py)
for mod_name in [
    "PIL", "PIL.Image", "PIL.ImageDraw", "PIL.ImageFont", "PIL.ImageFilter",
    "supabase", "python_multipart",
]:
    if mod_name not in sys.modules:
        sys.modules[mod_name] = types.ModuleType(mod_name)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import json
from datetime import datetime, timezone
from sqlalchemy.orm.attributes import flag_modified
from app.db_connection import SessionLocal
from app.models.scheduling import ScheduledReel
from app.models.jobs import GenerationJob

db = SessionLocal()

# Find all Toby post-variant carousels that haven't been published
toby_posts = db.query(ScheduledReel).filter(
    ScheduledReel.created_by == "toby",
    ScheduledReel.status == "scheduled",
).order_by(ScheduledReel.created_at.desc()).all()

post_variants = [
    p for p in toby_posts 
    if (p.extra_data or {}).get("variant") == "post"
]

print(f"Found {len(post_variants)} scheduled Toby post carousels to fix")

if not post_variants:
    print("Nothing to fix!")
    db.close()
    sys.exit(0)

# Group by brand for context
from app.services.content.generator import ContentGeneratorV2
from app.services.content.niche_config_service import NicheConfigService

generator = ContentGeneratorV2()
niche_svc = NicheConfigService()

fixed = 0
failed = 0

for i, p in enumerate(post_variants):
    ed = p.extra_data or {}
    brand = ed.get("brand", "")
    title = ed.get("title", "")
    old_slides = ed.get("slide_texts", [])
    
    print(f"\n[{i+1}/{len(post_variants)}] {p.schedule_id} brand={brand}")
    print(f"  Old title: {title[:70]}")
    print(f"  Old slide_texts: {len(old_slides)} slides")
    
    # Skip already-fixed posts (avg slide length < 150 chars = proper format)
    if old_slides:
        avg_len = sum(len(s) for s in old_slides) / len(old_slides)
        if avg_len < 150:
            print(f"  SKIP — already fixed (avg {avg_len:.0f} chars/slide)")
            fixed += 1
            continue
    
    if not title:
        # Try to recover title from job
        job_id = ed.get("job_id", "")
        if job_id:
            job = db.query(GenerationJob).filter(GenerationJob.job_id == job_id).first()
            if job:
                bo = (job.brand_outputs or {}).get(brand, {})
                title = bo.get("title", "") or job.title or ""
        if not title:
            print(f"  SKIP — no title found")
            failed += 1
            continue
    
    # Get prompt context for this brand
    ctx = niche_svc.get_context(user_id=p.user_id, brand_id=brand)
    
    try:
        # Generate fresh slide_texts using the same function as manual creation
        results = generator.generate_post_titles_batch(
            count=1,
            topic_hint=title,  # Use existing title as topic hint to stay on-topic
            ctx=ctx,
        )
        
        if not results or not results[0].get("slide_texts"):
            print(f"  SKIP — AI returned no slide_texts")
            failed += 1
            continue
        
        new_result = results[0]
        new_slides = new_result.get("slide_texts", [])
        new_caption = new_result.get("caption", "")
        
        print(f"  New slide_texts: {len(new_slides)} slides")
        for j, s in enumerate(new_slides):
            preview = s[:80].replace("\n", "\\n")
            print(f"    [{j}]: {preview}...")
        
        # Update extra_data with proper slide_texts
        updated_ed = dict(ed)  # Copy to avoid mutation issues
        updated_ed["slide_texts"] = new_slides
        updated_ed["title"] = title  # Ensure title is set
        if new_caption:
            updated_ed["caption"] = new_caption
        # Clear carousel_paths so JIT re-renders at publish time
        updated_ed["carousel_paths"] = None
        
        p.extra_data = updated_ed
        flag_modified(p, "extra_data")
        
        # Also update the caption on the ScheduledReel itself
        if new_caption:
            p.caption = new_caption
        
        # Commit after each post so we don't lose progress
        db.commit()
        
        fixed += 1
        print(f"  FIXED ✓ (committed)")
        
    except Exception as e:
        db.rollback()
        print(f"  ERROR: {e}")
        failed += 1

print(f"\n{'='*60}")
print(f"DONE: Fixed {fixed} posts, {failed} failed")
print(f"{'='*60}")

db.close()
