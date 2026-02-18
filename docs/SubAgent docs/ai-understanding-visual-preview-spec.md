# AI Understanding Visual Preview — Implementation Spec

## Context

Currently the AI Understanding section in `src/features/brands/components/NicheConfigForm.tsx` shows text-only cards when the user clicks "Generate". We want to replace those text cards with actual visual mockup previews using the existing Konva canvas components.

- `src/shared/components/PostCanvas.tsx` renders a 1080x1350 dark reel cover (dark bg `#1a1a2e`, gradient overlay, white Anton font title in uppercase, brand abbreviation between horizontal lines, "Swipe" label at bottom)
- `src/shared/components/CarouselTextSlide.tsx` renders a 1080x1350 beige text slide (beige `#f8f5f0` bg, brand logo circle + name + @handle header, body text in Georgia serif, SHARE/SWIPE/SAVE bottom bar)

The AI endpoint returns:
```json
{
  "understanding": "...",
  "example_reel": { "title": "REEL TITLE", "content_lines": ["Line 1", "Line 2", ...] },
  "example_post": { "title": "POST TITLE", "slides": ["Slide 1 text", "Slide 2 text", ...] }
}
```

## File Changes Required

### `src/features/brands/components/NicheConfigForm.tsx`

1. **Add imports** (at top):
```tsx
import { PostCanvas, DEFAULT_GENERAL_SETTINGS } from '@/shared/components/PostCanvas'
import { CarouselTextSlide } from '@/shared/components/CarouselTextSlide'
```

2. **Replace the text-based grid** (current lines ~436-472) with visual canvas previews:

**Current code to replace** (the grid with example_reel and example_post text cards):
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
  {aiResult.example_reel && (
    <div className="border border-indigo-100 rounded-lg p-3">
      ... text-only reel card ...
    </div>
  )}
  {aiResult.example_post && (
    <div className="border border-purple-100 rounded-lg p-3">
      ... text-only post card ...
    </div>
  )}
</div>
```

**New code:**
```tsx
<div className="space-y-6">
  {/* Reel Preview */}
  {aiResult.example_reel && (
    <div className="border border-indigo-100 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600">
          <Film className="w-3.5 h-3.5" />
          Example Reel Preview
        </div>
        <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Preview only</span>
      </div>
      <div className="flex gap-4">
        <div className="shrink-0 rounded-lg overflow-hidden shadow-md">
          <PostCanvas
            brand={brandId || ''}
            title={aiResult.example_reel.title}
            backgroundImage={null}
            settings={DEFAULT_GENERAL_SETTINGS}
            scale={0.2}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 mb-2">{aiResult.example_reel.title}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Script Lines</p>
          <ol className="space-y-1">
            {aiResult.example_reel.content_lines.map((line, i) => (
              <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                <span className="text-indigo-400 font-medium shrink-0">{i + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )}

  {/* Carousel Post Preview */}
  {aiResult.example_post && (
    <div className="border border-purple-100 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-purple-600">
          <LayoutGrid className="w-3.5 h-3.5" />
          Example Carousel Post Preview
        </div>
        <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Preview only</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {/* Cover slide */}
        <div className="shrink-0 rounded-lg overflow-hidden shadow-md">
          <PostCanvas
            brand={brandId || ''}
            title={aiResult.example_post.title}
            backgroundImage={null}
            settings={DEFAULT_GENERAL_SETTINGS}
            scale={0.2}
          />
        </div>
        {/* Text slides */}
        {aiResult.example_post.slides.map((slide, i) => (
          <div key={i} className="shrink-0 rounded-lg overflow-hidden shadow-md">
            <CarouselTextSlide
              brand={brandId || ''}
              text={slide}
              allSlideTexts={aiResult.example_post!.slides}
              isLastSlide={i === aiResult.example_post!.slides.length - 1}
              scale={0.2}
            />
          </div>
        ))}
      </div>
    </div>
  )}
</div>
```

## Key Design Decisions

1. **Scale 0.2**: At 1080x1350 canvas, this gives 216x270px previews — good size for inline previews
2. **PostCanvas with null backgroundImage**: Shows dark `#1a1a2e` background, which is the standard reel look when no AI image is available
3. **Reel preview**: Shows the visual canvas on the left + script lines on the right (content_lines are spoken, not displayed on canvas)
4. **Carousel preview**: Horizontally scrollable row showing cover slide (PostCanvas) + all text slides (CarouselTextSlide)
5. **"Preview only" badges**: Indicate these can't be scheduled
6. **No backend changes needed**: The current AI endpoint data format already provides everything needed

## No Other Files Need Changes

Only `NicheConfigForm.tsx` needs modification — adding 2 imports and replacing the text cards with canvas components.
