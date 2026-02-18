# AI Understanding Visual Preview — Research & Spec

## Objective
Document how reels & carousel posts are visually previewed in the frontend, so we can replicate a similar visual style in the AI Understanding section of NicheConfigForm.

---

## 1. Current AI Understanding Section (NicheConfigForm.tsx)

**Location:** `src/features/brands/components/NicheConfigForm.tsx` (bottom of file)

**Current rendering** (lines ~308-355): The AI understanding result shows:
- A gray box with the `understanding` text (paragraph)
- A 2-column grid with:
  - **Example Reel**: indigo border, `<Film>` icon, title in bold, numbered `content_lines` as an `<ol>`
  - **Example Carousel Post**: purple border, `<LayoutGrid>` icon, title in bold, numbered `slides` with "Slide N:" prefix

**Current styling** — simple text-only cards:
```tsx
<div className="border border-indigo-100 rounded-lg p-3">
  <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 mb-2">
    <Film className="w-3.5 h-3.5" />
    Example Reel
  </div>
  <p className="text-sm font-semibold text-gray-900 mb-2">{title}</p>
  <ol className="space-y-1">
    {content_lines.map((line, i) => (
      <li className="text-xs text-gray-600 flex gap-1.5">
        <span className="text-indigo-400 font-medium">{i + 1}.</span>
        <span>{line}</span>
      </li>
    ))}
  </ol>
</div>
```

**Data shape** from backend (`/niche-config/ai-understanding`):
```typescript
interface AiUnderstanding {
  understanding: string
  example_reel: { title: string; content_lines: string[] } | null
  example_post: { title: string; slides: string[] } | null
}
```

---

## 2. How Reels Are Visually Previewed

### 2a. Reel Thumbnails in JobDetail (Completed Jobs)

**Location:** `src/pages/JobDetail.tsx`

For completed reel jobs, the detail page shows a **3-column media grid** per brand:
1. **IG/FB Thumbnail** — `<img>` with `aspect-[9/16]` (portrait), loaded from `output.thumbnail_path` (Supabase URL)
2. **YouTube Thumbnail** — same aspect, from `output.yt_thumbnail_path`
3. **Video** — `<video>` element in a black container, also 9:16

The thumbnails are actual rendered PNG images (generated server-side). They show:
- A dark/AI background image
- White text overlay (title in Anton font, uppercase)
- Brand abbreviation (HCO, LCO, etc.) with horizontal lines
- "Read Caption" at the bottom

**Key:** There is NO frontend reel thumbnail "preview component" that renders from text data. The thumbnails are pre-rendered server-side images. The frontend just displays `<img src={thumbnail_path}>`.

### 2b. Reel Generator Page

**Location:** `src/pages/Generator.tsx`

The Generator page is a **form only** — no visual preview of the reel. It has:
- Title textarea
- Content lines textarea (one per line)
- Dark mode AI prompt field
- Brand checkboxes, CTA selection, platform toggles

No canvas or visual preview for reels on the Generator page.

### 2c. How Reel Content Is Structured

Reels have:
- `title` — displayed in ALL CAPS, Anton font, white text
- `content_lines` — numbered items (e.g., "Garlic — Crush for maximum flavor")
- `image_prompt` — describes the AI background image
- `variant` — "light" or "dark" (dark = AI-generated background)

The actual reel is a **video** with multiple frames. Each content line becomes one frame in the video. There's no static "reel card" preview component.

---

## 3. How Carousel Posts Are Visually Previewed

### 3a. PostCanvas Component (Cover Slide)

**Location:** `src/shared/components/PostCanvas.tsx`

This is a **Konva.js canvas** (react-konva) that renders the cover slide (slide 1) of a carousel post. It's used in:
- **Posts page** (`src/pages/Posts.tsx`) — live preview while editing
- **PostJobDetail** (`src/pages/PostJobDetail.tsx`) — final rendering + export

**Visual layout of cover slide:**
```
┌─────────────────────────┐
│                         │  ← AI background image (or #1a1a2e dark blue)
│                         │
│                         │
│     ─── HCO ───        │  ← Brand abbreviation with horizontal lines (white)
│                         │
│   YOUR TITLE GOES       │  ← Title in Anton font, ALL CAPS, white, centered
│      HERE TODAY         │
│                         │
│        Swipe            │  ← Bottom label ("Swipe" or "Read Caption")
│                         │
└─────────────────────────┘
```

**Key dimensions:**
- Canvas: **1080 × 1350** px (4:5 Instagram post ratio)
- Preview scale: 0.2 (Posts page), 0.25 (PostJobDetail grid), 0.4 (preview), 0.55 (full quality modal)
- Background: AI-generated image OR solid `#1a1a2e` dark blue
- Gradient overlay on bottom 60% (transparent → black 95%)
- Font: **Anton** (bold display font), auto-fitted 75-98px
- Logo bar: brand abbreviation (e.g., "HCO") centered between two white horizontal lines

### 3b. CarouselTextSlide Component (Slides 2+)

**Location:** `src/shared/components/CarouselTextSlide.tsx`

This is also a **Konva.js canvas** for text-only carousel slides. Used in PostJobDetail.

**Visual layout of text slides:**
```
┌─────────────────────────┐
│                         │  ← Light beige background (#f8f5f0)
│  [●] The Healthy College│  ← Brand logo circle + name + @handle
│      @thehealthycollege │
│                         │
│  Slide text goes here.  │  ← Georgia/serif font, 38px, dark text
│  This is educational    │
│  content explaining a   │
│  concept in detail.     │
│                         │
│  SHARE 📤    SWIPE   💾 SAVE │  ← Bottom bar with icons
└─────────────────────────┘
```

**Key details:**
- Background: `#f8f5f0` (warm beige)
- Text color: `#1a1a1a` 
- Font: Georgia or configurable serif, 38px, 1.55 line height
- Header: circular brand logo (colored circle with initial, or uploaded image) + brand display name + @handle
- Bottom bar: SHARE | SWIPE | SAVE (SWIPE hidden on last slide)
- Same 1080×1350 dimensions as cover

### 3c. PostJobDetail — Carousel Navigation

**Location:** `src/pages/PostJobDetail.tsx`

Each brand card in the grid shows:
- Cover slide (PostCanvas) or text slide (CarouselTextSlide)
- Dot navigation (● ○ ○) to flip between cover and text slides
- Left/right chevron arrows
- "Cover" / "Slide X of Y" label
- Expand button for full-quality modal

### 3d. Posts Page Preview

**Location:** `src/pages/Posts.tsx`

Shows a single PostCanvas at scale 0.2 on the right side as a live preview. Only shows the cover slide (no carousel navigation). Uses the selected brand + entered title. Background is always placeholder (`#1a1a2e`) since AI image hasn't been generated yet.

---

## 4. Relevant Data Fields

### Reel data:
```typescript
{
  title: string             // ALL CAPS title
  content_lines: string[]   // Numbered items shown as video frames
  image_prompt: string      // AI background description
  variant: 'light' | 'dark' // Visual mode
}
```

### Post/Carousel data:
```typescript
{
  title: string             // Cover slide title (ALL CAPS)
  slides: string[]          // Text for slides 2+ (educational content)
  slide_texts: string[]     // Same as slides, stored on brand output
  thumbnail_path: string    // AI-generated cover background URL
  caption: string           // Instagram caption text
}
```

### AI Understanding returns:
```typescript
{
  understanding: string
  example_reel: { title: string; content_lines: string[] } | null
  example_post: { title: string; slides: string[] } | null
}
```

---

## 5. Key Visual Components to Potentially Reuse

| Component | File | What it renders |
|---|---|---|
| `PostCanvas` | `src/shared/components/PostCanvas.tsx` | Cover slide with dark bg, gradient, title, logo bar |
| `CarouselTextSlide` | `src/shared/components/CarouselTextSlide.tsx` | Beige text slide with brand header, body text, bottom bar |
| `BrandBadge` | `src/features/brands/components/BrandBadge.tsx` | Small colored circle with brand initial |
| `getBrandConfig()` | `PostCanvas.tsx` | Brand name, color, accent color |

---

## 6. Options for AI Understanding Visual Preview

### Option A: Reuse PostCanvas + CarouselTextSlide (Konva.js)
- **Pros:** Pixel-accurate preview of what the actual content would look like
- **Cons:** Heavy (Konva.js canvases), overkill for a quick preview, needs a background image (which we don't have)
- **Use PostCanvas** for the reel cover (dark bg `#1a1a2e`, white title text)
- **Use CarouselTextSlide** for the post slide

### Option B: CSS-only mockup cards
- **Pros:** Lightweight, fast, no canvas overhead
- **Cons:** Not pixel-accurate to actual output
- Render a phone-frame or dark card with white text for the reel
- Render a beige card with dark text for the carousel slide

### Option C: Hybrid — use PostCanvas for reel cover, CSS for carousel
- The reel example could use `PostCanvas` with no background (solid dark blue) at a small scale
- The carousel text could be a styled CSS card mimicking the beige layout

### Recommendation
**Option A (Konva)** is the most visually impressive since the user would see exactly what their AI-generated content looks like. The PostCanvas component already supports rendering without a background image (falls back to `#1a1a2e`). Both components accept a `scale` prop for sizing.

For the reel, we could render the title on a dark card. For the full reel content (numbered lines), we'd need to either:
1. Show the title on a PostCanvas-like preview + list the content lines as text below
2. Create a new "ReelPreview" component that shows a dark 9:16 card with title and numbered lines

Since reels don't have a static preview component (they're videos), a CSS mockup of the phone frame with dark background + white text + numbered lines would be the simplest approach.

---

## 7. Summary

- **Reels**: No existing static preview component. Thumbnails are server-rendered PNGs. The visual format is: dark background, white Anton font title, numbered content lines shown as video frames.
- **Carousel Posts**: `PostCanvas` (Konva) for cover + `CarouselTextSlide` (Konva) for text slides. These are reusable with scale props.
- **AI Understanding section** currently shows plain text lists. Enhancing it with visual previews would make it much more engaging.
- The `PostCanvas` component can be used directly with `backgroundImage={null}` (renders dark blue bg).
- For reels, a custom CSS dark card with phone-frame styling would be needed since there's no existing reel preview component.
