# TEXT-VIDEO Reels — Full Implementation Spec

> **Purpose:** This document is an AI-coder prompt. It contains every decision, file path, model field, migration, and UI spec needed to implement the TEXT-VIDEO reel format end-to-end in ViralToby. An AI agent reading this document should be able to execute the implementation without asking clarifying questions, except at the explicitly marked `[ASK USER]` decision points.

---

## Table of Contents

1. [Format Definition](#1-format-definition)
2. [Architecture Overview](#2-architecture-overview)
3. [Story Discovery Pipeline](#3-story-discovery-pipeline)
4. [Story Polishing Pipeline](#4-story-polishing-pipeline)
5. [Image Sourcing Pipeline](#5-image-sourcing-pipeline)
6. [Thumbnail Compositor](#6-thumbnail-compositor)
7. [Reel Video Compositor](#7-reel-video-compositor)
8. [The `/reels` Page Redesign](#8-the-reels-page-redesign)
9. [Auto-Generate Flow (Non-Toby)](#9-auto-generate-flow-non-toby)
10. [Toby Integration (Optional Premium Upsell)](#10-toby-integration-optional-premium-upsell)
11. [Database Migrations](#11-database-migrations)
12. [Backend: New Files & Modified Files](#12-backend-new-files--modified-files)
13. [Frontend: New Files & Modified Files](#13-frontend-new-files--modified-files)
14. [API Endpoints](#14-api-endpoints)
15. [Deduplication & Story Pool](#15-deduplication--story-pool)
16. [Story Categories & Topic Diversity](#16-story-categories--topic-diversity)
17. [Cost Analysis](#17-cost-analysis)
18. [Implementation Order](#18-implementation-order)
19. [Validation & Testing](#19-validation--testing)
20. [Open Decision Points](#20-open-decision-points)

---

## 1. Format Definition

### What It Is

The "text-over-black + slideshow" reel format, popularized by pages like @execute, @luxurylife, @factsdailyy on Instagram. This is a **new content type** in ViralToby alongside the existing `text_based` reels and `post` carousels.

### Visual Anatomy

```
┌──────────────────────────────────┐
│                                  │
│   [ BRAND LOGO ]                 │  ← Small logo, top-center
│                                  │
│   BOLD WHITE TEXT                │  ← Story text, centered
│   SPANNING 3-6 LINES            │     All-caps or mixed case
│   ON BLACK BACKGROUND           │     Poppins-Bold or configurable
│                                  │
│   ─────── @ handle ──────────   │  ← Divider + handle footer
│                                  │
│                                  │
│   ┌─────────────────────────┐   │
│   │                         │   │
│   │   BACKGROUND IMAGE      │   │  ← 2-4 images with crossfade
│   │   (slideshow area)      │   │     Each image 2-3s, 0.2s fade
│   │                         │   │
│   └─────────────────────────┘   │
│                                  │
└──────────────────────────────────┘
          1080 × 1920
```

### Timeline

```
0s ──── 1s ──── 4s ──── 7s ──── 10s ──── 13s ──── 15s
│ fade  │  img1  │ fade │  img2  │  fade  │  img3  │
│ in    │        │ 0.2s │        │  0.2s  │        │
│ black │    +   text stays visible throughout      │
│→norm  │                                           │
│       │           + music underneath              │
```

- **Frame 0-1s:** Entire frame starts black, fades to normal (opacity 1→0 on black overlay)
- **Frame 1s+:** Background images cycle as crossfade slideshow (2-3s per image, 0.2s transition)
- **Text:** Visible throughout, positioned upper half on black/semi-transparent region
- **Music:** Trending track plays throughout
- **Duration:** 10-15s total (configurable per brand in design settings)

### Thumbnail Anatomy

The thumbnail is a **separate composition**, NOT the first frame:

```
┌──────────────────────────────────┐
│                                  │
│   MAIN IMAGE                     │  ← ~60% of frame (top half)
│   (real photo or AI-generated)   │     Slight bottom gradient
│                                  │
│                                  │
├──────── [ LOGO ] ────────────────┤  ← Thin divider line + centered logo
│                                  │
│   BOLD TITLE TEXT                │  ← ~40% of frame (bottom half)
│   IN ALL CAPS                    │     Black background
│   YELLOW OR WHITE                │     3-5 lines max
│                                  │
└──────────────────────────────────┘
          1080 × 1920
```

---

## 2. Architecture Overview

### New `content_format` Dimension

Currently, ViralToby has two content types determined by `variant`:
- `variant = "light" | "dark"` → text-based reels (static image + FFmpeg video)
- `variant = "post"` → carousel posts (Node.js Konva rendered)

The TEXT-VIDEO format introduces a third pipeline. Rather than overloading `variant`, we add a new field `content_format`:

| `content_format` | `variant` | Pipeline |
|---|---|---|
| `text_based` (default) | `light` / `dark` | Current: Pillow image → FFmpeg static video |
| `text_based` | `post` | Current: Konva carousel rendering |
| `text_video` | (not used) | New: Story discovery → image sourcing → FFmpeg slideshow |

**Backward compatibility:** All existing jobs and content have `content_format = NULL` or `text_based`. The new field defaults to `text_based` so nothing breaks.

### End-to-End Pipeline

```
User selects niche (Finance, Tech, Health, etc.)
         │
         ▼
┌─────────────────────────────────────────────┐
│  1. STORY DISCOVERY                          │
│     NewsAPI + Tavily → 10-15 raw stories     │
│     Per niche category, mixed recency         │
└──────────┬──────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│  2. STORY SELECTION + POLISH (DeepSeek)      │
│     Pick most viral story → rewrite in       │
│     @execute format → generate image plan    │
│     → generate video search keywords         │
└──────────┬──────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│  3. IMAGE SOURCING                           │
│     Per image in plan:                       │
│       web_search → SerpAPI/Bing Image Search │
│       ai_generate → Nano Banana 2 (Gemini)  │
│     Download + validate + resize to 1080x1920│
└──────────┬──────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│  4. THUMBNAIL COMPOSITION (Pillow)           │
│     Best image (top 60%) + divider + logo +  │
│     bold title text (bottom 40%)             │
└──────────┬──────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│  5. REEL VIDEO COMPOSITION (FFmpeg)          │
│     Images → crossfade slideshow (2-3s each) │
│     + text overlay PNG rendered by Pillow     │
│     + 1s black-to-normal fade-in             │
│     + trending music                         │
│     → 1080×1920 MP4, 10-15s                  │
└──────────┬──────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────┐
│  6. UPLOAD + SCHEDULE + PUBLISH              │
│     Supabase Storage → ScheduledReel →       │
│     SocialPublisher (IG/FB/YT/TikTok)        │
└─────────────────────────────────────────────┘
```

---

## 3. Story Discovery Pipeline

### Purpose

Find real, specific, interesting stories from the web. The current system only uses static `NicheConfig.topic_categories` + DeepSeek's training data. TEXT-VIDEO reels require **real-world stories** because the content is factual narratives (e.g., "Bad Bunny sold his Bugatti for a Corolla"), not generic advice.

### APIs to Use

| API | Purpose | Free Tier | Cost (Paid) | Priority |
|---|---|---|---|---|
| **NewsAPI** (`newsapi.org`) | Recent news articles (last 30 days) | 100 req/day | $449/mo for 250k req | **Primary** for fresh stories |
| **Tavily** (`tavily.com`) | AI-native web search, returns clean text | 1000 req/mo free | $0.01/search | **Primary** for famous/timeless stories |
| **SerpAPI** (`serpapi.com`) | Google Search results as JSON | 100 req/mo free | $50/mo for 5k req | **Backup** search engine |
| **Google Trends** (unofficial pytrends) | What's trending right now | Free (scraping) | — | **Discovery** for topic ideas |

### New File: `app/services/discovery/story_discoverer.py`

```python
class StoryDiscoverer:
    """Discovers viral-worthy stories from multiple web sources."""

    async def discover_stories(
        self,
        niche: str,                    # e.g., "finance", "tech", "health"
        category: str,                 # e.g., "power_moves", "controversy", "underdog"
        recency: str = "mixed",        # "recent" | "famous" | "mixed"
        count: int = 10,
    ) -> list[RawStory]:
        """
        Search multiple sources and return ranked candidate stories.

        Args:
            niche: The broad topic area
            category: Story archetype (see Section 16)
            recency: Whether to prioritize recent news or timeless stories
            count: Number of candidates to return
        """
```

**`RawStory` dataclass:**
```python
@dataclass
class RawStory:
    headline: str
    summary: str           # 2-3 sentence summary
    source_url: str
    source_name: str       # "BBC News", "TechCrunch", etc.
    published_at: Optional[datetime]
    relevance_score: float  # 0-1, how well it matches the niche+category
    image_urls: list[str]   # Any images found in the article
```

### Search Strategy per Recency Mode

**Recent (60% of daily stories):**
```python
# NewsAPI call
newsapi.get_everything(
    q=f"{niche} {category_keywords}",
    language="en",
    sort_by="relevancy",
    from_param=(datetime.now() - timedelta(days=7)).isoformat(),
    page_size=10,
)
```

**Famous/Timeless (30% of daily stories):**
```python
# Tavily call
tavily.search(
    query=f"most interesting {niche} facts stories viral",
    search_depth="advanced",
    max_results=10,
    include_answer=True,
)
```

**Evergreen (10% of daily stories):**
No web search — DeepSeek generates from training data (same as current flow). Use for stories that don't need to be tied to real events.

### New File: `app/services/discovery/__init__.py`

Empty init file for the discovery service module.

### Environment Variables Required

```
NEWSAPI_KEY=<newsapi.org API key>
TAVILY_API_KEY=<tavily.com API key>
SERPAPI_KEY=<serpapi.com API key>  # optional backup
GEMINI_API_KEY=<Google AI Studio API key>  # for Nano Banana 2 image gen
```

These must be set via `railway variables set KEY=value` before deployment.

---

## 4. Story Polishing Pipeline

### Purpose

Take a raw story from the discovery pipeline and rewrite it into the exact @execute-style viral text format + generate metadata for image sourcing.

### New File: `app/services/discovery/story_polisher.py`

```python
class StoryPolisher:
    """Rewrites raw stories into viral reel format using DeepSeek."""

    def polish_story(
        self,
        raw_story: RawStory,
        niche: str,
        brand_config: BrandConfig,
        ctx: Optional[PromptContext] = None,
    ) -> PolishedStory:
        """
        Call DeepSeek to rewrite the story and generate all metadata.

        Returns a PolishedStory with:
        - Formatted reel text (3-6 lines, viral hook style)
        - Thumbnail title (short, punchy, 3-5 words per line)
        - Image sourcing plan (web_search vs ai_generate per image)
        - Caption with hashtags
        - Story category classification
        """
```

**`PolishedStory` dataclass:**
```python
@dataclass
class PolishedStory:
    # Reel text content
    reel_text: str                    # Full text shown on reel (3-6 lines)
    reel_lines: list[str]            # Same but split into lines

    # Thumbnail
    thumbnail_title: str             # Short punchy title for thumbnail (ALL CAPS)
    thumbnail_title_lines: list[str] # Split into display lines

    # Image sourcing plan
    images: list[ImagePlan]          # 3-4 images for slideshow
    thumbnail_image: ImagePlan       # Main image for thumbnail

    # Caption + metadata
    caption: str
    hashtags: list[str]
    story_category: str              # e.g., "power_moves", "controversy"

    # Source attribution
    source_story: RawStory
    story_fingerprint: str           # For dedup (hash of headline + key facts)

@dataclass
class ImagePlan:
    source_type: str                 # "web_search" | "ai_generate"
    query: str                       # Search query OR generation prompt
    fallback_query: Optional[str]    # Backup query if primary returns nothing
```

### DeepSeek Prompt Template

The polishing prompt must produce structured JSON output. Add to existing prompt infrastructure:

**New file: `app/core/text_video_prompts.py`**

```python
TEXT_VIDEO_SYSTEM_PROMPT = """You are a viral content writer for Instagram Reels.
You specialize in the "text-over-black + background images" format.

Your job: Take a raw news story or interesting fact and transform it into:
1. A viral reel script (3-6 punchy lines, shown over images)
2. A thumbnail title (short, ALL CAPS, designed to stop scrollers)
3. Image search queries for sourcing relevant background images
4. A caption with hashtags

Style reference: @execute, @factsdailyy, @luxurylife on Instagram.

RULES:
- Opening line MUST be a bold, attention-grabbing statement
- Use short sentences. Max 15 words per line.
- End with an insight, lesson, or thought-provoking closer
- Thumbnail title: 3-5 words per line, max 4 lines, ALL CAPS
- Image queries must be specific enough to find relevant photos
- For real people/places: use "web_search" source type
- For abstract concepts: use "ai_generate" source type
"""

TEXT_VIDEO_POLISH_PROMPT = """Given this story:
HEADLINE: {headline}
SUMMARY: {summary}
SOURCE: {source_name}

Niche: {niche}

Return ONLY valid JSON:
{{
  "reel_text": "Line 1\\nLine 2\\nLine 3\\n...",
  "thumbnail_title": "BOLD\\nTHUMB\\nTITLE",
  "images": [
    {{"source_type": "web_search"|"ai_generate", "query": "...", "fallback_query": "..."}},
    ...3-4 images total
  ],
  "thumbnail_image": {{"source_type": "web_search"|"ai_generate", "query": "..."}},
  "caption": "Full caption text with emojis...",
  "hashtags": ["tag1", "tag2", ...],
  "story_category": "power_moves|controversy|underdog|prediction|shocking_stat|human_moment|industry_shift|failed_bet|hidden_cost|scientific_breakthrough"
}}
"""
```

### Integration Point

Uses the existing DeepSeek API client pattern from `app/services/content/generator.py` (`ContentGeneratorV2`). The `openai` library with `base_url="https://api.deepseek.com"` stays the same. Model: `deepseek-chat`.

---

## 5. Image Sourcing Pipeline

### Purpose

Download or generate 3-4 high-quality images per reel + 1 for the thumbnail, based on the `ImagePlan` from the polisher.

### New File: `app/services/media/image_sourcer.py`

```python
class ImageSourcer:
    """Sources images from web search APIs and AI generators."""

    def source_image(self, plan: ImagePlan) -> Optional[Path]:
        """
        Source a single image based on the plan.

        For web_search: SerpAPI Google Images → download highest res match
        For ai_generate: Gemini API (Nano Banana 2) → generate image

        Returns path to downloaded/generated image (1080x1920 or raw).
        Returns None if all attempts fail.
        """

    def source_images_batch(self, plans: list[ImagePlan]) -> list[Optional[Path]]:
        """Source multiple images, with fallback for failures."""
```

### Web Image Search (SerpAPI)

```python
def _search_web_images(self, query: str, count: int = 5) -> list[dict]:
    """Search Google Images via SerpAPI."""
    import requests
    resp = requests.get("https://serpapi.com/search", params={
        "engine": "google_images",
        "q": query,
        "api_key": os.getenv("SERPAPI_KEY"),
        "num": count,
        "ijn": "0",
        "safe": "active",
    })
    results = resp.json().get("images_results", [])
    # Filter: minimum resolution, prefer portrait or square
    return [r for r in results if r.get("original_width", 0) >= 800]
```

### AI Image Generation (Gemini API — Nano Banana 2)

```python
def _generate_ai_image(self, prompt: str) -> Optional[Path]:
    """Generate image using Google Gemini API (Nano Banana 2 / Imagen)."""
    import google.generativeai as genai  # pip install google-generativeai

    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.ImageGenerationModel("imagen-3.0-generate-002")  # Nano Banana 2

    response = model.generate_images(
        prompt=prompt,
        number_of_images=1,
        aspect_ratio="9:16",  # Portrait for reels
        safety_filter_level="block_only_high",
    )

    if response.images:
        img_bytes = response.images[0]._pil_image
        # Save to temp file
        path = Path(tempfile.mktemp(suffix=".png"))
        img_bytes.save(path)
        return path
    return None
```

**`[ASK USER]` Decision Point 1:** The Gemini API for Imagen (Nano Banana) uses the `google-generativeai` Python package. Confirm the exact model name and API structure — Google may have updated the SDK since this spec was written. The AI coder should check the latest Gemini API docs at `ai.google.dev` before implementing.

### Image Post-Processing

All sourced images must be:
1. Resized/cropped to 1080×1920 (cover-fit, center-crop)
2. Converted to RGB (no alpha channel for video)
3. Saved as high-quality JPEG (quality=95)

```python
def _process_image(self, raw_path: Path, target_size=(1080, 1920)) -> Path:
    """Resize/crop image to target dimensions."""
    from PIL import Image
    img = Image.open(raw_path).convert("RGB")

    # Cover-fit: scale to fill, then center-crop
    target_w, target_h = target_size
    ratio_w = target_w / img.width
    ratio_h = target_h / img.height
    scale = max(ratio_w, ratio_h)

    new_w = int(img.width * scale)
    new_h = int(img.height * scale)
    img = img.resize((new_w, new_h), Image.LANCZOS)

    # Center crop
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    img = img.crop((left, top, left + target_w, top + target_h))

    output = raw_path.with_suffix(".processed.jpg")
    img.save(output, "JPEG", quality=95)
    return output
```

### Fallback Strategy

```
Primary: ImagePlan.query via web_search or ai_generate
   ↓ (fails)
Fallback: ImagePlan.fallback_query
   ↓ (fails)
Last resort: Pexels Video API frame grab OR solid color background
```

### Pexels as Backup Image Source (Free, No Key Required for Images)

```python
def _search_pexels_images(self, query: str, count: int = 5) -> list[dict]:
    """Search Pexels photos API as fallback."""
    import requests
    resp = requests.get("https://api.pexels.com/v1/search", params={
        "query": query,
        "per_page": count,
        "orientation": "portrait",
        "size": "large",
    }, headers={"Authorization": os.getenv("PEXELS_API_KEY")})
    return resp.json().get("photos", [])
```

**Environment variable:** `PEXELS_API_KEY` (free, unlimited, 200 req/hr)

---

## 6. Thumbnail Compositor

### Purpose

Compose the Instagram thumbnail (cover image) for the reel — a separate image from the reel video itself.

### New File: `app/services/media/thumbnail_compositor.py`

```python
class ThumbnailCompositor:
    """Composes Instagram reel thumbnails in the @execute style."""

    def compose_thumbnail(
        self,
        main_image_path: Path,
        title_lines: list[str],
        brand_config: BrandConfig,
        design: TextVideoDesign,
        logo_path: Optional[Path] = None,
    ) -> Path:
        """
        Compose a thumbnail with:
        - Top ~60%: main image (cover-fit, slight bottom gradient)
        - Divider line with centered logo
        - Bottom ~40%: black background + bold title text

        Args:
            main_image_path: Path to the main image (already processed to 1080xN)
            title_lines: Title text split into lines (ALL CAPS)
            brand_config: Brand configuration (colors, logo)
            design: User's design preferences (from TextVideoDesign model)
            logo_path: Path to brand logo (optional)

        Returns:
            Path to the composed thumbnail JPEG (1080×1920)
        """
```

### Composition Details

```python
def compose_thumbnail(self, ...):
    from PIL import Image, ImageDraw, ImageFont

    W, H = 1080, 1920
    canvas = Image.new("RGB", (W, H), (0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    # 1. Place main image in top portion
    image_ratio = design.thumbnail_image_ratio  # default 0.6
    image_h = int(H * image_ratio)
    main_img = Image.open(main_image_path).convert("RGB")
    main_img = self._cover_fit(main_img, W, image_h)
    canvas.paste(main_img, (0, 0))

    # 2. Bottom gradient on image (so it blends into divider)
    gradient = Image.new("RGBA", (W, 80), (0, 0, 0, 0))
    for y in range(80):
        alpha = int(255 * (y / 80))
        for x in range(W):
            gradient.putpixel((x, y), (0, 0, 0, alpha))
    canvas.paste(gradient, (0, image_h - 80), gradient)

    # 3. Divider line + logo
    divider_y = image_h + 10
    draw.line([(40, divider_y), (W - 40, divider_y)], fill=(80, 80, 80), width=2)
    if logo_path and Path(logo_path).exists():
        logo = Image.open(logo_path).convert("RGBA")
        logo = logo.resize((60, 60), Image.LANCZOS)
        logo_x = (W - 60) // 2
        canvas.paste(logo, (logo_x, divider_y - 30), logo)

    # 4. Title text in bottom portion
    title_y_start = divider_y + 40
    font = ImageFont.truetype(
        f"assets/fonts/{design.thumbnail_title_font}",
        design.thumbnail_title_size
    )
    title_color = design.thumbnail_title_color  # e.g., "#FFD700"

    for i, line in enumerate(title_lines):
        text_bbox = draw.textbbox((0, 0), line, font=font)
        text_w = text_bbox[2] - text_bbox[0]
        text_h = text_bbox[3] - text_bbox[1]
        x = (W - text_w) // 2  # Center horizontally
        y = title_y_start + i * (text_h + 15)
        draw.text((x, y), line, fill=title_color, font=font)

    # 5. Save
    output = Path(tempfile.mktemp(suffix="_thumb.jpg"))
    canvas.save(output, "JPEG", quality=95)
    return output
```

---

## 7. Reel Video Compositor

### Purpose

Create the final MP4 reel: images crossfading as slideshow + text overlay + 1s black fade-in + music.

### New File: `app/services/media/slideshow_compositor.py`

This is the most complex new file. It uses FFmpeg to compose the final video.

```python
class SlideshowCompositor:
    """Composes the TEXT-VIDEO reel: image slideshow + text overlay + music."""

    def compose_reel(
        self,
        image_paths: list[Path],         # 3-4 background images
        text_overlay_path: Path,          # PNG with transparent background (text rendered by Pillow)
        music_path: Optional[Path],
        output_path: Path,
        design: TextVideoDesign,
    ) -> Path:
        """
        Compose the final reel video.

        Steps:
        1. Create crossfade slideshow from images (2-3s each, 0.2s fade)
        2. Overlay text PNG on top
        3. Add 1s black-to-transparent fade-in
        4. Add music with fadeout
        5. Export as 1080×1920 MP4

        Returns:
            Path to the output MP4 file
        """
```

### Text Overlay Rendering (Pillow)

Before FFmpeg composition, render the text overlay as a transparent PNG:

```python
def render_text_overlay(
    self,
    reel_lines: list[str],
    brand_config: BrandConfig,
    design: TextVideoDesign,
    logo_path: Optional[Path] = None,
) -> Path:
    """
    Render the text overlay as a transparent PNG.

    Layout:
    - Small logo at top center
    - Main text centered in upper 50-60% of frame
    - Divider line + @handle at bottom of text area
    - Lower 40% is transparent (for background images)
    """
    from PIL import Image, ImageDraw, ImageFont

    W, H = 1080, 1920
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Semi-transparent black region for text area (top 55%)
    text_bg = Image.new("RGBA", (W, int(H * 0.55)), (0, 0, 0, int(255 * 0.85)))
    overlay.paste(text_bg, (0, 0), text_bg)

    # Gradient fade at bottom of text area
    gradient_h = 100
    for y in range(gradient_h):
        alpha = int(255 * 0.85 * (1 - y / gradient_h))
        for x in range(W):
            overlay.putpixel((x, int(H * 0.55) + y), (0, 0, 0, alpha))

    # Logo
    if logo_path and Path(logo_path).exists():
        logo = Image.open(logo_path).convert("RGBA")
        logo = logo.resize((80, 80), Image.LANCZOS)
        overlay.paste(logo, ((W - 80) // 2, 120), logo)

    # Main text
    font = ImageFont.truetype(
        f"assets/fonts/{design.reel_text_font}",
        design.reel_text_size
    )
    text_y = 250  # Below logo
    for line in reel_lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        x = (W - tw) // 2
        draw.text((x, text_y), line, fill="white", font=font)
        text_y += (bbox[3] - bbox[1]) + design.reel_line_spacing

    # Handle / footer text
    handle_font = ImageFont.truetype(f"assets/fonts/{design.reel_text_font}", 28)
    handle_text = f"@{design.instagram_handle or 'viraltoby'}"
    hbbox = draw.textbbox((0, 0), handle_text, font=handle_font)
    hw = hbbox[2] - hbbox[0]
    draw.text(((W - hw) // 2, text_y + 40), handle_text, fill=(180, 180, 180), font=handle_font)

    # Divider line above handle
    draw.line([(W // 2 - 120, text_y + 25), (W // 2 + 120, text_y + 25)], fill=(100, 100, 100), width=1)

    output = Path(tempfile.mktemp(suffix="_overlay.png"))
    overlay.save(output, "PNG")
    return output
```

### FFmpeg Slideshow Composition

```python
def _compose_with_ffmpeg(
    self,
    image_paths: list[Path],
    text_overlay_path: Path,
    music_path: Optional[Path],
    output_path: Path,
    design: TextVideoDesign,
) -> bool:
    """Build and execute the FFmpeg command for slideshow + overlay + music."""

    duration_per_image = design.image_duration  # default 3.0s
    fade_duration = design.image_fade_duration  # default 0.2s
    total_duration = len(image_paths) * duration_per_image
    black_fade_duration = 1.0  # Always 1s fade-in from black

    # Build FFmpeg filter_complex for crossfade slideshow
    inputs = []
    filter_parts = []

    for i, img_path in enumerate(image_paths):
        inputs.extend(["-loop", "1", "-t", str(duration_per_image + fade_duration), "-i", str(img_path)])

    # Text overlay input
    inputs.extend(["-i", str(text_overlay_path)])

    # Build crossfade chain
    n = len(image_paths)
    if n == 1:
        filter_parts.append(f"[0:v]scale=1080:1920,setsar=1[bg]")
    else:
        # Chain crossfades: [0][1]xfade → [01][2]xfade → ...
        prev = "0:v"
        for i in range(1, n):
            offset = i * duration_per_image - fade_duration * i
            out_label = f"v{i}"
            filter_parts.append(
                f"[{prev}][{i}:v]xfade=transition=fade:duration={fade_duration}:offset={offset}[{out_label}]"
            )
            prev = out_label
        filter_parts.append(f"[{prev}]scale=1080:1920,setsar=1[bg]")

    # Overlay text
    text_input_idx = n
    filter_parts.append(f"[bg][{text_input_idx}:v]overlay=0:0[textbg]")

    # Black fade-in (first 1 second)
    filter_parts.append(
        f"[textbg]fade=type=in:start_time=0:duration={black_fade_duration}[final]"
    )

    filter_complex = ";".join(filter_parts)

    cmd = ["ffmpeg", "-y"] + inputs
    if music_path:
        cmd.extend(["-i", str(music_path)])
    cmd.extend([
        "-filter_complex", filter_complex,
        "-map", "[final]",
    ])
    if music_path:
        music_idx = text_input_idx + 1
        cmd.extend([
            "-map", f"{music_idx}:a",
            "-c:a", "aac",
            "-b:a", "128k",
        ])
    cmd.extend([
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-r", "30",
        "-threads", "1",
        "-t", str(total_duration),
        "-shortest",
        str(output_path),
    ])

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    return result.returncode == 0
```

---

## 8. The `/reels` Page Redesign

### Current State

[src/pages/Generator.tsx](src/pages/Generator.tsx) (850 lines) at route `/reels`. It has:
- Manual mode: user types title + content lines → selects brands/variant/platforms → creates job
- Auto-generate modal: press button → backend generates AI content + media pipeline
- Settings sidebar: variant, image model, CTA, platforms, music

### New Design: Tabbed Interface

The `/reels` page becomes a **tabbed hub** with 3 tabs:

```
┌──────────────────────────────────────────────────────────┐
│  Create Reels                                            │
│  Create viral content for all brands in seconds          │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────┐     │
│  │ Text     │  │ Text-Video   │  │ Design Editor  │     │
│  │ Reels    │  │ Reels ✨     │  │                │     │
│  └──────────┘  └──────────────┘  └────────────────┘     │
│                                                          │
│  [Tab content below]                                     │
└──────────────────────────────────────────────────────────┘
```

**Tab 1: Text Reels** — Current Generator.tsx content (text_based format). No changes needed except wrapping in a tab.

**Tab 2: Text-Video Reels** — New content for the TEXT-VIDEO format. Has 3 sub-modes:
1. **Manual mode:** User provides their own story text + uploads/selects images
2. **Semi-auto mode:** User presses "Generate" button → system discovers story + sources images → user can edit before finalizing
3. **Auto-generate:** One-click → backend does everything (same as Toby but triggered manually)

**Tab 3: Design Editor** — Configures visual settings for both formats. Saves to DB. Contains two sections:
- Text Reels design (existing settings like variant colors, fonts, etc.)
- Text-Video design (new: thumbnail layout, reel text positioning, image timing, etc.)

### Tab 2: Text-Video Reels — Detailed UI

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ 📝 Manual  │  │ 🤖 Semi-Auto │  │ ⚡ Full Auto   │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│                                                          │
│  Sub-mode content below...                               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### Manual Sub-Mode

```
┌──────────────────────────────────────────────────────────┐
│  📝 Manual Mode                                          │
│                                                          │
│  ┌──────────────────────────────────────┐  ┌──────────┐ │
│  │ Reel Text                            │  │ Settings │ │
│  │ ┌──────────────────────────────────┐ │  │          │ │
│  │ │ Line 1: Bold opening statement   │ │  │ Brands:  │ │
│  │ │ Line 2: Expanding detail         │ │  │ [✓] All  │ │
│  │ │ Line 3: Key insight              │ │  │          │ │
│  │ │ Line 4: Closing thought          │ │  │ Platf:   │ │
│  │ └──────────────────────────────────┘ │  │ [✓] IG   │ │
│  │                                      │  │ [✓] FB   │ │
│  │ Thumbnail Title                      │  │ [ ] YT   │ │
│  │ ┌──────────────────────────────────┐ │  │          │ │
│  │ │ BOLD TITLE IN CAPS               │ │  │ Music:   │ │
│  │ └──────────────────────────────────┘ │  │ trending │ │
│  │                                      │  │          │ │
│  │ Images (drag to reorder)             │  │          │ │
│  │ ┌────┐ ┌────┐ ┌────┐ ┌──────────┐  │  │          │ │
│  │ │ 📷 │ │ 📷 │ │ 📷 │ │ + Upload │  │  │          │ │
│  │ │ #1 │ │ #2 │ │ #3 │ │ or AI ✨ │  │  │          │ │
│  │ └────┘ └────┘ └────┘ └──────────┘  │  └──────────┘ │
│  │                                      │               │
│  │ OR: Auto-source images               │               │
│  │ ┌──────────────────────────────────┐ │               │
│  │ │ Search query: "Elon Musk SpaceX" │ │               │
│  │ │ [🔍 Search]  [✨ AI Generate]    │ │               │
│  │ └──────────────────────────────────┘ │               │
│  └──────────────────────────────────────┘               │
│                                                          │
│  [Create Reel]                                           │
└──────────────────────────────────────────────────────────┘
```

User can:
- Type reel text manually
- Type thumbnail title manually
- Upload images OR enter search queries to auto-source OR type AI prompt to generate
- Select brands, platforms, music (same as current Generator)

#### Semi-Auto Sub-Mode

```
┌──────────────────────────────────────────────────────────┐
│  🤖 Semi-Auto Mode                                      │
│                                                          │
│  Niche: [ Finance ▼ ]                                    │
│                                                          │
│  [🔍 Discover Stories]                                   │
│                                                          │
│  Story candidates:                                       │
│  ┌──────────────────────────────────────────────────────┐│
│  │ ○ "Bad Bunny sold his Bugatti..."  — TMZ, 2h ago    ││
│  │ ● "Pentagon summons Anthropic..."  — BBC, 5h ago    ││
│  │ ○ "Mercedes CEO makes bold..."    — Reuters, 1d    ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  [Polish Selected Story →]                               │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Reel Text (editable):                                ││
│  │ "The Pentagon just summoned the CEO of Anthropic..." ││
│  │                                                      ││
│  │ Thumbnail Title (editable):                          ││
│  │ "PENTAGON\nSUMMONS\nAI CEO"                          ││
│  │                                                      ││
│  │ Images (editable):                                   ││
│  │ [📷] [📷] [📷]  ← Auto-sourced, user can swap      ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  [Create Reel]                                           │
└──────────────────────────────────────────────────────────┘
```

This mode:
1. User picks niche → presses "Discover Stories"
2. Backend calls StoryDiscoverer → returns 5-10 candidates
3. User selects a story
4. Backend calls StoryPolisher → returns formatted text + image plan
5. User can edit everything before creating the reel
6. User presses "Create Reel" → backend runs image sourcing + composition

#### Full Auto Sub-Mode

```
┌──────────────────────────────────────────────────────────┐
│  ⚡ Full Auto Mode                                       │
│                                                          │
│  This does everything automatically — discover stories,  │
│  write viral text, source images, compose the reel.      │
│                                                          │
│  Niche: [ Finance ▼ ]                                    │
│  Count: [ 1 ▼ ] reels                                    │
│  Brands: [✓] All brands                                  │
│  Platforms: [✓] IG  [✓] FB                               │
│  Music: [Trending Random ▼]                              │
│                                                          │
│  [⚡ Auto-Generate]                                      │
│                                                          │
│  → Creates a job that runs the full pipeline             │
│  → Same as what Toby would do, but manually triggered    │
└──────────────────────────────────────────────────────────┘
```

### Tab 3: Design Editor

Saves design preferences to a new `text_video_design` table (per-user). These settings apply to ALL auto-generated TEXT-VIDEO reels.

```
┌──────────────────────────────────────────────────────────┐
│  🎨 Design Editor                                        │
│                                                          │
│  ┌────────────────┐  ┌──────────────────┐                │
│  │ Text Reels     │  │ Text-Video Reels │                │
│  └────────────────┘  └──────────────────┘                │
│                                                          │
│  ── REEL BODY ──────────────────────────────────────     │
│  Text font:       [ Poppins-Bold ▼ ]                     │
│  Text size:       [ 52 ] px                              │
│  Line spacing:    [ 20 ] px                              │
│  Text region:     [ 55 ]% of frame (top portion)         │
│  Text bg opacity: [ 85 ]%                                │
│  Image duration:  [ 3.0 ] seconds per image              │
│  Fade duration:   [ 0.2 ] seconds                        │
│  Reel duration:   [ 15 ] seconds total                   │
│  Show logo:       [✓]                                    │
│  Show handle:     [✓]                                    │
│  Handle text:     [ @myhandle ]                          │
│                                                          │
│  ── THUMBNAIL ──────────────────────────────────────     │
│  Title color:     [ #FFD700 ] 🟡                         │
│  Title font:      [ Poppins-Bold ▼ ]                     │
│  Title size:      [ 72 ] px                              │
│  Title max lines: [ 4 ]                                  │
│  Title padding:   [ 40 ] px (horizontal)                 │
│  Image ratio:     [ 0.6 ] (image vs title split)         │
│  Divider style:   [ line_with_logo ▼ ]                   │
│                                                          │
│  ── PREVIEW ────────────────────────────────────────     │
│  [ Live preview of thumbnail + reel frame ]              │
│                                                          │
│  [💾 Save Design]                                        │
└──────────────────────────────────────────────────────────┘
```

### File Changes

**New files:**
- `src/pages/Reels.tsx` — New tabbed container page (replaces Generator as the `/reels` route)
- `src/features/reels/TextReelsTab.tsx` — Wraps existing Generator.tsx content
- `src/features/reels/TextVideoTab.tsx` — Tab 2 with Manual/Semi-Auto/Full-Auto sub-modes
- `src/features/reels/TextVideoManual.tsx` — Manual sub-mode component
- `src/features/reels/TextVideoSemiAuto.tsx` — Semi-auto sub-mode with story discovery
- `src/features/reels/TextVideoFullAuto.tsx` — Full-auto one-click component
- `src/features/reels/DesignEditorTab.tsx` — Tab 3 design editor
- `src/features/reels/TextVideoDesignSection.tsx` — TEXT-VIDEO specific design controls
- `src/features/reels/api/use-text-video.ts` — React Query hooks for text-video endpoints
- `src/features/reels/api/use-design-settings.ts` — React Query hooks for design CRUD
- `src/features/reels/api/text-video-api.ts` — API client functions
- `src/features/reels/types.ts` — TypeScript types for text-video

**Modified files:**
- `src/app/routes/index.tsx` — Update `/reels` route to point to new `Reels.tsx`
- `src/pages/Generator.tsx` — Extract content into `TextReelsTab.tsx` (Generator becomes a thin wrapper or is deprecated)

### Route Update

In [src/app/routes/index.tsx](src/app/routes/index.tsx):

```tsx
// BEFORE
{ path: 'reels', element: <Generator /> }

// AFTER
{ path: 'reels', element: <Reels /> }
```

The `Reels` page manages tab state via URL search params (`?tab=text-reels`, `?tab=text-video`, `?tab=design`).

---

## 9. Auto-Generate Flow (Non-Toby)

### Purpose

The "Full Auto" sub-mode and "Semi-Auto" → "Create Reel" button both trigger the backend pipeline WITHOUT Toby. This is the same pipeline Toby would use, but triggered by user action.

### Backend Endpoint: `POST /api/content/text-video/generate`

```python
# New file: app/api/content/text_video_routes.py

@router.post("/api/content/text-video/generate")
async def generate_text_video_reel(
    request: TextVideoGenerateRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a TEXT-VIDEO reel.

    Modes:
    - full_auto: discover story + polish + source images + compose
    - semi_auto: story already selected, polish + source + compose
    - manual: text + images provided, just compose
    """
```

**Request schema:**
```python
class TextVideoGenerateRequest(BaseModel):
    mode: str  # "full_auto" | "semi_auto" | "manual"
    brands: list[str]
    platforms: list[str]
    music_source: str = "trending_random"

    # For full_auto:
    niche: Optional[str] = None
    count: int = 1

    # For semi_auto:
    raw_story: Optional[dict] = None  # From discovery endpoint

    # For manual:
    reel_text: Optional[str] = None
    reel_lines: Optional[list[str]] = None
    thumbnail_title: Optional[str] = None
    image_paths: Optional[list[str]] = None  # Supabase URLs of uploaded images
    image_queries: Optional[list[str]] = None  # Web search queries for auto-sourcing
    ai_image_prompts: Optional[list[str]] = None  # Prompts for AI generation
```

### Backend Endpoint: `POST /api/content/text-video/discover`

```python
@router.post("/api/content/text-video/discover")
async def discover_stories(
    request: DiscoverRequest,
    user=Depends(get_current_user),
):
    """Discover story candidates for the semi-auto mode."""
```

### Backend Endpoint: `POST /api/content/text-video/polish`

```python
@router.post("/api/content/text-video/polish")
async def polish_story(
    request: PolishRequest,
    user=Depends(get_current_user),
):
    """Polish a selected story into viral format."""
```

### Backend Endpoint: `POST /api/content/text-video/source-images`

```python
@router.post("/api/content/text-video/source-images")
async def source_images(
    request: SourceImagesRequest,
    user=Depends(get_current_user),
):
    """Source images based on search queries or AI generation prompts."""
```

### Integration with Existing Job System

The text-video pipeline creates a `GenerationJob` just like the current system, but with `content_format = "text_video"`. The `JobProcessor` detects the format and routes to the new slideshow compositor instead of the existing image → video pipeline.

**Modified file: `app/services/content/job_processor.py`**

Add a format check at the top of `process_job()`:

```python
def process_job(self, job_id: str):
    job = self._manager.get_job(job_id)
    content_format = getattr(job, 'content_format', None) or 'text_based'

    if content_format == 'text_video':
        return self._process_text_video_job(job)
    else:
        return self._process_text_based_job(job)  # existing logic
```

---

## 10. Toby Integration (Optional Premium Upsell)

### Concept

Toby's TEXT-VIDEO integration is an **optional premium feature**. Users who just want to click buttons manually use the `/reels` page. Users who want full hands-off daily automation enable Toby.

This is NOT a billing tier change — it's a feature flag on Toby. Toby already has billing gates via `BrandSubscription`. The TEXT-VIDEO format is just a new `content_type` that Toby can produce.

### How Toby Uses TEXT-VIDEO

In `app/services/toby/orchestrator.py`, the `_execute_content_plan()` method currently handles `content_type == "reel"` and `content_type == "post"`. Add `content_type == "text_video_reel"`:

```python
# In _execute_content_plan():
if plan.content_type == "text_video_reel":
    # 1. Discover stories via StoryDiscoverer
    discoverer = StoryDiscoverer()
    stories = await discoverer.discover_stories(
        niche=ctx.niche_name,
        category=plan.topic_bucket,
        recency="mixed",
        count=5,
    )

    # 2. Pick best story (highest relevance_score, not already used)
    story = _pick_best_unused_story(db, user_id, stories)

    # 3. Polish via StoryPolisher
    polisher = StoryPolisher()
    polished = polisher.polish_story(story, ctx.niche_name, brand_config, ctx)

    # 4. Create job with text_video format
    job = job_manager.create_job(
        user_id=plan.user_id,
        title=polished.thumbnail_title,
        content_lines=polished.reel_lines,
        brands=[plan.brand_id],
        variant="text_video",
        platforms=_toby_platforms,
        created_by="toby",
        content_format="text_video",
        text_video_data={
            "polished_story": asdict(polished),
            "source_story_url": story.source_url,
            "story_fingerprint": polished.story_fingerprint,
        },
        music_source="trending_random",
    )

    # 5. Process job (runs slideshow compositor)
    processor = JobProcessor(db)
    result = processor.process_job(job.job_id)
```

### Content Planner Update

The `ContentPlan.content_type` gains a new value: `"text_video_reel"`. The learning engine needs new personality/strategy options for this format.

**New personalities for text_video_reel:**
- `breaking_news` — urgent, just-happened stories
- `power_moves` — bold business/wealth decisions
- `controversy` — provocative takes, debates
- `underdog` — surprising success stories
- `mind_blowing` — shocking facts and statistics

These get added to `app/services/toby/learning_engine.py` alongside the existing reel and post personalities.

### Feature Flag

Add to `app/services/toby/feature_flags.py`:

```python
"text_video_reels": False,  # TEXT-VIDEO reel format support in Toby
```

Set to `True` per-user or globally when ready to roll out.

### TobyState Update

Add `text_video_slots_per_day` to `TobyState`:

```python
text_video_slots_per_day = Column(Integer, default=0)  # 0 = disabled for this user
```

When set to > 0, the buffer manager includes text_video_reel slots in the daily schedule.

---

## 11. Database Migrations

### Migration 1: `text_video_format.sql`

Add `content_format` to `generation_jobs` and `text_video_data` JSON column:

```sql
-- Migration: Add TEXT-VIDEO support to generation_jobs
-- Run: psql "$DATABASE_URL" < migrations/text_video_format.sql

-- 1. Add content_format column (default text_based for backward compat)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generation_jobs' AND column_name = 'content_format'
    ) THEN
        ALTER TABLE generation_jobs ADD COLUMN content_format VARCHAR(30) DEFAULT 'text_based';
    END IF;
END $$;

-- 2. Add text_video_data JSON column for TEXT-VIDEO specific metadata
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generation_jobs' AND column_name = 'text_video_data'
    ) THEN
        ALTER TABLE generation_jobs ADD COLUMN text_video_data JSONB;
    END IF;
END $$;

-- 3. Index on content_format for filtering
CREATE INDEX IF NOT EXISTS ix_generation_jobs_content_format
    ON generation_jobs (content_format);

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'generation_jobs'
  AND column_name IN ('content_format', 'text_video_data')
ORDER BY column_name;
```

### Migration 2: `text_video_design.sql`

New table for design preferences:

```sql
-- Migration: Create text_video_design table
-- Run: psql "$DATABASE_URL" < migrations/text_video_design.sql

CREATE TABLE IF NOT EXISTS text_video_design (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,

    -- Reel body settings
    reel_text_font VARCHAR(100) DEFAULT 'Poppins-Bold.ttf',
    reel_text_size INTEGER DEFAULT 52,
    reel_line_spacing INTEGER DEFAULT 20,
    reel_text_region_pct REAL DEFAULT 0.55,
    reel_text_bg_opacity INTEGER DEFAULT 85,
    reel_show_logo BOOLEAN DEFAULT true,
    reel_show_handle BOOLEAN DEFAULT true,
    reel_handle_text VARCHAR(100) DEFAULT '',
    image_duration REAL DEFAULT 3.0,
    image_fade_duration REAL DEFAULT 0.2,
    reel_total_duration INTEGER DEFAULT 15,
    black_fade_duration REAL DEFAULT 1.0,

    -- Thumbnail settings
    thumbnail_title_color VARCHAR(10) DEFAULT '#FFD700',
    thumbnail_title_font VARCHAR(100) DEFAULT 'Poppins-Bold.ttf',
    thumbnail_title_size INTEGER DEFAULT 72,
    thumbnail_title_max_lines INTEGER DEFAULT 4,
    thumbnail_title_padding_x INTEGER DEFAULT 40,
    thumbnail_image_ratio REAL DEFAULT 0.6,
    thumbnail_divider_style VARCHAR(30) DEFAULT 'line_with_logo',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One design config per user
    CONSTRAINT uq_text_video_design_user UNIQUE (user_id)
);

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'text_video_design'
ORDER BY ordinal_position;
```

### Migration 3: `text_video_story_pool.sql`

Story dedup and pool table:

```sql
-- Migration: Create story pool for TEXT-VIDEO dedup
-- Run: psql "$DATABASE_URL" < migrations/text_video_story_pool.sql

CREATE TABLE IF NOT EXISTS text_video_story_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    fingerprint VARCHAR(64) NOT NULL,  -- SHA256 of headline + key facts
    headline TEXT NOT NULL,
    summary TEXT,
    source_url TEXT,
    source_name VARCHAR(200),
    published_at TIMESTAMPTZ,
    story_category VARCHAR(50),
    niche VARCHAR(100),
    polished_data JSONB,  -- Full PolishedStory JSON (cache)
    status VARCHAR(20) DEFAULT 'available',  -- available | used | expired | rejected
    used_at TIMESTAMPTZ,
    used_by_job_id VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate stories per user
    CONSTRAINT uq_story_pool_user_fingerprint UNIQUE (user_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS ix_story_pool_user_status
    ON text_video_story_pool (user_id, status);

CREATE INDEX IF NOT EXISTS ix_story_pool_niche
    ON text_video_story_pool (user_id, niche, status);

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'text_video_story_pool'
ORDER BY ordinal_position;
```

### Migration 4: `toby_text_video.sql`

Add Toby support for text_video:

```sql
-- Migration: Add TEXT-VIDEO support to Toby
-- Run: psql "$DATABASE_URL" < migrations/toby_text_video.sql

-- 1. Add text_video_slots_per_day to toby_state
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'toby_state' AND column_name = 'text_video_slots_per_day'
    ) THEN
        ALTER TABLE toby_state ADD COLUMN text_video_slots_per_day INTEGER DEFAULT 0;
    END IF;
END $$;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'toby_state'
  AND column_name = 'text_video_slots_per_day';
```

**CRITICAL: Run all migrations BEFORE adding the corresponding model columns.** This is the ViralToby migration-first workflow. See [.github/instructions/python-models.instructions.md](../.github/instructions/python-models.instructions.md).

---

## 12. Backend: New Files & Modified Files

### New Files to Create

| File | Purpose | Lines (est.) |
|---|---|---|
| `app/services/discovery/__init__.py` | Package init | 1 |
| `app/services/discovery/story_discoverer.py` | Web search story discovery (NewsAPI + Tavily) | ~200 |
| `app/services/discovery/story_polisher.py` | DeepSeek story → viral format rewriter | ~150 |
| `app/services/media/image_sourcer.py` | Image sourcing (SerpAPI + Gemini Nano Banana 2) | ~250 |
| `app/services/media/thumbnail_compositor.py` | Pillow thumbnail composition | ~150 |
| `app/services/media/slideshow_compositor.py` | FFmpeg slideshow + text overlay video | ~300 |
| `app/core/text_video_prompts.py` | DeepSeek prompt templates for TEXT-VIDEO | ~100 |
| `app/api/content/text_video_routes.py` | API endpoints for text-video generation | ~200 |
| `app/api/content/text_video_design_routes.py` | API endpoints for design CRUD | ~80 |
| `app/models/text_video_design.py` | SQLAlchemy model for design preferences | ~60 |
| `app/models/story_pool.py` | SQLAlchemy model for story pool/dedup | ~50 |
| `migrations/text_video_format.sql` | Migration: add content_format to jobs | ~25 |
| `migrations/text_video_design.sql` | Migration: create design table | ~40 |
| `migrations/text_video_story_pool.sql` | Migration: create story pool table | ~35 |
| `migrations/toby_text_video.sql` | Migration: add Toby text_video support | ~15 |

### Files to Modify

| File | Changes |
|---|---|
| `app/models/jobs.py` | Add `content_format` and `text_video_data` columns to `GenerationJob` |
| `app/models/toby.py` | Add `text_video_slots_per_day` to `TobyState` |
| `app/services/content/job_processor.py` | Add format routing: `text_video` → slideshow compositor |
| `app/services/toby/orchestrator.py` | Add `text_video_reel` content_type handling in `_execute_content_plan()` |
| `app/services/toby/content_planner.py` | Add `text_video_reel` to content plan creation |
| `app/services/toby/learning_engine.py` | Add TEXT-VIDEO personalities and strategy dimensions |
| `app/services/toby/buffer_manager.py` | Include `text_video_slots_per_day` in slot calculation |
| `app/services/toby/feature_flags.py` | Add `text_video_reels` flag |
| `app/main.py` | Register new routers (`text_video_router`, `text_video_design_router`) |
| `scripts/validate_api.py` | Add new modules to `CRITICAL_MODULES` + endpoint tests |
| `requirements.txt` | Add `google-generativeai`, `tavily-python`, `newsapi-python` |

---

## 13. Frontend: New Files & Modified Files

### New Files to Create

| File | Purpose | Lines (est.) |
|---|---|---|
| `src/pages/Reels.tsx` | New tabbed container for `/reels` route | ~80 |
| `src/features/reels/TextReelsTab.tsx` | Wraps existing Generator content | ~30 |
| `src/features/reels/TextVideoTab.tsx` | Tab 2 container with sub-mode tabs | ~60 |
| `src/features/reels/TextVideoManual.tsx` | Manual mode: user provides text + images | ~300 |
| `src/features/reels/TextVideoSemiAuto.tsx` | Semi-auto: story discovery → edit → create | ~350 |
| `src/features/reels/TextVideoFullAuto.tsx` | Full-auto: one-click generation | ~150 |
| `src/features/reels/DesignEditorTab.tsx` | Tab 3: design settings for both formats | ~250 |
| `src/features/reels/TextVideoDesignSection.tsx` | TEXT-VIDEO specific design controls | ~200 |
| `src/features/reels/ImageUploader.tsx` | Image upload/search/AI-generate widget | ~200 |
| `src/features/reels/StoryCard.tsx` | Story candidate display card | ~60 |
| `src/features/reels/api/use-text-video.ts` | React Query hooks (discover, polish, generate) | ~100 |
| `src/features/reels/api/use-design-settings.ts` | React Query hooks for design CRUD | ~60 |
| `src/features/reels/api/text-video-api.ts` | API client functions | ~80 |
| `src/features/reels/types.ts` | TypeScript types | ~80 |

### Files to Modify

| File | Changes |
|---|---|
| `src/app/routes/index.tsx` | Change `/reels` route to `Reels.tsx`, add lazy import |
| `src/pages/Generator.tsx` | Extract core content into `TextReelsTab` (or kept as-is, imported by TextReelsTab) |
| `src/shared/types/index.ts` | Add `ContentFormat` type, extend `Job` type with `content_format` + `text_video_data` |
| `package.json` | No new deps needed (existing React + Tailwind + React Query sufficient) |

---

## 14. API Endpoints

### New Endpoints Summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/content/text-video/discover` | JWT | Discover story candidates |
| `POST` | `/api/content/text-video/polish` | JWT | Polish a story into viral format |
| `POST` | `/api/content/text-video/source-images` | JWT | Source images by query or AI |
| `POST` | `/api/content/text-video/generate` | JWT | Create a TEXT-VIDEO reel (all modes) |
| `GET` | `/api/content/text-video/design` | JWT | Get user's design preferences |
| `PUT` | `/api/content/text-video/design` | JWT | Update user's design preferences |
| `GET` | `/api/content/text-video/story-pool` | JWT | Get user's story pool (for dedup visibility) |

### Router Registration

In `app/main.py`, add:

```python
from app.api.content.text_video_routes import router as text_video_router
from app.api.content.text_video_design_routes import router as text_video_design_router

app.include_router(text_video_router)
app.include_router(text_video_design_router)
```

### Validation Script Update

In `scripts/validate_api.py`, add to `CRITICAL_MODULES`:

```python
"app.api.content.text_video_routes",
"app.api.content.text_video_design_routes",
"app.services.discovery.story_discoverer",
"app.services.discovery.story_polisher",
"app.services.media.image_sourcer",
"app.services.media.thumbnail_compositor",
"app.services.media.slideshow_compositor",
"app.core.text_video_prompts",
"app.models.text_video_design",
"app.models.story_pool",
```

---

## 15. Deduplication & Story Pool

### Problem

Daily automation means the system must never repeat the same story. Dedup operates at two levels:

1. **Story-level dedup** — Same story (by fingerprint) is never used twice per user
2. **Topic-level diversity** — Don't publish 3 finance stories about Bugatti in one week

### Fingerprint Calculation

```python
def compute_story_fingerprint(headline: str, key_facts: list[str]) -> str:
    """Compute dedup fingerprint from headline + key facts."""
    import hashlib
    content = headline.lower().strip() + "|" + "|".join(sorted(f.lower().strip() for f in key_facts))
    return hashlib.sha256(content.encode()).hexdigest()[:16]
```

### Story Pool Lifecycle

```
discover → pool (status: available)
              ↓
         pick for reel → pool (status: used, used_at, used_by_job_id)
              ↓
         7 days old → pool (status: expired) → periodically cleaned
```

### Story Pool Cron (Optional Enhancement)

A daily cron job pre-fills the story pool:

```python
# Run at 2 AM daily
async def daily_story_pool_refresh(db, user_id):
    """Pre-discover stories and cache in pool for faster generation."""
    niche = get_user_niche(db, user_id)
    categories = ["power_moves", "controversy", "underdog", "shocking_stat", "scientific_breakthrough"]

    for cat in categories:
        stories = await StoryDiscoverer().discover_stories(niche, cat, count=3)
        for story in stories:
            fp = compute_story_fingerprint(story.headline, [story.summary])
            # Insert if not exists (UNIQUE constraint handles dedup)
            try:
                db.add(StoryPool(user_id=user_id, fingerprint=fp, ...))
                db.commit()
            except IntegrityError:
                db.rollback()  # Already in pool
```

---

## 16. Story Categories & Topic Diversity

### 10 Story Categories

Based on analysis of @execute, @factsdailyy, and similar viral factual pages:

| Category | Description | Example |
|---|---|---|
| `power_moves` | Bold business/wealth decisions | "Elon Musk bought Twitter for $44B" |
| `controversy` | Provocative takes, public debates | "Pentagon summons Anthropic CEO" |
| `underdog` | Surprising success stories | "Janitor became a millionaire from stocks" |
| `prediction` | Predictions that came true/false | "Steve Jobs predicted the iPad in 1983" |
| `shocking_stat` | Surprising numbers/statistics | "90% of startups fail in year one" |
| `human_moment` | Vulnerable moments from powerful people | "Jeff Bezos cried on stage" |
| `industry_shift` | Death/birth of industries | "Manual transmissions are officially dead" |
| `failed_bet` | Expensive failures and miscalculations | "Google paid $12B for a company that made nothing" |
| `hidden_cost` | Unexpected downsides of wealth/power | "The hidden cost of being a billionaire" |
| `scientific_breakthrough` | Major discoveries and innovations | "One man built a battery wall from laptop cells" |

### Daily Category Mix

For a user generating 3 TEXT-VIDEO reels/day:

```python
DAILY_CATEGORY_WEIGHTS = {
    "power_moves": 0.20,
    "controversy": 0.15,
    "underdog": 0.10,
    "prediction": 0.05,
    "shocking_stat": 0.15,
    "human_moment": 0.05,
    "industry_shift": 0.10,
    "failed_bet": 0.05,
    "hidden_cost": 0.05,
    "scientific_breakthrough": 0.10,
}
```

Category selection uses weighted random. The learning engine (Thompson Sampling, if Toby is enabled) adjusts weights over time based on performance.

---

## 17. Cost Analysis

### Per-Reel Cost Breakdown

| Step | API | Cost per Call | Calls per Reel | Cost |
|---|---|---|---|---|
| Story Discovery | NewsAPI | Free (100/day) | 1 | $0.00 |
| Story Discovery | Tavily | $0.01/search | 0.3 avg | $0.003 |
| Story Polishing | DeepSeek chat | ~$0.001/req | 1 | $0.001 |
| Image Search | SerpAPI | $0.01/search | 2-3 | $0.025 |
| AI Image Gen | Gemini (Nano Banana 2) | ~$0.01/image | 1-2 | $0.015 |
| Music | (existing trending music) | $0.00 | — | $0.00 |
| **Total per reel** | | | | **~$0.044** |

### Monthly Cost at Scale

| Reels/day | Monthly reels | Monthly cost |
|---|---|---|
| 1 | 30 | ~$1.32 |
| 3 | 90 | ~$3.96 |
| 5 | 150 | ~$6.60 |

This is extremely cost-effective. The most expensive component is SerpAPI for image search. Switching to Pexels (free) or Bing Image Search ($3/1000 requests) would reduce costs further.

---

## 18. Implementation Order

### Phase 1: Core Backend Infrastructure (Do First)

1. Run migrations (all 4 SQL files)
2. Add model columns (`GenerationJob.content_format`, `GenerationJob.text_video_data`, `TobyState.text_video_slots_per_day`)
3. Create `TextVideoDesign` model
4. Create `StoryPool` model
5. Create `app/core/text_video_prompts.py`
6. Set environment variables via Railway CLI

### Phase 2: Discovery + Polishing

7. Create `app/services/discovery/story_discoverer.py`
8. Create `app/services/discovery/story_polisher.py`
9. Test: discover + polish a story from command line

### Phase 3: Image Sourcing + Composition

10. Create `app/services/media/image_sourcer.py`
11. Create `app/services/media/thumbnail_compositor.py`
12. Create `app/services/media/slideshow_compositor.py`
13. Test: given polished story → produce thumbnail + reel video locally

### Phase 4: API Endpoints

14. Create `app/api/content/text_video_routes.py`
15. Create `app/api/content/text_video_design_routes.py`
16. Register routers in `app/main.py`
17. Modify `app/services/content/job_processor.py` — add format routing
18. Update `scripts/validate_api.py`
19. Run `python scripts/validate_api.py --imports`

### Phase 5: Frontend

20. Create `src/pages/Reels.tsx` (tabbed container)
21. Create `src/features/reels/TextReelsTab.tsx` (wrap existing Generator)
22. Create `src/features/reels/DesignEditorTab.tsx`
23. Create `src/features/reels/TextVideoTab.tsx` with sub-modes
24. Create manual, semi-auto, and full-auto sub-mode components
25. Create API hooks and types
26. Update router

### Phase 6: Toby Integration (Optional, Later)

27. Add `text_video_reels` feature flag
28. Update `learning_engine.py` with new personalities
29. Update `content_planner.py` with `text_video_reel` type
30. Update `buffer_manager.py` to include text_video slots
31. Update `orchestrator.py` with text_video_reel execution path

---

## 19. Validation & Testing

### After Each Phase

```bash
# Python syntax + imports
python scripts/validate_api.py --imports

# React hooks lint
npx eslint src/ --rule 'react-hooks/rules-of-hooks: error'

# Full validation (after route changes)
python scripts/validate_api.py
```

### Smoke Tests to Add to `validate_api.py`

```python
# New endpoint tests
("POST", "/api/content/text-video/discover", 401, "text-video discover needs auth"),
("POST", "/api/content/text-video/polish", 401, "text-video polish needs auth"),
("POST", "/api/content/text-video/generate", 401, "text-video generate needs auth"),
("GET", "/api/content/text-video/design", 401, "text-video design needs auth"),
("PUT", "/api/content/text-video/design", 401, "text-video design update needs auth"),
```

### Integration Test Script

Create `scripts/test_text_video_pipeline.py`:

```python
"""End-to-end test: discover → polish → source images → compose reel."""
# Run manually to verify the full pipeline before deployment
```

---

## 20. Open Decision Points

These are decisions the AI coder MUST ask the user about before implementing:

### `[ASK USER]` 1: Gemini API Package & Model Name
The Gemini API for Imagen (Nano Banana 2) may use `google-generativeai` or `google-cloud-aiplatform`. The exact model ID for image generation (`imagen-3.0-generate-002` or `gemini-2.0-flash-exp`) needs confirmation. Check `ai.google.dev/gemini-api/docs/imagen` before implementing.

### `[ASK USER]` 2: SerpAPI vs Bing Image Search
SerpAPI costs $0.01/search (Google Images). Bing Image Search via Azure costs $3/1000 requests ($0.003/search). Both return high-quality results. Which to use as primary?

### `[ASK USER]` 3: NewsAPI Free vs Paid Tier
NewsAPI free tier (100 req/day) limits to articles from the last 30 days and no commercial use. Paid tier ($449/mo) removes limits. For MVP, free tier is enough. When should we upgrade?

### `[ASK USER]` 4: Pexels API Key
Do you already have a Pexels API key? If not, one needs to be created at `pexels.com/api/` (free, instant).

### `[ASK USER]` 5: Default Text Font for Reels
Current reels use Poppins-Bold. The @execute format uses a similar bold font. Keep Poppins-Bold as default, or add a new font (e.g., Impact, Montserrat Black)?

### `[ASK USER]` 6: Story Pool Cron vs On-Demand
Should we pre-fill the story pool daily via cron (faster generation, uses more API calls)? Or discover on-demand when a reel is requested (slower but more efficient)?

### `[ASK USER]` 7: Toby Text-Video Slots Default
When a user enables Toby for TEXT-VIDEO, what should the default `text_video_slots_per_day` be? Suggestion: 1 (conservative, user can increase).

### `[ASK USER]` 8: Manual Image Upload
Should manual mode support direct image file upload from the user's device? This requires a Supabase Storage upload endpoint. Or only support search queries + AI generation?

### `[ASK USER]` 9: Niche per User vs per Brand
Currently `NicheConfig` is per-user (one niche). But TEXT-VIDEO discovery requires a niche for searching. For multi-brand users with different niches, should the discovery system use the global NicheConfig niche, or should brands have their own niche override?

### `[ASK USER]` 10: yt-dlp Integration
The original discussion mentioned yt-dlp for YouTube video scraping as a "Tier 2" image/video source. This is a legal gray area. Should we include yt-dlp as an optional video frame source behind a feature flag? Or skip entirely for MVP?

---

## Appendix A: Existing Codebase Reference

### Key Files the AI Coder Must Understand

| File | Why |
|---|---|
| [app/services/content/job_processor.py](../app/services/content/job_processor.py) (1001 lines) | This is where format routing goes. The `process_job()` → `regenerate_brand()` pipeline must be extended. |
| [app/services/media/video_generator.py](../app/services/media/video_generator.py) (185 lines) | Current video gen (static image + FFmpeg). The new slideshow compositor follows a similar pattern. |
| [app/services/media/image_generator.py](../app/services/media/image_generator.py) (710 lines) | Current image rendering (Pillow). Thumbnail compositor follows similar patterns. |
| [app/services/media/ai_background.py](../app/services/media/ai_background.py) (667 lines) | AI image generation via deAPI. Image sourcer follows similar HTTP + retry pattern. |
| [app/services/toby/orchestrator.py](../app/services/toby/orchestrator.py) (1178 lines) | Toby tick loop. `_execute_content_plan()` around line 400 is where text_video_reel support goes. |
| [app/services/toby/content_planner.py](../app/services/toby/content_planner.py) | ContentPlan creation. Add text_video_reel as a new content_type. |
| [app/services/toby/learning_engine.py](../app/services/toby/learning_engine.py) | Strategy selection. Add new personalities for text_video_reel. |
| [app/services/toby/buffer_manager.py](../app/services/toby/buffer_manager.py) | Buffer slot calculation. Add text_video_slots_per_day. |
| [app/services/toby/feature_flags.py](../app/services/toby/feature_flags.py) | Feature flags. Add `text_video_reels`. |
| [app/models/jobs.py](../app/models/jobs.py) | GenerationJob model. Add `content_format` + `text_video_data` columns. |
| [app/models/toby.py](../app/models/toby.py) | TobyState model. Add `text_video_slots_per_day`. |
| [app/core/constants.py](../app/core/constants.py) | Canvas dimensions (REEL_WIDTH=1080, REEL_HEIGHT=1920). Reuse for TEXT-VIDEO. |
| [app/core/config.py](../app/core/config.py) | BrandConfig dataclass. Used by thumbnail compositor for brand colors/logo. |
| [app/core/prompt_context.py](../app/core/prompt_context.py) | PromptContext dataclass. Story polisher may inject context for brand-specific tone. |
| [app/utils/ffmpeg.py](../app/utils/ffmpeg.py) | FFmpeg utility. Slideshow compositor builds on this pattern (subprocess, retry, thread-limited). |
| [src/pages/Generator.tsx](../src/pages/Generator.tsx) (850 lines) | Current /reels page. Gets refactored into TextReelsTab. |
| [src/app/routes/index.tsx](../src/app/routes/index.tsx) | Router config. `/reels` route updates to `Reels.tsx`. |
| [src/shared/api/client.ts](../src/shared/api/client.ts) | API client. All new frontend API calls use this. |
| [src/features/brands/hooks/use-dynamic-brands.ts](../src/features/brands/hooks/use-dynamic-brands.ts) | Dynamic brands hook. Used in all new components. |
| [src/features/billing/hooks/use-billing-gate.ts](../src/features/billing/hooks) | Billing gate. Gate generation actions. |

### Architecture Patterns to Follow

1. **Auth:** All API endpoints use `user = Depends(get_current_user)`. Brand ownership verified via `brand.user_id == user["id"]`.
2. **Models:** Migration SQL runs FIRST, model columns added AFTER.
3. **Hooks:** ALL React hooks before ANY early return. Always.
4. **Dynamic data:** No hardcoded brand names/colors/IDs. Use `useDynamicBrands()` frontend, `brand_resolver` backend.
5. **API client:** Frontend uses `apiClient` from `src/shared/api/client.ts`, never raw `fetch()`.
6. **Feature flags:** New Toby features gated behind `feature_flags.is_enabled("text_video_reels")`.
7. **Billing gate:** Check `useBillingGate(brandId)` before generation actions on frontend.
8. **Error handling in FFmpeg:** Single thread (`-threads 1`), retry on transient errors, timeout protection.
9. **Supabase Storage:** All media uploads via `app/services/storage/supabase_storage.py`.
10. **Validation:** After any change, run `python scripts/validate_api.py --imports`.

### Python Dependencies to Add

```
# In requirements.txt, append:
google-generativeai>=0.8.0     # Gemini API (Nano Banana 2 image gen)
tavily-python>=0.3.0           # Tavily AI search
newsapi-python>=0.2.7          # NewsAPI client
```

### Environment Variables to Set (Railway)

```bash
railway variables set NEWSAPI_KEY=<key>
railway variables set TAVILY_API_KEY=<key>
railway variables set GEMINI_API_KEY=<key>
railway variables set PEXELS_API_KEY=<key>
railway variables set SERPAPI_KEY=<key>  # optional
```

---

## Appendix B: Self-Maintenance Checklist

Per [.github/instructions/self-maintenance.instructions.md](../.github/instructions/self-maintenance.instructions.md), the following customization files MUST be updated after implementing this feature:

| Customization File | What to Update |
|---|---|
| `.github/skills/api-validation/SKILL.md` | Add new CRITICAL_MODULES, update endpoint count |
| `.github/skills/content-pipeline/SKILL.md` | Add TEXT-VIDEO format, story discovery, image sourcing |
| `.github/skills/media-rendering/SKILL.md` | Add slideshow compositor, thumbnail compositor |
| `.github/skills/toby-agent/SKILL.md` | Add text_video_reel content_type, new personalities, feature flag |
| `.github/skills/frontend-patterns/SKILL.md` | Add /reels tabbed page, new feature module |
| `.github/skills/platform-publishing/SKILL.md` | No change (publishing pipeline unchanged) |
| `.github/instructions/toby-agents.instructions.md` | Add text_video_reel handling notes |
| `.github/copilot-instructions.md` | Add TEXT-VIDEO to "What is ViralToby" section |

---

*End of spec. This document should be sufficient for an AI coding agent to implement the full TEXT-VIDEO reel system without additional context.**
