/**
 * CarouselTextSlide — renders a beige text-only carousel slide (slides 2-4).
 *
 * Design reference: Neuroglobe-style Instagram text posts
 * - Light beige background (#f8f5f0)
 * - Top-left: brand logo (circular) + brand name + @handle
 * - Center: educational text paragraph (black, large readable font)
 * - Bottom bar: SHARE (icon) | SWIPE | SAVE (icon) — no SWIPE on last slide
 *
 * Header position is consistent across all slides: it's computed from the
 * tallest slide text so the brand block never jumps while swiping.
 */
import { useMemo } from 'react'
import { Stage, Layer, Rect, Text, Circle, Group, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import Konva from 'konva'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './PostCanvas'
import shareIconSrc from '@/assets/icons/share.png'
import saveIconSrc from '@/assets/icons/save.png'

// ─── Brand handle mapping ───────────────────────────────────────────
export const BRAND_HANDLES: Record<string, string> = {
  healthycollege: '@thehealthycollege',
  longevitycollege: '@thelongevitycollege',
  wellbeingcollege: '@thewellbeingcollege',
  vitalitycollege: '@thevitalitycollege',
  holisticcollege: '@theholisticcollege',
}

export const BRAND_DISPLAY_NAMES: Record<string, string> = {
  healthycollege: 'The Healthy College',
  longevitycollege: 'The Longevity College',
  wellbeingcollege: 'The Wellbeing College',
  vitalitycollege: 'The Vitality College',
  holisticcollege: 'The Holistic College',
}

const BRAND_COLORS: Record<string, string> = {
  healthycollege: '#22c55e',
  longevitycollege: '#0ea5e9',
  wellbeingcollege: '#eab308',
  vitalitycollege: '#14b8a6',
  holisticcollege: '#f97316',
}

const BG_COLOR = '#f8f5f0'
const TEXT_COLOR = '#1a1a1a'
const SUBTLE_COLOR = '#888888'

// ─── Layout constants (at 1080×1350 canvas resolution) ──────────────
const PAD_X = 80
const LOGO_SIZE = 56
const TEXT_WIDTH = CANVAS_WIDTH - PAD_X * 2
const BOTTOM_BAR_Y = CANVAS_HEIGHT - 120
const ICON_SIZE = 30
const HEADER_BLOCK_H = LOGO_SIZE + 20 // logo row + spacing below
const HEADER_TEXT_GAP = 30
const TEXT_FONT_SIZE = 38
const TEXT_LINE_HEIGHT = 1.55

// ─── Estimate text height for vertical centering ────────────────────
function estimateTextHeight(
  text: string,
  fontSize: number,
  lineHeight: number,
  maxWidth: number,
): number {
  const avgCharWidth = fontSize * 0.48
  const words = text.split(/\s+/)
  let lines = 1
  let lineWidth = 0
  for (const word of words) {
    const wordWidth = word.length * avgCharWidth
    if (lineWidth + wordWidth > maxWidth && lineWidth > 0) {
      lines++
      lineWidth = wordWidth + avgCharWidth
    } else {
      lineWidth += wordWidth + avgCharWidth
    }
  }
  return lines * fontSize * lineHeight
}

/**
 * Compute a stable contentY from the tallest slide text.
 * This ensures the brand header never moves between slides.
 */
function computeStableContentY(allTexts: string[]): number {
  const availableH = BOTTOM_BAR_Y - 40 - 60
  let maxTotalH = 0
  for (const t of allTexts) {
    const textH = estimateTextHeight(t, TEXT_FONT_SIZE, TEXT_LINE_HEIGHT, TEXT_WIDTH)
    const totalH = HEADER_BLOCK_H + HEADER_TEXT_GAP + textH
    if (totalH > maxTotalH) maxTotalH = totalH
  }
  const centered = 60 + (availableH - maxTotalH) / 2
  return Math.max(60, Math.min(centered, 280))
}

// ─── Component ──────────────────────────────────────────────────────

interface CarouselTextSlideProps {
  brand: string
  text: string
  /** All slide texts (slides 2-4) so we can compute a stable header position */
  allSlideTexts?: string[]
  isLastSlide: boolean
  scale?: number
  logoUrl?: string | null
  stageRef?: (node: Konva.Stage | null) => void
}

export function CarouselTextSlide({
  brand,
  text,
  allSlideTexts,
  isLastSlide,
  scale = 0.3,
  logoUrl,
  stageRef,
}: CarouselTextSlideProps) {
  const brandColor = BRAND_COLORS[brand] || '#0ea5e9'
  const brandName = BRAND_DISPLAY_NAMES[brand] || brand
  const handle = BRAND_HANDLES[brand] || `@the${brand}`

  // Load PNG icons
  const [shareImg] = useImage(shareIconSrc)
  const [saveImg] = useImage(saveIconSrc)

  // Load brand theme logo (if provided)
  const [brandLogoImg] = useImage(logoUrl || '', 'anonymous')

  // Replace placeholder handle in text
  const displayText = text
    .replace(/@\{\{brandhandle\}\}/g, handle)
    .replace(/\{\{brandhandle\}\}/g, handle)
    .replace(/@\{brandhandle\}/g, handle)
    .replace(/\{brandhandle\}/g, handle)

  // Compute contentY — stable across all slides when allSlideTexts is provided
  const contentY = useMemo(() => {
    if (allSlideTexts && allSlideTexts.length > 0) {
      // Replace handles in all texts for accurate measurement
      const cleaned = allSlideTexts.map((t) =>
        t
          .replace(/@\{\{brandhandle\}\}/g, handle)
          .replace(/\{\{brandhandle\}\}/g, handle)
          .replace(/@\{brandhandle\}/g, handle)
          .replace(/\{brandhandle\}/g, handle)
      )
      return computeStableContentY(cleaned)
    }
    // Fallback: single slide centering
    const textH = estimateTextHeight(displayText, TEXT_FONT_SIZE, TEXT_LINE_HEIGHT, TEXT_WIDTH)
    const totalH = HEADER_BLOCK_H + HEADER_TEXT_GAP + textH
    const availableH = BOTTOM_BAR_Y - 40 - 60
    const centered = 60 + (availableH - totalH) / 2
    return Math.max(60, Math.min(centered, 280))
  }, [allSlideTexts, displayText, handle])

  return (
    <Stage
      ref={stageRef as any}
      width={CANVAS_WIDTH * scale}
      height={CANVAS_HEIGHT * scale}
      scaleX={scale}
      scaleY={scale}
    >
      <Layer>
        {/* Background */}
        <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill={BG_COLOR} />

        {/* Brand header: logo + name + handle */}
        <Group x={PAD_X} y={contentY}>
          {/* Brand logo — circular theme logo if available, else colored circle with initial */}
          {brandLogoImg ? (
            <Group
              clipX={0}
              clipY={0}
              clipWidth={LOGO_SIZE}
              clipHeight={LOGO_SIZE}
              clipFunc={(ctx: any) => {
                ctx.beginPath()
                ctx.arc(LOGO_SIZE / 2, LOGO_SIZE / 2, LOGO_SIZE / 2, 0, Math.PI * 2, false)
                ctx.closePath()
              }}
            >
              <KonvaImage
                image={brandLogoImg}
                x={0}
                y={0}
                width={LOGO_SIZE}
                height={LOGO_SIZE}
              />
            </Group>
          ) : (
            <>
              <Circle
                x={LOGO_SIZE / 2}
                y={LOGO_SIZE / 2}
                radius={LOGO_SIZE / 2}
                fill={brandColor}
              />
              <Text
                text={brandName.charAt(0).toUpperCase()}
                fontSize={28}
                fontFamily="Inter, Arial, sans-serif"
                fontStyle="bold"
                fill="white"
                width={LOGO_SIZE}
                height={LOGO_SIZE}
                align="center"
                verticalAlign="middle"
                x={0}
                y={0}
              />
            </>
          )}

          {/* Brand name */}
          <Text
            text={brandName}
            fontSize={30}
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fill={TEXT_COLOR}
            x={LOGO_SIZE + 16}
            y={4}
          />

          {/* Handle */}
          <Text
            text={handle}
            fontSize={24}
            fontFamily="Inter, Arial, sans-serif"
            fill={SUBTLE_COLOR}
            x={LOGO_SIZE + 16}
            y={38}
          />
        </Group>

        {/* Main text content */}
        <Text
          text={displayText}
          fontSize={TEXT_FONT_SIZE}
          fontFamily="Georgia, 'Times New Roman', serif"
          fill={TEXT_COLOR}
          x={PAD_X}
          y={contentY + HEADER_BLOCK_H + HEADER_TEXT_GAP}
          width={TEXT_WIDTH}
          lineHeight={TEXT_LINE_HEIGHT}
          wrap="word"
        />

        {/* Bottom bar: SHARE (icon) / SWIPE / SAVE (icon) — NO separator line */}
        <Group y={BOTTOM_BAR_Y}>
          {/* SHARE + icon */}
          <Text
            text="SHARE"
            fontSize={24}
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fill={TEXT_COLOR}
            x={PAD_X}
            y={2}
            letterSpacing={2}
          />
          {shareImg && (
            <KonvaImage
              image={shareImg}
              x={PAD_X + 110}
              y={-2}
              width={ICON_SIZE}
              height={ICON_SIZE}
            />
          )}

          {/* SWIPE (only if not last slide) */}
          {!isLastSlide && (
            <Text
              text="SWIPE"
              fontSize={24}
              fontFamily="Inter, Arial, sans-serif"
              fontStyle="bold"
              fill={TEXT_COLOR}
              x={0}
              y={2}
              width={CANVAS_WIDTH}
              align="center"
              letterSpacing={2}
            />
          )}

          {/* SAVE icon + text — right-aligned, icon on left of text */}
          {saveImg && (
            <KonvaImage
              image={saveImg}
              x={CANVAS_WIDTH - PAD_X - 130}
              y={-1}
              width={ICON_SIZE - 2}
              height={ICON_SIZE - 2}
            />
          )}
          <Text
            text="SAVE"
            fontSize={24}
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fill={TEXT_COLOR}
            x={CANVAS_WIDTH - PAD_X - 98}
            y={2}
            letterSpacing={2}
          />
        </Group>
      </Layer>
    </Stage>
  )
}
