# Supabase-Only Storage Migration Spec

> Generated: 2026-02-17  
> Status: Research Complete — Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Storage Architecture](#2-current-storage-architecture)
3. [StaticFiles Mounts to Remove](#3-staticfiles-mounts-to-remove)
4. [Supabase Storage Helper API](#4-supabase-storage-helper-api)
5. [Every Write Path](#5-every-write-path)
6. [Every Read Path](#6-every-read-path)
7. [DB Fields Storing File Paths](#7-db-fields-storing-file-paths)
8. [User → Brand → File Scoping](#8-user--brand--file-scoping)
9. [Migration Plan](#9-migration-plan)

---

## 1. Executive Summary

The codebase currently uses a **dual-write** pattern: files are written to the local filesystem (`/app/output/`) AND uploaded to Supabase Storage. The local path is used as a fallback when Supabase is unconfigured or upload fails. The goal is to **remove all local file I/O**, make Supabase Storage the sole storage backend, and scope all paths under `{user_id}/{brand_slug}/...`.

### Current Flow
```
generate file → save to /app/output/... → upload to Supabase → store URL in DB
                      ↑ local fallback if Supabase fails
```

### Target Flow
```
generate file → upload bytes to Supabase → store URL in DB (no local disk)
```

---

## 2. Current Storage Architecture

### 2.1 Output Directory Structure

The output directory is resolved at startup in `app/main.py`:
```python
output_dir = Path("/app/output") if Path("/app/output").exists() else Path("output")
```

Sub-directories created:
| Directory | Purpose |
|-----------|---------|
| `/app/output/videos/` | Generated MP4 reel videos |
| `/app/output/thumbnails/` | Generated PNG thumbnails (regular + YouTube) |
| `/app/output/reels/` | Generated PNG reel content images |
| `/app/output/posts/` | Generated PNG post backgrounds + carousel slides |
| `/app/output/brand-data/logos/` | Uploaded brand logo files |
| `/app/output/feedback/` | Rejection feedback images (PNG) + metadata (JSON) |

### 2.2 Supabase Buckets

Defined in `app/services/storage/supabase_storage.py`:
```python
VALID_BUCKETS = {"media", "brand-assets", "feedback"}
```

| Bucket | Contents |
|--------|----------|
| `media` | All generated content: `thumbnails/`, `reels/`, `videos/`, `posts/` |
| `brand-assets` | Brand logos: `logos/{brand_id}_logo.{ext}` |
| `feedback` | Rejection feedback: `{feedback_id}.png`, `{feedback_id}.json` |

### 2.3 Current Path Pattern (NOT user-scoped)

All Supabase remote paths are currently flat:
```
media/thumbnails/{reel_id}_thumbnail.png
media/reels/{reel_id}_reel.png
media/videos/{reel_id}_video.mp4
media/posts/{reel_id}_background.png
media/posts/{post_id}.png
media/posts/{post_id}_slide{N}.png
brand-assets/logos/{brand_id}_logo.{ext}
feedback/{feedback_id}.png
feedback/{feedback_id}.json
```

---

## 3. StaticFiles Mounts to Remove

All in `app/main.py`:

### Mount 1: `/output` (main output directory)
```python
# Line ~96
app.mount("/output", StaticFiles(directory=str(output_dir)), name="output")
```
Serves ALL generated content (videos, thumbnails, posts, reels) via HTTP.  
**Used by**: Publishing scheduler (constructs `{public_url_base}/output/videos/{name}` for Meta API), frontend preview.

### Mount 2: `/brand-logos` (brand logo files)
```python
# Line ~103
app.mount("/brand-logos", StaticFiles(directory=str(logos_dir)), name="brand-logos")
```
Serves brand logos from `/app/output/brand-data/logos/`.  
**Used by**: Frontend brand theme display.

### Mount 3: `/assets` (React frontend static assets)
```python
# Line ~109
app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="react-assets")
```
This is for the React SPA build output — **NOT storage-related, keep as-is**.

---

## 4. Supabase Storage Helper API

**File**: `app/services/storage/supabase_storage.py`

### Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `upload_file` | `(bucket, path, file_data, content_type?) → str` | Upload bytes → returns public URL (empty string on failure) |
| `upload_from_path` | `(bucket, remote_path, local_path) → str` | Read local file + upload → returns public URL |
| `delete_file` | `(bucket, path) → bool` | Delete remote file |
| `get_public_url` | `(bucket, path) → str` | Build public URL (no network call) |
| `download_file` | `(bucket, path) → bytes` | Download file contents |
| `file_exists` | `(bucket, path) → bool` | HEAD request to check existence |
| `save_and_upload` | `(local_path, bucket, remote_path) → str` | **Main dual-write function**: upload local file → return Supabase URL, fallback to `/output/...` URL |

### Key Design Issue: `save_and_upload` fallback
```python
def save_and_upload(local_path, bucket, remote_path):
    public_url = upload_from_path(bucket, remote_path, local_path)
    if public_url:
        return public_url
    # Fallback: return a relative local path
    return f"/output/{rel}"
```
This fallback means DB records can contain EITHER Supabase URLs (`https://...`) OR local paths (`/output/...`). All consumers must handle both cases.

---

## 5. Every Write Path

### 5.1 Content Generation (Job Processor)

**File**: `app/services/content/job_processor.py`

| Function | What it writes | Local path | Supabase remote path |
|----------|---------------|------------|---------------------|
| `regenerate_brand()` | Thumbnail PNG | `output/thumbnails/{reel_id}_thumbnail.png` | `media/thumbnails/{reel_id}_thumbnail.png` |
| `regenerate_brand()` | Reel image PNG | `output/reels/{reel_id}_reel.png` | `media/reels/{reel_id}_reel.png` |
| `regenerate_brand()` | Video MP4 | `output/videos/{reel_id}_video.mp4` | `media/videos/{reel_id}_video.mp4` |
| `regenerate_brand()` | YT thumbnail PNG/JPG | `output/thumbnails/{reel_id}_yt_thumbnail.png` | `media/thumbnails/{yt_thumb_filename}` |
| `process_post_brand()` | Post background PNG | `output/posts/{reel_id}_background.png` | `media/posts/{reel_id}_background.png` |

### 5.2 Node.js Carousel Renderer

**File**: `app/main.py` → `_render_slides_node()`

| What it writes | Local path | Supabase remote path |
|---------------|------------|---------------------|
| Cover slide PNG | `/app/output/posts/post_{brand}_{uid8}.png` | `media/posts/{cover_name}` |
| Carousel slide PNGs | `/app/output/posts/post_{brand}_{uid8}_slide{N}.png` | `media/posts/{slide_name}` |

### 5.3 Schedule Post Image

**File**: `app/api/content/schedule_routes.py` → `schedule_post_image()`

| What it writes | Local path | Supabase remote path |
|---------------|------------|---------------------|
| Cover image (from base64) | `{output}/posts/{post_id}.png` | `media/posts/{post_id}.png` |
| Carousel slides (from base64) | `{output}/posts/{post_id}_slide{N}.png` | `media/posts/{post_id}_slide{N}.png` |
| Carousel metadata JSON | `{output}/posts/{post_id}_carousel.json` | *(not uploaded)* |

### 5.4 Reel Creation (Legacy)

**File**: `app/api/content/reel_routes.py`

| Function | What it writes | Local path | Supabase remote path |
|----------|---------------|------------|---------------------|
| `create_reel()` | Thumbnail | `{base}/output/thumbnails/{reel_id}.png` | `media/thumbnails/{reel_id}.png` |
| `create_reel()` | Reel image | `{base}/output/reels/{reel_id}.png` | `media/reels/{reel_id}.png` |
| `create_reel()` | Video | `{base}/output/videos/{reel_id}.mp4` | `media/videos/{reel_id}.mp4` |
| `generate_reel()` | Same 3 files | Same pattern | Same pattern |

### 5.5 Rejection Feedback

**File**: `app/api/content/feedback_routes.py`

| What it writes | Local path | Supabase remote path |
|---------------|------------|---------------------|
| Feedback image PNG | `{base}/output/feedback/{feedback_id}.png` | `feedback/{feedback_id}.png` |
| Feedback metadata JSON | `{base}/output/feedback/{feedback_id}.json` | `feedback/{feedback_id}.json` |

### 5.6 Brand Logo Upload

**Files**: `app/api/brands_routes_v2.py`, `app/api/brands/routes.py` (identical logic)

| What it writes | Local path | Supabase remote path |
|---------------|------------|---------------------|
| Brand logo | `/app/output/brand-data/logos/{brand_id}_logo.{ext}` | `brand-assets/logos/{brand_id}_logo.{ext}` |

### 5.7 Reel Download (Copy)

**File**: `app/api/content/reel_routes.py` → `download_reel()`

Copies files from `output/videos/` and `output/thumbnails/` to `reels/{brand}/`. This is a local-only developer feature — **can be removed** in Supabase-only mode.

---

## 6. Every Read Path

### 6.1 Publishing Scheduler (Critical)

**File**: `app/main.py` → `check_and_publish()` (startup scheduler)

This is the most complex reader. It resolves paths from `ScheduledReel.extra_data` metadata:

| Read action | How path is resolved |
|------------|---------------------|
| Video file for reel publishing | `metadata['video_path']` → `_resolve_output_path()` → `/app/output/videos/...` |
| Thumbnail for reel publishing | `metadata['thumbnail_path']` → same resolution |
| Post image for image publishing | `metadata['thumbnail_path']` → checks Supabase URL vs local path |
| Carousel slides | `metadata['carousel_paths']` → resolves each path |

**`_resolve_output_path()` logic**:
- If starts with `https://` → return as-is (Supabase URL)
- Strip leading `/app/`, normalize to `/app/output/...`

**Publishing URL construction** (for Meta API):
```python
# For reels (needs publicly accessible URL)
video_url = f"{public_url_base}/output/videos/{video_path.name}"
thumbnail_url = f"{public_url_base}/output/thumbnails/{thumbnail_path.name}"

# For images — prefers Supabase URL if available
if supabase_cover_url:
    image_url = supabase_cover_url
else:
    image_url = f"{public_url_base}/output/posts/{image_path.name}"
```

### 6.2 YouTube Publishing

**File**: `app/services/publishing/scheduler.py` → `publish_now()` / `_publish_to_youtube()`

- Video path: passed as `Path` object, checked with `.exists()`
- YT thumbnail: if Supabase URL → downloads to temp file for YouTube API upload
- Regular thumbnail: resolved from path with `/app/` prefix fallback

### 6.3 Carousel Repair (Startup)

**File**: `app/main.py` → `_repair_missing_carousel_images()`

Reads from `ScheduledReel.extra_data`:
- `thumbnail_path` → tries local paths like `output/posts/post_{brand}_{uid8}_background.png`
- Uses result of `_render_slides_node()` which reads background images from local disk

### 6.4 Job File Cleanup

**File**: `app/services/content/job_manager.py` → `cleanup_job_files()`

Deletes local files:
```python
output_dir / "thumbnails" / f"{reel_id}_thumbnail.png"
output_dir / "reels" / f"{reel_id}_reel.png"
output_dir / "videos" / f"{reel_id}_video.mp4"
```
Also deletes `ai_background_path` from `GenerationJob`.

### 6.5 Schedule Routes (GET /scheduled)

**File**: `app/api/content/schedule_routes.py` → `get_scheduled_posts()`

Converts filesystem paths to URL paths for frontend:
```python
if "/output/" in raw_thumb:
    thumb_url = "/output/" + raw_thumb.split("/output/", 1)[1]
```

### 6.6 Feedback Listing

**File**: `app/api/content/feedback_routes.py` → `list_rejection_feedback()`

Reads JSON files from `output/feedback/*.json` to list feedback entries.

---

## 7. DB Fields Storing File Paths

### 7.1 `brands` table (`app/models/brands.py`)

| Column | Type | Content | Example |
|--------|------|---------|---------|
| `logo_path` | `String(255)` | Logo filename (relative) | `healthycollege_logo.png` |

### 7.2 `generation_jobs` table (`app/models/jobs.py`)

| Column | Type | Content | Example |
|--------|------|---------|---------|
| `ai_background_path` | `String(500)` | AI background image path | `output/posts/GEN-123_bg.png` |
| `brand_outputs` | `JSON` | Dict containing per-brand paths | See below |

**`brand_outputs` JSON structure** (per brand):
```json
{
  "healthycollege": {
    "reel_id": "GEN-123_healthycollege",
    "thumbnail_path": "https://...supabase.../thumbnails/...",  // or "/output/..."
    "yt_thumbnail_path": "https://...supabase.../thumbnails/...",
    "reel_path": "https://...supabase.../reels/...",
    "video_path": "https://...supabase.../videos/...",
    "caption": "...",
    "yt_title": "...",
    "status": "completed"
  }
}
```

### 7.3 `scheduled_reels` table (`app/models/scheduling.py`)

| Column | Type | Content |
|--------|------|---------|
| `extra_data` | `JSON` | Metadata dict with path fields |

**`extra_data` JSON fields with file paths**:
```json
{
  "video_path": "/app/output/videos/..." or "https://...",
  "thumbnail_path": "/app/output/thumbnails/..." or "https://...",
  "yt_thumbnail_path": "/app/output/thumbnails/..." or "https://...",
  "carousel_paths": ["https://...", "https://..."],
  "title": "...",
  "slide_texts": ["..."],
  "brand": "healthycollege",
  "variant": "light",
  "platforms": ["instagram", "facebook"]
}
```

### 7.4 `youtube_channels` table

No file paths — only OAuth tokens and channel metadata.

### 7.5 `post_performances` table (`app/models/analytics.py`)

| Column | Type | Content |
|--------|------|---------|
| `source_url` | `Text` | URL of the post on the platform (not a file path) |

---

## 8. User → Brand → File Scoping

### 8.1 Current user_id Flow

```
Supabase Auth JWT → get_current_user() middleware → user["id"] (UUID string)
                                                            ↓
                                              Brand.user_id column (FK-like)
                                              GenerationJob.user_id
                                              ScheduledReel.user_id
                                              YouTubeChannel.user_id
```

**Key table relationships:**
- `brands.user_id` → Supabase Auth UUID  
- `brands.id` → brand slug (e.g., `healthycollege`)  
- `generation_jobs.user_id` → same Supabase Auth UUID  
- `generation_jobs.brands` → JSON array of brand slugs  
- `scheduled_reels.user_id` → same UUID  
- `scheduled_reels.extra_data.brand` → brand slug  

All brand API endpoints filter by `user_id` via `get_current_user()`.

### 8.2 Target Path Structure

```
{user_id}/{brand_slug}/thumbnails/{reel_id}_thumbnail.png
{user_id}/{brand_slug}/reels/{reel_id}_reel.png
{user_id}/{brand_slug}/videos/{reel_id}_video.mp4
{user_id}/{brand_slug}/posts/{reel_id}_background.png
{user_id}/{brand_slug}/posts/{post_id}.png
{user_id}/{brand_slug}/posts/{post_id}_slide{N}.png
{user_id}/{brand_slug}/logos/{brand_id}_logo.{ext}
{user_id}/feedback/{feedback_id}.png
{user_id}/feedback/{feedback_id}.json
```

### 8.3 How user_id is available at each write point

| Write location | How to get user_id |
|---------------|-------------------|
| `job_processor.regenerate_brand()` | `job.user_id` (from `GenerationJob.user_id`) |
| `job_processor.process_post_brand()` | `job.user_id` |
| `_render_slides_node()` | Needs to be passed through from scheduled reel's `user_id` |
| `schedule_post_image()` | `user["id"]` from `get_current_user()` |
| `save_rejection_feedback()` | Needs `get_current_user()` added (currently no auth) |
| `update_brand_theme()` (logo upload) | `user["id"]` from `get_current_user()` |
| `create_reel()` / `generate_reel()` | `user["id"]` (needs to be threaded through) |

---

## 9. Migration Plan

### Phase 1: Make `save_and_upload` → `upload_only` (no local write)

1. **New function** `upload_bytes(bucket, remote_path, data, content_type) → str`:
   - Upload bytes directly to Supabase (no local file needed)
   - MUST succeed or raise (no silent fallback)
   - All remote paths prefixed with `{user_id}/{brand_slug}/...`

2. **New function** `upload_from_memory(bucket, remote_path, data) → str`:
   - For PIL Images: `image.save(BytesIO)` → upload bytes
   - For videos: FFmpeg outputs to temp file → upload → delete temp

3. **Update `save_and_upload`**:
   - Remove the local fallback (`/output/...`)
   - Remove the `local_path` parameter (files generated in-memory or temp)
   - Add `user_id` and `brand_slug` parameters for path scoping

### Phase 2: Update all Write Paths

For each write location in Section 5:

| File | Change |
|------|--------|
| `job_processor.py` | Generate images/videos → upload bytes directly. Pass `user_id` + brand to upload. |
| `main.py` `_render_slides_node()` | Node.js still writes to temp dir → upload result → delete temp. Pass `user_id`. |
| `schedule_routes.py` | Decode base64 → upload bytes directly (skip writing to disk). |
| `reel_routes.py` | Same pattern as job_processor. |
| `feedback_routes.py` | Upload bytes directly. Add auth requirement. |
| `brands/routes.py` | Logo: read upload → upload bytes to Supabase. No local save. |

### Phase 3: Update all Read Paths

| File | Change |
|------|--------|
| `main.py` `check_and_publish()` | Use Supabase URLs directly for Meta API. For video publish: download from Supabase → temp file → upload to Meta → delete temp. |
| `main.py` `_repair_missing_carousel_images()` | Download background from Supabase → pass to Node renderer → upload result. |
| `scheduler.py` `publish_now()` | Construct public URLs from Supabase instead of `{public_url_base}/output/...`. For YouTube: download from Supabase URL. |
| `job_manager.py` `cleanup_job_files()` | Replace with `delete_file()` calls on Supabase paths. |
| `schedule_routes.py` `get_scheduled_posts()` | Remove `/output/` path conversion logic — all URLs are already Supabase. |
| `feedback_routes.py` `list_rejection_feedback()` | Read from Supabase (list bucket, download JSON) instead of local filesystem. |

### Phase 4: Remove Local Infrastructure

1. **Remove StaticFiles mounts** from `app/main.py`:
   - `/output` mount
   - `/brand-logos` mount
   - Keep `/assets` (React frontend)

2. **Remove directory creation** at startup:
   ```python
   # Remove these:
   output_dir.mkdir(...)
   (output_dir / "videos").mkdir(...)
   (output_dir / "thumbnails").mkdir(...)
   (output_dir / "posts").mkdir(...)
   brand_data_dir.mkdir(...)
   logos_dir.mkdir(...)
   ```

3. **Remove `output_dir` variable** and all references.

4. **Remove the `download_reel()` endpoint** in `reel_routes.py` (local-only feature).

### Phase 5: Migrate Existing Data

1. **Existing Supabase files**: Re-upload with user-scoped paths (`{user_id}/{brand}/...`).
2. **DB records**: Update all `brand_outputs` JSON, `extra_data` JSON, and `logo_path` to use new Supabase URLs.
3. **Script**: Query all `generation_jobs` and `scheduled_reels`, parse old paths, re-upload if needed, update DB records.

### Phase 6: Supabase RLS (Row Level Security)

Add bucket policies so users can only access their own files:
```sql
-- Policy: Users can read/write their own folder
CREATE POLICY "user_folder_access" ON storage.objects
  FOR ALL USING (
    bucket_id IN ('media', 'brand-assets', 'feedback')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

---

## Appendix A: Summary of All Files Touched

| File | Current Role | Changes Needed |
|------|-------------|---------------|
| `app/main.py` | StaticFiles mounts, carousel render, publish scheduler | Remove mounts, update publisher to use URLs, update carousel renderer |
| `app/services/storage/supabase_storage.py` | Dual-write helper | Remove fallback, add user-scoped paths, add `upload_bytes()` |
| `app/services/content/job_processor.py` | Generates all content files | Upload to Supabase directly, pass user_id |
| `app/services/content/job_manager.py` | Cleans up local files | Use `delete_file()` on Supabase instead |
| `app/services/publishing/scheduler.py` | Reads files for publishing | Use Supabase URLs, download-to-temp for YouTube |
| `app/api/content/schedule_routes.py` | Saves uploaded images | Upload bytes to Supabase directly |
| `app/api/content/reel_routes.py` | Legacy reel creation | Upload directly, remove download endpoint |
| `app/api/content/feedback_routes.py` | Saves feedback files | Upload bytes directly, add auth |
| `app/api/brands/routes.py` | Logo upload | Upload directly to Supabase |
| `app/api/brands_routes_v2.py` | Logo upload (duplicate) | Same changes |
| `app/models/brands.py` | `logo_path` column | Store full Supabase URL |
| `app/models/jobs.py` | `ai_background_path`, `brand_outputs` | Store Supabase URLs only |
| `app/models/scheduling.py` | `extra_data` with file paths | Store Supabase URLs only |

## Appendix B: Supabase Storage Buckets (Current vs Target)

| Bucket | Current paths | Target paths |
|--------|--------------|-------------|
| `media` | `thumbnails/{reel_id}_thumbnail.png` | `{user_id}/{brand}/thumbnails/{reel_id}_thumbnail.png` |
| `media` | `reels/{reel_id}_reel.png` | `{user_id}/{brand}/reels/{reel_id}_reel.png` |
| `media` | `videos/{reel_id}_video.mp4` | `{user_id}/{brand}/videos/{reel_id}_video.mp4` |
| `media` | `posts/{reel_id}_background.png` | `{user_id}/{brand}/posts/{reel_id}_background.png` |
| `brand-assets` | `logos/{brand_id}_logo.{ext}` | `{user_id}/{brand}/logos/{brand_id}_logo.{ext}` |
| `feedback` | `{feedback_id}.png` | `{user_id}/feedback/{feedback_id}.png` |
