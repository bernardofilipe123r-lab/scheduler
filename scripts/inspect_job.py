#!/usr/bin/env python3
"""Inspect a specific Toby job's brand_outputs to check slide_texts."""
import sys, types
for m in ['PIL','PIL.Image','PIL.ImageDraw','PIL.ImageFont','PIL.ImageFilter','supabase','python_multipart']:
    if m not in sys.modules: sys.modules[m] = types.ModuleType(m)
sys.path.insert(0, '.')

import json
from app.db_connection import SessionLocal
from app.models.jobs import GenerationJob

db = SessionLocal()

# Find the job - check for TOBY prefix pattern
target = sys.argv[1] if len(sys.argv) > 1 else "478722"
print(f"Searching for job containing '{target}'...", flush=True)

# Try exact match first
found = db.query(GenerationJob).filter(GenerationJob.job_id == target).first()

if not found:
    # Try LIKE match
    found = db.query(GenerationJob).filter(GenerationJob.job_id.ilike(f"%{target}%")).first()

if not found:
    print(f"Job containing '{target}' not found. Recent jobs:", flush=True)
    jobs = db.query(GenerationJob).order_by(GenerationJob.created_at.desc()).limit(10).all()
    for j in jobs:
        print(f"  {j.job_id} variant={j.variant} status={j.status} title={str(j.title or '')[:60]}", flush=True)
    db.close()
    sys.exit(1)

print(f"Job: {found.job_id}")
print(f"  variant: {found.variant}")
print(f"  status: {found.status}")
print(f"  title: {found.title}")
print(f"  brands: {found.brands}")
print(f"  content_lines: {json.dumps(found.content_lines or [], indent=2)[:500]}")
print()

bo = found.brand_outputs or {}
for brand, data in bo.items():
    print(f"Brand: {brand}")
    slides = data.get('slide_texts', [])
    print(f"  slide_texts: {len(slides)} items")
    for i, s in enumerate(slides):
        print(f"    [{i}]: {s[:100]}...")
    print(f"  title: {data.get('title', '(none)')[:80]}")
    cap = str(data.get('caption', ''))
    print(f"  caption: ({len(cap)} chars) {cap[:100]}...")
    print(f"  thumbnail_path: {data.get('thumbnail_path', '(none)')[:80]}")
    print(f"  status: {data.get('status', '?')}")
    cl = data.get('content_lines', [])
    print(f"  content_lines: {len(cl)} items")
    for i, c in enumerate(cl):
        print(f"    [{i}]: {c[:100]}...")

db.close()
