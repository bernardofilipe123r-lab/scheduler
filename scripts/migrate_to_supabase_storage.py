#!/usr/bin/env python3
"""
Migrate files from Railway volume to Supabase Storage with user-scoped paths,
and update all DB records to point to the new URLs.

Usage:
    railway run python scripts/migrate_to_supabase_storage.py
    railway run python scripts/migrate_to_supabase_storage.py --dry-run
    railway run python scripts/migrate_to_supabase_storage.py --user-id <uuid>
"""

import argparse
import json
import mimetypes
import os
import re
import sys
from pathlib import Path

import requests
from sqlalchemy import create_engine, text

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USER_ID = "7c7bdcc7-ad79-4554-8d32-e5ef02608e84"
BRAND_SLUGS = [
    "healthycollege",
    "holisticcollege",
    "longevitycollege",
    "vitalitycollege",
    "wellbeingcollege",
]
OUTPUT_DIR = Path("/app/output")

# Map local subdirectories → (bucket, category)
DIR_BUCKET_MAP = {
    "thumbnails": ("media", "thumbnails"),
    "reels": ("media", "reels"),
    "videos": ("media", "videos"),
    "posts": ("media", "posts"),
    "brand-data/logos": ("brand-assets", "logos"),
    "feedback": ("feedback", "feedback"),
}

# Fields inside brand_outputs that hold file paths
BRAND_OUTPUT_PATH_FIELDS = [
    "thumbnail_path",
    "reel_path",
    "video_path",
    "yt_thumbnail_path",
]

# Fields inside scheduled_reels.extra_data that hold file paths
EXTRA_DATA_PATH_FIELDS = [
    "video_path",
    "thumbnail_path",
    "yt_thumbnail_path",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_credentials():
    """Return (SUPABASE_URL, SUPABASE_SERVICE_KEY, DATABASE_URL)."""
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    db_url = os.environ.get("DATABASE_URL", "")
    missing = []
    if not url:
        missing.append("SUPABASE_URL")
    if not key:
        missing.append("SUPABASE_SERVICE_KEY")
    if not db_url:
        missing.append("DATABASE_URL")
    if missing:
        print(f"ERROR: Missing environment variables: {', '.join(missing)}")
        sys.exit(1)
    return url, key, db_url


def detect_brand_slug(filename: str) -> str:
    """Extract brand slug from a filename, or return 'unknown'."""
    name_lower = filename.lower()
    for slug in BRAND_SLUGS:
        if slug in name_lower:
            return slug
    return "unknown"


def build_remote_path(user_id: str, brand_slug: str, category: str, filename: str) -> str:
    """Build user-scoped remote path inside a bucket."""
    if category == "feedback":
        return f"{user_id}/feedback/{filename}"
    return f"{user_id}/{brand_slug}/{category}/{filename}"


def build_public_url(supabase_url: str, bucket: str, remote_path: str) -> str:
    return f"{supabase_url}/storage/v1/object/public/{bucket}/{remote_path}"


def guess_content_type(path: str) -> str:
    ct, _ = mimetypes.guess_type(path)
    return ct or "application/octet-stream"


def upload_file(
    supabase_url: str,
    service_key: str,
    bucket: str,
    remote_path: str,
    local_path: Path,
    dry_run: bool,
) -> tuple[bool, str]:
    """Upload a local file to Supabase Storage. Returns (success, public_url_or_error)."""
    public_url = build_public_url(supabase_url, bucket, remote_path)

    if dry_run:
        return True, public_url

    data = local_path.read_bytes()
    ct = guess_content_type(str(local_path))
    endpoint = f"{supabase_url}/storage/v1/object/{bucket}/{remote_path}"

    try:
        resp = requests.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {service_key}",
                "Content-Type": ct,
                "x-upsert": "true",
            },
            data=data,
            timeout=120,
        )
        resp.raise_for_status()
        return True, public_url
    except requests.RequestException as exc:
        return False, str(exc)


def file_exists_remote(supabase_url: str, service_key: str, bucket: str, remote_path: str) -> bool:
    """HEAD request to check if a file already exists in Supabase Storage."""
    endpoint = f"{supabase_url}/storage/v1/object/{bucket}/{remote_path}"
    try:
        resp = requests.head(
            endpoint,
            headers={"Authorization": f"Bearer {service_key}"},
            timeout=15,
        )
        return resp.status_code == 200
    except requests.RequestException:
        return False


# ---------------------------------------------------------------------------
# Step 1 – Upload local files
# ---------------------------------------------------------------------------

def upload_local_files(supabase_url: str, service_key: str, user_id: str, dry_run: bool) -> dict:
    """Walk /app/output/ and upload every file to Supabase Storage.

    Returns stats dict with counts.
    """
    stats = {"total": 0, "uploaded": 0, "skipped": 0, "failed": 0, "errors": []}

    if not OUTPUT_DIR.exists():
        print(f"WARNING: Output directory {OUTPUT_DIR} does not exist — skipping file upload.")
        return stats

    for dir_key, (bucket, category) in DIR_BUCKET_MAP.items():
        local_dir = OUTPUT_DIR / dir_key
        if not local_dir.exists():
            print(f"  Directory {local_dir} not found — skipping.")
            continue

        files = [f for f in local_dir.rglob("*") if f.is_file()]
        print(f"\n  [{bucket}/{category}] Found {len(files)} files in {local_dir}")

        for i, fpath in enumerate(files, 1):
            stats["total"] += 1
            filename = fpath.name

            brand_slug = detect_brand_slug(filename) if category != "feedback" else ""
            remote_path = build_remote_path(user_id, brand_slug, category, filename)

            # Idempotency: skip if already uploaded
            if not dry_run and file_exists_remote(supabase_url, service_key, bucket, remote_path):
                stats["skipped"] += 1
                if i % 20 == 0 or i == len(files):
                    print(f"    Progress: {i}/{len(files)} (skipped existing)")
                continue

            ok, result = upload_file(supabase_url, service_key, bucket, remote_path, fpath, dry_run)
            if ok:
                stats["uploaded"] += 1
                action = "Would upload" if dry_run else "Uploaded"
                if i % 20 == 0 or i == len(files) or stats["uploaded"] <= 3:
                    print(f"    {action} {i}/{len(files)}: {bucket}/{remote_path}")
            else:
                stats["failed"] += 1
                msg = f"FAILED {fpath} → {bucket}/{remote_path}: {result}"
                stats["errors"].append(msg)
                print(f"    {msg}")

    return stats


# ---------------------------------------------------------------------------
# Path conversion helpers for DB updates
# ---------------------------------------------------------------------------

def is_local_path(path: str) -> bool:
    """Check if a path looks like a local filesystem path."""
    return path.startswith("/output/") or path.startswith("/app/output/") or path.startswith("output/")


def is_supabase_url(path: str) -> bool:
    return "/storage/v1/object/public/" in path


def is_user_scoped_url(path: str, user_id: str) -> bool:
    """Check if a Supabase URL already contains the user_id scope."""
    return f"/{user_id}/" in path


def local_path_to_supabase_url(
    path: str,
    supabase_url: str,
    user_id: str,
) -> str | None:
    """Convert a local path like /output/thumbnails/foo.png to a Supabase public URL.

    Returns None if the path format is not recognised.
    """
    # Normalise: strip leading /app
    normalised = path
    if normalised.startswith("/app/output/"):
        normalised = normalised[len("/app"):]  # → /output/...
    if normalised.startswith("output/"):
        normalised = "/" + normalised  # → /output/...

    # Now normalised should start with /output/
    if not normalised.startswith("/output/"):
        return None

    rel = normalised[len("/output/"):]  # e.g. thumbnails/foo.png  or  brand-data/logos/logo.png

    # Determine bucket & category
    bucket = None
    category = None
    remaining = None

    if rel.startswith("brand-data/logos/"):
        bucket = "brand-assets"
        category = "logos"
        remaining = rel[len("brand-data/logos/"):]
    elif rel.startswith("feedback/"):
        bucket = "feedback"
        category = "feedback"
        remaining = rel[len("feedback/"):]
    else:
        # thumbnails/X, reels/X, videos/X, posts/X
        parts = rel.split("/", 1)
        if len(parts) == 2 and parts[0] in ("thumbnails", "reels", "videos", "posts"):
            bucket = "media"
            category = parts[0]
            remaining = parts[1]

    if not bucket or not remaining:
        return None

    filename = Path(remaining).name
    brand_slug = detect_brand_slug(filename) if category != "feedback" else ""
    remote_path = build_remote_path(user_id, brand_slug, category, filename)
    return build_public_url(supabase_url, bucket, remote_path)


def re_scope_supabase_url(
    url: str,
    supabase_url: str,
    service_key: str,
    user_id: str,
    dry_run: bool,
) -> tuple[str | None, bool]:
    """Re-upload a non-user-scoped Supabase file to a user-scoped path.

    Returns (new_url_or_None, was_changed).
    """
    # Parse: .../storage/v1/object/public/{bucket}/{old_path}
    marker = "/storage/v1/object/public/"
    idx = url.find(marker)
    if idx == -1:
        return None, False

    after = url[idx + len(marker):]  # bucket/old_path
    slash = after.find("/")
    if slash == -1:
        return None, False

    bucket = after[:slash]
    old_remote = after[slash + 1:]

    # Already user-scoped?
    if old_remote.startswith(f"{user_id}/"):
        return url, False

    # Determine category & filename from old_remote
    filename = old_remote.rsplit("/", 1)[-1]
    brand_slug = detect_brand_slug(filename)

    # Guess category from old path or bucket
    category = None
    for cat in ("thumbnails", "reels", "videos", "posts", "logos", "feedback"):
        if cat in old_remote:
            category = cat
            break
    if not category:
        # Fallback: use the first path segment
        category = old_remote.split("/")[0] if "/" in old_remote else "misc"

    new_remote = build_remote_path(user_id, brand_slug, category, filename)
    new_url = build_public_url(supabase_url, bucket, new_remote)

    if dry_run:
        return new_url, True

    # Download from old location, re-upload to new
    old_endpoint = f"{supabase_url}/storage/v1/object/{bucket}/{old_remote}"
    try:
        dl = requests.get(
            old_endpoint,
            headers={"Authorization": f"Bearer {service_key}"},
            timeout=60,
        )
        dl.raise_for_status()
    except requests.RequestException:
        return None, False

    ct = guess_content_type(filename)
    up_endpoint = f"{supabase_url}/storage/v1/object/{bucket}/{new_remote}"
    try:
        resp = requests.post(
            up_endpoint,
            headers={
                "Authorization": f"Bearer {service_key}",
                "Content-Type": ct,
                "x-upsert": "true",
            },
            data=dl.content,
            timeout=120,
        )
        resp.raise_for_status()
        return new_url, True
    except requests.RequestException:
        return None, False


def convert_path(
    path: str,
    supabase_url: str,
    service_key: str,
    user_id: str,
    dry_run: bool,
) -> tuple[str, bool]:
    """Convert a single path/URL value. Returns (new_value, was_changed)."""
    if not path or not isinstance(path, str):
        return path, False

    # Case 1: local path → build Supabase URL
    if is_local_path(path):
        new_url = local_path_to_supabase_url(path, supabase_url, user_id)
        if new_url:
            return new_url, True
        return path, False

    # Case 2: Supabase URL but not user-scoped → re-upload
    if is_supabase_url(path) and not is_user_scoped_url(path, user_id):
        new_url, changed = re_scope_supabase_url(path, supabase_url, service_key, user_id, dry_run)
        if new_url:
            return new_url, changed
        return path, False

    # Case 3: already correctly scoped → skip
    return path, False


# ---------------------------------------------------------------------------
# Step 2a – Update generation_jobs.brand_outputs
# ---------------------------------------------------------------------------

def update_generation_jobs(engine, supabase_url: str, service_key: str, user_id: str, dry_run: bool) -> dict:
    stats = {"total": 0, "updated": 0, "skipped": 0, "failed": 0, "errors": []}

    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT job_id, brand_outputs FROM generation_jobs WHERE brand_outputs IS NOT NULL")
        ).fetchall()
        print(f"\n  Found {len(rows)} generation_jobs with brand_outputs")

        for row in rows:
            stats["total"] += 1
            job_id = row[0]
            brand_outputs = row[1]
            if not brand_outputs or not isinstance(brand_outputs, dict):
                stats["skipped"] += 1
                continue

            changed = False
            new_outputs = {}
            for brand_key, brand_data in brand_outputs.items():
                if not isinstance(brand_data, dict):
                    new_outputs[brand_key] = brand_data
                    continue
                new_data = dict(brand_data)
                for field in BRAND_OUTPUT_PATH_FIELDS:
                    val = new_data.get(field)
                    if val:
                        new_val, did_change = convert_path(val, supabase_url, service_key, user_id, dry_run)
                        if did_change:
                            new_data[field] = new_val
                            changed = True
                new_outputs[brand_key] = new_data

            if changed:
                if not dry_run:
                    try:
                        conn.execute(
                            text("UPDATE generation_jobs SET brand_outputs = :bo WHERE job_id = :jid"),
                            {"bo": json.dumps(new_outputs), "jid": job_id},
                        )
                    except Exception as exc:
                        stats["failed"] += 1
                        stats["errors"].append(f"Job {job_id}: {exc}")
                        continue
                stats["updated"] += 1
                print(f"    {'Would update' if dry_run else 'Updated'} job {job_id}")
            else:
                stats["skipped"] += 1

        if not dry_run:
            conn.commit()

    return stats


# ---------------------------------------------------------------------------
# Step 2b – Update scheduled_reels.extra_data
# ---------------------------------------------------------------------------

def update_scheduled_reels(engine, supabase_url: str, service_key: str, user_id: str, dry_run: bool) -> dict:
    stats = {"total": 0, "updated": 0, "skipped": 0, "failed": 0, "errors": []}

    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT schedule_id, extra_data FROM scheduled_reels WHERE extra_data IS NOT NULL")
        ).fetchall()
        print(f"\n  Found {len(rows)} scheduled_reels with extra_data")

        for row in rows:
            stats["total"] += 1
            schedule_id = row[0]
            extra_data = row[1]
            if not extra_data or not isinstance(extra_data, dict):
                stats["skipped"] += 1
                continue

            changed = False
            new_data = dict(extra_data)

            # Scalar path fields
            for field in EXTRA_DATA_PATH_FIELDS:
                val = new_data.get(field)
                if val:
                    new_val, did_change = convert_path(val, supabase_url, service_key, user_id, dry_run)
                    if did_change:
                        new_data[field] = new_val
                        changed = True

            # carousel_paths is a list
            carousel = new_data.get("carousel_paths")
            if isinstance(carousel, list):
                new_carousel = []
                for p in carousel:
                    new_p, did_change = convert_path(p, supabase_url, service_key, user_id, dry_run)
                    if did_change:
                        changed = True
                    new_carousel.append(new_p)
                new_data["carousel_paths"] = new_carousel

            if changed:
                if not dry_run:
                    try:
                        conn.execute(
                            text("UPDATE scheduled_reels SET extra_data = :ed WHERE schedule_id = :sid"),
                            {"ed": json.dumps(new_data), "sid": schedule_id},
                        )
                    except Exception as exc:
                        stats["failed"] += 1
                        stats["errors"].append(f"Schedule {schedule_id}: {exc}")
                        continue
                stats["updated"] += 1
                print(f"    {'Would update' if dry_run else 'Updated'} schedule {schedule_id}")
            else:
                stats["skipped"] += 1

        if not dry_run:
            conn.commit()

    return stats


# ---------------------------------------------------------------------------
# Step 2c – Update brands.logo_path
# ---------------------------------------------------------------------------

def update_brand_logos(engine, supabase_url: str, service_key: str, user_id: str, dry_run: bool) -> dict:
    stats = {"total": 0, "updated": 0, "skipped": 0, "failed": 0, "errors": []}

    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, logo_path FROM brands WHERE logo_path IS NOT NULL")
        ).fetchall()
        print(f"\n  Found {len(rows)} brands with logo_path")

        for row in rows:
            stats["total"] += 1
            brand_id = row[0]
            logo_path = row[1]
            if not logo_path:
                stats["skipped"] += 1
                continue

            new_val = logo_path
            changed = False

            # Case: just a filename (e.g. "healthycollege_logo.png")
            if "/" not in logo_path and not is_supabase_url(logo_path):
                remote_path = build_remote_path(user_id, brand_id, "logos", logo_path)
                new_val = build_public_url(supabase_url, "brand-assets", remote_path)
                changed = True
            else:
                new_val, changed = convert_path(logo_path, supabase_url, service_key, user_id, dry_run)

            if changed:
                if not dry_run:
                    try:
                        conn.execute(
                            text("UPDATE brands SET logo_path = :lp WHERE id = :bid"),
                            {"lp": new_val, "bid": brand_id},
                        )
                    except Exception as exc:
                        stats["failed"] += 1
                        stats["errors"].append(f"Brand {brand_id}: {exc}")
                        continue
                stats["updated"] += 1
                print(f"    {'Would update' if dry_run else 'Updated'} brand {brand_id}: {logo_path} → {new_val}")
            else:
                stats["skipped"] += 1

        if not dry_run:
            conn.commit()

    return stats


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Migrate files from Railway volume to Supabase Storage with user-scoped paths."
    )
    parser.add_argument("--dry-run", action="store_true", help="Print what would be changed without making changes")
    parser.add_argument("--user-id", default=USER_ID, help=f"User ID (default: {USER_ID})")
    args = parser.parse_args()

    dry_run = args.dry_run
    user_id = args.user_id

    if dry_run:
        print("=" * 60)
        print("  DRY RUN — no changes will be made")
        print("=" * 60)

    print(f"\nUser ID: {user_id}")
    print(f"Output dir: {OUTPUT_DIR}")

    supabase_url, service_key, db_url = get_credentials()
    print(f"Supabase URL: {supabase_url}")
    print(f"Database: {'[connected]' if db_url else '[missing]'}")

    engine = create_engine(db_url)

    # ------------------------------------------------------------------
    # Step 1: Upload local files to Supabase Storage
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("  STEP 1: Upload local files to Supabase Storage")
    print("=" * 60)

    upload_stats = upload_local_files(supabase_url, service_key, user_id, dry_run)

    # ------------------------------------------------------------------
    # Step 2: Update DB records
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("  STEP 2: Update database records")
    print("=" * 60)

    print("\n--- 2a: generation_jobs.brand_outputs ---")
    jobs_stats = update_generation_jobs(engine, supabase_url, service_key, user_id, dry_run)

    print("\n--- 2b: scheduled_reels.extra_data ---")
    sched_stats = update_scheduled_reels(engine, supabase_url, service_key, user_id, dry_run)

    print("\n--- 2c: brands.logo_path ---")
    brand_stats = update_brand_logos(engine, supabase_url, service_key, user_id, dry_run)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("  SUMMARY")
    print("=" * 60)

    print(f"\n  File uploads:")
    print(f"    Total files found:  {upload_stats['total']}")
    print(f"    Uploaded:           {upload_stats['uploaded']}")
    print(f"    Skipped (existing): {upload_stats['skipped']}")
    print(f"    Failed:             {upload_stats['failed']}")

    print(f"\n  generation_jobs:")
    print(f"    Total rows:   {jobs_stats['total']}")
    print(f"    Updated:      {jobs_stats['updated']}")
    print(f"    Skipped:      {jobs_stats['skipped']}")
    print(f"    Failed:       {jobs_stats['failed']}")

    print(f"\n  scheduled_reels:")
    print(f"    Total rows:   {sched_stats['total']}")
    print(f"    Updated:      {sched_stats['updated']}")
    print(f"    Skipped:      {sched_stats['skipped']}")
    print(f"    Failed:       {sched_stats['failed']}")

    print(f"\n  brands:")
    print(f"    Total rows:   {brand_stats['total']}")
    print(f"    Updated:      {brand_stats['updated']}")
    print(f"    Skipped:      {brand_stats['skipped']}")
    print(f"    Failed:       {brand_stats['failed']}")

    # Collect all errors
    all_errors = (
        upload_stats["errors"]
        + jobs_stats["errors"]
        + sched_stats["errors"]
        + brand_stats["errors"]
    )
    if all_errors:
        print(f"\n  ERRORS ({len(all_errors)}):")
        for err in all_errors:
            print(f"    - {err}")
    else:
        print("\n  No errors!")

    total_failed = upload_stats["failed"] + jobs_stats["failed"] + sched_stats["failed"] + brand_stats["failed"]
    if total_failed > 0:
        print(f"\n  WARNING: {total_failed} operation(s) failed. Review errors above.")
        sys.exit(1)
    else:
        print("\n  ✅ Migration complete!" + (" (dry run)" if dry_run else ""))


if __name__ == "__main__":
    main()
