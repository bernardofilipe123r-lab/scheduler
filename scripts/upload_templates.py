#!/usr/bin/env python3
"""One-time script to upload existing template files to Supabase Storage.

Usage:
    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python scripts/upload_templates.py

The script will:
1. Create the 'brand-assets' bucket if it doesn't exist (public).
2. Upload every PNG under assets/templates/{brand}/light mode/ to
   brand-assets/templates/{brand}/light mode/{filename}.
"""

import os
import sys
from pathlib import Path

from supabase import create_client

BUCKET = "brand-assets"


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars.")
        sys.exit(1)

    supabase = create_client(url, key)
    storage = supabase.storage

    # Ensure bucket exists (public for image serving)
    try:
        storage.get_bucket(BUCKET)
        print(f"Bucket '{BUCKET}' already exists.")
    except Exception:
        storage.create_bucket(BUCKET, options={"public": True})
        print(f"Created public bucket '{BUCKET}'.")

    templates_dir = Path(__file__).resolve().parent.parent / "assets" / "templates"
    if not templates_dir.exists():
        print(f"ERROR: templates dir not found: {templates_dir}")
        sys.exit(1)

    uploaded = 0
    for brand_dir in sorted(templates_dir.iterdir()):
        if not brand_dir.is_dir():
            continue
        brand_name = brand_dir.name
        light_dir = brand_dir / "light mode"
        if not light_dir.exists():
            print(f"  SKIP {brand_name}: no 'light mode' subdir")
            continue
        for template_file in sorted(light_dir.glob("*.png")):
            storage_path = f"templates/{brand_name}/light mode/{template_file.name}"
            data = template_file.read_bytes()
            try:
                storage.from_(BUCKET).upload(
                    storage_path,
                    data,
                    file_options={"content-type": "image/png", "upsert": "true"},
                )
                print(f"  Uploaded: {storage_path}")
                uploaded += 1
            except Exception as exc:
                print(f"  FAILED:  {storage_path} — {exc}")

    print(f"\nDone. Uploaded {uploaded} file(s).")


if __name__ == "__main__":
    main()
