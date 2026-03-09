---
name: media-rendering
description: Use when modifying image rendering, fixing text layout, changing carousel slides, working on video generation, adjusting brand colors in renders, fixing font issues, changing caption format, or working on YouTube thumbnails.
---

# Media Rendering Pipeline

## Key Source Files

| File | Purpose |
|------|---------|
| `app/services/media/image_generator.py` | `ImageGenerator` — Pillow-based reel/post image rendering |
| `app/services/media/carousel_renderer.py` | `render_carousel_images()` — Node.js Konva subprocess |
| `app/services/media/video_generator.py` | `VideoGenerator` — FFmpeg MP4 from image + music |
| `app/services/media/slideshow_compositor.py` | `SlideshowCompositor` — Format B video rendering |
| `app/services/media/caption_builder.py` | `CaptionBuilder` — format title + lines + hashtags |
| `app/services/media/caption_generator.py` | `CaptionGenerator` — AI captions via DeepSeek |
| `scripts/render-slides.cjs` | Node.js carousel rendering script |
| `assets/fonts/` | Anton-Regular.ttf, InterVariable.ttf |

## Image Dimensions
```
REEL: 1080×1920 (9:16 vertical)
TITLE_FONT_SIZE: 56 (auto-scales to 30px min)
CONTENT_FONT_SIZE: 28
```

## Reel Image Rendering
- **Light mode:** Solid `#f4f4f4` background
- **Dark mode:** AI background + dark overlay (85% opacity)
- Title: uppercase, stepped background bars, max 4 lines
- Content: sequential numbering, **bold** markdown support, dynamic font sizing

## Carousel Rendering (Node.js)
Python calls `scripts/render-slides.cjs` via subprocess (60s timeout). PNG→JPEG conversion for Instagram (flatten alpha to white).

## Video Generation
```python
VideoGenerator.generate_reel_video(image, output, music_id, duration, music_url)
```
Duration: random 7-8s. Music resolution: user URL → music_id → random asset.

## Format B / Slideshow (`SlideshowCompositor`)
- Canvas: 1080×1920
- Stack: `padding_top` → Header → `gap` → Text → `gap` → Image → `padding_bottom`
- Defaults: padding_top=320, gap=40, image_height=660, padding_bottom=40

## Caption Format
```
TITLE (UPPERCASE)

1. Line one
2. Line two

#hashtag1 #hashtag2
```

## Common Mistakes
1. Carousels MUST be JPEG — PNG rejected by Instagram
2. Font paths differ in Docker (`/app/assets/fonts/`) vs local
3. Node.js subprocess has 60s timeout
4. Brand colors from DB via `get_brand_colors()` — never hardcode
5. YouTube thumbnails: NO text overlay, JPEG 90 quality (2MB limit)
