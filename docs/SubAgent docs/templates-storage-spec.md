# Templates → Supabase Storage Migration Spec

> **Status:** Research complete — not yet implemented  
> **Date:** 2025-02-14

---

## 1. Current Template Structure

### File inventory

Each brand has **2 PNG templates** inside `assets/templates/<brand>/light mode/`:

| Brand | Files | Size |
|---|---|---|
| healthycollege | `thumbnail_template.png`, `content_template.png` | 16 KB, 14 KB |
| holisticcollege | `thumbnail_template.png`, `content_template.png` | 15 KB, 14 KB |
| longevitycollege | `thumbnail_template.png`, `content_template.png` | 16 KB, 15 KB |
| vitalitycollege | `thumbnail_template.png`, `content_template.png` | 16 KB, 15 KB |
| wellbeingcollege | `thumbnail_template.png`, `content_template.png` | 16 KB, 16 KB |

**Total: 10 files, ~152 KB combined.**

### Directory layout

```
assets/templates/
├── healthycollege/
│   └── light mode/
│       ├── content_template.png
│       └── thumbnail_template.png
├── holisticcollege/
│   └── light mode/
│       ├── content_template.png
│       └── thumbnail_template.png
├── longevitycollege/  (same structure)
├── vitalitycollege/   (same structure)
└── wellbeingcollege/  (same structure)
```

Templates are **only used in light mode**. Dark mode generates AI backgrounds via deAPI instead of loading a template file.

---

## 2. How Templates Are Currently Loaded

**Single consumer:** `app/services/media/image_generator.py` — the `ImageGenerator` class.

### Thumbnail template (line 233)

```python
template_path = Path(__file__).resolve().parent.parent.parent / "assets" / "templates" / self.brand_name / "light mode" / "thumbnail_template.png"
image = Image.open(template_path)
```

### Content template (line 376)

```python
template_path = Path(__file__).resolve().parent.parent.parent / "assets" / "templates" / self.brand_name / "light mode" / "content_template.png"
image = Image.open(template_path)
```

Both construct a filesystem path relative to the project root (`Path(__file__).resolve().parent.parent.parent` → project root) and open the PNG with Pillow's `Image.open()`.

### Other references

- `app/services/maestro/healing.py` (line 322) — error message string mentions `assets/templates` for diagnostics only; no file I/O.
- `app/core/config.py` — `BrandConfig.logo_filename` references `assets/logos/`, **not** templates.
- Frontend `TemplatesTab.tsx` — placeholder "Coming Soon" UI, no actual template loading.

---

## 3. Where Templates Are Referenced (Complete List)

| Location | Type | Description |
|---|---|---|
| `app/services/media/image_generator.py:233` | **File I/O** | Loads `thumbnail_template.png` for light-mode thumbnails |
| `app/services/media/image_generator.py:376` | **File I/O** | Loads `content_template.png` for light-mode reel images |
| `app/services/maestro/healing.py:322` | String only | Error message referencing `assets/templates` |
| `src/features/brands/components/TemplatesTab.tsx` | UI placeholder | "Coming Soon" tab in Brands page |
| `src/features/brands/components/BrandsTabBar.tsx:5` | UI nav | Tab entry for Templates tab |
| `src/pages/Brands.tsx:6,57` | UI routing | Imports & renders `TemplatesTab` |
| `Dockerfile:70` | Build | `COPY assets/ assets/` copies templates into container |

---

## 4. Supabase Client Status

### Python backend

- **`supabase` package is installed** (`requirements.txt`: `supabase>=2.0.0`)
- **Supabase client exists** in `app/api/auth/middleware.py`:
  ```python
  from supabase import create_client, Client
  
  def get_supabase_client() -> Client:
      url = os.environ.get("SUPABASE_URL", "")
      key = os.environ.get("SUPABASE_SERVICE_KEY", "")
      return create_client(url, key)
  ```
- **Config vars available** in `app/core/config.py`:
  - `SUPABASE_URL`
  - `SUPABASE_KEY` (anon key)
  - `SUPABASE_SERVICE_KEY` (service role key)
- **No Supabase Storage usage exists yet** — the client is only used for Auth.

### Frontend (React/TypeScript)

- **`@supabase/supabase-js` installed** (`package.json`: `^2.49.0`)
- **Client configured** in `src/shared/api/supabase.ts`:
  ```ts
  export const supabase = createClient(supabaseUrl, supabaseAnonKey)
  ```
- **`@supabase/storage-js`** is included as a transitive dependency (in `package-lock.json`)
- The `supabase` JS client already exposes `supabase.storage` — no extra package needed.

### Logo uploads (related pattern)

Logo uploads currently go to the **local filesystem** (`output/brand-data/logos/`), not Supabase Storage. This would also benefit from the same migration pattern.

---

## 5. Migration Design

### 5.1 Supabase Storage bucket

Create a **`brand-assets`** bucket in Supabase Storage with this structure:

```
brand-assets/
├── templates/
│   ├── healthycollege/
│   │   └── light-mode/
│   │       ├── content_template.png
│   │       └── thumbnail_template.png
│   ├── holisticcollege/  (same)
│   ├── longevitycollege/ (same)
│   ├── vitalitycollege/  (same)
│   └── wellbeingcollege/ (same)
└── logos/
    ├── healthycollege_logo.png
    └── ...
```

> Note: subdirectory named `light-mode` (hyphenated) instead of `light mode` (space) for URL safety.

### 5.2 Bucket access policy

- **Public read** for templates (they're brand assets, not secrets) — enables CDN caching
- **Authenticated write** (service role key) for uploads through the admin dashboard

### 5.3 Backend changes

**File to change:** `app/services/media/image_generator.py`

Create a helper to load templates from Supabase Storage with a **local file cache**:

```python
# app/services/media/template_loader.py  (new file)

import os
from pathlib import Path
from io import BytesIO
from PIL import Image
from supabase import create_client

CACHE_DIR = Path("/tmp/template-cache")
BUCKET = "brand-assets"

def _get_storage_client():
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    return create_client(url, key).storage

def load_template(brand_name: str, template_name: str) -> Image.Image:
    """
    Load a template image, using local cache when available.
    Falls back to filesystem path for local development.
    """
    cache_path = CACHE_DIR / brand_name / template_name
    
    # 1. Check local cache
    if cache_path.exists():
        return Image.open(cache_path)
    
    # 2. Try Supabase Storage
    storage_path = f"templates/{brand_name}/light-mode/{template_name}"
    try:
        storage = _get_storage_client()
        data = storage.from_(BUCKET).download(storage_path)
        
        # Cache locally
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(data)
        
        return Image.open(BytesIO(data))
    except Exception:
        pass
    
    # 3. Fallback to local filesystem (dev mode)
    local_path = Path(__file__).resolve().parent.parent.parent / "assets" / "templates" / brand_name / "light mode" / template_name
    if local_path.exists():
        return Image.open(local_path)
    
    raise FileNotFoundError(f"Template not found: {brand_name}/{template_name}")
```

Then update `image_generator.py` (2 lines):

```python
# Line 233 — thumbnail
image = load_template(self.brand_name, "thumbnail_template.png")

# Line 376 — content
image = load_template(self.brand_name, "content_template.png")
```

### 5.4 Upload migration script

One-time script to upload existing templates to Supabase Storage:

```python
# scripts/migrate_templates.py
from pathlib import Path
from supabase import create_client
import os

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"]
)

templates_dir = Path("assets/templates")
BUCKET = "brand-assets"

for brand_dir in templates_dir.iterdir():
    if not brand_dir.is_dir():
        continue
    brand_name = brand_dir.name
    light_dir = brand_dir / "light mode"
    if not light_dir.exists():
        continue
    for template_file in light_dir.glob("*.png"):
        storage_path = f"templates/{brand_name}/light-mode/{template_file.name}"
        with open(template_file, "rb") as f:
            supabase.storage.from_(BUCKET).upload(
                storage_path, f.read(),
                file_options={"content-type": "image/png"}
            )
        print(f"Uploaded: {storage_path}")
```

### 5.5 Frontend TemplatesTab (future)

The `TemplatesTab` is already a placeholder. When implemented, it would:

1. Use `supabase.storage.from_('brand-assets').list('templates/{brand}/')` to list files
2. Use `supabase.storage.from_('brand-assets').getPublicUrl(path)` for preview URLs
3. Use `supabase.storage.from_('brand-assets').upload(path, file)` for uploads
4. No backend API needed — the JS client talks directly to Supabase Storage

### 5.6 Dockerfile update

After migration, `COPY assets/ assets/` can optionally remain for local dev fallback, or be removed once templates are fully served from Supabase Storage. The `/tmp/template-cache` approach means templates are fetched once per container lifecycle.

---

## 6. Impact Analysis

| Area | Impact | Effort |
|---|---|---|
| `image_generator.py` | 2 lines changed (use `load_template()`) | Low |
| New `template_loader.py` | ~40 lines | Low |
| Supabase bucket setup | Manual, one-time | Minimal |
| Migration script | ~20 lines, one-time | Minimal |
| `healing.py` error message | Optional string update | Trivial |
| Frontend `TemplatesTab` | Separate feature; not required for backend migration | Deferred |
| Logo uploads | Can use same pattern but separate scope | Deferred |

### Benefits

- **No filesystem dependency** — templates served from cloud storage
- **Dynamic brand support** — new brands add templates via dashboard, no redeploy needed
- **Smaller Docker image** — templates not baked into container
- **CDN caching** — Supabase Storage uses CDN; public URLs are fast globally
- **TemplatesTab enablement** — frontend can manage templates once bucket exists

### Risks

- **Cold start latency** — first template load per container requires download (~16 KB each, negligible)
- **Storage dependency** — if Supabase Storage is down, templates can't load (mitigated by local cache)
- **No breaking change** — fallback to local filesystem preserves backward compatibility
