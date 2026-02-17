# Supabase Storage Migration Spec — Complete Output Directory Audit

> **Status:** Research complete — not yet implemented  
> **Date:** 2025-02-17  
> **Scope:** ALL file I/O touching `output/`, `/app/output`, brand logos, and local media storage

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [All Code Paths — WRITE Operations](#2-all-code-paths--write-operations)
3. [All Code Paths — READ / SERVE Operations](#3-all-code-paths--read--serve-operations)
4. [All Code Paths — URL Generation / Path References](#4-all-code-paths--url-generation--path-references)
5. [Frontend References](#5-frontend-references)
6. [Config / Infrastructure References](#6-config--infrastructure-references)
7. [Auxiliary Local Files (JSON, etc.)](#7-auxiliary-local-files-json-etc)
8. [Supabase Storage Buckets to Create](#8-supabase-storage-buckets-to-create)
9. [Files to Modify](#9-files-to-modify)
10. [Migration Plan](#10-migration-plan)
11. [Transition Strategy](#11-transition-strategy)

---

## 1. Architecture Overview

### Current State

All generated media lives on the Docker container's **local filesystem** at `/app/output/` (Railway deployment) or `output/` (local dev). Railway provides a persistent volume mount, but if the volume fails or isn't attached, **all generated media is lost**.

```
/app/output/
├── videos/          # MP4 reel videos (~2-5 MB each)
├── thumbnails/      # PNG/JPG thumbnails (~50-200 KB each)
├── reels/           # PNG reel images (~200-500 KB each)
├── posts/           # PNG post backgrounds + carousel slides (~100-500 KB each)
├── brand-data/
│   └── logos/       # User-uploaded brand logos (~10-500 KB each)
├── feedback/        # Rejection feedback images + JSON metadata
└── schedules/       # (empty, created but unused)
```

### Static File Serving

FastAPI's `StaticFiles` mounts make `output/` accessible via HTTP:
- `/output/*` → serves all generated media
- `/brand-logos/*` → serves brand logos from `output/brand-data/logos/`

Social publishers (Instagram, Facebook, YouTube) consume media via public URLs like:
`https://{RAILWAY_DOMAIN}/output/videos/{reel_id}_video.mp4`

---

## 2. All Code Paths — WRITE Operations

### 2.1 Reel Generation (Thumbnails, Reel Images, Videos)

| # | File | Line(s) | What It Writes | Persistence |
|---|------|---------|---------------|-------------|
| W1 | `app/services/content/job_processor.py` | L123-128 | `output/thumbnails/{reel_id}_thumbnail.png` — Branded thumbnail with text | **Permanent** — served to users, used for publishing |
| W2 | `app/services/content/job_processor.py` | L127 | `output/reels/{reel_id}_reel.png` — Full reel image with content | **Permanent** — used as video frame source |
| W3 | `app/services/content/job_processor.py` | L128 | `output/videos/{reel_id}_video.mp4` — Generated video from reel image | **Permanent** — published to Instagram/Facebook/YouTube |
| W4 | `app/services/content/job_processor.py` | L259 | `output/thumbnails/{reel_id}_yt_thumbnail.png` — Clean AI YouTube thumbnail | **Permanent** — uploaded to YouTube |
| W5 | `app/services/media/image_generator.py` | L187-199 | Thumbnail PNG/JPG saved via `image.save(output_path)` | **Permanent** — called by W1 |
| W6 | `app/services/media/image_generator.py` | L331-332 | Reel image saved via `image.save(output_path)` | **Permanent** — called by W2 |
| W7 | `app/services/media/image_generator.py` | L660-661 | Reel image (alt method) saved via `image.save(output_path, 'PNG')` | **Permanent** — called by W2 |
| W8 | `app/services/media/video_generator.py` | L25-103 | Video MP4 via FFmpeg subprocess | **Permanent** — called by W3 |
| W9 | `app/utils/ffmpeg.py` | L26-128 | FFmpeg video rendering to `output_path` | **Permanent** — low-level video write |
| W10 | `app/utils/ffmpeg.py` | L194-244 | FFmpeg audio processing to `output_path` | **Temporary** — intermediate audio file |

### 2.2 Post Background Generation (Maestro flow)

| # | File | Line(s) | What It Writes | Persistence |
|---|------|---------|---------------|-------------|
| W11 | `app/services/content/job_processor.py` | L362-385 | `output/posts/{job_id}_{brand}_background.png` — AI-generated post background | **Permanent** — displayed in UI, published |

### 2.3 Carousel Slide Rendering (Node.js Konva)

| # | File | Line(s) | What It Writes | Persistence |
|---|------|---------|---------------|-------------|
| W12 | `app/main.py` | L161 | `output/posts/post_{brand}_{uid8}.png` — Composed cover slide | **Permanent** — published as carousel cover |
| W13 | `app/main.py` | L163 | `output/posts/post_{brand}_{uid8}_slide{N}.png` — Composed text slides | **Permanent** — published as carousel pages |

### 2.4 Manual Post Scheduling (base64 image save)

| # | File | Line(s) | What It Writes | Persistence |
|---|------|---------|---------------|-------------|
| W14 | `app/api/content/schedule_routes.py` | L753-770 | `output/posts/{post_id}.png` — Cover image from base64 | **Permanent** — published |
| W15 | `app/api/content/schedule_routes.py` | L773-777 | `output/posts/{post_id}_slide{N}.png` — Carousel slides from base64 | **Permanent** — published |

### 2.5 Simple Reel Generation (reel_routes.py)

| # | File | Line(s) | What It Writes | Persistence |
|---|------|---------|---------------|-------------|
| W16 | `app/api/content/reel_routes.py` | L76-80 | `output/thumbnails/{reel_id}.png` | **Permanent** |
| W17 | `app/api/content/reel_routes.py` | L76-80 | `output/reels/{reel_id}.png` | **Permanent** |
| W18 | `app/api/content/reel_routes.py` | L76-80 | `output/videos/{reel_id}.mp4` | **Permanent** |
| W19 | `app/api/content/reel_routes.py` | L222-265 | Same paths via `/generate` endpoint | **Permanent** |

### 2.6 Brand Logo Upload

| # | File | Line(s) | What It Writes | Persistence |
|---|------|---------|---------------|-------------|
| W20 | `app/api/brands_routes_v2.py` | L637-646 | `output/brand-data/logos/{brand_id}_logo.{ext}` — User-uploaded brand logo | **Permanent** — displayed in UI, used in image generation |
| W21 | `app/api/brands/routes.py` | L659-668 | Same as W20 (duplicate routes file) | **Permanent** |

### 2.7 Rejection Feedback

| # | File | Line(s) | What It Writes | Persistence |
|---|------|---------|---------------|-------------|
| W22 | `app/api/content/feedback_routes.py` | L43-50 | `output/feedback/{feedback_id}.png` — Screenshot of rejected content | **Permanent** — for manual review |
| W23 | `app/api/content/feedback_routes.py` | L53-63 | `output/feedback/{feedback_id}.json` — Rejection metadata | **Permanent** — for manual review |

### 2.8 Reel Download (copy to reels/ folder)

| # | File | Line(s) | What It Writes | Persistence |
|---|------|---------|---------------|-------------|
| W24 | `app/api/content/reel_routes.py` | L361-362 | `reels/{brand}/{N}.mp4` and `reels/{brand}/{N}.png` — Copied files | **Permanent** — local download archive (outside output/) |

### 2.9 In-Memory Only (no local file write)

| # | File | Line(s) | What It Does | Persistence |
|---|------|---------|-------------|-------------|
| M1 | `app/api/content/routes.py` | L205-219 | `generate_post_background` — Returns base64 PNG in response, no file saved | **None** — in-memory only |
| M2 | `app/api/content/routes.py` | L270-285 | `generate_background` — Returns base64 PNG in response, no file saved | **None** — in-memory only |
| M3 | `app/api/content/prompts_routes.py` | L172 | Test image generation — Returns base64 JPEG, no file saved | **None** — in-memory only |

---

## 3. All Code Paths — READ / SERVE Operations

### 3.1 StaticFiles Mounts (FastAPI)

| # | File | Line(s) | Mount Path | Serves From | Purpose |
|---|------|---------|-----------|------------|---------|
| R1 | `app/main.py` | L111 | `/output` | `output_dir` (= `/app/output` or `output/`) | **All generated media** — videos, thumbnails, posts, reels |
| R2 | `app/main.py` | L119 | `/brand-logos` | `output/brand-data/logos/` | **Brand logo images** for UI display |
| R3 | `app/main.py` | L128 | `/assets` | `dist/assets/` | React frontend static assets (not media) |

### 3.2 File Reads for Publishing

| # | File | Line(s) | What It Reads | Purpose |
|---|------|---------|--------------|---------|
| R4 | `app/main.py` | L480-482 | `output/posts/{reel_id}_background.png` or `{reel_id}.png` | Auto-publish daemon reads post image for Instagram/Facebook |
| R5 | `app/main.py` | L597-599 | `output/videos/{reel_id}_video.mp4` or `{reel_id}.mp4` | Auto-publish daemon reads video for reel publishing |
| R6 | `app/main.py` | L607-611 | `output/thumbnails/{reel_id}_thumbnail.png` / `.png` / `.jpg` | Auto-publish daemon reads thumbnail |
| R7 | `app/services/publishing/scheduler.py` | L676-688 | YouTube thumbnail path resolution (`/output/thumbnails/...` → `/app/output/...`) | YouTube publisher reads thumbnail file |
| R8 | `app/services/publishing/scheduler.py` | L772-790 | Thumbnail path resolution for YouTube upload | Direct file read for YouTube API upload |

### 3.3 File Reads for Repair/Carousel Re-composition

| # | File | Line(s) | What It Reads | Purpose |
|---|------|---------|--------------|---------|
| R9 | `app/main.py` | L246 | `output/posts/post_{brand}_{uid8}_background.png` | Background image for carousel re-composition |

### 3.4 File Deletion (Cleanup)

| # | File | Line(s) | What It Deletes | Purpose |
|---|------|---------|----------------|---------|
| D1 | `app/services/content/job_manager.py` | L210-232 | `output/thumbnails/{reel_id}_thumbnail.png`, `output/reels/{reel_id}_reel.png`, `output/videos/{reel_id}_video.mp4` | Job cleanup — removes generated files |
| D2 | `app/services/content/job_manager.py` | L236-238 | `ai_background_path` (arbitrary path) | Cleanup AI background file |

---

## 4. All Code Paths — URL Generation / Path References

### 4.1 Paths Stored in Database (via job metadata)

| # | File | Line(s) | Path Format Stored | Used By |
|---|------|---------|-------------------|---------|
| P1 | `app/services/content/job_processor.py` | L280 | `/output/thumbnails/{reel_id}_thumbnail.png` | Job detail UI, auto-publish |
| P2 | `app/services/content/job_processor.py` | L281 | `/output/thumbnails/{reel_id}_yt_thumbnail.png` | YouTube publishing |
| P3 | `app/services/content/job_processor.py` | L282 | `/output/reels/{reel_id}_reel.png` | Job detail UI |
| P4 | `app/services/content/job_processor.py` | L283 | `/output/videos/{reel_id}_video.mp4` | Job detail UI, auto-publish |
| P5 | `app/services/content/job_processor.py` | L393 | `/output/posts/{reel_id}_background.png` | Post detail UI |
| P6 | `app/services/content/job_processor.py` | L394 | `/output/posts/{reel_id}_background.png?t={cache_bust}` | Post thumbnail URL with cache buster |

### 4.2 Paths Returned in API Responses

| # | File | Line(s) | Response Path | Consumed By |
|---|------|---------|-------------|------------|
| P7 | `app/api/content/reel_routes.py` | L285-286 | `/output/thumbnails/{reel_id}.png`, `/output/videos/{reel_id}.mp4` | Frontend `JobDetail.tsx` |
| P8 | `app/api/content/reel_routes.py` | L294-296 | `/output/thumbnails/`, `/output/reels/`, `/output/videos/` | Frontend response display |
| P9 | `app/api/content/schedule_routes.py` | L336-354 | `/output/{type}/{filename}` — normalized from raw DB paths | Frontend `Scheduled.tsx` |
| P10 | `app/api/schemas.py` | L135-137 | Example paths in schema docs | Documentation only |

### 4.3 Public URL Construction for Social Publishing

| # | File | Line(s) | URL Pattern | Used For |
|---|------|---------|-----------|---------|
| U1 | `app/main.py` | L522 | `https://{RAILWAY_DOMAIN}/output/posts/{filename}` | Instagram/Facebook image post URL |
| U2 | `app/main.py` | L541,551 | `https://{RAILWAY_DOMAIN}/output/posts/{slide_name}` | Carousel slide URLs |
| U3 | `app/services/publishing/scheduler.py` | L637 | `https://{RAILWAY_DOMAIN}/output/videos/{filename}` | Instagram/Facebook reel video URL |
| U4 | `app/services/publishing/scheduler.py` | L638 | `https://{RAILWAY_DOMAIN}/output/thumbnails/{filename}` | Instagram/Facebook thumbnail URL |

### 4.4 Path Normalization Logic

| # | File | Line(s) | Function | What It Does |
|---|------|---------|---------|-------------|
| N1 | `app/main.py` | L448-461 | `_resolve_output_path()` | Strips `/app` prefix, normalizes to `/app/{relative}` for Docker |
| N2 | `app/api/content/schedule_routes.py` | L335-354 | Inline normalization | Extracts `/output/...` from raw DB paths via `split("/output/", 1)` |
| N3 | `app/services/publishing/scheduler.py` | L676-688 | Inline resolution | Resolves `/output/...` → `/app/output/...` for YouTube thumbnail |
| N4 | `app/services/publishing/scheduler.py` | L772-790 | Inline resolution | Same pattern for YouTube thumbnail in publish method |

---

## 5. Frontend References

### 5.1 Direct `/output/` URL Usage

| # | File | Line(s) | URL Pattern | Purpose |
|---|------|---------|-----------|---------|
| F1 | `src/pages/Scheduled.tsx` | L1128 | `/output/posts/${reel_id}_background.png` | Post preview background in schedule detail |
| F2 | `src/pages/Scheduled.tsx` | L938 | `post.thumbnail_path` (from API, starts with `/output/`) | Thumbnail preview in schedule list |
| F3 | `src/pages/Scheduled.tsx` | L1262,1271 | `selectedPost.thumbnail_path`, `selectedPost.video_path` | Media preview in detail panel |

### 5.2 `/brand-logos/` Usage

| # | File | Line(s) | URL Pattern | Purpose |
|---|------|---------|-----------|---------|
| F4 | `src/pages/Scheduled.tsx` | L144 | `/brand-logos/${theme.logo}` | Brand logo in schedule list |
| F5 | `src/pages/PostJobDetail.tsx` | L143 | `/brand-logos/${theme.logo}` | Brand logo in post job detail |
| F6 | `src/pages/Connected.tsx` | L280 | `/brand-logos/${themeData.theme.logo}` | Brand logo on connected accounts page |

### 5.3 Paths from API Responses (indirect `/output/` refs)

| # | File | Line(s) | Field | Purpose |
|---|------|---------|-------|---------|
| F7 | `src/pages/JobDetail.tsx` | L139-141,564-614 | `output.thumbnail_path`, `output.video_path`, `output.yt_thumbnail_path` | Media previews in job detail |
| F8 | `src/pages/PostJobDetail.tsx` | L615,1197 | `output.thumbnail_path` | Post background preview |
| F9 | `src/features/scheduling/api/scheduling-api.ts` | L27-30,98-99 | `thumbnail_path`, `video_path`, `yt_thumbnail_path` | TypeScript types + API response mapping |
| F10 | `src/shared/types/index.ts` | L21 | `thumbnail_path?: string` | Type definition |

---

## 6. Config / Infrastructure References

### 6.1 Dockerfile

| Line | Code | Purpose |
|------|------|---------|
| L77 | `RUN mkdir -p output/videos output/thumbnails output/reels output/schedules output/posts` | Creates output directory structure in container |

### 6.2 main.py Initialization

| Line | Code | Purpose |
|------|------|---------|
| L105 | `output_dir = Path("/app/output") if Path("/app/output").exists() else Path("output")` | Docker vs. local detection |
| L106-109 | `output_dir.mkdir(...)` for videos, thumbnails, posts | Ensure subdirectories exist |
| L114-118 | `brand_data_dir = output_dir / "brand-data"` + logos mkdir | Ensure brand data directory exists |

### 6.3 Railway Config

`railway.json` — No volume mount configuration. Volume is configured via Railway dashboard, not in the JSON config.

### 6.4 Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `RAILWAY_PUBLIC_DOMAIN` | `main.py` L517, `scheduler.py` L631 | Base URL for public media URLs |
| `PUBLIC_URL_BASE` | `main.py` L519, `scheduler.py` L634 | Fallback base URL |
| `SUPABASE_URL` | `.env.example` L59 | Supabase project URL |
| `SUPABASE_KEY` | `.env.example` L60 | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | `.env.example` L61 | Supabase service role key (for Storage uploads) |

---

## 7. Auxiliary Local Files (JSON, etc.)

These are **not** in `output/` but are local filesystem writes that should be noted:

| # | File | Path Written | Purpose | Migration? |
|---|------|-------------|---------|-----------|
| A1 | `app/services/youtube/publisher.py` L53-77 | `youtube_quota.json` (working dir) | YouTube API daily quota tracking | Move to DB |
| A2 | `app/services/content/generator.py` L1055-1070 | `content_ratings.json` (working dir) | Content performance ratings | Move to DB |

---

## 8. Supabase Storage Buckets to Create

### Bucket: `media` (primary)

Stores all generated content media.

```
media/
├── videos/           # MP4 reel videos
│   └── {reel_id}_video.mp4
├── thumbnails/       # PNG/JPG thumbnails
│   ├── {reel_id}_thumbnail.png
│   └── {reel_id}_yt_thumbnail.png (or .jpg)
├── reels/            # PNG reel images
│   └── {reel_id}_reel.png
└── posts/            # PNG post images + carousel slides
    ├── {reel_id}_background.png
    ├── post_{brand}_{uid8}.png (composed cover)
    └── post_{brand}_{uid8}_slide{N}.png (carousel slides)
```

**Access policy:** Public read (content is published to social media anyway), authenticated write (service role key).

### Bucket: `brand-assets`

Stores brand-specific assets (already designed in templates-storage-spec.md).

```
brand-assets/
├── logos/
│   └── {brand_id}_logo.{ext}
└── templates/
    └── {brand}/light-mode/
        ├── thumbnail_template.png
        └── content_template.png
```

**Access policy:** Public read, authenticated write.

### Bucket: `feedback`

Stores rejection feedback for manual review.

```
feedback/
├── {feedback_id}.png
└── {feedback_id}.json
```

**Access policy:** Authenticated read/write only (internal data).

---

## 9. Files to Modify

### High Priority (Core Pipeline)

| File | Changes Needed |
|------|---------------|
| `app/services/content/job_processor.py` | After generating files locally, upload to Supabase Storage. Store Supabase public URLs instead of `/output/` paths. |
| `app/main.py` (auto-publish daemon) | Read files from Supabase Storage URLs (or keep local for publish). Update `_resolve_output_path()` to handle Supabase URLs. Update `_render_slides_node()` — still needs local files for Node.js. |
| `app/main.py` (StaticFiles mount) | Keep for backward compatibility during transition; eventually remove `/output` mount. |
| `app/services/publishing/scheduler.py` | Use Supabase public URLs directly for social publishing instead of `{RAILWAY_DOMAIN}/output/...`. For YouTube, download from Supabase to temp file for API upload. |
| `app/api/content/schedule_routes.py` | Upload base64 images to Supabase instead of writing to local filesystem. Store Supabase URLs in DB. Update path normalization. |
| `app/api/content/reel_routes.py` | Upload generated files to Supabase. Return Supabase URLs in responses. |

### Medium Priority (Brand Assets)

| File | Changes Needed |
|------|---------------|
| `app/api/brands_routes_v2.py` | Upload logos to Supabase Storage `brand-assets/logos/` instead of local filesystem. |
| `app/api/brands/routes.py` | Same as above (duplicate routes). |

### Low Priority (Feedback, Cleanup)

| File | Changes Needed |
|------|---------------|
| `app/api/content/feedback_routes.py` | Upload feedback images/JSON to Supabase `feedback/` bucket. |
| `app/services/content/job_manager.py` | Delete from Supabase Storage instead of (or in addition to) local filesystem. |

### Frontend

| File | Changes Needed |
|------|---------------|
| `src/pages/Scheduled.tsx` | Use Supabase public URLs instead of `/output/...` paths. |
| `src/pages/JobDetail.tsx` | Same — media URLs will come from API, just need to handle full URLs. |
| `src/pages/PostJobDetail.tsx` | Same. |
| `src/pages/Connected.tsx` | Brand logo URLs from Supabase instead of `/brand-logos/`. |
| `src/features/scheduling/api/scheduling-api.ts` | Type definitions may need URL format update. |

---

## 10. Migration Plan

### Phase 1: Create Infrastructure

1. **Create Supabase Storage buckets** (`media`, `brand-assets`, `feedback`)
2. **Set bucket policies** — public read for `media` and `brand-assets`, private for `feedback`
3. **Create storage helper module** — `app/services/storage/supabase_storage.py`
   - `upload_file(bucket, path, file_data) → public_url`
   - `delete_file(bucket, path)`
   - `get_public_url(bucket, path) → url`
   - `download_file(bucket, path) → bytes`
4. **Add `SUPABASE_STORAGE_URL`** env variable (if different from `SUPABASE_URL`)

### Phase 2: Dual-Write (Write to both local + Supabase)

5. **Modify `job_processor.py`**: After generating files locally, also upload to Supabase. Store **Supabase public URL** in metadata alongside the `/output/` path.
6. **Modify `schedule_routes.py`**: After saving base64 images locally, upload to Supabase.  
7. **Modify `brands_routes_v2.py` and `brands/routes.py`**: Upload logos to Supabase after local save.
8. **Modify `feedback_routes.py`**: Upload feedback to Supabase after local save.

### Phase 3: Read from Supabase

9. **Update `_resolve_output_path()`** in `main.py`: If path starts with `https://`, return as-is (Supabase URL).
10. **Update `scheduler.py`** publishing: Use Supabase URLs directly for Instagram/Facebook (they need public URLs anyway). For YouTube, download from Supabase to temp file.
11. **Update API responses**: Return Supabase URLs instead of `/output/` paths.
12. **Keep `_render_slides_node()`**: Node.js Konva needs local files — write to `/tmp/`, upload result to Supabase.

### Phase 4: Update Frontend

13. **Frontend changes are minimal**: API responses will return full Supabase URLs instead of `/output/` relative paths. Frontend `<img src={url}>` and `<video src={url}>` work the same with full URLs.
14. **Brand logos**: Use Supabase URL from API response instead of `/brand-logos/{filename}`.

### Phase 5: Migrate Existing Data

15. **Migration script**: Upload all existing files from `/app/output/` to Supabase Storage.
16. **Update DB records**: Replace `/output/...` paths in `brand_outputs` JSON, `extra_data` JSON, `thumbnail_path`, etc. with Supabase URLs.

### Phase 6: Remove Local Dependencies

17. **Remove `StaticFiles` mount** for `/output` and `/brand-logos` from `main.py`.
18. **Remove `mkdir -p output/...`** from Dockerfile (keep `/tmp` for intermediate processing).
19. **Remove Railway volume** (eventually, after confirming stability).
20. **Update `job_manager.py` cleanup**: Delete from Supabase instead of local filesystem.

---

## 11. Transition Strategy

### Keep Local as Fallback

During the transition (Phases 2-4), the system should support **both** local and Supabase storage:

```python
# app/services/storage/supabase_storage.py

class StorageService:
    """Unified storage with Supabase primary + local fallback."""
    
    def save_file(self, bucket: str, path: str, data: bytes) -> str:
        """Save file to Supabase Storage, return public URL.
        Falls back to local filesystem if Supabase is unavailable."""
        try:
            # Upload to Supabase
            url = self._upload_to_supabase(bucket, path, data)
            # Also save locally (belt + suspenders)
            self._save_locally(path, data)
            return url
        except Exception:
            # Fallback to local-only
            self._save_locally(path, data)
            return f"/output/{path}"
    
    def get_url(self, bucket: str, path: str) -> str:
        """Get public URL for a file."""
        return f"{self.supabase_url}/storage/v1/object/public/{bucket}/{path}"
```

### Database Path Format

During transition, paths in the database can be:
- **Legacy**: `/output/thumbnails/reel123_thumbnail.png` (local)
- **New**: `https://xxx.supabase.co/storage/v1/object/public/media/thumbnails/reel123_thumbnail.png` (Supabase)

The path normalization logic (N1-N4) should detect and handle both:
```python
def resolve_media_url(raw_path: str) -> str:
    if raw_path.startswith("https://"):
        return raw_path  # Already a Supabase URL
    # Legacy local path handling...
```

### Benefits After Migration

- **No data loss** on container restarts/redeployments
- **No Railway volume dependency** (eliminates single point of failure)  
- **CDN-backed delivery** (Supabase Storage uses CDN for public buckets)
- **Simpler social publishing** (URLs already public, no need for `{RAILWAY_DOMAIN}/output/...`)
- **Smaller container** (no persistent volume needed)
- **Multi-region support** (Supabase CDN vs single Railway region)

### Risks

- **Latency for Node.js rendering**: `_render_slides_node()` needs local file access → download from Supabase to `/tmp/` first
- **Upload time**: Each generated file needs upload (~1-2s for videos, <1s for images)
- **Supabase Storage limits**: Free tier = 1GB storage, 2GB bandwidth/month. Pro tier = 100GB storage, 200GB bandwidth.
- **Backward compatibility**: Old paths in DB must continue working during transition
- **YouTube API**: Requires local file for upload, can't use URL → download from Supabase to temp file

### Cost Estimate

| File Type | Count/Month (est.) | Avg Size | Monthly Storage |
|-----------|-------------------|----------|----------------|
| Videos (.mp4) | ~150 | 3 MB | 450 MB |
| Thumbnails (.png/.jpg) | ~300 | 150 KB | 45 MB |
| Reel images (.png) | ~150 | 350 KB | 52 MB |
| Post backgrounds (.png) | ~150 | 250 KB | 37 MB |
| Carousel slides | ~200 | 200 KB | 40 MB |
| Brand logos | ~20 (cumulative) | 100 KB | 2 MB |
| **Total** | | | **~626 MB/month** |

Supabase Pro tier (100GB storage, 200GB bandwidth) comfortably handles this.
