# TEXT-VIDEO Reels — Full Implementation Spec

> **Purpose:** This document is an AI-coder prompt. It contains every decision, file path, model field, migration, and UI spec needed to implement the TEXT-VIDEO reel format end-to-end in ViralToby. An AI agent reading this document should be able to execute the implementation without asking clarifying questions, except at the explicitly marked `[ASK USER]` decision points.

> **API Keys & Secrets:** This feature requires new external API keys (NewsAPI, Tavily, SerpAPI, Pexels, Gemini). **Do NOT hardcode, guess, or generate placeholder keys.** When you need a key:
> 1. Ask the user in chat — specify which service and what scope/permissions are needed.
> 2. The user will provide the key via chat.
> 3. **You (the AI coder) add it to Railway via CLI:** `railway variables set KEY_NAME=value` — you have full access.
> 4. Reference the key in code via `os.environ.get("KEY_NAME")` — never commit secrets.
>
> Railway CLI is authenticated in the workspace (project `responsible-mindfulness`, service `scheduler`). **Run `railway variables set` directly using run_in_terminal — do NOT ask the user to run it.** Never store keys in `.env` files committed to git, config files, or inline in code.

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
21. [Multi-Format Per-Brand Architecture](#21-multi-format-per-brand-architecture)
22. [Brain-Per-Format: Learning Engine Isolation](#22-brain-per-format-learning-engine-isolation)
23. [Slot System Changes](#23-slot-system-changes)
24. [Content DNA Format Split](#24-content-dna-format-split)
25. [Format Switching Resilience](#25-format-switching-resilience)
26. [Dashboard & Home.tsx Multi-Format Awareness](#26-dashboard--hometsx-multi-format-awareness)
27. [Scalability: Adding Future Formats](#27-scalability-adding-future-formats)
28. [Production Safety: Zero-Downtime Migration Plan](#28-production-safety-zero-downtime-migration-plan)
29. [Complete Code Touchpoint Map](#29-complete-code-touchpoint-map)
30. [Scalability & Resilience Architecture](#30-scalability--resilience-architecture)
31. [Job Detail Page for text_video Jobs](#31-job-detail-page-for-text_video-jobs)
32. [Analytics Page: Format Filter & Comparison](#32-analytics-page-format-filter--comparison)
33. [Calendar.tsx: Visual Format Differentiation](#33-calendartsx-visual-format-differentiation)
34. [Threads: Text-Only Content Type](#34-threads-text-only-content-type)
35. [Content DNA: Tabbed UI Redesign](#35-content-dna-tabbed-ui-redesign)
36. [Complete Stripe Billing: Per-Brand Subscriptions & Super Admin Trial Control](#36-complete-stripe-billing-per-brand-subscriptions--super-admin-trial-control)
37. [DeepSeek API Cost Tracking & Per-User/Brand Metrics](#37-deepseek-api-cost-tracking--per-userbrand-metrics)
38. [Context-Aware Caption CTAs: Kill the Hardcoded Save Section](#38-context-aware-caption-ctas-kill-the-hardcoded-save-section)

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
| `text_video` | `text_video` | New: Story discovery → image sourcing → FFmpeg slideshow |

**Backward compatibility:** All existing jobs and content have `content_format = NULL` or `text_based`. The new field defaults to `text_based` so nothing breaks.

### Multi-Format Per-Brand

> **CRITICAL (added Section 21-27):** Each brand can independently select its reel format. Brand A may use `text_based` while Brand B uses `text_video`. The reel format is stored in `TobyBrandConfig.reel_format` and drives the entire downstream pipeline: slot content_type, learning engine brain, personality pool, variant logic, and dashboard display. See [Section 21](#21-multi-format-per-brand-architecture) for the complete architecture.

**Key content_type taxonomy:**
| `content_type` | Parent format | Slot variant | Learning brain |
|---|---|---|---|
| `"reel"` | `text_based` | `light` / `dark` (alternating) | `REEL_PERSONALITIES` pool |
| `"text_video_reel"` | `text_video` | `"text_video"` (uniform) | `TEXT_VIDEO_PERSONALITIES` pool |
| `"post"` | (carousel) | `"post"` | `POST_PERSONALITIES` pool |

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

## 10. Toby Integration

### Concept

Toby's TEXT-VIDEO integration extends the existing Toby agent with a new `content_type`. Users who just want to click buttons manually use the `/reels` page. Users who want full hands-off daily automation enable Toby.

TEXT-VIDEO is a feature flag on Toby — not a billing tier. The TEXT-VIDEO format is just a new `content_type` that Toby can produce.

### Billing & Access — Current State + Future Architecture

> **Current state (as of writing):** Toby is **included** for any user with at least 1 paid brand ($50/month). Every current user in the app has privilege access — there is no separate Toby upsell gate. TEXT-VIDEO follows the same rule: if you have Toby, you have text_video.
>
> **DO NOT over-engineer billing gates for text_video.** The current `BrandSubscription` check is sufficient. No new billing code needed.

**Future-proofing note:** The architecture is designed so Toby (and by extension text_video) CAN be gated as a paid upsell in the future without code changes to the content pipeline. The separation points are:

| Gate Point | Current Behavior | Future Upsell Behavior (no code change needed) |
|---|---|---|
| `feature_flags.text_video_reels` | `True` for all users | Set to `False` by default, `True` for paid tier |
| `TobyBrandConfig.reel_format` | User can set to `"text_video"` freely | UI disables the toggle unless subscription tier includes text_video |
| Toby tick (`orchestrator.py`) | Checks `feature_flags` before generating | Same — flag controls everything |
| Semi-Auto / Full-Auto (`/reels` Tab 2) | Available to all users | Frontend gate: `if (!subscription.includes('text_video')) show upgrade prompt` |
| Free-tier auto-generate limits | No limit currently | Add `auto_generates_remaining` counter per user/month in `user_profiles` |

When the business decides to gate Toby or text_video behind a higher tier, the implementation is:
1. Add a `tier` field to `BrandSubscription` (e.g., `"starter"` vs `"pro"`)
2. Add tier checks in the frontend route guards and Toby feature flag loader
3. No pipeline, model, or migration changes needed — the content_type system is tier-agnostic

**For now: ship it included. Gate it later if needed.**

> **CRITICAL: Brain-Per-Format (Section 22).** Toby maintains separate learning brains per content format. When a brand uses `text_video`, Toby queries `TobyStrategyScore WHERE content_type = "text_video_reel"`, draws from `TEXT_VIDEO_PERSONALITIES`, and runs the story discovery pipeline. The existing `content_type = "reel"` data (text_based brain) is untouched and dormant. See [Section 22](#22-brain-per-format-learning-engine-isolation) for full details.

### How Toby Uses TEXT-VIDEO

In `app/services/toby/orchestrator.py`, the `_execute_content_plan()` method currently handles `content_type == "reel"` and `content_type == "post"`. Add `content_type == "text_video_reel"`:

```python
# In _execute_content_plan():
if plan.content_type == "text_video_reel":
    # 1. Discover stories via StoryDiscoverer
    discoverer = StoryDiscoverer()
    stories = await discoverer.discover_stories(
        niche=ctx.niche_name,
        category=plan.story_category or plan.topic_bucket,  # story_category from learning engine
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

These get added to `app/services/toby/learning_engine.py` alongside the existing reel and post personalities. See [Section 22](#22-brain-per-format-learning-engine-isolation) for the complete personality pool definitions, new strategy dimensions (text_video-specific hooks, title formats, visual styles, story categories), and the learning engine routing logic.

### ContentPlan Update

The `ContentPlan` dataclass gains a `story_category` field for text_video:

```python
@dataclass
class ContentPlan:
    user_id: str
    brand_id: str
    content_type: str            # "reel" | "text_video_reel" | "post"
    scheduled_time: str
    personality_id: str
    personality_prompt: str
    topic_bucket: str
    hook_strategy: str
    title_format: str
    visual_style: str
    story_category: Optional[str] = None  # NEW — text_video only, drives StoryDiscoverer
    experiment_id: Optional[str] = None
    is_experiment: bool = False
    is_control: bool = False
    used_fallback: bool = False
```

The `content_planner.py` reads each brand's `reel_format` from `TobyBrandConfig` and sets `content_type` accordingly when creating plans for empty slots. This is already handled by the buffer manager (Section 23) — slots arrive with the correct `content_type`, so the content planner just passes it through.

### Feature Flag

Add to `app/services/toby/feature_flags.py`:

```python
"text_video_reels": False,  # TEXT-VIDEO reel format support in Toby
```

Set to `True` per-user or globally when ready to roll out.

### TobyState / TobyBrandConfig: No Separate Slot Counter Needed

> **IMPORTANT (revised from original spec):** The original spec proposed adding `text_video_slots_per_day` to `TobyState`. This is **no longer needed** with the per-brand `reel_format` architecture (Section 23). Instead:
>
> - The existing `reel_slots_per_day` (on `TobyState` and `TobyBrandConfig`) controls how many reel slots a brand gets per day.
> - The `TobyBrandConfig.reel_format` column determines whether those slots are `content_type = "reel"` (text_based) or `"text_video_reel"` (text_video).
> - The **same 6-slot schedule** applies to both formats. Format switching doesn't change the slot count.
>
> This simplifies the migration (no need for Migration 4 from the original spec) and avoids confusing users with two separate slot counters.

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

### Migration 4: `toby_brand_reel_format.sql`

Add reel_format to TobyBrandConfig (replaces the original `toby_text_video.sql` which added `text_video_slots_per_day` — that column is no longer needed, see Section 23):

```sql
-- Migration: Add reel_format to toby_brand_config
-- Run: psql "$DATABASE_URL" < migrations/toby_brand_reel_format.sql

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'toby_brand_config' AND column_name = 'reel_format'
    ) THEN
        ALTER TABLE toby_brand_config ADD COLUMN reel_format VARCHAR(30) DEFAULT 'text_based';
    END IF;
END $$;

-- Check constraint: only valid format values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'toby_brand_config' AND constraint_name = 'chk_reel_format'
    ) THEN
        ALTER TABLE toby_brand_config
            ADD CONSTRAINT chk_reel_format
            CHECK (reel_format IN ('text_based', 'text_video'));
    END IF;
END $$;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'toby_brand_config'
  AND column_name = 'reel_format';
```

### Migration 5: `niche_config_text_video.sql`

Add text-video specific columns to NicheConfig for Content DNA format split (Section 24):

```sql
-- Migration: Add text-video specific columns to niche_config
-- Run: psql "$DATABASE_URL" < migrations/niche_config_text_video.sql

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_reel_examples'
    ) THEN
        ALTER TABLE niche_config ADD COLUMN text_video_reel_examples JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_story_niches'
    ) THEN
        ALTER TABLE niche_config ADD COLUMN text_video_story_niches JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_story_tone'
    ) THEN
        ALTER TABLE niche_config ADD COLUMN text_video_story_tone TEXT DEFAULT '';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_preferred_categories'
    ) THEN
        ALTER TABLE niche_config ADD COLUMN text_video_preferred_categories JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'niche_config'
  AND column_name LIKE 'text_video_%'
ORDER BY column_name;
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
| `migrations/toby_brand_reel_format.sql` | Migration: add reel_format to toby_brand_config (Section 21) | ~25 |
| `migrations/niche_config_text_video.sql` | Migration: add text_video columns to niche_config (Section 24) | ~40 |

### Files to Modify

| File | Changes |
|---|---|
| `app/models/jobs.py` | Add `content_format` and `text_video_data` columns to `GenerationJob` |
| `app/models/toby.py` | Add `reel_format` to `TobyBrandConfig` (NOT `text_video_slots_per_day` on TobyState — see Section 23) |
| `app/models/niche_config.py` | Add `text_video_reel_examples`, `text_video_story_niches`, `text_video_story_tone`, `text_video_preferred_categories` columns (Section 24) |
| `app/services/content/job_processor.py` | Add format routing: `text_video` → slideshow compositor |
| `app/services/toby/orchestrator.py` | Add `text_video_reel` content_type handling in `_execute_content_plan()`, update variant logic (Section 23) |
| `app/services/toby/content_planner.py` | Add `story_category` to `ContentPlan`, pass through from learning engine |
| `app/services/toby/learning_engine.py` | Add `TEXT_VIDEO_PERSONALITIES`, new hooks/titles/visuals/story_categories, route by content_type in `choose_strategy()` and `get_personality_prompt()`, add `story_category` to `StrategyChoice` (Section 22) |
| `app/services/toby/buffer_manager.py` | Read `TobyBrandConfig.reel_format`, generate format-aware `content_type` per slot (Section 23) |
| `app/services/toby/feature_flags.py` | Add `text_video_reels` flag |
| `app/core/prompt_context.py` | Format-aware example loading: use `text_video_reel_examples` when content_type is `text_video_reel` (Section 24) |
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
| `PUT` | `/api/brands/{brand_id}/reel-format` | JWT | Switch a brand's reel format (Section 25) |

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

1. Run migrations (all 5 SQL files — including `toby_brand_reel_format.sql` and `niche_config_text_video.sql`)
2. Add model columns (`GenerationJob.content_format`, `GenerationJob.text_video_data`, `TobyBrandConfig.reel_format`)
3. Add NicheConfig columns (`text_video_reel_examples`, `text_video_story_niches`, `text_video_story_tone`, `text_video_preferred_categories`)
4. Create `TextVideoDesign` model
5. Create `StoryPool` model
6. Create `app/core/text_video_prompts.py`
7. Set environment variables via Railway CLI

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

### Phase 6: Toby Integration + Multi-Format Brain (Optional, Later)

27. Add `text_video_reels` feature flag
28. Update `learning_engine.py` with `TEXT_VIDEO_PERSONALITIES`, new strategy dimensions, `story_category` dimension, and content_type routing (Section 22)
29. Update `content_planner.py` with `text_video_reel` type and `story_category` field on `ContentPlan`
30. Update `buffer_manager.py` to read `TobyBrandConfig.reel_format` and generate format-aware slots (Section 23)
31. Update `orchestrator.py` with text_video_reel execution path and variant logic fix (Section 23)
32. Add `PUT /api/brands/{brand_id}/reel-format` endpoint for format switching (Section 25)
33. Update `app/core/prompt_context.py` for format-aware example loading (Section 24)

### Phase 7: Dashboard + Content DNA Multi-Format UI

34. Add `reelFormat` to `DynamicBrandInfo` type and `useDynamicBrands()` hook (Section 26)
35. Update `Home.tsx` slot coverage calculation to be format-aware (Section 26)
36. Add "Text-Video Reels" tab to Content DNA page (Section 24, conditional on brands using text_video)
37. Add format switching control to brand settings (location per ASK USER 13)

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

### `[ASK USER]` 11: Text-Video Slot Hours (Section 23)
Should text_video brands have different default slot hours than text_based? The @execute-style pages may post at different cadences (e.g., fewer but more impactful posts). Or keep the same 6-slot pattern (`[0, 4, 8, 12, 16, 20]` hours) for simplicity? The slot count is already configurable via `reel_slots_per_day` on `TobyBrandConfig`.

### `[ASK USER]` 12: NicheConfig Per-User vs Per-Brand for Text-Video (Section 24)
Currently `NicheConfig` is per-user (one config for all brands). The text_video Content DNA settings (story sub-niches, story tone, preferred categories) will apply to ALL brands that use text_video. Is per-user sufficient for MVP? Or do you need per-brand text_video overrides? Options:
- (a) Per-user only (simplest, current architecture)
- (b) Add `text_video_overrides` JSONB column on `Brand` model (per-brand override on top of global)
- (c) Add `text_video_config` table keyed by (user_id, brand_id)

### `[ASK USER]` 13: Format Switching UI Location
Where should the "Switch reel format" control live?
- (a) In the Content DNA / brand settings page
- (b) In the Toby settings per-brand
- (c) Both (Content DNA sets the creative direction, Toby settings reflect it)
- (d) In the `/reels` page Design Editor tab

### `[ASK USER]` 14: Mixed-Format Dashboard Display
When a brand switches format mid-day, the dashboard may show a mix of text_based and text_video slots for that day. Should the UI:
- (a) Show both types with different icons (transparent about the transition)
- (b) Only show the new format's slots going forward (simpler but hides already-scheduled old-format content)
- (c) Show a "transitioning" indicator for the day of the switch

---

## 21. Multi-Format Per-Brand Architecture

### The Problem

The original spec treats `text_video` as a simple addition. But ViralToby is multi-tenant multi-brand: one user may have Brand A using `text_based` reels and Brand B using `text_video` reels. This creates cascading complexity that the original 20 sections did not address:

1. **Slot system** — `text_based` slots alternate light/dark. `text_video` slots have no variant distinction.
2. **Learning engine** — Toby's Thompson Sampling brain for `text_based` reels is useless for `text_video`. Different personality pools, different strategy dimensions, different performance signals.
3. **Content DNA** — `text_based` examples don't help `text_video` generation. Users need format-specific examples.
4. **Dashboard** — Home.tsx slot coverage display is hardcoded to light/dark pattern. `text_video` brands need different labels.
5. **Format switching** — A brand switching from `text_based` to `text_video` (or vice versa) must not corrupt learning data, delete scheduled content, or crash the buffer manager.

### The Rule

> **Each brand has exactly one reel format at any time. That format determines its slot pattern, learning brain, personality pool, and generation pipeline. Switching format activates a different brain — it does NOT reset or corrupt the existing one.**

### Source of Truth: `TobyBrandConfig.reel_format`

The per-brand reel format is stored in `TobyBrandConfig`:

```python
# app/models/toby.py — TobyBrandConfig
reel_format = Column(String(30), default="text_based")
# Values: "text_based" (default) | "text_video"
```

This column drives everything downstream:

| `reel_format` | `content_type` in slots | `variant` pattern | Personality pool | Pipeline |
|---|---|---|---|---|
| `text_based` | `"reel"` | `light` / `dark` (alternating by slot index) | `REEL_PERSONALITIES` (5: edu_calm, provoc, story, data, urgent) | Pillow image → FFmpeg static video |
| `text_video` | `"text_video_reel"` | `"text_video"` (uniform, no alternation) | `TEXT_VIDEO_PERSONALITIES` (5: breaking_news, power_moves, controversy, underdog, mind_blowing) | Story discovery → image sourcing → FFmpeg slideshow |

**Backward compatibility:** Existing brands have no `reel_format` value (NULL). NULL is treated as `"text_based"` everywhere. No existing behavior changes.

### Content Type Taxonomy

The full `content_type` taxonomy after this change:

| `content_type` value | Parent format | Used in |
|---|---|---|
| `"reel"` | `text_based` | Existing text-based reels. Thompson Sampling, buffer slots, experiments. |
| `"text_video_reel"` | `text_video` | New text-video reels. Separate Thompson Sampling brain. |
| `"post"` | (carousel) | Existing carousel posts. Unchanged. |

The `content_type` string is the **primary key dimension** in `TobyStrategyScore`, `TobyExperiment`, `TobyContentTag`, and the learning engine's `choose_strategy()`. By using distinct content_type values, learning data is **automatically isolated** between formats without any special migration or data split logic.

### How It Flows Through the System

```
User sets Brand X reel_format = "text_video" (via Settings or Content DNA)
         │
         ▼
Buffer Manager reads TobyBrandConfig.reel_format for Brand X
         │
         ▼
Generates slots: content_type = "text_video_reel" (not "reel")
         │
         ▼
Content Planner picks empty slot → calls choose_strategy(content_type="text_video_reel")
         │
         ▼
Learning Engine:
  - Uses TEXT_VIDEO_PERSONALITIES pool (not REEL_PERSONALITIES)
  - Queries TobyStrategyScore WHERE content_type = "text_video_reel"
  - Finds zero rows → pure exploration (cold-start, H5 logic)
         │
         ▼
Orchestrator._execute_content_plan():
  - Detects plan.content_type == "text_video_reel"
  - Runs story discovery + polishing + image sourcing pipeline
  - Creates job with content_format = "text_video", variant = "text_video"
         │
         ▼
JobProcessor detects content_format = "text_video" → slideshow compositor
         │
         ▼
Publishing → ScheduledReel with extra_data.content_type = "text_video_reel"
         │
         ▼
Home.tsx reads brand's reel_format → shows correct slot labels
```

### Migration: `toby_brand_reel_format.sql`

```sql
-- Migration: Add reel_format to toby_brand_config
-- Run: psql "$DATABASE_URL" < migrations/toby_brand_reel_format.sql

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'toby_brand_config' AND column_name = 'reel_format'
    ) THEN
        ALTER TABLE toby_brand_config ADD COLUMN reel_format VARCHAR(30) DEFAULT 'text_based';
    END IF;
END $$;

-- Check constraint: only valid format values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'toby_brand_config' AND constraint_name = 'chk_reel_format'
    ) THEN
        ALTER TABLE toby_brand_config
            ADD CONSTRAINT chk_reel_format
            CHECK (reel_format IN ('text_based', 'text_video'));
    END IF;
END $$;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'toby_brand_config'
  AND column_name = 'reel_format';
```

This migration runs as **Migration 5** (after the 4 in Section 11). The model column is added to `TobyBrandConfig` in `app/models/toby.py` AFTER the migration runs.

---

## 22. Brain-Per-Format: Learning Engine Isolation

### Concept

Toby doesn't have "one brain" — it has one brain **per (brand_id, content_type)**. The learning engine already implements this via the composite key `(user_id, brand_id, content_type, dimension, option_value)` in `TobyStrategyScore`.

By introducing `content_type = "text_video_reel"` as distinct from `"reel"`, we get automatic brain isolation:

```
Brand A (text_based):
  TobyStrategyScore WHERE brand_id = "A" AND content_type = "reel"
  → 5 dimensions × N options each → ~25-30 rows
  → This is the "text_based brain" for Brand A

Brand A (switches to text_video):
  TobyStrategyScore WHERE brand_id = "A" AND content_type = "text_video_reel"
  → 0 rows initially → cold-start → pure exploration
  → The old "reel" rows stay in DB, untouched, dormant

Brand A (switches back to text_based):
  → The "reel" rows are still there → Toby picks up where it left off
  → Zero data loss, zero corruption
```

### Personality Pools Per Format

**Existing pool (text_based reels)** — no changes:
```python
REEL_PERSONALITIES = {
    "edu_calm":  "You are a calm, knowledgeable educator...",
    "provoc":    "You challenge common myths with surprising facts...",
    "story":     "Frame every tip as a mini-story...",
    "data":      "Lead with specific numbers and statistics...",
    "urgent":    "Create a sense of urgency...",
}
```

**New pool (text_video reels):**
```python
TEXT_VIDEO_PERSONALITIES = {
    "breaking_news":  "You report just-happened stories with urgency. 'BREAKING:', timely, factual, impactful.",
    "power_moves":    "You narrate bold business and wealth decisions. Confident, awed tone. 'He just sold...'",
    "controversy":    "You present provocative takes and public debates. Two-sided, dramatic. 'Here's what no one is saying...'",
    "underdog":       "You tell surprising success stories from underdogs. Inspirational, 'Nobody expected this...'",
    "mind_blowing":   "You reveal shocking facts and statistics. 'This number will change how you think about...'",
}
```

**New strategy dimensions for text_video:**

The existing dimensions (personality, topic, hook, title_format, visual_style) mostly apply, but some options differ:

| Dimension | text_based options | text_video options |
|---|---|---|
| `personality` | edu_calm, provoc, story, data, urgent | breaking_news, power_moves, controversy, underdog, mind_blowing |
| `topic` | From NicheConfig.topic_categories | From NicheConfig.topic_categories (same, shared) |
| `hook` | question, myth_buster, shocking_stat, personal_story, bold_claim | breaking_hook, statistic_lead, name_drop, controversy_opener, prediction |
| `title_format` | how_x_does_y, number_one_mistake, why_experts_say, stop_doing_this, hidden_truth | name_action, shocking_number, versus_outcome, one_word_punch, question_reveal |
| `visual_style` | dark_cinematic, light_clean, vibrant_bold | news_dramatic, cinematic_epic, minimal_stark |
| `story_category` | (N/A for text_based) | power_moves, controversy, underdog, prediction, shocking_stat, human_moment, industry_shift, failed_bet, hidden_cost, scientific_breakthrough |

The `story_category` dimension is **unique to text_video** — it drives the StoryDiscoverer's search category. Thompson Sampling learns which categories perform best per brand.

### Implementation Changes to `learning_engine.py`

```python
# Add to existing constants at top of file

TEXT_VIDEO_PERSONALITIES = {
    "breaking_news":  "You report just-happened stories with urgency...",
    "power_moves":    "You narrate bold business and wealth decisions...",
    "controversy":    "You present provocative takes and public debates...",
    "underdog":       "You tell surprising success stories from underdogs...",
    "mind_blowing":   "You reveal shocking facts and statistics...",
}

TEXT_VIDEO_HOOKS = ["breaking_hook", "statistic_lead", "name_drop", "controversy_opener", "prediction"]

TEXT_VIDEO_TITLE_FORMATS = ["name_action", "shocking_number", "versus_outcome", "one_word_punch", "question_reveal"]

TEXT_VIDEO_VISUAL_STYLES = ["news_dramatic", "cinematic_epic", "minimal_stark"]

TEXT_VIDEO_STORY_CATEGORIES = [
    "power_moves", "controversy", "underdog", "prediction", "shocking_stat",
    "human_moment", "industry_shift", "failed_bet", "hidden_cost", "scientific_breakthrough",
]


def get_personality_prompt(content_type: str, personality_id: str) -> str:
    """Get the system prompt modifier for a personality."""
    if content_type == "text_video_reel":
        pool = TEXT_VIDEO_PERSONALITIES
    elif content_type == "reel":
        pool = REEL_PERSONALITIES
    else:
        pool = POST_PERSONALITIES
    return pool.get(personality_id, "")


def choose_strategy(...):
    # Updated routing:
    if content_type == "text_video_reel":
        personality_pool = list(TEXT_VIDEO_PERSONALITIES.keys())
        hooks = TEXT_VIDEO_HOOKS
        titles = TEXT_VIDEO_TITLE_FORMATS
        visuals = TEXT_VIDEO_VISUAL_STYLES
    elif content_type == "reel":
        personality_pool = list(REEL_PERSONALITIES.keys())
        hooks = HOOK_STRATEGIES
        titles = TITLE_FORMATS
        visuals = VISUAL_STYLES
    else:
        personality_pool = list(POST_PERSONALITIES.keys())
        hooks = HOOK_STRATEGIES
        titles = TITLE_FORMATS
        visuals = VISUAL_STYLES

    personality = _pick_dimension(db, user_id, brand_id, content_type, "personality", personality_pool, ...)
    topic = _pick_dimension(db, user_id, brand_id, content_type, "topic", topics, ...)
    hook = _pick_dimension(db, user_id, brand_id, content_type, "hook", hooks, ...)
    title_fmt = _pick_dimension(db, user_id, brand_id, content_type, "title_format", titles, ...)
    visual = _pick_dimension(db, user_id, brand_id, content_type, "visual_style", visuals, ...)

    # TEXT-VIDEO also picks story_category:
    story_category = None
    if content_type == "text_video_reel":
        story_category = _pick_dimension(
            db, user_id, brand_id, content_type, "story_category",
            TEXT_VIDEO_STORY_CATEGORIES, is_explore, use_thompson,
        )

    return StrategyChoice(
        personality=personality,
        topic_bucket=topic,
        hook_strategy=hook,
        title_format=title_fmt,
        visual_style=visual,
        story_category=story_category,  # New field
        ...
    )
```

### StrategyChoice Dataclass Update

```python
@dataclass
class StrategyChoice:
    personality: str
    topic_bucket: str
    hook_strategy: str
    title_format: str
    visual_style: str
    story_category: Optional[str] = None   # NEW — only set for text_video_reel
    is_experiment: bool = False
    experiment_id: Optional[str] = None
    used_fallback: bool = False
```

### Cross-Brand Cold-Start for text_video

The existing Phase C cold-start logic checks: "if this brand has <10 samples for a dimension, borrow from other brands of the same user." This **already works** for `text_video_reel` because it filters by `(user_id, content_type, dimension)` — it will only borrow from other brands that also use text_video, never from text_based data.

If no brand has text_video data yet (first brand to enable it), the learning engine falls back to pure exploration (`explore_ratio = 1.0`), which is the correct behavior for a fresh format.

### Experiments Per Format

`TobyExperiment` already has a `content_type` field. Experiments for text_video use `content_type = "text_video_reel"`. They never interfere with `content_type = "reel"` experiments. This is automatic — no code changes needed in experiment creation/completion logic.

---

## 23. Slot System Changes

### Current Slot Pattern (text_based only)

```python
# buffer_manager.py
BASE_REEL_HOURS = [0, 4, 8, 12, 16, 20]   # 6 reels/day
BASE_POST_HOURS = [8, 14]                   # 2 posts/day
```

All reel slots have `content_type: "reel"`. The variant (light/dark) is NOT determined in the buffer manager — it's determined later in the orchestrator:

```python
# orchestrator.py line 444
variant = "light" if slot_index % 2 == 0 else "dark"
```

### New Slot Pattern (format-aware)

The buffer manager must read each brand's `reel_format` and generate the correct `content_type`:

```python
# buffer_manager.py — updated slot generation loop

for brand in brands:
    bc = brand_config_map.get(brand.id)
    brand_reel_format = (bc.reel_format if bc and bc.reel_format else "text_based")

    # Determine content_type based on brand's reel format
    reel_content_type = "text_video_reel" if brand_reel_format == "text_video" else "reel"

    # Reel slots (same hours, different content_type)
    for base_hour in BASE_REEL_HOURS[:brand_reel_slots]:
        hour = (base_hour + offset_hours) % 24
        slot_time = datetime(day.year, day.month, day.day, hour, 0, tzinfo=timezone.utc)
        if slot_time <= now:
            continue
        all_slots.append({
            "brand_id": brand.id,
            "time": slot_time.isoformat(),
            "content_type": reel_content_type,  # ← FORMAT-AWARE
            "filled": _slot_is_filled(brand.id, slot_time),
        })
```

**Key point:** The slot _hours_ are the same for both formats. Both text_based and text_video brands get 6 reel slots at [0, 4, 8, 12, 16, 20] hours (adjusted by brand offset). The difference is the `content_type` field, which routes to the correct pipeline.

`[ASK USER]` Decision Point 11: Should text_video brands have different default slot hours? The @execute-style pages seem to post at different cadences. Or keep the same 6-slot pattern for simplicity?

### Orchestrator Variant Logic Update

```python
# orchestrator.py — _execute_content_plan() Step 3

if plan.content_type == "text_video_reel":
    variant = "text_video"
elif plan.content_type == "reel":
    sched_time = datetime.fromisoformat(plan.scheduled_time)
    slot_index = sched_time.hour // 4
    variant = "light" if slot_index % 2 == 0 else "dark"
else:
    variant = "post"
```

### text_video_slots_per_day vs reel_slots_per_day

In the original spec, Section 10 proposed a separate `text_video_slots_per_day` column on `TobyState`. This is **no longer needed** with the per-brand `reel_format` approach.

Instead:
- `reel_slots_per_day` (on `TobyState` and `TobyBrandConfig`) applies to **whichever reel format the brand uses**.
- If a brand uses `text_video`, its `reel_slots_per_day` slots are `text_video_reel` type. If `text_based`, they're `reel` type.
- No need for a separate slot counter. The format determines the content_type; the count is the same.

**Correction to Section 10:** Remove `text_video_slots_per_day` from `TobyState`. Remove Migration 4 (`toby_text_video.sql`). The slot count is controlled by the existing `reel_slots_per_day` on `TobyBrandConfig`.

---

## 24. Content DNA Format Split

### Current State

`NicheConfig` is per-user (not per-brand), with format-agnostic fields:
- `reel_examples` (JSONB) — user-provided example reels for few-shot prompting
- `post_examples` (JSONB) — user-provided example posts
- `content_tone`, `hook_themes`, `content_philosophy`, etc. — shared across all formats

### The Problem

Text-based reels and text-video reels are fundamentally different content styles:
- **Text-based:** Health tips, educational advice, myth-busting. Tone is authoritative, personal.
- **Text-video:** Real-world stories, news, viral facts. Tone is dramatic, factual, awe-inspiring.

A user's Content DNA should allow format-specific customization without fragmenting the shared identity (brand personality, target audience, logo, etc.).

### Solution: Format-Specific Example Columns + Shared Core

The `NicheConfig` model gains text_video-specific columns. The core identity fields (niche_name, content_tone, target_audience, brand_personality) remain shared — they define what the brand IS, regardless of format. The format-specific fields define HOW each format expresses that identity.

**New columns on `NicheConfig`:**

```python
# Format-specific reel examples
text_video_reel_examples = Column(JSONB, default=[])  # Examples of @execute-style reels
text_video_story_niches = Column(JSONB, default=[])    # Sub-niches for story discovery
                                                        # e.g., ["celebrity finance", "tech scandals", "startup stories"]
text_video_story_tone = Column(Text, default="")       # Tone override for text-video
                                                        # e.g., "dramatic, factual, awe-inspiring"
text_video_preferred_categories = Column(JSONB, default=[])  # Weighted preferences for story categories
                                                              # e.g., [{"category": "power_moves", "weight": 0.3}, ...]
```

### Migration: `niche_config_text_video.sql`

```sql
-- Migration: Add text-video specific columns to niche_config
-- Run: psql "$DATABASE_URL" < migrations/niche_config_text_video.sql

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_reel_examples'
    ) THEN
        ALTER TABLE niche_config ADD COLUMN text_video_reel_examples JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_story_niches'
    ) THEN
        ALTER TABLE niche_config ADD COLUMN text_video_story_niches JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_story_tone'
    ) THEN
        ALTER TABLE niche_config ADD COLUMN text_video_story_tone TEXT DEFAULT '';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'niche_config' AND column_name = 'text_video_preferred_categories'
    ) THEN
        ALTER TABLE niche_config ADD COLUMN text_video_preferred_categories JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'niche_config'
  AND column_name LIKE 'text_video_%'
ORDER BY column_name;
```

### Content DNA Page: New Tab/Section

The existing Content DNA page (wherever NicheConfig is edited) gains a new section:

```
┌──────────────────────────────────────────────────────────┐
│  Content DNA                                             │
│                                                          │
│  ┌────────────────┐  ┌──────────────────┐  ┌──────────┐ │
│  │ Core Identity  │  │ Text-Based Reels │  │ Text-    │ │
│  │                │  │                  │  │ Video    │ │
│  └────────────────┘  └──────────────────┘  │ Reels    │ │
│                                             └──────────┘ │
│                                                          │
│  ── Text-Video Reels Settings ──────────────────────     │
│                                                          │
│  Story Sub-Niches (comma-separated):                     │
│  ┌──────────────────────────────────────────────────┐    │
│  │ celebrity finance, tech scandals, startup stories │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  Story Tone Override (leave empty to use core tone):     │
│  ┌──────────────────────────────────────────────────┐    │
│  │ dramatic, factual, awe-inspiring                  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  Text-Video Reel Examples (paste Instagram URLs):        │
│  ┌──────────────────────────────────────────────────┐    │
│  │ https://instagram.com/reel/...                    │    │
│  │ https://instagram.com/reel/...                    │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  Preferred Story Categories:                             │
│  [✓] Power Moves    [ ] Controversy    [✓] Underdog     │
│  [✓] Shocking Stat  [ ] Human Moment   [ ] Failed Bet   │
│  [ ] Prediction     [✓] Industry Shift [ ] Hidden Cost  │
│  [✓] Scientific Breakthrough                             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Conditional visibility:** The "Text-Video Reels" tab only appears if at least one of the user's brands has `reel_format = "text_video"`. Otherwise it's hidden to avoid confusing users who haven't enabled the format.

### PromptContext Integration

The `PromptContext` dataclass (`app/core/prompt_context.py`) currently passes `reel_examples` to prompts. It needs format-aware example loading:

```python
# In prompt_context.py — build_context() or wherever PromptContext is constructed

if content_type == "text_video_reel":
    ctx.reel_examples = niche.text_video_reel_examples or []
    ctx.story_sub_niches = niche.text_video_story_niches or []
    ctx.content_tone_override = niche.text_video_story_tone or ctx.content_tone
else:
    ctx.reel_examples = niche.reel_examples or []
```

### NicheConfig Is Per-User, Not Per-Brand — Impact

Since `NicheConfig` is per-user, the text_video content DNA settings apply to ALL brands that use text_video format. If a user has two text_video brands in different niches, the same story tone and examples apply to both.

`[ASK USER]` Decision Point 12: Is per-user text_video configuration sufficient for MVP? Or do users need per-brand text_video settings? Per-brand would require either:
- (a) Moving NicheConfig to per-brand (MAJOR refactor, breaks existing system)
- (b) Adding a `text_video_overrides` JSONB column on `Brand` model (simpler, per-brand override on top of global NicheConfig)
- (c) Adding a `text_video_config` table keyed by (user_id, brand_id) — a new per-brand config specifically for text-video

Recommendation: Start with per-user (option a=skip), add per-brand later if users ask for it.

---

## 25. Format Switching Resilience

### Scenario

User changes Brand X's `reel_format` from `text_based` to `text_video` (or vice versa).

### What MUST Happen

1. **`TobyBrandConfig.reel_format` updated** — Single column update via API or Settings UI.

2. **Already-scheduled content is NOT deleted.** Existing `ScheduledReel` entries for Brand X with `content_type = "reel"` or `variant = "light"/"dark"` remain and will be published as planned. They're already generated — destroying them would waste compute and create gaps.

3. **Buffer manager recalculates on next tick.** The next time `get_buffer_status()` runs for this user, Brand X's slots will use the new `content_type`. New empty slots will be `text_video_reel` (or `reel`, depending on direction). Toby fills them with the correct format.

4. **Learning engine activates the other brain.** Toby starts querying `TobyStrategyScore WHERE content_type = "text_video_reel"` instead of `"reel"`. If no data exists (first time), cold-start exploration kicks in.

5. **Old learning data is preserved.** The `TobyStrategyScore` rows for the old `content_type` remain in the database. If the user switches back, Toby picks up exactly where it left off.

6. **Dashboard updates immediately.** The API that feeds Home.tsx includes `content_type` in slot data. The frontend reads the brand's reel_format and adjusts labels.

### What Must NOT Happen

- ❌ Deleting or resetting Thompson Sampling scores
- ❌ Deleting scheduled content for the old format
- ❌ Mixing old-format slots with new-format slots for the same brand
- ❌ Crashing if `reel_format` is NULL (treat as `text_based`)
- ❌ Allowing both formats simultaneously for the same brand (one at a time)

### API Endpoint for Format Switching

```python
# app/api/toby/toby_routes.py or app/api/brands/brand_routes.py

@router.put("/api/brands/{brand_id}/reel-format")
async def update_brand_reel_format(
    brand_id: str,
    request: UpdateReelFormatRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Switch a brand's reel format. Does NOT delete existing content."""

class UpdateReelFormatRequest(BaseModel):
    reel_format: str  # "text_based" | "text_video"
```

The endpoint:
1. Validates `reel_format` is one of the allowed values
2. Verifies brand ownership (`brand.user_id == user["id"]`)
3. Updates `TobyBrandConfig.reel_format`
4. Does NOT touch `ScheduledReel`, `TobyStrategyScore`, or any other table
5. Returns the updated brand config

### Transition Period

During the buffer window (48h default), a brand may have mixed content:
- Slots filled BEFORE the switch → old format (will publish normally)
- Slots filled AFTER the switch → new format

This is expected and fine. The buffer progressively transitions as new content fills the new-format slots.

### Edge Case: Mid-Day Switch

If a user switches format mid-day:
- Slots already filled today: stay as-is (old format)
- Slots not yet filled today: become new format on next tick
- The dashboard shows a mix for today — this is correct behavior

---

## 26. Dashboard & Home.tsx Multi-Format Awareness

### Current Problem

Home.tsx uses a hardcoded slot definition:

```tsx
const BASE_REEL_SLOTS: Array<{ hour: number; variant: 'light' | 'dark' }> = [
  { hour: 0, variant: 'light' },
  { hour: 4, variant: 'dark' },
  // ...
]
```

This doesn't work for `text_video` brands, which have no light/dark distinction.

### Solution: Dynamic Slot Labels Per Brand

The slot hours remain the same (6 slots at [0, 4, 8, 12, 16, 20]). What changes is the **label and variant type** per brand.

**Option A (Preferred): Backend provides slot info including content_type**

The `/api/toby/buffer-status` endpoint already returns per-slot data with `content_type`. The frontend should use this instead of a hardcoded array:

```tsx
// NEW — get slot pattern from backend buffer status or brand config
const getReelSlotPattern = (brandId: string, brandReelFormat: string) => {
  if (brandReelFormat === 'text_video') {
    return BASE_REEL_HOURS.map(hour => ({
      hour,
      variant: 'text_video' as const,
      label: '📹',
    }))
  }
  // Default: text_based with light/dark alternation
  return BASE_REEL_SLOTS  // existing light/dark array
}
```

**Option B: Extend DynamicBrandInfo with reel_format**

The `useDynamicBrands()` hook returns `DynamicBrandInfo[]`. Add `reelFormat: 'text_based' | 'text_video'` to this type so the frontend knows each brand's format without an extra API call:

```tsx
interface DynamicBrandInfo {
  id: string
  label: string
  color: string
  // ... existing fields
  reelFormat: 'text_based' | 'text_video'  // NEW
}
```

This comes from the `TobyBrandConfig.reel_format` column, loaded by the brands API.

### Updated Coverage Calculation

```tsx
const coverage = useMemo(() => {
  return dynamicBrands.map(brand => {
    const brandToday = todayPosts.filter(p => p.metadata?.brand === brand.id)
    const reelsByHour = new Map<number, string>()
    brandToday.filter(p => p.metadata?.variant !== 'post').forEach(p => {
      reelsByHour.set(new Date(p.scheduled_time).getHours(), p.metadata?.variant || 'light')
    })

    const offset = brand.scheduleOffset || 0
    const isTextVideo = brand.reelFormat === 'text_video'

    const reelSlots = (isTextVideo ? BASE_REEL_HOURS : BASE_REEL_SLOTS).map((slot, idx) => {
      const base = typeof slot === 'number' ? slot : slot.hour
      const expectedVariant = isTextVideo ? 'text_video' : (slot as any).variant || (idx % 2 === 0 ? 'light' : 'dark')
      const hour = (base + offset) % 24
      const t = new Date(dayStart); t.setHours(hour, 0, 0, 0)
      const isPast = t < n
      const filled = reelsByHour.has(hour)
      return { hour, filled, isPast, variant: expectedVariant }
    })

    // ... rest of coverage calculation unchanged
  })
}, [todayPosts, dynamicBrands])
```

### Slot Visual Indicators

| Format | Filled indicator | Empty indicator |
|---|---|---|
| `text_based` light | ☀️ (gold dot) | ○ (outlined gold) |
| `text_based` dark | 🌙 (purple dot) | ○ (outlined purple) |
| `text_video` | 📹 (blue dot) | ○ (outlined blue) |

### Where `reelFormat` Comes From

The `/api/brands` endpoint (or `/api/toby/state`) must include each brand's `reel_format` in the response. This means the backend social connect or brands API needs to JOIN with `TobyBrandConfig` to include the format field.

Alternatively, the Toby state endpoint (`/api/toby/state`) already returns `brand_configs` — ensure it includes `reel_format` in each brand config object:

```python
# In the toby state API response
"brand_configs": [
    {
        "brand_id": "...",
        "reel_slots_per_day": 6,
        "post_slots_per_day": 2,
        "enabled_platforms": [...],
        "reel_format": "text_video",  # ← NEW
    }
]
```

---

## 27. Scalability: Adding Future Formats

### Extension Pattern

The architecture is designed so new formats follow a predictable pattern:

1. **Define a new `content_type` string** — e.g., `"carousel_reel"`, `"story_clip"`, `"youtube_short"`
2. **Add a personality pool** — `CAROUSEL_REEL_PERSONALITIES = {...}`
3. **Add strategy dimension options** — new hooks, title formats, visual styles specific to the format
4. **Extend `reel_format` (or add `post_format`)** — `CHECK (reel_format IN ('text_based', 'text_video', 'carousel_reel'))`
5. **Add format-specific examples to NicheConfig** — `carousel_reel_examples = Column(JSONB, default=[])`
6. **Add a compositor** — `carousel_reel_compositor.py`
7. **Route in orchestrator** — `elif plan.content_type == "carousel_reel": ...`
8. **Route in job_processor** — `elif content_format == "carousel_reel": ...`

### What's Shared vs. Format-Specific

| Component | Shared across formats | Format-specific |
|---|---|---|
| Thompson Sampling engine | ✅ (algorithm, update logic) | Personality pools, option lists, data rows (keyed by content_type) |
| Buffer manager | ✅ (slot generation algorithm, hours, fuzzy matching) | `content_type` label per slot |
| Experiment engine | ✅ (creation, completion, timeout) | `content_type` filter on experiments |
| NicheConfig core fields | ✅ (niche_name, tone, audience, topics) | Example columns, tone overrides, category preferences |
| Publishing pipeline | ✅ (ScheduledReel, SocialPublisher, scheduling) | `variant` value, media type |
| Billing/subscription | ✅ (BrandSubscription, gates) | None — billing is format-agnostic |
| Feature flags | ✅ (flag system) | Per-format flag (e.g., `"text_video_reels"`) |

### Adding a Format: Checklist

```markdown
- [ ] New `content_type` string constant
- [ ] Personality pool (5-7 personalities)
- [ ] Strategy dimension options (hooks, titles, visuals + any format-specific dims)
- [ ] Migration: extend CHECK constraint on reel_format (or equivalent format column)
- [ ] Migration: add example column(s) to niche_config
- [ ] Model: add columns to NicheConfig, TobyBrandConfig format, TextVideoDesign (if applicable)
- [ ] learning_engine.py: add pool routing in choose_strategy()
- [ ] learning_engine.py: add pool routing in get_personality_prompt()
- [ ] buffer_manager.py: already handles dynamically (reads reel_format — extend to new value)
- [ ] content_planner.py: StrategyChoice may need new format-specific fields
- [ ] orchestrator.py: add content_type routing in _execute_content_plan()
- [ ] job_processor.py: add content_format routing in process_job()
- [ ] Home.tsx: add visual indicator for new format
- [ ] Content DNA page: add format-specific tab (conditional on brands using it)
- [ ] /reels page: add tab for new format
- [ ] validate_api.py: add new modules
- [ ] Feature flag: add "new_format_name" flag
- [ ] Self-maintenance: update customization files
```

### Why Not a Generic `format_config` JSONB Column?

Tempting to replace `reel_format VARCHAR` with a flexible `format_config JSONB` that stores arbitrary format settings. We avoid this because:
1. CHECK constraints on VARCHAR catch typos at the DB level
2. Explicit columns are easier to query and index
3. The number of reel formats will be small (3-5 total, ever)
4. JSONB loses type safety; VARCHAR with CHECK is safer

If we ever need >5 formats (unlikely), we can migrate to an enum or a separate `content_formats` lookup table.

---

## 28. Production Safety: Zero-Downtime Migration Plan

> **PRIME DIRECTIVE:** Existing users with complex Toby configurations — active Thompson Sampling scores, running experiments, multi-brand buffer schedules, scheduled content queued for publishing — MUST NOT be affected during or after this deployment. No data loss. No 500 errors. No Toby tick crashes. No missed publishes. The system must remain fully functional at every intermediate step.

### 28.1 Why This Matters

ViralToby runs as a single Railway service with:
- **Toby tick loop** every 5 minutes (APScheduler) querying `generation_jobs`, `scheduled_reels`, `toby_state`, `toby_brand_config`, `toby_strategy_score`, `toby_experiments`
- **Active publishing** running 24/7 — scheduled content must publish on time
- **No automatic migration on startup** — Dockerfile runs `uvicorn` directly, migrations are manual
- **SQLAlchemy model-first** — if a model references a column that doesn't exist in the DB, every query on that table returns HTTP 500 (`UndefinedColumn`)

If we add `content_format` to the `GenerationJob` model in Python but haven't run the SQL migration, **every single page load, every job creation, every Toby tick** crashes. The entire app goes down.

### 28.2 The Golden Rule: Migrations-First, Code-Second

```
1. Run SQL migrations (add columns, tables, indexes)     — DB changes only
2. Verify migrations succeeded (SELECT new columns)       — Validation
3. Deploy new code that references the columns             — Code changes only
4. Verify new code works with new + old data               — Smoke test
```

**Never, ever deploy code that references a column before the migration has run and been verified.**

### 28.3 Staged Migration Plan

The deployment is split into **4 stages**, each independently safe to deploy and independently rollback-able.

#### Stage 1: Database Schema Additions (Zero Code Changes)

Run these in order. Each is idempotent (`IF NOT EXISTS`). Run them via:
```bash
railway run -- psql "$DATABASE_URL" < migrations/<file>.sql
```

Or via Supabase SQL Editor (Dashboard → SQL Editor → paste + run).

| Order | Migration File | What It Does | Tables Affected | Risk |
|---|---|---|---|---|
| 1 | `migrations/text_video_format.sql` | Add `content_format VARCHAR(30) DEFAULT 'text_based'` + `text_video_data JSONB` to `generation_jobs` | `generation_jobs` | **NONE** — additive column with default. Existing rows get `'text_based'` or NULL. SQLAlchemy won't query these columns until code deploys. |
| 2 | `migrations/text_video_design.sql` | Create new table `text_video_design` | New table | **NONE** — new table, no existing queries touch it. |
| 3 | `migrations/text_video_story_pool.sql` | Create new table `text_video_story_pool` | New table | **NONE** — new table. |
| 4 | `migrations/toby_brand_reel_format.sql` | Add `reel_format VARCHAR(30) DEFAULT 'text_based'` to `toby_brand_config` + CHECK constraint | `toby_brand_config` | **NONE** — additive column with default. All existing brands get `'text_based'` (NULL also treated as text_based in code). |
| 5 | `migrations/niche_config_text_video.sql` | Add 4 JSONB columns to `niche_config` | `niche_config` | **NONE** — additive columns with `DEFAULT '[]'`. |

**After Stage 1, verify:**
```sql
-- Run in Supabase SQL Editor or psql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'generation_jobs' AND column_name IN ('content_format', 'text_video_data');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'toby_brand_config' AND column_name = 'reel_format';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'niche_config' AND column_name LIKE 'text_video_%';

SELECT count(*) FROM text_video_design;  -- should be 0
SELECT count(*) FROM text_video_story_pool;  -- should be 0
```

**Rollback for Stage 1:** Not needed — these are additive changes. But if you must:
```sql
ALTER TABLE generation_jobs DROP COLUMN IF EXISTS content_format;
ALTER TABLE generation_jobs DROP COLUMN IF EXISTS text_video_data;
ALTER TABLE toby_brand_config DROP COLUMN IF EXISTS reel_format;
ALTER TABLE niche_config DROP COLUMN IF EXISTS text_video_reel_examples;
ALTER TABLE niche_config DROP COLUMN IF EXISTS text_video_story_niches;
ALTER TABLE niche_config DROP COLUMN IF EXISTS text_video_story_tone;
ALTER TABLE niche_config DROP COLUMN IF EXISTS text_video_preferred_categories;
DROP TABLE IF EXISTS text_video_design;
DROP TABLE IF EXISTS text_video_story_pool;
```

#### Stage 2: Backend Code — Backward-Compatible Model Updates + New Files

Deploy new Python code that:
1. Adds new columns to SQLAlchemy models (now safe — columns exist in DB from Stage 1)
2. Adds new service files (`story_discoverer.py`, `slideshow_compositor.py`, etc.)
3. Adds new API routes (new routers registered in `main.py`)
4. Updates existing code with **backward-compatible guards** (see Section 28.5)

**Critical model updates (must match Stage 1 migrations):**

```python
# app/models/jobs.py — add after existing columns
content_format = Column(String(30), default="text_based")
text_video_data = Column(JSON)

# app/models/toby.py — TobyBrandConfig, add after existing columns
reel_format = Column(String(30), default="text_based")

# app/models/niche_config.py — add after existing columns
text_video_reel_examples = Column(JSONB, default=[])
text_video_story_niches = Column(JSONB, default=[])
text_video_story_tone = Column(Text, default="")
text_video_preferred_categories = Column(JSONB, default=[])
```

**Safety guarantee:** After Stage 2 deploys:
- All existing content remains `content_format = 'text_based'` (or NULL, treated as text_based)
- All existing brands remain `reel_format = 'text_based'` (or NULL, treated as text_based)
- No existing code paths change behavior — all new logic is gated behind `content_type == "text_video_reel"` or `content_format == "text_video"` checks, which no existing data satisfies
- Toby tick loop continues as normal — no brand has text_video, so no text_video code executes

#### Stage 3: Frontend Code — Backward-Compatible Type Updates

Deploy frontend changes:
1. Extend `Variant` type: `'light' | 'dark' | 'post' | 'text_video'`
2. Add `text_video` handling to all variant switch/conditional statements
3. Add new tab pages, design editor, etc.
4. All new UI is behind feature gates (brands must have `reel_format = 'text_video'` which none do yet)

**Safety guarantee:** Until a user explicitly sets a brand to `text_video` format, no new UI code activates. The existing experience is identical.

#### Stage 4: Feature Enablement (User-by-User)

Format switching is manual — users opt in per brand:
1. Admin sets `text_video_reels = True` in feature flags (or per-user override)
2. User goes to brand settings → switches reel format to "Text-Video"
3. Toby reads `reel_format = 'text_video'` on next tick → starts generating text_video content

**Rollback:** User switches brand back to `text_based`. Toby resumes text_based on next tick.

### 28.4 Existing Data Preservation Guarantees

| Data | What Happens | Guarantee |
|---|---|---|
| `TobyStrategyScore` rows (Thompson Sampling) | **Untouched.** All existing rows have `content_type = "reel"` or `"post"`. New text_video rows use `content_type = "text_video_reel"`. Different key = different rows. | Zero data loss. Zero corruption. |
| `TobyExperiment` rows | **Untouched.** Same `content_type` isolation. | Active experiments continue uninterrupted. |
| `TobyContentTag` rows | **Untouched.** Historical strategy records preserved. | Full audit trail preserved. |
| `TobyBrandConfig` rows | **Extended.** Gains `reel_format` column with `DEFAULT 'text_based'`. Existing configs remain identical in behavior. | No change in behavior. |
| `TobyState` rows | **Untouched.** No columns added. | Toby configuration unchanged. |
| `GenerationJob` rows | **Extended.** Gains `content_format DEFAULT 'text_based'` and `text_video_data` (NULL for existing). | All existing jobs continue to process normally. |
| `ScheduledReel` rows | **Untouched.** No schema changes. `extra_data` continues to work as-is. | All scheduled publishes execute on time. |
| `NicheConfig` rows | **Extended.** Gains 4 optional columns with `DEFAULT '[]'` / `''`. | Existing Content DNA fully preserved. |
| Brand schedule offsets | **Untouched.** Clock offsets continue to apply to text_video slots. | Scheduling behavior unchanged. |
| Active publish queue | **Untouched.** Publishing pipeline checks `variant` on `ScheduledReel.extra_data`, not `content_format` on jobs. | Zero risk to in-flight publishes. |
| Billing/subscriptions | **Untouched.** Billing is format-agnostic. | No billing impact. |

### 28.5 Backward-Compatible Code Guards

Every existing code path that currently checks `content_type == "reel"` or `variant == "light"/"dark"` must handle the new `text_video_reel` / `text_video` values **without breaking the existing paths**. Here's the exact pattern:

**Pattern: Use `elif` chains, never change `else` behavior**

```python
# WRONG — changing else catches text_video in reel pipeline:
if plan.content_type == "reel":
    ...  # reel pipeline
else:
    ...  # post pipeline (text_video would land here!)

# RIGHT — explicit routing, unknown falls through to safe default:
if plan.content_type == "reel":
    ...  # existing reel pipeline (unchanged)
elif plan.content_type == "text_video_reel":
    ...  # new text_video pipeline
elif plan.content_type == "post":
    ...  # existing post pipeline (unchanged)
else:
    print(f"[TOBY] Unknown content_type: {plan.content_type}")
    return None  # safe no-op
```

**Files that MUST use this pattern (exhaustive list):**

| File | Line(s) | Current Code | Required Change |
|---|---|---|---|
| `app/services/toby/orchestrator.py` | L417 | `if plan.content_type == "reel"` / `else` | Add `elif plan.content_type == "text_video_reel"` before `else` |
| `app/services/toby/orchestrator.py` | L441-446 | `if plan.content_type == "reel"` → variant light/dark, `else` → "post" | Add `elif plan.content_type == "text_video_reel": variant = "text_video"` |
| `app/services/content/job_processor.py` | L585 | `if job.variant == "post"` / `else` (reel pipeline) | Add `elif job.variant == "text_video"` or check `content_format` |
| `app/services/toby/learning_engine.py` | L78 | `pool = REEL if content_type == "reel" else POST` | Add `if "text_video_reel": TEXT_VIDEO pool` before `else` |
| `app/services/toby/analysis_engine.py` | L66-70 | `if content_type == "post"` / `else` (reel scoring) | text_video uses reel scoring (views-based). Keep `else` as reel scoring. Add comment. |
| `app/services/publishing/scheduler.py` | L190-194 | Dedup: `variant in ("light","dark")` OR `variant == "post"` | Add `or (variant == "text_video" and ex_variant == "text_video")` |
| `app/core/platforms.py` | L62-65 | `CONTENT_TYPE_KEY_MAP = {"reel":"reels","post":"posts"}` | Add `"text_video_reel": "reels"` (text_video publishes to same platforms as reels) |
| `app/services/toby/buffer_manager.py` | L143 | `"content_type": "reel"` hardcoded | Read `TobyBrandConfig.reel_format`, set `"text_video_reel"` or `"reel"` |
| `app/services/toby/buffer_manager.py` | L182 | `s["content_type"] == "reel"` for stats | Count text_video_reel separately, or group with reels in breakdown |
| `app/services/analytics/metrics_collector.py` | L449 | Default `content_type="reel"` | text_video content gets `content_type="text_video_reel"` — safe, just a label |
| Frontend `Variant` type | `src/shared/types/index.ts` L15 | `'light' \| 'dark' \| 'post'` | Add `\| 'text_video'` |
| `src/pages/Scheduled.tsx` | L234-237 | Exhaustive light/dark/post switch | Add `text_video` case |
| `src/pages/Home.tsx` | L33-40 | `BASE_REEL_SLOTS` with light/dark | Format-aware per-brand (Section 26) |
| `src/pages/History.tsx` | L151 | Variant filter dropdown | Add `text_video` option |
| `src/pages/Calendar.tsx` | L177 | Default to 'light' for unknown | text_video would default to 'light' (harmless, slight visual mismatch) |
| `src/features/toby/components/TobyBufferStatus.tsx` | L174 | `slot.content_type === 'reel'` | Add `'text_video_reel'` handling |

### 28.6 Null-Safety Requirements

Every code path reading new columns MUST handle NULL (column exists but hasn't been populated):

```python
# content_format — NULL means text_based (all pre-existing jobs)
content_format = getattr(job, 'content_format', None) or 'text_based'

# reel_format — NULL means text_based (all pre-existing brand configs)
reel_format = (bc.reel_format if bc and bc.reel_format else "text_based")

# text_video_data — NULL means no text_video metadata
text_video_data = getattr(job, 'text_video_data', None)  # Could be None

# NicheConfig text_video columns — empty defaults
text_video_reel_examples = niche.text_video_reel_examples or []
text_video_story_niches = niche.text_video_story_niches or []
text_video_story_tone = niche.text_video_story_tone or ""
text_video_preferred_categories = niche.text_video_preferred_categories or []
```

### 28.7 Pre-Deployment Validation Checklist

Run these checks BEFORE deploying any stage:

```bash
# 1. Python syntax + imports (catches missing imports, circular deps)
python scripts/validate_api.py --imports

# 2. React hooks lint (catches hooks-after-return violations)
npx eslint src/ --rule 'react-hooks/rules-of-hooks: error'

# 3. TypeScript build (catches type errors from Variant extension)
npx tsc --noEmit

# 4. Full API validation (catches broken endpoints)
python scripts/validate_api.py
```

### 28.8 Post-Deployment Verification Script

Create `scripts/verify_text_video_migration.py` to verify the deployment is safe:

```python
"""
Post-deployment verification for TEXT-VIDEO migration.
Run after each deployment stage to verify data integrity.

Usage: railway run -- python scripts/verify_text_video_migration.py
  Or locally: python scripts/verify_text_video_migration.py
"""
import sys
from app.db_connection import SessionLocal
from sqlalchemy import text

def verify():
    db = SessionLocal()
    errors = []

    # 1. Check new columns exist
    for table, col in [
        ("generation_jobs", "content_format"),
        ("generation_jobs", "text_video_data"),
        ("toby_brand_config", "reel_format"),
        ("niche_config", "text_video_reel_examples"),
    ]:
        result = db.execute(text(
            f"SELECT 1 FROM information_schema.columns "
            f"WHERE table_name = '{table}' AND column_name = '{col}'"
        )).fetchone()
        if not result:
            errors.append(f"MISSING COLUMN: {table}.{col}")

    # 2. Check new tables exist
    for table in ["text_video_design", "text_video_story_pool"]:
        result = db.execute(text(
            f"SELECT 1 FROM information_schema.tables WHERE table_name = '{table}'"
        )).fetchone()
        if not result:
            errors.append(f"MISSING TABLE: {table}")

    # 3. Verify existing data NOT corrupted
    # All existing jobs should have content_format NULL or 'text_based'
    bad_jobs = db.execute(text(
        "SELECT count(*) FROM generation_jobs "
        "WHERE content_format IS NOT NULL AND content_format != 'text_based'"
    )).scalar()
    if bad_jobs > 0:
        errors.append(f"CORRUPTION: {bad_jobs} jobs have unexpected content_format values")

    # All existing brand configs should have reel_format NULL or 'text_based'
    bad_configs = db.execute(text(
        "SELECT count(*) FROM toby_brand_config "
        "WHERE reel_format IS NOT NULL AND reel_format != 'text_based'"
    )).scalar()
    if bad_configs > 0:
        errors.append(f"CORRUPTION: {bad_configs} brand configs have unexpected reel_format values")

    # 4. Verify Thompson Sampling data intact
    score_count = db.execute(text("SELECT count(*) FROM toby_strategy_scores")).scalar()
    print(f"  Thompson Sampling scores: {score_count} rows (preserved)")

    exp_count = db.execute(text("SELECT count(*) FROM toby_experiments")).scalar()
    print(f"  Active experiments: {exp_count} rows (preserved)")

    tag_count = db.execute(text("SELECT count(*) FROM toby_content_tags")).scalar()
    print(f"  Content tags: {tag_count} rows (preserved)")

    # 5. Verify scheduled queue intact
    pending = db.execute(text(
        "SELECT count(*) FROM scheduled_reels WHERE status = 'scheduled'"
    )).scalar()
    print(f"  Pending scheduled items: {pending} (preserved)")

    # 6. Check current Toby state for all users
    toby_users = db.execute(text(
        "SELECT count(*) FROM toby_state WHERE enabled = true"
    )).scalar()
    print(f"  Active Toby users: {toby_users}")

    db.close()

    if errors:
        print("\n❌ VERIFICATION FAILED:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        print("\n✅ All verification checks passed — safe to proceed")
        sys.exit(0)

if __name__ == "__main__":
    verify()
```

### 28.9 Rollback Plan Per Stage

| Stage | Rollback Procedure | Data Lost | Downtime |
|---|---|---|---|
| **Stage 1** (migrations) | `ALTER TABLE ... DROP COLUMN IF EXISTS` for each added column; `DROP TABLE IF EXISTS` for new tables | Zero (columns were empty/defaulted) | Zero (no app restart needed) |
| **Stage 2** (backend code) | `git revert` to previous commit → `railway redeploy` | Zero (no text_video content was created yet) | ~2 min (Railway redeploy) |
| **Stage 3** (frontend code) | `git revert` → rebuild → redeploy | Zero | ~2 min |
| **Stage 4** (feature enablement) | Set `text_video_reels = False` in feature flags, or user switches brand back to `text_based` | text_video content that was already generated stays in DB but stops being filled. Can be manually cleaned if needed. | Zero (flag change = immediate) |

### 28.10 What Happens to the Toby Tick During Deployment

Railway deployments use rolling restarts (new container starts, old container drains). During the ~30s overlap:
- **Old container** may run a Toby tick with old code → fine, no new columns referenced
- **New container** starts, APScheduler initializes → first tick runs new code against new schema → fine, migrations already ran

If a tick is running during container swap, it gets SIGTERM. APScheduler handles graceful shutdown. The next tick (5 min later on new container) picks up where it left off. Buffer state is in PostgreSQL, not in memory — no state loss.

### 28.11 Monitoring After Deployment

Watch for these in Railway logs (`railway logs -n 500 | grep -iE "error|crash|undefined"`) for 30 minutes after each stage:

```
# BAD — column doesn't exist (Stage 1 failed):
UndefinedColumn: column "content_format" of relation "generation_jobs" does not exist

# BAD — code tries to use text_video before feature is enabled:
[TOBY] Unknown content_type: text_video_reel

# GOOD — normal operation:
[TOBY] Buffer status: healthy (12/12 filled)
[TOBY] Tick complete for user_xxx
```

---

## 29. Complete Code Touchpoint Map

This is the **exhaustive reference** of every file that must be modified, why, and exactly how. Ordered by deployment stage.

### 29.1 Backend: Files That Route by content_type or variant

These are the most critical changes — an incorrect modification here crashes existing users.

#### `app/services/toby/orchestrator.py` — Content Generation Routing (Line ~417)

**Current code:**
```python
if plan.content_type == "reel":
    result = generator.generate_viral_content(...)
else:
    results = generator.generate_post_titles_batch(...)
    result = results[0] if results else None
```

**Required change:**
```python
if plan.content_type == "reel":
    result = generator.generate_viral_content(...)
elif plan.content_type == "text_video_reel":
    # NEW: Text-video pipeline (story discovery → polish → image source)
    result = _generate_text_video_content(db, plan, ctx, brand_config)
elif plan.content_type == "post":
    results = generator.generate_post_titles_batch(...)
    result = results[0] if results else None
else:
    print(f"[TOBY] Unknown content_type: {plan.content_type} — skipping")
    return None
```

**Why it's safe:** The `elif` chain preserves existing `"reel"` and `"post"` branches byte-for-byte. The new `"text_video_reel"` branch only executes when a brand's slot has that content_type (which requires `TobyBrandConfig.reel_format = "text_video"` — Stage 4).

#### `app/services/toby/orchestrator.py` — Variant Assignment (Line ~441)

**Current code:**
```python
if plan.content_type == "reel":
    sched_time = datetime.fromisoformat(plan.scheduled_time)
    slot_index = sched_time.hour // 4
    variant = "light" if slot_index % 2 == 0 else "dark"
else:
    variant = "post"
```

**Required change:**
```python
if plan.content_type == "text_video_reel":
    variant = "text_video"
elif plan.content_type == "reel":
    sched_time = datetime.fromisoformat(plan.scheduled_time)
    slot_index = sched_time.hour // 4
    variant = "light" if slot_index % 2 == 0 else "dark"
elif plan.content_type == "post":
    variant = "post"
else:
    variant = "light"  # safe fallback
```

**Why `text_video_reel` check is FIRST:** If we put it after `"reel"`, someone might future-edit the reel branch's else to catch text_video. Putting the most specific check first prevents that.

#### `app/services/content/job_processor.py` — Pipeline Routing (Line ~585)

**Current code:**
```python
if job.variant == "post":
    # carousel pipeline
else:
    # reel pipeline (light/dark)
```

**Required change:**
```python
content_format = getattr(job, 'content_format', None) or 'text_based'

if content_format == "text_video":
    return self._process_text_video_job(job)
elif job.variant == "post":
    return self._process_post_brand(job)
else:
    return self._process_reel_job(job)  # existing light/dark pipeline
```

**Why `content_format` not `variant`:** Using the new `content_format` column (with NULL→text_based fallback) is cleaner than overloading `variant`. All existing jobs have `content_format` NULL or `text_based`, so they hit the existing `"post"` / reel branches.

#### `app/services/publishing/scheduler.py` — Dedup Guard (Line ~190)

**Current code:**
```python
is_same_type = (
    (variant in ("light", "dark") and ex_variant in ("light", "dark"))
    or (variant == "post" and ex_variant == "post")
)
```

**Required change:**
```python
is_same_type = (
    (variant in ("light", "dark") and ex_variant in ("light", "dark"))
    or (variant == "post" and ex_variant == "post")
    or (variant == "text_video" and ex_variant == "text_video")
)
```

**Why this is critical:** Without this, two text_video reels for the same brand in the same time slot would BOTH get scheduled. This causes duplicate publishes to Instagram, which can trigger Instagram's spam detection and potentially restrict the account.

#### `app/core/platforms.py` — Content Type Key Map (Line ~62)

**Current:**
```python
CONTENT_TYPE_KEY_MAP = {"reel": "reels", "post": "posts"}
```

**Required:**
```python
CONTENT_TYPE_KEY_MAP = {"reel": "reels", "text_video_reel": "reels", "post": "posts"}
```

**Why:** text_video reels publish to the same platforms as regular reels (Instagram Reels, Facebook Reels, YouTube Shorts, TikTok). Without this mapping, `get_platforms_for_content_type()` can't look up the user's per-content-type platform preferences and falls through to "all connected platforms" — which might include platforms the user has disabled for reels.

#### `app/services/toby/analysis_engine.py` — Scoring Formula (Line ~66)

**Current:**
```python
primary = views if content_type == "reel" else reach
if content_type == "post":
    # carousel scoring...
else:
    # reel scoring...
```

**Required change:**
```python
primary = views if content_type in ("reel", "text_video_reel") else reach
if content_type == "post":
    # carousel scoring (unchanged)
else:
    # reel scoring (applies to both text_based reels AND text_video reels)
```

**Why:** text_video reels are published as Instagram Reels and have `views` as their primary metric, same as text_based reels. Using `reach` (carousel formula) would produce wrong Toby Scores and corrupt the learning engine's reward signals for text_video brands.

### 29.2 Backend: Files That Generate Slots

#### `app/services/toby/buffer_manager.py` — Slot Generation (Line ~143)

**Current:**
```python
for base_hour in BASE_REEL_HOURS[:brand_reel_slots]:
    ...
    all_slots.append({
        "brand_id": brand.id,
        "time": slot_time.isoformat(),
        "content_type": "reel",
        "filled": _slot_is_filled(brand.id, slot_time),
    })
```

**Required:**
```python
# Determine content_type from brand's reel format
reel_content_type = "text_video_reel" if (bc and bc.reel_format == "text_video") else "reel"

for base_hour in BASE_REEL_HOURS[:brand_reel_slots]:
    ...
    all_slots.append({
        "brand_id": brand.id,
        "time": slot_time.isoformat(),
        "content_type": reel_content_type,
        "filled": _slot_is_filled(brand.id, slot_time),
    })
```

**Why it's safe:** The `_slot_is_filled()` function uses fuzzy time matching against `ScheduledReel` rows (which store variant in `extra_data`, not content_type). It will correctly detect filled slots regardless of format — a slot at hour 8 is filled if ANY scheduled reel exists for that brand at ~8:00±15min. The `content_type` label on the slot dict only affects what pipeline Toby runs to fill empty slots.

#### `app/services/toby/buffer_manager.py` — Brand Breakdown Stats (Line ~182)

**Current:**
```python
brand_reels = sum(1 for s in brand_slots if s["content_type"] == "reel")
brand_posts = sum(1 for s in brand_slots if s["content_type"] == "post")
```

**Required:**
```python
brand_reels = sum(1 for s in brand_slots if s["content_type"] in ("reel", "text_video_reel"))
brand_posts = sum(1 for s in brand_slots if s["content_type"] == "post")
```

**Why:** The `reels` count in the breakdown should include text_video reels — they're still reels from a scheduling perspective. Displaying them separately in the breakdown is optional (nice to have) but not required for correctness.

### 29.3 Backend: Learning Engine

#### `app/services/toby/learning_engine.py` — Personality Pool Selection (Line ~78)

**Current:**
```python
def get_personality_prompt(content_type: str, personality_id: str) -> str:
    pool = REEL_PERSONALITIES if content_type == "reel" else POST_PERSONALITIES
    return pool.get(personality_id, "")
```

**Required:**
```python
def get_personality_prompt(content_type: str, personality_id: str) -> str:
    if content_type == "text_video_reel":
        pool = TEXT_VIDEO_PERSONALITIES
    elif content_type == "reel":
        pool = REEL_PERSONALITIES
    else:
        pool = POST_PERSONALITIES
    return pool.get(personality_id, "")
```

**Why it's safe:** A `personality_id` like `"edu_calm"` would return `""` from `TEXT_VIDEO_PERSONALITIES.get("edu_calm", "")`. This means if somehow a text_video plan had a text_based personality (impossible in normal flow, but defensive), it would just get an empty personality prompt — the content generator would still work, just without a personality modifier. No crash.

#### `app/services/toby/learning_engine.py` — Strategy Selection (Line ~85)

**Current:**
```python
personality = _pick_dimension(
    db, user_id, brand_id, content_type, "personality",
    list(REEL_PERSONALITIES.keys() if content_type == "reel" else POST_PERSONALITIES.keys()),
    ...
)
```

**Required:** See Section 22 for the complete implementation. Key point: the `_pick_dimension()` function already accepts an `options` list. By passing `list(TEXT_VIDEO_PERSONALITIES.keys())` when `content_type == "text_video_reel"`, Thompson Sampling automatically operates in the text_video personality space. All the sampling math (Beta distributions, alpha/beta params) is content_type-keyed in `TobyStrategyScore`, so text_video data never mixes with text_based data.

### 29.4 Frontend: Type System + variant Handling

#### `src/shared/types/index.ts` — Variant Type

**Current:**
```typescript
export type Variant = 'light' | 'dark' | 'post'
```

**Required:**
```typescript
export type Variant = 'light' | 'dark' | 'post' | 'text_video'
```

**Impact:** TypeScript compiler will flag any exhaustive switch/conditional that doesn't handle `'text_video'`. This is by design — it forces the developer to explicitly handle the new variant in every location, ensuring nothing is missed.

#### `src/pages/Scheduled.tsx` — Slot Placement (Line ~234)

**Current:**
```typescript
if (variant === 'post') return
if (variant === 'light') {
    lightSlots.delete(nearestLight)
} else if (variant === 'dark') {
    darkSlots.delete(nearestDark)
}
```

**Required:**
```typescript
if (variant === 'post') return
if (variant === 'text_video') {
    // Text-video reels occupy any available reel slot
    // (no light/dark distinction)
    const nearest = findNearestSlot(hour, [...lightSlots, ...darkSlots])
    if (nearest !== undefined) {
        lightSlots.delete(nearest) || darkSlots.delete(nearest)
    }
    return
}
if (variant === 'light') {
    lightSlots.delete(nearestLight)
} else if (variant === 'dark') {
    darkSlots.delete(nearestDark)
}
```

**Why:** text_video reels occupy a reel slot (they're still reels) but don't have a light/dark distinction. When displaying them on the timeline, they should fill whatever reel slot they're closest to.

### 29.5 Existing Code Paths That Need NO Changes

These are important to document — confirming what we DON'T touch reduces risk:

| File | Why No Changes |
|---|---|
| `app/services/publishing/social_publisher.py` | Publishes based on platform + media paths. Doesn't check variant or content_type. text_video produces video+thumbnail like regular reels. |
| `app/services/media/video_generator.py` | Only used by text_based reels. text_video uses its own `slideshow_compositor.py`. |
| `app/services/media/image_generator.py` | Only used by text_based reels. text_video uses its own `thumbnail_compositor.py`. |
| `app/services/toby/agents/critic.py` | Quality scoring uses content_type for prompt differences. Falls through to reel scoring for unknowns — safe. |
| `app/services/toby/agents/creator.py` | Token limits differ by content_type. text_video_reel would get reel limits (1200 tokens) — reasonable. |
| `app/services/toby/memory/` | Memory system stores observations keyed by content. Format-agnostic. |
| `app/models/brands.py` | Brand model unchanged. `reel_format` lives on `TobyBrandConfig`, not `Brand`. |
| `app/models/scheduling.py` | `ScheduledReel` schema unchanged. `extra_data` is untyped JSON — stores whatever we put in it. |
| Billing (`app/api/billing/`) | Billing is format-agnostic. No content_type checks. |
| OAuth routes | Platform connections are format-agnostic. |
| Legal pages | TEXT-VIDEO doesn't add new platforms, so no legal page updates needed. |

---

## 30. Scalability & Resilience Architecture

### 30.1 Design Principles

The text_video feature must not degrade the existing system's performance or reliability. These principles guide every design decision:

1. **Additive, not transformative.** New tables, new columns, new files. Never rename existing columns, change column types, or alter existing indexes.
2. **Content-type as namespace.** The `content_type` string acts as a namespace that isolates data, logic, and pipelines. Adding a format = adding a namespace.
3. **Fail-closed for unknown formats.** If code encounters a `content_type` it doesn't recognize, it logs a warning and skips — never crashes, never runs wrong pipeline.
4. **Horizontal format scaling.** The pattern for adding format N+1 is identical to adding format N. No architectural changes needed — just new personality pool, new pipeline, new content_type string.
5. **Resource isolation.** text_video generation (web API calls, image downloads, FFmpeg slideshow) is more resource-intensive than text_based. It must not starve text_based generation.

### 30.2 Database Scalability

#### Current Load Profile
- ~5 active Toby users, ~15 brands total
- ~6 reels + 2 posts per brand per day = ~120 scheduled items/day
- ~30 `TobyStrategyScore` rows per brand (5 dimensions × 5-6 options)
- Single Supabase PostgreSQL instance (shared compute)

#### Projected Load with text_video
- Same slot count per brand (6 reels/day), but some are text_video
- Additional tables: `text_video_story_pool` (10-50 rows/user/week), `text_video_design` (1 row/user)
- Additional columns on `generation_jobs`: `content_format` (indexed), `text_video_data` (JSONB, not indexed)
- Additional `TobyStrategyScore` rows: +30 per brand using text_video (6 dimensions × 5 options)

#### Index Strategy for text_video

```sql
-- Already in migration: index for content_format filtering
CREATE INDEX IF NOT EXISTS ix_generation_jobs_content_format
    ON generation_jobs (content_format);

-- Story pool: user + status lookup (hot path: "find available stories")
CREATE INDEX IF NOT EXISTS ix_story_pool_user_status
    ON text_video_story_pool (user_id, status);

-- Story pool: niche + status (for category-based story selection)
CREATE INDEX IF NOT EXISTS ix_story_pool_niche
    ON text_video_story_pool (user_id, niche, status);

-- No index on text_video_data (JSONB) — it's metadata, not queried
-- No index on text_video_design (1 row/user, UNIQUE constraint is enough)
```

#### Story Pool Cleanup (Prevents Unbounded Growth)

The `text_video_story_pool` table accumulates stories. Without cleanup, it grows indefinitely. Add a cleanup job:

```python
# Run weekly (or on each Toby tick, rate-limited)
def cleanup_expired_stories(db: Session, user_id: str):
    """Remove stories older than 30 days to prevent unbounded table growth."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    db.query(StoryPool).filter(
        StoryPool.user_id == user_id,
        StoryPool.created_at < cutoff,
    ).delete()
    db.commit()
```

### 30.3 API Rate Limit Protection

text_video generation calls 3-4 external APIs per reel (NewsAPI, Tavily, SerpAPI, Gemini). Toby generating 6 text_video reels/day per brand = 18-24 API calls/brand/day. With multiple brands, this can hit free tier limits quickly.

#### Rate Limit Strategy

```python
# Per-user daily limits (enforce in StoryDiscoverer)
TEXT_VIDEO_API_LIMITS = {
    "newsapi": 80,        # Free tier: 100/day, reserve 20 for semi-auto
    "tavily": 30,         # Free tier: 33/day (1000/month ÷ 30)
    "serpapi": 80,        # Free tier: 100/month ÷ 30 ≈ 3/day. Paid: 5000/mo
    "gemini": 50,         # Free tier: generous. Track for cost control.
}

# Track in memory (per-process, resets on deploy — acceptable)
_api_call_counts: dict[str, int] = {}

def check_api_budget(api_name: str) -> bool:
    """Return True if we're within daily budget for this API."""
    today_key = f"{api_name}:{datetime.now().strftime('%Y-%m-%d')}"
    count = _api_call_counts.get(today_key, 0)
    limit = TEXT_VIDEO_API_LIMITS.get(api_name, 100)
    return count < limit

def record_api_call(api_name: str):
    today_key = f"{api_name}:{datetime.now().strftime('%Y-%m-%d')}"
    _api_call_counts[today_key] = _api_call_counts.get(today_key, 0) + 1
```

#### Graceful Degradation

If an API is exhausted:
1. **NewsAPI exhausted** → Tavily becomes primary for fresh stories. If both exhausted → DeepSeek generates from training data (evergreen mode).
2. **SerpAPI exhausted** → Pexels becomes primary for images. If both exhausted → Gemini AI generates all images.
3. **Gemini exhausted** → All images sourced from web search + Pexels. If all exhausted → solid color backgrounds (degraded but functional).
4. **All APIs exhausted** → text_video generation skips for this tick. Toby logs: `[TOBY] text_video APIs exhausted — skipping generation for {brand}`. Buffer health drops to "low", next tick retries.

This ensures text_video failures never cascade into text_based failures. They're isolated pipelines.

### 30.4 Resource Isolation: text_video vs text_based

#### CPU/Memory Concern

text_video FFmpeg slideshow composition is heavier than text_based static image → video:
- **text_based:** 1 Pillow render (~0.5s) + 1 FFmpeg static video (~3s) = ~4s total
- **text_video:** 3-4 image downloads (~2s) + 1 Pillow text overlay (~0.5s) + 1 FFmpeg crossfade composition (~8-12s) = ~12-15s total

On Railway's single-container setup, a text_video render blocks the event loop for ~15s. If Toby is generating 3 text_video reels at once (multiple brands), that's ~45s of blocking.

#### Mitigation: Sequential Per-Brand, Max Concurrent

The content planner already limits to `max_plans = 6` per tick and round-robins across brands. For text_video, add:

```python
# In orchestrator._execute_content_plan():
MAX_TEXT_VIDEO_PER_TICK = 2  # Don't generate more than 2 text_video reels per tick

# Count text_video plans already executed this tick
if plan.content_type == "text_video_reel":
    if self._text_video_count >= MAX_TEXT_VIDEO_PER_TICK:
        print(f"[TOBY] text_video limit reached ({MAX_TEXT_VIDEO_PER_TICK}/tick) — deferring")
        return None  # Will be picked up next tick
    self._text_video_count += 1
```

This ensures text_video never starves text_based brands of their generation slots.

### 30.5 Fault Tolerance: What If text_video Crashes?

#### Story Discovery API Failures

```python
class StoryDiscoverer:
    async def discover_stories(self, ...):
        try:
            stories = await self._search_newsapi(...)
        except Exception as e:
            print(f"[StoryDiscoverer] NewsAPI failed: {e}")
            stories = []

        if not stories:
            try:
                stories = await self._search_tavily(...)
            except Exception as e:
                print(f"[StoryDiscoverer] Tavily failed: {e}")
                stories = []

        if not stories:
            # Last resort: no external API, generate from DeepSeek training data
            stories = [self._generate_evergreen_story(niche)]

        return stories
```

#### Image Sourcing Failures

```python
class ImageSourcer:
    def source_images_batch(self, plans: list[ImagePlan]) -> list[Path]:
        results = []
        for plan in plans:
            path = None
            try:
                path = self._source_single(plan)
            except Exception as e:
                print(f"[ImageSourcer] Failed for '{plan.query}': {e}")

            if not path and plan.fallback_query:
                try:
                    path = self._source_single(ImagePlan("web_search", plan.fallback_query))
                except Exception:
                    pass

            if not path:
                # Generate a gradient background as last resort
                path = self._generate_fallback_gradient(plan.query)

            results.append(path)
        return results
```

#### FFmpeg Slideshow Failures

```python
class SlideshowCompositor:
    def compose_reel(self, ...):
        try:
            return self._compose_with_ffmpeg(...)
        except subprocess.TimeoutExpired:
            print("[SlideshowCompositor] FFmpeg timed out — retrying with simpler settings")
            return self._compose_simple_fallback(...)  # single image + text, no crossfade
        except Exception as e:
            print(f"[SlideshowCompositor] FFmpeg failed: {e}")
            # Fall back to static image (same as text_based)
            return self._compose_static_fallback(...)
```

**Key principle:** text_video failures produce degraded content (fewer images, simpler transitions, static instead of slideshow) rather than no content. Toby's buffer stays healthy.

### 30.6 Horizontal Scaling Readiness

The current architecture is single-container. If ViralToby grows to 50+ users with text_video:

| Bottleneck | Current | Scaled Solution |
|---|---|---|
| FFmpeg rendering | Single process, Railway container | Move rendering to background worker (Bull queue + separate Railway service). Job processor sends to queue, worker renders, uploads result. |
| External API calls | In-process, blocking | Move to async task queue. Story discovery + image sourcing run as background jobs. |
| Toby tick loop | APScheduler in-process | Extract to dedicated scheduler service. Main API becomes stateless. Tick loop runs on separate container. |
| Database | Single Supabase instance | Supabase auto-scales on paid plans. Add read replica for analytics queries if needed. |
| Story pool | Per-user rows in single table | Partition by user_id if row count exceeds 1M. Or move to Redis for hot cache + PostgreSQL for cold storage. |

These are **future optimizations** — not needed for MVP. The current architecture handles 10-20 users with text_video without any scaling changes. The important thing is that the code is structured so these changes are possible without rewriting the feature.

### 30.7 Monitoring & Alerting Additions

Add these log markers for production monitoring:

```python
# In each text_video pipeline step, emit structured logs:
print(f"[TEXT_VIDEO] story_discover brand={brand_id} api={api_name} stories_found={len(stories)}", flush=True)
print(f"[TEXT_VIDEO] story_polish brand={brand_id} category={category} duration_ms={elapsed}", flush=True)
print(f"[TEXT_VIDEO] image_source brand={brand_id} images_found={found}/{total} fallbacks={fallback_count}", flush=True)
print(f"[TEXT_VIDEO] slideshow_compose brand={brand_id} images={len(images)} duration_ms={elapsed}", flush=True)
print(f"[TEXT_VIDEO] thumbnail_compose brand={brand_id} duration_ms={elapsed}", flush=True)
print(f"[TEXT_VIDEO] complete brand={brand_id} job_id={job_id} total_ms={total_elapsed}", flush=True)
```

Filter in Railway logs:
```bash
railway logs -n 500 | grep "\[TEXT_VIDEO\]"
```

This gives per-step visibility into text_video performance without adding a logging framework.

---

## 31. Job Detail Page for text_video Jobs

### Current State

The existing job detail page lives at [src/pages/JobDetail.tsx](../src/pages/JobDetail.tsx), routed at `/job/:jobId`. It already handles two formats:
- **Reels** (variant `"light"` / `"dark"`) — renders inline with video preview, content lines, music section, per-brand cards with schedule/regenerate/download actions
- **Posts** (variant `"post"`) — delegates to [src/pages/PostJobDetail.tsx](../src/pages/PostJobDetail.tsx) with carousel previews, Konva canvas rendering, font controls

The routing logic at line ~455:
```typescript
if (job.variant === 'post') return <PostJobDetail job={job} ... />
// else: render reel detail inline
```

text_video jobs need their own detail view because they have fundamentally different content (stories with source attribution, multi-image slideshows, composed thumbnails) that the existing reel detail view can't display.

### Routing Change

Extend the variant routing in `JobDetailPage`:

```typescript
if (job.variant === 'post') return <PostJobDetail job={job} ... />
if (job.variant === 'text_video') return <TextVideoJobDetail job={job} ... />
// else: existing reel detail (light/dark)
```

### New Component: `TextVideoJobDetail`

**File:** `src/pages/TextVideoJobDetail.tsx`

This component displays all the unique data a text_video job produces. The job's `text_video_data` JSON column contains the full pipeline output:

```typescript
interface TextVideoData {
  story: {
    source_url: string        // Original article URL
    source_name: string       // "BBC", "Reuters", etc.
    category: string          // "science", "business", etc.
    original_headline: string // Raw headline from API
    discovered_at: string     // ISO timestamp
  }
  reel_text: string[]         // 3-5 lines of polished reel text
  thumbnail_title: string     // Bold title for thumbnail
  images: {
    url: string               // Source URL or local path
    source: string            // "serpapi", "pexels", "gemini", "upload"
    query: string             // Search query used
    alt_text: string          // Accessibility description
  }[]
  design: {                   // Snapshot of design settings at generation time
    text_font: string
    text_size: number
    image_duration: number
    thumbnail_layout: string
  }
}
```

### UI Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to History                                    Job #GEN-1234 │
│                                                                      │
│  ┌─ Status ────────────────────────────────────────────────────────┐ │
│  │ ✅ Completed  •  Created 2h ago by 🤖 Toby  •  text_video      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Story Source ──────────────────────────────────────────────────┐ │
│  │ 📰 "Pentagon summons Anthropic CEO for AI briefing"             │ │
│  │    BBC News  •  5 hours ago  •  Category: Technology            │ │
│  │    🔗 View original article                                     │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Reel Text ─────────────────────────────────────────────────────┐ │
│  │ "The Pentagon just summoned the CEO of Anthropic for an         │ │
│  │  emergency AI briefing."                                        │ │
│  │ "They're worried their own AI systems can't keep up with        │ │
│  │  what Silicon Valley is building."                               │ │
│  │ "When the military calls a startup founder to the Pentagon,     │ │
│  │  you know something big is happening."                           │ │
│  │                                                                  │ │
│  │ [✏️ Edit Text]  [🔄 Regenerate Text]                            │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Slideshow Images ──────────────────────────────────────────────┐ │
│  │ ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │ │
│  │ │          │  │          │  │          │  │          │         │ │
│  │ │  Image 1 │  │  Image 2 │  │  Image 3 │  │  Image 4 │         │ │
│  │ │          │  │          │  │          │  │          │         │ │
│  │ └──────────┘  └──────────┘  └──────────┘  └──────────┘         │ │
│  │ serpapi       pexels        gemini         serpapi               │ │
│  │ "pentagon"    "AI robot"   AI-generated   "military"            │ │
│  │                                                                  │ │
│  │ [🔄 Regenerate Images]  [🔀 Swap Image]  [📤 Upload Replace]   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Composed Thumbnail ────────────────────────────────────────────┐ │
│  │ ┌──────────────────┐                                            │ │
│  │ │                  │  Title: "PENTAGON SUMMONS AI CEO"           │ │
│  │ │   [9:16 thumb    │  Layout: image_top_text_bottom              │ │
│  │ │    preview]      │  Font: Poppins-Bold 72px                    │ │
│  │ │                  │                                             │ │
│  │ └──────────────────┘  [🔄 Regenerate Thumbnail]                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Per-Brand Cards ───────────────────────────────────────────────┐ │
│  │ (Same pattern as existing reel detail — per-brand status,       │ │
│  │  video preview, schedule/dismiss/regenerate, download,           │ │
│  │  caption copy, platform publish results)                         │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Music ─────────────────────────────────────────────────────────┐ │
│  │ (Same as existing — music source selector, re-roll button)       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Quick Schedule ────────────────────────────────────────────────┐ │
│  │ (Same as existing — auto schedule + custom date picker)          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Partial Retry Buttons

text_video jobs have a multi-step pipeline. When a step fails, the user should be able to retry JUST that step without re-running the entire pipeline. This is a key UX improvement over text_based reels where the only option is "regenerate everything."

| Button | What It Does | API Call | When Visible |
|---|---|---|---|
| **Regenerate Text** | Re-runs StoryPolisher on the same source story. Produces new reel text + thumbnail title. Images unchanged. | `POST /api/text-video/jobs/{id}/regenerate-text` | Always (on completed or failed jobs) |
| **Regenerate Images** | Re-runs ImageSourcer with same/edited search queries. Video recomposed with new images. Text unchanged. | `POST /api/text-video/jobs/{id}/regenerate-images` | Always |
| **Regenerate Thumbnail** | Re-composites the thumbnail using current images + title. Useful if user edited the title. | `POST /api/text-video/jobs/{id}/regenerate-thumbnail` | Always |
| **Swap Image** | Replace a single image (by index). Opens a mini search/upload modal. Recomposes video after swap. | `PUT /api/text-video/jobs/{id}/images/{index}` | Per-image hover action |
| **Retry Failed** | If job failed mid-pipeline, resumes from the failed step (stored in `current_step`). | `POST /api/text-video/jobs/{id}/retry` | Only when `status === 'failed'` |

### Backend Endpoints for Partial Retry

```python
# app/api/content/text_video_routes.py

@router.post("/jobs/{job_id}/regenerate-text")
async def regenerate_text(job_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    """Re-run StoryPolisher. Keep same source story + images."""
    job = _get_job_or_404(db, job_id, user.id)
    _assert_text_video_job(job)
    tv_data = job.text_video_data or {}
    story = tv_data.get("story", {})
    # Re-polish the story
    polisher = StoryPolisher()
    result = await polisher.polish(story["original_headline"], story.get("source_url"))
    tv_data["reel_text"] = result["reel_text"]
    tv_data["thumbnail_title"] = result["thumbnail_title"]
    job.text_video_data = tv_data
    flag_modified(job, "text_video_data")
    db.commit()
    return {"reel_text": result["reel_text"], "thumbnail_title": result["thumbnail_title"]}

@router.post("/jobs/{job_id}/regenerate-images")
async def regenerate_images(job_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    """Re-run ImageSourcer. Keep same text. Recompose video."""
    job = _get_job_or_404(db, job_id, user.id)
    _assert_text_video_job(job)
    # ... source new images, recompose slideshow, update brand_outputs

@router.put("/jobs/{job_id}/images/{index}")
async def swap_image(job_id: str, index: int, body: SwapImageRequest,
                     user=Depends(get_current_user), db=Depends(get_db)):
    """Replace a single slideshow image by index and recompose."""
    job = _get_job_or_404(db, job_id, user.id)
    _assert_text_video_job(job)
    # ... replace image at index, recompose video for all brands

@router.post("/jobs/{job_id}/regenerate-thumbnail")
async def regenerate_thumbnail(job_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    """Recomposite thumbnail with current title + images."""
    job = _get_job_or_404(db, job_id, user.id)
    _assert_text_video_job(job)
    # ... recompose thumbnail for all brands
```

### File Changes

**New files:**
- `src/pages/TextVideoJobDetail.tsx` — Main detail component
- `src/features/reels/components/StorySourceCard.tsx` — Story attribution display
- `src/features/reels/components/SlideshowImageGrid.tsx` — Image grid with swap/replace actions
- `src/features/reels/components/ThumbnailPreview.tsx` — Composed thumbnail preview

**Modified files:**
- `src/pages/JobDetail.tsx` — Add `text_video` variant routing (one `if` statement)
- `src/shared/types/index.ts` — Add `TextVideoData` interface to `Job` type
- `app/api/content/text_video_routes.py` — Add partial retry endpoints (4 new endpoints)

### Data Flow

The `text_video_data` JSON column on `GenerationJob` is the **single source of truth** for all text_video-specific data. The frontend reads it via the existing `GET /api/content/jobs/{id}` endpoint — no new fetch endpoint needed. The partial retry endpoints mutate `text_video_data` and return the updated slice.

---

## 32. Analytics Page: Format Filter & Comparison

### The Problem

The current Analytics page ([src/pages/Analytics.tsx](../src/pages/Analytics.tsx)) shows all content together with filters for brand, platform, and time range. There is NO content format filter.

With two fundamentally different reel formats (text_based: personality-driven viral hooks; text_video: news/story-driven slideshows), mixing them in aggregate metrics is misleading:
- text_video reels may have higher view counts (news is broadly appealing) but lower saves (less "reference" value)
- text_based reels may have lower views but higher save rates and follower conversion
- Comparing blended averages hides these insights

Users need to see format-level performance to make informed decisions about which format to invest in per brand.

### Solution: Format Filter Chip + Format Comparison Card

Two additions to the existing Analytics page — minimal footprint, maximum insight:

#### 1. Format Filter Chip (in existing filter bar)

Add a filter chip next to the existing Brand / Platform / Time Range filters:

```
┌──────────────────────────────────────────────────────────────┐
│  Brand: [All ▼]  Platform: [All ▼]  Time: [30 days ▼]       │
│  Format: [All ▼ | Text Reels | Text-Video Reels]             │
└──────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
// In Analytics.tsx, add to existing filter state:
type FormatFilter = 'all' | 'text_based' | 'text_video'
const [formatFilter, setFormatFilter] = useState<FormatFilter>('all')

// Filter logic applied to posts data:
const filteredPosts = posts.filter(p => {
  if (formatFilter === 'all') return true
  if (formatFilter === 'text_based') return p.content_type === 'reel'
  if (formatFilter === 'text_video') return p.content_type === 'text_video_reel'
  return true
})
```

The `content_type` field already exists on `post_performance` rows (it's `"reel"` for text_based, `"post"` for carousels). text_video rows will have `content_type = "text_video_reel"`. The filter simply narrows which rows feed the aggregate calculations.

**Filter chips UI:**

```typescript
<div className="flex gap-2">
  <button
    onClick={() => setFormatFilter('all')}
    className={cn(
      'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
      formatFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    )}
  >
    All Formats
  </button>
  <button
    onClick={() => setFormatFilter('text_based')}
    className={cn(
      'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
      formatFilter === 'text_based' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
    )}
  >
    🎬 Text Reels
  </button>
  <button
    onClick={() => setFormatFilter('text_video')}
    className={cn(
      'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
      formatFilter === 'text_video' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
    )}
  >
    📰 Text-Video Reels
  </button>
</div>
```

#### 2. Format Comparison Card (new card in Overview tab)

Add a new card below the existing trend chart that shows side-by-side format performance:

```
┌─ Format Performance Comparison ──────────────────────────────────┐
│                                                                   │
│  ┌─────────────────────────┐  ┌─────────────────────────────────┐│
│  │ 🎬 Text Reels           │  │ 📰 Text-Video Reels            ││
│  │                         │  │                                 ││
│  │ Avg Views:   12,400     │  │ Avg Views:   18,200  ↑47%       ││
│  │ Avg Likes:   890        │  │ Avg Likes:   1,240   ↑39%       ││
│  │ Avg Saves:   320        │  │ Avg Saves:   180     ↓44%       ││
│  │ Engagement:  4.2%       │  │ Engagement:  3.8%    ↓10%       ││
│  │ Posts:       42         │  │ Posts:       18                  ││
│  │                         │  │                                 ││
│  │ Best: "10 habits..."    │  │ Best: "Pentagon..."             ││
│  └─────────────────────────┘  └─────────────────────────────────┘│
│                                                                   │
│  💡 Text-Video reels get 47% more views but Text Reels have      │
│     78% more saves. Consider text_video for reach, text_based     │
│     for engagement depth.                                         │
└───────────────────────────────────────────────────────────────────┘
```

**The insight line** at the bottom is generated by comparing the two sides. Simple heuristic:

```typescript
function getFormatInsight(textBased: FormatStats, textVideo: FormatStats): string {
  if (!textVideo.count || !textBased.count) return ''  // Need data for both

  const viewsDiff = ((textVideo.avgViews - textBased.avgViews) / textBased.avgViews * 100).toFixed(0)
  const savesDiff = ((textVideo.avgSaves - textBased.avgSaves) / textBased.avgSaves * 100).toFixed(0)

  if (Number(viewsDiff) > 20 && Number(savesDiff) < -20) {
    return `Text-Video gets ${viewsDiff}% more views but Text Reels have ${Math.abs(Number(savesDiff))}% more saves. Use text_video for reach, text_based for depth.`
  }
  // ... other comparison patterns
  return ''
}
```

**This card only appears when the user has published content in BOTH formats.** If all content is text_based (the default), the card is hidden — no visual clutter for users who haven't adopted text_video yet.

#### 3. Format Label on Posts Tab

The existing Posts tab already shows `p.content_type` as a label. Extend it with a visual badge:

```typescript
// In the posts table row:
<span className={cn(
  'px-2 py-0.5 rounded-full text-xs font-medium',
  p.content_type === 'text_video_reel'
    ? 'bg-amber-100 text-amber-800'
    : p.content_type === 'reel'
      ? 'bg-indigo-100 text-indigo-800'
      : 'bg-purple-100 text-purple-800'
)}>
  {p.content_type === 'text_video_reel' ? '📰 Text-Video'
   : p.content_type === 'reel' ? '🎬 Text Reel'
   : '🖼️ Post'}
</span>
```

#### 4. Backend: content_type in Analytics V2

The analytics V2 API ([app/api/analytics/v2_routes.py](../app/api/analytics/v2_routes.py)) aggregates data from `post_performance`. The `content_type` column already stores `"reel"` or `"post"`. text_video content will have `"text_video_reel"`.

**No backend changes needed for filtering** — the frontend filters rows client-side from the existing response. The V2 aggregate endpoint already includes `content_type` in the breakdown.

**Optional backend enhancement** (nice-to-have, not blocking): Add a `?format=text_video_reel` query param to the aggregate endpoint to filter server-side. This matters for performance only when a user has 1000+ posts.

### File Changes

**Modified files:**
- `src/pages/Analytics.tsx` — Add format filter state, filter chips, format comparison card, format badges on posts table

**New files:**
- `src/features/analytics/FormatComparisonCard.tsx` — The side-by-side comparison card component

### Backward Compatibility

All existing `content_type = "reel"` data continues to display as "🎬 Text Reels". The format filter defaults to "All" — existing behavior unchanged until user explicitly filters. The comparison card is hidden until text_video data exists.

---

## 33. Calendar.tsx: Visual Format Differentiation

### The Problem

The current Calendar ([src/pages/Calendar.tsx](../src/pages/Calendar.tsx)) shows scheduled content with minimal visual differentiation:
- **Status dots:** green (published), red (failed), yellow (scheduled) — these indicate status, not format
- **Background color:** blue-50 (user-created) vs gray-100 (Toby-created) — this indicates creator, not format
- **Content type filter:** Chips for `🎬 Reels` / `🖼️ Posts` — but no text_video distinction
- **Day detail modal:** Shows video player for reels, carousel for posts — aspect ratio varies by variant

With text_video reels in the mix, a calendar cell showing "14:00 BrandX" and "16:00 BrandX" gives no clue which is text_based and which is text_video. Users need to know at a glance.

### Solution: Three-Layer Visual System

#### Layer 1: Format Icon in Calendar Cells

Add a small format icon before the time in each cell preview:

```
┌─────────────┐
│  Mon 15      │
│  ●3          │  ← count badge (unchanged)
│              │
│ 🎬 08:00 Bx │  ← text_based reel (existing film icon)
│ 📰 12:00 Bx │  ← text_video reel (newspaper icon)
│ 🖼️ 16:00 Bx │  ← post (existing frame icon)
└─────────────┘
```

**Implementation** — in the cell preview rendering (around line 530):

```typescript
function getFormatIcon(post: ScheduledPost): string {
  const variant = post.metadata?.variant
  if (variant === 'text_video') return '📰'
  if (variant === 'post') return '🖼️'
  return '🎬'  // light, dark = text_based reels
}

// In the cell preview item:
<span className="text-xs text-gray-500 truncate">
  {getFormatIcon(post)} {formatTime(post.time)} {post.brand_name}
</span>
```

#### Layer 2: Format-Colored Left Border

Add a 2px left border to each calendar cell preview item, colored by format:

```typescript
function getFormatBorderClass(post: ScheduledPost): string {
  const variant = post.metadata?.variant
  if (variant === 'text_video') return 'border-l-2 border-l-amber-500'
  if (variant === 'post') return 'border-l-2 border-l-purple-500'
  return 'border-l-2 border-l-indigo-500'  // text_based reels
}
```

This creates a subtle but scannable color pattern:
- **Indigo** left border = text_based reel (matches existing reel filter chip color)
- **Amber** left border = text_video reel (matches analytics format badge)
- **Purple** left border = post (matches existing post filter chip color)

#### Layer 3: Extended Content Type Filter

Update the existing `ContentTypeFilter` to add text_video:

**Current:**
```typescript
type ContentTypeFilter = 'all' | 'reels' | 'posts'
```

**New:**
```typescript
type ContentTypeFilter = 'all' | 'text_reels' | 'text_video_reels' | 'posts'
```

**Filter chips:**
```
[All] [🎬 Text Reels] [📰 Text-Video] [🖼️ Posts]
```

**Filter logic update** (around line 177):

```typescript
const filtered = allPosts.filter(post => {
  const variant = post.metadata?.variant
  if (contentTypeFilter === 'all') return true
  if (contentTypeFilter === 'text_reels') return variant === 'light' || variant === 'dark'
  if (contentTypeFilter === 'text_video_reels') return variant === 'text_video'
  if (contentTypeFilter === 'posts') return variant === 'post'
  return true
})
```

#### Day Detail Modal Updates

When clicking a calendar cell to open the day detail, text_video items show:

```typescript
// Around line 627 — aspect ratio handling:
const isPost = selectedPost?.metadata?.variant === 'post'
const isTextVideo = selectedPost?.metadata?.variant === 'text_video'
// text_video uses 9:16 like regular reels
const aspectClass = isPost ? 'aspect-[4/5]' : 'aspect-[9/16]'
```

**Additional detail in modal for text_video:**
```typescript
{isTextVideo && selectedPost?.metadata?.story_source && (
  <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
    <span>📰</span>
    <span>Source: {selectedPost.metadata.story_source}</span>
    {selectedPost.metadata.story_url && (
      <a href={selectedPost.metadata.story_url} target="_blank" rel="noopener noreferrer"
         className="text-blue-500 hover:underline">View article ↗</a>
    )}
  </div>
)}
```

### Color System Consistency

The format color assignments are consistent across all pages:

| Format | Primary Color | Usage |
|---|---|---|
| text_based reels | **Indigo** (`indigo-500/600`) | Calendar border, filter chip, analytics badge, scheduled page |
| text_video reels | **Amber** (`amber-500/600`) | Calendar border, filter chip, analytics badge, scheduled page |
| posts (carousel) | **Purple** (`purple-500/600`) | Calendar border, filter chip, analytics badge, scheduled page |

This is NOT brand color (which comes from `brands.colors.primary` in the DB). This is format identity — static, consistent, recognizable across the entire UI.

### Scheduled.tsx Impact

The Scheduled page ([src/pages/Scheduled.tsx](../src/pages/Scheduled.tsx)) also needs the same visual treatment. Apply the same icon + border pattern to scheduled content items. The filter already exists — just extend it from `reels | posts` to `text_reels | text_video_reels | posts`.

### File Changes

**Modified files:**
- `src/pages/Calendar.tsx` — Format icons, colored borders, extended content type filter, day detail modal text_video handling
- `src/pages/Scheduled.tsx` — Same visual treatment (icon, border, filter extension)
- `src/pages/History.tsx` — Add format badge to job list items ("📰 Text-Video" vs "🎬 Reel")

### Backward Compatibility

All existing calendar items (text_based reels and posts) get the indigo/purple treatment automatically — the icon/border logic defaults to text_based for any variant that isn't `'text_video'` or `'post'`. No data migration needed. The extended filter defaults to "All", preserving existing UX.

---

## 34. Threads: Text-Only Content Type

### The Problem: Threads Is Being Used Wrong

**Current state:** ViralToby publishes the **same content** to Threads as it does to Instagram — reel videos go as VIDEO type, carousel images go as IMAGE/CAROUSEL type. This is fundamentally wrong.

**What Threads actually is:**
- Threads is META's **text-first** platform — a direct competitor to X (formerly Twitter)
- Threads shares the same META account as Instagram (same bio, profile picture), but has its **own OAuth flow** (already implemented via `threads.net/oauth/authorize`)
- The platform's algorithm heavily promotes **text posts** and penalizes cross-posted media content
- Optimal posting frequency is **5-15 text posts per day** (vs 6 reels/day on Instagram)
- Content should be short, punchy, conversational, and designed to spark engagement (comments, reposts)
- Video and image posts exist on Threads but are NOT the primary content format

**What must change:** Threads needs its own content type, its own content generation pipeline, its own slot system, and its own Content DNA section. It should **never** receive the same content as Instagram reels or carousels.

### Platform Characteristics (Spec for AI Coder)

The AI coder must understand these Threads-specific rules to implement correct content generation:

| Aspect | Instagram (Reels/Posts) | Threads |
|---|---|---|
| **Primary format** | Video (9:16) / Image carousel | **Text only** (500 char limit, links allowed) |
| **Posting frequency** | 6-8 reels/day + 2 posts/day | **8-15 text posts/day** |
| **Timing** | Spread across 24h | **2PM–8PM ET optimal**, every 1-2 hours |
| **Tone** | Polished, educational, branded | **Conversational, provocative, engagement-bait** |
| **Goal** | Views, saves, follows | **Comments, reposts, discussion** |
| **CTAs** | "Follow for more" / "Save this" | "Follow if you want to stay ahead" / "Comment which one" |
| **Algorithm reward** | Watch time, saves | **Replies, reposts, quote-threads** |
| **Content relationship** | Standalone | **Threads/chains** (multi-part posts, Part 2 strategy) |
| **Cross-platform value** | Threads followers → Instagram followers | **Bidirectional growth** |

### New Content Type: `threads_post`

Threads gets its own `content_type` in the system, completely isolated from reels and carousels:

| Field | Value |
|---|---|
| `content_type` | `"threads_post"` |
| `variant` | `"threads"` |
| `content_format` | `"threads"` |
| Publishing target | Threads only (via existing `publish_threads_post()` with `media_type="TEXT"`) |
| Scoring metric | Replies + reposts (not views/saves) |
| Slot system | Separate from reels — own slot hours, own daily count |

### Content Generation Strategy

Threads posts are **text-only**, generated by DeepSeek based on the brand's Content DNA + Threads-specific configuration. The content pipeline is much simpler than reels (no images, no video, no composition):

```
Content DNA (niche, tone, audience)
    ↓
Threads-specific config (threads_tone, threads_topics, threads_examples)
    ↓
DeepSeek prompt (personality + topic + format type)
    ↓
Text post (≤500 chars)
    ↓
Quality score (engagement potential, controversy score, CTA effectiveness)
    ↓
Publish via Threads API (TEXT type)
```

### Post Format Types

Based on the Threads platform research, the AI generates these format types (selected via Thompson Sampling like reel personalities):

| Format ID | Name | Description | Example |
|---|---|---|---|
| `value_list` | **Pure Value List** | Numbered list of actionable tips. High save rate. | "5 proven ways to double your productivity:\n1. Prioritize daily tasks the night before\n2. Schedule focused deep-work sessions..." |
| `controversial` | **Controversial Take** | Strong opinion on a polarizing topic. High comment rate. | "Forget travel agencies - This [tool] is free" |
| `myth_bust` | **Myth vs Reality** | Debunks a common belief. Educational + shareable. | "Everyone says '8 glasses of water a day' but here's what science actually says..." |
| `thread_chain` | **Thread Chain** | Multi-post thread (Part 1/N). Creates narrative arc + follow incentive. | "GOODBYE MORTGAGE BROKERS:\nClaude can now walk any buyer through the mortgage process... 1/9" |
| `question_hook` | **Question Hook** | Opens with a question, delivers insight. Drives comments. | "What if everything you know about [topic] is wrong?\n\nHere's what research actually shows..." |
| `hot_take` | **Hot Take** | Short, punchy, opinion-driven. Maximum engagement bait. | "Stop saving money.\n\nInvest in yourself instead. Here's why:" |
| `part_two` | **Part Two Sequel** | Follow-up to a previous viral post. Re-engages audience. | "Part 2 of the viral morning routine post..." |
| `story_micro` | **Micro Story** | Mini narrative arc (setup → tension → insight). | "I told my content team: 'We're switching to Claude.'\nThey asked why. I showed them the snowball method..." |

### Thread Chains (Multi-Part Posts)

Thread chains are Threads' equivalent of carousel posts — a sequence of connected posts that tell a complete story. This is a **proven viral mechanic** on Threads:

```
Post 1/6: "GOODBYE MORTGAGE BROKERS: Claude can now walk any buyer through
           the mortgage process like an experienced broker for free.
           Copy these 7 prompts to get the best possible mortgage..."

Post 2/6: "1/ Understand Exactly What You Can Afford
           'Act as a mortgage advisor. Based on my gross income of $[amount]...'"

Post 3/6: "2/ Compare Mortgage Types Like a Pro..."

...

Post 6/6: "7/ Avoid the Most Costly Mistakes... [CTA: Follow for more]"
```

**Implementation:**

```python
class ThreadChain:
    """A multi-part Threads post (published as separate posts in sequence)."""
    parts: list[str]        # Each part is a standalone post (≤500 chars)
    total_parts: int         # e.g., 6
    chain_id: str            # Links parts together in DB
    delay_between: int       # Seconds between publishing each part (30-60s)
```

The backend publishes each part sequentially with a short delay between them (Threads API creates them as a thread when posted by the same user in quick succession).

**Thread chain generation prompt:**
```python
chain_prompt = f"""
You are a viral Threads content creator in the {niche} niche.
Create a thread chain of {num_parts} connected posts.

Rules:
- Post 1: Strong hook that makes people want to read the whole thread
- Posts 2-{num_parts-1}: Each delivers one clear insight or step
- Post {num_parts}: Summary + CTA
- Each post MUST be ≤ 500 characters
- Include "X/{num_parts}" numbering at the start of each post
- Tone: {threads_tone}
- Topic: {topic}

Format: Return as JSON array of strings.
"""
```

### Toby Integration: Threads Agent

Add a new phase to the Toby tick loop for Threads content, independent of the reel/post pipeline:

```python
# In orchestrator.py _tick_user():
# After reel buffer fill + post buffer fill:

# 3. Threads buffer fill
if feature_flags.get("threads_posts", False):
    threads_slots = _get_threads_slots(user_id, brand_id, db)
    unfilled = [s for s in threads_slots if not s["filled"]]
    if unfilled:
        _fill_threads_slots(db, user_id, brand_id, unfilled, ctx)
```

**Threads slot system:**

```python
# Default: 8 text posts per day, every 2 hours from 14:00-22:00 ET
# (configurable per brand via TobyBrandConfig)
BASE_THREADS_HOURS_ET = [14, 15, 16, 17, 18, 19, 20, 21]  # 8 posts, 2PM-9PM ET
DEFAULT_THREADS_POSTS_PER_DAY = 8
```

The slot system converts ET hours to user's local timezone (same as reel slots). `TobyBrandConfig` gets a new column `threads_posts_per_day` (default 8).

**Thompson Sampling for Threads:**

Threads gets its own set of `TobyStrategyScore` rows with `content_type = "threads_post"`. Strategy dimensions:

| Dimension | Options | What It Learns |
|---|---|---|
| `personality` | `value_list`, `controversial`, `myth_bust`, `thread_chain`, `question_hook`, `hot_take`, `part_two`, `story_micro` | Which format type gets most engagement |
| `topic` | Drawn from `threads_topics` in Content DNA | Which sub-topics resonate |
| `tone` | `conversational`, `provocative`, `educational`, `inspirational` | Which tone style performs best |
| `length` | `short` (≤150 chars), `medium` (150-350 chars), `long` (350-500 chars) | Optimal post length |
| `cta_style` | `follow_ask`, `question_prompt`, `repost_ask`, `no_cta` | Which CTA drives most follows |

### Threads Scoring (Analysis Engine)

Threads uses different metrics than Instagram. Update `analysis_engine.py`:

```python
# In compute_toby_score():
if content_type == "threads_post":
    # Threads primary metric: replies (not views)
    primary = replies
    engagement = (replies + reposts + likes) / max(impressions, 1)
    # Threads score formula:
    score = (
        replies * 3.0 +        # Replies are premium (algorithm signal)
        reposts * 2.0 +        # Reposts = virality
        likes * 0.5 +          # Likes are weakest signal on Threads
        impressions * 0.001    # Reach matters but less than engagement
    )
```

The existing `post_performance` table already stores `replies` and can store Threads metrics. The `content_type` column distinguishes Threads data from reel/post data.

### Database Changes

#### Migration: `migrations/threads_content_type.sql`

```sql
-- Threads slot config on TobyBrandConfig
ALTER TABLE toby_brand_config
    ADD COLUMN IF NOT EXISTS threads_posts_per_day INTEGER DEFAULT 8;

-- Threads-specific Content DNA fields on NicheConfig
ALTER TABLE niche_config
    ADD COLUMN IF NOT EXISTS threads_tone TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS threads_topics JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS threads_examples JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS threads_cta_options JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS threads_formatting_style TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS threads_avoid_patterns JSONB DEFAULT '[]';

-- Index for Threads content in post_performance
CREATE INDEX IF NOT EXISTS ix_post_perf_threads
    ON post_performance (user_id, content_type)
    WHERE content_type = 'threads_post';
```

#### Model Updates

```python
# app/models/niche_config.py — add after existing columns:
threads_tone = Column(Text, default="")
threads_topics = Column(JSONB, default=[])          # ["morning routines", "productivity hacks", ...]
threads_examples = Column(JSONB, default=[])         # Few-shot examples of ideal Threads posts
threads_cta_options = Column(JSONB, default=[])      # [{"text": "Follow if...", "weight": 50}, ...]
threads_formatting_style = Column(Text, default="")  # User's preferred formatting (emoji use, line breaks, etc.)
threads_avoid_patterns = Column(JSONB, default=[])   # Anti-patterns to avoid

# app/models/toby.py — TobyBrandConfig, add:
threads_posts_per_day = Column(Integer, default=8)
```

### Scheduler Changes

**Critical change:** Stop sending reel/carousel content to Threads. Threads should ONLY receive `threads_post` content.

```python
# In scheduler.py — when building effective_platforms for a reel/post:
# REMOVE Threads from the list. Threads gets its own publishing path.

def _should_publish_to_threads(content_type: str) -> bool:
    """Only threads_post content goes to Threads. Reels/carousels do NOT."""
    return content_type == "threads_post"

# In the publishing loop:
for platform in effective_platforms:
    if platform == "threads" and not _should_publish_to_threads(content_type):
        continue  # Skip — don't send reels/posts to Threads
```

Threads posts are published via the existing `publish_threads_post()` with `media_type="TEXT"`:

```python
# For threads_post content_type:
result = publisher.publish_threads_post(
    caption=post_text,
    media_type="TEXT",  # TEXT only — no image_url, no video_url
)
```

### Frontend: Threads Tab

Add a new top-level page alongside Reels and Posts:

#### Navigation

Add "Threads" to the sidebar navigation, between "Posts" and "Jobs":

```
Home
Videos (Reels)
Posts (Carousels)
Threads  ← NEW
Jobs
Calendar
Analytics
Toby
Brands
```

Route: `/threads` → `src/pages/Threads.tsx`

#### Threads Page Design

```
┌──────────────────────────────────────────────────────────┐
│  Threads                                                 │
│  Create text-only posts for Threads                      │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ 📝 Single   │  │ 🧵 Chain     │  │ ⚡ Bulk Gen    │  │
│  │    Post      │  │   (Thread)   │  │                │  │
│  └──────────────┘  └──────────────┘  └────────────────┘  │
│                                                          │
│  [Tab content below]                                     │
└──────────────────────────────────────────────────────────┘
```

**Tab 1: Single Post** — Manual composition of one text post:

```
┌──────────────────────────────────────────────────────────┐
│  📝 Single Post                                          │
│                                                          │
│  ┌──────────────────────────────────────┐  ┌──────────┐ │
│  │ Post Text (500 char max)             │  │ Settings │ │
│  │ ┌──────────────────────────────────┐ │  │          │ │
│  │ │ Type your Threads post here...   │ │  │ Brands:  │ │
│  │ │                                  │ │  │ [✓] All  │ │
│  │ │                                  │ │  │          │ │
│  │ │                           0/500  │ │  │ Schedule:│ │
│  │ └──────────────────────────────────┘ │  │ [Now ▼]  │ │
│  │                                      │  │          │ │
│  │ Format Type: [Value List ▼]          │  │          │ │
│  │                                      │  │          │ │
│  │ [✨ Generate with AI]                │  │          │ │
│  │ [📤 Post Now] [📅 Schedule]          │  └──────────┘ │
│  └──────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────┘
```

**Tab 2: Thread Chain** — Compose a multi-part thread:

```
┌──────────────────────────────────────────────────────────┐
│  🧵 Thread Chain                                         │
│                                                          │
│  Topic: [___________________________]                    │
│  Parts: [6 ▼]                                            │
│  Format: [Step-by-step guide ▼]                          │
│                                                          │
│  [✨ Generate Chain with AI]                             │
│                                                          │
│  ┌─ Part 1/6 ────────────────────────────────────────┐  │
│  │ GOODBYE MORTGAGE BROKERS:                          │  │
│  │ Claude can now walk any buyer through the...       │  │
│  │                                            120/500 │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌─ Part 2/6 ────────────────────────────────────────┐  │
│  │ 1/ Understand Exactly What You Can Afford          │  │
│  │ "Act as a mortgage advisor. Based on my..."       │  │
│  │                                            310/500 │  │
│  └────────────────────────────────────────────────────┘  │
│  ... (parts 3-6)                                         │
│                                                          │
│  [📤 Post Chain Now] [📅 Schedule Chain]                 │
└──────────────────────────────────────────────────────────┘
```

**Tab 3: Bulk Generate** — Auto-generate multiple Threads posts at once:

```
┌──────────────────────────────────────────────────────────┐
│  ⚡ Bulk Generate                                        │
│                                                          │
│  This generates multiple Threads posts at once using     │
│  your Content DNA + Threads settings.                    │
│                                                          │
│  Count:     [8 ▼] posts                                  │
│  Mix:       [Auto ▼] (AI picks best format types)        │
│  Topics:    [From Content DNA ▼]                         │
│  Brands:    [✓] All brands                               │
│  Schedule:  [Auto-space 2h apart ▼]                      │
│                                                          │
│  [⚡ Generate All]                                       │
│                                                          │
│  → Creates jobs that generate 8 text posts               │
│  → Auto-schedules them 2h apart starting from next       │
│    optimal time slot (2PM ET)                             │
└──────────────────────────────────────────────────────────┘
```

### API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/threads/generate` | Generate a single Threads text post via AI |
| POST | `/api/threads/generate-chain` | Generate a thread chain (multi-part) |
| POST | `/api/threads/bulk-generate` | Generate N posts with auto-scheduling |
| POST | `/api/threads/publish/{job_id}` | Publish a Threads post immediately |
| GET | `/api/threads/jobs` | List Threads generation jobs |
| GET | `/api/threads/jobs/{job_id}` | Get Threads job detail |
| PUT | `/api/threads/jobs/{job_id}` | Edit Threads post text before publishing |

### Backend: New Files

| File | Purpose |
|---|---|
| `app/api/threads/routes.py` | API routes for Threads content |
| `app/services/content/threads_generator.py` | DeepSeek-powered text post generation |
| `app/services/content/threads_chain_generator.py` | Thread chain (multi-part) generation |
| `app/core/threads_personalities.py` | Format type definitions + personality prompts |
| `app/core/threads_prompt_templates.py` | Prompt templates for each format type |

### Backend: Modified Files

| File | Change |
|---|---|
| `app/services/publishing/scheduler.py` | Block reel/carousel from going to Threads; add Threads-only publishing path |
| `app/services/toby/orchestrator.py` | Add Threads buffer fill phase to tick loop |
| `app/services/toby/buffer_manager.py` | Add Threads slot calculation |
| `app/services/toby/analysis_engine.py` | Add `threads_post` scoring formula |
| `app/services/toby/learning_engine.py` | Add `THREADS_PERSONALITIES` pool |
| `app/services/toby/content_planner.py` | Add `threads_post` to `ContentPlan` |
| `app/core/platforms.py` | Add `"threads_post": "threads"` to `CONTENT_TYPE_KEY_MAP` |
| `app/models/niche_config.py` | Add 6 Threads columns |
| `app/models/toby.py` | Add `threads_posts_per_day` to `TobyBrandConfig` |
| `app/main.py` | Register Threads router; stop sending reels/posts to Threads in publish flow |

### Frontend: New Files

| File | Purpose |
|---|---|
| `src/pages/Threads.tsx` | Main Threads page with 3 tabs |
| `src/features/threads/SinglePostTab.tsx` | Manual + AI single post |
| `src/features/threads/ChainTab.tsx` | Thread chain composer |
| `src/features/threads/BulkGenerateTab.tsx` | Bulk generation with auto-scheduling |
| `src/features/threads/api/threads-api.ts` | API client functions |
| `src/features/threads/api/use-threads.ts` | React Query hooks |
| `src/features/threads/types.ts` | TypeScript types |

### Frontend: Modified Files

| File | Change |
|---|---|
| `src/app/routes/index.tsx` | Add `/threads` route |
| `src/shared/types/index.ts` | Add `'threads'` to `Variant` type, add `ThreadsJob` type |
| `src/pages/Calendar.tsx` | Add 🧵 icon for Threads posts, teal color border, filter chip |
| `src/pages/Scheduled.tsx` | Add Threads filter and visual indicators |
| `src/pages/History.tsx` | Show Threads jobs with 🧵 badge |
| `src/pages/Analytics.tsx` | Add Threads format filter, metrics display (replies/reposts vs views/saves) |
| `src/pages/Home.tsx` | Add Threads buffer status to dashboard |
| Sidebar navigation component | Add "Threads" nav item |

### Visual System Extension

Extend the format color system from Section 33:

| Format | Primary Color | Icon | Usage |
|---|---|---|---|
| text_based reels | **Indigo** (`indigo-500/600`) | 🎬 | Calendar, filter, analytics |
| text_video reels | **Amber** (`amber-500/600`) | 📰 | Calendar, filter, analytics |
| posts (carousel) | **Purple** (`purple-500/600`) | 🖼️ | Calendar, filter, analytics |
| **Threads posts** | **Teal** (`teal-500/600`) | 🧵 | Calendar, filter, analytics |

### Production Safety

Follows the same staged deployment pattern as Section 28:

1. **Stage 1:** Run `migrations/threads_content_type.sql` (additive columns + index)
2. **Stage 2:** Deploy backend (new routes + modified scheduler + Toby Threads phase)
3. **Stage 3:** Deploy frontend (new Threads page + Content DNA Threads tab + visual indicators)
4. **Stage 4:** Enable per-brand via feature flag `threads_posts`

**Critical scheduler change:** The scheduler modification that blocks reels/carousels from Threads must deploy WITH the new Threads content pipeline. Otherwise, during the transition period, Threads would receive no content. To handle this safely:

```python
# Temporary: During transition, keep existing behavior if no threads_post content exists
if platform == "threads":
    if _has_threads_content_pipeline(brand_id):
        # New behavior: only threads_post content goes to Threads
        if content_type != "threads_post":
            continue
    else:
        # Legacy behavior: reel/post content still goes to Threads
        pass  # Keep sending until brand has Threads content enabled
```

### `[ASK USER]` Decision Points

### `[ASK USER]` 15: Threads Post Frequency Default
Default `threads_posts_per_day = 8` is recommended based on research. Should this be configurable in the UI? Or fixed at 8 for MVP?

### `[ASK USER]` 16: Thread Chain Delay
How many seconds between publishing each part of a thread chain? Research suggests 30-60 seconds. The Threads API may create them as a connected thread if posted quickly.

### `[ASK USER]` 17: Threads Content Source
Should Threads content be:
- (a) Fully AI-generated from Content DNA + Threads config (simplest)
- (b) Adapted from existing reel/post content (repurposed but rewritten for text-only)
- (c) Mix: AI-generated + ability to convert a reel topic into a Threads post

### `[ASK USER]` 18: Threads Analytics Scope
Does the Threads API provide post-level analytics (impressions, replies, reposts)? If not, we can only track publish success/failure. Check `graph.threads.net` docs for `threads_manage_insights` scope capabilities.

---

## 35. Content DNA: Tabbed UI Redesign

### The Problem

The current Content DNA form ([src/features/brands/components/NicheConfigForm.tsx](../src/features/brands/components/NicheConfigForm.tsx), 1215 lines) renders as **one long scrollable page** with collapsible accordion sections:
- 🧬 General (niche name, content brief, import)
- 🎬 Reels (50 examples, CTAs, YouTube titles)
- 📱 Carousel Posts (post examples, citation style, overlay opacity, CTAs)
- AI Understanding (generate test)

With Threads added, this becomes 5 sections. The page is already very long (50 reel examples alone is a huge list). Users editing Threads settings don't need to scroll past 50 reel examples. The accordion helps, but it's still one giant form with one Save button.

### Solution: Tabbed Section Rendering

Replace the accordion with **tabs** that render only the relevant section:

```
┌──────────────────────────────────────────────────────────┐
│  Content DNA                                             │
│  These settings control every reel, post, and thread.    │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 🧬       │ │ 🎬       │ │ 📱       │ │ 🧵       │    │
│  │ General  │ │ Reels    │ │ Carousel │ │ Threads  │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│                                                          │
│  [Only the selected tab's content renders below]         │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │                                                      ││
│  │  (Tab-specific form fields here)                     ││
│  │                                                      ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  [💾 Save]                    Configuration Strength:    │
│                               ████████████░░ excellent   │
└──────────────────────────────────────────────────────────┘
```

### Tab Contents

#### Tab 1: 🧬 General

Core identity shared across ALL content types. This is the foundation that reels, carousels, and Threads all inherit.

| Field | Description |
|---|---|
| Niche Name | Short label for brand niche |
| Content Brief | Full description of topics, tone, audience, style, philosophy |
| Import from Instagram | Auto-fill via AI analysis of recent posts |
| Configuration Strength meter | Shows overall DNA completeness |
| AI Understanding | "Ask the AI" to describe how it interprets the brand |

#### Tab 2: 🎬 Reels

Reel-specific settings. Everything here only affects reel content generation.

| Field | Description |
|---|---|
| Reel Examples (50 slots) | Few-shot examples the AI learns from |
| Reel CTA Options | Weighted CTAs for reels only |
| YouTube Title Style | Good/bad example titles for YouTube Shorts |

#### Tab 3: 📱 Carousel Posts

Carousel/post-specific settings. Only affects carousel generation.

| Field | Description |
|---|---|
| Post Examples (50 slots) | Few-shot examples with slide counts |
| Slides per post | Default slide count (3-4 + cover) |
| Citation Style | How the AI cites sources (academic, casual, none) |
| Dark Overlay Opacity | Cover + content slide opacity sliders |
| Carousel CTA Options | Weighted CTAs with `{cta_topic}` and `@{brandhandle}` placeholders |

#### Tab 4: 🧵 Threads

Threads-specific settings. Only affects Threads text post generation.

```
┌──────────────────────────────────────────────────────────┐
│  🧵 Threads                                              │
│  Text-only post settings for Threads. These control      │
│  how the AI generates your Threads content.               │
│                                                          │
│  ── THREADS TONE ────────────────────────────────────    │
│  Describe the voice for Threads posts. Threads is more   │
│  conversational than Instagram — short, punchy, direct.  │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Conversational, slightly provocative, uses rhetorical││
│  │ questions. Less polished than Instagram, more like   ││
│  │ talking to a friend who happens to be an expert.     ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ── THREADS TOPICS ─────────────────────────────────     │
│  Sub-topics the AI should focus on for Threads.          │
│  (Auto-filled from Content Brief if empty)               │
│  ┌──────────────────────────────────────────────────────┐│
│  │ + morning routines  + productivity hacks             ││
│  │ + controversial health takes  + myth busting         ││
│  │ + quick tips  + industry hot takes                   ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ── THREADS EXAMPLES (0/20) ────────────────────────     │
│  Paste your best Threads posts or posts from competitors │
│  you admire. The AI learns directly from these.          │
│                                                          │
│  Example 1                                               │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Stop saving money.                                   ││
│  │                                                      ││
│  │ Invest in yourself instead. Here's why:              ││
│  │ • Every skill you learn compounds                    ││
│  │ • Your earning potential has no ceiling               ││
│  │ • A savings account grows 4%. You can grow 400%.     ││
│  └──────────────────────────────────────────────────────┘│
│  [Add Threads Example]                                   │
│                                                          │
│  ── THREADS CTAs ───────────────────────────────────     │
│  CTAs are appended to the end of Threads posts.          │
│                                                          │
│  CTA Options (3/10)                [Auto-distribute]     │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Follow us if you want to stay ahead in wellness  50% ││
│  │ Comment which one surprised you the most         30% ││
│  │ Repost if you agree                              20% ││
│  └──────────────────────────────────────────────────────┘│
│  [Add CTA]                                               │
│                                                          │
│  ── FORMATTING STYLE ───────────────────────────────     │
│  Describe your preferred Threads post formatting.        │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Use line breaks between ideas. Bullet points with •  ││
│  │ for lists. No emojis in body text, only in hooks.    ││
│  │ Short paragraphs (1-2 sentences max).                ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ── AVOID PATTERNS ─────────────────────────────────     │
│  Patterns the AI should never use in Threads posts.      │
│  ┌──────────────────────────────────────────────────────┐│
│  │ + Using dashes (clear ChatGPT indicator)             ││
│  │ + "You won't believe..." clickbait                   ││
│  │ + ALL CAPS entire posts                              ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ── POSTING STRATEGY ───────────────────────────────     │
│  Posts per day: [8 ▼]                                    │
│  Schedule: [2PM-10PM ET, every 2h ▼]                     │
│                                                          │
│  [💾 Save]                                               │
└──────────────────────────────────────────────────────────┘
```

### Implementation: Tab State Management

The `NicheConfigForm` already has a `section` prop that takes `'general' | 'reels' | 'posts'`. Extend this:

```typescript
// Current:
type NicheConfigSection = 'general' | 'reels' | 'posts'

// New:
type NicheConfigSection = 'general' | 'reels' | 'posts' | 'threads'
```

**Tab container in the Content DNA page:**

```typescript
// In the Brands page Content DNA tab:
const [activeSection, setActiveSection] = useState<NicheConfigSection>('general')

const tabs = [
  { id: 'general', label: 'General', icon: '🧬' },
  { id: 'reels', label: 'Reels', icon: '🎬' },
  { id: 'posts', label: 'Carousel', icon: '📱' },
  { id: 'threads', label: 'Threads', icon: '🧵' },
] as const

return (
  <div>
    {/* Tab bar */}
    <div className="flex gap-1 border-b border-gray-200 mb-6">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveSection(tab.id)}
          className={cn(
            'px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors',
            activeSection === tab.id
              ? 'bg-white border border-b-0 border-gray-200 text-gray-900'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          )}
        >
          {tab.icon} {tab.label}
        </button>
      ))}
    </div>

    {/* Only render the active section */}
    <NicheConfigForm
      section={activeSection}
      config={config}
      onChange={handleChange}
      onSave={handleSave}
    />
  </div>
)
```

### Conditional Rendering Inside NicheConfigForm

The form already conditionally renders sections based on the `section` prop. Add Threads:

```typescript
// In NicheConfigForm.tsx:

{/* General section */}
{(section === 'general' || !section) && (
  <GeneralSection config={config} onChange={onChange} />
)}

{/* Reels section */}
{section === 'reels' && (
  <ReelsSection config={config} onChange={onChange} />
)}

{/* Carousel Posts section */}
{section === 'posts' && (
  <CarouselSection config={config} onChange={onChange} />
)}

{/* Threads section — NEW */}
{section === 'threads' && (
  <ThreadsSection config={config} onChange={onChange} />
)}
```

**New component: `ThreadsSection`** — Extracted into its own file for maintainability:

```
src/features/brands/components/ThreadsSection.tsx
```

This component renders all the Threads-specific fields: tone, topics, examples, CTAs, formatting style, avoid patterns, posting strategy.

### Save Behavior

Each tab has its own Save button. Saving one tab ONLY saves the fields for that section — it does NOT overwrite fields from other tabs. The API endpoint `PUT /api/niche-config/{id}` already accepts partial updates (only sends changed fields). No backend change needed.

### Configuration Strength Meter

Update the strength calculation to include Threads fields:

```typescript
function calculateConfigStrength(config: NicheConfig): number {
  let score = 0
  const maxScore = 100

  // General (30 points)
  if (config.niche_name) score += 10
  if (config.content_brief?.length > 100) score += 20

  // Reels (25 points)
  if (config.reel_examples?.length >= 10) score += 15
  if (config.cta_options?.length >= 3) score += 5
  if (config.yt_title_examples?.length >= 3) score += 5

  // Carousels (25 points)
  if (config.post_examples?.length >= 5) score += 15
  if (config.carousel_cta_options?.length >= 2) score += 5
  if (config.citation_style) score += 5

  // Threads (20 points)
  if (config.threads_tone?.length > 20) score += 5
  if (config.threads_topics?.length >= 3) score += 5
  if (config.threads_examples?.length >= 5) score += 5
  if (config.threads_cta_options?.length >= 2) score += 5

  return Math.min(Math.round(score / maxScore * 100), 100)
}
```

### Onboarding Impact

The onboarding flow (Steps 1-6 in `Onboarding.tsx`) currently covers:
- Step 1: Create brand
- Step 2: Brand theme
- Step 3: Connect platforms (includes Threads)
- Step 4: General Content DNA
- Step 5: Reels configuration
- Step 6: Carousel Posts

**Option A (recommended for MVP):** Don't add a Threads onboarding step. The Threads Content DNA fields are optional — the AI can generate reasonable Threads content from just the General Content DNA (niche name + content brief). Users can customize Threads settings later in Brand Settings.

**Option B (future):** Add Step 7 for Threads configuration. This adds complexity to an already 6-step onboarding. Only consider if Threads becomes a primary content focus.

### File Changes Summary

**Modified files:**
- `src/features/brands/components/NicheConfigForm.tsx` — Extend `section` prop type, add Threads conditional block, restructure from accordion to tab-ready
- `src/pages/Brands.tsx` (or wherever Content DNA tab lives) — Add tab bar UI with 4 tabs, manage `activeSection` state
- `src/features/brands/api/niche-config-api.ts` — Add Threads fields to the NicheConfig TypeScript interface

**New files:**
- `src/features/brands/components/ThreadsSection.tsx` — Threads Content DNA form section

### Backward Compatibility

All Threads fields on `NicheConfig` have defaults (`''` for text, `[]` for JSONB). Existing users see an empty Threads tab — no data loss, no migration of existing data. The AI uses General Content DNA as fallback when Threads-specific fields are empty.

---

## 36. Complete Stripe Billing: Per-Brand Subscriptions & Super Admin Trial Control

### Current State Summary

The billing infrastructure is **already built** but needs completion. Here's what exists:

| Component | Status | Location |
|---|---|---|
| `BrandSubscription` model | ✅ Exists | `app/models/billing.py` |
| User billing fields (`billing_status`, `stripe_customer_id`, `billing_grace_deadline`) | ✅ Exists | `app/models/auth.py` |
| Stripe Checkout session creation | ✅ Exists | `app/api/billing/routes.py` |
| Stripe Customer Portal | ✅ Exists | `app/api/billing/routes.py` |
| Webhook handler (checkout, invoice.paid, payment_failed, subscription events) | ✅ Exists | `app/api/billing/routes.py` |
| Soft-lock lifecycle (past_due → 7-day grace → locked) | ✅ Exists | `app/services/billing_enforcer.py` |
| Exempt tags (`special`, `admin`, `super_admin`) | ✅ Exists | `app/services/billing_utils.py` |
| Frontend billing gate (`useBillingGate`) | ✅ Exists | `src/features/billing/useBillingGate.ts` |
| `LockedBanner.tsx` + `PaywallModal.tsx` | ✅ Exists | `src/features/billing/` |
| **Free trial system** | ❌ Missing | — |
| **Super admin trial extension** | ❌ Missing | — |
| **Pricing page / checkout flow UI** | ❌ Incomplete | — |

### The Billing Model: $50/brand/month + 7-Day Free Trial

**Core rule:** Every brand requires an active `BrandSubscription` to generate content, publish, or run Toby. Price: **$50/month per brand**. Each brand gets a **7-day free trial** — the trial starts when the brand is created.

| Event | What Happens |
|---|---|
| User creates a new brand | `BrandSubscription` created with `status='trialing'`, `trial_end = now + 7 days` |
| Trial active | Full access — Toby, publishing, generation, all platforms |
| Trial expires (no payment method) | `status='trial_expired'` → soft-lock that brand only |
| User adds payment → Stripe Checkout | `status='active'`, Stripe starts billing $50/mo |
| Payment fails | `status='past_due'` → 7-day grace → `status='locked'` |
| User cancels | `cancel_at_period_end=True`, active until period end |
| Super admin extends trial | `trial_end` pushed forward by N days |

### Database Changes

#### Migration: `migrations/add_trial_support.sql`

```sql
-- Add trial columns to brand_subscriptions
ALTER TABLE brand_subscriptions
    ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trial_extended_by UUID REFERENCES user_profiles(id),
    ADD COLUMN IF NOT EXISTS trial_extension_days INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS trial_extension_reason TEXT DEFAULT '';

-- Add trial_days_remaining view helper (not a real column, computed in code)
-- Index for finding expired trials
CREATE INDEX IF NOT EXISTS ix_brand_sub_trial_end
    ON brand_subscriptions (trial_end)
    WHERE status = 'trialing';

-- Super admin action log
CREATE TABLE IF NOT EXISTS admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES user_profiles(id),
    action_type TEXT NOT NULL,          -- 'extend_trial', 'exempt_user', 'force_unlock'
    target_user_id UUID REFERENCES user_profiles(id),
    target_brand_id UUID REFERENCES brands(id),
    details JSONB DEFAULT '{}',         -- {"days_added": 14, "reason": "beta tester"}
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_admin_actions_type ON admin_actions (action_type);
CREATE INDEX IF NOT EXISTS ix_admin_actions_target ON admin_actions (target_user_id);
```

#### Model Updates

```python
# app/models/billing.py — BrandSubscription, add:
trial_end = Column(DateTime(timezone=True), nullable=True)
trial_extended_by = Column(UUID, ForeignKey("user_profiles.id"), nullable=True)
trial_extension_days = Column(Integer, default=0)
trial_extension_reason = Column(Text, default="")

# New model in app/models/billing.py:
class AdminAction(Base):
    __tablename__ = "admin_actions"
    id = Column(UUID, primary_key=True, default=uuid4)
    admin_user_id = Column(UUID, ForeignKey("user_profiles.id"), nullable=False)
    action_type = Column(Text, nullable=False)
    target_user_id = Column(UUID, ForeignKey("user_profiles.id"), nullable=True)
    target_brand_id = Column(UUID, ForeignKey("brands.id"), nullable=True)
    details = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), default=func.now())
```

### Brand Creation Flow (Trial Start)

When a user creates a brand via `POST /api/brands/`, the system must also create a trial subscription:

```python
# In app/services/brands/manager.py — after brand INSERT:
from datetime import timedelta

trial_sub = BrandSubscription(
    user_id=user_id,
    brand_id=new_brand.id,
    status="trialing",
    trial_end=datetime.utcnow() + timedelta(days=7),
    # No stripe_subscription_id yet — that comes after checkout
)
db.add(trial_sub)
db.commit()
```

### Trial Expiration Check

The existing `billing_enforcer.py` (runs hourly via APScheduler) gets a new check:

```python
# In billing_enforcer.py — add to the hourly sweep:
def _expire_trials(db):
    """Lock brands whose free trial has expired without payment."""
    now = datetime.utcnow()
    expired = db.query(BrandSubscription).filter(
        BrandSubscription.status == "trialing",
        BrandSubscription.trial_end < now,
        BrandSubscription.stripe_subscription_id.is_(None),  # Never paid
    ).all()

    for sub in expired:
        sub.status = "trial_expired"
        logger.info(f"Trial expired for brand {sub.brand_id} (user {sub.user_id})")

    if expired:
        db.commit()
        # Recalculate user-level billing status for affected users
        user_ids = {sub.user_id for sub in expired}
        for uid in user_ids:
            recalculate_user_billing_status(db, uid)
```

### Billing Gate Update

Update `validate_can_generate()` in `billing_utils.py` to handle trial states:

```python
def validate_can_generate(user, brand_sub: BrandSubscription) -> tuple[bool, str]:
    """Check if a user is allowed to generate content for a specific brand."""
    # Exempt users always pass
    if is_exempt(user):
        return (True, "")

    if not brand_sub:
        return (False, "No subscription found for this brand")

    # Active subscription or trial — allowed
    if brand_sub.status in ("active", "trialing"):
        return (True, "")

    # Past due (grace period) — still allowed
    if brand_sub.status == "past_due":
        return (True, "")

    # Trial expired — blocked, prompt to subscribe
    if brand_sub.status == "trial_expired":
        return (False, "Your 7-day free trial has expired. Subscribe to continue using this brand.")

    # Locked — blocked, prompt to fix payment
    if brand_sub.status == "locked":
        return (False, "This brand is locked due to payment issues. Please update your payment method.")

    # Cancelled — blocked
    if brand_sub.status == "cancelled":
        return (False, "This brand's subscription has been cancelled.")

    return (False, "Unknown billing state")
```

### Super Admin: Trial Extension API

New admin-only endpoints for trial management:

#### New Admin Routes: `app/api/admin/trial_routes.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import timedelta

router = APIRouter(prefix="/api/admin", tags=["admin"])

class ExtendTrialRequest(BaseModel):
    user_id: str           # Target user
    brand_id: str          # Target brand
    days: int              # Number of days to add (1-365)
    reason: str = ""       # Optional reason for audit log

@router.post("/extend-trial")
async def extend_trial(
    req: ExtendTrialRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Super admin: extend or restart a brand's free trial."""
    if not is_super_admin_user(current_user):
        raise HTTPException(403, "Super admin access required")

    if req.days < 1 or req.days > 365:
        raise HTTPException(400, "Days must be between 1 and 365")

    sub = db.query(BrandSubscription).filter_by(
        user_id=req.user_id, brand_id=req.brand_id
    ).first()
    if not sub:
        raise HTTPException(404, "Brand subscription not found")

    # Extend trial_end from NOW (not from current trial_end) by N days
    sub.trial_end = datetime.utcnow() + timedelta(days=req.days)
    sub.trial_extended_by = current_user["sub"]
    sub.trial_extension_days += req.days
    sub.trial_extension_reason = req.reason or sub.trial_extension_reason

    # If trial had expired, reactivate it
    if sub.status in ("trial_expired", "locked"):
        sub.status = "trialing"

    # Log the action
    action = AdminAction(
        admin_user_id=current_user["sub"],
        action_type="extend_trial",
        target_user_id=req.user_id,
        target_brand_id=req.brand_id,
        details={"days_added": req.days, "reason": req.reason, "new_trial_end": sub.trial_end.isoformat()},
    )
    db.add(action)
    db.commit()

    return {"ok": True, "new_trial_end": sub.trial_end.isoformat(), "status": sub.status}


class ListTrialsResponse(BaseModel):
    user_id: str
    brand_id: str
    brand_name: str
    status: str
    trial_end: str | None
    days_remaining: int | None
    extension_days: int

@router.get("/trials")
async def list_trials(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Super admin: list all active/expired trials."""
    if not is_super_admin_user(current_user):
        raise HTTPException(403, "Super admin access required")

    subs = db.query(BrandSubscription).filter(
        BrandSubscription.status.in_(["trialing", "trial_expired"])
    ).all()

    result = []
    for sub in subs:
        brand = db.query(Brand).get(sub.brand_id)
        days_remaining = None
        if sub.trial_end:
            delta = sub.trial_end - datetime.utcnow()
            days_remaining = max(0, delta.days)
        result.append({
            "user_id": str(sub.user_id),
            "brand_id": str(sub.brand_id),
            "brand_name": brand.name if brand else "Unknown",
            "status": sub.status,
            "trial_end": sub.trial_end.isoformat() if sub.trial_end else None,
            "days_remaining": days_remaining,
            "extension_days": sub.trial_extension_days,
        })

    return {"trials": result}
```

### Super Admin UI

Add a trial management panel to the existing admin dashboard:

```
┌──────────────────────────────────────────────────────────┐
│  Admin: Trial Management                                 │
│                                                          │
│  ┌─ Active Trials ────────────────────────────────────┐  │
│  │ Brand          │ User       │ Expires   │ Action   │  │
│  │─────────────────────────────────────────────────────│  │
│  │ Healveth       │ john@...   │ 3 days    │ [+7] [+30]│  │
│  │ FitBros        │ jane@...   │ 1 day     │ [+7] [+30]│  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Expired Trials ───────────────────────────────────┐  │
│  │ Brand          │ User       │ Expired    │ Action  │  │
│  │─────────────────────────────────────────────────────│  │
│  │ SkinCare AI    │ bob@...    │ 2 days ago │ [Extend]│  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Custom Extension ─────────────────────────────────┐  │
│  │ User ID:  [________________________]               │  │
│  │ Brand ID: [________________________]               │  │
│  │ Days:     [14 ▼]                                   │  │
│  │ Reason:   [Beta tester / VIP / Support case]       │  │
│  │                                                    │  │
│  │ [🔓 Extend Trial]                                  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Admin Action Log (last 50)                              │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Mar 5, 2026 │ extend_trial │ FitBros +14d │ "VIP"  ││
│  │ Mar 3, 2026 │ extend_trial │ Healveth +7d │ "beta" ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### Frontend: Trial Status Awareness

The existing `useBillingGate.ts` hook needs to understand trial states:

```typescript
// In useBillingGate.ts:
export function useBillingGate(brandId: string) {
  const { data } = useBillingStatus()
  if (!data) return { allowed: true, reason: '' }  // Loading state

  // Exempt users bypass everything
  if (data.is_exempt) return { allowed: true, reason: '' }

  const sub = data.subscriptions.find(s => s.brand_id === brandId)
  if (!sub) return { allowed: false, reason: 'no_subscription' }

  // Trial and active states
  if (sub.status === 'trialing') {
    const daysLeft = sub.trial_days_remaining ?? 0
    return {
      allowed: true,
      reason: '',
      isTrial: true,
      trialDaysLeft: daysLeft,
    }
  }
  if (sub.status === 'active' || sub.status === 'past_due') {
    return { allowed: true, reason: '' }
  }

  // Blocked states
  if (sub.status === 'trial_expired') {
    return { allowed: false, reason: 'trial_expired' }
  }
  if (sub.status === 'locked') {
    return { allowed: false, reason: 'locked' }
  }
  return { allowed: false, reason: sub.status }
}
```

**Trial countdown banner** — displayed on all pages when a brand is on trial:

```
┌──────────────────────────────────────────────────────────────────┐
│ ⏰ Free trial: 3 days remaining for "Healveth"  [Subscribe $50/mo] │
└──────────────────────────────────────────────────────────────────┘
```

**Trial expired overlay** — blocks the brand's content pages:

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│              Your 7-day free trial has ended.                    │
│                                                                  │
│   Subscribe for $50/month to keep generating, scheduling,        │
│   and publishing content for this brand.                         │
│                                                                  │
│              [🚀 Subscribe Now]   [Manage Brands]                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Checkout Flow

The existing `POST /api/billing/checkout-session` creates a Stripe Checkout session. Update it to include trial:

```python
# In billing/routes.py — checkout-session handler:
session = stripe.checkout.Session.create(
    customer=stripe_customer_id,
    payment_method_types=["card"],
    line_items=[{
        "price": STRIPE_PRICE_ID,  # $50/mo recurring
        "quantity": 1,
    }],
    mode="subscription",
    # If brand still has trial days left, transfer remaining trial to Stripe
    subscription_data={
        "trial_end": int(brand_sub.trial_end.timestamp())
    } if brand_sub.trial_end and brand_sub.trial_end > datetime.utcnow() else {},
    success_url=f"{BASE_URL}/brands?checkout=success&brand_id={brand_id}",
    cancel_url=f"{BASE_URL}/brands?checkout=cancel",
    metadata={"user_id": user_id, "brand_id": brand_id},
)
```

This means: if a user subscribes on day 3 of their trial, Stripe won't charge them until day 7. After that, $50/mo.

### Stripe Product Setup

The AI coder must verify these exist in Stripe Dashboard (or create via API):

| Stripe Object | Value |
|---|---|
| Product name | `ViralToby Brand Subscription` |
| Price | `$50.00 / month` recurring |
| Price ID | Stored in `STRIPE_PRICE_ID` env var |
| Webhook endpoint | `https://viraltoby.com/api/billing/webhook` |
| Webhook events | `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted` |
| Customer portal | Enabled (for self-service cancellation/payment update) |

**Environment variables (Railway):**
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

The AI coder adds these via `railway variables set KEY=value` when provided by the user.

### File Changes Summary

**New files:**
- `app/api/admin/trial_routes.py` — Super admin trial extension + listing API
- `src/features/admin/TrialManagement.tsx` — Admin UI for trial management
- `migrations/add_trial_support.sql` — Trial columns + admin_actions table

**Modified files:**
- `app/models/billing.py` — Add trial columns to `BrandSubscription`, add `AdminAction` model
- `app/services/billing_enforcer.py` — Add `_expire_trials()` to hourly sweep
- `app/services/billing_utils.py` — Update `validate_can_generate()` for trial states
- `app/services/brands/manager.py` — Create trial `BrandSubscription` on brand creation
- `app/api/billing/routes.py` — Transfer trial days to Stripe checkout, add `trial_days_remaining` to status response
- `app/main.py` — Register admin trial router
- `src/features/billing/useBillingGate.ts` — Handle `trialing` and `trial_expired` states
- `src/features/billing/useBillingStatus.ts` — Include trial fields in response type
- `src/features/billing/LockedBanner.tsx` — Show trial countdown OR locked message

### Lifecycle Diagram

```
Brand Created
    │
    ▼
[trialing] ──(7 days pass, no payment)──▶ [trial_expired] ──▶ LOCKED
    │                                              │
    │ (user subscribes)                            │ (super admin extends)
    ▼                                              ▼
[active] ◄──────────────────────────────── [trialing] (re-activated)
    │
    │ (payment fails)
    ▼
[past_due] ──(7 days grace)──▶ [locked] ──(payment succeeds)──▶ [active]
    │
    │ (payment succeeds during grace)
    ▼
[active]
```

### Section 10 Update

> **This section supersedes the billing language in Section 10.** Section 10 stated "Toby is included for any user with at least 1 paid brand ($50/month)." That remains true — but now brands start with a 7-day free trial. The full billing lifecycle is documented here in Section 36. Section 10 focuses only on Toby's integration with the content pipeline.

---

## 37. DeepSeek API Cost Tracking & Per-User/Brand Metrics

### The Problem

DeepSeek API calls are the primary operational cost of ViralToby, yet **zero cost tracking exists**. There's no way to know:
- How much a specific user costs per month
- How much a specific brand costs per month
- What the average cost per user or per brand is
- Which service (content generation, captions, backgrounds, differentiation) costs the most
- Whether a specific user is an outlier in API usage

The DeepSeek API returns `usage` data in every response (`prompt_tokens`, `completion_tokens`, `total_tokens`), but **no service in the codebase extracts or stores this data**.

### Where DeepSeek Calls Happen (5 Services)

| Service | File | Purpose | Frequency |
|---|---|---|---|
| **Content Generator** | `app/services/content/generator.py` `_call_deepseek()` | Reel content lines | Every reel job |
| **Caption Generator** | `app/services/media/caption_generator.py` | Instagram captions | Every reel/post job |
| **AI Background** | `app/services/media/ai_background.py` | Image prompt engineering | Every reel with AI background |
| **Content Differentiator** | `app/services/content/differentiator.py` | Multi-brand content variations | Every multi-brand generation |
| **Historical Miner** | `app/services/toby/historical_miner.py` | Toby learning embeddings | Periodic Toby tick |

### DeepSeek API Response Format

Every DeepSeek `/v1/chat/completions` response includes:

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "usage": {
    "prompt_tokens": 1250,
    "completion_tokens": 340,
    "total_tokens": 1590
  },
  "choices": [...]
}
```

**DeepSeek pricing (as of writing):**
- Input tokens: ~$0.14 per 1M tokens ($0.00000014/token)
- Output tokens: ~$0.28 per 1M tokens ($0.00000028/token)
- Cache-hit input: ~$0.014 per 1M tokens (10x cheaper)

These prices may change. Store prices as env vars so they can be updated without code changes:

```
DEEPSEEK_INPUT_COST_PER_TOKEN=0.00000014
DEEPSEEK_OUTPUT_COST_PER_TOKEN=0.00000028
```

### Database: API Call Log

#### Migration: `migrations/add_api_cost_tracking.sql`

```sql
CREATE TABLE IF NOT EXISTS api_call_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id),
    brand_id UUID REFERENCES brands(id),            -- NULL for non-brand calls
    service TEXT NOT NULL,                           -- 'content_generator', 'caption_generator', etc.
    model TEXT NOT NULL DEFAULT 'deepseek-chat',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd NUMERIC(10, 8) NOT NULL DEFAULT 0, -- e.g. 0.00045200
    job_id UUID,                                     -- Link to generation_jobs if applicable
    metadata JSONB DEFAULT '{}',                     -- Additional context
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for aggregation queries
CREATE INDEX IF NOT EXISTS ix_api_cost_user ON api_call_log (user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_api_cost_brand ON api_call_log (brand_id, created_at);
CREATE INDEX IF NOT EXISTS ix_api_cost_service ON api_call_log (service, created_at);

-- Monthly aggregation materialized view (refreshed hourly by billing_enforcer)
CREATE MATERIALIZED VIEW IF NOT EXISTS api_cost_monthly AS
SELECT
    date_trunc('month', created_at) AS month,
    user_id,
    brand_id,
    service,
    COUNT(*) AS call_count,
    SUM(prompt_tokens) AS total_prompt_tokens,
    SUM(completion_tokens) AS total_completion_tokens,
    SUM(total_tokens) AS total_tokens,
    SUM(estimated_cost_usd) AS total_cost_usd
FROM api_call_log
GROUP BY month, user_id, brand_id, service;

CREATE UNIQUE INDEX IF NOT EXISTS ix_api_cost_monthly_pk
    ON api_cost_monthly (month, user_id, COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::UUID), service);
```

### Cost Tracking Utility: `app/utils/api_cost_tracker.py`

A lightweight utility injected wherever DeepSeek calls are made:

```python
import os
from uuid import UUID
from app.models.api_cost import ApiCallLog

INPUT_COST = float(os.getenv("DEEPSEEK_INPUT_COST_PER_TOKEN", "0.00000014"))
OUTPUT_COST = float(os.getenv("DEEPSEEK_OUTPUT_COST_PER_TOKEN", "0.00000028"))

def log_api_call(
    db,
    user_id: UUID,
    service: str,
    response_json: dict,
    brand_id: UUID | None = None,
    job_id: UUID | None = None,
    metadata: dict | None = None,
):
    """Extract token usage from a DeepSeek API response and log the cost."""
    usage = response_json.get("usage", {})
    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)
    total_tokens = usage.get("total_tokens", 0)

    estimated_cost = (
        prompt_tokens * INPUT_COST +
        completion_tokens * OUTPUT_COST
    )

    entry = ApiCallLog(
        user_id=user_id,
        brand_id=brand_id,
        service=service,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        estimated_cost_usd=estimated_cost,
        job_id=job_id,
        metadata=metadata or {},
    )
    db.add(entry)
    # Don't commit here — let the caller's transaction handle it
```

### Integration Points

Each DeepSeek call site gets a one-line addition after the API response:

```python
# Example: app/services/content/generator.py _call_deepseek():
response = requests.post(url, headers=headers, json=payload)
data = response.json()

# ADD THIS:
from app.utils.api_cost_tracker import log_api_call
log_api_call(db, user_id=self.user_id, service="content_generator",
             response_json=data, brand_id=brand_id, job_id=job_id)
```

Same pattern for all 5 services:

| Service | `service` value | Has `brand_id`? | Has `job_id`? |
|---|---|---|---|
| Content Generator | `"content_generator"` | Yes | Yes |
| Caption Generator | `"caption_generator"` | Yes | Yes |
| AI Background | `"ai_background"` | Yes | Yes |
| Content Differentiator | `"content_differentiator"` | Yes | Yes |
| Historical Miner | `"historical_miner"` | Yes | No |

### Admin API: Cost Metrics

#### New Admin Routes: `app/api/admin/cost_routes.py`

```python
@router.get("/costs/summary")
async def cost_summary(
    months: int = 1,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Super admin: get platform-wide cost metrics."""
    if not is_super_admin_user(current_user):
        raise HTTPException(403, "Super admin access required")

    cutoff = datetime.utcnow() - timedelta(days=30 * months)

    # Refresh materialized view
    db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY api_cost_monthly"))

    # Aggregate metrics
    result = db.execute(text("""
        SELECT
            COUNT(DISTINCT user_id) AS total_users,
            COUNT(DISTINCT brand_id) AS total_brands,
            SUM(total_cost_usd) AS total_cost,
            SUM(total_cost_usd) / NULLIF(COUNT(DISTINCT user_id), 0) AS avg_cost_per_user,
            SUM(total_cost_usd) / NULLIF(COUNT(DISTINCT brand_id), 0) AS avg_cost_per_brand,
            SUM(call_count) AS total_api_calls,
            SUM(total_tokens) AS total_tokens
        FROM api_cost_monthly
        WHERE month >= :cutoff
    """), {"cutoff": cutoff}).first()

    # Per-service breakdown
    by_service = db.execute(text("""
        SELECT
            service,
            SUM(call_count) AS calls,
            SUM(total_cost_usd) AS cost,
            SUM(total_tokens) AS tokens
        FROM api_cost_monthly
        WHERE month >= :cutoff
        GROUP BY service
        ORDER BY cost DESC
    """), {"cutoff": cutoff}).fetchall()

    # Top 10 costliest users
    top_users = db.execute(text("""
        SELECT
            user_id,
            SUM(total_cost_usd) AS cost,
            SUM(call_count) AS calls,
            COUNT(DISTINCT brand_id) AS brand_count
        FROM api_cost_monthly
        WHERE month >= :cutoff
        GROUP BY user_id
        ORDER BY cost DESC
        LIMIT 10
    """), {"cutoff": cutoff}).fetchall()

    return {
        "period_months": months,
        "total_users": result.total_users,
        "total_brands": result.total_brands,
        "total_cost_usd": float(result.total_cost or 0),
        "avg_cost_per_user_usd": float(result.avg_cost_per_user or 0),
        "avg_cost_per_brand_usd": float(result.avg_cost_per_brand or 0),
        "total_api_calls": result.total_api_calls,
        "total_tokens": result.total_tokens,
        "by_service": [{"service": r.service, "calls": r.calls, "cost_usd": float(r.cost), "tokens": r.tokens} for r in by_service],
        "top_users": [{"user_id": str(r.user_id), "cost_usd": float(r.cost), "calls": r.calls, "brand_count": r.brand_count} for r in top_users],
    }


@router.get("/costs/user/{user_id}")
async def user_cost_detail(
    user_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Super admin: get cost breakdown for a specific user."""
    if not is_super_admin_user(current_user):
        raise HTTPException(403, "Super admin access required")

    # Per-brand breakdown for this user
    by_brand = db.execute(text("""
        SELECT
            a.brand_id,
            b.name AS brand_name,
            SUM(a.call_count) AS calls,
            SUM(a.total_cost_usd) AS cost,
            SUM(a.total_tokens) AS tokens
        FROM api_cost_monthly a
        LEFT JOIN brands b ON a.brand_id = b.id
        WHERE a.user_id = :uid
        GROUP BY a.brand_id, b.name
        ORDER BY cost DESC
    """), {"uid": user_id}).fetchall()

    return {
        "user_id": user_id,
        "brands": [{"brand_id": str(r.brand_id), "brand_name": r.brand_name, "calls": r.calls, "cost_usd": float(r.cost), "tokens": r.tokens} for r in by_brand],
    }
```

### Admin Dashboard: Cost Panel

```
┌──────────────────────────────────────────────────────────┐
│  Admin: API Cost Dashboard (Last 30 days)                │
│                                                          │
│  ┌─ Summary ──────────────────────────────────────────┐  │
│  │  Total Cost:        $12.47                         │  │
│  │  Avg Cost/User:     $2.08                          │  │
│  │  Avg Cost/Brand:    $1.56                          │  │
│  │  Total API Calls:   8,432                          │  │
│  │  Total Tokens:      4.2M                           │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ By Service ───────────────────────────────────────┐  │
│  │ Service              │ Calls │ Cost    │ Tokens    │  │
│  │──────────────────────┼───────┼─────────┼───────────│  │
│  │ content_generator    │ 3,200 │ $5.12   │ 1.8M     │  │
│  │ caption_generator    │ 2,800 │ $3.36   │ 1.2M     │  │
│  │ ai_background        │ 1,200 │ $2.16   │ 0.7M     │  │
│  │ differentiator       │   800 │ $1.20   │ 0.4M     │  │
│  │ historical_miner     │   432 │ $0.63   │ 0.1M     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Top Users by Cost ────────────────────────────────┐  │
│  │ User           │ Brands │ Calls │ Cost             │  │
│  │────────────────┼────────┼───────┼──────────────────│  │
│  │ john@gmail.com │ 3      │ 1,200 │ $4.80            │  │
│  │ jane@gmail.com │ 1      │ 800   │ $2.10            │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Materialized View Refresh

Add to the hourly `billing_enforcer.py` sweep:

```python
# In billing_enforcer hourly tick:
def _refresh_cost_views(db):
    """Refresh materialized view for cost aggregations."""
    try:
        db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY api_cost_monthly"))
        db.commit()
    except Exception as e:
        logger.warning(f"Failed to refresh cost view: {e}")
```

### File Changes Summary

**New files:**
- `app/utils/api_cost_tracker.py` — `log_api_call()` utility
- `app/models/api_cost.py` — `ApiCallLog` model
- `app/api/admin/cost_routes.py` — Admin cost metrics API
- `src/features/admin/CostDashboard.tsx` — Admin cost dashboard UI
- `migrations/add_api_cost_tracking.sql` — `api_call_log` table + materialized view

**Modified files (add `log_api_call` after each DeepSeek response):**
- `app/services/content/generator.py` — In `_call_deepseek()`
- `app/services/media/caption_generator.py` — In `generate_first_paragraph()`
- `app/services/media/ai_background.py` — In the AI prompt call
- `app/services/content/differentiator.py` — In the variation generation call
- `app/services/toby/historical_miner.py` — In the embedding call
- `app/services/billing_enforcer.py` — Add `_refresh_cost_views()` to hourly sweep
- `app/main.py` — Register admin cost router

---

## 38. Context-Aware Caption CTAs: Kill the Hardcoded Save Section

### The Problem

The caption generator ([app/services/media/caption_generator.py](../app/services/media/caption_generator.py) line 187) has a **hardcoded fallback** for the save section:

```python
# CURRENT (hardcoded):
save_section = f"""🩵 Save this post and share it with someone who needs to see this."""
```

This generic "save and share" message appears in **every caption** where the user hasn't explicitly configured `save_section_text` in their Content DNA. The problem:

1. **It doesn't match every niche.** "Share with someone who needs to see this" works for wellness/health niches targeting women. It does NOT work for:
   - Gym content targeting men (too soft, emoji mismatch)
   - Finance content ("needs to see this" sounds alarmist)
   - Tech content (out of tone entirely)
   - B2B content (unprofessional)

2. **The 🩵 emoji is niche-specific.** A light blue heart is a wellness/feminine signal. For a gym bro brand, this is completely wrong.

3. **It's always the same text.** Even within the right niche, variety matters. Seeing the exact same save section on every post feels robotic.

### Solution: AI-Generated Save Sections Based on Content DNA

Instead of hardcoding one fallback, the save section should be **generated contextually** by DeepSeek at the same time as the caption's first paragraph. The AI uses the Content DNA (niche, tone, audience, brand personality) to produce a save section that actually fits.

### New Content DNA Field: `save_cta_style`

Add a field to `NicheConfig` that tells the AI what kind of save section to generate:

```sql
-- Migration: migrations/add_save_cta_style.sql
ALTER TABLE niche_config
    ADD COLUMN IF NOT EXISTS save_cta_style TEXT DEFAULT '';
```

```python
# app/models/niche_config.py — add:
save_cta_style = Column(Text, default="")
```

Examples of `save_cta_style` values:

| Niche | Value |
|---|---|
| Wellness (women) | `"Warm, nurturing. Use soft emojis (🩵, 🌿, ✨). Encourage saving and sharing with friends/family who are on the same journey."` |
| Gym (men) | `"Direct, no-nonsense. Use 💪 or 🔥 max. Keep it short: 'Save this for your next session.' No soft language."` |
| Finance | `"Professional. Use 📌 or 💡. Emphasize saving for reference: 'Bookmark this for tax season.' No emotional language."` |
| Tech | `"Casual-professional. Use 🔖. Simple: 'Save for later.' No excess."` |
| Food | `"Warm, inviting. Use 🍽️ or ❤️. 'Save this recipe and tag someone who'd love it.'"` |
| Empty (not configured) | AI infers from `content_brief` and `niche_name` |

### Caption Generator Changes

Replace the hardcoded fallback with AI-generated save sections:

```python
# In app/services/media/caption_generator.py:

def _generate_save_section(self, title: str, content_lines: list, ctx: PromptContext) -> str:
    """Generate a context-aware save section using AI, or use user-configured text."""

    # 1. If user has explicit save_section_text, use it (existing behavior)
    if ctx.save_section_text:
        return f"🩵 This post is designed to be saved and revisited. Share it with friends and family who are actively working on {ctx.save_section_text}."

    # 2. Generate via AI based on Content DNA
    style_hint = ctx.save_cta_style or ""
    niche = ctx.niche_name or ""
    brief = (ctx.content_brief or "")[:200]  # Truncate to save tokens

    prompt = f"""Generate a single-line save/share call-to-action for a social media post.

Brand niche: {niche}
Brand voice: {brief}
Post topic: {title}
{f'Save CTA style guide: {style_hint}' if style_hint else ''}

Rules:
- MUST be 1 line only, under 100 characters
- Start with ONE relevant emoji (match the niche/audience)
- Must feel natural for this specific niche and audience
- Vary the phrasing — don't always say "save and share"
- Include either a save prompt, a share prompt, or both
- Match the brand's tone (formal, casual, edgy, warm, etc.)

Examples of GOOD save CTAs by niche:
- Wellness (women): "🩵 Save this and send it to someone on the same journey."
- Gym (men): "💪 Save this for your next workout."
- Finance: "📌 Bookmark this — you'll need it."
- Tech: "🔖 Save for reference."
- Food: "❤️ Save this recipe and tag someone who'd love it."

Return ONLY the CTA line, nothing else."""

    try:
        response = requests.post(
            f"{self.api_base}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 60,
                "temperature": 0.9,
            },
            timeout=10,
        )
        if response.status_code == 200:
            data = response.json()
            # Log cost
            log_api_call(self.db, user_id=self.user_id, service="save_cta_generator",
                         response_json=data, brand_id=self.brand_id)
            cta = data["choices"][0]["message"]["content"].strip()
            # Sanitize: ensure it's one line, not too long
            cta = cta.split("\n")[0][:120]
            return cta
    except Exception:
        pass

    # 3. Fallback: niche-aware static fallback (better than one-size-fits-all)
    return _static_save_fallback(ctx)


def _static_save_fallback(ctx: PromptContext) -> str:
    """Last-resort fallback using niche keywords. Better than fully hardcoded."""
    niche = (ctx.niche_name or "").lower()

    if any(kw in niche for kw in ["wellness", "health", "mindful", "yoga", "meditation", "skincare"]):
        return "🩵 Save this and share it with someone on the same journey."
    if any(kw in niche for kw in ["gym", "fitness", "workout", "bodybuilding", "strength"]):
        return "💪 Save this for your next session."
    if any(kw in niche for kw in ["finance", "money", "invest", "budget", "tax", "crypto"]):
        return "📌 Bookmark this — you'll thank yourself later."
    if any(kw in niche for kw in ["tech", "software", "programming", "ai", "code", "dev"]):
        return "🔖 Save this for later."
    if any(kw in niche for kw in ["food", "recipe", "cook", "bake", "nutrition"]):
        return "❤️ Save this recipe and tag someone who needs to try it."
    if any(kw in niche for kw in ["travel", "adventure", "explore"]):
        return "🌍 Save this for your next trip."

    # Generic fallback — still better than hardcoded
    return "📌 Save this for later and share with someone who'd find it useful."
```

### Updated Caption Assembly

Replace the current hardcoded block in `build_full_caption()`:

```python
# BEFORE (current code, line 184-187):
if ctx.save_section_text:
    save_section = f"""🩵 This post is designed to be saved and revisited. ..."""
else:
    save_section = f"""🩵 Save this post and share it with someone who needs to see this."""

# AFTER:
save_section = self._generate_save_section(title, content_lines, ctx)
```

### Content DNA UI: Save CTA Style Field

Add a textarea to the **General** tab of the Content DNA form (Section 35):

```
── SAVE SECTION STYLE ────────────────────────────────────
Describe how the "Save/Share" line at the end of each
caption should sound. Leave blank for AI to decide.
┌──────────────────────────────────────────────────────────┐
│ Warm, nurturing tone. Use soft emojis (🩵, 🌿, ✨).     │
│ Encourage saving and sharing with friends who are on     │
│ the same wellness journey. Never aggressive or pushy.    │
└──────────────────────────────────────────────────────────┘
```

### Follow Section: Same Treatment

The follow section ([caption_generator.py](../app/services/media/caption_generator.py) line 181) has the same hardcoded fallback problem:

```python
# CURRENT:
follow_section = f"""👉🏼 Follow {handle} for more content like this."""
```

Apply the same fix: if `follow_section_text` is empty, generate a niche-appropriate follow CTA via AI, or fall back to a keyword-based static default.

This is lower priority than the save section since "Follow for more content like this" is more universally appropriate. But for consistency, the same `_generate_follow_section()` pattern should be applied.

### File Changes Summary

**New files:**
- `migrations/add_save_cta_style.sql` — Add `save_cta_style` to `niche_config`

**Modified files:**
- `app/models/niche_config.py` — Add `save_cta_style` column
- `app/services/media/caption_generator.py` — Replace hardcoded save fallback with `_generate_save_section()` method, add `_static_save_fallback()`
- `app/core/prompt_context.py` — Add `save_cta_style` field to `PromptContext`
- `src/features/brands/components/NicheConfigForm.tsx` — Add Save CTA Style textarea to General tab
- `src/features/brands/api/niche-config-api.ts` — Add `save_cta_style` to TypeScript interface

### Cost Impact

The AI-generated save section adds one small DeepSeek call per caption (~60 max tokens output). At DeepSeek pricing:
- ~$0.00002 per save section generation
- For 10 posts/day: ~$0.0002/day = ~$0.006/month per brand
- **Negligible.** The content generator call is 10-50x more expensive.

To keep costs minimal, the prompt is deliberately short and `max_tokens` is capped at 60.

### Production Safety

1. **Backward compatible:** If `save_cta_style` is empty (all existing users), the AI still generates a reasonable CTA from `niche_name` + `content_brief`
2. **Graceful degradation:** If the DeepSeek call fails, `_static_save_fallback()` uses keyword matching — always produces output
3. **No migration of existing data needed** — the column defaults to empty string

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
