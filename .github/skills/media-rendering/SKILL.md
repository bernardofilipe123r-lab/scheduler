---
name: media-rendering
description: "Media rendering pipeline — image generation (Pillow), carousel rendering (Node.js Konva), video generation (FFmpeg), caption formatting, AI backgrounds, music selection. Use when: modifying image rendering, fixing text layout, changing carousel slides, working on video generation, adjusting brand colors in renders, fixing font issues, changing caption format, working on YouTube thumbnails."
---

# Media Rendering Pipeline

## When to Use
- Modifying reel/post image rendering (Pillow)
- Fixing text layout, font sizing, or wrapping
- Changing carousel slide rendering (Node.js Konva)
- Working on video generation (FFmpeg)
- Adjusting brand color usage in renders
- Fixing font loading or missing font errors
- Changing caption format or generation
- Working on YouTube thumbnails
- Modifying AI background generation
- Working on music selection logic

## Key Source Files

| File | Purpose |
|------|---------|
| `app/services/media/image_generator.py` | `ImageGenerator` — Pillow-based reel/post image rendering |
| `app/services/media/carousel_renderer.py` | `render_carousel_images()` — Node.js Konva subprocess |
| `app/services/media/video_generator.py` | `VideoGenerator` — FFmpeg MP4 from image + music |
| `app/services/media/caption_builder.py` | `CaptionBuilder` — format title + lines + hashtags |
| `app/services/media/caption_generator.py` | `CaptionGenerator` — AI-generated captions via DeepSeek |
| `app/services/media/music_picker.py` | Music selection logic |
| `app/services/media/ai_background.py` | AI-generated background images |
| `app/core/constants.py` | Image dimensions, font sizes, spacing constants |
| `app/utils/fonts.py` | Font loading and management |
| `app/utils/text_layout.py` | Text positioning & wrapping |
| `app/utils/text_formatting.py` | Caption & text formatting |
| `scripts/render-slides.cjs` | Node.js carousel rendering script |
| `assets/fonts/` | Anton-Regular.ttf, InterVariable.ttf |
| `assets/icons/` | share.png, save.png |

## Image Dimensions

```
REEL_WIDTH = 1080
REEL_HEIGHT = 1920  (9:16 vertical)
SIDE_MARGIN = 30
TITLE_SIDE_PADDING = 90
CONTENT_SIDE_PADDING = 108
TITLE_FONT_SIZE = 56  (auto-scales down to 30px)
CONTENT_FONT_SIZE = 28
CONTENT_LINE_SPACING = 1.4 (multiplier)
```

## Reel Image Rendering Logic

### Background
- **Light mode:** Solid color `#f4f4f4`
- **Dark mode:** AI-generated background with dark overlay (85% opacity default, configurable via `ctx`)

### Title Rendering
1. Parse manual `\n` breaks: auto-reduce font if needed (min 30px)
2. Auto-wrap: stepped scaling (56 → 46 → 40 → 36 px), prefer 3 lines
3. Uppercase conversion
4. Maximum 4 lines enforced
5. Stepped background bars (inset effect) with brand colors

### Content Rendering
1. ALL lines renumbered sequentially (including CTA) — existing numbers stripped first
2. **Bold** markdown support (`parse_bold_text`)
3. Dynamic font sizing: shrinks 1px at a time if content exceeds bottom margin
4. Line wrapping with `wrap_text_with_bold()`
5. Bullet spacing: `font_size × 0.6`

### Color Loading
`get_brand_colors(brand_name, variant)` returns `BrandColorConfig` with:
- `thumbnail_text_color`
- `content_title_bg_color`
- `content_title_text_color`

Colors come from Brand DB record — **never hardcoded per brand**.

## Carousel Rendering (Node.js)

Carousels use a **separate Node.js process** (not Python Pillow):

```
Python: render_carousel_images()
  → Build brand config from DB (colors, handle, display_name, abbreviation, logo)
  → Download logo from URL
  → Call Node.js: scripts/render-slides.cjs via subprocess (60s timeout)
  → Convert PNG → JPEG (flatten alpha to white)
  → Upload each image to Supabase Storage
  → Return URLs
```

### Node.js Script Input (JSON)
```json
{
  "brand": "brand_id",
  "brandConfig": {
    "name": "Display Name",
    "color": "#primary_hex",
    "accentColor": "#accent_hex",
    "abbreviation": "LCO",
    "handle": "@brand_handle"
  },
  "title": "Post Title",
  "backgroundImage": "/path/to/bg.png",
  "slideTexts": ["text1", "text2"],
  "coverOutput": "/tmp/post_brand.png",
  "slideOutputs": ["/tmp/slide0.png"],
  "logoPath": "/tmp/logo.png",
  "fontPaths": {
    "anton": "/assets/fonts/Anton-Regular.ttf",
    "inter": "/assets/fonts/InterVariable.ttf"
  }
}
```

**Docker paths:** `/app/` paths override local paths. Font and icon paths resolve differently in Docker vs local dev.

## Video Generation

```python
VideoGenerator.generate_reel_video(
    reel_image_path,
    output_path,
    music_id=None,      # From music map
    duration=None,       # Random [7, 8] if None
    music_url=None       # User-uploaded URL
)
```

1. Determine duration (random 7-8s default)
2. Resolve music: user URL → music_id → random asset
3. Pick random start time in music (ensure enough duration)
4. Call FFmpeg via `create_video_from_image()`
5. If music not found → video without audio

### Music Map
```python
{
    "default_01": "default_01.mp3",
    "default_02": "default_02.mp3",
    "energetic_01": "energetic_01.mp3",
    "calm_01": "calm_01.mp3",
    "motivational_01": "motivational_01.mp3"
}
```

## Caption Format

```
TITLE (UPPERCASE)

1. Line one
2. Line two
3. Line three

#hashtag1 #hashtag2 ...
```

### AI Caption Generation (DeepSeek)
- First paragraph: temp=1.0 (maximum variation), randomized opening styles
- YouTube titles: searchable, non-list format, temp=0.85
- All captions are per-brand unique (iterates brands)

## YouTube Thumbnails
- Pure AI image, NO text overlay
- JPEG at 90 quality (YouTube 2MB size limit)
- No brand colors or text — clean image only

## PNG → JPEG Conversion
Instagram rejects PNG in carousels. Auto-conversion:
1. Flatten alpha channel to white background
2. Convert RGBA → RGB mode
3. Save as JPEG

## Common Mistakes to Avoid
1. **PNG on Instagram:** Carousels MUST be JPEG — auto-convert with alpha flattening
2. **Font paths in Docker:** Use `/app/assets/fonts/` in Docker, local paths otherwise — check both
3. **Carousel timeout:** Node.js subprocess has 60s timeout — complex slides can hit this
4. **Bold markdown in Pillow:** Use `parse_bold_text()` — don't try manual regex
5. **Brand colors:** Always load from DB via `get_brand_colors()` — never hardcode per brand
6. **Music resolution order:** user URL → music_id → random. Don't skip user-uploaded URLs
7. **YouTube thumbnail:** NO text — Instagram and YouTube have different requirements
