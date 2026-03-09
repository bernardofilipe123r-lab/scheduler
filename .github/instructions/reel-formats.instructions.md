---
description: "Use when editing reel format pipelines (Format A text_based, Format B text_video). Covers format isolation, routing chain, design models, rendering, and how to add new formats."
applyTo: "app/services/media/**/*.py,app/services/content/**/*.py,app/services/discovery/**/*.py,app/api/content/**/*.py,src/features/reels/**/*.tsx"
---

# Reel Format Architecture

Two independent reel pipelines. Each brand has `reel_format` ("text_based" or "text_video") stored in `toby_brand_config`.

**Cardinal rule:** Formats are fully isolated. Changes to one format must NEVER affect another. No shared mutable state between format pipelines.

## Format A — `text_based` (light/dark variants)

| Layer | File | Key Entry Point |
|---|---|---|
| Design Editor | `src/features/reels/DesignEditorTab.tsx` → `TextReelsDesign` → `BrandThemeModal` | Colors stored on `brands.colors` JSON |
| Design Storage | `brands` table (`colors` JSON: primary, accent, text, etc.) | No dedicated design table |
| API Routes | `app/api/content/reel_routes.py` | `/create`, `/generate` |
| Content Gen | `app/services/content/generator.py` → `ContentGeneratorV2` | 3-layer: viral_patterns → prompt_templates → runtime |
| Image Render | `app/services/media/image_generator.py` → `ImageGenerator` | AI backgrounds (DeAPI), Pillow compositing |
| Video Render | `app/services/media/video_generator.py` → `VideoGenerator` | FFmpeg + music |
| Job Routing | `app/services/content/job_processor.py` → `regenerate_brand()` | `variant == "light"` or `"dark"` |
| Toby Pool | `app/services/toby/learning_engine.py` → `REEL_PERSONALITIES` | `content_type == "reel"` |

## Format B — `text_video` (slideshow with text header)

| Layer | File | Key Entry Point |
|---|---|---|
| Design Editor | `src/features/reels/DesignEditorTab.tsx` → `TextVideoDesign` | Font, gap, padding, image height sliders |
| Design Storage | `app/models/text_video_design.py` → `TextVideoDesign` model | `text_video_design` table per user |
| API Routes | `app/api/content/text_video_routes.py` | `/discover`, `/polish`, `/source-images`, `/generate` |
| Content Gen | `app/services/discovery/story_polisher.py` → `StoryPolisher` | DeepSeek generates text + AI image prompts |
| Video Render | `app/services/media/slideshow_compositor.py` → `SlideshowCompositor` | Brand header + text + crossfade slideshow |
| Job Routing | `app/services/content/job_processor.py` → `process_text_video_brand()` | `variant == "text_video"` |
| Toby Pool | `app/services/toby/learning_engine.py` → `TEXT_VIDEO_PERSONALITIES` | `content_type == "text_video_reel"` |

## Routing Chain (how format propagates end-to-end)

1. **Brand config** → `toby_brand_config.reel_format` = `"text_based"` or `"text_video"`
2. **Buffer manager** (`buffer_manager.py:125`) → reads `bc.reel_format`, maps to `content_type` = `"reel"` or `"text_video_reel"`
3. **Orchestrator** (`orchestrator.py:470`) → branches on `plan.content_type` → different content generators
4. **Job creation** (`orchestrator.py:567`) → sets `content_format` and `variant` on `GenerationJob`
5. **Job processor** (`job_processor.py:939`) → branches on `job.variant == "text_video"` → different renderers

## Format B Layout Math (`slideshow_compositor.py`)

- Canvas: 1080×1920
- Vertical stack: `padding_top` → Header → `gap` → Text → `gap` → Image → `padding_bottom`
- Image Y position: `text_end_y + gap` (placed right after text + configured gap)
- Fallback if text overflows: `H - padding_bottom - image_height` (bottom-anchored)
- Defaults: `reel_padding_top=320`, `reel_section_gap=40`, `reel_image_height=660`, `reel_padding_bottom=40`
- Frontend preview (`ReelFramePreview`) uses flexbox column with identical logic

## Isolation Rules

- **Separate API route files.** Format A: `reel_routes.py`. Format B: `text_video_routes.py`. Never mix endpoints.
- **Separate rendering classes.** Format A: `ImageGenerator` + `VideoGenerator`. Format B: `SlideshowCompositor`. Never share frame-building code.
- **Separate content generators.** Format A: `ContentGeneratorV2`. Format B: `StoryPolisher`. Never share prompt logic.
- **Separate design models.** Format A: `brands.colors`. Format B: `text_video_design` table. Never read one format's design settings when rendering the other.
- **Separate personality pools.** `REEL_PERSONALITIES` vs `TEXT_VIDEO_PERSONALITIES`. Never mix pools.
- **Job processor branching must be explicit.** Use `if job.variant == "text_video"` — never rely on fallthrough or default behavior.

## Adding a New Format (e.g., Format C)

Follow this checklist in order:

1. **DB migration:** Add new value to `reel_format` CHECK constraint
2. **Design model:** Create new model + table (like `TextVideoDesign`)
3. **Design editor:** Add new tab in `DesignEditorTab.tsx` with its own component
4. **API routes:** Create new route file (like `text_video_routes.py`), register in `main.py`
5. **Content generator:** Create new class for content generation
6. **Rendering compositor:** Create new class for video rendering
7. **Personality pool:** Add new pool in `learning_engine.py`
8. **Buffer manager:** Add `content_type` mapping for new format (`buffer_manager.py`)
9. **Orchestrator:** Add branch in `_execute_content_plan()` for new `content_type`
10. **Job processor:** Add branch for new `variant` with dedicated processing method
11. **Self-maintenance:** Update `self-maintenance.instructions.md` trigger matrix and this file
