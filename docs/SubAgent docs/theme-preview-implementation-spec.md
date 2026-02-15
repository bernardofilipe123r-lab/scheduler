# Theme Preview Implementation Spec

> Complete implementation plan for migrating brand rendering colors to DB, updating the API, and rebuilding BrandThemeModal with accurate previews.

---

## Table of Contents

1. [Database Migration](#1-database-migration)
2. [brand_colors.py → Read from DB](#2-brand_colorspy--read-from-db)
3. [API Update](#3-api-update)
4. [Frontend BrandThemeModal Redesign](#4-frontend-brandthememodal-redesign)
5. [Color Mappings Per Brand (Migration Data)](#5-color-mappings-per-brand-migration-data)
6. [File Change Summary](#6-file-change-summary)

---

## 1. Database Migration

### Current State

The `brands` table (model: `app/models/brands.py`) stores colors in a single `colors` JSON column with this structure:

```json
{
  "primary": "#004f00",
  "accent": "#16a34a",
  "color_name": "vibrant green",
  "light_mode": { "background": "#dffbcb", "text": "#004f00", ... },
  "dark_mode": { "background": "#001f00", "text": "#ffffff", ... }
}
```

The actual rendering uses `app/core/brand_colors.py` which has a **completely separate** hardcoded `BRAND_COLORS` dict with 3 color fields per mode via `BrandModeColors`:
- `thumbnail_text_color` (RGB tuple)
- `content_title_text_color` (RGB tuple)
- `content_title_bg_color` (RGBA tuple)

These rendering colors are **not stored anywhere in the DB**. The `colors.light_mode.text` and `colors.light_mode.background` fields in the DB JSON are _different values_ used by the theme modal UI but ignored by the renderer.

### Migration Plan

**Strategy:** Add the 6 rendering color fields as new keys inside the existing `colors` JSON column. No new SQL columns needed — the `colors` field is already JSON type and can hold arbitrary keys.

New keys to add inside `colors` JSON:

```json
{
  "primary": "#004f00",
  "accent": "#16a34a",
  "color_name": "vibrant green",
  "light_mode": { ... },
  "dark_mode": { ... },
  
  "light_thumbnail_text_color": "#004f00",
  "light_content_title_text_color": "#000000",
  "light_content_title_bg_color": "#dcf6c8",
  "dark_thumbnail_text_color": "#ffffff",
  "dark_content_title_text_color": "#ffffff",
  "dark_content_title_bg_color": "#004f00"
}
```

**Why inside `colors` JSON instead of separate columns?**
- The `colors` column is already JSON — adding keys is non-breaking
- No Alembic migration needed — just a data-update script
- The existing `colors` JSON already has light_mode/dark_mode sub-objects, so this is consistent
- `to_dict()` already returns the full `colors` dict, so new keys are automatically exposed in API responses

### Migration Script

Create `scripts/migrate_rendering_colors.py`:

```python
"""
Migration: Populate rendering color fields in brands.colors JSON.
Sources values from brand_colors.py hardcoded BRAND_COLORS dict.

Run: python -m scripts.migrate_rendering_colors
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db_connection import SessionLocal
from app.models import Brand
from app.core.brand_colors import BRAND_COLORS


def rgb_to_hex(rgb_tuple):
    """Convert (R, G, B) or (R, G, B, A) tuple to hex string."""
    return "#{:02x}{:02x}{:02x}".format(rgb_tuple[0], rgb_tuple[1], rgb_tuple[2])


def migrate():
    db = SessionLocal()
    try:
        brands = db.query(Brand).all()
        updated = 0
        
        for brand in brands:
            brand_id = brand.id
            colors = dict(brand.colors or {})
            
            if brand_id in BRAND_COLORS:
                config = BRAND_COLORS[brand_id]
                lm = config.light_mode
                dm = config.dark_mode
                
                colors["light_thumbnail_text_color"] = rgb_to_hex(lm.thumbnail_text_color)
                colors["light_content_title_text_color"] = rgb_to_hex(lm.content_title_text_color)
                colors["light_content_title_bg_color"] = rgb_to_hex(lm.content_title_bg_color)
                colors["dark_thumbnail_text_color"] = rgb_to_hex(dm.thumbnail_text_color)
                colors["dark_content_title_text_color"] = rgb_to_hex(dm.content_title_text_color)
                colors["dark_content_title_bg_color"] = rgb_to_hex(dm.content_title_bg_color)
                
                brand.colors = colors
                updated += 1
                print(f"  ✓ {brand_id}: populated 6 rendering colors from hardcoded values")
            else:
                print(f"  ⚠ {brand_id}: no hardcoded colors found, skipping")
        
        db.commit()
        print(f"\nMigration complete: {updated}/{len(brands)} brands updated")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
```

### Old columns: Keep or remove?

**Keep the old `light_mode`/`dark_mode` sub-objects** inside the JSON. They contain gradient colors, CTA colors, and other fields used by `BrandResolver.get_brand_config()` and the seed data. Removing them would break `BrandConfig` construction in `resolver.py`. The new rendering color keys sit at the top level of the `colors` JSON alongside the existing structure — no conflict.

### brand_color (primary) field

**Keep `primary` as-is.** It's used for:
- Brand card accent colors in the UI
- `colors.get("primary")` in numerous frontend/backend references
- AI prompt color palette references
- It's the brand's identity color, distinct from rendering colors

---

## 2. brand_colors.py → Read from DB

### Current State

`app/core/brand_colors.py` exports:
- `BRAND_COLORS` dict (hardcoded)
- `BrandModeColors` dataclass
- `BrandColorConfig` dataclass
- `get_brand_colors(brand_name, variant)` → returns `BrandModeColors`
- `get_brand_display_name(brand_name)` → returns string
- `hex_to_rgb()`, `hex_to_rgba()` helpers

**Consumers:**
- `app/services/media/image_generator.py` line 9: `from app.core.brand_colors import get_brand_colors, get_brand_display_name`
- `image_generator.py` line 77: `self.brand_colors = get_brand_colors(brand_name, variant)`
- Then uses `self.brand_colors.thumbnail_text_color`, `.content_title_text_color`, `.content_title_bg_color`

### Updated get_brand_colors()

The function must:
1. Try to read from DB via `brand_resolver`
2. Fall back to hardcoded `BRAND_COLORS` dict if DB values missing
3. Return the same `BrandModeColors` dataclass — no downstream changes

```python
def get_brand_colors(brand_name: str, variant: str) -> BrandModeColors:
    """
    Get color configuration for a specific brand and variant.
    
    Reads from DB first, falls back to hardcoded BRAND_COLORS.
    """
    if variant not in ("light", "dark"):
        raise ValueError(f"Invalid variant: {variant}. Must be 'light' or 'dark'")
    
    # Try DB first
    try:
        from app.services.brands.resolver import brand_resolver
        brand = brand_resolver.get_brand(brand_name)
        if brand and brand.colors:
            colors = brand.colors
            prefix = f"{variant}_"
            thumb = colors.get(f"{prefix}thumbnail_text_color")
            title_text = colors.get(f"{prefix}content_title_text_color")
            title_bg = colors.get(f"{prefix}content_title_bg_color")
            
            if thumb and title_text and title_bg:
                return BrandModeColors(
                    thumbnail_text_color=hex_to_rgb(thumb),
                    content_title_text_color=hex_to_rgb(title_text),
                    content_title_bg_color=hex_to_rgba(title_bg),
                )
    except Exception:
        pass  # Fall through to hardcoded
    
    # Fallback to hardcoded dict
    if brand_name not in BRAND_COLORS:
        raise ValueError(f"Unknown brand: {brand_name}. Available: {list(BRAND_COLORS.keys())}")
    
    config = BRAND_COLORS[brand_name]
    return config.light_mode if variant == "light" else config.dark_mode
```

### Updated get_brand_display_name()

Similarly, read from DB first:

```python
def get_brand_display_name(brand_name: str) -> str:
    """Get the display name for a brand. Reads from DB, falls back to hardcoded."""
    try:
        from app.services.brands.resolver import brand_resolver
        brand = brand_resolver.get_brand(brand_name)
        if brand:
            return brand.display_name
    except Exception:
        pass
    return BRAND_DISPLAY_NAMES.get(brand_name, "THE GYM COLLEGE")
```

### Keep hardcoded dict

The `BRAND_COLORS` dict and `BRAND_DISPLAY_NAMES` dict remain as fallbacks for:
- First startup before migration runs
- Brands not yet in DB
- Test environments without DB access

---

## 3. API Update

### Changes to GET /api/brands/{brand_id}/theme

**File:** `app/api/brands_routes_v2.py` (and duplicate in `app/api/brands/routes.py`)

Currently returns 5 fields from DB `colors` JSON. Update to also return the 6 rendering color fields:

```python
@router.get("/{brand_id}/theme")
async def get_brand_theme(brand_id: str, db=Depends(get_db), user=Depends(get_current_user)):
    manager = get_brand_manager(db)
    brand = manager.get_brand(brand_id, user_id=user["id"])
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")
    
    colors = brand.get("colors", {})
    
    theme = {
        "brand_color": colors.get("primary", "#000000"),
        # Legacy fields (keep for backward compat)
        "light_title_color": colors.get("light_mode", {}).get("text", "#000000"),
        "light_bg_color": colors.get("light_mode", {}).get("background", "#ffffff"),
        "dark_title_color": colors.get("dark_mode", {}).get("text", "#ffffff"),
        "dark_bg_color": colors.get("dark_mode", {}).get("background", "#000000"),
        # Rendering colors (new)
        "light_thumbnail_text_color": colors.get("light_thumbnail_text_color"),
        "light_content_title_text_color": colors.get("light_content_title_text_color"),
        "light_content_title_bg_color": colors.get("light_content_title_bg_color"),
        "dark_thumbnail_text_color": colors.get("dark_thumbnail_text_color"),
        "dark_content_title_text_color": colors.get("dark_content_title_text_color"),
        "dark_content_title_bg_color": colors.get("dark_content_title_bg_color"),
        "logo": brand.get("logo_path"),
    }
    
    return {"brand_id": brand_id, "theme": theme, "has_overrides": True}
```

### Changes to POST /api/brands/{brand_id}/theme

Accept the 6 new fields as optional Form params alongside the existing ones. When provided, store them in the `colors` JSON. When not provided, leave existing values untouched.

```python
@router.post("/{brand_id}/theme")
async def update_brand_theme(
    brand_id: str,
    brand_color: str = Form(...),
    light_title_color: str = Form(...),
    light_bg_color: str = Form(...),
    dark_title_color: str = Form(...),
    dark_bg_color: str = Form(...),
    # New rendering color fields (optional for backward compat)
    light_thumbnail_text_color: Optional[str] = Form(None),
    light_content_title_text_color: Optional[str] = Form(None),
    light_content_title_bg_color: Optional[str] = Form(None),
    dark_thumbnail_text_color: Optional[str] = Form(None),
    dark_content_title_text_color: Optional[str] = Form(None),
    dark_content_title_bg_color: Optional[str] = Form(None),
    logo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    manager = get_brand_manager(db)
    brand = manager.get_brand(brand_id, user_id=user["id"])
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")
    
    current_colors = brand.get("colors", {})
    updated_colors = {
        **current_colors,
        "primary": brand_color,
        "light_mode": {
            **(current_colors.get("light_mode", {})),
            "text": light_title_color,
            "background": light_bg_color
        },
        "dark_mode": {
            **(current_colors.get("dark_mode", {})),
            "text": dark_title_color,
            "background": dark_bg_color
        }
    }
    
    # Add rendering colors if provided
    rendering_fields = {
        "light_thumbnail_text_color": light_thumbnail_text_color,
        "light_content_title_text_color": light_content_title_text_color,
        "light_content_title_bg_color": light_content_title_bg_color,
        "dark_thumbnail_text_color": dark_thumbnail_text_color,
        "dark_content_title_text_color": dark_content_title_text_color,
        "dark_content_title_bg_color": dark_content_title_bg_color,
    }
    for key, val in rendering_fields.items():
        if val is not None:
            updated_colors[key] = val
    
    updates = {"colors": updated_colors}
    
    # ... logo handling same as current ...
    
    updated_brand = manager.update_brand(brand_id, updates, user_id=user["id"])
    
    return {
        "success": True,
        "message": f"Theme updated for {brand_id}",
        "theme": {
            "brand_color": brand_color,
            "light_thumbnail_text_color": updated_colors.get("light_thumbnail_text_color"),
            "light_content_title_text_color": updated_colors.get("light_content_title_text_color"),
            "light_content_title_bg_color": updated_colors.get("light_content_title_bg_color"),
            "dark_thumbnail_text_color": updated_colors.get("dark_thumbnail_text_color"),
            "dark_content_title_text_color": updated_colors.get("dark_content_title_text_color"),
            "dark_content_title_bg_color": updated_colors.get("dark_content_title_bg_color"),
            "logo": updates.get("logo_path", brand.get("logo_path")),
        }
    }
```

### Both route files

The theme endpoints exist in TWO files:
1. `app/api/brands_routes_v2.py` — mounted at `/api/v2/brands`
2. `app/api/brands/routes.py` — mounted at `/api/brands`

**Both must be updated identically.** The frontend currently hits `/api/brands/{id}/theme`.

### GET /api/brands/{brand_id} (single brand)

Already returns the full `colors` dict via `brand.to_dict()`, so the new keys will automatically be included once the migration populates them. **No change needed.**

---

## 4. Frontend BrandThemeModal Redesign

### File: `src/features/brands/components/BrandThemeModal.tsx`

### 4.1 State Variables — Replace old state with rendering colors

Remove:
```ts
const [lightTitleColor, setLightTitleColor] = useState(...)
const [lightBgColor, setLightBgColor] = useState(...)
const [darkTitleColor, setDarkTitleColor] = useState(...)
const [darkBgColor, setDarkBgColor] = useState(...)
```

Add:
```ts
// 6 rendering color fields (3 per mode)
const [lightThumbnailTextColor, setLightThumbnailTextColor] = useState('#000000')
const [lightContentTitleTextColor, setLightContentTitleTextColor] = useState('#000000')
const [lightContentTitleBgColor, setLightContentTitleBgColor] = useState('#c8e1f6')
const [darkThumbnailTextColor, setDarkThumbnailTextColor] = useState('#ffffff')
const [darkContentTitleTextColor, setDarkContentTitleTextColor] = useState('#ffffff')
const [darkContentTitleBgColor, setDarkContentTitleBgColor] = useState('#00435c')
```

Derived values:
```ts
// Current mode's rendering colors
const thumbnailTextColor = mode === 'light' ? lightThumbnailTextColor : darkThumbnailTextColor
const contentTitleTextColor = mode === 'light' ? lightContentTitleTextColor : darkContentTitleTextColor
const contentTitleBgColor = mode === 'light' ? lightContentTitleBgColor : darkContentTitleBgColor
```

### 4.2 Data Fetch — Load rendering colors from API

```ts
useEffect(() => {
  const fetchTheme = async () => {
    try {
      const data = await apiClient.get<{ theme: Record<string, string | null> }>(
        `/api/brands/${brand.id}/theme`
      )
      const t = data.theme
      if (t) {
        if (t.brand_color) setBrandColor(t.brand_color)
        // Rendering colors
        if (t.light_thumbnail_text_color) setLightThumbnailTextColor(t.light_thumbnail_text_color)
        if (t.light_content_title_text_color) setLightContentTitleTextColor(t.light_content_title_text_color)
        if (t.light_content_title_bg_color) setLightContentTitleBgColor(t.light_content_title_bg_color)
        if (t.dark_thumbnail_text_color) setDarkThumbnailTextColor(t.dark_thumbnail_text_color)
        if (t.dark_content_title_text_color) setDarkContentTitleTextColor(t.dark_content_title_text_color)
        if (t.dark_content_title_bg_color) setDarkContentTitleBgColor(t.dark_content_title_bg_color)
        // Logo
        if (t.logo) {
          const logoUrl = `/brand-logos/${t.logo}?t=${Date.now()}`
          const logoCheck = await fetch(logoUrl, { method: 'HEAD' })
          if (logoCheck.ok) setLogoPreview(logoUrl)
        }
      }
    } catch { /* use defaults */ }
    setLoading(false)
  }
  fetchTheme()
}, [brand.id])
```

### 4.3 Save — Send 6 rendering fields + brand_color

```ts
const handleSave = async () => {
  setSaving(true)
  try {
    const formData = new FormData()
    formData.append('brand_color', brandColor)
    // Legacy fields (still required by backend Form params)
    formData.append('light_title_color', lightThumbnailTextColor)
    formData.append('light_bg_color', lightContentTitleBgColor)
    formData.append('dark_title_color', darkThumbnailTextColor)
    formData.append('dark_bg_color', darkContentTitleBgColor)
    // Rendering colors (new)
    formData.append('light_thumbnail_text_color', lightThumbnailTextColor)
    formData.append('light_content_title_text_color', lightContentTitleTextColor)
    formData.append('light_content_title_bg_color', lightContentTitleBgColor)
    formData.append('dark_thumbnail_text_color', darkThumbnailTextColor)
    formData.append('dark_content_title_text_color', darkContentTitleTextColor)
    formData.append('dark_content_title_bg_color', darkContentTitleBgColor)
    if (logoFile) formData.append('logo', logoFile)

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    const resp = await fetch(
      `${import.meta.env.VITE_API_URL || ''}/api/brands/${brand.id}/theme`,
      { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData }
    )
    if (!resp.ok) throw new Error('Save failed')
    onSave?.()
    onClose()
  } catch { /* silent */ }
  setSaving(false)
}
```

### 4.4 Preview Layout — Complete redesign

The modal layout becomes:

```
┌───────────────────────────────────────────────────────────────┐
│  ☀️ Light Mode  |  🌙 Dark Mode    (toggle)                  │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────┐  ┌────────────────────┐  │
│  │  LEFT: Previews (flex-[3])      │  │ RIGHT: Colors      │  │
│  │                                 │  │  (flex-[2])        │  │
│  │  ┌─────────┐  ┌─────────┐      │  │                    │  │
│  │  │Thumbnail│  │ Content │      │  │ Logo Upload        │  │
│  │  │ 9:16    │  │  9:16   │      │  │ [drag/drop]        │  │
│  │  │         │  │         │      │  │                    │  │
│  │  │ SAMPLE  │  │ ▓▓TITLE │      │  │ Brand Color        │  │
│  │  │ TITLE   │  │ ▓▓▓▓▓▓▓ │      │  │ [■ #004f00]        │  │
│  │  │ TEXT    │  │         │      │  │                    │  │
│  │  │         │  │ 1. xxx  │      │  │ ── Thumbnail ──    │  │
│  │  │ brand   │  │ 2. xxx  │      │  │ Text Color         │  │
│  │  │         │  │ 3. xxx  │      │  │ [■ #004f00]        │  │
│  │  │         │  │         │      │  │                    │  │
│  │  │         │  │ brand   │      │  │ ── Content ──      │  │
│  │  └─────────┘  └─────────┘      │  │ Title Text Color   │  │
│  │  "Thumbnail"  "Content"         │  │ [■ #000000]        │  │
│  │                                 │  │ Title Bar Color    │  │
│  └─────────────────────────────────┘  │ [■ #dcf6c8]        │  │
│                                       └────────────────────┘  │
│                                                               │
│                            [Cancel]  [Save Theme]             │
└───────────────────────────────────────────────────────────────┘
```

### 4.5 Thumbnail Preview (9:16)

Must match `image_generator.py → generate_thumbnail()`:

```tsx
{/* Thumbnail Preview - 9:16 */}
<div className="flex-1">
  <p className="text-xs font-medium text-gray-500 mb-2">Thumbnail</p>
  <div
    className="w-full rounded-xl overflow-hidden border border-gray-200 relative"
    style={{
      aspectRatio: '9/16',
      backgroundColor: mode === 'light' ? '#f4f4f4' : undefined,
      // Dark mode: simulated AI background with overlay
      ...(mode === 'dark' ? {
        background: 'linear-gradient(135deg, #1a3a2a 0%, #0d1f15 40%, #2d1a0a 70%, #1a0a1a 100%)',
      } : {}),
    }}
  >
    {/* Dark mode overlay (55% black) */}
    {mode === 'dark' && (
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />
    )}

    {/* Centered title */}
    <div className="absolute inset-0 flex flex-col items-center justify-center px-4 z-10">
      <h2
        className="text-lg font-extrabold text-center uppercase tracking-wide leading-tight"
        style={{
          color: mode === 'light' ? thumbnailTextColor : '#ffffff',
          fontFamily: '"Poppins", system-ui, sans-serif',
        }}
      >
        SAMPLE TITLE TEXT
      </h2>
    </div>

    {/* Brand name - positioned below center, matching 254px gap ratio */}
    <div className="absolute left-0 right-0 z-10" style={{ bottom: '22%' }}>
      <p
        className="text-center uppercase text-[8px] font-bold tracking-wider"
        style={{
          color: mode === 'light' ? thumbnailTextColor : '#ffffff',
          fontFamily: '"Poppins", system-ui, sans-serif',
        }}
      >
        {brand.name}
      </p>
    </div>
  </div>
</div>
```

**Key accuracy details:**
- Aspect ratio: **9:16** (not 16:9)
- Light background: always `#f4f4f4` (not user-editable)
- Dark background: CSS gradient simulating a blurry nature scene + 55% black overlay (`rgba(0,0,0,0.55)`)
- Title color light: `thumbnailTextColor` (brand-specific)
- Title color dark: always `#ffffff`
- Brand name: same color rules as title
- Font: Poppins Bold (use `font-extrabold` + `fontFamily: 'Poppins'`)
- **No logo** in thumbnail preview (renderer doesn't render logos)

### 4.6 Content/Reel Preview (9:16)

Must match `image_generator.py → generate_reel_image()`:

```tsx
{/* Content/Reel Preview - 9:16 */}
<div className="flex-1">
  <p className="text-xs font-medium text-gray-500 mb-2">Content</p>
  <div
    className="w-full rounded-xl overflow-hidden border border-gray-200 relative"
    style={{
      aspectRatio: '9/16',
      backgroundColor: mode === 'light' ? '#f4f4f4' : undefined,
      ...(mode === 'dark' ? {
        background: 'linear-gradient(135deg, #1a3a2a 0%, #0d1f15 40%, #2d1a0a 70%, #1a0a1a 100%)',
      } : {}),
    }}
  >
    {/* Dark mode overlay (85% black) */}
    {mode === 'dark' && (
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} />
    )}

    {/* Title bars area - starts at ~14.6% from top (280/1920) */}
    <div className="relative z-10" style={{ paddingTop: '14.6%', paddingLeft: '8.3%', paddingRight: '8.3%' }}>
      {/* Stepped bars - widths: 100%, 85%, 70% */}
      {['SAMPLE TITLE', 'LINE TWO'].map((line, i) => (
        <div
          key={i}
          className="flex items-center justify-center"
          style={{
            backgroundColor: contentTitleBgColor + 'cc',  /* alpha ~200/255 = 0xcc */
            height: '22px',      /* proportional to 100px/1920 * preview height */
            width: i === 0 ? '100%' : '75%',
            margin: '0 auto',
          }}
        >
          <span
            className="text-[7px] font-extrabold uppercase text-center tracking-wide"
            style={{
              color: contentTitleTextColor,
              fontFamily: '"Poppins", system-ui, sans-serif',
            }}
          >
            {line}
          </span>
        </div>
      ))}
    </div>

    {/* Content lines - left aligned at 10% margin (108/1080) */}
    <div className="relative z-10 space-y-1.5" style={{ paddingTop: '3.6%', paddingLeft: '10%', paddingRight: '10%' }}>
      {['First content line here', 'Second content line', 'Third content line', 'Fourth content line'].map((line, i) => (
        <div key={i} className="flex items-start gap-1">
          <span
            className="text-[6px] font-medium flex-shrink-0"
            style={{ color: mode === 'light' ? '#000000' : '#ffffff' }}
          >
            {i + 1}.
          </span>
          <p
            className="text-[6px] font-medium"
            style={{
              color: mode === 'light' ? '#000000' : '#ffffff',
              fontFamily: '"Inter", system-ui, sans-serif',
            }}
          >
            {line}
          </p>
        </div>
      ))}
    </div>

    {/* Brand name - 12px from bottom in actual render */}
    <div className="absolute bottom-1.5 left-0 right-0 text-center z-10">
      <p
        className="text-[5px] font-bold uppercase"
        style={{
          color: mode === 'light' ? thumbnailTextColor : '#ffffff',
          fontFamily: '"Poppins", system-ui, sans-serif',
        }}
      >
        {brand.name}
      </p>
    </div>
  </div>
</div>
```

**Key accuracy details:**
- Title bars: **stepped widths** (largest on top, narrower for 2nd line), touching each other (no gap)
- Bar background: `contentTitleBgColor` with alpha ~200/255 (append `cc` hex to the color)
- Bar text: `contentTitleTextColor` (brand-specific, can be black or white in light mode)
- Content text: always `#000000` (light) / `#ffffff` (dark) — **not** grey
- Content font: Inter Medium (use `font-medium`)
- Content alignment: **left-aligned** (not centered)
- Brand name: Poppins Bold, tiny, centered at bottom
- Brand name color: `thumbnailTextColor` (light) / white (dark) — same rule as thumbnail
- Dark overlay: **85%** opacity (heavier than thumbnail's 55%)

### 4.7 Color Editor Panel (Right Side)

3 color pickers per mode, grouped by section:

```tsx
{/* RIGHT: Controls */}
<div className="flex-[2] space-y-5">
  {/* Logo Upload - same as current */}
  <div>
    <label className="text-sm font-medium text-gray-700 mb-2 block">Logo</label>
    {/* ... existing logo upload UI ... */}
  </div>

  {/* Brand Color - mode-independent */}
  <ColorPicker label="Brand Color" value={brandColor} onChange={setBrandColor} />

  {/* Mode-specific rendering colors */}
  <div className="border-t border-gray-200 pt-4">
    <h4 className="text-sm font-semibold text-gray-800 mb-3">
      {mode === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode'} Colors
    </h4>

    {/* Section: Thumbnail */}
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-3">Thumbnail</p>
    <ColorPicker
      label="Text Color"
      value={thumbnailTextColor}
      onChange={v => mode === 'light' ? setLightThumbnailTextColor(v) : setDarkThumbnailTextColor(v)}
    />

    {/* Section: Content */}
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">Content Title</p>
    <div className="space-y-3">
      <ColorPicker
        label="Text Color"
        value={contentTitleTextColor}
        onChange={v => mode === 'light' ? setLightContentTitleTextColor(v) : setDarkContentTitleTextColor(v)}
      />
      <ColorPicker
        label="Bar Background"
        value={contentTitleBgColor}
        onChange={v => mode === 'light' ? setLightContentTitleBgColor(v) : setDarkContentTitleBgColor(v)}
      />
    </div>
  </div>
</div>
```

### 4.8 Dark Mode Background Placeholder

Instead of calling AI image generation, use a **CSS gradient** that looks like a plausible blurry nature/wellness photo:

```ts
const DARK_BG_GRADIENT = 'linear-gradient(135deg, #1a3a2a 0%, #0d1f15 40%, #2d1a0a 70%, #1a0a1a 100%)'
```

This creates a dark, earthy gradient (deep green → dark → brown → deep purple) that simulates the look of a darkened AI background. Both the thumbnail and content previews use this same gradient with different overlay opacities (55% vs 85%).

### 4.9 Constants Update

**File:** `src/features/brands/constants.ts`

Update `BrandTheme` interface to reflect the 6 rendering colors:

```ts
export interface BrandTheme {
  brandColor: string
  lightThumbnailTextColor: string
  lightContentTitleTextColor: string
  lightContentTitleBgColor: string
  darkThumbnailTextColor: string
  darkContentTitleTextColor: string
  darkContentTitleBgColor: string
}

export const BRAND_THEMES: Record<string, BrandTheme> = {
  gymcollege: {
    brandColor: '#000000',
    lightThumbnailTextColor: '#000000',
    lightContentTitleTextColor: '#000000',
    lightContentTitleBgColor: '#c8e1f6',
    darkThumbnailTextColor: '#ffffff',
    darkContentTitleTextColor: '#ffffff',
    darkContentTitleBgColor: '#00435c',
  },
  healthycollege: {
    brandColor: '#004f00',
    lightThumbnailTextColor: '#004f00',
    lightContentTitleTextColor: '#000000',
    lightContentTitleBgColor: '#dcf6c8',
    darkThumbnailTextColor: '#ffffff',
    darkContentTitleTextColor: '#ffffff',
    darkContentTitleBgColor: '#004f00',
  },
  vitalitycollege: {
    brandColor: '#028f7a',
    lightThumbnailTextColor: '#028f7a',
    lightContentTitleTextColor: '#ffffff',
    lightContentTitleBgColor: '#028f7a',
    darkThumbnailTextColor: '#ffffff',
    darkContentTitleTextColor: '#ffffff',
    darkContentTitleBgColor: '#028f7a',
  },
  longevitycollege: {
    brandColor: '#019dc8',
    lightThumbnailTextColor: '#019dc8',
    lightContentTitleTextColor: '#000000',
    lightContentTitleBgColor: '#c8eaf6',
    darkThumbnailTextColor: '#ffffff',
    darkContentTitleTextColor: '#ffffff',
    darkContentTitleBgColor: '#019dc8',
  },
  holisticcollege: {
    brandColor: '#f0836e',
    lightThumbnailTextColor: '#f19b8a',
    lightContentTitleTextColor: '#000000',
    lightContentTitleBgColor: '#f9e0db',
    darkThumbnailTextColor: '#ffffff',
    darkContentTitleTextColor: '#ffffff',
    darkContentTitleBgColor: '#f0836e',
  },
  wellbeingcollege: {
    brandColor: '#ebbe4d',
    lightThumbnailTextColor: '#ffcd53',
    lightContentTitleTextColor: '#000000',
    lightContentTitleBgColor: '#fff4d6',
    darkThumbnailTextColor: '#ffffff',
    darkContentTitleTextColor: '#ffffff',
    darkContentTitleBgColor: '#ebbe4d',
  },
}
```

Remove the old `lightTitleColor`, `lightBgColor`, `darkTitleColor`, `darkBgColor` fields.

### 4.10 Poppins Font

The preview uses Poppins Bold for titles and brand names. Ensure it's loaded. Add to `index.html` or CSS:

```html
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800&family=Inter:wght@400;500&display=swap" rel="stylesheet">
```

If Poppins is already available (check existing font loading), no action needed.

---

## 5. Color Mappings Per Brand (Migration Data)

Exact values from `app/core/brand_colors.py` — these are the source-of-truth values to populate in the DB migration:

### gymcollege

| Field | Light Mode | Dark Mode |
|-------|-----------|-----------|
| `thumbnail_text_color` | `#000000` (black) | `#ffffff` (white) |
| `content_title_text_color` | `#000000` (black) | `#ffffff` (white) |
| `content_title_bg_color` | `#c8e1f6` (light blue) | `#00435c` (dark blue) |

### healthycollege

| Field | Light Mode | Dark Mode |
|-------|-----------|-----------|
| `thumbnail_text_color` | `#004f00` (green) | `#ffffff` (white) |
| `content_title_text_color` | `#000000` (black) | `#ffffff` (white) |
| `content_title_bg_color` | `#dcf6c8` (light green) | `#004f00` (dark green) |

### vitalitycollege

| Field | Light Mode | Dark Mode |
|-------|-----------|-----------|
| `thumbnail_text_color` | `#028f7a` (teal) | `#ffffff` (white) |
| `content_title_text_color` | `#ffffff` (white) | `#ffffff` (white) |
| `content_title_bg_color` | `#028f7a` (teal) | `#028f7a` (teal) |

> **Note:** vitalitycollege is unique — light mode title text is **white** (not black), and the bar bg is the brand color itself (not a pastel). Same bar bg in both modes.

### longevitycollege

| Field | Light Mode | Dark Mode |
|-------|-----------|-----------|
| `thumbnail_text_color` | `#019dc8` (cyan) | `#ffffff` (white) |
| `content_title_text_color` | `#000000` (black) | `#ffffff` (white) |
| `content_title_bg_color` | `#c8eaf6` (light cyan) | `#019dc8` (cyan) |

### holisticcollege

| Field | Light Mode | Dark Mode |
|-------|-----------|-----------|
| `thumbnail_text_color` | `#f19b8a` (coral/salmon) | `#ffffff` (white) |
| `content_title_text_color` | `#000000` (black) | `#ffffff` (white) |
| `content_title_bg_color` | `#f9e0db` (light coral) | `#f0836e` (coral) |

### wellbeingcollege

| Field | Light Mode | Dark Mode |
|-------|-----------|-----------|
| `thumbnail_text_color` | `#ffcd53` (gold) | `#ffffff` (white) |
| `content_title_text_color` | `#000000` (black) | `#ffffff` (white) |
| `content_title_bg_color` | `#fff4d6` (light yellow) | `#ebbe4d` (gold) |

### Pattern Summary

- **Dark mode**: All brands use `#ffffff` for both text colors. Only the bar bg varies.
- **Light mode**: Thumbnail text = brand's signature color. Content title text = `#000000` for all except vitalitycollege (`#ffffff`). Bar bg = pastel/light version of brand color for most, exact brand color for vitalitycollege.
- **Content body text** (not editable): always `#000000` light / `#ffffff` dark — hardcoded in renderer, not stored in colors.

---

## 6. File Change Summary

### Files to Create

| File | Purpose |
|------|---------|
| `scripts/migrate_rendering_colors.py` | One-time migration script to populate DB with hardcoded color values |

### Files to Modify

| File | Changes |
|------|---------|
| `app/core/brand_colors.py` | Update `get_brand_colors()` and `get_brand_display_name()` to read from DB first, keep hardcoded as fallback |
| `app/api/brands_routes_v2.py` | Update GET/POST theme endpoints to handle 6 rendering color fields |
| `app/api/brands/routes.py` | Same theme endpoint changes (duplicate file) |
| `src/features/brands/constants.ts` | Update `BrandTheme` interface and `BRAND_THEMES` dict to use 6 rendering color fields |
| `src/features/brands/components/BrandThemeModal.tsx` | Full redesign: new state vars, accurate 9:16 previews with stepped bars, 3 color pickers per mode |
| `index.html` | Add Poppins + Inter Google Fonts link (if not already present) |

### Files NOT Modified

| File | Reason |
|------|--------|
| `app/models/brands.py` | No schema change — rendering colors stored inside existing `colors` JSON column |
| `app/services/media/image_generator.py` | No change — it calls `get_brand_colors()` which will transparently read DB |
| `app/services/brands/manager.py` | No change — `update_brand()` already handles arbitrary `colors` dict updates |
| `app/services/brands/resolver.py` | No change — `brand_resolver.get_brand()` returns full Brand model with colors dict |

### Deployment Order

1. **Deploy backend** with updated `brand_colors.py` + API endpoints
2. **Run migration script** on production: `python -m scripts.migrate_rendering_colors`
3. **Deploy frontend** with redesigned BrandThemeModal
4. **Verify**: open theme modal for any brand → colors should load from DB and previews should match actual renders
